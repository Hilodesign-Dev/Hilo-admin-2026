import { supa } from '../../lib/supabase'
import { cartTotals, lineMath } from './cartHelpers'

/**
 * Order creation pipeline used by both the POS New Order flow and the
 * Quotation → Order conversion (Phase 5).
 *
 * Identity model (post customer-collapse migration):
 *   - The `customers` table is the single source of truth for people.
 *   - is_buyer = true  → an active buyer (has contact info, can pay).
 *   - is_buyer = false → a profile-only record (relative, no contact).
 *   - related_to_customer_id + relationship_type capture family links.
 *
 *   shopify_orders.buyer_customer_id  → the payer (customers.id, is_buyer=true)
 *   order_line_items.customer_id      → the wearer (customers.id, any kind)
 *
 *   ensureCustomer({ name, phone, email, customer_id }) finds or creates a
 *   buyer customer by phone (preferred) or email and returns its id.
 *
 *   createPosOrder({...}) writes shopify_orders + order_line_items.
 *     Order number format: HIOSNNNNN (5-digit zero-padded counter sequenced
 *     off existing rows with order_origin IN ('pos','quotation')).
 *
 *   savePosPayments(...) inserts pos_payments rows + updates the order's
 *   payment_collected / balance / status.
 */

const pad = (n, w = 5) => String(n).padStart(w, '0')

const nextPosOrderNumber = async () => {
  // Atomic, deletion-proof: a Postgres sequence assigns the number (mirrors
  // next_marketplace_order_number). Never reissues on delete or concurrent create.
  // A UNIQUE index on shopify_orders.order_number (pos/quotation) is the DB backstop.
  const { data, error } = await supa.rpc('next_pos_order_number')
  if (error || !data) throw error || new Error('Could not generate order number')
  return data
}

/**
 * Find or create the buyer customer for this POS lookup.
 *
 * Lookup precedence:
 *   1. explicit customer_id from CustomerLookup (already resolved)
 *   2. phone match against customers.phone
 *   3. email match against customers.email
 *   4. brand new — insert with is_buyer=true
 */
export const ensureCustomer = async (customer) => {
  customer = customer || {}
  if (customer.customer_id) return customer.customer_id

  const rawPhone = (customer.phone || '').replace(/\s/g, '')
  const phoneFull = rawPhone ? ((customer.country_code || '+91') + rawPhone) : null
  const safeName = (customer.name || '').trim() || 'Walk-in customer'

  // Look up existing customer profile by phone / email first.
  if (phoneFull) {
    const { data: hit } = await supa.from('customers').select('id').eq('phone', phoneFull).limit(1)
    if (hit?.[0]) return hit[0].id
  }
  if (customer.email) {
    const { data: hit } = await supa.from('customers').select('id').eq('email', customer.email).limit(1)
    if (hit?.[0]) return hit[0].id
  }

  // No existing profile. Customers MUST point to a buyer (customers.buyer_id
  // is NOT NULL with FK -> buyers.id). First find-or-create the buyer row
  // by phone/email, THEN insert the customer profile.
  let buyerId = null
  if (phoneFull) {
    const { data: bHit } = await supa.from('buyers').select('id').eq('phone', phoneFull).limit(1)
    if (bHit?.[0]) buyerId = bHit[0].id
  }
  if (!buyerId && customer.email) {
    const { data: bHit } = await supa.from('buyers').select('id').eq('email', customer.email).limit(1)
    if (bHit?.[0]) buyerId = bHit[0].id
  }
  if (!buyerId) {
    const { data: newBuyer, error: bErr } = await supa.from('buyers').insert([{
      name: safeName,             // buyers.name is NOT NULL; never send '' or null
      phone: phoneFull,
      email: customer.email || null,
      source: 'walk_in',
    }]).select('id').single()
    if (bErr) {
      console.error('[ensureCustomer] buyer insert failed', { bErr, safeName, phoneFull })
      throw new Error('Could not create buyer: ' + (bErr.message || bErr))
    }
    buyerId = newBuyer?.id
  }
  if (!buyerId) throw new Error('buyer_id resolution failed — refusing to insert customer')

  const { data: row, error } = await supa.from('customers').insert([{
    buyer_id: buyerId,
    name: safeName,
    phone: phoneFull,
    email: customer.email || null,
    is_buyer: true,
    relationship: 'self',
    relationship_type: 'self',
  }]).select('id').single()
  if (error) {
    console.error('[ensureCustomer] customer insert failed', { error, buyerId, safeName, phoneFull })
    throw error
  }
  return row.id
}

/**
 * Optional: attach a profile-only customer (relative) to the buyer.
 * Returns the new customer's id. Used when the order contains items for
 * someone other than the buyer.
 */
export const createRelativeProfile = async ({ buyerCustomerId, name, gender, relationship_type }) => {
  // Relatives inherit the same buyer_id as the buyer customer they belong to.
  const { data: parent, error: pErr } = await supa.from('customers').select('buyer_id').eq('id', buyerCustomerId).single()
  if (pErr) throw pErr
  if (!parent?.buyer_id) throw new Error('Buyer customer is missing buyer_id; cannot attach relative')

  const { data, error } = await supa.from('customers').insert([{
    buyer_id: parent.buyer_id,
    name: name || '',
    is_buyer: false,
    related_to_customer_id: buyerCustomerId,
    relationship_type: relationship_type || 'other',
    gender: gender || null,
  }]).select('id').single()
  if (error) throw error
  return data.id
}

export const createPosOrder = async ({ customer, orderMeta = {}, cart, stylist, store, mode, quotationId = null, orderDiscount = null, coupon = null, appliedDiscounts = null, leadId = null }) => {
  if (!cart || cart.length === 0) throw new Error('Cart is empty')

  const buyerCustomerId = await ensureCustomer(customer)
  const totals = cartTotals(cart, { orderDiscount, coupon })
  const orderNumber = await nextPosOrderNumber()
  const orderId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const channelRaw = orderMeta.channel || (mode === 'online_assist' ? 'Online Assist' : 'In-store')
  const channel = /^in[- ]?store/i.test(channelRaw) ? 'In-store' : channelRaw
  // Derived FK to sales_channels — must be written alongside `channel` so the
  // text column and FK never drift. POS orders should only ever produce
  // 'in-store' or 'online-assist'; never 'online' (that's owned by Shopify
  // website sync) and never 'marketplace' (that's the marketplace wizard).
  // See HIOS00053, June 2026, for the bug this prevents.
  const channelId =
    channel === 'In-store'      ? 'in-store'      :
    channel === 'Online Assist' ? 'online-assist' :
    null
  const total = +totals.saleTotal.toFixed(2)
  // Shopify-convention mirrors of the discount info so the invoice generator,
  // dashboards, and any other consumer that reads subtotal_price + total_discounts
  // (the standard pair) see a consistent picture: subtotal − discounts = total.
  const subtotalGross = +Number(totals.gross || 0).toFixed(2)
  const totalDiscountsAll = +(
    Number(totals.lineDiscountTotal || 0) +
    Number(totals.orderDiscount     || 0) +
    Number(totals.couponDiscount    || 0) +
    Number(totals.loyaltyDiscount   || 0)
  ).toFixed(2)

  // Defensive: resolve a store_id from the channel if the caller didn't pass one.
  // Stops invoices breaking with 'Cannot generate TAX INVOICE without seller GSTIN
  // on store config' when the operator forgot to pick a store in the top bar (or
  // their team_members row has no store_id assigned).
  let resolvedStore = { id: null, name: null }
  if (store && typeof store === 'object') {
    resolvedStore = { id: store.id || null, name: store.name || null }
  } else if (typeof store === 'string' && store.trim()) {
    resolvedStore.name = store.trim()
  }
  if (!resolvedStore.id) {
    const channelKey =
      channel === 'In-store'      ? 'in-store' :
      channel === 'Online Assist' ? 'online-assist' :
      channel === 'Online'        ? 'online' :
      channel === 'Marketplace'   ? 'in-store' :  // marketplaces issued from the in-store legal entity
      null
    if (channelKey) {
      try {
        const { data: fb } = await supa
          .from('stores')
          .select('id, name')
          .eq('channel_id', channelKey)
          .eq('is_active', true)
          .limit(1).maybeSingle()
        if (fb?.id) {
          resolvedStore.id = fb.id
          resolvedStore.name = resolvedStore.name || fb.name
        }
      } catch { /* swallow — orderPayload still works with null store_id */ }
    }
  }

  const orderPayload = {
    id: orderId,
    order_number: orderNumber,
    customer_id: buyerCustomerId,
    buyer_customer_id: buyerCustomerId,
    customer_name: customer.name || '',
    customer_email: customer.email || null,
    total_price: total,
    subtotal_price: subtotalGross,
    total_discounts: totalDiscountsAll,
    channel,
    channel_id: channelId,
    financial_status: 'pending',
    fulfillment_status: 'unfulfilled',
    order_status: 'pending',
    order_origin: quotationId ? 'quotation' : 'pos',
    quotation_id: quotationId,
    payment_collected: 0,
    payment_balance: total,
    payment_status: 'unpaid',
    store_id:  resolvedStore.id   || null,
    pos_store: resolvedStore.name || null,
    event_date: orderMeta.event_date || null,
    delivery_type: orderMeta.delivery_type || null,
    est_shipping_date: orderMeta.est_shipping_date || null,
    lead_source: orderMeta.lead_source || null,
    occasion: orderMeta.occasion || null,
    event: orderMeta.event || null,
    urgency: orderMeta.urgency || null,
    stylist: (stylist?.id != null ? String(stylist.id) : null),
    order_discount_type: orderDiscount?.type && orderDiscount.type !== 'none' ? orderDiscount.type : null,
    order_discount_value: orderDiscount?.value ? Number(orderDiscount.value) : 0,
    order_discount_amount: totals.orderDiscount || 0,
    order_discount_reason: orderDiscount?.reason || null,
    order_discount_approved_by: orderDiscount?.approved_by || stylist?.name || null,
    applied_discounts: appliedDiscounts || totals.appliedDiscounts || [],
    created_at: new Date().toISOString(),
  }
  const { error: orderErr } = await supa.from('shopify_orders').insert([orderPayload])
  if (orderErr) throw orderErr

  // Anything below this line must roll back the order header on failure.
  const rollback = async (e) => {
    try {
      await supa.from('order_line_items').delete().eq('order_id', orderId)
      await supa.from('shopify_orders').delete().eq('id', orderId)
    } catch (re) { console.error('Order rollback failed:', re) }
    throw e
  }
  try {

  for (const li of cart) {
    const m = lineMath(li)
    const lineId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const isMtf = li.size === 'MTF'
    const measurementStatus = isMtf ? 'pending' : 'not_required'
    const wearerCustomerId = li.customer_id || buyerCustomerId

    const lineRow = {
      id: lineId,
      order_id: orderId,
      order_number: orderNumber,
      customer_id: wearerCustomerId,
      title: li.title,
      sku: li.sku || '',
      quantity: li.quantity || 1,
      unit_price: Number(li.mrp || 0),
      product_type: li.type === 'catalog' ? 'catalog' : 'custom',
      type: li.is_set ? 'Custom' : (li.type === 'custom' || li.type === 'custom_set' ? 'Custom' : 'General'),
      size: li.size || null,
      production_stage: 'pending',
      stylist: (stylist?.id != null ? String(stylist.id) : null),
      garment_category: li.garment_category || li.category || null,
garment_type: li.garment_type || null,
      discount_type: li.discountType || null,
      discount_value: li.discountValue == null ? null : Number(li.discountValue),
      discount_amount: m.discountAmount,
      sale_price: m.salePrice,
      gst_rate: m.gstRate,
      gst_amount: m.gstAmount,
      measurement_status: measurementStatus,
      confirmation_status: quotationId ? 'confirmed' : 'incomplete',
      is_set_component: false,
    }
    const { error: liErr } = await supa.from('order_line_items').insert([lineRow])
    if (liErr) throw liErr

    if (li.is_set && Array.isArray(li.set_components)) {
      for (const comp of li.set_components) {
        const compId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const compRow = {
          id: compId,
          order_id: orderId,
          order_number: orderNumber,
          customer_id: comp.customer_id || wearerCustomerId,
          title: comp.name || comp.category,
          sku: '',
          quantity: 1,
          unit_price: 0,
          product_type: 'custom',
          type: 'Custom',
          size: 'MTF',
          production_stage: 'pending',
          stylist: (stylist?.id != null ? String(stylist.id) : null),
          garment_category: comp.garment_category || comp.category || null,
garment_type: comp.garment_type || null,
          discount_amount: 0,
          sale_price: 0,
          gst_rate: m.gstRate,
          gst_amount: 0,
          measurement_status: 'pending',
          confirmation_status: quotationId ? 'confirmed' : 'incomplete',
          is_set_component: true,
          set_parent_id: lineId,
        }
        const { error: compErr } = await supa.from('order_line_items').insert([compRow])
        if (compErr) throw compErr
      }
    }
  }

  // Confirmed orders (from quotation) skip pending → move to fabrication immediately
  if (quotationId) {
    await supa.from('order_line_items')
      .update({ production_stage: 'fabrication', confirmation_status: 'confirmed' })
      .eq('order_id', orderId)
    await supa.from('shopify_orders')
      .update({ order_status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: stylist?.name || null })
      .eq('id', orderId)
  }

  } catch (e) { await rollback(e) }

  // P7: auto-promote tier based on lifetime value (skipped if tier_override)
  if (buyerCustomerId) {
    try { await supa.rpc('maybe_promote_tier', { p_customer_id: buyerCustomerId }) }
    catch (e) { console.warn('maybe_promote_tier failed:', e?.message) }
  }

  if (leadId) {
    try {
      await supa.from('lead_orders').insert({
        lead_id: leadId,
        order_id: orderId,
        linked_at: new Date().toISOString(),
        linked_by: stylist?.email || stylist?.name || 'pos-flow',
      })
    } catch (err) {
      console.warn('lead_orders junction insert failed:', err)
    }
  }

  return { orderId, orderNumber, total, customerId: buyerCustomerId, buyerCustomerId }
}

export const savePosPayments = async (orderId, total, splits, { stylist, isPartial = false, paymentType = 'initial', collectedAt = null, backdateDays = 0 }) => {
  if (!splits || splits.length === 0) return { collected: 0, balance: Number(total || 0), status: 'unpaid' }
  const now = new Date().toISOString()
  // Transaction date — when the customer actually paid. Honour the
  // caller's choice if provided (date picker on PaymentSplitModal),
  // otherwise stamp now. The DB stamps `created_at` (posting date)
  // automatically and we never send it from the app.
  const txnAt = collectedAt || now
  // Back-dated entries always start unverified so they show up in the
  // reconciliation queue regardless of source.
  const verification = backdateDays > 0 ? 'unverified' : 'unverified'

  // Gift card splits go through the atomic RPC first. If any redemption
  // fails we abort BEFORE writing pos_payments so balances stay consistent.
  for (const s of splits) {
    if (s.method !== 'gift_card') continue
    if (!s.reference || !s.gc_pin) throw new Error('Gift card requires code + PIN')
    const { error: rErr } = await supa.rpc('redeem_gift_card', {
      p_code: s.reference,
      p_pin: String(s.gc_pin),
      p_amount: Number(s.amount),
      p_order_id: orderId,
      p_actor: stylist?.name || null,
    })
    if (rErr) throw new Error('Gift card redeem failed: ' + rErr.message)
  }

  const rows = splits.map(s => ({
    order_id: orderId,
    method: s.method,
    amount: Number(s.amount),
    reference: s.reference || null,
    payment_type: paymentType,
    collected_by_id: stylist?.id || null,
    collected_by_name: stylist?.name || null,
    created_by_name: stylist?.name || null,
    collected_at: txnAt,
    verification_status: verification,
    // Note: NOT setting created_at — DB default (now()) provides the
    // immutable posting date.
  }))
  const { error: payErr } = await supa.from('pos_payments').insert(rows)
  if (payErr) throw payErr

  const collected = rows.reduce((s, r) => s + r.amount, 0)
  const { data: orderRow } = await supa.from('shopify_orders')
    .select('payment_collected, total_price').eq('id', orderId).single()
  const newCollected = Number(orderRow?.payment_collected || 0) + collected
  const orderTotal = Number(orderRow?.total_price || total || 0)
  const balance = +(orderTotal - newCollected).toFixed(2)
  const status = balance <= 0.01 ? 'paid' : (newCollected > 0 ? 'partial' : 'unpaid')
  await supa.from('shopify_orders').update({
    payment_collected: newCollected,
    payment_balance:   Math.max(0, balance),
    payment_status:    status,
  }).eq('id', orderId)

  return { collected: newCollected, balance, status }
}


// ═══ EDIT ORDER ════════════════════════════════════════════════════════
/**
 * Single-shot order edit. Patches header + adds/modifies/removes line items,
 * then recomputes order totals.
 *
 * @param {Object} opts
 * @param {string} opts.orderId
 * @param {Object} opts.orderPatch          fields on shopify_orders
 * @param {Array}  opts.addedItems          cart-shape new lines
 * @param {Array}  opts.modifiedItems       existing items with patches
 * @param {string[]} opts.removedItemIds    deleted (pending) or marked cancelled (else)
 * @param {Object} opts.actingUser
 */
import { stateCodeByName as _stateCodeByName } from '../../lib/gstStateCodes'

const EDITABLE_LINE_FIELDS = [
  'title', 'sku', 'quantity', 'unit_price', 'size', 'garment_category', 'garment_type',
  'discount_type', 'discount_value', 'discount_amount',
  'sale_price', 'gst_rate', 'gst_amount',
  'stylist', 'product_executive', 'fulfillment_type', 'shipper',
  'colour', 'customer_id',
]
const pickEditableLineFields = (li) => Object.fromEntries(
  EDITABLE_LINE_FIELDS.filter(k => li[k] !== undefined).map(k => [k, li[k]])
)

export const editOrder = async ({ orderId, orderPatch = {}, addedItems = [], modifiedItems = [], removedItemIds = [], actingUser }) => {
  const { data: order } = await supa.from('shopify_orders').select('*').eq('id', orderId).single()
  if (!order) throw new Error('Order not found')

  // 1. Patch header (resolve delivery_state_code if needed)
  let patch = { ...orderPatch }
  if (patch.delivery_state && !patch.delivery_state_code) {
    const sc = _stateCodeByName(patch.delivery_state)
    if (sc) patch.delivery_state_code = sc
  }
  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString()
    const { error } = await supa.from('shopify_orders').update(patch).eq('id', orderId)
    if (error) throw error
  }

  // 2. Modified items
  for (const li of modifiedItems) {
    const patchRow = pickEditableLineFields(li)
    if (Object.keys(patchRow).length) {
      const { error } = await supa.from('order_line_items').update(patchRow).eq('id', li.id)
      if (error) throw error
    }
  }

  // 3. Added items
  for (const li of addedItems) {
    const lineId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    const m = lineMath(li)
    const lineRow = {
      id: lineId,
      order_id: orderId,
      order_number: order.order_number,
      customer_id: li.customer_id || order.buyer_customer_id || order.customer_id,
      title: li.title, sku: li.sku || '',
      quantity: li.quantity || 1,
      unit_price: Number(li.mrp || 0),
      product_type: li.type === 'catalog' ? 'catalog' : 'custom',
      type: li.is_set ? 'Custom' : (li.type === 'custom' || li.type === 'custom_set' ? 'Custom' : 'General'),
      size: li.size || null,
      production_stage: 'pending',
      stylist: order.stylist,
      garment_category: li.garment_category || li.category || null,
garment_type: li.garment_type || null,
      discount_type: li.discountType || null,
      discount_value: li.discountValue == null ? null : Number(li.discountValue),
      discount_amount: m.discountAmount,
      sale_price: m.salePrice,
      gst_rate: m.gstRate,
      gst_amount: m.gstAmount,
      measurement_status: li.size === 'MTF' ? 'pending' : 'not_required',
      confirmation_status: 'incomplete',
      is_set_component: false,
    }
    const { error } = await supa.from('order_line_items').insert([lineRow])
    if (error) throw error
  }

  // 4. Removed items — pending = delete, else mark cancelled (proper cancel comes via cancelOrder in P3)
  if (removedItemIds.length) {
    const { data: rows } = await supa.from('order_line_items').select('id, production_stage').in('id', removedItemIds)
    const pendingIds    = (rows || []).filter(r => r.production_stage === 'pending').map(r => r.id)
    const inProgressIds = (rows || []).filter(r => r.production_stage !== 'pending').map(r => r.id)
    if (pendingIds.length) {
      await supa.from('order_line_items').delete().in('id', pendingIds)
    }
    if (inProgressIds.length) {
      // Soft-cancel for now; P3 will route this through cancelOrder() for full refund disposition.
      await supa.from('order_line_items').update({
        production_stage: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by_name: actingUser?.name || null,
        cancellation_reason: 'edited_off',
      }).in('id', inProgressIds)
    }
  }

  // 5. Recompute totals from living items
  const { data: items } = await supa.from('order_line_items')
    .select('sale_price, gst_amount').eq('order_id', orderId).neq('production_stage', 'cancelled')
  const total   = (items || []).reduce((acc, i) => acc + Number(i.sale_price || 0), 0)
  const gstSum  = (items || []).reduce((acc, i) => acc + Number(i.gst_amount  || 0), 0)
  const collected = Number(order.payment_collected || 0)
  const balance   = +(total - collected).toFixed(2)
  const status    = total <= 0 ? 'cancelled' : balance <= 0.01 ? 'paid' : collected > 0 ? 'partial' : 'unpaid'

  await supa.from('shopify_orders').update({
    total_price: +total.toFixed(2),
    payment_balance: Math.max(0, balance),
    payment_status: status,
  }).eq('id', orderId)

  return { ok: true, total, gstSum, balance, status }
}


// ═══ CANCEL & VOID ════════════════════════════════════════════════════════
/**
 * Atomic-ish recompute of payment_collected from the sum of pos_payments
 * (positive = collected, negative = refund). Updates payment_balance and
 * payment_status to match. Called after every refund insert.
 */
export const rebuildOrderPaymentTotals = async (orderId) => {
  const { data: pays } = await supa.from('pos_payments').select('amount').eq('order_id', orderId)
  const collected = (pays || []).reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const { data: order } = await supa.from('shopify_orders').select('total_price').eq('id', orderId).single()
  const total = Number(order?.total_price || 0)
  const balance = +(total - collected).toFixed(2)
  const status =
    total <= 0          ? 'cancelled' :
    balance <= 0.01     ? 'paid' :
    collected > 0       ? 'partial' :
                          'unpaid'
  await supa.from('shopify_orders').update({
    payment_collected: collected,
    payment_balance:   Math.max(0, balance),
    payment_status:    status,
  }).eq('id', orderId)
  return { collected, balance: Math.max(0, balance), status }
}

/**
 * Cancel a whole order or a subset of its line items. Writes refund splits
 * as NEGATIVE pos_payments rows so the existing Dues + Today's Collections
 * views update automatically (their sums treat negative rows as refunds).
 *
 * @param {Object} opts
 * @param {string} opts.orderId
 * @param {string[]=} opts.lineItemIds   undefined / [] → whole order
 * @param {string} opts.reason
 * @param {string=} opts.notes
 * @param {Object} opts.refund           { disposition, splits[], storeCreditAmount?,
 *                                          pendingAmount?, pendingMethod? }
 *                                       disposition: 'original'|'store_credit'|'pending'|'none'
 * @param {number=} opts.writeOff
 * @param {Object} opts.actingUser
 * @param {string=} opts.approvingUserId
 */
export const cancelOrder = async ({
  orderId, lineItemIds, reason, notes, refund = { disposition: 'none' },
  writeOff = 0, actingUser, approvingUserId = null,
}) => {
  if (!reason) throw new Error('Reason is required')
  const now = new Date().toISOString()
  const isWhole = !lineItemIds || lineItemIds.length === 0

  // 1. Re-fetch defensively
  const { data: order, error: oErr } = await supa.from('shopify_orders').select('*').eq('id', orderId).single()
  if (oErr || !order) throw new Error('Order not found')
  const { data: items } = await supa.from('order_line_items').select('*').eq('order_id', orderId)

  const blockedStages = ['shipped', 'delivered']
  const targetItems = isWhole ? (items || []) : (items || []).filter(i => lineItemIds.includes(i.id))
  if (targetItems.some(i => blockedStages.includes(i.production_stage))) {
    throw new Error('One or more items are dispatched / delivered — use Returns instead')
  }
  if (isWhole && order.order_status === 'dispatched') {
    throw new Error('Order is dispatched — use Returns instead')
  }

  // 2. Mark items cancelled
  if (targetItems.length) {
    await supa.from('order_line_items').update({
      production_stage: 'cancelled',
      cancelled_at: now,
      cancelled_by_name: actingUser?.name || null,
      cancellation_reason: reason,
      cancellation_notes: notes || null,
    }).in('id', targetItems.map(i => i.id))
  }

  // 3. Either flag the whole order cancelled or recompute totals
  if (isWhole) {
    await supa.from('shopify_orders').update({
      order_status: 'cancelled',
      cancelled_at: now,
      cancelled_by_name: actingUser?.name || null,
      cancelled_by_id: actingUser?.id || null,
      cancellation_reason: reason,
      cancellation_notes: notes || null,
      write_off_amount: Number(writeOff || 0),
    }).eq('id', orderId)
  } else {
    // Recompute totals from remaining non-cancelled items
    const living = (items || []).filter(i => !targetItems.find(t => t.id === i.id) && i.production_stage !== 'cancelled')
    const newTotal = living.reduce((s, i) => s + Number(i.sale_price || 0), 0)
    await supa.from('shopify_orders').update({
      total_price: +newTotal.toFixed(2),
      write_off_amount: Number(order.write_off_amount || 0) + Number(writeOff || 0),
    }).eq('id', orderId)
  }

  // 4. Refund disposition — writes NEGATIVE pos_payments rows for 'original'
  if (refund.disposition === 'original' && Array.isArray(refund.splits)) {
    const refundRows = refund.splits
      .filter(s => Number(s.amount) > 0)
      .map(s => ({
        order_id: orderId,
        method: s.method,
        amount: -Math.abs(Number(s.amount)),
        reference: s.reference || null,
        payment_type: 'refund',
        collected_by_id: actingUser?.id || null,
        collected_by_name: actingUser?.name || null,
        collected_at: now,
        notes: `Refund: ${reason}${notes ? ' — ' + notes : ''}`,
      }))
    if (refundRows.length) {
      const { error: payErr } = await supa.from('pos_payments').insert(refundRows)
      if (payErr) throw payErr
      const refundTotal = refundRows.reduce((s, r) => s + Math.abs(r.amount), 0)
      await supa.from('shopify_orders').update({
        refund_completed_amount: Number(order.refund_completed_amount || 0) + refundTotal,
      }).eq('id', orderId)
    }
  } else if (refund.disposition === 'store_credit') {
    const amount = Number(refund.storeCreditAmount || 0)
    if (amount > 0) {
      // Resolve legacy buyer_id from the buyer customer
      const buyerCustId = order.buyer_customer_id || order.customer_id
      if (buyerCustId) {
        const { data: cust } = await supa.from('customers').select('buyer_id').eq('id', buyerCustId).maybeSingle()
        if (cust?.buyer_id) {
          await supa.from('store_credit_transactions').insert({
            buyer_id: cust.buyer_id,
            amount,
            kind: 'issued',
            notes: `Refund for cancelled order ${order.order_number}`,
            order_id: orderId,
            created_by_name: actingUser?.name || null,
          })
          // Best-effort bump — failure is non-fatal because the txn row is authoritative
          try { await supa.rpc('increment_store_credit', { p_buyer_id: cust.buyer_id, p_delta: amount }) } catch (e) { /* RPC may not exist yet */ }
        }
      }
    }
  } else if (refund.disposition === 'pending') {
    await supa.from('shopify_orders').update({
      refund_pending_amount: Number(refund.pendingAmount || 0),
      refund_pending_method: refund.pendingMethod || 'tbd',
    }).eq('id', orderId)
  }

  // 5. Recompute payment_collected/balance/status from the (now signed) pos_payments
  await rebuildOrderPaymentTotals(orderId)

  // 5b. Reverse loyalty (earn + redeem) on whole-order cancel. Partial-line
  // cancels keep loyalty intact so we don't keep flip-flopping points.
  if (isWhole) {
    try { await supa.rpc('reverse_loyalty_for_order', { p_order_id: orderId, p_actor: actingUser?.name || null }) }
    catch (e) { console.warn('reverse_loyalty_for_order:', e?.message) }
  }

  // 6. Audit
  try {
    const { _logChange } = await import('../../lib/logger')
    _logChange?.('cancel', isWhole ? 'order' : 'order_line', orderId, order.order_number, {
      reason, notes,
      write_off: writeOff,
      refund_disposition: refund.disposition,
      cancelled_item_ids: targetItems.map(i => i.id),
      approving_user_id: approvingUserId,
    })
  } catch {}

  return { ok: true }
}

/** Thin alias — void is just cancel on a still-pending order. */
export const voidOrder = (opts) => cancelOrder(opts)

// ──────────────────────────────────────────────────────────────────────
// Marketplace order pipeline (PRD: HILO Marketplace Module)
//
// Marketplace orders are commercially B2B — the platform owes us money on
// a settlement cycle, not at checkout. No PaymentSplitModal. Order number
// follows the HM00001 sequence. The customer row IS the marketplace
// (one customers row per marketplace, reused across all of its orders).
// ──────────────────────────────────────────────────────────────────────

const nextMarketplaceOrderNumber = async () => {
  const { data, error } = await supa.rpc('next_marketplace_order_number')
  if (error) throw error
  return data
}

/**
 * Find-or-create the single customer/buyer row that represents this
 * marketplace. We need both:
 *   - a `buyers` row (customers.buyer_id is NOT NULL → buyers.id)
 *   - a `customers` row with is_marketplace=true, loyalty_eligible=false
 *
 * Both rows are named exactly with the marketplace name ('AZA Fashions'),
 * so every place that reads customer_name today renders the marketplace
 * label by default.
 */
export const ensureMarketplaceCustomer = async (marketplaceName) => {
  if (!marketplaceName) throw new Error('Marketplace name required')

  // Try to reuse the existing system customer
  const { data: existing } = await supa.from('customers')
    .select('id, buyer_id')
    .eq('is_marketplace', true)
    .eq('name', marketplaceName)
    .limit(1)
  if (existing?.[0]?.id) return existing[0].id

  // Ensure buyer row
  let buyerId = null
  const { data: bHit } = await supa.from('buyers').select('id').eq('name', marketplaceName).limit(1)
  if (bHit?.[0]) {
    buyerId = bHit[0].id
  } else {
    const { data: newBuyer, error: bErr } = await supa.from('buyers').insert([{
      name: marketplaceName,
      source: 'marketplace',
      notes: 'System-managed marketplace counter-party. Do not edit.',
    }]).select('id').single()
    if (bErr) throw bErr
    buyerId = newBuyer.id
  }

  // Customer profile linked to that buyer
  const { data: newCust, error: cErr } = await supa.from('customers').insert([{
    buyer_id: buyerId,
    name: marketplaceName,
    is_buyer: true,
    is_marketplace: true,
    loyalty_eligible: false,
    relationship: 'self',
    relationship_type: 'self',
  }]).select('id').single()
  if (cErr) throw cErr
  return newCust.id
}

/**
 * Create a marketplace order.
 *
 *  opts.marketplace            : { name, id } — required
 *  opts.marketplaceOrderRef    : string, required (the marketplace's own ID)
 *  opts.orderDate              : ISO date, defaults to today
 *  opts.lines                  : [{ title, sku, garment_category, size, qty,
 *                                   catalogue_mrp, sold_mrp,
 *                                   custom_measurements? }, …]
 *  opts.fees                   : [{ type, label, kind:'percent'|'flat',
 *                                   value, amount }] — already computed
 *  opts.productionExecutive    : string (name) — required for production routing
 *  opts.actingUser             : { id, name }
 */
export const createMarketplaceOrder = async (opts) => {
  const {
    marketplace, marketplaceOrderRef, orderDate,
    lines = [], fees = [], productionExecutive, actingUser,
  } = opts
  if (!marketplace?.name) throw new Error('Marketplace required')
  if (!marketplaceOrderRef) throw new Error('Marketplace order ref required')
  if (lines.length === 0) throw new Error('No line items')

  // Marketplace orders are operations-owned. They carry no retail stylist,
  // so the stylist defaults to the ops lead (Jamal) for attribution/QC.
  const MP_DEFAULT_STYLIST = '4'  // team_member id (Jamal); store id, not name

  // Marketplace orders carry NO end customer. They are identified by
  // channel='Marketplace' + marketplace_id / marketplace_name. customer_id
  // stays NULL (the ensure_order_customer trigger skips marketplace rows).

  // Stamp the seller store_id so reporting groups by marketplace and invoice
  // generation has access to GSTIN. Lookup order:
  //   1. The marketplace-specific store (stores.marketplace_id = this marketplace)
  //   2. Fall back to the in-store legal entity (Jubilee Hills) so the
  //      invoice can still print if a brand-new marketplace hasn't been
  //      linked to a store row yet.
  let marketplaceStoreId = null
  try {
    if (marketplace?.id) {
      const { data: mpSpecific } = await supa
        .from('stores')
        .select('id')
        .eq('marketplace_id', marketplace.id)
        .eq('is_active', true)
        .limit(1).maybeSingle()
      marketplaceStoreId = mpSpecific?.id || null
    }
    if (!marketplaceStoreId) {
      const { data: legal } = await supa
        .from('stores')
        .select('id')
        .eq('channel_id', 'in-store')
        .eq('is_active', true)
        .limit(1).maybeSingle()
      marketplaceStoreId = legal?.id || null
    }
  } catch { /* swallow */ }


  // Totals
  const gross = lines.reduce((s, l) => s + Number(l.sold_mrp || 0) * Number(l.qty || 1), 0)
  const discount = lines.reduce((s, l) => s + Math.max(0, (Number(l.catalogue_mrp || 0) - Number(l.sold_mrp || 0))) * Number(l.qty || 1), 0)
  const feesTotal = (fees || []).reduce((s, f) => s + Number(f.amount || 0), 0)
  const net = +(gross - feesTotal).toFixed(2)

  const orderNumber = await nextMarketplaceOrderNumber()
  const orderId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `mp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const total = +gross.toFixed(2)
  const createdAt = orderDate ? new Date(orderDate + 'T12:00:00').toISOString() : new Date().toISOString()

  const orderPayload = {
    id: orderId,
    order_number: orderNumber,
    customer_id: null,
    buyer_customer_id: null,
    marketplace_id: marketplace.id || null,
    customer_name: marketplace.name,
    total_price: total,
    channel: 'Marketplace',
    channel_id: 'marketplace',
    store_id: marketplaceStoreId,
    marketplace_name: marketplace.name,
    marketplace_order_ref: marketplaceOrderRef,
    marketplace_fees: fees || [],
    marketplace_gross_amount: total,
    marketplace_fees_total: feesTotal,
    marketplace_net_amount: net,
    marketplace_discount_amount: discount,
    settlement_status: 'awaiting',
    financial_status: 'pending',
    fulfillment_status: 'unfulfilled',
    order_status: 'pending',
    order_origin: 'pos',
    payment_collected: 0,
    payment_balance: total,
    payment_status: 'unpaid',
    stylist: MP_DEFAULT_STYLIST,         // ops-owned marketplace order (default stylist: Jamal)
    // product_executive lives on order_line_items (not shopify_orders); set per line below.
    created_at: createdAt,
  }
  const { error: oErr } = await supa.from('shopify_orders').insert([orderPayload])
  if (oErr) throw oErr

  // Line items
  const rollback = async (e) => {
    try {
      await supa.from('order_line_items').delete().eq('order_id', orderId)
      await supa.from('shopify_orders').delete().eq('id', orderId)
    } catch (re) { console.error('Marketplace order rollback failed:', re) }
    throw e
  }
  try {
    for (const li of lines) {
      const lineId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const qty = Number(li.qty || 1)
      const sold = Number(li.sold_mrp || 0)
      // Marketplace orders use sold_mrp as the unit price; no per-line
      // discount layer since the marketplace already set the customer
      // price. GST is computed inclusive on the sold price.
      const gstRate = 0.05
      const salePrice = sold * qty
      const gstAmount = +(salePrice - salePrice / (1 + gstRate)).toFixed(2)
      const row = {
        id: lineId,
        order_id: orderId,
        order_number: orderNumber,
        customer_id: null,
        title: li.title || '',
        sku: li.sku || '',
        quantity: qty,
        unit_price: sold,
        catalogue_mrp: Number(li.catalogue_mrp || 0) || null,
        sold_mrp: sold,
        custom_measurements: li.custom_measurements || {},
        product_type: li.product_type || 'custom',
        type: li.type || 'Marketplace',
        size: li.size || null,
        production_stage: 'pending',
        stylist: MP_DEFAULT_STYLIST,
        product_executive: productionExecutive || null,
        garment_category: li.garment_category || null,
garment_type: li.garment_type || null,
        discount_amount: 0,
        sale_price: salePrice,
        gst_rate: gstRate,
        gst_amount: gstAmount,
        measurement_status: (li.custom_measurements && Object.keys(li.custom_measurements).length > 0)
          ? 'captured'
          : (li.size === 'MTF' ? 'pending' : 'not_required'),
        confirmation_status: 'confirmed',
        is_set_component: false,
      }
      const { error: lErr } = await supa.from('order_line_items').insert([row])
      if (lErr) throw lErr
    }
  } catch (e) { return rollback(e) }

  return {
    orderId, orderNumber, total, gross, fees, feesTotal, net, discount,
    marketplaceName: marketplace.name,
  }
}


import { supa } from '../../lib/supabase'
import { cartTotals, lineMath } from './cartHelpers'
import { createPosOrder, savePosPayments } from './orderActions'

/**
 * Quotation persistence + conversion.
 *
 *   newQuotationNumber()     → HILO-Q-NNNN sequenced off existing rows
 *   randomShareToken()       → 24-char URL-safe token
 *   saveQuotation({...})     → upsert; returns the row
 *   convertQuotationToOrder({ quotation, customer, stylist, store, mode })
 *     - Creates a shopify_orders row with order_origin='quotation' and the
 *       quotation_id linked. Line items are inserted with confirmation_status
 *       already = 'confirmed' so the order skips the confirmation gate.
 *     - Updates the quotation: status='converted' + converted_order_id.
 *     - Returns the created order so the caller can pop the payment modal.
 */

const pad = (n, w = 4) => String(n).padStart(w, '0')

export const newQuotationNumber = async () => {
  const { count } = await supa.from('quotations').select('id', { count: 'exact', head: true })
  return `HILO-Q-${pad((count || 0) + 1)}`
}

export const randomShareToken = () => {
  const arr = new Uint8Array(18)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr)
  else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
  return Array.from(arr).map(b => b.toString(36)).join('').slice(0, 24)
}

/**
 * Quotation `items` JSONB shape (one entry per cart line):
 *   {
 *     type, title, sku, mrp, quantity, size, category,
 *     discountType, discountValue, discountAmount, salePrice, gstRate, gstAmount,
 *     is_set, set_components: [{ name, category, garment_category, cogs: {...} }],
 *     cogs: { fabricId, fabricName, fabricPrice, metres, dye, embroidery,
 *             stitching, accessories, colour, notes, refImages: [{url,tag}] }
 *   }
 */
const buildItemsForJsonb = (cart) => cart.map(l => {
  const m = lineMath(l)
  return {
    ...l,
    discountAmount: m.discountAmount,
    salePrice:      m.salePrice,
    gstRate:        m.gstRate,
    gstAmount:      m.gstAmount,
  }
})

export const saveQuotation = async ({ id, customer, stylist, store, mode, cart, eventDate, validUntil, notes, status = 'draft', shareToken }) => {
  const totals = cartTotals(cart)
  const items = buildItemsForJsonb(cart)
  const totalCogs = items.reduce((s, it) => {
    const own = Number(it?.cogs?.total || 0)
    const set = (it.set_components || []).reduce((a, c) => a + Number(c?.cogs?.total || 0), 0)
    return s + own + set
  }, 0)
  const payload = {
    customer_id: customer?.customer_id || null,
    stylist_id:  stylist?.id || null,
    stylist_name: stylist?.name || null,
    store: store || null,
    status,
    items,
    total_mrp: +totals.saleTotal.toFixed(2),
    total_cogs: +totalCogs.toFixed(2),
    share_token: shareToken || randomShareToken(),
    valid_until: validUntil || null,
    event_date: eventDate || null,
    notes: notes || null,
    updated_at: new Date().toISOString(),
  }
  if (id) {
    const { data, error } = await supa.from('quotations').update(payload).eq('id', id).select().single()
    if (error) throw error
    return data
  }
  payload.quotation_number = await newQuotationNumber()
  const { data, error } = await supa.from('quotations').insert([payload]).select().single()
  if (error) throw error
  return data
}

export const convertQuotationToOrder = async ({ quotation, customer, stylist, store, mode }) => {
  // Re-hydrate cart from quotation.items
  const cart = (quotation.items || []).map(it => ({ ...it, tempId: it.tempId || ('q_' + (it.sku || it.title)) }))
  // Customer may not be linked (drafts); fall back to stored snapshot
  const result = await createPosOrder({ customer, orderMeta: { event_date: quotation.event_date }, cart, stylist, store, mode, quotationId: quotation.id })
  await supa.from('quotations').update({
    status: 'converted',
    converted_order_id: result.orderId,
    updated_at: new Date().toISOString(),
  }).eq('id', quotation.id)
  return result
}

export const shareUrlFor = (quotation) => {
  if (!quotation?.share_token) return null
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/#/q/${quotation.share_token}`
}

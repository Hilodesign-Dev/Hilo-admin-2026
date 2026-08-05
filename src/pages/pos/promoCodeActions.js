import { supa } from '../../lib/supabase'
import { cartTotals } from './cartHelpers'

/**
 * Promo-code helpers.
 *
 * validatePromoCode(code, ctx)
 *   ctx: { cart, customer, channel }
 *   Returns { ok: true, coupon: {...} } on success — the coupon object can be
 *   spread straight into cartTotals({ coupon }). Returns { ok: false, reason }
 *   on failure so the UI can surface a friendly inline error.
 *
 * recordPromoRedemption({ promo, orderId, customer, amount, actingUser })
 *   Inserts the redemption row and bumps usage_count atomically.
 */

export const validatePromoCode = async (rawCode, ctx = {}) => {
  const { cart = [], customer = null, channel = 'In-store' } = ctx
  const normalized = (rawCode || '').trim().toUpperCase()
  if (!normalized) return { ok: false, reason: 'Enter a code' }

  // Use the case-insensitive match — index is on upper(code)
  const { data: pc, error } = await supa.from('promo_codes')
    .select('*')
    .ilike('code', normalized)
    .eq('is_active', true)
    .maybeSingle()
  if (error) return { ok: false, reason: 'Lookup failed: ' + (error.message || '') }
  if (!pc) return { ok: false, reason: 'Unknown or inactive code' }

  const now = new Date()
  if (pc.valid_from && new Date(pc.valid_from) > now) return { ok: false, reason: 'Code not yet valid' }
  if (pc.valid_until && new Date(pc.valid_until) < now) return { ok: false, reason: 'Code expired' }

  if (pc.channels && pc.channels.length > 0 && channel && !pc.channels.includes(channel)) {
    return { ok: false, reason: `Not valid on ${channel}` }
  }

  if (pc.usage_limit && pc.usage_count >= pc.usage_limit) {
    return { ok: false, reason: 'Code exhausted' }
  }

  const customerId = customer?.customer_id || customer?.id || null
  if (pc.per_customer_limit && customerId) {
    const { count } = await supa.from('promo_code_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promo_code_id', pc.id)
      .eq('buyer_customer_id', customerId)
    if ((count || 0) >= pc.per_customer_limit) {
      return { ok: false, reason: 'Already used by this customer' }
    }
  }

  // Pre-coupon totals (line discounts + order discount stripped out; we don't
  // know about the order discount here so we just check against line-discounted
  // sale total — conservative but matches the spec)
  const totals = cartTotals(cart)
  if (pc.min_order_amount && totals.saleTotal < Number(pc.min_order_amount)) {
    return { ok: false, reason: `Minimum order ₹${Number(pc.min_order_amount).toLocaleString('en-IN')} not met` }
  }

  if (pc.applicable_to === 'customer_tier') {
    const ok = (pc.applicable_ids || []).includes(customer?.customer_type)
    if (!ok) return { ok: false, reason: 'Not valid for this customer tier' }
  }
  if (pc.applicable_to === 'category') {
    const cats = pc.applicable_ids || []
    const hasMatch = cart.some(li => cats.includes(li.garment_category || li.category))
    if (!hasMatch) return { ok: false, reason: 'Not valid for these products' }
  }
  if (pc.applicable_to === 'product') {
    const ids = pc.applicable_ids || []
    const hasMatch = cart.some(li => ids.includes(li.product_id) || ids.includes(li.sku))
    if (!hasMatch) return { ok: false, reason: 'Not valid for these products' }
  }

  return {
    ok: true,
    coupon: {
      id: pc.id,
      code: pc.code,
      name: pc.name || '',
      description: pc.description || '',
      type: pc.discount_type,
      value: Number(pc.discount_value),
      maxDiscount: pc.max_discount_amount ? Number(pc.max_discount_amount) : null,
      excludesLoyalty: !!pc.excludes_loyalty,
      stackable: !!pc.stackable_with_coupons,
    },
  }
}

export const recordPromoRedemption = async ({ promo, orderId, customer, amount, actingUser }) => {
  if (!promo?.id || !orderId || !(amount > 0)) return { ok: false, reason: 'Missing promo / order / amount' }
  const { error: insErr } = await supa.from('promo_code_redemptions').insert([{
    promo_code_id: promo.id,
    order_id: orderId,
    buyer_customer_id: customer?.customer_id || customer?.id || null,
    amount,
    redeemed_by_name: actingUser?.name || null,
  }])
  if (insErr) return { ok: false, reason: insErr.message }
  await supa.rpc('increment_promo_usage', { p_promo_id: promo.id })
  return { ok: true }
}

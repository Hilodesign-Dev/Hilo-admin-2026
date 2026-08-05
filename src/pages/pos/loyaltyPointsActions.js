import { supa } from '../../lib/supabase'

/**
 * Loyalty points client helpers — thin wrappers around the SECURITY DEFINER
 * RPCs in p8_loyalty_points. The RPCs themselves are atomic; this module
 * just gives JS callers nicer signatures.
 *
 *   earnLoyaltyPoints({ customerId, orderId, spend, actor })
 *     Idempotent per order_id. Returns the number of points earned.
 *
 *   redeemLoyaltyPoints({ customerId, orderId, points, actor })
 *     Throws on insufficient balance. Returns the new balance.
 *
 *   reverseLoyaltyForOrder(orderId, actor)
 *     Called from cancel flow to wind back any earn + redeem activity.
 *
 *   getLoyaltyBalance(customerId)
 *     Reads customers.loyalty_points directly.
 */

export const earnLoyaltyPoints = async ({ customerId, orderId, spend, actor = null }) => {
  if (!customerId || !orderId || !(spend > 0)) return 0
  const { data, error } = await supa.rpc('earn_loyalty_points', {
    p_customer_id: customerId,
    p_order_id: orderId,
    p_spend: Number(spend),
    p_actor: actor,
  })
  if (error) { console.warn('earn_loyalty_points:', error.message); return 0 }
  return Number(data || 0)
}

export const redeemLoyaltyPoints = async ({ customerId, orderId, points, actor = null }) => {
  const { data, error } = await supa.rpc('redeem_loyalty_points', {
    p_customer_id: customerId,
    p_order_id: orderId,
    p_points: Number(points),
    p_actor: actor,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}

export const reverseLoyaltyForOrder = async (orderId, actor = null) => {
  const { error } = await supa.rpc('reverse_loyalty_for_order', {
    p_order_id: orderId,
    p_actor: actor,
  })
  if (error) console.warn('reverse_loyalty_for_order:', error.message)
}

export const getLoyaltyBalance = async (customerId) => {
  if (!customerId) return 0
  const { data, error } = await supa.from('customers').select('loyalty_points').eq('id', customerId).maybeSingle()
  if (error || !data) return 0
  return Number(data.loyalty_points || 0)
}

import { supa } from '../../lib/supabase'

/**
 * Gift card helpers.
 *
 *   newGiftCardCode()
 *     Generates HILO-G-XXXX-XXXX-XXXX (12 hex chars). Collision probability
 *     at 2^48 is effectively zero, but we still loop on unique-constraint
 *     errors at insert time.
 *
 *   newGiftCardPin()
 *     4-digit numeric PIN. Mandatory per the user spec.
 *
 *   issueGiftCard({ amount, recipient, expiresAt, purchaserCustomerId, purchaseOrderId, actor })
 *     Inserts the gift_cards row + a gift_card_transactions row (kind='issued').
 *     Returns { code, pin, balance, id }.
 *
 *   validateGiftCard(code, pin)
 *     Returns { ok, balance, expiresAt, id } or { ok: false, reason }.
 *
 *   redeemGiftCard({ code, pin, amount, orderId, actor })
 *     Calls the atomic redeem_gift_card RPC. Returns { ok, newBalance } or
 *     { ok: false, reason }.
 */

export const newGiftCardCode = () => {
  const block = () => Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0')
  return `HILO-G-${block()}-${block()}-${block()}`
}

export const newGiftCardPin = () => String(Math.floor(1000 + Math.random() * 9000))

export const issueGiftCard = async ({
  amount, recipient = {}, expiresAt = null,
  purchaserCustomerId = null, purchaseOrderId = null, actor = null,
  pin = null,
}) => {
  const v = Number(amount)
  if (!(v > 0)) throw new Error('Amount must be > 0')
  const expiresIso = expiresAt || new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
  const finalPin = pin || newGiftCardPin()

  // Retry up to 3 times on the (vanishingly unlikely) code collision.
  let lastErr = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newGiftCardCode()
    const { data, error } = await supa.from('gift_cards').insert([{
      code,
      initial_value: v,
      current_balance: v,
      purchaser_customer_id: purchaserCustomerId,
      purchase_order_id: purchaseOrderId,
      recipient_name: recipient.name || null,
      recipient_phone: recipient.phone || null,
      recipient_email: recipient.email || null,
      message: recipient.message || null,
      pin: finalPin,
      expires_at: expiresIso,
      is_active: true,
      created_by_name: actor || null,
    }]).select('id, code, pin, current_balance').single()
    if (!error) {
      // Audit row in transactions ledger
      await supa.from('gift_card_transactions').insert([{
        gift_card_id: data.id,
        order_id: purchaseOrderId,
        amount: v,
        kind: 'issued',
        notes: recipient.name ? `Issued to ${recipient.name}` : 'Issued',
        created_by_name: actor || null,
      }])
      return { id: data.id, code: data.code, pin: data.pin, balance: Number(data.current_balance) }
    }
    lastErr = error
    if (!/duplicate key/i.test(error.message || '')) break
  }
  throw new Error('Failed to issue gift card: ' + (lastErr?.message || 'unknown'))
}

export const validateGiftCard = async (rawCode, pin) => {
  const code = (rawCode || '').trim().toUpperCase()
  if (!code) return { ok: false, reason: 'Enter a code' }
  if (!pin || String(pin).length < 4) return { ok: false, reason: 'PIN is required' }
  const { data: card, error } = await supa.from('gift_cards')
    .select('id, current_balance, expires_at, is_active, pin')
    .ilike('code', code)
    .maybeSingle()
  if (error) return { ok: false, reason: 'Lookup failed: ' + error.message }
  if (!card) return { ok: false, reason: 'Card not found' }
  if (!card.is_active) return { ok: false, reason: 'Card inactive' }
  if (card.expires_at && new Date(card.expires_at) < new Date()) return { ok: false, reason: 'Card expired' }
  if (card.pin !== String(pin)) return { ok: false, reason: 'Invalid PIN' }
  return { ok: true, id: card.id, balance: Number(card.current_balance), expiresAt: card.expires_at }
}

export const redeemGiftCard = async ({ code, pin, amount, orderId, actor = null }) => {
  if (!(Number(amount) > 0)) return { ok: false, reason: 'Amount must be > 0' }
  const { data, error } = await supa.rpc('redeem_gift_card', {
    p_code: (code || '').trim(),
    p_pin: String(pin || ''),
    p_amount: Number(amount),
    p_order_id: orderId,
    p_actor: actor,
  })
  if (error) return { ok: false, reason: error.message }
  return { ok: true, newBalance: Number(data) }
}

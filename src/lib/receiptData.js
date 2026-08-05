import { supa } from './supabase'
import { orderPlaceOfSupply, splitGstAmount } from './gstStateCodes'

/**
 * Authenticated full data fetch for the receipt templates.
 * Used by the in-app share/print modal. (Public anon route uses an edge
 * function that whitelists fields — out of scope for v1.)
 */
export const prepareReceiptData = async (orderId) => {
  const [orderRes, itemsRes, paymentsRes] = await Promise.all([
    supa.from('shopify_orders').select('*').eq('id', orderId).single(),
    supa.from('order_line_items').select('*').eq('order_id', orderId).neq('production_stage', 'cancelled'),
    supa.from('pos_payments').select('*').eq('order_id', orderId).order('collected_at'),
  ])
  const order = orderRes.data
  if (!order) throw new Error('Order not found')

  const [storeRes, customerRes] = await Promise.all([
    order.store_id ? supa.from('stores').select('*').eq('id', order.store_id).single() : Promise.resolve({ data: null }),
    (order.buyer_customer_id || order.customer_id)
      ? supa.from('customers').select('*').eq('id', order.buyer_customer_id || order.customer_id).single()
      : Promise.resolve({ data: null }),
  ])

  const store    = storeRes.data
  const customer = customerRes.data
  const items    = itemsRes.data || []
  const payments = paymentsRes.data || []

  const pos = orderPlaceOfSupply(order, store)
  const itemsWithSplit = items.map(i => ({
    ...i,
    gst_split: splitGstAmount(Number(i.gst_amount || 0), pos),
  }))

  // Subtotal / GST / total roll-up
  const subtotal       = items.reduce((s, i) => s + Number(i.sale_price || 0) - Number(i.gst_amount || 0), 0)
  const gstTotal       = items.reduce((s, i) => s + Number(i.gst_amount || 0), 0)
  const cgstTotal      = itemsWithSplit.reduce((s, i) => s + Number(i.gst_split?.cgst || 0), 0)
  const sgstTotal      = itemsWithSplit.reduce((s, i) => s + Number(i.gst_split?.sgst || 0), 0)
  const igstTotal      = itemsWithSplit.reduce((s, i) => s + Number(i.gst_split?.igst || 0), 0)
  // Grand total = stored order total; fall back to computed (taxable + GST) if missing/zero.
  const grandTotal     = Number(order.total_price) > 0 ? Number(order.total_price) : +(subtotal + gstTotal).toFixed(2)
  const totalCollected = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const balance        = Math.max(0, grandTotal - totalCollected)

  return {
    order, store, customer,
    items: itemsWithSplit, payments,
    pos,
    totals: { subtotal, gstTotal, cgstTotal, sgstTotal, igstTotal, grandTotal, totalCollected, balance },
  }
}

import React, { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'
import { renderA4 } from '../../lib/receipts'
import { POS_T, MIcon } from './tokens'

/**
 * Public, anon-accessible receipt page. Mounts at #/r/<share_token>.
 * Reads only receipt-safe fields (no COGS, no internal notes, no stylist
 * commission). Uses the existing anon RLS policy on shopify_orders by
 * share_token. Line items + payments are joined via the same anon
 * SELECT policies the rest of the app already has (or returns empty
 * if blocked — we'll surface a graceful "Receipt unavailable" state).
 */
const PublicReceipt = ({ token }) => {
  const [data, setData] = useState({ loading: true, order: null, items: [], payments: [], store: null, customer: null })

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      const { data: order, error } = await supa.from('shopify_orders').select(
        'id, order_number, created_at, total_price, payment_collected, payment_balance, payment_status, ' +
        'customer_name, customer_email, delivery_recipient_name, delivery_phone, delivery_address_line1, delivery_address_line2, delivery_city, delivery_state, delivery_pincode, delivery_country, ' +
        'store_id, buyer_customer_id, customer_id, customer_visible_notes, event_date'
      ).eq('share_token', token).maybeSingle()
      if (cancelled) return
      if (error || !order) { setData({ loading: false, order: null, items: [], payments: [], store: null, customer: null }); return }
      const [itemsRes, paysRes, storeRes, custRes] = await Promise.all([
        supa.from('order_line_items').select('title, sku, quantity, unit_price, size, garment_category, sale_price, gst_amount, gst_rate, discount_amount, is_set_component, set_parent_id').eq('order_id', order.id).neq('production_stage', 'cancelled'),
        supa.from('pos_payments').select('method, amount, payment_type, collected_at').eq('order_id', order.id).order('collected_at'),
        order.store_id ? supa.from('stores').select('name, legal_name, gstin, address_line1, address_line2, city, state, pincode, phone, email').eq('id', order.store_id).maybeSingle() : Promise.resolve({ data: null }),
        (order.buyer_customer_id || order.customer_id) ? supa.from('customers').select('name, phone, email').eq('id', order.buyer_customer_id || order.customer_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      if (cancelled) return
      setData({
        loading: false, order,
        items: itemsRes.data || [],
        payments: paysRes.data || [],
        store: storeRes.data || null,
        customer: custRes.data || null,
      })
    })()
    return () => { cancelled = true }
  }, [token])

  // Render the same A4 invoice the Download-PDF action generates so the
  // customer's view-receipt link is byte-for-byte identical to the PDF.
  const [html, setHtml] = React.useState('')
  const [renderErr, setRenderErr] = React.useState(null)
  React.useEffect(() => {
    if (data.loading || !data.order) return
    (async () => {
      try {
        const totals = {
          subtotal: data.items.reduce((s, i) => s + (Number(i.sale_price || 0) - Number(i.gst_amount || 0)), 0),
          gstTotal: data.items.reduce((s, i) => s + Number(i.gst_amount || 0), 0),
          saleTotal: Number(data.order.total_price || 0),
        }
        const pos = { kind: (data.store?.state_code || '36') === '36' ? 'intra' : 'inter' }
        const out = await renderA4({
          order: data.order,
          store: data.store,
          customer: data.customer,
          items: data.items,
          payments: data.payments,
          totals,
          pos,
        })
        setHtml(out)
      } catch (e) {
        console.error('renderA4 failed in PublicReceipt:', e)
        setRenderErr(e?.message || String(e))
      }
    })()
  }, [data.loading, data.order?.id])

  if (data.loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: POS_T.background }}>
      <div className="text-sm" style={{ color: POS_T.onSurfaceVariant }}>Loading…</div>
    </div>
  )
  if (!data.order) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: POS_T.background }}>
      <div className="max-w-sm text-center">
        <MIcon name="receipt_long" size={36} style={{ color: POS_T.outline }} />
        <div className="mt-3 font-bold" style={{ color: POS_T.onSurface }}>Receipt unavailable</div>
        <div className="text-sm mt-1" style={{ color: POS_T.onSurfaceVariant }}>This link has expired or is invalid. Please contact the store.</div>
      </div>
    </div>
  )

  if (renderErr) return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: POS_T.background }}>
      <div className="max-w-md text-center">
        <MIcon name="error_outline" size={36} style={{ color: '#dc2626' }} />
        <div className="mt-3 font-bold" style={{ color: POS_T.onSurface }}>Could not render receipt</div>
        <div className="text-sm mt-1" style={{ color: POS_T.onSurfaceVariant }}>{renderErr}</div>
      </div>
    </div>
  )
  if (!html) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: POS_T.background }}>
      <div className="text-sm" style={{ color: POS_T.onSurfaceVariant }}>Preparing receipt…</div>
    </div>
  )

  // Render the A4 invoice HTML directly. Same artefact as Download PDF.
  return (
    <div style={{ background: '#e5e7eb', minHeight: '100vh', padding: '16px 0' }}>
      <div
        style={{ maxWidth: 900, margin: '0 auto', background: '#fff', boxShadow: '0 6px 28px rgba(0,0,0,0.08)' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

export default PublicReceipt

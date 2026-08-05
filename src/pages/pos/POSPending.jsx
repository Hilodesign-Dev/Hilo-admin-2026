import React, { useState, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { C, fmtCurrency, fmtDate } from '../../lib/designTokens'
import OriginBadge from './OriginBadge'
import { POS_T, MIcon } from './tokens'
import ConfirmOrderModal from './ConfirmOrderModal'

/**
 * Pending POS orders queue — orders created with order_origin='pos' that
 * haven't yet been confirmed (order_status='pending'). Clicking an order
 * opens the confirmation modal.
 */
const POSPending = ({ stylist, teamMembers, products, onRefresh, stitchingMaster = [] }) => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [openOrder, setOpenOrder] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supa.from('shopify_orders')
      .select('id, order_number, customer_name, total_price, payment_status, payment_balance, created_at, channel, pos_store, order_origin')
      .eq('order_origin', 'pos').eq('order_status', 'pending')
      .order('created_at', { ascending: false }).limit(100)
    setOrders(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-center gap-2"><MIcon name="pending_actions" size={22} fill style={{ color: POS_T.primary }} /><h1 className="font-bold tracking-tight" style={{ color: POS_T.onSurface, fontSize: 'clamp(20px, 3vw, 28px)' }}>Orders awaiting confirmation</h1></div>
        <button onClick={load} className="text-xs font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1" style={{ border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}><MIcon name="refresh" size={14} />Refresh</button>
      </div>

      {loading && <div className="text-xs py-6 text-center" style={{ color: C.textMuted }}>Loading…</div>}
      {!loading && orders.length === 0 && (
        <div className="text-xs py-12 text-center" style={{ color: C.textMuted }}>No pending orders — all caught up.</div>
      )}

      <div className="space-y-2">
        {orders.map(o => (
          <button key={o.id} onClick={() => setOpenOrder(o)}
            className="w-full text-left p-3 sm:p-4 rounded-xl flex items-center gap-3 sm:gap-4 hover:shadow-md transition-shadow"
            style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
            <div className="flex-1">
              <div className="text-sm font-bold" style={{ color: C.text }}>{o.order_number}</div>
              <div className="text-xs mt-0.5" style={{ color: C.textMuted }}>
                {o.customer_name} · {fmtDate(o.created_at)} · {o.channel}{o.pos_store ? ` · ${o.pos_store}` : ''}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold" style={{ color: C.gold, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(o.total_price)}</div>
              <div className="text-[10px] font-bold uppercase mt-0.5" style={{ color: o.payment_status === 'paid' ? C.green : o.payment_status === 'partial' ? C.amber : C.red }}>
                {o.payment_status}{o.payment_balance > 0 ? ` · ₹${Number(o.payment_balance).toLocaleString('en-IN')} due` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2"><OriginBadge origin={o.order_origin} /><div className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#fff3cd', color: '#a16207' }}>PENDING</div></div>
          </button>
        ))}
      </div>

      {openOrder && (
        <ConfirmOrderModal stitchingMaster={stitchingMaster}
          order={openOrder} stylist={stylist} teamMembers={teamMembers} products={products}
          onClose={() => setOpenOrder(null)}
          onConfirmed={() => { setOpenOrder(null); load(); onRefresh?.() }}
        />
      )}
    </div>
  )
}

export default POSPending

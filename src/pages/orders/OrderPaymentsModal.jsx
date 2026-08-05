import React, { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'
import { C } from '../../lib/designTokens'

/**
 * Per-order payment history popup.
 * Opened from the Orders row when the partial-paid pill is clicked.
 * Lists every pos_payments row for this order with date, method,
 * reference, amount, collected by. Footer shows totals.
 */
const OrderPaymentsModal = ({ order, onClose }) => {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!order?.id) return
    let cancelled = false
    setLoading(true)
    supa.from('pos_payments')
      .select('id, method, amount, reference, payment_type, collected_at, created_at, collected_by_name, created_by_name, verification_status')
      .eq('order_id', order.id)
      .order('collected_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setPayments(data || [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [order?.id])

  const total = Number(order.total_price || 0)
  const collected = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const balance = Math.max(0, total - collected)
  const methodLabel = (m) => (m || '').replace(/_/g, ' ')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}>
      <div className="w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col mobile-sheet"
        style={{ background: '#fff', maxHeight: '95vh', boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>
        <div className="mobile-sheet-handle sm:hidden" />

        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: C.textMuted }}>Payment history</div>
            <div className="text-base font-bold font-mono mt-0.5" style={{ color: C.text }}>{order.order_number}</div>
            <div className="text-xs mt-0.5" style={{ color: C.textMuted }}>{order.customer_name || '—'}</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: C.textMuted }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="overflow-y-auto" style={{ flex: 1 }}>
          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: C.textMuted }}>Loading…</div>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: C.textLight }}>No payments recorded for this order yet.</div>
          ) : (
            <div>
              {payments.map(p => {
                const d = p.collected_at ? new Date(p.collected_at) : null
                const isRefund = Number(p.amount) < 0 || p.payment_type === 'refund'
                return (
                  <div key={p.id} className="px-5 py-3 flex items-start gap-3" style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-bold capitalize" style={{ color: C.text }}>{methodLabel(p.method)}</span>
                        {isRefund && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: C.redBg, color: C.red }}>Refund</span>}
                        {p.verification_status === 'verified' && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: C.greenBg, color: C.green }}>✓ Verified</span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono" style={{ color: C.textMuted }}>
                        {d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        {p.reference ? <> · {p.reference}</> : ''}
                      </div>
                      {p.collected_by_name && (
                        <div className="text-[11px] mt-0.5" style={{ color: C.textLight }}>by {p.collected_by_name}</div>
                      )}
                    </div>
                    <div className="font-mono font-bold tabular-nums text-right shrink-0" style={{ color: isRefund ? C.red : C.green }}>
                      ₹{Math.round(Math.abs(p.amount || 0)).toLocaleString('en-IN')}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 space-y-1" style={{ background: C.bg, borderTop: `1px solid ${C.border}`, paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: C.textMuted }}>Order total</span>
            <span className="font-mono font-bold" style={{ color: C.text }}>₹{Math.round(total).toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: C.textMuted }}>Collected</span>
            <span className="font-mono font-bold" style={{ color: C.green }}>₹{Math.round(collected).toLocaleString('en-IN')}</span>
          </div>
          {balance > 0.01 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold" style={{ color: C.red }}>Balance due</span>
              <span className="font-mono font-bold" style={{ color: C.red }}>₹{Math.round(balance).toLocaleString('en-IN')}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-sm">
              <span className="font-bold" style={{ color: C.green }}>✓ Fully paid</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default OrderPaymentsModal

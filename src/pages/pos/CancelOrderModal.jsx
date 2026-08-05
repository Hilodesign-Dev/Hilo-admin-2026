import React, { useEffect, useMemo, useState } from 'react'
import { supa } from '../../lib/supabase'
import { toast } from '../../lib/designTokens'
import { logAndToast } from '../../lib/logger'
import { POS_T, MIcon } from './tokens'
import { PAYMENT_METHODS } from './constants'
import { cancelOrder } from './orderActions'

/**
 * Cancel / void modal. Reads the order + line items + pos_payments,
 * lets the operator pick scope (whole order vs specific items), reason,
 * and refund disposition. Writes via cancelOrder() — which adds
 * NEGATIVE pos_payments rows for refunds so Dues & Ledger / Today's
 * Collections numbers update automatically.
 */
const CANCELLATION_REASONS = [
  { key: 'customer_changed_mind', label: 'Customer changed mind' },
  { key: 'wrong_order',           label: 'Wrong order placed' },
  { key: 'duplicate_order',       label: 'Duplicate order' },
  { key: 'fabric_unavailable',    label: 'Fabric unavailable' },
  { key: 'vendor_capacity',       label: 'Vendor capacity issue' },
  { key: 'pricing_dispute',       label: 'Pricing dispute' },
  { key: 'long_delivery',         label: 'Customer wants faster delivery' },
  { key: 'measurements_unclear',  label: 'Measurements not workable' },
  { key: 'payment_failure',       label: 'Payment did not clear' },
  { key: 'other',                 label: 'Other (specify)' },
]

const CancelOrderModal = ({ order, actingUser, scope = 'order', initialLineIds = [], onCancelled, onClose }) => {
  const [items, setItems] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState(scope)  // 'order' | 'line'
  const [selectedIds, setSelectedIds] = useState(new Set(initialLineIds))
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [disposition, setDisposition] = useState('original')  // original | store_credit | pending | none
  const [splits, setSplits] = useState([])  // {method, amount, reference}
  const [pendingMethod, setPendingMethod] = useState('tbd')
  const [writeOff, setWriteOff] = useState('')
  const [confirming, setConfirming] = useState(false)

  // Load items + payments
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      supa.from('order_line_items').select('*').eq('order_id', order.id),
      supa.from('pos_payments').select('*').eq('order_id', order.id),
    ]).then(([li, p]) => {
      if (cancelled) return
      setItems(li.data || [])
      const collectedRows = (p.data || []).filter(r => Number(r.amount) > 0)
      setPayments(p.data || [])
      // Seed refund splits from historical collected splits, proportional to refundable
      // For now: prefill at full historical amounts; user trims as needed.
      setSplits(collectedRows.map(r => ({ method: r.method, amount: Number(r.amount), reference: r.reference || '' })))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [order.id])

  const cancelledValue = useMemo(() => {
    if (mode === 'order') return items.filter(i => i.production_stage !== 'cancelled').reduce((s, i) => s + Number(i.sale_price || 0), 0)
    return items.filter(i => selectedIds.has(i.id)).reduce((s, i) => s + Number(i.sale_price || 0), 0)
  }, [mode, items, selectedIds])

  const collected = Number(order.payment_collected || 0)
  // Refundable = min(collected, cancelledValue) — can't refund more than was collected
  const refundable = Math.min(collected, cancelledValue)
  const refundBalanceAfter = Math.max(0, collected - refundable)
  const remainingDueAfter = (mode === 'order') ? 0 : Math.max(0, (Number(order.total_price || 0) - cancelledValue) - refundBalanceAfter)

  const splitTotal = splits.reduce((s, x) => s + Number(x.amount || 0), 0)
  const splitOk = disposition !== 'original' || Math.abs(splitTotal - refundable) < 0.01
  const reasonOk = reason && (reason !== 'other' || notes)
  const ready = !loading && reasonOk && splitOk && (mode === 'order' || selectedIds.size > 0)

  const toggleItem = (id) => {
    const s = new Set(selectedIds)
    if (s.has(id)) s.delete(id); else s.add(id)
    setSelectedIds(s)
  }
  const updateSplit = (i, patch) => setSplits(splits.map((s, j) => j === i ? { ...s, ...patch } : s))
  const removeSplit = (i) => setSplits(splits.filter((_, j) => j !== i))
  const addSplit = () => setSplits([...splits, { method: 'cash', amount: '', reference: '' }])

  const submit = async () => {
    if (!ready) return
    setConfirming(true)
    try {
      const lineItemIds = mode === 'order' ? [] : Array.from(selectedIds)
      const refund =
        disposition === 'original'     ? { disposition, splits: splits.filter(s => Number(s.amount) > 0).map(s => ({ method: s.method, amount: Number(s.amount), reference: s.reference || null })) } :
        disposition === 'store_credit' ? { disposition, storeCreditAmount: refundable } :
        disposition === 'pending'      ? { disposition, pendingAmount: refundable, pendingMethod } :
                                          { disposition: 'none' }
      await cancelOrder({ orderId: order.id, lineItemIds, reason, notes, refund, writeOff: Number(writeOff || 0), actingUser })
      toast(true, mode === 'order' ? 'Order cancelled' : 'Items cancelled')
      onCancelled?.()
      onClose?.()
    } catch (e) { logAndToast('cancel-order', 'Failed: ' + (e.message || e), e) }
    finally { setConfirming(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col"
        style={{ background: POS_T.surfaceContainerLowest, maxHeight: '95vh' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${POS_T.outlineVariant}` }}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: POS_T.error }}>Cancel order</div>
            <div className="text-base font-bold font-mono" style={{ color: POS_T.onSurface }}>{order.order_number}</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: POS_T.onSurfaceVariant }}><MIcon name="close" size={20} /></button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5 space-y-4" style={{ flex: 1 }}>
          {/* Scope */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: POS_T.onSurfaceVariant }}>What to cancel</div>
            <div className="flex gap-2">
              <PillRadio active={mode === 'order'} onClick={() => setMode('order')} label="Whole order" />
              <PillRadio active={mode === 'line'} onClick={() => setMode('line')} label="Specific items" />
            </div>
            {mode === 'line' && (
              <div className="mt-2 space-y-1.5">
                {items.filter(i => i.production_stage !== 'cancelled').map(i => (
                  <label key={i.id} className="flex items-center justify-between p-2 rounded-lg cursor-pointer"
                    style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <input type="checkbox" checked={selectedIds.has(i.id)} onChange={() => toggleItem(i.id)} />
                      <span className="text-xs truncate" style={{ color: POS_T.onSurface }}>{i.title}</span>
                    </div>
                    <span className="text-xs font-mono" style={{ color: POS_T.onSurface }}>₹{Number(i.sale_price || 0).toLocaleString('en-IN')}</span>
                  </label>
                ))}
                {items.length === 0 && !loading && <div className="text-xs" style={{ color: POS_T.onSurfaceVariant }}>No line items.</div>}
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1" style={{ color: POS_T.onSurfaceVariant }}>Reason *</div>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
              style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
              <option value="">— Select reason —</option>
              {CANCELLATION_REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1" style={{ color: POS_T.onSurfaceVariant }}>Notes {reason === 'other' && '*'}</div>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
              style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
          </div>

          {/* Payment summary */}
          <div className="rounded-lg p-3 text-xs space-y-1" style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
            <Row k="Collected so far" v={collected} />
            <Row k="Cancelled lines' value" v={cancelledValue} />
            <Row k="Refundable" v={refundable} bold />
            {mode === 'line' && <Row k="Order balance after" v={remainingDueAfter} muted />}
          </div>

          {/* Refund disposition */}
          {collected > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: POS_T.onSurfaceVariant }}>Refund disposition</div>
              <div className="space-y-2">
                <DispOption value="original" active={disposition === 'original'} onClick={() => setDisposition('original')}
                  label="Refund to original payment method(s)" />
                <DispOption value="store_credit" active={disposition === 'store_credit'} onClick={() => setDisposition('store_credit')}
                  label={`Issue store credit ₹${refundable.toLocaleString('en-IN')}`} />
                <DispOption value="pending" active={disposition === 'pending'} onClick={() => setDisposition('pending')}
                  label="Mark refund pending (decide later)" />
              </div>

              {disposition === 'original' && (
                <div className="mt-3 space-y-2">
                  {splits.map((s, i) => {
                    const meta = PAYMENT_METHODS.find(m => m.key === s.method) || PAYMENT_METHODS[0]
                    return (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
                        <span className="text-sm">{meta.icon}</span>
                        <select value={s.method} onChange={e => updateSplit(i, { method: e.target.value })}
                          className="text-xs px-1.5 py-1 rounded outline-none font-bold flex-1 min-w-0"
                          style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
                          {PAYMENT_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                        </select>
                        <div className="flex items-center gap-1 px-2 py-1 w-24 flex-shrink-0" style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, borderRadius: 8 }}>
                          <span className="text-xs" style={{ color: POS_T.onSurfaceVariant }}>₹</span>
                          <input type="text" inputMode="decimal" placeholder="0" value={s.amount}
                            onChange={e => updateSplit(i, { amount: e.target.value.replace(/[^0-9.]/g, '') })}
                            className="text-xs bg-transparent outline-none text-right w-full font-mono"
                            style={{ color: POS_T.onSurface }} />
                        </div>
                        <button onClick={() => removeSplit(i)} className="text-xs p-1 flex-shrink-0" style={{ color: POS_T.error }}><MIcon name="close" size={14} /></button>
                      </div>
                    )
                  })}
                  <button onClick={addSplit} className="w-full text-xs font-bold py-2 rounded-lg" style={{ border: `1px dashed ${POS_T.outlineVariant}`, color: POS_T.onSurfaceVariant }}><MIcon name="add" size={14} /> Add method</button>
                  <div className="text-xs flex justify-between px-1" style={{ color: splitOk ? POS_T.success : POS_T.error }}>
                    <span>Refund total</span>
                    <span className="font-mono font-bold">₹{splitTotal.toLocaleString('en-IN')} / ₹{refundable.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              )}

              {disposition === 'pending' && (
                <div className="mt-2">
                  <select value={pendingMethod} onChange={e => setPendingMethod(e.target.value)}
                    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
                    style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
                    <option value="tbd">To be decided</option>
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="card_reversal">Card reversal</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Write-off (optional) */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1" style={{ color: POS_T.onSurfaceVariant }}>Write-off (optional)</div>
            <input type="text" inputMode="decimal" value={writeOff}
              onChange={e => setWriteOff(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="₹ already spent that we can't recover"
              className="w-full text-sm px-2.5 py-2 rounded-lg outline-none font-mono"
              style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
          </div>
        </div>

        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${POS_T.outlineVariant}`, background: POS_T.surfaceContainerLow }}>
          <button onClick={onClose} className="text-sm font-bold px-4 py-2.5 rounded-full" style={{ border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>Close</button>
          <button onClick={submit} disabled={!ready || confirming}
            className="text-sm font-bold px-5 py-2.5 rounded-full inline-flex items-center gap-1.5"
            style={{ background: POS_T.error, color: POS_T.onError, opacity: (!ready || confirming) ? 0.4 : 1 }}>
            <MIcon name="cancel" size={16} />
            {confirming ? 'Cancelling…' : 'Confirm cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

const Row = ({ k, v, bold, muted }) => (
  <div className="flex items-center justify-between" style={{ color: muted ? POS_T.onSurfaceVariant : POS_T.onSurface }}>
    <span>{k}</span>
    <span className="font-mono" style={{ fontWeight: bold ? 700 : 500 }}>₹{Number(v || 0).toLocaleString('en-IN')}</span>
  </div>
)
const PillRadio = ({ active, onClick, label }) => (
  <button onClick={onClick} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{
    background: active ? POS_T.primaryContainer : 'transparent',
    color: active ? POS_T.onPrimary : POS_T.onSurfaceVariant,
    border: `1px solid ${active ? POS_T.primaryContainer : POS_T.outlineVariant}`,
  }}>{label}</button>
)
const DispOption = ({ value, active, onClick, label }) => (
  <button onClick={onClick} className="w-full text-left text-xs font-bold p-2.5 rounded-lg inline-flex items-center gap-2" style={{
    background: active ? POS_T.successContainer : POS_T.surfaceContainerLow,
    color: active ? POS_T.success : POS_T.onSurface,
    border: `1px solid ${active ? POS_T.success : POS_T.outlineVariant}`,
  }}>
    <MIcon name={active ? 'radio_button_checked' : 'radio_button_unchecked'} size={16} />
    {label}
  </button>
)

export default CancelOrderModal

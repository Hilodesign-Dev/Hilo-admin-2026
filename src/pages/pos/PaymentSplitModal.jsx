import React, { useState, useEffect } from 'react'
import { usePaymentMethods } from './usePaymentMethods'
import { POS_T, MIcon } from './tokens'
import { validateGiftCard } from './giftCardActions'

// Helpers for the transaction-date picker.
const todayIso = () => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
const daysBetween = (isoDate) => {
  if (!isoDate) return 0
  const picked = new Date(isoDate + 'T12:00:00')
  const today = new Date(todayIso() + 'T12:00:00')
  return Math.round((today - picked) / (24 * 60 * 60 * 1000))
}

const PaymentSplitModal = ({ total, title = 'Collect Payment', onConfirm, onCancel, allowPartial = true, lockedAmount = null, loyaltyBalance = 0, customer = null, showDatePicker = true }) => {
  const [mode, setMode] = useState('full')   // 'full' | 'partial' | 'later'
  const isPartial = mode === 'partial'
  const payLater = mode === 'later'
  const [collecting, setCollecting] = useState(total)
  const [splits, setSplits] = useState([{ method: 'cash', amount: '' }])
  const [confirming, setConfirming] = useState(false)
  const [gcVerify, setGcVerify] = useState({}) // { rowIndex: { code, pin, balance, error, busy } }
  // Transaction date — when the customer actually paid. User-editable.
  // Defaults to today. The DB stamps a separate immutable posting date
  // (created_at) so back-dating shows up at the top of the Payments tab
  // sorted by entry order.
  const [collectedOn, setCollectedOn] = useState(todayIso())
  const { methods: PAYMENT_METHODS } = usePaymentMethods({ activeOnly: true })

  useEffect(() => {
    if (lockedAmount != null) { setCollecting(lockedAmount); return }
    setCollecting(mode === 'full' ? total : mode === 'partial' ? '' : 0)
    if (mode === 'later') setSplits([{ method: 'cash', amount: '' }])
  }, [mode, total, lockedAmount])

  const splitTotal = splits.reduce((s, x) => s + Number(x.amount || 0), 0)
  const collectingNum = Number(collecting || 0)
  const balance = +(collectingNum - splitTotal).toFixed(2)
  const due = +(total - collectingNum).toFixed(2)
  const ready = payLater ? true : (collectingNum > 0 && Math.abs(balance) < 0.01)

  const addRow = () => {
    // Default the new row to a method not already in the splits, so the
    // user doesn't immediately have to change the dropdown.
    const used = new Set(splits.map(s => s.method))
    const next = PAYMENT_METHODS.find(m => !used.has(m.key))?.key || 'cash'
    setSplits([...splits, { method: next, amount: '' }])
  }
  const removeRow = (i) => setSplits(splits.filter((_, j) => j !== i))
  const updateRow = (i, patch) => setSplits(splits.map((r, j) => j === i ? { ...r, ...patch } : r))

  const confirm = async () => {
    if (!ready) return
    setConfirming(true)
    try {
      await onConfirm({
        collected: payLater ? 0 : collectingNum,
        splits: payLater ? [] : splits
          .filter(s => Number(s.amount || 0) > 0)
          .map(s => ({ method: s.method, amount: Number(s.amount), reference: s.reference || null, gc_pin: s.gc_pin || null, gc_card_id: s.gc_card_id || null })),
        isPartial: payLater ? true : due > 0.01,
        // Transaction date (when the customer paid). The DB stamps its
        // own immutable posting date (created_at) — we don't send it.
        collectedAt: new Date(collectedOn + 'T12:00:00').toISOString(),
        backdateDays: daysBetween(collectedOn),
      })
    } finally { setConfirming(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col mobile-sheet"
        style={{ background: POS_T.surfaceContainerLowest, maxHeight: '95vh', boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}>
        <div className="mobile-sheet-handle sm:hidden" />
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${POS_T.outlineVariant}` }}>
          <div className="flex items-center gap-2">
            <MIcon name="payments" fill size={20} style={{ color: POS_T.primary }} />
            <h3 className="font-bold text-base" style={{ color: POS_T.onSurface }}>{title}</h3>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:opacity-70" style={{ color: POS_T.onSurfaceVariant }}>
            <MIcon name="close" size={20} />
          </button>
        </div>

        <div className="px-5 py-2.5 flex items-center justify-between"
          style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>
          <span className="text-xs font-bold tracking-[0.1em] uppercase">Order Total</span>
          <span className="text-lg font-bold font-mono">₹{Number(total).toLocaleString('en-IN')}</span>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {allowPartial && lockedAmount == null && (
            <div className="flex gap-2 p-0.5 rounded-full mb-5"
              style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
              <button onClick={() => setMode('full')}
                className="flex-1 text-xs font-bold py-2 rounded-full"
                style={{ background: mode === 'full' ? POS_T.primaryContainer : 'transparent', color: mode === 'full' ? POS_T.onPrimary : POS_T.onSurfaceVariant }}>
                Full payment
              </button>
              <button onClick={() => setMode('partial')}
                className="flex-1 text-xs font-bold py-2 rounded-full"
                style={{ background: mode === 'partial' ? POS_T.warning : 'transparent', color: mode === 'partial' ? POS_T.onPrimary : POS_T.onSurfaceVariant }}>
                Partial payment
              </button>
              <button onClick={() => setMode('later')}
                className="flex-1 text-xs font-bold py-2 rounded-full"
                style={{ background: mode === 'later' ? POS_T.error : 'transparent', color: mode === 'later' ? '#fff' : POS_T.onSurfaceVariant }}>
                Pay later
              </button>
            </div>
          )}

          {showDatePicker && (
            <div className="mb-5">
              <label className="text-[10px] font-bold tracking-[0.1em] uppercase mb-1.5 block"
                style={{ color: POS_T.onSurfaceVariant }}>Transaction date · when the customer paid</label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${daysBetween(collectedOn) > 0 ? POS_T.warning : POS_T.outlineVariant}` }}>
                <svg className="w-4 h-4" style={{ color: POS_T.onSurfaceVariant }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <input
                  type="date"
                  value={collectedOn}
                  max={todayIso()}
                  onChange={e => setCollectedOn(e.target.value || todayIso())}
                  className="flex-1 text-sm bg-transparent outline-none font-mono"
                  style={{ color: POS_T.onSurface }}
                />
                <button type="button" onClick={() => setCollectedOn(todayIso())}
                  className="text-[10px] font-bold px-2 py-1 rounded"
                  style={{ background: POS_T.surfaceContainerLowest, color: POS_T.onSurfaceVariant, border: `1px solid ${POS_T.outlineVariant}` }}>
                  Today
                </button>
              </div>
              {daysBetween(collectedOn) > 0 && (
                <div className="mt-1.5 text-[11px] flex items-center gap-1.5" style={{ color: POS_T.warning }}>
                  <span>⚠</span>
                  <span>Back-dated {daysBetween(collectedOn)} day{daysBetween(collectedOn) === 1 ? '' : 's'} — will be saved as unverified and show 'entered late' on the Payments tab.</span>
                </div>
              )}
              <div className="mt-1 text-[10px]" style={{ color: POS_T.onSurfaceVariant }}>
                Posting date is set automatically when you save (locked, used for audit).
              </div>
            </div>
          )}

          {payLater && (
            <div className="mb-5 p-3 rounded-lg" style={{ background: POS_T.warningContainer || '#fef3c7', border: `1px solid ${POS_T.warning}` }}>
              <div className="text-sm font-bold" style={{ color: POS_T.onSurface }}>Payment pending</div>
              <div className="text-xs mt-0.5" style={{ color: POS_T.onSurfaceVariant }}>No payment is being collected now — the full ₹{Number(total).toLocaleString('en-IN')} will be marked as due on this order.</div>
            </div>
          )}
          {!payLater && (<>
          <div className="mb-5">
            <label className="text-[10px] font-bold tracking-[0.1em] uppercase mb-1.5 block"
              style={{ color: POS_T.onSurfaceVariant }}>Amount collecting now</label>
            <div className="flex items-baseline gap-2 px-3 py-2 rounded-lg"
              style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
              <span className="text-xl font-bold" style={{ color: POS_T.onSurfaceVariant }}>₹</span>
              <input type="text" inputMode="decimal" value={collecting}
                disabled={lockedAmount != null || (!isPartial && allowPartial && lockedAmount == null)}
                onChange={e => setCollecting(e.target.value.replace(/[^0-9.]/g, ''))}
                className="text-2xl sm:text-3xl font-bold bg-transparent outline-none flex-1 font-mono"
                style={{ color: POS_T.onSurface }} />
              <span className="text-xs whitespace-nowrap" style={{ color: POS_T.onSurfaceVariant }}>of ₹{Number(total).toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="text-[10px] font-bold tracking-[0.1em] uppercase mb-2"
            style={{ color: POS_T.onSurfaceVariant }}>Split across payment methods</div>
          <div className="space-y-2 mb-4">
            {splits.map((row, i) => {
              // PAYMENT_METHODS can be empty on the first render while the
              // payment_methods table is fetching. Fall back to a stub so we
              // never crash on meta.icon / meta.label downstream.
              const meta = PAYMENT_METHODS.find(m => m.key === row.method)
                || PAYMENT_METHODS[0]
                || { key: row.method, label: row.method || 'Cash', icon: '' }
              const isGc = row.method === 'gift_card'
              const gc = gcVerify[i] || { code: row.reference || '', pin: '', balance: null, error: '', busy: false }
              const verifyGc = async () => {
                setGcVerify(v => ({ ...v, [i]: { ...gc, busy: true, error: '' } }))
                const res = await validateGiftCard(gc.code, gc.pin)
                if (!res.ok) {
                  setGcVerify(v => ({ ...v, [i]: { ...gc, busy: false, balance: null, error: res.reason } }))
                  return
                }
                setGcVerify(v => ({ ...v, [i]: { ...gc, busy: false, balance: res.balance, error: '' } }))
                // Auto-fill row reference + cap amount at min(balance, remaining)
                const remaining = +(collectingNum - splits.reduce((s2, x, j) => j === i ? s2 : s2 + Number(x.amount || 0), 0)).toFixed(2)
                const apply = Math.min(res.balance, Math.max(0, remaining))
                updateRow(i, { reference: gc.code.trim().toUpperCase(), amount: apply, gc_pin: gc.pin, gc_card_id: res.id })
              }
              return (
                <div key={i} className="rounded-lg p-2"
                  style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-base flex-shrink-0">{meta?.icon || ''}</span>
                    <select value={row.method} onChange={e => {
                        const nm = e.target.value
                        updateRow(i, { method: nm, reference: null, amount: nm === 'loyalty_points' ? Math.min(loyaltyBalance, total) : '' })
                        setGcVerify(v => ({ ...v, [i]: undefined }))
                      }}
                      className="text-sm px-2 py-1.5 rounded outline-none font-bold flex-1 min-w-0"
                      style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
                      {PAYMENT_METHODS.map(m => {
                        if (m.key === 'loyalty_points' && loyaltyBalance <= 0) return null
                        return <option key={m.key} value={m.key}>{m.label}</option>
                      })}
                    </select>
                    <div className="flex items-center gap-1 rounded ml-auto px-2 py-1.5 w-28 flex-shrink-0"
                      style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, opacity: isGc && gc.balance == null ? 0.5 : 1 }}>
                      <span className="text-xs" style={{ color: POS_T.onSurfaceVariant }}>₹</span>
                      <input type="text" inputMode="decimal" placeholder="0" value={row.amount}
                        disabled={isGc && gc.balance == null}
                        onChange={e => {
                          let v = Number(e.target.value.replace(/[^0-9.]/g, '') || 0)
                          if (isGc && gc.balance != null) v = Math.min(v, gc.balance)
                          if (row.method === 'loyalty_points') v = Math.min(v, loyaltyBalance)
                          updateRow(i, { amount: v })
                        }}
                        className="text-sm bg-transparent outline-none text-right w-full font-mono"
                        style={{ color: POS_T.onSurface }} />
                    </div>
                    {splits.length > 1 && (
                      <button onClick={() => { removeRow(i); setGcVerify(v => ({ ...v, [i]: undefined })) }} className="text-xs flex-shrink-0 p-1" style={{ color: POS_T.error }}>
                        <MIcon name="close" size={16} />
                      </button>
                    )}
                  </div>
                  {row.method === 'loyalty_points' && (
                    <div className="mt-2 pt-2 text-[11px] flex items-center justify-between"
                      style={{ borderTop: `1px dashed ${POS_T.outlineVariant}`, color: POS_T.onSurfaceVariant }}>
                      <span>{customer?.name || 'Customer'} · Balance: <span className="font-mono font-bold" style={{ color: POS_T.onSurface }}>{loyaltyBalance.toLocaleString('en-IN')} pts</span></span>
                      <span>1 pt = ₹1</span>
                    </div>
                  )}
                  {isGc && (
                    <div className="mt-2 pt-2 grid grid-cols-[1fr_72px_auto] gap-1.5"
                      style={{ borderTop: `1px dashed ${POS_T.outlineVariant}` }}>
                      <input type="text" placeholder="HILO-G-XXXX-XXXX-XXXX"
                        value={gc.code}
                        onChange={e => setGcVerify(v => ({ ...v, [i]: { ...gc, code: e.target.value.toUpperCase(), balance: null, error: '' } }))}
                        className="text-xs px-2 py-1.5 rounded outline-none font-mono tracking-wider"
                        style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
                      <input type="password" placeholder="PIN"
                        value={gc.pin}
                        onChange={e => setGcVerify(v => ({ ...v, [i]: { ...gc, pin: e.target.value.replace(/[^0-9]/g, '').slice(0,4), balance: null, error: '' } }))}
                        className="text-xs px-2 py-1.5 rounded outline-none font-mono tracking-widest text-center"
                        style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
                      <button onClick={verifyGc} disabled={gc.busy || !gc.code || gc.pin.length < 4}
                        className="text-xs font-bold px-3 py-1.5 rounded"
                        style={{ background: gc.balance != null ? POS_T.success : POS_T.primaryContainer, color: POS_T.onPrimary, opacity: gc.busy || !gc.code || gc.pin.length < 4 ? 0.4 : 1 }}>
                        {gc.busy ? '…' : gc.balance != null ? '✓' : 'Verify'}
                      </button>
                      {gc.error && <div className="col-span-3 text-[11px]" style={{ color: POS_T.error }}>{gc.error}</div>}
                      {gc.balance != null && (
                        <div className="col-span-3 text-[11px]" style={{ color: POS_T.success }}>
                          Balance: <span className="font-mono font-bold">₹{Number(gc.balance).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            <button onClick={addRow}
              className="w-full text-xs font-bold py-2.5 rounded-lg inline-flex items-center justify-center gap-1"
              style={{ border: `1px dashed ${POS_T.outlineVariant}`, color: POS_T.onSurfaceVariant }}>
              <MIcon name="add" size={14} />
              Add payment method
            </button>
          </div>
          </>)}

          <div className="p-3 rounded-lg flex items-center justify-between mb-2"
            style={{ background: payLater ? (POS_T.warningContainer || '#fef3c7') : ready ? POS_T.successContainer : POS_T.surfaceContainerLow, border: `1px solid ${payLater ? POS_T.warning : ready ? POS_T.success : POS_T.outlineVariant}` }}>
            <span className="text-xs font-bold" style={{ color: POS_T.onSurface }}>{payLater ? 'Amount due (pending)' : 'Balance remaining'}</span>
            <span className="text-lg font-bold font-mono" style={{ color: payLater ? POS_T.warning : ready ? POS_T.success : POS_T.onSurface }}>
              ₹{(payLater ? Number(total) : Math.abs(balance)).toLocaleString('en-IN')}{!payLater && balance < 0 ? ' (over)' : ''}
            </span>
          </div>
          {!payLater && due > 0.01 && (
            <div className="text-[11px] text-center mt-1 mb-2" style={{ color: POS_T.warning }}>
              Outstanding due on order: ₹{due.toLocaleString('en-IN')}
            </div>
          )}
        </div>

        <div className="px-5 py-3 flex items-center justify-end gap-2 flex-shrink-0"
          style={{ borderTop: `1px solid ${POS_T.outlineVariant}`, background: POS_T.surfaceContainerLow, paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
          <button onClick={onCancel} className="text-sm font-bold px-4 py-2.5 rounded-full"
            style={{ border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>Cancel</button>
          <button onClick={confirm} disabled={!ready || confirming}
            className="text-sm font-bold px-5 py-2.5 rounded-full inline-flex items-center gap-1.5"
            style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary, opacity: (!ready || confirming) ? 0.4 : 1 }}>
            <MIcon name="check" size={16} />
            {confirming ? 'Saving…' : payLater ? 'Save — mark pending' : 'Confirm payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PaymentSplitModal

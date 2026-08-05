import React, { useEffect, useMemo, useState } from 'react'
import { supa } from '../../lib/supabase'
import { C } from '../../lib/designTokens'

/**
 * CashReconTab — month-wise cash-in-hand statement.
 *
 * A month selector sits at the top (defaults to the current month). Stepping
 * back shows that month's statement:
 *
 *   opening   (carried forward from the prior month's closing)
 * + received  (all VERIFIED Cash-method POS payments collected that month;
 *              this keeps changing as staff verify more cash)
 * + cash added (optional manual cash-in)
 * − payouts   (cash paid out — recorded here)
 * = net cash  (closing → becomes next month's opening)
 *
 * The earliest month's opening is seeded once (June 2026 = ₹2,00,000, editable).
 */

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
const mKey = (d) => `${new Date(d).getFullYear()}-${String(new Date(d).getMonth() + 1).padStart(2, '0')}`
const mLabel = (d) => new Date(d).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
const firstOf = (d) => new Date(new Date(d).getFullYear(), new Date(d).getMonth(), 1)
const inr = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`

const isFounder = () => !!window._currentUserIsFounder
const canManage = () => isFounder() || window._currentUserRole === 'admin'

const CashReconTab = () => {
  const [reconRows, setReconRows] = useState([])
  const [cashIn, setCashIn] = useState([])
  const [ledger, setLedger] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(() => firstOf(new Date()))
  const [editSeed, setEditSeed] = useState(null)
  const [entryModal, setEntryModal] = useState(null) // 'out' | 'in' | null

  const load = async () => {
    setLoading(true)
    try {
      const [{ data: rm }, { data: pin }, { data: led }] = await Promise.all([
        supa.from('cash_recon_months').select('*').order('month'),
        supa.from('pos_payments').select('amount, collected_at').eq('method', 'cash').eq('verification_status', 'verified'),
        supa.from('cash_ledger').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }),
      ])
      setReconRows(rm || [])
      setCashIn(pin || [])
      setLedger(led || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const byMonth = useMemo(() => {
    const rec = {}, ins = {}, outs = {}
    cashIn.forEach(p => { if (!p.collected_at) return; const k = mKey(p.collected_at); rec[k] = (rec[k] || 0) + (Number(p.amount) || 0) })
    ledger.forEach(l => {
      if (!l.entry_date) return; const k = mKey(l.entry_date)
      if (l.direction === 'out') outs[k] = (outs[k] || 0) + (Number(l.amount) || 0)
      else ins[k] = (ins[k] || 0) + (Number(l.amount) || 0)
    })
    return { rec, ins, outs }
  }, [cashIn, ledger])

  const seedRow = reconRows[0] || null
  const seedMonth = seedRow ? firstOf(seedRow.month) : firstOf(new Date())

  // Compute the carry-forward chain from the seed month up to the later of
  // (current month, selected month), then index by month key.
  const chain = useMemo(() => {
    if (!reconRows.length) return {}
    const reconByKey = Object.fromEntries(reconRows.map(r => [mKey(r.month), r]))
    const end = firstOf(new Date()) > sel ? firstOf(new Date()) : sel
    const out = {}
    let cursor = new Date(seedMonth)
    let prevClosing = null
    while (cursor <= end) {
      const k = mKey(cursor)
      const rrow = reconByKey[k]
      const received = byMonth.rec[k] || 0
      const cashAdded = byMonth.ins[k] || 0
      const payouts = byMonth.outs[k] || 0
      const opening = (rrow && rrow.opening_is_manual) ? Number(rrow.opening_balance)
                    : (prevClosing != null ? prevClosing : (rrow ? Number(rrow.opening_balance) : 0))
      const closing = opening + received + cashAdded - payouts
      out[k] = { key: k, month: iso(cursor), opening, received, cashAdded, payouts, closing,
        isClosed: !!(rrow && rrow.is_closed), closedBy: rrow?.closed_by_name, isManualOpening: !!(rrow && rrow.opening_is_manual) }
      prevClosing = closing
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
    }
    return out
  }, [reconRows, byMonth, sel, seedMonth])

  const cur = chain[mKey(sel)] || { month: iso(sel), opening: 0, received: 0, cashAdded: 0, payouts: 0, closing: 0, isClosed: false }
  const monthLedger = useMemo(() => ledger.filter(l => l.entry_date && mKey(l.entry_date) === mKey(sel)), [ledger, sel])

  const atSeed = mKey(sel) === mKey(seedMonth)
  const atCurrent = mKey(sel) === mKey(new Date())
  const goPrev = () => { if (!atSeed) setSel(new Date(sel.getFullYear(), sel.getMonth() - 1, 1)) }
  const goNext = () => { if (!atCurrent) setSel(new Date(sel.getFullYear(), sel.getMonth() + 1, 1)) }

  const saveEntry = async ({ amount, category, note, entry_date }) => {
    await supa.from('cash_ledger').insert({
      direction: entryModal, amount: Number(amount), category: category || null, note: note || null,
      entry_date: entry_date || iso(sel),
      created_by_id: window._currentTeamMemberId ? Number(window._currentTeamMemberId) : null,
      created_by_name: window._currentUserName || null,
    })
    setEntryModal(null); load()
  }
  const delEntry = async (id) => {
    if (!canManage()) return
    if (!window.confirm('Delete this entry?')) return
    await supa.from('cash_ledger').delete().eq('id', id); load()
  }

  const closeMonth = async () => {
    if (!canManage()) return
    if (!window.confirm(`Close ${mLabel(sel)}? Net cash ${inr(cur.closing)} carries forward as next month's opening.`)) return
    const next = new Date(sel.getFullYear(), sel.getMonth() + 1, 1)
    await supa.from('cash_recon_months').upsert({
      month: cur.month, is_closed: true, opening_balance: cur.opening, opening_is_manual: cur.isManualOpening,
      closed_by_id: window._currentTeamMemberId ? Number(window._currentTeamMemberId) : null,
      closed_by_name: window._currentUserName || null, closed_at: new Date().toISOString(),
    }, { onConflict: 'month' })
    await supa.from('cash_recon_months').upsert({ month: iso(next), opening_balance: cur.closing, opening_is_manual: true }, { onConflict: 'month', ignoreDuplicates: true })
    load()
  }
  const reopenMonth = async () => {
    if (!isFounder()) return
    if (!window.confirm(`Reopen ${mLabel(sel)}?`)) return
    await supa.from('cash_recon_months').update({ is_closed: false, closed_at: null, closed_by_name: null }).eq('month', cur.month)
    load()
  }
  const saveSeed = async (val) => {
    if (!seedRow) return
    await supa.from('cash_recon_months').update({ opening_balance: Number(val), opening_is_manual: true }).eq('month', seedRow.month)
    setEditSeed(null); load()
  }

  if (loading) return <div className="py-12 text-center text-sm" style={{ color: C.textMuted }}>Loading…</div>

  const Row = ({ label, value, sign, accent, bold, sub }) => (
    <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.borderLight}` }}>
      <div>
        <div className="text-sm" style={{ color: C.text, fontWeight: bold ? 700 : 500 }}>{label}</div>
        {sub && <div className="text-[11px] mt-0.5" style={{ color: C.textMuted }}>{sub}</div>}
      </div>
      <div className="font-mono tabular-nums" style={{ color: accent || C.text, fontWeight: bold ? 700 : 600, fontSize: bold ? 18 : 15 }}>
        {sign || ''}{inr(value)}
      </div>
    </div>
  )

  return (
    <div>
      {/* Month selector */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <button onClick={goPrev} disabled={atSeed}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold"
            style={{ border: `1px solid ${C.border}`, color: atSeed ? C.textLight : C.text, background: '#fff', opacity: atSeed ? 0.5 : 1 }}>‹</button>
          <div className="text-center min-w-[150px]">
            <div className="text-lg font-bold" style={{ color: C.text }}>{mLabel(sel)}</div>
            {cur.isClosed && <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.green }}>Closed{cur.closedBy ? ` · ${String(cur.closedBy).split(' ')[0]}` : ''}</div>}
          </div>
          <button onClick={goNext} disabled={atCurrent}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold"
            style={{ border: `1px solid ${C.border}`, color: atCurrent ? C.textLight : C.text, background: '#fff', opacity: atCurrent ? 0.5 : 1 }}>›</button>
          {!atCurrent && (
            <button onClick={() => setSel(firstOf(new Date()))} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.text }}>This month</button>
          )}
        </div>
        <div className="rounded-xl px-4 py-2 text-right" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Net cash · {mLabel(sel)}</div>
          <div className="text-2xl font-bold font-mono" style={{ color: C.green }}>{inr(cur.closing)}</div>
        </div>
      </div>

      {/* Statement */}
      <div className="rounded-xl overflow-hidden mb-4" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
        <Row label="Opening balance" value={cur.opening}
             sub={atSeed ? 'Seed opening (start of reconciliation)' : "Carried forward from last month's closing"} />
        <Row label="Cash received (verified)" value={cur.received} sign="+" accent={C.green}
             sub="Auto — all verified Cash-method POS payments this month" />
        {cur.cashAdded > 0 && <Row label="Cash added (manual)" value={cur.cashAdded} sign="+" accent={C.green} />}
        <Row label="Payouts" value={cur.payouts} sign="−" accent={C.red}
             sub="Cash paid out this month" />
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: C.bg }}>
          <div className="text-sm font-bold" style={{ color: C.text }}>Net cash (closing)</div>
          <div className="font-mono font-bold tabular-nums" style={{ color: C.green, fontSize: 20 }}>{inr(cur.closing)}</div>
        </div>
      </div>

      {/* Actions */}
      {canManage() && !cur.isClosed && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <button onClick={() => setEntryModal('out')} className="text-xs font-bold px-3 py-2 rounded-lg" style={{ background: C.red, color: '#fff' }}>− Record payout</button>
          <button onClick={() => setEntryModal('in')} className="text-xs font-bold px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.text }}>+ Add cash</button>
          <div className="flex-1" />
          <button onClick={closeMonth} className="text-xs font-bold px-3 py-2 rounded-lg" style={{ background: C.text, color: '#fff' }}>Close month</button>
        </div>
      )}
      {cur.isClosed && isFounder() && (
        <div className="mb-4"><button onClick={reopenMonth} className="text-xs font-bold px-3 py-2 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.red }}>Reopen month</button></div>
      )}

      {/* Manual entries this month */}
      {monthLedger.length > 0 && (
        <div className="rounded-xl overflow-hidden mb-4" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
          <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: C.textMuted, background: C.bg, borderBottom: `1px solid ${C.border}` }}>Payouts &amp; manual entries — {mLabel(sel)}</div>
          {monthLedger.map(l => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-xs" style={{ borderBottom: `1px solid ${C.borderLight}` }}>
              <span className="font-mono" style={{ color: C.textMuted }}>{new Date(l.entry_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: l.direction === 'out' ? C.redBg : C.greenBg, color: l.direction === 'out' ? C.red : C.green }}>{l.direction === 'out' ? 'Payout' : 'Cash added'}</span>
              <span className="truncate" style={{ color: C.text }}>{[l.category, l.note].filter(Boolean).join(' · ') || '—'}</span>
              <span className="ml-auto font-mono font-bold" style={{ color: l.direction === 'out' ? C.red : C.green }}>{l.direction === 'out' ? '−' : '+'}{inr(l.amount)}</span>
              {canManage() && !cur.isClosed && <button onClick={() => delEntry(l.id)} className="text-[10px] font-bold" style={{ color: C.textMuted }}>✕</button>}
            </div>
          ))}
        </div>
      )}

      {/* Seed opening editor (only shown on the seed month) */}
      {atSeed && seedRow && (
        <div className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: C.amberBg, border: `1px solid ${C.border}` }}>
          <div className="text-xs" style={{ color: C.text }}>
            Seed opening — <b>{mLabel(seedRow.month)}</b>: {editSeed == null
              ? <span className="font-mono font-bold">{inr(seedRow.opening_balance)}</span>
              : <input type="number" defaultValue={seedRow.opening_balance} autoFocus onChange={e => setEditSeed(e.target.value)}
                  className="px-2 py-1 rounded text-sm font-mono" style={{ border: `1px solid ${C.border}`, width: 140 }} />}
          </div>
          {canManage() && (editSeed == null
            ? <button onClick={() => setEditSeed(String(seedRow.opening_balance))} className="text-xs font-bold px-3 py-1.5 rounded" style={{ border: `1px solid ${C.border}`, color: C.text }}>Edit</button>
            : <div className="flex gap-2">
                <button onClick={() => setEditSeed(null)} className="text-xs font-bold px-3 py-1.5 rounded" style={{ border: `1px solid ${C.border}`, color: C.textMuted }}>Cancel</button>
                <button onClick={() => saveSeed(editSeed)} className="text-xs font-bold px-3 py-1.5 rounded" style={{ background: C.text, color: '#fff' }}>Save</button>
              </div>)}
        </div>
      )}

      {entryModal && <EntryModal direction={entryModal} month={sel} onConfirm={saveEntry} onCancel={() => setEntryModal(null)} />}
    </div>
  )
}

// EntryModal — record a payout (out) or manual cash (in) for the selected month.
const EntryModal = ({ direction, month, onConfirm, onCancel }) => {
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => {
    const d = new Date(month); const today = new Date()
    // default to today if the selected month is the current month, else the 1st
    return (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth())
      ? today.toISOString().slice(0, 10) : iso(d).slice(0, 10)
  })
  const valid = Number(amount) > 0
  const isOut = direction === 'out'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: '#fff' }} onClick={e => e.stopPropagation()}>
        <div className="text-base font-bold mb-1" style={{ color: C.text }}>{isOut ? 'Record payout' : 'Add cash'}</div>
        <div className="text-xs mb-3" style={{ color: C.textMuted }}>{mLabel(month)}</div>
        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Amount (₹)</label>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} autoFocus
          className="w-full mb-3 px-3 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${C.border}` }} placeholder="0" />
        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${C.border}` }} />
        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Category</label>
        <input value={category} onChange={e => setCategory(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${C.border}` }} placeholder={isOut ? 'e.g. Bank deposit, Petty expense' : 'e.g. Cash injection'} />
        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Note</label>
        <input value={note} onChange={e => setNote(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${C.border}` }} placeholder="Optional" />
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 text-sm font-bold py-2 rounded-lg" style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}` }}>Cancel</button>
          <button disabled={!valid} onClick={() => onConfirm({ amount, category, note, entry_date: date })}
            className="flex-1 text-sm font-bold py-2 rounded-lg" style={{ background: valid ? (isOut ? C.red : C.text) : C.border, color: '#fff', opacity: valid ? 1 : 0.6 }}>Save</button>
        </div>
      </div>
    </div>
  )
}

export default CashReconTab

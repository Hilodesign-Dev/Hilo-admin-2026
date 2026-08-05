import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import AddReceiptModal from './AddReceiptModal'

const fmtINR     = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
const fmtINRShort = (n) => {
  const x = Number(n || 0)
  if (x >= 10000000) return '₹' + (x / 10000000).toFixed(2).replace(/\.00$/, '') + ' Cr'
  if (x >= 100000)   return '₹' + (x / 100000).toFixed(2).replace(/\.00$/, '') + ' L'
  return '₹' + x.toLocaleString('en-IN')
}
const fmtDate     = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtDateShort = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'
const daysBetween = (a, b) => Math.round((new Date(a) - new Date(b)) / (1000 * 60 * 60 * 24))

/* FranchiseReceipts — redesigned for clarity.
   1. Hero block: single big number telling the story.
   2. Up-Next callout: what's due / overdue, tinted by urgency.
   3. Payment schedule: 5-up tranche cards, each tells its own state.
   4. Receipt log: clean transaction list. */

export default function FranchiseReceipts({ franchise, onChange, user, publicView = false }) {
  const [tranches, setTranches] = useState([])
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const [t, r] = await Promise.all([
      supa.from('franchise_tranches').select('*').eq('franchise_id', franchise.id).order('tranche_no'),
      supa.from('franchise_receipts').select('*').eq('franchise_id', franchise.id).order('received_on', { ascending: true }),
    ])
    setTranches(t.data || [])
    setReceipts(r.data || [])
    setLoading(false)
  }, [franchise.id])

  useEffect(() => { reload() }, [reload])

  // Waterfall: cumulative receipts fill T0 first, then T1, then T2…
  const computed = useMemo(() => {
    const committed     = Number(franchise.total_committed || 0)
    const totalReceived = receipts.reduce((s, r) => s + Number(r.amount || 0), 0)
    const pending       = Math.max(0, committed - totalReceived)
    const pctReceived   = committed > 0 ? (totalReceived / committed) * 100 : 0

    let pool = totalReceived
    const trancheReceived = {}
    for (const t of tranches) {
      const needed = Number(t.total_amount || 0)
      const got = Math.min(pool, needed)
      trancheReceived[t.id] = got
      pool -= got
    }
    const completedTranches = tranches.filter(t => (trancheReceived[t.id] || 0) >= Number(t.total_amount || 0)).length
    const today = new Date()
    const nextTranche = tranches.find(t => (trancheReceived[t.id] || 0) < Number(t.total_amount || 0))
    const nextDueDays = nextTranche ? daysBetween(nextTranche.due_date, today) : null
    const nextOutstanding = nextTranche ? Number(nextTranche.total_amount) - (trancheReceived[nextTranche.id] || 0) : 0

    return { committed, totalReceived, pending, pctReceived, trancheReceived, completedTranches, nextTranche, nextDueDays, nextOutstanding }
  }, [franchise, receipts, tranches])

  if (loading) return <div className="text-sm text-gray-400 py-8">Loading…</div>

  const isOverdue = computed.nextDueDays != null && computed.nextDueDays < 0
  const isDueSoon = computed.nextDueDays != null && computed.nextDueDays >= 0 && computed.nextDueDays <= 14

  return (
    <div className="space-y-5">
      {/* ─── 1. HERO BLOCK ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-3xl p-8 sm:p-10">
        <div className="text-center max-w-2xl mx-auto">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">
            Total Investment Received
          </div>
          <div className="mt-4 flex items-baseline justify-center gap-3 flex-wrap">
            <span className="text-5xl sm:text-6xl font-extrabold text-gray-900 tracking-tight">{fmtINR(computed.totalReceived)}</span>
            <span className="text-lg text-gray-400">of {fmtINR(computed.committed)}</span>
          </div>
          <div className="mt-6 max-w-lg mx-auto">
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{
                width: `${Math.min(100, computed.pctReceived)}%`,
                background: 'linear-gradient(90deg, #c9a432 0%, #b88f1e 100%)',
              }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="font-bold text-amber-700">{computed.pctReceived.toFixed(1)}% received</span>
              <span className="text-gray-500">{fmtINR(computed.pending)} pending across {tranches.length - computed.completedTranches} more {tranches.length - computed.completedTranches === 1 ? 'instalment' : 'instalments'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 2. UP NEXT — urgency callout ────────────────────────────────── */}
      {computed.nextTranche ? (
        <UpNextBlock
          tranche={computed.nextTranche}
          outstanding={computed.nextOutstanding}
          daysDue={computed.nextDueDays}
          isOverdue={isOverdue}
          isDueSoon={isDueSoon}
        />
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
          </div>
          <div>
            <div className="text-sm font-bold text-green-800">All settled</div>
            <div className="text-xs text-green-700 mt-0.5">Total investment received in full. Nothing pending.</div>
          </div>
        </div>
      )}

      {/* ─── 3. PAYMENT SCHEDULE — 5-up tranche cards ────────────────────── */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400 mb-3 px-1">
          Payment Schedule
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {tranches.map(t => (
            <TrancheCard
              key={t.id}
              tranche={t}
              received={computed.trancheReceived[t.id] || 0}
              isNext={computed.nextTranche?.id === t.id}
            />
          ))}
        </div>
      </div>

      {/* ─── 4. RECEIPT LOG ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-500">Receipt Log</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {receipts.length} {receipts.length === 1 ? 'receipt' : 'receipts'} · totalling {fmtINR(computed.totalReceived)}
            </div>
          </div>
          {!publicView && (
            <button onClick={() => setShowAdd(true)} className="text-xs px-3 py-1.5 rounded-lg font-bold transition-transform hover:scale-105"
              style={{ background: '#c9a432', color: '#fff' }}>+ Add Receipt</button>
          )}
        </div>
        {receipts.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">No receipts yet</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
                <th className="px-5 py-2.5">Date</th>
                <th className="px-3 py-2.5">Method</th>
                <th className="px-3 py-2.5">Reference</th>
                <th className="px-5 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {receipts.slice().sort((a, b) => new Date(b.received_on) - new Date(a.received_on)).map(r => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-amber-50/30">
                  <td className="px-5 py-3 text-gray-700">{fmtDate(r.received_on)}</td>
                  <td className="px-3 py-3 text-gray-700 capitalize">{(r.method || '').replace(/_/g, ' ') || '—'}</td>
                  <td className="px-3 py-3 font-mono text-[11px] text-gray-600">{r.reference || '—'}</td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-green-700">{fmtINR(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Share link (internal only) */}
      {!publicView && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs font-semibold text-gray-700">Share with franchisee</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Read-only public statement</div>
          </div>
          <div className="flex items-center gap-2">
            <input readOnly value={`${window.location.origin}/#/f/${franchise.share_token}`}
              className="text-xs font-mono px-3 py-2 rounded-lg border border-gray-200 bg-white w-72"
              onFocus={e => e.target.select()} />
            <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/#/f/${franchise.share_token}`)}
              className="text-xs px-3 py-2 rounded-lg font-bold" style={{ background: '#1b1c1a', color: '#fff' }}>Copy</button>
          </div>
        </div>
      )}

      {showAdd && (
        <AddReceiptModal
          franchise={franchise}
          user={user}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); reload(); onChange && onChange() }}
        />
      )}
    </div>
  )
}

/* Up Next — single big callout, tinted red for overdue, amber for due-soon, blue otherwise. */
function UpNextBlock({ tranche, outstanding, daysDue, isOverdue, isDueSoon }) {
  const tone = isOverdue
    ? { bg: '#fef2f2', border: '#fecaca', iconBg: '#fee2e2', iconFg: '#dc2626', titleColor: '#991b1b', label: 'Overdue', sub: `${-daysDue} ${-daysDue === 1 ? 'day' : 'days'} overdue` }
    : isDueSoon
      ? { bg: '#fef3c7', border: '#fde68a', iconBg: '#fef3c7', iconFg: '#d97706', titleColor: '#92400e', label: 'Due soon', sub: daysDue === 0 ? 'Due today' : `Due in ${daysDue} ${daysDue === 1 ? 'day' : 'days'}` }
      : { bg: '#eff6ff', border: '#bfdbfe', iconBg: '#dbeafe', iconFg: '#1d4ed8', titleColor: '#1e40af', label: 'Upcoming', sub: `Due in ${daysDue} days` }

  return (
    <div className="rounded-2xl p-5 flex items-center gap-4 border" style={{ background: tone.bg, borderColor: tone.border }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: tone.iconBg, color: tone.iconFg }}>
        {isOverdue ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: tone.iconFg }}>
          Up next · {tone.label}
        </div>
        <div className="text-base sm:text-lg font-bold mt-0.5 truncate" style={{ color: tone.titleColor }}>
          {tranche.label || `T${tranche.tranche_no}`} — {fmtINR(outstanding)} due {fmtDate(tranche.due_date)}
        </div>
        <div className="text-xs mt-0.5" style={{ color: tone.titleColor, opacity: 0.85 }}>
          {tone.sub}
        </div>
      </div>
    </div>
  )
}

/* Tranche card — 5-up grid. Self-contained state visual. */
function TrancheCard({ tranche, received, isNext }) {
  const expected = Number(tranche.total_amount || 0)
  const pending  = Math.max(0, expected - received)
  const done     = pending === 0
  const partial  = received > 0 && !done
  const days     = daysBetween(tranche.due_date, new Date())
  const overdue  = !done && days < 0
  const pct      = expected > 0 ? (received / expected) * 100 : 0

  const style = done
    ? { bg: '#f0fdf4', border: '#bbf7d0', dot: '#16a34a', label: 'Paid',     labelColor: '#15803d' }
    : overdue
      ? { bg: '#fef2f2', border: '#fecaca', dot: '#dc2626', label: 'Overdue', labelColor: '#991b1b' }
      : partial
        ? { bg: '#fffbeb', border: '#fde68a', dot: '#c9a432', label: 'Partial', labelColor: '#92400e' }
        : isNext
          ? { bg: '#fff7ed', border: '#fed7aa', dot: '#c9a432', label: `In ${days}d`, labelColor: '#92400e' }
          : { bg: '#ffffff', border: '#e5e7eb', dot: '#d1d5db', label: days >= 0 ? `In ${days}d` : 'Scheduled', labelColor: '#6b7280' }

  return (
    <div className="rounded-2xl p-4 border transition-all hover:shadow-sm" style={{ background: style.bg, borderColor: style.border }}>
      {/* Status dot + label */}
      <div className="flex items-center justify-between">
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: style.dot }}>
          {done && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
          {partial && <span className="text-white text-[11px] font-bold leading-none">{Math.round(pct)}%</span>}
          {overdue && <span className="text-white text-[11px] font-bold leading-none">!</span>}
        </div>
        <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: style.labelColor }}>
          {style.label}
        </span>
      </div>

      {/* Tranche label */}
      <div className="mt-3 text-sm font-bold text-gray-900">
        {tranche.label || `T${tranche.tranche_no}`}
      </div>
      <div className="text-[10px] text-gray-500">Due {fmtDateShort(tranche.due_date)}</div>

      {/* Amounts */}
      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'rgba(0,0,0,0.05)' }}>
        {done ? (
          <>
            <div className="text-base font-bold font-mono text-gray-900">{fmtINR(expected)}</div>
            <div className="text-[10px] text-gray-500">paid in full</div>
          </>
        ) : partial ? (
          <>
            <div className="text-base font-bold font-mono text-gray-900">{fmtINR(pending)}</div>
            <div className="text-[10px] text-gray-500">pending of {fmtINR(expected)}</div>
          </>
        ) : (
          <>
            <div className="text-base font-bold font-mono text-gray-900">{fmtINR(expected)}</div>
            <div className="text-[10px] text-gray-500">to receive</div>
          </>
        )}
      </div>
    </div>
  )
}

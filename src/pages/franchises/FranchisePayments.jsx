import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import AddPaymentModal from './AddPaymentModal'

const fmtINR  = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/* FranchisePayments — INTERNAL view (not shared with franchisee).
   Tracks where the received money is going. Per-category cards on top
   show received vs spent vs remaining. Below: full payment log with
   subcategory + payee + invoice link. */

export default function FranchisePayments({ franchise, onChange, user }) {
  const [categories, setCategories] = useState([])
  const [receipts, setReceipts]     = useState([])
  const [payments, setPayments]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [showAdd, setShowAdd]       = useState(false)
  const [prefillCategoryId, setPrefillCategoryId] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const [c, r, d] = await Promise.all([
      supa.from('franchise_categories').select('*').eq('franchise_id', franchise.id).order('sort_order'),
      supa.from('franchise_receipts').select('id, amount').eq('franchise_id', franchise.id),
      supa.from('franchise_disbursements').select('*').eq('franchise_id', franchise.id).order('paid_on', { ascending: false }),
    ])
    setCategories(c.data || [])
    setReceipts(r.data || [])
    setPayments(d.data || [])
    setLoading(false)
  }, [franchise.id])

  useEffect(() => { reload() }, [reload])

  // Waterfall the total received into each category in declared order.
  // (Same logic the franchisee sees on Receipts — keeps the two tabs consistent.)
  const computed = useMemo(() => {
    const totalReceived = receipts.reduce((s, r) => s + Number(r.amount || 0), 0)
    const totalSpent    = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
    const held          = totalReceived - totalSpent

    let pool = totalReceived
    const categoryReceived = {}
    for (const c of categories) {
      const needed = Number(c.total_committed || 0)
      const got = Math.min(pool, needed)
      categoryReceived[c.id] = got
      pool -= got
    }

    // Spend rollups + subcategory breakdown per category
    const categorySpent = {}
    const categorySubcat = {}   // { [category_id]: { [subcat]: { amount, count, payments[] } } }
    payments.forEach(p => {
      if (!p.category_id) return
      categorySpent[p.category_id] = (categorySpent[p.category_id] || 0) + Number(p.amount || 0)
      const sub = (p.subcategory || 'Uncategorised').trim() || 'Uncategorised'
      categorySubcat[p.category_id] = categorySubcat[p.category_id] || {}
      const slot = categorySubcat[p.category_id][sub] = categorySubcat[p.category_id][sub] || { amount: 0, count: 0, payments: [] }
      slot.amount += Number(p.amount || 0)
      slot.count  += 1
      slot.payments.push(p)
    })

    return { totalReceived, totalSpent, held, categoryReceived, categorySpent, categorySubcat }
  }, [categories, receipts, payments])

  const startAdd = (categoryId = null) => {
    setPrefillCategoryId(categoryId)
    setShowAdd(true)
  }

  if (loading) return <div className="text-sm text-gray-400 py-8">Loading…</div>

  return (
    <div className="space-y-5">
      {/* ── Header strip ──────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-7">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:divide-x sm:divide-gray-100">
          <HeaderStat label="Received from franchisee"   value={fmtINR(computed.totalReceived)} sub={`${receipts.length} receipts`}        tone="green" />
          <HeaderStat label="Paid out by Hilo"            value={fmtINR(computed.totalSpent)}    sub={`${payments.length} payments`}        tone="red" />
          <HeaderStat label="Held by Hilo (unspent)"     value={fmtINR(computed.held)}          sub="received minus paid out"              tone="amber" />
        </div>
      </div>

      {/* ── By category cards ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">Where the money is going</div>
            <div className="text-xs text-gray-500 mt-0.5">Each bucket shows allocated vs spent, with sub-category breakdown</div>
          </div>
          <button onClick={() => startAdd()} className="text-xs px-3 py-1.5 rounded-lg font-bold transition-transform hover:scale-105"
            style={{ background: '#c9a432', color: '#fff' }}>+ Add Payment</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {categories.map(c => (
            <CategoryCard
              key={c.id}
              category={c}
              received={computed.categoryReceived[c.id] || 0}
              spent={computed.categorySpent[c.id] || 0}
              subcategories={computed.categorySubcat[c.id] || {}}
              onAddPayment={() => startAdd(c.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Full payment log ──────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-500">Payment Log</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {payments.length} {payments.length === 1 ? 'payment' : 'payments'} · totalling {fmtINR(computed.totalSpent)}
          </div>
        </div>
        {payments.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">
            <div>No payments logged yet.</div>
            <div className="text-xs mt-1">All received money is still with Hilo.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
                <th className="px-5 py-2.5">Date</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Sub-category</th>
                <th className="px-3 py-2.5">Payee</th>
                <th className="px-3 py-2.5">Method</th>
                <th className="px-3 py-2.5">Invoice</th>
                <th className="px-5 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const cat = categories.find(c => c.id === p.category_id)
                return (
                  <tr key={p.id} className="border-t border-gray-100 hover:bg-amber-50/30">
                    <td className="px-5 py-2.5 text-gray-700">{fmtDate(p.paid_on)}</td>
                    <td className="px-3 py-2.5"><CategoryPill name={cat?.name || '—'} /></td>
                    <td className="px-3 py-2.5 text-gray-700 text-xs">{p.subcategory || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-800 text-xs font-medium">{p.payee_name}</td>
                    <td className="px-3 py-2.5 text-gray-700 text-xs capitalize">{(p.method || '').replace(/_/g, ' ') || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {p.invoice_url ? (
                        <a href={p.invoice_url} target="_blank" rel="noopener" className="text-amber-700 hover:underline flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                          View
                        </a>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono font-semibold text-red-700">{fmtINR(p.amount)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <AddPaymentModal
          franchise={franchise}
          categories={categories}
          previousPayments={payments}
          prefillCategoryId={prefillCategoryId}
          user={user}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); reload(); onChange && onChange() }}
        />
      )}
    </div>
  )
}

/* Header stat — used in the top strip */
function HeaderStat({ label, value, sub, tone = 'gray' }) {
  const tones = { green: '#15803d', amber: '#92400e', red: '#991b1b', gray: '#374151' }
  return (
    <div className="px-5 first:pl-0 last:pr-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">{label}</div>
      <div className="text-2xl sm:text-3xl font-extrabold mt-1.5" style={{ color: tones[tone] }}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>
    </div>
  )
}

/* Per-category card — received vs spent + sub-category roll-up */
function CategoryCard({ category, received, spent, subcategories, onAddPayment }) {
  const allocated = Number(category.total_committed || 0)
  const available = received - spent
  const spendPct  = received > 0 ? (spent / received) * 100 : 0
  const subEntries = Object.entries(subcategories).sort((a, b) => b[1].amount - a[1].amount)

  // Status pill: how much of received has been spent
  const status = received === 0 ? { label: 'Not yet funded', tone: 'gray' }
              : spent === 0    ? { label: 'Funded · unspent', tone: 'blue' }
              : spendPct >= 100 ? { label: 'Spent', tone: 'red' }
              : { label: `${Math.round(spendPct)}% spent`, tone: 'amber' }

  const flagsLabel = [category.is_refundable && 'Refundable', category.is_pass_through && 'Pass-through'].filter(Boolean).join(' · ')

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold text-gray-900">{category.name}</div>
          {flagsLabel && <div className="text-[10px] text-gray-500 mt-0.5">{flagsLabel}</div>}
        </div>
        <StatusPill {...status} />
      </div>

      {/* Money grid */}
      <div className="px-5 py-3 grid grid-cols-3 gap-2 text-center" style={{ borderBottom: '1px solid #f3f4f6' }}>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-400">Received</div>
          <div className="font-mono text-sm font-bold text-green-700 mt-0.5">{fmtINR(received)}</div>
          <div className="text-[9px] text-gray-400">of {fmtINR(allocated)}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-400">Paid out</div>
          <div className="font-mono text-sm font-bold text-red-700 mt-0.5">{fmtINR(spent)}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-gray-400">Available</div>
          <div className="font-mono text-sm font-bold text-amber-700 mt-0.5">{fmtINR(available)}</div>
        </div>
      </div>

      {/* Spend progress */}
      {received > 0 && (
        <div className="px-5 py-3" style={{ borderBottom: subEntries.length > 0 ? '1px solid #f3f4f6' : 'none' }}>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full transition-all" style={{
              width: `${Math.min(100, spendPct)}%`,
              background: spendPct >= 100 ? '#dc2626' : '#c9a432',
            }} />
          </div>
        </div>
      )}

      {/* Sub-category breakdown */}
      {subEntries.length > 0 && (
        <div className="px-5 py-3" style={{ borderBottom: '1px solid #f3f4f6' }}>
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400 mb-2">By sub-category</div>
          <div className="space-y-1.5">
            {subEntries.slice(0, 5).map(([sub, info]) => {
              const pct = spent > 0 ? (info.amount / spent) * 100 : 0
              return (
                <div key={sub}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-700">{sub} <span className="text-gray-400">· {info.count}</span></span>
                    <span className="font-mono font-semibold text-gray-800">{fmtINR(info.amount)}</span>
                  </div>
                  <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {subEntries.length > 5 && (
              <div className="text-[10px] text-gray-400 pt-1">…and {subEntries.length - 5} more</div>
            )}
          </div>
        </div>
      )}

      {/* Add payment to this bucket */}
      <button
        onClick={onAddPayment}
        className="w-full px-5 py-2.5 text-xs font-bold text-gray-600 hover:text-amber-700 hover:bg-amber-50/50 transition-colors flex items-center justify-center gap-1"
      >
        + Add payment to {category.name}
      </button>
    </div>
  )
}

function StatusPill({ label, tone = 'gray' }) {
  const tones = {
    gray:  'bg-gray-100 text-gray-600',
    blue:  'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    red:   'bg-red-100 text-red-700',
    green: 'bg-green-100 text-green-700',
  }
  return <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider whitespace-nowrap ${tones[tone]}`}>{label}</span>
}

function CategoryPill({ name }) {
  return <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700">{name}</span>
}

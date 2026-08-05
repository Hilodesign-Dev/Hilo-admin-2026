/* ═══════════════════════════════════════════════════════════════════════════
   STYLIST ACTIVITY — what each stylist DID (effort), not just outcomes.
   Sources: lead_interactions (calls/follow-ups) + leads.created_by + status.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useEffect } from 'react'
import { C } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { filterStylists } from '../../lib/helpers'

const p2 = (x) => String(x).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

// Fields that make a "complete" lead — used to score data-entry discipline
const COMPLETE_FIELDS = ['client_name', 'phone', 'occasion', 'occasion_date', 'products_interested', 'lead_source', 'lead_quality', 'country']
const completeness = (l) => {
  let filled = 0
  COMPLETE_FIELDS.forEach(f => { const v = l[f]; if (v !== null && v !== undefined && String(v).trim() !== '') filled++ })
  return Math.round(filled / COMPLETE_FIELDS.length * 100)
}

const KpiCard = ({ label, value, color = C.gold, sub }) => (
  <div className="rounded-xl p-3 sm:p-4" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
    <div className="text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted, letterSpacing: '0.05em' }}>{label}</div>
    <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    {sub && <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>{sub}</div>}
  </div>
)

export const ActivityView = ({ leads = [], teamMembers = [] }) => {
  const todayStr = ymd(new Date())
  const [range, setRange] = useState({ from: todayStr, to: todayStr, preset: 'today' })
  const [interactions, setInteractions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStylist, setFilterStylist] = useState('')

  // Lookups
  const byEmail = useMemo(() => Object.fromEntries(teamMembers.filter(t => t.email).map(t => [t.email.toLowerCase(), t])), [teamMembers])
  const byNameLower = useMemo(() => Object.fromEntries(teamMembers.filter(t => t.name).map(t => [t.name.toLowerCase(), t])), [teamMembers])
  const leadById = useMemo(() => Object.fromEntries(leads.map(l => [l.id, l])), [leads])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data } = await supa.from('lead_interactions')
        .select('lead_id, contacted_by, contacted_by_name, interaction_type, outcome, created_at')
        .gte('created_at', range.from + 'T00:00:00').lte('created_at', range.to + 'T23:59:59')
      if (!cancelled) { setInteractions(data || []); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [range.from, range.to])

  const setPreset = (k) => {
    const t = new Date()
    if (k === 'today') setRange({ from: ymd(t), to: ymd(t), preset: k })
    else if (k === 'yesterday') { const y = new Date(t); y.setDate(t.getDate() - 1); setRange({ from: ymd(y), to: ymd(y), preset: k }) }
    else if (k === 'week') { const d = t.getDay(); const mon = new Date(t); mon.setDate(t.getDate() - (d === 0 ? 6 : d - 1)); setRange({ from: ymd(mon), to: ymd(t), preset: k }) }
    else if (k === 'month') setRange({ from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(t), preset: k })
  }

  // Resolve an interaction to a team member (by email, then name)
  const resolveTM = (i) => (i.contacted_by && byEmail[String(i.contacted_by).toLowerCase()]) || (i.contacted_by_name && byNameLower[String(i.contacted_by_name).toLowerCase()]) || null

  const rows = useMemo(() => {
    const map = {}
    const ensure = (key, name) => { if (!map[key]) map[key] = { key, name, added: 0, complSum: 0, complN: 0, activities: 0, touched: new Set(), converted: 0, hqTouched: new Set(), toCloseTouched: new Set(), outcomes: {} }; return map[key] }

    // Leads added (by created_by email) in range
    leads.forEach(l => {
      const d = (l.created_at || l.lead_date || '').split('T')[0]
      if (!d || d < range.from || d > range.to) return
      const tm = l.created_by ? byEmail[String(l.created_by).toLowerCase()] : null
      const key = tm ? String(tm.id) : (l.created_by || 'unknown')
      const r = ensure(key, tm?.name || l.created_by || 'Unknown')
      r.added++; r.complSum += completeness(l); r.complN++
    })

    // Activities (interactions) in range
    interactions.forEach(i => {
      const tm = resolveTM(i)
      const key = tm ? String(tm.id) : (i.contacted_by_name || i.contacted_by || 'Unknown')
      const r = ensure(key, tm?.name || i.contacted_by_name || 'Unknown')
      r.activities++
      if (i.lead_id) r.touched.add(i.lead_id)
      const oc = i.outcome || i.interaction_type || 'Logged'
      r.outcomes[oc] = (r.outcomes[oc] || 0) + 1
      if (oc === 'Converted') r.converted++
      const lead = i.lead_id ? leadById[i.lead_id] : null
      if (lead) {
        if (lead.lead_quality === 'High Quality') r.hqTouched.add(i.lead_id)
        if (lead.status === 'To be Closed') r.toCloseTouched.add(i.lead_id)
      }
    })

    return Object.values(map).map(r => ({
      ...r,
      completeness: r.complN ? Math.round(r.complSum / r.complN) : 0,
      touchedCount: r.touched.size,
      hqCount: r.hqTouched.size,
      toCloseCount: r.toCloseTouched.size,
    })).sort((a, b) => (b.activities + b.added) - (a.activities + a.added))
  }, [leads, interactions, range, byEmail, byNameLower, leadById])

  const displayRows = useMemo(() => filterStylist ? rows.filter(r => String(r.key) === String(filterStylist)) : rows, [rows, filterStylist])
  const totals = useMemo(() => displayRows.reduce((t, r) => ({
    added: t.added + r.added, activities: t.activities + r.activities, touched: t.touched + r.touchedCount, converted: t.converted + r.converted,
    complSum: t.complSum + r.complSum, complN: t.complN + r.complN,
  }), { added: 0, activities: 0, touched: 0, converted: 0, complSum: 0, complN: 0 }), [displayRows])

  const input = { background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[{ k: 'today', l: 'Today' }, { k: 'yesterday', l: 'Yesterday' }, { k: 'week', l: 'This Week' }, { k: 'month', l: 'This Month' }].map(p => (
          <button key={p.k} onClick={() => setPreset(p.k)} className="text-xs font-bold px-3 py-1.5 rounded-lg"
            style={{ background: range.preset === p.k ? C.gold : C.cardBg, color: range.preset === p.k ? '#fff' : C.textMuted, border: `1px solid ${C.border}` }}>{p.l}</button>
        ))}
        <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value, preset: 'custom' }))} className="text-sm px-2 py-1.5 rounded-lg outline-none" style={input} />
        <span style={{ color: C.textMuted }}>→</span>
        <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value, preset: 'custom' }))} className="text-sm px-2 py-1.5 rounded-lg outline-none" style={input} />
        <select value={filterStylist} onChange={e => setFilterStylist(e.target.value)} className="text-sm px-2 py-1.5 rounded-lg outline-none ml-auto" style={input}>
          <option value="">All stylists</option>
          {filterStylists(teamMembers).map(tm => <option key={tm.id} value={String(tm.id)}>{tm.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 mb-4">
        <KpiCard label="Leads Added" value={totals.added} />
        <KpiCard label="Activities" value={totals.activities} color="#2563eb" sub="calls / follow-ups logged" />
        <KpiCard label="Leads Worked" value={totals.touched} color="#7c3aed" />
        <KpiCard label="Converted" value={totals.converted} color="#16a34a" />
        <KpiCard label="Avg Data %" value={`${totals.complN ? Math.round(totals.complSum / totals.complN) : 0}%`} color={C.gold} sub="on leads they added" />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.cardBg }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}` }}>
          <h3 className="font-bold text-sm" style={{ color: C.text }}>Stylist activity</h3>
          <span className="text-xs" style={{ color: C.textMuted }}>{loading ? 'Loading…' : `${displayRows.length} people`}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ minWidth: 760 }}>
            <thead><tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              {['Stylist', 'Leads Added', 'Data %', 'Activities', 'Leads Worked', 'HQ Worked', 'To-Close Worked', 'Converted'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {displayRows.map((r, idx) => (
                <tr key={r.key} style={{ borderBottom: idx < displayRows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <td className="px-3 py-2.5 font-bold" style={{ color: C.text }}>{r.name}</td>
                  <td className="px-3 py-2.5" style={{ color: C.text }}>{r.added}</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: r.completeness >= 70 ? '#16a34a' : r.completeness >= 40 ? '#d97706' : '#dc2626' }}>{r.completeness}%</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: '#2563eb' }}>{r.activities}</td>
                  <td className="px-3 py-2.5" style={{ color: '#7c3aed' }}>{r.touchedCount}</td>
                  <td className="px-3 py-2.5" style={{ color: '#7c3aed' }}>{r.hqCount}</td>
                  <td className="px-3 py-2.5" style={{ color: '#d97706' }}>{r.toCloseCount}</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: '#16a34a' }}>{r.converted}</td>
                </tr>
              ))}
              {displayRows.length === 0 && !loading && <tr><td colSpan={8} className="px-4 py-6 text-center text-sm" style={{ color: C.textMuted }}>No activity in this range</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-[11px] mt-2" style={{ color: C.textLight }}>
        Data % = share of key fields filled (name, phone, occasion, event date, products, source, quality, country) on the leads they added.
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   STORE APPOINTMENTS VIEW — register of booked store visits.
   Tabs: Focus (overdue+today+tomorrow) · Next 30 days · Future months.
   Booked-by (assist_stylist ?? stylist ?? assigned_to) & Owner (stylist ?? assigned_to)
   editable inline. Appt date = follow_up_date. Click column headers to sort.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo } from 'react'
import { C, toast } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { QUALIFIED_STATUSES } from './constants'
import { filterStylists } from '../../lib/helpers'
import { useIsMobile } from './useIsMobile'

const DEFAULT_STORE = 'Jubilee Hills Store'
const KNOWN_STORES = ['Jubilee Hills Store', 'Banjara Hills Store', 'Bangalore Store']
const APPT_STATUSES = ['Store Visit Booked', 'Store visit follow-up']
const isAppt = (l) => APPT_STATUSES.includes(l.status)
const nn = (x) => (x != null && String(x).trim() !== '') ? String(x).trim() : ''
const assistOf = (l) => nn(l.assist_stylist) || nn(l.stylist) || nn(l.assigned_to)
const ownerOf  = (l) => nn(l.stylist) || nn(l.assigned_to)
const fmtDate = (d) => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? '—' : x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const OUTCOME = {
  visited: { label: 'Visited', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
  no_show: { label: 'No-show', color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
  booked:  { label: 'Booked',  color: '#2563eb', bg: 'rgba(37,99,235,0.08)' },
}

export default function StoreAppointmentsView({ leads = [], teamMembers = [], onRefresh, onLogCall, onEditLead }) {
  const isMobile = useIsMobile()
  const myId = typeof window !== 'undefined' ? window._currentTeamMemberId : null
  const name = (id) => teamMembers.find(tm => String(tm.id) === String(id))?.name || (id ? '—' : 'Unassigned')
  const stylistOpts = useMemo(() => { const fs = filterStylists(teamMembers); return fs.length ? fs : teamMembers }, [teamMembers])

  const [sub, setSub] = useState('focus')          // focus | upcoming | future
  const [q, setQ] = useState('')
  const [locFilter, setLocFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [sortCol, setSortCol] = useState(null)      // null (tab default) | 'date' | 'client'
  const [sortDir, setSortDir] = useState('asc')
  const [busy, setBusy] = useState(null)
  const [visitLead, setVisitLead] = useState(null)

  const now = new Date()
  const todayStr = ymd(now)
  const tomo = new Date(); tomo.setDate(now.getDate() + 1); const tomoStr = ymd(tomo)
  const horizon = new Date(); horizon.setDate(now.getDate() + 30); const horizonStr = ymd(horizon)

  const appts = useMemo(() => leads.filter(isAppt), [leads])
  const locations = useMemo(() => [...new Set(appts.map(l => l.store_location).filter(Boolean))], [appts])

  const catOf = (l) => { const fd = l.follow_up_date; if (!fd || fd <= tomoStr) return 'focus'; if (fd <= horizonStr) return 'upcoming'; return 'future' }
  const counts = useMemo(() => { const c = { focus: 0, upcoming: 0, future: 0 }; appts.forEach(l => { c[catOf(l)]++ }); return c }, [appts, todayStr])

  const cmpDate = (a, b) => String(a.follow_up_date || '2999').localeCompare(String(b.follow_up_date || '2999')) || (new Date(a.created_at || 0) - new Date(b.created_at || 0))
  const focusRank = (l) => { const fd = l.follow_up_date; if (fd === todayStr) return 0; if (fd === tomoStr) return 1; if (!fd) return 3; return 2 }

  const shown = useMemo(() => {
    let r = appts.filter(l => catOf(l) === sub &&
      (locFilter === 'all' || l.store_location === locFilter) &&
      (ownerFilter === 'all' || String(ownerOf(l)) === String(ownerFilter)) &&
      (!q || `${l.client_name || ''} ${l.phone || ''} ${l.source || ''}`.toLowerCase().includes(q.toLowerCase())))
    const dir = sortDir === 'desc' ? -1 : 1
    if (sortCol === 'date') r = r.slice().sort((a, b) => dir * cmpDate(a, b))
    else if (sortCol === 'client') r = r.slice().sort((a, b) => dir * String(a.client_name || '').localeCompare(String(b.client_name || '')))
    else if (sub === 'focus') r = r.slice().sort((a, b) => (focusRank(a) - focusRank(b)) || cmpDate(a, b))  // Today, Tomorrow, Overdue
    else r = r.slice().sort(cmpDate)
    return r
  }, [appts, sub, locFilter, ownerFilter, q, sortCol, sortDir, todayStr])

  const kpi = useMemo(() => {
    const booked = leads.filter(l => l.assist_stylist || isAppt(l) || l.visit_outcome)
    const qualified = leads.filter(l => QUALIFIED_STATUSES.includes(l.status))
    const visited = leads.filter(l => l.visit_outcome === 'visited')
    const noShow = leads.filter(l => l.visit_outcome === 'no_show')
    const conv = leads.filter(l => l.status === 'Converted' && (l.assist_stylist || l.visit_outcome))
    return { open: appts.length, booked: booked.length, qualified: qualified.length,
      bookingRate: qualified.length ? Math.round(booked.length / qualified.length * 100) : 0,
      visited: visited.length, noShow: noShow.length,
      showRate: (visited.length + noShow.length) ? Math.round(visited.length / (visited.length + noShow.length) * 100) : 0,
      converted: conv.length }
  }, [leads, appts])

  const patch = async (lead, p, msg) => {
    setBusy(lead.id)
    try { const { error } = await supa.from('leads').update(p).eq('id', lead.id); if (error) throw error; toast(true, msg || 'Updated'); onRefresh && onRefresh() }
    catch (e) { toast(false, 'Failed: ' + (e.message || e)) } finally { setBusy(null) }
  }
  const selfAssign = (lead) => { if (!myId) { toast(false, 'No team member id for current user'); return } patch(lead, { stylist: myId }, 'Assigned to you') }
  const markVisited = (lead, store, date) => patch(lead, { visit_outcome: 'visited', channel: 'In-store', store_location: store || DEFAULT_STORE, lead_date: date }, 'Marked visited — added to Store Walk-ins')
  const toggleSort = (col) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc') } }
  const arrow = (col) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  const Kpi = ({ label, val, sub, accent }) => (
    <div style={{ padding: '10px 12px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textMuted }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent || C.text }}>{val}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.textMuted }}>{sub}</div>}
    </div>
  )
  const sel = { padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: '#fff' }
  const miniSel = { padding: '3px 6px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11.5, background: '#fff', maxWidth: 130 }
  const Picker = ({ lead, field, value }) => (
    <select value={value || ''} disabled={busy === lead.id} onChange={e => patch(lead, { [field]: e.target.value || null }, 'Updated')} style={miniSel} onClick={e => e.stopPropagation()}>
      <option value="">Unassigned</option>
      {stylistOpts.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
    </select>
  )

  const gridCols = '1.3fr 130px 130px 150px 150px 90px 1.2fr'
  const thClick = { cursor: 'pointer', userSelect: 'none' }
  const colHeader = !isMobile ? (
    <div style={{ display: 'grid', gridTemplateColumns: gridCols, padding: '9px 12px', background: C.bg, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.textMuted }}>
      <div onClick={() => toggleSort('client')} style={thClick}>Client{arrow('client')}</div>
      <div onClick={() => toggleSort('date')} style={thClick}>Appt date{arrow('date')}</div>
      <div>Location</div><div>Booked by</div><div>Owner</div><div>Outcome</div><div style={{ textAlign: 'right' }}>Actions</div>
    </div>
  ) : null

  const renderRow = (l) => {
    const isMine = String(ownerOf(l)) === String(myId)
    const oc = OUTCOME[l.visit_outcome] || OUTCOME.booked
    const overdue = l.follow_up_date && l.follow_up_date < todayStr && l.visit_outcome !== 'visited'
    return (
      <div key={l.id} style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: gridCols, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, borderLeft: overdue ? '3px solid #dc2626' : '3px solid transparent', alignItems: 'center', fontSize: 12.5, gap: isMobile ? 4 : 0 }}>
        <div>
          <div style={{ fontWeight: 700, color: C.text }}>{l.client_name || 'Unknown'}</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>{l.phone || '—'} · {l.source || l.channel}</div>
        </div>
        <div style={{ color: overdue ? '#dc2626' : C.text, fontWeight: overdue ? 700 : 400 }}>{fmtDate(l.follow_up_date)}</div>
        <div style={{ color: C.textMuted }}>{l.store_location || DEFAULT_STORE}</div>
        <div><Picker lead={l} field="assist_stylist" value={assistOf(l)} /></div>
        <div><Picker lead={l} field="stylist" value={ownerOf(l)} /></div>
        <div><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: oc.bg, color: oc.color }}>{oc.label}</span></div>
        <div style={{ display: 'flex', gap: 6, justifyContent: isMobile ? 'flex-start' : 'flex-end', flexWrap: 'wrap', marginTop: isMobile ? 6 : 0 }}>
          {!isMine && <button disabled={busy === l.id} onClick={() => selfAssign(l)} className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: C.gold, color: '#fff', border: 'none', cursor: 'pointer' }}>Self-assign</button>}
          {l.visit_outcome !== 'visited' && <button disabled={busy === l.id} onClick={() => setVisitLead(l)} className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', border: 'none', cursor: 'pointer' }}>Visited</button>}
          {l.visit_outcome !== 'no_show' && <button disabled={busy === l.id} onClick={() => patch(l, { visit_outcome: 'no_show' }, 'Marked no-show')} className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: 'none', cursor: 'pointer' }}>No-show</button>}
          {onLogCall && <button onClick={() => onLogCall(l)} className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: '#fff', color: C.text, border: `1px solid ${C.border}`, cursor: 'pointer' }}>Log</button>}
          {onEditLead && <button onClick={() => onEditLead(l)} className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: '#fff', color: C.textMuted, border: `1px solid ${C.border}`, cursor: 'pointer' }}>Edit</button>}
        </div>
      </div>
    )
  }

  const TABS = [['focus', `Focus (${counts.focus})`, '#d97706'], ['upcoming', `Next 30 days (${counts.upcoming})`, '#0891b2'], ['future', `Future months (${counts.future})`, '#6b7280']]

  return (
    <div style={{ fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${isMobile ? 130 : 150}px,1fr))`, gap: 8, marginBottom: 14 }}>
        <Kpi label="Open appointments" val={kpi.open} accent="#d97706" />
        <Kpi label="Booking rate" val={kpi.bookingRate + '%'} sub={`${kpi.booked} booked / ${kpi.qualified} qualified`} accent="#2563eb" />
        <Kpi label="Visited" val={kpi.visited} />
        <Kpi label="No-show" val={kpi.noShow} accent={kpi.noShow ? '#dc2626' : undefined} />
        <Kpi label="Show rate" val={kpi.showRate + '%'} sub="visited ÷ (visited+no-show)" accent="#16a34a" />
        <Kpi label="Converted" val={kpi.converted} accent="#16a34a" />
      </div>

      {/* Subtabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {TABS.map(([id, label, accent]) => (
          <button key={id} onClick={() => { setSub(id); setSortCol(null) }} style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: sub === id ? accent : C.bg, color: sub === id ? '#fff' : C.textMuted }}>{label}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone, source…" style={{ ...sel, flex: 1, minWidth: 180 }} />
        <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={sel}><option value="all">All locations</option>{locations.map(l => <option key={l} value={l}>{l}</option>)}</select>
        <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={sel}><option value="all">All owners</option>{stylistOpts.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}</select>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted }}>{shown.length} appointments</span>
      </div>

      {shown.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, border: `1px dashed ${C.border}`, borderRadius: 12 }}>
          No appointments in this view. Leads appear here when their status is set to <b>Store Visit Booked</b>.
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          {colHeader}
          {shown.map(renderRow)}
        </div>
      )}

      {visitLead && <VisitModal lead={visitLead} defaultStore={visitLead.store_location || DEFAULT_STORE} onCancel={() => setVisitLead(null)} onConfirm={(store, date) => { markVisited(visitLead, store, date); setVisitLead(null) }} />}
    </div>
  )
}

function VisitModal({ lead, defaultStore, onCancel, onConfirm }) {
  const today = new Date().toISOString().split('T')[0]
  const [store, setStore] = useState(defaultStore || DEFAULT_STORE)
  const [date, setDate] = useState((lead && lead.follow_up_date) || today)
  const opts = [...new Set([...(KNOWN_STORES), defaultStore].filter(Boolean))]
  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, background: '#fff' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.55)' }} onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{ width: 380, maxWidth: '92vw', background: '#fff', borderRadius: 14, padding: 20, fontFamily: 'Manrope, sans-serif' }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: C.text, marginBottom: 4 }}>Mark visited</div>
        <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 14 }}>{lead.client_name || 'Customer'} · {lead.phone || ''} — this also adds them to the Store Walk-ins register.</div>
        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.textMuted }}>Store visited</label>
        <input list="appt-stores" value={store} onChange={e => setStore(e.target.value)} style={{ ...inp, margin: '4px 0 12px' }} />
        <datalist id="appt-stores">{opts.map(o => <option key={o} value={o} />)}</datalist>
        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.textMuted }}>Visit date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, margin: '4px 0 16px' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ fontSize: 13, fontWeight: 700, padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.text }}>Cancel</button>
          <button onClick={() => onConfirm(store, date)} disabled={!store || !date} style={{ fontSize: 13, fontWeight: 700, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', opacity: (store && date) ? 1 : 0.5 }}>Confirm visit</button>
        </div>
      </div>
    </div>
  )
}

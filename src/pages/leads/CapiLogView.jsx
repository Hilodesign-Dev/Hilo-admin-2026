/* CAPI Log — unified feed of every event pushed to Meta (leads + orders).
   Paginated load + clickable status & event-type filter chips + table paging. */
import React, { useState, useEffect, useMemo } from 'react'
import { C } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'

const PAGE_SIZE = 50
const LEAD_EVENT_ORDER = ['Lead', 'QualifiedLead', 'ConvertedLead', 'LostLead']
const ORDER_EVENT_ORDER = ['Purchase']

export const CapiLogView = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [eventFilter, setEventFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('leads')   // 'leads' | 'orders'
  const [page, setPage] = useState(0)

  const load = async () => {
    setLoading(true)
    // paginated fetch (Supabase caps a single query at 1000 rows)
    const fetchAll = async (table, sel) => {
      const P = 1000; let all = [], from = 0
      while (true) {
        const { data, error } = await supa.from(table).select(sel).order('created_at', { ascending: false }).range(from, from + P - 1)
        if (error || !data || !data.length) break
        all = all.concat(data)
        if (data.length < P || all.length >= 20000) break
        from += P
      }
      return all
    }
    const [leadEv, ordEv, tmRes] = await Promise.all([
      fetchAll('meta_capi_lead_events', 'id, lead_id, event_name, to_stage, from_stage, lead_quality, lead_source, value, match_keys, status, skip_reason, http_status, response_body, created_at, leads(client_name, phone, stylist, assigned_to)'),
      fetchAll('meta_capi_events', 'id, order_number, event_name, channel, value, status, skip_reason, http_status, response_body, created_at, email_hash, phone_hash'),
      supa.from('team_members').select('id, name'),
    ])
    const tmMap = {}; (tmRes.data || []).forEach(t => { tmMap[String(t.id)] = t.name })
    const a = (leadEv || []).map(r => ({
      id: 'L' + r.id, ts: r.created_at, kind: 'lead',
      entity: r.leads?.client_name || 'Lead', event: r.event_name,
      phone: r.leads?.phone || '',
      stylist: tmMap[String(r.leads?.stylist)] || tmMap[String(r.leads?.assigned_to)] || '',
      change: r.to_stage ? `${r.from_stage ? r.from_stage + ' → ' : ''}${r.to_stage}${r.lead_quality ? ' · ' + r.lead_quality : ''}` : '',
      how: [(r.match_keys || []).join('+'), r.value ? '₹' + Number(r.value).toLocaleString('en-IN') : '', 'system_generated'].filter(Boolean).join(' · '),
      status: r.status, skip: r.skip_reason, resp: r.response_body,
    }))
    const b = (ordEv || []).map(r => ({
      id: 'O' + r.id, ts: r.created_at, kind: 'order',
      entity: r.order_number, event: r.event_name, phone: '', stylist: '',
      change: r.channel || '',
      how: [[r.email_hash ? 'em' : '', r.phone_hash ? 'ph' : ''].filter(Boolean).join('+'), r.value ? '₹' + Number(r.value).toLocaleString('en-IN') : '', 'physical_store'].filter(Boolean).join(' · '),
      status: r.status, skip: r.skip_reason, resp: r.response_body,
    }))
    const seenOrd = new Set()
    const bDedup = b.filter(r => { if (seenOrd.has(r.entity)) return false; seenOrd.add(r.entity); return true })
    setRows([...a, ...bDedup].sort((x, y) => new Date(y.ts) - new Date(x.ts)))
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  // reset paging + event filter when switching tab/filters
  useEffect(() => { setPage(0) }, [tab, eventFilter, statusFilter, search])
  useEffect(() => { setEventFilter('all') }, [tab])

  const tabRows = useMemo(() => rows.filter(r => r.kind === (tab === 'leads' ? 'lead' : 'order')), [rows, tab])

  // rows after status + event + search (drives the table)
  const filtered = useMemo(() => tabRows.filter(r => {
    if (eventFilter !== 'all' && r.event !== eventFilter) return false
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!String(r.entity).toLowerCase().includes(q) && !String(r.phone || '').includes(q)) return false
    }
    return true
  }), [tabRows, eventFilter, statusFilter, search])

  // status counts respect the active event filter (so chips stay coherent)
  const evScoped = useMemo(() => eventFilter === 'all' ? tabRows : tabRows.filter(r => r.event === eventFilter), [tabRows, eventFilter])
  const stats = useMemo(() => ({
    all: evScoped.length,
    success: evScoped.filter(r => r.status === 'success').length,
    failed: evScoped.filter(r => r.status === 'failed').length,
    skipped: evScoped.filter(r => r.status === 'skipped').length,
  }), [evScoped])

  // event-type counts respect the active status filter
  const stScoped = useMemo(() => statusFilter === 'all' ? tabRows : tabRows.filter(r => r.status === statusFilter), [tabRows, statusFilter])
  const eventChips = useMemo(() => {
    const order = tab === 'leads' ? LEAD_EVENT_ORDER : ORDER_EVENT_ORDER
    const counts = {}; stScoped.forEach(r => { if (r.event) counts[r.event] = (counts[r.event] || 0) + 1 })
    const present = Object.keys(counts)
    const ordered = [...order.filter(e => present.includes(e)), ...present.filter(e => !order.includes(e))]
    return [{ k: 'all', label: 'All events', n: stScoped.length }, ...ordered.map(e => ({ k: e, label: e, n: counts[e] }))]
  }, [stScoped, tab])

  const counts = useMemo(() => ({
    leads: rows.filter(r => r.kind === 'lead').length,
    orders: rows.filter(r => r.kind === 'order').length,
  }), [rows])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page])

  const stPill = (s) => s === 'success' ? { bg: '#ecfdf5', c: '#059669', t: 'received' } : s === 'failed' ? { bg: '#fef2f2', c: '#dc2626', t: 'failed' } : { bg: '#f3f4f6', c: '#9ca3af', t: 'skipped' }
  const evColor = (e) => e === 'Purchase' ? { bg: '#eff6ff', c: '#2563eb' } : e === 'QualifiedLead' ? { bg: '#ecfdf5', c: '#059669' } : e === 'LostLead' ? { bg: '#f1f5f9', c: '#64748b' } : { bg: '#fef3c7', c: '#92400e' }
  const inp = { border: `1px solid ${C.border}`, background: C.cardBg }

  // clickable filter chip
  const Chip = ({ active, onClick, color, children }) => (
    <button onClick={onClick} className="text-sm px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors"
      style={{ background: active ? (color || C.gold) : C.cardBg, color: active ? '#fff' : C.text, border: `1px solid ${active ? (color || C.gold) : C.border}` }}>
      {children}
    </button>
  )
  const CountBadge = ({ active, color, n }) => (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: active ? 'rgba(255,255,255,0.25)' : (color || C.gold) + '14', color: active ? '#fff' : (color || C.gold) }}>{n}</span>
  )

  return (
    <div>
      {/* lead vs order */}
      <div className="flex gap-1.5 mb-4">
        {[{ k: 'leads', label: 'Lead events', n: counts.leads }, { k: 'orders', label: 'Order purchases', n: counts.orders }].map(t => {
          const active = tab === t.k
          return (
            <button key={t.k} onClick={() => setTab(t.k)}
              className="px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-1.5"
              style={{ background: active ? C.gold : 'transparent', color: active ? '#fff' : C.text, border: active ? 'none' : `1px solid ${C.border}` }}>
              {t.label}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: active ? 'rgba(255,255,255,0.25)' : C.gold + '12', color: active ? '#fff' : C.gold }}>{t.n}</span>
            </button>
          )
        })}
      </div>

      {/* event-type filter chips */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {eventChips.map(e => {
          const active = eventFilter === e.k; const col = e.k === 'all' ? C.gold : evColor(e.k).c
          return <Chip key={e.k} active={active} color={col} onClick={() => setEventFilter(e.k)}>{e.label} <CountBadge active={active} color={col} n={e.n} /></Chip>
        })}
      </div>

      {/* status filter chips + search */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[{ k: 'all', label: 'All', n: stats.all, c: C.gold }, { k: 'success', label: 'Received', n: stats.success, c: '#059669' }, { k: 'failed', label: 'Failed', n: stats.failed, c: '#dc2626' }, { k: 'skipped', label: 'Skipped', n: stats.skipped, c: '#9ca3af' }].map(st => {
          const active = statusFilter === st.k
          return <Chip key={st.k} active={active} color={st.c} onClick={() => setStatusFilter(st.k)}>{st.label} <CountBadge active={active} color={st.c} n={st.n} /></Chip>
        })}
        <div className="ml-auto flex flex-wrap gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search lead/order…" className="text-sm px-3 py-1.5 rounded-lg" style={inp} />
          <button onClick={load} className="text-sm px-3 py-1.5 rounded-lg" style={inp}>Refresh</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12" style={{ color: C.textMuted }}>Loading CAPI log…</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${C.border}`, background: C.cardBg }}>
            <table className="w-full text-sm">
              <thead><tr style={{ background: '#f5f4f0' }}>
                {['Time', 'Lead / Order', 'Event', 'What changed · how', 'Status'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wide font-semibold" style={{ color: C.textMuted }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10" style={{ color: C.textMuted }}>No CAPI events match.</td></tr>
                ) : paged.map(r => {
                  const sp = stPill(r.status), ec = evColor(r.event)
                  return (
                    <tr key={r.id} className="border-t" style={{ borderColor: C.border }}>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: C.textMuted }}>{new Date(r.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{r.entity}{r.kind === 'order' && <span className="text-[11px]" style={{ color: C.textMuted }}> (order)</span>}</div>
                        {r.kind === 'lead' && (r.phone || r.stylist) && (
                          <div className="text-[11px]" style={{ color: C.textMuted }}>{r.phone}{r.phone && r.stylist ? ' · ' : ''}{r.stylist}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">{r.event ? <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: ec.bg, color: ec.c }}>{r.event}</span> : <span style={{ color: C.textMuted }}>—</span>}</td>
                      <td className="px-3 py-2.5"><div>{r.change || '—'}</div><div className="text-[11px]" style={{ color: r.status === 'failed' ? '#dc2626' : C.textMuted }}>{r.status === 'failed' ? (r.resp?.error?.message || 'error') : (r.skip ? 'skip: ' + r.skip : r.how)}</div></td>
                      <td className="px-3 py-2.5"><span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: sp.bg, color: sp.c }}>{sp.t}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* pagination footer */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between mt-3 text-sm" style={{ color: C.textMuted }}>
              <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 rounded-lg font-bold" style={{ ...inp, opacity: page === 0 ? 0.4 : 1 }}>‹ Prev</button>
                <span>Page {page + 1} of {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 rounded-lg font-bold" style={{ ...inp, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>Next ›</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default CapiLogView

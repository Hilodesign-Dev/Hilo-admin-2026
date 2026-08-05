/* ═══════════════════════════════════════════════════════════════════════════
   LEADS DASHBOARD — v3: Revenue, Stylist Performance, Analytics
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useEffect } from 'react'
import { C } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { FunnelChart, MultiLineChart, FUN_COLORS, LINE_COLORS } from './charts'
import { useChannelOrders } from './useChannelOrders'
import { Input, Select, Badge } from './ui'
import {
  LEAD_CHANNELS, LEAD_SOURCES, LOCATIONS, COUNTRIES,
  YET_TO_QUALIFY_STATUSES, QUALIFIED_STATUSES,
  QUALITY_COLORS, PHASE_COLORS, isTerminalStatus
} from './constants'
import { useIsMobile } from './useIsMobile'
import { filterStylists } from '../../lib/helpers'


const fmtINR = (n) => n > 0 ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0'

const StatCard = ({ label, value, color = C.gold, sub, large, mobile }) => (
  <div className={`rounded-xl ${mobile ? 'p-3' : 'p-4'}`} style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
    <div className="text-[10px] font-bold uppercase mb-1.5" style={{ color: C.textMuted, letterSpacing: '0.05em' }}>
      {label}
    </div>
    <div className={`${mobile ? 'text-lg' : large ? 'text-2xl' : 'text-3xl'} font-bold`} style={{ color }}>
      {value}
    </div>
    {sub && <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>{sub}</div>}
  </div>
)

// ─── Progress bar ───────────────────────────────────────────────────────
const ProgressBar = ({ value, max, color }) => {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: C.bg }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  )
}

export const LeadsDashboard = ({ leads = [], teamMembers = [] }) => {
  const isMobile = useIsMobile()
  const [filters, setFilters] = useState(() => {
    const now = new Date()
    const p = (x) => String(x).padStart(2, '0')
    const mStart = `${now.getFullYear()}-${p(now.getMonth() + 1)}-01`
    const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
    return { location: '', country: '', channel: '', source: '', assigned: '', dateStart: mStart, dateEnd: today }
  })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  // Source of truth = POS orders on the Online Assist channel for the selected range
  const posOrders = useChannelOrders('Online Assist', filters.dateStart, filters.dateEnd)

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const filtered = useMemo(() => {
    return leads.filter(lead => {
      if (filters.location && lead.location !== filters.location) return false
      if (filters.country && lead.country !== filters.country) return false
      if (filters.channel && lead.channel !== filters.channel) return false
      if (filters.source && lead.lead_source !== filters.source) return false
      if (filters.assigned && String(lead.assigned_to) !== String(filters.assigned)) return false

      if (filters.dateStart || filters.dateEnd) {
        const leadDate = new Date(lead.lead_date)
        if (filters.dateStart && leadDate < new Date(filters.dateStart)) return false
        if (filters.dateEnd && leadDate > new Date(filters.dateEnd)) return false
      }

      return true
    })
  }, [leads, filters])

  const todayStr = new Date().toISOString().split('T')[0]

  // ─── Real revenue from LINKED ORDERS (matches POS) ───────────────────
  // Dashboard revenue must equal POS: use the linked order's total_price,
  // attributed to the order's OWN stylist (so a sale rung by another
  // stylist on this lead is NOT credited here). lead.amount is hand-typed
  // and unreliable, so it is no longer used for revenue.
  const [orderRev, setOrderRev] = useState({})
  const [monthlyMetric, setMonthlyMetric] = useState('leads')  // leadId -> { rev, todayRev }
  useEffect(() => {
    const convLeads = filtered.filter(l => l.status === 'Converted')
    const convIds = convLeads.map(l => l.id)
    if (!convIds.length) { setOrderRev({}); return }
    const ownerOf = Object.fromEntries(convLeads.map(l => [l.id, String(l.assigned_to)]))
    let cancelled = false
    ;(async () => {
      try {
        // links for these leads (chunk the IN list to stay well under limits)
        let links = []
        for (let i = 0; i < convIds.length; i += 200) {
          const { data } = await supa.from('lead_orders').select('lead_id, order_id').in('lead_id', convIds.slice(i, i + 200))
          links = links.concat(data || [])
        }
        const orderIds = [...new Set(links.map(r => r.order_id))]
        if (!orderIds.length) { if (!cancelled) setOrderRev({}); return }
        let orders = []
        for (let i = 0; i < orderIds.length; i += 200) {
          const { data } = await supa.from('shopify_orders').select('id, total_price, stylist, created_at').in('id', orderIds.slice(i, i + 200))
          orders = orders.concat(data || [])
        }
        const oMap = Object.fromEntries(orders.map(o => [o.id, o]))
        const map = {}
        for (const lk of links) {
          const o = oMap[lk.order_id]; if (!o) continue
          // Credit the linked order's revenue to the LEAD's owner (the stylist whose
          // lead converted), regardless of who rang the order at POS. Each order is
          // linked to one lead, so there is no double-counting across stylists.
          const val = Number(o.total_price) || 0
          if (!map[lk.lead_id]) map[lk.lead_id] = { rev: 0, todayRev: 0 }
          map[lk.lead_id].rev += val
          if ((o.created_at || '').split('T')[0] === todayStr) map[lk.lead_id].todayRev += val
        }
        if (!cancelled) setOrderRev(map)
      } catch (e) { if (!cancelled) setOrderRev({}) }
    })()
    return () => { cancelled = true }
  }, [filtered, todayStr])

  // ─── Core stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = filtered.length
    const ytq = filtered.filter(l => l.phase === 'yet_to_qualify' && !isTerminalStatus(l.status)).length
    const qualified = filtered.filter(l => l.phase === 'qualified' && !isTerminalStatus(l.status)).length
    const converted = filtered.filter(l => l.status === 'Converted')
    const lost = filtered.filter(l => l.status === 'Lost' || l.status === 'Not Qualified').length
    const conversionPct = total > 0 ? Math.round((converted.length / total) * 100) : 0

    const todayFollowUp = filtered.filter(l => l.follow_up_date?.split('T')[0] === todayStr).length
    const overdue = filtered.filter(l => l.follow_up_date && l.follow_up_date.split('T')[0] < todayStr && !isTerminalStatus(l.status)).length

    const storeVisit = filtered.filter(l => l.status === 'Store Visit Booked').length
    const toBeClosed = filtered.filter(l => l.status === 'To be Closed').length
    const highQuality = filtered.filter(l => l.lead_quality === 'High Quality').length
    const highQualityPct = total > 0 ? Math.round(highQuality / total * 100) : 0

    // Revenue — from linked orders (POS-matching), NOT hand-typed lead.amount
    const totalRevenue = converted.reduce((sum, l) => sum + (orderRev[l.id]?.rev || 0), 0)
    const todayRevenue = converted.reduce((sum, l) => sum + (orderRev[l.id]?.todayRev || 0), 0)
    const todayConverted = converted.filter(l => (orderRev[l.id]?.todayRev || 0) > 0)

    // Pipeline value (active qualified leads)
    const pipelineValue = filtered
      .filter(l => l.phase === 'qualified' && !isTerminalStatus(l.status))
      .reduce((sum, l) => sum + (Number(l.est_invoice_amount) || 0), 0)

    return {
      total, ytq, qualified, convertedCount: converted.length, lost, conversionPct,
      todayFollowUp, overdue, storeVisit, toBeClosed, highQuality, highQualityPct,
      totalRevenue, todayRevenue, todayConvertedCount: todayConverted.length, pipelineValue
    }
  }, [filtered, todayStr, orderRev])

  // ─── Stylist / Team performance ──────────────────────────────────────
  const stylistPerformance = useMemo(() => {
    const perf = {}
    filtered.forEach(lead => {
      const tm = lead.assigned_to != null && String(lead.assigned_to) !== '' ? teamMembers.find(t => String(t.id) === String(lead.assigned_to)) : null
      const name = tm?.name || (lead.assigned_to != null && String(lead.assigned_to) !== '' ? 'Stylist #' + lead.assigned_to : 'Unassigned')
      if (!perf[name]) perf[name] = { name, total: 0, converted: 0, lost: 0, active: 0, revenue: 0, overdue: 0, todayTasks: 0, hq: 0 }
      perf[name].total++
      if (lead.lead_quality === 'High Quality') perf[name].hq++
      if (lead.status === 'Converted') {
        perf[name].converted++
        perf[name].revenue += orderRev[lead.id]?.rev || 0
      } else if (lead.status === 'Lost' || lead.status === 'Not Qualified') {
        perf[name].lost++
      } else {
        perf[name].active++
        if (lead.follow_up_date) {
          const fuDate = lead.follow_up_date.split('T')[0]
          if (fuDate < todayStr) perf[name].overdue++
          if (fuDate === todayStr) perf[name].todayTasks++
        }
      }
    })
    return Object.values(perf).map(p => ({ ...p, hqPct: p.total ? Math.round(p.hq / p.total * 100) : 0 })).sort((a, b) => b.converted - a.converted)
  }, [filtered, teamMembers, todayStr, orderRev])

  // ─── Quality breakdown ───────────────────────────────────────────────
  const qualityBreakdown = useMemo(() => {
    const breakdown = { 'High Quality': 0, 'Good': 0, 'Avg': 0, 'Bad': 0 }
    filtered.forEach(lead => {
      const q = lead.lead_quality || 'Avg'
      if (breakdown.hasOwnProperty(q)) breakdown[q]++
    })
    return breakdown
  }, [filtered])

  // ─── Status breakdown by phase ───────────────────────────────────────
  const ytqStatusBreakdown = useMemo(() => {
    const breakdown = {}
    filtered.filter(l => l.phase === 'yet_to_qualify').forEach(lead => {
      const s = lead.status || 'New'
      breakdown[s] = (breakdown[s] || 0) + 1
    })
    return Object.entries(breakdown).sort((a, b) => b[1] - a[1])
  }, [filtered])

  const qualStatusBreakdown = useMemo(() => {
    const breakdown = {}
    filtered.filter(l => l.phase === 'qualified').forEach(lead => {
      const s = lead.status || 'Follow-up 1'
      breakdown[s] = (breakdown[s] || 0) + 1
    })
    return Object.entries(breakdown).sort((a, b) => b[1] - a[1])
  }, [filtered])

  // ─── Source breakdown ────────────────────────────────────────────────
  const sourceBreakdown = useMemo(() => {
    const breakdown = {}
    filtered.forEach(lead => {
      const s = lead.lead_source || lead.channel || 'Unknown'
      if (!breakdown[s]) breakdown[s] = { total: 0, converted: 0, revenue: 0, hq: 0 }
      breakdown[s].total++
      if (lead.lead_quality === 'High Quality') breakdown[s].hq++
      if (lead.status === 'Converted') {
        breakdown[s].converted++
        breakdown[s].revenue += Number(lead.amount) || Number(lead.est_invoice_amount) || 0
      }
    })
    return Object.entries(breakdown)
      .map(([source, d]) => ({ source, ...d, convRate: d.total > 0 ? Math.round((d.converted / d.total) * 100) : 0, hqPct: d.total > 0 ? Math.round(d.hq / d.total * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [filtered])

  // ─── Occasion breakdown ──────────────────────────────────────────────
  const occasionBreakdown = useMemo(() => {
    const breakdown = {}
    filtered.filter(l => l.occasion).forEach(lead => {
      if (!breakdown[lead.occasion]) breakdown[lead.occasion] = { total: 0, converted: 0, revenue: 0, hq: 0 }
      breakdown[lead.occasion].total++
      if (lead.lead_quality === 'High Quality') breakdown[lead.occasion].hq++
      if (lead.status === 'Converted') {
        breakdown[lead.occasion].converted++
        breakdown[lead.occasion].revenue += Number(lead.amount) || Number(lead.est_invoice_amount) || 0
      }
    })
    return Object.entries(breakdown)
      .map(([occ, d]) => ({ occasion: occ, ...d, hqPct: d.total > 0 ? Math.round(d.hq / d.total * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [filtered])

  // ─── Country breakdown ───────────────────────────────────────────────
  const countryBreakdown = useMemo(() => {
    const breakdown = {}
    filtered.filter(l => l.country).forEach(lead => {
      if (!breakdown[lead.country]) breakdown[lead.country] = { total: 0, converted: 0, hq: 0 }
      breakdown[lead.country].total++
      if (lead.lead_quality === 'High Quality') breakdown[lead.country].hq++
      if (lead.status === 'Converted') breakdown[lead.country].converted++
    })
    return Object.entries(breakdown)
      .map(([country, d]) => ({ country, ...d, hqPct: d.total > 0 ? Math.round(d.hq / d.total * 100) : 0, convRate: d.total > 0 ? Math.round(d.converted / d.total * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [filtered])

  // ─── Stylist performance split by country (India / US) ───────────────
  const stylistByCountry = useMemo(() => {
    const build = (match) => {
      const perf = {}
      filtered.filter(l => match(l.country)).forEach(lead => {
        const tm = teamMembers.find(t => String(t.id) === String(lead.assigned_to))
        const name = tm?.name || (lead.assigned_to != null && String(lead.assigned_to) !== '' ? 'Stylist #' + lead.assigned_to : 'Unassigned')
        if (!perf[name]) perf[name] = { name, total: 0, hq: 0, converted: 0 }
        perf[name].total++
        if (lead.lead_quality === 'High Quality') perf[name].hq++
        if (lead.status === 'Converted') perf[name].converted++
      })
      return Object.values(perf).map(p => ({ ...p, hqPct: p.total ? Math.round(p.hq / p.total * 100) : 0, convPct: p.total ? Math.round(p.converted / p.total * 100) : 0 })).sort((a, b) => b.total - a.total)
    }
    const isIndia = (c) => (c || '').toLowerCase().includes('india')
    return { india: build(c => isIndia(c)), us: build(c => c && !isIndia(c)) }
  }, [filtered, teamMembers])

  const funnelStages = useMemo(() => {
    const total = filtered.length
    const qualified = filtered.filter(l => l.phase === 'qualified' || l.status === 'Converted').length
    const converted = filtered.filter(l => l.status === 'Converted').length
    return [{ label: 'Leads', value: total, color: FUN_COLORS[0] }, { label: 'Qualified', value: qualified, color: FUN_COLORS[1] }, { label: 'Converted', value: converted, color: FUN_COLORS[2] }]
  }, [filtered])

  const objections = useMemo(() => {
    const m = {}
    filtered.filter(l => l.status === 'Lost' || l.status === 'Not Qualified').forEach(l => { const r = l.lost_reason || l.client_requirements || 'Not recorded'; m[r] = (m[r] || 0) + 1 })
    return Object.entries(m).map(([r, c]) => ({ r, c })).sort((a, b) => b.c - a.c).slice(0, 8)
  }, [filtered])

  const monthly = useMemo(() => {
    const now = new Date(); const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y = d.getFullYear(), m = d.getMonth(), dim = new Date(y, m + 1, 0).getDate()
      months.push({ y, m, label: d.toLocaleString('en-US', { month: 'short' }) + " '" + String(y).slice(2), dim, lv: new Array(dim).fill(0), cv: new Array(dim).fill(0) })
    }
    leads.forEach(l => {
      if (!l.lead_date) return
      const d = new Date(l.lead_date + 'T00:00:00')
      const mo = months.find(x => x.y === d.getFullYear() && x.m === d.getMonth())
      if (mo) { const day = d.getDate() - 1; if (day >= 0 && day < mo.dim) { mo.lv[day]++; if (l.status === 'Converted') mo.cv[day]++ } }
    })
    return months
  }, [leads])
  const monthlySeries = useMemo(() => monthly.map((mo, i) => ({ name: mo.label, color: LINE_COLORS[i % LINE_COLORS.length], values: monthlyMetric === 'conversions' ? mo.cv : mo.lv })), [monthly, monthlyMetric])

  // ─── Per-stylist 6-month timeline ────────────────────────────────────
  const [timelineStylist, setTimelineStylist] = useState('')
  const [timelineRev, setTimelineRev] = useState({})
  useEffect(() => {
    if (!timelineStylist) { const first = filterStylists(teamMembers)[0]; if (first) setTimelineStylist(String(first.id)) }
  }, [teamMembers]) // eslint-disable-line
  const timelineMonths = useMemo(() => {
    const now = new Date(); const arr = []
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); arr.push({ y: d.getFullYear(), m: d.getMonth(), label: d.toLocaleString('en-US', { month: 'short' }) + " '" + String(d.getFullYear()).slice(2) }) }
    return arr
  }, [])
  const stylistLeads = useMemo(() => leads.filter(l => String(l.assigned_to) === String(timelineStylist)), [leads, timelineStylist])
  const stylistConvKey = stylistLeads.filter(l => l.status === 'Converted').map(l => l.id).join(',')
  useEffect(() => {
    const ids = stylistLeads.filter(l => l.status === 'Converted').map(l => l.id)
    if (!ids.length) { setTimelineRev({}); return }
    let cancelled = false
    ;(async () => {
      try {
        let links = []
        for (let i = 0; i < ids.length; i += 200) { const { data } = await supa.from('lead_orders').select('lead_id, order_id').in('lead_id', ids.slice(i, i + 200)); links = links.concat(data || []) }
        const oids = [...new Set(links.map(l => l.order_id))]
        if (!oids.length) { if (!cancelled) setTimelineRev({}); return }
        let orders = []
        for (let i = 0; i < oids.length; i += 200) { const { data } = await supa.from('shopify_orders').select('id, total_price').in('id', oids.slice(i, i + 200)); orders = orders.concat(data || []) }
        const omap = Object.fromEntries(orders.map(o => [o.id, Number(o.total_price) || 0]))
        const map = {}; links.forEach(l => { map[l.lead_id] = (map[l.lead_id] || 0) + (omap[l.order_id] || 0) })
        if (!cancelled) setTimelineRev(map)
      } catch { if (!cancelled) setTimelineRev({}) }
    })()
    return () => { cancelled = true }
  }, [stylistConvKey]) // eslint-disable-line
  const timelineRows = useMemo(() => timelineMonths.map(mo => {
    const inMonth = stylistLeads.filter(l => { if (!l.lead_date) return false; const d = new Date(l.lead_date + 'T00:00:00'); return d.getFullYear() === mo.y && d.getMonth() === mo.m })
    const total = inMonth.length
    const converted = inMonth.filter(l => l.status === 'Converted')
    const hq = inMonth.filter(l => l.lead_quality === 'High Quality').length
    const revenue = converted.reduce((s, l) => s + (timelineRev[l.id] || 0), 0)
    return { label: mo.label, total, converted: converted.length, convPct: total ? Math.round(converted.length / total * 100) : 0, hqPct: total ? Math.round(hq / total * 100) : 0, revenue }
  }), [timelineMonths, stylistLeads, timelineRev])

  return (
    <div>
      {/* Filter Section */}
      <div className="mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="font-bold text-sm sm:text-base" style={{ color: C.text }}>Filters</h3>
          <div className="text-xs font-bold px-3 py-1 rounded-full" style={{
            background: (filters.dateStart || filters.dateEnd) ? 'rgba(201,164,50,0.1)' : 'rgba(22,163,74,0.08)',
            color: (filters.dateStart || filters.dateEnd) ? C.gold : '#16a34a',
          }}>
            {filters.dateStart && filters.dateEnd
              ? `${filters.dateStart} → ${filters.dateEnd}`
              : filters.dateStart
                ? `From ${filters.dateStart}`
                : filters.dateEnd
                  ? `Until ${filters.dateEnd}`
                  : 'All Time'}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {[
            { label: 'All Time', start: '', end: '' },
            { label: 'Today', start: todayStr, end: todayStr },
            { label: 'This Month', start: monthStart, end: monthEnd },
            { label: 'Last 7 Days', start: (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0] })(), end: todayStr },
            { label: 'Last 30 Days', start: (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] })(), end: todayStr },
          ].map(preset => {
            const isActive = filters.dateStart === preset.start && filters.dateEnd === preset.end
            return (
              <button
                key={preset.label}
                onClick={() => { handleFilterChange('dateStart', preset.start); handleFilterChange('dateEnd', preset.end) }}
                className="px-3 py-1 rounded-full text-xs font-bold transition-all"
                style={{
                  background: isActive ? C.gold : 'transparent',
                  color: isActive ? '#fff' : C.text,
                  border: `1px solid ${isActive ? C.gold : C.border}`,
                }}
              >
                {preset.label}
              </button>
            )
          })}
        </div>

        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-7'} gap-3`}>
          <div>
            <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: C.textMuted }}>Channel</label>
            <Select value={filters.channel} onChange={e => handleFilterChange('channel', e.target.value)}>
              <option value="">All Channels</option>
              {LEAD_CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: C.textMuted }}>Source</label>
            <Select value={filters.source} onChange={e => handleFilterChange('source', e.target.value)}>
              <option value="">All Sources</option>
              {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: C.textMuted }}>Country</label>
            <Select value={filters.country} onChange={e => handleFilterChange('country', e.target.value)}>
              <option value="">All Countries</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: C.textMuted }}>Assigned</label>
            <Select value={filters.assigned} onChange={e => handleFilterChange('assigned', e.target.value)}>
              <option value="">All</option>
              {filterStylists(teamMembers).map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: C.textMuted }}>Location</label>
            <Select value={filters.location} onChange={e => handleFilterChange('location', e.target.value)}>
              <option value="">All Locations</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: C.textMuted }}>From</label>
            <Input type="date" value={filters.dateStart} onChange={e => handleFilterChange('dateStart', e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: C.textMuted }}>To</label>
            <Input type="date" value={filters.dateEnd} onChange={e => handleFilterChange('dateEnd', e.target.value)} />
          </div>
        </div>
      </div>

      {/* ═══ Revenue + Today Snapshot ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <StatCard label="Today's Revenue (POS)" value={fmtINR(posOrders.todayRevenue)} color="#16a34a" sub={`${posOrders.todayCount} orders today · CRM ${fmtINR(stats.todayRevenue)}`} large mobile={isMobile} />
        <StatCard label="Revenue (POS · Online Assist)" value={fmtINR(posOrders.revenue)} color={C.gold} sub={`${posOrders.count} orders · CRM-linked ${fmtINR(stats.totalRevenue)} / ${stats.convertedCount} conv`} large mobile={isMobile} />
        <StatCard label="Pipeline Value" value={fmtINR(stats.pipelineValue)} color="#7c3aed" sub={`${stats.qualified} active qualified`} large mobile={isMobile} />
        <StatCard label="Conversion Rate" value={`${stats.conversionPct}%`} color={stats.conversionPct >= 10 ? '#16a34a' : '#d97706'} sub={`${stats.convertedCount} of ${stats.total}`} mobile={isMobile} />
        <StatCard label="High Quality" value={`${stats.highQualityPct}%`} color="#7c3aed" sub={`${stats.highQuality} HQ leads`} mobile={isMobile} />
      </div>

      {/* ═══ Pipeline Stats ═══ */}
      <div className={`grid ${isMobile ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-6'} gap-2 sm:gap-3 mb-4 sm:mb-6`}>
        <StatCard label="Total Leads" value={stats.total} mobile={isMobile} />
        <StatCard label="Yet to Qualify" value={stats.ytq} color="#2563eb" mobile={isMobile} />
        <StatCard label="Qualified" value={stats.qualified} color="#16a34a" mobile={isMobile} />
        <StatCard label="Overdue" value={stats.overdue} color="#dc2626" mobile={isMobile} />
        <StatCard label="Due Today" value={stats.todayFollowUp} color="#d97706" mobile={isMobile} />
        <StatCard label="Lost" value={stats.lost} color="#dc2626" mobile={isMobile} />
      </div>

      {/* ═══ Stylist / Team Performance ═══ */}
      <div className="rounded-xl overflow-hidden mb-4 sm:mb-6" style={{ border: `1px solid ${C.border}` }}>
        <div className="px-4 py-3 font-bold flex items-center gap-2" style={{ background: 'rgba(201,164,50,0.04)', color: C.gold, borderBottom: `1px solid ${C.border}` }}>
          👤 Stylist Performance
        </div>
        {isMobile ? (
          /* Mobile: card layout */
          <div>
            {stylistPerformance.map((sp, idx) => {
              const convPct = sp.total > 0 ? Math.round((sp.converted / sp.total) * 100) : 0
              return (
                <div key={sp.name} className="px-4 py-3" style={{ borderBottom: idx < stylistPerformance.length - 1 ? `1px solid ${C.border}` : 'none', background: C.cardBg }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm" style={{ color: C.text }}>{sp.name}</span>
                    <span className="font-bold text-sm" style={{ color: C.gold }}>{fmtINR(sp.revenue)}</span>
                  </div>
                  <div className="flex items-center gap-3 mb-2">
                    <ProgressBar value={convPct} max={100} color={convPct >= 10 ? '#16a34a' : '#d97706'} />
                    <span className="text-xs font-bold min-w-[32px]" style={{ color: convPct >= 10 ? '#16a34a' : '#d97706' }}>{convPct}%</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span style={{ color: C.text }}>{sp.total} total</span>
                    <span style={{ color: '#16a34a' }}>{sp.converted} conv</span>
                    <span style={{ color: '#2563eb' }}>{sp.active} active</span>
                    <span style={{ color: '#dc2626' }}>{sp.lost} lost</span>
                    {sp.overdue > 0 && <span className="font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>{sp.overdue} overdue</span>}
                    {sp.todayTasks > 0 && <span className="font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(217,119,6,0.06)', color: '#d97706' }}>{sp.todayTasks} today</span>}
                  </div>
                </div>
              )
            })}
            {stylistPerformance.length === 0 && (
              <div className="px-4 py-6 text-center text-sm" style={{ color: C.textMuted }}>No data</div>
            )}
          </div>
        ) : (
          /* Desktop: table layout */
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 700 }}>
              <thead>
                <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                  {['Stylist', 'Total', 'HQ', 'HQ %', 'Active', 'Converted', 'Lost', 'Conv %', 'Revenue', 'Overdue', 'Today'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stylistPerformance.map((sp, idx) => {
                  const convPct = sp.total > 0 ? Math.round((sp.converted / sp.total) * 100) : 0
                  return (
                    <tr key={sp.name} style={{ borderBottom: idx < stylistPerformance.length - 1 ? `1px solid ${C.border}` : 'none', background: C.cardBg }}>
                      <td className="px-3 py-2.5 font-bold" style={{ color: C.text }}>{sp.name}</td>
                      <td className="px-3 py-2.5" style={{ color: C.text }}>{sp.total}</td>
                      <td className="px-3 py-2.5 font-bold" style={{ color: '#7c3aed' }}>{sp.hq}</td>
                      <td className="px-3 py-2.5" style={{ color: '#7c3aed' }}>{sp.hqPct}%</td>
                      <td className="px-3 py-2.5" style={{ color: '#2563eb' }}>{sp.active}</td>
                      <td className="px-3 py-2.5 font-bold" style={{ color: '#16a34a' }}>{sp.converted}</td>
                      <td className="px-3 py-2.5" style={{ color: '#dc2626' }}>{sp.lost}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold" style={{ color: convPct >= 10 ? '#16a34a' : '#d97706' }}>{convPct}%</span>
                          <ProgressBar value={convPct} max={100} color={convPct >= 10 ? '#16a34a' : '#d97706'} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-bold" style={{ color: C.gold }}>{fmtINR(sp.revenue)}</td>
                      <td className="px-3 py-2.5">
                        {sp.overdue > 0 ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>{sp.overdue}</span>
                        ) : <span style={{ color: C.textMuted }}>0</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {sp.todayTasks > 0 ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(217,119,6,0.06)', color: '#d97706' }}>{sp.todayTasks}</span>
                        ) : <span style={{ color: C.textMuted }}>0</span>}
                      </td>
                    </tr>
                  )
                })}
                {stylistPerformance.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-6 text-center text-sm" style={{ color: C.textMuted }}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ Stylist — Last 6 Months ═══ */}
      <div className="rounded-xl overflow-hidden mb-4 sm:mb-6" style={{ border: `1px solid ${C.border}` }}>
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2" style={{ background: 'rgba(201,164,50,0.04)', borderBottom: `1px solid ${C.border}` }}>
          <span className="font-bold" style={{ color: C.gold }}>📈 Stylist — Last 6 Months</span>
          <select value={timelineStylist} onChange={e => setTimelineStylist(e.target.value)} className="text-sm px-2 py-1 rounded-lg outline-none" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }}>
            {filterStylists(teamMembers).map(tm => <option key={tm.id} value={String(tm.id)}>{tm.name}</option>)}
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              {['Month', 'Total Leads', 'Converted', 'Conv %', 'HQ %', 'Revenue'].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {timelineRows.map((r, idx) => (
                <tr key={r.label} style={{ borderBottom: idx < timelineRows.length - 1 ? `1px solid ${C.border}` : 'none', background: C.cardBg }}>
                  <td className="px-3 py-2 font-bold" style={{ color: C.text }}>{r.label}</td>
                  <td className="px-3 py-2" style={{ color: C.text }}>{r.total}</td>
                  <td className="px-3 py-2 font-bold" style={{ color: '#16a34a' }}>{r.converted}</td>
                  <td className="px-3 py-2" style={{ color: r.convPct >= 10 ? '#16a34a' : '#d97706' }}>{r.convPct}%</td>
                  <td className="px-3 py-2" style={{ color: '#7c3aed' }}>{r.hqPct}%</td>
                  <td className="px-3 py-2 font-bold" style={{ color: C.gold }}>{fmtINR(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ Source Analytics + Occasion Breakdown ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Source Analytics */}
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          <div className="px-4 py-3 font-bold flex items-center gap-2" style={{ background: 'rgba(37,99,235,0.04)', color: '#2563eb', borderBottom: `1px solid ${C.border}` }}>
            📢 Source Analytics
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                  {['Source', 'Leads', 'HQ', 'HQ %', 'Conv', 'Rate', 'Revenue'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sourceBreakdown.map((s, idx) => (
                  <tr key={s.source} style={{ borderBottom: idx < sourceBreakdown.length - 1 ? `1px solid ${C.border}` : 'none', background: C.cardBg }}>
                    <td className="px-3 py-2 font-bold" style={{ color: C.text }}>{s.source}</td>
                    <td className="px-3 py-2" style={{ color: C.text }}>{s.total}</td>
                    <td className="px-3 py-2 font-bold" style={{ color: '#7c3aed' }}>{s.hq}</td>
                    <td className="px-3 py-2" style={{ color: '#7c3aed' }}>{s.hqPct}%</td>
                    <td className="px-3 py-2 font-bold" style={{ color: '#16a34a' }}>{s.converted}</td>
                    <td className="px-3 py-2">
                      <span className="font-bold" style={{ color: s.convRate >= 10 ? '#16a34a' : '#d97706' }}>{s.convRate}%</span>
                    </td>
                    <td className="px-3 py-2 font-bold" style={{ color: C.gold }}>{fmtINR(s.revenue)}</td>
                  </tr>
                ))}
                {sourceBreakdown.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-sm" style={{ color: C.textMuted }}>No data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Occasion Breakdown */}
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          <div className="px-4 py-3 font-bold flex items-center gap-2" style={{ background: 'rgba(22,163,74,0.04)', color: '#16a34a', borderBottom: `1px solid ${C.border}` }}>
            🎉 Occasion Breakdown
          </div>
          <div>
            {occasionBreakdown.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm" style={{ color: C.textMuted }}>No data</div>
            ) : occasionBreakdown.map((o, idx) => (
              <div key={o.occasion} className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: idx < occasionBreakdown.length - 1 ? `1px solid ${C.border}` : 'none', background: C.cardBg }}>
                <div>
                  <div className="font-bold text-sm" style={{ color: C.text }}>{o.occasion}</div>
                  <div className="text-xs" style={{ color: C.textMuted }}>{o.total} leads · {o.hq} HQ ({o.hqPct}%) · {o.converted} converted</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm" style={{ color: C.gold }}>{fmtINR(o.revenue)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Pipeline Breakdown + Quality + Country ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* YTQ Status Breakdown */}
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          <div className="px-4 py-3 font-bold flex items-center gap-2 text-sm" style={{ background: 'rgba(37,99,235,0.04)', color: '#2563eb', borderBottom: `1px solid ${C.border}` }}>
            <div className="w-2 h-2 rounded-full" style={{ background: '#2563eb' }} />
            YTQ Pipeline
          </div>
          <div>
            {ytqStatusBreakdown.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm" style={{ color: C.textMuted }}>No leads</div>
            ) : ytqStatusBreakdown.map(([status, count], idx) => {
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
              return (
                <div key={status} className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: idx < ytqStatusBreakdown.length - 1 ? `1px solid ${C.border}` : 'none', background: C.cardBg }}>
                  <div className="text-sm" style={{ color: C.text }}>{status}</div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm" style={{ color: C.text }}>{count}</span>
                    <span className="text-[10px]" style={{ color: C.textMuted }}>{pct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Qualified Status Breakdown */}
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          <div className="px-4 py-3 font-bold flex items-center gap-2 text-sm" style={{ background: 'rgba(22,163,74,0.04)', color: '#16a34a', borderBottom: `1px solid ${C.border}` }}>
            <div className="w-2 h-2 rounded-full" style={{ background: '#16a34a' }} />
            Qualified Pipeline
          </div>
          <div>
            {qualStatusBreakdown.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm" style={{ color: C.textMuted }}>No leads</div>
            ) : qualStatusBreakdown.map(([status, count], idx) => {
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
              return (
                <div key={status} className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: idx < qualStatusBreakdown.length - 1 ? `1px solid ${C.border}` : 'none', background: C.cardBg }}>
                  <div className="text-sm" style={{ color: C.text }}>{status}</div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm" style={{ color: C.text }}>{count}</span>
                    <span className="text-[10px]" style={{ color: C.textMuted }}>{pct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quality + Country */}
        <div className="space-y-6">
          {/* Quality */}
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <div className="px-4 py-3 font-bold text-sm" style={{ background: C.bg, color: C.text, borderBottom: `1px solid ${C.border}` }}>
              ⭐ Lead Quality
            </div>
            <div>
              {Object.entries(qualityBreakdown).map(([quality, count]) => {
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
                const colors = QUALITY_COLORS[quality] || QUALITY_COLORS['Avg']
                return (
                  <div key={quality} className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}`, background: C.cardBg }}>
                    <div className="flex items-center gap-2">
                      <Badge color={colors.color} bg={colors.bg}>{quality}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={pct} max={100} color={colors.color} />
                      <span className="font-bold text-sm min-w-[40px] text-right" style={{ color: C.text }}>{count}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Country */}
          {countryBreakdown.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <div className="px-4 py-3 font-bold text-sm" style={{ background: C.bg, color: C.text, borderBottom: `1px solid ${C.border}` }}>
                🌍 By Country
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="w-full text-sm">
                  <thead><tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                    {['Country', 'Leads', 'HQ', 'HQ %', 'Converted', 'Conv %'].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {countryBreakdown.map((c, idx) => (
                      <tr key={c.country} style={{ borderBottom: idx < countryBreakdown.length - 1 ? `1px solid ${C.border}` : 'none', background: C.cardBg }}>
                        <td className="px-3 py-2 font-bold" style={{ color: C.text }}>{c.country}</td>
                        <td className="px-3 py-2" style={{ color: C.text }}>{c.total}</td>
                        <td className="px-3 py-2 font-bold" style={{ color: '#7c3aed' }}>{c.hq}</td>
                        <td className="px-3 py-2" style={{ color: '#7c3aed' }}>{c.hqPct}%</td>
                        <td className="px-3 py-2 font-bold" style={{ color: '#16a34a' }}>{c.converted}</td>
                        <td className="px-3 py-2" style={{ color: c.convRate >= 10 ? '#16a34a' : '#d97706' }}>{c.convRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Stylist performance by country ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
        {[{ title: '🇮🇳 Stylist × India', rows: stylistByCountry.india }, { title: '🌎 Stylist × US / Overseas', rows: stylistByCountry.us }].map(tbl => (
          <div key={tbl.title} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <div className="px-4 py-3 font-bold text-sm" style={{ background: C.bg, color: C.text, borderBottom: `1px solid ${C.border}` }}>{tbl.title}</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-sm">
                <thead><tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                  {['Stylist', 'Leads', 'HQ', 'HQ %', 'Converted', 'Conv %'].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {tbl.rows.map((r, idx) => (
                    <tr key={r.name} style={{ borderBottom: idx < tbl.rows.length - 1 ? `1px solid ${C.border}` : 'none', background: C.cardBg }}>
                      <td className="px-3 py-2 font-bold" style={{ color: C.text }}>{r.name}</td>
                      <td className="px-3 py-2" style={{ color: C.text }}>{r.total}</td>
                      <td className="px-3 py-2 font-bold" style={{ color: '#7c3aed' }}>{r.hq}</td>
                      <td className="px-3 py-2" style={{ color: '#7c3aed' }}>{r.hqPct}%</td>
                      <td className="px-3 py-2 font-bold" style={{ color: '#16a34a' }}>{r.converted}</td>
                      <td className="px-3 py-2" style={{ color: r.convPct >= 10 ? '#16a34a' : '#d97706' }}>{r.convPct}%</td>
                    </tr>
                  ))}
                  {tbl.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm" style={{ color: C.textMuted }}>No data</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Funnel + Objections ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="rounded-xl p-4" style={{ border: `1px solid ${C.border}`, background: C.cardBg }}>
          <div className="font-bold text-sm mb-3" style={{ color: C.text }}>Conversion funnel</div>
          <div className="flex justify-center pt-1"><FunnelChart stages={funnelStages} /></div>
        </div>
        <div className="rounded-xl p-4" style={{ border: `1px solid ${C.border}`, background: C.cardBg }}>
          <div className="font-bold text-sm mb-3" style={{ color: C.text }}>Why leads are lost</div>
          {objections.length === 0 ? <div className="text-xs" style={{ color: C.textMuted }}>No data</div> :
            objections.map(o => (
              <div key={o.r} className="flex items-center gap-2 mb-1.5">
                <div className="text-xs w-40 flex-shrink-0 truncate" style={{ color: C.textMuted }}>{o.r}</div>
                <div className="flex-1 h-3 rounded-full" style={{ background: C.borderLight }}>
                  <div className="h-3 rounded-full" style={{ width: `${Math.round(o.c / objections[0].c * 100)}%`, background: '#dc2626', opacity: 0.8 }} />
                </div>
                <div className="text-xs font-bold w-8 text-right" style={{ color: C.text }}>{o.c}</div>
              </div>
            ))}
        </div>
      </div>

      {/* ═══ Monthly trends ═══ */}
      <div className="rounded-xl p-4 mb-4 sm:mb-6" style={{ border: `1px solid ${C.border}`, background: C.cardBg }}>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="font-bold text-sm" style={{ color: C.text }}>Daily leads across months</div>
          <div className="ml-auto flex gap-1">
            {[{ k: 'leads', l: 'Leads' }, { k: 'conversions', l: 'Conversions' }].map(mt => (
              <button key={mt.k} onClick={() => setMonthlyMetric(mt.k)} className="text-xs font-bold px-3 py-1 rounded-lg" style={{ background: monthlyMetric === mt.k ? C.gold : 'transparent', color: monthlyMetric === mt.k ? '#fff' : C.textMuted, border: monthlyMetric === mt.k ? 'none' : `1px solid ${C.border}` }}>{mt.l}</button>
            ))}
          </div>
        </div>
        <MultiLineChart series={monthlySeries} />
      </div>
    </div>
  )
}

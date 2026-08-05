/* ═══════════════════════════════════════════════════════════════════════════
   LEADS LIST — v4: Expandable rows with context panels
   YTQ: last call outcome, notes, attempt info, lead age
   Qualified: occasion, products, requirements, mini activity timeline
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { C, fmtDate } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { Input, Select, Badge, Btn } from './ui'
import {
  ALL_STATUSES, LEAD_QUALITIES, QUALITY_COLORS, PHASE_COLORS,
  getSubPhase, YET_TO_CONNECT_STATUSES, CONNECTED_STATUSES,
  NEXT_ATTEMPT_STATUS, COUNTRIES
} from './constants'
import { useLeadMasterLists } from './useLeadMasterLists'
import { useIsMobile } from './useIsMobile'
import { filterStylists } from '../../lib/helpers'
import { leadCapiBadge } from './leadCapi'

const MetaPill = ({ lead }) => {
  const cb = leadCapiBadge(lead)
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: cb.bg, color: cb.color }} title={cb.title}>
      {cb.label}
    </span>
  )
}


// ─── Attempt helpers ─────────────────────────────────────────────────────
const ATTEMPT_ONLY = ['Attempt 1', 'Attempt 2', 'Attempt 3']

const getAttemptInfo = (lead) => {
  const sub = getSubPhase(lead?.status)
  if (sub === 'yet_to_connect') {
    if (lead.status === 'New') return { label: 'New', color: '#f97316', sub: 'ytc' }
    // Extract attempt number from status like 'Attempt 1' → 1
    const attemptIdx = ATTEMPT_ONLY.indexOf(lead.status)
    const current = attemptIdx >= 0 ? attemptIdx + 1 : (lead.attempt_count || 1)
    return { label: `${current} of 3`, color: '#f97316', sub: 'ytc' }
  }
  if (sub === 'connected') {
    const statusIdx = CONNECTED_STATUSES.indexOf(lead.status)
    const current = statusIdx >= 0 ? statusIdx + 1 : (lead.connected_attempt_count || 1)
    return { label: `${current} of 3`, color: '#16a34a', sub: 'connected' }
  }
  return null
}

const SUB_PHASE_BADGE = {
  ytc: { label: 'Yet to Connect', color: '#f97316', bg: 'rgba(249,115,22,0.08)' },
  connected: { label: 'Connected', color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
}

// ─── Format time to IST AM/PM ────────────────────────────────────────────
const formatTimeIST = (val) => {
  if (!val) return null
  if (/am|pm/i.test(val)) return val
  const parts = val.split(':')
  if (parts.length < 2) return val
  let h = parseInt(parts[0], 10)
  const m = parts[1]
  const ampm = h >= 12 ? 'PM' : 'AM'
  if (h > 12) h -= 12
  if (h === 0) h = 12
  return `${h}:${m} ${ampm} IST`
}

// ─── Lead age ────────────────────────────────────────────────────────────
const getLeadAge = (leadDate) => {
  if (!leadDate) return null
  const diff = Math.floor((Date.now() - new Date(leadDate).getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return '1 day old'
  return `${diff} days old`
}

// ─── Format interaction timestamp ────────────────────────────────────────
const fmtInteractionDate = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const day = d.getDate()
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
  let h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  if (h > 12) h -= 12
  if (h === 0) h = 12
  return `${day} ${mon}, ${h}:${m} ${ampm}`
}

// ─── Interaction type styling ────────────────────────────────────────────
const INTERACTION_COLORS = {
  call: '#2563eb',
  status_change: '#8b5cf6',
  qualification: '#16a34a',
  note: '#f59e0b',
  order: '#06b6d4',
}

// ─── Context Panel for YTQ ───────────────────────────────────────────────
const YTQContextPanel = ({ lead, interactions, loading }) => {
  const lastCall = interactions.find(i => i.interaction_type?.toLowerCase() === 'call')
  const lastNote = interactions.find(i => i.note)

  return (
    <div
      className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2"
      style={{ background: C.bg, borderTop: `1px solid ${C.border}` }}
    >
      {loading ? (
        <div className="col-span-2 text-xs py-2" style={{ color: C.textMuted }}>Loading context...</div>
      ) : (
        <>
          <div>
            <div className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Last call outcome</div>
            <div className="text-xs mt-0.5" style={{ color: lastCall ? C.text : C.textMuted }}>
              {lastCall ? (lastCall.outcome || 'Call logged') : 'No calls yet'}
            </div>
            {lastCall && lastCall.note && (
              <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>
                "{lastCall.note}"
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Last note</div>
            <div className="text-xs mt-0.5" style={{ color: lastNote ? C.text : C.textMuted }}>
              {lastNote ? lastNote.note : (lead.client_requirements || 'No notes yet')}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Attempts</div>
            <div className="text-xs mt-0.5" style={{ color: C.text }}>
              {lead.attempt_count || 0} attempt{(lead.attempt_count || 0) !== 1 ? 's' : ''}
              {' · '}
              {lead.connected_attempt_count || 0} connected
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Lead age</div>
            <div className="text-xs mt-0.5" style={{ color: C.text }}>
              {getLeadAge(lead.lead_date) || '—'}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Context Panel for Qualified ─────────────────────────────────────────
const QualifiedContextPanel = ({ lead, interactions, loading }) => {
  const recentActivity = interactions.slice(0, 3)

  return (
    <div style={{ borderTop: `1px solid ${C.border}` }}>
      <div
        className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2"
        style={{ background: C.bg }}
      >
        {loading ? (
          <div className="col-span-2 text-xs py-2" style={{ color: C.textMuted }}>Loading context...</div>
        ) : (
          <>
            <div>
              <div className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Occasion</div>
              <div className="text-xs mt-0.5" style={{ color: lead.occasion ? C.text : C.textMuted }}>
                {lead.occasion || 'Not set'}
                {lead.occasion_date && <span style={{ color: C.textMuted }}> · {fmtDate(lead.occasion_date)}</span>}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Products interested</div>
              <div className="text-xs mt-0.5" style={{ color: lead.products_interested ? C.text : C.textMuted }}>
                {lead.products_interested || 'Not specified'}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Client requirements</div>
              <div className="text-xs mt-0.5" style={{ color: lead.client_requirements ? C.text : C.textMuted }}>
                {lead.client_requirements || 'No requirements noted'}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Mini activity timeline */}
      {!loading && recentActivity.length > 0 && (
        <div className="px-4 py-2" style={{ background: C.bg, borderTop: `1px dashed ${C.border}` }}>
          <div className="text-[10px] font-bold uppercase mb-1.5" style={{ color: C.textMuted }}>Recent activity</div>
          {recentActivity.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-start py-1">
              <div
                className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                style={{ background: INTERACTION_COLORS[item.interaction_type] || C.textMuted }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs" style={{ color: C.text }}>
                  {item.outcome && <span className="font-bold">{item.outcome}</span>}
                  {item.outcome && item.note && ' — '}
                  {item.note || (item.interaction_type === 'status_change' ? `Status → ${item.new_status || ''}` : item.interaction_type)}
                </div>
                <div className="text-[10px]" style={{ color: C.textMuted }}>
                  {fmtInteractionDate(item.created_at)}
                  {item.created_by && ` · ${item.created_by}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
export const LeadsList = ({
  leads = [],
  showFilters = false,
  onUpdate,
  onEdit,
  onLinkOrder,
  currentPage = 1,
  pageSize = 50,
  onPageChange,
  onPageSizeChange,
  teamMembers = [],
  filters = {},
  viewMode = 'all', // 'all' | 'ytq' | 'qualified' | 'converted' | 'archive'
}) => {
  const lists = useLeadMasterLists()
  const isMobile = useIsMobile()
  const [searchText, setSearchText] = useState('')
  // Which leads already have a linked order (lead_orders) — to flag unlinked conversions
  const [linkedLeadIds, setLinkedLeadIds] = useState(() => new Set())
  useEffect(() => {
    const ids = leads.filter(l => l.status === 'Converted' && !l.order_id).map(l => l.id)
    if (!ids.length) { setLinkedLeadIds(new Set()); return }
    let cancelled = false
    ;(async () => {
      let rows = []
      for (let i = 0; i < ids.length; i += 200) { const { data } = await supa.from('lead_orders').select('lead_id').in('lead_id', ids.slice(i, i + 200)); rows = rows.concat(data || []) }
      if (!cancelled) setLinkedLeadIds(new Set(rows.map(r => r.lead_id)))
    })()
    return () => { cancelled = true }
  }, [leads])
  const needsLink = (l) => l.status === 'Converted' && !l.order_id && !linkedLeadIds.has(l.id)
  const [showFiltersPanel, setShowFiltersPanel] = useState(false)
  const [localFilters, setLocalFilters] = useState(() => {
    const t = new Date()
    const p = (x) => String(x).padStart(2, '0')
    const ymd = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    const start = ymd(new Date(t.getFullYear(), t.getMonth(), 1))
    const end = ymd(new Date(t.getFullYear(), t.getMonth() + 1, 0))
    return { datePreset: 'this_month', dateStart: start, dateEnd: end, ...filters }
  })

  // Expandable rows
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [interactionsCache, setInteractionsCache] = useState({}) // { leadId: { loading, data } }

  const toggleExpand = useCallback(async (leadId) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(leadId)) {
        next.delete(leadId)
      } else {
        next.add(leadId)
        // Fetch interactions if not cached
        if (!interactionsCache[leadId]) {
          setInteractionsCache(pc => ({ ...pc, [leadId]: { loading: true, data: [] } }))
          supa
            .from('lead_interactions')
            .select('*')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })
            .limit(10)
            .then(({ data, error }) => {
              setInteractionsCache(pc => ({
                ...pc,
                [leadId]: { loading: false, data: error ? [] : (data || []) }
              }))
            })
        }
      }
      return next
    })
  }, [interactionsCache])

  const handleFilterChange = (key, value) => {
    setLocalFilters(prev => ({ ...prev, [key]: value }))
    onPageChange?.(1)
  }

  const clearFilters = () => {
    setLocalFilters({})
    setSearchText('')
    onPageChange?.(1)
  }

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  const filtered = useMemo(() => {
    return leads.filter(lead => {
      if (searchText) {
        const q = searchText.toLowerCase()
        const qDigits = q.replace(/\D/g, '') // strip non-digits for phone matching
        const match = (lead.client_name || '').toLowerCase().includes(q)
          || (qDigits.length >= 4 && (lead.phone || '').replace(/\D/g, '').includes(qDigits))
          || (lead.phone || '').toLowerCase().includes(q)
          || (lead.lead_source || '').toLowerCase().includes(q)
          || (lead.client_requirements || '').toLowerCase().includes(q)
          || (lead.email || '').toLowerCase().includes(q)
          || (lead.occasion || '').toLowerCase().includes(q)
        if (!match) return false
      }
      if (localFilters.channel && lead.channel !== localFilters.channel) return false
      if (localFilters.source && lead.lead_source !== localFilters.source) return false
      if (localFilters.location && lead.location !== localFilters.location) return false
      if (localFilters.country && lead.country !== localFilters.country) return false
      if (localFilters.status && lead.status !== localFilters.status) return false
      if (localFilters.quality && lead.lead_quality !== localFilters.quality) return false
      if (localFilters.phase && lead.phase !== localFilters.phase) return false
      if (localFilters.assigned && lead.assigned_to !== localFilters.assigned) return false
      if (localFilters.subPhase) {
        const sp = getSubPhase(lead.status)
        if (localFilters.subPhase === 'yet_to_connect' && sp !== 'yet_to_connect') return false
        if (localFilters.subPhase === 'connected' && sp !== 'connected') return false
      }
      if (localFilters.followUp === 'overdue') {
        if (!lead.follow_up_date || lead.follow_up_date.split('T')[0] >= todayStr) return false
      } else if (localFilters.followUp === 'today') {
        if (!lead.follow_up_date || lead.follow_up_date.split('T')[0] !== todayStr) return false
      } else if (localFilters.followUp === 'upcoming') {
        if (!lead.follow_up_date || lead.follow_up_date.split('T')[0] <= todayStr) return false
      }
      if (localFilters.dateStart && (!lead.lead_date || lead.lead_date < localFilters.dateStart)) return false
      if (localFilters.dateEnd && (!lead.lead_date || lead.lead_date > localFilters.dateEnd)) return false
      return true
    })
  }, [leads, localFilters, searchText, todayStr])

  // Smart sorting: new leads (created today, no calls) on top, then overdue, then today, then by follow-up
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      // 1. Brand new leads (created today, status 'New') float to top
      const aNew = a.status === 'New' && a.lead_date === todayStr ? 0 : 1
      const bNew = b.status === 'New' && b.lead_date === todayStr ? 0 : 1
      if (aNew !== bNew) return aNew - bNew
      // Among new leads, most recent first
      if (aNew === 0 && bNew === 0) {
        return (b.created_at || b.lead_date || '').localeCompare(a.created_at || a.lead_date || '')
      }

      // 2. Overdue follow-ups rise to top
      const aOverdue = a.follow_up_date && a.follow_up_date.split('T')[0] < todayStr ? 0 : 1
      const bOverdue = b.follow_up_date && b.follow_up_date.split('T')[0] < todayStr ? 0 : 1
      if (aOverdue !== bOverdue) return aOverdue - bOverdue

      // 3. Today's follow-ups next
      const aToday = a.follow_up_date && a.follow_up_date.split('T')[0] === todayStr ? 0 : 1
      const bToday = b.follow_up_date && b.follow_up_date.split('T')[0] === todayStr ? 0 : 1
      if (aToday !== bToday) return aToday - bToday

      // 4. Sort by follow-up date (earliest first), leads with follow-up before those without
      if (a.follow_up_date && b.follow_up_date) return a.follow_up_date.localeCompare(b.follow_up_date)
      if (a.follow_up_date) return -1
      if (b.follow_up_date) return 1

      // 5. Fallback: most recently created first
      return (b.lead_date || '').localeCompare(a.lead_date || '')
    })
  }, [filtered, todayStr])

  const totalPages = Math.ceil(sorted.length / pageSize)
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const hasActiveFilters = searchText || Object.values(localFilters).some(v => v)

  const isOverdue = (d) => d && d.split('T')[0] < todayStr
  const isToday = (d) => d && d.split('T')[0] === todayStr

  const isYTQ = viewMode === 'ytq'
  const isQualifiedView = viewMode === 'qualified'
  const colCount = isYTQ ? 8 : 8

  return (
    <div>
      {/* Search */}
      <div className="mb-4 flex gap-2 sm:gap-3 items-center flex-wrap">
        <div className="flex-1 min-w-[180px] relative">
          <Input
            type="text"
            placeholder="Search name, phone, source..."
            value={searchText}
            onChange={e => { setSearchText(e.target.value); onPageChange?.(1) }}
            style={{ paddingLeft: '2.5rem' }}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: C.textMuted }}>🔍</span>
        </div>
        <div className="text-xs sm:text-sm font-bold whitespace-nowrap" style={{ color: C.textMuted }}>
          {sorted.length} lead{sorted.length !== 1 ? 's' : ''}
        </div>
        {isMobile && showFilters && (
          <button
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            className="px-3 py-2 rounded-lg text-xs font-bold"
            style={{ background: showFiltersPanel || hasActiveFilters ? C.gold + '15' : C.bg, border: `1px solid ${hasActiveFilters ? C.gold : C.border}`, color: hasActiveFilters ? C.gold : C.text }}
          >
            ☰ Filters{hasActiveFilters ? ' •' : ''}
          </button>
        )}
        {hasActiveFilters && <Btn small onClick={clearFilters} style={{ color: C.red }}>Clear</Btn>}
      </div>

      {/* Filters — collapsible on mobile */}
      {showFilters && (!isMobile || showFiltersPanel) && (
        <div className="mb-4 p-3 sm:p-4 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-2 sm:gap-3">
            {/* Phase & Sub-Phase only on All Leads tab */}
            {viewMode === 'all' && (
              <>
                <div>
                  <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Phase</label>
                  <Select value={localFilters.phase || ''} onChange={e => handleFilterChange('phase', e.target.value)}>
                    <option value="">All Phases</option>
                    <option value="yet_to_qualify">Yet to Qualify</option>
                    <option value="qualified">Qualified</option>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Sub-Phase</label>
                  <Select value={localFilters.subPhase || ''} onChange={e => handleFilterChange('subPhase', e.target.value)}>
                    <option value="">All</option>
                    <option value="yet_to_connect">Yet to Connect</option>
                    <option value="connected">Connected</option>
                  </Select>
                </div>
              </>
            )}
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Channel</label>
              <Select value={localFilters.channel || ''} onChange={e => handleFilterChange('channel', e.target.value)}>
                <option value="">All Channels</option>
                {lists.channels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Source</label>
              <Select value={localFilters.source || ''} onChange={e => handleFilterChange('source', e.target.value)}>
                <option value="">All Sources</option>
                {lists.lead_sources.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Country</label>
              <Select value={localFilters.country || ''} onChange={e => handleFilterChange('country', e.target.value)}>
                <option value="">All Countries</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Status</label>
              <Select value={localFilters.status || ''} onChange={e => handleFilterChange('status', e.target.value)}>
                <option value="">All Status</option>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Quality</label>
              <Select value={localFilters.quality || ''} onChange={e => handleFilterChange('quality', e.target.value)}>
                <option value="">All Quality</option>
                {LEAD_QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Assigned</label>
              <Select value={localFilters.assigned || ''} onChange={e => handleFilterChange('assigned', e.target.value)}>
                <option value="">All</option>
                {filterStylists(teamMembers).map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Follow-up</label>
              <Select value={localFilters.followUp || ''} onChange={e => handleFilterChange('followUp', e.target.value)}>
                <option value="">All</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due Today</option>
                <option value="upcoming">Upcoming</option>
              </Select>
            </div>
            {/* Date range with presets */}
            <div>
              <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Date Range</label>
              <Select value={localFilters.datePreset || ''} onChange={e => {
                const preset = e.target.value
                const t = new Date()
                const p = (x) => String(x).padStart(2, '0')
                const toISO = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
                if (preset === 'today') {
                  handleFilterChange('dateStart', toISO(t)); handleFilterChange('dateEnd', toISO(t))
                } else if (preset === 'yesterday') {
                  const y = new Date(t); y.setDate(t.getDate() - 1)
                  handleFilterChange('dateStart', toISO(y)); handleFilterChange('dateEnd', toISO(y))
                } else if (preset === 'this_week') {
                  const day = t.getDay()
                  const mon = new Date(t); mon.setDate(t.getDate() - (day === 0 ? 6 : day - 1))
                  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
                  handleFilterChange('dateStart', toISO(mon)); handleFilterChange('dateEnd', toISO(sun))
                } else if (preset === 'this_month') {
                  handleFilterChange('dateStart', toISO(new Date(t.getFullYear(), t.getMonth(), 1)))
                  handleFilterChange('dateEnd', toISO(new Date(t.getFullYear(), t.getMonth() + 1, 0)))
                } else if (preset === 'last_month') {
                  handleFilterChange('dateStart', toISO(new Date(t.getFullYear(), t.getMonth() - 1, 1)))
                  handleFilterChange('dateEnd', toISO(new Date(t.getFullYear(), t.getMonth(), 0)))
                } else if (preset === 'custom') {
                  // keep existing dates
                } else {
                  handleFilterChange('dateStart', ''); handleFilterChange('dateEnd', '')
                }
                handleFilterChange('datePreset', preset)
              }}>
                <option value="this_month">This Month</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="this_week">This Week</option>
                <option value="last_month">Last Month</option>
                <option value="">All Time</option>
                <option value="custom">Custom Range</option>
              </Select>
            </div>
            {localFilters.datePreset === 'custom' && (
              <div className="col-span-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>From</label>
                  <Input type="date" value={localFilters.dateStart || ''} onChange={e => { handleFilterChange('dateStart', e.target.value); handleFilterChange('datePreset', 'custom') }} />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>To</label>
                  <Input type="date" value={localFilters.dateEnd || ''} onChange={e => { handleFilterChange('dateEnd', e.target.value); handleFilterChange('datePreset', 'custom') }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile Card Layout */}
      {isMobile ? (
        <div className="space-y-3">
          {paginated.length === 0 ? (
            <div className="px-4 py-8 text-center rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.textMuted }}>
              {hasActiveFilters ? 'No leads match your filters' : 'No leads found'}
            </div>
          ) : paginated.map(lead => {
            const qualC = QUALITY_COLORS[lead.lead_quality] || QUALITY_COLORS['Avg']
            const phaseC = PHASE_COLORS[lead.phase] || PHASE_COLORS.yet_to_qualify
            const overdue = isOverdue(lead.follow_up_date)
            const dueToday = isToday(lead.follow_up_date)
            const assignee = teamMembers.find(tm => String(tm.id) === String(lead.assigned_to))
            const attemptInfo = isYTQ ? getAttemptInfo(lead) : null
            const subBadge = attemptInfo ? SUB_PHASE_BADGE[attemptInfo.sub] : null
            const borderColor = attemptInfo ? attemptInfo.color : (phaseC?.color || C.gold)
            const isExpanded = expandedRows.has(lead.id)
            const cachedInteractions = interactionsCache[lead.id]

            return (
              <div
                key={lead.id}
                className="rounded-xl overflow-hidden"
                style={{
                  background: overdue ? 'rgba(239,68,68,0.03)' : dueToday ? 'rgba(245,158,11,0.03)' : C.cardBg,
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${borderColor}`,
                }}
              >
                {/* Card header — name + status */}
                <div className="px-3 py-2.5" onClick={() => toggleExpand(lead.id)}>
                  <div className="flex justify-between items-start mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate" style={{ color: C.text }}>{lead.client_name || '—'}</div>
                      {assignee && <div className="text-[10px]" style={{ color: C.textMuted }}>{assignee.name}</div>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                      {isYTQ && subBadge ? (
                        <Badge color={subBadge.color} bg={subBadge.bg}>{subBadge.label}</Badge>
                      ) : (
                        <Badge color={phaseC.color} bg={phaseC.bg}>{phaseC.label}</Badge>
                      )}
                      {lead.lead_quality && (
                        <Badge color={qualC.color} bg={qualC.bg}>{lead.lead_quality}</Badge>
                      )}
                      <MetaPill lead={lead} />
                    </div>
                  </div>

                  {/* Phone + channel row */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <a
                      href={`tel:${lead.phone}`}
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1.5 text-sm font-bold no-underline"
                      style={{ color: '#2563eb' }}
                    >
                      <span style={{ fontSize: '14px' }}>📞</span>
                      {lead.phone}
                    </a>
                    {lead.channel && (
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold"
                        style={{
                          background: lead.channel === 'In-store' ? 'rgba(124,58,237,0.08)' : 'rgba(37,99,235,0.08)',
                          color: lead.channel === 'In-store' ? '#7c3aed' : '#2563eb',
                        }}
                      >
                        {lead.channel}
                      </span>
                    )}
                  </div>

                  {/* Info chips row */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: C.textMuted }}>
                    <span>{lead.lead_source || '—'}</span>
                    <span style={{ color: C.text }}>{lead.status}</span>
                    {isYTQ && attemptInfo && (
                      <span style={{ color: attemptInfo.color, fontWeight: 700 }}>Attempt {attemptInfo.label}</span>
                    )}
                    {lead.occasion && <span>{lead.occasion}</span>}
                  </div>

                  {/* Follow-up row */}
                  {(lead.follow_up_date || lead.call_back_time) && (
                    <div className="flex gap-3 mt-1.5 text-xs">
                      {lead.follow_up_date && (
                        <span className="font-bold" style={{ color: overdue ? C.red : dueToday ? C.amber : C.text }}>
                          {overdue ? '⚠ ' : dueToday ? '📌 ' : '📅 '}{fmtDate(lead.follow_up_date)}
                        </span>
                      )}
                      {lead.call_back_time && (
                        <span className="font-bold" style={{ color: C.amber }}>
                          🕐 {formatTimeIST(lead.call_back_time)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div
                  className="px-3 py-2 flex gap-2 items-center"
                  style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}
                  onClick={e => e.stopPropagation()}
                >
                  <Btn small onClick={() => onUpdate?.(lead)} style={{ flex: 1 }}>📞 Log Call</Btn>
                  {onLinkOrder && needsLink(lead) && <Btn small onClick={() => onLinkOrder(lead)} style={{ color: '#2563eb' }}>🔗 Link order</Btn>}
                  <Btn small onClick={() => onEdit?.(lead)} style={{ color: C.gold }}>✎ Edit</Btn>
                  <button
                    onClick={() => toggleExpand(lead.id)}
                    className="text-sm px-2 py-1 rounded transition-all"
                    style={{ color: C.textMuted }}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                </div>

                {/* Expanded context panel */}
                {isExpanded && (
                  isYTQ ? (
                    <YTQContextPanel
                      lead={lead}
                      interactions={cachedInteractions?.data || []}
                      loading={cachedInteractions?.loading || false}
                    />
                  ) : (
                    <QualifiedContextPanel
                      lead={lead}
                      interactions={cachedInteractions?.data || []}
                      loading={cachedInteractions?.loading || false}
                    />
                  )
                )}
              </div>
            )
          })}
        </div>
      ) : (
      /* Desktop Table Layout */
      <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
              <th className="px-3 py-3 text-left font-bold" style={{ color: C.text }}>Client</th>
              <th className="px-3 py-3 text-left font-bold" style={{ color: C.text }}>Phone</th>
              {isYTQ ? (
                <>
                  <th className="px-3 py-3 text-left font-bold" style={{ color: C.text }}>Sub-Phase</th>
                  <th className="px-3 py-3 text-left font-bold" style={{ color: C.text }}>Attempt</th>
                  <th className="px-3 py-3 text-left font-bold" style={{ color: C.text }}>Source</th>
                  <th className="px-3 py-3 text-left font-bold" style={{ color: C.text }}>Follow-up</th>
                  <th className="px-3 py-3 text-left font-bold" style={{ color: C.text }}>Callback</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-3 text-left font-bold" style={{ color: C.text }}>Date</th>
                  <th className="px-3 py-3 text-left font-bold" style={{ color: C.text }}>Status</th>
                  <th className="px-3 py-3 text-left font-bold" style={{ color: C.text }}>Quality</th>
                  <th className="px-3 py-3 text-left font-bold" style={{ color: C.text }}>Source</th>
                  <th className="px-3 py-3 text-left font-bold" style={{ color: C.text }}>Follow-up</th>
                </>
              )}
              <th className="px-3 py-3 text-center font-bold" style={{ color: C.text }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center" style={{ color: C.textMuted }}>
                  {hasActiveFilters ? 'No leads match your filters' : 'No leads found'}
                </td>
              </tr>
            ) : paginated.map(lead => {
              const qualC = QUALITY_COLORS[lead.lead_quality] || QUALITY_COLORS['Avg']
              const phaseC = PHASE_COLORS[lead.phase] || PHASE_COLORS.yet_to_qualify
              const overdue = isOverdue(lead.follow_up_date)
              const dueToday = isToday(lead.follow_up_date)
              const assignee = teamMembers.find(tm => String(tm.id) === String(lead.assigned_to))
              const attemptInfo = isYTQ ? getAttemptInfo(lead) : null
              const subBadge = attemptInfo ? SUB_PHASE_BADGE[attemptInfo.sub] : null
              const borderColor = attemptInfo ? attemptInfo.color : 'transparent'
              const isExpanded = expandedRows.has(lead.id)
              const cachedInteractions = interactionsCache[lead.id]

              return (
                <React.Fragment key={lead.id}>
                  <tr
                    style={{
                      borderBottom: isExpanded ? 'none' : `1px solid ${C.border}`,
                      background: overdue ? 'rgba(239,68,68,0.03)' : dueToday ? 'rgba(245,158,11,0.03)' : C.cardBg,
                      borderLeft: isYTQ ? `3px solid ${borderColor}` : 'none',
                      cursor: 'pointer',
                    }}
                    className="hover:bg-gray-50 transition-colors"
                    onClick={() => toggleExpand(lead.id)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-sm" style={{ color: C.text }}>{lead.client_name || '—'}</div>
                      {assignee && <div className="text-[10px]" style={{ color: C.textMuted }}>{assignee.name}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div style={{ color: C.text }}>{lead.phone}</div>
                      {lead.channel && (
                        <span
                          className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            background: lead.channel === 'In-store' ? 'rgba(124,58,237,0.08)' : 'rgba(37,99,235,0.08)',
                            color: lead.channel === 'In-store' ? '#7c3aed' : '#2563eb',
                          }}
                        >
                          {lead.channel}
                        </span>
                      )}
                    </td>

                    {isYTQ ? (
                      <>
                        <td className="px-3 py-2.5">
                          {subBadge && (
                            <Badge color={subBadge.color} bg={subBadge.bg}>{subBadge.label}</Badge>
                          )}
                          <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>{lead.status}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          {attemptInfo && (
                            <span
                              className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                              style={{ background: attemptInfo.color + '12', color: attemptInfo.color }}
                            >
                              {attemptInfo.label}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: C.text }}>{lead.lead_source || lead.channel || '—'}</td>
                        <td className="px-3 py-2.5">
                          {lead.follow_up_date ? (
                            <span className="text-xs font-bold" style={{ color: overdue ? C.red : dueToday ? C.amber : C.text }}>
                              {overdue ? '⚠ ' : dueToday ? '📌 ' : ''}{fmtDate(lead.follow_up_date)}
                            </span>
                          ) : <span style={{ color: C.textMuted }}>—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {lead.call_back_time ? (
                            <span className="text-xs font-bold" style={{ color: C.amber }}>
                              {formatTimeIST(lead.call_back_time)}
                            </span>
                          ) : <span className="text-xs" style={{ color: C.textMuted }}>—</span>}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5">
                          <div className="text-xs" style={{ color: C.text }}>{lead.lead_date ? fmtDate(lead.lead_date) : '—'}</div>
                          {lead.channel && (
                            <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>{lead.channel}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge color={phaseC.color} bg={phaseC.bg}>{lead.status || phaseC.label}</Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          {lead.lead_quality ? (
                            <Badge color={qualC.color} bg={qualC.bg}>{lead.lead_quality}</Badge>
                          ) : <span style={{ color: C.textMuted }}>—</span>}
                          <div className="mt-1"><MetaPill lead={lead} /></div>
                        </td>
                        <td className="px-3 py-2.5 text-xs" style={{ color: C.text }}>{lead.lead_source || '—'}</td>
                        <td className="px-3 py-2.5">
                          {lead.follow_up_date ? (
                            <span className="text-xs font-bold" style={{ color: overdue ? C.red : dueToday ? C.amber : C.text }}>
                              {overdue ? '⚠ ' : dueToday ? '📌 ' : ''}{fmtDate(lead.follow_up_date)}
                            </span>
                          ) : <span style={{ color: C.textMuted }}>—</span>}
                          {lead.call_back_time && (
                            <div className="text-[10px]" style={{ color: C.amber }}>{formatTimeIST(lead.call_back_time)}</div>
                          )}
                        </td>
                      </>
                    )}

                    {/* Actions */}
                    <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5 justify-center items-center">
                        <Btn small onClick={() => onUpdate?.(lead)}>Log Call</Btn>
                        {onLinkOrder && needsLink(lead) && <Btn small onClick={() => onLinkOrder(lead)} style={{ color: '#2563eb' }} title="Link order">🔗</Btn>}
                        <Btn small onClick={() => onEdit?.(lead)} style={{ color: C.gold }}>✎</Btn>
                        <button
                          onClick={() => toggleExpand(lead.id)}
                          className="text-sm px-1.5 py-0.5 rounded transition-all hover:bg-gray-100"
                          style={{ color: C.textMuted }}
                          title={isExpanded ? 'Collapse' : 'View context'}
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded context panel */}
                  {isExpanded && (
                    <tr style={{
                      borderBottom: `1px solid ${C.border}`,
                      borderLeft: isYTQ ? `3px solid ${borderColor}` : 'none',
                    }}>
                      <td colSpan={colCount} className="p-0">
                        {isYTQ ? (
                          <YTQContextPanel
                            lead={lead}
                            interactions={cachedInteractions?.data || []}
                            loading={cachedInteractions?.loading || false}
                          />
                        ) : (
                          <QualifiedContextPanel
                            lead={lead}
                            interactions={cachedInteractions?.data || []}
                            loading={cachedInteractions?.loading || false}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Pagination */}
      {sorted.length > 0 && (
        <div className="mt-4 flex items-center justify-between flex-wrap gap-2 sm:gap-4 px-3 sm:px-4 py-3 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
          {!isMobile && (
            <div className="flex items-center gap-3">
              <span style={{ color: C.textMuted }} className="text-sm">Per page:</span>
              {[25, 50, 100].map(sz => (
                <button
                  key={sz}
                  onClick={() => { onPageSizeChange?.(sz); onPageChange?.(1) }}
                  className="text-sm font-bold px-3 py-1 rounded-lg transition-all"
                  style={{
                    background: pageSize === sz ? C.gold : 'transparent',
                    color: pageSize === sz ? '#fff' : C.text,
                    border: pageSize === sz ? 'none' : `1px solid ${C.border}`
                  }}
                >
                  {sz}
                </button>
              ))}
            </div>
          )}
          <div style={{ color: C.textMuted }} className="text-xs sm:text-sm">
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
          </div>
          <div className="flex gap-1.5 sm:gap-2">
            <Btn small disabled={currentPage === 1} onClick={() => onPageChange?.(1)}>⟨⟨</Btn>
            <Btn small disabled={currentPage === 1} onClick={() => onPageChange?.(currentPage - 1)}>←</Btn>
            <span style={{ color: C.text }} className="px-2 sm:px-3 py-1 text-xs sm:text-sm font-bold">{currentPage}/{totalPages || 1}</span>
            <Btn small disabled={currentPage >= totalPages} onClick={() => onPageChange?.(currentPage + 1)}>→</Btn>
            <Btn small disabled={currentPage >= totalPages} onClick={() => onPageChange?.(totalPages)}>⟩⟩</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

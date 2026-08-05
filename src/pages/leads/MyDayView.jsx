/* ═══════════════════════════════════════════════════════════════════════════
   MY DAY VIEW — v3: Filters, search, timezone, sort, estimated value
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useCallback } from 'react'
import { C, fmtDate } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { Badge, Btn } from './ui'
import {
  QUALITY_COLORS, PHASE_COLORS, getSubPhase, isTerminalStatus,
  YET_TO_CONNECT_STATUSES, CONNECTED_STATUSES, QUALIFIED_ACTIVE_STATUSES
} from './constants'
import { useIsMobile } from './useIsMobile'

const today = () => new Date().toISOString().split('T')[0]
const isPending = (status) => status === 'New' || status === 'Yet to Connect'

const daysDiff = (dateStr) => {
  if (!dateStr) return 0
  const d = new Date(dateStr.split('T')[0])
  const t = new Date(today())
  return Math.round((t - d) / (1000 * 60 * 60 * 24))
}

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
  return `${h}:${m} ${ampm}`
}

// ─── Country → UTC offset map (IST = +5.5) ─────────────────────────────
const COUNTRY_TZ = {
  'India': 5.5, 'IN': 5.5,
  'USA': -5, 'US': -5, 'United States': -5,
  'UK': 0, 'United Kingdom': 0, 'GB': 0,
  'UAE': 4, 'Dubai': 4, 'AE': 4,
  'Saudi Arabia': 3, 'SA': 3, 'KSA': 3,
  'Qatar': 3, 'QA': 3,
  'Kuwait': 3, 'KW': 3,
  'Bahrain': 3, 'BH': 3,
  'Oman': 4, 'OM': 4,
  'Singapore': 8, 'SG': 8,
  'Malaysia': 8, 'MY': 8,
  'Australia': 10, 'AU': 10,
  'Canada': -5, 'CA': -5,
  'Germany': 1, 'DE': 1,
  'France': 1, 'FR': 1,
  'Italy': 1, 'IT': 1,
  'Netherlands': 1, 'NL': 1,
  'Switzerland': 1, 'CH': 1,
  'Japan': 9, 'JP': 9,
  'South Korea': 9, 'KR': 9,
  'China': 8, 'CN': 8,
  'Hong Kong': 8, 'HK': 8,
  'Thailand': 7, 'TH': 7,
  'Indonesia': 7, 'ID': 7,
  'Sri Lanka': 5.5, 'LK': 5.5,
  'Bangladesh': 6, 'BD': 6,
  'Nepal': 5.75, 'NP': 5.75,
  'Pakistan': 5, 'PK': 5,
  'South Africa': 2, 'ZA': 2,
  'Kenya': 3, 'KE': 3,
  'Nigeria': 1, 'NG': 1,
  'Egypt': 2, 'EG': 2,
  'New Zealand': 12, 'NZ': 12,
  'Russia': 3, 'RU': 3,
  'Turkey': 3, 'TR': 3,
  'Brazil': -3, 'BR': -3,
  'Mexico': -6, 'MX': -6,
}

const getLocalHour = (country) => {
  if (!country) return null
  const offset = COUNTRY_TZ[country]
  if (offset === undefined) return null
  const now = new Date()
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60
  let localH = utcH + offset
  if (localH < 0) localH += 24
  if (localH >= 24) localH -= 24
  return localH
}

const formatLocalTime = (country) => {
  if (!country) return null
  const offset = COUNTRY_TZ[country]
  if (offset === undefined) return null
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000
  const localMs = utcMs + offset * 3600000
  const local = new Date(localMs)
  let h = local.getHours()
  const m = String(local.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  if (h > 12) h -= 12
  if (h === 0) h = 12
  return `${h}:${m} ${ampm}`
}

const isCallableNow = (country) => {
  const h = getLocalHour(country)
  if (h === null) return null // unknown
  return h >= 9 && h < 19 // 9 AM to 7 PM local
}

const fmtAmount = (amt) => {
  if (!amt) return null
  const n = Number(amt)
  if (isNaN(n) || n <= 0) return null
  if (n >= 100000) return `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
  return `${n}`
}

// ─── Filter Dropdown ────────────────────────────────────────────────────
const FilterDropdown = ({ label, icon, options, value, onChange }) => {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
        style={{
          background: value ? 'rgba(37,99,235,0.08)' : C.cardBg,
          border: `1px solid ${value ? '#2563eb' : C.border}`,
          color: value ? '#2563eb' : C.textMuted,
        }}
      >
        <span>{icon}</span>
        <span>{value || label}</span>
        {value && (
          <span
            onClick={e => { e.stopPropagation(); onChange(''); setOpen(false) }}
            className="ml-0.5 hover:opacity-60"
          >✕</span>
        )}
        {!value && <span style={{ fontSize: 8 }}>▼</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full mt-1 z-50 rounded-xl shadow-lg py-1 max-h-60 overflow-auto min-w-[160px]"
            style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
          >
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80 transition-all"
                style={{
                  color: opt === value ? '#2563eb' : C.text,
                  background: opt === value ? 'rgba(37,99,235,0.06)' : 'transparent',
                  fontWeight: opt === value ? 700 : 400,
                }}
              >
                {opt}
              </button>
            ))}
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs" style={{ color: C.textMuted }}>No options</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sort Dropdown ──────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { key: 'default', label: 'Default' },
  { key: 'value_desc', label: 'Value: High → Low' },
  { key: 'overdue_desc', label: 'Most Overdue First' },
  { key: 'callback', label: 'Callback Time' },
]

const sortLeads = (leads, sortKey) => {
  if (sortKey === 'default') return leads
  const sorted = [...leads]
  if (sortKey === 'value_desc') {
    sorted.sort((a, b) => (Number(b.est_invoice_amount) || 0) - (Number(a.est_invoice_amount) || 0))
  } else if (sortKey === 'overdue_desc') {
    sorted.sort((a, b) => {
      const da = a.follow_up_date ? daysDiff(a.follow_up_date) : 0
      const db = b.follow_up_date ? daysDiff(b.follow_up_date) : 0
      return db - da
    })
  } else if (sortKey === 'callback') {
    sorted.sort((a, b) => (a.call_back_time || 'zzz').localeCompare(b.call_back_time || 'zzz'))
  }
  return sorted
}

// ─── Lead Card ───────────────────────────────────────────────────────────
const LeadCard = ({ lead, onLogCall, onEdit, teamMembers }) => {
  const overdueDays = lead.follow_up_date ? daysDiff(lead.follow_up_date) : 0
  const sub = getSubPhase(lead.status)
  const qualC = QUALITY_COLORS[lead.lead_quality] || QUALITY_COLORS['Avg']
  const assignee = teamMembers?.find(t => t.id === lead.assigned_to)

  const subColors = {
    yet_to_connect: { color: '#f97316', bg: 'rgba(249,115,22,0.08)', label: 'YTC' },
    connected: { color: '#16a34a', bg: 'rgba(22,163,74,0.08)', label: 'CON' },
  }
  const subC = subColors[sub]

  // Timezone awareness
  const localTime = formatLocalTime(lead.country)
  const callable = isCallableNow(lead.country)
  const estValue = fmtAmount(lead.est_invoice_amount)

  return (
    <div
      className="p-3 rounded-xl flex items-start gap-3 transition-all hover:shadow-sm cursor-pointer"
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderLeft: subC ? `3px solid ${subC.color}` : `1px solid ${C.border}`,
      }}
      onClick={() => onEdit?.(lead)}
    >
      {/* Left */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Name + badges */}
        <div className="flex items-center gap-2 mb-1">
          {/* Callable-now dot */}
          {callable === true && (
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#16a34a' }} title="Callable now" />
          )}
          {callable === false && (
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#dc2626', opacity: 0.4 }} title="Outside business hours" />
          )}
          <span className="font-bold text-sm truncate" style={{ color: C.text }}>
            {lead.client_name || lead.phone || '—'}
          </span>
          {lead.lead_quality && (
            <Badge color={qualC.color} bg={qualC.bg}>{lead.lead_quality}</Badge>
          )}
          {subC && (
            <Badge color={subC.color} bg={subC.bg}>{subC.label} · {lead.status}</Badge>
          )}
          {!subC && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(22,163,74,0.06)', color: '#16a34a' }}>
              {lead.status}
            </span>
          )}
        </div>

        {/* Row 2: Phone, source, occasion, assignee */}
        <div className="text-xs flex items-center gap-1.5 flex-wrap" style={{ color: C.textMuted }}>
          {lead.phone && <span>{lead.phone}</span>}
          {lead.lead_source && <><span>·</span><span>{lead.lead_source}</span></>}
          {lead.occasion && <><span>·</span><span>{lead.occasion}</span></>}
          {assignee && <><span>·</span><span className="font-bold">{assignee.name}</span></>}
        </div>

        {/* Row 3: Country + local time + est value */}
        {(lead.country || estValue) && (
          <div className="text-xs flex items-center gap-2 mt-1 flex-wrap">
            {lead.country && (
              <span className="flex items-center gap-1" style={{ color: C.textMuted }}>
                🌍 {lead.country}
              </span>
            )}
            {localTime && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded"
                style={{
                  background: callable ? 'rgba(22,163,74,0.06)' : 'rgba(239,68,68,0.06)',
                  color: callable ? '#16a34a' : '#dc2626',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                🕐 {localTime}
              </span>
            )}
            {estValue && (
              <span className="flex items-center gap-1" style={{ color: '#d97706', fontWeight: 700 }}>
                ₹{estValue}
              </span>
            )}
          </div>
        )}

        {/* Row 4: Callback time + requirements */}
        {(lead.client_requirements || lead.call_back_time) && (
          <div className="text-xs mt-1 truncate" style={{ color: C.textMuted, fontStyle: 'italic' }}>
            {lead.call_back_time && <span className="font-bold" style={{ color: C.amber }}>🕐 {formatTimeIST(lead.call_back_time)} </span>}
            {lead.client_requirements?.split('\n').pop()}
          </div>
        )}

        {/* Row 5: Products */}
        {lead.products_interested && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {lead.products_interested.split(',').slice(0, 3).map(p => (
              <span key={p} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(37,99,235,0.06)', color: '#2563eb' }}>
                {p.trim()}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="h-8 px-2.5 rounded-lg flex items-center justify-center text-sm hover:opacity-80 gap-1"
              style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a' }}
              title="Call"
            >
              📞
            </a>
          )}
          <Btn small onClick={() => onLogCall(lead)} style={{ fontSize: '11px', padding: '4px 12px' }}>
            ✏️ Log
          </Btn>
        </div>

        {overdueDays > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>
            {overdueDays}d overdue
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Collapsible Section ─────────────────────────────────────────────────
const Section = ({ title, color, count, children, defaultOpen = false, sortKey, onSortChange }) => {
  const [open, setOpen] = useState(defaultOpen)
  if (count === 0) return null
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg mb-1.5"
        style={{ background: color + '08' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="text-xs font-bold uppercase" style={{ color }}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort toggle */}
          {onSortChange && open && (
            <select
              value={sortKey || 'default'}
              onClick={e => e.stopPropagation()}
              onChange={e => { e.stopPropagation(); onSortChange(e.target.value) }}
              className="text-[10px] px-1.5 py-0.5 rounded border appearance-auto bg-transparent"
              style={{ color: C.textMuted, borderColor: C.border, cursor: 'pointer' }}
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          )}
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: color + '15', color }}>
            {count}
          </span>
          <span className="text-[10px]" style={{ color: C.textMuted }}>{open ? '▼' : '▶'}</span>
        </div>
      </button>
      {open && <div className="space-y-2 pl-1">{children}</div>}
    </div>
  )
}

// ─── Mini Dashboard Stat ─────────────────────────────────────────────────
const Stat = ({ label, value, color, active, onClick }) => (
  <button
    onClick={onClick}
    className="rounded-lg p-2 text-center transition-all flex-1 min-w-[80px]"
    style={{
      background: active ? color + '10' : C.cardBg,
      border: `1.5px solid ${active ? color : C.border}`,
      cursor: onClick ? 'pointer' : 'default',
    }}
  >
    <div className="text-lg font-bold" style={{ color: value > 0 ? color : C.textMuted }}>{value}</div>
    <div className="text-[9px] font-bold uppercase" style={{ color: value > 0 ? color : C.textMuted }}>{label}</div>
  </button>
)

// ─── Phase Section with mini dashboard ───────────────────────────────────
const PhaseBlock = ({ title, titleColor, leads, teamMembers, onLogCall, onEdit, todayStr }) => {
  const [sortOverdue, setSortOverdue] = useState('default')
  const [sortToday, setSortToday] = useState('default')
  const [sortNew, setSortNew] = useState('default')
  const [sortUpcoming, setSortUpcoming] = useState('default')

  // Categorize leads by urgency
  const { overdue, todayLeads, newLeads, upcoming } = useMemo(() => {
    const overdue = []
    const todayLeads = []
    const newLeads = []
    const upcoming = []

    leads.forEach(lead => {
      if (lead.status === 'New' && !lead.follow_up_date) {
        newLeads.push(lead)
      } else if (lead.follow_up_date) {
        const fuDate = lead.follow_up_date.split('T')[0]
        if (fuDate < todayStr) overdue.push(lead)
        else if (fuDate === todayStr) todayLeads.push(lead)
        else {
          const diff = daysDiff(lead.follow_up_date)
          if (diff >= -3) upcoming.push(lead)
        }
      } else if (lead.status === 'New') {
        newLeads.push(lead)
      }
    })

    overdue.sort((a, b) => (a.follow_up_date || '').localeCompare(b.follow_up_date || ''))
    todayLeads.sort((a, b) => (a.call_back_time || '').localeCompare(b.call_back_time || ''))
    return { overdue, todayLeads, newLeads, upcoming }
  }, [leads, todayStr])

  // Apply sort
  const sortedOverdue = useMemo(() => sortLeads(overdue, sortOverdue), [overdue, sortOverdue])
  const sortedToday = useMemo(() => sortLeads(todayLeads, sortToday), [todayLeads, sortToday])
  const sortedNew = useMemo(() => sortLeads(newLeads, sortNew), [newLeads, sortNew])
  const sortedUpcoming = useMemo(() => sortLeads(upcoming, sortUpcoming), [upcoming, sortUpcoming])

  // Sub-phase counts for YTQ
  const isYTQ = titleColor === '#2563eb'
  const subCounts = useMemo(() => {
    if (!isYTQ) return null
    const ytc = leads.filter(l => YET_TO_CONNECT_STATUSES.includes(l.status)).length
    const connected = leads.filter(l => CONNECTED_STATUSES.includes(l.status)).length
    return { ytc, connected }
  }, [leads, isYTQ])

  // Status counts for Qualified
  const qualCounts = useMemo(() => {
    if (isYTQ) return null
    const followUp = leads.filter(l => ['Follow-up 1', 'Follow-up 2', 'Follow-up 3'].includes(l.status)).length
    const storeVisit = leads.filter(l => l.status === 'Store Visit Booked').length
    const proposal = leads.filter(l => l.status === 'Proposal Sent').length
    const toClose = leads.filter(l => l.status === 'To be Closed').length
    return { followUp, storeVisit, proposal, toClose }
  }, [leads, isYTQ])

  const totalTasks = overdue.length + todayLeads.length + newLeads.length

  if (leads.length === 0) return null

  return (
    <div className="mb-6">
      {/* Phase header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-sm" style={{ background: titleColor }} />
        <h2 className="text-base font-bold" style={{ color: titleColor }}>{title}</h2>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: titleColor + '10', color: titleColor }}>
          {leads.length} active
        </span>
      </div>

      {/* Mini dashboard */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {/* Urgency stats */}
        <Stat label="Overdue" value={overdue.length} color="#dc2626" />
        <Stat label="Today" value={todayLeads.length} color="#d97706" />
        {newLeads.length > 0 && <Stat label="New" value={newLeads.length} color="#2563eb" />}
        <Stat label="Upcoming" value={upcoming.length} color="#16a34a" />

        {/* Divider */}
        <div className="w-px self-stretch" style={{ background: C.border }} />

        {/* Phase-specific stats */}
        {subCounts && (
          <>
            <Stat label="Yet to Connect" value={subCounts.ytc} color="#f97316" />
            <Stat label="Connected" value={subCounts.connected} color="#16a34a" />
          </>
        )}
        {qualCounts && (
          <>
            <Stat label="Follow-ups" value={qualCounts.followUp} color="#2563eb" />
            <Stat label="Store Visit" value={qualCounts.storeVisit} color="#7c3aed" />
            <Stat label="Proposal" value={qualCounts.proposal} color="#0891b2" />
            <Stat label="To Close" value={qualCounts.toClose} color={C.gold} />
          </>
        )}
      </div>

      {/* Lead sections by urgency */}
      <Section title="Overdue" color="#dc2626" count={overdue.length} sortKey={sortOverdue} onSortChange={setSortOverdue}>
        {sortedOverdue.map(lead => (
          <LeadCard key={lead.id} lead={lead} onLogCall={onLogCall} onEdit={onEdit} teamMembers={teamMembers} />
        ))}
      </Section>

      <Section title="Today" color="#d97706" count={todayLeads.length} sortKey={sortToday} onSortChange={setSortToday}>
        {sortedToday.map(lead => (
          <LeadCard key={lead.id} lead={lead} onLogCall={onLogCall} onEdit={onEdit} teamMembers={teamMembers} />
        ))}
      </Section>

      {newLeads.length > 0 && (
        <Section title="New Leads" color="#2563eb" count={newLeads.length} sortKey={sortNew} onSortChange={setSortNew}>
          {sortedNew.map(lead => (
            <LeadCard key={lead.id} lead={lead} onLogCall={onLogCall} onEdit={onEdit} teamMembers={teamMembers} />
          ))}
        </Section>
      )}

      <Section title="Upcoming (3 days)" color="#16a34a" count={upcoming.length} defaultOpen={false} sortKey={sortUpcoming} onSortChange={setSortUpcoming}>
        {sortedUpcoming.map(lead => (
          <LeadCard key={lead.id} lead={lead} onLogCall={onLogCall} onEdit={onEdit} teamMembers={teamMembers} />
        ))}
      </Section>

      {totalTasks === 0 && upcoming.length === 0 && (
        <div className="text-center py-6" style={{ color: C.textMuted }}>
          <div className="text-sm">No pending tasks in {title.toLowerCase()}</div>
        </div>
      )}
    </div>
  )
}

// ─── Main MyDayView ──────────────────────────────────────────────────────
export const MyDayView = ({ leads = [], teamMembers = [], onLogCall, onEdit, currentUserId, globalFiltered }) => {
  const isMobile = useIsMobile()
  const todayStr = today()

  // ── Filter + Search state ──
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterOccasion, setFilterOccasion] = useState('')
  const [filterQuality, setFilterQuality] = useState('')
  const [filterAssigned, setFilterAssigned] = useState('')

  // ── Derive unique filter options from leads ──
  const filterOptions = useMemo(() => {
    const countries = new Set()
    const sources = new Set()
    const occasions = new Set()
    const qualities = new Set()
    const assigned = new Set()

    leads.forEach(l => {
      if (l.country) countries.add(l.country)
      if (l.lead_source) sources.add(l.lead_source)
      if (l.occasion) occasions.add(l.occasion)
      if (l.lead_quality) qualities.add(l.lead_quality)
      if (l.assigned_to) {
        const tm = teamMembers?.find(t => t.id === l.assigned_to)
        if (tm) assigned.add(tm.name)
      }
    })

    return {
      countries: [...countries].sort(),
      sources: [...sources].sort(),
      occasions: [...occasions].sort(),
      qualities: [...qualities].sort(),
      assigned: [...assigned].sort(),
    }
  }, [leads, teamMembers])

  const hasActiveFilters = searchQuery || filterCountry || filterSource || filterOccasion || filterQuality || filterAssigned

  // ── Apply filters + search to leads ──
  const filteredLeads = useMemo(() => {
    let result = leads
    const q = searchQuery.toLowerCase().trim()

    if (q) {
      result = result.filter(l =>
        (l.client_name || '').toLowerCase().includes(q) ||
        (l.phone || '').toLowerCase().includes(q)
      )
    }
    if (filterCountry) {
      result = result.filter(l => l.country === filterCountry)
    }
    if (filterSource) {
      result = result.filter(l => l.lead_source === filterSource)
    }
    if (filterOccasion) {
      result = result.filter(l => l.occasion === filterOccasion)
    }
    if (filterQuality) {
      result = result.filter(l => l.lead_quality === filterQuality)
    }
    if (filterAssigned) {
      result = result.filter(l => {
        const tm = teamMembers?.find(t => t.id === l.assigned_to)
        return tm?.name === filterAssigned
      })
    }
    return result
  }, [leads, searchQuery, filterCountry, filterSource, filterOccasion, filterQuality, filterAssigned, teamMembers])

  // Split leads by phase (only active leads)
  const { ytqLeads, qualifiedLeads } = useMemo(() => {
    const active = filteredLeads.filter(l => !isTerminalStatus(l.status))
    return {
      ytqLeads: active.filter(l =>
        l.phase === 'yet_to_qualify' || YET_TO_CONNECT_STATUSES.includes(l.status) || CONNECTED_STATUSES.includes(l.status)
      ),
      qualifiedLeads: active.filter(l =>
        (l.phase === 'qualified' || QUALIFIED_ACTIVE_STATUSES.includes(l.status)) && l.channel !== 'In-store'
      ),
    }
  }, [filteredLeads])

  // Today's store walk-ins (all statuses, logged today)
  const storeWalkIns = useMemo(() => {
    return filteredLeads.filter(l => l.channel === 'In-store' && (l.lead_source || '').toLowerCase().startsWith('direct') && l.lead_date && l.lead_date.split('T')[0] === todayStr)
  }, [filteredLeads, todayStr])

  // Overall summary
  const totalOverdue = useMemo(() => {
    const all = [...ytqLeads, ...qualifiedLeads]
    return all.filter(l => l.follow_up_date && l.follow_up_date.split('T')[0] < todayStr).length
  }, [ytqLeads, qualifiedLeads, todayStr])

  const totalToday = useMemo(() => {
    const all = [...ytqLeads, ...qualifiedLeads]
    return all.filter(l => l.follow_up_date && l.follow_up_date.split('T')[0] === todayStr).length
  }, [ytqLeads, qualifiedLeads, todayStr])

  // Callable now count
  const callableNowCount = useMemo(() => {
    const all = [...ytqLeads, ...qualifiedLeads]
    return all.filter(l => isCallableNow(l.country) === true).length
  }, [ytqLeads, qualifiedLeads])

  // Walk-in status colors
  const walkInStatusColor = (status) => {
    if (status === 'Converted') return { bg: 'rgba(22,163,74,0.08)', color: '#16a34a' }
    if (status === 'Lost') return { bg: 'rgba(239,68,68,0.08)', color: '#dc2626' }
    if (['Follow-up 1', 'Follow-up 2', 'Follow-up 3'].includes(status)) return { bg: 'rgba(37,99,235,0.08)', color: '#2563eb' }
    return { bg: 'rgba(217,119,6,0.06)', color: '#d97706' }
  }

  const clearAllFilters = () => {
    setSearchQuery('')
    setFilterCountry('')
    setFilterSource('')
    setFilterOccasion('')
    setFilterQuality('')
    setFilterAssigned('')
  }

  return (
    <div>
      {/* Top summary bar */}
      <div
        className={`${isMobile ? 'flex flex-col gap-2' : 'flex items-center justify-between'} mb-4 p-3 sm:p-4 rounded-xl`}
        style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
      >
        <div>
          <div className={`${isMobile ? 'text-base' : 'text-lg'} font-bold`} style={{ color: C.text }}>
            {totalOverdue + totalToday} tasks today
          </div>
          <div className="text-xs" style={{ color: C.textMuted }}>
            {ytqLeads.length} yet to qualify · {qualifiedLeads.length} qualified{storeWalkIns.length > 0 ? ` · ${storeWalkIns.length} walk-ins` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {totalOverdue > 0 && (
            <span className="text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-full" style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626' }}>
              ⚠ {totalOverdue} overdue
            </span>
          )}
          {totalToday > 0 && (
            <span className="text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-full" style={{ background: 'rgba(217,119,6,0.06)', color: '#d97706' }}>
              📌 {totalToday} due today
            </span>
          )}
          {callableNowCount > 0 && (
            <span className="text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-full" style={{ background: 'rgba(22,163,74,0.06)', color: '#16a34a' }}>
              📞 {callableNowCount} callable now
            </span>
          )}
        </div>
      </div>

      {/* Filter bar + Search */}
      <div
        className={`flex ${isMobile ? 'flex-col' : 'items-center'} gap-2 mb-5 p-3 rounded-xl flex-wrap`}
        style={{ background: C.cardBg, border: `1px solid ${C.border}` }}
      >
        {/* Search input */}
        <div className={`relative ${isMobile ? 'w-full' : 'flex-shrink-0'}`} style={isMobile ? {} : { minWidth: 180 }}>
          <input
            type="text"
            placeholder="🔍 Search name or phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg w-full outline-none"
            style={{
              background: C.bg,
              border: `1px solid ${searchQuery ? '#2563eb' : C.border}`,
              color: C.text,
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]"
              style={{ color: C.textMuted }}
            >✕</button>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-6" style={{ background: C.border }} />

        {/* Filter dropdowns */}
        <FilterDropdown label="Country" icon="🌍" options={filterOptions.countries} value={filterCountry} onChange={setFilterCountry} />
        <FilterDropdown label="Source" icon="📢" options={filterOptions.sources} value={filterSource} onChange={setFilterSource} />
        <FilterDropdown label="Occasion" icon="🎉" options={filterOptions.occasions} value={filterOccasion} onChange={setFilterOccasion} />
        <FilterDropdown label="Quality" icon="⭐" options={filterOptions.qualities} value={filterQuality} onChange={setFilterQuality} />
        <FilterDropdown label="Assigned" icon="👤" options={filterOptions.assigned} value={filterAssigned} onChange={setFilterAssigned} />

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-[10px] font-bold px-2 py-1 rounded-lg hover:opacity-80"
            style={{ color: '#dc2626', background: 'rgba(239,68,68,0.06)' }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Qualified Section — shown first (higher priority) */}
      <PhaseBlock
        title="Qualified"
        titleColor="#16a34a"
        leads={qualifiedLeads}
        teamMembers={teamMembers}
        onLogCall={onLogCall}
        onEdit={onEdit}
        todayStr={todayStr}
      />

      {/* Store Walk-ins Section */}
      {storeWalkIns.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-sm" style={{ background: '#d97706' }} />
            <h2 className="text-base font-bold" style={{ color: '#d97706' }}>Store Walk-ins</h2>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(217,119,6,0.08)', color: '#d97706' }}>
              {storeWalkIns.length} today
            </span>
          </div>

          {/* Mini dashboard */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <Stat label="Total" value={storeWalkIns.length} color="#d97706" />
            <Stat label="Pending" value={storeWalkIns.filter(l => isPending(l.status)).length} color="#f97316" />
            <Stat label="Follow-up" value={storeWalkIns.filter(l => ['Follow-up 1','Follow-up 2','Follow-up 3'].includes(l.status)).length} color="#2563eb" />
            <Stat label="Converted" value={storeWalkIns.filter(l => l.status === 'Converted').length} color="#16a34a" />
            <Stat label="Lost" value={storeWalkIns.filter(l => l.status === 'Lost').length} color="#dc2626" />
          </div>

          {/* Collapsible cards */}
          <Section title="Walk-in Entries" color="#d97706" count={storeWalkIns.length} defaultOpen={false}>
            {storeWalkIns.map(lead => {
              const sc = walkInStatusColor(lead.status)
              return (
                <div
                  key={lead.id}
                  className="p-3 rounded-xl flex items-center gap-3 transition-all hover:shadow-sm cursor-pointer"
                  style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderLeft: `3px solid #d97706` }}
                  onClick={() => onEdit?.(lead)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm truncate" style={{ color: C.text }}>
                        {lead.client_name || lead.phone || '—'}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.color }}>
                        {lead.status}
                      </span>
                    </div>
                    <div className="text-xs flex items-center gap-1.5 flex-wrap" style={{ color: C.textMuted }}>
                      {lead.phone && <span>{lead.phone}</span>}
                      {lead.products_interested && <><span>·</span><span>{lead.products_interested}</span></>}
                      {lead.occasion && <><span>·</span><span>{lead.occasion}</span></>}
                    </div>
                    {lead.client_requirements && (
                      <div className="text-xs mt-1 truncate" style={{ color: C.textMuted, fontStyle: 'italic' }}>
                        {lead.client_requirements.split('\n').pop()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} className="h-8 px-2.5 rounded-lg flex items-center justify-center text-sm hover:opacity-80"
                        style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a' }} title="Call">📞</a>
                    )}
                    <Btn small onClick={() => onLogCall(lead)} style={{ fontSize: '11px', padding: '4px 12px' }}>✏️ Log</Btn>
                  </div>
                </div>
              )
            })}
          </Section>
        </div>
      )}

      {/* Divider */}
      {ytqLeads.length > 0 && (qualifiedLeads.length > 0 || storeWalkIns.length > 0) && (
        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 h-px" style={{ background: C.border }} />
          <span className="text-[10px] font-bold uppercase px-3 py-1 rounded-full" style={{ background: C.bg, color: C.textMuted, border: `1px solid ${C.border}` }}>
            Yet to Qualify Pipeline
          </span>
          <div className="flex-1 h-px" style={{ background: C.border }} />
        </div>
      )}

      {/* YTQ Section — shown second */}
      <PhaseBlock
        title="Yet to Qualify"
        titleColor="#2563eb"
        leads={ytqLeads}
        teamMembers={teamMembers}
        onLogCall={onLogCall}
        onEdit={onEdit}
        todayStr={todayStr}
      />

      {/* All clear / No results */}
      {ytqLeads.length === 0 && qualifiedLeads.length === 0 && storeWalkIns.length === 0 && (
        <div className="text-center py-16" style={{ color: C.textMuted }}>
          {hasActiveFilters ? (
            <>
              <div className="text-2xl mb-3">🔍</div>
              <div className="text-sm mb-2" style={{ color: C.text }}>No leads match your filters</div>
              <button
                onClick={clearAllFilters}
                className="text-xs font-bold px-4 py-2 rounded-lg"
                style={{ color: '#2563eb', background: 'rgba(37,99,235,0.06)' }}
              >
                Clear all filters
              </button>
            </>
          ) : (
            <>
              <div className="text-4xl mb-3">🎉</div>
              <div className="text-lg font-bold mb-1" style={{ color: C.text }}>All caught up!</div>
              <div className="text-sm">No active leads. Add new leads above.</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   STORE WALK-INS VIEW — Dedicated walk-in register for store stylists
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useEffect } from 'react'
import { C, toast, fmtCurrency } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { Badge } from './ui'
import {
  LEAD_QUALITIES, QUALITY_COLORS, OCCASIONS,
  WALKOUT_REASONS, INTERACTION_TYPES
} from './constants'
import { useIsMobile } from './useIsMobile'
import { useLeadMasterLists } from './useLeadMasterLists'
import { PhoneInput } from './PhoneInput'
import { filterStylists } from '../../lib/helpers'
import { useChannelOrders } from './useChannelOrders'
import LinkOrderModal from './LinkOrderModal'


const n = v => Number(v) || 0
const isWalkin = (l) => !!l && l.channel === 'In-store'  // a lead on the In-store channel is a walk-in, regardless of lead source
const fmtYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const STATUS_COLORS = {
  'New': { color: '#92400e', bg: 'rgba(254,243,199,0.5)' },
  'Yet to Connect': { color: '#92400e', bg: 'rgba(254,243,199,0.5)' },
  'Follow-up 1': { color: '#2563eb', bg: 'rgba(219,234,254,0.5)' },
  'Follow-up 2': { color: '#2563eb', bg: 'rgba(219,234,254,0.5)' },
  'Follow-up 3': { color: '#2563eb', bg: 'rgba(219,234,254,0.5)' },
  'Store Visit Booked': { color: '#2563eb', bg: 'rgba(219,234,254,0.5)' },
  'Store visit follow-up': { color: '#2563eb', bg: 'rgba(219,234,254,0.5)' },
  'To be Closed': { color: '#C9A84C', bg: 'rgba(201,168,76,0.1)' },
  'Lost': { color: '#dc2626', bg: 'rgba(254,226,226,0.5)' },
  'Not Qualified': { color: '#dc2626', bg: 'rgba(254,226,226,0.5)' },
  'Converted': { color: '#16a34a', bg: 'rgba(220,252,231,0.5)' },
}

const getStatusColor = (status) => STATUS_COLORS[status] || { color: '#6b7280', bg: 'rgba(107,114,128,0.1)' }

const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  let h = d.getHours(), m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  if (h > 12) h -= 12
  if (h === 0) h = 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

const RowActions = ({ lead, onLog, onEditLead, onLinkOrder, linkedIds, logLabel = 'Log Walk-in' }) => {
  const converted = lead.status === 'Converted'
  const needsLink = converted && !lead.order_id && !!onLinkOrder && !(linkedIds && linkedIds.has(lead.id))
  return (
    <div className="flex items-center gap-1.5 justify-end">
      {(!isTerminal(lead.status) || logLabel === 'Close')
        ? <button onClick={() => onLog?.(lead)} className="text-[10px] px-2.5 py-1 rounded-lg font-bold" style={{ background: C.gold, color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>{logLabel}</button>
        : needsLink
          ? <button onClick={() => onLinkOrder(lead)} title="Converted but no order linked — link it so revenue matches POS" className="text-[10px] px-2.5 py-1 rounded-lg font-bold" style={{ background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>🔗 Link order</button>
          : <span className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: converted ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.08)', color: converted ? '#16a34a' : '#dc2626', whiteSpace: 'nowrap' }}>{converted ? '✓ Closed' : '✕ ' + lead.status}</span>}
      <button onClick={() => onEditLead?.(lead)} title="Edit — all fields" className="p-1 rounded hover:bg-gray-100" style={{ color: C.textMuted, cursor: 'pointer' }}>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
      </button>
    </div>
  )
}

const isPending = (status) => status === 'New' || status === 'Yet to Connect'
const isFollowUp = (status) => ['Follow-up 1', 'Follow-up 2', 'Follow-up 3'].includes(status)
const TERMINAL_STATUSES = ['Converted', 'Lost', 'Not Qualified']
const isTerminal = (status) => TERMINAL_STATUSES.includes(status)
// High-intent statuses that still need chasing (focus leads)
const FOCUS_STATUSES = ['To be Closed', 'Proposal Sent', 'Store Visit Booked', 'Store visit follow-up']
// A lead that still needs a follow-up: anything active in the follow-up / closing funnel
const needsAttention = (l) => !!l && !isTerminal(l.status) && (isFollowUp(l.status) || FOCUS_STATUSES.includes(l.status))

// ─── KPI Card ──────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, color = C.gold, sub }) => (
  <div className="rounded-xl p-3 sm:p-4" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
    <div className="text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted, letterSpacing: '0.05em' }}>{label}</div>
    <div className="text-2xl sm:text-3xl font-bold" style={{ color }}>{value}</div>
    {sub && <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>{sub}</div>}
  </div>
)

// ═════════════════════════════════════════════════════════════════════════════
export const StoreWalkinsView = ({ leads = [], teamMembers = [], onRefresh, onLogCall, onEditLead }) => {
  const isMobile = useIsMobile()
  const lists = useLeadMasterLists()
  const todayStr = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [wkView, setWkView] = useState('today')
  const [focusStaff, setFocusStaff] = useState('')       // stylist id to open the Register focused on
  const [focusDismiss, setFocusDismiss] = useState(false)
  const [linkedIds, setLinkedIds] = useState(() => new Set())
  const [linkLead, setLinkLead] = useState(null)
  useEffect(() => {
    const ids = leads.filter(l => l.channel === 'In-store' && l.status === 'Converted' && !l.order_id).map(l => l.id)
    if (!ids.length) { setLinkedIds(new Set()); return }
    let live = true
      ; (async () => {
        let rows = []
        for (let i = 0; i < ids.length; i += 200) { const { data } = await supa.from('lead_orders').select('lead_id').in('lead_id', ids.slice(i, i + 200)); rows = rows.concat(data || []) }
        if (live) setLinkedIds(new Set(rows.map(r => r.lead_id)))
      })()
    return () => { live = false }
  }, [leads])
  const [expandedLeadId, setExpandedLeadId] = useState(null)
  const [showStaffBreakdown, setShowStaffBreakdown] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  // ── Delete walk-in lead ────────────────────────────────────────────────
  const handleDelete = async (leadId) => {
    if (!window.confirm('Delete this walk-in entry?')) return
    setDeletingId(leadId)
    try {
      const { error } = await supa.from('leads').delete().eq('id', leadId)
      if (error) throw error
      toast(true, 'Walk-in deleted')
      onRefresh()
    } catch (err) {
      console.error('Delete error:', err)
      toast(false, 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Quick Entry state ──────────────────────────────────────────────────
  const [qe, setQe] = useState({
    phone: '', name: '', partySize: 1,
    staffId: window._currentTeamMemberId || '',
  })
  const [saving, setSaving] = useState(false)
  const [returningCount, setReturningCount] = useState(null)

  // ── Filter leads for selected date ─────────────────────────────────────
  const dayLeads = useMemo(() => {
    return leads
      .filter(l => isWalkin(l) && l.lead_date === selectedDate)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [leads, selectedDate])

  // ── KPI stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = dayLeads.length
    const people = dayLeads.reduce((s, l) => s + n(l.party_size || 1), 0)
    const converted = dayLeads.filter(l => l.status === 'Converted').length
    const followingUp = dayLeads.filter(l => isFollowUp(l.status) || l.status === 'Store visit follow-up').length
    const lost = dayLeads.filter(l => l.status === 'Lost').length
    const convRate = total > 0 ? Math.round((converted / total) * 100) : 0
    return { total, people, converted, followingUp, lost, convRate }
  }, [dayLeads])

  // ── Staff breakdown ────────────────────────────────────────────────────
  const staffBreakdown = useMemo(() => {
    const map = {}
    dayLeads.forEach(l => {
      const id = l.assigned_to || 'unassigned'
      map[id] = (map[id] || 0) + 1
    })
    return Object.entries(map)
      .map(([id, count]) => ({
        name: id === 'unassigned' ? 'Unassigned' : teamMembers.find(tm => String(tm.id) === String(id))?.name || id,
        count
      }))
      .sort((a, b) => b.count - a.count)
  }, [dayLeads, teamMembers])

  // ── Returning customer check ───────────────────────────────────────────
  useEffect(() => {
    // PhoneInput returns value like "+919876543210" — strip non-digits for lookup
    const digits = qe.phone.replace(/[^\d]/g, '')
    if (digits.length < 7) { setReturningCount(null); return }
    const timer = setTimeout(async () => {
      const { count, error } = await supa.from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('channel', 'In-store').eq('lead_source', 'Direct Walk-in')
        .eq('phone', digits)
      if (!error && count > 0) setReturningCount(count)
      else setReturningCount(null)
    }, 500)
    return () => clearTimeout(timer)
  }, [qe.phone])

  // ── Quick Entry submit ─────────────────────────────────────────────────
  const handleLogWalkin = async () => {
    if (!qe.staffId) { toast(false, 'Please select staff'); return }
    // PhoneInput returns full value like "+919876543210" — strip to digits
    const rawPhone = qe.phone.trim().replace(/[^\d]/g, '')
    // After stripping +, digits should be country code + 10 digit number
    // Allow empty (anonymous walk-in) or valid phone
    if (rawPhone.length > 0 && rawPhone.length < 10) {
      toast(false, 'Phone must be at least 10 digits'); return
    }
    setSaving(true)
    try {
      const phone = rawPhone || null
      const staff = teamMembers.find(tm => String(tm.id) === String(qe.staffId))
      const fu = new Date(selectedDate + 'T00:00:00'); fu.setDate(fu.getDate() + 2)
      const { data, error } = await supa.from('leads').insert([{
        lead_date: selectedDate,
        client_name: qe.name.trim() || null,
        phone,
        party_size: qe.partySize,
        channel: 'In-store',
        lead_source: 'Direct Walk-in',
        assigned_to: qe.staffId,
        store_location: staff?.assigned_store || null,
        follow_up_date: fmtYMD(fu),
        lead_quality: 'Avg',
        status: 'Yet to Connect',
        phase: 'qualified',
        country: 'India',
        import_source: 'manual',
        created_by: window._currentUserEmail || '',
      }]).select().single()
      if (error) throw error

      toast(true, 'Walk-in logged')
      setExpandedLeadId(data.id)
      setQe({ phone: '', name: '', partySize: 1, staffId: qe.staffId })
      setReturningCount(null)
      onRefresh?.()
    } catch (err) {
      console.error('Walk-in error:', err)
      toast(false, 'Failed to log walk-in')
    } finally {
      setSaving(false)
    }
  }

  // ── Resolve staff name ─────────────────────────────────────────────────
  const staffName = (id) => teamMembers.find(tm => String(tm.id) === String(id))?.name || '—'

  return (
    <div>
      {/* ── Sub-view toggle: Today capture vs monthly Register ── */}
      <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: C.borderLight, width: 'fit-content' }}>
        {[{ k: 'today', label: 'Today' }, { k: 'register', label: 'Register' }, { k: 'analytics', label: 'Analytics' }].map(v => (
          <button key={v.k} onClick={() => setWkView(v.k)} className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={{ background: wkView === v.k ? C.gold : 'transparent', color: wkView === v.k ? '#fff' : C.textMuted }}>{v.label}</button>
        ))}
      </div>
      {linkLead && <LinkOrderModal lead={linkLead} onClose={() => setLinkLead(null)} onLinked={() => { setLinkLead(null); onRefresh?.() }} />}
      {wkView === 'register' ? (
        <WalkinRegister leads={leads} teamMembers={teamMembers} onRefresh={onRefresh} isMobile={isMobile} onEditLead={onEditLead} focusStaffId={focusStaff} onLinkOrder={setLinkLead} linkedIds={linkedIds} />
      ) : wkView === 'analytics' ? (
        <WalkinAnalytics leads={leads} teamMembers={teamMembers} />
      ) : (
        <>
          {/* ── Focus-leads nudge for the logged-in stylist ── */}
          {(() => {
            if (focusDismiss) return null
            const myId = String((typeof window !== 'undefined' && window._currentUserId) || '')
            if (!myId) return null
            const mine = leads.filter(l => isWalkin(l) && String(l.assigned_to) === myId && needsAttention(l))
            if (!mine.length) return null
            const hq = mine.filter(l => ['High Quality', 'Good'].includes(l.lead_quality)).length
            const toClose = mine.filter(l => FOCUS_STATUSES.includes(l.status)).length
            return (
              <div className="mb-4 rounded-xl p-3 sm:p-4 flex flex-wrap items-center gap-3" style={{ background: 'linear-gradient(90deg, rgba(201,168,76,0.14), rgba(201,168,76,0.03))', border: '1px solid rgba(201,168,76,0.45)' }}>
                <span style={{ fontSize: 22 }}>📞</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="font-bold text-sm" style={{ color: C.text }}>You have {mine.length} focus lead{mine.length === 1 ? '' : 's'} to close</div>
                  <div className="text-xs" style={{ color: C.textMuted }}>{hq} high/good quality{toClose ? ` · ${toClose} to-be-closed` : ''} · keep following up till each is won or lost.</div>
                </div>
                <button onClick={() => { setFocusStaff(myId); setWkView('register') }} className="text-xs font-bold px-4 py-2 rounded-lg" style={{ background: C.gold, color: '#fff', whiteSpace: 'nowrap' }}>Open follow-ups →</button>
                <button onClick={() => setFocusDismiss(true)} className="text-xs font-bold px-2" style={{ color: C.textMuted }}>Dismiss</button>
              </div>
            )
          })()}
          {/* ── Section A: Daily Footfall Summary ──────────────────────────── */}
          <div className="mb-4 sm:mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-base sm:text-lg font-bold" style={{ color: C.text }}>
                Store Walk-ins
              </h2>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-lg outline-none"
                style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }}
              />
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
              <KpiCard label="Walk-ins" value={stats.total} />
              <KpiCard label="People" value={stats.people} />
              <KpiCard label="Converted" value={stats.converted} color="#16a34a" />
              <KpiCard label="Following Up" value={stats.followingUp} color="#2563eb" />
              <KpiCard label="Lost" value={stats.lost} color="#dc2626" />
              <KpiCard label="Conv Rate" value={`${stats.convRate}%`} color={C.gold} />
            </div>

            {/* Staff Breakdown Toggle */}
            <button
              onClick={() => setShowStaffBreakdown(!showStaffBreakdown)}
              className="mt-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{ color: C.textMuted, background: showStaffBreakdown ? C.bg : 'transparent', border: `1px solid ${C.border}` }}
            >
              Staff {showStaffBreakdown ? '▾' : '▸'}
            </button>
            {showStaffBreakdown && (
              <div className="mt-2 flex flex-wrap gap-2">
                {staffBreakdown.map(s => (
                  <span key={s.name} className="text-xs px-3 py-1.5 rounded-lg font-bold" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }}>
                    {s.name}: <span style={{ color: C.gold }}>{s.count}</span>
                  </span>
                ))}
                {staffBreakdown.length === 0 && <span className="text-xs" style={{ color: C.textMuted }}>No walk-ins yet</span>}
              </div>
            )}
          </div>

          {/* ── Section B: Quick Entry Row ─────────────────────────────────── */}
          <div className="mb-4 rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.gold}40`, background: C.cardBg }}>
            <div className={`p-3 flex ${isMobile ? 'flex-col gap-2' : 'items-end gap-3 flex-wrap'}`}>
              {/* Phone */}
              <div className={isMobile ? 'w-full' : 'flex-1 min-w-[240px]'}>
                <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Phone</label>
                <PhoneInput
                  value={qe.phone}
                  onChange={v => setQe(prev => ({ ...prev, phone: v }))}
                  countryCodes={lists.country_codes || {}}
                  countries={lists.countries || []}
                  placeholder="98765 43210"
                />
                {returningCount !== null && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}>
                    Returning — visited {returningCount}x
                  </span>
                )}
              </div>

              {/* Name */}
              <div className={isMobile ? 'w-full' : 'flex-1 min-w-[140px]'}>
                <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Name</label>
                <input
                  type="text"
                  placeholder="Client name"
                  value={qe.name}
                  onChange={e => setQe(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                  style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                />
              </div>

              {/* Party Size + Staff row */}
              <div className={isMobile ? 'flex gap-2 w-full' : 'contents'}>
                <div className={isMobile ? 'w-[90px]' : 'w-[80px]'}>
                  <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Party</label>
                  <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                    <button
                      onClick={() => setQe(prev => ({ ...prev, partySize: Math.max(1, prev.partySize - 1) }))}
                      className="px-2 py-2 text-sm font-bold"
                      style={{ background: C.bg, color: C.text, border: 'none' }}
                    >−</button>
                    <span className="px-2 py-2 text-sm font-bold text-center flex-1" style={{ background: C.cardBg, color: C.text }}>{qe.partySize}</span>
                    <button
                      onClick={() => setQe(prev => ({ ...prev, partySize: Math.min(20, prev.partySize + 1) }))}
                      className="px-2 py-2 text-sm font-bold"
                      style={{ background: C.bg, color: C.text, border: 'none' }}
                    >+</button>
                  </div>
                </div>

                <div className={isMobile ? 'flex-1' : 'w-[140px]'}>
                  <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Staff</label>
                  <select
                    value={qe.staffId}
                    onChange={e => setQe(prev => ({ ...prev, staffId: e.target.value }))}
                    className="w-full text-sm px-2 py-2 rounded-lg outline-none"
                    style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                  >
                    <option value="">Select Staff</option>
                    {filterStylists(teamMembers).map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Log Button */}
              <div className={isMobile ? 'w-full' : ''}>
                <button
                  onClick={handleLogWalkin}
                  disabled={saving}
                  className={`${isMobile ? 'w-full' : ''} px-5 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40`}
                  style={{ background: C.gold }}
                >
                  {saving ? '...' : '+ Log Walk-in'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Section C: Outcome Panel (inline, for expanded lead) ───────── */}
          {expandedLeadId && (
            <OutcomePanel
              lead={dayLeads.find(l => l.id === expandedLeadId) || leads.find(l => l.id === expandedLeadId)}
              teamMembers={teamMembers}
              staffName={staffName}
              onClose={() => setExpandedLeadId(null)}
              onSave={() => { setExpandedLeadId(null); onRefresh?.() }}
              isMobile={isMobile}
            />
          )}

          {/* ── Section D: Today's Walk-in Log ─────────────────────────────── */}
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.cardBg }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}` }}>
              <h3 className="font-bold text-sm" style={{ color: C.text }}>
                {selectedDate === todayStr ? "Today's Walk-ins" : `Walk-ins — ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
              </h3>
              <span className="text-xs font-bold" style={{ color: C.textMuted }}>{dayLeads.length} entries</span>
            </div>

            {dayLeads.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm" style={{ color: C.textMuted }}>
                No walk-ins logged for {selectedDate === todayStr ? 'today' : 'this date'}. Use the Quick Entry above to log the first one.
              </div>
            ) : isMobile ? (
              /* Mobile: Card Layout */
              <div className="divide-y" style={{ borderColor: C.border }}>
                {dayLeads.map((lead, idx) => {
                  const sc = getStatusColor(lead.status)
                  const qc = QUALITY_COLORS[lead.lead_quality] || QUALITY_COLORS['Avg']
                  const pending = isPending(lead.status)
                  return (
                    <div
                      key={lead.id}
                      className="p-3"
                      style={{ borderLeft: pending ? `4px solid #d97706` : 'none', background: expandedLeadId === lead.id ? 'rgba(201,168,76,0.04)' : 'transparent' }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div>
                          <span className="text-sm font-bold" style={{ color: C.text }}>{lead.client_name || '—'}</span>
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} className="ml-2 text-xs" style={{ color: '#2563eb' }}>{lead.phone}</a>
                          )}
                        </div>
                        <span className="text-[10px]" style={{ color: C.textMuted }}>{fmtTime(lead.created_at)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: sc.bg, color: sc.color }}>{lead.status}</span>
                        <Badge color={qc.color} bg={qc.bg}>{lead.lead_quality || 'Avg'}</Badge>
                        <span className="text-[10px]" style={{ color: C.textMuted }}>Party: {lead.party_size || 1}</span>
                        <span className="text-[10px]" style={{ color: C.textMuted }}>Staff: {staffName(lead.assigned_to)}</span>
                      </div>
                      {lead.client_requirements && (
                        <div className="text-[10px] mb-1.5" style={{ color: C.textMuted }}>Reason: {lead.client_requirements}</div>
                      )}
                      <div className="flex items-center gap-2">
                        <RowActions lead={lead} onEditLead={onEditLead} onLinkOrder={setLinkLead} linkedIds={linkedIds} logLabel={expandedLeadId === lead.id ? 'Close' : 'Log Walk-in'}
                          onLog={(l) => setExpandedLeadId(expandedLeadId === l.id ? null : l.id)} />
                        <button
                          onClick={() => handleDelete(lead.id)}
                          disabled={deletingId === lead.id}
                          className="text-[10px] px-2 py-0.5 rounded font-semibold"
                          style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: 'none', cursor: 'pointer', opacity: deletingId === lead.id ? 0.5 : 1 }}
                        >
                          {deletingId === lead.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Desktop: Table Layout */
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['#', 'Time', 'Client', 'Phone', 'Party', 'Staff', 'Reason', 'Quality', 'Status', 'Action', ''].map(h => (
                        <th key={h} style={{ padding: '0.75rem 0.5rem', textAlign: 'left', fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dayLeads.map((lead, idx) => {
                      const sc = getStatusColor(lead.status)
                      const qc = QUALITY_COLORS[lead.lead_quality] || QUALITY_COLORS['Avg']
                      const pending = isPending(lead.status)
                      return (
                        <tr
                          key={lead.id}
                          style={{
                            borderBottom: `1px solid ${C.border}`,
                            borderLeft: pending ? `4px solid #d97706` : '4px solid transparent',
                            background: expandedLeadId === lead.id ? 'rgba(201,168,76,0.04)' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '0.5rem', color: C.textMuted, fontSize: '0.75rem' }}>{dayLeads.length - idx}</td>
                          <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: C.textMuted }}>{fmtTime(lead.created_at)}</td>
                          <td style={{ padding: '0.5rem', fontWeight: 600, color: C.text }}>{lead.client_name || '—'}</td>
                          <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: C.textMuted }}>
                            {lead.phone ? <a href={`tel:${lead.phone}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{lead.phone}</a> : 'No number'}
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 700, color: C.text }}>{lead.party_size || 1}</td>
                          <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: C.text }}>{staffName(lead.assigned_to)}</td>
                          <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: C.textMuted, maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.client_requirements || '—'}</td>
                          <td style={{ padding: '0.5rem' }}><Badge color={qc.color} bg={qc.bg}>{lead.lead_quality || 'Avg'}</Badge></td>
                          <td style={{ padding: '0.5rem' }}>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: sc.bg, color: sc.color }}>{lead.status}</span>
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <RowActions lead={lead} onEditLead={onEditLead} onLinkOrder={setLinkLead} linkedIds={linkedIds} logLabel={expandedLeadId === lead.id ? 'Close' : 'Log Walk-in'}
                              onLog={(l) => setExpandedLeadId(expandedLeadId === l.id ? null : l.id)} />
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <button
                              onClick={() => handleDelete(lead.id)}
                              disabled={deletingId === lead.id}
                              className="text-[10px] px-2 py-0.5 rounded font-semibold"
                              style={{ background: 'rgba(239,68,68,0.08)', color: '#dc2626', border: 'none', cursor: 'pointer', opacity: deletingId === lead.id ? 0.5 : 1 }}
                              title="Delete walk-in"
                            >
                              {deletingId === lead.id ? '...' : '✕'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// OUTCOME PANEL — Inline panel below quick entry or below a log row
// ═════════════════════════════════════════════════════════════════════════════
const OutcomePanel = ({ lead, teamMembers, staffName, onClose, onSave, isMobile }) => {
  const lists = useLeadMasterLists()
  const [outcome, setOutcome] = useState(null) // 'lost' | 'followup' | 'converted'
  const [saving, setSaving] = useState(false)
  const [quality, setQuality] = useState(lead?.lead_quality || 'Avg')
  const [walkoutReason, setWalkoutReason] = useState(lead?.client_requirements || '')
  const [occasion, setOccasion] = useState(lead?.occasion || '')
  const [occasionDate, setOccasionDate] = useState(lead?.occasion_date || '')
  const [productsInterested, setProductsInterested] = useState(lead?.products_interested ? lead.products_interested.split(',').map(x => x.trim()).filter(Boolean) : [])
  const [leadSource, setLeadSource] = useState(lead?.lead_source || '')
  const toggleProduct = (pc) => setProductsInterested(prev => prev.includes(pc) ? prev.filter(x => x !== pc) : [...prev, pc])
  const [notes, setNotes] = useState(lead?.assignee_comments || '')
  const [followUpDate, setFollowUpDate] = useState(() => {
    if (lead?.follow_up_date) return lead.follow_up_date
    const d = new Date(); d.setDate(d.getDate() + 2)
    return d.toISOString().split('T')[0]
  })

  // Order linking
  const [orderSearch, setOrderSearch] = useState('')
  const [orderResults, setOrderResults] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [searchingOrders, setSearchingOrders] = useState(false)

  // Follow-up logging
  const [showFollowUpLog, setShowFollowUpLog] = useState(false)
  const [fuInteractionType, setFuInteractionType] = useState('Call')
  const [fuNote, setFuNote] = useState('')
  const [fuNextDate, setFuNextDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 2)
    return d.toISOString().split('T')[0]
  })

  const currentStatus = lead?.status
  const pending = isPending(currentStatus)
  const followUp = isFollowUp(currentStatus)

  // Pre-set outcome only for terminal statuses (Lost/Converted)
  // Follow-up leads show action buttons instead — user picks outcome explicitly
  useEffect(() => {
    if (currentStatus === 'Lost') setOutcome('lost')
    else if (currentStatus === 'Converted') setOutcome('converted')
  }, [currentStatus])

  // ── Order search ─────────────────────────────────────────────────────
  const searchOrders = async (term) => {
    if (term.length < 1) { setOrderResults([]); return }
    setSearchingOrders(true)
    try {
      // Search by order number (numeric) or customer name
      const isNumeric = /^\d+$/.test(term.trim())
      let query = supa.from('shopify_orders')
        .select('id, order_number, customer_name, total_price, created_at')
      if (isNumeric) {
        query = query.or(`order_number.eq.${term.trim()},order_number.eq.#${term.trim()},customer_name.ilike.%${term}%`)
      } else {
        query = query.or(`customer_name.ilike.%${term}%,order_number.ilike.%${term}%`)
      }
      const { data } = await query.order('created_at', { ascending: false }).limit(8)
      setOrderResults(data || [])
    } catch { setOrderResults([]) }
    finally { setSearchingOrders(false) }
  }

  useEffect(() => {
    const timer = setTimeout(() => { if (orderSearch) searchOrders(orderSearch) }, 400)
    return () => clearTimeout(timer)
  }, [orderSearch])

  if (!lead) return null

  // ── Save handlers ──────────────────────────────────────────────────────
  const handleSaveLost = async () => {
    if (!walkoutReason) { toast(false, 'Please select a walkout reason'); return }
    setSaving(true)
    try {
      const { error } = await supa.from('leads').update({
        status: 'Lost', lead_quality: quality,
        client_requirements: walkoutReason,
        occasion: occasion || null,
        occasion_date: occasionDate || null,
        products_interested: productsInterested.length ? productsInterested.join(', ') : null,
        lead_source: leadSource || lead.lead_source,
        assignee_comments: notes || null,
        feedback_by_lead: walkoutReason,
      }).eq('id', lead.id)
      if (error) throw error
      toast(true, 'Marked as Lost')
      onSave()
    } catch { toast(false, 'Save failed') }
    finally { setSaving(false) }
  }

  const handleSaveFollowUp = async () => {
    setSaving(true)
    try {
      const { error } = await supa.from('leads').update({
        status: 'Follow-up 1', lead_quality: quality,
        client_requirements: walkoutReason || null,
        occasion: occasion || null,
        occasion_date: occasionDate || null,
        products_interested: productsInterested.length ? productsInterested.join(', ') : null,
        lead_source: leadSource || lead.lead_source,
        assignee_comments: notes || null,
        follow_up_date: followUpDate,
      }).eq('id', lead.id)
      if (error) throw error
      toast(true, 'Follow-up scheduled')
      onSave()
    } catch { toast(false, 'Save failed') }
    finally { setSaving(false) }
  }

  const handleSaveConverted = async () => {
    if (!selectedOrder && !lead.order_id) { toast(false, 'Link an order to mark as Bought'); return }
    setSaving(true)
    try {
      const { error } = await supa.from('leads').update({
        status: 'Converted', lead_quality: quality,
        occasion: occasion || null,
        occasion_date: occasionDate || null,
        products_interested: productsInterested.length ? productsInterested.join(', ') : null,
        lead_source: leadSource || lead.lead_source,
        order_id: selectedOrder?.id || lead.order_id || null,
        amount: selectedOrder ? n(selectedOrder.total_price) : lead.amount || null,
        assignee_comments: notes || null,
      }).eq('id', lead.id)
      if (error) throw error
      if (selectedOrder?.id) {
        try {
          await supa.from('lead_orders').delete().eq('lead_id', lead.id).eq('order_id', selectedOrder.id)
          await supa.from('lead_orders').insert({ lead_id: lead.id, order_id: selectedOrder.id, linked_by: window._currentUserEmail || 'walk-in' })
        } catch (e) { /* junction link is best-effort */ }
      }
      toast(true, 'Marked as Converted!')
      onSave()
    } catch { toast(false, 'Save failed') }
    finally { setSaving(false) }
  }

  const handleLogFollowUp = async () => {
    if (!fuNote.trim()) { toast(false, 'Please add a note'); return }
    setSaving(true)
    try {
      // Log interaction
      await supa.from('lead_interactions').insert([{
        lead_id: lead.id,
        note: fuNote,
        contacted_by: window._currentUserEmail,
        contacted_by_name: window._currentUserName || '',
        interaction_type: fuInteractionType,
      }])
      // Progress status
      const nextStatus = { 'Follow-up 1': 'Follow-up 2', 'Follow-up 2': 'Follow-up 3', 'Follow-up 3': 'To be Closed' }
      await supa.from('leads').update({
        status: nextStatus[currentStatus] || 'To be Closed',
        follow_up_date: fuNextDate,
        assignee_comments: fuNote,
      }).eq('id', lead.id)

      toast(true, `Follow-up logged → ${nextStatus[currentStatus] || 'To be Closed'}`)
      onSave()
    } catch { toast(false, 'Follow-up failed') }
    finally { setSaving(false) }
  }

  // handleMarkLostFromFollowUp now uses the same handleSaveLost with full detail form

  // ── Quality pill selector (rendered inline, NOT as a component to avoid remount) ──
  const qualityPillsJsx = (
    <div className="flex gap-1.5 flex-wrap">
      {LEAD_QUALITIES.map(q => {
        const qc = QUALITY_COLORS[q]
        return (
          <button
            key={q} type="button"
            onClick={() => setQuality(q)}
            className="text-[10px] px-2.5 py-1 rounded-full font-bold transition-all"
            style={{
              background: quality === q ? qc.color : qc.bg,
              color: quality === q ? '#fff' : qc.color,
              border: `1.5px solid ${quality === q ? qc.color : 'transparent'}`,
            }}
          >{q}</button>
        )
      })}
    </div>
  )

  // Occasion date, products interested, lead source — captured on walk-in log
  const extraFields = (
    <>
      <div>
        <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Event Date</label>
        <input type="date" value={occasionDate} onChange={e => setOccasionDate(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }} />
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Lead Source</label>
        <select value={leadSource} onChange={e => setLeadSource(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }}>
          <option value="">Select Source</option>
          {(lists.lead_sources || []).map(sx => <option key={sx} value={sx}>{sx}</option>)}
        </select>
      </div>
      <div className={isMobile ? '' : 'col-span-2'}>
        <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Products Interested</label>
        <div className="flex flex-wrap gap-1.5">
          {(lists.product_categories || []).map(pc => {
            const on = productsInterested.includes(pc)
            return <button key={pc} type="button" onClick={() => toggleProduct(pc)} className="text-[10px] px-2.5 py-1 rounded-full font-bold" style={{ background: on ? 'rgba(37,99,235,0.1)' : C.bg, color: on ? '#2563eb' : C.textMuted, border: `1.5px solid ${on ? '#2563eb' : C.border}` }}>{on ? '✓ ' : ''}{pc}</button>
          })}
        </div>
      </div>
    </>
  )

  // ── Detail fields shared between Lost / Follow-up (inline JSX, not a component) ──
  const renderDetailFields = (showFollowUpDateField) => (
    <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3 mt-3`}>
      <div>
        <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Walkout Reason {outcome === 'lost' && '*'}</label>
        <select value={walkoutReason} onChange={e => setWalkoutReason(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }}>
          <option value="">Select Reason</option>
          {WALKOUT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Occasion</label>
        <select value={occasion} onChange={e => setOccasion(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }}>
          <option value="">Select Occasion</option>
          {(lists.occasions || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {extraFields}
      <div>
        <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Lead Quality</label>
        {qualityPillsJsx}
      </div>
      {showFollowUpDateField && (
        <div>
          <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Follow-up Date</label>
          <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }} />
        </div>
      )}
      <div className={isMobile ? '' : 'col-span-2'}>
        <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Notes</label>
        <textarea placeholder="Quick note..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text, boxSizing: 'border-box', maxWidth: '100%' }} />
      </div>
    </div>
  )

  return (
    <div className="mb-4 rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.gold}60`, background: 'rgba(201,168,76,0.03)' }}>
      {/* Header */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: `1px solid ${C.gold}30` }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm" style={{ color: C.text }}>{lead.client_name || 'Walk-in'}</span>
          {lead.phone && <span className="text-xs" style={{ color: C.textMuted }}>{lead.phone}</span>}
          <span className="text-[10px]" style={{ color: C.textMuted }}>Party of {lead.party_size || 1}</span>
          <span className="text-[10px]" style={{ color: C.textMuted }}>Attended by {staffName(lead.assigned_to)}</span>
        </div>
        <button onClick={onClose} className="text-lg hover:opacity-60" style={{ color: C.textMuted }}>×</button>
      </div>

      <div className="px-4 py-3">
        {/* Follow-up leads: show follow-up actions (hidden when user picks lost/converted) */}
        {followUp && !showFollowUpLog && outcome !== 'lost' && outcome !== 'converted' && (
          <div>
            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={() => setShowFollowUpLog(true)} className="text-xs px-4 py-2 rounded-lg font-bold" style={{ background: 'rgba(37,99,235,0.08)', color: '#2563eb', border: `1.5px solid rgba(37,99,235,0.2)` }}>
                Log Follow-up
              </button>
              <button onClick={() => setOutcome('converted')} className="text-xs px-4 py-2 rounded-lg font-bold" style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a', border: `1.5px solid rgba(22,163,74,0.2)` }}>
                Mark Converted
              </button>
              <button onClick={() => setOutcome('lost')} className="text-xs px-4 py-2 rounded-lg font-bold" style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: `1.5px solid rgba(220,38,38,0.2)` }}>
                Mark Lost
              </button>
            </div>
            <div className="text-xs" style={{ color: C.textMuted }}>
              Current: <span className="font-bold" style={{ color: '#2563eb' }}>{currentStatus}</span>
              {lead.follow_up_date && <> — Follow-up: {new Date(lead.follow_up_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}
            </div>
          </div>
        )}

        {/* Follow-up log form */}
        {followUp && showFollowUpLog && (
          <div>
            <h4 className="text-xs font-bold uppercase mb-2" style={{ color: '#2563eb' }}>Log Follow-up</h4>
            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-3'} gap-3`}>
              <div>
                <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Type</label>
                <select value={fuInteractionType} onChange={e => setFuInteractionType(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }}>
                  {INTERACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Next Follow-up</label>
                <input type="date" value={fuNextDate} onChange={e => setFuNextDate(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }} />
              </div>
              <div className={isMobile ? '' : ''}>
                <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Note *</label>
                <textarea placeholder="What happened?" value={fuNote} onChange={e => setFuNote(e.target.value)} rows={2} className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text, boxSizing: 'border-box', maxWidth: '100%' }} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={handleLogFollowUp} disabled={saving} className="text-xs px-4 py-2 rounded-lg font-bold text-white" style={{ background: '#2563eb' }}>
                {saving ? 'Saving...' : 'Save Follow-up'}
              </button>
              <button onClick={() => setShowFollowUpLog(false)} className="text-xs px-3 py-2 rounded-lg font-bold" style={{ color: C.textMuted, border: `1px solid ${C.border}` }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Pending leads or editing terminal/follow-up leads: show outcome forms */}
        {(pending || outcome === 'lost' || outcome === 'converted') && !showFollowUpLog && (
          <div>
            {/* Outcome buttons */}
            {!outcome && (
              <div className={`flex ${isMobile ? 'flex-col' : ''} gap-2`}>
                <button onClick={() => setOutcome('lost')} className={`flex-1 text-sm px-4 py-3 rounded-xl font-bold transition-all`} style={{ background: 'rgba(220,38,38,0.05)', color: '#dc2626', border: '1.5px solid rgba(220,38,38,0.2)' }}>
                  Didn't Buy
                </button>
                <button onClick={() => setOutcome('followup')} className={`flex-1 text-sm px-4 py-3 rounded-xl font-bold transition-all`} style={{ background: 'rgba(37,99,235,0.05)', color: '#2563eb', border: '1.5px solid rgba(37,99,235,0.2)' }}>
                  Will Come Back
                </button>
                <button onClick={() => setOutcome('converted')} className={`flex-1 text-sm px-4 py-3 rounded-xl font-bold transition-all`} style={{ background: 'rgba(22,163,74,0.05)', color: '#16a34a', border: '1.5px solid rgba(22,163,74,0.2)' }}>
                  Bought / Ordered
                </button>
              </div>
            )}

            {/* Lost details */}
            {outcome === 'lost' && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold" style={{ color: '#dc2626' }}>Didn't Buy</span>
                  <button onClick={() => setOutcome(null)} className="text-[10px]" style={{ color: C.textMuted }}>← change</button>
                </div>
                {renderDetailFields(false)}
                <div className="flex gap-2 mt-3">
                  <button onClick={handleSaveLost} disabled={saving} className="text-xs px-4 py-2 rounded-lg font-bold text-white" style={{ background: '#dc2626' }}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {/* Follow-up details */}
            {outcome === 'followup' && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold" style={{ color: '#2563eb' }}>Will Come Back</span>
                  <button onClick={() => setOutcome(null)} className="text-[10px]" style={{ color: C.textMuted }}>← change</button>
                </div>
                {renderDetailFields(true)}
                <div className="flex gap-2 mt-3">
                  <button onClick={handleSaveFollowUp} disabled={saving} className="text-xs px-4 py-2 rounded-lg font-bold text-white" style={{ background: '#2563eb' }}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {/* Converted details */}
            {outcome === 'converted' && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold" style={{ color: '#16a34a' }}>Bought / Ordered</span>
                  {(pending || followUp) && <button onClick={() => setOutcome(null)} className="text-[10px]" style={{ color: C.textMuted }}>← change</button>}
                </div>
                <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3 mt-3`}>
                  <div>
                    <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Lead Quality</label>
                    {qualityPillsJsx}
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Occasion</label>
                    <select value={occasion} onChange={e => setOccasion(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }}>
                      <option value="">Select Occasion</option>
                      {(lists.occasions || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  {extraFields}
                  <div className={isMobile ? '' : 'col-span-2'}>
                    <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Link Order *</label>
                    <input type="text" placeholder="Search by order number or customer name..." value={orderSearch} onChange={e => setOrderSearch(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }} />
                    {searchingOrders && <div className="text-[10px] mt-1" style={{ color: C.textMuted }}>Searching...</div>}
                    {orderResults.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1">
                        {orderResults.map(order => (
                          <button
                            key={order.id}
                            onClick={() => { setSelectedOrder(order); setOrderResults([]); setOrderSearch(order.customer_name || '') }}
                            className="text-left text-xs px-3 py-2 rounded-lg transition-all"
                            style={{
                              background: selectedOrder?.id === order.id ? 'rgba(22,163,74,0.1)' : C.bg,
                              border: `1px solid ${selectedOrder?.id === order.id ? '#16a34a' : C.border}`,
                              color: C.text,
                            }}
                          >
                            <span className="font-bold">#{order.order_number}</span>
                            <span className="ml-2">{order.customer_name}</span>
                            <span className="ml-2 font-bold" style={{ color: '#16a34a' }}>{fmtCurrency(order.total_price)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedOrder && (
                      <div className="mt-1 text-[10px] font-bold" style={{ color: '#16a34a' }}>
                        Linked: #{selectedOrder.order_number} — {fmtCurrency(selectedOrder.total_price)}
                      </div>
                    )}
                  </div>
                  <div className={isMobile ? '' : 'col-span-2'}>
                    <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Notes</label>
                    <textarea placeholder="Quick note..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text, boxSizing: 'border-box', maxWidth: '100%' }} />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={handleSaveConverted} disabled={saving} className="text-xs px-4 py-2 rounded-lg font-bold text-white" style={{ background: '#16a34a' }}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Already terminal — show read-only summary (only if outcome not set for editing) */}
        {!pending && !followUp && ['Lost', 'Converted'].includes(currentStatus) && outcome === null && (
          <div className="text-xs" style={{ color: C.textMuted }}>
            Status: <span className="font-bold" style={{ color: getStatusColor(currentStatus).color }}>{currentStatus}</span>
            {lead.client_requirements && <> — Reason: {lead.client_requirements}</>}
            {lead.amount && <> — Amount: {fmtCurrency(lead.amount)}</>}
          </div>
        )}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// WALK-IN REGISTER — monthly records + follow-up engine
// ═════════════════════════════════════════════════════════════════════════════
const monthRange = () => {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: fmtYMD(from), to: fmtYMD(to) }
}

const WalkinRegister = ({ leads = [], teamMembers = [], onRefresh, isMobile, onEditLead, focusStaffId = '', onLinkOrder, linkedIds }) => {
  const todayStr = new Date().toISOString().split('T')[0]
  const [range, setRange] = useState(monthRange())
  const [fStaff, setFStaff] = useState('')
  const [fStore, setFStore] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fQuality, setFQuality] = useState('')
  const [fReturning, setFReturning] = useState('')
  const [needsFollowUp, setNeedsFollowUp] = useState(false)
  useEffect(() => { if (focusStaffId) { setNeedsFollowUp(true); setFStaff(String(focusStaffId)) } }, [focusStaffId])
  const [search, setSearch] = useState('')
  const [fSource, setFSource] = useState('')
  const [sortCol, setSortCol] = useState('')
  const [sortDir, setSortDir] = useState('desc')
  const [expandedLeadId, setExpandedLeadId] = useState(null)

  const staffName = (id) => teamMembers.find(tm => String(tm.id) === String(id))?.name || '—'

  const leadDate = (l) => l.lead_date || (l.created_at ? fmtYMD(new Date(l.created_at)) : '')
  const staffStore = (id) => teamMembers.find(tm => String(tm.id) === String(id))?.assigned_store || ''
  const allWalkins = useMemo(() => { const seen = new Set(); return leads.filter(l => isWalkin(l) && l.id != null && !seen.has(l.id) && seen.add(l.id)) }, [leads])
  const phoneCounts = useMemo(() => { const m = {}; allWalkins.forEach(l => { const p = (l.phone || '').replace(/\D/g, ''); if (p) m[p] = (m[p] || 0) + 1 }); return m }, [allWalkins])
  const isReturning = (l) => { const p = (l.phone || '').replace(/\D/g, ''); return !!p && phoneCounts[p] > 1 }
  const stores = useMemo(() => [...new Set(allWalkins.map(l => l.store_location).filter(Boolean))].sort(), [allWalkins])
  const sources = useMemo(() => [...new Set(allWalkins.map(l => l.lead_source).filter(Boolean))].sort(), [allWalkins])
  const staffOptions = useMemo(() => {
    const ids = [...new Set(allWalkins.map(l => l.assigned_to).filter(Boolean).map(String))]
    const named = ids.map(id => ({ id, name: staffName(id) })).filter(x => x.name && x.name !== '—')
    // include any active stylists from the roster too, so all can be picked even before they log a walk-in
    const rosterStylists = filterStylists(teamMembers)
    const rosterAll = (rosterStylists.length ? rosterStylists : teamMembers).map(tm => ({ id: String(tm.id), name: tm.name })).filter(x => x.name)
    const map = {};[...named, ...rosterAll].forEach(x => { if (!map[x.id]) map[x.id] = x.name })
    return Object.entries(map).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [allWalkins, teamMembers])
  const qRank = (q) => { const i = LEAD_QUALITIES.indexOf(q || 'Avg'); return i < 0 ? 99 : i }
  const toggleSort = (k) => { if (sortCol === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(k); setSortDir('asc') } }
  const sortArrow = (k) => sortCol === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''
  const daysSince = (d) => d ? Math.max(0, Math.ceil((new Date(todayStr) - new Date(d)) / 86400000)) : '—'

  const rangeRows = useMemo(() => allWalkins.filter(l => { const d = leadDate(l); return d && d >= range.from && d <= range.to }), [allWalkins, range])

  const rows = useMemo(() => {
    let r = rangeRows
    if (fStaff) r = r.filter(l => String(l.assigned_to) === String(fStaff))
    if (fStore) r = r.filter(l => l.store_location === fStore)
    if (fStatus) r = r.filter(l => l.status === fStatus)
    if (fQuality) r = r.filter(l => (l.lead_quality || 'Avg') === fQuality)
    if (fSource) r = r.filter(l => (l.lead_source || '') === fSource)
    if (fReturning === 'returning') r = r.filter(isReturning)
    if (fReturning === 'new') r = r.filter(l => !isReturning(l))
    if (needsFollowUp) r = r.filter(l => needsAttention(l))
    if (search.trim()) { const q = search.trim().toLowerCase(); r = r.filter(l => (l.client_name || '').toLowerCase().includes(q) || (l.phone || '').includes(q) || (l.lead_source || '').toLowerCase().includes(q)) }
    if (sortCol) {
      const dir = sortDir === 'asc' ? 1 : -1
      const val = (l) => ({ date: leadDate(l), client: (l.client_name || '').toLowerCase(), party: n(l.party_size || 1), staff: staffName(l.assigned_to).toLowerCase(), store: (l.store_location || '').toLowerCase(), source: (l.lead_source || '').toLowerCase(), quality: qRank(l.lead_quality), status: (l.status || '').toLowerCase(), followup: l.follow_up_date || '', age: leadDate(l) }[sortCol])
      return [...r].sort((a, b) => { const av = val(a), bv = val(b); return typeof av === 'number' ? dir * (av - bv) : dir * String(av).localeCompare(String(bv)) })
    }
    return [...r].sort((a, b) => needsFollowUp
      ? (a.follow_up_date || '').localeCompare(b.follow_up_date || '')
      : (String(leadDate(b)).localeCompare(String(leadDate(a))) || (new Date(b.created_at) - new Date(a.created_at))))
  }, [rangeRows, fStaff, fStore, fStatus, fQuality, fSource, fReturning, needsFollowUp, search, sortCol, sortDir, todayStr])

  const kpi = useMemo(() => {
    const total = rangeRows.length
    const people = rangeRows.reduce((s, l) => s + n(l.party_size || 1), 0)
    const converted = rangeRows.filter(l => l.status === 'Converted').length
    const lost = rangeRows.filter(l => l.status === 'Lost' || l.status === 'Not Qualified').length
    const following = rangeRows.filter(l => isFollowUp(l.status)).length
    const dueFollowups = rangeRows.filter(l => isFollowUp(l.status) && l.follow_up_date && l.follow_up_date <= todayStr).length
    const returning = rangeRows.filter(isReturning).length
    return {
      total, people, converted, lost, following, dueFollowups,
      convRate: total ? Math.round(converted / total * 100) : 0,
      returnRate: total ? Math.round(returning / total * 100) : 0
    }
  }, [rangeRows, todayStr])

  const setPreset = (which) => {
    const now = new Date()
    if (which === 'this') setRange(monthRange())
    else if (which === 'last') setRange({ from: fmtYMD(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: fmtYMD(new Date(now.getFullYear(), now.getMonth(), 0)) })
    else if (which === 'all') setRange({ from: '2020-01-01', to: todayStr })
  }

  const exportCsv = () => {
    const headers = ['Date', 'Time', 'Client', 'Phone', 'Party', 'Staff', 'Store', 'Source', 'Quality', 'Reason', 'Status', 'Follow-up', 'Returning']
    const lines = [headers.join(',')]
    rows.forEach(l => {
      const vals = [leadDate(l), fmtTime(l.created_at), l.client_name || '', l.phone || '', l.party_size || 1, staffName(l.assigned_to), l.store_location || staffStore(l.assigned_to) || '', l.lead_source || '', l.lead_quality || 'Avg', (l.client_requirements || ''), l.status, l.follow_up_date || '', isReturning(l) ? 'Yes' : 'No']
      lines.push(vals.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `walkins_${range.from}_to_${range.to}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const input = { background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }

  return (
    <div>
      {/* Range + presets + export */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[{ k: 'this', l: 'This month' }, { k: 'last', l: 'Last month' }, { k: 'all', l: 'All' }].map(p => (
          <button key={p.k} onClick={() => setPreset(p.k)} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.textMuted }}>{p.l}</button>
        ))}
        <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} className="text-sm px-2 py-1.5 rounded-lg outline-none" style={input} />
        <span style={{ color: C.textMuted }}>→</span>
        <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} className="text-sm px-2 py-1.5 rounded-lg outline-none" style={input} />
        <button onClick={exportCsv} className="text-xs font-bold px-3 py-1.5 rounded-lg ml-auto" style={{ background: C.gold, color: '#fff' }}>Export CSV</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3 mb-4">
        <KpiCard label="Walk-ins" value={kpi.total} />
        <KpiCard label="People" value={kpi.people} />
        <KpiCard label="Converted" value={kpi.converted} color="#16a34a" />
        <KpiCard label="Conv Rate" value={`${kpi.convRate}%`} color={C.gold} />
        <KpiCard label="Following Up" value={kpi.following} color="#2563eb" />
        <KpiCard label="Follow-up Due" value={kpi.dueFollowups} color="#d97706" />
        <KpiCard label="Lost" value={kpi.lost} color="#dc2626" />
        <KpiCard label="Returning" value={`${kpi.returnRate}%`} color="#7c3aed" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / phone" className="text-sm px-3 py-1.5 rounded-lg outline-none" style={{ ...input, minWidth: 180 }} />
        <select value={fStaff} onChange={e => setFStaff(e.target.value)} className="text-sm px-2 py-1.5 rounded-lg outline-none" style={input}>
          <option value="">All staff</option>
          {staffOptions.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </select>
        {stores.length > 1 && (
          <select value={fStore} onChange={e => setFStore(e.target.value)} className="text-sm px-2 py-1.5 rounded-lg outline-none" style={input}>
            <option value="">All stores</option>
            {stores.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        )}
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="text-sm px-2 py-1.5 rounded-lg outline-none" style={input}>
          <option value="">All statuses</option>
          {['Yet to Connect', 'Follow-up 1', 'Follow-up 2', 'Follow-up 3', 'To be Closed', 'Converted', 'Lost'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fQuality} onChange={e => setFQuality(e.target.value)} className="text-sm px-2 py-1.5 rounded-lg outline-none" style={input}>
          <option value="">All quality</option>
          {LEAD_QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
        {sources.length > 0 && (
          <select value={fSource} onChange={e => setFSource(e.target.value)} className="text-sm px-2 py-1.5 rounded-lg outline-none" style={input}>
            <option value="">All sources</option>
            {sources.map(sx => <option key={sx} value={sx}>{sx}</option>)}
          </select>
        )}
        <select value={fReturning} onChange={e => setFReturning(e.target.value)} className="text-sm px-2 py-1.5 rounded-lg outline-none" style={input}>
          <option value="">New + Returning</option>
          <option value="new">New only</option>
          <option value="returning">Returning only</option>
        </select>
        <button onClick={() => setNeedsFollowUp(v => !v)} className="text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ background: needsFollowUp ? '#d97706' : 'transparent', color: needsFollowUp ? '#fff' : '#d97706', border: needsFollowUp ? 'none' : '1px solid rgba(217,119,6,0.4)' }}>
          Needs follow-up{(() => { const nn2 = rangeRows.filter(needsAttention).length; return nn2 ? ` (${nn2})` : '' })()}
        </button>
        {(fStaff || fStore || fStatus || fQuality || fSource || fReturning || search || sortCol || needsFollowUp) && (
          <button onClick={() => { setFStaff(''); setFStore(''); setFStatus(''); setFQuality(''); setFSource(''); setFReturning(''); setSearch(''); setSortCol(''); setNeedsFollowUp(false) }} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ color: '#dc2626', border: '1px solid rgba(220,38,38,0.3)' }}>Clear</button>
        )}
      </div>

      {/* Expanded outcome */}
      {expandedLeadId && (
        <OutcomePanel lead={rows.find(l => l.id === expandedLeadId) || leads.find(l => l.id === expandedLeadId)} teamMembers={teamMembers} staffName={staffName}
          onClose={() => setExpandedLeadId(null)} onSave={() => { setExpandedLeadId(null); onRefresh?.() }} isMobile={isMobile} />
      )}

      {/* Records table */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.cardBg }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}` }}>
          <h3 className="font-bold text-sm" style={{ color: C.text }}>Walk-in Register</h3>
          <span className="text-xs font-bold" style={{ color: C.textMuted }}>{rows.length} records</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm" style={{ color: C.textMuted }}>No walk-ins match these filters.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {[['Date', 'date'], ['Time', null], ['Client', 'client'], ['Phone', null], ['Party', 'party'], ['Staff', 'staff'], ['Store', 'store'], ['Source', 'source'], ['Quality', 'quality'], ['Reason', null], ['Status', 'status'], ['Follow-up', 'followup'], ['Age', 'age'], ['', null]].map(([h, key], hi) => (
                    <th key={(h || 'act') + hi} onClick={key ? () => toggleSort(key) : undefined} style={{ padding: '0.6rem 0.5rem', textAlign: 'left', fontSize: '0.65rem', fontWeight: 700, color: sortCol === key && key ? C.gold : C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', cursor: key ? 'pointer' : 'default', userSelect: 'none' }}>{h}{key ? sortArrow(key) : ''}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(lead => {
                  const sc = getStatusColor(lead.status)
                  const qc = QUALITY_COLORS[lead.lead_quality] || QUALITY_COLORS['Avg']
                  const overdue = isFollowUp(lead.status) && lead.follow_up_date && lead.follow_up_date <= todayStr
                  const focus = needsAttention(lead)
                  const accent = overdue ? '#d97706' : (focus ? '#C9A84C' : 'transparent')
                  return (
                    <tr key={lead.id} style={{ borderBottom: `1px solid ${C.border}`, borderLeft: `4px solid ${accent}`, background: expandedLeadId === lead.id ? 'rgba(201,168,76,0.10)' : (focus ? 'rgba(201,168,76,0.035)' : 'transparent') }}>
                      <td style={{ padding: '0.5rem', fontSize: '0.72rem', color: C.textMuted, whiteSpace: 'nowrap' }}>{new Date(leadDate(lead) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.72rem', color: C.textMuted, whiteSpace: 'nowrap' }}>{fmtTime(lead.created_at)}</td>
                      <td style={{ padding: '0.5rem', fontWeight: 600, color: C.text, whiteSpace: 'nowrap' }}>
                        {lead.client_name || '—'}{isReturning(lead) && <span className="ml-1 text-[9px] px-1 py-0.5 rounded" style={{ background: 'rgba(124,58,237,0.1)', color: '#7c3aed', fontWeight: 700 }}>RET</span>}
                      </td>
                      <td style={{ padding: '0.5rem', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{lead.phone ? <a href={`tel:${lead.phone}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{lead.phone}</a> : '—'}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 700, color: C.text }}>{lead.party_size || 1}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.72rem', color: C.text, whiteSpace: 'nowrap' }}>{staffName(lead.assigned_to)}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.72rem', color: C.textMuted, whiteSpace: 'nowrap' }}>{lead.store_location || staffStore(lead.assigned_to) || '—'}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.72rem', color: C.textMuted, whiteSpace: 'nowrap' }}>{lead.lead_source || '—'}</td>
                      <td style={{ padding: '0.5rem' }}><Badge color={qc.color} bg={qc.bg}>{lead.lead_quality || 'Avg'}</Badge></td>
                      <td style={{ padding: '0.5rem', fontSize: '0.72rem', color: C.textMuted, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.client_requirements || '—'}</td>
                      <td style={{ padding: '0.5rem' }}><span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>{lead.status}</span></td>
                      <td style={{ padding: '0.5rem', fontSize: '0.72rem', color: overdue ? '#d97706' : C.textMuted, fontWeight: overdue ? 700 : 400, whiteSpace: 'nowrap' }}>{lead.follow_up_date ? new Date(lead.follow_up_date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.72rem', color: C.textMuted }}>{daysSince(leadDate(lead))}d</td>
                      <td style={{ padding: '0.5rem' }}>
                        <RowActions lead={lead} onEditLead={onEditLead} onLinkOrder={onLinkOrder} linkedIds={linkedIds} logLabel={expandedLeadId === lead.id ? 'Close' : 'Log Call'}
                          onLog={(l) => setExpandedLeadId(expandedLeadId === l.id ? null : l.id)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// WALK-IN ANALYTICS — store + stylist review
// ═════════════════════════════════════════════════════════════════════════════
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const Bar = ({ label, value, max, tint = C.gold, right }) => (
  <div className="flex items-center gap-2 mb-1.5">
    <div className="text-xs w-28 flex-shrink-0 truncate" style={{ color: C.textMuted }}>{label}</div>
    <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: C.borderLight }}>
      <div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.round(value / max * 100) : 0}%`, background: tint, minWidth: value > 0 ? 4 : 0 }} />
    </div>
    <div className="text-xs font-bold w-16 text-right flex-shrink-0" style={{ color: C.text }}>{right != null ? right : value}</div>
  </div>
)

const Panel = ({ title, children }) => (
  <div className="rounded-xl p-4" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
    <h3 className="font-bold text-sm mb-3" style={{ color: C.text }}>{title}</h3>
    {children}
  </div>
)

const FUN_COLORS = ['#c9a432', '#2563eb', '#16a34a']
const FunnelChart = ({ stages }) => {
  const max = Math.max(1, ...stages.map(st => st.value))
  const W = 320, H = 62, pad = 8
  const widths = stages.map(st => Math.max(24, (st.value / max) * (W - pad * 2)))
  return (
    <svg viewBox={`0 0 ${W} ${H * stages.length}`} width="100%" style={{ maxWidth: 380 }}>
      {stages.map((st, i) => {
        const wTop = widths[i]
        const wBot = widths[i + 1] != null ? widths[i + 1] : wTop * 0.8
        const cx = W / 2, y = i * H, yb = y + H - 6
        const p = `${cx - wTop / 2},${y + 4} ${cx + wTop / 2},${y + 4} ${cx + wBot / 2},${yb} ${cx - wBot / 2},${yb}`
        const pct = stages[0].value ? Math.round(st.value / stages[0].value * 100) : 0
        return (
          <g key={st.label}>
            <polygon points={p} fill={st.color} opacity="0.92" />
            <text x={cx} y={y + H / 2} textAnchor="middle" fill="#fff" fontSize="15" fontWeight="800">{st.value}</text>
            <text x={cx} y={y + H / 2 + 15} textAnchor="middle" fill="#fff" fontSize="9.5" opacity="0.95" fontWeight="700">{st.label}{i > 0 ? ` · ${pct}%` : ''}</text>
          </g>
        )
      })}
    </svg>
  )
}

const LINE_COLORS = ['#c9a432', '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#0891b2']
const MultiLineChart = ({ series }) => {
  const W = 680, H = 260, padL = 32, padR = 12, padT = 12, padB = 26
  const maxY = Math.max(1, ...series.flatMap(s => s.values.filter(v => v != null)))
  const xat = (idx) => padL + (idx / 30) * (W - padL - padR)
  const yat = (v) => padT + (1 - v / maxY) * (H - padT - padB)
  const yTicks = 4
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const v = Math.round(maxY * i / yTicks), yy = yat(v)
          return <g key={i}>
            <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="#ebe8e0" strokeWidth="1" />
            <text x={padL - 5} y={yy + 3} textAnchor="end" fontSize="9" fill="#807664">{v}</text>
          </g>
        })}
        {[1, 5, 10, 15, 20, 25, 31].map(d => (
          <text key={d} x={xat(d - 1)} y={H - padB + 14} textAnchor="middle" fontSize="9" fill="#807664">{d}</text>
        ))}
        {series.map(s => {
          const pts = s.values.map((v, idx) => v == null ? null : `${xat(idx).toFixed(1)},${yat(v).toFixed(1)}`).filter(Boolean).join(' ')
          return <polyline key={s.name} points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
        })}
      </svg>
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {series.map(s => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-xs" style={{ color: '#4b4b47' }}>
            <span style={{ width: 14, height: 3, borderRadius: 2, background: s.color, display: 'inline-block' }} />{s.name}
          </span>
        ))}
      </div>
    </div>
  )
}

const WalkinAnalytics = ({ leads = [], teamMembers = [] }) => {
  const todayStr = new Date().toISOString().split('T')[0]
  const [aView, setAView] = useState('overview')
  const [range, setRange] = useState(monthRange())
  const [rev, setRev] = useState({})
  const posOrders = useChannelOrders('In-store', range.from, range.to)

  const staffName = (id) => teamMembers.find(tm => String(tm.id) === String(id))?.name || (id ? 'Staff #' + id : 'Unassigned')
  const allWalkins = useMemo(() => leads.filter(isWalkin), [leads])
  const phoneCounts = useMemo(() => { const m = {}; allWalkins.forEach(l => { const p = (l.phone || '').replace(/\D/g, ''); if (p) m[p] = (m[p] || 0) + 1 }); return m }, [allWalkins])
  const isReturningLead = (l) => { const p = (l.phone || '').replace(/\D/g, ''); return !!p && phoneCounts[p] > 1 }
  const rows = useMemo(() => allWalkins.filter(l => l.lead_date >= range.from && l.lead_date <= range.to), [allWalkins, range])
  const conv = useMemo(() => rows.filter(l => l.status === 'Converted'), [rows])
  const convKey = conv.map(l => l.id).join(',')

  useEffect(() => {
    const ids = conv.map(l => l.id)
    if (!ids.length) { setRev({}); return }
    let cancelled = false
      ; (async () => {
        try {
          let links = []
          for (let i = 0; i < ids.length; i += 200) { const { data } = await supa.from('lead_orders').select('lead_id, order_id').in('lead_id', ids.slice(i, i + 200)); links = links.concat(data || []) }
          const oids = [...new Set(links.map(l => l.order_id))]
          if (!oids.length) { if (!cancelled) setRev({}); return }
          let orders = []
          for (let i = 0; i < oids.length; i += 200) { const { data } = await supa.from('shopify_orders').select('id, total_price').in('id', oids.slice(i, i + 200)); orders = orders.concat(data || []) }
          const omap = Object.fromEntries(orders.map(o => [o.id, Number(o.total_price) || 0]))
          const map = {}; links.forEach(l => { map[l.lead_id] = (map[l.lead_id] || 0) + (omap[l.order_id] || 0) })
          if (!cancelled) setRev(map)
        } catch { if (!cancelled) setRev({}) }
      })()
    return () => { cancelled = true }
  }, [convKey]) // eslint-disable-line

  const kpi = useMemo(() => {
    const total = rows.length
    const people = rows.reduce((s, l) => s + n(l.party_size || 1), 0)
    const converted = conv.length
    const revenue = conv.reduce((s, l) => s + (rev[l.id] || 0), 0)
    const returning = rows.filter(isReturningLead).length
    return {
      total, people, converted, revenue,
      convRate: total ? Math.round(converted / total * 100) : 0,
      aov: converted ? Math.round(revenue / converted) : 0,
      avgParty: total ? (people / total).toFixed(1) : 0,
      returnRate: total ? Math.round(returning / total * 100) : 0
    }
  }, [rows, conv, rev])

  const qmix = useMemo(() => {
    const total = rows.length || 1
    return LEAD_QUALITIES.map(q => ({ q, n: rows.filter(l => (l.lead_quality || 'Avg') === q).length }))
      .map(x => ({ ...x, pct: Math.round(x.n / total * 100), color: (QUALITY_COLORS[x.q] || {}).color || '#999' }))
  }, [rows])

  const funnel = useMemo(() => {
    const total = rows.length
    const engaged = rows.filter(l => l.status !== 'Yet to Connect' && l.status !== 'New').length
    return [{ label: 'Walk-ins', value: total, color: FUN_COLORS[0] }, { label: 'Engaged', value: engaged, color: FUN_COLORS[1] }, { label: 'Converted', value: conv.length, color: FUN_COLORS[2] }]
  }, [rows, conv])

  const leaderboard = useMemo(() => {
    const m = {}
    rows.forEach(l => {
      const k = l.assigned_to || 'unassigned'
      if (!m[k]) m[k] = { id: k, walkins: 0, people: 0, hq: 0, converted: 0, lost: 0, following: 0, revenue: 0 }
      m[k].walkins++; m[k].people += n(l.party_size || 1)
      if (l.lead_quality === 'High Quality') m[k].hq++
      if (l.status === 'Converted') { m[k].converted++; m[k].revenue += rev[l.id] || 0 }
      else if (l.status === 'Lost' || l.status === 'Not Qualified') m[k].lost++
      else if (isFollowUp(l.status)) m[k].following++
    })
    return Object.values(m).map(x => ({ ...x, name: staffName(x.id), convRate: x.walkins ? Math.round(x.converted / x.walkins * 100) : 0, hqPct: x.walkins ? Math.round(x.hq / x.walkins * 100) : 0, avgParty: x.walkins ? (x.people / x.walkins).toFixed(1) : 0 }))
      .sort((a, b) => b.revenue - a.revenue || b.converted - a.converted)
  }, [rows, rev, teamMembers])

  const reasons = useMemo(() => {
    const m = {}
    rows.filter(l => l.status === 'Lost' || isFollowUp(l.status)).forEach(l => { const r = l.client_requirements || 'Not recorded'; m[r] = (m[r] || 0) + 1 })
    return Object.entries(m).map(([r, c]) => ({ r, c })).sort((a, b) => b.c - a.c).slice(0, 8)
  }, [rows])

  const byStore = useMemo(() => {
    const m = {}
    rows.forEach(l => { const st = l.store_location || 'Unassigned'; if (!m[st]) m[st] = { walkins: 0, converted: 0, revenue: 0 }; m[st].walkins++; if (l.status === 'Converted') { m[st].converted++; m[st].revenue += rev[l.id] || 0 } })
    return Object.entries(m).map(([st, v]) => ({ st, ...v, rate: v.walkins ? Math.round(v.converted / v.walkins * 100) : 0 })).sort((a, b) => b.walkins - a.walkins)
  }, [rows, rev])

  const byWeekday = useMemo(() => {
    const arr = [0, 0, 0, 0, 0, 0, 0]
    rows.forEach(l => { const d = new Date(l.created_at); if (!isNaN(d)) arr[d.getDay()]++ })
    return arr
  }, [rows])

  const occasions = useMemo(() => {
    const m = {}
    rows.filter(l => l.occasion).forEach(l => {
      if (!m[l.occasion]) m[l.occasion] = { total: 0, hq: 0, converted: 0 }
      m[l.occasion].total++
      if (l.lead_quality === 'High Quality') m[l.occasion].hq++
      if (l.status === 'Converted') m[l.occasion].converted++
    })
    return Object.entries(m).map(([o, v]) => ({ o, ...v, hqPct: v.total ? Math.round(v.hq / v.total * 100) : 0 })).sort((a, b) => b.total - a.total).slice(0, 8)
  }, [rows])

  const statusMix = useMemo(() => {
    const m = {}
    rows.filter(l => !['Converted', 'Lost', 'Not Qualified'].includes(l.status)).forEach(l => { const st = l.status || 'New'; m[st] = (m[st] || 0) + 1 })
    return Object.entries(m).map(([st, c]) => ({ st, c })).sort((a, b) => b.c - a.c)
  }, [rows])

  // Monthly overview — per-day counts for the last 6 months
  const [monthlyMetric, setMonthlyMetric] = useState('walkins')
  const monthly = useMemo(() => {
    const now = new Date(); const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y = d.getFullYear(), m = d.getMonth(), dim = new Date(y, m + 1, 0).getDate()
      months.push({ y, m, label: d.toLocaleString('en-US', { month: 'short' }) + " '" + String(y).slice(2), dim, wk: new Array(dim).fill(0), cv: new Array(dim).fill(0) })
    }
    allWalkins.forEach(l => {
      if (!l.lead_date) return
      const d = new Date(l.lead_date + 'T00:00:00')
      const mo = months.find(x => x.y === d.getFullYear() && x.m === d.getMonth())
      if (mo) { const day = d.getDate() - 1; mo.wk[day]++; if (l.status === 'Converted') mo.cv[day]++ }
    })
    return months
  }, [allWalkins])
  const monthlySeries = useMemo(() => monthly.map((mo, i) => ({ name: mo.label, color: LINE_COLORS[i % LINE_COLORS.length], values: monthlyMetric === 'conversions' ? mo.cv : mo.wk })), [monthly, monthlyMetric])

  const setPreset = (which) => {
    const now = new Date()
    if (which === 'this') setRange(monthRange())
    else if (which === 'last') setRange({ from: fmtYMD(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: fmtYMD(new Date(now.getFullYear(), now.getMonth(), 0)) })
    else if (which === 'all') setRange({ from: '2020-01-01', to: todayStr })
  }
  const input = { background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }

  return (
    <div>
      {/* Analytics sub-view */}
      <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: C.borderLight, width: 'fit-content' }}>
        {[{ k: 'overview', label: 'Overview' }, { k: 'monthly', label: 'Monthly Trends' }].map(v => (
          <button key={v.k} onClick={() => setAView(v.k)} className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={{ background: aView === v.k ? C.gold : 'transparent', color: aView === v.k ? '#fff' : C.textMuted }}>{v.label}</button>
        ))}
      </div>

      {aView === 'overview' ? (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {[{ k: 'this', l: 'This month' }, { k: 'last', l: 'Last month' }, { k: 'all', l: 'All' }].map(p => (
              <button key={p.k} onClick={() => setPreset(p.k)} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.textMuted }}>{p.l}</button>
            ))}
            <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} className="text-sm px-2 py-1.5 rounded-lg outline-none" style={input} />
            <span style={{ color: C.textMuted }}>→</span>
            <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} className="text-sm px-2 py-1.5 rounded-lg outline-none" style={input} />
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-3">
            <KpiCard label="Walk-ins" value={kpi.total} sub={`${kpi.people} people · avg ${kpi.avgParty}`} />
            <KpiCard label="Orders (POS)" value={posOrders.count} color="#16a34a" sub={`CRM ${kpi.converted} converted`} />
            <KpiCard label="Conv Rate" value={`${kpi.convRate}%`} color={C.gold} />
            <KpiCard label="Revenue (POS · In-store)" value={fmtCurrency(posOrders.revenue)} color="#16a34a" sub={`CRM-linked ${fmtCurrency(kpi.revenue)}`} />
            <KpiCard label="Avg Order" value={fmtCurrency(posOrders.count ? posOrders.revenue / posOrders.count : 0)} />
            <KpiCard label="Returning Cust." value={`${kpi.returnRate}%`} color="#7c3aed" />
          </div>

          {/* Quality mix — on top */}
          <div className="rounded-xl p-4 mb-3" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-sm" style={{ color: C.text }}>Lead quality mix</h3>
              <span className="text-xs" style={{ color: C.textMuted }}>{kpi.total} walk-ins</span>
            </div>
            <div className="flex w-full h-5 rounded-full overflow-hidden mb-2" style={{ background: C.borderLight }}>
              {qmix.map(q => q.pct > 0 && <div key={q.q} title={`${q.q}: ${q.pct}%`} style={{ width: `${q.pct}%`, background: q.color }} />)}
            </div>
            <div className="flex flex-wrap gap-3">
              {qmix.map(q => (
                <span key={q.q} className="inline-flex items-center gap-1.5 text-xs" style={{ color: C.textMuted }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: q.color, display: 'inline-block' }} />
                  {q.q} <b style={{ color: C.text }}>{q.pct}%</b> <span style={{ color: C.textLight }}>({q.n})</span>
                </span>
              ))}
            </div>
          </div>

          {/* Funnel + Footfall */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            <Panel title="Conversion funnel"><div className="flex justify-center pt-1"><FunnelChart stages={funnel} /></div></Panel>
            <Panel title="Footfall by weekday">
              {WEEKDAYS.map((d, i) => <Bar key={d} label={d} value={byWeekday[i]} max={Math.max(1, ...byWeekday)} tint="#c9a432" />)}
            </Panel>
          </div>

          {/* Stylist leaderboard */}
          <Panel title="Stylist performance">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Stylist', 'Walk-ins', 'People', 'HQ', 'HQ %', 'Converted', 'Conv %', 'Revenue', 'Following', 'Lost', 'Avg party'].map(h => (
                    <th key={h} style={{ padding: '0.5rem', textAlign: h === 'Stylist' ? 'left' : 'right', fontSize: '0.65rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {leaderboard.map(s => (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '0.5rem', fontWeight: 700, color: C.text }}>{s.name}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', color: C.text }}>{s.walkins}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', color: C.textMuted }}>{s.people}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700, color: '#7c3aed' }}>{s.hq}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', color: '#7c3aed' }}>{s.hqPct}%</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{s.converted}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700, color: C.gold }}>{s.convRate}%</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700, color: C.text }}>{fmtCurrency(s.revenue)}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', color: '#2563eb' }}>{s.following}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', color: '#dc2626' }}>{s.lost}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', color: C.textMuted }}>{s.avgParty}</td>
                    </tr>
                  ))}
                  {leaderboard.length === 0 && <tr><td colSpan={11} style={{ padding: '1rem', textAlign: 'center', color: C.textMuted }}>No walk-ins in range</td></tr>}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Objections + Store */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
            <Panel title="Why they didn't buy">
              {reasons.length === 0 ? <div className="text-xs" style={{ color: C.textMuted }}>No data</div> :
                reasons.map(r => <Bar key={r.r} label={r.r} value={r.c} max={reasons[0].c} tint="#dc2626" />)}
            </Panel>
            <Panel title="By store">
              {byStore.map(s => <Bar key={s.st} label={s.st} value={s.walkins} max={Math.max(...byStore.map(x => x.walkins))} tint="#2563eb" right={`${s.walkins} · ${s.rate}% · ${fmtCurrency(s.revenue)}`} />)}
              {byStore.length === 0 && <div className="text-xs" style={{ color: C.textMuted }}>No data</div>}
            </Panel>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
            <Panel title="Occasion breakdown">
              {occasions.length === 0 ? <div className="text-xs" style={{ color: C.textMuted }}>No data</div> :
                occasions.map(o => <Bar key={o.o} label={o.o} value={o.total} max={occasions[0].total} tint="#16a34a" right={`${o.total} · ${o.hq} HQ (${o.hqPct}%) · ${o.converted} conv`} />)}
            </Panel>
            <Panel title="Active pipeline by status">
              {statusMix.length === 0 ? <div className="text-xs" style={{ color: C.textMuted }}>No data</div> :
                statusMix.map(x => <Bar key={x.st} label={x.st} value={x.c} max={statusMix[0].c} tint="#2563eb" />)}
            </Panel>
          </div>
        </div>
      ) : (
        <Panel title="Daily walk-ins across months">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold" style={{ color: C.textMuted }}>Metric:</span>
            {[{ k: 'walkins', l: 'Walk-ins' }, { k: 'conversions', l: 'Conversions' }].map(m => (
              <button key={m.k} onClick={() => setMonthlyMetric(m.k)} className="text-xs font-bold px-3 py-1.5 rounded-lg"
                style={{ background: monthlyMetric === m.k ? C.gold : 'transparent', color: monthlyMetric === m.k ? '#fff' : C.textMuted, border: monthlyMetric === m.k ? 'none' : `1px solid ${C.border}` }}>{m.l}</button>
            ))}
            <span className="text-[11px] ml-auto" style={{ color: C.textLight }}>x-axis = day of month · each line = a month (last 6)</span>
          </div>
          <MultiLineChart series={monthlySeries} />
        </Panel>
      )}
    </div>
  )
}

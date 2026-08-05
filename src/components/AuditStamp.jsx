import React, { useState, useEffect, useRef } from 'react'
import { supa } from '../lib/supabase'
import { relativeTime } from '../lib/auditHelpers'
import { getAvatarUrl } from './ProfilePopover'

// ═══════════════════════════════════════════════════════════════════════════
// <AuditStamp /> — Reusable created-by / updated-by display with timeline
// ═══════════════════════════════════════════════════════════════════════════
// Props:
//   createdBy  — { name, role?, avatarUrl?, date }
//   updatedBy  — { name, role?, avatarUrl?, date } (optional)
//   entityType — string, for fetching timeline from change_log
//   entityId   — string, for fetching timeline from change_log
//   compact    — boolean (default false) — inline single-line stamp
// ═══════════════════════════════════════════════════════════════════════════

const ROLE_LABELS = {
  founder: 'Founder', admin: 'Admin', operations_manager: 'Operations Manager',
  production_manager: 'Production Manager', stylist: 'Stylist', designer: 'Designer',
  growth_manager: 'Growth Manager', tailor_lead: 'Tailor Lead', fulfillment_ops: 'Fulfillment Ops',
  finance: 'Finance', intern: 'Intern', custom: 'Custom', staff: 'Staff',
}

const AuditStamp = ({ createdBy, updatedBy, entityType, entityId, compact = false }) => {
  const [showTimeline, setShowTimeline] = useState(false)
  const [timeline, setTimeline] = useState([])
  const [loading, setLoading] = useState(false)
  const popRef = useRef(null)

  // Close popover on outside click
  useEffect(() => {
    if (!showTimeline) return
    const handleClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setShowTimeline(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showTimeline])

  // Fetch timeline on open
  const openTimeline = async () => {
    if (!entityType || !entityId) return
    setShowTimeline(true)
    if (timeline.length > 0) return // already fetched
    setLoading(true)
    try {
      const { data } = await supa.from('change_log')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', String(entityId))
        .order('created_at', { ascending: false })
        .limit(20)
      setTimeline(data || [])
    } catch (_) {}
    finally { setLoading(false) }
  }

  const avatarImg = (url, name) => (
    <img src={url || getAvatarUrl(name || 'System')}
      className="w-5 h-5 rounded-full bg-gray-100 border border-gray-200 flex-shrink-0 object-cover inline-block" />
  )

  // ─── Compact mode ─────────────────────────────────────────────────────
  if (compact) {
    const isUpdated = updatedBy?.name && updatedBy?.date
    const who = isUpdated ? updatedBy.name : (createdBy?.name || 'System')
    const role = isUpdated ? updatedBy?.role : createdBy?.role
    const roleLabel = role ? ROLE_LABELS[role] || role : ''
    const when = isUpdated ? updatedBy.date : createdBy?.date
    const prefix = isUpdated ? 'Edited by:' : 'Created by:'
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-gray-500 relative">
        <span className="text-gray-400 font-medium">{prefix}</span>
        {avatarImg(isUpdated ? updatedBy?.avatarUrl : createdBy?.avatarUrl, who)}
        <span className="font-semibold text-gray-600">{who}</span>
        {roleLabel && <span className="text-gray-400">({roleLabel})</span>}
        <span className="text-gray-300">·</span>
        <button type="button" onClick={openTimeline} className="hover:text-gray-600 transition-colors underline decoration-dotted">
          {relativeTime(when)}
        </button>
        {showTimeline && <TimelinePopover ref={popRef} timeline={timeline} loading={loading} />}
      </div>
    )
  }

  // ─── Full mode ────────────────────────────────────────────────────────
  const createdRoleLabel = createdBy?.role ? (ROLE_LABELS[createdBy.role] || createdBy.role) : ''
  const updatedRoleLabel = updatedBy?.role ? (ROLE_LABELS[updatedBy.role] || updatedBy.role) : ''

  return (
    <div className="text-sm text-gray-500 space-y-1.5 relative">
      {/* Created line */}
      {createdBy && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-gray-400 font-medium text-xs">Created by:</span>
          {avatarImg(createdBy.avatarUrl, createdBy.name)}
          <span className="text-gray-700 font-semibold text-sm">{createdBy.name || 'System'}</span>
          {createdRoleLabel && <span className="text-gray-400 text-xs">({createdRoleLabel})</span>}
          <span className="text-gray-300">·</span>
          <span className="text-xs text-gray-400">{relativeTime(createdBy.date)}</span>
        </div>
      )}
      {/* Updated line */}
      {updatedBy && updatedBy.name && updatedBy.date && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-gray-400 font-medium text-xs">Last edited by:</span>
          {avatarImg(updatedBy.avatarUrl, updatedBy.name)}
          <span className="text-gray-700 font-semibold text-sm">{updatedBy.name}</span>
          {updatedRoleLabel && <span className="text-gray-400 text-xs">({updatedRoleLabel})</span>}
          <span className="text-gray-300">·</span>
          <button type="button" onClick={openTimeline} className="text-xs hover:text-gray-600 transition-colors underline decoration-dotted text-gray-400">
            {relativeTime(updatedBy.date)}
          </button>
        </div>
      )}
      {/* Timeline popover */}
      {showTimeline && <TimelinePopover ref={popRef} timeline={timeline} loading={loading} />}
    </div>
  )
}

// ─── Timeline Popover ──────────────────────────────────────────────────────
const TimelinePopover = React.forwardRef(({ timeline, loading }, ref) => {
  const actionLabel = (action) => {
    const map = {
      'create': 'Created',
      'update': 'Updated',
      'delete': 'Deleted',
      'approve': 'Approved',
      'confirm': 'Confirmed',
      'close': 'Closed',
      'update-status': 'Status changed',
      'update-access': 'Access updated',
      'edit': 'Edited',
      'add-line-item': 'Added line item',
      'remove-line-item': 'Removed line item',
    }
    return map[action] || action
  }

  const detailSummary = (details) => {
    if (!details) return ''
    if (typeof details === 'string') return details
    if (details.changed_fields) return 'Changed: ' + details.changed_fields.join(', ')
    if (details.from && details.to) return details.from + ' → ' + details.to
    return ''
  }

  return (
    <div ref={ref} className="absolute left-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-200 w-72 max-h-80 overflow-y-auto"
      style={{minWidth:280}}>
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Timeline</div>
      </div>
      {loading && (
        <div className="px-4 py-6 text-center text-xs text-gray-400">Loading…</div>
      )}
      {!loading && timeline.length === 0 && (
        <div className="px-4 py-6 text-center text-xs text-gray-400">No history recorded yet</div>
      )}
      {!loading && timeline.map((entry, i) => (
        <div key={i} className="px-4 py-2.5 border-b border-gray-50 last:border-b-0">
          <div className="flex items-center gap-2 mb-0.5">
            <img src={getAvatarUrl(entry.user_email || entry.user_name || 'System')}
              className="w-4 h-4 rounded-full bg-gray-100 flex-shrink-0" />
            <span className="text-xs text-gray-600 font-medium">{entry.user_name || entry.user_email || 'System'}</span>
            <span className="text-xs text-gray-300 ml-auto">{relativeTime(entry.created_at)}</span>
          </div>
          <div className="text-xs text-gray-500 pl-6">{actionLabel(entry.action)}</div>
          {detailSummary(entry.details) && (
            <div className="text-xs text-gray-400 pl-6 mt-0.5">{detailSummary(entry.details)}</div>
          )}
        </div>
      ))}
    </div>
  )
})

TimelinePopover.displayName = 'TimelinePopover'

export default AuditStamp

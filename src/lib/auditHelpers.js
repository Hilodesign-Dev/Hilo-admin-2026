// ═══════════════════════════════════════════════════════════════════════════
// AUDIT HELPERS — created_by / updated_by stamp utilities
// ═══════════════════════════════════════════════════════════════════════════
// Usage:
//   import { createdByFields, updatedByFields } from '../lib/auditHelpers'
//   const payload = { ...formData, ...createdByFields() }
//   const patch   = { ...changes, ...updatedByFields() }
// ═══════════════════════════════════════════════════════════════════════════

export const getAuditStamp = () => ({
  user_id: window._currentUserId || null,
  user_name: window._currentUserName || 'System',
  user_role: window._currentUserRole || '',
  timestamp: new Date().toISOString(),
})

/** Fields to spread into an INSERT payload */
export const createdByFields = () => {
  const s = getAuditStamp()
  return {
    created_by_user_id: s.user_id,
    created_by_name: s.user_name,
    created_by_role: s.user_role,
  }
}

/** Fields to spread into an UPDATE payload */
export const updatedByFields = () => {
  const s = getAuditStamp()
  return {
    updated_by_user_id: s.user_id,
    updated_by_name: s.user_name,
    updated_by_role: s.user_role,
    updated_at: s.timestamp,
  }
}

/** Relative time label — "just now", "2h ago", "3d ago", "Never" */
export const relativeTime = (dateStr) => {
  if (!dateStr) return 'Never'
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  if (diff < 0) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return mins + 'm ago'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs + 'h ago'
  const days = Math.floor(hrs / 24)
  if (days < 30) return days + 'd ago'
  const months = Math.floor(days / 30)
  if (months < 12) return months + 'mo ago'
  return Math.floor(months / 12) + 'y ago'
}

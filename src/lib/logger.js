// ═══════════════════════════════════════════════════════════════════════════
// ERROR LOGGER + CHANGE LOG (AUDIT TRAIL)
// ═══════════════════════════════════════════════════════════════════════════
// Error Logger: captures runtime errors, unhandled promise rejections, and
//   explicit error calls. Stored in localStorage (max 50) AND Supabase error_logs.
// Change Log: tracks user-level data changes with team member details.
//   Stored in Supabase change_log table.
// ═══════════════════════════════════════════════════════════════════════════

import { toast } from './designTokens'
import { supa } from './supabase'

// ── Error Logger ─────────────────────────────────────────────────────────
// Usage: _logError('db', 'Failed to update order', error.message)
// Usage: _logError('ui', 'Modal render failed', stackTrace)
export const _logError = (type, msg, detail = '') => {
  const email = window._currentUserEmail || 'unknown'
  const name = window._currentUserName || ''
  try {
    const existing = JSON.parse(localStorage.getItem('hl_error_log') || '[]')
    const entry = {
      ts: new Date().toISOString(),
      type,
      msg: String(msg).slice(0, 400),
      detail: String(detail).slice(0, 800),
      url: window.location.href,
      user: email,
      userName: name,
    }
    const updated = [entry, ...existing].slice(0, 50)
    localStorage.setItem('hl_error_log', JSON.stringify(updated))
  } catch (_) {}
  // Persist to Supabase (fire-and-forget)
  try {
    if (supa) {
      supa.from('error_logs').insert({
        type: String(type).slice(0, 50),
        message: String(msg).slice(0, 400),
        detail: String(detail).slice(0, 1000),
        user_email: email,
        user_name: name,
        url: String(window.location.href).slice(0, 500),
      }).then(() => {}).catch(() => {})
    }
  } catch (_) {}
}

// ── Convenience: log error AND show toast to user ────────────────────────
// Use this in catch blocks so the user always sees what went wrong.
export const logAndToast = (type, msg, error) => {
  const detail = error?.message || error?.toString() || ''
  _logError(type, msg, detail)
  toast(false, `${msg}${detail ? ': ' + detail.slice(0, 100) : ''}`)
  console.error(`[${type}] ${msg}`, error)
}

// ── Change Log (Audit Trail) ─────────────────────────────────────────────
// Usage: _logChange('approve', 'order', 'ORD-123', 'HIL019455', { from: 'pending', to: 'in-progress' })
export const _logChange = (action, entityType, entityId, entityName, details) => {
  try {
    const email = window._currentUserEmail || 'unknown'
    const name = window._currentUserName || ''
    if (supa) {
      supa.from('change_log').insert({
        user_email: email,
        user_name: name,
        action: String(action).slice(0, 50),
        entity_type: String(entityType).slice(0, 50),
        entity_id: String(entityId || '').slice(0, 100),
        entity_name: String(entityName || '').slice(0, 200),
        details: details || null
      }).then(() => {}).catch((err) => { console.warn('change_log write failed:', err) })
    }
  } catch (_) {}
}

// ── Deletion Logger (Audit Trail for Deletes) ───────────────────────────
// Usage: await _logDeletion('outsource_bill', 'HL-ST-0001', 'Bill #HL-ST-0001', fullRecordObject, 'optional reason')
export const _logDeletion = async (entityType, entityId, entityName, snapshot, reason = '') => {
  try {
    const email = window._currentUserEmail || 'unknown'
    const name = window._currentUserName || ''
    if (supa) {
      await supa.from('deletion_logs').insert({
        entity_type: String(entityType).slice(0, 50),
        entity_id: String(entityId || '').slice(0, 100),
        entity_name: String(entityName || '').slice(0, 200),
        snapshot: snapshot || {},
        reason: reason ? String(reason).slice(0, 500) : null,
        deleted_by_email: email,
        deleted_by_name: name,
      })
    }
    // Also log to change_log for unified audit
    _logChange('delete', entityType, entityId, entityName, { reason, snapshot_keys: snapshot ? Object.keys(snapshot) : [] })
  } catch (err) {
    console.warn('deletion_logs write failed:', err)
  }
}

// ── Global error handlers ────────────────────────────────────────────────
// Catches uncaught errors and unhandled promise rejections globally.
if (typeof window !== 'undefined') {
  window._logChange = _logChange
  window._logError = _logError
  window._logAndToast = logAndToast
  window._logDeletion = _logDeletion

  window.addEventListener('error', (e) => {
    _logError('uncaught', e.message || 'Unknown error', e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : '')
  })

  window.addEventListener('unhandledrejection', (e) => {
    const msg = e.reason?.message || e.reason?.toString() || 'Unhandled promise rejection'
    _logError('unhandled-promise', msg, e.reason?.stack || '')
  })
}

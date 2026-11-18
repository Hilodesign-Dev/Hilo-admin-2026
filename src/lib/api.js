/**
 * Thin HTTP client for Hilo Customer API (backend).
 * Staff CRUD still uses Supabase; basic public/ops reads go through this URL.
 */

import { supa } from './supabase'

const DEFAULT_API_URL = 'https://backenddev.hilodesign.co/api/v1'

export const API_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, { status, errors } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

async function request(path, options = {}) {
  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  }

  const res = await fetch(url, { ...options, headers })
  let json = null
  try {
    json = await res.json()
  } catch {
    // non-JSON body
  }

  if (!res.ok || json?.success === false) {
    let msg = json?.message || res.statusText || 'Request failed'
    if (json?.errors && Array.isArray(json.errors) && json.errors.length > 0) {
      const details = json.errors
        .map((e) => e.error || e.message || (e.path ? `${Array.isArray(e.path) ? e.path.join('.') : e.path}: invalid` : ''))
        .filter(Boolean)
        .join('; ')
      if (details && !msg.includes(details)) {
        msg = `${msg}: ${details}`
      }
    }
    throw new ApiError(msg, {
      status: res.status,
      errors: json?.errors,
    })
  }

  return json?.data !== undefined ? json.data : json
}

/** Normalize backend camelCase sync runs to the snake_case shape Sync Center UI expects. */
export function normalizeSyncRun(run) {
  if (!run) return null
  return {
    id: run.id,
    sync_type: run.sync_type ?? run.syncType,
    status: run.status,
    source: run.source,
    started_at: run.started_at ?? run.startedAt,
    finished_at: run.finished_at ?? run.finishedAt ?? null,
    records_upserted: run.records_upserted ?? run.recordsUpserted ?? 0,
    records_failed: run.records_failed ?? run.recordsFailed ?? 0,
    lag_seconds: run.lag_seconds ?? run.lagSeconds ?? null,
    message: run.message ?? null,
    error: run.error ?? null,
  }
}

/** Request as the signed-in staff member (Supabase session JWT). */
async function staffRequest(path, { method = 'GET', body } = {}) {
  const { data } = await supa.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new ApiError('Not signed in', { status: 401 })
  return request(path, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { Authorization: `Bearer ${token}` },
  })
}

export const api = {
  health: () => request('/health'),

  syncStatus: async () => {
    const data = await request('/sync/status')
    const latest = data?.latest || {}
    return {
      ...data,
      latest: {
        catalogue: normalizeSyncRun(latest.catalogue),
        orders: normalizeSyncRun(latest.orders),
        customers: normalizeSyncRun(latest.customers),
      },
      recent: (data?.recent || []).map(normalizeSyncRun),
    }
  },

  catalogueProducts: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') q.set(k, String(v))
    })
    const qs = q.toString()
    return request(`/catalogue/products${qs ? `?${qs}` : ''}`)
  },

  cmsHome: () => request('/cms/home').catch(() => request('/cms')),

  /** Every app collection, flat, with live product counts. */
  appCollections: () => request('/catalogue/collections?all=true&limit=100'),
  /** Products that unsaved collection rules would select. */
  previewCollectionRules: (rules, parentHandle, limit = 24) =>
    staffRequest('/catalogue/collection-rules/preview', { method: 'POST', body: { rules, parentHandle: parentHandle || null, limit } }),
  /** Shopify collection handles and product types seen on synced products. */
  collectionRuleOptions: () => staffRequest('/catalogue/collection-rules/options'),
  /** Make the Customer API reload collections now instead of within a minute. */
  refreshCollections: () => staffRequest('/catalogue/collection-rules/refresh', { method: 'POST' }),

  // ── Appointments (staff) ──
  appointmentsMeta: () => staffRequest('/staff/appointments/meta'),
  appointmentsSummary: () => staffRequest('/staff/appointments/summary'),
  appointmentsList: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '' && v !== 'all') q.set(k, String(v))
    })
    return staffRequest(`/staff/appointments?${q.toString()}`)
  },
  appointment: (id) => staffRequest(`/staff/appointments/${encodeURIComponent(id)}`),
  /** action: confirm | decline | complete | no-show | cancel | reopen */
  appointmentAction: (id, action, body = {}) =>
    staffRequest(`/staff/appointments/${encodeURIComponent(id)}/${action}`, { method: 'POST', body }),
  appointmentReschedule: (id, body) =>
    staffRequest(`/staff/appointments/${encodeURIComponent(id)}/reschedule`, { method: 'POST', body }),
  appointmentUpdate: (id, body) =>
    staffRequest(`/staff/appointments/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
}

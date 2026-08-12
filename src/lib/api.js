/**
 * Thin HTTP client for Hilo Customer API (backend).
 * Staff CRUD still uses Supabase; basic public/ops reads go through this URL.
 */

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
    throw new ApiError(json?.message || res.statusText || 'Request failed', {
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
}

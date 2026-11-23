import { API_URL, ApiError } from './api'
import { supa } from './supabase'

async function staffToken() {
  const { data } = await supa.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new ApiError('Not signed in', { status: 401 })
  return token
}

async function parseJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

async function staffRequest(path, options = {}) {
  const { signal, headers: extraHeaders, ...fetchRest } = options
  const token = await staffToken()
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
  }
  if (fetchRest.body && !(fetchRest.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, { ...fetchRest, headers, signal })
  const json = await parseJson(res)

  if (!res.ok || json?.success === false) {
    throw new ApiError(json?.message || res.statusText || 'Request failed', {
      status: res.status,
      errors: json?.errors,
    })
  }

  return json?.data !== undefined ? json.data : json
}

export function createStaffApi(prefix) {
  return {
    me: () => staffRequest(`${prefix}/me`),

    inbox: () => staffRequest(`${prefix}/inbox`),

    sessions: (params = {}) => {
      const q = new URLSearchParams()
      if (params.limit != null) q.set('limit', String(params.limit))
      if (params.since) q.set('since', params.since)
      const qs = q.toString()
      return staffRequest(`${prefix}/sessions${qs ? `?${qs}` : ''}`, { signal: params.signal })
    },

    session: (id, params = {}) => {
      const q = new URLSearchParams()
      if (params.since) q.set('since', params.since)
      const qs = q.toString()
      return staffRequest(`${prefix}/sessions/${id}${qs ? `?${qs}` : ''}`, { signal: params.signal })
    },

    accept: (id) => staffRequest(`${prefix}/sessions/${id}/accept`, { method: 'POST', body: '{}' }),

    handoff: (id) => staffRequest(`${prefix}/sessions/${id}/handoff`, { method: 'POST', body: '{}' }),

    takeover: (id) => staffRequest(`${prefix}/sessions/${id}/takeover`, { method: 'POST', body: '{}' }),

    sendMessage: (id, payload) =>
      staffRequest(`${prefix}/sessions/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    suggest: (query, limit = 5) =>
      staffRequest(`${prefix}/suggest`, {
        method: 'POST',
        body: JSON.stringify({ query, limit }),
      }),

    getSettings: () => staffRequest(`${prefix}/settings`),
    patchSettings: (payload) =>
      staffRequest(`${prefix}/settings`, { method: 'PATCH', body: JSON.stringify(payload) }),
    placeOrder: (id, payload) =>
      staffRequest(`${prefix}/sessions/${id}/orders`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    upload: async (file, directory = 'stylist-chat') => {
      const token = await staffToken()
      const form = new FormData()
      form.append('file', file)
      form.append('directory', directory)
      const res = await fetch(`${API_URL}${prefix}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        body: form,
      })
      const json = await parseJson(res)
      if (!res.ok || json?.success === false) {
        throw new ApiError(json?.message || res.statusText || 'Upload failed', { status: res.status })
      }
      const data = json?.data !== undefined ? json.data : json
      if (Array.isArray(data) && data[0]) return data[0]
      if (typeof data === 'string') return data
      if (data?.url) return data.url
      throw new ApiError('Upload returned no URL', { status: 500 })
    },
  }
}

/** Flutter app stylist handover — channel = app */
export const aiStaffApi = createStaffApi('/ai/staff')

/** WhatsApp Cloud API handover — channel = whatsapp */
export const waStaffApi = createStaffApi('/wa/staff')


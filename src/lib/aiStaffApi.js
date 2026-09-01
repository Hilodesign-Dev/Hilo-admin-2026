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
  const token = await staffToken()
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...options.headers,
  }
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, { ...options, headers })
  const json = await parseJson(res)

  if (!res.ok || json?.success === false) {
    throw new ApiError(json?.message || res.statusText || 'Request failed', {
      status: res.status,
      errors: json?.errors,
    })
  }

  return json?.data !== undefined ? json.data : json
}

export const aiStaffApi = {
  me: () => staffRequest('/ai/staff/me'),

  inbox: () => staffRequest('/ai/staff/inbox'),

  session: (id) => staffRequest(`/ai/staff/sessions/${id}`),

  accept: (id) => staffRequest(`/ai/staff/sessions/${id}/accept`, { method: 'POST', body: '{}' }),

  sendMessage: (id, payload) =>
    staffRequest(`/ai/staff/sessions/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  suggest: (query, limit = 5) =>
    staffRequest('/ai/staff/suggest', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    }),

  upload: async (file, directory = 'stylist-chat') => {
    const token = await staffToken()
    const form = new FormData()
    form.append('file', file)
    form.append('directory', directory)
    const res = await fetch(`${API_URL}/ai/staff/upload`, {
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

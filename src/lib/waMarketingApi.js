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

async function marketingRequest(path, options = {}) {
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

  const url = `${API_URL}/wa/marketing${path.startsWith('/') ? path : `/${path}`}`
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

export const waMarketingApi = {
  // Recipient discovery & validation
  queryRecipients: (params = {}) => {
    const q = new URLSearchParams()
    if (params.source) q.set('source', params.source)
    if (params.search) q.set('search', params.search)
    if (params.page != null) q.set('page', String(params.page))
    if (params.limit != null) q.set('limit', String(params.limit))
    if (params.fetchAll) q.set('fetchAll', 'true')
    const qs = q.toString()
    return marketingRequest(`/recipients/query${qs ? `?${qs}` : ''}`)
  },

  validateCustomNumbers: (rawInput) =>
    marketingRequest('/recipients/validate-custom', {
      method: 'POST',
      body: JSON.stringify({ rawInput }),
    }),

  // Templates & overview stats
  getTemplates: () => marketingRequest('/templates'),
  getOverview: () => marketingRequest('/stats/overview'),

  // Campaigns
  listCampaigns: (params = {}) => {
    const q = new URLSearchParams()
    if (params.limit != null) q.set('limit', String(params.limit))
    if (params.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    return marketingRequest(`/campaigns${qs ? `?${qs}` : ''}`)
  },

  getCampaign: (id) => marketingRequest(`/campaigns/${id}`),

  createCampaign: (payload) =>
    marketingRequest('/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCampaign: (id, payload) =>
    marketingRequest(`/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  sendCampaign: (id) =>
    marketingRequest(`/campaigns/${id}/send`, {
      method: 'POST',
    }),

  cancelCampaign: (id) =>
    marketingRequest(`/campaigns/${id}/cancel`, {
      method: 'POST',
    }),

  sendTestMessage: (payload) =>
    marketingRequest('/test-send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Upload creative banner image
  uploadBanner: async (file) => {
    const token = await staffToken()
    const form = new FormData()
    form.append('file', file)
    form.append('directory', 'wa-marketing')
    const res = await fetch(`${API_URL}/wa/staff/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      body: form,
    })
    const json = await parseJson(res)
    if (!res.ok || json?.success === false) {
      throw new ApiError(json?.message || 'Banner upload failed', { status: res.status })
    }
    const urls = Array.isArray(json?.data) ? json.data : []
    return urls[0] || null
  },
}

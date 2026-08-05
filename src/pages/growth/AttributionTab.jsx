import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { fmt, n } from '../../lib/helpers'
import Icon from '../../components/Icon'

/*
 * AttributionTab — editable inline table for order attribution.
 * Each order shows: Order #, Customer, Date, Revenue, Lead Source, Stylist,
 * Occasion, Channel, Country, City, Attribution Status, Linked Lead.
 *
 * Accepts `orders` from parent (GrowthView) so it shares the same date range.
 */

const AttributionTab = ({ orders: parentOrders, user = null, dateFrom = '', dateTo = '', setDateFrom = () => {}, setDateTo = () => {} }) => {
  // ── Master lists from DB ──
  const [leadSources, setLeadSources] = useState([])
  const [occasions, setOccasions] = useState([])
  const [teamMembers, setTeamMembers] = useState([])    // all team members
  const [stylists, setStylists] = useState([])          // filtered: only stylist/store manager roles
  const [countries, setCountries] = useState([])         // from lead_master_lists
  const [locations, setLocations] = useState([])         // from lead_master_lists (with parent_value)

  // ── Local order state (with attribution fields) ──
  const [orders, setOrders] = useState([])
  const [saving, setSaving] = useState(new Set())
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState({})

  // ── Lead linking ──
  const [leadSearch, setLeadSearch] = useState('')
  const [leadResults, setLeadResults] = useState([])
  const [searchingLeads, setSearchingLeads] = useState(false)
  const [orderLeadMap, setOrderLeadMap] = useState({})  // orderId → { lead_id, client_name }

  // ── Filters ──
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [stylistFilter, setStylistFilter] = useState('all')
  const [search, setSearch] = useState('')

  // ── Pagination ──
  const PAGE_SIZE = 25
  const [page, setPage] = useState(1)

  // Stylist designation filter
  const STYLIST_DESIGNATIONS = ['Store Stylist', 'Online Stylist', 'Assistant Store Manager']

  // Load master lists once
  useEffect(() => {
    const loadMasters = async () => {
      const [srcRes, occRes, tmRes, countryRes, locRes] = await Promise.all([
        supa.from('lead_master_lists').select('value').eq('category', 'lead_source').order('value'),
        supa.from('lead_master_lists').select('value').eq('category', 'occasion').order('value'),
        supa.from('team_members').select('id, name, designation').order('name'),
        supa.from('lead_master_lists').select('value').eq('category', 'country').order('sort_order, value'),
        supa.from('lead_master_lists').select('value, parent_value').eq('category', 'location').order('sort_order, value'),
      ])
      if (srcRes.data) setLeadSources(srcRes.data.map(r => r.value))
      if (occRes.data) setOccasions(occRes.data.map(r => r.value))
      if (tmRes.data) {
        setTeamMembers(tmRes.data)
        setStylists(tmRes.data.filter(t =>
          STYLIST_DESIGNATIONS.some(d => (t.designation || '').toLowerCase() === d.toLowerCase())
        ))
      }
      if (countryRes.data) setCountries(countryRes.data.map(r => r.value))
      if (locRes.data) setLocations(locRes.data)
    }
    loadMasters()
  }, [])

  // Sync local orders when parent orders change
  useEffect(() => {
    setOrders(parentOrders)
    setPage(1)
  }, [parentOrders])

  // Load lead_orders links for visible orders
  useEffect(() => {
    if (!parentOrders.length) return
    const loadLeadLinks = async () => {
      const orderIds = parentOrders.map(o => o.id).filter(Boolean)
      if (!orderIds.length) return
      // Batch in chunks of 100 to avoid URL length limits
      const map = {}
      for (let i = 0; i < orderIds.length; i += 100) {
        const batch = orderIds.slice(i, i + 100)
        const { data } = await supa
          .from('lead_orders')
          .select('id, lead_id, order_id, leads(id, client_name, phone)')
          .in('order_id', batch)
        if (data) {
          data.forEach(lo => {
            map[lo.order_id] = {
              junction_id: lo.id,
              lead_id: lo.lead_id,
              client_name: lo.leads?.client_name || '',
              phone: lo.leads?.phone || '',
            }
          })
        }
      }
      setOrderLeadMap(map)
    }
    loadLeadLinks()
  }, [parentOrders])

  // ── Filtering ──
  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (o.channel === 'Marketplace') return false
      if (statusFilter !== 'all' && (o.attribution_status || 'unattributed') !== statusFilter) return false
      if (sourceFilter !== 'all' && o.lead_source !== sourceFilter) return false
      if (stylistFilter !== 'all' && o.stylist !== stylistFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (o.order_number || '').toLowerCase().includes(q) ||
               (o.customer_name || '').toLowerCase().includes(q)
      }
      return true
    })
  }, [orders, statusFilter, sourceFilter, stylistFilter, search])

  // ── Stats ──
  const stats = useMemo(() => {
    const total = orders.length
    const attributed = orders.filter(o => o.attribution_status === 'linked' || o.attribution_status === 'manual').length
    const linked = orders.filter(o => o.attribution_status === 'linked').length
    const manual = orders.filter(o => o.attribution_status === 'manual').length
    const unattributed = orders.filter(o => !o.attribution_status || o.attribution_status === 'unattributed').length
    const attributedRev = orders.filter(o => o.attribution_status === 'linked' || o.attribution_status === 'manual')
      .reduce((s, o) => s + (o.total_price || 0), 0)
    const totalRev = orders.reduce((s, o) => s + (o.total_price || 0), 0)
    return { total, attributed, linked, manual, unattributed, attributedRev, totalRev }
  }, [orders])

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [statusFilter, sourceFilter, stylistFilter, search])

  // ── Editing ──
  // Locations filtered by selected country in edit draft
  const filteredLocations = useMemo(() => {
    if (!editDraft.country) return locations.map(l => l.value)
    return locations.filter(l => l.parent_value === editDraft.country).map(l => l.value)
  }, [editDraft.country, locations])

  const startEdit = (order) => {
    const existing = orderLeadMap[order.id]
    setEditingId(order.id)
    setEditDraft({
      lead_source: order.lead_source || '',
      stylist: order.stylist || '',
      occasion: order.occasion || '',
      channel_override: order.channel_override || order.channel || '',
      country: order.country || '',
      city: order.city || '',
      lead_id: existing?.lead_id || null,
      lead_name: existing?.client_name || '',
    })
    setLeadSearch('')
    setLeadResults([])
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft({})
    setLeadSearch('')
    setLeadResults([])
  }

  // Search leads for linking
  const searchLeads = useCallback(async (query) => {
    if (!query || query.length < 2) { setLeadResults([]); return }
    setSearchingLeads(true)
    const q = query.trim()
    // Search by client name or phone
    const { data } = await supa
      .from('leads')
      .select('id, client_name, phone, lead_source, status')
      .or(`client_name.ilike.%${q}%,phone.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(8)
    setLeadResults(data || [])
    setSearchingLeads(false)
  }, [])

  // Debounced lead search
  useEffect(() => {
    if (!leadSearch) { setLeadResults([]); return }
    const t = setTimeout(() => searchLeads(leadSearch), 300)
    return () => clearTimeout(t)
  }, [leadSearch, searchLeads])

  const saveEdit = async (orderId) => {
    setSaving(prev => new Set([...prev, orderId]))
    // Normalise the channel pick to the constraint-valid set
    const _ch = String(editDraft.channel_override || '').trim()
    const channelCanonical = /^in[- ]?store|^store$/i.test(_ch) ? 'In-store'
                            : /^online assist$/i.test(_ch) ? 'Online Assist'
                            : /^online store$|^online$/i.test(_ch) ? 'Online'
                            : /^marketplace$/i.test(_ch) ? 'Marketplace'
                            : null
    const updates = {
      lead_source: editDraft.lead_source || null,
      stylist: editDraft.stylist || null,
      occasion: editDraft.occasion || null,
      country: editDraft.country || null,
      city: editDraft.city || null,
      attribution_status: 'manual',
      // Write to the REAL channel column (what all dashboards read), plus
      // mirror to channel_override for back-compat with older queries.
      ...(channelCanonical ? { channel: channelCanonical, channel_override: channelCanonical } : {}),
    }
    const { error } = await supa.from('shopify_orders').update(updates).eq('id', orderId)
    if (error) {
      console.error('saveEdit failed:', error)
      try { (await import('../../lib/designTokens')).toast(false, 'Save failed: ' + error.message) } catch (_) {}
      setSaving(prev => { const n = new Set(prev); n.delete(orderId); return n })
      return
    }
    if (!error) {
      // Handle lead linking via lead_orders junction table
      const existingLink = orderLeadMap[orderId]
      if (editDraft.lead_id && !existingLink) {
        // Create new link
        const { data } = await supa.from('lead_orders').insert([{
          lead_id: editDraft.lead_id,
          order_id: orderId,
          linked_by: 'attribution',
        }]).select('id')
        if (data?.[0]) {
          setOrderLeadMap(prev => ({...prev, [orderId]: {
            junction_id: data[0].id,
            lead_id: editDraft.lead_id,
            client_name: editDraft.lead_name || '',
          }}))
        }
      } else if (editDraft.lead_id && existingLink && existingLink.lead_id !== editDraft.lead_id) {
        // Update existing link to different lead
        await supa.from('lead_orders').update({ lead_id: editDraft.lead_id }).eq('id', existingLink.junction_id)
        setOrderLeadMap(prev => ({...prev, [orderId]: {
          ...prev[orderId],
          lead_id: editDraft.lead_id,
          client_name: editDraft.lead_name || '',
        }}))
      } else if (!editDraft.lead_id && existingLink) {
        // Remove link
        await supa.from('lead_orders').delete().eq('id', existingLink.junction_id)
        setOrderLeadMap(prev => { const m = {...prev}; delete m[orderId]; return m })
      }

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o))
      setEditingId(null)
      setEditDraft({})
      setLeadSearch('')
      setLeadResults([])
    }
    setSaving(prev => { const s = new Set(prev); s.delete(orderId); return s })
  }

  const statusBadge = (status) => {
    if (status === 'linked') return { bg: '#ecfdf5', color: '#059669', label: 'CRM Linked' }
    if (status === 'manual') return { bg: '#eff6ff', color: '#2563eb', label: 'Manual' }
    return { bg: '#fef3c7', color: '#d97706', label: 'Unattributed' }
  }

  // ── Meta CAPI status pill ──
  // Prefers the real push outcome (meta_capi_status). Until the push pipeline
  // runs, it derives an eligibility state from the order fields the PRD gates on
  // (channel + contact + value + 62-day window). Eligible auto-upgrades to
  // Pushed/Failed once the edge function writes meta_capi_status.
  const CAPI_ELIGIBLE_CHANNELS = ['In-store', 'Online Assist']
  const CAPI_SKIP_COPY = {
    channel_Online:      'Online order — Facebook pixel already captured this',
    channel_Marketplace: 'Marketplace order — no Meta attribution path',
    channel_null:        'Channel not set — fix in order edit',
    no_contact:          'No email or phone captured — add contact to enable push',
    too_old:             'Order older than 62 days — Meta won’t accept',
    zero_value:          'Zero or refunded value — no conversion to push',
  }
  const capiBadge = (order) => {
    const st = order.meta_capi_status
    // 1. Real push outcomes win
    if (st === 'success') {
      const when = order.meta_capi_sent_at
        ? new Date(order.meta_capi_sent_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : null
      return { bg: '#ecfdf5', color: '#059669', label: 'Pushed', title: when ? `Pushed to Meta CAPI · ${when}` : 'Pushed to Meta CAPI' }
    }
    if (st === 'failed') {
      const a = order.meta_capi_attempts || 0
      return { bg: '#fef2f2', color: '#dc2626', label: 'Failed', title: `Meta rejected the push${a ? ` (${a} attempt${a > 1 ? 's' : ''})` : ''} — needs retry` }
    }
    if (st === 'skipped') {
      const reason = order.meta_capi_skip_reason || ''
      if (reason === 'no_contact' || reason === 'no_valid_match_key')
        return { bg: '#fff7ed', color: '#ea580c', label: 'No contact', title: 'No email or phone captured (order or customer) — add contact to enable push' }
      if (reason.startsWith('channel_Online'))
        return { bg: '#f1f5f9', color: '#64748b', label: 'Pixel-covered', title: 'Online order — Facebook pixel already captured this' }
      const copy = CAPI_SKIP_COPY[reason] || (reason ? reason.replace(/_/g, ' ') : 'Not applicable')
      return { bg: '#f3f4f6', color: '#9ca3af', label: 'Not applicable', title: copy }
    }
    // 2. No push yet → derive from the eligibility gates
    const ch = order.channel
    if (ch === 'Online')   return { bg: '#f1f5f9', color: '#64748b', label: 'Pixel-covered', title: 'Online order — Facebook pixel already captured this' }
    if (!CAPI_ELIGIBLE_CHANNELS.includes(ch))
      return { bg: '#f3f4f6', color: '#9ca3af', label: 'N/A', title: ch ? `${ch} — no Meta attribution path` : 'Channel not set — fix in order edit' }
    if (!(order.customer_email || order.delivery_phone))
      return { bg: '#fff7ed', color: '#ea580c', label: 'No contact', title: 'No email or phone captured — add contact to enable push' }
    if (Number(order.total_price || 0) <= 0)
      return { bg: '#f3f4f6', color: '#9ca3af', label: 'Zero value', title: 'Zero or refunded value — no conversion to push' }
    if ((Date.now() - new Date(order.created_at).getTime()) / 86400000 > 62)
      return { bg: '#f3f4f6', color: '#9ca3af', label: 'Too old', title: 'Order older than 62 days — Meta won’t accept' }
    return { bg: '#fefce8', color: '#ca8a04', label: 'Eligible', title: 'Eligible — will push to Meta CAPI on next run' }
  }

  const stylistName = (id) => {
    if (!id) return '—'
    const tm = teamMembers.find(t => String(t.id) === String(id))
    return tm ? tm.name : id
  }

  const meName = user?.name || user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : '')
  const meEmail = (user?.email || '').toLowerCase()
  const teamMatch = (teamMembers || []).find(t => (t.email || '').toLowerCase() === meEmail)
  const myDisplayName = teamMatch?.name || meName || ''
  const myPending = (orders || []).filter(o => {
    if (o.channel === 'Marketplace') return false
    if (o.attribution_status === 'manual' || o.attribution_status === 'linked') return false
    if (!myDisplayName) return false
    return (o.stylist || '').toLowerCase() === myDisplayName.toLowerCase()
  })
  const myPendingCount = myPending.length

  return (
    <div className="space-y-4">
      {/* ── Personal pending banner ── */}
      {myDisplayName && myPendingCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <span className="text-base">📌</span>
          <span>
            <strong>{myPendingCount}</strong> order{myPendingCount > 1 ? 's' : ''} pending your attribution
            <button onClick={() => setStylistFilter(teamMatch?.id ? String(teamMatch.id) : 'all')}
              className="ml-2 underline font-medium text-amber-900 hover:text-amber-700">
              show only mine
            </button>
          </span>
        </div>
      )}

      {/* ── Single combined filter row: date range + search + filters ── */}
      <div className="flex flex-wrap gap-2 items-center bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        <span className="text-gray-400 text-xs">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search order # or customer…"
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
          <option value="all">All Status</option>
          <option value="unattributed">Unattributed</option>
          <option value="manual">Manual</option>
          <option value="linked">CRM Linked</option>
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
          <option value="all">All Sources</option>
          {leadSources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={stylistFilter} onChange={e => setStylistFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
          <option value="all">All Stylists</option>
          {stylists.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} order{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wide">Order</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wide">Customer</th>
                <th className="px-3 py-2.5 text-right text-gray-500 font-semibold uppercase tracking-wide">Revenue</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wide">Source</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wide">Stylist</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wide">Occasion</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wide">Channel</th>
                <th className="px-3 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wide">Location</th>
                <th className="px-3 py-2.5 text-center text-gray-500 font-semibold uppercase tracking-wide">Status</th>
                <th className="px-3 py-2.5 text-center text-gray-500 font-semibold uppercase tracking-wide">CAPI</th>
                <th className="px-3 py-2.5 text-center text-gray-500 font-semibold uppercase tracking-wide">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paged.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-10 text-gray-400 text-sm">No orders match filters</td></tr>
              ) : paged.map(order => {
                const isEditing = editingId === order.id
                const isSaving = saving.has(order.id)
                const badge = statusBadge(order.attribution_status || 'unattributed')
                const cb = capiBadge(order)

                if (isEditing) {
                  return (
                    <tr key={order.id} className="bg-amber-50/30">
                      <td className="px-3 py-2">
                        <div className="font-bold text-gray-800">{order.order_number}</div>
                        <div className="text-gray-400">{new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-700 font-medium">{order.customer_name || 'Guest'}</td>
                      <td className="px-3 py-2 text-right font-bold text-gray-800">{fmt((order.total_price || 0).toFixed(0))}</td>
                      <td className="px-3 py-1">
                        <select value={editDraft.lead_source} onChange={e => setEditDraft(d => ({...d, lead_source: e.target.value}))}
                          className="border border-gray-200 rounded px-2 py-1 text-xs w-full min-w-[120px]">
                          <option value="">— Select —</option>
                          {leadSources.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1">
                        <select value={editDraft.stylist} onChange={e => setEditDraft(d => ({...d, stylist: e.target.value}))}
                          className="border border-gray-200 rounded px-2 py-1 text-xs w-full min-w-[100px]">
                          <option value="">— Select —</option>
                          {stylists.map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1">
                        <select value={editDraft.occasion} onChange={e => setEditDraft(d => ({...d, occasion: e.target.value}))}
                          className="border border-gray-200 rounded px-2 py-1 text-xs w-full min-w-[110px]">
                          <option value="">— Select —</option>
                          {occasions.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1">
                        <select value={editDraft.channel_override} onChange={e => setEditDraft(d => ({...d, channel_override: e.target.value}))}
                          className="border border-gray-200 rounded px-2 py-1 text-xs w-full min-w-[110px]">
                          <option value="">—</option>
                          <option value="In-store">In-store</option>
                          <option value="Online">Online</option>
                          <option value="Online Assist">Online Assist</option>
                          <option value="Marketplace">Marketplace</option>
                        </select>
                      </td>
                      <td className="px-3 py-1">
                        <div className="flex flex-col gap-1">
                          <select value={editDraft.country} onChange={e => setEditDraft(d => ({...d, country: e.target.value, city: ''}))}
                            className="border border-gray-200 rounded px-2 py-1 text-xs w-full min-w-[90px]">
                            <option value="">Country</option>
                            {countries.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <select value={editDraft.city} onChange={e => setEditDraft(d => ({...d, city: e.target.value}))}
                            className="border border-gray-200 rounded px-2 py-1 text-xs w-full min-w-[90px]">
                            <option value="">City</option>
                            {filteredLocations.map(l => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-1 text-center">
                        <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full" style={{background: badge.bg, color: badge.color}}>
                          {badge.label}
                        </span>
                        {/* Lead linking */}
                        <div className="mt-1 relative">
                          {editDraft.lead_id ? (
                            <div className="flex items-center gap-1 justify-center">
                              <span className="text-xs text-green-600 font-medium" title={editDraft.lead_name}>
                                🔗 {editDraft.lead_name || 'Linked'}
                              </span>
                              <button onClick={() => setEditDraft(d => ({...d, lead_id: null, lead_name: ''}))}
                                className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                            </div>
                          ) : (
                            <>
                              <input value={leadSearch} onChange={e => setLeadSearch(e.target.value)}
                                placeholder="Link lead…"
                                className="border border-gray-200 rounded px-2 py-1 text-xs w-full min-w-[100px]" />
                              {leadResults.length > 0 && (
                                <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                  {leadResults.map(lead => (
                                    <button key={lead.id}
                                      onClick={() => {
                                        setEditDraft(d => ({...d, lead_id: lead.id, lead_name: lead.client_name}))
                                        setLeadSearch('')
                                        setLeadResults([])
                                      }}
                                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-amber-50 border-b border-gray-50 last:border-0">
                                      <div className="font-medium text-gray-700">{lead.client_name}</div>
                                      <div className="text-gray-400">{lead.phone} · {lead.status}</div>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {searchingLeads && <div className="text-xs text-gray-400 mt-0.5">Searching…</div>}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full" style={{background: cb.bg, color: cb.color}} title={cb.title}>
                          {cb.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => saveEdit(order.id)} disabled={isSaving}
                            className="text-green-600 hover:text-green-800 font-bold text-sm disabled:opacity-50">✓</button>
                          <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={order.id} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-gray-800">{order.order_number}</div>
                      <div className="text-gray-400">{new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 font-medium max-w-[120px] truncate">{order.customer_name || 'Guest'}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-gray-800">{fmt((order.total_price || 0).toFixed(0))}</td>
                    <td className="px-3 py-2.5">
                      {order.lead_source ? (
                        <span className="text-gray-700">{order.lead_source}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">{stylistName(order.stylist)}</td>
                    <td className="px-3 py-2.5 text-gray-600">{order.occasion || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      {order.channel ? (
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                          order.channel === 'In-store'      ? 'bg-purple-50 text-purple-700' :
                          order.channel === 'Online Assist' ? 'bg-amber-50 text-amber-700'   :
                          order.channel === 'Marketplace'   ? 'bg-orange-50 text-orange-700' :
                          'bg-sky-50 text-sky-700'
                        }`}>{order.channel}{order.channel === 'Marketplace' && order.marketplace_name ? ` · ${order.marketplace_name}` : ''}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {order.country || order.city ? (
                        <span>{order.city || ''}{order.city && order.country ? ', ' : ''}{order.country || ''}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full" style={{background: badge.bg, color: badge.color}}>
                        {badge.label}
                      </span>
                      {orderLeadMap[order.id] && (
                        <div className="text-xs text-green-600 mt-0.5 font-medium" title={orderLeadMap[order.id].client_name}>
                          🔗 {orderLeadMap[order.id].client_name || 'Lead linked'}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full" style={{background: cb.bg, color: cb.color}} title={cb.title}>
                        {cb.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {order.channel === 'Online' ? (
                        <span className="text-[10px] text-gray-400" title="Online attribution is auto-fetched from Shopify (coming soon)">auto</span>
                      ) : <button onClick={() => startEdit(order)}
                        className="text-gray-400 hover:text-amber-600 p-1 rounded transition-colors" title="Edit attribution">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                        </svg>
                      </button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50 text-xs font-medium">
              ← Prev
            </button>
            <span className="text-xs text-gray-500 font-medium">
              {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50 text-xs font-medium">
              Next →
            </button>
          </div>
        )}
      </div>

    </div>
  )
}

export default AttributionTab

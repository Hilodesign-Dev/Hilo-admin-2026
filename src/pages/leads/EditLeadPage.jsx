/* ═══════════════════════════════════════════════════════════════════════════
   EDIT LEAD PAGE — v3: DB-driven dropdowns, time picker, stylist field
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react'
import { C, toast, fmtCurrency } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { Field, Input, Select, Textarea, Btn, Badge } from './ui'
import {
  ALL_STATUSES, YET_TO_QUALIFY_STATUSES, QUALIFIED_STATUSES,
  LEAD_QUALITIES, INTERACTION_TYPES, LOST_REASONS,
  PHASE_COLORS, QUALITY_COLORS, AGE_GROUPS, VISITED_NUMS,
  getPhase, getSubPhase, isTerminalStatus
} from './constants'
import { useLeadMasterLists } from './useLeadMasterLists'
import { PhoneInput } from './PhoneInput'
import { filterStylists } from '../../lib/helpers'
import { leadCapiBadge } from './leadCapi'


// Format HH:mm to h:mm AM/PM IST
const formatTimeIST = (time24) => {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm} IST`
}

/* Resolves a legacy `leads.order_id` (text — Shopify numeric ID or POS UUID)
   into the real shopify_orders row and renders it the same way junction-linked
   orders are rendered, so the user never sees an unresolved UUID. */
function LegacyLinkedOrderRow({ orderRef, fallbackAmount, fmtCurrency }) {
  const [order, setOrder] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!orderRef) { setLoading(false); return }
      // Try by primary key (UUID or numeric Shopify ID — both stored as text in id)
      let { data } = await supa.from('shopify_orders')
        .select('id, order_number, customer_name, total_price, order_status')
        .eq('id', String(orderRef))
        .maybeSingle()
      // Fallback: try by order_number string match
      if (!data) {
        const r2 = await supa.from('shopify_orders')
          .select('id, order_number, customer_name, total_price, order_status')
          .eq('order_number', String(orderRef))
          .maybeSingle()
        data = r2.data || null
      }
      if (!cancelled) { setOrder(data); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [orderRef])

  return (
    <div className="p-4 rounded-lg flex items-center justify-between" style={{ background: 'var(--bg, #f9fafb)', border: '1px solid #e5e7eb' }}>
      <div>
        <div className="text-sm font-bold" style={{ color: '#1b1c1a' }}>
          {loading ? 'Loading…' : (order?.order_number || orderRef)}
        </div>
        <div className="text-xs" style={{ color: '#6b7280' }}>
          {order ? `${order.customer_name || ''}${order.order_status ? ' — ' + order.order_status : ''}` : 'Unresolved order reference'}
        </div>
      </div>
      <div className="text-sm font-bold" style={{ color: '#16a34a' }}>
        {order?.total_price ? fmtCurrency(Number(order.total_price)) : (fallbackAmount ? fmtCurrency(Number(fallbackAmount)) : '—')}
      </div>
    </div>
  )
}

export const EditLeadPage = ({ lead, onClose, onLeadUpdated, teamMembers = [] }) => {
  const lists = useLeadMasterLists()
  const [loading, setLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [interactions, setInteractions] = useState([])
  const [newNote, setNewNote] = useState('')
  const [newType, setNewType] = useState('Call')
  const [addingNote, setAddingNote] = useState(false)
  const [formData, setFormData] = useState({
    lead_date: lead?.lead_date || '',
    client_name: lead?.client_name || '',
    insta_id: lead?.insta_id || '',
    email: lead?.email || '',
    phone: lead?.phone || '',
    country: lead?.country || '',
    location: lead?.location || '',
    channel: lead?.channel || '',
    lead_source: lead?.lead_source || '',
    stylist: lead?.stylist || '',
    assigned_to: lead?.assigned_to || '',
    lead_quality: lead?.lead_quality || '',
    status: lead?.status || '',
    phase: lead?.phase || 'yet_to_qualify',
    product_category: lead?.product_category || '',
    products_interested: lead?.products_interested || '',
    follow_up_date: lead?.follow_up_date || '',
    client_requirements: lead?.client_requirements || '',
    est_invoice_amount: lead?.est_invoice_amount || '',
    utm_source: lead?.utm_source || '',
    utm_medium: lead?.utm_medium || '',
    utm_campaign: lead?.utm_campaign || '',
    utm_content: lead?.utm_content || '',
    utm_term: lead?.utm_term || '',
    visited_num: lead?.visited_num || '',
    store_visit_booking: lead?.store_visit_booking || '',
    store_location: lead?.store_location || '',
    age_group: lead?.age_group || '',
    occasion: lead?.occasion || '',
    occasion_date: lead?.occasion_date || '',
    call_back_time: lead?.call_back_time || '',
    lost_reason: lead?.lost_reason || '',
    attempt_count: lead?.attempt_count || 0,
    connected_attempt_count: lead?.connected_attempt_count || 0,
    assignee_comments: lead?.assignee_comments || '',
    feedback_by_lead: lead?.feedback_by_lead || '',
    final_comments: lead?.final_comments || '',
    order_id: lead?.order_id || '',
    amount: lead?.amount || ''
  })

  const isQualified = formData.phase === 'qualified'
  const phaseStatuses = isQualified ? QUALIFIED_STATUSES : YET_TO_QUALIFY_STATUSES

  // Products multi-select
  const selectedProducts = formData.products_interested
    ? formData.products_interested.split(',').map(p => p.trim()).filter(Boolean)
    : []

  const toggleProduct = (product) => {
    const current = new Set(selectedProducts)
    if (current.has(product)) current.delete(product)
    else current.add(product)
    handleChange('products_interested', [...current].join(', '))
  }

  // Fetch interactions
  useEffect(() => {
    if (!lead?.id) return
    let cancelled = false
    supa.from('lead_interactions')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!cancelled && !error && data) setInteractions(data)
      })
    return () => { cancelled = true }
  }, [lead?.id])

  const handleAddInteraction = async () => {
    if (!newNote.trim()) return
    setAddingNote(true)
    try {
      const { data, error } = await supa.from('lead_interactions').insert([{
        lead_id: lead.id,
        note: newNote.trim(),
        contacted_by: window._currentUserEmail || 'unknown',
        contacted_by_name: window._currentUserName || '',
        interaction_type: newType
      }]).select()
      if (error) throw error
      if (data && data.length > 0) {
        setInteractions(prev => [data[0], ...prev])
      }
      setNewNote('')
      toast(true, 'Interaction logged')
    } catch (err) {
      console.error('Error adding interaction:', err)
      toast(false, 'Failed to log interaction')
    } finally {
      setAddingNote(false)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'phase') {
        next.status = value === 'qualified' ? 'Follow-up 1' : 'New'
      }
      return next
    })
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      // Delete linked orders first
      await supa.from('lead_orders').delete().eq('lead_id', lead.id)
      // Delete interactions
      await supa.from('lead_interactions').delete().eq('lead_id', lead.id)
      // Delete the lead
      const { error } = await supa.from('leads').delete().eq('id', lead.id)
      if (error) throw error
      toast(true, 'Lead deleted')
      onLeadUpdated?.()
      onClose()
    } catch (err) {
      console.error('Delete error:', err)
      toast(false, 'Failed to delete lead')
    } finally {
      setDeleting(false)
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const sanitized = { ...formData }
      if (sanitized.est_invoice_amount === '' || sanitized.est_invoice_amount === undefined) sanitized.est_invoice_amount = null
      else sanitized.est_invoice_amount = Number(sanitized.est_invoice_amount)
      if (sanitized.amount === '' || sanitized.amount === undefined) sanitized.amount = null
      else sanitized.amount = Number(sanitized.amount)
      ;['order_id','insta_id','email','follow_up_date','store_visit_booking','store_location',
        'visited_num','age_group','assignee_comments','feedback_by_lead','final_comments',
        'client_requirements','country','location','channel','status','lead_quality',
        'product_category','stylist','assigned_to','utm_source','utm_medium','utm_campaign','utm_content','utm_term','lead_source',
        'occasion','occasion_date','products_interested','call_back_time','lost_reason'
      ].forEach(k => { if (sanitized[k] === '') sanitized[k] = null })

      const { error } = await supa.from('leads').update(sanitized).eq('id', lead.id)
      if (error) throw error

      // Auto-log interaction when status changes
      if (sanitized.status && sanitized.status !== lead.status) {
        await supa.from('lead_interactions').insert([{
          lead_id: lead.id,
          interaction_type: 'Status Change',
          outcome: `${lead.status} → ${sanitized.status}`,
          note: `Status changed from ${lead.status} to ${sanitized.status}`,
          contacted_by: window._currentUserEmail || 'unknown',
          contacted_by_name: window._currentUserName || '',
        }])
      }

      toast(true, 'Lead updated successfully')
      onLeadUpdated?.()
    } catch (err) {
      console.error('Error updating lead:', err)
      toast(false, 'Failed to update lead')
    } finally {
      setLoading(false)
    }
  }

  const phaseC = PHASE_COLORS[formData.phase] || PHASE_COLORS.yet_to_qualify
  const qualC = QUALITY_COLORS[formData.lead_quality] || QUALITY_COLORS['Avg']

  // ─── Tab state ─────────────────────────────────────────────────────
  const [editTab, setEditTab] = useState('details') // details | activity | notes | orders

  // ─── Linked orders (fetched from lead_orders junction) ─────────────
  const [linkedOrders, setLinkedOrders] = useState([])
  const [orderSearch, setOrderSearch] = useState('')
  const [orderResults, setOrderResults] = useState([])
  const [searchingOrders, setSearchingOrders] = useState(false)

  useEffect(() => {
    if (!lead?.id) return
    let cancelled = false
    supa.from('lead_orders')
      .select('*, shopify_orders(order_number, customer_name, total_price, order_status, created_at)')
      .eq('lead_id', lead.id)
      .then(({ data, error }) => {
        if (!cancelled && !error && data) setLinkedOrders(data)
      })
    return () => { cancelled = true }
  }, [lead?.id])

  // ─── Meta CAPI push history for this lead ──────────────────────────
  const [metaEvents, setMetaEvents] = useState([])
  const [rePushing, setRePushing] = useState(false)
  const loadMetaEvents = (id) => supa.from('meta_capi_lead_events')
    .select('id, event_name, to_stage, from_stage, status, value, match_keys, response_body, created_at')
    .eq('lead_id', id).order('created_at', { ascending: false })
    .then(({ data }) => { if (data) setMetaEvents(data) })
  useEffect(() => {
    if (!lead?.id) return
    let cancelled = false
    supa.from('meta_capi_lead_events')
      .select('id, event_name, to_stage, from_stage, status, value, match_keys, response_body, created_at')
      .eq('lead_id', lead.id).order('created_at', { ascending: false })
      .then(({ data }) => { if (!cancelled && data) setMetaEvents(data) })
    return () => { cancelled = true }
  }, [lead?.id])
  const rePushMeta = async () => {
    setRePushing(true)
    try {
      await supa.functions.invoke('meta-capi-lead', { body: { lead_id: lead.id, kind: 'status' } })
      await loadMetaEvents(lead.id)
      toast(true, 'Re-pushed to Meta')
    } catch (e) { toast(false, 'Re-push failed: ' + (e?.message || e)) }
    finally { setRePushing(false) }
  }
  const capiPill = leadCapiBadge({ ...lead, ...formData })

  // Debounced order search for linking
  useEffect(() => {
    if (!orderSearch.trim() || orderSearch.trim().length < 2) {
      setOrderResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchingOrders(true)
      try {
        const q = orderSearch.trim()
        const { data } = await supa.from('shopify_orders')
          .select('id, order_number, customer_name, total_price, order_status')
          .or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
          .order('created_at', { ascending: false })
          .limit(10)
        const linkedIds = new Set(linkedOrders.map(o => o.order_id))
        setOrderResults((data || []).filter(o => !linkedIds.has(o.id)))
      } catch (err) {
        console.error('Order search error:', err)
      } finally {
        setSearchingOrders(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [orderSearch])

  const handleLinkOrder = async (order) => {
    try {
      const { data, error } = await supa.from('lead_orders').insert([{
        lead_id: lead.id,
        order_id: order.id,
        linked_by: window._currentUserEmail || 'unknown',
      }]).select('*, shopify_orders(order_number, customer_name, total_price, order_status, created_at)')
      if (error) throw error
      setLinkedOrders(prev => [...prev, data[0]])
      // Trigger on the DB side flips status to Converted + stamps amount —
      // mirror that in the in-flight form state so the user sees it immediately.
      setFormData(f => ({
        ...f,
        status: 'Converted',
        order_id: f.order_id || String(order.id),
        amount: f.amount || order.total_price || ''
      }))
      setOrderSearch('')
      setOrderResults([])
      toast(true, `Linked ${order.order_number}`)
    } catch (err) {
      console.error('Link order error:', err)
      toast(false, 'Failed to link order')
    }
  }

  const handleUnlinkOrder = async (linkId) => {
    try {
      const { error } = await supa.from('lead_orders').delete().eq('id', linkId)
      if (error) throw error
      setLinkedOrders(prev => prev.filter(o => o.id !== linkId))
      toast(true, 'Order unlinked')
    } catch (err) {
      console.error('Unlink order error:', err)
      toast(false, 'Failed to unlink order')
    }
  }

  const editTabs = [
    { id: 'details', label: 'Details', icon: '📋' },
    { id: 'activity', label: 'Activity', icon: '📞', count: interactions.length },
    { id: 'notes', label: 'Notes', icon: '📝' },
    { id: 'orders', label: 'Orders', icon: '🛍️', count: linkedOrders.length },
    { id: 'meta', label: 'Meta', icon: '📣' },
  ]

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      {/* Header */}
      <div className="sticky top-0 z-40 border-b p-4 flex items-center justify-between" style={{ background: C.cardBg, borderColor: C.border }}>
        <div className="flex items-center gap-4">
          <Btn small onClick={onClose} style={{ color: C.text }}>← Back to List</Btn>
          <h1 className="text-2xl font-bold" style={{ color: C.text }}>
            {lead?.client_name || lead?.phone || 'Edit Lead'}
          </h1>
          <Badge color={phaseC.color} bg={phaseC.bg}>{phaseC.label}</Badge>
          {formData.lead_quality && (
            <Badge color={qualC.color} bg={qualC.bg}>{formData.lead_quality}</Badge>
          )}
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: capiPill.bg, color: capiPill.color }} title={capiPill.title}>Meta: {capiPill.label}</span>
        </div>
        <Btn primary onClick={handleSubmit} disabled={loading}>
          {loading ? 'Saving...' : 'Save All Changes'}
        </Btn>
      </div>

      {/* Tab Bar */}
      <div className="px-6 pt-4 pb-0 max-w-6xl mx-auto">
        <div className="flex gap-1.5">
          {editTabs.map(tab => {
            const isActive = editTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setEditTab(tab.id)}
                className="px-4 py-2.5 rounded-t-lg font-bold text-sm flex items-center gap-1.5 transition-all"
                style={{
                  background: isActive ? C.cardBg : 'transparent',
                  color: isActive ? C.gold : C.textMuted,
                  borderBottom: isActive ? `2px solid ${C.gold}` : '2px solid transparent',
                }}
              >
                <span>{tab.icon}</span>
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: isActive ? C.gold + '15' : C.bg,
                      color: isActive ? C.gold : C.textMuted,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-3 sm:p-6 max-w-6xl mx-auto">

        {/* ═══ DETAILS TAB ═══ */}
        {editTab === 'details' && (
          <>
            {/* Basic Information */}
            <div className="mb-6 sm:mb-8 p-4 sm:p-6 rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <h2 className="text-lg font-bold mb-6" style={{ color: C.text }}>Basic Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Field label="Lead Date">
                  <Input type="date" value={formData.lead_date} onChange={e => handleChange('lead_date', e.target.value)} />
                </Field>
                <Field label="Client Name">
                  <Input type="text" value={formData.client_name} onChange={e => handleChange('client_name', e.target.value)} />
                </Field>
                <Field label="Phone" required>
                  <PhoneInput
                    value={formData.phone}
                    onChange={v => handleChange('phone', v)}
                    onCountryChange={country => handleChange('country', country)}
                    countryCodes={lists.country_codes || {}}
                    countries={lists.countries || []}
                  />
                </Field>
                <Field label="Email">
                  <Input type="email" value={formData.email} onChange={e => handleChange('email', e.target.value)} />
                </Field>
                <Field label="Instagram ID">
                  <Input type="text" placeholder="@username" value={formData.insta_id} onChange={e => handleChange('insta_id', e.target.value)} />
                </Field>
                <Field label="Age Group">
                  <Select value={formData.age_group} onChange={e => handleChange('age_group', e.target.value)}>
                    <option value="">Select</option>
                    {AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
                  </Select>
                </Field>
                <Field label="Country">
                  <Select value={formData.country} onChange={e => handleChange('country', e.target.value)}>
                    <option value="">Select</option>
                    {lists.countries.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Location / City">
                  <Select value={formData.location} onChange={e => handleChange('location', e.target.value)}>
                    <option value="">Select</option>
                    {(lists.locations_by_country?.[formData.country] || lists.locations).map(l => <option key={l} value={l}>{l}</option>)}
                  </Select>
                </Field>
              </div>
            </div>

            {/* Pipeline & Status */}
            <div className="mb-6 sm:mb-8 p-4 sm:p-6 rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <h2 className="text-lg font-bold mb-6" style={{ color: C.text }}>Pipeline & Status</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Field label="Phase" required>
                  <Select value={formData.phase} onChange={e => handleChange('phase', e.target.value)}>
                    <option value="yet_to_qualify">Yet to Qualify</option>
                    <option value="qualified">Qualified</option>
                  </Select>
                </Field>
                <Field label="Status" required>
                  <Select value={formData.status} onChange={e => handleChange('status', e.target.value)}>
                    <option value="">Select</option>
                    {phaseStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
                <Field label="Lead Quality">
                  <Select value={formData.lead_quality} onChange={e => handleChange('lead_quality', e.target.value)}>
                    <option value="">Select</option>
                    {LEAD_QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
                  </Select>
                </Field>
                <Field label="Follow-up Date">
                  <Input type="date" value={formData.follow_up_date} onChange={e => handleChange('follow_up_date', e.target.value)} />
                </Field>
                <Field label={`Call-back Time${formData.call_back_time ? ' — ' + formatTimeIST(formData.call_back_time) : ''}`}>
                  <Input type="time" value={formData.call_back_time} onChange={e => handleChange('call_back_time', e.target.value)} />
                </Field>
                {!isQualified && (
                  <>
                    <Field label="Attempt Count">
                      <Input type="number" min="0" value={formData.attempt_count} onChange={e => handleChange('attempt_count', parseInt(e.target.value) || 0)} />
                    </Field>
                    <Field label="Connected Attempt Count">
                      <Input type="number" min="0" value={formData.connected_attempt_count} onChange={e => handleChange('connected_attempt_count', parseInt(e.target.value) || 0)} />
                    </Field>
                  </>
                )}
                {isTerminalStatus(formData.status) && (
                  <Field label="Lost / Not Qualified Reason">
                    <Select value={formData.lost_reason} onChange={e => handleChange('lost_reason', e.target.value)}>
                      <option value="">Select Reason</option>
                      {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
            </div>

            {/* Source & Channel */}
            <div className="mb-6 sm:mb-8 p-4 sm:p-6 rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <h2 className="text-lg font-bold mb-6" style={{ color: C.text }}>Source & Channel</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Field label="Channel">
                  <Select value={formData.channel} onChange={e => handleChange('channel', e.target.value)}>
                    <option value="">Select</option>
                    {lists.channels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                  </Select>
                </Field>
                <Field label="Lead Source">
                  <Select value={formData.lead_source} onChange={e => handleChange('lead_source', e.target.value)}>
                    <option value="">Select</option>
                    {lists.lead_sources.map(s => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
              </div>
              {/* UTM Campaign */}
              <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
                <Field label="UTM Campaign">
                  <input list="utm-campaigns-edit" value={formData.utm_campaign} onChange={e => handleChange('utm_campaign', e.target.value)} placeholder="type or pick a campaign" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, background: '#fff', outline: 'none' }} />
                  <datalist id="utm-campaigns-edit">{lists.utm_campaigns.map(v => <option key={v} value={v} />)}</datalist>
                </Field>
              </div>
            </div>

            {/* Occasion & Products */}
            <div className="mb-6 sm:mb-8 p-4 sm:p-6 rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <h2 className="text-lg font-bold mb-6" style={{ color: C.text }}>Occasion & Products</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <Field label="Occasion">
                  <Select value={formData.occasion} onChange={e => handleChange('occasion', e.target.value)}>
                    <option value="">Select</option>
                    {lists.occasions.map(o => <option key={o} value={o}>{o}</option>)}
                  </Select>
                </Field>
                <Field label="Occasion Date">
                  <Input type="date" value={formData.occasion_date} onChange={e => handleChange('occasion_date', e.target.value)} />
                </Field>
              </div>
              <Field label="Products Interested (select multiple)">
                <div className="flex flex-wrap gap-2 mt-1">
                  {lists.product_categories.map(product => {
                    const isSelected = selectedProducts.includes(product)
                    return (
                      <button
                        key={product}
                        type="button"
                        onClick={() => toggleProduct(product)}
                        className="text-xs px-3 py-1.5 rounded-full font-bold transition-all"
                        style={{
                          background: isSelected ? 'rgba(37,99,235,0.1)' : C.bg,
                          color: isSelected ? '#2563eb' : C.textMuted,
                          border: `1.5px solid ${isSelected ? '#2563eb' : C.border}`
                        }}
                      >
                        {isSelected ? '✓ ' : ''}{product}
                      </button>
                    )
                  })}
                </div>
              </Field>
            </div>

            {/* Team Assignment */}
            <div className="mb-6 sm:mb-8 p-4 sm:p-6 rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <h2 className="text-lg font-bold mb-6" style={{ color: C.text }}>Team Assignment</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Field label="Assigned To">
                  <Select value={formData.assigned_to} onChange={e => handleChange('assigned_to', e.target.value)}>
                    <option value="">Select</option>
                    {filterStylists(teamMembers).map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                  </Select>
                </Field>
                <Field label="Stylist">
                  <Select value={formData.stylist || ''} onChange={e => handleChange('stylist', e.target.value)}>
                    <option value="">Select</option>
                    {filterStylists(teamMembers).map(tm => <option key={tm.id} value={String(tm.id)}>{tm.name}</option>)}
                  </Select>
                </Field>
              </div>
            </div>

            {/* Store Visit */}
            <div className="mb-6 sm:mb-8 p-4 sm:p-6 rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <h2 className="text-lg font-bold mb-6" style={{ color: C.text }}>Store Visit Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Field label="Store Visit Booking">
                  <Select value={formData.store_visit_booking} onChange={e => handleChange('store_visit_booking', e.target.value)}>
                    <option value="">Select</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </Select>
                </Field>
                <Field label="Store Location">
                  <Input type="text" value={formData.store_location} onChange={e => handleChange('store_location', e.target.value)} />
                </Field>
                <Field label="Visits Count">
                  <Select value={formData.visited_num} onChange={e => handleChange('visited_num', e.target.value)}>
                    <option value="">Select</option>
                    {VISITED_NUMS.map(v => <option key={v} value={v}>{v}</option>)}
                  </Select>
                </Field>
              </div>
            </div>

            {/* Financial Details */}
            <div className="mb-6 sm:mb-8 p-4 sm:p-6 rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <h2 className="text-lg font-bold mb-6" style={{ color: C.text }}>Financial Details</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Field label="Est. Invoice Amount">
                  <Input type="text" inputMode="decimal" placeholder="Amount (INR)" value={formData.est_invoice_amount} onChange={e => handleChange('est_invoice_amount', e.target.value)} />
                </Field>
              </div>
            </div>
          </>
        )}

        {/* ═══ ACTIVITY TAB ═══ */}
        {editTab === 'activity' && (
          <div className="p-6 rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold" style={{ color: C.text }}>Activity Timeline</h2>
              <span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: C.gold + '15', color: C.gold }}>
                {interactions.length} interactions
              </span>
            </div>

            {/* Add interaction */}
            <div className="flex gap-3 mb-6 p-3 rounded-lg" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
              <Select value={newType} onChange={e => setNewType(e.target.value)} className="w-32" style={{ flexShrink: 0 }}>
                {INTERACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
              <Input
                type="text"
                placeholder="Add a note about this interaction..."
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newNote.trim()) handleAddInteraction() }}
              />
              <Btn primary onClick={handleAddInteraction} disabled={addingNote || !newNote.trim()} style={{ flexShrink: 0 }}>
                {addingNote ? '...' : '+ Log'}
              </Btn>
            </div>

            {/* Timeline */}
            <div className="space-y-0">
              {interactions.length === 0 ? (
                <div className="text-sm py-12 text-center" style={{ color: C.textMuted }}>
                  <div className="text-3xl mb-2">📞</div>
                  No interactions logged yet. Use "Log Call" to record activity.
                </div>
              ) : interactions.map((ix, idx) => {
                const typeColors = {
                  Call: { dot: '#2563eb', bg: 'rgba(37,99,235,0.08)' },
                  WhatsApp: { dot: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
                  Email: { dot: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
                  'Store Visit': { dot: C.gold, bg: C.gold + '12' },
                  Note: { dot: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
                }
                const tc = typeColors[ix.interaction_type] || typeColors.Note
                const isLast = idx === interactions.length - 1
                return (
                  <div key={ix.id} className="flex gap-3">
                    {/* Timeline line + dot */}
                    <div className="flex flex-col items-center" style={{ width: '20px' }}>
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                        style={{ background: tc.dot }}
                      />
                      {!isLast && (
                        <div className="flex-1 w-px" style={{ background: C.border, minHeight: '20px' }} />
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge color={tc.dot} bg={tc.bg}>{ix.interaction_type}</Badge>
                        {ix.outcome && (
                          <span className="text-[10px] font-bold uppercase" style={{ color: C.gold }}>{ix.outcome}</span>
                        )}
                        <span className="text-[10px] ml-auto" style={{ color: C.textMuted }}>
                          {new Date(ix.created_at).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', hour12: true
                          })} IST
                        </span>
                      </div>
                      <div className="text-sm" style={{ color: C.text }}>{ix.note}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>
                        by {ix.contacted_by_name || ix.contacted_by}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══ NOTES TAB ═══ */}
        {editTab === 'notes' && (
          <div className="p-6 rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            <h2 className="text-lg font-bold mb-6" style={{ color: C.text }}>Notes & Comments</h2>
            <div className="space-y-4">
              <Field label="Client Requirements">
                <Textarea rows={4} value={formData.client_requirements} onChange={e => handleChange('client_requirements', e.target.value)} />
              </Field>
              <Field label="Assignee Comments">
                <Textarea rows={3} value={formData.assignee_comments} onChange={e => handleChange('assignee_comments', e.target.value)} />
              </Field>
              <Field label="Feedback by Lead">
                <Textarea rows={3} value={formData.feedback_by_lead} onChange={e => handleChange('feedback_by_lead', e.target.value)} />
              </Field>
              <Field label="Final Comments">
                <Textarea rows={3} value={formData.final_comments} onChange={e => handleChange('final_comments', e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {/* ═══ ORDERS TAB ═══ */}
        {editTab === 'orders' && (
          <div className="p-6 rounded-xl" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold" style={{ color: C.text }}>Linked Orders</h2>
              <button onClick={() => {
                if (typeof window !== 'undefined') {
                  window._posLeadSeed = { lead: { ...lead, ...formData } }
                  window._posInitialView = 'new_order'
                  window.location.hash = '#/pos'
                }
              }}
                className="text-xs font-bold px-3 py-2 rounded-lg inline-flex items-center gap-1.5"
                style={{ background: C.gold, color: '#fff' }}>
                ✦ Create Order from Lead
              </button>
            </div>

            {/* Search & Link */}
            <div className="mb-6 p-4 rounded-lg" style={{ background: C.bg, border: `1.5px dashed ${C.gold}40` }}>
              <label className="block text-[10px] font-bold uppercase mb-2" style={{ color: C.gold }}>Search & Link Order</label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search by order number or client name..."
                  value={orderSearch}
                  onChange={e => setOrderSearch(e.target.value)}
                />
                {searchingOrders && (
                  <div className="absolute right-3 top-2.5 text-xs" style={{ color: C.textMuted }}>...</div>
                )}
              </div>
              {orderResults.length > 0 && (
                <div className="mt-1 rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.cardBg }}>
                  {orderResults.map(o => (
                    <button
                      key={o.id}
                      onClick={() => handleLinkOrder(o)}
                      className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-amber-50 transition-colors text-sm"
                      style={{ borderBottom: `1px solid ${C.border}` }}
                    >
                      <span>
                        <strong>{o.order_number}</strong>
                        <span className="text-xs ml-2" style={{ color: C.textMuted }}>{o.customer_name}</span>
                        <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded" style={{ background: 'rgba(107,114,128,0.1)', color: '#6b7280' }}>{o.order_status}</span>
                      </span>
                      <span className="text-xs font-bold" style={{ color: '#16a34a' }}>
                        {o.total_price ? `₹${Number(o.total_price).toLocaleString('en-IN')}` : '—'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {linkedOrders.length === 0 && !formData.order_id ? (
              <div className="text-sm py-8 text-center" style={{ color: C.textMuted }}>
                <div className="text-3xl mb-2">🛍️</div>
                No orders linked yet. Use the search above to link orders.
              </div>
            ) : (
              <div className="space-y-3">
                {/* Legacy order_id — resolve to a real shopify_orders row inline */}
                {formData.order_id && linkedOrders.length === 0 && (
                  <LegacyLinkedOrderRow orderRef={formData.order_id} fallbackAmount={formData.amount} fmtCurrency={fmtCurrency} />
                )}
                {/* Junction-linked orders */}
                {linkedOrders.map(lo => {
                  const order = lo.shopify_orders
                  return (
                    <div key={lo.id} className="p-4 rounded-lg flex items-center justify-between" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                      <div>
                        <div className="text-sm font-bold" style={{ color: C.text }}>{order?.order_number || lo.order_id}</div>
                        <div className="text-xs" style={{ color: C.textMuted }}>
                          {order?.customer_name || ''} — {order?.order_status || ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm font-bold" style={{ color: '#16a34a' }}>
                          {order?.total_price ? fmtCurrency(Number(order.total_price)) : '—'}
                        </div>
                        <button
                          onClick={() => handleUnlinkOrder(lo.id)}
                          className="text-xs px-2 py-1 rounded-lg hover:opacity-70 transition-all"
                          style={{ color: '#dc2626', border: '1px solid rgba(220,38,38,0.2)' }}
                        >
                          Unlink
                        </button>
                      </div>
                    </div>
                  )
                })}
                {/* Total */}
                {linkedOrders.length > 1 && (
                  <div className="p-3 rounded-lg flex items-center justify-between" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.15)' }}>
                    <span className="text-xs font-bold" style={{ color: '#16a34a' }}>Total Order Value</span>
                    <span className="text-sm font-bold" style={{ color: '#16a34a' }}>
                      {fmtCurrency(linkedOrders.reduce((sum, lo) => sum + (Number(lo.shopify_orders?.total_price) || 0), 0))}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {editTab === 'meta' && (
          <div className="rounded-2xl p-4 sm:p-6" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: C.text }}>Meta CAPI</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: capiPill.bg, color: capiPill.color }} title={capiPill.title}>{capiPill.label}</span>
              </div>
              <button onClick={rePushMeta} disabled={rePushing} className="text-xs px-3 py-1.5 rounded-lg font-bold disabled:opacity-50" style={{ border: `1px solid ${C.border}`, color: C.gold }}>
                {rePushing ? 'Pushing…' : 'Re-push current stage'}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              <div className="p-3 rounded-lg" style={{ background: C.bg }}><div className="text-[11px]" style={{ color: C.textMuted }}>Last event</div><div className="text-sm font-bold" style={{ color: C.text }}>{lead?.meta_capi_last_event || '—'}</div></div>
              <div className="p-3 rounded-lg" style={{ background: C.bg }}><div className="text-[11px]" style={{ color: C.textMuted }}>Last pushed</div><div className="text-sm font-bold" style={{ color: C.text }}>{lead?.meta_capi_last_sent_at ? new Date(lead.meta_capi_last_sent_at).toLocaleString('en-IN') : '—'}</div></div>
              <div className="p-3 rounded-lg" style={{ background: C.bg }}><div className="text-[11px]" style={{ color: C.textMuted }}>Match keys</div><div className="text-sm font-bold" style={{ color: C.text }}>{[formData.email ? 'email' : '', formData.phone ? 'phone' : ''].filter(Boolean).join(' + ') || 'none'}</div></div>
            </div>
            <div className="text-[11px] font-bold uppercase mb-2" style={{ color: C.textMuted }}>Push history</div>
            {metaEvents.length === 0 ? (
              <div className="text-sm py-6 text-center" style={{ color: C.textMuted }}>No Meta events pushed yet for this lead.</div>
            ) : (
              <div className="space-y-2">
                {metaEvents.map(ev => (
                  <div key={ev.id} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                    <div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full mr-2" style={{ background: ev.status === 'success' ? '#ecfdf5' : ev.status === 'failed' ? '#fef2f2' : '#f3f4f6', color: ev.status === 'success' ? '#059669' : ev.status === 'failed' ? '#dc2626' : '#9ca3af' }}>{ev.event_name}</span>
                      <span className="text-xs" style={{ color: C.textMuted }}>{ev.to_stage || ''}{ev.value ? ' · ₹' + Number(ev.value).toLocaleString('en-IN') : ''}</span>
                      {ev.status === 'failed' && <span className="text-[11px] block" style={{ color: '#dc2626' }}>{ev.response_body?.error?.message || 'error'}</span>}
                    </div>
                    <span className="text-[11px]" style={{ color: C.textMuted }}>{new Date(ev.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[11px] mt-4" style={{ color: C.textMuted }}>Sends only at milestones: Lead (created), QualifiedLead (High Quality + Store Visit Booked / Proposal Sent / To be Closed), LostLead (Lost). Follow-ups and Not Qualified are not sent.</div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 justify-between mt-6 mb-6">
          <div>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs px-3 py-2 rounded-lg font-bold transition-all hover:opacity-80"
                style={{ color: '#dc2626', border: '1px solid #fecaca', background: '#fef2f2' }}
              >
                Delete Lead
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color: '#dc2626' }}>Are you sure?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold text-white"
                  style={{ background: '#dc2626' }}
                >
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ border: `1px solid ${C.border}`, color: C.textMuted }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn primary onClick={handleSubmit} disabled={loading}>
              {loading ? 'Saving...' : 'Save All Changes'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

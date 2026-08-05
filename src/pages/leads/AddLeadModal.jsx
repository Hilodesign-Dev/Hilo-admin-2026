/* ═══════════════════════════════════════════════════════════════════════════
   ADD LEAD MODAL — v3: DB-driven dropdowns, time picker, stylist, channel auto
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react'
import { C, toast } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { Overlay, Field, Input, Select, Textarea, Btn, Badge } from './ui'
import {
  YET_TO_QUALIFY_STATUSES, QUALIFIED_STATUSES,
  LEAD_QUALITIES
} from './constants'
import { useLeadMasterLists } from './useLeadMasterLists'
import { PhoneInput } from './PhoneInput'
import { useIsMobile } from './useIsMobile'
import { filterStylists } from '../../lib/helpers'


// Auto-default channel based on designation
const getDefaultChannel = () => {
  const designation = (window._currentUserDesignation || '').toLowerCase()
  if (designation.includes('online')) return 'Online Assist'
  return 'Online Assist'
}

const formatTimeIST = (val) => {
  if (!val) return ''
  const parts = val.split(':')
  if (parts.length < 2) return val
  let h = parseInt(parts[0], 10)
  const m = parts[1]
  const ampm = h >= 12 ? 'PM' : 'AM'
  if (h > 12) h -= 12
  if (h === 0) h = 12
  return `${h}:${m} ${ampm} IST`
}

export const AddLeadModal = ({ onClose, onLeadAdded, teamMembers = [], activeTab }) => {
  const lists = useLeadMasterLists()
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(false)
  const defaultPhase = activeTab === 'qualified' ? 'qualified' : 'yet_to_qualify'
  const [formData, setFormData] = useState({
    lead_date: new Date().toISOString().split('T')[0],
    client_name: '',
    insta_id: '',
    email: '',
    phone: '',
    country: 'India',
    location: '',
    channel: getDefaultChannel(),
    lead_source: 'Whatsapp Ad',
    stylist: '',
    assigned_to: window._currentTeamMemberId || '',
    lead_quality: defaultPhase === 'qualified' ? 'Avg' : '',
    status: defaultPhase === 'qualified' ? 'Follow-up 1' : 'New',
    phase: defaultPhase,
    occasion: '',
    occasion_date: '',
    products_interested: '',
    product_category: '',
    follow_up_date: '',
    call_back_time: '',
    client_requirements: '',
    utm_source: '',
    utm_medium: '',
    utm_campaign: '',
    utm_content: '',
    utm_term: ''
  })

  const [errors, setErrors] = useState({})

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

  const validate = () => {
    const err = {}
    const phone = (formData.phone || '').trim()
    if (!phone) {
      err.phone = 'Phone required'
    } else if (phone.replace(/[^0-9]/g, '').length < 7) {
      err.phone = 'Enter a valid phone number'
    }
    if (!formData.channel) err.channel = 'Channel required'
    if (!formData.status) err.status = 'Status required'
    if (isQualified && !formData.lead_quality) err.lead_quality = 'Quality required for qualified leads'
    setErrors(err)
    return Object.keys(err).length === 0
  }

  const handleChange = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'phase') {
        if (value === 'qualified') {
          next.status = 'Follow-up 1'
          if (!next.lead_quality) next.lead_quality = 'Avg'
        } else {
          next.status = 'New'
        }
      }
      if (field === 'lead_source') {
        if (['Store VM', 'Stalls / Trade Exhibitions'].includes(value)) {
          next.channel = 'In-store'
          if (!next.lead_source) next.lead_source = 'Direct Walk-in'
        }
      }
      if (field === 'channel' && value === 'In-store') {
        next.phase = 'qualified'
        next.status = 'Follow-up 1'
        if (!next.lead_quality) next.lead_quality = 'Avg'
      }
      return next
    })
    if (errors[field]) {
      const newErrors = { ...errors }
      delete newErrors[field]
      setErrors(newErrors)
    }
  }

  const [dupWarning, setDupWarning] = useState(null)

  const handleSubmit = async () => {
    if (!validate()) return

    setLoading(true)
    try {
      const lead = { ...formData }
      // Normalize phone — strip spaces, dashes, parens (keep + and digits only)
      if (lead.phone) lead.phone = lead.phone.replace(/[^\d+]/g, '')

      // Check for duplicate phone
      if (lead.phone && !dupWarning) {
        const digits = lead.phone.replace(/[^0-9]/g, '')
        const last10 = digits.slice(-10)
        if (last10.length >= 7) {
          const { data: existing } = await supa.from('leads')
            .select('id, client_name, phone, status, lead_date')
            .ilike('phone', `%${last10}`)
            .limit(5)
          if (existing && existing.length > 0) {
            setDupWarning(existing)
            setLoading(false)
            return
          }
        }
      }

      lead.created_by = window._currentUserEmail || 'unknown'
      lead.import_source = 'manual'
      if (!isQualified) {
        lead.attempt_count = 0
        lead.connected_attempt_count = 0
      }
      Object.keys(lead).forEach(k => { if (lead[k] === '') lead[k] = null })

      const { error } = await supa.from('leads').insert([lead])
      if (error) throw error

      toast(true, `Lead added → ${isQualified ? 'Qualified' : 'Yet to Qualify'}`)
      setDupWarning(null)
      onLeadAdded?.()
      onClose()
    } catch (err) {
      console.error('Error adding lead:', err)
      toast(false, 'Failed to add lead')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className={`w-full mx-auto bg-white shadow-2xl ${isMobile ? 'h-full rounded-none' : 'sm:max-w-5xl rounded-2xl'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 sm:p-6 py-4 flex justify-between items-center border-b" style={{ borderColor: C.border }}>
          <div className="flex items-center gap-2 sm:gap-3">
            <h2 className="text-lg sm:text-xl font-bold" style={{ color: C.text }}>Add New Lead</h2>
            <Badge
              color={isQualified ? '#16a34a' : '#2563eb'}
              bg={isQualified ? 'rgba(22,163,74,0.08)' : 'rgba(37,99,235,0.08)'}
            >
              {isQualified ? 'Qualified' : 'Yet to Qualify'}
            </Badge>
          </div>
          <button onClick={onClose} className="text-2xl hover:opacity-60">×</button>
        </div>

        <div className={`px-4 sm:p-6 py-4 ${isMobile ? 'flex-1 overflow-y-auto' : 'max-h-[70vh] overflow-y-auto'}`}>
          {/* Phase selector */}
          <div className="mb-4 sm:mb-6 flex gap-2">
            <button
              onClick={() => handleChange('phase', 'yet_to_qualify')}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
              style={{
                background: !isQualified ? '#2563eb' : 'transparent',
                color: !isQualified ? '#fff' : C.text,
                border: !isQualified ? 'none' : `1px solid ${C.border}`
              }}
            >
              Yet to Qualify
            </button>
            <button
              onClick={() => handleChange('phase', 'qualified')}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
              style={{
                background: isQualified ? '#16a34a' : 'transparent',
                color: isQualified ? '#fff' : C.text,
                border: isQualified ? 'none' : `1px solid ${C.border}`
              }}
            >
              Qualified
            </button>
          </div>

          <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-4 sm:gap-6`}>
            {/* Left Column */}
            <div className="space-y-4">
              <Field label="Lead Date" required>
                <Input type="date" value={formData.lead_date} onChange={e => handleChange('lead_date', e.target.value)} />
              </Field>

              <Field label="Phone" required>
                <PhoneInput
                  value={formData.phone}
                  onChange={v => handleChange('phone', v)}
                  onCountryChange={country => handleChange('country', country)}
                  countryCodes={lists.country_codes || {}}
                  countries={lists.countries || []}
                />
                {errors.phone && <div className="text-xs mt-1" style={{ color: C.red }}>{errors.phone}</div>}
              </Field>

              <Field label="Client Name">
                <Input type="text" placeholder="Full name" value={formData.client_name} onChange={e => handleChange('client_name', e.target.value)} />
              </Field>

              <Field label="Email">
                <Input type="email" placeholder="user@example.com" value={formData.email} onChange={e => handleChange('email', e.target.value)} />
              </Field>

              <Field label="Instagram ID">
                <Input type="text" placeholder="@username" value={formData.insta_id} onChange={e => handleChange('insta_id', e.target.value)} />
              </Field>

              <Field label="Country">
                <Select value={formData.country} onChange={e => handleChange('country', e.target.value)}>
                  {lists.countries.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>

              {isQualified && (
                <Field label="Location / City">
                  <Select value={formData.location} onChange={e => handleChange('location', e.target.value)}>
                    <option value="">Select Location</option>
                    {(lists.locations_by_country?.[formData.country] || lists.locations).map(l => <option key={l} value={l}>{l}</option>)}
                  </Select>
                </Field>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              <Field label="Channel" required>
                <Select value={formData.channel} onChange={e => handleChange('channel', e.target.value)}>
                  <option value="">Select Channel</option>
                  {lists.channels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                </Select>
                {errors.channel && <div className="text-xs mt-1" style={{ color: C.red }}>{errors.channel}</div>}
              </Field>

              <Field label="Lead Source">
                <Select value={formData.lead_source} onChange={e => handleChange('lead_source', e.target.value)}>
                  <option value="">Select Source</option>
                  {lists.lead_sources.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>

              {/* UTM Campaign */}
              <div className="col-span-full">
                <Field label="UTM Campaign">
                  <input list="utm-campaigns-add" value={formData.utm_campaign} onChange={e => handleChange('utm_campaign', e.target.value)} placeholder="type or pick a campaign" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, background: '#fff', outline: 'none' }} />
                  <datalist id="utm-campaigns-add">{lists.utm_campaigns.map(v => <option key={v} value={v} />)}</datalist>
                </Field>
              </div>

              <Field label="Status" required>
                <Select value={formData.status} onChange={e => handleChange('status', e.target.value)}>
                  {phaseStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
                {errors.status && <div className="text-xs mt-1" style={{ color: C.red }}>{errors.status}</div>}
              </Field>

              <Field label="Lead Quality">
                <Select value={formData.lead_quality} onChange={e => handleChange('lead_quality', e.target.value)}>
                  <option value="">Select</option>
                  {LEAD_QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
                </Select>
                {errors.lead_quality && <div className="text-xs mt-1" style={{ color: C.red }}>{errors.lead_quality}</div>}
              </Field>

              <Field label="Occasion">
                <Select value={formData.occasion} onChange={e => handleChange('occasion', e.target.value)}>
                  <option value="">Select Occasion</option>
                  {lists.occasions.map(o => <option key={o} value={o}>{o}</option>)}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Occasion Date">
                  <Input type="date" value={formData.occasion_date} onChange={e => handleChange('occasion_date', e.target.value)} />
                </Field>
                <Field label="Follow-up Date">
                  <Input type="date" value={formData.follow_up_date} onChange={e => handleChange('follow_up_date', e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Call-back Time">
                  <Input type="time" value={formData.call_back_time} onChange={e => handleChange('call_back_time', e.target.value)} />
                  {formData.call_back_time && (
                    <div className="text-[10px] mt-0.5" style={{ color: C.amber }}>{formatTimeIST(formData.call_back_time)}</div>
                  )}
                </Field>
                <Field label="Stylist">
                  <Select value={formData.stylist} onChange={e => handleChange('stylist', e.target.value)}>
                    <option value="">Select Stylist</option>
                    {filterStylists(teamMembers).map(tm => <option key={tm.id} value={String(tm.id)}>{tm.name}</option>)}
                  </Select>
                </Field>
              </div>

              <Field label="Assigned To">
                <Select value={formData.assigned_to} onChange={e => handleChange('assigned_to', e.target.value)}>
                  <option value="">Select Team Member</option>
                  {filterStylists(teamMembers).map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                </Select>
              </Field>
            </div>
          </div>

          {/* Products Interested — full width */}
          <div className="mt-6">
            <Field label="Products Interested">
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

          {/* Requirements */}
          <div className="mt-6">
            <Field label="Client Requirements">
              <Textarea rows={3} placeholder="Describe client requirements..." value={formData.client_requirements} onChange={e => handleChange('client_requirements', e.target.value)} />
            </Field>
          </div>
        </div>

        {/* Duplicate phone warning */}
        {dupWarning && (
          <div className="px-4 sm:px-6 py-3" style={{ background: 'rgba(245,158,11,0.06)', borderTop: `1px solid rgba(245,158,11,0.2)` }}>
            <div className="text-sm font-bold mb-2" style={{ color: '#d97706' }}>
              ⚠ Phone number already exists
            </div>
            <div className="space-y-1.5 mb-3">
              {dupWarning.map(d => (
                <div key={d.id} className="text-xs flex gap-3 items-center" style={{ color: C.text }}>
                  <span className="font-bold">{d.client_name || d.phone}</span>
                  <Badge color={C.textMuted} bg={C.bg}>{d.status}</Badge>
                  <span style={{ color: C.textMuted }}>{d.lead_date}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Btn small onClick={() => setDupWarning(null)} style={{ color: C.textMuted }}>← Go back</Btn>
              <Btn small onClick={() => { setDupWarning('confirmed'); handleSubmit() }} style={{ color: '#d97706' }}>
                Add anyway
              </Btn>
            </div>
          </div>
        )}

        <div className="px-4 sm:p-6 py-4 flex gap-3 justify-end border-t" style={{ borderColor: C.border }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={handleSubmit} disabled={loading}>
            {loading ? 'Adding...' : `Add Lead → ${isQualified ? 'Qualified' : 'Yet to Qualify'}`}
          </Btn>
        </div>
      </div>
    </Overlay>
  )
}

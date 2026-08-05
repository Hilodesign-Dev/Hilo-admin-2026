/* ═══════════════════════════════════════════════════════════════════════════
   QUICK ADD STRIP — v2: DB-driven dropdowns + designation-based channel
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react'
import { C, toast } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { LEAD_QUALITIES } from './constants'
import { useLeadMasterLists } from './useLeadMasterLists'
import { PhoneInput } from './PhoneInput'
import { useIsMobile } from './useIsMobile'

// Auto-default channel based on designation
const getDefaultChannel = () => {
  const designation = (window._currentUserDesignation || '').toLowerCase()
  if (designation.includes('online')) return 'Online Assist'
  return 'Online Assist'
}

export const QuickAddStrip = ({ onLeadAdded, activeTab }) => {
  const lists = useLeadMasterLists()
  const isMobile = useIsMobile()

  const getDefaults = () => ({
    phone: '',
    channel: getDefaultChannel(),
    lead_source: 'Whatsapp Ad',
    funnel: 'yet_to_qualify',
    lead_quality: 'Avg',
    client_name: '',
    notes: '',
  })

  const [form, setForm] = useState(getDefaults())
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(true)

  const isQualified = form.funnel === 'qualified'

  const handleChange = (k, v) => {
    const next = { ...form, [k]: v }
    if (k === 'lead_source') {
      const storeVMSources = ['Store VM', 'Stalls / Trade Exhibitions']
      if (storeVMSources.includes(v)) next.channel = 'In-store'
    }
    if (k === 'channel' && v === 'In-store') {
      next.funnel = 'qualified'
    }
    setForm(next)
  }

  const doSave = async (closeAfter) => {
    if (!form.phone.trim()) {
      toast(false, 'Phone number is required')
      return
    }
    if (isQualified && !form.lead_quality) {
      toast(false, 'Quality is required for qualified leads')
      return
    }

    setSaving(true)
    try {
      const lead = {
        phone: form.phone.trim().replace(/[^\d+]/g, ''),
        channel: form.channel,
        lead_source: form.lead_source || null,
        lead_date: new Date().toISOString().split('T')[0],
        created_by: window._currentUserEmail || 'unknown',
        import_source: 'manual',
      }

      const currentTeamMemberId = window._currentTeamMemberId || null
      if (currentTeamMemberId) {
        lead.assigned_to = currentTeamMemberId
      }

      if (isQualified) {
        lead.phase = 'qualified'
        lead.status = 'Follow-up 1'
        lead.lead_quality = form.lead_quality
        if (form.client_name.trim()) lead.client_name = form.client_name.trim()
        if (form.notes.trim()) lead.client_requirements = form.notes.trim()
      } else {
        lead.phase = 'yet_to_qualify'
        lead.status = 'New'
        lead.attempt_count = 0
        if (form.client_name.trim()) lead.client_name = form.client_name.trim()
      }

      const { error } = await supa.from('leads').insert([lead])
      if (error) throw error

      toast(true, `Lead added → ${isQualified ? 'Qualified' : 'Yet to Qualify'}`)
      setForm(getDefaults())
      onLeadAdded?.()

      if (closeAfter) setExpanded(false)
    } catch (err) {
      console.error('Quick add error:', err)
      toast(false, 'Failed to add lead')
    } finally {
      setSaving(false)
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full mb-4 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-80"
        style={{ background: C.gold + '12', color: C.gold, border: `1.5px dashed ${C.gold}40` }}
      >
        + Quick Add Lead
      </button>
    )
  }

  return (
    <div className="mb-4 rounded-xl overflow-hidden" style={{ border: `1.5px solid ${C.gold}40`, background: C.cardBg }}>
      {/* Main row — stacks vertically on mobile */}
      <div className={`p-3 flex ${isMobile ? 'flex-col gap-2' : 'items-end gap-3 flex-wrap'}`}>
        {/* Phone with country code */}
        <div className={isMobile ? 'w-full' : 'flex-1 min-w-[200px]'}>
          <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Phone *</label>
          <PhoneInput
            value={form.phone}
            onChange={v => handleChange('phone', v)}
            countryCodes={lists.country_codes || {}}
            countries={lists.countries || []}
          />
        </div>

        {/* Channel + Source row (side by side on mobile) */}
        <div className={isMobile ? 'flex gap-2 w-full' : 'contents'}>
          <div className={isMobile ? 'flex-1' : 'w-[130px]'}>
            <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Channel</label>
            <select
              value={form.channel}
              onChange={e => handleChange('channel', e.target.value)}
              className="w-full text-sm px-2 py-2 rounded-lg outline-none"
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
            >
              {lists.channels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </div>

          <div className={isMobile ? 'flex-1' : 'w-[160px]'}>
            <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Source</label>
            <select
              value={form.lead_source}
              onChange={e => handleChange('lead_source', e.target.value)}
              className="w-full text-sm px-2 py-2 rounded-lg outline-none"
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
            >
              <option value="">Select Source</option>
              {lists.lead_sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Funnel label + Buttons row */}
        <div className={`flex items-center gap-2 ${isMobile ? 'w-full justify-between' : ''}`}>
          <span
            className="px-3 py-2 rounded-lg text-xs font-bold"
            style={{ background: 'rgba(37,99,235,0.06)', color: '#2563eb', border: '1.5px solid #2563eb' }}
          >
            → YTQ
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => doSave(false)}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: C.gold }}
            >
              {saving ? '...' : '+ Add'}
            </button>
            <button
              onClick={() => doSave(true)}
              disabled={saving}
              className="px-3 py-2 rounded-lg text-xs font-bold transition-all hover:bg-gray-50"
              style={{ border: `1px solid ${C.border}`, color: C.textMuted }}
            >
              Add & Close
            </button>
          </div>
        </div>
      </div>

      {/* Expanded row for Qualified */}
      {isQualified && (
        <div className="px-3 pb-3 pt-1 flex items-end gap-3 flex-wrap" style={{ background: 'rgba(22,163,74,0.03)', borderTop: `1px solid rgba(22,163,74,0.1)` }}>
          <div className="text-[10px] font-bold uppercase self-center" style={{ color: '#16a34a' }}>
            ↳ Qualified info
          </div>

          {/* Quality */}
          <div className="w-[110px]">
            <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Quality *</label>
            <select
              value={form.lead_quality}
              onChange={e => handleChange('lead_quality', e.target.value)}
              className="w-full text-sm px-2 py-2 rounded-lg outline-none"
              style={{ background: '#fff', border: `1px solid #86efac`, color: C.text }}
            >
              {LEAD_QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>

          {/* Name */}
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Name</label>
            <input
              type="text"
              placeholder="Client name"
              value={form.client_name}
              onChange={e => handleChange('client_name', e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg outline-none"
              style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }}
            />
          </div>

          {/* Notes */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>Notes</label>
            <input
              type="text"
              placeholder="Quick note..."
              value={form.notes}
              onChange={e => handleChange('notes', e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg outline-none"
              style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

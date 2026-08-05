/* ═══════════════════════════════════════════════════════════════════════════
   QUICK UPDATE MODAL — Fast updates for lead status, quality, etc.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react'
import { C, toast } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { Overlay, Field, Input, Select, Textarea, Btn } from './ui'
import { LEAD_STATUSES, LEAD_QUALITIES } from './constants'

export const QuickUpdateModal = ({ lead, onClose, onLeadUpdated, teamMembers = [] }) => {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    status: lead?.status || '',
    lead_quality: lead?.lead_quality || '',
    client_requirements: lead?.client_requirements || '',
    follow_up_date: lead?.follow_up_date || '',
    assignee_comments: lead?.assignee_comments || '',
    order_id: lead?.order_id || '',
    amount: lead?.amount || ''
  })

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      // Sanitize: convert empty strings to null for numeric DB columns
      const sanitized = { ...formData }
      if (sanitized.amount === '' || sanitized.amount === undefined) sanitized.amount = null
      else sanitized.amount = Number(sanitized.amount)
      ;['order_id','status','lead_quality','client_requirements','follow_up_date','assignee_comments'
      ].forEach(k => { if (sanitized[k] === '') sanitized[k] = null })

      const { error } = await supa
        .from('leads')
        .update(sanitized)
        .eq('id', lead.id)

      if (error) throw error

      toast(true, 'Lead updated successfully')
      onLeadUpdated?.()
      onClose()
    } catch (err) {
      console.error('Error updating lead:', err)
      toast(false, 'Failed to update lead')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div
        className="w-full sm:max-w-2xl mx-auto bg-white rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 flex justify-between items-center border-b" style={{ borderColor: C.border }}>
          <h2 className="text-xl font-bold" style={{ color: C.text }}>Quick Update: {lead?.client_name}</h2>
          <button onClick={onClose} className="text-2xl hover:opacity-60">×</button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Lead Status">
              <Select value={formData.status} onChange={e => handleChange('status', e.target.value)}>
                <option value="">Select Status</option>
                {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>

            <Field label="Lead Quality">
              <Select value={formData.lead_quality} onChange={e => handleChange('lead_quality', e.target.value)}>
                <option value="">Select Quality</option>
                {LEAD_QUALITIES.map(q => <option key={q} value={q}>{q}</option>)}
              </Select>
            </Field>

            <Field label="Follow-up Date">
              <Input
                type="date"
                value={formData.follow_up_date}
                onChange={e => handleChange('follow_up_date', e.target.value)}
              />
            </Field>

            <Field label="Order ID">
              <Input
                type="text"
                placeholder="Order ID"
                value={formData.order_id}
                onChange={e => handleChange('order_id', e.target.value)}
              />
            </Field>

            <Field label="Order Amount">
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Amount (INR)"
                value={formData.amount}
                onChange={e => handleChange('amount', e.target.value)}
              />
            </Field>
          </div>

          <Field label="Client Requirements">
            <Textarea
              rows={3}
              placeholder="Update requirements..."
              value={formData.client_requirements}
              onChange={e => handleChange('client_requirements', e.target.value)}
            />
          </Field>

          <Field label="Assignee Comments">
            <Textarea
              rows={3}
              placeholder="Add your notes..."
              value={formData.assignee_comments}
              onChange={e => handleChange('assignee_comments', e.target.value)}
            />
          </Field>
        </div>

        <div className="p-6 flex gap-3 justify-end border-t" style={{ borderColor: C.border }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Btn>
        </div>
      </div>
    </Overlay>
  )
}

import React, { useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { Overlay, Field, Select, Btn } from './ui'
import { ALTERATION_STATUSES } from './constants'

const AlterationDetailModal = ({ lineItem, onSave, onClose }) => {
  const [status, setStatus] = useState(lineItem.alteration_status || 'trial')
  const [comments, setComments] = useState(lineItem.alteration_comments || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await supa.from('order_line_items').update({
        alteration_status: status, alteration_comments: comments || null,
        production_stage: status === 'ready_to_ship' ? 'ready-to-ship' : 'alterations',
      }).eq('id', lineItem.id)
      toast(true, 'Alteration updated')
      onSave()
    } catch (e) {
      toast(false, 'Failed: ' + e.message)
    } finally { setSaving(false) }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full sm:max-w-md mx-4 p-6" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
        <h3 className="text-base font-bold mb-1" style={{ color: C.text }}>Alteration Detail</h3>
        <p className="text-xs mb-4" style={{ color: C.textMuted }}>{lineItem.title || lineItem.name}</p>

        <div className="space-y-4">
          <Field label="Trial Status">
            <Select value={status} onChange={e => setStatus(e.target.value)}>
              {ALTERATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          {status === 'alterations' && (
            <>
              <Field label="Comments">
                <textarea value={comments} onChange={e => setComments(e.target.value)} rows={4}
                  placeholder="Alteration notes…" className="w-full text-sm px-3 py-2.5 rounded-xl outline-none resize-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
              </Field>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
        </div>
      </div>
    </Overlay>
  )
}

export default AlterationDetailModal

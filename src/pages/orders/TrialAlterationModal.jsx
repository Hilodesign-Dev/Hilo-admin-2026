import React, { useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { checkAutoAdvance } from '../../lib/stateMachine'
import { Overlay, Badge, Btn, Select } from './ui'
import { ALTERATION_STATUSES } from './constants'

const TrialAlterationModal = ({ order, lineItems, onSave, onClose }) => {
  const [selected, setSelected] = useState(() => new Set())
  const [itemData, setItemData] = useState(() => {
    const map = {}
    lineItems.forEach(li => { map[li.id] = { comments: li.alteration_comments || '', file: li.alteration_file || '' } })
    return map
  })
  const [status, setStatus] = useState('trial')
  const [saving, setSaving] = useState(false)

  const toggleItem = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleAll = () => {
    if (selected.size === lineItems.length) setSelected(new Set())
    else setSelected(new Set(lineItems.map(li => li.id)))
  }

  const handleSave = async () => {
    if (selected.size === 0) { toast(false, 'Select at least one line item'); return }
    if (!confirm('Update alteration status for selected items?')) return
    setSaving(true)
    try {
      for (const liId of selected) {
        const d = itemData[liId] || {}
        await supa.from('order_line_items').update({
          alteration_status: status,
          alteration_comments: d.comments || null,
          alteration_file: d.file || null,
          production_stage: status === 'ready_to_ship' ? 'ready' : status === 'trial' || status === 'second_trial' ? 'trials' : 'alterations',
        }).eq('id', liId)
      }
      // Check if all items are now ready → auto-advance order
      await checkAutoAdvance(order.id)
      toast(true, 'Alteration status updated')
      onSave()
    } catch (e) {
      console.error('Trial/alteration error:', e)
      toast(false, 'Failed: ' + e.message)
    } finally { setSaving(false) }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-4xl mx-0 sm:mx-4 max-h-[94vh] overflow-y-auto" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
        <div className="sticky top-0 z-10 bg-white px-5 sm:px-7 py-4 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: C.text }}>Trial & Alteration</h2>
            <span className="text-sm font-mono font-bold" style={{ color: C.goldDark }}>{order.order_number}</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 sm:px-7 py-5 space-y-4">
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider items-center" style={{ background: C.bg, color: C.textMuted }}>
              <div className="col-span-1">
                <input type="checkbox" checked={selected.size === lineItems.length} onChange={toggleAll} className="rounded" />
              </div>
              <div className="col-span-4">Product</div>
              <div className="col-span-5">Comments</div>
              <div className="col-span-2">Current Status</div>
            </div>
            {lineItems.map(li => (
              <div key={li.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center" style={{ borderTop: `1px solid ${C.borderLight}` }}>
                <div className="col-span-1">
                  <input type="checkbox" checked={selected.has(li.id)} onChange={() => toggleItem(li.id)} className="rounded" />
                </div>
                <div className="col-span-4 text-sm" style={{ color: C.text }}>{li.title || li.name}</div>
                <div className="col-span-5">
                  <textarea value={(itemData[li.id] || {}).comments || ''} onChange={e => setItemData(prev => ({ ...prev, [li.id]: { ...prev[li.id], comments: e.target.value } }))}
                    rows={2} placeholder="Alteration notes…" className="w-full text-xs px-3 py-2 rounded-lg outline-none resize-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
                </div>
                <div className="col-span-2">
                  {li.alteration_status ? <Badge color={C.amber}>{li.alteration_status.replace(/_/g, ' ')}</Badge> : <span className="text-xs" style={{ color: C.textLight }}>—</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs" style={{ color: C.textMuted }}>{selected.size} item{selected.size !== 1 ? 's' : ''} selected</div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold uppercase" style={{ color: C.textMuted }}>Set Status:</span>
              <Select value={status} onChange={e => setStatus(e.target.value)} style={{ width: 180 }}>
                {ALTERATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white px-5 sm:px-7 py-4 border-t flex justify-end gap-3" style={{ borderColor: C.border }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Update Status'}</Btn>
        </div>
      </div>
    </Overlay>
  )
}

export default TrialAlterationModal

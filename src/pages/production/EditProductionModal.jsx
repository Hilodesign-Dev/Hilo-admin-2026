import React, { useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, SIZES, DELIVERY_TYPES } from '../../lib/designTokens'

const ORDER_TYPES = ['General', 'Custom']
const URGENCY_LEVELS = ['Urgent', 'Very Important', 'Other']

const Overlay = ({ onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>{children}</div>
)

const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#4e4636', letterSpacing: '0.06em' }}>
      {label}{required && <span style={{ color: C.red }}> *</span>}
    </label>
    {children}
  </div>
)

const Input = (props) => (
  <input {...props} className={`w-full text-sm px-3 py-2.5 rounded-xl outline-none transition-colors focus:ring-2 focus:ring-amber-200 ${props.className || ''}`} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, ...props.style }} />
)

const Select = ({ value, onChange, children, ...rest }) => (
  <select value={value} onChange={onChange} {...rest} className={`w-full text-sm px-3 py-2.5 rounded-xl outline-none transition-colors focus:ring-2 focus:ring-amber-200 ${rest.className || ''}`} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, ...rest.style }}>
    {children}
  </select>
)

const Btn = ({ children, onClick, primary, danger, small, disabled, ...rest }) => {
  const base = 'font-bold rounded-xl transition-all inline-flex items-center justify-center gap-1.5'
  const sz = small ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2.5'
  const clr = danger
    ? `text-white ${disabled ? 'opacity-40' : 'hover:opacity-90'}`
    : primary
      ? `text-white ${disabled ? 'opacity-40' : 'hover:opacity-90'}`
      : `${disabled ? 'opacity-40' : 'hover:bg-gray-50'}`
  const bg = danger ? C.red : primary ? C.gold : 'transparent'
  return <button onClick={onClick} disabled={disabled} className={`${base} ${sz} ${clr}`} style={{ background: bg, border: primary || danger ? 'none' : `1px solid ${C.border}`, color: primary || danger ? '#fff' : C.text, ...rest.style }} {...rest}>{children}</button>
}

const EditProductionModal = ({ item, onSave, onClose }) => {
  const [form, setForm] = useState({
    title: item.title || '',
    sku: item.sku || '',
    size: item.size || '',
    delivery_type: item.delivery_type || '',
    type: item.type || 'General',
    urgency: item.urgency || 'Other',
    est_shipping_date: item.est_shipping_date || '',
    custom_requirements: item.custom_requirements || '',
  })
  const [saving, setSaving] = useState(false)

  const fld = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supa.from('order_line_items').update(form).eq('id', item.id)
      if (error) throw error
      toast(true, 'Production item updated')
      onSave()
    } catch (e) {
      console.error('Update error:', e)
      toast(false, 'Failed to update: ' + e.message)
    } finally { setSaving(false) }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl mx-0 sm:mx-4 max-h-[94vh] overflow-y-auto" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
        <div className="sticky top-0 z-10 bg-white px-5 sm:px-7 py-4 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <h2 className="text-lg font-bold" style={{ color: C.text }}>Edit Production Item</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 sm:px-7 py-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Product Name" required>
              <Input value={form.title} onChange={e => fld('title', e.target.value)} placeholder="Product name" />
            </Field>
            <Field label="Style Code / SKU" required>
              <Input value={form.sku} onChange={e => fld('sku', e.target.value)} placeholder="SKU" />
            </Field>
            <Field label="Size">
              <Select value={form.size} onChange={e => fld('size', e.target.value)}>
                <option value="">Select…</option>
                {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Delivery Type">
              <Select value={form.delivery_type} onChange={e => fld('delivery_type', e.target.value)}>
                <option value="">Select…</option>
                {DELIVERY_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={form.type} onChange={e => fld('type', e.target.value)}>
                {ORDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Urgency">
              <Select value={form.urgency} onChange={e => fld('urgency', e.target.value)}>
                {URGENCY_LEVELS.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
            <Field label="Est. Shipping Date">
              <Input type="date" value={form.est_shipping_date} onChange={e => fld('est_shipping_date', e.target.value)} />
            </Field>
          </div>

          <div>
            <Field label="Custom Requirements">
              <textarea value={form.custom_requirements} onChange={e => fld('custom_requirements', e.target.value)}
                rows={4} placeholder="Any custom requirements, notes, or specifications…" className="w-full text-sm px-3 py-2 rounded-xl outline-none resize-none focus:ring-2 focus:ring-amber-200" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
            </Field>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white px-5 sm:px-7 py-4 border-t flex justify-end gap-3" style={{ borderColor: C.border }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
        </div>
      </div>
    </Overlay>
  )
}

export default EditProductionModal

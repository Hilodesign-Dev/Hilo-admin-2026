import React, { useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { Overlay, Field, Input, Select, Btn } from './ui'
import { FULFILLMENT_TYPES, SHIPPER_MAP } from './constants'

const FulfillOrderModal = ({ order, lineItems, teamMembers, onSave, onClose }) => {
  const detectFulfillType = () => {
    if (lineItems[0]?.fulfillment_type) return lineItems[0].fulfillment_type
    if (order.fulfillment_type) return order.fulfillment_type
    return 'Domestic courier'
  }

  const [form, setForm] = useState({
    delivery_date: new Date().toISOString().slice(0, 10),
    fulfillment_type: detectFulfillType(), shipper: lineItems[0]?.shipper || '',
    awb: '', contact: '', employee_poc: '', comments: '', partial_complete: 'Complete',
  })
  const [selected, setSelected] = useState(() => new Set(lineItems.map(li => li.id)))
  const [saving, setSaving] = useState(false)

  const fld = (k, v) => setForm(prev => {
    const next = { ...prev, [k]: v }
    if (k === 'fulfillment_type') next.shipper = ''
    return next
  })

  const toggleItem = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleAll = () => {
    if (selected.size === lineItems.length) setSelected(new Set())
    else setSelected(new Set(lineItems.map(li => li.id)))
  }

  const needsAWB = form.fulfillment_type === 'Domestic courier' || form.fulfillment_type === 'International courier'
  const needsContact = form.fulfillment_type === 'Store pickup' || form.fulfillment_type === 'Manual delivery'
  const shippers = form.fulfillment_type ? (SHIPPER_MAP[form.fulfillment_type] || []) : []

  const handleSave = async () => {
    if (selected.size === 0) { toast(false, 'Select at least one line item'); return }
    if (!form.fulfillment_type) { toast(false, 'Fulfillment type is required'); return }
    if (!form.shipper) { toast(false, 'Shipper is required'); return }
    if (needsAWB && !form.awb.trim()) { toast(false, 'AWB/Tracking number is required'); return }
    if (needsContact && !form.contact.trim()) { toast(false, 'Contact person is required'); return }
    if (needsContact && !form.employee_poc) { toast(false, 'Employee POC is required'); return }
    if (!confirm('Fulfill selected items?')) return
    setSaving(true)
    try {
      // Update selected line items with fulfillment data + mark shipped
      for (const liId of selected) {
        const { error: liErr } = await supa.from('order_line_items').update({
          fulfillment_type: form.fulfillment_type, shipper: form.shipper,
          awb: form.awb || null, fulfillment_contact: form.contact || null,
          fulfillment_comments: form.comments || null, fulfillment_user: form.employee_poc || null,
          fulfillment_date: form.delivery_date || null,
          production_stage: 'shipped',
        }).eq('id', liId)
        if (liErr) throw new Error('Failed to update line item ' + liId + ': ' + liErr.message)
      }
      const allFulfilled = selected.size === lineItems.length
      // Dispatch: order → dispatched, all items shipped
      const { error: ordErr } = await supa.from('shopify_orders').update({
        fulfillment_status: allFulfilled ? 'fulfilled' : 'partial',
        order_status: allFulfilled ? 'fulfilled' : 'ready-to-dispatch',
        fulfillment_type: form.fulfillment_type, shipper: form.shipper,
      }).eq('id', order.id)
      if (ordErr) throw new Error('Failed to update order: ' + ordErr.message)

      toast(true, 'Order dispatched — items marked as Shipped')
      onSave()
    } catch (e) {
      console.error('Fulfill error:', e)
      toast(false, 'Failed to fulfill: ' + e.message)
    } finally { setSaving(false) }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-5xl mx-0 sm:mx-4 max-h-[94vh] overflow-y-auto" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
        <div className="sticky top-0 z-10 bg-white px-5 sm:px-7 py-4 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: C.text }}>Fulfill Order</h2>
            <span className="text-sm font-mono font-bold" style={{ color: C.goldDark }}>{order.order_number}</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 sm:px-7 py-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Delivery Date" required>
              <Input type="date" value={form.delivery_date} onChange={e => fld('delivery_date', e.target.value)} />
            </Field>
            <Field label="Fulfillment Type" required>
              <Select value={form.fulfillment_type} onChange={e => fld('fulfillment_type', e.target.value)}>
                <option value="">Select…</option>
                {FULFILLMENT_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
              </Select>
            </Field>
            <Field label="Shipper" required>
              <Select value={form.shipper} onChange={e => fld('shipper', e.target.value)} disabled={!form.fulfillment_type}>
                <option value="">Select…</option>
                {shippers.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            {needsAWB && (
              <Field label="AWB / Tracking #" required>
                <Input value={form.awb} onChange={e => fld('awb', e.target.value)} placeholder="Tracking number" />
              </Field>
            )}
            {needsContact && (
              <>
                <Field label="Contact Person" required>
                  <Input value={form.contact} onChange={e => fld('contact', e.target.value)} placeholder="Contact" />
                </Field>
                <Field label="Employee POC" required>
                  <Select value={form.employee_poc} onChange={e => fld('employee_poc', e.target.value)}>
                    <option value="">Select…</option>
                    {teamMembers.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                  </Select>
                </Field>
              </>
            )}
            <Field label="Comments">
              <Input value={form.comments} onChange={e => fld('comments', e.target.value)} placeholder="Notes…" />
            </Field>
            <Field label="Partial / Complete">
              <Select value={form.partial_complete} onChange={e => fld('partial_complete', e.target.value)}>
                <option value="Complete">Complete</option>
                <option value="Partial">Partial</option>
              </Select>
            </Field>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider items-center" style={{ background: C.bg, color: C.textMuted }}>
              <div className="col-span-1">
                <input type="checkbox" checked={selected.size === lineItems.length} onChange={toggleAll} className="rounded" />
              </div>
              <div className="col-span-4">Product</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-2">Fulfillment</div>
              <div className="col-span-2">Shipper</div>
              <div className="col-span-2">AWB</div>
            </div>
            {lineItems.map(li => (
              <div key={li.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center" style={{ borderTop: `1px solid ${C.borderLight}` }}>
                <div className="col-span-1">
                  <input type="checkbox" checked={selected.has(li.id)} onChange={() => toggleItem(li.id)} className="rounded" />
                </div>
                <div className="col-span-4 text-sm" style={{ color: C.text }}>{li.title || li.name}</div>
                <div className="col-span-1 text-sm font-mono" style={{ color: C.text }}>{li.quantity}</div>
                <div className="col-span-2 text-xs" style={{ color: C.textMuted }}>{li.fulfillment_type || '—'}</div>
                <div className="col-span-2 text-xs" style={{ color: C.textMuted }}>{li.shipper || '—'}</div>
                <div className="col-span-2 text-xs font-mono" style={{ color: C.textMuted }}>{li.awb || '—'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white px-5 sm:px-7 py-4 border-t flex justify-end gap-3" style={{ borderColor: C.border }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={handleSave} disabled={saving}>{saving ? 'Fulfilling…' : `Fulfill ${selected.size} Item${selected.size !== 1 ? 's' : ''}`}</Btn>
        </div>
      </div>
    </Overlay>
  )
}

export default FulfillOrderModal

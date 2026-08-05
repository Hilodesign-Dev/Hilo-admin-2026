import React, { useState, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, fmtDate } from '../../lib/designTokens'
import { mirrorExpenseEntry } from '../../lib/mirrorPayment'
import { PAYMENT_MODES } from './constants'

const Overlay = ({ onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    {children}
  </div>
)

const Field = ({ label, required, children }) => (
  <div className="mb-4">
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

const ExpenseForm = ({ accounts, initialData, onSave, onClose }) => {
  const [form, setForm] = useState(initialData || {
    date: new Date().toISOString().split('T')[0],
    account_id: '',
    description: '',
    amount: '',
    gst_amount: '',
    payment_mode: '',
    reference: '',
    vendor_name: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  // Group accounts by type using the database group_type field
  const directAccounts = (accounts || []).filter(a => a.group_type === 'direct')
  const indirectAccounts = (accounts || []).filter(a => a.group_type === 'indirect')

  const fld = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const validate = () => {
    if (!form.date) return 'Date is required'
    if (!form.account_id) return 'Account is required'
    if (!form.description.trim()) return 'Description is required'
    if (!form.amount || parseFloat(form.amount) <= 0) return 'Amount must be > 0'
    if (!form.payment_mode) return 'Payment Mode is required'
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { toast(false, err); return }

    setSaving(true)
    try {
      const payload = {
        date: form.date,
        account_id: form.account_id,
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        gst_amount: form.gst_amount ? parseFloat(form.gst_amount) : 0,
        payment_mode: form.payment_mode,
        reference: form.reference || null,
        vendor_name: form.vendor_name || null,
        notes: form.notes || null,
        entered_by: window._currentUserEmail || 'system',
      }

      if (initialData?.id) {
        const { error } = await supa.from('expense_entries').update(payload).eq('id', initialData.id)
        if (error) throw error
        // Mirror to expense_mirror
        const acct = (accounts || []).find(a => a.id === payload.account_id)
        mirrorExpenseEntry({ ...payload, id: initialData.id }, acct?.name || 'General')
        toast(true, 'Expense updated')
      } else {
        const { data: inserted, error } = await supa.from('expense_entries').insert([payload]).select()
        if (error) throw error
        // Mirror to expense_mirror
        if (inserted?.[0]) {
          const acct = (accounts || []).find(a => a.id === payload.account_id)
          mirrorExpenseEntry(inserted[0], acct?.name || 'General')
        }
        toast(true, 'Expense added')
      }
      onSave()
    } catch (e) {
      console.error('Save error:', e)
      toast(false, 'Failed to save expense')
    } finally { setSaving(false) }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full sm:w-[500px] max-h-[90vh] overflow-y-auto p-6 shadow-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
        <h2 className="text-lg font-bold mb-6" style={{ color: C.text }}>
          {initialData?.id ? 'Edit Expense' : 'Add Expense'}
        </h2>

        <Field label="Date" required>
          <Input type="date" value={form.date} onChange={e => fld('date', e.target.value)} />
        </Field>

        <Field label="Account" required>
          <Select value={form.account_id} onChange={e => fld('account_id', e.target.value)}>
            <option value="">Select Account</option>
            <optgroup label="Direct Expenses">
              {directAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </optgroup>
            <optgroup label="Indirect Expenses">
              {indirectAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </optgroup>
          </Select>
        </Field>

        <Field label="Description" required>
          <Input type="text" placeholder="e.g. Monthly rent for production facility" value={form.description} onChange={e => fld('description', e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (Ex-GST)" required>
            <Input type="number" placeholder="0" step="0.01" value={form.amount} onChange={e => fld('amount', e.target.value)} />
          </Field>
          <Field label="GST Amount">
            <Input type="number" placeholder="0" step="0.01" value={form.gst_amount} onChange={e => fld('gst_amount', e.target.value)} />
          </Field>
        </div>

        <Field label="Payment Mode" required>
          <Select value={form.payment_mode} onChange={e => fld('payment_mode', e.target.value)}>
            <option value="">Select Mode</option>
            {PAYMENT_MODES.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </Select>
        </Field>

        <Field label="Reference / UTR">
          <Input type="text" placeholder="Transaction reference" value={form.reference} onChange={e => fld('reference', e.target.value)} />
        </Field>

        <Field label="Vendor / Payee">
          <Input type="text" placeholder="Who received the payment" value={form.vendor_name} onChange={e => fld('vendor_name', e.target.value)} />
        </Field>

        <Field label="Notes">
          <textarea className="w-full text-sm px-3 py-2.5 rounded-xl outline-none transition-colors focus:ring-2 focus:ring-amber-200 resize-none" rows="3" placeholder="Additional notes" value={form.notes} onChange={e => fld('notes', e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
        </Field>

        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} disabled={saving} className="flex-1 font-bold rounded-xl transition-all text-white py-2.5" style={{ background: C.gold, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={onClose} className="flex-1 font-bold rounded-xl transition-all py-2.5" style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}` }}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}

export default ExpenseForm

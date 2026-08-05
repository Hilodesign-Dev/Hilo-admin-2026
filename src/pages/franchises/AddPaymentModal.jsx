import React, { useMemo, useRef, useState } from 'react'
import { supa } from '../../lib/supabase'

const todayIso = () => new Date().toISOString().slice(0, 10)
const fmtSize = (b) => b < 1024 ? `${b} B` : b < 1024*1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/1024/1024).toFixed(1)} MB`

const METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash',          label: 'Cash' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'upi',           label: 'UPI' },
  { value: 'card',          label: 'Card' },
  { value: 'other',         label: 'Other' },
]

export default function AddPaymentModal({
  franchise, categories = [], previousPayments = [],
  prefillCategoryId = null, user, onClose, onSaved,
}) {
  const [paid_on, setPaid_on]     = useState(todayIso())
  const [amount, setAmount]       = useState('')
  const [category_id, setCategoryId] = useState(prefillCategoryId || categories[0]?.id || '')
  const [subcategory, setSubcategory] = useState('')
  const [payee_name, setPayeeName]    = useState('')
  const [method, setMethod]       = useState('bank_transfer')
  const [reference, setReference] = useState('')
  const [notes, setNotes]         = useState('')
  const [file, setFile]           = useState(null)
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')
  const fileRef = useRef(null)

  // Autocomplete subcategory + payee from past payments (scoped to selected category for subcat)
  const subcatSuggestions = useMemo(() => {
    const s = new Set()
    previousPayments
      .filter(p => !category_id || p.category_id === category_id)
      .forEach(p => { if (p.subcategory) s.add(p.subcategory) })
    return Array.from(s).sort()
  }, [previousPayments, category_id])

  const payeeSuggestions = useMemo(() => {
    const s = new Set()
    previousPayments.forEach(p => { if (p.payee_name) s.add(p.payee_name) })
    return Array.from(s).sort()
  }, [previousPayments])

  const pickFile = () => fileRef.current?.click()
  const onFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) { setErr('File must be under 10 MB'); return }
    setErr('')
    setFile(f)
  }

  const submit = async () => {
    setErr('')
    const amt = Number(amount)
    if (!amt || amt <= 0) { setErr('Enter a positive amount'); return }
    if (!paid_on)         { setErr('Pick a date'); return }
    if (!payee_name.trim()){ setErr('Enter the payee name'); return }
    setSaving(true)

    try {
      // Upload invoice if present
      let invoice_url = null
      if (file) {
        const ext = file.name.split('.').pop().toLowerCase()
        const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
        const path = `${franchise.code || franchise.id}/${Date.now()}-${safeName}`
        const { error: upErr } = await supa.storage.from('franchise-invoices')
          .upload(path, file, { contentType: file.type, upsert: false })
        if (upErr) throw upErr
        const { data: signed } = await supa.storage.from('franchise-invoices').createSignedUrl(path, 60 * 60 * 24 * 365 * 5) // 5 years
        invoice_url = signed?.signedUrl || null
      }

      const { error } = await supa.from('franchise_disbursements').insert([{
        franchise_id: franchise.id,
        category_id: category_id || null,
        subcategory: subcategory.trim() || null,
        payee_name: payee_name.trim(),
        paid_on,
        amount: amt,
        method,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        invoice_url,
        created_by_name: user?.email?.split('@')[0] || 'Hilo team',
      }])
      if (error) throw error
      onSaved && onSaved()
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-extrabold text-gray-800">Add Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>
        <div className="text-xs text-gray-500 mb-5">Money paid out on behalf of {franchise.display_name}</div>

        <div className="space-y-3">
          <Field label="Amount">
            <input type="text" inputMode="decimal" autoFocus
              value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="2,00,000"
              className="w-full px-3 py-2.5 text-base rounded-lg border border-gray-200 font-mono text-right font-bold" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select value={category_id} onChange={e => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white">
                <option value="">— No bucket —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Sub-category">
              <input list="payment-subcat-opts" value={subcategory} onChange={e => setSubcategory(e.target.value)}
                placeholder="Tiles · Electrical · Catalog…"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200" />
              <datalist id="payment-subcat-opts">
                {subcatSuggestions.map(s => <option key={s} value={s} />)}
              </datalist>
            </Field>
          </div>

          <Field label="Payee">
            <input list="payment-payee-opts" value={payee_name} onChange={e => setPayeeName(e.target.value)}
              placeholder="ABC Interiors Pvt Ltd / Landlord name"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200" />
            <datalist id="payment-payee-opts">
              {payeeSuggestions.map(p => <option key={p} value={p} />)}
            </datalist>
          </Field>

          <Field label="Method">
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(m => (
                <button key={m.value} type="button" onClick={() => setMethod(m.value)}
                  className="text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors"
                  style={{
                    background: method === m.value ? '#fef3c7' : '#fff',
                    borderColor: method === m.value ? '#c9a432' : '#e5e7eb',
                    color: method === m.value ? '#92400e' : '#374151',
                  }}>{m.label}</button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date paid">
              <input type="date" value={paid_on} onChange={e => setPaid_on(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200" />
            </Field>
            <Field label="Reference (optional)">
              <input value={reference} onChange={e => setReference(e.target.value)} placeholder="UTR / invoice #"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 font-mono" />
            </Field>
          </div>

          <Field label="Invoice / bill (optional)">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onFile} className="hidden" />
            {file ? (
              <div className="flex items-center gap-2 px-3 py-2 border border-amber-200 bg-amber-50/40 rounded-lg">
                <svg className="w-4 h-4 text-amber-700 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-gray-800 truncate">{file.name}</div>
                  <div className="text-[10px] text-gray-500">{fmtSize(file.size)}</div>
                </div>
                <button type="button" onClick={() => setFile(null)} className="text-xs text-red-600 hover:underline">Remove</button>
              </div>
            ) : (
              <button type="button" onClick={pickFile}
                className="w-full px-3 py-2.5 text-xs text-gray-500 hover:text-amber-700 border-2 border-dashed border-gray-200 hover:border-amber-300 rounded-lg transition-colors flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                Upload invoice (PDF, JPG, PNG · up to 10 MB)
              </button>
            )}
          </Field>

          <Field label="Notes (optional)">
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional context"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200" />
          </Field>
        </div>

        {err && <div className="mt-3 text-xs text-red-600">{err}</div>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="text-sm px-4 py-2 rounded-lg font-bold"
            style={{ background: saving ? '#9ca3af' : '#c9a432', color: '#fff' }}>
            {saving ? 'Saving…' : 'Save payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, children }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{label}</div>
    {children}
  </div>
)

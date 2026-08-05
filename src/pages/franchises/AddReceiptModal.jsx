import React, { useState } from 'react'
import { supa } from '../../lib/supabase'

const todayIso = () => new Date().toISOString().slice(0, 10)

/* Minimal receipt entry: Date · Amount · Method · Reference.
   Tranche + Category are intentionally NOT here — the waterfall on the
   Receipts tab auto-allocates T0→T1→T2 as receipts come in, and category
   tracking lives in the Disbursements tab. */

const METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer / NEFT' },
  { value: 'cash_deposit',  label: 'Cash Deposit' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'upi',           label: 'UPI' },
  { value: 'other',         label: 'Other' },
]

export default function AddReceiptModal({ franchise, user, onClose, onSaved }) {
  const [received_on, setReceived_on] = useState(todayIso())
  const [amount, setAmount]            = useState('')
  const [method, setMethod]            = useState('bank_transfer')
  const [reference, setReference]      = useState('')
  const [saving, setSaving]            = useState(false)
  const [err, setErr]                  = useState('')

  const submit = async () => {
    setErr('')
    const amt = Number(amount)
    if (!amt || amt <= 0) { setErr('Enter a positive amount'); return }
    if (!received_on)     { setErr('Pick a date'); return }
    setSaving(true)
    const { error } = await supa.from('franchise_receipts').insert([{
      franchise_id: franchise.id,
      received_on,
      amount: amt,
      method,
      reference: reference.trim() || null,
      created_by_name: user?.email?.split('@')[0] || 'Hilo team',
    }])
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved && onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-extrabold text-gray-800">Add Receipt</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>
        <div className="text-xs text-gray-500 mb-5">{franchise.display_name}</div>

        <div className="space-y-3">
          <Field label="Amount">
            <input
              type="text" inputMode="decimal" autoFocus
              value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="5,00,000"
              className="w-full px-3 py-2.5 text-base rounded-lg border border-gray-200 font-mono text-right font-bold"
            />
          </Field>

          <Field label="Method">
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className="text-xs px-3 py-2 rounded-lg border font-semibold transition-colors text-left"
                  style={{
                    background: method === m.value ? '#fef3c7' : '#fff',
                    borderColor: method === m.value ? '#c9a432' : '#e5e7eb',
                    color: method === m.value ? '#92400e' : '#374151',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date received">
              <input type="date" value={received_on} onChange={e => setReceived_on(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200" />
            </Field>
            <Field label="Reference (optional)">
              <input value={reference} onChange={e => setReference(e.target.value)}
                placeholder="UTR / cheque no."
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 font-mono" />
            </Field>
          </div>
        </div>

        {err && <div className="mt-3 text-xs text-red-600">{err}</div>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="text-sm px-4 py-2 rounded-lg font-bold"
            style={{ background: saving ? '#9ca3af' : '#c9a432', color: '#fff' }}>
            {saving ? 'Saving…' : 'Save receipt'}
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

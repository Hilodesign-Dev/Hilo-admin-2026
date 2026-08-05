/* ═══════════════════════════════════════════════════════════════════════════
   RETURNS & EXCHANGES — Refunds Ledger
   ═══════════════════════════════════════════════════════════════════════════
   Table/ledger of all refund_payments with status tracking:
     • Pending  — refund created, payment not yet made
     • Paid     — money sent, waiting for bank settlement
     • Settled  — matched against bank statement
   Editable: payment details (bank/UPI/ref) + Mark Paid action.
   Settlement happens via bank statement (BankStatementTab).
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, fmtCurrency, toast } from '../../lib/designTokens'
import { Overlay, Field, Input, Select, Btn } from '../orders/ui'
import { REFUND_PAYMENT_METHODS } from './constants'

const todayISO = () => new Date().toISOString().slice(0, 10)
const n = (v) => Number(v) || 0
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_PILLS = {
  pending:  { label: 'Pending',  color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  paid:     { label: 'Paid',     color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  settled:  { label: 'Settled',  color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
}

const FILTER_TABS = [
  { key: 'all',     label: 'All'     },
  { key: 'pending', label: 'Pending' },
  { key: 'paid',    label: 'Paid'    },
  { key: 'settled', label: 'Settled' },
]

const RefundPaymentsView = ({ user }) => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [editRow, setEditRow] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supa
      .from('refund_payments')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) toast(false, 'Failed to load refunds: ' + error.message)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter(r => (r.payment_status || 'pending') === filter)
  }, [rows, filter])

  const totals = useMemo(() => {
    const pending = rows.filter(r => (r.payment_status || 'pending') === 'pending').reduce((s, r) => s + n(r.amount), 0)
    const paid = rows.filter(r => r.payment_status === 'paid').reduce((s, r) => s + n(r.amount), 0)
    const settled = rows.filter(r => r.payment_status === 'settled').reduce((s, r) => s + n(r.amount), 0)
    return { pending, paid, settled, total: pending + paid + settled }
  }, [rows])

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Refunds', value: totals.total, color: C.text },
          { label: 'Pending', value: totals.pending, color: '#d97706' },
          { label: 'Paid', value: totals.paid, color: '#2563eb' },
          { label: 'Settled', value: totals.settled, color: '#16a34a' },
        ].map(c => (
          <div key={c.label} className="rounded-xl px-3 py-3" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>{c.label}</div>
            <div className="text-lg font-bold font-mono mt-0.5" style={{ color: c.color }}>{fmtCurrency(c.value)}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {FILTER_TABS.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: filter === t.key ? C.goldDark : 'transparent',
              color: filter === t.key ? '#fff' : C.textMuted,
              border: `1px solid ${filter === t.key ? C.goldDark : C.border}`,
            }}>
            {t.label}
            {t.key !== 'all' && (
              <span className="ml-1 opacity-60">
                ({rows.filter(r => (r.payment_status || 'pending') === t.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm py-12 text-center" style={{ color: C.textMuted }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl text-center py-12 text-sm" style={{ color: C.textMuted, background: C.cardBg, border: `1px solid ${C.border}` }}>
          No refunds found.
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          {/* Header */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ background: C.bg, color: C.textMuted }}>
            <div className="col-span-2">Refund ID</div>
            <div className="col-span-2">Order / Customer</div>
            <div className="col-span-2 text-right">Amount</div>
            <div className="col-span-2">Method / Details</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2 text-right">Status</div>
          </div>

          {filtered.map(r => {
            const ps = STATUS_PILLS[r.payment_status || 'pending'] || STATUS_PILLS.pending
            return (
              <button key={r.id} onClick={() => setEditRow(r)}
                className="w-full text-left grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 px-3 py-3 sm:py-2.5 items-center transition-all hover:bg-gray-50"
                style={{ borderTop: `1px solid ${C.borderLight}` }}>

                {/* Refund ID */}
                <div className="sm:col-span-2">
                  <div className="text-xs font-bold font-mono" style={{ color: C.text }}>{r.id}</div>
                  <div className="text-[10px] font-mono" style={{ color: C.textMuted }}>{r.return_request_id || ''}</div>
                </div>

                {/* Order / Customer */}
                <div className="sm:col-span-2">
                  <div className="text-xs font-mono" style={{ color: C.goldDark }}>{r.order_number || '—'}</div>
                  <div className="text-[11px]" style={{ color: C.textMuted }}>{r.customer_name || '—'}</div>
                </div>

                {/* Amount */}
                <div className="sm:col-span-2 text-right">
                  <div className="text-sm font-bold font-mono" style={{ color: C.text }}>{fmtCurrency(r.amount)}</div>
                </div>

                {/* Method / Details */}
                <div className="sm:col-span-2">
                  <div className="text-xs" style={{ color: C.text }}>
                    {REFUND_PAYMENT_METHODS.find(m => m.key === (r.refund_method || r.method))?.label || r.refund_method || r.method || '—'}
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: C.textMuted }}>
                    {r.upi_id || r.account_no || r.reference || '—'}
                  </div>
                </div>

                {/* Date */}
                <div className="sm:col-span-2">
                  <div className="text-xs" style={{ color: C.text }}>{r.paid_on ? fmtDate(r.paid_on) : '—'}</div>
                  <div className="text-[10px]" style={{ color: C.textMuted }}>Created {fmtDate(r.created_at)}</div>
                </div>

                {/* Status */}
                <div className="sm:col-span-2 text-right">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                    style={{ color: ps.color, background: ps.bg }}>{ps.label}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {editRow && (
        <EditRefundModal
          refund={editRow}
          user={user}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); load() }}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Edit Refund Modal — edit payment details + Mark Paid
   ═══════════════════════════════════════════════════════════════════════════ */
const EditRefundModal = ({ refund, user, onClose, onSaved }) => {
  const isPending = (refund.payment_status || 'pending') === 'pending'
  const isPaid = refund.payment_status === 'paid'
  const isSettled = refund.payment_status === 'settled'

  const [method, setMethod]     = useState(refund.refund_method || refund.method || 'bank_transfer')
  const [upiId, setUpiId]       = useState(refund.upi_id || '')
  const [bankName, setBankName] = useState(refund.bank_name || '')
  const [accountNo, setAccountNo] = useState(refund.account_no || '')
  const [ifsc, setIfsc]         = useState(refund.ifsc || '')
  const [reference, setRef]     = useState(refund.reference || '')
  const [paidOn, setPaidOn]     = useState(refund.paid_on || todayISO())
  const [notes, setNotes]       = useState(refund.notes || '')
  const [working, setWorking]   = useState(false)

  const save = async () => {
    setWorking(true)
    const { error } = await supa.from('refund_payments').update({
      refund_method: method,
      method: method,
      upi_id: upiId || null,
      bank_name: bankName || null,
      account_no: accountNo || null,
      ifsc: ifsc || null,
      reference: reference || null,
      notes: notes || null,
    }).eq('id', refund.id)
    setWorking(false)
    if (error) { toast(false, 'Save failed: ' + error.message); return }
    toast(true, 'Refund details updated')
    onSaved?.()
  }

  const markPaid = async () => {
    setWorking(true)
    const { error } = await supa.from('refund_payments').update({
      payment_status: 'paid',
      paid_on: paidOn || todayISO(),
      refund_method: method,
      method: method,
      upi_id: upiId || null,
      bank_name: bankName || null,
      account_no: accountNo || null,
      ifsc: ifsc || null,
      reference: reference || null,
      notes: notes || null,
    }).eq('id', refund.id)

    if (!error) {
      // Also update the return_request's refund_paid
      const settled = refund.settled_returns || []
      for (const s of settled) {
        if (!s.return_request_id) continue
        const { data: rr } = await supa.from('return_requests')
          .select('refund_paid, refund_amount')
          .eq('id', s.return_request_id)
          .maybeSingle()
        if (rr) {
          await supa.from('return_requests').update({
            refund_paid: n(rr.refund_paid) + n(s.amount),
          }).eq('id', s.return_request_id)
        }
      }
    }

    setWorking(false)
    if (error) { toast(false, 'Failed: ' + error.message); return }
    toast(true, 'Refund marked as paid')
    onSaved?.()
  }

  const ps = STATUS_PILLS[refund.payment_status || 'pending'] || STATUS_PILLS.pending

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg mx-0 sm:mx-4 max-h-[94vh] overflow-y-auto" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)', fontFamily: 'Manrope, sans-serif' }}>
        <div className="sticky top-0 z-10 bg-white px-5 sm:px-7 py-4 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: C.text }}>
              <span className="font-mono">{refund.id}</span>
            </h2>
            <div className="text-xs flex items-center gap-2" style={{ color: C.textMuted }}>
              <span className="font-mono" style={{ color: C.goldDark }}>{refund.order_number || ''}</span>
              {refund.customer_name && <span>· {refund.customer_name}</span>}
              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                style={{ color: ps.color, background: ps.bg }}>{ps.label}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 sm:px-7 py-5 space-y-4">
          {/* Amount (read-only) */}
          <div className="rounded-xl px-3 py-3" style={{ background: '#f0fdf4', border: '1px solid rgba(22,163,74,0.15)' }}>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase" style={{ color: C.textMuted }}>Refund Amount</span>
              <span className="text-xl font-bold font-mono" style={{ color: '#16a34a' }}>{fmtCurrency(refund.amount)}</span>
            </div>
          </div>

          {/* Payment method + details (editable if not settled) */}
          <div className="space-y-3">
            <Field label="Payment method">
              <Select value={method} onChange={e => setMethod(e.target.value)} disabled={isSettled}>
                {REFUND_PAYMENT_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </Select>
            </Field>

            {(method === 'upi') && (
              <Field label="UPI ID">
                <Input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="name@upi" disabled={isSettled} />
              </Field>
            )}

            {(method === 'bank_transfer') && (
              <div className="space-y-2">
                <Field label="Bank name">
                  <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. HDFC Bank" disabled={isSettled} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Account no.">
                    <Input value={accountNo} onChange={e => setAccountNo(e.target.value)} disabled={isSettled} />
                  </Field>
                  <Field label="IFSC">
                    <Input value={ifsc} onChange={e => setIfsc(e.target.value)} style={{ textTransform: 'uppercase' }} disabled={isSettled} />
                  </Field>
                </div>
              </div>
            )}

            <Field label="Payment date">
              <Input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} disabled={isSettled} />
            </Field>

            <Field label="Reference (UTR / txn ID)">
              <Input value={reference} onChange={e => setRef(e.target.value)} placeholder="UTR / cheque no." disabled={isSettled} />
            </Field>

            <Field label="Notes">
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" disabled={isSettled} />
            </Field>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white px-5 sm:px-7 py-4 border-t flex justify-between gap-2" style={{ borderColor: C.border }}>
          <Btn onClick={onClose}>Close</Btn>
          <div className="flex gap-2">
            {!isSettled && (
              <Btn onClick={save} disabled={working}>{working ? 'Saving…' : 'Save Details'}</Btn>
            )}
            {isPending && (
              <button onClick={markPaid} disabled={working}
                className="font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 px-5 py-2.5"
                style={{ background: '#2563eb', color: '#fff', border: 'none', opacity: working ? 0.5 : 1, cursor: working ? 'not-allowed' : 'pointer' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                {working ? 'Working…' : 'Mark Paid'}
              </button>
            )}
            {isSettled && (
              <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#16a34a' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                Settled via bank statement
              </div>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

export default RefundPaymentsView

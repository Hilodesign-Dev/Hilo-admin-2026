/* ═══════════════════════════════════════════════════════════════════════════
   RETURNS & EXCHANGES — Detail Modal
   ═══════════════════════════════════════════════════════════════════════════
   Multi-step return flow:
     1. Requested  → Accept Return (set amount paid, refund method/amount)
     2. Approved   → Mark Received (confirm outfit is back)
     3. Received   → Process Refund (enter bank / UPI / QR, record payment)
     4. Refunded   → Done (read-only summary)
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { C, fmtCurrency, toast } from '../../lib/designTokens'
import { Overlay, Field, Input, Select, Btn, Badge } from '../orders/ui'
import { STATUS_META, REFUND_METHODS, REFUND_PAYMENT_METHODS, newCreditId, newRefundId } from './constants'

const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const todayISO = () => new Date().toISOString().slice(0, 10)
const n = (v) => Number(v) || 0

/* ── Step progress indicator ─────────────────────────────────────────────── */
const STEPS = [
  { key: 'requested', label: 'Requested', icon: '1' },
  { key: 'approved',  label: 'Accepted',  icon: '2' },
  { key: 'received',  label: 'Received',  icon: '3' },
  { key: 'refunded',  label: 'Refunded',  icon: '4' },
]
const STEP_INDEX = { requested: 0, approved: 1, received: 2, refunded: 3 }

const StepIndicator = ({ status }) => {
  const current = STEP_INDEX[status] ?? -1
  if (current < 0) return null // rejected / cancelled — no stepper
  return (
    <div className="flex items-center gap-1 mb-4">
      {STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        const clr = done ? '#16a34a' : active ? '#2563eb' : '#d1d5db'
        return (
          <React.Fragment key={s.key}>
            {i > 0 && <div className="flex-1 h-0.5 rounded" style={{ background: done ? '#16a34a' : '#e5e7eb' }} />}
            <div className="flex flex-col items-center gap-0.5" style={{ minWidth: 48 }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: done ? '#16a34a' : active ? '#2563eb' : '#f3f4f6', color: done || active ? '#fff' : '#9ca3af', border: `2px solid ${clr}` }}>
                {done ? '✓' : s.icon}
              </div>
              <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: done ? '#16a34a' : active ? '#2563eb' : '#9ca3af' }}>{s.label}</span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

/* ── Main modal ──────────────────────────────────────────────────────────── */
const ReturnDetailModal = ({ id, user, onClose, onChanged }) => {
  const [row, setRow] = useState(null)
  const [order, setOrder] = useState(null)
  const [buyer, setBuyer] = useState(null)
  const [loading, setLoading] = useState(true)

  // Accept step
  const [amountPaid, setAmountPaid] = useState(0)
  const [refundMethod, setRefundMethod] = useState('original_payment')
  const [refundAmount, setRefundAmount] = useState(0)
  const [storeCreditAmount, setStoreCreditAmount] = useState(0)
  const [decisionNote, setDecisionNote] = useState('')

  // Process refund step
  const [paymentMode, setPaymentMode] = useState('bank_transfer')
  const [bankName, setBankName] = useState('')
  const [accountNo, setAccountNo] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [upiId, setUpiId] = useState('')
  const [qrFile, setQrFile] = useState(null)
  const [qrPreview, setQrPreview] = useState('')
  const [refundRef, setRefundRef] = useState('')
  const [refundDate, setRefundDate] = useState(todayISO())
  const [refundNotes, setRefundNotes] = useState('')
  const fileRef = useRef(null)

  const [working, setWorking] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data: r, error } = await supa.from('return_requests').select('*').eq('id', id).maybeSingle()
    if (error || !r) {
      toast(false, 'Could not load return: ' + (error?.message || 'not found'))
      setLoading(false)
      return
    }
    setRow(r)

    const [oRes, bRes] = await Promise.all([
      r.order_id ? supa.from('shopify_orders').select('id, order_number, customer_name, customer_email, total_price, subtotal_price, total_discounts').eq('id', r.order_id).maybeSingle() : Promise.resolve({ data: null }),
      r.buyer_id ? supa.from('buyers').select('id, name, phone, email, store_credit').eq('id', r.buyer_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    setOrder(oRes.data || null)
    setBuyer(bRes.data || null)

    const itemsTotal = (r.items || []).reduce((s, it) => s + Number(it.line_total || 0), 0)
    // Proportional refund: distribute order-level discount across returned items
    const ord = oRes.data
    let proportionalAmount = itemsTotal
    if (ord && Number(ord.total_discounts) > 0) {
      const orderMRP = Number(ord.total_price) + Number(ord.total_discounts)
      proportionalAmount = Math.round(itemsTotal * Number(ord.total_price) / orderMRP)
    } else if (ord && Number(ord.total_price) > 0 && Number(ord.total_price) < itemsTotal) {
      proportionalAmount = Number(ord.total_price)
    }
    setAmountPaid(Number(r.amount_paid || proportionalAmount))
    setRefundMethod(r.refund_method || 'original_payment')
    setRefundAmount(Number(r.refund_amount || r.amount_paid || proportionalAmount))
    setStoreCreditAmount(Number(r.store_credit_amount || 0))

    // Restore saved refund details
    setPaymentMode(r.refund_payment_mode || 'bank_transfer')
    setBankName(r.refund_bank_name || '')
    setAccountNo(r.refund_account_no || '')
    setIfsc(r.refund_ifsc || '')
    setUpiId(r.refund_upi_id || '')
    setQrPreview(r.refund_qr_url || '')

    setLoading(false)
  }

  useEffect(() => { if (id) load() /* eslint-disable-next-line */ }, [id])

  // Auto-shape amounts when method or amountPaid changes
  useEffect(() => {
    if (!row) return
    const paid = Number(amountPaid || 0)
    if (refundMethod === 'original_payment') {
      setRefundAmount(paid)
      setStoreCreditAmount(0)
    } else if (refundMethod === 'store_credit') {
      setRefundAmount(0)
      setStoreCreditAmount(paid)
    } else if (refundMethod === 'exchange_only') {
      setRefundAmount(0)
      setStoreCreditAmount(0)
    }
  }, [refundMethod, amountPaid, row])

  const itemsTotal = useMemo(
    () => (row?.items || []).reduce((s, it) => s + Number(it.line_total || 0), 0),
    [row]
  )

  const transition = async (nextStatus, extra = {}) => {
    if (!row) return
    setWorking(true)
    const now = new Date().toISOString()
    const event = {
      status: nextStatus,
      at: now,
      by: window._currentUserName || user?.email || 'system',
      note: decisionNote || extra._note || null,
    }
    const updates = {
      status: nextStatus,
      decision_by_name: window._currentUserName || user?.email || null,
      decision_at: now,
      decision_note: decisionNote || null,
      status_history: [...(row.status_history || []), event],
      ...extra,
    }
    delete updates._note
    const { error } = await supa.from('return_requests').update(updates).eq('id', id)
    if (error) {
      setWorking(false)
      toast(false, 'Failed: ' + error.message)
      return
    }

    // Side effects
    const itemIds = (row.items || []).map(i => i.order_line_item_id).filter(Boolean)

    if (nextStatus === 'approved') {
      if (extra.refund_method === 'store_credit' && Number(extra.store_credit_amount || 0) > 0 && row.buyer_id) {
        const { error: scErr } = await supa.from('store_credit_transactions').insert({
          id: newCreditId(),
          buyer_id: row.buyer_id,
          amount: Number(extra.store_credit_amount),
          kind: 'issued',
          return_request_id: row.id,
          order_id: row.order_id,
          notes: 'Store credit for return ' + row.id,
          created_by_name: window._currentUserName || user?.email || null,
        })
        if (scErr) toast(false, 'Approved, but store credit failed: ' + scErr.message)
      }
    }

    if (nextStatus === 'received' && itemIds.length) {
      await supa.from('order_line_items').update({
        production_stage: 'returned',
        return_resolved_at: now,
      }).in('id', itemIds)
    }

    if (nextStatus === 'rejected' && itemIds.length) {
      await supa.from('order_line_items').update({
        production_stage: 'delivered',
        return_type: null,
        return_reason: null,
        return_requested_at: null,
        return_resolved_at: now,
      }).in('id', itemIds)
    }

    setWorking(false)
    toast(true, 'Marked as ' + (STATUS_META[nextStatus]?.label || nextStatus))
    onChanged?.()
    await load()
  }

  /* ── Action handlers ───────────────────────────────────────────────── */
  const approve = () => transition('approved', {
    amount_paid: Number(amountPaid || 0),
    refund_method: refundMethod,
    refund_amount: Number(refundAmount || 0),
    store_credit_amount: Number(storeCreditAmount || 0),
  })

  const reject = () => transition('rejected')

  const markReceived = () => transition('received', {
    _note: 'Outfit received back',
  })

  const cancel = () => transition('cancelled')

  // Upload QR image to Supabase storage
  const handleQrUpload = async (file) => {
    if (!file) return
    setQrFile(file)
    // Preview locally
    const reader = new FileReader()
    reader.onload = (e) => setQrPreview(e.target.result)
    reader.readAsDataURL(file)
  }

  // Save refund details (bank/UPI/QR) without processing
  const saveRefundDetails = async () => {
    setWorking(true)
    let qrUrl = row.refund_qr_url || ''

    // Upload QR if new file selected
    if (qrFile) {
      const ext = qrFile.name.split('.').pop()
      const path = `refund-qr/${id}.${ext}`
      const { error: upErr } = await supa.storage.from('uploads').upload(path, qrFile, { upsert: true })
      if (upErr) {
        toast(false, 'QR upload failed: ' + upErr.message)
      } else {
        const { data: urlData } = supa.storage.from('uploads').getPublicUrl(path)
        qrUrl = urlData?.publicUrl || ''
      }
    }

    const { error } = await supa.from('return_requests').update({
      refund_payment_mode: paymentMode,
      refund_bank_name: bankName || null,
      refund_account_no: accountNo || null,
      refund_ifsc: ifsc || null,
      refund_upi_id: upiId || null,
      refund_qr_url: qrUrl || null,
    }).eq('id', id)

    setWorking(false)
    if (error) toast(false, 'Save failed: ' + error.message)
    else toast(true, 'Refund details saved')
    await load()
  }

  // Process the refund — create refund_payment with pending status, move return to 'refunded'
  const processRefund = async () => {
    const amt = n(row.refund_amount)
    if (amt <= 0) { toast(false, 'No refund amount'); return }
    setWorking(true)

    // Save any bank/UPI details on return (optional — can be added later from Refunds tab)
    let qrUrl = row.refund_qr_url || ''
    if (qrFile) {
      const ext = qrFile.name.split('.').pop()
      const path = `refund-qr/${id}.${ext}`
      const { error: upErr } = await supa.storage.from('uploads').upload(path, qrFile, { upsert: true })
      if (!upErr) {
        const { data: urlData } = supa.storage.from('uploads').getPublicUrl(path)
        qrUrl = urlData?.publicUrl || ''
      }
    }

    await supa.from('return_requests').update({
      refund_payment_mode: paymentMode,
      refund_bank_name: bankName || null,
      refund_account_no: accountNo || null,
      refund_ifsc: ifsc || null,
      refund_upi_id: upiId || null,
      refund_qr_url: qrUrl || null,
    }).eq('id', id)

    // Create refund payment record with payment_status = 'pending'
    const refId = newRefundId()
    const { error: payErr } = await supa.from('refund_payments').insert({
      id: refId,
      buyer_id: row.buyer_id,
      return_request_id: id,
      amount: amt,
      method: paymentMode || 'bank_transfer',
      reference: refundRef || null,
      paid_on: null,
      notes: refundNotes || null,
      settled_returns: [{ return_request_id: id, amount: amt }],
      payment_status: 'pending',
      order_number: order?.order_number || null,
      customer_name: buyer?.name || order?.customer_name || null,
      refund_method: paymentMode || 'bank_transfer',
      upi_id: upiId || null,
      bank_name: bankName || null,
      account_no: accountNo || null,
      ifsc: ifsc || null,
      created_by_name: window._currentUserName || user?.email || null,
      created_by_role: window._currentUserRole || null,
    })

    if (payErr) {
      setWorking(false)
      toast(false, 'Refund failed: ' + payErr.message)
      return
    }

    // Transition return to refunded (refund record created but payment pending)
    const now = new Date().toISOString()
    const event = {
      status: 'refunded',
      at: now,
      by: window._currentUserName || user?.email || 'system',
      note: `Refund created — pending payment (${refId})`,
    }
    await supa.from('return_requests').update({
      status: 'refunded',
      refund_paid: 0,
      status_history: [...(row.status_history || []), event],
    }).eq('id', id)

    setWorking(false)
    toast(true, 'Refund created — go to Refunds tab to track payment')
    onChanged?.()
    await load()
  }

  if (loading || !row) {
    return (
      <Overlay onClose={onClose}>
        <div className="bg-white rounded-2xl p-8 text-sm" style={{ color: C.textMuted, fontFamily: 'Manrope, sans-serif' }}>Loading…</div>
      </Overlay>
    )
  }

  const meta = STATUS_META[row.status] || STATUS_META.requested
  const isTerminal = ['refunded', 'rejected', 'cancelled'].includes(row.status)

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-5xl mx-0 sm:mx-4 max-h-[94vh] overflow-y-auto" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)', fontFamily: 'Manrope, sans-serif' }}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white px-5 sm:px-7 py-4 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg font-bold" style={{ color: C.text }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{row.id}</span>
                <span className="ml-2 text-xs font-normal capitalize" style={{ color: C.textMuted }}>{row.type}</span>
              </h2>
              <div className="text-xs" style={{ color: C.textMuted }}>
                <span className="font-mono" style={{ color: C.goldDark }}>{order?.order_number || '—'}</span>
                {' · '}
                {buyer?.name || order?.customer_name || '—'}
              </div>
            </div>
            <Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 sm:px-7 py-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: items + reason + timeline */}
          <div className="lg:col-span-2 space-y-4">
            {/* Step indicator */}
            <StepIndicator status={row.status} />

            {/* Items table */}
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ background: C.bg, color: C.textMuted }}>
                <div className="col-span-6">Item</div>
                <div className="col-span-2 text-right">Qty</div>
                <div className="col-span-2 text-right">Unit</div>
                <div className="col-span-2 text-right">Line</div>
              </div>
              {(row.items || []).map((it, idx) => (
                <div key={`${it.order_line_item_id || it.sku}-${idx}`} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center" style={{ borderTop: `1px solid ${C.borderLight}` }}>
                  <div className="col-span-6">
                    <div className="text-sm" style={{ color: C.text }}>{it.title}</div>
                    <div className="text-[11px]" style={{ color: C.textMuted }}>{it.sku || ''}{it.size ? ' · ' + it.size : ''}</div>
                  </div>
                  <div className="col-span-2 text-right text-xs" style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>{it.qty}</div>
                  <div className="col-span-2 text-right text-xs" style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(it.unit_price)}</div>
                  <div className="col-span-2 text-right text-xs" style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(it.line_total)}</div>
                </div>
              ))}
              <div className="grid grid-cols-12 gap-2 px-3 py-2.5" style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}>
                <div className="col-span-10 text-right text-xs" style={{ color: C.textMuted }}>Items total</div>
                <div className="col-span-2 text-right text-xs" style={{ color: C.gold, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(itemsTotal)}</div>
              </div>
            </div>

            {/* Reason */}
            {row.reason || row.reason_category ? (
              <div className="rounded-xl px-3 py-2.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>Reason</div>
                <div className="text-sm" style={{ color: C.text }}>{row.reason_category || '—'}</div>
                {row.reason ? <div className="text-xs mt-1" style={{ color: C.textMuted }}>{row.reason}</div> : null}
                {row.notes ? <div className="text-xs mt-2" style={{ color: C.textMuted }}>Notes: {row.notes}</div> : null}
              </div>
            ) : null}

            {/* Timeline */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: C.textMuted }}>Status timeline</div>
              <ol className="space-y-2">
                {(row.status_history || []).map((ev, i) => {
                  const m = STATUS_META[ev.status] || { label: ev.status, color: C.textMuted }
                  return (
                    <li key={i} className="flex items-start gap-3">
                      <div className="mt-1.5 h-2 w-2 rounded-full" style={{ background: m.color }} />
                      <div>
                        <div className="text-sm" style={{ color: C.text }}>
                          {m.label}
                          {ev.note ? <span style={{ color: C.textMuted }}> — {ev.note}</span> : null}
                        </div>
                        <div className="text-[11px]" style={{ color: C.textMuted }}>{fmtDateTime(ev.at)} · {ev.by || '—'}</div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>

          {/* ── Right panel: context-aware per status ──────────────────── */}
          <div className="space-y-3">
            {buyer ? (
              <div className="rounded-xl px-3 py-2.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: C.textMuted }}>Buyer credit balance</div>
                <div className="text-sm" style={{ color: C.gold, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(buyer.store_credit || 0)}</div>
              </div>
            ) : null}

            {/* ═══ STEP 1: REQUESTED — Accept / Reject ═══ */}
            {row.status === 'requested' && (() => {
              const orderDiscount = n(order?.total_discounts)
              const orderMRP = order ? n(order.total_price) + orderDiscount : itemsTotal
              const discountRatio = orderMRP > 0 ? orderDiscount / orderMRP : 0
              const proportionalDiscount = Math.round(itemsTotal * discountRatio)
              const proportionalAmount = itemsTotal - proportionalDiscount
              return (
              <>
                <div className="rounded-xl px-3 py-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: C.textMuted }}>Refund calculation</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span style={{ color: C.textMuted }}>Returned items (MRP)</span>
                      <span className="font-mono" style={{ color: C.text }}>{fmtCurrency(itemsTotal)}</span>
                    </div>
                    {orderDiscount > 0 && (
                      <>
                        <div className="flex justify-between text-xs">
                          <span style={{ color: C.textMuted }}>Order discount ({(discountRatio * 100).toFixed(1)}%)</span>
                          <span className="font-mono" style={{ color: '#dc2626' }}>-{fmtCurrency(proportionalDiscount)}</span>
                        </div>
                        <div className="border-t pt-1.5 mt-1.5 flex justify-between text-xs font-bold" style={{ borderColor: C.border }}>
                          <span style={{ color: C.text }}>Net refundable</span>
                          <span className="font-mono" style={{ color: '#16a34a' }}>{fmtCurrency(proportionalAmount)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="rounded-xl px-3 py-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: C.textMuted }}>Amount to refund</div>
                  <div className="space-y-2">
                    <Field label="Amount paid by customer">
                      <Input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} placeholder="Adjust if different" />
                    </Field>
                    {Number(amountPaid) !== proportionalAmount && orderDiscount > 0 && (
                      <div className="text-[11px] px-1" style={{ color: '#6b7280' }}>
                        Auto-calculated: {fmtCurrency(proportionalAmount)} (after proportional discount)
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl px-3 py-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: C.textMuted }}>Refund decision</div>
                  <div className="space-y-2">
                    <Field label="Method">
                      <Select value={refundMethod} onChange={e => setRefundMethod(e.target.value)}>
                        {REFUND_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                      </Select>
                    </Field>
                    {refundMethod === 'original_payment' && (
                      <Field label="Refund amount">
                        <Input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} />
                      </Field>
                    )}
                    {refundMethod === 'store_credit' && (
                      <Field label="Store credit">
                        <Input type="number" value={storeCreditAmount} onChange={e => setStoreCreditAmount(e.target.value)} />
                      </Field>
                    )}
                    <Field label="Decision note">
                      <Input value={decisionNote} onChange={e => setDecisionNote(e.target.value)} placeholder="Optional" />
                    </Field>
                  </div>
                </div>

                <div className="space-y-2">
                  <button onClick={approve} disabled={working}
                    className="w-full font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 px-4 py-3"
                    style={{ background: '#16a34a', color: '#fff', border: 'none', opacity: working ? 0.5 : 1, cursor: working ? 'not-allowed' : 'pointer' }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    {working ? 'Working…' : 'Accept Return'}
                  </button>
                  <Btn onClick={reject} disabled={working} style={{ width: '100%' }}>Reject</Btn>
                </div>
              </>
            )})()}

            {/* ═══ STEP 2: APPROVED — Confirm outfit received ═══ */}
            {row.status === 'approved' && (
              <>
                <div className="rounded-xl px-4 py-4" style={{ background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5" style={{ color: '#2563eb' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8 8-4-4M5 12l5 5L20 7" /></svg>
                    <div className="text-sm font-bold" style={{ color: '#2563eb' }}>Return Accepted</div>
                  </div>
                  <div className="text-xs" style={{ color: '#4b5563' }}>
                    Waiting for the customer to send the outfit back. Once you receive it, mark it as received to proceed with the refund.
                  </div>
                </div>

                <div className="rounded-xl px-3 py-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: C.textMuted }}>Refund summary</div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span style={{ color: C.textMuted }}>Amount paid</span><span className="font-mono" style={{ color: C.text }}>{fmtCurrency(row.amount_paid || itemsTotal)}</span></div>
                    <div className="flex justify-between"><span style={{ color: C.textMuted }}>Method</span><span style={{ color: C.text }}>{REFUND_METHODS.find(m => m.key === row.refund_method)?.label || row.refund_method}</span></div>
                    <div className="flex justify-between"><span style={{ color: C.textMuted }}>Refund amount</span><span className="font-mono font-bold" style={{ color: '#16a34a' }}>{fmtCurrency(row.refund_amount || 0)}</span></div>
                  </div>
                </div>

                <button onClick={markReceived} disabled={working}
                  className="w-full font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 px-4 py-3"
                  style={{ background: '#7c3aed', color: '#fff', border: 'none', opacity: working ? 0.5 : 1, cursor: working ? 'not-allowed' : 'pointer' }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" /></svg>
                  {working ? 'Working…' : 'Outfit Received — Mark Received'}
                </button>
              </>
            )}

            {/* ═══ STEP 3: RECEIVED — Process Refund ═══ */}
            {row.status === 'received' && (
              <>
                <div className="rounded-xl px-4 py-4" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5" style={{ color: '#7c3aed' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" /></svg>
                    <div className="text-sm font-bold" style={{ color: '#7c3aed' }}>Outfit Received</div>
                  </div>
                  <div className="text-xs" style={{ color: '#4b5563' }}>
                    Process the refund of <b style={{ color: '#16a34a' }}>{fmtCurrency(row.refund_amount || 0)}</b>. Payment details (bank/UPI) can be added now or later from the Refunds tab.
                  </div>
                </div>

                {/* Payment mode selector */}
                <div className="rounded-xl px-3 py-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>Customer payment details</div>

                  <div className="flex gap-1 mb-3">
                    {[
                      { key: 'bank_transfer', label: 'Bank', icon: '🏦' },
                      { key: 'upi', label: 'UPI', icon: '📱' },
                      { key: 'qr_code', label: 'QR Code', icon: '📷' },
                    ].map(pm => (
                      <button key={pm.key} onClick={() => setPaymentMode(pm.key)}
                        className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: paymentMode === pm.key ? '#2563eb' : 'transparent',
                          color: paymentMode === pm.key ? '#fff' : C.textMuted,
                          border: `1px solid ${paymentMode === pm.key ? '#2563eb' : C.border}`,
                        }}>
                        <span>{pm.icon}</span>
                        {pm.label}
                      </button>
                    ))}
                  </div>

                  {/* Bank details */}
                  {paymentMode === 'bank_transfer' && (
                    <div className="space-y-2">
                      <Field label="Account holder / Bank name">
                        <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="e.g. HDFC Bank — Savings" />
                      </Field>
                      <Field label="Account number">
                        <Input value={accountNo} onChange={e => setAccountNo(e.target.value)} placeholder="Account number" />
                      </Field>
                      <Field label="IFSC code">
                        <Input value={ifsc} onChange={e => setIfsc(e.target.value)} placeholder="e.g. HDFC0001234" style={{ textTransform: 'uppercase' }} />
                      </Field>
                    </div>
                  )}

                  {/* UPI */}
                  {paymentMode === 'upi' && (
                    <div className="space-y-2">
                      <Field label="UPI ID">
                        <Input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="e.g. name@upi or 9876543210@paytm" />
                      </Field>
                    </div>
                  )}

                  {/* QR Code */}
                  {paymentMode === 'qr_code' && (
                    <div className="space-y-2">
                      <Field label="Upload QR code image">
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => handleQrUpload(e.target.files[0])} />
                        <button onClick={() => fileRef.current?.click()}
                          className="w-full rounded-lg py-3 text-xs font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-80"
                          style={{ border: `2px dashed ${C.border}`, color: C.textMuted, background: '#fafafa' }}>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          {qrPreview ? 'Change QR image' : 'Choose QR image'}
                        </button>
                      </Field>
                      {qrPreview && (
                        <div className="flex justify-center">
                          <img src={qrPreview} alt="QR" className="rounded-lg border" style={{ maxWidth: 160, maxHeight: 160, borderColor: C.border }} />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Refund summary */}
                <div className="rounded-xl px-3 py-3" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: C.textMuted }}>Refund summary</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span style={{ color: C.textMuted }}>Refund amount</span>
                      <span className="font-mono font-bold" style={{ color: '#16a34a' }}>{fmtCurrency(row.refund_amount || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: C.textMuted }}>Method</span>
                      <span style={{ color: C.text }}>{REFUND_METHODS.find(m => m.key === row.refund_method)?.label || row.refund_method}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <button onClick={processRefund} disabled={working}
                    className="w-full font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 px-4 py-3"
                    style={{ background: '#16a34a', color: '#fff', border: 'none', opacity: working ? 0.5 : 1, cursor: working ? 'not-allowed' : 'pointer' }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    {working ? 'Processing…' : 'Process Refund'}
                  </button>
                  <button onClick={saveRefundDetails} disabled={working}
                    className="w-full text-xs rounded-xl px-4 py-2 transition-all"
                    style={{ border: `1px solid ${C.border}`, color: C.textMuted, background: 'transparent' }}>
                    Save details for later
                  </button>
                </div>
              </>
            )}

            {/* ═══ STEP 4: REFUNDED — Read-only summary ═══ */}
            {row.status === 'refunded' && (
              <div className="rounded-xl px-4 py-4" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.15)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5" style={{ color: '#16a34a' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  <div className="text-sm font-bold" style={{ color: '#16a34a' }}>Refund Complete</div>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span style={{ color: C.textMuted }}>Amount paid by customer</span><span className="font-mono" style={{ color: C.text }}>{fmtCurrency(row.amount_paid || 0)}</span></div>
                  <div className="flex justify-between"><span style={{ color: C.textMuted }}>Refund amount</span><span className="font-mono font-bold" style={{ color: '#16a34a' }}>{fmtCurrency(row.refund_amount || 0)}</span></div>
                  <div className="flex justify-between"><span style={{ color: C.textMuted }}>Method</span><span style={{ color: C.text }}>{row.refund_payment_mode || row.refund_method || '—'}</span></div>
                  {row.refund_upi_id && <div className="flex justify-between"><span style={{ color: C.textMuted }}>UPI</span><span className="font-mono" style={{ color: C.text }}>{row.refund_upi_id}</span></div>}
                  {row.refund_account_no && <div className="flex justify-between"><span style={{ color: C.textMuted }}>Account</span><span className="font-mono" style={{ color: C.text }}>{row.refund_account_no}</span></div>}
                </div>
              </div>
            )}

            {/* ═══ REJECTED / CANCELLED — Status only ═══ */}
            {(row.status === 'rejected' || row.status === 'cancelled') && (
              <div className="rounded-xl px-4 py-4" style={{ background: row.status === 'rejected' ? 'rgba(220,38,38,0.06)' : 'rgba(107,114,128,0.06)', border: `1px solid ${row.status === 'rejected' ? 'rgba(220,38,38,0.15)' : 'rgba(107,114,128,0.15)'}` }}>
                <div className="text-sm font-bold mb-1" style={{ color: meta.color }}>{meta.label}</div>
                {row.decision_note && <div className="text-xs" style={{ color: C.textMuted }}>{row.decision_note}</div>}
              </div>
            )}

            {/* Cancel button (visible for non-terminal states) */}
            {!isTerminal && (
              <Btn onClick={cancel} disabled={working} style={{ width: '100%' }}>Cancel return</Btn>
            )}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white px-5 sm:px-7 py-4 border-t flex justify-end" style={{ borderColor: C.border }}>
          <Btn onClick={onClose}>Close</Btn>
        </div>
      </div>
    </Overlay>
  )
}

export default ReturnDetailModal

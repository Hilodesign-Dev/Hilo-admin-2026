/* ═══════════════════════════════════════════════════════════════════════════
   RETURNS & EXCHANGES — New Return Modal
   ═══════════════════════════════════════════════════════════════════════════
   Three steps: order search → item picker → reason + submit.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, fmtCurrency, toast } from '../../lib/designTokens'
import { Overlay, Field, Input, Select, Btn } from '../orders/ui'
import { REASON_CATEGORIES, RETURN_TYPES, newReturnId } from './constants'

const NewReturnModal = ({ user, prefilledOrderId = null, onClose, onCreated }) => {
  const [step, setStep] = useState(prefilledOrderId ? 2 : 1)
  const [orderQuery, setOrderQuery] = useState('')
  const [orderResults, setOrderResults] = useState([])
  const [order, setOrder] = useState(null)
  const [orderItems, setOrderItems] = useState([])
  const [picked, setPicked] = useState({}) // { line_item_id: qty }
  const [type, setType] = useState('return')
  const [reasonCategory, setReasonCategory] = useState('Size issue')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  /* Order search ----------------------------------------------------------- */
  useEffect(() => {
    if (step !== 1) return
    if (!orderQuery.trim()) { setOrderResults([]); return }
    const t = setTimeout(async () => {
      const q = orderQuery.trim()
      const { data, error } = await supa
        .from('shopify_orders')
        .select('id, order_number, customer_name, customer_email, total_price, created_at')
        .or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%,customer_email.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(20)
      if (!error) setOrderResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [orderQuery, step])

  /* Hydrate when an order is chosen --------------------------------------- */
  useEffect(() => {
    const id = order?.id || prefilledOrderId
    if (!id) return
    ;(async () => {
      const [{ data: o }, { data: items }] = await Promise.all([
        supa.from('shopify_orders').select('id, order_number, customer_name, customer_email, total_price').eq('id', id).maybeSingle(),
        supa.from('order_line_items').select('id, title, sku, size, quantity, unit_price, production_stage, customer_id').eq('order_id', id).order('id'),
      ])
      setOrder(o || null)
      setOrderItems(items || [])
      setPicked({})
    })()
  }, [order?.id, prefilledOrderId])

  const togglePick = (itemId, maxQty) => {
    setPicked(p => {
      if (p[itemId]) { const next = { ...p }; delete next[itemId]; return next }
      return { ...p, [itemId]: maxQty }
    })
  }
  const setQty = (itemId, qty, maxQty) => {
    const q = Math.max(1, Math.min(maxQty, Number(qty) || 1))
    setPicked(p => ({ ...p, [itemId]: q }))
  }

  const pickedTotal = useMemo(() => {
    return orderItems.reduce((sum, it) => {
      const qty = picked[it.id]
      if (!qty) return sum
      return sum + qty * Number(it.unit_price || 0)
    }, 0)
  }, [orderItems, picked])

  const canSubmit = order && Object.keys(picked).length > 0 && reasonCategory && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    const items = orderItems
      .filter(it => picked[it.id])
      .map(it => ({
        order_line_item_id: it.id,
        sku: it.sku,
        title: it.title,
        size: it.size,
        qty: picked[it.id],
        unit_price: Number(it.unit_price || 0),
        line_total: Number(it.unit_price || 0) * picked[it.id],
      }))

    // Resolve buyer_id via customer_id on a line item, falling back to email lookup
    let buyerId = null
    let customerId = orderItems.find(it => picked[it.id])?.customer_id || null
    if (customerId) {
      const { data: cust } = await supa.from('customers').select('buyer_id').eq('id', customerId).maybeSingle()
      buyerId = cust?.buyer_id || null
    }
    if (!buyerId && order.customer_email) {
      const { data: b } = await supa.from('buyers').select('id').eq('email', order.customer_email).maybeSingle()
      buyerId = b?.id || null
    }

    const now = new Date().toISOString()
    const event = {
      status: 'requested',
      at: now,
      by: window._currentUserName || user?.email || 'system',
      note: 'Created',
    }

    const payload = {
      id: newReturnId(),
      order_id: order.id,
      buyer_id: buyerId,
      customer_id: customerId,
      type,
      status: 'requested',
      reason_category: reasonCategory,
      reason,
      notes,
      items,
      status_history: [event],
      created_by_name: window._currentUserName || user?.email || null,
      created_by_role: window._currentUserRole || null,
    }

    // 1. Insert return_requests row
    const { error } = await supa.from('return_requests').insert(payload)
    if (error) {
      setSaving(false)
      toast(false, 'Failed to create return: ' + error.message)
      return
    }

    // 2. Mirror into order_line_items so the existing production_stage flow lights up
    const itemIds = items.map(i => i.order_line_item_id).filter(Boolean)
    if (itemIds.length) {
      await supa.from('order_line_items').update({
        return_type: type,
        return_reason: reasonCategory,
        exchange_notes: notes || null,
        return_requested_at: now,
        return_resolved_at: null,
        production_stage: 'return-requested',
      }).in('id', itemIds)
    }

    setSaving(false)
    toast(true, 'Return request created')
    onCreated?.()
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl mx-0 sm:mx-4 max-h-[94vh] overflow-y-auto" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)', fontFamily: 'Manrope, sans-serif' }}>
        <div className="sticky top-0 z-10 bg-white px-5 sm:px-7 py-4 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: C.text }}>New Return / Exchange</h2>
            {order ? <div className="text-xs" style={{ color: C.textMuted }}>Step {step} of 2 · {order.order_number}</div> : <div className="text-xs" style={{ color: C.textMuted }}>Step {step} of 2</div>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 sm:px-7 py-5 space-y-4">
          {step === 1 && (
            <>
              <Field label="Search order" required>
                <Input autoFocus value={orderQuery} onChange={e => setOrderQuery(e.target.value)} placeholder="Order number, customer name or email" />
              </Field>
              <div className="space-y-1">
                {orderResults.map(o => (
                  <button
                    key={o.id}
                    onClick={() => { setOrder(o); setStep(2) }}
                    className="w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between hover:bg-gray-50"
                    style={{ border: `1px solid ${C.border}` }}
                  >
                    <span style={{ color: C.text }}>
                      <span className="text-xs font-mono font-bold" style={{ color: C.goldDark }}>{o.order_number}</span>
                      <span className="ml-2 text-xs" style={{ color: C.textMuted }}>{o.customer_name || o.customer_email || '—'}</span>
                    </span>
                    <span className="text-xs" style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(o.total_price)}</span>
                  </button>
                ))}
                {orderResults.length === 0 && orderQuery.trim().length > 0 ? (
                  <div className="text-xs" style={{ color: C.textMuted }}>No matching orders.</div>
                ) : null}
              </div>
            </>
          )}

          {step === 2 && order && (
            <>
              <div className="rounded-xl px-3 py-2.5" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                <div className="text-sm" style={{ color: C.text }}>
                  <span className="font-mono font-bold" style={{ color: C.goldDark }}>{order.order_number}</span> · {order.customer_name || order.customer_email || '—'}
                </div>
                <div className="text-xs" style={{ color: C.textMuted }}>Total {fmtCurrency(order.total_price)}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Type" required>
                  <Select value={type} onChange={e => setType(e.target.value)}>
                    {RETURN_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </Select>
                </Field>
                <Field label="Reason" required>
                  <Select value={reasonCategory} onChange={e => setReasonCategory(e.target.value)}>
                    {REASON_CATEGORIES.map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </Field>
              </div>

              <Field label="Items to return" required>
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                  <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ background: C.bg, color: C.textMuted }}>
                    <div className="col-span-1"></div>
                    <div className="col-span-5">Item</div>
                    <div className="col-span-2 text-right">Qty</div>
                    <div className="col-span-2 text-right">Unit</div>
                    <div className="col-span-2 text-right">Line</div>
                  </div>
                  {orderItems.map(it => {
                    const max = Number(it.quantity || 1)
                    const q = picked[it.id] || max
                    return (
                      <div key={it.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center" style={{ borderTop: `1px solid ${C.borderLight}` }}>
                        <div className="col-span-1">
                          <input type="checkbox" checked={!!picked[it.id]} onChange={() => togglePick(it.id, max)} />
                        </div>
                        <div className="col-span-5 sm:col-span-5">
                          <div className="text-sm" style={{ color: C.text }}>{it.title}</div>
                          <div className="text-[11px]" style={{ color: C.textMuted }}>{it.sku || ''}{it.size ? ' · ' + it.size : ''}</div>
                        </div>
                        <div className="col-span-2 text-right">
                          {picked[it.id] ? (
                            <input
                              type="number" min={1} max={max} value={q}
                              onChange={e => setQty(it.id, e.target.value, max)}
                              className="w-16 text-right px-2 py-1 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
                              style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text, fontFamily: 'JetBrains Mono, monospace' }}
                            />
                          ) : (
                            <span style={{ color: C.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{max}</span>
                          )}
                        </div>
                        <div className="col-span-2 text-right text-xs" style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(it.unit_price)}</div>
                        <div className="col-span-2 text-right text-xs" style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmtCurrency(Number(it.unit_price || 0) * (picked[it.id] || max))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Field>

              <Field label="Reason notes">
                <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is the buyer returning these items?" />
              </Field>

              <Field label="Internal notes">
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
              </Field>

              <div className="flex items-center justify-between text-sm pt-2" style={{ borderTop: `1px solid ${C.borderLight}` }}>
                <span style={{ color: C.textMuted }}>Estimated refund value</span>
                <span style={{ color: C.gold, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(pickedTotal)}</span>
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white px-5 sm:px-7 py-4 border-t flex items-center justify-between" style={{ borderColor: C.border }}>
          {step === 2 && !prefilledOrderId ? <Btn small onClick={() => setStep(1)}>← Back</Btn> : <span />}
          <div className="flex items-center gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            {step === 2 && (
              <Btn primary onClick={submit} disabled={!canSubmit}>{saving ? 'Creating…' : 'Create return'}</Btn>
            )}
          </div>
        </div>
      </div>
    </Overlay>
  )
}

export default NewReturnModal

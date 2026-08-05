/* ═══════════════════════════════════════════════════════════════════════════
   EXCHANGE & RETURN MODAL
   ═══════════════════════════════════════════════════════════════════════════
   Allows raising return or exchange requests for delivered/dispatched items.
   - Return: product → return-requested → accepted (returned) / rejected (delivered)
   - Exchange: change size/variant + raise return-requested
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, stageColor } from '../../lib/designTokens'
import { requestReturn, acceptReturn, rejectReturn } from '../../lib/stateMachine'
import { Overlay, Badge, Btn, Field, Input, Select } from './ui'

const RETURN_REASONS = [
  'Size issue', 'Color mismatch', 'Quality defect', 'Wrong product shipped',
  'Customer changed mind', 'Damaged in transit', 'Fabric issue', 'Other',
]

const ExchangeReturnModal = ({ order, onSave, onClose }) => {
  const [lineItems, setLineItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeView, setActiveView] = useState('new') // 'new' | 'pending' | 'resolved'

  // Per-item form state
  const [itemForms, setItemForms] = useState({})

  useEffect(() => {
    fetchItems()
  }, [order.id])

  const fetchItems = async () => {
    setLoading(true)
    const { data } = await supa
      .from('order_line_items')
      .select('*')
      .eq('order_id', order.id)
      .order('id')
    setLineItems(data || [])
    setLoading(false)
  }

  const updateItemForm = (itemId, field, value) => {
    setItemForms(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), [field]: value }
    }))
  }

  const canRequestReturn = (li) => {
    return ['delivered', 'shipped'].includes(li.production_stage)
  }

  const isPending = (li) => li.production_stage === 'return-requested'
  const isResolved = (li) => li.production_stage === 'returned'

  // Raise a return or exchange request
  const handleRequest = async (li) => {
    const form = itemForms[li.id] || {}
    if (!form.type) { toast(false, 'Select Return or Exchange'); return }
    if (!form.reason) { toast(false, 'Select a reason'); return }
    if (form.type === 'exchange' && !form.newSize && !form.newVariant) {
      toast(false, 'Specify new size or variant for exchange'); return
    }

    setSaving(true)
    try {
      // Update the line item with return/exchange data
      await supa.from('order_line_items').update({
        return_type: form.type,
        return_reason: form.reason,
        exchange_new_size: form.type === 'exchange' ? (form.newSize || null) : null,
        exchange_new_variant: form.type === 'exchange' ? (form.newVariant || null) : null,
        exchange_notes: form.notes || null,
        return_requested_at: new Date().toISOString(),
        return_resolved_at: null,
        production_stage: 'return-requested',
      }).eq('id', li.id)

      // Bridge → mirror into return_requests aggregate so the Returns tab picks it up.
      try {
        const rrId = 'RR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()
        let buyerId = null
        if (li.customer_id) {
          const { data: cust } = await supa.from('customers').select('buyer_id').eq('id', li.customer_id).maybeSingle()
          buyerId = cust?.buyer_id || null
        }
        if (!buyerId && order?.customer_email) {
          const { data: b } = await supa.from('buyers').select('id').eq('email', order.customer_email).maybeSingle()
          buyerId = b?.id || null
        }
        const lineTotal = Number(li.unit_price || 0) * Number(li.quantity || 1)
        await supa.from('return_requests').insert({
          id: rrId,
          order_id: order.id,
          buyer_id: buyerId,
          customer_id: li.customer_id || null,
          type: form.type,
          status: 'requested',
          reason_category: form.reason,
          notes: form.notes || null,
          items: [{
            order_line_item_id: li.id,
            sku: li.sku, title: li.title, size: li.size,
            qty: Number(li.quantity || 1),
            unit_price: Number(li.unit_price || 0),
            line_total: lineTotal,
          }],
          status_history: [{ status: 'requested', at: new Date().toISOString(), by: window._currentUserName || 'system', note: 'Created from order modal' }],
          created_by_name: window._currentUserName || null,
          created_by_role: window._currentUserRole || null,
        })
      } catch (bridgeErr) {
        console.warn('[ExchangeReturnModal] return_requests bridge failed (line item updated regardless):', bridgeErr)
      }

      toast(true, `${form.type === 'exchange' ? 'Exchange' : 'Return'} request raised`)
      setItemForms(prev => { const n = { ...prev }; delete n[li.id]; return n })
      await fetchItems()
    } catch (e) {
      toast(false, 'Failed: ' + e.message)
    } finally { setSaving(false) }
  }

  // Accept a return
  const handleAccept = async (li) => {
    if (!confirm('Accept this return? Product will be marked as Returned.')) return
    setSaving(true)
    try {
      await acceptReturn(li.id)
      await supa.from('order_line_items').update({
        return_resolved_at: new Date().toISOString(),
      }).eq('id', li.id)
      await fetchItems()
    } catch (e) {
      toast(false, 'Failed: ' + e.message)
    } finally { setSaving(false) }
  }

  // Reject a return
  const handleReject = async (li) => {
    if (!confirm('Reject this return? Product will be restored to Delivered.')) return
    setSaving(true)
    try {
      await rejectReturn(li.id)
      await supa.from('order_line_items').update({
        return_type: null, return_reason: null, exchange_new_size: null,
        exchange_new_variant: null, exchange_notes: null,
        return_requested_at: null, return_resolved_at: null,
      }).eq('id', li.id)
      await fetchItems()
    } catch (e) {
      toast(false, 'Failed: ' + e.message)
    } finally { setSaving(false) }
  }

  const eligibleItems = lineItems.filter(canRequestReturn)
  const pendingItems = lineItems.filter(isPending)
  const resolvedItems = lineItems.filter(isResolved)

  const views = [
    { key: 'new', label: `New Request (${eligibleItems.length})` },
    { key: 'pending', label: `Pending (${pendingItems.length})` },
    { key: 'resolved', label: `Resolved (${resolvedItems.length})` },
  ]

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-5xl mx-0 sm:mx-4 max-h-[94vh] overflow-y-auto" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white px-5 sm:px-7 py-4 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: C.text }}>Exchanges & Returns</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-mono font-bold" style={{ color: C.goldDark }}>{order.order_number}</span>
              <span className="text-xs" style={{ color: C.textMuted }}>{order.customer_name}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="px-5 sm:px-7 pt-4 flex gap-2">
          {views.map(v => (
            <button key={v.key} onClick={() => setActiveView(v.key)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{
                background: activeView === v.key ? C.gold : 'transparent',
                color: activeView === v.key ? '#fff' : C.textMuted,
                border: activeView === v.key ? 'none' : `1px solid ${C.borderLight}`,
              }}>
              {v.label}
            </button>
          ))}
        </div>

        <div className="px-5 sm:px-7 py-5">
          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${C.gold} transparent ${C.gold} ${C.gold}` }} />
            </div>
          ) : activeView === 'new' ? (
            /* ── New Request View ─────────────────────────────── */
            eligibleItems.length === 0 ? (
              <div className="py-12 text-center text-sm" style={{ color: C.textMuted }}>
                No delivered/shipped items available for return or exchange.
              </div>
            ) : (
              <div className="space-y-3">
                {eligibleItems.map(li => {
                  const form = itemForms[li.id] || {}
                  const sc = stageColor(li.production_stage)
                  return (
                    <div key={li.id} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                      {/* Item header */}
                      <div className="flex items-center justify-between px-4 py-3" style={{ background: C.bg }}>
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="text-sm font-medium" style={{ color: C.text }}>{li.title}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-mono" style={{ color: C.goldDark }}>{li.sku || '—'}</span>
                              {li.size && <Badge color={C.blue} bg={C.blueBg}>{li.size}</Badge>}
                              {li.variant_title && <span className="text-xs" style={{ color: C.textMuted }}>{li.variant_title}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono" style={{ color: C.text }}>×{li.quantity}</span>
                          <Badge color={sc.text} bg={sc.bg}>{li.production_stage}</Badge>
                        </div>
                      </div>

                      {/* Return/Exchange form */}
                      <div className="px-4 py-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <Field label="Type" required>
                            <Select value={form.type || ''} onChange={e => updateItemForm(li.id, 'type', e.target.value)}>
                              <option value="">Select…</option>
                              <option value="return">Return</option>
                              <option value="exchange">Exchange</option>
                            </Select>
                          </Field>
                          <Field label="Reason" required>
                            <Select value={form.reason || ''} onChange={e => updateItemForm(li.id, 'reason', e.target.value)}>
                              <option value="">Select…</option>
                              {RETURN_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </Select>
                          </Field>
                          {form.type === 'exchange' && (
                            <>
                              <Field label="New Size">
                                <Input value={form.newSize || ''} onChange={e => updateItemForm(li.id, 'newSize', e.target.value)} placeholder="e.g. M, L, XL" />
                              </Field>
                              <Field label="New Variant">
                                <Input value={form.newVariant || ''} onChange={e => updateItemForm(li.id, 'newVariant', e.target.value)} placeholder="e.g. Blue / Cotton" />
                              </Field>
                            </>
                          )}
                        </div>
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <Field label="Notes">
                              <Input value={form.notes || ''} onChange={e => updateItemForm(li.id, 'notes', e.target.value)} placeholder="Additional details…" />
                            </Field>
                          </div>
                          <Btn primary small onClick={() => handleRequest(li)} disabled={saving}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            Raise Request
                          </Btn>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : activeView === 'pending' ? (
            /* ── Pending Returns View ─────────────────────────── */
            pendingItems.length === 0 ? (
              <div className="py-12 text-center text-sm" style={{ color: C.textMuted }}>
                No pending return/exchange requests.
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ background: C.bg, color: C.textMuted }}>
                  <div className="col-span-3">Product</div>
                  <div className="col-span-1">Type</div>
                  <div className="col-span-2">Reason</div>
                  <div className="col-span-2">Exchange Details</div>
                  <div className="col-span-2">Requested</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>
                {pendingItems.map(li => (
                  <div key={li.id}>
                    {/* Mobile */}
                    <div className="sm:hidden px-4 py-3 space-y-2" style={{ borderTop: `1px solid ${C.borderLight}` }}>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm font-medium" style={{ color: C.text }}>{li.title}</div>
                          <div className="flex gap-1.5 mt-1">
                            <Badge color={li.return_type === 'exchange' ? C.blue : C.amber} bg={li.return_type === 'exchange' ? C.blueBg : undefined}>
                              {li.return_type || '—'}
                            </Badge>
                            <span className="text-xs" style={{ color: C.textMuted }}>{li.return_reason}</span>
                          </div>
                          {li.return_type === 'exchange' && (li.exchange_new_size || li.exchange_new_variant) && (
                            <div className="text-xs mt-1" style={{ color: C.purple }}>
                              → {li.exchange_new_size && `Size: ${li.exchange_new_size}`} {li.exchange_new_variant && `Variant: ${li.exchange_new_variant}`}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleAccept(li)} disabled={saving} className="p-1.5 rounded-lg hover:bg-green-50" title="Accept">
                            <svg className="w-4 h-4" style={{ color: C.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          </button>
                          <button onClick={() => handleReject(li)} disabled={saving} className="p-1.5 rounded-lg hover:bg-red-50" title="Reject">
                            <svg className="w-4 h-4" style={{ color: C.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    {/* Desktop */}
                    <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-3 items-center" style={{ borderTop: `1px solid ${C.borderLight}` }}>
                      <div className="col-span-3">
                        <div className="text-sm font-medium" style={{ color: C.text }}>{li.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs font-mono" style={{ color: C.goldDark }}>{li.sku || '—'}</span>
                          {li.size && <Badge color={C.blue} bg={C.blueBg}>{li.size}</Badge>}
                        </div>
                      </div>
                      <div className="col-span-1">
                        <Badge color={li.return_type === 'exchange' ? C.blue : C.amber} bg={li.return_type === 'exchange' ? C.blueBg : undefined}>
                          {li.return_type || '—'}
                        </Badge>
                      </div>
                      <div className="col-span-2 text-xs" style={{ color: C.textMuted }}>{li.return_reason || '—'}</div>
                      <div className="col-span-2 text-xs" style={{ color: C.purple }}>
                        {li.return_type === 'exchange' ? (
                          <>
                            {li.exchange_new_size && <div>Size → {li.exchange_new_size}</div>}
                            {li.exchange_new_variant && <div>Variant → {li.exchange_new_variant}</div>}
                            {!li.exchange_new_size && !li.exchange_new_variant && '—'}
                          </>
                        ) : '—'}
                      </div>
                      <div className="col-span-2 text-xs" style={{ color: C.textMuted }}>
                        {li.return_requested_at ? new Date(li.return_requested_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <button onClick={() => handleAccept(li)} disabled={saving} className="p-1.5 rounded-lg hover:bg-green-50 transition-colors" title="Accept Return">
                          <svg className="w-4 h-4" style={{ color: C.green }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        </button>
                        <button onClick={() => handleReject(li)} disabled={saving} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" title="Reject Return">
                          <svg className="w-4 h-4" style={{ color: C.red }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* ── Resolved Returns View ────────────────────────── */
            resolvedItems.length === 0 ? (
              <div className="py-12 text-center text-sm" style={{ color: C.textMuted }}>
                No resolved returns yet.
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ background: C.bg, color: C.textMuted }}>
                  <div className="col-span-3">Product</div>
                  <div className="col-span-1">Type</div>
                  <div className="col-span-2">Reason</div>
                  <div className="col-span-2">Exchange Details</div>
                  <div className="col-span-2">Requested</div>
                  <div className="col-span-2">Resolved</div>
                </div>
                {resolvedItems.map(li => (
                  <div key={li.id}>
                    {/* Mobile */}
                    <div className="sm:hidden px-4 py-3" style={{ borderTop: `1px solid ${C.borderLight}` }}>
                      <div className="text-sm font-medium" style={{ color: C.text }}>{li.title}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge color={C.green} bg={`${C.green}18`}>returned</Badge>
                        <Badge color={li.return_type === 'exchange' ? C.blue : C.amber} bg={li.return_type === 'exchange' ? C.blueBg : undefined}>
                          {li.return_type || '—'}
                        </Badge>
                        <span className="text-xs" style={{ color: C.textMuted }}>{li.return_reason}</span>
                      </div>
                    </div>
                    {/* Desktop */}
                    <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-3 items-center" style={{ borderTop: `1px solid ${C.borderLight}` }}>
                      <div className="col-span-3">
                        <div className="text-sm font-medium" style={{ color: C.text }}>{li.title}</div>
                        <span className="text-xs font-mono" style={{ color: C.goldDark }}>{li.sku || '—'}</span>
                      </div>
                      <div className="col-span-1">
                        <Badge color={li.return_type === 'exchange' ? C.blue : C.amber} bg={li.return_type === 'exchange' ? C.blueBg : undefined}>
                          {li.return_type || '—'}
                        </Badge>
                      </div>
                      <div className="col-span-2 text-xs" style={{ color: C.textMuted }}>{li.return_reason || '—'}</div>
                      <div className="col-span-2 text-xs" style={{ color: C.purple }}>
                        {li.return_type === 'exchange' ? (
                          <>
                            {li.exchange_new_size && <div>Size → {li.exchange_new_size}</div>}
                            {li.exchange_new_variant && <div>Variant → {li.exchange_new_variant}</div>}
                            {!li.exchange_new_size && !li.exchange_new_variant && '—'}
                          </>
                        ) : '—'}
                      </div>
                      <div className="col-span-2 text-xs" style={{ color: C.textMuted }}>
                        {li.return_requested_at ? new Date(li.return_requested_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </div>
                      <div className="col-span-2 text-xs" style={{ color: C.green }}>
                        {li.return_resolved_at ? new Date(li.return_resolved_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white px-5 sm:px-7 py-4 border-t flex justify-end" style={{ borderColor: C.border }}>
          <Btn onClick={onClose}>Close</Btn>
        </div>
      </div>
    </Overlay>
  )
}

export default ExchangeReturnModal

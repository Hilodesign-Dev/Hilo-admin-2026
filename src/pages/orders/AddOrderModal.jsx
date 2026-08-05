import React, { useState, useCallback, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { C, PRODUCTION_STAGES, SIZES, DELIVERY_TYPES, POS_CHANNEL_TYPES, toast } from '../../lib/designTokens'
import { n, filterStylists, filterProductionManagers } from '../../lib/helpers'
import { Overlay, Field, Input, Select, Btn, Badge } from './ui'
import { FULFILLMENT_TYPES, SHIPPER_MAP, emptyLineItem } from './constants'

const AddOrderModal = ({ teamMembers, products = [], onSave, onClose }) => {
  const [form, setForm] = useState({
    name: '', est_shipping_date: new Date().toISOString().slice(0, 10), event_date: '',
    channel: '', delivery_type: '', product_executive: '', stylist: '',
    fulfillment_type: '', shipper: '', customer_name: '', phone: '',
  })
  const [items, setItems] = useState([emptyLineItem()])
  const [saving, setSaving] = useState(false)
  const [productSearch, setProductSearch] = useState({})
  const [productResults, setProductResults] = useState({})
  const searchTimers = useRef({})

  const fld = (k, v) => setForm(prev => {
    const next = { ...prev, [k]: v }
    if (k === 'fulfillment_type') next.shipper = ''
    return next
  })

  const searchProducts = useCallback((idx, query) => {
    setProductSearch(prev => ({ ...prev, [idx]: query }))
    if (searchTimers.current[idx]) clearTimeout(searchTimers.current[idx])
    if (!query || query.length < 2) { setProductResults(prev => ({ ...prev, [idx]: [] })); return }
    searchTimers.current[idx] = setTimeout(() => {
      const q = query.toLowerCase()
      const matches = (products || []).filter(p =>
        (p.productTitle || p.productName || '').toLowerCase().includes(q) ||
        (p.styleCode || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      ).slice(0, 20).map(p => ({
        title: p.productTitle || p.productName || '',
        sku: p.styleCode || p.id || '',
        name: p.productTitle || p.productName || '',
      }))
      setProductResults(prev => ({ ...prev, [idx]: matches }))
    }, 150)
  }, [products])

  const selectProduct = (idx, product) => {
    const next = [...items]
    next[idx] = { ...next[idx], name: product.name || product.title, title: product.title, sku: product.sku, product_id: product.sku }
    setItems(next)
    setProductSearch(prev => ({ ...prev, [idx]: '' }))
    setProductResults(prev => ({ ...prev, [idx]: [] }))
  }

  const updateItem = (idx, k, v) => {
    const next = [...items]
    next[idx] = { ...next[idx], [k]: v }
    setItems(next)
  }

  const removeItem = (idx) => {
    if (items.length <= 1) return
    if (!confirm('Remove this line item?')) return
    setItems(items.filter((_, i) => i !== idx))
  }

  const validate = () => {
    if (!form.name.trim()) return 'Order ID is required'
    if (!form.channel) return 'Channel is required'
    if (!form.est_shipping_date) return 'Est. Shipping Date is required'
    for (let i = 0; i < items.length; i++) {
      const li = items[i]
      if (!li.title && !li.name) return `Line item ${i + 1}: Product is required`
      if (!li.quantity || n(li.quantity) <= 0) return `Line item ${i + 1}: Quantity is required`
      if (!li.size) return `Line item ${i + 1}: Size is required`
      if (!li.type) return `Line item ${i + 1}: Type is required`
    }
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { toast(false, err); return }
    if (!confirm('Create this order?')) return
    setSaving(true)
    try {
      const { data: existing } = await supa.from('shopify_orders').select('id').eq('order_number', form.name.trim()).limit(1)
      if (existing && existing.length > 0) { toast(false, 'Duplicate order ID — this order already exists'); setSaving(false); return }

      const orderId = crypto.randomUUID()
      const orderPayload = {
        id: orderId, order_number: form.name.trim(),
        customer_name: form.customer_name || '', customer_email: '', total_price: 0,
        channel: form.channel, financial_status: 'pending', fulfillment_status: 'unfulfilled',
        order_status: 'pending', est_shipping_date: form.est_shipping_date || null,
        event_date: form.event_date || null, delivery_type: form.delivery_type || null,
        fulfillment_type: form.fulfillment_type || null, shipper: form.shipper || null,
        notes: form.phone ? `Phone: ${form.phone}` : '',
        line_items: items.map(li => ({ title: li.title || li.name, sku: li.sku, quantity: n(li.quantity), variant_title: li.size })),
        created_at: new Date().toISOString()
      }
      const { error: orderErr } = await supa.from('shopify_orders').insert([orderPayload])
      if (orderErr) throw orderErr

      for (let i = 0; i < items.length; i++) {
        const li = items[i]
        const { error: liErr } = await supa.from('order_line_items').insert([{
          id: crypto.randomUUID(), order_id: orderId, order_number: form.name.trim(),
          title: li.title || li.name, sku: li.sku || '', quantity: n(li.quantity),
          unit_price: 0, product_type: 'standard', size: li.size, type: li.type,
          production_stage: 'pending', stylist: form.stylist || null,
          product_executive: form.product_executive || null,
          fulfillment_type: form.fulfillment_type || null, shipper: form.shipper || null,
        }])
        if (liErr) throw liErr
      }

      toast(true, 'Order created successfully')
      onSave()
    } catch (e) {
      console.error('Add order error:', e)
      toast(false, 'Failed to create order: ' + e.message)
    } finally { setSaving(false) }
  }

  const shippers = form.fulfillment_type ? (SHIPPER_MAP[form.fulfillment_type] || []) : []

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-5xl mx-0 sm:mx-4 max-h-[94vh] overflow-y-auto" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
        <div className="sticky top-0 z-10 bg-white px-5 sm:px-7 py-4 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <h2 className="text-lg font-bold" style={{ color: C.text }}>Add New Order</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 sm:px-7 py-5 space-y-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.goldDark }}>Order Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Order ID" required>
                <Input value={form.name} onChange={e => fld('name', e.target.value)} placeholder="#WALK-001" />
              </Field>
              <Field label="Est. Shipping Date" required>
                <Input type="date" value={form.est_shipping_date} onChange={e => fld('est_shipping_date', e.target.value)} />
              </Field>
              <Field label="Event Date">
                <Input type="date" value={form.event_date} onChange={e => fld('event_date', e.target.value)} />
              </Field>
              <Field label="Channel" required>
                <Select value={form.channel} onChange={e => fld('channel', e.target.value)}>
                  <option value="">Select…</option>
                  {POS_CHANNEL_TYPES.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                </Select>
              </Field>
              <Field label="Customer Name">
                <Input value={form.customer_name} onChange={e => fld('customer_name', e.target.value)} placeholder="Customer name" />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={e => fld('phone', e.target.value)} placeholder="Phone number" />
              </Field>
              <Field label="Delivery Type">
                <Select value={form.delivery_type} onChange={e => fld('delivery_type', e.target.value)}>
                  <option value="">Select…</option>
                  {DELIVERY_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
                </Select>
              </Field>
              <Field label="Product Executive">
                <Select value={form.product_executive} onChange={e => fld('product_executive', e.target.value)}>
                  <option value="">Select…</option>
                  {filterProductionManagers(teamMembers).map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                </Select>
              </Field>
              <Field label="Stylist">
                <Select value={form.stylist} onChange={e => fld('stylist', e.target.value)}>
                  <option value="">Select…</option>
                  {filterStylists(teamMembers).map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                </Select>
              </Field>
              <Field label="Fulfillment Type">
                <Select value={form.fulfillment_type} onChange={e => fld('fulfillment_type', e.target.value)}>
                  <option value="">Select…</option>
                  {FULFILLMENT_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
                </Select>
              </Field>
              <Field label="Shipper">
                <Select value={form.shipper} onChange={e => fld('shipper', e.target.value)} disabled={!form.fulfillment_type}>
                  <option value="">Select…</option>
                  {shippers.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: C.goldDark }}>Line Items</div>
              <Btn small onClick={() => setItems([...items, emptyLineItem()])}>+ Add Item</Btn>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ background: C.bg, color: C.textMuted }}>
                <div className="col-span-5">Product</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-2">Size</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-1"></div>
              </div>
              {items.map((li, idx) => (
                <div key={li._key} className="grid grid-cols-1 sm:grid-cols-12 gap-2 px-4 py-3 items-center" style={{ borderTop: idx > 0 ? `1px solid ${C.borderLight}` : 'none' }}>
                  <div className="col-span-5 relative">
                    {li.title || li.name ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                        <span className="text-xs font-mono font-bold" style={{ color: C.goldDark }}>{li.sku}</span>
                        <span className="text-sm truncate" style={{ color: C.text }}>{li.title || li.name}</span>
                        <button onClick={() => { updateItem(idx, 'title', ''); updateItem(idx, 'name', ''); updateItem(idx, 'sku', ''); updateItem(idx, 'product_id', '') }} className="ml-auto text-xs" style={{ color: C.red }}>✕</button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Input value={productSearch[idx] || ''} onChange={e => searchProducts(idx, e.target.value)} placeholder="Search product…" />
                        {(productResults[idx] || []).length > 0 && (
                          <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                            {productResults[idx].map((p, pi) => (
                              <button key={pi} onClick={() => selectProduct(idx, p)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
                                <span className="text-xs font-mono font-bold" style={{ color: C.goldDark }}>{p.sku}</span>
                                <span className="text-xs truncate" style={{ color: C.text }}>{p.title}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <Input type="text" inputMode="decimal" value={li.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} placeholder="1" />
                  </div>
                  <div className="col-span-2">
                    <Select value={li.size} onChange={e => updateItem(idx, 'size', e.target.value)}>
                      <option value="">Size…</option>
                      {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Select value={li.type} onChange={e => updateItem(idx, 'type', e.target.value)}>
                      <option value="General">General</option>
                      <option value="Custom">Custom</option>
                    </Select>
                  </div>
                  <div className="col-span-1 text-center">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="p-1.5 rounded-lg hover:bg-red-50" style={{ color: C.red }}>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white px-5 sm:px-7 py-4 border-t flex justify-end gap-3" style={{ borderColor: C.border }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Create Order'}</Btn>
        </div>
      </div>
    </Overlay>
  )
}

export default AddOrderModal

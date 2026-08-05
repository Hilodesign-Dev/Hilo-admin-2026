import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { C, PRODUCTION_STAGES, SIZES, toast } from '../../lib/designTokens'
import { n, filterStylists, filterProductionManagers } from '../../lib/helpers'
import { Overlay, Field, Input, Select, Btn } from './ui'
import { FULFILLMENT_TYPES, SHIPPER_MAP, emptyLineItem } from './constants'

const EditOrderModal = ({ order, lineItems: initialLIs, teamMembers, products = [], onSave, onClose }) => {
  const [form, setForm] = useState({
    est_shipping_date: order.est_shipping_date || '',
    event_date: order.event_date || '',
    product_executive: '', stylist: '',
    fulfillment_type: order.fulfillment_type || '', shipper: order.shipper || '',
    address1: '', city: '', zip: '',
  })
  const [items, setItems] = useState(() => (initialLIs || []).map(li => ({ ...li, _key: li.id || Date.now() + Math.random() })))
  const [saving, setSaving] = useState(false)
  const [productSearch, setProductSearch] = useState({})
  const [productResults, setProductResults] = useState({})
  const searchTimers = useRef({})

  useEffect(() => {
    if (initialLIs && initialLIs.length > 0) {
      setForm(prev => ({
        ...prev,
        stylist: initialLIs[0].stylist || '',
        product_executive: initialLIs[0].product_executive || '',
      }))
    }
  }, [initialLIs])

  const fld = (k, v) => setForm(prev => {
    const next = { ...prev, [k]: v }
    if (k === 'fulfillment_type') next.shipper = ''
    if (['product_executive', 'stylist', 'fulfillment_type', 'shipper'].includes(k)) {
      setItems(prev => prev.map(li => ({ ...li, [k]: v })))
    }
    return next
  })

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

  const addItem = () => setItems([...items, { ...emptyLineItem(), stylist: form.stylist, product_executive: form.product_executive, fulfillment_type: form.fulfillment_type, shipper: form.shipper, production_stage: 'pending' }])

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
    updateItem(idx, 'name', product.name || product.title)
    updateItem(idx, 'title', product.title)
    updateItem(idx, 'sku', product.sku)
    setProductSearch(prev => ({ ...prev, [idx]: '' }))
    setProductResults(prev => ({ ...prev, [idx]: [] }))
  }

  const handleSave = async () => {
    if (!confirm('Save changes to this order?')) return
    setSaving(true)
    try {
      const addressNote = [form.address1, form.city, form.zip].filter(Boolean).join(', ')
      const orderUpdate = {
        est_shipping_date: form.est_shipping_date || null,
        event_date: form.event_date || null,
        fulfillment_type: form.fulfillment_type || null,
        shipper: form.shipper || null,
        notes: addressNote || order.notes || null,
      }
      const { error: orderErr } = await supa.from('shopify_orders').update(orderUpdate).eq('id', order.id)
      if (orderErr) throw orderErr

      // Build line item rows for upsert (handles both existing + new items)
      const upsertRows = items.map(li => ({
        id: li.id || crypto.randomUUID(),
        order_id: order.id, order_number: order.order_number || '',
        title: li.title || '', sku: li.sku || '',
        quantity: n(li.quantity), unit_price: n(li.unit_price),
        product_type: li.product_type || 'standard',
        size: li.size || '', type: li.type || 'General',
        production_stage: li.production_stage || 'pending',
        stylist: li.stylist || form.stylist || null,
        product_executive: li.product_executive || form.product_executive || null,
        fulfillment_type: li.fulfillment_type || form.fulfillment_type || null,
        shipper: li.shipper || form.shipper || null,
        awb: li.awb || null,
        fulfillment_contact: li.fulfillment_contact || null,
        fulfillment_comments: li.fulfillment_comments || null,
        fulfillment_user: li.fulfillment_user || null,
        fulfillment_date: li.fulfillment_date || null,
        alteration_status: li.alteration_status || null,
        alteration_comments: li.alteration_comments || null,
        alteration_file: li.alteration_file || null,
        cogs_source: li.cogs_source || null,
        cogs_fabric: n(li.cogs_fabric) || 0, cogs_embroidery: n(li.cogs_embroidery) || 0,
        cogs_stitching: n(li.cogs_stitching) || 0, cogs_accessories: n(li.cogs_accessories) || 0,
        cogs_other: n(li.cogs_other) || 0,
        fabric_id: li.fabric_id || null, fabric_name: li.fabric_name || null,
        metres: n(li.metres) || 0, cost_per_metre: n(li.cost_per_metre) || 0,
        dye_id: li.dye_id || null, dye_per_metre: n(li.dye_per_metre) || 0,
        category: li.category || null, is_mtf: li.is_mtf || false,
      }))

      // Delete any removed line items (items that were in original but not in current list)
      const currentIds = upsertRows.map(r => r.id)
      const originalIds = (initialLIs || []).map(li => li.id).filter(Boolean)
      const removedIds = originalIds.filter(id => !currentIds.includes(id))
      if (removedIds.length > 0) {
        await supa.from('order_line_items').delete().in('id', removedIds)
      }

      // Upsert all current line items (updates existing, inserts new)
      const { error: liErr } = await supa.from('order_line_items').upsert(upsertRows, { onConflict: 'id' })
      if (liErr) throw liErr

      await supa.from('shopify_orders').update({
        line_items: items.map(li => ({ title: li.title, sku: li.sku, quantity: n(li.quantity), variant_title: li.size }))
      }).eq('id', order.id)

      toast(true, 'Order updated successfully')
      onSave()
    } catch (e) {
      console.error('Edit order error:', e)
      toast(false, 'Failed to update: ' + e.message)
    } finally { setSaving(false) }
  }

  const shippers = form.fulfillment_type ? (SHIPPER_MAP[form.fulfillment_type] || []) : []

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-5xl mx-0 sm:mx-4 max-h-[94vh] overflow-y-auto" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
        <div className="sticky top-0 z-10 bg-white px-5 sm:px-7 py-4 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: C.text }}>Edit Order</h2>
            <span className="text-sm font-mono font-bold" style={{ color: C.goldDark }}>{order.order_number}</span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 sm:px-7 py-5 space-y-6">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.goldDark }}>Order Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Order ID">
                <Input value={order.order_number} disabled style={{ opacity: 0.5 }} />
              </Field>
              <Field label="Est. Shipping Date">
                <Input type="date" value={form.est_shipping_date} onChange={e => fld('est_shipping_date', e.target.value)} />
              </Field>
              <Field label="Event Date">
                <Input type="date" value={form.event_date} onChange={e => fld('event_date', e.target.value)} />
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
              <Field label="Address">
                <Input value={form.address1} onChange={e => fld('address1', e.target.value)} placeholder="Address" />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={e => fld('city', e.target.value)} placeholder="City" />
              </Field>
              <Field label="Zip">
                <Input value={form.zip} onChange={e => fld('zip', e.target.value)} placeholder="Zip code" />
              </Field>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: C.goldDark }}>Line Items</div>
              <Btn small onClick={addItem}>+ Add Item</Btn>
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <div className="hidden lg:grid lg:grid-cols-12 gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ background: C.bg, color: C.textMuted }}>
                <div className="col-span-4">Product</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-2">Size</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-2">Stage</div>
                <div className="col-span-1"></div>
              </div>
              {items.map((li, idx) => (
                <div key={li._key || li.id} className="grid grid-cols-1 lg:grid-cols-12 gap-2 px-4 py-3 items-center" style={{ borderTop: idx > 0 ? `1px solid ${C.borderLight}` : 'none' }}>
                  <div className="col-span-4 relative">
                    {li.title || li.name ? (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                        <span className="text-[10px] font-mono font-bold" style={{ color: C.goldDark }}>{li.sku}</span>
                        <span className="text-xs truncate" style={{ color: C.text }}>{li.title || li.name}</span>
                        <button onClick={() => { updateItem(idx, 'title', ''); updateItem(idx, 'name', ''); updateItem(idx, 'sku', '') }} className="ml-auto text-xs" style={{ color: C.red }}>✕</button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Input value={productSearch[idx] || ''} onChange={e => searchProducts(idx, e.target.value)} placeholder="Search product…" />
                        {(productResults[idx] || []).length > 0 && (
                          <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-xl shadow-lg max-h-48 overflow-y-auto" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                            {productResults[idx].map((p, pi) => (
                              <button key={pi} onClick={() => selectProduct(idx, p)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2">
                                <span className="text-xs font-mono font-bold" style={{ color: C.goldDark }}>{p.sku}</span>
                                <span className="text-xs" style={{ color: C.text }}>{p.title}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="col-span-1">
                    <Input type="text" inputMode="decimal" value={li.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <Select value={li.size || ''} onChange={e => updateItem(idx, 'size', e.target.value)}>
                      <option value="">Size…</option>
                      {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Select value={li.type || 'General'} onChange={e => updateItem(idx, 'type', e.target.value)}>
                      <option value="General">General</option>
                      <option value="Custom">Custom</option>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Select value={li.production_stage || 'pending'} onChange={e => updateItem(idx, 'production_stage', e.target.value)}>
                      {PRODUCTION_STAGES.map(s => <option key={s} value={s}>{s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
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
          <Btn primary onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
        </div>
      </div>
    </Overlay>
  )
}

export default EditOrderModal

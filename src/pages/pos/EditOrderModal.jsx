import React, { useState } from 'react'
import { toast, CHANNEL_TYPES, POS_CHANNEL_TYPES, DELIVERY_TYPES } from '../../lib/designTokens'
import { logAndToast } from '../../lib/logger'
import { POS_T, MIcon } from './tokens'
import { editOrder } from './orderActions'
import ProductPicker from './ProductPicker'
import { newTempId } from './cartHelpers'
import { ORDER_STATUS_TABS } from '../orders/constants'

/**
 * Edit Order modal — items + key header fields.
 *
 * Lets the user add new line items, edit size/qty/unit-price on existing
 * lines, and remove lines. All other order metadata (details, delivery,
 * fitting, notes) is edited elsewhere — this modal does NOT touch the
 * order header.
 *
 * Historical note: an earlier version of this modal patched header fields
 * including `product_executive`, which lives on order_line_items only.
 * That caused "Could not find the 'product_executive' column of
 * 'shopify_orders' in the schema cache" on every save. Items-only avoids
 * that class of bug entirely.
 */
const EditOrderModal = ({ stitchingMaster = [], order, lineItems = [], products = [], onSave, onClose, actingUser }) => {
  // Existing items (editable, removable)
  const [items, setItems] = useState(() => lineItems.map(li => ({ ...li, _dirty: false })))
  const [removedIds, setRemovedIds] = useState([])

  // Header-level edits — channel, order_status, delivery_type, fulfillment_type
  const [header, setHeader] = useState(() => ({
    channel: order?.channel || '',
    order_status: order?.order_status || 'pending',
    delivery_type: order?.delivery_type || '',
    fulfillment_status: order?.fulfillment_status || '',
  }))
  const [headerDirty, setHeaderDirty] = useState(false)
  const patchHeader = (k, v) => { setHeader(h => ({ ...h, [k]: v })); setHeaderDirty(true) }

  // Newly added items (queued for INSERT on save)
  const [addedItems, setAddedItems] = useState([])

  // Inline ProductPicker visibility
  const [pickerOpen, setPickerOpen] = useState(false)

  const [saving, setSaving] = useState(false)

  const updateItem = (id, patch) => {
    setItems(prev => prev.map(li => li.id === id ? { ...li, ...patch, _dirty: true } : li))
  }
  const removeItem = (id) => {
    if (!confirm('Remove this item from the order?')) return
    setRemovedIds(prev => [...prev, id])
    setItems(prev => prev.filter(li => li.id !== id))
  }

  // ProductPicker calls onAdd with a cart-ready item shape:
  //   { type:'catalog'|'custom'|'custom_set'|'gift_card', title, sku, mrp,
  //     quantity, size, garment_category, is_set, set_components, … }
  const handleAddItem = (item) => {
    setAddedItems(prev => [
      ...prev,
      { ...item, _tempId: newTempId(), _new: true, quantity: item.quantity || 1, size: item.size || 'M' },
    ])
    toast(true, 'Added to order')
  }
  const removeAdded = (tempId) => {
    setAddedItems(prev => prev.filter(i => i._tempId !== tempId))
  }
  const updateAdded = (tempId, patch) => {
    setAddedItems(prev => prev.map(i => i._tempId === tempId ? { ...i, ...patch } : i))
  }

  const save = async () => {
    setSaving(true)
    try {
      const modifiedItems = items.filter(li => li._dirty)
      // Build header patch from dirty fields only.
      const orderPatch = {}
      if (headerDirty) {
        if (header.channel       !== (order?.channel || ''))         orderPatch.channel       = header.channel || null
        if (header.order_status  !== (order?.order_status || ''))    orderPatch.order_status  = header.order_status || null
        if (header.delivery_type !== (order?.delivery_type || ''))   orderPatch.delivery_type = header.delivery_type || null
        if (header.fulfillment_status !== (order?.fulfillment_status || '')) orderPatch.fulfillment_status = header.fulfillment_status || null
      }
      await editOrder({
        orderId: order.id,
        orderPatch,
        modifiedItems,
        addedItems,
        removedItemIds: removedIds,
        actingUser,
      })
      const newCount = addedItems.length
      const editCount = modifiedItems.length
      const rmCount = removedIds.length
      const parts = []
      if (newCount) parts.push(`${newCount} added`)
      if (editCount) parts.push(`${editCount} edited`)
      if (rmCount) parts.push(`${rmCount} removed`)
      toast(true, parts.length ? `Items updated · ${parts.join(', ')}` : 'No changes')
      onSave?.()
    } catch (e) { logAndToast('edit-order', 'Save failed: ' + (e.message || e), e) }
    finally { setSaving(false) }
  }

  const hasChanges = items.some(li => li._dirty) || addedItems.length > 0 || removedIds.length > 0 || headerDirty

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col mobile-sheet"
        style={{ background: POS_T.surfaceContainerLowest, maxHeight: '95vh' }}>
        <div className="mobile-sheet-handle sm:hidden" />

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${POS_T.outlineVariant}` }}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: POS_T.onSurfaceVariant }}>Edit Order</div>
            <div className="text-base font-bold font-mono" style={{ color: POS_T.onSurface }}>{order.order_number}</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: POS_T.onSurfaceVariant }}>
            <MIcon name="close" size={20} />
          </button>
        </div>

        {/* Body — header form + items list + picker */}
        <div className="overflow-y-auto p-4 sm:p-5" style={{ flex: 1 }}>

          {/* Header form — channel / order status / delivery */}
          <div className="p-3 rounded-xl mb-4" style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2.5" style={{ color: POS_T.onSurfaceVariant }}>Order details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Channel">
                {/*
                  POS-origin orders can only be flipped between In-store and
                  Online Assist. 'Online' belongs to Shopify website sync,
                  'Marketplace' to the marketplace wizard — neither is a
                  valid choice for a human in the POS UI (see HIOS00053).
                */}
                <Select value={header.channel} onChange={v => patchHeader('channel', v)}
                  options={['', ...(order?.order_origin === 'pos' ? POS_CHANNEL_TYPES : CHANNEL_TYPES)]} />
              </Field>
              <Field label="Order status">
                <Select value={header.order_status}
                  onChange={v => patchHeader('order_status', v)}
                  options={ORDER_STATUS_TABS.filter(t => t.key !== 'all').map(t => t.key)}
                  labels={ORDER_STATUS_TABS.filter(t => t.key !== 'all').reduce((m, t) => (m[t.key] = t.label, m), {})} />
              </Field>
              <Field label="Delivery type">
                <Select value={header.delivery_type} onChange={v => patchHeader('delivery_type', v)} options={['', ...DELIVERY_TYPES]} />
              </Field>
              <Field label="Fulfillment status">
                <Select value={header.fulfillment_status}
                  onChange={v => patchHeader('fulfillment_status', v)}
                  options={['', 'unfulfilled', 'partially-fulfilled', 'fulfilled']} />
              </Field>
            </div>
          </div>

          {items.length === 0 && addedItems.length === 0 && (
            <div className="text-sm py-10 text-center" style={{ color: POS_T.onSurfaceVariant }}>
              No items yet — add your first below.
            </div>
          )}

          {/* Existing items */}
          {items.map(li => (
            <div key={li.id} className="p-3 rounded-xl mb-2"
              style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate" style={{ color: POS_T.onSurface }}>{li.title}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: POS_T.onSurfaceVariant }}>
                    {li.sku ? <span className="font-mono">{li.sku} · </span> : null}
                    {li.size || '—'}{li.production_stage ? ` · stage ${li.production_stage}` : ''}
                  </div>
                </div>
                <button onClick={() => removeItem(li.id)} className="p-1" style={{ color: POS_T.error }}>
                  <MIcon name="close" size={16} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <Field label="Size">
                  <Select value={li.size || ''} onChange={v => updateItem(li.id, { size: v })}
                    options={['XS','S','M','L','XL','XXL','XXXL','MTF']} />
                </Field>
                <Field label="Qty">
                  <Text value={String(li.quantity || 1)}
                    onChange={v => updateItem(li.id, { quantity: Math.max(1, Number(v.replace(/[^0-9]/g, '') || 1)) })} />
                </Field>
                <Field label="Unit price">
                  <Text value={String(li.unit_price || 0)}
                    onChange={v => {
                      const cleaned = v.replace(/[^0-9.]/g, '')
                      updateItem(li.id, { unit_price: cleaned === '' ? 0 : Number(cleaned) })
                    }} />
                </Field>
              </div>
            </div>
          ))}

          {/* Newly added items */}
          {addedItems.map(li => (
            <div key={li._tempId} className="p-3 rounded-xl mb-2"
              style={{ background: POS_T.primaryContainer + '22', border: `1px dashed ${POS_T.primaryContainer}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>NEW</span>
                    <div className="text-sm font-bold truncate" style={{ color: POS_T.onSurface }}>{li.title}</div>
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: POS_T.onSurfaceVariant }}>
                    {li.sku ? <span className="font-mono">{li.sku} · </span> : null}
                    {li.type === 'custom' || li.type === 'custom_set' ? 'Custom' : li.type === 'gift_card' ? 'Gift card' : 'Catalog'}
                  </div>
                </div>
                <button onClick={() => removeAdded(li._tempId)} className="p-1" style={{ color: POS_T.error }}>
                  <MIcon name="close" size={16} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <Field label="Size">
                  <Select value={li.size || 'M'} onChange={v => updateAdded(li._tempId, { size: v })}
                    options={['XS','S','M','L','XL','XXL','XXXL','MTF']} />
                </Field>
                <Field label="Qty">
                  <Text value={String(li.quantity || 1)}
                    onChange={v => updateAdded(li._tempId, { quantity: Math.max(1, Number(v.replace(/[^0-9]/g, '') || 1)) })} />
                </Field>
                <Field label="MRP">
                  <Text value={String(li.mrp || 0)}
                    onChange={v => {
                      const cleaned = v.replace(/[^0-9.]/g, '')
                      updateAdded(li._tempId, { mrp: cleaned === '' ? 0 : Number(cleaned) })
                    }} />
                </Field>
              </div>
            </div>
          ))}

          {/* Add-item trigger */}
          {!pickerOpen ? (
            <button onClick={() => setPickerOpen(true)}
              className="w-full mt-3 text-sm font-bold py-3 rounded-xl inline-flex items-center justify-center gap-2"
              style={{ border: `1px dashed ${POS_T.primaryContainer}`, background: POS_T.surfaceContainerLow, color: POS_T.primary }}>
              <MIcon name="add" size={18} />
              Add item to order
            </button>
          ) : (
            <div className="mt-4 p-3 rounded-xl" style={{ border: `1px solid ${POS_T.outlineVariant}`, background: POS_T.surfaceContainerLowest }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold uppercase tracking-[0.1em]" style={{ color: POS_T.onSurfaceVariant }}>Add an item</div>
                <button onClick={() => setPickerOpen(false)}
                  className="text-xs font-bold px-2 py-1 rounded"
                  style={{ color: POS_T.onSurfaceVariant, border: `1px solid ${POS_T.outlineVariant}` }}>
                  Close picker
                </button>
              </div>
              <ProductPicker products={products} onAdd={handleAddItem}  stitchingMaster={stitchingMaster}/>
            </div>
          )}

          {(items.length > 0 || addedItems.length > 0) && (
            <div className="text-[11px] mt-3 px-1 inline-flex items-center gap-1" style={{ color: POS_T.onSurfaceVariant }}>
              <MIcon name="info" size={12} />
              Existing items use their saved unit price. New items use their MRP; GST and totals recompute on save.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${POS_T.outlineVariant}`, background: POS_T.surfaceContainerLow, paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
          <button onClick={onClose}
            className="text-sm font-bold px-4 py-2.5 rounded-full"
            style={{ border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving || !hasChanges}
            className="text-sm font-bold px-5 py-2.5 rounded-full inline-flex items-center gap-1.5"
            style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary, opacity: (saving || !hasChanges) ? 0.4 : 1 }}>
            <MIcon name="save" size={16} />
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, children }) => (
  <div>
    <label className="block mb-1 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: POS_T.onSurfaceVariant }}>{label}</label>
    {children}
  </div>
)
const Text = ({ value, onChange, type = 'text' }) => (
  <input
    type="text"
    inputMode={type === 'number' ? 'decimal' : 'text'}
    value={value || ''}
    onChange={e => onChange(e.target.value)}
    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
    style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}
  />
)
const Select = ({ value, onChange, options = [], labels }) => (
  <select value={value || ''} onChange={e => onChange(e.target.value)}
    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
    style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
    {options.map(o => <option key={o} value={o}>{(labels && labels[o]) || o || '—'}</option>)}
  </select>
)

export default EditOrderModal

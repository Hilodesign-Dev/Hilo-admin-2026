import React, { useState, useEffect } from 'react'
import { GARMENT_CATEGORIES, buildGarmentTypeOptions, categoryFromGarmentType } from './constants'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { logAndToast } from '../../lib/logger'
import { filterProductionManagers } from '../../lib/helpers'

/**
 * Phase 3 — Confirmation gate.
 *
 * For a Pending POS order, the stylist must fill production prerequisites on
 * each line item before the order can leave Pending state. Once every item is
 * "Ready", clicking Confirm flips the order:
 *   shopify_orders.order_status   pending  -> confirmed
 *   shopify_orders.confirmed_at   now()
 *   shopify_orders.confirmed_by   stylist name
 *   order_line_items.production_stage   pending -> fabrication
 *   order_line_items.confirmation_status  incomplete -> confirmed
 *
 * Per-item fields filled here (matches Production tab's customisation panel):
 *   - garment_category   (drives measurement panel; required for custom)
 *   - vendor / fabric    (production manager actually picks; pre-selection OK)
 *   - colour             (free text)
 *   - product_executive  (optional)
 *
 * Catalog items with non-MTF sizes auto-mark as ready (no fabric/measurement
 * entry needed).
 */
const ConfirmOrderModal = ({ stitchingMaster = [], order, stylist, teamMembers, products, onClose, onConfirmed }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState({}) // tempId -> {garment_category, colour, notes, product_executive}

  useEffect(() => { load() }, [order.id])

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await supa.from('order_line_items')
        .select('*').eq('order_id', order.id).order('is_set_component', { ascending: true })
      setItems(data || [])
      const draft = {}
      ;(data || []).forEach(li => {
        draft[li.id] = {
          garment_category: li.garment_category || '',
          garment_type: li.garment_type || '',
          colour: li.colour || '',
          custom_requirements: li.custom_requirements || '',
          product_executive: li.product_executive || '',
        }
      })
      setEditing(draft)
    } finally { setLoading(false) }
  }

  const isReady = (li) => {
    if (li.confirmation_status === 'confirmed') return true
    // Catalog non-MTF rows are ready by default
    if (li.product_type === 'catalog' && li.size && li.size !== 'MTF') return true
    // Custom rows need at least a garment category and (if MTF) measurements
    const draft = editing[li.id] || {}
    if (!draft.garment_type) return false
    if (li.measurement_status === 'pending') return false
    return true
  }

  const allReady = items.length > 0 && items.every(isReady)

  const setField = (id, patch) => setEditing(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const confirmAll = async () => {
    if (!allReady) return
    setSaving(true)
    try {
      for (const li of items) {
        const draft = editing[li.id] || {}
        await supa.from('order_line_items').update({
          garment_category: draft.garment_category || null,
          garment_type: draft.garment_type || null,
          colour: draft.colour || null,
          custom_requirements: draft.custom_requirements || null,
          product_executive: draft.product_executive || null,
          production_stage: 'fabrication',
          confirmation_status: 'confirmed',
        }).eq('id', li.id)
      }
      await supa.from('shopify_orders').update({
        order_status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmed_by: stylist?.name || null,
      }).eq('id', order.id)
      toast(true, 'Order confirmed — moved to production')
      onConfirmed?.()
      onClose?.()
    } catch (e) { logAndToast('pos-confirm', 'Failed to confirm order: ' + (e.message || e), e) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-3xl rounded-2xl overflow-hidden flex flex-col" style={{ background: '#fff', maxHeight: '92vh' }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <div>
            <div className="text-xs font-bold uppercase mb-0.5" style={{ color: C.textMuted }}>Confirm Order — {order.order_number}</div>
            <div className="text-sm font-bold" style={{ color: C.text }}>{order.customer_name}</div>
          </div>
          <div className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: '#fff3cd', color: '#a16207' }}>PENDING</div>
        </div>

        <div className="px-5 py-3 border-b" style={{ borderColor: C.border, background: C.bg }}>
          <div className="text-xs" style={{ color: C.textMuted }}>
            {items.filter(isReady).length} of {items.length} items ready
          </div>
          <div className="mt-2 h-2 rounded-full" style={{ background: '#fff' }}>
            <div className="h-2 rounded-full" style={{ width: `${items.length ? (items.filter(isReady).length / items.length) * 100 : 0}%`, background: C.gold }} />
          </div>
        </div>

        <div className="overflow-y-auto p-4 space-y-3" style={{ flex: 1 }}>
          {loading && <div className="text-xs text-center py-8" style={{ color: C.textMuted }}>Loading items…</div>}
          {!loading && items.map(li => {
            const draft = editing[li.id] || {}
            const ready = isReady(li)
            const isCatalog = li.product_type === 'catalog' && li.size !== 'MTF'
            return (
              <div key={li.id} className="rounded-lg p-3" style={{ background: '#fff', border: `1px solid ${ready ? C.green : C.amber}`, borderLeftWidth: '4px' }}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate" style={{ color: C.text }}>{li.title}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: C.textMuted }}>
                      {li.is_set_component ? '↳ set component' : (li.product_type === 'catalog' ? 'CATALOG' : 'CUSTOM')} · {li.size} · Qty {li.quantity}
                    </div>
                  </div>
                  <div className="px-2 py-0.5 rounded-full text-[10px] font-bold ml-2" style={{ background: ready ? C.greenBg : '#fff3cd', color: ready ? C.green : '#a16207' }}>
                    {ready ? 'READY' : 'INCOMPLETE'}
                  </div>
                </div>

                {!isCatalog && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                    <Field label="Garment Category">
                      <select value={draft.garment_type || ''} onChange={e => { const v = e.target.value; setField(li.id, { garment_type: v, garment_category: categoryFromGarmentType(stitchingMaster, v) }) }}
                        className="w-full text-xs px-2 py-1.5 rounded outline-none" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                        <option value="">—</option>
                        <option value="" disabled>— pick a garment type —</option>{buildGarmentTypeOptions(stitchingMaster).map(g => (<optgroup key={g.category} label={g.category}>{g.types.map(t => <option key={t.value} value={t.value}>{t.label}{t.cost ? ` · ₹${t.cost}` : ''}</option>)}</optgroup>))}
                      </select>
                    </Field>
                    <Field label="Colour">
                      <input value={draft.colour || ''} onChange={e => setField(li.id, { colour: e.target.value })}
                        placeholder="e.g. Ivory"
                        className="w-full text-xs px-2 py-1.5 rounded outline-none" style={{ background: C.bg, border: `1px solid ${C.border}` }} />
                    </Field>
                    <Field label="Product Executive">
                      <select value={draft.product_executive || ''} onChange={e => setField(li.id, { product_executive: e.target.value })}
                        className="w-full text-xs px-2 py-1.5 rounded outline-none" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                        <option value="">—</option>
                        {filterProductionManagers(teamMembers).map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Measurements">
                      <div className="text-xs px-2 py-1.5 rounded" style={{ background: C.bg, color: li.measurement_status === 'pending' ? C.amber : C.green }}>
                        {li.measurement_status === 'pending' ? '⚠ Pending — collect from customer' : '✓ On file or N/A'}
                      </div>
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Customisation Notes">
                        <textarea rows={2} value={draft.custom_requirements || ''} onChange={e => setField(li.id, { custom_requirements: e.target.value })}
                          placeholder="Design brief for production team"
                          className="w-full text-xs px-2 py-1.5 rounded outline-none" style={{ background: C.bg, border: `1px solid ${C.border}` }} />
                      </Field>
                    </div>
                  </div>
                )}
                {isCatalog && (
                  <div className="text-[11px] mt-2" style={{ color: C.textMuted }}>
                    Catalog standard size — no extra production fields needed. Vendor will be assigned by the production manager.
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between gap-3" style={{ borderColor: C.border }}>
          <div className="text-[11px]" style={{ color: C.textMuted }}>
            {allReady ? 'All items ready — confirm to move to production' : 'Complete the highlighted fields to confirm'}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm font-bold px-4 py-2 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.text }}>Close</button>
            <button onClick={confirmAll} disabled={!allReady || saving}
              className="text-sm font-bold px-5 py-2 rounded-lg"
              style={{ background: C.gold, color: '#fff', opacity: (!allReady || saving) ? 0.4 : 1 }}>
              {saving ? 'Confirming…' : '✓ Confirm & start production'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, children }) => (
  <div>
    <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: C.textMuted }}>{label}</label>
    {children}
  </div>
)

export default ConfirmOrderModal

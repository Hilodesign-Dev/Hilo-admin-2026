import React, { useState, useEffect, useMemo } from 'react'
import FabricPicker from '../../components/FabricPicker'
import { GARMENT_APPROX_METRES, buildGarmentTypeOptions, categoryFromGarmentType, stitchCostFromGarmentType } from './constants'
import { POS_T, MIcon } from './tokens'

/**
 * Per-component COGS + design panel for quotations.
 *
 * Reuses the existing FabricPicker (with image thumbnails + cost auto-fill)
 * from src/components/FabricPicker — same component the Calculator and the
 * Production tab use. Garment category auto-fills metres from
 * GARMENT_APPROX_METRES. Stitching cost auto-fills from stitchingMaster
 * when a category match exists.
 *
 * Bubbles up via onChange({ ...cogs, total }).
 */
const QuotationCogsPanel = ({ value = {}, defaultCategory, fabrics = [], stitchingMaster = [], onChange }) => {
  const [v, setV] = useState({
    garment_type:     value.garment_type     || '',
    garment_category: value.garment_category || defaultCategory || '',
    fabricId:         value.fabricId || '',
    fabricName:       value.fabricName || '',
    fabricPrice:      value.fabricPrice ?? '',
    metres:           value.metres ?? (GARMENT_APPROX_METRES[defaultCategory] || ''),
    dye:              value.dye ?? '',
    embroidery:       value.embroidery ?? '',
    stitching:        value.stitching ?? '',
    accessories:      value.accessories ?? '',
    colour:           value.colour || '',
    notes:            value.notes || '',
    refImageUrl:      value.refImageUrl || '',
  })

  // Helper — compute total from current values
  const computeTotal = (state) => {
    const fabric = Number(state.fabricPrice || 0) * Number(state.metres || 0)
    return fabric + Number(state.dye || 0) + Number(state.embroidery || 0) + Number(state.stitching || 0) + Number(state.accessories || 0)
  }
  const fabricSubtotal = useMemo(() => Number(v.fabricPrice || 0) * Number(v.metres || 0), [v.fabricPrice, v.metres])
  const total = useMemo(() => computeTotal(v), [v])

  const set = (patch) => {
    const next = { ...v, ...patch }
    // Garment category change → auto-fill metres + stitching from masters
    if ((patch.garment_type && patch.garment_type !== v.garment_type) || (patch.garment_category && patch.garment_category !== v.garment_category)) {
      if (!next.metres || next.metres === '') {
        const m = GARMENT_APPROX_METRES[patch.garment_category]
        if (m) next.metres = m
      }
      // Try to find a stitching entry matching the category
      const directCost = stitchCostFromGarmentType(stitchingMaster, patch.garment_type)
      const stitchMatch = directCost > 0 ? { cost: directCost } : (stitchingMaster || []).find(s =>
        (s.category || s.name || '').toLowerCase() === (patch.garment_category||'').toLowerCase()
      )
      if (stitchMatch && (!v.stitching || v.stitching === '')) {
        next.stitching = stitchMatch.cost || stitchMatch.price || ''
      }
    }
    setV(next)
    if (onChange) onChange({ ...next, total: computeTotal(next) })
  }

  // When user picks a fabric, auto-fill fabricName + fabricPrice from the fabric row
  const onFabricPick = (fabricId) => {
    const f = (fabrics || []).find(x => String(x.id) === String(fabricId))
    const patch = {
      fabricId,
      fabricName:  f?.name || v.fabricName,
      fabricPrice: f?.costPerMetre || f?.cost_per_metre || v.fabricPrice,
    }
    set(patch)
  }

  return (
    <div className="rounded-lg p-3 space-y-3"
      style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>

      {/* Row 1: garment + colour */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Garment Category">
          <select value={v.garment_category} onChange={e => set({ garment_category: e.target.value })}
            className="w-full text-xs px-2 py-2 rounded outline-none"
            style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
            <option value="">—</option>
            {GARMENT_CATEGORIES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="Colour">
          <input value={v.colour} onChange={e => set({ colour: e.target.value })}
            placeholder="e.g. Ivory"
            className="w-full text-xs px-2 py-2 rounded outline-none"
            style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
        </Field>
      </div>

      {/* Row 2: Fabric picker (full width) */}
      <div>
        <label className="block mb-1 text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{ color: POS_T.onSurfaceVariant }}>Fabric</label>
        <FabricPicker fabrics={fabrics} value={v.fabricId} onChange={onFabricPick}
          showCost compact placeholder="Choose a fabric…" />
      </div>

      {/* Row 3: fabric cost / metres / subtotal — all linked */}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Cost / metre">
          <NumInput value={v.fabricPrice} onChange={x => set({ fabricPrice: x })} />
        </Field>
        <Field label="Metres">
          <NumInput value={v.metres} onChange={x => set({ metres: x })} />
        </Field>
        <Field label="Fabric subtotal">
          <div className="text-sm font-mono py-2 px-2 rounded"
            style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
            ₹{fabricSubtotal.toLocaleString('en-IN')}
          </div>
        </Field>
      </div>

      {/* Row 4: extras */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Dye">          <NumInput value={v.dye}         onChange={x => set({ dye: x })} /> </Field>
        <Field label="Embroidery">   <NumInput value={v.embroidery}  onChange={x => set({ embroidery: x })} placeholder="if known" /> </Field>
        <Field label="Stitching">    <NumInput value={v.stitching}   onChange={x => set({ stitching: x })} /> </Field>
        <Field label="Accessories">  <NumInput value={v.accessories} onChange={x => set({ accessories: x })} /> </Field>
      </div>

      {/* Reference image + notes */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <Field label="Reference image (URL)">
          <input value={v.refImageUrl} onChange={e => set({ refImageUrl: e.target.value })}
            placeholder="Paste image URL or upload via Production later"
            className="w-full text-xs px-2 py-2 rounded outline-none"
            style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
        </Field>
        {v.refImageUrl && (
          <div className="w-16 h-16 rounded overflow-hidden flex-shrink-0"
            style={{ border: `1px solid ${POS_T.outlineVariant}` }}>
            <img src={v.refImageUrl} alt="ref" className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none' }} />
          </div>
        )}
      </div>
      <Field label="Customisation notes">
        <input value={v.notes} onChange={e => set({ notes: e.target.value })}
          placeholder="Design brief / customer's reference notes"
          className="w-full text-xs px-2 py-2 rounded outline-none"
          style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
      </Field>

      {/* Total bar */}
      <div className="flex items-center justify-between p-2.5 rounded-lg"
        style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>
        <span className="text-[10px] font-bold tracking-[0.1em] uppercase inline-flex items-center gap-1.5">
          <MIcon name="calculate" size={14} />
          Component COGS
        </span>
        <span className="text-base font-bold font-mono">₹{total.toLocaleString('en-IN')}</span>
      </div>
    </div>
  )
}

const Field = ({ label, children }) => (
  <div>
    <label className="block mb-1 text-[10px] font-bold uppercase tracking-[0.1em]"
      style={{ color: POS_T.onSurfaceVariant }}>{label}</label>
    {children}
  </div>
)

const NumInput = ({ value, onChange, placeholder = '0' }) => (
  <input type="text" inputMode="decimal" value={value}
    onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
    placeholder={placeholder}
    className="w-full text-xs px-2 py-2 rounded outline-none text-right font-mono"
    style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
)

export default QuotationCogsPanel

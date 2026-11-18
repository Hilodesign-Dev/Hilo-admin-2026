import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { fmt, n, calcCogs, calcPieceCogs, effectiveSP, gmPct } from '../../lib/helpers'
import { variantPriceRange } from '../../lib/catalogueV2'
import FabricPicker from '../../components/FabricPicker'
import ImageLightbox from './ImageLightbox'

/* CatalogueQuickEntryV2 — parity with V1 ProductForm + image preview.
   - Fabric: real FabricPicker (image + cost), picking auto-fills ₹/m.
   - Dye: <select> from dyes master, picking auto-fills dye/m.
   - Category: <select> from categories, picking auto-fills stitching
     + accessories defaults + metres (from consumption when fabric set).
   - Embroidery type: Hand / Machine variants.
   - Stitching: free input + "↑ from master" pick.
   - Image: clickable thumbnail → ImageLightbox carousel. */

const blank = (v) => (v === '' || v === undefined ? null : v)
const numOrNull = (v) => (v === '' || v == null) ? null : Number(String(v).replace(/[^0-9.-]/g, '')) || null

const VARIANT_FIELDS = [
  'is_set', 'set_components', 'category',
  'cogs', 'embroidery', 'embroidery_type', 'stitching', 'total_dye', 'accessories', 'bottom_cogs',
  'fabric_id', 'fabric_name', 'fabric_sku', 'fabric_grade', 'fabric_tag',
  'metres', 'cost_per_metre', 'dye_id', 'dye_per_metre',
  'proposed_mrp', 'cogs_notes',
]

const emptyPiece = () => ({
  id: 'p_' + Math.random().toString(36).slice(2, 9),
  name: '', category: '', fabricId: '', fabricName: '',
  metres: 0, costPerMetre: 0, dyeId: '', dyePerMetre: 0,
  stitching: 0, embroidery: 0, embroidery_type: '', accessories: 0,
  costType: 'per_metre',
})

const initFromVariant = (v) => {
  const o = {}
  VARIANT_FIELDS.forEach(k => {
    if (k === 'is_set') o[k] = !!v?.[k]
    else if (k === 'set_components') o[k] = Array.isArray(v?.set_components) ? v.set_components : []
    else o[k] = v?.[k] ?? null
  })
  return o
}

const equalJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const liveCogs = (state) => {
  if (state.is_set && Array.isArray(state.set_components) && state.set_components.length) {
    return state.set_components.reduce((sum, p) => sum + calcPieceCogs({
      metres: +p.metres || 0, costPerMetre: +p.costPerMetre || 0,
      dyePerMetre: +p.dyePerMetre || 0,
      stitching: +p.stitching || 0, embroidery: +p.embroidery || 0,
      accessories: +p.accessories || 0,
    }), 0)
  }
  return calcCogs({
    metres: state.metres, costPerMetre: state.cost_per_metre,
    dyePerMetre: state.dye_per_metre, totalDye: state.total_dye,
    stitching: state.stitching, embroidery: state.embroidery,
    accessories: state.accessories, bottomCogs: state.bottom_cogs,
  })
}

const resolveFabric = (fabrics, val) => {
  if (!val) return null
  return fabrics.find(f => f.id === val || f._oldId === val || f.fabricSKU === val) || null
}

const productImages = (product) => {
  const out = []
  if (product?.image_url) out.push(product.image_url)
  let extra = product?.shopify_images
  if (typeof extra === 'string') { try { extra = JSON.parse(extra) } catch { extra = [] } }
  if (Array.isArray(extra)) {
    extra.forEach(img => {
      const url = typeof img === 'string' ? img : (img && (img.src || img.url))
      if (url && !out.includes(url)) out.push(url)
    })
  }
  return out
}

const Inp = ({ value, onChange, placeholder, num = false, mono = false, w = '' }) => (
  <input
    type="text"
    inputMode={num ? 'decimal' : 'text'}
    value={value ?? ''}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    className={'px-2 py-1 text-xs rounded border border-gray-200 focus:border-amber-400 focus:outline-none bg-white ' + (mono ? 'font-mono ' : '') + w}
  />
)

const Sel = ({ value, onChange, options, placeholder = '—', w = '' }) => (
  <select
    value={value ?? ''}
    onChange={e => onChange(e.target.value)}
    className={'px-2 py-1 text-xs rounded border border-gray-200 focus:border-amber-400 focus:outline-none bg-white ' + w}
  >
    <option value="">{placeholder}</option>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
)

const SmallToggle = ({ value, onChange, labelOn = 'Yes', labelOff = 'No' }) => (
  <button type="button" onClick={() => onChange(!value)}
    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
    style={{
      background: value ? '#dcfce7' : '#f3f4f6',
      color: value ? '#15803d' : '#6b7280',
      border: '1px solid ' + (value ? '#bbf7d0' : '#e5e7eb'),
    }}>
    <span className="w-1.5 h-1.5 rounded-full mr-1" style={{ background: value ? '#15803d' : '#9ca3af' }} />
    {value ? labelOn : labelOff}
  </button>
)

const Pill = ({ children, tone = 'gray', mono = false }) => {
  const tones = {
    gray: 'bg-gray-100 text-gray-600', gold: 'bg-amber-50 text-amber-700',
    green: 'bg-green-50 text-green-700', red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700', indigo: 'bg-indigo-50 text-indigo-700',
  }
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tones[tone]} ${mono ? 'font-mono' : ''}`}>{children}</span>
}

const RowCard = ({
  product, variantIdx, variant,
  fabrics, dyes, categories, consumption, stitchingMaster,
  expanded, onToggle, onSaved, onOpenLightbox,
}) => {
  const original = useMemo(() => initFromVariant(variant), [variant, variantIdx])
  const [state, setState] = useState(original)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { setState(original); setMsg('') }, [original])

  const dirty = !equalJson(state, original)
  const set = (k, v) => setState(prev => ({ ...prev, [k]: v }))
  const setPiece = (i, patch) => setState(prev => ({
    ...prev,
    set_components: (prev.set_components || []).map((p, j) => j === i ? { ...p, ...patch } : p),
  }))
  const addPiece = () => setState(prev => ({
    ...prev,
    set_components: [...(prev.set_components || []), emptyPiece()],
  }))
  const removePiece = (i) => setState(prev => ({
    ...prev,
    set_components: (prev.set_components || []).filter((_, j) => j !== i),
  }))

  // ---- AUTO-FILL HELPERS ----------------------------------------------------

  const pickFabric = (fid) => {
    const f = resolveFabric(fabrics, fid)
    set('fabric_id', fid || null)
    if (f) {
      set('fabric_name', f.name)
      if (f.costPerMetre) set('cost_per_metre', f.costPerMetre)
    }
    if (f && state.category && consumption?.length) {
      const rule = consumption.find(c =>
        c.category === state.category &&
        (c.fabricId === fid || resolveFabric(fabrics, c.fabricId)?.id === f.id)
      )
      if (rule?.metres) setTimeout(() => set('metres', rule.metres), 0)
    }
  }

  const pickDye = (did) => {
    set('dye_id', did || null)
    if (did) {
      const d = dyes.find(x => x.id === did)
      if (d?.costPerMetre != null) set('dye_per_metre', d.costPerMetre)
    } else {
      set('dye_per_metre', null)
    }
  }

  const pickCategory = (cat) => {
    set('category', cat || null)
    if (!cat) return
    const sm = stitchingMaster?.find(s => s.category === cat || s.garmentType === cat)
    if (sm?.cost != null) set('stitching', sm.cost)
    const cm = categories?.find(c => c.name === cat)
    if (cm?.defaultAccessories?.length) {
      const acc = cm.defaultAccessories.reduce((s, a) => s + (a.cost || 0), 0)
      if (acc > 0) set('accessories', acc)
    }
    if (state.fabric_id && consumption?.length) {
      const f = resolveFabric(fabrics, state.fabric_id)
      const rule = consumption.find(c =>
        c.category === cat &&
        (c.fabricId === state.fabric_id || (f && resolveFabric(fabrics, c.fabricId)?.id === f.id))
      )
      if (rule?.metres) setTimeout(() => set('metres', rule.metres), 0)
    }
  }

  const pickPieceFabric = (i, fid) => {
    const f = resolveFabric(fabrics, fid)
    const patch = { fabricId: fid || '', fabricName: f?.name || '' }
    if (f?.costPerMetre) patch.costPerMetre = f.costPerMetre
    if (f && consumption?.length) {
      const piece = state.set_components?.[i]
      if (piece?.category) {
        const rule = consumption.find(c =>
          c.category === piece.category &&
          (c.fabricId === fid || resolveFabric(fabrics, c.fabricId)?.id === f.id)
        )
        if (rule?.metres) patch.metres = rule.metres
      }
    }
    setPiece(i, patch)
  }
  const pickPieceDye = (i, did) => {
    const d = did ? dyes.find(x => x.id === did) : null
    const patch = { dyeId: did || '' }
    if (d?.costPerMetre != null) patch.dyePerMetre = d.costPerMetre
    else if (!did) patch.dyePerMetre = 0
    setPiece(i, patch)
  }
  const pickPieceCategory = (i, cat) => {
    const patch = { category: cat || '' }
    if (cat) {
      const sm = stitchingMaster?.find(s => s.category === cat || s.garmentType === cat)
      if (sm?.cost != null) patch.stitching = sm.cost
      const piece = state.set_components?.[i]
      if (piece?.fabricId && consumption?.length) {
        const rule = consumption.find(c => c.category === cat && c.fabricId === piece.fabricId)
        if (rule?.metres) patch.metres = rule.metres
      }
    }
    setPiece(i, patch)
  }

  // ---- DERIVED --------------------------------------------------------------

  const sizes = variant?.sizes || []
  const sizeCount = sizes.length
  const pr = variantPriceRange(variant)
  const totalCogs = liveCogs(state)
  const variantRev = +(sizes[0]?.selling_price ?? sizes[0]?.mrp) || pr.min || 0
  const gm = gmPct(variantRev, totalCogs, pr.min || pr.max || 0)
  const images = productImages(product)
  const categoryOptions = (categories || []).map(c => ({ value: c.name, label: c.name }))
  const dyeOptions = (dyes || []).filter(d => d.is_active !== false).map(d => ({
    value: d.id, label: `${d.type || d.name}${d.costPerMetre ? ' (₹' + d.costPerMetre + '/m)' : ''}`,
  }))
  const stitchingMasterOptions = (stitchingMaster || []).map(s => ({
    value: s.id, label: `${s.garmentType || s.category || s.name} (₹${s.cost})`,
  }))

  // ---- PERSIST --------------------------------------------------------------

  const save = async (extraPatch = {}) => {
    setBusy(true); setMsg('')
    try {
      const variants = Array.isArray(product.variants) ? [...product.variants] : []
      const next = { ...variants[variantIdx] }
      VARIANT_FIELDS.forEach(k => {
        if (k === 'is_set') next[k] = !!state.is_set
        else if (k === 'set_components') next[k] = Array.isArray(state.set_components) ? state.set_components : []
        else if (['cogs', 'embroidery', 'stitching', 'total_dye', 'accessories', 'bottom_cogs', 'metres', 'cost_per_metre', 'dye_per_metre', 'proposed_mrp'].includes(k)) next[k] = numOrNull(state[k])
        else next[k] = blank(state[k])
      })
      next.cogs = +totalCogs.toFixed(2) || null
      Object.assign(next, extraPatch)
      variants[variantIdx] = next
      const { data, error } = await supa.from('catalogue_products')
        .update({ variants, updated_at: new Date().toISOString() })
        .eq('id', product.id)
        .select().maybeSingle()
      if (error) throw error
      setMsg('Saved')
      onSaved && onSaved(data)
    } catch (e) {
      setMsg('Error: ' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }
  const updateStatus = (status, extra = {}) => save({ cogs_review_status: status, ...extra })
  const status = variant?.cogs_review_status || 'pending_entry'

  // ---- RENDER ---------------------------------------------------------------

  return (
    <div className="bg-white border border-gray-100 rounded-lg overflow-hidden hover:border-amber-200 transition-colors">
      <div className="grid grid-cols-12 items-center gap-2 px-3 py-2 cursor-pointer" onClick={onToggle}>
        <div className="col-span-1">
          {product.image_url ? (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); if (images.length) onOpenLightbox(images, 0) }}
              className="w-10 h-10 rounded-lg overflow-hidden border border-gray-100 hover:border-amber-400 hover:shadow-md transition-all relative"
              title={images.length > 1 ? `View ${images.length} photos` : 'View photo'}
            >
              <img src={product.image_url} alt="" className="w-full h-full object-cover" onError={e => e.target.style.display = 'none'} />
              {images.length > 1 && (
                <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[8px] px-1 rounded-tl">{images.length}</span>
              )}
            </button>
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-base">📷</div>
          )}
        </div>
        <div className="col-span-3 min-w-0">
          <div className="text-[11px] font-mono text-amber-700 truncate">{variant?.style_code || '—'}</div>
          <div className="text-sm font-semibold text-gray-800 truncate">{product.product_title || '(untitled)'}</div>
          {variant?.composition && <div className="text-[11px] text-gray-500 truncate">{variant.composition}</div>}
        </div>
        <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
          <Pill tone={status === 'finalized' ? 'green' : status === 'in_review' ? 'amber' : status === 'rejected' ? 'red' : 'gray'}>
            {status.replace('_', ' ')}
          </Pill>
          {state.category && <Pill tone="indigo">{state.category}</Pill>}
          <Pill tone="gray">{sizeCount} sz</Pill>
          {state.is_set && <Pill tone="blue">set · {(state.set_components || []).length}</Pill>}
        </div>
        <div className="col-span-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[9px] text-gray-400">COGS</div>
            <div className="text-xs font-bold" style={{ color: '#494bd6' }}>{totalCogs > 0 ? '₹' + fmt(n(totalCogs).toFixed(0)) : '—'}</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-400">MRP</div>
            <div className="text-xs font-bold text-gray-800">{pr.min > 0 ? (pr.min === pr.max ? '₹' + fmt(pr.min) : '₹' + fmt(pr.min) + '–' + fmt(pr.max)) : '—'}</div>
          </div>
          <div>
            <div className="text-[9px] text-gray-400">GM%</div>
            <div className="text-xs font-bold" style={{ color: gm > 0.5 ? '#16a34a' : gm > 0.3 ? '#d97706' : '#dc2626' }}>
              {totalCogs > 0 ? (gm * 100).toFixed(1) + '%' : '—'}
            </div>
          </div>
        </div>
        <div className="col-span-2 flex items-center justify-end gap-1">
          <span className="text-[10px] text-gray-400">{expanded ? '▾' : '▸'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 bg-gray-50/40">
          <div className="flex items-center gap-3 mb-2 text-xs flex-wrap">
            <label className="text-gray-500">Is set?</label>
            <SmallToggle value={state.is_set} onChange={v => set('is_set', v)} />
            {!state.is_set && (
              <>
                <label className="text-gray-500 ml-2">Garment</label>
                <Sel value={state.category} onChange={pickCategory} options={categoryOptions} placeholder="— Pick garment type —" w="min-w-[180px]" />
                <span className="text-[10px] text-gray-400">picking auto-fills stitching + metres (when fabric set)</span>
              </>
            )}
          </div>

          {state.is_set ? (
            <div className="space-y-1.5">
              <div className="grid grid-cols-12 gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 px-1">
                <div className="col-span-2">Piece + garment</div>
                <div className="col-span-3">Fabric</div>
                <div className="col-span-1">Metres</div>
                <div className="col-span-1">₹/m</div>
                <div className="col-span-2">Dye</div>
                <div className="col-span-1">Stitch</div>
                <div className="col-span-1">Embroid</div>
                <div className="col-span-1 text-right">COGS</div>
              </div>
              {(state.set_components || []).map((p, i) => {
                const pCogs = calcPieceCogs({ metres: +p.metres || 0, costPerMetre: +p.costPerMetre || 0, dyePerMetre: +p.dyePerMetre || 0, stitching: +p.stitching || 0, embroidery: +p.embroidery || 0, accessories: +p.accessories || 0 })
                return (
                  <div key={p.id || i} className="grid grid-cols-12 gap-1.5 items-center bg-white rounded p-1.5">
                    <div className="col-span-2 space-y-1">
                      <Inp value={p.name} onChange={v => setPiece(i, { name: v })} placeholder={`Piece ${i + 1}`} w="w-full" />
                      <Sel value={p.category} onChange={c => pickPieceCategory(i, c)} options={categoryOptions} placeholder="garment" w="w-full" />
                    </div>
                    <div className="col-span-3">
                      <FabricPicker fabrics={fabrics} value={p.fabricId || ''} onChange={fid => pickPieceFabric(i, fid)} showCost compact placeholder="— Select fabric —" />
                    </div>
                    <div className="col-span-1"><Inp value={p.metres} onChange={v => setPiece(i, { metres: v })} num w="w-full" /></div>
                    <div className="col-span-1"><Inp value={p.costPerMetre} onChange={v => setPiece(i, { costPerMetre: v })} num w="w-full" /></div>
                    <div className="col-span-2 space-y-1">
                      <Sel value={p.dyeId} onChange={d => pickPieceDye(i, d)} options={dyeOptions} placeholder="No dye" w="w-full" />
                      <Inp value={p.dyePerMetre} onChange={v => setPiece(i, { dyePerMetre: v })} num placeholder="dye/m" w="w-full" />
                    </div>
                    <div className="col-span-1"><Inp value={p.stitching} onChange={v => setPiece(i, { stitching: v })} num w="w-full" /></div>
                    <div className="col-span-1"><Inp value={p.embroidery} onChange={v => setPiece(i, { embroidery: v })} num w="w-full" /></div>
                    <div className="col-span-1 flex items-center justify-end gap-1">
                      <span className="font-mono text-xs text-indigo-600">₹{fmt(pCogs.toFixed(0))}</span>
                      <button onClick={() => removePiece(i)} className="text-[10px] text-red-500 hover:text-red-700" title="Remove piece">✕</button>
                    </div>
                  </div>
                )
              })}
              <button onClick={addPiece} className="w-full text-xs px-3 py-1.5 rounded border border-dashed border-gray-300 text-gray-500 hover:bg-white">+ Add piece</button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-1.5 items-end">
                <div className="col-span-4">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Fabric</label>
                  <FabricPicker fabrics={fabrics} value={state.fabric_id || ''} onChange={pickFabric} showCost placeholder="— Select fabric —" />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Metres</label>
                  <Inp value={state.metres} onChange={v => set('metres', v)} num w="w-full" />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] text-gray-500 block mb-0.5">₹/m</label>
                  <Inp value={state.cost_per_metre} onChange={v => set('cost_per_metre', v)} num w="w-full" />
                </div>
                <div className="col-span-3">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Dye</label>
                  <Sel value={state.dye_id} onChange={pickDye} options={dyeOptions} placeholder="— No dye —" w="w-full" />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Dye/m</label>
                  <Inp value={state.dye_per_metre} onChange={v => set('dye_per_metre', v)} num w="w-full" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Total dye</label>
                  <Inp value={state.total_dye} onChange={v => set('total_dye', v)} num w="w-full" />
                </div>
              </div>

              <div className="grid grid-cols-12 gap-1.5 items-end">
                <div className="col-span-2">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Stitching</label>
                  <div className="flex gap-1">
                    <Inp value={state.stitching} onChange={v => set('stitching', v)} num w="flex-1 min-w-0" />
                    <select
                      onChange={e => { const m = stitchingMaster?.find(s => s.id === e.target.value); if (m) set('stitching', m.cost); e.target.value = '' }}
                      className="px-1 py-1 text-[10px] rounded border border-gray-200 bg-white text-gray-500 w-8"
                      defaultValue=""
                      title="From stitching master"
                    >
                      <option value="">↑</option>
                      {stitchingMasterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Embroid type</label>
                  <Sel
                    value={state.embroidery_type}
                    onChange={v => set('embroidery_type', v)}
                    options={[
                      { value: 'Hand Embroidery', label: 'Hand Embroidery' },
                      { value: 'Machine Embroidery', label: 'Machine Embroidery' },
                      { value: 'Machine Embroidery Type 1', label: 'Machine Emb Type 1' },
                      { value: 'Machine Embroidery Type 2', label: 'Machine Emb Type 2' },
                    ]}
                    placeholder="None"
                    w="w-full"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Embroid ₹</label>
                  <Inp value={state.embroidery} onChange={v => set('embroidery', v)} num w="w-full" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Accessories</label>
                  <Inp value={state.accessories} onChange={v => set('accessories', v)} num w="w-full" />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Bottom COGS</label>
                  <Inp value={state.bottom_cogs} onChange={v => set('bottom_cogs', v)} num w="w-full" />
                </div>
                <div className="col-span-3">
                  <label className="text-[10px] text-gray-500 block mb-0.5">Proposed MRP</label>
                  <Inp value={state.proposed_mrp} onChange={v => set('proposed_mrp', v)} num w="w-full" />
                </div>
              </div>
            </div>
          )}

          <div className="mt-2 grid grid-cols-12 gap-1.5 items-end">
            <div className="col-span-9">
              <label className="text-[10px] text-gray-500 block mb-0.5">Notes</label>
              <Inp value={state.cogs_notes} onChange={v => set('cogs_notes', v)} w="w-full" placeholder="Any context / source / assumptions…" />
            </div>
            <div className="col-span-3 flex items-end justify-end gap-1.5">
              {msg && <span className="text-[10px] text-gray-500 mr-1">{msg}</span>}
              <button onClick={() => save()} disabled={busy || !dirty} className="text-xs px-2.5 py-1 rounded font-bold"
                style={{ background: dirty && !busy ? '#c9a432' : '#e5e7eb', color: dirty && !busy ? '#fff' : '#9ca3af' }}>
                {busy ? '…' : (dirty ? 'Save' : 'Saved')}
              </button>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-gray-400 mr-1">Workflow:</span>
            <button onClick={() => updateStatus('pending_entry')} disabled={busy} className="text-[10px] px-2 py-0.5 rounded border border-gray-200 hover:bg-white">Save draft</button>
            <button onClick={() => updateStatus('in_review', { cogs_entered_at: new Date().toISOString() })} disabled={busy} className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>Submit for review</button>
            <button onClick={() => updateStatus('finalized', { cogs_finalized_at: new Date().toISOString() })} disabled={busy} className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ background: '#dcfce7', color: '#15803d' }}>Finalize</button>
            <button onClick={() => { const note = window.prompt('Reject reason:', ''); if (note != null) updateStatus('rejected', { cogs_rejection_note: note }) }} disabled={busy} className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ background: '#fee2e2', color: '#991b1b' }}>Reject</button>
          </div>
        </div>
      )}
    </div>
  )
}

const CatalogueQuickEntryV2 = ({
  products = [],
  fabrics = [], dyes = [], categories = [], consumption = [], stitchingMaster = [],
  mode = 'rows', onChanged,
}) => {
  const flat = useMemo(() => {
    const out = []
    products.forEach(p => {
      (p.variants || []).forEach((v, idx) => {
        out.push({ rowId: `${p.id}::${v.style_code || idx}::${idx}`, product: p, variantIdx: idx, variant: v })
      })
    })
    return out
  }, [products])

  const [expanded, setExpanded] = useState(() => new Set())
  useEffect(() => {
    if (mode === 'quick') {
      const all = new Set()
      flat.forEach(r => all.add(r.rowId))
      setExpanded(all)
    } else {
      setExpanded(new Set())
    }
  }, [mode, flat.length])

  const toggle = useCallback((rowId) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(rowId) ? next.delete(rowId) : next.add(rowId)
      return next
    })
  }, [])

  const expandAll = () => setExpanded(new Set(flat.map(r => r.rowId)))
  const collapseAll = () => setExpanded(new Set())

  const [lightbox, setLightbox] = useState(null)
  const openLightbox = (images, idx = 0) => setLightbox({ images, index: idx })
  const closeLightbox = () => setLightbox(null)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-gray-500">
          {flat.length.toLocaleString('en-IN')} variants
          {mode === 'rows' && <span className="ml-2 text-gray-400">· click a row to edit</span>}
          {mode === 'quick' && <span className="ml-2 text-gray-400">· all rows pre-expanded for fast entry</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={expandAll} className="text-[11px] px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">Expand all</button>
          <button onClick={collapseAll} className="text-[11px] px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">Collapse all</button>
        </div>
      </div>

      {flat.length === 0 && <div className="text-center text-gray-400 py-12 text-sm">No variants match.</div>}
      <div className="space-y-1.5">
        {flat.map(r => (
          <RowCard
            key={r.rowId}
            product={r.product}
            variantIdx={r.variantIdx}
            variant={r.variant}
            fabrics={fabrics}
            dyes={dyes}
            categories={categories}
            consumption={consumption}
            stitchingMaster={stitchingMaster}
            expanded={expanded.has(r.rowId)}
            onToggle={() => toggle(r.rowId)}
            onSaved={() => onChanged && onChanged()}
            onOpenLightbox={openLightbox}
          />
        ))}
      </div>

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={closeLightbox}
        />
      )}
    </div>
  )
}

export default CatalogueQuickEntryV2

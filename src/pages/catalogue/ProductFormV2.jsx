import React, { useState, useEffect, useMemo } from 'react'
import { supa } from '../../lib/supabase'
import { fmt } from '../../lib/helpers'

/* ProductFormV2 — editor components for the three surfaces of a
   catalogue_products row (spec §3.2). Each surface has its own Save.

   Exports:
     <ProductSurfaceForm   row onSaved />
     <VariantSurfaceForm   row variantIdx onChangeIdx onSaved />
     <SizeGridForm         row variantIdx onSaved />

   The forms update catalogue_products directly via supabase and call
   onSaved(updatedRow) so the parent can refresh. */

const TONES = {
  gray: { bg: '#f5f4f0', fg: '#6b7280' },
  gold: { bg: '#fef3c7', fg: '#92400e' },
  green: { bg: '#dcfce7', fg: '#15803d' },
  red: { bg: '#fee2e2', fg: '#991b1b' },
  amber: { bg: '#fef3c7', fg: '#92400e' },
  blue: { bg: '#dbeafe', fg: '#1e40af' },
  purple: { bg: '#ede9fe', fg: '#5b21b6' },
}
const Pill = ({ children, tone = 'gray' }) => {
  const t = TONES[tone] || TONES.gray
  return <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: t.bg, color: t.fg }}>{children}</span>
}

const STATUS_TONE = {
  finalized: 'green',
  in_review: 'amber',
  rejected: 'red',
  pending_entry: 'gray',
}

const Label = ({ children }) => (
  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{children}</div>
)

const Field = ({ label, children, span = 1 }) => (
  <div style={{ gridColumn: `span ${span} / span ${span}` }}>
    <div className="text-[11px] text-gray-500 mb-0.5">{label}</div>
    {children}
  </div>
)

const TextInput = ({ value, onChange, placeholder, ...rest }) => (
  <input
    type="text"
    value={value ?? ''}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:border-amber-400 focus:outline-none bg-white"
    {...rest}
  />
)

const NumInput = ({ value, onChange, placeholder, ...rest }) => (
  <input
    type="text"
    inputMode="decimal"
    value={value === null || value === undefined ? '' : value}
    onChange={e => {
      const v = e.target.value
      if (v === '') return onChange(null)
      const n = Number(v.replace(/[^0-9.-]/g, ''))
      onChange(isFinite(n) ? n : null)
    }}
    placeholder={placeholder}
    className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:border-amber-400 focus:outline-none bg-white text-right tabular-nums"
    {...rest}
  />
)

const TextArea = ({ value, onChange, rows = 3, placeholder }) => (
  <textarea
    value={value ?? ''}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    rows={rows}
    className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 focus:border-amber-400 focus:outline-none bg-white resize-y"
  />
)

const Toggle = ({ value, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
    style={{
      background: value ? '#dcfce7' : '#f3f4f6',
      color: value ? '#15803d' : '#6b7280',
      border: '1px solid ' + (value ? '#bbf7d0' : '#e5e7eb'),
    }}
  >
    <span className="w-2 h-2 rounded-full mr-1.5" style={{ background: value ? '#15803d' : '#9ca3af' }} />
    {value ? 'On' : 'Off'}
  </button>
)

const SaveBar = ({ dirty, busy, msg, onSave, onReset }) => (
  <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
    {msg && <span className="text-[11px] text-gray-500">{msg}</span>}
    {dirty && (
      <button onClick={onReset} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
        Reset
      </button>
    )}
    <button
      onClick={onSave}
      disabled={!dirty || busy}
      className="text-xs px-3 py-1.5 rounded-lg font-medium"
      style={{
        background: !dirty || busy ? '#e5e7eb' : '#c9a432',
        color: !dirty || busy ? '#9ca3af' : '#fff',
        cursor: !dirty || busy ? 'not-allowed' : 'pointer',
      }}
    >
      {busy ? 'Saving…' : (dirty ? 'Save' : 'Saved')}
    </button>
  </div>
)

const objEqual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// ============================================================================
// Surface 1 — Product zone
// ============================================================================

const PRODUCT_FIELDS = [
  'product_title', 'handle', 'vendor', 'product_type',
  'category', 'style_type', 'fit_type', 'look_type', 'style_tag',
  'description', 'wash_care', 'occasion_tag', 'target_group',
  'colour_primary', 'colour_secondary',
  'collar_type', 'sleeve_length', 'sleeve_desc', 'closure_type',
  'pattern', 'gender', 'season',
  'distinguishing_feature', 'suggested_styling',
  'country_of_origin', 'hsn',
  'manufacture_days', 'ship_time',
  'seo_title', 'seo_description',
]

export const ProductSurfaceForm = ({ row, onSaved }) => {
  const original = useMemo(() => {
    const o = {}
    PRODUCT_FIELDS.forEach(k => { o[k] = row?.[k] ?? null })
    return o
  }, [row])
  const [form, setForm] = useState(original)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { setForm(original); setMsg('') }, [original])

  const dirty = !objEqual(form, original)
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const save = async () => {
    setBusy(true); setMsg('')
    try {
      const patch = { ...form, updated_at: new Date().toISOString() }
      const { data, error } = await supa.from('catalogue_products')
        .update(patch).eq('id', row.id).select().maybeSingle()
      if (error) throw error
      setMsg('Saved.')
      onSaved && onSaved(data)
    } catch (e) {
      setMsg('Error: ' + (e?.message || String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <Label>Product zone</Label>
          <div className="text-base font-semibold text-gray-800">{row?.product_title || '(untitled)'}</div>
          {row?.shopify_product_id && (
            <div className="text-[11px] text-gray-400 font-mono">spid {row.shopify_product_id}</div>
          )}
        </div>
        {row?.image_url && (
          <img src={row.image_url} alt="" className="w-20 h-20 rounded-xl object-cover" />
        )}
      </div>

      <Label>Identity</Label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Field label="Title" span={3}><TextInput value={form.product_title} onChange={v => set('product_title', v)} /></Field>
        <Field label="Handle"><TextInput value={form.handle} onChange={v => set('handle', v)} /></Field>
        <Field label="Vendor"><TextInput value={form.vendor} onChange={v => set('vendor', v)} /></Field>
        <Field label="Product type"><TextInput value={form.product_type} onChange={v => set('product_type', v)} /></Field>
      </div>

      <Label>Taxonomy</Label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Field label="Category"><TextInput value={form.category} onChange={v => set('category', v)} /></Field>
        <Field label="Style type"><TextInput value={form.style_type} onChange={v => set('style_type', v)} /></Field>
        <Field label="Fit type"><TextInput value={form.fit_type} onChange={v => set('fit_type', v)} /></Field>
        <Field label="Look type"><TextInput value={form.look_type} onChange={v => set('look_type', v)} /></Field>
        <Field label="Style tag"><TextInput value={form.style_tag} onChange={v => set('style_tag', v)} /></Field>
        <Field label="Occasion tag"><TextInput value={form.occasion_tag} onChange={v => set('occasion_tag', v)} /></Field>
        <Field label="Target group"><TextInput value={form.target_group} onChange={v => set('target_group', v)} /></Field>
        <Field label="Gender"><TextInput value={form.gender} onChange={v => set('gender', v)} /></Field>
        <Field label="Season"><TextInput value={form.season} onChange={v => set('season', v)} /></Field>
      </div>

      <Label>Detail</Label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Field label="Colour primary"><TextInput value={form.colour_primary} onChange={v => set('colour_primary', v)} /></Field>
        <Field label="Colour secondary"><TextInput value={form.colour_secondary} onChange={v => set('colour_secondary', v)} /></Field>
        <Field label="Pattern"><TextInput value={form.pattern} onChange={v => set('pattern', v)} /></Field>
        <Field label="Collar"><TextInput value={form.collar_type} onChange={v => set('collar_type', v)} /></Field>
        <Field label="Sleeve length"><TextInput value={form.sleeve_length} onChange={v => set('sleeve_length', v)} /></Field>
        <Field label="Sleeve desc"><TextInput value={form.sleeve_desc} onChange={v => set('sleeve_desc', v)} /></Field>
        <Field label="Closure"><TextInput value={form.closure_type} onChange={v => set('closure_type', v)} /></Field>
        <Field label="Distinguishing feature" span={2}><TextInput value={form.distinguishing_feature} onChange={v => set('distinguishing_feature', v)} /></Field>
        <Field label="Suggested styling" span={3}><TextArea value={form.suggested_styling} onChange={v => set('suggested_styling', v)} rows={2} /></Field>
      </div>

      <Label>Description &amp; care</Label>
      <div className="grid grid-cols-1 gap-3 mb-4">
        <Field label="Description"><TextArea value={form.description} onChange={v => set('description', v)} rows={4} /></Field>
        <Field label="Wash care"><TextArea value={form.wash_care} onChange={v => set('wash_care', v)} rows={2} /></Field>
      </div>

      <Label>Fulfilment / commerce</Label>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <Field label="HSN"><TextInput value={form.hsn} onChange={v => set('hsn', v)} /></Field>
        <Field label="Country of origin"><TextInput value={form.country_of_origin} onChange={v => set('country_of_origin', v)} /></Field>
        <Field label="Manufacture days"><NumInput value={form.manufacture_days} onChange={v => set('manufacture_days', v)} /></Field>
        <Field label="Ship time"><TextInput value={form.ship_time} onChange={v => set('ship_time', v)} /></Field>
      </div>

      <Label>SEO</Label>
      <div className="grid grid-cols-1 gap-3">
        <Field label="SEO title"><TextInput value={form.seo_title} onChange={v => set('seo_title', v)} /></Field>
        <Field label="SEO description"><TextArea value={form.seo_description} onChange={v => set('seo_description', v)} rows={3} /></Field>
      </div>

      <SaveBar dirty={dirty} busy={busy} msg={msg} onSave={save} onReset={() => setForm(original)} />
    </section>
  )
}

// ============================================================================
// Surface 2 — Variant tabs + variant zone
// ============================================================================

const VARIANT_FIELDS = [
  'is_set', 'set_components',
  'cogs', 'embroidery', 'stitching', 'total_dye', 'accessories', 'bottom_cogs',
  'fabric_id', 'fabric_name', 'fabric_sku', 'fabric_desc', 'fabric_grade', 'fabric_tag',
  'metres', 'cost_per_metre',
  'dye_id', 'dye_per_metre',
  'embroidery_type',
  'proposed_mrp',
  'cogs_notes',
]

const emptyPiece = () => ({
  id: 'p_' + Math.random().toString(36).slice(2, 9),
  name: '',
  category: '',
  fabricId: '',
  fabricName: '',
  metres: 0,
  costPerMetre: 0,
  dyeId: '',
  dyePerMetre: 0,
  stitching: 0,
  embroidery: 0,
  accessories: 0,
  costType: 'per_metre',
})

const SetComponentsEditor = ({ pieces, onChange }) => {
  const setPiece = (idx, patch) => onChange(pieces.map((p, i) => i === idx ? { ...p, ...patch } : p))
  const removePiece = (idx) => onChange(pieces.filter((_, i) => i !== idx))
  const addPiece = () => onChange([...(pieces || []), emptyPiece()])
  return (
    <div className="space-y-2">
      {(pieces || []).map((p, idx) => (
        <div key={p.id || idx} className="bg-gray-50 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-700">Piece {idx + 1}</span>
            <button onClick={() => removePiece(idx)} className="text-[11px] text-red-600 hover:underline">Remove</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Field label="Name"><TextInput value={p.name} onChange={v => setPiece(idx, { name: v })} /></Field>
            <Field label="Category"><TextInput value={p.category} onChange={v => setPiece(idx, { category: v })} /></Field>
            <Field label="Fabric ID"><TextInput value={p.fabricId} onChange={v => setPiece(idx, { fabricId: v })} /></Field>
            <Field label="Fabric name"><TextInput value={p.fabricName} onChange={v => setPiece(idx, { fabricName: v })} /></Field>
            <Field label="Metres"><NumInput value={p.metres} onChange={v => setPiece(idx, { metres: v })} /></Field>
            <Field label="₹/metre"><NumInput value={p.costPerMetre} onChange={v => setPiece(idx, { costPerMetre: v })} /></Field>
            <Field label="Dye ID"><TextInput value={p.dyeId} onChange={v => setPiece(idx, { dyeId: v })} /></Field>
            <Field label="Dye ₹/m"><NumInput value={p.dyePerMetre} onChange={v => setPiece(idx, { dyePerMetre: v })} /></Field>
            <Field label="Stitching"><NumInput value={p.stitching} onChange={v => setPiece(idx, { stitching: v })} /></Field>
            <Field label="Embroidery"><NumInput value={p.embroidery} onChange={v => setPiece(idx, { embroidery: v })} /></Field>
            <Field label="Accessories"><NumInput value={p.accessories} onChange={v => setPiece(idx, { accessories: v })} /></Field>
          </div>
        </div>
      ))}
      <button onClick={addPiece} className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 w-full">
        + Add piece
      </button>
    </div>
  )
}

export const VariantSurfaceForm = ({ row, variantIdx, onChangeIdx, onSaved, userEmail }) => {
  const variants = Array.isArray(row?.variants) ? row.variants : []
  const original = useMemo(() => {
    const v = variants[variantIdx] || {}
    const o = {}
    VARIANT_FIELDS.forEach(k => { o[k] = v[k] ?? (k === 'is_set' ? false : null) })
    // workflow fields kept read-only on the form (set by buttons)
    o.cogs_review_status = v.cogs_review_status || 'pending_entry'
    o.cogs_entered_by = v.cogs_entered_by || null
    o.cogs_entered_at = v.cogs_entered_at || null
    o.cogs_finalized_by = v.cogs_finalized_by || null
    o.cogs_finalized_at = v.cogs_finalized_at || null
    o.cogs_rejection_note = v.cogs_rejection_note || null
    return o
  }, [row, variantIdx])
  const [form, setForm] = useState(original)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { setForm(original); setMsg('') }, [original])

  const dirty = !objEqual(form, original)
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const v = variants[variantIdx]
  if (!v) return null

  // ---- Save ---------------------------------------------------------------

  const writeRow = async (newVariants, statusOverride = null) => {
    const updated = [...variants]
    const next = { ...updated[variantIdx], ...form }
    if (statusOverride) Object.assign(next, statusOverride)
    updated[variantIdx] = next
    return await supa.from('catalogue_products')
      .update({ variants: updated, updated_at: new Date().toISOString() })
      .eq('id', row.id).select().maybeSingle()
  }

  const saveVariant = async () => {
    setBusy(true); setMsg('')
    try {
      const { data, error } = await writeRow()
      if (error) throw error
      setMsg('Saved.')
      onSaved && onSaved(data)
    } catch (e) { setMsg('Error: ' + (e?.message || String(e))) }
    finally { setBusy(false) }
  }

  // ---- Workflow buttons ---------------------------------------------------

  const setWorkflow = async (statusOverride, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return
    setBusy(true); setMsg('')
    try {
      const { data, error } = await writeRow(null, statusOverride)
      if (error) throw error
      setMsg('Workflow updated.')
      onSaved && onSaved(data)
    } catch (e) { setMsg('Error: ' + (e?.message || String(e))) }
    finally { setBusy(false) }
  }

  const now = () => new Date().toISOString()
  const me = userEmail || 'system'

  const draft = () => setWorkflow({ cogs_review_status: 'pending_entry' })
  const submit = () => setWorkflow({
    cogs_review_status: 'in_review',
    cogs_entered_by: me,
    cogs_entered_at: now(),
  })
  const finalize = () => setWorkflow({
    cogs_review_status: 'finalized',
    cogs_finalized_by: me,
    cogs_finalized_at: now(),
  }, 'Finalize this variant\'s COGS? This will mark the review complete.')
  const reject = async () => {
    const note = window.prompt('Reject reason (visible in the review queue):', '')
    if (note === null) return
    setWorkflow({
      cogs_review_status: 'rejected',
      cogs_rejection_note: note || '(no reason given)',
    })
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
      <Label>Variants ({variants.length})</Label>

      {/* Tab strip */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none mb-4 pb-1 border-b border-gray-100">
        {variants.map((vt, idx) => {
          const active = idx === variantIdx
          return (
            <button key={vt.style_code || idx} onClick={() => onChangeIdx(idx)}
              className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex items-center gap-1.5 flex-shrink-0"
              style={{
                background: active ? '#c9a432' : 'transparent',
                color: active ? '#fff' : '#6b7280',
                border: active ? 'none' : '1px solid #e5e7eb',
              }}>
              <span>{vt.composition || 'Default'} · {vt.style_code}</span>
              {vt.is_set && <Pill tone={active ? 'gold' : 'blue'}>set</Pill>}
            </button>
          )
        })}
      </div>

      {/* Variant header */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-sm font-bold text-gray-800">{v.style_code}</span>
        {v.composition && <Pill tone="gray">{v.composition}</Pill>}
        <Pill tone={STATUS_TONE[form.cogs_review_status] || 'gray'}>{form.cogs_review_status}</Pill>
        {form.is_set && <Pill tone="blue">Set</Pill>}
      </div>

      <Label>Costing</Label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Field label="Fabric ID"><TextInput value={form.fabric_id} onChange={v => set('fabric_id', v)} /></Field>
        <Field label="Fabric name" span={2}><TextInput value={form.fabric_name} onChange={v => set('fabric_name', v)} /></Field>
        <Field label="Fabric SKU"><TextInput value={form.fabric_sku} onChange={v => set('fabric_sku', v)} /></Field>
        <Field label="Fabric desc" span={4}><TextArea value={form.fabric_desc} onChange={v => set('fabric_desc', v)} rows={2} /></Field>
        <Field label="Fabric grade"><TextInput value={form.fabric_grade} onChange={v => set('fabric_grade', v)} /></Field>
        <Field label="Fabric tag"><TextInput value={form.fabric_tag} onChange={v => set('fabric_tag', v)} /></Field>
        <Field label="Metres"><NumInput value={form.metres} onChange={v => set('metres', v)} /></Field>
        <Field label="₹/metre"><NumInput value={form.cost_per_metre} onChange={v => set('cost_per_metre', v)} /></Field>
        <Field label="Stitching"><NumInput value={form.stitching} onChange={v => set('stitching', v)} /></Field>
        <Field label="Embroidery"><NumInput value={form.embroidery} onChange={v => set('embroidery', v)} /></Field>
        <Field label="Embroidery type" span={2}><TextInput value={form.embroidery_type} onChange={v => set('embroidery_type', v)} /></Field>
        <Field label="Dye ID"><TextInput value={form.dye_id} onChange={v => set('dye_id', v)} /></Field>
        <Field label="Dye ₹/m"><NumInput value={form.dye_per_metre} onChange={v => set('dye_per_metre', v)} /></Field>
        <Field label="Total dye"><NumInput value={form.total_dye} onChange={v => set('total_dye', v)} /></Field>
        <Field label="Accessories"><NumInput value={form.accessories} onChange={v => set('accessories', v)} /></Field>
        <Field label="Bottom COGS"><NumInput value={form.bottom_cogs} onChange={v => set('bottom_cogs', v)} /></Field>
        <Field label="COGS (total)"><NumInput value={form.cogs} onChange={v => set('cogs', v)} /></Field>
        <Field label="Proposed MRP"><NumInput value={form.proposed_mrp} onChange={v => set('proposed_mrp', v)} /></Field>
        <Field label="Notes" span={4}><TextArea value={form.cogs_notes} onChange={v => set('cogs_notes', v)} rows={2} /></Field>
      </div>

      <Label>Set components</Label>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[11px] text-gray-500">Is set?</span>
        <Toggle value={!!form.is_set} onChange={v => set('is_set', v)} />
      </div>
      {form.is_set && (
        <div className="mb-4">
          <SetComponentsEditor
            pieces={Array.isArray(form.set_components) ? form.set_components : []}
            onChange={v => set('set_components', v)}
          />
        </div>
      )}

      <Label>COGS workflow</Label>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <button onClick={draft} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Save draft</button>
        <button onClick={submit} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: '#fef3c7', color: '#92400e' }}>Submit for review</button>
        <button onClick={finalize} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: '#dcfce7', color: '#15803d' }}>Finalize</button>
        <button onClick={reject} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: '#fee2e2', color: '#991b1b' }}>Reject</button>
      </div>
      <div className="text-[11px] text-gray-400 mb-2">
        Workflow buttons save the variant THEN stamp the new status. They don't need an explicit "Save" first.
      </div>
      {(form.cogs_entered_by || form.cogs_finalized_by || form.cogs_rejection_note) && (
        <div className="text-[11px] text-gray-500 grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 p-2 bg-gray-50 rounded-lg">
          {form.cogs_entered_by && <div><span className="text-gray-400">Entered by:</span> {form.cogs_entered_by}</div>}
          {form.cogs_entered_at && <div><span className="text-gray-400">Entered at:</span> {new Date(form.cogs_entered_at).toLocaleString()}</div>}
          {form.cogs_finalized_by && <div><span className="text-gray-400">Finalized by:</span> {form.cogs_finalized_by}</div>}
          {form.cogs_finalized_at && <div><span className="text-gray-400">Finalized at:</span> {new Date(form.cogs_finalized_at).toLocaleString()}</div>}
          {form.cogs_rejection_note && <div className="col-span-2 sm:col-span-3"><span className="text-gray-400">Rejection note:</span> {form.cogs_rejection_note}</div>}
        </div>
      )}

      <SaveBar dirty={dirty} busy={busy} msg={msg} onSave={saveVariant} onReset={() => setForm(original)} />
    </section>
  )
}

// ============================================================================
// Surface 3 — Size grid (inline edit per row)
// ============================================================================

const SIZE_FIELDS = ['size', 'sku', 'mrp', 'selling_price', 'compare_at_price', 'discount', 'inventory', 'active', 'barcode']

export const SizeGridForm = ({ row, variantIdx, onSaved }) => {
  const variants = Array.isArray(row?.variants) ? row.variants : []
  const v = variants[variantIdx]
  const original = useMemo(() => {
    return (v?.sizes || []).map(s => {
      const o = {}
      SIZE_FIELDS.forEach(k => { o[k] = s[k] ?? (k === 'active' ? true : null) })
      o.shopify_variant_id = s.shopify_variant_id
      o.label = s.label
      o.option1 = s.option1; o.option2 = s.option2; o.option3 = s.option3
      o.weight = s.weight; o.weight_unit = s.weight_unit
      o.position = s.position
      o.image = s.image
      return o
    })
  }, [v])
  const [sizes, setSizes] = useState(original)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => { setSizes(original); setMsg('') }, [original])

  if (!v) return null

  const dirty = !objEqual(sizes, original)
  const updateAt = (idx, patch) => setSizes(prev => prev.map((s, i) => {
    if (i !== idx) return s
    const next = { ...s, ...patch }
    if ('mrp' in patch || 'selling_price' in patch) {
      const mrp = Number(next.mrp) || 0
      const sp = Number(next.selling_price) || 0
      next.discount = Math.max(0, mrp - sp)
    }
    return next
  }))

  const save = async () => {
    setBusy(true); setMsg('')
    try {
      const updatedVariants = [...variants]
      updatedVariants[variantIdx] = { ...updatedVariants[variantIdx], sizes }
      const { data, error } = await supa.from('catalogue_products')
        .update({ variants: updatedVariants, updated_at: new Date().toISOString() })
        .eq('id', row.id).select().maybeSingle()
      if (error) throw error
      setMsg('Saved.')
      onSaved && onSaved(data)
    } catch (e) { setMsg('Error: ' + (e?.message || String(e))) }
    finally { setBusy(false) }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <Label>Sizes — {v.style_code}</Label>
        <span className="text-[11px] text-gray-400">{sizes.length} entries</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead style={{ background: '#f5f4f0' }}>
            <tr>
              {['Size', 'SKU', 'MRP', 'SP', 'Compare', 'Discount', 'Inv', 'Active', 'Barcode'].map(h => (
                <th key={h} className="px-2 py-2 text-left text-[10px] uppercase tracking-wide text-gray-500 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sizes.map((s, i) => (
              <tr key={s.sku || s.shopify_variant_id || i} className="border-t border-gray-50" style={{ opacity: s.active === false ? 0.55 : 1 }}>
                <td className="px-2 py-1.5"><TextInput value={s.size} onChange={v => updateAt(i, { size: v })} /></td>
                <td className="px-2 py-1.5"><TextInput value={s.sku} onChange={v => updateAt(i, { sku: v })} /></td>
                <td className="px-2 py-1.5"><NumInput value={s.mrp} onChange={v => updateAt(i, { mrp: v })} /></td>
                <td className="px-2 py-1.5"><NumInput value={s.selling_price} onChange={v => updateAt(i, { selling_price: v })} /></td>
                <td className="px-2 py-1.5"><NumInput value={s.compare_at_price} onChange={v => updateAt(i, { compare_at_price: v })} /></td>
                <td className="px-2 py-1.5 text-right text-xs text-gray-500 tabular-nums">{s.discount ? `₹${fmt(s.discount)}` : '—'}</td>
                <td className="px-2 py-1.5"><NumInput value={s.inventory} onChange={v => updateAt(i, { inventory: v })} /></td>
                <td className="px-2 py-1.5"><Toggle value={s.active !== false} onChange={v => updateAt(i, { active: v })} /></td>
                <td className="px-2 py-1.5"><TextInput value={s.barcode} onChange={v => updateAt(i, { barcode: v })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SaveBar dirty={dirty} busy={busy} msg={msg} onSave={save} onReset={() => setSizes(original)} />
    </section>
  )
}

export default {
  ProductSurfaceForm,
  VariantSurfaceForm,
  SizeGridForm,
}

import React, { useState, useEffect, useMemo } from 'react'
import { supa } from '../../lib/supabase'
import { variantToLegacyForm, saveVariantForm, setVariantReviewStatus } from '../../lib/catalogueV2'
import { fmt, n, gst, calcCogs, calcPieceCogs, effectiveSP, gmPct } from '../../lib/helpers'
import { VARIANT_SIZES, generateSKU, buildDefaultVariants } from '../../lib/constants'
import FabricPicker from '../../components/FabricPicker'
import Icon from '../../components/Icon'

/* ProductViewV2 — Catalogue v2 detail + editor.

   Architecture (per the Stitch "Artisanal Heritage" design):
   - PRODUCT IDENTITY is separated from VARIANT-SPECIFIC info.
     · Identity (shared across variants): title, base style code, category,
       colours, tags, wash care, HSN, description.
     · Per variant: Set Components, Fabric & Material COGS, and a collapsible
       Pricing & Sizes block (standard sizes S/M/L/XL/XXL/MTF off a base price).
   - One tab per variant. All real Hilo fields, dropdowns (fabric / dye /
     stitching-from-master / category) and COGS maths are preserved; only the
     layout follows Stitch (card sections, gold accents, ivory canvas). */

const C = {
  gold: '#c9a432', goldDk: '#795900', ink: '#1b1c1a', muted: '#9c9b97',
  border: '#ebe8e0', bg: '#faf9f5', card: '#ffffff', indigo: '#494bd6',
  green: '#15803d', greenBg: '#dcfce7', amber: '#92400e', amberBg: '#fef3c7',
  red: '#991b1b', redBg: '#fee2e2',
}

const REVIEW_CHIP = {
  pending_entry: { bg: '#f3f4f6', fg: '#6b7280', label: 'Pending' },
  in_review:     { bg: C.amberBg, fg: C.amber, label: 'In Review' },
  finalized:     { bg: C.greenBg, fg: C.green, label: 'Finalized' },
  rejected:      { bg: C.redBg, fg: C.red, label: 'Rejected' },
}

// ── tiny presentational atoms ────────────────────────────────────────────────
const Card = ({ children, className = '' }) => (
  <div className={`rounded-2xl border ${className}`} style={{ background: C.card, borderColor: C.border, boxShadow: '0 4px 16px rgba(27,28,26,0.06)' }}>{children}</div>
)
const SectionHead = ({ icon, title, subtitle, right }) => (
  <div className="flex items-start justify-between gap-3 mb-4">
    <div className="flex items-start gap-2.5">
      {icon && <span className="material-symbols-outlined text-[20px]" style={{ color: C.gold }}>{icon}</span>}
      <div>
        <h3 style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, fontSize: 18, color: C.ink, lineHeight: 1.2 }}>{title}</h3>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: C.muted }}>{subtitle}</p>}
      </div>
    </div>
    {right}
  </div>
)
const Lbl = ({ children }) => <label className="block mb-1 font-semibold uppercase" style={{ fontSize: 11, letterSpacing: '0.05em', color: C.muted }}>{children}</label>
const inputCls = 'w-full rounded-lg px-3 py-2.5 text-sm outline-none'
const inputStyle = { border: `1px solid ${C.border}`, background: '#fff', color: C.ink }
const Txt = ({ value, onChange, placeholder, mono }) => (
  <input type="text" value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)}
    className={inputCls} style={{ ...inputStyle, fontFamily: mono ? 'monospace' : undefined }} />
)
const Num = ({ value, onChange, placeholder }) => (
  <input type="text" inputMode="decimal" value={value ?? ''} placeholder={placeholder}
    onChange={e => onChange(e.target.value === '' ? '' : e.target.value)}
    className={inputCls} style={{ ...inputStyle, fontFamily: 'monospace' }} />
)
const Sel = ({ value, onChange, children }) => (
  <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={inputCls} style={inputStyle}>{children}</select>
)

const ProductViewV2 = ({ row: initialRow, fabrics = [], dyes = [], categories = [], consumption = [], stitchingMaster = [], onClose, onChanged }) => {
  const [row, setRow] = useState(initialRow)
  const [activeIdx, setActive] = useState(0)
  const [userEmail, setUserEmail] = useState(null)
  const [form, setForm] = useState(null)
  const [status, setStatus] = useState('')          // '' | 'saving' | 'saved' | 'error:...'
  const [sizesOpen, setSizesOpen] = useState(true)

  useEffect(() => { setRow(initialRow); setActive(0) }, [initialRow?.id])
  useEffect(() => {
    let c = false
    supa.auth.getUser().then(({ data }) => { if (!c) setUserEmail(data?.user?.email || null) }).catch(() => {})
    return () => { c = true }
  }, [])

  const variants = Array.isArray(row?.variants) ? row.variants : []
  const idx = Math.min(activeIdx, Math.max(0, variants.length - 1))
  const variant = variants[idx]

  // (re)hydrate the editable form whenever the active variant / row changes
  useEffect(() => {
    if (variant) setForm(variantToLegacyForm(row, variant))
    else setForm(null)
  }, [row, idx])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── auto-fill effects (ported from V1 ProductForm) ─────────────────────────
  useEffect(() => {
    if (!form?.fabricId) return
    const fab = fabrics.find(f => f.id === form.fabricId || f._oldId === form.fabricId)
    if (fab) setForm(f => ({ ...f, fabricName: fab.name, costPerMetre: fab.costPerMetre, costType: fab.costType || 'per_metre' }))
  }, [form?.fabricId])
  useEffect(() => {
    if (!form?.dyeId) return
    const d = dyes.find(d => d.id === form.dyeId)
    if (d) setForm(f => ({ ...f, dyePerMetre: d.costPerMetre }))
  }, [form?.dyeId])
  useEffect(() => {
    if (!form?.category) return
    const m = stitchingMaster.find(s => s.category === form.category)
    if (m) setForm(f => ({ ...f, stitching: f.stitching || m.cost }))
  }, [form?.category])
  useEffect(() => {
    if (!form || form.isSet || !form.category || !form.fabricId || !(consumption || []).length) return
    const rule = consumption.find(c => c.category === form.category && c.fabricId === form.fabricId)
    if (rule && !form.metres) setForm(f => ({ ...f, metres: rule.metres }))
  }, [form?.category, form?.fabricId, form?.isSet])

  // ── set-component piece helpers ────────────────────────────────────────────
  const emptyPiece = () => ({ name: '', category: '', fabricId: '', fabricName: '', metres: '', costPerMetre: '', costType: 'per_metre', dyeId: '', dyePerMetre: '', stitching: '', embroidery: '', embroidery_type: '', accessories: '' })
  const addPiece = () => setForm(f => ({ ...f, setComponents: [...(f.setComponents || []), emptyPiece()] }))
  const removePiece = i => setForm(f => ({ ...f, setComponents: f.setComponents.filter((_, x) => x !== i) }))
  const updatePiece = (i, k, v) => setForm(f => {
    const pieces = [...(f.setComponents || [])]
    let extra = {}
    if (k === 'fabricId' && v) { const fab = fabrics.find(x => x.id === v || x._oldId === v); if (fab) extra = { fabricName: fab.name, costPerMetre: fab.costPerMetre, costType: fab.costType || 'per_metre' } }
    if (k === 'dyeId' && v) { const d = dyes.find(x => x.id === v); if (d) extra = { dyePerMetre: d.costPerMetre } }
    if (k === 'category' && v) { const m = stitchingMaster.find(s => s.category === v); if (m) extra.stitching = m.cost }
    pieces[i] = { ...pieces[i], [k]: v, ...extra }
    return { ...f, setComponents: pieces }
  })

  // ── size helpers ───────────────────────────────────────────────────────────
  const sizes = form?.variants || []
  const genSizes = () => setForm(f => ({ ...f, variants: buildDefaultVariants(f.styleCode, f.mrp, f.sellingPrice) }))
  const applyBase = () => setForm(f => ({
    ...f,
    variants: (f.variants || []).map(v => ({ ...v, mrp: +f.mrp || 0, sellingPrice: +f.sellingPrice || +f.mrp || 0, compareAtPrice: +f.mrp || 0, sku: generateSKU(f.styleCode, v.size) })),
  }))
  const updSize = (i, k, v) => setForm(f => { const arr = [...f.variants]; arr[i] = { ...arr[i], [k]: v }; return { ...f, variants: arr } })
  const rmSize = i => setForm(f => ({ ...f, variants: f.variants.filter((_, x) => x !== i) }))

  // ── derived COGS / margin ──────────────────────────────────────────────────
  const cogs = useMemo(() => (form ? calcCogs(form) : 0), [form])
  const baseMrp = n(form?.mrp) || n(sizes[0]?.mrp)
  const baseSp = n(form?.sellingPrice) || n(sizes[0]?.sellingPrice) || baseMrp
  const gm = gmPct(baseSp, cogs, baseMrp)
  const effSP = effectiveSP(baseSp, baseMrp)
  const landing = cogs * 1.15

  if (!row) return null
  const rs = variant?.cogs_review_status || 'pending_entry'
  const cogsLocked = rs === 'finalized' || rs === 'in_review'

  // ── persistence ────────────────────────────────────────────────────────────
  const save = async () => {
    if (!form?.styleCode?.trim()) { alert('Style code is required.'); return }
    setStatus('saving')
    try {
      const updated = await saveVariantForm(row, idx, form)
      setRow(updated); setStatus('saved'); onChanged && onChanged()
      setTimeout(() => setStatus(''), 2500)
    } catch (e) { console.error('[catalogue-v2] save', e); setStatus('error:' + (e.message || 'failed')); alert('Save failed: ' + (e.message || e)) }
  }
  const stamp = async (next, note) => {
    try {
      // Persist the live COGS form FIRST, then stamp. setVariantReviewStatus reads
      // the stored variant (not the form), so without this a Submit/Finalize done
      // without a prior "Save" would drop the typed costs and zero out the COGS.
      const base = form ? await saveVariantForm(row, idx, form) : row
      const updated = await setVariantReviewStatus(base, idx, next, userEmail, note)
      setRow(updated); setStatus('saved'); setTimeout(() => setStatus(''), 2500); onChanged && onChanged()
    }
    catch (e) { console.error('[catalogue-v2] stamp', e); alert('Failed: ' + (e.message || e)) }
  }

  return (
    <div className="max-w-6xl mx-auto pb-28">
      {/* ── Header ── */}
      <div className="mb-4">
        <h2 style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 800, fontSize: 26, color: C.ink, letterSpacing: '-0.02em' }}>{row.product_title || '(untitled)'}</h2>
        <p className="text-sm mt-1" style={{ color: C.muted }}>
          <span style={{ fontFamily: 'monospace' }}>{variant?.style_code || '—'}</span> · {row.category || 'Uncategorised'} · {variants.length} variant{variants.length === 1 ? '' : 's'}
          {status === 'saving' && <span className="ml-2" style={{ color: C.goldDk }}>Saving…</span>}
          {status === 'saved' && <span className="ml-2" style={{ color: C.green }}>Saved ✓</span>}
          {status.startsWith('error') && <span className="ml-2" style={{ color: C.red }}>{status.slice(6)}</span>}
        </p>
      </div>

      {/* ── Variant tabs ── */}
      {variants.length > 0 && (
        <div className="flex gap-1 overflow-x-auto scrollbar-none mb-5" style={{ borderBottom: `1px solid ${C.border}` }}>
          {variants.map((v, i) => {
            const on = i === idx
            const chip = REVIEW_CHIP[v.cogs_review_status || 'pending_entry']
            const first = (v.sizes || [])[0] || {}
            return (
              <button key={v.style_code || i} onClick={() => setActive(i)}
                className="flex flex-col items-start pt-3 pb-2.5 px-4 min-w-[180px] text-left -mb-px"
                style={{ borderBottom: `3px solid ${on ? C.gold : 'transparent'}` }}>
                <div className="flex items-center gap-1.5">
                  <span style={{ fontFamily: 'Manrope,sans-serif', fontWeight: on ? 700 : 600, fontSize: 14, color: on ? C.ink : '#6b7280' }}>{v.composition || 'Default'}</span>
                  {v.is_set && <span className="text-[9px] px-1 rounded" style={{ background: '#dbeafe', color: '#1e40af' }}>SET</span>}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.muted }}>{v.style_code}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: C.muted, marginTop: 2 }}>{first.mrp ? `₹${fmt(first.mrp)}` : '₹—'}</span>
              </button>
            )
          })}
        </div>
      )}

      {!form ? (
        <div className="text-center text-gray-400 py-12">This product has no variants.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── LEFT (2/3): identity + variant editing ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Product Identity (shared across variants) */}
            <Card className="p-6">
              <SectionHead icon="badge" title="Product Identity" subtitle="Shared across all variants of this product." />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><Lbl>Product Title</Lbl><Txt value={form.productTitle} onChange={v => set('productTitle', v)} placeholder="Maharaja Silk Embellished Sherwani" /></div>
                <div><Lbl>Base Style Code *</Lbl><Txt value={form.styleCode} onChange={v => set('styleCode', v)} placeholder="HL-SH-07" mono /></div>
                <div><Lbl>Category</Lbl>
                  <Sel value={form.category} onChange={v => set('category', v)}>
                    <option value="">— Select —</option>
                    {(categories.length ? categories.map(c => c.name) : ['Kurta','Sherwani','Blazer','Indowestern']).filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                  </Sel>
                </div>
                <div><Lbl>Primary Colour</Lbl><Txt value={form.colourPrimary} onChange={v => set('colourPrimary', v)} placeholder="Midnight Blue" /></div>
                <div><Lbl>Secondary Colour</Lbl><Txt value={form.colourSecondary} onChange={v => set('colourSecondary', v)} /></div>
                <div><Lbl>Occasion Tags</Lbl><Txt value={form.occasionTag} onChange={v => set('occasionTag', v)} placeholder="Wedding, Festive" /></div>
                <div><Lbl>Style Tags</Lbl><Txt value={form.styleTag} onChange={v => set('styleTag', v)} placeholder="Embroidered" /></div>
                <div><Lbl>Wash Care</Lbl><Txt value={form.washCare} onChange={v => set('washCare', v)} /></div>
                <div><Lbl>HSN Code</Lbl><Txt value={form.hsn} onChange={v => set('hsn', v)} placeholder="62114210" mono /></div>
                <div className="sm:col-span-2"><Lbl>Description</Lbl><Txt value={form.description} onChange={v => set('description', v)} /></div>
                <div className="sm:col-span-2"><Lbl>Status</Lbl>
                  <Sel value={form.status} onChange={v => set('status', v)}><option>Active</option><option>Inactive</option></Sel>
                </div>
              </div>
            </Card>

            {/* Set Components (variant-specific) */}
            <Card className="p-6">
              <SectionHead icon="category" title="Set Components" subtitle="Individual items in this multi-component variant."
                right={<label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: C.ink }}>
                  <input type="checkbox" checked={!!form.isSet} onChange={e => set('isSet', e.target.checked)} className="w-4 h-4 accent-yellow-500" /> This variant is a set
                </label>} />
              {form.isSet ? (
                <div className="space-y-3">
                  {(form.setComponents || []).map((p, i) => {
                    const pc = calcPieceCogs({ metres: +p.metres || 0, costPerMetre: +p.costPerMetre || 0, dyePerMetre: +p.dyePerMetre || 0, stitching: +p.stitching || 0, embroidery: +p.embroidery || 0, accessories: +p.accessories || 0 })
                    return (
                      <div key={i} className="rounded-xl p-4 border" style={{ borderColor: C.border, background: C.bg }}>
                        <div className="flex items-center justify-between mb-2">
                          <input value={p.name || ''} onChange={e => updatePiece(i, 'name', e.target.value)} placeholder={`Piece ${i + 1} (e.g. Kurta, Dupatta)`}
                            className="text-sm font-semibold bg-transparent outline-none flex-1" style={{ color: C.ink }} />
                          <span className="text-xs mr-2" style={{ color: C.indigo, fontFamily: 'monospace' }}>₹{fmt(pc.toFixed(0))}</span>
                          <button onClick={() => removePiece(i)} className="text-gray-300 hover:text-red-400"><Icon name="trash" cls="w-3.5 h-3.5" /></button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          <div className="col-span-2 sm:col-span-1"><Lbl>Category</Lbl>
                            <Sel value={p.category} onChange={v => updatePiece(i, 'category', v)}><option value="">—</option>{(categories || []).map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</Sel>
                          </div>
                          <div className="col-span-2"><Lbl>Fabric</Lbl><FabricPicker fabrics={fabrics} value={p.fabricId || ''} onChange={v => updatePiece(i, 'fabricId', v)} showCost compact placeholder="— Select fabric —" /></div>
                          <div><Lbl>Metres</Lbl><Num value={p.metres} onChange={v => updatePiece(i, 'metres', v)} placeholder="2.5" /></div>
                          <div><Lbl>Cost/m (₹)</Lbl><Num value={p.costPerMetre} onChange={v => updatePiece(i, 'costPerMetre', v)} placeholder="320" /></div>
                          <div><Lbl>Dye</Lbl><Sel value={p.dyeId} onChange={v => updatePiece(i, 'dyeId', v)}><option value="">No Dye</option>{dyes.map(d => <option key={d.id} value={d.id}>{d.type} (₹{d.costPerMetre}/m)</option>)}</Sel></div>
                          <div><Lbl>Embroidery (₹)</Lbl><Num value={p.embroidery} onChange={v => updatePiece(i, 'embroidery', v)} placeholder="0" /></div>
                          <div><Lbl>Stitching (₹)</Lbl><Num value={p.stitching} onChange={v => updatePiece(i, 'stitching', v)} placeholder="250" /></div>
                          <div><Lbl>Accessories (₹)</Lbl><Num value={p.accessories} onChange={v => updatePiece(i, 'accessories', v)} placeholder="0" /></div>
                        </div>
                      </div>
                    )
                  })}
                  <button onClick={addPiece} className="text-xs font-semibold px-3 py-2 rounded-lg border" style={{ borderColor: C.border, color: C.goldDk }}>+ Add component</button>
                </div>
              ) : (
                <p className="text-sm" style={{ color: C.muted }}>Single-piece variant. Toggle on to break it into components (e.g. Jacket + Kurta + Pyjama).</p>
              )}
            </Card>

            {/* Fabric & Material COGS (variant-specific, single-piece path) */}
            {!form.isSet && (
              <Card className="p-6">
                <SectionHead icon="payments" title="Fabric & Material COGS" subtitle="Direct cost breakdown from fabric and labour."
                  right={cogsLocked ? <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: C.greenBg, color: C.green }}>🔒 COGS locked</span> : null} />
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${cogsLocked ? 'opacity-60 pointer-events-none' : ''}`}>
                  <div className="sm:col-span-2"><Lbl>Fabric</Lbl><FabricPicker fabrics={fabrics} value={form.fabricId || ''} onChange={v => set('fabricId', v)} showCost placeholder="— Select fabric —" /></div>
                  <div><Lbl>Metres</Lbl><Num value={form.metres} onChange={v => set('metres', v)} placeholder="2.5" /></div>
                  <div><Lbl>Cost / Metre (₹)</Lbl><Num value={form.costPerMetre} onChange={v => set('costPerMetre', v)} placeholder="320" /></div>
                  <div><Lbl>Dye Type</Lbl><Sel value={form.dyeId} onChange={v => set('dyeId', v)}><option value="">No Dye</option>{dyes.map(d => <option key={d.id} value={d.id}>{d.type} (₹{d.costPerMetre}/m)</option>)}</Sel></div>
                  <div><Lbl>Dye Cost / Metre (₹)</Lbl><Num value={form.dyePerMetre} onChange={v => set('dyePerMetre', v)} placeholder="40" /></div>
                  <div><Lbl>Embroidery Type</Lbl><Sel value={form.embroidery_type} onChange={v => set('embroidery_type', v)}><option value="">None</option><option>Hand Embroidery</option><option>Machine Embroidery</option></Sel></div>
                  <div><Lbl>Embroidery Cost (₹)</Lbl><Num value={form.embroidery} onChange={v => set('embroidery', v)} placeholder="0" /></div>
                  <div><Lbl>Stitching (₹)</Lbl>
                    <div className="flex gap-2">
                      <Num value={form.stitching} onChange={v => set('stitching', v)} placeholder="600" />
                      <select onChange={e => { const m = stitchingMaster.find(s => s.id === e.target.value); if (m) set('stitching', m.cost) }} defaultValue="" className="rounded-lg px-2 text-xs flex-shrink-0" style={{ border: `1px solid ${C.border}`, color: C.muted }}>
                        <option value="">↑ master</option>{stitchingMaster.map(s => <option key={s.id} value={s.id}>{s.garmentType}</option>)}
                      </select>
                    </div>
                  </div>
                  <div><Lbl>Accessories / Other (₹)</Lbl><Num value={form.accessories} onChange={v => set('accessories', v)} placeholder="0" /></div>
                </div>
                {/* Base landing cost */}
                <div className="mt-4 flex items-center justify-between rounded-xl px-4 py-3" style={{ background: C.bg }}>
                  <div>
                    <div className="font-bold uppercase" style={{ fontSize: 11, letterSpacing: '0.08em', color: C.goldDk }}>Base Landing Cost</div>
                    <div className="text-xs" style={{ color: C.muted }}>Incl. 15% overhead margin · GST {(gst(baseMrp) * 100).toFixed(0)}%</div>
                  </div>
                  <div className="text-right" style={{ fontFamily: 'monospace' }}>
                    <span className="text-xs" style={{ color: C.muted }}>₹</span>
                    <span className="text-2xl font-bold" style={{ color: C.goldDk }}>{fmt(landing.toFixed(0))}</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Pricing & Sizes (collapsible, standard sizes) */}
            <Card className="p-6">
              <SectionHead icon="straighten" title="Pricing & Sizes" subtitle="Standard sizes off a base price. SKUs auto-generate from style code."
                right={<button onClick={() => setSizesOpen(o => !o)} className="text-xs px-2 py-1 rounded-lg border" style={{ borderColor: C.border, color: C.muted }}>{sizesOpen ? 'Collapse ▲' : 'Expand ▼'}</button>} />
              {/* base price row always visible */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div><Lbl>Base MRP (₹)</Lbl><Num value={form.mrp} onChange={v => set('mrp', v)} placeholder="4000" /></div>
                <div><Lbl>Base Selling Price (₹)</Lbl><Num value={form.sellingPrice} onChange={v => set('sellingPrice', v)} placeholder="3400" /></div>
                <div><Lbl>Discount</Lbl><div className="rounded-lg px-3 py-2.5 text-sm" style={{ background: C.bg, color: C.muted }}>{baseMrp > 0 ? `${(((baseMrp - baseSp) / baseMrp) * 100).toFixed(1)}%` : '—'}</div></div>
                <div className="flex items-end"><button onClick={sizes.length ? applyBase : genSizes} className="w-full px-3 py-2.5 rounded-lg text-xs font-semibold" style={{ background: C.amberBg, color: C.amber, border: `1px solid #fcd34d` }}>{sizes.length ? '↻ Apply base + SKUs' : 'Generate standard sizes'}</button></div>
              </div>

              {sizesOpen && sizes.length > 0 && (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-2" style={{ background: '#f5f4f0' }}>
                    {['Active','Size','SKU','MRP (₹)','Selling (₹)','Compare (₹)',''].map((h, x) => (
                      <div key={x} className={`uppercase ${x===0?'col-span-1':x===1?'col-span-1':x===2?'col-span-3':x===6?'col-span-1 text-right':'col-span-2'}`} style={{ fontSize: 9, letterSpacing: '0.08em', color: x>=3&&x<=4?C.goldDk:'#9c9b97', fontWeight: 600 }}>{h}</div>
                    ))}
                  </div>
                  {sizes.map((v, i) => (
                    <div key={v.size || i} className="grid grid-cols-2 sm:grid-cols-12 gap-2 px-3 py-2 items-center" style={{ borderTop: `1px solid ${C.border}` }}>
                      <div className="col-span-1"><input type="checkbox" checked={v.active !== false} onChange={e => updSize(i, 'active', e.target.checked)} className="w-4 h-4 accent-yellow-500" /></div>
                      <div className="col-span-1"><span className="text-xs font-bold px-2 py-1 rounded-md" style={{ background: v.active !== false ? C.amberBg : '#f3f4f6', color: v.active !== false ? C.amber : '#9ca3af' }}>{v.size}</span></div>
                      <div className="col-span-3"><input readOnly value={v.sku || ''} className="w-full rounded-lg px-2 py-1.5 text-xs" style={{ fontFamily: 'monospace', background: C.bg, color: '#6b7280', border: `1px solid ${C.border}` }} /></div>
                      <div className="col-span-1 sm:col-span-2"><input type="text" inputMode="decimal" value={v.mrp ?? ''} onChange={e => { const m = e.target.value === '' ? '' : +e.target.value; updSize(i, 'mrp', m); updSize(i, 'compareAtPrice', m) }} className="w-full rounded-lg px-2 py-1.5 text-sm" style={{ fontFamily: 'monospace', border: `1px solid ${C.border}` }} /></div>
                      <div className="col-span-1 sm:col-span-2"><input type="text" inputMode="decimal" value={v.sellingPrice ?? ''} onChange={e => updSize(i, 'sellingPrice', e.target.value === '' ? '' : +e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-sm" style={{ fontFamily: 'monospace', border: `1px solid ${C.border}` }} /></div>
                      <div className="col-span-1 sm:col-span-2"><input type="text" inputMode="decimal" value={v.compareAtPrice ?? ''} onChange={e => updSize(i, 'compareAtPrice', e.target.value === '' ? '' : +e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-sm" style={{ fontFamily: 'monospace', color: C.muted, border: `1px solid ${C.border}` }} /></div>
                      <div className="col-span-1 text-right"><button onClick={() => rmSize(i)} className="text-gray-300 hover:text-red-400"><Icon name="trash" cls="w-3.5 h-3.5" /></button></div>
                    </div>
                  ))}
                  <div className="px-3 py-2 flex items-center justify-between" style={{ background: C.bg, borderTop: `1px solid ${C.border}` }}>
                    <span className="text-xs" style={{ color: C.muted }}>{sizes.filter(v => v.active !== false).length} active size{sizes.filter(v => v.active !== false).length === 1 ? '' : 's'}</span>
                  </div>
                </div>
              )}
              {sizesOpen && sizes.length === 0 && (
                <div className="text-center py-4 rounded-xl border-2 border-dashed" style={{ borderColor: C.border }}>
                  <div className="text-sm mb-2" style={{ color: C.muted }}>No sizes yet</div>
                  <button onClick={genSizes} className="text-xs font-semibold" style={{ color: C.goldDk }}>Generate standard sizes (S · M · L · XL · XXL · MTF)</button>
                </div>
              )}
            </Card>
          </div>

          {/* ── RIGHT (1/3): live estimation + review ── */}
          <div className="space-y-5">
            <div className="rounded-2xl p-5 sticky top-4" style={{ background: 'linear-gradient(160deg,#fef3c7,#fde9a9)', border: `1px solid #fcd34d` }}>
              <h4 style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, fontSize: 16, color: C.goldDk }}>Live Estimation</h4>
              <div className="mt-3 space-y-2 text-sm" style={{ color: C.ink }}>
                <div className="flex justify-between"><span>Variant COGS</span><span style={{ fontFamily: 'monospace', color: C.indigo, fontWeight: 700 }}>₹{fmt(n(cogs).toFixed(0))}</span></div>
                <div className="flex justify-between"><span>Base MRP</span><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>₹{baseMrp > 0 ? fmt(baseMrp) : '—'}</span></div>
                <div className="flex justify-between"><span>Eff. Selling Price</span><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>₹{effSP > 0 ? fmt(effSP.toFixed(0)) : '—'}</span></div>
                <div className="flex justify-between"><span>Gross Margin</span><span style={{ fontFamily: 'monospace', fontWeight: 700, color: gm > 0.5 ? C.green : gm > 0.3 ? '#d97706' : C.red }}>{cogs > 0 ? (gm * 100).toFixed(1) + '%' : '—'}</span></div>
              </div>
              <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(120,89,0,0.2)' }}>
                <p className="text-[10px] font-bold uppercase mb-1" style={{ color: C.goldDk }}>Status Insight</p>
                <p className="text-sm font-bold" style={{ color: C.ink }}>{REVIEW_CHIP[rs].label}</p>
                {rs === 'rejected' && variant?.cogs_rejection_note && <p className="text-xs mt-1" style={{ color: C.red }}>⚠ {variant.cogs_rejection_note}</p>}
              </div>
            </div>

            {/* review actions */}
            <Card className="p-4">
              <p className="text-[11px] font-bold uppercase mb-2" style={{ color: C.muted }}>COGS Review</p>
              <div className="flex flex-wrap gap-2">
                {(rs === 'pending_entry' || rs === 'rejected') && <button onClick={() => stamp('in_review')} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: C.gold, color: '#fff' }}>Submit for Review</button>}
                {rs === 'in_review' && <button onClick={() => stamp('finalized')} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: C.green, color: '#fff' }}>Finalize</button>}
                {(rs === 'in_review' || rs === 'pending_entry') && <button onClick={() => { const note = prompt('Rejection note (optional):'); stamp('rejected', note || '') }} className="px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: '#fecaca', color: C.red }}>Reject</button>}
                {rs === 'finalized' && <button onClick={() => { if (confirm('Unlock COGS for re-editing?')) stamp('pending_entry') }} className="px-3 py-1.5 rounded-lg text-xs font-medium border" style={{ borderColor: C.border, color: C.muted }}>Unlock for re-edit</button>}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ── Sticky save bar ── */}
      {form && (
        <div className="fixed bottom-0 left-0 right-0 z-40 px-4 sm:px-8 py-3 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.95)', borderTop: `1px solid ${C.border}`, backdropFilter: 'blur(6px)' }}>
          <span className="text-xs" style={{ color: C.muted }}>{status === 'saved' ? 'Saved ✓' : status === 'saving' ? 'Saving…' : 'Unsaved changes are kept until you save'}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: C.border, color: '#6b7280' }}>Close</button>
            <button onClick={save} disabled={status === 'saving'} className="px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 disabled:opacity-50" style={{ background: C.gold, color: '#fff' }}>
              <Icon name="save" cls="w-4 h-4" /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProductViewV2

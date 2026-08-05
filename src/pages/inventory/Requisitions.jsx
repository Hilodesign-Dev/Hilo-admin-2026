/* ═══════════════════════════════════════════════════════════════════════════
   REQUISITIONS (p19) — catalog-style Builder (any size editable, SKU created on
   demand), Analytics, founder approval, production sheet, and Shipping with
   partial / multiple shipments + courier tracking.
   Lifecycle: draft → submitted → frozen → in_transit → received | partially_received
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { toast } from '../../lib/designTokens'

const FH = 'Manrope, system-ui, sans-serif'
const P = {
  surface: '#fcf9f1', white: '#fff', cLow: '#f7f3eb', cMed: '#f1eee6', cHigh: '#ebe8e0',
  onSurface: '#1c1c17', onVar: '#4d4636', outline: '#7f7663', outlineVar: '#d0c5b0',
  brass: '#745b00', gold: '#c9a432', error: '#ba1a1a', green: '#15803d', amber: '#b45309', blue: '#1d4ed8',
}
const Sym = ({ i, s = 20, c, style }) => <span className="material-symbols-outlined" style={{ fontSize: s, color: c, verticalAlign: 'middle', ...style }}>{i}</span>
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'MTF', 'OS']
const KID_ORDER = ['2-3 YEARS','3-4 YEARS','4-5 YEARS','5-6 YEARS','6-7 YEARS','7-8 YEARS','8-9 YEARS','9-10 YEARS','10-11 YEARS','11-12 YEARS']
const sizeRank = (sz) => { const u = String(sz || '').toUpperCase(); let i = SIZES.indexOf(u); if (i >= 0) return i; i = KID_ORDER.indexOf(u); if (i >= 0) return 100 + i; const n = parseInt(u, 10); if (!isNaN(n) && /^[0-9]/.test(u)) return 200 + n; return 400 }
const orderSizes = (arr) => [...arr].sort((a, b) => sizeRank(a) - sizeRank(b))
const sizeLabel = (sz, sole) => (sole && String(sz).toUpperCase() === 'OS') ? 'Qty' : sz
const me = () => window._currentUserName || 'system'
const isAdmin = () => window._currentUserRole === 'admin'
const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN')
const inr = (n) => '₹' + fmt(Math.round(Number(n) || 0))
const lakh = (n) => { n = Number(n) || 0; return n >= 100000 ? '₹' + (n / 100000).toFixed(1) + ' L' : inr(n) }
const KINDS = [
  ['opening_stock', 'Opening stock', 'First inventory for a location'],
  ['replenishment', 'Replenishment', 'Back office → store top-up'],
  ['transfer', 'Inter-store transfer', 'Move stock between stores'],
]
const KIND_LABEL = Object.fromEntries(KINDS.map(k => [k[0], k[1]]))
const STATUS = {
  draft: { l: 'Draft', c: P.outline, bg: P.cMed }, submitted: { l: 'Submitted', c: P.amber, bg: '#fdf3e3' },
  frozen: { l: 'Frozen', c: P.blue, bg: '#e8eefc' }, in_transit: { l: 'In transit', c: '#6d28d9', bg: '#efe9fb' },
  received: { l: 'Received', c: P.green, bg: '#e7f7ed' }, partially_received: { l: 'Partially received', c: P.amber, bg: '#fdf3e3' },
  rejected: { l: 'Rejected', c: P.error, bg: '#fdecec' }, cancelled: { l: 'Cancelled', c: P.outline, bg: P.cMed },
  planned: { l: 'Planned', c: P.blue, bg: '#e8eefc' },
}
const Pill = ({ s }) => { const x = STATUS[s] || STATUS.draft; return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999, color: x.c, background: x.bg }}>{x.l}</span> }
const Thumb = ({ url, size = 40 }) => url
  ? <img src={url} loading="lazy" width={size} height={size} style={{ width: size, height: size, objectFit: 'cover', borderRadius: 10, border: `1px solid ${P.outlineVar}`, background: P.cMed }} />
  : <div style={{ width: size, height: size, borderRadius: 10, background: P.cMed, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sym i="checkroom" s={size * 0.5} c={P.outline} /></div>
const sel = { fontSize: 13, padding: '8px 10px', borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: P.white, color: P.onSurface, outline: 'none' }
const btn = (bg, c) => ({ fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 8, background: bg, color: c, display: 'inline-flex', alignItems: 'center', gap: 6 })

/* status stepper */
const STEPS = [['draft', 'Draft'], ['submitted', 'Submitted'], ['frozen', 'Approved'], ['in_transit', 'Shipping'], ['received', 'Received']]
function Stepper({ status }) {
  const order = ['draft', 'submitted', 'frozen', 'in_transit', 'received']
  let idx = order.indexOf(status === 'partially_received' ? 'in_transit' : status)
  if (status === 'rejected' || status === 'cancelled') idx = -1
  return (
    <div className="flex items-center gap-1 flex-wrap mb-4">
      {STEPS.map(([k, l], i) => {
        const done = idx >= i; const cur = idx === i
        return <React.Fragment key={k}>
          {i > 0 && <div style={{ width: 18, height: 2, background: idx >= i ? P.brass : P.outlineVar }} />}
          <div className="inline-flex items-center gap-1.5" style={{ padding: '4px 10px', borderRadius: 999, background: cur ? P.brass : done ? '#fbf6e6' : P.cMed, color: cur ? '#fff' : done ? P.brass : P.outline }}>
            <Sym i={done && !cur ? 'check_circle' : 'circle'} s={14} c={cur ? '#fff' : done ? P.brass : P.outline} />
            <span style={{ fontSize: 11, fontWeight: 700 }}>{l}</span>
          </div>
        </React.Fragment>
      })}
      {(status === 'rejected' || status === 'cancelled') && <span className="ml-2"><Pill s={status} /></span>}
    </div>
  )
}

/* production sheet (printable) */
async function printProductionSheet(batch, locName) {
  const { data } = await supa.from('inventory_planned_batch_lines')
    .select('qty_planned, inventory_skus(product_id, product_title, style_code, variant_name, size, sku_code, unit_cost, garment_category, colour_primary, image_url, mrp)')
    .eq('batch_id', batch.id)
  const groups = new Map()
  ;(data || []).forEach(l => { const sk = l.inventory_skus || {}; const k = sk.product_id || sk.style_code
    if (!groups.has(k)) groups.set(k, { title: sk.product_title, style_code: sk.style_code, variant_name: sk.variant_name, category: sk.garment_category, colour: sk.colour_primary, image: sk.image_url, mrp: sk.mrp, unit_cost: sk.unit_cost, sizes: {} })
    groups.get(k).sizes[sk.size] = (groups.get(k).sizes[sk.size] || 0) + l.qty_planned })
  const cards = [...groups.values()].sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.title || '').localeCompare(b.title || ''))
  const pcs = cards.reduce((s, c) => s + Object.values(c.sizes).reduce((a, q) => a + q, 0), 0)
  const cogs = cards.reduce((s, c) => s + Object.values(c.sizes).reduce((a, q) => a + q, 0) * (c.unit_cost || 0), 0)
  const cardHtml = cards.map(c => {
    const szs = orderSizes(Object.keys(c.sizes)); const sole = szs.length === 1
    const tot = Object.values(c.sizes).reduce((a, q) => a + q, 0)
    const cells = szs.map(sz => `<div class="cell"><div class="lbl">${sizeLabel(sz, sole)}</div><div class="q">${c.sizes[sz]}</div></div>`).join('')
    const img = c.image ? `<img src="${c.image}" class="thumb"/>` : `<div class="thumb ph"></div>`
    return `<div class="card">${img}<div class="info"><div class="title">${c.title || ''}</div><div class="meta">${[c.style_code, c.variant_name && c.variant_name !== c.style_code ? c.variant_name : '', c.category, c.colour].filter(Boolean).join(' · ')}</div></div><div class="sizes">${cells}</div><div class="tot">${tot}</div></div>`
  }).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${batch.batch_code} — Production Sheet</title>
  <style>body{font-family:Manrope,Arial,sans-serif;color:#1c1c17;background:#fcf9f1;padding:24px;margin:0}
  h1{font-size:20px;margin:0 0 4px}.meta-top{color:#4d4636;font-size:13px;margin-bottom:18px}
  .card{display:flex;align-items:center;gap:14px;background:#fff;border:1px solid #d0c5b0;border-radius:14px;padding:12px;margin-bottom:10px;page-break-inside:avoid}
  .thumb{width:54px;height:54px;border-radius:10px;object-fit:cover;border:1px solid #d0c5b0;flex-shrink:0}.thumb.ph{background:#f1eee6}
  .info{flex:1;min-width:0}.title{font-weight:700;font-size:14px}.meta{font-size:11px;color:#745b00;font-weight:600;margin-top:2px}
  .sizes{display:flex;gap:6px;flex-wrap:wrap}.cell{text-align:center;min-width:42px}.cell .lbl{font-size:9px;font-weight:700;color:#745b00;text-transform:uppercase}
  .cell .q{margin-top:2px;border:1px solid #c9a432;background:#fbf6e6;border-radius:7px;padding:5px 0;font-weight:700;font-size:14px}
  .tot{width:54px;text-align:right;font-weight:800;font-size:15px}
  button{margin-bottom:14px;padding:8px 16px;border:0;border-radius:8px;background:#745b00;color:#fff;font-weight:700;cursor:pointer}@media print{button{display:none}body{background:#fff}}</style></head>
  <body><button onclick="window.print()">Print / Save as PDF</button>
  <h1>Production Sheet — ${batch.name || batch.batch_code}</h1>
  <div class="meta-top">${batch.batch_code} · ${KIND_LABEL[batch.requisition_kind] || ''} · → ${locName || ''} · ${cards.length} products · ${pcs} pieces · est. COGS ${inr(cogs)} · ${new Date().toLocaleString('en-IN')}</div>
  ${cardHtml}</body></html>`
  const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() } else toast(false, 'Allow pop-ups to view the sheet')
}

/* ── New requisition modal ─────────────────────────────────────────────── */
function NewModal({ locations, onClose, onCreated }) {
  const [name, setName] = useState(''); const [kind, setKind] = useState('opening_stock')
  const [dest, setDest] = useState(''); const [src, setSrc] = useState(''); const [exp, setExp] = useState(''); const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    if (!name.trim()) return toast(false, 'Name required')
    if (!dest) return toast(false, 'Destination required')
    if (kind !== 'opening_stock' && !src) return toast(false, 'Source required for this kind')
    setBusy(true)
    try {
      let code = 'REQ-' + Date.now().toString().slice(-5)
      try { const { data } = await supa.rpc('next_batch_code', { p_prefix: 'REQ' }); if (data) code = data } catch {}
      const { data, error } = await supa.from('inventory_planned_batches').insert({
        batch_code: code, name: name.trim(), requisition_kind: kind,
        destination_location_id: dest, source_location_id: src || null,
        source_kind: kind === 'opening_stock' ? 'production' : 'transfer',
        expected_at: exp || null, notes: notes || null, status: 'draft', created_by_name: me(),
      }).select().single()
      if (error) throw error
      onCreated(data)
    } catch (e) { toast(false, 'Failed: ' + (e.message || e)) } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,28,23,0.35)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: P.surface, border: `1px solid ${P.outlineVar}` }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 style={{ fontFamily: FH, fontSize: 18, fontWeight: 700, color: P.onSurface }}>New requisition</h3><button onClick={onClose}><Sym i="close" c={P.outline} /></button></div>
        <label style={{ fontSize: 12, fontWeight: 600, color: P.onVar }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Bangalore Store Opening — Sep 2026" className="w-full mt-1 mb-3" style={sel} />
        <label style={{ fontSize: 12, fontWeight: 600, color: P.onVar }}>Kind</label>
        <div className="mt-1 mb-3 space-y-1.5">
          {KINDS.map(([k, l, d]) => (
            <button key={k} onClick={() => setKind(k)} className="w-full text-left flex items-start gap-2 p-2.5 rounded-lg" style={{ border: `1px solid ${kind === k ? P.gold : P.outlineVar}`, background: kind === k ? '#fbf6e6' : P.white }}>
              <Sym i={kind === k ? 'radio_button_checked' : 'radio_button_unchecked'} s={18} c={kind === k ? P.brass : P.outline} />
              <span><div style={{ fontSize: 13, fontWeight: 700, color: P.onSurface }}>{l}</div><div style={{ fontSize: 11, color: P.outline }}>{d}</div></span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label style={{ fontSize: 12, fontWeight: 600, color: P.onVar }}>Destination</label>
            <select value={dest} onChange={e => setDest(e.target.value)} className="w-full mt-1" style={sel}><option value="">Select…</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div><label style={{ fontSize: 12, fontWeight: 600, color: P.onVar }}>Source {kind === 'opening_stock' && '(optional)'}</label>
            <select value={src} onChange={e => setSrc(e.target.value)} className="w-full mt-1" style={sel}><option value="">{kind === 'opening_stock' ? 'Vendor / Production' : 'Select…'}</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        </div>
        <label style={{ fontSize: 12, fontWeight: 600, color: P.onVar }}>Expected by</label>
        <input type="date" value={exp} onChange={e => setExp(e.target.value)} className="w-full mt-1 mb-3" style={sel} />
        <label style={{ fontSize: 12, fontWeight: 600, color: P.onVar }}>Notes</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} className="w-full mt-1 mb-4" style={sel} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} style={btn(P.white, P.onVar)}>Cancel</button>
          <button onClick={create} disabled={busy} style={btn(P.brass, '#fff')}>{busy ? 'Creating…' : 'Create as draft'}</button>
        </div>
      </div>
    </div>
  )
}

/* ── Builder: any size editable; missing SKUs created on save ──────────── */
function Builder({ batch, locked, onChanged }) {
  const [variants, setVariants] = useState([]); const [skuIndex, setSkuIndex] = useState(new Map()); const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState(''); const [search, setSearch] = useState(''); const [onlyAdded, setOnlyAdded] = useState(false)
  const [entered, setEntered] = useState(new Map()); const [saving, setSaving] = useState(false); const [page, setPage] = useState(0); const PAGE_SIZE = 50
  const key = (pid, size) => pid + '|' + size

  useEffect(() => { (async () => {
    // One light row per variant (size -> sku_id), fully paginated so every
    // catalogue product is available (Supabase caps a single query at 1000 rows).
    const PAGE = 1000; let rows = [], from = 0
    while (true) {
      const { data, error } = await supa.from('v_inventory_variants').select('*').neq('catalogue_status', 'Inactive').order('product_title').range(from, from + PAGE - 1)
      if (error || !data || !data.length) break
      rows = rows.concat(data)
      if (data.length < PAGE) break
      from += PAGE
    }
    const idx = new Map()
    const list = rows.map(r => {
      const sizes = {}
      Object.entries(r.size_skus || {}).forEach(([sz, id]) => { sizes[sz] = { id, mrp: r.mrp, unit_cost: r.unit_cost }; idx.set(id, { pid: r.product_id, size: sz }) })
      return { product_id: r.product_id, title: r.product_title, style_code: r.style_code, variant_name: r.variant_name, category: r.garment_category, colour: r.colour_primary, image_url: r.image_url, mrp: r.mrp, unit_cost: r.unit_cost, sizes }
    })
    setVariants(list); setSkuIndex(idx); setLoading(false)
  })() }, [])
  useEffect(() => { if (!batch?.id) return; supa.from('inventory_planned_batch_lines').select('sku_id, qty_planned').eq('batch_id', batch.id).then(({ data }) => {
    const m = new Map(); (data || []).forEach(r => { const x = skuIndex.get(r.sku_id); if (x) m.set(key(x.pid, x.size), r.qty_planned) }); setEntered(m)
  }) }, [batch?.id, skuIndex])
  useEffect(() => { setPage(0) }, [category, search, onlyAdded])

  const categories = useMemo(() => [...new Set(variants.map(v => v.category).filter(Boolean))].sort(), [variants])
  const visible = useMemo(() => {
    let v = variants
    if (category) v = v.filter(x => x.category === category)
    if (search) { const s = search.toLowerCase(); v = v.filter(x => [x.title, x.style_code, x.colour].filter(Boolean).join(' ').toLowerCase().includes(s)) }
    if (onlyAdded) v = v.filter(x => SIZES.some(sz => (entered.get(key(x.product_id, sz)) || 0) > 0))
    return v
  }, [variants, category, search, onlyAdded, entered])
  const totals = useMemo(() => {
    let sku = 0, variant = 0, pieces = 0, cogs = 0, mrp = 0
    variants.forEach(v => { let added = false; SIZES.forEach(sz => { const q = entered.get(key(v.product_id, sz)) || 0; if (q > 0) { sku++; pieces += q; const s = v.sizes[sz]; cogs += q * ((s && s.unit_cost) || v.unit_cost || 0); mrp += q * ((s && s.mrp) || v.mrp || 0); added = true } }); if (added) variant++ })
    return { sku, variant, pieces, cogs, mrp, margin: mrp > 0 ? (mrp - cogs) / mrp : 0 }
  }, [variants, entered])

  const setCell = (pid, size, val) => { const n = Math.max(0, parseInt((val || '').replace(/[^0-9]/g, ''), 10) || 0); setEntered(prev => { const m = new Map(prev); if (n === 0) m.delete(key(pid, size)); else m.set(key(pid, size), n); return m }) }
  const save = async () => {
    setSaving(true)
    try {
      // resolve every entered (pid|size) to a sku_id, creating missing ones
      const vmap = new Map(variants.map(v => [v.product_id, v]))
      const upserts = []
      for (const [k, q] of entered) { if (q <= 0) continue
        const [pid, size] = k.split('|'); const v = vmap.get(pid); let skuId = v && v.sizes[size] ? v.sizes[size].id : null
        if (!skuId) { const { data, error } = await supa.rpc('get_or_create_sku', { p_product_id: pid, p_size: size }); if (error) throw error; skuId = data }
        upserts.push({ batch_id: batch.id, sku_id: skuId, qty_planned: q })
      }
      const { data: existing } = await supa.from('inventory_planned_batch_lines').select('id, sku_id').eq('batch_id', batch.id)
      const keepSkus = new Set(upserts.map(u => u.sku_id))
      const del = (existing || []).filter(r => !keepSkus.has(r.sku_id)).map(r => r.id)
      if (del.length) await supa.from('inventory_planned_batch_lines').delete().in('id', del)
      if (upserts.length) await supa.from('inventory_planned_batch_lines').upsert(upserts, { onConflict: 'batch_id,sku_id' })
      toast(true, `Saved: ${totals.sku} SKUs · ${totals.pieces} pcs`); onChanged && onChanged()
    } catch (e) { toast(false, 'Save failed: ' + (e.message || e)) } finally { setSaving(false) }
  }
  const submit = async () => {
    if (totals.pieces === 0) return toast(false, 'Add at least one line')
    await save()
    try { await supa.rpc('submit_requisition', { p_batch_id: batch.id, p_actor: me() }); toast(true, 'Submitted for approval'); onChanged && onChanged() }
    catch (e) { toast(false, 'Submit failed: ' + (e.message || e)) }
  }

  if (loading) return <div className="text-center py-12" style={{ color: P.onVar }}>Loading catalogue…</div>
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1" style={{ minWidth: 200 }}>
          <Sym i="search" s={18} c={P.outline} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, style code, colour" className="w-full" style={{ ...sel, paddingLeft: 34 }} />
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)} style={sel}><option value="">All categories</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
        <label className="inline-flex items-center gap-1.5 px-3 rounded-lg" style={{ fontSize: 12, fontWeight: 600, color: P.onVar, border: `1px solid ${P.outlineVar}`, background: P.white }}>
          <input type="checkbox" checked={onlyAdded} onChange={e => setOnlyAdded(e.target.checked)} /> Only added
        </label>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.outlineVar}`, background: P.white }}>
        <div className="flex items-center px-3 py-2" style={{ background: P.cLow, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: P.outline }}>
          <div className="flex-1">Variant · sizes</div><div style={{ width: 60, textAlign: 'right' }}>Total</div>
        </div>
        {visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(v => {
          const sizes = orderSizes(Object.keys(v.sizes)); const sole = sizes.length === 1
          const line = sizes.reduce((s, sz) => s + (entered.get(key(v.product_id, sz)) || 0), 0)
          return (
            <div key={v.product_id} className="flex items-center gap-3 px-3 py-2" style={{ borderTop: `1px solid ${P.cHigh}`, background: line > 0 ? '#fcfaf2' : 'transparent' }}>
              <div className="flex items-center gap-2" style={{ flex: '1 1 240px', minWidth: 0 }}>
                <Thumb url={v.image_url} size={40} />
                <div className="min-w-0">
                  <div style={{ fontSize: 13, fontWeight: 700, color: P.onSurface, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</div>
                  <div style={{ fontSize: 10, color: P.brass, fontWeight: 600 }}>{v.style_code}{v.variant_name && v.variant_name !== v.style_code ? ' · ' + v.variant_name : ''}{v.mrp ? ' · ' + inr(v.mrp) : ''}</div>
                </div>
              </div>
              <div className="flex gap-1.5 flex-shrink-0 overflow-x-auto">
                {sizes.map(sz => { const q = entered.get(key(v.product_id, sz)) || ''
                  return <div key={sz} style={{ textAlign: 'center', minWidth: sole ? 64 : 44 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: q ? P.brass : P.outline, whiteSpace: 'nowrap' }}>{sizeLabel(sz, sole)}</div>
                    <input value={q} disabled={locked} inputMode="decimal" onChange={e => setCell(v.product_id, sz, e.target.value)} placeholder="—" className="text-center" style={{ marginTop: 2, width: sole ? 64 : 44, padding: '5px 0', borderRadius: 7, border: `1px solid ${q ? P.gold : P.outlineVar}`, background: q ? '#fbf6e6' : P.white, fontSize: 13, fontWeight: 700, color: P.onSurface, outline: 'none', opacity: locked ? 0.6 : 1 }} />
                  </div> })}
              </div>
              <div style={{ width: 60, textAlign: 'right', fontFamily: FH, fontWeight: 700, fontSize: 13, color: line > 0 ? P.brass : P.outline }}>{line || '·'}</div>
            </div>
          )
        })}
        {visible.length === 0 && <div className="text-center py-10" style={{ color: P.outline }}>No variants match.</div>}
        {visible.length > PAGE_SIZE && (() => { const tp = Math.ceil(visible.length / PAGE_SIZE); return (
          <div className="flex items-center justify-between px-3 py-3" style={{ borderTop: `1px solid ${P.cHigh}`, fontSize: 13, color: P.onVar }}>
            <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, visible.length)} of {visible.length}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 999, border: `1px solid ${P.outlineVar}`, color: P.brass, background: P.white, opacity: page === 0 ? 0.4 : 1 }}>‹ Prev</button>
              <span>Page {page + 1} of {tp}</span>
              <button onClick={() => setPage(p => Math.min(tp - 1, p + 1))} disabled={page >= tp - 1} style={{ fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 999, border: `1px solid ${P.outlineVar}`, color: P.brass, background: P.white, opacity: page >= tp - 1 ? 0.4 : 1 }}>Next ›</button>
            </div>
          </div>
        ) })()}
      </div>
      <div className="mt-3 p-3 rounded-xl flex items-center gap-4 flex-wrap sticky bottom-0" style={{ background: P.cLow, border: `1px solid ${P.outlineVar}` }}>
        <div style={{ fontSize: 12, color: P.onVar }}><b style={{ color: P.onSurface }}>{totals.variant}</b> variants · <b style={{ color: P.onSurface }}>{totals.sku}</b> SKUs · <b style={{ color: P.onSurface }}>{fmt(totals.pieces)}</b> pcs</div>
        <div style={{ fontSize: 12, color: P.onVar }}>COGS <b style={{ color: P.onSurface }}>{lakh(totals.cogs)}</b> · MRP <b style={{ color: P.onSurface }}>{lakh(totals.mrp)}</b> · Margin <b style={{ color: P.brass }}>{(totals.margin * 100).toFixed(1)}%</b></div>
        <div className="flex-1" />
        {!locked && <>
          <button onClick={save} disabled={saving} style={btn(P.white, P.onSurface)}><Sym i="save" s={16} c={P.onSurface} /> Save draft</button>
          <button onClick={submit} disabled={saving || totals.pieces === 0} style={{ ...btn(P.brass, '#fff'), opacity: totals.pieces === 0 ? 0.5 : 1 }}><Sym i="send" s={16} c="#fff" /> Submit for approval</button>
        </>}
      </div>
    </div>
  )
}

/* ── Analytics ─────────────────────────────────────────────────────────── */
function Kpi({ label, value, accent }) {
  return <div className="p-4 rounded-xl" style={{ background: P.white, border: `1px solid ${P.outlineVar}` }}>
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: P.outline }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: FH, marginTop: 4, color: accent || P.onSurface }}>{value}</div>
  </div>
}
function Analytics({ batchId }) {
  const [sum, setSum] = useState(null); const [cats, setCats] = useState([]); const [sizes, setSizes] = useState([])
  useEffect(() => { if (!batchId) return
    Promise.all([
      supa.from('v_requisition_summary').select('*').eq('batch_id', batchId).maybeSingle(),
      supa.from('v_requisition_category_breakdown').select('*').eq('batch_id', batchId).order('cogs_total', { ascending: false }),
      supa.from('v_requisition_size_distribution').select('*').eq('batch_id', batchId),
    ]).then(([s, c, z]) => { setSum(s.data); setCats(c.data || []); setSizes(z.data || []) })
  }, [batchId])
  if (!sum) return <div className="text-center py-12" style={{ color: P.onVar }}>No data yet — add lines in the Builder.</div>
  const pieces = Number(sum.piece_count || 0)
  const margin = sum.mrp_total > 0 ? ((sum.mrp_total - sum.cogs_total) / sum.mrp_total) * 100 : 0
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Variants" value={fmt(sum.variant_count)} /><Kpi label="SKUs" value={fmt(sum.sku_count)} />
        <Kpi label="Pieces" value={fmt(pieces)} /><Kpi label="Avg ₹/pc" value={inr(sum.avg_price_per_piece)} />
        <Kpi label="COGS total" value={lakh(sum.cogs_total)} accent={P.amber} /><Kpi label="MRP total" value={lakh(sum.mrp_total)} accent={P.brass} />
        <Kpi label="Est. margin" value={margin.toFixed(1) + '%'} accent={P.green} /><Kpi label="Pieces / variant" value={sum.variant_count > 0 ? Math.round(pieces / sum.variant_count) : 0} />
      </div>
      {Number(sum.skus_missing_cost || 0) > 0 && <div className="p-3 rounded-xl" style={{ fontSize: 13, background: '#fdf3e3', color: P.amber }}>⚠ {sum.skus_missing_cost} SKUs missing unit cost — COGS estimate excludes these.</div>}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.outlineVar}`, background: P.white }}>
        <div className="px-3 py-2" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: P.outline, background: P.cLow }}>Breakdown by category</div>
        <div className="grid gap-2 px-3 py-2" style={{ gridTemplateColumns: '2fr repeat(4,1fr)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: P.outline }}>
          <div>Category</div><div className="text-right">Variants</div><div className="text-right">Pieces</div><div className="text-right">COGS</div><div className="text-right">MRP</div>
        </div>
        {cats.map(c => <div key={c.garment_category || 'n'} className="grid gap-2 px-3 py-2" style={{ gridTemplateColumns: '2fr repeat(4,1fr)', borderTop: `1px solid ${P.cHigh}`, fontSize: 12 }}>
          <div style={{ color: P.onSurface }}>{c.garment_category || '(uncategorised)'}</div>
          <div className="text-right" style={{ fontFamily: FH }}>{c.variant_count}</div><div className="text-right" style={{ fontFamily: FH }}>{fmt(c.piece_count)}</div>
          <div className="text-right" style={{ fontFamily: FH }}>{lakh(c.cogs_total)}</div><div className="text-right" style={{ fontFamily: FH, color: P.brass }}>{lakh(c.mrp_total)}</div>
        </div>)}
      </div>
      <div className="rounded-xl p-3" style={{ border: `1px solid ${P.outlineVar}`, background: P.white }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: P.outline, marginBottom: 10 }}>Distribution by size</div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${SIZES.length},1fr)`, gap: 8 }}>
          {SIZES.map(s => { const r = sizes.find(x => x.size === s); const p = Number(r?.pieces || 0); const pct = pieces > 0 ? (p / pieces) * 100 : 0
            return <div key={s} className="text-center">
              <div style={{ fontSize: 10, fontWeight: 700, color: P.outline }}>{s}</div>
              <div style={{ fontFamily: FH, fontSize: 16, color: P.onSurface }}>{p}</div>
              <div style={{ fontSize: 10, color: P.outline }}>{pct.toFixed(0)}%</div>
              <div className="mt-1 rounded-full overflow-hidden" style={{ height: 5, background: P.cHigh }}><div style={{ width: pct + '%', height: '100%', background: P.brass }} /></div>
            </div> })}
        </div>
      </div>
    </div>
  )
}

/* ── Shipping: per-line production status + select-to-ship + courier ────── */
const PROD = { not_started: { l: 'Not started', c: P.outline, bg: P.cMed }, in_progress: { l: 'In progress', c: P.amber, bg: '#fdf3e3' }, ready: { l: 'Ready', c: P.green, bg: '#e7f7ed' } }
function Shipping({ batch, onChanged }) {
  const [lines, setLines] = useState([]); const [shipments, setShipments] = useState([]); const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false); const [courier, setCourier] = useState(''); const [tracking, setTracking] = useState('')
  const [qtys, setQtys] = useState({}); const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState(new Set()); const [pf, setPf] = useState('unshipped'); const [shipOnly, setShipOnly] = useState(null)
  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: prog }, { data: ships }] = await Promise.all([
      supa.from('v_requisition_line_progress').select('*, inventory_skus(variant_label, style_code, variant_name, size)').eq('batch_id', batch.id),
      supa.from('inventory_shipments').select('*, inventory_shipment_lines(qty)').eq('batch_id', batch.id).order('created_at'),
    ])
    setLines(prog || []); setShipments(ships || []); setLoading(false)
  }, [batch.id])
  useEffect(() => { load() }, [load])
  const remainingToShip = l => l.qty_planned - l.qty_shipped
  const shown = useMemo(() => pf === 'all' ? lines : pf === 'unshipped' ? lines.filter(l => (l.qty_planned - l.qty_shipped) > 0) : lines.filter(l => (l.prod_status || 'not_started') === pf), [lines, pf])
  const setProd = async (line_id, val) => { setLines(ls => ls.map(l => l.line_id === line_id ? { ...l, prod_status: val } : l)); await supa.from('inventory_planned_batch_lines').update({ prod_status: val }).eq('id', line_id) }
  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allShownSel = shown.length > 0 && shown.every(l => sel.has(l.line_id))
  const toggleAll = () => setSel(s => { const n = new Set(s); if (allShownSel) shown.forEach(l => n.delete(l.line_id)); else shown.forEach(l => n.add(l.line_id)); return n })
  const isShippable = l => (l.prod_status || 'not_started') === 'ready' && remainingToShip(l) > 0
  const openCreate = (restrict) => {
    const cand = lines.filter(l => isShippable(l) && (!restrict || restrict.has(l.line_id)))
    if (!cand.length) return toast(false, 'Mark items Ready (production) before shipping')
    const q = {}; cand.forEach(l => { q[l.line_id] = String(remainingToShip(l)) })
    setShipOnly(new Set(cand.map(l => l.line_id))); setQtys(q); setCourier(''); setTracking(''); setCreating(true)
  }
  const create = async () => {
    const payload = lines.filter(l => (!shipOnly || shipOnly.has(l.line_id)) && isShippable(l) && Number(qtys[l.line_id] || 0) > 0)
      .map(l => ({ line_id: l.line_id, sku_id: l.sku_id, qty: Math.min(Number(qtys[l.line_id]), remainingToShip(l)) }))
    if (!payload.length) return toast(false, 'Enter quantities to ship')
    setBusy(true)
    try { const { error } = await supa.rpc('create_shipment', { p_batch_id: batch.id, p_lines: payload, p_courier: courier, p_tracking: tracking, p_actor: me() }); if (error) throw error
      toast(true, 'Shipment created'); setCreating(false); setSel(new Set()); await load(); onChanged && onChanged() }
    catch (e) { toast(false, 'Failed: ' + (e.message || e)) } finally { setBusy(false) }
  }
  const receive = async (sh) => { if (!confirm('Confirm receipt of ' + (sh.shipment_code || 'shipment') + '? This adds the stock at destination.')) return
    try { const { error } = await supa.rpc('receive_shipment', { p_shipment_id: sh.id, p_actor: me() }); if (error) throw error; toast(true, 'Received'); await load(); onChanged && onChanged() }
    catch (e) { toast(false, 'Failed: ' + (e.message || e)) } }
  if (loading) return <div className="text-center py-12" style={{ color: P.onVar }}>Loading…</div>
  const counts = { all: lines.length, unshipped: 0, not_started: 0, in_progress: 0, ready: 0 }
  lines.forEach(l => { counts[l.prod_status || 'not_started']++; if (remainingToShip(l) > 0) counts.unshipped++ })
  const readyRemaining = lines.filter(l => (l.prod_status || 'not_started') === 'ready' && remainingToShip(l) > 0).length
  const selReady = [...sel].filter(id => { const l = lines.find(x => x.line_id === id); return l && (l.prod_status || 'not_started') === 'ready' && remainingToShip(l) > 0 }).length
  const PF = [['unshipped', 'Unshipped'], ['all', 'All'], ['not_started', 'Not started'], ['in_progress', 'In progress'], ['ready', 'Ready']]
  return (
    <div className="space-y-5">
      {/* production status + line table */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.outlineVar}`, background: P.white }}>
        <div className="flex items-center justify-between gap-2 px-3 py-2 flex-wrap" style={{ background: P.cLow }}>
          <div className="flex gap-1.5 flex-wrap">
            {PF.map(([k, l]) => <button key={k} onClick={() => setPf(k)} style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: pf === k ? P.brass : P.white, color: pf === k ? '#fff' : P.onVar, border: pf === k ? 'none' : `1px solid ${P.outlineVar}` }}>{l} <span style={{ opacity: 0.6 }}>{counts[k]}</span></button>)}
          </div>
          <div className="flex gap-2">
            {selReady > 0 && batch.status !== 'received' && <button onClick={() => openCreate(sel)} style={btn(P.brass, '#fff')}><Sym i="local_shipping" s={16} c="#fff" /> Ship selected ({selReady})</button>}
            {readyRemaining > 0 && batch.status !== 'received' && <button onClick={() => openCreate(null)} style={btn(P.white, P.brass)}><Sym i="add" s={16} c={P.brass} /> Ship ready ({readyRemaining})</button>}
          </div>
        </div>
        <div className="grid gap-2 px-3 py-2 items-center" style={{ gridTemplateColumns: '28px 2fr 150px 64px 64px 70px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: P.outline }}>
          <input type="checkbox" checked={allShownSel} onChange={toggleAll} />
          <div>Variant · size</div><div>Production</div><div className="text-right">Planned</div><div className="text-right">Shipped</div><div className="text-right">Received</div>
        </div>
        {shown.map(l => { const sk = l.inventory_skus || {}; const ps = l.prod_status || 'not_started'; return (
          <div key={l.line_id} className="grid gap-2 px-3 py-2 items-center" style={{ gridTemplateColumns: '28px 2fr 150px 64px 64px 70px', borderTop: `1px solid ${P.cHigh}`, fontSize: 12 }}>
            <input type="checkbox" checked={sel.has(l.line_id)} onChange={() => toggle(l.line_id)} />
            <div style={{ color: P.onSurface }}>{sk.variant_label || sk.style_code} · <b>{sk.size}</b></div>
            <select value={ps} onChange={e => setProd(l.line_id, e.target.value)} style={{ ...sel, padding: '5px 8px', color: PROD[ps].c, fontWeight: 700, fontSize: 12 }}>
              <option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="ready">Ready</option>
            </select>
            <div className="text-right" style={{ fontFamily: FH }}>{l.qty_planned}</div>
            <div className="text-right" style={{ fontFamily: FH, color: l.qty_shipped >= l.qty_planned ? P.green : P.onVar }}>{l.qty_shipped}</div>
            <div className="text-right" style={{ fontFamily: FH, color: l.qty_received >= l.qty_planned ? P.green : P.onVar }}>{l.qty_received}</div>
          </div>
        )})}
        {!shown.length && <div className="text-center py-8" style={{ color: P.outline }}>No lines in this filter.</div>}
      </div>
      {/* shipments */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: P.outline, marginBottom: 8 }}>Shipments ({shipments.length})</div>
        {shipments.length === 0 ? <div style={{ fontSize: 13, color: P.outline }}>No shipments yet. Mark products Ready, select them, and ship — you can split into multiple shipments.</div> : (
          <div className="space-y-2">
            {shipments.map(sh => { const pcs = (sh.inventory_shipment_lines || []).reduce((a, x) => a + x.qty, 0); return (
              <div key={sh.id} className="flex items-center justify-between gap-3 p-3 rounded-xl flex-wrap" style={{ background: P.white, border: `1px solid ${P.outlineVar}` }}>
                <div>
                  <div className="flex items-center gap-2"><span style={{ fontSize: 13, fontWeight: 700, color: P.onSurface }}>{sh.shipment_code}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: sh.status === 'delivered' ? P.green : '#6d28d9', background: sh.status === 'delivered' ? '#e7f7ed' : '#efe9fb' }}>{sh.status}</span></div>
                  <div style={{ fontSize: 12, color: P.outline, marginTop: 2 }}>{pcs} pcs{sh.courier ? ' · ' + sh.courier : ''}{sh.tracking_no ? ' · ' + sh.tracking_no : ''}{sh.shipped_at ? ' · sent ' + new Date(sh.shipped_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</div>
                </div>
                {sh.status !== 'delivered' && sh.status !== 'cancelled' && <button onClick={() => receive(sh)} style={btn(P.green, '#fff')}><Sym i="check" s={16} c="#fff" /> Mark received</button>}
              </div>
            )})}
          </div>
        )}
      </div>
      {/* create shipment modal */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(28,28,23,0.35)' }} onMouseDown={e => { if (e.target === e.currentTarget) setCreating(false) }}>
          <div className="w-full max-w-lg rounded-2xl p-5 max-h-[85vh] overflow-y-auto" style={{ background: P.surface, border: `1px solid ${P.outlineVar}` }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h3 style={{ fontFamily: FH, fontSize: 17, fontWeight: 700, color: P.onSurface }}>New shipment{shipOnly ? ' (' + shipOnly.size + ' selected)' : ''}</h3><button onClick={() => setCreating(false)}><Sym i="close" c={P.outline} /></button></div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label style={{ fontSize: 12, fontWeight: 600, color: P.onVar }}>Courier</label><input value={courier} onChange={e => setCourier(e.target.value)} placeholder="Delhivery / BlueDart…" className="w-full mt-1" style={sel} /></div>
              <div><label style={{ fontSize: 12, fontWeight: 600, color: P.onVar }}>Tracking #</label><input value={tracking} onChange={e => setTracking(e.target.value)} className="w-full mt-1" style={sel} /></div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: P.outline, marginBottom: 6 }}>Quantities to ship</div>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.outlineVar}`, background: P.white }}>
              {lines.filter(l => isShippable(l) && (!shipOnly || shipOnly.has(l.line_id))).map(l => { const sk = l.inventory_skus || {}; const rem = remainingToShip(l); return (
                <div key={l.line_id} className="grid gap-2 px-3 py-2 items-center" style={{ gridTemplateColumns: '2fr 90px', borderTop: `1px solid ${P.cHigh}`, fontSize: 12 }}>
                  <div style={{ color: P.onSurface }}>{sk.variant_label || sk.style_code} · <b>{sk.size}</b> <span style={{ color: P.outline }}>({rem} left)</span></div>
                  <input value={qtys[l.line_id] ?? ''} onChange={e => setQtys(q => ({ ...q, [l.line_id]: e.target.value.replace(/[^0-9]/g, '') }))} inputMode="decimal" className="text-right" style={{ ...sel, padding: '5px 8px' }} />
                </div>
              )})}
              {!lines.some(l => isShippable(l) && (!shipOnly || shipOnly.has(l.line_id))) && <div className="px-3 py-4 text-center" style={{ fontSize: 13, color: P.outline }}>No Ready items to ship — mark items Ready first.</div>}
            </div>
            <div className="flex justify-end gap-2 mt-4"><button onClick={() => setCreating(false)} style={btn(P.white, P.onVar)}>Cancel</button><button onClick={create} disabled={busy} style={btn(P.brass, '#fff')}>{busy ? 'Creating…' : 'Create shipment'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Detail shell ──────────────────────────────────────────────────────── */
function Detail({ batchId, locations, onBack }) {
  const [batch, setBatch] = useState(null); const [tab, setTab] = useState('builder'); const [rev, setRev] = useState(0)
  const load = useCallback(() => { supa.from('inventory_planned_batches').select('*').eq('id', batchId).single().then(({ data }) => setBatch(data)) }, [batchId])
  useEffect(() => { load() }, [load, rev])
  const bump = () => { setRev(r => r + 1); load() }
  if (!batch) return <div className="text-center py-12" style={{ color: P.onVar }}>Loading…</div>
  const locName = id => locations.find(l => l.id === id)?.name
  const locked = batch.status !== 'draft'
  const shipStage = ['frozen', 'in_transit', 'partially_received', 'received'].includes(batch.status)
  const tabs = [['builder', 'Builder', 'edit_note'], ['analytics', 'Analytics', 'insights']]
  if (shipStage) tabs.push(['shipping', 'Shipping', 'local_shipping'])
  const approve = async () => { try { await supa.rpc('approve_requisition', { p_batch_id: batch.id, p_actor: me() }); toast(true, 'Approved — frozen for production'); bump() } catch (e) { toast(false, e.message || e) } }
  const reject = async () => { const r = prompt('Reason for rejection?'); if (r == null) return; try { await supa.rpc('reject_requisition', { p_batch_id: batch.id, p_actor: me(), p_reason: r }); toast(true, 'Rejected'); bump() } catch (e) { toast(false, e.message || e) } }
  const cancel = async () => { if (!confirm('Cancel this requisition?')) return; await supa.from('inventory_planned_batches').update({ status: 'cancelled' }).eq('id', batch.id); toast(true, 'Cancelled'); bump() }
  const reopen = async () => { if (!confirm('Reopen to draft for editing? It will need approval again before shipping.')) return; await supa.from('inventory_planned_batches').update({ status: 'draft', submitted_at: null, submitted_by_name: null, approved_at: null, approved_by_name: null, approved_by_id: null, rejected_at: null, rejection_reason: null }).eq('id', batch.id); toast(true, 'Reopened to draft'); bump() }
  const del = async () => { if (!confirm('Delete this requisition permanently? This cannot be undone.')) return; try { await supa.rpc('delete_requisition', { p_batch_id: batch.id }); toast(true, 'Requisition deleted'); onBack() } catch (e) { toast(false, e.message || e) } }
  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1 mb-3" style={{ fontSize: 13, color: P.onVar }}><Sym i="arrow_back" s={18} c={P.onVar} /> All requisitions</button>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="flex items-center gap-2"><h2 style={{ fontFamily: FH, fontSize: 20, fontWeight: 700, color: P.onSurface }}>{batch.name || batch.batch_code}</h2><Pill s={batch.status} /></div>
          <div style={{ fontSize: 12, color: P.outline, marginTop: 2 }}>{batch.batch_code} · {KIND_LABEL[batch.requisition_kind] || batch.requisition_kind} · {locName(batch.source_location_id) || 'Vendor/Production'} → {locName(batch.destination_location_id) || '—'}{batch.expected_at ? ' · expected ' + new Date(batch.expected_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {batch.status === 'submitted' && isAdmin() && <><button onClick={approve} style={btn(P.green, '#fff')}><Sym i="check" s={16} c="#fff" /> Approve & freeze</button><button onClick={reject} style={btn(P.white, P.error)}>Reject</button></>}
          {batch.status === 'submitted' && !isAdmin() && <span style={{ fontSize: 12, color: P.amber, alignSelf: 'center' }}>Awaiting founder approval</span>}
          {shipStage && <button onClick={() => printProductionSheet(batch, locName(batch.destination_location_id))} style={btn(P.white, P.brass)}><Sym i="description" s={16} c={P.brass} /> Production sheet</button>}
          {['submitted', 'frozen', 'rejected'].includes(batch.status) && <button onClick={reopen} style={btn(P.white, P.onSurface)}><Sym i="edit" s={16} c={P.onSurface} /> {batch.status === 'rejected' ? 'Reopen & edit' : 'Edit'}</button>}
          {['draft', 'submitted', 'frozen', 'in_transit', 'partially_received'].includes(batch.status) && isAdmin() && <button onClick={cancel} style={btn(P.white, P.onVar)}>Cancel</button>}
          {isAdmin() && <button onClick={del} style={btn(P.white, P.error)}><Sym i="delete" s={16} c={P.error} /> Delete</button>}
        </div>
      </div>
      <Stepper status={batch.status} />
      {batch.status === 'rejected' && batch.rejection_reason && <div className="mb-3 p-2.5 rounded-lg" style={{ fontSize: 13, background: '#fdecec', color: P.error }}>Rejected: {batch.rejection_reason}</div>}
      {batch.status === 'submitted' && <div className="mb-3 p-2.5 rounded-lg" style={{ fontSize: 13, background: '#fdf3e3', color: P.amber }}>Pending approval — a founder reviews the Builder + Analytics, then approves to freeze for production.</div>}
      <div className="flex gap-5 mb-4" style={{ borderBottom: `1px solid ${P.outlineVar}` }}>
        {tabs.map(([id, label, icon]) => <button key={id} onClick={() => setTab(id)} className="inline-flex items-center gap-1.5" style={{ padding: '9px 2px', fontSize: 14, fontWeight: tab === id ? 700 : 500, color: tab === id ? P.brass : P.onVar, borderBottom: tab === id ? `2px solid ${P.brass}` : '2px solid transparent' }}><Sym i={icon} s={17} c={tab === id ? P.brass : P.onVar} /> {label}</button>)}
      </div>
      {tab === 'builder' && <Builder batch={batch} locked={locked} onChanged={bump} />}
      {tab === 'analytics' && <Analytics batchId={batch.id} />}
      {tab === 'shipping' && <Shipping batch={batch} onChanged={bump} />}
    </div>
  )
}

/* ── List ──────────────────────────────────────────────────────────────── */
export default function Requisitions() {
  const [locations, setLocations] = useState([]); const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true)
  const [statusF, setStatusF] = useState('all'); const [showNew, setShowNew] = useState(false); const [openId, setOpenId] = useState(null)
  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supa.from('inventory_planned_batches').select('*').order('created_at', { ascending: false }).limit(200)
    const ids = (data || []).map(b => b.id)
    let sums = {}
    if (ids.length) { const { data: s } = await supa.from('v_requisition_summary').select('*').in('batch_id', ids); (s || []).forEach(r => sums[r.batch_id] = r) }
    setRows((data || []).map(b => ({ ...b, _sum: sums[b.id] }))); setLoading(false)
  }, [])
  useEffect(() => { supa.from('inventory_locations').select('*').eq('is_active', true).order('sort_order').then(({ data }) => setLocations(data || [])); load() }, [load])
  const locName = id => locations.find(l => l.id === id)?.name
  const filtered = useMemo(() => statusF === 'all' ? rows : rows.filter(r => r.status === statusF), [rows, statusF])
  const FILTERS = [['all', 'All'], ['draft', 'Draft'], ['submitted', 'Submitted'], ['frozen', 'Frozen'], ['in_transit', 'In transit'], ['received', 'Received'], ['cancelled', 'Cancelled']]

  if (openId) return <Detail batchId={openId} locations={locations} onBack={() => { setOpenId(null); load() }} />
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex gap-2 flex-wrap">{FILTERS.map(([k, l]) => <button key={k} onClick={() => setStatusF(k)} style={{ padding: '5px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: statusF === k ? P.brass : P.white, color: statusF === k ? '#fff' : P.onVar, border: statusF === k ? 'none' : `1px solid ${P.outlineVar}` }}>{l}</button>)}</div>
        <button onClick={() => setShowNew(true)} style={btn(P.brass, '#fff')}><Sym i="add" s={18} c="#fff" /> New requisition</button>
      </div>
      {loading ? <div className="text-center py-16" style={{ color: P.onVar }}>Loading…</div> : !filtered.length ? <div className="text-center py-16" style={{ color: P.outline }}>No requisitions yet. Create one to start.</div> : (
        <div className="space-y-2.5">
          {filtered.map(b => (
            <div key={b.id} onClick={() => setOpenId(b.id)} className="cursor-pointer p-4 rounded-xl" style={{ background: P.white, border: `1px solid ${P.outlineVar}` }} onMouseEnter={e => e.currentTarget.style.borderColor = P.gold} onMouseLeave={e => e.currentTarget.style.borderColor = P.outlineVar}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span style={{ fontSize: 11, fontWeight: 700, color: P.brass }}>{b.batch_code}</span><span style={{ fontFamily: FH, fontSize: 15, fontWeight: 700, color: P.onSurface }}>{b.name || '(unnamed)'}</span><Pill s={b.status} /></div>
                  <div style={{ fontSize: 12, color: P.outline, marginTop: 3 }}>{KIND_LABEL[b.requisition_kind] || b.requisition_kind} · {locName(b.source_location_id) || 'Vendor/Production'} → {locName(b.destination_location_id) || '—'} · by {b.created_by_name || '—'}</div>
                </div>
                <div className="text-right flex-shrink-0" style={{ fontSize: 12, color: P.onVar }}>
                  {b._sum ? <><b style={{ color: P.onSurface }}>{fmt(b._sum.sku_count)}</b> SKUs · <b style={{ color: P.onSurface }}>{fmt(b._sum.piece_count)}</b> pcs<div style={{ fontSize: 11, color: P.outline }}>{lakh(b._sum.cogs_total)} COGS</div></> : <span style={{ color: P.outline }}>empty</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {showNew && <NewModal locations={locations} onClose={() => setShowNew(false)} onCreated={b => { setShowNew(false); load(); setOpenId(b.id) }} />}
    </div>
  )
}

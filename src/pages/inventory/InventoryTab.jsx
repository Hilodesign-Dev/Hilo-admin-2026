/* ═══════════════════════════════════════════════════════════════════════════
   INVENTORY (p12) — reads from Catalogue V2 (catalogue_products).
   List rows · V2-style tag-driven filters · tabbed product drawer
   (Product details + Stock changes) · update with full audit log.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { toast } from '../../lib/designTokens'
import Requisitions from './Requisitions'

const FH = 'Manrope, system-ui, sans-serif'
const P = {
  surface: '#fcf9f1', white: '#ffffff', cLow: '#f7f3eb', cMed: '#f1eee6', cHigh: '#ebe8e0',
  onSurface: '#1c1c17', onVar: '#4d4636', outline: '#7f7663', outlineVar: '#d0c5b0',
  brass: '#745b00', gold: '#c9a432', error: '#ba1a1a', green: '#15803d', amber: '#b45309',
}
const Sym = ({ i, s = 20, c, style }) => <span className="material-symbols-outlined" style={{ fontSize: s, color: c, verticalAlign: 'middle', ...style }}>{i}</span>
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'MTF', 'OS']
const GRID = [['XS', 'qty_xs'], ['S', 'qty_s'], ['M', 'qty_m'], ['L', 'qty_l'], ['XL', 'qty_xl'], ['XXL', 'qty_xxl'], ['XXXL', 'qty_xxxl'], ['MTF', 'qty_mtf'], ['OS', 'qty_os']]
const KID_ORDER = ['2-3 YEARS','3-4 YEARS','4-5 YEARS','5-6 YEARS','6-7 YEARS','7-8 YEARS','8-9 YEARS','9-10 YEARS','10-11 YEARS','11-12 YEARS']
const sizeRank = (sz) => { const u = String(sz || '').toUpperCase(); let i = SIZE_ORDER.indexOf(u); if (i >= 0) return i; i = KID_ORDER.indexOf(u); if (i >= 0) return 100 + i; const n = parseInt(u, 10); if (!isNaN(n) && /^[0-9]/.test(u)) return 200 + n; return 400 }
const orderSizes = (arr) => [...arr].sort((a, b) => sizeRank(a) - sizeRank(b))
const sizeLabel = (sz, sole) => (sole && String(sz).toUpperCase() === 'OS') ? 'Qty' : sz
const me = () => window._currentUserName || 'system'
const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN')
const inr = (n) => '₹' + fmt(Math.round(Number(n) || 0))
const initials = (n) => (n || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
const parseTags = (raw) => {
  const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw ? raw.split(',').map(t => t.trim()) : [])
  return arr.map(t => t.replace(/^[\["'\s]+|[\]"'\s]+$/g, '').trim()).filter(Boolean)
}
const MTYPE = {
  receipt: { l: 'Receipt', i: 'archive', pos: true }, sale: { l: 'Sale', i: 'shopping_bag', pos: false },
  return: { l: 'Return', i: 'undo', pos: true }, transfer_out: { l: 'Transfer out', i: 'swap_horiz', pos: false },
  transfer_in: { l: 'Transfer in', i: 'swap_horiz', pos: true }, adjustment: { l: 'Adjustment', i: 'tune' },
  writeoff: { l: 'Write-off', i: 'delete', pos: false }, opening_balance: { l: 'Opening', i: 'history', pos: true },
  cycle_count: { l: 'Cycle count', i: 'checklist' }, sale_reversal: { l: 'Sale reversal', i: 'undo', pos: true },
}
const Title = ({ t, sz = 16 }) => {
  const parts = (t || '').trim().split(/\s+/); const first = parts[0] || ''; const rest = parts.slice(1).join(' ')
  return <div style={{ lineHeight: 1.18 }}><span style={{ fontFamily: FH, fontWeight: 700, fontSize: sz, color: P.onSurface }}>{first}</span>{rest && <span style={{ fontSize: sz - 3, fontWeight: 500, color: P.onVar }}> {rest}</span>}</div>
}
const Avatar = ({ name, s = 24 }) => <span style={{ width: s, height: s, borderRadius: 999, background: P.cHigh, color: P.brass, fontSize: s * 0.4, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(name)}</span>
const Thumb = ({ url, size = 60 }) => url
  ? <img src={url} loading="lazy" decoding="async" width={size} height={size} style={{ width: size, height: size, objectFit: 'cover', borderRadius: 12, flexShrink: 0, border: `1px solid ${P.outlineVar}`, background: P.cMed }} />
  : <div style={{ width: size, height: size, borderRadius: 12, background: P.cMed, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sym i="checkroom" s={size * 0.45} c={P.outline} /></div>
const Tag = ({ children }) => <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '2px 8px', borderRadius: 999, background: P.cMed, color: P.onVar, whiteSpace: 'nowrap' }}>{children}</span>

/* ── Product drawer: tabs = Product details / Stock changes ─────────────────── */
function ProductDrawer({ product, locationId, locName, onClose, onSaved }) {
  const [tab, setTab] = useState('details')
  const [rows, setRows] = useState([]); const [moves, setMoves] = useState([])
  const [loading, setLoading] = useState(true); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    const { data: sk } = await supa.from('inventory_skus').select('id, sku_code, size, mrp, unit_cost').eq('product_id', product.product_id).eq('is_active', true)
    const ids = (sk || []).map(s => s.id)
    const { data: stock } = ids.length ? await supa.from('inventory_stock').select('sku_id, quantity_on_hand, quantity_reserved').in('sku_id', ids).eq('location_id', locationId) : { data: [] }
    const smap = Object.fromEntries((stock || []).map(s => [s.sku_id, s]))
    const sorted = (sk || []).slice().sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size))
    setRows(sorted.map(s => ({ ...s, onhand: smap[s.id]?.quantity_on_hand || 0, reserved: smap[s.id]?.quantity_reserved || 0, newQty: String(smap[s.id]?.quantity_on_hand || 0) })))
    if (ids.length) { const { data: mv } = await supa.from('inventory_movements').select('*, inventory_skus(size)').in('sku_id', ids).eq('location_id', locationId).order('movement_at', { ascending: false }).limit(60); setMoves(mv || []) }
    else setMoves([])
    setLoading(false)
  }, [product.product_id, locationId])
  useEffect(() => { load() }, [load])
  const setQty = (i, v) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, newQty: v.replace(/[^0-9]/g, '') } : r))
  const save = async () => {
    const ch = rows.filter(r => r.newQty !== '' && Number(r.newQty) !== r.onhand)
    if (!ch.length) return toast(false, 'No changes')
    setBusy(true)
    try {
      const mvs = ch.map(r => ({ sku_id: r.id, location_id: locationId, qty_delta: Number(r.newQty) - r.onhand, movement_type: 'adjustment', reference_type: 'manual_adjust', reason: reason || 'Manual stock adjustment', notes: `${r.size}: ${r.onhand}→${r.newQty}`, created_by_name: me() }))
      const { error } = await supa.from('inventory_movements').insert(mvs)
      if (error) throw error

      for (const r of ch) {
        await supa.from('inventory_stock').upsert({
          sku_id: r.id,
          location_id: locationId,
          quantity_on_hand: Number(r.newQty)
        }, { onConflict: 'sku_id,location_id' })
      }

      toast(true, `Updated ${ch.length} size(s)`); setReason(''); await load(); onSaved()
    } catch (e) { toast(false, 'Failed: ' + (e.message || e)) } finally { setBusy(false) }
  }
  const total = rows.reduce((s, r) => s + r.onhand, 0)
  const cogs = rows.find(r => Number(r.unit_cost) > 0)?.unit_cost

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(28,28,23,0.30)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="h-full w-full max-w-md overflow-y-auto" style={{ background: P.surface, borderLeft: '1px solid #d1cdc2' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 sticky top-0 z-10" style={{ background: P.surface, borderBottom: `1px solid ${P.outlineVar}` }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: P.onVar }}>{product.style_code || 'Product'}</span>
          <button onClick={onClose} style={{ color: P.outline }}><Sym i="close" s={22} /></button>
        </div>
        {product.image_url
          ? <div style={{ height: 210, backgroundImage: `url('${product.image_url}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
          : <div style={{ height: 150, background: P.cMed, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sym i="checkroom" s={56} c={P.outline} /></div>}
        <div className="px-5 pt-4">
          <div className="flex items-start justify-between gap-3 mb-1">
            <Title t={product.product_title} sz={20} />
            <span style={{ fontFamily: FH, fontWeight: 700, fontSize: 17, color: P.onSurface, whiteSpace: 'nowrap' }}>{inr(product.mrp)}</span>
          </div>
          <div style={{ fontSize: 12, color: P.brass, fontWeight: 600, marginBottom: 12 }}>{product.style_code || ''}{product.is_set ? ' · Set' : ''}</div>
        </div>

        {/* tabs */}
        <div className="flex gap-5 px-5" style={{ borderBottom: `1px solid ${P.outlineVar}` }}>
          {[['details', 'Product details'], ['stock', 'Stock changes']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ padding: '10px 2px', fontSize: 13, fontWeight: tab === id ? 700 : 500, color: tab === id ? P.brass : P.onVar, borderBottom: tab === id ? `2px solid ${P.brass}` : '2px solid transparent' }}>{label}</button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'details' && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[['Fabric', product.fabric_tag], ['Category', product.garment_category], ['Colour', product.colour_primary], ['COGS', cogs ? inr(cogs) : '—'], ['In stock', `${total} pcs`], ['Status', product.catalogue_status]].map(([k, v]) => (
                  <div key={k}><div style={{ fontSize: 11, color: P.outline }}>{k}</div><div style={{ fontSize: 14, color: P.onSurface, fontWeight: 500 }}>{v || '—'}</div></div>
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: P.outline, marginBottom: 8 }}>Quantity by size · {locName}</div>
              {loading ? <div className="py-6 text-center" style={{ color: P.onVar }}>Loading…</div> : (
                <>
                  <div className="rounded-xl overflow-hidden mb-3" style={{ border: `1px solid ${P.outlineVar}`, background: P.white }}>
                    {rows.map((r, i) => (
                      <div key={r.id} className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: i ? `1px solid ${P.outlineVar}` : 'none' }}>
                        <span style={{ width: 56, fontSize: 13, fontWeight: 700, color: P.onSurface }}>{r.size}</span>
                        <span className="flex-1" style={{ fontSize: 12, color: P.onVar }}>on hand {r.onhand}{r.reserved ? ` · ${r.reserved} resv` : ''}</span>
                        <input value={r.newQty} onChange={e => setQty(i, e.target.value)} inputMode="decimal" className="w-16 text-right" style={{ fontSize: 14, padding: '6px 8px', borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: P.white, outline: 'none' }} />
                      </div>
                    ))}
                    {!rows.length && <div className="px-3 py-4 text-center" style={{ fontSize: 13, color: P.outline }}>No sizes.</div>}
                  </div>
                  <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (damage, found stock, recount…)" className="w-full mb-3" style={{ fontSize: 13, padding: '9px 12px', borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: P.white, outline: 'none' }} />
                  <button onClick={save} disabled={busy} className="w-full" style={{ padding: '11px', fontSize: 14, fontWeight: 600, borderRadius: 8, background: P.brass, color: '#fff' }}>{busy ? 'Saving…' : 'Update stock'}</button>
                </>
              )}
            </>
          )}

          {tab === 'stock' && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: P.outline, marginBottom: 10 }}>All additions &amp; sales · {locName}</div>
              {loading ? <div className="py-6 text-center" style={{ color: P.onVar }}>Loading…</div> : moves.length === 0 ? <div style={{ fontSize: 13, color: P.outline }}>No stock changes yet.</div> : (
                <div className="space-y-3">
                  {moves.map(mv => { const t = MTYPE[mv.movement_type] || { l: mv.movement_type, i: 'circle' }; const up = mv.qty_delta > 0; return (
                    <div key={mv.id} className="flex items-center gap-3">
                      <div style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${P.outlineVar}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sym i={t.i} s={18} c={P.brass} /></div>
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: P.brass }}>{t.l}{mv.inventory_skus?.size ? ` · ${mv.inventory_skus.size}` : ''}</div>
                        <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: P.onVar }}><Avatar name={mv.created_by_name} s={16} />{mv.created_by_name || 'system'} · {new Date(mv.movement_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                        {mv.reason && <div style={{ fontSize: 11, color: P.outline }}>{mv.reason}</div>}
                      </div>
                      <span style={{ fontFamily: FH, fontWeight: 700, fontSize: 15, color: up ? P.green : P.error }}>{up ? '+' : ''}{mv.qty_delta}</span>
                    </div>
                  )})}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export const InventoryTab = () => {
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('hilo_inv_subtab') || 'stock' } catch { return 'stock' } })
  const setSub = (v) => { setTab(v); try { sessionStorage.setItem('hilo_inv_subtab', v) } catch {} }
  const [locations, setLocations] = useState([]); const [locId, setLocId] = useState(null)
  const [summary, setSummary] = useState([]); const [matrix, setMatrix] = useState([]); const [movements, setMovements] = useState([])
  const [cats, setCats] = useState([])
  const [search, setSearch] = useState(''); const [catFilter, setCatFilter] = useState('All'); const [statusFilter, setStatusFilter] = useState('All')
  const [setFilter, setSetFilter] = useState('All'); const [sortBy, setSortBy] = useState('default'); const [tagFilter, setTagFilter] = useState('All'); const [stockFilter, setStockFilter] = useState('All')
  const [loading, setLoading] = useState(true); const [product, setProduct] = useState(null)
  const PAGE_SIZE = 50
  const [page, setPage] = useState(0)
  const [editId, setEditId] = useState(null)       // product_id being inline-edited
  const [editMap, setEditMap] = useState({})        // size -> { sku_id, onhand }
  const [editVals, setEditVals] = useState({})      // size -> string
  const [savingEdit, setSavingEdit] = useState(false)
  const [invMode, setInvMode] = useState('active')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    supa.from('inventory_locations').select('*').eq('is_active', true).order('sort_order').then(({ data }) => { setLocations(data || []); if (data?.length) setLocId(p => p || data[0].id) })
    supa.from('v_inventory_location_summary').select('*').then(({ data }) => setSummary(data || []))
    supa.from('product_categories').select('name, group_name, shopify_tag').then(({ data }) => setCats(data || []))
  }, [])
  const loadMatrix = useCallback(async () => {
    if (!locId) return; setLoading(true)
    // Supabase caps a query at 1000 rows — fetch all pages so no products are missing.
    const PAGE = 1000; let all = [], from = 0
    while (true) {
      const { data, error } = await supa.from('v_inventory_variant_matrix').select('*').eq('location_id', locId).order('product_title').range(from, from + PAGE - 1)
      if (error || !data || !data.length) break
      all = all.concat(data)
      if (data.length < PAGE) break
      from += PAGE
    }
    setMatrix(all); setLoading(false)
  }, [locId])
  useEffect(() => { loadMatrix() }, [loadMatrix])
  const loadMoves = useCallback(async () => {
    let q = supa.from('inventory_movements').select('*, inventory_skus(variant_label, size, sku_code), inventory_locations(code)').order('movement_at', { ascending: false }).limit(150)
    if (locId) q = q.eq('location_id', locId)
    const { data } = await q; setMovements(data || [])
  }, [locId])
  useEffect(() => { if (tab === 'movements') loadMoves() }, [tab, loadMoves])

  const loc = locations.find(l => l.id === locId)
  const refresh = () => { loadMatrix(); supa.from('v_inventory_location_summary').select('*').then(({ data }) => setSummary(data || [])) }
  const doSync = async () => {
    setSyncing(true)
    try {
      const { data, error } = await supa.rpc('sync_inventory_skus')
      if (error) throw error
      const r = data || {}
      toast(true, 'Synced — ' + (r.inserted || 0) + ' new, ' + (r.deactivated || 0) + ' deactivated')
      await loadMatrix()
    } catch (e) { toast(false, 'Sync failed: ' + (e.message || e)) } finally { setSyncing(false) }
  }

  const startEdit = async (m) => {
    setEditId(m.product_id); setEditMap({}); setEditVals({})
    const { data: sk } = await supa.from('inventory_skus').select('id, size').eq('product_id', m.product_id)
    const ids = (sk || []).map(s => s.id)
    const { data: stock } = ids.length ? await supa.from('inventory_stock').select('sku_id, quantity_on_hand').in('sku_id', ids).eq('location_id', locId) : { data: [] }
    const smap = Object.fromEntries((stock || []).map(s => [s.sku_id, s.quantity_on_hand]))
    const em = {}, ev = {}
    ;(sk || []).forEach(s => { em[s.size] = { sku_id: s.id, onhand: smap[s.id] || 0 }; ev[s.size] = String(smap[s.id] || 0) })
    setEditMap(em); setEditVals(ev)
  }
  const cancelEdit = () => { setEditId(null); setEditMap({}); setEditVals({}) }
  const saveEdit = async () => {
    const changes = Object.entries(editVals).filter(([sz, v]) => v !== '' && Number(v) !== (editMap[sz]?.onhand || 0))
    if (!changes.length) { cancelEdit(); return }
    setSavingEdit(true)
    try {
      const mvs = []
      for (const [sz, v] of changes) {
        const onhand = editMap[sz]?.onhand || 0
        let skuId = editMap[sz]?.sku_id
        if (!skuId) { const { data, error } = await supa.rpc('get_or_create_sku', { p_product_id: editId, p_size: sz }); if (error) throw error; skuId = data }
        mvs.push({ sku_id: skuId, location_id: locId, qty_delta: Number(v) - onhand, movement_type: 'adjustment', reference_type: 'manual_adjust', reason: 'Inline stock update', notes: `${sz}: ${onhand}→${v}`, created_by_name: me() })
        
        await supa.from('inventory_stock').upsert({
          sku_id: skuId,
          location_id: locId,
          quantity_on_hand: Number(v)
        }, { onConflict: 'sku_id,location_id' })
      }
      const { error } = await supa.from('inventory_movements').insert(mvs)
      if (error) throw error
      toast(true, `Updated ${changes.length} size(s)`)
      cancelEdit(); await loadMatrix()
    } catch (e) { toast(false, 'Failed: ' + (e.message || e)) } finally { setSavingEdit(false) }
  }

  // ── category → tags lookup + matcher (mirrors Catalogue V2) ──
  // Include category name as fallback so product_type masters without shopify_tag still count.
  const catTagMap = useMemo(() => {
    const m = {}
    cats.forEach(c => {
      if (!c.name) return
      const fromShopify = c.shopify_tag
        ? c.shopify_tag.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
        : []
      m[c.name] = [...new Set([...fromShopify, String(c.name).toLowerCase()])]
    })
    return m
  }, [cats])
  const matchesCat = useCallback((row, cat) => {
    if (cat === 'All') return true
    const tags = parseTags(row.tags_csv).map(t => t.toLowerCase())
    const productCat = String(row.garment_category || row.category || '').trim().toLowerCase()
    const matchesNamed = (catName) => {
      const keys = catTagMap[catName] || [String(catName).toLowerCase()]
      if (productCat && keys.includes(productCat)) return true
      return keys.some(k => tags.includes(k))
    }
    if (cat === 'Other') {
      return !cats.map(c => c.name).filter(Boolean).some(name => matchesNamed(name))
    }
    return matchesNamed(cat)
  }, [catTagMap, cats])
  const availableCats = useMemo(() => {
    const order = ['Occasion Wear', 'Urban Wear', 'Kids', 'Accessories', '']; const out = []
    order.forEach(g => cats.filter(c => (c.group_name || '') === g).forEach(c => { if (c.name) out.push(c.name) }))
    out.push('Other'); return ['All', ...out]
  }, [cats])
  const allTags = useMemo(() => { const s = new Set(); matrix.forEach(r => parseTags(r.tags_csv).forEach(t => s.add(t))); return ['All', ...Array.from(s).sort()] }, [matrix])

  const filtered = useMemo(() => {
    let list = matrix.filter(m => {
      if (!matchesCat(m, catFilter)) return false
      if (statusFilter !== 'All' && m.catalogue_status !== statusFilter) return false
      if (setFilter === 'Sets' && !m.is_set) return false
      if (setFilter === 'Singles' && m.is_set) return false
      if (tagFilter !== 'All' && !parseTags(m.tags_csv).includes(tagFilter)) return false
      if (stockFilter === 'instock' && !(m.total_qty > 0)) return false
      if (stockFilter === 'out' && m.total_qty > 0) return false
      if (stockFilter === 'incoming' && !(m.total_incoming > 0)) return false
      if (invMode === 'inactive') { if (m.catalogue_status !== 'Inactive' || !(m.total_qty > 0)) return false }
      else if (m.catalogue_status === 'Inactive') return false
      if (search) { const q = search.toLowerCase(); if (![m.product_title, m.style_code, m.colour_primary, m.fabric_tag].filter(Boolean).join(' ').toLowerCase().includes(q)) return false }
      return true
    })
    if (sortBy !== 'default') list = [...list].sort((a, b) =>
      sortBy === 'mrp_desc' ? b.mrp - a.mrp : sortBy === 'mrp_asc' ? a.mrp - b.mrp :
      sortBy === 'qty_desc' ? b.total_qty - a.total_qty : sortBy === 'qty_asc' ? a.total_qty - b.total_qty : 0)
    return list
  }, [matrix, catFilter, statusFilter, setFilter, tagFilter, stockFilter, invMode, search, sortBy, matchesCat])

  useEffect(() => { setPage(0) }, [catFilter, statusFilter, setFilter, tagFilter, stockFilter, invMode, search, sortBy, locId])
  const activeFilters = [catFilter !== 'All', statusFilter !== 'All', setFilter !== 'All', sortBy !== 'default', tagFilter !== 'All', stockFilter !== 'All', search !== ''].filter(Boolean).length
  const clearAll = () => { setCatFilter('All'); setStatusFilter('All'); setSetFilter('All'); setSortBy('default'); setTagFilter('All'); setStockFilter('All'); setSearch('') }
  const sel = { fontSize: 13, padding: '7px 10px', borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: P.white, color: P.onSurface, outline: 'none' }

  const statusBadge = (t) => t <= 0
    ? <span style={{ fontSize: 11, fontWeight: 700, color: P.error }}>Out of stock</span>
    : t < 4 ? <span style={{ fontSize: 11, fontWeight: 700, color: P.amber }}>● Low</span>
    : <span style={{ fontSize: 11, fontWeight: 700, color: P.green }}>● In stock</span>

  return (
    <div className="h-full flex flex-col" style={{ background: P.surface, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 flex-shrink-0" style={{ minHeight: 58, paddingTop: 10, paddingBottom: 10, background: P.surface, borderBottom: `1px solid ${P.outlineVar}` }}>
        <h1 style={{ fontFamily: FH, fontSize: 22, fontWeight: 700, color: P.onSurface }}>Inventory</h1>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full flex-shrink-0" style={{ background: P.white, border: `1px solid ${P.outlineVar}` }}>
          <Sym i="location_on" s={16} c={P.brass} />
          <select value={locId || ''} onChange={e => setLocId(e.target.value)} style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: P.onSurface, background: 'transparent', border: 'none', outline: 'none' }}>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button onClick={doSync} disabled={syncing} title="Sync from catalogue (add new, deactivate removed)" style={{ marginLeft: 2, display: 'flex', alignItems: 'center', color: P.brass }}>
            <Sym i="refresh" s={18} c={P.brass} style={{ animation: syncing ? 'invspin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </header>
      <style>{`@keyframes invspin{to{transform:rotate(360deg)}}`}</style>

      <div className="flex gap-6 px-4 sm:px-6 flex-shrink-0" style={{ borderBottom: `1px solid ${P.outlineVar}`, background: P.surface }}>
        {[['stock', 'Stock'], ['requisitions', 'Requisitions'], ['locations', 'Locations'], ['movements', 'Movements']].map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} style={{ padding: '12px 2px', fontSize: 14, fontWeight: tab === id ? 700 : 500, color: tab === id ? P.brass : P.onVar, borderBottom: tab === id ? `2px solid ${P.brass}` : '2px solid transparent' }}>{label}</button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === 'stock' && (
          <>
            <div className="relative mb-3" style={{ maxWidth: 560 }}>
              <Sym i="search" s={20} c={P.outline} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, SKU, colour or fabric…" style={{ width: '100%', padding: '10px 12px 10px 38px', fontSize: 14, background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 999, outline: 'none' }} />
            </div>

            {/* active / inactive segment */}
            <div className="inline-flex gap-1 mb-3 p-1 rounded-full" style={{ background: P.cMed }}>
              {[['active', 'Active'], ['inactive', 'Inactive (with stock)']].map(([k, l]) => (
                <button key={k} onClick={() => setInvMode(k)} style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: invMode === k ? P.white : 'transparent', color: invMode === k ? P.brass : P.onVar, boxShadow: invMode === k ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>{l}</button>
              ))}
            </div>

            {/* category chips */}
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
              {availableCats.map(c => { const n = c === 'All' ? matrix.length : matrix.filter(m => matchesCat(m, c)).length; if (c !== 'All' && c !== 'Other' && n === 0) return null
                return <button key={c} onClick={() => setCatFilter(c)} style={{ padding: '5px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', background: catFilter === c ? P.brass : P.white, color: catFilter === c ? '#fff' : P.onVar, border: catFilter === c ? 'none' : `1px solid ${P.outlineVar}` }}>{c} <span style={{ opacity: 0.6, marginLeft: 2 }}>{n}</span></button> })}
            </div>

            {/* dropdown filters */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <select value={stockFilter} onChange={e => setStockFilter(e.target.value)} style={sel}><option value="All">All stock</option><option value="instock">In stock only</option><option value="out">Out of stock</option><option value="incoming">Has incoming</option></select>
              <select value={setFilter} onChange={e => setSetFilter(e.target.value)} style={sel}><option value="All">Sets + Singles</option><option value="Sets">Sets only</option><option value="Singles">Singles only</option></select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={sel}><option value="default">Sort: Default</option><option value="qty_desc">Qty: High → Low</option><option value="qty_asc">Qty: Low → High</option><option value="mrp_desc">MRP: High → Low</option><option value="mrp_asc">MRP: Low → High</option></select>
              <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} style={sel}>{allTags.map(t => <option key={t} value={t}>{t === 'All' ? 'All tags' : t}</option>)}</select>
              {activeFilters > 0 && <button onClick={clearAll} style={{ fontSize: 13, fontWeight: 600, color: P.error, padding: '7px 10px' }}>✕ Clear filters ({activeFilters})</button>}
              <span className="ml-auto" style={{ fontSize: 12, color: P.outline }}>{filtered.length} products</span>
            </div>

            {loading ? <div className="text-center py-16" style={{ color: P.onVar }}>Loading stock…</div> : !filtered.length ? <div className="text-center py-16" style={{ color: P.outline }}>No products match.</div> : (
              <div className="space-y-2.5">
                {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(m => (
                  <div key={m.product_id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4" style={{ background: P.white, border: `1px solid ${editId === m.product_id ? P.gold : P.outlineVar}`, borderRadius: 14, padding: 14 }}>
                    {/* identity — click opens detail drawer */}
                    <div className="flex gap-3 items-center cursor-pointer" style={{ flex: '1 1 280px', minWidth: 0 }} onClick={() => setProduct(m)}>
                      <Thumb url={m.image_url} size={56} />
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <Title t={m.product_title} sz={15} />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                          <span style={{ fontSize: 11, fontWeight: 700, color: P.brass }}>{m.style_code}</span>
                          {m.variant_name && m.variant_name !== m.style_code && <span style={{ fontSize: 11, fontWeight: 700, color: '#3a2d00', background: '#f3ecd2', padding: '1px 8px', borderRadius: 999 }}>{m.variant_name}{m.is_set ? ' · SET' : ''}</span>}
                          {m.garment_category && <Tag>{m.garment_category}</Tag>}
                          {m.fabric_tag && <Tag>{m.fabric_tag}</Tag>}
                          {m.colour_primary && <span className="inline-flex items-center gap-1" style={{ fontSize: 11, color: P.onVar }}><span style={{ width: 9, height: 9, borderRadius: 999, background: P.onSurface, display: 'inline-block' }} />{m.colour_primary}</span>}
                        </div>
                      </div>
                    </div>
                    {/* size grid — each product shows its OWN sizes (kids ages, jewellery = single Qty) */}
                    {(() => {
                      const editing = editId === m.product_id
                      const szq = m.size_qty || {}
                      const sizes = editing ? orderSizes(Object.keys(editMap)) : orderSizes(Object.keys(szq))
                      const sole = sizes.length === 1
                      if (!sizes.length) return <div className="flex-shrink-0" style={{ fontSize: 12, color: P.outline, minWidth: 80 }}>No sizes</div>
                      return (
                        <div className="flex gap-1.5 flex-shrink-0 overflow-x-auto">
                          {sizes.map(sz => {
                            const has = editMap[sz]
                            const q = editing ? (has ? has.onhand : 0) : (szq[sz] || 0); const on = q > 0
                            return (
                              <div key={sz} style={{ textAlign: 'center', minWidth: sole ? 70 : 46 }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: on || editing ? P.brass : P.outline, whiteSpace: 'nowrap' }}>{sizeLabel(sz, sole)}</div>
                                {editing ? (
                                  <input autoFocus={sz === sizes[0]} value={editVals[sz] ?? ''} inputMode="decimal"
                                    onChange={e => setEditVals(v => ({ ...v, [sz]: e.target.value.replace(/[^0-9]/g, '') }))}
                                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                                    placeholder="—"
                                    style={{ marginTop: 2, width: sole ? 70 : 46, textAlign: 'center', padding: '5px 0', borderRadius: 8, border: `1px solid ${editVals[sz] ? P.gold : P.outlineVar}`, background: editVals[sz] ? '#fbf6e6' : '#fff', fontSize: 14, fontWeight: 700, color: P.onSurface, outline: 'none' }} />
                                ) : (
                                  <div onClick={e => { e.stopPropagation(); startEdit(m) }} title="Click to edit"
                                    style={{ marginTop: 2, padding: '5px 0', borderRadius: 8, cursor: 'pointer', border: `1px solid ${on ? P.gold : P.outlineVar}`, background: on ? '#fbf6e6' : P.cLow, fontSize: 14, fontWeight: 700, color: on ? P.onSurface : P.outline }}>{on ? String(q).padStart(2, '0') : '—'}</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                    {/* status + actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0" style={{ minWidth: 180 }}>
                      <div className="flex flex-col items-start sm:items-end gap-1">
                        {statusBadge(m.total_qty)}
                        <div className="flex gap-1.5">
                          {m.total_incoming > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: P.green }}>+{m.total_incoming} inc</span>}
                          <span style={{ fontSize: 10, fontWeight: 600, color: P.outline }}>{m.total_reserved || 0} resv</span>
                        </div>
                      </div>
                      {editId === m.product_id ? (
                        <div className="flex gap-1.5">
                          <button onClick={saveEdit} disabled={savingEdit} title="Save" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 8, background: P.brass, color: '#fff' }}><Sym i="check" s={20} c="#fff" /></button>
                          <button onClick={cancelEdit} title="Cancel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 8, background: P.white, color: P.outline, border: `1px solid ${P.outlineVar}` }}><Sym i="close" s={20} c={P.outline} /></button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(m)} title="Edit stock" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, padding: '8px 14px', borderRadius: 8, background: P.gold, color: '#3a2d00' }}><Sym i="edit" s={17} c="#3a2d00" /> Edit</button>
                      )}
                    </div>
                  </div>
                ))}
                {filtered.length > PAGE_SIZE && (() => { const tp = Math.ceil(filtered.length / PAGE_SIZE); return (
                  <div className="flex items-center justify-between pt-3" style={{ fontSize: 13, color: P.onVar }}>
                    <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 999, background: P.white, color: P.brass, border: `1px solid ${P.outlineVar}`, opacity: page === 0 ? 0.4 : 1 }}>‹ Prev</button>
                      <span>Page {page + 1} of {tp}</span>
                      <button onClick={() => setPage(p => Math.min(tp - 1, p + 1))} disabled={page >= tp - 1} style={{ fontSize: 13, fontWeight: 700, padding: '7px 14px', borderRadius: 999, background: P.white, color: P.brass, border: `1px solid ${P.outlineVar}`, opacity: page >= tp - 1 ? 0.4 : 1 }}>Next ›</button>
                    </div>
                  </div>
                ) })()}
              </div>
            )}
          </>
        )}

        {tab === 'requisitions' && <Requisitions />}

        {tab === 'locations' && (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {summary.map(s => (
              <div key={s.id} style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 16, padding: 18 }}>
                <div className="flex items-center justify-between mb-3"><span style={{ fontFamily: FH, fontWeight: 700, fontSize: 16, color: P.onSurface }}>{s.name}</span><Tag>{s.kind}</Tag></div>
                <div className="grid grid-cols-2 gap-3">
                  {[['Pieces', fmt(s.total_pieces)], ['SKUs in stock', fmt(s.skus_in_stock)], ['Value @ cost', inr(s.stock_value_at_cost)], ['Value @ MRP', inr(s.stock_value_at_mrp)]].map(([k, v]) => (
                    <div key={k}><div style={{ fontSize: 11, color: P.outline }}>{k}</div><div style={{ fontSize: 16, fontWeight: 700, color: P.onSurface }}>{v}</div></div>
                  ))}
                </div>
                {s.total_incoming > 0 && <div style={{ fontSize: 12, color: P.green, marginTop: 10 }}>{fmt(s.total_incoming)} incoming</div>}
              </div>
            ))}
          </div>
        )}

        {tab === 'movements' && (
          <div className="space-y-1" style={{ maxWidth: 640 }}>
            {movements.length === 0 ? <div className="text-center py-16" style={{ color: P.outline }}>No movements yet.</div> : movements.map(mv => { const t = MTYPE[mv.movement_type] || { l: mv.movement_type, i: 'circle' }; const up = mv.qty_delta > 0; return (
              <div key={mv.id} className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${P.cHigh}` }}>
                <div style={{ width: 40, height: 40, borderRadius: 999, border: `1px solid ${P.outlineVar}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sym i={t.i} s={20} c={P.brass} /></div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: P.brass }}>{t.l}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: P.onSurface }}>{mv.inventory_skus?.variant_label || '—'}</div>
                  <div style={{ fontSize: 11, color: P.outline }}>SKU {mv.inventory_skus?.sku_code || ''}{mv.inventory_skus?.size ? ` · ${mv.inventory_skus.size}` : ''}</div>
                  <div className="flex items-center gap-1.5 mt-0.5" style={{ fontSize: 11, color: P.onVar }}><Avatar name={mv.created_by_name} s={18} />{mv.created_by_name || 'system'} · {new Date(mv.movement_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <span style={{ fontFamily: FH, fontWeight: 700, fontSize: 20, color: up ? P.green : P.error, flexShrink: 0 }}>{up ? '+' : ''}{mv.qty_delta}</span>
              </div>
            )})}
          </div>
        )}
      </div>

      {product && <ProductDrawer product={product} locationId={locId} locName={loc?.name || ''} onClose={() => setProduct(null)} onSaved={refresh} />}
    </div>
  )
}

export default InventoryTab

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { fetchAllCatalogueProductsV2, productPriceRange, defaultVariant, totalSizeCount } from '../../lib/catalogueV2'
import CatalogueQuickEntryV2 from './CatalogueQuickEntryV2'
import { fmt, n, calcCogs, effectiveSP, gmPct } from '../../lib/helpers'
import { CATEGORIES } from '../../lib/constants'
import Icon from '../../components/Icon'
import ProductViewV2 from './ProductViewV2'
import ProductLabelModal from './ProductLabelModal'

/* CatalogueV2 — list page.
   Horizontal cards (mirrors V1's card layout) + V1's exact filter bar:
   search · COGS review tabs · category tabs (tag-driven via masters) ·
   Status / Sets+Singles / Sort / Tags / Clear.

   V2 model adaptations:
   - COGS review status is per-VARIANT; rolled up per product for the tabs
     (priority Pending > In Review > Finalized, mirroring V1 buckets).
   - "Set" is true when any variant of the product is a set.
   - Sort/stat figures use the product's default variant. */

const REVIEW_REASONS = {
  newly_synced: 'Newly synced from Shopify',
  regrouped_v1: 'Re-grouped variants (v1)',
  cogs_pending: 'COGS pending entry',
}

// ── shared helpers (mirrors V1 Catalogue.jsx) ────────────────────────────────
function MultiSelectFilter({ label, options, selected, onChange, width = 200 }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  const opts = options.filter(o => o.value.toLowerCase().includes(q.toLowerCase()))
  const toggle = v => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  const on = selected.length > 0
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="text-sm px-3 py-1.5 rounded-lg border inline-flex items-center gap-1.5" style={{ borderColor: on ? '#c9a432' : '#e5e7eb', background: on ? '#fef9e7' : '#fff', color: on ? '#795900' : '#374151', fontWeight: on ? 600 : 400 }}>
        {label}{on ? ` · ${selected.length}` : ''} <span style={{ fontSize: 10, opacity: 0.55 }}>▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 rounded-xl shadow-lg" style={{ background: '#fff', border: '1px solid #ebe7df', width, maxHeight: 340, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="p-2" style={{ borderBottom: '1px solid #f3f1ea' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} className="w-full text-sm px-2 py-1.5 rounded-lg" style={{ border: '1px solid #e5e7eb', outline: 'none' }} />
          </div>
          {on && <button onClick={() => onChange([])} className="text-xs text-left px-3 py-1.5" style={{ color: '#dc2626', borderBottom: '1px solid #f3f1ea' }}>Clear {selected.length} selected</button>}
          <div style={{ overflowY: 'auto' }}>
            {opts.length === 0 && <div className="px-3 py-3 text-xs" style={{ color: '#9ca3af' }}>No matches</div>}
            {opts.map(o => (
              <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} style={{ accentColor: '#c9a432' }} />
                <span className="flex-1 truncate" title={o.value}>{o.value}</span>
                {o.count != null && <span className="text-[11px]" style={{ color: '#9ca3af' }}>{o.count}</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const parseTags = (raw) => {
  const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw ? raw.split(',').map(t => t.trim()) : [])
  return arr.map(t => t.replace(/^[\["'\s]+|[\]"'\s]+$/g, '').trim()).filter(Boolean)
}

// Per-product rollup of variant COGS review status → V1's bucket vocabulary.
const rowReviewStatus = (row) => {
  const vs = (row?.variants || []).map(v => v?.cogs_review_status || 'pending_entry')
  if (vs.length === 0) return 'pending'
  if (vs.some(s => s === 'pending_entry' || s === 'rejected')) return 'pending'
  if (vs.some(s => s === 'in_review')) return 'in_review'
  if (vs.every(s => s === 'finalized')) return 'finalized'
  return 'pending'
}

const rowIsSet = (row) => (row?.variants || []).some(v => v?.is_set)

const rowStats = (row) => {
  const dv = defaultVariant(row) || {}
  const first = (dv.sizes || [])[0] || {}
  const cogs = n(dv.cogs)
  const mrp = n(first.mrp)
  const sp = n(first.selling_price) || mrp
  return { cogs, mrp, sp, gm: gmPct(sp, cogs, mrp) }
}

const CardChip = ({ label, tone = 'gray', mono = false }) => {
  const tones = {
    gray:  { bg: '#f5f4f0', fg: '#6b7280' },
    gold:  { bg: '#fef3c7', fg: '#92400e' },
    green: { bg: '#dcfce7', fg: '#15803d' },
    red:   { bg: '#fee2e2', fg: '#991b1b' },
    amber: { bg: '#fef3c7', fg: '#92400e' },
    blue:  { bg: '#dbeafe', fg: '#1e40af' },
    purple:{ bg: '#f3e8ff', fg: '#7c3aed' },
  }
  const t = tones[tone] || tones.gray
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center ${mono ? 'font-mono' : ''}`}
      style={{ background: t.bg, color: t.fg }}>{label}</span>
  )
}

const Stat = ({ label, value, color }) => (
  <div>
    <div style={{ fontSize: 8, letterSpacing: '0.08em', color: '#9c9b97', textTransform: 'uppercase', fontFamily: 'Inter,sans-serif' }}>{label}</div>
    <div style={{ fontSize: 13, fontWeight: 700, color: color || '#1b1c1a', fontFamily: 'Inter,sans-serif', marginTop: 2 }}>{value}</div>
  </div>
)

const STATUS_PILL = {
  pending:   { bg: '#f3f4f6', fg: '#6b7280', label: 'PENDING' },
  in_review: { bg: '#fef3c7', fg: '#92400e', label: 'IN REVIEW' },
  finalized: { bg: '#dcfce7', fg: '#15803d', label: 'FINALIZED' },
}

const ProductCardV2 = ({ row, onOpen, onLabel }) => {
  const variants = Array.isArray(row?.variants) ? row.variants : []
  const dv = defaultVariant(row) || {}
  const first = (dv.sizes || [])[0] || {}
  const cogs = n(dv.cogs) || 0
  const mrp = n(first.mrp) || 0
  const sp = n(first.selling_price) || mrp
  const effSP = effectiveSP(sp, mrp)
  const gm = gmPct(sp, cogs, mrp)
  const priceRange = productPriceRange(row)
  const totalSizes = totalSizeCount(row)
  const needsReview = row?.import_status && row.import_status !== 'verified'
  const pill = STATUS_PILL[rowReviewStatus(row)] || STATUS_PILL.pending

  return (
    <div className="bg-white rounded-2xl overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5"
      style={{ boxShadow: '0 4px 16px rgba(27,28,26,0.06)', border: '1px solid rgba(208,197,176,0.3)' }}
      onClick={() => onOpen(row)}>
      {/* Top: image + identity */}
      <div className="flex gap-3 p-4 pb-3">
        <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
          style={{ background: '#f5f3f0', border: '1px solid rgba(208,197,176,0.4)' }}>
          {row.image_url
            ? <img src={row.image_url} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none' }} />
            : <span className="text-3xl text-gray-300">📷</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.04em', color: '#795900', fontWeight: 600 }}>{dv?.style_code || '—'}</span>
            <div className="flex items-center gap-1.5">
              <button title="Print QR label" onClick={(e) => { e.stopPropagation(); onLabel && onLabel(row) }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(201,164,50,0.14)', color: '#795900', border: '1px solid rgba(201,164,50,0.4)', cursor: 'pointer' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20 14v.01M14 20v.01M17 17v.01M20 17v.01M17 20v.01M20 20v.01"/></svg>
                <span className="text-[9px] font-bold uppercase tracking-tight">Label</span>
              </button>
              {needsReview
                ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight" style={{ background: '#fee2e2', color: '#991b1b' }}>Needs review</span>
                : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight" style={{ background: pill.bg, color: pill.fg }}>{pill.label}</span>}
            </div>
          </div>
          <div className="mt-1 line-clamp-2" style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, fontSize: 15, color: '#1b1c1a', lineHeight: 1.2 }}>{row.product_title || '(untitled)'}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
            {row.category && <CardChip label={row.category} tone="gold" />}
            {rowIsSet(row) && <CardChip label="Set" tone="blue" />}
            <CardChip label={`${variants.length} var · ${totalSizes} sz`} tone="gray" />
          </div>
          {priceRange.min > 0 && (
            <div className="mt-1.5" style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#1b1c1a' }}>
              {priceRange.min === priceRange.max ? `₹${fmt(priceRange.min)}` : `₹${fmt(priceRange.min)} – ₹${fmt(priceRange.max)}`}
            </div>
          )}
        </div>
      </div>

      {/* Stat bar */}
      <div className="grid grid-cols-4 px-4 pb-3" style={{ borderTop: '1px solid rgba(208,197,176,0.3)' }}>
        {[
          { l: 'COGS', v: cogs > 0 ? `₹${fmt(n(cogs).toFixed(0))}` : '—', c: '#494bd6' },
          { l: 'MRP', v: mrp > 0 ? `₹${fmt(mrp)}` : '—', c: '#1b1c1a' },
          { l: 'Eff.SP', v: effSP > 0 ? `₹${fmt(effSP.toFixed(0))}` : '—', c: '#494bd6' },
          { l: 'GM%', v: cogs > 0 ? `${(gm * 100).toFixed(1)}%` : '—', c: gm > 0.5 ? '#16a34a' : gm > 0.3 ? '#d97706' : '#dc2626' },
        ].map((s, i) => (
          <div key={i} className="text-center pt-2" style={{ borderLeft: i === 0 ? 'none' : '1px solid rgba(208,197,176,0.3)' }}>
            <div style={{ fontSize: 9, letterSpacing: '0.06em', color: '#7f7663', textTransform: 'uppercase', fontWeight: 700 }}>{s.l}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: s.c, marginTop: 2 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Action */}
      <div className="px-4 pb-4">
        <button onClick={(e) => { e.stopPropagation(); onOpen(row) }}
          className="w-full py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-all active:scale-[0.99]"
          style={{ background: '#c9a432', color: '#4c3b00' }}>
          <Icon name="edit" cls="w-4 h-4" /> Open & Edit
        </button>
      </div>
    </div>
  )
}

const CatalogueV2 = (props) => {
  const { fabrics = [], dyes = [], categories: masterCategories = [], consumption = [], stitchingMaster = [] } = props

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState('')

  // Filters — same shape as V1
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [setFilter, setSetFilter] = useState('All')
  const [sortBy, setSortBy] = useState('default')
  const [reviewTab, setReviewTab] = useState('all')
  const [tagSel, setTagSel] = useState([])
  const [collSel, setCollSel] = useState([])

  const [openRow, setOpenRow] = useState(null)
  const [labelRow, setLabelRow] = useState(null)
  // 'cards' (default) | 'rows' (one variant per row, click to expand) | 'quick' (all rows pre-expanded)
  const [viewMode, setViewMode] = useState('cards')

  const reload = async () => {
    setLoading(true); setErrMsg('')
    try { setRows(await fetchAllCatalogueProductsV2()) }
    catch (e) { setErrMsg(e?.message || String(e)) }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  // ── category → tags lookup (DB-driven), exactly like V1 ────────────────────
  const catTagMap = useMemo(() => {
    const map = {}
    ;(masterCategories || []).forEach(c => {
      if (c.shopify_tag) map[c.name] = c.shopify_tag.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
    })
    return map
  }, [masterCategories])

  const productMatchesCat = (row, cat) => {
    if (cat === 'Other') {
      const tags = parseTags(row.shopify_tags).map(t => t.toLowerCase())
      const allMasterTags = []
      Object.values(catTagMap).forEach(arr => arr.forEach(t => allMasterTags.push(t)))
      return !allMasterTags.some(mt => tags.includes(mt))
    }
    const catTags = catTagMap[cat]
    if (!catTags || !catTags.length) return false
    const tags = parseTags(row.shopify_tags).map(t => t.toLowerCase())
    return catTags.some(ct => tags.includes(ct))
  }

  const availableCats = useMemo(() => {
    const groupOrder = ['Occasion Wear', 'Urban Wear', 'Kids', 'Accessories', '']
    let names
    if ((masterCategories || []).length > 0) {
      const ordered = []
      groupOrder.forEach(grp => {
        ;(masterCategories || []).filter(c => (c.group || '') === grp).forEach(c => { if (c.name) ordered.push(c.name) })
      })
      ordered.push('Other')
      names = ordered
    } else {
      names = [...new Set([...CATEGORIES, ...rows.map(r => r.category).filter(Boolean)])]
    }
    return ['All', ...names]
  }, [masterCategories, rows])

  const getColls = (r) => Array.isArray(r.shopify_collections) ? r.shopify_collections.filter(Boolean) : []
  const tagOptions = useMemo(() => {
    const m = {}; rows.forEach(r => parseTags(r.shopify_tags).forEach(t => { if (t) m[t] = (m[t] || 0) + 1 }))
    return Object.entries(m).map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value))
  }, [rows])
  const collOptions = useMemo(() => {
    const m = {}; rows.forEach(r => getColls(r).forEach(c => { m[c] = (m[c] || 0) + 1 }))
    return Object.entries(m).map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value))
  }, [rows])

  // Active vs inactive — inactive products are hidden from All/Pending/In Review/
  // Finalized and surfaced ONLY under the Inactive tab.
  const isActive = (r) => r.status === 'Active'
  const reviewCounts = useMemo(() => {
    const c = { all: 0, pending: 0, in_review: 0, finalized: 0, inactive: 0 }
    rows.forEach(r => {
      if (!isActive(r)) { c.inactive++; return }
      c.all++
      c[rowReviewStatus(r)]++
    })
    return c
  }, [rows])

  const filtered = useMemo(() => {
    let list = rows.filter(r => {
      const active = isActive(r)
      // Default tabs (All / Pending / In Review / Finalized) hide inactive.
      // Inactive tab shows ONLY inactive.
      if (reviewTab === 'inactive') {
        if (active) return false
      } else {
        if (!active) return false
        const rs = rowReviewStatus(r)
        if (reviewTab === 'pending' && rs !== 'pending') return false
        if (reviewTab === 'in_review' && rs !== 'in_review') return false
        if (reviewTab === 'finalized' && rs !== 'finalized') return false
      }
      if (catFilter !== 'All' && !productMatchesCat(r, catFilter)) return false
      if (statusFilter !== 'All' && r.status !== statusFilter) return false
      if (setFilter === 'Sets' && !rowIsSet(r)) return false
      if (setFilter === 'Singles' && rowIsSet(r)) return false
      if (tagSel.length) { const ts = parseTags(r.shopify_tags); if (!tagSel.some(t => ts.includes(t))) return false }
      if (collSel.length) { const cs = getColls(r); if (!collSel.some(c => cs.includes(c))) return false }
      if (search) {
        const q = search.toLowerCase()
        const hay = [
          r.product_title, r.category, r.colour_primary,
          ...(r.variants || []).map(v => v.style_code),
          ...(r.variants || []).map(v => v.fabric_name),
          ...(r.variant_skus || []),
        ].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(q)
      }
      return true
    })
    if (sortBy !== 'default') {
      list = [...list].sort((a, b) => {
        const A = rowStats(a), B = rowStats(b)
        if (sortBy === 'gm_desc') return B.gm - A.gm
        if (sortBy === 'gm_asc') return A.gm - B.gm
        if (sortBy === 'mrp_desc') return B.mrp - A.mrp
        if (sortBy === 'mrp_asc') return A.mrp - B.mrp
        if (sortBy === 'cogs_desc') return B.cogs - A.cogs
        if (sortBy === 'cogs_asc') return A.cogs - B.cogs
        return 0
      })
    }
    return list
  }, [rows, search, catFilter, statusFilter, setFilter, sortBy, reviewTab, tagSel, collSel, catTagMap])

  const activeFiltersCount = [catFilter !== 'All', statusFilter !== 'All', setFilter !== 'All', sortBy !== 'default', tagSel.length > 0, collSel.length > 0, reviewTab !== 'all', search !== ''].filter(Boolean).length
  const clearFilters = () => { setCatFilter('All'); setStatusFilter('All'); setSetFilter('All'); setSortBy('default'); setTagSel([]); setCollSel([]); setReviewTab('all'); setSearch('') }

  if (openRow) {
    return (
      <div className="p-4 sm:p-6">
        <button onClick={() => setOpenRow(null)} className="text-sm text-gray-500 hover:text-gray-800 mb-3 flex items-center gap-1">
          <Icon name="arrow-left" cls="w-4 h-4" /> Back to catalogue
        </button>
        <ProductViewV2
          row={openRow}
          fabrics={fabrics}
          dyes={dyes}
          categories={masterCategories}
          consumption={consumption}
          stitchingMaster={stitchingMaster}
          onClose={() => setOpenRow(null)}
          onChanged={reload}
        />
      </div>
    )
  }

  const reviewTabs = [
    { key: 'all',       label: 'All',          count: reviewCounts.all,       style: { background: '#c9a432', color: '#fff', borderColor: 'transparent' } },
    { key: 'pending',   label: 'Pending COGS', count: reviewCounts.pending,   style: { background: '#f3f4f6', color: '#374151', borderColor: '#d1d5db' } },
    { key: 'in_review', label: 'In Review',    count: reviewCounts.in_review, style: { background: '#fffbeb', color: '#b45309', borderColor: '#fcd34d' } },
    { key: 'finalized', label: 'Finalized',    count: reviewCounts.finalized, style: { background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' } },
    { key: 'inactive',  label: 'Inactive',     count: reviewCounts.inactive,  style: { background: '#f5f5f4', color: '#57534e', borderColor: '#a8a29e' } },
  ]

  const dropdownCls = (active) => 'border rounded-lg px-2.5 py-1.5 text-xs flex-shrink-0 ' + (active ? 'bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500')
  const dropdownStyle = (active) => active ? { borderColor: '#c9a432' } : {}

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">Catalogue v2</h1>
          <div className="text-xs text-gray-400 mt-0.5">{loading ? 'Loading…' : `${filtered.length} products`}</div>
        </div>
        <button onClick={reload} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Refresh</button>
      </div>

      {errMsg && <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: '#fee2e2', color: '#991b1b' }}>{errMsg}</div>}

      {/* Search */}
      <div className="relative mb-3">
        <Icon name="search" cls="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search style code, name, colour, fabric..."
          className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm" />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 text-xs">✕</button>}
      </div>

      {/* COGS Review tabs */}
      <div className="flex gap-1.5 mb-2 flex-wrap">
        {reviewTabs.map(tab => {
          const on = reviewTab === tab.key
          return (
            <button key={tab.key} onClick={() => setReviewTab(tab.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border"
              style={on ? tab.style : { background: '#fff', borderColor: '#e5e7eb', color: '#4b5563' }}>
              {tab.label} <span className="ml-1 opacity-60">{tab.count}</span>
            </button>
          )
        })}
      </div>

      {/* Category tabs — scrollable */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 pb-1">
        <div className="flex gap-1.5 px-4 sm:px-0 min-w-max">
          {availableCats.map(c => {
            const on = catFilter === c
            return (
              <button key={c} onClick={() => setCatFilter(c)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border"
                style={on ? { background: '#c9a432', color: '#fff', borderColor: 'transparent' } : { background: '#fff', borderColor: '#e5e7eb', color: '#4b5563' }}>
                {c} {c !== 'All' && <span className="ml-1 opacity-60">{rows.filter(r => productMatchesCat(r, c)).length}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Filter row */}
      <div className="flex gap-2 mt-2 mb-4 flex-wrap">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={dropdownCls(statusFilter !== 'All')} style={dropdownStyle(statusFilter !== 'All')}>
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <select value={setFilter} onChange={e => setSetFilter(e.target.value)} className={dropdownCls(setFilter !== 'All')} style={dropdownStyle(setFilter !== 'All')}>
          <option value="All">Sets + Singles</option>
          <option value="Sets">Sets only</option>
          <option value="Singles">Singles only</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={dropdownCls(sortBy !== 'default')} style={dropdownStyle(sortBy !== 'default')}>
          <option value="default">Sort: Default</option>
          <option value="gm_desc">GM% ↓ High first</option>
          <option value="gm_asc">GM% ↑ Low first</option>
          <option value="mrp_desc">MRP ↓ High first</option>
          <option value="mrp_asc">MRP ↑ Low first</option>
          <option value="cogs_desc">COGS ↓ High first</option>
          <option value="cogs_asc">COGS ↑ Low first</option>
        </select>
        {collOptions.length > 0 && <MultiSelectFilter label="Collections" options={collOptions} selected={collSel} onChange={setCollSel} width={250} />}
        {tagOptions.length > 0 && <MultiSelectFilter label="Tags" options={tagOptions} selected={tagSel} onChange={setTagSel} width={230} />}
        {activeFiltersCount > 0 && (
          <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 px-2 py-1.5 border border-red-200 rounded-lg bg-red-50">
            ✕ Clear filters ({activeFiltersCount})
          </button>
        )}
      </div>

      {/* View mode toggle */}
      <div className="flex items-center justify-between mt-1 mb-3">
        <div className="flex gap-1 p-1 rounded-full" style={{ background: '#f5f4f0' }}>
          {[
            ['cards','Cards','Image-first grid'],
            ['rows','Rows','One row per variant, click to edit'],
            ['quick','Quick Entry','All rows pre-expanded for fast COGS entry'],
          ].map(([k,label,tip]) => {
            const active = viewMode === k
            return (
              <button key={k} onClick={() => setViewMode(k)} title={tip}
                className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                style={{
                  background: active ? '#c9a432' : 'transparent',
                  color: active ? '#fff' : '#6b7280',
                }}>
                {label}
              </button>
            )
          })}
        </div>
        <div className="text-xs text-gray-400">{filtered.length} products</div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Loading catalogue…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-gray-400 py-12">No products match.</div>
      ) : viewMode === 'cards' ? (
        <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
          {filtered.map(r => <ProductCardV2 key={r.id} row={r} onOpen={setOpenRow} onLabel={setLabelRow} />)}
        </div>
      ) : (
        <CatalogueQuickEntryV2
          products={filtered}
          fabrics={fabrics}
          dyes={dyes}
          categories={masterCategories}
          consumption={consumption}
          stitchingMaster={stitchingMaster}
          mode={viewMode === 'quick' ? 'quick' : 'rows'}
          onChanged={reload}
        />
      )}
      {labelRow && <ProductLabelModal product={labelRow} onClose={() => setLabelRow(null)} />}
    </div>
  )
}

export default CatalogueV2

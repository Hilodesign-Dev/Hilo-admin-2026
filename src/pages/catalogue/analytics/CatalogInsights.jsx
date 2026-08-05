/* ═══════════════════════════════════════════════════════════════════════════
   CATALOG INSIGHTS — per-category merchandising action lists.
   Group (Category Master) → Category → lenses (Best Sellers / Keep / Watch /
   Remove / Relaunch / New / Custom). Reads mv_catalog_product_metrics (weekly
   refresh + Sync now), catalog_product_tags (manual Remove/Relaunch),
   v_catalog_custom_by_category + v_catalog_custom_demand (customisation).
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useEffect } from 'react'
import { supa } from '../../../lib/supabase'

const GOLD = '#c9a432', INK = '#1b1c1a', SUB = '#6b7280', LINE = '#ebe7df', GOOD = '#16a34a', BAD = '#b91c1c', AMBER = '#d97706'
const fmtINR = n => { const v = Number(n) || 0, a = Math.abs(v); if (a >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr'; if (a >= 1e5) return '₹' + (v / 1e5).toFixed(1) + 'L'; return '₹' + Math.round(v).toLocaleString('en-IN') }
const fmtN = n => (Number(n) || 0).toLocaleString('en-IN')
const csvDl = (rows, name) => { const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); const b = new Blob([csv], { type: 'text/csv' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u) }

const REASONS = ['Fabric discontinued', 'Poor sales', 'Poor margin', 'Seasonal', 'Quality issue', 'Other']
const TREND = { rising: ['▲', GOOD], fading: ['▼', BAD], steady: ['▬', SUB], none: ['·', '#cbd5e1'] }

const LENSES = [
  ['all', 'All'], ['bestsellers', 'Best Sellers'], ['keep', 'Keep'], ['watch', 'Watch'],
  ['remove', 'Remove'], ['relaunch', 'Relaunch'], ['new', 'New'], ['custom', 'Custom Insights'],
]

// tiny inline sparkline from monthly_series (last 18 months)
const Spark = ({ series }) => {
  const pts = (series || []).slice(-18).map(p => Number(p.u) || 0)
  if (pts.length < 2) return <span style={{ color: '#cbd5e1' }}>—</span>
  const max = Math.max(...pts, 1), w = 70, h = 18, step = w / (pts.length - 1)
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(' ')
  return <svg width={w} height={h} style={{ display: 'block' }}><path d={d} fill="none" stroke={GOLD} strokeWidth="1.5" /></svg>
}

export default function CatalogInsights() {
  const [rows, setRows] = useState([])
  const [tags, setTags] = useState([])
  const [custom, setCustom] = useState([])
  const [demand, setDemand] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [group, setGroup] = useState(() => sessionStorage.getItem('hilo_ci_group') || 'Occasion Wear')
  const [cat, setCat] = useState(() => sessionStorage.getItem('hilo_ci_cat') || 'all')
  const [lens, setLens] = useState('all')
  const [sort, setSort] = useState({ f: 'net_5y', d: -1 })
  const [actionFor, setActionFor] = useState(null)
  const [attrs, setAttrs] = useState({})
  const [fTags, setFTags] = useState(() => new Set())
  const [fColl, setFColl] = useState('')
  const [q, setQ] = useState('')
  const [tagLimit, setTagLimit] = useState(18)

  const load = async () => {
    setLoading(true)
    const [m, t, c, d, p] = await Promise.all([
      supa.from('mv_catalog_product_metrics').select('*').limit(5000),
      supa.from('catalog_product_tags').select('*').neq('status', 'dismissed'),
      supa.from('v_catalog_custom_by_category').select('*'),
      supa.from('v_catalog_custom_demand').select('*'),
      supa.from('catalogue_products').select('id, shopify_tags, shopify_collections, colour_primary').limit(5000),
    ])
    setRows(m.data || []); setTags(t.data || []); setCustom(c.data || []); setDemand(d.data || [])
    const am = {}
    ;(p.data || []).forEach(function (x) {
      const tagsRaw = (x.shopify_tags || '').split(',').map(function (z) { return z.trim() }).filter(Boolean)
      let colls = []
      try { colls = Array.isArray(x.shopify_collections) ? x.shopify_collections : (x.shopify_collections ? JSON.parse(x.shopify_collections) : []) } catch (e) { colls = [] }
      colls = (colls || []).map(function (z) { return String(z).trim() }).filter(Boolean)
      am[x.id] = { tagsRaw: tagsRaw, tagset: new Set(tagsRaw.map(function (z) { return z.toLowerCase() })), colls: colls, colour: x.colour_primary || '' }
    })
    setAttrs(am)
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  useEffect(() => { sessionStorage.setItem('hilo_ci_group', group); sessionStorage.setItem('hilo_ci_cat', cat) }, [group, cat])

  const syncNow = async () => { setSyncing(true); try { await supa.rpc('refresh_catalog_insights'); await load() } finally { setSyncing(false) } }

  // group → categories present in data (ordered by 5Y net)
  const groups = useMemo(() => {
    const g = {}
    rows.forEach(r => { (g[r.category_group] = g[r.category_group] || {})[r.category] = (g[r.category_group][r.category] || 0) + Number(r.net_5y || 0) })
    const order = ['Occasion Wear', 'Urban Wear', 'Kids', 'Accessories', 'Ungrouped']
    return Object.keys(g).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99).map(gn => ({
      name: gn, cats: Object.entries(g[gn]).sort((a, b) => b[1] - a[1]).map(([c]) => c),
    }))
  }, [rows])

  const catsInGroup = useMemo(() => (groups.find(g => g.name === group)?.cats) || [], [groups, group])
  useEffect(() => { if (cat !== 'all' && !catsInGroup.includes(cat)) setCat('all') }, [group]) // eslint-disable-line

  const tagsByProduct = useMemo(() => { const m = {}; tags.forEach(t => (m[t.catalogue_product_id] = m[t.catalogue_product_id] || []).push(t)); return m }, [tags])

  // rows scoped to selected group + category
  const scoped = useMemo(() => rows.filter(r => r.category_group === group && (cat === 'all' || r.category === cat)), [rows, group, cat])

  // ── attribute facets (prints / fabrics / occasions from Shopify tags + collections) ──
  const HIDE_COLL = new Set(['kurtas right filters'])
  const facetTags = useMemo(() => {
    const m = {}
    scoped.forEach(function (r) { const a = attrs[r.pid]; if (!a) return
      a.tagsRaw.forEach(function (t) { const k = t.toLowerCase(); (m[k] = m[k] || { k: k, label: t, n: 0 }).n++ }) })
    return Object.values(m).sort(function (a, b) { return b.n - a.n })
  }, [scoped, attrs])
  const facetColls = useMemo(() => {
    const m = {}
    scoped.forEach(function (r) { const a = attrs[r.pid]; if (!a) return
      a.colls.forEach(function (c) { if (HIDE_COLL.has(c.toLowerCase())) return; (m[c] = m[c] || { c: c, n: 0 }).n++ }) })
    return Object.values(m).sort(function (a, b) { return b.n - a.n })
  }, [scoped, attrs])
  const scopedF = useMemo(() => {
    const qq = q.trim().toLowerCase(); const ft = [...fTags]
    return scoped.filter(function (r) {
      const a = attrs[r.pid] || {}
      if (ft.length) { const ts = a.tagset || new Set(); if (!ft.some(function (t) { return ts.has(t) })) return false }
      if (fColl && !((a.colls || []).indexOf(fColl) >= 0)) return false
      if (qq) { const hay = ((r.title || '') + ' ' + ((a.tagsRaw || []).join(' ')) + ' ' + ((a.colls || []).join(' ')) + ' ' + (a.colour || '')).toLowerCase()
        if (hay.indexOf(qq) < 0) return false }
      return true
    })
  }, [scoped, attrs, fTags, fColl, q])
  const anyFilter = fTags.size > 0 || !!fColl || !!q.trim()
  const toggleTag = function (k) { setFTags(function (prev) { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n }) }
  const clearFilters = function () { setFTags(new Set()); setFColl(''); setQ('') }

  const lensRows = useMemo(() => {
    let list = scopedF
    if (lens === 'all') list = scopedF
    else if (lens === 'bestsellers') list = scopedF.filter(r => r.suggested_bucket === 'bestseller')
    else if (lens === 'keep') list = scopedF.filter(r => (r.status || '').toLowerCase() === 'active' && Number(r.units_12m) >= 1)
    else if (lens === 'watch') list = scopedF.filter(r => r.suggested_bucket === 'watch')
    else if (lens === 'new') list = scopedF.filter(r => r.suggested_bucket === 'new')
    else if (lens === 'remove') list = scopedF.filter(r => r.suggested_bucket === 'remove' || (tagsByProduct[r.pid] || []).some(t => t.tag === 'remove'))
    else if (lens === 'relaunch') list = scopedF.filter(r => (tagsByProduct[r.pid] || []).some(t => t.tag === 'relaunch'))
    const f = sort.f
    return [...list].sort((a, b) => (Number(a[f]) - Number(b[f])) * sort.d)
  }, [scopedF, lens, sort, tagsByProduct])

  const th = (f, label, right) => (
    <th onClick={() => setSort(s => ({ f, d: s.f === f ? -s.d : -1 }))}
      style={{ cursor: 'pointer', textAlign: right ? 'right' : 'left', padding: '8px 10px', color: SUB, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', userSelect: 'none' }}>
      {label}{sort.f === f ? (sort.d < 0 ? ' ↓' : ' ↑') : ''}
    </th>
  )

  const exportCsv = () => {
    const head = ['#', 'Product', 'Style', 'Category', 'Units 5Y', 'Net 5Y', 'Units 12M', 'Net 12M', 'Units 3M', 'Trend', 'Custom %', 'Bucket']
    const body = lensRows.map((r, i) => [i + 1, r.title, r.style_code, r.category, r.units_5y, Math.round(r.net_5y), r.units_12m, Math.round(r.net_12m), r.units_3m, r.trend, r.custom_share_pct, r.suggested_bucket])
    csvDl([head, ...body], `HILO_${cat === 'all' ? group : cat}_${lens}.csv`)
  }

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: SUB }}>Loading catalog insights…</div>

  return (
    <div style={{ padding: '16px 20px 80px', fontFamily: 'Manrope, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>Catalog Insights</div>
          <div style={{ fontSize: 12, color: SUB }}>What's working & what's not, by category. Weekly refresh — or sync on demand.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportCsv} style={{ fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff', color: INK }}>Export CSV</button>
          <button onClick={syncNow} disabled={syncing} style={{ fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: 'none', background: INK, color: '#fff', opacity: syncing ? 0.6 : 1 }}>{syncing ? 'Syncing…' : 'Sync now'}</button>
        </div>
      </div>

      {/* Group tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 8 }}>
        {groups.map(g => (
          <button key={g.name} onClick={() => setGroup(g.name)}
            style={{ padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', border: group === g.name ? 'none' : `1px solid ${LINE}`, background: group === g.name ? GOLD : 'transparent', color: group === g.name ? '#fff' : SUB }}>
            {g.name}
          </button>
        ))}
      </div>
      {/* Category pills */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10, flexWrap: 'wrap' }}>
        {['all', ...catsInGroup].map(c => (
          <button key={c} onClick={() => setCat(c)}
            style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', border: cat === c ? `1px solid ${INK}` : `1px solid ${LINE}`, background: cat === c ? INK : '#fff', color: cat === c ? '#fff' : SUB }}>
            {c === 'all' ? 'All ' + group : c}
          </button>
        ))}
      </div>

      {/* Attribute filters — prints / fabrics / occasions via tags + collections */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search print, fabric, colour, name…"
          style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: `1px solid ${LINE}`, minWidth: 220 }} />
        {facetColls.length > 0 && (
          <select value={fColl} onChange={e => setFColl(e.target.value)}
            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff', color: fColl ? INK : SUB }}>
            <option value="">All collections</option>
            {facetColls.map(c => <option key={c.c} value={c.c}>{c.c} ({c.n})</option>)}
          </select>
        )}
        {anyFilter && (
          <button onClick={clearFilters} style={{ fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff', color: SUB }}>Clear ✕</button>
        )}
        <span style={{ fontSize: 11, color: SUB, marginLeft: 'auto' }}>{scopedF.length} of {scoped.length}</span>
      </div>
      {facetTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {facetTags.slice(0, tagLimit).map(t => {
            const on = fTags.has(t.k)
            return (
              <button key={t.k} onClick={() => toggleTag(t.k)}
                style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                         border: on ? 'none' : `1px solid ${LINE}`, background: on ? GOLD : '#fff', color: on ? '#fff' : SUB }}>
                {t.label} <span style={{ opacity: 0.55 }}>{t.n}</span>
              </button>
            )
          })}
          {facetTags.length > tagLimit && (
            <button onClick={() => setTagLimit(facetTags.length)} style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, border: `1px solid ${LINE}`, background: '#fff', color: INK }}>+{facetTags.length - tagLimit} more</button>
          )}
          {tagLimit > 18 && (
            <button onClick={() => setTagLimit(18)} style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, border: `1px solid ${LINE}`, background: '#fff', color: INK }}>less</button>
          )}
        </div>
      )}

      {/* Lens tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${LINE}`, marginBottom: 12, overflowX: 'auto' }}>
        {LENSES.map(([k, label]) => {
          const count = k === 'custom' ? null
            : k === 'all' ? scopedF.length
            : k === 'relaunch' ? scopedF.filter(r => (tagsByProduct[r.pid] || []).some(t => t.tag === 'relaunch')).length
            : k === 'remove' ? scopedF.filter(r => r.suggested_bucket === 'remove' || (tagsByProduct[r.pid] || []).some(t => t.tag === 'remove')).length
            : k === 'keep' ? scopedF.filter(r => (r.status || '').toLowerCase() === 'active' && Number(r.units_12m) >= 1).length
            : scopedF.filter(r => r.suggested_bucket === (k === 'bestsellers' ? 'bestseller' : k)).length
          return (
            <button key={k} onClick={() => setLens(k)}
              style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', border: 'none', borderBottom: lens === k ? `2px solid ${GOLD}` : '2px solid transparent', background: 'transparent', color: lens === k ? INK : SUB }}>
              {label}{count != null ? ` ${count}` : ''}
            </button>
          )
        })}
      </div>

      {lens === 'custom' ? <CustomView custom={custom} demand={demand} group={group} cat={cat} catsInGroup={catsInGroup} />
        : (
          <div style={{ overflowX: 'auto', border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: '#faf9f5', borderBottom: `1px solid ${LINE}` }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 10px', color: SUB, fontSize: 11, fontWeight: 700 }}>Product</th>
                  {th('units_5y', '5Y u', true)}{th('net_5y', '5Y ₹', true)}
                  {th('units_12m', '12M u', true)}{th('net_12m', '12M ₹', true)}
                  {th('units_3m', '3M u', true)}
                  <th style={{ padding: '8px 10px', color: SUB, fontSize: 11, fontWeight: 700 }}>Trend</th>
                  {th('custom_share_pct', 'Cust%', true)}
                  <th style={{ padding: '8px 10px', color: SUB, fontSize: 11, fontWeight: 700 }}></th>
                </tr>
              </thead>
              <tbody>
                {lensRows.length === 0 && <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: SUB }}>No products in this lens.</td></tr>}
                {lensRows.map(r => {
                  const [ta, tc] = TREND[r.trend] || TREND.none
                  const prodTags = tagsByProduct[r.pid] || []
                  return (
                    <tr key={r.pid} style={{ borderBottom: `1px solid ${LINE}` }}>
                      <td style={{ padding: '8px 10px', minWidth: 240 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {r.image_url ? <img src={r.image_url} alt="" style={{ width: 34, height: 44, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} /> : <div style={{ width: 34, height: 44, background: '#f1efe9', borderRadius: 4, flexShrink: 0 }} />}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{r.title}</div>
                            <div style={{ fontSize: 11, color: SUB }}>{r.style_code || '—'} · {r.category} · {(r.status || '').toLowerCase() === 'active' ? 'Active' : 'Archived'}</div>
                            {prodTags.map(t => (
                              <span key={t.id} style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, marginRight: 4, background: t.tag === 'relaunch' ? '#ede9fe' : '#fee2e2', color: t.tag === 'relaunch' ? '#6d28d9' : '#b91c1c' }}>
                                {t.tag === 'relaunch' ? '↻ Relaunch' : '✕ Remove'}{t.reason_preset ? ` · ${t.reason_preset}` : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>{fmtN(r.units_5y)}</td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 700 }}>{fmtINR(r.net_5y)}</td>
                      <td style={{ textAlign: 'right', padding: '8px 10px' }}>{fmtN(r.units_12m)}</td>
                      <td style={{ textAlign: 'right', padding: '8px 10px' }}>{fmtINR(r.net_12m)}</td>
                      <td style={{ textAlign: 'right', padding: '8px 10px' }}>{fmtN(r.units_3m)}</td>
                      <td style={{ padding: '8px 10px' }}><span title={r.trend} style={{ color: tc, fontWeight: 700 }}>{ta}</span> <Spark series={r.monthly_series} /></td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', color: Number(r.custom_share_pct) > 0 ? AMBER : SUB }}>{r.custom_share_pct}%</td>
                      <td style={{ textAlign: 'right', padding: '8px 10px' }}>
                        <button onClick={() => setActionFor(r)} style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6, border: `1px solid ${LINE}`, background: '#fff', color: INK, whiteSpace: 'nowrap' }}>Action</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      {actionFor && <ActionModal row={actionFor} onClose={() => setActionFor(null)} onSaved={() => { setActionFor(null); load() }} />}
    </div>
  )
}

function CustomView({ custom, demand, group, cat, catsInGroup }) {
  const cats = cat === 'all' ? catsInGroup : [cat]
  const rows = custom.filter(c => cats.includes(c.category))
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 12, color: SUB }}>Customised orders = POS custom, made-to-fit, or legacy "Customized" items (last 12 months). Shows what customers ask us to make.</div>
      {rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: SUB, border: `1px solid ${LINE}`, borderRadius: 12 }}>No customised orders in this selection.</div>}
      {rows.map(c => {
        const col = demand.filter(d => d.category === c.category && d.kind === 'colour').sort((a, b) => b.n - a.n).slice(0, 6)
        const fab = demand.filter(d => d.category === c.category && d.kind === 'fabric').sort((a, b) => b.n - a.n).slice(0, 6)
        return (
          <div key={c.category} style={{ border: `1px solid ${LINE}`, borderRadius: 12, background: '#fff', padding: 14 }}>
            <div style={{ fontWeight: 800, color: INK, marginBottom: 10 }}>{c.category}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 12 }}>
              <Kpi label="Custom mix" v={`${c.custom_mix_pct}%`} accent={AMBER} />
              <Kpi label="Custom lines 12M" v={fmtN(c.custom_lines_12m)} />
              <Kpi label="Avg custom ₹" v={fmtINR(c.avg_custom_value)} accent={GOOD} />
              <Kpi label="Avg standard ₹" v={fmtINR(c.avg_standard_value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <DemandList title="Most-requested fabrics" items={fab} />
              <DemandList title="Most-requested colours" items={col} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
const Kpi = ({ label, v, accent }) => (
  <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: 10 }}>
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: SUB }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: accent || INK, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
  </div>
)
const DemandList = ({ title, items }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: SUB, marginBottom: 6 }}>{title}</div>
    {items.length === 0 ? <div style={{ fontSize: 12, color: '#cbd5e1' }}>—</div> : items.map((it, i) => (
      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: `1px solid #f5f3ee` }}>
        <span style={{ color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{it.value}</span>
        <span style={{ color: SUB, fontWeight: 700 }}>{it.n}</span>
      </div>
    ))}
  </div>
)

function ActionModal({ row, onClose, onSaved }) {
  const [tag, setTag] = useState('remove')
  const [reason, setReason] = useState('Fabric discontinued')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await supa.from('catalog_product_tags').insert({
        catalogue_product_id: row.pid, category: row.category, category_group: row.category_group,
        tag, reason_preset: reason, reason_note: note || null,
        owner_id: window._currentTeamMemberId ? Number(window._currentTeamMemberId) : null,
        owner_name: window._currentUserName || null,
        bucket_at_decision: row.suggested_bucket,
        metric_snapshot: { units_5y: row.units_5y, net_5y: row.net_5y, units_12m: row.units_12m, units_3m: row.units_3m },
        created_by_id: window._currentTeamMemberId ? Number(window._currentTeamMemberId) : null,
        created_by_name: window._currentUserName || null,
      })
      onSaved()
    } finally { setSaving(false) }
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 420 }}>
        <div style={{ fontWeight: 800, color: INK, marginBottom: 2 }}>{row.title}</div>
        <div style={{ fontSize: 12, color: SUB, marginBottom: 14 }}>{row.style_code} · {row.category}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[['remove', '✕ Remove', '#fee2e2', '#b91c1c'], ['relaunch', '↻ Relaunch', '#ede9fe', '#6d28d9']].map(([k, l, bg, fg]) => (
            <button key={k} onClick={() => setTag(k)} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: tag === k ? 'none' : `1px solid ${LINE}`, background: tag === k ? fg : bg, color: tag === k ? '#fff' : fg }}>{l}</button>
          ))}
        </div>
        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: SUB }}>Reason</label>
        <select value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid ${LINE}`, margin: '4px 0 12px', fontSize: 13 }}>
          {REASONS.map(r => <option key={r}>{r}</option>)}
        </select>
        <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: SUB }}>Note</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional — e.g. relaunch in raw silk" style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid ${LINE}`, margin: '4px 0 16px', fontSize: 13 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff', fontWeight: 700, fontSize: 13 }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: INK, color: '#fff', fontWeight: 700, fontSize: 13, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save action'}</button>
        </div>
      </div>
    </div>
  )
}

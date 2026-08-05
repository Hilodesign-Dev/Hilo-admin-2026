/* ═══════════════════════════════════════════════════════════════════════════
   CATALOG V2 → ANALYTICS — portfolio decisions ("what worked, what didn't").
   Reads one row per catalogue product from v_catalog_product_analytics.
   Category filter drives every view. Segments computed in the DB view.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useEffect } from 'react'
import { supa } from '../../../lib/supabase'

const GOLD = '#c9a432', INK = '#1b1c1a', SUB = '#6b7280', LINE = '#ebe7df', GOOD = '#16a34a', BAD = '#b91c1c'
const SEG = {
  star:       ['🌟 Star', '#16a34a'], winner: ['🏆 Winner', '#15803d'], cash_cow: ['💰 Cash cow', '#b45309'],
  rising:     ['📈 Rising', '#d97706'], at_risk: ['📉 At risk', '#dc2626'], slow_mover: ['🐢 Slow', '#6b7280'],
  non_mover:  ['💀 Non-mover', '#4b5563'], dead: ['⚰️ Dead', '#111827'], new_launch: ['🆕 New', '#2563eb'], steady: ['• Steady', '#9ca3af'],
}
const segMeta = (s) => SEG[s] || ['—', SUB]
const fmtINR = n => { const v = Number(n) || 0, a = Math.abs(v); if (a >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr'; if (a >= 1e5) return '₹' + (v / 1e5).toFixed(1) + 'L'; return '₹' + Math.round(v).toLocaleString('en-IN') }
const fmtN = n => (Number(n) || 0).toLocaleString('en-IN')
const trendCell = (t) => { if (t == null) return <span style={{ color: SUB }}>—</span>; const p = Math.round((t - 1) * 100); const c = p > 20 ? GOOD : p > 0 ? '#d97706' : p < 0 ? BAD : SUB; return <span style={{ color: c, fontWeight: 700 }}>{p > 0 ? '+' : ''}{p}%</span> }
const dl = (rows, name) => { const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); const b = new Blob([csv], { type: 'text/csv' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u) }

const SUBVIEWS = [['overview', 'Overview'], ['winners', 'Winners'], ['movers', 'Movers'], ['nonmovers', 'Non-movers']]

export default function AnalyticsTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState(() => (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('hilo_catalog_analytics_view')) || 'overview')
  const [cat, setCat] = useState('all')
  const load = async () => {
    setLoading(true)
    const { data } = await supa.from('v_catalog_product_analytics').select('*').limit(5000)
    setRows(data || []); setLoading(false)
  }
  useEffect(() => { load() }, [])
  useEffect(() => { try { sessionStorage.setItem('hilo_catalog_analytics_view', view) } catch (e) {} }, [view])

  const categories = useMemo(() => [...new Set(rows.map(r => r.category).filter(Boolean))].sort(), [rows])
  const scoped = useMemo(() => cat === 'all' ? rows : rows.filter(r => r.category === cat), [rows, cat])

  return (
    <div className="p-4 sm:p-6" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#f3f1ea' }}>
          {SUBVIEWS.map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className="px-3.5 py-1.5 rounded-lg text-sm font-bold" style={{ background: view === k ? GOLD : 'transparent', color: view === k ? '#fff' : SUB }}>{l}</button>
          ))}
        </div>
        <select value={cat} onChange={e => setCat(e.target.value)} className="text-sm font-semibold px-3 py-2 rounded-lg" style={{ border: `1px solid ${LINE}`, background: cat !== 'all' ? '#fef9e7' : '#fff', color: INK }}>
          <option value="all">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={load} title="Refresh" className="text-sm px-3 py-2 rounded-lg" style={{ border: `1px solid ${LINE}`, color: SUB }}>⟳</button>
        {cat !== 'all' && <span className="text-xs" style={{ color: SUB }}>{scoped.length} products in {cat}</span>}
      </div>

      {loading ? <div className="text-center py-20" style={{ color: SUB }}>Loading portfolio…</div> :
        view === 'overview' ? <Overview rows={rows} scoped={scoped} cat={cat} setView={setView} /> :
        view === 'winners' ? <Winners scoped={scoped} /> :
        view === 'movers' ? <Movers scoped={scoped} /> :
        <NonMovers scoped={scoped} />}
    </div>
  )
}

const Card = ({ children }) => <div className="rounded-xl p-4" style={{ background: '#fff', border: `1px solid ${LINE}` }}>{children}</div>
const KPI = ({ l, v, s, c }) => <Card><div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: SUB }}>{l}</div><div className="text-xl font-bold mt-1" style={{ color: c || INK }}>{v}</div>{s && <div className="text-[11px] mt-0.5" style={{ color: SUB }}>{s}</div>}</Card>
const Th = ({ children, right }) => <th className="px-3 py-2 text-[10px] font-bold uppercase whitespace-nowrap" style={{ color: SUB, textAlign: right ? 'right' : 'left' }}>{children}</th>
const Td = ({ children, right, style }) => <td className="px-3 py-2 text-sm" style={{ textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap', ...style }}>{children}</td>
const SegPill = ({ s }) => { const [l, c] = segMeta(s); return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: c + '1a', color: c }}>{l}</span> }
const ProdCell = ({ r }) => <div className="flex items-center gap-2" style={{ maxWidth: 260 }}>{r.image_url ? <img src={r.image_url} alt="" style={{ width: 28, height: 34, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} /> : <div style={{ width: 28, height: 34, borderRadius: 4, background: '#f3f1ea', flexShrink: 0 }} />}<span className="truncate font-semibold" style={{ color: INK }}>{r.product_title || '—'}</span></div>

// ── OVERVIEW ──
function Overview({ rows, scoped, cat, setView }) {
  const k = useMemo(() => {
    const total = scoped.length
    const active = scoped.filter(r => r.units_12m > 0).length
    const never = scoped.filter(r => !r.last_sold_at).length
    const deadStock = scoped.filter(r => ['non_mover', 'dead'].includes(r.segment)).reduce((s, r) => s + (Number(r.stock_value_cost) || 0), 0)
    const rev90 = scoped.reduce((s, r) => s + (Number(r.revenue_90d) || 0), 0)
    const rev12 = scoped.reduce((s, r) => s + (Number(r.revenue_12m) || 0), 0)
    const earners = scoped.filter(r => Number(r.revenue_90d) > 0).map(r => Number(r.revenue_90d)).sort((a, b) => b - a)
    const top20n = Math.max(1, Math.round(earners.length * 0.2))
    const top20share = rev90 > 0 ? Math.round(earners.slice(0, top20n).reduce((a, b) => a + b, 0) / rev90 * 100) : 0
    const gmVals = scoped.map(r => Number(r.gm_pct)).filter(v => v > 0)
    const gm = gmVals.length ? Math.round(gmVals.reduce((a, b) => a + b, 0) / gmVals.length) : 0
    return { total, active, never, deadStock, rev90, rev12, top20share, gm }
  }, [scoped])

  const segRows = useMemo(() => Object.keys(SEG).map(s => { const g = scoped.filter(r => r.segment === s); return { s, n: g.length, rev: g.reduce((a, r) => a + (Number(r.revenue_90d) || 0), 0) } }).filter(x => x.n).sort((a, b) => b.n - a.n), [scoped])
  const byCat = useMemo(() => {
    const m = {}
    rows.forEach(r => { const c = r.category || 'Uncategorised'; if (!m[c]) m[c] = { c, skus: 0, units12: 0, rev12: 0, winners: 0, dead: 0, gmv: [] }; const x = m[c]; x.skus++; x.units12 += Number(r.units_12m) || 0; x.rev12 += Number(r.revenue_12m) || 0; if (['star', 'winner', 'cash_cow', 'rising'].includes(r.segment)) x.winners++; if (['dead', 'non_mover'].includes(r.segment)) x.dead++; if (Number(r.gm_pct) > 0) x.gmv.push(Number(r.gm_pct)) })
    return Object.values(m).map(x => ({ ...x, gm: x.gmv.length ? Math.round(x.gmv.reduce((a, b) => a + b, 0) / x.gmv.length) : 0 })).sort((a, b) => b.rev12 - a.rev12)
  }, [rows])
  const ch = useMemo(() => { const o = scoped.reduce((s, r) => s + (+r.u_online || 0), 0), st = scoped.reduce((s, r) => s + (+r.u_store || 0), 0), a = scoped.reduce((s, r) => s + (+r.u_assist || 0), 0), mk = scoped.reduce((s, r) => s + (+r.u_mkt || 0), 0); const t = o + st + a + mk || 1; return [['In-store', st], ['Online', o], ['Online Assist', a], ['Marketplace', mk]].map(([l, v]) => ({ l, v, pct: Math.round(v / t * 100) })) }, [scoped])
  const maxCatRev = Math.max(1, ...byCat.map(c => c.rev12))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI l="Total SKUs" v={fmtN(k.total)} s={`${k.active} sold in 12m (${k.total ? Math.round(k.active / k.total * 100) : 0}%)`} />
        <KPI l="Never sold" v={fmtN(k.never)} s={`${k.total ? Math.round(k.never / k.total * 100) : 0}% of catalogue`} c={BAD} />
        <KPI l="Dead stock @cost" v={fmtINR(k.deadStock)} s="non-movers + dead" c={BAD} />
        <KPI l="Top-20% revenue" v={k.top20share + '%'} s="concentration (90d)" />
        <KPI l="Revenue 90d" v={fmtINR(k.rev90)} c={GOLD} />
        <KPI l="Revenue 12m" v={fmtINR(k.rev12)} />
        <KPI l="Avg GM" v={k.gm + '%'} s="list margin" c={GOOD} />
        <KPI l="Active earners" v={fmtN(scoped.filter(r => ['star', 'winner', 'cash_cow'].includes(r.segment)).length)} s="stars + winners + cash cows" c={GOOD} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <div className="font-bold text-sm mb-3" style={{ color: INK }}>Portfolio segments{cat !== 'all' ? ` · ${cat}` : ''}</div>
          {segRows.map(x => { const [l, c] = segMeta(x.s); const max = Math.max(...segRows.map(y => y.n)); return (
            <div key={x.s} className="flex items-center gap-2 mb-2 cursor-pointer" onClick={() => setView(x.s === 'non_mover' || x.s === 'dead' ? 'nonmovers' : (x.s === 'winner' || x.s === 'star' || x.s === 'cash_cow' ? 'winners' : (x.s === 'rising' || x.s === 'at_risk' ? 'movers' : 'winners')))}>
              <span className="text-xs w-24" style={{ color: c, fontWeight: 700 }}>{l}</span>
              <div className="flex-1 h-4 rounded" style={{ background: '#f3f1ea' }}><div className="h-4 rounded" style={{ width: `${Math.round(x.n / max * 100)}%`, background: c, opacity: 0.85 }} /></div>
              <span className="text-xs font-bold w-10 text-right" style={{ color: INK }}>{x.n}</span>
              <span className="text-[11px] w-16 text-right" style={{ color: SUB }}>{fmtINR(x.rev)}</span>
            </div>) })}
        </Card>
        <Card>
          <div className="font-bold text-sm mb-3" style={{ color: INK }}>Channel mix (units, 12m){cat !== 'all' ? ` · ${cat}` : ''}</div>
          {ch.map(x => <div key={x.l} className="flex items-center gap-2 mb-2"><span className="text-xs w-28" style={{ color: SUB }}>{x.l}</span><div className="flex-1 h-4 rounded" style={{ background: '#f3f1ea' }}><div className="h-4 rounded" style={{ width: `${x.pct}%`, background: GOLD }} /></div><span className="text-xs font-bold w-16 text-right" style={{ color: INK }}>{fmtN(x.v)} · {x.pct}%</span></div>)}
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-2"><div className="font-bold text-sm" style={{ color: INK }}>Category performance — what's working, what isn't</div>
          <button onClick={() => dl([['Category', 'SKUs', 'Units 12m', 'Revenue 12m', 'Winners', 'Dead/Non-mover', 'Avg GM%'], ...byCat.map(c => [c.c, c.skus, c.units12, Math.round(c.rev12), c.winners, c.dead, c.gm])], 'category_performance.csv')} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${LINE}`, color: GOLD }}>Export CSV</button>
        </div>
        <div style={{ overflowX: 'auto' }}><table className="w-full" style={{ minWidth: 640, borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: `2px solid ${LINE}` }}><Th>Category</Th><Th right>SKUs</Th><Th right>Units 12m</Th><Th right>Revenue 12m</Th><Th right>Winners</Th><Th right>Dead</Th><Th right>GM%</Th></tr></thead>
          <tbody>{byCat.map(c => (
            <tr key={c.c} style={{ borderBottom: `1px solid ${LINE}` }}>
              <Td><div className="flex items-center gap-2"><span className="font-semibold" style={{ color: INK }}>{c.c}</span><div className="hidden sm:block h-2 rounded" style={{ width: 80, background: '#f3f1ea' }}><div className="h-2 rounded" style={{ width: `${Math.round(c.rev12 / maxCatRev * 100)}%`, background: GOLD }} /></div></div></Td>
              <Td right>{fmtN(c.skus)}</Td><Td right>{fmtN(c.units12)}</Td><Td right style={{ fontWeight: 700, color: INK }}>{fmtINR(c.rev12)}</Td>
              <Td right style={{ color: GOOD, fontWeight: 700 }}>{c.winners || '—'}</Td><Td right style={{ color: c.dead ? BAD : SUB }}>{c.dead || '—'}</Td><Td right>{c.gm ? c.gm + '%' : '—'}</Td>
            </tr>))}</tbody>
        </table></div>
      </Card>
    </div>
  )
}

// ── shared ranked table ──
function RankedTable({ list, revKey, unitKey, empty }) {
  return (
    <div style={{ overflowX: 'auto' }}><table className="w-full" style={{ minWidth: 820, borderCollapse: 'collapse' }}>
      <thead><tr style={{ borderBottom: `2px solid ${LINE}` }}><Th>#</Th><Th>Product</Th><Th>Category</Th><Th right>Revenue</Th><Th right>Units</Th><Th right>GM%</Th><Th right>Trend 30d</Th><Th right>Stock</Th><Th>Segment</Th></tr></thead>
      <tbody>{list.map((r, i) => (
        <tr key={r.pid} style={{ borderBottom: `1px solid ${LINE}` }}>
          <Td style={{ color: SUB }}>{i + 1}</Td><Td><ProdCell r={r} /></Td><Td style={{ color: SUB }}>{r.category}</Td>
          <Td right style={{ fontWeight: 700, color: INK }}>{fmtINR(r[revKey])}</Td><Td right>{fmtN(r[unitKey])}</Td>
          <Td right>{r.gm_pct != null ? r.gm_pct + '%' : '—'}</Td><Td right>{trendCell(r.trend_30_30)}</Td>
          <Td right style={{ color: Number(r.stock_on_hand) > 0 ? INK : SUB }}>{fmtN(r.stock_on_hand)}</Td><Td><SegPill s={r.segment} /></Td>
        </tr>))}
        {!list.length && <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: SUB }}>{empty}</td></tr>}</tbody>
    </table></div>
  )
}

// ── WINNERS ──
function Winners({ scoped }) {
  const [range, setRange] = useState('90d')
  const rk = range === '30d' ? 'revenue_30d' : range === '12m' ? 'revenue_12m' : range === 'all' ? 'lifetime_revenue' : 'revenue_90d'
  const uk = range === '30d' ? 'units_30d' : range === '12m' ? 'units_12m' : range === 'all' ? 'lifetime_units' : 'units_90d'
  const list = useMemo(() => scoped.filter(r => Number(r[rk]) > 0).sort((a, b) => Number(b[rk]) - Number(a[rk])).slice(0, 100), [scoped, rk])
  return (
    <div className="space-y-3">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="font-bold text-sm" style={{ color: INK }}>Winners — top revenue ({range})</div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#f3f1ea' }}>{['30d', '90d', '12m', 'all'].map(x => <button key={x} onClick={() => setRange(x)} className="px-2.5 py-1 rounded-md text-xs font-bold" style={{ background: range === x ? '#fff' : 'transparent', color: range === x ? GOLD : SUB }}>{x}</button>)}</div>
            <button onClick={() => dl([['Rank', 'Product', 'Category', 'Revenue', 'Units', 'GM%', 'Trend30', 'Stock', 'Segment'], ...list.map((r, i) => [i + 1, r.product_title, r.category, Math.round(r[rk]), r[uk], r.gm_pct, r.trend_30_30, r.stock_on_hand, r.segment])], `winners_${range}.csv`)} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${LINE}`, color: GOLD }}>Export CSV</button>
          </div>
        </div>
        <RankedTable list={list} revKey={rk} unitKey={uk} empty="No sales in this window." />
      </Card>
    </div>
  )
}

// ── MOVERS ──
function Movers({ scoped }) {
  const rising = useMemo(() => scoped.filter(r => r.trend_30_30 != null && r.trend_30_30 >= 1.5 && r.units_30d >= 3).sort((a, b) => b.trend_30_30 - a.trend_30_30), [scoped])
  const atRisk = useMemo(() => scoped.filter(r => r.trend_30_30 != null && r.trend_30_30 <= 0.5 && r.units_prior_30d > 0).sort((a, b) => a.trend_30_30 - b.trend_30_30), [scoped])
  return (
    <div className="space-y-3">
      <Card><div className="font-bold text-sm mb-2" style={{ color: GOOD }}>📈 Rising — 30d &gt; 1.5× prior 30d</div><RankedTable list={rising} revKey="revenue_30d" unitKey="units_30d" empty="Nothing rising sharply right now." /></Card>
      <Card><div className="font-bold text-sm mb-2" style={{ color: BAD }}>📉 At risk — 30d &lt; 0.5× prior 30d</div><RankedTable list={atRisk} revKey="revenue_30d" unitKey="units_30d" empty="Nothing dropping sharply right now." /></Card>
    </div>
  )
}

// ── NON-MOVERS (kill list) ──
function NonMovers({ scoped }) {
  const [stockOnly, setStockOnly] = useState(false)
  const [minAge, setMinAge] = useState('0')
  const list = useMemo(() => {
    let l = scoped.filter(r => Number(r.units_12m) === 0)
    if (stockOnly) l = l.filter(r => Number(r.stock_on_hand) > 0)
    if (minAge !== '0') l = l.filter(r => Number(r.age_days) >= Number(minAge) * 365)
    return l.sort((a, b) => Number(b.stock_value_cost) - Number(a.stock_value_cost))
  }, [scoped, stockOnly, minAge])
  const lockedValue = list.reduce((s, r) => s + (Number(r.stock_value_cost) || 0), 0)
  const lockedUnits = list.reduce((s, r) => s + (Number(r.stock_on_hand) || 0), 0)
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="font-bold text-sm" style={{ color: INK }}>Non-movers — 0 units in last 12 months (kill list)</div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs" style={{ color: SUB }}><input type="checkbox" checked={stockOnly} onChange={e => setStockOnly(e.target.checked)} /> Has stock only</label>
          <select value={minAge} onChange={e => setMinAge(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg" style={{ border: `1px solid ${LINE}` }}>
            <option value="0">Any age</option><option value="1">≥1y old</option><option value="2">≥2y old</option><option value="4">≥4y old</option>
          </select>
          <button onClick={() => dl([['Product', 'Category', 'Last sold', 'Age (y)', 'Stock', 'Locked @cost', 'Segment'], ...list.map(r => [r.product_title, r.category, r.last_sold_at ? String(r.last_sold_at).slice(0, 10) : 'Never', (r.age_days / 365).toFixed(1), r.stock_on_hand, Math.round(r.stock_value_cost), r.segment])], 'non_movers.csv')} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${LINE}`, color: GOLD }}>Export CSV</button>
        </div>
      </div>
      <div className="text-xs mb-3" style={{ color: SUB }}><b style={{ color: BAD }}>{fmtN(list.length)}</b> items · <b>{fmtN(lockedUnits)}</b> units · <b style={{ color: BAD }}>{fmtINR(lockedValue)}</b> locked at cost</div>
      <div style={{ overflowX: 'auto' }}><table className="w-full" style={{ minWidth: 720, borderCollapse: 'collapse' }}>
        <thead><tr style={{ borderBottom: `2px solid ${LINE}` }}><Th>Product</Th><Th>Category</Th><Th>Last sold</Th><Th right>Age</Th><Th right>Stock</Th><Th right>Locked @cost</Th><Th>Segment</Th></tr></thead>
        <tbody>{list.slice(0, 300).map(r => (
          <tr key={r.pid} style={{ borderBottom: `1px solid ${LINE}` }}>
            <Td><ProdCell r={r} /></Td><Td style={{ color: SUB }}>{r.category}</Td>
            <Td style={{ color: r.last_sold_at ? SUB : BAD }}>{r.last_sold_at ? String(r.last_sold_at).slice(0, 10) : 'Never'}</Td>
            <Td right>{(Number(r.age_days) / 365).toFixed(1)}y</Td><Td right style={{ color: Number(r.stock_on_hand) > 0 ? INK : SUB }}>{fmtN(r.stock_on_hand)}</Td>
            <Td right style={{ fontWeight: 700, color: Number(r.stock_value_cost) > 0 ? BAD : SUB }}>{fmtINR(r.stock_value_cost)}</Td><Td><SegPill s={r.segment} /></Td>
          </tr>))}
          {!list.length && <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: SUB }}>No non-movers match — nothing to kill here. 👍</td></tr>}</tbody>
      </table></div>
      {list.length > 300 && <div className="text-[11px] mt-2" style={{ color: SUB }}>Showing top 300 by locked value — export CSV for the full list.</div>}
    </Card>
  )
}

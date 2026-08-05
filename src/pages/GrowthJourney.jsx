import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supa } from '../lib/supabase'

/* palette (matches FounderDashboard) */
const INK = '#1b1c1a'
const MUTED = 'rgba(27,28,26,0.45)'
const FAINT = 'rgba(27,28,26,0.30)'
const SUCCESS = '#2d7a4f'
const DANGER = '#b4322e'
const GOLD = '#c9a432'
const BORDER = '#ece8df'
const CHANNEL_COLORS = { 'In-store': '#185FA5', 'Online': '#0F6E56', 'Online Assist': '#BA7517', 'Marketplace': '#993556', 'Unknown': '#B4B2A9' }
const CHANNEL_ORDER = ['Online', 'In-store', 'Online Assist', 'Marketplace', 'Unknown']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const inr = (v) => {
  const n = Number(v) || 0
  if (Math.abs(n) >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'
  if (Math.abs(n) >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}
const inrFull = (v) => '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN')
const num = (v) => (Number(v) || 0).toLocaleString('en-IN')
const pct = (v) => (v === null || v === undefined || !isFinite(v)) ? '—'
  : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%'

const Card = ({ children, style }) => (
  <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14, ...style }}>{children}</div>
)
const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, fontWeight: 700, margin: '22px 0 10px' }}>{children}</div>
)
const Pill = ({ active, onClick, children }) => (
  <button onClick={onClick}
    style={{ padding: '5px 12px', fontSize: 12, borderRadius: 7, border: 'none', cursor: 'pointer',
             background: active ? INK : 'transparent', color: active ? '#fff' : MUTED, fontWeight: active ? 700 : 500 }}>{children}</button>
)
const PillGroup = ({ children }) => (
  <div style={{ display: 'flex', padding: 3, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 9 }}>{children}</div>
)
const DeltaText = ({ v }) => {
  if (v === null || v === undefined || !isFinite(v)) return <span style={{ color: FAINT }}>—</span>
  const up = v >= 0
  return <span style={{ color: up ? SUCCESS : DANGER, fontWeight: 600 }}>{up ? '↑' : '↓'} {Math.abs(v * 100).toFixed(1)}%</span>
}

const cagr = (first, last, years) => {
  if (!first || first <= 0 || !last || last <= 0 || years <= 0) return null
  return Math.pow(last / first, 1 / years) - 1
}

const GrowthJourney = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [fy, setFy] = useState(false)
  const [gran, setGran] = useState('yearly')
  const [basis, setBasis] = useState('gross')
  const [selYear, setSelYear] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    const { data: d, error } = await supa.rpc('growth_journey', { p_fy: fy })
    if (error) { setErr(error.message); setLoading(false); return }
    setData(d)
    setLoading(false)
  }, [fy])
  useEffect(() => { load() }, [load])

  const curYear = data?.current_year
  const val = (o) => Number((basis === 'net' ? o?.net : o?.gross)) || 0

  const rows = useMemo(() => {
    if (!data?.years) return []
    const ys = [...data.years].sort((a, b) => a.year - b.year)
    return ys.map((y, i) => {
      const prev = ys[i - 1]
      const rev = val(y), orders = Number(y.orders) || 0
      const aov = orders ? rev / orders : 0
      const prevRev = prev ? val(prev) : null
      const prevOrd = prev ? Number(prev.orders) || 0 : null
      const prevAov = prevOrd ? val(prev) / prevOrd : null
      return {
        year: y.year, orders, rev, aov, channels: y.channels || {},
        partial: y.year === curYear,
        yoyRev: prevRev ? (rev - prevRev) / prevRev : null,
        yoyOrd: prevOrd ? (orders - prevOrd) / prevOrd : null,
        yoyAov: prevAov ? (aov - prevAov) / prevAov : null,
      }
    })
  }, [data, basis, curYear])

  const complete = useMemo(() => rows.filter(r => !r.partial && r.orders >= 50), [rows])

  const summary = useMemo(() => {
    if (complete.length < 2) return null
    const f = complete[0], l = complete[complete.length - 1]
    const span = l.year - f.year
    const yoys = complete.slice(1).map(r => r.yoyRev).filter(v => v !== null && isFinite(v))
    const avgYoy = yoys.length ? yoys.reduce((a, b) => a + b, 0) / yoys.length : null
    const cur = rows.find(r => r.partial)
    let runNaive = null, runAdj = null, elapsed = 0, sameLY = null, paceProj = null, sameYoy = null
    if (cur && data?.months && data?.seasonality?.length) {
      // Actual set of elapsed months in the current bucket (Calendar Jan..N or FY Apr..N).
      const curMonths = data.months.filter(m => m.year === curYear).map(m => m.month)
      elapsed = curMonths.length
      if (elapsed > 0) {
        runNaive = cur.rev / elapsed * 12
        const totShare = data.seasonality.reduce((a, s) => a + Number(s.avg_gross || 0), 0)
        const cumShare = data.seasonality.filter(s => curMonths.includes(s.month)).reduce((a, s) => a + Number(s.avg_gross || 0), 0)
        if (totShare > 0 && cumShare > 0) runAdj = cur.rev / (cumShare / totShare)
        // Pace vs the SAME months of the previous year — most honest short-year projection.
        const lyMonths = data.months.filter(m => m.year === (curYear - 1) && curMonths.includes(m.month))
        sameLY = lyMonths.reduce((a, m) => a + (Number(basis === 'net' ? m.net : m.gross) || 0), 0)
        if (sameLY > 0) {
          sameYoy = (cur.rev - sameLY) / sameLY
          if (l.rev > 0) paceProj = l.rev * (cur.rev / sameLY)
        }
      }
    }
    return {
      revCagr: cagr(f.rev, l.rev, span), aovCagr: cagr(f.aov, l.aov, span),
      ordCagr: cagr(f.orders, l.orders, span), avgYoy, mult: f.rev > 0 ? l.rev / f.rev : null,
      first: f, last: l, span, runNaive, runAdj, elapsed, cur, sameLY, paceProj, sameYoy,
    }
  }, [complete, rows, data, curYear])

  const seas = useMemo(() => {
    if (!data?.seasonality?.length) return []
    const arr = data.seasonality.map(s => ({ month: s.month, avg: Number(s.avg_gross) || 0 }))
    const tot = arr.reduce((a, s) => a + s.avg, 0) || 1
    const sorted = [...arr].sort((a, b) => b.avg - a.avg)
    const peak = new Set(sorted.slice(0, 3).map(s => s.month))
    const low = new Set(sorted.slice(-3).map(s => s.month))
    return arr.map(s => ({ ...s, share: s.avg / tot, tier: peak.has(s.month) ? 'Peak' : low.has(s.month) ? 'Low' : 'Base' }))
  }, [data])

  const channelsPresent = useMemo(() => {
    const set = new Set()
    rows.forEach(r => Object.keys(r.channels).forEach(c => set.add(c)))
    return CHANNEL_ORDER.filter(c => set.has(c))
  }, [rows])

  const exportCsv = () => {
    const head = ['Year', 'Orders', 'Orders YoY %', basis === 'net' ? 'Net Revenue' : 'Gross Revenue', 'Revenue YoY %', 'AOV', 'AOV YoY %']
    const lines = [head.join(',')]
    rows.forEach(r => lines.push([
      r.year + (r.partial ? ' (YTD)' : ''), r.orders,
      r.yoyOrd === null ? '' : (r.yoyOrd * 100).toFixed(1),
      Math.round(r.rev), r.yoyRev === null ? '' : (r.yoyRev * 100).toFixed(1),
      Math.round(r.aov), r.yoyAov === null ? '' : (r.yoyAov * 100).toFixed(1),
    ].join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `hilo-growth-journey-${basis}-${fy ? 'FY' : 'CY'}.csv`
    a.click()
  }

  const monthlyRows = useMemo(() => {
    if (!data?.months) return []
    const yr = selYear || curYear
    const ms = data.months.filter(m => m.year === yr).sort((a, b) => a.month - b.month)
    return ms.map((m, i) => {
      const prev = ms[i - 1]
      const rev = Number(basis === 'net' ? m.net : m.gross) || 0
      const orders = Number(m.orders) || 0
      const prevRev = prev ? Number(basis === 'net' ? prev.net : prev.gross) || 0 : null
      const lyRow = data.months.find(x => x.year === (yr - 1) && x.month === m.month)
      const ly = lyRow ? (Number(basis === 'net' ? lyRow.net : lyRow.gross) || 0) : null
      const tier = seas.find(s => s.month === m.month)?.tier
      return { month: m.month, orders, rev, aov: orders ? rev / orders : 0, mom: prevRev ? (rev - prevRev) / prevRev : null,
               tier, ly, yoy: (ly && ly > 0) ? (rev - ly) / ly : null }
    })
  }, [data, selYear, curYear, basis, seas])

  if (loading) return <div style={{ color: MUTED, fontSize: 14, padding: '40px 0' }}>Loading the growth journey…</div>
  if (err) return <div style={{ background: '#fdecea', border: '1px solid #f5c6c2', color: DANGER, padding: 12, borderRadius: 10, fontSize: 13 }}>Couldn't load: {err}</div>
  if (!rows.length) return <div style={{ color: MUTED, fontSize: 14, padding: '40px 0' }}>No data yet.</div>

  const maxRev = Math.max(...rows.map(r => r.rev), 1)
  const maxAov = Math.max(...rows.map(r => r.aov), 1)
  const maxOrd = Math.max(...rows.map(r => r.orders), 1)
  const maxSeas = Math.max(...seas.map(s => s.avg), 1)

  const CW = 720, CH = 240, PADX = 34, PADY = 24, n = rows.length
  const bw = (CW - PADX * 2) / n
  const yRev = (v) => CH - PADY - (v / maxRev) * (CH - PADY * 2)
  const yAov = (v) => CH - PADY - (v / maxAov) * (CH - PADY * 2)
  const aovPts = rows.map((r, i) => [PADX + bw * i + bw / 2, yAov(r.aov)])

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 4 }}>
        <PillGroup><Pill active={gran === 'yearly'} onClick={() => setGran('yearly')}>Yearly</Pill><Pill active={gran === 'monthly'} onClick={() => setGran('monthly')}>Monthly</Pill></PillGroup>
        <PillGroup><Pill active={basis === 'gross'} onClick={() => setBasis('gross')}>Gross</Pill><Pill active={basis === 'net'} onClick={() => setBasis('net')}>Net (post-GST)</Pill></PillGroup>
        <PillGroup><Pill active={!fy} onClick={() => setFy(false)}>Calendar</Pill><Pill active={fy} onClick={() => setFy(true)}>Financial (Apr–Mar)</Pill></PillGroup>
        {gran === 'monthly' && (
          <select value={selYear || curYear} onChange={e => setSelYear(Number(e.target.value))}
            style={{ fontSize: 12, padding: '6px 10px', border: `1px solid ${BORDER}`, borderRadius: 8, color: INK, background: '#fff' }}>
            {rows.map(r => <option key={r.year} value={r.year}>{r.year}{r.partial ? ' (YTD)' : ''}</option>)}
          </select>
        )}
        <button onClick={exportCsv}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: '#fff', color: INK, cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export CSV
        </button>
      </div>

      {summary && (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', marginTop: 16 }}>
          <Card style={{ background: '#fbf9f3', borderColor: GOLD }}>
            <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, fontWeight: 700 }}>Revenue growth</div>
            <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 24, fontWeight: 800, color: INK, marginTop: 4 }}>{summary.mult ? summary.mult.toFixed(1) + '×' : '—'}</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{summary.first.year}→{summary.last.year} · CAGR {pct(summary.revCagr)}</div>
          </Card>
          <Card>
            <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, fontWeight: 700 }}>AOV growth</div>
            <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 24, fontWeight: 800, color: INK, marginTop: 4 }}>{inr(summary.last.aov)}</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>from {inr(summary.first.aov)} · CAGR {pct(summary.aovCagr)}</div>
          </Card>
          <Card>
            <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, fontWeight: 700 }}>Orders (last full yr)</div>
            <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 24, fontWeight: 800, color: INK, marginTop: 4 }}>{num(summary.last.orders)}</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>CAGR {pct(summary.ordCagr)} · avg YoY rev {pct(summary.avgYoy)}</div>
          </Card>
          {summary.cur && (
            <Card>
              <div style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, fontWeight: 700 }}>{summary.cur.year} projection</div>
              <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 24, fontWeight: 800, color: INK, marginTop: 4 }}>{inr(summary.paceProj || summary.runAdj || summary.runNaive)}</div>
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
                {summary.paceProj && summary.last.rev > 0 && <>vs {summary.last.year} {inr(summary.last.rev)} · <DeltaText v={(summary.paceProj - summary.last.rev) / summary.last.rev} /><br /></>}
                <span style={{ color: FAINT }}>pace: first {summary.elapsed}mo {summary.sameYoy != null && <>YoY <DeltaText v={summary.sameYoy} /></>} · seas-adj {inr(summary.runAdj)}</span>
              </div>
            </Card>
          )}
        </div>
      )}

      {gran === 'yearly' ? (
        <>
          <SectionLabel>Revenue &amp; AOV by year · {basis === 'net' ? 'net' : 'gross'}</SectionLabel>
          <Card>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: MUTED, marginBottom: 6 }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: GOLD, borderRadius: 2, marginRight: 5 }} />Revenue (bars)</span>
              <span><span style={{ display: 'inline-block', width: 14, height: 3, background: INK, verticalAlign: 'middle', marginRight: 5 }} />AOV (line)</span>
            </div>
            <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto' }}>
              {rows.map((r, i) => {
                const h = (CH - PADY) - yRev(r.rev)
                return (
                  <g key={r.year}>
                    <rect x={PADX + bw * i + bw * 0.16} y={yRev(r.rev)} width={bw * 0.68} height={Math.max(h, 0)}
                      fill={r.partial ? '#e4cf7a' : GOLD} rx={3} />
                    <text x={PADX + bw * i + bw / 2} y={CH - 6} textAnchor="middle" fontSize="10" fill={MUTED}>{r.year}{r.partial ? '*' : ''}</text>
                    <text x={PADX + bw * i + bw / 2} y={yRev(r.rev) - 5} textAnchor="middle" fontSize="9.5" fill={INK} fontWeight="700">{inr(r.rev)}</text>
                  </g>
                )
              })}
              <polyline points={aovPts.map(p => p.join(',')).join(' ')} fill="none" stroke={INK} strokeWidth="2" />
              {aovPts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={INK} />)}
            </svg>
            <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>* current year to date</div>
          </Card>

          <SectionLabel>Orders by year</SectionLabel>
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
              {rows.map(r => (
                <div key={r.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <div style={{ fontSize: 10, color: INK, fontWeight: 700 }}>{num(r.orders)}</div>
                  <div style={{ width: '70%', background: r.partial ? '#c7d7e8' : CHANNEL_COLORS['In-store'], borderRadius: '3px 3px 0 0', height: `${Math.max((r.orders / maxOrd) * 90, 2)}%`, marginTop: 3 }} />
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{r.year}</div>
                </div>
              ))}
            </div>
          </Card>

          <SectionLabel>Channel mix over time · {basis === 'net' ? 'net' : 'gross'}</SectionLabel>
          <Card>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: MUTED, marginBottom: 10 }}>
              {channelsPresent.map(c => <span key={c}><span style={{ display: 'inline-block', width: 10, height: 10, background: CHANNEL_COLORS[c], borderRadius: 2, marginRight: 5 }} />{c}</span>)}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150 }}>
              {rows.map(r => {
                const tot = channelsPresent.reduce((a, c) => a + val(r.channels[c]), 0) || 1
                return (
                  <div key={r.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ width: '72%', display: 'flex', flexDirection: 'column-reverse', height: '90%', borderRadius: '3px 3px 0 0', overflow: 'hidden' }}>
                      {channelsPresent.map(c => {
                        const share = val(r.channels[c]) / tot
                        return share > 0 ? <div key={c} title={`${c}: ${(share * 100).toFixed(0)}%`} style={{ height: `${share * 100}%`, background: CHANNEL_COLORS[c] }} /> : null
                      })}
                    </div>
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{r.year}</div>
                  </div>
                )
              })}
            </div>
          </Card>

          <SectionLabel>Seasonality · avg month, last 5 years</SectionLabel>
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }}>
              {seas.map(s => (
                <div key={s.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: 9, color: MUTED }}>{(s.share * 100).toFixed(0)}%</div>
                  <div style={{ width: '68%', borderRadius: '3px 3px 0 0', height: `${Math.max((s.avg / maxSeas) * 88, 2)}%`,
                    background: s.tier === 'Peak' ? GOLD : s.tier === 'Low' ? '#d9d4c6' : CHANNEL_COLORS['In-store'] }} />
                  <div style={{ fontSize: 9.5, color: MUTED, marginTop: 4 }}>{MONTHS[s.month - 1]}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 10 }}>
              <span style={{ color: GOLD, fontWeight: 700 }}>▮ Peak</span> {seas.filter(s => s.tier === 'Peak').map(s => MONTHS[s.month - 1]).join(', ')} ·
              <span style={{ marginLeft: 6 }}>top 2 months = {(seas.slice().sort((a, b) => b.avg - a.avg).slice(0, 2).reduce((a, s) => a + s.share, 0) * 100).toFixed(0)}% of the year</span> ·
              <span style={{ color: MUTED, marginLeft: 6 }}>Low: {seas.filter(s => s.tier === 'Low').map(s => MONTHS[s.month - 1]).join(', ')}</span>
            </div>
          </Card>

          <SectionLabel>Year-by-year</SectionLabel>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: FAINT, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#faf8f2' }}>
                  <th align="left" style={{ padding: '9px 12px' }}>Year</th>
                  <th align="right" style={{ padding: '9px 12px' }}>Orders</th>
                  <th align="right" style={{ padding: '9px 12px' }}>Orders YoY</th>
                  <th align="right" style={{ padding: '9px 12px' }}>{basis === 'net' ? 'Net rev' : 'Gross rev'}</th>
                  <th align="right" style={{ padding: '9px 12px' }}>Rev YoY</th>
                  <th align="right" style={{ padding: '9px 12px' }}>AOV</th>
                  <th align="right" style={{ padding: '9px 12px' }}>AOV YoY</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.year} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: INK }}>{r.year}{r.partial ? ' YTD' : ''}</td>
                    <td align="right" style={{ padding: '9px 12px' }}>{num(r.orders)}</td>
                    <td align="right" style={{ padding: '9px 12px' }}><DeltaText v={r.yoyOrd} /></td>
                    <td align="right" style={{ padding: '9px 12px', fontWeight: 700 }}>{inr(r.rev)}</td>
                    <td align="right" style={{ padding: '9px 12px' }}><DeltaText v={r.yoyRev} /></td>
                    <td align="right" style={{ padding: '9px 12px' }}>{inrFull(r.aov)}</td>
                    <td align="right" style={{ padding: '9px 12px' }}><DeltaText v={r.yoyAov} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
        <>
          <SectionLabel>Monthly · {selYear || curYear} · {basis === 'net' ? 'net' : 'gross'}</SectionLabel>
          <Card>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: MUTED, marginBottom: 6 }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: GOLD, borderRadius: 2, marginRight: 5 }} />{selYear || curYear}</span>
              <span><span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2px dashed ${MUTED}`, verticalAlign: 'middle', marginRight: 5 }} />{(selYear || curYear) - 1} · same months</span>
            </div>
            {(() => {
              const mr = monthlyRows
              const mx = Math.max(...mr.map(x => Math.max(x.rev, x.ly || 0)), 1)
              const W = 720, H = 210, PX = 26, PY = 22, nn = mr.length || 1
              const bw2 = (W - PX * 2) / nn
              const yv = (v) => H - PY - (v / mx) * (H - PY * 2)
              const lyPts = mr.map((m, i) => (m.ly != null ? [PX + bw2 * i + bw2 / 2, yv(m.ly)] : null)).filter(Boolean)
              return (
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
                  {mr.map((m, i) => {
                    const h = (H - PY) - yv(m.rev)
                    return (
                      <g key={m.month}>
                        <rect x={PX + bw2 * i + bw2 * 0.2} y={yv(m.rev)} width={bw2 * 0.6} height={Math.max(h, 0)}
                          fill={m.tier === 'Peak' ? GOLD : m.tier === 'Low' ? '#d9d4c6' : '#e0c964'} rx={2} />
                        <text x={PX + bw2 * i + bw2 / 2} y={yv(m.rev) - 4} textAnchor="middle" fontSize="8" fill={INK} fontWeight="700">{inr(m.rev)}</text>
                        <text x={PX + bw2 * i + bw2 / 2} y={H - 5} textAnchor="middle" fontSize="9.5" fill={MUTED}>{MONTHS[m.month - 1]}</text>
                      </g>
                    )
                  })}
                  {lyPts.length > 1 && <polyline points={lyPts.map(p => p.join(',')).join(' ')} fill="none" stroke={MUTED} strokeWidth="1.5" strokeDasharray="4 3" />}
                  {lyPts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill={MUTED} />)}
                </svg>
              )
            })()}
          </Card>
          <Card style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: FAINT, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#faf8f2' }}>
                  <th align="left" style={{ padding: '9px 12px' }}>Month</th>
                  <th align="left" style={{ padding: '9px 12px' }}>Season</th>
                  <th align="right" style={{ padding: '9px 12px' }}>Orders</th>
                  <th align="right" style={{ padding: '9px 12px' }}>{basis === 'net' ? 'Net rev' : 'Gross rev'}</th>
                  <th align="right" style={{ padding: '9px 12px' }}>MoM</th>
                  <th align="right" style={{ padding: '9px 12px' }}>YoY</th>
                  <th align="right" style={{ padding: '9px 12px' }}>AOV</th>
                </tr>
              </thead>
              <tbody>
                {monthlyRows.map(m => (
                  <tr key={m.month} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: INK }}>{MONTHS[m.month - 1]}</td>
                    <td style={{ padding: '9px 12px', color: m.tier === 'Peak' ? GOLD : MUTED, fontWeight: m.tier === 'Peak' ? 700 : 500 }}>{m.tier === 'Base' ? '—' : m.tier}</td>
                    <td align="right" style={{ padding: '9px 12px' }}>{num(m.orders)}</td>
                    <td align="right" style={{ padding: '9px 12px', fontWeight: 700 }}>{inr(m.rev)}</td>
                    <td align="right" style={{ padding: '9px 12px' }}><DeltaText v={m.mom} /></td>
                    <td align="right" style={{ padding: '9px 12px' }}><DeltaText v={m.yoy} /></td>
                    <td align="right" style={{ padding: '9px 12px' }}>{inrFull(m.aov)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
      <div style={{ height: 30 }} />
    </div>
  )
}

export default GrowthJourney

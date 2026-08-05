import React, { useState, useEffect, useCallback } from 'react'
import { supa } from '../lib/supabase'
import Icon from '../components/Icon'
import GrowthJourney from './GrowthJourney'

/* ── palette ─────────────────────────────────────────────────────── */
const INK = '#1b1c1a'
const MUTED = 'rgba(27,28,26,0.45)'
const FAINT = 'rgba(27,28,26,0.30)'
const SUCCESS = '#2d7a4f'
const DANGER = '#b4322e'
const WARNING = '#b9831f'
const GOLD = '#c9a432'
const BORDER = '#ece8df'
const CHANNEL_COLORS = { 'In-store': '#185FA5', 'Online': '#0F6E56', 'Online Assist': '#BA7517', 'Marketplace': '#993556', 'Unknown': '#B4B2A9' }

const PREV_LABEL = { today: 'vs last week', yesterday: 'vs prior day', week: 'vs last week', month: 'vs last month', custom: 'vs prior period' }
const SUBLABEL  = { today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'This month', custom: 'Selected range' }

/* ── formatters ──────────────────────────────────────────────────── */
const inr = (v) => {
  const n = Number(v) || 0
  if (Math.abs(n) >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'
  if (Math.abs(n) >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L'
  return '₹' + Math.round(n).toLocaleString('en-IN')
}
const num = (v) => (Number(v) || 0).toLocaleString('en-IN')
const deltaPct = (cur, prev) => {
  cur = Number(cur) || 0; prev = Number(prev) || 0
  if (prev <= 0) return null
  return Math.round(((cur - prev) / prev) * 100)
}
const isoDay = (d) => d.toISOString().slice(0, 10)

/* ── building blocks ─────────────────────────────────────────────── */
const Card = ({ children, onClick, style }) => (
  <div onClick={onClick}
    style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14,
             cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow .15s', ...style }}
    onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = '0 6px 20px rgba(27,28,26,0.08)' }}
    onMouseLeave={e => { if (onClick) e.currentTarget.style.boxShadow = 'none' }}>
    {children}
  </div>
)
const CardLabel = ({ icon, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, letterSpacing: '0.09em',
                textTransform: 'uppercase', color: MUTED, marginBottom: 10, fontWeight: 700 }}>
    {icon && <Icon name={icon} cls="w-3.5 h-3.5" />}{children}
  </div>
)
const Delta = ({ cur, prev, label }) => {
  const d = deltaPct(cur, prev)
  if (d === null) return <div style={{ fontSize: 11, color: FAINT }}>no prior baseline</div>
  const up = d >= 0
  return <div style={{ fontSize: 11, color: up ? SUCCESS : DANGER }}>{up ? '↑' : '↓'} {Math.abs(d)}% {label}</div>
}
const BigNum = ({ children, color }) => (
  <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em',
                color: color || INK, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>{children}</div>
)
const SubLabel = ({ children }) => (
  <div style={{ fontSize: 10.5, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</div>
)

/* ── period control ──────────────────────────────────────────────── */
const PeriodControl = ({ period, setPeriod, cStart, cEnd, setCStart, setCEnd, onApplyCustom }) => {
  const pill = (id, label) => (
    <button key={id} onClick={() => setPeriod(id)}
      style={{ padding: '5px 12px', fontSize: 12, borderRadius: 7, border: 'none', cursor: 'pointer',
               background: period === id ? INK : 'transparent', color: period === id ? '#fff' : MUTED,
               fontWeight: period === id ? 700 : 500 }}>{label}</button>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', padding: 3, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 9 }}>
        {pill('today', 'Today')}{pill('yesterday', 'Yesterday')}{pill('week', 'This week')}{pill('month', 'This month')}{pill('custom', 'Custom')}
      </div>
      {period === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={cStart} max={cEnd || undefined} onChange={e => setCStart(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', border: `1px solid ${BORDER}`, borderRadius: 7, color: INK }} />
          <span style={{ color: FAINT, fontSize: 12 }}>–</span>
          <input type="date" value={cEnd} min={cStart || undefined} onChange={e => setCEnd(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', border: `1px solid ${BORDER}`, borderRadius: 7, color: INK }} />
          <button onClick={onApplyCustom} disabled={!cStart || !cEnd}
            style={{ fontSize: 12, padding: '6px 12px', borderRadius: 7, border: 'none', cursor: cStart && cEnd ? 'pointer' : 'not-allowed',
                     background: cStart && cEnd ? GOLD : '#e7e3d8', color: cStart && cEnd ? '#1b1c1a' : FAINT, fontWeight: 700 }}>Apply</button>
        </div>
      )}
    </div>
  )
}

/* ── component ───────────────────────────────────────────────────── */
const FounderDashboard = ({ onNavigate }) => {
  const [m, setM] = useState(null)
  const [m2, setM2] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [period, setPeriod] = useState('today')
  const [view, setView] = useState('growth')
  const [g, setG] = useState(null)   // growth detail
  const [o, setO] = useState(null)   // ops detail   // 'growth' | 'ops'
  const today = new Date()
  const weekAgo = new Date(Date.now() - 6 * 864e5)
  const [cStart, setCStart] = useState(isoDay(weekAgo))
  const [cEnd, setCEnd] = useState(isoDay(today))

  const load = useCallback(async (pd, s, e) => {
    setLoading(true); setErr(null)
    const args = pd === 'custom' ? { p_period: 'custom', p_start: s, p_end: e } : { p_period: pd }
    const [mRes, m2Res, iRes, gRes, oRes] = await Promise.all([
      supa.rpc('founder_dashboard_metrics', args),
      supa.rpc('founder_dashboard_metrics_v2', args),
      supa.rpc('founder_attention_items'),
      supa.rpc('founder_growth_detail',     args),
      supa.rpc('founder_ops_detail',        args),
    ])
    if (mRes.error) { setErr(mRes.error.message); setLoading(false); return }
    setM(mRes.data || null)
    setM2(m2Res.error ? null : (m2Res.data || null))
    setItems(iRes.error ? [] : (iRes.data || []))
    setG(gRes.error ? null : (gRes.data || null))
    setO(oRes.error ? null : (oRes.data || null))
    setLoading(false)
  }, [])

  // Refetch on preset change; custom waits for Apply.
  useEffect(() => { if (period !== 'custom') load(period) }, [period, load])
  // First entry into custom mode: load the default range immediately.
  useEffect(() => { if (period === 'custom' && cStart && cEnd) load('custom', cStart, cEnd) }, [period]) // eslint-disable-line

  const refresh = () => period === 'custom' ? load('custom', cStart, cEnd) : load(period)

  const go = (target) => {
    if (!onNavigate) return
    const idx = String(target).indexOf(':')
    const tab = idx >= 0 ? String(target).slice(0, idx) : String(target)
    if (tab === 'production') onNavigate('production')
    else if (tab === 'pos-dues') { window._posInitialView = 'dues'; onNavigate('pos') }
    else if (tab === 'leads') onNavigate('leads')
  }

  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
  const fmtRange = () => {
    const f = (s) => new Date(s + 'T00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    return `${f(cStart)} – ${f(cEnd)}`
  }
  const sub = period === 'custom' ? fmtRange() : SUBLABEL[period]
  const prevLabel = PREV_LABEL[period]

  return (
    <div className="fade-in p-4 sm:p-6" style={{ maxWidth: 1180 }}>
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: FAINT, marginBottom: 4 }}>Hilo Design · Founder View</div>
          <h1 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', color: INK, lineHeight: 1.1 }} className="sm:text-3xl">{dateStr}</h1>
        </div>
        <div className="flex items-center gap-2">
          {view !== 'journey' && (
          <PeriodControl period={period} setPeriod={setPeriod} cStart={cStart} cEnd={cEnd}
            setCStart={setCStart} setCEnd={setCEnd} onApplyCustom={() => load('custom', cStart, cEnd)} />
          )}
          <button onClick={refresh} title="Refresh"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK, padding: 8,
                     background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 9, cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }}>
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: `1px solid ${BORDER}` }}>
        {[['growth','Growth'],['ops','Ops'],['journey','Growth Journey']].map(([id,label]) => (
          <button key={id} onClick={() => setView(id)}
            style={{ padding: '8px 16px', fontSize: 13.5, fontWeight: view===id?800:600, fontFamily:'Manrope,sans-serif',
                     color: view===id?INK:MUTED, background:'transparent', border:'none', cursor:'pointer',
                     borderBottom: view===id?`2px solid ${GOLD}`:'2px solid transparent', marginBottom:-1 }}>{label}</button>
        ))}
      </div>

      {view === 'journey' && <GrowthJourney />}

      {err && <div style={{ background: '#fdecea', border: '1px solid #f5c6c2', color: DANGER, padding: 12, borderRadius: 10, marginBottom: 16, fontSize: 13 }}>Couldn't load dashboard: {err}</div>}
      {view !== 'journey' && (!m && loading) && <div style={{ color: MUTED, fontSize: 14, padding: '40px 0' }}>Loading your day…</div>}

      {m && <>
        {/* ════════════ GROWTH ════════════ */}
        {view === 'growth' && <>
          <SectionLabel>Sales · gross + net post-GST · {sub}</SectionLabel>
          {m2?.channels && (
            <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
              {m2.channels.map(c => (
                <Card key={c.channel} onClick={() => onNavigate && onNavigate('orders')}
                  style={c.channel === 'Total' ? { background: '#fbf9f3', borderColor: GOLD } : {}}>
                  <CardLabel icon={c.channel === 'Total' ? 'money' : 'bag'}>{c.channel} Sales</CardLabel>
                  <SubLabel>{sub} · net</SubLabel>
                  <BigNum>{inr(c.period_rev)}</BigNum>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                    <span style={{ color: FAINT }}>gross</span> {inr(c.period_gross || c.period_rev)}
                    <span style={{ color: FAINT, marginLeft: 8 }}>·</span>
                    <span style={{ marginLeft: 8 }}>{num(c.period_orders)} {c.period_orders === 1 ? 'order' : 'orders'}</span>
                  </div>
                  <Delta cur={c.period_rev} prev={c.prev_rev} label={prevLabel} />
                  <div style={{ height: 8 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 8, borderTop: `1px dashed ${BORDER}` }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9.5, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>MTD (net)</div>
                      <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 13.5, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>{inr(c.mtd_rev)}</div>
                      <div style={{ fontSize: 10, color: FAINT }}>gross {inr(c.mtd_gross || c.mtd_rev)}</div>
                      <div style={{ fontSize: 10, color: FAINT }}>{num(c.mtd_orders)} orders</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9.5, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>YTD FY (net)</div>
                      <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 13.5, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>{inr(c.ytd_rev)}</div>
                      <div style={{ fontSize: 10, color: FAINT }}>gross {inr(c.ytd_gross || c.ytd_rev)}</div>
                      <div style={{ fontSize: 10, color: FAINT }}>{num(c.ytd_orders)} orders</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Ad spend remains its own row (kept compact) */}
          {Number(m.ad_spend.spend) > 0 && (
            <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))' }}>
              <Card onClick={() => onNavigate && onNavigate('growth')}>
                <CardLabel icon="trend">Ad spend · ROAS</CardLabel>
                <SubLabel>{sub} spend</SubLabel>
                <BigNum>{inr(m.ad_spend.spend)}</BigNum>
                <div style={{ fontSize: 10.5, color: FAINT, marginTop: 8 }}>Attributed revenue</div>
                <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 16, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>{inr(m.ad_spend.attributed_revenue)}</div>
                <span style={{ display: 'inline-block', marginTop: 6, padding: '2px 9px', background: '#e7f3ec', color: SUCCESS, fontSize: 11.5, fontWeight: 700, borderRadius: 5 }}>
                  ROAS {(Number(m.ad_spend.attributed_revenue) / Number(m.ad_spend.spend)).toFixed(1)}×
                </span>
              </Card>
            </div>
          )}

          {/* Store Walkins — per-stylist + per-source */}
          {m2?.walkins && (
            <>
              <SectionLabel>Store walkins · {sub}</SectionLabel>
              <div className="grid gap-2.5 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
                <Card><CardLabel icon="people">Walkins</CardLabel><BigNum>{num(m2.walkins.total)}</BigNum><div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>this period</div></Card>
                <Card><CardLabel icon="check">Converted</CardLabel><BigNum color={SUCCESS}>{num(m2.walkins.converted)}</BigNum><div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>{m2.walkins.total > 0 ? Math.round(100 * m2.walkins.converted / m2.walkins.total) + '% conversion' : '—'}</div></Card>
                <Card><CardLabel icon="money">Revenue</CardLabel><BigNum>{inr(m2.walkins.revenue)}</BigNum><div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>from converted</div></Card>
              </div>
              <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
                <Card>
                  <CardLabel icon="people">By stylist</CardLabel>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead><tr style={{ color: FAINT, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <th align="left" style={{ padding: '4px 6px' }}>Stylist</th>
                      <th align="right" style={{ padding: '4px 6px' }}>Walkins</th>
                      <th align="right" style={{ padding: '4px 6px' }}>Conv</th>
                      <th align="right" style={{ padding: '4px 6px' }}>Revenue</th>
                    </tr></thead>
                    <tbody>
                      {(m2.walkins.by_stylist || []).map((r, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '5px 6px', color: INK }}>{r.name}</td>
                          <td align="right" style={{ padding: '5px 6px', color: INK, fontVariantNumeric: 'tabular-nums' }}>{num(r.walkins)}</td>
                          <td align="right" style={{ padding: '5px 6px', color: r.conversion_pct >= 50 ? SUCCESS : MUTED, fontVariantNumeric: 'tabular-nums' }}>{r.conversion_pct}%</td>
                          <td align="right" style={{ padding: '5px 6px', color: INK, fontVariantNumeric: 'tabular-nums' }}>{inr(r.revenue)}</td>
                        </tr>
                      ))}
                      {(m2.walkins.by_stylist || []).length === 0 && (
                        <tr><td colSpan={4} style={{ padding: '12px 6px', color: FAINT, textAlign: 'center', fontSize: 12 }}>No walkins in this period</td></tr>
                      )}
                    </tbody>
                  </table>
                </Card>
                <Card>
                  <CardLabel icon="funnel">By source</CardLabel>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead><tr style={{ color: FAINT, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <th align="left" style={{ padding: '4px 6px' }}>Source</th>
                      <th align="right" style={{ padding: '4px 6px' }}>Walkins</th>
                      <th align="right" style={{ padding: '4px 6px' }}>Conv</th>
                    </tr></thead>
                    <tbody>
                      {(m2.walkins.by_source || []).map((r, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '5px 6px', color: INK }}>{r.source}</td>
                          <td align="right" style={{ padding: '5px 6px', color: INK, fontVariantNumeric: 'tabular-nums' }}>{num(r.walkins)}</td>
                          <td align="right" style={{ padding: '5px 6px', color: r.conversion_pct >= 50 ? SUCCESS : MUTED, fontVariantNumeric: 'tabular-nums' }}>{r.conversion_pct}%</td>
                        </tr>
                      ))}
                      {(m2.walkins.by_source || []).length === 0 && (
                        <tr><td colSpan={3} style={{ padding: '12px 6px', color: FAINT, textAlign: 'center', fontSize: 12 }}>—</td></tr>
                      )}
                    </tbody>
                  </table>
                </Card>
              </div>
            </>
          )}

          {/* Online Assist Leads — per-stylist + per-source */}
          {m2?.assist_leads && (
            <>
              <SectionLabel>Online Assist leads · {sub}</SectionLabel>
              <div className="grid gap-2.5 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
                <Card><CardLabel icon="funnel">Leads</CardLabel><BigNum>{num(m2.assist_leads.total)}</BigNum></Card>
                <Card><CardLabel icon="check">Qualified</CardLabel><BigNum color={SUCCESS}>{num(m2.assist_leads.qualified)}</BigNum><div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>{m2.assist_leads.total > 0 ? Math.round(100 * m2.assist_leads.qualified / m2.assist_leads.total) + '%' : '—'}</div></Card>
                <Card><CardLabel icon="trend">High quality</CardLabel><BigNum color={GOLD}>{num(m2.assist_leads.high_quality)}</BigNum></Card>
                <Card><CardLabel icon="bag">Converted</CardLabel><BigNum color={SUCCESS}>{num(m2.assist_leads.converted)}</BigNum><div style={{ fontSize: 11, color: FAINT, marginTop: 4 }}>{m2.assist_leads.total > 0 ? (100 * m2.assist_leads.converted / m2.assist_leads.total).toFixed(1) + '% conv' : '—'}</div></Card>
                <Card><CardLabel icon="money">Revenue</CardLabel><BigNum>{inr(m2.assist_leads.revenue)}</BigNum></Card>
              </div>
              <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
                <Card>
                  <CardLabel icon="people">By stylist</CardLabel>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead><tr style={{ color: FAINT, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <th align="left" style={{ padding: '4px 6px' }}>Stylist</th>
                      <th align="right" style={{ padding: '4px 6px' }}>Leads</th>
                      <th align="right" style={{ padding: '4px 6px' }}>Qual</th>
                      <th align="right" style={{ padding: '4px 6px' }}>High</th>
                      <th align="right" style={{ padding: '4px 6px' }}>Conv</th>
                    </tr></thead>
                    <tbody>
                      {(m2.assist_leads.by_stylist || []).map((r, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '5px 6px', color: INK }}>{r.name}</td>
                          <td align="right" style={{ padding: '5px 6px', color: INK, fontVariantNumeric: 'tabular-nums' }}>{num(r.leads)}</td>
                          <td align="right" style={{ padding: '5px 6px', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{num(r.qualified)}</td>
                          <td align="right" style={{ padding: '5px 6px', color: GOLD, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{num(r.high_quality)}</td>
                          <td align="right" style={{ padding: '5px 6px', color: r.conversion_pct >= 5 ? SUCCESS : MUTED, fontVariantNumeric: 'tabular-nums' }}>{r.conversion_pct}%</td>
                        </tr>
                      ))}
                      {(m2.assist_leads.by_stylist || []).length === 0 && (
                        <tr><td colSpan={5} style={{ padding: '12px 6px', color: FAINT, textAlign: 'center', fontSize: 12 }}>No assist leads in this period</td></tr>
                      )}
                    </tbody>
                  </table>
                </Card>
                <Card>
                  <CardLabel icon="funnel">By source</CardLabel>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead><tr style={{ color: FAINT, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <th align="left" style={{ padding: '4px 6px' }}>Source</th>
                      <th align="right" style={{ padding: '4px 6px' }}>Leads</th>
                      <th align="right" style={{ padding: '4px 6px' }}>Qual</th>
                      <th align="right" style={{ padding: '4px 6px' }}>High</th>
                      <th align="right" style={{ padding: '4px 6px' }}>Conv</th>
                    </tr></thead>
                    <tbody>
                      {(m2.assist_leads.by_source || []).map((r, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '5px 6px', color: INK }}>{r.source}</td>
                          <td align="right" style={{ padding: '5px 6px', color: INK, fontVariantNumeric: 'tabular-nums' }}>{num(r.leads)}</td>
                          <td align="right" style={{ padding: '5px 6px', color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{num(r.qualified)}</td>
                          <td align="right" style={{ padding: '5px 6px', color: GOLD, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{num(r.high_quality)}</td>
                          <td align="right" style={{ padding: '5px 6px', color: r.conversion_pct >= 5 ? SUCCESS : MUTED, fontVariantNumeric: 'tabular-nums' }}>{r.conversion_pct}%</td>
                        </tr>
                      ))}
                      {(m2.assist_leads.by_source || []).length === 0 && (
                        <tr><td colSpan={5} style={{ padding: '12px 6px', color: FAINT, textAlign: 'center', fontSize: 12 }}>—</td></tr>
                      )}
                    </tbody>
                  </table>
                </Card>
              </div>
            </>
          )}

          <SectionLabel>Pipeline & customers · {sub}</SectionLabel>
          <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))' }}>
            <Card onClick={() => onNavigate && onNavigate('leads')}>
              <CardLabel icon="funnel">Leads</CardLabel>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <BigNum>{num(m.leads.value)}</BigNum>
                <span style={{ fontSize: 11, color: FAINT }}>{sub.toLowerCase()}</span>
              </div>
              <Delta cur={m.leads.value} prev={m.leads.prev} label={prevLabel} />
              <StylistList list={m.leads.by_stylist} />
            </Card>
            <Card onClick={() => onNavigate && onNavigate('customers')}>
              <CardLabel icon="people">Reengagement · now</CardLabel>
              <SubLabel>Re-engaged (active)</SubLabel>
              <BigNum color={SUCCESS}>{num(m.reengagement.reengaged_active)}</BigNum>
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 8 }}>At risk · reachable</div>
              <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 17, fontWeight: 800, color: WARNING, fontVariantNumeric: 'tabular-nums' }}>{num(m.reengagement.at_risk_reachable)}</div>
            </Card>
          </div>

          {/* ── Growth deep-dive ─────────────────────────────────── */}
          {g && <>
            <SectionLabel>Stale pipeline · {sub}</SectionLabel>
            <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <StaleBucket label="No follow-up set"     value={g.stale?.no_followup}     tone="warn"  hint="open leads without a future date" onClick={() => onNavigate && onNavigate('leads')} />
              <StaleBucket label="Never contacted"      value={g.stale?.never_contacted} tone="danger" hint="open · 0 attempts · >2 days old"  onClick={() => onNavigate && onNavigate('leads')} />
              <StaleBucket label="Attempted, no connect" value={g.stale?.never_connected} tone="danger" hint="tried · never got through · >3d"  onClick={() => onNavigate && onNavigate('leads')} />
            </div>

            <SectionLabel>Stylist scorecard · {sub}</SectionLabel>
            <StylistTable rows={g.stylist_scorecard} />

            <div style={{ height: 16 }} />
            <SectionLabel>Conversion by source · {sub}</SectionLabel>
            <SourceTable rows={g.by_source} />
          </>}

        </>}

        {/* ════════════ OPS ════════════ */}
        {view === 'ops' && <>
          <SectionLabel>Production & dues · now</SectionLabel>
          <div className="grid gap-2.5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))' }}>
            <Card onClick={() => onNavigate && onNavigate('production')}>
              <CardLabel icon="factory">Production · now</CardLabel>
              <StatRow label="Dispatched today" value={m.production.dispatched_today} />
              <StatRow label="Due today" value={m.production.due_today} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 8px', marginTop: 4,
                            background: Number(m.production.overdue) > 0 ? '#fdeceb' : '#f3f3ef', borderRadius: 8 }}>
                <span style={{ fontSize: 12, color: Number(m.production.overdue) > 0 ? DANGER : MUTED }}>Overdue</span>
                <span style={{ fontFamily: 'Manrope,sans-serif', fontSize: 16, fontWeight: 800, color: Number(m.production.overdue) > 0 ? DANGER : INK, fontVariantNumeric: 'tabular-nums' }}>{num(m.production.overdue)}</span>
              </div>
            </Card>
            <Card onClick={() => { window._posInitialView = 'dues'; onNavigate && onNavigate('pos') }}>
              <CardLabel icon="money">Dues · now</CardLabel>
              <BigNum>{inr(m.dues.total)}</BigNum>
              <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>across {num(m.dues.count)} orders</div>
              <AgingRibbon aging={m.dues.aging} />
            </Card>
            <Card onClick={() => onNavigate && onNavigate('collections')}>
              <CardLabel icon="grid">Catalogue work</CardLabel>
              <SubLabel>New products · {sub.toLowerCase()}</SubLabel>
              <BigNum>{num(m.catalogue.added)}</BigNum>
              <Delta cur={m.catalogue.added} prev={m.catalogue.prev} label={prevLabel} />
              <Contributors list={m.catalogue.contributors} />
            </Card>
          </div>

          {/* ── Ops deep-dive ────────────────────────────────────── */}
          {o && <>
            <SectionLabel>Production load by stage · now</SectionLabel>
            <LoadByStage list={o.load_by_stage} onClick={() => onNavigate && onNavigate('production')} />

            <div style={{ height: 16 }} />
            <SectionLabel>Workload by person · now</SectionLabel>
            <WorkloadTable rows={o.workload_by_person} />

            <div style={{ height: 16 }} />
            <SectionLabel>About to slip · next 5 days</SectionLabel>
            <SlipList rows={o.about_to_slip} onNavigate={onNavigate} />

            <div style={{ height: 16 }} />
            <SectionLabel>Throughput · {sub}</SectionLabel>
            <Throughput entered={o.throughput?.entered} dispatched={o.throughput?.dispatched} />

            <div style={{ height: 18 }} />
          </>}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <SectionLabel inline>Attention queue · {items.length} items</SectionLabel>
            <span style={{ fontSize: 11, color: FAINT }}>Live · sorted by priority</span>
          </div>
          <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
            {items.length === 0 && <div style={{ padding: 18, fontSize: 13, color: MUTED }}>Nothing needs your attention right now.</div>}
            {items.map((it, i) => {
              const sev = it.severity === 'danger' ? DANGER : it.severity === 'warning' ? WARNING : '#185FA5'
              const bg = it.severity === 'danger' ? '#fdeceb' : it.severity === 'warning' ? '#fbf2e0' : '#e9f1fb'
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 13px', borderTop: i === 0 ? 'none' : `1px solid ${BORDER}` }}>
                  <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: bg, color: sev,
                                 display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                    {it.category === 'dues' ? '₹' : it.category === 'production' ? 'P' : 'L'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: INK, lineHeight: 1.3 }}>{it.title}</div>
                    <div style={{ fontSize: 11, color: FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.subtitle}</div>
                  </div>
                  <button onClick={() => go(it.target)}
                    style={{ flexShrink: 0, fontSize: 11.5, padding: '5px 11px', background: '#fff', border: `1px solid ${BORDER}`,
                             borderRadius: 8, color: INK, cursor: 'pointer', whiteSpace: 'nowrap' }}>{it.action_label}</button>
                </div>
              )
            })}
          </div>
        </>}

        <div style={{ fontSize: 11, color: FAINT, marginTop: 12 }}>
          Figures use IST. Channel sales are NET of GST (eff. selling price ex-GST), excluding cancellations. MTD = month-to-date. YTD = current Indian fiscal year (Apr–Mar). Cards marked “now” are live snapshots and ignore the period filter.
        </div>
      </>}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

/* ── sub-components ──────────────────────────────────────────────── */
const SectionLabel = ({ children, inline }) => (
  <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: FAINT, marginBottom: inline ? 0 : 8, fontWeight: 700 }}>{children}</div>
)
const StatRow = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
    <span style={{ fontSize: 12, color: MUTED }}>{label}</span>
    <span style={{ fontFamily: 'Manrope,sans-serif', fontSize: 16, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>{num(value)}</span>
  </div>
)
const ChannelRibbon = ({ mix }) => {
  const order = ['In-store', 'Online', 'Online Assist', 'Marketplace']
  const entries = order.map(k => [k, Number((mix || {})[k] || 0)]).filter(e => e[1] > 0)
  return (<>
    <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: '#f0eee7' }}>
      {entries.map(([k, v]) => <div key={k} style={{ background: CHANNEL_COLORS[k] || '#B4B2A9', flex: v }} />)}
    </div>
    <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>Store · Online · Assist · MP</div>
  </>)
}
const AgingRibbon = ({ aging }) => {
  const segs = [['d0_30', '#C0DD97'], ['d30_60', '#FAC775'], ['d60_90', '#F09595'], ['d90p', '#A32D2D']]
  const vals = segs.map(([k, c]) => [Number((aging || {})[k] || 0), c])
  return (<>
    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: '#f0eee7' }}>
      {vals.map(([v, c], i) => v > 0 ? <div key={i} style={{ background: c, flex: v }} /> : null)}
    </div>
    <div style={{ fontSize: 10.5, color: FAINT, marginTop: 4 }}>0-30 · 30-60 · 60-90 · 90+</div>
  </>)
}
const AVATAR_BG = ['#CECBF6', '#B5D4F4', '#9FE1CB', '#FAC775', '#F0997B']
const AVATAR_FG = ['#26215C', '#042C53', '#04342C', '#633806', '#4A1B0C']
const initials = (name) => {
  const parts = String(name || '?').replace(/@.*/, '').split(/[\s._]+/).filter(Boolean)
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase()
}
const Contributors = ({ list }) => {
  const arr = Array.isArray(list) ? list : []
  if (arr.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
      {arr.slice(0, 4).map((c, i) => (
        <div key={i} title={`${c.name} · ${c.n}`}
          style={{ width: 22, height: 22, borderRadius: '50%', background: AVATAR_BG[i % 5], color: AVATAR_FG[i % 5],
                   display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
          {initials(c.name)}
        </div>
      ))}
    </div>
  )
}
const StylistList = ({ list }) => {
  const arr = Array.isArray(list) ? list : []
  if (arr.length === 0) return <div style={{ fontSize: 11.5, color: FAINT, marginTop: 10 }}>No leads in this range</div>
  return (
    <div style={{ marginTop: 10 }}>
      {arr.slice(0, 3).map((s, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
          <span style={{ color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>{s.name}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', color: INK }}>{num(s.n)}</span>
        </div>
      ))}
    </div>
  )
}


/* ── deep-dive helpers ───────────────────────────────────────────── */
const StaleBucket = ({ label, value, hint, tone, onClick }) => {
  const c = tone === 'danger' ? DANGER : tone === 'warn' ? WARNING : INK
  const bg = tone === 'danger' ? '#fdeceb' : tone === 'warn' ? '#fbf2e0' : '#f3f3ef'
  return (
    <Card onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: bg, color: c,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Manrope,sans-serif', fontWeight: 800, fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
          {num(value)}
        </div>
        <div>
          <div style={{ fontSize: 12.5, color: INK, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: 11, color: FAINT }}>{hint}</div>
        </div>
      </div>
    </Card>
  )
}

const Th = ({ children, align = 'left', w }) => (
  <th style={{ textAlign: align, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase',
               color: MUTED, fontWeight: 700, padding: '7px 10px', borderBottom: `1px solid ${BORDER}`,
               background: '#faf8f3', width: w }}>{children}</th>
)
const Td = ({ children, align = 'left', muted, mono, bold, color }) => (
  <td style={{ textAlign: align, fontSize: 12.5, padding: '8px 10px', borderBottom: `1px solid ${BORDER}`,
               color: color || (muted ? MUTED : INK),
               fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
               fontWeight: bold ? 800 : 500, fontFamily: bold ? 'Manrope,sans-serif' : 'inherit' }}>{children}</td>
)
const TableWrap = ({ children }) => (
  <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>{children}</table>
    </div>
  </div>
)

const StylistTable = ({ rows }) => {
  if (!rows || rows.length === 0) return <div style={{ fontSize: 12.5, color: MUTED, padding: 12 }}>No leads in this range.</div>
  return (
    <TableWrap>
      <thead><tr>
        <Th>Stylist</Th>
        <Th align="right">Assigned</Th>
        <Th align="right">Contacted</Th>
        <Th align="right">Cold</Th>
        <Th align="right">Converted</Th>
        <Th align="right">Conv %</Th>
        <Th align="right">Revenue</Th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => {
          const coldShare = r.assigned > 0 ? r.cold / r.assigned : 0
          const coldColor = coldShare >= 0.5 ? DANGER : coldShare >= 0.3 ? WARNING : INK
          const convColor = r.conv_pct >= 5 ? SUCCESS : r.conv_pct >= 2 ? INK : WARNING
          return (
            <tr key={i}>
              <Td bold>{r.name}</Td>
              <Td align="right" mono>{num(r.assigned)}</Td>
              <Td align="right" mono muted>{num(r.contacted)}</Td>
              <Td align="right" mono color={coldColor} bold>{num(r.cold)}</Td>
              <Td align="right" mono>{num(r.converted)}</Td>
              <Td align="right" mono color={convColor} bold>{r.conv_pct}%</Td>
              <Td align="right" mono muted>{inr(r.revenue)}</Td>
            </tr>
          )
        })}
      </tbody>
    </TableWrap>
  )
}

const SourceTable = ({ rows }) => {
  if (!rows || rows.length === 0) return <div style={{ fontSize: 12.5, color: MUTED, padding: 12 }}>No sources in this range.</div>
  return (
    <TableWrap>
      <thead><tr>
        <Th>Source</Th>
        <Th align="right">Leads</Th>
        <Th align="right">Qualified</Th>
        <Th align="right">High</Th>
        <Th align="right">Converted</Th>
        <Th align="right">Conv %</Th>
        <Th align="right">Revenue</Th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => {
          const c = r.conv_pct >= 20 ? SUCCESS : r.conv_pct >= 5 ? INK : WARNING
          return (
            <tr key={i}>
              <Td bold>{r.source}</Td>
              <Td align="right" mono>{num(r.total)}</Td>
              <Td align="right" mono muted>{num(r.qualified || 0)}</Td>
              <Td align="right" mono color={Number(r.high_quality) > 0 ? GOLD : MUTED} bold={Number(r.high_quality) > 0}>{num(r.high_quality || 0)}</Td>
              <Td align="right" mono muted>{num(r.converted)}</Td>
              <Td align="right" mono color={c} bold>{r.conv_pct}%</Td>
              <Td align="right" mono>{inr(r.revenue || 0)}</Td>
            </tr>
          )
        })}
      </tbody>
    </TableWrap>
  )
}

const STAGE_COLORS = {
  pending: '#888780', marking: '#7F77DD', fabrication: '#378ADD', dyeing: '#1D9E75',
  embroidery: '#D85A30', stitching: '#BA7517', ready: '#3B6D11', unspecified: '#B4B2A9'
}
const LoadByStage = ({ list, onClick }) => {
  const arr = Array.isArray(list) ? list : []
  const total = arr.reduce((s, x) => s + (Number(x.n) || 0), 0) || 1
  return (
    <Card onClick={onClick}>
      <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', background: '#f0eee7' }}>
        {arr.map((x, i) => (
          <div key={i} title={`${x.stage}: ${x.n}`}
               style={{ background: STAGE_COLORS[x.stage] || '#B4B2A9', flex: Number(x.n) || 0,
                        borderRight: i < arr.length - 1 ? '1px solid #fff' : 'none' }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 10 }}>
        {arr.map((x, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: STAGE_COLORS[x.stage] || '#B4B2A9' }} />
            <span style={{ color: INK, fontWeight: 600 }}>{x.stage}</span>
            <span style={{ color: MUTED, fontVariantNumeric: 'tabular-nums' }}>{num(x.n)}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 11.5, color: FAINT }}>Total active: {num(total)}</div>
      </div>
    </Card>
  )
}

const WorkloadTable = ({ rows }) => {
  if (!rows || rows.length === 0) return <div style={{ fontSize: 12.5, color: MUTED, padding: 12 }}>No active production.</div>
  const maxA = Math.max(1, ...rows.map(r => Number(r.active) || 0))
  return (
    <TableWrap>
      <thead><tr>
        <Th>Person / vendor</Th>
        <Th align="right" w={60}>Active</Th>
        <Th align="right" w={70}>Overdue</Th>
        <Th align="right" w={90}>Oldest (d)</Th>
        <Th>Load</Th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <Td bold>{r.name}</Td>
            <Td align="right" mono>{num(r.active)}</Td>
            <Td align="right" mono color={Number(r.overdue) > 0 ? DANGER : MUTED} bold={Number(r.overdue) > 0}>{num(r.overdue)}</Td>
            <Td align="right" mono muted>{num(r.oldest_days)}</Td>
            <Td>
              <div style={{ height: 6, background: '#f0eee7', borderRadius: 3, overflow: 'hidden', width: '100%' }}>
                <div style={{ height: '100%', width: ((Number(r.active) || 0) / maxA * 100) + '%',
                              background: Number(r.overdue) > 0 ? DANGER : INK }} />
              </div>
            </Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  )
}

const SlipList = ({ rows, onNavigate }) => {
  const arr = Array.isArray(rows) ? rows : []
  if (arr.length === 0) return <div style={{ fontSize: 12.5, color: MUTED, padding: 12 }}>Nothing about to slip in the next 5 days.</div>
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden' }}>
      {arr.map((r, i) => {
        const urgent = Number(r.days_left) <= 2
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 13px', borderTop: i === 0 ? 'none' : `1px solid ${BORDER}` }}>
            <span style={{ flexShrink: 0, width: 38, textAlign: 'center', fontFamily: 'Manrope,sans-serif',
                           fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: 14, color: urgent ? DANGER : WARNING }}>
              {r.days_left}d
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: INK, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
              <div style={{ fontSize: 11, color: FAINT }}>{r.order_number} · {r.stage} · {r.who}</div>
            </div>
            <button onClick={() => onNavigate && onNavigate('production')}
              style={{ flexShrink: 0, fontSize: 11.5, padding: '5px 11px', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, color: INK, cursor: 'pointer' }}>Open</button>
          </div>
        )
      })}
    </div>
  )
}

const Throughput = ({ entered, dispatched }) => {
  const gap = (Number(entered) || 0) - (Number(dispatched) || 0)
  const tone = gap > 20 ? DANGER : gap > 5 ? WARNING : SUCCESS
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div>
          <SubLabel>Entered production</SubLabel>
          <BigNum>{num(entered)}</BigNum>
        </div>
        <div style={{ color: FAINT, fontSize: 18, fontWeight: 800 }}>→</div>
        <div>
          <SubLabel>Dispatched</SubLabel>
          <BigNum>{num(dispatched)}</BigNum>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <SubLabel>Net change in WIP</SubLabel>
          <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 17, fontWeight: 800, color: tone, fontVariantNumeric: 'tabular-nums' }}>
            {gap > 0 ? '+' : ''}{num(gap)}
          </div>
        </div>
      </div>
    </Card>
  )
}

export default FounderDashboard

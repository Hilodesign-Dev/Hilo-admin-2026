import React, { useEffect, useState, useCallback } from 'react'
import { supa } from '../../lib/supabase'

/* ClosureDashboard — Online lead closure funnel & rep performance.
   Answers: where are online leads leaking, and who's converting. */

const INK = '#1b1c1a', MUT = 'rgba(27,28,26,0.5)', FAINT = 'rgba(27,28,26,0.32)'
const GOLD = '#c9a432', LINE = '#ece8df', SUCCESS = '#2d7a4f', DANGER = '#b4322e', WARN = '#b9831f'
const inr = (v) => { const n = Number(v) || 0; if (Math.abs(n) >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'; if (Math.abs(n) >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L'; return '₹' + Math.round(n).toLocaleString('en-IN') }
const num = (v) => (Number(v) || 0).toLocaleString('en-IN')
const pctOf = (a, b) => b ? (100 * a / b) : 0

export function ClosureDashboard() {
  const [days, setDays] = useState(180)
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => { setLoading(true); const { data } = await supa.rpc('lead_closure_metrics', { p_days: days }); setD(data || null); setLoading(false) }, [days])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ color: MUT, padding: 40 }}>Loading closure metrics…</div>
  if (!d) return <div style={{ color: MUT, padding: 40 }}>No data.</div>

  const T = d.total || 0
  const Card = ({ children, style }) => <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: 14, ...style }}>{children}</div>
  const KPI = ({ label, big, sub, tone }) => (
    <Card><div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUT }}>{label}</div>
      <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 23, fontWeight: 800, color: tone || INK, marginTop: 4 }}>{big}</div>
      {sub && <div style={{ fontSize: 11.5, color: MUT, marginTop: 2 }}>{sub}</div>}</Card>
  )
  const SectionLabel = ({ children }) => <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUT, fontWeight: 700, margin: '22px 0 10px' }}>{children}</div>

  const funnel = [
    { k: 'Leads', v: d.total, c: '#c7b56a' },
    { k: 'Contacted', v: d.contacted, c: '#b6a24f' },
    { k: 'Connected', v: d.connected, c: '#8a9a5b' },
    { k: 'Appointment', v: d.appointment, c: '#5b8aa6' },
    { k: 'Converted', v: d.converted, c: SUCCESS },
  ]

  return (
    <div style={{ maxWidth: 1080 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
        <div style={{ fontSize: 12.5, color: MUT }}>Online / phone leads only (store walk-ins excluded).</div>
        <div style={{ display: 'flex', padding: 3, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 9 }}>
          {[[30, '30d'], [90, '90d'], [180, '6mo']].map(([v, l]) => (
            <button key={v} onClick={() => setDays(v)} style={{ padding: '5px 12px', fontSize: 12, borderRadius: 7, border: 'none', cursor: 'pointer', background: days === v ? INK : 'transparent', color: days === v ? '#fff' : MUT, fontWeight: days === v ? 700 : 500 }}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginTop: 8 }}>
        <KPI label="Leads" big={num(d.total)} sub={`${days === 180 ? 'last 6 months' : 'last ' + days + ' days'}`} />
        <KPI label="Contact rate" big={pctOf(d.contacted, T).toFixed(0) + '%'} sub={`${num(d.contacted)} touched`} />
        <KPI label="Connected" big={pctOf(d.connected, T).toFixed(1) + '%'} sub={`${num(d.connected)} reached`} tone={WARN} />
        <KPI label="Appointment rate" big={pctOf(d.appointment, T).toFixed(1) + '%'} sub={`${num(d.appointment)} booked`} tone={WARN} />
        <KPI label="Conversion" big={pctOf(d.converted, T).toFixed(1) + '%'} sub={`${num(d.converted)} closed`} tone={d.converted ? SUCCESS : DANGER} />
        <KPI label="Revenue (attributed)" big={inr(d.revenue)} sub="from linked orders" />
      </div>

      {/* Funnel */}
      <SectionLabel>Closure funnel</SectionLabel>
      <Card>
        <div style={{ display: 'grid', gap: 8 }}>
          {funnel.map((f, i) => (
            <div key={f.k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 96, fontSize: 12.5, color: MUT, textAlign: 'right' }}>{f.k}</div>
              <div style={{ flex: 1, background: '#f4f1ea', borderRadius: 6, height: 26, position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(pctOf(f.v, T), 0.5)}%`, height: '100%', background: f.c, borderRadius: 6 }} />
                <div style={{ position: 'absolute', left: 8, top: 0, height: '100%', display: 'flex', alignItems: 'center', fontSize: 11.5, fontWeight: 700, color: INK }}>{num(f.v)} · {pctOf(f.v, T).toFixed(1)}%</div>
              </div>
              <div style={{ width: 96, fontSize: 11, color: FAINT }}>{i > 0 ? `${pctOf(f.v, funnel[i - 1].v).toFixed(0)}% of prev` : ''}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Leaks */}
      <SectionLabel>Where leads are leaking</SectionLabel>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        <Card style={{ borderColor: '#f0d9a8', background: '#fdf7ea' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: WARN }}>Stuck at “Attempt 1”</div>
          <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 22, fontWeight: 800, color: INK, marginTop: 3 }}>{num(d.stuck_attempt1)} <span style={{ fontSize: 13, color: MUT, fontWeight: 600 }}>({pctOf(d.stuck_attempt1, T).toFixed(0)}%)</span></div>
          <div style={{ fontSize: 11.5, color: MUT, marginTop: 4 }}>Called once and abandoned. These need a follow-up cadence (5–8 touches).</div>
        </Card>
        <Card style={{ borderColor: '#f3c9c6', background: '#fdeeed' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: DANGER }}>Marked “Lost”</div>
          <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 22, fontWeight: 800, color: INK, marginTop: 3 }}>{num(d.lost)} <span style={{ fontSize: 13, color: MUT, fontWeight: 600 }}>({pctOf(d.lost, T).toFixed(0)}%)</span></div>
          <div style={{ fontSize: 11.5, color: MUT, marginTop: 4 }}>Are these truly lost, or dropped too early? Enforce min attempts before Lost.</div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, fontWeight: 800, color: MUT }}>Untouched (New / Yet to connect)</div>
          <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 22, fontWeight: 800, color: INK, marginTop: 3 }}>{num(d.untouched)}</div>
          <div style={{ fontSize: 11.5, color: MUT, marginTop: 4 }}>Speed-to-lead: contact these within minutes.</div>
        </Card>
      </div>

      {/* By source */}
      <SectionLabel>Conversion by source</SectionLabel>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
          <thead><tr style={{ color: FAINT, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#faf8f2' }}>
            <th align="left" style={{ padding: '9px 12px' }}>Source</th><th align="right" style={{ padding: '9px 12px' }}>Leads</th><th align="right" style={{ padding: '9px 12px' }}>Converted</th><th align="right" style={{ padding: '9px 12px' }}>Conv %</th><th align="right" style={{ padding: '9px 12px' }}>Revenue</th>
          </tr></thead>
          <tbody>{(d.by_source || []).map(s => (
            <tr key={s.bucket} style={{ borderTop: `1px solid ${LINE}` }}>
              <td style={{ padding: '9px 12px', fontWeight: 700 }}>{s.bucket}</td>
              <td align="right" style={{ padding: '9px 12px' }}>{num(s.leads)}</td>
              <td align="right" style={{ padding: '9px 12px' }}>{num(s.converted)}</td>
              <td align="right" style={{ padding: '9px 12px', fontWeight: 700, color: s.conv_pct >= 10 ? SUCCESS : s.conv_pct >= 3 ? WARN : DANGER }}>{Number(s.conv_pct).toFixed(1)}%</td>
              <td align="right" style={{ padding: '9px 12px' }}>{inr(s.revenue)}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>

      {/* Rep leaderboard */}
      <SectionLabel>By rep</SectionLabel>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
          <thead><tr style={{ color: FAINT, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', background: '#faf8f2' }}>
            <th align="left" style={{ padding: '9px 12px' }}>Rep</th><th align="right" style={{ padding: '9px 12px' }}>Leads</th><th align="right" style={{ padding: '9px 12px' }}>Contacted</th><th align="right" style={{ padding: '9px 12px' }}>Appts</th><th align="right" style={{ padding: '9px 12px' }}>Converted</th><th align="right" style={{ padding: '9px 12px' }}>Conv %</th><th align="right" style={{ padding: '9px 12px' }}>Revenue</th>
          </tr></thead>
          <tbody>{(d.by_owner || []).map(o => (
            <tr key={o.name} style={{ borderTop: `1px solid ${LINE}` }}>
              <td style={{ padding: '9px 12px', fontWeight: 700 }}>{o.name}</td>
              <td align="right" style={{ padding: '9px 12px' }}>{num(o.leads)}</td>
              <td align="right" style={{ padding: '9px 12px' }}>{num(o.contacted)}</td>
              <td align="right" style={{ padding: '9px 12px' }}>{num(o.appointment)}</td>
              <td align="right" style={{ padding: '9px 12px' }}>{num(o.converted)}</td>
              <td align="right" style={{ padding: '9px 12px', fontWeight: 700, color: o.conv_pct >= 5 ? SUCCESS : o.conv_pct >= 2 ? WARN : DANGER }}>{Number(o.conv_pct).toFixed(1)}%</td>
              <td align="right" style={{ padding: '9px 12px' }}>{inr(o.revenue)}</td>
            </tr>
          ))}
          {(d.by_owner || []).length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: MUT }}>No rep data.</td></tr>}
          </tbody>
        </table>
      </Card>
      <div style={{ height: 24 }} />
    </div>
  )
}

export default ClosureDashboard

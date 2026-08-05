/* ═══════════════════════════════════════════════════════════════════════════
   MARKETING → CAMPAIGNS (campaign-level ROAS)
   Spend/impressions/clicks from ad_campaign_stats (synced from Meta/Google).
   Revenue attributed from orders → lead UTM → campaign match. Orders = truth.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { fmtINR, fmtN, classifySource, matchCampaign, DATE_PRESETS, activePresetKey } from './marketingUtil'

const C = { good: '#047857', bad: '#b91c1c', ink: '#1b1c1a', sub: '#6b7280', line: '#e5e7eb', gold: '#795900', card: '#fff' }

export default function MarketingCampaigns({ orders = [], dateFrom, dateTo, setDateFrom, setDateTo }) {
  const [stats, setStats] = useState([])
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [platform, setPlatform] = useState('all')
  const [mode, setMode] = useState('blended')
  const [sortKey, setSortKey] = useState('spend')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      // campaign stats whose period overlaps the selected range
      const sp = supa.from('ad_campaign_stats').select('*').lte('period_start', dateTo).gte('period_end', dateFrom)
      // leads in range for CPL / conversion + UTM match
      const cols = 'id, utm_campaign, lead_source, status, amount, order_id, lead_date'
      let allLeads = [], from = 0
      const [{ data: sdata }] = await Promise.all([sp])
      while (true) {
        const { data, error } = await supa.from('leads').select(cols).gte('lead_date', dateFrom).lte('lead_date', dateTo).order('lead_date', { ascending: false }).range(from, from + 999)
        if (error) break
        allLeads = allLeads.concat(data || [])
        if (!data || data.length < 1000) break
        from += 1000
      }
      const have = new Set(allLeads.map(l => l.id))
      const need = [...new Set(orders.map(o => o.lead_id).filter(id => id && !have.has(id)))]
      for (let i = 0; i < need.length; i += 300) { const { data } = await supa.from('leads').select(cols).in('id', need.slice(i, i + 300)); if (data) allLeads = allLeads.concat(data) }
      if (!cancelled) { setStats(sdata || []); setLeads(allLeads); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [dateFrom, dateTo, orders])

  const M = useMemo(() => {
    const rows = stats.filter(s => platform === 'all' || s.platform === platform)
    // aggregate stats per campaign across overlapping periods
    const camps = {}
    for (const s of rows) {
      const k = s.campaign_id
      if (!camps[k]) camps[k] = { key: k, real: true, id: k, name: s.campaign_name || k, platform: s.platform, spend: 0, impressions: 0, clicks: 0, leads: 0, won: 0, directRev: 0, allocRev: 0, matched: new Set() }
      const c = camps[k]; c.spend += Number(s.spend) || 0; c.impressions += Number(s.impressions) || 0; c.clicks += Number(s.clicks) || 0
    }
    const list = Object.values(camps)
    const totalSpend = list.reduce((a, c) => a + c.spend, 0)

    const leadsById = {}; leads.forEach(l => { leadsById[l.id] = l })
    for (const l of leads) {
      const utm = (l.utm_campaign || '').trim(); if (!utm) continue
      const m = matchCampaign(utm, list); if (!m) continue
      m.leads++; if (/won|convert|order/i.test(l.status || '') || l.order_id != null) m.won++; m.matched.add(utm.toLowerCase())
    }
    let unmappedAdRev = 0
    for (const o of orders) {
      if (o.is_returned || o.cancelled_at) continue
      const rev = Number(o.total_price) || 0
      const lead = leadsById[o.lead_id]
      const utm = (lead?.utm_campaign || '').trim()
      const src = o.lead_source || lead?.lead_source || ''
      const m = utm ? matchCampaign(utm, list) : null
      if (m) m.directRev += rev
      else if (classifySource(src) === 'ad') unmappedAdRev += rev
    }
    if (totalSpend > 0) for (const c of list) c.allocRev = unmappedAdRev * (c.spend / totalSpend)

    const sortFns = { spend: (a, b) => b.spend - a.spend, roas: (a, b) => (b.directRev / (b.spend || 1)) - (a.directRev / (a.spend || 1)), rev: (a, b) => b.directRev - a.directRev, leads: (a, b) => b.leads - a.leads }
    list.sort(sortFns[sortKey] || sortFns.spend)

    const totalDirect = list.reduce((a, c) => a + c.directRev, 0)
    const totalImpr = list.reduce((a, c) => a + c.impressions, 0)
    const totalClicks = list.reduce((a, c) => a + c.clicks, 0)
    const blended = totalSpend ? (totalDirect + unmappedAdRev) / totalSpend : 0
    const direct = totalSpend ? totalDirect / totalSpend : 0
    return { list, totalSpend, totalDirect, unmappedAdRev, totalImpr, totalClicks, blended, direct, count: list.length }
  }, [stats, leads, orders, platform, sortKey])

  const preset = activePresetKey(dateFrom, dateTo)
  const applyPreset = p => { const r = p.range(); setDateFrom(r.from); setDateTo(r.to) }
  const roasCls = v => v >= 1 ? { color: C.good, fontWeight: 700 } : { color: C.bad, fontWeight: 700 }

  const KPI = ({ l, v, s, c }) => <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}><div className="text-xs" style={{ color: C.sub }}>{l}</div><div className="text-xl font-bold mt-1" style={{ color: c || C.ink }}>{v}</div>{s && <div className="text-[11px] mt-0.5" style={{ color: C.sub }}>{s}</div>}</div>

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#efeeea' }}>
          {DATE_PRESETS.map(p => (
            <button key={p.key} onClick={() => applyPreset(p)} className="px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap"
              style={{ background: preset === p.key ? '#fff' : 'transparent', color: preset === p.key ? C.gold : C.sub, boxShadow: preset === p.key ? '0 2px 8px rgba(0,0,0,0.06)' : 'none' }}>{p.label}</button>
          ))}
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg" style={{ border: `1px solid ${C.line}` }} />
        <span className="text-xs" style={{ color: C.sub }}>→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg" style={{ border: `1px solid ${C.line}` }} />
        <select value={platform} onChange={e => setPlatform(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg font-semibold ml-auto" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
          <option value="all">All platforms</option><option value="facebook">Facebook / Meta</option><option value="google">Google</option>
        </select>
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#efeeea' }}>
          {[['blended', 'Blended'], ['direct', 'Direct']].map(([k, lb]) => <button key={k} onClick={() => setMode(k)} className="px-3 py-1.5 rounded-md text-xs font-semibold" style={{ background: mode === k ? '#fff' : 'transparent', color: mode === k ? C.gold : C.sub }}>{lb}</button>)}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI l="Campaigns" v={M.count} s="with spend in range" />
        <KPI l="Total spend" v={fmtINR(M.totalSpend)} />
        <KPI l={mode === 'direct' ? 'Direct ROAS' : 'Blended ROAS'} v={(mode === 'direct' ? M.direct : M.blended).toFixed(2) + 'x'} c={(mode === 'direct' ? M.direct : M.blended) >= 1 ? C.good : C.bad} s="revenue ÷ spend" />
        <KPI l="Attributed revenue" v={fmtINR(M.totalDirect + (mode === 'direct' ? 0 : M.unmappedAdRev))} s={`${fmtINR(M.totalDirect)} direct`} />
        <KPI l="Impressions" v={fmtN(M.totalImpr)} s={M.totalClicks ? `${(M.totalClicks / M.totalImpr * 100).toFixed(1)}% CTR` : ''} />
        <KPI l="Avg CPC" v={M.totalClicks ? '₹' + (M.totalSpend / M.totalClicks).toFixed(1) : '—'} s={`${fmtN(M.totalClicks)} clicks`} />
      </div>

      {/* Campaign table */}
      <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-sm" style={{ color: C.ink }}>Campaign ROAS{loading ? ' — loading…' : ''}</div>
          <select value={sortKey} onChange={e => setSortKey(e.target.value)} className="text-xs px-2 py-1 rounded-lg" style={{ border: `1px solid ${C.line}`, color: C.sub }}>
            <option value="spend">Sort: Spend</option><option value="roas">Sort: ROAS</option><option value="rev">Sort: Revenue</option><option value="leads">Sort: Leads</option>
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="text-xs" style={{ minWidth: 1080, width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.line}` }}>
              {['Campaign', 'Plat', 'Spend', 'Impr', 'Clicks', 'CTR', 'CPC', 'CPM', 'Leads', 'Won', 'CVR', 'CPL', 'Direct rev', '+Alloc', 'Direct ROAS', 'Blended ROAS'].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', color: C.sub, fontWeight: 600, padding: '6px 8px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {M.list.length === 0 ? (
                <tr><td colSpan={16} style={{ textAlign: 'center', color: C.sub, padding: 24 }}>{loading ? 'Loading…' : 'No campaign spend in this range.'}</td></tr>
              ) : M.list.map(c => {
                const ctr = c.impressions ? c.clicks / c.impressions * 100 : 0, cpc = c.clicks ? c.spend / c.clicks : 0, cpm = c.impressions ? c.spend / c.impressions * 1000 : 0
                const cvr = c.leads ? c.won / c.leads * 100 : 0, cpl = c.leads ? c.spend / c.leads : 0
                const dr = c.spend ? c.directRev / c.spend : 0, br = c.spend ? (c.directRev + c.allocRev) / c.spend : 0
                const td = (v, st) => <td style={{ textAlign: 'right', padding: '6px 8px', whiteSpace: 'nowrap', ...st }}>{v}</td>
                return (
                  <tr key={c.key} style={{ borderBottom: `1px solid ${C.line}` }}>
                    <td style={{ padding: '6px 8px', maxWidth: 230 }}><div className="font-semibold truncate" style={{ color: C.ink }}>{c.name}</div>{c.matched.size > 0 && <div className="text-[10px] truncate" style={{ color: C.sub }}>utm: {[...c.matched].join(', ')}</div>}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', textTransform: 'capitalize' }}>{c.platform}</td>
                    {td(fmtINR(c.spend))}{td(fmtN(c.impressions))}{td(fmtN(c.clicks))}{td(ctr.toFixed(1) + '%')}{td('₹' + cpc.toFixed(0))}{td('₹' + cpm.toFixed(0))}
                    {td(c.leads || '—')}{td(c.won || '—')}{td(c.leads ? cvr.toFixed(0) + '%' : '—')}{td(c.leads ? fmtINR(cpl) : '—')}
                    {td(fmtINR(c.directRev))}{td(fmtINR(c.allocRev), { color: C.sub })}{td(dr.toFixed(2) + 'x', roasCls(dr))}{td(br.toFixed(2) + 'x', roasCls(br))}
                  </tr>
                )
              })}
            </tbody>
            {M.list.length > 0 && <tfoot><tr style={{ borderTop: `2px solid ${C.line}`, fontWeight: 700 }}>
              <td style={{ padding: '6px 8px' }}>Total</td><td /><td style={{ textAlign: 'right', padding: '6px 8px' }}>{fmtINR(M.totalSpend)}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px' }}>{fmtN(M.totalImpr)}</td><td style={{ textAlign: 'right', padding: '6px 8px' }}>{fmtN(M.totalClicks)}</td>
              <td colSpan={7} /><td style={{ textAlign: 'right', padding: '6px 8px' }}>{fmtINR(M.totalDirect)}</td><td style={{ textAlign: 'right', padding: '6px 8px', color: C.sub }}>{fmtINR(M.unmappedAdRev)}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px', ...roasCls(M.direct) }}>{M.direct.toFixed(2)}x</td><td style={{ textAlign: 'right', padding: '6px 8px', ...roasCls(M.blended) }}>{M.blended.toFixed(2)}x</td>
            </tr></tfoot>}
          </table>
        </div>
        <div className="text-[11px] mt-2" style={{ color: C.sub }}>Spend/impressions/clicks are synced from the ad platform; revenue is attributed from orders via the lead's UTM → campaign match. Campaign spend is stored monthly, so month presets (This/Last month) are exact and custom mid-month ranges include the whole overlapping month. Ad-set level is a future drill-down.</div>
      </div>
    </div>
  )
}

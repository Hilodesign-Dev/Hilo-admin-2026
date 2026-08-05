/* ═══════════════════════════════════════════════════════════════════════════
   MARKETING → ROI ("True ROAS")
   Orders are the source of truth for revenue AND conversion. Ad spend comes from
   the ad_spend ledger (campaign-level once synced). Attribution joins order→lead
   → lead_source bucket (paid/organic) + utm_campaign → campaign match.
   Three confidence tiers: Direct (UTM matched) · Allocated (paid, untagged) · Organic.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { DATE_PRESETS, activePresetKey, classifySource } from './marketingUtil'

const C = { good: '#047857', bad: '#b91c1c', ink: '#1b1c1a', sub: '#6b7280', line: '#e5e7eb', gold: '#795900', card: '#fff' }
const SOURCES = ['In-store', 'Online Assist', 'Online']

const fmtINR = n => { if (n == null || isNaN(n)) return '—'; const a = Math.abs(n); if (a >= 1e7) return '₹' + (n / 1e7).toFixed(2) + 'Cr'; if (a >= 1e5) return '₹' + (n / 1e5).toFixed(1) + 'L'; return '₹' + Math.round(n).toLocaleString('en-IN') }
const fmtN = n => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-IN')
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['ctwa', 'leads', 'lead', 'ads', 'ad', 'campaign', 'whatsapp', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', '2025', '2026', 'the', 'to', 'level'])
const tokens = s => norm(s).split(' ').filter(t => t.length > 2 && !STOP.has(t))
const isPaid = s => { const n = norm(s); return /\b(ad|ads|ctwa)\b/.test(n) || /(whatsapp|facebook|instagram|meta|fb|ig) ad/.test(n) }
function matchCampaign(utm, camps) {
  const ut = tokens(utm); if (!ut.length) return null
  let best = null, bestScore = 0
  for (const c of camps) {
    if (!c.real) continue
    const ct = new Set(tokens(c.name))
    const score = ut.filter(t => ct.has(t) || [...ct].some(x => x.includes(t) || t.includes(x))).length
    if (score > bestScore) { bestScore = score; best = c }
  }
  return bestScore > 0 ? best : null
}
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5)

export default function MarketingROI({ orders = [], adSpend = [], loading, dateFrom, dateTo, setDateFrom, setDateTo }) {
  const [leads, setLeads] = useState([])
  const [leadsLoading, setLeadsLoading] = useState(false)
  const [mode, setMode] = useState('blended')      // blended | direct
  const [platform, setPlatform] = useState('all')   // all | facebook | google
  const [showUnmapped, setShowUnmapped] = useState(false)

  // Fetch leads for the range + leads linked to any in-range order (for direct UTM match regardless of lead_date)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLeadsLoading(true)
      const cols = 'id, utm_campaign, lead_source, channel, status, amount, order_id, lead_date'
      let all = [], from = 0
      while (true) {
        const { data, error } = await supa.from('leads').select(cols)
          .gte('lead_date', dateFrom).lte('lead_date', dateTo)
          .order('lead_date', { ascending: false }).range(from, from + 999)
        if (error) break
        all = all.concat(data || [])
        if (!data || data.length < 1000) break
        from += 1000
      }
      // top-up: leads linked to in-range orders but outside lead_date window
      const have = new Set(all.map(l => l.id))
      const need = [...new Set(orders.map(o => o.lead_id).filter(id => id && !have.has(id)))]
      for (let i = 0; i < need.length; i += 300) {
        const { data } = await supa.from('leads').select(cols).in('id', need.slice(i, i + 300))
        if (data) all = all.concat(data)
      }
      if (!cancelled) { setLeads(all); setLeadsLoading(false) }
    })()
    return () => { cancelled = true }
  }, [dateFrom, dateTo, orders])

  const M = useMemo(() => {
    const leadsById = {}; leads.forEach(l => { leadsById[l.id] = l })
    const spendRows = adSpend.filter(a => platform === 'all' || a.platform === platform)

    // ── Build campaigns from the ad_spend ledger ──
    const camps = {}
    for (const a of spendRows) {
      const real = !!(a.campaign_id || a.campaign_name)
      const key = real ? String(a.campaign_id || a.campaign_name) : 'acct:' + a.platform
      if (!camps[key]) camps[key] = { key, real, name: a.campaign_name || `(account-level · ${a.platform})`, platform: a.platform, status: a.status || null, spend: 0, impressions: 0, clicks: 0, leads: 0, won: 0, directRev: 0, directGp: 0, allocRev: 0, matchedUtms: new Set() }
      const c = camps[key]
      c.spend += Number(a.amount) || 0; c.impressions += Number(a.impressions) || 0; c.clicks += Number(a.clicks) || 0
    }
    const campList = Object.values(camps)
    const totalSpend = campList.reduce((s, c) => s + c.spend, 0)

    // ── Leads → campaign (for CPL / CVR) + UTM coverage ──
    let adLeads = 0, adLeadsTagged = 0
    const unmapped = {}
    for (const l of leads) {
      const won = /won|convert|order/i.test(l.status || '') || l.order_id != null
      const utm = (l.utm_campaign || '').trim()
      const paid = classifySource(l.lead_source) === 'ad'
      if (paid) adLeads++
      if (utm) {
        const m = matchCampaign(utm, campList)
        if (m) { m.leads++; if (won) m.won++; m.matchedUtms.add(utm.toLowerCase()); if (paid) adLeadsTagged++ }
        else if (paid) unmapped[utm.toLowerCase()] = (unmapped[utm.toLowerCase()] || 0) + 1
      }
    }

    // ── Orders = source of truth for revenue + conversion ──
    const revOrders = orders.filter(o => !o.is_returned && !o.cancelled_at)
    let directRev = 0, directGp = 0, unmappedAdRev = 0, unmappedAdGp = 0, organicRev = 0, unclassifiedRev = 0, totalRev = 0
    const bySource = {}; SOURCES.forEach(s => bySource[s] = { rev: 0, adRev: 0, adGp: 0, organic: 0, other: 0, orders: 0, adOrders: 0 })
    for (const o of revOrders) {
      const rev = Number(o.total_price) || 0
      const gp = (Number(o.total_sp_ex_gst) || 0) - (Number(o.total_cogs) || 0)
      totalRev += rev
      const lead = leadsById[o.lead_id]
      const src = o.lead_source || lead?.lead_source || ''
      const utm = (lead?.utm_campaign || '').trim()
      const m = utm ? matchCampaign(utm, campList) : null
      let tier
      if (m) { m.directRev += rev; m.directGp += gp; directRev += rev; directGp += gp; tier = 'ad' }
      else { const cls = classifySource(src); if (cls === 'ad') { unmappedAdRev += rev; unmappedAdGp += gp; tier = 'ad' } else if (cls === 'organic') { organicRev += rev; tier = 'organic' } else { unclassifiedRev += rev; tier = 'other' } }
      const b = bySource[o.channel]
      if (b) { b.rev += rev; b.orders++; if (tier === 'ad') { b.adRev += rev; b.adGp += gp; b.adOrders++ } else if (tier === 'organic') { b.organic += rev } else { b.other += rev } }
    }
    // allocate untagged-ad pool across campaigns pro-rata by spend (for the campaign table's blended column)
    if (totalSpend > 0) for (const c of campList) c.allocRev = unmappedAdRev * (c.spend / totalSpend)

    const adRev = directRev + unmappedAdRev
    const adGp = directGp + unmappedAdGp
    const totalAdSourceRev = SOURCES.reduce((s, k) => s + bySource[k].adRev, 0) || adRev || 1
    SOURCES.forEach(k => { const b = bySource[k]; b.allocSpend = totalSpend * (b.adRev / totalAdSourceRev); b.roas = b.allocSpend > 0 ? b.adRev / b.allocSpend : 0; b.adPct = b.rev > 0 ? b.adRev / b.rev * 100 : 0 })

    campList.sort((a, b) => b.spend - a.spend)

    // ── Daily trend: spend vs ad-attributed revenue ──
    const dayList = []; for (let d = new Date(dateFrom); d <= new Date(dateTo); d = new Date(d.getTime() + 864e5)) dayList.push(d.toISOString().slice(0, 10))
    const spendByDay = {}, adRevByDay = {}
    spendRows.forEach(a => { spendByDay[a.date] = (spendByDay[a.date] || 0) + (Number(a.amount) || 0) })
    for (const o of revOrders) {
      const lead = leadsById[o.lead_id]; const src = o.lead_source || lead?.lead_source || ''
      const utm = (lead?.utm_campaign || '').trim(); const isAd = (utm && matchCampaign(utm, campList)) || classifySource(src) === 'ad'
      if (isAd) { const day = (o.created_at || '').slice(0, 10); adRevByDay[day] = (adRevByDay[day] || 0) + (Number(o.total_price) || 0) }
    }
    const trend = dayList.map(d => ({ d, spend: spendByDay[d] || 0, adRev: adRevByDay[d] || 0 }))

    const lastSpend = spendRows.reduce((mx, a) => a.date > mx ? a.date : mx, '')
    const gapDays = lastSpend ? daysBetween(lastSpend, dateTo) : null

    return {
      totalSpend, directRev, adRev, adGp, unmappedAdRev, organicRev, unclassifiedRev, totalRev,
      blendedROAS: totalSpend ? adRev / totalSpend : 0, directROAS: totalSpend ? directRev / totalSpend : 0,
      roiPct: totalSpend ? (adGp - totalSpend) / totalSpend * 100 : 0,
      adShare: totalRev ? adRev / totalRev * 100 : 0,
      utmCoverage: adLeads ? adLeadsTagged / adLeads * 100 : 0, adLeads, adLeadsTagged,
      campList, bySource, trend, unmapped: Object.entries(unmapped).sort((a, b) => b[1] - a[1]),
      lastSpend, gapDays, reconDelta: totalRev - (directRev + unmappedAdRev + organicRev + unclassifiedRev),
    }
  }, [orders, adSpend, leads, mode, platform, dateFrom, dateTo])

  const busy = loading || leadsLoading
  const curPreset = activePresetKey(dateFrom, dateTo)
  const rangeDays = daysBetween(dateFrom, dateTo)

  const roasCls = v => v >= 1 ? { color: C.good, fontWeight: 700 } : { color: C.bad, fontWeight: 700 }
  const headlineRoas = mode === 'direct' ? M.directROAS : M.blendedROAS
  const headlineRev = mode === 'direct' ? M.directRev : M.adRev

  const KPI = ({ l, v, s, c }) => (
    <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="text-xs" style={{ color: C.sub }}>{l}</div>
      <div className="text-xl font-bold mt-1" style={{ color: c || C.ink }}>{v}</div>
      {s && <div className="text-[11px] mt-0.5" style={{ color: C.sub }}>{s}</div>}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 rounded-lg flex-wrap" style={{ background: '#efeeea' }}>
          {DATE_PRESETS.map(p => (
            <button key={p.key} onClick={() => { const r = p.range(); setDateFrom(r.from); setDateTo(r.to) }} className="px-2.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap"
              style={{ background: curPreset === p.key ? '#fff' : 'transparent', color: curPreset === p.key ? C.gold : C.sub, boxShadow: curPreset === p.key ? '0 2px 8px rgba(0,0,0,0.06)' : 'none' }}>{p.label}</button>
          ))}
        </div>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg" style={{ border: `1px solid ${C.line}` }} />
        <span className="text-xs" style={{ color: C.sub }}>→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg" style={{ border: `1px solid ${C.line}` }} />
        <div className="flex gap-1 p-1 rounded-lg ml-auto" style={{ background: '#efeeea' }}>
          {[['blended', 'Direct + allocated'], ['direct', 'Direct only']].map(([k, lb]) => (
            <button key={k} onClick={() => setMode(k)} className="px-3 py-1.5 rounded-md text-xs font-semibold"
              style={{ background: mode === k ? '#fff' : 'transparent', color: mode === k ? C.gold : C.sub }}>{lb}</button>
          ))}
        </div>
        <select value={platform} onChange={e => setPlatform(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg font-semibold" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
          <option value="all">All platforms</option><option value="facebook">Facebook / Meta</option><option value="google">Google</option>
        </select>
      </div>

      {/* Sync-gap banner */}
      {M.gapDays != null && M.gapDays > 1 && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
          ⚠ Spend ledger has a gap — last synced {M.lastSpend} ({M.gapDays}d ago). ROAS/ROI are understated until the ad-spend sync catches up.
        </div>
      )}
      {rangeDays <= 30 && (
        <div className="text-[11px]" style={{ color: C.sub }}>ℹ Recent windows understate ROI — in-store closes lag the ad click by days-to-weeks, so this period is still maturing.</div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI l="Ad spend" v={fmtINR(M.totalSpend)} s={`${M.campList.length} campaign${M.campList.length === 1 ? '' : 's'}`} />
        <KPI l="Ad-attributed revenue" v={fmtINR(headlineRev)} s={`${fmtINR(M.directRev)} direct + ${fmtINR(M.unmappedAdRev)} alloc`} />
        <KPI l={mode === 'direct' ? 'Direct ROAS' : 'Blended true ROAS'} v={headlineRoas.toFixed(2) + 'x'} c={headlineRoas >= 1 ? C.good : C.bad} s="ad revenue ÷ spend" />
        <KPI l="Overall ROI %" v={M.totalSpend ? M.roiPct.toFixed(0) + '%' : '—'} c={M.roiPct >= 0 ? C.good : C.bad} s="(ad gross profit − spend) ÷ spend" />
        <KPI l="Ad-driven share" v={M.adShare.toFixed(0) + '%'} s="of all revenue (orders)" />
        <KPI l="UTM coverage" v={M.utmCoverage.toFixed(0) + '%'} c={M.utmCoverage >= 50 ? C.good : '#d97706'} s={`${fmtN(M.adLeadsTagged)}/${fmtN(M.adLeads)} ad leads tagged`} />
      </div>

      {/* Source ROI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SOURCES.map(k => {
          const b = M.bySource[k]
          return (
            <div key={k} className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="flex items-center justify-between">
                <div className="font-bold text-sm" style={{ color: C.ink }}>{k}</div>
                <div className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#ecfdf5', color: C.good }}>{b.adPct.toFixed(0)}% ad-driven</div>
              </div>
              <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: C.line }}>
                <div className="h-2" style={{ width: `${Math.min(100, b.adPct)}%`, background: C.good }} />
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 mt-3 text-xs">
                <span style={{ color: C.sub }}>Total revenue</span><span className="text-right font-semibold">{fmtINR(b.rev)}</span>
                <span style={{ color: C.sub }}>Ad-driven</span><span className="text-right font-semibold" style={{ color: C.good }}>{fmtINR(b.adRev)}</span>
                <span style={{ color: C.sub }}>Organic</span><span className="text-right">{fmtINR(b.organic)}</span>
                <span style={{ color: C.sub }}>Allocated spend</span><span className="text-right">{fmtINR(b.allocSpend)}</span>
                <span style={{ color: C.sub }}>Source ROAS</span><span className="text-right" style={roasCls(b.roas)}>{b.roas ? b.roas.toFixed(2) + 'x' : '—'}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Trend */}
      <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="font-bold text-sm mb-2" style={{ color: C.ink }}>Spend vs ad-attributed revenue (daily)</div>
        <TrendChart trend={M.trend} />
      </div>

      {/* Campaign table */}
      <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-sm" style={{ color: C.ink }}>Campaign detail — spend vs CRM-attributed revenue</div>
          {busy && <div className="text-xs" style={{ color: C.sub }}>Loading…</div>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="text-xs" style={{ minWidth: 1180, width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: `2px solid ${C.line}` }}>
              {['Campaign', 'Plat', 'Status', 'Spend', 'Impr', 'Clicks', 'CTR', 'CPC', 'CPM', 'Leads', 'Won', 'CVR', 'CPL', 'Cost/Won', 'Direct rev', '+Alloc', 'Direct ROAS', 'Blended ROAS'].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', color: C.sub, fontWeight: 600, padding: '6px 8px', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {M.campList.length === 0 ? (
                <tr><td colSpan={18} style={{ textAlign: 'center', color: C.sub, padding: 24 }}>No ad spend in this range. Once the daily sync runs, campaigns land here.</td></tr>
              ) : M.campList.map(c => {
                const ctr = c.impressions ? c.clicks / c.impressions * 100 : 0
                const cpc = c.clicks ? c.spend / c.clicks : 0
                const cpm = c.impressions ? c.spend / c.impressions * 1000 : 0
                const cvr = c.leads ? c.won / c.leads * 100 : 0
                const cpl = c.leads ? c.spend / c.leads : 0
                const cpw = c.won ? c.spend / c.won : 0
                const dr = c.spend ? c.directRev / c.spend : 0
                const br = c.spend ? (c.directRev + c.allocRev) / c.spend : 0
                const td = (v, st) => <td style={{ textAlign: 'right', padding: '6px 8px', whiteSpace: 'nowrap', ...st }}>{v}</td>
                return (
                  <tr key={c.key} style={{ borderBottom: `1px solid ${C.line}` }}>
                    <td style={{ padding: '6px 8px', maxWidth: 240 }}>
                      <div className="font-semibold truncate" style={{ color: C.ink }}>{c.name}</div>
                      {c.matchedUtms.size > 0 && <div className="text-[10px] truncate" style={{ color: C.sub }}>utm: {[...c.matchedUtms].join(', ')}</div>}
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', textTransform: 'capitalize' }}>{c.platform}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>{c.status || '—'}</td>
                    {td(fmtINR(c.spend))}
                    {td(c.impressions ? fmtN(c.impressions) : '—')}
                    {td(c.clicks ? fmtN(c.clicks) : '—')}
                    {td(c.impressions ? ctr.toFixed(1) + '%' : '—')}
                    {td(c.clicks ? '₹' + cpc.toFixed(0) : '—')}
                    {td(c.impressions ? '₹' + cpm.toFixed(0) : '—')}
                    {td(c.leads || '—')}
                    {td(c.won || '—')}
                    {td(c.leads ? cvr.toFixed(0) + '%' : '—')}
                    {td(c.leads ? fmtINR(cpl) : '—')}
                    {td(c.won ? fmtINR(cpw) : '—')}
                    {td(fmtINR(c.directRev))}
                    {td(fmtINR(c.allocRev), { color: C.sub })}
                    {td(dr.toFixed(2) + 'x', roasCls(dr))}
                    {td(br.toFixed(2) + 'x', roasCls(br))}
                  </tr>
                )
              })}
            </tbody>
            {M.campList.length > 0 && (
              <tfoot><tr style={{ borderTop: `2px solid ${C.line}`, fontWeight: 700 }}>
                <td style={{ padding: '6px 8px' }}>Total</td><td /><td />
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{fmtINR(M.totalSpend)}</td>
                <td colSpan={10} />
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{fmtINR(M.directRev)}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: C.sub }}>{fmtINR(M.unmappedAdRev)}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', ...roasCls(M.directROAS) }}>{M.directROAS.toFixed(2)}x</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', ...roasCls(M.blendedROAS) }}>{M.blendedROAS.toFixed(2)}x</td>
              </tr></tfoot>
            )}
          </table>
        </div>
        <div className="text-[11px] mt-2" style={{ color: C.sub }}>Direct = orders whose lead UTM matches the campaign. Allocated = ad-sourced revenue with no UTM, spread across campaigns pro-rata by spend. Orders are the source of truth; cancelled/returned excluded.</div>
      </div>

      {/* Reconciliation + data quality */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="font-bold text-sm mb-2" style={{ color: C.ink }}>Reconciliation (orders)</div>
          <table className="text-xs w-full"><tbody>
            {[['Direct (UTM-matched)', M.directRev], ['Allocated (ad, untagged)', M.unmappedAdRev], ['Organic', M.organicRev], ['Unclassified (blank/other)', M.unclassifiedRev], ['Unreconciled', M.reconDelta]].map(([l, v]) => (
              <tr key={l} style={{ borderBottom: `1px solid ${C.line}` }}><td style={{ padding: '5px 4px', color: C.sub }}>{l}</td><td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 600 }}>{fmtINR(v)}</td></tr>
            ))}
            <tr style={{ fontWeight: 700 }}><td style={{ padding: '5px 4px' }}>Total revenue</td><td style={{ padding: '5px 4px', textAlign: 'right' }}>{fmtINR(M.totalRev)}</td></tr>
          </tbody></table>
          <div className="text-[11px] mt-2" style={{ color: C.sub }}>Identity: direct + allocated + organic + unreconciled = total. A non-zero unreconciled figure surfaces attribution/channel gaps.</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-bold text-sm" style={{ color: C.ink }}>Unmapped UTMs (tagging gaps)</div>
            {M.unmapped.length > 0 && <button onClick={() => setShowUnmapped(v => !v)} className="text-xs font-semibold" style={{ color: C.gold }}>{showUnmapped ? 'Hide' : `Show ${M.unmapped.length}`}</button>}
          </div>
          {M.unmapped.length === 0 ? (
            <div className="text-xs" style={{ color: C.sub }}>No unmatched ad-sourced UTMs. 👍</div>
          ) : showUnmapped ? (
            <div className="space-y-1 max-h-56 overflow-y-auto">
              {M.unmapped.map(([u, n]) => <div key={u} className="flex justify-between text-xs" style={{ borderBottom: `1px solid ${C.line}`, padding: '3px 0' }}><span className="truncate" style={{ color: C.ink }}>{u}</span><span style={{ color: C.sub }}>{n} lead{n === 1 ? '' : 's'}</span></div>)}
            </div>
          ) : (
            <div className="text-xs" style={{ color: C.sub }}>{M.unmapped.length} ad-sourced UTM{M.unmapped.length === 1 ? '' : 's'} match no live campaign — their revenue falls into the allocated pool. Fix tagging to make it direct.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Dependency-free daily dual-line chart ──
function TrendChart({ trend }) {
  if (!trend || trend.length === 0) return <div className="text-xs" style={{ color: '#6b7280' }}>No data</div>
  const W = 720, H = 200, padL = 40, padR = 10, padT = 10, padB = 22
  const n = trend.length
  const maxY = Math.max(1, ...trend.map(t => Math.max(t.spend, t.adRev)))
  const xat = i => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR))
  const yat = v => padT + (1 - v / maxY) * (H - padT - padB)
  const line = key => trend.map((t, i) => `${xat(i).toFixed(1)},${yat(t[key]).toFixed(1)}`).join(' ')
  const fmtY = v => v >= 1e5 ? '₹' + (v / 1e5).toFixed(1) + 'L' : '₹' + Math.round(v / 1000) + 'k'
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
        {[0, 0.5, 1].map((f, i) => { const v = maxY * (1 - f), y = padT + f * (H - padT - padB); return <g key={i}><line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#eee" /><text x={padL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#6b7280">{fmtY(v)}</text></g> })}
        <polyline points={line('spend')} fill="none" stroke="#d1a054" strokeWidth="2" />
        <polyline points={line('adRev')} fill="none" stroke="#047857" strokeWidth="2" />
        {n > 0 && <><text x={padL} y={H - 6} fontSize="9" fill="#6b7280">{trend[0].d.slice(5)}</text><text x={W - padR} y={H - 6} textAnchor="end" fontSize="9" fill="#6b7280">{trend[n - 1].d.slice(5)}</text></>}
      </svg>
      <div className="flex gap-4 justify-center mt-1 text-xs" style={{ color: '#4b4b47' }}>
        <span className="inline-flex items-center gap-1.5"><span style={{ width: 14, height: 3, background: '#d1a054', display: 'inline-block' }} />Spend</span>
        <span className="inline-flex items-center gap-1.5"><span style={{ width: 14, height: 3, background: '#047857', display: 'inline-block' }} />Ad-attributed revenue</span>
      </div>
    </div>
  )
}

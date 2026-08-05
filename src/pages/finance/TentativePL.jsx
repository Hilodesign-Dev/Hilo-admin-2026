import React, { useState, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, fmtCurrency } from '../../lib/designTokens'
import { F } from './constants'
import { n } from '../../lib/helpers'

/* ═══════════════════════════════════════════════════════════════════════════
   TENTATIVE P&L — AI-Categorized Burn Analysis
   Mirrors the real P&L waterfall (CM1 → CM2 → EBITDA → Net)

   Revenue         → shopify_orders (same as real P&L)
   ALL expenses    → tentative_expenses (auto-categorized from bank narrations)
   Date            → bank transaction date (cash basis)

   Standalone module. No links to expense_mirror, settlement, or any module.
   Trained on April 2026 settled data patterns.
   ═══════════════════════════════════════════════════════════════════════════ */

const MONTH_LABELS = { '2025-12': 'Dec 25', '2026-01': 'Jan 26', '2026-02': 'Feb 26', '2026-03': 'Mar 26', '2026-04': 'Apr 26', '2026-05': 'May 26' }

const PL_BUCKETS_CM1 = ['cm1_fabric', 'cm1_dye', 'cm1_stitch', 'cm1_embroidery', 'cm1_misc_prod', 'in_house_wages']
const PL_BUCKETS_CM2 = ['production_rent', 'bank_charges', 'courier', 'cm2_misc_fulfil']
const PL_BUCKETS_OPEX = ['salaries', 'advertising', 'marketing', 'cataloguing', 'software', 'store', 'other']
const PL_BUCKETS_TAX = ['tax_gst', 'tax_tds', 'tax_advance']

const BUCKET_DISPLAY = {
  cm1_fabric: 'Fabric', cm1_dye: 'Dyeing', cm1_stitch: 'Stitching', cm1_embroidery: 'Embroidery',
  cm1_misc_prod: 'Misc Production', in_house_wages: 'In-House Wages',
  production_rent: 'Rent', bank_charges: 'Bank Charges', courier: 'Courier', cm2_misc_fulfil: 'Misc Fulfilment',
  salaries: 'Salaries', advertising: 'Advertising', marketing: 'Marketing', cataloguing: 'Cataloguing',
  software: 'Software', store: 'Store Exp', other: 'Other/Unclassified',
  tax_gst: 'GST', tax_tds: 'TDS', tax_advance: 'Statutory', loan_emi: 'Loan EMI',
}

const TentativePL = ({ user }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [viewMode, setViewMode] = useState('waterfall')
  const [dateMode, setDateMode] = useState('custom')
  const [customStart, setCustomStart] = useState('2025-12-01')
  const [customEnd, setCustomEnd] = useState('2026-04-30')
  const [expanded, setExpanded] = useState({
    revenue: true, fabricCosts: false, dyeing: false, stitching: false, embroidery: false,
    otherDirect: true, indirect: true, salaries: false, ads: false, marketing: false,
    cataloguing: false, software: false, store: false, otherExpenses: false, gstPaid: false,
    tds: false, statutory: false, loans: false, confSummary: false,
  })

  useEffect(() => { fetchPLData() }, [dateMode, customStart, customEnd])

  const getDateRange = () => {
    const today = new Date()
    let start, end
    switch (dateMode) {
      case 'this-month':
        start = new Date(today.getFullYear(), today.getMonth(), 1)
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        break
      case 'last-month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        end = new Date(today.getFullYear(), today.getMonth(), 0)
        break
      case 'this-quarter': {
        const q = Math.floor(today.getMonth() / 3)
        start = new Date(today.getFullYear(), q * 3, 1)
        end = new Date(today.getFullYear(), (q + 1) * 3, 0)
        break
      }
      case 'fy': {
        const fy = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
        start = new Date(fy, 3, 1)
        end = new Date(fy + 1, 2, 31)
        break
      }
      case 'custom':
        start = customStart ? new Date(customStart) : new Date('2025-12-01')
        end = customEnd ? new Date(customEnd) : today
        break
      default:
        start = new Date(today.getFullYear(), today.getMonth(), 1)
        end = today
    }
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
  }

  const fetchPLData = async () => {
    setLoading(true)
    try {
      const { start, end } = getDateRange()

      const [ordersRes, tentativeRes] = await Promise.all([
        // Revenue — Shopify orders (same as real P&L)
        supa.from('shopify_orders').select('total_sp_ex_gst, channel, source')
          .gte('created_at', `${start}T00:00:00`).lte('created_at', `${end}T23:59:59`),
        // ALL expenses — from tentative_expenses (AI-categorized)
        supa.from('tentative_expenses').select('*')
          .gte('date', start).lte('date', end),
      ])

      // ─── Revenue ───────────────────────────────────────────────────────
      const revenue = { storeSales: 0, onlineSales: 0, marketplaceSales: 0, reengagement: 0, total: 0 }
      const MARKETPLACES = ['Jayapore', 'AZA Fashions', 'Talasha', 'Mirraw', 'Pop Club', 'Trendia', 'Myntra', 'Amazon.com', 'Eleganzaa']
      ;(ordersRes.data || []).forEach(o => {
        const amt = n(o.total_sp_ex_gst)
        revenue.total += amt
        if (o.source === 'Reengagement') revenue.reengagement += amt
        if (o.channel === 'Online') revenue.onlineSales += amt
        else if (MARKETPLACES.includes(o.channel)) revenue.marketplaceSales += amt
        else revenue.storeSales += amt
      })

      // ─── ALL Tentative Expenses — grouped by pl_bucket with payee breakdown ─
      const expByBucket = {}
      let confStats = { high: 0, medium: 0, low: 0, highAmt: 0, medAmt: 0, lowAmt: 0, total: 0, totalAmt: 0 }

      ;(tentativeRes.data || []).forEach(item => {
        const amt = Number(item.amount) || 0
        const bucket = item.guessed_pl_bucket || 'other'
        const label = item.guessed_category || 'Unclassified'

        if (!expByBucket[bucket]) expByBucket[bucket] = { total: 0, breakdown: {} }
        expByBucket[bucket].total += amt
        expByBucket[bucket].breakdown[label] = (expByBucket[bucket].breakdown[label] || 0) + amt

        // Track confidence
        confStats[item.confidence] += 1
        confStats[item.confidence + 'Amt'] += amt
        confStats.total += 1
        confStats.totalAmt += amt
      })

      const getBucket = (key) => expByBucket[key] || { total: 0, breakdown: {} }

      // ─── CM1 — Direct Production Costs ────────────────────────────────
      const fabricTotal = getBucket('cm1_fabric').total
      const fabricBreakdown = getBucket('cm1_fabric').breakdown
      const dyeTotal = getBucket('cm1_dye').total
      const dyeBreakdown = getBucket('cm1_dye').breakdown
      const stitchTotal = getBucket('cm1_stitch').total
      const stitchBreakdown = getBucket('cm1_stitch').breakdown
      const embroideryTotal = getBucket('cm1_embroidery').total
      const embroideryBreakdown = getBucket('cm1_embroidery').breakdown
      const miscProductionCost = getBucket('cm1_misc_prod').total
      const miscProdBreakdown = getBucket('cm1_misc_prod').breakdown
      const inHouseWages = getBucket('in_house_wages').total
      const inHouseWagesBreakdown = getBucket('in_house_wages').breakdown

      const cm1Costs = fabricTotal + dyeTotal + stitchTotal + embroideryTotal + miscProductionCost + inHouseWages
      const netOperatingIncome = revenue.total
      const cm1 = netOperatingIncome - cm1Costs

      // ─── CM2 — Production & Fulfilment Costs ─────────────────────────
      const productionRent = getBucket('production_rent').total
      const bankCharges = getBucket('bank_charges').total
      const bankChargesBreakdown = getBucket('bank_charges').breakdown
      const productCourier = getBucket('courier').total
      const courierBreakdown = getBucket('courier').breakdown
      const miscFulfilmentCost = getBucket('cm2_misc_fulfil').total
      const miscFulfilBreakdown = getBucket('cm2_misc_fulfil').breakdown

      const cm2Costs = productionRent + bankCharges + productCourier + miscFulfilmentCost
      const cm2 = cm1 - cm2Costs

      // ─── Indirect / Overhead Expenses ─────────────────────────────────
      const salariesTotal = getBucket('salaries').total
      const salariesBreakdown = getBucket('salaries').breakdown
      const advertisingTotal = getBucket('advertising').total
      const advertisingBreakdown = getBucket('advertising').breakdown
      const marketingTotal = getBucket('marketing').total
      const marketingBreakdown = getBucket('marketing').breakdown
      const cataloguingTotal = getBucket('cataloguing').total
      const cataloguingBreakdown = getBucket('cataloguing').breakdown
      const softwareTotal = getBucket('software').total
      const softwareBreakdown = getBucket('software').breakdown
      const storeExpTotal = getBucket('store').total
      const storeExpBreakdown = getBucket('store').breakdown
      const otherIndirect = getBucket('other').total
      const otherIndBreakdown = getBucket('other').breakdown

      const totalIndirect = salariesTotal + advertisingTotal + marketingTotal + cataloguingTotal + softwareTotal + storeExpTotal + otherIndirect
      const ebitda = cm2 - totalIndirect

      // ─── Taxes & Statutory ──────────────────────────────────────────
      const gstPayable = getBucket('tax_gst').total
      const gstFilingDetails = Object.entries(getBucket('tax_gst').breakdown).map(([label, amount]) => ({ label, amount }))
      const totalTds = getBucket('tax_tds').total
      const tdsBreakdown = getBucket('tax_tds').breakdown
      const statutoryTotal = getBucket('tax_advance').total
      const statutoryBreakdown = getBucket('tax_advance').breakdown

      const totalTaxes = gstPayable + totalTds + statutoryTotal
      const operatingProfit = ebitda - totalTaxes

      // ─── Loans ────────────────────────────────────────────────────────
      const loansTotal = getBucket('loan_emi').total
      const loansByLender = getBucket('loan_emi').breakdown

      const netProfit = operatingProfit - loansTotal

      // ─── Monthly Data for Burn Analysis ─────────────────────────────
      const monthlyMap = {}
      const toYM = (d) => d ? d.slice(0, 7) : null

      ;(ordersRes.data || []).forEach(o => {
        const ym = toYM(o.created_at)
        if (!ym) return
        if (!monthlyMap[ym]) monthlyMap[ym] = { revenue: 0, buckets: {} }
        monthlyMap[ym].revenue += n(o.total_sp_ex_gst)
      })

      ;(tentativeRes.data || []).forEach(item => {
        const ym = toYM(item.date)
        if (!ym) return
        if (!monthlyMap[ym]) monthlyMap[ym] = { revenue: 0, buckets: {} }
        const bucket = item.guessed_pl_bucket || 'other'
        const amt = Number(item.amount) || 0
        monthlyMap[ym].buckets[bucket] = (monthlyMap[ym].buckets[bucket] || 0) + amt
      })

      const months = Object.keys(monthlyMap).sort()
      let cumBurn = 0
      const monthlyData = months.map(ym => {
        const m = monthlyMap[ym]
        const rev = m.revenue
        const b = (key) => m.buckets[key] || 0
        const cm1Cost = PL_BUCKETS_CM1.reduce((s, k) => s + b(k), 0)
        const cm1Val = rev - cm1Cost
        const cm2Cost = PL_BUCKETS_CM2.reduce((s, k) => s + b(k), 0)
        const cm2Val = cm1Val - cm2Cost
        const opexCost = PL_BUCKETS_OPEX.reduce((s, k) => s + b(k), 0)
        const ebitdaVal = cm2Val - opexCost
        const taxCost = PL_BUCKETS_TAX.reduce((s, k) => s + b(k), 0)
        const loanCost = b('loan_emi')
        const net = ebitdaVal - taxCost - loanCost
        cumBurn += net < 0 ? net : 0
        return {
          month: ym, label: MONTH_LABELS[ym] || ym,
          revenue: rev, cm1Cost, cm1: cm1Val, cm2Cost, cm2: cm2Val,
          opex: opexCost, ebitda: ebitdaVal, taxes: taxCost, loans: loanCost, net,
          cm1Pct: rev > 0 ? (cm1Val / rev) * 100 : 0,
          cm2Pct: rev > 0 ? (cm2Val / rev) * 100 : 0,
          ebitdaPct: rev > 0 ? (ebitdaVal / rev) * 100 : 0,
          netPct: rev > 0 ? (net / rev) * 100 : 0,
          cumBurn,
          buckets: m.buckets,
        }
      })

      setData({
        dateRange: { start, end },
        revenue, confStats, monthlyData,
        fabricTotal, fabricBreakdown,
        dyeTotal, dyeBreakdown,
        stitchTotal, stitchBreakdown,
        embroideryTotal, embroideryBreakdown,
        miscProductionCost, miscProdBreakdown,
        inHouseWages, inHouseWagesBreakdown,
        cm1, cm1Costs,
        productionRent,
        bankCharges, bankChargesBreakdown,
        productCourier, courierBreakdown,
        miscFulfilmentCost, miscFulfilBreakdown,
        cm2, cm2Costs,
        salariesTotal, salariesBreakdown,
        advertisingTotal, advertisingBreakdown,
        marketingTotal, marketingBreakdown,
        cataloguingTotal, cataloguingBreakdown,
        softwareTotal, softwareBreakdown,
        storeExpTotal, storeExpBreakdown,
        otherIndirect, otherIndBreakdown,
        totalIndirect,
        ebitda,
        gstPayable, gstFilingDetails,
        tdsTotal: totalTds, tdsBreakdown,
        statutoryTotal, statutoryBreakdown,
        totalTaxes,
        operatingProfit,
        loansByLender, loansTotal,
        netProfit,
      })
    } catch (e) {
      console.error('Tentative P&L fetch error:', e)
      toast(false, 'Failed to load tentative P&L data')
    } finally { setLoading(false) }
  }

  if (!data) return <div className="p-6 text-center" style={{ color: C.textMuted }}>Loading…</div>

  // ─── Helpers ────────────────────────────────────────────────────────────
  const pct = (val, base) => base > 0 ? ((val / base) * 100).toFixed(1) : '0.0'
  const rev = data.revenue.total
  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  // ─── Row Components (identical to real P&L) ────────────────────────────
  const SectionHeader = ({ label, amount, onClick, isOpen, color }) => (
    <div className="flex justify-between items-center px-4 py-2.5 cursor-pointer transition-colors hover:bg-gray-50/80"
      style={{ background: (color || F.direct) + '08' }} onClick={onClick}>
      <span className="flex items-center gap-2">
        <span className="text-[10px] transition-transform" style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        <span className="font-bold text-sm" style={{ color: color || F.direct }}>{label}</span>
      </span>
      <span className="text-sm font-bold" style={{ fontFamily: 'JetBrains Mono, monospace', color: F.loss }}>{fmtCurrency(amount)}</span>
    </div>
  )

  const SubRow = ({ label, amount, showPct = true }) => (
    <div className="flex justify-between items-center px-4 py-2 ml-5" style={{ borderBottom: `1px solid ${C.borderLight}` }}>
      <span className="text-xs" style={{ color: '#4e4636' }}>{label}</span>
      <div className="text-right flex items-center gap-3">
        <span className="text-xs font-semibold" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#1b1c1a' }}>{fmtCurrency(amount)}</span>
        {showPct && <span className="text-[10px] w-10 text-right" style={{ color: C.textMuted }}>{pct(amount, rev)}%</span>}
      </div>
    </div>
  )

  const BreakdownRows = ({ data: breakdownData }) => {
    const sorted = Object.entries(breakdownData).sort((a, b) => b[1] - a[1])
    return sorted.map(([name, amt]) => <SubRow key={name} label={name} amount={amt} />)
  }

  const TotalRow = ({ label, amount, color, showPctOfRev = true }) => (
    <div className="flex justify-between items-center px-4 py-3 font-bold" style={{ background: C.goldLight, borderTop: `2px solid ${C.gold}`, borderBottom: `2px solid ${C.gold}` }}>
      <span className="text-sm" style={{ color: color || C.text }}>{label}</span>
      <div className="text-right flex items-center gap-3">
        <span className="text-base" style={{ fontFamily: 'JetBrains Mono, monospace', color: amount >= 0 ? F.profit : F.loss }}>{fmtCurrency(amount)}</span>
        {showPctOfRev && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: amount >= 0 ? C.greenBg : C.redBg, color: amount >= 0 ? F.profit : F.loss }}>{pct(amount, rev)}%</span>}
      </div>
    </div>
  )

  const MarginRow = ({ label, amount, info }) => (
    <div className="flex justify-between items-center px-4 py-3" style={{ background: 'linear-gradient(135deg, rgba(212,168,67,0.06), rgba(212,168,67,0.02))' }}>
      <div>
        <span className="text-sm font-bold" style={{ color: C.text }}>{label}</span>
        {info && <span className="text-[10px] ml-2" style={{ color: C.textMuted }}>{info}</span>}
      </div>
      <div className="text-right flex items-center gap-3">
        <span className="text-base font-bold" style={{ fontFamily: 'JetBrains Mono, monospace', color: amount >= 0 ? F.profit : F.loss }}>{fmtCurrency(amount)}</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: amount >= 0 ? C.greenBg : C.redBg, color: amount >= 0 ? F.profit : F.loss }}>{pct(amount, rev)}%</span>
      </div>
    </div>
  )

  const cs = data.confStats

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5" style={{ fontFamily: 'Manrope, sans-serif' }}>

      {/* ── Date Filter ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap gap-2 mb-1">
          {[
            { key: 'this-month', label: 'This Month' },
            { key: 'last-month', label: 'Last Month' },
            { key: 'this-quarter', label: 'This Quarter' },
            { key: 'fy', label: 'FY 25-26' },
            { key: 'custom', label: 'Custom' },
          ].map(opt => (
            <button key={opt.key} onClick={() => setDateMode(opt.key)}
              className="text-xs px-3 py-1.5 rounded-lg font-bold transition-all"
              style={{ background: dateMode === opt.key ? C.gold : C.bg, color: dateMode === opt.key ? '#fff' : C.text, border: `1px solid ${dateMode === opt.key ? C.gold : C.border}` }}>
              {opt.label}
            </button>
          ))}
        </div>
        {dateMode === 'custom' && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-xs font-bold" style={{ color: '#4e4636' }}>Start</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="w-full mt-1 text-sm px-3 py-2 rounded-lg outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
            </div>
            <div>
              <label className="text-xs font-bold" style={{ color: '#4e4636' }}>End</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="w-full mt-1 text-sm px-3 py-2 rounded-lg outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>Tentative — AI Categorized</span>
          <span className="text-[10px]" style={{ color: C.textMuted }}>Expenses auto-classified from bank narrations, not settlement</span>
        </div>
      </div>

      {/* ── Confidence Summary ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => toggle('confSummary')}>
          <span className="text-xs font-bold" style={{ color: C.text }}>AI Classification Confidence — {cs.total} transactions</span>
          <span className="text-[10px]" style={{ color: C.textMuted }}>{expanded.confSummary ? '▼' : '▶'}</span>
        </div>
        <div className="flex rounded-full h-3 overflow-hidden" style={{ background: '#e8e6e0' }}>
          {cs.total > 0 && <>
            <div style={{ width: `${(cs.high / cs.total) * 100}%`, background: '#16a34a' }} title={`High: ${cs.high}`}></div>
            <div style={{ width: `${(cs.medium / cs.total) * 100}%`, background: '#d97706' }} title={`Medium: ${cs.medium}`}></div>
            <div style={{ width: `${(cs.low / cs.total) * 100}%`, background: '#dc2626' }} title={`Low: ${cs.low}`}></div>
          </>}
        </div>
        {expanded.confSummary && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="rounded-lg p-2" style={{ background: '#ecfdf5' }}>
              <div className="text-[10px] font-bold" style={{ color: '#065f46' }}>High — {cs.high} txns</div>
              <div className="text-sm font-bold mt-0.5" style={{ color: '#065f46' }}>{fmtCurrency(Math.round(cs.highAmt))}</div>
              <div className="text-[9px]" style={{ color: '#065f46' }}>Known vendors, EMIs, salaries</div>
            </div>
            <div className="rounded-lg p-2" style={{ background: '#fffbeb' }}>
              <div className="text-[10px] font-bold" style={{ color: '#92400e' }}>Medium — {cs.medium} txns</div>
              <div className="text-sm font-bold mt-0.5" style={{ color: '#92400e' }}>{fmtCurrency(Math.round(cs.medAmt))}</div>
              <div className="text-[9px]" style={{ color: '#92400e' }}>Partial pattern match</div>
            </div>
            <div className="rounded-lg p-2" style={{ background: '#fef2f2' }}>
              <div className="text-[10px] font-bold" style={{ color: '#991b1b' }}>Low — {cs.low} txns</div>
              <div className="text-sm font-bold mt-0.5" style={{ color: '#991b1b' }}>{fmtCurrency(Math.round(cs.lowAmt))}</div>
              <div className="text-[9px]" style={{ color: '#991b1b' }}>Unclassified narrations</div>
            </div>
          </div>
        )}
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'CM1%', value: pct(data.cm1, rev) + '%', sub: 'Product Margin', color: C.blue },
          { label: 'CM2 / Gross Profit', value: fmtCurrency(data.cm2), sub: pct(data.cm2, rev) + '% margin', color: F.profit },
          { label: 'EBITDA', value: fmtCurrency(data.ebitda), sub: pct(data.ebitda, rev) + '% margin', color: C.purple },
          { label: 'Net Profit', value: fmtCurrency(data.netProfit), sub: pct(data.netProfit, rev) + '% margin', color: data.netProfit >= 0 ? F.profit : F.loss },
          { label: 'Revenue', value: fmtCurrency(rev), sub: `${data.dateRange.start} → ${data.dateRange.end}`, color: C.gold },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl p-3" style={{ borderLeft: `4px solid ${kpi.color}` }}>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#4e4636' }}>{kpi.label}</div>
            <div className="text-lg font-bold mt-1" style={{ color: kpi.color, fontFamily: 'JetBrains Mono, monospace' }}>{kpi.value}</div>
            <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* ── View Toggle ─────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}`, width: 'fit-content' }}>
        {[{ key: 'waterfall', label: 'P&L Waterfall' }, { key: 'burn', label: 'Burn Analysis' }].map(v => (
          <button key={v.key} onClick={() => setViewMode(v.key)}
            className="text-xs px-4 py-2 rounded-lg font-bold transition-all"
            style={{ background: viewMode === v.key ? C.gold : 'transparent', color: viewMode === v.key ? '#fff' : C.text }}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ── BURN ANALYSIS VIEW ──────────────────────────────────────── */}
      {viewMode === 'burn' && data.monthlyData && (() => {
        const md = data.monthlyData
        if (md.length === 0) return <div className="bg-white rounded-2xl p-6 text-center text-sm" style={{ color: C.textMuted }}>No monthly data available</div>

        // Chart dimensions
        const chartW = 640, chartH = 260, padL = 55, padR = 20, padT = 30, padB = 40
        const plotW = chartW - padL - padR, plotH = chartH - padT - padB
        const allPcts = md.flatMap(m => [m.cm1Pct, m.cm2Pct, m.ebitdaPct, m.netPct])
        const maxP = Math.max(Math.ceil(Math.max(...allPcts) / 10) * 10, 10)
        const minP = Math.min(Math.floor(Math.min(...allPcts) / 10) * 10, -10)
        const rangeP = maxP - minP
        const yScale = (v) => padT + ((maxP - v) / rangeP) * plotH
        const xStep = md.length > 1 ? plotW / (md.length - 1) : plotW / 2

        const lines = [
          { key: 'cm1Pct', color: '#16a34a', label: 'CM1%' },
          { key: 'cm2Pct', color: '#3b82f6', label: 'Gross Margin%' },
          { key: 'ebitdaPct', color: '#7c3aed', label: 'EBITDA%' },
          { key: 'netPct', color: '#dc2626', label: 'Net%' },
        ]

        // Heatmap — top expense categories
        const allBucketKeys = [...new Set(md.flatMap(m => Object.keys(m.buckets)))]
        const bucketTotals = allBucketKeys.map(k => ({ key: k, total: md.reduce((s, m) => s + (m.buckets[k] || 0), 0) }))
        bucketTotals.sort((a, b) => b.total - a.total)
        const topBuckets = bucketTotals.slice(0, 10).filter(b => b.total > 0)
        const heatMax = Math.max(...topBuckets.flatMap(b => md.map(m => m.buckets[b.key] || 0)), 1)

        const heatColor = (val) => {
          if (val === 0) return '#f9fafb'
          const intensity = Math.min(val / heatMax, 1)
          const r = Math.round(220 - intensity * 180)
          const g = Math.round(38 + intensity * 10)
          const b = Math.round(38 + intensity * 10)
          return `rgba(${r}, ${g}, ${b}, ${0.15 + intensity * 0.85})`
        }
        const heatText = (val) => {
          const intensity = val / heatMax
          return intensity > 0.5 ? '#fff' : '#1b1c1a'
        }

        return (
          <div className="space-y-4">
            {/* ─── Section 1: Monthly P&L Snapshot Table ──────────────── */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <div className="px-4 py-3" style={{ background: C.bg }}>
                <span className="font-bold text-sm" style={{ color: C.text }}>Monthly P&L Snapshot</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      <th className="text-left px-3 py-2.5 font-bold text-xs" style={{ color: '#4e4636', fontFamily: 'Manrope, sans-serif' }}>Metric</th>
                      {md.map(m => <th key={m.month} className="text-right px-3 py-2.5 font-bold text-xs" style={{ color: '#4e4636', fontFamily: 'Manrope, sans-serif' }}>{m.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Revenue', key: 'revenue', fmt: true },
                      { label: 'COGS (CM1 Costs)', key: 'cm1Cost', fmt: true, dimColor: true },
                      { label: 'Gross Profit (CM2)', key: 'cm2', fmt: true, highlight: true },
                      { label: 'Gross Margin %', key: 'cm2Pct', suffix: '%', highlight: true },
                      { label: 'OpEx', key: 'opex', fmt: true, dimColor: true },
                      { label: 'EBITDA', key: 'ebitda', fmt: true, highlight: true },
                      { label: 'EBITDA %', key: 'ebitdaPct', suffix: '%', highlight: true },
                      { label: 'Taxes + Loans', key: null, computed: (m) => m.taxes + m.loans, fmt: true, dimColor: true },
                      { label: 'Net Profit / (Burn)', key: 'net', fmt: true, colorCode: true },
                      { label: 'Cumulative Burn', key: 'cumBurn', fmt: true, colorCode: true },
                    ].map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: `1px solid ${C.borderLight}`, background: row.highlight ? 'rgba(212,168,67,0.04)' : 'transparent' }}>
                        <td className="px-3 py-2.5 font-bold" style={{ fontFamily: 'Manrope, sans-serif', color: '#4e4636', fontSize: 12 }}>{row.label}</td>
                        {md.map(m => {
                          const val = row.computed ? row.computed(m) : m[row.key]
                          const display = row.fmt ? fmtCurrency(Math.round(val)) : (val || 0).toFixed(1) + (row.suffix || '')
                          let clr = '#1b1c1a'
                          if (row.colorCode) clr = val >= 0 ? F.profit : F.loss
                          if (row.dimColor) clr = '#64748b'
                          return <td key={m.month} className="text-right px-3 py-2.5" style={{ color: clr, fontSize: 11 }}>{display}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ─── Section 2: Margin Trend Chart ─────────────────────── */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <div className="px-4 py-3 flex items-center justify-between" style={{ background: C.bg }}>
                <span className="font-bold text-sm" style={{ color: C.text }}>Margin Trends</span>
                <div className="flex gap-3">
                  {lines.map(l => (
                    <span key={l.key} className="flex items-center gap-1">
                      <span style={{ width: 10, height: 3, background: l.color, borderRadius: 2, display: 'inline-block' }}></span>
                      <span className="text-[10px]" style={{ color: C.textMuted }}>{l.label}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="px-4 py-3 flex justify-center">
                <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', maxWidth: chartW }}>
                  {/* Grid lines */}
                  {Array.from({ length: 5 }, (_, i) => {
                    const val = minP + (rangeP / 4) * i
                    const y = yScale(val)
                    return (
                      <g key={i}>
                        <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="#e8e6e0" strokeWidth="1" strokeDasharray={val === 0 ? '0' : '4,3'} />
                        <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#9ca3af" fontFamily="JetBrains Mono, monospace">{val.toFixed(0)}%</text>
                      </g>
                    )
                  })}
                  {/* Zero line */}
                  {minP < 0 && maxP > 0 && <line x1={padL} y1={yScale(0)} x2={chartW - padR} y2={yScale(0)} stroke="#374151" strokeWidth="1.5" />}
                  {/* X-axis labels */}
                  {md.map((m, i) => (
                    <text key={m.month} x={padL + i * xStep} y={chartH - 8} textAnchor="middle" fontSize="10" fill="#4e4636" fontFamily="Manrope, sans-serif" fontWeight="600">{m.label}</text>
                  ))}
                  {/* Lines + dots */}
                  {lines.map(line => {
                    const pts = md.map((m, i) => `${padL + i * xStep},${yScale(m[line.key])}`)
                    return (
                      <g key={line.key}>
                        <polyline points={pts.join(' ')} fill="none" stroke={line.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                        {md.map((m, i) => (
                          <g key={i}>
                            <circle cx={padL + i * xStep} cy={yScale(m[line.key])} r="4" fill="#fff" stroke={line.color} strokeWidth="2" />
                            <text x={padL + i * xStep} y={yScale(m[line.key]) - 8} textAnchor="middle" fontSize="9" fill={line.color} fontFamily="JetBrains Mono, monospace" fontWeight="600">
                              {m[line.key].toFixed(1)}%
                            </text>
                          </g>
                        ))}
                      </g>
                    )
                  })}
                </svg>
              </div>
            </div>

            {/* ─── Section 3: Expense Category Heatmap ───────────────── */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <div className="px-4 py-3" style={{ background: C.bg }}>
                <span className="font-bold text-sm" style={{ color: C.text }}>Expense Heatmap — Top Categories</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: C.bg }}>
                      <th className="text-left px-3 py-2 font-bold" style={{ color: '#4e4636', minWidth: 130 }}>Category</th>
                      {md.map(m => <th key={m.month} className="text-center px-3 py-2 font-bold" style={{ color: '#4e4636', minWidth: 90 }}>{m.label}</th>)}
                      <th className="text-right px-3 py-2 font-bold" style={{ color: '#4e4636' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topBuckets.map((b, bi) => (
                      <tr key={b.key} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                        <td className="px-3 py-2.5 font-bold" style={{ color: '#4e4636', fontSize: 11 }}>{BUCKET_DISPLAY[b.key] || b.key}</td>
                        {md.map(m => {
                          const val = m.buckets[b.key] || 0
                          return (
                            <td key={m.month} className="text-center px-2 py-2" style={{ background: heatColor(val) }}>
                              <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: heatText(val), fontWeight: 600 }}>
                                {val > 0 ? (val >= 100000 ? `${(val / 100000).toFixed(1)}L` : fmtCurrency(Math.round(val))) : '—'}
                              </span>
                            </td>
                          )
                        })}
                        <td className="text-right px-3 py-2.5" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: '#1b1c1a' }}>
                          {b.total >= 100000 ? `₹${(b.total / 100000).toFixed(1)}L` : fmtCurrency(Math.round(b.total))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── P&L Waterfall ────────────────────────────────────────────── */}
      {viewMode === 'waterfall' && <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: C.bg }}>
          <div className="flex items-center gap-2">
            <span className="font-bold" style={{ color: C.text }}>Tentative P&L Waterfall</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: '#fef3c7', color: '#92400e' }}>AI</span>
          </div>
          {loading && <span className="text-xs animate-pulse" style={{ color: C.textMuted }}>Updating…</span>}
        </div>

        {/* ═══ REVENUE ═══ */}
        <SectionHeader label="Revenue" amount={rev} onClick={() => toggle('revenue')} isOpen={expanded.revenue} color={F.profit} />
        {expanded.revenue && (
          <>
            <SubRow label="Sales at Store" amount={data.revenue.storeSales} />
            <SubRow label="Online Sales" amount={data.revenue.onlineSales} />
            <SubRow label="Market Places" amount={data.revenue.marketplaceSales} />
            {data.revenue.reengagement > 0 && <SubRow label="Re-Engagement Revenue" amount={data.revenue.reengagement} />}
          </>
        )}
        <TotalRow label="Net Operating Income" amount={rev} />

        {/* ═══ DIRECT EXPENSES — CM1 ═══ */}
        <div className="px-4 py-2" style={{ background: '#fef3c7' }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#92400e' }}>Direct Production Costs (CM1)</span>
        </div>

        <SectionHeader label={`Fabric Costs (${Object.keys(data.fabricBreakdown).length} vendors)`} amount={data.fabricTotal}
          onClick={() => toggle('fabricCosts')} isOpen={expanded.fabricCosts} color="#7c3aed" />
        {expanded.fabricCosts && <BreakdownRows data={data.fabricBreakdown} />}

        <SectionHeader label={`Dyeing (${Object.keys(data.dyeBreakdown).length} vendors)`} amount={data.dyeTotal}
          onClick={() => toggle('dyeing')} isOpen={expanded.dyeing} color="#0891b2" />
        {expanded.dyeing && <BreakdownRows data={data.dyeBreakdown} />}

        <SectionHeader label={`Stitching Costs (${Object.keys(data.stitchBreakdown).length} vendors)`} amount={data.stitchTotal}
          onClick={() => toggle('stitching')} isOpen={expanded.stitching} color="#ea580c" />
        {expanded.stitching && <BreakdownRows data={data.stitchBreakdown} />}

        <SectionHeader label={`Embroidery Costs (${Object.keys(data.embroideryBreakdown).length} vendors)`} amount={data.embroideryTotal}
          onClick={() => toggle('embroidery')} isOpen={expanded.embroidery} color="#be185d" />
        {expanded.embroidery && <BreakdownRows data={data.embroideryBreakdown} />}

        {data.miscProductionCost > 0 && (
          <>
            <SectionHeader label="Misc Production Cost" amount={data.miscProductionCost}
              onClick={() => toggle('miscProd')} isOpen={expanded.miscProd} color="#b45309" />
            {expanded.miscProd && <BreakdownRows data={data.miscProdBreakdown} />}
          </>
        )}

        <SectionHeader label="In-House Wages" amount={data.inHouseWages}
          onClick={() => toggle('inHouseWages')} isOpen={expanded.inHouseWages} color="#6d28d9" />
        {expanded.inHouseWages && <BreakdownRows data={data.inHouseWagesBreakdown} />}

        <MarginRow label="CM1 — Contribution Margin 1" amount={data.cm1} info="Revenue − Raw Materials, Outsource & Wages" />

        {/* ═══ CM2 ═══ */}
        <div className="px-4 py-2" style={{ background: '#e0e7ff' }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#3730a3' }}>Production & Fulfilment Costs (CM2)</span>
        </div>

        <SubRow label="Production / Office Rent" amount={data.productionRent} />

        <SectionHeader label="Bank Charges" amount={data.bankCharges}
          onClick={() => toggle('bankChargesExp')} isOpen={expanded.bankChargesExp} color="#6366f1" />
        {expanded.bankChargesExp && <BreakdownRows data={data.bankChargesBreakdown} />}

        <SectionHeader label="Product Courier" amount={data.productCourier}
          onClick={() => toggle('courierExp')} isOpen={expanded.courierExp} color="#0d9488" />
        {expanded.courierExp && <BreakdownRows data={data.courierBreakdown} />}

        {data.miscFulfilmentCost > 0 && (
          <>
            <SectionHeader label="Misc Fulfilment Cost" amount={data.miscFulfilmentCost}
              onClick={() => toggle('miscFulfil')} isOpen={expanded.miscFulfil} color="#64748b" />
            {expanded.miscFulfil && <BreakdownRows data={data.miscFulfilBreakdown} />}
          </>
        )}

        <MarginRow label="CM2 — Gross Profit" amount={data.cm2} info="CM1 − Rent, Bank Charges, Courier" />

        {/* ═══ INDIRECT EXPENSES ═══ */}
        <div className="px-4 py-2" style={{ background: '#fce7f3' }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9d174d' }}>Indirect / Overhead Expenses</span>
        </div>

        <SectionHeader label="Salaries & Wages" amount={data.salariesTotal}
          onClick={() => toggle('salaries')} isOpen={expanded.salaries} color="#4338ca" />
        {expanded.salaries && <BreakdownRows data={data.salariesBreakdown} />}

        <SectionHeader label="Advertisement" amount={data.advertisingTotal}
          onClick={() => toggle('ads')} isOpen={expanded.ads} color="#c2410c" />
        {expanded.ads && <BreakdownRows data={data.advertisingBreakdown} />}

        {data.marketingTotal > 0 && (
          <>
            <SectionHeader label="Marketing" amount={data.marketingTotal}
              onClick={() => toggle('marketing')} isOpen={expanded.marketing} color="#059669" />
            {expanded.marketing && <BreakdownRows data={data.marketingBreakdown} />}
          </>
        )}

        {data.cataloguingTotal > 0 && (
          <>
            <SectionHeader label="Cataloguing & Shoot Expenses" amount={data.cataloguingTotal}
              onClick={() => toggle('cataloguing')} isOpen={expanded.cataloguing} color="#7c3aed" />
            {expanded.cataloguing && <BreakdownRows data={data.cataloguingBreakdown} />}
          </>
        )}

        {data.softwareTotal > 0 && (
          <>
            <SectionHeader label="Software Expenses" amount={data.softwareTotal}
              onClick={() => toggle('software')} isOpen={expanded.software} color="#2563eb" />
            {expanded.software && <BreakdownRows data={data.softwareBreakdown} />}
          </>
        )}

        {data.storeExpTotal > 0 && (
          <>
            <SectionHeader label="Store Expenses" amount={data.storeExpTotal}
              onClick={() => toggle('store')} isOpen={expanded.store} color="#0891b2" />
            {expanded.store && <BreakdownRows data={data.storeExpBreakdown} />}
          </>
        )}

        {data.otherIndirect > 0 && (
          <>
            <SectionHeader label="Other / Unclassified" amount={data.otherIndirect}
              onClick={() => toggle('otherExpenses')} isOpen={expanded.otherExpenses} color="#64748b" />
            {expanded.otherExpenses && <BreakdownRows data={data.otherIndBreakdown} />}
          </>
        )}

        <MarginRow label="EBITDA / Cashflow Margin" amount={data.ebitda} info="Gross Profit − All Overheads" />

        {/* ═══ TAXES ═══ */}
        <div className="px-4 py-2" style={{ background: '#fef9c3' }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#854d0e' }}>Taxes & Statutory</span>
        </div>
        {data.gstPayable > 0 ? (
          <>
            <SectionHeader label="GST Paid" amount={data.gstPayable}
              onClick={() => toggle('gstPaid')} isOpen={expanded.gstPaid} color="#d97706" />
            {expanded.gstPaid && (data.gstFilingDetails || []).map((g, i) => (
              <SubRow key={i} label={g.label} amount={g.amount} />
            ))}
          </>
        ) : <SubRow label="GST Paid" amount={0} />}

        {data.tdsTotal > 0 ? (
          <>
            <SectionHeader label="TDS Deposited" amount={data.tdsTotal}
              onClick={() => toggle('tds')} isOpen={expanded.tds} color="#d97706" />
            {expanded.tds && Object.entries(data.tdsBreakdown || {}).sort((a, b) => b[1] - a[1]).map(([name, amt]) => (
              <SubRow key={name} label={name} amount={amt} />
            ))}
          </>
        ) : <SubRow label="TDS Deposited" amount={0} />}

        {data.statutoryTotal > 0 && (
          <>
            <SectionHeader label="Statutory & Compliance" amount={data.statutoryTotal}
              onClick={() => toggle('statutory')} isOpen={expanded.statutory} color="#854d0e" />
            {expanded.statutory && Object.entries(data.statutoryBreakdown || {}).sort((a, b) => b[1] - a[1]).map(([name, amt]) => (
              <SubRow key={name} label={name} amount={amt} />
            ))}
          </>
        )}

        <MarginRow label="Operating Profit" amount={data.operatingProfit} info="EBITDA − All Taxes & Statutory" />

        {/* ═══ LOANS ═══ */}
        <SectionHeader label={`Loans & Liabilities (${Object.keys(data.loansByLender).length} lenders)`} amount={data.loansTotal}
          onClick={() => toggle('loans')} isOpen={expanded.loans} color="#991b1b" />
        {expanded.loans && Object.entries(data.loansByLender).sort((a, b) => b[1] - a[1]).map(([name, amt]) => (
          <SubRow key={name} label={name} amount={amt} />
        ))}

        {/* ═══ NET PROFIT ═══ */}
        <div className="px-4 py-4" style={{ background: data.netProfit >= 0 ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)', borderTop: `3px solid ${data.netProfit >= 0 ? F.profit : F.loss}` }}>
          <div className="flex justify-between items-center">
            <span className="text-base font-bold" style={{ color: C.text }}>Net Profit / (Loss)</span>
            <div className="text-right flex items-center gap-3">
              <span className="text-xl font-bold" style={{ fontFamily: 'JetBrains Mono, monospace', color: data.netProfit >= 0 ? F.profit : F.loss }}>
                {fmtCurrency(data.netProfit)}
              </span>
              <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ background: data.netProfit >= 0 ? C.greenBg : C.redBg, color: data.netProfit >= 0 ? F.profit : F.loss }}>
                {pct(data.netProfit, rev)}%
              </span>
            </div>
          </div>
        </div>
      </div>}
    </div>
  )
}

export default TentativePL

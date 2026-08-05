import React, { useState, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, fmtCurrency } from '../../lib/designTokens'
import { F } from './constants'
import { n } from '../../lib/helpers'

/* ═══════════════════════════════════════════════════════════════════════════
   P&L REPORT — Contribution Margin Waterfall
   CM1 → CM2 → EBITDA → Operating Profit → Net Profit

   ARCHITECTURE (v2 — May 2025):
   Bank statement is the FINAL SOURCE OF TRUTH. Every settled bank transaction
   has an expense_mirror entry. The P&L reads from expense_mirror for everything.

   • Revenue         → shopify_orders (order-level, not bank-settled)
   • ALL expenses    → expense_mirror (operating, taxes, everything that left the bank)
   •   + taxes         pl_bucket: tax_gst, tax_tds, tax_advance → below EBITDA
   •   + operating     pl_bucket: cm1_fabric, salaries, etc. → above EBITDA
   • Loans           → loan_payments (for lender name join; mirrors have pl_bucket: loan_emi)
   • Date            → bank transaction date (cash basis), NOT invoice date
   ═══════════════════════════════════════════════════════════════════════════ */

const PLReport = ({ user }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateMode, setDateMode] = useState('this-month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [expanded, setExpanded] = useState({
    revenue: true, fabricCosts: false, dyeing: false, stitching: false, embroidery: false,
    otherDirect: true, indirect: true, salaries: false, ads: false, marketing: false,
    cataloguing: false, software: false, store: false, otherExpenses: false, gstPaid: false, tds: false, statutory: false, loans: false,
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
        // Indian FY April–March. If we're before April, use previous year
        const fy = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
        start = new Date(fy, 3, 1)
        end = new Date(fy + 1, 2, 31)
        break
      }
      case 'custom':
        start = customStart ? new Date(customStart) : new Date(today.getFullYear(), today.getMonth(), 1)
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

      // ═══ expense_mirror is the SINGLE SOURCE OF TRUTH for ALL bank outflows ═══
      // Only 3 queries: revenue (shopify), ALL expenses+taxes (mirror), loans (for lender breakdown)
      const [ordersRes, expMirrorRes, loanPaymentsRes, unsettledRes] = await Promise.all([
        // Revenue — Shopify orders
        supa.from('shopify_orders').select('total_sp_ex_gst, channel, source')
          .gte('created_at', `${start}T00:00:00`).lte('created_at', `${end}T23:59:59`),
        // ALL bank outflows — operating expenses, taxes, everything settled via bank
        supa.from('expense_mirror').select('amount, account_id, payee, expense_accounts(id, name, group_type, parent_id, pl_bucket)')
          .eq('status', 'settled')
          .gte('date', start).lte('date', end),
        // Loans — for per-lender breakdown (mirrors exist but loan_payments has lender join)
        supa.from('loan_payments').select('amount, loan_id, matched, loans(lender_name)')
          .gte('date', start).lte('date', end).eq('matched', true),
        // Unsettled bank transactions — pending review, not yet categorized
        supa.from('bank_transactions').select('id, date, narration, debit, credit, match_status')
          .neq('match_status', 'settled')
          .gt('debit', 0)
          .gte('date', start).lte('date', end)
          .order('date', { ascending: false }),
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

      // ─── ALL Operating Expenses — grouped by pl_bucket with payee breakdown ─
      // expense_mirror is the SINGLE SOURCE OF TRUTH for every bank-settled expense.
      // Each mirror row's expense_accounts.pl_bucket drives P&L categorization.
      // The payee field provides per-vendor/person breakdown labels.
      const expByBucket = {} // { pl_bucket: { total: 0, breakdown: { payeeName: amount } } }

      const processExpenseItem = (item) => {
        const amt = n(item.amount)
        const acct = item.expense_accounts
        if (!acct) return // skip mirrors without COA (shouldn't exist after backfill)
        const label = item.payee || acct.name || 'Uncategorized'
        const bucket = acct.pl_bucket || 'other'
        // Skip loan_emi bucket — loans are tracked separately via loan_payments below EBITDA
        if (bucket === 'loan_emi') return
        if (!expByBucket[bucket]) expByBucket[bucket] = { total: 0, breakdown: {} }
        expByBucket[bucket].total += amt
        expByBucket[bucket].breakdown[label] = (expByBucket[bucket].breakdown[label] || 0) + amt
      }

      ;(expMirrorRes.data || []).forEach(processExpenseItem)

      // Helper to safely access any bucket
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

      // ─── Returns & Refunds — deducted from revenue ─────────────────
      const returnsRefunds = getBucket('returns_refunds').total
      const returnsBreakdown = getBucket('returns_refunds').breakdown

      const netOperatingIncome = revenue.total - returnsRefunds
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

      // ─── Taxes & Statutory — from expense_mirror via tax pl_buckets ──
      // Tax mirrors use pl_buckets: tax_gst, tax_tds, tax_advance
      // These are NOT included in operating expense totals above
      const gstPayable = getBucket('tax_gst').total
      const gstFilingDetails = Object.entries(getBucket('tax_gst').breakdown).map(([label, amount]) => ({ label, amount }))
      const totalTds = getBucket('tax_tds').total
      const tdsBreakdown = getBucket('tax_tds').breakdown
      const statutoryTotal = getBucket('tax_advance').total
      const statutoryBreakdown = getBucket('tax_advance').breakdown

      const totalTaxes = gstPayable + totalTds + statutoryTotal
      const operatingProfit = ebitda - totalTaxes

      // ─── Loans — per-lender breakdown ─────────────────────────────────
      const loansByLender = {}
      let loansTotal = 0
      ;(loanPaymentsRes.data || []).forEach(lp => {
        const lender = lp.loans?.lender_name || 'Unknown Lender'
        loansByLender[lender] = (loansByLender[lender] || 0) + n(lp.amount)
        loansTotal += n(lp.amount)
      })

      const netProfit = operatingProfit - loansTotal

      // ─── Unsettled bank transactions — for visibility only ────────
      const unsettledTxns = (unsettledRes.data || []).map(t => ({
        id: t.id, date: t.date, amount: n(t.debit),
        narration: (t.narration || '').slice(0, 60),
        status: t.match_status,
      }))
      const unsettledTotal = unsettledTxns.reduce((sum, t) => sum + t.amount, 0)

      setData({
        dateRange: { start, end },
        revenue,
        // Returns & Refunds — deducted from revenue
        returnsRefunds, returnsBreakdown,
        netOperatingIncome,
        // CM1 components — all from expense_mirror
        fabricTotal, fabricBreakdown,
        dyeTotal, dyeBreakdown,
        stitchTotal, stitchBreakdown,
        embroideryTotal, embroideryBreakdown,
        miscProductionCost, miscProdBreakdown,
        inHouseWages, inHouseWagesBreakdown,
        cm1, cm1Costs,
        // CM2 components
        productionRent,
        bankCharges, bankChargesBreakdown,
        productCourier, courierBreakdown,
        miscFulfilmentCost, miscFulfilBreakdown,
        cm2, cm2Costs,
        // Indirect
        salariesTotal, salariesBreakdown,
        advertisingTotal, advertisingBreakdown,
        marketingTotal, marketingBreakdown,
        cataloguingTotal, cataloguingBreakdown,
        softwareTotal, softwareBreakdown,
        storeExpTotal, storeExpBreakdown,
        otherIndirect, otherIndBreakdown,
        totalIndirect,
        // Below the line
        ebitda,
        gstPayable, gstFilingDetails,
        tdsTotal: totalTds, tdsBreakdown,
        statutoryTotal, statutoryBreakdown,
        totalTaxes,
        operatingProfit,
        loansByLender, loansTotal,
        netProfit,
        // Unsettled — info only
        unsettledTxns, unsettledTotal,
      })
    } catch (e) {
      console.error('P&L fetch error:', e)
      toast(false, 'Failed to load P&L data')
    } finally { setLoading(false) }
  }

  if (!data) return <div className="p-6 text-center" style={{ color: C.textMuted }}>Loading…</div>

  // ─── Helpers ────────────────────────────────────────────────────────────
  const pct = (val, base) => base > 0 ? ((val / base) * 100).toFixed(1) : '0.0'
  const rev = data.revenue.total

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  // ─── Row Components ─────────────────────────────────────────────────────
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
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: C.greenBg, color: F.profit }}>Bank-Confirmed P&L</span>
          <span className="text-[10px]" style={{ color: C.textMuted }}>Only bank-settled expenses via expense_mirror</span>
        </div>
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

      {/* ── P&L Waterfall ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: C.bg }}>
          <span className="font-bold" style={{ color: C.text }}>P&L Waterfall — Contribution Margin</span>
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

        {/* ═══ RETURNS & REFUNDS — deducted from revenue ═══ */}
        {data.returnsRefunds > 0 && (
          <>
            <SectionHeader label="Returns & Refunds" amount={data.returnsRefunds}
              onClick={() => toggle('returns')} isOpen={expanded.returns} color="#dc2626" />
            {expanded.returns && <BreakdownRows data={data.returnsBreakdown} />}
          </>
        )}
        <TotalRow label="Net Operating Income" amount={data.netOperatingIncome} />

        {/* ═══ DIRECT EXPENSES — CM1 components ═══ */}
        <div className="px-4 py-2" style={{ background: '#fef3c7' }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#92400e' }}>Direct Production Costs (CM1)</span>
        </div>

        {/* Fabric Costs */}
        <SectionHeader label={`Fabric Costs (${Object.keys(data.fabricBreakdown).length} vendors)`} amount={data.fabricTotal}
          onClick={() => toggle('fabricCosts')} isOpen={expanded.fabricCosts} color="#7c3aed" />
        {expanded.fabricCosts && <BreakdownRows data={data.fabricBreakdown} />}

        {/* Dyeing */}
        <SectionHeader label={`Dyeing (${Object.keys(data.dyeBreakdown).length} vendors)`} amount={data.dyeTotal}
          onClick={() => toggle('dyeing')} isOpen={expanded.dyeing} color="#0891b2" />
        {expanded.dyeing && <BreakdownRows data={data.dyeBreakdown} />}

        {/* Stitching */}
        <SectionHeader label={`Stitching Costs (${Object.keys(data.stitchBreakdown).length} vendors)`} amount={data.stitchTotal}
          onClick={() => toggle('stitching')} isOpen={expanded.stitching} color="#ea580c" />
        {expanded.stitching && <BreakdownRows data={data.stitchBreakdown} />}

        {/* Embroidery */}
        <SectionHeader label={`Embroidery Costs (${Object.keys(data.embroideryBreakdown).length} vendors)`} amount={data.embroideryTotal}
          onClick={() => toggle('embroidery')} isOpen={expanded.embroidery} color="#be185d" />
        {expanded.embroidery && <BreakdownRows data={data.embroideryBreakdown} />}

        {/* Misc Production Cost */}
        {data.miscProductionCost > 0 && (
          <>
            <SectionHeader label="Misc Production Cost" amount={data.miscProductionCost}
              onClick={() => toggle('miscProd')} isOpen={expanded.miscProd} color="#b45309" />
            {expanded.miscProd && <BreakdownRows data={data.miscProdBreakdown} />}
          </>
        )}

        {/* In-House Wages */}
        <SectionHeader label="In-House Wages" amount={data.inHouseWages}
          onClick={() => toggle('inHouseWages')} isOpen={expanded.inHouseWages} color="#6d28d9" />
        {expanded.inHouseWages && <BreakdownRows data={data.inHouseWagesBreakdown} />}

        {/* ═══ CM1 LINE ═══ */}
        <MarginRow label="CM1 — Contribution Margin 1" amount={data.cm1} info="Revenue − Raw Materials, Outsource & Wages" />

        {/* ═══ DIRECT EXPENSES — CM2 components ═══ */}
        <div className="px-4 py-2" style={{ background: '#e0e7ff' }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#3730a3' }}>Production & Fulfilment Costs (CM2)</span>
        </div>

        <SubRow label="Production / Office Rent" amount={data.productionRent} />

        {/* Bank Charges */}
        <SectionHeader label="Bank Charges" amount={data.bankCharges}
          onClick={() => toggle('bankChargesExp')} isOpen={expanded.bankChargesExp} color="#6366f1" />
        {expanded.bankChargesExp && <BreakdownRows data={data.bankChargesBreakdown} />}

        {/* Courier */}
        <SectionHeader label="Product Courier" amount={data.productCourier}
          onClick={() => toggle('courierExp')} isOpen={expanded.courierExp} color="#0d9488" />
        {expanded.courierExp && <BreakdownRows data={data.courierBreakdown} />}

        {/* Misc Fulfilment Cost */}
        {data.miscFulfilmentCost > 0 && (
          <>
            <SectionHeader label="Misc Fulfilment Cost" amount={data.miscFulfilmentCost}
              onClick={() => toggle('miscFulfil')} isOpen={expanded.miscFulfil} color="#64748b" />
            {expanded.miscFulfil && <BreakdownRows data={data.miscFulfilBreakdown} />}
          </>
        )}

        {/* ═══ CM2 / GROSS PROFIT LINE ═══ */}
        <MarginRow label="CM2 — Gross Profit" amount={data.cm2} info="CM1 − Rent, Bank Charges, Courier" />

        {/* ═══ INDIRECT EXPENSES ═══ */}
        <div className="px-4 py-2" style={{ background: '#fce7f3' }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9d174d' }}>Indirect / Overhead Expenses</span>
        </div>

        {/* Salaries & Wages */}
        <SectionHeader label="Salaries & Wages" amount={data.salariesTotal}
          onClick={() => toggle('salaries')} isOpen={expanded.salaries} color="#4338ca" />
        {expanded.salaries && <BreakdownRows data={data.salariesBreakdown} />}

        {/* Advertisement */}
        <SectionHeader label="Advertisement" amount={data.advertisingTotal}
          onClick={() => toggle('ads')} isOpen={expanded.ads} color="#c2410c" />
        {expanded.ads && <BreakdownRows data={data.advertisingBreakdown} />}

        {/* Marketing */}
        {data.marketingTotal > 0 && (
          <>
            <SectionHeader label="Marketing" amount={data.marketingTotal}
              onClick={() => toggle('marketing')} isOpen={expanded.marketing} color="#059669" />
            {expanded.marketing && <BreakdownRows data={data.marketingBreakdown} />}
          </>
        )}

        {/* Cataloguing & Shoot */}
        {data.cataloguingTotal > 0 && (
          <>
            <SectionHeader label="Cataloguing & Shoot Expenses" amount={data.cataloguingTotal}
              onClick={() => toggle('cataloguing')} isOpen={expanded.cataloguing} color="#7c3aed" />
            {expanded.cataloguing && <BreakdownRows data={data.cataloguingBreakdown} />}
          </>
        )}

        {/* Software */}
        {data.softwareTotal > 0 && (
          <>
            <SectionHeader label="Software Expenses" amount={data.softwareTotal}
              onClick={() => toggle('software')} isOpen={expanded.software} color="#2563eb" />
            {expanded.software && <BreakdownRows data={data.softwareBreakdown} />}
          </>
        )}

        {/* Store Expenses */}
        {data.storeExpTotal > 0 && (
          <>
            <SectionHeader label="Store Expenses" amount={data.storeExpTotal}
              onClick={() => toggle('store')} isOpen={expanded.store} color="#0891b2" />
            {expanded.store && <BreakdownRows data={data.storeExpBreakdown} />}
          </>
        )}

        {/* Other */}
        {data.otherIndirect > 0 && (
          <>
            <SectionHeader label="Other Expenses" amount={data.otherIndirect}
              onClick={() => toggle('otherExpenses')} isOpen={expanded.otherExpenses} color="#64748b" />
            {expanded.otherExpenses && <BreakdownRows data={data.otherIndBreakdown} />}
          </>
        )}

        {/* ═══ EBITDA ═══ */}
        <MarginRow label="EBITDA / Cashflow Margin" amount={data.ebitda} info="Gross Profit − All Overheads" />

        {/* ═══ TAXES ═══ */}
        <div className="px-4 py-2" style={{ background: '#fef9c3' }}>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#854d0e' }}>Taxes & Statutory (cash basis — actual outflows in period)</span>
        </div>
        {data.gstPayable > 0 && (
          <>
            <SectionHeader label="GST Paid" amount={data.gstPayable}
              onClick={() => toggle('gstPaid')} isOpen={expanded.gstPaid} color="#d97706" />
            {expanded.gstPaid && (data.gstFilingDetails || []).map((g, i) => (
              <SubRow key={i} label={g.label} amount={g.amount} />
            ))}
          </>
        )}
        {data.gstPayable === 0 && <SubRow label="GST Paid" amount={0} />}
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

        {/* ═══ UNSETTLED BANK TRANSACTIONS — info only, not in P&L ═══ */}
        {data.unsettledTxns && data.unsettledTxns.length > 0 && (
          <>
            <div className="px-4 py-2 mt-1" style={{ background: '#fff7ed', borderTop: `2px dashed #f97316` }}>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9a3412' }}>
                  Unsettled Bank Transactions ({data.unsettledTxns.length}) — not included in P&L
                </span>
                <span className="text-xs font-bold" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#9a3412' }}>
                  {fmtCurrency(data.unsettledTotal)}
                </span>
              </div>
            </div>
            <SectionHeader label={`Pending Settlement (${data.unsettledTxns.length} transactions)`} amount={data.unsettledTotal}
              onClick={() => toggle('unsettled')} isOpen={expanded.unsettled} color="#f97316" />
            {expanded.unsettled && data.unsettledTxns.map(t => (
              <div key={t.id} className="flex justify-between items-center px-4 py-2 ml-5" style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <div className="flex-1 min-w-0">
                  <span className="text-xs block truncate" style={{ color: '#4e4636' }}>{t.narration}</span>
                  <span className="text-[10px]" style={{ color: C.textMuted }}>{t.date} · {t.status}</span>
                </div>
                <span className="text-xs font-semibold ml-3 shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#f97316' }}>{fmtCurrency(t.amount)}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export default PLReport

/* ═══════════════════════════════════════════════════════════════════════════
   RETURNS & EXCHANGES — Dashboard (KPI cards)
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, fmtCurrency } from '../../lib/designTokens'

const startOfMonthISO = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

const KpiCard = ({ label, value, sub, accent }) => (
  <div className="rounded-xl p-5 flex flex-col gap-1" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
    <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.textMuted, letterSpacing: '0.06em' }}>{label}</div>
    <div className="text-2xl font-bold" style={{ color: accent || C.text, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
    {sub ? <div className="text-xs" style={{ color: C.textMuted }}>{sub}</div> : null}
  </div>
)

const ReturnsDashboard = () => {
  const [stats, setStats] = useState({
    openCount: 0,
    refundDue: 0,
    settledMTD: 0,
    storeCreditOutstanding: 0,
    returnRate: 0,
    topReason: '—',
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const monthStartISO = startOfMonthISO()
        const monthStartDate = monthStartISO.slice(0, 10)

        const [openRes, allReqRes, mtdPayRes, scRes, ordersCountRes, retsMtdRes] = await Promise.all([
          supa.from('return_requests').select('id', { count: 'exact', head: true }).in('status', ['requested','approved','received']),
          supa.from('return_requests').select('refund_method, refund_amount, refund_paid, status'),
          supa.from('refund_payments').select('amount').gte('paid_on', monthStartDate),
          supa.from('buyers').select('store_credit').gt('store_credit', 0),
          supa.from('shopify_orders').select('id', { count: 'exact', head: true }).gte('created_at', monthStartISO),
          supa.from('return_requests').select('reason_category', { count: 'exact' }).gte('created_at', monthStartISO),
        ])

        if (cancelled) return

        const openCount = openRes.count || 0

        const refundDue = (allReqRes.data || [])
          .filter(r => r.refund_method === 'original_payment' && ['approved','received'].includes(r.status))
          .reduce((s, r) => s + Math.max(0, Number(r.refund_amount || 0) - Number(r.refund_paid || 0)), 0)

        const settledMTD = (mtdPayRes.data || []).reduce((s, p) => s + Number(p.amount || 0), 0)
        const storeCreditOutstanding = (scRes.data || []).reduce((s, b) => s + Number(b.store_credit || 0), 0)

        const totalOrders  = ordersCountRes.count || 0
        const totalReturns = retsMtdRes.count || 0
        const returnRate = totalOrders ? (totalReturns / totalOrders) * 100 : 0

        const reasonCounts = {}
        ;(retsMtdRes.data || []).forEach(r => {
          const k = r.reason_category || 'Other'
          reasonCounts[k] = (reasonCounts[k] || 0) + 1
        })
        const topKey = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0]

        setStats({
          openCount,
          refundDue,
          settledMTD,
          storeCreditOutstanding,
          returnRate,
          topReason: topKey || '—',
          loading: false,
        })
      } catch (e) {
        console.error('[ReturnsDashboard] load failed:', e)
        if (!cancelled) setStats(s => ({ ...s, loading: false }))
      }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <KpiCard label="Open Returns"             value={stats.openCount}                            sub="Requested + Approved + Received" />
      <KpiCard label="Refund Due"               value={fmtCurrency(stats.refundDue || 0)}          sub="Approved cash refunds outstanding" accent={C.gold} />
      <KpiCard label="Settled MTD"              value={fmtCurrency(stats.settledMTD || 0)}         sub="Refund payments this month" />
      <KpiCard label="Store Credit Outstanding" value={fmtCurrency(stats.storeCreditOutstanding || 0)} sub="Active buyer balances" />
      <KpiCard label="Return Rate (MTD)"        value={`${stats.returnRate.toFixed(1)}%`}          sub="Returns ÷ Orders this month" />
      <KpiCard label="Top Reason (MTD)"         value={stats.topReason}                            sub="Most common return reason" />
      {stats.loading ? <div className="text-sm col-span-full" style={{ color: C.textMuted }}>Loading…</div> : null}
    </div>
  )
}

export default ReturnsDashboard

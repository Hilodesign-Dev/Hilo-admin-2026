import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, fmtDate } from '../../lib/designTokens'
import { logAndToast } from '../../lib/logger'
import { usePaymentMethods } from './usePaymentMethods'
import PaymentSplitModal from './PaymentSplitModal'
import { savePosPayments } from './orderActions'
import DateRangePicker, { rangeFromPreset } from './DateRangePicker'
import { resolveStaffName } from '../../lib/helpers'

/**
 * Dues & Ledger — three sub-tabs:
 *
 *   outstanding  Orders with payment_balance > 0 in the date range
 *                (date range = order created_at). Status filter narrows
 *                to Unpaid / Partial / Paid. Mismatch toggle filters
 *                to orders with any pos_payments.mismatch_flag set.
 *
 *   payments     Every pos_payments row in the date range (by collected_at).
 *                Method / Stylist / Verification / Source filters. CSV export.
 *
 *   summary      KPI totals + by-method + by-stylist breakdowns for the range.
 *
 * Sub-tab + filters all persist in sessionStorage.
 */

const SUB_TABS = [
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'payments',    label: 'Payments' },
  { key: 'cancelled',   label: 'Cancelled' },
  { key: 'cash',        label: 'Cash' },
  { key: 'summary',     label: 'Summary' },
]
const STATUS_OPTS = [
  { k: 'all',     label: 'All statuses' },
  { k: 'unpaid',  label: 'Unpaid' },
  { k: 'partial', label: 'Partial' },
  { k: 'paid',    label: 'Paid' },
]
const VERIF_OPTS = [
  { k: 'all',         label: 'All' },
  { k: 'verified',    label: 'Verified' },
  { k: 'unverified',  label: 'Unverified' },
  { k: 'disputed',    label: 'Disputed' },
]
const SOURCE_OPTS = [
  { k: 'all',           label: 'All sources' },
  { k: 'pos',           label: 'POS' },
  { k: 'excel_import',  label: 'Excel import' },
  { k: 'manual_entry',  label: 'Manual entry' },
]

const sess = {
  get: (k, d) => { try { return sessionStorage.getItem(k) ?? d } catch { return d } },
  set: (k, v) => { try { sessionStorage.setItem(k, v) } catch {} },
  getJson: (k, d) => { try { const r = sessionStorage.getItem(k); return r ? JSON.parse(r) : d } catch { return d } },
  setJson: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)) } catch {} },
}

const POSDues = ({ stylist, user, teamMembers = [] }) => {
  const { methods: PAYMENT_METHODS, byKey: methodByKey } = usePaymentMethods({ activeOnly: false })

  // ── State (sessionStorage-backed) ───────────────────────────────
  const [tab, setTab] = useState(() => sess.get('hilo_dues_subtab', 'outstanding'))
  const [range, setRange] = useState(() => sess.getJson('hilo_dues_range', rangeFromPreset('this_month')))
  const [statusFilter, setStatusFilter] = useState(() => sess.get('hilo_dues_status', 'all'))
  const me = (teamMembers || []).find(m => m.user_id === user?.id) || null
  // Verification gate: Admin role always passes (founders / admins);
  // otherwise we look at the team_members.designation field — these
  // are the job titles that should be allowed to verify payments.
  // Edit the VERIFY_DESIGNATIONS list to widen / narrow this.
  const myDesignation = (me?.designation || window._currentUserDesignation || '').toLowerCase().trim()
  const myRole = (window._currentUserRole || me?.role || '').toLowerCase()
  const isFounder = !!window._currentUserIsFounder
  // Founders AND admins can verify a payment; finance-manager designation kept for continuity.
  const canVerify = isFounder || myRole === 'admin' || myDesignation === 'finance manager'
  // Only founders can un-verify (revert) a payment. Admins cannot.
  const canUnverify = isFounder
  const myName = me?.name || window._currentUserName || (user?.email ? user.email.split('@')[0] : '')
  const myTMId = window._currentTeamMemberId ? Number(window._currentTeamMemberId) : (me?.id || null)
  const [stylistFilter, setStylistFilter] = useState(() => sess.get('hilo_dues_stylist', ''))
  const [storeFilter, setStoreFilter] = useState(() => sess.get('hilo_dues_store', ''))
  const [mismatchOnly, setMismatchOnly] = useState(() => sess.get('hilo_dues_mismatch', '0') === '1')

  const [methodFilter, setMethodFilter]   = useState(() => sess.get('hilo_dues_pmethod', ''))
  const [verifFilter, setVerifFilter]     = useState(() => sess.get('hilo_dues_verif',  'all'))
  const [sourceFilter, setSourceFilter]   = useState(() => sess.get('hilo_dues_source', 'all'))

  const persistTab = (v) => { setTab(v); sess.set('hilo_dues_subtab', v) }
  const persistRange = (v) => { setRange(v); sess.setJson('hilo_dues_range', v) }
  const persistStatus = (v) => { setStatusFilter(v); sess.set('hilo_dues_status', v) }
  const persistStylist = (v) => { setStylistFilter(v); sess.set('hilo_dues_stylist', v) }
  const persistStore = (v) => { setStoreFilter(v); sess.set('hilo_dues_store', v) }
  const persistMismatch = (v) => { setMismatchOnly(v); sess.set('hilo_dues_mismatch', v ? '1' : '0') }
  const persistMethod = (v) => { setMethodFilter(v); sess.set('hilo_dues_pmethod', v) }
  const persistVerif = (v) => { setVerifFilter(v); sess.set('hilo_dues_verif', v) }
  const persistSource = (v) => { setSourceFilter(v); sess.set('hilo_dues_source', v) }

  // ── Data ───────────────────────────────────────────────────────
  const [orders, setOrders] = useState([])
  const [payments, setPayments] = useState([])
  // Cash tab state — verified Cash-method payments received at POS
  const [cashIn, setCashIn] = useState([])
  const [cashOrderNum, setCashOrderNum] = useState({})
  const [cashLoading, setCashLoading] = useState(false)
  const [stores, setStores] = useState([])
  const [stylistList, setStylistList] = useState([])
  const staffById = useMemo(() => Object.fromEntries((stylistList || []).map(m => [String(m.id), m.name])), [stylistList])
  const staffLabel = (v) => staffById[String(v)] || resolveStaffName(teamMembers, v)
  const [loading, setLoading] = useState(true)
  const [collectingFor, setCollectingFor] = useState(null) // order to collect against
  const [mismatchedOrderIds, setMismatchedOrderIds] = useState(new Set())

  const fetchAll = useCallback(async () => {
    if (!range?.from || !range?.to) return
    setLoading(true)
    try {
      const fromIso = range.from + 'T00:00:00'
      const toIso   = range.to   + 'T23:59:59'

      // Orders in range
      let oq = supa.from('shopify_orders')
        .select('id, order_number, customer_name, customer_email, total_price, payment_collected, payment_balance, payment_status, order_status, created_at, stylist, store_id, channel, order_origin, cancelled_at, cancellation_reason, refund_pending_amount, refund_completed_amount, write_off_amount')
        .gte('created_at', fromIso).lte('created_at', toIso)
        .order('created_at', { ascending: true })
      if (stylistFilter) oq = oq.eq('stylist', stylistFilter)
      if (storeFilter)   oq = oq.eq('store_id', storeFilter)
      const { data: oData, error: oErr } = await oq
      if (oErr) throw oErr
      setOrders(oData || [])

      // Payments in range
      let pq = supa.from('pos_payments')
        .select('*')
        .gte('collected_at', fromIso).lte('collected_at', toIso)
        // Sort by posting date (immutable DB-set created_at) so newly-
        // entered back-dated payments appear at the top, not buried in
        // the past. Secondary sort by collected_at handles bulk imports
        // that share a single created_at second.
        .order('created_at', { ascending: false })
        .order('collected_at', { ascending: false })
      if (methodFilter) pq = pq.eq('method', methodFilter)
      if (verifFilter && verifFilter !== 'all') pq = pq.eq('verification_status', verifFilter)
      if (sourceFilter && sourceFilter !== 'all') pq = pq.eq('source', sourceFilter)
      const { data: pData, error: pErr } = await pq
      if (pErr) throw pErr
      setPayments(pData || [])

      // Mismatch set (across all payments in range, not just filtered)
      const { data: mData } = await supa.from('pos_payments')
        .select('order_id')
        .not('mismatch_flag', 'is', null)
        .eq('mismatch_flag', 'amount_mismatch')
        .gte('collected_at', fromIso).lte('collected_at', toIso)
      setMismatchedOrderIds(new Set((mData || []).map(r => r.order_id)))
    } catch (e) {
      logAndToast('dues-fetch', 'Failed to load dues: ' + (e.message || e), e)
    } finally { setLoading(false) }
  }, [range?.from, range?.to, stylistFilter, storeFilter, methodFilter, verifFilter, sourceFilter])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Lookups for filter dropdowns ───────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: stData } = await supa.from('stores').select('id, name').eq('is_active', true).order('name')
      setStores(stData || [])
      const { data: sm } = await supa.from('team_members').select('id, name').order('name')
      setStylistList((sm || []).filter(m => m.name))
    })()
  }, [])

  // Lookup table so we can join payments → orders by order_id
  // without a second DB call.
  const orderById = useMemo(() => {
    const m = {}
    for (const o of orders) m[o.id] = o
    return m
  }, [orders])

  // Payments-tab payments exclude rows that belong to cancelled orders —
  // those move to the Cancelled tab where refunds get marked.
  const activePayments = useMemo(() => {
    return (payments || []).filter(p => {
      const o = orderById[p.order_id]
      return !(o && o.order_status === 'cancelled')
    })
  }, [payments, orderById])

  // Payments belonging to cancelled orders (grouped per order on the
  // Cancelled tab so staff can mark which are refunded).
  const paymentsByCancelledOrder = useMemo(() => {
    const m = {}
    for (const p of (payments || [])) {
      const o = orderById[p.order_id]
      if (!o || o.order_status !== 'cancelled') continue
      ;(m[p.order_id] = m[p.order_id] || []).push(p)
    }
    return m
  }, [payments, orderById])

  // ── Derived rows ──────────────────────────────────────────────
  const outstandingOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.order_status === 'cancelled') return false  // cancelled lives in its own tab
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'unpaid'  && (Number(o.payment_collected) || 0) > 0.01) return false
        if (statusFilter === 'partial' && !(Number(o.payment_balance) > 0.01 && Number(o.payment_collected) > 0.01)) return false
        if (statusFilter === 'paid'    && Number(o.payment_balance) > 0.01) return false
      } else {
        // 'all' default still drops fully-paid rows so the screen is actionable
        // unless user explicitly picks "Paid"
        if (Number(o.payment_balance) <= 0.01) return false
      }
      if (mismatchOnly && !mismatchedOrderIds.has(o.id)) return false
      return true
    })
  }, [orders, statusFilter, mismatchOnly, mismatchedOrderIds])

  const kpis = useMemo(() => {
    const active = orders.filter(o => o.order_status !== 'cancelled')
    const totalBilled    = active.reduce((s, o) => s + (Number(o.total_price) || 0), 0)
    const totalCollected = active.reduce((s, o) => s + (Number(o.payment_collected) || 0), 0)
    const outstanding    = active.reduce((s, o) => s + Math.max(0, Number(o.payment_balance) || 0), 0)
    return { ordersInRange: active.length, totalBilled, totalCollected, outstanding }
  }, [orders])

  const cancelledOrders = useMemo(() => {
    return orders.filter(o => o.order_status === 'cancelled')
      .sort((a, b) => new Date(b.cancelled_at || b.created_at) - new Date(a.cancelled_at || a.created_at))
  }, [orders])

  const cancelStatus = (o) => {
    const collected = Number(o.payment_collected || 0)
    const refundPending = Number(o.refund_pending_amount || 0)
    const refundDone = Number(o.refund_completed_amount || 0)
    if (collected <= 0.01) return { label: 'Cancelled', tone: 'neutral' }
    if (refundPending > 0.01) return { label: 'Refund pending', tone: 'warn' }
    if (refundDone > 0.01) return { label: 'Cancelled & refunded', tone: 'ok' }
    // Money was collected but no refund recorded — treat as pending
    return { label: 'Refund pending', tone: 'warn' }
  }

  const cancelKpis = useMemo(() => {
    const cnt = cancelledOrders.length
    const collected = cancelledOrders.reduce((s, o) => s + Number(o.payment_collected || 0), 0)
    const refundPending = cancelledOrders.reduce((s, o) => {
      const c = Number(o.payment_collected || 0)
      const rp = Number(o.refund_pending_amount || 0)
      const rd = Number(o.refund_completed_amount || 0)
      // Treat any collected-but-not-refunded amount as pending
      return s + (c > 0.01 && rp <= 0.01 && rd <= 0.01 ? c : rp)
    }, 0)
    const refundDone = cancelledOrders.reduce((s, o) => s + Number(o.refund_completed_amount || 0), 0)
    return { cnt, collected, refundPending, refundDone }
  }, [cancelledOrders])

  const summaryByMethod = useMemo(() => {
    const tot = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const map = {}
    payments.forEach(p => {
      const k = p.method || 'unknown'
      map[k] = (map[k] || 0) + (Number(p.amount) || 0)
    })
    return Object.entries(map)
      .map(([k, v]) => ({ key: k, label: methodByKey[k]?.label || k, icon: methodByKey[k]?.icon || '·', amount: v, pct: tot > 0 ? Math.round((v / tot) * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount)
  }, [payments, methodByKey])

  const summaryByStylist = useMemo(() => {
    const tot = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const map = {}
    const matchedNames = new Set(stylistList.map(m => (m.name||'').toLowerCase()))
    payments.forEach(p => {
      const raw = p.created_by_name || p.collected_by_name || '—'
      // Old-employee bucket: created_by_id IS NULL AND name doesn't match a current team member
      const isOldEmployee = (p.source === 'excel_import' && !p.created_by_id && !matchedNames.has((raw.replace(/^Excel Import — /, '')).toLowerCase()))
      const k = isOldEmployee ? '(Old employees)' : (raw || '—').replace(/^Excel Import — /, '')
      map[k] = (map[k] || 0) + (Number(p.amount) || 0)
    })
    return Object.entries(map)
      .map(([k, v]) => ({ name: k, amount: v, pct: tot > 0 ? Math.round((v / tot) * 100) : 0 }))
      .sort((a, b) => b.amount - a.amount)
  }, [payments, stylistList])

  const summaryReceipts = useMemo(() => {
    const initial = payments.filter(p => p.payment_type === 'initial' && Number(p.amount) > 0).reduce((s, p) => s + Number(p.amount), 0)
    const dues = payments.filter(p => p.payment_type !== 'initial' && Number(p.amount) > 0).reduce((s, p) => s + Number(p.amount), 0)
    const refunds = payments.filter(p => Number(p.amount) < 0).reduce((s, p) => s + Number(p.amount), 0)
    return { initial, dues, refunds, net: initial + dues + refunds }
  }, [payments])

  // Verified vs Unverified breakdown for the Summary tab (counts + amounts).
  const verifStats = useMemo(() => {
    const acc = { verified: { n: 0, amt: 0 }, unverified: { n: 0, amt: 0 }, disputed: { n: 0, amt: 0 } }
    payments.forEach(p => {
      const k = p.verification_status === 'verified' ? 'verified'
              : p.verification_status === 'disputed' ? 'disputed' : 'unverified'
      acc[k].n += 1
      acc[k].amt += Number(p.amount) || 0
    })
    return acc
  }, [payments])

  // ── Actions ──────────────────────────────────────────────────

  // Mark a payment as verified. One-way action from the Payments tab.
  // Restricted to founder / admin / finance / operations_manager. The
  // verifier's name + timestamp are stamped on the row so the audit
  // chip can show 'by <FirstName>'. To un-verify (rare), an admin can
  // still flip the status via direct DB or a dedicated admin tool.
  const markVerified = async (p) => {
    if (!canVerify) {
      toast(false, 'You don\'t have permission to verify payments.')
      return
    }
    if (p.verification_status === 'verified') return
    if (!window.confirm('Mark this payment as verified? This stamps your name and time on the row.')) return
    const nowIso = new Date().toISOString()
    try {
      const { error } = await supa.from('pos_payments').update({
        verification_status: 'verified',
        verified_at: nowIso,
        verified_by_name: myName || null,
        verified_by_id: myTMId,
      }).eq('id', p.id)
      if (error) throw error
      supa.from('pos_payment_verif_log').insert({
        payment_id: p.id, order_id: p.order_id, action: 'verified',
        amount: p.amount, method: p.method, actor_id: myTMId, actor_name: myName || null,
      }).then(() => {})
      setPayments(ps => ps.map(x => x.id === p.id ? {
        ...x,
        verification_status: 'verified',
        verified_at: nowIso,
        verified_by_name: myName || null,
        verified_by_id: myTMId,
      } : x))
      toast(true, 'Marked verified')
    } catch (e) { logAndToast('verify-payment', 'Failed: ' + (e.message || e), e) }
  }

  // Un-verify — founders only. Reverts the row to unverified and logs the action.
  const unmarkVerified = async (p) => {
    if (!canUnverify) {
      toast(false, 'Only founders can un-verify a payment.')
      return
    }
    if (p.verification_status !== 'verified') return
    if (!window.confirm('Un-verify this payment? It reverts to Unverified and the change is logged.')) return
    try {
      const { error } = await supa.from('pos_payments').update({
        verification_status: 'unverified',
        verified_at: null,
        verified_by_name: null,
        verified_by_id: null,
      }).eq('id', p.id)
      if (error) throw error
      supa.from('pos_payment_verif_log').insert({
        payment_id: p.id, order_id: p.order_id, action: 'unverified',
        amount: p.amount, method: p.method, actor_id: myTMId, actor_name: myName || null,
      }).then(() => {})
      setPayments(ps => ps.map(x => x.id === p.id ? {
        ...x,
        verification_status: 'unverified',
        verified_at: null,
        verified_by_name: null,
        verified_by_id: null,
      } : x))
      toast(true, 'Un-verified')
    } catch (e) { logAndToast('unverify-payment', 'Failed: ' + (e.message || e), e) }
  }

  // Single click handler used by both desktop cell and mobile pill.
  const toggleVerify = (p) => {
    if (p.verification_status === 'verified') { if (canUnverify) unmarkVerified(p) }
    else if (canVerify) markVerified(p)
  }

  // ── Cash received (verified Cash-method POS payments) ───────
  // Only Cash payments that have been VERIFIED count. QR / POS-terminal
  // settle to the bank. Payouts + month reconciliation live in Finance.
  const fetchCash = async () => {
    setCashLoading(true)
    try {
      const { data: pin } = await supa.from('pos_payments')
        .select('id, order_id, amount, collected_at, reference, collected_by_name, created_by_name')
        .eq('method', 'cash').eq('verification_status', 'verified')
      const ids = [...new Set((pin || []).map(p => p.order_id).filter(Boolean))]
      let onum = {}
      if (ids.length) {
        const { data: ords } = await supa.from('shopify_orders').select('id, order_number').in('id', ids)
        onum = Object.fromEntries((ords || []).map(o => [o.id, o.order_number]))
      }
      setCashIn(pin || [])
      setCashOrderNum(onum)
    } catch (e) { logAndToast('cash-load', 'Failed to load cash: ' + (e.message || e), e) }
    finally { setCashLoading(false) }
  }
  useEffect(() => { if (tab === 'cash') fetchCash() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Verified cash rows filtered to the selected date range (by collected_at).
  const cashRows = useMemo(() => {
    const from = range?.from, to = range?.to
    return cashIn
      .filter(p => {
        if (!from || !to) return true
        const d = (p.collected_at || '').slice(0, 10)
        return d && d >= from && d <= to
      })
      .map(p => ({
        id: p.id, date: p.collected_at,
        order: cashOrderNum[p.order_id] || (p.order_id ? String(p.order_id).slice(0, 8) + '…' : '—'),
        ref: p.reference || '',
        who: p.collected_by_name || p.created_by_name || '',
        amount: Number(p.amount) || 0,
      }))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  }, [cashIn, cashOrderNum, range?.from, range?.to])

  const cashTotals = useMemo(() => ({
    period: cashRows.reduce((s, r) => s + r.amount, 0),
    allTime: cashIn.reduce((s, p) => s + (Number(p.amount) || 0), 0),
  }), [cashRows, cashIn])

  const onCollectPayment = async ({ collected, splits, collectedAt, backdateDays }) => {
    if (!collectingFor) return
    try {
      await savePosPayments(
        collectingFor.id,
        Number(collectingFor.payment_balance || 0),
        splits,
        { stylist, paymentType: 'due_collection', collectedAt, backdateDays }
      )
      toast(true, backdateDays > 0 ? `Payment recorded · back-dated ${backdateDays}d, will be flagged for verification` : 'Payment recorded')
      setCollectingFor(null)
      fetchAll()
    } catch (e) { logAndToast('collect-due', 'Failed: ' + (e.message || e), e) }
  }

  const exportCsv = () => {
    const header = ['Posted date','Posted time','Transaction date','Order#','Customer','Method','Reference','Amount','Stylist','Created by','Verification','Source','Mismatch','Backdate days','Notes']
    const rows = payments.map(p => {
      const txn = p.collected_at ? new Date(p.collected_at) : null
      const post = p.created_at ? new Date(p.created_at) : txn
      const gapDays = (txn && post) ? Math.round((post - txn) / (24 * 60 * 60 * 1000)) : 0
      return [
        post ? post.toLocaleDateString('en-IN') : '',
        post ? post.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '',
        txn ? txn.toLocaleDateString('en-IN') : '',
        p.order_id || '',
        p.customer_name_raw || '',
        methodByKey[p.method]?.label || p.method || '',
        (p.reference || '').replace(/"/g,'""'),
        Number(p.amount || 0),
        (p.collected_by_name || '').replace(/"/g,'""'),
        (p.created_by_name || '').replace(/"/g,'""'),
        p.verification_status || '',
        p.source || '',
        p.mismatch_flag || '',
        gapDays,
        (p.notes || '').replace(/"/g,'""').replace(/\n/g,' '),
      ].map(v => typeof v === 'string' && (v.includes(',') || v.includes('"')) ? `"${v}"` : String(v)).join(',')
    })
    const blob = new Blob([header.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `payments-${range.from}-to-${range.to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="p-1 sm:p-2">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-3" style={{ color: C.text }}>Dues & Ledger</h1>

        {/* Sub-tabs */}
        <div className="flex gap-1 mb-3 border-b" style={{ borderColor: C.border }}>
          {SUB_TABS.map(t => {
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => persistTab(t.key)}
                className="px-3 sm:px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2"
                style={{ borderColor: active ? C.gold : 'transparent', color: active ? C.gold : C.textMuted }}>
                {t.label}
                {t.key === 'outstanding' && <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: active ? C.goldLight : C.bg, color: active ? C.goldDark : C.textMuted }}>{outstandingOrders.length}</span>}
                {t.key === 'payments' && <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: active ? C.goldLight : C.bg, color: active ? C.goldDark : C.textMuted }}>{payments.length}</span>}
                {t.key === 'cancelled' && <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: active ? C.goldLight : C.bg, color: active ? C.goldDark : C.textMuted }}>{cancelledOrders.length}</span>}
              </button>
            )
          })}
        </div>

        {/* Date range — always visible */}
        <div className="mb-3">
          <DateRangePicker value={range} onChange={persistRange} />
        </div>

        {/* Sub-tab-specific filters */}
        {tab === 'outstanding' && (
          <div className="flex items-center gap-2 flex-wrap">
            <Sel value={statusFilter} onChange={persistStatus} opts={STATUS_OPTS} />
            <Sel value={stylistFilter} onChange={persistStylist} opts={[{ k:'', label:'All stylists' }, ...stylistList.map(m => ({ k:String(m.id), label:m.name }))]} />
            <Sel value={storeFilter} onChange={persistStore} opts={[{ k:'', label:'All stores' }, ...stores.map(s => ({ k:s.id, label:s.name }))]} />
            <label className="text-xs inline-flex items-center gap-1.5" style={{ color: C.text }}>
              <input type="checkbox" checked={mismatchOnly} onChange={e => persistMismatch(e.target.checked)} />
              Show only mismatches
            </label>
          </div>
        )}
        {tab === 'payments' && (
          <div className="flex items-center gap-2 flex-wrap">
            <Sel value={methodFilter} onChange={persistMethod} opts={[{ k:'', label:'All methods' }, ...PAYMENT_METHODS.map(m => ({ k:m.key, label:`${m.icon||''} ${m.label}` }))]} />
            <Sel value={stylistFilter} onChange={persistStylist} opts={[{ k:'', label:'All stylists' }, ...stylistList.map(m => ({ k:String(m.id), label:m.name }))]} />
            <Sel value={verifFilter} onChange={persistVerif} opts={VERIF_OPTS} />
            <Sel value={sourceFilter} onChange={persistSource} opts={SOURCE_OPTS} />
          </div>
        )}
      </div>

      {/* KPI strip — shown on Outstanding + Summary */}
      {(tab === 'outstanding' || tab === 'summary') && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <KPI label="Orders in range" v={kpis.ordersInRange} />
          <KPI label="Total billed"    v={`₹${Math.round(kpis.totalBilled).toLocaleString('en-IN')}`} />
          <KPI label="Total collected" v={`₹${Math.round(kpis.totalCollected).toLocaleString('en-IN')}`} accent={C.green} />
          <KPI label="Outstanding"     v={`₹${Math.round(kpis.outstanding).toLocaleString('en-IN')}`} accent={C.red} />
        </div>
      )}

      {/* ── Outstanding sub-tab ─────────────────────────────── */}
      {tab === 'outstanding' && (
        loading ? <Loading /> :
        outstandingOrders.length === 0 ? <Empty msg="No outstanding orders for this date range." /> :
        <div className="space-y-2">
          {outstandingOrders.map(o => {
            const ageDays = Math.floor((Date.now() - new Date(o.created_at).getTime()) / (1000 * 60 * 60 * 24))
            const isMismatch = mismatchedOrderIds.has(o.id)
            const borderColor = isMismatch ? C.gold : (Number(o.payment_balance) <= 0.01 ? C.green : (ageDays > 30 ? C.red : (C.amber || '#d97706')))
            return (
              <div key={o.id} className="rounded-xl p-3 sm:p-4" style={{ background: '#fff', border: `1px solid ${C.border}`, borderLeft: `4px solid ${borderColor}` }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-bold font-mono" style={{ color: C.text }}>{o.order_number}</div>
                    <div className="text-xs mt-0.5" style={{ color: C.textMuted }}>
                      {o.customer_name || '—'} · {fmtDate(o.created_at)} · {ageDays}d old
                      {o.stylist && <> · <span style={{ color: C.purple }}>Stylist: {staffLabel(o.stylist)}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setCollectingFor(o)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg"
                      style={{ background: C.gold, color: '#fff' }}>
                      Collect
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
                  <div><span style={{ color: C.textMuted }}>Billed:</span> <span className="font-mono font-bold" style={{ color: C.text }}>₹{Math.round(o.total_price).toLocaleString('en-IN')}</span></div>
                  <div><span style={{ color: C.textMuted }}>Paid:</span> <span className="font-mono font-bold" style={{ color: C.green }}>₹{Math.round(o.payment_collected || 0).toLocaleString('en-IN')}</span></div>
                  <div><span style={{ color: C.textMuted }}>Outstanding:</span> <span className="font-mono font-bold" style={{ color: C.red }}>₹{Math.round(Math.max(0, o.payment_balance || 0)).toLocaleString('en-IN')}</span></div>
                </div>
                {isMismatch && (
                  <div className="mt-2 text-[11px] px-2 py-1 rounded inline-block" style={{ background: C.goldLight, color: C.goldDark }}>
                    ⚠ Mismatch flagged on this order — Excel vs Hilo total differs
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Payments sub-tab ────────────────────────────────── */}
      {tab === 'payments' && (
        loading ? <Loading /> :
        activePayments.length === 0 ? <Empty msg="No payments in this date range." /> :
        <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
          <div className="hidden lg:grid lg:grid-cols-[110px_110px_120px_1.5fr_1.3fr_1fr_110px_1.1fr_90px] gap-2 px-3 py-2 text-[10px] font-bold tracking-wider uppercase items-center" style={{ background: C.bg, color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
            <div title="When the entry was written to the system — immutable">Posted</div>
            <div title="When the customer actually paid — user-entered">Transaction</div>
            <div>Order</div><div>Customer</div><div>Method</div><div>Reference</div><div className="text-right">Amount</div><div>Stylist</div><div>Verified</div>
          </div>
          {activePayments.map(p => {
            const txn = p.collected_at ? new Date(p.collected_at) : null
            const post = p.created_at ? new Date(p.created_at) : txn
            const gapDays = (txn && post) ? Math.round((post - txn) / (24 * 60 * 60 * 1000)) : 0
            const m = methodByKey[p.method]
            return (
              <React.Fragment key={p.id}>
              <div className="hidden lg:grid lg:grid-cols-[110px_110px_120px_1.5fr_1.3fr_1fr_110px_1.1fr_90px] px-3 py-2.5 gap-2 items-center text-xs" style={{ borderBottom: `1px solid ${C.borderLight}`, background: gapDays > 7 ? `${C.amber}08` : 'transparent' }}>
                <div className="font-mono" style={{ color: C.text }}>
                  <div>{post ? post.toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : '—'}</div>
                  <div className="text-[10px]" style={{ color: C.textLight }}>{post ? post.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : ''}</div>
                </div>
                <div className="font-mono" style={{ color: gapDays > 7 ? (C.amber || '#d97706') : C.textMuted }}>
                  <div>{txn ? txn.toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : '—'}</div>
                  {gapDays > 0 && (
                    <div className="text-[10px] inline-flex items-center gap-0.5" style={{ color: gapDays > 7 ? (C.amber || '#d97706') : C.textLight }}>
                      {gapDays > 7 ? '⚠ ' : ''}entered {gapDays}d late
                    </div>
                  )}
                </div>
                <div className="font-mono font-bold inline-flex items-center gap-1" style={{ color: C.text }}>
                  {(() => {
                    const ord = orderById[p.order_id]
                    return ord?.order_number
                      ? <span className="truncate">{ord.order_number}</span>
                      : (p.order_id ? <span className="truncate text-[10px]" style={{ color: C.textMuted }} title={p.order_id}>{String(p.order_id).slice(0, 8)}…</span> : <span style={{ color: C.textLight }}>—</span>)
                  })()}
                  {p.mismatch_flag === 'amount_mismatch' && <span title="Amount mismatch" style={{ color: C.gold }}>⚠</span>}
                </div>
                <div className="truncate" style={{ color: C.text }}>
                  {orderById[p.order_id]?.customer_name || p.customer_name_raw || '—'}
                </div>
                <div className="inline-flex items-center gap-1" style={{ color: C.text }}><span>{m?.icon||''}</span>{m?.label || p.method}</div>
                <div className="font-mono truncate" style={{ color: C.textMuted }}>{p.reference || '—'}</div>
                <div className="font-mono font-bold text-right tabular-nums" style={{ color: Number(p.amount) < 0 ? C.red : C.green }}>
                  ₹{Math.round(Math.abs(p.amount||0)).toLocaleString('en-IN')}{Number(p.amount)<0 ? ' R' : ''}
                </div>
                <div className="min-w-0" style={{ color: C.text }}>
                  <div className="truncate">{p.collected_by_name || p.created_by_name || '—'}</div>
                  {p.created_by_name && p.collected_by_name && p.created_by_name !== p.collected_by_name && (
                    <div className="text-[10px] truncate" style={{ color: C.textMuted }}>entered by {p.created_by_name}</div>
                  )}
                </div>
                <div>
                  <VerifCell p={p} canVerify={canVerify} canUnverify={canUnverify} onMark={() => markVerified(p)} onUnmark={() => unmarkVerified(p)} />
                </div>
              </div>

              {/* Mobile card — shown under lg breakpoint */}
              <div className="lg:hidden px-3 py-3" style={{ borderBottom: `1px solid ${C.borderLight}`, background: gapDays > 7 ? `${C.amber}08` : 'transparent' }}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <div className="text-sm font-bold font-mono" style={{ color: C.text }}>
                      {(() => {
                        const ord = orderById[p.order_id]
                        return ord?.order_number || (p.order_id ? String(p.order_id).slice(0, 8) + '…' : '—')
                      })()}
                    </div>
                    <div className="text-xs truncate" style={{ color: C.textMuted }}>
                      {orderById[p.order_id]?.customer_name || p.customer_name_raw || '—'}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold tabular-nums text-sm" style={{ color: Number(p.amount) < 0 ? C.red : C.green }}>
                      ₹{Math.round(Math.abs(p.amount||0)).toLocaleString('en-IN')}{Number(p.amount)<0 ? ' R' : ''}
                    </div>
                    <button onClick={() => toggleVerify(p)} className="mt-1 cursor-pointer">
                      <VerifPill v={p.verification_status} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={{ color: C.textMuted }}>
                  <span className="inline-flex items-center gap-1">{m?.icon || '•'} {m?.label || p.method}</span>
                  {p.reference && <span className="font-mono truncate max-w-[140px]">{p.reference}</span>}
                  <span>Posted {post ? post.toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : '—'}</span>
                  {gapDays > 0 && (
                    <span style={{ color: gapDays > 7 ? (C.amber || '#d97706') : C.textLight }}>
                      {gapDays > 7 ? '⚠ ' : ''}txn {txn ? txn.toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : ''} ({gapDays}d late)
                    </span>
                  )}
                  {(p.collected_by_name || p.created_by_name) && (
                    <span>by {p.collected_by_name || p.created_by_name}</span>
                  )}
                </div>
              </div>
              </React.Fragment>
            )
          })}
          <div className="px-3 py-2 flex items-center justify-between gap-2 text-xs flex-wrap" style={{ background: C.bg, borderTop: `1px solid ${C.border}` }}>
            <div style={{ color: C.textMuted }}>
              Showing {activePayments.length} payments · Total ₹{Math.round(activePayments.reduce((s,p)=>s+Number(p.amount||0),0)).toLocaleString('en-IN')}
            </div>
            <button onClick={exportCsv} className="text-xs font-bold px-3 py-1.5 rounded" style={{ border: `1px solid ${C.border}`, color: C.text }}>
              Export CSV
            </button>
          </div>
        </div>
      )}

      {/* ── Cancelled sub-tab ───────────────────────────────── */}
      {tab === 'cancelled' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <KPI label="Cancelled orders" v={cancelKpis.cnt} />
            <KPI label="Collected pre-cancel" v={`₹${Math.round(cancelKpis.collected).toLocaleString('en-IN')}`} />
            <KPI label="Refund pending" v={`₹${Math.round(cancelKpis.refundPending).toLocaleString('en-IN')}`} accent={cancelKpis.refundPending > 0 ? (C.amber || '#d97706') : C.text} />
            <KPI label="Refund completed" v={`₹${Math.round(cancelKpis.refundDone).toLocaleString('en-IN')}`} accent={C.green} />
          </div>
          {loading ? <Loading /> :
            cancelledOrders.length === 0 ? <Empty msg="No cancelled orders in this date range." /> :
            <div className="space-y-2">
              {cancelledOrders.map(o => {
                const st = cancelStatus(o)
                const borderColor = st.tone === 'warn' ? (C.amber || '#d97706') : st.tone === 'ok' ? C.green : C.textLight
                const pillBg = st.tone === 'warn' ? '#fef3c7' : st.tone === 'ok' ? '#d1fae5' : '#f3f4f6'
                const pillFg = st.tone === 'warn' ? '#92400e' : st.tone === 'ok' ? '#065f46' : '#374151'
                return (
                  <div key={o.id} className="rounded-xl p-3 sm:p-4" style={{ background: '#fff', border: `1px solid ${C.border}`, borderLeft: `4px solid ${borderColor}` }}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-bold font-mono" style={{ color: C.text }}>{o.order_number}</div>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: pillBg, color: pillFg }}>{st.label}</span>
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: C.textMuted }}>
                          {o.customer_name || '—'} · Ordered {fmtDate(o.created_at)}
                          {o.cancelled_at && <> · Cancelled {fmtDate(o.cancelled_at)}</>}
                          {o.stylist && <> · <span style={{ color: C.purple }}>Stylist: {staffLabel(o.stylist)}</span></>}
                        </div>
                        {o.cancellation_reason && (
                          <div className="text-xs mt-1" style={{ color: C.textMuted }}>
                            <span className="font-bold">Reason:</span> {o.cancellation_reason}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
                      <div><span style={{ color: C.textMuted }}>Billed:</span> <span className="font-mono font-bold" style={{ color: C.text }}>₹{Math.round(o.total_price).toLocaleString('en-IN')}</span></div>
                      <div><span style={{ color: C.textMuted }}>Collected:</span> <span className="font-mono font-bold" style={{ color: C.text }}>₹{Math.round(o.payment_collected || 0).toLocaleString('en-IN')}</span></div>
                      <div>
                        {Number(o.refund_completed_amount || 0) > 0 ? (
                          <><span style={{ color: C.textMuted }}>Refunded:</span> <span className="font-mono font-bold" style={{ color: C.green }}>₹{Math.round(o.refund_completed_amount).toLocaleString('en-IN')}</span></>
                        ) : Number(o.refund_pending_amount || 0) > 0 ? (
                          <><span style={{ color: C.textMuted }}>Refund due:</span> <span className="font-mono font-bold" style={{ color: C.amber || '#d97706' }}>₹{Math.round(o.refund_pending_amount).toLocaleString('en-IN')}</span></>
                        ) : Number(o.payment_collected || 0) > 0 ? (
                          <><span style={{ color: C.textMuted }}>Refund due:</span> <span className="font-mono font-bold" style={{ color: C.amber || '#d97706' }}>₹{Math.round(o.payment_collected).toLocaleString('en-IN')}</span></>
                        ) : (
                          <span style={{ color: C.textLight }}>No money collected</span>
                        )}
                      </div>
                    </div>

                    {/* Payments collected before cancellation — these moved here from the Payments tab */}
                    {(paymentsByCancelledOrder[o.id] || []).length > 0 && (
                      <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.borderLight}` }}>
                        <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: C.textMuted }}>
                          Payments to reconcile ({paymentsByCancelledOrder[o.id].length})
                        </div>
                        <div className="space-y-1">
                          {paymentsByCancelledOrder[o.id].map(p => (
                            <div key={p.id} className="flex items-center gap-2 text-xs">
                              <span className="font-mono" style={{ color: C.textMuted }}>
                                {p.collected_at ? new Date(p.collected_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : '—'}
                              </span>
                              <span style={{ color: C.text }}>{methodByKey[p.method]?.label || p.method}</span>
                              <span className="font-mono" style={{ color: C.textMuted }}>{p.reference || '—'}</span>
                              <span className="ml-auto font-mono font-bold tabular-nums" style={{ color: C.text }}>₹{Math.round(p.amount).toLocaleString('en-IN')}</span>
                              <VerifCell p={p} canVerify={canVerify} canUnverify={canUnverify} onMark={() => markVerified(p)} onUnmark={() => unmarkVerified(p)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>}
        </>
      )}

      {/* ── Cash sub-tab — verified cash received from POS ──── */}
      {tab === 'cash' && (
        <>
          <div className="text-xs mb-4" style={{ color: C.textMuted }}>
            Verified <b>Cash-method</b> payments received at POS. QR / POS-terminal settle to the bank and are excluded.
            Payouts &amp; month reconciliation live in <b>Finance &rarr; Cash Recon</b>.
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            <KPI label="Verified cash in (period)" v={`₹${Math.round(cashTotals.period).toLocaleString('en-IN')}`} accent={C.green} />
            <KPI label="Cash payments (period)" v={cashRows.length} />
            <KPI label="Verified cash — all time" v={`₹${Math.round(cashTotals.allTime).toLocaleString('en-IN')}`} />
          </div>
          {cashLoading ? <Loading /> :
            cashRows.length === 0 ? <Empty msg="No verified cash in this date range. Verify Cash payments in the Payments tab and they appear here." /> :
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
              <div className="hidden sm:grid px-3 py-2 text-[10px] font-bold uppercase tracking-wider"
                style={{ gridTemplateColumns: '100px 1fr 140px 130px', color: C.textMuted, background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                <div>Date</div><div>Order / Ref</div><div>By</div><div className="text-right">Amount</div>
              </div>
              {cashRows.map(r => (
                <div key={r.id} className="grid grid-cols-2 sm:grid-cols-none px-3 py-2.5 text-xs items-center gap-y-1"
                  style={{ gridTemplateColumns: undefined, borderBottom: `1px solid ${C.borderLight}` }}>
                  <div className="font-mono" style={{ color: C.textMuted }}>
                    {r.date ? new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                  </div>
                  <div className="truncate" style={{ color: C.text }}>
                    <span className="font-mono font-bold">{r.order}</span>{r.ref ? ` · ${r.ref}` : ''}
                  </div>
                  <div className="truncate" style={{ color: C.textMuted }}>{r.who || '—'}</div>
                  <div className="text-right font-mono font-bold tabular-nums col-span-2 sm:col-auto" style={{ color: C.green }}>
                    +₹{Math.round(r.amount).toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
              <div className="px-3 py-2 flex items-center justify-between text-xs" style={{ background: C.bg, borderTop: `1px solid ${C.border}` }}>
                <span style={{ color: C.textMuted }}>{cashRows.length} cash payments in period</span>
                <span className="font-mono font-bold" style={{ color: C.text }}>₹{Math.round(cashTotals.period).toLocaleString('en-IN')}</span>
              </div>
            </div>}
        </>
      )}

      {/* ── Summary sub-tab ─────────────────────────────────── */}
      {tab === 'summary' && (
        loading ? <Loading /> :
        <div className="grid lg:grid-cols-2 gap-4">
          <Panel title="Receipts (date range)">
            <KV k="From new orders"     v={`₹${Math.round(summaryReceipts.initial).toLocaleString('en-IN')}`} />
            <KV k="From due payments"   v={`₹${Math.round(summaryReceipts.dues).toLocaleString('en-IN')}`} />
            <KV k="Refunds"             v={`₹${Math.round(summaryReceipts.refunds).toLocaleString('en-IN')}`} accent={C.red} />
            <div className="border-t pt-2 mt-2" style={{ borderColor: C.borderLight }}>
              <KV k="NET COLLECTED" v={`₹${Math.round(summaryReceipts.net).toLocaleString('en-IN')}`} bold accent={C.green} />
            </div>
          </Panel>
          <Panel title="Outstanding (within date range)">
            <KV k="Open orders" v={outstandingOrders.length} />
            <KV k="Total due"   v={`₹${Math.round(kpis.outstanding).toLocaleString('en-IN')}`} accent={C.red} />
            <KV k="Mismatch-flagged" v={mismatchedOrderIds.size} />
          </Panel>
          <Panel title="Verification (date range)">
            <KV k="✓ Verified"   v={`${verifStats.verified.n} · ₹${Math.round(verifStats.verified.amt).toLocaleString('en-IN')}`} accent={C.green} />
            <KV k="⚠ Unverified" v={`${verifStats.unverified.n} · ₹${Math.round(verifStats.unverified.amt).toLocaleString('en-IN')}`} accent={C.amber} />
            {verifStats.disputed.n > 0 && (
              <KV k="🚩 Disputed" v={`${verifStats.disputed.n} · ₹${Math.round(verifStats.disputed.amt).toLocaleString('en-IN')}`} accent={C.red} />
            )}
            <div className="border-t pt-2 mt-2" style={{ borderColor: C.borderLight }}>
              <KV k="Pending verification" v={`${verifStats.unverified.n + verifStats.disputed.n} payments`} bold />
            </div>
          </Panel>
          <Panel title="By Method">
            {summaryByMethod.length === 0 ? <div className="text-xs" style={{ color: C.textLight }}>No payments.</div> :
              summaryByMethod.map(m => (
                <KV key={m.key} k={`${m.icon} ${m.label}`} v={`₹${Math.round(m.amount).toLocaleString('en-IN')} · ${m.pct}%`} />
              ))}
          </Panel>
          <Panel title="By Stylist">
            {summaryByStylist.length === 0 ? <div className="text-xs" style={{ color: C.textLight }}>No payments.</div> :
              summaryByStylist.map(s => (
                <KV key={s.name} k={s.name} v={`₹${Math.round(s.amount).toLocaleString('en-IN')} · ${s.pct}%`} />
              ))}
          </Panel>
        </div>
      )}

      {/* Collect modal — allowPartial:true by default lets the user collect any
          amount up to the outstanding balance. PaymentSplitModal's Full/Partial
          toggle handles the UX; savePosPayments adds to payment_collected and
          leaves the remainder as payment_balance. */}
      {collectingFor && (
        <PaymentSplitModal
          total={Number(collectingFor.payment_balance || 0)}
          title={`Collect for ${collectingFor.order_number}`}
          onConfirm={onCollectPayment}
          onCancel={() => setCollectingFor(null)}
        />
      )}
    </div>
  )
}

const Loading = () => (
  <div className="py-12 text-center text-sm" style={{ color: C.textMuted }}>Loading…</div>
)
const Empty = ({ msg }) => (
  <div className="py-12 text-center text-sm" style={{ color: C.textLight }}>{msg}</div>
)

const KPI = ({ label, v, accent }) => (
  <div className="rounded-xl p-3" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>{label}</div>
    <div className="text-lg sm:text-xl font-bold font-mono mt-1" style={{ color: accent || C.text }}>{v}</div>
  </div>
)

const Sel = ({ value, onChange, opts }) => (
  <select value={value || ''} onChange={e => onChange(e.target.value)}
    className="text-xs px-2.5 py-1.5 rounded outline-none"
    style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }}>
    {opts.map(o => <option key={o.k} value={o.k}>{o.label}</option>)}
  </select>
)

// VerifCell — renders the column for the Payments table. Three states:
//   verified            : green pill + 'by <FirstName>' line below
//   unverified+canVerify: gold 'Mark as Verified' action button
//   unverified+!canVerify: muted 'Unverified' pill (no action)
const VerifCell = ({ p, canVerify, canUnverify, onMark, onUnmark }) => {
  const v = p.verification_status
  const verifiedByFirst = (p.verified_by_name || '').trim().split(/\s+/)[0] || ''
  if (v === 'verified') {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={{ background: '#d1fae5', color: '#065f46' }}>
          ✓ Verified
        </span>
        {verifiedByFirst && (
          <span className="text-[9px]" style={{ color: '#6b7280' }}>by {verifiedByFirst}</span>
        )}
        {canUnverify && (
          <button onClick={onUnmark} title="Un-verify (founders only)"
            className="text-[9px] font-bold hover:opacity-80" style={{ color: '#b91c1c' }}>
            Un-verify
          </button>
        )}
      </div>
    )
  }
  if (v === 'disputed') {
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded"
      style={{ background: '#fee2e2', color: '#7f1d1d' }}>🚩 Disputed</span>
  }
  // unverified branch
  if (canVerify) {
    return (
      <button onClick={onMark} title="Mark this payment as verified"
        className="text-[10px] font-bold px-2 py-1 rounded hover:opacity-85 transition-opacity"
        style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
        Mark as Verified
      </button>
    )
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded inline-block"
      style={{ background: '#fef3c7', color: '#92400e' }} title="Only finance / admin / founder / ops manager can verify">
      ⚠ Unverified
    </span>
  )
}

const VerifPill = ({ v }) => {
  const map = {
    verified:   { bg: '#d1fae5', fg: '#065f46', label: '✓ Verified' },
    unverified: { bg: '#fef3c7', fg: '#92400e', label: '⚠ Unverified' },
    disputed:   { bg: '#fee2e2', fg: '#7f1d1d', label: '🚩 Disputed' },
  }
  const m = map[v] || map.unverified
  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
}

const Panel = ({ title, children }) => (
  <div className="rounded-xl p-4" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
    <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>{title}</div>
    {children}
  </div>
)
const KV = ({ k, v, accent, bold }) => (
  <div className="flex items-center justify-between py-1.5 text-xs">
    <span style={{ color: C.textMuted, fontWeight: bold ? 700 : 400 }}>{k}</span>
    <span className="font-mono" style={{ color: accent || C.text, fontWeight: bold ? 700 : 600 }}>{v}</span>
  </div>
)

export default POSDues

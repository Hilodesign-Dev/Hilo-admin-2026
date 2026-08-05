import React, { useState, useEffect, useMemo } from 'react'
import { C, toast, fmtCurrency, fmtDate } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import MonthlyInvoicesSubTab from './MonthlyInvoicesSubTab'
import ExpenseBillsSubTab from './ExpenseBillsSubTab'
import GstFilingSummarySubTab from './GstFilingSummarySubTab'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const TAX_TYPE_OPTIONS = [
  { label: 'GST Monthly', tax_type: 'gst', category: 'gst_monthly' },
  { label: 'TDS Deposit', tax_type: 'tds', category: 'tds_deposit' },
  { label: 'Advance Tax', tax_type: 'advance_tax', category: 'advance_tax' },
  { label: 'Income Tax', tax_type: 'compliance', category: 'income_tax' },
  { label: 'Professional Tax', tax_type: 'compliance', category: 'professional_tax' },
  { label: 'ROC Filing', tax_type: 'compliance', category: 'roc' },
  { label: 'Audit Fees', tax_type: 'compliance', category: 'audit_fees' },
  { label: 'Other', tax_type: 'compliance', category: 'other' },
]

const TAX_TYPE_COLORS = { gst: '#dc2626', tds: '#7c3aed', advance_tax: '#2563eb', compliance: '#64748b' }
const TAX_TYPE_LABELS = { gst: 'GST', tds: 'TDS', advance_tax: 'Advance Tax', compliance: 'Compliance' }

const FY_OPTIONS = (() => {
  const now = new Date()
  const currFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  const options = []
  for (let y = currFY + 1; y >= currFY - 3; y--) options.push(`${y}-${String(y + 1).slice(2)}`)
  return options
})()

/* ═══════════════════════════════════════════════════════════════════════════
   GST TAB — Full GST Ledger + Tax Payments
   - Output GST from Shopify orders
   - Input Credit from: Fabric POs, Outsource payments, Monthly payment entries
   - CA final amount, freeze, filing status, challan tracking
   - Tax Payments: manage all tax payment obligations
   ═══════════════════════════════════════════════════════════════════════════ */
const GSTTab = ({ user }) => {
  const now = new Date()
  const [subTab, setSubTab] = useState('ledger') // 'ledger' | 'payments'

  // ── GST Ledger state ──
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Computed GST data
  const [outputGST, setOutputGST] = useState(0)
  const [cashSales, setCashSales] = useState({ total: 0, count: 0 })
  const [itcFabric, setItcFabric] = useState({ total: 0, breakdown: [] })
  const [itcOutsource, setItcOutsource] = useState({ total: 0, breakdown: [] })
  const [itcMonthly, setItcMonthly] = useState({ total: 0, breakdown: [] })
  const [totalITC, setTotalITC] = useState(0)
  const [autoNetPayable, setAutoNetPayable] = useState(0)

  // Filing state
  const [filing, setFiling] = useState(null) // existing gst_filings row
  const [caFinalAmount, setCaFinalAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [challanRef, setChallanRef] = useState('')

  // History
  const [filingHistory, setFilingHistory] = useState([])

  // Expanded sections
  const [expanded, setExpanded] = useState({ fabric: false, outsource: false, monthly: false })

  // ── Tax Payments state ──
  const [taxPayments, setTaxPayments] = useState([])
  const [taxLoading, setTaxLoading] = useState(false)
  const [taxFilter, setTaxFilter] = useState('all') // 'all' | 'gst' | 'tds' | 'advance_tax' | 'compliance'
  const [taxFY, setTaxFY] = useState(FY_OPTIONS[1] || FY_OPTIONS[0])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showPayModal, setShowPayModal] = useState(null) // tax_payment row
  const [editingPayment, setEditingPayment] = useState(null) // tax_payment row for edit
  const [addForm, setAddForm] = useState({ taxTypeIdx: 0, periodMonth: now.getMonth() + 1, periodYear: now.getFullYear(), assessmentYear: '', amount: '', dueDate: '', challanRef: '', notes: '' })
  const [payForm, setPayForm] = useState({ paidDate: new Date().toISOString().split('T')[0], challanRef: '', paymentMode: 'Online' })
  const [taxSaving, setTaxSaving] = useState(false)

  // Summary cards data
  const [taxSummary, setTaxSummary] = useState({ totalOutstanding: 0, gstPending: 0, tdsPending: 0, compliancePending: 0 })

  useEffect(() => {
    if (subTab === 'ledger') {
      loadGSTData()
      loadFilingHistory()
    }
  }, [month, year, subTab])

  useEffect(() => {
    if (subTab === 'payments') {
      loadTaxPayments()
    }
  }, [subTab, taxFilter, taxFY])

  // ═══════════════════════════════════════════════════════════════
  // GST LEDGER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  const loadGSTData = async () => {
    setLoading(true)
    try {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`

      // Parallel fetch all sources
      const [ordersRes, fabricPORes, outsourceRes, monthlyRes, filingRes] = await Promise.all([
        // Output GST from the GST filing snapshot (per-piece, place-of-supply, cash-adjusted)
        supa.from('gst_invoices')
          .select('taxable_amount, cgst_amount, sgst_amount, igst_amount, total_amount, cash_amount')
          .eq('period_year', year).eq('period_month', month),
        // ITC: Fabric POs with GST
        supa.from('fabric_purchase_orders')
          .select('id, vendor_name, subtotal, gst_percent, gst_amount, grand_total, order_date')
          .gte('order_date', startDate)
          .lt('order_date', endDate)
          .gt('gst_amount', 0)
          .order('order_date'),
        // ITC: Outsource payments with GST
        supa.from('outsource_payments')
          .select('id, amount, gst_amount, date, vendor_id, outsource_vendors(name)')
          .gte('date', startDate)
          .lt('date', endDate)
          .gt('gst_amount', 0)
          .order('date'),
        // ITC: Vendor invoices (Payments tab) with GST — credit on the invoice, not on payment
        supa.from('payment_invoices')
          .select('id, vendor_name, base_amount, gst_rate, gst_amount, category, period_month, period_year, invoice_date')
          .gt('gst_amount', 0),
        // Existing filing for this month
        supa.from('gst_filings')
          .select('*')
          .eq('period_month', month)
          .eq('period_year', year)
          .maybeSingle(),
      ])

      // Output GST from snapshot (cash carved out per order already)
      let output = 0, cashTotal = 0, cashCount = 0
      ;(ordersRes.data || []).forEach(o => {
        output += Number(o.cgst_amount || 0) + Number(o.sgst_amount || 0) + Number(o.igst_amount || 0)
        cashTotal += Number(o.cash_amount || 0)
        if (Number(o.cash_amount) > 0) cashCount += 1
      })
      setOutputGST(output)
      setCashSales({ total: cashTotal, count: cashCount })

      // ITC: Fabric POs — group by vendor
      const fabricByVendor = {}
      let fabricTotal = 0
      ;(fabricPORes.data || []).forEach(po => {
        const vendor = po.vendor_name || 'Unknown'
        if (!fabricByVendor[vendor]) fabricByVendor[vendor] = { gst: 0, count: 0 }
        fabricByVendor[vendor].gst += po.gst_amount || 0
        fabricByVendor[vendor].count++
        fabricTotal += po.gst_amount || 0
      })
      setItcFabric({
        total: fabricTotal,
        breakdown: Object.entries(fabricByVendor).map(([name, d]) => ({ name, gst: d.gst, count: d.count })).sort((a, b) => b.gst - a.gst),
      })

      // ITC: Outsource — group by vendor
      const outsourceByVendor = {}
      let outsourceTotal = 0
      ;(outsourceRes.data || []).forEach(p => {
        const vendor = p.outsource_vendors?.name || 'Unknown'
        if (!outsourceByVendor[vendor]) outsourceByVendor[vendor] = { gst: 0, count: 0 }
        outsourceByVendor[vendor].gst += p.gst_amount || 0
        outsourceByVendor[vendor].count++
        outsourceTotal += p.gst_amount || 0
      })
      setItcOutsource({
        total: outsourceTotal,
        breakdown: Object.entries(outsourceByVendor).map(([name, d]) => ({ name, gst: d.gst, count: d.count })).sort((a, b) => b.gst - a.gst),
      })

      // ITC: Monthly payments — group by vendor
      const monthlyByVendor = {}
      let monthlyTotal = 0
      ;(monthlyRes.data || []).forEach(e => {
        const my = e.period_year || (e.invoice_date ? new Date(e.invoice_date).getFullYear() : null)
        const mm = e.period_month || (e.invoice_date ? new Date(e.invoice_date).getMonth() + 1 : null)
        if (my !== year || mm !== month) return
        const vendor = e.vendor_name || 'Unknown'
        if (!monthlyByVendor[vendor]) monthlyByVendor[vendor] = { gst: 0, rate: e.gst_rate }
        monthlyByVendor[vendor].gst += e.gst_amount || 0
        monthlyTotal += e.gst_amount || 0
      })
      setItcMonthly({
        total: monthlyTotal,
        breakdown: Object.entries(monthlyByVendor).map(([name, d]) => ({ name, gst: d.gst, rate: d.rate })).sort((a, b) => b.gst - a.gst),
      })

      const itcTotal = fabricTotal + outsourceTotal + monthlyTotal
      setTotalITC(itcTotal)
      setAutoNetPayable(Math.max(0, output - itcTotal))

      // Filing state
      const f = filingRes.data
      setFiling(f)
      if (f) {
        setCaFinalAmount(f.ca_final_amount != null ? String(f.ca_final_amount) : '')
        setNotes(f.notes || '')
        setChallanRef(f.challan_ref || '')
      } else {
        setCaFinalAmount('')
        setNotes('')
        setChallanRef('')
      }
    } catch (err) {
      console.error('GST load error:', err)
      toast(false, 'Failed to load GST data')
    } finally { setLoading(false) }
  }

  const loadFilingHistory = async () => {
    try {
      const { data } = await supa.from('gst_filings')
        .select('*')
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .limit(24)
      setFilingHistory(data || [])
    } catch (_) {}
  }

  // ── Save / update filing ──────────────────────────────────────────
  const handleSaveFiling = async () => {
    setSaving(true)
    try {
      const payload = {
        period_month: month,
        period_year: year,
        output_gst: outputGST,
        input_credit: totalITC,
        net_gst_payable: autoNetPayable,
        ca_final_amount: caFinalAmount ? parseFloat(caFinalAmount) : null,
        notes,
      }

      if (filing?.id) {
        if (filing.is_frozen) { toast(false, 'Filing is frozen — unfreeze to edit'); setSaving(false); return }
        const { error } = await supa.from('gst_filings').update(payload).eq('id', filing.id)
        if (error) throw error
      } else {
        payload.filing_status = 'pending'
        const { error } = await supa.from('gst_filings').insert(payload)
        if (error) throw error
      }
      toast(true, 'Filing saved')
      loadGSTData()
      loadFilingHistory()
    } catch (err) {
      toast(false, 'Save failed: ' + (err.message || ''))
    } finally { setSaving(false) }
  }

  // ── Freeze / unfreeze ─────────────────────────────────────────────
  const handleFreeze = async () => {
    if (!filing?.id) { toast(false, 'Save the filing first'); return }
    try {
      const { error } = await supa.from('gst_filings').update({
        is_frozen: !filing.is_frozen,
        frozen_at: filing.is_frozen ? null : new Date().toISOString(),
      }).eq('id', filing.id)
      if (error) throw error
      toast(true, filing.is_frozen ? 'Filing unfrozen' : 'Filing frozen')
      loadGSTData()
      loadFilingHistory()
    } catch (err) { toast(false, 'Failed: ' + (err.message || '')) }
  }

  // ── Mark as filed ─────────────────────────────────────────────────
  const handleMarkFiled = async () => {
    if (!filing?.id) return
    try {
      const { error } = await supa.from('gst_filings').update({
        filing_status: 'filed',
        filed_date: new Date().toISOString().split('T')[0],
      }).eq('id', filing.id)
      if (error) throw error
      toast(true, 'Marked as filed')
      loadGSTData()
      loadFilingHistory()
    } catch (err) { toast(false, 'Failed: ' + (err.message || '')) }
  }

  // ── Mark as paid (and auto-create tax_payment) ────────────────────
  const handleMarkPaid = async () => {
    if (!filing?.id) return
    if (!challanRef.trim()) { toast(false, 'Enter challan reference'); return }
    try {
      const { error } = await supa.from('gst_filings').update({
        filing_status: 'paid',
        payment_date: new Date().toISOString().split('T')[0],
        payment_ref: challanRef,
        challan_ref: challanRef,
      }).eq('id', filing.id)
      if (error) throw error

      // Auto-create/update corresponding tax_payment record
      const payableAmt = caFinalAmount ? parseFloat(caFinalAmount) : autoNetPayable
      const periodLabel = `${MONTHS[month - 1]} ${year}`
      // Check if tax_payment already exists for this filing
      const { data: existing } = await supa.from('tax_payments')
        .select('id')
        .eq('gst_filing_id', filing.id)
        .maybeSingle()

      const taxPayload = {
        tax_type: 'gst',
        category: 'gst_monthly',
        period_label: periodLabel,
        period_month: month,
        period_year: year,
        amount: payableAmt,
        due_date: `${year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-20`,
        paid_date: new Date().toISOString().split('T')[0],
        challan_ref: challanRef,
        settled: false,
        amount_paid: 0,
        balance_due: payableAmt,
        gst_filing_id: filing.id,
        payment_mode: 'Online',
      }

      if (existing?.id) {
        await supa.from('tax_payments').update(taxPayload).eq('id', existing.id)
      } else {
        await supa.from('tax_payments').insert(taxPayload)
      }

      toast(true, 'GST payment recorded')
      loadGSTData()
      loadFilingHistory()
    } catch (err) { toast(false, 'Failed: ' + (err.message || '')) }
  }

  // ═══════════════════════════════════════════════════════════════
  // TAX PAYMENTS FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  const loadTaxPayments = async () => {
    setTaxLoading(true)
    try {
      // Parse FY to get date range
      const fyStart = parseInt(taxFY.split('-')[0])
      const startDate = `${fyStart}-04-01`
      const endDate = `${fyStart + 1}-03-31`

      let query = supa.from('tax_payments')
        .select('*')
        .gte('due_date', startDate)
        .lte('due_date', endDate)
        .order('due_date', { ascending: false })

      if (taxFilter !== 'all') {
        if (taxFilter === 'compliance') {
          query = query.in('tax_type', ['advance_tax', 'compliance'])
        } else {
          query = query.eq('tax_type', taxFilter)
        }
      }

      const { data, error } = await query
      if (error) throw error
      setTaxPayments(data || [])

      // Load summary (always unfiltered for cards)
      const { data: allUnsettled } = await supa.from('tax_payments')
        .select('tax_type, balance_due')
        .eq('settled', false)
      const summary = { totalOutstanding: 0, gstPending: 0, tdsPending: 0, compliancePending: 0 }
      ;(allUnsettled || []).forEach(tp => {
        const bal = tp.balance_due || 0
        summary.totalOutstanding += bal
        if (tp.tax_type === 'gst') summary.gstPending += bal
        else if (tp.tax_type === 'tds') summary.tdsPending += bal
        else summary.compliancePending += bal
      })
      setTaxSummary(summary)
    } catch (err) {
      console.error('Tax payments load error:', err)
      toast(false, 'Failed to load tax payments')
    } finally { setTaxLoading(false) }
  }

  const handleAddTaxPayment = async () => {
    setTaxSaving(true)
    try {
      const opt = TAX_TYPE_OPTIONS[addForm.taxTypeIdx]
      const needsPeriod = opt.tax_type === 'gst' || opt.tax_type === 'tds'
      const amount = parseFloat(addForm.amount)
      if (!amount || amount <= 0) { toast(false, 'Enter a valid amount'); setTaxSaving(false); return }
      if (!addForm.dueDate) { toast(false, 'Enter due date'); setTaxSaving(false); return }

      const periodLabel = needsPeriod
        ? `${MONTHS[addForm.periodMonth - 1]} ${addForm.periodYear}`
        : addForm.assessmentYear || `AY ${addForm.periodYear}-${String(addForm.periodYear + 1).slice(2)}`

      const payload = {
        tax_type: opt.tax_type,
        category: opt.category,
        period_label: periodLabel,
        period_month: needsPeriod ? addForm.periodMonth : null,
        period_year: addForm.periodYear,
        assessment_year: !needsPeriod ? (addForm.assessmentYear || `${addForm.periodYear}-${String(addForm.periodYear + 1).slice(2)}`) : null,
        amount,
        due_date: addForm.dueDate,
        challan_ref: addForm.challanRef || null,
        notes: addForm.notes || null,
        settled: false,
        amount_paid: 0,
        balance_due: amount,
      }

      if (editingPayment) {
        const { error } = await supa.from('tax_payments').update(payload).eq('id', editingPayment.id)
        if (error) throw error
        toast(true, 'Tax payment updated')
      } else {
        const { error } = await supa.from('tax_payments').insert(payload)
        if (error) throw error
        toast(true, 'Tax payment added')
      }
      setShowAddModal(false)
      setEditingPayment(null)
      resetAddForm()
      loadTaxPayments()
    } catch (err) {
      toast(false, 'Failed: ' + (err.message || ''))
    } finally { setTaxSaving(false) }
  }

  const handlePayTaxPayment = async () => {
    if (!showPayModal) return
    setTaxSaving(true)
    try {
      const { error } = await supa.from('tax_payments').update({
        paid_date: payForm.paidDate,
        challan_ref: payForm.challanRef || showPayModal.challan_ref || null,
        payment_mode: payForm.paymentMode,
        // Don't mark settled — settlement happens when matched to bank transaction
      }).eq('id', showPayModal.id)
      if (error) throw error
      toast(true, 'Payment recorded')
      setShowPayModal(null)
      loadTaxPayments()
    } catch (err) {
      toast(false, 'Failed: ' + (err.message || ''))
    } finally { setTaxSaving(false) }
  }

  const handleDeleteTaxPayment = async (id) => {
    if (!window.confirm('Delete this tax payment entry?')) return
    try {
      const { error } = await supa.from('tax_payments').delete().eq('id', id)
      if (error) throw error
      toast(true, 'Deleted')
      loadTaxPayments()
    } catch (err) { toast(false, 'Failed: ' + (err.message || '')) }
  }

  const openEditModal = (tp) => {
    const idx = TAX_TYPE_OPTIONS.findIndex(o => o.tax_type === tp.tax_type && o.category === tp.category)
    setAddForm({
      taxTypeIdx: idx >= 0 ? idx : 0,
      periodMonth: tp.period_month || now.getMonth() + 1,
      periodYear: tp.period_year || now.getFullYear(),
      assessmentYear: tp.assessment_year || '',
      amount: String(tp.amount || ''),
      dueDate: tp.due_date || '',
      challanRef: tp.challan_ref || '',
      notes: tp.notes || '',
    })
    setEditingPayment(tp)
    setShowAddModal(true)
  }

  const resetAddForm = () => {
    setAddForm({ taxTypeIdx: 0, periodMonth: now.getMonth() + 1, periodYear: now.getFullYear(), assessmentYear: '', amount: '', dueDate: '', challanRef: '', notes: '' })
  }

  const getPaymentStatus = (tp) => {
    if (tp.settled && tp.bank_txn_id) return 'settled'
    if (tp.settled) return 'settled'
    if (tp.paid_date) return 'paid'
    if (tp.amount_paid > 0 && tp.balance_due > 0) return 'partial'
    const today = new Date().toISOString().split('T')[0]
    if (tp.due_date && tp.due_date < today) return 'overdue'
    return 'pending'
  }

  const displayNetPayable = caFinalAmount ? parseFloat(caFinalAmount) : autoNetPayable
  const isFrozen = filing?.is_frozen
  const filingStatus = filing?.filing_status || 'draft'

  const statusColor = { draft: C.textMuted, pending: '#d97706', filed: '#3b82f6', paid: '#16a34a' }
  const statusLabel = { draft: 'Draft', pending: 'Pending', filed: 'Filed', paid: 'Paid' }

  const toggle = (key) => setExpanded(p => ({ ...p, [key]: !p[key] }))

  const inputStyle = { padding: '0.5rem 0.625rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, fontSize: '0.8125rem', fontFamily: 'Inter,sans-serif' }
  const labelStyle = { fontSize: '0.6875rem', fontWeight: 700, color: '#4e4636', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.25rem' }

  const paymentStatusConfig = {
    pending: { label: 'PENDING', bg: '#d9770618', color: '#d97706' },
    partial: { label: 'PARTIAL', bg: '#d9770618', color: '#d97706' },
    paid: { label: 'PAID', bg: '#3b82f618', color: '#3b82f6' },
    settled: { label: 'SETTLED', bg: '#16a34a18', color: '#16a34a' },
    overdue: { label: 'OVERDUE', bg: '#dc262618', color: '#dc2626' },
  }

  return (
    <div className="space-y-5" style={{ fontFamily: 'Manrope, sans-serif' }}>
      {/* Sub-tabs */}
      <div className="flex items-center gap-2">
        <button onClick={() => setSubTab('ledger')}
          style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', cursor: 'pointer',
            background: subTab === 'ledger' ? C.gold : C.bg,
            color: subTab === 'ledger' ? '#fff' : C.textMuted,
          }}>
          GST Ledger
        </button>
        <button onClick={() => setSubTab('invoices')}
          style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', cursor: 'pointer',
            background: subTab === 'invoices' ? C.gold : C.bg, color: subTab === 'invoices' ? '#fff' : C.textMuted }}>
          Monthly Invoices ⭐
        </button>
        <button onClick={() => setSubTab('summary')}
          style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', cursor: 'pointer',
            background: subTab === 'summary' ? C.gold : C.bg, color: subTab === 'summary' ? '#fff' : C.textMuted }}>
          Summary to File 🧾
        </button>
        <button onClick={() => setSubTab('expenses')}
          style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', cursor: 'pointer',
            background: subTab === 'expenses' ? C.gold : C.bg, color: subTab === 'expenses' ? '#fff' : C.textMuted }}>
          Expense Bills
        </button>
        <button onClick={() => setSubTab('payments')}
          style={{ padding: '0.4rem 0.875rem', borderRadius: '0.5rem', fontSize: '0.8125rem', fontWeight: 700, border: 'none', cursor: 'pointer',
            background: subTab === 'payments' ? C.gold : C.bg,
            color: subTab === 'payments' ? '#fff' : C.textMuted,
          }}>
          Tax Payments
        </button>
      </div>

      {subTab === 'invoices' && <MonthlyInvoicesSubTab />}
      {subTab === 'summary' && <GstFilingSummarySubTab />}
      {subTab === 'expenses' && <ExpenseBillsSubTab />}

      {/* ═══════════════════════════════════════════════════════════════
         GST LEDGER SUB-TAB
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'ledger' && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: C.text }}>GST Ledger</h2>
              <div style={{ fontSize: '0.75rem', color: C.textMuted }}>Output GST · Input Tax Credit · Filing & Payment</div>
            </div>
            <div className="flex gap-2">
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))} style={inputStyle}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={inputStyle}>
                {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {loading ? <div style={{ padding: '2.5rem', textAlign: 'center', color: C.textMuted }}>Loading GST data...</div> : (
            <>
              {/* ═══ Summary Cards ═══ */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="rounded-2xl p-4" style={{ background: C.cardBg, borderLeft: `4px solid ${C.red}` }}>
                  <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.25rem' }}>Output GST</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: C.red, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(outputGST)}</div>
                  <div style={{ fontSize: '0.625rem', color: C.textMuted }}>Filing snapshot · excl. cash</div>
                </div>
                <div className="rounded-2xl p-4" style={{ background: C.cardBg, borderLeft: '4px solid #0891b2' }}>
                  <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.25rem' }}>Cash sales (excluded)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0891b2', fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(cashSales.total)}</div>
                  <div style={{ fontSize: '0.625rem', color: C.textMuted }}>{cashSales.count} cash bills · not in GST</div>
                </div>
                <div className="rounded-2xl p-4" style={{ background: C.cardBg, borderLeft: '4px solid #16a34a' }}>
                  <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.25rem' }}>Input Credit (ITC)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#16a34a', fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(totalITC)}</div>
                  <div style={{ fontSize: '0.625rem', color: C.textMuted }}>Fabric + Outsource + Monthly</div>
                </div>
                <div className="rounded-2xl p-4" style={{ background: C.cardBg, borderLeft: `4px solid ${C.gold}` }}>
                  <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.25rem' }}>Auto Net Payable</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: C.gold, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(autoNetPayable)}</div>
                  <div style={{ fontSize: '0.625rem', color: C.textMuted }}>Output − ITC</div>
                </div>
                <div className="rounded-2xl p-4" style={{ background: caFinalAmount ? 'rgba(201,164,50,0.06)' : C.cardBg, borderLeft: '4px solid #7c3aed' }}>
                  <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.25rem' }}>CA Final Amount</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7c3aed', fontFamily: 'JetBrains Mono, monospace' }}>{caFinalAmount ? fmtCurrency(parseFloat(caFinalAmount)) : '—'}</div>
                  <div style={{ fontSize: '0.625rem', color: C.textMuted }}>{caFinalAmount ? 'After CA working' : 'Not yet entered'}</div>
                </div>
              </div>

              {/* ═══ ITC Breakdown ═══ */}
              <div className="rounded-2xl p-4" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text, marginBottom: '0.75rem' }}>Input Tax Credit Breakdown</h3>

                {/* Fabric POs */}
                <div className="mb-2">
                  <button onClick={() => toggle('fabric')} className="w-full flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: C.bg }}>
                    <span className="flex items-center gap-2">
                      <span style={{ fontSize: '0.75rem' }}>{expanded.fabric ? '▼' : '►'}</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#3b82f6' }}>Fabric POs ({itcFabric.breakdown.length} vendors)</span>
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem', fontWeight: 700, color: '#16a34a' }}>{fmtCurrency(itcFabric.total)}</span>
                  </button>
                  {expanded.fabric && itcFabric.breakdown.length > 0 && (
                    <div className="ml-6 mt-1 space-y-0.5">
                      {itcFabric.breakdown.map(v => (
                        <div key={v.name} className="flex justify-between text-xs px-3 py-1" style={{ color: C.text }}>
                          <span>{v.name} <span style={{ color: C.textMuted }}>({v.count} PO{v.count > 1 ? 's' : ''})</span></span>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#16a34a' }}>{fmtCurrency(v.gst)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Outsource */}
                <div className="mb-2">
                  <button onClick={() => toggle('outsource')} className="w-full flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: C.bg }}>
                    <span className="flex items-center gap-2">
                      <span style={{ fontSize: '0.75rem' }}>{expanded.outsource ? '▼' : '►'}</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#7c3aed' }}>Outsource Bills ({itcOutsource.breakdown.length} vendors)</span>
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem', fontWeight: 700, color: '#16a34a' }}>{fmtCurrency(itcOutsource.total)}</span>
                  </button>
                  {expanded.outsource && itcOutsource.breakdown.length > 0 && (
                    <div className="ml-6 mt-1 space-y-0.5">
                      {itcOutsource.breakdown.map(v => (
                        <div key={v.name} className="flex justify-between text-xs px-3 py-1" style={{ color: C.text }}>
                          <span>{v.name} <span style={{ color: C.textMuted }}>({v.count} payment{v.count > 1 ? 's' : ''})</span></span>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#16a34a' }}>{fmtCurrency(v.gst)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Monthly Payments */}
                <div className="mb-2">
                  <button onClick={() => toggle('monthly')} className="w-full flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: C.bg }}>
                    <span className="flex items-center gap-2">
                      <span style={{ fontSize: '0.75rem' }}>{expanded.monthly ? '▼' : '►'}</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#ea580c' }}>Monthly Payments ({itcMonthly.breakdown.length} vendors)</span>
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem', fontWeight: 700, color: '#16a34a' }}>{fmtCurrency(itcMonthly.total)}</span>
                  </button>
                  {expanded.monthly && itcMonthly.breakdown.length > 0 && (
                    <div className="ml-6 mt-1 space-y-0.5">
                      {itcMonthly.breakdown.map(v => (
                        <div key={v.name} className="flex justify-between text-xs px-3 py-1" style={{ color: C.text }}>
                          <span>{v.name} <span style={{ color: C.textMuted }}>(GST {v.rate}%)</span></span>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#16a34a' }}>{fmtCurrency(v.gst)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Total ITC */}
                <div className="flex justify-between items-center mt-3 pt-3" style={{ borderTop: `2px solid ${C.border}` }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: C.text }}>Total ITC</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: '#16a34a' }}>{fmtCurrency(totalITC)}</span>
                </div>
              </div>

              {/* ═══ Filing & Payment Section ═══ */}
              <div className="rounded-2xl p-4" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>Filing — {MONTHS[month-1]} {year}</h3>
                  <div className="flex items-center gap-2">
                    {filing?.id && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{
                        background: statusColor[filingStatus] + '18',
                        color: statusColor[filingStatus],
                      }}>{statusLabel[filingStatus] || filingStatus}</span>
                    )}
                    {isFrozen && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>Frozen</span>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label style={labelStyle}>CA Final Amount (₹) <span style={{ fontWeight: 400, textTransform: 'none' }}>— overrides auto-computed</span></label>
                    <input style={{ ...inputStyle, width: '100%', fontFamily: 'JetBrains Mono, monospace' }} type="text" inputMode="decimal"
                      value={caFinalAmount} onChange={e => setCaFinalAmount(e.target.value)} placeholder={String(Math.round(autoNetPayable))}
                      disabled={isFrozen} />
                  </div>
                  <div>
                    <label style={labelStyle}>Challan / CIN Reference</label>
                    <input style={{ ...inputStyle, width: '100%' }} value={challanRef} onChange={e => setChallanRef(e.target.value)} placeholder="Enter after payment" disabled={filingStatus === 'paid'} />
                  </div>
                </div>

                <div className="mb-3">
                  <label style={labelStyle}>Filing Notes</label>
                  <textarea style={{ ...inputStyle, width: '100%', resize: 'none' }} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="CA adjustments, reverse charge notes, etc." disabled={isFrozen} />
                </div>

                {/* Net Payable Summary */}
                <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(201,164,50,0.06)', border: '1px solid rgba(201,164,50,0.2)' }}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div style={{ fontSize: '0.6875rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {caFinalAmount ? 'CA Final Payable' : 'Auto-computed Payable'}
                      </div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: C.gold, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(displayNetPayable)}</div>
                    </div>
                    {caFinalAmount && Math.abs(parseFloat(caFinalAmount) - autoNetPayable) > 1 && (
                      <div className="text-right">
                        <div style={{ fontSize: '0.625rem', color: C.textMuted }}>Auto was {fmtCurrency(autoNetPayable)}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: parseFloat(caFinalAmount) > autoNetPayable ? C.red : '#16a34a' }}>
                          {parseFloat(caFinalAmount) > autoNetPayable ? '+' : ''}{fmtCurrency(parseFloat(caFinalAmount) - autoNetPayable)} diff
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  <button onClick={handleSaveFiling} disabled={saving || isFrozen}
                    style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: isFrozen ? '#d1d5db' : C.gold, color: '#fff', border: 'none', cursor: (saving || isFrozen) ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving...' : filing?.id ? 'Update Filing' : 'Save Filing'}
                  </button>
                  {filing?.id && (
                    <button onClick={handleFreeze}
                      style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: `1px solid ${isFrozen ? '#3b82f6' : C.border}`, background: isFrozen ? 'rgba(59,130,246,0.08)' : 'transparent', color: isFrozen ? '#3b82f6' : C.text, cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
                      {isFrozen ? 'Unfreeze' : 'Freeze Filing'}
                    </button>
                  )}
                  {filing?.id && isFrozen && filingStatus !== 'filed' && filingStatus !== 'paid' && (
                    <button onClick={handleMarkFiled}
                      style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
                      Mark as Filed
                    </button>
                  )}
                  {filing?.id && filingStatus === 'filed' && (
                    <button onClick={handleMarkPaid}
                      style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
                      Mark as Paid
                    </button>
                  )}
                </div>
              </div>

              {/* ═══ Filing History ═══ */}
              <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${C.border}` }}>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>Filing History</h3>
                </div>
                {filingHistory.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted, fontSize: '0.8125rem' }}>No filings recorded yet</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          {['Period', 'Output', 'ITC', 'Auto Net', 'CA Final', 'Status', 'Filed', 'Paid', 'Challan'].map(h => (
                            <th key={h} style={{ padding: '0.625rem', textAlign: 'left', fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filingHistory.map(f => (
                          <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                            onClick={() => { setMonth(f.period_month); setYear(f.period_year) }}>
                            <td style={{ padding: '0.625rem', fontWeight: 600 }}>{MONTHS[f.period_month - 1]} {f.period_year}</td>
                            <td style={{ padding: '0.625rem', fontFamily: 'JetBrains Mono, monospace', color: C.red }}>{fmtCurrency(f.output_gst)}</td>
                            <td style={{ padding: '0.625rem', fontFamily: 'JetBrains Mono, monospace', color: '#16a34a' }}>{fmtCurrency(f.input_credit)}</td>
                            <td style={{ padding: '0.625rem', fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(f.net_gst_payable)}</td>
                            <td style={{ padding: '0.625rem', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#7c3aed' }}>{f.ca_final_amount != null ? fmtCurrency(f.ca_final_amount) : '—'}</td>
                            <td style={{ padding: '0.625rem' }}>
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{
                                background: (statusColor[f.filing_status] || C.textMuted) + '18',
                                color: statusColor[f.filing_status] || C.textMuted,
                              }}>{statusLabel[f.filing_status] || f.filing_status}{f.is_frozen ? ' · Frozen' : ''}</span>
                            </td>
                            <td style={{ padding: '0.625rem', fontSize: '0.75rem', color: C.textMuted }}>{f.filed_date ? fmtDate(f.filed_date) : '—'}</td>
                            <td style={{ padding: '0.625rem', fontSize: '0.75rem', color: C.textMuted }}>{f.payment_date ? fmtDate(f.payment_date) : '—'}</td>
                            <td style={{ padding: '0.625rem', fontSize: '0.75rem', color: C.textMuted }}>{f.challan_ref || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════
         TAX PAYMENTS SUB-TAB
         ═══════════════════════════════════════════════════════════════ */}
      {subTab === 'payments' && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: C.text }}>Tax Payments</h2>
              <div style={{ fontSize: '0.75rem', color: C.textMuted }}>GST · TDS · Advance Tax · Compliance</div>
            </div>
            <button onClick={() => { resetAddForm(); setEditingPayment(null); setShowAddModal(true) }}
              style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: C.gold, color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
              + Add Tax Payment
            </button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-2xl p-4" style={{ background: C.cardBg, borderLeft: '4px solid #dc2626' }}>
              <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.25rem' }}>Total Outstanding</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#dc2626', fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(taxSummary.totalOutstanding)}</div>
              <div style={{ fontSize: '0.625rem', color: C.textMuted }}>All unsettled</div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: C.cardBg, borderLeft: `4px solid ${TAX_TYPE_COLORS.gst}` }}>
              <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.25rem' }}>GST Pending</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: TAX_TYPE_COLORS.gst, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(taxSummary.gstPending)}</div>
              <div style={{ fontSize: '0.625rem', color: C.textMuted }}>Unsettled GST</div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: C.cardBg, borderLeft: `4px solid ${TAX_TYPE_COLORS.tds}` }}>
              <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.25rem' }}>TDS Pending</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: TAX_TYPE_COLORS.tds, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(taxSummary.tdsPending)}</div>
              <div style={{ fontSize: '0.625rem', color: C.textMuted }}>Unsettled TDS</div>
            </div>
            <div className="rounded-2xl p-4" style={{ background: C.cardBg, borderLeft: `4px solid ${TAX_TYPE_COLORS.compliance}` }}>
              <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.25rem' }}>Compliance Pending</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: TAX_TYPE_COLORS.compliance, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(taxSummary.compliancePending)}</div>
              <div style={{ fontSize: '0.625rem', color: C.textMuted }}>Advance Tax + Others</div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label style={labelStyle}>Tax Type</label>
              <select value={taxFilter} onChange={e => setTaxFilter(e.target.value)} style={inputStyle}>
                <option value="all">All</option>
                <option value="gst">GST</option>
                <option value="tds">TDS</option>
                <option value="advance_tax">Advance Tax</option>
                <option value="compliance">Compliance</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Financial Year</label>
              <select value={taxFY} onChange={e => setTaxFY(e.target.value)} style={inputStyle}>
                {FY_OPTIONS.map(fy => <option key={fy} value={fy}>FY {fy}</option>)}
              </select>
            </div>
          </div>

          {/* Tax Payments Table */}
          <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>Tax Payment Records</h3>
            </div>
            {taxLoading ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: C.textMuted }}>Loading tax payments...</div>
            ) : taxPayments.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted, fontSize: '0.8125rem' }}>No tax payments found for this period</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['Type', 'Period', 'Amount', 'Due Date', 'Paid', 'Challan', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '0.625rem', textAlign: 'left', fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {taxPayments.map(tp => {
                      const status = getPaymentStatus(tp)
                      const sc = paymentStatusConfig[status]
                      const typeColor = TAX_TYPE_COLORS[tp.tax_type] || '#64748b'
                      return (
                        <tr key={tp.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: '0.625rem' }}>
                            <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '0.125rem 0.5rem', borderRadius: '9999px', background: typeColor + '18', color: typeColor }}>
                              {TAX_TYPE_LABELS[tp.tax_type] || tp.tax_type}
                            </span>
                          </td>
                          <td style={{ padding: '0.625rem', fontWeight: 600 }}>{tp.period_label || '—'}</td>
                          <td style={{ padding: '0.625rem', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{fmtCurrency(tp.amount)}</td>
                          <td style={{ padding: '0.625rem', fontSize: '0.75rem', color: C.textMuted }}>{tp.due_date ? fmtDate(tp.due_date) : '—'}</td>
                          <td style={{ padding: '0.625rem', fontSize: '0.75rem', color: tp.paid_date ? '#16a34a' : C.textMuted }}>{tp.paid_date ? fmtDate(tp.paid_date) : '—'}</td>
                          <td style={{ padding: '0.625rem', fontSize: '0.75rem', color: C.textMuted }}>{tp.challan_ref || tp.cin_ref || '—'}</td>
                          <td style={{ padding: '0.625rem' }}>
                            <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '0.125rem 0.5rem', borderRadius: '9999px', background: sc.bg, color: sc.color }}>
                              {sc.label}
                              {status === 'partial' && ` (${fmtCurrency(tp.amount_paid)} / ${fmtCurrency(tp.amount)})`}
                            </span>
                          </td>
                          <td style={{ padding: '0.625rem' }}>
                            <div className="flex gap-1">
                              {!tp.settled && !tp.paid_date && (
                                <button onClick={() => { setPayForm({ paidDate: new Date().toISOString().split('T')[0], challanRef: tp.challan_ref || '', paymentMode: 'Online' }); setShowPayModal(tp) }}
                                  style={{ fontSize: '0.6875rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                                  Pay
                                </button>
                              )}
                              <button onClick={() => openEditModal(tp)}
                                style={{ fontSize: '0.6875rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', color: C.textMuted }}>
                                Edit
                              </button>
                              <button onClick={() => handleDeleteTaxPayment(tp.id)}
                                style={{ fontSize: '0.6875rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', color: '#dc2626' }}>
                                Del
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ Add / Edit Tax Payment Modal ═══ */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowAddModal(false); setEditingPayment(null) } }}>
          <div style={{ background: '#fff', borderRadius: '1rem', width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: C.text, marginBottom: '1rem' }}>{editingPayment ? 'Edit Tax Payment' : 'Add Tax Payment'}</h3>

            <div className="space-y-3">
              {/* Tax Type */}
              <div>
                <label style={labelStyle}>Tax Type</label>
                <select value={addForm.taxTypeIdx} onChange={e => setAddForm(f => ({ ...f, taxTypeIdx: parseInt(e.target.value) }))} style={{ ...inputStyle, width: '100%' }}>
                  {TAX_TYPE_OPTIONS.map((opt, i) => <option key={i} value={i}>{opt.label}</option>)}
                </select>
              </div>

              {/* Period: month + year for GST/TDS, or Assessment Year for others */}
              {(() => {
                const opt = TAX_TYPE_OPTIONS[addForm.taxTypeIdx]
                const needsPeriod = opt.tax_type === 'gst' || opt.tax_type === 'tds'
                return needsPeriod ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label style={labelStyle}>Period Month</label>
                      <select value={addForm.periodMonth} onChange={e => setAddForm(f => ({ ...f, periodMonth: parseInt(e.target.value) }))} style={{ ...inputStyle, width: '100%' }}>
                        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Period Year</label>
                      <select value={addForm.periodYear} onChange={e => setAddForm(f => ({ ...f, periodYear: parseInt(e.target.value) }))} style={{ ...inputStyle, width: '100%' }}>
                        {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label style={labelStyle}>Assessment Year</label>
                    <input style={{ ...inputStyle, width: '100%' }} value={addForm.assessmentYear} onChange={e => setAddForm(f => ({ ...f, assessmentYear: e.target.value }))} placeholder="e.g. 2026-27" />
                  </div>
                )
              })()}

              {/* Amount */}
              <div>
                <label style={labelStyle}>Amount (₹)</label>
                <input style={{ ...inputStyle, width: '100%', fontFamily: 'JetBrains Mono, monospace' }} type="text" inputMode="decimal"
                  value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
              </div>

              {/* Due Date */}
              <div>
                <label style={labelStyle}>Due Date</label>
                <input style={{ ...inputStyle, width: '100%' }} type="date" value={addForm.dueDate} onChange={e => setAddForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>

              {/* Challan/CIN Reference */}
              <div>
                <label style={labelStyle}>Challan / CIN Reference</label>
                <input style={{ ...inputStyle, width: '100%' }} value={addForm.challanRef} onChange={e => setAddForm(f => ({ ...f, challanRef: e.target.value }))} placeholder="Optional" />
              </div>

              {/* Notes */}
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea style={{ ...inputStyle, width: '100%', resize: 'none' }} rows={2} value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => { setShowAddModal(false); setEditingPayment(null) }}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: C.textMuted }}>
                Cancel
              </button>
              <button onClick={handleAddTaxPayment} disabled={taxSaving}
                style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', background: C.gold, color: '#fff', border: 'none', cursor: taxSaving ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', fontWeight: 600, opacity: taxSaving ? 0.6 : 1 }}>
                {taxSaving ? 'Saving...' : editingPayment ? 'Update' : 'Add Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Pay Tax Payment Modal ═══ */}
      {showPayModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowPayModal(null) }}>
          <div style={{ background: '#fff', borderRadius: '1rem', width: '100%', maxWidth: 380, padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: C.text, marginBottom: '0.5rem' }}>Record Payment</h3>
            <div style={{ fontSize: '0.8125rem', color: C.textMuted, marginBottom: '1rem' }}>
              {TAX_TYPE_LABELS[showPayModal.tax_type]} — {showPayModal.period_label} — <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: C.text }}>{fmtCurrency(showPayModal.amount)}</span>
            </div>

            <div className="space-y-3">
              <div>
                <label style={labelStyle}>Paid Date</label>
                <input style={{ ...inputStyle, width: '100%' }} type="date" value={payForm.paidDate} onChange={e => setPayForm(f => ({ ...f, paidDate: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Challan / CIN Reference</label>
                <input style={{ ...inputStyle, width: '100%' }} value={payForm.challanRef} onChange={e => setPayForm(f => ({ ...f, challanRef: e.target.value }))} placeholder="Challan reference" />
              </div>
              <div>
                <label style={labelStyle}>Payment Mode</label>
                <select value={payForm.paymentMode} onChange={e => setPayForm(f => ({ ...f, paymentMode: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                  {['Online', 'NEFT', 'RTGS', 'UPI', 'Cheque', 'Other'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setShowPayModal(null)}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: C.textMuted }}>
                Cancel
              </button>
              <button onClick={handlePayTaxPayment} disabled={taxSaving}
                style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', background: '#16a34a', color: '#fff', border: 'none', cursor: taxSaving ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', fontWeight: 600, opacity: taxSaving ? 0.6 : 1 }}>
                {taxSaving ? 'Saving...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GSTTab

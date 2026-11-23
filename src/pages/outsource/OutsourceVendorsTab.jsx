import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supa, fetchAllProducts } from '../../lib/supabase'
import { uploadImage } from '../../lib/storage'
import { fmt, n } from '../../lib/helpers'
import { productToCamel } from '../../lib/caseMapping'
import { fetchAllProductsLegacy } from '../../lib/catalogueV2'
import { _logDeletion, _logChange } from '../../lib/logger'
import { createdByFields, updatedByFields } from '../../lib/auditHelpers'
import AuditStamp from '../../components/AuditStamp'

// ─── Constants ───────────────────────────────────────────────────────────────
const SERVICES = [
  { value: 'stitching', label: 'Stitching' },
  { value: 'embroidery_hand', label: 'Embroidery (Hand)' },
  { value: 'embroidery_machine', label: 'Embroidery (Machine)' },
  { value: 'dyeing', label: 'Dyeing' },
  { value: 'hand_painting', label: 'Hand Painting' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'dhoti', label: 'Dhoti' },
  { value: 'finishing', label: 'Finishing' },
  { value: 'other', label: 'Other' },
]
const SERVICE_MAP = Object.fromEntries(SERVICES.map(s => [s.value, s.label]))
const SERVICE_TYPE_CODE = { stitching: 'ST', embroidery_hand: 'EM', embroidery_machine: 'EM', dyeing: 'DY', hand_painting: 'HP', accessories: 'AC', dhoti: 'DH', finishing: 'FN', other: 'OT' }
const TYPE_TO_SERVICE_MAP = { 'Tailoring': 'stitching', 'Dyeing': 'dyeing', 'Hand Embroidery': 'embroidery_hand', 'Machine Embroidery': 'embroidery_machine', 'Hand Painting': 'hand_painting', 'Accessories': 'accessories', 'Dhoti': 'dhoti', 'Finishing': 'finishing', 'Other': 'other' }
const OUTSOURCE_TYPES = ['Tailoring', 'Dyeing', 'Hand Embroidery', 'Machine Embroidery', 'Hand Painting', 'Accessories', 'Dhoti', 'Finishing', 'Other']
const TYPE_TO_SERVICE = { 'Tailoring': 'stitching', 'Dyeing': 'dyeing', 'Hand Embroidery': 'embroidery_hand', 'Machine Embroidery': 'embroidery_machine', 'Hand Painting': 'hand_painting', 'Accessories': 'accessories', 'Dhoti': 'dhoti', 'Finishing': 'finishing', 'Other': 'other' }
const WORK_STATUSES = ['pending', 'in_progress', 'completed', 'delivered']
const STATUS_COLORS = { pending: '#d97706', in_progress: '#3b82f6', completed: '#16a34a', delivered: '#7c3aed' }
const PAYMENT_METHODS = ['bank_transfer', 'cash', 'upi', 'cheque', 'tds_govt']
const METHOD_LABEL = { bank_transfer: 'Bank Transfer', cash: 'Cash', upi: 'UPI', cheque: 'Cheque', tds_govt: 'TDS Payment (Govt)' }
const STITCHING_CATEGORIES_FALLBACK = ['Kurta', 'Kurta Set', 'Nehru Jacket', 'Indowestern', 'Bandhgala', 'Bling Blazer', 'Pattu Set', 'Sherwani', 'Bottom', 'Ethnic Pants', 'Shirt', 'Shirt Set', 'Shacket', 'Blazer', 'Trouser', 'Kids Fashion', 'Pagdi', 'Shoes', 'Jewellery', 'Other']
const BILL_SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'MTF']

// ─── Design Tokens ───────────────────────────────────────────────────────────
const C = {
  gold: '#c9a432', goldLight: 'rgba(212,168,67,0.12)', goldDark: '#795900',
  navy: '#0f172a', navyDeep: '#0b1929',
  bg: '#faf9f5', cardBg: '#fff', cream: '#f5f4f0',
  text: '#1b1c1a', textMuted: 'rgba(27,28,26,0.5)', textLight: 'rgba(27,28,26,0.3)',
  border: '#ebe8e0', borderLight: '#f3f1eb',
  green: '#16a34a', greenBg: 'rgba(22,163,74,0.08)',
  red: '#dc2626', redBg: 'rgba(220,38,38,0.08)',
  amber: '#d97706', amberBg: 'rgba(217,119,6,0.08)',
  purple: '#7c3aed', purpleBg: 'rgba(124,58,237,0.08)',
  blue: '#3b82f6', blueBg: 'rgba(59,130,246,0.08)',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtCurrency = (v) => {
  const num = n(v)
  if (!num) return '₹0'
  return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const generateVendorId = async (services) => {
  const primary = services[0] || 'other'
  const code = SERVICE_TYPE_CODE[primary] || 'OT'
  const { count } = await supa.from('outsource_vendors').select('id', { count: 'exact', head: true }).ilike('id', `HL-OV-${code}-%`)
  const seq = (count || 0) + 1
  return `HL-OV-${code}-${String(seq).padStart(3, '0')}`
}
const generatePaymentId = async (vendorId) => {
  const { data } = await supa.from('outsource_payments').select('id').eq('vendor_id', vendorId).order('id', { ascending: false }).limit(1)
  if (data && data.length > 0) {
    const lastId = data[0].id
    const lastSeq = parseInt(lastId.split('-').pop(), 10) || 0
    return `PAY-${vendorId}-${String(lastSeq + 1).padStart(3, '0')}`
  }
  return `PAY-${vendorId}-001`
}

// Bill number: HL-<first 2 letters of vendor name uppercase>-<sequence>
const generateBillNumber = async (vendor) => {
  const prefix = (vendor.name || 'XX').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()
  const pattern = `HL-${prefix}-%`
  const { count } = await supa.from('outsource_work_entries').select('id', { count: 'exact', head: true }).ilike('bill_number', pattern)
  const seq = (count || 0) + 1
  return `HL-${prefix}-${String(seq).padStart(4, '0')}`
}

// ─── Shared UI Primitives ────────────────────────────────────────────────────
const Overlay = ({ onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>{children}</div>
)
const Field = ({ label, children }) => (<div><label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: C.textMuted, letterSpacing: '0.06em' }}>{label}</label>{children}</div>)
const Input = (props) => <input {...props} className={`w-full text-sm px-3 py-2.5 rounded-xl border bg-white outline-none transition-colors focus:border-amber-700 ${props.className || ''}`} style={{ borderColor: C.border, fontFamily: 'Inter, sans-serif', ...props.style }} />
const Badge = ({ children, color = C.gold, bg }) => <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold inline-flex items-center" style={{ background: bg || `${color}18`, color }}>{children}</span>

const SummaryCard = ({ label, value, color, icon }) => (
  <div className="rounded-2xl p-4 relative overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.borderLight}` }}>
    <div className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${color}12` }}>
      <span style={{ color, fontSize: 14 }}>{icon}</span>
    </div>
    <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: C.textMuted }}>{label}</div>
    <div className="text-xl font-extrabold mt-1" style={{ color, fontFamily: 'Manrope, sans-serif' }}>{value}</div>
  </div>
)

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main Component ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const OutsourceVendorsTab = ({ stitchingMaster: stitchingMasterProp, setStitchingMaster }) => {
  const [vendors, setVendors] = useState([])
  const [workEntries, setWorkEntries] = useState([])
  const [payments, setPayments] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedVendor, setSelectedVendor] = useState(null)
  const [subTab, setSubTab] = useState('ledger')
  const [showAddVendor, setShowAddVendor] = useState(false)
  const [editVendor, setEditVendor] = useState(null)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [showPayment, setShowPayment] = useState(false)
  const [showReceipt, setShowReceipt] = useState(null)
  const [showRecon, setShowRecon] = useState(false)
  const [showCloseStatement, setShowCloseStatement] = useState(false)
  const [statementClosings, setStatementClosings] = useState([])
  const [showBillPreview, setShowBillPreview] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [vendorFilter, setVendorFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')

  // ─── Load Data ─────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [vR, wR, pR, oR, scR] = await Promise.all([
        supa.from('outsource_vendors').select('*').order('created_at', { ascending: false }),
        supa.from('outsource_work_entries').select('*').order('date', { ascending: false }),
        supa.from('outsource_payments').select('*').order('date', { ascending: false }),
        supa.from('shopify_orders').select('id, order_number, customer_name, line_items, created_at').order('created_at', { ascending: false }).limit(500),
        supa.from('outsource_statement_closings').select('*').order('close_date', { ascending: false }),
      ])
      if (vR.data) setVendors(vR.data)
      if (wR.data) setWorkEntries(wR.data)
      if (pR.data) setPayments(pR.data)
      if (oR.data) setOrders(oR.data)
      if (scR.data) setStatementClosings(scR.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])
  useEffect(() => { loadAll() }, [loadAll])

  // ─── Computed Stats ────────────────────────────────────────────────────
  const vendorStats = useMemo(() => {
    const stats = {}
    vendors.forEach(v => {
      const vE = workEntries.filter(e => e.vendor_id === v.id)
      const vP = payments.filter(p => p.vendor_id === v.id)
      const totalWork = vE.reduce((s, e) => s + n(e.total_cost), 0) + n(v.opening_balance)
      const tdsRate = v.tds_enabled ? 0.01 : 0
      const tdsDeducted = vE.reduce((s, e) => s + n(e.total_cost) * tdsRate, 0)
      const tdsPaid = vP.filter(p => p.is_tds_payment).reduce((s, p) => s + n(p.amount), 0)
      const vendorPayable = totalWork - tdsDeducted
      const vendorPaid = vP.filter(p => !p.is_tds_payment).reduce((s, p) => s + n(p.amount), 0)
      stats[v.id] = { totalWork, vendorPayable, vendorPaid, outstanding: vendorPayable - vendorPaid, tdsDeducted, tdsPaid, tdsPending: tdsDeducted - tdsPaid, entries: vE.length, payments: vP.length, tdsEnabled: v.tds_enabled }
    })
    return stats
  }, [vendors, workEntries, payments])

  const summary = useMemo(() => {
    let totalOutstanding = 0, withBalance = 0, tdsPending = 0, paidMonth = 0
    const mStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    vendors.forEach(v => { const s = vendorStats[v.id]; if (!s) return; if (s.outstanding > 0) { totalOutstanding += s.outstanding; withBalance++ }; if (s.tdsPending > 0) tdsPending += s.tdsPending })
    payments.forEach(p => { if (p.date >= mStart) paidMonth += n(p.amount) })
    return { totalOutstanding, withBalance, tdsPending, paidMonth }
  }, [vendors, vendorStats, payments])

  const filteredVendors = useMemo(() => {
    let list = [...vendors]
    if (vendorFilter) list = list.filter(v => v.name.toLowerCase().includes(vendorFilter.toLowerCase()) || (v.id || '').toLowerCase().includes(vendorFilter.toLowerCase()))
    if (serviceFilter) list = list.filter(v => (v.services && v.services.includes(serviceFilter)) || (v.type && TYPE_TO_SERVICE_MAP[v.type] === serviceFilter))
    return list
  }, [vendors, vendorFilter, serviceFilter])

  // ─── Load vendor pricing + reference data for rate prefill ─────────────
  const [vendorPricing, setVendorPricing] = useState([])
  const [catalogueProducts, setCatalogueProducts] = useState([])
  const [catalogueCostMap, setCatalogueCostMap] = useState({})
  const [fabricsList, setFabricsList] = useState([])
  const [coloursList, setColoursList] = useState([])
  useEffect(() => {
    if (!selectedVendor) return
    supa.from('vendor_pricing').select('*').eq('vendor_id', selectedVendor.id).then(({ data }) => {
      if (data) setVendorPricing(data)
    })
    const vType = selectedVendor.type || ''
    const isEmbroidery = vType.includes('Embroidery') || vType === 'Hand Painting'
    const isDyeing = vType === 'Dyeing'
    if (isEmbroidery) {
      // Lightweight product list for search UI
      supa.from('shopify_products').select('id, style_code, title, images').order('title').limit(2000).then(({ data }) => {
        if (data) setCatalogueProducts(data.map(p => ({
          id: p.id, styleCode: p.style_code || '', productTitle: p.title || '',
          image: Array.isArray(p.images) && p.images[0] ? (typeof p.images[0] === 'string' ? p.images[0] : p.images[0]?.src) : ''
        })))
      })
      // Embroidery cost map from catalogue (design_products)
      fetchAllProductsLegacy().then(function (data) {
        if (data && Array.isArray(data)) {
          const costMap = {}
          data.forEach(p => {
            if (p.styleCode && n(p.embroidery) > 0) costMap[p.styleCode] = n(p.embroidery)
          })
          setCatalogueCostMap(costMap)
        }
      }).catch(() => { })
    }
    if (isDyeing) {
      // Load fabrics for fabric picker
      supa.from('fabrics').select('id, name, image_urls').order('name').then(({ data }) => {
        if (data) setFabricsList(data)
      })
      // Load colours for dye code picker
      supa.from('colour_master').select('id, name, hex_code, dye_chart_code, family').eq('is_active', true).order('family').order('name').then(({ data }) => {
        if (data) setColoursList(data)
      })
    }
  }, [selectedVendor])

  // ─── CRUD Handlers ─────────────────────────────────────────────────────
  const handleSaveVendor = async (form) => {
    try {
      const payload = {
        name: form.name, phone: form.phone || form.contact || '', services: form.services,
        type: form.type || '', rate: n(form.rate), rate_unit: form.rate_unit || 'per piece',
        location: form.location || '', contact: form.contact || form.phone || '',
        tds_enabled: !!form.tds_enabled, pan: form.pan || '', gstin: form.gstin || '',
        address: form.address || '', bank_name: form.bank_name || '',
        bank_account: form.bank_account || '', bank_ifsc: form.bank_ifsc || '',
        notes: form.notes || '', updated_at: new Date().toISOString()
      }
      if (!form.balance_frozen) {
        payload.opening_balance = n(form.opening_balance)
        if (n(form.opening_balance) && form.freeze_balance) payload.balance_frozen = true
      }
      if (form._isExisting) {
        const { error } = await supa.from('outsource_vendors').update(payload).eq('id', form.id)
        if (error) throw error
      } else {
        const id = form.id || await generateVendorId(form.services)
        payload.opening_balance = n(form.opening_balance)
        if (form.freeze_balance) payload.balance_frozen = true
        const { error } = await supa.from('outsource_vendors').insert({ id, ...payload, created_at: new Date().toISOString() })
        if (error) throw error
      }
      setShowAddVendor(false); setEditVendor(null)
      await loadAll()
      if (selectedVendor && form.id === selectedVendor.id) {
        const { data } = await supa.from('outsource_vendors').select('*').eq('id', form.id).single()
        if (data) setSelectedVendor(data)
      }
    } catch (e) { alert('Error: ' + e.message) }
  }

  // ─── FIFO Recalculation ──────────────────────────────────────────────────
  // Re-distributes ALL payments for a vendor across bills oldest-first.
  // Called after bill edits/deletes to keep amount_paid/balance_due in sync.
  const recalcFIFO = async (vendorId) => {
    // Fetch fresh data
    const [{ data: allEntries }, { data: allPayments }] = await Promise.all([
      supa.from('outsource_work_entries').select('*').eq('vendor_id', vendorId).order('date', { ascending: true }),
      supa.from('outsource_payments').select('*').eq('vendor_id', vendorId).eq('is_tds_payment', false).order('date', { ascending: true }),
    ])
    if (!allEntries || !allPayments) return

    // Reset all entries — allow negative balance_due for credit notes
    const entryMap = {}
    for (const e of allEntries) {
      entryMap[e.id] = { ...e, amount_paid: 0, balance_due: n(e.total_cost), settled: n(e.total_cost) <= 0, settled_payment_id: null }
    }

    // Re-apply each payment via FIFO
    for (const pay of allPayments) {
      const cutoff = pay.cutoff_date || pay.date
      const eligible = allEntries.filter(e => n(e.total_cost) > 0 && e.date <= cutoff).sort((a, b) => a.date.localeCompare(b.date))
      let remaining = n(pay.amount)
      const allocations = []
      for (const entry of eligible) {
        if (remaining <= 0) break
        const em = entryMap[entry.id]
        const unpaid = Math.max(0, n(em.balance_due))
        if (unpaid <= 0) continue
        const settle = Math.min(remaining, unpaid)
        allocations.push({ entry_id: entry.id, amount_settled: settle })
        em.amount_paid += settle
        em.balance_due = Math.max(0, n(entry.total_cost) - em.amount_paid)
        if (em.balance_due <= 0) { em.settled = true; em.settled_payment_id = pay.id }
        remaining -= settle
      }
      // Update payment's settled_entries
      await supa.from('outsource_payments').update({ settled_entries: allocations }).eq('id', pay.id)
    }

    // Batch-update all entries
    for (const e of allEntries) {
      const em = entryMap[e.id]
      if (em.amount_paid !== n(e.amount_paid) || em.balance_due !== n(e.balance_due) || em.settled !== e.settled) {
        await supa.from('outsource_work_entries').update({
          amount_paid: em.amount_paid, balance_due: em.balance_due,
          settled: em.settled, settled_payment_id: em.settled_payment_id
        }).eq('id', e.id)
      }
    }
  }

  const handleSaveEntry = async (form) => {
    try {
      // Strip temp fields (prefixed _) before saving to DB
      const lineItems = (form.line_items || []).map(li => {
        const clean = {}; Object.keys(li).forEach(k => { if (!k.startsWith('_')) clean[k] = li[k] }); return clean
      })
      const totalCost = lineItems.reduce((s, li) => s + (n(li.qty) * n(li.rate)), 0)
      if (form.id) {
        const existing = workEntries.find(e => e.id === form.id)
        // Block edit if entry is in a closed period
        if (existing) {
          const vClose = statementClosings.filter(c => c.vendor_id === existing.vendor_id).sort((a, b) => b.close_date.localeCompare(a.close_date))[0]
          if (vClose && existing.date <= vClose.close_date) return alert('This bill is in a closed statement period and cannot be edited. Reopen the statement first.')
        }
        const updates = {
          date: form.date, service: form.service, description: form.description,
          total_cost: totalCost, status: form.status,
          order_id: form.order_id || null, order_number: form.order_number || null,
          line_items: lineItems, updated_at: new Date().toISOString()
        }
        if (existing?.settled) updates.edit_note = form.edit_note || ''
        await supa.from('outsource_work_entries').update({ ...updates, ...updatedByFields() }).eq('id', form.id)
        // Recalculate all FIFO allocations when total_cost changes
        if (existing && totalCost !== n(existing.total_cost)) {
          await recalcFIFO(selectedVendor.id)
        }
      } else {
        const billNumber = await generateBillNumber(selectedVendor)
        await supa.from('outsource_work_entries').insert({
          vendor_id: selectedVendor.id, date: form.date, bill_number: billNumber,
          service: form.service, description: form.description, total_cost: totalCost,
          amount_paid: 0, balance_due: totalCost, settled: totalCost <= 0,
          status: form.status || 'pending',
          order_id: form.order_id || null, order_number: form.order_number || null,
          line_items: lineItems,
          ...createdByFields()
        })
        // Recalculate FIFO — new backdated bill may change allocation order
        await recalcFIFO(selectedVendor.id)
      }
      setShowAddEntry(false); setEditEntry(null); await loadAll()
    } catch (e) { alert('Error: ' + e.message) }
  }

  const handleDeleteEntry = async (entry) => {
    setConfirmDelete({ type: 'bill', item: entry })
  }
  const executeDeleteEntry = async (entry) => {
    try {
      // Block if entry is in a closed period
      const vClose = statementClosings.filter(c => c.vendor_id === entry.vendor_id).sort((a, b) => b.close_date.localeCompare(a.close_date))[0]
      if (vClose && entry.date <= vClose.close_date) return alert('This bill is in a closed statement period. Reopen the statement first.')
      await _logDeletion('outsource_bill', entry.id, entry.bill_number || entry.id, entry)
      await supa.from('outsource_work_entries').delete().eq('id', entry.id)
      // Recalculate FIFO — deleted bill frees up payment allocation for remaining bills
      await recalcFIFO(entry.vendor_id)
      setConfirmDelete(null)
      await loadAll()
    } catch (e) { alert('Delete failed: ' + e.message) }
  }

  const handleMakePayment = async (form) => {
    try {
      const payId = await generatePaymentId(selectedVendor.id)
      let proofUrl = ''
      if (form.proofFile) proofUrl = await uploadImage(form.proofFile, 'outsource-payments')

      const { error } = await supa.from('outsource_payments').insert({
        id: payId, vendor_id: selectedVendor.id, date: form.date, amount: n(form.amount),
        method: form.is_tds_payment ? 'tds_govt' : form.method, reference: form.reference,
        proof_url: proofUrl, settled_entries: [], cutoff_date: form.cutoff_date || form.date,
        notes: form.notes, tds_amount: n(form.tds_amount), is_tds_payment: !!form.is_tds_payment, tds_pan: selectedVendor.pan || '',
        settled: false,
        ...createdByFields()
      })
      if (error) throw error

      // Full FIFO recalculation — distributes all payments across bills
      if (!form.is_tds_payment) await recalcFIFO(selectedVendor.id)

      // Fetch the updated payment for receipt display
      const { data: updatedPay } = await supa.from('outsource_payments').select('settled_entries').eq('id', payId).single()
      setShowPayment(false)
      setShowReceipt({ id: payId, vendor: selectedVendor, date: form.date, amount: n(form.amount), method: form.is_tds_payment ? 'tds_govt' : form.method, reference: form.reference, proof_url: proofUrl, settled_entries: updatedPay?.settled_entries || [], cutoff_date: form.cutoff_date || form.date, notes: form.notes, tds_amount: n(form.tds_amount), is_tds_payment: !!form.is_tds_payment })
      await loadAll()
    } catch (e) { alert('Error: ' + e.message) }
  }

  const handleDeletePayment = async (payment) => {
    setConfirmDelete({ type: 'payment', item: payment })
  }
  const executeDeletePayment = async (payment) => {
    try {
      // Block if payment is in a closed period
      const vClose = statementClosings.filter(c => c.vendor_id === payment.vendor_id).sort((a, b) => b.close_date.localeCompare(a.close_date))[0]
      if (vClose && payment.date <= vClose.close_date) return alert('This payment is in a closed statement period. Reopen the statement first.')
      await _logDeletion('outsource_payment', payment.id, payment.id, payment)
      await supa.from('outsource_payments').delete().eq('id', payment.id)
      // Full FIFO recalculation after deleting payment
      if (!payment.is_tds_payment) await recalcFIFO(payment.vendor_id)
      setConfirmDelete(null)
      await loadAll()
    } catch (e) { alert('Delete failed: ' + e.message) }
  }

  // ─── Render ────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="font-bold text-lg tracking-widest mb-2" style={{ color: C.gold, fontFamily: 'Georgia,serif' }}>HILO</div>
        <div className="text-xs" style={{ color: C.textLight }}>Loading vendors…</div>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // ─── VENDOR DETAIL VIEW ────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  const handleDeleteClosing = async (closing) => {
    setConfirmDelete({ type: 'closing', item: closing })
  }
  const executeDeleteClosing = async (closing) => {
    try {
      // Only allow deleting the LATEST closing for a vendor
      const vClosings = statementClosings.filter(c => c.vendor_id === closing.vendor_id).sort((a, b) => b.close_date.localeCompare(a.close_date))
      if (vClosings.length > 0 && vClosings[0].id !== closing.id) {
        return alert('You can only reopen the most recent statement close. Delete newer closings first.')
      }
      await _logDeletion('outsource_closing', closing.id, `Close ${closing.close_date}`, closing)
      await supa.from('outsource_statement_closings').delete().eq('id', closing.id)
      setConfirmDelete(null)
      await loadAll()
    } catch (e) { alert('Delete failed: ' + e.message) }
  }

  const handleCloseStatement = async (form) => {
    try {
      const { error } = await supa.from('outsource_statement_closings').insert({
        vendor_id: selectedVendor.id, close_date: form.close_date,
        closing_balance: form.closing_balance, carry_forward: form.carry_forward,
        closing_payment_id: form.closing_payment_id || null, notes: form.notes || ''
      })
      if (error) throw error
      setShowCloseStatement(false)
      await loadAll()
    } catch (e) { alert('Error: ' + e.message) }
  }

  if (selectedVendor) {
    const vEntries = workEntries.filter(e => e.vendor_id === selectedVendor.id).sort((a, b) => b.date.localeCompare(a.date))
    const vPayments = payments.filter(p => p.vendor_id === selectedVendor.id).sort((a, b) => b.date.localeCompare(a.date))
    const vClosings = statementClosings.filter(c => c.vendor_id === selectedVendor.id)
    const latestClose = vClosings.length > 0 ? vClosings[0] : null
    const stats = vendorStats[selectedVendor.id] || {}

    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        {/* Back */}
        <button onClick={() => setSelectedVendor(null)} className="inline-flex items-center gap-1.5 text-sm font-medium mb-4 hover:opacity-70 transition-opacity" style={{ color: C.gold }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          All Vendors
        </button>

        {/* Vendor Header Card */}
        <div className="rounded-2xl p-5 mb-5" style={{ background: C.navy }}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold" style={{ background: C.goldLight, color: C.gold }}>{selectedVendor.name.charAt(0)}</div>
                <div>
                  <h2 className="text-lg font-bold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>{selectedVendor.name}</h2>
                  <div className="text-xs text-white/40 mt-0.5 font-mono">{selectedVendor.id}</div>
                </div>
              </div>
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {selectedVendor.type && <Badge color={C.gold} bg="rgba(201,164,50,0.15)">{selectedVendor.type}</Badge>}
                {selectedVendor.tds_enabled && <Badge color={C.amber} bg="rgba(217,119,6,0.15)">TDS 1%</Badge>}
                {selectedVendor.location && <span className="text-[10px] text-white/30">{selectedVendor.location}</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-white/30 font-medium">Outstanding</div>
              <div className="text-2xl font-extrabold mt-0.5" style={{ color: stats.outstanding > 0 ? '#ef4444' : C.green, fontFamily: 'Manrope' }}>{fmtCurrency(stats.outstanding)}</div>
              {stats.tdsEnabled && stats.tdsPending > 0 && (
                <div className="text-[10px] mt-1 text-amber-400">TDS pending: {fmtCurrency(stats.tdsPending)}</div>
              )}
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-0 mb-5 overflow-x-auto" style={{ borderBottom: `1px solid ${C.border}` }}>
          {[['ledger', 'Ledger'], ['entries', 'Bills'], ['pricing', 'Pricing'], ['info', 'Vendor Info']].map(([id, label]) => (
            <button key={id} onClick={() => setSubTab(id)}
              className="px-4 py-2.5 text-sm font-semibold transition-all whitespace-nowrap"
              style={{ color: subTab === id ? C.goldDark : C.textMuted, borderBottom: subTab === id ? `2px solid ${C.gold}` : '2px solid transparent' }}>
              {label}
            </button>
          ))}
        </div>

        {/* ─── Ledger ─── */}
        {subTab === 'ledger' && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-sm font-bold" style={{ color: C.text }}>Transaction Ledger</h3>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setEditEntry(null); setShowAddEntry(true) }} className="text-xs px-3 py-1.5 rounded-xl border font-semibold transition-colors hover:shadow-sm" style={{ borderColor: C.green, color: C.green }}>+ New Bill</button>
                <button onClick={() => setShowCloseStatement(true)} className="text-xs px-3 py-1.5 rounded-xl border font-medium" style={{ borderColor: C.gold, color: C.goldDark }}>Close Statement</button>
                <button onClick={() => setShowRecon(true)} className="text-xs px-3 py-1.5 rounded-xl border font-medium" style={{ borderColor: C.border, color: C.textMuted }}>Reconciliation</button>
                <button onClick={() => setShowPayment(true)} className="text-xs px-3 py-1.5 rounded-xl font-semibold text-white" style={{ background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})` }}>Make Payment</button>
              </div>
            </div>
            <LedgerTimeline entries={vEntries} payments={vPayments} vendor={selectedVendor} closings={vClosings} latestClose={latestClose} onViewReceipt={p => setShowReceipt(p)} onViewBill={e => setShowBillPreview(e)} onEditBill={e => { setEditEntry(e); setShowAddEntry(true) }} onDeleteEntry={handleDeleteEntry} onDeletePayment={handleDeletePayment} onDeleteClosing={handleDeleteClosing}
              onSettleToggle={async (payment) => {
                const newVal = !payment.settled;
                await supa.from('outsource_payments').update({ settled: newVal, settled_at: newVal ? new Date().toISOString() : null, settled_by: newVal ? (window._currentUserName || 'System') : null, settlement_mode: payment.method === 'cash' ? 'cash' : 'bank' }).eq('id', payment.id);
                await loadAll();
              }} />
          </div>
        )}

        {/* ─── Bills (Work Entries) ─── */}
        {subTab === 'entries' && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-sm font-bold" style={{ color: C.text }}>{vEntries.length} Bills</h3>
              <button onClick={() => { setEditEntry(null); setShowAddEntry(true) }} className="text-xs px-3 py-1.5 rounded-xl font-semibold text-white" style={{ background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})` }}>+ New Bill</button>
            </div>
            <WorkEntriesTable entries={vEntries} latestClose={latestClose} onEdit={e => { setEditEntry(e); setShowAddEntry(true) }} onDelete={handleDeleteEntry} onViewBill={e => setShowBillPreview(e)} />
          </div>
        )}

        {/* ─── Pricing ─── */}
        {subTab === 'pricing' && <VendorPricingTab vendor={selectedVendor} stitchingMasterProp={stitchingMasterProp} />}

        {/* ─── Vendor Info ─── */}
        {subTab === 'info' && <VendorInfoForm vendor={selectedVendor} onSave={handleSaveVendor} />}

        {/* Modals */}
        {showAddEntry && <WorkEntryModal entry={editEntry} vendor={selectedVendor} orders={orders} vendorPricing={vendorPricing} catalogueProducts={catalogueProducts} catalogueCostMap={catalogueCostMap} fabricsList={fabricsList} coloursList={coloursList} stitchingMasterProp={stitchingMasterProp} onSave={handleSaveEntry} onClose={() => { setShowAddEntry(false); setEditEntry(null) }} />}
        {showPayment && <PaymentModal vendor={selectedVendor} entries={workEntries.filter(e => e.vendor_id === selectedVendor.id && n(e.balance_due) > 0)} stats={stats} latestClose={latestClose} onPay={handleMakePayment} onClose={() => setShowPayment(false)} />}
        {showReceipt && <ReceiptModal receipt={showReceipt} vendor={selectedVendor} entries={workEntries} onClose={() => setShowReceipt(null)} />}
        {showRecon && <ReconciliationModal vendor={selectedVendor} entries={vEntries} payments={vPayments} closings={vClosings} onClose={() => setShowRecon(false)} />}
        {showCloseStatement && <CloseStatementModal vendor={selectedVendor} entries={vEntries} payments={vPayments} latestClose={latestClose} stats={stats} onClose={() => setShowCloseStatement(false)} onSave={handleCloseStatement} />}
        {showBillPreview && <BillPreviewModal entry={showBillPreview} vendor={selectedVendor} onClose={() => setShowBillPreview(null)} />}
        {confirmDelete && (
          <Overlay onClose={() => setConfirmDelete(null)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl mx-4" onClick={e => e.stopPropagation()}>
              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: C.redBg }}>
                  <svg className="w-6 h-6" style={{ color: C.red }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </div>
                <h3 className="text-base font-bold" style={{ color: C.text }}>
                  {confirmDelete.type === 'closing' ? 'Reopen Statement?' : `Delete ${confirmDelete.type === 'bill' ? 'Bill' : 'Payment'}?`}
                </h3>
                <div className="text-xs mt-2" style={{ color: C.textMuted }}>
                  {confirmDelete.type === 'bill'
                    ? `${confirmDelete.item.bill_number || 'Bill'} — ${fmtCurrency(confirmDelete.item.total_cost)}`
                    : confirmDelete.type === 'closing'
                      ? `Statement closed on ${fmtDate(confirmDelete.item.close_date)} · Carry forward: ${fmtCurrency(confirmDelete.item.carry_forward)}`
                      : `${confirmDelete.item.id} — ${fmtCurrency(confirmDelete.item.amount)}`
                  }
                </div>
                {confirmDelete.type === 'bill' && n(confirmDelete.item.amount_paid) > 0 && (
                  <div className="text-[11px] mt-2 px-3 py-1.5 rounded-lg" style={{ background: C.amberBg, color: C.amber }}>
                    This bill has ₹{n(confirmDelete.item.amount_paid).toLocaleString()} paid against it. Delete the payment first.
                  </div>
                )}
                {confirmDelete.type === 'payment' && confirmDelete.item.settled_entries?.length > 0 && (
                  <div className="text-[11px] mt-2 px-3 py-1.5 rounded-lg" style={{ background: C.amberBg, color: C.amber }}>
                    This payment covers {confirmDelete.item.settled_entries.length} bill(s). Their balances will be restored.
                  </div>
                )}
                {confirmDelete.type === 'closing' && (
                  <div className="text-[11px] mt-2 px-3 py-1.5 rounded-lg" style={{ background: C.amberBg, color: C.amber }}>
                    Reopening will unlock all bills and payments in this closed period, allowing edits and deletions.
                  </div>
                )}
                <div className="text-[10px] mt-2" style={{ color: C.textLight }}>This action is logged and can be reviewed in Deletion Log.</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(null)} className="flex-1 text-sm py-2.5 rounded-xl border font-medium" style={{ borderColor: C.border, color: C.textMuted }}>Cancel</button>
                <button onClick={() => confirmDelete.type === 'bill' ? executeDeleteEntry(confirmDelete.item) : confirmDelete.type === 'closing' ? executeDeleteClosing(confirmDelete.item) : executeDeletePayment(confirmDelete.item)} className="flex-1 text-sm py-2.5 rounded-xl text-white font-semibold" style={{ background: C.red }}>
                  {confirmDelete.type === 'closing' ? 'Reopen' : 'Delete'}
                </button>
              </div>
            </div>
          </Overlay>
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ─── VENDOR LIST VIEW ──────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: C.text, fontFamily: 'Manrope, sans-serif', letterSpacing: '-0.02em' }}>Outsource Vendors</h1>
          <p className="text-xs mt-1" style={{ color: C.textLight }}>{vendors.length} vendors · Job-work management</p>
        </div>
        <button onClick={() => { setEditVendor(null); setShowAddVendor(true) }} className="text-sm px-4 py-2.5 rounded-xl font-semibold text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})` }}>+ New Vendor</button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Total Outstanding" value={fmtCurrency(summary.totalOutstanding)} color={C.red} icon="₹" />
        <SummaryCard label="Vendors with Balance" value={summary.withBalance} color={C.amber} icon="!" />
        <SummaryCard label="TDS Pending (Govt)" value={fmtCurrency(summary.tdsPending)} color={C.purple} icon="T" />
        <SummaryCard label="Paid This Month" value={fmtCurrency(summary.paidMonth)} color={C.blue} icon="✓" />
      </div>

      {/* Filter Pills */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {['All', ...OUTSOURCE_TYPES].map(t => {
          const isActive = (!serviceFilter && t === 'All') || serviceFilter === (TYPE_TO_SERVICE_MAP[t] || '')
          return (
            <button key={t} onClick={() => setServiceFilter(t === 'All' ? '' : (TYPE_TO_SERVICE_MAP[t] || t))}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{ background: isActive ? C.navy : C.cream, color: isActive ? '#fff' : C.textMuted }}>{t}</button>
          )
        })}
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input value={vendorFilter} onChange={e => setVendorFilter(e.target.value)} placeholder="Search by name or ID…" style={{ maxWidth: 320 }} />
      </div>

      {/* Vendor Cards */}
      <div className="space-y-2">
        {filteredVendors.map(v => {
          const s = vendorStats[v.id] || {}
          return (
            <div key={v.id} onClick={() => { setSelectedVendor(v); setSubTab('ledger') }}
              className="rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md" style={{ background: C.cardBg, border: `1px solid ${C.borderLight}` }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: C.goldLight, color: C.gold }}>{v.name.charAt(0)}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: C.text }}>{v.name}</span>
                      {v.type && <Badge color={C.goldDark} bg={C.goldLight}>{v.type}</Badge>}
                      {v.tds_enabled && <Badge color={C.amber} bg={C.amberBg}>TDS</Badge>}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: C.textLight }}>{v.id}{v.contact ? ` · ${v.contact}` : ''}{v.location ? ` · ${v.location}` : ''}</div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <div className="text-lg font-extrabold" style={{ color: s.outstanding > 0 ? C.red : s.outstanding < 0 ? C.green : C.textMuted, fontFamily: 'Manrope' }}>{fmtCurrency(s.outstanding)}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: C.textLight }}>{s.entries || 0} bills · {s.payments || 0} payments</div>
                </div>
              </div>
            </div>
          )
        })}
        {filteredVendors.length === 0 && (
          <div className="text-center py-16">
            <div className="text-3xl mb-3" style={{ color: C.textLight }}>🏭</div>
            <div className="text-sm font-medium" style={{ color: C.textMuted }}>No vendors found</div>
            <div className="text-xs mt-1" style={{ color: C.textLight }}>Add your first outsource vendor to get started.</div>
          </div>
        )}
      </div>

      {showAddVendor && <VendorFormModal vendor={editVendor} onSave={handleSaveVendor} onClose={() => { setShowAddVendor(false); setEditVendor(null) }} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── VENDOR PRICING TAB ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const VendorPricingTab = ({ vendor, stitchingMasterProp }) => {
  const [prices, setPrices] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)

  const vendorType = vendor.type || ''
  const pricingType = vendorType === 'Dyeing' ? 'dyeing' : vendorType === 'Tailoring' ? 'stitching' : (vendorType.includes('Embroidery') || vendorType === 'Hand Painting') ? 'embroidery' : vendorType === 'Accessories' ? 'accessories' : 'custom'

  const loadPricing = useCallback(async () => {
    setLoading(true)
    try {
      const { data: prData } = await supa.from('vendor_pricing').select('*').eq('vendor_id', vendor.id).order('created_at')
      if (prData) setPrices(prData)
      if (pricingType === 'embroidery') {
        // Query shopify_products directly for just the fields we need — NOT the 5MB+ hl_products blob from app_state
        const { data: spData } = await supa.from('shopify_products')
          .select('id, style_code, title, images')
          .order('title')
          .limit(2000)
        if (spData) {
          setProducts(spData.map(p => ({
            id: p.id, styleCode: p.style_code || '', productTitle: p.title || '',
            shopify_images: Array.isArray(p.images) ? p.images.map(img => typeof img === 'string' ? img : img?.src).filter(Boolean) : []
          })))
        }
      }
    } catch (e) { console.error('loadPricing error:', e) }
    setLoading(false)
  }, [vendor.id, pricingType])

  useEffect(() => { loadPricing() }, [loadPricing])

  const handleSave = async (form) => {
    try {
      const payload = {
        vendor_id: vendor.id, pricing_type: form.pricing_type || pricingType,
        per_metre_rate: n(form.per_metre_rate), category: form.category || '',
        per_piece_rate: n(form.per_piece_rate), style_code: form.style_code || '',
        product_id: form.product_id || '', product_title: form.product_title || '',
        product_image: form.product_image || '', custom_image: form.custom_image || '',
        description: form.description || '', notes: form.notes || '',
        updated_at: new Date().toISOString()
      }
      if (form.id) {
        await supa.from('vendor_pricing').update(payload).eq('id', form.id)
      } else {
        await supa.from('vendor_pricing').insert(payload)
      }
      setShowAdd(false); setEditItem(null); await loadPricing()
    } catch (e) { alert('Error: ' + e.message) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this pricing entry?')) return
    await supa.from('vendor_pricing').delete().eq('id', id); await loadPricing()
  }

  const handleImageUpload = async (file) => {
    return await uploadImage(file, 'vendor-pricing')
  }

  if (loading) return <div className="text-center py-10 text-sm" style={{ color: C.textMuted }}>Loading pricing…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold" style={{ color: C.text }}>
            {pricingType === 'dyeing' ? 'Per Metre Pricing' : pricingType === 'stitching' ? 'Per Garment Pricing' : pricingType === 'accessories' ? 'Accessory Pricing' : 'Per Piece / Style Code Pricing'}
          </h3>
          <div className="text-xs mt-0.5" style={{ color: C.textLight }}>
            {pricingType === 'dyeing' ? 'Set vendor-specific dyeing rates per metre' : pricingType === 'stitching' ? 'Set rates per garment category (Kurta, Shirt, etc.)' : pricingType === 'accessories' ? 'Set rates per accessory type (Shoes, Pagdi, etc.)' : 'Set rates per design/style code or custom work'}
          </div>
        </div>
        <button onClick={() => { setEditItem(null); setShowAdd(true) }} className="text-xs px-3 py-1.5 rounded-xl font-semibold text-white" style={{ background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})` }}>+ Add Rate</button>
      </div>

      {/* Pricing Cards */}
      {prices.length === 0 ? (
        <div className="text-center py-12 rounded-2xl" style={{ background: C.cream, border: `1px dashed ${C.border}` }}>
          <div className="text-2xl mb-2">💰</div>
          <div className="text-sm font-medium" style={{ color: C.textMuted }}>No pricing set yet</div>
          <div className="text-xs mt-1" style={{ color: C.textLight }}>Add rate cards for this vendor's services</div>
        </div>
      ) : (
        <div className="space-y-2">
          {prices.map(p => (
            <div key={p.id} className="rounded-xl p-4 flex items-center justify-between" style={{ background: C.cardBg, border: `1px solid ${C.borderLight}` }}>
              <div className="flex items-center gap-3">
                {(p.product_image || p.custom_image) ? (
                  <img src={p.product_image || p.custom_image} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: C.cream }}>
                    <span className="text-sm" style={{ color: C.textLight }}>{pricingType === 'dyeing' ? '🎨' : pricingType === 'stitching' ? '🧵' : pricingType === 'accessories' ? '👟' : '✂️'}</span>
                  </div>
                )}
                <div>
                  <div className="font-semibold text-sm" style={{ color: C.text }}>
                    {p.category || p.style_code || p.product_title || p.description || 'General Rate'}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: C.textLight }}>
                    {p.pricing_type === 'dyeing' ? 'Per metre' : p.pricing_type === 'stitching' ? p.category : p.pricing_type === 'accessories' ? (p.category || 'Accessory') : p.style_code ? `Style: ${p.style_code}` : 'Custom'}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-base font-bold" style={{ color: C.goldDark }}>
                    {p.pricing_type === 'dyeing' ? fmtCurrency(p.per_metre_rate) : fmtCurrency(p.per_piece_rate)}
                  </div>
                  <div className="text-[10px]" style={{ color: C.textLight }}>{p.pricing_type === 'dyeing' ? '/metre' : '/piece'}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditItem(p); setShowAdd(true) }} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" style={{ color: C.textMuted }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" style={{ color: C.textLight }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <PricingFormModal item={editItem} pricingType={pricingType} products={products} vendor={vendor}
          existingPrices={prices} stitchingMasterProp={stitchingMasterProp}
          onSave={handleSave} onUpload={handleImageUpload} onClose={() => { setShowAdd(false); setEditItem(null) }} />
      )}
    </div>
  )
}

// ─── Pricing Form Modal ──────────────────────────────────────────────────────
const PricingFormModal = ({ item, pricingType, products, vendor, existingPrices, stitchingMasterProp, onSave, onUpload, onClose }) => {
  const [form, setForm] = useState({
    id: item?.id || '', pricing_type: item?.pricing_type || pricingType,
    per_metre_rate: item?.per_metre_rate || '', per_piece_rate: item?.per_piece_rate || '',
    category: item?.category || '', style_code: item?.style_code || '',
    product_id: item?.product_id || '', product_title: item?.product_title || '',
    product_image: item?.product_image || '', custom_image: item?.custom_image || '',
    description: item?.description || '', notes: item?.notes || ''
  })

  // Stitching cost master entries (from Supabase via prop, with a local fallback for older sessions)
  const stitchingTypes = useMemo(() => {
    var src = Array.isArray(stitchingMasterProp) ? stitchingMasterProp : []
    return src
      .map(s => ({ id: s.id, name: (s.garmentType || s.category || '').toString().trim(), cost: Number(s.cost) || 0 }))
      .filter(s => s.name)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [stitchingMasterProp])

  // When user picks a stitching type on this vendor's rate card, look up this
  // vendor's existing rate (if any) to auto-fill the rate input. Else fall back
  // to the master reference as a PLACEHOLDER only (not an actual value).
  const onStitchingTypeChange = (typeName) => {
    setForm(f => ({ ...f, category: typeName }))
    if (!typeName) { setForm(f => ({ ...f, category: '', per_piece_rate: '', id: f.id || '' })); return }
    // Look for vendor's own existing rate row for this stitching type
    var existing = (existingPrices || []).find(p =>
      p.pricing_type === 'stitching' &&
      (p.category || '').trim().toLowerCase() === typeName.trim().toLowerCase()
    )
    if (existing) {
      // Auto-fill + switch to update mode (upsert)
      setForm(f => ({
        ...f,
        category: existing.category,
        per_piece_rate: existing.per_piece_rate != null ? String(existing.per_piece_rate) : '',
        notes: existing.notes || f.notes || '',
        id: existing.id
      }))
    } else {
      // No vendor rate yet — clear the rate input so the placeholder (master ref) shows
      setForm(f => ({ ...f, category: typeName, per_piece_rate: '', id: item?.id || '' }))
    }
  }

  // Master reference for the currently-selected stitching type (for the placeholder hint)
  const selectedMasterRef = useMemo(() => {
    var match = stitchingTypes.find(s => s.name.toLowerCase() === (form.category || '').toLowerCase())
    return match ? match.cost : 0
  }, [form.category, stitchingTypes])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const filteredProducts = useMemo(() => {
    if (!productSearch || productSearch.length < 2) return []
    const q = productSearch.toLowerCase()
    return (products || []).filter(p => (p.styleCode || '').toLowerCase().includes(q) || (p.productTitle || '').toLowerCase().includes(q)).slice(0, 8)
  }, [products, productSearch])

  const selectProduct = (p) => {
    fld('style_code', p.styleCode || '')
    fld('product_id', p.id || '')
    fld('product_title', p.productTitle || p.productName || '')
    fld('product_image', p.image_url || (p.shopify_images && p.shopify_images[0]) || '')
    setProductSearch('')
  }

  const handleCustomImage = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try { const url = await onUpload(file); fld('custom_image', url) } catch { alert('Upload failed') }
    setUploading(false)
  }

  const handleSubmit = async () => {
    if (pricingType === 'dyeing' && !n(form.per_metre_rate)) return alert('Enter per metre rate')
    if (pricingType === 'stitching' && (!form.category || !n(form.per_piece_rate))) return alert('Select category and enter rate')
    if (pricingType === 'embroidery' && !n(form.per_piece_rate)) return alert('Enter per piece rate')
    if (pricingType === 'accessories' && (!form.category || !n(form.per_piece_rate))) return alert('Enter accessory type and rate')
    setSaving(true); await onSave(form); setSaving(false)
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4" style={{ color: C.text, fontFamily: 'Manrope' }}>{item ? 'Edit Rate' : 'Add Rate'}</h3>
        <div className="space-y-3">
          {pricingType === 'dyeing' && (
            <>
              <Field label="Description"><Input value={form.description} onChange={e => fld('description', e.target.value)} placeholder="e.g. Single dye, Double dye, Ombre" /></Field>
              <Field label="Rate per Metre (₹) *"><Input type="number" value={form.per_metre_rate} onChange={e => fld('per_metre_rate', e.target.value)} placeholder="e.g. 80" /></Field>
            </>
          )}
          {pricingType === 'stitching' && (
            <>
              <Field label="Stitching Type *">
                {stitchingTypes.length === 0 ? (
                  <div className="text-xs px-3 py-3 rounded-xl" style={{ background: C.cream, border: `1px dashed ${C.border}`, color: C.textMuted }}>
                    No stitching types found. Go to <strong>Masters → Stitching</strong> and add types first (e.g. Plain Kurta, Heavy Sherwani).
                  </div>
                ) : (
                  <select value={form.category} onChange={e => onStitchingTypeChange(e.target.value)} className="w-full text-sm px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.border }}>
                    <option value="">Select stitching type…</option>
                    {stitchingTypes.map(s => (
                      <option key={s.id || s.name} value={s.name}>
                        {s.name}{s.cost > 0 ? ' · ref ₹' + s.cost : ''}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Rate per Piece (₹) *">
                <Input
                  type="number"
                  value={form.per_piece_rate}
                  onChange={e => fld('per_piece_rate', e.target.value)}
                  placeholder={selectedMasterRef > 0 ? ('Master ref ₹' + selectedMasterRef) : 'e.g. 400'}
                />
                {form.id && form.category && (
                  <div className="text-[11px] mt-1.5" style={{ color: C.amber }}>
                    ✎ This vendor already has a rate for <strong>{form.category}</strong> — saving will update it.
                  </div>
                )}
                {!form.id && form.category && selectedMasterRef > 0 && (
                  <div className="text-[11px] mt-1.5" style={{ color: C.textLight }}>
                    Master reference rate: <strong>₹{selectedMasterRef}</strong>
                  </div>
                )}
              </Field>
              <Field label="Notes"><Input value={form.notes} onChange={e => fld('notes', e.target.value)} placeholder="e.g. includes finishing" /></Field>
            </>
          )}
          {pricingType === 'accessories' && (
            <>
              <Field label="Accessory Type *"><Input value={form.category} onChange={e => fld('category', e.target.value)} placeholder="e.g. Shoes, Pagdi, Mojdi, Belt" /></Field>
              <Field label="Image">
                <input type="file" accept="image/*" onChange={handleCustomImage} className="text-xs" disabled={uploading} />
                {uploading && <div className="text-[10px] text-amber-600 mt-1">Uploading…</div>}
                {(form.custom_image || form.product_image) && <img src={form.custom_image || form.product_image} className="w-16 h-16 mt-2 rounded-lg object-cover" />}
              </Field>
              <Field label="Rate per Piece (₹) *"><Input type="number" value={form.per_piece_rate} onChange={e => fld('per_piece_rate', e.target.value)} placeholder="e.g. 500" /></Field>
              <Field label="Description"><Input value={form.description} onChange={e => fld('description', e.target.value)} placeholder="e.g. Handmade kolhapuri" /></Field>
              <Field label="Notes"><Input value={form.notes} onChange={e => fld('notes', e.target.value)} placeholder="Optional notes" /></Field>
            </>
          )}
          {(pricingType === 'embroidery' || pricingType === 'custom') && (
            <>
              <Field label="Search Design from Catalogue">
                <div className="relative">
                  <Input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Type style code or product name…" />
                  {filteredProducts.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-xl shadow-lg overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                      {filteredProducts.map(p => (
                        <button key={p.id} onClick={() => selectProduct(p)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors">
                          {(p.image_url || (p.shopify_images && p.shopify_images[0])) ? (
                            <img src={p.image_url || p.shopify_images[0]} className="w-8 h-8 rounded-lg object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-[10px] text-gray-400">IMG</div>
                          )}
                          <div>
                            <div className="text-xs font-semibold" style={{ color: C.text }}>{p.styleCode}</div>
                            <div className="text-[10px]" style={{ color: C.textMuted }}>{p.productTitle || p.productName}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
              {form.style_code && (
                <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: C.cream }}>
                  {form.product_image ? <img src={form.product_image} className="w-12 h-12 rounded-lg object-cover" /> : null}
                  <div>
                    <div className="text-sm font-semibold" style={{ color: C.text }}>{form.style_code}</div>
                    <div className="text-xs" style={{ color: C.textMuted }}>{form.product_title}</div>
                  </div>
                  <button onClick={() => { fld('style_code', ''); fld('product_id', ''); fld('product_title', ''); fld('product_image', '') }} className="ml-auto text-xs" style={{ color: C.red }}>✕</button>
                </div>
              )}
              {!form.style_code && <div className="text-center text-xs py-2" style={{ color: C.textLight }}>— or upload custom design image —</div>}
              <Field label="Custom Image">
                <input type="file" accept="image/*" onChange={handleCustomImage} className="text-xs" disabled={uploading} />
                {uploading && <div className="text-[10px] text-amber-600 mt-1">Uploading…</div>}
                {form.custom_image && <img src={form.custom_image} className="w-16 h-16 mt-2 rounded-lg object-cover" />}
              </Field>
              <Field label="Description"><Input value={form.description} onChange={e => fld('description', e.target.value)} placeholder="e.g. Thread work on yoke, Aari work full front" /></Field>
              <Field label="Rate per Piece (₹) *"><Input type="number" value={form.per_piece_rate} onChange={e => fld('per_piece_rate', e.target.value)} placeholder="e.g. 1200" /></Field>
              <Field label="Notes"><Input value={form.notes} onChange={e => fld('notes', e.target.value)} placeholder="Optional notes" /></Field>
            </>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 text-sm py-2.5 rounded-xl border font-medium" style={{ borderColor: C.border, color: C.textMuted }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 text-sm py-2.5 rounded-xl text-white font-semibold" style={{ background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})`, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : (item ? 'Update' : 'Add Rate')}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── LEDGER TIMELINE ─────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const LedgerTimeline = ({ entries, payments, vendor, closings = [], latestClose, onViewReceipt, onViewBill, onEditBill, onDeleteEntry, onDeletePayment, onDeleteClosing, onSettleToggle }) => {
  const closeDateCutoff = latestClose ? latestClose.close_date : null
  const timeline = useMemo(() => {
    const items = []
    entries.forEach(e => items.push({ ...e, _type: 'entry', _date: e.date }))
    payments.forEach(p => items.push({ ...p, _type: 'payment', _date: p.date }))
    // Inject closing dividers
    closings.forEach(c => items.push({ ...c, _type: 'closing', _date: c.close_date }))
    // Sort descending by date; closings sit between entries/payments of the same date (sort closings first at same date)
    items.sort((a, b) => {
      const cmp = b._date.localeCompare(a._date)
      if (cmp !== 0) return cmp
      // At same date: closings come after payments (lower in the list when desc sorted = earlier visually)
      const order = { closing: 0, payment: 1, entry: 2 }
      return (order[a._type] ?? 1) - (order[b._type] ?? 1)
    })
    return items
  }, [entries, payments, closings])

  if (timeline.length === 0) return (
    <div className="text-center py-16 rounded-2xl" style={{ background: C.cream, border: `1px dashed ${C.border}` }}>
      <div className="text-3xl mb-3">📋</div>
      <div className="text-sm font-medium" style={{ color: C.textMuted }}>No transactions yet</div>
      <div className="text-xs mt-1" style={{ color: C.textLight }}>Create a bill or make a payment to get started.</div>
    </div>
  )

  return (
    <div className="space-y-2">
      {timeline.map(item => {
        if (item._type === 'entry') {
          const lineItems = item.line_items || []
          const lineCount = lineItems.length
          const isLocked = closeDateCutoff && item.date <= closeDateCutoff
          return (
            <div key={item.id} className="rounded-xl p-3.5 transition-all hover:shadow-sm cursor-pointer" onClick={() => onViewBill(item)}
              style={{ background: C.cardBg, border: `1px solid ${C.borderLight}`, borderLeftWidth: 3, borderLeftColor: STATUS_COLORS[item.status] || C.border, opacity: isLocked ? 0.7 : 1 }}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isLocked && <span title="Locked — in closed statement period" style={{ color: C.textLight, fontSize: 12 }}>🔒</span>}
                    <span className="text-sm font-bold" style={{ color: C.text }}>{item.bill_number || 'BILL'}</span>
                    <Badge color={STATUS_COLORS[item.status]} bg={`${STATUS_COLORS[item.status]}15`}>{item.status?.replace('_', ' ')}</Badge>
                    {n(item.balance_due) <= 0 && n(item.total_cost) > 0 && <Badge color={C.green} bg={C.greenBg}>paid</Badge>}
                    {n(item.amount_paid) > 0 && n(item.balance_due) > 0 && <Badge color={C.amber} bg={C.amberBg}>partial</Badge>}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: C.textLight }}>
                    {fmtDate(item.date)} · {SERVICE_MAP[item.service] || item.service}
                    {item.order_number ? ` · Order ${item.order_number}` : ''}
                    {lineCount > 0 ? ` · ${lineCount} item${lineCount > 1 ? 's' : ''}` : ''}
                  </div>
                  {/* Show first 2 line items as preview */}
                  {lineCount > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {lineItems.slice(0, 2).map((li, i) => (
                        <div key={i} className="text-[11px] flex items-center gap-2" style={{ color: C.textMuted }}>
                          {li.order_number && <span className="font-mono text-[10px]" style={{ color: C.gold }}>{li.order_number}</span>}
                          <span className="font-medium" style={{ color: C.text }}>{li.order_product_title || li.category || li.description || 'Item'}</span>
                          {li.size && <span className="text-[9px] px-1 rounded font-bold" style={{ background: C.goldLight, color: C.goldDark }}>{li.size}</span>}
                          <span>×{li.qty}</span>
                          <span>@{fmtCurrency(li.rate)}</span>
                          <span className="font-semibold" style={{ color: C.goldDark }}>{fmtCurrency(n(li.qty) * n(li.rate))}</span>
                        </div>
                      ))}
                      {lineCount > 2 && <div className="text-[10px]" style={{ color: C.textLight }}>+{lineCount - 2} more items…</div>}
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <div className="text-sm font-bold" style={{ color: C.red }}>+{fmtCurrency(item.total_cost)}</div>
                  <div className="flex items-center gap-1.5 mt-1 justify-end">
                    <button onClick={e => { e.stopPropagation(); onViewBill(item) }} className="text-[10px] font-medium underline" style={{ color: C.gold }}>View</button>
                    {onEditBill && !isLocked && <button onClick={e => { e.stopPropagation(); onEditBill(item) }} className="p-1 rounded-md hover:bg-white/60 transition-colors" title="Edit Bill" style={{ color: C.textMuted }}>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>}
                    {onDeleteEntry && !isLocked && <button onClick={e => { e.stopPropagation(); onDeleteEntry(item) }} className="p-1 rounded-md hover:bg-red-50 transition-colors" title="Delete Bill" style={{ color: C.textLight }}>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>}
                  </div>
                </div>
              </div>
              {/* Audit stamp on bill card */}
              {(item.created_by_name || item.updated_by_name) && (
                <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.borderLight}` }} onClick={e => e.stopPropagation()}>
                  <AuditStamp
                    createdBy={{ name: item.created_by_name || 'System', role: item.created_by_role, date: item.created_at }}
                    updatedBy={item.updated_by_name ? { name: item.updated_by_name, role: item.updated_by_role, date: item.updated_at } : null}
                    entityType="outsource_bill"
                    entityId={item.bill_number || item.id}
                    compact={true}
                  />
                </div>
              )}
            </div>
          )
        }
        // ─── Closing Divider ───
        if (item._type === 'closing') {
          const isLatestClosing = latestClose && item.id === latestClose.id
          return (
            <div key={item.id} className="my-3 relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full" style={{ borderTop: `2px solid ${C.gold}` }} /></div>
              <div className="relative flex justify-center">
                <div className="px-4 py-1.5 rounded-full text-[11px] font-bold tracking-wide flex items-center gap-2" style={{ background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})`, color: '#fff' }}>
                  STATEMENT CLOSED · {fmtDate(item.close_date)}
                  {isLatestClosing && onDeleteClosing && (
                    <button onClick={e => { e.stopPropagation(); onDeleteClosing(item) }} className="ml-1 opacity-70 hover:opacity-100 transition-opacity" title="Reopen this statement period">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                    </button>
                  )}
                </div>
              </div>
              <div className="flex justify-center mt-1.5">
                <div className="text-[10px] px-3 py-1 rounded-lg" style={{ background: C.cream, color: C.textMuted }}>
                  Carry forward: {fmtCurrency(item.carry_forward)}{item.notes ? ` · ${item.notes}` : ''}
                </div>
              </div>
            </div>
          )
        }
        const isTds = item.is_tds_payment
        const isPayLocked = closeDateCutoff && item.date <= closeDateCutoff
        return (
          <div key={item.id} className="rounded-xl p-3.5 border-l-[3px] transition-all hover:shadow-sm" style={{ background: isTds ? C.purpleBg : C.greenBg, borderLeftColor: isTds ? C.purple : C.green, border: `1px solid ${isTds ? 'rgba(124,58,237,0.12)' : 'rgba(22,163,74,0.12)'}`, borderLeftWidth: 3, opacity: isPayLocked ? 0.7 : 1 }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold flex items-center gap-1.5" style={{ color: isTds ? C.purple : '#166534' }}>
                  {isPayLocked && <span title="Locked — in closed statement period" style={{ fontSize: 12 }}>🔒</span>}
                  {isTds ? 'TDS Payment (Govt)' : 'Payment'}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: C.textLight }}>{fmtDate(item.date)} · {METHOD_LABEL[item.method] || item.method}{item.reference ? ` · ${item.reference}` : ''}</div>
                {item.tds_amount > 0 && !isTds && <div className="text-[10px] mt-1" style={{ color: C.amber }}>TDS deducted: {fmtCurrency(item.tds_amount)}</div>}
                {/* Settle status (read-only — settle via Bank Statement) */}
                <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: item.settled ? 'rgba(22,163,74,0.12)' : 'rgba(156,163,175,0.12)', color: item.settled ? '#16a34a' : '#9ca3af', border: `1px solid ${item.settled ? 'rgba(22,163,74,0.2)' : 'rgba(156,163,175,0.2)'}` }}>
                  {item.settled ? '✓ Settled' : 'Unsettled — settle via Bank Statement'}
                </span>
              </div>
              <div className="text-right flex-shrink-0 ml-3">
                <div className="text-sm font-bold" style={{ color: isTds ? C.purple : C.green }}>−{fmtCurrency(item.amount)}</div>
                <div className="flex items-center gap-1.5 mt-1 justify-end">
                  <button onClick={e => { e.stopPropagation(); onViewReceipt(item) }} className="text-[10px] font-medium underline" style={{ color: C.gold }}>Receipt</button>
                  {onDeletePayment && !isPayLocked && <button onClick={e => { e.stopPropagation(); onDeletePayment(item) }} className="p-1 rounded-md hover:bg-red-50 transition-colors" title="Delete Payment" style={{ color: C.textLight }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>}
                </div>
              </div>
            </div>
            {/* Audit stamp on payment card */}
            {(item.created_by_name || item.updated_by_name) && (
              <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${isTds ? 'rgba(124,58,237,0.08)' : 'rgba(22,163,74,0.08)'}` }}>
                <AuditStamp
                  createdBy={{ name: item.created_by_name || 'System', role: item.created_by_role, date: item.created_at }}
                  updatedBy={item.updated_by_name ? { name: item.updated_by_name, role: item.updated_by_role, date: item.updated_at } : null}
                  entityType="outsource_payment"
                  entityId={item.id}
                  compact={true}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── BILLS TABLE (Work Entries) ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const WorkEntriesTable = ({ entries, latestClose, onEdit, onDelete, onViewBill }) => {
  const closeDateCutoff = latestClose ? latestClose.close_date : null
  if (entries.length === 0) return (
    <div className="text-center py-16 rounded-2xl" style={{ background: C.cream, border: `1px dashed ${C.border}` }}>
      <div className="text-3xl mb-3">📄</div>
      <div className="text-sm font-medium" style={{ color: C.textMuted }}>No bills yet</div>
    </div>
  )
  return (
    <div className="space-y-2">
      {entries.map(e => {
        const lineItems = e.line_items || []
        const isLocked = closeDateCutoff && e.date <= closeDateCutoff
        return (
          <div key={e.id} className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.borderLight}`, background: C.cardBg, opacity: isLocked ? 0.7 : 1 }}>
            {/* Bill header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ background: C.cream }}>
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {isLocked && <span title="Locked — in closed statement period" style={{ fontSize: 12 }}>🔒</span>}
                    <span className="text-sm font-bold font-mono" style={{ color: C.goldDark }}>{e.bill_number || '—'}</span>
                    <Badge color={STATUS_COLORS[e.status]} bg={`${STATUS_COLORS[e.status]}15`}>{e.status?.replace('_', ' ')}</Badge>
                    {n(e.balance_due) <= 0 && n(e.total_cost) > 0 && <Badge color={C.green} bg={C.greenBg}>Paid</Badge>}
                    {n(e.amount_paid) > 0 && n(e.balance_due) > 0 && <Badge color={C.amber} bg={C.amberBg}>Partial</Badge>}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: C.textLight }}>
                    {fmtDate(e.date)} · {SERVICE_MAP[e.service] || e.service}
                    {e.order_number ? ` · Order ${e.order_number}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-base font-extrabold" style={{ color: C.text, fontFamily: 'Manrope' }}>{fmtCurrency(e.total_cost)}</div>
                  <div className="text-[10px]" style={{ color: C.textLight }}>{lineItems.length} item{lineItems.length !== 1 ? 's' : ''}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => onViewBill(e)} className="p-1.5 rounded-lg hover:bg-white transition-colors" title="View Bill" style={{ color: C.gold }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  </button>
                  {!isLocked && <button onClick={() => onEdit(e)} className="p-1.5 rounded-lg hover:bg-white transition-colors" style={{ color: C.textMuted }}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>}
                  {!isLocked && n(e.amount_paid) <= 0 && (
                    <button onClick={() => onDelete(e)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" style={{ color: C.textLight }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
            {/* Line items preview */}
            {lineItems.length > 0 && (
              <div className="px-4 py-2">
                {lineItems.map((li, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 text-xs" style={{ borderTop: i > 0 ? `1px solid ${C.borderLight}` : 'none' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: C.goldLight, color: C.goldDark }}>{i + 1}</span>
                      {li.order_number && <span className="text-[10px] font-mono" style={{ color: C.gold }}>{li.order_number}</span>}
                      <span className="font-semibold truncate" style={{ color: C.text }}>{li.order_product_title || li.category || li.description || 'Item'}</span>
                      {li.size && <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: C.goldLight, color: C.goldDark }}>{li.size}</span>}
                      {li.comment && <span className="text-[10px] truncate max-w-[120px]" style={{ color: C.textLight }}>— {li.comment}</span>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                      <span style={{ color: C.textMuted }}>{li.qty} × {fmtCurrency(li.rate)}</span>
                      <span className="font-bold min-w-[60px] text-right" style={{ color: C.text }}>{fmtCurrency(n(li.qty) * n(li.rate))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MODALS ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Work Entry / Bill Modal (Multi-line items) ─────────────────────────────
const WorkEntryModal = ({ entry, vendor, orders, vendorPricing, catalogueProducts, catalogueCostMap, fabricsList, coloursList, stitchingMasterProp, onSave, onClose }) => {
  const today = new Date().toISOString().slice(0, 10)
  const isEdit = !!entry
  const isSettled = entry ? n(entry.amount_paid) > 0 : false

  const defaultLineItem = { category: '', qty: '1', rate: '', comment: '', style_code: '', product_image: '', fabric_id: '', fabric_name: '', dye_code: '', colour_name: '', dye_type: '', accessory_type: '' }
  const [form, setForm] = useState({
    id: entry?.id || '',
    date: entry?.date || today,
    service: entry?.service || (vendor.services?.[0] || ''),
    description: entry?.description || '',
    status: entry?.status || 'pending',
    order_id: entry?.order_id || '',
    order_number: entry?.order_number || '',
    line_items: (entry?.line_items && entry.line_items.length > 0) ? entry.line_items.map(li => {
      // Hydrate _order_line_items from orders array if line has an order_id
      if (li.order_id && orders?.length) {
        const ord = orders.find(o => o.id === li.order_id)
        if (ord) return { ...li, _order_line_items: ord.line_items || [] }
      }
      return li
    }) : [{ ...defaultLineItem }],
    edit_note: ''
  })
  const [saving, setSaving] = useState(false)
  // Stitching cost master — comes from Supabase via prop (App.jsx).
  const stitchingMaster = useMemo(() => {
    if (Array.isArray(stitchingMasterProp) && stitchingMasterProp.length > 0) return stitchingMasterProp
    return []
  }, [stitchingMasterProp])
  const [orderSearch, setOrderSearch] = useState('')
  const [productSearches, setProductSearches] = useState({}) // per-line-item search state { idx: 'query' }
  const [activeSearchIdx, setActiveSearchIdx] = useState(null)
  const [fabricSearches, setFabricSearches] = useState({}) // per-line fabric search { idx: 'query' }
  const [activeFabricIdx, setActiveFabricIdx] = useState(null)
  // Inline "Add Rate Card" state
  const [addRateCardIdx, setAddRateCardIdx] = useState(null) // which line item index is adding a rate card
  const [newRcStyleCode, setNewRcStyleCode] = useState('')
  const [newRcTitle, setNewRcTitle] = useState('')
  const [newRcRate, setNewRcRate] = useState('')
  const [newRcSaving, setNewRcSaving] = useState(false)
  const [localRateCard, setLocalRateCard] = useState(null) // local override after inline add
  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Vendor service type for rate lookup
  const vendorType = vendor.type || ''
  const pricingType = vendorType === 'Dyeing' ? 'dyeing' : vendorType === 'Tailoring' ? 'stitching' : (vendorType.includes('Embroidery') || vendorType === 'Hand Painting') ? 'embroidery' : vendorType === 'Accessories' ? 'accessories' : 'embroidery'
  const isEmbroideryType = pricingType === 'embroidery'
  const isDyeingType = pricingType === 'dyeing'
  const isStitchingType = pricingType === 'stitching'
  const isAccessoriesType = pricingType === 'accessories'

  // Dye type options from rate card (e.g. "Single Dye", "Double Dye", "Ombre")
  const dyeTypeOptions = useMemo(() => {
    if (!isDyeingType || !vendorPricing?.length) return []
    return vendorPricing.filter(vp => vp.pricing_type === 'dyeing').map(vp => ({
      label: vp.description || vp.category || 'Dye',
      rate: n(vp.per_metre_rate)
    }))
  }, [isDyeingType, vendorPricing])

  // Ratecard lookup helper
  const getRateForCategory = (category, styleCode) => {
    if (!category && !styleCode) return ''
    // 1. Check vendor rate card first
    if (vendorPricing?.length) {
      const match = vendorPricing.find(vp => {
        if (pricingType === 'stitching') return vp.category === category
        if (pricingType === 'dyeing') return vp.description === category || vp.category === category
        // Embroidery: match by style_code or product_title
        return (styleCode && vp.style_code === styleCode) || vp.product_title === category || vp.description === category
      })
      if (match) return pricingType === 'dyeing' ? match.per_metre_rate : match.per_piece_rate
    }
    // 2. Fallback for embroidery: catalogue embroidery cost
    if (isEmbroideryType && styleCode && catalogueCostMap && catalogueCostMap[styleCode]) {
      return catalogueCostMap[styleCode]
    }
    return ''
  }

  // Order search
  const filteredOrders = useMemo(() => {
    if (!orderSearch || orderSearch.length < 2) return []
    const q = orderSearch.toLowerCase()
    return (orders || []).filter(o =>
      (o.order_number || '').toLowerCase().includes(q) ||
      (o.customer_name || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [orders, orderSearch])

  const selectOrder = (o) => {
    fld('order_id', o.id)
    fld('order_number', o.order_number)
    setOrderSearch('')
  }

  // Product search for embroidery line items
  const getFilteredProducts = (query) => {
    if (!query || query.length < 2 || !catalogueProducts?.length) return []
    const q = query.toLowerCase()
    return catalogueProducts.filter(p =>
      (p.styleCode || '').toLowerCase().includes(q) || (p.productTitle || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }

  const selectProductForLine = (idx, product) => {
    const items = [...form.line_items]
    items[idx] = {
      ...items[idx],
      category: product.productTitle || product.styleCode,
      style_code: product.styleCode || '',
      product_image: product.image || '',
      qty: items[idx].qty || '1' // default qty 1 for embroidery
    }
    // Prefill rate: vendor rate card → catalogue embroidery cost
    const rate = getRateForCategory(product.productTitle, product.styleCode)
    if (rate) items[idx].rate = rate
    fld('line_items', items)
    setProductSearches(prev => ({ ...prev, [idx]: '' }))
    setActiveSearchIdx(null)
  }

  // Fabric search for dyeing line items
  const getFilteredFabrics = (query) => {
    if (!fabricsList?.length) return fabricsList || []
    if (!query || query.length < 1) return fabricsList.slice(0, 12)
    const q = query.toLowerCase()
    return fabricsList.filter(f =>
      (f.id || '').toLowerCase().includes(q) || (f.name || '').toLowerCase().includes(q)
    ).slice(0, 10)
  }

  const selectFabricForLine = (idx, fabric) => {
    const items = [...form.line_items]
    items[idx] = { ...items[idx], fabric_id: fabric.id, fabric_name: fabric.name }
    fld('line_items', items)
    setFabricSearches(prev => ({ ...prev, [idx]: '' }))
    setActiveFabricIdx(null)
  }

  const clearLineFabric = (idx) => {
    const items = [...form.line_items]
    items[idx] = { ...items[idx], fabric_id: '', fabric_name: '' }
    fld('line_items', items)
  }

  // Per-line order search for embroidery
  const [lineOrderSearches, setLineOrderSearches] = useState({})
  const [activeOrderSearchIdx, setActiveOrderSearchIdx] = useState(null)
  const getFilteredOrdersForLine = (query) => {
    if (!query || query.length < 2) return []
    const q = query.toLowerCase()
    return (orders || []).filter(o =>
      (o.order_number || '').toLowerCase().includes(q) ||
      (o.customer_name || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }
  const selectOrderForLine = (idx, order) => {
    const items = [...form.line_items]
    items[idx] = { ...items[idx], order_id: order.id, order_number: order.order_number, customer_name: order.customer_name || '', _order_line_items: order.line_items || [] }
    fld('line_items', items)
    setLineOrderSearches(prev => ({ ...prev, [idx]: '' }))
    setActiveOrderSearchIdx(null)
  }
  // Accept manual order number (typed, not from search)
  const setManualOrderForLine = (idx, value) => {
    setLineOrderSearches(prev => ({ ...prev, [idx]: value }))
    setActiveOrderSearchIdx(idx)
  }
  const commitManualOrder = (idx) => {
    const typed = (lineOrderSearches[idx] || '').trim()
    if (typed && !form.line_items[idx]?.order_number) {
      const items = [...form.line_items]
      items[idx] = { ...items[idx], order_number: typed, order_id: '', customer_name: '', _order_line_items: [] }
      fld('line_items', items)
      setLineOrderSearches(prev => ({ ...prev, [idx]: '' }))
    }
    setTimeout(() => setActiveOrderSearchIdx(null), 200)
  }
  const selectOrderProduct = (idx, product) => {
    const items = [...form.line_items]
    const styleCode = (product.sku || '').replace(/-[A-Z0-9]+$/, '') // HL-KU-37-S → HL-KU-37
    items[idx] = { ...items[idx], order_product_title: product.title, order_product_sku: product.sku || '', order_product_variant: product.variant_title || '' }
    // For embroidery: auto-match rate card from product SKU
    if (isEmbroideryType && styleCode) {
      // Try to find a matching rate card entry for this style code
      const rateMatch = (vendorPricing || []).find(vp => vp.pricing_type === 'embroidery' && vp.style_code === styleCode)
      if (rateMatch) {
        // Rate card found — auto-fill style code + rate
        items[idx].style_code = styleCode
        items[idx].category = product.title
        items[idx].rate = rateMatch.per_piece_rate
        items[idx].product_image = rateMatch.product_image || rateMatch.custom_image || ''
      }
      // No rate card match — leave style_code empty so user picks from dropdown
      // (Custom, existing rate card, or Add New Rate Card)
    } else if (isEmbroideryType && !styleCode) {
      // Custom product with no SKU — leave style_code empty for manual rate card selection
      // User will pick "Custom" or "+ Add Rate Card" from dropdown
    }
    // For stitching: prefill size from variant_title
    if (isStitchingType && product.variant_title) {
      items[idx].size = product.variant_title
    }
    // For accessories: just set product title, user will pick accessory type separately
    fld('line_items', items)
  }
  const clearOrderProduct = (idx) => {
    const items = [...form.line_items]
    items[idx] = { ...items[idx], order_product_title: '', order_product_sku: '', order_product_variant: '' }
    fld('line_items', items)
  }
  const clearLineOrder = (idx) => {
    const items = [...form.line_items]
    items[idx] = { ...items[idx], order_id: '', order_number: '', customer_name: '', _order_line_items: [], order_product_title: '', order_product_sku: '', order_product_variant: '' }
    fld('line_items', items)
  }
  // Get products from a selected order for this line item
  const getOrderProducts = (li) => {
    return (li._order_line_items || []).map(p => ({ title: p.title, sku: p.sku, variant_title: p.variant_title, quantity: p.quantity }))
  }

  // Line item management
  const updateLineItem = (idx, key, value) => {
    const items = [...form.line_items]
    items[idx] = { ...items[idx], [key]: value }
    // Auto-prefill rate when category/dye_type changes
    if (key === 'category' && value && !isEmbroideryType && !isDyeingType) {
      // stitchingOptions already has rates from vendor pricing / master
      const sm = stitchingOptions.find(s => s.label === value)
      if (sm?.cost) {
        items[idx].rate = sm.cost
      } else {
        const rate = getRateForCategory(value, '')
        if (rate) items[idx].rate = rate
      }
    }
    // Accessories: when accessory type selected, prefill rate from rate card
    if (key === 'accessory_type' && value && isAccessoriesType) {
      const match = (vendorPricing || []).find(vp => vp.pricing_type === 'accessories' && vp.category === value)
      if (match) {
        items[idx].rate = match.per_piece_rate
        items[idx].category = value
      }
    }
    // Dyeing: when dye type selected, prefill rate from rate card
    if (key === 'dye_type' && value && isDyeingType) {
      const rate = getRateForCategory(value, '')
      if (rate) items[idx].rate = rate
      items[idx].category = value // set category to dye type for display
    }
    // Dyeing: when fabric selected, set fabric_name
    if (key === 'fabric_id' && value && isDyeingType) {
      const fab = (fabricsList || []).find(f => f.id === value)
      if (fab) items[idx].fabric_name = fab.name
    }
    fld('line_items', items)
  }

  const addLineItem = () => {
    fld('line_items', [...form.line_items, { ...defaultLineItem }])
  }

  const removeLineItem = (idx) => {
    if (form.line_items.length <= 1) return
    fld('line_items', form.line_items.filter((_, i) => i !== idx))
    // Clean up search state
    setProductSearches(prev => { const next = { ...prev }; delete next[idx]; return next })
  }

  const clearLineProduct = (idx) => {
    const items = [...form.line_items]
    items[idx] = { ...items[idx], category: '', style_code: '', product_image: '', rate: '' }
    fld('line_items', items)
  }

  const totalCost = form.line_items.reduce((s, li) => s + (n(li.qty) * n(li.rate)), 0)

  const submit = async () => {
    if (!form.date || !form.service) return alert('Date and service are required')
    if (form.line_items.length === 0 || !form.line_items.some(li => n(li.qty) && n(li.rate))) return alert('Add at least one line item with qty and rate')
    // Validate: every line item must have an order (except dyeing where order is optional)
    const activeLIs = form.line_items.filter(li => n(li.qty) && n(li.rate))
    if (!isDyeingType) {
      const missingOrder = activeLIs.some(li => !li.order_id && !li.order_number)
      if (missingOrder) return alert('Every line item must have an order number (search or type manually)')
    }
    // If order was selected from search and has products, require product selection (not for dyeing)
    if (!isDyeingType) {
      const missingProduct = activeLIs.some(li => li.order_id && li._order_line_items?.length > 0 && !li.order_product_sku && !li.order_product_title)
      if (missingProduct) return alert('Please select a product/piece for each order that has products')
    }
    if (isSettled && !form.edit_note.trim()) return alert('Edit note required for settled entries')
    setSaving(true); await onSave(form); setSaving(false)
  }

  // Categories for dropdown based on vendor type (stitching/dyeing only)
  // Stitching: pull from THIS vendor's pricing list first, then stitching cost master, then fallback
  const stitchingOptions = useMemo(() => {
    // 1. Vendor-specific rate card (best — shows what this vendor charges)
    const vendorRates = (vendorPricing || []).filter(vp => vp.pricing_type === 'stitching' && vp.category)
    if (vendorRates.length > 0) {
      return vendorRates.map(vp => ({ label: vp.category, cost: n(vp.per_piece_rate) }))
    }
    // 2. Stitching cost master (general rates)
    if (stitchingMaster.length > 0) {
      return stitchingMaster.map(s => ({ label: s.garmentType, cost: n(s.cost) }))
    }
    // 3. Hardcoded fallback
    return STITCHING_CATEGORIES_FALLBACK.map(c => ({ label: c, cost: 0 }))
  }, [vendorPricing, stitchingMaster])

  // Accessory options from vendor rate card
  const accessoryOptions = useMemo(() => {
    return (vendorPricing || []).filter(vp => vp.pricing_type === 'accessories' && vp.category)
      .map(vp => ({ label: vp.category, cost: n(vp.per_piece_rate), image: vp.custom_image || vp.product_image || '' }))
  }, [vendorPricing])

  // Embroidery rate card entries for override dropdown
  const embroideryRateCard = useMemo(() => {
    const base = (vendorPricing || []).filter(vp => vp.pricing_type === 'embroidery' && (vp.style_code || vp.product_title))
      .map(vp => ({ styleCode: vp.style_code || '', title: vp.product_title || vp.description || '', rate: n(vp.per_piece_rate), image: vp.product_image || vp.custom_image || '' }))
    // Merge any locally-added rate card entries (added inline during this session)
    if (localRateCard) {
      const exists = base.some(r => r.styleCode === localRateCard.styleCode)
      if (!exists) base.push(localRateCard)
    }
    return base
  }, [vendorPricing, localRateCard])

  // Save a new rate card entry inline from the bill form
  const saveInlineRateCard = async (idx) => {
    if (!newRcStyleCode.trim() || !newRcRate) return
    setNewRcSaving(true)
    try {
      const payload = {
        vendor_id: vendor.id, pricing_type: 'embroidery',
        style_code: newRcStyleCode.trim(), product_title: newRcTitle.trim(),
        per_piece_rate: n(newRcRate), per_metre_rate: 0,
        category: '', product_id: '', product_image: '', custom_image: '',
        description: '', notes: '', updated_at: new Date().toISOString()
      }
      await supa.from('vendor_pricing').insert(payload)
      // Update local state so dropdown reflects the new entry immediately
      const newEntry = { styleCode: newRcStyleCode.trim(), title: newRcTitle.trim(), rate: n(newRcRate), image: '' }
      setLocalRateCard(newEntry)
      // Fill the line item with the new rate card
      const items = [...form.line_items]
      items[idx] = { ...items[idx], style_code: newRcStyleCode.trim(), category: newRcTitle.trim(), rate: n(newRcRate), product_image: '' }
      fld('line_items', items)
      // Reset inline form
      setAddRateCardIdx(null); setNewRcStyleCode(''); setNewRcTitle(''); setNewRcRate('')
    } catch (e) { alert('Error saving rate card: ' + e.message) }
    setNewRcSaving(false)
  }

  const categoryOptions = pricingType === 'stitching' ? stitchingOptions.map(s => s.label) :
    pricingType === 'dyeing' ? ['Per Metre'] : []

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-full sm:max-w-6xl mx-2 sm:mx-4 p-5 sm:p-7 max-h-[92vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-1" style={{ color: C.text, fontFamily: 'Manrope' }}>
          {isEdit ? `Edit Bill ${entry.bill_number || ''}` : 'Create New Bill'}
        </h3>
        <p className="text-sm mb-5" style={{ color: C.textLight }}>
          {isEdit ? 'Update bill details and line items' : 'Bill number will be auto-generated on save'}
        </p>

        {isSettled && <div className="text-xs px-3 py-2 rounded-xl mb-3" style={{ background: C.amberBg, color: C.amber }}>This bill has payments allocated — edit note required.</div>}

        <div className="space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Date *"><Input type="date" value={form.date} onChange={e => fld('date', e.target.value)} /></Field>
            <Field label="Service *">
              <select value={form.service} onChange={e => fld('service', e.target.value)} className="w-full text-sm px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.border }}>
                {(vendor.services || []).map(s => <option key={s} value={s}>{SERVICE_MAP[s] || s}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => fld('status', e.target.value)} className="w-full text-sm px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.border }}>
                {WORK_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </Field>
          </div>

          {/* Order selection — per line item now, hide top-level */}
          {/*
          <Field label="Link to Order (optional)">
            <div className="relative">
              {form.order_number ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: C.cream }}>
                  <span className="text-sm font-semibold font-mono" style={{ color: C.goldDark }}>{form.order_number}</span>
                  <span className="text-xs" style={{ color: C.textMuted }}>{(orders || []).find(o => o.id === form.order_id)?.customer_name || ''}</span>
                  <button onClick={() => { fld('order_id', ''); fld('order_number', '') }} className="ml-auto text-xs" style={{ color: C.red }}>✕</button>
                </div>
              ) : (
                <div>
                  <Input value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="Search order number or customer name…" />
                  {filteredOrders.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                      {filteredOrders.map(o => (
                        <button key={o.id} onClick={() => selectOrder(o)} className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition-colors">
                          <div>
                            <span className="text-xs font-bold font-mono" style={{ color: C.goldDark }}>{o.order_number}</span>
                            <span className="text-xs ml-2" style={{ color: C.textMuted }}>{o.customer_name}</span>
                          </div>
                          <span className="text-[10px]" style={{ color: C.textLight }}>{fmtDate(o.created_at)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Field>
          */}

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Line Items</div>
              <button onClick={addLineItem} className="text-sm font-semibold px-3 py-1 rounded-lg hover:opacity-80" style={{ color: C.green }}>+ Add Item</button>
            </div>

            {/* Column headers (desktop) — layout varies by vendor type */}
            {/* Stitching: # | Order | Product | Size | ★Category | Qty | Rate | Amount | ✕ */}
            {/* Embroidery: # | Order | Product | Style Code | Qty | Rate | Amount | ✕ */}
            {/* Accessories: # | Order | Product | Accessory Type | Qty | Rate | Amount | ✕ */}
            {/* Dyeing: # | Order(opt) | Fabric | Colour | Mtrs | Dye Type | Rate | Amount | ✕ */}
            <div className="hidden sm:grid gap-2 items-center mb-1.5 px-4" style={{
              gridTemplateColumns: isStitchingType
                ? '28px 110px 1fr 65px 1fr 60px 80px 80px 28px'
                : isEmbroideryType
                  ? '28px 110px 1fr 1fr 60px 80px 80px 28px'
                  : isAccessoriesType
                    ? '28px 110px 1fr 1fr 60px 80px 80px 28px'
                    : isDyeingType
                      ? '28px 120px 1fr 110px 70px 120px 85px 90px 28px'
                      : '28px 120px 1fr 70px 90px 90px 28px'
            }}>
              <div />
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>
                {isDyeingType ? 'Order (opt)' : 'Order'}
              </div>
              {isStitchingType && <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Product</div>}
              {isStitchingType && <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Size</div>}
              {(isEmbroideryType || isAccessoriesType) && <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Product</div>}
              <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: isStitchingType ? C.goldDark : C.textMuted }}>
                {isStitchingType ? '★ Stitch Category' : isEmbroideryType ? '★ Style Code' : isAccessoriesType ? '★ Accessory Type' : isDyeingType ? 'Fabric' : 'Category / Item'}
              </div>
              {isDyeingType && <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Colour</div>}
              <div className="text-[11px] font-bold uppercase tracking-wider text-center" style={{ color: C.textMuted }}>
                {isDyeingType ? 'Mtrs' : 'Qty'}
              </div>
              {isDyeingType && <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Dye Type</div>}
              <div className="text-[11px] font-bold uppercase tracking-wider text-right" style={{ color: C.textMuted }}>Rate</div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-right" style={{ color: C.textMuted }}>Amount</div>
              <div />
            </div>

            {/* Line item rows */}
            {form.line_items.map((li, idx) => {
              const lineTotal = n(li.qty) * n(li.rate)
              const searchQuery = productSearches[idx] || ''
              const searchResults = isEmbroideryType && activeSearchIdx === idx ? getFilteredProducts(searchQuery) : []
              const hasProduct = isEmbroideryType && li.style_code

              return (
                <div key={idx} className="rounded-xl px-4 py-3 mb-2" style={{ background: C.cream, border: `1px solid ${C.borderLight}` }}>

                  {/* ═══ DESKTOP — Single-row grid for all vendor types ═══ */}
                  <div className="hidden sm:grid gap-2 items-center" style={{
                    gridTemplateColumns: isStitchingType
                      ? '28px 110px 1fr 65px 1fr 60px 80px 80px 28px'
                      : isEmbroideryType
                        ? '28px 110px 1fr 1fr 60px 80px 80px 28px'
                        : isAccessoriesType
                          ? '28px 110px 1fr 1fr 60px 80px 80px 28px'
                          : isDyeingType
                            ? '28px 120px 1fr 110px 70px 120px 85px 90px 28px'
                            : '28px 120px 1fr 70px 90px 90px 28px'
                  }}>
                    {/* # */}
                    <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold" style={{ background: C.goldLight, color: C.goldDark }}>{idx + 1}</div>

                    {/* Order — shared across all types (search or type manually) */}
                    <div className="relative">
                      {li.order_number ? (
                        <div className="flex items-center gap-1.5 text-xs px-2 py-2 rounded-lg" style={{ background: '#fff', border: `1px solid ${C.borderLight}` }}>
                          <span className="font-bold font-mono truncate" style={{ color: C.goldDark }}>{li.order_number}</span>
                          {li.customer_name && <span className="text-[10px] truncate" style={{ color: C.textLight }}>{li.customer_name}</span>}
                          <button onClick={() => clearLineOrder(idx)} className="text-xs flex-shrink-0 ml-auto" style={{ color: C.red }}>✕</button>
                        </div>
                      ) : (
                        <div className="relative">
                          <input value={lineOrderSearches[idx] || ''} onChange={e => setManualOrderForLine(idx, e.target.value)}
                            onFocus={() => setActiveOrderSearchIdx(idx)} onBlur={() => commitManualOrder(idx)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitManualOrder(idx) } }}
                            className="text-xs px-2 py-2 rounded-lg border outline-none w-full" style={{ borderColor: C.border, background: '#fff' }} placeholder="Order #" />
                          {activeOrderSearchIdx === idx && (() => {
                            const results = getFilteredOrdersForLine(lineOrderSearches[idx] || '')
                            return results.length > 0 ? (
                              <div className="absolute z-20 top-full left-0 mt-1 rounded-lg shadow-lg overflow-hidden max-h-40 overflow-y-auto" style={{ background: '#fff', border: `1px solid ${C.border}`, minWidth: 240 }}>
                                {results.map(o => (
                                  <button key={o.id} onMouseDown={e => e.preventDefault()} onClick={() => selectOrderForLine(idx, o)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50">
                                    <span className="text-xs font-bold font-mono" style={{ color: C.goldDark }}>{o.order_number}</span>
                                    <span className="text-xs truncate" style={{ color: C.textMuted }}>{o.customer_name}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null
                          })()}
                        </div>
                      )}
                    </div>

                    {/* ── Stitching: Product dropdown (from order) ── */}
                    {isStitchingType && (
                      <div className="relative">
                        {li.order_product_title ? (
                          <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs" style={{ background: '#fff', border: `1px solid ${C.borderLight}` }}>
                            <span className="truncate font-medium" style={{ color: C.text }}>{li.order_product_title}</span>
                            <button onClick={() => clearOrderProduct(idx)} className="text-xs flex-shrink-0 ml-auto" style={{ color: C.red }}>✕</button>
                          </div>
                        ) : li.order_number && getOrderProducts(li).length > 0 ? (
                          <select value="" onChange={e => { const p = getOrderProducts(li)[parseInt(e.target.value)]; if (p) selectOrderProduct(idx, p) }}
                            className="text-xs px-2 py-2 rounded-lg border outline-none w-full" style={{ borderColor: C.border, background: '#fff' }}>
                            <option value="">Select product…</option>
                            {getOrderProducts(li).map((p, pi) => <option key={pi} value={pi}>{p.title}{p.variant_title ? ` (${p.variant_title})` : ''}</option>)}
                          </select>
                        ) : (
                          <div className="text-[10px] px-2 py-2 rounded-lg" style={{ color: C.textLight, background: '#fff', border: `1px dashed ${C.border}` }}>Select order first</div>
                        )}
                      </div>
                    )}

                    {/* ── Stitching: Size (prefilled from variant, editable) ── */}
                    {isStitchingType && (
                      <select value={li.size || li.order_product_variant || ''} onChange={e => updateLineItem(idx, 'size', e.target.value)}
                        className="text-xs px-1 py-2 rounded-lg border outline-none w-full font-bold" style={{ borderColor: C.border, background: C.goldLight, color: C.goldDark }}>
                        <option value="">Size</option>
                        {BILL_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}

                    {/* ── Embroidery / Accessories: Product dropdown (from order) ── */}
                    {(isEmbroideryType || isAccessoriesType) && (
                      <div className="relative">
                        {li.order_product_title ? (
                          <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs" style={{ background: '#fff', border: `1px solid ${C.borderLight}` }}>
                            <span className="truncate font-medium" style={{ color: C.text }}>{li.order_product_title}</span>
                            <button onClick={() => clearOrderProduct(idx)} className="text-xs flex-shrink-0 ml-auto" style={{ color: C.red }}>✕</button>
                          </div>
                        ) : li.order_number && getOrderProducts(li).length > 0 ? (
                          <select value="" onChange={e => { const p = getOrderProducts(li)[parseInt(e.target.value)]; if (p) selectOrderProduct(idx, p) }}
                            className="text-xs px-2 py-2 rounded-lg border outline-none w-full" style={{ borderColor: C.border, background: '#fff' }}>
                            <option value="">Select product…</option>
                            {getOrderProducts(li).map((p, pi) => <option key={pi} value={pi}>{p.title}{p.variant_title ? ` (${p.variant_title})` : ''}</option>)}
                          </select>
                        ) : (
                          <div className="text-[10px] px-2 py-2 rounded-lg" style={{ color: C.textLight, background: '#fff', border: `1px dashed ${C.border}` }}>Select order first</div>
                        )}
                      </div>
                    )}

                    {/* Main field — varies by type */}
                    {isStitchingType ? (
                      /* Stitching: Category dropdown (highlighted) */
                      <div className="rounded-lg" style={{ background: `${C.gold}12`, border: `1.5px solid ${C.gold}` }}>
                        {stitchingOptions.length > 0 ? (
                          <select value={li.category || ''} onChange={e => updateLineItem(idx, 'category', e.target.value)}
                            className="text-xs px-2 py-2 rounded-lg border-0 outline-none w-full font-bold" style={{ background: 'transparent', color: C.goldDark }}>
                            <option value="">★ Stitch Category…</option>
                            {stitchingOptions.map(s => <option key={s.label} value={s.label}>{s.label}{s.cost ? ` — ₹${s.cost}` : ''}</option>)}
                          </select>
                        ) : (
                          <input value={li.category || ''} onChange={e => updateLineItem(idx, 'category', e.target.value)}
                            className="text-xs px-2 py-2 rounded-lg border-0 outline-none w-full font-bold" style={{ background: 'transparent', color: C.goldDark }} placeholder="★ Category" />
                        )}
                      </div>
                    ) : isEmbroideryType ? (
                      /* Embroidery: Rate card — Custom first, rate card entries, + Add Rate Card */
                      <div className="relative rounded-lg" style={{ background: `${C.gold}12`, border: `1.5px solid ${C.gold}` }}>
                        {li.style_code ? (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs">
                            {li.product_image && <img src={li.product_image} className="w-6 h-6 rounded object-cover flex-shrink-0" />}
                            <span className="font-bold font-mono" style={{ color: C.goldDark }}>{li.style_code}</span>
                            <span className="text-[10px] truncate" style={{ color: C.textMuted }}>{li.style_code === 'CUSTOM' ? (li.order_product_title || 'Custom') : li.category}</span>
                            <button onClick={() => clearLineProduct(idx)} className="text-xs flex-shrink-0 ml-auto" style={{ color: C.red }}>✕</button>
                          </div>
                        ) : addRateCardIdx === idx ? (
                          /* Inline Add Rate Card form */
                          <div className="p-2 space-y-2">
                            <div className="text-[10px] font-bold" style={{ color: C.goldDark }}>Add New Rate Card</div>
                            <input value={newRcStyleCode} onChange={e => setNewRcStyleCode(e.target.value)} placeholder="Style code (e.g. HL-KU-37)" className="text-xs px-2 py-1.5 rounded-lg border outline-none w-full" style={{ borderColor: C.border }} />
                            <input value={newRcTitle} onChange={e => setNewRcTitle(e.target.value)} placeholder="Product name (e.g. Chival Bandhgala)" className="text-xs px-2 py-1.5 rounded-lg border outline-none w-full" style={{ borderColor: C.border }} />
                            <input type="number" value={newRcRate} onChange={e => setNewRcRate(e.target.value)} placeholder="Rate (₹)" className="text-xs px-2 py-1.5 rounded-lg border outline-none w-full" style={{ borderColor: C.border }} />
                            <div className="flex gap-2">
                              <button onClick={() => saveInlineRateCard(idx)} disabled={newRcSaving || !newRcStyleCode.trim() || !newRcRate}
                                className="text-[10px] font-bold px-3 py-1.5 rounded-lg" style={{ background: C.gold, color: '#fff', opacity: (!newRcStyleCode.trim() || !newRcRate) ? 0.5 : 1 }}>
                                {newRcSaving ? 'Saving…' : 'Save & Apply'}
                              </button>
                              <button onClick={() => { setAddRateCardIdx(null); setNewRcStyleCode(''); setNewRcTitle(''); setNewRcRate('') }}
                                className="text-[10px] px-3 py-1.5 rounded-lg" style={{ color: C.textMuted }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <select value="" onChange={e => {
                            const val = e.target.value
                            if (val === '__CUSTOM__') {
                              const items = [...form.line_items]; items[idx] = { ...items[idx], style_code: 'CUSTOM', category: li.order_product_title || 'Custom', product_image: '' }; fld('line_items', items)
                            } else if (val === '__ADD_RC__') {
                              // Pre-fill from product if available
                              const sku = li.order_product_sku || ''
                              const styleCode = sku ? sku.replace(/-[A-Z0-9]+$/, '') : ''
                              setNewRcStyleCode(styleCode); setNewRcTitle(li.order_product_title || ''); setNewRcRate('')
                              setAddRateCardIdx(idx)
                            } else {
                              const rc = embroideryRateCard.find(r => r.styleCode === val)
                              if (rc) { const items = [...form.line_items]; items[idx] = { ...items[idx], style_code: rc.styleCode, category: rc.title, product_image: rc.image, rate: rc.rate || items[idx].rate }; fld('line_items', items) }
                            }
                          }} className="text-xs px-2 py-2 rounded-lg border-0 outline-none w-full font-bold" style={{ background: 'transparent', color: C.goldDark }}>
                            <option value="">★ Select rate card…</option>
                            <option value="__CUSTOM__">Custom (enter amount manually)</option>
                            {embroideryRateCard.map(r => <option key={r.styleCode} value={r.styleCode}>{r.styleCode} — {r.title}{r.rate ? ` (₹${r.rate})` : ''}</option>)}
                            <option value="__ADD_RC__">＋ Add New Rate Card…</option>
                          </select>
                        )}
                      </div>
                    ) : isAccessoriesType ? (
                      /* Accessories: Accessory type from rate card */
                      <div className="rounded-lg" style={{ background: `${C.gold}12`, border: `1.5px solid ${C.gold}` }}>
                        {accessoryOptions.length > 0 ? (
                          <select value={li.accessory_type || li.category || ''} onChange={e => updateLineItem(idx, 'accessory_type', e.target.value)}
                            className="text-xs px-2 py-2 rounded-lg border-0 outline-none w-full font-bold" style={{ background: 'transparent', color: C.goldDark }}>
                            <option value="">★ Accessory type…</option>
                            {accessoryOptions.map(a => <option key={a.label} value={a.label}>{a.label}{a.cost ? ` — ₹${a.cost}` : ''}</option>)}
                          </select>
                        ) : (
                          <input value={li.category || ''} onChange={e => updateLineItem(idx, 'category', e.target.value)}
                            className="text-xs px-2 py-2 rounded-lg border-0 outline-none w-full font-bold" style={{ background: 'transparent', color: C.goldDark }} placeholder="★ Accessory type" />
                        )}
                      </div>
                    ) : isDyeingType ? (
                      /* Dyeing: Fabric search with image */
                      <div className="relative">
                        {li.fabric_id ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg" style={{ background: '#fff', border: `1px solid ${C.borderLight}` }}>
                            {(() => { const fab = (fabricsList || []).find(f => f.id === li.fabric_id); const img = fab?.image_urls?.[0]; return img ? <img src={img} className="w-8 h-8 rounded-md object-cover flex-shrink-0" /> : null })()}
                            <span className="text-xs font-medium truncate" style={{ color: C.text }}>{li.fabric_name || li.fabric_id}</span>
                            <button onClick={() => clearLineFabric(idx)} className="text-xs flex-shrink-0 ml-auto px-1.5 py-0.5 rounded hover:bg-red-50" style={{ color: C.red }}>✕</button>
                          </div>
                        ) : (
                          <div className="relative">
                            <input value={fabricSearches[idx] || ''} onChange={e => { setFabricSearches(prev => ({ ...prev, [idx]: e.target.value })); setActiveFabricIdx(idx) }}
                              onFocus={() => setActiveFabricIdx(idx)} onBlur={() => setTimeout(() => setActiveFabricIdx(null), 200)}
                              className="text-xs px-2 py-2 rounded-lg border outline-none w-full" style={{ borderColor: C.border, background: '#fff' }} placeholder="Search fabric…" />
                            {activeFabricIdx === idx && (() => {
                              const results = getFilteredFabrics(fabricSearches[idx] || '')
                              return results?.length > 0 ? (
                                <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-lg shadow-lg overflow-hidden max-h-56 overflow-y-auto" style={{ background: '#fff', border: `1px solid ${C.border}`, minWidth: 260 }}>
                                  {results.map(f => (
                                    <button key={f.id} onClick={() => selectFabricForLine(idx, f)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50">
                                      {f.image_urls?.[0] ? <img src={f.image_urls[0]} className="w-10 h-10 rounded-md object-cover flex-shrink-0" /> :
                                        <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center text-xs text-gray-400">IMG</div>}
                                      <div className="min-w-0">
                                        <div className="text-xs font-bold truncate" style={{ color: C.text }}>{f.name}</div>
                                        <div className="text-[11px] font-mono" style={{ color: C.textMuted }}>{f.id}</div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              ) : null
                            })()}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Other / Generic: free text category */
                      <input value={li.category || ''} onChange={e => updateLineItem(idx, 'category', e.target.value)}
                        className="text-xs px-2 py-2 rounded-lg border outline-none w-full" style={{ borderColor: C.border, background: '#fff' }} placeholder="Item name" />
                    )}

                    {/* Dyeing-only: Colour code free text */}
                    {isDyeingType && (
                      <input value={li.dye_code || ''} onChange={e => updateLineItem(idx, 'dye_code', e.target.value)}
                        className="text-xs px-2 py-2 rounded-lg border outline-none w-full" style={{ borderColor: C.border, background: '#fff' }} placeholder="Colour code" />
                    )}

                    {/* Qty / Metres */}
                    <input type="number" value={li.qty || ''} onChange={e => updateLineItem(idx, 'qty', e.target.value)}
                      className="text-xs px-2 py-2 rounded-lg border outline-none w-full text-center" style={{ borderColor: C.border, background: '#fff' }}
                      placeholder={isDyeingType ? 'Mtrs' : 'Qty'} />

                    {/* Dyeing-only: Dye Type */}
                    {isDyeingType && (
                      dyeTypeOptions.length > 0 ? (
                        <select value={li.dye_type || ''} onChange={e => updateLineItem(idx, 'dye_type', e.target.value)}
                          className="text-xs px-2 py-2 rounded-lg border outline-none w-full" style={{ borderColor: C.border, background: '#fff' }}>
                          <option value="">Type…</option>
                          {dyeTypeOptions.map(dt => <option key={dt.label} value={dt.label}>{dt.label}</option>)}
                        </select>
                      ) : (
                        <input value={li.dye_type || ''} onChange={e => updateLineItem(idx, 'dye_type', e.target.value)}
                          className="text-xs px-2 py-2 rounded-lg border outline-none w-full" style={{ borderColor: C.border, background: '#fff' }} placeholder="Type" />
                      )
                    )}

                    {/* Rate */}
                    <input type="number" value={li.rate || ''} onChange={e => updateLineItem(idx, 'rate', e.target.value)}
                      className="text-xs px-2 py-2 rounded-lg border outline-none w-full text-right" style={{ borderColor: C.border, background: '#fff' }}
                      placeholder={isDyeingType ? '₹/m' : '₹'} />

                    {/* Amount */}
                    <div className="text-sm font-bold text-right" style={{ color: lineTotal > 0 ? C.goldDark : C.textLight }}>
                      {lineTotal > 0 ? fmtCurrency(lineTotal) : '—'}
                    </div>

                    {/* Remove */}
                    <button onClick={() => removeLineItem(idx)} disabled={form.line_items.length <= 1}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-xs hover:bg-red-50"
                      style={{ color: form.line_items.length > 1 ? C.red : C.textLight }}>✕</button>
                  </div>

                  {/* Product from order (desktop) — only for types without inline Product column (i.e. dyeing/other) */}
                  {!isStitchingType && !isEmbroideryType && !isAccessoriesType && li.order_number && getOrderProducts(li).length > 0 && (
                    <div className="hidden sm:flex items-center gap-2 mt-1.5 ml-9 pl-1">
                      <span className="text-[10px] font-bold uppercase" style={{ color: C.textLight }}>Product:</span>
                      {li.order_product_sku ? (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs" style={{ background: '#fff', border: `1px solid ${C.borderLight}` }}>
                          <span className="font-mono font-bold" style={{ color: C.goldDark }}>{li.order_product_sku}</span>
                          <span className="truncate" style={{ color: C.textMuted, maxWidth: 180 }}>{li.order_product_title}</span>
                          {/* Editable size selector */}
                          <select value={li.size || li.order_product_variant || ''} onChange={e => updateLineItem(idx, 'size', e.target.value)}
                            className="text-[10px] px-1.5 py-0.5 rounded border outline-none font-bold" style={{ borderColor: C.border, background: C.goldLight, color: C.goldDark, minWidth: 52 }}>
                            <option value="">Size</option>
                            {BILL_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button onClick={() => clearOrderProduct(idx)} className="text-xs flex-shrink-0" style={{ color: C.red }}>✕</button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {getOrderProducts(li).map((p, pi) => (
                            <button key={pi} onClick={() => selectOrderProduct(idx, p)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] hover:shadow-sm transition-all"
                              style={{ background: '#fff', border: `1px solid ${C.borderLight}` }}>
                              <span className="font-mono font-bold" style={{ color: C.goldDark }}>{(p.sku || '').replace(/-[A-Z0-9]+$/, '')}</span>
                              <span className="truncate" style={{ color: C.textMuted, maxWidth: 140 }}>{p.title}</span>
                              {p.variant_title && <span className="text-[9px] px-1 rounded" style={{ background: C.goldLight, color: C.goldDark }}>{p.variant_title}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ═══ MOBILE — Stacked compact for all vendor types ═══ */}
                  <div className="sm:hidden">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold" style={{ background: C.goldLight, color: C.goldDark }}>{idx + 1}</div>
                        {li.order_number && <span className="text-[10px] font-bold font-mono" style={{ color: C.goldDark }}>{li.order_number}</span>}
                        {!li.order_number && (
                          <div className="relative flex-1">
                            <input value={lineOrderSearches[idx] || ''} onChange={e => setManualOrderForLine(idx, e.target.value)}
                              onFocus={() => setActiveOrderSearchIdx(idx)} onBlur={() => commitManualOrder(idx)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitManualOrder(idx) } }}
                              className="text-[11px] px-1.5 py-1 rounded-lg border outline-none w-24" style={{ borderColor: C.border, background: '#fff' }} placeholder="Order #" />
                            {activeOrderSearchIdx === idx && (() => {
                              const results = getFilteredOrdersForLine(lineOrderSearches[idx] || '')
                              return results.length > 0 ? (
                                <div className="absolute z-20 top-full left-0 mt-1 rounded-lg shadow-lg overflow-hidden max-h-36 overflow-y-auto" style={{ background: '#fff', border: `1px solid ${C.border}`, minWidth: 200 }}>
                                  {results.map(o => (
                                    <button key={o.id} onMouseDown={e => e.preventDefault()} onClick={() => selectOrderForLine(idx, o)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-50">
                                      <span className="text-[10px] font-bold font-mono" style={{ color: C.goldDark }}>{o.order_number}</span>
                                      <span className="text-[10px] truncate" style={{ color: C.textMuted }}>{o.customer_name}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : null
                            })()}
                          </div>
                        )}
                      </div>
                      <button onClick={() => removeLineItem(idx)} disabled={form.line_items.length <= 1} className="text-xs" style={{ color: form.line_items.length > 1 ? C.red : C.textLight }}>✕</button>
                    </div>

                    {/* Mobile: Product selection for stitching / embroidery / accessories */}
                    {(isStitchingType || isEmbroideryType || isAccessoriesType) && li.order_number && (
                      <div className={`grid gap-1.5 mb-1.5 ${isStitchingType ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <div>
                          {li.order_product_title ? (
                            <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px]" style={{ background: '#fff', border: `1px solid ${C.borderLight}` }}>
                              <span className="truncate font-medium" style={{ color: C.text }}>{li.order_product_title}</span>
                              <button onClick={() => clearOrderProduct(idx)} className="text-[9px] flex-shrink-0 ml-auto" style={{ color: C.red }}>✕</button>
                            </div>
                          ) : getOrderProducts(li).length > 0 ? (
                            <select value="" onChange={e => { const p = getOrderProducts(li)[parseInt(e.target.value)]; if (p) selectOrderProduct(idx, p) }}
                              className="text-[10px] px-1.5 py-1 rounded-lg border outline-none w-full" style={{ borderColor: C.border, background: '#fff' }}>
                              <option value="">Product…</option>
                              {getOrderProducts(li).map((p, pi) => <option key={pi} value={pi}>{p.title}</option>)}
                            </select>
                          ) : (
                            <div className="text-[9px] px-1.5 py-1 rounded-lg" style={{ color: C.textLight, background: '#fff', border: `1px dashed ${C.border}` }}>No products</div>
                          )}
                        </div>
                        {isStitchingType && (
                          <select value={li.size || li.order_product_variant || ''} onChange={e => updateLineItem(idx, 'size', e.target.value)}
                            className="text-[10px] px-1 py-1 rounded-lg border outline-none font-bold" style={{ borderColor: C.border, background: C.goldLight, color: C.goldDark }}>
                            <option value="">Size</option>
                            {BILL_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </div>
                    )}

                    {/* Mobile: Product from order (dyeing/other — only types without inline product column) */}
                    {!isStitchingType && !isEmbroideryType && !isAccessoriesType && li.order_number && getOrderProducts(li).length > 0 && (
                      <div className="mb-1.5">
                        {li.order_product_sku ? (
                          <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px]" style={{ background: '#fff', border: `1px solid ${C.borderLight}` }}>
                            <span className="font-mono font-bold" style={{ color: C.goldDark }}>{li.order_product_sku}</span>
                            <span className="truncate" style={{ color: C.textMuted }}>{li.order_product_title}</span>
                            <button onClick={() => clearOrderProduct(idx)} className="text-[10px] ml-auto flex-shrink-0" style={{ color: C.red }}>✕</button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {getOrderProducts(li).map((p, pi) => (
                              <button key={pi} onMouseDown={e => e.preventDefault()} onClick={() => selectOrderProduct(idx, p)} className="px-1.5 py-0.5 rounded text-[10px]"
                                style={{ background: '#fff', border: `1px solid ${C.borderLight}`, color: C.text }}>{p.title}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Row 1: Main field(s) */}
                    <div className={`grid gap-1.5 mb-1.5 ${isDyeingType ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {isEmbroideryType ? (
                        /* Embroidery: Rate card — Custom first, entries, + Add Rate Card */
                        <div className="rounded-lg" style={{ background: `${C.gold}12`, border: `1.5px solid ${C.gold}` }}>
                          {li.style_code ? (
                            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[10px]">
                              {li.product_image && <img src={li.product_image} className="w-5 h-5 rounded object-cover flex-shrink-0" />}
                              <span className="font-bold font-mono" style={{ color: C.goldDark }}>{li.style_code}</span>
                              <span className="text-[9px] truncate" style={{ color: C.textMuted }}>{li.style_code === 'CUSTOM' ? (li.order_product_title || 'Custom') : li.category}</span>
                              <button onClick={() => clearLineProduct(idx)} className="text-[9px] flex-shrink-0 ml-auto" style={{ color: C.red }}>✕</button>
                            </div>
                          ) : addRateCardIdx === idx ? (
                            <div className="p-1.5 space-y-1.5">
                              <div className="text-[9px] font-bold" style={{ color: C.goldDark }}>Add Rate Card</div>
                              <input value={newRcStyleCode} onChange={e => setNewRcStyleCode(e.target.value)} placeholder="Style code" className="text-[10px] px-1.5 py-1 rounded-lg border outline-none w-full" style={{ borderColor: C.border }} />
                              <input value={newRcTitle} onChange={e => setNewRcTitle(e.target.value)} placeholder="Product name" className="text-[10px] px-1.5 py-1 rounded-lg border outline-none w-full" style={{ borderColor: C.border }} />
                              <input type="number" value={newRcRate} onChange={e => setNewRcRate(e.target.value)} placeholder="Rate (₹)" className="text-[10px] px-1.5 py-1 rounded-lg border outline-none w-full" style={{ borderColor: C.border }} />
                              <div className="flex gap-1.5">
                                <button onClick={() => saveInlineRateCard(idx)} disabled={newRcSaving || !newRcStyleCode.trim() || !newRcRate}
                                  className="text-[9px] font-bold px-2 py-1 rounded-lg" style={{ background: C.gold, color: '#fff', opacity: (!newRcStyleCode.trim() || !newRcRate) ? 0.5 : 1 }}>
                                  {newRcSaving ? 'Saving…' : 'Save'}
                                </button>
                                <button onClick={() => { setAddRateCardIdx(null); setNewRcStyleCode(''); setNewRcTitle(''); setNewRcRate('') }}
                                  className="text-[9px] px-2 py-1 rounded-lg" style={{ color: C.textMuted }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <select value="" onChange={e => {
                              const val = e.target.value
                              if (val === '__CUSTOM__') {
                                const items = [...form.line_items]; items[idx] = { ...items[idx], style_code: 'CUSTOM', category: li.order_product_title || 'Custom', product_image: '' }; fld('line_items', items)
                              } else if (val === '__ADD_RC__') {
                                const sku = li.order_product_sku || ''
                                const styleCode = sku ? sku.replace(/-[A-Z0-9]+$/, '') : ''
                                setNewRcStyleCode(styleCode); setNewRcTitle(li.order_product_title || ''); setNewRcRate('')
                                setAddRateCardIdx(idx)
                              } else {
                                const rc = embroideryRateCard.find(r => r.styleCode === val)
                                if (rc) { const items = [...form.line_items]; items[idx] = { ...items[idx], style_code: rc.styleCode, category: rc.title, product_image: rc.image, rate: rc.rate || items[idx].rate }; fld('line_items', items) }
                              }
                            }} className="text-[10px] px-1.5 py-1 rounded-lg border-0 outline-none w-full font-bold" style={{ background: 'transparent', color: C.goldDark }}>
                              <option value="">★ Select rate card…</option>
                              <option value="__CUSTOM__">Custom (manual amount)</option>
                              {embroideryRateCard.map(r => <option key={r.styleCode} value={r.styleCode}>{r.styleCode} — {r.title}{r.rate ? ` (₹${r.rate})` : ''}</option>)}
                              <option value="__ADD_RC__">＋ Add New Rate Card…</option>
                            </select>
                          )}
                        </div>
                      ) : isAccessoriesType ? (
                        /* Accessories: accessory type from rate card */
                        <div className="rounded-lg" style={{ background: `${C.gold}12`, border: `1.5px solid ${C.gold}` }}>
                          {accessoryOptions.length > 0 ? (
                            <select value={li.accessory_type || li.category || ''} onChange={e => updateLineItem(idx, 'accessory_type', e.target.value)}
                              className="text-[10px] px-1.5 py-1 rounded-lg border-0 outline-none w-full font-bold" style={{ background: 'transparent', color: C.goldDark }}>
                              <option value="">★ Accessory type…</option>
                              {accessoryOptions.map(a => <option key={a.label} value={a.label}>{a.label}{a.cost ? ` — ₹${a.cost}` : ''}</option>)}
                            </select>
                          ) : (
                            <input value={li.category || ''} onChange={e => updateLineItem(idx, 'category', e.target.value)}
                              className="text-[10px] px-1.5 py-1 rounded-lg border-0 outline-none w-full font-bold" style={{ background: 'transparent', color: C.goldDark }} placeholder="★ Accessory type" />
                          )}
                        </div>
                      ) : isDyeingType ? (<>
                        <div className="relative">
                          {li.fabric_id ? (
                            <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg" style={{ background: '#fff', border: `1px solid ${C.borderLight}` }}>
                              {(() => { const fab = (fabricsList || []).find(f => f.id === li.fabric_id); const img = fab?.image_urls?.[0]; return img ? <img src={img} className="w-5 h-5 rounded object-cover flex-shrink-0" /> : null })()}
                              <span className="text-[10px] truncate" style={{ color: C.text }}>{li.fabric_name || li.fabric_id}</span>
                              <button onClick={() => clearLineFabric(idx)} className="text-[9px] flex-shrink-0 ml-auto" style={{ color: C.red }}>✕</button>
                            </div>
                          ) : (
                            <div className="relative">
                              <input value={fabricSearches[idx] || ''} onChange={e => { setFabricSearches(prev => ({ ...prev, [idx]: e.target.value })); setActiveFabricIdx(idx) }}
                                onFocus={() => setActiveFabricIdx(idx)} onBlur={() => setTimeout(() => setActiveFabricIdx(null), 200)}
                                className="text-[11px] px-1.5 py-1.5 rounded-lg border outline-none w-full" style={{ borderColor: C.border, background: '#fff' }} placeholder="Fabric…" />
                              {activeFabricIdx === idx && (() => {
                                const results = getFilteredFabrics(fabricSearches[idx] || '')
                                return results?.length > 0 ? (
                                  <div className="absolute z-20 top-full left-0 mt-1 rounded-lg shadow-lg overflow-hidden max-h-40 overflow-y-auto" style={{ background: '#fff', border: `1px solid ${C.border}`, minWidth: 200 }}>
                                    {results.map(f => (
                                      <button key={f.id} onClick={() => selectFabricForLine(idx, f)} className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-50">
                                        {f.image_urls?.[0] ? <img src={f.image_urls[0]} className="w-6 h-6 rounded object-cover flex-shrink-0" /> :
                                          <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-[8px] text-gray-400">IMG</div>}
                                        <span className="text-[10px] font-medium truncate" style={{ color: C.text }}>{f.name}</span>
                                      </button>
                                    ))}
                                  </div>
                                ) : null
                              })()}
                            </div>
                          )}
                        </div>
                        <input value={li.dye_code || ''} onChange={e => updateLineItem(idx, 'dye_code', e.target.value)}
                          className="text-[11px] px-1.5 py-1.5 rounded-lg border outline-none" style={{ borderColor: C.border, background: '#fff' }} placeholder="Colour code" />
                      </>) : isStitchingType ? (
                        <div className="rounded-lg" style={{ background: `${C.gold}12`, border: `1.5px solid ${C.gold}` }}>
                          {stitchingOptions.length > 0 ? (
                            <select value={li.category || ''} onChange={e => updateLineItem(idx, 'category', e.target.value)}
                              className="text-[11px] px-1.5 py-1.5 rounded-lg border-0 outline-none w-full font-bold" style={{ background: 'transparent', color: C.goldDark }}>
                              <option value="">★ Stitch Category…</option>
                              {stitchingOptions.map(s => <option key={s.label} value={s.label}>{s.label}{s.cost ? ` — ₹${s.cost}` : ''}</option>)}
                            </select>
                          ) : (
                            <input value={li.category || ''} onChange={e => updateLineItem(idx, 'category', e.target.value)}
                              className="text-[11px] px-1.5 py-1.5 rounded-lg border-0 outline-none w-full font-bold" style={{ background: 'transparent', color: C.goldDark }} placeholder="★ Category" />
                          )}
                        </div>
                      ) : (
                        /* Other/Generic: free text */
                        <input value={li.category || ''} onChange={e => updateLineItem(idx, 'category', e.target.value)}
                          className="text-[11px] px-1.5 py-1.5 rounded-lg border outline-none w-full" style={{ borderColor: C.border, background: '#fff' }} placeholder="Item name" />
                      )}
                    </div>

                    {/* Row 2: Qty / (Dye Type) / Rate / Amount */}
                    <div className={`grid gap-1.5 ${isDyeingType ? 'grid-cols-4' : 'grid-cols-3'}`}>
                      <input type="number" value={li.qty || ''} onChange={e => updateLineItem(idx, 'qty', e.target.value)}
                        className="text-[11px] px-1.5 py-1.5 rounded-lg border outline-none text-center" style={{ borderColor: C.border, background: '#fff' }}
                        placeholder={isDyeingType ? 'Mtrs' : 'Qty'} />
                      {isDyeingType && (
                        dyeTypeOptions.length > 0 ? (
                          <select value={li.dye_type || ''} onChange={e => updateLineItem(idx, 'dye_type', e.target.value)}
                            className="text-[11px] px-1.5 py-1.5 rounded-lg border outline-none" style={{ borderColor: C.border, background: '#fff' }}>
                            <option value="">Type</option>
                            {dyeTypeOptions.map(dt => <option key={dt.label} value={dt.label}>{dt.label}</option>)}
                          </select>
                        ) : (
                          <input value={li.dye_type || ''} onChange={e => updateLineItem(idx, 'dye_type', e.target.value)}
                            className="text-[11px] px-1.5 py-1.5 rounded-lg border outline-none" style={{ borderColor: C.border, background: '#fff' }} placeholder="Type" />
                        )
                      )}
                      <input type="number" value={li.rate || ''} onChange={e => updateLineItem(idx, 'rate', e.target.value)}
                        className="text-[11px] px-1.5 py-1.5 rounded-lg border outline-none text-right" style={{ borderColor: C.border, background: '#fff' }}
                        placeholder={isDyeingType ? '₹/m' : '₹'} />
                      <div className="text-[11px] font-bold text-right py-1.5" style={{ color: lineTotal > 0 ? C.goldDark : C.textLight }}>
                        {lineTotal > 0 ? fmtCurrency(lineTotal) : '—'}
                      </div>
                    </div>
                  </div>

                </div>
              )
            })}

            {/* Total row */}
            <div className="flex justify-end items-center gap-5 mt-4 pt-4" style={{ borderTop: `2px solid ${C.gold}` }}>
              <span className="text-sm font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Bill Total</span>
              <span className="text-2xl font-extrabold" style={{ color: C.goldDark, fontFamily: 'Manrope' }}>{fmtCurrency(totalCost)}</span>
            </div>
          </div>

          {/* Description / notes */}
          <Field label="Description / Notes">
            <Input value={form.description} onChange={e => fld('description', e.target.value)} placeholder="Overall bill notes (optional)" />
          </Field>

          {isSettled && <Field label="Edit Note *"><Input value={form.edit_note} onChange={e => fld('edit_note', e.target.value)} placeholder="Why?" /></Field>}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 text-sm py-2.5 rounded-xl border font-medium" style={{ borderColor: C.border, color: C.textMuted }}>Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 text-sm py-2.5 rounded-xl text-white font-semibold" style={{ background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})`, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : (isEdit ? 'Update Bill' : 'Create Bill')}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── BILL PREVIEW & PDF MODAL ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const BillPreviewModal = ({ entry, vendor, onClose }) => {
  const lineItems = entry.line_items || []
  const totalCost = lineItems.reduce((s, li) => s + (n(li.qty) * n(li.rate)), 0) || n(entry.total_cost)

  const generateBillHTML = () => {
    let html = '<!DOCTYPE html><html><head><style>'
    html += '*{box-sizing:border-box;margin:0;padding:0}'
    html += 'body{font-family:system-ui,-apple-system,sans-serif;padding:40px;color:#1b1c1a;max-width:800px;margin:0 auto;background:#fff}'
    html += '@media print{body{padding:20px}}'
    html += '.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:3px solid #d4a843}'
    html += '.logo{font-size:28px;font-weight:800;color:#795900;letter-spacing:-0.5px;font-family:Georgia,serif}'
    html += '.logo-sub{font-size:9px;font-weight:500;color:#a09a8e;letter-spacing:0.15em;text-transform:uppercase;margin-top:2px}'
    html += '.bill-id{font-size:14px;color:#807664;margin-top:4px;font-weight:600}'
    html += '.info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:28px}'
    html += '.info-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#807664;margin-bottom:3px}'
    html += '.info-value{font-size:13px;font-weight:600;color:#1b1c1a}'
    html += '.items-table{width:100%;border-collapse:collapse;margin-bottom:24px}'
    html += '.items-table th{background:#faf9f5;padding:10px 14px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#807664;border-bottom:2px solid #e3e2df}'
    html += '.items-table td{padding:14px;border-bottom:1px solid #f0efeb;font-size:13px;color:#1b1c1a;vertical-align:top}'
    html += '.items-table tr:last-child td{border-bottom:none}'
    html += '.items-table .cat-cell{font-weight:700;font-size:13px;color:#1b1c1a}'
    html += '.items-table .cat-badge{display:inline-block;background:rgba(212,168,67,0.12);color:#795900;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:0.03em}'
    html += '.items-table .comment-cell{font-size:11px;color:#807664;margin-top:3px;font-style:italic}'
    html += '.items-table tfoot td{border-top:3px solid #d4a843;font-weight:700;padding:14px;font-size:14px}'
    html += '.text-right{text-align:right}'
    html += '.text-center{text-align:center}'
    html += '.total-section{display:flex;justify-content:flex-end;margin-bottom:20px}'
    html += '.total-box{background:#faf9f5;border:2px solid #d4a843;border-radius:12px;padding:16px 28px;text-align:right}'
    html += '.total-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#807664}'
    html += '.total-value{font-size:28px;font-weight:800;color:#795900;margin-top:2px;font-family:Georgia,serif}'
    html += '.notes{margin-top:16px;padding:12px 16px;background:#faf9f5;border-radius:8px;font-size:12px;color:#4e4636;border:1px solid #e3e2df}'
    html += '.footer{margin-top:40px;padding-top:14px;border-top:1px solid #e3e2df;font-size:11px;color:#a09a8e;text-align:center}'
    html += '.status-badge{display:inline-block;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.06em}'
    html += '</style></head><body>'

    // Header
    html += '<div class="header"><div>'
    html += '<div class="logo">HILO</div>'
    html += '<div class="logo-sub">Design Studio</div>'
    html += '<div class="bill-id">Bill: ' + (entry.bill_number || '—') + '</div>'
    html += '</div>'
    html += '<div style="text-align:right">'
    html += '<div class="info-label">Bill Date</div>'
    html += '<div class="info-value">' + fmtDate(entry.date) + '</div>'
    const statusColor = STATUS_COLORS[entry.status] || '#888'
    html += '<div class="status-badge" style="background:' + statusColor + '20;color:' + statusColor + ';margin-top:8px">' + (entry.status || 'pending').replace('_', ' ') + '</div>'
    html += '</div></div>'

    // Info grid
    html += '<div class="info-grid">'
    html += '<div><div class="info-label">Vendor</div><div class="info-value">' + vendor.name + '</div><div style="font-size:11px;color:#807664">' + vendor.id + '</div></div>'
    html += '<div><div class="info-label">Service</div><div class="info-value">' + (SERVICE_MAP[entry.service] || entry.service) + '</div></div>'
    if (entry.order_number) {
      html += '<div><div class="info-label">Order</div><div class="info-value">' + entry.order_number + '</div></div>'
    }
    html += '</div>'

    // Items table
    html += '<table class="items-table"><thead><tr>'
    html += '<th style="width:36px">#</th>'
    html += '<th>Category / Item</th>'
    html += '<th class="text-center" style="width:70px">Qty</th>'
    html += '<th class="text-right" style="width:90px">Rate</th>'
    html += '<th class="text-right" style="width:100px">Amount</th>'
    html += '</tr></thead><tbody>'

    lineItems.forEach((li, i) => {
      const lineTotal = n(li.qty) * n(li.rate)
      html += '<tr>'
      html += '<td class="text-center" style="color:#807664;font-weight:600;font-size:12px">' + (i + 1) + '</td>'
      html += '<td><div class="cat-cell"><span class="cat-badge">' + (li.category || li.description || 'Item') + '</span></div>'
      if (li.comment) html += '<div class="comment-cell">' + li.comment + '</div>'
      html += '</td>'
      html += '<td class="text-center" style="font-weight:600;font-family:monospace">' + (n(li.qty) || 0) + '</td>'
      html += '<td class="text-right" style="font-family:monospace">' + fmtCurrency(li.rate) + '</td>'
      html += '<td class="text-right" style="font-weight:700;font-family:monospace">' + fmtCurrency(lineTotal) + '</td>'
      html += '</tr>'
    })

    html += '</tbody><tfoot><tr>'
    html += '<td colspan="4" class="text-right" style="color:#807664">Total</td>'
    html += '<td class="text-right" style="font-size:16px;color:#795900">' + fmtCurrency(totalCost) + '</td>'
    html += '</tr></tfoot></table>'

    // Total box
    html += '<div class="total-section"><div class="total-box">'
    html += '<div class="total-label">Bill Total</div>'
    html += '<div class="total-value">' + fmtCurrency(totalCost) + '</div>'
    html += '</div></div>'

    if (entry.description) {
      html += '<div class="notes"><strong>Notes:</strong> ' + entry.description + '</div>'
    }

    html += '<div class="footer">Generated from Hilo Platform · ' + new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) + '</div>'
    html += '</body></html>'
    return html
  }

  const handlePrint = () => {
    const html = generateBillHTML()
    const win = window.open('', '_blank', 'width=800,height=600')
    if (win) {
      win.document.write(html); win.document.close()
      setTimeout(() => win.print(), 500)
    } else {
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = (entry.bill_number || 'bill') + '.html'; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleDownload = () => {
    const html = generateBillHTML()
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = (entry.bill_number || 'bill') + '.html'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-full sm:max-w-2xl mx-2 sm:mx-4 max-h-[90vh] overflow-y-auto">
        {/* In-modal preview */}
        <div className="p-4 sm:p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-5 pb-4" style={{ borderBottom: `3px solid ${C.gold}` }}>
            <div>
              <div className="text-2xl font-extrabold" style={{ color: C.goldDark, fontFamily: 'Georgia, serif' }}>HILO</div>
              <div className="text-[9px] font-medium uppercase tracking-widest mt-0.5" style={{ color: C.textLight }}>Design Studio</div>
              <div className="text-sm font-semibold mt-2 font-mono" style={{ color: C.textMuted }}>{entry.bill_number || '—'}</div>
            </div>
            <div className="text-right">
              <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: C.textLight }}>Bill Date</div>
              <div className="text-sm font-semibold" style={{ color: C.text }}>{fmtDate(entry.date)}</div>
              <Badge color={STATUS_COLORS[entry.status]} bg={`${STATUS_COLORS[entry.status]}15`}>{entry.status?.replace('_', ' ')}</Badge>
            </div>
          </div>

          {/* Audit stamp */}
          <div className="mb-4">
            <AuditStamp
              createdBy={{ name: entry.created_by_name || 'System', role: entry.created_by_role, date: entry.created_at }}
              updatedBy={entry.updated_by_name ? { name: entry.updated_by_name, role: entry.updated_by_role, date: entry.updated_at } : null}
              entityType="outsource_bill"
              entityId={entry.bill_number || entry.id}
              compact={false}
            />
          </div>

          {/* Info row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-5">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: C.textLight }}>Vendor</div>
              <div className="text-sm font-semibold" style={{ color: C.text }}>{vendor.name}</div>
              <div className="text-[10px] font-mono" style={{ color: C.textMuted }}>{vendor.id}</div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: C.textLight }}>Service</div>
              <div className="text-sm font-semibold" style={{ color: C.text }}>{SERVICE_MAP[entry.service] || entry.service}</div>
            </div>
            {entry.order_number && (
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: C.textLight }}>Order</div>
                <div className="text-sm font-semibold font-mono" style={{ color: C.goldDark }}>{entry.order_number}</div>
              </div>
            )}
          </div>

          {/* Line items table */}
          <div className="rounded-xl overflow-hidden mb-4 overflow-x-auto" style={{ border: `1px solid ${C.borderLight}` }}>
            <table className="w-full text-sm" style={{ minWidth: 420 }}>
              <thead>
                <tr style={{ background: C.cream }}>
                  <th className="py-2.5 px-3 text-[9px] font-bold uppercase tracking-wider text-center" style={{ color: C.textLight, width: 36 }}>#</th>
                  <th className="py-2.5 px-3 text-[9px] font-bold uppercase tracking-wider text-left" style={{ color: C.textLight }}>Category / Item</th>
                  <th className="py-2.5 px-3 text-[9px] font-bold uppercase tracking-wider text-center" style={{ color: C.textLight, width: 60 }}>Qty</th>
                  <th className="py-2.5 px-3 text-[9px] font-bold uppercase tracking-wider text-right" style={{ color: C.textLight, width: 80 }}>Rate</th>
                  <th className="py-2.5 px-3 text-[9px] font-bold uppercase tracking-wider text-right" style={{ color: C.textLight, width: 90 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, i) => {
                  const lineTotal = n(li.qty) * n(li.rate)
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${C.borderLight}` }}>
                      <td className="py-3 px-3 text-center text-xs font-semibold" style={{ color: C.textLight }}>{i + 1}</td>
                      <td className="py-3 px-3">
                        <div className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold" style={{ background: C.goldLight, color: C.goldDark }}>
                          {li.category || li.description || 'Item'}
                        </div>
                        {li.comment && <div className="text-[11px] mt-1 italic" style={{ color: C.textMuted }}>{li.comment}</div>}
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-semibold text-xs">{li.qty}</td>
                      <td className="py-3 px-3 text-right font-mono text-xs">{fmtCurrency(li.rate)}</td>
                      <td className="py-3 px-3 text-right font-bold font-mono text-xs" style={{ color: C.text }}>{fmtCurrency(lineTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `3px solid ${C.gold}` }}>
                  <td colSpan={4} className="py-3 px-3 text-right text-xs font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Total</td>
                  <td className="py-3 px-3 text-right text-base font-extrabold" style={{ color: C.goldDark, fontFamily: 'Manrope' }}>{fmtCurrency(totalCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {entry.description && (
            <div className="text-xs p-3 rounded-xl mb-4" style={{ background: C.cream, color: C.textMuted }}>
              <span className="font-semibold" style={{ color: C.text }}>Notes:</span> {entry.description}
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2 mt-2">
            <button onClick={handlePrint} className="text-xs py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-1.5"
              style={{ background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})` }}>
              🖨️ Print
            </button>
            <button onClick={handleDownload} className="text-xs py-2.5 rounded-xl border font-medium flex items-center justify-center gap-1.5"
              style={{ borderColor: C.border, color: C.textMuted }}>
              📥 Download
            </button>
            <button onClick={onClose} className="text-xs py-2.5 rounded-xl border font-medium"
              style={{ borderColor: C.border, color: C.textMuted }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

// ─── Payment Modal ───────────────────────────────────────────────────────────
const PaymentModal = ({ vendor, entries, stats, latestClose, onPay, onClose }) => {
  const today = new Date().toISOString().slice(0, 10)
  const isTdsVendor = !!vendor.tds_enabled
  const [isTdsGovt, setIsTdsGovt] = useState(false)
  // If there's a closed statement, cutoff can't go into the closed period
  const minCutoff = latestClose ? (() => { const d = new Date(latestClose.close_date); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })() : undefined
  const [form, setForm] = useState({ date: today, cutoff_date: today, amount: '', method: 'bank_transfer', reference: '', notes: '', proofFile: null })
  const [saving, setSaving] = useState(false)
  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const preview = useMemo(() => {
    const eligible = entries.filter(e => e.date <= form.cutoff_date).sort((a, b) => a.date.localeCompare(b.date))
    const balanceDueTotal = eligible.reduce((s, e) => s + n(e.balance_due), 0)
    // Use the actual outstanding from ledger (total_work - total_paid), capped by eligible balance
    const outstanding = n(stats.outstanding)
    const gross = Math.min(balanceDueTotal, outstanding)
    const tds = isTdsVendor && !isTdsGovt ? Math.round(gross * 0.01) : 0
    return { eligible, balanceDueTotal, outstanding, gross, tds, net: gross - tds }
  }, [entries, form.cutoff_date, stats, isTdsVendor, isTdsGovt])

  const submit = async () => {
    if (!n(form.amount)) return alert('Enter amount')
    setSaving(true)
    await onPay({ ...form, tds_amount: preview.tds, is_tds_payment: isTdsGovt, method: isTdsGovt ? 'tds_govt' : form.method })
    setSaving(false)
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4" style={{ color: C.text, fontFamily: 'Manrope' }}>Make Payment — {vendor.name}</h3>
        {isTdsVendor && (
          <div className="flex gap-2 mb-4">
            <button onClick={() => setIsTdsGovt(false)} className="flex-1 text-xs py-2 rounded-xl border font-semibold" style={{ background: !isTdsGovt ? C.gold : '#fff', color: !isTdsGovt ? '#fff' : C.textMuted, borderColor: !isTdsGovt ? C.gold : C.border }}>Pay Vendor</button>
            <button onClick={() => setIsTdsGovt(true)} className="flex-1 text-xs py-2 rounded-xl border font-semibold" style={{ background: isTdsGovt ? C.purple : '#fff', color: isTdsGovt ? '#fff' : C.textMuted, borderColor: isTdsGovt ? C.purple : C.border }}>Pay TDS to Govt</button>
          </div>
        )}
        {isTdsGovt ? (
          <div className="space-y-3">
            <div className="rounded-xl p-3 space-y-1.5" style={{ background: C.purpleBg }}>
              <div className="text-xs font-semibold" style={{ color: C.purple }}>TDS Government Payment</div>
              <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>PAN</span><span className="font-mono font-medium">{vendor.pan || 'Not set'}</span></div>
              <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Pending TDS</span><span className="font-bold" style={{ color: C.purple }}>{fmtCurrency(stats.tdsPending)}</span></div>
            </div>
            <Field label="Date"><Input type="date" value={form.date} onChange={e => fld('date', e.target.value)} /></Field>
            <Field label="TDS Amount (₹) *"><Input type="number" value={form.amount} onChange={e => fld('amount', e.target.value)} placeholder={`${n(stats.tdsPending)}`} /></Field>
            <Field label="Challan / Ref"><Input value={form.reference} onChange={e => fld('reference', e.target.value)} /></Field>
            <Field label="Proof"><input type="file" accept="image/*,.pdf" onChange={e => fld('proofFile', e.target.files[0] || null)} className="text-xs" /></Field>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Payment Date"><Input type="date" value={form.date} onChange={e => fld('date', e.target.value)} /></Field>
              <Field label="Pay Up To Date"><Input type="date" value={form.cutoff_date} onChange={e => fld('cutoff_date', e.target.value)} min={minCutoff} /></Field>
              {latestClose && <div className="col-span-2 text-[10px] px-1" style={{ color: C.textMuted }}>Statement closed till {fmtDate(latestClose.close_date)} — only bills after this date are eligible.</div>}
            </div>
            <div className="rounded-xl p-3 space-y-1.5" style={{ background: C.cream }}>
              <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.textMuted }}>Settlement Preview</div>
              <div className="flex justify-between text-xs"><span style={{ color: C.textLight }}>Unpaid bills up to {fmtDate(form.cutoff_date)}</span><span className="font-medium">{preview.eligible.length} · {fmtCurrency(preview.balanceDueTotal)}</span></div>
              {isTdsVendor && preview.tds > 0 && <div className="flex justify-between text-xs"><span style={{ color: C.amber }}>TDS (1%)</span><span style={{ color: C.amber }}>−{fmtCurrency(preview.tds)}</span></div>}
              <div className="border-t pt-1.5 mt-1 flex justify-between text-sm font-bold" style={{ borderColor: C.border }}>
                <span>Net Payable</span><span style={{ color: C.red }}>{fmtCurrency(isTdsVendor ? preview.net : preview.gross)}</span>
              </div>
            </div>
            <Field label="Amount (₹) *"><Input type="number" value={form.amount} onChange={e => fld('amount', e.target.value)} placeholder={`${n(isTdsVendor ? preview.net : preview.gross)}`} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Method">
                <select value={form.method} onChange={e => fld('method', e.target.value)} className="w-full text-sm px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.border }}>
                  {PAYMENT_METHODS.filter(m => m !== 'tds_govt').map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                </select>
              </Field>
              <Field label="Reference / UTR"><Input value={form.reference} onChange={e => fld('reference', e.target.value)} /></Field>
            </div>
            <Field label="Proof"><input type="file" accept="image/*,.pdf" onChange={e => fld('proofFile', e.target.files[0] || null)} className="text-xs" /></Field>
            <Field label="Notes"><Input value={form.notes} onChange={e => fld('notes', e.target.value)} /></Field>
          </div>
        )}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 text-sm py-2.5 rounded-xl border font-medium" style={{ borderColor: C.border, color: C.textMuted }}>Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 text-sm py-2.5 rounded-xl text-white font-semibold" style={{ background: isTdsGovt ? C.purple : `linear-gradient(135deg, ${C.goldDark}, ${C.gold})`, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Processing…' : (isTdsGovt ? 'Record TDS' : 'Confirm Payment')}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── Receipt Modal (with canvas image) ───────────────────────────────────────
const generateReceiptCanvas = (receipt, vendor, settledEntries) => {
  const W = 600, pad = 40, lineH = 28
  const entryRows = Math.min(settledEntries.length, 8)
  const H = 520 + (entryRows > 0 ? 60 + entryRows * 26 : 0)
  const canvas = document.createElement('canvas')
  canvas.width = W * 2; canvas.height = H * 2
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
  const ctx = canvas.getContext('2d'); ctx.scale(2, 2)

  ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H)
  const grd = ctx.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, '#b8922e'); grd.addColorStop(1, '#d4a843')
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, 4)

  ctx.font = '700 22px Georgia,serif'; ctx.fillStyle = '#c9a432'; ctx.textAlign = 'left'; ctx.fillText('HILO', pad, 42)
  ctx.font = '400 9px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillText('DESIGN STUDIO', pad, 56)
  ctx.textAlign = 'right'; ctx.font = '600 11px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(receipt.id, W - pad, 42)
  ctx.font = '400 11px sans-serif'; ctx.fillText(fmtDate(receipt.date), W - pad, 58)

  let y = 78; ctx.strokeStyle = 'rgba(201,164,50,0.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke()
  y += 48; const cx = W / 2
  ctx.beginPath(); ctx.arc(cx, y, 28, 0, Math.PI * 2); ctx.fillStyle = '#16a34a'; ctx.fill()
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath(); ctx.moveTo(cx - 10, y); ctx.lineTo(cx - 2, y + 9); ctx.lineTo(cx + 12, y - 8); ctx.stroke()

  y += 50; ctx.textAlign = 'center'; ctx.font = '600 14px sans-serif'; ctx.fillStyle = '#22c55e'; ctx.fillText('Payment Successful', cx, y)
  y += 38; ctx.font = '800 36px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(fmtCurrency(receipt.amount), cx, y)
  y += 28; const mt = METHOD_LABEL[receipt.method] || receipt.method; ctx.font = '500 12px sans-serif'
  const mw = ctx.measureText(mt).width + 24; ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.beginPath(); const rr = (x, ry, w, h, r) => { ctx.moveTo(x + r, ry); ctx.lineTo(x + w - r, ry); ctx.quadraticCurveTo(x + w, ry, x + w, ry + r); ctx.lineTo(x + w, ry + h - r); ctx.quadraticCurveTo(x + w, ry + h, x + w - r, ry + h); ctx.lineTo(x + r, ry + h); ctx.quadraticCurveTo(x, ry + h, x, ry + h - r); ctx.lineTo(x, ry + r); ctx.quadraticCurveTo(x, ry, x + r, ry); ctx.closePath() }
  rr(cx - mw / 2, y - 12, mw, 24, 12); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillText(mt, cx, y + 4)

  y += 32; ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.beginPath(); rr(pad, y, W - pad * 2, 140, 12); ctx.fill()
  const dY = y + 20
  const drawR = (l, v, ry) => { ctx.textAlign = 'left'; ctx.font = '400 12px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillText(l, pad + 16, ry); ctx.textAlign = 'right'; ctx.font = '500 12px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(v, W - pad - 16, ry) }
  drawR('Paid To', vendor.name, dY); drawR('Vendor ID', vendor.id, dY + lineH)
  drawR(receipt.reference ? 'Reference' : 'Bills', receipt.reference || `${settledEntries.length} settled`, dY + lineH * 2)
  drawR('Date', fmtDate(receipt.cutoff_date), dY + lineH * 3)

  ctx.textAlign = 'center'; ctx.font = '400 10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillText('Hilo Design Studio · hilodesign.co', cx, H - 16)
  return canvas
}

const ReceiptModal = ({ receipt, vendor, entries, onClose }) => {
  // Handle both old format (UUID strings) and new format ({entry_id, amount_settled} objects)
  const settledEntries = entries.filter(e => {
    const allocs = receipt.settled_entries || []
    return allocs.some(a => (typeof a === 'string' ? a : a.entry_id) === e.id)
  })
  const canvasRef = useRef(null)

  useEffect(() => {
    if (canvasRef.current) { const c = generateReceiptCanvas(receipt, vendor, settledEntries); canvasRef.current.innerHTML = ''; c.style.width = '100%'; c.style.height = 'auto'; c.style.borderRadius = '12px'; canvasRef.current.appendChild(c) }
  }, [receipt, vendor, settledEntries])

  const downloadImg = () => { const c = generateReceiptCanvas(receipt, vendor, settledEntries); const a = document.createElement('a'); a.download = `receipt-${receipt.id}.png`; a.href = c.toDataURL('image/png'); a.click() }

  const shareWA = async () => {
    const c = generateReceiptCanvas(receipt, vendor, settledEntries)
    const text = `Payment ${fmtCurrency(receipt.amount)} to ${vendor.name} · ${fmtDate(receipt.date)} — Hilo`
    try {
      const blob = await new Promise(r => c.toBlob(r, 'image/png'))
      const f = new File([blob], `receipt-${receipt.id}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f], title: `Receipt ${receipt.id}` }); return }
    } catch { }
    // Desktop: copy image to clipboard silently, then open WhatsApp
    try {
      const blob = await new Promise(r => c.toBlob(r, 'image/png'))
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch { }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 p-5 max-h-[90vh] overflow-y-auto">
        <div ref={canvasRef} className="mb-4 rounded-xl overflow-hidden" />
        <div className="grid grid-cols-3 gap-2">
          <button onClick={downloadImg} className="text-xs py-2.5 rounded-xl border font-medium flex items-center justify-center gap-1" style={{ borderColor: C.border, color: C.textMuted }}>📥 Image</button>
          <button onClick={() => { const w = window.open('', '_blank'); w.document.write(`<html><head><title>Receipt</title></head><body style="font-family:sans-serif;padding:40px;max-width:600px;margin:0 auto"><h2 style="color:#c9a432">HILO</h2><p>Receipt: ${receipt.id}</p><h1 style="color:#16a34a">${fmtCurrency(receipt.amount)}</h1><p>To: ${vendor.name} (${vendor.id})</p><p>${METHOD_LABEL[receipt.method]} · ${fmtDate(receipt.date)}${receipt.reference ? ` · Ref: ${receipt.reference}` : ''}</p><p style="color:#999;font-size:12px">Hilo Design Studio</p></body></html>`); w.document.close(); setTimeout(() => w.print(), 400) }} className="text-xs py-2.5 rounded-xl border font-medium" style={{ borderColor: C.gold, color: C.gold }}>PDF</button>
          <button onClick={shareWA} className="text-xs py-2.5 rounded-xl text-white font-medium" style={{ background: '#25D366' }}>WhatsApp</button>
        </div>
        <button onClick={onClose} className="w-full text-xs py-2 mt-2" style={{ color: C.textLight }}>Close</button>
      </div>
    </Overlay>
  )
}

// ─── Reconciliation Modal ────────────────────────────────────────────────────
const ReconciliationModal = ({ vendor, entries, payments, closings = [], onClose }) => {
  // Default "from" to day after latest close, or 3 months ago
  const latestClose = closings.length > 0 ? [...closings].sort((a, b) => b.close_date.localeCompare(a.close_date))[0] : null
  const [from, setFrom] = useState(() => {
    if (latestClose) { const d = new Date(latestClose.close_date); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10)
  })
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))

  const download = () => {
    // Calculate opening balance from scratch: opening_balance + all debits before 'from' - all credits before 'from'
    const d = v => (v || '').slice(0, 10) // normalize to YYYY-MM-DD
    let openingBal = n(vendor.opening_balance)
    entries.filter(e => d(e.date) < d(from)).forEach(e => { openingBal += n(e.total_cost) })
    payments.filter(p => d(p.date) < d(from) && !p.is_tds_payment).forEach(p => { openingBal -= n(p.amount) })

    // Build line items + inject closing dividers within the date range
    const items = []
    entries.filter(e => d(e.date) >= d(from) && d(e.date) <= d(to)).forEach(e => items.push({ date: d(e.date), type: 'debit', desc: `${e.bill_number || SERVICE_MAP[e.service] || e.service} — ${e.description || ''}`, amount: n(e.total_cost) }))
    payments.filter(p => d(p.date) >= d(from) && d(p.date) <= d(to) && !p.is_tds_payment).forEach(p => items.push({ date: d(p.date), type: 'credit', desc: `Payment · ${METHOD_LABEL[p.method] || p.method}`, amount: n(p.amount) }))
    // Insert closing dividers within range
    closings.filter(c => d(c.close_date) >= d(from) && d(c.close_date) <= d(to)).forEach(c => items.push({ date: d(c.close_date), type: 'closing', desc: `Statement Closed`, amount: 0, carry: n(c.carry_forward), notes: c.notes }))
    items.sort((a, b) => { const cmp = a.date.localeCompare(b.date); if (cmp !== 0) return cmp; const order = { debit: 0, credit: 1, closing: 2 }; return (order[a.type] ?? 0) - (order[b.type] ?? 0) })
    let bal = openingBal
    const rows = items.map(i => {
      if (i.type === 'closing') return { ...i, bal }
      if (i.type === 'debit') bal += i.amount; else bal -= i.amount
      return { ...i, bal }
    })

    const openingRow = `<tr style="background:#faf9f5"><td></td><td style="font-weight:600">Opening Balance</td><td></td><td></td><td style="text-align:right;font-weight:700">${fmtCurrency(openingBal)}</td></tr>`
    const rowsHtml = rows.map(r => {
      if (r.type === 'closing') {
        return `<tr style="border-top:2px double #c9a432;border-bottom:2px double #c9a432;background:#fef9e7"><td style="font-weight:700;color:#c9a432">${fmtDate(r.date)}</td><td colspan="3" style="font-weight:700;color:#c9a432;text-align:center">━━━ STATEMENT CLOSED ━━━${r.notes ? ' · ' + r.notes : ''}</td><td style="text-align:right;font-weight:700;color:#c9a432">Carry: ${fmtCurrency(r.carry)}</td></tr>`
      }
      return `<tr><td>${fmtDate(r.date)}</td><td>${r.desc}</td><td style="text-align:right" class="d">${r.type === 'debit' ? fmtCurrency(r.amount) : ''}</td><td style="text-align:right" class="c">${r.type === 'credit' ? fmtCurrency(r.amount) : ''}</td><td style="text-align:right;font-weight:600">${fmtCurrency(r.bal)}</td></tr>`
    }).join('')
    const w = window.open('', '_blank')
    w.document.write(`<html><head><title>Statement</title><style>body{font-family:sans-serif;padding:40px;max-width:800px;margin:0 auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px 6px;border-bottom:1px solid #eee;text-align:left}.d{color:#dc2626}.c{color:#16a34a}</style></head><body><div style="display:flex;justify-content:space-between;border-bottom:2px solid #c9a432;padding-bottom:12px;margin-bottom:20px"><div><div style="font-family:Georgia;font-size:22px;font-weight:700;color:#c9a432">HILO</div></div><div style="text-align:right"><div style="font-weight:600">${vendor.name}</div><div style="font-size:11px;color:#666">${vendor.id} · ${fmtDate(from)} — ${fmtDate(to)}</div></div></div><table><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead><tbody>${openingRow}${rowsHtml}</tbody></table><div style="text-align:right;margin-top:12px;font-weight:700;font-size:14px">Closing: ${fmtCurrency(rows.length ? rows[rows.length - 1].bal : openingBal)}</div><div style="text-align:center;margin-top:24px;font-size:11px;color:#999">Hilo Design Studio</div></body></html>`)
    w.document.close(); setTimeout(() => w.print(), 400)
  }
  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm mx-4 p-5">
        <h3 className="text-lg font-bold mb-4" style={{ color: C.text, fontFamily: 'Manrope' }}>Vendor Statement</h3>
        {latestClose && (
          <div className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ background: C.cream, color: C.textMuted }}>
            Last closed: {fmtDate(latestClose.close_date)} · Carry forward: {fmtCurrency(latestClose.carry_forward)}
          </div>
        )}
        <div className="space-y-3">
          <Field label="From"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 text-sm py-2.5 rounded-xl border font-medium" style={{ borderColor: C.border, color: C.textMuted }}>Cancel</button>
          <button onClick={download} className="flex-1 text-sm py-2.5 rounded-xl text-white font-semibold" style={{ background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})` }}>Download</button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── Close Statement Modal ──────────────────────────────────────────────────
const CloseStatementModal = ({ vendor, entries, payments, latestClose, stats, onClose, onSave }) => {
  const today = new Date().toISOString().slice(0, 10)
  const [closeDate, setCloseDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Carry-forward uses balance_due which reflects actual FIFO-allocated payments (regardless of payment date)
  const preview = useMemo(() => {
    const eligible = entries.filter(e => e.date <= closeDate)
    const unpaidCount = eligible.filter(e => n(e.balance_due) > 0).length
    const paidCount = eligible.filter(e => n(e.balance_due) <= 0 && n(e.total_cost) > 0).length
    // balance_due reflects FIFO payments already allocated — this matches what user sees
    const carryForward = n(vendor.opening_balance) + eligible.reduce((sum, e) => sum + n(e.balance_due), 0)
    // Count payments allocated to entries in this period (for display)
    const periodPayments = payments.filter(p => {
      const allocs = p.settled_entries || []
      return allocs.some(a => {
        const eid = typeof a === 'string' ? a : a.entry_id
        return eligible.some(e => e.id === eid)
      })
    })
    return { balance: carryForward, billsTotal: eligible.length, unpaidCount, paidCount, paymentsCount: periodPayments.length }
  }, [entries, payments, closeDate, vendor])

  const submit = async () => {
    setSaving(true)
    await onSave({ close_date: closeDate, closing_balance: preview.balance, carry_forward: preview.balance, notes })
    setSaving(false)
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm mx-4 p-5">
        <h3 className="text-lg font-bold mb-4" style={{ color: C.text, fontFamily: 'Manrope' }}>Close Statement — {vendor.name}</h3>
        {latestClose && (
          <div className="text-[11px] px-3 py-2 rounded-lg mb-3" style={{ background: C.cream, color: C.textMuted }}>
            Last closed: {fmtDate(latestClose.close_date)} · Balance: {fmtCurrency(latestClose.carry_forward)}
          </div>
        )}
        <div className="space-y-3">
          <Field label="Close Date"><Input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} min={latestClose ? latestClose.close_date : undefined} /></Field>
          <div className="rounded-xl p-3 space-y-2" style={{ background: C.cream }}>
            <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.textMuted }}>Closing Summary</div>
            <div className="flex justify-between text-xs"><span style={{ color: C.textLight }}>Total bills up to date</span><span className="font-medium">{preview.billsTotal}</span></div>
            <div className="flex justify-between text-xs"><span style={{ color: C.green }}>Fully paid</span><span className="font-medium" style={{ color: C.green }}>{preview.paidCount}</span></div>
            {preview.unpaidCount > 0 && <div className="flex justify-between text-xs"><span style={{ color: C.red }}>Unpaid / partial</span><span className="font-medium" style={{ color: C.red }}>{preview.unpaidCount}</span></div>}
            <div className="border-t pt-2 mt-1 flex justify-between text-sm font-bold" style={{ borderColor: C.border }}>
              <span>Carry Forward</span>
              <span style={{ color: preview.balance > 0 ? C.red : C.green }}>{fmtCurrency(preview.balance)}</span>
            </div>
            {preview.balance > 0 && <div className="text-[10px]" style={{ color: C.amber }}>{preview.unpaidCount} bill{preview.unpaidCount !== 1 ? 's' : ''} still unpaid — {fmtCurrency(preview.balance)} carries into the next period.</div>}
            {preview.balance === 0 && <div className="text-[10px]" style={{ color: C.green }}>All bills paid — ledger starts fresh after this close.</div>}
          </div>
          <Field label="Notes (optional)"><Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Confirmed on WhatsApp" /></Field>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 text-sm py-2.5 rounded-xl border font-medium" style={{ borderColor: C.border, color: C.textMuted }}>Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 text-sm py-2.5 rounded-xl text-white font-semibold" style={{ background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})`, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Closing…' : 'Close Statement'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── Vendor Form Modal ───────────────────────────────────────────────────────
const VendorFormModal = ({ vendor, onSave, onClose }) => {
  const isEdit = !!vendor
  const [form, setForm] = useState({ _isExisting: isEdit, id: vendor?.id || '', name: vendor?.name || '', phone: vendor?.phone || vendor?.contact || '', type: vendor?.type || 'Tailoring', services: vendor?.services || [], rate: vendor?.rate || '', rate_unit: vendor?.rate_unit || 'per piece', location: vendor?.location || '', contact: vendor?.contact || vendor?.phone || '', tds_enabled: !!vendor?.tds_enabled, pan: vendor?.pan || '', gstin: vendor?.gstin || '', address: vendor?.address || '', bank_name: vendor?.bank_name || '', bank_account: vendor?.bank_account || '', bank_ifsc: vendor?.bank_ifsc || '', opening_balance: vendor?.opening_balance || 0, balance_frozen: !!vendor?.balance_frozen, freeze_balance: false, notes: vendor?.notes || '' })
  const [saving, setSaving] = useState(false)
  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = async () => {
    if (!form.name.trim()) return alert('Name required')
    if (!form.services?.length) form.services = [TYPE_TO_SERVICE[form.type] || 'other']
    setSaving(true); await onSave(form); setSaving(false)
  }
  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-5 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold mb-4" style={{ color: C.text, fontFamily: 'Manrope' }}>{isEdit ? 'Edit Vendor' : 'New Vendor'}</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name *"><Input value={form.name} onChange={e => fld('name', e.target.value)} /></Field>
            <Field label="Type *">
              <select value={form.type} onChange={e => { fld('type', e.target.value); fld('services', [TYPE_TO_SERVICE[e.target.value] || 'other']) }} className="w-full text-sm px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.border }}>
                {OUTSOURCE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Phone"><Input value={form.contact} onChange={e => { fld('contact', e.target.value); fld('phone', e.target.value) }} /></Field>
            <Field label="Location"><Input value={form.location} onChange={e => fld('location', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="PAN"><Input value={form.pan} onChange={e => fld('pan', e.target.value.toUpperCase())} className="font-mono" maxLength={10} /></Field>
            <Field label="GSTIN"><Input value={form.gstin} onChange={e => fld('gstin', e.target.value.toUpperCase())} className="font-mono" maxLength={15} /></Field>
          </div>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!form.tds_enabled} onChange={e => fld('tds_enabled', e.target.checked)} className="w-4 h-4 rounded accent-amber-600" /><span className="text-sm font-medium" style={{ color: C.text }}>TDS Applicable (1%)</span></label>
          {!form.balance_frozen ? (
            <>
              <Field label="Opening Balance (₹)"><Input type="number" value={form.opening_balance} onChange={e => fld('opening_balance', e.target.value)} /></Field>
              {n(form.opening_balance) > 0 && <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!form.freeze_balance} onChange={e => fld('freeze_balance', e.target.checked)} className="w-4 h-4 rounded accent-blue-600" /><span className="text-xs" style={{ color: C.textMuted }}>Freeze balance (permanent)</span></label>}
            </>
          ) : (
            <div className="p-3 rounded-xl" style={{ background: C.cream }}><span className="text-sm font-medium">₹{n(form.opening_balance).toLocaleString('en-IN')}</span> <Badge color={C.blue} bg={C.blueBg}>Frozen</Badge></div>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 text-sm py-2.5 rounded-xl border font-medium" style={{ borderColor: C.border, color: C.textMuted }}>Cancel</button>
          <button onClick={submit} disabled={saving} className="flex-1 text-sm py-2.5 rounded-xl text-white font-semibold" style={{ background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})`, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : (isEdit ? 'Update' : 'Create')}</button>
        </div>
      </div>
    </Overlay>
  )
}

// ─── Vendor Info Form ────────────────────────────────────────────────────────
const VendorInfoForm = ({ vendor, onSave }) => {
  const [form, setForm] = useState({ ...vendor, _isExisting: true })
  const [saving, setSaving] = useState(false)
  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const save = async () => { if (!form.name.trim()) return alert('Name required'); setSaving(true); await onSave(form); setSaving(false) }

  return (
    <div className="max-w-lg space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Vendor ID"><div className="text-sm px-3 py-2.5 rounded-xl font-mono" style={{ background: C.cream }}>{form.id}</div></Field>
        <Field label="Type">
          <select value={form.type || ''} onChange={e => { fld('type', e.target.value); fld('services', [TYPE_TO_SERVICE[e.target.value] || 'other']) }} className="w-full text-sm px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.border }}>
            <option value="">—</option>{OUTSOURCE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name"><Input value={form.name} onChange={e => fld('name', e.target.value)} /></Field>
        <Field label="Phone"><Input value={form.contact || form.phone || ''} onChange={e => { fld('contact', e.target.value); fld('phone', e.target.value) }} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Rate (₹)"><Input type="number" value={form.rate || ''} onChange={e => fld('rate', e.target.value)} /></Field>
        <Field label="Rate Unit">
          <select value={form.rate_unit || 'per piece'} onChange={e => fld('rate_unit', e.target.value)} className="w-full text-sm px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.border }}>
            <option>per piece</option><option>per metre</option>
          </select>
        </Field>
      </div>
      <Field label="Location"><Input value={form.location || ''} onChange={e => fld('location', e.target.value)} /></Field>
      <Field label="Address"><textarea value={form.address || ''} onChange={e => fld('address', e.target.value)} rows={2} className="w-full text-sm px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.border }} /></Field>

      <div className="pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>Tax & Compliance</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="PAN"><Input value={form.pan || ''} onChange={e => fld('pan', e.target.value.toUpperCase())} className="font-mono" maxLength={10} /></Field>
        <Field label="GSTIN"><Input value={form.gstin || ''} onChange={e => fld('gstin', e.target.value.toUpperCase())} className="font-mono" maxLength={15} /></Field>
      </div>
      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!form.tds_enabled} onChange={e => fld('tds_enabled', e.target.checked)} className="w-4 h-4 rounded accent-amber-600" /><span className="text-sm font-medium" style={{ color: C.text }}>TDS Applicable (1%)</span></label>

      <div className="pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>Bank Details</div>
      </div>
      <Field label="Bank Name"><Input value={form.bank_name || ''} onChange={e => fld('bank_name', e.target.value)} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Account No."><Input value={form.bank_account || ''} onChange={e => fld('bank_account', e.target.value)} className="font-mono" /></Field>
        <Field label="IFSC"><Input value={form.bank_ifsc || ''} onChange={e => fld('bank_ifsc', e.target.value.toUpperCase())} className="font-mono" maxLength={11} /></Field>
      </div>

      <div className="pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>Opening Balance (FY 25-26)</div>
      </div>
      {form.balance_frozen ? (
        <div className="p-3 rounded-xl" style={{ background: C.cream }}>
          <span className="text-sm font-medium">₹{n(form.opening_balance).toLocaleString('en-IN')}</span> <Badge color={C.blue} bg={C.blueBg}>Frozen</Badge>
          <div className="text-[10px] mt-1" style={{ color: C.textLight }}>Cannot be changed.</div>
        </div>
      ) : (
        <>
          <Field label="Opening Balance (₹)"><Input type="number" value={form.opening_balance || ''} onChange={e => fld('opening_balance', e.target.value)} /></Field>
          {n(form.opening_balance) > 0 && <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={!!form.freeze_balance} onChange={e => fld('freeze_balance', e.target.checked)} className="w-4 h-4 rounded accent-blue-600" /><span className="text-xs" style={{ color: C.textMuted }}>Freeze (permanent)</span></label>}
        </>
      )}

      <Field label="Notes"><textarea value={form.notes || ''} onChange={e => fld('notes', e.target.value)} rows={2} className="w-full text-sm px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: C.border }} /></Field>
      <button onClick={save} disabled={saving} className="text-sm px-6 py-2.5 rounded-xl text-white font-semibold" style={{ background: `linear-gradient(135deg, ${C.goldDark}, ${C.gold})`, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
    </div>
  )
}

export default OutsourceVendorsTab

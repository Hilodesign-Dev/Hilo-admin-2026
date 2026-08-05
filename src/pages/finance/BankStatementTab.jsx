import React, { useState, useEffect, useMemo } from 'react'
import { C, toast, fmtCurrency, fmtDate } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'

/* ═══════════════════════════════════════════════════════════════════════════
   HDFC XLS PARSER
   The HDFC bank statement format is:
     - Rows 0–19: Header / metadata (bank name, account info, address)
     - Row 20: Column headers (Date, Narration, Chq./Ref.No., Value Dt, Withdrawal, Deposit, Closing Balance)
     - Row 21: Separator (asterisks)
     - Rows 22+: Transaction data until an empty-date row or asterisks row
     - Footer: Statement summary + signature lines

   Date format is DD/MM/YY (e.g. "01/04/26" → 2026-04-01)
   ═══════════════════════════════════════════════════════════════════════════ */

const parseHDFCDate = (raw) => {
  if (!raw) return null
  const s = String(raw).trim()
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/)
  if (!m) return null
  const day = m[1], month = m[2]
  let year = m[3]
  if (year.length === 2) year = (parseInt(year) > 50 ? '19' : '20') + year
  return `${year}-${month}-${day}`
}

const parseHDFCRows = (rows) => {
  // Find the header row that contains "Date" and "Narration"
  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const first = String(rows[i][0] || '').trim().toLowerCase()
    if (first === 'date') { headerIdx = i; break }
  }
  if (headerIdx === -1) return { transactions: [], meta: {} }

  // Extract metadata (account number, opening balance, etc.)
  const meta = {}
  for (let i = 0; i < headerIdx; i++) {
    const raw = rows.map(r => String(r[0] || '') + ' ' + String(r[4] || '')).join(' ')
    // Try to grab account number
    const accMatch = raw.match(/Account\s*No\s*:\s*(\d+)/i)
    if (accMatch) meta.accountNo = accMatch[1]
    break
  }

  // Parse transactions (skip header + separator)
  const txns = []
  for (let i = headerIdx + 2; i < rows.length; i++) {
    const row = rows[i]
    const dateStr = String(row[0] || '').trim()
    if (!dateStr || dateStr.includes('***') || dateStr.includes('STATEMENT') || dateStr.includes('Opening')) break

    const date = parseHDFCDate(dateStr)
    if (!date) continue

    const narration = String(row[1] || '').trim()
    const refNo = String(row[2] || '').trim()
    const withdrawal = row[4] != null && row[4] !== '' && !isNaN(row[4]) ? parseFloat(row[4]) : null
    const deposit = row[5] != null && row[5] !== '' && !isNaN(row[5]) ? parseFloat(row[5]) : null
    const balance = row[6] != null && row[6] !== '' && !isNaN(row[6]) ? parseFloat(row[6]) : null

    if (!narration) continue

    txns.push({ date, narration, ref_no: refNo, debit: withdrawal, credit: deposit, balance })
  }
  return { transactions: txns, meta }
}

/* ═══════════════════════════════════════════════════════════════════════════
   GENERIC CSV PARSER (fallback)
   ═══════════════════════════════════════════════════════════════════════════ */
const parseCSV = (text) => {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim())
    const row = {}
    headers.forEach((h, i) => { row[h] = vals[i] || '' })
    return row
  })
}

const parseCSVRows = (parsed) => {
  return parsed.map(row => {
    const dateKey = Object.keys(row).find(k => k.includes('date'))
    const narratKey = Object.keys(row).find(k => k.includes('narration') || k.includes('description'))
    const debitKey = Object.keys(row).find(k => k.includes('debit') || k.includes('withdrawal'))
    const creditKey = Object.keys(row).find(k => k.includes('credit') || k.includes('deposit'))
    const balanceKey = Object.keys(row).find(k => k.includes('balance'))
    return {
      date: row[dateKey] || '',
      narration: row[narratKey] || '',
      ref_no: '',
      debit: debitKey && row[debitKey] ? parseFloat(row[debitKey]) : null,
      credit: creditKey && row[creditKey] ? parseFloat(row[creditKey]) : null,
      balance: balanceKey ? parseFloat(row[balanceKey]) : null,
    }
  }).filter(r => r.date && r.narration)
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUTO-TAG RULES — guess an expense category from narration
   ═══════════════════════════════════════════════════════════════════════════ */
const AUTO_TAG_RULES = [
  { match: /BAJAJFIN|BAJAJ\s*FINANCE/i, tag: 'Loan EMI', note: 'Bajaj Finance' },
  { match: /LENDINGKART/i, tag: 'Loan EMI', note: 'Lending Kart' },
  { match: /L&TFINANCE/i, tag: 'Loan EMI', note: 'L&T Finance' },
  { match: /AMBIT\s*FINVEST/i, tag: 'Loan EMI', note: 'Ambit Finvest' },
  { match: /ADITYABIRF/i, tag: 'Loan EMI', note: 'Aditya Birla Finance' },
  { match: /RAZORPAY.*UNITY|UNITY.*MSME/i, tag: 'Loan EMI', note: 'Unity MSME' },
  { match: /RENT/i, tag: 'Rent' },
  { match: /SALARY|SALRY/i, tag: 'Salary' },
  { match: /BLUE\s*DART|BLUEDART/i, tag: 'Courier' },
  { match: /DHL/i, tag: 'Courier' },
  { match: /DIGITALOCEAN/i, tag: 'Software' },
  { match: /CHATGPT|OPENAI/i, tag: 'Software' },
  { match: /CLAUDE\.AI/i, tag: 'Software' },
  { match: /AMAZON|AMZN/i, tag: 'Software / Marketplace' },
  { match: /SHOPIFY/i, tag: 'Software' },
  { match: /ZOHO/i, tag: 'Software' },
  { match: /GST.*BANK\s*REF|CBDT.*BANK\s*REF/i, tag: 'Tax Payment' },
  { match: /FABRIC|LINEN|SILK|SUITING|ZYLK|RAMAVILAS|RAMAVILL|SURYA.*TEX|DHYANU|SUBHASH/i, tag: 'Fabric' },
  { match: /EMBROIDERY|NASIR|MOJAMEL/i, tag: 'Embroidery' },
  { match: /DAHA\s*FASHION|DAHA/i, tag: 'Outsource Stitching' },
  { match: /RIDDHI\s*SIDDHI|RIDDI/i, tag: 'Outsource Stitching' },
  { match: /DYE|DYEING/i, tag: 'Dyeing' },
  { match: /KAMARUL/i, tag: 'Karigar Payroll', note: 'Kamarul' },
  { match: /SIKHANDER/i, tag: 'Karigar Payroll', note: 'Sikhander' },
  { match: /UPI.*MISC|UPI\sSEND/i, tag: 'Director Transfer' },
  { match: /NEFT\s*CR|RTGS\s*CR|IMPS.*HILO/i, tag: 'Internal Transfer' },
  { match: /MYNTRA|AZA\s*FASHIONS/i, tag: 'Marketplace Deposit' },
]

const autoTag = (narration) => {
  for (const r of AUTO_TAG_RULES) {
    if (r.match.test(narration)) return { tag: r.tag, note: r.note || '' }
  }
  return { tag: 'Other', note: '' }
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
const BankStatementTab = ({ user }) => {
  const [bankAccounts, setBankAccounts] = useState([])
  const [selectedAccountId, setSelectedAccountId] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(false)
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importPreviewRows, setImportPreviewRows] = useState([])
  const [importMeta, setImportMeta] = useState({})
  const [selectedFile, setSelectedFile] = useState(null)
  const [filterTag, setFilterTag] = useState('')
  const [filterStatus, setFilterStatus] = useState('unmatched')
  const [filterType, setFilterType] = useState('expense') // '' | 'expense' | 'deposit'
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 40
  // Default date range: empty when showing unsettled (show all), current month otherwise
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Settle modal
  const [settleModal, setSettleModal] = useState(null) // txn object or null
  const [accounts, setAccounts] = useState([])
  const [settleForm, setSettleForm] = useState({ account_id: '', sub_account: '', notes: '' })
  const [settling, setSettling] = useState(false)
  // Mode A — match existing payments
  const [settleMode, setSettleMode] = useState('match') // 'match' or 'manual'
  const [matchSource, setMatchSource] = useState('') // 'outsource' or 'fabric'
  const [matchVendors, setMatchVendors] = useState([])
  const [matchVendorId, setMatchVendorId] = useState('')
  const [matchPayments, setMatchPayments] = useState([])
  const [matchSelected, setMatchSelected] = useState([]) // array of payment IDs
  const [matchLoading, setMatchLoading] = useState(false)

  // Auto-match suggestions
  const [autoSuggestions, setAutoSuggestions] = useState({}) // { txn_id: { source, sourceType, vendorName, paymentId, paymentAmount, confidence, label } }
  const [bulkSelected, setBulkSelected] = useState(new Set()) // txn IDs selected for bulk confirm

  useEffect(() => {
    fetchBankAccounts()
    fetchExpenseAccounts()
  }, [])

  useEffect(() => {
    if (selectedAccountId) fetchTransactions()
  }, [selectedAccountId])

  const fetchBankAccounts = async () => {
    try {
      const { data, error } = await supa
        .from('bank_accounts')
        .select('*')
        .eq('is_active', true)
        .order('is_primary', { ascending: false })
      if (error) throw error
      setBankAccounts(data || [])
      if (data && data.length > 0) setSelectedAccountId(data[0].id)
    } catch (err) {
      toast(false, 'Failed to load bank accounts')
      console.error(err)
    }
  }

  const fetchExpenseAccounts = async () => {
    try {
      const { data } = await supa.from('expense_accounts').select('*').eq('is_active', true).order('sort_order')
      setAccounts(data || [])
    } catch (_) {}
  }

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      // Supabase defaults to 1000 rows — fetch ALL transactions in batches
      let allData = []
      let from = 0
      const BATCH = 1000
      while (true) {
        const { data: batch, error: batchErr } = await supa
          .from('bank_transactions')
          .select('*')
          .eq('bank_account_id', selectedAccountId)
          .order('date', { ascending: true })
          .order('created_at', { ascending: true })
          .range(from, from + BATCH - 1)
        if (batchErr) throw batchErr
        allData = allData.concat(batch || [])
        if (!batch || batch.length < BATCH) break
        from += BATCH
      }
      const data = allData
      const error = null
      if (error) throw error
      setTransactions(data || [])
      setCurrentPage(1)
      runAutoMatch(data || [], true)
    } catch (err) {
      toast(false, 'Failed to load transactions')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // ── Extract core entity name from bank narration ──
  // "UPI-GUMMADI SAHITH KUMAR-7042596323..." → "GUMMADI SAHITH KUMAR"
  // "NEFT DR-KARB0000329-CRK PRODUCTION R..." → "CRK PRODUCTION"
  // "IMPS-610549041935-MOUNA JUPITER-FDRL-..." → "MOUNA JUPITER"
  const extractNarrationCore = (narration) => {
    if (!narration) return ''
    const n = narration.toUpperCase()
    // UPI: name is typically the 2nd segment
    if (n.startsWith('UPI-') || n.startsWith('UPI/')) {
      const parts = n.split(/[-/]/)
      // Find the segment that looks like a name (not all digits, not bank codes)
      for (let i = 1; i < Math.min(parts.length, 4); i++) {
        const seg = parts[i].trim()
        if (seg.length >= 3 && !/^\d+$/.test(seg) && !/^[A-Z]{4}\d/.test(seg) && !/^@/.test(seg)) return seg
      }
    }
    // NEFT/RTGS: name after bank code (XXXX0000000-NAME)
    if (n.startsWith('NEFT') || n.startsWith('RTGS')) {
      const m = n.match(/[A-Z]{4}\d{7,}-(.+?)(?:-|$)/)
      if (m) return m[1].trim().replace(/\s+/g, ' ')
    }
    // IMPS: name is typically the 3rd segment
    if (n.startsWith('IMPS-')) {
      const parts = n.split('-')
      if (parts.length >= 3) {
        const seg = parts[2].trim()
        if (seg.length >= 3 && !/^\d+$/.test(seg)) return seg
      }
    }
    // ACH: name after ACH D-
    if (n.includes('ACH D-') || n.includes('ACH C-')) {
      const m = n.match(/ACH [DC]-\s*(?:TP\s+)?(?:ACH\s+)?(.+?)(?:-\d|$)/i)
      if (m) return m[1].trim()
    }
    // CBDT/tax: return "CBDT" or tax identifier
    if (n.includes('CBDT')) return 'CBDT'
    // Fallback: first meaningful chunk
    return n.slice(0, 40).trim()
  }

  // ── Auto-match: find best payment match for each pending debit txn ──
  const runAutoMatch = async (txns, silent = false) => {
    try {
      const pendingDebits = txns.filter(t => t.match_status === 'pending_review' && t.debit > 0)
      if (pendingDebits.length === 0) { setAutoSuggestions({}); return }

      // Fetch all unsettled payments + learned patterns in parallel
      // Each wrapped in catch so one failure doesn't break all matching
      const safe = (promise) => promise.then(r => r).catch(() => ({ data: null }))
      const [fabricRes, outsourceRes, salaryRes, payrollRes, loanRes, monthlyRes, paymentInvRes, taxPayRes, learnedRes] = await Promise.all([
        safe(supa.from('vendor_payments').select('id, amount, payment_date, vendor_id, fabric_vendors(name)').eq('settled', false)),
        safe(supa.from('outsource_payments').select('id, amount, tds_amount, date, vendor_id, outsource_vendors(name, type)').eq('settled', false)),
        safe(supa.from('staff_salary_entries').select('id, net_salary, salary_due_date, staff_id, staff_members(name, department)').in('payment_status', ['pending', 'paid']).is('bank_txn_id', null)),
        safe(supa.from('payroll_entries').select('id, net_pay, due_date, karigar_id, karigars(name), run_id, payroll_runs(period_end)').eq('settled', false)),
        safe(supa.from('loan_payments').select('id, amount, date, loan_id, loans(lender_name)').eq('matched', false).limit(200)),
        safe(supa.from('payment_entries').select('id, net_payable, base_amount, due_date, vendor_id, vendor_name, category').in('payment_status', ['pending', 'paid']).is('bank_txn_id', null)),
        safe(supa.from('payment_invoices').select('id, net_payable, balance_due, due_date, invoice_date, vendor_id, vendor_name, category, account_id').eq('settled', false)),
        safe(supa.from('tax_payments').select('id, amount, balance_due, due_date, tax_type, period_label, category').eq('settled', false)),
        // Learn from ALL previous settlements (includes legacy 'matched' entries)
        safe(supa.from('bank_transactions').select('narration, expense_mirror(payee, source_type, account_id)')
          .in('match_status', ['matched', 'settled']).not('expense_mirror_id', 'is', null).limit(1000)),
      ])

      // Normalize helper: strip spaces, &, hyphens, dots for fuzzy name matching
      const normalize = s => s.toLowerCase().replace(/[\s&\-_.,'()]+/g, '')

      // Build learned narration core → vendor identity map from settlement history
      // Once a narration core (e.g. "GUMMADI SAHITH KUMAR") is settled to a vendor,
      // that identity is LOCKED — it can never suggest a different vendor
      const learnedIdentities = {} // normalized core → { payee, sourceType }
      const learnedAccounts = {} // normalized core → { accountId, accountName } for COA auto-match
      ;(learnedRes.data || []).forEach(t => {
        if (t.narration && t.expense_mirror?.payee) {
          const core = extractNarrationCore(t.narration)
          if (core.length >= 4) {
            const key = normalize(core)
            // Store the identity (first settlement wins, or most common)
            if (!learnedIdentities[key]) {
              learnedIdentities[key] = {
                payee: t.expense_mirror.payee,
                sourceType: t.expense_mirror.source_type,
              }
            }
            // Also learn COA mappings: if this was a Mode B (manual COA) settlement
            // (has account_id and source_type is 'bank_import' or no Mode A source),
            // store the narration → account mapping
            if (t.expense_mirror.account_id && !learnedAccounts[key]) {
              learnedAccounts[key] = {
                accountId: t.expense_mirror.account_id,
                payee: t.expense_mirror.payee,
              }
            }
          }
        }
      })

      // Normalize all payments into a common shape
      const allPayments = []
      ;(fabricRes.data || []).forEach(p => allPayments.push({
        id: p.id, vendorId: p.vendor_id, amount: p.amount || 0, date: p.payment_date,
        name: p.fabric_vendors?.name || '', source: 'fabric', sourceType: 'fabric',
        label: `Fabric: ${p.fabric_vendors?.name || 'Unknown'}`,
      }))
      ;(outsourceRes.data || []).forEach(p => allPayments.push({
        id: p.id, vendorId: p.vendor_id, amount: (p.amount || 0) - (p.tds_amount || 0), date: p.date,
        name: p.outsource_vendors?.name || '', source: 'outsource', sourceType: 'outsource',
        vendorType: p.outsource_vendors?.type || '',
        label: `Outsource: ${p.outsource_vendors?.name || 'Unknown'}`,
      }))
      ;(salaryRes.data || []).forEach(p => allPayments.push({
        id: p.id, vendorId: p.staff_id, amount: p.net_salary || 0, date: p.salary_due_date,
        name: p.staff_members?.name || '', source: 'salary', sourceType: 'salary',
        department: p.staff_members?.department || '',
        label: `Salary: ${p.staff_members?.name || 'Unknown'}`,
      }))
      ;(payrollRes.data || []).forEach(p => allPayments.push({
        id: p.id, vendorId: p.karigar_id, amount: p.net_pay || 0, date: p.payroll_runs?.period_end || null,
        name: p.karigars?.name || '', source: 'karigar', sourceType: 'karigar',
        label: `Karigar: ${p.karigars?.name || 'Unknown'}`,
      }))
      ;(loanRes.data || []).forEach(p => allPayments.push({
        id: p.id, vendorId: p.loan_id, amount: p.amount || 0, date: p.date,
        name: p.loans?.lender_name || '', source: 'loan', sourceType: 'loan',
        label: `Loan: ${p.loans?.lender_name || 'Unknown'}`,
      }))
      ;(monthlyRes.data || []).forEach(p => allPayments.push({
        id: p.id, vendorId: p.vendor_id, amount: p.net_payable || p.base_amount || 0, date: p.due_date,
        name: p.vendor_name || '', source: 'monthly', sourceType: 'monthly',
        label: `Monthly: ${p.vendor_name || p.category || 'Unknown'}`,
      }))
      ;(paymentInvRes.data || []).forEach(p => allPayments.push({
        id: p.id, vendorId: p.vendor_id, amount: p.balance_due || p.net_payable || 0, date: p.due_date || p.invoice_date,
        name: p.vendor_name || '', source: 'payment', sourceType: 'payment',
        label: `Payment: ${p.vendor_name || p.category || 'Unknown'}`,
      }))
      const taxTypeNames = { gst: 'GST', tds: 'TDS', advance_tax: 'Advance Tax', compliance: 'Compliance' }
      ;(taxPayRes.data || []).forEach(p => allPayments.push({
        id: p.id, vendorId: p.tax_type, amount: p.balance_due || p.amount || 0, date: p.due_date,
        name: taxTypeNames[p.tax_type] || 'Tax', source: 'tax', sourceType: 'tax',
        label: `Tax: ${taxTypeNames[p.tax_type] || 'Tax'} — ${p.period_label || ''}`,
      }))

      if (allPayments.length === 0) { setAutoSuggestions({}); return }

      // ── Matching engine v3: Identity-first, exact amount required ──
      //
      // Rules:
      // 1. Amount MUST match exactly (within 1%) — no fuzzy amounts
      // 2. Identity comes from: learned history > fuzzy name match > category tag
      // 3. Once a narration core is learned (settled), that identity is LOCKED —
      //    "GUMMADI SAHITH KUMAR" = Sahith forever, can never suggest Samim
      // 4. No identity evidence + no learned history = no suggestion (no guessing)
      //
      const TAG_TO_SOURCE = {
        'Loan EMI': 'loan', 'Salary': 'salary', 'Fabric': 'fabric',
        'Embroidery': 'outsource', 'Outsource Stitching': 'outsource',
        'Dyeing': 'outsource', 'Karigar Payroll': 'karigar',
        'Tax Payment': 'tax', 'Rent': 'monthly',
      }

      const suggestions = {}
      for (const txn of pendingDebits) {
        const txnCore = extractNarrationCore(txn.narration)
        const txnCoreNorm = txnCore.length >= 4 ? normalize(txnCore) : ''
        const { tag: txnTag } = autoTag(txn.narration)
        const txnSourceHint = TAG_TO_SOURCE[txnTag] || null

        // ── Step 1: Is this narration core already learned? ──
        const learned = txnCoreNorm ? learnedIdentities[txnCoreNorm] : null

        if (learned) {
          // Identity is LOCKED — only look for payments from this specific vendor
          // Find exact-amount match from the learned vendor
          const exactMatch = allPayments.find(pay => {
            if (!pay.amount || !txn.debit) return false
            const amtMatch = Math.abs(pay.amount - txn.debit) / txn.debit < 0.01
            if (!amtMatch) return false
            // Must be from the same vendor (by name match)
            return normalize(pay.name) === normalize(learned.payee)
          })
          if (exactMatch) {
            suggestions[txn.id] = {
              source: exactMatch.source, sourceType: exactMatch.sourceType,
              vendorId: exactMatch.vendorId, vendorName: exactMatch.name,
              vendorType: exactMatch.vendorType, department: exactMatch.department,
              paymentId: exactMatch.id, paymentAmount: exactMatch.amount,
              confidence: 100, label: `${exactMatch.label} (learned)`,
            }
          } else {
            // Learned identity but no exact amount match — still show who it is at lower confidence
            // (amount might differ this month, but we know the vendor)
            const anyFromVendor = allPayments.find(pay =>
              normalize(pay.name) === normalize(learned.payee)
            )
            if (anyFromVendor) {
              suggestions[txn.id] = {
                source: anyFromVendor.source, sourceType: anyFromVendor.sourceType,
                vendorId: anyFromVendor.vendorId, vendorName: anyFromVendor.name,
                vendorType: anyFromVendor.vendorType, department: anyFromVendor.department,
                paymentId: anyFromVendor.id, paymentAmount: anyFromVendor.amount,
                confidence: 70, label: `${anyFromVendor.label} (learned, amt differs)`,
              }
            }
          }
          continue // Skip to next txn — identity is locked, don't consider other vendors
        }

        // ── Step 2: No learned identity — try fuzzy name match + exact amount ──
        let bestMatch = null
        let bestConfidence = 0

        for (const pay of allPayments) {
          // RULE 1: Amount must match exactly (within 1%)
          if (!pay.amount || !txn.debit) continue
          const amtMatch = Math.abs(pay.amount - txn.debit) / txn.debit < 0.01
          if (!amtMatch) continue

          let confidence = 0

          // ── Fuzzy name match in narration ──
          if (pay.name && txn.narration) {
            const narrNorm = normalize(txn.narration)
            const nameNorm = normalize(pay.name)
            if (nameNorm.length >= 3 && narrNorm.includes(nameNorm)) {
              confidence = 95 // exact name + exact amount = near certain
            } else if (nameNorm.length >= 4) {
              const partial = nameNorm.slice(0, Math.min(nameNorm.length, 8))
              if (partial.length >= 4 && narrNorm.includes(partial)) {
                confidence = 80 // partial name + exact amount = high confidence
              }
            }
          }

          // ── Category tag match (amount matched + right category) ──
          if (confidence === 0 && txnSourceHint && txnSourceHint === pay.source) {
            confidence = 60 // right category + exact amount, but no name match
          }

          if (confidence > bestConfidence) {
            bestConfidence = confidence
            bestMatch = pay
          }
        }

        if (bestMatch) {
          suggestions[txn.id] = {
            source: bestMatch.source, sourceType: bestMatch.sourceType,
            vendorId: bestMatch.vendorId, vendorName: bestMatch.name,
            vendorType: bestMatch.vendorType, department: bestMatch.department,
            paymentId: bestMatch.id, paymentAmount: bestMatch.amount,
            confidence: bestConfidence, label: bestMatch.label,
          }
          continue
        }

        // ── Step 3: No Mode A match — try COA auto-match (narration → account) ──
        // If we've previously settled this narration pattern to a COA account,
        // suggest auto-settling to the same account (Mode B / manual COA)
        if (txnCoreNorm && learnedAccounts[txnCoreNorm]) {
          const la = learnedAccounts[txnCoreNorm]
          const acct = accounts.find(a => a.id === la.accountId)
          suggestions[txn.id] = {
            source: 'coa', sourceType: 'coa',
            vendorId: la.accountId, vendorName: acct?.name || 'Expense Account',
            paymentId: null, paymentAmount: txn.debit,
            accountId: la.accountId,
            confidence: 85, label: `COA: ${acct?.name || 'Account'} (learned)`,
          }
        }
      }

      setAutoSuggestions(suggestions)
      // Pre-select all suggested txns for bulk confirm
      setBulkSelected(new Set(Object.keys(suggestions)))
      const count = Object.keys(suggestions).length
      if (!silent) {
        if (count > 0) {
          toast(true, `Found ${count} match suggestion${count !== 1 ? 's' : ''}`)
          setFilterStatus('suggested')
          setFilterType('')
        } else {
          toast(false, `No matches found for ${pendingDebits.length} pending transaction${pendingDebits.length !== 1 ? 's' : ''}`)
        }
      }
    } catch (err) {
      console.error('Auto-match error:', err)
      if (!silent) toast(false, 'Auto-match failed: ' + (err.message || ''))
    }
  }

  // ── File upload handler ───────────────────────────────────────────
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop().toLowerCase()

    if (ext === 'xls' || ext === 'xlsx') {
      // Use SheetJS to parse Excel
      try {
        const arrayBuffer = await file.arrayBuffer()
        const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs')
        const wb = XLSX.read(arrayBuffer, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        const { transactions: parsed, meta } = parseHDFCRows(rows)
        if (parsed.length === 0) {
          toast(false, 'No transactions found — check the file format')
          return
        }
        setImportPreviewRows(parsed)
        setImportMeta(meta)
        setShowImportPreview(true)
        setSelectedFile(file)
      } catch (err) {
        console.error('XLS parse error:', err)
        toast(false, 'Failed to parse XLS file')
      }
    } else if (ext === 'csv') {
      const reader = new FileReader()
      reader.onload = (event) => {
        try {
          const parsed = parseCSVRows(parseCSV(event.target.result))
          if (parsed.length === 0) {
            toast(false, 'No transactions found in CSV')
            return
          }
          setImportPreviewRows(parsed)
          setShowImportPreview(true)
          setSelectedFile(file)
        } catch (err) {
          toast(false, 'Failed to parse CSV file')
          console.error(err)
        }
      }
      reader.readAsText(file)
    } else {
      toast(false, 'Supported formats: .xls, .xlsx, .csv')
    }
    // Reset the input so the same file can be re-selected
    e.target.value = ''
  }

  // ── Confirm import ────────────────────────────────────────────────
  const confirmImport = async () => {
    if (!selectedAccountId || importPreviewRows.length === 0) {
      toast(false, 'No rows to import')
      return
    }

    try {
      setLoading(true)
      const batchId = crypto.randomUUID()

      // ── Dedup: fetch existing txns in the date range for this account ──
      const dates = importPreviewRows.map(r => r.date).filter(Boolean).sort()
      const minDate = dates[0] || '2020-01-01'
      const maxDate = dates[dates.length - 1] || '2099-12-31'
      const { data: existing } = await supa.from('bank_transactions')
        .select('date, narration, debit, credit')
        .eq('bank_account_id', selectedAccountId)
        .gte('date', minDate).lte('date', maxDate)

      // Use a count-based Map so identical transactions (same date/narration/amount) are handled correctly
      const existingMap = new Map()
      ;(existing || []).forEach(e => {
        const key = `${e.date}|${(e.narration || '').trim().slice(0, 80)}|${e.debit || 0}|${e.credit || 0}`
        existingMap.set(key, (existingMap.get(key) || 0) + 1)
      })

      const allRows = importPreviewRows.map(row => ({
        bank_account_id: selectedAccountId,
        import_batch_id: batchId,
        date: row.date,
        narration: row.narration,
        debit: row.debit,
        credit: row.credit,
        balance: row.balance,
        match_status: 'pending_review',
      }))

      // Track how many of each key we've seen in the import — only skip if DB already has enough
      const importCounts = new Map()
      const rowsToInsert = allRows.filter(row => {
        const key = `${row.date}|${(row.narration || '').trim().slice(0, 80)}|${row.debit || 0}|${row.credit || 0}`
        const seen = (importCounts.get(key) || 0) + 1
        importCounts.set(key, seen)
        const dbCount = existingMap.get(key) || 0
        return seen > dbCount // only insert if we have more than DB already has
      })

      const skipped = allRows.length - rowsToInsert.length

      if (rowsToInsert.length === 0) {
        toast(true, `All ${allRows.length} transactions already exist — nothing to import`)
        setShowImportPreview(false)
        setImportPreviewRows([])
        setSelectedFile(null)
        return
      }

      const { error } = await supa.from('bank_transactions').insert(rowsToInsert)
      if (error) throw error

      toast(true, `Imported ${rowsToInsert.length} transactions` + (skipped > 0 ? ` (${skipped} duplicates skipped)` : ''))
      setShowImportPreview(false)
      setImportPreviewRows([])
      setSelectedFile(null)
      fetchTransactions()
    } catch (err) {
      toast(false, 'Import failed: ' + (err.message || ''))
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // ── Load vendors/staff for Mode A ─────────────────────────────────────
  const loadMatchVendors = async (source) => {
    setMatchSource(source)
    setMatchVendorId('')
    setMatchPayments([])
    setMatchSelected([])
    try {
      if (source === 'outsource') {
        const { data } = await supa.from('outsource_vendors').select('id, name, type').order('name')
        setMatchVendors(data || [])
      } else if (source === 'fabric') {
        const { data } = await supa.from('fabric_vendors').select('id, name').order('name')
        setMatchVendors(data || [])
      } else if (source === 'salary') {
        // For salary: load staff members as "vendors"
        const { data } = await supa.from('staff_members').select('id, name, designation, department').eq('is_active', true).order('name')
        setMatchVendors((data || []).map(s => ({ id: s.id, name: s.name, type: s.designation || s.department || '' })))
      } else if (source === 'karigar') {
        // For karigar: load karigars as "vendors"
        const { data } = await supa.from('karigars').select('id, name, role, department').eq('is_active', true).order('name')
        setMatchVendors((data || []).map(k => ({ id: k.id, name: k.name, type: k.role || k.department || '' })))
      } else if (source === 'loan') {
        const { data } = await supa.from('loans').select('id, lender_name, loan_type, monthly_emi').eq('status', 'active').order('lender_name')
        setMatchVendors((data || []).map(l => ({ id: l.id, name: l.lender_name, type: `${l.loan_type} • EMI: ${l.monthly_emi}` })))
      } else if (source === 'monthly' || source === 'payment') {
        const { data } = await supa.from('payment_vendors').select('id, name, category, base_amount').or('is_active.is.null,is_active.eq.true').order('name')
        setMatchVendors((data || []).map(v => ({ id: v.id, name: v.name, type: `${v.category} • ₹${v.base_amount}` })))
      } else if (source === 'tax') {
        // Tax payments — skip vendor selection, load ALL unsettled tax payments directly
        setMatchVendors([
          { id: 'all', name: 'All Tax Types', type: '' },
          { id: 'gst', name: 'GST', type: '' },
          { id: 'tds', name: 'TDS', type: '' },
          { id: 'advance_tax', name: 'Advance Tax', type: '' },
          { id: 'compliance', name: 'Compliance', type: '' },
        ])
        // Auto-load all tax payments — pass source explicitly to avoid stale matchSource closure
        loadMatchPayments('all', 'tax')
      } else if (source === 'refund') {
        // Refunds — skip vendor selection, load ALL paid refund_payments directly
        setMatchVendors([{ id: 'all', name: 'All Refunds', type: '' }])
        loadMatchPayments('all', 'refund')
      } else {
        setMatchVendors([])
      }
    } catch (vendorErr) { console.error('Vendor fetch failed:', vendorErr); setMatchVendors([]) }
  }

  // ── Load unsettled payments for selected vendor/staff/karigar ──────────────────
  const loadMatchPayments = async (vendorId, sourceOverride) => {
    const src = sourceOverride || matchSource
    setMatchVendorId(vendorId)
    setMatchSelected([])
    if (!vendorId) { setMatchPayments([]); return }
    setMatchLoading(true)
    try {
      const txn = settleModal
      const txnAmt = txn.debit || txn.credit || 0
      if (src === 'outsource') {
        const { data } = await supa.from('outsource_payments')
          .select('id, amount, tds_amount, date, method, reference')
          .eq('vendor_id', vendorId).eq('settled', false)
          .order('date', { ascending: false }).limit(50)
        setMatchPayments(data || [])
        const match = (data || []).find(p => {
          const net = (p.amount || 0) - (p.tds_amount || 0)
          return Math.abs(net - txnAmt) / txnAmt < 0.05
        })
        if (match) setMatchSelected([match.id])
      } else if (src === 'fabric') {
        const { data } = await supa.from('vendor_payments')
          .select('id, amount, payment_date, payment_mode, reference_number')
          .eq('vendor_id', vendorId).eq('settled', false)
          .order('payment_date', { ascending: false }).limit(50)
        setMatchPayments(data || [])
        const match = (data || []).find(p => Math.abs((p.amount || 0) - txnAmt) / txnAmt < 0.05)
        if (match) setMatchSelected([match.id])
      } else if (src === 'salary') {
        // Load unpaid/unsettled salary entries for this staff member
        const { data } = await supa.from('staff_salary_entries')
          .select('id, net_salary, to_be_processed, period_month, period_year, salary_due_date, payment_status, utr, amount_paid, balance_due')
          .eq('staff_id', vendorId).in('payment_status', ['pending', 'paid', 'partial'])
          .order('salary_due_date', { ascending: false }).limit(24)
        // Normalize to common shape: amount, date
        const normalized = (data || []).map(s => ({
          ...s,
          amount: s.net_salary || s.to_be_processed || 0,
          amount_paid: s.amount_paid || 0,
          balance_due: s.balance_due || s.net_salary || s.to_be_processed || 0,
          date: s.salary_due_date,
          _label: `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][s.period_month - 1]} ${s.period_year}`,
        }))
        setMatchPayments(normalized)
        const match = normalized.find(p => txnAmt > 0 && Math.abs((p.amount || 0) - txnAmt) / txnAmt < 0.05)
        if (match) setMatchSelected([match.id])
      } else if (src === 'karigar') {
        // Load unsettled payroll entries for this karigar
        const { data } = await supa.from('payroll_entries')
          .select('id, base_amount, ot_amount, deductions, net_pay, payment_mode, reference, run_id, amount_paid, balance_due, payroll_runs(period_start, period_end, status)')
          .eq('karigar_id', vendorId).eq('settled', false)
          .order('id', { ascending: false }).limit(24)
        const normalized = (data || []).map(e => ({
          ...e,
          amount: e.net_pay || 0,
          amount_paid: e.amount_paid || 0,
          balance_due: e.balance_due || e.net_pay || 0,
          date: e.payroll_runs?.period_end || null,
          _label: e.payroll_runs ? `${e.payroll_runs.period_start} to ${e.payroll_runs.period_end}` : 'Unknown period',
        }))
        setMatchPayments(normalized)
        const match = normalized.find(p => txnAmt > 0 && Math.abs((p.amount || 0) - txnAmt) / txnAmt < 0.05)
        if (match) setMatchSelected([match.id])
      } else if (src === 'loan') {
        // Load unmatched loan payments for this loan
        const { data } = await supa.from('loan_payments')
          .select('id, amount, date, reference, notes, loan_id, matched')
          .eq('loan_id', vendorId).or('matched.is.null,matched.eq.false')
          .order('date', { ascending: false }).limit(50)
        const normalized = (data || []).map(p => ({
          ...p,
          _label: `EMI — ${fmtDate(p.date)}`,
        }))
        setMatchPayments(normalized)
        const match = normalized.find(p => txnAmt > 0 && Math.abs((p.amount || 0) - txnAmt) / txnAmt < 0.05)
        if (match) setMatchSelected([match.id])
      } else if (src === 'monthly') {
        // Load pending/unpaid payment_entries for this vendor
        const { data } = await supa.from('payment_entries')
          .select('id, vendor_name, category, base_amount, gst_amount, tds_amount, net_payable, period_month, period_year, due_date, payment_status')
          .eq('vendor_id', vendorId).in('payment_status', ['pending', 'paid'])
          .is('bank_txn_id', null)
          .order('due_date', { ascending: false }).limit(24)
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const normalized = (data || []).map(e => ({
          ...e,
          amount: e.net_payable || e.base_amount || 0,
          date: e.due_date,
          _label: `${months[e.period_month - 1]} ${e.period_year} — ₹${(e.net_payable || e.base_amount || 0).toLocaleString('en-IN')}`,
        }))
        setMatchPayments(normalized)
        const match = normalized.find(p => txnAmt > 0 && Math.abs((p.amount || 0) - txnAmt) / txnAmt < 0.05)
        if (match) setMatchSelected([match.id])
      } else if (src === 'payment') {
        // Load unsettled payment invoices for this vendor
        const { data } = await supa.from('payment_invoices')
          .select('id, vendor_id, vendor_name, invoice_number, invoice_date, due_date, category, base_amount, gst_amount, tds_amount, net_payable, amount_paid, balance_due, settled, period_month, period_year, account_id')
          .eq('vendor_id', vendorId).eq('settled', false)
          .order('due_date', { ascending: true }).limit(50)
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const normalized = (data || []).map(inv => ({
          ...inv,
          amount: inv.net_payable || 0,
          amount_paid: inv.amount_paid || 0,
          date: inv.due_date || inv.invoice_date,
          _label: `${inv.invoice_number || 'Invoice'} — ${inv.period_month ? months[inv.period_month - 1] + ' ' + inv.period_year : fmtDate(inv.invoice_date)} — Bal: ₹${(inv.balance_due || inv.net_payable || 0).toLocaleString('en-IN')}`,
        }))
        setMatchPayments(normalized)
        const match = normalized.find(p => txnAmt > 0 && Math.abs((p.balance_due || p.amount || 0) - txnAmt) / txnAmt < 0.05)
        if (match) setMatchSelected([match.id])
      } else if (src === 'tax') {
        // Load unsettled tax_payments, optionally filtered by tax_type
        let query = supa.from('tax_payments')
          .select('id, tax_type, category, period_label, period_month, period_year, amount, due_date, paid_date, challan_ref, settled, amount_paid, balance_due')
          .eq('settled', false)
          .order('due_date', { ascending: true }).limit(50)
        if (vendorId !== 'all') query = query.eq('tax_type', vendorId)
        const { data } = await query
        const typeLabels = { gst: 'GST', tds: 'TDS', advance_tax: 'Advance Tax', compliance: 'Compliance' }
        const normalized = (data || []).map(tp => ({
          ...tp,
          amount: tp.balance_due || tp.amount || 0,
          amount_paid: tp.amount_paid || 0,
          balance_due: tp.balance_due || tp.amount || 0,
          date: tp.due_date,
          _label: `${typeLabels[tp.tax_type] || tp.tax_type} — ${tp.period_label || ''} — Bal: ₹${(tp.balance_due || tp.amount || 0).toLocaleString('en-IN')}`,
        }))
        // Add a "create new" option so user can settle without pre-existing entry
        const taxType = vendorId !== 'all' ? vendorId : 'compliance'
        const createEntry = {
          id: '__tax_create__',
          amount: txnAmt,
          date: txn.date,
          tax_type: taxType,
          _label: `+ Create new ${typeLabels[taxType] || 'Tax'} payment — ₹${txnAmt.toLocaleString('en-IN')}`,
          _isCreate: true,
        }
        setMatchPayments([...normalized, createEntry])
        if (normalized.length > 0) {
          const match = normalized.find(p => txnAmt > 0 && Math.abs((p.balance_due || p.amount || 0) - txnAmt) / txnAmt < 0.05)
          if (match) setMatchSelected([match.id])
        } else {
          setMatchSelected(['__tax_create__'])
        }
      } else if (src === 'refund') {
        // Load paid (not yet settled) refund_payments
        const { data } = await supa.from('refund_payments')
          .select('id, amount, paid_on, customer_name, order_number, refund_method, method, reference, payment_status')
          .eq('payment_status', 'paid')
          .order('paid_on', { ascending: false }).limit(50)
        const normalized = (data || []).map(r => ({
          ...r,
          amount: r.amount || 0,
          date: r.paid_on,
          _label: `${r.order_number || 'Refund'} — ${r.customer_name || ''} — ₹${(r.amount || 0).toLocaleString('en-IN')}`,
        }))
        setMatchPayments(normalized)
        const match = normalized.find(p => txnAmt > 0 && Math.abs((p.amount || 0) - txnAmt) / txnAmt < 0.05)
        if (match) setMatchSelected([match.id])
      }
    } catch (_) { setMatchPayments([]) }
    finally { setMatchLoading(false) }
  }

  // ── Settle Mode A — match existing payment ──────────────────────
  const handleSettleMatch = async () => {
    if (matchSelected.length === 0) { toast(false, 'Select at least one payment to match'); return }
    setSettling(true)
    try {
      const txn = settleModal
      const now = new Date().toISOString()
      const who = window._currentUserEmail || window._currentUserName || 'System'
      const vendorObj = matchVendors.find(v => v.id === matchVendorId)
      const vendorName = vendorObj ? vendorObj.name : 'Unknown'

      // Determine table and source_type based on matchSource
      const SOURCE_CONFIG = {
        outsource: { table: 'outsource_payments', sourceType: 'outsource' },
        fabric: { table: 'vendor_payments', sourceType: 'fabric' },
        salary: { table: 'staff_salary_entries', sourceType: 'salary' },
        karigar: { table: 'payroll_entries', sourceType: 'karigar' },
        loan: { table: 'loan_payments', sourceType: 'emi' },
        monthly: { table: 'payment_entries', sourceType: 'monthly' },
        payment: { table: 'payment_invoices', sourceType: 'payment' },
        tax: { table: 'tax_payments', sourceType: 'tax' },
        refund: { table: 'refund_payments', sourceType: 'refund' },
      }
      const { table, sourceType } = SOURCE_CONFIG[matchSource] || SOURCE_CONFIG.fabric

      // Calculate total matched amount from selected payments
      let totalAmt = 0
      for (const payId of matchSelected) {
        const p = matchPayments.find(mp => mp.id === payId)
        if (p) totalAmt += (p.amount || 0) - (p.tds_amount || 0)
      }

      // Extract UTR / reference from bank narration
      const narr = txn.narration || ''
      const payMode = narr.includes('UPI') ? 'UPI' : narr.includes('NEFT') ? 'NEFT' : narr.includes('RTGS') ? 'RTGS' : narr.includes('IMPS') ? 'IMPS' : 'Other'
      let bankRef = ''
      if (narr.includes('IMPS-')) {
        const m = narr.match(/IMPS-(\d+)/)
        if (m) bankRef = 'IMPS-' + m[1]
      } else if (narr.includes('NEFT')) {
        const m = narr.match(/NEFT[- ](?:DR|CR)?[- ]?(\S+)/)
        if (m) bankRef = m[0].slice(0, 60)
      } else if (narr.includes('UPI-')) {
        const parts = narr.split('-')
        if (parts.length >= 5) bankRef = parts[parts.length - 2]
      } else if (narr.includes('RTGS')) {
        const m = narr.match(/RTGS[- ]?(\S+)/)
        if (m) bankRef = m[0].slice(0, 60)
      }
      if (!bankRef) bankRef = narr.slice(0, 80)

      const bankAmt = txn.debit || txn.credit || 0

      // ── Partial settlement: distribute bank amount across selected payments FIFO ──
      let remainingBank = bankAmt
      for (const payId of matchSelected) {
        const p = matchPayments.find(mp => mp.id === payId)
        if (!p) continue
        const payAmt = (p.amount || 0) - (p.tds_amount || 0)
        const prevPaid = Number(p.amount_paid) || 0
        const outstanding = payAmt - prevPaid
        const settleAmt = Math.min(remainingBank, outstanding)
        const newPaid = prevPaid + settleAmt
        const newBalance = Math.max(0, payAmt - newPaid)
        const isFullySettled = newBalance < 1 // less than ₹1 = fully settled
        remainingBank -= settleAmt

        console.log(`[settle] source=${matchSource} payId=${payId} payAmt=${payAmt} prevPaid=${prevPaid} settleAmt=${settleAmt} newPaid=${newPaid} newBalance=${newBalance} isFullySettled=${isFullySettled}`)

        let updateResult
        if (matchSource === 'outsource') {
          updateResult = await supa.from(table).update({
            settled: isFullySettled, settled_at: isFullySettled ? now : null, settled_by: isFullySettled ? who : null,
            settlement_mode: 'bank', bank_txn_id: txn.id,
            method: payMode, reference: bankRef,
          }).eq('id', payId)
        } else if (matchSource === 'fabric') {
          // Don't overwrite payment_mode — vendor_payments has a CHECK constraint
          // limiting it to bank_transfer/cash/upi/cheque. Store bank ref in reference_number.
          updateResult = await supa.from(table).update({
            settled: isFullySettled, settled_at: isFullySettled ? now : null, settled_by: isFullySettled ? who : null,
            settlement_mode: 'bank', bank_txn_id: txn.id,
            reference_number: bankRef ? `${payMode}: ${bankRef}` : bankRef,
          }).eq('id', payId)
        } else if (matchSource === 'salary') {
          updateResult = await supa.from(table).update({
            payment_status: isFullySettled ? 'settled' : 'partial',
            amount_paid: newPaid, balance_due: newBalance,
            settled_at: isFullySettled ? now : null, bank_txn_id: txn.id,
            paid_date: txn.date, utr: bankRef,
          }).eq('id', payId)
        } else if (matchSource === 'karigar') {
          updateResult = await supa.from(table).update({
            settled: isFullySettled, settled_at: isFullySettled ? now : null, settled_by: isFullySettled ? who : null,
            amount_paid: newPaid, balance_due: newBalance,
            bank_txn_id: txn.id,
            payment_mode: payMode, reference: bankRef,
            paid_date: txn.date, utr: bankRef,
          }).eq('id', payId)
        } else if (matchSource === 'loan') {
          // Update existing loan_payment record (paid → settled with bank txn)
          updateResult = await supa.from('loan_payments').update({
            matched: true,
            bank_txn_id: txn.id,
            method: payMode,
            reference: bankRef,
            notes: `Bank settled: ${narr.slice(0, 120)}`,
          }).eq('id', payId)
        } else if (matchSource === 'monthly') {
          await supa.from('payment_entries').update({
            payment_status: isFullySettled ? 'settled' : 'partial',
            settled_at: isFullySettled ? now : null,
            bank_txn_id: txn.id,
            paid_date: txn.date,
            utr: bankRef,
          }).eq('id', payId)
        } else if (matchSource === 'payment') {
          // New payments module: update invoice partial/full settlement
          updateResult = await supa.from('payment_invoices').update({
            amount_paid: newPaid, balance_due: newBalance,
            settled: isFullySettled,
          }).eq('id', payId)
          // Create a payment_payments record for the settlement
          const ppId = `PAY-BNK-${txn.id.slice(0, 8)}-${payId.slice(0, 8)}`
          await supa.from('payment_payments').upsert({
            id: ppId, vendor_id: p.vendor_id, vendor_name: p.vendor_name,
            date: txn.date, amount: settleAmt, method: payMode, reference: bankRef,
            bank_txn_id: txn.id, settlement_status: 'settled', settled_at: now,
            settled_entries: [{ invoice_id: payId, amount_settled: settleAmt }],
            cutoff_date: txn.date,
          })
        } else if (matchSource === 'tax') {
          if (payId === '__tax_create__') {
            // Create a new tax_payment entry on the fly and settle it
            const taxType = matchVendorId !== 'all' ? matchVendorId : 'compliance'
            const txnDate = new Date(txn.date)
            const periodMonth = txnDate.getMonth() + 1
            const periodYear = txnDate.getFullYear()
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            const { data: newTax, error: taxErr } = await supa.from('tax_payments').insert({
              tax_type: taxType,
              category: taxType === 'gst' ? 'gst_monthly' : taxType,
              period_label: `${months[periodMonth - 1]} ${periodYear}`,
              period_month: periodMonth,
              period_year: periodYear,
              amount: settleAmt,
              due_date: txn.date,
              paid_date: txn.date,
              payment_mode: payMode,
              challan_ref: bankRef,
              settled: true,
              settled_at: now,
              amount_paid: settleAmt,
              balance_due: 0,
              bank_txn_id: txn.id,
            }).select('id').single()
            if (taxErr) throw new Error('Failed to create tax payment: ' + taxErr.message)
            // Override payId for expense_mirror
            matchSelected[matchSelected.indexOf(payId)] = newTax.id
          } else {
            updateResult = await supa.from('tax_payments').update({
              amount_paid: newPaid, balance_due: newBalance,
              settled: isFullySettled, settled_at: isFullySettled ? now : null,
              bank_txn_id: txn.id,
              paid_date: txn.date,
              challan_ref: bankRef,
              payment_mode: payMode,
            }).eq('id', payId)
          }
        } else if (matchSource === 'refund') {
          updateResult = await supa.from('refund_payments').update({
            payment_status: 'settled',
            settled: true,
            settled_at: now,
            bank_txn_id: txn.id,
            reference: bankRef || undefined,
          }).eq('id', payId)
        }

        if (updateResult?.error) {
          console.error(`[settle] Failed to update ${matchSource} entry ${payId}:`, updateResult.error)
          throw new Error(`Failed to update ${matchSource} payment: ${updateResult.error.message}`)
        }
      }

      // Create expense_mirror entry for bank reconciliation
      // Derive account_id from source type for P&L categorization via COA pl_bucket
      const selectedPayment = matchPayments.find(p => matchSelected.includes(p.id))
      const COA_MAP = {
        fabric: '6e499024-b616-4812-964d-c54f99f2b4ee',   // Fabric Costs (cm1_fabric)
        karigar: '8b84a65a-c797-4dca-8ea4-ef7cf61c635b',  // In-House Wages (in_house_wages)
        loan: '818429cf-8974-447b-86da-5332cab96647',      // Loan & EMI (loan_emi)
        refund: '430685fe-00c5-44aa-8093-67d36a5411e0',    // Returns & Refunds (returns_refunds)
      }
      // Outsource: derive from vendor type
      const OUTSOURCE_COA = {
        dye: '39b2ee0c-6ea5-463e-b9a5-0ddd0f53b945',      // Dyeing (cm1_dye)
        dying: '39b2ee0c-6ea5-463e-b9a5-0ddd0f53b945',
        stitch: '52fb93c4-1331-43b1-8060-987c7a6777e4',    // Stitching (cm1_stitch)
        tailor: '52fb93c4-1331-43b1-8060-987c7a6777e4',
        embroid: 'e31eb95b-c5fc-4f8d-a90c-b975274151a8',   // Embroidery (cm1_embroidery)
      }
      // Salary: derive from department
      const SALARY_COA = {
        office: 'c316da8c-375d-4015-b5f4-7d29586a7557',    // Office Staff Salaries (salaries)
        store: 'baf0fb09-875f-4ae1-810d-fb0f85b1cac5',     // Store Staff Salaries (salaries)
      }
      // Tax: derive from tax type (matchVendorId = gst/tds/advance_tax/compliance/all)
      const TAX_COA = {
        gst: '387fcdaf-e4a3-41dc-9ba8-41a0e2f082b6',      // GST Payments (tax_gst)
        tds: '098d4701-8c7d-4043-bcb9-3a87dd40ce2f',      // TDS Deposits (tax_tds)
        advance_tax: 'e05608a3-56c9-4d34-bbe2-91914189093a', // Advance Tax (tax_advance)
        compliance: 'e05608a3-56c9-4d34-bbe2-91914189093a',  // Compliance → Advance Tax bucket
      }

      let mirrorAccountId = null
      if (matchSource === 'payment') {
        // Payment invoices already have account_id from COA selection
        mirrorAccountId = selectedPayment?.account_id || null
      } else if (matchSource === 'outsource') {
        const vType = (vendorObj?.type || '').toLowerCase()
        mirrorAccountId = Object.entries(OUTSOURCE_COA).find(([k]) => vType.includes(k))?.[1] || OUTSOURCE_COA.stitch
      } else if (matchSource === 'salary') {
        const dept = (vendorObj?.type || '').toLowerCase()
        mirrorAccountId = dept.includes('store') ? SALARY_COA.store : SALARY_COA.office
      } else if (matchSource === 'tax') {
        const taxType = (matchVendorId || '').toLowerCase()
        mirrorAccountId = TAX_COA[taxType] || TAX_COA.advance_tax
      } else if (matchSource === 'monthly') {
        // Monthly payments — try to use account_id from the entry if available
        mirrorAccountId = selectedPayment?.account_id || null
      } else {
        mirrorAccountId = COA_MAP[matchSource] || null
      }

      // For refunds, use customer name from the payment record as payee
      const mirrorPayee = matchSource === 'refund'
        ? (selectedPayment?.customer_name || selectedPayment?.order_number || 'Customer Refund')
        : vendorName

      const { data: mirror, error: mirrorErr } = await supa
        .from('expense_mirror')
        .insert({
          source_type: sourceType,
          source_id: matchSource === 'loan' ? matchVendorId : matchSelected.join(','),
          date: txn.date,
          payee: mirrorPayee,
          account_id: mirrorAccountId,
          amount: totalAmt || txn.debit || txn.credit || 0,
          payment_mode: payMode,
          status: 'settled',
          bank_txn_id: txn.id,
          settled_at: now,
          notes: matchSource === 'loan' ? `EMI paid — ${vendorName}` : matchSource === 'refund' ? `Refund settled — ${mirrorPayee}` : `Matched ${matchSelected.length} ${sourceType} payment(s)`,
        })
        .select('id')
        .single()

      if (mirrorErr) console.error('Mirror insert error:', mirrorErr)

      // Mark bank transaction as settled
      await supa.from('bank_transactions').update({
        match_status: 'settled',
        expense_mirror_id: mirror ? mirror.id : null,
        confirmed_at: now
      }).eq('id', txn.id)

      toast(true, matchSource === 'loan' ? `EMI marked paid for ${vendorName}` : matchSource === 'refund' ? `Refund settled — ${mirrorPayee}` : `Matched ${matchSelected.length} payment${matchSelected.length > 1 ? 's' : ''} to bank transaction`)
      setSettleModal(null)
      setMatchSource('')
      setMatchPayments([])
      setMatchSelected([])
      fetchTransactions()
    } catch (err) {
      toast(false, 'Match failed: ' + (err.message || ''))
    } finally { setSettling(false) }
  }

  // ── Settle Mode B — manual COA entry (existing behavior) ────────
  const handleSettle = async () => {
    if (!settleForm.account_id) {
      toast(false, 'Please select an account')
      return
    }
    setSettling(true)
    try {
      const txn = settleModal
      const { data: mirror, error: mirrorErr } = await supa
        .from('expense_mirror')
        .insert({
          source_type: 'bank_import',
          source_id: txn.id,
          date: txn.date,
          payee: txn.narration.slice(0, 200),
          account_id: settleForm.account_id,
          sub_account: settleForm.sub_account || null,
          amount: txn.debit || txn.credit || 0,
          payment_mode: txn.narration.includes('UPI') ? 'UPI' : txn.narration.includes('NEFT') ? 'NEFT' : txn.narration.includes('RTGS') ? 'RTGS' : txn.narration.includes('IMPS') ? 'IMPS' : 'Other',
          status: 'settled',
          bank_txn_id: txn.id,
          settled_at: new Date().toISOString(),
          notes: settleForm.notes || null,
        })
        .select('id')
        .single()

      if (mirrorErr) throw mirrorErr

      await supa
        .from('bank_transactions')
        .update({
          match_status: 'settled',
          expense_mirror_id: mirror.id,
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', txn.id)

      // Post-settle sync: if any source payment records reference this bank txn, mark them settled too
      // This catches cases where a tax_payment or payment_invoice was created first, then settled via Mode B
      const bankAmt = txn.debit || txn.credit || 0
      const postNow = new Date().toISOString()
      await supa.from('tax_payments').update({
        settled: true, settled_at: postNow, amount_paid: bankAmt, balance_due: 0, bank_txn_id: txn.id,
        paid_date: txn.date,
      }).eq('bank_txn_id', txn.id).eq('settled', false)
      // Also match tax_payments by exact amount + date if they don't have bank_txn_id yet
      const { data: candidateTax } = await supa.from('tax_payments')
        .select('id, amount')
        .eq('settled', false).eq('due_date', txn.date)
        .gte('amount', bankAmt * 0.99).lte('amount', bankAmt * 1.01)
        .limit(1)
      if (candidateTax && candidateTax.length === 1) {
        await supa.from('tax_payments').update({
          settled: true, settled_at: postNow, amount_paid: bankAmt, balance_due: 0, bank_txn_id: txn.id,
          paid_date: txn.date,
        }).eq('id', candidateTax[0].id)
      }

      toast(true, 'Transaction settled to P&L')
      setSettleModal(null)
      setSettleForm({ account_id: '', sub_account: '', notes: '' })
      fetchTransactions()
    } catch (err) {
      toast(false, 'Settle failed: ' + (err.message || ''))
      console.error(err)
    } finally {
      setSettling(false)
    }
  }

  // ── Undo settle ───────────────────────────────────────────────────
  const handleUndoSettle = async (txn) => {
    try {
      // Always delete expense_mirror entry if it exists (both Mode A and Mode B)
      if (txn.expense_mirror_id) {
        await supa.from('expense_mirror').delete().eq('id', txn.expense_mirror_id)
      }
      // Also clean up any expense_mirror rows linked via bank_txn_id (safety net)
      await supa.from('expense_mirror').delete().eq('bank_txn_id', txn.id)

      // Un-settle any source payments linked to this bank txn (Mode A entries)
      if (txn.match_status === 'settled' || txn.match_status === 'matched') {
        await supa.from('outsource_payments').update({ settled: false, settled_at: null, settled_by: null, bank_txn_id: null }).eq('bank_txn_id', txn.id)
        await supa.from('vendor_payments').update({ settled: false, settled_at: null, settled_by: null, bank_txn_id: null }).eq('bank_txn_id', txn.id)
        // Loan: reset matched flag (keep the payment record, just unlink from bank)
        await supa.from('loan_payments').update({ matched: false, bank_txn_id: null, method: null, reference: null, notes: null }).eq('bank_txn_id', txn.id)
        // Karigar: reset amount_paid/balance_due
        const { data: karigarEntries } = await supa.from('payroll_entries').select('id, net_pay').eq('bank_txn_id', txn.id)
        for (const ke of (karigarEntries || [])) {
          await supa.from('payroll_entries').update({ settled: false, settled_at: null, settled_by: null, bank_txn_id: null, amount_paid: 0, balance_due: ke.net_pay || 0 }).eq('id', ke.id)
        }
        // Salary: reset amount_paid/balance_due
        const { data: salaryEntries } = await supa.from('staff_salary_entries').select('id, net_salary').eq('bank_txn_id', txn.id)
        for (const se of (salaryEntries || [])) {
          await supa.from('staff_salary_entries').update({ payment_status: 'pending', settled_at: null, bank_txn_id: null, amount_paid: 0, balance_due: se.net_salary || 0 }).eq('id', se.id)
        }
        // Payment invoices: reset
        const { data: payInvs } = await supa.from('payment_invoices').select('id, net_payable').eq('bank_txn_id', txn.id)
        for (const pi of (payInvs || [])) {
          await supa.from('payment_invoices').update({ amount_paid: 0, balance_due: pi.net_payable || 0, settled: false }).eq('id', pi.id)
        }
        // Remove payment_payments records linked to this bank txn
        await supa.from('payment_payments').delete().eq('bank_txn_id', txn.id)
        // Monthly payments
        await supa.from('payment_entries').update({ payment_status: 'pending', settled_at: null, bank_txn_id: null }).eq('bank_txn_id', txn.id)
        // Tax payments
        const { data: taxEntries } = await supa.from('tax_payments').select('id, amount').eq('bank_txn_id', txn.id)
        for (const te of (taxEntries || [])) {
          await supa.from('tax_payments').update({ settled: false, settled_at: null, bank_txn_id: null, amount_paid: 0, balance_due: te.amount || 0, paid_date: null, challan_ref: null, payment_mode: null }).eq('id', te.id)
        }
        // Refund payments: revert from settled → paid
        await supa.from('refund_payments').update({ payment_status: 'paid', settled: false, settled_at: null, bank_txn_id: null }).eq('bank_txn_id', txn.id)
      }
      await supa
        .from('bank_transactions')
        .update({ match_status: 'pending_review', expense_mirror_id: null, confirmed_at: null })
        .eq('id', txn.id)

      toast(true, 'Settlement undone')
      fetchTransactions()
    } catch (err) {
      toast(false, 'Failed to undo: ' + (err.message || ''))
      console.error(err)
    }
  }

  // ── Bulk confirm selected matches ────────────────────
  const handleBulkAutoSettle = async () => {
    const selected = Object.entries(autoSuggestions).filter(([txnId]) => {
      if (!bulkSelected.has(txnId)) return false
      const txn = transactions.find(t => t.id === txnId)
      return txn && txn.match_status !== 'settled' && txn.match_status !== 'matched'
    })
    if (selected.length === 0) { toast(false, 'No transactions selected'); return }
    const confirmed = window.confirm(`Confirm ${selected.length} selected match${selected.length !== 1 ? 'es' : ''}? This will settle them against their matched payments.`)
    if (!confirmed) return

    setSettling(true)
    let settled = 0
    try {
      for (const [txnId, suggestion] of selected) {
        const txn = transactions.find(t => t.id === txnId)
        if (!txn) continue

        const now = new Date().toISOString()
        const who = window._currentUserEmail || window._currentUserName || 'System'
        const narr = txn.narration || ''
        const payMode = narr.includes('UPI') ? 'UPI' : narr.includes('NEFT') ? 'NEFT' : narr.includes('RTGS') ? 'RTGS' : narr.includes('IMPS') ? 'IMPS' : 'Other'
        let bankRef = ''
        if (narr.includes('IMPS-')) { const m = narr.match(/IMPS-(\d+)/); if (m) bankRef = 'IMPS-' + m[1] }
        else if (narr.includes('NEFT')) { const m = narr.match(/NEFT[- ](?:DR|CR)?[- ]?(\S+)/); if (m) bankRef = m[0].slice(0, 60) }
        else if (narr.includes('UPI-')) { const parts = narr.split('-'); if (parts.length >= 5) bankRef = parts[parts.length - 2] }
        else if (narr.includes('RTGS')) { const m = narr.match(/RTGS[- ]?(\S+)/); if (m) bankRef = m[0].slice(0, 60) }
        if (!bankRef) bankRef = narr.slice(0, 80)

        // ── COA auto-match: no source payment, settle directly to P&L ──
        if (suggestion.source === 'coa') {
          const { data: mirror } = await supa.from('expense_mirror').insert({
            source_type: 'bank_import',
            source_id: txn.id,
            date: txn.date,
            narration: narr,
            payee: suggestion.vendorName || 'Expense Account',
            amount: txn.debit || 0,
            payment_mode: payMode,
            status: 'settled',
            bank_txn_id: txn.id,
            account_id: suggestion.accountId || null,
            settled_at: now,
            notes: `COA auto-matched to ${suggestion.vendorName || 'account'} (${suggestion.confidence}% confidence)`,
          }).select('id').single()

          await supa.from('bank_transactions').update({
            match_status: 'settled',
            expense_mirror_id: mirror ? mirror.id : null,
            confirmed_at: now,
          }).eq('id', txn.id)

          settled++
          continue
        }

        const SOURCE_TABLE = { outsource: 'outsource_payments', fabric: 'vendor_payments', salary: 'staff_salary_entries', karigar: 'payroll_entries', loan: 'loan_payments', monthly: 'payment_entries', payment: 'payment_invoices', tax: 'tax_payments' }
        const table = SOURCE_TABLE[suggestion.source]
        if (!table) continue

        // Mark the source payment as settled (with partial settlement support)
        const bankAmt = txn.debit || 0
        if (suggestion.source === 'salary') {
          const payAmt = suggestion.paymentAmount || 0
          const isPartial = bankAmt > 0 && bankAmt < payAmt * 0.98
          await supa.from(table).update({
            payment_status: isPartial ? 'partial' : 'settled',
            amount_paid: isPartial ? bankAmt : payAmt,
            balance_due: isPartial ? payAmt - bankAmt : 0,
            settled_at: isPartial ? null : now, bank_txn_id: txn.id, paid_date: txn.date, utr: bankRef,
          }).eq('id', suggestion.paymentId)
        } else if (suggestion.source === 'karigar') {
          const payAmt = suggestion.paymentAmount || 0
          const isPartial = bankAmt > 0 && bankAmt < payAmt * 0.98
          await supa.from(table).update({
            settled: !isPartial, settled_at: isPartial ? null : now, settled_by: isPartial ? null : who,
            amount_paid: isPartial ? bankAmt : payAmt,
            balance_due: isPartial ? payAmt - bankAmt : 0,
            bank_txn_id: isPartial ? null : txn.id,
            payment_mode: payMode, reference: bankRef, paid_date: txn.date, utr: bankRef,
          }).eq('id', suggestion.paymentId)
        } else if (suggestion.source === 'loan') {
          await supa.from(table).update({ matched: true, bank_txn_id: txn.id }).eq('id', suggestion.paymentId)
        } else if (suggestion.source === 'payment') {
          const payAmt = suggestion.paymentAmount || 0
          const settleAmt = Math.min(bankAmt, payAmt)
          const isPartial = bankAmt > 0 && bankAmt < payAmt * 0.98
          await supa.from(table).update({
            amount_paid: settleAmt, balance_due: Math.max(0, payAmt - settleAmt),
            settled: !isPartial,
          }).eq('id', suggestion.paymentId)
        } else if (suggestion.source === 'tax') {
          const payAmt = suggestion.paymentAmount || 0
          const settleAmt = Math.min(bankAmt, payAmt)
          const isPartial = bankAmt > 0 && bankAmt < payAmt * 0.98
          await supa.from(table).update({
            amount_paid: settleAmt, balance_due: Math.max(0, payAmt - settleAmt),
            settled: !isPartial, settled_at: isPartial ? null : now,
            bank_txn_id: txn.id, paid_date: txn.date, challan_ref: bankRef, payment_mode: payMode,
          }).eq('id', suggestion.paymentId)
        } else {
          await supa.from(table).update({ settled: true, settled_at: now, settled_by: who, settlement_mode: 'bank', bank_txn_id: txn.id }).eq('id', suggestion.paymentId)
        }

        // Derive account_id for P&L categorization
        const BULK_COA = {
          fabric: '6e499024-b616-4812-964d-c54f99f2b4ee',
          karigar: '8b84a65a-c797-4dca-8ea4-ef7cf61c635b',
          loan: '818429cf-8974-447b-86da-5332cab96647',
        }
        const BULK_OUTSOURCE_COA = { dye: '39b2ee0c-6ea5-463e-b9a5-0ddd0f53b945', dying: '39b2ee0c-6ea5-463e-b9a5-0ddd0f53b945', stitch: '52fb93c4-1331-43b1-8060-987c7a6777e4', tailor: '52fb93c4-1331-43b1-8060-987c7a6777e4', embroid: 'e31eb95b-c5fc-4f8d-a90c-b975274151a8' }
        const BULK_TAX_COA = { gst: '387fcdaf-e4a3-41dc-9ba8-41a0e2f082b6', tds: '098d4701-8c7d-4043-bcb9-3a87dd40ce2f', advance_tax: 'e05608a3-56c9-4d34-bbe2-91914189093a', compliance: 'e05608a3-56c9-4d34-bbe2-91914189093a' }

        let bulkAccountId = null
        if (suggestion.source === 'outsource') {
          const vt = (suggestion.vendorType || '').toLowerCase()
          bulkAccountId = Object.entries(BULK_OUTSOURCE_COA).find(([k]) => vt.includes(k))?.[1] || BULK_OUTSOURCE_COA.stitch
        } else if (suggestion.source === 'salary') {
          bulkAccountId = (suggestion.department || '').toLowerCase().includes('store') ? 'baf0fb09-875f-4ae1-810d-fb0f85b1cac5' : 'c316da8c-375d-4015-b5f4-7d29586a7557'
        } else if (suggestion.source === 'tax') {
          const tt = (suggestion.vendorId || '').toLowerCase()
          bulkAccountId = BULK_TAX_COA[tt] || BULK_TAX_COA.advance_tax
        } else {
          bulkAccountId = BULK_COA[suggestion.source] || null
        }

        // Create expense_mirror entry with COA for P&L
        const { data: mirror } = await supa.from('expense_mirror').insert({
          source_type: suggestion.sourceType,
          source_id: String(suggestion.paymentId),
          date: txn.date,
          payee: suggestion.vendorName || 'Unknown',
          account_id: bulkAccountId,
          amount: txn.debit || 0,
          payment_mode: payMode,
          status: 'settled',
          bank_txn_id: txn.id,
          settled_at: now,
          notes: `Auto-matched (${suggestion.confidence}% confidence)`,
        }).select('id').single()

        // Mark bank txn as settled
        await supa.from('bank_transactions').update({
          match_status: 'settled',
          expense_mirror_id: mirror ? mirror.id : null,
          confirmed_at: now,
        }).eq('id', txn.id)

        settled++
      }
      toast(true, `Auto-settled ${settled} transaction${settled !== 1 ? 's' : ''}`)
      fetchTransactions()
    } catch (err) {
      toast(false, 'Bulk auto-settle failed: ' + (err.message || ''))
      console.error(err)
    } finally {
      setSettling(false)
    }
  }

  // ── Open settle modal with auto-suggestion pre-populated ──────────
  const openSuggestedSettle = async (txn, suggestion) => {
    setSettleModal(txn)

    // ── COA suggestion → open Mode B (manual COA) with pre-populated account ──
    if (suggestion.source === 'coa') {
      setSettleMode('manual')
      setSettleForm({
        account_id: suggestion.accountId || '',
        sub_account: '',
        notes: `COA auto-matched: ${suggestion.vendorName || 'account'} (${suggestion.confidence}% confidence)`,
      })
      return
    }

    setSettleMode('match')
    setSettleForm({ account_id: '', sub_account: '', notes: '' })
    setMatchSelected([])
    setMatchPayments([])
    setMatchVendorId('')
    setMatchSource(suggestion.source)

    // Step 1: Load vendors for this source
    try {
      let vendors = []
      if (suggestion.source === 'outsource') {
        const { data } = await supa.from('outsource_vendors').select('id, name, type').order('name')
        vendors = data || []
      } else if (suggestion.source === 'fabric') {
        const { data } = await supa.from('fabric_vendors').select('id, name').order('name')
        vendors = data || []
      } else if (suggestion.source === 'salary') {
        const { data } = await supa.from('staff_members').select('id, name, designation, department').eq('is_active', true).order('name')
        vendors = (data || []).map(s => ({ id: s.id, name: s.name, type: s.designation || s.department || '' }))
      } else if (suggestion.source === 'karigar') {
        const { data } = await supa.from('karigars').select('id, name, role, department').eq('is_active', true).order('name')
        vendors = (data || []).map(k => ({ id: k.id, name: k.name, type: k.role || k.department || '' }))
      } else if (suggestion.source === 'loan') {
        const { data } = await supa.from('loans').select('id, lender_name, loan_type, monthly_emi').eq('status', 'active').order('lender_name')
        vendors = (data || []).map(l => ({ id: l.id, name: l.lender_name, type: `${l.loan_type} • EMI: ${l.monthly_emi}` }))
      }
      setMatchVendors(vendors)

      // Step 2: Find the vendor that matches the suggestion
      const vendorId = suggestion.vendorId
      if (vendorId) {
        setMatchVendorId(vendorId)

        // Step 3: Load payments for this vendor and pre-select the matched payment
        setMatchLoading(true)
        const txnAmt = txn.debit || txn.credit || 0
        let payments = []
        if (suggestion.source === 'outsource') {
          const { data } = await supa.from('outsource_payments')
            .select('id, amount, tds_amount, date, method, reference')
            .eq('vendor_id', vendorId).eq('settled', false)
            .order('date', { ascending: false }).limit(50)
          payments = data || []
        } else if (suggestion.source === 'fabric') {
          const { data } = await supa.from('vendor_payments')
            .select('id, amount, payment_date, payment_mode, reference_number')
            .eq('vendor_id', vendorId).eq('settled', false)
            .order('payment_date', { ascending: false }).limit(50)
          payments = data || []
        } else if (suggestion.source === 'salary') {
          const { data } = await supa.from('staff_salary_entries')
            .select('id, net_salary, to_be_processed, period_month, period_year, salary_due_date, payment_status, utr, amount_paid, balance_due')
            .eq('staff_id', vendorId).in('payment_status', ['pending', 'paid', 'partial'])
            .order('salary_due_date', { ascending: false }).limit(24)
          payments = (data || []).map(s => ({
            ...s, amount: s.net_salary || s.to_be_processed || 0,
            amount_paid: s.amount_paid || 0, balance_due: s.balance_due || s.net_salary || s.to_be_processed || 0,
            date: s.salary_due_date,
            _label: `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][s.period_month - 1]} ${s.period_year}`,
          }))
        } else if (suggestion.source === 'karigar') {
          const { data } = await supa.from('payroll_entries')
            .select('id, base_amount, ot_amount, deductions, net_pay, payment_mode, reference, run_id, amount_paid, balance_due, payroll_runs(period_start, period_end, status)')
            .eq('karigar_id', vendorId).eq('settled', false)
            .order('id', { ascending: false }).limit(24)
          payments = (data || []).map(e => ({
            ...e, amount: e.net_pay || 0,
            amount_paid: e.amount_paid || 0, balance_due: e.balance_due || e.net_pay || 0,
            date: e.payroll_runs?.period_end || null,
            _label: e.payroll_runs ? `${e.payroll_runs.period_start} to ${e.payroll_runs.period_end}` : 'Unknown period',
          }))
        } else if (suggestion.source === 'loan') {
          const { data } = await supa.from('loan_payments')
            .select('id, amount, date, reference, notes, loan_id, matched')
            .eq('loan_id', vendorId).or('matched.is.null,matched.eq.false')
            .order('date', { ascending: false }).limit(50)
          payments = (data || []).map(p => ({
            ...p,
            _label: `EMI ${fmtDate(p.date)}`,
          }))
        }
        setMatchPayments(payments)
        setMatchLoading(false)

        // Step 4: Pre-select the specific payment from the suggestion
        if (suggestion.paymentId) {
          const found = payments.find(p => p.id === suggestion.paymentId)
          if (found) setMatchSelected([suggestion.paymentId])
        }
        // Fallback: auto-select best amount match
        if (!suggestion.paymentId || !payments.find(p => p.id === suggestion.paymentId)) {
          const best = payments.find(p => {
            const pAmt = suggestion.source === 'outsource' ? ((p.amount || 0) - (p.tds_amount || 0)) : (p.amount || 0)
            return txnAmt > 0 && Math.abs(pAmt - txnAmt) / txnAmt < 0.05
          })
          if (best) setMatchSelected([best.id])
        }
      }
    } catch (err) {
      console.error('Error pre-populating suggested match:', err)
    }
  }

  // ── Filtered transactions ─────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...transactions]
    if (startDate) list = list.filter(t => t.date >= startDate)
    if (endDate) list = list.filter(t => t.date <= endDate)
    if (filterStatus === 'settled') list = list.filter(t => t.match_status === 'settled' || t.match_status === 'matched')
    if (filterStatus === 'unmatched') list = list.filter(t => t.match_status !== 'settled' && t.match_status !== 'matched')
    if (filterStatus === 'suggested') list = list.filter(t => autoSuggestions[t.id] && t.match_status !== 'settled' && t.match_status !== 'matched')
    if (filterType === 'expense') list = list.filter(t => t.debit > 0)
    if (filterType === 'deposit') list = list.filter(t => t.credit > 0)
    if (filterTag) {
      list = list.filter(t => {
        const { tag } = autoTag(t.narration)
        return tag === filterTag
      })
    }
    // Sort: suggested matches first (by confidence desc), then by date ascending
    list.sort((a, b) => {
      const aSug = autoSuggestions[a.id]
      const bSug = autoSuggestions[b.id]
      const aHas = aSug && a.match_status !== 'settled' && a.match_status !== 'matched'
      const bHas = bSug && b.match_status !== 'settled' && b.match_status !== 'matched'
      if (aHas && !bHas) return -1
      if (!aHas && bHas) return 1
      if (aHas && bHas) return (bSug.confidence - aSug.confidence)
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    })
    return list
  }, [transactions, startDate, endDate, filterStatus, filterType, filterTag, autoSuggestions])

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [startDate, endDate, filterStatus, filterType, filterTag])

  // Paginated slice of filtered
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginatedTxns = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, currentPage])

  // ── Summary ───────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalDebits = filtered.reduce((s, t) => s + (t.debit || 0), 0)
    const totalCredits = filtered.reduce((s, t) => s + (t.credit || 0), 0)
    const settledCount = filtered.filter(t => t.match_status === 'settled' || t.match_status === 'matched').length
    const pendingCount = filtered.filter(t => t.match_status === 'pending_review').length
    const totalCount = filtered.length
    const depositCount = filtered.filter(t => t.credit > 0).length
    const expenseCount = filtered.filter(t => t.debit > 0).length
    const openBal = filtered.length > 0 ? (filtered[0].balance || 0) : 0
    const closeBal = filtered.length > 0 ? (filtered[filtered.length - 1].balance || 0) : 0
    return { totalDebits, totalCredits, settledCount, pendingCount, totalCount, depositCount, expenseCount, openBal, closeBal }
  }, [filtered])

  // ── Grouped accounts for settle dropdown ──────────────────────────
  const parentAccounts = accounts.filter(a => !a.parent_id)
  const childAccounts = (pid) => accounts.filter(a => a.parent_id === pid)

  // Count selected suggestions for bulk confirm button
  const bulkSelectedCount = useMemo(() => {
    return [...bulkSelected].filter(txnId => {
      const txn = transactions.find(t => t.id === txnId)
      return txn && autoSuggestions[txnId] && txn.match_status !== 'settled' && txn.match_status !== 'matched'
    }).length
  }, [bulkSelected, autoSuggestions, transactions])

  const hasSuggestions = Object.keys(autoSuggestions).length > 0

  // All unique auto-tags in current data (for filter dropdown)
  const allTags = useMemo(() => {
    const tags = new Set()
    transactions.forEach(t => { tags.add(autoTag(t.narration).tag) })
    return [...tags].sort()
  }, [transactions])

  const inputStyle = {
    padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem',
    border: `1px solid ${C.border}`,
    fontSize: '0.8125rem',
    fontFamily: 'Inter,sans-serif',
    background: C.bg,
    color: C.text,
  }

  return (
    <div className="space-y-5" style={{ fontFamily: 'Manrope, sans-serif' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: C.text }}>Bank Statement</h2>
        <select
          value={selectedAccountId || ''}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          style={{ ...inputStyle, fontWeight: 600, minWidth: '200px' }}
        >
          <option value="">Select Account</option>
          {bankAccounts.map(acc => (
            <option key={acc.id} value={acc.id}>{acc.name} — {acc.account_no}</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      {selectedAccountId && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Opening Bal', val: fmtCurrency(summary.openBal), color: C.gold },
            { label: 'Total Debits', val: fmtCurrency(summary.totalDebits), color: C.red },
            { label: 'Total Credits', val: fmtCurrency(summary.totalCredits), color: C.green },
            { label: 'Closing Bal', val: fmtCurrency(summary.closeBal), color: C.gold },
            { label: 'Unsettled', val: summary.unmatched, color: C.amber },
          ].map(card => (
            <div key={card.label} className="rounded-2xl p-3" style={{ background: C.cardBg, borderLeft: `4px solid ${card.color}` }}>
              <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.375rem' }}>{card.label}</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: card.color }}>{card.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Import Section */}
      <div className="rounded-2xl p-4" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: C.text, marginBottom: '0.25rem' }}>
              Import Bank Statement
            </div>
            <div style={{ fontSize: '0.75rem', color: C.textMuted }}>
              Supports HDFC XLS/XLSX exports and CSV files
            </div>
          </div>
          <label
            style={{
              background: C.gold, color: '#fff', padding: '0.625rem 1rem', borderRadius: '0.5rem',
              fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0,
            }}
          >
            Choose File
            <input type="file" accept=".xls,.xlsx,.csv" onChange={handleFileSelect} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {/* Filters */}
      {selectedAccountId && transactions.length > 0 && (
        <div className="rounded-2xl p-3 flex flex-col sm:flex-row gap-3 flex-wrap" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
          <div>
            <label style={{ fontSize: '0.6875rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '0.6875rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: '0.6875rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>Status</label>
            <select value={filterStatus} onChange={e => {
              const v = e.target.value
              setFilterStatus(v)
              if (v === 'unmatched') {
                // Show ALL unsettled — clear date range
                setStartDate('')
                setEndDate('')
              } else if (!startDate && !endDate) {
                // Switching away from unsettled with no dates — default to current month
                const d = new Date()
                setStartDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
                const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
                setEndDate(`${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`)
              }
            }} style={inputStyle}>
              <option value="">All</option>
              <option value="unmatched">Unsettled</option>
              <option value="settled">Settled</option>
              {Object.keys(autoSuggestions).length > 0 && (
                <option value="suggested">Suggested ({Object.keys(autoSuggestions).length})</option>
              )}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.6875rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>Type</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={inputStyle}>
              <option value="">All</option>
              <option value="expense">Expense (Debit)</option>
              <option value="deposit">Deposit (Credit)</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.6875rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>Category</label>
            <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={inputStyle}>
              <option value="">All</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={() => { setStartDate(''); setEndDate(''); setFilterStatus(''); setFilterType('expense'); setFilterTag('') }}
              style={{ ...inputStyle, cursor: 'pointer', fontWeight: 600 }}>Clear</button>
            <button onClick={() => runAutoMatch(transactions)} disabled={loading}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: '0.8125rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ display: 'inline-block', width: 14, height: 14 }}>↻</span> Re-match
            </button>
            {bulkSelectedCount > 0 && (
              <button onClick={handleBulkAutoSettle} disabled={settling}
                style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: 'none', background: '#16a34a', color: '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: settling ? 'not-allowed' : 'pointer', opacity: settling ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                {settling ? 'Settling...' : `✓ Confirm Selected (${bulkSelectedCount})`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Counts Summary */}
      {selectedAccountId && !loading && transactions.length > 0 && (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.8125rem', color: C.textMuted, marginBottom: '0.75rem', padding: '0 0.25rem' }}>
          <span><b style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>{summary.pendingCount}</b> pending</span>
          <span><b style={{ color: '#16a34a', fontFamily: 'JetBrains Mono, monospace' }}>{summary.settledCount}</b> settled</span>
          {Object.keys(autoSuggestions).length > 0 && (
            <span onClick={() => setFilterStatus('suggested')} style={{ cursor: 'pointer' }}>
              <b style={{ color: '#2563eb', fontFamily: 'JetBrains Mono, monospace' }}>{Object.keys(autoSuggestions).length}</b>{' '}
              <span style={{ color: '#2563eb', textDecoration: 'underline' }}>suggested</span>
            </span>
          )}
          <span style={{ color: C.textLight }}>of <b style={{ fontFamily: 'JetBrains Mono, monospace' }}>{summary.totalCount}</b> total</span>
          <span style={{ marginLeft: 'auto' }}>
            <span style={{ color: C.red }}>↓ {fmtCurrency(summary.totalDebits)}</span>
            {' · '}
            <span style={{ color: '#16a34a' }}>↑ {fmtCurrency(summary.totalCredits)}</span>
          </span>
        </div>
      )}

      {/* Transactions Table */}
      {selectedAccountId && (
        <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
          {loading ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: C.textMuted }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: C.textMuted }}>
              {transactions.length === 0 ? 'No transactions — import a bank statement to get started' : 'No transactions match filters'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                    {hasSuggestions && (
                      <th style={{ padding: '0.75rem', width: '32px' }}>
                        <input type="checkbox"
                          checked={bulkSelectedCount > 0 && bulkSelectedCount === Object.entries(autoSuggestions).filter(([id]) => { const t = transactions.find(x => x.id === id); return t && t.match_status !== 'settled' && t.match_status !== 'matched' }).length}
                          onChange={e => {
                            if (e.target.checked) {
                              setBulkSelected(new Set(Object.keys(autoSuggestions).filter(id => { const t = transactions.find(x => x.id === id); return t && t.match_status !== 'settled' && t.match_status !== 'matched' })))
                            } else {
                              setBulkSelected(new Set())
                            }
                          }}
                          style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                      </th>
                    )}
                    {['Date', 'Narration', 'Category', 'Debit', 'Credit', 'Match Amt', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '0.75rem', textAlign: h === 'Debit' || h === 'Credit' || h === 'Match Amt' ? 'right' : 'left', color: C.textMuted, fontWeight: 500, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedTxns.map((txn) => {
                    const { tag } = autoTag(txn.narration)
                    const isSettled = txn.match_status === 'settled' || txn.match_status === 'matched'
                    return (
                      <tr key={txn.id} style={{ borderBottom: `1px solid ${C.borderLight}`, background: isSettled ? 'rgba(22,163,74,0.04)' : bulkSelected.has(txn.id) ? 'rgba(22,163,74,0.06)' : 'transparent' }}>
                        {hasSuggestions && (
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                            {!isSettled && autoSuggestions[txn.id] ? (
                              <input type="checkbox"
                                checked={bulkSelected.has(txn.id)}
                                onChange={e => {
                                  const next = new Set(bulkSelected)
                                  if (e.target.checked) next.add(txn.id); else next.delete(txn.id)
                                  setBulkSelected(next)
                                }}
                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                              />
                            ) : null}
                          </td>
                        )}
                        <td style={{ padding: '0.75rem', color: C.text, whiteSpace: 'nowrap' }}>{fmtDate(txn.date)}</td>
                        <td style={{ padding: '0.75rem', color: C.text, maxWidth: '280px' }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={txn.narration}>
                            {txn.narration}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: '1rem', fontWeight: 600, background: tag === 'Loan EMI' ? C.purpleBg : tag === 'Salary' ? C.blueBg : tag === 'Fabric' ? C.amberBg : tag === 'Tax Payment' ? C.redBg : tag === 'Rent' ? 'rgba(15,23,42,0.08)' : 'rgba(107,114,128,0.08)', color: tag === 'Loan EMI' ? C.purple : tag === 'Salary' ? C.blue : tag === 'Fabric' ? C.amber : tag === 'Tax Payment' ? C.red : tag === 'Rent' ? C.navy : '#6b7280' }}>
                            {tag}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: C.red, fontWeight: 600 }}>
                          {txn.debit ? fmtCurrency(txn.debit) : '—'}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', color: C.green, fontWeight: 600 }}>
                          {txn.credit ? fmtCurrency(txn.credit) : '—'}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 500 }}>
                          {!isSettled && autoSuggestions[txn.id] ? (
                            <span style={{ color: Math.abs((autoSuggestions[txn.id].paymentAmount || 0) - (txn.debit || 0)) < 1 ? '#16a34a' : '#2563eb', fontWeight: 600 }}>
                              {fmtCurrency(autoSuggestions[txn.id].paymentAmount || 0)}
                            </span>
                          ) : (
                            <span style={{ color: C.textLight }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          {isSettled ? (
                            <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: '1rem', background: C.greenBg, color: C.green, fontWeight: 600 }}>
                              Settled
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.6875rem', padding: '0.125rem 0.5rem', borderRadius: '1rem', background: 'rgba(217,119,6,0.08)', color: C.amber, fontWeight: 600 }}>Pending</span>
                          )}
                          {/* Auto-match suggestion badge — always show with confidence % */}
                          {!isSettled && autoSuggestions[txn.id] && (
                            <span style={{ display: 'inline-block', marginLeft: '0.375rem', fontSize: '0.625rem', padding: '0.125rem 0.5rem', borderRadius: '1rem', fontWeight: 600, background: autoSuggestions[txn.id].confidence >= 80 ? 'rgba(22,163,74,0.12)' : autoSuggestions[txn.id].confidence >= 50 ? 'rgba(59,130,246,0.12)' : 'rgba(217,119,6,0.12)', color: autoSuggestions[txn.id].confidence >= 80 ? '#16a34a' : autoSuggestions[txn.id].confidence >= 50 ? '#2563eb' : '#d97706' }}>
                              Suggested: {autoSuggestions[txn.id].vendorName} ({autoSuggestions[txn.id].confidence}%)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          {isSettled ? (
                            <button onClick={() => handleUndoSettle(txn)} style={{ fontSize: '0.6875rem', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', color: C.textMuted }}>Undo</button>
                          ) : txn.debit ? (
                            autoSuggestions[txn.id] ? (
                              <div style={{ display: 'flex', gap: '0.375rem' }}>
                                <button onClick={() => openSuggestedSettle(txn, autoSuggestions[txn.id])} style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: 'none', background: autoSuggestions[txn.id].confidence >= 80 ? '#16a34a' : '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Confirm</button>
                                <button onClick={() => { setSettleModal(txn); setSettleMode('match'); setSettleForm({ account_id: '', sub_account: '', notes: '' }); setMatchSource(''); setMatchVendorId(''); setMatchPayments([]); setMatchSelected([]) }} style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontWeight: 600, color: C.textMuted }}>Settle</button>
                              </div>
                            ) : (
                              <button onClick={() => { setSettleModal(txn); setSettleMode('match'); setSettleForm({ account_id: '', sub_account: '', notes: '' }); setMatchSource(''); setMatchVendorId(''); setMatchPayments([]); setMatchSelected([]) }} style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: 'none', background: C.gold, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Settle</button>
                            )
                          ) : (
                            <span style={{ fontSize: '0.625rem', color: C.textLight }}>Deposit</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderTop: `1px solid ${C.border}`, fontSize: '0.8125rem' }}>
              <span style={{ color: C.textMuted }}>
                Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                <button disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} style={{ padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: `1px solid ${C.border}`, background: currentPage <= 1 ? C.bg : '#fff', cursor: currentPage <= 1 ? 'default' : 'pointer', color: currentPage <= 1 ? C.textLight : C.text, fontWeight: 500, fontSize: '0.75rem' }}>← Prev</button>
                <span style={{ color: C.text, fontWeight: 600, minWidth: '5rem', textAlign: 'center' }}>Page {currentPage} / {totalPages}</span>
                <button disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} style={{ padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: `1px solid ${C.border}`, background: currentPage >= totalPages ? C.bg : '#fff', cursor: currentPage >= totalPages ? 'default' : 'pointer', color: currentPage >= totalPages ? C.textLight : C.text, fontWeight: 500, fontSize: '0.75rem' }}>Next →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
         IMPORT PREVIEW MODAL
         ═══════════════════════════════════════════════════════════════════ */}
      {showImportPreview && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => setShowImportPreview(false)}>
          <div className="rounded-2xl" style={{ background: C.cardBg, padding: '1.5rem', maxWidth: '900px', maxHeight: '80vh', overflow: 'auto', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: C.text }}>
                  Import Preview — {importPreviewRows.length} transactions
                </h2>
                {selectedFile && <div style={{ fontSize: '0.75rem', color: C.textMuted, marginTop: '0.25rem' }}>{selectedFile.name}</div>}
              </div>
            </div>

            <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Date', 'Narration', 'Auto Tag', 'Debit', 'Credit', 'Balance'].map(h => (
                      <th key={h} style={{ padding: '0.5rem', textAlign: h === 'Debit' || h === 'Credit' || h === 'Balance' ? 'right' : 'left', color: C.textMuted, fontSize: '0.75rem' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importPreviewRows.map((row, idx) => {
                    const { tag } = autoTag(row.narration)
                    return (
                      <tr key={idx} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                        <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</td>
                        <td style={{ padding: '0.5rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.narration}>{row.narration}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{ fontSize: '0.625rem', padding: '0.125rem 0.375rem', borderRadius: '1rem', background: 'rgba(107,114,128,0.08)', fontWeight: 600 }}>{tag}</span>
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', color: C.red }}>{row.debit ? fmtCurrency(row.debit) : '—'}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', color: C.green }}>{row.credit ? fmtCurrency(row.credit) : '—'}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right' }}>{row.balance != null ? fmtCurrency(row.balance) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowImportPreview(false); setImportPreviewRows([]); setSelectedFile(null) }}
                style={{ padding: '0.625rem 1rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, background: 'transparent', color: C.text, cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={confirmImport} disabled={loading}
                style={{ padding: '0.625rem 1rem', borderRadius: '0.5rem', background: C.gold, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', fontWeight: 600, opacity: loading ? 0.6 : 1, border: 'none' }}>
                {loading ? 'Importing...' : `Import ${importPreviewRows.length} Transactions`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
         SETTLE MODAL — Two modes: Match Existing Payment / Manual COA
         ═══════════════════════════════════════════════════════════════════ */}
      {settleModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }} onClick={() => { setSettleModal(null); setSettleMode('match'); setMatchSource(''); setMatchPayments([]); setMatchSelected([]); }}>
          <div className="rounded-2xl" style={{ background: C.cardBg, padding: '1.5rem', maxWidth: '600px', width: '95%', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: C.text, marginBottom: '0.5rem' }}>Settle Bank Transaction</h3>

            {/* Transaction summary */}
            <div className="rounded-xl p-3 mb-4" style={{ background: C.bg }}>
              <div className="flex justify-between items-start">
                <div>
                  <div style={{ fontSize: '0.75rem', color: C.textMuted }}>{fmtDate(settleModal.date)}</div>
                  <div style={{ fontSize: '0.8125rem', color: C.text, marginTop: '0.25rem', fontWeight: 500 }}>{settleModal.narration}</div>
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: C.red, whiteSpace: 'nowrap', marginLeft: '1rem' }}>{fmtCurrency(settleModal.debit || settleModal.credit)}</div>
              </div>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-2 mb-4">
              <button onClick={() => setSettleMode('match')} className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                style={{ background: settleMode === 'match' ? C.gold : C.bg, color: settleMode === 'match' ? '#fff' : C.text, border: `1px solid ${settleMode === 'match' ? C.gold : C.border}` }}>
                Match Existing Payment
              </button>
              <button onClick={() => setSettleMode('manual')} className="flex-1 py-2 rounded-lg text-xs font-bold transition-all"
                style={{ background: settleMode === 'manual' ? C.gold : C.bg, color: settleMode === 'manual' ? '#fff' : C.text, border: `1px solid ${settleMode === 'manual' ? C.gold : C.border}` }}>
                Manual — Chart of Accounts
              </button>
            </div>

            {/* ── MODE A: Match Existing Payment ────────────────────────── */}
            {settleMode === 'match' && (
              <div>
                {/* Source type */}
                <div className="mb-3">
                  <label style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#4e4636', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>Payment Source</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {[
                      { key: 'outsource', label: 'Outsource', color: '#7c3aed' },
                      { key: 'fabric', label: 'Fabric', color: '#3b82f6' },
                      { key: 'salary', label: 'Staff Salary', color: '#059669' },
                      { key: 'karigar', label: 'Karigar', color: '#ea580c' },
                      { key: 'loan', label: 'Loan EMI', color: '#7c3aed' },
                      { key: 'payment', label: 'Payments', color: '#d97706' },
                      { key: 'tax', label: 'Tax', color: '#dc2626' },
                      { key: 'refund', label: 'Refund', color: '#f59e0b' },
                    ].map(s => (
                      <button key={s.key} onClick={() => loadMatchVendors(s.key)}
                        className="py-2 px-3 rounded-lg text-xs font-bold transition-all"
                        style={{ flex: '1 1 calc(33.333% - 0.5rem)', minWidth: '100px', background: matchSource === s.key ? s.color + '18' : C.bg,
                          color: matchSource === s.key ? s.color : C.textMuted,
                          border: `1px solid ${matchSource === s.key ? s.color + '4D' : C.border}` }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Vendor dropdown */}
                {matchSource && (
                  <div className="mb-3">
                    <label style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#4e4636', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>
                      {matchSource === 'salary' ? 'Select Employee' : matchSource === 'karigar' ? 'Select Karigar' : matchSource === 'loan' ? 'Select Loan' : matchSource === 'tax' ? 'Select Tax Type' : matchSource === 'refund' ? 'Refund Payments' : matchSource === 'payment' ? 'Select Vendor' : 'Select Vendor'}
                    </label>
                    <select value={matchVendorId} onChange={e => loadMatchPayments(e.target.value)}
                      style={{ width: '100%', padding: '0.625rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, fontSize: '0.8125rem', fontFamily: 'Inter,sans-serif' }}>
                      <option value="">— Select vendor —</option>
                      {matchVendors.map(v => (
                        <option key={v.id} value={v.id}>{v.name}{v.type ? ` (${v.type})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Unsettled payments list */}
                {matchVendorId && (
                  <div className="mb-4">
                    <label style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#4e4636', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>
                      {`Unsettled Payments (${matchPayments.length})`}
                    </label>
                    {matchLoading && <div className="text-xs py-3 text-center" style={{ color: C.textMuted }}>Loading payments…</div>}
                    {!matchLoading && matchPayments.length === 0 && (
                      <div className="text-xs py-3 text-center rounded-lg" style={{ background: C.bg, color: C.textMuted }}>
                        No unsettled payments found for this vendor
                      </div>
                    )}
                    {!matchLoading && matchPayments.length > 0 && (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {matchPayments.map(p => {
                          const isSelected = matchSelected.includes(p.id)
                          const totalAmt = matchSource === 'outsource' ? ((p.amount || 0) - (p.tds_amount || 0)) : (p.amount || 0)
                          const pendingAmt = (p.balance_due > 0 && p.balance_due < totalAmt) ? p.balance_due : totalAmt
                          const hasPartial = p.balance_due > 0 && p.balance_due < totalAmt
                          const pDate = p.date || p.payment_date
                          const pRef = p.reference || p.reference_number || ''
                          const pMode = p.method || p.payment_mode || ''
                          return (
                            <div key={p.id} onClick={() => {
                              setMatchSelected(prev => isSelected ? prev.filter(x => x !== p.id) : [...prev, p.id])
                            }}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
                              style={{ background: isSelected ? 'rgba(22,163,74,0.08)' : '#fff', border: `1.5px solid ${isSelected ? '#16a34a' : C.border}` }}>
                              <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSelected ? '#16a34a' : '#d1d5db'}`, background: isSelected ? '#16a34a' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {isSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {hasPartial ? (
                                    <>
                                      <span className="text-xs font-bold" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#d97706' }}>Pending {fmtCurrency(pendingAmt)}</span>
                                      <span className="text-[10px]" style={{ color: C.textMuted }}>of {fmtCurrency(totalAmt)}</span>
                                    </>
                                  ) : (
                                    <span className="text-xs font-bold" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#1b1c1a' }}>{fmtCurrency(totalAmt)}</span>
                                  )}
                                  {matchSource === 'outsource' && p.tds_amount > 0 && (
                                    <span className="text-[10px]" style={{ color: C.amber }}>TDS: {fmtCurrency(p.tds_amount)}</span>
                                  )}
                                </div>
                                <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>
                                  {p._label ? `${p._label} · ` : ''}{fmtDate(pDate)}{pMode ? ` · ${pMode}` : ''}{pRef ? ` · ${pRef}` : ''}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {/* Amount reconciliation */}
                    {matchSelected.length > 0 && (
                      <div className="mt-2 p-2 rounded-lg flex items-center justify-between" style={{ background: C.bg }}>
                        <span className="text-[10px] font-bold" style={{ color: '#4e4636' }}>Selected total:</span>
                        <span className="text-xs font-bold" style={{
                          fontFamily: 'JetBrains Mono, monospace',
                          color: (() => {
                            const selTotal = matchPayments.filter(p => matchSelected.includes(p.id)).reduce((s, p) => {
                              const total = matchSource === 'outsource' ? ((p.amount || 0) - (p.tds_amount || 0)) : (p.amount || 0)
                              return s + (p.balance_due > 0 && p.balance_due < total ? p.balance_due : total)
                            }, 0)
                            const txnAmt = settleModal.debit || settleModal.credit || 0
                            return Math.abs(selTotal - txnAmt) / txnAmt < 0.05 ? '#16a34a' : '#d97706'
                          })()
                        }}>
                          {fmtCurrency(matchPayments.filter(p => matchSelected.includes(p.id)).reduce((s, p) => {
                            const total = matchSource === 'outsource' ? ((p.amount || 0) - (p.tds_amount || 0)) : (p.amount || 0)
                            return s + (p.balance_due > 0 && p.balance_due < total ? p.balance_due : total)
                          }, 0))}
                          {' '}vs bank {fmtCurrency(settleModal.debit || settleModal.credit)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <button onClick={() => { setSettleModal(null); setMatchSource(''); setMatchPayments([]); setMatchSelected([]); }}
                    style={{ padding: '0.625rem 1rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: C.textMuted }}>Cancel</button>
                  <button onClick={handleSettleMatch} disabled={settling || (matchSource !== 'loan' && matchSelected.length === 0) || (matchSource === 'loan' && !matchVendorId)}
                    style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', background: (matchSource === 'loan' ? matchVendorId : matchSelected.length > 0) ? '#16a34a' : '#d1d5db', color: '#fff', border: 'none', cursor: (settling || (matchSource !== 'loan' && matchSelected.length === 0) || (matchSource === 'loan' && !matchVendorId)) ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', fontWeight: 600, opacity: settling ? 0.6 : 1 }}>
                    {settling ? 'Matching...' : matchSource === 'loan' ? 'Mark EMI Paid' : `Match ${matchSelected.length} Payment${matchSelected.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            )}

            {/* ── MODE B: Manual COA Entry ──────────────────────────────── */}
            {settleMode === 'manual' && (
              <div>
                <div className="mb-3">
                  <label style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#4e4636', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>
                    Expense Account <span style={{ color: C.red }}>*</span>
                  </label>
                  <select value={settleForm.account_id} onChange={e => setSettleForm({ ...settleForm, account_id: e.target.value })}
                    style={{ width: '100%', padding: '0.625rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, fontSize: '0.8125rem', fontFamily: 'Inter,sans-serif' }}>
                    <option value="">— Select account —</option>
                    {parentAccounts.map(pa => {
                      const children = childAccounts(pa.id)
                      if (children.length > 0) {
                        return (
                          <optgroup key={pa.id} label={`${pa.name} (${pa.group_type})`}>
                            <option value={pa.id}>{pa.name} (parent)</option>
                            {children.map(ch => <option key={ch.id} value={ch.id}>&nbsp;&nbsp;└ {ch.name}</option>)}
                          </optgroup>
                        )
                      }
                      return <option key={pa.id} value={pa.id}>{pa.name} ({pa.group_type})</option>
                    })}
                  </select>
                </div>

                <div className="mb-4">
                  <label style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#4e4636', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.375rem' }}>Notes</label>
                  <input type="text" value={settleForm.notes} onChange={e => setSettleForm({ ...settleForm, notes: e.target.value })} placeholder="Optional notes"
                    style={{ width: '100%', padding: '0.625rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, fontSize: '0.8125rem', fontFamily: 'Inter,sans-serif' }} />
                </div>

                <div className="flex gap-3 justify-end">
                  <button onClick={() => setSettleModal(null)}
                    style={{ padding: '0.625rem 1rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: C.textMuted }}>Cancel</button>
                  <button onClick={handleSettle} disabled={settling}
                    style={{ padding: '0.625rem 1.25rem', borderRadius: '0.5rem', background: C.gold, color: '#fff', border: 'none', cursor: settling ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', fontWeight: 600, opacity: settling ? 0.6 : 1 }}>
                    {settling ? 'Settling...' : 'Settle to P&L'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default BankStatementTab

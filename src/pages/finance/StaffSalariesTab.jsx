import React, { useState, useEffect, useMemo } from 'react'
import { C, toast, fmtCurrency, fmtDate } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'

const DEPARTMENTS = ['CEO', 'Design', 'Production', 'Operations', 'Store', 'BD', 'Franchise Development']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const StaffSalariesTab = ({ user }) => {
  const today = new Date()
  const todayMonth = today.getMonth() + 1
  const todayYear = today.getFullYear()

  const [month, setMonth] = useState(todayMonth)
  const [year, setYear] = useState(todayYear)
  const [staff, setStaff] = useState([])
  const [salaries, setSalaries] = useState([])
  const [loading, setLoading] = useState(false)
  const [showEmployeeForm, setShowEmployeeForm] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm())
  const [payModal, setPayModal] = useState(null)
  const [payDate, setPayDate] = useState(today.toISOString().split('T')[0])
  const [payUTR, setPayUTR] = useState('')
  const [editingSalary, setEditingSalary] = useState({})

  // Upload state
  const [showUploadPreview, setShowUploadPreview] = useState(false)
  const [uploadRows, setUploadRows] = useState([]) // parsed rows with matched staff
  const [uploading, setUploading] = useState(false)

  function emptyEmployeeForm() {
    // Auto-generate next employee_id
    const nextId = (() => {
      const ids = staff.map(s => parseInt((s.employee_id || '').replace('H-', ''))).filter(n => !isNaN(n))
      const next = ids.length > 0 ? Math.max(...ids) + 1 : 1
      return 'H-' + String(next).padStart(3, '0')
    })()
    return { employee_id: nextId, name: '', designation: '', department: 'Office', doj: '', salary_amount: '', bank_name: '', bank_account: '', bank_ifsc: '', salary_date_day: 1, pl_sub_account: 'Office Staff', notes: '', is_active: true }
  }

  // ─── Data Fetching ──────────────────────────────────────────────────────
  const fetchStaff = async () => {
    const { data, error } = await supa.from('staff_members').select('*').order('name')
    if (error) { toast(false, error.message); return }
    setStaff(data || [])
  }

  const fetchSalaries = async () => {
    const { data, error } = await supa.from('staff_salary_entries').select('*').eq('period_month', month).eq('period_year', year)
    if (error) { toast(false, error.message); return }
    setSalaries(data || [])
  }

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchStaff(), fetchSalaries()])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [month, year])

  // ─── Employee Master CRUD ──────────────────────────────────────────────
  const openAddEmployee = () => {
    setEditingEmployee(null)
    setEmployeeForm(emptyEmployeeForm())
    setShowEmployeeForm(true)
  }

  const openEditEmployee = (emp) => {
    setEditingEmployee(emp)
    setEmployeeForm({
      employee_id: emp.employee_id || '',
      name: emp.name || '',
      designation: emp.designation || '',
      department: emp.department || 'Office',
      doj: emp.doj || '',
      salary_amount: emp.salary_amount || '',
      bank_name: emp.bank_name || '',
      bank_account: emp.bank_account || '',
      bank_ifsc: emp.bank_ifsc || '',
      salary_date_day: emp.salary_date_day || 1,
      pl_sub_account: emp.pl_sub_account || 'Office Staff',
      notes: emp.notes || '',
      is_active: emp.is_active !== false,
    })
    setShowEmployeeForm(true)
  }

  const saveEmployee = async () => {
    const payload = {
      ...employeeForm,
      salary_amount: parseFloat(employeeForm.salary_amount) || 0,
      salary_date_day: parseInt(employeeForm.salary_date_day) || 1,
    }
    if (!payload.name.trim()) { toast(false, 'Name is required'); return }
    if (!payload.employee_id?.trim()) { toast(false, 'Employee ID is required'); return }

    if (editingEmployee) {
      // Don't update employee_id on edit
      const { employee_id, ...updatePayload } = payload
      const { error } = await supa.from('staff_members').update(updatePayload).eq('id', editingEmployee.id)
      if (error) { toast(false, error.message); return }

      // Sync pending salary entries if salary_amount changed
      if (payload.salary_amount > 0 && payload.salary_amount !== editingEmployee.salary_amount) {
        const salaryDay = payload.salary_date_day || editingEmployee.salary_date_day || 1
        // Update any pending entries for current period
        const { data: existing } = await supa.from('staff_salary_entries')
          .select('id, payment_status')
          .eq('staff_id', editingEmployee.id).eq('period_month', month).eq('period_year', year)
          .in('payment_status', ['pending', 'upcoming'])
        if (existing && existing.length > 0) {
          await supa.from('staff_salary_entries').update({
            basic: payload.salary_amount,
            gross_payable: payload.salary_amount,
            net_salary: payload.salary_amount,
            to_be_processed: payload.salary_amount,
            salary_due_date: `${year}-${String(month).padStart(2, '0')}-${String(salaryDay).padStart(2, '0')}`,
          }).eq('staff_id', editingEmployee.id).eq('period_month', month).eq('period_year', year)
            .in('payment_status', ['pending', 'upcoming'])
        } else if (!existing || existing.length === 0) {
          // No entry exists — create one
          await supa.from('staff_salary_entries').insert([{
            staff_id: editingEmployee.id,
            period_month: month, period_year: year,
            pay_days: 30, present_days: 30, lop_days: 0,
            basic: payload.salary_amount, hra: 0, special_allowance: 0, other_allowance: 0, arrears: 0,
            gross_payable: payload.salary_amount,
            pf_deduction: 0, esi_deduction: 0, medical_deduction: 0,
            professional_tax: 0, salary_advance: 0, tds_deduction: 0,
            other_deduction: 0, total_deductions: 0,
            net_salary: payload.salary_amount, to_be_processed: payload.salary_amount,
            is_on_hold: false,
            salary_due_date: `${year}-${String(month).padStart(2, '0')}-${String(salaryDay).padStart(2, '0')}`,
            payment_status: 'pending',
          }])
        }
      }
      toast(true, 'Employee updated')
    } else {
      // Insert new employee
      const { data: newEmp, error } = await supa.from('staff_members').insert([payload]).select().single()
      if (error) { toast(false, error.message); return }

      // Auto-create salary entry for the current selected month
      if (newEmp && payload.salary_amount > 0) {
        const salaryDay = payload.salary_date_day || 1
        const { error: salErr } = await supa.from('staff_salary_entries').insert([{
          staff_id: newEmp.id,
          period_month: month,
          period_year: year,
          pay_days: 30,
          present_days: 30,
          lop_days: 0,
          basic: payload.salary_amount,
          hra: 0, special_allowance: 0, other_allowance: 0, arrears: 0,
          gross_payable: payload.salary_amount,
          pf_deduction: 0, esi_deduction: 0, medical_deduction: 0,
          professional_tax: 0, salary_advance: 0, tds_deduction: 0,
          other_deduction: 0, total_deductions: 0,
          net_salary: payload.salary_amount,
          to_be_processed: payload.salary_amount,
          is_on_hold: false,
          salary_due_date: `${year}-${String(month).padStart(2, '0')}-${String(salaryDay).padStart(2, '0')}`,
          payment_status: 'pending',
        }])
        if (salErr) console.error('Auto salary entry failed:', salErr.message)
      }
      toast(true, `Employee added${payload.salary_amount > 0 ? ` + ${MONTHS[month - 1]} salary entry created` : ''}`)
    }
    setShowEmployeeForm(false)
    await fetchAll()
  }

  const deleteEmployee = async (emp) => {
    if (!window.confirm(`Delete ${emp.name}? This cannot be undone.`)) return
    const { error } = await supa.from('staff_members').delete().eq('id', emp.id)
    if (error) { toast(false, error.message); return }
    toast(true, 'Employee deleted')
    fetchStaff()
  }

  const toggleHoldEmployee = async (emp) => {
    const { error } = await supa.from('staff_members').update({ is_active: !emp.is_active }).eq('id', emp.id)
    if (error) { toast(false, error.message); return }
    toast(true, emp.is_active ? 'Employee set on hold' : 'Employee activated')
    fetchStaff()
  }

  // ─── Excel Upload & Parse ──────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset input

    try {
      const arrayBuffer = await file.arrayBuffer()
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs')
      const wb = XLSX.read(arrayBuffer, { type: 'array' })

      // Pick the right sheet + header row. A 'good' header row contains at
      // least one of these keywords; that lets us skip band/section rows
      // like ['Actual','Payable','Deductions'] that have >=3 non-empty cells
      // but aren't the real header.
      const HEADER_KEYWORDS = ['name', 'employee', 'staff', 'salary', 'bank', 'ifsc', 'account', 'designation', 'doj', 'process']
      const findHeaderIdx = (sheet) => {
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        for (let i = 0; i < Math.min(raw.length, 15); i++) {
          const row = raw[i].map(c => String(c).toLowerCase())
          const nonEmpty = row.filter(c => c.trim() !== '').length
          const hasKeyword = row.some(c => HEADER_KEYWORDS.some(kw => c.includes(kw)))
          if (nonEmpty >= 3 && hasKeyword) return i
        }
        return -1
      }

      // Sheet preference: 'Bank Statement' (case-insensitive) → first sheet
      // whose detected header row contains a Name column → sheet 0.
      let chosenSheetName = null
      const bankIdx = wb.SheetNames.findIndex(n => /bank.*statement/i.test(n))
      if (bankIdx >= 0) {
        const hi = findHeaderIdx(wb.Sheets[wb.SheetNames[bankIdx]])
        if (hi >= 0) chosenSheetName = wb.SheetNames[bankIdx]
      }
      if (!chosenSheetName) {
        for (const sn of wb.SheetNames) {
          const hi = findHeaderIdx(wb.Sheets[sn])
          if (hi >= 0) {
            const headerRow = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' })[hi] || []
            const hasName = headerRow.some(c => /name|employee|staff/i.test(String(c)))
            if (hasName) { chosenSheetName = sn; break }
          }
        }
      }
      if (!chosenSheetName) chosenSheetName = wb.SheetNames[0]
      const ws = wb.Sheets[chosenSheetName]

      let headerIdx = findHeaderIdx(ws)
      if (headerIdx < 0) headerIdx = 0

      // Re-parse using the detected header row
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerIdx })

      if (rows.length === 0) {
        toast(false, 'No rows found in file')
        return
      }

      // Detect columns flexibly — handle various header names
      const cols = Object.keys(rows[0])
      const findCol = (...keywords) => cols.find(k => {
        const lk = k.toLowerCase()
        return keywords.some(kw => lk.includes(kw))
      })

      const nameCol = findCol('name', 'employee', 'staff')
      const salaryCol = findCol('process', 'net', 'salary', 'amount', 'payable', 'ctc', 'to be')
      const grossCol = findCol('gross', 'total earn')
      const deductionCol = findCol('deduction', 'ded ', 'tds')
      const designationCol = findCol('designation', 'position', 'role')
      const bankCol = findCol('bank name', 'bank')
      const ifscCol = findCol('ifsc')
      const accountCol = findCol('account')
      const salaryDateCol = findCol('salary date')

      if (!nameCol) {
        toast(false, 'Could not find employee name column. Please ensure your Excel has a "Name" column.')
        return
      }

      // Simple: parse each row as-is, look up staff by exact name later during confirm
      const dojCol = findCol('doj', 'date of joining', 'joining')
      const parsed = rows
        .filter(r => {
          const name = String(r[nameCol] || '').trim()
          if (!name) return false
          if (name.toLowerCase() === 'total' || name.match(/^\d+\.\d+$/)) return false
          return true
        })
        .map(r => {
          const rowName = String(r[nameCol]).trim()
          const netAmt = salaryCol ? (parseFloat(r[salaryCol]) || 0) : 0
          const gross = grossCol ? (parseFloat(r[grossCol]) || 0) : netAmt
          const deductions = deductionCol ? (parseFloat(r[deductionCol]) || 0) : 0
          const allVals = Object.values(r).map(v => String(v).toLowerCase())
          const isHold = allVals.some(v => v.includes('hold'))
          const bankName = bankCol ? String(r[bankCol] || '').trim() : ''
          const ifsc = ifscCol ? String(r[ifscCol] || '').trim() : ''
          const accountNo = accountCol ? String(r[accountCol] || '').trim() : ''
          const salaryDateRaw = salaryDateCol ? String(r[salaryDateCol] || '').trim() : ''
          const designation = designationCol ? String(r[designationCol] || '').trim() : ''
          const dojRaw = dojCol ? r[dojCol] : null
          const doj = dojRaw instanceof Date ? dojRaw.toISOString().split('T')[0] : (typeof dojRaw === 'number' ? new Date((dojRaw - 25569) * 86400000).toISOString().split('T')[0] : null)
          const salaryDayMatch = salaryDateRaw.match(/(\d+)/)
          const salaryDay = salaryDayMatch ? parseInt(salaryDayMatch[1]) : 1

          // Check if staff already exists (exact name match)
          const existing = staff.find(s => s.name.trim().toLowerCase() === rowName.toLowerCase())
          const existingEntry = existing ? salaries.find(s => s.staff_id === existing.id) : null

          return {
            rowName, designation, gross, deductions, netSalary: netAmt,
            bankName, ifsc, accountNo, salaryDay, salaryDateRaw, doj, isHold,
            staffId: existing?.id || null,
            isNew: !existing,
            alreadyExists: !!existingEntry,
            existingEntryId: existingEntry?.id || null,
            existingAmount: existingEntry?.net_salary || 0,
            include: !isHold && netAmt > 0,
          }
        })

      setUploadRows(parsed)
      setShowUploadPreview(true)
    } catch (err) {
      console.error('Excel parse error:', err)
      toast(false, 'Failed to parse file: ' + (err.message || ''))
    }
  }

  const confirmUpload = async () => {
    const included = uploadRows.filter(r => r.include)
    if (included.length === 0) { toast(false, 'No entries to import'); return }

    setUploading(true)
    try {
      // Get next employee_id for new staff
      const existingIds = staff.map(s => parseInt((s.employee_id || '').replace('H-', ''))).filter(n => !isNaN(n))
      let nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1
      let created = 0, imported = 0, updated = 0

      for (const r of included) {
        let staffId = r.staffId

        // If staff doesn't exist, create them
        if (!staffId) {
          const empId = 'H-' + String(nextNum).padStart(3, '0')
          nextNum++
          const { data, error } = await supa.from('staff_members').insert({
            employee_id: empId, name: r.rowName, designation: r.designation || null,
            salary_amount: r.netSalary, salary_date_day: r.salaryDay || 1,
            bank_name: r.bankName || null, bank_ifsc: r.ifsc || null,
            bank_account: r.accountNo || null, doj: r.doj || null, is_active: true,
          }).select('id').single()
          if (error) { console.error('Create staff failed:', r.rowName, error); continue }
          staffId = data.id
          created++
        } else {
          // Update existing staff with latest info from Excel
          const updates = {}
          const emp = staff.find(s => s.id === staffId)
          if (r.bankName) updates.bank_name = r.bankName
          if (r.ifsc) updates.bank_ifsc = r.ifsc
          if (r.accountNo) updates.bank_account = r.accountNo
          if (r.salaryDay) updates.salary_date_day = r.salaryDay
          if (r.netSalary) updates.salary_amount = r.netSalary
          if (r.designation) updates.designation = r.designation
          if (emp && !emp.is_active) updates.is_active = true // reactivate if they're back
          if (Object.keys(updates).length > 0) await supa.from('staff_members').update(updates).eq('id', staffId)
        }

        // Create or update salary entry
        if (r.alreadyExists && r.existingEntryId) {
          await supa.from('staff_salary_entries').update({
            net_salary: r.netSalary, to_be_processed: r.netSalary,
            basic: r.gross, gross_payable: r.gross,
            other_deduction: r.deductions, total_deductions: r.deductions,
          }).eq('id', r.existingEntryId)
          updated++
        } else {
          await supa.from('staff_salary_entries').insert({
            staff_id: staffId, period_month: month, period_year: year,
            pay_days: 30, present_days: 30, lop_days: 0,
            basic: r.gross, gross_payable: r.gross,
            hra: 0, special_allowance: 0, other_allowance: 0, arrears: 0,
            pf_deduction: 0, esi_deduction: 0, medical_deduction: 0,
            professional_tax: 0, salary_advance: 0, tds_deduction: 0,
            other_deduction: r.deductions, total_deductions: r.deductions,
            net_salary: r.netSalary, to_be_processed: r.netSalary,
            is_on_hold: false, payment_status: 'pending',
            salary_due_date: `${year}-${String(month).padStart(2, '0')}-${String(r.salaryDay || 1).padStart(2, '0')}`,
          })
          imported++
        }
      }

      const parts = []
      if (created > 0) parts.push(`${created} new staff added`)
      if (imported > 0) parts.push(`${imported} entries created`)
      if (updated > 0) parts.push(`${updated} updated`)
      toast(true, parts.join(', '))

      setShowUploadPreview(false)
      setUploadRows([])
      await fetchAll()
    } catch (err) {
      toast(false, 'Import failed: ' + (err.message || ''))
    } finally {
      setUploading(false)
    }
  }

  // ─── Inline Edit & Pay ─────────────────────────────────────────────────
  const updateSalaryInline = async (entryId, field, value) => {
    const numVal = parseFloat(value) || 0
    const entry = salaries.find(s => s.id === entryId)
    if (!entry) return

    let updates = { [field]: numVal }

    if (field === 'to_be_processed') {
      updates.net_salary = numVal - (entry.other_deduction || 0)
      updates.gross_payable = numVal
      updates.basic = numVal
    } else if (field === 'other_deduction') {
      updates.total_deductions = numVal
      updates.net_salary = (entry.to_be_processed || 0) - numVal
    }

    const { error } = await supa.from('staff_salary_entries').update(updates).eq('id', entryId)
    if (error) { toast(false, error.message); return }
    setSalaries(prev => prev.map(s => s.id === entryId ? { ...s, ...updates } : s))
  }

  const markAsPaid = async () => {
    if (!payModal) return
    const updates = {
      payment_status: 'paid',
      paid_date: payDate,
      utr: payUTR || null,
    }
    const { error } = await supa.from('staff_salary_entries').update(updates).eq('id', payModal)
    if (error) { toast(false, error.message); return }
    setSalaries(prev => prev.map(s => s.id === payModal ? { ...s, ...updates } : s))
    setPayModal(null)
    setPayUTR('')
    toast(true, 'Marked as paid')
  }

  const deleteEntry = async (entryId) => {
    if (!window.confirm('Delete this salary entry?')) return
    const { error } = await supa.from('staff_salary_entries').delete().eq('id', entryId)
    if (error) { toast(false, error.message); return }
    setSalaries(prev => prev.filter(s => s.id !== entryId))
    toast(true, 'Entry deleted')
  }

  // ─── Helpers ───────────────────────────────────────────────────────────
  const getStaffForEntry = (staffId) => staff.find(s => s.id === staffId)

  const summary = {
    total: salaries.length,
    totalNet: salaries.reduce((sum, s) => sum + (s.net_salary || 0), 0),
    paid: salaries.filter(s => s.payment_status === 'paid' || s.payment_status === 'settled').length,
    pending: salaries.filter(s => s.payment_status === 'pending' && !s.is_on_hold).length,
    settled: salaries.filter(s => s.payment_status === 'settled').length,
  }

  const sortedSalaries = useMemo(() => {
    return [...salaries].sort((a, b) => {
      // Sort by due date first, then by name
      const dateA = a.salary_due_date || '9999-12-31'
      const dateB = b.salary_due_date || '9999-12-31'
      if (dateA !== dateB) return dateA.localeCompare(dateB)
      const nameA = getStaffForEntry(a.staff_id)?.name || ''
      const nameB = getStaffForEntry(b.staff_id)?.name || ''
      return nameA.localeCompare(nameB)
    })
  }, [salaries, staff])

  // ─── RENDER ────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Manrope, sans-serif', padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: C.text }}>Staff Salaries</h1>
      </div>

      {renderRegisterSection()}

      {/* Employee Form Modal */}
      {showEmployeeForm && (
        <>
          <Overlay onClick={() => setShowEmployeeForm(false)} />
          <Modal>
            <h2 style={{ margin: '0 0 1.5rem', fontFamily: 'Manrope, sans-serif', fontSize: '1.25rem', color: C.text }}>
              {editingEmployee ? 'Edit Employee' : 'Add Employee'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField label="Employee ID" value={employeeForm.employee_id} onChange={v => setEmployeeForm(f => ({...f, employee_id: v}))} disabled={!!editingEmployee} />
              <FormField label="Name" value={employeeForm.name} onChange={v => setEmployeeForm(f => ({...f, name: v}))} />
              <FormField label="Designation" value={employeeForm.designation} onChange={v => setEmployeeForm(f => ({...f, designation: v}))} />
              <div>
                <label style={labelStyle}>Department</label>
                <select value={employeeForm.department} onChange={e => setEmployeeForm(f => ({...f, department: e.target.value}))} style={inputStyle}>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <FormField label="Date of Joining" type="date" value={employeeForm.doj} onChange={v => setEmployeeForm(f => ({...f, doj: v}))} />
              <div>
                <label style={labelStyle}>P&L Sub Account</label>
                <select value={employeeForm.pl_sub_account} onChange={e => setEmployeeForm(f => ({...f, pl_sub_account: e.target.value}))} style={inputStyle}>
                  <option value="Office Staff">Office Staff</option>
                  <option value="Store Staff">Store Staff</option>
                  <option value="Directors Remuneration">Directors Remuneration</option>
                </select>
              </div>
              <FormField label="Monthly Salary" type="number" value={employeeForm.salary_amount} onChange={v => setEmployeeForm(f => ({...f, salary_amount: v}))} />
              <FormField label="Salary Day (of month)" type="number" value={employeeForm.salary_date_day} onChange={v => setEmployeeForm(f => ({...f, salary_date_day: v}))} />
              <FormField label="Bank Name" value={employeeForm.bank_name} onChange={v => setEmployeeForm(f => ({...f, bank_name: v}))} />
              <FormField label="Account No" value={employeeForm.bank_account} onChange={v => setEmployeeForm(f => ({...f, bank_account: v}))} />
              <FormField label="IFSC" value={employeeForm.bank_ifsc} onChange={v => setEmployeeForm(f => ({...f, bank_ifsc: v}))} />
              <FormField label="Notes" value={employeeForm.notes} onChange={v => setEmployeeForm(f => ({...f, notes: v}))} />
            </div>
            {!editingEmployee && (
              <p style={{ fontSize: '0.8rem', color: C.textMuted, marginTop: '0.75rem' }}>
                Salary entry for {MONTHS[month - 1]} {year} will be auto-created if salary amount is set.
              </p>
            )}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowEmployeeForm(false)} style={{ ...btnStyle, backgroundColor: C.cream, color: C.text }}>Cancel</button>
              <button onClick={saveEmployee} style={{ ...btnStyle, backgroundColor: C.gold, color: '#fff' }}>Save</button>
            </div>
          </Modal>
        </>
      )}

      {/* Pay Modal */}
      {payModal && (
        <>
          <Overlay onClick={() => setPayModal(null)} />
          <Modal>
            <h2 style={{ margin: '0 0 1.5rem', fontFamily: 'Manrope, sans-serif', fontSize: '1.25rem', color: C.text }}>Mark as Paid</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FormField label="Paid Date" type="date" value={payDate} onChange={setPayDate} />
              <FormField label="UTR / Reference" value={payUTR} onChange={setPayUTR} />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setPayModal(null)} style={{ ...btnStyle, backgroundColor: C.cream, color: C.text }}>Cancel</button>
              <button onClick={markAsPaid} style={{ ...btnStyle, backgroundColor: C.green, color: '#fff' }}>Confirm Payment</button>
            </div>
          </Modal>
        </>
      )}

      {/* Upload Preview Modal */}
      {showUploadPreview && (
        <>
          <Overlay onClick={() => setShowUploadPreview(false)} />
          <Modal wide>
            <h2 style={{ margin: '0 0 1rem', fontFamily: 'Manrope, sans-serif', fontSize: '1.25rem', color: C.text }}>
              Upload Preview — {MONTHS[month - 1]} {year}
            </h2>
            <p style={{ fontSize: '0.85rem', color: C.textMuted, marginBottom: '1rem' }}>
              {uploadRows.filter(r => r.include && !r.isNew && !r.alreadyExists).length} new entries, {uploadRows.filter(r => r.alreadyExists).length} updates, {uploadRows.filter(r => r.isNew && r.include).length} new employees
            </p>

            <div style={{ maxHeight: '400px', overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: '0.75rem' }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ backgroundColor: C.cream, position: 'sticky', top: 0 }}>
                    <Th>Include</Th>
                    <Th>Employee Name</Th>
                    <Th align="right">Salary</Th>
                    <Th>Bank</Th>
                    <Th>Due Date</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {uploadRows.map((row, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.borderLight}`, opacity: (row.isHold || row.netSalary === 0) ? 0.5 : 1 }}>
                      <Td align="center">
                        <input type="checkbox" checked={row.include}
                          disabled={row.isHold || row.netSalary === 0}
                          onChange={() => {
                            setUploadRows(prev => prev.map((r, j) => j === i ? { ...r, include: !r.include } : r))
                          }} />
                      </Td>
                      <Td>
                        <div>{row.rowName}</div>
                        {row.designation && <div style={{ fontSize: '0.75rem', color: C.textMuted }}>{row.designation}</div>}
                      </Td>
                      <Td align="right" mono>{fmtCurrency(row.netSalary)}</Td>
                      <Td style={{ fontSize: '0.75rem', lineHeight: 1.3 }}>
                        {row.bankName ? (
                          <>
                            <div>{row.bankName}</div>
                            {row.ifsc && <div style={{ color: C.textMuted }}>{row.ifsc}</div>}
                            {row.accountNo && <div style={{ color: C.textMuted, fontFamily: 'monospace' }}>{row.accountNo}</div>}
                          </>
                        ) : <span style={{ color: C.textMuted }}>—</span>}
                      </Td>
                      <Td style={{ fontSize: '0.8rem' }}>{row.salaryDay ? `${row.salaryDay}/${month}` : '—'}</Td>
                      <Td>
                        {row.isHold ? (
                          <Badge color={C.amber} bg={C.amberBg}>HOLD</Badge>
                        ) : row.netSalary === 0 ? (
                          <Badge color={C.textMuted} bg="rgba(107,114,128,0.1)">₹0</Badge>
                        ) : row.alreadyExists ? (
                          <Badge color="#3b82f6" bg="rgba(59,130,246,0.1)">UPDATE</Badge>
                        ) : row.isNew ? (
                          <Badge color={C.amber} bg={C.amberBg}>NEW EMPLOYEE</Badge>
                        ) : (
                          <Badge color={C.green} bg={C.greenBg}>NEW</Badge>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowUploadPreview(false)} style={{ ...btnStyle, backgroundColor: C.cream, color: C.text }}>Cancel</button>
              <button onClick={confirmUpload} disabled={uploading || uploadRows.filter(r => r.include).length === 0}
                style={{ ...btnStyle, backgroundColor: C.gold, color: '#fff', opacity: uploading ? 0.6 : 1 }}>
                {uploading ? 'Processing...' : (() => {
                  const inc = uploadRows.filter(r => r.include)
                  const newCount = inc.filter(r => !r.alreadyExists).length
                  const updateCount = inc.filter(r => r.alreadyExists).length
                  const parts = []
                  if (newCount > 0) parts.push(`${newCount} new`)
                  if (updateCount > 0) parts.push(`${updateCount} update`)
                  return parts.length > 0 ? `Import: ${parts.join(' + ')}` : 'No changes'
                })()}
              </button>
            </div>
          </Modal>
        </>
      )}
    </div>
  )

  // ─── Register Section ──────────────────────────────────────────────────
  function renderRegisterSection() {
    return (
      <>
        {/* Controls */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select value={month} onChange={e => setMonth(parseInt(e.target.value))} style={inputStyle}>
              {MONTHS.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <input type="number" min={2020} value={year} onChange={e => setYear(parseInt(e.target.value))} style={{ ...inputStyle, width: '90px' }} />
          </div>
          <label style={{ ...btnStyle, backgroundColor: C.gold, color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            Upload Salary Sheet
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
          <button onClick={openAddEmployee} style={{ ...btnStyle, backgroundColor: C.cardBg, color: C.text, border: `1px solid ${C.border}` }}>+ Add Employee</button>
        </div>

        {/* Summary Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <SummaryCard label="Total Entries" value={summary.total} />
          <SummaryCard label="Net Payable" value={fmtCurrency(summary.totalNet)} color={C.gold} />
          <SummaryCard label="Paid" value={summary.paid} color={C.green} />
          <SummaryCard label="Pending" value={summary.pending} color={C.amber} />
          {summary.settled > 0 && <SummaryCard label="Settled" value={summary.settled} color={C.blue} />}
        </div>

        {/* Table */}
        <div style={cardStyle}>
          {loading && salaries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: C.textMuted }}>Loading...</div>
          ) : salaries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: C.textMuted }}>
              No salary entries for {MONTHS[month-1]} {year}. Upload a salary sheet to create entries.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ backgroundColor: C.cream }}>
                    <Th>ID</Th>
                    <Th>Name</Th>
                    <Th align="center">Due Date</Th>
                    <Th align="right">Salary Amount</Th>
                    <Th align="center">Leaves</Th>
                    <Th align="right">Deductions</Th>
                    <Th align="right">Net Payable</Th>
                    <Th align="center">Status</Th>
                    <Th>Paid Date</Th>
                    <Th>UTR</Th>
                    <Th align="center">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSalaries.map(entry => {
                    const emp = getStaffForEntry(entry.staff_id)
                    const isPaid = entry.payment_status === 'paid'
                    const isSettled = entry.payment_status === 'settled'
                    const dueDate = entry.salary_due_date
                    const isOverdue = !isPaid && !isSettled && dueDate && new Date(dueDate) < new Date(new Date().toISOString().split('T')[0])
                    const isDueToday = !isPaid && !isSettled && dueDate && dueDate === new Date().toISOString().split('T')[0]

                    return (
                      <tr key={entry.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                        <Td mono>{emp?.employee_id || '—'}</Td>
                        <Td bold>{emp?.name || '—'}</Td>
                        <Td align="center" style={{ whiteSpace: 'nowrap' }}>
                          {dueDate ? fmtDate(dueDate) : '—'}
                        </Td>
                        <Td align="right" mono>
                          {isPaid || isSettled ? fmtCurrency(entry.to_be_processed) : (
                            <InlineEdit
                              value={entry.to_be_processed || 0}
                              onSave={val => updateSalaryInline(entry.id, 'to_be_processed', val)}
                            />
                          )}
                        </Td>
                        <Td align="center" mono>
                          {isPaid || isSettled ? (entry.lop_days || 0) : (
                            <InlineEdit
                              value={entry.lop_days || 0}
                              onSave={val => updateSalaryInline(entry.id, 'lop_days', val)}
                            />
                          )}
                        </Td>
                        <Td align="right" mono>
                          {isPaid || isSettled ? fmtCurrency(entry.other_deduction) : (
                            <InlineEdit
                              value={entry.other_deduction || 0}
                              onSave={val => updateSalaryInline(entry.id, 'other_deduction', val)}
                            />
                          )}
                        </Td>
                        <Td align="right" mono bold>{fmtCurrency(entry.net_salary)}</Td>
                        <Td align="center">
                          {isSettled ? (
                            <Badge color={C.blue} bg={C.blueBg}>SETTLED</Badge>
                          ) : isPaid ? (
                            <Badge color={C.green} bg={C.greenBg}>PAID</Badge>
                          ) : isOverdue ? (
                            <Badge color={C.red} bg={C.redBg}>OVERDUE</Badge>
                          ) : isDueToday ? (
                            <Badge color={C.amber} bg={C.amberBg}>DUE TODAY</Badge>
                          ) : (
                            <Badge color={C.textMuted} bg="rgba(107,114,128,0.1)">UPCOMING</Badge>
                          )}
                        </Td>
                        <Td>{entry.paid_date ? fmtDate(entry.paid_date) : '—'}</Td>
                        <Td mono>{entry.utr || '—'}</Td>
                        <Td align="center">
                          <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'center' }}>
                            {emp && (
                              <SmallBtn onClick={() => openEditEmployee(emp)} color={C.blue}>Edit</SmallBtn>
                            )}
                            {!isPaid && !isSettled && (
                              <SmallBtn onClick={() => { setPayModal(entry.id); setPayDate(today.toISOString().split('T')[0]); setPayUTR('') }} color={C.green}>
                                Pay
                              </SmallBtn>
                            )}
                            {!isSettled && (
                              <SmallBtn onClick={() => deleteEntry(entry.id)} color={C.red}>Del</SmallBtn>
                            )}
                          </div>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

const SummaryCard = ({ label, value, color = C.gold }) => (
  <div style={{ backgroundColor: C.cardBg, borderRadius: '1rem', padding: '1.25rem', border: `1px solid ${C.border}` }}>
    <div style={{ fontSize: '0.8rem', color: C.textMuted, marginBottom: '0.25rem', fontFamily: 'Manrope, sans-serif' }}>{label}</div>
    <div style={{ fontSize: '1.5rem', fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
  </div>
)

const InlineEdit = ({ value, onSave }) => {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(value)

  useEffect(() => { setInput(value) }, [value])

  const commit = () => {
    const numVal = parseFloat(input) || 0
    if (numVal !== value) onSave(numVal)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        type="number"
        value={input}
        onChange={e => setInput(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setInput(value); setEditing(false) } }}
        autoFocus
        style={{ width: '100px', padding: '0.25rem 0.5rem', border: `1px solid ${C.gold}`, borderRadius: '0.375rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', textAlign: 'right' }}
      />
    )
  }

  return (
    <span onClick={() => setEditing(true)} style={{ cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '0.375rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' }} title="Click to edit">
      {fmtCurrency(value)}
    </span>
  )
}

const Badge = ({ children, color, bg }) => (
  <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '0.375rem', fontSize: '0.7rem', fontWeight: 700, color, backgroundColor: bg, letterSpacing: '0.03em', marginLeft: '0.25rem' }}>
    {children}
  </span>
)


const SmallBtn = ({ onClick, color, children }) => (
  <button onClick={onClick} style={{ padding: '0.25rem 0.6rem', borderRadius: '0.375rem', border: 'none', backgroundColor: color + '18', color, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'Manrope, sans-serif' }}>
    {children}
  </button>
)

const FormField = ({ label, value, onChange, type = 'text', disabled = false }) => (
  <div>
    <label style={labelStyle}>{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, ...(disabled ? { opacity: 0.5, pointerEvents: 'none', backgroundColor: '#f5f5f5' } : {}) }} disabled={disabled} />
  </div>
)

const Overlay = ({ onClick }) => (
  <div onClick={onClick} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 999 }} />
)

const Modal = ({ children, wide }) => (
  <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: C.cardBg, borderRadius: '1.5rem', padding: '2rem', zIndex: 1000, width: '90%', maxWidth: wide ? '900px' : '640px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
    {children}
  </div>
)

const Th = ({ children, align = 'left' }) => (
  <th style={{ padding: '0.75rem 1rem', textAlign: align, fontSize: '0.75rem', fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'Manrope, sans-serif', borderBottom: `1px solid ${C.border}` }}>
    {children}
  </th>
)

const Td = ({ children, align = 'left', mono, bold }) => (
  <td style={{ padding: '0.75rem 1rem', textAlign: align, fontSize: '0.85rem', fontWeight: bold ? 600 : 400, color: C.text, fontFamily: mono ? 'JetBrains Mono, monospace' : 'Manrope, sans-serif' }}>
    {children}
  </td>
)

// ─── Shared Styles ───────────────────────────────────────────────────────
const cardStyle = { backgroundColor: C.cardBg, borderRadius: '1.5rem', padding: '1.5rem', border: `1px solid ${C.border}` }
const tableStyle = { width: '100%', borderCollapse: 'collapse' }
const inputStyle = { padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, fontFamily: 'Manrope, sans-serif', fontSize: '0.875rem', width: '100%', boxSizing: 'border-box' }
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: C.textMuted, marginBottom: '0.25rem', fontFamily: 'Manrope, sans-serif' }
const btnStyle = { padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'Manrope, sans-serif' }

export default StaffSalariesTab

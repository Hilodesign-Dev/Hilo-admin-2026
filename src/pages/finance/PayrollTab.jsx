import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, fmtDate, fmtCurrency } from '../../lib/designTokens'

/* ── Constants ───────────────────────────────────────────────────────── */
const ROLES = ['embroidery', 'stitching', 'both']
const DEPARTMENTS = ['production', 'store']
const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly (Mon–Sun)' },
  { value: 'biweekly', label: 'Biweekly (1st & 15th)' },
  { value: 'monthly', label: 'Monthly' },
]
const FREQ_LABEL = Object.fromEntries(FREQUENCIES.map(f => [f.value, f.label]))
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const mono = { fontFamily: 'JetBrains Mono, monospace' }
const n = v => Number(v) || 0

/* ── Period & Due-Date Logic ────────────────────────────────────────── */
const lastDay = (y, m) => new Date(y, m, 0).getDate()

/**
 * Generate periods with due_dates for a karigar in a given month.
 * Only returns periods whose due_date falls in [year, month].
 * `joining_date` anchors the cycle start.
 */
const periodsForKarigar = (karigar, year, month) => {
  const freq = karigar.pay_cycle || 'monthly'
  const mm = String(month).padStart(2, '0')
  const last = lastDay(year, month)
  const monthStart = `${year}-${mm}-01`
  const monthEnd = `${year}-${mm}-${String(last).padStart(2, '0')}`

  // Helper: next Monday on or after a date
  const nextMonday = (d) => { const dt = new Date(d); const day = dt.getDay(); const add = day === 0 ? 1 : day === 1 ? 0 : 8 - day; dt.setDate(dt.getDate() + add); return dt }
  const fmt = d => d.toISOString().slice(0, 10)
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }

  // Previous month details (for carry-over periods due this month)
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const prevMm = String(prevMonth).padStart(2, '0')
  const prevLast = lastDay(prevYear, prevMonth)
  const prevMonthStart = `${prevYear}-${prevMm}-01`
  const prevMonthEnd = `${prevYear}-${prevMm}-${String(prevLast).padStart(2, '0')}`
  const prevMonthLabel = MONTHS[prevMonth - 1]

  const periods = []

  if (freq === 'daily') {
    periods.push({
      label: `${MONTHS[month - 1]} (Daily)`,
      period_start: monthStart,
      period_end: monthEnd,
      due_date: monthEnd,
      working_days: 26,
    })
  } else if (freq === 'weekly') {
    // Carry-over: last week of prev month whose due spills into this month
    let prevCur = nextMonday(new Date(`${prevYear}-${prevMm}-01`))
    const prevFirst = new Date(`${prevYear}-${prevMm}-01`)
    if (prevCur > prevFirst) prevCur = prevFirst // handle partial
    // Find the last week(s) of prev month
    while (prevCur.getMonth() + 1 === prevMonth && prevCur.getFullYear() === prevYear) {
      const weekEnd = addDays(prevCur, 6)
      const actualEnd = weekEnd.getMonth() + 1 === prevMonth && weekEnd.getFullYear() === prevYear ? fmt(weekEnd) : prevMonthEnd
      const dueDate = fmt(addDays(new Date(actualEnd), 1))
      if (dueDate >= monthStart && dueDate <= monthEnd) {
        periods.push({
          label: `${fmtDate(fmt(prevCur))} – ${fmtDate(actualEnd)}`,
          period_start: fmt(prevCur),
          period_end: actualEnd,
          due_date: dueDate,
          _carryOver: true,
        })
      }
      prevCur = addDays(prevCur, 7)
    }

    // This month's weeks
    let cur = nextMonday(new Date(`${year}-${mm}-01`))
    const firstOfMonth = new Date(`${year}-${mm}-01`)
    if (cur > firstOfMonth && cur.getMonth() + 1 === month) {
      const partEnd = addDays(cur, -1)
      if (partEnd.getMonth() + 1 === month) {
        const dueDate = fmt(cur)
        periods.push({
          label: `${fmtDate(monthStart)} – ${fmtDate(fmt(partEnd))}`,
          period_start: monthStart,
          period_end: fmt(partEnd),
          due_date: dueDate,
        })
      }
    }
    while (cur.getMonth() + 1 === month && cur.getFullYear() === year) {
      const weekEnd = addDays(cur, 6)
      const actualEnd = weekEnd.getMonth() + 1 === month && weekEnd.getFullYear() === year ? fmt(weekEnd) : monthEnd
      const dueDate = fmt(addDays(new Date(actualEnd), 1))
      periods.push({
        label: `${fmtDate(fmt(cur))} – ${fmtDate(actualEnd)}`,
        period_start: fmt(cur),
        period_end: actualEnd,
        due_date: dueDate,
      })
      cur = addDays(cur, 7)
    }
  } else if (freq === 'biweekly') {
    const nextMonthStart = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

    // Carry-over: prev month 16th–end, due 1st of THIS month
    periods.push({
      label: `${prevMonthLabel} 16th – ${prevLast}th`,
      period_start: `${prevYear}-${prevMm}-16`,
      period_end: prevMonthEnd,
      due_date: monthStart,
      _carryOver: true,
    })

    // This month: 1st–15th, due 16th
    periods.push({
      label: '1st – 15th',
      period_start: monthStart,
      period_end: `${year}-${mm}-15`,
      due_date: `${year}-${mm}-16`,
    })
    // This month: 16th–end, due 1st next month
    periods.push({
      label: `16th – ${last}${last === 31 ? 'st' : last === 30 ? 'th' : 'th'}`,
      period_start: `${year}-${mm}-16`,
      period_end: monthEnd,
      due_date: nextMonthStart,
    })
  } else {
    // monthly: carry-over prev month (due 1st of this month) + this month (due 1st next)
    const nextMonthStart = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

    // Carry-over: prev month, due 1st of THIS month
    periods.push({
      label: prevMonthLabel,
      period_start: prevMonthStart,
      period_end: prevMonthEnd,
      due_date: monthStart,
      _carryOver: true,
    })

    // This month
    periods.push({
      label: MONTHS[month - 1],
      period_start: monthStart,
      period_end: monthEnd,
      due_date: nextMonthStart,
    })
  }

  // Filter: show if period overlaps selected month OR due_date is in selected month
  return periods.filter(p => {
    const periodOverlaps = p.period_start <= monthEnd && p.period_end >= monthStart
    const dueInMonth = p.due_date >= monthStart && p.due_date <= monthEnd
    return periodOverlaps || dueInMonth
  })
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════ */
const PayrollTab = ({ user }) => {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [year, setYear] = useState(today.getFullYear())
  const [view, setView] = useState('register') // register | master | ledger
  const [karigars, setKarigars] = useState([])
  const [runs, setRuns] = useState([])
  const [entries, setEntries] = useState([])
  const [advances, setAdvances] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedKarigar, setSelectedKarigar] = useState(null)

  // Master form
  const [showForm, setShowForm] = useState(false)
  const [editingKarigar, setEditingKarigar] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  // Pay modal
  const [payModal, setPayModal] = useState(null) // entry or array of entries
  const [payDate, setPayDate] = useState(todayStr)
  const [payRef, setPayRef] = useState('')

  // OT modal
  const [otModal, setOtModal] = useState(null) // entry
  const [otItems, setOtItems] = useState([])

  // Advance modal
  const [showAdvance, setShowAdvance] = useState(null) // karigar

  function emptyForm() {
    return {
      name: '', role: 'embroidery', department: 'production',
      pay_cycle: 'monthly', base_amount: '',
      has_ot: false, ot_rate: '', ot_mode: 'per_hour',
      phone: '', joining_date: '', notes: '', is_active: true,
    }
  }

  // ─── Data fetch ────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    const mm = String(month).padStart(2, '0')
    const startOfMonth = `${year}-${mm}-01`
    const endOfMonth = `${year}-${mm}-${String(lastDay(year, month)).padStart(2, '0')}`
    // Also fetch previous month's runs (carry-over periods due this month)
    const prevYear = month === 1 ? year - 1 : year
    const prevMonth = month === 1 ? 12 : month - 1
    const prevMm = String(prevMonth).padStart(2, '0')
    const startOfPrevMonth = `${prevYear}-${prevMm}-01`

    const [kR, rR, aR, oR] = await Promise.all([
      supa.from('karigars').select('*').order('name'),
      supa.from('payroll_runs').select('*').gte('period_start', startOfPrevMonth).lte('period_end', endOfMonth).order('period_start'),
      supa.from('karigar_advances').select('*').order('date', { ascending: false }),
      supa.from('shopify_orders').select('id, order_number, customer_name, line_items, created_at').order('created_at', { ascending: false }).limit(200),
    ])

    setKarigars(kR.data || [])
    setRuns(rR.data || [])
    setAdvances(aR.data || [])
    setOrders(oR.data || [])

    if (rR.data && rR.data.length > 0) {
      const runIds = rR.data.map(r => r.id)
      const { data: eData } = await supa.from('payroll_entries').select('*').in('run_id', runIds)
      setEntries(eData || [])
    } else {
      setEntries([])
    }
    setLoading(false)
  }, [month, year])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ─── Master CRUD ───────────────────────────────────────────────────────
  const openAdd = () => { setEditingKarigar(null); setForm(emptyForm()); setShowForm(true) }
  const openEdit = (k) => {
    setEditingKarigar(k)
    setForm({
      name: k.name || '', role: k.role || 'embroidery', department: k.department || 'production',
      pay_cycle: k.pay_cycle || 'monthly', base_amount: k.base_amount || '',
      has_ot: !!(k.ot_flat_rate || k.ot_mode !== 'none'),
      ot_rate: k.ot_flat_rate || '', ot_mode: k.ot_mode || 'per_hour',
      phone: k.phone || '', joining_date: k.joining_date || '', notes: k.notes || '',
      is_active: k.is_active !== false,
    })
    setShowForm(true)
  }

  const saveKarigar = async () => {
    if (!form.name.trim()) return toast(false, 'Name is required')
    if (!form.base_amount || parseFloat(form.base_amount) <= 0) return toast(false, 'Salary amount is required')
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(), role: form.role, department: form.department,
        pay_cycle: form.pay_cycle, base_amount: parseFloat(form.base_amount),
        ot_type: form.has_ot ? 'flat' : 'none',
        ot_mode: form.has_ot ? form.ot_mode : 'none',
        ot_flat_rate: form.has_ot ? (parseFloat(form.ot_rate) || 0) : null,
        ot_multiplier: null, phone: form.phone,
        joining_date: form.joining_date || null, is_active: form.is_active, notes: form.notes,
      }
      if (editingKarigar) {
        const { error } = await supa.from('karigars').update(payload).eq('id', editingKarigar.id)
        if (error) throw error
        toast(true, 'Karigar updated')
      } else {
        const { error } = await supa.from('karigars').insert([payload])
        if (error) throw error
        toast(true, 'Karigar added')
      }
      setShowForm(false); fetchAll()
    } catch (e) { toast(false, 'Save failed: ' + e.message) } finally { setSaving(false) }
  }

  const deactivateKarigar = async (k) => {
    if (!window.confirm(`Deactivate ${k.name}?`)) return
    await supa.from('karigars').update({ is_active: false }).eq('id', k.id)
    toast(true, `${k.name} deactivated`); fetchAll()
  }
  const activateKarigar = async (k) => {
    await supa.from('karigars').update({ is_active: true }).eq('id', k.id)
    toast(true, `${k.name} activated`); fetchAll()
  }

  // ─── Generate Payroll ──────────────────────────────────────────────────
  const generatePayroll = async () => {
    const activeK = karigars.filter(k => k.is_active)
    if (activeK.length === 0) return toast(false, 'No active karigars')

    const existingKeys = new Set(entries.map(e => {
      const run = runs.find(r => r.id === e.run_id)
      return run ? `${e.karigar_id}|${run.period_start}|${run.period_end}` : ''
    }))

    setLoading(true)
    try {
      let created = 0
      for (const k of activeK) {
        const periods = periodsForKarigar(k, year, month)
        for (const p of periods) {
          const key = `${k.id}|${p.period_start}|${p.period_end}`
          if (existingKeys.has(key)) continue

          // Find or create run
          let run = runs.find(r => r.period_start === p.period_start && r.period_end === p.period_end)
          if (!run) {
            const { data: nr, error } = await supa.from('payroll_runs')
              .insert({ period_start: p.period_start, period_end: p.period_end, status: 'draft' })
              .select().single()
            if (error) throw error
            run = nr
            setRuns(prev => [...prev, run])
          }

          // Base amount IS the per-period amount — no division
          const baseAmount = Math.round(n(k.base_amount))

          // Auto-deduct advances
          const kAdvances = advances.filter(a => a.karigar_id === k.id && n(a.remaining) > 0)
          let advanceDeduct = 0
          for (const adv of kAdvances) {
            if (advanceDeduct >= baseAmount) break
            const deduct = adv.recovery_mode === 'installment' && n(adv.installment_amount) > 0
              ? Math.min(n(adv.installment_amount), n(adv.remaining))
              : n(adv.remaining) // full recovery
            advanceDeduct += deduct
          }
          advanceDeduct = Math.min(advanceDeduct, baseAmount)

          const netPay = baseAmount - advanceDeduct

          const { error: eErr } = await supa.from('payroll_entries').insert({
            run_id: run.id, karigar_id: k.id,
            base_amount: baseAmount,
            hours_worked: k.pay_cycle === 'daily' ? (p.working_days || 26) : null,
            ot_hours: 0, ot_amount: 0, ot_line_items: [],
            deductions: 0, advance_deducted: advanceDeduct,
            leaves: 0,
            net_pay: netPay, due_date: p.due_date,
            settled: false,
          })
          if (eErr) throw eErr
          created++
        }
      }
      if (created === 0) toast(false, 'All entries already exist for this month')
      else toast(true, `Generated ${created} payroll entries`)
      fetchAll()
    } catch (e) { toast(false, 'Generation failed: ' + e.message) } finally { setLoading(false) }
  }

  // ─── Inline field update ───────────────────────────────────────────────
  const updateEntry = async (entryId, field, value) => {
    const numVal = parseFloat(value) || 0
    const entry = entries.find(e => e.id === entryId)
    if (!entry) return
    const k = karigars.find(k => k.id === entry.karigar_id)

    let updates = { [field]: numVal }

    if (field === 'base_amount') {
      updates.net_pay = numVal + n(entry.ot_amount) - n(entry.deductions) - n(entry.advance_deducted)
    } else if (field === 'deductions') {
      updates.net_pay = n(entry.base_amount) + n(entry.ot_amount) - numVal - n(entry.advance_deducted)
    } else if (field === 'leaves') {
      // Deduction = leaves × (base_amount / working_days_in_period)
      const run = runs.find(r => r.id === entry.run_id)
      let dailyRate = n(k?.base_amount)
      if (k?.pay_cycle === 'daily') dailyRate = n(k?.base_amount)
      else if (k?.pay_cycle === 'weekly') dailyRate = Math.round(n(k?.base_amount) / 6)
      else if (k?.pay_cycle === 'biweekly') dailyRate = Math.round(n(k?.base_amount) / 13)
      else dailyRate = Math.round(n(k?.base_amount) / 26)
      const leaveDeduction = Math.round(numVal * dailyRate)
      updates.deductions = leaveDeduction
      updates.net_pay = n(entry.base_amount) + n(entry.ot_amount) - leaveDeduction - n(entry.advance_deducted)
    } else if (field === 'hours_worked') {
      // Daily: recalc base = days × daily rate
      const dailyRate = n(k?.base_amount)
      const newBase = Math.round(numVal * dailyRate)
      updates.base_amount = newBase
      updates.net_pay = newBase + n(entry.ot_amount) - n(entry.deductions) - n(entry.advance_deducted)
    }

    const { error } = await supa.from('payroll_entries').update(updates).eq('id', entryId)
    if (error) return toast(false, error.message)
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, ...updates } : e))
  }

  // ─── OT Modal ──────────────────────────────────────────────────────────
  const openOT = (entry) => {
    setOtModal(entry)
    setOtItems(entry.ot_line_items || [])
  }
  const addOtItem = (dates) => {
    const k = karigars.find(k => k.id === otModal?.karigar_id)
    const mode = k?.ot_mode || 'per_hour'
    // dates can be an array of date strings for multi-add, or undefined for single
    const datesToAdd = dates || [todayStr]
    setOtItems(prev => [...prev, ...datesToAdd.map(d => ({
      mode, date: d, hours: 0, rate: n(k?.ot_flat_rate), amount: 0,
      order_id: '', order_number: '', description: '',
    }))])
  }
  const updateOtItem = (idx, field, value) => {
    setOtItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const updated = { ...item, [field]: value }
      if (field === 'hours' || field === 'rate') {
        updated.amount = Math.round(n(updated.hours) * n(updated.rate))
      }
      return updated
    }))
  }
  const removeOtItem = (idx) => setOtItems(prev => prev.filter((_, i) => i !== idx))
  const saveOT = async () => {
    if (!otModal) return
    const totalOT = otItems.reduce((s, i) => s + n(i.amount), 0)
    const entry = otModal
    const updates = {
      ot_line_items: otItems,
      ot_hours: otItems.filter(i => i.mode === 'per_hour').reduce((s, i) => s + n(i.hours), 0),
      ot_amount: totalOT,
      net_pay: n(entry.base_amount) + totalOT - n(entry.deductions) - n(entry.advance_deducted),
    }
    const { error } = await supa.from('payroll_entries').update(updates).eq('id', entry.id)
    if (error) return toast(false, error.message)
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, ...updates } : e))
    setOtModal(null)
    toast(true, 'OT saved')
  }

  // ─── Mark Paid (single or bulk) ────────────────────────────────────────
  const openPay = (entryOrEntries) => {
    setPayModal(Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries])
    setPayDate(todayStr); setPayRef('')
  }
  const markPaid = async () => {
    if (!payModal || payModal.length === 0) return
    try {
      for (const entry of payModal) {
        await supa.from('payroll_entries').update({
          payment_mode: 'bank', reference: payRef || null, paid_date: payDate, utr: payRef || null,
        }).eq('id', entry.id)
        // Recover advances
        if (n(entry.advance_deducted) > 0) {
          const kAdvs = advances.filter(a => a.karigar_id === entry.karigar_id && n(a.remaining) > 0).sort((a, b) => a.date.localeCompare(b.date))
          let remaining = n(entry.advance_deducted)
          for (const adv of kAdvs) {
            if (remaining <= 0) break
            const recover = Math.min(remaining, n(adv.remaining))
            await supa.from('karigar_advances').update({
              recovered: n(adv.recovered) + recover,
              remaining: n(adv.remaining) - recover,
              linked_entry_id: entry.id,
            }).eq('id', adv.id)
            remaining -= recover
          }
        }
      }
      setPayModal(null); setPayRef('')
      toast(true, `${payModal.length} ${payModal.length === 1 ? 'entry' : 'entries'} marked paid`)
      fetchAll()
    } catch (e) { toast(false, e.message) }
  }

  // ─── Advance CRUD ──────────────────────────────────────────────────────
  const [advForm, setAdvForm] = useState({ amount: '', type: 'advance', recovery_mode: 'full', installment_amount: '', notes: '', date: todayStr })
  const saveAdvance = async () => {
    if (!showAdvance || !advForm.amount) return
    const amt = parseFloat(advForm.amount)
    const { error } = await supa.from('karigar_advances').insert({
      karigar_id: showAdvance.id, date: advForm.date, amount: amt, type: advForm.type,
      recovery_mode: advForm.recovery_mode,
      installment_amount: advForm.recovery_mode === 'installment' ? parseFloat(advForm.installment_amount) || 0 : 0,
      recovered: 0, remaining: amt, notes: advForm.notes,
    })
    if (error) return toast(false, error.message)
    setShowAdvance(null)
    setAdvForm({ amount: '', type: 'advance', recovery_mode: 'full', installment_amount: '', notes: '', date: todayStr })
    toast(true, 'Advance recorded'); fetchAll()
  }

  const deleteEntry = async (entryId) => {
    if (!window.confirm('Delete this entry?')) return
    await supa.from('payroll_entries').delete().eq('id', entryId)
    setEntries(prev => prev.filter(e => e.id !== entryId))
    toast(true, 'Entry deleted')
  }

  // ─── Derived data ──────────────────────────────────────────────────────
  const activeKarigars = karigars.filter(k => k.is_active)
  const inactiveKarigars = karigars.filter(k => !k.is_active)

  const summary = useMemo(() => {
    const dueEntries = entries.filter(e => !e.payment_mode && !e.settled && e.due_date && e.due_date <= todayStr)
    return {
      total: entries.length,
      totalNet: entries.reduce((s, e) => s + n(e.net_pay), 0),
      totalOT: entries.reduce((s, e) => s + n(e.ot_amount), 0),
      paid: entries.filter(e => e.payment_mode || e.settled).length,
      due: dueEntries.length,
      dueAmount: dueEntries.reduce((s, e) => s + n(e.net_pay), 0),
      upcoming: entries.filter(e => !e.payment_mode && !e.settled && (!e.due_date || e.due_date > todayStr)).length,
    }
  }, [entries, todayStr])

  // Group entries by karigar
  const entriesByKarigar = useMemo(() => {
    const grouped = {}
    entries.forEach(e => {
      if (!grouped[e.karigar_id]) grouped[e.karigar_id] = []
      grouped[e.karigar_id].push(e)
    })
    Object.values(grouped).forEach(arr => arr.sort((a, b) => {
      const rA = runs.find(r => r.id === a.run_id)
      const rB = runs.find(r => r.id === b.run_id)
      return (rA?.period_start || '').localeCompare(rB?.period_start || '')
    }))
    return grouped
  }, [entries, runs])

  // Pending due entries for bulk pay
  const allDueEntries = entries.filter(e => !e.payment_mode && !e.settled && e.due_date && e.due_date <= todayStr)

  // ─── Karigar Ledger Data ───────────────────────────────────────────────
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const openLedger = async (k) => {
    setSelectedKarigar(k); setView('ledger'); setLedgerLoading(true)
    const { data } = await supa.from('payroll_entries')
      .select('*, payroll_runs(period_start, period_end)')
      .eq('karigar_id', k.id)
      .order('due_date', { ascending: false })
    setLedgerEntries(data || []); setLedgerLoading(false)
  }
  const karigarAdvances = selectedKarigar ? advances.filter(a => a.karigar_id === selectedKarigar.id) : []
  const karigarAdvBal = karigarAdvances.reduce((s, a) => s + n(a.remaining), 0)

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily: 'Manrope, sans-serif', padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: C.text }}>Karigar Payroll</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <TabBtn active={view === 'register'} onClick={() => { setView('register'); setSelectedKarigar(null) }}>Payroll Register</TabBtn>
          <TabBtn active={view === 'master'} onClick={() => { setView('master'); setSelectedKarigar(null) }}>Karigar Master</TabBtn>
        </div>
      </div>

      {/* ─── LEDGER VIEW ───────────────────────────────────────────────── */}
      {view === 'ledger' && selectedKarigar && (
        <div>
          <button onClick={() => { setView('register'); setSelectedKarigar(null) }} style={{ background: 'none', border: 'none', color: C.gold, fontWeight: 600, cursor: 'pointer', marginBottom: '1rem', fontSize: '0.9rem' }}>
            ← Back to Register
          </button>
          <div style={{ ...cardStyle, background: C.navy, color: '#fff', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>{selectedKarigar.name}</h2>
                <div style={{ fontSize: '0.8rem', opacity: 0.5, marginTop: '0.25rem' }}>{selectedKarigar.role} · {selectedKarigar.department} · {FREQ_LABEL[selectedKarigar.pay_cycle] || selectedKarigar.pay_cycle}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Salary: {fmtCurrency(selectedKarigar.base_amount)} per period</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', opacity: 0.4, letterSpacing: '0.05em' }}>Advance Balance</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: karigarAdvBal > 0 ? '#ef4444' : C.green, ...mono }}>{fmtCurrency(karigarAdvBal)}</div>
                <button onClick={() => { setShowAdvance(selectedKarigar); setAdvForm({ amount: '', type: 'advance', recovery_mode: 'full', installment_amount: '', notes: '', date: todayStr }) }}
                  style={{ ...btnStyle, marginTop: '0.5rem', backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.75rem', padding: '0.4rem 1rem' }}>+ Record Advance</button>
              </div>
            </div>
          </div>

          {/* Advances list */}
          {karigarAdvances.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: C.text }}>Advances & Loans</h3>
              <table style={tableStyle}>
                <thead><tr style={{ backgroundColor: C.cream }}>
                  <Th>Date</Th><Th>Type</Th><Th align="right">Amount</Th><Th align="right">Recovered</Th><Th align="right">Remaining</Th><Th>Recovery</Th><Th>Notes</Th>
                </tr></thead>
                <tbody>
                  {karigarAdvances.map(a => (
                    <tr key={a.id} style={{ borderBottom: `1px solid ${C.borderLight}`, opacity: n(a.remaining) <= 0 ? 0.5 : 1 }}>
                      <Td>{fmtDate(a.date)}</Td>
                      <Td><Badge color={a.type === 'advance' ? C.amber : C.blue} bg={a.type === 'advance' ? C.amberBg : C.blueBg}>{a.type}</Badge></Td>
                      <Td align="right" mono>{fmtCurrency(a.amount)}</Td>
                      <Td align="right" mono style={{ color: C.green }}>{fmtCurrency(a.recovered)}</Td>
                      <Td align="right" mono bold>{fmtCurrency(a.remaining)}</Td>
                      <Td>{a.recovery_mode}{a.recovery_mode === 'installment' ? ` (₹${n(a.installment_amount)}/period)` : ''}</Td>
                      <Td>{a.notes || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Payment History */}
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: C.text }}>Payment History ({ledgerEntries.length})</h3>
            {ledgerLoading ? <div style={{ textAlign: 'center', padding: '2rem', color: C.textMuted }}>Loading...</div> : (
              <table style={tableStyle}>
                <thead><tr style={{ backgroundColor: C.cream }}>
                  <Th>Period</Th><Th>Due Date</Th><Th align="right">Base</Th><Th align="right">OT</Th>
                  <Th align="right">Deductions</Th><Th align="right">Adv. Ded.</Th><Th align="right">Net Pay</Th><Th>Status</Th>
                </tr></thead>
                <tbody>
                  {ledgerEntries.map(e => {
                    const isPaid = !!e.payment_mode || e.settled
                    const isSettled = !!e.settled
                    const isPartial = !isSettled && n(e.amount_paid) > 0 && n(e.balance_due) > 0
                    const isDue = !isPaid && !isPartial && e.due_date && e.due_date <= todayStr
                    return (
                      <tr key={e.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                        <Td>{e.payroll_runs ? `${fmtDate(e.payroll_runs.period_start)} – ${fmtDate(e.payroll_runs.period_end)}` : '—'}</Td>
                        <Td>{e.due_date ? fmtDate(e.due_date) : '—'}</Td>
                        <Td align="right" mono>{fmtCurrency(e.base_amount)}</Td>
                        <Td align="right" mono>{fmtCurrency(e.ot_amount)}</Td>
                        <Td align="right" mono>{fmtCurrency(e.deductions)}</Td>
                        <Td align="right" mono>{n(e.advance_deducted) > 0 ? fmtCurrency(e.advance_deducted) : '—'}</Td>
                        <Td align="right" mono bold>{fmtCurrency(e.net_pay)}</Td>
                        <Td>
                          {isSettled ? <Badge color={C.blue} bg={C.blueBg}>SETTLED</Badge>
                           : isPartial ? <Badge color="#d97706" bg="rgba(217,119,6,0.1)">PARTIAL ₹{n(e.amount_paid).toLocaleString('en-IN')}/{n(e.net_pay).toLocaleString('en-IN')}</Badge>
                           : isPaid ? <Badge color={C.green} bg={C.greenBg}>PAID</Badge>
                           : isDue ? <Badge color="#dc2626" bg="rgba(220,38,38,0.1)">DUE</Badge>
                           : <Badge color={C.textMuted} bg="rgba(107,114,128,0.1)">UPCOMING</Badge>}
                        </Td>
                      </tr>
                    )
                  })}
                  {ledgerEntries.length === 0 && <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No payment history yet.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── MASTER VIEW ───────────────────────────────────────────────── */}
      {view === 'master' && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: C.text }}>Active Karigars ({activeKarigars.length})</h2>
            <button onClick={openAdd} style={{ ...btnStyle, backgroundColor: C.gold, color: '#fff' }}>+ Add Karigar</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead><tr style={{ backgroundColor: C.cream }}>
                <Th>Name</Th><Th>Role</Th><Th>Frequency</Th><Th align="right">Salary / Period</Th><Th>OT</Th><Th>Joining</Th><Th>Adv. Balance</Th><Th align="center">Actions</Th>
              </tr></thead>
              <tbody>
                {activeKarigars.map(k => {
                  const advBal = advances.filter(a => a.karigar_id === k.id).reduce((s, a) => s + n(a.remaining), 0)
                  return (
                    <tr key={k.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      <Td bold><span style={{ cursor: 'pointer', color: C.gold, textDecoration: 'underline' }} onClick={() => openLedger(k)}>{k.name}</span></Td>
                      <Td>{k.role}</Td>
                      <Td>{FREQ_LABEL[k.pay_cycle] || k.pay_cycle}</Td>
                      <Td align="right" mono>{fmtCurrency(k.base_amount)}</Td>
                      <Td>{k.ot_mode === 'per_hour' && k.ot_flat_rate ? `₹${k.ot_flat_rate}/hr` : k.ot_mode === 'per_piece' ? 'Per piece' : '—'}</Td>
                      <Td>{k.joining_date ? fmtDate(k.joining_date) : '—'}</Td>
                      <Td mono>{advBal > 0 ? <span style={{ color: '#dc2626', fontWeight: 600 }}>{fmtCurrency(advBal)}</span> : '—'}</Td>
                      <Td align="center">
                        <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'center' }}>
                          <SmallBtn onClick={() => openEdit(k)} color={C.blue}>Edit</SmallBtn>
                          <SmallBtn onClick={() => { setShowAdvance(k); setAdvForm({ amount: '', type: 'advance', recovery_mode: 'full', installment_amount: '', notes: '', date: todayStr }) }} color={C.amber}>Advance</SmallBtn>
                          <SmallBtn onClick={() => deactivateKarigar(k)} color={C.red}>Deactivate</SmallBtn>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
                {activeKarigars.length === 0 && <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: C.textMuted }}>No active karigars.</td></tr>}
              </tbody>
            </table>
          </div>
          {inactiveKarigars.length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: C.textMuted, marginBottom: '0.75rem' }}>Inactive ({inactiveKarigars.length})</h3>
              <table style={tableStyle}>
                <thead><tr style={{ backgroundColor: C.cream }}><Th>Name</Th><Th>Role</Th><Th align="right">Salary</Th><Th align="center">Actions</Th></tr></thead>
                <tbody>
                  {inactiveKarigars.map(k => (
                    <tr key={k.id} style={{ borderBottom: `1px solid ${C.borderLight}`, opacity: 0.6 }}>
                      <Td bold>{k.name}</Td><Td>{k.role}</Td><Td align="right" mono>{fmtCurrency(k.base_amount)}</Td>
                      <Td align="center"><SmallBtn onClick={() => activateKarigar(k)} color={C.green}>Activate</SmallBtn></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── REGISTER VIEW ─────────────────────────────────────────────── */}
      {view === 'register' && !selectedKarigar && (
        <>
          {/* Controls */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))} style={selectStyle}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" min={2020} value={year} onChange={e => setYear(parseInt(e.target.value))} style={{ ...selectStyle, width: '90px' }} />
            </div>
            <button onClick={generatePayroll} disabled={loading} style={{ ...btnStyle, backgroundColor: C.gold, color: '#fff', opacity: loading ? 0.6 : 1 }}>
              Generate for {MONTHS[month - 1]}
            </button>
            {allDueEntries.length > 0 && (
              <button onClick={() => openPay(allDueEntries)} style={{ ...btnStyle, backgroundColor: C.green, color: '#fff' }}>
                Pay All Due ({allDueEntries.length}) — {fmtCurrency(summary.dueAmount)}
              </button>
            )}
          </div>

          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <SummaryCard label="Entries" value={summary.total} />
            <SummaryCard label="Total Net" value={fmtCurrency(summary.totalNet)} color={C.gold} />
            <SummaryCard label="OT Amount" value={fmtCurrency(summary.totalOT)} color={C.amber} />
            <SummaryCard label="Paid" value={summary.paid} color={C.green} />
            <SummaryCard label="Due" value={summary.due} color="#dc2626" />
            <SummaryCard label="Upcoming" value={summary.upcoming} color={C.textMuted} />
          </div>

          {/* Entries Table */}
          <div style={cardStyle}>
            {loading && entries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: C.textMuted }}>Loading...</div>
            ) : entries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: C.textMuted }}>
                No payroll entries for {MONTHS[month - 1]} {year}. Click "Generate" to create entries.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead><tr style={{ backgroundColor: C.cream }}>
                    <Th>Karigar</Th><Th>Period</Th><Th>Due Date</Th>
                    <Th align="right">{entries.some(e => { const k = karigars.find(kk => kk.id === e.karigar_id); return k?.pay_cycle === 'daily' }) ? 'Days' : 'Leaves'}</Th>
                    <Th align="right">Base</Th><Th align="right">OT</Th>
                    <Th align="right">Deductions</Th><Th align="right">Adv. Ded.</Th>
                    <Th align="right">Net Pay</Th><Th align="center">Status</Th><Th align="center">Actions</Th>
                  </tr></thead>
                  <tbody>
                    {Object.keys(entriesByKarigar).sort((a, b) => {
                      const ka = karigars.find(k => k.id === a)
                      const kb = karigars.find(k => k.id === b)
                      return (ka?.name || '').localeCompare(kb?.name || '')
                    }).map(karigarId => {
                      const k = karigars.find(kk => kk.id === karigarId)
                      const kEntries = entriesByKarigar[karigarId]
                      return kEntries.map((entry, idx) => {
                        const run = runs.find(r => r.id === entry.run_id)
                        const isPaid = !!entry.payment_mode || entry.settled
                        const isSettled = !!entry.settled
                        const isPartial = !isSettled && n(entry.amount_paid) > 0 && n(entry.balance_due) > 0
                        const isDue = !isPaid && !isPartial && entry.due_date && entry.due_date <= todayStr
                        const hasOT = k && (k.ot_flat_rate > 0 || k.ot_mode === 'per_piece')
                        const isDaily = k?.pay_cycle === 'daily'
                        const isLocked = isPaid || isSettled || isPartial

                        return (
                          <tr key={entry.id} style={{ borderBottom: `1px solid ${C.borderLight}`, backgroundColor: isDue ? 'rgba(220,38,38,0.03)' : undefined }}>
                            <Td bold>
                              {idx === 0 ? (
                                <span style={{ cursor: 'pointer', color: C.gold, textDecoration: 'underline' }} onClick={() => openLedger(k)}>{k?.name || '—'}</span>
                              ) : ''}
                            </Td>
                            <Td>
                              <span style={{ fontSize: '0.8rem', color: C.textMuted }}>
                                {run ? `${fmtDate(run.period_start)} – ${fmtDate(run.period_end)}` : '—'}
                              </span>
                            </Td>
                            <Td>
                              <span style={{ fontSize: '0.8rem', color: isDue ? '#dc2626' : C.textMuted, fontWeight: isDue ? 600 : 400 }}>
                                {entry.due_date ? fmtDate(entry.due_date) : '—'}
                              </span>
                            </Td>
                            <Td align="right" mono>
                              {isDaily ? (
                                isLocked ? (entry.hours_worked || '—') : (
                                  <InlineEdit value={entry.hours_worked || 26} onSave={v => updateEntry(entry.id, 'hours_worked', v)} />
                                )
                              ) : (
                                isLocked ? (n(entry.leaves) > 0 ? entry.leaves : '—') : (
                                  <InlineEdit value={entry.leaves || 0} onSave={v => updateEntry(entry.id, 'leaves', v)} />
                                )
                              )}
                            </Td>
                            <Td align="right" mono>
                              {isLocked ? fmtCurrency(entry.base_amount) : (
                                <InlineEdit value={entry.base_amount || 0} onSave={v => updateEntry(entry.id, 'base_amount', v)} />
                              )}
                            </Td>
                            <Td align="right" mono>
                              {!hasOT ? '—' : (
                                <span style={{ cursor: isLocked ? 'default' : 'pointer', color: n(entry.ot_amount) > 0 ? C.amber : C.textLight, textDecoration: isLocked ? 'none' : 'underline' }}
                                  onClick={() => !isLocked && openOT(entry)}>
                                  {n(entry.ot_amount) > 0 ? fmtCurrency(entry.ot_amount) : '+ OT'}
                                </span>
                              )}
                            </Td>
                            <Td align="right" mono>
                              {isLocked ? (n(entry.deductions) > 0 ? fmtCurrency(entry.deductions) : '—') : (
                                <InlineEdit value={entry.deductions || 0} onSave={v => updateEntry(entry.id, 'deductions', v)} />
                              )}
                            </Td>
                            <Td align="right" mono>
                              {n(entry.advance_deducted) > 0 ? <span style={{ color: '#dc2626' }}>{fmtCurrency(entry.advance_deducted)}</span> : '—'}
                            </Td>
                            <Td align="right" mono bold>{fmtCurrency(entry.net_pay)}</Td>
                            <Td align="center">
                              {isSettled ? <Badge color={C.blue} bg={C.blueBg}>SETTLED</Badge>
                               : isPartial ? <Badge color="#d97706" bg="rgba(217,119,6,0.1)">PARTIAL ₹{n(entry.amount_paid).toLocaleString('en-IN')}/{n(entry.net_pay).toLocaleString('en-IN')}</Badge>
                               : isPaid ? <Badge color={C.green} bg={C.greenBg}>PAID</Badge>
                               : isDue ? <Badge color="#dc2626" bg="rgba(220,38,38,0.1)">DUE</Badge>
                               : <Badge color={C.textMuted} bg="rgba(107,114,128,0.1)">UPCOMING</Badge>}
                            </Td>
                            <Td align="center">
                              <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'center' }}>
                                {!isLocked && <SmallBtn onClick={() => openPay([entry])} color={C.green}>Pay</SmallBtn>}
                                {!isSettled && <SmallBtn onClick={() => deleteEntry(entry.id)} color={C.red}>Del</SmallBtn>}
                              </div>
                            </Td>
                          </tr>
                        )
                      })
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Karigar Form Modal ──────────────────────────────────────── */}
      {showForm && (
        <>
          <Overlay onClick={() => setShowForm(false)} />
          <Modal>
            <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: 700, color: C.text }}>
              {editingKarigar ? `Edit ${editingKarigar.name}` : 'Add Karigar'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField label="Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
              <FormField label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
              <div>
                <label style={labelStyle}>Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={selectStyle}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Department</label>
                <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} style={selectStyle}>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Pay Frequency</label>
                <select value={form.pay_cycle} onChange={e => setForm(f => ({ ...f, pay_cycle: e.target.value }))} style={selectStyle}>
                  {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              <FormField label="Salary Amount (per period) *" type="number" value={form.base_amount} onChange={v => setForm(f => ({ ...f, base_amount: v }))} />
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
                  <input type="checkbox" checked={form.has_ot} onChange={e => setForm(f => ({ ...f, has_ot: e.target.checked }))} />
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: C.text }}>Has Overtime (OT)</span>
                </label>
                {form.has_ot && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={labelStyle}>OT Mode</label>
                      <select value={form.ot_mode} onChange={e => setForm(f => ({ ...f, ot_mode: e.target.value }))} style={selectStyle}>
                        <option value="per_hour">Per Hour</option>
                        <option value="per_piece">Per Piece (Order-based)</option>
                      </select>
                    </div>
                    {form.ot_mode === 'per_hour' && (
                      <FormField label="OT Rate (₹/hour)" type="number" value={form.ot_rate} onChange={v => setForm(f => ({ ...f, ot_rate: v }))} />
                    )}
                  </div>
                )}
              </div>
              <FormField label="Joining Date" type="date" value={form.joining_date} onChange={v => setForm(f => ({ ...f, joining_date: v }))} />
              <FormField label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ ...btnStyle, backgroundColor: C.cream, color: C.text }}>Cancel</button>
              <button onClick={saveKarigar} disabled={saving} style={{ ...btnStyle, backgroundColor: C.gold, color: '#fff', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : editingKarigar ? 'Update' : 'Add Karigar'}
              </button>
            </div>
          </Modal>
        </>
      )}

      {/* ─── Pay Modal (single or bulk) ──────────────────────────────── */}
      {payModal && (
        <>
          <Overlay onClick={() => setPayModal(null)} />
          <Modal>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem', fontWeight: 700, color: C.text }}>
              {payModal.length === 1 ? 'Mark as Paid' : `Pay ${payModal.length} Entries`}
            </h2>
            {payModal.length > 1 && (
              <div style={{ ...cardStyle, marginBottom: '1rem', padding: '1rem', background: C.cream }}>
                {payModal.map(e => {
                  const k = karigars.find(kk => kk.id === e.karigar_id)
                  return <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '0.25rem 0' }}>
                    <span style={{ fontWeight: 600 }}>{k?.name || '—'}</span><span style={mono}>{fmtCurrency(e.net_pay)}</span>
                  </div>
                })}
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '0.9rem' }}>
                  <span>Total</span><span style={mono}>{fmtCurrency(payModal.reduce((s, e) => s + n(e.net_pay), 0))}</span>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <FormField label="Paid Date" type="date" value={payDate} onChange={setPayDate} />
              <FormField label="UTR / Reference" value={payRef} onChange={setPayRef} />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setPayModal(null)} style={{ ...btnStyle, backgroundColor: C.cream, color: C.text }}>Cancel</button>
              <button onClick={markPaid} style={{ ...btnStyle, backgroundColor: C.green, color: '#fff' }}>Confirm Payment</button>
            </div>
          </Modal>
        </>
      )}

      {/* ─── OT Modal ────────────────────────────────────────────────── */}
      {otModal && (
        <>
          <Overlay onClick={() => setOtModal(null)} />
          <Modal>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700, color: C.text }}>Overtime Entry</h2>
            {(() => {
              const run = runs.find(r => r.id === otModal.run_id)
              const k = karigars.find(kk => kk.id === otModal.karigar_id)
              return (
                <div style={{ fontSize: '0.8rem', color: C.textMuted, marginBottom: '1rem' }}>
                  {k?.name} · {run ? `${fmtDate(run.period_start)} – ${fmtDate(run.period_end)}` : '—'}
                  {k?.ot_mode === 'per_hour' && k.ot_flat_rate ? ` · Default rate: ₹${k.ot_flat_rate}/hr` : ''}
                </div>
              )
            })()}
            {/* Date picker grid — select dates to add OT entries */}
            {(() => {
              const run = runs.find(r => r.id === otModal.run_id)
              if (!run) return null
              const start = new Date(run.period_start + 'T00:00:00')
              const end = new Date(run.period_end + 'T00:00:00')
              const dates = []
              for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                dates.push(d.toISOString().split('T')[0])
              }
              const usedDates = new Set(otItems.map(i => i.date).filter(Boolean))
              const availDates = dates.filter(d => !usedDates.has(d))
              if (availDates.length === 0) return null
              return (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ ...labelStyle, marginBottom: '0.5rem', display: 'block' }}>Select dates (click to add OT row)</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {dates.map(d => {
                      const used = usedDates.has(d)
                      const day = new Date(d + 'T00:00:00').getDate()
                      const isWeekend = [0, 6].includes(new Date(d + 'T00:00:00').getDay())
                      return (
                        <button key={d} onClick={() => !used && addOtItem([d])} disabled={used}
                          style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.375rem', border: `1px solid ${used ? C.gold : C.border}`, background: used ? C.goldLight : isWeekend ? 'rgba(107,114,128,0.06)' : C.cardBg, color: used ? C.gold : C.text, fontWeight: used ? 700 : 500, fontSize: '0.75rem', cursor: used ? 'default' : 'pointer', opacity: used ? 0.6 : 1 }}>
                          {day}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {otItems.length === 0 && <div style={{ textAlign: 'center', padding: '1rem', color: C.textMuted, fontSize: '0.85rem' }}>Click a date above to add an OT entry.</div>}
            {otItems.map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: item.mode === 'per_hour' ? '80px 1fr 1fr 1fr auto' : '80px 2fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'end' }}>
                <div>
                  {idx === 0 && <label style={labelStyle}>Date</label>}
                  <div style={{ padding: '0.5rem 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: C.text, ...mono }}>
                    {item.date ? new Date(item.date + 'T00:00:00').getDate() + '/' + (new Date(item.date + 'T00:00:00').getMonth() + 1) : '—'}
                  </div>
                </div>
                {item.mode === 'per_hour' ? (
                  <>
                    <FormField label={idx === 0 ? 'Hours' : ''} type="number" value={item.hours} onChange={v => updateOtItem(idx, 'hours', parseFloat(v) || 0)} />
                    <FormField label={idx === 0 ? 'Rate (₹/hr)' : ''} type="number" value={item.rate} onChange={v => updateOtItem(idx, 'rate', parseFloat(v) || 0)} />
                    <div>
                      {idx === 0 && <label style={labelStyle}>Amount</label>}
                      <div style={{ padding: '0.5rem 0.75rem', fontWeight: 700, ...mono, fontSize: '0.9rem', color: C.gold }}>{fmtCurrency(item.amount)}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      {idx === 0 && <label style={labelStyle}>Order / Description</label>}
                      <select value={item.order_id || ''} onChange={e => {
                        const ord = orders.find(o => o.id === e.target.value)
                        updateOtItem(idx, 'order_id', e.target.value)
                        updateOtItem(idx, 'order_number', ord?.order_number || '')
                        updateOtItem(idx, 'description', ord ? `Order ${ord.order_number}` : '')
                      }} style={selectStyle}>
                        <option value="">Select order...</option>
                        {orders.map(o => <option key={o.id} value={o.id}>#{o.order_number} — {o.customer_name}</option>)}
                      </select>
                    </div>
                    <FormField label={idx === 0 ? 'Amount (₹)' : ''} type="number" value={item.amount} onChange={v => updateOtItem(idx, 'amount', parseFloat(v) || 0)} />
                  </>
                )}
                <button onClick={() => removeOtItem(idx)} style={{ padding: '0.4rem 0.6rem', border: 'none', background: 'rgba(220,38,38,0.1)', color: '#dc2626', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.1rem' }}>✕</button>
              </div>
            ))}
            <button onClick={() => addOtItem()} style={{ ...btnStyle, backgroundColor: C.cream, color: C.gold, width: '100%', marginTop: '0.5rem', fontSize: '0.8rem' }}>+ Add OT Entry</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', ...mono }}>Total OT: <span style={{ color: C.gold }}>{fmtCurrency(otItems.reduce((s, i) => s + n(i.amount), 0))}</span></div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setOtModal(null)} style={{ ...btnStyle, backgroundColor: C.cream, color: C.text }}>Cancel</button>
                <button onClick={saveOT} style={{ ...btnStyle, backgroundColor: C.gold, color: '#fff' }}>Save OT</button>
              </div>
            </div>
          </Modal>
        </>
      )}

      {/* ─── Advance Modal ────────────────────────────────────────────── */}
      {showAdvance && (
        <>
          <Overlay onClick={() => setShowAdvance(null)} />
          <Modal>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem', fontWeight: 700, color: C.text }}>Record Advance — {showAdvance.name}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <FormField label="Amount (₹) *" type="number" value={advForm.amount} onChange={v => setAdvForm(f => ({ ...f, amount: v }))} />
              <FormField label="Date" type="date" value={advForm.date} onChange={v => setAdvForm(f => ({ ...f, date: v }))} />
              <div>
                <label style={labelStyle}>Type</label>
                <select value={advForm.type} onChange={e => setAdvForm(f => ({ ...f, type: e.target.value }))} style={selectStyle}>
                  <option value="advance">Advance</option>
                  <option value="loan">Loan</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Recovery</label>
                <select value={advForm.recovery_mode} onChange={e => setAdvForm(f => ({ ...f, recovery_mode: e.target.value }))} style={selectStyle}>
                  <option value="full">Full (next pay)</option>
                  <option value="installment">Installment</option>
                </select>
              </div>
              {advForm.recovery_mode === 'installment' && (
                <FormField label="Installment Amount (₹/period)" type="number" value={advForm.installment_amount} onChange={v => setAdvForm(f => ({ ...f, installment_amount: v }))} />
              )}
              <FormField label="Notes" value={advForm.notes} onChange={v => setAdvForm(f => ({ ...f, notes: v }))} />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdvance(null)} style={{ ...btnStyle, backgroundColor: C.cream, color: C.text }}>Cancel</button>
              <button onClick={saveAdvance} style={{ ...btnStyle, backgroundColor: C.gold, color: '#fff' }}>Record Advance</button>
            </div>
          </Modal>
        </>
      )}
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────── */
const InlineEdit = ({ value, onSave }) => {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(value)
  useEffect(() => { setInput(value) }, [value])
  const commit = () => { const v = parseFloat(input) || 0; if (v !== value) onSave(v); setEditing(false) }
  if (editing) return (
    <input type="number" value={input} onChange={e => setInput(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setInput(value); setEditing(false) } }}
      autoFocus style={{ width: '70px', padding: '0.25rem 0.4rem', border: `1px solid ${C.gold}`, borderRadius: '0.375rem', ...mono, fontSize: '0.85rem', textAlign: 'right' }} />
  )
  return <span onClick={() => setEditing(true)} style={{ cursor: 'pointer', ...mono, fontSize: '0.85rem' }} title="Click to edit">{typeof value === 'number' && value > 100 ? fmtCurrency(value) : value}</span>
}

const SummaryCard = ({ label, value, color = C.gold }) => (
  <div style={{ backgroundColor: C.cardBg, borderRadius: '1rem', padding: '1.25rem', border: `1px solid ${C.border}` }}>
    <div style={{ fontSize: '0.8rem', color: C.textMuted, marginBottom: '0.25rem' }}>{label}</div>
    <div style={{ fontSize: '1.5rem', fontWeight: 700, color, ...mono }}>{value}</div>
  </div>
)

const Badge = ({ children, color, bg }) => (
  <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: '0.375rem', fontSize: '0.7rem', fontWeight: 700, color, backgroundColor: bg, letterSpacing: '0.03em' }}>{children}</span>
)

const TabBtn = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', border: `1px solid ${active ? C.gold : C.border}`, backgroundColor: active ? C.goldLight : C.cardBg, color: active ? C.gold : C.textMuted, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>{children}</button>
)

const SmallBtn = ({ onClick, color, children }) => (
  <button onClick={onClick} style={{ padding: '0.25rem 0.6rem', borderRadius: '0.375rem', border: 'none', backgroundColor: color + '18', color, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>{children}</button>
)

const FormField = ({ label, value, onChange, type = 'text' }) => (
  <div>
    {label && <label style={labelStyle}>{label}</label>}
    <input type={type} value={value} onChange={e => onChange(e.target.value)} style={selectStyle} />
  </div>
)

const Overlay = ({ onClick }) => (
  <div onClick={onClick} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 999 }} />
)

const Modal = ({ children }) => (
  <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: C.cardBg, borderRadius: '1.5rem', padding: '2rem', zIndex: 1000, width: '90%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>{children}</div>
)

const Th = ({ children, align = 'left' }) => (
  <th style={{ padding: '0.75rem 0.75rem', textAlign: align, fontSize: '0.7rem', fontWeight: 600, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${C.border}` }}>{children}</th>
)

const Td = ({ children, align = 'left', mono: isMono, bold, style: extra = {} }) => (
  <td style={{ padding: '0.75rem 0.75rem', textAlign: align, fontSize: '0.85rem', fontWeight: bold ? 600 : 400, color: C.text, ...(isMono ? mono : {}), ...extra }}>{children}</td>
)

/* ── Styles ──────────────────────────────────────────────────────────── */
const cardStyle = { backgroundColor: C.cardBg, borderRadius: '1.5rem', padding: '1.5rem', border: `1px solid ${C.border}` }
const tableStyle = { width: '100%', borderCollapse: 'collapse' }
const selectStyle = { padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, fontFamily: 'Manrope, sans-serif', fontSize: '0.875rem', width: '100%', boxSizing: 'border-box' }
const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: C.textMuted, marginBottom: '0.25rem' }
const btnStyle = { padding: '0.6rem 1.25rem', borderRadius: '0.5rem', border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }

export default PayrollTab

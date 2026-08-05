import React, { useState, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, fmtDate, fmtCurrency } from '../../lib/designTokens'
import { mirrorLoanEMI } from '../../lib/mirrorPayment'
import { LOAN_TYPES } from './constants'

const Overlay = ({ onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    {children}
  </div>
)

const Field = ({ label, required, children }) => (
  <div className="mb-4">
    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#4e4636', letterSpacing: '0.06em' }}>
      {label}{required && <span style={{ color: C.red }}> *</span>}
    </label>
    {children}
  </div>
)

const Input = (props) => (
  <input {...props} className={`w-full text-sm px-3 py-2.5 rounded-xl outline-none transition-colors focus:ring-2 focus:ring-amber-200 ${props.className || ''}`} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, ...props.style }} />
)

const PaymentModal = ({ loan, onSave, onClose }) => {
  const [form, setForm] = useState({
    amount: loan?.monthly_emi || '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const fld = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const validate = () => {
    if (!form.amount || parseFloat(form.amount) <= 0) return 'Amount must be > 0'
    if (!form.date) return 'Date is required'
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { toast(false, err); return }

    setSaving(true)
    try {
      const { error } = await supa.from('loan_payments').insert([{
        loan_id: loan.id,
        date: form.date,
        amount: parseFloat(form.amount),
        reference: form.reference || null,
        notes: form.notes || null,
      }])
      if (error) throw error
      // Mirror to expense_mirror
      mirrorLoanEMI(loan, form.date, parseFloat(form.amount), form.reference || null)
      toast(true, 'Payment recorded')
      onSave()
    } catch (e) {
      console.error('Save error:', e)
      toast(false, 'Failed to record payment')
    } finally { setSaving(false) }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full sm:w-[450px] max-h-[90vh] overflow-y-auto p-6 shadow-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: C.text }}>Record Payment</h2>
        <div className="text-sm mb-6" style={{ color: C.textMuted }}>
          {loan.lender_name} • EMI: {fmtCurrency(loan.monthly_emi)}
        </div>

        <Field label="Amount" required>
          <Input type="number" placeholder="0" step="0.01" value={form.amount} onChange={e => fld('amount', e.target.value)} />
        </Field>

        <Field label="Date" required>
          <Input type="date" value={form.date} onChange={e => fld('date', e.target.value)} />
        </Field>

        <Field label="Reference / Cheque No">
          <Input type="text" placeholder="Transaction reference" value={form.reference} onChange={e => fld('reference', e.target.value)} />
        </Field>

        <Field label="Notes">
          <textarea className="w-full text-sm px-3 py-2.5 rounded-xl outline-none transition-colors focus:ring-2 focus:ring-amber-200 resize-none" rows="3" value={form.notes} onChange={e => fld('notes', e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
        </Field>

        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} disabled={saving} className="flex-1 font-bold rounded-xl transition-all text-white py-2.5" style={{ background: C.gold, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Record Payment'}
          </button>
          <button onClick={onClose} className="flex-1 font-bold rounded-xl transition-all py-2.5" style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}` }}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}

const LoanFormModal = ({ loan, onSave, onClose }) => {
  const [form, setForm] = useState({
    lender_name: loan?.lender_name || '',
    loan_type: loan?.loan_type || LOAN_TYPES[0],
    principal_amount: loan?.principal_amount || '',
    monthly_emi: loan?.monthly_emi || '',
    outstanding_balance: loan?.outstanding_balance || '',
    emi_due_day: loan?.emi_due_day || '',
    status: loan?.status || 'active',
    disbursement_date: loan?.disbursement_date || new Date().toISOString().split('T')[0],
    notes: loan?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const isEdit = !!loan?.id

  const fld = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const validate = () => {
    if (!form.lender_name.trim()) return 'Lender name is required'
    if (!form.monthly_emi || parseFloat(form.monthly_emi) <= 0) return 'Monthly EMI must be > 0'
    return null
  }

  const handleSave = async () => {
    const err = validate()
    if (err) { toast(false, err); return }
    setSaving(true)
    try {
      const payload = {
        lender_name: form.lender_name.trim(),
        loan_type: form.loan_type,
        principal_amount: form.principal_amount ? parseFloat(form.principal_amount) : null,
        monthly_emi: parseFloat(form.monthly_emi),
        outstanding_balance: form.outstanding_balance ? parseFloat(form.outstanding_balance) : null,
        emi_due_day: form.emi_due_day ? parseInt(form.emi_due_day) : null,
        status: form.status,
        disbursement_date: form.disbursement_date || null,
        notes: form.notes || null,
      }
      if (isEdit) {
        const { error } = await supa.from('loans').update(payload).eq('id', loan.id)
        if (error) throw error
        toast(true, 'Loan updated')
      } else {
        const { error } = await supa.from('loans').insert([payload])
        if (error) throw error
        toast(true, 'Loan created')
      }
      onSave()
    } catch (e) {
      console.error('Save error:', e)
      toast(false, 'Failed to save loan')
    } finally { setSaving(false) }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full sm:w-[500px] max-h-[90vh] overflow-y-auto p-6 shadow-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: C.text }}>{isEdit ? 'Edit Loan' : 'Add Loan'}</h2>

        <Field label="Lender Name" required>
          <Input type="text" placeholder="e.g. Bajaj Finance" value={form.lender_name} onChange={e => fld('lender_name', e.target.value)} />
        </Field>

        <Field label="Loan Type" required>
          <select className="w-full text-sm px-3 py-2.5 rounded-xl outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} value={form.loan_type} onChange={e => fld('loan_type', e.target.value)}>
            {LOAN_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ').toUpperCase()}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Principal Amount">
            <Input type="number" placeholder="0" step="0.01" value={form.principal_amount} onChange={e => fld('principal_amount', e.target.value)} />
          </Field>
          <Field label="Monthly EMI" required>
            <Input type="number" placeholder="0" step="0.01" value={form.monthly_emi} onChange={e => fld('monthly_emi', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Outstanding Balance">
            <Input type="number" placeholder="0" step="0.01" value={form.outstanding_balance} onChange={e => fld('outstanding_balance', e.target.value)} />
          </Field>
          <Field label="EMI Due Day">
            <Input type="number" placeholder="1-31" min="1" max="31" value={form.emi_due_day} onChange={e => fld('emi_due_day', e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select className="w-full text-sm px-3 py-2.5 rounded-xl outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} value={form.status} onChange={e => fld('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </Field>
          <Field label="Start Date">
            <Input type="date" value={form.disbursement_date} onChange={e => fld('disbursement_date', e.target.value)} />
          </Field>
        </div>

        <Field label="Notes">
          <textarea className="w-full text-sm px-3 py-2.5 rounded-xl outline-none transition-colors focus:ring-2 focus:ring-amber-200 resize-none" rows="3" value={form.notes} onChange={e => fld('notes', e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
        </Field>

        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} disabled={saving} className="flex-1 font-bold rounded-xl transition-all text-white py-2.5" style={{ background: C.gold, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : isEdit ? 'Update Loan' : 'Create Loan'}
          </button>
          <button onClick={onClose} className="flex-1 font-bold rounded-xl transition-all py-2.5" style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}` }}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}

const EditPaymentModal = ({ payment, onSave, onClose }) => {
  const [form, setForm] = useState({
    amount: payment?.amount || '',
    date: payment?.date || '',
    reference: payment?.reference || '',
    notes: payment?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const fld = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast(false, 'Amount must be > 0'); return }
    if (!form.date) { toast(false, 'Date is required'); return }
    setSaving(true)
    try {
      const { error } = await supa.from('loan_payments').update({
        amount: parseFloat(form.amount),
        date: form.date,
        reference: form.reference || null,
        notes: form.notes || null,
      }).eq('id', payment.id)
      if (error) throw error
      toast(true, 'Payment updated')
      onSave()
    } catch (e) {
      console.error('Update error:', e)
      toast(false, 'Failed to update payment')
    } finally { setSaving(false) }
  }

  return (
    <Overlay onClose={onClose}>
      <div className="bg-white rounded-2xl w-full sm:w-[450px] max-h-[90vh] overflow-y-auto p-6 shadow-lg" style={{ fontFamily: 'Manrope, sans-serif' }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: C.text }}>Edit Payment</h2>
        <div className="text-sm mb-6" style={{ color: C.textMuted }}>
          {payment.lender_name} • {fmtDate(payment.date)}
        </div>

        <Field label="Amount" required>
          <Input type="number" placeholder="0" step="0.01" value={form.amount} onChange={e => fld('amount', e.target.value)} />
        </Field>

        <Field label="Date" required>
          <Input type="date" value={form.date} onChange={e => fld('date', e.target.value)} />
        </Field>

        <Field label="Reference / Cheque No">
          <Input type="text" placeholder="Transaction reference" value={form.reference} onChange={e => fld('reference', e.target.value)} />
        </Field>

        <Field label="Notes">
          <textarea className="w-full text-sm px-3 py-2.5 rounded-xl outline-none transition-colors focus:ring-2 focus:ring-amber-200 resize-none" rows="3" value={form.notes} onChange={e => fld('notes', e.target.value)} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
        </Field>

        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} disabled={saving} className="flex-1 font-bold rounded-xl transition-all text-white py-2.5" style={{ background: C.gold, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Update Payment'}
          </button>
          <button onClick={onClose} className="flex-1 font-bold rounded-xl transition-all py-2.5" style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}` }}>
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  )
}

const LoanList = ({ user }) => {
  const [loans, setLoans] = useState([])
  const [payments, setPayments] = useState({})
  const [allPaymentsList, setAllPaymentsList] = useState([]) // flat list for Payments sub-tab
  const [loading, setLoading] = useState(false)
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [expandedLoan, setExpandedLoan] = useState(null)
  const [loanFormModal, setLoanFormModal] = useState(null) // null = closed, {} = new, loan obj = edit
  const [editPaymentModal, setEditPaymentModal] = useState(null) // payment obj for editing
  const [showClosed, setShowClosed] = useState(false)
  const [activeTab, setActiveTab] = useState('loans') // 'loans' | 'payments'
  const [paymentFilter, setPaymentFilter] = useState('all') // 'all' | 'unmatched' | 'matched'

  useEffect(() => {
    fetchLoans()
  }, [])

  const fetchLoans = async () => {
    setLoading(true)
    try {
      const { data: loansData, error: loansErr } = await supa.from('loans').select('*').order('lender_name')
      if (loansErr) throw loansErr

      setLoans(loansData || [])

      // Fetch all payments
      if (loansData && loansData.length > 0) {
        const { data: paymentsData, error: paymentsErr } = await supa.from('loan_payments').select('*').in('loan_id', loansData.map(l => l.id)).order('date', { ascending: false })
        if (paymentsErr) throw paymentsErr

        const paymentMap = {}
        const loanNameMap = {}
        ;(loansData || []).forEach(l => { loanNameMap[l.id] = l.lender_name })
        ;(paymentsData || []).forEach(p => {
          if (!paymentMap[p.loan_id]) paymentMap[p.loan_id] = []
          paymentMap[p.loan_id].push(p)
        })
        setPayments(paymentMap)
        setAllPaymentsList((paymentsData || []).map(p => ({ ...p, lender_name: loanNameMap[p.loan_id] || 'Unknown' })))
      } else {
        setAllPaymentsList([])
      }
    } catch (e) {
      console.error('Fetch error:', e)
      toast(false, 'Failed to load loans')
    } finally { setLoading(false) }
  }

  const handleDeleteLoan = async (loan) => {
    if (!window.confirm(`Delete "${loan.lender_name}" and all its payments? This cannot be undone.`)) return
    try {
      await supa.from('loan_payments').delete().eq('loan_id', loan.id)
      const { error } = await supa.from('loans').delete().eq('id', loan.id)
      if (error) throw error
      toast(true, 'Loan deleted')
      fetchLoans()
    } catch (e) {
      console.error('Delete error:', e)
      toast(false, 'Failed to delete loan')
    }
  }

  const handleMarkClosed = async (loan) => {
    try {
      const { error } = await supa.from('loans').update({ status: 'closed' }).eq('id', loan.id)
      if (error) throw error
      toast(true, 'Loan marked as closed')
      fetchLoans()
    } catch (e) {
      toast(false, 'Failed to update loan')
    }
  }

  const handleReactivate = async (loan) => {
    try {
      const { error } = await supa.from('loans').update({ status: 'active' }).eq('id', loan.id)
      if (error) throw error
      toast(true, 'Loan reactivated')
      fetchLoans()
    } catch (e) {
      toast(false, 'Failed to update loan')
    }
  }

  const handleDeletePayment = async (payment) => {
    if (!window.confirm(`Delete ${fmtCurrency(payment.amount)} payment for ${payment.lender_name} on ${fmtDate(payment.date)}?`)) return
    try {
      const { error } = await supa.from('loan_payments').delete().eq('id', payment.id)
      if (error) throw error
      toast(true, 'Payment deleted')
      fetchLoans()
    } catch (e) {
      console.error('Delete error:', e)
      toast(false, 'Failed to delete payment')
    }
  }

  const activeLoans = loans.filter(l => l.status === 'active')
  const closedLoans = loans.filter(l => l.status === 'closed')
  const totalEMI = activeLoans.reduce((sum, l) => sum + (l.monthly_emi || 0), 0)

  const filteredPayments = allPaymentsList.filter(p => {
    if (paymentFilter === 'unmatched') return !p.matched
    if (paymentFilter === 'matched') return !!p.matched
    return true
  })

  return (
    <div className="space-y-6" style={{ fontFamily: 'Manrope, sans-serif' }}>
      {/* Total EMI Card + Add Loan */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="bg-white rounded-2xl p-6 flex-1" style={{ borderLeft: `4px solid ${C.gold}` }}>
          <div className="text-xs font-bold uppercase" style={{ color: '#4e4636' }}>Total Monthly EMI</div>
          <div className="text-3xl font-bold mt-2" style={{ color: C.text }}>{fmtCurrency(totalEMI)}</div>
          <div className="text-xs mt-2" style={{ color: C.textMuted }}>Across {activeLoans.length} active loan{activeLoans.length !== 1 ? 's' : ''}</div>
        </div>
        <button onClick={() => setLoanFormModal({})} className="font-bold rounded-xl text-white py-3 px-6 text-sm" style={{ background: C.gold }}>
          + Add Loan
        </button>
      </div>

      {/* Sub-tabs: Loans | Payments */}
      <div className="flex gap-1 bg-white rounded-xl p-1" style={{ border: `1px solid ${C.border}` }}>
        {['loans', 'payments'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex-1 text-sm font-bold py-2 rounded-lg transition-all"
            style={{ background: activeTab === tab ? C.gold : 'transparent', color: activeTab === tab ? '#fff' : C.textMuted }}>
            {tab === 'loans' ? 'Loans' : `Payments (${allPaymentsList.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'payments' && (
        <>
          {/* Payment filter */}
          <div className="flex gap-2">
            {[{ key: 'all', label: 'All' }, { key: 'unmatched', label: `Unmatched (${allPaymentsList.filter(p => !p.matched).length})` }, { key: 'matched', label: `Bank Settled (${allPaymentsList.filter(p => p.matched).length})` }].map(f => (
              <button key={f.key} onClick={() => setPaymentFilter(f.key)}
                className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                style={{ background: paymentFilter === f.key ? C.gold : C.bg, color: paymentFilter === f.key ? '#fff' : C.textMuted, border: `1px solid ${paymentFilter === f.key ? C.gold : C.border}` }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Payments table */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: C.bg }}>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase" style={{ color: '#4e4636' }}>Date</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase" style={{ color: '#4e4636' }}>Lender</th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold uppercase" style={{ color: '#4e4636' }}>Amount</th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase" style={{ color: '#4e4636' }}>Reference</th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold uppercase" style={{ color: '#4e4636' }}>Bank Status</th>
                  <th className="text-center px-4 py-3 text-[11px] font-bold uppercase" style={{ color: '#4e4636' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-6" style={{ color: C.textMuted }}>No payments found</td></tr>
                )}
                {filteredPayments.map(p => (
                  <tr key={p.id} className="border-t" style={{ borderColor: C.border }}>
                    <td className="px-4 py-3">{fmtDate(p.date)}</td>
                    <td className="px-4 py-3 font-medium">{p.lender_name}</td>
                    <td className="px-4 py-3 text-right font-bold">{fmtCurrency(p.amount)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: C.textMuted }}>{p.reference || p.notes || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-[10px] px-2 py-1 rounded-full font-bold"
                        style={{ background: p.matched ? C.greenBg : 'rgba(234,179,8,0.1)', color: p.matched ? C.green : '#b45309' }}>
                        {p.matched ? 'Settled' : 'Unmatched'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!p.matched ? (
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => setEditPaymentModal(p)} className="text-[10px] px-2 py-1 rounded font-bold" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: 'none', cursor: 'pointer' }}>Edit</button>
                          <button onClick={() => handleDeletePayment(p)} className="text-[10px] px-2 py-1 rounded font-bold" style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: 'none', cursor: 'pointer' }}>Delete</button>
                        </div>
                      ) : (
                        <span className="text-[10px]" style={{ color: C.textMuted }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'loans' && (<>
      {/* end of payments tab, start of loans content */}

      {/* Active Loans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activeLoans.map(loan => (
          <div key={loan.id} className="bg-white rounded-2xl p-5" style={{ border: `1px solid ${C.border}` }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-bold" style={{ color: C.text }}>{loan.lender_name}</div>
                <div className="text-xs mt-1" style={{ color: C.textMuted }}>{loan.loan_type} • {loan.principal_amount ? 'Principal: ' + fmtCurrency(loan.principal_amount) : ''}</div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] px-2 py-1 rounded-full font-bold" style={{ background: C.greenBg, color: C.green }}>Active</span>
              </div>
            </div>

            <div className="space-y-2 mb-4 text-sm">
              <div className="flex justify-between">
                <span style={{ color: C.textMuted }}>Monthly EMI</span>
                <span className="font-bold">{fmtCurrency(loan.monthly_emi)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: C.textMuted }}>Outstanding</span>
                <span className="font-bold">{fmtCurrency(loan.outstanding_balance)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: C.textMuted }}>EMI Due</span>
                <span className="font-bold">{loan.emi_due_day}th of month</span>
              </div>
            </div>

            <button onClick={() => setSelectedLoan(loan)} className="w-full font-bold rounded-xl py-2 text-white text-sm mb-2" style={{ background: C.gold }}>
              Record Payment
            </button>

            <div className="flex gap-2 mb-2">
              <button onClick={() => setLoanFormModal(loan)} className="flex-1 font-bold rounded-xl py-2 text-sm" style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}` }}>
                Edit
              </button>
              <button onClick={() => handleMarkClosed(loan)} className="flex-1 font-bold rounded-xl py-2 text-sm" style={{ background: 'rgba(107,114,128,0.08)', color: '#6b7280', border: `1px solid ${C.border}` }}>
                Mark Closed
              </button>
              <button onClick={() => handleDeleteLoan(loan)} className="font-bold rounded-xl py-2 px-3 text-sm" style={{ background: 'rgba(220,38,38,0.08)', color: C.red, border: `1px solid rgba(220,38,38,0.2)` }}>
                Delete
              </button>
            </div>

            <button onClick={() => setExpandedLoan(expandedLoan === loan.id ? null : loan.id)} className="w-full font-bold rounded-xl py-2 text-sm" style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}` }}>
              {expandedLoan === loan.id ? 'Hide' : 'Show'} History
            </button>

            {expandedLoan === loan.id && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: C.border }}>
                <div className="text-xs font-bold mb-3" style={{ color: '#4e4636' }}>Payment History</div>
                {(payments[loan.id] || []).length === 0 ? (
                  <div className="text-xs" style={{ color: C.textMuted }}>No payments recorded</div>
                ) : (
                  <div className="space-y-2 text-xs">
                    {(payments[loan.id] || []).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5).map(p => (
                      <div key={p.id} className="flex justify-between">
                        <span>{fmtDate(p.date)}</span>
                        <span className="font-bold">{fmtCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {activeLoans.length === 0 && (
        <div className="bg-white rounded-2xl p-6 text-center" style={{ color: C.textMuted }}>
          No active loans
        </div>
      )}

      {/* Closed Loans — Collapsed Section */}
      {closedLoans.length > 0 && (
        <div>
          <button onClick={() => setShowClosed(!showClosed)} className="flex items-center gap-2 text-sm font-bold mb-3" style={{ color: C.textMuted }}>
            <span style={{ transform: showClosed ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>&#9654;</span>
            Closed Loans ({closedLoans.length})
          </button>
          {showClosed && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" style={{ opacity: 0.6 }}>
              {closedLoans.map(loan => (
                <div key={loan.id} className="bg-white rounded-2xl p-5" style={{ border: `1px solid ${C.border}` }}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold" style={{ color: C.textMuted }}>{loan.lender_name}</div>
                      <div className="text-xs mt-1" style={{ color: C.textMuted }}>{loan.loan_type} • {loan.principal_amount ? 'Principal: ' + fmtCurrency(loan.principal_amount) : ''}</div>
                    </div>
                    <span className="text-[10px] px-2 py-1 rounded-full font-bold" style={{ background: 'rgba(107,114,128,0.08)', color: '#6b7280' }}>Closed</span>
                  </div>

                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex justify-between">
                      <span style={{ color: C.textMuted }}>Monthly EMI</span>
                      <span className="font-bold" style={{ color: C.textMuted }}>{fmtCurrency(loan.monthly_emi)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: C.textMuted }}>Outstanding</span>
                      <span className="font-bold" style={{ color: C.textMuted }}>{fmtCurrency(loan.outstanding_balance)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => handleReactivate(loan)} className="flex-1 font-bold rounded-xl py-2 text-sm" style={{ background: C.greenBg, color: C.green, border: `1px solid rgba(22,163,74,0.2)` }}>
                      Reactivate
                    </button>
                    <button onClick={() => setLoanFormModal(loan)} className="flex-1 font-bold rounded-xl py-2 text-sm" style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}` }}>
                      Edit
                    </button>
                    <button onClick={() => handleDeleteLoan(loan)} className="font-bold rounded-xl py-2 px-3 text-sm" style={{ background: 'rgba(220,38,38,0.08)', color: C.red, border: `1px solid rgba(220,38,38,0.2)` }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      </>)}

      {selectedLoan && (
        <PaymentModal
          loan={selectedLoan}
          onSave={() => { setSelectedLoan(null); fetchLoans() }}
          onClose={() => setSelectedLoan(null)}
        />
      )}

      {loanFormModal && (
        <LoanFormModal
          loan={loanFormModal.id ? loanFormModal : null}
          onSave={() => { setLoanFormModal(null); fetchLoans() }}
          onClose={() => setLoanFormModal(null)}
        />
      )}

      {editPaymentModal && (
        <EditPaymentModal
          payment={editPaymentModal}
          onSave={() => { setEditPaymentModal(null); fetchLoans() }}
          onClose={() => setEditPaymentModal(null)}
        />
      )}
    </div>
  )
}

export default LoanList

import React, { useState, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, fmtDate, fmtCurrency } from '../../lib/designTokens'
import ExpenseForm from './ExpenseForm'

const ExpenseList = ({ user }) => {
  const [expenses, setExpenses] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)

  // Filters
  const [filterAccount, setFilterAccount] = useState('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterPaymentStatus, setFilterPaymentStatus] = useState('')

  useEffect(() => {
    fetchData()
  }, [filterAccount, filterStartDate, filterEndDate, filterPaymentStatus])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [accRes, expRes, mirrorRes] = await Promise.all([
        supa.from('expense_accounts').select('*').order('name'),
        supa.from('expense_entries').select('*'),
        supa.from('expense_mirror').select('*, expense_accounts(id, name)').eq('status', 'settled')
      ])

      // Manual expense entries
      let manualExpenses = (expRes.data || []).map(e => ({ ...e, _source: 'manual' }))

      // Bank-settled entries from expense_mirror
      let settledExpenses = (mirrorRes.data || []).map(m => ({
        id: m.id,
        date: m.date,
        account_id: m.account_id,
        description: m.payee || m.notes || '',
        amount: Number(m.amount) || 0,
        gst_amount: 0,
        payment_mode: m.payment_mode || '',
        vendor_name: m.payee || '',
        payment_status: 'settled',
        _source: 'bank_settled',
        _sourceType: m.source_type,
      }))

      let expenses = [...manualExpenses, ...settledExpenses]

      // Apply filters
      if (filterAccount) expenses = expenses.filter(e => e.account_id === filterAccount)
      if (filterStartDate) expenses = expenses.filter(e => e.date >= filterStartDate)
      if (filterEndDate) expenses = expenses.filter(e => e.date <= filterEndDate)
      if (filterPaymentStatus) {
        if (filterPaymentStatus === 'settled') {
          expenses = expenses.filter(e => e._source === 'bank_settled')
        } else {
          expenses = expenses.filter(e => e._source === 'manual' && e.payment_status === filterPaymentStatus)
        }
      }

      setAccounts(accRes.data || [])
      setExpenses(expenses.sort((a, b) => new Date(b.date) - new Date(a.date)))
    } catch (e) {
      console.error('Fetch error:', e)
      toast(false, 'Failed to load expenses')
    } finally { setLoading(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return
    try {
      const { error } = await supa.from('expense_entries').delete().eq('id', id)
      if (error) throw error
      toast(true, 'Expense deleted')
      fetchData()
    } catch (e) {
      console.error('Delete error:', e)
      toast(false, 'Failed to delete expense')
    }
  }

  const accountMap = Object.fromEntries((accounts || []).map(a => [a.id, a.name]))
  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)

  return (
    <div className="space-y-6" style={{ fontFamily: 'Manrope, sans-serif' }}>
      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-bold uppercase" style={{ color: '#4e4636', letterSpacing: '0.06em' }}>Account</label>
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="w-full mt-1 text-sm px-3 py-2.5 rounded-lg outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}>
            <option value="">All Accounts</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase" style={{ color: '#4e4636', letterSpacing: '0.06em' }}>Start Date</label>
          <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full mt-1 text-sm px-3 py-2.5 rounded-lg outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase" style={{ color: '#4e4636', letterSpacing: '0.06em' }}>End Date</label>
          <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full mt-1 text-sm px-3 py-2.5 rounded-lg outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase" style={{ color: '#4e4636', letterSpacing: '0.06em' }}>Status</label>
          <select value={filterPaymentStatus} onChange={e => setFilterPaymentStatus(e.target.value)} className="w-full mt-1 text-sm px-3 py-2.5 rounded-lg outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}>
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="settled">Bank Settled</option>
          </select>
        </div>
      </div>

      {/* Add Button */}
      <button onClick={() => { setEditingExpense(null); setShowForm(true) }} className="font-bold rounded-xl px-4 py-2.5 text-white" style={{ background: C.gold }}>
        + Add Expense
      </button>

      {/* Summary */}
      <div className="bg-white rounded-2xl p-4">
        <div className="text-xs font-bold uppercase" style={{ color: '#4e4636' }}>Total Expenses</div>
        <div className="text-2xl font-bold mt-1" style={{ color: C.text }}>{fmtCurrency(total)}</div>
        <div className="text-xs mt-1" style={{ color: C.textMuted }}>Across {expenses.length} entries</div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-center" style={{ color: C.textMuted }}>Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="p-6 text-center" style={{ color: C.textMuted }}>No expenses found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                  <th className="text-left px-4 py-3 font-bold" style={{ color: C.text }}>Date</th>
                  <th className="text-left px-4 py-3 font-bold" style={{ color: C.text }}>Account</th>
                  <th className="text-left px-4 py-3 font-bold" style={{ color: C.text }}>Description</th>
                  <th className="text-right px-4 py-3 font-bold" style={{ color: C.text }}>Amount</th>
                  <th className="text-right px-4 py-3 font-bold" style={{ color: C.text }}>GST</th>
                  <th className="text-left px-4 py-3 font-bold" style={{ color: C.text }}>Mode</th>
                  <th className="text-left px-4 py-3 font-bold" style={{ color: C.text }}>Vendor</th>
                  <th className="text-center px-4 py-3 font-bold" style={{ color: C.text }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
                  <tr key={exp.id} style={{ borderBottom: `1px solid ${C.borderLight}`, background: exp._source === 'bank_settled' ? 'rgba(22,163,74,0.04)' : undefined }}>
                    <td className="px-4 py-3">{fmtDate(exp.date)}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="font-mono">{accountMap[exp.account_id] || '—'}</span>
                      {exp._source === 'bank_settled' && (
                        <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: 'rgba(22,163,74,0.12)', color: '#16a34a' }}>
                          {exp._sourceType === 'bank_import' ? 'Bank' : exp._sourceType === 'fabric' ? 'Fabric' : exp._sourceType === 'outsource' ? 'Outsource' : 'Settled'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{exp.description}</td>
                    <td className="px-4 py-3 text-right font-bold">{fmtCurrency(exp.amount)}</td>
                    <td className="px-4 py-3 text-right text-xs" style={{ color: C.textMuted }}>{fmtCurrency(exp.gst_amount || 0)}</td>
                    <td className="px-4 py-3 text-xs">{exp.payment_mode}</td>
                    <td className="px-4 py-3 text-xs">{exp.vendor_name || '—'}</td>
                    <td className="px-4 py-3 text-center space-x-1">
                      {exp._source === 'bank_settled' ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>✓ Settled</span>
                      ) : (
                        <>
                          <button onClick={() => { setEditingExpense(exp); setShowForm(true) }} className="text-xs px-2 py-1 rounded hover:opacity-70" style={{ background: C.blueBg, color: C.blue }}>Edit</button>
                          <button onClick={() => handleDelete(exp.id)} className="text-xs px-2 py-1 rounded hover:opacity-70" style={{ background: C.redBg, color: C.red }}>Del</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <ExpenseForm
          accounts={accounts}
          initialData={editingExpense}
          onSave={() => { setShowForm(false); setEditingExpense(null); fetchData() }}
          onClose={() => { setShowForm(false); setEditingExpense(null) }}
        />
      )}
    </div>
  )
}

export default ExpenseList

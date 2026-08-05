import React, { useState } from 'react'
import { C } from '../../lib/designTokens'
import PLReport from './PLReport'
import ExpenseList from './ExpenseList'
import PayrollTab from './PayrollTab'
import LoanList from './LoanList'
import AccountMaster from './AccountMaster'
import BankStatementTab from './BankStatementTab'
import StaffSalariesTab from './StaffSalariesTab'
import MonthlyPaymentsTab from './MonthlyPaymentsTab'
import TentativePL from './TentativePL'
import CashReconTab from './CashReconTab'

const SUB_TABS = [
  { key: 'pl', label: 'P&L Report' },
  { key: 'tentative', label: 'Tentative P&L' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'bank', label: 'Bank Statement' },
  { key: 'salaries', label: 'Staff Salaries' },
  { key: 'payroll', label: 'Karigar Payroll' },
  { key: 'loans', label: 'Loans' },
  { key: 'monthly', label: 'Payments' },
  { key: 'cashrecon', label: 'Cash Recon' },
  { key: 'accounts', label: 'Chart of Accounts' },
]

const FinanceTab = ({ user }) => {
  const [subView, setSubView] = useState(() => {
    try { return sessionStorage.getItem('hilo_finance_subtab') || 'pl' } catch { return 'pl' }
  })
  // Persist sub-tab so refresh button doesn't reset it
  const handleSubView = (v) => { setSubView(v); try { sessionStorage.setItem('hilo_finance_subtab', v) } catch {} }

  return (
    <div className="p-4 sm:p-6 pb-24" style={{ fontFamily: 'Manrope, sans-serif' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: C.text }}>Finance & P&L Intelligence</h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-lg sm:rounded-xl w-full sm:w-fit mb-6 overflow-x-auto flex-wrap sm:flex-nowrap" style={{ background: '#efeeea' }}>
        {SUB_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleSubView(tab.key)}
            className={`flex-shrink-0 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${subView === tab.key ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            style={subView === tab.key ? { color: '#795900', fontWeight: 600 } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content — keep-alive mount pattern */}
      <div style={{ display: subView === 'pl' ? '' : 'none' }}><PLReport user={user} /></div>
      <div style={{ display: subView === 'tentative' ? '' : 'none' }}><TentativePL user={user} /></div>
      <div style={{ display: subView === 'expenses' ? '' : 'none' }}><ExpenseList user={user} /></div>
      <div style={{ display: subView === 'bank' ? '' : 'none' }}><BankStatementTab user={user} /></div>
      <div style={{ display: subView === 'salaries' ? '' : 'none' }}><StaffSalariesTab user={user} /></div>
      <div style={{ display: subView === 'payroll' ? '' : 'none' }}><PayrollTab user={user} /></div>
      <div style={{ display: subView === 'loans' ? '' : 'none' }}><LoanList user={user} /></div>
      <div style={{ display: subView === 'monthly' ? '' : 'none' }}><MonthlyPaymentsTab user={user} /></div>
      <div style={{ display: subView === 'cashrecon' ? '' : 'none' }}><CashReconTab /></div>
      <div style={{ display: subView === 'accounts' ? '' : 'none' }}><AccountMaster user={user} /></div>
    </div>
  )
}

export default FinanceTab

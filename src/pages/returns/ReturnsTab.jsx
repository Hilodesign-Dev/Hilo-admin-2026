/* ═══════════════════════════════════════════════════════════════════════════
   RETURNS & EXCHANGES — Top-level tab shell
   ═══════════════════════════════════════════════════════════════════════════
   Mirrors the FinanceTab keep-alive sub-tab pattern: every sub-view stays
   mounted and is toggled with display:none so filter / scroll state survives
   tab switches. Sub-tab choice persists via sessionStorage.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react'
import { C } from '../../lib/designTokens'
import { RETURN_SUB_TABS } from './constants'
import ReturnsDashboard from './ReturnsDashboard'
import ReturnsListView from './ReturnsListView'
import RefundPaymentsView from './RefundPaymentsView'
import StoreCreditView from './StoreCreditView'

const ReturnsTab = ({ user }) => {
  const [subView, setSubView] = useState(() => {
    try { return sessionStorage.getItem('hilo_returns_subtab') || 'dashboard' } catch { return 'dashboard' }
  })
  const handleSubView = (v) => { setSubView(v); try { sessionStorage.setItem('hilo_returns_subtab', v) } catch {} }

  return (
    <div className="p-4 sm:p-6 pb-24" style={{ fontFamily: 'Manrope, sans-serif' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: C.text }}>Returns & Exchanges</h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-lg sm:rounded-xl w-full sm:w-fit mb-6 overflow-x-auto flex-wrap sm:flex-nowrap" style={{ background: '#efeeea' }}>
        {RETURN_SUB_TABS.map(tab => (
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
      <div style={{ display: subView === 'dashboard'    ? '' : 'none' }}><ReturnsDashboard user={user} /></div>
      <div style={{ display: subView === 'list'         ? '' : 'none' }}><ReturnsListView user={user} /></div>
      <div style={{ display: subView === 'refunds'      ? '' : 'none' }}><RefundPaymentsView user={user} /></div>
      <div style={{ display: subView === 'store_credit' ? '' : 'none' }}><StoreCreditView user={user} /></div>
    </div>
  )
}

export default ReturnsTab

import React, { useEffect, useState, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import FranchiseTerms from './FranchiseTerms'
import FranchiseReceipts from './FranchiseReceipts'
import FranchisePayments from './FranchisePayments'
import FranchiseLeads from './FranchiseLeads'

/* FranchisesTab — top-level shell.
   v1: BLR-001 is the only franchise. We auto-select it on load. When a 2nd
   franchise gets seeded, this will need a list picker — out of scope today. */

const SUBTABS = [
  { id: 'receipts',      label: 'Receipts',      desc: 'Money received from franchisee (public)' },
  { id: 'payments', label: 'Payments', desc: 'Money paid out on the franchise behalf' },
  { id: 'terms',         label: 'Terms',         desc: 'Agreement details' },
]

export default function FranchisesTab({ user }) {
  const [franchise, setFranchise] = useState(null)
  const [loading, setLoading] = useState(true)
  const [topTab, setTopTab] = useState('leads')
  const [activeTab, setActiveTab] = useState('receipts')

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supa
      .from('franchises')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1).maybeSingle()
    if (!error) setFranchise(data)
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading franchises…</div>

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
      {/* Top-level: Franchise Leads vs Franchisees */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        {[{ id: 'leads', label: 'Franchise Leads' }, { id: 'franchisees', label: 'Franchisees' }].map(t => (
          <button key={t.id} onClick={() => setTopTab(t.id)}
            className="px-4 py-2.5 text-sm font-bold transition-colors"
            style={{ color: topTab === t.id ? '#1b1c1a' : '#9ca3af', borderBottom: topTab === t.id ? '2px solid #c9a432' : '2px solid transparent', marginBottom: '-1px' }}>
            {t.label}
          </button>
        ))}
      </div>

      {topTab === 'leads' ? (
        <FranchiseLeads user={user} />
      ) : !franchise ? (
        <div className="p-8">
          <div className="text-sm text-gray-500 mb-2">No franchise records yet.</div>
          <div className="text-xs text-gray-400">Convert a signed franchise lead, or seed BLR-001 from the migration.</div>
        </div>
      ) : (
        <div>
          {/* Header */}
          <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-gray-800">{franchise.display_name}</h1>
              <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                <span className="font-mono text-amber-700">{franchise.code}</span>
                <span>·</span>
                <span>{franchise.format}</span>
                <span>·</span>
                <span>{franchise.city}, {franchise.state}</span>
                <span>·</span>
                <StatusPill status={franchise.status} />
              </div>
            </div>
          </div>

          {/* Franchisee sub-tab nav */}
          <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
            {SUBTABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className="px-4 py-2.5 text-sm font-semibold transition-colors relative"
                style={{ color: activeTab === t.id ? '#1b1c1a' : '#9ca3af', borderBottom: activeTab === t.id ? '2px solid #c9a432' : '2px solid transparent', marginBottom: '-1px' }}>
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'receipts' && <FranchiseReceipts franchise={franchise} onChange={reload} user={user} />}
          {activeTab === 'payments' && <FranchisePayments franchise={franchise} onChange={reload} user={user} />}
          {activeTab === 'terms' && <FranchiseTerms franchise={franchise} onChange={reload} user={user} />}
        </div>
      )}
    </div>
  )
}

const StatusPill = ({ status }) => {
  const map = {
    onboarding: { bg: '#dbeafe', fg: '#1e40af', label: 'Onboarding' },
    fit_out:    { bg: '#fef3c7', fg: '#92400e', label: 'Fit-out' },
    pre_launch: { bg: '#ede9fe', fg: '#5b21b6', label: 'Pre-launch' },
    live:       { bg: '#dcfce7', fg: '#15803d', label: 'Live' },
    paused:     { bg: '#fee2e2', fg: '#991b1b', label: 'Paused' },
    exited:     { bg: '#f3f4f6', fg: '#6b7280', label: 'Exited' },
  }
  const m = map[status] || { bg: '#f3f4f6', fg: '#6b7280', label: status }
  return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
}

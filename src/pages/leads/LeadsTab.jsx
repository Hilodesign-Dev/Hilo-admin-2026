/* ═══════════════════════════════════════════════════════════════════════════
   LEADS CRM TAB — v3: Global assigned filter + My Day split
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo } from 'react'
import { C, toast } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { Btn, Select } from './ui'
import { QuickAddStrip } from './QuickAddStrip'
import { MyDayView } from './MyDayView'
import { LeadsDashboard } from './LeadsDashboard'
import { ClosureDashboard } from './ClosureDashboard'
import { LeadsList } from './LeadsList'
import { AddLeadModal } from './AddLeadModal'
import { LogCallModal } from './LogCallModal'
import { EditLeadPage } from './EditLeadPage'
import LinkOrderModal from './LinkOrderModal'
import { ActivityView } from './ActivityView'
import { EventsList } from './EventsList'
import { LeadSettings } from './LeadSettings'
import { StoreWalkinsView } from './StoreWalkinsView'
import StoreAppointmentsView from './StoreAppointmentsView'
import { CapiLogView } from './CapiLogView'
import { YET_TO_QUALIFY_STATUSES, QUALIFIED_STATUSES, isTerminalStatus } from './constants'
import { useIsMobile } from './useIsMobile'

const NudgeStrip = ({ name, hq, tbc }) => {
  const [closed, setClosed] = useState(false)
  if (closed) return null
  const parts = []
  if (hq) parts.push(`${hq} high-quality lead${hq > 1 ? 's' : ''}`)
  if (tbc) parts.push(`${tbc} lead${tbc > 1 ? 's' : ''} to be closed`)
  return (
    <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(201,164,50,0.10)', border: '1px solid rgba(201,164,50,0.35)' }}>
      <span style={{ fontSize: 16 }}>💡</span>
      <span className="text-sm" style={{ color: C.text }}>
        Hey <b>{name}</b>, you have {parts.join(' and ')} — a little focus today could convert them.
      </span>
      <button onClick={() => setClosed(true)} className="ml-auto text-sm px-1.5 rounded hover:bg-black/5" style={{ color: C.textMuted }} title="Dismiss">×</button>
    </div>
  )
}

export const LeadsTab = () => {
  const [activeTab, _setActiveTab] = useState(() => {
    try { return sessionStorage.getItem('hilo_leads_subtab') || 'myday' } catch { return 'myday' }
  })
  const setActiveTab = (v) => { _setActiveTab(v); try { sessionStorage.setItem('hilo_leads_subtab', v) } catch {} }
  const [leads, setLeads] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [loading, setLoading] = useState(true)

  const isMobile = useIsMobile()

  // Global assigned-to filter — defaults to logged-in user's team member ID
  const [globalAssigned, setGlobalAssigned] = useState(window._currentTeamMemberId || '__all__')

  // Modal states
  const [showAddLead, setShowAddLead] = useState(false)
  const [logCallLead, setLogCallLead] = useState(null)
  const [editLead, setEditLead] = useState(null)
  const [linkOrderLead, setLinkOrderLead] = useState(null)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Fetch team members
  useEffect(() => {
    supa.from('team_members').select('id, name, assigned_store, store_id')
      .then(({ data, error }) => {
        if (!error && data) setTeamMembers(data)
      })
  }, [])

  // Fetch leads
  const fetchLeads = async () => {
    setLoading(true)
    try {
      // Supabase caps a single query at 1000 rows — paginate so ALL leads load
      // (otherwise older leads silently drop out of every filter/count/search).
      const PAGE = 1000; let all = [], from = 0
      while (true) {
        const { data, error } = await supa
          .from('leads')
          .select('*')
          .order('lead_date', { ascending: false, nullsFirst: false })
          .range(from, from + PAGE - 1)
        if (error) throw error
        if (!data || !data.length) break
        all = all.concat(data)
        if (data.length < PAGE) break
        from += PAGE
      }
      setLeads(all)
    } catch (err) {
      console.error('Error fetching leads:', err)
      toast(false, 'Failed to load leads')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLeads() }, [])

  const handleLeadsRefresh = () => {
    fetchLeads()
    setCurrentPage(1)
  }

  // Patch a single lead in-place so the list doesn't reset scroll/page position
  const handleLeadUpdatedInPlace = async (leadId) => {
    try {
      const { data, error } = await supa.from('leads').select('*').eq('id', leadId).single()
      if (!error && data) {
        setLeads(prev => prev.map(l => l.id === leadId ? data : l))
      } else {
        // Fallback: full refetch if single-lead fetch fails
        fetchLeads()
      }
    } catch {
      fetchLeads()
    }
  }

  // ─── Global filter: apply assigned-to across all leads ─────────────
  const globalFilteredLeads = useMemo(() => {
    if (globalAssigned === '__all__') return leads
    if (globalAssigned === '__unassigned__') return leads.filter(l => !l.assigned_to)
    return leads.filter(l => String(l.assigned_to) === String(globalAssigned))
  }, [leads, globalAssigned])

  // A store walk-in belongs to the Store Walk-ins section, not Online Assist.
  const isStoreWalkin = (l) => l.channel === 'In-store'  // In-store channel = store walk-in (source/location independent)
  // Online Assist sub-tabs are online-only — never show in-store leads here.
  const notWalkin = (arr) => arr.filter(l => !isStoreWalkin(l))

  // Filter leads by tab (on top of global filter)
  const getFilteredLeads = () => {
    switch (activeTab) {
      case 'yet_to_qualify':
        return notWalkin(globalFilteredLeads.filter(l =>
          l.phase === 'yet_to_qualify' || YET_TO_QUALIFY_STATUSES.includes(l.status)
        ).filter(l => !isTerminalStatus(l.status)))
      case 'qualified':
        return notWalkin(globalFilteredLeads.filter(l =>
          l.phase === 'qualified' || QUALIFIED_STATUSES.includes(l.status)
        ).filter(l => !isTerminalStatus(l.status)))
      case 'converted':
        return globalFilteredLeads.filter(l => l.status === 'Converted' && !isStoreWalkin(l))
      case 'archive':
        return globalFilteredLeads.filter(l => l.status === 'Lost' || l.status === 'Not Qualified')
      case 'list':
      default:
        return globalFilteredLeads
    }
  }

  // Tab counts (for badges)
  const tabCounts = useMemo(() => {
    const active = globalFilteredLeads.filter(l => !isTerminalStatus(l.status) && !isStoreWalkin(l))
    return {
      yet_to_qualify: active.filter(l => l.phase === 'yet_to_qualify' || YET_TO_QUALIFY_STATUSES.includes(l.status)).length,
      qualified: active.filter(l => (l.phase === 'qualified' || QUALIFIED_STATUSES.includes(l.status)) && !isTerminalStatus(l.status)).length,
      converted: globalFilteredLeads.filter(l => l.status === 'Converted' && !isStoreWalkin(l)).length,
      archive: globalFilteredLeads.filter(l => l.status === 'Lost' || l.status === 'Not Qualified').length,
    }
  }, [globalFilteredLeads])

  // Tabs
  const ASSIST_IDS = ['yet_to_qualify', 'qualified', 'converted', 'dashboard', 'activity']
  const isAssist = ASSIST_IDS.includes(activeTab)
  const nudgeContext = activeTab === 'store-walk-ins' ? 'walkin' : isAssist ? 'assist' : null
  const _nudgeUid = typeof window !== 'undefined' ? window._currentTeamMemberId : null
  const nudgeName = (typeof window !== 'undefined' && window._currentUserName) || teamMembers.find(t => String(t.id) === String(_nudgeUid))?.name || 'there'
  const nudge = useMemo(() => {
    if (!nudgeContext || !_nudgeUid) return { hq: 0, tbc: 0 }
    const mine = leads.filter(l => String(l.assigned_to) === String(_nudgeUid) && !isTerminalStatus(l.status))
    const scoped = nudgeContext === 'walkin' ? mine.filter(isStoreWalkin) : mine.filter(l => !isStoreWalkin(l))
    return { hq: scoped.filter(l => l.lead_quality === 'High Quality').length, tbc: scoped.filter(l => l.status === 'To be Closed').length }
  }, [leads, nudgeContext, _nudgeUid])
  const assistSubtabs = [
    { id: 'yet_to_qualify', label: 'Yet to Qualify', count: tabCounts.yet_to_qualify },
    { id: 'qualified', label: 'Qualified', count: tabCounts.qualified },
    { id: 'converted', label: 'Converted', count: tabCounts.converted },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'activity', label: 'Activity' },
  ]

  const tabs = [
    { id: 'myday', label: 'My Day' },
    { id: 'store-walk-ins', label: 'Store Walk-ins' },
    { id: 'store-appointments', label: 'Store Appointments' },
    { id: 'assist', label: 'Online Assist' },
    { id: 'closure', label: 'Online Closure' },
    { id: 'list', label: 'All Leads' },
    { id: 'archive', label: 'Archive', count: tabCounts.archive },
    { id: 'capi-log', label: 'CAPI Log' },
    { id: 'settings', label: 'Settings' },
  ]

  const tabColors = {
    myday: C.gold,
    yet_to_qualify: '#2563eb',
    qualified: '#16a34a',
    converted: '#16a34a',
    'store-walk-ins': '#d97706',
    'store-appointments': '#0891b2',
    assist: '#2563eb',
    archive: '#6b7280',
    settings: '#6b7280',
  }

  const SETTINGS_IDS = ['settings', 'events']
  const isSettingsGroup = SETTINGS_IDS.includes(activeTab)
  const isSettingsTab = isSettingsGroup
  const settingsSubtabs = [
    { id: 'settings', label: 'Settings' },
    { id: 'events', label: 'Events' },
  ]

  // Get the display name for the assigned filter
  const assignedName = globalAssigned === '__all__' ? 'All Team' :
    globalAssigned === '__unassigned__' ? 'Unassigned' :
    teamMembers.find(tm => String(tm.id) === String(globalAssigned))?.name || 'Me'

  return (
    <div className="h-full flex flex-col" style={{ background: C.bg }}>
      {/* Header */}
      <div className="px-3 sm:px-6 py-3 sm:pb-3 border-b" style={{ borderColor: C.border, background: C.cardBg }}>
        <div className="flex flex-wrap justify-between items-center gap-2 mb-3 sm:mb-4">
          <h1 className="text-lg sm:text-2xl font-bold" style={{ color: C.text }}>Leads CRM</h1>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Global Assigned Filter */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {!isMobile && <span className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Viewing</span>}
              <select
                value={globalAssigned}
                onChange={e => { setGlobalAssigned(e.target.value); setCurrentPage(1) }}
                className="text-xs sm:text-sm font-bold px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg outline-none cursor-pointer"
                style={{
                  background: globalAssigned === '__all__' ? C.bg : C.gold + '10',
                  border: `1.5px solid ${globalAssigned === '__all__' ? C.border : C.gold}`,
                  color: globalAssigned === '__all__' ? C.text : C.gold,
                  minWidth: isMobile ? '120px' : '150px',
                }}
              >
                {window._currentTeamMemberId && (
                  <option value={window._currentTeamMemberId}>
                    ★ My Leads ({teamMembers.find(tm => String(tm.id) === window._currentTeamMemberId)?.name || 'Me'})
                  </option>
                )}
                <option value="__all__">All Team</option>
                <option value="__unassigned__">Unassigned</option>
                {teamMembers
                  .filter(tm => String(tm.id) !== window._currentTeamMemberId)
                  .map(tm => (
                    <option key={tm.id} value={tm.id}>{tm.name}</option>
                  ))
                }
              </select>
            </div>
            {!isSettingsTab && (
              <Btn primary onClick={() => setShowAddLead(true)} style={isMobile ? { fontSize: '12px', padding: '6px 10px' } : {}}>
                {isMobile ? '+ Add' : '+ Add with Details'}
              </Btn>
            )}
          </div>
        </div>

        {/* Tab Strip — horizontally scrollable on mobile */}
        <div className="flex gap-1 sm:gap-1.5 overflow-x-auto pb-2 -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          {tabs.map(tab => {
            const isActive = tab.id === 'assist' ? isAssist : tab.id === 'settings' ? isSettingsGroup : activeTab === tab.id
            const accent = tabColors[tab.id] || C.gold
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id === 'assist' ? (isAssist ? activeTab : 'yet_to_qualify') : tab.id === 'settings' ? (isSettingsGroup ? activeTab : 'settings') : tab.id); setCurrentPage(1) }}
                className="whitespace-nowrap px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold transition-all text-xs sm:text-sm flex items-center gap-1 sm:gap-1.5 flex-shrink-0"
                style={{
                  background: isActive ? accent : 'transparent',
                  color: isActive ? '#fff' : C.text,
                  border: isActive ? 'none' : `1px solid ${C.border}`
                }}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: isActive ? 'rgba(255,255,255,0.25)' : accent + '12',
                      color: isActive ? '#fff' : accent,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        {nudgeContext && (nudge.hq + nudge.tbc > 0) && (
          <NudgeStrip key={nudgeContext} name={nudgeName} hq={nudge.hq} tbc={nudge.tbc} />
        )}
        {/* Settings sub-tabs */}
        {isSettingsGroup && (
          <div className="flex gap-1 sm:gap-1.5 overflow-x-auto pb-3 mb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
            {settingsSubtabs.map(st => {
              const on = activeTab === st.id
              return (
                <button key={st.id} onClick={() => { setActiveTab(st.id); setCurrentPage(1) }}
                  className="whitespace-nowrap px-3 sm:px-4 py-1.5 rounded-lg font-bold transition-all text-xs sm:text-sm flex-shrink-0"
                  style={{ background: on ? '#6b7280' : C.cardBg, color: on ? '#fff' : C.text, border: on ? 'none' : `1px solid ${C.border}` }}>
                  {st.label}
                </button>
              )
            })}
          </div>
        )}
        {/* Online Assist sub-tabs */}
        {isAssist && (
          <div className="flex gap-1 sm:gap-1.5 overflow-x-auto pb-3 mb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
            {assistSubtabs.map(st => {
              const on = activeTab === st.id
              return (
                <button key={st.id} onClick={() => { setActiveTab(st.id); setCurrentPage(1) }}
                  className="whitespace-nowrap px-3 sm:px-4 py-1.5 rounded-lg font-bold transition-all text-xs sm:text-sm flex items-center gap-1.5 flex-shrink-0"
                  style={{ background: on ? '#2563eb' : C.cardBg, color: on ? '#fff' : C.text, border: on ? 'none' : `1px solid ${C.border}` }}>
                  {st.label}
                  {st.count !== undefined && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: on ? 'rgba(255,255,255,0.25)' : '#2563eb12', color: on ? '#fff' : '#2563eb' }}>{st.count}</span>}
                </button>
              )
            })}
          </div>
        )}
        {/* Quick Add Strip — shown on My Day, List, YTQ, Qualified tabs */}
        {['myday', 'list', 'yet_to_qualify', 'qualified'].includes(activeTab) && (
          <QuickAddStrip onLeadAdded={handleLeadsRefresh} activeTab={activeTab} />
        )}

        {activeTab === 'settings' ? (
          <LeadSettings />
        ) : activeTab === 'capi-log' ? (
          <CapiLogView />
        ) : activeTab === 'events' ? (
          <EventsList />
        ) : loading ? (
          <div className="flex items-center justify-center h-96" style={{ color: C.textMuted }}>
            Loading leads...
          </div>
        ) : activeTab === 'myday' ? (
          <MyDayView
            leads={globalFilteredLeads}
            teamMembers={teamMembers}
            onLogCall={setLogCallLead}
            onEdit={setEditLead}
            currentUserId={globalAssigned !== '__all__' && globalAssigned !== '__unassigned__' ? globalAssigned : window._currentUserId}
            globalFiltered={globalAssigned !== '__all__'}
          />
        ) : activeTab === 'store-walk-ins' ? (
          <StoreWalkinsView
            leads={leads}
            teamMembers={teamMembers}
            onRefresh={handleLeadsRefresh}
            onLogCall={setLogCallLead}
            onEditLead={setEditLead}
          />
        ) : activeTab === 'store-appointments' ? (
          <StoreAppointmentsView
            leads={leads}
            teamMembers={teamMembers}
            onRefresh={handleLeadsRefresh}
            onLogCall={setLogCallLead}
            onEditLead={setEditLead}
            onLinkOrder={setLinkOrderLead}
          />
        ) : activeTab === 'closure' ? (
          <ClosureDashboard />
        ) : activeTab === 'activity' ? (
          <ActivityView leads={globalFilteredLeads.filter(l => !isStoreWalkin(l))} teamMembers={teamMembers} />
        ) : activeTab === 'dashboard' ? (
          <LeadsDashboard leads={leads.filter(l => !isStoreWalkin(l))} teamMembers={teamMembers} />
        ) : (
          <LeadsList
            leads={getFilteredLeads()}
            showFilters={true}
            onUpdate={setLogCallLead}
            onEdit={setEditLead}
            onLinkOrder={setLinkOrderLead}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            teamMembers={teamMembers}
            viewMode={activeTab === 'yet_to_qualify' ? 'ytq' : activeTab === 'qualified' ? 'qualified' : activeTab === 'converted' ? 'converted' : activeTab === 'archive' ? 'archive' : 'all'}
          />
        )}
      </div>

      {/* Modals */}
      {showAddLead && (
        <AddLeadModal
          onClose={() => setShowAddLead(false)}
          onLeadAdded={handleLeadsRefresh}
          activeTab={activeTab}
          teamMembers={teamMembers}
        />
      )}

      {logCallLead && (
        <LogCallModal
          lead={logCallLead}
          onClose={() => setLogCallLead(null)}
          onLeadUpdated={() => handleLeadUpdatedInPlace(logCallLead.id)}
          teamMembers={teamMembers}
        />
      )}

      {linkOrderLead && (
        <LinkOrderModal
          lead={linkOrderLead}
          onClose={() => setLinkOrderLead(null)}
          onLinked={() => { setLinkOrderLead(null); handleLeadsRefresh() }}
        />
      )}

      {editLead && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setEditLead(null) }}
        >
          <div onClick={e => e.stopPropagation()} className="h-full overflow-y-auto">
            <EditLeadPage
              lead={editLead}
              onClose={() => setEditLead(null)}
              onLeadUpdated={() => handleLeadUpdatedInPlace(editLead.id)}
              teamMembers={teamMembers}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default LeadsTab

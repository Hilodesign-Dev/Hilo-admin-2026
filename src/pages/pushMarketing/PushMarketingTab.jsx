import React, { useState, useEffect, useCallback } from 'react'
import { pushMarketingApi } from '../../lib/notificationsApi'
import { toast } from '../../lib/designTokens'
import Icon from '../../components/Icon'
import PushCampaignComposerModal from './PushCampaignComposerModal'
import PushCampaignReportModal from './PushCampaignReportModal'

export default function PushMarketingTab() {
  const [campaigns, setCampaigns] = useState([])
  const [devicesCount, setDevicesCount] = useState({ totalReachable: 0, android: 0, ios: 0 })
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Modals state
  const [showComposer, setShowComposer] = useState(false)
  const [inspectCampaignId, setInspectCampaignId] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [campRes, devRes] = await Promise.all([
        pushMarketingApi.listCampaigns({ limit: 100 }),
        pushMarketingApi.queryDevices({ limit: 1, onlyActive: true }).catch(() => null),
      ])
      setCampaigns(campRes?.campaigns || [])
      if (devRes?.counts) {
        setDevicesCount(devRes.counts)
      } else if (devRes?.platformCounts) {
        setDevicesCount({
          totalReachable: devRes.platformCounts.all ?? devRes.totalCount ?? 0,
          android: devRes.platformCounts.android ?? 0,
          ios: devRes.platformCounts.ios ?? 0,
        })
      }
    } catch (err) {
      toast(false, err?.message || 'Could not load push marketing campaigns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleLaunchDraft = async (campaign) => {
    if (
      !window.confirm(
        `Launch push notification broadcast "${campaign.title}" to ${campaign.total_recipients || 0} devices now?`,
      )
    ) {
      return
    }
    try {
      await pushMarketingApi.launchCampaign(campaign.id)
      toast(true, 'Broadcast launched successfully!')
      loadData()
    } catch (err) {
      toast(false, err?.message || 'Failed to start broadcast')
    }
  }

  const filteredCampaigns = campaigns.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      return (
        (c.title && c.title.toLowerCase().includes(s)) ||
        (c.body && c.body.toLowerCase().includes(s)) ||
        (c.route && c.route.toLowerCase().includes(s))
      )
    }
    return true
  })

  // Summary statistics across loaded campaigns
  const totalSentAll = campaigns.reduce((acc, c) => acc + (c.sent_count || 0), 0)
  const totalTargetedAll = campaigns.reduce((acc, c) => acc + (c.total_recipients || 0), 0)
  const totalFailedAll = campaigns.reduce((acc, c) => acc + (c.failed_count || 0), 0)
  const overallSuccessRate =
    totalTargetedAll > 0 ? Math.round((totalSentAll / totalTargetedAll) * 100) : 100

  const statusBadge = (st) => {
    switch (st) {
      case 'completed':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            Completed
          </span>
        )
      case 'sending':
      case 'running':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            Sending...
          </span>
        )
      case 'failed':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
            Failed
          </span>
        )
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Draft
          </span>
        )
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#faf9f5] text-[#1b1c1a] p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#ebe8e0] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-[#1b1c1a] font-serif">
              Mobile Push Marketing
            </h1>
            <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-[#795900] border border-amber-300 text-[11px] font-bold uppercase tracking-wider">
              FCM v1 Engine
            </span>
          </div>
          <p className="text-xs text-[#1b1c1a]/60 mt-1">
            Deliver rich media mobile push broadcasts directly to iOS and Android customers with deep linking and location targeting.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#f5f4f0] text-[#1b1c1a]/80 hover:text-[#1b1c1a] border border-[#ebe8e0] text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
            title="Refresh campaign stats"
          >
            <span>↻</span> Refresh
          </button>

          <button
            onClick={() => setShowComposer(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#795900] via-[#c9a432] to-[#d4a843] hover:opacity-95 text-white font-bold text-xs shadow-md shadow-[#795900]/20 transition-all flex items-center gap-2"
          >
            <span className="text-sm font-bold">+</span>
            <span>New Push Campaign</span>
          </button>
        </div>
      </div>

      {/* Analytics Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-[#ebe8e0] p-4 rounded-2xl shadow-sm">
          <div className="text-[#1b1c1a]/50 text-xs font-semibold uppercase tracking-wider">
            Total Broadcasts
          </div>
          <div className="text-2xl font-extrabold text-[#1b1c1a] mt-1.5">
            {campaigns.length}
          </div>
          <div className="text-[11px] text-[#1b1c1a]/40 mt-1">Campaigns created</div>
        </div>

        <div className="bg-white border border-[#ebe8e0] p-4 rounded-2xl shadow-sm">
          <div className="text-[#1b1c1a]/50 text-xs font-semibold uppercase tracking-wider">
            Reachable Devices
          </div>
          <div className="text-2xl font-extrabold text-[#795900] mt-1.5">
            {devicesCount.totalReachable?.toLocaleString() || 0}
          </div>
          <div className="text-[11px] text-[#1b1c1a]/40 mt-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <Icon name="android" cls="w-3.5 h-3.5" />
              <span>{devicesCount.android || 0}</span>
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Icon name="apple" cls="w-3.5 h-3.5" />
              <span>{devicesCount.ios || 0}</span>
            </span>
          </div>
        </div>

        <div className="bg-white border border-[#ebe8e0] p-4 rounded-2xl shadow-sm">
          <div className="text-[#1b1c1a]/50 text-xs font-semibold uppercase tracking-wider">
            Total Delivered
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1.5">
            {totalSentAll.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#1b1c1a]/40 mt-1">Mobile push notifications</div>
        </div>

        <div className="bg-white border border-[#ebe8e0] p-4 rounded-2xl shadow-sm">
          <div className="text-[#1b1c1a]/50 text-xs font-semibold uppercase tracking-wider">
            Avg Delivery Rate
          </div>
          <div className="text-2xl font-extrabold text-[#1b1c1a] mt-1.5">
            {overallSuccessRate}%
          </div>
          <div className="text-[11px] text-[#1b1c1a]/40 mt-1">FCM delivery success</div>
        </div>

        <div className="bg-white border border-[#ebe8e0] p-4 rounded-2xl shadow-sm">
          <div className="text-[#1b1c1a]/50 text-xs font-semibold uppercase tracking-wider">
            Tokens Pruned
          </div>
          <div className="text-2xl font-extrabold text-gray-700 mt-1.5">
            {totalFailedAll.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#1b1c1a]/40 mt-1">Expired tokens unlinked</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-[#ebe8e0] p-4 rounded-2xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Status Pills */}
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          {[
            { id: 'all', label: 'All Campaigns' },
            { id: 'completed', label: 'Completed' },
            { id: 'sending', label: 'Sending' },
            { id: 'draft', label: 'Drafts' },
            { id: 'failed', label: 'Failed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                statusFilter === tab.id
                  ? 'bg-[#1b1c1a] text-white shadow-sm'
                  : 'bg-[#faf9f5] text-[#1b1c1a]/60 hover:text-[#1b1c1a] hover:bg-[#f0eee6]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#ebe8e0] text-xs focus:outline-none focus:border-[#795900] bg-[#faf9f5]"
          />
          <span className="absolute left-3 top-2.5 text-[#1b1c1a]/40 text-xs">
            <Icon name="search" cls="w-4 h-4 text-gray-400" />
          </span>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-2.5 text-[#1b1c1a]/40 hover:text-black text-xs font-bold"
            >
              <Icon name="close" cls="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white border border-[#ebe8e0] rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-[#1b1c1a]/50 text-xs flex flex-col items-center gap-2">
            <span className="animate-spin text-xl">↻</span>
            <span>Loading campaigns...</span>
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="py-20 text-center text-[#1b1c1a]/60">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-[#795900] flex items-center justify-center mb-3 mx-auto">
              <Icon name="inbox" cls="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold">No push campaigns found</p>
            <p className="text-xs text-[#1b1c1a]/40 mt-1 max-w-sm mx-auto">
              Create your first push notification broadcast to engage shoppers with new collections and personalized offers.
            </p>
            <button
              onClick={() => setShowComposer(true)}
              className="mt-4 px-4 py-2 rounded-xl bg-[#795900] text-white font-bold text-xs hover:opacity-95 shadow-sm inline-flex items-center gap-1.5"
            >
              <Icon name="plus" cls="w-4 h-4 text-white" />
              <span>Create Campaign</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#ebe8e0] bg-[#faf9f5] text-[#1b1c1a]/60 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Campaign & Copy</th>
                  <th className="py-3 px-4">Target Audience</th>
                  <th className="py-3 px-4">Deep Link</th>
                  <th className="py-3 px-4">Delivery</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebe8e0]/60">
                {filteredCampaigns.map((c) => {
                  const total = c.total_recipients || 0
                  const sent = c.sent_count || 0
                  const percent = total > 0 ? Math.round((sent / total) * 100) : 0

                  return (
                    <tr key={c.id} className="hover:bg-amber-50/30 transition-colors">
                      {/* Campaign & Copy */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="flex items-start gap-3">
                          {c.image_url ? (
                            <img
                              src={c.image_url}
                              alt="thumbnail"
                              className="w-12 h-12 rounded-lg object-cover bg-gray-100 border border-[#ebe8e0] flex-shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-700 font-bold text-lg flex items-center justify-center border border-amber-200 flex-shrink-0">
                              <Icon name="megaphone" cls="w-5 h-5 text-[#795900]" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-[#1b1c1a] truncate text-xs">
                              {c.title}
                            </div>
                            <div className="text-[11px] text-[#1b1c1a]/60 line-clamp-1 mt-0.5">
                              {c.body}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Target Audience */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-[#795900] border border-amber-200 uppercase">
                            <Icon
                              name={
                                c.target_type === 'all_devices' || c.target_type === 'all'
                                  ? 'globe'
                                  : c.target_type === 'custom_devices' || c.target_type === 'custom'
                                  ? 'clipboard'
                                  : 'pin'
                              }
                              cls="w-3 h-3 text-[#795900]"
                            />
                            <span>
                              {c.target_type === 'all_devices' || c.target_type === 'all'
                                ? 'All Devices'
                                : c.target_type === 'custom_devices' || c.target_type === 'custom'
                                ? 'Custom List'
                                : 'Region / Geo'}
                            </span>
                          </span>
                          <div className="text-[11px] text-[#1b1c1a]/60">
                            {c.total_recipients ? `${c.total_recipients.toLocaleString()} devices` : 'All'}
                          </div>
                        </div>
                      </td>

                      {/* Deep Link Route */}
                      <td className="py-3.5 px-4">
                        <code className="text-[10px] font-mono bg-gray-100 text-gray-800 px-2 py-0.5 rounded border border-gray-200">
                          {c.route || '/home'}
                        </code>
                      </td>

                      {/* Delivery */}
                      <td className="py-3.5 px-4 min-w-[140px]">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="font-semibold text-[#1b1c1a]">
                              {sent.toLocaleString()} / {total.toLocaleString()}
                            </span>
                            <span className="text-[#1b1c1a]/50">{percent}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#795900] to-amber-500 rounded-full transition-all"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-[11px] text-[#1b1c1a]/60 whitespace-nowrap">
                        <div>{new Date(c.created_at).toLocaleDateString()}</div>
                        <div className="text-[10px] text-[#1b1c1a]/40">
                          {c.sent_at
                            ? `Sent: ${new Date(c.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Draft'}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {statusBadge(c.status)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.status === 'draft' && (
                            <button
                              onClick={() => handleLaunchDraft(c)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-sm"
                            >
                              Launch
                            </button>
                          )}
                          <button
                            onClick={() => setInspectCampaignId(c.id)}
                            className="px-2.5 py-1 rounded-lg bg-white hover:bg-gray-50 border border-[#ebe8e0] text-[#1b1c1a] text-[11px] font-semibold shadow-sm"
                          >
                            Report
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Campaign Composer Modal */}
      {showComposer && (
        <PushCampaignComposerModal
          onClose={() => setShowComposer(false)}
          onCreated={() => loadData()}
        />
      )}

      {/* Campaign Report Modal */}
      {inspectCampaignId && (
        <PushCampaignReportModal
          campaignId={inspectCampaignId}
          onClose={() => setInspectCampaignId(null)}
        />
      )}
    </div>
  )
}

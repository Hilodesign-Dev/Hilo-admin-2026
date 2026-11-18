import React, { useState, useEffect, useCallback } from 'react'
import { waMarketingApi } from '../../lib/waMarketingApi'
import { toast } from '../../lib/designTokens'
import CampaignComposerModal from './CampaignComposerModal'
import CampaignReportModal from './CampaignReportModal'

export default function WhatsAppMarketingTab({ onNavigateToInbox }) {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Modals state
  const [showComposer, setShowComposer] = useState(false)
  const [inspectCampaignId, setInspectCampaignId] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [campRes, statRes] = await Promise.all([
        waMarketingApi.listCampaigns({ limit: 50 }),
        waMarketingApi.getOverview().catch(() => null),
      ])
      setCampaigns(campRes?.campaigns || [])
      if (statRes) setOverview(statRes)
    } catch (err) {
      toast(false, err?.message || 'Could not load marketing broadcasts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleLaunchDraft = async (campaign) => {
    if (!window.confirm(`Launch broadcast "${campaign.title}" to ${campaign.total_recipients || 0} recipients now?`)) {
      return
    }
    try {
      await waMarketingApi.sendCampaign(campaign.id)
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
      return c.title.toLowerCase().includes(s) || (c.description && c.description.toLowerCase().includes(s))
    }
    return true
  })

  const statusBadge = (st) => {
    switch (st) {
      case 'running':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            Sending...
          </span>
        )
      case 'completed':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
            Completed
          </span>
        )
      case 'scheduled':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            Scheduled
          </span>
        )
      case 'paused':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
            Paused
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
              WhatsApp Marketing
            </h1>
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold uppercase tracking-wider">
              Cloud API
            </span>
          </div>
          <p className="text-xs text-[#1b1c1a]/60 mt-1">
            Send rich multimedia announcements with verified Meta templates, CTA buttons, and dedicated recipient controls.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#f5f4f0] text-[#1b1c1a]/80 hover:text-[#1b1c1a] border border-[#ebe8e0] text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
            title="Refresh broadcast stats"
          >
            <span>↻</span> Refresh
          </button>

          <button
            onClick={() => setShowComposer(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#795900] via-[#c9a432] to-[#d4a843] hover:opacity-95 text-white font-bold text-xs shadow-md shadow-[#795900]/20 transition-all flex items-center gap-2"
          >
            <span className="text-sm font-bold">+</span>
            <span>New Campaign</span>
          </button>
        </div>
      </div>

      {/* Analytics Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-[#ebe8e0] p-4 rounded-2xl shadow-sm">
          <div className="text-[#1b1c1a]/50 text-xs font-semibold uppercase tracking-wider">Total Campaigns</div>
          <div className="text-2xl font-extrabold text-[#1b1c1a] mt-1.5">
            {overview?.totalCampaigns ?? campaigns.length}
          </div>
          <div className="text-[11px] text-[#1b1c1a]/40 mt-1">Campaigns created</div>
        </div>

        <div className="bg-white border border-[#ebe8e0] p-4 rounded-2xl shadow-sm">
          <div className="text-[#1b1c1a]/50 text-xs font-semibold uppercase tracking-wider">Total Reached</div>
          <div className="text-2xl font-extrabold text-[#1b1c1a] mt-1.5">
            {overview?.totalSent ?? 0}
          </div>
          <div className="text-[11px] text-[#1b1c1a]/40 mt-1">Messages dispatched</div>
        </div>

        <div className="bg-white border border-[#ebe8e0] p-4 rounded-2xl shadow-sm">
          <div className="text-[#1b1c1a]/50 text-xs font-semibold uppercase tracking-wider">Delivery Rate</div>
          <div className="text-2xl font-extrabold text-emerald-600 mt-1.5">
            {overview?.deliveryRate ?? '0.0'}%
          </div>
          <div className="text-[11px] text-[#1b1c1a]/40 mt-1">Delivered to devices</div>
        </div>

        <div className="bg-white border border-[#ebe8e0] p-4 rounded-2xl shadow-sm">
          <div className="text-[#1b1c1a]/50 text-xs font-semibold uppercase tracking-wider">Read / Open Rate</div>
          <div className="text-2xl font-extrabold text-blue-600 mt-1.5">
            {overview?.readRate ?? '0.0'}%
          </div>
          <div className="text-[11px] text-[#1b1c1a]/40 mt-1">Customer read receipts</div>
        </div>

        <div className="bg-white border border-[#ebe8e0] p-4 rounded-2xl shadow-sm">
          <div className="text-[#1b1c1a]/50 text-xs font-semibold uppercase tracking-wider">Response / CTR</div>
          <div className="text-2xl font-extrabold text-[#795900] mt-1.5">
            {overview?.replyRate ?? '0.0'}%
          </div>
          <div className="text-[11px] text-[#1b1c1a]/40 mt-1">CTA clicks & replies</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex gap-2">
          {['all', 'completed', 'running', 'draft'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                statusFilter === st
                  ? 'bg-white text-[#795900] font-bold shadow-sm border border-[#ebe8e0]'
                  : 'text-[#1b1c1a]/60 hover:text-[#1b1c1a] hover:bg-white/60'
              }`}
            >
              {st} ({campaigns.filter((c) => st === 'all' || c.status === st).length})
            </button>
          ))}
        </div>

        <div className="w-full md:w-72">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full bg-white border border-[#ebe8e0] rounded-xl px-3.5 py-2 text-xs text-[#1b1c1a] placeholder:text-[#1b1c1a]/40 shadow-sm focus:outline-none focus:border-[#795900]"
          />
        </div>
      </div>

      {/* Campaign List */}
      {loading ? (
        <div className="py-24 text-center text-[#1b1c1a]/40 text-sm">
          Loading campaigns...
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="py-20 text-center bg-white border border-[#ebe8e0] rounded-2xl shadow-sm">
          <span className="text-4xl">📢</span>
          <h3 className="text-base font-bold text-[#1b1c1a] mt-3">No Marketing Campaigns Yet</h3>
          <p className="text-xs text-[#1b1c1a]/50 max-w-sm mx-auto mt-1 mb-5">
            Create your first WhatsApp announcement to announce seasonal collections, exclusive offers, or store events.
          </p>
          <button
            onClick={() => setShowComposer(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#795900] to-[#c9a432] text-white font-bold text-xs shadow-md transition-all hover:opacity-95"
          >
            Create First Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredCampaigns.map((camp) => {
            const deliveredPct = camp.sent_count ? Math.round(((camp.delivered_count || 0) / camp.sent_count) * 100) : 0
            const readPct = camp.delivered_count ? Math.round(((camp.read_count || 0) / camp.delivered_count) * 100) : 0

            return (
              <div
                key={camp.id}
                className="bg-white hover:border-[#c9a432]/60 border border-[#ebe8e0] rounded-2xl p-5 transition-all shadow-sm flex flex-col md:flex-row gap-5 items-start md:items-center justify-between"
              >
                {/* Left: Thumbnail & Title */}
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#faf9f5] border border-[#ebe8e0] flex-shrink-0 flex items-center justify-center">
                    {camp.image_url ? (
                      <img src={camp.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl text-[#1b1c1a]/30">📢</span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-sm font-bold text-[#1b1c1a] truncate">{camp.title}</h3>
                      {statusBadge(camp.status)}
                    </div>
                    <p className="text-xs text-[#1b1c1a]/60 truncate max-w-md mt-1">
                      {camp.body_text}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-[#1b1c1a]/40">
                      <span>Target: <strong className="text-[#1b1c1a]/80">{camp.total_recipients || 0} recipients</strong></span>
                      <span>•</span>
                      <span>Created {new Date(camp.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Middle: Delivery Funnel / Progress */}
                <div className="flex items-center gap-6 w-full md:w-auto">
                  <div className="text-center min-w-[60px]">
                    <div className="text-xs text-[#1b1c1a]/40 font-medium">Sent</div>
                    <div className="text-sm font-bold text-[#1b1c1a] mt-0.5">{camp.sent_count || 0}</div>
                  </div>

                  <div className="text-center min-w-[70px]">
                    <div className="text-xs text-[#1b1c1a]/40 font-medium">Delivered</div>
                    <div className="text-sm font-bold text-emerald-600 mt-0.5">
                      {camp.delivered_count || 0} <span className="text-[10px] text-[#1b1c1a]/40">({deliveredPct}%)</span>
                    </div>
                  </div>

                  <div className="text-center min-w-[70px]">
                    <div className="text-xs text-[#1b1c1a]/40 font-medium">Read</div>
                    <div className="text-sm font-bold text-blue-600 mt-0.5">
                      {camp.read_count || 0} <span className="text-[10px] text-[#1b1c1a]/40">({readPct}%)</span>
                    </div>
                  </div>

                  <div className="text-center min-w-[60px]">
                    <div className="text-xs text-[#1b1c1a]/40 font-medium">Replied</div>
                    <div className="text-sm font-bold text-[#795900] mt-0.5">{camp.replied_count || 0}</div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                  {camp.status === 'draft' && (
                    <button
                      onClick={() => handleLaunchDraft(camp)}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 text-xs font-bold transition-colors"
                    >
                      🚀 Launch Broadcast
                    </button>
                  )}

                  <button
                    onClick={() => setInspectCampaignId(camp.id)}
                    className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-[#f5f4f0] text-[#1b1c1a] text-xs font-semibold transition-colors border border-[#ebe8e0] shadow-sm"
                  >
                    View Report 📊
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Broadcast Composer Modal */}
      {showComposer && (
        <CampaignComposerModal
          onClose={() => setShowComposer(false)}
          onCreated={() => {
            loadData()
          }}
        />
      )}

      {/* Campaign Detailed Audit & Recipient Report Modal */}
      {inspectCampaignId && (
        <CampaignReportModal
          campaignId={inspectCampaignId}
          onClose={() => setInspectCampaignId(null)}
          onNavigateToInbox={onNavigateToInbox}
        />
      )}
    </div>
  )
}

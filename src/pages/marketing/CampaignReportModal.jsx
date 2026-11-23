import React, { useState, useEffect } from 'react'
import { waMarketingApi } from '../../lib/waMarketingApi'
import { toast } from '../../lib/designTokens'

export default function CampaignReportModal({ campaignId, onClose, onNavigateToInbox }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    let cancelled = false
    waMarketingApi
      .getCampaign(campaignId)
      .then((res) => {
        if (!cancelled && res) setData(res)
      })
      .catch((err) => toast(false, err?.message || 'Could not load campaign report'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [campaignId])

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="p-8 text-center text-white text-sm bg-black/40 rounded-2xl">
          Loading campaign report...
        </div>
      </div>
    )
  }

  const campaign = data?.campaign
  const recipients = data?.recipients || []

  const filteredRecipients = recipients.filter((r) => {
    if (filterStatus === 'all') return true
    return r.status === filterStatus
  })

  const statusBadge = (st) => {
    switch (st) {
      case 'read':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1 w-fit">
            <span>✓✓</span> Read
          </span>
        )
      case 'delivered':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-800 border border-gray-300 flex items-center gap-1 w-fit">
            <span>✓✓</span> Delivered
          </span>
        )
      case 'replied':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 w-fit">
            <span>💬</span> Replied
          </span>
        )
      case 'sent':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1 w-fit">
            <span>✓</span> Sent
          </span>
        )
      case 'failed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-300 flex items-center gap-1 w-fit">
            <span>✕</span> Failed
          </span>
        )
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 border border-gray-200 flex items-center gap-1 w-fit">
            <span>⏳</span> Queued
          </span>
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in text-[#1b1c1a]">
      <div className="bg-white border border-[#ebe8e0] rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#ebe8e0] flex items-center justify-between bg-[#faf9f5]">
          <div>
            <h2 className="text-lg font-bold text-[#1b1c1a] flex items-center gap-2">
              <span>📊</span> {campaign?.title || 'Broadcast Report'}
            </h2>
            <div className="text-xs text-[#1b1c1a]/60 flex gap-3 mt-1">
              <span>Status: <strong className="text-[#795900] uppercase">{campaign?.status}</strong></span>
              <span>•</span>
              <span>Dispatched: {campaign?.started_at ? new Date(campaign.started_at).toLocaleString() : 'Not started'}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-black/5 hover:bg-black/10 text-[#1b1c1a]/60 hover:text-[#1b1c1a] flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 p-6 border-b border-[#ebe8e0] bg-[#faf9f5]">
          <div className="bg-white p-3.5 rounded-xl border border-[#ebe8e0] shadow-sm">
            <div className="text-xs text-[#1b1c1a]/50 font-semibold uppercase tracking-wider">Target Reached</div>
            <div className="text-xl font-bold text-[#1b1c1a] mt-1">{campaign?.total_recipients || 0}</div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-[#ebe8e0] shadow-sm">
            <div className="text-xs text-[#1b1c1a]/50 font-semibold uppercase tracking-wider">Delivered</div>
            <div className="text-xl font-bold text-[#1b1c1a] mt-1">
              {campaign?.delivered_count || 0}
              <span className="text-xs text-[#1b1c1a]/40 font-normal ml-1.5">
                ({campaign?.sent_count ? Math.round(((campaign.delivered_count || 0) / campaign.sent_count) * 100) : 0}%)
              </span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-[#ebe8e0] shadow-sm">
            <div className="text-xs text-[#1b1c1a]/50 font-semibold uppercase tracking-wider">Read / Opened</div>
            <div className="text-xl font-bold text-blue-600 mt-1">
              {campaign?.read_count || 0}
              <span className="text-xs text-[#1b1c1a]/40 font-normal ml-1.5">
                ({campaign?.delivered_count ? Math.round(((campaign.read_count || 0) / campaign.delivered_count) * 100) : 0}%)
              </span>
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-[#ebe8e0] shadow-sm">
            <div className="text-xs text-[#1b1c1a]/50 font-semibold uppercase tracking-wider">Replied / CTA</div>
            <div className="text-xl font-bold text-emerald-600 mt-1">{campaign?.replied_count || 0}</div>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-[#ebe8e0] shadow-sm">
            <div className="text-xs text-[#1b1c1a]/50 font-semibold uppercase tracking-wider">Failed</div>
            <div className="text-xl font-bold text-red-600 mt-1">{campaign?.failed_count || 0}</div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="px-6 py-3 border-b border-[#ebe8e0] flex gap-2 overflow-x-auto bg-[#faf9f5]">
          {['all', 'read', 'delivered', 'replied', 'sent', 'failed'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                filterStatus === st
                  ? 'bg-white text-[#795900] font-bold shadow-sm border border-[#ebe8e0]'
                  : 'text-[#1b1c1a]/60 hover:text-[#1b1c1a] hover:bg-white/60'
              }`}
            >
              {st} ({recipients.filter((r) => st === 'all' || r.status === st).length})
            </button>
          ))}
        </div>

        {/* Recipients Table */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {filteredRecipients.length === 0 ? (
            <div className="py-16 text-center text-[#1b1c1a]/40 text-sm">
              No recipients match this filter.
            </div>
          ) : (
            <div className="border border-[#ebe8e0] rounded-xl overflow-hidden bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#faf9f5] text-[#1b1c1a]/60 font-semibold border-b border-[#ebe8e0]">
                  <tr>
                    <th className="p-3">Recipient</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Delivery Status</th>
                    <th className="p-3">Timeline</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebe8e0]">
                  {filteredRecipients.map((r) => (
                    <tr key={r.id} className="hover:bg-[#faf9f5] transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-[#1b1c1a]">{r.name || 'Shopper'}</div>
                      </td>
                      <td className="p-3 font-mono text-[#1b1c1a]/80">+{r.phone}</td>
                      <td className="p-3">
                        <span className="text-[#1b1c1a]/70 capitalize text-[11px] bg-black/5 px-2 py-0.5 rounded">
                          {r.source.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3">
                        {statusBadge(r.status)}
                        {r.error_message && (
                          <div className="text-[10px] text-red-600 mt-1 max-w-xs truncate" title={r.error_message}>
                            {r.error_message}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-[#1b1c1a]/50 text-[11px]">
                        {r.read_at ? (
                          <span>Read {new Date(r.read_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        ) : r.delivered_at ? (
                          <span>Delivered {new Date(r.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        ) : r.sent_at ? (
                          <span>Sent {new Date(r.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {onNavigateToInbox && (
                          <button
                            onClick={() => {
                              onClose()
                              onNavigateToInbox()
                            }}
                            className="text-[11px] text-[#795900] hover:underline font-semibold"
                          >
                            Open Support Chat ↗
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#ebe8e0] flex justify-end bg-[#faf9f5]">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold text-[#1b1c1a] bg-white hover:bg-[#ebe8e0] border border-[#ebe8e0] shadow-sm transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  )
}

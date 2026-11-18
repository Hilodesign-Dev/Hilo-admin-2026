import React, { useState, useEffect } from 'react'
import { pushMarketingApi } from '../../lib/notificationsApi'
import { toast } from '../../lib/designTokens'
import Icon from '../../components/Icon'

export default function PushCampaignReportModal({ campaignId, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadReport = () => {
    setLoading(true)
    pushMarketingApi
      .getCampaign(campaignId)
      .then((res) => {
        setData(res)
      })
      .catch((err) => {
        toast(false, err?.message || 'Failed to load campaign report')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    loadReport()
  }, [campaignId])

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="p-8 text-center text-white text-xs bg-black/60 rounded-2xl flex flex-col items-center gap-2">
          <span className="animate-spin text-xl">↻</span>
          <span>Loading campaign report...</span>
        </div>
      </div>
    )
  }

  const c = data?.campaign
  if (!c) {
    return null
  }

  const total = c.total_recipients || 0
  const sent = c.sent_count || 0
  const failed = c.failed_count || 0
  const successRate = total > 0 ? Math.round((sent / total) * 100) : 0

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
            Broadcasting...
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in text-[#1b1c1a]">
      <div className="bg-white border border-[#ebe8e0] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#ebe8e0] flex items-center justify-between bg-[#faf9f5]">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-[#1b1c1a] font-serif">
                {c.title || 'Push Broadcast Report'}
              </h2>
              {statusBadge(c.status)}
            </div>
            <p className="text-xs text-[#1b1c1a]/60 mt-0.5">
              Campaign ID: <code className="font-mono text-[10px] text-[#795900]">{c.id}</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadReport}
              className="px-3 py-1.5 rounded-xl border border-[#ebe8e0] bg-white hover:bg-gray-50 text-xs font-medium flex items-center gap-1"
            >
              <span>↻</span> Refresh
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-gray-600 flex items-center justify-center text-sm font-bold transition-all"
            >
              <Icon name="close" cls="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#faf9f5] border border-[#ebe8e0] p-4 rounded-xl">
              <div className="text-[11px] font-semibold text-[#1b1c1a]/50 uppercase tracking-wider">
                Total Targeted
              </div>
              <div className="text-2xl font-extrabold text-[#1b1c1a] mt-1">
                {total.toLocaleString()}
              </div>
              <div className="text-[10px] text-[#1b1c1a]/40 mt-0.5">Devices in segment</div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-200 p-4 rounded-xl">
              <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                Delivered
              </div>
              <div className="text-2xl font-extrabold text-emerald-700 mt-1">
                {sent.toLocaleString()}
              </div>
              <div className="text-[10px] text-emerald-600 mt-0.5">FCM push sent</div>
            </div>

            <div className="bg-red-50/50 border border-red-200 p-4 rounded-xl">
              <div className="text-[11px] font-semibold text-red-800 uppercase tracking-wider">
                Failed / Expired
              </div>
              <div className="text-2xl font-extrabold text-red-700 mt-1">
                {failed.toLocaleString()}
              </div>
              <div className="text-[10px] text-red-600 mt-0.5">Unregistered tokens pruned</div>
            </div>

            <div className="bg-amber-50/50 border border-amber-200 p-4 rounded-xl">
              <div className="text-[11px] font-semibold text-[#795900] uppercase tracking-wider">
                Success Rate
              </div>
              <div className="text-2xl font-extrabold text-[#795900] mt-1">
                {successRate}%
              </div>
              <div className="text-[10px] text-[#795900]/70 mt-0.5">Delivery ratio</div>
            </div>
          </div>

          {/* Creative & Content Preview */}
          <div className="bg-white border border-[#ebe8e0] rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1b1c1a]/60">
              Push Notification Creative
            </h3>

            <div className="flex flex-col md:flex-row gap-5 items-start">
              {c.image_url ? (
                <div className="w-full md:w-56 h-36 rounded-xl overflow-hidden bg-gray-100 border border-[#ebe8e0] flex-shrink-0">
                  <img
                    src={c.image_url}
                    alt="Creative banner"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-full md:w-56 h-36 rounded-xl bg-[#faf9f5] border border-dashed border-[#ebe8e0] flex flex-col items-center justify-center text-[#1b1c1a]/40 text-xs flex-shrink-0">
                  <Icon name="image" cls="w-8 h-8 mb-1 text-gray-300" />
                  <span>No image banner</span>
                </div>
              )}

              <div className="flex-1 space-y-3 min-w-0">
                <div>
                  <div className="text-[11px] font-semibold text-[#1b1c1a]/50">Notification Title:</div>
                  <div className="text-sm font-bold text-[#1b1c1a] mt-0.5">{c.title}</div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-[#1b1c1a]/50">Notification Body:</div>
                  <div className="text-xs text-[#1b1c1a]/80 mt-0.5 whitespace-pre-wrap leading-relaxed">
                    {c.body}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-[#1b1c1a]/50">Target App Route:</div>
                  <div className="mt-0.5">
                    <code className="text-xs font-mono bg-amber-50 text-[#795900] border border-amber-200 px-2 py-0.5 rounded">
                      {c.route || '/home'}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Targeting & Schedule details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Target Breakdown */}
            <div className="bg-white border border-[#ebe8e0] rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1b1c1a]/60">
                Targeting Configuration
              </h4>
              <div className="space-y-1.5 text-xs text-[#1b1c1a]/80">
                <div className="flex justify-between">
                  <span className="text-[#1b1c1a]/50">Target Strategy:</span>
                  <span className="font-semibold capitalize text-[#795900]">
                    {String(c.target_type || 'all_devices').replace('_', ' ')}
                  </span>
                </div>
                {c.target_filters?.cities?.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#1b1c1a]/50">Target Cities:</span>
                    <span className="font-semibold">{c.target_filters.cities.join(', ')}</span>
                  </div>
                )}
                {c.target_filters?.states?.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#1b1c1a]/50">Target States:</span>
                    <span className="font-semibold">{c.target_filters.states.join(', ')}</span>
                  </div>
                )}
                {c.target_filters?.platforms?.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#1b1c1a]/50">Target Platforms:</span>
                    <span className="font-semibold uppercase">{c.target_filters.platforms.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Timestamps */}
            <div className="bg-white border border-[#ebe8e0] rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1b1c1a]/60">
                Execution Timeline
              </h4>
              <div className="space-y-1.5 text-xs text-[#1b1c1a]/80">
                <div className="flex justify-between">
                  <span className="text-[#1b1c1a]/50">Created At:</span>
                  <span>{c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#1b1c1a]/50">Dispatched At:</span>
                  <span>{c.sent_at ? new Date(c.sent_at).toLocaleString() : 'Not dispatched yet'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Error Logs (if any) */}
          {c.error_log && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-red-800 uppercase tracking-wider">
                Broadcast Execution Logs
              </h4>
              <pre className="text-[11px] font-mono text-red-700 whitespace-pre-wrap overflow-x-auto max-h-40 bg-white/60 p-3 rounded-lg border border-red-100">
                {typeof c.error_log === 'string'
                  ? c.error_log
                  : JSON.stringify(c.error_log, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#ebe8e0] bg-[#faf9f5] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white border border-[#ebe8e0] hover:bg-gray-50 text-xs font-semibold"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  )
}

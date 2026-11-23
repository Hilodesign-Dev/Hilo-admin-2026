import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { waMarketingApi } from '../../lib/waMarketingApi'
import { toast } from '../../lib/designTokens'

export default function RecipientPickerModal({
  selectedRecipients = [],
  onConfirm,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState('whatsapp_chat')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [counts, setCounts] = useState({ whatsapp_chat: 0, app_users: 0, customers: 0, total: 0 })
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Map of selected phone -> RecipientItem
  const [selectedMap, setSelectedMap] = useState(() => {
    const map = new Map()
    for (const r of selectedRecipients) {
      if (r?.phone) map.set(r.phone, r)
    }
    return map
  })

  // Custom numbers textarea
  const [customInput, setCustomInput] = useState('')
  const [validatingCustom, setValidatingCustom] = useState(false)
  const [customResult, setCustomResult] = useState(null)
  const [showReviewList, setShowReviewList] = useState(false)

  // Fetch recipients for active tab
  const fetchList = useCallback(async () => {
    if (activeTab === 'custom') return
    setLoading(true)
    try {
      const res = await waMarketingApi.queryRecipients({
        source: activeTab,
        search,
        page,
        limit: 100,
      })
      setItems(res?.items || [])
      setCounts(res?.counts || { whatsapp_chat: 0, app_users: 0, customers: 0, total: 0 })
      setTotalPages(res?.totalPages || 1)
    } catch (err) {
      toast(false, err?.message || 'Failed to fetch recipients')
    } finally {
      setLoading(false)
    }
  }, [activeTab, search, page])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const toggleRecipient = (item) => {
    setSelectedMap((prev) => {
      const next = new Map(prev)
      if (next.has(item.phone)) {
        next.delete(item.phone)
      } else {
        next.set(item.phone, item)
      }
      return next
    })
  }

  const [selectingAll, setSelectingAll] = useState(false)

  // Select ALL candidates from the entire database for the activeTab
  const selectAllFromSystem = async () => {
    setSelectingAll(true)
    try {
      const res = await waMarketingApi.queryRecipients({
        source: activeTab,
        search,
        fetchAll: true,
      })
      const allItems = res?.items || []
      setSelectedMap((prev) => {
        const next = new Map(prev)
        for (const item of allItems) {
          next.set(item.phone, item)
        }
        return next
      })
      const tabLabel =
        activeTab === 'whatsapp_chat'
          ? 'WhatsApp Chat contacts'
          : activeTab === 'app_users'
          ? 'App Users'
          : 'recipients'
      toast(true, `✓ Selected all ${allItems.length} ${tabLabel} from system`)
    } catch (err) {
      toast(false, err?.message || 'Failed to select all candidates')
    } finally {
      setSelectingAll(false)
    }
  }

  const selectAllCurrent = () => {
    setSelectedMap((prev) => {
      const next = new Map(prev)
      for (const item of items) {
        next.set(item.phone, item)
      }
      return next
    })
  }

  const deselectAllCurrent = () => {
    setSelectedMap((prev) => {
      const next = new Map(prev)
      for (const item of items) {
        next.delete(item.phone)
      }
      return next
    })
  }

  const clearAllSelected = () => {
    setSelectedMap(new Map())
  }

  // Handle custom numbers validation
  const handleValidateCustom = async () => {
    if (!customInput.trim()) {
      toast(false, 'Please paste or type phone numbers first')
      return
    }
    setValidatingCustom(true)
    try {
      const res = await waMarketingApi.validateCustomNumbers(customInput)
      setCustomResult(res)
      if (res?.valid && res.valid.length > 0) {
        setSelectedMap((prev) => {
          const next = new Map(prev)
          for (const item of res.valid) {
            next.set(item.phone, item)
          }
          return next
        })
        toast(true, `Added ${res.valid.length} custom numbers to selection`)
        setCustomInput('')
      } else {
        toast(false, 'No valid phone numbers found')
      }
    } catch (err) {
      toast(false, err?.message || 'Failed to validate custom numbers')
    } finally {
      setValidatingCustom(false)
    }
  }

  const selectedList = useMemo(() => Array.from(selectedMap.values()), [selectedMap])

  const sourceBadge = (src) => {
    switch (src) {
      case 'whatsapp_chat':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1">
            <span>💬</span> WhatsApp Chat
          </span>
        )
      case 'app_users':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-300 flex items-center gap-1">
            <span>📱</span> App User
          </span>
        )
      case 'customers':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
            <span>🛍️</span> Store/Shopify
          </span>
        )
      case 'leads':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-800 border border-purple-300 flex items-center gap-1">
            <span>🎯</span> Lead
          </span>
        )
      case 'custom':
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-800 border border-gray-300 flex items-center gap-1">
            <span>✍️</span> Custom Input
          </span>
        )
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in text-[#1b1c1a]">
      <div className="bg-white border border-[#ebe8e0] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#ebe8e0] flex items-center justify-between bg-[#faf9f5]">
          <div>
            <h2 className="text-lg font-bold text-[#1b1c1a] flex items-center gap-2">
              <span className="text-[#795900]">👥</span> Select Target Audience
            </h2>
            <p className="text-xs text-[#1b1c1a]/60 mt-0.5">
              Choose contacts from WhatsApp chats, registered app users, or paste custom numbers
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-black/5 hover:bg-black/10 text-[#1b1c1a]/60 hover:text-[#1b1c1a] flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Source Filter Tabs */}
        <div className="px-6 pt-3 pb-2 border-b border-[#ebe8e0] flex flex-wrap gap-2 items-center justify-between bg-[#faf9f5]">
          <div className="flex gap-1.5 overflow-x-auto">
            <button
              onClick={() => {
                setActiveTab('whatsapp_chat')
                setPage(1)
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'whatsapp_chat'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-sm'
                  : 'text-[#1b1c1a]/60 hover:text-[#1b1c1a] hover:bg-white'
              }`}
            >
              <span>💬 WhatsApp Chat Only</span>
              <span className="bg-emerald-200/60 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                {counts.whatsapp_chat || 0}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('app_users')
                setPage(1)
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'app_users'
                  ? 'bg-blue-100 text-blue-900 border border-blue-300 shadow-sm'
                  : 'text-[#1b1c1a]/60 hover:text-[#1b1c1a] hover:bg-white'
              }`}
            >
              <span>📱 App Users Only</span>
              <span className="bg-blue-200/60 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                {counts.app_users || 0}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('all')
                setPage(1)
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'all'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-sm'
                  : 'text-[#1b1c1a]/60 hover:text-[#1b1c1a] hover:bg-white'
              }`}
            >
              <span>🌐 All Combined</span>
              <span className="bg-amber-200/60 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                {counts.total || 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('custom')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'custom'
                  ? 'bg-purple-100 text-purple-900 border border-purple-300 shadow-sm'
                  : 'text-[#1b1c1a]/60 hover:text-[#1b1c1a] hover:bg-white'
              }`}
            >
              <span>✍️ Paste Custom Numbers</span>
            </button>
          </div>

          {activeTab !== 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* System-wide Select All */}
              <button
                type="button"
                onClick={selectAllFromSystem}
                disabled={selectingAll}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#795900] to-[#c9a432] text-white hover:opacity-95 disabled:opacity-50 shadow-xs transition-all flex items-center gap-1.5"
                title="Select all matching candidates from the entire system, not just this page"
              >
                {selectingAll ? (
                  <span>⏳ Selecting...</span>
                ) : (
                  <>
                    <span>✓</span>
                    <span>
                      Select All (
                      {activeTab === 'whatsapp_chat'
                        ? counts.whatsapp_chat || 0
                        : activeTab === 'app_users'
                        ? counts.app_users || 0
                        : counts.total || 0}
                      )
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={selectAllCurrent}
                className="text-xs text-[#795900] hover:text-[#5a4200] font-semibold px-2.5 py-1.5 rounded-lg bg-amber-50/80 hover:bg-amber-100/70 border border-amber-200/60 transition-colors"
                title="Select only the candidates shown on the current page"
              >
                + Select on page ({items.length})
              </button>

              <button
                type="button"
                onClick={deselectAllCurrent}
                className="text-xs text-[#1b1c1a]/60 hover:text-[#1b1c1a] font-medium px-2.5 py-1.5 rounded-lg hover:bg-black/5 transition-colors"
              >
                Deselect page
              </button>
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto min-h-[340px] p-6 bg-white">
          {activeTab === 'custom' ? (
            /* Custom Numbers Tab */
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="bg-[#faf9f5] p-5 rounded-xl border border-[#ebe8e0]">
                <label className="block text-sm font-bold text-[#1b1c1a] mb-1">
                  Type or Paste Phone Numbers
                </label>
                <p className="text-xs text-[#1b1c1a]/60 mb-3">
                  Paste 10-digit Indian numbers (or international numbers with country code). Separate by commas, lines, or spaces. Format: <code className="bg-white px-1.5 py-0.5 border border-[#ebe8e0] rounded text-[#795900] font-mono">9876543210: Rohan Sharma</code> or simply <code className="bg-white px-1.5 py-0.5 border border-[#ebe8e0] rounded text-[#795900] font-mono">9876543210</code>.
                </p>

                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="9876543210&#10;+91 9123456780: Rajesh&#10;8888888888, 7777777777"
                  className="w-full h-44 bg-white border border-[#ebe8e0] rounded-lg p-3 text-sm text-[#1b1c1a] font-mono placeholder:text-[#1b1c1a]/30 focus:outline-none focus:border-[#795900] shadow-sm"
                />

                <div className="flex items-center justify-between mt-3">
                  <div className="text-xs text-[#1b1c1a]/50">
                    Auto-normalizes to E.164 and checks opt-outs.
                  </div>
                  <button
                    onClick={handleValidateCustom}
                    disabled={validatingCustom || !customInput.trim()}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#795900] to-[#c9a432] hover:opacity-95 disabled:opacity-40 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    {validatingCustom ? 'Validating...' : '✓ Validate & Add to Broadcast'}
                  </button>
                </div>
              </div>

              {customResult && (
                <div className="bg-[#faf9f5] p-3 rounded-lg border border-[#ebe8e0] flex items-center justify-between text-xs">
                  <div className="flex gap-4">
                    <span className="text-emerald-700 font-bold">
                      ✓ Valid: {customResult.validCount}
                    </span>
                    <span className="text-amber-700 font-bold">
                      Duplicates: {customResult.duplicatesCount}
                    </span>
                    <span className="text-red-700 font-bold">
                      Invalid: {customResult.invalidCount}
                    </span>
                  </div>
                  <span className="text-[#1b1c1a]/50">Appended to your selected list</span>
                </div>
              )}
            </div>
          ) : (
            /* Table of Contact Users */
            <div className="space-y-3">
              {/* Search input */}
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  placeholder={`Search in ${activeTab.replace('_', ' ')} by name or phone number...`}
                  className="w-full bg-[#faf9f5] border border-[#ebe8e0] rounded-xl px-4 py-2 text-sm text-[#1b1c1a] placeholder:text-[#1b1c1a]/40 focus:outline-none focus:border-[#795900]"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-2.5 text-xs text-[#1b1c1a]/40 hover:text-[#1b1c1a]"
                  >
                    Clear
                  </button>
                )}
              </div>

              {loading ? (
                <div className="py-16 text-center text-[#1b1c1a]/40 text-sm">
                  Loading contacts...
                </div>
              ) : items.length === 0 ? (
                <div className="py-16 text-center text-[#1b1c1a]/40 text-sm">
                  No contacts found for this criteria.
                </div>
              ) : (
                <div className="border border-[#ebe8e0] rounded-xl overflow-hidden bg-white shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#faf9f5] text-[#1b1c1a]/60 font-semibold border-b border-[#ebe8e0]">
                      <tr>
                        <th className="p-3 w-10 text-center">Pick</th>
                        <th className="p-3">Contact</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3">Source</th>
                        <th className="p-3 text-right">Last Active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ebe8e0]">
                      {items.map((item) => {
                        const isSelected = selectedMap.has(item.phone)
                        return (
                          <tr
                            key={item.phone}
                            onClick={() => toggleRecipient(item)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-amber-50/70 hover:bg-amber-50' : 'hover:bg-[#faf9f5]'
                            }`}
                          >
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="w-4 h-4 rounded text-[#795900] focus:ring-[#795900] bg-white border-[#ebe8e0] cursor-pointer"
                              />
                            </td>
                            <td className="p-3">
                              <div className="font-semibold text-[#1b1c1a] flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-[10px] text-[#795900] font-bold">
                                  {(item.name || 'S')[0].toUpperCase()}
                                </div>
                                <span>{item.name || 'Shopper'}</span>
                              </div>
                            </td>
                            <td className="p-3 text-[#1b1c1a]/80 font-mono">
                              +{item.phone}
                            </td>
                            <td className="p-3">{sourceBadge(item.source)}</td>
                            <td className="p-3 text-right text-[#1b1c1a]/50">
                              {item.lastActiveAt
                                ? new Date(item.lastActiveAt).toLocaleDateString()
                                : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2 text-xs text-[#1b1c1a]/50">
                  <span>
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-2.5 py-1 rounded bg-[#faf9f5] border border-[#ebe8e0] hover:bg-[#ebe8e0] disabled:opacity-30 text-[#1b1c1a]"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="px-2.5 py-1 rounded bg-[#faf9f5] border border-[#ebe8e0] hover:bg-[#ebe8e0] disabled:opacity-30 text-[#1b1c1a]"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected Review Drawer / Tray */}
        {showReviewList && (
          <div className="border-t border-[#ebe8e0] bg-[#faf9f5] p-4 max-h-48 overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#1b1c1a] uppercase tracking-wider">
                Selected Recipients ({selectedList.length})
              </span>
              <button
                onClick={clearAllSelected}
                className="text-[11px] text-red-600 hover:underline"
              >
                Clear all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedList.map((r) => (
                <div
                  key={r.phone}
                  className="bg-white border border-[#ebe8e0] shadow-sm rounded-lg px-2.5 py-1 text-xs text-[#1b1c1a] flex items-center gap-1.5"
                >
                  <span className="font-semibold">{r.name || 'Shopper'}</span>
                  <span className="font-mono text-[#1b1c1a]/50 text-[11px]">({r.phone})</span>
                  <button
                    onClick={() => toggleRecipient(r)}
                    className="text-[#1b1c1a]/40 hover:text-red-600 ml-1 font-bold"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#ebe8e0] flex items-center justify-between bg-[#faf9f5]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowReviewList((v) => !v)}
              className="text-xs text-[#795900] font-semibold flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 shadow-sm"
            >
              <span>{showReviewList ? '▲ Hide Selected' : '▼ Review Selected'}</span>
              <span className="bg-[#795900] text-white px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                {selectedList.length}
              </span>
            </button>
            {selectedList.length > 0 && (
              <span className="text-xs text-[#1b1c1a]/50">
                Ready to receive broadcast
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#1b1c1a]/60 hover:text-[#1b1c1a] bg-black/5 hover:bg-black/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(selectedList)}
              disabled={selectedList.length === 0}
              className="px-6 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#795900] to-[#c9a432] hover:opacity-95 disabled:opacity-40 transition-all shadow-md shadow-[#795900]/20"
            >
              Apply {selectedList.length} Recipients
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

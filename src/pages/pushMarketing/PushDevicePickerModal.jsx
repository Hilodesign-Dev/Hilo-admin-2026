import React, { useState, useEffect, useCallback } from 'react'
import { pushMarketingApi } from '../../lib/notificationsApi'
import { toast } from '../../lib/designTokens'
import Icon from '../../components/Icon'

export default function PushDevicePickerModal({
  selectedDevices = [], // Array of device tokens or Device items
  onConfirm,
  onClose,
}) {
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState('all') // 'all' | 'android' | 'ios'
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedState, setSelectedState] = useState('')
  const [page, setPage] = useState(1)
  const limit = 50

  const [items, setItems] = useState([])
  const [availableCities, setAvailableCities] = useState([])
  const [availableStates, setAvailableStates] = useState([])
  const [totalReachable, setTotalReachable] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectingAll, setSelectingAll] = useState(false)

  const getDeviceKey = (d) => {
    if (!d) return ''
    if (typeof d === 'string') return d
    return d.device_token || d.deviceToken || d.fcm_token || d.fcmToken || d.id || ''
  }

  // Map of token -> DeviceItem for fast toggling and preserving selected objects
  const [selectedMap, setSelectedMap] = useState(() => {
    const map = new Map()
    for (const d of selectedDevices) {
      const key = getDeviceKey(d)
      if (key) map.set(key, typeof d === 'string' ? { device_token: key } : d)
    }
    return map
  })

  // Fetch devices matching filters
  const fetchDevices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await pushMarketingApi.queryDevices({
        search: search.trim() || undefined,
        platform: platform !== 'all' ? platform : undefined,
        city: selectedCity || undefined,
        state: selectedState || undefined,
        page,
        limit,
        onlyActive: true,
      })
      setItems(res?.items || [])
      setTotalReachable(
        res?.counts?.totalReachable ?? res?.totalCount ?? res?.platformCounts?.all ?? 0,
      )
      if (res?.availableCities) setAvailableCities(res.availableCities)
      if (res?.availableStates) setAvailableStates(res.availableStates)
    } catch (err) {
      toast(false, err?.message || 'Failed to query reachable devices')
    } finally {
      setLoading(false)
    }
  }, [search, platform, selectedCity, selectedState, page])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  const toggleDevice = (item) => {
    const key = getDeviceKey(item)
    if (!key) return
    setSelectedMap((prev) => {
      const next = new Map(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.set(key, item)
      }
      return next
    })
  }

  // Select all devices currently shown on this page
  const selectCurrentPage = () => {
    setSelectedMap((prev) => {
      const next = new Map(prev)
      for (const it of items) {
        const key = getDeviceKey(it)
        if (key) next.set(key, it)
      }
      return next
    })
    toast(true, `Selected ${items.length} devices from current view`)
  }

  // Select ALL devices matching the filter criteria across the entire database
  const selectAllFromDatabase = async () => {
    setSelectingAll(true)
    try {
      const res = await pushMarketingApi.queryDevices({
        search: search.trim() || undefined,
        platform: platform !== 'all' ? platform : undefined,
        city: selectedCity || undefined,
        state: selectedState || undefined,
        page: 1,
        limit: 2000,
        onlyActive: true,
      })
      const all = res?.items || []
      setSelectedMap((prev) => {
        const next = new Map(prev)
        for (const it of all) {
          const key = getDeviceKey(it)
          if (key) next.set(key, it)
        }
        return next
      })
      toast(true, `Selected all ${all.length} matching devices from system`)
    } catch (err) {
      toast(false, err?.message || 'Failed to select all devices')
    } finally {
      setSelectingAll(false)
    }
  }

  const clearSelection = () => {
    setSelectedMap(new Map())
  }

  const handleApply = () => {
    const list = Array.from(selectedMap.values())
    onConfirm(list)
    onClose()
  }

  const totalPages = Math.max(1, Math.ceil(totalReachable / limit))

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in text-[#1b1c1a]">
      <div className="bg-white border border-[#ebe8e0] rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#ebe8e0] flex items-center justify-between bg-[#faf9f5]">
          <div>
            <h2 className="text-lg font-bold text-[#1b1c1a] flex items-center gap-2">
              <Icon name="device" cls="w-5 h-5 text-[#795900]" />
              <span>Select Target Devices</span>
            </h2>
            <p className="text-xs text-[#1b1c1a]/60 mt-0.5">
              Filter by platform, region, city, or individual customers to target push broadcasts.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-gray-600 flex items-center justify-center text-sm font-bold transition-all"
          >
            <Icon name="close" cls="w-4 h-4" />
          </button>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="p-4 border-b border-[#ebe8e0] bg-white space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search */}
            <div className="md:col-span-2 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Search by customer name, phone, email, device..."
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

            {/* State Filter */}
            <div>
              <select
                value={selectedState}
                onChange={(e) => {
                  setSelectedState(e.target.value)
                  setPage(1)
                }}
                className="w-full px-3 py-2 rounded-xl border border-[#ebe8e0] text-xs focus:outline-none focus:border-[#795900] bg-[#faf9f5]"
              >
                <option value="">All States / Regions</option>
                {availableStates.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {/* City Filter */}
            <div>
              <select
                value={selectedCity}
                onChange={(e) => {
                  setSelectedCity(e.target.value)
                  setPage(1)
                }}
                className="w-full px-3 py-2 rounded-xl border border-[#ebe8e0] text-xs focus:outline-none focus:border-[#795900] bg-[#faf9f5]"
              >
                <option value="">All Cities</option>
                {availableCities.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Platform chips & Selection actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {/* Platform pills */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[#1b1c1a]/50 uppercase tracking-wider mr-1">
                Platform:
              </span>
              {[
                { id: 'all', label: 'All Devices' },
                { id: 'android', label: 'Android', iconName: 'android' },
                { id: 'ios', label: 'iOS', iconName: 'apple' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPlatform(p.id)
                    setPage(1)
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    platform === p.id
                      ? 'bg-[#795900] text-white shadow-sm'
                      : 'bg-[#f5f4f0] text-[#1b1c1a]/70 hover:bg-[#ebe8e0]'
                  }`}
                >
                  {p.iconName && <Icon name={p.iconName} cls="w-3.5 h-3.5" />}
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            {/* Select/Deselect Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectCurrentPage}
                className="px-2.5 py-1 text-xs font-medium rounded-lg text-[#1b1c1a]/80 hover:bg-[#f5f4f0] border border-[#ebe8e0]"
              >
                Select Page ({items.length})
              </button>
              <button
                type="button"
                disabled={selectingAll}
                onClick={selectAllFromDatabase}
                className="px-3 py-1 text-xs font-bold rounded-lg bg-amber-50 text-[#795900] hover:bg-amber-100 border border-amber-200 transition-all flex items-center gap-1"
              >
                {selectingAll ? 'Selecting...' : `Select All Found (${totalReachable})`}
              </button>
              {selectedMap.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg text-red-600 hover:bg-red-50"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto min-h-[320px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#1b1c1a]/50 text-xs">
              <span className="animate-spin text-xl mb-2">↻</span>
              Loading active devices...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-[#1b1c1a]/60">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-[#795900] flex items-center justify-center mb-3 mx-auto">
                <Icon name="inbox" cls="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold">No active devices found</p>
              <p className="text-[11px] text-[#1b1c1a]/40 mt-1">
                Try widening your search keywords, clearing location filters, or switching platforms.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#ebe8e0] bg-[#faf9f5] text-[#1b1c1a]/60 text-[11px] font-bold uppercase tracking-wider sticky top-0 z-10">
                  <th className="py-2.5 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        items.length > 0 &&
                        items.every((it) => selectedMap.has(it.device_token))
                      }
                      onChange={(e) => {
                        if (e.target.checked) selectCurrentPage()
                        else {
                          setSelectedMap((prev) => {
                            const next = new Map(prev)
                            for (const it of items) {
                              const k = getDeviceKey(it)
                              if (k) next.delete(k)
                            }
                            return next
                          })
                        }
                      }}
                      className="rounded accent-[#795900]"
                    />
                  </th>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Device Model</th>
                  <th className="py-2.5 px-4">Platform</th>
                  <th className="py-2.5 px-4">Location</th>
                  <th className="py-2.5 px-4">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ebe8e0]/60">
                {items.map((item) => {
                  const key = getDeviceKey(item)
                  const isChecked = selectedMap.has(key)
                  const isIos = (item.platform || '').toLowerCase().includes('ios')
                  const displayName = item.customer_name || item.name || (item.user_id ? 'Shopper' : 'Guest Device')
                  const subIdentifier = item.phone || item.email || (item.user_id ? String(item.user_id).slice(0, 8) : (item.fcmTokenSnippet || 'Unlinked Device'))

                  return (
                    <tr
                      key={key || item.id}
                      onClick={() => toggleDevice(item)}
                      className={`hover:bg-amber-50/40 cursor-pointer transition-colors ${
                        isChecked ? 'bg-amber-50/70 font-medium' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleDevice(item)}
                          className="rounded accent-[#795900]"
                        />
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#543925]/10 text-[#543925] font-bold text-xs flex items-center justify-center flex-shrink-0">
                            {(displayName || 'U')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-[#1b1c1a] truncate">
                              {displayName}
                            </div>
                            <div className="text-[11px] text-[#1b1c1a]/50 truncate">
                              {subIdentifier}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-[#1b1c1a]/80 font-mono text-[11px]">
                        {item.device_model || item.deviceModel || 'Unknown Device'}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            isIos
                              ? 'bg-gray-100 text-gray-800 border-gray-300'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          }`}
                        >
                          <Icon name={isIos ? 'apple' : 'android'} cls="w-3 h-3" />
                          <span>{item.platform || 'Unknown'}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-[#1b1c1a]/70">
                        {item.city || item.state
                          ? `${item.city || ''}${item.city && item.state ? ', ' : ''}${item.state || ''}`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-[#1b1c1a]/50 text-[11px]">
                        {item.last_used_at || item.lastSeenAt
                          ? new Date(item.last_used_at || item.lastSeenAt).toLocaleDateString()
                          : 'Recent'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-[#ebe8e0] bg-[#faf9f5] flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Pagination info */}
          <div className="text-xs text-[#1b1c1a]/60 flex items-center gap-2">
            <span>
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>
            <span>•</span>
            <span>
              Showing {items.length} of {totalReachable} devices
            </span>
            <div className="inline-flex gap-1 ml-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 rounded bg-white border border-[#ebe8e0] text-xs font-semibold disabled:opacity-40"
              >
                ‹
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2 py-1 rounded bg-white border border-[#ebe8e0] text-xs font-semibold disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#ebe8e0] bg-white hover:bg-gray-50 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#795900] via-[#c9a432] to-[#d4a843] hover:opacity-95 text-white font-bold text-xs shadow-md shadow-[#795900]/20 flex items-center gap-2"
            >
              <span>Confirm Target Devices</span>
              <span className="bg-black/20 px-2 py-0.5 rounded-full text-[10px]">
                {selectedMap.size}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

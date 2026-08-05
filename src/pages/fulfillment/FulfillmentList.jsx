import React, { useState } from 'react'
import { C, MARKETPLACE_CHANNELS } from '../../lib/designTokens'
import { Input, Select, Btn, Badge } from './ui'
import { CHANNEL_GROUPS, SEARCH_TYPES, PAGE_SIZE, fulfillColor, fmtDate, fmtDateTime } from './constants'
import { getDelayStatus } from '../delayed/constants'
import { filterStylists, filterProductionManagers, resolveStaffName } from '../../lib/helpers'


const FulfillmentList = ({
  orders, lineItems, loading, activeChannel, teamMembers, vendors, page, totalCount,
  expandedId, onChangeChannel, onChangeSearchType, onChangeSearchQuery, onApplyFilters,
  onChangePage, onToggleExpand, onEdit, onFulfill, onTrial, onAlterationItem, openCustomer
}) => {
  const [searchType, setSearchType] = useState('order_number')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [filterDeliveryType, setFilterDeliveryType] = useState('')
  const [filterStylist, setFilterStylist] = useState('')
  const [filterProductExec, setFilterProductExec] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterFromDate, setFilterFromDate] = useState('')
  const [filterToDate, setFilterToDate] = useState('')
  const [filterEventDate, setFilterEventDate] = useState('')
  const [filterChannels, setFilterChannels] = useState([])
  const [overdueOnly, setOverdueOnly] = useState(false)

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const handleSearch = () => {
    onApplyFilters({
      searchType, searchQuery, filterVendor, filterDeliveryType, filterStylist,
      filterProductExec, filterType, filterFromDate, filterToDate, filterEventDate, filterChannels, overdueOnly
    })
  }

  const applyOverdue = (next) => {
    setOverdueOnly(next)
    onApplyFilters({
      searchType, searchQuery, filterVendor, filterDeliveryType, filterStylist,
      filterProductExec, filterType, filterFromDate, filterToDate, filterEventDate, filterChannels, overdueOnly: next
    })
  }

  const applyWith = (override = {}) => onApplyFilters({
    searchType, searchQuery, filterVendor, filterDeliveryType, filterStylist,
    filterProductExec, filterType, filterFromDate, filterToDate, filterEventDate, filterChannels, overdueOnly, ...override
  })

  const daysOverdue = (dt) => { if (!dt) return null; const t = new Date(); t.setHours(0,0,0,0); const d = new Date(dt); d.setHours(0,0,0,0); return Math.ceil((t - d) / 86400000) }
  const DelayBadge = ({ dt }) => { const od = daysOverdue(dt); if (od == null) return null; if (od > 0) return <div className="mt-0.5"><Badge color="#dc2626" bg="rgba(220,38,38,0.08)">{od}d overdue</Badge></div>; if (od === 0) return <div className="mt-0.5"><Badge color="#d97706" bg="rgba(217,119,6,0.08)">Due today</Badge></div>; return null }

  const toggleChannelMulti = (ch) => {
    setFilterChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch])
  }

  const getMarketplaceDisplay = (order) => {
    if (activeChannel === 'marketplaces' || activeChannel === 'to_be_fulfilled') {
      return order.channel && MARKETPLACE_CHANNELS.includes(order.channel) ? order.channel : '—'
    }
    return null
  }

  const actionMenu = (order) => (
    <div className="flex items-center justify-end gap-1.5">
      <Btn small onClick={() => onFulfill(order)}>Fulfill</Btn>
      <button onClick={() => onEdit(order)} title="Edit order" className="p-1.5 rounded-lg hover:bg-gray-100 transition" style={{ color: C.textMuted }}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
      </button>
      <button onClick={() => onTrial(order)} title="Trial / Alteration" className="p-1.5 rounded-lg hover:bg-gray-100 transition" style={{ color: C.textMuted }}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
      </button>
    </div>
  )

  return (
    <>
      {/* Channel group buttons */}
      <div className="mb-4 -mx-4 sm:mx-0">
        <div className="flex gap-1 overflow-x-auto px-4 sm:px-0 pb-2 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {CHANNEL_GROUPS.map(grp => {
            const active = activeChannel === grp.key
            return (
              <button key={grp.key} onClick={() => onChangeChannel(grp.key)}
                className="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex-shrink-0"
                style={{
                  background: active ? C.gold : 'transparent',
                  color: active ? '#fff' : C.textMuted,
                  border: active ? 'none' : `1px solid ${C.borderLight}`,
                }}>
                {grp.label}
              </button>
            )
          })}
          <button onClick={() => applyOverdue(!overdueOnly)}
            className="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex-shrink-0"
            style={{ background: overdueOnly ? '#dc2626' : 'transparent', color: overdueOnly ? '#fff' : '#dc2626', border: overdueOnly ? 'none' : '1px solid rgba(220,38,38,0.3)' }}>
            Overdue
          </button>
        </div>
      </div>

      {/* Filter row */}
      <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Select value={searchType} onChange={e => setSearchType(e.target.value)} style={{ fontSize: '0.85rem' }}>
          {SEARCH_TYPES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
        </Select>
        <div className="col-span-2 sm:col-span-1 lg:col-span-2 relative">
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search…" style={{ paddingRight: 36, fontSize: '0.85rem' }} />
          <svg className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.textLight }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        <Select value={filterVendor} onChange={e => { setFilterVendor(e.target.value); applyWith({ filterVendor: e.target.value }) }} style={{ fontSize: '0.85rem' }}>
          <option value="">Vendor</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <Select value={filterDeliveryType} onChange={e => { setFilterDeliveryType(e.target.value); applyWith({ filterDeliveryType: e.target.value }) }} style={{ fontSize: '0.85rem' }}>
          <option value="">Delivery Type</option>
          <option value="Store pickup">Store pickup</option>
          <option value="Domestic courier">Domestic courier</option>
          <option value="International courier">International courier</option>
          <option value="Manual delivery">Manual delivery</option>
        </Select>
        <Select value={filterStylist} onChange={e => { setFilterStylist(e.target.value); applyWith({ filterStylist: e.target.value }) }} style={{ fontSize: '0.85rem' }}>
          <option value="">Stylist</option>
          {filterStylists(teamMembers).map(tm => <option key={tm.id} value={String(tm.id)}>{tm.name}</option>)}
        </Select>
        <Select value={filterProductExec} onChange={e => { setFilterProductExec(e.target.value); applyWith({ filterProductExec: e.target.value }) }} style={{ fontSize: '0.85rem' }}>
          <option value="">Exec</option>
          {filterProductionManagers(teamMembers).map(tm => <option key={tm.id} value={String(tm.id)}>{tm.name}</option>)}
        </Select>
        <Select value={filterType} onChange={e => { setFilterType(e.target.value); applyWith({ filterType: e.target.value }) }} style={{ fontSize: '0.85rem' }}>
          <option value="">Type</option>
          <option value="General">General</option>
          <option value="Custom">Custom</option>
        </Select>
        <Input type="date" value={filterEventDate} onChange={e => { setFilterEventDate(e.target.value); applyWith({ filterEventDate: e.target.value }) }} placeholder="Event Date" style={{ fontSize: '0.85rem' }} />
        <Input type="date" value={filterFromDate} onChange={e => { setFilterFromDate(e.target.value); applyWith({ filterFromDate: e.target.value }) }} placeholder="From" style={{ fontSize: '0.85rem' }} />
        <Input type="date" value={filterToDate} onChange={e => { setFilterToDate(e.target.value); applyWith({ filterToDate: e.target.value }) }} placeholder="To" style={{ fontSize: '0.85rem' }} />
        <Btn small onClick={handleSearch}>Search</Btn>
      </div>

      {/* Main table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(27,28,26,0.04)' }}>
        {/* Table header */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider items-center" style={{ background: C.bg, color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
          <div className="col-span-1"></div>
          <div className="col-span-1">Order</div>
          <div className="col-span-2">Customer</div>
          {(activeChannel === 'marketplaces' || activeChannel === 'to_be_fulfilled') && <div className="col-span-1">Marketplace</div>}
          <div className="col-span-2">Address</div>
          <div className="col-span-1">Delivery</div>
          <div className="col-span-1">Fulfillment</div>
          <div className="col-span-1">Notes</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${C.gold} transparent ${C.gold} ${C.gold}` }} />
            <div className="text-sm mt-3" style={{ color: C.textMuted }}>Loading orders…</div>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-12 h-12 mx-auto mb-3" style={{ color: C.textLight }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
            <div className="text-sm font-medium mb-1" style={{ color: C.textMuted }}>No orders found</div>
            <div className="text-xs" style={{ color: C.textLight }}>Try adjusting your filters</div>
          </div>
        ) : (
          orders.map(order => {
            const lis = lineItems[order.id] || []
            const fc = fulfillColor(order.fulfillment_status)
            const mktplace = getMarketplaceDisplay(order)
            return (
              <div key={order.id} style={{ borderTop: `1px solid ${C.borderLight}` }}>
                {/* Main row */}
                <div className="hidden lg:grid lg:grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => onToggleExpand(order.id)}>
                  <div className="col-span-1">
                    <svg className="w-4 h-4 transition-transform flex-shrink-0" style={{ color: C.textLight, transform: expandedId === order.id ? 'rotate(180deg)' : 'rotate(0deg)' }} fill="none" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>
                  <div className="col-span-1">
                    <div className="text-sm font-bold font-mono" style={{ color: C.text }}>{order.order_number}</div>
                    {lis[0]?.stylist && <Badge color={C.purple} bg={C.purpleBg}>{resolveStaffName(teamMembers, lis[0].stylist)}</Badge>}
                  </div>
                  <div className="col-span-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => { if (openCustomer && order.customer_id) openCustomer(order.customer_id) }}
                      disabled={!order.customer_id || !openCustomer}
                      className="text-sm font-medium text-left hover:underline disabled:no-underline"
                      style={{ color: (order.customer_id && openCustomer) ? C.gold : C.text }}
                      title="Open customer">
                      {order._cust?.name || order.customer_name || '—'}
                    </button>
                    <div className="text-xs font-mono" style={{ color: C.textMuted }}>
                      {order._cust?.phone || order.notes?.match(/Phone:\s*(\S+)/)?.[1] || '—'}
                    </div>
                  </div>
                  {(activeChannel === 'marketplaces' || activeChannel === 'to_be_fulfilled') && (
                    <div className="col-span-1 text-sm" style={{ color: C.text }}>{mktplace}</div>
                  )}
                  <div className="col-span-2">
                    <div className="text-xs" style={{ color: C.textMuted }}>{order.shipping_address_line1 || '—'}</div>
                    {lis[0]?.product_executive && <Badge color={C.blue} bg={C.blueBg}>{resolveStaffName(teamMembers, lis[0].product_executive)}</Badge>}
                  </div>
                  <div className="col-span-1 text-xs" style={{ color: C.textMuted }}>{fmtDate(order.est_shipping_date)}<DelayBadge dt={order.est_shipping_date} /></div>
                  <div className="col-span-1">
                    {lis[0]?.fulfillment_type && <Badge>{lis[0].fulfillment_type}</Badge>}
                    {lis[0]?.shipper && <Badge color={C.amber} bg={C.amberBg}>{lis[0].shipper}</Badge>}
                  </div>
                  <div className="col-span-1 text-xs truncate" style={{ color: C.textMuted }}>{order.notes || '—'}</div>
                  <div className="col-span-1">
                    <Badge color={fc.text} bg={fc.bg}>{order.fulfillment_status || 'unfulfilled'}</Badge>
                  </div>
                  <div className="col-span-1 text-right" onClick={e => e.stopPropagation()}>
                    {actionMenu(order)}
                  </div>
                </div>

                {/* Mobile row */}
                <div className="lg:hidden px-4 py-3 hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => onToggleExpand(order.id)}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 transition-transform flex-shrink-0" style={{ color: C.textLight, transform: expandedId === order.id ? 'rotate(180deg)' : 'rotate(0deg)' }} fill="none" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span className="text-sm font-bold font-mono" style={{ color: C.text }}>{order.order_number}</span>
                      <Badge color={fc.text} bg={fc.bg}>{order.fulfillment_status || 'unfulfilled'}</Badge>
                    </div>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      {actionMenu(order)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs" style={{ color: C.textMuted }}>
                    <span className="font-medium" style={{ color: C.text }}>{order.customer_name || '—'}</span>
                    <span>{fmtDate(order.created_at)}</span>
                    {lis[0]?.stylist && <Badge color={C.purple} bg={C.purpleBg}>{resolveStaffName(teamMembers, lis[0].stylist)}</Badge>}
                  </div>
                </div>

                {/* Expanded line items */}
                {expandedId === order.id && lis.length > 0 && (
                  <div style={{ background: 'rgba(212,168,67,0.06)', borderTop: `1px solid ${C.amber}` }}>
                    <div className="px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: C.amber }}>Line Items</div>
                      {lis.map((li, idx) => (
                        <div key={li.id} className="text-xs py-1.5" style={{ borderBottom: idx < lis.length - 1 ? `1px solid ${C.borderLight}` : 'none', color: C.text }}>
                          <div className="flex justify-between mb-1">
                            <span className="font-medium">{li.title || '—'}</span>
                            <span style={{ color: C.textMuted }}>Qty: {li.quantity}</span>
                          </div>
                          {li.alteration_status && <Badge color={C.red} bg={C.redBg}>{li.alteration_status}</Badge>}
                          {li.production_stage && <Badge>{li.production_stage}</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <div className="text-xs" style={{ color: C.textMuted }}>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onChangePage(Math.max(0, page - 1))} disabled={page === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-30" style={{ border: `1px solid ${C.border}`, color: C.text }}>
              Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pg
              if (totalPages <= 7) pg = i
              else if (page < 3) pg = i
              else if (page > totalPages - 4) pg = totalPages - 7 + i
              else pg = page - 3 + i
              return (
                <button key={pg} onClick={() => onChangePage(pg)}
                  className="w-8 h-8 rounded-lg text-xs font-bold transition-colors"
                  style={{ background: page === pg ? C.gold : 'transparent', color: page === pg ? '#fff' : C.textMuted, border: page === pg ? 'none' : `1px solid ${C.borderLight}` }}>
                  {pg + 1}
                </button>
              )
            })}
            <button onClick={() => onChangePage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-30" style={{ border: `1px solid ${C.border}`, color: C.text }}>
              Next
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default FulfillmentList

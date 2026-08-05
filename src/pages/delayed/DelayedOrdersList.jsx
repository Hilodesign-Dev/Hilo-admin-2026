import React, { useState, useMemo } from 'react'
import { C, DELIVERY_TYPES, CHANNEL_TYPES, fmtDate, toast } from '../../lib/designTokens'
import { Input, Select, Btn, Badge } from '../orders/ui'
import { SEARCH_TYPES, URGENCY_LEVELS, ORDER_TYPES, PAGE_SIZE, getDelayStatus, getProductionDays } from './constants'
import { filterStylists, filterProductionManagers, resolveStaffName } from '../../lib/helpers'


const DelayedOrdersList = ({
  orders, lineItems, loading, searchType, searchQuery, page, totalCount, expandedId,
  onChangeSearchType, onChangeSearchQuery, onChangePage, onToggleExpand,
  onEdit, onFulfillOrder, onShipItem, teamMembers, vendors, openCustomer
}) => {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const [filters, setFilters] = useState({
    vendor: '',
    deliveryType: '',
    urgency: '',
    channels: [],
    shippingDateFrom: '',
    shippingDateTo: '',
    orderType: '',
    stylist: '',
    productExecutive: '',
  })

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const handleChannelToggle = (channel) => {
    setFilters(prev => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter(c => c !== channel)
        : [...prev.channels, channel]
    }))
  }

  const handleSearch = () => {
    onChangePage(0)
    onChangeSearchQuery(searchQuery)
  }

  const visible = useMemo(() => (orders || []).filter(o => {
    if (filters.channels.length && !filters.channels.includes(o.channel)) return false
    if (filters.shippingDateFrom && (!o.est_shipping_date || o.est_shipping_date.slice(0, 10) < filters.shippingDateFrom)) return false
    if (filters.shippingDateTo && (!o.est_shipping_date || o.est_shipping_date.slice(0, 10) > filters.shippingDateTo)) return false
    const lis = lineItems[o.id] || []
    const some = (fn) => lis.some(fn)
    if (filters.vendor && !some(li => li.vendor_assigned === filters.vendor)) return false
    if (filters.deliveryType && !some(li => li.fulfillment_type === filters.deliveryType || li.delivery_type === filters.deliveryType)) return false
    if (filters.urgency && !some(li => li.urgency === filters.urgency)) return false
    if (filters.orderType && !some(li => li.type === filters.orderType)) return false
    if (filters.stylist && !some(li => String(li.stylist) === String(filters.stylist))) return false
    if (filters.productExecutive && !some(li => String(li.product_executive) === String(filters.productExecutive))) return false
    return true
  }), [orders, lineItems, filters])

  return (
    <div>
      {/* Filter Row */}
      <div className="rounded-2xl p-4 mb-4" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={searchType} onChange={e => onChangeSearchType(e.target.value)} style={{ width: 180, flexShrink: 0 }}>
              {SEARCH_TYPES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
            </Select>
            <div className="relative flex-1">
              <Input value={searchQuery} onChange={e => onChangeSearchQuery(e.target.value)} placeholder="Search…" style={{ paddingRight: 36 }} />
              <svg className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.textLight }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <Btn primary onClick={handleSearch}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Search
            </Btn>
          </div>

          {/* Filter Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            <Select value={filters.vendor} onChange={e => handleFilterChange('vendor', e.target.value)}>
              <option value="">Vendor</option>
              {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
            </Select>

            <Select value={filters.deliveryType} onChange={e => handleFilterChange('deliveryType', e.target.value)}>
              <option value="">Delivery Type</option>
              {DELIVERY_TYPES.map(dt => <option key={dt} value={dt}>{dt}</option>)}
            </Select>

            <Select value={filters.urgency} onChange={e => handleFilterChange('urgency', e.target.value)}>
              <option value="">Urgency</option>
              {URGENCY_LEVELS.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>

            <Select value={filters.orderType} onChange={e => handleFilterChange('orderType', e.target.value)}>
              <option value="">Order Type</option>
              {ORDER_TYPES.map(ot => <option key={ot} value={ot}>{ot}</option>)}
            </Select>

            <Select value={filters.stylist} onChange={e => handleFilterChange('stylist', e.target.value)}>
              <option value="">Stylist</option>
              {filterStylists(teamMembers).map(tm => <option key={tm.id} value={String(tm.id)}>{tm.name}</option>)}
            </Select>

            <Select value={filters.productExecutive} onChange={e => handleFilterChange('productExecutive', e.target.value)}>
              <option value="">Product Executive</option>
              {filterProductionManagers(teamMembers).map(tm => <option key={tm.id} value={String(tm.id)}>{tm.name}</option>)}
            </Select>

            <Input type="date" value={filters.shippingDateFrom} onChange={e => handleFilterChange('shippingDateFrom', e.target.value)} placeholder="From" />
            <Input type="date" value={filters.shippingDateTo} onChange={e => handleFilterChange('shippingDateTo', e.target.value)} placeholder="To" />
          </div>

          {/* Channels Multi-Select */}
          <div>
            <label className="text-xs font-bold mb-1.5 block" style={{ color: '#4e4636' }}>CHANNELS</label>
            <div className="flex flex-wrap gap-2">
              {CHANNEL_TYPES.map(channel => (
                <button
                  key={channel}
                  onClick={() => handleChannelToggle(channel)}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold transition-colors"
                  style={{
                    background: filters.channels.includes(channel) ? C.gold : C.bg,
                    color: filters.channels.includes(channel) ? '#fff' : C.text,
                    border: `1px solid ${filters.channels.includes(channel) ? C.gold : C.border}`
                  }}>
                  {channel}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(27,28,26,0.04)' }}>
        {/* Table header */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider items-center" style={{ background: C.bg, color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
          <div className="col-span-1"></div>
          <div className="col-span-1">Order ID</div>
          <div className="col-span-1">Customer</div>
          <div className="col-span-1">Date</div>
          <div className="col-span-1">Channel</div>
          <div className="col-span-1">Delivery</div>
          <div className="col-span-2">Phone</div>
          <div className="col-span-1">Prod Days</div>
          <div className="col-span-1">Delay</div>
          <div className="col-span-2">Actions</div>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${C.gold} transparent ${C.gold} ${C.gold}` }} />
            <div className="text-sm mt-3" style={{ color: C.textMuted }}>Loading orders…</div>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-12 h-12 mx-auto mb-3" style={{ color: C.textLight }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div className="text-sm font-medium mb-1" style={{ color: C.textMuted }}>No delayed orders found</div>
            <div className="text-xs" style={{ color: C.textLight }}>All orders are on track!</div>
          </div>
        ) : (
          visible.map(order => {
            const status = getDelayStatus(order.est_shipping_date)
            const prodDays = getProductionDays(order.created_at)
            const items = lineItems[order.id] || []

            return (
              <div key={order.id}>
                {/* Main row */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 px-4 py-3 items-center border-b" style={{ borderColor: C.border, background: expandedId === order.id ? C.bg : 'transparent' }}>
                  {/* Expand chevron */}
                  <button
                    onClick={() => onToggleExpand(order.id)}
                    className="col-span-1 flex items-center justify-center h-6 w-6 rounded hover:bg-gray-100"
                    style={{ color: C.textMuted }}>
                    <svg className={`w-4 h-4 transition-transform ${expandedId === order.id ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>

                  {/* Order ID + Stylist */}
                  <div className="col-span-1 lg:col-span-1">
                    <div className="font-mono text-sm font-bold" style={{ color: C.text }}>{order.order_number}</div>
                    {items[0]?.stylist && <Badge color={C.blue} bg={C.blueBg}>{resolveStaffName(teamMembers, items[0].stylist)}</Badge>}
                  </div>

                  {/* Customer (clickable → Customers tab) */}
                  <div className="col-span-1">
                    <button onClick={() => { if (openCustomer && order.customer_id) openCustomer(order.customer_id) }}
                      disabled={!order.customer_id || !openCustomer}
                      className="text-sm font-medium text-left hover:underline disabled:no-underline"
                      style={{ color: (order.customer_id && openCustomer) ? C.gold : C.text }} title="Open customer">
                      {order._cust?.name || order.customer_name || '—'}
                    </button>
                  </div>

                  {/* Date */}
                  <div className="col-span-1 text-sm" style={{ color: C.text }}>{fmtDate(order.created_at)}</div>

                  {/* Channel */}
                  <div className="col-span-1 text-xs" style={{ color: C.textMuted }}>{order.channel || '—'}</div>

                  {/* Delivery Date */}
                  <div className="col-span-1 text-sm font-semibold" style={{ color: C.text }}>{fmtDate(order.est_shipping_date)}</div>

                  {/* Phone */}
                  <div className="col-span-2 text-sm font-mono" style={{ color: C.textMuted }}>
                    {order._cust?.phone || order.phone || '—'}
                  </div>

                  {/* Production Days */}
                  <div className="col-span-1 text-sm" style={{ color: C.text }}>{prodDays}</div>

                  {/* Delay Status Badge */}
                  <div className="col-span-1">
                    <Badge color={status.color} bg={status.bg}>{status.label}</Badge>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex items-center gap-1">
                    <Btn small onClick={() => onFulfillOrder(order)}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Fulfill
                    </Btn>
                    <button onClick={() => onEdit(order)} className="p-1.5 rounded-lg hover:bg-gray-100 transition" style={{ color: C.textMuted }}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  </div>
                </div>

                {/* Expanded line items */}
                {expandedId === order.id && items.length > 0 && (
                  <div className="px-4 py-3" style={{ background: 'rgba(201, 164, 50, 0.06)', borderBottom: `1px solid ${C.border}` }}>
                    <div className="text-xs font-bold mb-3 px-3 py-2 rounded-lg" style={{ background: C.gold, color: '#fff' }}>Line Items</div>
                    <div className="space-y-2">
                      {items.map((item, idx) => {
                        const itemStatus = getDelayStatus(order.est_shipping_date)
                        return (
                          <div key={item.id || idx} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-10 gap-2 p-2 rounded-lg" style={{ background: C.cardBg, border: `1px solid ${C.borderLight}` }}>
                            {/* Product Name */}
                            <div className="lg:col-span-2 text-sm font-medium" style={{ color: C.text }}>{item.title || '—'}</div>

                            {/* SKU */}
                            <div className="text-sm" style={{ color: C.textMuted }}>{item.sku || '—'}</div>

                            {/* Size */}
                            <div className="text-sm" style={{ color: C.textMuted }}>{item.size || '—'}</div>

                            {/* Qty */}
                            <div className="text-sm font-medium" style={{ color: C.text }}>x{item.quantity || 1}</div>

                            {/* Stage */}
                            <div className="text-xs">
                              <Badge color={C.blue} bg={C.blueBg}>{item.production_stage || 'pending'}</Badge>
                            </div>

                            {/* Stylist */}
                            <div className="text-xs" style={{ color: C.textMuted }}>{item.stylist || '—'}</div>

                            {/* Product Executive */}
                            <div className="text-xs" style={{ color: C.textMuted }}>{item.product_executive || '—'}</div>

                            {/* Delay Status */}
                            <div className="text-xs">
                              <Badge color={itemStatus.color} bg={itemStatus.bg}>{itemStatus.label}</Badge>
                            </div>

                            {/* Ship button */}
                            {item.production_stage !== 'shipped' && (
                              <Btn small danger onClick={() => onShipItem(item, order)}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Ship
                              </Btn>
                            )}
                          </div>
                        )
                      })}
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
    </div>
  )
}

export default DelayedOrdersList

import React from 'react'
import { C } from '../../lib/designTokens'
import { Input, Select, Btn } from './ui'
import { ORDER_STATUS_TABS, SEARCH_TYPES, PAGE_SIZE } from './constants'
import OrderRow from './OrderRow'

const OrdersList = ({
  orders, lineItems, loading, activeTab, searchType, searchQuery, page, totalCount, expandedId, teamMembers,
  dateFrom, dateTo, channelFilter, channelCounts = { all: 0 }, onChangeDateFrom, onChangeDateTo, onChangeChannel, onClearFilters,
  marketplaceFilter = 'all', marketplaceOptions = [], onChangeMarketplace,
  onChangeTab, onChangeSearchType, onChangeSearchQuery, onChangePage, onToggleExpand,
  onApprove, onCancel, onEdit, onFulfill, onTrial, onAlterationItem, onMarkDelivered, onExchangeReturn, onConfirm, onCancelOrder, onShareReceipt
}) => {
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const CHANNEL_PILLS = [
    { key: 'all',            label: 'All' },
    { key: 'In-store',       label: 'In-Store' },
    { key: 'Online',         label: 'Online' },
    { key: 'Online Assist',  label: 'Online Assist' },
    { key: 'Marketplace',    label: 'Marketplace' },
  ]

  return (
    <>
      {/* Channel pills — primary segmentation */}
      <div className="mb-4 -mx-4 sm:mx-0">
        <div className="flex gap-2 overflow-x-auto px-4 sm:px-0 pb-2 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {CHANNEL_PILLS.map(p => {
            const active = (channelFilter || 'all') === p.key
            const n = channelCounts?.[p.key] ?? 0
            return (
              <button key={p.key} onClick={() => onChangeChannel(p.key)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all flex-shrink-0"
                style={{
                  background: active ? C.gold : 'transparent',
                  color: active ? '#fff' : C.text,
                  border: active ? 'none' : `1px solid ${C.border}`,
                }}>
                {p.label}
                <span className="font-mono px-1.5 py-0.5 rounded-full text-[10px]"
                  style={{
                    background: active ? 'rgba(255,255,255,0.25)' : C.bg,
                    color: active ? '#fff' : C.textMuted,
                  }}>{n.toLocaleString('en-IN')}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Marketplace sub-filter — only when Marketplace channel is active */}
      {channelFilter === 'Marketplace' && marketplaceOptions.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs font-bold" style={{ color: C.textMuted }}>Marketplace:</span>
          <Select value={marketplaceFilter} onChange={e => onChangeMarketplace && onChangeMarketplace(e.target.value)} style={{ width: 200 }}>
            <option value="all">All marketplaces</option>
            {marketplaceOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Select value={searchType} onChange={e => { onChangeSearchType(e.target.value); if (searchQuery) onChangeSearchQuery(searchQuery) }} style={{ width: 180, flexShrink: 0 }}>
          {SEARCH_TYPES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
        </Select>
        <div className="relative flex-1">
          <Input value={searchQuery} onChange={e => onChangeSearchQuery(e.target.value)} placeholder="Search orders…" style={{ paddingRight: 36 }} />
          <svg className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" style={{ color: C.textLight }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>

      {/* Filters: date range + channel */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.textMuted }}>From</span>
        <input type="date" value={dateFrom || ''} onChange={e => onChangeDateFrom(e.target.value)}
          className="rounded-lg px-2.5 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.text, background: '#fff' }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.textMuted }}>To</span>
        <input type="date" value={dateTo || ''} onChange={e => onChangeDateTo(e.target.value)}
          className="rounded-lg px-2.5 py-2 text-sm" style={{ border: `1px solid ${C.border}`, color: C.text, background: '#fff' }} />
        {(dateFrom || dateTo || (channelFilter && channelFilter !== 'all')) && (
          <button onClick={onClearFilters}
            className="px-3 py-2 rounded-lg text-xs font-bold" style={{ border: `1px solid ${C.border}`, color: C.red || '#dc2626', background: '#fff' }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Status Tabs */}
      <div className="mb-4 -mx-4 sm:mx-0">
        <div className="flex gap-1 overflow-x-auto px-4 sm:px-0 pb-2 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {ORDER_STATUS_TABS.map(tab => {
            const active = activeTab === tab.key
            return (
              <button key={tab.key} onClick={() => onChangeTab(tab.key)}
                className="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex-shrink-0"
                style={{
                  background: active ? C.gold : 'transparent',
                  color: active ? '#fff' : C.textMuted,
                  border: active ? 'none' : `1px solid ${C.borderLight}`,
                }}>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(27,28,26,0.04)' }}>
        {/* Table header */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider items-center" style={{ background: C.bg, color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
          <div className="col-span-2">Order</div>
          <div className="col-span-2">Customer</div>
          <div className="col-span-2">Phone</div>
          <div className="col-span-1">Status · Channel</div>
          <div className="col-span-1 text-right">Amount</div>
          <div className="col-span-1">Payment</div>
          <div className="col-span-1">Fulfillment</div>
          <div className="col-span-1">Delivery</div>
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
            <div className="text-xs" style={{ color: C.textLight }}>{searchQuery ? 'Try a different search' : 'Add a new order or sync from Shopify'}</div>
          </div>
        ) : (
          orders.map(order => (
            <OrderRow
              key={order.id}
              order={order}
              lineItems={lineItems[order.id] || []}
              activeTab={activeTab}
              onApprove={onApprove}
              onCancel={onCancel}
              onEdit={onEdit}
              onFulfill={onFulfill}
              onTrial={onTrial}
              onAlterationItem={onAlterationItem}
              onMarkDelivered={onMarkDelivered}
              onExchangeReturn={onExchangeReturn}
            onConfirm={onConfirm}
            onCancelOrder={onCancelOrder}
            onShareReceipt={onShareReceipt}
              onToggleExpand={onToggleExpand}
              isExpanded={expandedId === order.id}
              teamMembers={teamMembers}
            />
          ))
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

export default OrdersList

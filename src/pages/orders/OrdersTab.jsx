import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supa, isMissingTableError } from '../../lib/supabase'
import { C, toast, PRODUCTION_STAGES } from '../../lib/designTokens'
import { markOrderDelivered } from '../../lib/stateMachine'
import { fmt, n } from '../../lib/helpers'
import { _logChange, logAndToast } from '../../lib/logger'
import { useOrders } from '../../context/OrdersContext'
import { Btn } from './ui'
import { PAGE_SIZE } from './constants'
import OrdersList from './OrdersList'
import AddOrderModal from './AddOrderModal'
import EditOrderModal from '../pos/EditOrderModal'  // P2: tabbed editor with delivery + fitting
import FulfillOrderModal from './FulfillOrderModal'
import ConfirmOrderModal from '../pos/ConfirmOrderModal'
import CancelOrderModal from '../pos/CancelOrderModal'
import ShareReceiptModal from '../pos/ShareReceiptModal'
import TrialAlterationModal from './TrialAlterationModal'
import AlterationDetailModal from './AlterationDetailModal'
import ExchangeReturnModal from './ExchangeReturnModal'

const OrdersTab = ({ user, products = [], stitchingMaster = [] }) => {
  const ctx = useOrders()

  // ── Local UI state ─────────────────────────────────────────
  const [orders, setOrders] = useState([])

  // Eager-load line items for every visible order so the row badges
  // (stylist, product exec) and item counts render on first paint —
  // not only after the user expands or edits the row. Watches the
  // local `orders` state (the page's source of truth), not ctx.orders.
  React.useEffect(() => {
    const ids = (orders || []).map(o => o.id).filter(Boolean)
    ids.forEach(id => {
      const cached = ctx.getLineItems(id)
      if (!cached || cached.length === 0) { ctx.loadLineItems(id) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.map(o => o.id).join(',')])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  const [activeTab, setActiveTab] = useState('all')
  const [searchType, setSearchType] = useState('order_number')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => { supa.from('marketplaces').select('name').eq('is_active', true).order('name').then(({ data }) => setMarketplaceOptions((data || []).map(m => m.name))) }, [])

  // Filters (date range + channel)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [channelFilter, setChannelFilter] = useState('all')
  const [marketplaceFilter, setMarketplaceFilter] = useState('all')
  const [marketplaceOptions, setMarketplaceOptions] = useState([])
  const [channelCounts, setChannelCounts] = useState({ all: 0, 'In-store': 0, 'Online': 0, 'Online Assist': 0, 'Marketplace': 0 })

  // Modals
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [editOrder, setEditOrder] = useState(null)
  const [fulfillOrder, setFulfillOrder] = useState(null)
  const [confirmingOrder, setConfirmingOrder] = useState(null)
  const [cancellingOrder, setCancellingOrder] = useState(null)
  const [sharingOrder, setSharingOrder] = useState(null)  // { order, customer }
  const [trialOrder, setTrialOrder] = useState(null)
  const [alterationItem, setAlterationItem] = useState(null)
  const [exchangeReturnOrder, setExchangeReturnOrder] = useState(null)

  const searchTimer = useRef(null)

  // ── Fetch orders via context ────────────────────────────────
  const fetchOrders = useCallback(async (tab, query, queryType, pg) => {
    setLoading(true)
    // Shared filter application. NOTE: the "all" tab now means *every* status
    // (including fulfilled / delivered / cancelled) — no exclusion. Specific
    // statuses are reached via their own tabs. Date range + channel apply to
    // every tab and to search.
    const applyBase = (q) => {
      if (tab && tab !== 'all') q = q.eq('order_status', tab)
      if (dateFrom) q = q.gte('created_at', dateFrom)
      if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59.999')
      if (channelFilter && channelFilter !== 'all') q = q.eq('channel', channelFilter)
      if (channelFilter === 'Marketplace' && marketplaceFilter && marketplaceFilter !== 'all') q = q.eq('marketplace_name', marketplaceFilter)
      return q
    }
    try {
      const { data, count } = await ctx.fetchOrders((s) => {
        const q = applyBase(s.from('shopify_orders').select('*', { count: 'exact' }))
        return q.order('created_at', { ascending: false }).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)
      })

      if (query && query.length >= 2) {
        if (queryType === 'product') {
          const { data: matchedLIs } = await supa.from('order_line_items').select('order_id').ilike('title', `%${query}%`).limit(100)
          const orderIds = new Set((matchedLIs || []).map(li => li.order_id))
          if (orderIds.size === 0) { setOrders([]); setTotalCount(0); setLoading(false); return }
          const { data: d2, count: c2 } = await ctx.fetchOrders((s) => {
            const q2 = applyBase(s.from('shopify_orders').select('*', { count: 'exact' })).in('id', [...orderIds])
            return q2.order('created_at', { ascending: false }).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)
          })
          setOrders(d2); setTotalCount(c2); setLoading(false); return
        }
        if (queryType === 'phone') {
          // Orders don't store the buyer's phone — it lives on customers/buyers.
          // Resolve phone -> customer ids -> linked order ids (+ delivery_phone fallback).
          const digits = query.replace(/\D/g, '')
          const [custRes, buyerRes] = await Promise.all([
            supa.from('customers').select('id, buyer_id').ilike('phone', `%${digits}%`).limit(500),
            supa.from('buyers').select('id').ilike('phone', `%${digits}%`).limit(500),
          ])
          const custIds = new Set((custRes.data || []).map(c => c.id))
          const buyerIds = (buyerRes.data || []).map(b => b.id)
          if (buyerIds.length) {
            const { data: bc } = await supa.from('customers').select('id').in('buyer_id', buyerIds).limit(1000)
            ;(bc || []).forEach(c => custIds.add(c.id))
          }
          const orderIds = new Set()
          if (custIds.size) {
            const ids = [...custIds]
            const { data: o1 } = await supa.from('shopify_orders').select('id')
              .or(`buyer_customer_id.in.(${ids.join(',')}),customer_id.in.(${ids.join(',')})`).limit(2000)
            ;(o1 || []).forEach(o => orderIds.add(o.id))
          }
          const { data: o2 } = await supa.from('shopify_orders').select('id').ilike('delivery_phone', `%${digits}%`).limit(2000)
          ;(o2 || []).forEach(o => orderIds.add(o.id))
          if (orderIds.size === 0) { setOrders([]); setTotalCount(0); setLoading(false); return }
          const { data: dP, count: cP } = await ctx.fetchOrders((s) => {
            const q2 = applyBase(s.from('shopify_orders').select('*', { count: 'exact' })).in('id', [...orderIds])
            return q2.order('created_at', { ascending: false }).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)
          })
          setOrders(dP); setTotalCount(cP); setLoading(false); return
        }
        const { data: d2, count: c2 } = await ctx.fetchOrders((s) => {
          let q2 = applyBase(s.from('shopify_orders').select('*', { count: 'exact' }))
          if (queryType === 'email') q2 = q2.ilike('customer_email', `%${query}%`)
          else q2 = q2.ilike(queryType, `%${query}%`)
          return q2.order('created_at', { ascending: false }).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)
        })
        setOrders(d2); setTotalCount(c2); setLoading(false); return
      }

      setOrders(data)
      setTotalCount(count)
    } catch (e) {
      console.error('Fetch orders error:', e)
      if (isMissingTableError(e)) {
        setOrders([])
        setTotalCount(0)
      } else {
        toast(false, 'Failed to load orders')
      }
    } finally { setLoading(false) }
  }, [ctx, dateFrom, dateTo, channelFilter, marketplaceFilter])

  useEffect(() => {
    fetchOrders(activeTab, searchQuery, searchType, page)
  }, [activeTab, page, dateFrom, dateTo, channelFilter, marketplaceFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Channel counts: cheap head:count queries per channel, respects date range
  useEffect(() => {
    let cancelled = false
    const apply = (q) => {
      if (dateFrom) q = q.gte('created_at', dateFrom)
      if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59.999')
      return q
    }
    const fetchCounts = async () => {
      const channels = ['In-store', 'Online', 'Online Assist', 'Marketplace']
      const results = await Promise.all([
        apply(supa.from('shopify_orders').select('id', { count: 'exact', head: true })),
        ...channels.map(c => apply(supa.from('shopify_orders').select('id', { count: 'exact', head: true })).eq('channel', c)),
      ])
      if (cancelled) return
      const [allRes, ...rest] = results
      const next = { all: allRes.count || 0 }
      channels.forEach((c, i) => { next[c] = rest[i].count || 0 })
      setChannelCounts(next)
    }
    fetchCounts()
    return () => { cancelled = true }
  }, [dateFrom, dateTo, ctx.rev])

  // Re-fetch when real-time updates arrive
  useEffect(() => {
    // Only re-fetch if we have orders loaded (not initial)
    if (!loading && orders.length >= 0) {
      // Debounce real-time re-renders
      const t = setTimeout(() => {
        // Just update orders from cache (no new DB call for the list)
        setOrders(prev => prev.map(o => ctx.getOrder(o.id) || o))
      }, 500)
      return () => clearTimeout(t)
    }
  }, [ctx.rev]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (val) => {
    setSearchQuery(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(0)
      fetchOrders(activeTab, val, searchType, 0)
    }, 400)
  }

  const onChangeDateFrom = (v) => { setPage(0); setDateFrom(v) }
  const onChangeDateTo   = (v) => { setPage(0); setDateTo(v) }
  const onChangeChannel  = (v) => { setPage(0); setChannelFilter(v); if (v !== 'Marketplace') setMarketplaceFilter('all') }
  const onClearFilters   = () => { setPage(0); setDateFrom(''); setDateTo(''); setChannelFilter('all'); setMarketplaceFilter('all') }

  // ── Line items via context ──────────────────────────────────
  const lineItems = {}
  orders.forEach(o => {
    const cached = ctx.getLineItems(o.id)
    if (cached) lineItems[o.id] = cached
  })

  const toggleExpand = (orderId) => {
    if (expandedId === orderId) { setExpandedId(null); return }
    setExpandedId(orderId)
    ctx.loadLineItems(orderId)
  }

  // ── Status actions ──────────────────────────────────────────
  const approveOrder = async (order) => {
    let lis = ctx.getLineItems(order.id)
    if (!lis || lis.length === 0) {
      lis = await ctx.loadLineItems(order.id)
      if (!lis || lis.length === 0 || !lis[0].stylist || !lis[0].product_executive) {
        toast(false, 'Please assign a Stylist and Product Executive before approving. Edit the order first.')
        return
      }
    } else {
      if (!lis[0].stylist || !lis[0].product_executive) {
        toast(false, 'Please assign a Stylist and Product Executive before approving. Edit the order first.')
        return
      }
    }
    if (!confirm('Approve this order and move to In Progress?')) return
    try {
      const { error: e1 } = await supa.from('shopify_orders').update({ order_status: 'in-progress' }).eq('id', order.id)
      if (e1) throw e1
      const { error: e2 } = await supa.from('order_line_items')
        .update({ production_stage: 'fabrication' })
        .eq('order_id', order.id)
        .eq('production_stage', 'pending')
      if (e2) throw e2

      if (order.customer_email) {
        try {
          const { data: buyers } = await supa.from('buyers').select('id').ilike('email', order.customer_email).limit(1)
          if (buyers?.[0]) {
            const { data: customers } = await supa.from('customers').select('id').eq('buyer_id', buyers[0].id).limit(1)
            if (customers?.[0]) {
              await supa.from('order_line_items').update({ customer_id: customers[0].id }).eq('order_id', order.id).is('customer_id', null)
            }
          }
        } catch (_) {}
      }

      _logChange('approve', 'order', order.id, order.order_number, { from: 'pending', to: 'in-progress' })
      toast(true, 'Order approved — items moved to Production')
      ctx.invalidateLineItems(order.id)
      fetchOrders(activeTab, searchQuery, searchType, page)
    } catch (e) {
      logAndToast('order-approve', `Failed to approve order ${order.order_number}`, e)
    }
  }

  const cancelOrder = async (order) => {
    if (!confirm('Cancel this order? This cannot be undone.')) return
    try {
      const { error } = await supa.from('shopify_orders').update({ order_status: 'cancelled' }).eq('id', order.id)
      if (error) throw error
      _logChange('cancel', 'order', order.id, order.order_number, { from: order.order_status, to: 'cancelled' })
      toast(true, 'Order cancelled')
      fetchOrders(activeTab, searchQuery, searchType, page)
    } catch (e) {
      logAndToast('order-cancel', `Failed to cancel order ${order.order_number}`, e)
    }
  }

  const handleMarkDelivered = async (order) => {
    if (!confirm('Mark this order as Delivered? All shipped products will be marked as Delivered.')) return
    try {
      const ok = await markOrderDelivered(order.id)
      if (ok) {
        _logChange('deliver', 'order', order.id, order.order_number, { from: 'dispatched', to: 'delivered' })
        ctx.invalidateLineItems(order.id)
        fetchOrders(activeTab, searchQuery, searchType, page)
      }
    } catch (e) {
      logAndToast('order-deliver', `Failed to mark order ${order.order_number} delivered`, e)
    }
  }

  // ── Shopify sync via context + separate customer sync ───────
  const handleRefresh = async () => {
    await ctx.syncFromShopify(false)
    fetchOrders(activeTab, searchQuery, searchType, page)
    // Fire customer sync in background (non-blocking) after orders finish
    supa.functions.invoke('sync-customers', { body: {} }).then(({ data: custData }) => {
      if (custData) {
        const custParts = []
        if (custData.created > 0) custParts.push(`${custData.created} new`)
        if (custData.updated > 0) custParts.push(`${custData.updated} updated`)
        if (custParts.length > 0) toast(true, `Customers: ${custParts.join(', ')}`)
      }
    }).catch(() => {})
  }

  // ── Modal callbacks ─────────────────────────────────────────
  const onModalSave = () => {
    setShowAddOrder(false); setEditOrder(null); setFulfillOrder(null); setTrialOrder(null); setAlterationItem(null); setExchangeReturnOrder(null)
    ctx.invalidateAll()
    fetchOrders(activeTab, searchQuery, searchType, page)
  }


  // Resolve a customer record for the share modal — try line-item customer_id first,
  // then fall back to buyer_customer_id on the order, then to a name lookup.
  // Also auto-generate a share_token if the order doesn't have one so the
  // customer-facing /r/:token URL actually resolves.
  const openShareReceipt = async (order) => {
    try {
      // 1. Ensure the order has a share_token. Without it, shareReceiptUrl()
      //    returns null and the WhatsApp / SMS / Email / Copy-link buttons
      //    fail silently.
      let orderForShare = order
      if (!order.share_token) {
        const newToken = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        const { error: tokenErr } = await supa.from('shopify_orders')
          .update({ share_token: newToken })
          .eq('id', order.id)
        if (!tokenErr) {
          orderForShare = { ...order, share_token: newToken }
        } else {
          console.warn('share_token update failed (will still open modal):', tokenErr)
        }
      }

      // 2. Resolve a customer record.
      let custId = orderForShare.buyer_customer_id
      if (!custId) {
        const { data: liRows } = await supa.from('order_line_items').select('customer_id').eq('order_id', orderForShare.id).limit(20)
        const ids = (liRows || []).map(r => r.customer_id).filter(Boolean)
        if (ids.length) custId = ids[0]
      }
      let customer = null
      if (custId) {
        const { data: c } = await supa.from('customers').select('id, name, phone, email').eq('id', custId).maybeSingle()
        customer = c
      }
      if (!customer) {
        customer = {
          name: orderForShare.customer_name || 'Customer',
          phone: (orderForShare.notes || '').match(/Phone:\s*(\S+)/)?.[1] || orderForShare.delivery_phone || '',
          email: orderForShare.customer_email || '',
        }
      }
      setSharingOrder({ order: orderForShare, customer })
    } catch (e) {
      console.error('openShareReceipt:', e)
      setSharingOrder({ order, customer: { name: order.customer_name || '', phone: '', email: order.customer_email || '' } })
    }
  }

  const openEdit = async (order) => {
    await ctx.loadLineItems(order.id)
    setEditOrder(order)
  }

  const openFulfill = async (order) => {
    await ctx.loadLineItems(order.id)
    setFulfillOrder(order)
  }

  const openTrial = async (order) => {
    await ctx.loadLineItems(order.id)
    setTrialOrder(order)
  }

  /* ─── RENDER ─────────────────────────────────────────────────── */
  return (
    <div className="p-4 sm:p-6 pb-24" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: C.text, fontFamily: 'Manrope, sans-serif' }}>Orders</h1>
          {!loading && <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: C.goldLight, color: C.goldDark }}>{totalCount}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Btn primary onClick={() => setShowAddOrder(true)}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Order
          </Btn>
          <Btn onClick={handleRefresh} disabled={ctx.refreshing}>
            <svg className={`w-4 h-4 ${ctx.refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {ctx.refreshing ? 'Syncing…' : 'Refresh'}
          </Btn>
        </div>
      </div>

      <OrdersList
        orders={orders}
        lineItems={lineItems}
        loading={loading}
        activeTab={activeTab}
        searchType={searchType}
        searchQuery={searchQuery}
        dateFrom={dateFrom}
        dateTo={dateTo}
        channelFilter={channelFilter}
        channelCounts={channelCounts}
        marketplaceFilter={marketplaceFilter}
        marketplaceOptions={marketplaceOptions}
        onChangeMarketplace={(v) => { setPage(0); setMarketplaceFilter(v) }}
        onChangeDateFrom={onChangeDateFrom}
        onChangeDateTo={onChangeDateTo}
        onChangeChannel={onChangeChannel}
        onClearFilters={onClearFilters}
        page={page}
        totalCount={totalCount}
        expandedId={expandedId}
        teamMembers={ctx.teamMembers}
        onChangeTab={(tab) => { setActiveTab(tab); setPage(0); setExpandedId(null) }}
        onChangeSearchType={setSearchType}
        onChangeSearchQuery={handleSearch}
        onChangePage={setPage}
        onToggleExpand={toggleExpand}
        onApprove={approveOrder}
        onCancel={cancelOrder}
        onEdit={openEdit}
        onFulfill={openFulfill}
        onTrial={openTrial}
        onAlterationItem={setAlterationItem}
        onMarkDelivered={handleMarkDelivered}
        onExchangeReturn={setExchangeReturnOrder}
        onConfirm={setConfirmingOrder}
        onCancelOrder={setCancellingOrder}
        onShareReceipt={openShareReceipt}
      />

      {showAddOrder && <AddOrderModal teamMembers={ctx.teamMembers} products={products} onSave={onModalSave} onClose={() => setShowAddOrder(false)} />}
      {editOrder && <EditOrderModal stitchingMaster={stitchingMaster} order={editOrder} lineItems={ctx.getLineItems(editOrder.id) || []} teamMembers={ctx.teamMembers} products={products} onSave={onModalSave} onClose={() => setEditOrder(null)} />}
      {fulfillOrder && <FulfillOrderModal order={fulfillOrder} lineItems={ctx.getLineItems(fulfillOrder.id) || []} teamMembers={ctx.teamMembers} onSave={onModalSave} onClose={() => setFulfillOrder(null)} />}
      {trialOrder && <TrialAlterationModal order={trialOrder} lineItems={ctx.getLineItems(trialOrder.id) || []} onSave={onModalSave} onClose={() => setTrialOrder(null)} />}
      {alterationItem && <AlterationDetailModal lineItem={alterationItem} onSave={onModalSave} onClose={() => setAlterationItem(null)} />}
      {exchangeReturnOrder && <ExchangeReturnModal order={exchangeReturnOrder} onSave={onModalSave} onClose={() => setExchangeReturnOrder(null)} />}
      {confirmingOrder && (
        <ConfirmOrderModal stitchingMaster={stitchingMaster}
          order={confirmingOrder}
          stylist={user ? { name: user.email?.split('@')[0] || 'Operator' } : null}
          teamMembers={ctx.teamMembers}
          products={products}
          onClose={() => setConfirmingOrder(null)}
          onConfirmed={() => { setConfirmingOrder(null); onModalSave() }}
        />
      )}
      {sharingOrder && (
        <ShareReceiptModal
          order={sharingOrder.order}
          customer={sharingOrder.customer}
          onClose={() => setSharingOrder(null)}
        />
      )}
      {cancellingOrder && (
        <CancelOrderModal
          order={cancellingOrder}
          actingUser={user ? { name: user.email?.split('@')[0] || 'Operator', id: null } : null}
          onClose={() => setCancellingOrder(null)}
          onCancelled={() => { setCancellingOrder(null); onModalSave() }}
        />
      )}
    </div>
  )
}

export default OrdersTab

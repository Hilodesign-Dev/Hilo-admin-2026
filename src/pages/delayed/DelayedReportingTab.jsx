import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { useOrders } from '../../context/OrdersContext'
import { Btn } from '../orders/ui'
import { PAGE_SIZE } from './constants'
import DelayedOrdersList from './DelayedOrdersList'
import EditOrderModal from '../orders/EditOrderModal'

const DelayedReportingTab = ({ user, stitchingMaster = [], embedded = false, openCustomer }) => {
  const ctx = useOrders()

  // ── Data state ──────────────────────────────────────────────
  const [orders, setOrders] = useState([])
  const [lineItems, setLineItems] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  // ── UI state ────────────────────────────────────────────────
  const [searchType, setSearchType] = useState('order_number')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState(null)

  // ── Modal state ─────────────────────────────────────────────
  const [editOrder, setEditOrder] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)

  const searchTimer = useRef(null)

  // ── Fetch delayed orders ────────────────────────────────────
  const fetchOrders = useCallback(async (query, queryType, pg) => {
    setLoading(true)
    try {
      // Base query: active orders (not fulfilled/cancelled) with line items
      let q = supa
        .from('shopify_orders')
        .select('*', { count: 'exact' })
        .not('order_status', 'in', '("cancelled","fulfilled")')

      // Filter for delayed orders:
      // 1. Orders with est_shipping_date in the past (overdue)
      // 2. OR orders without est_shipping_date that have been in-progress for 14+ days
      const now = new Date().toISOString()
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

      // Use OR filter: (est_shipping_date <= now) OR (est_shipping_date IS NULL AND created_at <= 2 weeks ago)
      q = q.or(`est_shipping_date.lte.${now},and(est_shipping_date.is.null,created_at.lte.${twoWeeksAgo})`)

      // Apply search filter
      if (query && query.length >= 2) {
        if (queryType === 'product') {
          const { data: matchedLIs } = await supa
            .from('order_line_items')
            .select('order_id')
            .ilike('title', `%${query}%`)
            .limit(100)
          const orderIds = [...new Set((matchedLIs || []).map(li => li.order_id))]
          if (orderIds.length > 0) {
            q = q.in('id', orderIds)
          } else {
            setOrders([])
            setTotalCount(0)
            setLoading(false)
            return
          }
        } else if (queryType === 'phone') {
          q = q.ilike('phone', `%${query}%`)
        } else if (queryType === 'customer_email') {
          q = q.ilike('customer_email', `%${query}%`)
        } else {
          q = q.ilike(queryType, `%${query}%`)
        }
      }

      // Sort by est_shipping_date ascending (most overdue first)
      q = q.order('est_shipping_date', { ascending: true }).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)

      const { data, count, error } = await q
      if (error) throw error

      const fetchedOrders = data || []

      // Batch-load line items via context (uses cache)
      if (fetchedOrders.length > 0) {
        const oids = fetchedOrders.map(o => o.id)
        const liMap = await ctx.batchLoadLineItems(oids)
        fetchedOrders.forEach(o => { o.order_line_items = liMap[o.id] || [] })
        setLineItems(prev => ({ ...prev, ...liMap }))
        const custIds = [...new Set(fetchedOrders.map(o => o.customer_id).filter(Boolean))]
        if (custIds.length) {
          let custRows = []
          for (let i = 0; i < custIds.length; i += 200) {
            const { data: cs } = await supa.from('customers').select('id, name, phone').in('id', custIds.slice(i, i + 200))
            custRows = custRows.concat(cs || [])
          }
          const cmap = Object.fromEntries(custRows.map(c => [c.id, c]))
          fetchedOrders.forEach(o => { o._cust = cmap[o.customer_id] || null })
        }
      }

      setOrders(fetchedOrders)
      setTotalCount(count || 0)
    } catch (e) {
      console.error('Fetch orders error:', e)
      toast(false, 'Failed to load delayed orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrders(searchQuery, searchType, page)
  }, [page, fetchOrders])

  // Debounced search
  const handleSearch = (val) => {
    setSearchQuery(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(0)
      fetchOrders(val, searchType, 0)
    }, 400)
  }

  // ── Fetch line items on expand (via context cache) ──────────
  const loadLineItems = async (orderId) => {
    if (lineItems[orderId]) return
    const data = await ctx.loadLineItems(orderId)
    setLineItems(prev => ({ ...prev, [orderId]: data || [] }))
  }

  const toggleExpand = (orderId) => {
    if (expandedId === orderId) {
      setExpandedId(null)
      return
    }
    setExpandedId(orderId)
    loadLineItems(orderId)
  }

  // ── Fulfill entire order ────────────────────────────────────
  const fulfillOrder = async (order) => {
    if (!confirm('Mark this order as fulfilled? All items will be marked as shipped.')) return
    try {
      // Update order status
      await supa.from('shopify_orders').update({ order_status: 'fulfilled' }).eq('id', order.id)

      // Mark all items as shipped
      const lis = lineItems[order.id] || []
      if (lis.length > 0) {
        await supa.from('order_line_items')
          .update({ production_stage: 'shipped' })
          .eq('order_id', order.id)
      }

      toast(true, 'Order fulfilled')
      setLineItems({})
      fetchOrders(searchQuery, searchType, page)
    } catch (e) {
      toast(false, 'Failed: ' + e.message)
    }
  }

  // ── Ship single item ────────────────────────────────────────
  const shipItem = async (item, order) => {
    if (!confirm(`Ship item "${item.title || '—'}"?`)) return
    try {
      // Mark item as shipped
      await supa.from('order_line_items').update({ production_stage: 'shipped' }).eq('id', item.id)

      // Check if all items are now shipped
      const lis = lineItems[order.id] || []
      const allShipped = lis.filter(li => li.id !== item.id).every(li => li.production_stage === 'shipped')

      if (allShipped) {
        // All items shipped -> order fulfilled
        await supa.from('shopify_orders').update({ order_status: 'fulfilled' }).eq('id', order.id)
        toast(true, 'Item shipped, order fulfilled')
      } else {
        // Some items still pending -> fulfilled-partially
        await supa.from('shopify_orders').update({ order_status: 'fulfilled-partially' }).eq('id', order.id)
        toast(true, 'Item shipped')
      }

      setLineItems({})
      fetchOrders(searchQuery, searchType, page)
    } catch (e) {
      toast(false, 'Failed: ' + e.message)
    }
  }

  // ── Modal callbacks ─────────────────────────────────────────
  const onModalSave = () => {
    setEditOrder(null)
    setLineItems({})
    fetchOrders(searchQuery, searchType, page)
  }

  const openEdit = (order) => {
    loadLineItems(order.id)
    setEditOrder(order)
  }

  /* ─── RENDER ─────────────────────────────────────────────────── */
  return (
    <div className={embedded ? '' : 'p-4 sm:p-6 pb-24'} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Header ──────────────────────────────────────────── */}
      {!embedded && <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: C.text, fontFamily: 'Manrope, sans-serif' }}>Delayed Reporting</h1>
          {!loading && <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: C.goldLight, color: C.goldDark }}>{totalCount}</span>}
        </div>
        <Btn onClick={() => {
          setLineItems({})
          fetchOrders(searchQuery, searchType, page)
        }} disabled={refreshing}>
          <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Btn>
      </div>}

      {/* ── Orders List ─────────────────────────────────────── */}
      <DelayedOrdersList
        orders={orders}
        lineItems={lineItems}
        loading={loading}
        searchType={searchType}
        searchQuery={searchQuery}
        page={page}
        totalCount={totalCount}
        expandedId={expandedId}
        onChangeSearchType={setSearchType}
        onChangeSearchQuery={handleSearch}
        onChangePage={setPage}
        onToggleExpand={toggleExpand}
        onEdit={openEdit}
        onFulfillOrder={fulfillOrder}
        onShipItem={shipItem}
        teamMembers={ctx.teamMembers}
        vendors={ctx.vendors}
        openCustomer={openCustomer}
      />

      {/* ── Modals ──────────────────────────────────────────── */}
      {editOrder && (
        <EditOrderModal stitchingMaster={stitchingMaster}
          order={editOrder}
          lineItems={lineItems[editOrder.id] || []}
          teamMembers={ctx.teamMembers}
          onSave={onModalSave}
          onClose={() => setEditOrder(null)}
        />
      )}
    </div>
  )
}

export default DelayedReportingTab

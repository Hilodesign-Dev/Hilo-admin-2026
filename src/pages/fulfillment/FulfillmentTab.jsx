import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supa, isMissingTableError } from '../../lib/supabase'
import { C, toast, MARKETPLACE_CHANNELS } from '../../lib/designTokens'
import { useOrders } from '../../context/OrdersContext'
import { Btn } from './ui'
import { PAGE_SIZE } from './constants'
import FulfillmentList from './FulfillmentList'
import FulfillmentDashboard from './FulfillmentDashboard'
import EditOrderModal from '../orders/EditOrderModal'
import FulfillOrderModal from '../orders/FulfillOrderModal'
import DelayedReportingTab from '../delayed/DelayedReportingTab'
import TrialAlterationModal from '../orders/TrialAlterationModal'
import AlterationDetailModal from '../orders/AlterationDetailModal'

const FulfillmentTab = ({ user, stitchingMaster = [], openCustomer }) => {
  const ctx = useOrders()

  // ── Data state ──────────────────────────────────────────────
  const [orders, setOrders] = useState([])
  const [lineItems, setLineItems] = useState({})
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  // ── UI state ────────────────────────────────────────────────
  const [subView, setSubView] = useState('list')
  const [activeChannel, setActiveChannel] = useState('all')
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState(null)

  // ── Filter state ────────────────────────────────────────────
  const [filters, setFilters] = useState({
    searchType: 'order_number',
    searchQuery: '',
    filterVendor: '',
    filterDeliveryType: '',
    filterStylist: '',
    filterProductExec: '',
    filterType: '',
    filterFromDate: '',
    filterToDate: '',
    filterEventDate: '',
    filterChannels: [],
  })

  // ── Modal state ─────────────────────────────────────────────
  const [editOrder, setEditOrder] = useState(null)
  const [fulfillOrder, setFulfillOrder] = useState(null)
  const [trialOrder, setTrialOrder] = useState(null)
  const [alterationItem, setAlterationItem] = useState(null)

  const searchTimer = useRef(null)

  // ── Fetch orders — fulfillment_status is the source of truth ──
  const OPEN_STATUSES = ['unfulfilled', 'partial']
  const fetchOrders = useCallback(async (channel, pg, filterObj) => {
    setLoading(true)
    try {
      let q = supa.from('shopify_orders').select('*', { count: 'exact' })
      let orderIds = null

      // Trial / Alterations are line-item workflow states → pre-resolve ids
      if (channel === 'trial' || channel === 'alterations') {
        const { data: matchedLIs } = await supa.from('order_line_items').select('order_id')
          .eq('alteration_status', channel === 'trial' ? 'trial' : 'alterations')
        orderIds = [...new Set((matchedLIs || []).map(li => li.order_id))]
        if (orderIds.length === 0) { setOrders([]); setTotalCount(0); setLoading(false); return }
        q = q.in('id', orderIds)
      } else if (channel === 'fulfilled') {
        // Archive — the ONLY tab that shows fulfilled orders
        q = q.eq('fulfillment_status', 'fulfilled')
      } else {
        // Every working tab shows OPEN orders only, regardless of date/age
        q = q.in('fulfillment_status', OPEN_STATUSES).neq('order_status', 'cancelled')
        if (channel === 'store_assist') q = q.in('channel', ['In-store', 'Online Assist'])
        else if (channel === 'online') q = q.eq('channel', 'Online')
        else if (channel === 'to_be_fulfilled') q = q.or('fulfillment_status.eq.partial,has_ready_item.eq.true')
        // 'all' → no further channel filter
      }

      // Search
      const { searchType, searchQuery, filterFromDate, filterToDate } = filterObj || {}
      if (searchQuery && searchQuery.length >= 2) {
        if (searchType === 'product') {
          const { data: matchedLIs } = await supa.from('order_line_items').select('order_id').ilike('title', `%${searchQuery}%`).limit(200)
          const productOrderIds = [...new Set((matchedLIs || []).map(li => li.order_id))]
          if (productOrderIds.length === 0) { setOrders([]); setTotalCount(0); setLoading(false); return }
          q = q.in('id', orderIds ? orderIds.filter(id => productOrderIds.includes(id)) : productOrderIds)
        } else if (searchType === 'phone') { q = q.ilike('notes', `%${searchQuery}%`) }
        else if (searchType === 'email') { q = q.ilike('customer_email', `%${searchQuery}%`) }
        else { q = q.ilike(searchType, `%${searchQuery}%`) }
      }

      // Optional date filter (created_at). Default = none → ALL open orders, any age.
      if (filterFromDate) q = q.gte('created_at', filterFromDate)
      if (filterToDate)   q = q.lte('created_at', filterToDate + 'T23:59:59')
      // Overdue quick-filter: promised delivery date already passed
      if (filterObj?.overdueOnly) q = q.lt('est_shipping_date', new Date().toISOString().slice(0, 10))

      // Line-item scoped filters (stylist / exec / type / vendor / delivery type)
      const { filterStylist, filterProductExec, filterType, filterVendor, filterDeliveryType, filterEventDate, filterChannels } = filterObj || {}
      if (filterStylist || filterProductExec || filterType || filterVendor || filterDeliveryType) {
        let liq = supa.from('order_line_items').select('order_id')
        if (filterStylist) liq = liq.eq('stylist', String(filterStylist))
        if (filterProductExec) liq = liq.eq('product_executive', String(filterProductExec))
        if (filterType) liq = liq.eq('type', filterType)
        if (filterVendor) liq = liq.eq('vendor_assigned', filterVendor)
        if (filterDeliveryType) liq = liq.eq('fulfillment_type', filterDeliveryType)
        const { data: liRows } = await liq.limit(5000)
        const liIds = [...new Set((liRows || []).map(r => r.order_id))]
        if (liIds.length === 0) { setOrders([]); setTotalCount(0); setLoading(false); return }
        q = q.in('id', liIds)
      }
      if (filterEventDate) q = q.eq('event_date', filterEventDate)
      if (filterChannels && filterChannels.length) q = q.in('channel', filterChannels)

      // Working queues: oldest-first (surface old pending); archive: newest-first
      q = channel === 'fulfilled'
        ? q.order('created_at', { ascending: false })
        : q.order('est_shipping_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true })
      q = q.range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)

      const { data, count, error } = await q
      if (error) throw error

      const fetchedOrders = data || []
      if (fetchedOrders.length > 0) {
        const oids = fetchedOrders.map(o => o.id)
        const liMap = await ctx.batchLoadLineItems(oids)
        fetchedOrders.forEach(o => { o.order_line_items = liMap[o.id] || [] })
        setLineItems(prev => ({ ...prev, ...liMap }))
        // Enrich with customer name + phone (reach out without leaving the tab)
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
      if (isMissingTableError(e)) {
        setOrders([])
        setTotalCount(0)
      } else {
        toast(false, 'Failed to load orders: ' + (e?.message || e))
      }
    } finally {
      setLoading(false)
    }
  }, [ctx])

  // ── Initial fetch ───────────────────────────────────────────
  useEffect(() => {
    fetchOrders(activeChannel, page, filters)
  }, [activeChannel, page, filters, fetchOrders])

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

  // ── Modal callbacks ─────────────────────────────────────────
  const onModalSave = () => {
    setEditOrder(null)
    setFulfillOrder(null)
    setTrialOrder(null)
    setAlterationItem(null)
    setLineItems({})
    fetchOrders(activeChannel, page, filters)
  }

  const openEdit = (order) => {
    loadLineItems(order.id)
    setEditOrder(order)
  }

  const openFulfill = async (order) => {
    if (!lineItems[order.id]) await loadLineItems(order.id)
    setFulfillOrder(order)
  }

  const openTrial = async (order) => {
    if (!lineItems[order.id]) await loadLineItems(order.id)
    setTrialOrder(order)
  }

  // ── Apply filters ───────────────────────────────────────────
  const handleApplyFilters = (newFilters) => {
    setFilters(newFilters)
    setPage(0)
  }

  /* ─── RENDER ─────────────────────────────────────────────────── */
  return (
    <div className="p-4 sm:p-6 pb-24" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: C.text, fontFamily: 'Manrope, sans-serif' }}>Fulfillment</h1>
          {!loading && <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: C.goldLight, color: C.goldDark }}>{totalCount}</span>}
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: C.borderLight }}>
          {[{ k: 'list', label: 'Orders' }, { k: 'delayed', label: 'Delayed' }, { k: 'dashboard', label: 'Dashboard' }].map(v => (
            <button key={v.k} onClick={() => setSubView(v.k)}
              className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
              style={{ background: subView === v.k ? C.gold : 'transparent', color: subView === v.k ? '#fff' : C.textMuted }}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sub-views ───────────────────────────────────────── */}
      {subView === 'list' && (
        <FulfillmentList
          orders={orders}
          lineItems={lineItems}
          loading={loading}
          activeChannel={activeChannel}
          teamMembers={ctx.teamMembers}
          vendors={ctx.vendors}
          page={page}
          totalCount={totalCount}
          expandedId={expandedId}
          openCustomer={openCustomer}
          onChangeChannel={(ch) => { setActiveChannel(ch); setPage(0); setExpandedId(null) }}
          onApplyFilters={handleApplyFilters}
          onChangePage={setPage}
          onToggleExpand={toggleExpand}
          onEdit={openEdit}
          onFulfill={openFulfill}
          onTrial={openTrial}
          onAlterationItem={setAlterationItem}
        />
      )}
      {subView === 'delayed' && (
        <DelayedReportingTab user={user} stitchingMaster={stitchingMaster} openCustomer={openCustomer} embedded />
      )}
      {subView === 'dashboard' && (
        <FulfillmentDashboard orders={orders} teamMembers={ctx.teamMembers} vendors={ctx.vendors} />
      )}

      {/* ── Modals ──────────────────────────────────────────── */}
      {editOrder && <EditOrderModal stitchingMaster={stitchingMaster} order={editOrder} lineItems={lineItems[editOrder.id] || []} teamMembers={ctx.teamMembers} onSave={onModalSave} onClose={() => setEditOrder(null)} />}
      {fulfillOrder && <FulfillOrderModal order={fulfillOrder} lineItems={lineItems[fulfillOrder.id] || []} teamMembers={ctx.teamMembers} onSave={onModalSave} onClose={() => setFulfillOrder(null)} />}
      {trialOrder && <TrialAlterationModal order={trialOrder} lineItems={lineItems[trialOrder.id] || []} onSave={onModalSave} onClose={() => setTrialOrder(null)} />}
      {alterationItem && <AlterationDetailModal lineItem={alterationItem} onSave={onModalSave} onClose={() => setAlterationItem(null)} />}
    </div>
  )
}

export default FulfillmentTab

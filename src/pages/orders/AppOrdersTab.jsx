import React, { useState, useEffect, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { fmtDate, fmtCurrency } from '../../lib/designTokens'
import { Btn, Badge } from './ui'

const STATUS_OPTIONS = ['pending', 'pending_payment', 'confirmed', 'cancelled', 'fulfilled']
const PAYMENT_STATUS_OPTIONS = ['unpaid', 'pending', 'paid', 'failed', 'refunded']

export default function AppOrdersTab({ user }) {
  const [orders, setOrders] = useState([])
  const [userMap, setUserMap] = useState({}) // userId → { name, phone }
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  // Filters & Pagination
  const [activeStatus, setActiveStatus] = useState('all')
  const [activePaymentStatus, setActivePaymentStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 15

  // Expanded order ID and its loaded items
  const [expandedId, setExpandedId] = useState(null)
  const [expandedItems, setExpandedItems] = useState({})
  const [itemsLoading, setItemsLoading] = useState(false)

  // Fetch orders from shopper_orders
  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      let q = supa.from('shopper_orders').select('*', { count: 'exact' })

      if (activeStatus !== 'all') {
        q = q.eq('order_status', activeStatus)
      }
      if (activePaymentStatus !== 'all') {
        q = q.eq('payment_status', activePaymentStatus)
      }

      if (searchQuery.trim().length >= 2) {
        const query = searchQuery.trim()
        q = q.or(`order_number.ilike.%${query}%,shipping_name.ilike.%${query}%,shipping_phone.ilike.%${query}%`)
      }

      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data, count, error } = await q
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      const rows = data || []
      setOrders(rows)
      setTotalCount(count || 0)

      // Enrich with real user names/phones when shipping fields are null
      const missingUserIds = [...new Set(rows
        .filter(o => !o.shipping_name && o.user_id)
        .map(o => o.user_id))]

      if (missingUserIds.length > 0) {
        const { data: users } = await supa
          .from('shopper_users')
          .select('id, name, phone')
          .in('id', missingUserIds)
        if (users) {
          setUserMap(prev => ({
            ...prev,
            ...Object.fromEntries(users.map(u => [u.id, { name: u.name, phone: u.phone }]))
          }))
        }
      }
    } catch (e) {
      console.error('[HILO] Failed to fetch shopper orders:', e)
      toast(false, 'Failed to fetch shopper orders: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [activeStatus, activePaymentStatus, searchQuery, page])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Load items for a specific order when expanded
  const loadOrderItems = async (orderId) => {
    if (expandedItems[orderId]) return
    setItemsLoading(true)
    try {
      const { data, error } = await supa
        .from('shopper_order_items')
        .select('*')
        .eq('order_id', orderId)

      if (error) throw error
      setExpandedItems(prev => ({ ...prev, [orderId]: data || [] }))
    } catch (e) {
      console.error('[HILO] Failed to fetch order items:', e)
      toast(false, 'Failed to fetch order items')
    } finally {
      setItemsLoading(false)
    }
  }

  const handleToggleExpand = (orderId) => {
    if (expandedId === orderId) {
      setExpandedId(null)
    } else {
      setExpandedId(orderId)
      loadOrderItems(orderId)
    }
  }

  // Update order status or payment status
  const handleUpdateStatus = async (orderId, field, value) => {
    try {
      const { error } = await supa
        .from('shopper_orders')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', orderId)

      if (error) throw error
      
      // Update local state
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, [field]: value } : o))
      toast(true, `Updated ${field.replace('_', ' ')} successfully`)
    } catch (e) {
      console.error('[HILO] Status update failed:', e)
      toast(false, 'Failed to update: ' + e.message)
    }
  }

  // Manual Operations Handoff replication
  const handleManualHandoff = async (order) => {
    toast(true, 'Triggering ops handoff...')
    try {
      // 1. Ensure line items are loaded
      let items = expandedItems[order.id]
      if (!items) {
        const { data, error } = await supa
          .from('shopper_order_items')
          .select('*')
          .eq('order_id', order.id)
        if (error) throw error
        items = data || []
        setExpandedItems(prev => ({ ...prev, [order.id]: items }))
      }

      if (items.length === 0) {
        throw new Error('Cannot sync order with zero items.')
      }

      const opsId = order.ops_order_id || crypto.randomUUID()
      const opsNumber = order.ops_order_number || order.order_number

      // 2. Insert order header into shopify_orders
      const richPayload = {
        id: opsId,
        order_number: opsNumber,
        customer_name: order.shipping_name || "",
        customer_email: order.customer_email || null,
        customer_phone: order.shipping_phone || null,
        total_price: Number(order.grand_total),
        subtotal_price: Number(order.subtotal),
        total_discounts: 0,
        channel: "Online",
        channel_id: "online",
        financial_status: order.payment_status === "paid" ? "paid" : "pending",
        fulfillment_status: "unfulfilled",
        order_status: order.order_status === "confirmed" ? "confirmed" : "pending",
        order_origin: "customer_api",
        payment_status: order.payment_status === "paid" ? "paid" : "unpaid",
        payment_collected: order.payment_status === "paid" ? Number(order.grand_total) : 0,
        payment_balance: order.payment_status === "paid" ? 0 : Number(order.grand_total),
        shipping_address: {
          name: order.shipping_name,
          phone: order.shipping_phone,
          line1: order.shipping_line1,
          line2: order.shipping_line2,
          city: order.shipping_city,
          state: order.shipping_state,
          pincode: order.shipping_pincode,
          country: order.shipping_country || 'IN',
        },
        notes: `App order ${order.order_number} (${order.payment_type})`,
        created_at: new Date().toISOString(),
      }

      // Check if already in shopify_orders to avoid primary key crash
      const { data: existOps } = await supa
        .from('shopify_orders')
        .select('id')
        .eq('order_number', opsNumber)
        .maybeSingle()

      if (!existOps) {
        const { error: insErr } = await supa.from('shopify_orders').insert([richPayload])
        if (insErr) {
          // Retry minimal stub insert
          const minimal = {
            id: opsId,
            order_number: opsNumber,
            customer_name: order.shipping_name || "",
            created_at: new Date().toISOString(),
          }
          const { error: retryErr } = await supa.from('shopify_orders').insert([minimal])
          if (retryErr) throw retryErr
        }
      }

      // 3. Insert line items
      for (const item of items) {
        const line = {
          id: crypto.randomUUID(),
          order_id: opsId,
          order_number: opsNumber,
          title: item.title,
          sku: item.variant_id,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          sale_price: Number(item.line_total),
          product_type: "catalog",
          type: "General",
          production_stage: "pending",
          confirmation_status: "confirmed",
          created_at: new Date().toISOString(),
        }

        // Check if item already exists to prevent duplicate lines
        const { data: existLine } = await supa
          .from('order_line_items')
          .select('id')
          .eq('order_id', opsId)
          .eq('sku', item.variant_id)
          .maybeSingle()

        if (!existLine) {
          const { error: liErr } = await supa.from('order_line_items').insert([line])
          if (liErr) {
            await supa.from('order_line_items').insert([
              { id: line.id, order_id: opsId, created_at: line.created_at }
            ])
          }
        }
      }

      // 4. Update sync status on shopper_orders
      const { error: updErr } = await supa
        .from('shopper_orders')
        .update({
          ops_handoff_status: 'synced',
          ops_order_id: opsId,
          ops_order_number: opsNumber,
          ops_handoff_error: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', order.id)

      if (updErr) throw updErr

      // Update state
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ops_handoff_status: 'synced', ops_order_id: opsId, ops_order_number: opsNumber, ops_handoff_error: null } : o))
      toast(true, 'Manual handoff to operations completed successfully')
    } catch (e) {
      console.error('[HILO] Manual handoff failed:', e)
      toast(false, 'Handoff failed: ' + e.message)
    }
  }

  // Get status color tokens
  const getStatusColor = (status) => {
    switch (status) {
      case 'fulfilled': return { bg: C.greenBg, color: C.green }
      case 'confirmed': return { bg: C.blueBg, color: C.blue }
      case 'pending': return { bg: C.amberBg, color: C.amber }
      case 'pending_payment': return { bg: 'rgba(124,58,237,0.08)', color: '#7c3aed' }
      case 'cancelled': return { bg: C.redBg, color: C.red }
      default: return { bg: 'rgba(100,116,139,0.08)', color: '#64748b' }
    }
  }

  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'paid': return { bg: C.greenBg, color: C.green }
      case 'pending': return { bg: C.amberBg, color: C.amber }
      case 'unpaid': return { bg: 'rgba(100,116,139,0.08)', color: '#64748b' }
      case 'failed':
      case 'refunded': return { bg: C.redBg, color: C.red }
      default: return { bg: 'rgba(100,116,139,0.08)', color: '#64748b' }
    }
  }

  const getHandoffColor = (status) => {
    switch (status) {
      case 'synced': return C.green
      case 'failed': return C.red
      case 'pending': return C.amber
      default: return '#64748b'
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: C.text }}>App Orders</h1>
          <p className="text-sm mt-1" style={{ color: C.textMuted }}>
            Manage shopper-initiated purchases and checkout flows placed via the Customer Mobile App
          </p>
        </div>
        <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border" style={{ borderColor: C.border }}>
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: C.textLight }}>Total App Orders</span>
          <span className="text-xl font-bold" style={{ color: C.text }}>{totalCount}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border mb-6 flex flex-wrap gap-4 items-center justify-between" style={{ borderColor: C.border }}>
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search bar */}
          <div className="relative min-w-[280px]">
            <input
              type="text"
              placeholder="Search by Order #, Name, Phone..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
              className="w-full text-sm pl-9 pr-4 py-2 rounded-2xl border outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200 transition-all"
              style={{ background: C.bg, borderColor: C.border, color: C.text }}
            />
            <span className="absolute left-3 top-2.5 text-gray-400">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
          </div>

          {/* Order Status Filter */}
          <div>
            <select
              value={activeStatus}
              onChange={e => { setActiveStatus(e.target.value); setPage(0); }}
              className="text-xs font-bold bg-gray-50 border px-3 py-2 rounded-2xl outline-none focus:ring-1 focus:ring-amber-200"
              style={{ color: C.text, borderColor: C.border }}
            >
              <option value="all">ALL ORDER STATUSES</option>
              {STATUS_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt.toUpperCase().replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <select
              value={activePaymentStatus}
              onChange={e => { setActivePaymentStatus(e.target.value); setPage(0); }}
              className="text-xs font-bold bg-gray-50 border px-3 py-2 rounded-2xl outline-none focus:ring-1 focus:ring-amber-200"
              style={{ color: C.text, borderColor: C.border }}
            >
              <option value="all">ALL PAYMENT STATUSES</option>
              {PAYMENT_STATUS_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Sync Trigger shortcut */}
        <div className="flex gap-2">
          <Btn onClick={fetchOrders} small>
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" />
              </svg>
              Refresh
            </span>
          </Btn>
        </div>
      </div>

      {/* Orders List Table */}
      <div className="bg-white rounded-3xl shadow-sm border overflow-hidden" style={{ borderColor: C.border }}>
        {loading ? (
          <div className="py-20 text-center text-sm" style={{ color: C.textMuted }}>Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3">📦</div>
            <div className="text-sm font-bold" style={{ color: C.text }}>No app orders found</div>
            <div className="text-xs mt-1" style={{ color: C.textMuted }}>Try adjusting your filters or search query</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: C.border, background: C.bg }}>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Order #</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Customer</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Date</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Amount</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Payment</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Order Status</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Ops Handoff</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => {
                  const isExpanded = expandedId === order.id
                  const statusColors = getStatusColor(order.order_status)
                  const payColors = getPaymentStatusColor(order.payment_status)

                  return (
                    <React.Fragment key={order.id}>
                      <tr
                        className={`border-b hover:bg-gray-50/50 cursor-pointer transition-colors ${isExpanded ? 'bg-amber-50/10' : ''}`}
                        style={{ borderColor: C.border }}
                        onClick={() => handleToggleExpand(order.id)}
                      >
                        <td className="p-4">
                          <span className="font-bold text-sm" style={{ color: C.text }}>{order.order_number}</span>
                        </td>
                        <td className="p-4">
                          <div className="font-semibold text-sm" style={{ color: C.text }}>
                            {order.shipping_name || userMap[order.user_id]?.name || 'Guest User'}
                          </div>
                          <div className="text-xs" style={{ color: C.textMuted }}>
                            {order.shipping_phone || userMap[order.user_id]?.phone || 'No phone'}
                          </div>
                        </td>
                        <td className="p-4 text-sm" style={{ color: C.text }}>
                          {fmtDate(order.created_at)}
                        </td>
                        <td className="p-4 text-sm font-bold" style={{ color: C.text }}>
                          {fmtCurrency(order.grand_total)}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1 items-start">
                            <Badge color={payColors.color} bg={payColors.bg}>
                              {order.payment_status.toUpperCase()}
                            </Badge>
                            <span className="text-[10px] font-bold text-gray-500 pl-0.5">{order.payment_type}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge color={statusColors.color} bg={statusColors.bg}>
                            {order.order_status.toUpperCase().replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="p-4 text-center">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: getHandoffColor(order.ops_handoff_status) }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: getHandoffColor(order.ops_handoff_status) }} />
                            {order.ops_handoff_status}
                          </span>
                        </td>
                        <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleToggleExpand(order.id)}
                            className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors text-gray-500"
                          >
                            <svg className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </td>
                      </tr>

                      {/* Expanded View */}
                      {isExpanded && (
                        <tr>
                          <td colSpan="8" className="p-6 bg-gray-50/40 border-b" style={{ borderColor: C.border }}>
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                              {/* Order Metadata and Settings (Left Side) */}
                              <div className="lg:col-span-5 bg-white p-5 rounded-2xl border" style={{ borderColor: C.border }}>
                                <div className="border-b pb-3 mb-4">
                                  <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: C.text }}>Delivery & Payment Specs</h3>
                                </div>
                                <div className="space-y-4">
                                  {/* Shipping Address */}
                                  <div>
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Shipping Details</h4>
                                    <div className="text-sm font-medium" style={{ color: C.text }}>{order.shipping_name}</div>
                                    <div className="text-xs" style={{ color: C.textMuted }}>Phone: {order.shipping_phone}</div>
                                    <div className="text-xs mt-1" style={{ color: C.textMuted }}>
                                      {order.shipping_line1} {order.shipping_line2 ? `, ${order.shipping_line2}` : ''}<br />
                                      {order.shipping_city}, {order.shipping_state} - {order.shipping_pincode}<br />
                                      {order.shipping_country}
                                    </div>
                                  </div>

                                  {/* Payment details */}
                                  <div>
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Transaction Data</h4>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      <div>
                                        <span className="text-gray-400 block">Gateway Provider</span>
                                        <span className="font-semibold" style={{ color: C.text }}>{order.payment_provider || 'COD / None'}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-400 block">Provider Ref</span>
                                        <span className="font-mono text-[10px] select-all font-semibold" style={{ color: C.text }}>{order.provider_order_id || '—'}</span>
                                      </div>
                                      <div className="col-span-2">
                                        <span className="text-gray-400 block">Session Key</span>
                                        <span className="font-mono text-[10px] select-all" style={{ color: C.textMuted }}>{order.payment_session_id || '—'}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Quick Status Adjustments */}
                                  <div className="border-t pt-3 mt-4">
                                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Admin Overrides</h4>
                                    <div className="flex gap-3">
                                      <div className="flex-1">
                                        <label className="text-[9px] font-bold text-gray-400 block uppercase mb-1">Order Status</label>
                                        <select
                                          value={order.order_status}
                                          onChange={e => handleUpdateStatus(order.id, 'order_status', e.target.value)}
                                          className="w-full text-xs font-semibold bg-gray-50 border p-2 rounded-xl outline-none focus:ring-1 focus:ring-amber-200"
                                          style={{ color: C.text, borderColor: C.border }}
                                        >
                                          {STATUS_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt.toUpperCase().replace('_', ' ')}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="flex-1">
                                        <label className="text-[9px] font-bold text-gray-400 block uppercase mb-1">Payment Status</label>
                                        <select
                                          value={order.payment_status}
                                          onChange={e => handleUpdateStatus(order.id, 'payment_status', e.target.value)}
                                          className="w-full text-xs font-semibold bg-gray-50 border p-2 rounded-xl outline-none focus:ring-1 focus:ring-amber-200"
                                          style={{ color: C.text, borderColor: C.border }}
                                        >
                                          {PAYMENT_STATUS_OPTIONS.map(opt => (
                                            <option key={opt} value={opt}>{opt.toUpperCase()}</option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Order items (Right Side) */}
                              <div className="lg:col-span-7 flex flex-col gap-4">
                                <div className="bg-white p-5 rounded-2xl border flex-1" style={{ borderColor: C.border }}>
                                  <div className="border-b pb-3 mb-4">
                                    <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: C.text }}>Purchased Items</h3>
                                  </div>
                                  {itemsLoading ? (
                                    <div className="py-10 text-center text-xs text-gray-400">Loading line items...</div>
                                  ) : !expandedItems[order.id] || expandedItems[order.id].length === 0 ? (
                                    <div className="py-10 text-center text-xs text-gray-400">No items found in this order.</div>
                                  ) : (
                                    <div className="space-y-3">
                                      {expandedItems[order.id].map(item => (
                                        <div key={item.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: C.borderLight }}>
                                          <div className="flex items-center gap-3">
                                            {item.image_url ? (
                                              <img src={item.image_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100" />
                                            ) : (
                                              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-xs">🛍️</div>
                                            )}
                                            <div>
                                              <div className="text-xs font-bold" style={{ color: C.text }}>{item.title}</div>
                                              <div className="text-[10px] font-mono mt-0.5" style={{ color: C.textLight }}>SKU: {item.variant_id}</div>
                                            </div>
                                          </div>
                                          <div className="text-right">
                                            <div className="text-xs font-bold" style={{ color: C.text }}>{fmtCurrency(item.line_total)}</div>
                                            <div className="text-[10px]" style={{ color: C.textMuted }}>{fmtCurrency(item.unit_price)} × {item.quantity}</div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Subtotals mapping */}
                                  <div className="border-t pt-3 mt-4 space-y-1.5 text-xs">
                                    <div className="flex justify-between text-gray-500">
                                      <span>Items Subtotal</span>
                                      <span>{fmtCurrency(order.subtotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-500">
                                      <span>CGST + SGST Tax</span>
                                      <span>{fmtCurrency(order.gst_total)}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-500">
                                      <span>Shipping Cost</span>
                                      <span>{fmtCurrency(order.shipping_cost)}</span>
                                    </div>
                                    <div className="flex justify-between font-bold text-sm pt-1.5 border-t" style={{ color: C.text, borderColor: C.borderLight }}>
                                      <span>Grand Total</span>
                                      <span>{fmtCurrency(order.grand_total)}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Operations Handoff Sync Status Block */}
                                <div className="bg-white p-4 rounded-2xl border" style={{ borderColor: C.border }}>
                                  <div className="flex flex-wrap gap-4 items-center justify-between">
                                    <div>
                                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Operations Handoff</h4>
                                      <div className="text-xs font-medium" style={{ color: C.text }}>
                                        {order.ops_handoff_status === 'synced' ? (
                                          <span>Linked to Order Number <span className="font-bold text-amber-600">{order.ops_order_number}</span></span>
                                        ) : order.ops_handoff_status === 'failed' ? (
                                          <span className="text-red-600">Sync Failed: {order.ops_handoff_error || 'Unknown constraint violation'}</span>
                                        ) : (
                                          <span className="text-gray-500">Handoff is pending payment confirmation</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      {order.ops_handoff_status !== 'synced' && (
                                        <Btn
                                          primary
                                          small
                                          onClick={() => handleManualHandoff(order)}
                                        >
                                          Sync to Operations
                                        </Btn>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {!loading && totalPages > 1 && (
          <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: C.border, background: C.bg }}>
            <span className="text-xs font-medium" style={{ color: C.textMuted }}>
              Showing {page * PAGE_SIZE + 1} – {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} orders
            </span>
            <div className="flex gap-2">
              <Btn
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                small
              >
                Previous
              </Btn>
              <Btn
                disabled={page + 1 >= totalPages}
                onClick={() => setPage(p => p + 1)}
                small
              >
                Next
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

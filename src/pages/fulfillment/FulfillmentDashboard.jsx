import React, { useState } from 'react'
import { C, MARKETPLACE_CHANNELS } from '../../lib/designTokens'
import { Select, Input } from './ui'
import { fmtDate } from './constants'

const StatCard = ({ label, value, color, bg }) => (
  <div className="rounded-xl p-4" style={{ background: bg, border: `1px solid ${C.border}` }}>
    <div className="text-xs font-medium mb-1" style={{ color: C.textMuted }}>{label}</div>
    <div className="text-2xl font-bold" style={{ color }}>{value}</div>
  </div>
)

const FulfillmentDashboard = ({ orders, teamMembers, vendors }) => {
  const [filterChannel, setFilterChannel] = useState('')
  const [filterFromDate, setFilterFromDate] = useState('')
  const [filterToDate, setFilterToDate] = useState('')

  // Default to current month
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultFromDate = filterFromDate || firstDay.toISOString().slice(0, 10)
  const defaultToDate = filterToDate || now.toISOString().slice(0, 10)

  // Filter orders by date and channel
  const filteredOrders = orders.filter(o => {
    const shipDate = new Date(o.est_shipping_date || o.created_at)
    const from = new Date(defaultFromDate)
    const to = new Date(defaultToDate)
    to.setHours(23, 59, 59, 999)

    if (shipDate < from || shipDate > to) return false
    if (filterChannel && filterChannel !== 'all') {
      if (filterChannel === 'marketplaces') return MARKETPLACE_CHANNELS.includes(o.channel)
      return o.channel === filterChannel
    }
    return true
  })

  // Calculate delay
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const totalOrders = filteredOrders.length
  const totalProducts = filteredOrders.reduce((sum, o) => sum + (o.order_line_items?.length || 0), 0)

  // Delays by channel
  const delaysByChannel = {}
  const channels = new Set(filteredOrders.map(o => o.channel || 'Unknown'))

  channels.forEach(ch => {
    const channelOrders = filteredOrders.filter(o => o.channel === ch)
    const totalOrd = channelOrders.length
    const delayedOrd = channelOrders.filter(o => {
      const shipDate = new Date(o.est_shipping_date || o.created_at)
      return shipDate < today && o.order_status !== 'fulfilled'
    }).length
    const delayedProd = channelOrders
      .filter(o => {
        const shipDate = new Date(o.est_shipping_date || o.created_at)
        return shipDate < today && o.order_status !== 'fulfilled'
      })
      .reduce((sum, o) => sum + (o.order_line_items?.length || 0), 0)
    const totalProd = channelOrders.reduce((sum, o) => sum + (o.order_line_items?.length || 0), 0)

    delaysByChannel[ch] = {
      total: totalOrd,
      delayed: delayedOrd,
      delayedPct: totalOrd > 0 ? Math.round((delayedOrd / totalOrd) * 100) : 0,
      delayedProd,
      totalProd,
      delayedProdPct: totalProd > 0 ? Math.round((delayedProd / totalProd) * 100) : 0,
    }
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select value={filterChannel} onChange={e => setFilterChannel(e.target.value)}>
          <option value="">All Channels</option>
          <option value="Online">Online</option>
          <option value="Online Assist">Online Assist</option>
          <option value="marketplaces">Marketplaces</option>
        </Select>
        <Input type="date" value={filterFromDate} onChange={e => setFilterFromDate(e.target.value)} />
        <Input type="date" value={filterToDate} onChange={e => setFilterToDate(e.target.value)} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total Orders" value={totalOrders} color={C.text} bg={C.cardBg} />
        <StatCard label="Total Products" value={totalProducts} color={C.blue} bg={C.blueBg} />
      </div>

      {/* Delays table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
        <div className="px-4 py-3 border-b font-semibold text-xs" style={{ borderColor: C.border, color: C.text }}>Delays by Channel</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                <th className="text-left px-4 py-2 font-bold" style={{ color: C.textMuted }}>Channel</th>
                <th className="text-center px-4 py-2 font-bold" style={{ color: C.textMuted }}>Total Orders</th>
                <th className="text-center px-4 py-2 font-bold" style={{ color: C.textMuted }}>Delayed Orders</th>
                <th className="text-center px-4 py-2 font-bold" style={{ color: C.textMuted }}>Delayed %</th>
                <th className="text-center px-4 py-2 font-bold" style={{ color: C.textMuted }}>Delayed Products</th>
                <th className="text-center px-4 py-2 font-bold" style={{ color: C.textMuted }}>Delayed Products %</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(delaysByChannel).length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8" style={{ color: C.textMuted }}>No data</td>
                </tr>
              ) : (
                Object.entries(delaysByChannel)
                  .sort((a, b) => b[1].delayed - a[1].delayed)
                  .map(([channel, data]) => (
                    <tr key={channel} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                      <td className="px-4 py-2 font-medium" style={{ color: C.text }}>{channel}</td>
                      <td className="text-center px-4 py-2" style={{ color: C.text }}>{data.total}</td>
                      <td className="text-center px-4 py-2" style={{ color: C.text }}>{data.delayed}</td>
                      <td className="text-center px-4 py-2" style={{ color: data.delayedPct > 0 ? C.red : C.green }}>
                        <span className="font-bold">{data.delayedPct}%</span>
                      </td>
                      <td className="text-center px-4 py-2" style={{ color: C.text }}>{data.delayedProd}</td>
                      <td className="text-center px-4 py-2" style={{ color: data.delayedProdPct > 0 ? C.red : C.green }}>
                        <span className="font-bold">{data.delayedProdPct}%</span>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default FulfillmentDashboard

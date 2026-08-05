import React from 'react'
import { C } from '../../lib/designTokens'

const StatCard = ({ label, value, color, bg }) => (
  <div className="rounded-xl p-4" style={{ background: bg, border: `1px solid ${C.border}` }}>
    <div className="text-xs font-medium mb-1" style={{ color: C.textMuted }}>{label}</div>
    <div className="text-2xl font-bold" style={{ color }}>{value}</div>
  </div>
)

const BreakdownSection = ({ title, entries }) => (
  <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
    <div className="px-4 py-3 border-b font-semibold text-xs" style={{ borderColor: C.border, color: C.text }}>{title}</div>
    {Object.entries(entries).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
      <div key={label} className="flex items-center justify-between px-4 py-2.5 text-xs" style={{ borderBottom: `1px solid ${C.borderLight}` }}>
        <span style={{ color: C.text }} className="capitalize">{label.replace(/-/g, ' ')}</span>
        <span className="font-bold" style={{ color: C.gold }}>{count}</span>
      </div>
    ))}
  </div>
)

const ProductionDashboard = ({ items, orders }) => {
  const stageCounts = {}
  const deliveryCounts = {}
  const channelCounts = {}

  items.forEach(item => {
    const st = item.production_stage || 'unknown'
    stageCounts[st] = (stageCounts[st] || 0) + 1
    const dt = item.delivery_type || 'Not Set'
    deliveryCounts[dt] = (deliveryCounts[dt] || 0) + 1
    const ord = orders[item.order_id]
    const ch = ord?.channel || 'Unknown'
    channelCounts[ch] = (channelCounts[ch] || 0) + 1
  })

  const total = items.length
  const fabrication = stageCounts['fabrication'] || 0
  const stitching = stageCounts['stitching'] || 0
  const readyToShip = stageCounts['ready-to-ship'] || 0
  const shipped = stageCounts['shipped'] || 0

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total Items" value={total} color={C.text} bg={C.cardBg} />
        <StatCard label="Fabrication" value={fabrication} color={C.blue} bg={C.blueBg} />
        <StatCard label="Stitching" value={stitching} color={C.purple} bg={C.purpleBg} />
        <StatCard label="Ready to Ship" value={readyToShip} color={C.green} bg={C.greenBg} />
        <StatCard label="Shipped" value={shipped} color={C.textMuted} bg={C.cream} />
      </div>

      {/* Stage breakdown */}
      <BreakdownSection title="Stage Breakdown" entries={stageCounts} />

      {/* Channel breakdown */}
      <BreakdownSection title="Channel Breakdown" entries={channelCounts} />

      {/* Delivery type breakdown */}
      <BreakdownSection title="Delivery Type Breakdown" entries={deliveryCounts} />
    </div>
  )
}

export default ProductionDashboard

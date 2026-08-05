import React from 'react'
import { C } from '../../lib/designTokens'

/**
 * Tiny pill rendered in order lists to make the origin obvious at a glance.
 *   shopify-origin     -> 🛒 ONLINE
 *   pos-origin         -> 🏬 POS
 *   quotation-origin   -> 📋 QUOTATION
 */
const OriginBadge = ({ origin }) => {
  const map = {
    shopify:   { label: 'ONLINE',    icon: '🛒', bg: 'rgba(91,141,239,0.15)', fg: '#5b8def' },
    pos:       { label: 'POS',       icon: '🏬', bg: 'rgba(201,164,50,0.18)', fg: '#795900' },
    quotation: { label: 'QUOTATION', icon: '📋', bg: 'rgba(162,108,224,0.15)', fg: '#a26ce0' },
  }
  const m = map[origin] || map.shopify
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 whitespace-nowrap"
      style={{ background: m.bg, color: m.fg }}>
      <span>{m.icon}</span>{m.label}
    </span>
  )
}

export default OriginBadge

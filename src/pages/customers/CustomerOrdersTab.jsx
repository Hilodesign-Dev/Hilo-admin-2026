import React from 'react'
import { C } from '../../lib/designTokens'

const CustomerOrdersTab = ({ customer }) => {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '20px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 700, color: C.text, marginBottom: '16px' }}>Orders</h3>
      <div style={{ padding: '20px', textAlign: 'center', color: C.textMuted }}>Orders integration coming soon.</div>
    </div>
  )
}

export default CustomerOrdersTab

import React from 'react'
import { C, toast } from '../../lib/designTokens'

const BuyerCard = ({ buyer, customerCount, totalSpend, customerType, onSelect, onEdit, getTypeBadge }) => {
  const typeBadge = getTypeBadge(customerType || 'normal')

  return (
    <div
      onClick={onSelect}
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        padding: '16px',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: C.text, margin: '0 0 4px 0' }}>{buyer.name}</h3>
          <div style={{ fontSize: '12px', color: C.textMuted }}>
            {buyer.city ? <div>{buyer.city}</div> : null}
            {buyer.phone ? <div>{buyer.phone}</div> : null}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          style={{
            padding: '4px 8px',
            background: C.goldLight,
            color: C.goldDark,
            border: 'none',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Edit
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', marginBottom: '12px' }}>
        <div>
          <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>Wearers</div>
          <div style={{ color: C.text, fontWeight: 600 }}>{customerCount}</div>
        </div>
        <div>
          <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>Total Spend</div>
          <div style={{ color: C.text, fontWeight: 600 }}>₹{totalSpend.toLocaleString()}</div>
        </div>
      </div>

      <span
        style={{
          padding: '4px 8px',
          background: typeBadge.bg,
          color: typeBadge.color,
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 600,
        }}
      >
        {typeBadge.badge} {typeBadge.label}
      </span>
    </div>
  )
}

export default BuyerCard

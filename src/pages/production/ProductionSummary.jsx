import React from 'react'
import { C } from '../../lib/designTokens'

const SIZES_ARR = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'MTF']

const ProductionSummary = ({ items }) => {
  const grouped = {}
  items.forEach(item => {
    const key = (item.title || 'Unknown') + '||' + (item.sku || '')
    if (!grouped[key]) grouped[key] = { title: item.title, sku: item.sku, sizes: {}, total: 0 }
    const sz = (item.size || '').toUpperCase()
    grouped[key].sizes[sz] = (grouped[key].sizes[sz] || 0) + (item.quantity || 1)
    grouped[key].total += (item.quantity || 1)
  })
  const rows = Object.values(grouped).sort((a, b) => b.total - a.total)

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
      <div className="p-4 border-b" style={{ borderColor: C.border }}>
        <h3 className="text-sm font-bold" style={{ color: C.text }}>Production Summary — Size Breakdown</h3>
        <p className="text-xs mt-1" style={{ color: C.textMuted }}>{rows.length} products · {items.length} line items</p>
      </div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm" style={{ color: C.textMuted }}>No items match current filters</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: C.cream }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: C.text }}>Product</th>
                <th className="text-left px-2 py-2 font-semibold" style={{ color: C.text }}>Style Code</th>
                {SIZES_ARR.map(s => <th key={s} className="text-center px-2 py-2 font-semibold" style={{ color: C.text }}>{s}</th>)}
                <th className="text-center px-3 py-2 font-bold" style={{ color: C.gold }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                  <td className="px-3 py-2.5 font-medium" style={{ color: C.text, maxWidth: 200 }}>{row.title}</td>
                  <td className="px-2 py-2.5" style={{ color: C.textMuted }}>{row.sku || '—'}</td>
                  {SIZES_ARR.map(s => (
                    <td key={s} className="text-center px-2 py-2.5" style={{ color: row.sizes[s] ? C.text : C.textLight, fontWeight: row.sizes[s] ? 600 : 400 }}>
                      {row.sizes[s] || '—'}
                    </td>
                  ))}
                  <td className="text-center px-3 py-2.5 font-bold" style={{ color: C.gold, background: C.goldLight }}>{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default ProductionSummary

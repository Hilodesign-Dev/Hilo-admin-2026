import React from 'react'
import { SIZES } from '../../lib/designTokens'
import { POS_T, MIcon } from './tokens'
import { lineMath, cartTotals } from './cartHelpers'

/**
 * Cart side panel. Each row has inline size + qty editing — the picker
 * adds the product at sensible defaults (M, qty 1) and the user fine-tunes
 * here.
 */
const Cart = ({ cart = [], onRemove, onUpdate, onContinue, onBack }) => {
  const totals = cartTotals(cart)

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
      <div className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${POS_T.outlineVariant}` }}>
        <div className="flex items-center gap-2">
          <MIcon name="shopping_cart" size={18} fill style={{ color: POS_T.primary }} />
          <span className="font-bold text-sm" style={{ color: POS_T.onSurface }}>Cart</span>
        </div>
        <span className="text-[10px] font-bold tracking-[0.1em] uppercase px-2 py-0.5 rounded-full"
          style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>
          {cart.length} {cart.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div className="p-3 space-y-2 max-h-[55vh] overflow-y-auto">
        {cart.length === 0 && (
          <div className="text-xs py-10 text-center" style={{ color: POS_T.onSurfaceVariant }}>
            <MIcon name="shopping_bag" size={28} style={{ color: POS_T.outline }} />
            <div className="mt-1">Tap a product to add</div>
          </div>
        )}
        {cart.map(li => {
          const m = lineMath(li)
          return (
            <div key={li.tempId} className="p-2.5 rounded-lg"
              style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
              <div className="flex gap-2.5">
                <div className="w-14 h-14 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center"
                  style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
                  {li.image
                    ? <img src={li.image} alt={li.title} className="w-full h-full object-cover" />
                    : <MIcon name={li.is_set ? 'inventory_2' : 'checkroom'} size={22} style={{ color: POS_T.outline }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate" style={{ color: POS_T.onSurface }}>{li.title}</div>
                  {li.sku && (
                    <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: POS_T.outline }}>{li.sku}</div>
                  )}
                  <div className="text-[10px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: POS_T.onSurfaceVariant }}>
                    <TypeBadge t={li.type} />
                    {li.category && <span>· {li.category}</span>}
                  </div>
                </div>
                <button onClick={() => onRemove(li.tempId)} className="text-xs flex-shrink-0 self-start p-1 rounded hover:opacity-70"
                  style={{ color: POS_T.error }}>
                  <MIcon name="close" size={16} />
                </button>
              </div>

              {/* Inline size + qty + total */}
              <div className="flex items-center gap-2 mt-2.5 pt-2.5"
                style={{ borderTop: `1px dashed ${POS_T.outlineVariant}` }}>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold tracking-[0.1em] uppercase" style={{ color: POS_T.onSurfaceVariant }}>Size</span>
                  <select value={li.size || 'M'} onChange={e => {
                      const newSize = e.target.value
                      const v = (li.variants || []).find(x => x && x.size === newSize)
                      const patch = { size: newSize }
                      const vMrp = Number(v?.mrp ?? v?.sellingPrice ?? 0)
                      if (vMrp > 0) patch.mrp = vMrp
                      onUpdate?.(li.tempId, patch)
                    }}
                    className="text-xs font-bold px-1.5 py-0.5 rounded outline-none cursor-pointer"
                    style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
                    {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-0.5 rounded-full px-0.5"
                  style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
                  <button onClick={() => onUpdate?.(li.tempId, { quantity: Math.max(1, (Number(li.quantity) || 1) - 1) })}
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ color: POS_T.onSurfaceVariant }}>
                    <MIcon name="remove" size={14} />
                  </button>
                  <span className="text-xs font-bold font-mono min-w-[20px] text-center" style={{ color: POS_T.onSurface }}>
                    {li.quantity || 1}
                  </span>
                  <button onClick={() => onUpdate?.(li.tempId, { quantity: (Number(li.quantity) || 1) + 1 })}
                    className="w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ color: POS_T.onSurfaceVariant }}>
                    <MIcon name="add" size={14} />
                  </button>
                </div>

                <div className="ml-auto text-xs font-bold font-mono" style={{ color: POS_T.primary }}>
                  ₹{m.gross.toLocaleString('en-IN')}
                </div>
              </div>

              {li.size === 'MTF' && (
                <div className="mt-1.5 text-[10px] inline-flex items-center gap-1" style={{ color: POS_T.warning }}>
                  <MIcon name="straighten" size={12} />
                  MTF — measurements needed
                </div>
              )}

              {li.is_set && li.set_components && (
                <div className="mt-2 space-y-0.5">
                  {li.set_components.map((c, i) => (
                    <div key={i} className="text-[10px]" style={{ color: POS_T.onSurfaceVariant }}>
                      ↳ {c.name || c.category} <span style={{ color: POS_T.outline }}>· {c.category}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="px-4 py-3" style={{ borderTop: `1px solid ${POS_T.outlineVariant}`, background: POS_T.surfaceContainerLow }}>
        <div className="flex justify-between text-sm font-bold mb-3" style={{ color: POS_T.onSurface }}>
          <span>Subtotal</span>
          <span className="font-mono">₹{totals.gross.toLocaleString('en-IN')}</span>
        </div>
        <button onClick={onContinue} disabled={cart.length === 0}
          className="w-full text-sm font-bold py-3 rounded-full inline-flex items-center justify-center gap-2"
          style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary, opacity: cart.length === 0 ? 0.4 : 1 }}>
          Continue to review
          <MIcon name="arrow_forward" size={18} />
        </button>
        {onBack && (
          <button onClick={onBack}
            className="w-full text-xs font-bold py-2 mt-2 inline-flex items-center justify-center gap-1"
            style={{ color: POS_T.onSurfaceVariant }}>
            <MIcon name="arrow_back" size={14} />
            Back to customer
          </button>
        )}
      </div>
    </div>
  )
}

const TypeBadge = ({ t }) => {
  const map = {
    catalog:    { label: 'CATALOG',    bg: POS_T.tertiaryContainer, fg: POS_T.onTertiaryContainer },
    custom:     { label: 'CUSTOM',     bg: POS_T.secondaryContainer, fg: POS_T.onSecondaryContainer },
    custom_set: { label: 'CUSTOM SET', bg: POS_T.secondaryContainer, fg: POS_T.onSecondaryContainer },
  }
  const m = map[t] || map.custom
  return <span className="text-[9px] font-bold tracking-[0.05em] px-1.5 py-0.5 rounded" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
}

export default Cart

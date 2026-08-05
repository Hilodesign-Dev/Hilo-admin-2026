import React, { useState } from 'react'
import { POS_T, MIcon } from './tokens'
import { lineMath, cartTotals } from './cartHelpers'
import { validatePromoCode } from './promoCodeActions'
import { toast } from '../../lib/designTokens'

const ReviewStep = ({
  cart, onUpdateLine, onRemoveLine, onBack, onContinue, onSaveQuotation,
  canDiscount = true,
  orderDiscount, setOrderDiscount,
  coupon, setCoupon,
  loyalty,                       // { tier, discountPct } if applicable
  customer = null,
  channel = 'In-store',
}) => {
  const totals = cartTotals(cart, { orderDiscount, coupon, loyalty })
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-bold tracking-tight" style={{ color: POS_T.onSurface, fontSize: 'clamp(22px, 4vw, 32px)' }}>
          Review order
        </h1>
        <p className="text-sm mt-1.5" style={{ color: POS_T.onSurfaceVariant }}>
          Apply per-item discounts and check GST before collecting payment.
        </p>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block rounded-xl overflow-hidden"
        style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
        <div className="grid items-center gap-3 px-4 py-3"
          style={{
            background: POS_T.surfaceContainerLow,
            color: POS_T.onSurfaceVariant,
            gridTemplateColumns: '2.2fr 0.9fr 1.5fr 0.9fr 0.6fr 0.9fr 32px',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
          <div>Product</div><div>MRP</div><div>Discount</div><div>Sale price</div><div>GST</div><div>Total</div><div></div>
        </div>
        {cart.map(li => {
          const m = lineMath(li)
          return (
            <div key={li.tempId}
              className="grid items-center gap-3 px-4 py-3"
              style={{ borderTop: `1px solid ${POS_T.outlineVariant}`, gridTemplateColumns: '2.2fr 0.9fr 1.5fr 0.9fr 0.6fr 0.9fr 32px' }}>
              <ItemTitle li={li} />
              <div className="text-sm font-mono" style={{ color: POS_T.onSurface }}>₹{m.gross.toLocaleString('en-IN')}</div>
              <DiscountCell line={li} onUpdate={(p) => onUpdateLine(li.tempId, p)} disabled={!canDiscount} />
              <div className="text-sm font-mono" style={{ color: POS_T.onSurface }}>₹{m.salePrice.toLocaleString('en-IN')}</div>
              <div className="text-xs" style={{ color: POS_T.onSurfaceVariant }}>{(m.gstRate * 100).toFixed(0)}%</div>
              <div className="text-sm font-bold font-mono" style={{ color: POS_T.primary }}>₹{m.salePrice.toLocaleString('en-IN')}</div>
              <button onClick={() => onRemoveLine(li.tempId)} className="self-start p-1" style={{ color: POS_T.error }}>
                <MIcon name="close" size={16} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {cart.map(li => {
          const m = lineMath(li)
          return (
            <div key={li.tempId} className="rounded-xl p-3"
              style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <ItemTitle li={li} />
                <button onClick={() => onRemoveLine(li.tempId)} className="p-1 flex-shrink-0" style={{ color: POS_T.error }}>
                  <MIcon name="close" size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <KV label="MRP" v={`₹${m.gross.toLocaleString('en-IN')}`} />
                <KV label="Sale" v={`₹${m.salePrice.toLocaleString('en-IN')}`} />
                <KV label="GST" v={`${(m.gstRate * 100).toFixed(0)}%`} />
                <KV label="Total" v={`₹${m.salePrice.toLocaleString('en-IN')}`} bold accent={POS_T.primary} />
              </div>
              <div>
                <div className="text-[10px] font-bold tracking-[0.1em] uppercase mb-1" style={{ color: POS_T.onSurfaceVariant }}>Discount</div>
                <DiscountCell line={li} onUpdate={(p) => onUpdateLine(li.tempId, p)} disabled={!canDiscount} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Order discount + Coupon */}
      {setOrderDiscount && (
        <div className="mt-6 grid lg:grid-cols-2 gap-3 max-w-3xl ml-auto">
          <OrderDiscountCard
            value={orderDiscount}
            onChange={setOrderDiscount}
            disabled={!canDiscount}
            applied={totals.orderDiscount}
          />
          <CouponCard
            coupon={coupon}
            onApply={setCoupon}
            cart={cart}
            customer={customer}
            channel={channel}
            applied={totals.couponDiscount}
          />
        </div>
      )}

      {/* Summary */}
      <div className="mt-6 max-w-md ml-auto">
        <Row k="Subtotal" v={totals.gross} />
        {totals.lineDiscountTotal > 0 && <Row k="Line discounts" v={-totals.lineDiscountTotal} accent={POS_T.success} />}
        {totals.orderDiscount > 0 && <Row k="Order discount" v={-totals.orderDiscount} accent={POS_T.success} />}
        {totals.couponDiscount > 0 && <Row k={`Coupon ${coupon?.code || ''}`} v={-totals.couponDiscount} accent={POS_T.success} />}
        {totals.loyaltyDiscount > 0 && <Row k={`${loyalty?.tier || 'Loyalty'} discount`} v={-totals.loyaltyDiscount} accent={POS_T.success} />}
        <Row k="GST (included)" muted v={totals.gstTotal} />
        <div className="mt-3 py-3 px-4 rounded-xl flex items-center justify-between"
          style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>
          <span className="text-sm font-bold">Order total</span>
          <span className="text-xl font-bold font-mono">₹{totals.saleTotal.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <button onClick={onBack}
          className="text-sm font-bold px-4 py-2.5 rounded-full inline-flex items-center gap-1.5"
          style={{ border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
          <MIcon name="arrow_back" size={16} />
          Back to products
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          {onSaveQuotation && (
            <button onClick={onSaveQuotation}
              className="text-sm font-bold px-4 py-2.5 rounded-full inline-flex items-center gap-1.5"
              style={{ border: `1px solid ${POS_T.secondary}`, color: POS_T.secondary }}>
              <MIcon name="bookmark_add" size={16} />
              Save as quotation
            </button>
          )}
          <button onClick={onContinue} disabled={cart.length === 0}
            className="text-sm font-bold px-6 py-2.5 rounded-full inline-flex items-center gap-1.5"
            style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary, opacity: cart.length === 0 ? 0.4 : 1 }}>
            Collect payment
            <MIcon name="payments" size={16} fill />
          </button>
        </div>
      </div>
    </div>
  )
}

const OrderDiscountCard = ({ value, onChange, disabled, applied }) => {
  const v = value || { type: 'none', value: 0, reason: '' }
  return (
    <div className="rounded-xl p-3"
      style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
      <div className="text-[10px] font-bold tracking-[0.1em] uppercase mb-2" style={{ color: POS_T.onSurfaceVariant }}>
        Order discount
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {[
          { k: 'none', label: 'None' },
          { k: 'percentage', label: '%' },
          { k: 'flat', label: '₹' },
        ].map(opt => (
          <button key={opt.k} disabled={disabled}
            onClick={() => onChange({ type: opt.k, value: opt.k === 'none' ? 0 : (v.value || 0), reason: v.reason })}
            className="text-[11px] font-bold px-2.5 py-1 rounded-md"
            style={{
              background: v.type === opt.k ? POS_T.primaryContainer : POS_T.surfaceContainerLow,
              color: v.type === opt.k ? POS_T.onPrimary : POS_T.onSurfaceVariant,
              border: `1px solid ${POS_T.outlineVariant}`,
              opacity: disabled ? 0.4 : 1,
            }}>
            {opt.label}
          </button>
        ))}
      </div>
      {v.type !== 'none' && (
        <div className="space-y-2">
          <input type="text" inputMode="decimal" value={v.value || ''}
            disabled={disabled}
            onChange={e => onChange({ type: v.type, value: e.target.value.replace(/[^0-9.]/g, ''), reason: v.reason })}
            placeholder={v.type === 'percentage' ? 'Percent off' : 'Flat amount ₹'}
            className="w-full text-sm px-2.5 py-1.5 rounded outline-none font-mono"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
          <input type="text" value={v.reason || ''}
            disabled={disabled}
            onChange={e => onChange({ type: v.type, value: v.value, reason: e.target.value })}
            placeholder="Reason / approval (optional)"
            className="w-full text-xs px-2.5 py-1.5 rounded outline-none"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
          {applied > 0 && (
            <div className="text-xs" style={{ color: POS_T.success }}>
              Applied: <span className="font-mono font-bold">₹{applied.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const CouponCard = ({ coupon, onApply, cart, customer, channel, applied }) => {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const apply = async () => {
    setBusy(true); setError('')
    try {
      const res = await validatePromoCode(code, { cart, customer, channel })
      if (!res.ok) { setError(res.reason); return }
      onApply(res.coupon)
      setCode('')
      toast(true, `Applied ${res.coupon.code}`)
    } finally { setBusy(false) }
  }

  const remove = () => { onApply(null); setError(''); setCode('') }

  return (
    <div className="rounded-xl p-3"
      style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
      <div className="text-[10px] font-bold tracking-[0.1em] uppercase mb-2" style={{ color: POS_T.onSurfaceVariant }}>
        Coupon
      </div>
      {!coupon && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <input type="text" value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
              placeholder="ENTER CODE"
              className="flex-1 text-sm px-2.5 py-1.5 rounded outline-none font-mono tracking-wider"
              style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
            <button onClick={apply} disabled={busy || !code.trim()}
              className="text-xs font-bold px-3 py-1.5 rounded"
              style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary, opacity: busy || !code.trim() ? 0.4 : 1 }}>
              {busy ? '…' : 'Apply'}
            </button>
          </div>
          {error && <div className="text-xs" style={{ color: POS_T.error }}>{error}</div>}
        </div>
      )}
      {coupon && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold font-mono px-2 py-1 rounded"
              style={{ background: POS_T.tertiaryContainer, color: POS_T.onTertiaryContainer }}>
              {coupon.code}
            </div>
            <button onClick={remove} className="text-xs font-bold ml-auto" style={{ color: POS_T.error }}>
              Remove
            </button>
          </div>
          {coupon.description && <div className="text-xs" style={{ color: POS_T.onSurfaceVariant }}>{coupon.description}</div>}
          {applied > 0 && (
            <div className="text-xs" style={{ color: POS_T.success }}>
              Saved <span className="font-mono font-bold">₹{applied.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ItemTitle = ({ li }) => (
  <div className="min-w-0 flex items-start gap-2.5">
    <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
      {li.image
        ? <img src={li.image} alt={li.title} className="w-full h-full object-cover" />
        : <MIcon name={li.is_set ? 'inventory_2' : 'checkroom'} size={20} style={{ color: POS_T.outline }} />}
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-sm font-bold truncate" style={{ color: POS_T.onSurface }}>{li.title}</div>
      {li.sku && (
        <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: POS_T.outline }}>{li.sku}</div>
      )}
      <div className="text-[10px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: POS_T.onSurfaceVariant }}>
        <span className="font-bold tracking-[0.05em] uppercase px-1.5 py-0.5 rounded"
          style={{ background: POS_T.tertiaryContainer, color: POS_T.onTertiaryContainer }}>
          {li.type === 'catalog' ? 'CATALOG' : li.type === 'custom_set' ? 'CUSTOM SET' : 'CUSTOM'}
        </span>
        <span>· {li.size} · Qty {li.quantity}</span>
        {li.category && <span>· {li.category}</span>}
      </div>
      {li.is_set && li.set_components && (
        <div className="mt-1 space-y-0.5">
          {li.set_components.map((c, i) => (
            <div key={i} className="text-[10px]" style={{ color: POS_T.onSurfaceVariant }}>↳ {c.name || c.category}</div>
          ))}
        </div>
      )}
    </div>
  </div>
)

const Row = ({ k, v, muted, accent }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-xs" style={{ color: muted ? POS_T.outline : POS_T.onSurfaceVariant }}>{k}</span>
    <span className="text-sm font-mono" style={{ color: accent || POS_T.onSurface }}>{v < 0 ? '−' : ''}₹{Math.abs(v).toLocaleString('en-IN')}</span>
  </div>
)

const KV = ({ label, v, bold, accent }) => (
  <div>
    <div className="text-[10px] font-bold tracking-[0.1em] uppercase" style={{ color: POS_T.onSurfaceVariant }}>{label}</div>
    <div className="text-sm font-mono mt-0.5" style={{ color: accent || POS_T.onSurface, fontWeight: bold ? 700 : 500 }}>{v}</div>
  </div>
)

const DiscountCell = ({ line, onUpdate, disabled }) => {
  const type = line.discountType || 'percentage'
  const value = line.discountValue == null ? '' : line.discountValue
  const m = lineMath(line)
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex items-center p-0.5 rounded-md"
        style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
        <button disabled={disabled} onClick={() => onUpdate({ discountType: 'percentage' })}
          className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={{ background: type === 'percentage' ? POS_T.warning : 'transparent', color: type === 'percentage' ? POS_T.onPrimary : POS_T.onSurfaceVariant }}>%</button>
        <button disabled={disabled} onClick={() => onUpdate({ discountType: 'flat' })}
          className="text-[10px] font-bold px-2 py-0.5 rounded"
          style={{ background: type === 'flat' ? POS_T.warning : 'transparent', color: type === 'flat' ? POS_T.onPrimary : POS_T.onSurfaceVariant }}>₹</button>
      </div>
      <input type="text" inputMode="decimal" value={value} disabled={disabled}
        onChange={e => onUpdate({ discountType: type, discountValue: e.target.value.replace(/[^0-9.]/g, '') })}
        placeholder="0"
        className="w-16 text-xs px-2 py-1 rounded outline-none text-right font-mono"
        style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
      <span className="text-[10px]" style={{ color: POS_T.onSurfaceVariant }}>
        {m.discountAmount > 0 ? `= ₹${m.discountAmount.toLocaleString('en-IN')}` : ''}
      </span>
    </div>
  )
}

export default ReviewStep

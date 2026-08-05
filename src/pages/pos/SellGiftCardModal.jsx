import React, { useState } from 'react'
import { POS_T, MIcon } from './tokens'
import { newGiftCardPin } from './giftCardActions'

/**
 * SellGiftCardModal — inline form to add a gift-card line to the cart.
 * The actual gift_cards row + PIN issuance happens AFTER the order is committed
 * (see POSNewOrder.onCollectPayment). We just collect the recipient + amount
 * here so the cart line carries enough metadata.
 */
const SellGiftCardModal = ({ onAdd, onClose }) => {
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState({ name: '', phone: '', email: '', message: '' })
  const [expiresMonths, setExpiresMonths] = useState(12)
  const [pin, setPin] = useState(newGiftCardPin())
  const [autoPin, setAutoPin] = useState(true)

  const v = Number(amount)
  const ready = v > 0

  const add = () => {
    if (!ready) return
    const expiresAt = new Date(Date.now() + Number(expiresMonths) * 30 * 24 * 3600 * 1000).toISOString()
    onAdd({
      type: 'gift_card',
      title: `Gift Card · ₹${v.toLocaleString('en-IN')}`,
      sku: 'HIGC',
      mrp: v,
      quantity: 1,
      size: '—',
      category: 'Gift Card',
      gift_card_meta: { ...recipient, expires_at: expiresAt, pin },
      // Discount controls disabled visually in the cart for gift cards
      discountType: 'percentage',
      discountValue: 0,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col"
        style={{ background: POS_T.surfaceContainerLowest, maxHeight: '95vh' }}>
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${POS_T.outlineVariant}` }}>
          <div className="flex items-center gap-2">
            <MIcon name="card_giftcard" size={20} fill style={{ color: POS_T.primary }} />
            <div className="font-bold text-base" style={{ color: POS_T.onSurface }}>Sell gift card</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: POS_T.onSurfaceVariant }}>
            <MIcon name="close" size={20} />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <div>
            <Lbl>Amount</Lbl>
            <div className="flex items-baseline gap-2 px-3 py-2 rounded-lg"
              style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
              <span className="text-xl font-bold" style={{ color: POS_T.onSurfaceVariant }}>₹</span>
              <input type="text" inputMode="decimal" value={amount}
                onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="5000"
                className="text-2xl font-bold bg-transparent outline-none flex-1 font-mono"
                style={{ color: POS_T.onSurface }} />
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[1000, 2500, 5000, 10000, 25000].map(p => (
                <button key={p} onClick={() => setAmount(String(p))}
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
                  ₹{p.toLocaleString('en-IN')}
                </button>
              ))}
            </div>
          </div>

          <In label="Recipient name" v={recipient.name} onChange={v => setRecipient({ ...recipient, name: v })} placeholder="Ananya Khanna" />
          <Two>
            <In label="Phone" v={recipient.phone} onChange={v => setRecipient({ ...recipient, phone: v })} placeholder="+91 90000 11111" />
            <In label="Email" v={recipient.email} onChange={v => setRecipient({ ...recipient, email: v })} placeholder="ananya@example.com" />
          </Two>
          <In label="Personal message (optional)" v={recipient.message} onChange={v => setRecipient({ ...recipient, message: v })} placeholder="Happy birthday from Mom!" />

          <Two>
            <Sel label="Expires" v={expiresMonths} onChange={v => setExpiresMonths(Number(v))}
              opts={[
                { k: 6, label: '6 months' },
                { k: 12, label: '1 year (default)' },
                { k: 24, label: '2 years' },
                { k: 36, label: '3 years' },
              ]} />
            <div>
              <Lbl>PIN (mandatory)</Lbl>
              <div className="flex items-center gap-1.5">
                <input type="text" value={pin} disabled={autoPin}
                  onChange={e => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0,4))}
                  className="flex-1 text-sm px-3 py-2 rounded outline-none font-mono tracking-widest text-center"
                  style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface, opacity: autoPin ? 0.5 : 1 }} />
                <button onClick={() => { setAutoPin(!autoPin); if (!autoPin) setPin(newGiftCardPin()) }}
                  className="text-[10px] font-bold px-2 py-2 rounded"
                  style={{ background: autoPin ? POS_T.primaryContainer : POS_T.surfaceContainerLow, color: autoPin ? POS_T.onPrimary : POS_T.onSurface, border: `1px solid ${POS_T.outlineVariant}` }}>
                  AUTO
                </button>
              </div>
            </div>
          </Two>

          <div className="text-[11px]" style={{ color: POS_T.onSurfaceVariant }}>
            Card code is generated automatically when the order is confirmed. No GST is charged at sale — GST applies when the card is redeemed.
          </div>
        </div>

        <div className="px-5 py-3 flex justify-end gap-2"
          style={{ borderTop: `1px solid ${POS_T.outlineVariant}`, background: POS_T.surfaceContainerLow }}>
          <button onClick={onClose} className="text-sm font-bold px-4 py-2.5 rounded-full"
            style={{ border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>Cancel</button>
          <button onClick={add} disabled={!ready}
            className="text-sm font-bold px-5 py-2.5 rounded-full inline-flex items-center gap-1.5"
            style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary, opacity: ready ? 1 : 0.4 }}>
            <MIcon name="add_shopping_cart" size={16} />
            Add to cart
          </button>
        </div>
      </div>
    </div>
  )
}

const Lbl = ({ children }) => (
  <div className="text-[10px] font-bold tracking-[0.1em] uppercase mb-1" style={{ color: POS_T.onSurfaceVariant }}>{children}</div>
)
const Two = ({ children }) => <div className="grid sm:grid-cols-2 gap-2.5">{children}</div>
const In = ({ label, v, onChange, placeholder }) => (
  <div>
    <Lbl>{label}</Lbl>
    <input type="text" value={v || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full text-sm px-3 py-2 rounded outline-none"
      style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
  </div>
)
const Sel = ({ label, v, onChange, opts }) => (
  <div>
    <Lbl>{label}</Lbl>
    <select value={v} onChange={e => onChange(e.target.value)}
      className="w-full text-sm px-3 py-2 rounded outline-none"
      style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
      {opts.map(o => <option key={o.k} value={o.k}>{o.label}</option>)}
    </select>
  </div>
)

export default SellGiftCardModal

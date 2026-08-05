import React, { useState } from 'react'
import { toast } from '../../lib/designTokens'
import { logAndToast } from '../../lib/logger'
import { POS_STEPS, POS_STEP_LABELS } from './constants'
import { POS_T, MIcon } from './tokens'
import StepIndicator from './StepIndicator'
import CustomerLookup from './CustomerLookup'
import ProductPicker from './ProductPicker'
import Cart from './Cart'
import ReviewStep from './ReviewStep'
import PaymentSplitModal from './PaymentSplitModal'
import { newTempId, cartTotals } from './cartHelpers'
import { createPosOrder, savePosPayments } from './orderActions'
import ShareReceiptModal from './ShareReceiptModal'
import { supa } from '../../lib/supabase'
import { randomShareToken } from './quotationActions'
import { recordPromoRedemption } from './promoCodeActions'
import { issueGiftCard } from './giftCardActions'
import { useLoyaltyTiers, loyaltyOptsFor } from './useLoyaltyTiers'
import { earnLoyaltyPoints, redeemLoyaltyPoints, getLoyaltyBalance } from './loyaltyPointsActions'

const POSNewOrder = ({ stitchingMaster = [], stylist, store, mode, products, teamMembers, stores = [], onChangeStore }) => {
  const [step, setStep] = useState('customer')
  const [customer, setCustomer] = useState(null)
  const [orderMeta, setOrderMeta] = useState({})
  const [leadId, setLeadId] = useState(null)
  const [cart, setCart] = useState([])
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [success, setSuccess] = useState(null)
  const [shareTarget, setShareTarget] = useState(null)  // { order, customer } for ShareReceiptModal
  const [orderDiscount, setOrderDiscount] = useState({ type: 'none', value: 0, reason: '' })
  const [coupon, setCoupon] = useState(null)
  const { tiers: loyaltyTiers } = useLoyaltyTiers()
  const loyalty = customer ? loyaltyOptsFor(loyaltyTiers, customer.customer_type || 'standard') : null
  const [loyaltyBal, setLoyaltyBal] = useState(0)
  React.useEffect(() => {
    const seed = (typeof window !== 'undefined' && window._posLeadSeed) || null
    if (!seed?.lead) return
    window._posLeadSeed = null
    const lead = seed.lead
    ;(async () => {
      try {
        // 1) Resolve a customer for this lead's phone (or create one).
        const phone = String(lead.phone || '').replace(/[^\d+]/g, '')
        let cust = null
        if (phone) {
          const { data } = await supa.from('customers').select('id, name, phone, email').eq('phone', phone).maybeSingle()
          if (data) cust = { customer_id: data.id, id: data.id, name: data.name, phone: data.phone, email: data.email }
        }
        if (!cust) {
          // Inline customer for the wizard; ensureCustomer will create on save.
          cust = {
            name:  lead.client_name || '',
            phone: phone || (lead.phone || ''),
            email: lead.email || '',
          }
        }
        setCustomer(cust)

        // 2) Pre-fill orderMeta from the lead.
        const ch = lead.channel === 'Online Assist' ? 'Online Assist' : (lead.channel === 'In-store' ? 'In-store' : null)
        setOrderMeta(m => ({
          ...m,
          channel:     ch || m.channel || null,
          lead_source: lead.lead_source || m.lead_source || '',
          occasion:    lead.occasion    || m.occasion    || '',
          event_date:  lead.occasion_date || m.event_date || '',
        }))
        setLeadId(lead.id)
        setStep('products')  // skip customer search — we have everything
        toast(true, `Starting order from lead · ${lead.client_name || 'Lead'}`)
      } catch (e) {
        console.error('Lead seed failed:', e)
      }
    })()
  }, [])
    React.useEffect(() => { if (customer?.customer_id || customer?.id) { getLoyaltyBalance(customer.customer_id || customer.id).then(setLoyaltyBal) } else { setLoyaltyBal(0) } }, [customer?.customer_id, customer?.id])
  // All stylists can apply discounts — no per-user gate (May 2026, Sahith).
  // Cap enforcement (discount_cap_pct / discount_cap_amount) lives on the
  // record but is not enforced here yet; revisit if caps need to be active.
  const canDiscount = true

  const addToCart = (item) => {
    setCart(prev => [...prev, { tempId: newTempId(), ...item }])
    toast(true, 'Added to cart')
  }
  const removeLine = (tempId) => setCart(prev => prev.filter(l => l.tempId !== tempId))
  const updateLine = (tempId, patch) => setCart(prev => prev.map(l => l.tempId === tempId ? { ...l, ...patch } : l))

  const reset = () => {
    setStep('customer'); setCustomer(null); setOrderMeta({}); setLeadId(null); setCart([]); setSuccess(null); setPaymentOpen(false); setShareTarget(null)
  }

  const onCollectPayment = async ({ collected, splits, isPartial }) => {
    try {
      const totals = cartTotals(cart, { orderDiscount: orderDiscount?.type === 'none' ? null : orderDiscount, coupon, loyalty })
      const result = await createPosOrder({
        customer, orderMeta, cart, stylist, store, mode, leadId,
        orderDiscount: orderDiscount?.type === 'none' ? null : orderDiscount,
        coupon, appliedDiscounts: totals.appliedDiscounts,
      })
      const summary = await savePosPayments(result.orderId, result.total, splits, { stylist, isPartial, paymentType: 'initial' })
      if (coupon?.id && totals.couponDiscount > 0) {
        await recordPromoRedemption({ promo: coupon, orderId: result.orderId, customer, amount: totals.couponDiscount, actingUser: stylist })
      }
      // Redeem loyalty points (one row per loyalty_points split)
      const customerIdForLoyalty = customer?.customer_id || customer?.id || null
      for (const sp of splits) {
        if (sp.method !== 'loyalty_points' || !customerIdForLoyalty) continue
        try {
          await redeemLoyaltyPoints({ customerId: customerIdForLoyalty, orderId: result.orderId, points: Number(sp.amount), actor: stylist?.name })
        } catch (e) {
          toast(false, 'Loyalty redemption failed: ' + (e.message || e))
        }
      }
      // Earn points on the post-discount sale total (idempotent per order_id)
      if (customerIdForLoyalty) {
        try {
          const earned = await earnLoyaltyPoints({ customerId: customerIdForLoyalty, orderId: result.orderId, spend: totals.saleTotal, actor: stylist?.name })
          if (earned > 0) toast(true, `+${earned} loyalty points`)
        } catch (_) {}
      }
      // Issue gift cards for any gift_card line items in the cart
      const issuedCards = []
      for (const li of cart) {
        if (li.type !== 'gift_card') continue
        try {
          const meta = li.gift_card_meta || {}
          const card = await issueGiftCard({
            amount: Number(li.mrp || 0),
            recipient: { name: meta.name, phone: meta.phone, email: meta.email, message: meta.message },
            expiresAt: meta.expires_at || null,
            pin: meta.pin || null,
            purchaserCustomerId: result.buyerCustomerId || result.customerId || null,
            purchaseOrderId: result.orderId,
            actor: stylist?.name || null,
          })
          issuedCards.push(card)
        } catch (e) {
          console.error('Failed to issue gift card:', e)
          toast(false, 'Order saved but gift card issuance failed — check Gift Cards master')
        }
      }
      toast(true, 'Order created — payment recorded')
      setSuccess({ ...result, ...summary, issuedGiftCards: issuedCards })
      setPaymentOpen(false)
    } catch (e) {
      logAndToast('pos-create-order', 'Failed to create order: ' + (e.message || e), e)
    }
  }

  const openShareInvoice = async () => {
    if (!success?.orderId) return
    try {
      // Pull the full order row so we have share_token, totals, etc.
      let { data: orderRow } = await supa.from('shopify_orders').select('*').eq('id', success.orderId).single()
      // Ensure a share_token exists so the customer-facing /r/<token> URL works
      if (orderRow && !orderRow.share_token) {
        const token = randomShareToken()
        const { error } = await supa.from('shopify_orders').update({ share_token: token }).eq('id', orderRow.id)
        if (!error) orderRow = { ...orderRow, share_token: token }
      }
      const customerId = success.buyerCustomerId || success.customerId
      const { data: custRow } = customerId
        ? await supa.from('customers').select('id, name, phone, email').eq('id', customerId).single()
        : { data: null }
      setShareTarget({ order: orderRow, customer: custRow })
    } catch (e) {
      logAndToast('share-invoice', 'Could not open share dialog: ' + (e.message || e), e)
    }
  }

  if (success) {
    return (
      <div className="max-w-xl mx-auto py-10 sm:py-16 text-center px-4">
        <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-5"
          style={{ background: POS_T.successContainer }}>
          <MIcon name="check_circle" fill size={48} style={{ color: POS_T.success }} />
        </div>
        <h1 className="font-bold mb-1 tracking-tight" style={{ color: POS_T.onSurface, fontSize: 'clamp(22px, 4vw, 32px)' }}>
          Order created
        </h1>
        <div className="text-base font-mono mb-2" style={{ color: POS_T.primary }}>{success.orderNumber}</div>
        <div className="text-sm mb-6" style={{ color: POS_T.onSurfaceVariant }}>
          Total ₹{success.total.toLocaleString('en-IN')} · Collected ₹{Number(success.collected).toLocaleString('en-IN')}
          {success.balance > 0.01 ? ` · Balance ₹${success.balance.toLocaleString('en-IN')}` : ''}
        </div>
        {success.issuedGiftCards && success.issuedGiftCards.length > 0 && (
          <div className="max-w-sm mx-auto mb-6 rounded-xl p-3 text-left"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
            <div className="text-[10px] font-bold tracking-[0.1em] uppercase mb-2" style={{ color: POS_T.onSurfaceVariant }}>
              Gift cards issued ({success.issuedGiftCards.length})
            </div>
            {success.issuedGiftCards.map(g => (
              <div key={g.id} className="text-xs mb-1.5 last:mb-0 flex items-center justify-between gap-2">
                <div className="font-mono tracking-wider" style={{ color: POS_T.onSurface }}>{g.code}</div>
                <div className="font-mono" style={{ color: POS_T.onSurfaceVariant }}>PIN <span className="font-bold" style={{ color: POS_T.onSurface }}>{g.pin}</span></div>
                <div className="font-mono font-bold" style={{ color: POS_T.primary }}>₹{Number(g.balance).toLocaleString('en-IN')}</div>
              </div>
            ))}
            <div className="text-[10px] mt-2" style={{ color: POS_T.onSurfaceVariant }}>
              Share the code + PIN with the recipient.
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={openShareInvoice}
            className="text-sm font-bold px-5 py-3 rounded-full inline-flex items-center gap-2"
            style={{ background: POS_T.success || '#16a34a', color: '#fff' }}>
            <MIcon name="share" size={18} />
            Share invoice
          </button>
          <button onClick={reset}
            className="text-sm font-bold px-5 py-3 rounded-full inline-flex items-center gap-2"
            style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>
            <MIcon name="add_shopping_cart" size={18} />
            Start a new order
          </button>
        </div>
        {shareTarget?.order && (
          <ShareReceiptModal
            order={shareTarget.order}
            customer={shareTarget.customer}
            onClose={() => setShareTarget(null)}
          />
        )}
      </div>
    )
  }

  const steps = POS_STEPS.map(s => ({ key: s, label: POS_STEP_LABELS[s] }))

  return (
    <div>
      <StepIndicator steps={steps} current={step} onJump={setStep} />

      {step === 'customer' && (
        <CustomerLookup
          stylist={stylist} store={store} mode={mode} stores={stores} onChangeStore={onChangeStore}
          customer={customer} orderMeta={orderMeta}
          onChangeCustomer={setCustomer}
          onChangeOrderMeta={setOrderMeta}
          onContinue={() => setStep('products')}
        />
      )}

      {step === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 sm:gap-5">
          <ProductPicker products={products} onAdd={addToCart} stitchingMaster={stitchingMaster} />
          <div className="lg:sticky lg:top-[180px] lg:self-start">
            <Cart cart={cart} onRemove={removeLine} onUpdate={updateLine} onContinue={() => setStep('review')} onBack={() => setStep('customer')} />
          </div>
        </div>
      )}

      {step === 'review' && (
        <ReviewStep
          cart={cart}
          onUpdateLine={updateLine}
          onRemoveLine={removeLine}
          onBack={() => setStep('products')}
          onContinue={() => setPaymentOpen(true)}
          canDiscount={canDiscount}
          orderDiscount={orderDiscount}
          setOrderDiscount={setOrderDiscount}
          coupon={coupon}
          setCoupon={setCoupon}
          loyalty={loyalty}
          customer={customer}
          channel={orderMeta.channel || 'In-store'}
        />
      )}

      {paymentOpen && (
        <PaymentSplitModal
          total={cartTotals(cart, { orderDiscount: orderDiscount?.type === 'none' ? null : orderDiscount, coupon, loyalty }).saleTotal}
          title="Collect Payment"
          loyaltyBalance={loyaltyBal}
          customer={customer}
          onConfirm={onCollectPayment}
          onCancel={() => setPaymentOpen(false)}
        />
      )}
    </div>
  )
}

export default POSNewOrder

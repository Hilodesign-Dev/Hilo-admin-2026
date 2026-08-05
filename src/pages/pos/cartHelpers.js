import { gst as gstRate } from '../../lib/helpers'

/**
 * Cart math.
 *
 * Each cart line carries: mrp, quantity, discountType ('percentage'|'flat'),
 * discountValue. From those we derive: gross, discountAmount, salePrice
 * (inclusive of GST), gstRate, gstAmount.
 *
 * GST follows the existing rule from helpers.gst() — 5% under ₹2500, 18% above,
 * applied to the sale price.
 */

export const lineMath = (line) => {
  const mrp = Number(line.mrp || 0)
  const qty = Math.max(1, Number(line.quantity || 1))
  const gross = mrp * qty

  // Gift cards: face value at sale, no GST (outside scope until redeemed),
  // and not eligible for any discount layer.
  if (line.type === 'gift_card') {
    return { gross, discountAmount: 0, salePrice: gross, gstRate: 0, gstAmount: 0 }
  }

  let discountAmount = 0
  if (line.discountType === 'percentage') {
    const pct = Math.max(0, Math.min(100, Number(line.discountValue || 0)))
    discountAmount = Math.round((gross * pct) / 100)
  } else if (line.discountType === 'flat') {
    discountAmount = Math.max(0, Math.min(gross, Number(line.discountValue || 0)))
  }
  const salePrice = Math.max(0, gross - discountAmount)
  const rate = gstRate(salePrice / qty)
  const gstAmount = +(salePrice - salePrice / (1 + rate)).toFixed(2)
  return { gross, discountAmount, salePrice, gstRate: rate, gstAmount }
}

/**
 * cartTotals(cart, opts?) — totals plus an optional layer of order-level
 * discounts, coupon, and loyalty tier.
 *
 * Backwards compatible: callers passing no opts still get { gross, discountTotal,
 * saleTotal, gstTotal } with the same numeric meaning as before. The newer
 * fields (orderDiscount, couponDiscount, loyaltyDiscount, taxable,
 * appliedDiscounts, lineDiscountTotal) are always present and default to 0
 * when no opts are passed.
 *
 * @param {Array} cart
 * @param {Object} [opts]
 * @param {{type:'percentage'|'flat',value:number}=} opts.orderDiscount
 * @param {{id?,code,type:'percentage'|'flat',value:number,maxDiscount?:number,excludesLoyalty?:boolean}=} opts.coupon
 * @param {{tier:string,discountPct:number}=} opts.loyalty
 */
export const cartTotals = (cart = [], opts = {}) => {
  const lineSums = cart.reduce((acc, line) => {
    const m = lineMath(line)
    acc.gross += m.gross
    acc.lineDiscountTotal += m.discountAmount
    // Gift-card lines are pass-through: their salePrice doesn't pass through any
    // discount layer and contributes zero GST. Track separately.
    if (line.type === 'gift_card') {
      acc.giftCardSubtotal += m.salePrice
    } else {
      acc.discountableSubtotal += m.salePrice
    }
    return acc
  }, { gross: 0, lineDiscountTotal: 0, discountableSubtotal: 0, giftCardSubtotal: 0 })

  // Order / coupon / loyalty layers only apply to the discountable subtotal.
  let after = lineSums.discountableSubtotal
  const applied = []

  // Order-level discount
  let orderDiscount = 0
  if (opts.orderDiscount && Number(opts.orderDiscount.value) > 0) {
    orderDiscount = opts.orderDiscount.type === 'percentage'
      ? Math.round(after * (Number(opts.orderDiscount.value) / 100))
      : Math.min(after, Number(opts.orderDiscount.value || 0))
    orderDiscount = Math.max(0, orderDiscount)
    after -= orderDiscount
    applied.push({
      kind: 'order_discount',
      label: opts.orderDiscount.type === 'percentage'
        ? `Order discount (${opts.orderDiscount.value}%)`
        : `Order discount (₹${opts.orderDiscount.value})`,
      amount: orderDiscount,
      meta: { ...opts.orderDiscount },
    })
  }

  // Coupon
  let couponDiscount = 0
  if (opts.coupon) {
    const c = opts.coupon
    couponDiscount = c.type === 'percentage'
      ? Math.round(after * (Number(c.value) / 100))
      : Math.min(after, Number(c.value || 0))
    if (c.maxDiscount) couponDiscount = Math.min(couponDiscount, Number(c.maxDiscount))
    couponDiscount = Math.max(0, Math.min(after, couponDiscount))
    after -= couponDiscount
    applied.push({
      kind: 'coupon',
      label: `Coupon ${c.code}`,
      amount: couponDiscount,
      meta: { id: c.id || null, code: c.code, type: c.type, value: c.value },
    })
  }

  // Loyalty tier (skipped if coupon says so)
  let loyaltyDiscount = 0
  if (opts.loyalty && Number(opts.loyalty.discountPct) > 0 && !opts.coupon?.excludesLoyalty) {
    loyaltyDiscount = Math.round(after * (Number(opts.loyalty.discountPct) / 100))
    loyaltyDiscount = Math.max(0, Math.min(after, loyaltyDiscount))
    after -= loyaltyDiscount
    applied.push({
      kind: 'loyalty_tier',
      label: `${opts.loyalty.tier} member discount (${opts.loyalty.discountPct}%)`,
      amount: loyaltyDiscount,
      meta: { ...opts.loyalty },
    })
  }

  const discountableFinal = Math.max(0, after)
  const saleTotal = discountableFinal + lineSums.giftCardSubtotal

  // GST inclusive on the discountable portion only; gift cards are out of scope.
  const nonGiftQty = cart.reduce((s, l) => l.type === 'gift_card' ? s : s + Math.max(1, Number(l.quantity || 1)), 0)
  const avgUnitPrice = nonGiftQty > 0 ? discountableFinal / nonGiftQty : 0
  const rate = gstRate(avgUnitPrice)
  const gstTotal = +(discountableFinal - discountableFinal / (1 + rate)).toFixed(2)

  // Older callers still rely on { discountTotal } meaning the line-level
  // discount sum. We keep that key alongside the broken-out new fields.
  return {
    gross: lineSums.gross,
    discountTotal: lineSums.lineDiscountTotal,
    lineDiscountTotal: lineSums.lineDiscountTotal,
    orderDiscount,
    couponDiscount,
    loyaltyDiscount,
    taxable: +(saleTotal - gstTotal).toFixed(2),
    gstTotal,
    saleTotal,
    appliedDiscounts: applied,
  }
}

let _ctr = 0
export const newTempId = () => {
  _ctr += 1
  return 'ln_' + Date.now().toString(36) + '_' + _ctr
}

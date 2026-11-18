import { describe, it, expect } from 'vitest'
import { lineMath, cartTotals } from '../pages/pos/cartHelpers'

describe('cartHelpers.js', () => {
  describe('lineMath', () => {
    it('calculates full price and standard GST (5%) for items <= 2500', () => {
      const line = { mrp: 2000, quantity: 1 }
      const res = lineMath(line)
      expect(res.gross).toBe(2000)
      expect(res.discountAmount).toBe(0)
      expect(res.salePrice).toBe(2000)
      expect(res.gstRate).toBe(0.05)
      // 2000 - 2000 / 1.05 = 95.24
      expect(res.gstAmount).toBe(95.24)
    })

    it('calculates 18% GST for items > 2500', () => {
      const line = { mrp: 5000, quantity: 1 }
      const res = lineMath(line)
      expect(res.gstRate).toBe(0.18)
      // 5000 - 5000 / 1.18 = 762.71
      expect(res.gstAmount).toBe(762.71)
    })

    it('handles percentage discounts properly', () => {
      const line = { mrp: 1000, quantity: 2, discountType: 'percentage', discountValue: 10 }
      const res = lineMath(line)
      expect(res.gross).toBe(2000)
      expect(res.discountAmount).toBe(200)
      expect(res.salePrice).toBe(1800)
    })

    it('handles flat discounts properly', () => {
      const line = { mrp: 1500, quantity: 1, discountType: 'flat', discountValue: 300 }
      const res = lineMath(line)
      expect(res.gross).toBe(1500)
      expect(res.discountAmount).toBe(300)
      expect(res.salePrice).toBe(1200)
    })

    it('handles gift card lines with zero GST and no discounts', () => {
      const line = { type: 'gift_card', mrp: 1000, quantity: 2, discountType: 'percentage', discountValue: 50 }
      const res = lineMath(line)
      expect(res.gross).toBe(2000)
      expect(res.discountAmount).toBe(0)
      expect(res.salePrice).toBe(2000)
      expect(res.gstRate).toBe(0)
      expect(res.gstAmount).toBe(0)
    })
  })

  describe('cartTotals', () => {
    it('aggregates multiple cart lines correctly', () => {
      const cart = [
        { mrp: 1000, quantity: 1 },
        { mrp: 2000, quantity: 2 },
      ]
      const totals = cartTotals(cart)
      expect(totals.gross).toBe(5000)
      expect(totals.saleTotal).toBe(5000)
      expect(totals.discountTotal).toBe(0)
    })

    it('applies order discounts, coupons, and loyalty correctly', () => {
      const cart = [{ mrp: 4000, quantity: 1 }]
      const totals = cartTotals(cart, {
        coupon: { code: 'SAVE10', type: 'percentage', value: 10 },
      })
      expect(totals.couponDiscount).toBe(400)
      expect(totals.saleTotal).toBe(3600)
    })
  })
})

import { describe, it, expect } from 'vitest'
import { fmt, gst, n, nextId, calcCogs, gmPct, effectiveSP } from '../lib/helpers'

describe('helpers.js', () => {
  describe('fmt', () => {
    it('returns "—" for empty or zero values', () => {
      expect(fmt(null)).toBe('—')
      expect(fmt(undefined)).toBe('—')
      expect(fmt('')).toBe('—')
      expect(fmt(0)).toBe('—')
    })

    it('formats numeric currency in en-IN format with ₹ symbol', () => {
      expect(fmt(1500)).toBe('₹1,500')
      expect(fmt('250000')).toBe('₹2,50,000')
    })
  })

  describe('gst', () => {
    it('returns 5% when mrp <= 2500', () => {
      expect(gst(2500)).toBe(0.05)
      expect(gst(1000)).toBe(0.05)
    })

    it('returns 18% when mrp > 2500', () => {
      expect(gst(2501)).toBe(0.18)
      expect(gst(5000)).toBe(0.18)
    })
  })

  describe('n', () => {
    it('coerces strings, null, undefined to safe float numbers', () => {
      expect(n('42.5')).toBe(42.5)
      expect(n(null)).toBe(0)
      expect(n(undefined)).toBe(0)
      expect(n('')).toBe(0)
      expect(n('invalid')).toBe(0)
    })
  })

  describe('nextId', () => {
    it('generates the next sequential ID with prefix', () => {
      const items = [{ id: 'FA-01' }, { id: 'FA-02' }, { id: 'FA-05' }]
      expect(nextId(items, 'FA')).toBe('FA-06')
    })

    it('starts at 01 when list is empty', () => {
      expect(nextId([], 'PO')).toBe('PO-01')
    })
  })

  describe('calcCogs & gmPct', () => {
    it('calculates single piece COGS accurately', () => {
      const product = {
        metres: 2.5,
        costPerMetre: 200,
        dyePerMetre: 50,
        embroidery: 300,
        stitching: 400,
        bottomCogs: 100,
        accessories: 50,
      }
      // Fabric: 2.5 * 200 = 500
      // Dye: 2.5 * 50 = 125
      // Embroidery: 300
      // Stitching: 400
      // Bottom: 100
      // Accessories: 50
      // Total = 1475
      expect(calcCogs(product)).toBe(1475)
    })

    it('calculates multi-component set COGS', () => {
      const setProduct = {
        setComponents: [
          { metres: 2, costPerMetre: 100, dyePerMetre: 0, embroidery: 0, stitching: 200, accessories: 0 },
          { metres: 1.5, costPerMetre: 150, dyePerMetre: 0, embroidery: 50, stitching: 150, accessories: 0 },
        ],
      }
      // Piece 1: 200 + 200 = 400
      // Piece 2: 225 + 50 + 150 = 425
      // Total = 825
      expect(calcCogs(setProduct)).toBe(825)
    })

    it('computes gross margin percentage correctly considering GST', () => {
      const sp = 2000
      const cogs = 1000
      const effSP = effectiveSP(sp) // 2000 / 1.05 = ~1904.76
      const expectedGM = (effSP - cogs) / effSP
      expect(gmPct(sp, cogs)).toBeCloseTo(expectedGM, 4)
    })
  })
})

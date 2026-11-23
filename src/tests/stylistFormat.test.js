import { describe, it, expect } from 'vitest'
import { formatWait, formatTime, rupee, formatLastMessageDate } from '../pages/stylist/stylistFormat'

describe('stylistFormat.js', () => {
  describe('formatWait', () => {
    it('formats seconds correctly', () => {
      expect(formatWait(45)).toBe('45s')
      expect(formatWait(60)).toBe('1m')
      expect(formatWait(125)).toBe('2m')
      expect(formatWait(3600)).toBe('1h')
      expect(formatWait(3660)).toBe('1h 1m')
    })
  })

  describe('rupee', () => {
    it('formats numbers with rupee symbol and Indian number system', () => {
      expect(rupee(5000)).toMatch(/₹\s?5,000/)
      expect(rupee(null)).toBe('')
      expect(rupee('')).toBe('')
    })
  })

  describe('formatTime', () => {
    it('returns empty string for falsy/invalid dates', () => {
      expect(formatTime(null)).toBe('')
      expect(formatTime('invalid')).toBe('')
    })

    it('formats valid ISO time', () => {
      const res = formatTime('2026-05-10T14:30:00.000Z')
      expect(res).toBeTruthy()
    })
  })

  describe('formatLastMessageDate', () => {
    it('handles today timestamps with Today prefix', () => {
      const now = new Date().toISOString()
      expect(formatLastMessageDate(now)).toContain('Today ·')
    })
  })
})

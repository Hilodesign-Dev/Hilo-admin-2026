import { describe, it, expect } from 'vitest'
import { normalizeSyncRun, API_URL } from '../lib/api'

describe('api.js', () => {
  it('has a default or environment configured API_URL without trailing slash', () => {
    expect(API_URL).toBeTruthy()
    expect(API_URL.endsWith('/')).toBe(false)
  })

  describe('normalizeSyncRun', () => {
    it('returns null if input run is null or undefined', () => {
      expect(normalizeSyncRun(null)).toBeNull()
      expect(normalizeSyncRun(undefined)).toBeNull()
    })

    it('normalizes camelCase sync run fields to snake_case', () => {
      const raw = {
        id: '123',
        syncType: 'catalogue',
        status: 'success',
        source: 'manual',
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:01:00.000Z',
        recordsUpserted: 45,
        recordsFailed: 0,
        message: 'Synced 45 items',
      }
      const norm = normalizeSyncRun(raw)
      expect(norm.id).toBe('123')
      expect(norm.sync_type).toBe('catalogue')
      expect(norm.status).toBe('success')
      expect(norm.source).toBe('manual')
      expect(norm.records_upserted).toBe(45)
      expect(norm.records_failed).toBe(0)
      expect(norm.message).toBe('Synced 45 items')
    })
  })
})

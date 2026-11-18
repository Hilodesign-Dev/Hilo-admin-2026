import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supa } from '../lib/supabase'
import { waMarketingApi } from '../lib/waMarketingApi'
import { pushMarketingApi, sendPushNotification, broadcastMarketingPush } from '../lib/notificationsApi'

describe('Marketing and Notifications APIs', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(supa.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'mock_staff_jwt' } },
    })
  })

  describe('pushMarketingApi & helpers', () => {
    it('sends targeted push notification with correct payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { messageId: 'msg_123' } }),
      })
      global.fetch = mockFetch

      const res = await sendPushNotification({
        userId: 'user_abc',
        category: 'order_update',
        title: 'Order Shipped',
        body: 'Your custom kurta has shipped!',
        route: '/orders/123',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const call = mockFetch.mock.calls[0]
      expect(call[0]).toContain('/notifications/send')
      const body = JSON.parse(call[1].body)
      expect(body.userId).toBe('user_abc')
      expect(body.title).toBe('Order Shipped')
      expect(res.messageId).toBe('msg_123')
    })

    it('broadcasts marketing push to specified topic', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { broadcastId: 'bcast_1' } }),
      })
      global.fetch = mockFetch

      const res = await broadcastMarketingPush({
        title: 'Diwali Special',
        body: 'New festive collection live!',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const call = mockFetch.mock.calls[0]
      expect(call[0]).toContain('/notifications/broadcast')
      const body = JSON.parse(call[1].body)
      expect(body.topic).toBe('offers_and_new_collections')
      expect(res.broadcastId).toBe('bcast_1')
    })

    it('queries devices with search and location filters', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { devices: [], total: 0 } }),
      })
      global.fetch = mockFetch

      await pushMarketingApi.queryDevices({
        city: 'Hyderabad',
        platform: 'android',
        search: 'Rahul',
        page: 1,
        limit: 25,
      })

      const call = mockFetch.mock.calls[0]
      expect(call[0]).toContain('/notifications/marketing/devices')
      expect(call[0]).toContain('city=Hyderabad')
      expect(call[0]).toContain('platform=android')
      expect(call[0]).toContain('search=Rahul')
    })
  })

  describe('waMarketingApi', () => {
    it('constructs query params correctly for recipients query', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { recipients: [], total: 0 } }),
      })
      global.fetch = mockFetch

      await waMarketingApi.queryRecipients({
        source: 'walkins',
        search: '9876543210',
        page: 1,
        limit: 50,
      })

      const call = mockFetch.mock.calls[0]
      expect(call[0]).toContain('/wa/marketing/recipients/query')
      expect(call[0]).toContain('source=walkins')
      expect(call[0]).toContain('search=9876543210')
      expect(call[0]).toContain('limit=50')
    })
  })
})

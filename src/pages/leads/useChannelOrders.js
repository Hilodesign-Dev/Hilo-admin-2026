/* Orders-by-channel = source of truth for a dashboard's conversions + revenue.
   Reads shopify_orders (POS/Online-assist/etc) directly, NOT the leads table. */
import { useState, useEffect } from 'react'
import { supa } from '../../lib/supabase'

export function useChannelOrders(channel, dateStart, dateEnd) {
  const [data, setData] = useState({ count: 0, revenue: 0, todayCount: 0, todayRevenue: 0, loading: true })
  useEffect(() => {
    if (!channel || !dateStart || !dateEnd) { setData(d => ({ ...d, loading: false })); return }
    let cancelled = false
    ;(async () => {
      setData(d => ({ ...d, loading: true }))
      const today = new Date().toISOString().slice(0, 10)
      let rows = [], from = 0
      while (true) {
        const { data: page, error } = await supa.from('shopify_orders')
          .select('total_price, created_at, is_returned, cancelled_at')
          .eq('channel', channel)
          .gte('created_at', dateStart + 'T00:00:00')
          .lte('created_at', dateEnd + 'T23:59:59')
          .range(from, from + 999)
        if (error) break
        rows = rows.concat(page || [])
        if (!page || page.length < 1000) break
        from += 1000
      }
      const valid = rows.filter(o => !o.is_returned && !o.cancelled_at)
      let count = 0, revenue = 0, todayCount = 0, todayRevenue = 0
      for (const o of valid) {
        const v = Number(o.total_price) || 0
        count++; revenue += v
        if ((o.created_at || '').slice(0, 10) === today) { todayCount++; todayRevenue += v }
      }
      if (!cancelled) setData({ count, revenue, todayCount, todayRevenue, loading: false })
    })()
    return () => { cancelled = true }
  }, [channel, dateStart, dateEnd])
  return data
}

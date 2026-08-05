import { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'

// Module cache of marketplace discount config (id -> {discount, tol, name}).
let _cache = null, _loading = null
const _subs = new Set()
function ensure() {
  if (_cache) return
  if (!_loading) {
    _loading = supa.from('marketplaces').select('id, discount_pct, discrepancy_tolerance_pct, name, discount_tiers')
      .then(({ data }) => {
        _cache = {}
        ;(data || []).forEach(m => { _cache[m.id] = { discount: m.discount_pct, tol: m.discrepancy_tolerance_pct ?? 1, name: m.name, tiers: Array.isArray(m.discount_tiers) ? m.discount_tiers : null } })
        _subs.forEach(fn => fn())
      })
  }
}
export function useMpConfig() {
  const [, force] = useState(0)
  useEffect(() => { const fn = () => force(x => x + 1); _subs.add(fn); ensure(); return () => _subs.delete(fn) }, [])
  return _cache || {}
}

// Compute marketplace amount + discrepancy for an order given the config map.
function tierDiscount(cfg, gross) {
  if (cfg?.tiers && cfg.tiers.length) {
    const t = [...cfg.tiers].sort((a, b) => (Number(b.min_amount)||0) - (Number(a.min_amount)||0))
      .find(x => gross >= (Number(x.min_amount) || 0))
    if (t) return Number(t.pct)
  }
  return cfg?.discount != null ? Number(cfg.discount) : null
}

export function mpAmount(order, cfgMap) {
  const gross = Number(order.total_price) || 0            // MRP / gross
  const net = Number(order.marketplace_net_amount) || 0   // entered invoice value
  const effOff = gross > 0 && net > 0 ? Math.round((1 - net / gross) * 100) : null
  const cfg = cfgMap?.[order.marketplace_id]
  const expectedOff = cfg ? tierDiscount(cfg, gross) : null
  const tol = cfg?.tol ?? 1
  const flag = expectedOff != null && effOff != null && Math.abs(effOff - expectedOff) > tol
  return { gross, net, effOff, expectedOff, flag, ref: order.marketplace_order_ref, mpName: order.marketplace_name }
}

import { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'

/**
 * usePaymentMethods — DB-backed payment methods, replacing the hardcoded
 * PAYMENT_METHODS constant.
 *
 * Module-level cache with a 60s TTL. The cache is shared across every
 * caller (PaymentSplitModal, POSDues, Masters) so flipping a method's
 * is_active in the master propagates everywhere within a minute.
 *
 *   const { methods, byKey, loading, refresh } = usePaymentMethods()
 *   const { methods } = usePaymentMethods({ activeOnly: false })   // for ledger filters that
 *                                                                  // need to render legacy methods
 */
let _cached = null
let _cachedAll = null
let _cacheAt = 0
const TTL_MS = 60 * 1000

export const usePaymentMethods = (opts = { activeOnly: true }) => {
  const all = !opts.activeOnly
  const initial = all ? _cachedAll : _cached
  const [methods, setMethods] = useState(initial || [])
  const [loading, setLoading] = useState(!initial)
  const [bump, setBump] = useState(0)

  useEffect(() => {
    let cancelled = false
    const stale = Date.now() - _cacheAt > TTL_MS
    if (initial && !stale && bump === 0) { setLoading(false); return }
    ;(async () => {
      let q = supa.from('payment_methods').select('*').order('sort_order')
      if (opts.activeOnly) q = q.eq('is_active', true)
      const { data, error } = await q
      if (cancelled) return
      const list = data || []
      if (opts.activeOnly) _cached = list
      else _cachedAll = list
      _cacheAt = Date.now()
      setMethods(list)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [bump]) // eslint-disable-line react-hooks/exhaustive-deps

  const byKey = methods.reduce((acc, m) => { acc[m.key] = m; return acc }, {})
  const refresh = () => { _cached = null; _cachedAll = null; _cacheAt = 0; setBump(b => b + 1) }
  return { methods, byKey, loading, refresh }
}

/** Lookup a method label even if it's been deactivated. Falls back to the key. */
export const labelForMethod = (key, byKey) => byKey?.[key]?.label || key

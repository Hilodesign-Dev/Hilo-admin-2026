import { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'

/**
 * Subscribe to the active stores list.
 *   stores       — array of { id, code, name, state, state_code, gstin,
 *                              invoice_prefix, is_online, is_active }
 *   loading      — true until first fetch resolves
 *   reload()     — re-fetch on demand (after Masters edits)
 */
export const useStores = (opts = { activeOnly: true }) => {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    let q = supa.from('stores')
      .select('id, code, name, state, state_code, gstin, invoice_prefix, is_online, is_active, location_type, channel_id')
      .order('is_online', { ascending: true })
      .order('name', { ascending: true })
      // POS pickers include store + online types; offices / warehouses are filtered out.
      .in('location_type', ['store','online'])
    if (opts.activeOnly) q = q.eq('is_active', true)
    q.then(({ data, error }) => {
      if (cancelled) return
      if (error) console.warn('[HILO] stores:', error.message)
      setStores(data || [])
      setLoading(false)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, opts.activeOnly])

  return { stores, loading, reload: () => setTick(t => t + 1) }
}

/** Resolve a single store by id (or null). Returns the store object once loaded. */
export const useStore = (id) => {
  const { stores } = useStores({ activeOnly: false })
  return stores.find(s => s.id === id) || null
}

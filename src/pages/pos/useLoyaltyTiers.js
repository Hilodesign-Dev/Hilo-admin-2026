import { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'

/**
 * Read all loyalty tiers from the DB once and expose them as both a sorted
 * array and a by-key map. Falls back to a single hardcoded 'standard' row
 * if the table is empty or RLS blocks the fetch — so the rest of the app
 * never crashes on a missing tier.
 */
const FALLBACK = [
  { key: 'standard', label: 'Standard', badge_icon: '·', color: '#6b7280', bg_color: 'rgba(107,114,128,0.08)', discount_pct: 0, points_multiplier: 1.0, sort_order: 0, is_active: true },
]

export const useLoyaltyTiers = () => {
  const [tiers, setTiers] = useState(FALLBACK)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supa.from('loyalty_tiers')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (cancelled) return
      if (error || !data || data.length === 0) {
        setError(error?.message || null)
        setTiers(FALLBACK)
      } else {
        setTiers(data)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const byKey = tiers.reduce((acc, t) => { acc[t.key] = t; return acc }, {})
  return { tiers, byKey, loading, error }
}

/** Pure helper used from non-React code. Caller passes the loaded list. */
export const loyaltyOptsFor = (tiers, customerTypeKey) => {
  const t = tiers.find(x => x.key === customerTypeKey)
  if (!t || !t.discount_pct || Number(t.discount_pct) <= 0) return null
  return { tier: t.label, discountPct: Number(t.discount_pct), key: t.key }
}

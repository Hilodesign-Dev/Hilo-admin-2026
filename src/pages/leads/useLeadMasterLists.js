/* ═══════════════════════════════════════════════════════════════════════════
   useLeadMasterLists — Shared hook to fetch lead master list values from DB
   Falls back to hardcoded constants if DB fetch fails.
   ═══════════════════════════════════════════════════════════════════════════ */
import { useState, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import {
  LEAD_CHANNELS, LEAD_SOURCES, OCCASIONS, PRODUCT_CATEGORIES,
  LOCATIONS, COUNTRIES, CALL_OUTCOMES, LOST_REASONS
} from './constants'

// Singleton cache so multiple components don't refetch
let _cache = null
let _fetching = false
let _listeners = []

const notifyListeners = (data) => {
  _listeners.forEach(fn => fn(data))
}

const fetchAll = async () => {
  if (_fetching) return
  _fetching = true
  try {
    const { data, error } = await supa
      .from('lead_master_lists')
      .select('category, value, sort_order, dial_code, parent_value')
      .order('sort_order')
    if (error) throw error

    const grouped = {}
    const countryCodes = {} // { 'India': '+91', ... }
    const locationsByCountry = {} // { 'India': ['Mumbai', 'Delhi', ...], ... }
    ;(data || []).forEach(row => {
      if (!grouped[row.category]) grouped[row.category] = []
      grouped[row.category].push(row.value)
      if (row.category === 'country' && row.dial_code) {
        countryCodes[row.value] = row.dial_code
      }
      if (row.category === 'location' && row.parent_value) {
        if (!locationsByCountry[row.parent_value]) locationsByCountry[row.parent_value] = []
        locationsByCountry[row.parent_value].push(row.value)
      }
    })

    // Default YTQ outcomes split into yet_to_connect and connected sub-phases
    const defaultYtqOutcomes = [...CALL_OUTCOMES.yet_to_connect, ...CALL_OUTCOMES.connected]
    const defaultQualifiedOutcomes = CALL_OUTCOMES.qualified

    _cache = {
      channels: grouped.channel?.length ? grouped.channel : LEAD_CHANNELS,
      lead_sources: grouped.lead_source?.length ? grouped.lead_source : LEAD_SOURCES,
      occasions: grouped.occasion?.length ? grouped.occasion : OCCASIONS,
      product_categories: grouped.product_category?.length ? grouped.product_category : PRODUCT_CATEGORIES,
      locations: grouped.location?.length ? grouped.location : LOCATIONS,
      countries: grouped.country?.length ? grouped.country : COUNTRIES,
      country_codes: Object.keys(countryCodes).length ? countryCodes : { 'India': '+91', 'United States': '+1', 'Australia': '+61' },
      locations_by_country: locationsByCountry,
      utm_sources: grouped.utm_source || [],
      utm_mediums: grouped.utm_medium || [],
      utm_campaigns: grouped.utm_campaign || [],
      utm_contents: grouped.utm_content || [],
      utm_terms: grouped.utm_term || [],
      ytq_call_outcomes: grouped.ytq_call_outcome?.length ? grouped.ytq_call_outcome : defaultYtqOutcomes,
      qualified_call_outcomes: grouped.qualified_call_outcome?.length ? grouped.qualified_call_outcome : defaultQualifiedOutcomes,
      lost_reasons: grouped.lost_reason?.length ? grouped.lost_reason : LOST_REASONS,
    }
    notifyListeners(_cache)
  } catch (err) {
    console.error('Failed to fetch lead master lists:', err)
    // Use hardcoded fallbacks
    _cache = {
      channels: LEAD_CHANNELS,
      lead_sources: LEAD_SOURCES,
      occasions: OCCASIONS,
      product_categories: PRODUCT_CATEGORIES,
      locations: LOCATIONS,
      countries: COUNTRIES,
      country_codes: { 'India': '+91', 'United States': '+1', 'Australia': '+61' },
      locations_by_country: {},
      utm_sources: [],
      utm_mediums: [],
      utm_campaigns: [],
      utm_contents: [],
      utm_terms: [],
      ytq_call_outcomes: [...CALL_OUTCOMES.yet_to_connect, ...CALL_OUTCOMES.connected],
      qualified_call_outcomes: CALL_OUTCOMES.qualified,
      lost_reasons: LOST_REASONS,
    }
    notifyListeners(_cache)
  } finally {
    _fetching = false
  }
}

export const invalidateLeadMasterLists = () => {
  _cache = null
  fetchAll()
}

export const useLeadMasterLists = () => {
  const [lists, setLists] = useState(_cache || {
    channels: LEAD_CHANNELS,
    lead_sources: LEAD_SOURCES,
    occasions: OCCASIONS,
    product_categories: PRODUCT_CATEGORIES,
    locations: LOCATIONS,
    countries: COUNTRIES,
    country_codes: { 'India': '+91', 'United States': '+1', 'Australia': '+61' },
    locations_by_country: {},
    utm_sources: [],
    utm_mediums: [],
    utm_campaigns: [],
    utm_contents: [],
    utm_terms: [],
    ytq_call_outcomes: [...CALL_OUTCOMES.yet_to_connect, ...CALL_OUTCOMES.connected],
    qualified_call_outcomes: CALL_OUTCOMES.qualified,
    lost_reasons: LOST_REASONS,
  })

  useEffect(() => {
    if (_cache) {
      setLists(_cache)
      return
    }

    const listener = (data) => setLists(data)
    _listeners.push(listener)
    fetchAll()

    return () => {
      _listeners = _listeners.filter(fn => fn !== listener)
    }
  }, [])

  // Also listen for cache updates (e.g. after invalidation)
  useEffect(() => {
    const listener = (data) => setLists(data)
    _listeners.push(listener)
    return () => {
      _listeners = _listeners.filter(fn => fn !== listener)
    }
  }, [])

  return lists
}

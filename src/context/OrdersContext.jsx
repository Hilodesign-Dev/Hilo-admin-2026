/**
 * OrdersContext — Shared order + line-item cache with Supabase real-time
 *
 * Provides:
 *   orders        – Map<orderId, order>   (all loaded orders)
 *   lineItems     – Map<orderId, LI[]>    (loaded line items, keyed by order)
 *   teamMembers   – team_members rows
 *   vendors       – active outsource_vendors rows
 *   loading       – initial load in progress
 *   refreshing    – Shopify sync in progress
 *
 *   fetchOrders(filter)  – query shopify_orders (returns { data, count })
 *   loadLineItems(id)    – lazy-load line items for one order (cached)
 *   batchLoadLineItems(ids) – bulk-load line items for multiple orders
 *   invalidateLineItems(id) – clear cache for one order (after edit)
 *   invalidateAll()      – clear all caches (after sync)
 *   syncFromShopify()    – trigger edge-function sync
 *   updateOrder(id, fields) – optimistic update + DB write
 *   updateLineItem(id, fields) – optimistic update + DB write
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supa, isMissingTableError } from '../lib/supabase'
import { toast } from '../lib/designTokens'

const OrdersCtx = createContext(null)

export const useOrders = () => {
  const ctx = useContext(OrdersCtx)
  if (!ctx) throw new Error('useOrders must be inside OrdersProvider')
  return ctx
}

export const OrdersProvider = ({ children }) => {
  // ── Shared caches ──────────────────────────────────────────
  const ordersCache = useRef({})        // { [orderId]: orderObj }
  const lineItemsCache = useRef({})     // { [orderId]: lineItemArr }
  const [teamMembers, setTeamMembers] = useState([])
  const [customersById, setCustomersById] = useState({})
  const [vendors, setVendors] = useState([])
  const [fabricVendors, setFabricVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  // Bump to force re-renders when cache changes
  const [rev, setRev] = useState(0)
  const bump = () => setRev(r => r + 1)

  // ── Load metadata once ──────────────────────────────────────
  useEffect(() => {
    const ignoreMissing = (label) => ({ data, error }) => {
      if (error) {
        // Empty/minimal test DBs won't have every table yet — don't hard-fail boot.
        console.warn(`[HILO] ${label}:`, error.message)
        return null
      }
      return data
    }
    Promise.all([
      supa.from('team_members').select('*').order('name')
        .then(ignoreMissing('team_members'))
        .then((data) => { if (data) setTeamMembers(data) }),
      supa.from('outsource_vendors').select('*').eq('active', true).order('name')
        .then(ignoreMissing('outsource_vendors'))
        .then((data) => { if (data) setVendors(data) }),
      supa.from('fabric_vendors').select('id, name').order('name')
        .then(ignoreMissing('fabric_vendors'))
        .then((data) => { if (data) setFabricVendors(data) }),
    ]).finally(() => setLoading(false))
  }, [])

  // ── Real-time subscription ─────────────────────────────────
  useEffect(() => {
    const channel = supa
      .channel('orders-ctx-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopify_orders' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          ordersCache.current[payload.new.id] = payload.new
          bump()
        } else if (payload.eventType === 'DELETE' && payload.old) {
          delete ordersCache.current[payload.old.id]
          bump()
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_line_items' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const li = payload.new
          const oid = li.order_id
          if (lineItemsCache.current[oid]) {
            const arr = lineItemsCache.current[oid]
            const idx = arr.findIndex(x => x.id === li.id)
            if (idx >= 0) arr[idx] = li
            else arr.push(li)
            lineItemsCache.current[oid] = [...arr]
            bump()
          }
        } else if (payload.eventType === 'DELETE' && payload.old) {
          const oid = payload.old.order_id
          if (lineItemsCache.current[oid]) {
            lineItemsCache.current[oid] = lineItemsCache.current[oid].filter(x => x.id !== payload.old.id)
            bump()
          }
        }
      })
      .subscribe()

    return () => { supa.removeChannel(channel) }
  }, [])

  // Whenever orders enter the cache, pull the customer rows we need
  // (phone + email lookup for OrderRow). Targeted by id list so we
  // never hit the 22k-row table in one shot. Re-runs on rev bump.
  useEffect(() => {
    const allOrders = Object.values(ordersCache.current)
    if (allOrders.length === 0) return
    const needed = []
    const seen = customersById
    for (const o of allOrders) {
      const id = o.buyer_customer_id || o.customer_id
      if (id && !seen[id] && !needed.includes(id)) needed.push(id)
    }
    if (needed.length === 0) return
    let cancelled = false
    ;(async () => {
      const next = {}
      const CHUNK = 200
      for (let i = 0; i < needed.length; i += CHUNK) {
        const chunk = needed.slice(i, i + CHUNK)
        const { data } = await supa.from('customers')
          .select('id, name, phone, email, buyer_id')
          .in('id', chunk)
        if (cancelled) return
        for (const c of (data || [])) next[c.id] = c
      }
      if (Object.keys(next).length === 0) return
      setCustomersById(prev => ({ ...prev, ...next }))
    })()
    return () => { cancelled = true }
  }, [rev]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core fetch: returns { data, count } and populates cache ─
  const fetchOrders = useCallback(async (queryBuilder) => {
    // queryBuilder is a function that receives supa and returns a supabase query
    // e.g. (s) => s.from('shopify_orders').select('*', {count:'exact'}).eq('order_status','pending')
    const { data, count, error } = await queryBuilder(supa)
    if (error) {
      if (isMissingTableError(error)) {
        console.warn('[HILO] shopify_orders missing — run supabase/dev-stubs-login.sql')
        return { data: [], count: 0 }
      }
      throw error
    }
    // Populate cache
    ;(data || []).forEach(o => { ordersCache.current[o.id] = o })
    bump()
    return { data: data || [], count: count || 0 }
  }, [])

  // ── Line items: lazy single ─────────────────────────────────
  const loadLineItems = useCallback(async (orderId) => {
    if (lineItemsCache.current[orderId]) return lineItemsCache.current[orderId]
    const { data } = await supa.from('order_line_items').select('*').eq('order_id', orderId).order('id')
    lineItemsCache.current[orderId] = data || []
    bump()
    return data || []
  }, [])

  // ── Line items: batch ───────────────────────────────────────
  const batchLoadLineItems = useCallback(async (orderIds) => {
    // Only fetch uncached
    const toFetch = orderIds.filter(id => !lineItemsCache.current[id])
    if (toFetch.length > 0) {
      const { data } = await supa.from('order_line_items').select('*').in('order_id', toFetch).order('id')
      const map = {}
      ;(data || []).forEach(li => {
        if (!map[li.order_id]) map[li.order_id] = []
        map[li.order_id].push(li)
      })
      // Fill cache (including empty arrays for orders with 0 items)
      toFetch.forEach(id => {
        lineItemsCache.current[id] = map[id] || []
      })
      bump()
    }
    // Return map
    const result = {}
    orderIds.forEach(id => { result[id] = lineItemsCache.current[id] || [] })
    return result
  }, [])

  // ── Cache accessors ─────────────────────────────────────────
  const getOrder = useCallback((id) => ordersCache.current[id], [rev]) // eslint-disable-line
  const getLineItems = useCallback((id) => lineItemsCache.current[id] || null, [rev]) // eslint-disable-line
  const getAllCachedOrders = useCallback(() => ordersCache.current, [rev]) // eslint-disable-line

  // ── Invalidation ────────────────────────────────────────────
  const invalidateLineItems = useCallback((orderId) => {
    delete lineItemsCache.current[orderId]
    bump()
  }, [])

  const invalidateAll = useCallback(() => {
    lineItemsCache.current = {}
    bump()
  }, [])

  // ── Optimistic updates ──────────────────────────────────────
  const updateOrder = useCallback(async (orderId, fields) => {
    // Optimistic
    if (ordersCache.current[orderId]) {
      ordersCache.current[orderId] = { ...ordersCache.current[orderId], ...fields }
      bump()
    }
    const { error } = await supa.from('shopify_orders').update(fields).eq('id', orderId)
    if (error) throw error
  }, [])

  const updateLineItem = useCallback(async (liId, fields) => {
    const { error } = await supa.from('order_line_items').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', liId)
    if (error) throw error
    // Update cache
    for (const oid of Object.keys(lineItemsCache.current)) {
      const arr = lineItemsCache.current[oid]
      const idx = arr.findIndex(x => x.id === liId)
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], ...fields }
        lineItemsCache.current[oid] = [...arr]
        bump()
        break
      }
    }
  }, [])

  // ── Shopify sync ────────────────────────────────────────────
  // Off by default on empty/test projects (no edge function → CORS noise).
  // Set VITE_ENABLE_SHOPIFY_SYNC=true in .env.local when the function exists.
  const shopifySyncEnabled = String(import.meta.env.VITE_ENABLE_SHOPIFY_SYNC || '').toLowerCase() === 'true'

  const syncFromShopify = useCallback(async (silent = false) => {
    if (!shopifySyncEnabled) {
      if (!silent) toast(false, 'Shopify sync disabled (set VITE_ENABLE_SHOPIFY_SYNC=true)')
      return
    }
    if (!silent) setRefreshing(true)
    try {
      var since = new Date()
      since.setDate(since.getDate() - 7)
      var sinceCursor = since.toISOString()
      var totalOrders = 0, totalItems = 0, batchNum = 0, maxBatches = 10

      while (batchNum < maxBatches) {
        batchNum++
        const { data, error } = await supa.functions.invoke('sync-orders', {
          body: { since: sinceCursor },
        })
        if (error) {
          if (!silent) toast(false, 'Sync failed: ' + (error.message || 'Unknown error'))
          break
        } else if (data?.skipped) {
          if (!silent) toast(true, 'Sync already in progress')
          break
        } else if (data?.success || data?.synced_orders > 0) {
          totalOrders += data.synced_orders || 0
          totalItems += data.synced_line_items || 0
          if (data.has_more && data.last_created_at) {
            sinceCursor = data.last_created_at
          } else {
            if (!silent) toast(true, `Synced ${totalOrders} orders · ${totalItems} items from Shopify`)
            invalidateAll()
            break
          }
        } else {
          if (!silent) toast(false, 'Sync error: ' + (data?.error || 'Failed'))
          break
        }
      }
      if (batchNum >= maxBatches && totalOrders > 0) {
        if (!silent) toast(true, `Synced ${totalOrders} orders (batch limit reached)`)
        invalidateAll()
      }
    } catch (e) {
      console.error('Sync error:', e)
      if (!silent) toast(false, 'Sync failed — check Shopify connection')
    } finally {
      if (!silent) setRefreshing(false)
    }
  }, [invalidateAll, shopifySyncEnabled])

  // ── Auto-sync on mount + interval ──────────────────────────
  const autoSyncRef = useRef(null)
  useEffect(() => {
    if (!shopifySyncEnabled) return
    syncFromShopify(true)
    autoSyncRef.current = setInterval(() => syncFromShopify(true), 30 * 60 * 1000)
    return () => { if (autoSyncRef.current) clearInterval(autoSyncRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    // Caches
    teamMembers, customersById,
    vendors,
    fabricVendors,
    loading,
    refreshing,
    rev, // for dependency tracking
    // Fetchers
    fetchOrders,
    loadLineItems,
    batchLoadLineItems,
    // Accessors
    getOrder,
    getLineItems,
    getAllCachedOrders,
    // Mutations
    updateOrder,
    updateLineItem,
    invalidateLineItems,
    invalidateAll,
    syncFromShopify,
    // Raw client for complex queries
    supa,
  }

  return <OrdersCtx.Provider value={value}>{children}</OrdersCtx.Provider>
}

export default OrdersCtx

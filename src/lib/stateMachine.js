/* ═══════════════════════════════════════════════════════════════════════════
   STATE MACHINE — Centralized order + product state transition logic
   ═══════════════════════════════════════════════════════════════════════════

   ORDER FLOW:
     Pending → (Confirm) → In Progress → (all products Ready) → Ready to Dispatch
       → (Dispatch + AWB) → Dispatched → (Mark Delivered) → Delivered

   PRODUCT FLOW:
     Pending → Fabrication → Dyeing → Marking → Embroidery → Stitching → Ready
       → Shipped → Delivered

   KEY RULES:
     1. Confirm Order → pushes ALL products to Fabrication
     2. Any product entering Alterations or Trials → order snaps back to In Progress
     3. All products hit Ready → order auto-advances to Ready to Dispatch
     4. Dispatch → all products Shipped
     5. Mark Delivered → all products Delivered
     6. Returns are product-level: Return Requested → Accepted/Rejected
   ═══════════════════════════════════════════════════════════════════════════ */

import { supa } from './supabase'
import { toast } from './designTokens'

/* ── ORDER STATUSES ──────────────────────────────────────────────────────── */
export const ORDER_STATUSES = ['pending', 'in-progress', 'ready-to-dispatch', 'dispatched', 'delivered', 'partially-delivered', 'on-hold', 'cancelled']

export const ORDER_STATUS_META = {
  'pending':              { label: 'Pending',              color: 'bg-yellow-50 text-yellow-700', dot: '#eab308', icon: '⏳' },
  'in-progress':          { label: 'In Progress',          color: 'bg-blue-50 text-blue-700',     dot: '#3b82f6', icon: '🔧' },
  'ready-to-dispatch':    { label: 'Ready to Dispatch',    color: 'bg-emerald-50 text-emerald-700', dot: '#10b981', icon: '📦' },
  'dispatched':           { label: 'Dispatched',           color: 'bg-purple-50 text-purple-700', dot: '#8b5cf6', icon: '🚚' },
  'delivered':            { label: 'Delivered',            color: 'bg-green-50 text-green-700',   dot: '#22c55e', icon: '✅' },
  'partially-delivered':  { label: 'Partially Delivered',  color: 'bg-teal-50 text-teal-700',     dot: '#14b8a6', icon: '📬' },
  'on-hold':              { label: 'On Hold',              color: 'bg-orange-50 text-orange-700', dot: '#f97316', icon: '⏸️' },
  'cancelled':            { label: 'Cancelled',            color: 'bg-red-50 text-red-600',       dot: '#ef4444', icon: '❌' },
}

/* ── PRODUCT / LINE ITEM STATUSES ────────────────────────────────────────── */
export const PRODUCTION_STAGES = ['pending', 'fabrication', 'dyeing', 'marking', 'embroidery', 'stitching', 'ready']
export const POST_PRODUCTION_STAGES = ['shipped', 'delivered']
export const SPECIAL_STATUSES = ['alterations', 'trials', 'return-requested', 'returned', 'paused', 'cancelled']
export const ALL_PRODUCT_STATUSES = [...PRODUCTION_STAGES, ...POST_PRODUCTION_STAGES, ...SPECIAL_STATUSES]

/* Production sub-tab partitions — single source of truth for the Production tab.
 * Each value is a production_stage. A stage appears in exactly one partition
 * except `ready`, which is in Active and also exposed via its own dispatch tab. */
export const ACTIVE_PRODUCTION_STAGES = [
  'fabrication', 'dyeing', 'marking', 'embroidery', 'stitching', 'ready', 'paused'
]
export const RETURN_PRODUCTION_STAGES = [
  'return-requested', 'returned'
]
export const ARCHIVE_PRODUCTION_STAGES = [
  'shipped', 'delivered', 'cancelled'
]


export const PRODUCT_STATUS_META = {
  'pending':           { label: 'Pending',          color: 'bg-gray-100 text-gray-600',     dot: '#9ca3af', progress: 0 },
  'fabrication':       { label: 'Fabrication',      color: 'bg-amber-50 text-amber-700',    dot: '#d97706', progress: 17 },
  'dyeing':            { label: 'Dyeing',           color: 'bg-purple-50 text-purple-700',  dot: '#7c3aed', progress: 33 },
  'marking':           { label: 'Marking',          color: 'bg-sky-50 text-sky-700',        dot: '#0284c7', progress: 50 },
  'embroidery':        { label: 'Embroidery',       color: 'bg-pink-50 text-pink-700',      dot: '#db2777', progress: 67 },
  'stitching':         { label: 'Stitching',        color: 'bg-indigo-50 text-indigo-700',  dot: '#4f46e5', progress: 83 },
  'ready':             { label: 'Ready',            color: 'bg-emerald-50 text-emerald-700', dot: '#10b981', progress: 100 },
  'shipped':           { label: 'Shipped',          color: 'bg-violet-50 text-violet-700',  dot: '#8b5cf6', progress: 100 },
  'delivered':         { label: 'Delivered',        color: 'bg-green-50 text-green-700',    dot: '#22c55e', progress: 100 },
  'alterations':       { label: 'Alterations',      color: 'bg-orange-50 text-orange-700',  dot: '#ea580c', progress: null },
  'trials':            { label: 'Trials',           color: 'bg-teal-50 text-teal-700',      dot: '#0d9488', progress: null },
  'return-requested':  { label: 'Return Requested', color: 'bg-red-50 text-red-600',        dot: '#dc2626', progress: null },
  'returned':          { label: 'Returned',         color: 'bg-red-100 text-red-700',       dot: '#b91c1c', progress: null },
  'paused':            { label: 'Paused',           color: 'bg-gray-100 text-gray-500',     dot: '#6b7280', progress: null },
  'cancelled':         { label: 'Cancelled',        color: 'bg-gray-100 text-gray-500',     dot: '#6b7280', progress: null },
}

/* ── Production sequence (the linear manufacturing flow) ─────────────── */
export const PRODUCTION_SEQUENCE = [
  'fabrication', 'dyeing', 'marking', 'embroidery', 'stitching', 'ready'
]

/* ── TRANSITION HELPERS (pure, no DB calls) ──────────────────────────── */

export const getNextStage = (current) => {
  const idx = PRODUCTION_STAGES.indexOf(current)
  if (idx === -1 || idx >= PRODUCTION_STAGES.length - 1) return null
  return PRODUCTION_STAGES[idx + 1]
}

export const getPrevStage = (current) => {
  const idx = PRODUCTION_STAGES.indexOf(current)
  if (idx <= 0) return null
  return PRODUCTION_STAGES[idx - 1]
}

export const canAdvanceStage = (status) => {
  return PRODUCTION_STAGES.includes(status) && status !== 'ready' && status !== 'pending'
}

export const canSendToSpecial = (status) => {
  return PRODUCTION_STAGES.includes(status) && status !== 'pending'
}

export const allItemsReady = (lineItems) => {
  if (!lineItems || lineItems.length === 0) return false
  return lineItems.every(li => li.production_stage === 'ready')
}

export const hasSpecialItems = (lineItems) => {
  if (!lineItems) return false
  return lineItems.some(li => li.production_stage === 'alterations' || li.production_stage === 'trials')
}

export const getOrderActions = (orderStatus, lineItems) => {
  const actions = []
  switch (orderStatus) {
    case 'pending':
      actions.push({ key: 'confirm', label: 'Confirm Order', icon: '✓', style: 'btn-gold' })
      actions.push({ key: 'hold', label: 'Put On Hold', icon: '⏸', style: 'btn-outline' })
      actions.push({ key: 'cancel', label: 'Cancel', icon: '✕', style: 'btn-danger' })
      break
    case 'in-progress':
      if (allItemsReady(lineItems)) {
        actions.push({ key: 'ready_dispatch', label: 'Mark Ready to Dispatch', icon: '📦', style: 'btn-gold' })
      }
      actions.push({ key: 'cancel', label: 'Cancel Order', icon: '✕', style: 'btn-danger' })
      break
    case 'ready-to-dispatch':
      actions.push({ key: 'dispatch', label: 'Dispatch', icon: '🚚', style: 'btn-gold' })
      actions.push({ key: 'cancel', label: 'Cancel Order', icon: '✕', style: 'btn-danger' })
      break
    case 'dispatched':
      actions.push({ key: 'deliver', label: 'Mark Delivered', icon: '✅', style: 'btn-gold' })
      break
    case 'on-hold':
      actions.push({ key: 'resume', label: 'Resume Order', icon: '▶', style: 'btn-gold' })
      actions.push({ key: 'cancel', label: 'Cancel Order', icon: '✕', style: 'btn-danger' })
      break
    default:
      break
  }
  return actions
}

/* ═══════════════════════════════════════════════════════════════════════════
   SUPABASE-POWERED STATE TRANSITIONS
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Check if ALL line items for an order are at 'ready' stage ────────── */
export async function checkAutoAdvance(orderId) {
  try {
    // Fetch all line items for this order
    const { data: items, error } = await supa
      .from('order_line_items')
      .select('id, production_stage')
      .eq('order_id', orderId)

    if (error || !items || items.length === 0) return

    const allReady = items.every(i => i.production_stage === 'ready')

    if (allReady) {
      // Fetch current order status
      const { data: order } = await supa
        .from('shopify_orders')
        .select('order_status')
        .eq('id', orderId)
        .single()

      // Only auto-advance from in-progress (not if already dispatched/delivered)
      if (order && order.order_status === 'in-progress') {
        await supa
          .from('shopify_orders')
          .update({ order_status: 'ready-to-dispatch' })
          .eq('id', orderId)
        toast(true, 'All products ready — order moved to Ready to Dispatch')
        return true // signal that order was advanced
      }
    }

    // Check if ANY item is in alterations/trials → revert order to in-progress
    const hasAlterations = items.some(i =>
      i.production_stage === 'alterations' || i.production_stage === 'trials'
    )
    if (hasAlterations) {
      const { data: order } = await supa
        .from('shopify_orders')
        .select('order_status')
        .eq('id', orderId)
        .single()

      if (order && order.order_status === 'ready-to-dispatch') {
        await supa
          .from('shopify_orders')
          .update({ order_status: 'in-progress' })
          .eq('id', orderId)
        toast(false, 'Product in alterations/trials — order reverted to In Progress')
        return true
      }
    }

    return false
  } catch (e) {
    console.error('Auto-advance check failed:', e)
    return false
  }
}

/* ── Dispatch an order: set all products to shipped ──────────────────── */
export async function dispatchOrder(orderId, dispatchData) {
  try {
    // Update all non-shipped/non-delivered items to shipped
    await supa
      .from('order_line_items')
      .update({ production_stage: 'shipped' })
      .eq('order_id', orderId)
      .not('production_stage', 'in', '("delivered","returned")')

    // Update the order
    await supa
      .from('shopify_orders')
      .update({
        order_status: 'dispatched',
        fulfillment_type: dispatchData.fulfillment_type,
        shipper: dispatchData.shipper,
        ...dispatchData,
      })
      .eq('id', orderId)

    toast(true, 'Order dispatched — all products marked as Shipped')
    return true
  } catch (e) {
    console.error('Dispatch failed:', e)
    toast(false, 'Dispatch failed: ' + e.message)
    return false
  }
}

/* ── Mark order as delivered ──────────────────────────────────────────── */
export async function markOrderDelivered(orderId) {
  try {
    // Update all shipped items to delivered
    await supa
      .from('order_line_items')
      .update({ production_stage: 'delivered' })
      .eq('order_id', orderId)
      .eq('production_stage', 'shipped')

    await supa
      .from('shopify_orders')
      .update({ order_status: 'delivered' })
      .eq('id', orderId)

    toast(true, 'Order marked as Delivered')
    return true
  } catch (e) {
    console.error('Mark delivered failed:', e)
    toast(false, 'Failed: ' + e.message)
    return false
  }
}

/* ── Mark individual product as delivered ─────────────────────────────── */
export async function markProductDelivered(itemId, orderId) {
  try {
    await supa
      .from('order_line_items')
      .update({ production_stage: 'delivered' })
      .eq('id', itemId)

    // Check if ALL items are now delivered
    const { data: items } = await supa
      .from('order_line_items')
      .select('id, production_stage')
      .eq('order_id', orderId)

    if (!items) return true

    const allDelivered = items.every(i => i.production_stage === 'delivered')
    const someDelivered = items.some(i => i.production_stage === 'delivered')

    if (allDelivered) {
      await supa.from('shopify_orders').update({ order_status: 'delivered' }).eq('id', orderId)
      toast(true, 'All products delivered — order marked Delivered')
    } else if (someDelivered) {
      await supa.from('shopify_orders').update({ order_status: 'partially-delivered' }).eq('id', orderId)
      toast(true, 'Product delivered — order is Partially Delivered')
    }

    return true
  } catch (e) {
    console.error('Mark product delivered failed:', e)
    toast(false, 'Failed: ' + e.message)
    return false
  }
}

/* ── Request return for a product ─────────────────────────────────────── */
export async function requestReturn(itemId) {
  try {
    await supa
      .from('order_line_items')
      .update({ production_stage: 'return-requested' })
      .eq('id', itemId)

    toast(true, 'Return requested')
    return true
  } catch (e) {
    toast(false, 'Failed: ' + e.message)
    return false
  }
}

/* ── Accept return → product marked returned ──────────────────────────── */
export async function acceptReturn(itemId) {
  try {
    await supa
      .from('order_line_items')
      .update({ production_stage: 'returned' })
      .eq('id', itemId)

    toast(true, 'Return accepted — product marked Returned')
    return true
  } catch (e) {
    toast(false, 'Failed: ' + e.message)
    return false
  }
}

/* ── Reject return → product goes back to previous stage (delivered) ──── */
export async function rejectReturn(itemId) {
  try {
    await supa
      .from('order_line_items')
      .update({ production_stage: 'delivered' })
      .eq('id', itemId)

    toast(true, 'Return rejected — product restored to Delivered')
    return true
  } catch (e) {
    toast(false, 'Failed: ' + e.message)
    return false
  }
}

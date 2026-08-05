/* ═══════════════════════════════════════════════════════════════════════════
   ORDERS CONSTANTS & ENUMS
   ═══════════════════════════════════════════════════════════════════════════ */
import { C, stageColor } from '../../lib/designTokens'

export const ORDER_STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'ready-to-dispatch', label: 'Ready to Dispatch' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'partially-delivered', label: 'Partially Delivered' },
  { key: 'fulfilled', label: 'Fulfilled' },
  { key: 'returned', label: 'Returned' },
  { key: 'cancelled', label: 'Cancelled' },
]

export const FULFILLMENT_TYPES = ['Store pickup', 'Domestic courier', 'International courier', 'Manual delivery']

export const SHIPPER_MAP = {
  'Store pickup': ['Jubilee Hills Store'],
  'Domestic courier': ['Bluedart', 'Delhivery'],
  'International courier': ['DHL', 'FedEx'],
  'Manual delivery': ['Porter', 'Dunzo', 'Uber', 'Bus delivery', 'Other'],
}

export const ALTERATION_STATUSES = [
  { value: 'trial', label: 'Trial' },
  { value: 'alterations', label: 'Alterations' },
  { value: 'second_trial', label: 'Second Trial' },
  { value: 'ready_to_ship', label: 'Ready To Ship' },
]

export const SEARCH_TYPES = [
  { key: 'order_number', label: 'Order ID' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'product', label: 'Product Name' },
]

export const PAGE_SIZE = 25

export const payColor = (s) => {
  if (s === 'paid') return { bg: C.greenBg, text: C.green }
  if (s === 'partial' || s === 'partially_paid') return { bg: C.amberBg, text: C.amber }
  if (s === 'refunded' || s === 'voided') return { bg: C.redBg, text: C.red }
  if (s === 'unpaid' || s === 'pending') return { bg: C.redBg || C.amberBg, text: C.red || C.amber }
  return { bg: C.amberBg, text: C.amber }
}

/**
 * derivePaymentStatus(order) — single source of truth for the payment
 * pill on an order row.
 *
 * Reads live POS columns (payment_collected, payment_balance,
 * total_price) first so a Shopify-imported `financial_status` of
 * 'pending' doesn't override a partial / full collection we recorded
 * through Dues & Ledger. Returns one of:
 *   'paid'    — fully collected
 *   'partial' — some collected but balance remains
 *   'unpaid'  — nothing collected
 *   plus pass-through for 'refunded' / 'voided' when Shopify says so.
 */
export const derivePaymentStatus = (order) => {
  if (!order) return 'unpaid'
  // Shopify-side terminal states win over our derivation
  const fs = (order.financial_status || '').toLowerCase()
  if (fs === 'refunded' || fs === 'voided') return fs

  const total     = Number(order.total_price || 0)
  const collected = Number(order.payment_collected || 0)
  // Trust an explicit payment_status from savePosPayments when present
  const ps = (order.payment_status || '').toLowerCase()
  if (ps === 'paid' || ps === 'partial' || ps === 'unpaid') return ps

  if (total <= 0.01) return 'unpaid'
  if (collected >= total - 0.01) return 'paid'
  if (collected > 0.01) return 'partial'
  return 'unpaid'
}

export const PAYMENT_LABEL = {
  paid: 'paid',
  partial: 'partial',
  unpaid: 'unpaid',
  refunded: 'refunded',
  voided: 'voided',
}

export const fulfillColor = (s) => {
  if (s === 'fulfilled') return { bg: C.greenBg, text: C.green }
  if (s === 'partial') return { bg: C.amberBg, text: C.amber }
  return { bg: C.cream, text: C.textMuted }
}

export const orderStatusColor = (s) => {
  switch (s) {
    case 'pending': return { bg: C.amberBg, text: C.amber }
    case 'in-progress': return { bg: C.blueBg, text: C.blue }
    case 'ready-to-dispatch': return { bg: C.purpleBg, text: C.purple }
    case 'dispatched': return { bg: 'rgba(20,184,166,0.08)', text: '#14b8a6' }
    case 'delivered': return { bg: C.greenBg, text: C.green }
    case 'partially-delivered': return { bg: 'rgba(20,184,166,0.08)', text: '#14b8a6' }
    case 'fulfilled': return { bg: C.greenBg, text: C.green }
    case 'returned': return { bg: C.redBg, text: C.red }
    case 'cancelled': return { bg: C.redBg, text: C.red }
    default: return { bg: C.cream, text: C.textMuted }
  }
}

export const stageColorFunc = stageColor

export const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return '—'
  return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`
}

export const fmtDateTime = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt)) return '—'
  return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}, ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

export const emptyLineItem = () => ({ _key: Date.now() + Math.random(), name: '', sku: '', title: '', quantity: 1, size: '', type: 'General', product_id: '' })

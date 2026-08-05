/* ═══════════════════════════════════════════════════════════════════════════
   FULFILLMENT CONSTANTS & ENUMS
   ═══════════════════════════════════════════════════════════════════════════ */
import { C } from '../../lib/designTokens'

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

export const CHANNEL_GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'store_assist', label: 'Store & Online Assist' },
  { key: 'online', label: 'Online' },
  { key: 'to_be_fulfilled', label: 'To be Fulfilled' },
  { key: 'trial', label: 'Trial' },
  { key: 'alterations', label: 'Alterations' },
  { key: 'fulfilled', label: 'Fulfilled/Archive' },
]

export const fulfillColor = (s) => {
  if (s === 'fulfilled') return { bg: C.greenBg, text: C.green }
  if (s === 'partial') return { bg: C.amberBg, text: C.amber }
  return { bg: C.cream, text: C.textMuted }
}

export const fulfillmentStatusColor = (s) => {
  if (s === 'fulfilled') return { bg: C.greenBg, text: C.green }
  if (s === 'fulfilled-partially') return { bg: 'rgba(20,184,166,0.08)', text: '#14b8a6' }
  if (s === 'completed') return { bg: C.greenBg, text: C.green }
  if (s === 'completed-partially') return { bg: C.amberBg, text: C.amber }
  return { bg: C.cream, text: C.textMuted }
}

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

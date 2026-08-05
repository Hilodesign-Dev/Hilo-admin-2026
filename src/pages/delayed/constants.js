/* ═══════════════════════════════════════════════════════════════════════════
   DELAYED REPORTING CONSTANTS & ENUMS
   ═══════════════════════════════════════════════════════════════════════════ */

export const SEARCH_TYPES = [
  { key: 'order_number', label: 'Order ID' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'customer_email', label: 'Email' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'product', label: 'Product Name' },
]

export const URGENCY_LEVELS = ['Urgent', 'Very Important', 'Other']

export const ORDER_TYPES = ['General', 'Custom']

export const PAGE_SIZE = 25

/* ── Delay Status Colors ────────────────────────────────────────────────── */
export const getDelayStatus = (est_shipping_date) => {
  if (!est_shipping_date) return { label: 'No Date', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const shipDate = new Date(est_shipping_date)
  shipDate.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((shipDate - today) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { label: 'Delayed', color: '#dc2626', bg: 'rgba(220,38,38,0.08)' }
  if (diffDays <= 1) return { label: 'Priority', color: '#d97706', bg: 'rgba(217,119,6,0.08)' }
  return { label: 'In Time', color: '#16a34a', bg: 'rgba(22,163,74,0.08)' }
}

/* ── Production Days Helper ────────────────────────────────────────────── */
export const getProductionDays = (orderDate) => {
  if (!orderDate) return '—'
  const days = Math.ceil((new Date() - new Date(orderDate)) / (1000 * 60 * 60 * 24))
  if (days === 0) return '0 Days'
  if (days === 1) return '1 Day'
  return `${days} Days`
}

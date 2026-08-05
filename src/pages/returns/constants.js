/* ═══════════════════════════════════════════════════════════════════════════
   RETURNS & EXCHANGES — Constants
   ═══════════════════════════════════════════════════════════════════════════ */

export const RETURN_SUB_TABS = [
  { key: 'dashboard',    label: 'Dashboard'    },
  { key: 'list',         label: 'Returns'      },
  { key: 'refunds',      label: 'Refunds'      },
  { key: 'store_credit', label: 'Store Credit' },
]

export const RETURN_STATUSES = [
  { key: 'requested', label: 'Requested', color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'approved',  label: 'Approved',  color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  { key: 'received',  label: 'Received',  color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
  { key: 'refunded',  label: 'Refunded',  color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'rejected',  label: 'Rejected',  color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  { key: 'cancelled', label: 'Cancelled', color: '#6b7280', bg: 'rgba(107,114,128,0.10)' },
]

export const STATUS_FILTER_TABS = [
  { key: 'all',       label: 'All'        },
  { key: 'open',      label: 'Open'       },
  { key: 'requested', label: 'Requested'  },
  { key: 'approved',  label: 'Approved'   },
  { key: 'received',  label: 'Received'   },
  { key: 'refunded',  label: 'Refunded'   },
  { key: 'rejected',  label: 'Rejected'   },
  { key: 'cancelled', label: 'Cancelled'  },
]

export const RETURN_TYPES = [
  { key: 'return',   label: 'Return'   },
  { key: 'exchange', label: 'Exchange' },
]

export const REASON_CATEGORIES = [
  'Size issue',
  'Color mismatch',
  'Quality defect',
  'Wrong product shipped',
  'Customer changed mind',
  'Damaged in transit',
  'Fabric issue',
  'Other',
]

export const REFUND_METHODS = [
  { key: 'original_payment', label: 'Refund to original payment' },
  { key: 'store_credit',     label: 'Issue store credit'         },
  { key: 'exchange_only',    label: 'Exchange only (no refund)'  },
]

export const REFUND_PAYMENT_METHODS = [
  { key: 'bank_transfer', label: 'Bank Transfer' },
  { key: 'upi',           label: 'UPI'           },
  { key: 'cash',          label: 'Cash'          },
  { key: 'cheque',        label: 'Cheque'        },
  { key: 'card_reversal', label: 'Card Reversal' },
  { key: 'other',         label: 'Other'         },
]

export const STATUS_META = Object.fromEntries(RETURN_STATUSES.map(s => [s.key, s]))
export const REFUND_METHOD_LABEL = Object.fromEntries(REFUND_METHODS.map(m => [m.key, m.label]))

/* ── ID generators (no DB sequence; mirror vendor_payments id-text pattern) ── */
export const newReturnId = () => 'RR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()
export const newRefundId = () => 'RP-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()
export const newCreditId = () => 'SC-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase()

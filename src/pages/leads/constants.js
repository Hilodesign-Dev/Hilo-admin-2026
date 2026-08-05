/* ═══════════════════════════════════════════════════════════════════════════
   LEADS CRM — Constants (v2 — Two-funnel pipeline)
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Pipeline Statuses ─────────────────────────────────────────────────────
export const YET_TO_CONNECT_STATUSES = [
  'New', 'Attempt 1', 'Attempt 2', 'Attempt 3'
]

export const CONNECTED_STATUSES = [
  'Connected Attempt 1', 'Connected Attempt 2', 'Connected Attempt 3'
]

export const YET_TO_QUALIFY_TERMINAL = ['Not Qualified', 'Lost']

export const YET_TO_QUALIFY_STATUSES = [
  ...YET_TO_CONNECT_STATUSES,
  ...CONNECTED_STATUSES,
  ...YET_TO_QUALIFY_TERMINAL
]

export const QUALIFIED_ACTIVE_STATUSES = [
  'Follow-up 1', 'Follow-up 2', 'Follow-up 3',
  'Store Visit Booked', 'Proposal Sent', 'To be Closed'
]

export const QUALIFIED_TERMINAL = ['Converted', 'Lost']

export const QUALIFIED_STATUSES = [
  ...QUALIFIED_ACTIVE_STATUSES,
  ...QUALIFIED_TERMINAL
]

export const ALL_STATUSES = [...YET_TO_QUALIFY_STATUSES, ...QUALIFIED_STATUSES]

// Legacy compat
export const LEAD_STATUSES = ALL_STATUSES

// ─── Channels (4-value standard, matches shopify_orders.channel enum) ─────
export const LEAD_CHANNELS = ['In-store', 'Online', 'Online Assist', 'Marketplace']

// Default lead_source to attach to walk-in entries.
export const WALKIN_LEAD_SOURCE = 'Direct Walk-in'

// ─── Lead Sources (17 options — Bigin picklist) ────────────────────────────
export const LEAD_SOURCES = [
  'Whatsapp Business', 'Whatsapp Ad', 'Whatsapp',
  'Instagram Ad', 'Facebook Ad', 'Youtube Ad',
  'Google Search', 'Google Maps',
  'Existing Client', 'Existing Customer Referral', 'Referral by Founders',
  'Website', 'Website Appointment',
  'OOH (outdoor)', 'Store VM', 'Stalls / Trade Exhibitions',
  'Others'
]

// ─── Lead Quality ──────────────────────────────────────────────────────────
export const LEAD_QUALITIES = ['High Quality', 'Good', 'Avg', 'Bad']

// ─── Occasions (from Bigin) ────────────────────────────────────────────────
export const OCCASIONS = [
  'Wedding – Groom', 'Wedding – Guest',
  'Engagement / Roka', 'Haldi', 'Mehendi', 'Sangeet',
  'Cocktail / Reception', 'Wedding Ceremony',
  'Dhoti Function', 'Housewarming',
  'Party / Evening Out', 'Puja', 'Others'
]

// ─── Products (from Bigin) ─────────────────────────────────────────────────
export const PRODUCT_CATEGORIES = [
  'Kurtas', 'Pattu Kurtas', 'Embroidered Shirts', 'Casual Shirts',
  'Sherwanis', 'Bandhgalas', 'Blazers/Tuxedo', 'Bling Blazers',
  'Indo-Western', 'Shackets', 'Nehru Jackets', 'Others'
]

// ─── Lost / Not Qualified Reasons ──────────────────────────────────────────
export const LOST_REASONS = [
  'Budget too low', 'Not serious / exploring',
  'Went to competitor', 'Timeline changed',
  'No response after initial interest', 'Wrong product category',
  'Vendor / spam inquiry', 'Other'
]

// ─── Call Outcomes by sub-phase ────────────────────────────────────────────
export const CALL_OUTCOMES = {
  yet_to_connect: [
    'No answer',
    'Answered - busy, call back',
    'Answered - had conversation',
    'Not interested'
  ],
  connected: [
    'Busy again',
    'Had conversation',
    'Not interested'
  ],
  qualified: [
    'Call back later',
    'Store visit booked',
    'Proposal sent',
    'Ready to close',
    'Converted',
    'Lost'
  ]
}

// ─── Auto-schedule delays (days) ───────────────────────────────────────────
export const ATTEMPT_DELAYS = {
  'New': 2,
  'Attempt 1': 3,
  'Attempt 2': 4,
}

export const CONNECTED_DELAYS = {
  'Connected Attempt 1': 2,
  'Connected Attempt 2': 3,
}

// ─── Next status maps ──────────────────────────────────────────────────────
export const NEXT_ATTEMPT_STATUS = {
  'New': 'Attempt 1',
  'Attempt 1': 'Attempt 2',
  'Attempt 2': 'Attempt 3',
  'Attempt 3': 'Lost',
}

export const NEXT_CONNECTED_STATUS = {
  'Connected Attempt 1': 'Connected Attempt 2',
  'Connected Attempt 2': 'Connected Attempt 3',
  'Connected Attempt 3': 'Lost',
}

// ─── Phase helpers ─────────────────────────────────────────────────────────
export const getPhase = (status) => {
  if (YET_TO_QUALIFY_STATUSES.includes(status)) return 'yet_to_qualify'
  if (QUALIFIED_STATUSES.includes(status)) return 'qualified'
  return 'yet_to_qualify'
}

export const getSubPhase = (status) => {
  if (YET_TO_CONNECT_STATUSES.includes(status)) return 'yet_to_connect'
  if (CONNECTED_STATUSES.includes(status)) return 'connected'
  if (QUALIFIED_ACTIVE_STATUSES.includes(status)) return 'qualified'
  if (status === 'Converted') return 'converted'
  if (status === 'Not Qualified') return 'not_qualified'
  if (status === 'Lost') return 'lost'
  return 'yet_to_connect'
}

export const isTerminalStatus = (status) =>
  ['Lost', 'Not Qualified', 'Converted'].includes(status)

// ─── Quality Colors ────────────────────────────────────────────────────────
export const QUALITY_COLORS = {
  'High Quality': { bg: 'rgba(22,163,74,0.08)', color: '#16a34a' },
  'Good':         { bg: 'rgba(22,163,74,0.08)', color: '#16a34a' },
  'Avg':          { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
  'Bad':          { bg: 'rgba(217,119,6,0.08)', color: '#d97706' }
}

export const PHASE_COLORS = {
  yet_to_qualify: { bg: 'rgba(37,99,235,0.08)', color: '#2563eb', label: 'Yet to Qualify' },
  qualified:      { bg: 'rgba(22,163,74,0.08)', color: '#16a34a', label: 'Qualified' },
}

// ─── Walkout Reasons (Store Walk-ins) ─────────────────────────────────────
export const WALKOUT_REASONS = [
  'Budget Issue',
  'Need Ready Piece',
  'Will Come Back Later',
  'Browsing Other Stores',
  'Need More Options / Size',
  'Specific Item Not Available',
  'Need Discount',
  'Just Browsing',
  'Other'
]

// ─── Backward compat ───────────────────────────────────────────────────────
export const LEAD_PRIORITIES = ['High', 'Medium', 'Low']
export const LEAD_TYPES = ['B2C', 'B2B']
export const LOCATIONS = [
  'United States', 'Bangalore', 'Chennai', 'Mumbai',
  'Andhra', 'Hyderabad', 'Kadapa', 'Australia'
]
export const COUNTRIES = ['India', 'United States', 'Australia']
export const AGE_GROUPS = ['0-18', '18-26', '26-32', '32-45', '46+']
export const VISITED_NUMS = ['1', '2', '3', 'more']
export const INTERACTION_TYPES = ['Call', 'WhatsApp', 'Email', 'Store Visit', 'Instagram DM', 'Other']

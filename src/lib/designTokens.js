/* ═══════════════════════════════════════════════════════════════════════════
   DESIGN TOKENS — Shared Hilo brand colours used across all tabs
   ═══════════════════════════════════════════════════════════════════════════ */

export const C = {
  gold: '#c9a432', goldLight: 'rgba(212,168,67,0.12)', goldDark: '#795900',
  navy: '#0f172a', navyDeep: '#0b1929',
  bg: '#faf9f5', cardBg: '#fff', cream: '#f5f4f0',
  text: '#1b1c1a', textMuted: 'rgba(27,28,26,0.5)', textLight: 'rgba(27,28,26,0.3)',
  border: '#ebe8e0', borderLight: '#f3f1eb',
  green: '#16a34a', greenBg: 'rgba(22,163,74,0.08)',
  red: '#dc2626', redBg: 'rgba(220,38,38,0.08)',
  amber: '#d97706', amberBg: 'rgba(217,119,6,0.08)',
  purple: '#7c3aed', purpleBg: 'rgba(124,58,237,0.08)',
  blue: '#3b82f6', blueBg: 'rgba(59,130,246,0.08)',
}

/* ── Toast helper (dispatches to <Toaster />) ─────────────────────────── */
export const toast = (ok, msg) => {
  window.dispatchEvent(new CustomEvent('hilo-toast', { detail: { ok, msg } }))
}

/* ── Date formatting ──────────────────────────────────────────────────── */
export const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

export const fmtDateShort = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(-2)}`
}

/* ── Indian currency format ───────────────────────────────────────────── */
export const fmtCurrency = (amount) => {
  if (!amount && amount !== 0) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)
}

/* ── Stage badge colours ──────────────────────────────────────────────── */
export const stageColor = (s) => {
  const map = {
    pending: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
    fabrication: { bg: C.blueBg, color: C.blue },
    dyeing: { bg: C.greenBg, color: C.green },
    dying: { bg: C.greenBg, color: C.green }, // legacy alias
    marking: { bg: 'rgba(15,23,42,0.08)', color: C.navy },
    embroidery: { bg: C.amberBg, color: C.amber },
    stitching: { bg: C.purpleBg, color: C.purple },
    ready: { bg: 'rgba(22,163,74,0.15)', color: '#15803d' },
    'ready-to-ship': { bg: 'rgba(22,163,74,0.15)', color: '#15803d' }, // legacy alias
    shipped: { bg: 'rgba(59,130,246,0.08)', color: '#2563eb' },
    delivered: { bg: 'rgba(22,163,74,0.08)', color: '#16a34a' },
    alterations: { bg: C.redBg, color: C.red },
    trials: { bg: C.amberBg, color: C.amber },
    paused: { bg: 'rgba(107,114,128,0.08)', color: '#9ca3af' },
    'return-requested': { bg: 'rgba(220,38,38,0.12)', color: '#b91c1c' },
    returned: { bg: 'rgba(220,38,38,0.08)', color: '#dc2626' },
  }
  return map[s] || map.pending
}

/* ── Production stage list ────────────────────────────────────────────── */
export const PRODUCTION_STAGES = [
  'pending', 'fabrication', 'dyeing', 'marking', 'embroidery', 'stitching',
  'ready', 'shipped', 'delivered', 'alterations', 'trials', 'paused',
  'return-requested', 'returned'
]

/* ── Production stage sequence (linear manufacturing flow) ────────────── */
export const PRODUCTION_SEQUENCE = [
  'fabrication', 'dyeing', 'marking', 'embroidery', 'stitching', 'ready'
]

/* ── Sizes ────────────────────────────────────────────────────────────── */
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'MTF']

/* ── Delivery types ───────────────────────────────────────────────────── */
export const DELIVERY_TYPES = [
  'Courier', 'Local delivery', 'In-store pickup', 'Bus delivery',
  'Domestic Courier', 'International Courier', 'Others'
]

/* ── Channel types ────────────────────────────────────────────────────── */
// Standardised channel taxonomy (4 values). Marketplace sub-channel
// (AZA, Myntra, etc.) lives separately in the marketplaces master.
//
// CHANNEL_TYPES — every valid channel, used for filtering, reporting, and
// editing Shopify-synced orders.
//
// POS_CHANNEL_TYPES — subset that POS users are allowed to pick. 'Online'
// only ever comes from Shopify website sync (never from a human), and
// 'Marketplace' is owned by the marketplace order wizard. Picking either
// of those for a POS-created order is always a bug (see HIOS00053, June 2026).
export const CHANNEL_TYPES = ['In-store', 'Online', 'Online Assist', 'Marketplace']
export const POS_CHANNEL_TYPES = ['In-store', 'Online Assist']

// Channel display label -> sales_channels.id (FK on shopify_orders.channel_id).
// Keep in sync with the `sales_channels` table in Supabase.
export const CHANNEL_LABEL_TO_ID = {
  'In-store':      'in-store',
  'Online':        'online',
  'Online Assist': 'online-assist',
  'Marketplace':   'marketplace',
}

export const MARKETPLACE_CHANNELS = [
  'AZA Fashions', 'Jayapore', 'Talasha', 'Mirraw', 'Pop Club',
  'Trendia', 'In-store', 'Inventory', 'Distacart', 'Cherrypick',
  'Gozars', 'Curato', 'Myntra', 'Amazon.com', 'Eleganzaa', 'Other'
]

/* ── Measurement field definitions ────────────────────────────────────── */
export const TOP_MEASUREMENTS = [
  { key: 'shirt_length', label: 'Shirt Length' },
  { key: 'chest', label: 'Chest' },
  { key: 'stomach', label: 'Stomach' },
  { key: 'collar', label: 'Collar' },
  { key: 'hip', label: 'Hip' },
  { key: 'waist', label: 'Waist' },
  { key: 'front_cross', label: 'Front Cross' },
  { key: 'back_cross', label: 'Back Cross' },
  { key: 'shoulder', label: 'Shoulder' },
  { key: 'sleeve_length', label: 'Sleeve Length' },
  { key: 'cuff', label: 'Cuff' },
  { key: 'biceps', label: 'Biceps' },
  { key: 'knee_length', label: 'Knee Length' },
  { key: 'sadri', label: 'Nehru Jacket Length' },
  { key: 'arm_hole', label: 'Arm Hole' },
  { key: 'coat_length', label: 'Coat Length' },
  { key: 'blazer_length', label: 'Blazer Length' },
  { key: 'sherwani_length', label: 'Sherwani Length' },
]

export const BOTTOM_MEASUREMENTS = [
  { key: 'pant_waist', label: 'Pant Waist' },
  { key: 'pant_hip', label: 'Pant Hip' },
  { key: 'fork', label: 'Fork' },
  { key: 'crop_pant_length', label: 'Crop Pant Length' },
  { key: 'inside_length', label: 'Inside Length' },
  { key: 'thigh', label: 'Thigh' },
  { key: 'ankle', label: 'Ankle' },
  { key: 'knee', label: 'Knee' },
  { key: 'chudia_rounding', label: 'Chudia Rounding' },
  { key: 'calf', label: 'Calf' },
  { key: 'pant_length', label: 'Pant Length' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'chudia_pan_length', label: 'Cudia Pant Length' },
  { key: 'shoe_size', label: 'Shoe Size' },
  { key: 'height', label: 'Height' },
  { key: 'pagdi_size', label: 'Pagdi Size' },
]

export const SMART_FIT_FIELDS = [
  { key: 'height',                label: 'Height (in)',        type: 'number' },
  { key: 'smart_match_body',      label: 'Match your body',    type: 'select', options: ['slim', 'regular', 'athletic', 'heavy'] },
  { key: 'smart_chest_size',      label: 'Chest Size',         type: 'number' },
  { key: 'smart_shirt_shoulder',  label: 'Shirt Shoulder',     type: 'number' },
  { key: 'smart_preferred_fit',   label: 'Your Preferred fit', type: 'select', options: ['Slim', 'Regular', 'Relaxed', 'Oversized'] },
  { key: 'smart_sleeve_length',   label: 'Sleeve Length',      type: 'number' },
  { key: 'smart_shirt_hip',       label: 'Shirt Hip',          type: 'number' },
]

/* ── Ready (garment) measurements ─────────────────────────────────────
 * Per-garment field subsets, keyed by the SAME canonical field keys used
 * for body measurements (chest, shoulder, sleeve_length, etc.). This means
 * the print slip can look up readyJson[body_key] without translation.
 *
 * Order roughly matches the body field order so the editor reads naturally.
 * ───────────────────────────────────────────────────────────────────── */
export const READY_GARMENT_FIELDS = {
  shirt:  ['shirt_length', 'chest', 'stomach', 'collar', 'hip', 'shoulder', 'sleeve_length', 'cuff', 'biceps', 'arm_hole', 'front_cross', 'back_cross'],
  kurtha: ['shirt_length', 'chest', 'stomach', 'collar', 'hip', 'shoulder', 'sleeve_length', 'cuff', 'biceps', 'knee_length', 'sadri', 'arm_hole', 'front_cross', 'back_cross'],
  blazer: ['shirt_length', 'chest', 'stomach', 'collar', 'hip', 'shoulder', 'sleeve_length', 'cuff', 'biceps', 'blazer_length', 'coat_length', 'arm_hole'],
  pant:   ['pant_waist', 'pant_hip', 'fork', 'crop_pant_length', 'inside_length', 'thigh', 'ankle', 'knee', 'chudia_rounding', 'calf', 'pant_length', 'bottom', 'chudia_pan_length'],
}

// Used by ProductionDetail's Ready Measurement tab to render four sections in order.
export const READY_MEASUREMENT_PANELS = [
  { key: 'shirt_measurements',  title: 'Shirt',  garment: 'shirt'  },
  { key: 'kurtha_measurements', title: 'Kurtha', garment: 'kurtha' },
  { key: 'blazer_measurements', title: 'Blazer', garment: 'blazer' },
  { key: 'pant_measurements',   title: 'Pant',   garment: 'pant'   },
]

/* ── Style profile options ────────────────────────────────────────────── */
export const FIT_OPTIONS = ['Slim', 'Regular', 'Relaxed', 'Oversized']
export const LOOK_OPTIONS = ['Casual', 'Smart Casual', 'Formal', 'Ethnic', 'Fusion', 'Festive']
export const COLOUR_PALETTE = [
  'Black', 'White', 'Navy', 'Grey', 'Beige', 'Brown', 'Maroon', 'Red', 'Pink',
  'Coral', 'Peach', 'Orange', 'Mustard', 'Yellow', 'Gold', 'Olive', 'Green',
  'Sage', 'Teal', 'Blue', 'Indigo', 'Lavender', 'Purple', 'Cream', 'Ivory',
  'Rust', 'Charcoal', 'Camel'
]
export const PATTERN_OPTIONS = ['Solid', 'Striped', 'Checked', 'Printed', 'Textured']
export const FABRIC_PREF_OPTIONS = ['Cotton', 'Linen', 'Silk', 'Poly-blend', 'Denim']
export const BUDGET_OPTIONS = [
  { key: 'under_2k', label: '< ₹2K' },
  { key: '2k_5k', label: '₹2–5K' },
  { key: '5k_10k', label: '₹5–10K' },
  { key: 'above_10k', label: '₹10K+' },
]

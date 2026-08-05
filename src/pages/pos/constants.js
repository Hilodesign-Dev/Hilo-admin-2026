// Country codes for phone lookup — defaults to India, common destinations included.
export const COUNTRY_CODES = [
  { code: '+91',  flag: '🇮🇳', name: 'India' },
  { code: '+1',   flag: '🇺🇸', name: 'USA' },
  { code: '+44',  flag: '🇬🇧', name: 'UK' },
  { code: '+971', flag: '🇦🇪', name: 'UAE' },
  { code: '+65',  flag: '🇸🇬', name: 'Singapore' },
  { code: '+61',  flag: '🇦🇺', name: 'Australia' },
  { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: '+974', flag: '🇶🇦', name: 'Qatar' },
  { code: '+973', flag: '🇧🇭', name: 'Bahrain' },
  { code: '+1473', flag: '🇨🇦', name: 'Canada' },
]

// POS step order
export const POS_STEPS = ['customer', 'products', 'review', 'payment']
export const POS_STEP_LABELS = {
  customer: 'Customer',
  products: 'Products',
  review:   'Review',
  payment:  'Payment',
}

// POS sub-views (top-level tabs inside the POS module)
export const POS_VIEWS = [
  { key: 'new_order',   label: 'New Order' },
  { key: 'marketplace', label: 'Marketplace Order' },
  { key: 'calculator',  label: 'Price Calculator' },
  { key: 'orders',      label: 'Orders' },
  { key: 'quotations',  label: 'Quotations' },
  { key: 'dues',        label: 'Dues & Ledger' },
  { key: 'marketplaces', label: 'Marketplaces' },
  { key: 'mp_dues', label: 'Marketplace Dues' },
]

// Payment methods (configurable later via masters)
export const PAYMENT_METHODS = [
  { key: 'cash',          label: 'Cash',              icon: '💵' },
  { key: 'hdfc_pos',      label: 'HDFC POS Machine',  icon: '🏧' },
  { key: 'hdfc_qr',       label: 'HDFC QR / UPI',     icon: '📱' },
  { key: 'razorpay',      label: 'Razorpay Link',     icon: '🔗' },
  { key: 'bank_transfer', label: 'Bank Transfer',     icon: '🏦' },
  { key: 'store_credit',  label: 'Store Credit',      icon: '🎁' },
  { key: 'gift_card',     label: 'Gift Card',         icon: '🎟️' },
  { key: 'loyalty_points',label: 'Loyalty Points',    icon: '🪙' },
]

// ──────────────────────────────────────────────────────────────────────
// GARMENT TYPE MODEL (May 2026 refactor — per Sahith)
//
// The POS new-order dropdown shows specific GARMENT TYPES from the
// Stitching Cost Master (e.g. "Lining Kurta", "Indowestern (Full Set)",
// "Jacket (Embroidered)"). The master's `category` column groups them
// (Kurta, Blazer, Bottom, etc.) and drives measurement-panel routing
// + fabric-COGS estimation.
//
//   garment_type  → user picks this from the dropdown; saved on line item
//   category      → derived from the master row; drives panel + metres
//
// Helpers below build optgroups for the dropdown and resolve a selected
// garment_type back to its category at save-time.
// ──────────────────────────────────────────────────────────────────────

// Category display order in the dropdown (Occasion Wear → Urban → Bottoms → Acc → Other).
// Categories not listed here fall through to alphabetical at the end.
const CATEGORY_ORDER = [
  'Sherwani', 'Indowestern', 'Kurta Set', 'Pattu Set', 'Kurta', 'Nehru Jacket',
  'Blazer', 'Shacket', 'Shirt',
  'Bottom', 'Ethnic Pants', 'Trouser',
  'Pagdi', 'Shoes',
  'Other',
]

// Extract garment-type string from a stitching-master row, tolerant of:
//   - DB snake_case  (r.garment_type)
//   - App camelCase  (r.garmentType — App.jsx normalises rows this way)
//   - Legacy alias   (r.name)
function _gtOf(r) { return ((r && (r.garmentType || r.garment_type || r.name)) || '').toString().trim() }

/** Build optgroup-ready options from the stitching_cost_master rows.
 *  → [{ category, types: [{ value, label, cost }] }, …]                */
export function buildGarmentTypeOptions(stitchingMaster) {
  const byCat = new Map()
  ;(stitchingMaster || []).forEach(r => {
    const cat = ((r && r.category) || 'Other').toString().trim() || 'Other'
    const gt  = _gtOf(r)
    if (!gt) return
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat).push({ value: gt, label: gt, cost: Number(r && r.cost) || 0, category: cat })
  })
  const sortKey = (c) => {
    const i = CATEGORY_ORDER.indexOf(c)
    return i >= 0 ? `0_${String(i).padStart(3,'0')}` : `1_${c.toLowerCase()}`
  }
  return Array.from(byCat.entries())
    .sort(([a],[b]) => sortKey(a).localeCompare(sortKey(b)))
    .map(([category, types]) => ({
      category,
      types: types.sort((a,b) => a.label.localeCompare(b.label)),
    }))
}

/** Look up the category for a selected garment_type (string match). */
export function categoryFromGarmentType(stitchingMaster, garmentType) {
  if (!garmentType) return ''
  const target = String(garmentType).toLowerCase()
  const row = (stitchingMaster || []).find(r => _gtOf(r).toLowerCase() === target)
  return (row && row.category) || ''
}

/** Look up the unit stitch cost for a selected garment_type. */
export function stitchCostFromGarmentType(stitchingMaster, garmentType) {
  if (!garmentType) return 0
  const target = String(garmentType).toLowerCase()
  const row = (stitchingMaster || []).find(r => _gtOf(r).toLowerCase() === target)
  return Number(row && row.cost) || 0
}

// Approx fabric metres by CATEGORY (used for COGS estimation at quotation stage).
// Sets include both top + bottom fabric.
export const CATEGORY_APPROX_METRES = {
  Sherwani: 7.0, Indowestern: 7.0, 'Kurta Set': 6.5, 'Pattu Set': 6.5,
  Kurta: 4.0, 'Nehru Jacket': 3.0,
  Blazer: 3.0, Shacket: 3.0, Shirt: 2.75,
  Bottom: 2.5, 'Ethnic Pants': 2.5, Trouser: 2.5,
  Pagdi: 1.0, Shoes: 0,
  Other: 3.0,
}

// Category → measurement panel mapping. Accessories have no panel.
export const CATEGORY_PANEL = {
  Sherwani: 'blazer', Indowestern: 'blazer', 'Nehru Jacket': 'blazer', Blazer: 'blazer',
  'Kurta Set': 'kurtha', 'Pattu Set': 'kurtha', Kurta: 'kurtha',
  Shacket: 'shirt', Shirt: 'shirt',
  Bottom: 'pant', 'Ethnic Pants': 'pant', Trouser: 'pant',
}

// Legacy aliases kept so callers that haven't migrated still work.
export const GARMENT_APPROX_METRES = CATEGORY_APPROX_METRES
export const GARMENT_PANEL         = CATEGORY_PANEL


// Legacy alias — static list of categories. New code should use
// buildGarmentTypeOptions(stitchingMaster) for a richer, data-driven dropdown.
export const GARMENT_CATEGORIES = Object.keys(CATEGORY_APPROX_METRES)

// Data formatting and calculations

export const fmt = (v) => {
  if (v === null || v === undefined || v === '' || v === 0) return '—'
  const s = String(v).replace(/₹/g, '').replace(/,/g, '').trim()
  const num = Number(s)
  return isNaN(num) ? '—' : '₹' + num.toLocaleString('en-IN')
}

export const gst = (mrp) => mrp > 2500 ? 0.18 : 0.05

// n() coerces any value (string, null, undefined) to a safe float — prevents string concatenation bugs
export const n = (v) => parseFloat(v) || 0

export const nextId = (items, prefix) => {
  const nums = items.map(i => {
    const m = (i.id || '').match(/-(\d+)$/)
    return m ? +m[1] : 0
  })
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1
  return `${prefix}-${String(next).padStart(2, '0')}`
}

// Fabric cost helper: if costType is 'total', use costPerMetre as flat total (ignores metres)
const fabricCost = (piece) => {
  if (piece.costType === 'total') return n(piece.costPerMetre)
  return n(piece.metres) * n(piece.costPerMetre)
}

export const calcCogs = (p) => {
  if (!p) return 0
  // New multi-piece set format
  if (p.setComponents && p.setComponents.length > 0) {
    const result = p.setComponents.reduce((total, piece) => {
      const fabric = fabricCost(piece)
      const dye = piece.costType === 'total' ? 0 : n(piece.dyePerMetre) * n(piece.metres)
      return total + fabric + dye + n(piece.embroidery) + n(piece.stitching) + n(piece.accessories)
    }, 0)
    return isNaN(result) ? 0 : result
  }
  // Legacy single-piece format (backward compat)
  const fabric = fabricCost(p)
  const dye = p.costType === 'total' ? 0 : n(p.dyePerMetre) * n(p.metres)
  const total = fabric + dye + n(p.embroidery) + n(p.stitching) + n(p.bottomCogs) + n(p.accessories)
  return isNaN(total) ? 0 : total
}

export const calcPieceCogs = (piece) => {
  const fabric = fabricCost(piece)
  const dye = piece.costType === 'total' ? 0 : n(piece.dyePerMetre) * n(piece.metres)
  return fabric + dye + n(piece.embroidery) + n(piece.stitching) + n(piece.accessories)
}

// Use sp (actual transaction price) for GST tier, not mrp.
// Edge function also uses unit_price (li.price) — this keeps them consistent.
export const effectiveSP = (sp, mrp) => sp > 0 ? sp / (1 + gst(sp)) : 0

export const gmPct = (sp, cogs, mrp) => {
  const exGST = effectiveSP(sp, mrp)
  return exGST > 0 ? (exGST - cogs) / exGST : 0
}

export const statusColor = (s) => {
  const map = {
    'Active': 'bg-green-100 text-green-700',
    'Inactive': 'bg-gray-100 text-gray-500'
  }
  return map[s] || 'bg-gray-100 text-gray-600'
}

// Fabric Data Mappers (Supabase → legacy format for COGS compat)
let _oldIdMap = {} // populated when fabrics load, maps old IDs → new IDs

export const mapSupaFabrics = function(supaFabrics, supaVendors) {
  const vendorMap = {};
  (supaVendors || []).forEach(function(v) { vendorMap[v.id] = v; });

  // Filter out materials — only map fabrics for COGS/production/order pickers
  var fabricOnly = supaFabrics.filter(function(f) { return !f.category || f.category === 'fabric'; });

  const result = fabricOnly.map(function(f) {
    // Extract old ID from notes if present
    let oldId = ''
    if (f.notes && f.notes.indexOf('Migrated from old id:') === 0) {
      oldId = f.notes.replace('Migrated from old id: ', '').trim()
    }
    // Build the old→new mapping
    if (oldId) _oldIdMap[oldId] = f.id
    _oldIdMap[f.id] = f.id // self-map too

    const vendor = vendorMap[f.default_vendor_id] || null
    return {
      id: f.id,
      fabricSKU: f.id,
      name: f.name || '',
      costPerMetre: parseFloat(f.default_cost_per_metre) || 0,
      costType: f.cost_type || 'per_metre',
      vendorId: f.default_vendor_id || '',
      vendorName: vendor ? vendor.name : '',
      description: f.description || '',
      // Display fields from fabric master
      image_urls: f.image_urls || [],
      fabric_family: f.fabric_family || '',
      colour: f.colour || '',
      composition: f.composition || '',
      weave: f.weave || '',
      width_inches: f.width_inches || null,
      is_active: f.is_active !== false,
      // Preserve new fields for Fabric Master
      _supaId: f.id,
      _oldId: oldId,
      _fabric_family: f.fabric_family || '',
      _colour: f.colour || '',
    }
  })
  return result
}

export const mapSupaVendors = function(supaVendors) {
  return supaVendors.map(function(v) {
    return {
      id: v.id,
      name: v.name || '',
      location: v.shipping_address || '',
      contact: v.spoc_phone || v.spoc_email || '',
      gstin: v.gstin || ''
    }
  })
}


// ─── Team-member designation filters ─────────────────────────────────
// Used by dropdowns across Orders, Production, Fulfillment, Delayed, Leads, Customers
export const STYLIST_DESIGNATIONS = ['Store Stylist', 'Online Stylist', 'Assistant Store Manager']
export const PRODUCTION_MANAGER_DESIGNATIONS = ['Production Manager']

const _matchDesig = (designation, allowed) => {
  const d = (designation || '').toLowerCase().trim()
  return allowed.some(a => a.toLowerCase() === d)
}

export const filterStylists = (teamMembers = []) =>
  (teamMembers || []).filter(m => _matchDesig(m.designation, STYLIST_DESIGNATIONS))

export const filterProductionManagers = (teamMembers = []) =>
  (teamMembers || []).filter(m => _matchDesig(m.designation, PRODUCTION_MANAGER_DESIGNATIONS))

// ─── Person-reference resolver ───────────────────────────────────────
// Person columns (stylist, product_executive, …) store the team_member
// id (as text). This resolves an id → display name for UI. Legacy rows
// may still hold a raw name string; those pass through unchanged.
export const resolveStaffName = (teamMembers = [], val) => {
  if (val == null || val === '') return ''
  const s = String(val)
  const byId = (teamMembers || []).find(m => String(m.id) === s)
  return byId ? byId.name : s
}


// ─── Stage → vendor type mapping (Production tab) ────────────────────
// Maps a production_stage to allowed outsource_vendors.type values.
// 'fabrication' uses fabric_vendors instead of outsource_vendors.
// null means "show all outsource_vendors" (e.g., marking, ready, generic).
export const STAGE_VENDOR_TYPES = {
  fabrication: '__fabric__',
  dyeing: ['Dyeing'],
  embroidery: ['Hand Embroidery', 'Machine Embroidery', 'Hand Painting'],
  stitching: ['Tailoring'],
  alterations: ['Tailoring'],
}

export const vendorsForStage = (stage, outsourceVendors = [], fabricVendors = []) => {
  const rule = STAGE_VENDOR_TYPES[stage]
  if (rule === '__fabric__') return fabricVendors || []
  if (Array.isArray(rule)) return (outsourceVendors || []).filter(v => rule.includes(v.type))
  return outsourceVendors || []
}


/**
 * Resilient vendor option list for a Production card dropdown.
 *
 * Returns:
 *   { options:[v...], selectValue:string }
 *
 * Rules:
 *   1. Start with vendorsForStage(stage, outsource, fabric).
 *   2. If assignedName is set and is NOT already in that list, append it so
 *      the <select> can render its current value. Match is case+space-
 *      insensitive against the full vendor universe so a casing drift
 *      (e.g. "shaik farooq ali" vs "Shaik Farooq Ali") still resolves to
 *      the canonical row.
 *   3. If the assignedName matches a known vendor (any case/spacing),
 *      selectValue returns the canonical name so the <option> stays
 *      selected. Otherwise selectValue returns assignedName as-is and we
 *      synthesise a one-off option for it (so the user sees what's
 *      assigned and can change it).
 */
export const vendorsForStageWithAssigned = (stage, outsourceVendors = [], fabricVendors = [], assignedName = '') => {
  const stageOptions = vendorsForStage(stage, outsourceVendors, fabricVendors)
  const trimmedAssigned = (assignedName || '').trim()
  if (!trimmedAssigned) return { options: stageOptions, selectValue: '' }

  const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
  const target = norm(trimmedAssigned)

  // 1. Already in the stage-filtered list?
  const hit = stageOptions.find(v => norm(v.name) === target)
  if (hit) return { options: stageOptions, selectValue: hit.name }

  // 2. Find it in the full vendor universe (outsource + fabric)
  const universe = [...(outsourceVendors || []), ...(fabricVendors || [])]
  const canonical = universe.find(v => norm(v.name) === target)
  if (canonical) {
    return { options: [...stageOptions, canonical], selectValue: canonical.name }
  }

  // 3. Truly orphan value — keep it visible via a synthetic option
  const synthetic = { id: '__assigned__', name: trimmedAssigned, _orphan: true }
  return { options: [...stageOptions, synthetic], selectValue: trimmedAssigned }
}

import { supa } from './supabase'
import { calcCogs } from './helpers'

/* catalogue v2 data layer
   Reads from the new catalogue_products table built per
   HILO_Catalogue_v2_Final_Spec.md. Three-level model:
     Product (row) → Variants[] → Sizes[].

   fetchAllCatalogueProductsV2() returns rows AS-IS so V2 components can
   walk the variants[].sizes[] structure directly.

   flattenCatalogueRowToLegacy() exposes the legacy fetchAllProducts() shape
   (one entry per variant) for code paths that haven't migrated yet. Same
   contract as design_products rows — id = style_code, variants[] = size list. */

export async function fetchAllCatalogueProductsV2() {
  const PAGE = 1000
  const all  = []
  let   from = 0
  while (true) {
    const { data, error } = await supa
      .from('catalogue_products')
      .select('*')
      .is('deleted_at', null)
      .range(from, from + PAGE - 1)
    if (error) {
      // Minimal test DBs may not have catalogue_products yet.
      console.warn('[HILO] catalogue_products:', error.message)
      return []
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

export async function fetchCatalogueProductBySpid(shopifyProductId) {
  const { data, error } = await supa
    .from('catalogue_products')
    .select('*')
    .eq('shopify_product_id', String(shopifyProductId))
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  return data
}

// Variant-level helpers ---------------------------------------------------

export function variantPriceRange(variant) {
  const sizes = Array.isArray(variant?.sizes) ? variant.sizes : []
  const mrps  = sizes.map(s => Number(s?.mrp) || 0).filter(v => v > 0)
  if (!mrps.length) return { min: 0, max: 0 }
  return { min: Math.min(...mrps), max: Math.max(...mrps) }
}

export function productPriceRange(row) {
  const variants = Array.isArray(row?.variants) ? row.variants : []
  let min = Infinity, max = 0
  variants.forEach(v => {
    const r = variantPriceRange(v)
    if (r.min > 0 && r.min < min) min = r.min
    if (r.max > max) max = r.max
  })
  return { min: min === Infinity ? 0 : min, max }
}

export function defaultVariant(row) {
  const variants = Array.isArray(row?.variants) ? row.variants : []
  if (!variants.length) return null
  // prefer the variant that has any active size; else first
  const withActive = variants.find(v => (v?.sizes || []).some(s => s?.active !== false))
  return withActive || variants[0]
}

export function defaultSize(variant) {
  const sizes = Array.isArray(variant?.sizes) ? variant.sizes : []
  if (!sizes.length) return null
  // Prefer M-equivalent, else first active, else first
  const mLike = sizes.find(s => /^m(td)?$/i.test(String(s?.size || '').trim()))
  if (mLike) return mLike
  const firstActive = sizes.find(s => s?.active !== false)
  return firstActive || sizes[0]
}

export function totalSizeCount(row) {
  return (row?.variants || []).reduce((acc, v) => acc + ((v?.sizes || []).length), 0)
}

// Flatten one catalogue_products row to legacy fetchAllProducts() shape ---
// One entry per variant. Used by code paths that haven't migrated yet (POS,
// Calculator, Quotations, Collections, Offers).

export function flattenCatalogueRowToLegacy(row) {
  const variants = Array.isArray(row?.variants) ? row.variants : []
  return variants.map(v => ({
    id:                  v.style_code,           // legacy id was style_code
    styleCode:           v.style_code,
    productTitle:        row.product_title,
    category:            row.category,
    isSet:               !!v.is_set,
    setComponents:       v.set_components || [],
    cogs:                v.cogs,
    fabricId:            v.fabric_id,
    fabricName:          v.fabric_name,
    fabricSku:           v.fabric_sku,
    fabricDesc:          v.fabric_desc,
    fabricGrade:         v.fabric_grade,
    fabricTag:           v.fabric_tag,
    metres:              v.metres,
    costPerMetre:        v.cost_per_metre,
    dyeId:               v.dye_id,
    dyePerMetre:         v.dye_per_metre,
    embroidery:          v.embroidery,
    embroideryType:      v.embroidery_type,
    stitching:           v.stitching,
    totalDye:            v.total_dye,
    accessories:         v.accessories,
    bottomCogs:          v.bottom_cogs,
    proposedMrp:         v.proposed_mrp,
    cogsNotes:           v.cogs_notes,
    cogsReviewStatus:    v.cogs_review_status,
    cogs_review_status:  v.cogs_review_status,
    costType:            v.cost_type,
    cogsEnteredBy:       v.cogs_entered_by,
    cogsEnteredAt:       v.cogs_entered_at,
    cogsFinalizedBy:     v.cogs_finalized_by,
    cogsFinalizedAt:     v.cogs_finalized_at,
    cogsRejectionNote:   v.cogs_rejection_note,
    variantImage:        v.variant_image,
    shopifyProductId:    row.shopify_product_id,
    shopify_product_id:  row.shopify_product_id,
    shopifyImages:       row.shopify_images,
    shopify_images:      row.shopify_images,
    image_url:           row.image_url,
    handle:              row.handle,
    vendor:              row.vendor,
    productType:         row.product_type,
    status:              row.status,
    publishedAt:         row.published_at,
    description:         row.description,
    washCare:            row.wash_care,
    occasionTag:         row.occasion_tag,
    targetGroup:         row.target_group,
    colourPrimary:       row.colour_primary,
    colourSecondary:     row.colour_secondary,
    availableColours:    row.available_colours,
    availableSizes:      row.available_sizes,
    collarType:          row.collar_type,
    sleeveLength:        row.sleeve_length,
    sleeveDesc:          row.sleeve_desc,
    closureType:         row.closure_type,
    pattern:             row.pattern,
    gender:              row.gender,
    season:              row.season,
    styleType:           row.style_type,
    fitType:             row.fit_type,
    lookType:            row.look_type,
    styleTag:            row.style_tag,
    hsn:                 row.hsn,
    countryOfOrigin:     row.country_of_origin,
    manufactureDays:     row.manufacture_days,
    shipTime:            row.ship_time,
    seoTitle:            row.seo_title,
    seoDescription:      row.seo_description,
    importStatus:        row.import_status,
    importReviewReason:  row.import_review_reason,
    importFlaggedAt:     row.import_flagged_at,
    legacyDesignProductIds: row.legacy_design_product_ids,
    // snake passthroughs (parity with productToCamel) so consumers that read
    // snake_case keys keep working unchanged.
    proposed_mrp:        v.proposed_mrp ?? null,
    shopify_tags:        row.shopify_tags,
    tags:                row.tags,
    available_sizes:     row.available_sizes,
    available_colours:   row.available_colours,
    body_html:           row.body_html,
    catalogue_status:    row.catalogue_status,
    product_type:        row.product_type,
    // variants[] in legacy shape = the sizes array of this variant
    variants: (v.sizes || []).map(s => ({
      size:           s.size,
      label:          s.label,
      sku:            s.sku,
      mrp:            s.mrp,
      sellingPrice:   s.selling_price,
      compareAtPrice: s.compare_at_price,
      discount:       s.discount,
      inventory:      s.inventory,
      active:         s.active !== false,
      barcode:        s.barcode,
      weight:         s.weight,
      weightUnit:     s.weight_unit,
      image:          s.image,
      option1:        s.option1,
      option2:        s.option2,
      option3:        s.option3,
      shopifyVariantId: s.shopify_variant_id,
    })),
    // legacy MRP / SP — take from first size
    mrp:            (v.sizes?.[0]?.mrp ?? null),
    sellingPrice:   (v.sizes?.[0]?.selling_price ?? null),
    compareAtPrice: (v.sizes?.[0]?.compare_at_price ?? null),
    inventory:      (v.sizes?.[0]?.inventory ?? 0),
  }))
}

// flattenAllToLegacy
//   rows         catalogue_products rows
//   opts.activeOnly  default true — drop status != 'Active' before flattening so
//                    POS / Calculator / Quotations / etc. never see archived /
//                    draft Shopify products. Pass false to include everything.
/* V2 → legacy products array. Drop-in replacement for fetchAllProducts() that
   reads the canonical Catalogue V2 store (catalogue_products) and returns the
   same camel/legacy shape consumers already expect. activeOnly defaults true. */
export async function fetchAllProductsLegacy(opts = {}) {
  const rows = await fetchAllCatalogueProductsV2()
  return flattenAllToLegacy(rows, opts)
}

export function flattenAllToLegacy(rows, opts = {}) {
  const activeOnly = opts.activeOnly !== false
  const src = activeOnly
    ? (rows || []).filter(r => r.status === 'Active')
    : (rows || [])
  return src.flatMap(flattenCatalogueRowToLegacy)
}

/* ──────────────────────────────────────────────────────────────────────────
   V1 ProductForm interop (Catalogue v2 detail editor)

   The V2 detail page reuses V1's <ProductForm> component, one instance per
   variant. V1 speaks the flat design_products shape; these helpers translate
   a single catalogue_products variant ⇄ that flat shape.

   - variantToLegacyForm(row, variant) → object with the exact keys V1's
     emptyProduct() uses (so every field, dropdown and the size grid populate).
   - legacyFormToVariant(originalVariant, form) → merges the edited flat form
     back onto the original variant, preserving fields V1 never touches
     (composition, shopify_variant_id, option1..3, etc.).
   - saveVariantForm / setVariantReviewStatus persist to catalogue_products.
   ────────────────────────────────────────────────────────────────────────── */

const numOrNull = (v) => (v === '' || v === undefined || v === null ? null : Number(v))

// One catalogue variant → V1 flat product shape (keys match V1 emptyProduct()).
export function variantToLegacyForm(row, variant) {
  const v = variant || {}
  const sizes = Array.isArray(v.sizes) ? v.sizes : []
  const first = sizes[0] || {}
  return {
    id:                v.style_code,
    styleCode:         v.style_code || '',
    productTitle:      row?.product_title || '',
    productName:       row?.product_title || '',
    category:          row?.category || '',
    isSet:             !!v.is_set,
    setComponents:     v.set_components || [],
    fabricId:          v.fabric_id || '',
    fabricName:        v.fabric_name || '',
    fabricSKU:         v.fabric_sku || '',
    fabricDesc:        v.fabric_desc || '',
    fabricTag:         v.fabric_tag || '',
    description:       row?.description || '',
    metres:            v.metres ?? '',
    costPerMetre:      v.cost_per_metre ?? '',
    costType:          v.cost_type || 'per_metre',
    dyeId:             v.dye_id || '',
    dyePerMetre:       v.dye_per_metre ?? '',
    embroidery:        v.embroidery ?? '',
    embroidery_type:   v.embroidery_type || '',
    stitching:         v.stitching ?? '',
    bottomCogs:        v.bottom_cogs ?? '',
    accessories:       v.accessories ?? '',
    mrp:               first.mrp ?? '',
    sellingPrice:      first.selling_price ?? '',
    discount:          first.discount ?? '',
    colourPrimary:     row?.colour_primary || '',
    colourSecondary:   row?.colour_secondary || '',
    styleTag:          row?.style_tag || '',
    occasionTag:       row?.occasion_tag || '',
    washCare:          row?.wash_care || '',
    hsn:               row?.hsn || '',
    weight:            v.weight || '',
    sleeveDesc:        row?.sleeve_desc || '',
    status:            row?.status || 'Active',
    image_url:         v.variant_image || row?.image_url || '',
    shopify_images:    row?.shopify_images || [],
    shopify_product_id: row?.shopify_product_id || '',
    cogs_review_status: v.cogs_review_status || 'pending_entry',
    cogs_entered_by:    v.cogs_entered_by || null,
    cogs_entered_at:    v.cogs_entered_at || null,
    cogs_finalized_by:  v.cogs_finalized_by || null,
    cogs_finalized_at:  v.cogs_finalized_at || null,
    cogs_rejection_note: v.cogs_rejection_note || null,
    // V1 "variants" = the size list of this one variant
    variants: sizes.map(s => ({
      size:           s.size,
      label:          s.label,
      sku:            s.sku,
      mrp:            s.mrp,
      sellingPrice:   s.selling_price,
      compareAtPrice: s.compare_at_price,
      discount:       s.discount,
      inventory:      s.inventory,
      active:         s.active !== false,
      barcode:        s.barcode,
      weight:         s.weight,
      weightUnit:     s.weight_unit,
      image:          s.image,
      option1:        s.option1,
      option2:        s.option2,
      option3:        s.option3,
      shopifyVariantId: s.shopify_variant_id,
    })),
  }
}

// Edited V1 flat form → catalogue variant (merged onto the original variant).
export function legacyFormToVariant(originalVariant, form) {
  const orig = originalVariant || {}
  const origSizes = Array.isArray(orig.sizes) ? orig.sizes : []
  const sizes = (form.variants || []).map(fv => {
    const prev = origSizes.find(s => s.sku === fv.sku) ||
                 origSizes.find(s => s.size === fv.size) || {}
    const mrp = numOrNull(fv.mrp)
    const sp  = numOrNull(fv.sellingPrice)
    return {
      ...prev,
      size:             fv.size,
      label:            fv.label ?? prev.label ?? null,
      sku:              fv.sku,
      mrp,
      selling_price:    sp,
      compare_at_price: numOrNull(fv.compareAtPrice) ?? mrp,
      discount:         (mrp != null && sp != null) ? Math.max(0, mrp - sp) : (prev.discount ?? null),
      inventory:        numOrNull(fv.inventory) ?? prev.inventory ?? 0,
      active:           fv.active !== false,
      barcode:          fv.barcode ?? prev.barcode ?? null,
      weight:           fv.weight ?? prev.weight ?? null,
      weight_unit:      fv.weightUnit ?? prev.weight_unit ?? null,
      image:            fv.image ?? prev.image ?? null,
      option1:          prev.option1 ?? fv.option1 ?? null,
      option2:          prev.option2 ?? fv.option2 ?? null,
      option3:          prev.option3 ?? fv.option3 ?? null,
      shopify_variant_id: prev.shopify_variant_id ?? fv.shopifyVariantId ?? null,
    }
  })
  return {
    ...orig,
    style_code:    form.styleCode || orig.style_code,
    is_set:        !!form.isSet,
    set_components: form.setComponents || [],
    fabric_id:     form.fabricId || null,
    fabric_name:   form.fabricName || null,
    fabric_sku:    form.fabricSKU ?? form.fabricSku ?? orig.fabric_sku ?? null,
    fabric_desc:   form.fabricDesc || null,
    fabric_tag:    form.fabricTag || null,
    cost_type:     form.costType || orig.cost_type || 'per_metre',
    metres:        numOrNull(form.metres),
    cost_per_metre: numOrNull(form.costPerMetre),
    dye_id:        form.dyeId || null,
    dye_per_metre: numOrNull(form.dyePerMetre),
    embroidery:    numOrNull(form.embroidery),
    embroidery_type: form.embroidery_type || null,
    stitching:     numOrNull(form.stitching),
    bottom_cogs:   numOrNull(form.bottomCogs),
    accessories:   numOrNull(form.accessories),
    cogs:          calcCogs(form) || 0,
    variant_image: form.image_url || orig.variant_image || null,
    sizes,
  }
}

// Product-level columns shared across all variants (written from the active tab).
function productPatchFromForm(form, variants) {
  return {
    product_title:    form.productTitle || form.productName || null,
    category:         form.category || null,
    status:           form.status || 'Active',
    description:      form.description || null,
    wash_care:        form.washCare || null,
    hsn:              form.hsn || null,
    colour_primary:   form.colourPrimary || null,
    colour_secondary: form.colourSecondary || null,
    style_tag:        form.styleTag || null,
    occasion_tag:     form.occasionTag || null,
    image_url:        form.image_url || null,
    variants,
    updated_at:       new Date().toISOString(),
  }
}

// Persist an edited variant form. Returns the updated row (local mirror).
export async function saveVariantForm(row, variantIdx, form) {
  const variants = Array.isArray(row.variants) ? [...row.variants] : []
  variants[variantIdx] = legacyFormToVariant(variants[variantIdx], form)
  const patch = productPatchFromForm(form, variants)
  const { error } = await supa.from('catalogue_products').update(patch).eq('id', row.id)
  if (error) throw error
  return { ...row, ...patch }
}

// Stamp a variant's COGS review workflow status and persist.
export async function setVariantReviewStatus(row, variantIdx, status, userEmail, note) {
  const variants = Array.isArray(row.variants) ? [...row.variants] : []
  const v = { ...(variants[variantIdx] || {}) }
  const now = new Date().toISOString()
  v.cogs_review_status = status
  if (status === 'in_review')  { v.cogs_entered_by = userEmail || 'unknown'; v.cogs_entered_at = now; v.cogs_rejection_note = null }
  if (status === 'finalized')  { v.cogs_finalized_by = userEmail || 'unknown'; v.cogs_finalized_at = now }
  if (status === 'rejected')   { v.cogs_rejection_note = note || null; v.cogs_finalized_by = null; v.cogs_finalized_at = null }
  if (status === 'pending_entry') { v.cogs_finalized_by = null; v.cogs_finalized_at = null; v.cogs_rejection_note = null }
  variants[variantIdx] = v
  const { error } = await supa.from('catalogue_products')
    .update({ variants, updated_at: now }).eq('id', row.id)
  if (error) throw error
  return { ...row, variants }
}

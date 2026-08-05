/**
 * camelCase <-> snake_case mapping for Supabase migration.
 *
 * The DB uses snake_case columns; the front-end React code uses camelCase.
 * These helpers convert individual objects (rows) back and forth so existing
 * component code keeps working without touching every prop reference.
 */

// ── Product (design_products) ────────────────────────────────────────────────

const PRODUCT_CAMEL_TO_SNAKE = {
  styleCode:        'style_code',
  productTitle:     'product_title',
  productName:      'product_title',   // legacy alias -> same DB column
  fabricId:         'fabric_id',
  fabricName:       'fabric_name',
  costPerMetre:     'cost_per_metre',
  dyeId:            'dye_id',
  dyePerMetre:      'dye_per_metre',
  sellingPrice:     'selling_price',
  totalDye:         'total_dye',
  fabricSKU:        'fabric_sku',
  fabricDesc:       'fabric_desc',
  styleTag:         'style_tag',
  colourPrimary:    'colour_primary',
  colourSecondary:  'colour_secondary',
  sleeveDesc:       'sleeve_desc',
  occasionTag:      'occasion_tag',
  fabricTag:        'fabric_tag',
  washCare:         'wash_care',
  setComponents:    'set_components',
  bottomCogs:       'bottom_cogs',
  isSet:            'is_set',
  isOffer:          'is_offer',
  offerNote:        'offer_note',
  offerGroup:       'offer_group',
  createdByRole:    'created_by_role',
  updatedByRole:    'updated_by_role',
};

// Keys that are already snake_case in the front-end code — pass through
const PRODUCT_PASSTHROUGH = new Set([
  'id', 'category', 'metres', 'embroidery', 'stitching', 'accessories',
  'mrp', 'discount', 'cogs', 'handle', 'hsn', 'weight', 'description',
  'body_html', 'product_type', 'vendor', 'status', 'image_url',
  'shopify_product_id', 'shopify_style_code', 'shopify_tags',
  'shopify_collections', 'shopify_images', 'shopify_options',
  'shopify_variants', 'variants', 'published_at',
  'created_at_shopify', 'updated_at_shopify',
  'created_by', 'updated_by', 'created_at', 'updated_at',
  // ── Catalogue / Collections fields ──
  'catalogue_status', 'production_stage', 'promoted_to_catalogue',
  'collection_id', 'image_urls', 'image_notes',
  'proposed_mrp', 'manufacture_days',
  'seo_title', 'seo_description',
  'available_sizes', 'available_colours',
  'style_type', 'fit_type', 'look_type',
  'set_of', 'tags',
  // ── COGS Review fields ──
  'cogs_review_status', 'cogs_entered_by', 'cogs_entered_at',
  'cogs_finalized_by', 'cogs_finalized_at', 'cogs_rejection_note',
  'embroidery_type',
]);

// Reverse map: snake_case -> camelCase (built once)
const PRODUCT_SNAKE_TO_CAMEL = {};
for (const [camel, snake] of Object.entries(PRODUCT_CAMEL_TO_SNAKE)) {
  // productName and productTitle both map to product_title; when reading back
  // we produce both camelCase keys for compatibility
  if (!PRODUCT_SNAKE_TO_CAMEL[snake]) {
    PRODUCT_SNAKE_TO_CAMEL[snake] = camel;
  }
}

/** Convert a front-end product object (camelCase) to a DB row (snake_case). */
export function productToSnake(obj) {
  if (!obj) return obj;
  const row = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    const snakeKey = PRODUCT_CAMEL_TO_SNAKE[key] || (PRODUCT_PASSTHROUGH.has(key) ? key : null);
    if (snakeKey) {
      // productName and productTitle both map to product_title — take whichever is defined
      if (snakeKey === 'product_title' && row['product_title'] !== undefined && row['product_title'] !== '') continue;
      row[snakeKey] = val;
    }
    // Skip unknown keys (front-end transient state like `_supaId`)
  }
  // Ensure numeric fields are numbers, not strings
  const numericFields = ['cost_per_metre', 'dye_per_metre', 'selling_price', 'mrp', 'discount',
    'embroidery', 'stitching', 'accessories', 'metres', 'total_dye', 'cogs', 'weight', 'bottom_cogs'];
  for (const f of numericFields) {
    if (row[f] !== undefined && row[f] !== null && row[f] !== '') {
      row[f] = Number(row[f]) || 0;
    }
  }
  return row;
}

/** Convert a DB row (snake_case) to a front-end product object (camelCase). */
export function productToCamel(row) {
  if (!row) return row;
  const obj = {};
  for (const [key, val] of Object.entries(row)) {
    const camelKey = PRODUCT_SNAKE_TO_CAMEL[key];
    if (camelKey) {
      obj[camelKey] = val;
      // For product_title, also set productName for backward compat
      if (key === 'product_title') {
        obj.productTitle = val;
        obj.productName = val;
      }
    }
    // Passthrough keys (already snake_case in FE)
    if (PRODUCT_PASSTHROUGH.has(key)) {
      obj[key] = val;
    }
  }
  return obj;
}


// ── Dye Masters (dye_masters) ────────────────────────────────────────────────

export function dyeToCamel(row) {
  if (!row) return row;
  return {
    id: row.id,
    type: row.type || '',
    costPerMetre: Number(row.cost_per_metre) || 0,
  };
}

export function dyeToSnake(obj) {
  if (!obj) return obj;
  return {
    id: obj.id,
    type: obj.type || '',
    cost_per_metre: Number(obj.costPerMetre) || 0,
  };
}


// ── Product Categories (product_categories) ──────────────────────────────────

export function categoryToCamel(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name || '',
    group: row.group_name || '',
    shopify_tag: row.shopify_tag || '',
    defaultAccessories: row.default_accessories || [],
  };
}

export function categoryToSnake(obj) {
  if (!obj) return obj;
  return {
    id: obj.id,
    name: obj.name || '',
    group_name: obj.group || '',
    shopify_tag: obj.shopify_tag || '',
    default_accessories: obj.defaultAccessories || [],
  };
}


// ── Consumption Masters (consumption_masters) ────────────────────────────────

export function consumptionToCamel(row) {
  if (!row) return row;
  return {
    id: row.id,
    category: row.category || '',
    fabricId: row.fabric_id || '',
    fabricName: row.fabric_name || '',
    metres: Number(row.metres) || 0,
  };
}

export function consumptionToSnake(obj) {
  if (!obj) return obj;
  return {
    id: obj.id,
    category: obj.category || '',
    fabric_id: obj.fabricId || '',
    fabric_name: obj.fabricName || '',
    metres: Number(obj.metres) || 0,
  };
}


// ── Sales Channels (sales_channels) ──────────────────────────────────────────

export function channelToCamel(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name || '',
    type: row.type || '',
    commission_pct: Number(row.commission_pct) || 0,
    is_active: row.is_active !== false,
    // Keep any extra fields the front-end added (key, label, emoji, etc.)
    key: row.key || row.name || '',
    label: row.label || row.name || '',
    emoji: row.emoji || '',
    adPlatform: row.ad_platform || '',
    color: row.color || 'gray',
  };
}

export function channelToSnake(obj) {
  if (!obj) return obj;
  return {
    id: obj.id,
    name: obj.name || obj.label || '',
    type: obj.type || '',
    commission_pct: Number(obj.commission_pct) || 0,
    is_active: obj.is_active !== false,
    // Extended fields stored as-is (the DB table has these columns or they'll be ignored)
    key: obj.key || '',
    label: obj.label || '',
    emoji: obj.emoji || '',
    ad_platform: obj.adPlatform || '',
    color: obj.color || 'gray',
  };
}

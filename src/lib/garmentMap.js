/**
 * Product category → ready-measurement garment mapping.
 *
 * The four ready-measurement sets stored on customer_style_profiles JSONB
 * columns are: shirt, kurtha, blazer, pant.
 *
 * For any product (line item / catalogue product), this module answers:
 *   - which top garment's ready measurements should be printed?
 *   - which bottom garment's ready measurements should be printed?
 *
 * Rules (per Sahith, May 2026):
 *   - Strict garment match: no substitution between the four sets.
 *     A Kurta product cannot use Shirt ready measurements, even if Shirt is
 *     the only ready set the customer has provided.
 *   - Pant is the universal bottom: any product that includes a bottom
 *     component (Kurta Set, Sherwani, Suit, Doti-Kurta, Pattu Set, etc.)
 *     uses the customer's pant ready measurements.
 *   - Standalone tops (Shirt, Shacket, plain Kurta, plain Blazer, Nehru
 *     Jacket) have no bottom garment.
 *   - Standalone bottoms (Ethnic Pants, Doti, Churidar) have no top garment.
 *   - Accessories / kids / dupatta have neither.
 *
 * The lookup is case-insensitive and forgiving about whitespace and "Set"/
 * "Bandh-" variants. If nothing matches, we return { topGarment: null,
 * bottomGarment: null } and the print slip hides both tables.
 */

export const GARMENTS = ['shirt', 'kurtha', 'blazer', 'pant']

// Canonical mapping: keyed by product_categories.name (lowercased, trimmed).
// Edit this table to adjust which garment a category maps to.
const CATEGORY_MAP = {
  // ── Urban Wear ─────────────────────────────────────────────
  'shirt':         { top: 'shirt',  bottom: null   },
  'shacket':       { top: 'shirt',  bottom: null   },
  'blazer':        { top: 'blazer', bottom: null   },  // standalone (Plain blazer)

  // ── Occasion Wear ──────────────────────────────────────────
  'kurta':         { top: 'kurtha', bottom: null   },  // standalone top
  'kurta set':     { top: 'kurtha', bottom: 'pant' },
  'pattu set':     { top: 'kurtha', bottom: 'pant' },
  'raghukula':     { top: 'kurtha', bottom: 'pant' },
  'sherwani':      { top: 'blazer', bottom: 'pant' },
  'indowestern':   { top: 'blazer', bottom: 'pant' },
  'bling blazer':  { top: 'blazer', bottom: 'pant' },  // suit/tuxedo
  'nehru jacket':  { top: 'blazer', bottom: null   },  // worn over kurta

  'ethnic pants':  { top: null,     bottom: 'pant' },

  // ── Accessories / Kids ─────────────────────────────────────
  'jewellery':     { top: null,     bottom: null   },
  'pagdi':         { top: null,     bottom: null   },
  'shoes':         { top: null,     bottom: null   },
  'dupatta':       { top: null,     bottom: null   },
  'kids fashion':  { top: null,     bottom: null   },
}

// Keyword fallback — scans product title + sku + category string when the
// category name doesn't match exactly. Order matters: more specific first.
const KEYWORD_RULES = [
  // Sets / suits — anything that includes the word "set" or "suit/tuxedo"
  { match: /\b(kurta\s*set|kurtaset)\b/i,        top: 'kurtha', bottom: 'pant' },
  { match: /\b(pattu\s*set|raghukula)\b/i,       top: 'kurtha', bottom: 'pant' },
  { match: /\b(suit|tuxedo|bandhgala|achkan)\b/i, top: 'blazer', bottom: 'pant' },
  { match: /\b(sherwani|indowestern)\b/i,        top: 'blazer', bottom: 'pant' },
  // Kurta family — doti-kurta, patu-kurta etc.
  { match: /\b(doti\s*kurta|patu\s*kurta|bandh\s*kurta)\b/i, top: 'kurtha', bottom: 'pant' },
  { match: /\bkurta\b/i,                         top: 'kurtha', bottom: null  },
  // Bottoms standalone
  { match: /\b(doti|dhoti|churidar|salwar|pyjama|pajama)\b/i, top: null, bottom: 'pant' },
  { match: /\b(ethnic\s*pants?|pants?|trouser|trousers)\b/i,   top: null, bottom: 'pant' },
  // Blazer / Nehru
  { match: /\bnehru\s*jacket\b/i,                top: 'blazer', bottom: null  },
  { match: /\bblazer\b/i,                        top: 'blazer', bottom: null  },
  // Shirts
  { match: /\b(shacket|shirts?)\b/i,             top: 'shirt',  bottom: null  },
  // Accessories — explicit no-garment so we don't accidentally fall through
  { match: /\b(jewellery|jewelry|pagdi|pagadi|shoes|dupatta|kids)\b/i, top: null, bottom: null },
]

const _norm = (v) => (v == null ? '' : String(v).toLowerCase().trim().replace(/\s+/g, ' '))

/**
 * Resolve which ready-measurement garments to use for a product.
 *
 * @param {object} opts
 * @param {string} [opts.category]  product_categories.name
 * @param {string} [opts.title]     product title (fallback)
 * @param {string} [opts.sku]       product sku (last-resort fallback)
 * @returns {{ topGarment: string|null, bottomGarment: string|null, source: string }}
 *   source: 'category' | 'keyword' | 'none' — useful for debug/UI labels.
 */
export const resolveGarments = ({ category, title, sku } = {}) => {
  const cat = _norm(category)
  if (cat && CATEGORY_MAP[cat]) {
    const m = CATEGORY_MAP[cat]
    return { topGarment: m.top, bottomGarment: m.bottom, source: 'category' }
  }
  const haystack = [category, title, sku].filter(Boolean).join(' ')
  for (const rule of KEYWORD_RULES) {
    if (rule.match.test(haystack)) {
      return { topGarment: rule.top, bottomGarment: rule.bottom, source: 'keyword' }
    }
  }
  return { topGarment: null, bottomGarment: null, source: 'none' }
}

// Pretty labels for the print slip column header / banner.
export const GARMENT_LABEL = {
  shirt:  'Shirt',
  kurtha: 'Kurtha',
  blazer: 'Blazer',
  pant:   'Pant',
}

/**
 * Build the "Ready measurements shown: ..." banner string for the print slip.
 * Returns '' when neither top nor bottom garment maps.
 */
export const readyBannerText = (topGarment, bottomGarment) => {
  const parts = []
  if (topGarment) parts.push(`${GARMENT_LABEL[topGarment] || topGarment} (top)`)
  if (bottomGarment) parts.push(`${GARMENT_LABEL[bottomGarment] || bottomGarment} (bottom)`)
  if (parts.length === 0) return ''
  return 'Ready measurements shown: ' + parts.join(', ') + '.'
}

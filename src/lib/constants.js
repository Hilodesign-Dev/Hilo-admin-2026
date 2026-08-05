// ─── Single source of truth for top-level tabs ─────────────────────────────
// id              → hash route + permission key
// label           → shown in sidebar AND in Team Access chips
// icon            → sidebar icon name (from components/Icon.jsx)
// adminOnly:true  → only founders / admins see it; never goes into ALL_TABS
//                   so a non-admin can't be granted it
// hideFromSidebar → still a permission key + Team Access chip, but not
//                   rendered in the sidebar (it's a sub-tab of another tab
//                   reachable through its parent's hash)
//
// Adding a new top-level tab: add ONE row here and the sidebar, mobile nav,
// and Team Access list pick it up automatically.
export const ALL_NAV = [
  { id: 'tasks',        label: 'My Tasks',           icon: 'grid' },
  { id: 'overview',     label: 'Overview',           icon: 'chart' },
  { id: 'calculator',   label: 'Calculator',         icon: 'table',   hideFromSidebar: true },
  { id: 'catalogue',    label: 'Catalogue',          icon: 'list',    hideFromSidebar: true },
  { id: 'catalogue-v2', label: 'Catalogue V2',       icon: 'list' },
  { id: 'inventory',    label: 'Inventory',          icon: 'table' },
  { id: 'offers',       label: 'Offers',             icon: 'tag',     hideFromSidebar: true },
  { id: 'pos',          label: 'POS',                icon: 'bag' },
  { id: 'dashboard',    label: 'Dashboard',          icon: 'chart',   hideFromSidebar: true },
  { id: 'growth',       label: 'Marketing',          icon: 'trend' },
  { id: 'production',   label: 'Production',         icon: 'factory' },
  { id: 'fulfillment',  label: 'Fulfillment',        icon: 'truck' },
  { id: 'delayed',      label: 'Delayed Reporting',  icon: 'clock' },
  { id: 'collections',  label: 'Collections',        icon: 'grid' },
  { id: 'customers',    label: 'Customers',          icon: 'people' },
  { id: 'leads',        label: 'Leads CRM',          icon: 'funnel' },
  { id: 'fabrics',      label: 'Fabrics',            icon: 'tag' },
  { id: 'outsource',    label: 'Outsource Vendors',  icon: 'people' },
  { id: 'masters',      label: 'Masters',            icon: 'table' },
  { id: 'returns',      label: 'Returns',            icon: 'tag' },
  { id: 'gst',          label: 'GST',                icon: 'money' },
  { id: 'finance',      label: 'Finance',            icon: 'money' },
  { id: 'franchises',   label: 'Franchises',         icon: 'store' },
  { id: 'hiring',       label: 'Hiring',             icon: 'people' },
  { id: 'users',        label: 'Team Access',        icon: 'people',  adminOnly: true },
]

export const ALL_TABS   = ALL_NAV.filter(n => !n.adminOnly).map(n => n.id)
export const TAB_LABELS = Object.fromEntries(ALL_NAV.map(n => [n.id, n.label]))
export const DEFAULT_TABS = ['pos', 'catalogue']

export const ROLE_PRESETS = {
  founder:            { label: 'Founder',            tabs: ALL_TABS, locked: true },
  admin:              { label: 'Admin',              tabs: ALL_TABS, locked: true },
  operations_manager: { label: 'Operations Manager', tabs: ['pos','dashboard','production','fulfillment','delayed','collections','fabrics','outsource','customers','leads','masters','returns'] },
  production_manager: { label: 'Production Manager', tabs: ['pos','production','fulfillment','outsource','fabrics','delayed'] },
  stylist:            { label: 'Stylist',            tabs: ['pos','catalogue','offers','collections','leads','customers'] },
  designer:           { label: 'Designer',           tabs: ['catalogue','collections','fabrics'] },
  growth_manager:     { label: 'Growth Manager',     tabs: ['growth','dashboard','leads','offers','customers'] },
  tailor_lead:        { label: 'Tailor Lead',        tabs: ['pos','production','fulfillment','delayed'] },
  fulfillment_ops:    { label: 'Fulfillment Ops',    tabs: ['pos','fulfillment','delayed'] },
  finance:            { label: 'Finance',            tabs: ['pos','finance','outsource','fabrics','returns'] },
  intern:             { label: 'Intern',             tabs: DEFAULT_TABS },
  custom:             { label: 'Custom',             tabs: [] },
}

const LEGACY_TAB_REMAP = {
  // Old top-level tab → new super-tab that now hosts it as a sub-view
  calculator: 'pos',
  offers:     'catalogue',
  dashboard:  'catalogue',
}
const upgradeLegacyTabs = (tabs) => {
  const out = new Set()
  for (const t of tabs) {
    out.add(t)
    if (LEGACY_TAB_REMAP[t]) out.add(LEGACY_TAB_REMAP[t])
  }
  return Array.from(out)
}

export const getUserTabs = (member) => {
  if (!member) return upgradeLegacyTabs(DEFAULT_TABS)
  if (member.role === 'admin' || member.role === 'founder') return upgradeLegacyTabs(ALL_TABS)
  return upgradeLegacyTabs([...(member.tabs || DEFAULT_TABS), 'tasks', 'inventory'])
}

export const DEFAULT_CATEGORIES = [
  { id:'cat1',  name:'Kurta',           shopify_tag:'Kurta',             group:'Occasion Wear',     defaultAccessories:[{id:'a1',name:'Buttons',cost:20},{id:'a2',name:'Thread',cost:10},{id:'a3',name:'Label',cost:15},{id:'a4',name:'Packaging',cost:30}] },
  { id:'cat2',  name:'Kurta Set',       shopify_tag:'Kurta Set',         group:'Occasion Wear',     defaultAccessories:[{id:'a5',name:'Buttons',cost:20},{id:'a6',name:'Thread',cost:15},{id:'a7',name:'Label',cost:15},{id:'a8',name:'Elastic',cost:10},{id:'a9',name:'Packaging',cost:40}] },
  { id:'cat8',  name:'Nehru Jacket',    shopify_tag:'Nehru Jacket',      group:'Occasion Wear',     defaultAccessories:[{id:'a30',name:'Buttons',cost:40},{id:'a31',name:'Thread',cost:15},{id:'a32',name:'Label',cost:15}] },
  { id:'cat5',  name:'Indowestern',     shopify_tag:'Indowestern',       group:'Occasion Wear',     defaultAccessories:[{id:'a18',name:'Buttons',cost:40},{id:'a19',name:'Thread',cost:15},{id:'a20',name:'Label',cost:15},{id:'a21',name:'Packaging',cost:40}] },
  { id:'cat12', name:'Bandhgala',       shopify_tag:'Bandhgala',         group:'Occasion Wear',     defaultAccessories:[{id:'a43',name:'Buttons',cost:50},{id:'a44',name:'Thread',cost:20},{id:'a45',name:'Label',cost:20}] },
  { id:'cat14', name:'Bling Blazer',    shopify_tag:'Bling Blazer',      group:'Occasion Wear',     defaultAccessories:[{id:'b1',name:'Buttons',cost:60},{id:'b2',name:'Thread',cost:20},{id:'b3',name:'Label',cost:20},{id:'b4',name:'Lining',cost:150}] },
  { id:'cat10', name:'Pattu Set',       shopify_tag:'Pattu Set',         group:'Occasion Wear',     defaultAccessories:[{id:'a36',name:'Buttons',cost:30},{id:'a37',name:'Thread',cost:20},{id:'a38',name:'Label',cost:20},{id:'a39',name:'Packaging',cost:50}] },
  { id:'cat6',  name:'Sherwani',        shopify_tag:'Sherwani',          group:'Occasion Wear',     defaultAccessories:[{id:'a22',name:'Buttons',cost:50},{id:'a23',name:'Thread',cost:20},{id:'a24',name:'Label',cost:20},{id:'a25',name:'Packaging',cost:60}] },
  { id:'cat11', name:'Bottom',          shopify_tag:'Bottom',            group:'Occasion Wear',     defaultAccessories:[{id:'a40',name:'Elastic',cost:15},{id:'a41',name:'Thread',cost:10},{id:'a42',name:'Label',cost:10}] },
  { id:'cat20', name:'Ethnic Pants',    shopify_tag:'Ethnic Pants',      group:'Occasion Wear',     defaultAccessories:[{id:'b8',name:'Elastic',cost:15},{id:'b9',name:'Thread',cost:10},{id:'b10',name:'Label',cost:10}] },
  { id:'cat3',  name:'Shirt',           shopify_tag:'Shirts',            group:'Urban Wear',        defaultAccessories:[{id:'a10',name:'Buttons',cost:30},{id:'a11',name:'Thread',cost:10},{id:'a12',name:'Label',cost:15},{id:'a13',name:'Packaging',cost:30}] },
  { id:'cat4',  name:'Shirt Set',       shopify_tag:'Shirt Set',         group:'Urban Wear',        defaultAccessories:[{id:'a14',name:'Buttons',cost:30},{id:'a15',name:'Thread',cost:15},{id:'a16',name:'Label',cost:15},{id:'a17',name:'Elastic',cost:10}] },
  { id:'cat9',  name:'Shacket',         shopify_tag:'Shacket',           group:'Urban Wear',        defaultAccessories:[{id:'a33',name:'Buttons',cost:40},{id:'a34',name:'Thread',cost:15},{id:'a35',name:'Label',cost:15}] },
  { id:'cat7',  name:'Blazer',          shopify_tag:'Blazer',            group:'Urban Wear',        defaultAccessories:[{id:'a26',name:'Buttons',cost:60},{id:'a27',name:'Thread',cost:20},{id:'a28',name:'Label',cost:20},{id:'a29',name:'Lining',cost:150}] },
  { id:'cat15', name:'Trouser',         shopify_tag:'Trouser',           group:'Urban Wear',        defaultAccessories:[{id:'b5',name:'Elastic',cost:15},{id:'b6',name:'Thread',cost:10},{id:'b7',name:'Label',cost:10}] },
  { id:'cat16', name:'Kids Fashion',    shopify_tag:'kids',              group:'Kids',              defaultAccessories:[] },
  { id:'cat17', name:'Pagdi',           shopify_tag:'Pagdi',             group:'Accessories',       defaultAccessories:[] },
  { id:'cat18', name:'Shoes',           shopify_tag:'Shoes',             group:'Accessories',       defaultAccessories:[] },
  { id:'cat19', name:'Jewellery',       shopify_tag:'Jewellery',         group:'Accessories',       defaultAccessories:[] },
  { id:'cat21', name:'Raghukula',       shopify_tag:'Raghukula',         group:'Raghukula',         defaultAccessories:[] },
  { id:'cat13', name:'Other',           shopify_tag:'',                  group:'',                  defaultAccessories:[] },
]

export const DEFAULT_FABRIC_VENDORS = [
  { id: 'HL-FV-01', name: 'Vivek Pattu', location: '', contact: '', gstin: '' },
  { id: 'HL-FV-02', name: 'ZYLK', location: '', contact: '', gstin: '' },
  { id: 'HL-FV-03', name: 'Subhash', location: 'Hyderabad', contact: '', gstin: '' },
  { id: 'HL-FV-04', name: 'Ramavilaas', location: '', contact: '', gstin: '' },
  { id: 'HL-FV-05', name: 'Galaxy', location: '', contact: '', gstin: '' },
  { id: 'HL-FV-06', name: 'NVK Nandlal', location: '', contact: '', gstin: '' },
  { id: 'HL-FV-07', name: 'Ankur', location: '', contact: '', gstin: '' },
  { id: 'HL-FV-08', name: 'Yashoda', location: '', contact: '', gstin: '' },
  { id: 'HL-FV-09', name: 'Sujith Enterprise', location: 'Mumbai', contact: '', gstin: '' },
  { id: 'HL-FV-10', name: 'Disha Hub', location: '', contact: '', gstin: '' },
  { id: 'HL-FV-11', name: 'Swiss Images', location: '', contact: '', gstin: '' },
]

export const DEFAULT_OUTSOURCE_VENDORS = [
  { id: 'HL-OV-01', name: 'Mansoor', type: 'Tailoring', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-02', name: 'Biswajit', type: 'Tailoring', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-03', name: 'Naaz', type: 'Tailoring', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-04', name: 'Siraj', type: 'Tailoring', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-05', name: 'Rafiq', type: 'Tailoring', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-06', name: 'Adil', type: 'Tailoring', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-07', name: 'Syed', type: 'Tailoring', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-08', name: 'Ashwaq', type: 'Tailoring', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-09', name: 'Raja', type: 'Dyeing', location: '', contact: '', rate: '', rateUnit: 'per metre' },
  { id: 'HL-OV-10', name: 'Jamshed', type: 'Dyeing', location: '', contact: '', rate: '', rateUnit: 'per metre' },
  { id: 'HL-OV-11', name: 'Pramod', type: 'Dyeing', location: '', contact: '', rate: '', rateUnit: 'per metre' },
  { id: 'HL-OV-12', name: 'Sanjay', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-13', name: 'Abul', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-14', name: 'Nazir', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-15', name: 'Samim', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-16', name: 'Jafar', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-17', name: 'Ayan', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-18', name: 'Arfat', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-19', name: 'Sameer Ali', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-20', name: 'Rehaman', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-21', name: 'Venugopal', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-22', name: 'Kutub', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-23', name: 'Jahed', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-24', name: 'Ramjan', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-25', name: 'Nasir Mallick', type: 'Hand Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-26', name: 'Saddam', type: 'Machine Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-27', name: 'Alam', type: 'Machine Embroidery', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-28', name: 'Sathwika', type: 'Hand Painting', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-29', name: 'Prasanna', type: 'Hand Painting', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-30', name: 'Sameer', type: 'Hand Painting', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-31', name: 'Hyder', type: 'Accessories', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-32', name: 'Sunny Jyoti', type: 'Accessories', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-33', name: 'Saruk', type: 'Other', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-34', name: 'Shaik Farooq Ali', type: 'Other', location: '', contact: '', rate: '', rateUnit: 'per piece' },
  { id: 'HL-OV-35', name: 'Munzamil', type: 'Other', location: '', contact: '', rate: '', rateUnit: 'per piece' },
]

export const OUTSOURCE_TYPES = ['Tailoring', 'Dyeing', 'Hand Embroidery', 'Machine Embroidery', 'Hand Painting', 'Accessories', 'Dhoti', 'Finishing', 'Other']

export const CHANNEL_COLORS = {
  blue:   'bg-blue-50 text-blue-700',
  pink:   'bg-pink-50 text-pink-700',
  green:  'bg-green-50 text-green-700',
  yellow: 'bg-yellow-50 text-yellow-700',
  purple: 'bg-purple-50 text-purple-700',
  red:    'bg-red-50 text-red-700',
  gray:   'bg-gray-100 text-gray-600',
}

export const DEFAULT_CHANNELS = [
  { id: 'ch-shopify',   key: 'shopify',   label: 'Shopify',   emoji: '🛒', adPlatform: '',          color: 'blue'   },
  { id: 'ch-instagram', key: 'instagram', label: 'Instagram', emoji: '📷', adPlatform: 'instagram', color: 'pink'   },
  { id: 'ch-whatsapp',  key: 'whatsapp',  label: 'WhatsApp',  emoji: '💬', adPlatform: '',          color: 'green'  },
  { id: 'ch-store',     key: 'store',     label: 'Store',     emoji: '🏪', adPlatform: '',          color: 'yellow' },
  { id: 'ch-other',     key: 'other',     label: 'Other',     emoji: '📦', adPlatform: '',          color: 'gray'   },
]

export const CATEGORIES = [
  'Kurta','Kurta Set','Nehru Jacket','Indowestern','Bandhgala','Blazer','Pattu Set','Sherwani','Bottom',
  'Shirt','Shirt Set','Shacket',
  'Bling Blazer','Ethnic Pants','Trouser','Kids Fashion','Pagdi','Shoes','Jewellery',
  'Raghukula','Other',
]

export const VALID_SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'MTF']

// Category code mapping for auto-SKU generation
// Standalone product gets the base code, set product gets code + 'S' suffix
export const CATEGORY_CODES = {
  'Kurta':        'KU',
  'Kurta Set':    'KUS',
  'Nehru Jacket': 'NJ',
  'Indowestern':  'IW',
  'Bandhgala':    'BG',
  'Blazer':       'BL',
  'Pattu Set':    'PS',
  'Sherwani':     'SH',
  'Bottom':       'BT',
  'Shirt':        'HS',
  'Shirt Set':    'HSS',
  'Shacket':      'SK',
  'Bling Blazer': 'BB',
  'Ethnic Pants': 'EP',
  'Trouser':      'TR',
  'Kids Fashion': 'KF',
  'Pagdi':        'PG',
  'Shoes':        'SHO',
  'Jewellery':    'JW',
  'Raghukula':    'RG',
  'Other':        'OT',
}

// Get the style code prefix for a category (e.g., 'Sherwani' → 'HL-SH')
// For sets, pass isSet=true to get the set variant (e.g., 'HL-SHS')
export const getCategoryPrefix = (category, isSet = false) => {
  const code = CATEGORY_CODES[category] || 'OT'
  // If the category already ends with 'S' (like 'Kurta Set' → 'KUS'), don't double-add
  // Only add 'S' suffix for categories that are standalone but used in a set variant track
  if (isSet && !category.toLowerCase().includes('set')) {
    return `HL-${code}S`
  }
  return `HL-${code}`
}

// Target groups for product targeting
export const TARGET_GROUPS = ['Groom', 'Own Event', 'Attending Event', 'Everyday Style']

// Occasion options — aligned with Shopify SEO playbook
export const OCCASION_OPTIONS = ['Resort', 'Brunch', 'Casual', 'Evening', 'Wedding', 'Festive', 'Formal', 'Travel', 'Eid', 'Diwali', 'Haldi', 'Mehendi', 'Sangeet', 'Reception', 'Party', 'Daily Wear', 'Corporate']

// Collar / Neckline options
export const COLLAR_OPTIONS = ['Mandarin', 'Classic', 'Open', 'Banded', 'V-neck', 'n/a']

// Sleeve length options
export const SLEEVE_OPTIONS = ['Full Sleeve', 'Half Sleeve', '3/4 Sleeve', 'Sleeveless', 'n/a']

// Closure options
export const CLOSURE_OPTIONS = ['Buttons', 'Zip', 'Hidden Placket', 'Hooks', 'Open']

// Pattern / Detail options
export const PATTERN_OPTIONS = ['Plain', 'Embroidered', 'Printed', 'Block Printed', 'Hand Embroidered', 'Hand Painted', 'Striped', 'Checked']

// Embroidery type (when pattern involves embroidery)
export const EMBROIDERY_TYPE_OPTIONS = ['None', 'Hand Embroidery', 'Thread Embroidery', 'Thread Embroidery + Hand Highlighting']

// Ship time options (days)
export const SHIP_TIME_OPTIONS = [7, 10, 14, 20]

// Season options
export const SEASON_OPTIONS = ['Summer', 'Winter', 'Festive', 'All-season']

// Order type (variant level)
export const ORDER_TYPE_OPTIONS = ['Made to Order', 'Ready to Ship']

// Default MTF upcharge (INR)
export const DEFAULT_MTF_UPCHARGE = 1000

// Variant sizes for SKU generation — maps size label to SKU suffix
export const VARIANT_SIZES = [
  { size: 'S',   label: 'Small',       suffix: 'S' },
  { size: 'M',   label: 'Medium',      suffix: 'M' },
  { size: 'L',   label: 'Large',       suffix: 'L' },
  { size: 'XL',  label: 'XL',          suffix: 'XL' },
  { size: 'XXL', label: 'XXL',         suffix: 'XXL' },
  { size: 'MTF', label: 'Made to Fit', suffix: 'MTF' },
]

// Generate SKU from style code + size
export const generateSKU = (styleCode, sizeSuffix) => {
  if (!styleCode) return ''
  return `${styleCode.trim()}-${sizeSuffix}`
}

// Build default variants array from style code, MRP, and selling price
export const buildDefaultVariants = (styleCode, mrp, sellingPrice) => {
  return VARIANT_SIZES.map(v => ({
    size: v.size,
    label: v.label,
    sku: generateSKU(styleCode, v.suffix),
    mrp: +mrp || 0,
    sellingPrice: +sellingPrice || +mrp || 0,
    compareAtPrice: +mrp || 0, // Shopify's compare_at_price = MRP (strikethrough)
    active: true, // all sizes active by default including MTF
    inventory: 0,
    barcode: '',
  }))
}

export const CUSTOMER_TYPES = [
  { key: 'normal', label: 'Normal', badge: '⚪', color: '#807664', bg: 'rgba(128,118,100,0.1)' },
  { key: 'repeat', label: 'Repeat', badge: '🔵', color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  { key: 'elite', label: 'Elite', badge: '🟣', color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  { key: 'royal', label: 'Royal', badge: '👑', color: '#d4a843', bg: 'rgba(212,168,67,0.15)' }
]

export const SOURCE_OPTIONS = ['shopify','walk_in','referral','instagram','lead']
export const SOURCE_LABELS = { shopify: 'Shopify', walk_in: 'Walk-in', referral: 'Referral', instagram: 'Instagram', lead: 'Lead' }
export const RELATIONSHIP_OPTIONS = ['self','father','mother','brother','sister','wife','husband','friend','other']
export const GENDER_OPTIONS = ['male','female','other']

export const VALID_PAGES = ['pos','catalogue','growth','masters','users']
export const GROWTH_SUBTABS = ['orders','production','adspend','analytics','cogs-entry']

export const HSN_CODES = {
  'Shirt': '62052000',
  'Shacket': '62043200',
  'Indo Western': '62114210',
  'Kurta': '62114210',
  'Kurta Set': '62114210',
  'Sherwani': '62114210',
  'Sherwani Set': '62114210',
  'Nehru Jacket': '62043200',
  'Trouser': '62034200',
  'Pagdi': '65050090',
  'Kids Kurta': '62114210',
  'Kids Sherwani': '62114210'
};
export const HSN_OPTIONS = ['62052000', '62043200', '62114210', '62034200', '65050090'];

// Empty data for seeding
export const SEED_DATA = {
  products: [],
  fabrics: [],
  stitching: [],
  dyes: [],
}

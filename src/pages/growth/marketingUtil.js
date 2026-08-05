/* Shared helpers for the Marketing module (ROI + Campaigns subtabs) */
export const fmtINR = n => { if (n == null || isNaN(n)) return '—'; const a = Math.abs(n); if (a >= 1e7) return '₹' + (n / 1e7).toFixed(2) + 'Cr'; if (a >= 1e5) return '₹' + (n / 1e5).toFixed(1) + 'L'; return '₹' + Math.round(n).toLocaleString('en-IN') }
export const fmtN = n => (n == null || isNaN(n)) ? '—' : Math.round(n).toLocaleString('en-IN')
export const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['ctwa', 'leads', 'lead', 'ads', 'ad', 'campaign', 'whatsapp', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', '2025', '2026', 'the', 'to', 'level', 'purchase'])
export const tokens = s => norm(s).split(' ').filter(t => t.length > 2 && !STOP.has(t))
export const isPaid = s => { const n = norm(s); return /\b(ad|ads|ctwa)\b/.test(n) || /(whatsapp|facebook|instagram|meta|fb|ig) ad/.test(n) }
export function matchCampaign(utm, camps) {
  const ut = tokens(utm); if (!ut.length) return null
  let best = null, bestScore = 0
  for (const c of camps) {
    if (c.real === false) continue
    const ct = new Set(tokens(c.name))
    const score = ut.filter(t => ct.has(t) || [...ct].some(x => x.includes(t) || t.includes(x))).length
    if (score > bestScore) { bestScore = score; best = c }
  }
  return bestScore > 0 ? best : null
}
export const ymd = d => { const p = x => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5)

// Date-range presets. Each returns { from, to } as YYYY-MM-DD.
export const DATE_PRESETS = [
  { key: 'this_month', label: 'This month', range: () => { const n = new Date(); return { from: ymd(new Date(n.getFullYear(), n.getMonth(), 1)), to: ymd(n) } } },
  { key: 'last_month', label: 'Last month', range: () => { const n = new Date(); return { from: ymd(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: ymd(new Date(n.getFullYear(), n.getMonth(), 0)) } } },
  { key: 'this_year', label: 'This year', range: () => { const n = new Date(); return { from: ymd(new Date(n.getFullYear(), 0, 1)), to: ymd(n) } } },
  { key: '7', label: '7d', range: () => ({ from: ymd(new Date(Date.now() - 7 * 864e5)), to: ymd(new Date()) }) },
  { key: '30', label: '30d', range: () => ({ from: ymd(new Date(Date.now() - 30 * 864e5)), to: ymd(new Date()) }) },
  { key: '60', label: '60d', range: () => ({ from: ymd(new Date(Date.now() - 60 * 864e5)), to: ymd(new Date()) }) },
  { key: '90', label: '90d', range: () => ({ from: ymd(new Date(Date.now() - 90 * 864e5)), to: ymd(new Date()) }) },
]
// Which preset (if any) matches the current from/to
export const activePresetKey = (from, to) => { for (const p of DATE_PRESETS) { const r = p.range(); if (r.from === from && r.to === to) return p.key } return null }

/* Ad-driven vs organic classification from the ORDER's source of truth
   (shopify_orders.lead_source, as written by POS → Attribution).
   Confirmed rules (Sahith, Jul 2026):
   - '…Organic' → organic (always)
   - Existing / Repeat / Referral / Founders / Direct Walk-in / Call Walk-in → organic
   - Instagram, WhatsApp (incl. Lead/plain), Facebook/Meta/CTWA, any '…Ad(s)',
     Google (Maps/Search), Contlo, Website, POPLIN → ad-driven
   - blank / Others / Other → 'exclude' (unclassified; kept out of the ad↔organic split)
   Returns 'ad' | 'organic' | 'exclude'. */
export function classifySource(src) {
  const n = norm(src)
  if (!n || n === 'others' || n === 'other') return 'exclude'
  if (/organic/.test(n)) return 'organic'
  if (/\b(ad|ads|ctwa)\b/.test(n)) return 'ad'
  if (/instagram|facebook|whatsapp|\bmeta\b|\bfb\b|\big\b|google|contlo|website|poplin/.test(n)) return 'ad'
  if (/existing|repeat|referral|founder|walk|direct|call/.test(n)) return 'organic'
  return 'exclude'
}

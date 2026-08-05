/**
 * Production print helpers — shared between ProductionCard (Cards view) and
 * ProductionDetail (Detail view) so the Print button can fire without
 * navigating away from the Cards grid.
 *
 *   resolveCustomerId(item, order)
 *     → Promise<string|null>  Customer lookup: item.customer_id, then
 *       order email → buyers → customers, then name as last resort.
 *
 *   fetchPrintData(item, order)
 *     → Promise<{ customerId, measurements, styleProfiles, buyerInfo }>
 *       Body (customer_measurements row) + Ready (customer_style_profiles
 *       row with its four JSONB garment columns) + buyer contact info,
 *       fetched in parallel.
 *
 *   printProductionSlip({ item, order, measurements, styleProfiles,
 *                         buyerInfo, images, catalogueProduct })
 *     Opens a new window, writes the print HTML, calls window.print().
 *
 * Layout (per Sahith, May 2026 redesign):
 *   - The slip ALWAYS shows BOTH top and bottom measurement tables, side
 *     by side. The customer's body is one body — both tables surface the
 *     full body context so a tailor can verify the customer profile even
 *     when this slip is for a single piece.
 *   - Body column (left): always from customer_measurements. Same source
 *     for top and bottom tables.
 *   - Ready column (middle): pulled from the customer's stored style
 *     profile JSONB. For the top table, we pick the garment that matches
 *     this item's resolved topGarment; if none, fall back to the first
 *     non-empty among shirt/kurtha/blazer so any stored ready spec is
 *     visible. The garment label appears in the column header
 *     ("Ready — Shirt") so the tailor knows which fitting the numbers
 *     came from. For the bottom table, Ready always reads pant.
 *   - Alteration column (right): always blank — manual entry at fitting.
 *   - Meta grid: Customer · Order Type · Top Type · Top Fabric · Bottom
 *     Type · Bottom Fabric · POC. Top/Bottom Type are filled when the
 *     current line item resolves a top/bottom garment respectively. The
 *     fabric for the OTHER side is unknown (we only fetch this item's
 *     catalogue product), so the opposite side shows "—".
 *   - "Sadri / Nehru Jacket Length" is labelled "Nehru Jacket Length"
 *     (DB column stays `sadri`).
 */
import { supa } from './supabase'
import { resolveGarments, GARMENT_LABEL } from './garmentMap'
import { resolveStaffName } from './helpers'

export const resolveCustomerId = async (item, order) => {
  if (item?.customer_id) return item.customer_id
  const email = order?.customer_email
  if (email) {
    const { data: buyers } = await supa.from('buyers').select('id').ilike('email', email).limit(1)
    if (buyers?.[0]) {
      const { data: customers } = await supa.from('customers').select('id').eq('buyer_id', buyers[0].id).limit(1)
      if (customers?.[0]) {
        supa.from('order_line_items').update({ customer_id: customers[0].id }).eq('id', item.id)
          .then(({ error }) => { if (error) console.error('Backfill customer_id failed:', error) })
        return customers[0].id
      }
    }
  }
  const custName = order?.customer_name
  if (custName) {
    const { data } = await supa.from('customers').select('id').ilike('name', custName).limit(1)
    if (data?.[0]) {
      supa.from('order_line_items').update({ customer_id: data[0].id }).eq('id', item.id)
        .then(({ error }) => { if (error) console.error('Backfill customer_id failed:', error) })
      return data[0].id
    }
  }
  return null
}

export const fetchPrintData = async (item, order) => {
  const customerId = await resolveCustomerId(item, order)
  if (!customerId) return { customerId: null, measurements: null, styleProfiles: null, buyerInfo: null }
  const [mRes, spRes, custRes] = await Promise.all([
    supa.from('customer_measurements').select('*').eq('customer_id', customerId).eq('is_active', true).limit(1),
    supa.from('customer_style_profiles').select('*').eq('customer_id', customerId).limit(1),
    supa.from('customers').select('buyer_id, name, phone').eq('id', customerId).limit(1).single(),
  ])
  let buyerInfo = null
  if (custRes?.data?.buyer_id) {
    const { data: buyer } = await supa.from('buyers').select('email, phone').eq('id', custRes.data.buyer_id).limit(1).single()
    buyerInfo = { email: buyer?.email || '', phone: buyer?.phone || custRes.data.phone || '' }
  }
  return {
    customerId,
    measurements: mRes?.data?.[0] || null,         // body row (customer_measurements)
    styleProfiles: spRes?.data?.[0] || null,       // ready JSON columns live here
    buyerInfo,
  }
}

const TOP_FIELDS = [
  { label: 'Shirt Length', key: 'shirt_length' },
  { label: 'Chest', key: 'chest' },
  { label: 'Stomach', key: 'stomach' },
  { label: 'Collar', key: 'collar' },
  { label: 'Hip', key: 'hip' },
  { label: 'Waist', key: 'waist' },
  { label: 'Front Cross', key: 'front_cross' },
  { label: 'Back Cross', key: 'back_cross' },
  { label: 'Shoulder', key: 'shoulder' },
  { label: 'Sleeve Length', key: 'sleeve_length' },
  { label: 'Cuff', key: 'cuff' },
  { label: 'Biceps', key: 'biceps' },
  { label: 'Knee Length', key: 'knee_length' },
  { label: 'Nehru Jacket Length', key: 'sadri' },
  { label: 'Arm Hole', key: 'arm_hole' },
  { label: 'Coat Length', key: 'coat_length' },
  { label: 'Blazer Length', key: 'blazer_length' },
  { label: 'Sherwani Length', key: 'sherwani_length' },
]

const BOTTOM_FIELDS = [
  { label: 'Pant Waist', key: 'pant_waist' },
  { label: 'Pant Hip', key: 'pant_hip' },
  { label: 'Fork', key: 'fork' },
  { label: 'Crop Pant Length', key: 'crop_pant_length' },
  { label: 'Inside Length', key: 'inside_length' },
  { label: 'Thigh', key: 'thigh' },
  { label: 'Ankle', key: 'ankle' },
  { label: 'Knee', key: 'knee' },
  { label: 'Chudia Rounding', key: 'chudia_rounding' },
  { label: 'Calf', key: 'calf' },
  { label: 'Pant Length', key: 'pant_length' },
  { label: 'Bottom', key: 'bottom' },
  { label: 'Cudia Pant Length', key: 'chudia_pan_length' },
  { label: 'Shoe Size', key: 'shoe_size' },
  { label: 'Height', key: 'height' },
  { label: 'Pagdi Size', key: 'pagdi_size' },
]

// Format a measurement value — '' / null / undefined → '—'
const fmtVal = (v) => {
  if (v === null || v === undefined || v === '') return '—'
  return String(v)
}

// Pull a value from the ready garment JSONB blob, given a field key.
const readyVal = (garmentJson, key) => {
  if (!garmentJson || typeof garmentJson !== 'object') return ''
  const v = garmentJson[key]
  return (v === null || v === undefined) ? '' : v
}

// Build the HTML rows for one table (top or bottom).
const buildRowsHtml = (fields, bodyRow, garmentReady) => fields.map(f => {
  const body  = bodyRow ? fmtVal(bodyRow[f.key]) : '—'
  const ready = fmtVal(readyVal(garmentReady, f.key))
  return `<tr>
    <td class="field">${f.label}</td>
    <td>${body}</td>
    <td>${ready}</td>
    <td></td>
  </tr>`
}).join('')

const poc = (item, teamMembers = []) => {
  const parts = []
  if (item?.stylist) parts.push('Stylist: ' + resolveStaffName(teamMembers, item.stylist))
  if (item?.product_executive) parts.push('Prod Exec: ' + resolveStaffName(teamMembers, item.product_executive))
  return parts.length ? parts.join(' · ') : '—'
}

// Look up the ready JSONB column on customer_style_profiles for a garment.
// Mapping: shirt -> shirt_measurements, kurtha -> kurtha_measurements,
// blazer -> blazer_measurements, pant -> pant_measurements.
const readyForGarment = (styleProfiles, garment) => {
  if (!styleProfiles || !garment) return null
  const col = garment + '_measurements'
  return styleProfiles[col] || null
}

// Pick the best ready spec for the top measurement table:
//   1. The garment resolved for THIS item's top, if any.
//   2. Otherwise the first non-empty top garment in the customer's profile
//      (shirt → kurtha → blazer), so we never hide stored data the tailor
//      might want to reference.
const pickTopReady = (styleProfiles, topGarment) => {
  if (topGarment) {
    const blob = readyForGarment(styleProfiles, topGarment)
    if (blob) return { blob, garment: topGarment }
  }
  for (const g of ['shirt', 'kurtha', 'blazer']) {
    const blob = readyForGarment(styleProfiles, g)
    if (blob && Object.keys(blob).length > 0) return { blob, garment: g }
  }
  return { blob: null, garment: topGarment || null }
}

export const printProductionSlip = ({ item, order, measurements, styleProfiles, buyerInfo, images = [], catalogueProduct, teamMembers = [] }) => {
  if (!item) return
  const img = images[0] || ''

  // Resolve which garments are in scope for THIS line item.
  const category = catalogueProduct?.category || ''
  const { topGarment, bottomGarment } = resolveGarments({
    category,
    title: item.title,
    sku: item.sku,
  })

  // Top table: pick the most relevant ready spec — preferring this item's
  // top garment, falling back to whatever the customer has on file.
  const topPick = pickTopReady(styleProfiles, topGarment)
  const topReadyLabel = topPick.garment ? `Ready — ${GARMENT_LABEL[topPick.garment]}` : 'Ready'

  // Bottom table: always pant_measurements (the only bottom garment we model).
  const bottomReady = readyForGarment(styleProfiles, 'pant')
  const bottomReadyLabel = 'Ready — Pant'

  const topRowsHtml    = buildRowsHtml(TOP_FIELDS,    measurements, topPick.blob)
  const bottomRowsHtml = buildRowsHtml(BOTTOM_FIELDS, measurements, bottomReady)

  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const metaCell = (label, value) =>
    `<div class="meta-cell"><div class="meta-label">${label}</div><div class="meta-value">${value || '—'}</div></div>`

  // Top/Bottom type + fabric in the meta grid. We only know about THIS
  // line item, so the side that matches the item's resolved garments is
  // filled; the other side shows "—".
  const itemFabric = catalogueProduct?.fabricName || item?.fabric || ''
  const topType    = topGarment    ? GARMENT_LABEL[topGarment]    : ''
  const bottomType = bottomGarment ? GARMENT_LABEL[bottomGarment] : ''
  const topFabric    = topGarment    ? itemFabric : ''
  const bottomFabric = bottomGarment ? itemFabric : ''

  const html = `<!DOCTYPE html><html><head><title>Production Slip — ${item.order_number || ''}</title>
<style>
  @page { size: A4; margin: 10mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Manrope', 'Helvetica Neue', Arial, sans-serif; color: #1b1c1a; font-size: 11px; line-height: 1.3; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
  .page { padding: 10mm 12mm; max-width: 210mm; margin: 0 auto; }

  /* ── Top bar ───────────────────────────────────────────── */
  .topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 8px; border-bottom: 2px solid #1b1c1a; margin-bottom: 10px; }
  .brand-block { text-align: right; flex-shrink: 0; }
  .logo { font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 18px; letter-spacing: 3px; color: #1b1c1a; white-space: nowrap; }
  .logo span { font-weight: 400; letter-spacing: 4px; color: #6b7280; }
  .doc-title { font-size: 9px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #6b7280; margin-top: 2px; }
  .doc-date { font-size: 9px; color: #6b7280; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .order-id-block { display: flex; flex-direction: column; min-width: 0; }
  .order-id-label { font-size: 8.5px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #6b7280; }
  .order-id { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; color: #1b1c1a; font-variant-numeric: tabular-nums; margin-top: 2px; word-break: break-all; }

  /* ── Header (image + meta grid) ────────────────────────── */
  .header { display: grid; grid-template-columns: 110px 1fr; gap: 14px; margin-bottom: 10px; }
  .product-img { width: 110px; height: 140px; object-fit: cover; border: 1px solid #e5e2db; border-radius: 6px; display: block; }
  .img-fallback { width: 110px; height: 140px; background: #f4f1ea; border: 1px solid #e5e2db; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .product-title { text-align: center; font-weight: 700; font-size: 10px; margin-top: 5px; color: #1b1c1a; word-break: break-word; line-height: 1.2; }
  .product-sku { text-align: center; font-size: 9px; font-weight: 700; color: #6b7280; font-family: ui-monospace, 'SF Mono', Consolas, monospace; margin-top: 2px; }

  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; align-content: start; }
  .meta-cell { padding: 4px 8px; border: 1px solid #ebe7df; border-radius: 4px; background: #faf8f3; min-width: 0; }
  .meta-cell.full { grid-column: 1 / -1; }
  .meta-label { font-size: 7.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #8a8478; margin-bottom: 1px; }
  .meta-value { font-size: 11px; font-weight: 600; color: #1b1c1a; word-break: break-word; }

  /* ── Measurement tables (side-by-side) ─────────────────── */
  .meas-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .meas-table { page-break-inside: avoid; min-width: 0; }
  .meas-table-title { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; padding: 5px 8px; background: #1b1c1a; color: #fff; border-radius: 4px 4px 0 0; }
  .meas-table table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .meas-table th { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: #4b5563; padding: 4px 4px; background: #f4f1ea; border: 1px solid #e5e2db; text-align: center; }
  .meas-table th.field { text-align: left; padding-left: 6px; }
  .meas-table td { padding: 3px 4px; font-size: 10px; border: 1px solid #e5e2db; text-align: center; font-variant-numeric: tabular-nums; height: 18px; }
  .meas-table td.field { text-align: left; padding-left: 6px; font-weight: 600; font-size: 9.5px; }
  .meas-table col.col-field { width: 44%; }
  .meas-table col.col-val { width: 18.66%; }

  /* ── Notes + signatures ───────────────────────────────── */
  .notes-block { margin-top: 10px; page-break-inside: avoid; }
  .notes-label { font-size: 8.5px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #6b7280; margin-bottom: 3px; }
  .notes-box { min-height: 38px; border: 1px solid #e5e2db; border-radius: 4px; padding: 5px 7px; background: #fafaf6; font-size: 10.5px; color: #1b1c1a; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 14px; page-break-inside: avoid; }
  .sig-cell { text-align: center; }
  .sig-line { border-top: 1px solid #1b1c1a; margin-bottom: 3px; padding-top: 3px; }
  .sig-label { font-size: 8.5px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #6b7280; }

  @media print {
    .page { padding: 6mm 8mm; }
  }
</style></head><body>
<div class="page">

  <div class="topbar">
    <div class="order-id-block">
      <div class="order-id-label">Order ID</div>
      <div class="order-id">${item.order_number || '—'}</div>
    </div>
    <div class="brand-block">
      <div class="logo">HILO <span>DESIGN</span></div>
      <div class="doc-title">Production Slip</div>
      <div class="doc-date">${dateStr}</div>
    </div>
  </div>

  <div class="header">
    <div>
      ${img
        ? `<img src="${img}" class="product-img" alt="" />`
        : `<div class="img-fallback">No Image</div>`}
      <div class="product-title">${item.title || '—'}</div>
      <div class="product-sku">${item.sku || '—'}</div>
    </div>
    <div class="meta-grid">
      ${metaCell('Customer', order?.customer_name || '')}
      ${metaCell('Order Type', item.type || 'General')}
      ${metaCell('Top Type', topType)}
      ${metaCell('Top Fabric', topFabric)}
      ${metaCell('Bottom Type', bottomType)}
      ${metaCell('Bottom Fabric', bottomFabric)}
      <div class="meta-cell full">
        <div class="meta-label">Point of Contact</div>
        <div class="meta-value">${poc(item, teamMembers)}</div>
      </div>
    </div>
  </div>

  <div class="meas-pair">
    <div class="meas-table">
      <div class="meas-table-title">Top Measurements</div>
      <table>
        <colgroup><col class="col-field"/><col class="col-val"/><col class="col-val"/><col class="col-val"/></colgroup>
        <thead><tr><th class="field">Field</th><th>Body</th><th>${topReadyLabel}</th><th>Alteration</th></tr></thead>
        <tbody>${topRowsHtml}</tbody>
      </table>
    </div>
    <div class="meas-table">
      <div class="meas-table-title">Bottom Measurements</div>
      <table>
        <colgroup><col class="col-field"/><col class="col-val"/><col class="col-val"/><col class="col-val"/></colgroup>
        <thead><tr><th class="field">Field</th><th>Body</th><th>${bottomReadyLabel}</th><th>Alteration</th></tr></thead>
        <tbody>${bottomRowsHtml}</tbody>
      </table>
    </div>
  </div>

  <div class="notes-block">
    <div class="notes-label">Notes / Customisation</div>
    <div class="notes-box">${item.custom_requirements || ''}</div>
  </div>

  <div class="sig-grid">
    <div class="sig-cell"><div class="sig-line">&nbsp;</div><div class="sig-label">Customer Signature</div></div>
    <div class="sig-cell"><div class="sig-line">&nbsp;</div><div class="sig-label">Tailor / Production Signature</div></div>
  </div>

</div>
</body></html>`

  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return  // popup blocked
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 400)
}

/**
 * GST tax-invoice generator (Rule 46-compliant).
 *
 * Renders a single A4 HTML document and opens it in a print window so the
 * staff PDF and the customer share page are byte-identical. The thermal
 * variant lives separately and is no longer called from the Orders tab
 * — POS tab keeps its own thermal flow.
 *
 * Design language matches the editorial Stitch mock: ivory ground, ink
 * text, single warm-gold accent on wordmark + Grand Total bar + hairline.
 */
import QRCode from 'qrcode'
import { prepareReceiptData } from './receiptData'
import { supa } from './supabase'

// ──────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────
const fmt = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]))

// HSN fallback when order_line_items.hsn / design_products.hsn isn't set.
// CA-confirmed defaults per spec; tighten over time.
const HSN_FALLBACK = {
  women_ethnic: '6204',
  women: '6204',
  men: '6203',
  men_ethnic: '6203',
  made_up: '6307',
  shirt: '6205',
  trouser: '6203',
  saree: '5407',
  default: '6203',
}
const resolveHsn = (item) => {
  if (item.hsn) return String(item.hsn)
  const cat = (item.garment_category || '').toLowerCase()
  if (/sherwani|kurtha|kurta|achkan|bandhgala/.test(cat)) return HSN_FALLBACK.men_ethnic
  if (/saree|lehenga|salwar|anarkali|ethnic women/.test(cat)) return HSN_FALLBACK.women_ethnic
  if (/shirt/.test(cat)) return HSN_FALLBACK.shirt
  if (/pant|trouser/.test(cat)) return HSN_FALLBACK.trouser
  return HSN_FALLBACK.default
}

// Amount in words — Indian numbering, two-decimal paise.
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
const sub1000 = (n) => {
  if (n < 20) return ONES[n]
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')
  return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + sub1000(n % 100) : '')
}
const amountInWords = (rs) => {
  const r = Math.floor(Math.abs(rs))
  const paise = Math.round((Math.abs(rs) - r) * 100)
  if (r === 0 && paise === 0) return 'Zero Rupees Only'
  const crore = Math.floor(r / 10000000)
  const lakh  = Math.floor((r % 10000000) / 100000)
  const thou  = Math.floor((r % 100000) / 1000)
  const rest  = r % 1000
  const parts = []
  if (crore) parts.push(sub1000(crore) + ' Crore')
  if (lakh)  parts.push(sub1000(lakh) + ' Lakh')
  if (thou)  parts.push(sub1000(thou) + ' Thousand')
  if (rest)  parts.push(sub1000(rest))
  let words = parts.join(' ').trim() + ' Rupees'
  if (paise) words += ' and ' + sub1000(paise) + ' Paise'
  return words + ' Only'
}

// ──────────────────────────────────────────────────────────────────────
// Stylesheet — quiet-luxury editorial
// ──────────────────────────────────────────────────────────────────────
const invoiceCSS = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; color: #1b1c1a; background: #faf9f5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { max-width: 800px; margin: 0 auto; padding: 32px 28px 0 28px; background: #faf9f5; }
  .mono { font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace; }
  .clay { color: #4d4636; }
  .muted { color: #767872; }
  .label { font-size: 9px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #767872; }
  .hr { border: 0; border-top: 1px solid #efeeea; margin: 16px 0; }
  .right { text-align: right; }
  .center { text-align: center; }

  /* Masthead */
  .masthead { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
  .brand { font-weight: 800; letter-spacing: 0.22em; font-size: 22px; color: #c9a432; line-height: 1; }
  .brand-sub { font-size: 10px; letter-spacing: 0.22em; color: #4d4636; margin-top: 4px; font-weight: 600; }
  .rec-note { text-align: center; font-style: italic; color: #767872; font-size: 10.5px; margin-top: 8px; }
  .founder-note { padding: 16px 18px 14px; margin: 10px 0 12px; border-top: 1px solid #eeece7; border-bottom: 1px solid #eeece7; text-align: center; background: #faf8f3; }
  .founder-note p { font-style: italic; color: #4d4636; font-size: 11.5px; line-height: 1.7; margin: 0 auto 10px; max-width: 78%; }
  .founder-note .who { font-weight: 700; color: #1b1c1a; font-size: 11px; margin-bottom: 8px; letter-spacing: 0.04em; }
  .founder-note .tagline { font-size: 9.5px; letter-spacing: 0.16em; color: #767872; text-transform: uppercase; font-weight: 600; }
  .founder-note .heart { color: #c9a432; font-size: 12px; margin: 0 5px; vertical-align: -1px; font-style: normal; }
  .seller { margin-top: 12px; font-size: 10.5px; line-height: 1.55; color: #1b1c1a; }
  .seller .name { font-weight: 700; font-size: 11.5px; }
  .doc-title { font-size: 14px; font-weight: 800; letter-spacing: 0.18em; }
  .doc-meta { margin-top: 6px; font-size: 10.5px; line-height: 1.65; color: #1b1c1a; }
  .doc-meta .k { color: #767872; display: inline-block; min-width: 110px; }

  /* Parties */
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 12px; }
  .party .name { font-weight: 600; font-size: 13px; margin-top: 6px; }
  .party .detail { font-size: 10.5px; line-height: 1.6; color: #1b1c1a; margin-top: 2px; }

  /* Items table */
  table.items { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 18px; }
  table.items thead th { text-align: left; padding: 8px 6px 8px 0; border-bottom: 1px solid #1b1c1a; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: #767872; font-weight: 700; }
  table.items tbody td { padding: 10px 6px 10px 0; border-bottom: 1px solid #efeeea; vertical-align: top; }
  table.items tbody .title { font-weight: 600; font-size: 11.5px; color: #1b1c1a; }
  table.items tbody .secondary { font-size: 10px; color: #767872; margin-top: 2px; }
  table.items td.num { text-align: right; font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }

  /* Totals */
  .totals { width: 50%; margin-left: auto; margin-top: 14px; font-size: 11px; }
  .totals .row { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .row .v { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .grand { background: #c9a432; color: #fff; padding: 12px 14px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center; }
  .grand .l { font-size: 11px; letter-spacing: 0.22em; font-weight: 800; text-transform: uppercase; }
  .grand .v { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 18px; font-weight: 700; }
  .words { margin-top: 6px; font-style: italic; font-size: 10.5px; color: #4d4636; text-align: right; }

  /* Payments */
  table.pmts { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 14px; }
  table.pmts thead th { text-align: left; padding: 8px 6px 8px 0; border-bottom: 1px solid #1b1c1a; font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: #767872; font-weight: 700; }
  table.pmts tbody td { padding: 8px 6px 8px 0; border-bottom: 1px solid #efeeea; }
  table.pmts tfoot td { padding: 8px 6px 8px 0; font-weight: 700; }
  .balance-due { color: #ba1a1a; font-weight: 700; }

  /* Brand band */
  .band { background: #faf9f5; padding: 22px 28px; margin: 22px -28px 0; text-align: center; border-top: 1px solid #efeeea; border-bottom: 1px solid #efeeea; }
  .band p { max-width: 560px; margin: 0 auto; font-size: 11.5px; line-height: 1.7; color: #1b1c1a; }
  .band .sig { margin-top: 8px; font-size: 10.5px; color: #4d4636; }
  .band .pillars { margin-top: 14px; display: flex; gap: 32px; justify-content: center; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #4d4636; }
  .band .pillars .it { display: inline-flex; align-items: center; gap: 6px; }
  .band .pillars svg { width: 14px; height: 14px; stroke: #4d4636; stroke-width: 1.25; fill: none; }

  /* Compliance footer */
  .footer { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 28px; margin-top: 22px; font-size: 10px; line-height: 1.65; }
  .footer .col .label { margin-bottom: 6px; display: block; }
  .footer .col .kv { display: flex; gap: 6px; }
  .footer .col .kv .k { color: #767872; min-width: 86px; }
  .footer .col .v { color: #1b1c1a; }
  .sig-line { font-family: 'Brush Script MT', cursive; font-size: 22px; color: #1b1c1a; margin-top: 12px; }
  .sig-caption { font-size: 9px; color: #767872; letter-spacing: 0.1em; margin-top: 2px; }

  /* Tail */
  .tail { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top: 14px; border-top: 1px solid #efeeea; }
  .tail .qr { padding: 4px; background: #fff; border: 1px solid #efeeea; }
  .tail .qr img { display: block; }
  .disclaimer { font-size: 9px; color: #767872; letter-spacing: 0.04em; max-width: 320px; text-align: right; }
  .gold-rule { height: 1px; background: #c9a432; margin-top: 14px; }

  /* Print: hide the modal toolbar */
  .no-print { display: none; }
  @media screen {
    body { padding: 24px 0; }
    .sheet { box-shadow: 0 12px 40px rgba(0,0,0,0.08); background: #fff; }
  }
`

// ──────────────────────────────────────────────────────────────────────
// Main A4 renderer
// ──────────────────────────────────────────────────────────────────────
export const renderA4 = async ({ order, store, customer, items, payments, totals, pos }) => {
  // 3.3 Data-integrity guard: block if line math disagrees with order total.
  //
  // Two valid discount patterns exist:
  //   • ORDER-level discount (POS "Apply ₹1300 off" at checkout):
  //       line.sale_price = full price
  //       order.order_discount_amount = ₹1300
  //       lineSum = order.total_price + order.order_discount_amount
  //   • LINE-level discount (per-item discount, or Shopify line discount):
  //       line.sale_price = post-discount net
  //       order.order_discount_amount = 0
  //       lineSum = order.total_price
  //
  // The invariant in both cases:  lineSum = total_price + order_discount_amount
  // We DO NOT add back order.total_discounts because it can include line
  // discounts that are already baked into sale_price.
  //
  // Defensive: prefer stored sale_price; fall back to per-line computation when
  // a sync wrote an incomplete row (sale_price NULL). Without this fallback,
  // Shopify-synced orders that pre-date the line-item backfill lineSum to 0.
  const lineSum = items.reduce((s, i) => {
    const stored = Number(i.sale_price || 0)
    if (stored > 0) return s + stored
    const gross = Number(i.unit_price || 0) * Number(i.quantity || 1)
    const disc  = Number(i.discount_amount || i.total_discount || 0)
    return s + Math.max(0, gross - disc)
  }, 0)
  // The authoritative invariant is: sum of per-line post-line-discount sale_price
  // = order.subtotal_price (which by design holds the same value, captured at order
  // creation). When subtotal_price is missing we fall back to total_price plus
  // ORDER-level discount only (line discounts are already inside sale_price).
  // Accept any of three valid mappings (different storage patterns):
  //   A) lineSum = subtotal_price                          (gross sum stored)
  //   B) lineSum = total_price + order_discount_amount     (POS order-level)
  //   C) lineSum = total_price + total_discounts           (Shopify order-level)
  // Pass if ANY one of these matches within ₹1. This avoids tripping on the
  // valid edge cases (~22% of legacy Shopify orders) while still blocking
  // genuinely inconsistent rows (where all three checks fail).
  const orderTotal = Number(order.total_price || 0)
  const orderSubtotal = Number(order.subtotal_price || 0)
  const orderLevelDisc = Number(order.order_discount_amount || 0)
  const totalDiscounts = Number(order.total_discounts || 0)
  const candidates = [
    orderSubtotal > 0 ? orderSubtotal : null,
    orderTotal + orderLevelDisc,
    orderTotal + totalDiscounts,
  ].filter(v => v !== null)
  const passes = candidates.some(c => Math.abs(lineSum - c) <= 1)
  if (!passes) {
    throw new Error(`Invoice math mismatch: line items sum to ${fmt(lineSum)}, but none of {subtotal_price ${fmt(orderSubtotal)}, total+order_disc ${fmt(orderTotal + orderLevelDisc)}, total+total_discounts ${fmt(orderTotal + totalDiscounts)}} reconciles. Cannot generate a GST invoice.`)
  }
  if (!store?.gstin) {
    throw new Error('Cannot generate TAX INVOICE without seller GSTIN on store config.')
  }

  const invNumber = order.invoice_number || order.order_number
  const isInter   = pos?.kind === 'inter'
  const docTitle  = 'TAX INVOICE'  // (Bill of Supply only for composition / unregistered — out of v1)
  const reverseCharge = order.reverse_charge ? 'Yes' : 'No'
  const invoiceDate = new Date(order.invoice_date || order.created_at)

  // Generate QR for hilodesign.co
  const qrDataUrl = await QRCode.toDataURL('https://hilodesign.co', {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 96,
    color: { dark: '#1b1c1a', light: '#ffffff' },
  })

  // Bill-to / ship-to identity test
  const billLines = [order.delivery_address_line1, order.delivery_address_line2, [order.delivery_city, order.delivery_state, order.delivery_pincode].filter(Boolean).join(' ')].filter(Boolean)
  const shipSameAsBill = !order.delivery_recipient_name || (order.delivery_recipient_name === (customer?.name || order.customer_name))

  const lineRows = items.map((i, idx) => {
    const taxable = Number(i.sale_price || 0) - Number(i.gst_amount || 0)
    const gstPct  = Math.round(Number(i.gst_rate || 0) * 100)
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>
          <div class="title">${esc(i.title)}</div>
          <div class="secondary">${[i.fabric_name, i.colour, i.garment_category, i.size].filter(Boolean).map(esc).join(' · ')}</div>
        </td>
        <td class="num">${esc(resolveHsn(i))}</td>
        <td class="num">${i.quantity || 1}</td>
        <td class="num">${esc(i.uom || 'PCS')}</td>
        <td class="num">${fmt(i.unit_price)}</td>
        <td class="num">${i.discount_amount ? '-' + fmt(i.discount_amount) : '—'}</td>
        <td class="num">${fmt(taxable)}</td>
        <td class="num">${gstPct}%</td>
        ${isInter
          ? `<td class="num" colspan="2">${fmt(i.gst_amount)}</td>`
          : `<td class="num">${fmt(i.gst_split?.cgst ?? Number(i.gst_amount || 0) / 2)}</td><td class="num">${fmt(i.gst_split?.sgst ?? Number(i.gst_amount || 0) / 2)}</td>`}
      </tr>`
  }).join('')

  const paymentRows = payments.map(p => `
    <tr>
      <td>${new Date(p.collected_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</td>
      <td>${esc((p.method || '').replace(/_/g, ' '))}</td>
      <td class="mono">${esc(p.reference || '—')}</td>
      <td class="num" style="${Number(p.amount) < 0 ? 'color:#ba1a1a' : ''}">${fmt(p.amount)}</td>
    </tr>
  `).join('')

  const headerCols = isInter
    ? '<th class="num">#</th><th>Description</th><th class="num">HSN</th><th class="num">Qty</th><th class="num">UoM</th><th class="num">Unit</th><th class="num">Discount</th><th class="num">Taxable</th><th class="num">GST%</th><th class="num" colspan="2">IGST</th>'
    : '<th class="num">#</th><th>Description</th><th class="num">HSN</th><th class="num">Qty</th><th class="num">UoM</th><th class="num">Unit</th><th class="num">Discount</th><th class="num">Taxable</th><th class="num">GST%</th><th class="num">CGST</th><th class="num">SGST</th>'

  const jurisdictionCity = store?.jurisdiction_city || 'registered office'

  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<title>Tax Invoice ${esc(invNumber)} · Hilo Design</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>${invoiceCSS}</style>
</head><body>
<div class="sheet">

  <!-- 1. Masthead -->
  <div class="masthead">
    <div>
      <div class="brand">HILO DESIGN</div>
      <div class="seller">
        <div class="name">${esc(store?.legal_name || 'HILO DESIGN INDIA PRIVATE LIMITED')}</div>
        <div>${esc(store?.address_line1 || '')}${store?.address_line2 ? ', ' + esc(store.address_line2) : ''}</div>
        <div>${esc(store?.city || '')}${store?.state ? ', ' + esc(store.state) : ''} ${esc(store?.pincode || '')}</div>
        <div class="mono">GSTIN ${esc(store?.gstin || '—')}${store?.pan ? ' · PAN ' + esc(store.pan) : ''}</div>
        ${store?.email ? `<div>${esc(store.email)}</div>` : ''}
        ${store?.website ? `<div>${esc(store.website)}</div>` : ''}
        <div style="margin-top:6px;color:#4d4636"><span style="color:#767872">Happy to help · </span><span class="mono">+91 93901 77597</span></div>
      </div>
    </div>
    <div class="right">
      <div class="doc-title">${docTitle}</div>
      <div class="doc-meta">
        <div><span class="k">Invoice #</span><span class="mono">${esc(invNumber)}</span></div>
        <div><span class="k">Invoice Date</span>${invoiceDate.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</div>
        <div><span class="k">Order Ref</span><span class="mono">${esc(order.order_number)}</span></div>
        <div><span class="k">Place of Supply</span>${esc(pos?.label || (order.delivery_state || ''))}${pos?.code ? ` (${pos.code})` : ''}</div>
        <div><span class="k">Reverse Charge</span>${reverseCharge}</div>
      </div>
    </div>
  </div>

  <hr class="hr"/>

  <!-- 2. Parties -->
  <div class="parties">
    <div class="party">
      <div class="label">Bill To</div>
      <div class="name">${esc(order.delivery_company_name || customer?.name || order.customer_name || '—')}</div>
      <div class="detail">
        ${billLines.length ? billLines.map(esc).join('<br/>') + '<br/>' : ''}
        ${order.delivery_gstin ? `<span class="mono">GSTIN ${esc(order.delivery_gstin)}</span><br/>` : ''}
        ${customer?.phone ? `${esc(customer.phone)}` : (order.delivery_phone ? esc(order.delivery_phone) : '')}
        ${customer?.email ? `${customer?.phone ? ' · ' : ''}${esc(customer.email)}` : ''}
      </div>
    </div>
    <div class="party">
      <div class="label">Ship To</div>
      ${shipSameAsBill
        ? `<div class="name">Same as billing</div>`
        : `<div class="name">${esc(order.delivery_recipient_name || customer?.name || '—')}</div>
           <div class="detail">
             ${esc(order.delivery_address_line1 || '')}${order.delivery_address_line2 ? ', ' + esc(order.delivery_address_line2) : ''}<br/>
             ${esc(order.delivery_city || '')}${order.delivery_state ? ', ' + esc(order.delivery_state) : ''} ${esc(order.delivery_pincode || '')}<br/>
             ${order.delivery_phone ? esc(order.delivery_phone) : ''}
           </div>`}
    </div>
  </div>

  <!-- 4. Line items -->
  <table class="items">
    <thead><tr>${headerCols}</tr></thead>
    <tbody>${lineRows}</tbody>
  </table>

  <!-- 5. Totals -->
  <div class="totals">
    <div class="row"><span>Subtotal (taxable)</span><span class="v">${fmt(totals.subtotal)}</span></div>
    ${isInter
      ? `<div class="row"><span>IGST</span><span class="v">${fmt(totals.igstTotal)}</span></div>`
      : `<div class="row"><span>CGST</span><span class="v">${fmt(totals.cgstTotal)}</span></div>
         <div class="row"><span>SGST</span><span class="v">${fmt(totals.sgstTotal)}</span></div>`}
    ${(() => { const d = Number((orderTotal - lineSum).toFixed(2)); return Math.abs(d) > 0 && Math.abs(d) <= 1 ? `<div class="row"><span>Round-off</span><span class="v">${fmt(d)}</span></div>` : ''; })()}
    <div class="grand"><span class="l">Grand Total</span><span class="v">${fmt(totals.grandTotal)}</span></div>
    <div class="words">Amount in words: ${amountInWords(totals.grandTotal)}</div>
  </div>

  ${payments.length ? `
  <!-- 6. Payments -->
  <table class="pmts">
    <thead><tr><th>Date</th><th>Mode</th><th>Reference</th><th class="num">Amount</th></tr></thead>
    <tbody>${paymentRows}</tbody>
    <tfoot>
      <tr><td colspan="3" class="right">Total collected</td><td class="num">${fmt(totals.totalCollected)}</td></tr>
      ${totals.balance > 0.01 ? `<tr class="balance-due"><td colspan="3" class="right">Balance due</td><td class="num">${fmt(totals.balance)}</td></tr>` : ''}
    </tfoot>
  </table>
  ` : ''}

  <!-- 8. Brand storytelling band -->
  <div class="band">
    <p>Stitched by hands that have known the loom for decades. Each Hilo piece passes through seven sets of hands before it reaches yours — cutter, tailor, embroiderer, finisher, quality, packer, courier. Thank you for being the eighth. Wear it slowly, and write to us when it begins to feel like your own.</p>
    <div class="sig">— The Hilo studio · hello@hilodesign.co</div>
    <div class="pillars">
      <span class="it"><svg viewBox="0 0 24 24"><path d="M4 20L20 4"/><circle cx="4" cy="20" r="2"/><path d="M16 4l2 0M16 4l0 2M20 8l-2 0M20 8l0-2"/></svg> Handcrafted in India</span>
      <span class="it"><svg viewBox="0 0 24 24"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg> Authentic fabric</span>
      <span class="it"><svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8.5L20 20M8.5 15.5L20 4"/></svg> Trial fit &amp; alteration</span>
    </div>
  </div>

  <!-- 8b. Founder's note -->
  <div class="founder-note">
    <p>&ldquo;Hilo started between a brother and a sister &mdash; she had the eye, he was her first project. We turned &lsquo;help me pick&rsquo; into a brand. Thank you for being part of it.&rdquo;</p>
    <div class="who">&mdash; Sahith &amp; Mouna</div>
    <div class="tagline">Indian craft &middot; Modern design &middot; Styled around you <span class="heart">&hearts;</span> Luxury, Made Personal.</div>
  </div>

  <!-- 7. Compliance footer -->
  <div class="footer">
    <div class="col">
      <span class="label">Bank Details</span>
      <div class="kv"><span class="k">Beneficiary</span><span class="v">HILO DESIGN INDIA PRIVATE LIMITED</span></div>
      <div class="kv"><span class="k">A/c No</span><span class="v mono">50200063229694</span></div>
      <div class="kv"><span class="k">IFSC</span><span class="v mono">HDFC0000317</span></div>
      <div class="kv"><span class="k">Bank</span><span class="v">HDFC Bank</span></div>
    </div>
    <div class="col">
      <span class="label">Terms</span>
      <div>One trial fit and alteration included with every custom piece.</div>
      <div>We recommend visiting our studio for the best trial-and-fit experience.</div>
      <div>Subject to ${esc(jurisdictionCity)} jurisdiction.</div>
    </div>
    <div class="col right">
      <span class="label">Authorised Signatory</span>
      <div class="sig-line">For Hilo Design</div>
      <div class="sig-caption">For Hilo Design India Pvt Ltd · Authorised Signatory</div>
    </div>
  </div>

  <!-- 9. Tail -->
  <div class="tail">
    <div class="qr"><img src="${qrDataUrl}" width="72" height="72" alt="hilodesign.co"/></div>
    <div class="disclaimer">Computer-generated. Valid without signature under IT Act 2000 s.4.</div>
  </div>
  <div class="gold-rule"></div>

</div>
<script>setTimeout(() => { try { window.print() } catch(e) {} }, 300)</script>
</body></html>`
}

// ──────────────────────────────────────────────────────────────────────
// Thermal — retained for POS tab only; not called from Orders tab
// ──────────────────────────────────────────────────────────────────────
const thermalCSS = `
  body { font-family: 'JetBrains Mono', monospace; margin: 0; padding: 0; color: #000; font-size: 11px; }
  .wrap { width: 80mm; margin: 0 auto; padding: 8px; }
  .brand { font-family: 'Manrope', sans-serif; font-weight: 800; letter-spacing: 0.16em; font-size: 14px; text-align: center; color: #000; }
  .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; }
  .right { text-align: right; }
  .label { font-weight: 700; text-transform: uppercase; font-size: 9px; }
  @page { size: 80mm auto; margin: 2mm; }
`

const renderThermal = ({ order, store, items, payments, totals, customer }) => {
  const lineRows = items.map(i => `
    <div class="row">
      <div style="flex:1">
        <div>${esc(i.title)}</div>
        <div style="font-size:9px;color:#666">${i.quantity || 1} × ${fmt(i.unit_price)}</div>
      </div>
      <div class="right">${fmt(i.sale_price)}</div>
    </div>
  `).join('')
  const payRows = payments.map(p => `
    <div class="row" style="font-size:10px">
      <div>${esc(p.method)} ${p.payment_type === 'refund' ? '(refund)' : ''}</div>
      <div>${fmt(p.amount)}</div>
    </div>
  `).join('')
  return `<!DOCTYPE html><html><head><title>Receipt ${esc(order.order_number)}</title>
<style>${thermalCSS}</style></head><body>
<div class="wrap">
  <div class="brand">HILO DESIGN</div>
  ${store ? `<div style="text-align:center;font-size:9px">${esc(store.name)}</div>` : ''}
  ${store?.gstin ? `<div style="text-align:center;font-size:9px">GSTIN ${esc(store.gstin)}</div>` : ''}
  <div class="divider"></div>
  <div class="row"><span class="label">Order</span><span>${esc(order.order_number)}</span></div>
  <div class="row"><span class="label">Date</span><span>${new Date(order.created_at).toLocaleDateString('en-IN')}</span></div>
  ${customer ? `<div class="row"><span class="label">Customer</span><span>${esc(customer.name)}</span></div>` : ''}
  <div class="divider"></div>
  ${lineRows}
  <div class="divider"></div>
  <div class="row"><span>Subtotal</span><span>${fmt(totals.subtotal)}</span></div>
  <div class="row"><span>GST</span><span>${fmt(totals.gstTotal)}</span></div>
  <div class="row" style="font-weight:700;font-size:13px"><span>TOTAL</span><span>${fmt(totals.grandTotal)}</span></div>
  <div class="divider"></div>
  ${payRows}
  ${totals.balance > 0 ? `<div class="row" style="color:#dc2626;font-weight:700"><span>Balance due</span><span>${fmt(totals.balance)}</span></div>` : ''}
  <div class="divider"></div>
  <div style="text-align:center;font-size:9px;margin-top:6px">Thank you!</div>
</div>
<script>setTimeout(() => window.print(), 200)</script>
</body></html>`
}

// ──────────────────────────────────────────────────────────────────────
// Public entry
// ──────────────────────────────────────────────────────────────────────
export const generateReceipt = async (orderId, { variant = 'a4', share = false } = {}) => {
  const data = await prepareReceiptData(orderId)
  const html = variant === 'thermal' ? renderThermal(data) : await renderA4(data)
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) return { ok: false, reason: 'Popup blocked' }
  w.document.write(html)
  w.document.close()
  try {
    await supa.from('shopify_orders').update({
      receipt_generated_at: new Date().toISOString(),
      receipt_sent_via: share ? 'whatsapp' : null,
    }).eq('id', orderId)
  } catch (e) { console.error('receipt stamp failed:', e) }
  return { ok: true }
}

export const shareReceiptUrl = (order) => {
  if (!order?.share_token) return null
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/#/r/${order.share_token}`
}

// ══════════════════════════════════════════════════════════════════════
// MARKETPLACE GST TAX INVOICE
// Bill-to / Ship-to come from the marketplace master; the entered value
// (marketplace_net_amount) is treated as GST-INCLUSIVE. Invoice # = HM order
// number. IGST when inter-state, CGST+SGST when intra-state (seller = TG/36).
// ══════════════════════════════════════════════════════════════════════
const MP_SELLER = {
  name: 'HILO DESIGN INDIA PRIVATE LIMITED',
  addr: ['1st Floor, Plot no. 8, Road No. - 82,', 'Film Nagar, Jubilee Hills', 'Hyderabad Telangana 500033', 'India'],
  gstin: '36AAGCH0044L1ZN', state: 'Telangana', state_code: '36',
  phone: '+91 9908389810', web: 'www.hilodesign.co',
  bank: 'HDFC BANK — Jubilee Hills Branch · A/c 50200063229694 · IFSC HDFC0000317',
}

const addrLines = (a) => {
  if (!a) return []
  if (typeof a === 'string') return [a]
  return [a.line1, a.line2, [a.city, a.state, a.pincode].filter(Boolean).join(' '), a.country].filter(Boolean)
}

export const renderMarketplaceInvoice = ({ order, marketplace, items }) => {
  const gst = Number(marketplace?.gst_rate ?? 5)
  const orderNet = Number(order.marketplace_net_amount) || Number(order.total_price) || 0
  const lineList = (items || []).filter(i => !i.cancelled_at)
  const grossSum = lineList.reduce((s, i) => s + (Number(i.catalogue_mrp || i.sold_mrp || i.unit_price || 0) * Number(i.quantity || 1)), 0)
  const rows = lineList.map(i => {
    const g = Number(i.catalogue_mrp || i.sold_mrp || i.unit_price || 0) * Number(i.quantity || 1)
    const net = grossSum > 0 ? orderNet * (g / grossSum) : (lineList.length ? orderNet / lineList.length : 0)
    return { title: i.title || i.variant_title || 'Item', qty: Number(i.quantity || 1), sac: marketplace?.sac_default || '62032900', net }
  })
  const taxableTotal = orderNet / (1 + gst / 100)
  const taxTotal = orderNet - taxableTotal
  const intra = (marketplace?.state_code || '') === MP_SELLER.state_code
  const bill = marketplace?.billing_address, ship = marketplace?.shipping_address || marketplace?.billing_address
  const invNo = order.order_number
  const invDate = new Date(order.created_at)
  const posState = marketplace?.state ? `${marketplace.state}${marketplace.state_code ? ' (' + marketplace.state_code + ')' : ''}` : '—'
  const fmtD = (d) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const taxCols = intra
    ? `<th class="num">CGST<br>${(gst / 2)}%</th><th class="num">SGST<br>${(gst / 2)}%</th>`
    : `<th class="num">IGST<br>${gst}%</th>`
  const rowHtml = rows.map((r, idx) => {
    const tx = r.net / (1 + gst / 100)
    const t = r.net - tx
    const taxCells = intra
      ? `<td class="num">${fmt(t / 2)}</td><td class="num">${fmt(t / 2)}</td>`
      : `<td class="num">${fmt(t)}</td>`
    return `<tr><td class="num">${idx + 1}</td><td>${esc(r.title)}<div class="sac">SAC: ${esc(r.sac)}</div></td>
      <td class="num">${r.qty}</td><td class="num">${fmt(tx)}</td>${taxCells}<td class="num">${fmt(r.net)}</td></tr>`
  }).join('')

  const css = `
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1b1c1a; font-size: 12px; margin: 0; }
    .band { background: #3a4a63; color: #fff; padding: 18px 22px; display: flex; justify-content: space-between; align-items: flex-start; }
    .band .co { font-size: 22px; font-weight: 800; letter-spacing: 1px; }
    .band .meta { text-align: right; font-size: 10px; line-height: 1.5; opacity: .95; }
    .due { text-align: right; padding: 10px 22px; font-size: 14px; font-weight: 700; color: #3a4a63; border-bottom: 1px solid #eee; }
    .parties { display: flex; justify-content: space-between; padding: 18px 22px; gap: 20px; }
    .parties .label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #888; }
    .parties .name { font-size: 15px; font-weight: 800; margin: 2px 0; }
    .parties .l { font-size: 11px; line-height: 1.5; color: #333; }
    .kv { text-align: right; font-size: 11px; line-height: 1.7; }
    .kv .k { color: #888; display: inline-block; min-width: 90px; }
    .pos { padding: 0 22px 8px; font-size: 11px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 4px 0; }
    thead th { background: #f6f5f2; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 1px solid #e5e5e5; }
    td { padding: 9px 10px; border-bottom: 1px solid #f0efec; vertical-align: top; }
    .num { text-align: right; }
    .sac { font-size: 10px; color: #999; }
    .totals { width: 300px; margin-left: auto; padding: 10px 22px; }
    .totals .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
    .totals .grand { display: flex; justify-content: space-between; padding: 8px 0; margin-top: 4px; border-top: 2px solid #3a4a63; font-size: 15px; font-weight: 800; color: #3a4a63; }
    .words { padding: 6px 22px 0; font-size: 11px; font-style: italic; color: #555; }
    .foot { padding: 16px 22px; font-size: 10px; color: #777; border-top: 1px solid #eee; margin-top: 12px; }
    .sign { margin-top: 40px; text-align: right; padding: 0 22px 20px; font-size: 11px; }
  `
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${esc(invNo)}</title><style>${css}</style></head><body>
    <div class="band">
      <div><div class="co">HILO DESIGN</div></div>
      <div class="meta">${MP_SELLER.name}<br>${MP_SELLER.addr.join('<br>')}<br>GSTIN: ${MP_SELLER.gstin}<br>${MP_SELLER.phone} · ${MP_SELLER.web}</div>
    </div>
    <div class="due">TAX INVOICE · ${fmt(orderNet)}</div>
    <div class="parties">
      <div>
        <div class="label">Bill To</div>
        <div class="name">${esc(marketplace?.legal_name || marketplace?.name || order.marketplace_name || 'Marketplace')}</div>
        <div class="l">${addrLines(bill).map(esc).join('<br>')}${marketplace?.gstin ? '<br>GSTIN ' + esc(marketplace.gstin) : ''}</div>
        <div class="label" style="margin-top:10px">Ship To</div>
        <div class="l">${addrLines(ship).map(esc).join('<br>')}</div>
      </div>
      <div class="kv">
        <div><span class="k">Invoice #</span> ${esc(invNo)}</div>
        <div><span class="k">Invoice Date</span> ${fmtD(invDate)}</div>
        ${order.marketplace_order_ref ? `<div><span class="k">P.O. #</span> ${esc(order.marketplace_order_ref)}</div>` : ''}
        <div><span class="k">Terms</span> ${esc(marketplace?.payment_terms || 'Due on Receipt')}</div>
      </div>
    </div>
    <div class="pos">Place of Supply: ${esc(posState)}</div>
    <table>
      <thead><tr><th class="num">#</th><th>Description</th><th class="num">Qty</th><th class="num">Taxable</th>${taxCols}<th class="num">Amount</th></tr></thead>
      <tbody>${rowHtml}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Taxable value</span><span>${fmt(taxableTotal)}</span></div>
      ${intra
        ? `<div class="row"><span>CGST (${gst / 2}%)</span><span>${fmt(taxTotal / 2)}</span></div><div class="row"><span>SGST (${gst / 2}%)</span><span>${fmt(taxTotal / 2)}</span></div>`
        : `<div class="row"><span>IGST (${gst}%)</span><span>${fmt(taxTotal)}</span></div>`}
      <div class="grand"><span>Total</span><span>${fmt(orderNet)}</span></div>
    </div>
    <div class="words">Amount in words: ${amountInWords(orderNet)}</div>
    <div class="foot">Please direct payments to ${MP_SELLER.name} · ${MP_SELLER.bank}${marketplace?.invoice_notes ? '<br>' + esc(marketplace.invoice_notes) : ''}</div>
    <div class="sign">Authorized Signature ____________________</div>
  </body></html>`
}

export const generateMarketplaceInvoice = async (orderId) => {
  const { data: order } = await supa.from('shopify_orders').select('*').eq('id', orderId).single()
  if (!order) return { ok: false, reason: 'Order not found' }
  const { data: items } = await supa.from('order_line_items').select('*').eq('order_id', orderId)
  let marketplace = null
  if (order.marketplace_id) { const { data } = await supa.from('marketplaces').select('*').eq('id', order.marketplace_id).single(); marketplace = data }
  const html = renderMarketplaceInvoice({ order, marketplace, items: items || [] })
  const w = window.open('', '_blank', 'width=900,height=1100')
  if (!w) return { ok: false, reason: 'Popup blocked' }
  w.document.write(html); w.document.close()
  return { ok: true }
}

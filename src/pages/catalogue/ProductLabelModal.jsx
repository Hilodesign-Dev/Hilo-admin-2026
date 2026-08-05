import React, { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { supa } from '../../lib/supabase'

/* Product label — 50mm(W) x 30mm(H) per-SIZE label matching the HILO spec:
   HILO DESIGN header · CATEGORY · Product · Fabric · ₹MRP (incl. taxes) ·
   Made in India · QR (opens #/sku/<sku_code> = scan for inventory) · SKU below QR. */

const MM = 3.7795275591
const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const skuUrl = (code) => `${typeof window !== 'undefined' ? window.location.origin : ''}/#/sku/${encodeURIComponent(code)}`
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'FS', 'Free', 'Free Size']
const sizeRank = (s) => { const i = SIZE_ORDER.indexOf((s || '').toUpperCase()); return i < 0 ? 99 : i }

export default function ProductLabelModal({ product, onClose }) {
  const [skus, setSkus] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState('')
  const [qrMap, setQrMap] = useState({})

  useEffect(() => {
    (async () => {
      const { data } = await supa.from('inventory_skus').select('*')
        .eq('catalogue_product_id', product.id).eq('is_active', true)
      const rows = (data || []).sort((a, b) => sizeRank(a.size) - sizeRank(b.size) || String(a.sku_code).localeCompare(String(b.sku_code)))
      setSkus(rows); setSel(rows[0]?.sku_code || ''); setLoading(false)
      // pre-generate QR for every size
      const m = {}
      for (const r of rows) { try { m[r.sku_code] = await QRCode.toDataURL(skuUrl(r.sku_code), { margin: 0, width: 240, errorCorrectionLevel: 'M' }) } catch {} }
      setQrMap(m)
    })()
  }, [product.id])

  const cur = useMemo(() => skus.find(s => s.sku_code === sel) || skus[0] || {}, [skus, sel])
  const fabric = cur.fabric_tag || product.style_tag || ''
  const category = (cur.garment_category || product.category || '').toUpperCase()
  const pname = cur.product_title || product.product_title || ''
  const priceOf = (s) => Number(s.mrp || s.selling_price || 0)

  const labelHTML = (s, qr) => `
    <div class="label">
      <div class="brand">HILO DESIGN</div>
      <div class="body">
        <div class="txt">
          <div class="cat">${(s.garment_category || product.category || '').toUpperCase()}</div>
          <div class="prod">${s.product_title || product.product_title || ''}</div>
          <div class="price">₹ ${inr(priceOf(s))}</div>
          <div class="note">MRP incl. of all taxes</div>
          <div class="mii">Made in India</div>
        </div>
        <div class="qrwrap">
          <img class="qr" src="${qr || ''}" />
          <div class="sku">${s.sku_code}</div>
        </div>
      </div>
    </div>`

  const printCSS = `
    @page { size: 50mm 30mm; margin: 0; }
    html,body { margin:0; padding:0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
    .label { width:50mm; height:30mm; padding:1.6mm 1.8mm; font-family:Arial,Helvetica,sans-serif; color:#000; display:flex; flex-direction:column; page-break-after:always; overflow:hidden; }
    .brand { text-align:center; font-weight:800; font-size:3.8mm; line-height:1; letter-spacing:0.2mm; }
    .body { flex:1; display:flex; gap:1.4mm; margin-top:0.8mm; }
    .txt { flex:1; min-width:0; display:flex; flex-direction:column; gap:0.6mm; justify-content:center; }
    .cat { font-weight:800; font-size:2.6mm; line-height:1.1; }
    .prod { font-weight:700; font-size:2.1mm; line-height:1.15; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
    .price { font-weight:800; font-size:3.6mm; line-height:1.05; margin-top:0.4mm; }
    .note { font-weight:600; font-size:1.8mm; line-height:1.05; }
    .mii { font-weight:800; font-size:2.1mm; line-height:1.05; margin-top:0.3mm; }
    .qrwrap { width:15mm; flex-shrink:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
    .qr { width:14mm; height:14mm; }
    .sku { font-weight:800; font-size:1.9mm; margin-top:0.5mm; text-align:center; }`

  const printOne = (s) => doPrint([s])
  const printAll = () => doPrint(skus)
  const doPrint = (list) => {
    const w = window.open('', '', 'width=460,height=340')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${product.product_title || 'Labels'}</title><style>${printCSS}</style></head><body onload="window.focus();window.print();setTimeout(function(){window.close()},500)">${list.map(s => labelHTML(s, qrMap[s.sku_code])).join('')}</body></html>`)
    w.document.close()
  }

  const W = 50 * MM, H = 30 * MM
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 22, width: 460, maxWidth: '95vw', boxShadow: '0 20px 48px rgba(27,28,26,0.16)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 800, fontSize: 17, color: '#1b1c1a' }}>Product label</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#807664' }}>✕</button>
        </div>

        {loading ? <div style={{ padding: 30, textAlign: 'center', color: '#807664' }}>Loading sizes…</div> :
         skus.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#807664', border: '1px dashed #d2c5b1', borderRadius: 10 }}>No SKUs generated for this product yet. Add sizes in Inventory first.</div> : (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#807664' }}>Size</span>
              <select value={sel} onChange={e => setSel(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e3e2df', fontSize: 13 }}>
                {skus.map(s => <option key={s.sku_code} value={s.sku_code}>{s.size || '—'} · {s.sku_code}</option>)}
              </select>
            </div>

            {/* True-size preview */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: 16, background: '#f5f4f0', borderRadius: 10, marginBottom: 14 }}>
              <div style={{ width: W, height: H, padding: `${1.6 * MM}px ${1.8 * MM}px`, fontFamily: 'Arial, Helvetica, sans-serif', color: '#000', background: '#fff', border: '1px solid #d2c5b1', borderRadius: 4, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 3.8 * MM, lineHeight: 1, letterSpacing: '0.5px' }}>HILO DESIGN</div>
                <div style={{ flex: 1, display: 'flex', gap: 1.4 * MM, marginTop: 0.8 * MM }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.6 * MM, justifyContent: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: 2.6 * MM, lineHeight: 1.1 }}>{category}</div>
                    <div style={{ fontWeight: 700, fontSize: 2.1 * MM, lineHeight: 1.15, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{pname}</div>
                    <div style={{ fontWeight: 800, fontSize: 3.6 * MM, lineHeight: 1.05, marginTop: 0.4 * MM }}>₹ {inr(priceOf(cur))}</div>
                    <div style={{ fontWeight: 600, fontSize: 1.8 * MM, lineHeight: 1.05 }}>MRP incl. of all taxes</div>
                    <div style={{ fontWeight: 800, fontSize: 2.1 * MM, lineHeight: 1.05, marginTop: 0.3 * MM }}>Made in India</div>
                  </div>
                  <div style={{ width: 15 * MM, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    {qrMap[sel] ? <img src={qrMap[sel]} alt="QR" style={{ width: 14 * MM, height: 14 * MM }} /> : <div style={{ width: 14 * MM, height: 14 * MM, background: '#eee' }} />}
                    <div style={{ fontWeight: 800, fontSize: 1.9 * MM, marginTop: 0.5 * MM }}>{cur.sku_code}</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 11, color: '#807664', wordBreak: 'break-all', marginBottom: 14 }}>QR opens: <span style={{ color: '#4e4636' }}>{skuUrl(cur.sku_code || '')}</span></div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 999, border: 'none', background: '#e3e2df', color: '#1b1c1a', fontWeight: 800, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer' }}>Close</button>
              <button onClick={() => printOne(cur)} disabled={!qrMap[sel]} style={{ flex: 1, padding: '12px', borderRadius: 999, border: '1px solid #c9a432', background: '#fff', color: '#795900', fontWeight: 800, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', opacity: qrMap[sel] ? 1 : 0.5 }}>Print this size</button>
              <button onClick={printAll} className="btn-gold" style={{ flex: 1.2, padding: '12px', borderRadius: 999, color: '#fff', fontWeight: 800, fontSize: 12.5, textTransform: 'uppercase', letterSpacing: '0.05em', border: 'none', cursor: 'pointer' }}>Print all sizes ({skus.length})</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

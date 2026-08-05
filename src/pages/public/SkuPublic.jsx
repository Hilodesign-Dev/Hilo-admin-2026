import React, { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'

/* SkuPublic — anon page reached by scanning a product label QR (#/sku/<sku_code>).
   Shows the product info for that SKU so it can be scanned to look up / enter
   inventory. Read-only; anon RLS allows SELECT on inventory_skus. */

const inr = (v) => '₹' + Number(v || 0).toLocaleString('en-IN')

export default function SkuPublic({ code }) {
  const [s, setS] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const { data, error } = await supa.from('inventory_skus').select('*').eq('sku_code', code).maybeSingle()
      if (error) setErr(error.message); else if (!data) setErr('SKU not found'); else setS(data)
      setLoading(false)
    })()
  }, [code])

  const wrap = { minHeight: '100vh', background: '#faf9f5', fontFamily: 'Manrope, system-ui, sans-serif', color: '#1b1c1a' }
  if (loading) return <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#807664' }}>Loading…</div>
  if (err || !s) return <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}><div style={{ fontSize: 22, fontWeight: 800 }}>HILO DESIGN</div><div style={{ color: '#807664' }}>{err || 'SKU not found'}</div><div style={{ fontFamily: 'monospace', color: '#795900' }}>{code}</div></div>

  const Row = ({ k, v }) => v ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '11px 0', borderBottom: '1px solid #eceae4', fontSize: 14 }}>
      <span style={{ color: '#807664' }}>{k}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  ) : null

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 40 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eceae4', background: '#fff' }}>
          <span style={{ fontSize: 20 }}><b style={{ fontWeight: 800 }}>HILO</b> DESIGN</span>
        </div>
        <div style={{ background: '#fff' }}>
          {s.image_url
            ? <div style={{ width: '100%', aspectRatio: '4/3', background: '#f0eee8' }}><img src={s.image_url} alt={s.product_title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
            : <div style={{ width: '100%', aspectRatio: '4/3', background: '#f0eee8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b8b0a0' }}>No photo</div>}
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: '#c9a432', textTransform: 'uppercase' }}>{s.garment_category || 'Product'}</div>
          <h1 style={{ fontSize: 23, fontWeight: 800, margin: '4px 0 2px' }}>{s.product_title}</h1>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{inr(s.mrp)} <span style={{ fontSize: 11, fontWeight: 600, color: '#807664' }}>MRP incl. of all taxes</span></div>

          <div style={{ marginTop: 18, background: '#fff', border: '1px solid #eceae4', borderRadius: 14, padding: '4px 16px' }}>
            <Row k="SKU" v={s.sku_code} />
            <Row k="Style code" v={s.style_code} />
            <Row k="Size" v={s.size} />
            <Row k="Variant" v={s.variant_name || s.variant_label} />
            <Row k="Colour" v={s.colour_primary} />
            <Row k="Fabric" v={s.fabric_tag} />
            <Row k="HSN" v={s.hsn_code} />
          </div>
          <div style={{ marginTop: 16, fontSize: 13, fontWeight: 700 }}>Made in India</div>
          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: '#b8b0a0' }}>HILO Design · scan to look up inventory</div>
        </div>
      </div>
    </div>
  )
}

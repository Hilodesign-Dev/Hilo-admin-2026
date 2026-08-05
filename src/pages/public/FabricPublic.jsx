import React, { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'

/* FabricPublic — anon-accessible fabric detail page reached by scanning the
   QR on a fabric label (#/fabric/<FA-id>). Shows photos + the details captured
   in the fabrics table. Read-only; anon RLS allows SELECT on fabrics. */

const imgList = (v) => {
  if (!v) return []
  if (Array.isArray(v)) return v.filter(Boolean)
  try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter(Boolean) : [] } catch { return [] }
}

export default function FabricPublic({ id }) {
  const [f, setF] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    (async () => {
      const { data, error } = await supa.from('fabrics').select('*').eq('id', id).maybeSingle()
      if (error) setErr(error.message)
      else if (!data) setErr('Fabric not found')
      else setF(data)
      setLoading(false)
    })()
  }, [id])

  const wrap = { minHeight: '100vh', background: '#faf9f5', fontFamily: 'Manrope, system-ui, sans-serif', color: '#1b1c1a' }
  if (loading) return <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#807664' }}>Loading…</div>
  if (err || !f) return <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}><div style={{ fontSize: 22, fontWeight: 800 }}>HILO DESIGN</div><div style={{ color: '#807664' }}>{err || 'Fabric not found'}</div></div>

  const imgs = imgList(f.image_urls)
  const Row = ({ k, v }) => v ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '11px 0', borderBottom: '1px solid #eceae4', fontSize: 14 }}>
      <span style={{ color: '#807664' }}>{k}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  ) : null

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 0 40px' }}>
        {/* Brand bar */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eceae4', background: '#fff' }}>
          <span style={{ fontSize: 20, letterSpacing: '-0.01em' }}><b style={{ fontWeight: 800 }}>HILO</b> DESIGN</span>
        </div>

        {/* Gallery */}
        <div style={{ background: '#fff' }}>
          {imgs.length > 0 ? (
            <>
              <div style={{ width: '100%', aspectRatio: '4/3', background: '#f0eee8' }}>
                <img src={imgs[active]} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              {imgs.length > 1 && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 20px', overflowX: 'auto' }}>
                  {imgs.map((u, i) => (
                    <img key={i} src={u} alt="" onClick={() => setActive(i)} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: i === active ? '2px solid #c9a432' : '2px solid transparent', flexShrink: 0 }} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ width: '100%', aspectRatio: '4/3', background: '#f0eee8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b8b0a0', fontSize: 13 }}>No photo yet</div>
          )}
        </div>

        {/* Details */}
        <div style={{ padding: '20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#c9a432', textTransform: 'uppercase' }}>{f.id}</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '4px 0 2px' }}>{f.name}</h1>
          {f.colour && <div style={{ fontSize: 14, color: '#807664' }}>Colour · {f.colour}</div>}

          <div style={{ marginTop: 18, background: '#fff', border: '1px solid #eceae4', borderRadius: 14, padding: '4px 16px' }}>
            <Row k="Fabric code" v={f.id} />
            <Row k="Colour" v={f.colour} />
            <Row k="Family" v={f.fabric_family} />
            <Row k="Composition" v={f.composition} />
            <Row k="Weave" v={f.weave} />
            <Row k="Stretch" v={f.stretch} />
            <Row k="Width" v={f.width_inches ? `${f.width_inches}"` : ''} />
            <Row k="Weight" v={f.weight_gsm ? `${f.weight_gsm} GSM` : ''} />
            <Row k="Wash care" v={f.wash_care} />
          </div>

          {f.description && <div style={{ marginTop: 16, fontSize: 14, lineHeight: 1.6, color: '#4e4636' }}>{f.description}</div>}

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 11, color: '#b8b0a0' }}>HILO Design · fabric reference</div>
        </div>
      </div>
    </div>
  )
}

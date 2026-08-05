import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import Icon from '../../components/Icon'

/* Fabric label — 50mm (W) x 30mm (H) thermal label matching the HILO spec:
   "HILO DESIGN" header, FABRIC CODE, COLOUR, fabric name, and a QR that opens
   the public fabric page (#/fabric/<id>) with photos + details. */

const MM = 3.7795275591  // px per mm @96dpi

export default function FabricQRModal({ fabric, onClose }) {
  const [qr, setQr] = useState('')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}/#/fabric/${fabric.id}`
  const code = fabric.id
  const colour = (fabric.colour || '').toUpperCase()
  const fname = (fabric.name || '').toUpperCase()

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 0, width: 260, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr).catch(e => console.error('QR error', e))
  }, [url])

  const print = () => {
    const w = window.open('', '', 'width=420,height=320')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${code}</title>
      <style>
        @page { size: 50mm 30mm; margin: 0; }
        html,body { margin:0; padding:0; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .label { width:50mm; height:30mm; box-sizing:border-box; padding:2mm 2.2mm; display:flex; flex-direction:column;
                 font-family: Arial, Helvetica, sans-serif; color:#000; overflow:hidden; }
        .brand { font-size:4.6mm; line-height:1; white-space:nowrap; }
        .brand b { font-weight:800; }
        .body { flex:1; display:flex; gap:1.5mm; align-items:center; margin-top:1mm; }
        .txt { flex:1; min-width:0; display:flex; flex-direction:column; gap:0.6mm; }
        .txt .l { font-size:2.5mm; font-weight:800; line-height:1.15; text-transform:uppercase; word-break:break-word; }
        .qr { width:17mm; height:17mm; flex-shrink:0; }
      </style></head>
      <body onload="window.focus();window.print();setTimeout(function(){window.close()},400)">
        <div class="label">
          <div class="brand"><b>HILO</b> DESIGN</div>
          <div class="body">
            <div class="txt">
              <div class="l">FABRIC CODE : ${code}</div>
              <div class="l">COLOUR : ${colour}</div>
              <div class="l">${fname}</div>
            </div>
            <img class="qr" src="${qr}" />
          </div>
        </div>
      </body></html>`)
    w.document.close()
  }

  // On-screen preview at true 50x30mm
  const W = 50 * MM, H = 30 * MM
  const label = {
    width: W, height: H, boxSizing: 'border-box', padding: `${2 * MM}px ${2.2 * MM}px`,
    display: 'flex', flexDirection: 'column', fontFamily: 'Arial, Helvetica, sans-serif', color: '#000',
    background: '#fff', border: '1px solid #d2c5b1', borderRadius: 4, overflow: 'hidden',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 22, width: 420, maxWidth: '95vw', boxShadow: '0 20px 48px rgba(27,28,26,0.16)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 800, fontSize: 17, color: '#1b1c1a' }}>Fabric label — {code}</h2>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: '#1b1c1a' }}><Icon name="close" cls="w-5 h-5" /></button>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#807664', marginBottom: 8 }}>Label preview · 50 × 30 mm</div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 16, background: '#f5f4f0', borderRadius: 10, marginBottom: 16 }}>
          <div style={label}>
            <div style={{ fontSize: 4.6 * MM, lineHeight: 1, whiteSpace: 'nowrap' }}><b style={{ fontWeight: 800 }}>HILO</b> DESIGN</div>
            <div style={{ flex: 1, display: 'flex', gap: 1.5 * MM, alignItems: 'center', marginTop: 1 * MM }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.6 * MM }}>
                <div style={{ fontSize: 2.5 * MM, fontWeight: 800, lineHeight: 1.15, textTransform: 'uppercase' }}>FABRIC CODE : {code}</div>
                <div style={{ fontSize: 2.5 * MM, fontWeight: 800, lineHeight: 1.15, textTransform: 'uppercase' }}>COLOUR : {colour}</div>
                <div style={{ fontSize: 2.5 * MM, fontWeight: 800, lineHeight: 1.15, textTransform: 'uppercase', wordBreak: 'break-word' }}>{fname}</div>
              </div>
              {qr ? <img src={qr} alt="QR" style={{ width: 17 * MM, height: 17 * MM, flexShrink: 0 }} /> : <div style={{ width: 17 * MM, height: 17 * MM, background: '#eee', flexShrink: 0 }} />}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#807664', wordBreak: 'break-all', marginBottom: 16 }}>QR opens: <span style={{ color: '#4e4636' }}>{url}</span></div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 999, border: 'none', background: '#e3e2df', color: '#1b1c1a', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer' }}>Close</button>
          <button onClick={print} disabled={!qr} className="btn-gold" style={{ flex: 1, padding: '12px', borderRadius: 999, color: '#fff', fontWeight: 800, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', border: 'none', cursor: 'pointer', opacity: qr ? 1 : 0.5 }}>Print label</button>
        </div>
      </div>
    </div>
  )
}

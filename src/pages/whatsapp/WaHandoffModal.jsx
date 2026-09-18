import React, { useEffect, useState } from 'react'
import { C } from '../../lib/designTokens'
import { formatWait } from '../stylist/stylistFormat'

const WINDOW_S = 20

export default function WaHandoffModal({
  item, accepting, joining, onAccept, onJoinNow, onDismiss,
}) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!item) return undefined
    setTick(0)
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [item?.id])

  if (!item) return null

  const waited = (Number(item.waitingSeconds) || 0) + tick
  const left = Math.max(0, WINDOW_S - waited)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(11,25,41,0.62)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 18, maxWidth: 460, width: '100%', padding: 26,
        boxShadow: '0 28px 70px rgba(0,0,0,0.32)', borderTop: '4px solid #25D366',
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#128C7E', marginBottom: 8 }}>
          WhatsApp · real admin requested
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, lineHeight: 1.25 }}>
          {item.shopperName || 'Shopper'} asked to talk to a person
        </div>
        {item.phone && (
          <div style={{ fontSize: 14, color: C.textMuted, marginTop: 6 }}>{item.phone}</div>
        )}
        <div style={{
          marginTop: 14, display: 'flex', alignItems: 'center', gap: 10,
          background: left > 0 ? '#ecfdf5' : C.goldLight, borderRadius: 10, padding: '10px 12px',
        }}>
          <div style={{
            minWidth: 42, height: 42, borderRadius: 999, background: left > 0 ? '#25D366' : C.gold,
            color: '#fff', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{left > 0 ? `${left}s` : '—'}</div>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4 }}>
            {left > 0
              ? `AI is holding. Accept in the next ${left}s or the shopper is offered AI again.`
              : `Waited ${formatWait(waited)}. You can still Join now — the shopper may already be back with AI.`}
          </div>
        </div>
        {item.reason && (
          <div style={{ fontSize: 12, color: C.amber, marginTop: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {String(item.reason).replace(/_/g, ' ')}
          </div>
        )}
        {item.summary && (
          <div style={{ fontSize: 13, color: C.text, marginTop: 12, lineHeight: 1.5, background: C.bg, borderRadius: 10, padding: 12 }}>
            {item.summary}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap' }}>
          <button type="button" onClick={onDismiss}
            style={{ flex: 1, minWidth: 90, height: 44, borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            Later
          </button>
          <button type="button" disabled={joining || accepting} onClick={() => onJoinNow(item.id)}
            style={{
              flex: 1, minWidth: 110, height: 44, borderRadius: 10, border: 'none', background: C.navy, color: '#fff',
              fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12,
              cursor: 'pointer', opacity: joining ? 0.7 : 1,
            }}>
            {joining ? 'Joining…' : 'Join now'}
          </button>
          <button type="button" disabled={accepting || joining} onClick={() => onAccept(item.id)}
            style={{
              flex: 1.2, minWidth: 120, height: 44, borderRadius: 10, border: 'none', background: '#25D366', color: '#fff',
              fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12,
              cursor: 'pointer', opacity: accepting ? 0.7 : 1,
            }}>
            {accepting ? 'Accepting…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}

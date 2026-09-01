import React, { useEffect, useState } from 'react'
import { C } from '../../lib/designTokens'
import CatalogueRail from './CatalogueRail'
import ChatPane, { ShopperContext } from './ChatPane'
import { formatWait } from './stylistFormat'
import { toast } from '../../lib/designTokens'

function QueueRow({ item, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        padding: '10px 12px', borderRadius: 10, marginBottom: 4,
        background: active ? C.goldLight : 'transparent',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{item.shopperName || 'Shopper'}</span>
        <span style={{ fontSize: 11, color: C.textMuted }}>{formatWait(item.waitingSeconds)}</span>
      </div>
      {item.summary && (
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.summary}
        </div>
      )}
      {item.reason && (
        <div style={{ fontSize: 10, color: C.amber, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {String(item.reason).replace(/_/g, ' ')}
        </div>
      )}
    </button>
  )
}

export function AcceptHandoffModal({ item, accepting, onAccept, onDismiss }) {
  if (!item) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(11,25,41,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 440, width: '100%', padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.gold, marginBottom: 8 }}>Waiting for a stylist</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{item.shopperName || 'Shopper'}</div>
        {item.phone && <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{item.phone}</div>}
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>Waiting {formatWait(item.waitingSeconds)}</div>
        {item.reason && (
          <div style={{ fontSize: 12, color: C.amber, marginTop: 10 }}>Reason: {String(item.reason).replace(/_/g, ' ')}</div>
        )}
        {item.summary && (
          <div style={{ fontSize: 13, color: C.text, marginTop: 12, lineHeight: 1.5, background: C.bg, borderRadius: 10, padding: 12 }}>
            {item.summary}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onDismiss}
            style={{ flex: 1, height: 42, borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            Later
          </button>
          <button type="button" disabled={accepting} onClick={() => onAccept(item.id)}
            style={{
              flex: 1, height: 42, borderRadius: 10, border: 'none', background: C.gold, color: '#fff',
              fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12,
              cursor: 'pointer', opacity: accepting ? 0.7 : 1,
            }}>
            {accepting ? 'Accepting…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StylistInboxTab({
  waiting = [],
  mine = [],
  accessError,
  accept,
  acceptingId,
  focusId,
  onFocusConsumed,
}) {
  const [selectedId, setSelectedId] = useState(null)
  const [payload, setPayload] = useState(null)
  const [attached, setAttached] = useState([])

  useEffect(() => {
    if (focusId) {
      setSelectedId(focusId)
      onFocusConsumed?.()
    }
  }, [focusId, onFocusConsumed])

  useEffect(() => {
    setPayload(null)
    setAttached([])
  }, [selectedId])

  const selected = [...waiting, ...mine].find((r) => r.id === selectedId) || payload?.session
  const canSend = selected?.status === 'with_stylist' || mine.some((r) => r.id === selectedId)

  const attach = (p) => {
    if (!p?.id) return
    setAttached((prev) => {
      if (prev.some((x) => x.id === p.id)) return prev
      if (prev.length >= 5) {
        toast(false, 'Max 5 products')
        return prev
      }
      return [...prev, p]
    })
  }

  return (
    <div style={{ height: 'calc(100vh - 0px)', display: 'flex', flexDirection: 'column', background: C.cream }}>
      <div style={{
        padding: '16px 20px 12px', borderBottom: `1px solid ${C.border}`, background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: C.navy }}>Stylist inbox</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Human handover from the app stylist chat</div>
        </div>
        {waiting.length > 0 && (
          <span style={{
            background: C.red, color: '#fff', borderRadius: 999, fontSize: 12, fontWeight: 700,
            minWidth: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px',
          }}>{waiting.length}</span>
        )}
      </div>

      {accessError && (
        <div style={{ margin: 16, padding: 14, background: C.redBg, color: C.red, borderRadius: 10, fontSize: 13 }}>
          {accessError}. Ask an admin to set <strong>stylist inbox</strong> on your team profile, or use an admin / stylist role.
        </div>
      )}

      {!accessError && (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '220px 1fr 260px' }}
          className="stylist-inbox-grid">
          <div style={{ borderRight: `1px solid ${C.border}`, background: '#fff', overflowY: 'auto', padding: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, padding: '8px 8px 6px' }}>
              Waiting ({waiting.length})
            </div>
            {waiting.length === 0 && (
              <div style={{ fontSize: 12, color: C.textLight, padding: '8px 8px 16px' }}>No shoppers waiting</div>
            )}
            {waiting.map((item) => (
              <QueueRow key={item.id} item={item} active={item.id === selectedId} onClick={() => setSelectedId(item.id)} />
            ))}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, padding: '16px 8px 6px' }}>
              Mine ({mine.length})
            </div>
            {mine.length === 0 && (
              <div style={{ fontSize: 12, color: C.textLight, padding: '8px 8px 16px' }}>No claimed threads</div>
            )}
            {mine.map((item) => (
              <QueueRow key={item.id} item={item} active={item.id === selectedId} onClick={() => setSelectedId(item.id)} />
            ))}
          </div>

          <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: C.bg }}>
            {!selectedId && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 14 }}>
                Select a conversation
              </div>
            )}
            {selectedId && (
              <>
                {waiting.some((w) => w.id === selectedId) && (
                  <div style={{ padding: '10px 16px', background: '#fff', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      disabled={acceptingId === selectedId}
                      onClick={async () => {
                        try {
                          await accept(selectedId)
                        } catch {
                          // toast already shown
                        }
                      }}
                      style={{
                        height: 36, padding: '0 16px', border: 'none', borderRadius: 8, background: C.gold, color: '#fff',
                        fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                      }}
                    >{acceptingId === selectedId ? 'Accepting…' : 'Accept conversation'}</button>
                  </div>
                )}
                <div style={{ flex: 1, minHeight: 0 }}>
                  <ChatPane
                    sessionId={selectedId}
                    canSend={canSend}
                    onPayload={setPayload}
                    attached={attached}
                    onClearAttached={() => setAttached([])}
                    onClaimedElsewhere={() => toast(false, 'This thread is assigned to another stylist')}
                  />
                </div>
              </>
            )}
          </div>

          <div style={{ borderLeft: `1px solid ${C.border}`, background: '#fff', minHeight: 0 }}>
            {selectedId ? (
              <ShopperContext
                payload={payload}
                attached={attached}
                onAttach={attach}
                onDetach={(id) => setAttached((p) => p.filter((x) => x.id !== id))}
                Catalogue={(
                  <CatalogueRail
                    attached={attached}
                    onAttach={attach}
                    onDetach={(id) => setAttached((p) => p.filter((x) => x.id !== id))}
                  />
                )}
              />
            ) : (
              <div style={{ padding: 16, fontSize: 12, color: C.textLight }}>Shopper details appear here after you open a thread.</div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 960px) {
          .stylist-inbox-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: 180px 1fr 240px;
          }
        }
      `}</style>
    </div>
  )
}

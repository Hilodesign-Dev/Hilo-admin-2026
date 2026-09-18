import React, { useEffect, useState } from 'react'
import { C, toast } from '../../lib/designTokens'
import { aiStaffApi } from '../../lib/aiStaffApi'
import CatalogueRail from './CatalogueRail'
import ChatPane, { ShopperContext } from './ChatPane'
import { formatWait } from './stylistFormat'

const HEADER_H = 52

function QueueRow({ item, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        padding: '10px 12px', borderRadius: 0,
        background: active ? 'rgba(201,164,50,0.14)' : 'transparent',
        borderLeft: active ? `3px solid ${C.gold}` : '3px solid transparent',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.shopperName || 'Shopper'}
        </span>
        <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{formatWait(item.waitingSeconds)}</span>
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

export function AcceptHandoffModal({
  item, accepting, joining, onAccept, onJoinNow, onDismiss, heading = 'Waiting for a stylist',
}) {
  if (!item) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(11,25,41,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, maxWidth: 440, width: '100%', padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.gold, marginBottom: 8 }}>{heading}</div>
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
        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button type="button" onClick={onDismiss}
            style={{ flex: 1, minWidth: 90, height: 42, borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            Later
          </button>
          {onJoinNow && (
            <button type="button" disabled={joining || accepting} onClick={() => onJoinNow(item.id)}
              style={{
                flex: 1, minWidth: 110, height: 42, borderRadius: 10, border: 'none', background: C.navy, color: '#fff',
                fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12,
                cursor: 'pointer', opacity: joining ? 0.7 : 1,
              }}>
              {joining ? 'Joining…' : 'Join now'}
            </button>
          )}
          <button type="button" disabled={accepting || joining} onClick={() => onAccept(item.id)}
            style={{
              flex: 1, minWidth: 110, height: 42, borderRadius: 10, border: 'none', background: C.gold, color: '#fff',
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

function PaneHeader({ children, extra }) {
  return (
    <div style={{
      height: HEADER_H, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 8, padding: '0 14px', borderBottom: `1px solid ${C.border}`, background: '#fff',
    }}>
      <div style={{ minWidth: 0, overflow: 'hidden' }}>{children}</div>
      {extra}
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
  const waitingSelected = waiting.some((w) => w.id === selectedId)

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
    <div className="stylist-inbox-shell" style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', background: C.cream, overflow: 'hidden' }}>
      {accessError && (
        <div style={{ margin: 16, padding: 14, background: C.redBg, color: C.red, borderRadius: 10, fontSize: 13, flexShrink: 0 }}>
          {accessError}. Ask an admin to set <strong>stylist inbox</strong> on your team profile, or use an admin / stylist role.
        </div>
      )}

      {!accessError && (
        <div
          className="stylist-inbox-grid"
          style={{
            flex: 1, minHeight: 0, display: 'grid',
            gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr) minmax(260px, 300px)',
            overflow: 'hidden',
          }}
        >
          <div style={{ borderRight: `1px solid ${C.border}`, background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <PaneHeader extra={waiting.length > 0 ? (
              <span style={{
                background: C.red, color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700,
                minWidth: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px',
              }}>{waiting.length}</span>
            ) : null}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, color: C.navy, lineHeight: 1 }}>Inbox</div>
            </PaneHeader>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, padding: '12px 14px 6px' }}>
                Waiting ({waiting.length})
              </div>
              {waiting.length === 0 && (
                <div style={{ fontSize: 12, color: C.textLight, padding: '4px 14px 12px' }}>No shoppers waiting</div>
              )}
              {waiting.map((item) => (
                <QueueRow key={item.id} item={item} active={item.id === selectedId} onClick={() => setSelectedId(item.id)} />
              ))}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, padding: '14px 14px 6px' }}>
                Mine ({mine.length})
              </div>
              {mine.length === 0 && (
                <div style={{ fontSize: 12, color: C.textLight, padding: '4px 14px 12px' }}>No claimed threads</div>
              )}
              {mine.map((item) => (
                <QueueRow key={item.id} item={item} active={item.id === selectedId} onClick={() => setSelectedId(item.id)} />
              ))}
            </div>
          </div>

          <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
            <PaneHeader extra={waitingSelected ? (
              <button
                type="button"
                disabled={acceptingId === selectedId}
                onClick={async () => {
                  try { await accept(selectedId) } catch { /* toast already shown */ }
                }}
                style={{
                  height: 32, padding: '0 14px', border: 'none', borderRadius: 8, background: C.gold, color: '#fff',
                  fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                  flexShrink: 0,
                }}
              >{acceptingId === selectedId ? 'Accepting…' : 'Accept'}</button>
            ) : null}>
              {selectedId ? (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selected?.shopperName || payload?.session?.shopperName || 'Conversation'}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                    {canSend ? 'With stylist' : waitingSelected ? 'Waiting for accept' : 'Thread'}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 600, color: C.textMuted }}>Select a conversation</div>
              )}
            </PaneHeader>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {selectedId ? (
                <ChatPane
                  sessionId={selectedId}
                  canSend={canSend}
                  api={aiStaffApi}
                  onPayload={setPayload}
                  attached={attached}
                  onClearAttached={() => setAttached([])}
                  onClaimedElsewhere={() => toast(false, 'This thread is assigned to another stylist')}
                />
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textLight, fontSize: 14, background: C.bg }}>
                  Choose a waiting or claimed chat
                </div>
              )}
            </div>
          </div>

          <div style={{ borderLeft: `1px solid ${C.border}`, background: '#fff', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <PaneHeader>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted }}>Shopper</div>
            </PaneHeader>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {selectedId ? (
                <ShopperContext
                  payload={payload}
                  attached={attached}
                  onAttach={attach}
                  onDetach={(id) => setAttached((p) => p.filter((x) => x.id !== id))}
                  Catalogue={(
                    <CatalogueRail
                      api={aiStaffApi}
                      attached={attached}
                      onAttach={attach}
                      onDetach={(id) => setAttached((p) => p.filter((x) => x.id !== id))}
                    />
                  )}
                />
              ) : (
                <div style={{ padding: 14, fontSize: 12, color: C.textLight }}>Open a thread to see shopper details and catalogue search.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 1100px) {
          .stylist-inbox-grid {
            grid-template-columns: 220px minmax(0, 1fr) 240px !important;
          }
        }
        @media (max-width: 900px) {
          .stylist-inbox-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: 160px minmax(0, 1fr) 220px;
          }
        }
        @media (max-width: 768px) {
          .stylist-inbox-shell {
            padding-bottom: calc(72px + env(safe-area-inset-bottom));
            box-sizing: border-box;
          }
        }
      `}</style>
    </div>
  )
}

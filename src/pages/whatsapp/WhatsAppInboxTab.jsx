import React, { useEffect, useState } from 'react'
import { C, toast } from '../../lib/designTokens'
import { waStaffApi } from '../../lib/aiStaffApi'
import CatalogueRail from '../stylist/CatalogueRail'
import ChatPane, { ShopperContext } from '../stylist/ChatPane'
import { formatWait } from '../stylist/stylistFormat'
import WaControlPanel from './WaControlPanel'

const HEADER_H = 52

function QueueRow({ item, active, onClick, meta }) {
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
        <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{meta || formatWait(item.waitingSeconds)}</span>
      </div>
      {item.phone && (
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{item.phone}</div>
      )}
      {item.assignedStylistName && item.status === 'with_stylist' && (
        <div style={{ fontSize: 11, color: C.navy, marginTop: 2 }}>{item.assignedStylistName}</div>
      )}
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

function Section({ title, count, empty, children }) {
  return (
    <>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, padding: '12px 14px 6px' }}>
        {title} ({count})
      </div>
      {count === 0 && (
        <div style={{ fontSize: 12, color: C.textLight, padding: '4px 14px 12px' }}>{empty}</div>
      )}
      {children}
    </>
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

function isMine(item, me) {
  if (!item) return false
  if (me?.id && item.assignedStylistId && item.assignedStylistId === me.id) return true
  if (me?.name && item.assignedStylistName && item.assignedStylistName === me.name && item.status === 'with_stylist') return true
  return false
}

export default function WhatsAppInboxTab({
  requests = [],
  human = [],
  ai = [],
  closed = [],
  me,
  accessError,
  accept,
  takeover,
  acceptingId,
  joiningId,
  focusId,
  onFocusConsumed,
}) {
  const [selectedId, setSelectedId] = useState(null)
  const [payload, setPayload] = useState(null)
  const [attached, setAttached] = useState([])
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  const selected = [...requests, ...human, ...ai, ...closed].find((r) => r.id === selectedId) || payload?.session
  const status = selected?.status || payload?.session?.status
  const mineSelected = isMine(selected, me) || human.some((r) => r.id === selectedId && isMine(r, me))
  const waitingSelected = requests.some((w) => w.id === selectedId) || status === 'waiting_stylist'
  const canSend = Boolean(selectedId) && status !== 'closed'
  const showTakeover = Boolean(selectedId) && !mineSelected

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

  let statusCopy = 'WhatsApp thread'
  if (mineSelected) statusCopy = 'Replies go to WhatsApp'
  else if (waitingSelected) statusCopy = 'Waiting for accept · 20s timeout'
  else if (status === 'open') statusCopy = 'AI is live · Join now to take over'
  else if (status === 'with_stylist') statusCopy = selected?.assignedStylistName ? `With ${selected.assignedStylistName}` : 'With another admin'
  else if (status === 'closed') statusCopy = 'Closed'

  return (
    <div className="stylist-inbox-shell" style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', background: C.cream, overflow: 'hidden', position: 'relative' }}>
      {accessError && (
        <div style={{ margin: 16, padding: 14, background: C.redBg, color: C.red, borderRadius: 10, fontSize: 13, flexShrink: 0 }}>
          {accessError}. This inbox is separate from the app stylist chat and uses <strong>/wa/staff</strong>.
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
            <PaneHeader extra={(
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {requests.length > 0 && (
                  <span style={{
                    background: C.red, color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700,
                    minWidth: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px',
                  }}>{requests.length}</span>
                )}
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  aria-label="WhatsApp settings"
                  title="AI, voice, and orders"
                  style={{
                    width: 32, height: 32, padding: 0, border: `1px solid ${C.border}`, borderRadius: 8,
                    background: '#fff', color: C.navy, cursor: 'pointer', display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20, lineHeight: 1 }}>settings</span>
                </button>
              </div>
            )}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, color: C.navy, lineHeight: 1 }}>WhatsApp</div>
            </PaneHeader>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <Section title="Requests" count={requests.length} empty="No WhatsApp requests">
                {requests.map((item) => (
                  <QueueRow key={item.id} item={item} active={item.id === selectedId} onClick={() => setSelectedId(item.id)} />
                ))}
              </Section>

              <Section title="With admin" count={human.length} empty="No human-handled chats">
                {human.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    active={item.id === selectedId}
                    onClick={() => setSelectedId(item.id)}
                    meta={isMine(item, me) ? 'You' : (item.assignedStylistName || 'Admin')}
                  />
                ))}
              </Section>

              <Section title="AI chats" count={ai.length} empty="No live AI threads">
                {ai.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    active={item.id === selectedId}
                    onClick={() => setSelectedId(item.id)}
                    meta="AI"
                  />
                ))}
              </Section>

              <Section title="Closed" count={closed.length} empty="No closed threads">
                {closed.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    active={item.id === selectedId}
                    onClick={() => setSelectedId(item.id)}
                    meta="Closed"
                  />
                ))}
              </Section>
            </div>
          </div>

          <div style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
            <PaneHeader extra={(
              <>
                {waitingSelected && selectedId && (
                  <button
                    type="button"
                    disabled={acceptingId === selectedId}
                    onClick={async () => { try { await accept(selectedId) } catch { /* toast */ } }}
                    style={{
                      height: 32, padding: '0 14px', border: 'none', borderRadius: 8, background: C.gold, color: '#fff',
                      fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                    }}
                  >{acceptingId === selectedId ? 'Accepting…' : 'Accept'}</button>
                )}
                {showTakeover && selectedId && (
                  <button
                    type="button"
                    disabled={joiningId === selectedId}
                    onClick={async () => { try { await takeover(selectedId) } catch { /* toast */ } }}
                    style={{
                      height: 32, padding: '0 14px', border: 'none', borderRadius: 8, background: C.navy, color: '#fff',
                      fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                    }}
                  >{joiningId === selectedId ? 'Joining…' : 'Join now'}</button>
                )}
              </>
            )}>
              {selectedId ? (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selected?.shopperName || payload?.session?.shopperName || 'Conversation'}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                    {selected?.phone || payload?.session?.phone || ''}{selected?.phone || payload?.session?.phone ? ' · ' : ''}{statusCopy}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 600, color: C.textMuted }}>Select a WhatsApp conversation</div>
              )}
            </PaneHeader>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {selectedId ? (
                <ChatPane
                  sessionId={selectedId}
                  canSend={canSend}
                  api={waStaffApi}
                  onPayload={setPayload}
                  attached={attached}
                  onClearAttached={() => setAttached([])}
                  composerHint={mineSelected
                    ? 'Replies send to WhatsApp · Enter to send'
                    : 'Send takes over this chat, then delivers to WhatsApp'}
                  pollMs={1500}
                />
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textLight, fontSize: 14, background: C.bg, padding: 24, textAlign: 'center' }}>
                  Open any WhatsApp thread and Join now to take over. Sending a reply also takes over automatically.
                </div>
              )}
            </div>
          </div>

          <div style={{ borderLeft: `1px solid ${C.border}`, background: '#fff', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <PaneHeader>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted }}>Shopper</div>
            </PaneHeader>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {selectedId ? (
                <ShopperContext
                  fillHeight={false}
                  payload={payload}
                  attached={attached}
                  onAttach={attach}
                  onDetach={(id) => setAttached((p) => p.filter((x) => x.id !== id))}
                  Catalogue={(
                    <CatalogueRail
                      api={waStaffApi}
                      attached={attached}
                      onAttach={attach}
                      onDetach={(id) => setAttached((p) => p.filter((x) => x.id !== id))}
                    />
                  )}
                />
              ) : (
                <div style={{ padding: 14, fontSize: 12, color: C.textLight }}>
                  Open a WhatsApp thread to see the shopper and attach up to 5 catalogue cards. Use the gear for pause, voice, and placing an order.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', justifyContent: 'flex-end', background: 'rgba(11,25,41,0.35)' }}>
          <button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}
            style={{ flex: 1, border: 'none', background: 'transparent', cursor: 'pointer' }} />
          <div style={{
            width: 'min(380px, 100%)', height: '100%', background: '#fff',
            boxShadow: '-12px 0 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              height: HEADER_H, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 14px', borderBottom: `1px solid ${C.border}`,
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted }}>Separate from inbox</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Settings</div>
              </div>
              <button type="button" onClick={() => setSettingsOpen(false)}
                style={{ height: 32, padding: '0 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                Close
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <WaControlPanel
                session={selected || payload?.session}
                attached={attached}
                onDetach={(id) => setAttached((p) => p.filter((x) => x.id !== id))}
                onClearAttached={() => setAttached([])}
              />
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
            grid-template-rows: 200px minmax(0, 1fr) 220px;
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

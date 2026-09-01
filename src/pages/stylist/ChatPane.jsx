import React, { useEffect, useRef, useState } from 'react'
import { C, toast } from '../../lib/designTokens'
import { aiStaffApi } from '../../lib/aiStaffApi'
import { formatTime, rupee } from './stylistFormat'
import FormattedMessage from './FormattedMessage'

function ProductStrip({ products }) {
  if (!products?.length) return null
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingTop: 8, maxWidth: '100%' }}>
      {products.map((p) => (
        <div key={p.id || p.shopifyId} style={{
          minWidth: 112, maxWidth: 128, background: '#fff', border: `1px solid ${C.border}`,
          borderRadius: 10, overflow: 'hidden', flexShrink: 0,
        }}>
          {p.image && <img src={p.image} alt="" style={{ width: '100%', height: 96, objectFit: 'cover', display: 'block' }} />}
          <div style={{ padding: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{p.title}</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{rupee(p.price)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ColourBoard({ colours, colourBoard }) {
  const swatches = colours?.length
    ? colours
    : (colourBoard?.swatches || colourBoard?.colours || [])
  if (!swatches?.length && !colourBoard) return null
  const title = colourBoard?.title || colourBoard?.season || 'Colour board'
  return (
    <div style={{ marginTop: 8, padding: 10, background: 'rgba(255,255,255,0.7)', borderRadius: 10, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textMuted, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {swatches.map((c, i) => {
          const hex = typeof c === 'string' ? c : (c.hex || c.colour || c.color)
          const name = typeof c === 'string' ? c : (c.name || c.label || hex)
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, background: hex || '#ccc', border: '1px solid rgba(0,0,0,0.08)' }} />
              <span style={{ fontSize: 11, color: C.text }}>{name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DesignCard({ design }) {
  if (!design) return null
  return (
    <div style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: '#fff', maxWidth: 240 }}>
      {design.imageUrl && <img src={design.imageUrl} alt="" style={{ width: '100%', display: 'block' }} />}
      <div style={{ padding: 8, fontSize: 11, color: C.textMuted }}>
        <div style={{ fontWeight: 600, color: C.text }}>{design.status || 'Design'}</div>
        {design.brief && <div style={{ marginTop: 4 }}>{design.brief}</div>}
        {design.error && <div style={{ marginTop: 4, color: C.red }}>{design.error}</div>}
      </div>
    </div>
  )
}

function ImageThumbs({ urls }) {
  if (!urls?.length) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer">
          <img src={u} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />
        </a>
      ))}
    </div>
  )
}

function isOutgoing(role) {
  return role === 'stylist'
}

function bubbleAlign(role) {
  return isOutgoing(role) ? 'flex-end' : 'flex-start'
}

function bubbleStyle(role) {
  if (role === 'stylist') {
    return { background: C.navy, color: '#fff', borderRadius: '14px 14px 4px 14px' }
  }
  if (role === 'user') {
    return { background: '#fff', color: C.text, border: `1px solid ${C.border}`, borderRadius: '14px 14px 14px 4px' }
  }
  if (role === 'tool') {
    return { background: C.cream, color: C.textMuted, borderRadius: 10, fontSize: 12 }
  }
  return { background: '#fff', color: C.text, border: `1px solid ${C.gold}`, borderRadius: '14px 14px 14px 4px' }
}

function labelFor(msg, session) {
  if (msg.kind === 'handoff_connecting' || msg.kind === 'handoff_joined') return null
  if (msg.role === 'user') return 'Shopper'
  if (msg.role === 'stylist') return msg.authorName || session?.assignedStylistName || 'Stylist'
  if (msg.role === 'assistant') return 'AI'
  if (msg.role === 'tool') return 'System'
  return msg.role
}

function MessageRow({ msg, session }) {
  const isBanner = msg.kind === 'handoff_connecting' || msg.kind === 'handoff_joined'
  if (isBanner) {
    return (
      <div style={{ textAlign: 'center', margin: '10px 0' }}>
        <span style={{
          fontSize: 12, color: C.goldDark, background: C.goldLight, borderRadius: 999,
          padding: '6px 12px', display: 'inline-block',
        }}>{msg.content}</span>
      </div>
    )
  }
  const label = labelFor(msg, session)
  return (
    <div style={{ display: 'flex', justifyContent: bubbleAlign(msg.role), marginBottom: 12 }}>
      <div style={{ maxWidth: '78%' }}>
        {label && (
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: C.textMuted, marginBottom: 4, textAlign: isOutgoing(msg.role) ? 'right' : 'left',
          }}>{label} · {formatTime(msg.createdAt)}</div>
        )}
        <div style={{ padding: '10px 12px', ...bubbleStyle(msg.role) }}>
          {msg.content && String(msg.content).trim() && (
            <FormattedMessage text={msg.content} />
          )}
          <ProductStrip products={msg.products} />
          <ColourBoard colours={msg.colours} colourBoard={msg.colourBoard} />
          <DesignCard design={msg.design} />
          <ImageThumbs urls={msg.imageUrls} />
        </div>
      </div>
    </div>
  )
}

export default function ChatPane({
  sessionId,
  canSend,
  onClaimedElsewhere,
  onPayload,
  attached = [],
  onClearAttached,
}) {
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [pendingImages, setPendingImages] = useState([])
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const bottomRef = useRef(null)
  const fileRef = useRef(null)
  const idsRef = useRef('')

  const load = async () => {
    if (!sessionId) return
    try {
      const data = await aiStaffApi.session(sessionId)
      setPayload(data)
      onPayload?.(data)
      setLoading(false)
      const ids = (data.messages || []).map((m) => m.id).join(',')
      if (ids !== idsRef.current) {
        idsRef.current = ids
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }))
      }
    } catch (e) {
      setLoading(false)
      if (e.status === 403 || e.status === 409) onClaimedElsewhere?.(e)
    }
  }

  useEffect(() => {
    setPayload(null)
    setLoading(true)
    setDraft('')
    setPendingImages([])
    onClearAttached?.()
    idsRef.current = ''
    load()
    const t = setInterval(load, 2000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const send = async () => {
    const content = draft.trim()
    if (!content && !attached.length && !pendingImages.length) return
    setSending(true)
    try {
      await aiStaffApi.sendMessage(sessionId, {
        ...(content ? { content } : {}),
        ...(pendingImages.length ? { imageUrls: pendingImages } : {}),
        ...(attached.length ? { productIds: attached.map((p) => p.id) } : {}),
      })
      setDraft('')
      setPendingImages([])
      onClearAttached?.()
      await load()
    } catch (e) {
      toast(false, e.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (pendingImages.length >= 5) {
      toast(false, 'Max 5 images')
      return
    }
    setUploading(true)
    try {
      const url = await aiStaffApi.upload(file)
      setPendingImages((prev) => [...prev, url])
    } catch (err) {
      toast(false, err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const session = payload?.session
  const messages = payload?.messages || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', background: C.bg }}>
        {loading && !payload && <div style={{ fontSize: 13, color: C.textMuted }}>Loading transcript…</div>}
        {messages.map((msg) => (
          <MessageRow key={msg.id} msg={msg} session={session} />
        ))}
        <div ref={bottomRef} />
      </div>

      {canSend && (
        <div style={{ borderTop: `1px solid ${C.border}`, background: '#fff', padding: 12 }}>
          {(pendingImages.length > 0 || attached.length > 0) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {pendingImages.map((u) => (
                <div key={u} style={{ position: 'relative' }}>
                  <img src={u} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
                  <button type="button" onClick={() => setPendingImages((p) => p.filter((x) => x !== u))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: C.navy, color: '#fff', fontSize: 11, cursor: 'pointer' }}>×</button>
                </div>
              ))}
              {attached.map((p) => (
                <span key={p.id} style={{ fontSize: 11, background: C.goldLight, color: C.goldDark, borderRadius: 8, padding: '6px 8px' }}>
                  {p.title?.slice(0, 24) || p.id}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              title="Attach image"
              style={{
                width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.border}`, background: C.cream,
                cursor: 'pointer', color: C.textMuted, flexShrink: 0,
              }}>{uploading ? '…' : '📎'}</button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Reply to the shopper…"
              rows={2}
              style={{
                flex: 1, resize: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
                padding: '10px 12px', fontSize: 14, outline: 'none',
              }}
            />
            <button type="button" onClick={send} disabled={sending}
              style={{
                height: 40, padding: '0 16px', borderRadius: 10, border: 'none',
                background: C.gold, color: '#fff', fontWeight: 700, fontSize: 12,
                letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
                opacity: sending ? 0.7 : 1, flexShrink: 0,
              }}>{sending ? '…' : 'Send'}</button>
          </div>
          <div style={{ fontSize: 11, color: C.textLight, marginTop: 6 }}>Enter to send · Shift+Enter for a new line</div>
        </div>
      )}

      {!canSend && session?.status === 'waiting_stylist' && (
        <div style={{ padding: 12, borderTop: `1px solid ${C.border}`, background: C.goldLight, fontSize: 13, color: C.goldDark }}>
          Accept this conversation to reply. Shopper messages still arrive while they wait.
        </div>
      )}

    </div>
  )
}

export function ShopperContext({ payload, attached, onAttach, onDetach, Catalogue }) {
  const session = payload?.session
  const memory = payload?.designMemory
  const lastProducts = [...(payload?.messages || [])].reverse().find((m) => m.products?.length)?.products || []

  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, marginBottom: 8 }}>Shopper</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{session?.shopperName || 'Shopper'}</div>
      {session?.phone && <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{session.phone}</div>}
      {session?.reason && (
        <div style={{ fontSize: 12, color: C.amber, marginTop: 8 }}>Reason: {String(session.reason).replace(/_/g, ' ')}</div>
      )}
      {session?.summary && (
        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8, lineHeight: 1.45 }}>{session.summary}</div>
      )}

      {memory && (memory.productTitle || memory.brief || memory.productId) && (
        <div style={{ marginTop: 16, padding: 12, background: C.cream, borderRadius: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, marginBottom: 6 }}>Design memory</div>
          {memory.productTitle && <div style={{ fontSize: 13, fontWeight: 600 }}>{memory.productTitle}</div>}
          {memory.productId && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{memory.productId}</div>}
          {memory.brief && <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>{memory.brief}</div>}
          {Array.isArray(memory.inspirationImageUrls) && memory.inspirationImageUrls.length > 0 && (
            <div style={{ fontSize: 11, color: C.textLight, marginTop: 6 }}>{memory.inspirationImageUrls.length} inspiration image(s)</div>
          )}
        </div>
      )}

      {lastProducts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, marginBottom: 8 }}>Last AI SKUs</div>
          {lastProducts.slice(0, 5).map((p) => (
            <button key={p.id} type="button" onClick={() => onAttach(p)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', marginBottom: 6,
                border: `1px solid ${C.border}`, background: '#fff', borderRadius: 8, padding: 8,
                fontSize: 12, cursor: 'pointer',
              }}>{p.title}</button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        {Catalogue}
      </div>
    </div>
  )
}

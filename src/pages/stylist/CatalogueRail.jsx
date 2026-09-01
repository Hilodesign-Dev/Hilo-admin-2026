import React, { useEffect, useState } from 'react'
import { C } from '../../lib/designTokens'
import { aiStaffApi } from '../../lib/aiStaffApi'
import { rupee } from './stylistFormat'

export default function CatalogueRail({ attached, onAttach, onDetach }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setItems([])
      setErr('')
      return undefined
    }
    const t = setTimeout(async () => {
      setLoading(true)
      setErr('')
      try {
        const data = await aiStaffApi.suggest(q, 5)
        setItems(data?.items || [])
      } catch (e) {
        setErr(e.message || 'Search failed')
        setItems([])
      } finally {
        setLoading(false)
      }
    }, 280)
    return () => clearTimeout(t)
  }, [query])

  const attachedIds = new Set((attached || []).map((p) => p.id))

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, marginBottom: 8 }}>
        Catalogue
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search SKUs…"
        style={{
          width: '100%', border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff',
        }}
      />
      {loading && <div style={{ fontSize: 11, color: C.textLight, marginTop: 8 }}>Searching…</div>}
      {err && <div style={{ fontSize: 11, color: C.red, marginTop: 8 }}>{err}</div>}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
        {items.map((p) => {
          const on = attachedIds.has(p.id)
          const full = !on && attached.length >= 5
          return (
            <button
              key={p.id}
              type="button"
              disabled={full}
              onClick={() => (on ? onDetach(p.id) : onAttach(p))}
              style={{
                display: 'flex', gap: 8, textAlign: 'left', border: `1px solid ${on ? C.gold : C.border}`,
                background: on ? C.goldLight : '#fff', borderRadius: 10, padding: 8, cursor: full ? 'not-allowed' : 'pointer',
                opacity: full ? 0.5 : 1,
              }}
            >
              {p.image ? (
                <img src={p.image} alt="" style={{ width: 44, height: 56, objectFit: 'cover', borderRadius: 6, background: C.cream }} />
              ) : (
                <div style={{ width: 44, height: 56, borderRadius: 6, background: C.cream }} />
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{p.title}</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                  {rupee(p.price)}{p.productType ? ` · ${p.productType}` : ''}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      {attached.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {attached.map((p) => (
            <span key={p.id} style={{
              fontSize: 11, background: C.goldLight, color: C.goldDark, borderRadius: 999,
              padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {p.title?.slice(0, 28) || p.id}
              <button type="button" onClick={() => onDetach(p.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: C.goldDark }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

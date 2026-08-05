/* ═══════════════════════════════════════════════════════════════════════════
   LINK ORDER MODAL — attach a POS/Shopify order to a lead (only linking).
   Auto-suggests orders matching the lead's name/phone; also search by order #.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo } from 'react'
import { C } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'

const fmtINR = n => { const v = Number(n) || 0; return '₹' + Math.round(v).toLocaleString('en-IN') }
const inp = { width: '100%', fontSize: 14, padding: '9px 11px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.text, outline: 'none' }

export default function LinkOrderModal({ lead, onClose, onLinked }) {
  const [suggested, setSuggested] = useState([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [linking, setLinking] = useState(false)
  const [err, setErr] = useState('')

  const digits = (lead?.phone || '').replace(/\D/g, '').slice(-10)

  // Suggestions by name / phone on open
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ors = []
      if ((lead?.name || '').trim().length >= 3) ors.push(`customer_name.ilike.%${lead.name.trim()}%`)
      if (digits.length >= 6) ors.push(`customer_phone.ilike.%${digits}%`)
      if (!ors.length) return
      const { data } = await supa.from('shopify_orders')
        .select('id, order_number, customer_name, customer_phone, total_price, channel, created_at, order_status')
        .or(ors.join(',')).order('created_at', { ascending: false }).limit(12)
      if (!cancelled) setSuggested(data || [])
    })()
    return () => { cancelled = true }
  }, [lead])

  // Manual search by order number / name / id
  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setBusy(true)
      const { data } = await supa.from('shopify_orders')
        .select('id, order_number, customer_name, customer_phone, total_price, channel, created_at, order_status')
        .or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
        .order('created_at', { ascending: false }).limit(12)
      setResults(data || []); setBusy(false)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const link = async (order) => {
    setLinking(true); setErr('')
    try {
      const { error } = await supa.from('lead_orders').insert([{ lead_id: lead.id, order_id: order.id, linked_by: (typeof window !== 'undefined' && window._currentUserEmail) || 'unknown' }])
      if (error && !String(error.message || '').includes('duplicate')) throw error
      // mirror POS truth onto the lead
      await supa.from('leads').update({ order_id: String(order.id), status: 'Converted', amount: order.total_price || null }).eq('id', lead.id)
      onLinked && onLinked(order)
    } catch (e) { setErr(e.message || 'Failed to link'); setLinking(false) }
  }

  const Row = ({ o }) => (
    <button onClick={() => link(o)} disabled={linking} className="w-full text-left rounded-lg px-3 py-2 flex items-center justify-between gap-2" style={{ border: `1px solid ${C.border}`, background: '#fff' }}>
      <div style={{ minWidth: 0 }}>
        <div className="font-bold text-sm truncate" style={{ color: C.text }}>{o.order_number || o.id} <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: '#f3f4f6', color: C.textMuted }}>{o.channel || '—'}</span></div>
        <div className="text-[11px] truncate" style={{ color: C.textMuted }}>{o.customer_name || '—'}{o.customer_phone ? ' · ' + o.customer_phone : ''} · {(o.created_at || '').slice(0, 10)}</div>
      </div>
      <div className="text-sm font-bold whitespace-nowrap" style={{ color: C.gold }}>{fmtINR(o.total_price)}</div>
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(15,23,42,0.55)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[88vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <div><div className="font-bold" style={{ color: C.text }}>Link order</div><div className="text-xs" style={{ color: C.textMuted }}>{lead?.name}{lead?.phone ? ' · ' + lead.phone : ''}</div></div>
          <button onClick={onClose} className="text-sm font-bold px-2" style={{ color: C.textMuted }}>Close</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {err && <div className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>{err}</div>}
          <div>
            <div className="text-[10px] font-bold uppercase mb-1" style={{ color: C.gold }}>Enter order # or search</div>
            <input style={inp} value={search} onChange={e => setSearch(e.target.value)} placeholder="Order number or customer name…" autoFocus />
            {busy && <div className="text-[11px] mt-1" style={{ color: C.textMuted }}>Searching…</div>}
            {results.length > 0 && <div className="space-y-1.5 mt-2">{results.map(o => <Row key={o.id} o={o} />)}</div>}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase mb-1" style={{ color: C.gold }}>Suggested (matched by name / phone)</div>
            {suggested.length === 0 ? (
              <div className="text-xs" style={{ color: C.textMuted }}>No matching orders found — search above by order number.</div>
            ) : <div className="space-y-1.5">{suggested.map(o => <Row key={o.id} o={o} />)}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

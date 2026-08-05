/* ═══════════════════════════════════════════════════════════════════════════
   RETURNS & EXCHANGES — List View
   ═══════════════════════════════════════════════════════════════════════════
   Master table for return_requests rows: status sub-tabs, search, filters,
   inline drill-in to ReturnDetailModal.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, fmtCurrency, toast } from '../../lib/designTokens'
import { Badge } from '../orders/ui'
import { STATUS_FILTER_TABS, STATUS_META } from './constants'
import NewReturnModal from './NewReturnModal'
import ReturnDetailModal from './ReturnDetailModal'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const ReturnsListView = ({ user }) => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [detailId, setDetailId] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supa
      .from('return_requests')
      .select('id, order_id, buyer_id, customer_id, type, status, reason, reason_category, items, refund_method, refund_amount, refund_paid, store_credit_amount, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) {
      console.error('[ReturnsListView] load failed', error)
      toast(false, 'Failed to load returns: ' + error.message)
      setRows([])
      setLoading(false)
      return
    }

    // Hydrate buyer + order details in batch
    const buyerIds = Array.from(new Set((data || []).map(r => r.buyer_id).filter(Boolean)))
    const orderIds = Array.from(new Set((data || []).map(r => r.order_id).filter(Boolean)))
    const [buyersRes, ordersRes] = await Promise.all([
      buyerIds.length ? supa.from('buyers').select('id, name, phone').in('id', buyerIds) : Promise.resolve({ data: [] }),
      orderIds.length ? supa.from('shopify_orders').select('id, order_number, customer_name, total_price').in('id', orderIds) : Promise.resolve({ data: [] }),
    ])
    const buyerMap = Object.fromEntries((buyersRes.data || []).map(b => [b.id, b]))
    const orderMap = Object.fromEntries((ordersRes.data || []).map(o => [o.id, o]))
    const enriched = (data || []).map(r => ({ ...r, _buyer: buyerMap[r.buyer_id], _order: orderMap[r.order_id] }))

    setRows(enriched)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let out = rows
    if (statusFilter === 'open') {
      out = out.filter(r => ['requested','approved','received'].includes(r.status))
    } else if (statusFilter !== 'all') {
      out = out.filter(r => r.status === statusFilter)
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(r => {
        const blob = [
          r.id, r.reason, r.reason_category,
          r._order?.order_number, r._order?.customer_name,
          r._buyer?.name, r._buyer?.phone,
        ].filter(Boolean).join(' ').toLowerCase()
        return blob.includes(q)
      })
    }
    return out
  }, [rows, statusFilter, search])

  const counts = useMemo(() => {
    const c = { all: rows.length, open: 0 }
    rows.forEach(r => {
      c[r.status] = (c[r.status] || 0) + 1
      if (['requested','approved','received'].includes(r.status)) c.open += 1
    })
    return c
  }, [rows])

  return (
    <div>
      {/* Filter row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTER_TABS.map(t => {
            const active = statusFilter === t.key
            return (
              <button
                key={t.key}
                onClick={() => setStatusFilter(t.key)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{
                  background: active ? C.gold : 'transparent',
                  color:      active ? '#fff' : C.textMuted,
                  border:     active ? 'none' : `1px solid ${C.borderLight}`,
                }}
              >
                {t.label}
                {counts[t.key] != null ? <span className="ml-1.5 opacity-80">({counts[t.key]})</span> : null}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ref, order, buyer…"
            className="text-sm px-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-amber-200"
            style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text, width: 240 }}
          />
          <button
            onClick={() => setShowNew(true)}
            className="text-xs font-bold px-3 py-2 rounded-xl text-white"
            style={{ background: C.gold }}
          >
            + New Return
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
        <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: C.bg, color: C.textMuted }}>
          <div className="col-span-2">Ref</div>
          <div className="col-span-1">Type</div>
          <div className="col-span-2">Order</div>
          <div className="col-span-2">Buyer</div>
          <div className="col-span-2">Reason</div>
          <div className="col-span-1 text-right">Refund</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right">Created</div>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: C.textMuted }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: C.textMuted }}>No returns match the current filters.</div>
        ) : (
          filtered.map(r => {
            const meta = STATUS_META[r.status] || STATUS_META.requested
            const due = Math.max(0, Number(r.refund_amount || 0) - Number(r.refund_paid || 0))
            return (
              <div
                key={r.id}
                onClick={() => setDetailId(r.id)}
                className="cursor-pointer transition-colors hover:bg-gray-50"
                style={{ borderTop: `1px solid ${C.borderLight}` }}
              >
                {/* Mobile */}
                <div className="sm:hidden px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold" style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>{r.id}</div>
                      <div className="text-xs mt-0.5" style={{ color: C.textMuted }}>{r._order?.order_number || '—'} · {r._buyer?.name || r._order?.customer_name || '—'}</div>
                      <div className="text-xs mt-1" style={{ color: C.textMuted }}>{r.reason_category || '—'}</div>
                    </div>
                    <Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs">
                    <span style={{ color: C.textMuted }}>{r.type}</span>
                    <span style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(due) || '—'}</span>
                  </div>
                </div>
                {/* Desktop */}
                <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-3 items-center">
                  <div className="col-span-2 text-xs font-bold" style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>{r.id}</div>
                  <div className="col-span-1 text-xs capitalize" style={{ color: C.text }}>{r.type}</div>
                  <div className="col-span-2 text-xs font-mono" style={{ color: C.goldDark }}>{r._order?.order_number || '—'}</div>
                  <div className="col-span-2 text-xs" style={{ color: C.text }}>{r._buyer?.name || r._order?.customer_name || '—'}</div>
                  <div className="col-span-2 text-xs" style={{ color: C.textMuted }}>{r.reason_category || r.reason || '—'}</div>
                  <div className="col-span-1 text-xs text-right" style={{ color: C.text, fontFamily: 'JetBrains Mono, monospace' }}>{due ? fmtCurrency(due) : '—'}</div>
                  <div className="col-span-1"><Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge></div>
                  <div className="col-span-1 text-xs text-right" style={{ color: C.textMuted }}>{fmtDate(r.created_at)}</div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {showNew ? (
        <NewReturnModal
          user={user}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); load() }}
        />
      ) : null}
      {detailId ? (
        <ReturnDetailModal
          id={detailId}
          user={user}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  )
}

export default ReturnsListView

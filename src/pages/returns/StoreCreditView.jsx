/* ═══════════════════════════════════════════════════════════════════════════
   RETURNS & EXCHANGES — Store Credit
   ═══════════════════════════════════════════════════════════════════════════
   Two-pane layout: searchable buyer balance list (left), per-buyer ledger
   of issued/redeemed/adjustment/expired transactions (right).
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, fmtCurrency, toast } from '../../lib/designTokens'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const KIND_LABEL = { issued: 'Issued', redeemed: 'Redeemed', adjustment: 'Adjustment', expired: 'Expired' }

const StoreCreditView = () => {
  const [buyers, setBuyers] = useState([])
  const [activeBuyer, setActiveBuyer] = useState(null)
  const [ledger, setLedger] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const { data, error } = await supa
        .from('buyers')
        .select('id, name, phone, email, store_credit')
        .gt('store_credit', 0)
        .order('store_credit', { ascending: false })
        .limit(500)
      if (error) toast(false, 'Buyers load failed: ' + error.message)
      setBuyers(data || [])
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    if (!activeBuyer) { setLedger([]); return }
    ;(async () => {
      const { data, error } = await supa
        .from('store_credit_transactions')
        .select('id, amount, kind, notes, expires_on, created_at, return_request_id, order_id')
        .eq('buyer_id', activeBuyer.id)
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) toast(false, 'Ledger load failed: ' + error.message)
      setLedger(data || [])
    })()
  }, [activeBuyer])

  const filteredBuyers = useMemo(() => {
    if (!search.trim()) return buyers
    const q = search.trim().toLowerCase()
    return buyers.filter(b => [b.name, b.phone, b.email].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [buyers, search])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[60vh]">
      <div className="lg:col-span-1 rounded-xl overflow-hidden flex flex-col" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
        <div className="px-3 py-3 border-b" style={{ borderColor: C.borderLight }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search buyer…"
            className="w-full text-sm px-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-amber-200"
            style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
          />
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 500 }}>
          {loading ? (
            <div className="p-4 text-sm" style={{ color: C.textMuted }}>Loading…</div>
          ) : filteredBuyers.length === 0 ? (
            <div className="p-4 text-sm" style={{ color: C.textMuted }}>No buyers with store credit.</div>
          ) : (
            filteredBuyers.map(b => (
              <button
                key={b.id}
                onClick={() => setActiveBuyer(b)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50"
                style={{
                  borderBottom: `1px solid ${C.borderLight}`,
                  background: activeBuyer?.id === b.id ? C.bg : 'transparent',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: C.text }}>{b.name || '—'}</span>
                  <span className="text-sm" style={{ color: C.gold, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(b.store_credit)}</span>
                </div>
                <div className="text-xs" style={{ color: C.textMuted }}>{b.phone || b.email || ''}</div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-2 rounded-xl p-4 sm:p-6" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
        {!activeBuyer ? (
          <div className="text-sm" style={{ color: C.textMuted }}>Select a buyer to view their store credit ledger.</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Balance</div>
              <div className="text-3xl" style={{ color: C.gold, fontFamily: 'JetBrains Mono, monospace' }}>{fmtCurrency(activeBuyer.store_credit)}</div>
              <div className="text-sm" style={{ color: C.text }}>{activeBuyer.name}</div>
              <div className="text-xs" style={{ color: C.textMuted }}>{activeBuyer.phone || activeBuyer.email || ''}</div>
            </div>

            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ background: C.bg, color: C.textMuted }}>
                <div className="col-span-3">Date</div>
                <div className="col-span-2">Kind</div>
                <div className="col-span-2 text-right">Amount</div>
                <div className="col-span-5">Note</div>
              </div>
              {ledger.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm" style={{ color: C.textMuted }}>No transactions.</div>
              ) : ledger.map(t => (
                <div key={t.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center" style={{ borderTop: `1px solid ${C.borderLight}` }}>
                  <div className="col-span-3 text-xs" style={{ color: C.textMuted }}>{fmtDate(t.created_at)}</div>
                  <div className="col-span-2 text-xs" style={{ color: C.text }}>{KIND_LABEL[t.kind] || t.kind}</div>
                  <div
                    className="col-span-2 text-right text-xs"
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      color: Number(t.amount) >= 0 ? C.green : C.red,
                    }}
                  >
                    {fmtCurrency(t.amount)}
                  </div>
                  <div className="col-span-5 text-xs" style={{ color: C.textMuted }}>{t.notes || ''}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default StoreCreditView

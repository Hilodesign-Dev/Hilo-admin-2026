/* Marketplace Dues & Reconciliation.
   Dues: what each marketplace still owes (invoiced − received), with ageing.
   Reconcile: upload/paste their payment sheet (CSV), map columns, auto-match on
   the marketplace order ref, recompute statuses (reconciled/reconciling/due). */
import React, { useEffect, useMemo, useState } from 'react'
import { supa } from '../../lib/supabase'

const GOLD = '#c9a432', INK = '#1b1c1a', SUB = '#6b7280', LINE = '#ebe7df', GOOD = '#16a34a', BAD = '#b91c1c', AMBER = '#d97706'
const inr = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')
const STATUS = {
  reconciled:   ['✓ Reconciled', GOOD, '#dcfce7'],
  reconciling:  ['◑ Reconciling', AMBER, '#fef3c7'],
  unreconciled: ['• Due', BAD, '#fee2e2'],
}

// minimal CSV parser (handles quoted fields + commas)
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (cur !== '' || row.length) { row.push(cur); rows.push(row); row = []; cur = '' } }
    else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows.filter(r => r.some(c => String(c).trim() !== ''))
}

export default function MarketplaceDues() {
  const [tab, setTab] = useState('dues')
  const [marketplaces, setMarketplaces] = useState([])
  const [dues, setDues] = useState([])
  const [settlements, setSettlements] = useState([])
  const [mpFilter, setMpFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [mp, d, s] = await Promise.all([
      supa.from('marketplaces').select('id, name, is_active').order('name'),
      supa.from('v_marketplace_dues').select('*').order('age_days', { ascending: false }),
      supa.from('marketplace_settlements').select('*').order('created_at', { ascending: false }),
    ])
    setMarketplaces(mp.data || []); setDues(d.data || []); setSettlements(s.data || []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const rows = useMemo(() => dues.filter(r =>
    (mpFilter === 'all' || r.marketplace_id === mpFilter) &&
    (statusFilter === 'all' || r.recon_status === statusFilter)
  ), [dues, mpFilter, statusFilter])

  const totals = useMemo(() => {
    const t = { invoiced: 0, received: 0, due: 0, reconciled: 0, reconciling: 0, unrec: 0 }
    rows.forEach(r => {
      t.invoiced += Number(r.invoiced_amount) || 0; t.received += Number(r.received_amount) || 0; t.due += Number(r.balance_due) || 0
      if (r.recon_status === 'reconciled') t.reconciled++; else if (r.recon_status === 'reconciling') t.reconciling++; else t.unrec++
    })
    return t
  }, [rows])

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: SUB }}>Loading…</div>

  return (
    <div style={{ padding: '16px 20px 80px', fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>Marketplace Dues &amp; Reconciliation</div>
      <div style={{ fontSize: 12, color: SUB, marginBottom: 12 }}>What each marketplace owes us, and matching their payments to our orders.</div>

      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${LINE}`, marginBottom: 14 }}>
        {[['dues', 'Dues'], ['reconcile', 'Reconcile'], ['settlements', 'Settlements']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, border: 'none', background: 'transparent', borderBottom: tab === k ? `2px solid ${GOLD}` : '2px solid transparent', color: tab === k ? INK : SUB }}>{l}</button>
        ))}
      </div>

      {tab === 'dues' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={mpFilter} onChange={e => setMpFilter(e.target.value)} style={sel}>
              <option value="all">All marketplaces</option>
              {marketplaces.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={sel}>
              <option value="all">All statuses</option>
              <option value="unreconciled">Due</option>
              <option value="reconciling">Reconciling</option>
              <option value="reconciled">Reconciled</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 14 }}>
            <Kpi label="Outstanding due" v={inr(totals.due)} accent={BAD} />
            <Kpi label="Invoiced" v={inr(totals.invoiced)} />
            <Kpi label="Received" v={inr(totals.received)} accent={GOOD} />
            <Kpi label="Orders due" v={`${totals.unrec + totals.reconciling}`} />
          </div>
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
            <div style={{ ...hrow, gridTemplateColumns: '110px 1fr 100px 100px 100px 120px 60px' }}>
              <div>Order</div><div>Marketplace / ref</div><div className="num" style={rt}>Invoiced</div><div style={rt}>Received</div><div style={rt}>Due</div><div>Status</div><div style={rt}>Age</div>
            </div>
            {rows.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: SUB }}>No orders.</div>}
            {rows.map(r => {
              const [lab, fg, bg] = STATUS[r.recon_status] || STATUS.unreconciled
              return (
                <div key={r.order_id} style={{ ...drow, gridTemplateColumns: '110px 1fr 100px 100px 100px 120px 60px' }}>
                  <div style={{ fontWeight: 700, fontFamily: 'monospace' }}>{r.order_number}</div>
                  <div style={{ color: SUB, fontSize: 12 }}>{r.marketplace_name}{r.marketplace_order_ref ? ` · ${r.marketplace_order_ref}` : ''}</div>
                  <div style={rt}>{inr(r.invoiced_amount)}</div>
                  <div style={{ ...rt, color: GOOD }}>{inr(r.received_amount)}</div>
                  <div style={{ ...rt, fontWeight: 700, color: Number(r.balance_due) > 0 ? BAD : SUB }}>{inr(r.balance_due)}</div>
                  <div><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: bg, color: fg }}>{lab}</span></div>
                  <div style={{ ...rt, color: r.age_days > 60 ? BAD : SUB, fontSize: 12 }}>{r.age_days}d</div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'reconcile' && <ReconcilePanel marketplaces={marketplaces} onDone={() => { load(); setTab('dues') }} />}

      {tab === 'settlements' && (
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <div style={{ ...hrow, gridTemplateColumns: '1fr 120px 100px 100px 100px' }}>
            <div>File · Marketplace</div><div>Uploaded</div><div style={rt}>Rows</div><div style={rt}>Matched</div><div style={rt}>Net</div>
          </div>
          {settlements.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: SUB }}>No settlements imported yet.</div>}
          {settlements.map(s => (
            <div key={s.id} style={{ ...drow, gridTemplateColumns: '1fr 120px 100px 100px 100px' }}>
              <div><b>{s.marketplace_name}</b> <span style={{ color: SUB, fontSize: 12 }}>{s.file_name}</span></div>
              <div style={{ color: SUB, fontSize: 12 }}>{new Date(s.created_at).toLocaleDateString('en-IN')}</div>
              <div style={rt}>{s.row_count}</div>
              <div style={{ ...rt, color: GOOD }}>{s.matched_count}</div>
              <div style={rt}>{inr(s.net_total)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReconcilePanel({ marketplaces, onDone }) {
  const [mpId, setMpId] = useState('')
  const [raw, setRaw] = useState('')
  const [grid, setGrid] = useState(null) // {headers, rows}
  const [map, setMap] = useState({ ref: '', paid: '', fees: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const parse = (text) => {
    const g = parseCSV(text)
    if (g.length < 2) { setMsg('Need a header row + at least one data row.'); return }
    const headers = g[0].map(h => h.trim())
    setGrid({ headers, rows: g.slice(1) })
    // auto-guess columns
    const find = (...keys) => headers.findIndex(h => keys.some(k => h.toLowerCase().includes(k)))
    setMap({
      ref: headers[find('order', 'po', 'ref')] || headers[0],
      paid: headers[find('net', 'paid', 'payout', 'amount', 'settle')] || '',
      fees: headers[find('fee', 'commission', 'tcs', 'tds')] || '',
    })
    setMsg('')
  }
  const onFile = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { setRaw(String(r.result)); parse(String(r.result)) }; r.readAsText(f) }

  const preview = useMemo(() => {
    if (!grid) return null
    const ri = grid.headers.indexOf(map.ref), pi = grid.headers.indexOf(map.paid), fi = grid.headers.indexOf(map.fees)
    let gross = 0, fees = 0, net = 0
    const lines = grid.rows.map(r => {
      const ref = (r[ri] || '').trim()
      const paid = Number(String(r[pi] || '0').replace(/[^0-9.\-]/g, '')) || 0
      const fee = fi >= 0 ? (Number(String(r[fi] || '0').replace(/[^0-9.\-]/g, '')) || 0) : 0
      net += paid; fees += fee; gross += paid + fee
      return { ref, paid, fee, raw: Object.fromEntries(grid.headers.map((h, i) => [h, r[i]])) }
    }).filter(l => l.ref)
    return { lines, gross, fees, net }
  }, [grid, map])

  const doImport = async () => {
    if (!mpId || !preview?.lines?.length) return
    setBusy(true); setMsg('')
    try {
      const mp = marketplaces.find(m => m.id === mpId)
      const { data: st } = await supa.from('marketplace_settlements').insert({
        marketplace_id: mpId, marketplace_name: mp?.name, file_name: 'upload.csv',
        gross_total: preview.gross, fees_total: preview.fees, net_total: preview.net, row_count: preview.lines.length,
        uploaded_by_id: window._currentTeamMemberId ? Number(window._currentTeamMemberId) : null,
        uploaded_by_name: window._currentUserName || null,
      }).select().single()
      const lines = preview.lines.map(l => ({
        settlement_id: st.id, marketplace_id: mpId, marketplace_order_ref: l.ref,
        paid_amount: l.paid, fees: l.fee, gross: l.paid + l.fee, raw_row: l.raw,
      }))
      await supa.from('marketplace_settlement_lines').insert(lines)
      await supa.rpc('recompute_marketplace_reconciliation', { p_marketplace_id: mpId })
      // matched count
      const { count } = await supa.from('marketplace_settlement_lines').select('id', { count: 'exact', head: true }).eq('settlement_id', st.id).eq('match_status', 'matched')
      await supa.from('marketplace_settlements').update({ matched_count: count || 0 }).eq('id', st.id)
      onDone()
    } catch (e) { setMsg('Import failed: ' + (e.message || e)) } finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: SUB, marginBottom: 10 }}>Export the marketplace's payment report to <b>CSV</b>, then upload or paste it. We match rows to our orders by the marketplace order ref.</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={mpId} onChange={e => setMpId(e.target.value)} style={sel}>
          <option value="">Select marketplace…</option>
          {marketplaces.filter(m => m.is_active !== false).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ fontSize: 12 }} />
      </div>
      <textarea value={raw} onChange={e => { setRaw(e.target.value); parse(e.target.value) }} placeholder="…or paste CSV here (first row = headers)"
        style={{ width: '100%', minHeight: 90, border: `1px solid ${LINE}`, borderRadius: 8, padding: 10, fontSize: 12, fontFamily: 'monospace' }} />
      {grid && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            {[['ref', 'Order ref column'], ['paid', 'Net paid column'], ['fees', 'Fees column (optional)']].map(([k, l]) => (
              <div key={k}>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: SUB, display: 'block' }}>{l}</label>
                <select value={map[k]} onChange={e => setMap({ ...map, [k]: e.target.value })} style={sel}>
                  <option value="">—</option>
                  {grid.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          {preview && (
            <div style={{ fontSize: 13, color: INK, marginBottom: 10 }}>
              {preview.lines.length} rows · net {inr(preview.net)} · fees {inr(preview.fees)}
            </div>
          )}
          <button onClick={doImport} disabled={busy || !mpId || !map.ref || !map.paid} style={{ background: INK, color: '#fff', fontWeight: 700, fontSize: 13, padding: '9px 16px', borderRadius: 8, border: 'none', opacity: (busy || !mpId || !map.ref || !map.paid) ? 0.5 : 1 }}>
            {busy ? 'Importing…' : 'Import & reconcile'}
          </button>
          {msg && <div style={{ marginTop: 8, fontSize: 12, color: BAD }}>{msg}</div>}
        </div>
      )}
    </div>
  )
}

const sel = { border: `1px solid ${LINE}`, borderRadius: 8, padding: '7px 10px', fontSize: 13, background: '#fff' }
const rt = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const hrow = { display: 'grid', padding: '8px 14px', background: '#faf9f5', borderBottom: `1px solid ${LINE}`, fontSize: 11, fontWeight: 700, color: SUB, textTransform: 'uppercase' }
const drow = { display: 'grid', padding: '9px 14px', borderBottom: `1px solid ${LINE}`, alignItems: 'center', fontSize: 13 }
const Kpi = ({ label, v, accent }) => (
  <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: 10, background: '#fff' }}>
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: SUB }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: accent || INK }}>{v}</div>
  </div>
)

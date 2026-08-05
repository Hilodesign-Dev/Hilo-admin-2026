/* Monthly Invoices — editable GST filing snapshot of orders.
   Pull a month's orders into gst_invoices (snapshot), review/edit, then it
   becomes the filing basis. Orders table is never touched. */
import React, { useEffect, useMemo, useState } from 'react'
import { C, fmtCurrency } from '../../lib/designTokens'
const inr2 = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
import { supa } from '../../lib/supabase'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const csvDl = (rows, name) => { const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(',')).join('\n'); const b = new Blob([csv], { type: 'text/csv' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u) }
const effRate = (r) => { const t = Number(r.taxable_amount) || 0; const g = Number(r.cgst_amount)+Number(r.sgst_amount)+Number(r.igst_amount); return t > 0 ? Math.round(g / t * 100) : 0 }
const cashAmt = (r) => Number(r.cash_amount) || 0
const STATUS = { draft: ['Draft', C.textMuted, C.bg], reviewed: ['Reviewed', '#2563eb', '#dbeafe'], filed: ['Filed', '#16a34a', '#dcfce7'] }

export default function MonthlyInvoicesSubTab() {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [year, setYear] = useState(prev.getFullYear())
  const [month, setMonth] = useState(prev.getMonth() + 1)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [chFilter, setChFilter] = useState('all')
  const [stFilter, setStFilter] = useState('all')
  const [payFilter, setPayFilter] = useState('all')
  const [drawer, setDrawer] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data } = await supa.from('gst_invoices').select('*').eq('period_year', year).eq('period_month', month).order('invoice_date')
    setRows(data || []); setLoading(false)
  }
  useEffect(() => { load() }, [year, month])

  const pull = async () => {
    setSyncing(true)
    try {
      await supa.rpc('sync_gst_invoices', { p_year: year, p_month: month })
      await supa.rpc('populate_gst_payment_modes', { p_year: year, p_month: month })
      await supa.rpc('refresh_gst_ledger', { p_year: year, p_month: month })
      await load()
    } finally { setSyncing(false) }
  }

  const channels = useMemo(() => [...new Set(rows.map(r => r.channel).filter(Boolean))], [rows])
  const shown = useMemo(() => rows.filter(r =>
    (chFilter === 'all' || r.channel === chFilter) && (stFilter === 'all' || r.status === stFilter) &&
    (payFilter === 'all' || (payFilter === 'cash' ? cashAmt(r) > 0 : cashAmt(r) === 0))), [rows, chFilter, stFilter, payFilter])
  const k = useMemo(() => shown.reduce((a, r) => ({
    inv: a.inv + 1, taxable: a.taxable + Number(r.taxable_amount || 0),
    cgst: a.cgst + Number(r.cgst_amount || 0), sgst: a.sgst + Number(r.sgst_amount || 0),
    igst: a.igst + Number(r.igst_amount || 0), total: a.total + Number(r.total_amount || 0), cash: a.cash + cashAmt(r),
  }), { inv: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0, cash: 0 }), [shown])

  const exportFull = () => {
    const head = ['Invoice #','Date','Customer','GSTIN','Channel','Payment','Place of Supply','Full Sale','Cash Excluded','Net (GST base)','Taxable','CGST','SGST','IGST','Total GST','Grand Total','Status']
    const body = shown.map(r => [r.invoice_number, r.invoice_date, r.customer_name, r.customer_gstin || '', r.channel, r.payment_summary || '', r.place_of_supply,
      r.total_amount, r.cash_amount || 0, Number(r.total_amount) - Number(r.cash_amount || 0),
      r.taxable_amount, r.cgst_amount, r.sgst_amount, r.igst_amount, Number(r.cgst_amount)+Number(r.sgst_amount)+Number(r.igst_amount), r.total_amount, r.status])
    csvDl([head, ...body], `Hilo-GST-Invoices-${year}-${String(month).padStart(2,'0')}.csv`)
  }
  const exportCA = () => {
    const head = ['Invoice #','Date','Party Name','GSTIN','Place of Supply','Rate %','Full Sale','Cash Excluded','Invoice Value (net of cash)','Taxable','CGST','SGST','IGST','Total GST']
    const body = shown.map(r => {
      const cash = Number(r.cash_amount || 0), net = Number(r.total_amount || 0) - cash
      const gst = Number(r.cgst_amount || 0) + Number(r.sgst_amount || 0) + Number(r.igst_amount || 0)
      return [r.invoice_number, r.invoice_date, r.customer_name, r.customer_gstin || '', r.place_of_supply,
        effRate(r), r.total_amount, cash, net, r.taxable_amount, r.cgst_amount, r.sgst_amount, r.igst_amount, gst]
    })
    // totals row
    const t = shown.reduce((a, r) => { const c = Number(r.cash_amount||0); a.full += Number(r.total_amount||0); a.cash += c; a.net += Number(r.total_amount||0)-c; a.tax += Number(r.taxable_amount||0); a.cg += Number(r.cgst_amount||0); a.sg += Number(r.sgst_amount||0); a.ig += Number(r.igst_amount||0); return a }, { full:0,cash:0,net:0,tax:0,cg:0,sg:0,ig:0 })
    body.push(['TOTAL','','','','','', t.full, t.cash, t.net, t.tax, t.cg, t.sg, t.ig, t.cg+t.sg+t.ig])
    csvDl([head, ...body], `Hilo-GSTR1-${year}-${String(month).padStart(2,'0')}.csv`)
  }

  const setStatus = async (r, status) => { await supa.from('gst_invoices').update({ status }).eq('id', r.id); load() }

  const sel = { padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: '#fff' }
  return (
    <div style={{ fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={sel}>{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
        <select value={year} onChange={e => setYear(+e.target.value)} style={sel}>{[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}</select>
        <button onClick={pull} disabled={syncing} style={{ background: C.gold, color: '#fff', fontWeight: 700, fontSize: 13, padding: '7px 14px', borderRadius: 8, border: 'none', opacity: syncing ? 0.6 : 1 }}>{syncing ? 'Pulling…' : '⟳ Pull month'}</button>
        <div style={{ flex: 1 }} />
        <select value={chFilter} onChange={e => setChFilter(e.target.value)} style={sel}><option value="all">All channels</option>{channels.map(c => <option key={c}>{c}</option>)}</select>
        <select value={stFilter} onChange={e => setStFilter(e.target.value)} style={sel}><option value="all">All statuses</option><option value="draft">Draft</option><option value="reviewed">Reviewed</option><option value="filed">Filed</option></select>
        <select value={payFilter} onChange={e => setPayFilter(e.target.value)} style={sel}><option value="all">All payments</option><option value="cash">Cash transactions</option><option value="noncash">Non-cash</option></select>
        <button onClick={exportFull} disabled={!shown.length} style={{ fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.text }}>Download Excel</button>
        <button onClick={exportCA} disabled={!shown.length} style={{ fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.text }}>Download for CA</button>
      </div>

      {rows.length === 0 && !loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, border: `1px dashed ${C.border}`, borderRadius: 12 }}>
          No snapshot for {MONTHS[month - 1]} {year} yet. Click <b>Pull month</b> to copy this month's orders in — you can then edit before filing.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginBottom: 12 }}>
            <Kpi label="Invoices" v={k.inv} />
            <Kpi label="Total sales" v={inr2(k.total)} />
            <Kpi label="Cash excluded" v={inr2(k.cash)} accent="#0891b2" />
            <Kpi label="Taxable (non-cash)" v={inr2(k.taxable)} />
            <Kpi label="CGST" v={inr2(k.cgst)} /><Kpi label="SGST" v={inr2(k.sgst)} />
            <Kpi label="IGST" v={inr2(k.igst)} /><Kpi label="Total GST" v={inr2(k.cgst + k.sgst + k.igst)} accent={C.gold} />
          </div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '104px 60px 1.1fr 180px 90px 78px 78px 66px 96px 78px', padding: '8px 12px', background: C.bg, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.textMuted }}>
              <div>Inv #</div><div>Date</div><div>Customer</div><div>Payment</div><div style={rt}>Taxable</div><div style={rt}>CGST</div><div style={rt}>SGST</div><div style={rt}>IGST</div><div style={rt}>Total</div><div style={rt}>Status</div>
            </div>
            {shown.map(r => { const [lab, fg, bg] = STATUS[r.status] || STATUS.draft; return (
              <div key={r.id} onClick={() => setDrawer(r)} style={{ display: 'grid', gridTemplateColumns: '104px 60px 1.1fr 180px 90px 78px 78px 66px 96px 78px', padding: '9px 12px', borderBottom: `1px solid ${C.borderLight}`, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.invoice_number}{r.edited && <span title="Edited" style={{ color: C.gold }}> ✎</span>}</div>
                <div style={{ color: C.textMuted }}>{r.invoice_date ? new Date(r.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer_name || '—'}{r.customer_gstin ? ' 🏢' : ''} <span style={{ color: C.textLight, fontSize: 11 }}>· {r.channel}</span></div>
                <div style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(() => {
                    const modes = r.payment_modes || []
                    if (!modes.length) return <span style={{ color: C.textLight }}>—</span>
                    const onlyCash = modes.length === 1 && /cash/i.test(modes[0].method || '')
                    return <span title={modes.map(m => `${m.method} ₹${Math.round(m.amount).toLocaleString('en-IN')}`).join(' · ')}>
                      {onlyCash && <span style={{ fontSize: 9, fontWeight: 700, background: '#dcfce7', color: '#16a34a', padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>Cash bill</span>}
                      {modes.map(m => `${m.method} ₹${Math.round(m.amount).toLocaleString('en-IN')}`).join(' · ')}
                    </span>
                  })()}
                </div>
                <div style={rt}>{inr2(r.taxable_amount)}</div><div style={rt}>{inr2(r.cgst_amount)}</div><div style={rt}>{inr2(r.sgst_amount)}</div><div style={rt}>{inr2(r.igst_amount)}</div>
                <div style={{ ...rt, fontWeight: 700 }}>{inr2(Number(r.total_amount) - Number(r.cash_amount || 0))}<div style={{ fontSize: 9, fontWeight: 600, color: C.textLight }}>{effRate(r)}% {r.is_inter_state ? 'IGST' : 'GST'}</div>{Number(r.cash_amount) > 0 && <div style={{ fontSize: 9, color: '#0891b2' }}>−cash {inr2(r.cash_amount)}</div>}</div>
                <div style={rt}><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: bg, color: fg }}>{lab}</span></div>
              </div>
            )})}
            <div style={{ display: 'grid', gridTemplateColumns: '104px 60px 1.1fr 180px 90px 78px 78px 66px 96px 78px', padding: '9px 12px', background: C.bg, fontWeight: 800, fontSize: 12.5 }}>
              <div style={{ gridColumn: '1 / 5' }}>{k.inv} invoices</div>
              <div style={rt}>{inr2(k.taxable)}</div><div style={rt}>{inr2(k.cgst)}</div><div style={rt}>{inr2(k.sgst)}</div><div style={rt}>{inr2(k.igst)}</div><div style={rt}>{inr2(k.total)}</div><div />
            </div>
          </div>
        </>
      )}

      {drawer && <InvoiceDrawer inv={drawer} onClose={() => setDrawer(null)} onSaved={() => { setDrawer(null); load(); supa.rpc('refresh_gst_ledger', { p_year: year, p_month: month }) }} setStatus={setStatus} />}
    </div>
  )
}

function InvoiceDrawer({ inv, onClose, onSaved, setStatus }) {
  const [lines, setLines] = useState([])
  const [f, setF] = useState({ ...inv })
  const [saving, setSaving] = useState(false)
  useEffect(() => { supa.from('gst_invoice_lines').select('*').eq('invoice_id', inv.id).order('line_no').then(({ data }) => setLines(data || [])) }, [inv.id])
  const num = (v) => v === '' || v == null ? 0 : Number(v)
  const save = async () => {
    setSaving(true)
    try {
      await supa.from('gst_invoices').update({
        invoice_number: f.invoice_number, customer_name: f.customer_name, customer_gstin: f.customer_gstin || null,
        place_of_supply: f.place_of_supply, is_inter_state: !!f.is_inter_state, is_export: !!f.is_export,
        taxable_amount: num(f.taxable_amount), cgst_amount: num(f.cgst_amount), sgst_amount: num(f.sgst_amount),
        igst_amount: num(f.igst_amount), total_amount: num(f.total_amount),
        edited: true, edited_by: window._currentUserName || null, edited_at: new Date().toISOString(),
      }).eq('id', inv.id)
      onSaved()
    } finally { setSaving(false) }
  }
  const inp = { width: '100%', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 8px', fontSize: 13 }
  const lab = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.textMuted, display: 'block', marginBottom: 3 }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', height: '100%', overflowY: 'auto', background: '#fff', padding: 20, fontFamily: 'Manrope, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{f.invoice_number} · {inv.channel}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, color: C.textMuted }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>Edits are saved to the filing snapshot only — the order is untouched.</div>
        {Number(inv.cash_amount) > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, padding: 10, background: '#ecfeff', border: `1px solid #a5f3fc`, borderRadius: 8, fontSize: 12 }}>
            <div><div style={{ color: C.textMuted, fontSize: 10 }}>Full sale</div><b>{inr2(inv.total_amount)}</b></div>
            <div><div style={{ color: '#0891b2', fontSize: 10 }}>Cash removed</div><b style={{ color: '#0891b2' }}>−{inr2(inv.cash_amount)}</b></div>
            <div><div style={{ color: C.textMuted, fontSize: 10 }}>GST base (non-cash)</div><b>{inr2(Number(inv.total_amount) - Number(inv.cash_amount))}</b></div>
          </div>
        )}

        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 90px', padding: '6px 10px', background: C.bg, fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase' }}><div>Product · SAC</div><div style={rt}>Qty</div><div style={rt}>Taxable</div></div>
          {lines.map(l => (
            <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 90px', padding: '7px 10px', borderTop: `1px solid ${C.borderLight}`, fontSize: 12 }}>
              <div>{l.product}<div style={{ fontSize: 10, color: C.textLight }}>SAC {l.hsn} · GST {Number(l.gst_rate) > 0 && Number(l.gst_rate) < 1 ? Math.round(Number(l.gst_rate) * 100) : l.gst_rate}%</div></div>
              <div style={rt}>{l.qty}</div><div style={rt}>{inr2(l.taxable_amount)}</div>
            </div>
          ))}
          {lines.length === 0 && <div style={{ padding: 12, fontSize: 12, color: C.textLight }}>No line items snapshot.</div>}
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div><label style={lab}>Invoice #</label><input style={inp} value={f.invoice_number || ''} onChange={e => setF({ ...f, invoice_number: e.target.value })} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lab}>Customer</label><input style={inp} value={f.customer_name || ''} onChange={e => setF({ ...f, customer_name: e.target.value })} /></div>
            <div><label style={lab}>Customer GSTIN (B2B)</label><input style={inp} value={f.customer_gstin || ''} onChange={e => setF({ ...f, customer_gstin: e.target.value })} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
            <div><label style={lab}>Place of supply</label><input style={inp} value={f.place_of_supply || ''} onChange={e => setF({ ...f, place_of_supply: e.target.value })} /></div>
            <label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center', paddingBottom: 6 }}><input type="checkbox" checked={!!f.is_inter_state} onChange={e => setF({ ...f, is_inter_state: e.target.checked })} /> Inter-state</label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={lab}>Taxable</label><input type="number" style={inp} value={f.taxable_amount} onChange={e => setF({ ...f, taxable_amount: e.target.value })} /></div>
            <div><label style={lab}>Total (incl GST)</label><input type="number" style={inp} value={f.total_amount} onChange={e => setF({ ...f, total_amount: e.target.value })} /></div>
            <div><label style={lab}>CGST</label><input type="number" style={inp} value={f.cgst_amount} onChange={e => setF({ ...f, cgst_amount: e.target.value })} /></div>
            <div><label style={lab}>SGST</label><input type="number" style={inp} value={f.sgst_amount} onChange={e => setF({ ...f, sgst_amount: e.target.value })} /></div>
            <div><label style={lab}>IGST</label><input type="number" style={inp} value={f.igst_amount} onChange={e => setF({ ...f, igst_amount: e.target.value })} /></div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, background: C.text, color: '#fff', fontWeight: 700, padding: '9px', borderRadius: 8, border: 'none' }}>{saving ? 'Saving…' : 'Save edits'}</button>
          {inv.status !== 'reviewed' && <button onClick={() => setStatus(inv, 'reviewed')} style={{ padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontWeight: 700, fontSize: 13, color: '#2563eb' }}>Mark reviewed</button>}
          {inv.status !== 'filed' && <button onClick={() => setStatus(inv, 'filed')} style={{ padding: '9px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 13 }}>Mark filed 🔒</button>}
        </div>
      </div>
    </div>
  )
}

const rt = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const Kpi = ({ label, v, accent }) => (
  <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, background: '#fff' }}>
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.textMuted }}>{label}</div>
    <div style={{ fontSize: 17, fontWeight: 800, color: accent || C.text }}>{v}</div>
  </div>
)

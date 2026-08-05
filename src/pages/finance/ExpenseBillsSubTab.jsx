/* Vendor GST bills → Input Tax Credit view. Reads payment_invoices (created in
   Finance → Payments). Every GST-bearing vendor invoice is ITC-eligible on the
   invoice itself (not gated on payment). Filter by category / month / status. */
import React, { useEffect, useMemo, useState } from 'react'
import { C, fmtCurrency } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'

const inr2 = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ExpenseBillsSubTab() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [catF, setCatF] = useState('all')
  const [monthF, setMonthF] = useState('')
  const [statusF, setStatusF] = useState('all')

  const load = async () => {
    setLoading(true)
    const { data } = await supa.from('payment_invoices')
      .select('id, vendor_name, category, invoice_number, invoice_date, base_amount, gst_rate, gst_amount, net_payable, tds_amount, settled, amount_paid, balance_due, invoice_url, period_month, period_year')
      .gt('gst_amount', 0).order('invoice_date', { ascending: false })
    setRows(data || []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const monthKey = (r) => (r.period_year && r.period_month) ? `${r.period_year}-${String(r.period_month).padStart(2, '0')}` : (r.invoice_date || '').slice(0, 7)
  const statusOf = (r) => r.settled ? 'settled' : (Number(r.amount_paid) > 0 && Number(r.balance_due) > 0.5 ? 'partial' : (Number(r.balance_due) < 0.5 && Number(r.net_payable) > 0 ? 'paid' : 'unpaid'))

  const cats = useMemo(() => [...new Set(rows.map(r => r.category).filter(Boolean))], [rows])
  const months = useMemo(() => [...new Set(rows.map(monthKey).filter(Boolean))].sort().reverse(), [rows])
  const shown = useMemo(() => rows.filter(r =>
    (catF === 'all' || r.category === catF) && (monthF === '' || monthKey(r) === monthF) && (statusF === 'all' || statusOf(r) === statusF)
  ), [rows, catF, monthF, statusF])
  const totals = useMemo(() => shown.reduce((a, r) => ({ taxable: a.taxable + Number(r.base_amount || 0), gst: a.gst + Number(r.gst_amount || 0) }), { taxable: 0, gst: 0 }), [shown])

  const sel = { padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: '#fff' }
  const rt = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const STCOL = { settled: ['#16a34a', '#dcfce7'], paid: ['#16a34a', '#dcfce7'], partial: ['#d97706', '#fef3c7'], unpaid: ['#b91c1c', '#fee2e2'] }

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.textMuted }}>Loading…</div>
  return (
    <div style={{ fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.textMuted }}>Vendor GST bills → <b style={{ color: C.text }}>Input Tax Credit: {inr2(totals.gst)}</b> <span style={{ fontSize: 11 }}>({shown.length} bills)</span></div>
        <div style={{ flex: 1 }} />
        <select value={catF} onChange={e => setCatF(e.target.value)} style={sel}><option value="all">All categories</option>{cats.map(c => <option key={c}>{c}</option>)}</select>
        <select value={monthF} onChange={e => setMonthF(e.target.value)} style={sel}><option value="">All months</option>{months.map(m => <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</option>)}</select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={sel}><option value="all">All statuses</option><option value="unpaid">Unpaid</option><option value="partial">Partial</option><option value="paid">Paid</option><option value="settled">Settled</option></select>
      </div>
      <div style={{ fontSize: 11, color: C.textLight, marginBottom: 10 }}>ITC posts on the invoice (independent of payment). Add / edit vendor bills in <b>Finance → Payments</b>.</div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 100px 100px 110px 60px', padding: '8px 12px', background: C.bg, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.textMuted }}>
          <div>Date</div><div>Vendor · Category</div><div style={rt}>Taxable</div><div style={rt}>GST</div><div style={rt}>Total</div><div>Status</div><div style={rt}>Bill</div>
        </div>
        {shown.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: C.textMuted }}>No GST vendor bills. Add them in Finance → Payments (with GST + invoice).</div>}
        {shown.map(r => { const st = statusOf(r); const [fg, bg] = STCOL[st] || STCOL.unpaid; return (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 100px 100px 110px 60px', padding: '9px 12px', borderBottom: `1px solid ${C.borderLight}`, alignItems: 'center', fontSize: 12.5 }}>
            <div style={{ color: C.textMuted }}>{r.invoice_date ? new Date(r.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</div>
            <div><b>{r.vendor_name}</b> <span style={{ color: C.textLight, fontSize: 11 }}>· {r.category || '—'} · {r.gst_rate}%</span></div>
            <div style={rt}>{inr2(r.base_amount)}</div>
            <div style={{ ...rt, color: '#16a34a', fontWeight: 700 }}>{inr2(r.gst_amount)}</div>
            <div style={rt}>{inr2(Number(r.base_amount) + Number(r.gst_amount))}</div>
            <div><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: bg, color: fg, textTransform: 'capitalize' }}>{st}</span></div>
            <div style={rt}>{r.invoice_url ? <a href={r.invoice_url} target="_blank" rel="noreferrer" style={{ color: C.gold, fontWeight: 700, fontSize: 11 }}>view</a> : <span style={{ color: C.textLight }}>—</span>}</div>
          </div>
        )})}
        {shown.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px 100px 100px 110px 60px', padding: '9px 12px', background: C.bg, fontWeight: 800, fontSize: 12.5 }}>
            <div style={{ gridColumn: '1 / 3' }}>{shown.length} bills · Total ITC</div>
            <div style={rt}>{inr2(totals.taxable)}</div>
            <div style={{ ...rt, color: '#16a34a' }}>{inr2(totals.gst)}</div>
            <div /><div /><div />
          </div>
        )}
      </div>
    </div>
  )
}

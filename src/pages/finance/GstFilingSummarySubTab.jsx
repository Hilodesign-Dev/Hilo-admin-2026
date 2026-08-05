/* Summary to be Filed — plain-English monthly GST filing sheet.
   Shows exactly what to file: Retail (in-store + online assist + online) split
   by 5% / 18%, and each Marketplace split by 5% / 18%, then ITC and net payable.
   Reads a Postgres RPC (gst_filing_summary) so numbers tie to the snapshot. */
import React, { useEffect, useState } from 'react'
import { C } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const inr = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')
const inr2 = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rt = { textAlign: 'right' }
const csvDl = (rows, name) => { const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(',')).join('\n'); const b = new Blob([csv], { type: 'text/csv' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u) }

export default function GstFilingSummarySubTab() {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [year, setYear] = useState(prev.getFullYear())
  const [month, setMonth] = useState(prev.getMonth() + 1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data: d, error } = await supa.rpc('gst_filing_summary', { p_year: year, p_month: month })
    if (error) { console.error(error); setData(null) } else setData(d)
    setLoading(false)
  }
  useEffect(() => { load() }, [year, month])

  const retail = (data?.retail) || []
  const mkts = (data?.marketplaces) || []
  // group marketplaces by name
  const byMkt = {}
  mkts.forEach(m => { (byMkt[m.marketplace] = byMkt[m.marketplace] || []).push(m) })
  const retailTot = retail.reduce((a, r) => ({ taxable: a.taxable + +r.taxable, cgst: a.cgst + +r.cgst, sgst: a.sgst + +r.sgst, igst: a.igst + +r.igst, gst: a.gst + +r.gst }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0 })
  const mktTot = mkts.reduce((a, r) => ({ taxable: a.taxable + +r.taxable, cgst: a.cgst + +r.cgst, sgst: a.sgst + +r.sgst, igst: a.igst + +r.igst, gst: a.gst + +r.gst }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0 })

  const sel = { padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: '#fff' }
  const rateChip = (r) => <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: r === 5 ? '#dcfce7' : '#fef3c7', color: r === 5 ? '#16a34a' : '#b45309' }}>{r}%</span>

  const exportCsv = () => {
    const rows = [['Section','Party','Rate %','Taxable','CGST','SGST','IGST','Total GST']]
    retail.forEach(r => rows.push(['Retail (In-store + Online Assist + Online)', '', r.rate, r.taxable, r.cgst, r.sgst, r.igst, r.gst]))
    rows.push(['Retail TOTAL','','', retailTot.taxable, retailTot.cgst, retailTot.sgst, retailTot.igst, retailTot.gst])
    mkts.forEach(m => rows.push(['Marketplace', m.marketplace, m.rate, m.taxable, m.cgst, m.sgst, m.igst, m.gst]))
    rows.push(['Marketplace TOTAL','','', mktTot.taxable, mktTot.cgst, mktTot.sgst, mktTot.igst, mktTot.gst])
    rows.push([])
    rows.push(['Output GST','','','','','','', data.output_gst])
    rows.push(['Less: Input Tax Credit (ITC)','','','','','','', data.itc])
    rows.push(['NET GST PAYABLE','','','','','','', data.net_payable])
    rows.push(['(Retail cash carved out of base)','','','','','','', data.retail_cash_excluded])
    csvDl(rows, `Hilo-GST-Summary-to-File-${year}-${String(month).padStart(2,'0')}.csv`)
  }

  const HeaderRow = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 70px 1fr 1fr 1fr 1fr 1.1fr', padding: '8px 12px', background: C.bg, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.textMuted }}>
      <div>Party / Slab</div><div style={rt}>Rate</div><div style={rt}>Taxable</div><div style={rt}>CGST</div><div style={rt}>SGST</div><div style={rt}>IGST</div><div style={rt}>Total GST</div>
    </div>
  )
  const Line = ({ label, r, bold }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 70px 1fr 1fr 1fr 1fr 1.1fr', padding: '9px 12px', borderBottom: `1px solid ${C.borderLight}`, alignItems: 'center', fontSize: 12.5, fontWeight: bold ? 800 : 500, background: bold ? C.bg : '#fff' }}>
      <div>{label}</div>
      <div style={rt}>{r.rate ? rateChip(r.rate) : ''}</div>
      <div style={rt}>{inr(r.taxable)}</div><div style={rt}>{inr(r.cgst)}</div><div style={rt}>{inr(r.sgst)}</div><div style={rt}>{inr(r.igst)}</div>
      <div style={{ ...rt, fontWeight: 800 }}>{inr(r.gst)}</div>
    </div>
  )

  return (
    <div style={{ fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <select value={month} onChange={e => setMonth(+e.target.value)} style={sel}>{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select>
        <select value={year} onChange={e => setYear(+e.target.value)} style={sel}>{[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}</select>
        <button onClick={load} style={{ fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.text }}>⟳ Refresh</button>
        <div style={{ flex: 1 }} />
        <button onClick={exportCsv} disabled={!data} style={{ fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: 'none', background: C.gold, color: '#fff', opacity: data ? 1 : 0.5 }}>Download summary</button>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>Loading…</div> :
       !data || (!retail.length && !mkts.length) ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, border: `1px dashed ${C.border}`, borderRadius: 12 }}>
          No filing data for {MONTHS[month - 1]} {year}. Pull the month in <b>Monthly Invoices ⭐</b> first.
        </div>
      ) : (
        <>
          {/* Headline cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
            <Big label="Output GST (collected)" v={inr2(data.output_gst)} />
            <Big label="Input Tax Credit (ITC)" v={'− ' + inr2(data.itc)} accent="#0891b2" />
            <Big label="NET GST TO PAY" v={inr2(data.net_payable)} accent={C.gold} big />
            <Big label="Cash carved out of base" v={inr2(data.retail_cash_excluded)} accent={C.textMuted} />
          </div>

          {/* Retail */}
          <SectionTitle>Retail — In-store + Online Assist + Online (intra-state: CGST + SGST)</SectionTitle>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: '#fff', marginBottom: 20 }}>
            <HeaderRow />
            {retail.length ? retail.map(r => <Line key={r.rate} label={`Sales @ ${r.rate}%`} r={r} />) : <Empty />}
            <Line label="Retail total" r={{ ...retailTot, rate: 0 }} bold />
          </div>

          {/* Marketplaces */}
          <SectionTitle>Marketplaces (each split by slab — mostly IGST, inter-state)</SectionTitle>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: '#fff', marginBottom: 8 }}>
            <HeaderRow />
            {Object.keys(byMkt).length ? Object.keys(byMkt).sort().map(name => (
              <React.Fragment key={name}>
                <div style={{ padding: '7px 12px', background: '#faf9f5', fontSize: 11.5, fontWeight: 800, color: C.text, borderBottom: `1px solid ${C.borderLight}` }}>{name}</div>
                {byMkt[name].map(m => <Line key={name + m.rate} label={`  ${name} @ ${m.rate}%`} r={m} />)}
              </React.Fragment>
            )) : <Empty />}
            <Line label="Marketplace total" r={{ ...mktTot, rate: 0 }} bold />
          </div>

          <div style={{ fontSize: 11.5, color: C.textMuted, lineHeight: 1.6, marginTop: 12, padding: '10px 12px', background: C.bg, borderRadius: 10 }}>
            <b>How to read this:</b> File the <b>Retail</b> block as your domestic B2C supplies (in-store, online-assist and online orders) — CGST+SGST since supply is within Telangana. File each <b>Marketplace</b> under its own GSTIN split — IGST where the marketplace is out of state, CGST+SGST where it's in Telangana. Slab is decided per piece on the value billed to us: ≤₹2,500 → 5%, above → 18%. Retail cash of {inr2(data.retail_cash_excluded)} is carved out of the taxable base. Net payable = Output GST − ITC. Always confirm final figures with the CA before filing.
          </div>
        </>
      )}
    </div>
  )
}

function Big({ label, v, accent, big }) {
  return (
    <div style={{ padding: '12px 14px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 22 : 17, fontWeight: 800, color: accent || C.text }}>{v}</div>
    </div>
  )
}
function SectionTitle({ children }) { return <div style={{ fontSize: 13, fontWeight: 800, color: C.text, margin: '4px 2px 8px' }}>{children}</div> }
function Empty() { return <div style={{ padding: 16, textAlign: 'center', color: C.textLight, fontSize: 12 }}>No sales in this bucket.</div> }

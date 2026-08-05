import React from 'react'

/* FranchiseTerms — read-only summary of the agreement.
   Edit-in-place is out of scope today; you can update terms via Supabase or
   add an Edit modal later if you want field-by-field control here. */

const fmt = (n) => {
  if (n == null || n === '') return '—'
  const num = Number(n)
  if (isNaN(num)) return n
  return '₹' + num.toLocaleString('en-IN')
}
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const Row = ({ label, value, mono = false }) => (
  <div className="flex items-baseline justify-between py-2 border-b border-gray-100 last:border-0 gap-3">
    <div className="text-xs text-gray-500 flex-shrink-0">{label}</div>
    <div className={`text-sm text-gray-800 font-semibold text-right ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
  </div>
)

const Card = ({ title, children }) => (
  <div className="bg-white border border-gray-200 rounded-2xl p-5">
    <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-3">{title}</div>
    {children}
  </div>
)

export default function FranchiseTerms({ franchise: f }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card title="Franchise">
        <Row label="Code"        value={f.code} mono />
        <Row label="Format"      value={f.format} />
        <Row label="Display name" value={f.display_name} />
        <Row label="City"        value={f.city} />
        <Row label="State"       value={f.state} />
        <Row label="Status"      value={(f.status || '').replace(/_/g, ' ')} />
      </Card>

      <Card title="Partner">
        <Row label="Name"   value={f.partner_name} />
        <Row label="Phone"  value={f.partner_phone} mono />
        <Row label="Email"  value={f.partner_email} />
      </Card>

      <Card title="Agreement">
        <Row label="Signed on"     value={fmtDate(f.agreement_signed_on)} />
        <Row label="Term"          value={f.term_years ? `${f.term_years} years` : '—'} />
        <Row label="Lock-in"       value={f.lock_in_years ? `${f.lock_in_years} years` : '—'} />
        <Row label="Launch target" value={fmtDate(f.launch_target_on)} />
        <Row label="Launched on"   value={fmtDate(f.launched_on)} />
      </Card>

      <Card title="Commercials">
        <Row label="Total investment"      value={fmt(f.total_committed)} mono />
        <Row label="Revenue share"         value={`${f.revenue_share_pct}% of gross`} />
        <Row label="Minimum guarantee"     value={`${f.mg_annual_pct}% p.a. on baseline`} />
        <Row label="Monthly baseline (inv)" value={fmt(f.monthly_baseline_inv)} mono />
        <Row label="Exit fee"              value={`${f.exit_fee_pct}% of refundable SD (during lock-in)`} />
      </Card>

      {f.notes && (
        <div className="md:col-span-2 bg-amber-50/40 border border-amber-100 rounded-2xl p-4 text-xs text-gray-700">
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1">Notes</div>
          {f.notes}
        </div>
      )}
    </div>
  )
}

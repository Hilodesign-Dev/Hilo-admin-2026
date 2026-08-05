import React, { useState, useEffect, useMemo } from 'react'
import { C, toast, fmtCurrency, fmtDate } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */
const CATEGORIES = [
  { value: 'rent', label: 'Rent' },
  { value: 'software', label: 'Software' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'professional', label: 'Professional Services' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'tax_compliance', label: 'Tax & Compliance' },
  { value: 'courier', label: 'Courier & Logistics' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other' },
]

const FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
  { value: 'one_time', label: 'One-time' },
]

const TDS_SECTIONS = [
  { value: '194I', label: '194I — Rent (10%)' },
  { value: '194J', label: '194J — Professional/Technical (10%)' },
  { value: '194C', label: '194C — Contractor (1%/2%)' },
  { value: '194H', label: '194H — Commission (5%)' },
  { value: '192', label: '192 — Salary' },
  { value: 'other', label: 'Other' },
]

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const n = v => Number(v) || 0
const mono = { fontFamily: 'JetBrains Mono, monospace' }
const clampDay = (day, month, year) => Math.min(day, new Date(year, month, 0).getDate())

const inputStyle = { width: '100%', padding: '0.5rem 0.625rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, fontSize: '0.8125rem', fontFamily: 'Inter,sans-serif' }
const labelStyle = { fontSize: '0.6875rem', fontWeight: 700, color: '#4e4636', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '0.25rem' }
const catLabel = (cat) => CATEGORIES.find(c => c.value === cat)?.label || cat

/* ═══════════════════════════════════════════════════════════════════════════
   VENDOR FORM MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
const VendorFormModal = ({ vendor, onSave, onClose, accounts = [] }) => {
  const [form, setForm] = useState(() => {
    const defaults = {
      name: '', category: 'other', account_id: '', base_amount: '', frequency: 'monthly', due_day: '1',
      is_gst_vendor: false, gst_rate: '', gst_amount: '', gstin: '',
      has_tds: false, tds_section: '', tds_rate: '', tds_amount: '', pan: '',
      bank_name: '', account_no: '', ifsc: '',
      contact_person: '', phone: '', email: '', address: '',
      notes: '', pl_bucket: '',
    }
    const merged = { ...defaults, ...(vendor || {}) }
    merged.base_amount = vendor?.base_amount != null ? String(vendor.base_amount) : ''
    merged.gst_rate = vendor?.gst_rate != null ? String(vendor.gst_rate) : ''
    merged.gst_amount = vendor?.gst_amount != null ? String(vendor.gst_amount) : ''
    merged.tds_rate = vendor?.tds_rate != null ? String(vendor.tds_rate) : ''
    merged.tds_amount = vendor?.tds_amount != null ? String(vendor.tds_amount) : ''
    merged.due_day = vendor?.due_day != null ? String(vendor.due_day) : '1'
    merged.account_id = vendor?.account_id || ''
    return merged
  })
  const [saving, setSaving] = useState(false)
  const [gstAmtManual, setGstAmtManual] = useState(false)
  const [tdsAmtManual, setTdsAmtManual] = useState(false)

  const parentAccts = accounts.filter(a => !a.parent_id)
  const childAccts = (pid) => accounts.filter(a => a.parent_id === pid)

  const baseAmt = parseFloat(form.base_amount) || 0
  const gstRate = parseFloat(form.gst_rate) || 0
  const tdsRate = parseFloat(form.tds_rate) || 0
  const gstAmt = form.is_gst_vendor ? (gstAmtManual ? (parseFloat(form.gst_amount) || 0) : baseAmt * gstRate / 100) : 0
  const tdsAmt = form.has_tds ? (tdsAmtManual ? (parseFloat(form.tds_amount) || 0) : baseAmt * tdsRate / 100) : 0
  const netPayable = baseAmt + gstAmt - tdsAmt

  const handleSave = async () => {
    if (!form.name.trim()) { toast(false, 'Name is required'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(), category: form.category,
        account_id: form.account_id || null,
        base_amount: parseFloat(form.base_amount) || 0,
        frequency: form.frequency, due_day: parseInt(form.due_day) || 1,
        is_gst_vendor: form.is_gst_vendor,
        gst_rate: form.is_gst_vendor ? (parseFloat(form.gst_rate) || 0) : 0,
        gst_amount: form.is_gst_vendor ? gstAmt : 0,
        gstin: form.is_gst_vendor ? form.gstin : '',
        has_tds: form.has_tds,
        tds_section: form.has_tds ? form.tds_section : '',
        tds_rate: form.has_tds ? (parseFloat(form.tds_rate) || 0) : 0,
        tds_amount: form.has_tds ? tdsAmt : 0,
        pan: form.has_tds ? form.pan : '',
        bank_name: form.bank_name, account_no: form.account_no, ifsc: form.ifsc,
        contact_person: form.contact_person, phone: form.phone, email: form.email, address: form.address,
        notes: form.notes, pl_bucket: form.pl_bucket || form.category,
        updated_at: new Date().toISOString(),
      }
      if (vendor?.id) {
        const { error } = await supa.from('payment_vendors').update(payload).eq('id', vendor.id)
        if (error) throw error
        toast(true, 'Vendor updated')
      } else {
        const { error } = await supa.from('payment_vendors').insert(payload)
        if (error) throw error
        toast(true, 'Vendor added')
      }
      onSave()
    } catch (err) { toast(false, 'Save failed: ' + (err.message || '')) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: '1rem', padding: '1.5rem', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: C.text, marginBottom: '1rem' }}>{vendor?.id ? 'Edit Vendor' : 'Add Payment Vendor'}</h3>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="col-span-2">
            <label style={labelStyle}>Vendor Name *</label>
            <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. City Furnish, Google Workspace" />
          </div>
          <div>
            <label style={labelStyle}>Chart of Accounts</label>
            {accounts.length > 0 ? (
              <select style={inputStyle} value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
                <option value="">— Select account —</option>
                {parentAccts.map(pa => {
                  const children = childAccts(pa.id)
                  if (children.length > 0) {
                    return (
                      <optgroup key={pa.id} label={`${pa.name} (${pa.group_type})`}>
                        <option value={pa.id}>{pa.name} (parent)</option>
                        {children.map(ch => <option key={ch.id} value={ch.id}>&nbsp;&nbsp;└ {ch.name}</option>)}
                      </optgroup>
                    )
                  }
                  return <option key={pa.id} value={pa.id}>{pa.name} ({pa.group_type})</option>
                })}
              </select>
            ) : (
              <select style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            )}
          </div>
          <div>
            <label style={labelStyle}>Frequency</label>
            <select style={inputStyle} value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
              {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Base Amount (₹)</label>
            <input style={{ ...inputStyle, ...mono }} type="text" inputMode="decimal" value={form.base_amount} onChange={e => setForm({ ...form, base_amount: e.target.value })} placeholder="0" />
          </div>
          <div>
            <label style={labelStyle}>Due Day of Month</label>
            <input style={inputStyle} type="text" inputMode="numeric" value={form.due_day} onChange={e => setForm({ ...form, due_day: e.target.value })} placeholder="1" />
          </div>
        </div>

        {/* GST */}
        <div className="rounded-lg p-3 mb-3" style={{ background: form.is_gst_vendor ? 'rgba(22,163,74,0.06)' : C.bg, border: `1px solid ${form.is_gst_vendor ? 'rgba(22,163,74,0.2)' : C.border}` }}>
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input type="checkbox" checked={form.is_gst_vendor} onChange={e => setForm({ ...form, is_gst_vendor: e.target.checked })} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.text }}>GST Vendor</span>
          </label>
          {form.is_gst_vendor && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label style={labelStyle}>GST Rate %</label>
                <select style={inputStyle} value={form.gst_rate} onChange={e => { setForm({ ...form, gst_rate: e.target.value, gst_amount: '' }); setGstAmtManual(false) }}>
                  <option value="">Select</option>
                  {[5, 12, 18, 28].map(r => <option key={r} value={String(r)}>{r}%</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>GST Amount <span style={{ fontSize: '0.6rem', color: C.textMuted, fontWeight: 400, textTransform: 'none' }}>editable</span></label>
                <input style={{ ...inputStyle, ...mono, background: gstAmtManual ? 'rgba(22,163,74,0.04)' : '#fff' }} type="text" inputMode="decimal"
                  value={gstAmtManual ? form.gst_amount : (baseAmt > 0 && gstRate > 0 ? (baseAmt * gstRate / 100).toFixed(2) : '')}
                  onChange={e => { setForm({ ...form, gst_amount: e.target.value }); setGstAmtManual(true) }}
                  placeholder={baseAmt > 0 && gstRate > 0 ? (baseAmt * gstRate / 100).toFixed(2) : '0'} />
              </div>
              <div><label style={labelStyle}>GSTIN</label><input style={inputStyle} value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} placeholder="22AAAAA0000A1Z5" /></div>
            </div>
          )}
        </div>

        {/* TDS */}
        <div className="rounded-lg p-3 mb-3" style={{ background: form.has_tds ? 'rgba(217,119,6,0.06)' : C.bg, border: `1px solid ${form.has_tds ? 'rgba(217,119,6,0.2)' : C.border}` }}>
          <label className="flex items-center gap-2 cursor-pointer mb-2">
            <input type="checkbox" checked={form.has_tds} onChange={e => setForm({ ...form, has_tds: e.target.checked })} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: C.text }}>TDS Applicable</span>
          </label>
          {form.has_tds && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={labelStyle}>TDS Section</label>
                <select style={inputStyle} value={form.tds_section} onChange={e => setForm({ ...form, tds_section: e.target.value })}>
                  <option value="">Select</option>
                  {TDS_SECTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>TDS Rate %</label><input style={inputStyle} type="text" inputMode="decimal" value={form.tds_rate} onChange={e => { setForm({ ...form, tds_rate: e.target.value, tds_amount: '' }); setTdsAmtManual(false) }} placeholder="10" /></div>
              <div>
                <label style={labelStyle}>TDS Amount <span style={{ fontSize: '0.6rem', color: C.textMuted, fontWeight: 400, textTransform: 'none' }}>editable</span></label>
                <input style={{ ...inputStyle, ...mono, background: tdsAmtManual ? 'rgba(217,119,6,0.04)' : '#fff' }} type="text" inputMode="decimal"
                  value={tdsAmtManual ? form.tds_amount : (baseAmt > 0 && tdsRate > 0 ? (baseAmt * tdsRate / 100).toFixed(2) : '')}
                  onChange={e => { setForm({ ...form, tds_amount: e.target.value }); setTdsAmtManual(true) }}
                  placeholder={baseAmt > 0 && tdsRate > 0 ? (baseAmt * tdsRate / 100).toFixed(2) : '0'} />
              </div>
              <div><label style={labelStyle}>PAN</label><input style={inputStyle} value={form.pan || ''} onChange={e => setForm({ ...form, pan: e.target.value })} placeholder="ABCDE1234F" /></div>
            </div>
          )}
        </div>

        {/* Preview */}
        {baseAmt > 0 && (
          <div className="rounded-lg p-3 mb-3" style={{ background: 'rgba(201,164,50,0.06)', border: '1px solid rgba(201,164,50,0.2)' }}>
            <div style={{ ...labelStyle, marginBottom: '0.375rem' }}>Payment Preview</div>
            <div className="flex justify-between text-xs" style={{ color: C.text }}><span>Base</span><span style={mono}>{fmtCurrency(baseAmt)}</span></div>
            {gstAmt > 0 && <div className="flex justify-between text-xs" style={{ color: '#16a34a' }}><span>+ GST {gstAmtManual ? '(manual)' : `(${form.gst_rate}%)`}</span><span style={mono}>{fmtCurrency(gstAmt)}</span></div>}
            {tdsAmt > 0 && <div className="flex justify-between text-xs" style={{ color: '#d97706' }}><span>− TDS {tdsAmtManual ? '(manual)' : `(${form.tds_rate}%)`}</span><span style={mono}>−{fmtCurrency(tdsAmt)}</span></div>}
            <div className="flex justify-between text-sm font-bold mt-1 pt-1" style={{ borderTop: `1px solid ${C.border}`, color: C.text }}><span>Net Payable</span><span style={mono}>{fmtCurrency(netPayable)}</span></div>
          </div>
        )}

        {/* Bank + Contact */}
        <details className="mb-3">
          <summary style={{ fontSize: '0.75rem', fontWeight: 600, color: C.textMuted, cursor: 'pointer', marginBottom: '0.5rem' }}>Contact & Bank Details (optional)</summary>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div><label style={labelStyle}>Contact Person</label><input style={inputStyle} value={form.contact_person || ''} onChange={e => setForm({ ...form, contact_person: e.target.value })} /></div>
            <div><label style={labelStyle}>Phone</label><input style={inputStyle} value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label style={labelStyle}>Bank</label><input style={inputStyle} value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} /></div>
            <div><label style={labelStyle}>Account No</label><input style={inputStyle} value={form.account_no} onChange={e => setForm({ ...form, account_no: e.target.value })} /></div>
            <div><label style={labelStyle}>IFSC</label><input style={inputStyle} value={form.ifsc} onChange={e => setForm({ ...form, ifsc: e.target.value })} /></div>
          </div>
        </details>

        <div><label style={labelStyle}>Notes</label><input style={inputStyle} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" /></div>

        <div className="flex gap-3 justify-end mt-4">
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: C.textMuted }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', background: C.gold, color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', fontWeight: 600, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : vendor?.id ? 'Update' : 'Add Vendor'}</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   INVOICE FORM MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
const InvoiceFormModal = ({ vendors, invoice, onSave, onClose, accounts = [] }) => {
  const [form, setForm] = useState(() => {
    if (invoice) return {
      vendor_id: invoice.vendor_id || '', vendor_name: invoice.vendor_name || '',
      invoice_number: invoice.invoice_number || '', invoice_date: invoice.invoice_date || new Date().toISOString().split('T')[0],
      due_date: invoice.due_date || '', category: invoice.category || 'other',
      account_id: invoice.account_id || '',
      base_amount: String(invoice.base_amount || ''), gst_rate: String(invoice.gst_rate || ''),
      gst_amount: invoice.gst_amount != null ? String(invoice.gst_amount) : '',
      tds_rate: String(invoice.tds_rate || ''),
      tds_amount: invoice.tds_amount != null ? String(invoice.tds_amount) : '',
      notes: invoice.notes || '',
      invoice_url: invoice.invoice_url || '',
    }
    return {
      vendor_id: '', vendor_name: '', invoice_number: '', invoice_date: new Date().toISOString().split('T')[0],
      due_date: '', category: 'other', account_id: '',
      base_amount: '', gst_rate: '', gst_amount: '', tds_rate: '', tds_amount: '',
      notes: '', invoice_url: '',
    }
  })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  // Track whether user has manually overridden the amount fields
  const [gstAmtManual, setGstAmtManual] = useState(!!invoice?.gst_amount && invoice.gst_amount !== (invoice.base_amount || 0) * (invoice.gst_rate || 0) / 100)
  const [tdsAmtManual, setTdsAmtManual] = useState(!!invoice?.tds_amount && invoice.tds_amount !== (invoice.base_amount || 0) * (invoice.tds_rate || 0) / 100)

  const parentAccts = accounts.filter(a => !a.parent_id)
  const childAccts = (pid) => accounts.filter(a => a.parent_id === pid)

  const vendor = vendors.find(v => v.id === form.vendor_id)
  const baseAmt = parseFloat(form.base_amount) || 0
  const gstRate = parseFloat(form.gst_rate) || 0
  const tdsRate = parseFloat(form.tds_rate) || 0
  // If user manually set amount, use that; otherwise compute from rate
  const gstAmt = gstAmtManual ? (parseFloat(form.gst_amount) || 0) : baseAmt * gstRate / 100
  const tdsAmt = tdsAmtManual ? (parseFloat(form.tds_amount) || 0) : baseAmt * tdsRate / 100
  const netPayable = baseAmt + gstAmt - tdsAmt
  const needsInvoice = vendor?.is_gst_vendor || vendor?.has_tds

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `invoices/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supa.storage.from('documents').upload(path, file)
      if (upErr) throw upErr
      const { data: urlData } = supa.storage.from('documents').getPublicUrl(path)
      setForm(f => ({ ...f, invoice_url: urlData.publicUrl }))
      toast(true, 'Invoice uploaded')
    } catch (err) { toast(false, 'Upload failed: ' + (err.message || '')) }
    finally { setUploading(false) }
  }

  const handleVendorSelect = (vendorId) => {
    const v = vendors.find(x => x.id === vendorId)
    if (v) {
      setForm({
        ...form, vendor_id: v.id, vendor_name: v.name, category: v.category,
        account_id: v.account_id || '',
        gst_rate: v.is_gst_vendor ? String(v.gst_rate || '') : '',
        gst_amount: '', tds_amount: '',
        tds_rate: v.has_tds ? String(v.tds_rate || '') : '',
      })
      setGstAmtManual(false)
      setTdsAmtManual(false)
    } else {
      setForm({ ...form, vendor_id: '', vendor_name: '' })
    }
  }

  const handleSave = async () => {
    if (!form.vendor_id && !form.vendor_name.trim()) { toast(false, 'Select a vendor or enter a name'); return }
    if (baseAmt <= 0) { toast(false, 'Enter an amount'); return }

    // If vendor doesn't exist and name is typed, quick-create vendor
    let vendorId = form.vendor_id
    let vendorName = form.vendor_name || vendor?.name || 'Ad-hoc'
    if (!vendorId && form.vendor_name.trim()) {
      const { data: newV, error: vErr } = await supa.from('payment_vendors').insert({
        name: form.vendor_name.trim(), category: form.category, frequency: 'one_time', is_active: true,
      }).select('id').single()
      if (vErr) { toast(false, 'Failed to create vendor: ' + vErr.message); return }
      vendorId = newV.id
      vendorName = form.vendor_name.trim()
    }

    setSaving(true)
    try {
      const payload = {
        vendor_id: vendorId, vendor_name: vendorName, category: form.category,
        account_id: form.account_id || null,
        invoice_number: form.invoice_number || null,
        invoice_date: form.invoice_date || new Date().toISOString().split('T')[0],
        due_date: form.due_date || form.invoice_date || new Date().toISOString().split('T')[0],
        base_amount: baseAmt, gst_rate: gstRate, gst_amount: gstAmt,
        tds_rate: tdsRate, tds_amount: tdsAmt, net_payable: netPayable,
        amount_paid: 0, balance_due: netPayable, settled: false,
        invoice_url: form.invoice_url || null,
        source: 'manual', notes: form.notes,
      }

      if (invoice?.id) {
        const { error } = await supa.from('payment_invoices').update(payload).eq('id', invoice.id)
        if (error) throw error
        toast(true, 'Invoice updated')
      } else {
        const { error } = await supa.from('payment_invoices').insert(payload)
        if (error) throw error
        toast(true, 'Invoice added')

        // For non-GST non-TDS quick payment: also create payment record + settle immediately
        if (!needsInvoice && !form.vendor_id) {
          // Simple quick pay — handled by the Pay button after creation
        }
      }
      onSave()
    } catch (err) { toast(false, 'Failed: ' + (err.message || '')) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: '1rem', padding: '1.5rem', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: C.text, marginBottom: '1rem' }}>{invoice?.id ? 'Edit Invoice' : 'Add Invoice / Payment'}</h3>

        <div className="space-y-3">
          <div>
            <label style={labelStyle}>Vendor *</label>
            <select style={inputStyle} value={form.vendor_id} onChange={e => handleVendorSelect(e.target.value)}>
              <option value="">— Select vendor or type below —</option>
              {vendors.filter(v => v.is_active !== false).map(v => <option key={v.id} value={v.id}>{v.name} ({catLabel(v.category)})</option>)}
            </select>
          </div>
          {!form.vendor_id && (
            <div>
              <label style={labelStyle}>New Vendor Name *</label>
              <input style={inputStyle} value={form.vendor_name} onChange={e => setForm({ ...form, vendor_name: e.target.value })} placeholder="Payee name" />
            </div>
          )}
          {/* Chart of Accounts */}
          <div>
            <label style={labelStyle}>Chart of Accounts</label>
            {accounts.length > 0 ? (
              <select style={inputStyle} value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
                <option value="">— Select account —</option>
                {parentAccts.map(pa => {
                  const children = childAccts(pa.id)
                  if (children.length > 0) {
                    return (
                      <optgroup key={pa.id} label={`${pa.name} (${pa.group_type})`}>
                        <option value={pa.id}>{pa.name} (parent)</option>
                        {children.map(ch => <option key={ch.id} value={ch.id}>&nbsp;&nbsp;└ {ch.name}</option>)}
                      </optgroup>
                    )
                  }
                  return <option key={pa.id} value={pa.id}>{pa.name} ({pa.group_type})</option>
                })}
              </select>
            ) : (
              <select style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={labelStyle}>Invoice Number</label><input style={inputStyle} value={form.invoice_number} onChange={e => setForm({ ...form, invoice_number: e.target.value })} placeholder="INV-001" /></div>
            <div><label style={labelStyle}>Invoice Date</label><input style={inputStyle} type="date" value={form.invoice_date} onChange={e => setForm({ ...form, invoice_date: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={labelStyle}>Base Amount (₹) *</label><input style={{ ...inputStyle, ...mono }} type="text" inputMode="decimal" value={form.base_amount} onChange={e => { const val = e.target.value; setForm(f => ({ ...f, base_amount: val, ...(!gstAmtManual ? { gst_amount: '' } : {}), ...(!tdsAmtManual ? { tds_amount: '' } : {}) })) }} /></div>
            <div><label style={labelStyle}>Due Date</label><input style={inputStyle} type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
          </div>
          {/* GST: rate + editable amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>GST %</label>
              <input style={inputStyle} type="text" inputMode="decimal" value={form.gst_rate} onChange={e => { setForm({ ...form, gst_rate: e.target.value, gst_amount: '' }); setGstAmtManual(false) }} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>GST Amount (₹) <span style={{ fontSize: '0.6rem', color: C.textMuted, fontWeight: 400, textTransform: 'none' }}>editable</span></label>
              <input style={{ ...inputStyle, ...mono, background: gstAmtManual ? 'rgba(22,163,74,0.04)' : '#fff' }} type="text" inputMode="decimal"
                value={gstAmtManual ? form.gst_amount : (baseAmt > 0 && gstRate > 0 ? (baseAmt * gstRate / 100).toFixed(2) : '')}
                onChange={e => { setForm({ ...form, gst_amount: e.target.value }); setGstAmtManual(true) }}
                placeholder={baseAmt > 0 && gstRate > 0 ? (baseAmt * gstRate / 100).toFixed(2) : '0'} />
            </div>
          </div>
          {/* TDS: rate + editable amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>TDS %</label>
              <input style={inputStyle} type="text" inputMode="decimal" value={form.tds_rate} onChange={e => { setForm({ ...form, tds_rate: e.target.value, tds_amount: '' }); setTdsAmtManual(false) }} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>TDS Amount (₹) <span style={{ fontSize: '0.6rem', color: C.textMuted, fontWeight: 400, textTransform: 'none' }}>editable</span></label>
              <input style={{ ...inputStyle, ...mono, background: tdsAmtManual ? 'rgba(217,119,6,0.04)' : '#fff' }} type="text" inputMode="decimal"
                value={tdsAmtManual ? form.tds_amount : (baseAmt > 0 && tdsRate > 0 ? (baseAmt * tdsRate / 100).toFixed(2) : '')}
                onChange={e => { setForm({ ...form, tds_amount: e.target.value }); setTdsAmtManual(true) }}
                placeholder={baseAmt > 0 && tdsRate > 0 ? (baseAmt * tdsRate / 100).toFixed(2) : '0'} />
            </div>
          </div>
          {baseAmt > 0 && (
            <div className="rounded-lg p-2 text-xs" style={{ background: C.bg, ...mono }}>
              <div className="flex justify-between"><span>Base</span><span>{fmtCurrency(baseAmt)}</span></div>
              {gstAmt > 0 && <div className="flex justify-between" style={{ color: '#16a34a' }}><span>+ GST {gstAmtManual ? '(manual)' : `${gstRate}%`}</span><span>{fmtCurrency(gstAmt)}</span></div>}
              {tdsAmt > 0 && <div className="flex justify-between" style={{ color: '#d97706' }}><span>− TDS {tdsAmtManual ? '(manual)' : `${tdsRate}%`}</span><span>−{fmtCurrency(tdsAmt)}</span></div>}
              <div className="flex justify-between font-bold pt-1 mt-1" style={{ borderTop: `1px solid ${C.border}` }}><span>Net Payable</span><span>{fmtCurrency(netPayable)}</span></div>
            </div>
          )}
          <div><label style={labelStyle}>Notes</label><input style={inputStyle} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></div>
          <div>
            <label style={labelStyle}>Invoice File</label>
            {form.invoice_url ? (
              <div className="flex items-center gap-2">
                <a href={form.invoice_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8125rem', color: '#2563eb', textDecoration: 'underline' }}>View uploaded invoice</a>
                <button onClick={() => setForm({ ...form, invoice_url: '' })} style={{ fontSize: '0.6875rem', color: C.red, background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileUpload} disabled={uploading}
                  style={{ fontSize: '0.8125rem', color: C.text }} />
                {uploading && <span style={{ fontSize: '0.75rem', color: C.textMuted }}>Uploading...</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-4">
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: C.textMuted }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || uploading} style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', background: C.gold, color: '#fff', border: 'none', cursor: (saving || uploading) ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', fontWeight: 600, opacity: (saving || uploading) ? 0.6 : 1 }}>{saving ? 'Saving...' : invoice?.id ? 'Update' : 'Add Invoice'}</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAY INVOICE MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
const PayInvoiceModal = ({ invoice, onSave, onClose }) => {
  const [form, setForm] = useState({
    amount: String(invoice.balance_due || invoice.net_payable || 0),
    date: new Date().toISOString().split('T')[0],
    method: 'bank_transfer',
    reference: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [invoiceFile, setInvoiceFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [existingUrl, setExistingUrl] = useState(invoice.invoice_url || '')

  const payAmt = parseFloat(form.amount) || 0

  const uploadInvoice = async () => {
    if (!invoiceFile) return existingUrl || null
    setUploading(true)
    try {
      const ext = invoiceFile.name.split('.').pop() || 'pdf'
      const path = `invoices/${invoice.vendor_id || 'unknown'}/${invoice.id}.${ext}`
      const { error: upErr } = await supa.storage.from('documents').upload(path, invoiceFile, { upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supa.storage.from('documents').getPublicUrl(path)
      return urlData?.publicUrl || null
    } catch (err) {
      console.error('Invoice upload error:', err)
      toast(false, 'Invoice upload failed')
      return existingUrl || null
    } finally {
      setUploading(false)
    }
  }

  const handlePay = async () => {
    if (payAmt <= 0) { toast(false, 'Enter a payment amount'); return }
    setSaving(true)
    try {
      // Upload invoice file if selected
      const invoiceUrl = await uploadInvoice()

      // Generate payment ID
      const payId = `PAY-${(invoice.vendor_id || '').slice(0, 8)}-${Date.now().toString(36)}`

      // Create payment record
      const { error: payErr } = await supa.from('payment_payments').insert({
        id: payId, vendor_id: invoice.vendor_id, vendor_name: invoice.vendor_name,
        date: form.date, amount: payAmt, method: form.method, reference: form.reference,
        cutoff_date: form.date,
        settled_entries: [{ invoice_id: invoice.id, amount_settled: payAmt }],
        notes: form.notes,
      })
      if (payErr) throw payErr

      // Update invoice: add to amount_paid, reduce balance_due, attach invoice URL
      const newPaid = n(invoice.amount_paid) + payAmt
      const newBalance = Math.max(0, n(invoice.net_payable) - newPaid)
      const isFullyPaid = newBalance < 1

      const updateData = { amount_paid: newPaid, balance_due: newBalance }
      if (invoiceUrl) updateData.invoice_url = invoiceUrl

      const { error: invErr } = await supa.from('payment_invoices').update(updateData).eq('id', invoice.id)
      if (invErr) throw invErr

      toast(true, isFullyPaid ? `${invoice.vendor_name} fully paid` : `${fmtCurrency(payAmt)} paid — ${fmtCurrency(newBalance)} remaining`)
      onSave()
    } catch (err) { toast(false, 'Payment failed: ' + (err.message || '')) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <div style={{ background: '#fff', borderRadius: '1rem', padding: '1.5rem', width: '100%', maxWidth: '420px' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: C.text, marginBottom: '0.5rem' }}>Pay Invoice</h3>
        <div className="text-xs mb-3" style={{ color: C.textMuted }}>
          {invoice.vendor_name} — {invoice.invoice_number || 'Invoice'} — Due: {fmtCurrency(invoice.balance_due || invoice.net_payable)}
        </div>

        <div className="space-y-3">
          <div><label style={labelStyle}>Amount (₹)</label><input style={{ ...inputStyle, ...mono }} type="text" inputMode="decimal" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label style={labelStyle}>Date</label><input style={inputStyle} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div>
              <label style={labelStyle}>Method</label>
              <select style={inputStyle} value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
                {['bank_transfer', 'upi', 'cash', 'cheque'].map(m => <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
          </div>
          <div><label style={labelStyle}>UTR / Reference</label><input style={inputStyle} value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Optional" /></div>

          {/* Invoice Upload */}
          <div>
            <label style={labelStyle}>Upload Invoice</label>
            <div
              className="relative rounded-lg p-3 text-center cursor-pointer transition-all"
              style={{ border: `1.5px dashed ${invoiceFile ? '#16a34a' : C.border}`, background: invoiceFile ? 'rgba(22,163,74,0.04)' : C.bg }}
              onClick={() => document.getElementById('invoice-file-input').click()}
            >
              <input
                id="invoice-file-input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.[0]) setInvoiceFile(e.target.files[0]) }}
              />
              {invoiceFile ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold truncate" style={{ color: '#16a34a' }}>{invoiceFile.name}</span>
                  <button
                    onClick={e => { e.stopPropagation(); setInvoiceFile(null) }}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ color: '#dc2626', background: 'rgba(220,38,38,0.08)' }}
                  >Remove</button>
                </div>
              ) : existingUrl ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs" style={{ color: '#16a34a' }}>Invoice already uploaded</span>
                  <a href={existingUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-xs font-bold" style={{ color: '#3b82f6' }}>View</a>
                </div>
              ) : (
                <div>
                  <div className="text-xs font-bold" style={{ color: C.textMuted }}>Click to upload invoice</div>
                  <div className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>PDF, JPG, PNG</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {payAmt > 0 && payAmt < n(invoice.balance_due) && (
          <div className="mt-2 p-2 rounded-lg text-xs" style={{ background: 'rgba(217,119,6,0.08)', color: '#d97706' }}>
            Partial payment — {fmtCurrency(n(invoice.balance_due) - payAmt)} will remain outstanding
          </div>
        )}

        <div className="flex gap-3 justify-end mt-4">
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: C.textMuted }}>Cancel</button>
          <button onClick={handlePay} disabled={saving || uploading} style={{ padding: '0.5rem 1.25rem', borderRadius: '0.5rem', background: '#16a34a', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', fontWeight: 600, opacity: saving || uploading ? 0.6 : 1 }}>{saving ? 'Paying...' : uploading ? 'Uploading...' : `Pay ${fmtCurrency(payAmt)}`}</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
const PaymentsTab = ({ user }) => {
  const now = new Date()
  const [view, setView] = useState('upcoming') // 'upcoming' | 'payments' | 'recurring' | 'vendors'
  const [vendors, setVendors] = useState([])
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [vendorModal, setVendorModal] = useState(null)
  const [invoiceModal, setInvoiceModal] = useState(null) // null | {} | invoice obj
  const [payModal, setPayModal] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [vendorDetail, setVendorDetail] = useState(null) // vendor obj for detail/history view

  useEffect(() => { fetchVendors(); fetchAccounts() }, [])
  useEffect(() => { fetchInvoices(); fetchPayments() }, [])

  const fetchVendors = async () => {
    const { data } = await supa.from('payment_vendors').select('*').order('name')
    setVendors(data || [])
  }

  const fetchAccounts = async () => {
    try {
      const { data } = await supa.from('expense_accounts').select('*').eq('is_active', true).order('sort_order')
      setAccounts(data || [])
    } catch (_) {}
  }

  const fetchInvoices = async () => {
    setLoading(true)
    const { data } = await supa.from('payment_invoices').select('*').order('due_date', { ascending: true })
    setInvoices(data || [])
    setLoading(false)
  }

  const fetchPayments = async () => {
    const { data } = await supa.from('payment_payments').select('*').order('date', { ascending: false }).limit(200)
    setPayments(data || [])
  }

  const fetchAll = async () => { await Promise.all([fetchVendors(), fetchInvoices(), fetchPayments()]) }

  // ── FIFO Recalculation ──────────────────────────────────────────────
  const recalcFIFO = async (vendorId) => {
    const [{ data: allInvoices }, { data: allPayments }] = await Promise.all([
      supa.from('payment_invoices').select('*').eq('vendor_id', vendorId).order('due_date', { ascending: true }),
      supa.from('payment_payments').select('*').eq('vendor_id', vendorId).eq('is_tds_payment', false).order('date', { ascending: true }),
    ])
    if (!allInvoices || !allPayments) return

    const invMap = {}
    for (const inv of allInvoices) {
      invMap[inv.id] = { ...inv, amount_paid: 0, balance_due: n(inv.net_payable), settled: n(inv.net_payable) <= 0 }
    }

    for (const pay of allPayments) {
      const cutoff = pay.cutoff_date || pay.date
      const eligible = allInvoices.filter(i => n(i.net_payable) > 0 && (i.due_date || i.invoice_date) <= cutoff)
      let remaining = n(pay.amount)
      const allocations = []
      for (const inv of eligible) {
        if (remaining <= 0) break
        const im = invMap[inv.id]
        const unpaid = Math.max(0, im.balance_due)
        if (unpaid <= 0) continue
        const settle = Math.min(remaining, unpaid)
        allocations.push({ invoice_id: inv.id, amount_settled: settle })
        im.amount_paid += settle
        im.balance_due = Math.max(0, n(inv.net_payable) - im.amount_paid)
        remaining -= settle
      }
      const { error: ppErr } = await supa.from('payment_payments').update({ settled_entries: allocations }).eq('id', pay.id)
      if (ppErr) console.error('Failed to update payment_payments:', ppErr)
    }

    for (const inv of allInvoices) {
      const im = invMap[inv.id]
      if (im.amount_paid !== n(inv.amount_paid) || im.settled !== inv.settled) {
        const { error: piErr } = await supa.from('payment_invoices').update({
          amount_paid: im.amount_paid, balance_due: im.balance_due, settled: im.settled,
        }).eq('id', inv.id)
        if (piErr) console.error('Failed to update payment_invoices:', piErr)
      }
    }
  }

  // ── Generate recurring invoices ────────────────────────────────────
  const [genMonth, setGenMonth] = useState(now.getMonth() + 1)
  const [genYear, setGenYear] = useState(now.getFullYear())

  const generateRecurring = async () => {
    const activeRecurring = vendors.filter(v => v.is_active && v.frequency !== 'one_time')
    if (activeRecurring.length === 0) { toast(false, 'No recurring vendors configured'); return }

    // Check existing for this month
    const existingKeys = new Set(invoices.filter(i => i.period_month === genMonth && i.period_year === genYear && i.vendor_id)
      .map(i => i.vendor_id))

    const eligible = activeRecurring.filter(v => {
      if (existingKeys.has(v.id)) return false
      if (v.frequency === 'monthly') return true
      if (v.frequency === 'quarterly') return [1, 4, 7, 10].includes(genMonth)
      if (v.frequency === 'annual') return genMonth === 3
      return false
    })

    if (eligible.length === 0) { toast(true, 'All recurring invoices already generated for this month'); return }
    if (!window.confirm(`Generate ${eligible.length} invoices for ${MONTHS[genMonth - 1]} ${genYear}?\n\n${eligible.map(v => `• ${v.name} — ${fmtCurrency(v.base_amount)}`).join('\n')}`)) return

    setGenerating(true)
    try {
      const rows = eligible.map(v => {
        const baseAmt = v.base_amount || 0
        const gstAmt = v.is_gst_vendor ? baseAmt * (v.gst_rate || 0) / 100 : 0
        const tdsAmt = v.has_tds ? baseAmt * (v.tds_rate || 0) / 100 : 0
        const netPayable = baseAmt + gstAmt - tdsAmt
        const dueDay = clampDay(v.due_day || 1, genMonth, genYear)
        return {
          vendor_id: v.id, vendor_name: v.name, category: v.category,
          account_id: v.account_id || null,
          invoice_number: `REC-${v.name.slice(0, 3).toUpperCase()}-${MONTHS_SHORT[genMonth - 1]}${genYear}`,
          invoice_date: `${genYear}-${String(genMonth).padStart(2, '0')}-01`,
          due_date: `${genYear}-${String(genMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`,
          base_amount: baseAmt, gst_rate: v.is_gst_vendor ? v.gst_rate : 0, gst_amount: gstAmt,
          tds_rate: v.has_tds ? v.tds_rate : 0, tds_amount: tdsAmt, net_payable: netPayable,
          amount_paid: 0, balance_due: netPayable, settled: false,
          period_month: genMonth, period_year: genYear, source: 'recurring',
        }
      })
      const { error } = await supa.from('payment_invoices').insert(rows)
      if (error) throw error
      toast(true, `Generated ${rows.length} invoices`)
      fetchInvoices()
    } catch (err) { toast(false, 'Generation failed: ' + (err.message || '')) }
    finally { setGenerating(false) }
  }

  // ── Mark invoice paid (quick) ─────────────────────────────────────
  const handleQuickPay = (invoice) => setPayModal(invoice)

  // ── Delete invoice ────────────────────────────────────────────────
  const handleDeleteInvoice = async (inv) => {
    if (!window.confirm(`Delete invoice ${inv.invoice_number || ''} for ${inv.vendor_name}?`)) return
    try {
      await supa.from('payment_invoices').delete().eq('id', inv.id)
      toast(true, 'Invoice deleted')
      if (inv.vendor_id) await recalcFIFO(inv.vendor_id)
      fetchInvoices()
    } catch (err) { toast(false, 'Failed: ' + (err.message || '')) }
  }

  // ── Delete vendor ─────────────────────────────────────────────────
  const handleDeleteVendor = async (vendor) => {
    if (!window.confirm(`Delete vendor "${vendor.name}"?`)) return
    try {
      const { error } = await supa.from('payment_vendors').delete().eq('id', vendor.id)
      if (error) { toast(false, 'Failed to delete: ' + (error.message || '')); return }
      toast(true, 'Vendor deleted')
      fetchVendors()
    } catch (err) { toast(false, 'Failed: ' + (err.message || '')) }
  }

  // ── Toggle vendor active ──────────────────────────────────────────
  const toggleVendorActive = async (vendor) => {
    const { error } = await supa.from('payment_vendors').update({ is_active: !vendor.is_active }).eq('id', vendor.id)
    if (error) { toast(false, 'Failed to toggle vendor: ' + (error.message || '')); return }
    fetchVendors()
  }

  // ── Summary ───────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const unsettled = invoices.filter(i => !i.settled)
    const totalOutstanding = unsettled.reduce((s, i) => s + n(i.balance_due), 0)
    const overdue = unsettled.filter(i => n(i.balance_due) > 0 && i.due_date && new Date(i.due_date) < new Date(now.toISOString().split('T')[0]))
    const overdueAmt = overdue.reduce((s, i) => s + n(i.balance_due), 0)
    const dueThisWeek = unsettled.filter(i => {
      if (!i.due_date || n(i.balance_due) <= 0) return false
      const d = new Date(i.due_date), t = new Date()
      const diff = (d - t) / (1000 * 60 * 60 * 24)
      return diff >= 0 && diff <= 7
    })
    const weekAmt = dueThisWeek.reduce((s, i) => s + n(i.balance_due), 0)
    const settledCount = invoices.filter(i => i.settled).length
    const paidCount = invoices.filter(i => !i.settled && n(i.balance_due) < 1 && n(i.net_payable) > 0).length
    return { totalOutstanding, overdueAmt, overdueCount: overdue.length, weekAmt, weekCount: dueThisWeek.length, settledCount, paidCount, totalCount: invoices.length }
  }, [invoices])

  // ── Filtered invoices ─────────────────────────────────────────────
  const monthOpts = useMemo(() => {
    const set = new Set()
    invoices.forEach(i => { const mk = (i.period_year && i.period_month) ? `${i.period_year}-${String(i.period_month).padStart(2, '0')}` : (i.invoice_date || '').slice(0, 7); if (mk) set.add(mk) })
    return [...set].sort().reverse()
  }, [invoices])
  const filteredInvoices = useMemo(() => {
    let list = [...invoices]
    if (filterStatus === 'unpaid') list = list.filter(i => !i.settled && n(i.amount_paid) === 0)
    else if (filterStatus === 'partial') list = list.filter(i => !i.settled && n(i.amount_paid) > 0 && n(i.balance_due) > 0)
    else if (filterStatus === 'paid') list = list.filter(i => !i.settled && n(i.balance_due) < 1 && n(i.net_payable) > 0)
    else if (filterStatus === 'settled') list = list.filter(i => i.settled)
    if (filterVendor) list = list.filter(i => i.vendor_id === filterVendor)
    if (filterMonth) list = list.filter(i => { const mk = (i.period_year && i.period_month) ? `${i.period_year}-${String(i.period_month).padStart(2, '0')}` : (i.invoice_date || '').slice(0, 7); return mk === filterMonth })
    return list
  }, [invoices, filterStatus, filterVendor, filterMonth])

  // ── Upcoming invoices (unsettled, sorted by due date) ─────────────
  const upcomingInvoices = useMemo(() => {
    return invoices.filter(i => !i.settled && n(i.balance_due) > 0).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
  }, [invoices])

  // ── Recurring vendors ─────────────────────────────────────────────
  const recurringVendors = useMemo(() => vendors.filter(v => v.frequency !== 'one_time'), [vendors])

  const todayStr = now.toISOString().split('T')[0]

  const SUB_TABS = [
    { key: 'upcoming', label: `Upcoming${summary.overdueCount > 0 ? ` (${summary.overdueCount})` : ''}` },
    { key: 'payments', label: 'Payments' },
    { key: 'recurring', label: 'Recurring' },
    { key: 'vendors', label: 'Vendors' },
  ]

  const selStyle = { padding: '0.5rem 0.625rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, fontSize: '0.8125rem', fontFamily: 'Inter,sans-serif', background: C.bg }

  return (
    <div className="space-y-5" style={{ fontFamily: 'Manrope, sans-serif' }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: C.text }}>Payments</h2>
        <div className="flex gap-1.5 flex-wrap">
          {SUB_TABS.map(t => (
            <button key={t.key} onClick={() => setView(t.key)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: view === t.key ? C.gold + '18' : C.bg, color: view === t.key ? '#795900' : C.textMuted, border: `1px solid ${view === t.key ? C.gold + '4D' : C.border}` }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════ VENDORS VIEW ═══════════════ */}
      {view === 'vendors' && !vendorDetail && (
        <>
          <div className="flex justify-between items-center">
            <div style={{ fontSize: '0.8125rem', color: C.textMuted }}>{vendors.length} vendor{vendors.length !== 1 ? 's' : ''}</div>
            <button onClick={() => setVendorModal({})}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: C.gold, color: '#fff', border: 'none', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
              + Add Vendor
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {vendors.map(v => {
              const vendorInvoices = invoices.filter(i => i.vendor_id === v.id && !i.settled)
              const outstanding = vendorInvoices.reduce((s, i) => s + n(i.balance_due), 0)
              return (
                <div key={v.id} className="rounded-2xl p-4" style={{ background: C.cardBg, border: `1px solid ${C.border}`, opacity: v.is_active ? 1 : 0.5, cursor: 'pointer' }}
                  onClick={() => setVendorDetail(v)}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: C.text }}>{v.name}</div>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: C.bg, color: C.textMuted }}>{catLabel(v.category)}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: C.bg, color: C.textMuted }}>{FREQUENCIES.find(f => f.value === v.frequency)?.label}</span>
                        {v.is_gst_vendor && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>GST {v.gst_rate}%</span>}
                        {v.has_tds && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(217,119,6,0.1)', color: '#d97706' }}>TDS {v.tds_section} {v.tds_rate}%</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div style={{ ...mono, fontSize: '1rem', fontWeight: 700, color: C.gold }}>{fmtCurrency(v.base_amount)}</div>
                      {outstanding > 0 && <div className="text-[10px] font-bold" style={{ color: C.red }}>Outstanding: {fmtCurrency(outstanding)}</div>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                    <div className="text-[10px]" style={{ color: C.textMuted }}>
                      Due: {v.due_day}{v.due_day === 1 ? 'st' : v.due_day === 2 ? 'nd' : v.due_day === 3 ? 'rd' : 'th'} of month
                      {v.contact_person && ` · ${v.contact_person}`}
                    </div>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setVendorModal(v)} className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: 'none', cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => toggleVendorActive(v)} className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: C.bg, color: C.textMuted, border: 'none', cursor: 'pointer' }}>{v.is_active ? 'Pause' : 'Activate'}</button>
                      <button onClick={() => handleDeleteVendor(v)} className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: 'none', cursor: 'pointer' }}>Del</button>
                    </div>
                  </div>
                </div>
              )
            })}
            {vendors.length === 0 && (
              <div className="col-span-2 text-center py-12" style={{ color: C.textMuted }}>
                No vendors configured. Add payment vendors like Rent, Software, Marketing agencies, etc.
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════ VENDOR DETAIL / HISTORY ═══════════════ */}
      {view === 'vendors' && vendorDetail && (() => {
        const vd = vendorDetail
        const vInvoices = invoices.filter(i => i.vendor_id === vd.id).sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''))
        const vPayments = payments.filter(p => p.vendor_id === vd.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        const totalInvoiced = vInvoices.reduce((s, i) => s + n(i.net_payable), 0)
        const totalPaid = vInvoices.reduce((s, i) => s + n(i.amount_paid), 0)
        const totalOutstanding = vInvoices.filter(i => !i.settled).reduce((s, i) => s + n(i.balance_due), 0)
        return (
          <>
            {/* Back + Header */}
            <div className="flex items-center gap-3 mb-1">
              <button onClick={() => setVendorDetail(null)} style={{ padding: '0.375rem 0.625rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: C.textMuted }}>
                ← Back
              </button>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: C.text, margin: 0 }}>{vd.name}</h3>
                <div className="flex gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: C.bg, color: C.textMuted }}>{catLabel(vd.category)}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: C.bg, color: C.textMuted }}>{FREQUENCIES.find(f => f.value === vd.frequency)?.label}</span>
                  {vd.is_gst_vendor && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a' }}>GST {vd.gst_rate}%</span>}
                  {vd.has_tds && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(217,119,6,0.1)', color: '#d97706' }}>TDS {vd.tds_section} {vd.tds_rate}%</span>}
                </div>
              </div>
              <div style={{ marginLeft: 'auto' }} className="flex gap-2">
                <button onClick={() => setInvoiceModal({ vendor_id: vd.id, vendor_name: vd.name, category: vd.category, account_id: vd.account_id || '', gst_rate: vd.is_gst_vendor ? String(vd.gst_rate || '') : '', tds_rate: vd.has_tds ? String(vd.tds_rate || '') : '' })}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: C.gold, color: '#fff', border: 'none', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
                  + Add Invoice
                </button>
                <button onClick={() => setVendorModal(vd)} style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: C.textMuted }}>
                  Edit Vendor
                </button>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total Invoiced', val: fmtCurrency(totalInvoiced), color: C.text },
                { label: 'Total Paid', val: fmtCurrency(totalPaid), color: '#16a34a' },
                { label: 'Outstanding', val: fmtCurrency(totalOutstanding), color: totalOutstanding > 0 ? '#dc2626' : '#16a34a' },
              ].map(card => (
                <div key={card.label} className="rounded-2xl p-3" style={{ background: C.cardBg, borderLeft: `4px solid ${card.color}` }}>
                  <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.25rem' }}>{card.label}</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: card.color, ...mono }}>{card.val}</div>
                </div>
              ))}
            </div>

            {/* Invoices Table */}
            <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: C.text }}>Invoices ({vInvoices.length})</span>
              </div>
              {vInvoices.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: C.textMuted, fontSize: '0.8125rem' }}>No invoices yet for this vendor.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {['Invoice #', 'Date', 'Due', 'Base', 'GST', 'TDS', 'Net Payable', 'Paid', 'Balance', 'Status', 'Invoice', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '0.5rem 0.375rem', textAlign: h === 'Actions' || h === 'Invoice' ? 'center' : 'left', fontSize: '0.625rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vInvoices.map(inv => {
                        const isSettled = inv.settled === true
                        const isPaid = !isSettled && n(inv.balance_due) < 1 && n(inv.net_payable) > 0
                        const isPartial = !isSettled && !isPaid && n(inv.amount_paid) > 0
                        const isOverdue = !isSettled && !isPaid && inv.due_date && inv.due_date < todayStr
                        return (
                          <tr key={inv.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: isSettled ? 0.55 : isPaid ? 0.75 : 1, background: isOverdue ? 'rgba(220,38,38,0.03)' : 'transparent' }}>
                            <td style={{ padding: '0.5rem 0.375rem', fontWeight: 600, color: C.text }}>{inv.invoice_number || '—'}</td>
                            <td style={{ padding: '0.5rem 0.375rem', fontSize: '0.75rem' }}>{fmtDate(inv.invoice_date)}</td>
                            <td style={{ padding: '0.5rem 0.375rem', fontSize: '0.75rem', color: isOverdue ? '#dc2626' : C.textMuted }}>{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                            <td style={{ padding: '0.5rem 0.375rem', ...mono }}>{fmtCurrency(inv.base_amount)}</td>
                            <td style={{ padding: '0.5rem 0.375rem', ...mono, color: n(inv.gst_amount) > 0 ? '#16a34a' : C.textMuted }}>{n(inv.gst_amount) > 0 ? fmtCurrency(inv.gst_amount) : '—'}</td>
                            <td style={{ padding: '0.5rem 0.375rem', ...mono, color: n(inv.tds_amount) > 0 ? '#d97706' : C.textMuted }}>{n(inv.tds_amount) > 0 ? fmtCurrency(inv.tds_amount) : '—'}</td>
                            <td style={{ padding: '0.5rem 0.375rem', ...mono, fontWeight: 700 }}>{fmtCurrency(inv.net_payable)}</td>
                            <td style={{ padding: '0.5rem 0.375rem', ...mono, color: n(inv.amount_paid) > 0 ? '#16a34a' : C.textMuted }}>{n(inv.amount_paid) > 0 ? fmtCurrency(inv.amount_paid) : '—'}</td>
                            <td style={{ padding: '0.5rem 0.375rem', ...mono, fontWeight: 700, color: n(inv.balance_due) > 0 ? '#dc2626' : '#16a34a' }}>{fmtCurrency(inv.balance_due)}</td>
                            <td style={{ padding: '0.5rem 0.375rem', textAlign: 'center' }}>
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{
                                background: isSettled ? 'rgba(22,163,74,0.1)' : isPaid ? 'rgba(59,130,246,0.1)' : isPartial ? 'rgba(217,119,6,0.1)' : isOverdue ? 'rgba(220,38,38,0.1)' : 'rgba(201,164,50,0.1)',
                                color: isSettled ? '#16a34a' : isPaid ? '#3b82f6' : isPartial ? '#d97706' : isOverdue ? '#dc2626' : '#795900',
                              }}>{isSettled ? 'SETTLED' : isPaid ? 'PAID' : isPartial ? 'PARTIAL' : isOverdue ? 'OVERDUE' : 'UNPAID'}</span>
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', textAlign: 'center' }}>
                              {inv.invoice_url ? (
                                <a href={inv.invoice_url} target="_blank" rel="noreferrer" className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', textDecoration: 'none' }}>View</a>
                              ) : (
                                <span className="text-[10px]" style={{ color: C.textMuted }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '0.5rem 0.375rem', textAlign: 'center' }}>
                              <div className="flex gap-1 justify-center">
                                {!isSettled && <button onClick={() => handleQuickPay(inv)} className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', border: 'none', cursor: 'pointer' }}>Pay</button>}
                                <button onClick={() => setInvoiceModal(inv)} className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: 'none', cursor: 'pointer' }}>Edit</button>
                                <button onClick={() => handleDeleteInvoice(inv)} className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: 'none', cursor: 'pointer' }}>Del</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Payments History */}
            {vPayments.length > 0 && (
              <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: C.text }}>Payment History ({vPayments.length})</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {['Date', 'Amount', 'Method', 'Reference', 'Notes', 'Invoices Settled'].map(h => (
                          <th key={h} style={{ padding: '0.5rem 0.375rem', textAlign: 'left', fontSize: '0.625rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vPayments.map(pay => (
                        <tr key={pay.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: '0.5rem 0.375rem', fontWeight: 600 }}>{fmtDate(pay.date)}</td>
                          <td style={{ padding: '0.5rem 0.375rem', ...mono, fontWeight: 700, color: '#16a34a' }}>{fmtCurrency(pay.amount)}</td>
                          <td style={{ padding: '0.5rem 0.375rem', fontSize: '0.75rem' }}>{(pay.method || '').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
                          <td style={{ padding: '0.5rem 0.375rem', fontSize: '0.75rem', color: C.textMuted }}>{pay.reference || '—'}</td>
                          <td style={{ padding: '0.5rem 0.375rem', fontSize: '0.75rem', color: C.textMuted, maxWidth: '160px' }}>{pay.notes || '—'}</td>
                          <td style={{ padding: '0.5rem 0.375rem', fontSize: '0.75rem', color: C.textMuted }}>
                            {(pay.settled_entries || []).length > 0
                              ? (pay.settled_entries || []).map((se, i) => {
                                  const inv = vInvoices.find(x => x.id === se.invoice_id)
                                  return <span key={i}>{inv?.invoice_number || 'INV'}: {fmtCurrency(se.amount_settled)}{i < (pay.settled_entries || []).length - 1 ? ', ' : ''}</span>
                                })
                              : '—'
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )
      })()}

      {/* ═══════════════ PAYMENTS LEDGER VIEW ═══════════════ */}
      {view === 'payments' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Outstanding', val: fmtCurrency(summary.totalOutstanding), color: C.gold },
              { label: 'Overdue', val: `${fmtCurrency(summary.overdueAmt)} (${summary.overdueCount})`, color: C.red },
              { label: 'Due This Week', val: `${fmtCurrency(summary.weekAmt)} (${summary.weekCount})`, color: '#d97706' },
              { label: 'Paid', val: `${summary.paidCount}`, color: '#3b82f6' },
              { label: 'Settled', val: `${summary.settledCount} of ${summary.totalCount}`, color: '#16a34a' },
            ].map(card => (
              <div key={card.label} className="rounded-2xl p-3" style={{ background: C.cardBg, borderLeft: `4px solid ${card.color}` }}>
                <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.25rem' }}>{card.label}</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: card.color, ...mono }}>{card.val}</div>
              </div>
            ))}
          </div>

          {/* Filters + Actions */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label style={{ fontSize: '0.6875rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>Month</label>
              <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={selStyle}>
                <option value="">All Months</option>
                {monthOpts.map(mk => <option key={mk} value={mk}>{new Date(mk + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.6875rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
                <option value="">All</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="settled">Settled</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.6875rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>Vendor</label>
              <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)} style={selStyle}>
                <option value="">All Vendors</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <button onClick={() => setInvoiceModal({})}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', background: C.gold, color: '#fff', border: 'none', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
              + Add Invoice
            </button>
          </div>

          {/* Invoices Table */}
          <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            {loading ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: C.textMuted }}>Loading...</div>
            ) : filteredInvoices.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: C.textMuted }}>No invoices found. Add an invoice or generate from recurring vendors.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['Vendor', 'Invoice', 'Date', 'Net Payable', 'Paid', 'Balance', 'Due', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '0.75rem 0.5rem', textAlign: h === 'Actions' ? 'center' : 'left', fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map(inv => {
                      const isSettled = inv.settled === true
                      const isPaid = !isSettled && n(inv.balance_due) < 1 && n(inv.net_payable) > 0
                      const isPartial = !isSettled && !isPaid && n(inv.amount_paid) > 0
                      const isOverdue = !isSettled && !isPaid && inv.due_date && inv.due_date < todayStr
                      const isDueToday = !isSettled && !isPaid && inv.due_date === todayStr
                      return (
                        <tr key={inv.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: isSettled ? 0.55 : isPaid ? 0.75 : 1 }}>
                          <td style={{ padding: '0.5rem', fontWeight: 600, color: C.text, maxWidth: '140px' }}>
                            {inv.vendor_name}
                            <div className="text-[10px]" style={{ color: C.textMuted }}>{catLabel(inv.category)}</div>
                          </td>
                          <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: C.textMuted }}>{inv.invoice_number || '—'}</td>
                          <td style={{ padding: '0.5rem', fontSize: '0.75rem' }}>{fmtDate(inv.invoice_date)}</td>
                          <td style={{ padding: '0.5rem', ...mono, fontWeight: 700, color: C.text }}>{fmtCurrency(inv.net_payable)}</td>
                          <td style={{ padding: '0.5rem', ...mono, color: n(inv.amount_paid) > 0 ? '#16a34a' : C.textMuted }}>{n(inv.amount_paid) > 0 ? fmtCurrency(inv.amount_paid) : '—'}</td>
                          <td style={{ padding: '0.5rem', ...mono, fontWeight: 700, color: n(inv.balance_due) > 0 ? C.red : '#16a34a' }}>{fmtCurrency(inv.balance_due)}</td>
                          <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: isOverdue ? C.red : isDueToday ? '#d97706' : C.textMuted }}>{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{
                              background: isSettled ? 'rgba(22,163,74,0.1)' : isPaid ? 'rgba(59,130,246,0.1)' : isPartial ? 'rgba(217,119,6,0.1)' : isOverdue ? 'rgba(220,38,38,0.1)' : 'rgba(201,164,50,0.1)',
                              color: isSettled ? '#16a34a' : isPaid ? '#3b82f6' : isPartial ? '#d97706' : isOverdue ? '#dc2626' : '#795900',
                            }}>{isSettled ? 'SETTLED' : isPaid ? 'PAID' : isPartial ? 'PARTIAL' : isOverdue ? 'OVERDUE' : isDueToday ? 'DUE TODAY' : 'UNPAID'}</span>
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            <div className="flex gap-1 justify-center">
                              {!isSettled && (
                                <button onClick={() => handleQuickPay(inv)} className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', border: 'none', cursor: 'pointer' }}>Pay</button>
                              )}
                              {!isSettled && (
                                <button onClick={() => setInvoiceModal(inv)} className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: 'none', cursor: 'pointer' }}>Edit</button>
                              )}
                              <button onClick={() => handleDeleteInvoice(inv)} className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: 'none', cursor: 'pointer' }}>Del</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════ RECURRING VIEW ═══════════════ */}
      {view === 'recurring' && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label style={{ fontSize: '0.6875rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>Month</label>
              <select value={genMonth} onChange={e => setGenMonth(parseInt(e.target.value))} style={selStyle}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.6875rem', color: C.textMuted, display: 'block', marginBottom: '0.25rem' }}>Year</label>
              <select value={genYear} onChange={e => setGenYear(parseInt(e.target.value))} style={selStyle}>
                {[2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button onClick={generateRecurring} disabled={generating}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: 'none', background: '#16a34a', color: '#fff', fontSize: '0.8125rem', fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.6 : 1 }}>
              {generating ? 'Generating...' : `Generate for ${MONTHS_SHORT[genMonth - 1]} ${genYear}`}
            </button>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            {recurringVendors.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: C.textMuted }}>No recurring vendors. Add vendors with monthly/quarterly/annual frequency.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['Vendor', 'Category', 'Frequency', 'Amount', 'GST', 'TDS', 'Net Payable', 'Due Day', 'Status', 'Last Generated'].map(h => (
                        <th key={h} style={{ padding: '0.75rem 0.5rem', textAlign: 'left', fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recurringVendors.map(v => {
                      const baseAmt = n(v.base_amount)
                      const gstAmt = v.is_gst_vendor ? baseAmt * n(v.gst_rate) / 100 : 0
                      const tdsAmt = v.has_tds ? baseAmt * n(v.tds_rate) / 100 : 0
                      const net = baseAmt + gstAmt - tdsAmt
                      const lastInv = invoices.filter(i => i.vendor_id === v.id && i.source === 'recurring').sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''))[0]
                      const hasThisMonth = invoices.some(i => i.vendor_id === v.id && i.period_month === genMonth && i.period_year === genYear)
                      return (
                        <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: v.is_active ? 1 : 0.5 }}>
                          <td style={{ padding: '0.5rem', fontWeight: 600, color: C.text }}>{v.name}</td>
                          <td style={{ padding: '0.5rem' }}><span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: C.bg, color: C.textMuted }}>{catLabel(v.category)}</span></td>
                          <td style={{ padding: '0.5rem', fontSize: '0.75rem' }}>{FREQUENCIES.find(f => f.value === v.frequency)?.label}</td>
                          <td style={{ padding: '0.5rem', ...mono }}>{fmtCurrency(baseAmt)}</td>
                          <td style={{ padding: '0.5rem', ...mono, color: gstAmt > 0 ? '#16a34a' : C.textMuted }}>{gstAmt > 0 ? fmtCurrency(gstAmt) : '—'}</td>
                          <td style={{ padding: '0.5rem', ...mono, color: tdsAmt > 0 ? '#d97706' : C.textMuted }}>{tdsAmt > 0 ? fmtCurrency(tdsAmt) : '—'}</td>
                          <td style={{ padding: '0.5rem', ...mono, fontWeight: 700 }}>{fmtCurrency(net)}</td>
                          <td style={{ padding: '0.5rem', fontSize: '0.75rem' }}>{v.due_day}{v.due_day === 1 ? 'st' : v.due_day === 2 ? 'nd' : v.due_day === 3 ? 'rd' : 'th'}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{
                              background: hasThisMonth ? 'rgba(22,163,74,0.1)' : v.is_active ? 'rgba(201,164,50,0.1)' : 'rgba(120,120,120,0.1)',
                              color: hasThisMonth ? '#16a34a' : v.is_active ? '#795900' : '#888',
                            }}>{hasThisMonth ? 'GENERATED' : v.is_active ? 'ACTIVE' : 'PAUSED'}</span>
                          </td>
                          <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: C.textMuted }}>
                            {lastInv ? `${MONTHS_SHORT[(lastInv.period_month || 1) - 1]} ${lastInv.period_year || ''}` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════ UPCOMING VIEW ═══════════════ */}
      {view === 'upcoming' && (
        <>
          {/* Summary Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Outstanding', val: fmtCurrency(summary.totalOutstanding), color: C.gold },
              { label: 'Overdue', val: `${fmtCurrency(summary.overdueAmt)} (${summary.overdueCount})`, color: '#dc2626' },
              { label: 'Due This Week', val: `${fmtCurrency(summary.weekAmt)} (${summary.weekCount})`, color: '#d97706' },
              { label: 'Invoices Pending', val: String(upcomingInvoices.length), color: C.text },
            ].map(card => (
              <div key={card.label} className="rounded-2xl p-3" style={{ background: C.cardBg, borderLeft: `4px solid ${card.color}` }}>
                <div style={{ fontSize: '0.6875rem', color: C.textMuted, marginBottom: '0.25rem' }}>{card.label}</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: card.color, ...mono }}>{card.val}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
            {upcomingInvoices.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: C.textMuted }}>All invoices settled! No upcoming payments.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {['Due Date', 'Vendor', 'Category', 'Invoice', 'Net Payable', 'Balance Due', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '0.75rem 0.5rem', textAlign: h === 'Actions' ? 'center' : 'left', fontSize: '0.6875rem', fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingInvoices.map(inv => {
                      const isOverdue = inv.due_date && inv.due_date < todayStr
                      const isDueToday = inv.due_date === todayStr
                      const isPartial = n(inv.amount_paid) > 0
                      const dueDate = inv.due_date ? new Date(inv.due_date) : null
                      const daysAway = dueDate ? Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24)) : null
                      const isUpcoming = daysAway !== null && daysAway > 0 && daysAway <= 7
                      return (
                        <tr key={inv.id} style={{ borderBottom: `1px solid ${C.border}`, background: isOverdue ? 'rgba(220,38,38,0.03)' : isDueToday ? 'rgba(217,119,6,0.03)' : 'transparent' }}>
                          <td style={{ padding: '0.5rem', fontWeight: 600, color: isOverdue ? '#dc2626' : isDueToday ? '#d97706' : C.text }}>
                            {inv.due_date ? fmtDate(inv.due_date) : '—'}
                            {isOverdue && <div className="text-[10px] font-bold" style={{ color: '#dc2626' }}>{Math.abs(daysAway)} days overdue</div>}
                          </td>
                          <td style={{ padding: '0.5rem', fontWeight: 600, color: C.text }}>{inv.vendor_name}</td>
                          <td style={{ padding: '0.5rem' }}><span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: C.bg, color: C.textMuted }}>{catLabel(inv.category)}</span></td>
                          <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: C.textMuted }}>{inv.invoice_number || '—'}</td>
                          <td style={{ padding: '0.5rem', ...mono }}>{fmtCurrency(inv.net_payable)}</td>
                          <td style={{ padding: '0.5rem', ...mono, fontWeight: 700, color: '#dc2626' }}>{fmtCurrency(inv.balance_due)}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{
                              background: isOverdue ? 'rgba(220,38,38,0.1)' : isDueToday ? 'rgba(217,119,6,0.1)' : isUpcoming ? 'rgba(234,179,8,0.1)' : 'rgba(120,120,120,0.1)',
                              color: isOverdue ? '#dc2626' : isDueToday ? '#d97706' : isUpcoming ? '#a16207' : '#888',
                            }}>{isOverdue ? 'OVERDUE' : isDueToday ? 'DUE TODAY' : isUpcoming ? 'UPCOMING' : isPartial ? 'PARTIAL' : 'SCHEDULED'}</span>
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                            <button onClick={() => handleQuickPay(inv)} className="text-[10px] px-2 py-0.5 rounded font-semibold" style={{ background: 'rgba(22,163,74,0.1)', color: '#16a34a', border: 'none', cursor: 'pointer' }}>Pay</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════ MODALS ═══════════════ */}
      {vendorModal !== null && (
        <VendorFormModal vendor={vendorModal?.id ? vendorModal : null} accounts={accounts} onSave={() => { setVendorModal(null); fetchVendors() }} onClose={() => setVendorModal(null)} />
      )}
      {invoiceModal !== null && (
        <InvoiceFormModal vendors={vendors} accounts={accounts} invoice={invoiceModal?.id ? invoiceModal : null} onSave={() => { setInvoiceModal(null); fetchAll() }} onClose={() => setInvoiceModal(null)} />
      )}
      {payModal && (
        <PayInvoiceModal invoice={payModal} onSave={() => { setPayModal(null); fetchAll() }} onClose={() => setPayModal(null)} />
      )}
    </div>
  )
}

export default PaymentsTab

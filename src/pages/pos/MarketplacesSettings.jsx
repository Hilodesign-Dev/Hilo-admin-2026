/* Marketplaces master — POS settings. Add / edit / deactivate (soft delete).
   Drives marketplace GST invoices + discount discrepancy checks. */
import React, { useEffect, useMemo, useState } from 'react'
import { supa } from '../../lib/supabase'

const GOLD = '#c9a432', INK = '#1b1c1a', SUB = '#6b7280', LINE = '#ebe7df', GOOD = '#16a34a', BAD = '#b91c1c'
const isAdmin = () => window._currentUserRole === 'admin' || !!window._currentUserIsFounder

const blank = () => ({
  name: '', legal_name: '', gstin: '', state: '', state_code: '',
  discount_pct: '', discount_tiers: [], gst_rate: 5, sac_default: '62032900', opc_charge: 0,
  payment_terms: '', invoice_notes: '', discrepancy_tolerance_pct: 1,
  billing_address: { line1: '', line2: '', city: '', state: '', pincode: '', country: 'India' },
  is_active: true,
})

const F = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: SUB, display: 'block', marginBottom: 4 }}>{label}</label>
    {children}
  </div>
)

export default function MarketplacesSettings() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState(null) // row object or null
  const [saving, setSaving] = useState(false)
  const admin = isAdmin()

  const load = async () => {
    setLoading(true)
    const { data } = await supa.from('marketplaces').select('*').order('is_active', { ascending: false }).order('name')
    setRows(data || []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const visible = useMemo(() => rows.filter(r => showInactive || r.is_active !== false), [rows, showInactive])

  const openNew = () => setEditing({ ...blank() })
  const openEdit = (r) => setEditing({ ...blank(), ...r, discount_tiers: Array.isArray(r.discount_tiers) ? r.discount_tiers : [], billing_address: { ...blank().billing_address, ...(r.billing_address || {}) } })

  const save = async () => {
    if (!editing?.name?.trim()) return
    setSaving(true)
    const payload = {
      name: editing.name.trim(), legal_name: editing.legal_name || null, gstin: editing.gstin || null,
      state: editing.state || null, state_code: editing.state_code || null,
      discount_pct: editing.discount_pct === '' ? null : Number(editing.discount_pct),
      gst_rate: Number(editing.gst_rate) || 5, sac_default: editing.sac_default || null,
      opc_charge: Number(editing.opc_charge) || 0,
      payment_terms: editing.payment_terms || null, invoice_notes: editing.invoice_notes || null,
      discrepancy_tolerance_pct: Number(editing.discrepancy_tolerance_pct) || 1,
      discount_tiers: (editing.discount_tiers && editing.discount_tiers.length) ? editing.discount_tiers.filter(t => t.pct !== '' && t.pct != null).map(t => ({ min_amount: Number(t.min_amount) || 0, pct: Number(t.pct) })) : null,
      billing_address: editing.billing_address, shipping_address: editing.billing_address,
      is_active: editing.is_active !== false, updated_at: new Date().toISOString(),
    }
    try {
      if (editing.id) await supa.from('marketplaces').update(payload).eq('id', editing.id)
      else await supa.from('marketplaces').insert({ ...payload, slug: payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') })
      setEditing(null); load()
    } finally { setSaving(false) }
  }
  const toggleActive = async (r) => {
    await supa.from('marketplaces').update({ is_active: r.is_active === false, updated_at: new Date().toISOString() }).eq('id', r.id)
    load()
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: SUB }}>Loading marketplaces…</div>

  const inp = { width: '100%', border: `1px solid ${LINE}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none' }

  return (
    <div style={{ padding: '16px 20px 80px', fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>Marketplaces</div>
          <div style={{ fontSize: 12, color: SUB }}>Address, GST & commission per marketplace — drives invoices and the discount discrepancy check.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: SUB, display: 'flex', gap: 5, alignItems: 'center' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive
          </label>
          {admin && <button onClick={openNew} style={{ background: INK, color: '#fff', fontSize: 13, fontWeight: 700, padding: '8px 14px', borderRadius: 8, border: 'none' }}>+ Add marketplace</button>}
        </div>
      </div>

      <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 90px 90px 80px 120px', padding: '8px 14px', background: '#faf9f5', borderBottom: `1px solid ${LINE}`, fontSize: 11, fontWeight: 700, color: SUB, textTransform: 'uppercase' }}>
          <div>Marketplace</div><div>GSTIN</div><div>Discount</div><div>GST</div><div>State</div><div style={{ textAlign: 'right' }}>Actions</div>
        </div>
        {visible.map(r => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 90px 90px 80px 120px', padding: '10px 14px', borderBottom: `1px solid ${LINE}`, alignItems: 'center', fontSize: 13, opacity: r.is_active === false ? 0.5 : 1 }}>
            <div style={{ fontWeight: 700, color: INK }}>{r.name}{r.is_active === false && <span style={{ fontSize: 10, marginLeft: 6, color: BAD }}>inactive</span>}</div>
            <div style={{ color: r.gstin ? INK : '#cbd5e1', fontFamily: 'monospace', fontSize: 12 }}>{r.gstin || 'not set'}</div>
            <div style={{ color: (r.discount_pct != null || (r.discount_tiers && r.discount_tiers.length)) ? INK : '#cbd5e1' }}>{(r.discount_tiers && r.discount_tiers.length) ? 'Tiered' : (r.discount_pct != null ? `${r.discount_pct}% off` : '—')}</div>
            <div>{r.gst_rate}%</div>
            <div>{r.state_code || '—'}</div>
            <div style={{ textAlign: 'right', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {admin && <button onClick={() => openEdit(r)} style={{ fontSize: 12, fontWeight: 700, color: GOLD, background: 'none', border: 'none' }}>Edit</button>}
              {admin && <button onClick={() => toggleActive(r)} style={{ fontSize: 12, fontWeight: 700, color: r.is_active === false ? GOOD : BAD, background: 'none', border: 'none' }}>{r.is_active === false ? 'Reactivate' : 'Deactivate'}</button>}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', height: '100%', background: '#fff', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: INK }}>{editing.id ? 'Edit marketplace' : 'New marketplace'}</div>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: SUB }}>×</button>
            </div>
            <F label="Name"><input style={inp} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></F>
            <F label="Legal name"><input style={inp} value={editing.legal_name || ''} onChange={e => setEditing({ ...editing, legal_name: e.target.value })} /></F>
            <F label="GSTIN"><input style={inp} value={editing.gstin || ''} onChange={e => setEditing({ ...editing, gstin: e.target.value })} placeholder="27AAACO7149M1ZZ" /></F>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10 }}>
              <F label="State"><input style={inp} value={editing.state || ''} onChange={e => setEditing({ ...editing, state: e.target.value })} placeholder="Maharashtra" /></F>
              <F label="State code"><input style={inp} value={editing.state_code || ''} onChange={e => setEditing({ ...editing, state_code: e.target.value })} placeholder="27" /></F>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <F label="Discount % off MRP"><input style={inp} type="number" value={editing.discount_pct ?? ''} onChange={e => setEditing({ ...editing, discount_pct: e.target.value })} placeholder="40" /></F>
              <F label="GST %"><input style={inp} type="number" value={editing.gst_rate} onChange={e => setEditing({ ...editing, gst_rate: e.target.value })} /></F>
              <F label="Tolerance %"><input style={inp} type="number" value={editing.discrepancy_tolerance_pct} onChange={e => setEditing({ ...editing, discrepancy_tolerance_pct: e.target.value })} /></F>
            </div>
            <F label="Tiered discount (optional — overrides flat % by order MRP)">
              <div>
                {(editing.discount_tiers || []).map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: SUB }}>MRP ≥ ₹</span>
                    <input style={{ ...inp, width: 100 }} type="number" value={t.min_amount ?? ''} onChange={e => { const a = [...editing.discount_tiers]; a[i] = { ...a[i], min_amount: e.target.value }; setEditing({ ...editing, discount_tiers: a }) }} placeholder="10000" />
                    <span style={{ fontSize: 12, color: SUB }}>→</span>
                    <input style={{ ...inp, width: 70 }} type="number" value={t.pct ?? ''} onChange={e => { const a = [...editing.discount_tiers]; a[i] = { ...a[i], pct: e.target.value }; setEditing({ ...editing, discount_tiers: a }) }} placeholder="25" />
                    <span style={{ fontSize: 12, color: SUB }}>% off</span>
                    <button onClick={() => setEditing({ ...editing, discount_tiers: editing.discount_tiers.filter((_, j) => j !== i) })} style={{ border: 'none', background: 'none', color: BAD, fontWeight: 700, cursor: 'pointer' }}>×</button>
                  </div>
                ))}
                <button onClick={() => setEditing({ ...editing, discount_tiers: [...(editing.discount_tiers || []), { min_amount: '', pct: '' }] })}
                  style={{ fontSize: 12, fontWeight: 700, color: GOLD, background: 'none', border: `1px dashed ${LINE}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>+ Add tier</button>
                {(editing.discount_tiers || []).length > 0 && <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>Highest matching MRP tier wins. Flat % is used when no tier matches.</div>}
              </div>
            </F>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <F label="Default SAC"><input style={inp} value={editing.sac_default || ''} onChange={e => setEditing({ ...editing, sac_default: e.target.value })} /></F>
              <F label="OPC charge ₹"><input style={inp} type="number" value={editing.opc_charge} onChange={e => setEditing({ ...editing, opc_charge: e.target.value })} /></F>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: SUB, margin: '8px 0 6px' }}>Billing / Ship-to address</div>
            {['line1', 'line2'].map(k => (
              <F key={k} label={k === 'line1' ? 'Address line 1' : 'Address line 2'}>
                <input style={inp} value={editing.billing_address?.[k] || ''} onChange={e => setEditing({ ...editing, billing_address: { ...editing.billing_address, [k]: e.target.value } })} />
              </F>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 10 }}>
              <F label="City"><input style={inp} value={editing.billing_address?.city || ''} onChange={e => setEditing({ ...editing, billing_address: { ...editing.billing_address, city: e.target.value } })} /></F>
              <F label="State"><input style={inp} value={editing.billing_address?.state || ''} onChange={e => setEditing({ ...editing, billing_address: { ...editing.billing_address, state: e.target.value } })} /></F>
              <F label="Pincode"><input style={inp} value={editing.billing_address?.pincode || ''} onChange={e => setEditing({ ...editing, billing_address: { ...editing.billing_address, pincode: e.target.value } })} /></F>
            </div>
            <F label="Payment terms"><input style={inp} value={editing.payment_terms || ''} onChange={e => setEditing({ ...editing, payment_terms: e.target.value })} placeholder="Due on Receipt" /></F>
            <F label="Invoice notes"><textarea style={{ ...inp, minHeight: 50 }} value={editing.invoice_notes || ''} onChange={e => setEditing({ ...editing, invoice_notes: e.target.value })} /></F>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={save} disabled={saving || !editing.name?.trim()} style={{ flex: 1, background: INK, color: '#fff', fontWeight: 700, fontSize: 14, padding: '10px', borderRadius: 8, border: 'none', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setEditing(null)} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff', fontWeight: 600, fontSize: 14, color: SUB }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

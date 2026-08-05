import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { _logChange, logAndToast } from '../../lib/logger'
import { toast } from '../../lib/designTokens'

/* LocationsPanel — master editor for the stores table (which now covers
   stores + offices + warehouses via the location_type column). One list,
   filter pills by type, search, drawer for create/edit, soft-disable via
   is_active, hard-delete blocked when assets / members reference it. */

const TYPE_META = {
  store:     { label: 'Store',     pill: 'bg-amber-50 text-amber-700',  icon: '🏬' },
  online:    { label: 'Online',    pill: 'bg-green-50 text-green-700',  icon: '🌐' },
  office:    { label: 'Office',    pill: 'bg-blue-50 text-blue-700',    icon: '🏢' },
  warehouse: { label: 'Warehouse', pill: 'bg-purple-50 text-purple-700',icon: '📦' },
}

const empty = () => ({
  code: '', name: '', location_type: 'store', invoice_prefix: '',
  city: 'Hyderabad', state: '', state_code: '', pincode: '', country: 'India',
  address_line1: '', address_line2: '',
  phone: '', email: '', gstin: '',
  area_sqft: '', opened_on: '',
  notes: '', image_url: '',
  is_active: true, is_online: false,
})

const LocationsPanel = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [memberCounts, setMemberCounts] = useState({})  // { store_id: count }
  const [assetSums,    setAssetSums]    = useState({})  // { location_id: { cnt, val } }
  const [editing, setEditing] = useState(null)   // current row OR empty() for add
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: rs }, { data: tm }, { data: ams }] = await Promise.all([
        supa.from('stores').select('*').order('location_type').order('name'),
        supa.from('team_members').select('id, store_id, is_active'),
        supa.from('team_member_assets').select('location_id, purchase_value, status').eq('status','assigned'),
      ])
      setRows((rs || []).filter(r => r.location_type !== 'marketplace'))
      const mc = {}
      ;(tm || []).filter(m => m.is_active !== false && m.store_id).forEach(m => { mc[m.store_id] = (mc[m.store_id] || 0) + 1 })
      setMemberCounts(mc)
      const ac = {}
      ;(ams || []).forEach(a => {
        if (!a.location_id) return
        if (!ac[a.location_id]) ac[a.location_id] = { cnt: 0, val: 0 }
        ac[a.location_id].cnt += 1
        ac[a.location_id].val += Number(a.purchase_value || 0)
      })
      setAssetSums(ac)
    } catch (e) {
      logAndToast('locations-load', 'Failed to load locations: ' + (e.message || e), e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = (search || '').trim().toLowerCase()
    return rows.filter(r => {
      if (typeFilter !== 'all' && r.location_type !== typeFilter) return false
      if (!showInactive && r.is_active === false) return false
      if (!q) return true
      const hay = [r.name, r.code, r.city, r.phone, r.gstin].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [rows, typeFilter, search, showInactive])

  const counts = useMemo(() => {
    const out = { all: 0, store: 0, online: 0, office: 0, warehouse: 0 }
    rows.filter(r => r.is_active !== false || showInactive).forEach(r => {
      out.all += 1
      out[r.location_type] = (out[r.location_type] || 0) + 1
    })
    return out
  }, [rows, showInactive])

  // ── Save ───────────────────────────────────────────────────────────────
  const save = async () => {
    if (!editing) return
    if (!editing.name?.trim()) { toast(false, 'Name is required'); return }
    if (!editing.code?.trim()) { toast(false, 'Code is required'); return }
    if (!editing.invoice_prefix?.trim()) { toast(false, 'Invoice prefix is required'); return }
    setBusy(true)
    try {
      // sanitize empty strings → null for nullable columns
      const blank = (v) => (v === '' || v === undefined ? null : v)
      const payload = {
        ...editing,
        name: editing.name.trim(),
        code: editing.code.trim().toUpperCase(),
        invoice_prefix: editing.invoice_prefix.trim().toUpperCase(),
        area_sqft: editing.area_sqft === '' || editing.area_sqft == null ? null : Number(editing.area_sqft),
        opened_on: blank(editing.opened_on),
        phone: blank(editing.phone),
        email: blank(editing.email),
        gstin: blank(editing.gstin),
        state_code: blank(editing.state_code),
        pincode: blank(editing.pincode),
        address_line1: blank(editing.address_line1),
        address_line2: blank(editing.address_line2),
        notes: blank(editing.notes),
        image_url: blank(editing.image_url),
        updated_at: new Date().toISOString(),
      }
      let err
      if (editing.id) {
        const r = await supa.from('stores').update(payload).eq('id', editing.id)
        err = r.error
        _logChange('update', 'location', editing.id, editing.name, {})
      } else {
        delete payload.id
        const r = await supa.from('stores').insert(payload)
        err = r.error
        _logChange('create', 'location', payload.code, payload.name, {})
      }
      if (err) throw err
      toast(true, 'Saved')
      setEditing(null)
      load()
    } catch (e) {
      logAndToast('locations-save', 'Save failed: ' + (e.message || e), e)
    } finally {
      setBusy(false)
    }
  }

  // ── Toggle active ──────────────────────────────────────────────────────
  const toggleActive = async (r) => {
    try {
      await supa.from('stores').update({ is_active: !r.is_active, updated_at: new Date().toISOString() }).eq('id', r.id)
      setRows(rs => rs.map(x => x.id === r.id ? { ...x, is_active: !r.is_active } : x))
    } catch (e) { logAndToast('locations-toggle', 'Toggle failed: ' + (e.message || e), e) }
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  const remove = async (r) => {
    const memberCount = memberCounts[r.id] || 0
    const assetCount  = (assetSums[r.id] || { cnt: 0 }).cnt
    if (memberCount > 0 || assetCount > 0) {
      toast(false, `Can't delete — ${memberCount} member(s) and ${assetCount} asset(s) reference this location. Re-assign them first.`)
      return
    }
    if (!window.confirm(`Delete "${r.name}"? This cannot be undone.`)) return
    try {
      const { error } = await supa.from('stores').delete().eq('id', r.id)
      if (error) throw error
      toast(true, 'Deleted')
      setRows(rs => rs.filter(x => x.id !== r.id))
    } catch (e) { logAndToast('locations-delete', 'Delete failed: ' + (e.message || e), e) }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 rounded-full" style={{ background: '#f5f4f0' }}>
          {[['all','All'],['store','Stores'],['online','Online'],['office','Offices'],['warehouse','Warehouses']].map(([k,label]) => {
            const active = typeFilter === k
            return (
              <button key={k} onClick={() => setTypeFilter(k)}
                className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                style={{ background: active ? '#c9a432' : 'transparent', color: active ? '#fff' : '#6b7280' }}>
                {label} <span className="opacity-60 ml-1">{counts[k] ?? 0}</span>
              </button>
            )
          })}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, code, city…"
          className="flex-1 min-w-[180px] px-3 py-2 text-sm rounded-lg border border-gray-200" />
        <label className="text-xs text-gray-500 flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-amber-600" />
          Show inactive
        </label>
        <button onClick={() => setEditing(empty())} className="btn-gold px-3 py-2 rounded-lg text-sm font-semibold">+ Add location</button>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No locations match.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ background: '#f5f4f0' }}>
              <tr>
                {['Name','Type','City','Members','Assets','Active','Actions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-gray-500 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const t = TYPE_META[r.location_type] || TYPE_META.store
                const mc = memberCounts[r.id] || 0
                const as = assetSums[r.id] || { cnt: 0, val: 0 }
                return (
                  <tr key={r.id} className="border-t border-gray-50" style={{ opacity: r.is_active === false ? 0.55 : 1 }}>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-gray-800">{r.name}</div>
                      <div className="text-[11px] font-mono text-gray-400">{r.code}{r.invoice_prefix && ` · ${r.invoice_prefix}`}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.pill}`}>{t.icon} {t.label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">{r.city || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600">{mc > 0 ? `${mc} member${mc===1?'':'s'}` : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-gray-600">{as.cnt > 0 ? `${as.cnt} · ₹${Number(as.val).toLocaleString('en-IN')}` : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => toggleActive(r)} className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: r.is_active === false ? '#f3f4f6' : '#dcfce7', color: r.is_active === false ? '#6b7280' : '#15803d' }}>
                        {r.is_active === false ? 'Inactive' : 'Active'}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditing({ ...r })} className="text-xs px-2 py-1 rounded hover:bg-gray-50 text-gray-500">Edit</button>
                        <button onClick={() => remove(r)} className="text-xs px-2 py-1 rounded hover:bg-red-50 text-red-500">Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit drawer */}
      {editing && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white sm:rounded-2xl rounded-t-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto p-5"
            style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editing.id ? 'Edit location' : 'Add location'}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">✕</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Name *">
                <Inp value={editing.name} onChange={v => setEditing({ ...editing, name: v })} />
              </Field>
              <Field label="Code *">
                <Inp value={editing.code} onChange={v => setEditing({ ...editing, code: v.toUpperCase() })} mono />
              </Field>
              <Field label="Type *">
                <select value={editing.location_type} onChange={e => setEditing({ ...editing, location_type: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white">
                  <option value="store">Store</option>
                  <option value="online">Online</option>
                  <option value="office">Office</option>
                  <option value="warehouse">Warehouse</option>
                </select>
              </Field>
              <Field label="Invoice prefix *">
                <Inp value={editing.invoice_prefix} onChange={v => setEditing({ ...editing, invoice_prefix: v.toUpperCase() })} mono />
              </Field>

              <Field label="City"><Inp value={editing.city} onChange={v => setEditing({ ...editing, city: v })} /></Field>
              <Field label="State"><Inp value={editing.state} onChange={v => setEditing({ ...editing, state: v })} /></Field>
              <Field label="Pincode"><Inp value={editing.pincode} onChange={v => setEditing({ ...editing, pincode: v })} /></Field>
              <Field label="Country"><Inp value={editing.country} onChange={v => setEditing({ ...editing, country: v })} /></Field>

              <Field label="Address line 1" span={2}><Inp value={editing.address_line1} onChange={v => setEditing({ ...editing, address_line1: v })} /></Field>
              <Field label="Address line 2" span={2}><Inp value={editing.address_line2} onChange={v => setEditing({ ...editing, address_line2: v })} /></Field>

              <Field label="Phone"><Inp value={editing.phone} onChange={v => setEditing({ ...editing, phone: v })} /></Field>
              <Field label="Email"><Inp value={editing.email} onChange={v => setEditing({ ...editing, email: v })} /></Field>
              <Field label="GSTIN (stores only)"><Inp value={editing.gstin} onChange={v => setEditing({ ...editing, gstin: v.toUpperCase() })} mono /></Field>
              <Field label="Area (sqft)"><Inp value={editing.area_sqft ?? ''} onChange={v => setEditing({ ...editing, area_sqft: v })} num /></Field>

              <Field label="Opened on">
                <input type="date" value={editing.opened_on || ''} onChange={e => setEditing({ ...editing, opened_on: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
              </Field>
              <Field label="Image URL"><Inp value={editing.image_url} onChange={v => setEditing({ ...editing, image_url: v })} /></Field>

              <Field label="Notes" span={2}>
                <textarea value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })}
                  rows={2} className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
              <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600">Cancel</button>
              <button onClick={save} disabled={busy} className="btn-gold px-4 py-1.5 text-sm rounded-lg font-semibold disabled:opacity-50">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const Field = ({ label, children, span = 1 }) => (
  <div style={{ gridColumn: `span ${span} / span ${span}` }}>
    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</div>
    {children}
  </div>
)
const Inp = ({ value, onChange, num, mono }) => (
  <input
    type="text"
    inputMode={num ? 'decimal' : 'text'}
    value={value ?? ''}
    onChange={e => onChange(e.target.value)}
    className={`w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white outline-none focus:border-amber-400 ${mono ? 'font-mono' : ''}`}
  />
)

export default LocationsPanel

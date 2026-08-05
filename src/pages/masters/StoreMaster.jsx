import React, { useEffect, useState, useMemo } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { logAndToast, _logChange } from '../../lib/logger'
import { GST_STATE_CODES, stateCodeByName, validateGstin, validatePan } from '../../lib/gstStateCodes'

/**
 * Stores Master — two-pane CRUD for the new `stores` table.
 *
 * Replaces the hardcoded STORES constant. Other code reads via useStores()
 * (src/pages/pos/useStores.js). Edits/inserts re-fetch the list on save.
 */
const StoreMaster = () => {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supa.from('stores')
      .select('*')
      .order('is_active', { ascending: false })
      .order('is_online', { ascending: true })
      .order('name', { ascending: true })
    if (error) toast(false, 'Failed to load stores')
    setStores(data || [])
    setLoading(false)
  }
  const [channels, setChannels] = useState([])
  const [marketplaces, setMarketplaces] = useState([])
  useEffect(() => { load() }, [])
  useEffect(() => {
    supa.from('sales_channels').select('id, name, is_active').eq('is_active', true).order('name').then(({ data }) => {
      if (data) setChannels(data)
    })
    supa.from('marketplaces').select('id, name, is_active').eq('is_active', true).order('name').then(({ data }) => {
      if (data) setMarketplaces(data)
    })
  }, [])

  const startNew = () => {
    const blank = {
      id: null, code: '', name: '', legal_name: '', gstin: '', pan: '',
      invoice_prefix: '', address_line1: '', address_line2: '', city: '',
      state: '', state_code: '', pincode: '', country: 'India',
      phone: '', email: '', is_active: true, is_online: false, notes: '',
      channel_id: null, location_type: 'store', marketplace_id: null,
    }
    setSelectedId(null)
    setDraft(blank)
  }

  const startEdit = (s) => {
    setSelectedId(s.id)
    setDraft({ ...s })
  }

  const update = (patch) => {
    const next = { ...draft, ...patch }
    if (patch.state) next.state_code = stateCodeByName(patch.state) || ''
    if (patch.code) next.code = String(patch.code).toUpperCase()
    if (patch.invoice_prefix) next.invoice_prefix = String(patch.invoice_prefix).toUpperCase()
    if (patch.gstin) next.gstin = String(patch.gstin).toUpperCase()
    if (patch.pan)   next.pan   = String(patch.pan).toUpperCase()
    setDraft(next)
  }

  const validate = () => {
    if (!draft.code || !/^[A-Z]{2,6}$/.test(draft.code)) return 'Code must be 2–6 uppercase letters'
    if (!draft.name) return 'Display name is required'
    if (!draft.invoice_prefix || !/^[A-Z]{2,6}$/.test(draft.invoice_prefix)) return 'Invoice prefix must be 2–6 uppercase letters'
    if (!draft.state || !draft.state_code) return 'State is required'
    if (draft.gstin) {
      const v = validateGstin(draft.gstin, draft.state_code)
      if (!v.ok) return v.reason
    }
    if (draft.pan) {
      const v = validatePan(draft.pan)
      if (!v.ok) return v.reason
    }
    return null
  }

  const save = async () => {
    const err = validate()
    if (err) { toast(false, err); return }
    setSaving(true)
    try {
      const payload = {
        ...draft,
        updated_at: new Date().toISOString(),
        updated_by_name: window._currentUserName || null,
      }
      if (draft.id) {
        const { error } = await supa.from('stores').update(payload).eq('id', draft.id)
        if (error) throw error
        _logChange('update', 'store', draft.id, draft.code, { fields: Object.keys(draft) })
      } else {
        payload.id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null
        payload.created_at = new Date().toISOString()
        payload.created_by_name = window._currentUserName || null
        const { error } = await supa.from('stores').insert([payload])
        if (error) throw error
        _logChange('create', 'store', payload.id, payload.code, { name: payload.name })
      }
      toast(true, 'Store saved')
      setDraft(null)
      setSelectedId(null)
      load()
    } catch (e) { logAndToast('store-save', 'Failed to save store: ' + (e.message || e), e) }
    finally { setSaving(false) }
  }

  const toggleActive = async () => {
    if (!draft?.id) return
    const next = !draft.is_active
    try {
      await supa.from('stores').update({ is_active: next, updated_at: new Date().toISOString() }).eq('id', draft.id)
      _logChange(next ? 'reactivate' : 'deactivate', 'store', draft.id, draft.code, {})
      toast(true, next ? 'Store reactivated' : 'Store deactivated')
      setDraft({ ...draft, is_active: next })
      load()
    } catch (e) { logAndToast('store-toggle', 'Failed: ' + (e.message || e), e) }
  }

  const visibleStores = useMemo(
    () => showInactive ? stores : stores.filter(s => s.is_active),
    [stores, showInactive],
  )

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 0 }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-base" style={{ color: C.text }}>🏬 Stores</h2>
          <label className="inline-flex items-center gap-1.5 text-xs" style={{ color: C.textMuted }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
        </div>
        <button onClick={startNew}
          className="text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ background: C.gold, color: '#fff', border: 'none' }}>
          + Add store
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '320px 1fr', minHeight: 480 }}>
        {/* List pane */}
        <div className="overflow-y-auto" style={{ borderRight: `1px solid ${C.border}`, maxHeight: 700 }}>
          {loading && <div className="p-4 text-xs" style={{ color: C.textMuted }}>Loading…</div>}
          {!loading && visibleStores.length === 0 && (
            <div className="p-4 text-xs" style={{ color: C.textMuted }}>No stores yet — click "Add store".</div>
          )}
          {visibleStores.map(s => {
            const active = selectedId === s.id
            return (
              <button key={s.id} onClick={() => startEdit(s)}
                className="w-full text-left p-3 transition-colors"
                style={{
                  background: active ? '#fff7e6' : 'transparent',
                  borderBottom: `1px solid ${C.border}`,
                  borderLeft: active ? `3px solid ${C.gold}` : '3px solid transparent',
                  opacity: s.is_active ? 1 : 0.5,
                }}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold" style={{ color: C.text }}>
                    {s.code} <span className="font-normal" style={{ color: C.textMuted }}>· {s.name}</span>
                  </div>
                  {s.is_online && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(91,141,239,0.15)', color: '#5b8def' }}>Online</span>}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: C.textMuted }}>
                  {(channels.find(c => c.id === s.channel_id)?.name) || 'No channel'} · {s.state || '—'} · {s.gstin ? 'GSTIN ✓' : 'No GSTIN'} · prefix <span className="font-mono">{s.invoice_prefix}</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Form pane */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 700 }}>
          {!draft && (
            <div className="text-sm text-center py-12" style={{ color: C.textMuted }}>
              Select a store on the left, or click "+ Add store" to create one.
            </div>
          )}
          {draft && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-bold text-base" style={{ color: C.text }}>
                  {draft.id ? `Edit: ${draft.name || draft.code}` : 'Add store'}
                </h3>
                {!draft.is_active && draft.id && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded" style={{ background: '#f0f0f0', color: '#666' }}>Inactive</span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Channel">
                  <select value={draft.channel_id || ''} onChange={e => update({ channel_id: e.target.value || null })}
                    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
                    style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}>
                    <option value="">— Select channel —</option>
                    {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Location type">
                  <select value={draft.location_type || 'store'} onChange={e => update({ location_type: e.target.value, marketplace_id: e.target.value === 'marketplace' ? draft.marketplace_id : null })}
                    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
                    style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}>
                    <option value="store">Physical store</option>
                    <option value="online">Online</option>
                    <option value="marketplace">Marketplace</option>
                    <option value="warehouse">Warehouse</option>
                    <option value="office">Office</option>
                  </select>
                </Field>
                {draft.location_type === 'marketplace' && (
                  <Field label="Marketplace">
                    <select value={draft.marketplace_id || ''} onChange={e => update({ marketplace_id: e.target.value || null })}
                      className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
                      style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}>
                      <option value="">Pick marketplace</option>
                      {marketplaces.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </Field>
                )}
                {draft.location_type !== 'marketplace' && <div />}
                <Field label="Code (2–6 letters, e.g. JUB)">
                  <input value={draft.code} onChange={e => update({ code: e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 6) })}
                    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none font-mono uppercase"
                    style={{ background: C.bg, border: `1px solid ${C.border}` }} />
                </Field>
                <Field label="Invoice prefix (2–6 letters, e.g. HIJ)">
                  <input value={draft.invoice_prefix} onChange={e => update({ invoice_prefix: e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 6) })}
                    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none font-mono uppercase"
                    style={{ background: C.bg, border: `1px solid ${C.border}` }} />
                </Field>
                <Field label="Display name">
                  <Input value={draft.name} onChange={v => update({ name: v })} />
                </Field>
                <Field label="Legal name">
                  <Input value={draft.legal_name || ''} onChange={v => update({ legal_name: v })} placeholder="Hilo Design Pvt Ltd — Jubilee Branch" />
                </Field>
                <Field label="GSTIN">
                  <input value={draft.gstin || ''} onChange={e => update({ gstin: e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 15) })}
                    placeholder="36AAACH1234A1ZL"
                    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none font-mono uppercase"
                    style={{ background: C.bg, border: `1px solid ${C.border}` }} />
                </Field>
                <Field label="PAN">
                  <input value={draft.pan || ''} onChange={e => update({ pan: e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 10) })}
                    placeholder="AAACH1234A"
                    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none font-mono uppercase"
                    style={{ background: C.bg, border: `1px solid ${C.border}` }} />
                </Field>
              </div>

              <div className="mt-4 mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Address</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2"><Field label="Address line 1"><Input value={draft.address_line1 || ''} onChange={v => update({ address_line1: v })} /></Field></div>
                <div className="sm:col-span-2"><Field label="Address line 2"><Input value={draft.address_line2 || ''} onChange={v => update({ address_line2: v })} /></Field></div>
                <Field label="City"><Input value={draft.city || ''} onChange={v => update({ city: v })} /></Field>
                <Field label="State">
                  <select value={draft.state || ''} onChange={e => update({ state: e.target.value })}
                    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
                    style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                    <option value="">— Select state —</option>
                    {GST_STATE_CODES.map(s => <option key={s.code} value={s.name}>{s.name} ({s.code})</option>)}
                  </select>
                </Field>
                <Field label="State code (auto)">
                  <input value={draft.state_code || ''} disabled
                    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none font-mono"
                    style={{ background: '#f5f4f0', border: `1px solid ${C.border}`, color: C.textMuted }} />
                </Field>
                <Field label="Pincode"><Input value={draft.pincode || ''} onChange={v => update({ pincode: v.replace(/[^0-9]/g, '').slice(0, 6) })} /></Field>
              </div>

              <div className="mt-4 mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Contact</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Phone"><Input value={draft.phone || ''} onChange={v => update({ phone: v })} /></Field>
                <Field label="Email"><Input value={draft.email || ''} onChange={v => update({ email: v })} type="email" /></Field>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <label className="inline-flex items-center gap-1.5 text-sm" style={{ color: C.text }}>
                  <input type="checkbox" checked={draft.is_active} onChange={e => update({ is_active: e.target.checked })} />
                  Active
                </label>
                <label className="inline-flex items-center gap-1.5 text-sm" style={{ color: C.text }}>
                  <input type="checkbox" checked={draft.is_online} onChange={e => update({ is_online: e.target.checked })} />
                  Online store / HQ
                </label>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2">
                <div>
                  {draft.id && (
                    <button onClick={toggleActive}
                      className="text-xs font-bold px-3 py-2 rounded-lg"
                      style={{ border: `1px solid ${C.border}`, color: draft.is_active ? C.red : C.green }}>
                      {draft.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setDraft(null); setSelectedId(null) }}
                    className="text-xs font-bold px-3 py-2 rounded-lg"
                    style={{ border: `1px solid ${C.border}`, color: C.text }}>Cancel</button>
                  <button onClick={save} disabled={saving}
                    className="text-xs font-bold px-4 py-2 rounded-lg"
                    style={{ background: C.gold, color: '#fff', opacity: saving ? 0.5 : 1 }}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, children }) => (
  <div>
    <label className="block mb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>{label}</label>
    {children}
  </div>
)
const Input = ({ value, onChange, placeholder = '', type = 'text' }) => (
  <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
    style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />
)

export default StoreMaster

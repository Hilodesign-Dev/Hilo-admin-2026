import React, { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { logAndToast, _logChange } from '../../lib/logger'

/**
 * Promo Codes Master — two-pane CRUD for promo_codes.
 *
 * Same pattern as StoreMaster: list on the left, detail/edit on the right.
 * Active codes shown first. Toggling is_active on a code immediately deactivates
 * it for new orders without nuking the row (so the redemption history stays
 * intact).
 */
const PromoCodeMaster = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supa.from('promo_codes')
      .select('*')
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) toast(false, 'Failed to load promo codes')
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = rows.filter(r => showInactive ? true : r.is_active)
  const selected = rows.find(r => r.id === selectedId)

  const startEdit = (row) => {
    setSelectedId(row?.id || null)
    setDraft(row ? { ...row } : EMPTY_DRAFT())
  }
  const startNew = () => {
    setSelectedId(null)
    setDraft(EMPTY_DRAFT())
  }
  const cancel = () => { setDraft(null); setSelectedId(null) }

  const save = async () => {
    if (!draft) return
    if (!draft.code || !draft.code.trim()) { toast(false, 'Code is required'); return }
    if (!draft.discount_type) { toast(false, 'Discount type is required'); return }
    if (!(Number(draft.discount_value) > 0)) { toast(false, 'Discount value must be > 0'); return }
    setSaving(true)
    try {
      const payload = {
        code: draft.code.trim().toUpperCase(),
        name: draft.name || null,
        description: draft.description || null,
        discount_type: draft.discount_type,
        discount_value: Number(draft.discount_value),
        min_order_amount: Number(draft.min_order_amount || 0),
        max_discount_amount: draft.max_discount_amount ? Number(draft.max_discount_amount) : null,
        valid_from: draft.valid_from || null,
        valid_until: draft.valid_until || null,
        usage_limit: draft.usage_limit ? Number(draft.usage_limit) : null,
        per_customer_limit: draft.per_customer_limit ? Number(draft.per_customer_limit) : 1,
        applicable_to: draft.applicable_to || 'all',
        applicable_ids: draft.applicable_ids || null,
        stackable_with_coupons: !!draft.stackable_with_coupons,
        excludes_loyalty: !!draft.excludes_loyalty,
        channels: draft.channels && draft.channels.length ? draft.channels : ['In-store','Online','Online Assist','Marketplace'],
        is_active: draft.is_active !== false,
        notes: draft.notes || null,
      }
      let id = selectedId
      if (selectedId) {
        const { error } = await supa.from('promo_codes').update(payload).eq('id', selectedId)
        if (error) throw error
        _logChange('update', 'promo_code', selectedId, payload.code, { type: payload.discount_type, value: payload.discount_value })
      } else {
        const { data, error } = await supa.from('promo_codes').insert([payload]).select('id').single()
        if (error) throw error
        id = data.id
        _logChange('create', 'promo_code', id, payload.code, { type: payload.discount_type, value: payload.discount_value })
      }
      toast(true, 'Saved')
      await load()
      setSelectedId(id)
      setDraft(null)
    } catch (e) {
      logAndToast('promo-master-save', 'Failed to save: ' + (e.message || e), e)
    } finally { setSaving(false) }
  }

  const toggleActive = async (row) => {
    try {
      const { error } = await supa.from('promo_codes').update({ is_active: !row.is_active }).eq('id', row.id)
      if (error) throw error
      _logChange(row.is_active ? 'deactivate' : 'activate', 'promo_code', row.id, row.code, {})
      toast(true, row.is_active ? 'Deactivated' : 'Activated')
      load()
    } catch (e) { logAndToast('promo-toggle', 'Failed to toggle: ' + (e.message || e), e) }
  }

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      {/* List */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
        <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>
            Coupons {!loading && `(${filtered.length})`}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] flex items-center gap-1" style={{ color: C.textMuted }}>
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
            <button onClick={startNew} className="text-xs font-bold px-2 py-1 rounded" style={{ background: C.gold, color: '#fff' }}>+ New</button>
          </div>
        </div>
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          {loading ? (
            <div className="py-6 text-center text-xs" style={{ color: C.textMuted }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-xs" style={{ color: C.textMuted }}>No coupons yet.</div>
          ) : filtered.map(r => (
            <div key={r.id} onClick={() => startEdit(r)}
              className="px-3 py-2.5 cursor-pointer hover:bg-gray-50"
              style={{ borderBottom: `1px solid ${C.borderLight}`, background: selectedId === r.id ? C.goldLight : 'transparent' }}>
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-sm font-bold tracking-wider" style={{ color: r.is_active ? C.text : C.textLight }}>{r.code}</div>
                <div className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: r.is_active ? '#d1fae5' : '#fee2e2', color: r.is_active ? '#065f46' : '#7f1d1d' }}>
                  {r.is_active ? 'ACTIVE' : 'OFF'}
                </div>
              </div>
              <div className="text-xs mt-1" style={{ color: C.textMuted }}>
                {r.discount_type === 'percentage' ? `${r.discount_value}% off` : `₹${Number(r.discount_value).toLocaleString('en-IN')} off`}
                {r.usage_limit ? ` · ${r.usage_count || 0}/${r.usage_limit} used` : (r.usage_count ? ` · ${r.usage_count} used` : '')}
              </div>
              {r.name && <div className="text-[10px] truncate mt-0.5" style={{ color: C.textLight }}>{r.name}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Detail / edit */}
      <div className="rounded-xl p-4 sm:p-5" style={{ background: '#fff', border: `1px solid ${C.border}`, minHeight: 400 }}>
        {!draft && !selected && (
          <div className="text-center py-16 text-sm" style={{ color: C.textMuted }}>
            Select a coupon to view or click <span className="font-bold">+ New</span> to add one.
          </div>
        )}
        {!draft && selected && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <div className="font-mono font-bold text-xl tracking-wider" style={{ color: C.text }}>{selected.code}</div>
                {selected.name && <div className="text-sm" style={{ color: C.textMuted }}>{selected.name}</div>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(selected)} className="text-xs font-bold px-3 py-1.5 rounded" style={{ border: `1px solid ${C.border}`, color: C.text }}>
                  {selected.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => startEdit(selected)} className="text-xs font-bold px-3 py-1.5 rounded" style={{ background: C.gold, color: '#fff' }}>Edit</button>
              </div>
            </div>
            <Field label="Discount" v={selected.discount_type === 'percentage' ? `${selected.discount_value}% off` : `₹${Number(selected.discount_value).toLocaleString('en-IN')} off`} />
            {selected.max_discount_amount && <Field label="Capped at" v={`₹${Number(selected.max_discount_amount).toLocaleString('en-IN')}`} />}
            <Field label="Min order" v={`₹${Number(selected.min_order_amount || 0).toLocaleString('en-IN')}`} />
            <Field label="Validity" v={`${selected.valid_from ? fmtDate(selected.valid_from) : 'any time'} → ${selected.valid_until ? fmtDate(selected.valid_until) : 'no end'}`} />
            <Field label="Usage" v={`${selected.usage_count || 0}${selected.usage_limit ? ` / ${selected.usage_limit}` : ' uses'} · ${selected.per_customer_limit || 1} per customer`} />
            <Field label="Channels" v={(selected.channels || []).join(', ') || '—'} />
            <Field label="Stacking" v={`${selected.stackable_with_coupons ? 'Stackable with other coupons' : 'Not stackable'} · ${selected.excludes_loyalty ? 'Excludes loyalty discount' : 'Stacks with loyalty'}`} />
            {selected.description && <Field label="Description" v={selected.description} />}
            {selected.notes && <Field label="Notes" v={selected.notes} />}
          </div>
        )}
        {draft && (
          <div className="space-y-3">
            <div className="font-bold text-lg" style={{ color: C.text }}>{selectedId ? 'Edit coupon' : 'New coupon'}</div>
            <Two>
              <In label="Code" req v={draft.code} onChange={v => setDraft({ ...draft, code: v.toUpperCase() })} mono />
              <In label="Internal name" v={draft.name} onChange={v => setDraft({ ...draft, name: v })} placeholder="Wedding 10%" />
            </Two>
            <Ta label="Description (shown on receipt)" v={draft.description} onChange={v => setDraft({ ...draft, description: v })} />
            <Two>
              <Sel label="Discount type" req v={draft.discount_type} onChange={v => setDraft({ ...draft, discount_type: v })}
                opts={[{ k: '', label: 'Select…' }, { k: 'percentage', label: 'Percentage (%)' }, { k: 'flat', label: 'Flat (₹)' }]} />
              <In label="Discount value" req v={draft.discount_value} onChange={v => setDraft({ ...draft, discount_value: v.replace(/[^0-9.]/g, '') })} placeholder="10" />
            </Two>
            <Two>
              <In label="Max discount (₹, optional cap)" v={draft.max_discount_amount} onChange={v => setDraft({ ...draft, max_discount_amount: v.replace(/[^0-9.]/g, '') })} />
              <In label="Minimum order (₹)" v={draft.min_order_amount} onChange={v => setDraft({ ...draft, min_order_amount: v.replace(/[^0-9.]/g, '') })} />
            </Two>
            <Two>
              <In label="Valid from" type="datetime-local" v={asLocalDt(draft.valid_from)} onChange={v => setDraft({ ...draft, valid_from: v ? new Date(v).toISOString() : null })} />
              <In label="Valid until" type="datetime-local" v={asLocalDt(draft.valid_until)} onChange={v => setDraft({ ...draft, valid_until: v ? new Date(v).toISOString() : null })} />
            </Two>
            <Two>
              <In label="Total usage limit (blank = unlimited)" v={draft.usage_limit} onChange={v => setDraft({ ...draft, usage_limit: v.replace(/[^0-9]/g, '') })} />
              <In label="Per-customer limit" v={draft.per_customer_limit} onChange={v => setDraft({ ...draft, per_customer_limit: v.replace(/[^0-9]/g, '') })} placeholder="1" />
            </Two>
            <div className="flex items-center gap-4 flex-wrap">
              <Cb label="Stackable with other coupons" checked={!!draft.stackable_with_coupons} onChange={v => setDraft({ ...draft, stackable_with_coupons: v })} />
              <Cb label="Excludes loyalty discount" checked={!!draft.excludes_loyalty} onChange={v => setDraft({ ...draft, excludes_loyalty: v })} />
              <Cb label="Active" checked={draft.is_active !== false} onChange={v => setDraft({ ...draft, is_active: v })} />
            </div>
            <Ta label="Internal notes" v={draft.notes} onChange={v => setDraft({ ...draft, notes: v })} />
            <div className="flex items-center justify-end gap-2 pt-2" style={{ borderTop: `1px solid ${C.borderLight}` }}>
              <button onClick={cancel} className="text-sm font-bold px-4 py-2 rounded" style={{ border: `1px solid ${C.border}`, color: C.text }}>Cancel</button>
              <button onClick={save} disabled={saving} className="text-sm font-bold px-4 py-2 rounded" style={{ background: C.gold, color: '#fff', opacity: saving ? 0.5 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const EMPTY_DRAFT = () => ({
  code: '', name: '', description: '',
  discount_type: 'percentage', discount_value: '',
  min_order_amount: '', max_discount_amount: '',
  valid_from: null, valid_until: null,
  usage_limit: '', per_customer_limit: 1,
  applicable_to: 'all', applicable_ids: null,
  stackable_with_coupons: false, excludes_loyalty: false,
  channels: ['In-store', 'Online', 'Online Assist', 'Marketplace'],
  is_active: true, notes: '',
})

const asLocalDt = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fmtDate = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const Field = ({ label, v }) => (
  <div className="py-2 grid grid-cols-[140px_1fr] gap-3 items-baseline" style={{ borderBottom: `1px solid ${C.borderLight}` }}>
    <div className="text-[10px] font-bold tracking-wider uppercase" style={{ color: C.textMuted }}>{label}</div>
    <div className="text-sm" style={{ color: C.text }}>{v}</div>
  </div>
)

const Two = ({ children }) => <div className="grid sm:grid-cols-2 gap-3">{children}</div>

const In = ({ label, v, onChange, type = 'text', mono, placeholder, req }) => (
  <label className="block">
    <div className="text-[10px] font-bold tracking-wider uppercase mb-1" style={{ color: C.textMuted }}>
      {label}{req && <span style={{ color: C.red }}> *</span>}
    </div>
    <input type={type} value={v == null ? '' : v} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full text-sm px-3 py-2 rounded outline-none"
      style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text, fontFamily: mono ? 'monospace' : undefined, letterSpacing: mono ? '0.05em' : undefined }} />
  </label>
)
const Ta = ({ label, v, onChange }) => (
  <label className="block">
    <div className="text-[10px] font-bold tracking-wider uppercase mb-1" style={{ color: C.textMuted }}>{label}</div>
    <textarea value={v || ''} onChange={e => onChange(e.target.value)} rows={2}
      className="w-full text-sm px-3 py-2 rounded outline-none"
      style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }} />
  </label>
)
const Sel = ({ label, v, onChange, opts, req }) => (
  <label className="block">
    <div className="text-[10px] font-bold tracking-wider uppercase mb-1" style={{ color: C.textMuted }}>
      {label}{req && <span style={{ color: C.red }}> *</span>}
    </div>
    <select value={v || ''} onChange={e => onChange(e.target.value)}
      className="w-full text-sm px-3 py-2 rounded outline-none"
      style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }}>
      {opts.map(o => <option key={o.k} value={o.k}>{o.label}</option>)}
    </select>
  </label>
)
const Cb = ({ label, checked, onChange }) => (
  <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: C.text }}>
    <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
    {label}
  </label>
)

export default PromoCodeMaster

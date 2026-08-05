import React, { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { logAndToast, _logChange } from '../../lib/logger'

/**
 * Payment Methods Master — two-pane CRUD for payment_methods.
 *
 * Rules from the Dues & Ledger spec:
 *   • Key is immutable after creation (disabled in edit mode).
 *   • Key validation: ^[a-z][a-z0-9_]{1,30}$
 *   • Deactivate, never delete — sets is_active = false. Historical
 *     pos_payments rows still render their original method.
 *   • Six fixed categories: cash / card / upi / online / bank / credit.
 *   • Every save writes _logChange('upsert','payment_method',key,…).
 */
const CATEGORIES = ['cash', 'card', 'upi', 'online', 'bank', 'credit']
const KEY_RE = /^[a-z][a-z0-9_]{1,30}$/

const PaymentMethodMaster = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState(null)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(true)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supa.from('payment_methods')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) toast(false, 'Failed to load payment methods')
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = rows.filter(r => showInactive ? true : r.is_active)
  const selected = rows.find(r => r.key === selectedKey)
  const isNew = draft && !selectedKey

  const startEdit = (row) => {
    setSelectedKey(row.key)
    setDraft({ ...row })
  }
  const startNew = () => {
    setSelectedKey(null)
    setDraft({
      key: '', label: '', icon: '', category: 'cash',
      requires_reference: false, reference_label: '',
      is_active: true, sort_order: 100, notes: '',
    })
  }
  const cancel = () => { setDraft(null); setSelectedKey(null) }

  const save = async () => {
    if (!draft) return
    if (!draft.key.trim()) { toast(false, 'Key is required'); return }
    if (!KEY_RE.test(draft.key.trim())) { toast(false, 'Key must be lowercase snake_case (a-z, 0-9, _), max 32 chars'); return }
    if (!draft.label.trim()) { toast(false, 'Label is required'); return }

    setSaving(true)
    try {
      const payload = {
        key: draft.key.trim(),
        label: draft.label.trim(),
        icon: draft.icon || null,
        category: draft.category,
        requires_reference: !!draft.requires_reference,
        reference_label: draft.reference_label || null,
        is_active: draft.is_active !== false,
        sort_order: Number(draft.sort_order || 100),
        notes: draft.notes || null,
        updated_at: new Date().toISOString(),
      }
      if (selectedKey) {
        const { error } = await supa.from('payment_methods').update(payload).eq('key', selectedKey)
        if (error) throw error
      } else {
        const { error } = await supa.from('payment_methods').insert([payload])
        if (error) throw error
      }
      _logChange('upsert', 'payment_method', payload.key, payload.label, { category: payload.category, is_active: payload.is_active })
      toast(true, 'Saved')
      await load()
      setSelectedKey(payload.key)
      setDraft(null)
    } catch (e) {
      logAndToast('payment-method-save', 'Failed: ' + (e.message || e), e)
    } finally { setSaving(false) }
  }

  const toggleActive = async (row) => {
    try {
      const { error } = await supa.from('payment_methods')
        .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
        .eq('key', row.key)
      if (error) throw error
      _logChange(row.is_active ? 'deactivate' : 'activate', 'payment_method', row.key, row.label, {})
      toast(true, row.is_active ? 'Deactivated' : 'Activated')
      load()
    } catch (e) { logAndToast('payment-method-toggle', 'Failed: ' + (e.message || e), e) }
  }

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
        <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>
            Methods {!loading && `(${filtered.length})`}
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
            <div className="py-6 text-center text-xs" style={{ color: C.textMuted }}>No methods yet.</div>
          ) : filtered.map(r => (
            <div key={r.key} onClick={() => startEdit(r)}
              className="px-3 py-2.5 cursor-pointer hover:bg-gray-50"
              style={{ borderBottom: `1px solid ${C.borderLight}`, background: selectedKey === r.key ? C.goldLight : 'transparent', opacity: r.is_active ? 1 : 0.55 }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base flex-shrink-0">{r.icon || '·'}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate" style={{ color: C.text }}>{r.label}</div>
                    <div className="text-[10px] font-mono truncate" style={{ color: C.textLight }}>{r.key}</div>
                  </div>
                </div>
                <div className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: r.is_active ? '#d1fae5' : '#fee2e2', color: r.is_active ? '#065f46' : '#7f1d1d' }}>
                  {r.is_active ? 'ACTIVE' : 'OFF'}
                </div>
              </div>
              <div className="text-[10px] mt-1 uppercase tracking-wider" style={{ color: C.textMuted }}>
                {r.category}{r.requires_reference ? ' · needs ref' : ''} · sort {r.sort_order}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl p-4 sm:p-5" style={{ background: '#fff', border: `1px solid ${C.border}`, minHeight: 400 }}>
        {!draft && !selected && (
          <div className="text-center py-16 text-sm" style={{ color: C.textMuted }}>
            Select a payment method or click <span className="font-bold">+ New</span>.
          </div>
        )}
        {!draft && selected && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selected.icon || '·'}</span>
                <div>
                  <div className="font-bold text-xl" style={{ color: C.text }}>{selected.label}</div>
                  <div className="text-xs font-mono" style={{ color: C.textMuted }}>{selected.key}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleActive(selected)} className="text-xs font-bold px-3 py-1.5 rounded" style={{ border: `1px solid ${C.border}`, color: C.text }}>
                  {selected.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button onClick={() => startEdit(selected)} className="text-xs font-bold px-3 py-1.5 rounded" style={{ background: C.gold, color: '#fff' }}>Edit</button>
              </div>
            </div>
            <Field label="Category" v={selected.category} />
            <Field label="Requires reference" v={selected.requires_reference ? `Yes — "${selected.reference_label || 'Reference'}"` : 'No'} />
            <Field label="Sort order" v={selected.sort_order} />
            <Field label="Status" v={selected.is_active ? 'Active' : 'Inactive'} />
            {selected.notes && <Field label="Notes" v={selected.notes} />}
          </div>
        )}
        {draft && (
          <div className="space-y-3">
            <div className="font-bold text-lg" style={{ color: C.text }}>{isNew ? 'New payment method' : `Edit ${selected?.label || ''}`}</div>
            <Two>
              <In label="Key" req v={draft.key}
                onChange={v => setDraft({ ...draft, key: v.toLowerCase().replace(/[^a-z0-9_]/g,'') })}
                disabled={!isNew} mono
                hint={isNew ? 'lowercase snake_case · cannot be changed after save' : 'Key cannot be changed after save'} />
              <In label="Display label" req v={draft.label} onChange={v => setDraft({ ...draft, label: v })} placeholder="HDFC POS Terminal" />
            </Two>
            <Two>
              <In label="Icon" v={draft.icon} onChange={v => setDraft({ ...draft, icon: v })} placeholder="🏧" />
              <Sel label="Category" req v={draft.category} onChange={v => setDraft({ ...draft, category: v })}
                opts={CATEGORIES.map(c => ({ k: c, label: c }))} />
            </Two>
            <Two>
              <In label="Sort order" v={draft.sort_order} onChange={v => setDraft({ ...draft, sort_order: v.replace(/[^0-9]/g,'') })} />
              <div className="flex items-end gap-3">
                <Cb label="Requires reference" checked={!!draft.requires_reference} onChange={v => setDraft({ ...draft, requires_reference: v })} />
                <Cb label="Active" checked={draft.is_active !== false} onChange={v => setDraft({ ...draft, is_active: v })} />
              </div>
            </Two>
            {draft.requires_reference && (
              <In label="Reference label (shown as placeholder)" v={draft.reference_label} onChange={v => setDraft({ ...draft, reference_label: v })} placeholder="Reference no" />
            )}
            <Ta label="Notes" v={draft.notes} onChange={v => setDraft({ ...draft, notes: v })} />
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

const Field = ({ label, v }) => (
  <div className="py-2 grid grid-cols-[160px_1fr] gap-3 items-baseline" style={{ borderBottom: `1px solid ${C.borderLight}` }}>
    <div className="text-[10px] font-bold tracking-wider uppercase" style={{ color: C.textMuted }}>{label}</div>
    <div className="text-sm" style={{ color: C.text }}>{v}</div>
  </div>
)
const Two = ({ children }) => <div className="grid sm:grid-cols-2 gap-3">{children}</div>
const In = ({ label, v, onChange, placeholder, req, mono, disabled, hint }) => (
  <label className="block">
    <div className="text-[10px] font-bold tracking-wider uppercase mb-1" style={{ color: C.textMuted }}>
      {label}{req && <span style={{ color: C.red }}> *</span>}
    </div>
    <input type="text" value={v == null ? '' : v} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      className="w-full text-sm px-3 py-2 rounded outline-none"
      style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text, fontFamily: mono ? 'ui-monospace, monospace' : undefined, opacity: disabled ? 0.6 : 1 }} />
    {hint && <div className="text-[10px] mt-1" style={{ color: C.textLight }}>{hint}</div>}
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

export default PaymentMethodMaster

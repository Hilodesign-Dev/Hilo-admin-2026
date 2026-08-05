import React, { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { logAndToast, _logChange } from '../../lib/logger'

/**
 * Loyalty Tiers Master — CRUD for the loyalty_tiers table.
 *
 * Tiers drive both the Royal/Elite view and the automatic checkout
 * discount in POSNewOrder (via useLoyaltyTiers). Editing here flows
 * through to every customer with that tier — RoyalEliteTab reads the
 * customer_type column directly, so changes to discount_pct take effect
 * on the very next order.
 *
 * The 'standard' tier is the implicit default and shouldn't be deleted;
 * the UI lets you edit it but warns on delete.
 */
const LoyaltyTierMaster = () => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supa.from('loyalty_tiers').select('*').order('sort_order', { ascending: true })
    if (error) toast(false, 'Failed to load tiers')
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing) return
    if (!editing.key || !editing.key.trim()) { toast(false, 'Key is required'); return }
    if (!editing.label || !editing.label.trim()) { toast(false, 'Label is required'); return }
    setSaving(true)
    try {
      const payload = {
        key: editing.key.trim().toLowerCase(),
        label: editing.label.trim(),
        badge_icon: editing.badge_icon || null,
        color: editing.color || null,
        bg_color: editing.bg_color || null,
        auto_threshold_ltv: editing.auto_threshold_ltv ? Number(editing.auto_threshold_ltv) : null,
        auto_threshold_orders: editing.auto_threshold_orders ? Number(editing.auto_threshold_orders) : null,
        discount_pct: Number(editing.discount_pct || 0),
        points_multiplier: Number(editing.points_multiplier || 1),
        birthday_gift_value: Number(editing.birthday_gift_value || 0),
        perks: editing.perks || [],
        sort_order: Number(editing.sort_order || 0),
        is_active: editing.is_active !== false,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supa.from('loyalty_tiers').upsert([payload], { onConflict: 'key' })
      if (error) throw error
      _logChange('upsert', 'loyalty_tier', payload.key, payload.label, { discount_pct: payload.discount_pct })
      toast(true, 'Saved')
      setEditing(null)
      load()
    } catch (e) { logAndToast('tier-save', 'Failed: ' + (e.message || e), e) }
    finally { setSaving(false) }
  }

  const removeTier = async (row) => {
    if (row.key === 'standard') { toast(false, 'The Standard tier cannot be removed'); return }
    if (!confirm(`Delete the ${row.label} tier? Customers currently on this tier will keep the label until promoted/demoted again.`)) return
    try {
      const { error } = await supa.from('loyalty_tiers').delete().eq('key', row.key)
      if (error) throw error
      toast(true, 'Removed')
      load()
    } catch (e) { logAndToast('tier-delete', 'Failed: ' + (e.message || e), e) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold" style={{ color: C.text }}>Loyalty Tiers</h2>
        <button onClick={() => setEditing({ key: '', label: '', discount_pct: 0, points_multiplier: 1, sort_order: rows.length, is_active: true })}
          className="text-xs font-bold px-3 py-1.5 rounded" style={{ background: C.gold, color: '#fff' }}>+ New tier</button>
      </div>
      <p className="text-xs mb-4" style={{ color: C.textMuted }}>
        Tier discount applies automatically at checkout (post per-line + order + coupon, pre-payment).
        Customers are promoted automatically when lifetime value crosses the threshold, unless their <code>tier_override</code> is set.
      </p>

      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
        <div className="grid grid-cols-[80px_1.4fr_1fr_1fr_0.8fr_0.8fr_100px] gap-2 px-3 py-2 text-[10px] font-bold tracking-wider uppercase"
          style={{ background: C.bg, color: C.textMuted, borderBottom: `1px solid ${C.border}` }}>
          <div>Badge</div><div>Tier</div><div>Min LTV</div><div>Discount</div><div>Pts ×</div><div>Status</div><div className="text-right">Actions</div>
        </div>
        {loading ? (
          <div className="py-6 text-center text-xs" style={{ color: C.textMuted }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center text-xs" style={{ color: C.textMuted }}>No tiers yet — click <span className="font-bold">+ New tier</span> to add one.</div>
        ) : rows.map(r => (
          <div key={r.key} className="grid grid-cols-[80px_1.4fr_1fr_1fr_0.8fr_0.8fr_100px] gap-2 px-3 py-2.5 items-center" style={{ borderBottom: `1px solid ${C.borderLight}` }}>
            <div className="text-center text-xl">{r.badge_icon || '·'}</div>
            <div>
              <div className="text-sm font-bold" style={{ color: r.color || C.text }}>{r.label}</div>
              <div className="text-[10px] font-mono" style={{ color: C.textLight }}>{r.key}</div>
            </div>
            <div className="text-sm font-mono" style={{ color: C.text }}>
              {r.auto_threshold_ltv ? `₹${Number(r.auto_threshold_ltv).toLocaleString('en-IN')}` : '—'}
            </div>
            <div className="text-sm font-mono" style={{ color: C.text }}>
              {r.discount_pct ? `${r.discount_pct}%` : '—'}
            </div>
            <div className="text-sm font-mono" style={{ color: C.text }}>{r.points_multiplier || 1}×</div>
            <div className="text-xs">
              {r.is_active
                ? <span className="px-1.5 py-0.5 rounded font-bold" style={{ background: '#d1fae5', color: '#065f46' }}>ACTIVE</span>
                : <span className="px-1.5 py-0.5 rounded font-bold" style={{ background: '#fee2e2', color: '#7f1d1d' }}>OFF</span>}
            </div>
            <div className="text-right">
              <button onClick={() => setEditing({ ...r })} className="text-xs font-bold px-2 py-1 rounded mr-1" style={{ border: `1px solid ${C.border}`, color: C.text }}>Edit</button>
              <button onClick={() => removeTier(r)} className="text-xs font-bold px-2 py-1 rounded" style={{ color: C.red }} disabled={r.key === 'standard'}>×</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5" style={{ border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: C.text }}>
                {rows.some(r => r.key === editing.key) ? `Edit ${editing.label || editing.key}` : 'New tier'}
              </h3>
              <button onClick={() => setEditing(null)} style={{ color: C.textMuted }}>✕</button>
            </div>
            <div className="space-y-3">
              <Two>
                <In label="Key (lowercase, no spaces)" v={editing.key} onChange={v => setEditing({ ...editing, key: v.toLowerCase().replace(/[^a-z0-9_]/g, '') })} disabled={rows.some(r => r.key === editing.key)} />
                <In label="Label" v={editing.label} onChange={v => setEditing({ ...editing, label: v })} />
              </Two>
              <Two>
                <In label="Badge / emoji" v={editing.badge_icon} onChange={v => setEditing({ ...editing, badge_icon: v })} placeholder="👑" />
                <In label="Sort order" v={editing.sort_order} onChange={v => setEditing({ ...editing, sort_order: Number(v.replace(/[^0-9]/g, '')) || 0 })} />
              </Two>
              <Two>
                <In label="Text color (hex)" v={editing.color} onChange={v => setEditing({ ...editing, color: v })} placeholder="#d4a843" />
                <In label="Background tint" v={editing.bg_color} onChange={v => setEditing({ ...editing, bg_color: v })} placeholder="rgba(212,168,67,0.12)" />
              </Two>
              <Two>
                <In label="Min lifetime value (₹) for auto promote" v={editing.auto_threshold_ltv} onChange={v => setEditing({ ...editing, auto_threshold_ltv: v.replace(/[^0-9.]/g, '') })} />
                <In label="Min orders count (alt)" v={editing.auto_threshold_orders} onChange={v => setEditing({ ...editing, auto_threshold_orders: v.replace(/[^0-9]/g, '') })} />
              </Two>
              <Two>
                <In label="Auto discount %" v={editing.discount_pct} onChange={v => setEditing({ ...editing, discount_pct: v.replace(/[^0-9.]/g, '') })} />
                <In label="Points earn × multiplier" v={editing.points_multiplier} onChange={v => setEditing({ ...editing, points_multiplier: v.replace(/[^0-9.]/g, '') })} />
              </Two>
              <In label="Birthday gift value (₹)" v={editing.birthday_gift_value} onChange={v => setEditing({ ...editing, birthday_gift_value: v.replace(/[^0-9.]/g, '') })} />
              <label className="inline-flex items-center gap-1.5 text-sm" style={{ color: C.text }}>
                <input type="checkbox" checked={editing.is_active !== false} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                Active
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5 pt-3" style={{ borderTop: `1px solid ${C.borderLight}` }}>
              <button onClick={() => setEditing(null)} className="text-sm font-bold px-4 py-2 rounded" style={{ border: `1px solid ${C.border}`, color: C.text }}>Cancel</button>
              <button onClick={save} disabled={saving} className="text-sm font-bold px-4 py-2 rounded" style={{ background: C.gold, color: '#fff', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const Two = ({ children }) => <div className="grid sm:grid-cols-2 gap-3">{children}</div>
const In = ({ label, v, onChange, placeholder, disabled }) => (
  <label className="block">
    <div className="text-[10px] font-bold tracking-wider uppercase mb-1" style={{ color: C.textMuted }}>{label}</div>
    <input type="text" value={v == null ? '' : v} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      className="w-full text-sm px-3 py-2 rounded outline-none"
      style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text, opacity: disabled ? 0.5 : 1 }} />
  </label>
)

export default LoyaltyTierMaster

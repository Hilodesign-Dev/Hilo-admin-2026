import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, n } from '../../lib/helpers'
import Icon from '../../components/Icon'
import { getAvatarUrl, getDisplayName } from '../../components/ProfilePopover'
import { ALL_TABS, TAB_LABELS, DEFAULT_TABS, ROLE_PRESETS } from '../../lib/constants'
import LocationsPanel from './LocationsPanel'
import AssetsPanel from './AssetsPanel'
import { relativeTime } from '../../lib/auditHelpers'

// ─── Role badge colors ─────────────────────────────────────────────────────
const ROLE_COLORS = {
  founder: 'bg-amber-100 text-amber-800',
  admin: 'bg-amber-50 text-amber-700',
  operations_manager: 'bg-blue-50 text-blue-700',
  production_manager: 'bg-green-50 text-green-700',
  stylist: 'bg-pink-50 text-pink-700',
  designer: 'bg-purple-50 text-purple-700',
  growth_manager: 'bg-teal-50 text-teal-700',
  tailor_lead: 'bg-orange-50 text-orange-700',
  fulfillment_ops: 'bg-cyan-50 text-cyan-700',
  finance: 'bg-red-50 text-red-700',
  intern: 'bg-gray-100 text-gray-600',
  custom: 'bg-gray-100 text-gray-500',
  staff: 'bg-gray-100 text-gray-500',
}

const getRoleLabel = (role) => ROLE_PRESETS[role]?.label || (role === 'staff' ? 'Staff' : role || 'Staff')
const getRoleBadgeClass = (role) => ROLE_COLORS[role] || ROLE_COLORS.staff

/* ═══════════════════════════════════════════════════════════════════════════
   DESIGNATIONS SUB-TAB — Admin-managed designation picklist
   ═══════════════════════════════════════════════════════════════════════════ */
const DesignationsPanel = () => {
  const [designations, setDesignations] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)

  const fetchDesignations = async () => {
    const { data, error } = await supa.from('designations').select('*').order('sort_order')
    if (!error && data) setDesignations(data)
    setLoading(false)
  }

  useEffect(() => { fetchDesignations() }, [])

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    if (designations.find(d => d.name.toLowerCase() === name.toLowerCase())) return
    setAdding(true)
    try {
      const maxSort = designations.length > 0 ? Math.max(...designations.map(d => d.sort_order || 0)) : 0
      const { error } = await supa.from('designations').insert([{ name, sort_order: maxSort + 1 }])
      if (error) throw error
      setNewName('')
      fetchDesignations()
    } catch (e) {
      _logError('designation-add', e.message, e.stack)
    } finally { setAdding(false) }
  }

  const handleSaveEdit = async (id) => {
    const name = editName.trim()
    if (!name) return
    try {
      const { error } = await supa.from('designations').update({ name }).eq('id', id)
      if (error) throw error
      setEditId(null)
      fetchDesignations()
    } catch (e) {
      _logError('designation-edit', e.message, e.stack)
    }
  }

  const handleDelete = async (id) => {
    try {
      await supa.from('designations').delete().eq('id', id)
      setConfirmDel(null)
      fetchDesignations()
    } catch (e) {
      _logError('designation-delete', e.message, e.stack)
    }
  }

  const handleMoveUp = async (idx) => {
    if (idx === 0) return
    const items = [...designations]
    const prev = items[idx - 1]
    const curr = items[idx]
    await supa.from('designations').update({ sort_order: prev.sort_order }).eq('id', curr.id)
    await supa.from('designations').update({ sort_order: curr.sort_order }).eq('id', prev.id)
    fetchDesignations()
  }

  if (loading) return <div className="text-center py-10 text-gray-400 text-sm">Loading...</div>

  return (
    <div style={{ maxWidth: 600 }}>
      <p className="text-sm text-gray-400 mb-4">
        Manage designation options that can be assigned to team members. These appear as selectable options when editing a member.
      </p>

      {/* Add new */}
      <div className="flex gap-2 mb-5">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="New designation (e.g. Senior Stylist)"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
        <button onClick={handleAdd} disabled={adding || !newName.trim()}
          className="btn-gold px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
          {adding ? '...' : '+ Add'}
        </button>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {designations.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No designations yet — add one above</div>
        ) : designations.map((d, idx) => (
          <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
            {/* Reorder */}
            <button onClick={() => handleMoveUp(idx)} disabled={idx === 0}
              className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-xs p-1" title="Move up">▲</button>

            {/* Name */}
            {editId === d.id ? (
              <div className="flex-1 flex gap-2">
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(d.id); if (e.key === 'Escape') setEditId(null) }}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                  autoFocus
                />
                <button onClick={() => handleSaveEdit(d.id)} className="text-xs text-amber-600 font-semibold px-2">Save</button>
                <button onClick={() => setEditId(null)} className="text-xs text-gray-400 px-2">Cancel</button>
              </div>
            ) : (
              <div className="flex-1 text-sm font-medium text-gray-700">{d.name}</div>
            )}

            {/* Actions */}
            {editId !== d.id && confirmDel !== d.id && (
              <div className="flex gap-1">
                <button onClick={() => { setEditId(d.id); setEditName(d.name) }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-all" title="Rename">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button onClick={() => setConfirmDel(d.id)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all" title="Delete">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}

            {confirmDel === d.id && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-red-500 font-medium">Delete?</span>
                <button onClick={() => handleDelete(d.id)} className="px-2 py-1 bg-red-500 text-white text-xs rounded-lg font-semibold">Yes</button>
                <button onClick={() => setConfirmDel(null)} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold">No</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   DEPARTMENTS SUB-TAB — assign team members to departments (head/member)
   ═══════════════════════════════════════════════════════════════════════════ */
const DEPT_DOT = (c) => ({ width: 11, height: 11, borderRadius: 999, background: c, display: 'inline-block' })
const SOP_CADENCES = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['always', 'Always'], ['adhoc', 'Ad-hoc']]
const _sopUid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'i' + Date.now() + Math.random().toString(16).slice(2))
function SopEditor({ memberId, actorName }) {
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (!memberId) return; let live = true; supa.from('member_sops').select('*').eq('team_member_id', memberId).maybeSingle().then(({ data }) => { if (!live) return; setItems(Array.isArray(data?.items) ? data.items : []); setNotes(data?.notes || '') }); return () => { live = false } }, [memberId])
  const add = () => setItems(x => [...x, { id: _sopUid(), text: '', cadence: 'daily' }])
  const upd = (i, patch) => setItems(x => x.map((it, j) => j === i ? { ...it, ...patch } : it))
  const del = (i) => setItems(x => x.filter((_, j) => j !== i))
  const save = async () => {
    setSaving(true)
    const clean = items.filter(it => (it.text || '').trim()).map(it => ({ ...it, text: it.text.trim() }))
    const { error } = await supa.from('member_sops').upsert({ team_member_id: memberId, items: clean, notes: notes || null, updated_by: actorName || null, updated_at: new Date().toISOString() }, { onConflict: 'team_member_id' })
    setSaving(false); if (!error) { setItems(clean); setSaved(true); setTimeout(() => setSaved(false), 1500) }
  }
  return (
    <div className="mb-6">
      <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-2">SOP - standard operating procedure</label>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={it.id || i} className="flex items-center gap-2">
            <select value={it.cadence || 'daily'} onChange={e => upd(i, { cadence: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white" style={{ width: 100 }}>
              {SOP_CADENCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <input value={it.text || ''} onChange={e => upd(i, { text: e.target.value })} placeholder="e.g. Reconcile POS payments" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
            <button type="button" onClick={() => del(i)} className="text-gray-300 hover:text-red-500 px-1.5 text-lg leading-none">&times;</button>
          </div>
        ))}
        {!items.length && <div className="text-xs text-gray-400 py-1">No SOP yet - add the responsibilities this person should follow.</div>}
      </div>
      <button type="button" onClick={add} className="mt-2 text-xs font-semibold text-amber-600">+ Add responsibility</button>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes / context (optional)" className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
      <div className="flex items-center gap-2 mt-2">
        <button type="button" onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-xs font-semibold btn-gold disabled:opacity-60">{saving ? 'Saving...' : 'Save SOP'}</button>
        {saved && <span className="text-xs text-green-600 font-semibold">Saved</span>}
      </div>
      <div className="text-[11px] text-gray-400 mt-1.5">Appears as a pinned reminder at the top of this member's My Tasks.</div>
    </div>
  )
}

const SopsPanel = ({ teamMembers }) => {
  const [openId, setOpenId] = useState(null)
  const [counts, setCounts] = useState({})
  useEffect(() => { supa.from('member_sops').select('team_member_id, items').then(({ data }) => { const c = {}; (data || []).forEach(r => { c[r.team_member_id] = (Array.isArray(r.items) ? r.items : []).filter(it => (it.text || '').trim()).length }); setCounts(c) }) }, [openId])
  const active = (teamMembers || []).filter(m => m.is_active !== false)
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
      <div className="text-sm text-gray-500 mb-4">Write each team member's SOP — the standing responsibilities they should follow. It appears as a pinned reminder at the top of their My Tasks.</div>
      <div className="divide-y divide-gray-100">
        {active.map(m => { const n = counts[m.id]; const open = openId === m.id; return (
          <div key={m.id} className="py-2">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setOpenId(open ? null : m.id)}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: 'linear-gradient(135deg,#795900,#d4a843)', fontSize: 12 }}>{(m.name || m.email || '?').charAt(0).toUpperCase()}</div>
              <span className="flex-1 font-semibold text-gray-800 text-sm">{m.name || m.email}</span>
              <span className="text-xs" style={{ color: n ? '#795900' : '#9ca3af' }}>{n ? `${n} responsibilit${n === 1 ? 'y' : 'ies'}` : 'No SOP yet'}</span>
              <span className="text-gray-400 text-sm">{open ? '\u25B4' : '\u25BE'}</span>
            </div>
            {open && <div className="mt-3 pl-11"><SopEditor memberId={m.id} actorName={typeof window !== 'undefined' ? window._currentUserName : null} /></div>}
          </div>) })}
        {!active.length && <div className="text-center py-8 text-gray-400 text-sm">No active team members.</div>}
      </div>
    </div>
  )
}

const DEPT_COLORS = ['#8b5cf6', '#2563eb', '#c9a432', '#ec4899', '#0ea5e9', '#16a34a', '#d97706', '#4f46e5', '#059669', '#b45309', '#6b7280', '#0891b2', '#dc2626', '#0f766e']

/* Create / edit a department. Archive (is_active=false) is preferred over delete,
   because tasks and memberships reference departments. */
function DeptModal({ dept, existing = [], onClose, onSaved }) {
  const isNew = !dept?.id
  const [f, setF] = useState(() => ({
    name: dept?.name || '',
    code: dept?.code || '',
    color: dept?.color || '#0891b2',
    description: dept?.description || '',
    sort_order: dept?.sort_order != null ? String(dept.sort_order) : String(existing.reduce((m, d) => Math.max(m, d.sort_order || 0), 0) + 1),
    is_active: dept?.is_active !== false,
  }))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    const name = (f.name || '').trim()
    const code = (f.code || '').trim().toUpperCase()
    if (!name) { setErr('Name is required'); return }
    if (!code) { setErr('Code is required'); return }
    const clash = existing.find(d => d.id !== dept?.id && (((d.code || '').toUpperCase() === code) || ((d.name || '').toLowerCase() === name.toLowerCase())))
    if (clash) { setErr(`"${clash.name}" already uses that name or code`); return }
    setSaving(true); setErr('')
    const payload = {
      name, code, color: f.color,
      description: (f.description || '').trim() || null,
      sort_order: f.sort_order === '' ? null : Number(f.sort_order),
      is_active: !!f.is_active,
    }
    const { error } = isNew
      ? await supa.from('departments').insert([payload])
      : await supa.from('departments').update(payload).eq('id', dept.id)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const del = async () => {
    if (!window.confirm(`Delete "${dept.name}"? If any tasks or members reference it, archive it instead.`)) return
    setSaving(true); setErr('')
    const { error } = await supa.from('departments').delete().eq('id', dept.id)
    setSaving(false)
    if (error) { setErr('Cannot delete — it is still referenced by tasks or members. Untick "Active" to archive it instead.'); return }
    onSaved()
  }

  const label = 'text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1'
  const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200'
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(15,23,42,0.55)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[88vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">{isNew ? 'New department' : `Edit — ${dept.name}`}</h2>
          <button onClick={onClose} className="text-sm font-bold px-2 text-gray-400">Close</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          {err && <div className="text-xs px-3 py-2 rounded-lg" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>{err}</div>}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label className={label}>Name *</label><input className={input} value={f.name} onChange={e => set('name', e.target.value)} placeholder="Technology" /></div>
            <div><label className={label}>Code *</label><input className={input} value={f.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="TECH" maxLength={8} /></div>
          </div>
          <div><label className={label}>Description</label><input className={input} value={f.description} onChange={e => set('description', e.target.value)} placeholder="What this department owns" /></div>
          <div>
            <label className={label}>Colour</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {DEPT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => set('color', c)} title={c}
                  style={{ width: 24, height: 24, borderRadius: 999, background: c, border: f.color === c ? '3px solid #111' : '2px solid #fff', boxShadow: '0 0 0 1px #e5e7eb' }} />
              ))}
              <input className="border border-gray-200 rounded-lg px-2 py-1 text-xs w-24 ml-1" value={f.color} onChange={e => set('color', e.target.value)} placeholder="#0891b2" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div><label className={label}>Sort order</label><input className={input} inputMode="numeric" value={f.sort_order} onChange={e => set('sort_order', e.target.value.replace(/[^0-9]/g, ''))} /></div>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
              <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} />
              Active {f.is_active ? '' : '(archived)'}
            </label>
          </div>
        </div>
        <div className="sticky bottom-0 bg-white px-5 py-3 border-t border-gray-100 flex items-center gap-2">
          {!isNew && <button onClick={del} disabled={saving} className="text-xs font-semibold text-red-600 mr-auto">Delete</button>}
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 ml-auto">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg text-xs font-semibold btn-gold disabled:opacity-60">{saving ? 'Saving…' : (isNew ? 'Create' : 'Save')}</button>
        </div>
      </div>
    </div>
  )
}

const DepartmentsPanel = ({ teamMembers }) => {
  const [departments, setDepartments] = useState([])
  const [memberships, setMemberships] = useState([])
  const [editDept, setEditDept] = useState(null)   // dept object, or {} for new
  const [showArchived, setShowArchived] = useState(false)
  const load = async () => {
    const [{ data: d }, { data: m }] = await Promise.all([
      supa.from('departments').select('*').order('sort_order'),
      supa.from('team_member_departments').select('*'),
    ])
    setDepartments(d || []); setMemberships(m || [])
  }
  useEffect(() => { load() }, [])
  const nameOf = (id) => (teamMembers.find(t => String(t.id) === String(id)) || {}).name || ('#' + id)
  const visible = departments.filter(d => showArchived || d.is_active !== false)
  const setMembership = async (mid, did, action) => {
    if (action === 'add') await supa.from('team_member_departments').insert([{ team_member_id: mid, department_id: did, role: 'member' }])
    else if (action === 'remove') await supa.from('team_member_departments').delete().eq('team_member_id', mid).eq('department_id', did)
    else await supa.from('team_member_departments').update({ role: action }).eq('team_member_id', mid).eq('department_id', did)
    load()
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="text-sm text-gray-500 flex-1 min-w-[240px]">Add, edit and assign team members to departments. Mark a department head with ★. Tasks are organised and visible by these departments.</div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived
        </label>
        <button type="button" onClick={() => setEditDept({})} className="px-4 py-2 rounded-lg text-xs font-semibold btn-gold">+ New department</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {visible.map(d => {
          const inD = memberships.filter(x => x.department_id === d.id)
          const ids = inD.map(x => String(x.team_member_id))
          return (
            <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span style={DEPT_DOT(d.color)} />
                <span className="font-semibold text-gray-800">{d.name}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#f3f4f6', color: '#6b7280' }}>{d.code}</span>
                {d.is_active === false && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: '#fef3c7', color: '#92400e' }}>ARCHIVED</span>}
                <span className="ml-auto text-xs text-gray-400">{inD.length} members</span>
                <button type="button" onClick={() => setEditDept(d)} title="Edit department" className="text-gray-300 hover:text-amber-600 text-sm px-1">✎</button>
              </div>
              <div className="text-xs text-gray-400 mb-3">{d.description}</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {inD.map(x => (
                  <span key={x.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: d.color + '1a', color: d.color }}>
                    {nameOf(x.team_member_id)}
                    <button type="button" onClick={() => setMembership(x.team_member_id, d.id, x.role === 'head' ? 'member' : 'head')} title="Toggle department head">{x.role === 'head' ? '★' : '☆'}</button>
                    <button type="button" onClick={() => setMembership(x.team_member_id, d.id, 'remove')} className="hover:text-red-600">✕</button>
                  </span>
                ))}
                {!inD.length && <span className="text-xs text-gray-300">No members yet</span>}
              </div>
              <select value="" onChange={e => { if (e.target.value) setMembership(Number(e.target.value), d.id, 'add') }}
                className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 w-full focus:outline-none focus:ring-2 focus:ring-amber-200">
                <option value="">+ Add member…</option>
                {teamMembers.filter(m => m.is_active !== false && !ids.includes(String(m.id))).map(m => <option key={m.id} value={m.id}>{m.name || m.email}</option>)}
              </select>
            </div>
          )
        })}
      </div>
      {!visible.length && <div className="text-center py-10 text-gray-400 text-sm">No departments yet — create one above.</div>}
      {editDept && (
        <DeptModal
          dept={editDept.id ? editDept : null}
          existing={departments}
          onClose={() => setEditDept(null)}
          onSaved={() => { setEditDept(null); load() }}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   USERS TAB — Main component with sub-tabs
   ═══════════════════════════════════════════════════════════════════════════ */
const UsersTab = ({ teamMembers, setTeamMembers }) => {
  const [subTab, setSubTab] = useState('members') // 'members' | 'designations'

  // ─── State ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editMember, setEditMember] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [delLoading, setDelLoading] = useState(false)

  // Designations list (for dropdown in edit/add)
  const [designations, setDesignations] = useState([])
  useEffect(() => {
    supa.from('designations').select('*').order('sort_order')
      .then(({ data }) => { if (data) setDesignations(data) })
  }, [subTab]) // refetch when switching back from designations tab

  // Locations list (for dropdown in edit/add)
  const [locations, setLocations] = useState([])
  useEffect(() => {
    supa.from('stores').select('id, name, location_type, code').eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setLocations(data) })
  }, [subTab])

  // store_id (the location FK) — bound in add + edit forms
  const [newStoreId, setNewStoreId] = useState('')
  const [editStoreId, setEditStoreId] = useState('')

  // Add form
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('staff')
  const [newTabs, setNewTabs] = useState([])
  const [newDesignation, setNewDesignation] = useState('')
  const [addErr, setAddErr] = useState('')
  const [addLoading, setAddLoading] = useState(false)

  // Edit drawer
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editTabs, setEditTabs] = useState([])
  const [editStylistInbox, setEditStylistInbox] = useState(false)
  const [editDesignation, setEditDesignation] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)
  const [pwCustom, setPwCustom] = useState('')
  const [pwResult, setPwResult] = useState(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef(null)

  // ─── Open edit drawer ────────────────────────────────────────────────────
  const openEdit = (member) => {
    setEditMember(member)
    setEditName(member.name || '')
    setEditRole(member.role || 'custom')
    setEditTabs(member.tabs || DEFAULT_TABS)
    setEditStylistInbox(!!member.stylist_inbox)
    setEditDesignation(member.designation || '')
    setEditStoreId(member.store_id || '')
    setShowAdd(false)
    setPwResult(null); setPwCustom('')
  }
  const closeEdit = () => { setEditMember(null); setPwResult(null); setPwCustom('') }

  // ─── Role change in edit drawer — seed tabs from preset ──────────────────
  const handleEditRoleChange = (role) => {
    setEditRole(role)
    if (role === 'admin') setEditTabs([...ALL_TABS])
  }

  // ─── Role change in add form — seed tabs from preset ─────────────────────
  const handleNewRoleChange = (role) => {
    setNewRole(role)
    if (role === 'admin') setNewTabs([...ALL_TABS])
    else setNewTabs([])
  }

  // ─── Toggle tab chip ─────────────────────────────────────────────────────
  const toggleEditTab = (tab) => {
    if (editRole === 'admin' || editRole === 'founder') return
    setEditTabs(prev => prev.includes(tab) ? prev.filter(t => t !== tab) : [...prev, tab])
  }
  const toggleNewTab = (tab) => {
    if (newRole === 'admin' || newRole === 'founder') return
    setNewTabs(prev => prev.includes(tab) ? prev.filter(t => t !== tab) : [...prev, tab])
  }

  // ─── Save edit ───────────────────────────────────────────────────────────
  const handleResetPassword = async (mode) => {
    if (!editMember) return
    setPwBusy(true); setPwResult(null)
    try {
      const { data, error } = await supa.functions.invoke('admin-reset-password', {
        body: { target_user_id: editMember.user_id, target_email: editMember.email, mode,
                new_password: mode === 'set' ? (pwCustom.trim() || undefined) : undefined },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)
      if (mode === 'set') setPwResult({ password: data.password })
      else setPwResult({ emailed: true, link: data.action_link })
      _logChange('reset-password', 'team_member', editMember.user_id, editMember.name || editMember.email, { mode })
    } catch (e) {
      setPwResult({ error: e.message || 'Failed to reset password' })
      _logError('reset-password', e.message, e.stack)
    } finally { setPwBusy(false) }
  }

  const handleSaveEdit = async () => {
    if (!editMember) return
    setEditSaving(true)
    try {
      const finalTabs = editRole === 'admin' ? ALL_TABS : editTabs
      const payload = {
        name: editName.trim(),
        role: editRole,
        tabs: finalTabs,
        designation: editDesignation || null,
        store_id: editStoreId || null,
        updated_at: new Date().toISOString(),
      }
      let { error } = await supa.from('team_members').update({ ...payload, stylist_inbox: editStylistInbox }).eq('user_id', editMember.user_id)
      if (error && /stylist_inbox/i.test(error.message || '')) {
        const retry = await supa.from('team_members').update(payload).eq('user_id', editMember.user_id)
        error = retry.error
      }
      if (error) throw error
      setTeamMembers(prev => prev.map(m => m.user_id === editMember.user_id
        ? { ...m, name: editName.trim(), role: editRole, tabs: finalTabs, designation: editDesignation || null, stylist_inbox: editStylistInbox, updated_at: new Date().toISOString() }
        : m))
      _logChange('update-access', 'team_member', editMember.user_id, editName.trim(), { role: editRole, tabs: finalTabs, designation: editDesignation })
      closeEdit()
    } catch (e) {
      _logError('team-edit', e.message, e.stack)
    } finally {
      setEditSaving(false)
    }
  }

  // ─── Add user ────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    const em = newEmail.trim().toLowerCase()
    const nm = newName.trim()
    const pw = newPassword.trim()
    if (!nm) { setAddErr('Enter the person\'s name'); return }
    if (!em.includes('@')) { setAddErr('Enter a valid email address'); return }
    if (pw.length < 6) { setAddErr('Password must be at least 6 characters'); return }
    if (teamMembers.find(u => u.email.toLowerCase() === em)) { setAddErr('This email already has access'); return }
    setAddLoading(true); setAddErr('')
    try {
      const finalTabs = newRole === 'admin' ? ALL_TABS : newTabs
      const { data, error: fnErr } = await supa.functions.invoke('create-user', {
        body: { email: em, password: pw, name: nm, role: newRole, tabs: finalTabs },
      })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)
      // Update designation if set
      if (newDesignation) {
        const { data: fresh } = await supa.from('team_members').select('*').eq('email', em).single()
        if (fresh) {
          await supa.from('team_members').update({ designation: newDesignation }).eq('user_id', fresh.user_id)
        }
      }
      const { data: fresh } = await supa.from('team_members').select('*').order('created_at')
      if (fresh) setTeamMembers(fresh)
      setNewName(''); setNewEmail(''); setNewPassword('')
      setNewRole('staff'); setNewTabs([]); setNewDesignation(''); setNewStoreId(''); setAddErr(''); setShowAdd(false)
    } catch (e) {
      setAddErr(e.message || 'Failed to create user. Try again.')
      _logError('team-add', e.message, e.stack)
    } finally { setAddLoading(false) }
  }

  // ─── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async (member) => {
    setDelLoading(true)
    try {
      await supa.from('team_members').delete().eq('user_id', member.user_id)
      setTeamMembers(prev => prev.filter(m => m.user_id !== member.user_id))
      _logChange('remove', 'team_member', member.user_id, member.name || member.email, {})
      setConfirmDel(null)
      if (editMember?.user_id === member.user_id) closeEdit()
    } catch (e) { _logError('team-delete', e.message, e.stack) }
    finally { setDelLoading(false) }
  }

  // ─── Active / inactive (soft) — preserve all history, never delete ───────
  const toggleActive = async (member) => {
    const next = member.is_active === false
    try {
      await supa.from('team_members').update({ is_active: next, deactivated_at: next ? null : new Date().toISOString() }).eq('user_id', member.user_id)
      setTeamMembers(prev => prev.map(m => m.user_id === member.user_id ? { ...m, is_active: next, deactivated_at: next ? null : new Date().toISOString() } : m))
      _logChange(next ? 'reactivate' : 'deactivate', 'team_member', member.user_id, member.name || member.email, {})
    } catch (e) { _logError('team-active', e.message, e.stack) }
  }

  // ─── Avatar upload ───────────────────────────────────────────────────────
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !editMember) return
    setAvatarUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${editMember.user_id}.${ext}`
      const { error: upErr } = await supa.storage.from('avatars').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: urlData } = supa.storage.from('avatars').getPublicUrl(path)
      const publicUrl = urlData?.publicUrl + '?t=' + Date.now()
      await supa.from('team_members').update({ avatar_url: publicUrl }).eq('user_id', editMember.user_id)
      setTeamMembers(prev => prev.map(m => m.user_id === editMember.user_id ? { ...m, avatar_url: publicUrl } : m))
      setEditMember(prev => ({ ...prev, avatar_url: publicUrl }))
    } catch (err) {
      _logError('avatar-upload', err.message, err.stack)
    } finally { setAvatarUploading(false) }
  }

  // ─── Filtered list ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = teamMembers
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(m =>
        (m.name || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        getRoleLabel(m.role).toLowerCase().includes(q) ||
        (m.designation || '').toLowerCase().includes(q)
      )
    }
    if (roleFilter === '__inactive__') { list = list.filter(m => m.is_active === false) }
    else { list = list.filter(m => m.is_active !== false); if (roleFilter) list = list.filter(m => m.role === roleFilter) }
    return list
  }, [teamMembers, search, roleFilter])

  const uniqueRoles = useMemo(() => {
    const roles = [...new Set(teamMembers.map(m => m.role || 'staff'))]
    return roles.sort()
  }, [teamMembers])

  const tabAccessSummary = (member) => {
    if (member.role === 'admin' || member.role === 'founder') return 'All ' + ALL_TABS.length + ' tabs'
    const count = (member.tabs || DEFAULT_TABS).length
    return count + ' of ' + ALL_TABS.length + ' tabs'
  }

  const isLockedRole = (role) => role === 'admin' || role === 'founder'

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="fade-in" style={{display:'flex',flexDirection:'column',minHeight:'100%'}}>
      {/* Sub-tab strip */}
      <div style={{ padding: '1.5rem 2rem 0' }}>
        <div className="flex items-start justify-between mb-1">
          <div>
            <h1 style={{fontFamily:"Manrope,sans-serif",fontSize:"1.75rem",fontWeight:800,letterSpacing:"-0.02em",color:"#1b1c1a",lineHeight:1.1,marginBottom:4}}>Team Access</h1>
            <p className="text-gray-400 text-sm">Manage team members, roles, designations, and tab access</p>
          </div>
          {subTab === 'members' && (
            <button onClick={() => { setShowAdd(v => !v); setAddErr(''); closeEdit(); }}
              className="btn-gold px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 flex-shrink-0">
              <span className="text-lg leading-none">{showAdd ? '✕' : '+'}</span>
              {showAdd ? 'Cancel' : 'Add User'}
            </button>
          )}
        </div>
        <div className="flex gap-1 mt-4 border-b border-gray-100">
          {[
            { id: 'members', label: 'Team Members' },
            { id: 'departments', label: 'Departments' },
            { id: 'designations', label: 'Designations' },
            { id: 'sops', label: 'SOPs' },
            { id: 'locations', label: 'Locations' },
            { id: 'assets', label: 'Assets' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setSubTab(tab.id); closeEdit(); setShowAdd(false) }}
              className="px-4 py-2.5 text-sm font-semibold transition-all relative"
              style={{
                color: subTab === tab.id ? '#c9a432' : '#9ca3af',
                borderBottom: subTab === tab.id ? '2px solid #c9a432' : '2px solid transparent',
                marginBottom: '-1px'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Departments sub-tab */}
      {subTab === 'departments' && (
        <div style={{ padding: '1.5rem 2rem' }}>
          <DepartmentsPanel teamMembers={teamMembers} />
        </div>
      )}

      {/* Designations sub-tab */}
      {subTab === 'designations' && (
        <div style={{ padding: '1.5rem 2rem' }}>
          <DesignationsPanel />
        </div>
      )}

      {/* SOPs sub-tab */}
      {subTab === 'sops' && (
        <div style={{ padding: '1.5rem 2rem' }}>
          <SopsPanel teamMembers={teamMembers} />
        </div>
      )}

      {/* Locations sub-tab */}
      {subTab === 'locations' && (
        <div style={{ padding: '1.5rem 2rem' }}>
          <LocationsPanel />
        </div>
      )}

      {/* Assets sub-tab */}
      {subTab === 'assets' && (
        <div style={{ padding: '1.5rem 2rem' }}>
          <AssetsPanel teamMembers={teamMembers} currentUserName={typeof window !== 'undefined' ? (window._currentUserName || '') : ''} />
        </div>
      )}

      {/* Members sub-tab */}
      {subTab === 'members' && (
        <div style={{display:'flex',flex:1,minHeight:0}}>
          <div style={{flex:1,padding:'1.5rem 2rem',maxWidth: editMember ? 'calc(100% - 380px)' : '100%',transition:'max-width 0.2s ease'}}>
            {/* Search + role filter */}
            <div className="mb-4">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, role, or designation…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 mb-3" />
              {teamMembers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setRoleFilter('')}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${!roleFilter ? 'btn-gold border-transparent' : 'border-gray-200 text-gray-400 bg-white hover:border-gray-300'}`}>
                    All
                  </button>
                  {uniqueRoles.map(role => (
                    <button key={role} onClick={() => setRoleFilter(roleFilter === role ? '' : role)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${roleFilter === role ? 'btn-gold border-transparent' : 'border-gray-200 text-gray-400 bg-white hover:border-gray-300'}`}>
                      {getRoleLabel(role)}
                    </button>
                  ))}
                  <button onClick={() => setRoleFilter(roleFilter === '__inactive__' ? '' : '__inactive__')}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${roleFilter === '__inactive__' ? 'btn-gold border-transparent' : 'border-gray-200 text-gray-400 bg-white hover:border-gray-300'}`}>
                    Inactive{teamMembers.filter(m => m.is_active === false).length ? ` (${teamMembers.filter(m => m.is_active === false).length})` : ''}
                  </button>
                </div>
              )}
            </div>

            {/* Add User Panel */}
            {showAdd && (
              <div className="bg-white rounded-xl shadow-sm border border-amber-100 p-4 mb-5">
                <div className="text-sm font-semibold text-gray-700 mb-3">New Team Member</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <input value={newName} onChange={e => { setNewName(e.target.value); setAddErr('') }}
                    placeholder="Full name (e.g. Priya)"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
                  <input value={newEmail} onChange={e => { setNewEmail(e.target.value); setAddErr('') }}
                    placeholder="email@example.com" type="email"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
                  <input value={newPassword} onChange={e => { setNewPassword(e.target.value); setAddErr('') }}
                    placeholder="Set a password (min 6 chars)" type="password"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
                  <select value={newRole} onChange={e => handleNewRoleChange(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 bg-white">
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                  </select>
                  <select value={newDesignation} onChange={e => setNewDesignation(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 bg-white">
                    <option value="">Select Designation</option>
                    {designations.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                {!isLockedRole(newRole) && (
                  <div className="mb-3">
                    <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Tab Access</div>
                    <div className="flex flex-wrap gap-2">
                      {ALL_TABS.map(tab => {
                        const on = newTabs.includes(tab)
                        return (
                          <button key={tab} type="button" onClick={() => toggleNewTab(tab)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${on ? 'btn-gold border-transparent' : 'border-gray-200 text-gray-400 bg-gray-50 hover:border-gray-300'}`}>
                            {TAB_LABELS[tab]}{on && <span className="ml-1.5 opacity-70">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {isLockedRole(newRole) && (
                  <div className="text-xs text-gray-300 mb-3 bg-gray-50 px-3 py-2 rounded-lg">{getRoleLabel(newRole)} always has full access to all tabs</div>
                )}
                {addErr && <div className="text-red-500 text-xs mb-2 bg-red-50 px-3 py-2 rounded-lg">{addErr}</div>}
                <button type="button" onClick={handleAdd} disabled={addLoading}
                  className="btn-gold px-5 py-2 rounded-lg text-sm font-semibold w-full sm:w-auto disabled:opacity-60">
                  {addLoading ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            )}

            {/* ── Table ─────────────────────────────────────────────────── */}
            <div className="hidden sm:block bg-white rounded-xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wide">User</th>
                    <th className="px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wide" style={{width:140}}>Designation</th>
                    <th className="px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wide" style={{width:140}}>Role</th>
                    <th className="px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wide" style={{width:120}}>Access</th>
                    <th className="px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wide" style={{width:100}}>Last Active</th>
                    <th className="px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wide text-right" style={{width:90}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => {
                    const isDelConfirm = confirmDel === u.user_id
                    const isEditing = editMember?.user_id === u.user_id
                    return (
                      <tr key={u.user_id} className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${isEditing ? 'bg-amber-50/30' : ''}`} style={{ opacity: u.is_active === false ? 0.55 : 1 }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img src={getAvatarUrl(u)} className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 flex-shrink-0 object-cover" />
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-800 text-sm truncate flex items-center gap-2">{u.name || getDisplayName(u.email)}{u.is_active === false && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 flex-shrink-0">Inactive</span>}</div>
                              <div className="text-xs text-gray-400 truncate">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {u.designation ? (
                            <span className="text-xs text-gray-600 font-medium">{u.designation}</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getRoleBadgeClass(u.role)}`}>
                            {getRoleLabel(u.role)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-500 cursor-default" title={(u.tabs || DEFAULT_TABS).map(t => TAB_LABELS[t] || t).join(', ')}>
                            {tabAccessSummary(u)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-400">{relativeTime(u.last_active_at)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!isDelConfirm && (
                              <>
                                <button type="button" onClick={() => openEdit(u)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-all" title="Edit">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button type="button" onClick={() => toggleActive(u)}
                                  className="p-1.5 rounded-lg transition-all"
                                  style={{ color: u.is_active === false ? '#059669' : '#9ca3af' }}
                                  title={u.is_active === false ? 'Reactivate member' : 'Deactivate member (keeps all history)'}>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                                  </svg>
                                </button>
                                {!isLockedRole(u.role) && (
                                  <button type="button" onClick={() => setConfirmDel(u.user_id)}
                                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all" title="Remove">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                )}
                              </>
                            )}
                            {isDelConfirm && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-red-500 font-medium">Remove?</span>
                                <button type="button" onClick={() => handleDelete(u)} disabled={delLoading}
                                  className="px-2 py-1 bg-red-500 text-white text-xs rounded-lg font-semibold disabled:opacity-60">Yes</button>
                                <button type="button" onClick={() => setConfirmDel(null)}
                                  className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold">No</button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">
                  {search || roleFilter ? 'No team members match your filters' : 'No team members yet — click Add User to get started'}
                </div>
              )}
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {filtered.map(u => {
                const isDelConfirm = confirmDel === u.user_id
                return (
                  <div key={u.user_id} className="bg-white rounded-xl shadow-sm p-4" onClick={() => openEdit(u)} style={{ opacity: u.is_active === false ? 0.55 : 1 }}>
                    <div className="flex items-center gap-3 mb-2">
                      <img src={getAvatarUrl(u)} className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex-shrink-0 object-cover" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800 text-sm flex items-center gap-2">{u.name || getDisplayName(u.email)}{u.is_active === false && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Inactive</span>}</div>
                        <div className="text-xs text-gray-400 truncate">{u.email}</div>
                      </div>
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getRoleBadgeClass(u.role)}`}>
                        {getRoleLabel(u.role)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>{u.designation || '—'}</span>
                      <span>{tabAccessSummary(u)}</span>
                      <span>{relativeTime(u.last_active_at)}</span>
                    </div>
                    {isDelConfirm && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100" onClick={e => e.stopPropagation()}>
                        <span className="text-xs text-red-500 font-medium flex-1">Remove this member?</span>
                        <button type="button" onClick={() => handleDelete(u)} disabled={delLoading}
                          className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg font-semibold disabled:opacity-60">Yes</button>
                        <button type="button" onClick={() => setConfirmDel(null)}
                          className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold">No</button>
                      </div>
                    )}
                  </div>
                )
              })}
              {filtered.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">
                  {search || roleFilter ? 'No team members match your filters' : 'No team members yet — click Add User to get started'}
                </div>
              )}
            </div>
          </div>

          {/* ── Edit Drawer (right side) ─────────────────────────────────── */}
          {editMember && (
            <>
              <div className="sm:hidden fixed inset-0 bg-black/30 z-40" onClick={closeEdit} />
              <div className={`fixed sm:relative right-0 top-0 sm:top-auto h-full bg-white border-l border-gray-200 z-50 sm:z-auto overflow-y-auto`}
                style={{width: 380, minWidth: 380, maxWidth: '100vw'}}>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-base font-bold text-gray-800">Edit Team Member</h2>
                    <button onClick={closeEdit} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Avatar */}
                  <div className="flex flex-col items-center mb-6">
                    <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                      <img src={getAvatarUrl(editMember)}
                        className="w-20 h-20 rounded-full bg-gray-100 border-2 border-gray-200 object-cover" />
                      <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      {avatarUploading && (
                        <div className="absolute inset-0 rounded-full bg-white/80 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                      onChange={handleAvatarUpload} />
                    <div className="text-xs text-gray-400 mt-2">Click to upload photo</div>
                  </div>

                  {/* Name */}
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1.5">Name</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
                  </div>

                  {/* Email (read-only) */}
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1.5">Email</label>
                    <div className="w-full border border-gray-100 rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50">{editMember.email}</div>
                  </div>

                  {/* Designation */}
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1.5">Designation</label>
                    <select value={editDesignation} onChange={e => setEditDesignation(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 bg-white">
                      <option value="">No Designation</option>
                      {designations.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>

                  {/* Location */}
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1.5">Location</label>
                    <select value={editStoreId} onChange={e => setEditStoreId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 bg-white">
                      <option value="">No Location</option>
                      {locations.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.name}{l.location_type === 'office' ? ' · Office' : l.location_type === 'warehouse' ? ' · Warehouse' : l.location_type === 'online' ? ' · Online' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] text-gray-400 mt-1">Where the member primarily works from. Used by POS and asset tracking.</div>
                  </div>

                  {/* Role */}
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-1.5">Role</label>
                    <select value={editRole} onChange={e => handleEditRoleChange(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 bg-white">
                      <option value="admin">Admin</option>
                      <option value="staff">Staff</option>
                    </select>
                  </div>

                  {/* Tab access */}
                  <div className="mb-6">
                    <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-2">Tab Access</label>
                    {isLockedRole(editRole) ? (
                      <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-400">
                        {getRoleLabel(editRole)} always has full access to all {ALL_TABS.length} tabs
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {ALL_TABS.map(tab => {
                          const on = editTabs.includes(tab)
                          return (
                            <button key={tab} type="button" onClick={() => toggleEditTab(tab)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${on ? 'btn-gold border-transparent' : 'border-gray-200 text-gray-400 bg-gray-50 hover:border-gray-300'}`}>
                              {TAB_LABELS[tab]}{on && <span className="ml-1.5 opacity-70">✓</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mb-6">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={editStylistInbox} onChange={e => setEditStylistInbox(e.target.checked)} className="mt-0.5" />
                      <span>
                        <span className="text-xs text-gray-700 font-semibold">Stylist inbox</span>
                        <span className="block text-[11px] text-gray-400 mt-0.5">Lets this person claim app AI chats after a shopper taps Talk to a stylist. Admins and stylist roles already have API access.</span>
                      </span>
                    </label>
                  </div>

                  {/* SOP */}
                  <SopEditor memberId={editMember.id} actorName={typeof window !== 'undefined' ? window._currentUserName : null} />

                  {/* Password reset — admins / founders (enforced by edge function) */}
                  <div className="mb-6 mt-4 p-3 rounded-lg border border-gray-100 bg-gray-50/50">
                    <label className="text-xs text-gray-500 font-semibold uppercase tracking-wide block mb-2">Password</label>
                    <div className="flex flex-wrap gap-2 items-center">
                      <input type="text" value={pwCustom} onChange={e => setPwCustom(e.target.value)} placeholder="New password (optional)"
                        className="flex-1 min-w-[150px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200" />
                      <button type="button" disabled={pwBusy} onClick={() => handleResetPassword('set')}
                        className="btn-gold px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-60">{pwBusy ? '…' : 'Set password'}</button>
                      <button type="button" disabled={pwBusy} onClick={() => handleResetPassword('email')}
                        className="px-3 py-2 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200">Send reset email</button>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1">Leave blank to auto-generate a temporary password. Share it securely and ask them to change it after logging in.</div>
                    {pwResult?.password && (
                      <div className="mt-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                        <div className="text-sm"><span className="text-emerald-700 font-semibold">New password: </span><span className="font-mono select-all">{pwResult.password}</span></div>
                        <button type="button" onClick={() => { try { navigator.clipboard.writeText(pwResult.password) } catch {} }} className="text-xs font-semibold text-emerald-700 flex-shrink-0">Copy</button>
                      </div>
                    )}
                    {pwResult?.emailed && <div className="mt-2 text-xs text-emerald-700">Recovery link generated. The reset email is sent if email is configured in Supabase; otherwise use "Set password".</div>}
                    {pwResult?.error && <div className="mt-2 text-xs text-red-600">{pwResult.error}</div>}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button type="button" onClick={handleSaveEdit} disabled={editSaving}
                      className="btn-gold px-5 py-2.5 rounded-lg text-sm font-semibold flex-1 disabled:opacity-60">
                      {editSaving ? 'Saving…' : 'Save Changes'}
                    </button>
                    <button type="button" onClick={closeEdit}
                      className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
                      Cancel
                    </button>
                  </div>

                  {/* Active / inactive — keeps history, never deletes */}
                  <div className="mt-4 flex items-center justify-between p-3 rounded-lg border border-gray-100 bg-gray-50/50">
                    <div>
                      <div className="text-sm font-semibold text-gray-700">{editMember.is_active === false ? 'Inactive member' : 'Active member'}</div>
                      <div className="text-xs text-gray-400">Deactivating keeps all their history; they just can't be assigned new work.</div>
                    </div>
                    <button type="button" onClick={() => toggleActive(editMember)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
                      style={{ border: '1px solid #e5e7eb', color: editMember.is_active === false ? '#059669' : '#b45309', background: '#fff' }}>
                      {editMember.is_active === false ? 'Reactivate' : 'Deactivate'}
                    </button>
                  </div>

                  {/* Delete from drawer */}
                  {!isLockedRole(editMember.role) && (
                    <div className="mt-6 pt-4 border-t border-gray-100">
                      {confirmDel === editMember.user_id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-500 font-medium flex-1">Permanently remove this member?</span>
                          <button type="button" onClick={() => handleDelete(editMember)} disabled={delLoading}
                            className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg font-semibold disabled:opacity-60">Yes, Remove</button>
                          <button type="button" onClick={() => setConfirmDel(null)}
                            className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold">Cancel</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmDel(editMember.user_id)}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors">
                          Remove this member…
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default UsersTab

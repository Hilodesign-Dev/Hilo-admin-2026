/* ═══════════════════════════════════════════════════════════════════════════
   TASKS — Premium Operations Framework (faithful port of Stitch design)
   Self-contained palette/typography (Manrope/Inter + Material Symbols).
   Inline status-complete + reassign. ═══════════════════════════════════════ */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import SourcingView from './sourcing/SourcingView'
import { createPortal } from 'react-dom'
import { supa } from '../../lib/supabase'
import { toast } from '../../lib/designTokens'

const FH = 'Manrope, system-ui, sans-serif'
const P = {
  surface: '#faf9f5', white: '#ffffff', cLow: '#f4f4f0', cMed: '#efeeea', cHigh: '#e9e8e4',
  onSurface: '#1b1c1a', onVar: '#454743', outline: '#767872', outlineVar: '#c6c7c1',
  brass: '#745b00', brassC: '#ffd65f', onBrass: '#ffffff', error: '#ba1a1a', errorC: '#ffdad6',
  tertFixed: '#e8e1e0', tertVar: '#4a4646', green: '#15803d', greenC: '#dcfce7',
}
const Sym = ({ i, s = 20, c, style, cls = '' }) => <span className={'material-symbols-outlined ' + cls} style={{ fontSize: s, color: c, verticalAlign: 'middle', ...style }}>{i}</span>

const STATUSES = [
  { key: 'todo',        label: 'To Do',       bg: 'rgba(118,120,114,0.12)', color: '#767872' },
  { key: 'in_progress', label: 'In Progress', bg: 'rgba(255,214,95,0.30)',  color: '#745b00' },
  { key: 'blocked',     label: 'Blocked',     bg: '#ffdad6',                color: '#ba1a1a' },
  { key: 'submitted',   label: 'Submitted',   bg: '#e8e1e0',                color: '#4a4646' },
  { key: 'approved',    label: 'Approved',    bg: '#dcfce7',                color: '#15803d' },
]
const SMAP = Object.fromEntries(STATUSES.map(s => [s.key, s]))
const PRIORITIES = [
  { key: 'low', label: 'Low', color: '#9ca3af' }, { key: 'normal', label: 'Normal', color: '#767872' },
  { key: 'high', label: 'High', color: '#745b00' }, { key: 'urgent', label: 'Urgent', color: '#ba1a1a' },
]
const PMAP = Object.fromEntries(PRIORITIES.map(p => [p.key, p]))
const PRIO_DISPLAY = {
  low: { label: 'LOW', color: '#6b7280', bg: 'rgba(107,114,128,0.14)' },
  normal: { label: 'MEDIUM', color: '#a16207', bg: 'rgba(161,98,7,0.14)' },
  high: { label: 'HIGH', color: '#b45309', bg: 'rgba(180,83,9,0.16)' },
  urgent: { label: 'URGENT', color: '#ba1a1a', bg: 'rgba(186,26,26,0.14)' },
}

const meInfo = () => {
  const id = window._currentTeamMemberId ? Number(window._currentTeamMemberId) : null
  const role = window._currentUserRole || ''
  return { id, role, name: window._currentUserName || 'Me', isFounder: role === 'admin' || role === 'founder' }
}
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
const isOverdue = (d, s) => d && s !== 'approved' && new Date(d) < new Date(new Date().toDateString())
const initials = (n) => (n || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

const StatusPill = ({ s }) => { const x = SMAP[s] || SMAP.todo; return <span style={{ background: x.bg, color: x.color, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', fontFamily: 'Inter' }}>{x.label}</span> }
const Avatar = ({ name, size = 24 }) => <span style={{ width: size, height: size, borderRadius: 999, background: P.brassC, color: P.brass, fontSize: size * 0.4, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'Inter' }}>{initials(name)}</span>

function Popover({ trigger, children, align = 'left', width = 200 }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const openMenu = (e) => { e.stopPropagation(); const r = ref.current?.getBoundingClientRect(); if (!r) return
    const left = align === 'right' ? Math.max(8, r.right - width) : Math.min(r.left, window.innerWidth - width - 8)
    const below = window.innerHeight - r.bottom
    const top = below < 280 && r.top > 280 ? r.top - 4 - Math.min(300, 280) : r.bottom + 4
    setPos({ top, left }); setOpen(true) }
  return (
    <span ref={ref} style={{ display: 'inline-flex' }}>
      <span onClick={openMenu} style={{ cursor: 'pointer', display: 'inline-flex' }}>{trigger}</span>
      {open && pos && createPortal(<>
        <div onClick={e => { e.stopPropagation(); setOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
        <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1001, background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', width, maxHeight: 300, overflowY: 'auto' }}>
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      </>, document.body)}
    </span>
  )
}
const MenuItem = ({ children, onClick }) => <div onClick={onClick} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer" style={{ color: P.onSurface }} onMouseEnter={e => e.currentTarget.style.background = P.cLow} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{children}</div>

const SOP_CADENCES = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['always', 'Always'], ['adhoc', 'Ad-hoc']]
const _sopUid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'i' + Date.now() + Math.random().toString(16).slice(2))
function SopEditor({ memberId, actorName, onSaved }) {
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
    setSaving(false); if (error) { toast(false, 'Save failed') } else { setItems(clean); setSaved(true); setTimeout(() => setSaved(false), 1500); onSaved && onSaved(clean.length) }
  }
  const inp = { fontSize: 14, padding: '8px 10px', borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: P.white, outline: 'none' }
  return (
    <div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={it.id || i} className="flex items-center gap-2">
            <select value={it.cadence || 'daily'} onChange={e => upd(i, { cadence: e.target.value })} style={{ ...inp, width: 110, padding: '8px' }}>{SOP_CADENCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input value={it.text || ''} onChange={e => upd(i, { text: e.target.value })} placeholder="e.g. Reconcile POS payments" className="flex-1" style={inp} />
            <button onClick={() => del(i)} style={{ color: P.outline, fontSize: 20, lineHeight: 1, padding: '0 4px' }}>&times;</button>
          </div>
        ))}
        {!items.length && <div style={{ fontSize: 13, color: P.outline, padding: '4px 0' }}>No SOP yet — add the responsibilities this person should follow.</div>}
      </div>
      <button onClick={add} style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: P.brass }}>+ Add responsibility</button>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Notes / context (optional)" className="w-full" style={{ ...inp, marginTop: 12, resize: 'vertical' }} />
      <div className="flex items-center gap-2 mt-2">
        <button onClick={save} disabled={saving} style={{ fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8, background: P.brass, color: '#fff', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save SOP'}</button>
        {saved && <span style={{ fontSize: 12, fontWeight: 600, color: P.green }}>Saved ✓</span>}
      </div>
    </div>
  )
}

const StatusMenu = ({ task, onChange }) => (
  <Popover width={170} trigger={<StatusPill s={task.status} />}>
    {(close) => STATUSES.map(s => <MenuItem key={s.key} onClick={() => { onChange(s.key); close() }}><span style={{ width: 8, height: 8, borderRadius: 999, background: s.color, display: 'inline-block' }} />{s.label}</MenuItem>)}
  </Popover>
)
const PriorityTag = ({ task, onChange }) => {
  const d = PRIO_DISPLAY[task.priority] || PRIO_DISPLAY.normal
  return (
    <Popover width={150} trigger={<span title="Change priority" style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: d.bg, color: d.color, whiteSpace: 'nowrap', cursor: 'pointer' }}>{d.label}</span>}>
      {(close) => [['high', 'HIGH'], ['normal', 'MEDIUM'], ['low', 'LOW']].map(([k, l]) => <MenuItem key={k} onClick={() => { onChange(k); close() }}><span style={{ width: 8, height: 8, borderRadius: 999, background: PRIO_DISPLAY[k].color, display: 'inline-block' }} />{l}</MenuItem>)}
    </Popover>
  )
}
const AssigneeMenu = ({ task, members, onChange }) => {
  const cur = members.find(m => m.id === task.assignee_id)
  return (
    <Popover width={220} trigger={<span className="flex items-center gap-1.5" title="Reassign">{cur ? <><Avatar name={cur.name} size={22} /><span className="text-xs truncate" style={{ color: P.onVar, maxWidth: 80 }}>{cur.name}</span></> : <span className="text-xs" style={{ color: P.outline }}>Unassigned</span>}<Sym i="expand_more" s={14} c={P.outline} /></span>}>
      {(close) => <div>
        <MenuItem onClick={() => { onChange(null); close() }}><span style={{ width: 22 }} />Unassigned</MenuItem>
        {members.filter(m => m.is_active !== false).map(m => <MenuItem key={m.id} onClick={() => { onChange(m.id); close() }}><Avatar name={m.name} size={22} />{m.name}</MenuItem>)}
      </div>}
    </Popover>
  )
}

/* ── Checklist editor (shared) ── */
function Checklist({ items, onChange }) {
  const list = Array.isArray(items) ? items : []
  const upd = (i, patch) => onChange(list.map((x, idx) => idx === i ? { ...x, ...patch } : x))
  return (
    <div className="space-y-2">
      {list.map((it, i) => (
        <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: P.cLow, border: `1px solid ${P.outlineVar}` }}>
          <button type="button" onClick={() => upd(i, { done: !it.done })}><Sym i={it.done ? 'check_box' : 'check_box_outline_blank'} s={20} c={it.done ? P.brass : P.outline} /></button>
          <input value={it.text} onChange={e => upd(i, { text: e.target.value })} placeholder="Sub-task…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: P.onSurface, textDecoration: it.done ? 'line-through' : 'none' }} />
          <button type="button" onClick={() => onChange(list.filter((_, idx) => idx !== i))} style={{ opacity: 0.5 }}><Sym i="delete" s={18} c={P.onVar} /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, { text: '', done: false }])} className="flex items-center gap-2 w-full p-2.5 rounded-lg" style={{ border: `1px dashed ${P.outlineVar}`, color: P.onVar, fontSize: 14, fontStyle: 'italic' }}><Sym i="add" s={18} c={P.outline} />Add another sub-task…</button>
    </div>
  )
}

const FLbl = ({ children }) => <label style={{ fontSize: 12, fontWeight: 500, color: P.onVar, display: 'block', marginBottom: 6 }}>{children}</label>
const FINP = { width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: P.white, outline: 'none', fontFamily: 'Inter' }
const PrioritySeg = ({ value, onChange }) => (
  <div className="grid grid-cols-4 gap-1 p-1 rounded-lg" style={{ background: P.cHigh, border: `1px solid ${P.outlineVar}` }}>
    {PRIORITIES.map(p => <button key={p.key} type="button" onClick={() => onChange(p.key)} style={{ padding: '7px 0', fontSize: 10, fontWeight: 700, borderRadius: 6, textTransform: 'uppercase', background: value === p.key ? P.white : 'transparent', color: value === p.key ? P.onSurface : P.onVar }}>{p.label.slice(0, 4)}</button>)}
  </div>
)

/* ── New Task modal (two-column, with checklist) ── */
function NewTaskModal({ departments, members, my, defaultDept, onClose, onCreated }) {
  const [f, setF] = useState({ title: '', description: '', department_id: defaultDept || '', assignee_id: '', priority: 'normal', due_date: '', linked_type: '', linked_id: '', checklist: [] })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const save = async () => {
    if (!f.title.trim()) return toast(false, 'Title is required')
    if (!f.department_id) return toast(false, 'Pick a department')
    setBusy(true)
    try {
      const cl = (f.checklist || []).filter(x => x.text && x.text.trim()).map(x => ({ text: x.text.trim(), done: !!x.done }))
      const mkNum = (v) => { const nn = Number(v); return Number.isFinite(nn) ? nn : null }
      const { data, error } = await supa.from('tasks').insert([{ title: f.title.trim(), description: f.description || null, department_id: f.department_id || null, assignee_id: f.assignee_id ? mkNum(f.assignee_id) : null, created_by: mkNum(my.id), status: 'todo', priority: f.priority, due_date: f.due_date || null, linked_type: f.linked_type || null, linked_id: f.linked_id || null, checklist: cl }]).select().single()
      if (error) throw error
      try { await supa.from('task_activity').insert([{ task_id: data.id, author_id: mkNum(my.id), type: 'created', body: 'created this task' }]) } catch (ae) { /* activity log is best-effort */ }
      toast(true, 'Task created'); onCreated(); onClose()
    } catch (e) { toast(false, 'Failed: ' + (e.message || e)) } finally { setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(27,28,26,0.20)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-3xl flex flex-col" style={{ background: P.white, border: '1px solid #d1cdc2', borderRadius: 14, maxHeight: '92vh', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${P.outlineVar}` }}>
          <h2 style={{ fontFamily: FH, fontSize: 20, fontWeight: 700, color: P.onSurface }}>New task</h2>
          <button onClick={onClose} style={{ color: P.onVar }}><Sym i="close" s={22} /></button>
        </header>
        <div className="flex-1 overflow-y-auto flex flex-col md:flex-row" style={{ minHeight: 0 }}>
          <div className="flex-[1.5] p-6 space-y-5" style={{ borderRight: `1px solid ${P.outlineVar}` }}>
            <div><FLbl>Task title</FLbl><input autoFocus value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Final fitting for J. Doe" style={{ ...FINP, fontSize: 16 }} /></div>
            <div><FLbl>Description</FLbl><textarea rows={5} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Provide detailed instructions for the team…" style={{ ...FINP, resize: 'vertical' }} /></div>
            <div><FLbl>Checklist</FLbl><Checklist items={f.checklist} onChange={v => set('checklist', v)} /></div>
          </div>
          <aside className="flex-1 p-6 space-y-5" style={{ background: P.cLow }}>
            <div><FLbl>Department</FLbl><select value={f.department_id} onChange={e => set('department_id', e.target.value)} style={FINP}><option value="">—</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <div><FLbl>Assignee</FLbl><select value={f.assignee_id} onChange={e => set('assignee_id', e.target.value)} style={FINP}><option value="">— Unassigned —</option>{members.filter(m => m.is_active !== false).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div><FLbl>Due date</FLbl><input type="date" value={f.due_date} onChange={e => set('due_date', e.target.value)} style={FINP} /></div>
            <div><FLbl>Priority</FLbl><PrioritySeg value={f.priority} onChange={v => set('priority', v)} /></div>
            <div><FLbl>Link record</FLbl><div className="flex gap-2"><select value={f.linked_type} onChange={e => set('linked_type', e.target.value)} style={{ ...FINP, width: '42%' }}><option value="">none</option><option value="order">Order</option><option value="lead">Lead</option><option value="fabric">Fabric</option><option value="product">Product</option></select><input value={f.linked_id} onChange={e => set('linked_id', e.target.value)} placeholder="ref…" style={{ ...FINP, flex: 1 }} /></div></div>
          </aside>
        </div>
        <footer className="flex justify-end gap-2 px-6 py-4" style={{ borderTop: `1px solid ${P.outlineVar}`, background: P.cMed }}>
          <button onClick={onClose} style={{ padding: '10px 18px', fontSize: 14, fontWeight: 600, color: P.onVar }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ padding: '10px 24px', fontSize: 14, fontWeight: 600, borderRadius: 8, background: P.brass, color: P.onBrass }}>{busy ? 'Creating…' : 'Create & assign'}</button>
        </footer>
      </div>
    </div>
  )
}

/* ── Task detail drawer (fully editable except created-by) ── */
function TaskDetail({ task, departments, members, memberMap, my, canApprove, onClose, onChanged }) {
  const [act, setAct] = useState([]); const [comment, setComment] = useState(''); const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState(task.title || '')
  const [desc, setDesc] = useState(task.description || '')
  const [cl, setCl] = useState(Array.isArray(task.checklist) ? task.checklist : [])
  const [saveState, setSaveState] = useState('')
  const [showLog, setShowLog] = useState(false)
  const dept = departments.find(d => d.id === task.department_id)
  const loadAct = useCallback(() => supa.from('task_activity').select('*').eq('task_id', task.id).order('created_at').then(({ data }) => setAct(data || [])), [task.id])
  useEffect(() => { loadAct() }, [loadAct])
  const apply = async (patch, body) => { setBusy(true); try { await supa.from('tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', task.id); if (body) await supa.from('task_activity').insert([{ task_id: task.id, author_id: my.id, type: 'status', body }]); loadAct(); onChanged() } catch (e) { toast(false, 'Failed') } finally { setBusy(false) } }
  // Debounced auto-save for the free-text fields (title / description / checklist)
  const autosave = (patch) => { setSaveState('saving'); supa.from('tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', task.id).then(({ error }) => { if (error) { setSaveState(''); toast(false, 'Save failed') } else { setSaveState('saved'); onChanged(); setTimeout(() => setSaveState(x => x === 'saved' ? '' : x), 1500) } }) }
  const f1 = useRef(true); useEffect(() => { if (f1.current) { f1.current = false; return } const id = setTimeout(() => { if ((title || '') !== (task.title || '')) autosave({ title: (title.trim() || 'Untitled') }) }, 600); return () => clearTimeout(id) }, [title])
  const f2 = useRef(true); useEffect(() => { if (f2.current) { f2.current = false; return } const id = setTimeout(() => { if ((desc || '') !== (task.description || '')) autosave({ description: desc || null }) }, 600); return () => clearTimeout(id) }, [desc])
  const f3 = useRef(true); useEffect(() => { if (f3.current) { f3.current = false; return } const id = setTimeout(() => autosave({ checklist: cl }), 600); return () => clearTimeout(id) }, [cl])
  const setStatus = (s) => apply({ status: s, ...(s === 'approved' ? { approved_by: my.id, approved_at: new Date().toISOString(), completed_at: new Date().toISOString() } : {}) }, 'moved to ' + SMAP[s].label)
  const reassign = (id) => apply({ assignee_id: id }, id ? 'reassigned to ' + (memberMap[id] || '#' + id) : 'unassigned')
  const submit = () => apply({ status: 'submitted' }, 'submitted for approval')
  const approve = () => setStatus('approved')
  const reject = () => { const n = window.prompt('Reason (optional):') || ''; apply({ status: 'in_progress' }, 'rejected' + (n ? ': ' + n : '')) }
  const addComment = async () => { if (!comment.trim()) return; await supa.from('task_activity').insert([{ task_id: task.id, author_id: my.id, type: 'comment', body: comment.trim() }]); setComment(''); loadAct() }
  const Prop = ({ icon, label, children }) => <div className="flex items-center gap-3 py-2" style={{ fontSize: 14 }}><span className="flex items-center gap-1.5 flex-shrink-0" style={{ width: 110, color: P.onVar }}><Sym i={icon} s={18} c={P.outline} />{label}</span><span className="flex-1 min-w-0" style={{ color: P.onSurface }}>{children}</span></div>
  const done = cl.filter(c => c.done).length
  const comments = act.filter(a => a.type === 'comment')
  const logs = act.filter(a => a.type !== 'comment')
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(27,28,26,0.18)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="h-full w-full max-w-lg overflow-y-auto" style={{ background: P.surface, borderLeft: '1px solid #d1cdc2' }} onClick={e => e.stopPropagation()}>
        <div className="px-5 sm:px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <StatusMenu task={task} onChange={setStatus} />
            <div className="flex items-center gap-3">
              {saveState && <span style={{ fontSize: 11, color: saveState === 'saved' ? P.green : P.onVar }}>{saveState === 'saving' ? 'Saving…' : 'Saved ✓'}</span>}
              <button onClick={onClose} style={{ color: P.outline }}><Sym i="close" s={22} /></button>
            </div>
          </div>
          <textarea value={title} onChange={e => setTitle(e.target.value)} rows={1} style={{ fontFamily: FH, fontSize: 22, fontWeight: 500, color: P.onSurface, lineHeight: 1.25, marginBottom: 16, width: '100%', border: 'none', background: 'transparent', outline: 'none', resize: 'none' }} />
          {task.status !== 'approved' && task.status !== 'submitted' && <button onClick={submit} disabled={busy} className="w-full mb-2 flex items-center justify-center gap-2" style={{ padding: '11px', fontSize: 14, fontWeight: 600, borderRadius: 8, background: P.brass, color: P.onBrass }}><Sym i="check_circle" s={18} c="#fff" />Submit for approval</button>}
          {canApprove && task.status === 'submitted' && <div className="flex gap-2 mb-2"><button onClick={approve} disabled={busy} className="flex-1" style={{ padding: '11px', fontSize: 14, fontWeight: 600, borderRadius: 8, background: P.green, color: '#fff' }}>Approve</button><button onClick={reject} disabled={busy} className="flex-1" style={{ padding: '11px', fontSize: 14, fontWeight: 600, borderRadius: 8, border: '1px solid #fecaca', color: P.error }}>Reject</button></div>}
          <div className="flex gap-2 mb-4">
            {task.status !== 'in_progress' && task.status !== 'approved' && <button onClick={() => setStatus('in_progress')} style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: `1px solid ${P.outlineVar}`, color: P.brass }}>Start</button>}
            {task.status !== 'blocked' && task.status !== 'approved' && <button onClick={() => setStatus('blocked')} style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: `1px solid ${P.outlineVar}`, color: P.error }}>Block</button>}
          </div>
          <div style={{ borderTop: `1px solid ${P.outlineVar}`, paddingTop: 8 }}>
            <Prop icon="domain" label="Department"><select value={task.department_id || ''} onChange={e => apply({ department_id: e.target.value }, 'moved department')} style={{ ...FINP, padding: '6px 8px' }}>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Prop>
            <Prop icon="person" label="Assignee"><AssigneeMenu task={task} members={members} onChange={reassign} /></Prop>
            <Prop icon="event" label="Due date"><input type="date" value={task.due_date || ''} onChange={e => apply({ due_date: e.target.value || null })} style={{ ...FINP, padding: '6px 8px', width: 'auto' }} /></Prop>
            <Prop icon="flag" label="Priority"><PrioritySeg value={task.priority} onChange={v => apply({ priority: v })} /></Prop>
            <Prop icon="link" label="Link"><span className="flex gap-2 w-full"><select value={task.linked_type || ''} onChange={e => apply({ linked_type: e.target.value || null })} style={{ ...FINP, padding: '6px 8px', width: '42%' }}><option value="">none</option><option value="order">Order</option><option value="lead">Lead</option><option value="fabric">Fabric</option><option value="product">Product</option></select><input defaultValue={task.linked_id || ''} onBlur={e => e.target.value !== (task.linked_id || '') && apply({ linked_id: e.target.value || null })} placeholder="ref…" style={{ ...FINP, padding: '6px 8px', flex: 1 }} /></span></Prop>
            <Prop icon="badge" label="Created by">{memberMap[task.created_by] || '—'}</Prop>
          </div>
          <div style={{ marginTop: 14 }}><FLbl>Description</FLbl><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} placeholder="Add a description…" style={{ ...FINP, resize: 'vertical' }} /></div>
          <div style={{ marginTop: 14 }}><div className="flex items-center justify-between mb-1.5"><FLbl>Checklist {cl.length ? `(${done}/${cl.length})` : ''}</FLbl></div><Checklist items={cl} onChange={setCl} /></div>

          <div style={{ fontSize: 13, fontWeight: 700, color: P.onSurface, margin: '22px 0 10px' }}>Comments {comments.length ? `(${comments.length})` : ''}</div>
          <div className="flex gap-2 mb-4"><input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()} placeholder="Write a comment…" style={{ flex: 1, padding: '10px 12px', fontSize: 14, borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: P.white }} /><button onClick={addComment} style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600, borderRadius: 8, background: P.brass, color: '#fff' }}>Post</button></div>
          <div className="space-y-3 mb-5">
            {comments.length === 0 ? <div style={{ fontSize: 13, color: P.outline }}>No comments yet.</div> : comments.map(a => <div key={a.id} className="flex items-start gap-2" style={{ fontSize: 14 }}><Avatar name={memberMap[a.author_id]} size={24} /><div><div><span style={{ fontWeight: 600, color: P.onSurface }}>{memberMap[a.author_id] || 'Someone'}</span> <span style={{ fontSize: 10, color: P.outline }}>{new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div><div style={{ color: P.onSurface }}>{a.body}</div></div></div>)}
          </div>

          <button onClick={() => setShowLog(v => !v)} className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: P.onVar }}><Sym i={showLog ? 'expand_less' : 'expand_more'} s={18} c={P.outline} />Activity log {logs.length ? `(${logs.length})` : ''}</button>
          {showLog && <div className="space-y-2 mt-3">
            {logs.map(a => <div key={a.id} className="flex items-start gap-2" style={{ fontSize: 13 }}><Avatar name={memberMap[a.author_id]} size={20} /><div><span style={{ fontWeight: 600, color: P.onSurface }}>{memberMap[a.author_id] || 'Someone'}</span> <span style={{ color: P.onVar }}>{a.body}</span><div style={{ fontSize: 10, color: P.outline }}>{new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div></div>)}
          </div>}
        </div>
      </div>
    </div>
  )
}

/* ── Main ── */
export const TasksTab = () => {
  const my = useMemo(meInfo, [])
  const [view, setView] = useState('mytasks')
  const [departments, setDepartments] = useState([])
  const [memberships, setMemberships] = useState([])
  const [members, setMembers] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeDept, setActiveDept] = useState(null)
  const [boardMode, setBoardMode] = useState('list')
  const [deptAssignee, setDeptAssignee] = useState('')   // '' = all | '__unassigned__' | member id — persists across dept switches
  const [archDept, setArchDept] = useState('')            // '' = all departments
  const [selected, setSelected] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [collapsed, setCollapsed] = useState(new Set())
  const [selectedMember, setSelectedMember] = useState(null)
  const [peopleSearch, setPeopleSearch] = useState('')
  const [peopleMode, setPeopleMode] = useState('list')
  const [mySop, setMySop] = useState(null)
  const [sopOpen, setSopOpen] = useState(false)
  const [sopAckToday, setSopAckToday] = useState(false)
  const [search, setSearch] = useState('')

  const loadAll = useCallback(async () => {
    const [{ data: dep }, { data: mem }, { data: tm }, { data: tk }] = await Promise.all([
      supa.from('departments').select('*').eq('is_active', true).order('sort_order'),
      supa.from('team_member_departments').select('*'),
      supa.from('team_members').select('id, name, role, is_active, designation'),
      supa.from('tasks').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }).limit(3000),
    ])
    setDepartments(dep || []); setMemberships(mem || []); setMembers(tm || []); setTasks(tk || []); setLoading(false)
  }, [])
  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => {
    if (!my.id) return
    supa.from('member_sops').select('*').eq('team_member_id', my.id).maybeSingle().then(({ data }) => setMySop(data || null))
    const today = new Date().toISOString().slice(0, 10)
    supa.from('sop_acknowledgements').select('id').eq('team_member_id', my.id).eq('acknowledged_on', today).maybeSingle().then(({ data }) => setSopAckToday(!!data))
  }, [my.id])
  const ackSop = async () => { const today = new Date().toISOString().slice(0, 10); const { error } = await supa.from('sop_acknowledgements').upsert({ team_member_id: my.id, acknowledged_on: today }, { onConflict: 'team_member_id,acknowledged_on' }); if (!error) setSopAckToday(true) }
  const SOP_CAD = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', always: 'Always', adhoc: 'Ad-hoc' }
  const SOP_CAD_ORDER = ['always', 'daily', 'weekly', 'monthly', 'adhoc']

  const memberMap = useMemo(() => Object.fromEntries(members.map(m => [m.id, m.name])), [members])
  const deptMap = useMemo(() => Object.fromEntries(departments.map(d => [d.id, d])), [departments])
  const myDeptIds = useMemo(() => memberships.filter(m => m.team_member_id === my.id).map(m => m.department_id), [memberships, my.id])
  const myHeadIds = useMemo(() => memberships.filter(m => m.team_member_id === my.id && m.role === 'head').map(m => m.department_id), [memberships, my.id])
  const canApprove = (d) => my.isFounder || myHeadIds.includes(d)
  const deptTabs = my.isFounder ? departments : departments.filter(d => myDeptIds.includes(d.id))
  useEffect(() => { if (!activeDept && deptTabs.length) setActiveDept(deptTabs[0].id) }, [deptTabs, activeDept])
  const myTasks = useMemo(() => tasks.filter(t => t.assignee_id === my.id), [tasks, my.id])
  const approvalsQueue = useMemo(() => tasks.filter(t => t.status === 'submitted' && (my.isFounder || myHeadIds.includes(t.department_id))), [tasks, my.isFounder, myHeadIds])

  const patchTask = async (id, patch, body) => {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t))
    await supa.from('tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (body) await supa.from('task_activity').insert([{ task_id: id, author_id: my.id, type: 'status', body }])
  }
  const quickStatus = (t, s) => patchTask(t.id, { status: s, ...(s === 'approved' ? { approved_by: my.id, approved_at: new Date().toISOString(), completed_at: new Date().toISOString() } : {}) }, 'moved to ' + SMAP[s].label)
  const quickAssign = (t, id) => patchTask(t.id, { assignee_id: id }, id ? 'reassigned to ' + (memberMap[id] || '#' + id) : 'unassigned')
  const quickPriority = (t, v) => patchTask(t.id, { priority: v }, 'priority → ' + v)
  const quickComplete = (t) => quickStatus(t, canApprove(t.department_id) ? 'approved' : 'submitted')
  const renameTask = (t, title) => patchTask(t.id, { title }, 'renamed to ' + title)
  const restoreTask = (t) => patchTask(t.id, { status: 'todo', approved_by: null, approved_at: null, completed_at: null }, 'restored from archive')
  const [newTitle, setNewTitle] = useState('')
  const dragRef = useRef(null)
  const addInline = async (deptId) => {
    const ti = newTitle.trim(); if (!ti || !deptId) return
    const _cb = Number.isFinite(Number(my.id)) ? Number(my.id) : null
    const { data, error } = await supa.from('tasks').insert([{ title: ti, department_id: deptId || null, created_by: _cb, status: 'todo', priority: 'normal', sort_order: 0 }]).select().single()
    if (error) { toast(false, 'Failed: ' + (error.message || error)); return }
    if (data) { try { await supa.from('task_activity').insert([{ task_id: data.id, author_id: _cb, type: 'created', body: 'created this task' }]) } catch (ae) {} setNewTitle(''); loadAll() }
  }
  const reorderInDept = async (deptId, fromId, toId) => {
    if (!fromId || fromId === toId) return
    const list = tasks.filter(t => t.department_id === deptId).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const fi = list.findIndex(t => t.id === fromId), ti = list.findIndex(t => t.id === toId)
    if (fi < 0 || ti < 0) return
    const arr = list.slice(); const [moved] = arr.splice(fi, 1); arr.splice(ti, 0, moved)
    const ups = arr.map((t, i) => ({ id: t.id, sort_order: i + 1 }))
    setTasks(ts => ts.map(t => { const u = ups.find(x => x.id === t.id); return u ? { ...t, sort_order: u.sort_order } : t }))
    for (const u of ups) { await supa.from('tasks').update({ sort_order: u.sort_order }).eq('id', u.id) }
  }
  const moveTask = async (t, dir) => {
    const listD = tasks.filter(x => x.department_id === t.department_id && x.status !== 'approved').slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const idx = listD.findIndex(x => x.id === t.id); const j = idx + dir
    if (idx < 0 || j < 0 || j >= listD.length) return
    const arr = [...listD]; const [m] = arr.splice(idx, 1); arr.splice(j, 0, m)
    const ups = arr.map((x, i) => ({ id: x.id, sort_order: i + 1 }))
    setTasks(ts => ts.map(x => { const u = ups.find(y => y.id === x.id); return u ? { ...x, sort_order: u.sort_order } : x }))
    for (const u of ups) await supa.from('tasks').update({ sort_order: u.sort_order }).eq('id', u.id)
  }
  const listDrag = {
    onStart: (e, t) => { dragRef.current = t.id; e.dataTransfer.effectAllowed = 'move' },
    onOver: (e) => e.preventDefault(),
    onDrop: (e, t) => { e.preventDefault(); const from = dragRef.current; dragRef.current = null; if (from) reorderInDept(t.department_id, from, t.id) },
  }

  const canSeePeople = my.isFounder || myHeadIds.length > 0
  const NAV = [
    { id: 'mytasks', label: 'My Tasks', icon: 'assignment' },
    { id: 'myday', label: 'My Day', icon: 'today' },
    { id: 'departments', label: 'My Departments', icon: 'domain' },
    ...(canSeePeople ? [{ id: 'people', label: 'People', icon: 'group' }, { id: 'sops', label: 'SOPs', icon: 'menu_book' }] : []),
    { id: 'approvals', label: 'Needs Approval', icon: 'fact_check', badge: approvalsQueue.length },
    { id: 'archive', label: 'Archive', icon: 'inventory_2' },
    { id: 'sourcing', label: 'Sourcing', icon: 'travel_explore' },
    ...(my.isFounder ? [{ id: 'cockpit', label: 'Cockpit', icon: 'analytics' }] : []),
  ]
  const titleOf = { mytasks: 'My Tasks', myday: 'My Day', departments: 'My Departments', people: 'People', sops: 'SOPs', approvals: 'Needs Approval', archive: 'Archive', sourcing: 'Sourcing', cockpit: 'Founder Cockpit', team: 'Team', depts: 'Departments' }

  const matchSearch = (t) => !search || t.title.toLowerCase().includes(search.toLowerCase()) || (t.linked_id || '').toLowerCase().includes(search.toLowerCase())

  /* ── Task row (My Tasks / lists) ── */
  const TaskRow = ({ t, showDept, drag }) => {
    const od = isOverdue(t.due_date, t.status)
    const [editing, setEditing] = useState(false)
    const [val, setVal] = useState(t.title || '')
    const saveTitle = () => { setEditing(false); const nv = val.trim(); if (nv && nv !== t.title) renameTask(t, nv); else setVal(t.title || '') }
    return (
      <div onClick={() => { if (!editing) setSelected(t) }}
        draggable={drag ? true : undefined}
        onDragStart={drag ? (e) => drag.onStart(e, t) : undefined}
        onDragOver={drag ? drag.onOver : undefined}
        onDrop={drag ? (e) => drag.onDrop(e, t) : undefined}
        className="flex items-center px-6 py-3.5 cursor-pointer group" style={{ transition: 'background 0.15s', background: t.status === 'blocked' ? 'rgba(186,26,26,0.035)' : 'transparent' }} onMouseEnter={e => e.currentTarget.style.background = P.cLow} onMouseLeave={e => e.currentTarget.style.background = t.status === 'blocked' ? 'rgba(186,26,26,0.035)' : 'transparent'}>
        {drag && <span onClick={e => e.stopPropagation()} className="flex-shrink-0 mr-1 flex flex-col items-center" style={{ lineHeight: 0 }}>
          <button onClick={() => moveTask(t, -1)} title="Move up" style={{ padding: 0, margin: 0, border: 'none', background: 'transparent', cursor: 'pointer', height: 15 }}><Sym i="keyboard_arrow_up" s={16} c={P.outline} /></button>
          <button onClick={() => moveTask(t, 1)} title="Move down" style={{ padding: 0, margin: 0, border: 'none', background: 'transparent', cursor: 'pointer', height: 15 }}><Sym i="keyboard_arrow_down" s={16} c={P.outline} /></button>
        </span>}
        {drag && <span onClick={e => e.stopPropagation()} title="Drag to reorder" className="flex-shrink-0 mr-2 hidden sm:inline" style={{ cursor: 'grab', color: P.outlineVar }}><Sym i="drag_indicator" s={18} c={P.outlineVar} /></span>}
        <div onClick={e => { e.stopPropagation(); quickComplete(t) }} title="Mark complete" className="flex-shrink-0 mr-3" style={{ cursor: 'pointer' }}><Sym i={t.status === 'approved' ? 'check_circle' : 'radio_button_unchecked'} s={20} c={t.status === 'approved' ? P.green : P.outlineVar} /></div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input autoFocus value={val} onClick={e => e.stopPropagation()} onChange={e => setVal(e.target.value)} onBlur={saveTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setVal(t.title || ''); setEditing(false) } }}
              style={{ width: '100%', fontSize: 14, fontWeight: 500, padding: '4px 8px', borderRadius: 6, border: `1px solid ${P.gold}`, outline: 'none', background: P.white }} />
          ) : (
            <p className="truncate flex items-center" style={{ fontSize: 14, fontWeight: 500, color: t.status === 'blocked' ? P.error : P.onSurface }}>
              <span className="truncate">{t.title}</span>
              {(t.priority === 'urgent') && <Sym i="priority_high" s={14} c={P.error} style={{ marginLeft: 4 }} />}
              <span onClick={e => { e.stopPropagation(); setVal(t.title || ''); setEditing(true) }} title="Rename" className="opacity-0 group-hover:opacity-100 ml-2 flex-shrink-0" style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}><Sym i="edit" s={14} c={P.outline} /></span>
            </p>
          )}
        </div>
        <div className="flex-shrink-0 mx-4" onClick={e => e.stopPropagation()}><StatusMenu task={t} onChange={s => quickStatus(t, s)} /></div>
        <div className="flex items-center gap-5 flex-shrink-0">
          {(t.description || (t.checklist && t.checklist.length > 0)) && <span className="hidden sm:flex items-center gap-0.5" title="Has description / checklist"><Sym i="description" s={16} c={P.outline} />{t.checklist && t.checklist.length > 0 && <span style={{ fontSize: 10, color: P.onVar }}>{t.checklist.filter(c => c.done).length}/{t.checklist.length}</span>}</span>}
          {showDept && deptMap[t.department_id] && <span className="hidden md:inline-flex items-center gap-1.5" style={{ fontSize: 11, color: P.onVar }}><span style={{ width: 8, height: 8, borderRadius: 999, background: deptMap[t.department_id].color, display: 'inline-block' }} />{deptMap[t.department_id].name}</span>}
          {t.linked_id && <span style={{ fontSize: 11, fontWeight: 500, padding: '4px 8px', borderRadius: 6, background: P.cMed, color: P.onVar, border: `1px solid rgba(198,199,193,0.4)` }}>{t.linked_id}</span>}
          <div className="hidden sm:block" style={{ width: 128 }} onClick={e => e.stopPropagation()}><AssigneeMenu task={t} members={members} onChange={id => quickAssign(t, id)} /></div>
          <div onClick={e => e.stopPropagation()}><PriorityTag task={t} onChange={v => quickPriority(t, v)} /></div>
          <div style={{ width: 76, textAlign: 'right', fontSize: 11, fontWeight: od ? 700 : 500, color: od ? P.error : P.onVar }}>{od ? 'OVERDUE' : fmtDate(t.due_date)}</div>
        </div>
      </div>
    )
  }

  const Section = ({ did, list }) => {
    const open = !collapsed.has(did); const d = deptMap[did]
    return (
      <section style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 12, overflow: 'hidden' }}>
        <header onClick={() => setCollapsed(s => { const n = new Set(s); n.has(did) ? n.delete(did) : n.add(did); return n })} className="flex items-center justify-between px-6 py-3 cursor-pointer" style={{ background: P.cLow, borderBottom: open ? `1px solid ${P.outlineVar}` : 'none' }}>
          <div className="flex items-center gap-3"><span style={{ width: 8, height: 8, borderRadius: 999, background: d?.color, display: 'inline-block' }} /><h3 style={{ fontSize: 12, fontWeight: 700, color: P.onSurface, letterSpacing: '0.02em' }}>{d?.name || 'No department'} ({list.length})</h3></div>
          <Sym i="expand_more" s={20} c={P.outline} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
        </header>
        {open && <div style={{ divideColor: P.outlineVar }}>{list.map((t, i) => <div key={t.id} style={{ borderTop: i ? `1px solid ${P.outlineVar}` : 'none' }}><TaskRow t={t} /></div>)}</div>}
      </section>
    )
  }

  const renderMyTasks = () => {
    const list = myTasks.filter(matchSearch); const groups = {}; list.forEach(t => { (groups[t.department_id] = groups[t.department_id] || []).push(t) })
    const sopItems = Array.isArray(mySop?.items) ? mySop.items.filter(it => (it.text || '').trim()) : []
    return (
      <>
        {sopItems.length > 0 && (
          <div className="mb-5" style={{ background: P.white, border: `1px solid ${P.gold}`, borderRadius: 12, overflow: 'hidden' }}>
            <div onClick={() => setSopOpen(o => !o)} className="flex items-center gap-3 px-5 py-3 cursor-pointer" style={{ background: '#fbf6e6' }}>
              <Sym i="menu_book" s={20} c={P.brass} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 13, fontWeight: 700, color: P.onSurface }}>Your SOP</div>
                <div style={{ fontSize: 11, color: P.onVar }}>{sopItems.length} responsibilit{sopItems.length === 1 ? 'y' : 'ies'}{mySop?.updated_at ? ' · updated ' + fmtDate(mySop.updated_at) : ''}{sopAckToday ? ' · reviewed today ✓' : ''}</div>
              </div>
              {!sopOpen && !sopAckToday && <button onClick={e => { e.stopPropagation(); ackSop() }} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 999, background: P.brass, color: '#fff' }}>Mark reviewed</button>}
              <Sym i={sopOpen ? 'expand_less' : 'expand_more'} s={20} c={P.outline} />
            </div>
            {sopOpen && (
              <div className="px-5 py-4">
                {SOP_CAD_ORDER.filter(c => sopItems.some(it => (it.cadence || 'daily') === c)).map(c => (
                  <div key={c} className="mb-3">
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: P.brass, marginBottom: 4 }}>{SOP_CAD[c] || c}</div>
                    {sopItems.filter(it => (it.cadence || 'daily') === c).map((it, i) => (
                      <div key={it.id || i} className="flex items-start gap-2" style={{ fontSize: 14, color: P.onSurface, padding: '3px 0' }}><Sym i="chevron_right" s={16} c={P.outline} style={{ marginTop: 2 }} />{it.text}</div>
                    ))}
                  </div>
                ))}
                {mySop?.notes && <div style={{ fontSize: 12, color: P.onVar, marginTop: 6, paddingTop: 10, borderTop: `1px solid ${P.outlineVar}` }}>{mySop.notes}</div>}
                <button onClick={ackSop} disabled={sopAckToday} style={{ marginTop: 12, fontSize: 12, fontWeight: 700, padding: '8px 16px', borderRadius: 8, background: sopAckToday ? P.cMed : P.brass, color: sopAckToday ? P.onVar : '#fff' }}>{sopAckToday ? 'Reviewed today ✓' : 'I have reviewed my SOP'}</button>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-3 mb-6 flex-wrap">
          {['Status: All', 'Priority: All', 'Due: Anytime'].map(c => <button key={c} className="flex items-center gap-2" style={{ padding: '6px 16px', borderRadius: 999, border: `1px solid ${P.outlineVar}`, background: P.white, fontSize: 12, fontWeight: 500, color: P.onSurface }}>{c}<Sym i="expand_more" s={16} c={P.outline} /></button>)}
        </div>
        {!list.length ? <Empty msg="No tasks assigned to you yet." /> : <div className="flex flex-col gap-6">{Object.entries(groups).map(([did, l]) => <Section key={did} did={did} list={l} />)}</div>}
        {list.length > 0 && <BentoStats myTasks={myTasks} />}
      </>
    )
  }

  const renderBoard = () => {
    // Assignee filter — applies to the task list AND the per-department counts.
    const assigneeMatch = (t) => !deptAssignee ? true : (deptAssignee === '__unassigned__' ? !t.assignee_id : String(t.assignee_id) === String(deptAssignee))
    const deptCount = (id) => tasks.filter(t => t.department_id === id && assigneeMatch(t) && t.status !== 'approved').length
    const filterName = deptAssignee === '__unassigned__' ? 'Unassigned' : (memberMap[deptAssignee] || '')
    // Approved == completed → lives in Archive, not here.
    const list = tasks.filter(t => t.department_id === activeDept && t.status !== 'approved' && assigneeMatch(t) && matchSearch(t))
    if (!deptTabs.length) return <Empty msg="You're not in any department yet. A founder can add you under Team Access → Departments." />
    const DeptBtn = ({ d, horizontal }) => { const a = activeDept === d.id; const n = deptCount(d.id); return (
      <button onClick={() => setActiveDept(d.id)} className="flex items-center gap-2 whitespace-nowrap" style={{ padding: horizontal ? '7px 12px' : '9px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, textAlign: 'left', width: horizontal ? 'auto' : '100%', background: a ? d.color : (horizontal ? P.white : 'transparent'), color: a ? '#fff' : P.onSurface, border: (a || horizontal) ? (a ? 'none' : `1px solid ${P.outlineVar}`) : '1px solid transparent' }} onMouseEnter={e => { if (!a && !horizontal) e.currentTarget.style.background = P.cLow }} onMouseLeave={e => { if (!a && !horizontal) e.currentTarget.style.background = 'transparent' }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: a ? '#fff' : d.color, display: 'inline-block', flexShrink: 0 }} />
        <span style={{ flex: horizontal ? 'none' : 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
        <span title={deptAssignee ? `${filterName}'s open tasks` : 'Open tasks'} style={{ marginLeft: horizontal ? 4 : 'auto', flexShrink: 0, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 7px', background: a ? 'rgba(255,255,255,0.28)' : P.cMed, color: a ? '#fff' : (n ? P.onVar : P.outline) }}>{n}</span>
      </button>) }
    const sortedList = list.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const content = boardMode === 'list' ? (
      <section style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 12, overflow: 'hidden' }}>
        {sortedList.map((t, i) => <div key={t.id} style={{ borderTop: i ? `1px solid ${P.outlineVar}` : 'none' }}><TaskRow t={t} drag={listDrag} /></div>)}
        {!sortedList.length && <div className="text-center" style={{ padding: '20px', fontSize: 13, color: P.outline }}>{deptAssignee ? `No tasks for ${filterName} in this department.` : 'No tasks yet — add one below.'}</div>}
        <div className="flex items-center px-6 py-3" style={{ borderTop: `1px solid ${P.outlineVar}`, background: P.cLow }}>
          <Sym i="add" s={18} c={P.outline} />
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addInline(activeDept) }} placeholder="Add a task to this department…" style={{ flex: 1, marginLeft: 12, fontSize: 14, border: 'none', background: 'transparent', outline: 'none', color: P.onSurface }} />
          {newTitle.trim() && <button onClick={() => addInline(activeDept)} style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8, background: P.brass, color: '#fff' }}>Add</button>}
        </div>
      </section>
    ) : (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {STATUSES.filter(st => st.key !== 'approved').map(st => {
          const col = list.filter(t => t.status === st.key)
          return (
            <div key={st.key} className="flex-shrink-0" style={{ width: 272 }}>
              <div className="flex items-center gap-2 mb-3 px-1"><span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: st.color }}>{st.label}</span><span style={{ fontSize: 11, fontWeight: 600, color: P.outline, background: P.cMed, borderRadius: 999, padding: '1px 7px' }}>{col.length}</span></div>
              <div className="flex flex-col gap-3">
                {col.map(t => {
                  const od = isOverdue(t.due_date, t.status); const acc = t.status === 'blocked' ? P.error : (t.priority === 'urgent' || t.priority === 'high') ? P.brass : null
                  return (
                    <div key={t.id} onClick={() => setSelected(t)} style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderLeft: acc ? `4px solid ${acc}` : `1px solid ${P.outlineVar}`, borderRadius: 12, padding: 16, cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = P.cLow} onMouseLeave={e => e.currentTarget.style.background = P.white}>
                      {(t.priority === 'urgent' || t.priority === 'high' || t.status === 'blocked') && <div className="flex items-center gap-1 mb-2" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: t.status === 'blocked' ? P.error : P.brass }}><Sym i={t.status === 'blocked' ? 'warning' : 'priority_high'} s={13} />{t.status === 'blocked' ? 'Blocked' : t.priority + ' priority'}</div>}
                      <p style={{ fontSize: 14, fontWeight: 500, color: P.onSurface, marginBottom: 10, lineHeight: 1.35 }}>{t.title}</p>
                      {t.linked_id && <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6, background: P.cMed, color: P.onVar }}>{t.linked_id}</span>}
                      <div className="flex items-center justify-between mt-3">
                        <span onClick={e => e.stopPropagation()}><AssigneeMenu task={t} members={members} onChange={id => quickAssign(t, id)} /></span>
                        <span className="flex items-center gap-1" style={{ fontSize: 11, color: od ? P.error : P.onVar }}><Sym i="event" s={14} c={od ? P.error : P.outline} />{od ? 'Overdue' : fmtDate(t.due_date) || '—'}</span>
                      </div>
                    </div>
                  )
                })}
                {!col.length && <div style={{ fontSize: 11, textAlign: 'center', padding: 12, borderRadius: 12, border: `1px dashed ${P.outlineVar}`, color: P.outline }}>—</div>}
              </div>
            </div>
          )
        })}
      </div>
    )
    return (
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="sm:hidden flex gap-2 overflow-x-auto pb-1">{deptTabs.map(d => <DeptBtn key={d.id} d={d} horizontal />)}</div>
        <div className="hidden sm:flex flex-col gap-1 flex-shrink-0" style={{ width: 200 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: P.outline, padding: '0 12px 6px' }}>Departments</div>
          {deptTabs.map(d => <DeptBtn key={d.id} d={d} />)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4 gap-3">
            <span className="flex items-center gap-2 min-w-0" style={{ fontSize: 15, fontWeight: 600, color: P.onSurface }}>
              <span className="truncate">{deptMap[activeDept]?.name || ''}</span>
              {deptAssignee && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: P.cMed, color: P.onVar, flexShrink: 0 }}>{filterName} · {list.length}</span>}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <select value={deptAssignee} onChange={e => setDeptAssignee(e.target.value)} title="Filter tasks by assignee"
                style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: deptAssignee ? P.cHigh : P.white, color: P.onSurface, outline: 'none', maxWidth: 170 }}>
                <option value="">All assignees</option>
                <option value="__unassigned__">Unassigned</option>
                {(() => { const ids = new Set(tasks.filter(t => t.department_id === activeDept && t.assignee_id != null).map(t => String(t.assignee_id))); return members.filter(m => ids.has(String(m.id))) })().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {deptAssignee && <button onClick={() => setDeptAssignee('')} title="Clear filter" style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: P.white, color: P.onVar }}>Clear</button>}
              <div className="flex" style={{ border: `1px solid ${P.outlineVar}`, borderRadius: 8, overflow: 'hidden' }}>
                {[['board', 'view_kanban', 'Board'], ['list', 'view_list', 'List']].map(([m, ic, lb]) => <button key={m} onClick={() => setBoardMode(m)} className="flex items-center gap-1.5" style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: boardMode === m ? P.cHigh : P.white, color: P.onSurface }}><Sym i={ic} s={16} />{lb}</button>)}
              </div>
            </div>
          </div>
          {content}
        </div>
      </div>
    )
  }

  const renderMyDay = () => {
    const today = myTasks.filter(t => t.status !== 'approved' && (isOverdue(t.due_date, t.status) || (t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString()) || t.status === 'in_progress'))
    return today.length ? <section style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 12, overflow: 'hidden' }}>{today.map((t, i) => <div key={t.id} style={{ borderTop: i ? `1px solid ${P.outlineVar}` : 'none' }}><TaskRow t={t} showDept /></div>)}</section> : <Empty msg="Nothing due today and nothing overdue. Clear runway." />
  }

  const renderApprovals = () => approvalsQueue.length ? <section style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 12, overflow: 'hidden' }}>{approvalsQueue.map((t, i) => <div key={t.id} style={{ borderTop: i ? `1px solid ${P.outlineVar}` : 'none' }}><TaskRow t={t} showDept /></div>)}</section> : <Empty msg="Nothing waiting for approval." />

  const renderCockpit = () => {
    const open = tasks.filter(t => t.status !== 'approved'); const overdue = open.filter(t => isOverdue(t.due_date, t.status)); const submitted = tasks.filter(t => t.status === 'submitted')
    const Card = ({ children }) => <div style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 12, padding: 16 }}>{children}</div>
    const Metric = ({ val, label, color }) => <Card><div style={{ fontFamily: FH, fontSize: 28, fontWeight: 500, color: color || P.onSurface }}>{val}</div><div style={{ fontSize: 12, color: P.onVar, marginTop: 2 }}>{label}</div></Card>
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric val={open.length} label="Open tasks" /><Metric val={overdue.length} label="Overdue" color={overdue.length ? P.error : null} /><Metric val={submitted.length} label="Pending approval" color={submitted.length ? P.brass : null} /><Metric val={tasks.filter(t => t.status === 'approved').length} label="Approved" color={P.green} />
        </div>
        {submitted.length > 0 && <div onClick={() => setView('approvals')} className="flex items-center gap-3 cursor-pointer" style={{ background: P.onSurface, color: '#fff', borderRadius: 12, padding: '16px 20px' }}><span style={{ width: 28, height: 28, borderRadius: 999, background: P.brassC, display: 'inline-block', flexShrink: 0 }} /><div><div style={{ fontWeight: 600, fontSize: 14 }}>Needs your approval ({submitted.length})</div><div style={{ fontSize: 12, color: P.outlineVar }}>Critical items awaiting sign-off</div></div><Sym i="chevron_right" s={20} style={{ marginLeft: 'auto' }} /></div>}
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: P.onSurface, marginBottom: 8 }}>Department summary</div>
          <Card>{departments.map((d, i) => { const dt = tasks.filter(t => t.department_id === d.id); const o = dt.filter(t => t.status !== 'approved').length; const od = dt.filter(t => isOverdue(t.due_date, t.status)).length; const tot = Math.max(dt.length, 1); return (
            <div key={d.id} style={{ padding: '10px 0', borderTop: i ? `1px solid ${P.outlineVar}` : 'none' }}>
              <div className="flex items-center gap-2" style={{ fontSize: 14, marginBottom: 6 }}><span style={{ width: 9, height: 9, borderRadius: 999, background: d.color, display: 'inline-block' }} /><span style={{ flex: 1, fontWeight: 500, color: P.onSurface }}>{d.name}</span><span style={{ color: P.onVar, fontSize: 12 }}>{dt.length} items</span></div>
              <div className="flex" style={{ height: 6, borderRadius: 999, overflow: 'hidden', background: P.cMed }}><div style={{ width: `${(o - od) / tot * 100}%`, background: d.color }} /><div style={{ width: `${od / tot * 100}%`, background: P.error }} /></div>
            </div>) })}</Card>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: P.onSurface, marginBottom: 8 }}>Team load</div>
          <Card>{members.filter(m => m.is_active !== false).map((m, i) => { const mt = tasks.filter(t => t.assignee_id === m.id && t.status !== 'approved'); const od = mt.filter(t => isOverdue(t.due_date, t.status)).length; return (
            <div key={m.id} onClick={() => { setSelectedMember(m.id); setView('people') }} className="flex items-center gap-3 cursor-pointer" style={{ fontSize: 14, padding: '10px 0', borderTop: i ? `1px solid ${P.outlineVar}` : 'none' }} onMouseEnter={e => e.currentTarget.style.opacity = 0.75} onMouseLeave={e => e.currentTarget.style.opacity = 1}><Avatar name={m.name} size={28} /><span style={{ flex: 1, fontWeight: 500, color: P.onSurface }}>{m.name}</span><span style={{ color: P.onVar, fontSize: 12 }}>{mt.length} open</span>{od ? <span style={{ color: P.error, fontWeight: 600, fontSize: 12 }}>{od} overdue</span> : <span style={{ color: P.green, fontSize: 12 }}>on track</span>}<Sym i="chevron_right" s={16} c={P.outline} /></div>) })}</Card>
        </div>
      </div>
    )
  }

  const [sopEditId, setSopEditId] = useState(null)
  const [sopCounts, setSopCounts] = useState({})
  useEffect(() => { if (view !== 'sops') return; supa.from('member_sops').select('team_member_id, items').then(({ data }) => { const c = {}; (data || []).forEach(r => { c[r.team_member_id] = (Array.isArray(r.items) ? r.items : []).filter(it => (it.text || '').trim()).length }); setSopCounts(c) }) }, [view])
  const renderSops = () => {
    const visible = my.isFounder ? members : members.filter(m => memberships.some(x => x.team_member_id === m.id && myHeadIds.includes(x.department_id)))
    const active = visible.filter(m => m.is_active !== false)
    return (
      <div>
        <div style={{ fontSize: 13, color: P.onVar, marginBottom: 16 }}>Write each team member's SOP — the standing responsibilities they should follow. It shows as a pinned reminder at the top of their My Tasks.</div>
        <div style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 12, overflow: 'hidden' }}>
          {active.map((m, i) => { const n = sopCounts[m.id]; const open = sopEditId === m.id; return (
            <div key={m.id} style={{ borderTop: i ? `1px solid ${P.outlineVar}` : 'none' }}>
              <div onClick={() => setSopEditId(open ? null : m.id)} className="flex items-center gap-3 px-5 py-3 cursor-pointer" onMouseEnter={e => e.currentTarget.style.background = P.cLow} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Avatar name={m.name} size={30} />
                <span className="flex-1 min-w-0 truncate" style={{ fontSize: 14, fontWeight: 500, color: P.onSurface }}>{m.name}</span>
                <span style={{ fontSize: 12, color: n ? P.brass : P.outline }}>{n ? `${n} responsibilit${n === 1 ? 'y' : 'ies'}` : 'No SOP yet'}</span>
                <Sym i={open ? 'expand_less' : 'expand_more'} s={20} c={P.outline} />
              </div>
              {open && <div className="px-5 pb-5 pt-1"><SopEditor memberId={m.id} actorName={my.name} onSaved={(cnt) => setSopCounts(c => ({ ...c, [m.id]: cnt }))} /></div>}
            </div>) })}
          {!active.length && <Empty msg="No team members to manage." />}
        </div>
      </div>
    )
  }

  const renderPeople = () => {
    const visible = my.isFounder ? members : members.filter(m => m.id === my.id || memberships.some(x => x.team_member_id === m.id && myHeadIds.includes(x.department_id)))
    const activeM = visible.filter(m => m.is_active !== false)
    const inactiveM = visible.filter(m => m.is_active === false)
    const sel = selectedMember || activeM[0]?.id || visible[0]?.id
    const q = peopleSearch.toLowerCase()
    const railM = activeM.filter(m => !q || (m.name || '').toLowerCase().includes(q))
    const mm = members.find(m => m.id === sel)
    const memTasks = tasks.filter(t => t.assignee_id === sel && matchSearch(t))
    const cnt = { open: memTasks.filter(t => t.status !== 'approved').length, overdue: memTasks.filter(t => isOverdue(t.due_date, t.status)).length, prog: memTasks.filter(t => t.status === 'in_progress').length, sub: memTasks.filter(t => t.status === 'submitted').length }
    const groups = {}; memTasks.forEach(t => { (groups[t.department_id] = groups[t.department_id] || []).push(t) })
    const MemBtn = ({ m }) => { const a = sel === m.id; const mt = tasks.filter(t => t.assignee_id === m.id && t.status !== 'approved'); const od = mt.filter(t => isOverdue(t.due_date, t.status)).length; return (
      <button onClick={() => setSelectedMember(m.id)} className="flex items-center gap-2 w-full" style={{ padding: '8px 10px', borderRadius: 8, background: a ? P.cHigh : 'transparent', opacity: m.is_active === false ? 0.55 : 1, textAlign: 'left' }} onMouseEnter={e => { if (!a) e.currentTarget.style.background = P.cLow }} onMouseLeave={e => { if (!a) e.currentTarget.style.background = 'transparent' }}>
        <Avatar name={m.name} size={26} />
        <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13, fontWeight: a ? 700 : 500, color: P.onSurface }}>{m.name}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: od ? P.error : P.onVar }}>{mt.length}{od ? ` · ${od}!` : ''}</span>
      </button>) }
    const Pill = ({ n, label, color }) => <span style={{ fontSize: 12, color: P.onVar }}><b style={{ color: color || P.onSurface }}>{n}</b> {label}</span>
    return (
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="sm:hidden flex gap-2 overflow-x-auto pb-1">{activeM.map(m => <button key={m.id} onClick={() => setSelectedMember(m.id)} className="flex items-center gap-1.5 whitespace-nowrap" style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${sel === m.id ? P.brass : P.outlineVar}`, background: sel === m.id ? P.brass : P.white, color: sel === m.id ? '#fff' : P.onSurface, fontSize: 12, fontWeight: 600 }}><Avatar name={m.name} size={18} />{m.name}</button>)}</div>
        <div className="hidden sm:flex flex-col flex-shrink-0" style={{ width: 240 }}>
          <div className="relative mb-2"><Sym i="search" s={16} c={P.outline} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} /><input value={peopleSearch} onChange={e => setPeopleSearch(e.target.value)} placeholder="Search member…" style={{ width: '100%', padding: '7px 10px 7px 32px', fontSize: 13, borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: P.white, outline: 'none' }} /></div>
          <div className="flex flex-col gap-0.5">{railM.map(m => <MemBtn key={m.id} m={m} />)}</div>
          {inactiveM.length > 0 && <><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: P.outline, padding: '10px 10px 4px' }}>Inactive</div>{inactiveM.map(m => <MemBtn key={m.id} m={m} />)}</>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Avatar name={mm?.name} size={36} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: P.onSurface }}>{mm?.name || '—'}{mm?.is_active === false && <span style={{ fontSize: 11, color: P.outline, marginLeft: 6 }}>(inactive)</span>}</div>
                <div className="flex items-center gap-3 mt-0.5"><Pill n={cnt.open} label="open" /><Pill n={cnt.overdue} label="overdue" color={cnt.overdue ? P.error : null} /><Pill n={cnt.prog} label="in progress" /><Pill n={cnt.sub} label="pending approval" color={cnt.sub ? P.brass : null} /></div>
              </div>
            </div>
            <div className="flex flex-shrink-0" style={{ border: `1px solid ${P.outlineVar}`, borderRadius: 8, overflow: 'hidden' }}>
              {[['list', 'view_list', 'List'], ['board', 'view_kanban', 'Board']].map(([m, ic, lb]) => <button key={m} onClick={() => setPeopleMode(m)} className="flex items-center gap-1.5" style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: peopleMode === m ? P.cHigh : P.white, color: P.onSurface }}><Sym i={ic} s={16} />{lb}</button>)}
            </div>
          </div>
          {!memTasks.length ? <Empty msg="No tasks assigned to this member." /> : peopleMode === 'list' ? (
            <div className="flex flex-col gap-6">{Object.entries(groups).map(([did, l]) => <Section key={did} did={did} list={l} />)}</div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {STATUSES.filter(st => st.key !== 'approved' || memTasks.some(t => t.status === 'approved')).map(st => { const col = memTasks.filter(t => t.status === st.key); return (
                <div key={st.key} className="flex-shrink-0" style={{ width: 272 }}>
                  <div className="flex items-center gap-2 mb-3 px-1"><span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: st.color }}>{st.label}</span><span style={{ fontSize: 11, fontWeight: 600, color: P.outline, background: P.cMed, borderRadius: 999, padding: '1px 7px' }}>{col.length}</span></div>
                  <div className="flex flex-col gap-3">
                    {col.map(t => { const od = isOverdue(t.due_date, t.status); const d = deptMap[t.department_id]; return (
                      <div key={t.id} onClick={() => setSelected(t)} style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 12, padding: 16, cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = P.cLow} onMouseLeave={e => e.currentTarget.style.background = P.white}>
                        <p style={{ fontSize: 14, fontWeight: 500, color: P.onSurface, marginBottom: 8, lineHeight: 1.35 }}>{t.title}</p>
                        <div className="flex items-center justify-between">
                          {d ? <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: P.onVar }}><span style={{ width: 8, height: 8, borderRadius: 999, background: d.color, display: 'inline-block' }} />{d.name}</span> : <span />}
                          <span className="flex items-center gap-1" style={{ fontSize: 11, color: od ? P.error : P.onVar }}><Sym i="event" s={14} c={od ? P.error : P.outline} />{od ? 'Overdue' : fmtDate(t.due_date) || '—'}</span>
                        </div>
                      </div>
                    )})}
                    {!col.length && <div style={{ fontSize: 11, textAlign: 'center', padding: 12, borderRadius: 12, border: `1px dashed ${P.outlineVar}`, color: P.outline }}>—</div>}
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>
      </div>
    )
  }

  const toggleActive = async (m) => { const next = m.is_active === false; await supa.from('team_members').update({ is_active: next, deactivated_at: next ? null : new Date().toISOString() }).eq('id', m.id); loadAll() }
  const renderTeam = () => (
    <section style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 12, overflow: 'hidden' }}>
      {members.map((m, i) => { const md = memberships.filter(x => x.team_member_id === m.id); return (
        <div key={m.id} className="flex items-center gap-3 px-5 py-3" style={{ fontSize: 14, borderTop: i ? `1px solid ${P.outlineVar}` : 'none', opacity: m.is_active === false ? 0.5 : 1 }}>
          <Avatar name={m.name} size={30} /><div className="flex-1 min-w-0"><div style={{ fontWeight: 500, color: P.onSurface }}>{m.name}</div><div style={{ fontSize: 11, color: P.onVar }}>{m.role || m.designation || ''}</div></div>
          <div className="hidden sm:flex gap-1 flex-wrap justify-end" style={{ maxWidth: '40%' }}>{md.map(x => { const d = deptMap[x.department_id]; return d ? <span key={x.id} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: d.color + '1a', color: d.color }}>{d.code || d.name}{x.role === 'head' ? ' ★' : ''}</span> : null })}</div>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: m.is_active === false ? P.cMed : P.greenC, color: m.is_active === false ? P.outline : P.green }}>{m.is_active === false ? 'Inactive' : 'Active'}</span>
          <button onClick={() => toggleActive(m)} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 8, border: `1px solid ${P.outlineVar}`, color: P.onSurface }}>{m.is_active === false ? 'Reactivate' : 'Deactivate'}</button>
        </div>) })}
    </section>
  )

  const setMembership = async (mid, did, action) => {
    if (action === 'add') await supa.from('team_member_departments').insert([{ team_member_id: mid, department_id: did, role: 'member' }])
    else if (action === 'remove') await supa.from('team_member_departments').delete().eq('team_member_id', mid).eq('department_id', did)
    else await supa.from('team_member_departments').update({ role: action }).eq('team_member_id', mid).eq('department_id', did)
    loadAll()
  }
  const renderDepts = () => (
    <div className="grid sm:grid-cols-2 gap-4">
      {departments.map(d => { const inD = memberships.filter(x => x.department_id === d.id); const ids = inD.map(x => x.team_member_id); return (
        <div key={d.id} style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 12, padding: 16 }}>
          <div className="flex items-center gap-2 mb-1"><span style={{ width: 12, height: 12, borderRadius: 999, background: d.color, display: 'inline-block' }} /><span style={{ fontWeight: 600, color: P.onSurface }}>{d.name}</span><span style={{ marginLeft: 'auto', fontSize: 12, color: P.onVar }}>{inD.length} members</span></div>
          <div style={{ fontSize: 12, color: P.onVar, marginBottom: 12 }}>{d.description}</div>
          <div className="flex flex-wrap gap-1.5 mb-2">{inD.map(x => <span key={x.id} className="inline-flex items-center gap-1" style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: d.color + '1a', color: d.color }}>{memberMap[x.team_member_id]}<button onClick={() => setMembership(x.team_member_id, d.id, x.role === 'head' ? 'member' : 'head')} title="Toggle head">{x.role === 'head' ? '★' : '☆'}</button><button onClick={() => setMembership(x.team_member_id, d.id, 'remove')}>✕</button></span>)}{!inD.length && <span style={{ fontSize: 11, color: P.outline }}>No members yet</span>}</div>
          <select value="" onChange={e => { if (e.target.value) setMembership(Number(e.target.value), d.id, 'add') }} style={{ fontSize: 12, padding: '7px 10px', borderRadius: 8, border: `1px solid ${P.outlineVar}`, width: '100%', background: P.white }}><option value="">+ Add member…</option>{members.filter(m => m.is_active !== false && !ids.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </div>) })}
    </div>
  )

  /* ── ARCHIVE — approved (= completed) tasks, grouped by department ── */
  const renderArchive = () => {
    const assigneeMatch = (t) => !deptAssignee ? true : (deptAssignee === '__unassigned__' ? !t.assignee_id : String(t.assignee_id) === String(deptAssignee))
    const filterName = deptAssignee === '__unassigned__' ? 'Unassigned' : (memberMap[deptAssignee] || '')
    const deptIds = deptTabs.map(d => d.id)
    const done = tasks.filter(t => t.status === 'approved' && deptIds.includes(t.department_id) && assigneeMatch(t) && matchSearch(t))
    const rows = done
      .filter(t => !archDept || t.department_id === archDept)
      .slice().sort((a, b) => new Date(b.approved_at || b.completed_at || b.updated_at || 0) - new Date(a.approved_at || a.completed_at || a.updated_at || 0))
    const countIn = (id) => done.filter(t => !id || t.department_id === id).length

    const Chip = ({ id, label, color }) => { const a = archDept === id; const n = countIn(id); return (
      <button onClick={() => setArchDept(id)} className="flex items-center gap-2 whitespace-nowrap" style={{ padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: a ? (color || P.brass) : P.white, color: a ? '#fff' : P.onSurface, border: a ? 'none' : `1px solid ${P.outlineVar}`, flexShrink: 0 }}>
        {color && <span style={{ width: 9, height: 9, borderRadius: 999, background: a ? '#fff' : color, display: 'inline-block' }} />}
        {label}
        <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 7px', background: a ? 'rgba(255,255,255,0.28)' : P.cMed, color: a ? '#fff' : (n ? P.onVar : P.outline) }}>{n}</span>
      </button>) }

    if (!deptTabs.length) return <Empty msg="You're not in any department yet." />
    return (
      <div>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div style={{ fontSize: 13, color: P.onVar }}>Completed tasks — approved by an admin. Restore one to send it back to its department as To Do.</div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <select value={deptAssignee} onChange={e => setDeptAssignee(e.target.value)} title="Filter by assignee"
              style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: deptAssignee ? P.cHigh : P.white, color: P.onSurface, outline: 'none', maxWidth: 170 }}>
              <option value="">All assignees</option>
              <option value="__unassigned__">Unassigned</option>
              {members.filter(m => m.is_active !== false).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {deptAssignee && <button onClick={() => setDeptAssignee('')} style={{ fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: P.white, color: P.onVar }}>Clear</button>}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          <Chip id="" label="All departments" />
          {deptTabs.map(d => <Chip key={d.id} id={d.id} label={d.name} color={d.color} />)}
        </div>

        <section style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 12, overflow: 'hidden' }}>
          {rows.map((t, i) => {
            const d = deptMap[t.department_id]
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? `1px solid ${P.outlineVar}` : 'none' }}>
                <Sym i="check_circle" s={18} c="#15803d" />
                <button onClick={() => setSelected(t)} className="flex-1 min-w-0 text-left">
                  <div className="truncate" style={{ fontSize: 14, fontWeight: 500, color: P.onSurface }}>{t.title}</div>
                  <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 11, color: P.outline, marginTop: 2 }}>
                    {d && <span className="flex items-center gap-1"><span style={{ width: 7, height: 7, borderRadius: 999, background: d.color, display: 'inline-block' }} />{d.name}</span>}
                    <span>· {memberMap[t.assignee_id] || 'Unassigned'}</span>
                    {(t.approved_at || t.completed_at) && <span>· Completed {fmtDate(t.approved_at || t.completed_at)}</span>}
                    {t.approved_by && <span>· Approved by {memberMap[t.approved_by] || '#' + t.approved_by}</span>}
                  </div>
                </button>
                <span className="hidden sm:inline" style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: SMAP.approved.bg, color: SMAP.approved.color }}>APPROVED</span>
                {canApprove(t.department_id) && (
                  <button onClick={() => restoreTask(t)} title="Send back to the department as To Do"
                    style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 8, border: `1px solid ${P.outlineVar}`, background: P.white, color: P.onVar, flexShrink: 0 }}>Restore</button>
                )}
              </div>
            )
          })}
          {!rows.length && <div className="text-center" style={{ padding: 28, fontSize: 13, color: P.outline }}>{deptAssignee ? `Nothing archived for ${filterName} here yet.` : 'Nothing archived yet — approved tasks land here.'}</div>}
        </section>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" style={{ background: P.surface, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header className="flex items-center justify-between gap-4 px-4 sm:px-6 flex-shrink-0" style={{ minHeight: 60, paddingTop: 10, paddingBottom: 10, background: P.surface, borderBottom: `1px solid ${P.outlineVar}` }}>
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <h2 style={{ fontFamily: FH, fontSize: 20, fontWeight: 700, color: P.onSurface, whiteSpace: 'nowrap' }}>{titleOf[view]}</h2>
          <div className="relative hidden sm:block" style={{ maxWidth: 340, width: '100%' }}>
            <Sym i="search" s={20} c={P.outline} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks, orders, fabrics…" style={{ width: '100%', padding: '9px 12px 9px 38px', fontSize: 14, background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 8, outline: 'none' }} />
          </div>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 flex-shrink-0" style={{ padding: '9px 18px', background: P.brass, color: P.onBrass, borderRadius: 8, fontSize: 13, fontWeight: 600 }}><Sym i="add" s={18} c="#fff" />Create new</button>
      </header>

      <div className="flex gap-1.5 overflow-x-auto px-4 sm:px-6 py-2.5 flex-shrink-0" style={{ background: P.surface, borderBottom: `1px solid ${P.outlineVar}` }}>
        {NAV.map(n => { const a = view === n.id; return (
          <button key={n.id} onClick={() => setView(n.id)} className="flex items-center gap-1.5 whitespace-nowrap" style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: a ? P.brass : 'transparent', color: a ? '#fff' : P.onSurface, border: a ? 'none' : `1px solid ${P.outlineVar}` }}>
            <Sym i={n.icon} s={18} c={a ? '#fff' : P.onVar} />{n.label}{n.badge ? <span style={{ fontSize: 10, fontWeight: 700, background: a ? 'rgba(255,255,255,0.25)' : P.brass, color: '#fff', borderRadius: 999, padding: '1px 7px' }}>{n.badge}</span> : null}
          </button>) })}
      </div>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6" style={{ width: '100%' }}>
        {loading ? <div className="text-center py-16" style={{ color: P.onVar }}>Loading tasks…</div> : (
          <>
            {view === 'mytasks' && renderMyTasks()}
            {view === 'myday' && renderMyDay()}
            {view === 'departments' && renderBoard()}
            {view === 'people' && renderPeople()}
            {view === 'sops' && renderSops()}
            {view === 'approvals' && renderApprovals()}
            {view === 'archive' && renderArchive()}
            {view === 'sourcing' && <SourcingView members={members} my={my} />}
            {view === 'cockpit' && renderCockpit()}
          </>
        )}
      </main>

      {showNew && <NewTaskModal departments={deptTabs} members={members} my={my} defaultDept={view === 'departments' ? activeDept : ''} onClose={() => setShowNew(false)} onCreated={loadAll} />}
      {selected && <TaskDetail task={tasks.find(t => t.id === selected.id) || selected} departments={departments} members={members} memberMap={memberMap} my={my} canApprove={canApprove(selected.department_id)} onClose={() => setSelected(null)} onChanged={loadAll} />}
    </div>
  )
}

const Empty = ({ msg }) => <div className="text-center py-16" style={{ fontSize: 14, color: '#9ca3af' }}>{msg}</div>

function BentoStats({ myTasks }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const now = new Date(); const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0)
  const perDay = days.map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return myTasks.filter(t => t.completed_at && new Date(t.completed_at).toDateString() === d.toDateString()).length })
  const maxV = Math.max(...perDay, 1); const todayIdx = (now.getDay() + 6) % 7
  const onTrack = myTasks.length ? Math.round(myTasks.filter(t => !isOverdue(t.due_date, t.status)).length / myTasks.length * 100) : 100
  const next = myTasks.filter(t => t.due_date && t.status !== 'approved').sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0]
  return (
    <div className="grid grid-cols-12 gap-6 mt-8">
      <div className="col-span-12 lg:col-span-8" style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 12, padding: 24 }}>
        <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: P.outline, marginBottom: 16 }}>Workflow velocity (completed this week)</h4>
        <div className="flex items-end gap-2" style={{ height: 120, marginBottom: 10 }}>{perDay.map((v, i) => <div key={i} style={{ flex: 1, height: `${Math.max(v / maxV * 100, 6)}%`, background: i === todayIdx ? P.brass : P.brassC, borderRadius: '3px 3px 0 0' }} />)}</div>
        <div className="flex justify-between" style={{ fontSize: 11, color: P.onVar }}>{days.map((d, i) => <span key={d} style={{ fontWeight: i === todayIdx ? 700 : 400, color: i === todayIdx ? P.brass : P.onVar }}>{d}</span>)}</div>
      </div>
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
        <div style={{ background: P.onSurface, color: '#fff', borderRadius: 12, padding: 24, flex: 1 }}>
          <Sym i="auto_awesome" s={22} c={P.brassC} /><h4 style={{ fontSize: 12, fontWeight: 500, color: P.outlineVar, marginTop: 8 }}>Task focus score</h4>
          <p style={{ fontFamily: FH, fontSize: 32, fontWeight: 500, color: '#fff' }}>{onTrack}%</p>
          <p style={{ fontSize: 12, color: P.outlineVar }}>{onTrack >= 80 ? 'On track — keep the momentum.' : 'Some tasks slipping — clear the overdue.'}</p>
        </div>
        <div style={{ background: P.white, border: `1px solid ${P.outlineVar}`, borderRadius: 12, padding: 20 }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: P.outline, marginBottom: 8 }}>Next milestone</h4>
          {next ? <div className="flex items-center gap-3"><div style={{ padding: 8, background: P.cHigh, borderRadius: 8 }}><Sym i="inventory_2" s={20} c={P.brass} /></div><div><p style={{ fontSize: 13, fontWeight: 600, color: P.onSurface }}>{next.title}</p><p style={{ fontSize: 12, color: P.onVar }}>Due {fmtDate(next.due_date)}</p></div></div> : <p style={{ fontSize: 13, color: P.onVar }}>No upcoming due dates.</p>}
        </div>
      </div>
    </div>
  )
}

export default TasksTab

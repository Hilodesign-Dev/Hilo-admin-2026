/* Sourcing — prospect vendor CRM (My Tasks → Sourcing).
   List + KPIs + filters, Add Vendor wizard, tabbed vendor drawer
   (Overview/Contacts/Notes/Samples/Files/Tasks), stage change + graduation. */
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { C, toast } from '../../../lib/designTokens'
import { supa } from '../../../lib/supabase'
import { uploadImage } from '../../../lib/storage'
import { STAGES, stageMeta, DROP_REASONS, DISCOVERED_VIA, FILE_TYPES, waLink } from './sourcingShared'

const n = v => Number(v) || 0
const inr = v => v || v === 0 ? '₹' + Number(v).toLocaleString('en-IN') : '—'
const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13.5, background: '#fff', fontFamily: 'inherit' }
const lbl = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.textMuted, display: 'block', marginBottom: 3 }
const btn = (bg, fg) => ({ fontSize: 12.5, fontWeight: 700, padding: '7px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color: fg })
const ghost = { fontSize: 12.5, fontWeight: 700, padding: '7px 13px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.text, cursor: 'pointer' }

const StagePill = ({ stage }) => { const m = stageMeta(stage); return <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>{m.label}</span> }

export default function SourcingView({ members = [], my = {} }) {
  const [vendors, setVendors] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [fStage, setFStage] = useState('all')
  const [fCat, setFCat] = useState('all')
  const [fSpoc, setFSpoc] = useState('all')
  const [fCluster, setFCluster] = useState('all')
  const [hideOnboarded, setHideOnboarded] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [srcTasks, setSrcTasks] = useState([])
  const [srcView, setSrcView] = useState('tasks')
  const [newTaskFor, setNewTaskFor] = useState({})
  const [editT, setEditT] = useState(null)
  const [editText, setEditText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: vs }, { data: cats }, { data: tk }] = await Promise.all([
      supa.from('v_sourcing_vendor_summary').select('*').eq('active', true).order('created_at', { ascending: false }),
      supa.from('sourcing_categories').select('*').eq('active', true).order('kind').order('name'),
      supa.from('tasks').select('*').eq('linked_type', 'sourcing_vendor').order('created_at', { ascending: false }),
    ])
    setVendors(vs || []); setCategories(cats || []); setSrcTasks(tk || []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const clusters = useMemo(() => [...new Set(vendors.map(v => v.cluster).filter(Boolean))].sort(), [vendors])
  const spocName = (id) => members.find(m => String(m.id) === String(id))?.name || '—'

  const shown = useMemo(() => vendors.filter(v => {
    if (hideOnboarded && (v.stage === 'onboarded' || v.stage === 'dropped')) return false
    if (fStage !== 'all' && v.stage !== fStage) return false
    if (fSpoc !== 'all' && String(v.internal_spoc_id) !== String(fSpoc)) return false
    if (fCluster !== 'all' && v.cluster !== fCluster) return false
    if (fCat !== 'all' && !(v.categories || '').split(', ').includes(fCat)) return false
    if (q) { const s = q.toLowerCase(); if (!(`${v.name} ${v.primary_phone || ''} ${v.city || ''} ${v.cluster || ''} ${v.categories || ''}`.toLowerCase().includes(s))) return false }
    return true
  }), [vendors, hideOnboarded, fStage, fSpoc, fCluster, fCat, q])

  const kpi = useMemo(() => {
    const total = vendors.length
    const evalStages = ['contacted','sample_requested','sample_received','sample_approved']
    return {
      total,
      inEval: vendors.filter(v => evalStages.includes(v.stage)).length,
      samplesPending: vendors.reduce((a, v) => a + n(v.pending_samples), 0),
      trial: vendors.filter(v => v.stage === 'trial_po').length,
      onboarded: vendors.filter(v => v.stage === 'onboarded').length,
      dropped: vendors.filter(v => v.stage === 'dropped').length,
    }
  }, [vendors])

  const openVendor = vendors.find(v => v.id === openId)
  const reloadTasks = async () => { const { data } = await supa.from('tasks').select('*').eq('linked_type', 'sourcing_vendor').order('created_at', { ascending: false }); setSrcTasks(data || []) }
  const taskDone = (t) => t.status === 'done' || t.status === 'completed'
  const toggleTask = async (t) => { await supa.from('tasks').update({ status: taskDone(t) ? 'todo' : 'done', completed_at: taskDone(t) ? null : new Date().toISOString() }).eq('id', t.id); reloadTasks() }
  const byOrder = (a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)) || (new Date(a.created_at || 0) - new Date(b.created_at || 0))
  const addTask = async (vid, title) => {
    if (!title || !title.trim()) return
    const v = vendors.find(x => x.id === vid)
    const vt = srcTasks.filter(x => String(x.linked_id) === String(vid))
    const maxOrder = vt.reduce((m, x) => Math.max(m, x.sort_order || 0), 0)
    await supa.from('tasks').insert([{ title: title.trim(), status: 'todo', priority: 'normal', linked_type: 'sourcing_vendor', linked_id: vid, assignee_id: v && v.internal_spoc_id ? Number(v.internal_spoc_id) : null, sort_order: maxOrder + 1, created_by: my.id ? Number(my.id) : null }])
    setNewTaskFor(p => ({ ...p, [vid]: '' })); reloadTasks()
  }
  const patchSrcTask = async (t, patch) => { await supa.from('tasks').update(patch).eq('id', t.id); reloadTasks() }
  const delSrcTask = async (t) => { if (!window.confirm('Delete this task?')) return; await supa.from('tasks').delete().eq('id', t.id); reloadTasks() }
  const assignAll = async (vid, id) => { await supa.from('tasks').update({ assignee_id: id ? Number(id) : null }).eq('linked_type', 'sourcing_vendor').eq('linked_id', vid); reloadTasks() }
  const reorderSrcTask = async (vid, t, dir) => {
    const listD = srcTasks.filter(x => String(x.linked_id) === String(vid)).slice().sort(byOrder)
    const idx = listD.findIndex(x => x.id === t.id); const j = idx + dir
    if (idx < 0 || j < 0 || j >= listD.length) return
    const arr = [...listD]; const [m] = arr.splice(idx, 1); arr.splice(j, 0, m)
    const ups = arr.map((x, i) => ({ id: x.id, sort_order: i + 1 }))
    setSrcTasks(ts => ts.map(x => { const u = ups.find(y => y.id === x.id); return u ? { ...x, sort_order: u.sort_order } : x }))
    for (const u of ups) await supa.from('tasks').update({ sort_order: u.sort_order }).eq('id', u.id)
  }
  const mName = (id) => members.find(m => String(m.id) === String(id))?.name || 'Unassigned'
  const iconBtn = { border: 'none', background: 'transparent', cursor: 'pointer', color: C.textMuted, fontSize: 10, padding: 0, height: 12, lineHeight: 1 }
  const actBtn = { border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', color: C.textMuted, fontSize: 11, borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap' }

  const Kpi = ({ label, val, accent }) => (
    <div style={{ padding: '9px 12px', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: C.textMuted }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 800, color: accent || C.text }}>{val}</div>
    </div>
  )
  const sel = { ...inp, width: 'auto', fontSize: 12.5, padding: '6px 9px' }

  return (
    <div style={{ fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text }}>Sourcing <span style={{ fontSize: 13, fontWeight: 600, color: C.textMuted }}>· vendor pipeline</span></h2>
        <button onClick={() => setShowAdd(true)} style={btn(C.gold, '#fff')}>+ New Vendor</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[['tasks', 'Tasks by vendor'], ['pipeline', 'Vendor pipeline']].map(([id, label]) => (
          <button key={id} onClick={() => setSrcView(id)} style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: srcView === id ? C.gold : C.bg, color: srcView === id ? '#fff' : C.textMuted }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginBottom: 12 }}>
        <Kpi label="Total" val={kpi.total} />
        <Kpi label="In evaluation" val={kpi.inEval} accent="#2563eb" />
        <Kpi label="Samples pending" val={kpi.samplesPending} accent="#0891b2" />
        <Kpi label="In trial" val={kpi.trial} accent="#d97706" />
        <Kpi label="Onboarded" val={kpi.onboarded} accent="#059669" />
        <Kpi label="Dropped" val={kpi.dropped} accent="#dc2626" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name / phone / city / category…" style={{ ...inp, flex: 1, minWidth: 200 }} />
        <select value={fStage} onChange={e => setFStage(e.target.value)} style={sel}><option value="all">All stages</option>{STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select value={fCat} onChange={e => setFCat(e.target.value)} style={sel}><option value="all">All categories</option>{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
        <select value={fSpoc} onChange={e => setFSpoc(e.target.value)} style={sel}><option value="all">All SPOCs</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        {clusters.length > 0 && <select value={fCluster} onChange={e => setFCluster(e.target.value)} style={sel}><option value="all">All clusters</option>{clusters.map(c => <option key={c} value={c}>{c}</option>)}</select>}
        <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={hideOnboarded} onChange={e => setHideOnboarded(e.target.checked)} /> Hide onboarded/dropped</label>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.textMuted }}>{shown.length}</span>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>Loading…</div> :
       shown.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: C.textMuted, border: `1px dashed ${C.border}`, borderRadius: 12 }}>No vendors. Click <b>+ New Vendor</b> to add prospects from your sourcing trips.</div> :
       srcView === 'tasks' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {shown.map(v => { const vt = srcTasks.filter(t => String(t.linked_id) === String(v.id)); const openN = vt.filter(t => !taskDone(t)).length; return (
            <div key={v.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => setOpenId(v.id)}>
                  <span style={{ fontWeight: 800, color: C.text }}>{v.name}</span>
                  <span style={{ marginLeft: 8 }}><StagePill stage={v.stage} /></span>
                  <span style={{ marginLeft: 8, fontSize: 11.5, color: C.textMuted }}>{[v.city, 'SPOC ' + spocName(v.internal_spoc_id)].filter(Boolean).join(' · ')}</span>
                </div>
                {vt.length > 0 && <select value="" onChange={e => { if (e.target.value) assignAll(v.id, e.target.value); e.target.value = '' }} title="Assign all tasks to one person" style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', color: C.textMuted }}><option value="">Assign all →</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
                <span style={{ fontSize: 11, fontWeight: 800, color: openN ? C.gold : C.textMuted, background: openN ? C.gold + '18' : C.bg, padding: '2px 8px', borderRadius: 6 }}>{openN} open / {vt.length}</span>
              </div>
              <div style={{ padding: '2px 14px 10px' }}>
                {vt.length === 0 && <div style={{ fontSize: 12.5, color: C.textLight, padding: '8px 0' }}>No tasks yet — add the first one below.</div>}
                {vt.slice().sort(byOrder).map((t, ti, arr) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                    <input type="checkbox" checked={taskDone(t)} onChange={() => toggleTask(t)} title="Mark complete" />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <button onClick={() => reorderSrcTask(v.id, t, -1)} disabled={ti === 0} title="Move up" style={{ ...iconBtn, opacity: ti === 0 ? 0.3 : 1 }}>▲</button>
                      <button onClick={() => reorderSrcTask(v.id, t, 1)} disabled={ti === arr.length - 1} title="Move down" style={{ ...iconBtn, opacity: ti === arr.length - 1 ? 0.3 : 1 }}>▼</button>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editT === t.id ? (
                        <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                          onBlur={() => { if (editText.trim() && editText.trim() !== t.title) patchSrcTask(t, { title: editText.trim() }); setEditT(null) }}
                          onKeyDown={e => { if (e.key === 'Enter') { if (editText.trim() && editText.trim() !== t.title) patchSrcTask(t, { title: editText.trim() }); setEditT(null) } if (e.key === 'Escape') setEditT(null) }}
                          style={{ width: '100%', padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.gold}`, fontSize: 13, outline: 'none' }} />
                      ) : (
                        <div style={{ fontSize: 13, fontWeight: 600, textDecoration: taskDone(t) ? 'line-through' : 'none', color: taskDone(t) ? C.textMuted : C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                          {t.status === 'submitted' && <span style={{ fontSize: 9, fontWeight: 800, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 5, whiteSpace: 'nowrap' }}>CLOSURE REQUESTED</span>}
                        </div>
                      )}
                    </div>
                    <select value={t.assignee_id || ''} onChange={e => patchSrcTask(t, { assignee_id: e.target.value ? Number(e.target.value) : null })} title="Assignee" style={{ fontSize: 11.5, padding: '3px 6px', borderRadius: 6, border: `1px solid ${C.border}`, maxWidth: 120, background: '#fff' }}>
                      <option value="">Unassigned</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <button onClick={() => { setEditT(t.id); setEditText(t.title || '') }} title="Edit text" style={actBtn}>✎</button>
                    {t.status !== 'submitted' && !taskDone(t) && <button onClick={() => patchSrcTask(t, { status: 'submitted' })} title="Request closure (needs approval)" style={actBtn}>Req. close</button>}
                    <button onClick={() => delSrcTask(t)} title="Delete" style={{ ...actBtn, color: '#dc2626', borderColor: 'rgba(220,38,38,0.3)' }}>✕</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input value={newTaskFor[v.id] || ''} onChange={e => setNewTaskFor(p => ({ ...p, [v.id]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addTask(v.id, newTaskFor[v.id]) }} placeholder="+ Add a task…" style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12.5, background: '#fff' }} />
                  <button onClick={() => addTask(v.id, newTaskFor[v.id])} style={{ ...btn(C.gold, '#fff'), fontSize: 12 }}>Add</button>
                </div>
              </div>
            </div>
          )})}
        </div>
       ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.4fr 0.9fr 130px 60px', padding: '9px 12px', background: C.bg, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.textMuted }}>
            <div>Vendor</div><div>City</div><div>Categories</div><div>SPOC</div><div>Stage</div><div style={{ textAlign: 'right' }}>Tasks</div>
          </div>
          {shown.map(v => (
            <div key={v.id} onClick={() => setOpenId(v.id)} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.4fr 0.9fr 130px 60px', padding: '10px 12px', borderBottom: `1px solid ${C.border}`, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}>
              <div><div style={{ fontWeight: 700 }}>{v.name}</div><div style={{ fontSize: 10.5, color: C.textMuted, fontFamily: 'monospace' }}>{v.vendor_code}</div></div>
              <div style={{ color: C.textMuted }}>{v.city || '—'}{v.cluster ? <div style={{ fontSize: 10 }}>{v.cluster}</div> : null}</div>
              <div style={{ fontSize: 11.5, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.categories || '—'}</div>
              <div style={{ color: C.text }}>{spocName(v.internal_spoc_id)}</div>
              <div><StagePill stage={v.stage} /></div>
              <div style={{ textAlign: 'right' }}>{n(v.open_tasks) > 0 ? <span style={{ fontSize: 11, fontWeight: 800, background: C.gold + '18', color: C.gold, padding: '2px 7px', borderRadius: 6 }}>{v.open_tasks}</span> : <span style={{ color: C.textLight }}>—</span>}</div>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddVendorModal categories={categories} members={members} my={my} onClose={() => setShowAdd(false)} onSaved={(id) => { setShowAdd(false); load().then(() => setOpenId(id)) }} />}
      {openVendor && <VendorDrawer vendorId={openId} categories={categories} members={members} my={my} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  )
}

/* ═══════════ Add Vendor (2-step) ═══════════ */
function AddVendorModal({ categories, members, my, onClose, onSaved }) {
  const [step, setStep] = useState(1)
  const [f, setF] = useState({ name: '', primary_phone: '', city: '', state: '', cluster: '', internal_spoc_id: my.id || '', discovered_at: new Date().toISOString().slice(0, 10), discovered_via: 'trip', legal_name: '', primary_email: '', address_line: '', pincode: '', google_maps_url: '', price_range_notes: '', moq: '', lead_time_days: '', payment_terms: '', known_clients: '', discovery_notes: '', description: '' })
  const [cats, setCats] = useState([])       // [{id,name,is_primary}]
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const toggleCat = (c) => setCats(p => p.find(x => x.id === c.id) ? p.filter(x => x.id !== c.id) : [...p, { id: c.id, name: c.name, is_primary: p.length === 0 }])
  const setPrimary = (id) => setCats(p => p.map(x => ({ ...x, is_primary: x.id === id })))

  const save = async () => {
    if (!f.name.trim()) { toast(false, 'Vendor name required'); return }
    if (cats.length === 0) { toast(false, 'Pick at least one category'); return }
    setBusy(true)
    try {
      const yr = new Date().getFullYear()
      const { count } = await supa.from('sourcing_vendors').select('id', { count: 'exact', head: true }).gte('created_at', `${yr}-01-01`)
      const code = `SRC-${yr}-${String((count || 0) + 1).padStart(3, '0')}`
      const spocNm = members.find(m => String(m.id) === String(f.internal_spoc_id))?.name || null
      const { data, error } = await supa.from('sourcing_vendors').insert([{
        vendor_code: code, name: f.name.trim(), legal_name: f.legal_name || null, primary_phone: f.primary_phone || null, primary_email: f.primary_email || null,
        city: f.city || null, state: f.state || null, cluster: f.cluster || null, address_line: f.address_line || null, pincode: f.pincode || null, google_maps_url: f.google_maps_url || null,
        discovered_at: f.discovered_at || null, discovered_via: f.discovered_via || null, discovery_notes: f.discovery_notes || null, description: f.description || null,
        internal_spoc_id: f.internal_spoc_id ? Number(f.internal_spoc_id) : null, internal_spoc_name: spocNm,
        price_range_notes: f.price_range_notes || null, moq: f.moq || null, lead_time_days: f.lead_time_days ? Number(f.lead_time_days) : null, payment_terms: f.payment_terms || null, known_clients: f.known_clients || null,
        created_by_id: my.id || null, created_by_name: my.name || null,
      }]).select().single()
      if (error) throw error
      const rows = cats.map(c => ({ vendor_id: data.id, category_id: c.id, is_primary: c.is_primary }))
      await supa.from('sourcing_vendor_categories').insert(rows)
      toast(true, 'Vendor added — ' + code)
      onSaved(data.id)
    } catch (e) { toast(false, 'Failed: ' + (e.message || e)) } finally { setBusy(false) }
  }

  const catsByKind = useMemo(() => { const g = {}; categories.forEach(c => { (g[c.kind] = g[c.kind] || []).push(c) }); return g }, [categories])

  return (
    <Modal title="New sourcing vendor" onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {['Basics', 'Optional details'].map((s, i) => <div key={s} style={{ flex: 1, textAlign: 'center', fontSize: 11.5, fontWeight: 700, padding: '6px', borderRadius: 8, background: step === i + 1 ? C.gold : C.bg, color: step === i + 1 ? '#fff' : C.textMuted }}>{i + 1}. {s}</div>)}
      </div>
      {step === 1 ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div><label style={lbl}>Vendor name *</label><input value={f.name} onChange={e => set('name', e.target.value)} style={inp} placeholder="Rajesh Silks" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={lbl}>Primary phone</label><input value={f.primary_phone} onChange={e => set('primary_phone', e.target.value)} style={inp} placeholder="+91 98765 43210" /></div>
            <div><label style={lbl}>Internal SPOC *</label><select value={f.internal_spoc_id} onChange={e => set('internal_spoc_id', e.target.value)} style={inp}><option value="">—</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label style={lbl}>City</label><input value={f.city} onChange={e => set('city', e.target.value)} style={inp} placeholder="Bhagalpur" /></div>
            <div><label style={lbl}>State</label><input value={f.state} onChange={e => set('state', e.target.value)} style={inp} placeholder="Bihar" /></div>
            <div><label style={lbl}>Cluster</label><input value={f.cluster} onChange={e => set('cluster', e.target.value)} style={inp} placeholder="Bhagalpur silk hub" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={lbl}>Discovered on</label><input type="date" value={f.discovered_at} onChange={e => set('discovered_at', e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Discovered via</label><select value={f.discovered_via} onChange={e => set('discovered_via', e.target.value)} style={inp}>{DISCOVERED_VIA.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
          </div>
          <div>
            <label style={lbl}>Categories * {cats.length > 0 && <span style={{ color: C.gold }}>· {cats.length} selected (★ = primary)</span>}</label>
            <div style={{ maxHeight: 180, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8, padding: 8 }}>
              {Object.keys(catsByKind).map(kind => (
                <div key={kind} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.textMuted, marginBottom: 4 }}>{kind.replace('_', ' ')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {catsByKind[kind].map(c => { const on = cats.find(x => x.id === c.id); return (
                      <button key={c.id} onClick={() => toggleCat(c)} style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: 20, border: `1px solid ${on ? C.gold : C.border}`, background: on ? C.gold + '15' : '#fff', color: on ? C.gold : C.text, cursor: 'pointer' }}>
                        {on?.is_primary ? '★ ' : ''}{c.name}
                      </button>
                    )})}
                  </div>
                </div>
              ))}
            </div>
            {cats.length > 1 && <div style={{ marginTop: 6, fontSize: 11, color: C.textMuted }}>Primary: {cats.map(c => <button key={c.id} onClick={() => setPrimary(c.id)} style={{ marginRight: 4, fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 5, border: 'none', cursor: 'pointer', background: c.is_primary ? C.gold : C.bg, color: c.is_primary ? '#fff' : C.text }}>{c.name}</button>)}</div>}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={lbl}>Legal name</label><input value={f.legal_name} onChange={e => set('legal_name', e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Email</label><input value={f.primary_email} onChange={e => set('primary_email', e.target.value)} style={inp} /></div>
          </div>
          <div><label style={lbl}>Address</label><input value={f.address_line} onChange={e => set('address_line', e.target.value)} style={inp} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <div><label style={lbl}>Pincode</label><input value={f.pincode} onChange={e => set('pincode', e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Google Maps URL</label><input value={f.google_maps_url} onChange={e => set('google_maps_url', e.target.value)} style={inp} /></div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', marginTop: 4 }}>Business terms</div>
          <div><label style={lbl}>Price range notes</label><input value={f.price_range_notes} onChange={e => set('price_range_notes', e.target.value)} style={inp} placeholder="Georgette ₹280–420/mtr by GSM" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label style={lbl}>MOQ</label><input value={f.moq} onChange={e => set('moq', e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Lead time (days)</label><input value={f.lead_time_days} onChange={e => set('lead_time_days', e.target.value.replace(/\D/g, ''))} style={inp} /></div>
            <div><label style={lbl}>Payment terms</label><input value={f.payment_terms} onChange={e => set('payment_terms', e.target.value)} style={inp} /></div>
          </div>
          <div><label style={lbl}>Known clients</label><input value={f.known_clients} onChange={e => set('known_clients', e.target.value)} style={inp} placeholder="supplies to Sabyasachi…" /></div>
          <div><label style={lbl}>Discovery notes</label><textarea value={f.discovery_notes} onChange={e => set('discovery_notes', e.target.value)} style={{ ...inp, minHeight: 60 }} /></div>
          <div><label style={lbl}>Description / about vendor</label><textarea value={f.description} onChange={e => set('description', e.target.value)} style={{ ...inp, minHeight: 70 }} placeholder="Who they are, what they make, specialities, strengths…" /></div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <button onClick={onClose} style={ghost}>Cancel</button>
        <div style={{ display: 'flex', gap: 8 }}>
          {step === 2 && <button onClick={() => setStep(1)} style={ghost}>← Back</button>}
          {step === 1 ? <button onClick={() => setStep(2)} style={ghost}>Optional details →</button> : null}
          <button onClick={save} disabled={busy} style={btn(C.gold, '#fff')}>{busy ? 'Saving…' : 'Save vendor'}</button>
        </div>
      </div>
    </Modal>
  )
}

/* ═══════════ Vendor drawer ═══════════ */
function VendorDrawer({ vendorId, categories, members, my, onClose, onChanged }) {
  const [v, setV] = useState(null)
  const [tab, setTab] = useState('overview')
  const [contacts, setContacts] = useState([]); const [samples, setSamples] = useState([]); const [files, setFiles] = useState([]); const [notes, setNotes] = useState([]); const [tasks, setTasks] = useState([])
  const [stageMenu, setStageMenu] = useState(false)

  const reload = useCallback(async () => {
    const [{ data: vd }, { data: co }, { data: sa }, { data: fi }, { data: no }, { data: tk }] = await Promise.all([
      supa.from('sourcing_vendors').select('*').eq('id', vendorId).single(),
      supa.from('sourcing_vendor_contacts').select('*').eq('vendor_id', vendorId).order('is_primary', { ascending: false }),
      supa.from('sourcing_vendor_samples').select('*').eq('vendor_id', vendorId).order('created_at', { ascending: false }),
      supa.from('sourcing_vendor_files').select('*').eq('vendor_id', vendorId).order('uploaded_at', { ascending: false }),
      supa.from('sourcing_vendor_notes').select('*').eq('vendor_id', vendorId).order('created_at', { ascending: false }),
      supa.from('tasks').select('*').eq('linked_type', 'sourcing_vendor').eq('linked_id', vendorId).order('created_at', { ascending: false }),
    ])
    setV(vd); setContacts(co || []); setSamples(sa || []); setFiles(fi || []); setNotes(no || []); setTasks(tk || [])
  }, [vendorId])
  useEffect(() => { reload() }, [reload])

  const [vcats, setVcats] = useState([])
  useEffect(() => { supa.from('sourcing_vendor_categories').select('category_id, is_primary').eq('vendor_id', vendorId).then(({ data }) => setVcats(data || [])) }, [vendorId])
  const catName = (id) => categories.find(c => c.id === id)?.name || ''

  const postNote = async (body, note_type = 'general') => {
    await supa.from('sourcing_vendor_notes').insert([{ vendor_id: vendorId, body, note_type, created_by_id: my.id || null, created_by_name: my.name || null }])
  }
  const changeStage = async (stage) => {
    setStageMenu(false)
    if (stage === v.stage) return
    if (stage === 'dropped') { const r = window.prompt('Drop reason (' + DROP_REASONS.join(' / ') + '):', 'other'); if (r === null) return; await supa.from('sourcing_vendors').update({ stage, stage_updated_at: new Date().toISOString(), drop_reason: r }).eq('id', vendorId); await postNote(`${my.name || 'Someone'} dropped vendor — ${r}`, 'stage_change'); reload(); onChanged(); return }
    if (stage === 'onboarded') { setGrad(true); return }
    await supa.from('sourcing_vendors').update({ stage, stage_updated_at: new Date().toISOString() }).eq('id', vendorId)
    await postNote(`${my.name || 'Someone'} changed stage: ${stageMeta(v.stage).label} → ${stageMeta(stage).label}`, 'stage_change')
    reload(); onChanged()
  }
  const [grad, setGrad] = useState(false)

  if (!v) return <Drawer onClose={onClose}><div style={{ padding: 40, color: C.textMuted }}>Loading…</div></Drawer>

  const TABS = [['overview', 'Overview'], ['tasks', `Tasks (${tasks.filter(t => t.status !== 'done' && t.status !== 'completed').length})`], ['samples', `Samples (${samples.length})`], ['files', `Files (${files.length})`], ['notes', `Notes (${notes.length})`], ['contacts', `Contacts (${contacts.length})`]]
  const spoc = members.find(m => String(m.id) === String(v.internal_spoc_id))?.name || v.internal_spoc_name || '—'

  return (
    <Drawer onClose={onClose}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div><div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{v.name}</div><div style={{ fontSize: 11, color: C.textMuted, fontFamily: 'monospace' }}>{v.vendor_code}</div></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setStageMenu(s => !s)} style={{ ...ghost, display: 'flex', gap: 6, alignItems: 'center' }}><StagePill stage={v.stage} /> ▾</button>
              {stageMenu && <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 5, minWidth: 180 }}>{STAGES.map(s => <div key={s.id} onClick={() => changeStage(s.id)} style={{ padding: '8px 12px', fontSize: 12.5, cursor: 'pointer', fontWeight: v.stage === s.id ? 800 : 500, color: s.color }}>{s.label}</div>)}</div>}
            </div>
            <button onClick={onClose} style={ghost}>Close</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
          {TABS.map(([id, label]) => <button key={id} onClick={() => setTab(id)} style={{ fontSize: 12, fontWeight: 700, padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', background: tab === id ? C.gold : C.bg, color: tab === id ? '#fff' : C.textMuted }}>{label}</button>)}
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {tab === 'overview' && <Overview v={v} spoc={spoc} vcats={vcats} catName={catName} onSaved={reload} />}
        {tab === 'tasks' && <TasksTabPanel vendorId={vendorId} tasks={tasks} members={members} my={my} reload={reload} onChanged={onChanged} />}
        {tab === 'samples' && <SamplesTab vendorId={vendorId} vendorCode={v.vendor_code} samples={samples} my={my} reload={reload} />}
        {tab === 'files' && <FilesTab vendorId={vendorId} files={files} my={my} reload={reload} />}
        {tab === 'notes' && <NotesTab notes={notes} onPost={async (b, t) => { await postNote(b, t); reload() }} />}
        {tab === 'contacts' && <ContactsTab vendorId={vendorId} contacts={contacts} reload={reload} />}
      </div>

      {grad && <GraduationWizard v={v} contacts={contacts} my={my} onClose={() => setGrad(false)} onDone={() => { setGrad(false); reload(); onChanged() }} postNote={postNote} />}
    </Drawer>
  )
}

function Row({ label, children }) { return <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 10, padding: '5px 0', fontSize: 13 }}><div style={{ color: C.textMuted }}>{label}</div><div style={{ color: C.text }}>{children || '—'}</div></div> }

function Overview({ v, spoc, vcats, catName, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [desc, setDesc] = useState(v.description || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setDesc(v.description || ''); setEditing(false) }, [v.id]) // eslint-disable-line
  const saveDesc = async () => {
    setSaving(true)
    try { await supa.from('sourcing_vendors').update({ description: desc.trim() || null }).eq('id', v.id); setEditing(false); onSaved && onSaved() }
    finally { setSaving(false) }
  }
  return (
    <div>
      <Section title="About this vendor">
        {editing ? (
          <div>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} autoFocus
              placeholder="Who they are, what they make, specialities, strengths, notable clients, anything worth remembering…"
              style={{ width: '100%', minHeight: 96, fontSize: 13, lineHeight: 1.55, padding: 10, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={saveDesc} disabled={saving} style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 14px', borderRadius: 8, border: 'none', background: C.gold, color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => { setDesc(v.description || ''); setEditing(false) }} style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.textMuted, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: v.description ? C.text : C.textMuted, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
            {v.description || 'No description yet.'}
            <button onClick={() => setEditing(true)} style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: C.gold, background: 'none', border: 'none', cursor: 'pointer' }}>{v.description ? 'Edit' : '+ Add'}</button>
          </div>
        )}
      </Section>
      <Section title="Pipeline">
        <Row label="Stage"><StagePill stage={v.stage} /></Row>
        <Row label="Internal SPOC">{spoc}</Row>
        <Row label="Discovered">{v.discovered_at ? new Date(v.discovered_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}{v.discovered_via ? ` · via ${v.discovered_via}` : ''}</Row>
        {v.drop_reason && <Row label="Drop reason"><span style={{ color: '#dc2626' }}>{v.drop_reason}</span></Row>}
      </Section>
      <Section title="Basic info">
        <Row label="Legal name">{v.legal_name}</Row>
        <Row label="Phone">{v.primary_phone}{waLink(v.primary_phone) && <a href={waLink(v.primary_phone)} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: '#16a34a', fontSize: 12, fontWeight: 700 }}>WhatsApp ↗</a>}</Row>
        <Row label="Email">{v.primary_email}</Row>
        <Row label="City / State">{[v.city, v.state].filter(Boolean).join(', ')}</Row>
        <Row label="Cluster">{v.cluster}</Row>
        <Row label="Address">{v.address_line}{v.pincode ? ` — ${v.pincode}` : ''}{v.google_maps_url && <a href={v.google_maps_url} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: '#2563eb', fontSize: 12, fontWeight: 700 }}>Maps ↗</a>}</Row>
      </Section>
      <Section title="Categories">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{vcats.length ? vcats.map(c => <span key={c.category_id} style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: c.is_primary ? C.gold + '18' : C.bg, color: c.is_primary ? C.gold : C.text, border: `1px solid ${C.border}` }}>{c.is_primary ? '★ ' : ''}{catName(c.category_id)}</span>) : <span style={{ color: C.textMuted }}>—</span>}</div>
      </Section>
      <Section title="Business terms">
        <Row label="Price range">{v.price_range_notes}</Row>
        <Row label="MOQ">{v.moq}</Row>
        <Row label="Lead time">{v.lead_time_days ? `${v.lead_time_days} days` : '—'}</Row>
        <Row label="Payment terms">{v.payment_terms}</Row>
        <Row label="Known clients">{v.known_clients}</Row>
      </Section>
      {v.discovery_notes && <Section title="Discovery notes"><div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{v.discovery_notes}</div></Section>}
      {v.graduated_to_type && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'rgba(5,150,105,.08)', color: '#059669', fontSize: 12.5, fontWeight: 700 }}>✓ Onboarded to {v.graduated_to_type.replace('_', ' ')} · {v.graduated_to_id}</div>}
    </div>
  )
}
function Section({ title, children }) { return <div style={{ marginBottom: 16 }}><div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: C.textMuted, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>{title}</div>{children}</div> }

/* Tasks inside drawer (reuse tasks table) */
function TasksTabPanel({ vendorId, tasks, members, my, reload }) {
  const [title, setTitle] = useState(''); const [assignee, setAssignee] = useState(my.id || ''); const [due, setDue] = useState(''); const [priority, setPriority] = useState('normal'); const [busy, setBusy] = useState(false)
  const add = async () => {
    if (!title.trim()) return
    setBusy(true)
    try { await supa.from('tasks').insert([{ title: title.trim(), assignee_id: assignee ? Number(assignee) : null, created_by: my.id || null, status: 'todo', priority, due_date: due || null, linked_type: 'sourcing_vendor', linked_id: vendorId }]); setTitle(''); setDue(''); toast(true, 'Task added'); reload() } catch (e) { toast(false, 'Failed') } finally { setBusy(false) }
  }
  const toggle = async (t) => { const done = t.status === 'done' || t.status === 'completed'; await supa.from('tasks').update({ status: done ? 'todo' : 'done', completed_at: done ? null : new Date().toISOString() }).eq('id', t.id); reload() }
  const nm = (id) => members.find(m => String(m.id) === String(id))?.name || '—'
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, padding: 10, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 14 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="New task — e.g. Request price list" style={inp} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8 }}>
          <select value={assignee} onChange={e => setAssignee(e.target.value)} style={inp}><option value="">Unassigned</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <input type="date" value={due} onChange={e => setDue(e.target.value)} style={inp} />
          <select value={priority} onChange={e => setPriority(e.target.value)} style={inp}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select>
          <button onClick={add} disabled={busy} style={btn(C.gold, '#fff')}>Add</button>
        </div>
      </div>
      {tasks.length === 0 ? <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>No tasks yet.</div> : tasks.map(t => { const done = t.status === 'done' || t.status === 'completed'; return (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: `1px solid ${C.border}` }}>
          <input type="checkbox" checked={done} onChange={() => toggle(t)} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, textDecoration: done ? 'line-through' : 'none', color: done ? C.textMuted : C.text }}>{t.title}</div><div style={{ fontSize: 11, color: C.textMuted }}>{nm(t.assignee_id)}{t.due_date ? ` · due ${new Date(t.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''} · {t.priority}</div></div>
        </div>
      )})}
    </div>
  )
}

/* Samples */
function SamplesTab({ vendorId, vendorCode, samples, my, reload }) {
  const [show, setShow] = useState(false)
  const review = async (s, status) => { const note = window.prompt('Review notes (optional):', s.review_notes || '') ; await supa.from('sourcing_vendor_samples').update({ review_status: status, review_notes: note, reviewed_by_name: my.name || null, reviewed_at: new Date().toISOString() }).eq('id', s.id); reload() }
  const SR = { pending: ['#d97706', 'Pending'], approved: ['#16a34a', 'Approved'], rejected: ['#dc2626', 'Rejected'], pending_more_info: ['#2563eb', 'More info'] }
  return (
    <div>
      <button onClick={() => setShow(true)} style={{ ...btn(C.gold, '#fff'), marginBottom: 12 }}>+ Add sample</button>
      {samples.length === 0 ? <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>No samples logged.</div> :
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
          {samples.map(s => { const [col, lb] = SR[s.review_status] || SR.pending; return (
            <div key={s.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              {s.photo_urls && s.photo_urls[0] ? <img src={s.photo_urls[0]} alt="" style={{ width: '100%', height: 130, objectFit: 'cover' }} /> : <div style={{ height: 130, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textLight, fontSize: 12 }}>No photo</div>}
              <div style={{ padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 10, fontFamily: 'monospace', color: C.textMuted }}>{s.sample_code}</span><span style={{ fontSize: 10, fontWeight: 800, color: col }}>{lb}</span></div>
                <div style={{ fontSize: 12.5, fontWeight: 600, margin: '4px 0' }}>{s.description}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>{s.quantity || ''}{s.quoted_price ? ` · ${inr(s.quoted_price)}${s.quoted_price_unit ? '/' + s.quoted_price_unit.replace('per_', '') : ''}` : ''}</div>
                <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                  <button onClick={() => review(s, 'approved')} style={{ ...btn('rgba(22,163,74,0.1)', '#16a34a'), fontSize: 11, padding: '4px 8px' }}>Approve</button>
                  <button onClick={() => review(s, 'rejected')} style={{ ...btn('rgba(220,38,38,0.08)', '#dc2626'), fontSize: 11, padding: '4px 8px' }}>Reject</button>
                </div>
              </div>
            </div>
          )})}
        </div>}
      {show && <AddSampleModal vendorId={vendorId} vendorCode={vendorCode} count={samples.length} onClose={() => setShow(false)} onSaved={() => { setShow(false); reload() }} />}
    </div>
  )
}
function AddSampleModal({ vendorId, vendorCode, count, onClose, onSaved }) {
  const [f, setF] = useState({ description: '', quantity: '', quoted_price: '', quoted_price_unit: 'per_meter', review_notes: '' })
  const [photos, setPhotos] = useState([]); const [busy, setBusy] = useState(false)
  const set = (k, val) => setF(p => ({ ...p, [k]: val }))
  const upload = async (e) => { const fs = Array.from(e.target.files || []); try { const urls = await Promise.all(fs.map(x => uploadImage(x, 'sourcing-samples'))); setPhotos(p => [...p, ...urls]) } catch (err) { toast(false, 'Upload failed') } }
  const save = async (status) => {
    if (!f.description.trim()) { toast(false, 'Description required'); return }
    setBusy(true)
    try {
      const code = `SMP-${vendorCode.replace('SRC-', '')}-${String(count + 1).padStart(2, '0')}`
      await supa.from('sourcing_vendor_samples').insert([{ vendor_id: vendorId, sample_code: code, description: f.description.trim(), quantity: f.quantity || null, quoted_price: f.quoted_price ? Number(f.quoted_price) : null, quoted_price_unit: f.quoted_price_unit, photo_urls: photos, review_status: status, review_notes: f.review_notes || null, received_at: new Date().toISOString().slice(0, 10) }])
      toast(true, 'Sample added'); onSaved()
    } catch (e) { toast(false, 'Failed: ' + (e.message || e)) } finally { setBusy(false) }
  }
  return (
    <Modal title="Add sample" onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div><label style={lbl}>Description *</label><input value={f.description} onChange={e => set('description', e.target.value)} style={inp} placeholder="Chanderi silk in dusty rose" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div><label style={lbl}>Quantity</label><input value={f.quantity} onChange={e => set('quantity', e.target.value)} style={inp} placeholder="1 mtr swatch" /></div>
          <div><label style={lbl}>Quoted price</label><input value={f.quoted_price} onChange={e => set('quoted_price', e.target.value.replace(/[^\d.]/g, ''))} style={inp} /></div>
          <div><label style={lbl}>Unit</label><select value={f.quoted_price_unit} onChange={e => set('quoted_price_unit', e.target.value)} style={inp}><option value="per_meter">per meter</option><option value="per_piece">per piece</option><option value="per_lehenga">per lehenga</option></select></div>
        </div>
        <div><label style={lbl}>Photos</label><input type="file" accept="image/*" multiple onChange={upload} style={{ fontSize: 12 }} />{photos.length > 0 && <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>{photos.map((u, i) => <img key={i} src={u} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 6 }} />)}</div>}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={() => save('pending')} disabled={busy} style={ghost}>Save as Pending</button>
        <button onClick={() => save('approved')} disabled={busy} style={btn('#16a34a', '#fff')}>Save & Approve</button>
      </div>
    </Modal>
  )
}

/* Files */
function FilesTab({ vendorId, files, my, reload }) {
  const [type, setType] = useState('price_list'); const [busy, setBusy] = useState(false)
  const upload = async (e) => { const fs = Array.from(e.target.files || []); setBusy(true); try { for (const file of fs) { const url = await uploadImage(file, 'sourcing-files'); await supa.from('sourcing_vendor_files').insert([{ vendor_id: vendorId, file_type: type, file_name: file.name, file_url: url, uploaded_by_name: my.name || null }]) } toast(true, 'Uploaded'); reload() } catch (err) { toast(false, 'Upload failed') } finally { setBusy(false) } }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <select value={type} onChange={e => setType(e.target.value)} style={{ ...inp, width: 'auto' }}>{FILE_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}</select>
        <label style={{ ...btn(C.gold, '#fff'), display: 'inline-block' }}>{busy ? 'Uploading…' : '+ Upload file'}<input type="file" multiple onChange={upload} style={{ display: 'none' }} /></label>
      </div>
      {files.length === 0 ? <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>No files.</div> : files.map(f => (
        <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 4px', borderBottom: `1px solid ${C.border}`, textDecoration: 'none' }}>
          <span style={{ fontSize: 18 }}>📄</span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{f.file_name}</div><div style={{ fontSize: 11, color: C.textMuted }}>{f.file_type.replace('_', ' ')} · {f.uploaded_by_name || ''} · {new Date(f.uploaded_at).toLocaleDateString('en-IN')}</div></div>
        </a>
      ))}
    </div>
  )
}

/* Notes */
function NotesTab({ notes, onPost }) {
  const [body, setBody] = useState(''); const [type, setType] = useState('general')
  const TYPES = [['general', 'General'], ['call_log', 'Call'], ['visit_log', 'Visit'], ['whatsapp_log', 'WhatsApp'], ['price_quote', 'Price quote']]
  const TCOL = { general: C.textMuted, call_log: '#2563eb', visit_log: '#d97706', whatsapp_log: '#16a34a', price_quote: '#7c3aed', stage_change: C.gold }
  return (
    <div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 14 }}>
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Add a note…" style={{ ...inp, minHeight: 54 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <select value={type} onChange={e => setType(e.target.value)} style={{ ...inp, width: 'auto' }}>{TYPES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
          <div style={{ flex: 1 }} />
          <button onClick={() => { if (body.trim()) { onPost(body.trim(), type); setBody('') } }} style={btn(C.gold, '#fff')}>Post</button>
        </div>
      </div>
      {notes.length === 0 ? <div style={{ color: C.textMuted, fontSize: 13, textAlign: 'center', padding: 20 }}>No notes yet.</div> : notes.map(nt => (
        <div key={nt.id} style={{ padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}><span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', color: TCOL[nt.note_type] || C.textMuted }}>{(nt.note_type || 'general').replace('_', ' ')}</span><span style={{ fontSize: 10.5, color: C.textLight }}>{nt.created_by_name || ''} · {new Date(nt.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{nt.body}</div>
        </div>
      ))}
    </div>
  )
}

/* Contacts */
function ContactsTab({ vendorId, contacts, reload }) {
  const [f, setF] = useState({ name: '', role: '', phone: '', email: '' }); const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const add = async () => { if (!f.name.trim()) return; setBusy(true); try { await supa.from('sourcing_vendor_contacts').insert([{ vendor_id: vendorId, name: f.name.trim(), role: f.role || null, phone: f.phone || null, whatsapp_phone: f.phone || null, email: f.email || null, is_primary: contacts.length === 0 }]); setF({ name: '', role: '', phone: '', email: '' }); reload() } catch (e) { toast(false, 'Failed') } finally { setBusy(false) } }
  const star = async (c) => { await supa.from('sourcing_vendor_contacts').update({ is_primary: false }).eq('vendor_id', vendorId); await supa.from('sourcing_vendor_contacts').update({ is_primary: true }).eq('id', c.id); reload() }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 14 }}>
        <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Name" style={inp} />
        <input value={f.role} onChange={e => set('role', e.target.value)} placeholder="Role (Owner / Sales)" style={inp} />
        <input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="Phone / WhatsApp" style={inp} />
        <div style={{ display: 'flex', gap: 8 }}><input value={f.email} onChange={e => set('email', e.target.value)} placeholder="Email" style={{ ...inp, flex: 1 }} /><button onClick={add} disabled={busy} style={btn(C.gold, '#fff')}>Add</button></div>
      </div>
      {contacts.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: `1px solid ${C.border}` }}>
          <button onClick={() => star(c)} title="Make primary" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: c.is_primary ? C.gold : C.border }}>★</button>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}{c.role ? <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500 }}> · {c.role}</span> : ''}</div><div style={{ fontSize: 11.5, color: C.textMuted }}>{c.phone || ''}{c.email ? ` · ${c.email}` : ''}</div></div>
          {waLink(c.phone) && <a href={waLink(c.phone)} target="_blank" rel="noreferrer" style={{ color: '#16a34a', fontSize: 12, fontWeight: 700 }}>WA ↗</a>}
        </div>
      ))}
    </div>
  )
}

/* Graduation */
function GraduationWizard({ v, contacts, my, onClose, onDone, postNote }) {
  const [target, setTarget] = useState('fabric_vendor')
  const [g, setG] = useState({ gstin: '', pan: '', bank_name: '', bank_account: '', bank_ifsc: '' })
  const [busy, setBusy] = useState(false)
  const set = (k, val) => setG(p => ({ ...p, [k]: val }))
  const primary = contacts.find(c => c.is_primary) || contacts[0]
  const onboard = async () => {
    setBusy(true)
    try {
      let newId, gradType
      if (target === 'fabric_vendor') {
        const { data, error } = await supa.from('fabric_vendors').insert([{ name: v.name, spoc_name: primary?.name || v.internal_spoc_name || null, spoc_phone: primary?.phone || v.primary_phone || null, spoc_email: primary?.email || v.primary_email || null, gstin: g.gstin || null, pan: g.pan || null, bank_name: g.bank_name || null, bank_account: g.bank_account || null, bank_ifsc: g.bank_ifsc || null, billing_address: v.address_line || null, shipping_address: v.address_line || null, has_gst: !!g.gstin }]).select().single()
        if (error) throw error; newId = data.id; gradType = 'fabric_vendor'
      } else {
        const type = target === 'outsource_full' ? 'full_manufacturing' : 'service'
        const { data, error } = await supa.from('outsource_vendors').insert([{ name: v.name, phone: v.primary_phone || primary?.phone || null, contact: primary?.name || null, type, gstin: g.gstin || null, pan: g.pan || null, address: v.address_line || null, location: v.city || null, bank_name: g.bank_name || null, bank_account: g.bank_account || null, bank_ifsc: g.bank_ifsc || null, active: true }]).select().single()
        if (error) throw error; newId = data.id; gradType = 'outsource_vendor'
      }
      await supa.from('sourcing_vendors').update({ stage: 'onboarded', stage_updated_at: new Date().toISOString(), graduated_to_type: gradType, graduated_to_id: String(newId), graduated_at: new Date().toISOString() }).eq('id', v.id)
      await postNote(`${my.name || 'Someone'} onboarded vendor to ${gradType.replace('_', ' ')} (${newId})`, 'stage_change')
      toast(true, 'Vendor onboarded'); onDone()
    } catch (e) { toast(false, 'Failed: ' + (e.message || e)) } finally { setBusy(false) }
  }
  const Opt = ({ id, title, desc }) => <label style={{ display: 'block', padding: 10, border: `1.5px solid ${target === id ? C.gold : C.border}`, borderRadius: 8, marginBottom: 8, cursor: 'pointer', background: target === id ? C.gold + '0d' : '#fff' }}><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="radio" checked={target === id} onChange={() => setTarget(id)} /><b style={{ fontSize: 13 }}>{title}</b></div><div style={{ fontSize: 11.5, color: C.textMuted, marginLeft: 22 }}>{desc}</div></label>
  return (
    <Modal title={`Onboard ${v.name}`} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 12 }}>Graduating from Sourcing to Active Vendors. Where should they live?</div>
      <Opt id="fabric_vendor" title="Fabric Vendors" desc="Pure fabric suppliers — appears in Fabrics module." />
      <Opt id="outsource_service" title="Outsource — Service" desc="Single-step: stitching, embroidery, printing." />
      <Opt id="outsource_full" title="Outsource — Full Manufacturing" desc="Turn-key: design handoff → finished piece. Tagged 'full_manufacturing'." />
      <div style={{ fontSize: 11, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', margin: '12px 0 8px' }}>Onboarding details (optional)</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><label style={lbl}>GSTIN</label><input value={g.gstin} onChange={e => set('gstin', e.target.value)} style={inp} /></div>
        <div><label style={lbl}>PAN</label><input value={g.pan} onChange={e => set('pan', e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Bank account name</label><input value={g.bank_name} onChange={e => set('bank_name', e.target.value)} style={inp} /></div>
        <div><label style={lbl}>Account number</label><input value={g.bank_account} onChange={e => set('bank_account', e.target.value)} style={inp} /></div>
        <div><label style={lbl}>IFSC</label><input value={g.bank_ifsc} onChange={e => set('bank_ifsc', e.target.value)} style={inp} /></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={ghost}>Cancel</button>
        <button onClick={onboard} disabled={busy} style={btn('#059669', '#fff')}>{busy ? 'Onboarding…' : 'Onboard vendor'}</button>
      </div>
    </Modal>
  )
}

/* Primitives */
function Modal({ title, children, onClose, wide }) {
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
      <div style={{ width: wide ? 640 : 500, maxWidth: '95vw', background: '#fff', borderRadius: 14, padding: 20, fontFamily: 'Manrope, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}><h3 style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{title}</h3><button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: C.textMuted }}>✕</button></div>
        {children}
      </div>
    </div>
  )
}
function Drawer({ children, onClose }) {
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 55, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: 660, maxWidth: '100vw', background: '#fff', height: '100%', overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,.12)' }}>{children}</div>
    </div>
  )
}

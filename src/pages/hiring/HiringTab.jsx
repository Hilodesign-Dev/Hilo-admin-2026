import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { supa } from '../../lib/supabase'

/* HiringTab — multi-role hiring. Candidates-by-role + Roles manager
   (create/edit roles, custom questions, open/close, per-role apply link). */

const GOLD = '#c9a432', INK = '#1b1c1a', MUT = 'rgba(27,28,26,0.5)', FAINT = 'rgba(27,28,26,0.32)'
const LINE = '#ece8df', BG = '#faf9f5', SUCCESS = '#2d7a4f', DANGER = '#b4322e'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const STATUS = { new: { label: 'New', bg: '#eef1f5', fg: '#3a4a5a' }, shortlisted: { label: 'Shortlisted', bg: '#e7f3ec', fg: SUCCESS }, rejected: { label: 'Rejected', bg: '#fdecea', fg: DANGER } }
const QTYPES = [['text', 'Short text'], ['longtext', 'Long text'], ['scale', 'Scale 1–5'], ['number', 'Number'], ['select', 'Dropdown'], ['yesno', 'Yes / No']]
const slugify = (s) => (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
const qid = () => 'q_' + Math.random().toString(36).slice(2, 8)
const btn = (active, color) => ({ fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', border: active ? 'none' : `1px solid ${LINE}`, background: active ? color : '#fff', color: active ? '#fff' : color })
const applyUrl = (slug) => window.location.origin + '/#/apply/' + slug

export default function HiringTab({ user, isAdmin }) {
  const [roles, setRoles] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('candidates')       // candidates | roles
  const [roleFilter, setRoleFilter] = useState('all')  // 'all' | role.id
  const [statusFilter, setStatusFilter] = useState('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)               // applicant drawer
  const [editRole, setEditRole] = useState(null)       // role editor (obj or 'new')

  const load = useCallback(async () => {
    setLoading(true)
    const [rl, ap] = await Promise.all([
      supa.from('hiring_roles').select('*').order('sort_order').order('created_at'),
      supa.from('hiring_applications').select('*').order('created_at', { ascending: false }),
    ])
    setRoles(rl.data || []); setRows(ap.data || []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const rolesById = useMemo(() => Object.fromEntries(roles.map(r => [r.id, r])), [roles])
  const roleByTitle = useMemo(() => { const m = {}; roles.forEach(r => { m[(r.title || '').toLowerCase().trim()] = r.id }); return m }, [roles])
  const ridOf = useCallback((r) => r.role_id || roleByTitle[(r.role || '').toLowerCase().trim()] || null, [roleByTitle])

  const patch = async (id, changes) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...changes } : r))
    setOpen(o => o && o.id === id ? { ...o, ...changes } : o)
    await supa.from('hiring_applications').update({ ...changes, reviewed_by: user?.email || user?.name || 'Someone', reviewed_at: new Date().toISOString() }).eq('id', id)
  }
  const setStatus = (id, status) => patch(id, { status })
  const toggleHired = (r) => patch(r.id, { hired: !r.hired, status: !r.hired ? 'shortlisted' : r.status })
  const delApp = async (r) => { if (!window.confirm(`Delete ${r.name}'s application? This cannot be undone.`)) return; setRows(prev => prev.filter(x => x.id !== r.id)); setOpen(null); await supa.from('hiring_applications').delete().eq('id', r.id) }

  const roleScoped = useMemo(() => rows.filter(r => roleFilter === 'all' || ridOf(r) === roleFilter), [rows, roleFilter, ridOf])
  const counts = useMemo(() => ({
    all: roleScoped.length, new: roleScoped.filter(r => r.status === 'new').length,
    shortlisted: roleScoped.filter(r => r.status === 'shortlisted').length,
    rejected: roleScoped.filter(r => r.status === 'rejected').length, hired: roleScoped.filter(r => r.hired).length,
  }), [roleScoped])

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return roleScoped.filter(r => {
      if (statusFilter === 'hired' ? !r.hired : (statusFilter !== 'all' && r.status !== statusFilter)) return false
      if (qq) { const hay = `${r.name || ''} ${r.phone || ''} ${r.email || ''} ${r.current_city || ''}`.toLowerCase(); if (!hay.includes(qq)) return false }
      return true
    })
  }, [roleScoped, statusFilter, q])

  const appCount = (roleId) => rows.filter(r => ridOf(r) === roleId).length
  const hiredCount = (roleId) => rows.filter(r => ridOf(r) === roleId && r.hired).length

  const copy = (text, label) => { navigator.clipboard?.writeText(text); alert((label || 'Link') + ' copied:\n' + text) }
  const exportCsv = () => {
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
    const head = ['Applied', 'Role', 'Name', 'Phone', 'Email', 'Experience', 'City', 'CV', 'Status', 'Hired', 'Answers']
    const body = list.map(r => {
      const role = rolesById[r.role_id]
      const ans = (role?.questions || []).map(x => `${x.label}: ${valOf(r, x)}`).join(' | ')
      return [fmtDate(r.created_at), r.role, r.name, r.phone, r.email, r.years_experience, r.current_city, r.cv_url, r.status, r.hired ? 'Yes' : 'No', ans].map(esc).join(',')
    })
    const blob = new Blob([[head.map(esc).join(','), ...body].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hilo-applications.csv'; a.click()
  }

  const saveRole = async (draft) => {
    const isNew = !draft.id
    let slug = draft.slug || slugify(draft.title)
    if (isNew) { let base = slug || 'role', n = 1; const taken = new Set(roles.map(r => r.slug)); slug = base; while (taken.has(slug)) slug = `${base}-${++n}` }
    const payload = {
      title: draft.title.trim(), slug, description: draft.description || null, location: draft.location || null,
      employment_type: draft.employment_type || null, status: draft.status || 'open',
      experience_required: draft.experience_required || null, responsibilities: draft.responsibilities || null,
      requirements: draft.requirements || null, nice_to_have: draft.nice_to_have || null, what_we_offer: draft.what_we_offer || null,
      questions: (draft.questions || []).filter(x => x.label && x.label.trim()),
      updated_at: new Date().toISOString(),
    }
    if (isNew) await supa.from('hiring_roles').insert([{ ...payload, sort_order: roles.length + 1 }])
    else await supa.from('hiring_roles').update(payload).eq('id', draft.id)
    setEditRole(null); await load()
  }
  const toggleRoleStatus = async (r) => { await supa.from('hiring_roles').update({ status: r.status === 'open' ? 'closed' : 'open', updated_at: new Date().toISOString() }).eq('id', r.id); load() }

  const chip = (k, label, n) => (
    <button key={k} onClick={() => setStatusFilter(k)} style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', border: statusFilter === k ? 'none' : `1px solid ${LINE}`, background: statusFilter === k ? INK : '#fff', color: statusFilter === k ? '#fff' : MUT }}>{label} <span style={{ opacity: 0.6 }}>{n}</span></button>
  )
  const Stars = ({ n }) => n ? <span style={{ color: GOLD, fontWeight: 800 }}>{n}<span style={{ color: FAINT, fontWeight: 600 }}>/5</span></span> : <span style={{ color: FAINT }}>—</span>

  return (
    <div style={{ padding: '18px 22px 80px', fontFamily: 'Manrope, sans-serif', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: INK }}>Hiring</div>
          <div style={{ fontSize: 12.5, color: MUT }}>Open roles and applications from your public careers page.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => copy(window.location.origin + '/#/careers', 'Careers link')} style={{ fontSize: 12.5, fontWeight: 700, padding: '8px 12px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: INK, cursor: 'pointer' }}>🔗 Careers link</button>
          <button onClick={exportCsv} style={{ fontSize: 12.5, fontWeight: 700, padding: '8px 12px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: INK, cursor: 'pointer' }}>Export CSV</button>
        </div>
      </div>

      {/* view toggle */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${LINE}`, marginBottom: 14 }}>
        {[['candidates', 'Candidates'], ['roles', `Roles (${roles.length})`]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{ padding: '8px 14px', fontSize: 13.5, fontWeight: view === k ? 800 : 600, color: view === k ? INK : MUT, background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: view === k ? `2px solid ${GOLD}` : '2px solid transparent', marginBottom: -1 }}>{l}</button>
        ))}
      </div>

      {loading ? <div style={{ color: MUT, padding: 40 }}>Loading…</div> : view === 'roles' ? (
        <div>
          <button onClick={() => setEditRole('new')} style={{ fontSize: 13, fontWeight: 800, padding: '9px 16px', borderRadius: 9, border: 'none', background: GOLD, color: '#fff', cursor: 'pointer', marginBottom: 14 }}>+ New role</button>
          {roles.length === 0 ? <div style={{ color: MUT, padding: 30 }}>No roles yet. Create your first opening.</div> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {roles.map(r => (
                <div key={r.id} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15.5, fontWeight: 800, color: INK }}>{r.title}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: r.status === 'open' ? '#e7f3ec' : '#f0eee9', color: r.status === 'open' ? SUCCESS : MUT }}>{r.status === 'open' ? 'OPEN' : 'CLOSED'}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: MUT, marginTop: 4 }}>
                        {[r.employment_type, r.location].filter(Boolean).join(' · ') || '—'} · {(r.questions || []).length} custom question{(r.questions || []).length === 1 ? '' : 's'}
                      </div>
                      <div style={{ fontSize: 12.5, color: INK, marginTop: 4, fontWeight: 600 }}>{appCount(r.id)} applicant{appCount(r.id) === 1 ? '' : 's'} · {hiredCount(r.id)} hired</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => { setRoleFilter(r.id); setView('candidates') }} style={btn(false, INK)}>View candidates</button>
                      <button onClick={() => copy(applyUrl(r.slug), 'Apply link')} style={btn(false, GOLD)}>Copy link</button>
                      <button onClick={() => toggleRoleStatus(r)} style={btn(false, MUT)}>{r.status === 'open' ? 'Close' : 'Reopen'}</button>
                      <button onClick={() => setEditRole(r)} style={btn(false, INK)}>Edit</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setStatusFilter('all') }} style={{ fontSize: 12.5, padding: '8px 12px', border: `1px solid ${LINE}`, borderRadius: 9, background: '#fff', color: INK, fontWeight: 700 }}>
              <option value="all">All roles ({rows.length})</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.title} ({appCount(r.id)})</option>)}
            </select>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name / phone / city…" style={{ marginLeft: 'auto', fontSize: 12.5, padding: '8px 12px', border: `1px solid ${LINE}`, borderRadius: 9, minWidth: 200 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {chip('all', 'All', counts.all)}{chip('new', 'New', counts.new)}{chip('shortlisted', 'Shortlisted', counts.shortlisted)}{chip('hired', 'Hired', counts.hired)}{chip('rejected', 'Rejected', counts.rejected)}
          </div>

          {list.length === 0 ? (
            <div style={{ textAlign: 'center', color: MUT, padding: '50px 0', border: `1px dashed ${LINE}`, borderRadius: 12, background: '#fff' }}>No applications here yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {list.map(r => {
                const st = STATUS[r.status] || STATUS.new
                const role = rolesById[r.role_id]
                const scales = (role?.questions || []).filter(x => x.type === 'scale').slice(0, 2)
                return (
                  <div key={r.id} style={{ background: '#fff', border: `1px solid ${r.hired ? GOLD : LINE}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 200, cursor: 'pointer' }} onClick={() => setOpen(r)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>{r.name}</span>
                          {r.hired && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: GOLD, color: '#fff' }}>★ HIRED</span>}
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: st.bg, color: st.fg }}>{st.label}</span>
                          {roleFilter === 'all' && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f2efe7', color: '#6a6252' }}>{r.role}</span>}
                        </div>
                        <div style={{ fontSize: 12.5, color: MUT, marginTop: 3 }}>{r.phone || '—'}{r.email ? ` · ${r.email}` : ''}{r.current_city ? ` · ${r.current_city}` : ''}{r.years_experience != null ? ` · ${r.years_experience} yr exp` : ''} · applied {fmtDate(r.created_at)}</div>
                        <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                          {scales.map(s => <span key={s.id} style={{ color: MUT }}>{s.label.length > 22 ? s.label.slice(0, 22) + '…' : s.label} <Stars n={Number(valOf(r, s)) || 0} /></span>)}
                          {r.cv_url && <a href={r.cv_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: GOLD, fontWeight: 700, textDecoration: 'none' }}>📎 CV</a>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button onClick={() => setStatus(r.id, 'shortlisted')} style={btn(r.status === 'shortlisted', SUCCESS)}>Shortlist</button>
                        <button onClick={() => setStatus(r.id, 'rejected')} style={btn(r.status === 'rejected', DANGER)}>Reject</button>
                        <button onClick={() => toggleHired(r)} style={{ fontSize: 12, fontWeight: 800, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', border: r.hired ? 'none' : `1px solid ${GOLD}`, background: r.hired ? GOLD : '#fff', color: r.hired ? '#fff' : GOLD }}>{r.hired ? '★ Hired' : 'Mark hired'}</button>
                        {isAdmin && <button title="Delete (admin)" onClick={() => delApp(r)} style={{ fontSize: 13, fontWeight: 700, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${LINE}`, background: '#fff', color: DANGER }}>🗑</button>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {open && <Drawer r={open} role={rolesById[ridOf(open)]} isAdmin={isAdmin} onDelete={delApp} onClose={() => setOpen(null)} setStatus={setStatus} toggleHired={toggleHired} patch={patch} />}
      {editRole && <RoleEditor role={editRole === 'new' ? null : editRole} onClose={() => setEditRole(null)} onSave={saveRole} />}
    </div>
  )
}

// value of an application's answer to a role question (falls back to legacy columns)
function valOf(r, q) { const a = (r.answers && r.answers[q.id] != null && r.answers[q.id] !== '') ? r.answers[q.id] : r[q.id]; return a == null ? '' : a }

function Drawer({ r, role, onClose, setStatus, toggleHired, patch, isAdmin, onDelete }) {
  const [note, setNote] = useState(r.admin_notes || '')
  const Row = ({ k, children }) => <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, padding: '7px 0', fontSize: 13.5, borderBottom: `1px solid ${LINE}` }}><span style={{ color: MUT }}>{k}</span><span style={{ color: INK }}>{children || '—'}</span></div>
  const questions = role?.questions || []
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 60 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(520px,100%)', background: BG, zIndex: 61, overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.12)', fontFamily: 'Manrope, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: 18, borderBottom: `1px solid ${LINE}`, background: '#fff', position: 'sticky', top: 0 }}>
          <div><div style={{ fontSize: 18, fontWeight: 800, color: INK }}>{r.name}</div><div style={{ fontSize: 12, color: MUT }}>{r.role} · applied {fmtDate(r.created_at)}</div></div>
          <button onClick={onClose} style={{ fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff', cursor: 'pointer' }}>Close</button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => setStatus(r.id, 'shortlisted')} style={btn(r.status === 'shortlisted', SUCCESS)}>Shortlist</button>
            <button onClick={() => setStatus(r.id, 'rejected')} style={btn(r.status === 'rejected', DANGER)}>Reject</button>
            <button onClick={() => toggleHired(r)} style={{ fontSize: 12, fontWeight: 800, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', border: r.hired ? 'none' : `1px solid ${GOLD}`, background: r.hired ? GOLD : '#fff', color: r.hired ? '#fff' : GOLD }}>{r.hired ? '★ Hired' : 'Mark hired'}</button>
            {isAdmin && <button onClick={() => onDelete(r)} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${LINE}`, background: '#fff', color: DANGER }}>Delete</button>}
          </div>
          <Row k="Mobile">{r.phone && <a href={`tel:${r.phone}`} style={{ color: INK }}>{r.phone}</a>}{r.phone && <a href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ marginLeft: 10, color: SUCCESS, fontWeight: 700, fontSize: 12 }}>WhatsApp ↗</a>}</Row>
          <Row k="Email">{r.email}</Row>
          <Row k="Experience">{r.years_experience != null ? `${r.years_experience} years` : '—'}</Row>
          <Row k="City">{r.current_city}</Row>
          <Row k="CV / file">{r.cv_url ? <a href={r.cv_url} target="_blank" rel="noreferrer" style={{ color: GOLD, fontWeight: 700 }}>{r.cv_name || 'View / download'} ↗</a> : '—'}</Row>

          {questions.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 6px' }}>Role answers</div>}
          {questions.map(qq => {
            const v = valOf(r, qq)
            return (
              <div key={qq.id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 4 }}>{qq.label}</div>
                <div style={{ fontSize: 13.5, color: v === '' ? FAINT : INK, lineHeight: 1.55, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: 11, whiteSpace: 'pre-wrap' }}>
                  {v === '' ? '—' : (qq.type === 'scale' ? `${v} / 5` : String(v))}
                </div>
              </div>
            )
          })}

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Internal notes</div>
            <textarea value={note} onChange={e => setNote(e.target.value)} onBlur={() => note !== (r.admin_notes || '') && patch(r.id, { admin_notes: note })} placeholder="Notes from screening / interview…" style={{ width: '100%', minHeight: 80, fontSize: 13.5, padding: 11, border: `1px solid ${LINE}`, borderRadius: 10, boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical' }} />
          </div>
        </div>
      </div>
    </>
  )
}

function RoleEditor({ role, onClose, onSave }) {
  const [d, setD] = useState(() => role ? { ...role, questions: (role.questions || []).map(x => ({ ...x })) } : { title: '', description: '', location: '', employment_type: 'Full-time', status: 'open', experience_required: '', responsibilities: '', requirements: '', nice_to_have: '', what_we_offer: '', questions: [] })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setD(p => ({ ...p, [k]: v }))
  const setQ = (i, k, v) => setD(p => ({ ...p, questions: p.questions.map((x, j) => j === i ? { ...x, [k]: v } : x) }))
  const addQ = () => setD(p => ({ ...p, questions: [...p.questions, { id: qid(), label: '', type: 'text', required: false }] }))
  const rmQ = (i) => setD(p => ({ ...p, questions: p.questions.filter((_, j) => j !== i) }))
  const moveQ = (i, dir) => setD(p => { const a = [...p.questions]; const j = i + dir; if (j < 0 || j >= a.length) return p;[a[i], a[j]] = [a[j], a[i]]; return { ...p, questions: a } })
  const save = async () => { if (!d.title.trim()) return alert('Please enter a role title.'); setSaving(true); try { await onSave(d) } finally { setSaving(false) } }

  const inp = { width: '100%', fontSize: 13.5, padding: '9px 11px', border: `1px solid ${LINE}`, borderRadius: 8, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff', color: INK }
  const lbl = { display: 'block', fontSize: 12, fontWeight: 700, color: INK, marginBottom: 5 }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 70 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(600px,100%)', background: BG, zIndex: 71, overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,0.14)', fontFamily: 'Manrope, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottom: `1px solid ${LINE}`, background: '#fff', position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>{role ? 'Edit role' : 'New role'}</div>
          <button onClick={onClose} style={{ fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: `1px solid ${LINE}`, background: '#fff', cursor: 'pointer' }}>Close</button>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Role title *</label><input value={d.title} onChange={e => set('title', e.target.value)} style={inp} placeholder="e.g. Store Manager" /></div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}><label style={lbl}>Employment type</label><input value={d.employment_type || ''} onChange={e => set('employment_type', e.target.value)} style={inp} placeholder="Full-time" /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Location</label><input value={d.location || ''} onChange={e => set('location', e.target.value)} style={inp} placeholder="Hyderabad" /></div>
          </div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Description</label><textarea value={d.description || ''} onChange={e => set('description', e.target.value)} style={{ ...inp, minHeight: 70, resize: 'vertical', lineHeight: 1.5 }} placeholder="What the role is about, what you're looking for…" /></div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Experience required</label><input value={d.experience_required || ''} onChange={e => set('experience_required', e.target.value)} style={inp} placeholder="e.g. 1–3 years in retail sales" /></div>
          <div style={{ fontSize: 11.5, color: MUT, margin: '2px 0 10px' }}>For the sections below, write <b>one point per line</b> — each line becomes a bullet on the careers page.</div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>What you'll do (responsibilities)</label><textarea value={d.responsibilities || ''} onChange={e => set('responsibilities', e.target.value)} style={{ ...inp, minHeight: 90, resize: 'vertical', lineHeight: 1.6 }} placeholder={'One responsibility per line…'} /></div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>What we're looking for (must-have)</label><textarea value={d.requirements || ''} onChange={e => set('requirements', e.target.value)} style={{ ...inp, minHeight: 90, resize: 'vertical', lineHeight: 1.6 }} placeholder={'One requirement per line…'} /></div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Nice to have (bonus)</label><textarea value={d.nice_to_have || ''} onChange={e => set('nice_to_have', e.target.value)} style={{ ...inp, minHeight: 66, resize: 'vertical', lineHeight: 1.6 }} placeholder={'Optional — one per line…'} /></div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>What we offer</label><textarea value={d.what_we_offer || ''} onChange={e => set('what_we_offer', e.target.value)} style={{ ...inp, minHeight: 80, resize: 'vertical', lineHeight: 1.6 }} placeholder={'One per line — comp, growth, perks…'} /></div>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Status</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['open', 'closed'].map(s => <button key={s} onClick={() => set('status', s)} style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: d.status === s ? 'none' : `1px solid ${LINE}`, background: d.status === s ? INK : '#fff', color: d.status === s ? '#fff' : MUT }}>{s === 'open' ? 'Open' : 'Closed'}</button>)}
            </div>
          </div>

          <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>Custom questions</div>
              <button onClick={addQ} style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: `1px solid ${GOLD}`, background: '#fff', color: GOLD, cursor: 'pointer' }}>+ Add question</button>
            </div>
            <div style={{ fontSize: 11.5, color: MUT, marginBottom: 10 }}>Name, mobile, email, experience, city and CV are always asked. Add role-specific questions below.</div>
            {d.questions.length === 0 && <div style={{ fontSize: 12.5, color: FAINT, padding: '10px 0' }}>No custom questions — only the basics will be asked.</div>}
            <div style={{ display: 'grid', gap: 10 }}>
              {d.questions.map((qq, i) => (
                <div key={qq.id || i} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: 11 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: FAINT }}>Q{i + 1}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                      <button onClick={() => moveQ(i, -1)} style={miniBtn}>▲</button>
                      <button onClick={() => moveQ(i, 1)} style={miniBtn}>▼</button>
                      <button onClick={() => rmQ(i)} style={{ ...miniBtn, color: DANGER, borderColor: '#f3c9c6' }}>✕</button>
                    </div>
                  </div>
                  <input value={qq.label} onChange={e => setQ(i, 'label', e.target.value)} style={{ ...inp, marginBottom: 8 }} placeholder="Question text" />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={qq.type} onChange={e => setQ(i, 'type', e.target.value)} style={{ ...inp, width: 'auto' }}>{QTYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <label style={{ fontSize: 12.5, color: MUT, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}><input type="checkbox" checked={!!qq.required} onChange={e => setQ(i, 'required', e.target.checked)} /> Required</label>
                  </div>
                  {qq.type === 'scale' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input value={qq.low || ''} onChange={e => setQ(i, 'low', e.target.value)} style={inp} placeholder="Low label (1)" />
                      <input value={qq.high || ''} onChange={e => setQ(i, 'high', e.target.value)} style={inp} placeholder="High label (5)" />
                    </div>
                  )}
                  {qq.type === 'select' && <input value={Array.isArray(qq.options) ? qq.options.join(', ') : (qq.options || '')} onChange={e => setQ(i, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} style={{ ...inp, marginTop: 8 }} placeholder="Options, comma separated" />}
                  <input value={qq.help || ''} onChange={e => setQ(i, 'help', e.target.value)} style={{ ...inp, marginTop: 8 }} placeholder="Helper text (optional)" />
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <button onClick={onClose} style={{ fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', color: MUT, cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ fontSize: 13, fontWeight: 800, padding: '9px 18px', borderRadius: 9, border: 'none', background: GOLD, color: '#fff', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save role'}</button>
          </div>
        </div>
      </div>
    </>
  )
}

const miniBtn = { fontSize: 11, fontWeight: 700, width: 26, height: 24, borderRadius: 6, border: `1px solid ${LINE}`, background: '#fff', color: MUT, cursor: 'pointer' }

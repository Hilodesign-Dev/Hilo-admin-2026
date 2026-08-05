import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { _logChange, logAndToast } from '../../lib/logger'
import { toast } from '../../lib/designTokens'
import { getDisplayName, getAvatarUrl } from '../../components/ProfilePopover'

/* AssetsPanel — asset register per team member.
   Two view modes:
     flat — table of every asset row (current + historical)
     byMember — card per active team member with their currently-assigned assets

   Lifecycle (status):
     assigned → currently held by the member at the location
     returned → handed back; row stays for audit, same serial can re-appear
     lost / damaged_retired → terminal */

const ITEM_TYPES = ['Laptop','Phone','Charger','Monitor','Keyboard','Mouse','Headphones','POS Tablet','Card Reader','Printer','UPS','Camera','Furniture','Other']
const CONDITIONS = ['new','good','fair','damaged','lost']
const STATUS_META = {
  assigned:        { label: 'Assigned',        pill: 'bg-green-50 text-green-700' },
  returned:        { label: 'Returned',        pill: 'bg-gray-100 text-gray-500' },
  lost:            { label: 'Lost',            pill: 'bg-red-50 text-red-700' },
  damaged_retired: { label: 'Damaged · retired', pill: 'bg-amber-50 text-amber-700' },
}

const emptyAsset = () => ({
  team_member_id: '',
  item_type: 'Laptop', brand_model: '', serial_number: '',
  purchase_value: '', purchase_date: '',
  condition: 'good', notes: '',
  status: 'assigned',
})

const fmt = (n) => Number(n || 0).toLocaleString('en-IN')

const AssetsPanel = ({ teamMembers = [], currentUserName = '' }) => {
  const [assets, setAssets] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('byMember')   // 'flat' | 'byMember'
  const [statusFilter, setStatusFilter] = useState('assigned')
  const [memberFilter, setMemberFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)   // current asset OR empty for add
  const [returning, setReturning] = useState(null) // asset being returned
  const [openMember, setOpenMember] = useState(null) // team member whose history is being viewed
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: a }, { data: locs }] = await Promise.all([
        supa.from('team_member_assets').select('*').order('status').order('assigned_at', { ascending: false }),
        supa.from('stores').select('id, name, location_type, code').eq('is_active', true).order('name'),
      ])
      setAssets(a || [])
      setLocations(locs || [])
    } catch (e) {
      logAndToast('assets-load', 'Failed to load: ' + (e.message || e), e)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const memberById = useMemo(() => {
    const m = {}; (teamMembers || []).forEach(x => { m[x.id] = x }); return m
  }, [teamMembers])
  const locationById = useMemo(() => {
    const m = {}; locations.forEach(x => { m[x.id] = x }); return m
  }, [locations])

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      if (memberFilter !== 'all' && String(a.team_member_id) !== String(memberFilter)) return false
      if (locationFilter !== 'all' && String(a.location_id) !== String(locationFilter)) return false
      if (!q) return true
      const m = memberById[a.team_member_id]
      const l = locationById[a.location_id]
      const hay = [a.item_type, a.brand_model, a.serial_number, a.notes, m?.name, l?.name].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [assets, statusFilter, memberFilter, locationFilter, search, memberById, locationById])

  // ── Save asset ─────────────────────────────────────────────────────────
  const save = async () => {
    if (!editing) return
    if (!editing.team_member_id) { toast(false, 'Pick a team member'); return }
    if (!editing.item_type)      { toast(false, 'Pick an item type');  return }
    setBusy(true)
    try {
      const blank = (v) => (v === '' || v === undefined ? null : v)
      // Asset location is implicit through the team member — auto-stamp it
      // from team_members.store_id at save time so the location filter +
      // per-location asset counts keep working without a UI field.
      const memberRow = (teamMembers || []).find(x => String(x.id) === String(editing.team_member_id))
      const memberLoc = memberRow?.store_id || null
      const payload = {
        team_member_id: editing.team_member_id,
        location_id:    memberLoc,
        item_type:      editing.item_type,
        brand_model:    blank(editing.brand_model),
        serial_number:  blank(editing.serial_number),
        purchase_value: editing.purchase_value === '' || editing.purchase_value == null ? null : Number(editing.purchase_value),
        purchase_date:  blank(editing.purchase_date),
        condition:      editing.condition || 'good',
        notes:          blank(editing.notes),
      }
      let err
      if (editing.id) {
        const r = await supa.from('team_member_assets').update(payload).eq('id', editing.id)
        err = r.error
        _logChange('update', 'asset', editing.id, `${payload.item_type} ${payload.brand_model || ''}`, {})
      } else {
        payload.status      = 'assigned'
        payload.assigned_at = new Date().toISOString()
        payload.assigned_by = currentUserName || null
        const r = await supa.from('team_member_assets').insert(payload)
        err = r.error
        _logChange('create', 'asset', null, `${payload.item_type} ${payload.brand_model || ''}`, {})
      }
      if (err) throw err
      toast(true, editing.id ? 'Saved' : 'Asset assigned')
      setEditing(null)
      load()
    } catch (e) {
      logAndToast('assets-save', 'Save failed: ' + (e.message || e), e)
    } finally {
      setBusy(false)
    }
  }

  // ── Mark returned ──────────────────────────────────────────────────────
  const submitReturn = async (newStatus = 'returned') => {
    if (!returning) return
    setBusy(true)
    try {
      const payload = {
        status:       newStatus,
        returned_at:  new Date().toISOString(),
        returned_by:  currentUserName || null,
        return_notes: returning.return_notes || null,
        condition:    returning.condition || 'good',
      }
      const { error } = await supa.from('team_member_assets').update(payload).eq('id', returning.id)
      if (error) throw error
      toast(true, `Marked ${STATUS_META[newStatus]?.label.toLowerCase() || newStatus}`)
      setReturning(null)
      load()
    } catch (e) { logAndToast('assets-return', 'Failed: ' + (e.message || e), e) }
    finally { setBusy(false) }
  }

  // ── KPIs ───────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const active = assets.filter(a => a.status === 'assigned')
    const val = active.reduce((s, a) => s + Number(a.purchase_value || 0), 0)
    return { cnt: active.length, val }
  }, [assets])

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* KPI band */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Active assets" v={kpis.cnt} />
        <Kpi label="Active value" v={`₹${fmt(kpis.val.toFixed(0))}`} accent="#494bd6" />
        <Kpi label="Returned" v={assets.filter(a => a.status === 'returned').length} />
        <Kpi label="Lost / retired" v={assets.filter(a => a.status === 'lost' || a.status === 'damaged_retired').length} accent="#dc2626" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 rounded-full" style={{ background: '#f5f4f0' }}>
          {[['byMember','By member'],['flat','Flat list']].map(([k, l]) => {
            const active = mode === k
            return (
              <button key={k} onClick={() => setMode(k)}
                className="px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: active ? '#c9a432' : 'transparent', color: active ? '#fff' : '#6b7280' }}>{l}</button>
            )
          })}
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 bg-white">
          <option value="all">All status</option>
          <option value="assigned">Assigned</option>
          <option value="returned">Returned</option>
          <option value="lost">Lost</option>
          <option value="damaged_retired">Damaged · retired</option>
        </select>
        <select value={memberFilter} onChange={e => setMemberFilter(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 bg-white">
          <option value="all">All members</option>
          {(teamMembers || []).filter(m => m.is_active !== false).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 bg-white">
          <option value="all">All locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search type, brand, serial…"
          className="flex-1 min-w-[160px] px-2 py-1.5 text-xs rounded-lg border border-gray-200" />

        <button onClick={() => setEditing(emptyAsset())} className="btn-gold px-3 py-1.5 rounded-lg text-xs font-bold">+ Assign asset</button>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
      ) : mode === 'flat' ? (
        <FlatTable assets={filteredAssets} memberById={memberById} locationById={locationById}
          onEdit={a => setEditing({ ...a })} onReturn={a => setReturning({ ...a, return_notes: '', condition: a.condition || 'good' })} />
      ) : (
        <ByMember teamMembers={teamMembers} assets={filteredAssets} memberById={memberById} locationById={locationById}
          onAddFor={m => setEditing({ ...emptyAsset(), team_member_id: m.id })}
          onEdit={a => setEditing({ ...a })}
          onReturn={a => setReturning({ ...a, return_notes: '', condition: a.condition || 'good' })}
          onOpen={m => setOpenMember(m)} />
      )}

      {/* Edit / add drawer */}
      {editing && (
        <Drawer title={editing.id ? 'Edit asset' : 'Assign asset'} onClose={() => setEditing(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Team member *">
              <select value={editing.team_member_id || ''} onChange={e => setEditing({ ...editing, team_member_id: e.target.value })}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white">
                <option value="">—</option>
                {(teamMembers || []).filter(m => m.is_active !== false).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Item type *">
              <select value={editing.item_type} onChange={e => setEditing({ ...editing, item_type: e.target.value })}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white">
                {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Condition">
              <select value={editing.condition || 'good'} onChange={e => setEditing({ ...editing, condition: e.target.value })}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white">
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Brand / Model"><Inp value={editing.brand_model} onChange={v => setEditing({ ...editing, brand_model: v })} /></Field>
            <Field label="Serial number"><Inp value={editing.serial_number} onChange={v => setEditing({ ...editing, serial_number: v })} mono /></Field>
            <Field label="Purchase value (₹)"><Inp value={editing.purchase_value ?? ''} onChange={v => setEditing({ ...editing, purchase_value: v })} num /></Field>
            <Field label="Purchase date">
              <input type="date" value={editing.purchase_date || ''} onChange={e => setEditing({ ...editing, purchase_date: e.target.value })}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
            </Field>
            <Field label="Notes" span={2}>
              <textarea value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} rows={2}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600">Cancel</button>
            <button onClick={save} disabled={busy} className="btn-gold px-4 py-1.5 text-sm rounded-lg font-semibold disabled:opacity-50">
              {busy ? 'Saving…' : (editing.id ? 'Save' : 'Assign')}
            </button>
          </div>
        </Drawer>
      )}

      {/* Member detail drawer — shows full asset history (all statuses) */}
      {openMember && (
        <Drawer title={`${openMember.name || '—'} — assets`} onClose={() => setOpenMember(null)}>
          <div className="space-y-3">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              {(() => {
                const avatar = getAvatarUrl(openMember)
                return avatar
                  ? <img src={avatar} className="w-12 h-12 rounded-full object-cover" alt="" onError={e => { e.target.style.display = 'none' }} />
                  : <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-base font-bold text-amber-700">{(openMember.name || '?')[0].toUpperCase()}</div>
              })()}
              <div className="flex-1">
                <div className="font-semibold text-gray-800">{openMember.name || '—'}</div>
                <div className="text-xs text-gray-500">{openMember.designation || '—'}{openMember.store_id ? ' · ' + (locationById[openMember.store_id]?.name || '—') : ''}</div>
              </div>
              <button onClick={() => { setEditing({ ...emptyAsset(), team_member_id: openMember.id }); setOpenMember(null) }}
                className="btn-gold px-3 py-1.5 rounded-lg text-xs font-bold">+ Assign</button>
            </div>

            {(() => {
              const all = assets.filter(a => String(a.team_member_id) === String(openMember.id))
                                .sort((a, b) => (a.status === 'assigned' ? -1 : 1))
              if (all.length === 0) return <div className="text-center py-8 text-gray-400 text-sm">No assets recorded for this member.</div>
              const grouped = { assigned: [], returned: [], lost: [], damaged_retired: [] }
              all.forEach(a => { (grouped[a.status] || grouped.assigned).push(a) })
              return ['assigned','returned','lost','damaged_retired'].filter(k => grouped[k].length).map(k => {
                const st = STATUS_META[k] || STATUS_META.assigned
                return (
                  <div key={k}>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full ${st.pill}`}>{st.label}</span>
                      <span className="text-gray-400">{grouped[k].length}</span>
                    </div>
                    <div className="space-y-1.5 mb-3">
                      {grouped[k].map(a => (
                        <div key={a.id} className="flex items-start justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-gray-800">{a.item_type}{a.brand_model ? ` · ${a.brand_model}` : ''}</div>
                            <div className="text-xs text-gray-500 break-all">
                              {a.serial_number && <span className="font-mono">{a.serial_number}</span>}
                              {a.serial_number && a.condition && ' · '}
                              {a.condition && <span>{a.condition}</span>}
                              {a.purchase_value > 0 && <span> · ₹{fmt(a.purchase_value)}</span>}
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              Assigned {a.assigned_at ? new Date(a.assigned_at).toLocaleDateString('en-IN') : '—'}
                              {a.assigned_by && ` by ${a.assigned_by.split('@')[0]}`}
                              {a.returned_at && ` · Returned ${new Date(a.returned_at).toLocaleDateString('en-IN')}`}
                              {a.returned_by && ` by ${a.returned_by.split('@')[0]}`}
                            </div>
                            {a.return_notes && <div className="text-[11px] text-gray-500 mt-0.5 italic">"{a.return_notes}"</div>}
                            {a.notes && a.status === 'assigned' && <div className="text-[11px] text-gray-500 mt-0.5">Notes: {a.notes}</div>}
                          </div>
                          <div className="flex flex-col items-end gap-1 ml-3 flex-shrink-0">
                            <button onClick={() => { setEditing({ ...a }); setOpenMember(null) }} className="text-[11px] text-gray-500 hover:text-gray-700">Edit</button>
                            {a.status === 'assigned' && (
                              <button onClick={() => { setReturning({ ...a, return_notes: '', condition: a.condition || 'good' }); setOpenMember(null) }}
                                className="text-[11px] text-amber-700 hover:text-amber-800">Return</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </Drawer>
      )}

      {/* Return modal */}
      {returning && (
        <Drawer title={`Return: ${returning.item_type} ${returning.brand_model || ''}`} onClose={() => setReturning(null)}>
          <div className="space-y-3">
            <div className="text-xs text-gray-500">
              Currently held by <span className="font-semibold text-gray-800">{memberById[returning.team_member_id]?.name || 'Unknown'}</span>
              {returning.serial_number && <> · serial <span className="font-mono">{returning.serial_number}</span></>}
            </div>
            <Field label="Condition on return">
              <select value={returning.condition} onChange={e => setReturning({ ...returning, condition: e.target.value })}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white">
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Notes">
              <textarea value={returning.return_notes || ''} onChange={e => setReturning({ ...returning, return_notes: e.target.value })} rows={2}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white" placeholder="Condition, missing accessories, who took the hand-over…" />
            </Field>
            <div className="flex flex-wrap gap-2 mt-2">
              <button onClick={() => submitReturn('returned')} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg font-bold"
                style={{ background: '#dcfce7', color: '#15803d' }}>Mark returned</button>
              <button onClick={() => submitReturn('lost')} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg font-bold"
                style={{ background: '#fee2e2', color: '#991b1b' }}>Mark lost</button>
              <button onClick={() => submitReturn('damaged_retired')} disabled={busy} className="text-sm px-3 py-1.5 rounded-lg font-bold"
                style={{ background: '#fef3c7', color: '#92400e' }}>Damaged · retire</button>
              <button onClick={() => setReturning(null)} className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 ml-auto">Cancel</button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  )
}

// ── Subcomponents ──────────────────────────────────────────────────────────

const Kpi = ({ label, v, accent }) => (
  <div className="bg-white rounded-xl p-3 border border-gray-100">
    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
    <div className="text-lg font-bold mt-0.5" style={{ color: accent || '#1b1c1a', fontFamily: 'Manrope, sans-serif' }}>{v}</div>
  </div>
)

const FlatTable = ({ assets, memberById, locationById, onEdit, onReturn }) => (
  <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
    <table className="w-full text-sm">
      <thead style={{ background: '#f5f4f0' }}>
        <tr>
          {['Item','Brand/Model','Serial','Assigned to','Location','Condition','Value','Status','Actions'].map(h => (
            <th key={h} className="px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-gray-500 font-bold whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {assets.length === 0 && (
          <tr><td colSpan={9} className="text-center py-12 text-gray-400 text-sm">No assets match.</td></tr>
        )}
        {assets.map(a => {
          const m = memberById[a.team_member_id]
          const l = locationById[a.location_id]
          const st = STATUS_META[a.status] || STATUS_META.assigned
          return (
            <tr key={a.id} className="border-t border-gray-50">
              <td className="px-3 py-2 text-gray-800 font-medium">{a.item_type}</td>
              <td className="px-3 py-2 text-gray-600">{a.brand_model || '—'}</td>
              <td className="px-3 py-2 font-mono text-[11px] text-gray-600">{a.serial_number || '—'}</td>
              <td className="px-3 py-2 text-gray-700">{m?.name || '—'}</td>
              <td className="px-3 py-2 text-gray-600">{l?.name || '—'}</td>
              <td className="px-3 py-2 text-gray-600">{a.condition || '—'}</td>
              <td className="px-3 py-2 text-gray-700 tabular-nums">{a.purchase_value > 0 ? `₹${fmt(a.purchase_value)}` : '—'}</td>
              <td className="px-3 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.pill}`}>{st.label}</span></td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                  <button onClick={() => onEdit(a)} className="text-xs px-2 py-1 rounded hover:bg-gray-50 text-gray-500">Edit</button>
                  {a.status === 'assigned' && (
                    <button onClick={() => onReturn(a)} className="text-xs px-2 py-1 rounded hover:bg-amber-50 text-amber-700">Return…</button>
                  )}
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  </div>
)

const ByMember = ({ teamMembers, assets, memberById, locationById, onAddFor, onEdit, onReturn, onOpen }) => {
  const active = (teamMembers || []).filter(m => m.is_active !== false)
  return (
    <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
      {active.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm col-span-full">No active team members.</div>
      )}
      {active.map(m => {
        const mine = assets.filter(a => String(a.team_member_id) === String(m.id) && a.status === 'assigned')
        const val = mine.reduce((s, a) => s + Number(a.purchase_value || 0), 0)
        const avatar = getAvatarUrl(m)
        // getDisplayName takes an email string, not the member object
        const display = m.name || getDisplayName(m.email || '') || '—'
        return (
          <div key={m.id} className="bg-white rounded-xl border border-gray-100 p-3 hover:border-amber-300 transition-colors cursor-pointer"
            onClick={() => onOpen && onOpen(m)}>
            <div className="flex items-center gap-2 mb-2">
              {avatar
                ? <img src={avatar} className="w-9 h-9 rounded-full object-cover" alt="" onError={e => { e.target.style.display = 'none' }} />
                : <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-sm font-bold text-amber-700">{(display || '?')[0].toUpperCase()}</div>}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-800 truncate">{display}</div>
                <div className="text-[11px] text-gray-400 truncate">{m.designation || ''}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); onAddFor(m) }} className="text-[10px] font-bold px-2 py-1 rounded bg-amber-100 text-amber-700">+ Add</button>
            </div>
            <div className="text-[11px] text-gray-500 mb-2">{mine.length} item{mine.length===1?'':'s'} · ₹{fmt(val)}</div>
            {mine.length === 0 && <div className="text-[11px] text-gray-400 py-2">No assets assigned.</div>}
            <div className="space-y-1.5">
              {mine.map(a => (
                <div key={a.id} className="flex items-start justify-between bg-gray-50 rounded-lg px-2 py-1.5 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-800">{a.item_type}</div>
                    <div className="text-gray-500 truncate">{a.brand_model || ''}{a.serial_number ? ` · ${a.serial_number}` : ''}</div>

                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    <button onClick={e => { e.stopPropagation(); onEdit(a) }} className="text-[10px] text-gray-500 hover:text-gray-700">Edit</button>
                    <button onClick={e => { e.stopPropagation(); onReturn(a) }} className="text-[10px] text-amber-700 hover:text-amber-800">Return</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const Drawer = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
    <div className="bg-white sm:rounded-2xl rounded-t-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto p-5"
      style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.18)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">✕</button>
      </div>
      {children}
    </div>
  </div>
)
const Field = ({ label, children, span = 1 }) => (
  <div style={{ gridColumn: `span ${span} / span ${span}` }}>
    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</div>
    {children}
  </div>
)
const Inp = ({ value, onChange, num, mono }) => (
  <input type="text" inputMode={num ? 'decimal' : 'text'} value={value ?? ''} onChange={e => onChange(e.target.value)}
    className={`w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 bg-white outline-none focus:border-amber-400 ${mono ? 'font-mono' : ''}`} />
)

export default AssetsPanel

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { api } from '../../lib/api'
import { C, toast } from '../../lib/designTokens'
import { Btn, Badge, Field, Input, Select, Overlay } from '../orders/ui'

/*
 * Appointments — consultations booked from the mobile app (video call, store visit,
 * callback). Staff confirm or decline requests, assign a stylist, reschedule, and
 * record the outcome. Every change goes through the Customer API
 * (/staff/appointments) and is written to the booking's activity log.
 *
 * Lifecycle: requested → confirmed → completed | no_show
 *            requested → declined ;  requested|confirmed → cancelled ;  reopen → requested
 */

const PAGE_SIZE = 20

const STATUS_META = {
  requested: { label: 'Awaiting confirmation', short: 'Awaiting', color: C.amber, bg: C.amberBg },
  confirmed: { label: 'Confirmed', short: 'Confirmed', color: C.blue, bg: C.blueBg },
  completed: { label: 'Completed', short: 'Completed', color: C.green, bg: C.greenBg },
  no_show: { label: 'Missed', short: 'Missed', color: C.purple, bg: C.purpleBg },
  declined: { label: 'Declined', short: 'Declined', color: '#64748b', bg: 'rgba(100,116,139,0.08)' },
  cancelled: { label: 'Cancelled', short: 'Cancelled', color: C.red, bg: C.redBg },
}
const STATUS_ORDER = ['requested', 'confirmed', 'completed', 'no_show', 'declined', 'cancelled']

const TYPE_META = {
  video_call: { label: 'Video call', icon: '🎥' },
  store_visit: { label: 'Store visit', icon: '🏬' },
  callback: { label: 'Callback', icon: '📞' },
}

const RANGES = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'today', label: 'Today' },
  { value: 'next7', label: 'Next 7 days' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All dates' },
]

const FLAG_META = {
  needs_outcome: { label: 'Needs outcome', color: C.red, bg: C.redBg },
  request_expired: { label: 'Request expired', color: C.red, bg: C.redBg },
  today: { label: 'Today', color: C.goldDark, bg: C.goldLight },
}

/** Actions → button label, modal copy and what the modal asks for. */
const ACTIONS = {
  confirm: { label: 'Confirm', primary: true, title: 'Confirm appointment', fields: ['assignedTo', 'meetingLink', 'note'], path: 'confirm' },
  reschedule: { label: 'Reschedule', title: 'Reschedule appointment', fields: ['date', 'slot', 'note'] },
  complete: { label: 'Mark completed', primary: true, title: 'Mark as completed', fields: ['note'], path: 'complete' },
  no_show: { label: 'Mark missed', title: 'Customer did not attend', fields: ['note'], path: 'no-show' },
  decline: { label: 'Decline', danger: true, title: 'Decline request', fields: ['reason'], path: 'decline', reasonRequired: true },
  cancel: { label: 'Cancel', danger: true, title: 'Cancel appointment', fields: ['reason'], path: 'cancel', reasonRequired: true },
  reopen: { label: 'Reopen', title: 'Reopen as a new request', fields: ['note'], path: 'reopen' },
}
const ACTION_ORDER = ['confirm', 'complete', 'reschedule', 'no_show', 'decline', 'cancel', 'reopen']

const EVENT_LABELS = {
  created: 'Booked',
  confirm: 'Confirmed',
  decline: 'Declined',
  complete: 'Marked completed',
  no_show: 'Marked missed',
  cancel: 'Cancelled',
  cancelled: 'Cancelled',
  reopen: 'Reopened',
  rescheduled: 'Rescheduled',
  updated: 'Updated',
  details_updated: 'Customer edited details',
}

// ── Formatting ────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000
const fmtDay = (iso) => {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
const fmtDateTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}
const relativeDay = (iso, today) => {
  if (!iso || !today) return ''
  const diff = Math.round((new Date(`${iso}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / DAY)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`
}
const digits = (s) => String(s || '').replace(/\D/g, '')
const waLink = (phone) => {
  const d = digits(phone)
  return d ? `https://wa.me/${d.length === 10 ? `91${d}` : d}` : null
}
const occasionLabel = (o) => (o ? o.charAt(0).toUpperCase() + o.slice(1).replace(/_/g, ' ') : '—')

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: '#64748b' }
  return <Badge color={m.color} bg={m.bg}>{m.label.toUpperCase()}</Badge>
}

// ── Action modal ──────────────────────────────────────────────────────────────

function ActionModal({ action, appt, meta, onClose, onDone }) {
  const cfg = ACTIONS[action]
  const [form, setForm] = useState({
    assignedTo: appt.assignedTo || '',
    meetingLink: appt.meetingLink || '',
    note: '',
    reason: '',
    date: appt.appointmentDate,
    slot: appt.timeSlot,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const needsLink = action === 'confirm' && appt.type === 'video_call' && !form.meetingLink.trim()

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (cfg.reasonRequired && !form.reason.trim()) { setError('Please give a reason. The customer sees it in the app.'); return }
    setSaving(true)
    try {
      let updated
      if (action === 'reschedule') {
        updated = await api.appointmentReschedule(appt.id, { appointmentDate: form.date, timeSlot: form.slot, note: form.note || null })
      } else {
        const body = { note: form.note || null, reason: form.reason || null }
        if (action === 'confirm') {
          body.meetingLink = form.meetingLink.trim() || null
          body.assignedTo = form.assignedTo || null
        }
        updated = await api.appointmentAction(appt.id, cfg.path, body)
      }
      toast(true, `${appt.id}: ${STATUS_META[updated.bookingStatus]?.label || 'updated'}`)
      onDone(updated)
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="bg-white rounded-3xl w-full max-w-md shadow-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.borderLight }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: C.text }}>{cfg.title}</h2>
            <div className="text-xs mt-0.5" style={{ color: C.textMuted }}>
              {appt.id} · {appt.name} · {fmtDay(appt.appointmentDate)}, {appt.timeSlot}
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {cfg.fields.includes('date') && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="New date" required>
                <Input type="date" value={form.date} min={meta?.today} onChange={(e) => set('date', e.target.value)} required />
              </Field>
              <Field label="Time slot" required>
                <Select value={form.slot} onChange={(e) => set('slot', e.target.value)}>
                  {(meta?.timeSlots || []).map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
            </div>
          )}
          {cfg.fields.includes('date') && appt.bookingStatus === 'confirmed' && (
            <div className="text-xs" style={{ color: C.textMuted }}>The booking stays confirmed at the new time.</div>
          )}

          {cfg.fields.includes('assignedTo') && (
            <Field label="Stylist">
              <Select value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                <option value="">— Not assigned —</option>
                {(meta?.team || []).map((m) => <option key={m.id} value={m.id}>{m.name}{m.role ? ` · ${m.role}` : ''}</option>)}
              </Select>
            </Field>
          )}

          {cfg.fields.includes('meetingLink') && appt.type === 'video_call' && (
            <Field label="Video call link">
              <Input value={form.meetingLink} onChange={(e) => set('meetingLink', e.target.value)} placeholder="https://meet.google.com/…" />
              {needsLink && (
                <div className="text-[11px] mt-1" style={{ color: C.amber }}>
                  No link yet. The customer will see the booking as confirmed without a link; you can add it later.
                </div>
              )}
            </Field>
          )}

          {cfg.fields.includes('reason') && (
            <Field label="Reason (shown to the customer)" required>
              <textarea
                value={form.reason}
                onChange={(e) => set('reason', e.target.value)}
                rows={3}
                className="w-full text-sm px-3 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-amber-200"
                style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                placeholder={action === 'decline' ? 'e.g. No stylist available that day. Please pick another date.' : 'e.g. Customer asked to cancel by phone'}
              />
            </Field>
          )}

          {cfg.fields.includes('note') && (
            <Field label="Internal note (optional)">
              <Input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Recorded in the activity log" />
            </Field>
          )}

          {error && <div className="text-xs rounded-xl px-3 py-2" style={{ background: C.redBg, color: C.red }}>{error}</div>}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: C.borderLight }}>
          <Btn type="button" onClick={onClose}>Back</Btn>
          <Btn type="submit" primary={!cfg.danger} danger={cfg.danger} disabled={saving}>
            {saving ? 'Saving…' : cfg.label}
          </Btn>
        </div>
      </form>
    </Overlay>
  )
}

// ── Expanded detail ───────────────────────────────────────────────────────────

function DetailRow({ label, children }) {
  return (
    <div>
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">{label}</span>
      <div className="text-sm" style={{ color: C.text }}>{children}</div>
    </div>
  )
}

function AppointmentDetail({ id, meta, onChanged, onAction }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')
  const [edit, setEdit] = useState({ assignedTo: '', meetingLink: '', staffNotes: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const d = await api.appointment(id)
      setDetail(d)
      setEdit({
        assignedTo: d.appointment.assignedTo || '',
        meetingLink: d.appointment.meetingLink || '',
        staffNotes: d.appointment.staffNotes || '',
      })
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  if (error) return <div className="py-8 text-center text-xs" style={{ color: C.red }}>Could not load this appointment: {error}</div>
  if (!detail) return <div className="py-10 text-center text-xs text-gray-400">Loading appointment…</div>

  const a = detail.appointment
  const dirty =
    (edit.assignedTo || '') !== (a.assignedTo || '') ||
    (edit.meetingLink || '') !== (a.meetingLink || '') ||
    (edit.staffNotes || '') !== (a.staffNotes || '')

  const saveEdits = async () => {
    setSaving(true)
    try {
      const body = {}
      if ((edit.assignedTo || '') !== (a.assignedTo || '')) body.assignedTo = edit.assignedTo || null
      if ((edit.meetingLink || '') !== (a.meetingLink || '')) body.meetingLink = edit.meetingLink.trim() || null
      if ((edit.staffNotes || '') !== (a.staffNotes || '')) body.staffNotes = edit.staffNotes.trim() || null
      const updated = await api.appointmentUpdate(a.id, body)
      toast(true, 'Appointment updated')
      onChanged(updated)
      load()
    } catch (e) {
      toast(false, e.message)
    } finally {
      setSaving(false)
    }
  }

  const actions = [
    ...a.allowedActions,
    ...(['requested', 'confirmed'].includes(a.bookingStatus) ? ['reschedule'] : []),
  ].sort((x, y) => ACTION_ORDER.indexOf(x) - ACTION_ORDER.indexOf(y))
  const wa = waLink(a.whatsapp)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Booking & customer */}
      <div className="lg:col-span-4 bg-white p-5 rounded-2xl border space-y-4" style={{ borderColor: C.border }}>
        <div className="border-b pb-3" style={{ borderColor: C.borderLight }}>
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: C.text }}>Booking details</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DetailRow label="Customer">{a.name}</DetailRow>
          <DetailRow label="Booked">{fmtDateTime(a.createdAt)}</DetailRow>
          <DetailRow label="WhatsApp">
            <span className="font-mono text-xs select-all">{a.whatsapp}</span>
            {wa && <a href={wa} target="_blank" rel="noreferrer" className="ml-2 text-xs font-bold" style={{ color: C.green }}>Chat ↗</a>}
          </DetailRow>
          <DetailRow label="Email"><span className="text-xs select-all break-all">{a.email}</span></DetailRow>
          <DetailRow label="Occasion">{occasionLabel(a.occasion)}</DetailRow>
          <DetailRow label="Event date">{a.eventDate ? fmtDay(a.eventDate) : '—'}</DetailRow>
          <DetailRow label="Type">{TYPE_META[a.type]?.icon} {a.typeLabel}</DetailRow>
          <DetailRow label="Customer time zone">{a.timeZone === 'Asia/Kolkata' ? 'India (IST)' : a.timeZone}</DetailRow>
        </div>
        {a.type === 'store_visit' && (
          <DetailRow label="Store">
            <div className="font-semibold">{a.storeName || '—'}</div>
            <div className="text-xs" style={{ color: C.textMuted }}>{a.storeAddress}</div>
          </DetailRow>
        )}
        <DetailRow label="Customer's note">
          <div className="text-sm whitespace-pre-wrap" style={{ color: a.notes ? C.text : C.textLight }}>{a.notes || 'No note'}</div>
        </DetailRow>
        <div className="flex flex-wrap gap-2 text-[11px]" style={{ color: C.textMuted }}>
          <span>Source: {a.source === 'app' ? 'Mobile app' : a.source}</span>
          {a.rescheduleCount > 0 && <span>· Rescheduled {a.rescheduleCount}×</span>}
          {detail.customer ? <span>· App account: {detail.customer.name || detail.customer.phone}</span> : <span>· Guest booking</span>}
        </div>
        {a.cancelReason && (
          <div className="text-xs rounded-xl px-3 py-2" style={{ background: C.redBg, color: C.red }}>
            {a.bookingStatus === 'declined' ? 'Declined' : 'Cancelled'}{a.cancelledBy ? ` by ${a.cancelledBy}` : ''}: {a.cancelReason}
          </div>
        )}
        {detail.history.length > 0 && (
          <div className="border-t pt-3" style={{ borderColor: C.borderLight }}>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Other bookings by this customer ({detail.history.length})</h4>
            <div className="space-y-1.5">
              {detail.history.slice(0, 5).map((h) => (
                <div key={h.id} className="flex items-center justify-between text-xs">
                  <span style={{ color: C.text }}>{fmtDay(h.appointmentDate)} · {h.typeLabel}</span>
                  <StatusBadge status={h.bookingStatus} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Manage */}
      <div className="lg:col-span-4 bg-white p-5 rounded-2xl border space-y-4" style={{ borderColor: C.border }}>
        <div className="border-b pb-3 flex items-center justify-between" style={{ borderColor: C.borderLight }}>
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: C.text }}>Manage</h3>
          <StatusBadge status={a.bookingStatus} />
        </div>

        {a.flag === 'needs_outcome' && (
          <div className="text-xs rounded-xl px-3 py-2" style={{ background: C.redBg, color: C.red }}>
            This appointment's time has passed. Record whether it happened.
          </div>
        )}
        {a.flag === 'request_expired' && (
          <div className="text-xs rounded-xl px-3 py-2" style={{ background: C.redBg, color: C.red }}>
            This request's date passed before it was confirmed. Reschedule it with the customer or decline it.
          </div>
        )}

        {actions.length ? (
          <div className="flex flex-wrap gap-2">
            {actions.map((k) => (
              <Btn key={k} small primary={ACTIONS[k].primary} danger={ACTIONS[k].danger} onClick={() => onAction(k, a)}>
                {ACTIONS[k].label}
              </Btn>
            ))}
          </div>
        ) : (
          <div className="text-xs" style={{ color: C.textMuted }}>No further actions. This appointment is {STATUS_META[a.bookingStatus].label.toLowerCase()}.</div>
        )}

        <div className="border-t pt-4 space-y-3" style={{ borderColor: C.borderLight }}>
          <Field label="Stylist">
            <Select value={edit.assignedTo} onChange={(e) => setEdit((x) => ({ ...x, assignedTo: e.target.value }))}>
              <option value="">— Not assigned —</option>
              {(meta?.team || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
          {a.type === 'video_call' && (
            <Field label="Video call link">
              <Input value={edit.meetingLink} onChange={(e) => setEdit((x) => ({ ...x, meetingLink: e.target.value }))} placeholder="https://meet.google.com/…" />
              <div className="text-[11px] mt-1" style={{ color: C.textMuted }}>Shown to the customer once the booking is confirmed.</div>
            </Field>
          )}
          <Field label="Staff notes (not shown to the customer)">
            <textarea
              value={edit.staffNotes}
              onChange={(e) => setEdit((x) => ({ ...x, staffNotes: e.target.value }))}
              rows={3}
              className="w-full text-sm px-3 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-amber-200"
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
              placeholder="Preferences, measurements, follow-ups…"
            />
          </Field>
          <div className="flex justify-end">
            <Btn small primary disabled={!dirty || saving} onClick={saveEdits}>{saving ? 'Saving…' : 'Save changes'}</Btn>
          </div>
        </div>
      </div>

      {/* Activity */}
      <div className="lg:col-span-4 bg-white p-5 rounded-2xl border" style={{ borderColor: C.border }}>
        <div className="border-b pb-3 mb-4" style={{ borderColor: C.borderLight }}>
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: C.text }}>Activity</h3>
        </div>
        {detail.events.length === 0 ? (
          <div className="text-xs text-gray-400">No activity recorded.</div>
        ) : (
          <ol className="space-y-4">
            {[...detail.events].reverse().map((ev) => {
              const to = ev.toStatus && ev.toStatus !== ev.fromStatus ? STATUS_META[ev.toStatus] : null
              const move = ev.meta?.from && ev.meta?.to ? `${fmtDay(ev.meta.from.date)} ${ev.meta.from.slot} → ${fmtDay(ev.meta.to.date)} ${ev.meta.to.slot}` : null
              return (
                <li key={ev.id} className="flex gap-3">
                  <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: to?.color || C.textLight }} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold" style={{ color: C.text }}>
                      {EVENT_LABELS[ev.action] || ev.action}
                      {to && <span className="font-semibold" style={{ color: to.color }}> · {to.short}</span>}
                    </div>
                    <div className="text-[11px]" style={{ color: C.textMuted }}>
                      {ev.actorType === 'customer' ? 'Customer' : ev.actorName || 'Staff'} · {fmtDateTime(ev.createdAt)}
                    </div>
                    {move && <div className="text-[11px] mt-0.5" style={{ color: C.text }}>{move}</div>}
                    {ev.note && <div className="text-[11px] mt-0.5 whitespace-pre-wrap" style={{ color: C.text }}>{ev.note}</div>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function AppointmentsTab() {
  const [meta, setMeta] = useState(null)
  const [summary, setSummary] = useState(null)
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [status, setStatus] = useState('requested')
  const [range, setRange] = useState('upcoming')
  const [type, setType] = useState('all')
  const [storeId, setStoreId] = useState('all')
  const [assignedTo, setAssignedTo] = useState('all')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)

  const [expandedId, setExpandedId] = useState(null)
  const [detailKey, setDetailKey] = useState(0)
  const [modal, setModal] = useState(null) // { action, appt }
  const seq = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    api.appointmentsMeta().then(setMeta).catch((e) => toast(false, 'Could not load appointment options: ' + e.message))
  }, [])

  const loadSummary = useCallback(() => {
    api.appointmentsSummary().then(setSummary).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    const mine = ++seq.current
    setLoading(true)
    setLoadError('')
    try {
      const res = await api.appointmentsList({
        status: status === 'all' ? '' : status,
        range,
        type,
        storeId,
        assignedTo,
        q: debounced,
        page,
        limit: PAGE_SIZE,
      })
      if (mine !== seq.current) return
      setRows(res.data || [])
      setCounts(res.statusCounts || {})
      setTotal(res.meta?.total || 0)
    } catch (e) {
      if (mine !== seq.current) return
      setRows([])
      setLoadError(e.message || 'Failed to load appointments')
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [status, range, type, storeId, assignedTo, debounced, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadSummary() }, [loadSummary])

  const refresh = () => { load(); loadSummary(); setDetailKey((k) => k + 1) }

  const onChanged = (updated) => {
    setRows((list) => list.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
    loadSummary()
  }

  const onActionDone = (updated) => {
    setModal(null)
    onChanged(updated)
    setDetailKey((k) => k + 1)
    load()
  }

  const applyTile = (tile) => {
    setPage(1)
    setExpandedId(null)
    if (tile === 'awaiting') { setStatus('requested'); setRange('upcoming') }
    if (tile === 'today') { setStatus('all'); setRange('today') }
    if (tile === 'next7') { setStatus('confirmed'); setRange('next7') }
    if (tile === 'needsOutcome') { setStatus('confirmed'); setRange('past') }
  }

  const statusTabs = useMemo(() => {
    const all = STATUS_ORDER.reduce((n, s) => n + (counts[s] || 0), 0)
    return [{ value: 'all', label: 'All', count: all }, ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].short, count: counts[s] || 0 }))]
  }, [counts])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const today = meta?.today || summary?.today
  const selectCls = 'text-xs font-bold bg-gray-50 border px-3 py-2 rounded-2xl outline-none focus:ring-1 focus:ring-amber-200'

  const tiles = [
    { key: 'awaiting', label: 'Awaiting confirmation', value: summary?.awaiting, color: C.amber },
    { key: 'today', label: 'Today', value: summary?.todayCount, color: C.goldDark },
    { key: 'next7', label: 'Confirmed · next 7 days', value: summary?.next7, color: C.blue },
    { key: 'needsOutcome', label: 'Needs outcome', value: summary?.needsOutcome, color: C.red },
  ]

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: C.text }}>Appointments</h1>
          <p className="text-sm mt-1" style={{ color: C.textMuted }}>
            Video calls, store visits and callbacks booked from the Customer Mobile App
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {tiles.map((t) => (
            <button
              key={t.key}
              onClick={() => applyTile(t.key)}
              className="bg-white px-4 py-2 rounded-2xl shadow-sm border text-left hover:border-amber-300 transition-colors"
              style={{ borderColor: C.border }}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: C.textLight }}>{t.label}</span>
              <span className="text-xl font-bold" style={{ color: t.value ? t.color : C.text }}>{t.value ?? '—'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {statusTabs.map((t) => {
          const active = status === t.value
          const m = STATUS_META[t.value]
          return (
            <button
              key={t.value}
              onClick={() => { setStatus(t.value); setPage(1); setExpandedId(null) }}
              className="text-xs font-bold px-3 py-1.5 rounded-full border transition-all inline-flex items-center gap-1.5"
              style={{
                borderColor: active ? (m?.color || C.gold) : C.border,
                background: active ? (m?.bg || C.goldLight) : '#fff',
                color: active ? (m?.color || C.goldDark) : C.textMuted,
              }}
            >
              {t.label}
              <span className="text-[10px] px-1.5 rounded-full" style={{ background: active ? '#fff' : C.bg }}>{t.count}</span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border mb-6 flex flex-wrap gap-3 items-center justify-between" style={{ borderColor: C.border }}>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative min-w-[260px]">
            <input
              type="text"
              placeholder="Search by ID, name, phone, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm pl-9 pr-4 py-2 rounded-2xl border outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200 transition-all"
              style={{ background: C.bg, borderColor: C.border, color: C.text }}
            />
            <span className="absolute left-3 top-2.5 text-gray-400">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </span>
          </div>
          <select value={range} onChange={(e) => { setRange(e.target.value); setPage(1) }} className={selectCls} style={{ color: C.text, borderColor: C.border }}>
            {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label.toUpperCase()}</option>)}
          </select>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1) }} className={selectCls} style={{ color: C.text, borderColor: C.border }}>
            <option value="all">ALL TYPES</option>
            {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label.toUpperCase()}</option>)}
          </select>
          {(type === 'all' || type === 'store_visit') && (
            <select value={storeId} onChange={(e) => { setStoreId(e.target.value); setPage(1) }} className={selectCls} style={{ color: C.text, borderColor: C.border }}>
              <option value="all">ALL STORES</option>
              {(meta?.stores || []).map((s) => <option key={s.id} value={s.id}>{s.name.toUpperCase()}</option>)}
            </select>
          )}
          <select value={assignedTo} onChange={(e) => { setAssignedTo(e.target.value); setPage(1) }} className={selectCls} style={{ color: C.text, borderColor: C.border }}>
            <option value="all">ANY STYLIST</option>
            <option value="unassigned">UNASSIGNED</option>
            {(meta?.team || []).map((m) => <option key={m.id} value={m.id}>{m.name.toUpperCase()}</option>)}
          </select>
        </div>
        <Btn onClick={refresh} small>
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" /></svg>
            Refresh
          </span>
        </Btn>
      </div>

      {/* List */}
      <div className="bg-white rounded-3xl shadow-sm border overflow-hidden" style={{ borderColor: C.border }}>
        {loading && rows.length === 0 ? (
          <div className="py-20 text-center text-sm" style={{ color: C.textMuted }}>Loading appointments…</div>
        ) : loadError ? (
          <div className="py-20 text-center">
            <div className="text-sm font-bold" style={{ color: C.red }}>Could not load appointments</div>
            <div className="text-xs mt-1 mb-4" style={{ color: C.textMuted }}>{loadError}</div>
            <Btn small onClick={refresh}>Try again</Btn>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3">📅</div>
            <div className="text-sm font-bold" style={{ color: C.text }}>No appointments here</div>
            <div className="text-xs mt-1" style={{ color: C.textMuted }}>
              {status === 'requested' && range === 'upcoming' ? 'Nothing is waiting for confirmation.' : 'Try another status, date range or search.'}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ opacity: loading ? 0.6 : 1 }}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: C.border, background: C.bg }}>
                  {['Scheduled', 'Customer', 'Type', 'Occasion', 'Stylist', 'Status', ''].map((h, i) => (
                    <th key={i} className={`p-4 text-xs font-bold uppercase tracking-wider text-gray-500 ${i === 6 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const open = expandedId === a.id
                  const flag = a.flag ? FLAG_META[a.flag] : null
                  return (
                    <React.Fragment key={a.id}>
                      <tr
                        className={`border-b hover:bg-gray-50/50 cursor-pointer transition-colors ${open ? 'bg-amber-50/10' : ''}`}
                        style={{ borderColor: C.border }}
                        onClick={() => setExpandedId(open ? null : a.id)}
                      >
                        <td className="p-4">
                          <div className="font-bold text-sm" style={{ color: C.text }}>{fmtDay(a.appointmentDate)}</div>
                          <div className="text-xs flex items-center gap-1.5 flex-wrap" style={{ color: C.textMuted }}>
                            <span className="font-semibold" style={{ color: C.text }}>{a.timeSlot}</span>
                            <span>· {relativeDay(a.appointmentDate, today)}</span>
                            {flag && <Badge color={flag.color} bg={flag.bg}>{flag.label.toUpperCase()}</Badge>}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="font-semibold text-sm" style={{ color: C.text }}>{a.name}</div>
                          <div className="text-xs font-mono" style={{ color: C.textMuted }}>{a.whatsapp}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-sm" style={{ color: C.text }}>{TYPE_META[a.type]?.icon} {a.typeLabel}</div>
                          {a.type === 'store_visit' && <div className="text-xs" style={{ color: C.textMuted }}>{a.storeName}</div>}
                        </td>
                        <td className="p-4">
                          <div className="text-sm" style={{ color: C.text }}>{occasionLabel(a.occasion)}</div>
                          {a.eventDate && <div className="text-xs" style={{ color: C.textMuted }}>Event {fmtDay(a.eventDate)}</div>}
                        </td>
                        <td className="p-4 text-sm" style={{ color: a.assignedName ? C.text : C.textLight }}>{a.assignedName || 'Unassigned'}</td>
                        <td className="p-4">
                          <StatusBadge status={a.bookingStatus} />
                          <div className="text-[10px] font-mono mt-1" style={{ color: C.textLight }}>{a.id}</div>
                        </td>
                        <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {a.allowedActions.includes('confirm') && (
                              <Btn small primary onClick={() => setModal({ action: 'confirm', appt: a })}>Confirm</Btn>
                            )}
                            {a.flag === 'needs_outcome' && (
                              <Btn small primary onClick={() => setModal({ action: 'complete', appt: a })}>Completed</Btn>
                            )}
                            <button
                              onClick={() => setExpandedId(open ? null : a.id)}
                              aria-label={open ? 'Collapse' : 'Expand'}
                              className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors text-gray-500"
                            >
                              <svg className={`w-4 h-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan="7" className="p-6 bg-gray-50/40 border-b" style={{ borderColor: C.border }}>
                            <AppointmentDetail
                              key={`${a.id}-${detailKey}`}
                              id={a.id}
                              meta={meta}
                              onChanged={onChanged}
                              onAction={(action, appt) => setModal({ action, appt })}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loadError && total > PAGE_SIZE && (
          <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: C.border, background: C.bg }}>
            <span className="text-xs font-medium" style={{ color: C.textMuted }}>
              Showing {(page - 1) * PAGE_SIZE + 1} – {Math.min(page * PAGE_SIZE, total)} of {total} appointments
            </span>
            <div className="flex gap-2">
              <Btn small disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Btn>
              <Btn small disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Btn>
            </div>
          </div>
        )}
      </div>

      {modal && (
        <ActionModal
          action={modal.action}
          appt={modal.appt}
          meta={meta}
          onClose={() => setModal(null)}
          onDone={onActionDone}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   EVENTS LIST — RSVP submissions from events / experiences landing pages
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { C, toast } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { Input, Select, Badge, Btn } from './ui'

const STATUS_OPTIONS = ['prospect', 'pending', 'confirmed', 'attended', 'no-show', 'cancelled']
const STATUS_COLORS = {
  prospect:  { color: '#475569', bg: 'rgba(100,116,139,0.12)' },
  pending:   { color: C.amber, bg: C.amberBg },
  confirmed: { color: C.blue,  bg: C.blueBg },
  attended:  { color: C.green, bg: C.greenBg },
  'no-show': { color: C.red,   bg: C.redBg },
  cancelled: { color: C.textMuted, bg: C.bg }
}
const DEFAULT_EVENT_SLUG = 'summer-story-2026'
const PAYMENT_OPTIONS = ['unpaid', 'paid', 'refunded']
const PAYMENT_COLORS = {
  unpaid:   { color: C.red,   bg: C.redBg },
  paid:     { color: C.green, bg: C.greenBg },
  refunded: { color: C.amber, bg: C.amberBg }
}

/* ─── Create / Edit Modal ────────────────────────────────────────────── */
const RsvpFormModal = ({ rsvp, mode, eventSlugs, defaultEventSlug, onClose, onSave }) => {
  const isCreate = mode === 'create'
  const [form, setForm] = useState({
    event_slug: (rsvp && rsvp.event_slug) || defaultEventSlug || DEFAULT_EVENT_SLUG,
    name: (rsvp && rsvp.name) || '',
    phone: (rsvp && rsvp.phone) || '',
    email: (rsvp && rsvp.email) || '',
    guests: (rsvp && rsvp.guests) || 1,
    workshop_interest: (rsvp && rsvp.workshop_interest) || 'not_sure',
    preferred_time: (rsvp && rsvp.preferred_time) || 'no_preference',
    notes: (rsvp && rsvp.notes) || '',
    status: (rsvp && rsvp.status) || (isCreate ? 'prospect' : 'pending'),
    payment_status: (rsvp && rsvp.payment_status) || 'unpaid',
    internal_notes: (rsvp && rsvp.internal_notes) || ''
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    if (!(form.name || '').trim() || !(form.phone || '').trim()) {
      toast(false, 'Name and phone are required')
      return
    }
    if (isCreate && !(form.event_slug || '').trim()) {
      toast(false, 'Event is required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: (form.name || '').trim(),
        phone: (form.phone || '').trim(),
        email: (form.email || '').trim() || null,
        guests: parseInt(form.guests) || 1,
        workshop_interest: form.workshop_interest,
        preferred_time: form.preferred_time,
        notes: (form.notes || '').trim() || null,
        status: form.status,
        payment_status: form.payment_status,
        internal_notes: (form.internal_notes || '').trim() || null
      }
      if (isCreate) {
        payload.event_slug = (form.event_slug || '').trim()
        const { data, error } = await supa.from('event_rsvps').insert([payload]).select().single()
        if (error) throw error
        onSave(data)
        toast(true, 'Prospect added')
      } else {
        const { error } = await supa.from('event_rsvps').update(payload).eq('id', rsvp.id)
        if (error) throw error
        onSave({ ...rsvp, ...payload })
        toast(true, 'RSVP updated')
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast(false, isCreate ? 'Failed to add prospect' : 'Failed to update RSVP')
    } finally {
      setSaving(false)
    }
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,.45)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '1rem'
  }
  const modalStyle = {
    background: C.cardBg, borderRadius: '16px', width: '100%', maxWidth: '560px',
    maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.15)'
  }
  const headerStyle = {
    padding: '20px 24px', borderBottom: `1px solid ${C.border}`,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
  }
  const bodyStyle = { padding: '20px 24px' }
  const rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }
  const fullStyle = { marginBottom: '14px' }
  const labelStyle = { display: 'block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textMuted, marginBottom: '4px' }
  const footerStyle = {
    padding: '16px 24px', borderTop: `1px solid ${C.border}`,
    display: 'flex', justifyContent: 'flex-end', gap: '10px'
  }

  const eventOptionsList = useMemo(() => {
    const base = new Set(eventSlugs || [])
    base.add(DEFAULT_EVENT_SLUG)
    if (form.event_slug) base.add(form.event_slug)
    return [...base].sort()
  }, [eventSlugs, form.event_slug])

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ fontWeight: 700, fontSize: '16px', color: C.text }}>
            {isCreate ? 'Add Prospect' : `Edit RSVP — ${rsvp.name}`}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: C.textMuted, padding: '4px' }}>&times;</button>
        </div>
        <div style={bodyStyle}>
          {isCreate && (
            <>
              <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.2)', fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
                <strong>New prospect will be added with status </strong>
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '6px', background: 'rgba(100,116,139,0.15)', color: '#475569', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>prospect</span>
                <span> — telecaller will move it to pending/confirmed after calling.</span>
              </div>
              <div style={fullStyle}>
                <label style={labelStyle}>Event *</label>
                <Input
                  type="text"
                  list="event-slugs-datalist"
                  value={form.event_slug}
                  onChange={e => set('event_slug', e.target.value)}
                  placeholder="e.g. summer-story-2026"
                />
                <datalist id="event-slugs-datalist">
                  {eventOptionsList.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>
            </>
          )}
          {/* Name + Phone */}
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Phone *</label>
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
          </div>
          {/* Email + Guests */}
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Email</label>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Guests</label>
              <Select value={form.guests} onChange={e => set('guests', e.target.value)}>
                {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}</option>)}
              </Select>
            </div>
          </div>
          {/* Workshop + Time */}
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>Workshop Interest</label>
              <Select value={form.workshop_interest} onChange={e => set('workshop_interest', e.target.value)}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="not_sure">Not Sure</option>
              </Select>
            </div>
            <div>
              <label style={labelStyle}>Preferred Time</label>
              <Select value={form.preferred_time} onChange={e => set('preferred_time', e.target.value)}>
                <option value="no_preference">Flexible</option>
                <option value="early">Early (2–4 PM)</option>
                <option value="late">Late (4–6 PM)</option>
              </Select>
            </div>
          </div>
          {/* Status + Payment */}
          <div style={rowStyle}>
            <div>
              <label style={labelStyle}>RSVP Status</label>
              <Select value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <label style={labelStyle}>Payment Status (Workshop)</label>
              <Select value={form.payment_status} onChange={e => set('payment_status', e.target.value)}>
                {PAYMENT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
          </div>
          {/* Customer Notes */}
          <div style={fullStyle}>
            <label style={labelStyle}>Customer Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={2}
              style={{
                width: '100%', padding: '10px 12px', fontSize: '13px', fontFamily: 'inherit',
                border: `1px solid ${C.border}`, borderRadius: '10px', background: C.bg,
                color: C.text, resize: 'vertical', outline: 'none'
              }}
              placeholder="Notes from the customer..."
            />
          </div>
          {/* Internal Notes */}
          <div style={fullStyle}>
            <label style={labelStyle}>Internal Notes (Team Only)</label>
            <textarea
              value={form.internal_notes}
              onChange={e => set('internal_notes', e.target.value)}
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', fontSize: '13px', fontFamily: 'inherit',
                border: `1px solid ${C.border}`, borderRadius: '10px', background: '#FFF9E8',
                color: C.text, resize: 'vertical', outline: 'none'
              }}
              placeholder="Add your own notes, requirements, follow-up details..."
            />
          </div>
        </div>
        <div style={footerStyle}>
          <Btn small onClick={onClose} style={{ color: C.textMuted }}>Cancel</Btn>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              background: C.gold, color: '#fff', fontWeight: 700, fontSize: '13px',
              opacity: saving ? 0.5 : 1
            }}
          >
            {saving ? 'Saving...' : (isCreate ? 'Add Prospect' : 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Component ─────────────────────────────────────────────────── */
export const EventsList = () => {
  const [rsvps, setRsvps] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterWorkshop, setFilterWorkshop] = useState('')
  const [filterEvent, setFilterEvent] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [editingRsvp, setEditingRsvp] = useState(null)
  const [addingLead, setAddingLead] = useState(false)
  const pageSize = 25

  useEffect(() => { fetchRsvps() }, [])

  const fetchRsvps = async () => {
    setLoading(true)
    try {
      const { data, error } = await supa
        .from('event_rsvps')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      setRsvps(data || [])
    } catch (err) {
      console.error('Error fetching RSVPs:', err)
      toast(false, 'Failed to load event RSVPs')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (id, newStatus) => {
    try {
      const { error } = await supa.from('event_rsvps').update({ status: newStatus }).eq('id', id)
      if (error) throw error
      setRsvps(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r))
      toast(true, 'Status updated')
    } catch (err) {
      console.error(err)
      toast(false, 'Failed to update status')
    }
  }

  const handlePaymentChange = async (id, newPayment) => {
    try {
      const { error } = await supa.from('event_rsvps').update({ payment_status: newPayment }).eq('id', id)
      if (error) throw error
      setRsvps(prev => prev.map(r => r.id === id ? { ...r, payment_status: newPayment } : r))
      toast(true, 'Payment status updated')
    } catch (err) {
      console.error(err)
      toast(false, 'Failed to update payment')
    }
  }

  const handleEditSave = useCallback((updated) => {
    setRsvps(prev => prev.map(r => r.id === updated.id ? updated : r))
  }, [])

  const handleCreateSave = useCallback((created) => {
    setRsvps(prev => [created, ...prev])
  }, [])

  const handleDeleteRsvp = async (rsvp) => {
    if (!confirm(`Delete RSVP for "${rsvp.name || 'this lead'}"? This cannot be undone.`)) return
    try {
      const { error } = await supa.from('event_rsvps').delete().eq('id', rsvp.id)
      if (error) throw error
      setRsvps(prev => prev.filter(r => r.id !== rsvp.id))
      toast(true, 'RSVP deleted')
    } catch (err) {
      console.error(err)
      toast(false, 'Failed to delete RSVP')
    }
  }

  const eventSlugs = useMemo(() => {
    return [...new Set(rsvps.map(r => r.event_slug).filter(Boolean))].sort()
  }, [rsvps])

  const filtered = useMemo(() => {
    return rsvps.filter(r => {
      if (searchText) {
        const q = searchText.toLowerCase()
        if (!(r.name || '').toLowerCase().includes(q) && !(r.phone || '').toLowerCase().includes(q) && !(r.email || '').toLowerCase().includes(q)) return false
      }
      if (filterStatus && r.status !== filterStatus) return false
      if (filterWorkshop && r.workshop_interest !== filterWorkshop) return false
      if (filterEvent && r.event_slug !== filterEvent) return false
      return true
    })
  }, [rsvps, searchText, filterStatus, filterWorkshop, filterEvent])

  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const stats = useMemo(() => {
    const total = rsvps.length
    const totalGuests = rsvps.reduce((s, r) => s + (r.guests || 1), 0)
    const workshopYes = rsvps.filter(r => r.workshop_interest === 'yes').length
    const confirmed = rsvps.filter(r => r.status === 'confirmed').length
    const paid = rsvps.filter(r => r.payment_status === 'paid').length
    const prospects = rsvps.filter(r => r.status === 'prospect').length
    return { total, totalGuests, workshopYes, confirmed, paid, prospects }
  }, [rsvps])

  const getStatusColor = (status) => STATUS_COLORS[status] || STATUS_COLORS.pending
  const getPaymentColor = (status) => PAYMENT_COLORS[status] || PAYMENT_COLORS.unpaid

  if (loading) {
    return <div className="flex items-center justify-center h-96" style={{ color: C.textMuted }}><span>Loading RSVPs...</span></div>
  }

  /* ─── Table column config for consistent alignment ───── */
  const cols = [
    { key: 'name',     label: 'Name',      width: '14%', align: 'left' },
    { key: 'phone',    label: 'Phone',     width: '11%', align: 'left' },
    { key: 'email',    label: 'Email',     width: '14%', align: 'left' },
    { key: 'guests',   label: 'Guests',    width: '6%',  align: 'center' },
    { key: 'workshop', label: 'Workshop',  width: '8%',  align: 'center' },
    { key: 'payment',  label: 'Payment',   width: '9%',  align: 'center' },
    { key: 'time',     label: 'Time',      width: '8%',  align: 'center' },
    { key: 'notes',    label: 'Notes',     width: '10%', align: 'left' },
    { key: 'status',   label: 'Status',    width: '10%', align: 'center' },
    { key: 'date',     label: 'Date',      width: '7%',  align: 'center' },
    { key: 'actions',  label: '',          width: '5%',  align: 'center' }
  ]

  const thStyle = (col) => ({
    width: col.width, textAlign: col.align, padding: '10px 12px',
    fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em',
    color: C.text, whiteSpace: 'nowrap', textTransform: 'uppercase'
  })
  const tdStyle = (col) => ({
    width: col.width, textAlign: col.align, padding: '10px 12px',
    verticalAlign: 'middle', fontSize: '13px'
  })

  return (
    <div>
      {/* Top Row: Add Lead action */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm" style={{ color: C.textMuted }}>
          RSVPs + manually-added prospects. Telecallers call prospects and move them through the funnel.
        </div>
        <button
          onClick={() => setAddingLead(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '9px 16px', borderRadius: '10px', border: 'none', cursor: 'pointer',
            background: C.gold, color: '#fff', fontWeight: 700, fontSize: '13px',
            boxShadow: '0 2px 8px rgba(201,164,50,0.25)'
          }}
        >
          <span style={{ fontSize: '15px', lineHeight: 1 }}>+</span> Add Lead
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        {[
          { label: 'Total RSVPs', value: stats.total, color: C.gold, filterKey: null },
          { label: 'Prospects', value: stats.prospects, color: '#475569', filterKey: 'prospect' },
          { label: 'Total Guests', value: stats.totalGuests, color: C.blue, filterKey: null },
          { label: 'Workshop Interest', value: stats.workshopYes, color: C.green, filterKey: null },
          { label: 'Confirmed', value: stats.confirmed, color: C.purple, filterKey: null },
          { label: 'Paid', value: stats.paid, color: '#16a34a', filterKey: null }
        ].map(s => {
          const clickable = !!s.filterKey
          return (
            <div
              key={s.label}
              className="rounded-xl p-4"
              onClick={clickable ? () => { setFilterStatus(s.filterKey); setCurrentPage(1) } : undefined}
              style={{
                background: C.cardBg,
                border: `1px solid ${filterStatus === s.filterKey && clickable ? s.color : C.border}`,
                cursor: clickable ? 'pointer' : 'default',
                transition: 'border-color 0.15s'
              }}
              title={clickable ? 'Click to filter by this status' : undefined}
            >
              <div className="text-xs font-bold uppercase mb-1" style={{ color: C.textMuted, letterSpacing: '0.05em' }}>{s.label}</div>
              <div className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</div>
            </div>
          )
        })}
      </div>

      {/* Search + Filters */}
      <div className="mb-4 flex gap-3 items-center">
        <div className="flex-1 relative">
          <Input
            type="text"
            placeholder="Search by name, phone, email..."
            value={searchText}
            onChange={e => { setSearchText(e.target.value); setCurrentPage(1) }}
            style={{ paddingLeft: '2.5rem' }}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: C.textMuted }}>&#128269;</span>
        </div>
        <div className="text-sm font-bold whitespace-nowrap" style={{ color: C.textMuted }}>
          {filtered.length} RSVP{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="mb-4 p-4 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Event</label>
            <Select value={filterEvent} onChange={e => { setFilterEvent(e.target.value); setCurrentPage(1) }}>
              <option value="">All Events</option>
              {eventSlugs.map(s => <option key={s} value={s}>{s.replace(/-/g, ' ')}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Status</label>
            <Select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1) }}>
              <option value="">All Status</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Workshop</label>
            <Select value={filterWorkshop} onChange={e => { setFilterWorkshop(e.target.value); setCurrentPage(1) }}>
              <option value="">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="not_sure">Not Sure</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Btn small onClick={() => { setFilterEvent(''); setFilterStatus(''); setFilterWorkshop(''); setSearchText(''); setCurrentPage(1) }} style={{ color: C.red }}>
              Clear Filters
            </Btn>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${C.border}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: C.bg, borderBottom: `2px solid ${C.border}` }}>
              {cols.map(col => (
                <th key={col.key} style={thStyle(col)}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={cols.length} style={{ padding: '32px', textAlign: 'center', color: C.textMuted }}>No RSVPs found</td></tr>
            ) : paginated.map(r => {
              const sc = getStatusColor(r.status)
              const pc = getPaymentColor(r.payment_status)
              const hasInternalNotes = r.internal_notes && r.internal_notes.trim()
              return (
                <tr key={r.id}
                    style={{ borderBottom: `1px solid ${C.border}`, background: C.cardBg, transition: 'background 0.15s', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = C.cardBg}
                    onDoubleClick={() => setEditingRsvp(r)}>
                  {/* Name */}
                  <td style={{ ...tdStyle(cols[0]), fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.name}
                    {hasInternalNotes && <span title="Has internal notes" style={{ marginLeft: '4px', fontSize: '10px' }}>&#128221;</span>}
                  </td>
                  {/* Phone */}
                  <td style={{ ...tdStyle(cols[1]), color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.phone}</td>
                  {/* Email */}
                  <td style={{ ...tdStyle(cols[2]), color: C.textMuted, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.email || '—'}</td>
                  {/* Guests */}
                  <td style={{ ...tdStyle(cols[3]), fontWeight: 700, color: C.text }}>{r.guests || 1}</td>
                  {/* Workshop */}
                  <td style={tdStyle(cols[4])}>
                    <span style={{
                      display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                      background: r.workshop_interest === 'yes' ? C.greenBg : r.workshop_interest === 'no' ? C.bg : C.amberBg,
                      color: r.workshop_interest === 'yes' ? C.green : r.workshop_interest === 'no' ? C.textMuted : C.amber
                    }}>
                      {r.workshop_interest === 'yes' ? 'Yes' : r.workshop_interest === 'no' ? 'No' : 'Maybe'}
                    </span>
                  </td>
                  {/* Payment */}
                  <td style={tdStyle(cols[5])}>
                    {r.workshop_interest === 'yes' ? (
                      <Select value={r.payment_status || 'unpaid'} onChange={e => handlePaymentChange(r.id, e.target.value)}
                        style={{ fontSize: '11px', padding: '3px 6px', background: pc.bg, color: pc.color, fontWeight: 600, borderColor: 'transparent', minWidth: '80px', textAlign: 'center' }}>
                        {PAYMENT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    ) : (
                      <span style={{ color: C.textMuted, fontSize: '11px' }}>—</span>
                    )}
                  </td>
                  {/* Time */}
                  <td style={{ ...tdStyle(cols[6]), fontSize: '12px', color: C.textMuted }}>
                    {r.preferred_time === 'early' ? '2–4 PM' : r.preferred_time === 'late' ? '4–6 PM' : 'Flexible'}
                  </td>
                  {/* Notes */}
                  <td style={{ ...tdStyle(cols[7]), fontSize: '12px', color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.notes}>
                    {r.notes || '—'}
                  </td>
                  {/* Status */}
                  <td style={tdStyle(cols[8])}>
                    <Select value={r.status || 'pending'} onChange={e => handleStatusChange(r.id, e.target.value)}
                      style={{ fontSize: '11px', padding: '3px 6px', background: sc.bg, color: sc.color, fontWeight: 600, borderColor: 'transparent', minWidth: '90px', textAlign: 'center' }}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </td>
                  {/* Date */}
                  <td style={{ ...tdStyle(cols[9]), fontSize: '11px', color: C.textMuted, whiteSpace: 'nowrap' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                  </td>
                  {/* Edit + Delete */}
                  <td style={{ ...tdStyle(cols[10]), display: 'flex', gap: '2px', justifyContent: 'center', alignItems: 'center' }}>
                    <button
                      onClick={() => setEditingRsvp(r)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: '4px', borderRadius: '6px', lineHeight: 1 }}
                      title="Edit RSVP"
                    >&#9998;</button>
                    <button
                      onClick={() => handleDeleteRsvp(r)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '4px', borderRadius: '6px', lineHeight: 1, color: C.red }}
                      title="Delete RSVP"
                    >&#128465;</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination — always show */}
      <div className="mt-4 flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <div className="text-sm" style={{ color: C.textMuted }}>
          {filtered.length === 0 ? '0 results' : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length}`}
        </div>
        <div className="flex gap-1 items-center">
          <Btn small disabled={currentPage === 1} onClick={() => setCurrentPage(1)} style={{ fontSize: '11px' }}>First</Btn>
          <Btn small disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>&#8592;</Btn>
          <span className="px-3 py-1 text-sm font-bold" style={{ color: C.text }}>{currentPage} / {totalPages || 1}</span>
          <Btn small disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>&#8594;</Btn>
          <Btn small disabled={currentPage >= totalPages} onClick={() => setCurrentPage(totalPages)} style={{ fontSize: '11px' }}>Last</Btn>
        </div>
      </div>

      {/* Edit Modal */}
      {editingRsvp && (
        <RsvpFormModal
          rsvp={editingRsvp}
          mode="edit"
          eventSlugs={eventSlugs}
          onClose={() => setEditingRsvp(null)}
          onSave={handleEditSave}
        />
      )}

      {/* Add Lead (Create) Modal */}
      {addingLead && (
        <RsvpFormModal
          rsvp={null}
          mode="create"
          eventSlugs={eventSlugs}
          defaultEventSlug={filterEvent || DEFAULT_EVENT_SLUG}
          onClose={() => setAddingLead(false)}
          onSave={handleCreateSave}
        />
      )}
    </div>
  )
}

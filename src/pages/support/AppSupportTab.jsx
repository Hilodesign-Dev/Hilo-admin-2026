import React, { useState, useEffect, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { fmtDate } from '../../lib/designTokens'
import { Btn, Badge, Overlay, Field, Input, Select } from '../orders/ui'

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELED']

const STATUS_STYLE = {
  OPEN: { color: C.gold, bg: C.goldLight },
  IN_PROGRESS: { color: '#b45309', bg: 'rgba(245,158,11,0.12)' },
  RESOLVED: { color: C.green, bg: C.greenBg },
  CANCELED: { color: C.red, bg: C.redBg },
}

function statusLabel(s) {
  return String(s || '').replace(/_/g, ' ')
}

function hasMinAlpha(text, min = 4) {
  const m = String(text || '').match(/[a-zA-Z]/g)
  return m ? m.length >= min : false
}

function displayEmail(email) {
  if (!email || /^PLACEHOLDER#/i.test(email)) return null
  return email
}

function displayContact(user) {
  if (!user) return '—'
  return user.phone || displayEmail(user.email) || '—'
}

export default function AppSupportTab({ user }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  const [searchQuery, setSearchQuery] = useState('')
  const [activeStatus, setActiveStatus] = useState('all')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 15

  const [detail, setDetail] = useState(null) // full ticket row + joined user + comments
  const [detailLoading, setDetailLoading] = useState(false)
  const [comments, setComments] = useState([])
  const [commentBody, setCommentBody] = useState('')
  const [saving, setSaving] = useState(false)

  const [pendingStatus, setPendingStatus] = useState(null)
  const [reasonOpen, setReasonOpen] = useState(null) // 'RESOLVED' | 'CANCELED' | null
  const [reasonText, setReasonText] = useState('')
  const [imagePreview, setImagePreview] = useState(null)

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    try {
      let q = supa.from('shopper_tickets').select('*', { count: 'exact' })

      if (activeStatus !== 'all') {
        q = q.eq('status', activeStatus)
      }

      if (searchQuery.trim().length >= 2) {
        const query = searchQuery.trim()
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        if (uuidRe.test(query)) {
          q = q.eq('id', query)
        } else {
          q = q.or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        }
      }

      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data, count, error } = await q
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      const rows = data || []
      const userIds = [...new Set(rows.map(r => r.created_by_id).filter(Boolean))]
      let userMap = {}
      if (userIds.length) {
        const { data: users } = await supa
          .from('shopper_users')
          .select('id, name, phone, email')
          .in('id', userIds)
        if (users) {
          userMap = Object.fromEntries(users.map(u => [u.id, u]))
        }
      }

      setTickets(rows.map(r => ({ ...r, _user: userMap[r.created_by_id] || null })))
      setTotalCount(count || 0)
    } catch (e) {
      console.error('[HILO] Failed to fetch support tickets:', e)
      toast(false, 'Failed to fetch support tickets: ' + (e.message || e))
    } finally {
      setLoading(false)
    }
  }, [activeStatus, searchQuery, page])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  const openDetail = async (ticket) => {
    setDetail(ticket)
    setPendingStatus(ticket.status)
    setCommentBody('')
    setDetailLoading(true)
    try {
      const { data, error } = await supa
        .from('shopper_ticket_comments')
        .select('*')
        .eq('ticket_id', ticket.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      setComments(data || [])
    } catch (e) {
      console.error('[HILO] Failed to load ticket comments:', e)
      toast(false, 'Failed to load comments')
      setComments([])
    } finally {
      setDetailLoading(false)
    }
  }

  const closeDetail = () => {
    setDetail(null)
    setComments([])
    setPendingStatus(null)
    setCommentBody('')
  }

  const applyStatus = async (status, cancelReason) => {
    if (!detail) return
    setSaving(true)
    try {
      const patch = {
        status,
        updated_at: new Date().toISOString(),
        last_modified_by_id: user?.email || user?.id || 'admin',
      }
      if (cancelReason != null) patch.cancel_reason = cancelReason

      const { data, error } = await supa
        .from('shopper_tickets')
        .update(patch)
        .eq('id', detail.id)
        .select('*')
        .single()
      if (error) throw error

      const next = { ...detail, ...data }
      setDetail(next)
      setPendingStatus(data.status)
      setTickets(prev => prev.map(t => (t.id === detail.id ? { ...t, ...data } : t)))
      toast(true, `Ticket marked ${statusLabel(status)}`)
      setReasonOpen(null)
      setReasonText('')
    } catch (e) {
      toast(false, 'Failed to update ticket: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveStatus = () => {
    if (!detail || !pendingStatus || pendingStatus === detail.status) {
      closeDetail()
      return
    }
    if (pendingStatus === 'RESOLVED' || pendingStatus === 'CANCELED') {
      setReasonOpen(pendingStatus)
      setReasonText(detail.cancel_reason || '')
      return
    }
    applyStatus(pendingStatus)
  }

  const handleConfirmReason = () => {
    if (!hasMinAlpha(reasonText.trim())) {
      toast(false, 'Please enter a short note (at least 4 letters)')
      return
    }
    applyStatus(reasonOpen, reasonText.trim())
  }

  const handleAddComment = async () => {
    if (!detail || !commentBody.trim()) return
    if (!hasMinAlpha(commentBody.trim())) {
      toast(false, 'Comment must contain at least 4 letters')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await supa
        .from('shopper_ticket_comments')
        .insert({
          ticket_id: detail.id,
          body: commentBody.trim(),
          author_name: user?.email?.split('@')[0] || 'Support',
          author_email: user?.email || null,
        })
        .select('*')
        .single()
      if (error) throw error
      setComments(prev => [...prev, data])
      setCommentBody('')
      toast(true, 'Comment added')
    } catch (e) {
      toast(false, 'Failed to add comment: ' + (e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (ticket) => {
    if (!window.confirm(`Delete ticket "${ticket.title}"? This cannot be undone.`)) return
    try {
      const { error } = await supa.from('shopper_tickets').delete().eq('id', ticket.id)
      if (error) throw error
      setTickets(prev => prev.filter(t => t.id !== ticket.id))
      setTotalCount(c => Math.max(0, c - 1))
      if (detail?.id === ticket.id) closeDetail()
      toast(true, 'Ticket deleted')
    } catch (e) {
      toast(false, 'Failed to delete: ' + (e.message || e))
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: C.text }}>App Support</h1>
          <p className="text-sm mt-1" style={{ color: C.textMuted }}>
            Review and resolve support tickets raised by shoppers from the mobile app
          </p>
        </div>
        <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border" style={{ borderColor: C.border }}>
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: C.textLight }}>Open tickets</span>
          <span className="text-xl font-bold" style={{ color: C.text }}>
            {tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length}
            <span className="text-sm font-medium text-gray-400 ml-1">/ {totalCount}</span>
          </span>
        </div>
      </div>

      <div className="bg-white p-4 rounded-3xl shadow-sm border mb-6 flex flex-wrap gap-4 items-center justify-between" style={{ borderColor: C.border }}>
        <div className="relative min-w-[280px] max-w-md w-full">
          <input
            type="text"
            placeholder="Search by title, description, or ticket ID..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(0) }}
            className="w-full text-sm pl-9 pr-4 py-2 rounded-2xl border outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200 transition-all"
            style={{ background: C.bg, borderColor: C.border, color: C.text }}
          />
          <span className="absolute left-3 top-2.5 text-gray-400">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {['all', ...STATUS_OPTIONS].map(s => (
            <button
              key={s}
              onClick={() => { setActiveStatus(s); setPage(0) }}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${activeStatus === s ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              style={{ borderColor: activeStatus === s ? undefined : C.border }}
            >
              {s === 'all' ? 'All' : statusLabel(s)}
            </button>
          ))}
          <Btn onClick={fetchTickets} small>Refresh</Btn>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border overflow-hidden" style={{ borderColor: C.border }}>
        {loading ? (
          <div className="py-20 text-center text-sm" style={{ color: C.textMuted }}>Loading support tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3">🎫</div>
            <div className="text-sm font-bold" style={{ color: C.text }}>No support tickets yet</div>
            <div className="text-xs mt-1" style={{ color: C.textMuted }}>
              Tickets appear here when shoppers submit them from Contact Us in the mobile app
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: C.border, background: C.bg }}>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Ticket</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Shopper</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Raised</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(ticket => {
                  const st = STATUS_STYLE[ticket.status] || STATUS_STYLE.OPEN
                  return (
                    <tr
                      key={ticket.id}
                      className="border-b hover:bg-gray-50/50 cursor-pointer transition-colors"
                      style={{ borderColor: C.border }}
                      onClick={() => openDetail(ticket)}
                    >
                      <td className="p-4">
                        <div className="font-bold text-sm" style={{ color: C.text }}>{ticket.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5 line-clamp-1 max-w-md">{ticket.description}</div>
                        <div className="text-[10px] font-mono text-gray-300 mt-1 select-all">{ticket.id.slice(0, 8)}…</div>
                      </td>
                      <td className="p-4 text-sm">
                        <div className="font-semibold" style={{ color: C.text }}>
                          {ticket._user?.name || 'Anonymous'}
                        </div>
                        <div className="text-xs text-gray-500">{displayContact(ticket._user)}</div>
                      </td>
                      <td className="p-4">
                        <Badge color={st.color} bg={st.bg}>{statusLabel(ticket.status)}</Badge>
                      </td>
                      <td className="p-4 text-sm" style={{ color: C.text }}>{fmtDate(ticket.created_at)}</td>
                      <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2 justify-end">
                          <Btn small onClick={() => openDetail(ticket)}>View</Btn>
                          <Btn small danger onClick={() => handleDelete(ticket)}>Delete</Btn>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: C.border, background: C.bg }}>
            <span className="text-xs font-medium" style={{ color: C.textMuted }}>
              Showing {page * PAGE_SIZE + 1} – {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} tickets
            </span>
            <div className="flex gap-2">
              <Btn disabled={page === 0} onClick={() => setPage(p => p - 1)} small>Previous</Btn>
              <Btn disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)} small>Next</Btn>
            </div>
          </div>
        )}
      </div>

      {/* Detail sheet */}
      {detail && (
        <Overlay onClose={closeDetail}>
          <div
            className="bg-white w-full sm:max-w-xl sm:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl scrollbar-none"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-start justify-between gap-3 z-10" style={{ borderColor: C.border }}>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Support ticket</div>
                <h2 className="text-lg font-bold truncate" style={{ color: C.text }}>{detail.title}</h2>
                <div className="text-[10px] font-mono text-gray-300 mt-1 select-all">{detail.id}</div>
              </div>
              <button onClick={closeDetail} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="flex flex-wrap gap-3 items-center">
                <Badge color={(STATUS_STYLE[detail.status] || STATUS_STYLE.OPEN).color} bg={(STATUS_STYLE[detail.status] || STATUS_STYLE.OPEN).bg}>
                  {statusLabel(detail.status)}
                </Badge>
                <span className="text-xs text-gray-400">Raised {fmtDate(detail.created_at)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">Shopper</div>
                  <div className="font-semibold" style={{ color: C.text }}>{detail._user?.name || 'Anonymous'}</div>
                  <div className="text-xs text-gray-500">{detail._user?.phone || '—'}</div>
                  {displayEmail(detail._user?.email) && (
                    <div className="text-xs text-gray-500">{displayEmail(detail._user.email)}</div>
                  )}
                </div>
                <div>
                  <Field label="Status">
                    <Select value={pendingStatus || detail.status} onChange={e => setPendingStatus(e.target.value)}>
                      {STATUS_OPTIONS.map(s => (
                        <option key={s} value={s}>{statusLabel(s)}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">Description</div>
                <p className="text-sm whitespace-pre-wrap" style={{ color: C.text }}>{detail.description}</p>
              </div>

              {detail.image_url && (
                <div>
                  <div className="text-[10px] font-bold uppercase text-gray-400 mb-2">Attachment</div>
                  <button type="button" onClick={() => setImagePreview(detail.image_url)} className="block">
                    <img src={detail.image_url} alt="Ticket attachment" className="max-h-48 rounded-2xl border object-cover" style={{ borderColor: C.border }} />
                  </button>
                </div>
              )}

              {detail.cancel_reason && (
                <div className="p-3 rounded-2xl border bg-amber-50/50" style={{ borderColor: C.border }}>
                  <div className="text-[10px] font-bold uppercase text-amber-700 mb-1">Resolution / cancel note</div>
                  <p className="text-sm" style={{ color: C.text }}>{detail.cancel_reason}</p>
                </div>
              )}

              <div>
                <div className="text-[10px] font-bold uppercase text-gray-400 mb-3">Responses</div>
                {detailLoading ? (
                  <div className="text-xs text-gray-400 py-4 text-center">Loading comments...</div>
                ) : comments.length === 0 ? (
                  <div className="text-xs text-gray-400 py-3">No responses yet. Add a reply below.</div>
                ) : (
                  <div className="space-y-3 max-h-56 overflow-y-auto pr-1 scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    {comments.map(c => (
                      <div key={c.id} className="p-3 rounded-2xl border bg-slate-50" style={{ borderColor: C.border }}>
                        <div className="flex justify-between gap-2 mb-1">
                          <span className="text-xs font-bold" style={{ color: C.text }}>
                            {c.author_name || 'Support'}
                          </span>
                          <span className="text-[10px] text-gray-400">{fmtDate(c.created_at)}</span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap" style={{ color: C.text }}>{c.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  <Field label="Add response">
                    <textarea
                      value={commentBody}
                      onChange={e => setCommentBody(e.target.value)}
                      rows={3}
                      placeholder="Write a reply the shopper will see in the app..."
                      className="w-full text-sm px-3 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-amber-200 resize-none"
                      style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                    />
                  </Field>
                  <Btn primary small disabled={saving || !commentBody.trim()} onClick={handleAddComment}>
                    Add comment
                  </Btn>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t px-5 py-4 flex gap-2 justify-end" style={{ borderColor: C.border }}>
              <Btn onClick={closeDetail} small>Close</Btn>
              <Btn
                primary
                small
                disabled={saving || !pendingStatus || pendingStatus === detail.status}
                onClick={handleSaveStatus}
              >
                {pendingStatus && pendingStatus !== detail.status ? 'Save status' : 'Saved'}
              </Btn>
            </div>
          </div>
        </Overlay>
      )}

      {/* Resolve / cancel reason dialog */}
      {reasonOpen && (
        <Overlay onClose={() => { setReasonOpen(null); setReasonText('') }}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-3xl p-6 shadow-2xl m-4" onMouseDown={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1" style={{ color: C.text }}>
              {reasonOpen === 'RESOLVED' ? 'Mark as resolved' : 'Mark as canceled'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Add a short note for the shopper (stored as cancelReason on the ticket).
            </p>
            <Field label="Note" required>
              <Input
                value={reasonText}
                onChange={e => setReasonText(e.target.value)}
                placeholder={reasonOpen === 'RESOLVED' ? 'Resolution summary...' : 'Reason for rejection...'}
              />
            </Field>
            <div className="flex gap-2 justify-end mt-5">
              <Btn small onClick={() => { setReasonOpen(null); setReasonText('') }}>Cancel</Btn>
              <Btn primary small disabled={saving || !hasMinAlpha(reasonText.trim())} onClick={handleConfirmReason}>
                Confirm
              </Btn>
            </div>
          </div>
        </Overlay>
      )}

      {imagePreview && (
        <Overlay onClose={() => setImagePreview(null)}>
          <div className="max-w-3xl max-h-[90vh] p-2" onMouseDown={e => e.stopPropagation()}>
            <img src={imagePreview} alt="Full size" className="max-h-[85vh] rounded-2xl object-contain mx-auto" />
          </div>
        </Overlay>
      )}
    </div>
  )
}

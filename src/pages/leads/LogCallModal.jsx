/* ═══════════════════════════════════════════════════════════════════════════
   LOG CALL MODAL — v2: Step wizard with DB-driven outcomes
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react'
import { C, toast } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { Overlay, Field, Input, Select, Btn, Badge } from './ui'
import {
  LEAD_QUALITIES,
  ATTEMPT_DELAYS, CONNECTED_DELAYS, NEXT_ATTEMPT_STATUS, NEXT_CONNECTED_STATUS,
  getSubPhase, PHASE_COLORS
} from './constants'
import { useLeadMasterLists } from './useLeadMasterLists'
import { useIsMobile } from './useIsMobile'
import { filterStylists } from '../../lib/helpers'


const addDays = (dateStr, days) => {
  const d = dateStr ? new Date(dateStr) : new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const today = () => new Date().toISOString().split('T')[0]
const tomorrow = () => addDays(today(), 1)

// ─── Step indicator ──────────────────────────────────────────────────────
const StepDot = ({ num, label, active, done, color }) => (
  <div className="flex items-center gap-2">
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
      style={{
        background: active ? color : done ? color + '20' : C.bg,
        color: active ? '#fff' : done ? color : C.textMuted,
        border: `2px solid ${active || done ? color : C.border}`,
      }}
    >
      {done ? '✓' : num}
    </div>
    <span className="text-xs font-bold" style={{ color: active ? color : C.textMuted }}>{label}</span>
  </div>
)

const StepLine = ({ done, color }) => (
  <div className="w-8 h-0.5 mx-1" style={{ background: done ? color : C.border }} />
)

// ─── Outcome pill button ─────────────────────────────────────────────────
const OutcomePill = ({ label, icon, selected, color, onClick, small }) => (
  <button
    onClick={onClick}
    className={`px-4 ${small ? 'py-1.5' : 'py-2.5'} rounded-xl font-bold transition-all text-left`}
    style={{
      background: selected ? color + '10' : C.bg,
      color: selected ? color : C.text,
      border: `1.5px solid ${selected ? color : C.border}`,
      minWidth: small ? 'auto' : '140px',
    }}
  >
    {icon && <span className="mr-1.5">{icon}</span>}
    <span className={small ? 'text-xs' : 'text-sm'}>{label}</span>
  </button>
)

export const LogCallModal = ({ lead, onClose, onLeadUpdated, teamMembers = [] }) => {
  const lists = useLeadMasterLists()
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(false)
  const subPhase = getSubPhase(lead?.status)
  const phaseColor = PHASE_COLORS[lead?.phase] || PHASE_COLORS.yet_to_qualify
  const isYTQ = subPhase === 'yet_to_connect' || subPhase === 'connected'
  const isQualified = subPhase === 'qualified'

  // ─── Wizard state ────────────────────────────────────────────────────
  const [step, setStep] = useState(1)
  const [connected, setConnected] = useState(null) // null | true | false (Step 1 for YTQ)
  const [outcome, setOutcome] = useState('')
  const [notes, setNotes] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [callBackTime, setCallBackTime] = useState('')
  const [lostReason, setLostReason] = useState('')
  const [assignedTo, setAssignedTo] = useState(lead?.assigned_to || window._currentTeamMemberId || '')

  // Qualification fields
  const [quality, setQuality] = useState('Avg')
  const [clientName, setClientName] = useState(lead?.client_name || '')
  const [occasion, setOccasion] = useState(lead?.occasion || '')
  const [occasionDate, setOccasionDate] = useState(lead?.occasion_date || '')
  const [productsInterested, setProductsInterested] = useState(
    lead?.products_interested ? lead.products_interested.split(',').map(s => s.trim()) : []
  )

  // Source & detail fields for qualification
  const [channel, setChannel] = useState(lead?.channel || '')
  const [leadSource, setLeadSource] = useState(lead?.lead_source || '')
  const [utmSource, setUtmSource] = useState(lead?.utm_source || '')
  const [utmMedium, setUtmMedium] = useState(lead?.utm_medium || '')
  const [utmCampaign, setUtmCampaign] = useState(lead?.utm_campaign || '')
  const [utmContent, setUtmContent] = useState(lead?.utm_content || '')
  const [utmTerm, setUtmTerm] = useState(lead?.utm_term || '')
  const [clientRequirements, setClientRequirements] = useState(lead?.client_requirements || '')

  // Converted fields — multi-order search
  const [orderId, setOrderId] = useState('')
  const [amount, setAmount] = useState('')
  const [orderSearch, setOrderSearch] = useState('')
  const [orderResults, setOrderResults] = useState([])
  const [searchingOrders, setSearchingOrders] = useState(false)
  const [linkedOrders, setLinkedOrders] = useState([])

  // Debounced order search
  useEffect(() => {
    if (!orderSearch.trim() || orderSearch.trim().length < 2) {
      setOrderResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchingOrders(true)
      try {
        const q = orderSearch.trim()
        const { data } = await supa.from('shopify_orders')
          .select('id, order_number, customer_name, total_price, order_status')
          .or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
          .order('created_at', { ascending: false })
          .limit(10)
        // Filter out already linked
        const linkedIds = new Set(linkedOrders.map(o => o.id))
        setOrderResults((data || []).filter(o => !linkedIds.has(o.id)))
      } catch (err) {
        console.error('Order search error:', err)
      } finally {
        setSearchingOrders(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [orderSearch])

  const addLinkedOrder = (order) => {
    setLinkedOrders(prev => [...prev, order])
    setOrderSearch('')
    setOrderResults([])
  }

  const removeLinkedOrder = (orderId) => {
    setLinkedOrders(prev => prev.filter(o => o.id !== orderId))
  }

  const linkedOrderTotal = linkedOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0)

  // First-update detection for Qualified leads
  const [isFirstQualifiedUpdate, setIsFirstQualifiedUpdate] = useState(false)
  useEffect(() => {
    if (!isQualified || !lead?.id) return
    supa.from('lead_interactions').select('id', { count: 'exact', head: true })
      .eq('lead_id', lead.id)
      .then(({ count }) => {
        if (count === 0 && !lead.occasion) setIsFirstQualifiedUpdate(true)
      })
  }, [lead?.id, isQualified])

  // ─── Determine step labels based on phase ────────────────────────────
  const getSteps = () => {
    if (isYTQ) {
      const steps = [{ num: 1, label: 'Reach' }]
      if (connected === true) {
        steps.push({ num: 2, label: 'Conversation' })
        if (outcome === 'Had conversation' || outcome === 'Answered - had conversation') {
          steps.push({ num: 3, label: 'Qualify' })
        }
      } else if (connected === false) {
        steps.push({ num: 2, label: 'Result' })
      }
      return steps
    }
    // Qualified leads — single step
    return [{ num: 1, label: 'Outcome' }]
  }

  const wizardSteps = getSteps()
  const accentColor = isYTQ ? '#2563eb' : '#16a34a'

  // ─── Handle step 1 choice for YTQ ────────────────────────────────────
  const handleReachChoice = (didConnect) => {
    setConnected(didConnect)
    setOutcome('')
    setStep(2)
  }

  // ─── Compute what the outcome maps to ────────────────────────────────
  const handleSubmit = async () => {
    // Validate
    if (isYTQ && connected === null) { toast(false, 'Select whether you reached them'); return }
    if (isYTQ && connected === false && !outcome) { toast(false, 'Select an outcome'); return }
    if (isYTQ && connected === true && !outcome) { toast(false, 'Select a conversation outcome'); return }
    if (isQualified && !outcome) { toast(false, 'Select an outcome'); return }
    if (outcome === 'Converted' && linkedOrders.length === 0) { toast(false, 'Link an order to mark as Converted'); return }
    if (['Not interested', 'Lost'].includes(outcome) && !lostReason) { toast(false, 'Select a reason'); return }
    if ((outcome === 'Had conversation' || outcome === 'Answered - had conversation') && quality === 'Bad' && !lostReason) {
      toast(false, 'Select a reason for Bad quality'); return
    }

    setLoading(true)
    try {
      const update = { updated_at: new Date().toISOString() }
      // Save reassignment if changed
      if (assignedTo && assignedTo !== lead.assigned_to) {
        update.assigned_to = assignedTo
      }

      // ─── YTQ: Not connected outcomes ───────────────────────────
      if (isYTQ && connected === false) {
        if (outcome === 'No answer') {
          // Normalize unknown statuses: if status isn't in any map, treat as 'New' (first attempt)
          const effectiveStatus = NEXT_ATTEMPT_STATUS[lead.status] !== undefined ? lead.status
            : (subPhase === 'connected' && NEXT_CONNECTED_STATUS[lead.status] !== undefined ? lead.status : 'New')
          const nextStatus = subPhase === 'connected'
            ? NEXT_CONNECTED_STATUS[effectiveStatus]
            : NEXT_ATTEMPT_STATUS[effectiveStatus]
          if (nextStatus) {
            update.status = nextStatus
            if (subPhase === 'yet_to_connect') {
              update.attempt_count = (lead.attempt_count || 0) + 1
              if (nextStatus === 'Lost') {
                update.follow_up_date = null
                update.lost_reason = '3 attempts, no answer'
              } else {
                const delay = ATTEMPT_DELAYS[effectiveStatus] || 2
                update.follow_up_date = addDays(today(), delay)
              }
            }
          }
        } else if (outcome === 'Not interested') {
          update.status = 'Lost'
          update.lost_reason = lostReason
          update.follow_up_date = null
        }
      }

      // ─── YTQ: Connected outcomes ───────────────────────────────
      if (isYTQ && connected === true) {
        if (outcome === 'Answered - busy, call back' || outcome === 'Busy again') {
          if (subPhase === 'yet_to_connect') {
            update.status = 'Connected Attempt 1'
            update.connected_attempt_count = 1
          } else {
            const effectiveConnStatus = NEXT_CONNECTED_STATUS[lead.status] !== undefined ? lead.status : 'Connected Attempt 1'
            const nextStatus = NEXT_CONNECTED_STATUS[effectiveConnStatus]
            update.status = nextStatus
            update.connected_attempt_count = (lead.connected_attempt_count || 0) + 1
            if (nextStatus === 'Lost') {
              update.follow_up_date = null
              update.lost_reason = '3 connected attempts, still cannot qualify'
            }
          }
          if (update.status !== 'Lost') {
            update.follow_up_date = followUpDate || tomorrow()
            update.call_back_time = callBackTime || null
          }
        } else if (outcome === 'Answered - had conversation' || outcome === 'Had conversation') {
          if (quality === 'Bad') {
            update.status = 'Not Qualified'
            update.phase = 'yet_to_qualify'
            update.lead_quality = quality
            update.lost_reason = lostReason || 'Bad quality'
            update.follow_up_date = null
          } else {
            update.status = 'Follow-up 1'
            update.phase = 'qualified'
            update.lead_quality = quality
            update.follow_up_date = followUpDate || tomorrow()
            // Save all qualification details
            if (occasion) update.occasion = occasion
            if (occasionDate) update.occasion_date = occasionDate
            if (productsInterested.length > 0) update.products_interested = productsInterested.join(', ')
            if (channel) update.channel = channel
            if (leadSource) update.lead_source = leadSource
            if (utmSource) update.utm_source = utmSource
            if (utmMedium) update.utm_medium = utmMedium
            if (utmCampaign) update.utm_campaign = utmCampaign
            if (utmContent) update.utm_content = utmContent
            if (utmTerm) update.utm_term = utmTerm
            if (clientRequirements.trim()) update.client_requirements = clientRequirements.trim()
          }
          if (clientName.trim()) update.client_name = clientName.trim()
        } else if (outcome === 'Not interested') {
          update.status = 'Lost'
          update.lost_reason = lostReason
          update.follow_up_date = null
        }
      }

      // ─── Qualified outcomes ────────────────────────────────────
      if (isQualified) {
        // Always save detail fields so team can update on every call
        if (occasion) update.occasion = occasion
        if (occasionDate) update.occasion_date = occasionDate
        if (productsInterested.length > 0) update.products_interested = productsInterested.join(', ')
        if (channel) update.channel = channel
        if (leadSource) update.lead_source = leadSource
        if (utmSource) update.utm_source = utmSource
        if (utmMedium) update.utm_medium = utmMedium
        if (utmCampaign) update.utm_campaign = utmCampaign
        if (utmContent) update.utm_content = utmContent
        if (utmTerm) update.utm_term = utmTerm
        if (clientRequirements.trim()) update.client_requirements = clientRequirements.trim()

        if (outcome === 'Call back later') {
          const fuMap = { 'Follow-up 1': 'Follow-up 2', 'Follow-up 2': 'Follow-up 3' }
          if (fuMap[lead.status]) update.status = fuMap[lead.status]
          update.follow_up_date = followUpDate || tomorrow()
          update.call_back_time = callBackTime || null
        } else if (outcome === 'Store visit booked') {
          update.status = 'Store Visit Booked'
          update.follow_up_date = followUpDate || tomorrow()
          update.store_visit_booking = 'Yes'
        } else if (outcome === 'Proposal sent') {
          update.status = 'Proposal Sent'
          update.follow_up_date = addDays(today(), 2)
        } else if (outcome === 'Ready to close') {
          update.status = 'To be Closed'
          update.follow_up_date = followUpDate || tomorrow()
        } else if (outcome === 'Converted') {
          update.status = 'Converted'
          update.follow_up_date = null
          // Legacy fields for backward compat
          if (linkedOrders.length > 0) {
            update.order_id = linkedOrders[0].order_number
            update.amount = linkedOrderTotal || null
          }
        } else if (outcome === 'Lost') {
          update.status = 'Lost'
          update.lost_reason = lostReason
          update.follow_up_date = null
        }
      }

      // Notes go to lead_interactions only — NOT appended to client_requirements

      // Update the lead
      const { error } = await supa.from('leads').update(update).eq('id', lead.id)
      if (error) throw error

      // Insert linked orders into junction table
      if (linkedOrders.length > 0) {
        await supa.from('lead_orders').insert(
          linkedOrders.map(o => ({
            lead_id: lead.id,
            order_id: o.id,
            linked_by: window._currentUserEmail || 'unknown',
          }))
        )
      }

      // Log the interaction
      const outcomeLabel = isYTQ && connected === false ? outcome : outcome
      await supa.from('lead_interactions').insert([{
        lead_id: lead.id,
        interaction_type: 'Call',
        outcome: outcomeLabel,
        note: notes.trim() || outcomeLabel,
        contacted_by: window._currentUserEmail || 'unknown',
        contacted_by_name: window._currentUserName || '',
      }])

      toast(true, `${outcomeLabel} → ${update.status || lead.status}`)
      onLeadUpdated?.()
      onClose()
    } catch (err) {
      console.error('Log call error:', err)
      toast(false, 'Failed to log call')
    } finally {
      setLoading(false)
    }
  }

  // ─── Determine if we need follow-up / lost reason / converted fields ──
  const needsFollowUp = ['Answered - busy, call back', 'Busy again', 'Call back later', 'Store visit booked', 'Ready to close'].includes(outcome)
    || ((outcome === 'Had conversation' || outcome === 'Answered - had conversation') && quality !== 'Bad')
  const needsLostReason = ['Not interested', 'Lost'].includes(outcome)
    || ((outcome === 'Had conversation' || outcome === 'Answered - had conversation') && quality === 'Bad')
  const needsConverted = outcome === 'Converted'
  const showQualifyForm = (outcome === 'Had conversation' || outcome === 'Answered - had conversation')

  // ─── RENDER ────────────────────────────────────────────────────────────
  return (
    <Overlay onClose={onClose}>
      <div className={`w-full mx-auto bg-white shadow-2xl ${isMobile ? 'h-full rounded-none' : 'sm:max-w-lg rounded-2xl'}`} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 flex justify-between items-center border-b" style={{ borderColor: C.border }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: C.text }}>Log Call</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-bold" style={{ color: C.text }}>
                {lead?.client_name || lead?.phone}
              </span>
              <Badge color={phaseColor.color} bg={phaseColor.bg}>{phaseColor.label}</Badge>
              <span className="text-xs" style={{ color: C.textMuted }}>{lead?.status}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-2xl hover:opacity-60" style={{ color: C.textMuted }}>×</button>
        </div>

        {/* Step indicator */}
        {isYTQ && (
          <div className="px-5 pt-4 flex items-center">
            {wizardSteps.map((s, i) => (
              <React.Fragment key={s.num}>
                {i > 0 && <StepLine done={step > s.num} color={accentColor} />}
                <StepDot
                  num={s.num}
                  label={s.label}
                  active={step === s.num}
                  done={step > s.num}
                  color={accentColor}
                />
              </React.Fragment>
            ))}
          </div>
        )}

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* ═══ YTQ WIZARD ═══ */}
          {isYTQ && (
            <>
              {/* Step 1: Did you reach them? */}
              {step === 1 && (
                <div>
                  <label className="block text-sm font-bold mb-3" style={{ color: C.text }}>
                    Did you reach them?
                  </label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleReachChoice(false)}
                      className="flex-1 py-4 rounded-xl font-bold transition-all text-center"
                      style={{
                        background: connected === false ? '#f97316' + '10' : C.bg,
                        color: connected === false ? '#f97316' : C.text,
                        border: `2px solid ${connected === false ? '#f97316' : C.border}`,
                      }}
                    >
                      <div className="text-2xl mb-1">📵</div>
                      <div className="text-sm">No, didn't connect</div>
                    </button>
                    <button
                      onClick={() => handleReachChoice(true)}
                      className="flex-1 py-4 rounded-xl font-bold transition-all text-center"
                      style={{
                        background: connected === true ? '#16a34a' + '10' : C.bg,
                        color: connected === true ? '#16a34a' : C.text,
                        border: `2px solid ${connected === true ? '#16a34a' : C.border}`,
                      }}
                    >
                      <div className="text-2xl mb-1">📞</div>
                      <div className="text-sm">Yes, answered</div>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Not connected — outcome selection */}
              {step === 2 && connected === false && (
                <div>
                  <button onClick={() => { setStep(1); setConnected(null); setOutcome('') }} className="text-xs font-bold mb-3 flex items-center gap-1" style={{ color: accentColor }}>
                    ← Back
                  </button>
                  <label className="block text-sm font-bold mb-3" style={{ color: C.text }}>
                    What happened?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <OutcomePill label="No answer" icon="📵" selected={outcome === 'No answer'} color="#f97316" onClick={() => setOutcome('No answer')} />
                    <OutcomePill label="Not interested" icon="✕" selected={outcome === 'Not interested'} color="#dc2626" onClick={() => setOutcome('Not interested')} />
                  </div>

                  {outcome === 'No answer' && (
                    <div className="mt-4 p-3 rounded-xl" style={{ background: '#f97316' + '06', border: `1px solid #f9741630` }}>
                      <div className="text-xs font-bold" style={{ color: '#f97316' }}>
                        Auto-advance: {lead.status} → {NEXT_ATTEMPT_STATUS[lead.status] || NEXT_CONNECTED_STATUS[lead.status] || 'Next'}
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: C.textMuted }}>
                        Follow-up will be auto-scheduled
                      </div>
                    </div>
                  )}

                  {outcome === 'Not interested' && (
                    <div className="mt-3">
                      <Field label="Reason *">
                        <Select value={lostReason} onChange={e => setLostReason(e.target.value)}>
                          <option value="">Select reason</option>
                          {lists.lost_reasons.map(r => <option key={r} value={r}>{r}</option>)}
                        </Select>
                      </Field>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Connected — conversation outcome */}
              {step === 2 && connected === true && (
                <div>
                  <button onClick={() => { setStep(1); setConnected(null); setOutcome('') }} className="text-xs font-bold mb-3 flex items-center gap-1" style={{ color: accentColor }}>
                    ← Back
                  </button>
                  <label className="block text-sm font-bold mb-3" style={{ color: C.text }}>
                    How did the conversation go?
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <OutcomePill
                      label={subPhase === 'yet_to_connect' ? 'Busy, call later' : 'Busy again'}
                      icon="⏳"
                      selected={outcome === 'Answered - busy, call back' || outcome === 'Busy again'}
                      color="#d97706"
                      onClick={() => setOutcome(subPhase === 'yet_to_connect' ? 'Answered - busy, call back' : 'Busy again')}
                    />
                    <OutcomePill
                      label="Had conversation"
                      icon="💬"
                      selected={outcome === 'Had conversation' || outcome === 'Answered - had conversation'}
                      color="#16a34a"
                      onClick={() => {
                        setOutcome(subPhase === 'yet_to_connect' ? 'Answered - had conversation' : 'Had conversation')
                        setStep(3)
                      }}
                    />
                    <OutcomePill label="Not interested" icon="✕" selected={outcome === 'Not interested'} color="#dc2626" onClick={() => setOutcome('Not interested')} />
                  </div>

                  {/* Busy — follow-up date */}
                  {(outcome === 'Answered - busy, call back' || outcome === 'Busy again') && (
                    <div className={`mt-3 grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                      <Field label="Follow-up Date">
                        <Input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
                      </Field>
                      <Field label="Callback Time">
                        <Input type="time" value={callBackTime} onChange={e => setCallBackTime(e.target.value)} />
                      </Field>
                    </div>
                  )}

                  {/* Not interested — reason */}
                  {outcome === 'Not interested' && (
                    <div className="mt-3">
                      <Field label="Reason *">
                        <Select value={lostReason} onChange={e => setLostReason(e.target.value)}>
                          <option value="">Select reason</option>
                          {lists.lost_reasons.map(r => <option key={r} value={r}>{r}</option>)}
                        </Select>
                      </Field>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Qualify inline */}
              {step === 3 && showQualifyForm && (
                <div>
                  <button onClick={() => { setStep(2); setOutcome('') }} className="text-xs font-bold mb-3 flex items-center gap-1" style={{ color: accentColor }}>
                    ← Back
                  </button>
                  <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(201,164,50,0.04)', border: `1px solid ${C.gold}30` }}>
                    <div className="text-xs font-bold uppercase" style={{ color: C.gold }}>Qualify this lead</div>

                    {/* Quality rating */}
                    <div>
                      <label className="block text-[11px] font-bold uppercase mb-2" style={{ color: C.textMuted }}>Lead Quality *</label>
                      <div className="flex gap-2">
                        {LEAD_QUALITIES.map(q => {
                          const qColors = {
                            'High Quality': '#16a34a', 'Good': '#16a34a', 'Avg': '#6b7280', 'Bad': '#dc2626'
                          }
                          const qc = qColors[q] || '#6b7280'
                          return (
                            <button
                              key={q}
                              onClick={() => setQuality(q)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                              style={{
                                background: quality === q ? qc + '12' : C.bg,
                                color: quality === q ? qc : C.textMuted,
                                border: `1.5px solid ${quality === q ? qc : C.border}`,
                              }}
                            >
                              {q}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Bad quality — reason */}
                    {quality === 'Bad' && (
                      <Field label="Reason *">
                        <Select value={lostReason} onChange={e => setLostReason(e.target.value)}>
                          <option value="">Select reason</option>
                          {lists.lost_reasons.map(r => <option key={r} value={r}>{r}</option>)}
                        </Select>
                      </Field>
                    )}

                    {/* Good quality — all fields in single scroll (no tabs) */}
                    {quality !== 'Bad' && (
                      <div className="space-y-3">
                        {/* Client + Follow-up */}
                        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                          <Field label="Client Name">
                            <Input type="text" placeholder="Full name" value={clientName} onChange={e => setClientName(e.target.value)} />
                          </Field>
                          <Field label="Follow-up Date">
                            <Input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
                          </Field>
                        </div>

                        {/* Occasion + Event Date */}
                        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                          <Field label="Occasion">
                            <Select value={occasion} onChange={e => setOccasion(e.target.value)}>
                              <option value="">Select occasion</option>
                              {lists.occasions.map(o => <option key={o} value={o}>{o}</option>)}
                            </Select>
                          </Field>
                          <Field label="Event Date">
                            <Input type="date" value={occasionDate} onChange={e => setOccasionDate(e.target.value)} />
                          </Field>
                        </div>

                        {/* Products */}
                        <div>
                          <label className="block text-[11px] font-bold uppercase mb-1.5" style={{ color: C.textMuted }}>Products Interested</label>
                          <div className="flex flex-wrap gap-1.5">
                            {lists.product_categories.map(pc => {
                              const sel = productsInterested.includes(pc)
                              return (
                                <button
                                  key={pc}
                                  onClick={() => setProductsInterested(prev =>
                                    sel ? prev.filter(p => p !== pc) : [...prev, pc]
                                  )}
                                  className="px-2.5 py-1 rounded-full text-xs font-bold transition-all"
                                  style={{
                                    background: sel ? 'rgba(37,99,235,0.1)' : C.bg,
                                    color: sel ? '#2563eb' : C.textMuted,
                                    border: `1px solid ${sel ? '#93c5fd' : C.border}`,
                                  }}
                                >
                                  {sel ? '✓ ' : ''}{pc}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Source + Lead Source */}
                        <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                          <Field label="Channel">
                            <Select value={channel} onChange={e => setChannel(e.target.value)}>
                              <option value="">Select Channel</option>
                              {lists.channels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                            </Select>
                          </Field>
                          <Field label="Lead Source">
                            <Select value={leadSource} onChange={e => setLeadSource(e.target.value)}>
                              <option value="">Select Source</option>
                              {lists.lead_sources.map(s => <option key={s} value={s}>{s}</option>)}
                            </Select>
                          </Field>
                        </div>

                        {/* UTM Campaign */}
                        <div className="pt-1">
                          <Field label="UTM Campaign">
                            <input list="utm-campaigns-log" value={utmCampaign} onChange={e => setUtmCampaign(e.target.value)} placeholder="type or pick a campaign" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, background: '#fff', outline: 'none' }} />
                            <datalist id="utm-campaigns-log">{lists.utm_campaigns.map(v => <option key={v} value={v} />)}</datalist>
                          </Field>
                        </div>

                        {/* Requirements */}
                        <Field label="Client Requirements">
                          <textarea
                            rows={2}
                            placeholder="Describe client requirements..."
                            value={clientRequirements}
                            onChange={e => setClientRequirements(e.target.value)}
                            className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none"
                            style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                          />
                        </Field>
                      </div>
                    )}

                    {/* Result preview */}
                    {quality !== 'Bad' && (
                      <div className="pt-2 flex items-center gap-2">
                        <span className="text-xs" style={{ color: '#16a34a' }}>✓</span>
                        <span className="text-xs font-bold" style={{ color: '#16a34a' }}>Will move to Qualified → Follow-up 1</span>
                      </div>
                    )}
                    {quality === 'Bad' && (
                      <div className="pt-2 flex items-center gap-2">
                        <span className="text-xs" style={{ color: '#dc2626' }}>✕</span>
                        <span className="text-xs font-bold" style={{ color: '#dc2626' }}>Will mark as Not Qualified</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ═══ QUALIFIED LEADS — Single-step funnel outcomes ═══ */}
          {isQualified && (
            <>
              {/* Call notes — first for quick capture */}
              <Field label="Call Notes">
                <textarea
                  rows={2}
                  placeholder="What did you discuss? Key takeaways..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none"
                  style={{ background: C.bg, border: `1.5px solid ${C.gold}40`, color: C.text }}
                  autoFocus
                />
              </Field>

              {/* Lead details — always shown, pre-filled from existing data */}
              <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(22,163,74,0.03)', border: '1px solid rgba(22,163,74,0.15)' }}>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase" style={{ color: '#16a34a' }}>Lead Details</div>
                  <div className="text-[10px]" style={{ color: C.textMuted }}>Review & update if changed</div>
                </div>
                <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                  <Field label="Occasion">
                    <Select value={occasion} onChange={e => setOccasion(e.target.value)}>
                      <option value="">Select occasion</option>
                      {lists.occasions.map(o => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  </Field>
                  <Field label="Event Date">
                    <Input type="date" value={occasionDate} onChange={e => setOccasionDate(e.target.value)} />
                  </Field>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase mb-1.5" style={{ color: '#4e4636' }}>Products Interested</label>
                  <div className="flex flex-wrap gap-1.5">
                    {lists.product_categories.map(pc => {
                      const sel = productsInterested.includes(pc)
                      return (
                        <button
                          key={pc}
                          onClick={() => setProductsInterested(prev =>
                            sel ? prev.filter(p => p !== pc) : [...prev, pc]
                          )}
                          className="px-2.5 py-1 rounded-full text-xs font-bold transition-all"
                          style={{
                            background: sel ? 'rgba(37,99,235,0.1)' : C.bg,
                            color: sel ? '#2563eb' : C.textMuted,
                            border: `1px solid ${sel ? '#93c5fd' : C.border}`,
                          }}
                        >
                          {sel ? '✓ ' : ''}{pc}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                  <Field label="Channel">
                    <Select value={channel} onChange={e => setChannel(e.target.value)}>
                      <option value="">Select Channel</option>
                      {lists.channels.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                    </Select>
                  </Field>
                  <Field label="Lead Source">
                    <Select value={leadSource} onChange={e => setLeadSource(e.target.value)}>
                      <option value="">Select Source</option>
                      {lists.lead_sources.map(s => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </Field>
                </div>
                {/* UTM Campaign */}
                <div className="pt-1">
                  <Field label="UTM Campaign">
                    <input list="utm-campaigns-log2" value={utmCampaign} onChange={e => setUtmCampaign(e.target.value)} placeholder="type or pick a campaign" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, background: '#fff', outline: 'none' }} />
                    <datalist id="utm-campaigns-log2">{lists.utm_campaigns.map(v => <option key={v} value={v} />)}</datalist>
                  </Field>
                </div>
                <Field label="Client Requirements">
                  <textarea
                    rows={2}
                    placeholder="Describe client requirements..."
                    value={clientRequirements}
                    onChange={e => setClientRequirements(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none"
                    style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                  />
                </Field>
              </div>

              {/* Outcome selection — funnel progression */}
              <div>
                <label className="block text-[11px] font-bold uppercase mb-2" style={{ color: C.textMuted }}>
                  Outcome
                </label>

                {/* Progression outcomes */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {lists.qualified_call_outcomes.filter(o => !['Lost'].includes(o)).map(o => {
                    const icons = {
                      'Call back later': '📞', 'Store visit booked': '🏬',
                      'Proposal sent': '📄', 'Ready to close': '🎯', 'Converted': '🎉'
                    }
                    const colors = {
                      'Call back later': '#2563eb', 'Store visit booked': '#7c3aed',
                      'Proposal sent': '#0891b2', 'Ready to close': C.gold, 'Converted': '#16a34a'
                    }
                    return (
                      <OutcomePill
                        key={o}
                        label={o}
                        icon={icons[o] || '📋'}
                        selected={outcome === o}
                        color={colors[o] || C.gold}
                        onClick={() => setOutcome(o)}
                      />
                    )
                  })}
                </div>
                {/* Lost — separate, red */}
                <div className="flex gap-2">
                  {lists.qualified_call_outcomes.filter(o => o === 'Lost').map(o => (
                    <OutcomePill key={o} label="Lost" icon="✕" selected={outcome === 'Lost'} color="#dc2626" onClick={() => setOutcome('Lost')} small />
                  ))}
                </div>
              </div>

              {/* Follow-up date for applicable outcomes */}
              {needsFollowUp && !needsConverted && (
                <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                  <Field label="Follow-up Date">
                    <Input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
                  </Field>
                  <Field label="Callback Time">
                    <Input type="time" value={callBackTime} onChange={e => setCallBackTime(e.target.value)} />
                  </Field>
                </div>
              )}

              {/* Lost reason */}
              {outcome === 'Lost' && (
                <Field label="Reason *">
                  <Select value={lostReason} onChange={e => setLostReason(e.target.value)}>
                    <option value="">Select reason</option>
                    {lists.lost_reasons.map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </Field>
              )}

              {/* Converted — searchable multi-order picker (optional) */}
              {needsConverted && (
                <div className="space-y-3">
                  <Field label="Link Orders *">
                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="Search by order number or client name..."
                        value={orderSearch}
                        onChange={e => setOrderSearch(e.target.value)}
                      />
                      {searchingOrders && (
                        <div className="absolute right-3 top-2.5 text-xs" style={{ color: C.textMuted }}>...</div>
                      )}
                    </div>
                    {/* Search results dropdown */}
                    {orderResults.length > 0 && (
                      <div className="mt-1 rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.cardBg }}>
                        {orderResults.map(o => (
                          <button
                            key={o.id}
                            onClick={() => addLinkedOrder(o)}
                            className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-amber-50 transition-colors text-sm"
                            style={{ borderBottom: `1px solid ${C.border}` }}
                          >
                            <span>
                              <strong>{o.order_number}</strong>
                              <span className="text-xs ml-2" style={{ color: C.textMuted }}>{o.customer_name}</span>
                            </span>
                            <span className="text-xs font-bold" style={{ color: '#16a34a' }}>
                              {o.total_price ? `₹${Number(o.total_price).toLocaleString('en-IN')}` : '—'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </Field>

                  {/* Linked order chips */}
                  {linkedOrders.length > 0 && (
                    <div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {linkedOrders.map(o => (
                          <span
                            key={o.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                            style={{ background: 'rgba(37,99,235,0.08)', color: '#2563eb', border: '1px solid rgba(37,99,235,0.2)' }}
                          >
                            {o.order_number} — ₹{Number(o.total_price || 0).toLocaleString('en-IN')}
                            <button
                              onClick={() => removeLinkedOrder(o.id)}
                              className="ml-1 hover:opacity-60"
                              style={{ color: '#93c5fd' }}
                            >×</button>
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.15)' }}>
                        <span className="text-xs font-bold" style={{ color: '#16a34a' }}>Total Order Value</span>
                        <span className="text-sm font-bold" style={{ color: '#16a34a' }}>
                          ₹{linkedOrderTotal.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Reassign — shown when an outcome is selected */}
          {outcome && teamMembers.length > 0 && (
            <Field label="Assign To">
              <Select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {filterStylists(teamMembers).map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </Select>
            </Field>
          )}

          {/* Notes — for YTQ only (qualified has notes at top) */}
          {isYTQ && step >= 2 && outcome && (
            <Field label="Notes">
              <Input
                type="text"
                placeholder="Quick note..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </Field>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 flex gap-3 justify-end border-t" style={{ borderColor: C.border }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            primary
            onClick={handleSubmit}
            disabled={loading || (!outcome && !(isYTQ && step === 1))}
          >
            {loading ? 'Saving...' : 'Save'}
          </Btn>
        </div>
      </div>
    </Overlay>
  )
}

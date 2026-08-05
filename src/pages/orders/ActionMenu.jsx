import React, { useState, useRef, useEffect } from 'react'
import { C } from '../../lib/designTokens'
import { generateMarketplaceInvoice } from '../../lib/receipts'

/**
 * Single-button dropdown action menu.
 *
 * Replaces the inline icon row. All eligible actions for the order's
 * state live inside one ⋯ button — including Approve and Cancel,
 * which used to sit outside this component as standalone buttons.
 *
 * Items shown contextually:
 *   Approve & start production  (pending)
 *   Edit items                  (always)
 *   Trial & Alteration          (Online / Online Assist)
 *   Mark Delivered              (dispatched)
 *   Exchange / Return           (dispatched / delivered / partially-delivered)
 *   Share receipt               (always)
 *   Cancel order                (pending, destructive — bottom of list)
 */
const ActionMenu = ({
  order,
  onApprove,
  onCancel,
  onEdit,
  onTrial,
  onMarkDelivered,
  onExchangeReturn,
  onConfirm, // not used (subsumed by Approve)
  onShareReceipt,
}) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const status          = order.order_status || 'pending'
  const isPending       = status === 'pending'
  const isCancelled     = status === 'cancelled'
  const isTrialEligible = ['Online', 'Online Assist'].includes(order.channel || order.channel_override)
  const isDispatched    = status === 'dispatched'
  const canExchange     = ['dispatched', 'delivered', 'partially-delivered'].includes(status)

  // Built-in SVG icons (uniform size, currentColor)
  const Icons = {
    check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>,
    edit:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>,
    trial: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>,
    swap:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round"><path d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg>,
    share: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0L8 8m4-4v12"/></svg>,
    eye:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"   strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>,
    x:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12"/></svg>,
  }

  const items = []
  if (isPending && onApprove)         items.push({ k: 'approve',  label: 'Approve & start production', icon: Icons.check, colour: C.green || '#16a34a',  action: onApprove })
  if (!isCancelled && onEdit)         items.push({ k: 'edit',     label: 'Edit items',                  icon: Icons.edit,  colour: C.blue  || '#2563eb',  action: onEdit })
  if (!isCancelled && isTrialEligible && onTrial)
                                      items.push({ k: 'trial',    label: 'Trial & Alteration',          icon: Icons.trial, colour: C.purple || '#7c3aed', action: onTrial })
  if (!isCancelled && isDispatched && onMarkDelivered)
                                      items.push({ k: 'delivered',label: 'Mark Delivered',              icon: Icons.check, colour: C.green || '#16a34a',  action: onMarkDelivered })
  if (!isCancelled && canExchange && onExchangeReturn)
                                      items.push({ k: 'exchange', label: 'Exchange / Return',           icon: Icons.swap,  colour: C.amber || '#d97706',  action: onExchangeReturn })
  if (!isCancelled && onShareReceipt) items.push({ k: 'share',    label: 'Share receipt',               icon: Icons.share, colour: C.textMuted || '#64748b', action: onShareReceipt })
  if (!isCancelled && order.channel === 'Marketplace') items.push({ k: 'mpinv', label: 'Marketplace invoice', icon: Icons.share, colour: C.goldDark || '#795900', action: () => generateMarketplaceInvoice(order.id) })
  if (!isCancelled && order.share_token) items.push({ k: 'view',     label: 'View receipt',                icon: Icons.eye,   colour: C.textMuted || '#64748b', action: () => {
    const base = (typeof window !== 'undefined') ? window.location.origin : ''
    window.open(`${base}/#/r/${order.share_token}`, '_blank', 'noopener')
  }})
  if (isPending && onCancel)          items.push({ k: 'cancel',   label: 'Cancel order',                icon: Icons.x,     colour: C.red   || '#dc2626',  action: onCancel, destructive: true })

  if (items.length === 0) return null

  const fire = (fn) => (e) => {
    if (!fn) return
    e.preventDefault()
    e.stopPropagation()
    setOpen(false)
    fn(e)
  }

  return (
    <div ref={ref} className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className="p-1.5 rounded-lg transition-colors"
        title="Actions"
        aria-label="Actions"
        style={{ background: open ? '#f3f4f6' : 'transparent' }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = '#f9fafb' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" style={{ color: C.text }}>
          <circle cx="5"  cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 rounded-xl overflow-hidden"
          style={{
            minWidth: 220,
            background: C.cardBg || '#fff',
            border: `1px solid ${C.border}`,
            boxShadow: '0 10px 30px rgba(27,28,26,0.12)',
          }}
        >
          {items.map((it, i) => {
            const isLast = i === items.length - 1
            return (
              <button
                key={it.k}
                onClick={fire(it.action)}
                className="w-full text-left px-3.5 py-2.5 text-sm flex items-center gap-2.5 transition-colors"
                style={{
                  color: it.destructive ? (C.red || '#dc2626') : C.text,
                  background: 'transparent',
                  borderBottom: isLast ? 'none' : `1px solid ${C.borderLight}`,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = it.destructive ? '#fef2f2' : '#f9fafb' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <span className="w-4 h-4 inline-flex items-center justify-center flex-shrink-0" style={{ color: it.colour }}>
                  {React.cloneElement(it.icon, { className: 'w-4 h-4' })}
                </span>
                <span className="flex-1 font-medium">{it.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ActionMenu

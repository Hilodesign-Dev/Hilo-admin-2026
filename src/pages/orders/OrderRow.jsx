import React, { useState } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, stageColor } from '../../lib/designTokens'
import { Badge } from './ui'
import { useOrders } from '../../context/OrdersContext'
import OrderPaymentsModal from './OrderPaymentsModal'
import { orderStatusColor, payColor, fulfillColor, stageColorFunc, fmtDate, fmtDateTime, derivePaymentStatus, PAYMENT_LABEL } from './constants'
import ActionMenu from './ActionMenu'
import { filterStylists, filterProductionManagers, resolveStaffName } from '../../lib/helpers'
import { useMpConfig, mpAmount } from './marketplaceConfig'


const OrderRow = ({ order, lineItems: lis, activeTab, onApprove, onCancel, onEdit, onFulfill, onTrial, onAlterationItem, onMarkDelivered, onExchangeReturn, onConfirm, onCancelOrder, onShareReceipt, onToggleExpand, isExpanded, teamMembers }) => {
  const ctxOrders = useOrders()
  const customersById = ctxOrders?.customersById || {}
  const customerLookup = customersById[order.buyer_customer_id] || customersById[order.customer_id]
  const [showPayments, setShowPayments] = useState(false)
  const isPending = (order.order_status || 'pending') === 'pending'
  const isCancelled = (order.order_status || '') === 'cancelled'
  const osc = orderStatusColor(order.order_status || 'pending')
  const payStatus = derivePaymentStatus(order)
  const mpCfg = useMpConfig()
  const isMp = order.channel === 'Marketplace'
  const mp = isMp ? mpAmount(order, mpCfg) : null
  const pc = payColor(payStatus)
  const fc = fulfillColor(order.fulfillment_status)

  // Quick-assign stylist / product executive
  const [assigning, setAssigning] = useState(false)
  const quickAssign = async (field, value) => {
    setAssigning(true)
    try {
      const { error } = await supa.from('order_line_items')
        .update({ [field]: value || null })
        .eq('order_id', order.id)
      if (error) throw error
      toast(true, `${field === 'stylist' ? 'Stylist' : 'Product Executive'} assigned`)
      // Update local line items cache
      if (lis && lis.length > 0) lis.forEach(li => { li[field] = value })
    } catch (e) {
      toast(false, `Failed: ${e.message}`)
    } finally { setAssigning(false) }
  }

  const phone = () => {
    let raw = order.delivery_phone || customerLookup?.phone || ''
    if (!raw) {
      const m = (order.notes || '').match(/(?:Phone|Mobile|Contact)[:\s]*(\+?[0-9][0-9\s-]{7,})/i)
      if (m) raw = m[1]
    }
    if (!raw) {
      const m2 = (order.notes || '').match(/\+?[0-9][0-9\s-]{8,}/)
      if (m2) raw = m2[0]
    }
    if (!raw) return '—'
    let digits = String(raw).replace(/[^\d+]/g, '')
    if (digits.startsWith('+')) {
      const rest = digits.replace(/^\+/, '')
      if (rest.length === 12) return `+${rest.slice(0,2)} ${rest.slice(2,7)} ${rest.slice(7)}`
      if (rest.length === 11) return `+${rest.slice(0,1)} ${rest.slice(1,4)} ${rest.slice(4,7)} ${rest.slice(7)}`
      return digits
    }
    if (digits.length === 10) return `+91 ${digits.slice(0,5)} ${digits.slice(5)}`
    if (digits.length === 12 && digits.startsWith('91')) return `+91 ${digits.slice(2,7)} ${digits.slice(7)}`
    return raw
  }

  // Customer profile deep link: opens the Customers tab in a new tab
  // and asks it to auto-focus the buyer behind this order.
  const openCustomerProfile = (e) => {
    e.stopPropagation()
    const target = order.buyer_customer_id || order.customer_id
    if (!target) { window.open('/#/customers', '_blank'); return }
    window.open(`/#/customers?customer=${encodeURIComponent(target)}`, '_blank')
  }

  const deliveryMethod = () => {
    return order.delivery_type || order.fulfillment_type || '—'
  }

  return (
    <div style={{ borderTop: `1px solid ${C.borderLight}` }}>
      {/* Mobile card layout */}
      <div className="lg:hidden px-4 py-3 hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => onToggleExpand(order.id)}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 transition-transform flex-shrink-0" style={{ color: C.textLight, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} fill="none" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="text-sm font-bold font-mono" style={{ color: C.text }}>{order.order_number}</span>
            <Badge bg={osc.bg} color={osc.text}>{(order.order_status || 'pending').replace(/-/g, ' ')}</Badge>
          </div>
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <ActionMenu order={order}
              onApprove={isPending ? () => onApprove(order) : null}
              onCancel={isPending ? () => onCancel(order) : null}
              onEdit={() => onEdit(order)}
              onTrial={() => onTrial(order)}
              onMarkDelivered={onMarkDelivered ? () => onMarkDelivered(order) : null}
              onExchangeReturn={onExchangeReturn ? () => onExchangeReturn(order) : null}
              onConfirm={onConfirm ? () => onConfirm(order) : null}
              onShareReceipt={onShareReceipt ? () => onShareReceipt(order) : null} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs mb-1.5 flex-wrap" style={{ color: C.textMuted }}>
          <button onClick={openCustomerProfile} className="font-medium hover:underline text-left" style={{ color: C.text }} title="Open customer profile">
            {order.customer_name || '—'}
          </button>
          {(order.customer_email || customerLookup?.email) && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-mono inline-flex items-center gap-1 truncate max-w-[200px]" style={{ background: C.blueBg, color: C.blue, border: `1px solid ${C.blueBg}` }} title={order.customer_email || customerLookup?.email}>
              <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              <span className="truncate">{order.customer_email || customerLookup?.email}</span>
            </span>
          )}
          <span>{fmtDate(order.created_at)}</span>
          <span className="font-mono font-bold" style={{ color: C.text }}>₹{Math.round((isMp ? mp.net : order.total_price) || 0).toLocaleString('en-IN')}</span>
          {isMp && mp.effOff != null && <span className="text-[10px] font-bold" style={{ color: mp.flag ? C.red : C.textLight }}>{mp.effOff}% off{mp.flag ? ' ⚠' : ''}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge color={pc.text} bg={pc.bg}>{PAYMENT_LABEL[payStatus] || payStatus}</Badge>
          <Badge color={fc.text} bg={fc.bg}>{order.fulfillment_status || 'unfulfilled'}</Badge>
          {order.channel && <Badge color={C.goldDark} bg={C.goldLight}>{order.channel}{order.channel === 'Marketplace' && order.marketplace_name ? ` · ${order.marketplace_name}` : ''}</Badge>}
          {lis[0]?.stylist && <Badge color={C.purple} bg={C.purpleBg}>{resolveStaffName(teamMembers, lis[0].stylist)}</Badge>}
          {lis[0]?.product_executive && <Badge color={C.blue} bg={C.blueBg}>{resolveStaffName(teamMembers, lis[0].product_executive)}</Badge>}
        </div>
      </div>

      {/* Desktop grid layout */}
      <div className="hidden lg:grid lg:grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => onToggleExpand(order.id)}>

        {/* Order # — date + stylist stacked below */}
        <div className="col-span-2 min-w-0">
          <div className="text-sm font-bold font-mono truncate" style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }} title={order.order_number}>{order.order_number}</div>
          <div className="text-[10px] mt-0.5" style={{ color: C.textLight, fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(order.created_at)}</div>
          {isMp && order.marketplace_order_ref && <div className="text-[10px] mt-0.5 font-mono truncate" style={{ color: C.textMuted }} title={`${order.marketplace_name||''} ${order.marketplace_order_ref}`}>{order.marketplace_name ? order.marketplace_name + ' · ' : ''}{order.marketplace_order_ref}</div>}
          {lis[0]?.stylist && <div className="mt-1"><Badge color={C.purple} bg={C.purpleBg}>{resolveStaffName(teamMembers, lis[0].stylist)}</Badge></div>}
        </div>

        {/* Customer — name + email tag + product exec badge */}
        <div className="col-span-2 min-w-0">
          <button onClick={openCustomerProfile} className="text-sm font-medium text-left hover:underline truncate block max-w-full" style={{ color: C.text }} title={order.customer_name || ''}>
            {order.customer_name || '—'}
          </button>
          {(order.customer_email || customerLookup?.email) && (
            <span className="text-[10px] mt-1 px-2 py-0.5 rounded-full font-mono inline-flex items-center gap-1 truncate max-w-full" style={{ background: C.blueBg, color: C.blue, border: `1px solid ${C.blueBg}` }} title={order.customer_email || customerLookup?.email}>
              <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 00-2 2z"/></svg>
              <span className="truncate">{order.customer_email || customerLookup?.email}</span>
            </span>
          )}
          {lis[0]?.product_executive && <div className="mt-1"><Badge color={C.blue} bg={C.blueBg}>{resolveStaffName(teamMembers, lis[0].product_executive)}</Badge></div>}
        </div>

        {/* Phone — bold, prominent; tap-to-call */}
        <div className="col-span-2 min-w-0">
          {phone() === '—' ? (
            <span className="text-xs" style={{ color: C.textLight }}>—</span>
          ) : (
            <a href={`tel:${phone().replace(/[^\d+]/g,'')}`} onClick={e => e.stopPropagation()}
              className="text-sm font-bold font-mono truncate block hover:underline"
              style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}
              title={phone()}>{phone()}</a>
          )}
        </div>

        {/* Status above Channel — stacked, frees a column */}
        <div className="col-span-1 min-w-0">
          <Badge bg={osc.bg} color={osc.text}>{(order.order_status || 'pending').replace(/-/g, ' ')}</Badge>
          {order.channel && (
            <div className="mt-1 text-[11px] truncate" style={{ color: C.textMuted }} title={order.channel}>
              {order.channel}
              {order.channel === 'Marketplace' && order.marketplace_name ? (
                <span style={{ color: C.textLight }}> · {order.marketplace_name}</span>
              ) : null}
            </div>
          )}
        </div>

        {/* Amount — marketplace shows entered invoice value + MRP + discrepancy */}
        <div className="col-span-1 text-sm font-bold font-mono text-right" style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>
          {isMp ? (
            <>
              ₹{Math.round(mp.net || 0).toLocaleString('en-IN')}
              <div className="text-[9px] font-normal" style={{ color: C.textLight }}>MRP ₹{Math.round(mp.gross || 0).toLocaleString('en-IN')}</div>
              {mp.effOff != null && (
                <div className="text-[9px] font-bold" style={{ color: mp.flag ? C.red : C.textMuted }}
                  title={mp.expectedOff != null ? `Expected ${mp.expectedOff}% off; actual ${mp.effOff}%` : `${mp.effOff}% off MRP`}>
                  {mp.effOff}% off{mp.flag ? ` ⚠ exp ${mp.expectedOff}%` : ''}
                </div>
              )}
            </>
          ) : `₹${Math.round(order.total_price || 0).toLocaleString('en-IN')}`}
        </div>

        {/* Payment */}
        <div className="col-span-1 min-w-0">
          <Badge color={pc.text} bg={pc.bg}>{PAYMENT_LABEL[payStatus] || payStatus}</Badge>
          {payStatus === 'partial' && Number(order.payment_collected || 0) > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setShowPayments(true) }}
              className="block mt-1 text-[10px] font-mono hover:underline text-left truncate max-w-full"
              style={{ color: C.green || '#16a34a', fontVariantNumeric: 'tabular-nums' }}
              title={`₹${Math.round(order.payment_collected || 0).toLocaleString('en-IN')} of ₹${Math.round(order.total_price || 0).toLocaleString('en-IN')}`}>
              ₹{Math.round(order.payment_collected || 0).toLocaleString('en-IN')} of ₹{Math.round(order.total_price || 0).toLocaleString('en-IN')}
              <span style={{ color: C.textLight, marginLeft: 4 }}>↗</span>
            </button>
          )}
        </div>

        {/* Fulfillment */}
        <div className="col-span-1 min-w-0">
          <Badge color={fc.text} bg={fc.bg}>{order.fulfillment_status || 'unfulfilled'}</Badge>
        </div>

        {/* Delivery */}
        <div className="col-span-1 min-w-0 text-xs truncate pr-2" style={{ color: C.textMuted }} title={deliveryMethod()}>{deliveryMethod()}</div>

        {/* Actions — includes expand chevron at the end */}
        <div className="col-span-1 flex items-center justify-end gap-2 pl-3" onClick={e => e.stopPropagation()}>
          <ActionMenu order={order}
            onApprove={isPending ? () => onApprove(order) : null}
            onCancel={isPending ? () => onCancel(order) : null}
            onEdit={() => onEdit(order)}
            onTrial={() => onTrial(order)}
            onMarkDelivered={onMarkDelivered ? () => onMarkDelivered(order) : null}
            onExchangeReturn={onExchangeReturn ? () => onExchangeReturn(order) : null}
            onConfirm={onConfirm ? () => onConfirm(order) : null}
            onShareReceipt={onShareReceipt ? () => onShareReceipt(order) : null} />
          <button onClick={(e) => { e.stopPropagation(); onToggleExpand(order.id) }}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title={isExpanded ? 'Collapse' : 'Expand'}>
            <svg className="w-4 h-4 transition-transform" style={{ color: C.textLight, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} fill="none" viewBox="0 0 16 16">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Line Items */}
      {isExpanded && (
        <div className="px-2 sm:px-4 pb-4">
          {/* Quick-assign bar for pending/in-progress orders */}
          {!isCancelled && teamMembers && teamMembers.length > 0 && (
            <div className="sm:ml-6 mb-2 flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.borderLight}` }}>
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Assign:</span>
              <select
                value={lis[0]?.stylist || ''}
                onChange={e => quickAssign('stylist', e.target.value)}
                disabled={assigning}
                className="text-xs px-2 py-1 rounded-lg outline-none"
                style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text, minWidth: 120 }}
              >
                <option value="">Stylist…</option>
                {filterStylists(teamMembers).map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
              </select>
              <select
                value={lis[0]?.product_executive || ''}
                onChange={e => quickAssign('product_executive', e.target.value)}
                disabled={assigning}
                className="text-xs px-2 py-1 rounded-lg outline-none"
                style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text, minWidth: 120 }}
              >
                <option value="">Prod. Executive…</option>
                {filterProductionManagers(teamMembers).map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
              </select>
              {assigning && <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${C.gold} transparent ${C.gold} ${C.gold}` }} />}
            </div>
          )}
          <div className="rounded-xl overflow-hidden sm:ml-6" style={{ border: `1px solid ${C.border}` }}>
            <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider" style={{ background: C.goldLight, color: C.goldDark }}>
              <div className="col-span-4">Product</div>
              <div className="col-span-2">SKU</div>
              <div className="col-span-1">Size</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-2">Stage</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-1"></div>
            </div>
            {lis.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs" style={{ color: C.textLight }}>
                <div className="inline-block w-4 h-4 border-2 border-t-transparent rounded-full animate-spin mb-2" style={{ borderColor: `${C.gold} transparent ${C.gold} ${C.gold}` }} />
                <div>Loading items…</div>
              </div>
            ) : lis.map(li => {
              const sc = stageColor(li.production_stage)
              return (
                <div key={li.id} style={{ borderTop: `1px solid ${C.borderLight}` }}>
                  {/* Mobile line item */}
                  <div className="sm:hidden px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium" style={{ color: C.text }}>{li.title}</div>
                        <div className="text-xs font-mono mt-0.5" style={{ color: C.goldDark }}>{li.sku || '—'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono" style={{ color: C.text }}>×{li.quantity}</div>
                        <div className="text-xs" style={{ color: C.textMuted }}>{li.size || '—'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Badge color={sc.text} bg={sc.bg}>{(li.production_stage || 'pending').replace(/-/g, ' ')}</Badge>
                      <span className="text-[10px]" style={{ color: C.textMuted }}>{li.type || 'General'}</span>
                      {li.alteration_status && (
                        <button onClick={(e) => { e.stopPropagation(); onAlterationItem(li) }} className="ml-auto p-1 rounded hover:bg-gray-100" title="Alteration detail">
                          <svg className="w-3.5 h-3.5" style={{ color: C.amber }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Desktop line item */}
                  <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-2.5 items-center">
                    <div className="col-span-4 text-sm" style={{ color: C.text }}>{li.title}</div>
                    <div className="col-span-2 text-xs font-mono" style={{ color: C.goldDark }}>{li.sku || '—'}</div>
                    <div className="col-span-1 text-xs" style={{ color: C.textMuted }}>{li.size || '—'}</div>
                    <div className="col-span-1 text-sm font-mono" style={{ color: C.text }}>{li.quantity}</div>
                    <div className="col-span-2"><Badge color={sc.text} bg={sc.bg}>{(li.production_stage || 'pending').replace(/-/g, ' ')}</Badge></div>
                    <div className="col-span-1 text-xs" style={{ color: C.textMuted }}>{li.type || 'General'}</div>
                    <div className="col-span-1 text-right">
                      {li.alteration_status && (
                        <button onClick={(e) => { e.stopPropagation(); onAlterationItem(li) }} className="p-1 rounded hover:bg-gray-100" title="Alteration detail">
                          <svg className="w-3.5 h-3.5" style={{ color: C.amber }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {showPayments && <OrderPaymentsModal order={order} onClose={() => setShowPayments(false)} />}
    </div>
  )
}

export default OrderRow

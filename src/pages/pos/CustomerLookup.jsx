import React, { useState, useEffect, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { toast } from '../../lib/designTokens'
import { COUNTRY_CODES } from './constants'
import { POS_T, MIcon } from './tokens'
import { useLeadMasterLists } from '../leads/useLeadMasterLists'

/**
 * Phone-first customer lookup with two-stage UX:
 *
 *   Stage 1 — find/create the customer
 *     Phone input + name/email + (if found) context strip.
 *
 *   Stage 2 — order context
 *     Surfaces automatically once the customer is locked in. Captures
 *     event date, occasion, event, est shipping date, urgency, delivery
 *     type, lead source. These also flow into the attribution downstream
 *     so the team doesn't fill them twice.
 *
 *   "Change customer" button at the top of Stage 2 unlocks Stage 1 again.
 */
const CustomerLookup = ({ stylist, store, mode, customer, orderMeta, onChangeCustomer, onChangeOrderMeta, onContinue, stores = [], onChangeStore }) => {
  const storeName = (store && typeof store === 'object') ? store.name : (store || 'Store')
  const isLocked = !!customer?.customer_id || !!(customer && customer.isNew && customer.name && customer.phone)

  if (isLocked) {
    return (
      <LockedHeader
        customer={customer}
        onChange={() => onChangeCustomer(null)}>
        <OrderMetaPanel orderMeta={orderMeta} onChange={onChangeOrderMeta} onContinue={onContinue} storeName={storeName} mode={mode} stores={stores} store={store} onChangeStore={onChangeStore} />
      </LockedHeader>
    )
  }
  return <LookupForm
    stylist={stylist} store={store} mode={mode}
    onLockCustomer={onChangeCustomer}
  />
}

// ─── STAGE 1 — Lookup form ──────────────────────────────────────────
const LookupForm = ({ onLockCustomer }) => {
  const [countryCode, setCountryCode] = useState('+91')
  const [phone, setPhone] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchHits, setSearchHits] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [context, setContext] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!phone || phone.length < 4) { setSearchHits(null); setContext(null); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const digits = (countryCode + phone).replace(/[^0-9]/g, '')
        const { data, error } = await supa
          .from('customers')
          .select('id, name, phone, email')
          .eq('is_buyer', true)
          .or(`phone.ilike.%${phone}%,phone.eq.${digits}`)
          .limit(5)
        if (error) throw error
        setSearchHits(data || [])
        if (data && data[0]) await loadContext(data[0])
        else setContext(null)
      } catch (e) { console.error('Customer lookup failed:', e) }
      finally { setSearching(false) }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, countryCode])

  const loadContext = async (cust) => {
    try {
      const [meas, orders] = await Promise.all([
        supa.from('customer_measurements').select('id').eq('customer_id', cust.id).eq('is_active', true).limit(1),
        supa.from('shopify_orders').select('total_price, payment_balance').eq('buyer_customer_id', cust.id),
      ])
      setContext({
        measurementOk: !!meas.data?.[0],
        orderCount: orders.data?.length || 0,
        lifetimeValue: (orders.data || []).reduce((s, o) => s + Number(o.total_price || 0), 0),
        openDue: (orders.data || []).reduce((s, o) => s + Number(o.payment_balance || 0), 0),
        customerId: cust.id, customerName: cust.name,
      })
    } catch (e) { console.error(e) }
  }

  const selectExisting = (cust) => {
    onLockCustomer({
      customer_id: cust.id,
      name: cust.name || '',
      email: cust.email || '',
      phone, country_code: countryCode,
      isNew: false,
    })
  }

  const lockNew = () => {
    if (!phone || phone.length < 5) { toast(false, 'Enter a phone number first'); return }
    if (!name) { toast(false, 'Enter the customer name'); return }
    onLockCustomer({
      customer_id: null,
      name, email,
      phone, country_code: countryCode,
      isNew: true,
    })
  }

  const matched = searchHits && searchHits[0]

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="font-bold tracking-tight" style={{ color: POS_T.onSurface, fontSize: 'clamp(22px, 4vw, 32px)', lineHeight: 1.2 }}>
          Find or add customer
        </h1>
        <p className="text-sm mt-1.5" style={{ color: POS_T.onSurfaceVariant }}>
          Phone-first lookup. Existing customers auto-fill; new ones are created on order submit.
        </p>
      </div>

      {/* Phone input */}
      <div className="rounded-xl p-3 sm:p-4 mb-3 flex gap-2"
        style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
        <select value={countryCode} onChange={e => setCountryCode(e.target.value)}
          className="text-base sm:text-lg font-bold bg-transparent outline-none cursor-pointer pr-1"
          style={{ color: POS_T.onSurface, minWidth: 100 }}>
          {COUNTRY_CODES.map(c => <option key={c.code + c.name} value={c.code}>{c.flag} {c.code}</option>)}
        </select>
        <div className="w-px self-stretch" style={{ background: POS_T.outlineVariant }} />
        <div className="flex-1 flex items-center gap-2">
          <MIcon name="phone" size={20} style={{ color: POS_T.onSurfaceVariant }} />
          <input type="tel" inputMode="numeric" value={phone}
            onChange={e => setPhone(e.target.value.replace(/[^0-9 ]/g, ''))}
            placeholder="Enter phone number"
            className="flex-1 text-base sm:text-lg font-semibold bg-transparent outline-none"
            style={{ color: POS_T.onSurface }} />
          {searching && (
            <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: `${POS_T.primaryContainer} transparent ${POS_T.primaryContainer} ${POS_T.primaryContainer}` }} />
          )}
        </div>
      </div>

      {!searching && searchHits && searchHits.length > 0 && (
        <div className="rounded-xl p-3 mb-3"
          style={{ background: POS_T.successContainer, border: `1px solid ${POS_T.success}` }}>
          <div className="flex items-center gap-2 mb-2">
            <MIcon name="check_circle" fill size={18} style={{ color: POS_T.success }} />
            <span className="text-sm font-bold" style={{ color: POS_T.success }}>Existing customer — tap to select</span>
          </div>
          {searchHits.map(b => (
            <button key={b.id} onClick={() => selectExisting(b)}
              className="w-full text-left flex items-center justify-between p-2.5 rounded-lg cursor-pointer hover:opacity-90"
              style={{ background: POS_T.surfaceContainerLowest, marginBottom: 4 }}>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate" style={{ color: POS_T.onSurface }}>{b.name || '(no name)'}</div>
                <div className="text-xs truncate" style={{ color: POS_T.onSurfaceVariant }}>
                  {b.phone}{b.email ? ` · ${b.email}` : ''}
                </div>
              </div>
              <MIcon name="arrow_forward" size={16} style={{ color: POS_T.success }} />
            </button>
          ))}
        </div>
      )}

      {!searching && phone && searchHits && searchHits.length === 0 && (
        <div className="rounded-xl p-3 mb-3 flex items-start gap-3"
          style={{ background: POS_T.warningContainer, border: `1px solid ${POS_T.warning}` }}>
          <MIcon name="person_add" size={18} style={{ color: POS_T.warning }} />
          <div className="flex-1">
            <div className="font-bold text-sm" style={{ color: POS_T.warning }}>New customer</div>
            <div className="text-xs mt-0.5" style={{ color: POS_T.onSurfaceVariant }}>
              Add name + (optional) email below. We'll create the record on order submit.
            </div>
          </div>
        </div>
      )}

      {/* Name + email — only matters for new customers; existing customers auto-fill */}
      {(!matched || (searchHits && searchHits.length === 0)) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <Field label="Name *">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Customer name"
              className="w-full text-base px-3 py-2.5 rounded-lg outline-none"
              style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
          </Field>
          <Field label="Email (optional)">
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" type="email"
              className="w-full text-base px-3 py-2.5 rounded-lg outline-none"
              style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
          </Field>
        </div>
      )}

      {!matched && (
        <div className="flex justify-end">
          <button onClick={lockNew}
            className="text-sm font-bold px-6 py-2.5 rounded-full inline-flex items-center gap-1.5"
            style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>
            Use this customer
            <MIcon name="arrow_forward" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── STAGE 2 — Locked customer header + order meta ───────────────────
const LockedHeader = ({ customer, onChange, children }) => {
  const initial = (customer?.name || '?').charAt(0).toUpperCase()
  return (
    <div className="max-w-3xl mx-auto">
      {/* Compact customer chip — collapses Stage 1 */}
      <div className="rounded-xl p-3 sm:p-4 mb-5 flex items-center gap-3"
        style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0"
          style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate" style={{ color: POS_T.onSurface }}>{customer.name}</div>
          <div className="text-xs truncate" style={{ color: POS_T.onSurfaceVariant }}>
            {customer.country_code}{customer.phone}{customer.email ? ` · ${customer.email}` : ''}
            {customer.isNew ? ' · NEW' : ''}
          </div>
        </div>
        <button onClick={onChange}
          className="text-xs font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-1"
          style={{ border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
          <MIcon name="swap_horiz" size={14} />
          Change
        </button>
      </div>
      {children}
    </div>
  )
}

const OrderMetaPanel = ({ orderMeta, onChange, onContinue, storeName = 'Store', mode = 'in_store', stores = [], store = null, onChangeStore }) => {
  const lists = useLeadMasterLists()
  const update = (patch) => onChange({ ...orderMeta, ...patch })

  // When channel changes, auto-pick a matching store if exactly one fits.
  // Maps form channel label -> sales_channels.id used on stores.
  React.useEffect(() => {
    if (!onChangeStore || !Array.isArray(stores) || stores.length === 0) return
    const wantChannelId =
      orderMeta.channel === 'Online Assist'                          ? 'online-assist' :
      (typeof orderMeta.channel === 'string' && /^in[- ]?store/i.test(orderMeta.channel)) ? 'in-store' :
      null
    if (!wantChannelId) return
    const matching = stores.filter(s => String(s.channel_id || '') === wantChannelId)
    if (matching.length === 0) return
    // If current store doesn't match the chosen channel, switch.
    const currentMatches = store && matching.some(s => s.id === store.id)
    if (!currentMatches) {
      onChangeStore(matching[0])
    }
  }, [orderMeta.channel, stores.length])

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-bold tracking-tight text-lg" style={{ color: POS_T.onSurface }}>Order details</h2>
        <p className="text-xs mt-0.5" style={{ color: POS_T.onSurfaceVariant }}>
          Captured here so attribution flows through automatically.
        </p>
      </div>

      <div className="rounded-xl p-4 mb-5"
        style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Field label="Channel">
              <PillSelect value={orderMeta.channel || (mode === 'online_assist' ? 'Online Assist' : 'In-store')}
                onChange={v => update({ channel: v })}
                options={[`In-store (${storeName})`, 'Online Assist']} />
              <div className="text-[10px] mt-1" style={{ color: POS_T.onSurfaceVariant }}>
                Stored as 'In-store' or 'Online Assist' regardless of store label.
              </div>
            </Field>
          </div>
          <Field label="Event date">
            <DateInput value={orderMeta.event_date || ''} onChange={v => update({ event_date: v })} />
          </Field>
          <Field label="Est. shipping">
            <DateInput value={orderMeta.est_shipping_date || ''} onChange={v => update({ est_shipping_date: v })} />
          </Field>
          <Field label="Occasion">
            <PillSelect value={orderMeta.occasion || ''} onChange={v => update({ occasion: v })}
              options={(lists.occasions && lists.occasions.length ? lists.occasions : ['Wedding', 'Engagement', 'Sangeet', 'Reception', 'Festive', 'Daily', 'Casual', 'Other'])} />
          </Field>
          <Field label="Event">
            <PillSelect value={orderMeta.event || ''} onChange={v => update({ event: v })}
              options={['Groom', 'Groomsmen', 'Family of Groom', 'Bride Side', 'Guest', 'Self', 'Other']} />
          </Field>
          <Field label="Delivery type">
            <PillSelect value={orderMeta.delivery_type || ''} onChange={v => update({ delivery_type: v })}
              options={['Courier', 'In-store pickup', 'Local delivery', 'Bus delivery', 'International']} />
          </Field>
          <Field label="Urgency">
            <PillSelect value={orderMeta.urgency || ''} onChange={v => update({ urgency: v })}
              options={['Urgent', 'Very Important', 'Other']} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Lead source">
              <PillSelect value={orderMeta.lead_source || ''} onChange={v => update({ lead_source: v })}
                options={(lists.lead_sources && lists.lead_sources.length ? lists.lead_sources : ['Walk-in', 'Instagram', 'Referral', 'Repeat Customer', 'Website', 'Other'])} />
            </Field>
          </div>
        </div>
      </div>

      <div className="flex justify-end sticky bottom-4 sm:static">
        <button onClick={onContinue}
          className="text-sm font-bold px-6 py-3 rounded-full inline-flex items-center gap-2 shadow-md w-full sm:w-auto justify-center"
          style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>
          Continue to products
          <MIcon name="arrow_forward" size={18} />
        </button>
      </div>
    </div>
  )
}

const Field = ({ label, children }) => (
  <div>
    <label className="block mb-1 text-[10px] font-bold uppercase tracking-[0.1em]"
      style={{ color: POS_T.onSurfaceVariant }}>{label}</label>
    {children}
  </div>
)
const DateInput = ({ value, onChange }) => (
  <input type="date" value={value} onChange={e => onChange(e.target.value)}
    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
    style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
)

const PillSelect = ({ value, onChange, options }) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map(o => {
      const active = value === o
      return (
        <button key={o} onClick={() => onChange(active ? '' : o)}
          className="text-xs font-semibold px-2.5 py-1.5 rounded-full"
          style={{
            background: active ? POS_T.primaryContainer : POS_T.surfaceContainerLow,
            color: active ? POS_T.onPrimary : POS_T.onSurface,
            border: `1px solid ${active ? POS_T.primaryContainer : POS_T.outlineVariant}`,
          }}>
          {o}
        </button>
      )
    })}
  </div>
)

export default CustomerLookup

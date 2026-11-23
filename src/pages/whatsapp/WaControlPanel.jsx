import React, { useEffect, useState } from 'react'
import { C, toast } from '../../lib/designTokens'
import { waStaffApi } from '../../lib/aiStaffApi'

const emptyShip = {
  name: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
}

function shippingValid(shipping) {
  return Boolean(
    shipping.name.trim()
    && shipping.phone.trim()
    && shipping.line1.trim()
    && shipping.city.trim()
    && shipping.state.trim()
    && /^\d{6}$/.test(shipping.pincode || ''),
  )
}

export default function WaControlPanel({ session, attached = [], onDetach, onClearAttached }) {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')
  const [style, setStyle] = useState('warm')
  const [enabled, setEnabled] = useState(true)
  const [ordersEnabled, setOrdersEnabled] = useState(false)
  const [shipping, setShipping] = useState(emptyShip)
  const [paymentType, setPaymentType] = useState('COD')
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    let cancelled = false
    waStaffApi.getSettings().then((data) => {
      if (cancelled || !data) return
      setSettings(data)
      setEnabled(data.enabled !== false)
      setStyle(data.style || 'warm')
      setNotes(data.styleNotes || '')
      setOrdersEnabled(Boolean(data.ordersEnabled))
    }).catch((e) => toast(false, e?.message || 'Could not load WhatsApp settings'))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setShipping((prev) => ({
      ...prev,
      phone: session?.phone || prev.phone || '',
      name: session?.shopperName || prev.name || '',
    }))
  }, [session?.id, session?.phone, session?.shopperName])

  const saveSettings = async () => {
    setSaving(true)
    try {
      const data = await waStaffApi.patchSettings({
        enabled,
        style,
        styleNotes: notes.slice(0, 800),
        ordersEnabled,
      })
      setSettings(data)
      toast(true, 'WhatsApp AI settings saved')
    } catch (e) {
      toast(false, e?.status === 503
        ? 'WhatsApp settings SQL is missing on this environment'
        : (e?.message || 'Could not save settings'))
    } finally {
      setSaving(false)
    }
  }

  const payOk = Boolean(settings?.paymentLink?.available)
  const shipOk = shippingValid(shipping)
  const canPlace = Boolean(
    session?.id
    && ordersEnabled
    && attached.length >= 1
    && shipOk
    && (paymentType !== 'ONLINE' || payOk),
  )

  const placeOrder = async () => {
    if (!canPlace) {
      if (!session?.id) toast(false, 'Open a WhatsApp thread first')
      else if (!ordersEnabled) toast(false, 'Save settings with place order enabled')
      else if (!attached.length) toast(false, 'Attach at least one catalogue piece')
      else if (!shipOk) toast(false, 'Need name, phone, address, city, state, 6-digit pincode')
      else if (paymentType === 'ONLINE' && !payOk) toast(false, settings?.paymentLink?.reason || 'Payment link is not configured')
      return
    }
    setPlacing(true)
    try {
      const data = await waStaffApi.placeOrder(session.id, {
        paymentType,
        items: attached.map((p) => {
          const variantId = p.variantId || p.variants?.[0]?.id
          return {
            productId: p.id,
            quantity: 1,
            ...(variantId && variantId !== p.id ? { variantId } : {}),
          }
        }),
        shipping: {
          name: shipping.name.trim(),
          phone: shipping.phone.trim(),
          line1: shipping.line1.trim(),
          line2: shipping.line2.trim() || undefined,
          city: shipping.city.trim(),
          state: shipping.state.trim(),
          pincode: shipping.pincode.trim(),
        },
      })
      const num = data?.order?.orderNumber || data?.order?.number
      toast(true, num ? `Order ${num} sent on WhatsApp` : 'Order sent on WhatsApp')
      onClearAttached?.()
      attached.forEach((p) => onDetach?.(p.id))
    } catch (e) {
      toast(false, e?.status === 409
        ? (e.message || settings?.paymentLink?.reason || 'Payment link is not configured')
        : (e?.message || 'Could not place order'))
    } finally {
      setPlacing(false)
    }
  }

  const field = (key, placeholder) => (
    <input
      value={shipping[key]}
      onChange={(e) => setShipping((s) => ({ ...s, [key]: e.target.value }))}
      placeholder={placeholder}
      style={{
        width: '100%', height: 34, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: '0 10px', fontSize: 12, marginBottom: 6, background: '#fff', boxSizing: 'border-box',
      }}
    />
  )

  return (
      <div style={{ borderTop: 'none', padding: 12, background: '#fff' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, marginBottom: 8 }}>
        WhatsApp AI control
      </div>
      {settings && settings.cloudConfigured === false && (
        <div style={{ fontSize: 11, color: C.red, marginBottom: 8, lineHeight: 1.4 }}>
          Cloud API is not configured on the server. This toggle cannot send WhatsApp messages.
        </div>
      )}
      {settings && settings.enabled === false && settings.cloudConfigured !== false && (
        <div style={{ fontSize: 11, color: C.amber, marginBottom: 8, lineHeight: 1.4 }}>
          Assistant is paused. Shoppers are told an admin will reply. Staff send still works.
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Assistant on (pause to human-only)
      </label>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {['warm', 'brief', 'formal'].map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setStyle(id)}
            style={{
              flex: 1, height: 30, borderRadius: 8, fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
              border: `1px solid ${style === id ? C.gold : C.border}`,
              background: style === id ? C.gold : '#fff',
              color: style === id ? '#fff' : C.text,
              cursor: 'pointer',
            }}
          >{id}</button>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value.slice(0, 800))}
        placeholder="Style notes (atelier, language, never mention X)"
        rows={2}
        style={{ width: '100%', fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8, marginBottom: 4, boxSizing: 'border-box' }}
      />
      <div style={{ fontSize: 10, color: C.textLight, marginBottom: 8 }}>{notes.length}/800</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
        <input type="checkbox" checked={ordersEnabled} onChange={(e) => setOrdersEnabled(e.target.checked)} />
        Allow place order from this inbox
      </label>
      <button
        type="button"
        disabled={saving}
        onClick={saveSettings}
        style={{
          width: '100%', height: 34, border: 'none', borderRadius: 8, background: C.navy, color: '#fff',
          fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: 14,
        }}
      >{saving ? 'Saving…' : 'Save settings'}</button>

      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, marginBottom: 8 }}>
        Place order
      </div>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
        Attach 1–5 catalogue cards, fill shipping, then send COD or a payment link on WhatsApp.
      </div>
      {field('name', 'Full name')}
      {field('phone', 'Phone')}
      {field('line1', 'Address line 1')}
      {field('line2', 'Address line 2 (optional)')}
      {field('city', 'City')}
      {field('state', 'State')}
      {field('pincode', '6-digit pincode')}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setPaymentType('COD')}
          style={{
            flex: 1, height: 30, borderRadius: 8, fontSize: 11, fontWeight: 700,
            border: `1px solid ${paymentType === 'COD' ? C.navy : C.border}`,
            background: paymentType === 'COD' ? C.navy : '#fff',
            color: paymentType === 'COD' ? '#fff' : C.text,
            cursor: 'pointer',
          }}
        >COD</button>
        <button
          type="button"
          disabled={!payOk}
          title={!payOk ? (settings?.paymentLink?.reason || 'Payment link not configured') : 'Send Cashfree link'}
          onClick={() => payOk && setPaymentType('ONLINE')}
          style={{
            flex: 1, height: 30, borderRadius: 8, fontSize: 11, fontWeight: 700,
            border: `1px solid ${paymentType === 'ONLINE' ? C.navy : C.border}`,
            background: paymentType === 'ONLINE' ? C.navy : '#fff',
            color: paymentType === 'ONLINE' ? '#fff' : C.textMuted,
            cursor: payOk ? 'pointer' : 'not-allowed',
            opacity: payOk ? 1 : 0.55,
          }}
        >Payment link</button>
      </div>
      {settings?.paymentLink?.reason && !payOk && (
        <div style={{ fontSize: 11, color: C.amber, marginBottom: 8, lineHeight: 1.4 }}>{settings.paymentLink.reason}</div>
      )}
      <button
        type="button"
        disabled={placing || !canPlace}
        onClick={placeOrder}
        style={{
          width: '100%', height: 36, border: 'none', borderRadius: 8,
          background: canPlace ? C.gold : C.border,
          color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
          cursor: canPlace ? 'pointer' : 'not-allowed',
        }}
      >
        {placing
          ? 'Placing…'
          : !ordersEnabled
            ? 'Enable orders, then Save'
            : `Send ${paymentType === 'ONLINE' ? 'payment link' : 'COD order'}`}
      </button>
    </div>
  )
}

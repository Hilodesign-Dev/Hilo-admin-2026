import React from 'react'
import { C } from '../../lib/designTokens'

const GENDER_OPTIONS = ['male', 'female', 'other']
const SOURCE_OPTIONS = ['shopify', 'walk_in', 'referral', 'instagram', 'lead']
const SOURCE_LABELS = { shopify: 'Shopify', walk_in: 'Walk-in', referral: 'Referral', instagram: 'Instagram', lead: 'Lead' }

const BuyerFormModal = ({ show, onClose, form, setForm, onSave, saving, editing }) => {
  if (!show) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.cardBg,
          borderRadius: '12px',
          padding: '24px',
          width: '90%',
          maxWidth: '500px',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: C.text, marginBottom: '16px' }}>
          {editing ? 'Edit Buyer' : 'Add Buyer'}
        </h2>

        <div style={{ display: 'grid', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Gender</label>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              <option value="">— Select —</option>
              {GENDER_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Billing Address</label>
            <input
              type="text"
              value={form.billing_address}
              onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>City</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>State</label>
            <input
              type="text"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Pincode</label>
            <input
              type="text"
              value={form.pincode}
              onChange={(e) => setForm({ ...form, pincode: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Source</label>
            <select
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              {SOURCE_OPTIONS.map((src) => (
                <option key={src} value={src}>
                  {SOURCE_LABELS[src]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
                minHeight: '60px',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: '10px',
              background: C.gold,
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px',
              background: C.borderLight,
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default BuyerFormModal

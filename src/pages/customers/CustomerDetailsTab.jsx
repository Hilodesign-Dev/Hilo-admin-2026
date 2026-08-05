import React from 'react'
import { C } from '../../lib/designTokens'

const GENDER_OPTIONS = ['male', 'female', 'other']
const RELATIONSHIP_OPTIONS = ['self', 'father', 'mother', 'brother', 'sister', 'wife', 'husband', 'friend', 'other']

const CustomerDetailsTab = ({
  customer,
  editingCustomer,
  custForm,
  setCustForm,
  onEdit,
  onSave,
  onCancel,
  saving,
}) => {
  if (!editingCustomer) {
    return (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: C.text, margin: 0, marginBottom: '8px' }}>{customer.name}</h2>
            {customer.phone && <div style={{ fontSize: '13px', color: C.textMuted }}>📞 {customer.phone}</div>}
            {customer.gender && <div style={{ fontSize: '13px', color: C.textMuted }}>Gender: {customer.gender}</div>}
            {customer.relationship && <div style={{ fontSize: '13px', color: C.textMuted }}>Relation: {customer.relationship}</div>}
          </div>
          <button
            onClick={() => onEdit(customer)}
            style={{
              padding: '8px 16px',
              background: C.goldLight,
              color: C.goldDark,
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Edit
          </button>
        </div>
        {customer.notes && (
          <div style={{ padding: '12px', background: C.cream, borderRadius: '6px', fontSize: '13px', color: C.text }}>
            <strong>Notes:</strong> {customer.notes}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '20px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 700, color: C.text, marginBottom: '16px' }}>Edit Wearer</h3>
      <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Name</label>
          <input
            type="text"
            value={custForm.name}
            onChange={(e) => setCustForm({ ...custForm, name: e.target.value })}
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
            value={custForm.phone}
            onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
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
            value={custForm.gender}
            onChange={(e) => setCustForm({ ...custForm, gender: e.target.value })}
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
          <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Relationship</label>
          <select
            value={custForm.relationship}
            onChange={(e) => setCustForm({ ...custForm, relationship: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              fontSize: '13px',
            }}
          >
            {RELATIONSHIP_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Notes</label>
          <textarea
            value={custForm.notes}
            onChange={(e) => setCustForm({ ...custForm, notes: e.target.value })}
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

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={() => onSave()}
          disabled={saving}
          style={{
            flex: 1,
            padding: '10px',
            background: C.green,
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
          onClick={onCancel}
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
  )
}

export default CustomerDetailsTab

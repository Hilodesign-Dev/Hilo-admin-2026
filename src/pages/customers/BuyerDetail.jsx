import React, { useState } from 'react'
import { C, toast } from '../../lib/designTokens'

const GENDER_OPTIONS = ['male', 'female', 'other']
const RELATIONSHIP_OPTIONS = ['self', 'father', 'mother', 'brother', 'sister', 'wife', 'husband', 'friend', 'other']
const SOURCE_OPTIONS = ['shopify', 'walk_in', 'referral', 'instagram', 'lead']
const SOURCE_LABELS = { shopify: 'Shopify', walk_in: 'Walk-in', referral: 'Referral', instagram: 'Instagram', lead: 'Lead' }

const BuyerDetail = ({
  buyer,
  wearers,
  onBack,
  onEditBuyer,
  onAddWearer,
  onSelectCustomer,
  onSaveCustomer,
  onShowForm,
  showCustomerForm,
  onCloseForm,
  editingCustomer,
  custForm,
  setCustForm,
  saving,
  getTypeBadge,
}) => {
  return (
    <div style={{ padding: '20px', background: C.bg, minHeight: '100vh' }}>
      {/* Back Button */}
      <button
        onClick={onBack}
        style={{
          padding: '8px 16px',
          background: C.borderLight,
          border: `1px solid ${C.border}`,
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: '20px',
        }}
      >
        ← Back
      </button>

      {/* Buyer Info Card */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: C.text, margin: '0 0 8px 0' }}>{buyer.name}</h2>
            <div style={{ fontSize: '13px', color: C.textMuted }}>
              <div>📧 {buyer.email}</div>
              <div>📞 {buyer.phone}</div>
              <div>📍 {buyer.city}</div>
            </div>
          </div>
          <button
            onClick={() => onEditBuyer(buyer)}
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
      </div>

      {/* Wearers Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: C.text, margin: 0 }}>Wearers ({wearers.length})</h3>
          <button
            onClick={() => onShowForm(false)}
            style={{
              padding: '8px 16px',
              background: C.gold,
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Add Wearer
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
          {wearers.map((w) => {
            const typeBadge = getTypeBadge(w.customer_type || 'normal')
            return (
              <div
                key={w.id}
                onClick={() => onSelectCustomer(w)}
                style={{
                  background: C.cardBg,
                  border: `1px solid ${C.border}`,
                  borderRadius: '8px',
                  padding: '12px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, marginBottom: '4px' }}>{w.name}</div>
                <div style={{ fontSize: '11px', color: C.textMuted, marginBottom: '2px' }}>Relation: {w.relationship}</div>
                <div style={{ fontSize: '11px', color: C.textMuted, marginBottom: '8px' }}>Gender: {w.gender}</div>
                {w.phone && <div style={{ fontSize: '11px', color: C.textMuted, marginBottom: '8px' }}>📞 {w.phone}</div>}
                <span
                  style={{
                    padding: '2px 6px',
                    background: typeBadge.bg,
                    color: typeBadge.color,
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontWeight: 600,
                  }}
                >
                  {typeBadge.badge} {typeBadge.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Add/Edit Wearer Modal */}
      {showCustomerForm && (
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
          onClick={onCloseForm}
        >
          <div
            style={{
              background: C.cardBg,
              borderRadius: '12px',
              padding: '24px',
              width: '90%',
              maxWidth: '500px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: C.text, marginBottom: '16px' }}>
              {editingCustomer ? 'Edit Wearer' : 'Add Wearer'}
            </h2>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Name *</label>
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

            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button
                onClick={() => onSaveCustomer(custForm, editingCustomer)}
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
                onClick={onCloseForm}
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
      )}
    </div>
  )
}

export default BuyerDetail

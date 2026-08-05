import React from 'react'
import { C, TOP_MEASUREMENTS, BOTTOM_MEASUREMENTS } from '../../lib/designTokens'

const MEASURED_BY_OPTIONS = ['Ambika', 'Varun', 'sahith@']

const MeasurementInput = ({ field, value, onChange, editing }) => {
  if (!editing) {
    return (
      <div style={{ paddingBottom: '12px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, marginBottom: '4px' }}>
          {field.label}
        </div>
        <div style={{ fontSize: '14px', color: C.text }}>{value || '—'}</div>
      </div>
    )
  }

  return (
    <div>
      <label style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted, display: 'block', marginBottom: '4px' }}>
        {field.label}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={value || ''}
        onChange={(e) => onChange(field.key, e.target.value)}
        className="w-full bg-transparent border-0 border-b-2 px-0 py-1.5 text-sm focus:ring-0"
        style={{ borderColor: C.border, color: C.text }}
        onFocus={(e) => (e.target.style.borderColor = C.gold)}
        onBlur={(e) => (e.target.style.borderColor = C.border)}
      />
    </div>
  )
}

const MeasurementsTab = ({
  customer,
  measurement,
  editingMeasurements,
  measForm,
  setMeasForm,
  onEdit,
  onSave,
  onCancel,
  saving,
  TOP_BODY_FIELDS,
  BOTTOM_BODY_FIELDS,
}) => {
  if (!editingMeasurements) {
    return (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: C.text, margin: 0 }}>Measurements (in inches)</h3>
          <button
            onClick={onEdit}
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
            {measurement ? 'Edit' : 'Add'}
          </button>
        </div>

        {measurement ? (
          <div>
            {measurement.measured_by && (
              <div style={{ marginBottom: '12px', padding: '8px', background: C.cream, borderRadius: '4px', fontSize: '12px' }}>
                <strong>Measured by:</strong> {measurement.measured_by}
              </div>
            )}
            {measurement.notes && (
              <div style={{ marginBottom: '12px', padding: '8px', background: C.cream, borderRadius: '4px', fontSize: '12px' }}>
                <strong>Notes:</strong> {measurement.notes}
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: C.text, marginBottom: '12px' }}>Top Measurements</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                {TOP_BODY_FIELDS.map((f) => (
                  <div key={f.key}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: C.textMuted, marginBottom: '4px' }}>{f.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: C.text }}>{measurement[f.key] || '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: C.text, marginBottom: '12px' }}>Bottom Measurements</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                {BOTTOM_BODY_FIELDS.map((f) => (
                  <div key={f.key}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: C.textMuted, marginBottom: '4px' }}>{f.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: C.text }}>{measurement[f.key] || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: C.textMuted }}>No measurements recorded yet.</div>
        )}
      </div>
    )
  }

  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '20px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 700, color: C.text, marginBottom: '16px' }}>Edit Measurements</h3>

      <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Measured By</label>
          <select
            value={measForm.measured_by || ''}
            onChange={(e) => setMeasForm({ ...measForm, measured_by: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              fontSize: '13px',
            }}
          >
            <option value="">— Select —</option>
            {MEASURED_BY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '4px' }}>Notes</label>
          <textarea
            value={measForm.notes || ''}
            onChange={(e) => setMeasForm({ ...measForm, notes: e.target.value })}
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

      <h4 style={{ fontSize: '13px', fontWeight: 700, color: C.text, marginBottom: '12px' }}>Top Measurements</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {TOP_BODY_FIELDS.map((f) => (
          <MeasurementInput
            key={f.key}
            field={f}
            value={measForm[f.key]}
            onChange={(key, val) => setMeasForm({ ...measForm, [key]: val })}
            editing={true}
          />
        ))}
      </div>

      <h4 style={{ fontSize: '13px', fontWeight: 700, color: C.text, marginBottom: '12px' }}>Bottom Measurements</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {BOTTOM_BODY_FIELDS.map((f) => (
          <MeasurementInput
            key={f.key}
            field={f}
            value={measForm[f.key]}
            onChange={(key, val) => setMeasForm({ ...measForm, [key]: val })}
            editing={true}
          />
        ))}
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
          onClick={() => onCancel()}
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

export default MeasurementsTab

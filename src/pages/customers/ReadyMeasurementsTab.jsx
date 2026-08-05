import React, { useState, useEffect } from 'react'
import { C, READY_MEASUREMENT_PANELS, READY_GARMENT_FIELDS, TOP_MEASUREMENTS, BOTTOM_MEASUREMENTS } from '../../lib/designTokens'

// Lookup map: canonical field key -> friendly label (drawn from body field defs)
const FIELD_LABEL = (() => {
  const m = {}
  TOP_MEASUREMENTS.forEach(f => { m[f.key] = f.label })
  BOTTOM_MEASUREMENTS.forEach(f => { m[f.key] = f.label })
  return m
})()

const labelFor = (key) => FIELD_LABEL[key] || key.replace(/_/g, ' ')

const ReadyMeasurementSection = ({ panel, data, onSave, loading }) => {
  const fieldKeys = READY_GARMENT_FIELDS[panel.garment] || []
  const [isEditing, setIsEditing] = useState(false)
  // formData always carries every defined field so the editor renders them
  // even when the JSON is currently empty.
  const buildForm = (src) => {
    const out = {}
    fieldKeys.forEach(k => { out[k] = (src && src[k] != null) ? src[k] : '' })
    if (src && src.notes != null) out.notes = src.notes
    else out.notes = (src && src.notes) || ''
    return out
  }
  const [formData, setFormData] = useState(() => buildForm(data))

  useEffect(() => { setFormData(buildForm(data)) }, [JSON.stringify(data), panel.garment])

  const handleSave = async () => {
    // Strip empty strings → undefined so we don't persist '' for unused fields.
    const out = {}
    Object.entries(formData).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) out[k] = v
    })
    await onSave(panel.key, out)
    setIsEditing(false)
  }
  const handleCancel = () => { setIsEditing(false); setFormData(buildForm(data)) }

  const hasAnyValue = fieldKeys.some(k => data && data[k] != null && data[k] !== '')

  return (
    <div style={{ padding: '16px', background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: '8px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: C.text, margin: 0 }}>{panel.title} Ready Measurements</h4>
          {!hasAnyValue && !isEditing && (
            <div style={{ fontSize: '11px', color: C.textLight, marginTop: '2px' }}>Not yet entered — click Edit to add</div>
          )}
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            style={{ padding: '4px 12px', background: C.goldLight, color: C.goldDark, border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
          >
            Edit
          </button>
        )}
      </div>

      {!isEditing ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', fontSize: '13px' }}>
          {fieldKeys.map(k => (
            <div key={k}>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>{labelFor(k)}</div>
              <div style={{ color: C.text }}>{(data && data[k] != null && data[k] !== '') ? data[k] : '—'}</div>
            </div>
          ))}
          {data && data.notes && (
            <div style={{ gridColumn: '1 / -1', marginTop: '4px' }}>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>Notes</div>
              <div style={{ color: C.text, fontSize: '13px' }}>{data.notes}</div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', marginBottom: '12px' }}>
            {fieldKeys.map(k => (
              <div key={k}>
                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: C.textMuted, display: 'block', marginBottom: '4px' }}>{labelFor(k)}</label>
                <input
                  type="text" inputMode="decimal"
                  value={formData[k] ?? ''}
                  onChange={(e) => setFormData({ ...formData, [k]: e.target.value })}
                  placeholder="—"
                  className="w-full px-2 py-1.5 border-0 border-b-2 text-sm focus:ring-0"
                  style={{ borderColor: C.border, color: C.text }}
                  onFocus={(e) => (e.target.style.borderColor = C.gold)}
                  onBlur={(e) => (e.target.style.borderColor = C.border)}
                />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: C.textMuted, display: 'block', marginBottom: '4px' }}>Notes</label>
            <textarea
              value={formData.notes ?? ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-2 py-1.5 text-sm rounded outline-none"
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleSave}
              disabled={loading}
              style={{ padding: '6px 14px', background: C.green, color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
            >
              {loading ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              style={{ padding: '6px 14px', background: C.borderLight, color: C.text, border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const ReadyMeasurementsTab = ({ customer, readyMeasurements = {}, onSave, saving }) => {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, color: C.text, margin: 0 }}>Ready Measurements</h3>
        <span style={{ fontSize: '11px', color: C.textMuted }}>Measurements taken from existing garments. Used per-garment-type on production print slips.</span>
      </div>
      {READY_MEASUREMENT_PANELS.map((panel) => (
        <ReadyMeasurementSection
          key={panel.key}
          panel={panel}
          data={readyMeasurements[panel.key] || null}
          onSave={onSave}
          loading={saving}
        />
      ))}
    </div>
  )
}

export default ReadyMeasurementsTab

import React from 'react'
import { C, FIT_OPTIONS, LOOK_OPTIONS, COLOUR_PALETTE, PATTERN_OPTIONS, FABRIC_PREF_OPTIONS, BUDGET_OPTIONS } from '../../lib/designTokens'

const ChipSelect = ({ options, selected = [], onChange, colorMap }) => {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const optionValue = typeof opt === 'string' ? opt : opt.label || opt.key
        const isActive = selected.indexOf(optionValue) !== -1
        const chipStyle = colorMap && colorMap[optionValue.toLowerCase()]
          ? {
              background: isActive ? colorMap[optionValue.toLowerCase()] : 'transparent',
              color: isActive ? '#fff' : C.textMuted,
              border: `1px solid ${isActive ? colorMap[optionValue.toLowerCase()] : C.border}`,
            }
          : {
              background: isActive ? C.goldDark : 'transparent',
              color: isActive ? '#fff' : C.textMuted,
              border: `1px solid ${isActive ? C.goldDark : C.border}`,
            }
        return (
          <button
            key={optionValue}
            type="button"
            onClick={() => {
              if (isActive) onChange(selected.filter((s) => s !== optionValue))
              else onChange([...selected, optionValue])
            }}
            className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
            style={chipStyle}
          >
            {optionValue}
          </button>
        )
      })}
    </div>
  )
}

const StyleProfileTab = ({
  customer,
  styleForm,
  setStyleForm,
  readyMeasurements,
  onSave,
  saving,
  editing,
  onEdit,
  onCancel,
}) => {
  const colorMap = {
    black: '#000',
    white: '#fff',
    navy: '#001f3f',
    grey: '#999',
    beige: '#f5e6d3',
    brown: '#8b6f47',
    maroon: '#800000',
    red: '#ff0000',
    pink: '#ffb6c1',
    coral: '#ff7f50',
    peach: '#ffbf95',
    orange: '#ff8c00',
    mustard: '#ffdb58',
    yellow: '#ffff00',
    gold: '#ffd700',
    olive: '#808000',
    green: '#008000',
    sage: '#87ae73',
    teal: '#008080',
    blue: '#0000ff',
    indigo: '#4b0082',
    lavender: '#e6e6fa',
    purple: '#800080',
    cream: '#fffdd0',
    ivory: '#fffff0',
    rust: '#b7410e',
    charcoal: '#36454f',
    camel: '#c3b091',
  }

  if (!editing) {
    return (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: C.text, margin: 0 }}>Style Profile</h3>
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
            Edit
          </button>
        </div>

        <div style={{ display: 'grid', gap: '16px', fontSize: '13px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Preferred Fits</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {styleForm.preferred_fits && styleForm.preferred_fits.length > 0 ? (
                styleForm.preferred_fits.map((fit) => (
                  <span key={fit} style={{ padding: '4px 8px', background: C.goldLight, color: C.goldDark, borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                    {fit}
                  </span>
                ))
              ) : (
                <span style={{ color: C.textMuted }}>Not specified</span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Preferred Looks</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {styleForm.preferred_looks && styleForm.preferred_looks.length > 0 ? (
                styleForm.preferred_looks.map((look) => (
                  <span key={look} style={{ padding: '4px 8px', background: C.goldLight, color: C.goldDark, borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                    {look}
                  </span>
                ))
              ) : (
                <span style={{ color: C.textMuted }}>Not specified</span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Colour Preferences</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {styleForm.colour_preferences && styleForm.colour_preferences.length > 0 ? (
                styleForm.colour_preferences.map((color) => (
                  <span
                    key={color}
                    style={{
                      padding: '4px 8px',
                      background: colorMap[color.toLowerCase()] || C.goldLight,
                      color: ['white', 'cream', 'ivory', 'peach', 'yellow', 'gold', 'beige'].includes(color.toLowerCase()) ? '#000' : '#fff',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    {color}
                  </span>
                ))
              ) : (
                <span style={{ color: C.textMuted }}>Not specified</span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Pattern Preferences</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {styleForm.pattern_preferences && styleForm.pattern_preferences.length > 0 ? (
                styleForm.pattern_preferences.map((pattern) => (
                  <span key={pattern} style={{ padding: '4px 8px', background: C.goldLight, color: C.goldDark, borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                    {pattern}
                  </span>
                ))
              ) : (
                <span style={{ color: C.textMuted }}>Not specified</span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Fabric Preferences</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {styleForm.fabric_preferences && styleForm.fabric_preferences.length > 0 ? (
                styleForm.fabric_preferences.map((fabric) => (
                  <span key={fabric} style={{ padding: '4px 8px', background: C.goldLight, color: C.goldDark, borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                    {fabric}
                  </span>
                ))
              ) : (
                <span style={{ color: C.textMuted }}>Not specified</span>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Budget Range</div>
            <div style={{ color: C.text }}>{styleForm.budget_range || 'Not specified'}</div>
          </div>

          {styleForm.style_notes && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Notes</div>
              <div style={{ color: C.text }}>{styleForm.style_notes}</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '20px' }}>
      <h3 style={{ fontSize: '16px', fontWeight: 700, color: C.text, marginBottom: '16px' }}>Edit Style Profile</h3>

      <div style={{ display: 'grid', gap: '16px', marginBottom: '16px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>Preferred Fits</label>
          <ChipSelect options={FIT_OPTIONS} selected={styleForm.preferred_fits || []} onChange={(val) => setStyleForm({ ...styleForm, preferred_fits: val })} />
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>Preferred Looks</label>
          <ChipSelect options={LOOK_OPTIONS} selected={styleForm.preferred_looks || []} onChange={(val) => setStyleForm({ ...styleForm, preferred_looks: val })} />
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>Colour Preferences</label>
          <ChipSelect options={COLOUR_PALETTE} selected={styleForm.colour_preferences || []} onChange={(val) => setStyleForm({ ...styleForm, colour_preferences: val })} colorMap={colorMap} />
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>Pattern Preferences</label>
          <ChipSelect options={PATTERN_OPTIONS} selected={styleForm.pattern_preferences || []} onChange={(val) => setStyleForm({ ...styleForm, pattern_preferences: val })} />
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: '8px', textTransform: 'uppercase' }}>Fabric Preferences</label>
          <ChipSelect options={FABRIC_PREF_OPTIONS} selected={styleForm.fabric_preferences || []} onChange={(val) => setStyleForm({ ...styleForm, fabric_preferences: val })} />
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Budget Range</label>
          <select
            value={styleForm.budget_range || ''}
            onChange={(e) => setStyleForm({ ...styleForm, budget_range: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              fontSize: '13px',
            }}
          >
            <option value="">— Select —</option>
            {BUDGET_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: C.textMuted, display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Style Notes</label>
          <textarea
            value={styleForm.style_notes || ''}
            onChange={(e) => setStyleForm({ ...styleForm, style_notes: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${C.border}`,
              borderRadius: '6px',
              fontSize: '13px',
              minHeight: '80px',
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

export default StyleProfileTab

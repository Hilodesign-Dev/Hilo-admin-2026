/* ═══════════════════════════════════════════════════════════════════════════
   PHONE INPUT — Country code selector + phone number
   Shows country name + flag + dial code. Fires onCountryChange when code changes.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo } from 'react'
import { C } from '../../lib/designTokens'

// Flag emojis from country name (simple mapping)
const FLAGS = {
  'India': '🇮🇳', 'United States': '🇺🇸', 'Australia': '🇦🇺',
  'UAE': '🇦🇪', 'UK': '🇬🇧', 'Canada': '🇨🇦',
  'Singapore': '🇸🇬', 'Saudi Arabia': '🇸🇦', 'Qatar': '🇶🇦',
  'Kuwait': '🇰🇼', 'Oman': '🇴🇲', 'Bahrain': '🇧🇭',
}

// Parse a phone string like "+919876543210" into { code: '+91', number: '9876543210' }
const parsePhone = (phone, countryCodes = {}) => {
  if (!phone) return { code: '+91', number: '' }
  const str = phone.trim()
  // Try matching known dial codes (longest first)
  const codes = Object.values(countryCodes).sort((a, b) => b.length - a.length)
  for (const code of codes) {
    if (str.startsWith(code)) {
      return { code, number: str.slice(code.length).trim() }
    }
  }
  // Fallback — check if it starts with +
  if (str.startsWith('+')) {
    const match = str.match(/^(\+\d{1,4})\s*(.*)$/)
    if (match) return { code: match[1], number: match[2].trim() }
  }
  return { code: '+91', number: str }
}

export const PhoneInput = ({ value, onChange, onCountryChange, countryCodes = {}, countries = [], placeholder }) => {
  const parsed = useMemo(() => parsePhone(value, countryCodes), [value, countryCodes])

  // Build sorted code options with country names
  const codeOptions = useMemo(() => {
    const opts = []
    const seen = new Set()
    countries.forEach(c => {
      const code = countryCodes[c]
      if (code && !seen.has(code)) {
        seen.add(code)
        opts.push({ country: c, code, flag: FLAGS[c] || '🏳️' })
      }
    })
    return opts
  }, [countries, countryCodes])

  const currentFlag = useMemo(() => {
    const entry = codeOptions.find(o => o.code === parsed.code)
    return entry?.flag || '🇮🇳'
  }, [parsed.code, codeOptions])

  const handleCodeChange = (newCode) => {
    onChange(newCode + parsed.number)
    // Find country for this code and notify parent
    if (onCountryChange) {
      const entry = codeOptions.find(o => o.code === newCode)
      if (entry) onCountryChange(entry.country)
    }
  }

  const handleNumberChange = (newNumber) => {
    // Strip any non-digit except spaces
    const clean = newNumber.replace(/[^\d\s]/g, '')
    onChange(parsed.code + clean)
  }

  return (
    <div className="flex gap-1">
      <select
        value={parsed.code}
        onChange={e => handleCodeChange(e.target.value)}
        className="text-sm font-bold px-2 py-2 rounded-lg outline-none cursor-pointer"
        style={{
          background: C.bg,
          border: `1px solid ${C.border}`,
          color: C.text,
          width: '160px',
          flexShrink: 0,
        }}
      >
        {codeOptions.map(o => (
          <option key={o.code + o.country} value={o.code}>
            {o.flag} {o.code} {o.country}
          </option>
        ))}
      </select>
      <input
        type="tel"
        placeholder={placeholder || '98765 43210'}
        value={parsed.number}
        onChange={e => handleNumberChange(e.target.value)}
        className="flex-1 text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
        style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
      />
    </div>
  )
}

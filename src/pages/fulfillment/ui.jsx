/* ═══════════════════════════════════════════════════════════════════════════
   SHARED UI PRIMITIVES FOR FULFILLMENT
   ═══════════════════════════════════════════════════════════════════════════ */
import React from 'react'
import { C } from '../../lib/designTokens'

export const Overlay = ({ onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>{children}</div>
)

export const Field = ({ label, required, children }) => (
  <div>
    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#4e4636', letterSpacing: '0.06em' }}>
      {label}{required && <span style={{ color: C.red }}> *</span>}
    </label>
    {children}
  </div>
)

export const Input = (props) => (
  <input {...props} className={`w-full text-sm px-3 py-2.5 rounded-xl outline-none transition-colors focus:ring-2 focus:ring-amber-200 ${props.className || ''}`} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, ...props.style }} />
)

export const Select = ({ value, onChange, children, ...rest }) => (
  <select value={value} onChange={onChange} {...rest} className={`w-full text-sm px-3 py-2.5 rounded-xl outline-none transition-colors focus:ring-2 focus:ring-amber-200 ${rest.className || ''}`} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, ...rest.style }}>
    {children}
  </select>
)

export const Badge = ({ children, color = C.gold, bg }) => (
  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold inline-flex items-center whitespace-nowrap" style={{ background: bg || `${color}18`, color }}>
    {children}
  </span>
)

export const Btn = ({ children, onClick, primary, danger, small, disabled, ...rest }) => {
  const base = 'font-bold rounded-xl transition-all inline-flex items-center justify-center gap-1.5'
  const sz = small ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2.5'
  const clr = danger
    ? `text-white ${disabled ? 'opacity-40' : 'hover:opacity-90'}`
    : primary
      ? `text-white ${disabled ? 'opacity-40' : 'hover:opacity-90'}`
      : `${disabled ? 'opacity-40' : 'hover:bg-gray-50'}`
  const bg = danger ? C.red : primary ? C.gold : 'transparent'
  return <button onClick={onClick} disabled={disabled} className={`${base} ${sz} ${clr}`} style={{ background: bg, border: primary || danger ? 'none' : `1px solid ${C.border}`, color: primary || danger ? '#fff' : C.text, ...rest.style }} {...rest}>{children}</button>
}

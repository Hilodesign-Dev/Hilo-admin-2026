import React from 'react'
import { POS_T } from './tokens'

/**
 * DateRangePicker — preset chips + two <input type="date"> fields.
 *
 * Used by every Dues & Ledger sub-tab and (later) the Finance verification view.
 *
 *   <DateRangePicker
 *     value={{ from: '2026-04-01', to: '2026-04-30' }}
 *     onChange={({ from, to }) => …}
 *     presets={[{ key:'this_month', label:'This month' }, …]}
 *   />
 *
 * Presets compute their range at click-time relative to today, so e.g.
 * "This month" always re-anchors to today's month — no stale state.
 */

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const startOfMonth = (offset = 0) => {
  const d = new Date()
  d.setMonth(d.getMonth() + offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const endOfMonth = (offset = 0) => {
  const d = new Date()
  d.setMonth(d.getMonth() + offset + 1, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const minusDays = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const DEFAULT_PRESETS = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'apr_may_26', label: 'Apr–May 2026' },
  { key: 'last_90',    label: 'Last 90 days' },
]

export const rangeFromPreset = (key) => {
  switch (key) {
    case 'this_month': return { from: startOfMonth(0),  to: todayStr() }
    case 'last_month': return { from: startOfMonth(-1), to: endOfMonth(-1) }
    case 'apr_may_26': return { from: '2026-04-01',     to: '2026-05-31' }
    case 'last_90':    return { from: minusDays(90),    to: todayStr() }
    default: return null
  }
}

const DateRangePicker = ({ value = {}, onChange, presets = DEFAULT_PRESETS }) => {
  const { from = '', to = '' } = value
  const activePreset = presets.find(p => {
    const r = rangeFromPreset(p.key)
    return r && r.from === from && r.to === to
  })?.key

  const click = (key) => {
    const r = rangeFromPreset(key)
    if (r) onChange(r)
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-wrap">
      <div className="flex items-center gap-1.5 flex-wrap">
        {presets.map(p => {
          const active = p.key === activePreset
          return (
            <button key={p.key} onClick={() => click(p.key)}
              className="text-xs font-bold px-2.5 py-1.5 rounded-full whitespace-nowrap"
              style={{
                background: active ? POS_T.primaryContainer : POS_T.surfaceContainerLow,
                color: active ? POS_T.onPrimary : POS_T.onSurfaceVariant,
                border: `1px solid ${active ? POS_T.primaryContainer : POS_T.outlineVariant}`,
              }}>
              {p.label}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: POS_T.onSurfaceVariant }}>From</span>
        <input type="date" value={from} onChange={e => onChange({ from: e.target.value, to })}
          className="text-xs px-2 py-1.5 rounded outline-none"
          style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: POS_T.onSurfaceVariant }}>to</span>
        <input type="date" value={to} onChange={e => onChange({ from, to: e.target.value })}
          className="text-xs px-2 py-1.5 rounded outline-none"
          style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
      </div>
    </div>
  )
}

export default DateRangePicker

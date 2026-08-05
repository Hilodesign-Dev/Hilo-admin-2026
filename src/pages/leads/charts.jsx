/* Dependency-free SVG charts shared by Leads dashboards. */
import React from 'react'

export const FUN_COLORS = ['#c9a432', '#2563eb', '#16a34a']
export const LINE_COLORS = ['#c9a432', '#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#0891b2']

export const FunnelChart = ({ stages }) => {
  const max = Math.max(1, ...stages.map(st => st.value))
  const W = 320, H = 62, pad = 8
  const widths = stages.map(st => Math.max(24, (st.value / max) * (W - pad * 2)))
  return (
    <svg viewBox={`0 0 ${W} ${H * stages.length}`} width="100%" style={{ maxWidth: 380 }}>
      {stages.map((st, i) => {
        const wTop = widths[i]
        const wBot = widths[i + 1] != null ? widths[i + 1] : wTop * 0.8
        const cx = W / 2, y = i * H, yb = y + H - 6
        const p = `${cx - wTop / 2},${y + 4} ${cx + wTop / 2},${y + 4} ${cx + wBot / 2},${yb} ${cx - wBot / 2},${yb}`
        const pct = stages[0].value ? Math.round(st.value / stages[0].value * 100) : 0
        return (
          <g key={st.label}>
            <polygon points={p} fill={st.color} opacity="0.92" />
            <text x={cx} y={y + H / 2} textAnchor="middle" fill="#fff" fontSize="15" fontWeight="800">{st.value}</text>
            <text x={cx} y={y + H / 2 + 15} textAnchor="middle" fill="#fff" fontSize="9.5" opacity="0.95" fontWeight="700">{st.label}{i > 0 ? ` · ${pct}%` : ''}</text>
          </g>
        )
      })}
    </svg>
  )
}

export const MultiLineChart = ({ series }) => {
  const W = 680, H = 260, padL = 32, padR = 12, padT = 12, padB = 26
  const maxY = Math.max(1, ...series.flatMap(s => s.values.filter(v => v != null)))
  const xat = (idx) => padL + (idx / 30) * (W - padL - padR)
  const yat = (v) => padT + (1 - v / maxY) * (H - padT - padB)
  const yTicks = 4
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: 'visible' }}>
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const v = Math.round(maxY * i / yTicks), yy = yat(v)
          return <g key={i}>
            <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="#ebe8e0" strokeWidth="1" />
            <text x={padL - 5} y={yy + 3} textAnchor="end" fontSize="9" fill="#807664">{v}</text>
          </g>
        })}
        {[1, 5, 10, 15, 20, 25, 31].map(d => (
          <text key={d} x={xat(d - 1)} y={H - padB + 14} textAnchor="middle" fontSize="9" fill="#807664">{d}</text>
        ))}
        {series.map(s => {
          const pts = s.values.map((v, idx) => v == null ? null : `${xat(idx).toFixed(1)},${yat(v).toFixed(1)}`).filter(Boolean).join(' ')
          return <polyline key={s.name} points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
        })}
      </svg>
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {series.map(s => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-xs" style={{ color: '#4b4b47' }}>
            <span style={{ width: 14, height: 3, borderRadius: 2, background: s.color, display: 'inline-block' }} />{s.name}
          </span>
        ))}
      </div>
    </div>
  )
}

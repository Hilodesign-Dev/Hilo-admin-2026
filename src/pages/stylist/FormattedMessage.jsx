import React from 'react'

const INLINE_RE = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|`([^`]+)`/g

function inlineNodes(str, lineKey) {
  const nodes = []
  let last = 0
  let m
  let i = 0
  INLINE_RE.lastIndex = 0
  while ((m = INLINE_RE.exec(str))) {
    if (m.index > last) nodes.push(str.slice(last, m.index))
    const key = `${lineKey}-${i}`
    if (m[1]) nodes.push(<strong key={key}><em>{m[1]}</em></strong>)
    else if (m[2] || m[3]) nodes.push(<strong key={key}>{m[2] || m[3]}</strong>)
    else if (m[4] || m[5]) nodes.push(<em key={key}>{m[4] || m[5]}</em>)
    else if (m[6]) {
      nodes.push(
        <code
          key={key}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.92em',
            background: 'rgba(0,0,0,0.06)',
            borderRadius: 4,
            padding: '1px 5px',
          }}
        >{m[6]}</code>
      )
    }
    last = m.index + m[0].length
    i += 1
  }
  if (last < str.length) nodes.push(str.slice(last))
  return nodes.length ? nodes : str
}

function lineKind(line) {
  const bullet = line.match(/^\s*[-*]\s+(.+)$/)
  if (bullet) return { type: 'bullet', text: bullet[1] }
  const numbered = line.match(/^\s*(\d+)\.\s+(.+)$/)
  if (numbered) return { type: 'number', n: numbered[1], text: numbered[2] }
  return { type: 'text', text: line }
}

export default function FormattedMessage({ text, style }) {
  const raw = String(text || '')
  if (!raw.trim()) return null
  const lines = raw.replace(/\r\n/g, '\n').split('\n')

  return (
    <div style={{ fontSize: 14, lineHeight: 1.55, ...style }}>
      {lines.map((line, i) => {
        const kind = lineKind(line)
        if (kind.type === 'text' && kind.text === '') {
          return <div key={i} style={{ height: 10 }} />
        }
        if (kind.type === 'bullet') {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, paddingLeft: 2 }}>
              <span style={{ flexShrink: 0, opacity: 0.7 }}>•</span>
              <span>{inlineNodes(kind.text, i)}</span>
            </div>
          )
        }
        if (kind.type === 'number') {
          return (
            <div key={i} style={{ display: 'flex', gap: 8, paddingLeft: 2 }}>
              <span style={{ flexShrink: 0, opacity: 0.7 }}>{kind.n}.</span>
              <span>{inlineNodes(kind.text, i)}</span>
            </div>
          )
        }
        return <div key={i}>{inlineNodes(kind.text, i)}</div>
      })}
    </div>
  )
}

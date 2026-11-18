export function formatWait(seconds) {
  const s = Number(seconds) || 0
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

export function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export function rupee(n) {
  if (n == null || n === '') return ''
  const num = Number(n)
  if (Number.isNaN(num)) return String(n)
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num)
}

/**
 * Formats the timestamp of the last message in a chat thread.
 * Renders concise, high-clarity relative/calendar dates with time:
 * - Today: "Today · 12:21 PM"
 * - Same year: "27 Oct · 12:21 PM"
 * - Prior year: "27 Oct 2025 · 12:21 PM"
 */
export function formatLastMessageDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const now = new Date()
  const isSameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()

  const rawTime = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  const time = rawTime.toUpperCase()

  if (isSameDay) {
    return `Today · ${time}`
  }

  const isSameYear = d.getFullYear() === now.getFullYear()
  const day = d.getDate()
  const month = d.toLocaleDateString('en-IN', { month: 'short' })

  if (isSameYear) {
    return `${day} ${month} · ${time}`
  }
  return `${day} ${month} ${d.getFullYear()} · ${time}`
}

/**
 * Returns a full localized timestamp suitable for the HTML title/hover tooltip.
 * E.g., "Tue, 27 Oct 2026, 12:21 PM"
 */
export function formatFullDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

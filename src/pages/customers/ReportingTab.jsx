/* =============================================================================
   REPORTING TAB — Re-engagement performance analytics
   Shows KPIs, stylist performance, trigger effectiveness, queue efficiency,
   and recent activity log for store owner oversight.
   ============================================================================= */
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { fmt } from '../../lib/helpers'
import Modal from '../../components/Modal'

/* ── constants ── */

var QUICK_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'all', label: 'All Time' },
  { key: 'custom', label: 'Custom' }
]

var TRIGGER_LABELS = {
  occasion: 'Occasion',
  dormant: 'Dormant VIP',
  repeat_due: 'Repeat Due',
  post_purchase: 'Post-Purchase',
  callback: 'Callback',
  manual: 'Manual'
}

var TRIGGER_COLORS = {
  occasion: '#d4a843',
  dormant: '#7c3aed',
  repeat_due: '#2563eb',
  post_purchase: '#16a34a',
  callback: '#d97706',
  manual: '#807664'
}

var DESIGNATION_COLORS = {
  'Online Stylist': { bg: '#dbeafe', text: '#1e40af' },
  'Store Stylist': { bg: '#d1fae5', text: '#065f46' },
  'Assistant Store Manager': { bg: '#fef3c7', text: '#92400e' },
  'Co-founder': { bg: '#fce7f3', text: '#9d174d' }
}

var OUTCOME_LABELS = {
  interested_visit: 'Interested (Visit)',
  interested_info: 'Interested (Info)',
  shared_content: 'Shared Content',
  left_review: 'Left Review',
  not_now: 'Not Now',
  dnc: 'DNC',
  no_answer: 'No Answer',
  wrong_number: 'Wrong Number'
}

/* ── helpers ── */

function getDateRange(key) {
  var now = new Date()
  var start = null
  var end = now.toISOString()

  if (key === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  } else if (key === 'week') {
    var day = now.getDay()
    var diff = day === 0 ? 6 : day - 1
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
    start = monday.toISOString()
  } else if (key === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  } else if (key === 'quarter') {
    var qMonth = Math.floor(now.getMonth() / 3) * 3
    start = new Date(now.getFullYear(), qMonth, 1).toISOString()
  } else {
    start = null
  }

  return { start: start, end: end }
}

function pct(num, den) {
  if (!den || den === 0) return '0%'
  return (num / den * 100).toFixed(1) + '%'
}

function avgRating(items) {
  var rated = items.filter(function(e) { return e.experience_rating && e.experience_rating > 0 })
  if (rated.length === 0) return null
  var sum = rated.reduce(function(acc, e) { return acc + e.experience_rating }, 0)
  return (sum / rated.length).toFixed(1)
}

function formatDate(d) {
  if (!d) return '—'
  var dt = new Date(d)
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(d) {
  if (!d) return '—'
  var dt = new Date(d)
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' +
    dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

/* ── tiny components ── */

var StatCard = function(props) {
  return (
    <div className="rounded-xl p-3 sm:p-4 transition-all hover:shadow-md"
      style={{ background: '#fff', border: '1px solid #eae8e4' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{props.icon}</span>
        <span className="text-[10px] font-bold uppercase" style={{ color: '#807664', letterSpacing: '0.05em' }}>
          {props.label}
        </span>
      </div>
      <div className="text-xl sm:text-2xl font-bold" style={{ color: props.color || '#d4a843' }}>
        {props.value}
      </div>
      {props.sub && <div className="text-xs mt-0.5" style={{ color: '#807664' }}>{props.sub}</div>}
    </div>
  )
}

var DesignationBadge = function(props) {
  var d = props.designation || ''
  var colors = DESIGNATION_COLORS[d] || { bg: '#f3f4f6', text: '#6b7280' }
  return (
    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase"
      style={{ background: colors.bg, color: colors.text }}>
      {d || 'Team'}
    </span>
  )
}

var OutcomeBadge = function(props) {
  var o = props.outcome
  var style = { fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px' }
  if (o === 'interested_visit' || o === 'interested_info') {
    Object.assign(style, { background: '#d1fae5', color: '#065f46' })
  } else if (o === 'shared_content' || o === 'left_review') {
    Object.assign(style, { background: '#dbeafe', color: '#1e40af' })
  } else if (o === 'dnc' || o === 'wrong_number') {
    Object.assign(style, { background: '#fef2f2', color: '#dc2626' })
  } else if (o === 'no_answer') {
    Object.assign(style, { background: '#fef3c7', color: '#92400e' })
  } else {
    Object.assign(style, { background: '#f3f4f6', color: '#6b7280' })
  }
  return <span style={style}>{OUTCOME_LABELS[o] || o || '—'}</span>
}

var TriggerBadge = function(props) {
  var t = props.trigger
  var color = TRIGGER_COLORS[t] || '#807664'
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: color + '18', color: color }}>
      {TRIGGER_LABELS[t] || t || '—'}
    </span>
  )
}

var SectionHeader = function(props) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-6">
      <span className="text-lg">{props.icon}</span>
      <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: '#3d2e1c' }}>
        {props.title}
      </h3>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, #d4a843, transparent)' }} />
    </div>
  )
}

var BarFill = function(props) {
  var width = props.max > 0 ? Math.max(2, (props.value / props.max) * 100) : 0
  return (
    <div className="relative h-6 rounded-full overflow-hidden" style={{ background: '#f0ebe3' }}>
      <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{
        width: width + '%',
        background: 'linear-gradient(90deg, ' + (props.color || '#d4a843') + ', ' + (props.color || '#d4a843') + '88)'
      }} />
      <div className="absolute inset-0 flex items-center px-2 text-[10px] font-bold"
        style={{ color: '#3d2e1c' }}>
        {props.label}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function ReportingTab(props) {
  var buyers = props.buyers || []
  var customers = props.customers || []
  var teamMembers = props.teamMembers || []
  var onRefresh = props.onRefresh

  /* ── state ── */
  var [engagements, setEngagements] = useState([])
  var [queueItems, setQueueItems] = useState([])
  var [loading, setLoading] = useState(true)
  var [rangeKey, setRangeKey] = useState('month')
  var [customFrom, setCustomFrom] = useState('')
  var [customTo, setCustomTo] = useState('')

  /* ── team members map ── */
  var memberMap = useMemo(function() {
    var map = {}
    teamMembers.forEach(function(m) {
      map[String(m.id)] = m
    })
    return map
  }, [teamMembers])

  /* ── buyer/customer name map ── */
  var customerNameMap = useMemo(function() {
    var map = {}
    buyers.forEach(function(b) {
      if (b.id) map[String(b.id)] = b.name || b.customer_name || 'Unknown'
    })
    customers.forEach(function(c) {
      if (c.id) map[String(c.id)] = c.name || c.customer_name || 'Unknown'
    })
    return map
  }, [buyers, customers])

  /* ── compute date range ── */
  var dateRange = useMemo(function() {
    if (rangeKey === 'custom') {
      return {
        start: customFrom ? new Date(customFrom).toISOString() : null,
        end: customTo ? new Date(customTo + 'T23:59:59').toISOString() : new Date().toISOString()
      }
    }
    return getDateRange(rangeKey)
  }, [rangeKey, customFrom, customTo])

  /* ── fetch data ── */
  var fetchData = useCallback(async function() {
    setLoading(true)
    try {
      // Fetch engagements
      var engQuery = supa.from('customer_engagements').select('*')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
      if (dateRange.start) engQuery = engQuery.gte('completed_at', dateRange.start)
      if (dateRange.end) engQuery = engQuery.lte('completed_at', dateRange.end)
      var { data: eng, error: engErr } = await engQuery
      if (engErr) console.error('Engagements fetch error:', engErr)
      setEngagements(eng || [])

      // Fetch queue items
      var queueQuery = supa.from('engagement_queue').select('*')
        .order('created_at', { ascending: false })
      if (dateRange.start) queueQuery = queueQuery.gte('created_at', dateRange.start)
      if (dateRange.end) queueQuery = queueQuery.lte('created_at', dateRange.end)
      var { data: q, error: qErr } = await queueQuery
      if (qErr) console.error('Queue fetch error:', qErr)
      setQueueItems(q || [])
    } catch (err) {
      console.error('Reporting fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(function() { fetchData() }, [fetchData])

  /* ── computed metrics ── */

  var kpis = useMemo(function() {
    var total = engagements.length
    var interested = engagements.filter(function(e) {
      return e.outcome === 'interested_visit' || e.outcome === 'interested_info'
    }).length
    var content = engagements.filter(function(e) { return e.content_requested === true }).length
    var reviews = engagements.filter(function(e) { return e.review_link_shared === true }).length
    var convRate = total > 0 ? (interested / total * 100).toFixed(1) : '0.0'
    var avg = avgRating(engagements)

    return {
      total: total,
      interested: interested,
      content: content,
      reviews: reviews,
      convRate: convRate,
      avgRating: avg
    }
  }, [engagements])

  /* ── stylist performance ── */

  var stylistStats = useMemo(function() {
    var byMember = {}

    engagements.forEach(function(e) {
      var id = String(e.assigned_to || '')
      if (!id) return
      if (!byMember[id]) {
        byMember[id] = {
          id: id,
          total: 0,
          interested: 0,
          content: 0,
          reviews: 0,
          noAnswer: 0,
          dnc: 0,
          ratings: []
        }
      }
      var s = byMember[id]
      s.total++
      if (e.outcome === 'interested_visit' || e.outcome === 'interested_info') s.interested++
      if (e.outcome === 'no_answer') s.noAnswer++
      if (e.outcome === 'dnc') s.dnc++
      if (e.content_requested === true) s.content++
      if (e.review_link_shared === true) s.reviews++
      if (e.experience_rating && e.experience_rating > 0) s.ratings.push(e.experience_rating)
    })

    var rows = Object.keys(byMember).map(function(id) {
      var s = byMember[id]
      var member = memberMap[id] || {}
      var avg = s.ratings.length > 0
        ? (s.ratings.reduce(function(a, b) { return a + b }, 0) / s.ratings.length).toFixed(1)
        : null
      return {
        ...s,
        name: member.name || 'Unknown',
        designation: member.designation || '',
        convRate: s.total > 0 ? (s.interested / s.total * 100).toFixed(1) : '0.0',
        avgRating: avg
      }
    })

    rows.sort(function(a, b) { return b.total - a.total })
    return rows
  }, [engagements, memberMap])

  /* ── trigger effectiveness ── */

  var triggerStats = useMemo(function() {
    var byTrigger = {}

    engagements.forEach(function(e) {
      var t = e.trigger_type || 'manual'
      if (!byTrigger[t]) {
        byTrigger[t] = { trigger: t, total: 0, interested: 0 }
      }
      byTrigger[t].total++
      if (e.outcome === 'interested_visit' || e.outcome === 'interested_info') {
        byTrigger[t].interested++
      }
    })

    var rows = Object.keys(byTrigger).map(function(t) {
      var s = byTrigger[t]
      return {
        ...s,
        convRate: s.total > 0 ? (s.interested / s.total * 100).toFixed(1) : '0.0'
      }
    })

    rows.sort(function(a, b) { return b.total - a.total })
    return rows
  }, [engagements])

  var maxTriggerCalls = useMemo(function() {
    if (triggerStats.length === 0) return 1
    return Math.max.apply(null, triggerStats.map(function(t) { return t.total }))
  }, [triggerStats])

  /* ── queue efficiency ── */

  var queueStats = useMemo(function() {
    var generated = queueItems.length
    var completed = queueItems.filter(function(q) { return q.status === 'completed' }).length
    var skipped = queueItems.filter(function(q) { return q.status === 'skipped' }).length
    var pending = queueItems.filter(function(q) { return q.status === 'pending' || q.status === 'in_progress' }).length
    var completionRate = generated > 0 ? (completed / generated * 100).toFixed(1) : '0.0'

    return {
      generated: generated,
      completed: completed,
      skipped: skipped,
      pending: pending,
      completionRate: completionRate
    }
  }, [queueItems])

  /* ── recent activity (last 20) ── */

  var recentActivity = useMemo(function() {
    return engagements.slice(0, 20).map(function(e) {
      var member = memberMap[String(e.assigned_to || '')] || {}
      var custName = customerNameMap[String(e.customer_id || '')] || e.customer_name || 'Unknown'
      return {
        ...e,
        stylistName: member.name || 'Unknown',
        customerName: custName
      }
    })
  }, [engagements, memberMap, customerNameMap])

  /* ── top performer id ── */
  var topPerformerId = stylistStats.length > 0 ? stylistStats[0].id : null

  /* ═══════════════════════════════════════════════════════════════════════ */

  return (
    <div className="space-y-4 pb-8">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: '#3d2e1c' }}>
            📊 Re-Engagement Reporting
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#807664' }}>
            Track stylist performance, conversion rates, and queue efficiency
          </p>
        </div>
        <button onClick={function() { fetchData() }}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:shadow-md"
          style={{
            background: loading ? '#eae8e4' : 'linear-gradient(135deg, #d4a843, #795900)',
            color: loading ? '#807664' : '#fff',
            border: 'none', cursor: loading ? 'wait' : 'pointer'
          }}
          disabled={loading}>
          {loading ? '⏳ Loading...' : '🔄 Refresh'}
        </button>
      </div>

      {/* ── Date Range Filter ── */}
      <div className="rounded-xl p-3" style={{ background: '#faf8f5', border: '1px solid #eae8e4' }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase" style={{ color: '#807664' }}>📅 Period:</span>
          {QUICK_RANGES.map(function(r) {
            var active = rangeKey === r.key
            return (
              <button key={r.key} onClick={function() { setRangeKey(r.key) }}
                className="text-xs font-semibold px-3 py-1 rounded-full transition-all"
                style={{
                  background: active ? '#d4a843' : '#fff',
                  color: active ? '#fff' : '#3d2e1c',
                  border: '1px solid ' + (active ? '#d4a843' : '#eae8e4')
                }}>
                {r.label}
              </button>
            )
          })}
        </div>
        {rangeKey === 'custom' && (
          <div className="flex items-center gap-2 mt-2">
            <input type="date" value={customFrom} onChange={function(e) { setCustomFrom(e.target.value) }}
              className="text-xs px-2 py-1 rounded-lg" style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }} />
            <span className="text-xs" style={{ color: '#807664' }}>to</span>
            <input type="date" value={customTo} onChange={function(e) { setCustomTo(e.target.value) }}
              className="text-xs px-2 py-1 rounded-lg" style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }} />
          </div>
        )}
      </div>

      {/* ── Loading State ── */}
      {loading && (
        <div className="text-center py-8">
          <div className="text-2xl mb-2">⏳</div>
          <div className="text-sm" style={{ color: '#807664' }}>Loading analytics...</div>
        </div>
      )}

      {!loading && (
        <>
          {/* ══════════════════════════════════════════════════════════════════
             SECTION 1: Overall KPIs
             ══════════════════════════════════════════════════════════════════ */}
          <SectionHeader icon="📈" title="Overall Performance" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard icon="📞" label="Total Calls" value={kpis.total} color="#3d2e1c" />
            <StatCard icon="✅" label="Interested" value={kpis.interested} color="#16a34a"
              sub={pct(kpis.interested, kpis.total) + ' of calls'} />
            <StatCard icon="📸" label="Content Collected" value={kpis.content} color="#2563eb" />
            <StatCard icon="⭐" label="Reviews Collected" value={kpis.reviews} color="#7c3aed" />
            <StatCard icon="🎯" label="Conversion Rate" value={kpis.convRate + '%'} color="#d4a843" />
            <StatCard icon="💛" label="Avg Rating" value={kpis.avgRating ? kpis.avgRating + ' ★' : '—'} color="#d97706" />
          </div>

          {/* ══════════════════════════════════════════════════════════════════
             SECTION 2: Stylist Performance Table
             ══════════════════════════════════════════════════════════════════ */}
          <SectionHeader icon="👥" title="Stylist Performance" />

          {stylistStats.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: '#faf8f5', border: '1px solid #eae8e4' }}>
              <div className="text-2xl mb-2">📭</div>
              <div className="text-sm" style={{ color: '#807664' }}>No engagements found for this period</div>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #eae8e4' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'linear-gradient(135deg, #d4a843, #795900)' }}>
                      <th className="text-left px-3 py-2 font-bold text-white">Stylist</th>
                      <th className="text-center px-2 py-2 font-bold text-white">Calls</th>
                      <th className="text-center px-2 py-2 font-bold text-white">Interested</th>
                      <th className="text-center px-2 py-2 font-bold text-white hidden sm:table-cell">Content</th>
                      <th className="text-center px-2 py-2 font-bold text-white hidden sm:table-cell">Reviews</th>
                      <th className="text-center px-2 py-2 font-bold text-white hidden md:table-cell">No Answer</th>
                      <th className="text-center px-2 py-2 font-bold text-white hidden md:table-cell">DNC</th>
                      <th className="text-center px-2 py-2 font-bold text-white">Conv %</th>
                      <th className="text-center px-2 py-2 font-bold text-white">Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stylistStats.map(function(s, idx) {
                      var isTop = s.id === topPerformerId && s.total > 0
                      return (
                        <tr key={s.id}
                          className="transition-all hover:bg-[#faf8f5]"
                          style={{
                            background: idx % 2 === 0 ? '#fff' : '#faf8f5',
                            borderLeft: isTop ? '3px solid #d4a843' : '3px solid transparent',
                            boxShadow: isTop ? 'inset 0 0 0 1px #d4a84340' : 'none'
                          }}>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              {isTop && <span title="Top Performer">🏆</span>}
                              <div>
                                <div className="font-bold" style={{ color: '#3d2e1c' }}>{s.name}</div>
                                <DesignationBadge designation={s.designation} />
                              </div>
                            </div>
                          </td>
                          <td className="text-center px-2 py-2.5 font-bold" style={{ color: '#3d2e1c' }}>{s.total}</td>
                          <td className="text-center px-2 py-2.5 font-bold" style={{ color: '#16a34a' }}>{s.interested}</td>
                          <td className="text-center px-2 py-2.5 hidden sm:table-cell" style={{ color: '#2563eb' }}>{s.content}</td>
                          <td className="text-center px-2 py-2.5 hidden sm:table-cell" style={{ color: '#7c3aed' }}>{s.reviews}</td>
                          <td className="text-center px-2 py-2.5 hidden md:table-cell" style={{ color: '#d97706' }}>{s.noAnswer}</td>
                          <td className="text-center px-2 py-2.5 hidden md:table-cell" style={{ color: '#dc2626' }}>{s.dnc}</td>
                          <td className="text-center px-2 py-2.5">
                            <span className="font-bold px-2 py-0.5 rounded-full text-[10px]" style={{
                              background: parseFloat(s.convRate) >= 30 ? '#d1fae5' : parseFloat(s.convRate) >= 15 ? '#fef3c7' : '#fef2f2',
                              color: parseFloat(s.convRate) >= 30 ? '#065f46' : parseFloat(s.convRate) >= 15 ? '#92400e' : '#dc2626'
                            }}>
                              {s.convRate}%
                            </span>
                          </td>
                          <td className="text-center px-2 py-2.5">
                            {s.avgRating
                              ? <span style={{ color: '#d4a843' }}>{s.avgRating} ★</span>
                              : <span style={{ color: '#ccc' }}>—</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
             SECTION 3: Trigger Effectiveness
             ══════════════════════════════════════════════════════════════════ */}
          <SectionHeader icon="🎯" title="Trigger Effectiveness" />

          {triggerStats.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: '#faf8f5', border: '1px solid #eae8e4' }}>
              <div className="text-2xl mb-2">📭</div>
              <div className="text-sm" style={{ color: '#807664' }}>No trigger data for this period</div>
            </div>
          ) : (
            <div className="rounded-xl p-4 space-y-3" style={{ background: '#fff', border: '1px solid #eae8e4' }}>
              {triggerStats.map(function(t) {
                var color = TRIGGER_COLORS[t.trigger] || '#807664'
                return (
                  <div key={t.trigger}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color: color }}>
                          {TRIGGER_LABELS[t.trigger] || t.trigger}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px]" style={{ color: '#807664' }}>
                        <span>{t.total} calls</span>
                        <span style={{ color: '#16a34a' }}>{t.interested} interested</span>
                        <span className="font-bold px-2 py-0.5 rounded-full" style={{
                          background: color + '18', color: color
                        }}>
                          {t.convRate}% conv
                        </span>
                      </div>
                    </div>
                    <BarFill value={t.total} max={maxTriggerCalls} color={color}
                      label={t.total + ' calls  ·  ' + t.interested + ' interested  ·  ' + t.convRate + '% conversion'} />
                  </div>
                )
              })}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
             SECTION 4: Queue Efficiency
             ══════════════════════════════════════════════════════════════════ */}
          <SectionHeader icon="📋" title="Queue Efficiency" />

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard icon="📥" label="Generated" value={queueStats.generated} color="#3d2e1c" />
            <StatCard icon="✅" label="Completed" value={queueStats.completed} color="#16a34a" />
            <StatCard icon="⏭️" label="Skipped" value={queueStats.skipped} color="#d97706" />
            <StatCard icon="⏳" label="Pending" value={queueStats.pending} color="#2563eb" />
            <StatCard icon="📊" label="Completion Rate" value={queueStats.completionRate + '%'} color="#d4a843" />
          </div>

          {/* Queue breakdown bar */}
          {queueStats.generated > 0 && (
            <div className="rounded-xl p-3" style={{ background: '#fff', border: '1px solid #eae8e4' }}>
              <div className="flex h-6 rounded-full overflow-hidden" style={{ background: '#f0ebe3' }}>
                {queueStats.completed > 0 && (
                  <div title={'Completed: ' + queueStats.completed} className="flex items-center justify-center text-[9px] font-bold text-white"
                    style={{
                      width: (queueStats.completed / queueStats.generated * 100) + '%',
                      background: '#16a34a',
                      minWidth: '16px'
                    }}>
                    {queueStats.completed > 0 ? queueStats.completed : ''}
                  </div>
                )}
                {queueStats.skipped > 0 && (
                  <div title={'Skipped: ' + queueStats.skipped} className="flex items-center justify-center text-[9px] font-bold text-white"
                    style={{
                      width: (queueStats.skipped / queueStats.generated * 100) + '%',
                      background: '#d97706',
                      minWidth: '16px'
                    }}>
                    {queueStats.skipped > 0 ? queueStats.skipped : ''}
                  </div>
                )}
                {queueStats.pending > 0 && (
                  <div title={'Pending: ' + queueStats.pending} className="flex items-center justify-center text-[9px] font-bold"
                    style={{
                      width: (queueStats.pending / queueStats.generated * 100) + '%',
                      background: '#dbeafe',
                      color: '#1e40af',
                      minWidth: '16px'
                    }}>
                    {queueStats.pending > 0 ? queueStats.pending : ''}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-4 mt-2 text-[10px]" style={{ color: '#807664' }}>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#16a34a' }} /> Completed</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#d97706' }} /> Skipped</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: '#dbeafe' }} /> Pending</span>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
             SECTION 5: Recent Activity Log
             ══════════════════════════════════════════════════════════════════ */}
          <SectionHeader icon="🕐" title="Recent Activity" />

          {recentActivity.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: '#faf8f5', border: '1px solid #eae8e4' }}>
              <div className="text-2xl mb-2">📭</div>
              <div className="text-sm" style={{ color: '#807664' }}>No recent activity for this period</div>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #eae8e4' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: '#f0ebe3' }}>
                      <th className="text-left px-3 py-2 font-bold" style={{ color: '#3d2e1c' }}>Date</th>
                      <th className="text-left px-2 py-2 font-bold" style={{ color: '#3d2e1c' }}>Stylist</th>
                      <th className="text-left px-2 py-2 font-bold" style={{ color: '#3d2e1c' }}>Customer</th>
                      <th className="text-left px-2 py-2 font-bold" style={{ color: '#3d2e1c' }}>Outcome</th>
                      <th className="text-left px-2 py-2 font-bold hidden sm:table-cell" style={{ color: '#3d2e1c' }}>Trigger</th>
                      <th className="text-center px-2 py-2 font-bold hidden sm:table-cell" style={{ color: '#3d2e1c' }}>Badges</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivity.map(function(a, idx) {
                      return (
                        <tr key={a.id || idx}
                          className="transition-all hover:bg-[#faf8f5]"
                          style={{ background: idx % 2 === 0 ? '#fff' : '#faf8f5', borderBottom: '1px solid #eae8e4' }}>
                          <td className="px-3 py-2" style={{ color: '#807664' }}>{formatDateTime(a.completed_at)}</td>
                          <td className="px-2 py-2 font-medium" style={{ color: '#3d2e1c' }}>{a.stylistName}</td>
                          <td className="px-2 py-2" style={{ color: '#3d2e1c' }}>{a.customerName}</td>
                          <td className="px-2 py-2"><OutcomeBadge outcome={a.outcome} /></td>
                          <td className="px-2 py-2 hidden sm:table-cell"><TriggerBadge trigger={a.trigger_type} /></td>
                          <td className="px-2 py-2 text-center hidden sm:table-cell">
                            <div className="flex items-center justify-center gap-1">
                              {a.content_requested && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                  style={{ background: '#dbeafe', color: '#1e40af' }}>📸</span>
                              )}
                              {a.review_link_shared && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                                  style={{ background: '#fef3c7', color: '#92400e' }}>⭐</span>
                              )}
                              {!a.content_requested && !a.review_link_shared && (
                                <span style={{ color: '#ccc' }}>—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

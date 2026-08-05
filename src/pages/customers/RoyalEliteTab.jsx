/* ═══════════════════════════════════════════════════════════════════════════
   ROYAL & ELITE TAB — Customer engagement tier management
   Royal = auto (configurable spend threshold) + manual
   Elite = manual only
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { fmt } from '../../lib/helpers'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

const TIERS = {
  royal: { label: 'Royal', badge: '👑', color: '#d4a843', bg: 'rgba(212,168,67,0.12)', border: '#d4a843' },
  elite: { label: 'Elite', badge: '⭐', color: '#7c3aed', bg: 'rgba(124,58,237,0.08)', border: '#7c3aed' }
}

const OCCASIONS = [
  'Wedding – Groom', 'Wedding – Guest', 'Engagement / Roka', 'Haldi', 'Mehendi', 'Sangeet',
  'Cocktail / Reception', 'Wedding Ceremony', 'Dhoti Function', 'Housewarming',
  'Party / Evening Out', 'Puja', 'Birthday', 'Anniversary', 'Others'
]

const StatCard = ({ label, value, color = '#d4a843', sub }) => (
  <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #eae8e4' }}>
    <div className="text-[10px] font-bold uppercase mb-1" style={{ color: '#807664', letterSpacing: '0.05em' }}>{label}</div>
    <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    {sub && <div className="text-xs mt-0.5" style={{ color: '#807664' }}>{sub}</div>}
  </div>
)

export default function RoyalEliteTab({ buyers = [], customers = [], teamMembers = [], onRefresh, updateCustomerLocal }) {
  var [tierFilter, setTierFilter] = useState('all') // all, royal, elite
  var [contentFilter, setContentFilter] = useState('all') // all, has_content, no_content
  var [reviewFilter, setReviewFilter] = useState('all') // all, has_review, no_review
  var [contactFilter, setContactFilter] = useState('all') // all, 30, 60, 90
  var [search, setSearch] = useState('')
  var [showAssign, setShowAssign] = useState(null) // customer to assign tier
  var [showProfile, setShowProfile] = useState(null) // customer to edit profile
  var [profileForm, setProfileForm] = useState({})
  var [saving, setSaving] = useState(false)

  // Build enriched customer list with buyer data
  var enriched = useMemo(function() {
    return customers.filter(function(c) {
      return c.relationship === 'self' && (c.customer_type === 'royal' || c.customer_type === 'elite')
    }).map(function(c) {
      var buyer = buyers.find(function(b) { return b.id === c.buyer_id })
      return { ...c, buyer: buyer || {}, buyerName: (buyer || {}).name || c.name, buyerEmail: (buyer || {}).email || '', buyerPhone: (buyer || {}).phone || c.phone || '', buyerCity: (buyer || {}).city || '' }
    })
  }, [customers, buyers])

  // All customers for assignment (not just royal/elite)
  var allCustomersEnriched = useMemo(function() {
    return customers.filter(function(c) { return c.relationship === 'self' }).map(function(c) {
      var buyer = buyers.find(function(b) { return b.id === c.buyer_id })
      return { ...c, buyer: buyer || {}, buyerName: (buyer || {}).name || c.name }
    })
  }, [customers, buyers])

  // Apply filters
  var filtered = useMemo(function() {
    return enriched.filter(function(c) {
      if (tierFilter !== 'all' && c.customer_type !== tierFilter) return false
      if (contentFilter === 'has_content' && !c.content_received) return false
      if (contentFilter === 'no_content' && c.content_received) return false
      if (reviewFilter === 'has_review' && !c.review_received) return false
      if (reviewFilter === 'no_review' && c.review_received) return false
      if (contactFilter !== 'all') {
        var days = parseInt(contactFilter)
        if (c.last_contacted_at) {
          var diff = (Date.now() - new Date(c.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24)
          if (diff < days) return false
        }
      }
      if (search) {
        var s = search.toLowerCase()
        if (!(c.buyerName || '').toLowerCase().includes(s) && !(c.buyerEmail || '').toLowerCase().includes(s) && !(c.buyerPhone || '').includes(s)) return false
      }
      return true
    }).sort(function(a, b) { return (b.total_spend || 0) - (a.total_spend || 0) })
  }, [enriched, tierFilter, contentFilter, reviewFilter, contactFilter, search])

  // Stats
  var stats = useMemo(function() {
    var royal = enriched.filter(function(c) { return c.customer_type === 'royal' })
    var elite = enriched.filter(function(c) { return c.customer_type === 'elite' })
    var royalSpend = royal.reduce(function(s, c) { return s + (c.total_spend || 0) }, 0)
    var eliteSpend = elite.reduce(function(s, c) { return s + (c.total_spend || 0) }, 0)
    var withContent = enriched.filter(function(c) { return c.content_received }).length
    var withReview = enriched.filter(function(c) { return c.review_received }).length
    var now = Date.now()
    var dueEngagement = enriched.filter(function(c) {
      if (!c.last_contacted_at) return true
      return (now - new Date(c.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24) > 60
    }).length
    return {
      royalCount: royal.length, eliteCount: elite.length,
      royalAvgLTV: royal.length > 0 ? Math.round(royalSpend / royal.length) : 0,
      eliteAvgLTV: elite.length > 0 ? Math.round(eliteSpend / elite.length) : 0,
      withContent, withReview, dueEngagement
    }
  }, [enriched])

  // Assign tier
  var assignTier = useCallback(async function(customerId, newTier) {
    setSaving(true)
    try {
      var changes = { customer_type: newTier, tier_override: true, updated_at: new Date().toISOString() }
      var { error } = await supa.from('customers').update(changes).eq('id', customerId)
      if (error) throw error
      if (updateCustomerLocal) updateCustomerLocal(customerId, changes)
      setShowAssign(null)
    } catch (e) { console.error('Tier assign error:', e) }
    finally { setSaving(false) }
  }, [updateCustomerLocal])

  // Remove tier (back to auto-classification)
  var removeTier = useCallback(async function(customerId) {
    setSaving(true)
    try {
      var cust = customers.find(function(c) { return c.id === customerId })
      var orders = (cust || {}).total_orders || 0
      var autoType = orders >= 2 ? 'repeat' : 'normal'
      var changes = { customer_type: autoType, tier_override: false, updated_at: new Date().toISOString() }
      var { error } = await supa.from('customers').update(changes).eq('id', customerId)
      if (error) throw error
      if (updateCustomerLocal) updateCustomerLocal(customerId, changes)
    } catch (e) { console.error('Remove tier error:', e) }
    finally { setSaving(false) }
  }, [customers, updateCustomerLocal])

  // Save profile enrichment
  var saveProfile = useCallback(async function() {
    if (!showProfile) return
    setSaving(true)
    try {
      var updates = {}
      if (profileForm.birthday) updates.birthday = profileForm.birthday
      if (profileForm.anniversary_date) updates.anniversary_date = profileForm.anniversary_date
      if (profileForm.occasion_preferences) updates.occasion_preferences = profileForm.occasion_preferences
      if (profileForm.preferred_contact) updates.preferred_contact = profileForm.preferred_contact
      if (profileForm.instagram_handle !== undefined) updates.instagram_handle = profileForm.instagram_handle
      if (profileForm.do_not_contact !== undefined) updates.do_not_contact = profileForm.do_not_contact
      updates.updated_at = new Date().toISOString()
      var { error } = await supa.from('customers').update(updates).eq('id', showProfile.id)
      if (error) throw error
      if (updateCustomerLocal) updateCustomerLocal(showProfile.id, updates)
      setShowProfile(null)
    } catch (e) { console.error('Save profile error:', e) }
    finally { setSaving(false) }
  }, [showProfile, profileForm, updateCustomerLocal])

  // Days since last contact
  var daysSince = function(dateStr) {
    if (!dateStr) return '—'
    var d = Math.round((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
    return d + 'd ago'
  }

  // Log contact
  var logContact = useCallback(async function(customerId) {
    var contactChanges = { last_contacted_at: new Date().toISOString() }
    await supa.from('customers').update(contactChanges).eq('id', customerId)
    await supa.from('customer_engagements').insert({
      customer_id: customerId, type: 'call', trigger_type: 'manual', status: 'completed',
      completed_at: new Date().toISOString(), assigned_to: window._currentTeamMemberId || null
    })
    if (updateCustomerLocal) updateCustomerLocal(customerId, contactChanges)
  }, [updateCustomerLocal])

  // Search for add-to-tier
  var [assignSearch, setAssignSearch] = useState('')
  var assignResults = useMemo(function() {
    if (!assignSearch || assignSearch.length < 2) return []
    var s = assignSearch.toLowerCase()
    return allCustomersEnriched.filter(function(c) {
      return c.customer_type !== 'royal' && c.customer_type !== 'elite' &&
        ((c.buyerName || '').toLowerCase().includes(s))
    }).slice(0, 10)
  }, [allCustomersEnriched, assignSearch])

  return (
    <div>
      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        <StatCard label="Royal" value={stats.royalCount} color="#d4a843" />
        <StatCard label="Elite" value={stats.eliteCount} color="#7c3aed" />
        <StatCard label="Avg LTV (Royal)" value={fmt(stats.royalAvgLTV)} color="#d4a843" />
        <StatCard label="Avg LTV (Elite)" value={fmt(stats.eliteAvgLTV)} color="#7c3aed" />
        <StatCard label="Content" value={stats.withContent} color="#16a34a" sub={'of ' + enriched.length} />
        <StatCard label="Reviews" value={stats.withReview} color="#2563eb" sub={'of ' + enriched.length} />
        <StatCard label="Due Engagement" value={stats.dueEngagement} color="#dc2626" sub="60+ days" />
      </div>

      {/* Filters + Add */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={tierFilter} onChange={function(e) { setTierFilter(e.target.value) }}
          className="px-3 py-2 rounded-lg text-xs border" style={{ borderColor: '#d2c5b1', color: '#3d2e1c' }}>
          <option value="all">All Tiers</option>
          <option value="royal">👑 Royal Only</option>
          <option value="elite">⭐ Elite Only</option>
        </select>
        <select value={contentFilter} onChange={function(e) { setContentFilter(e.target.value) }}
          className="px-3 py-2 rounded-lg text-xs border" style={{ borderColor: '#d2c5b1', color: '#3d2e1c' }}>
          <option value="all">Content: All</option>
          <option value="has_content">Has Content</option>
          <option value="no_content">No Content</option>
        </select>
        <select value={reviewFilter} onChange={function(e) { setReviewFilter(e.target.value) }}
          className="px-3 py-2 rounded-lg text-xs border" style={{ borderColor: '#d2c5b1', color: '#3d2e1c' }}>
          <option value="all">Review: All</option>
          <option value="has_review">Has Review</option>
          <option value="no_review">No Review</option>
        </select>
        <select value={contactFilter} onChange={function(e) { setContactFilter(e.target.value) }}
          className="px-3 py-2 rounded-lg text-xs border" style={{ borderColor: '#d2c5b1', color: '#3d2e1c' }}>
          <option value="all">Last Contact: Any</option>
          <option value="30">30+ days ago</option>
          <option value="60">60+ days ago</option>
          <option value="90">90+ days ago</option>
        </select>
        <input value={search} onChange={function(e) { setSearch(e.target.value) }} placeholder="Search name, email, phone…"
          className="px-3 py-2 rounded-lg text-xs border flex-1 min-w-[150px]" style={{ borderColor: '#d2c5b1', color: '#3d2e1c' }} />
        <button onClick={function() { setShowAssign('new') }} className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5"
          style={{ background: 'linear-gradient(135deg, #795900, #d4a843)', boxShadow: '0 2px 8px rgba(121,89,0,0.25)' }}>
          <Icon name="plus" cls="w-3.5 h-3.5" /> Assign Tier
        </button>
      </div>

      {/* Customer Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.length === 0 && (
          <div className="col-span-2 py-12 text-center text-sm" style={{ color: '#807664' }}>
            {enriched.length === 0 ? 'No Royal or Elite customers yet. Use "Assign Tier" to add customers.' : 'No matches for current filters.'}
          </div>
        )}
        {filtered.map(function(c) {
          var tier = TIERS[c.customer_type] || TIERS.royal
          return (
            <div key={c.id} className="rounded-xl p-4 transition-all hover:shadow-md" style={{ background: '#fff', border: '1px solid ' + tier.border + '33' }}>
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: tier.bg, color: tier.color }}>
                    {tier.badge} {tier.label}
                  </span>
                  {c.tier_override && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Manual</span>}
                </div>
                <span className="text-xs" style={{ color: '#807664' }}>{daysSince(c.last_contacted_at)}</span>
              </div>

              {/* Name + Stats */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-bold text-sm" style={{ color: '#3d2e1c' }}>{c.buyerName}</div>
                  <div className="text-xs" style={{ color: '#807664' }}>{c.buyerPhone}{c.buyerCity ? ' · ' + c.buyerCity : ''}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm" style={{ color: '#3d2e1c' }}>{fmt(c.total_spend || 0)}</div>
                  <div className="text-xs" style={{ color: '#807664' }}>{c.total_orders || 0} orders</div>
                </div>
              </div>

              {/* Occasion / Profile info */}
              {c.occasion_preferences && c.occasion_preferences.length > 0 && (
                <div className="text-xs mb-2" style={{ color: '#807664' }}>
                  Occasions: {c.occasion_preferences.join(', ')}
                </div>
              )}
              {(c.birthday || c.anniversary_date) && (
                <div className="text-xs mb-2" style={{ color: '#807664' }}>
                  {c.birthday ? '🎂 ' + c.birthday : ''}{c.birthday && c.anniversary_date ? ' · ' : ''}{c.anniversary_date ? '💍 ' + c.anniversary_date : ''}
                </div>
              )}

              {/* Content / Review status */}
              <div className="flex items-center gap-3 mb-3 text-xs">
                <span style={{ color: c.content_received ? '#16a34a' : '#dc2626' }}>
                  {c.content_received ? '📸 Content ✓' : '📸 No content'}
                </span>
                <span style={{ color: c.review_received ? '#16a34a' : '#dc2626' }}>
                  {c.review_received ? '⭐ Review ✓' : '⭐ No review'}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={function() { logContact(c.id) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#f0ebe3', color: '#795900' }}>
                  📞 Log Call
                </button>
                {c.buyerPhone && (
                  <a href={'https://wa.me/' + (c.buyerPhone || '').replace(/[^0-9]/g, '')} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#dcfce7', color: '#16a34a' }}>
                    💬 WhatsApp
                  </a>
                )}
                <button onClick={function() {
                  setShowProfile(c)
                  setProfileForm({
                    birthday: c.birthday || '', anniversary_date: c.anniversary_date || '',
                    occasion_preferences: c.occasion_preferences || [], preferred_contact: c.preferred_contact || 'call',
                    instagram_handle: c.instagram_handle || '', do_not_contact: c.do_not_contact || false
                  })
                }} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                  ✏️ Profile
                </button>
                <button onClick={function() { if (window.confirm('Remove ' + tier.label + ' tier from ' + c.buyerName + '?')) removeTier(c.id) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto" style={{ background: '#fef2f2', color: '#dc2626' }}>
                  Remove
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Assign Tier Modal */}
      {showAssign && (
        <Modal onClose={function() { setShowAssign(null); setAssignSearch('') }} title="Assign Customer Tier" width={480}>
          <div className="mb-4">
            <label className="text-xs font-bold block mb-1" style={{ color: '#807664' }}>Search Customer</label>
            <input value={assignSearch} onChange={function(e) { setAssignSearch(e.target.value) }}
              placeholder="Type customer name…" autoFocus
              className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#d2c5b1' }} />
          </div>
          {assignResults.length > 0 && (
            <div className="max-h-[300px] overflow-auto rounded-lg border" style={{ borderColor: '#eae8e4' }}>
              {assignResults.map(function(c) {
                return (
                  <div key={c.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50" style={{ borderBottom: '1px solid #eae8e4' }}>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: '#3d2e1c' }}>{c.buyerName}</div>
                      <div className="text-xs" style={{ color: '#807664' }}>{fmt(c.total_spend || 0)} · {c.total_orders || 0} orders · {c.customer_type}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={function() { assignTier(c.id, 'royal') }} disabled={saving}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(212,168,67,0.15)', color: '#d4a843' }}>
                        👑 Royal
                      </button>
                      <button onClick={function() { assignTier(c.id, 'elite') }} disabled={saving}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ background: 'rgba(124,58,237,0.08)', color: '#7c3aed' }}>
                        ⭐ Elite
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {assignSearch.length >= 2 && assignResults.length === 0 && (
            <div className="text-center py-6 text-xs" style={{ color: '#807664' }}>No matching customers found (already Royal/Elite excluded)</div>
          )}
        </Modal>
      )}

      {/* Profile Edit Modal */}
      {showProfile && (
        <Modal onClose={function() { setShowProfile(null) }} title={'Edit Profile — ' + (showProfile.buyerName || showProfile.name)} width={480}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold block mb-1" style={{ color: '#807664' }}>Birthday</label>
                <input type="date" value={profileForm.birthday || ''} onChange={function(e) { setProfileForm(function(p) { return { ...p, birthday: e.target.value } }) }}
                  className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#d2c5b1' }} />
              </div>
              <div>
                <label className="text-xs font-bold block mb-1" style={{ color: '#807664' }}>Anniversary</label>
                <input type="date" value={profileForm.anniversary_date || ''} onChange={function(e) { setProfileForm(function(p) { return { ...p, anniversary_date: e.target.value } }) }}
                  className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#d2c5b1' }} />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: '#807664' }}>Instagram Handle</label>
              <input value={profileForm.instagram_handle || ''} onChange={function(e) { setProfileForm(function(p) { return { ...p, instagram_handle: e.target.value } }) }}
                placeholder="@handle" className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#d2c5b1' }} />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: '#807664' }}>Preferred Contact</label>
              <select value={profileForm.preferred_contact || 'call'} onChange={function(e) { setProfileForm(function(p) { return { ...p, preferred_contact: e.target.value } }) }}
                className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#d2c5b1' }}>
                <option value="call">Phone Call</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold block mb-2" style={{ color: '#807664' }}>Occasion Preferences</label>
              <div className="flex flex-wrap gap-1.5">
                {OCCASIONS.map(function(occ) {
                  var isActive = (profileForm.occasion_preferences || []).includes(occ)
                  return (
                    <button key={occ} type="button" onClick={function() {
                      setProfileForm(function(p) {
                        var cur = p.occasion_preferences || []
                        return { ...p, occasion_preferences: isActive ? cur.filter(function(o) { return o !== occ }) : cur.concat([occ]) }
                      })
                    }} className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                      style={{ background: isActive ? '#795900' : 'transparent', color: isActive ? '#fff' : '#807664', border: '1px solid ' + (isActive ? '#795900' : '#d2c5b1') }}>
                      {occ}
                    </button>
                  )
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={profileForm.do_not_contact || false}
                onChange={function(e) { setProfileForm(function(p) { return { ...p, do_not_contact: e.target.checked } }) }} />
              <span style={{ color: '#dc2626' }}>Do Not Contact</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={function() { setShowProfile(null) }} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ color: '#807664' }}>Cancel</button>
            <button onClick={saveProfile} disabled={saving}
              className="px-6 py-2 rounded-xl text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}>
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

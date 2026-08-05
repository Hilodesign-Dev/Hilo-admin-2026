/* ═══════════════════════════════════════════════════════════════════════════
   CONTENT HUB TAB — Gallery + Gifts & Offers
   Sub-tab 1: Visual gallery of collected content and reviews
   Sub-tab 2: Rewards tracking (referral, content, review, loyalty gifts)
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { fmt } from '../../lib/helpers'
import Modal from '../../components/Modal'

var TIERS = {
  royal: { badge: '👑', label: 'Royal', color: '#d4a843' },
  elite: { badge: '⭐', label: 'Elite', color: '#7c3aed' },
  repeat: { badge: '🔵', label: 'Repeat', color: '#2563eb' },
  normal: { badge: '', label: 'Normal', color: '#807664' }
}

var REWARD_TYPE_EMOJI = {
  referral: '🎁',
  content: '📸',
  review: '⭐',
  loyalty: '👑',
  other: '🎉'
}

var STATUS_COLORS = {
  earned: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  assigned: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  redeemed: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  expired: { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' }
}

var StatCard = function(props) {
  return (
    <div className="rounded-xl p-3 sm:p-4" style={{ background: '#fff', border: '1px solid #eae8e4' }}>
      <div className="text-[10px] font-bold uppercase mb-1" style={{ color: '#807664', letterSpacing: '0.05em' }}>{props.label}</div>
      <div className="text-xl sm:text-2xl font-bold" style={{ color: props.color || '#d4a843' }}>{props.value}</div>
      {props.sub && <div className="text-xs mt-0.5" style={{ color: '#807664' }}>{props.sub}</div>}
    </div>
  )
}

function tierBadge(customerType) {
  var t = TIERS[customerType] || TIERS.normal
  if (!t.badge) return null
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: t.color + '20', color: t.color }}>
      {t.badge} {t.label}
    </span>
  )
}

function starDisplay(rating) {
  var stars = []
  for (var i = 1; i <= 5; i++) {
    stars.push(
      <span key={i} style={{ color: i <= rating ? '#d4a843' : '#eae8e4' }}>★</span>
    )
  }
  return <span className="text-sm">{stars}</span>
}

export default function ContentHubTab(props) {
  var buyers = props.buyers || []
  var customers = props.customers || []
  var updateCustomerLocal = props.updateCustomerLocal

  var [activeTab, setActiveTab] = useState('gallery')
  var [content, setContent] = useState([])
  var [rewards, setRewards] = useState([])
  var [loading, setLoading] = useState(true)

  // Gallery state
  var [typeFilter, setTypeFilter] = useState('all')
  var [tierFilter, setTierFilter] = useState('all')
  var [search, setSearch] = useState('')
  var [showUploadModal, setShowUploadModal] = useState(false)
  var [uploadForm, setUploadForm] = useState({ customer_id: '', content_type: 'photo', title: '', media_url: '', occasion: '', star_rating: 5, review_text: '' })
  var [saving, setSaving] = useState(false)

  // Rewards state
  var [rewardStatusFilter, setRewardStatusFilter] = useState('all')
  var [rewardTypeFilter, setRewardTypeFilter] = useState('all')
  var [rewardSearch, setRewardSearch] = useState('')
  var [showAddReward, setShowAddReward] = useState(false)
  var [rewardForm, setRewardForm] = useState({ customer_id: '', reward_type: 'referral', title: '', item: '', notes: '' })
  var [assignModal, setAssignModal] = useState(null)
  var [assignForm, setAssignForm] = useState({ item: '', notes: '' })
  var [redeemModal, setRedeemModal] = useState(null)
  var [redeemNotes, setRedeemNotes] = useState('')

  // Build customer lookup
  var customerMap = useMemo(function() {
    var map = {}
    customers.forEach(function(c) {
      map[c.id] = c
    })
    return map
  }, [customers])

  // Build buyer lookup
  var buyerMap = useMemo(function() {
    var map = {}
    buyers.forEach(function(b) {
      map[b.id] = b
    })
    return map
  }, [buyers])

  function getCustomerName(customerId) {
    var c = customerMap[customerId]
    return c ? (c.name || c.phone || 'Unknown') : 'Unknown'
  }

  function getCustomerTier(customerId) {
    var c = customerMap[customerId]
    return c ? (c.customer_type || 'normal') : 'normal'
  }

  function getBuyerName(buyerId) {
    var b = buyerMap[buyerId]
    return b ? (b.name || b.phone || 'Unknown') : 'Unknown'
  }

  // Fetch data
  var fetchAll = useCallback(function() {
    setLoading(true)
    Promise.all([
      supa.from('customer_content').select('*').order('created_at', { ascending: false }),
      supa.from('customer_rewards').select('*').order('created_at', { ascending: false })
    ]).then(function(results) {
      setContent((results[0].data) || [])
      setRewards((results[1].data) || [])
      setLoading(false)
    }).catch(function() {
      setLoading(false)
    })
  }, [])

  useEffect(function() { fetchAll() }, [fetchAll])

  // ─── Gallery KPIs ─────────────────────────────────────────────────
  var galleryKpis = useMemo(function() {
    var total = content.length
    var reviews = content.filter(function(c) { return c.content_type === 'google_review' }).length
    var photos = content.filter(function(c) { return c.content_type === 'photo' }).length
    var videos = content.filter(function(c) { return c.content_type === 'video' }).length
    var rated = content.filter(function(c) { return c.star_rating != null })
    var avg = rated.length > 0 ? (rated.reduce(function(s, c) { return s + c.star_rating }, 0) / rated.length).toFixed(1) : '—'
    return { total: total, reviews: reviews, photos: photos, videos: videos, avgRating: avg }
  }, [content])

  // ─── Gallery filtered list ────────────────────────────────────────
  var filteredContent = useMemo(function() {
    return content.filter(function(item) {
      if (typeFilter === 'photos' && item.content_type !== 'photo') return false
      if (typeFilter === 'videos' && item.content_type !== 'video') return false
      if (typeFilter === 'reviews' && item.content_type !== 'google_review') return false
      if (tierFilter !== 'all') {
        var tier = getCustomerTier(item.customer_id)
        if (tier !== tierFilter) return false
      }
      if (search) {
        var name = getCustomerName(item.customer_id).toLowerCase()
        if (name.indexOf(search.toLowerCase()) === -1) return false
      }
      return true
    })
  }, [content, typeFilter, tierFilter, search, customerMap])

  // ─── Rewards KPIs ─────────────────────────────────────────────────
  var rewardKpis = useMemo(function() {
    var total = rewards.length
    var earned = rewards.filter(function(r) { return r.status === 'earned' }).length
    var assigned = rewards.filter(function(r) { return r.status === 'assigned' }).length
    var redeemed = rewards.filter(function(r) { return r.status === 'redeemed' }).length
    var pending = earned // earned but not yet assigned
    return { total: total, earned: earned, assigned: assigned, redeemed: redeemed, pending: pending }
  }, [rewards])

  // ─── Rewards filtered list ────────────────────────────────────────
  var filteredRewards = useMemo(function() {
    return rewards.filter(function(r) {
      if (rewardStatusFilter !== 'all' && r.status !== rewardStatusFilter) return false
      if (rewardTypeFilter !== 'all' && r.reward_type !== rewardTypeFilter) return false
      if (rewardSearch) {
        var name = getCustomerName(r.customer_id).toLowerCase()
        if (name.indexOf(rewardSearch.toLowerCase()) === -1) return false
      }
      return true
    })
  }, [rewards, rewardStatusFilter, rewardTypeFilter, rewardSearch, customerMap])

  // ─── Upload content ───────────────────────────────────────────────
  function handleUploadContent() {
    if (!uploadForm.customer_id) return
    setSaving(true)
    var row = {
      customer_id: uploadForm.customer_id,
      buyer_id: customers.find(function(c) { return c.id === uploadForm.customer_id })?.buyer_id || null,
      content_type: uploadForm.content_type,
      title: uploadForm.title || null,
      media_url: uploadForm.media_url || null,
      occasion: uploadForm.occasion || null,
      star_rating: uploadForm.content_type === 'google_review' ? uploadForm.star_rating : null,
      review_text: uploadForm.content_type === 'google_review' ? uploadForm.review_text : null,
      collected_by: window._currentTeamMemberId || null
    }
    supa.from('customer_content').insert(row).select().single().then(function(res) {
      setSaving(false)
      if (res.data) {
        setContent(function(prev) { return [res.data, ...prev] })
        setShowUploadModal(false)
        setUploadForm({ customer_id: '', content_type: 'photo', title: '', media_url: '', occasion: '', star_rating: 5, review_text: '' })
      }
    })
  }

  // ─── Add reward ───────────────────────────────────────────────────
  function handleAddReward() {
    if (!rewardForm.customer_id) return
    setSaving(true)
    var row = {
      customer_id: rewardForm.customer_id,
      buyer_id: customers.find(function(c) { return c.id === rewardForm.customer_id })?.buyer_id || null,
      reward_type: rewardForm.reward_type,
      title: rewardForm.title || null,
      item: rewardForm.item || null,
      status: 'earned',
      earned_at: new Date().toISOString(),
      notes: rewardForm.notes || null
    }
    supa.from('customer_rewards').insert(row).select().single().then(function(res) {
      setSaving(false)
      if (res.data) {
        setRewards(function(prev) { return [res.data, ...prev] })
        setShowAddReward(false)
        setRewardForm({ customer_id: '', reward_type: 'referral', title: '', item: '', notes: '' })
      }
    })
  }

  // ─── Assign reward ────────────────────────────────────────────────
  function handleAssign() {
    if (!assignModal) return
    setSaving(true)
    var updates = {
      status: 'assigned',
      item: assignForm.item || assignModal.item || null,
      assigned_at: new Date().toISOString(),
      assigned_by: window._currentTeamMemberId || null,
      notes: assignForm.notes || assignModal.notes || null
    }
    supa.from('customer_rewards').update(updates).eq('id', assignModal.id).select().single().then(function(res) {
      setSaving(false)
      if (res.data) {
        setRewards(function(prev) {
          return prev.map(function(r) { return r.id === res.data.id ? res.data : r })
        })
        setAssignModal(null)
        setAssignForm({ item: '', notes: '' })
      }
    })
  }

  // ─── Redeem reward ────────────────────────────────────────────────
  function handleRedeem() {
    if (!redeemModal) return
    setSaving(true)
    var updates = {
      status: 'redeemed',
      redeemed_at: new Date().toISOString(),
      notes: redeemNotes || redeemModal.notes || null
    }
    supa.from('customer_rewards').update(updates).eq('id', redeemModal.id).select().single().then(function(res) {
      setSaving(false)
      if (res.data) {
        setRewards(function(prev) {
          return prev.map(function(r) { return r.id === res.data.id ? res.data : r })
        })
        setRedeemModal(null)
        setRedeemNotes('')
      }
    })
  }

  // ─── Customer search dropdown helper ──────────────────────────────
  var [custDropdown, setCustDropdown] = useState('')

  function CustomerPicker(pickerProps) {
    var value = pickerProps.value
    var onChange = pickerProps.onChange
    var filteredCusts = customers.filter(function(c) {
      if (!custDropdown) return true
      var n = (c.name || c.phone || '').toLowerCase()
      return n.indexOf(custDropdown.toLowerCase()) !== -1
    }).slice(0, 50)

    var selected = customerMap[value]

    return (
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Customer *</label>
        {selected ? (
          <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: '#f0ebe3', border: '1px solid #eae8e4' }}>
            <span className="text-sm font-medium" style={{ color: '#3d2e1c' }}>{selected.name || selected.phone}</span>
            {tierBadge(selected.customer_type)}
            <button
              type="button"
              onClick={function() { onChange(''); setCustDropdown('') }}
              className="ml-auto text-xs px-2 py-0.5 rounded hover:bg-white"
              style={{ color: '#807664' }}
            >Change</button>
          </div>
        ) : (
          <div>
            <input
              type="text"
              placeholder="Search customer name..."
              value={custDropdown}
              onChange={function(e) { setCustDropdown(e.target.value) }}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
            />
            {custDropdown && (
              <div className="mt-1 rounded-lg shadow-lg max-h-40 overflow-y-auto" style={{ border: '1px solid #eae8e4', background: '#fff' }}>
                {filteredCusts.map(function(c) {
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={function() { onChange(c.id); setCustDropdown('') }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                      style={{ color: '#3d2e1c' }}
                    >
                      <span>{c.name || c.phone}</span>
                      {tierBadge(c.customer_type)}
                    </button>
                  )
                })}
                {filteredCusts.length === 0 && (
                  <div className="px-3 py-2 text-xs" style={{ color: '#807664' }}>No customers found</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── Format date ──────────────────────────────────────────────────
  function fmtDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm" style={{ color: '#807664' }}>Loading content hub...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#f0ebe3' }}>
        {[
          { key: 'gallery', label: '📸 Gallery' },
          { key: 'gifts', label: '🎁 Gifts & Offers' }
        ].map(function(tab) {
          var isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={function() { setActiveTab(tab.key) }}
              className={'flex-1 py-2 px-3 rounded-lg text-xs sm:text-sm font-medium transition-all ' + (isActive ? 'shadow-sm' : '')}
              style={isActive
                ? { background: '#fff', color: '#3d2e1c' }
                : { color: '#807664' }
              }
            >{tab.label}</button>
          )
        })}
      </div>

      {activeTab === 'gallery' && renderGallery()}
      {activeTab === 'gifts' && renderGifts()}

      {/* Upload Content Modal */}
      {showUploadModal && (
        <Modal title="Upload Content" onClose={function() { setShowUploadModal(false) }}>
          <div className="space-y-4">
            <CustomerPicker
              value={uploadForm.customer_id}
              onChange={function(id) { setUploadForm({ ...uploadForm, customer_id: id }) }}
            />
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Content Type</label>
              <select
                value={uploadForm.content_type}
                onChange={function(e) { setUploadForm({ ...uploadForm, content_type: e.target.value }) }}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
              >
                <option value="photo">📸 Photo</option>
                <option value="video">🎬 Video</option>
                <option value="google_review">⭐ Google Review</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Title / Caption</label>
              <input
                type="text"
                value={uploadForm.title}
                onChange={function(e) { setUploadForm({ ...uploadForm, title: e.target.value }) }}
                placeholder="Optional title or caption"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
              />
            </div>
            {uploadForm.content_type !== 'google_review' && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Media URL</label>
                <input
                  type="text"
                  value={uploadForm.media_url}
                  onChange={function(e) { setUploadForm({ ...uploadForm, media_url: e.target.value }) }}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
                />
              </div>
            )}
            {uploadForm.content_type === 'google_review' && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Star Rating</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(function(s) {
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={function() { setUploadForm({ ...uploadForm, star_rating: s }) }}
                          className="text-xl"
                          style={{ color: s <= uploadForm.star_rating ? '#d4a843' : '#eae8e4' }}
                        >★</button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Review Text</label>
                  <textarea
                    value={uploadForm.review_text}
                    onChange={function(e) { setUploadForm({ ...uploadForm, review_text: e.target.value }) }}
                    placeholder="Customer's review..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Occasion</label>
              <input
                type="text"
                value={uploadForm.occasion}
                onChange={function(e) { setUploadForm({ ...uploadForm, occasion: e.target.value }) }}
                placeholder="e.g. Wedding, Engagement, Diwali"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
              />
            </div>
            <button
              onClick={handleUploadContent}
              disabled={saving || !uploadForm.customer_id}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}
            >{saving ? 'Saving...' : 'Upload Content'}</button>
          </div>
        </Modal>
      )}

      {/* Add Reward Modal */}
      {showAddReward && (
        <Modal title="Add Reward" onClose={function() { setShowAddReward(false) }}>
          <div className="space-y-4">
            <CustomerPicker
              value={rewardForm.customer_id}
              onChange={function(id) { setRewardForm({ ...rewardForm, customer_id: id }) }}
            />
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Reward Type</label>
              <select
                value={rewardForm.reward_type}
                onChange={function(e) { setRewardForm({ ...rewardForm, reward_type: e.target.value }) }}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
              >
                <option value="referral">🎁 Referral</option>
                <option value="content">📸 Content</option>
                <option value="review">⭐ Review</option>
                <option value="loyalty">👑 Loyalty</option>
                <option value="other">🎉 Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Title</label>
              <input
                type="text"
                value={rewardForm.title}
                onChange={function(e) { setRewardForm({ ...rewardForm, title: e.target.value }) }}
                placeholder="e.g. Photo sharing reward"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Item Description</label>
              <input
                type="text"
                value={rewardForm.item}
                onChange={function(e) { setRewardForm({ ...rewardForm, item: e.target.value }) }}
                placeholder="e.g. Summer Collection kurta set"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Notes</label>
              <textarea
                value={rewardForm.notes}
                onChange={function(e) { setRewardForm({ ...rewardForm, notes: e.target.value }) }}
                placeholder="Optional notes..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
              />
            </div>
            <button
              onClick={handleAddReward}
              disabled={saving || !rewardForm.customer_id}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}
            >{saving ? 'Saving...' : 'Add Reward'}</button>
          </div>
        </Modal>
      )}

      {/* Assign Modal */}
      {assignModal && (
        <Modal title="Assign Reward" onClose={function() { setAssignModal(null) }}>
          <div className="space-y-4">
            <div className="rounded-xl p-3" style={{ background: '#f0ebe3', border: '1px solid #eae8e4' }}>
              <div className="text-sm font-medium" style={{ color: '#3d2e1c' }}>
                {REWARD_TYPE_EMOJI[assignModal.reward_type] || '🎉'} {assignModal.title || assignModal.reward_type}
              </div>
              <div className="text-xs mt-1" style={{ color: '#807664' }}>
                For: {getCustomerName(assignModal.customer_id)} · Earned: {fmtDate(assignModal.earned_at)}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Item (what to give them) *</label>
              <input
                type="text"
                value={assignForm.item}
                onChange={function(e) { setAssignForm({ ...assignForm, item: e.target.value }) }}
                placeholder="e.g. Summer Collection kurta set"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Assigned By</label>
              <div className="px-3 py-2 rounded-lg text-sm" style={{ background: '#faf8f5', border: '1px solid #eae8e4', color: '#807664' }}>
                {window._currentTeamMemberId ? getBuyerName(window._currentTeamMemberId) : 'Current User'}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Notes</label>
              <textarea
                value={assignForm.notes}
                onChange={function(e) { setAssignForm({ ...assignForm, notes: e.target.value }) }}
                placeholder="Optional notes..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
              />
            </div>
            <button
              onClick={handleAssign}
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}
            >{saving ? 'Saving...' : 'Assign Reward'}</button>
          </div>
        </Modal>
      )}

      {/* Redeem Modal */}
      {redeemModal && (
        <Modal title="Mark as Redeemed" onClose={function() { setRedeemModal(null) }}>
          <div className="space-y-4">
            <div className="rounded-xl p-3" style={{ background: '#f0ebe3', border: '1px solid #eae8e4' }}>
              <div className="text-sm font-medium" style={{ color: '#3d2e1c' }}>
                {REWARD_TYPE_EMOJI[redeemModal.reward_type] || '🎉'} {redeemModal.title || redeemModal.reward_type}
              </div>
              <div className="text-xs mt-1" style={{ color: '#807664' }}>
                For: {getCustomerName(redeemModal.customer_id)}
              </div>
              {redeemModal.item && (
                <div className="text-xs mt-1" style={{ color: '#3d2e1c' }}>
                  Item: {redeemModal.item}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#3d2e1c' }}>Notes</label>
              <textarea
                value={redeemNotes}
                onChange={function(e) { setRedeemNotes(e.target.value) }}
                placeholder="Optional notes..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
              />
            </div>
            <button
              onClick={handleRedeem}
              disabled={saving}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}
            >{saving ? 'Saving...' : 'Mark Redeemed'}</button>
          </div>
        </Modal>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════
  // GALLERY SUB-TAB
  // ═══════════════════════════════════════════════════════════════════
  function renderGallery() {
    return (
      <div className="space-y-4">
        {/* KPI Strip */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
          <StatCard label="Total Content" value={galleryKpis.total} />
          <StatCard label="Reviews" value={galleryKpis.reviews} color="#7c3aed" />
          <StatCard label="Photos" value={galleryKpis.photos} color="#2563eb" />
          <StatCard label="Videos" value={galleryKpis.videos} color="#059669" />
          <StatCard label="Avg Rating" value={galleryKpis.avgRating} color="#d4a843" />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={function(e) { setTypeFilter(e.target.value) }}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ border: '1px solid #eae8e4', color: '#3d2e1c', background: '#fff' }}
          >
            <option value="all">All Types</option>
            <option value="photos">📸 Photos</option>
            <option value="videos">🎬 Videos</option>
            <option value="reviews">⭐ Reviews</option>
          </select>
          <select
            value={tierFilter}
            onChange={function(e) { setTierFilter(e.target.value) }}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ border: '1px solid #eae8e4', color: '#3d2e1c', background: '#fff' }}
          >
            <option value="all">All Tiers</option>
            <option value="royal">👑 Royal</option>
            <option value="elite">⭐ Elite</option>
            <option value="repeat">🔵 Repeat</option>
          </select>
          <input
            type="text"
            value={search}
            onChange={function(e) { setSearch(e.target.value) }}
            placeholder="Search customer..."
            className="px-3 py-1.5 rounded-lg text-xs flex-1 min-w-[120px]"
            style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
          />
          <button
            onClick={function() { setShowUploadModal(true); setCustDropdown('') }}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}
          >+ Upload Content</button>
        </div>

        {/* Gallery grid */}
        {filteredContent.length === 0 ? (
          <div className="text-center py-12 rounded-xl" style={{ background: '#faf8f5', border: '1px solid #eae8e4' }}>
            <div className="text-2xl mb-2">📸</div>
            <div className="text-sm" style={{ color: '#807664' }}>No content yet</div>
            <div className="text-xs mt-1" style={{ color: '#807664' }}>Upload photos, videos, or record reviews</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredContent.map(function(item) {
              var isReview = item.content_type === 'google_review'
              var custTier = getCustomerTier(item.customer_id)
              var custName = getCustomerName(item.customer_id)
              var typeLabel = item.content_type === 'photo' ? '📸 Photo' : item.content_type === 'video' ? '🎬 Video' : '⭐ Review'

              return (
                <div
                  key={item.id}
                  className="rounded-xl overflow-hidden"
                  style={{ background: '#fff', border: '1px solid #eae8e4' }}
                >
                  {/* Media or review content */}
                  {isReview ? (
                    <div className="p-4" style={{ background: '#faf8f5' }}>
                      <div className="mb-2">{starDisplay(item.star_rating || 0)}</div>
                      <div className="text-sm italic leading-relaxed" style={{ color: '#3d2e1c' }}>
                        {item.review_text ? '"' + item.review_text + '"' : 'No review text'}
                      </div>
                    </div>
                  ) : item.media_url ? (
                    <div className="aspect-video bg-gray-100 relative overflow-hidden">
                      {item.content_type === 'video' ? (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: '#f0ebe3' }}>
                          <span className="text-3xl">🎬</span>
                          <div className="absolute bottom-2 right-2 text-[10px] px-2 py-0.5 rounded-full text-white" style={{ background: 'rgba(0,0,0,0.6)' }}>Video</div>
                        </div>
                      ) : (
                        <img
                          src={item.media_url}
                          alt={item.title || 'Content'}
                          className="w-full h-full object-cover"
                          onError={function(e) { e.target.style.display = 'none' }}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="aspect-video flex items-center justify-center" style={{ background: '#f0ebe3' }}>
                      <span className="text-3xl opacity-40">{item.content_type === 'photo' ? '📸' : '🎬'}</span>
                    </div>
                  )}

                  {/* Card details */}
                  <div className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium" style={{ color: '#3d2e1c' }}>{custName}</span>
                        {tierBadge(custTier)}
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: '#f0ebe3', color: '#807664' }}>
                        {typeLabel}
                      </span>
                    </div>
                    {item.title && (
                      <div className="text-xs" style={{ color: '#3d2e1c' }}>{item.title}</div>
                    )}
                    <div className="flex items-center gap-2 text-[10px]" style={{ color: '#807664' }}>
                      <span>{fmtDate(item.created_at)}</span>
                      {item.occasion && <span>· {item.occasion}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  // GIFTS & OFFERS SUB-TAB
  // ═══════════════════════════════════════════════════════════════════
  function renderGifts() {
    return (
      <div className="space-y-4">
        {/* KPI Strip */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
          <StatCard label="Total Rewards" value={rewardKpis.total} />
          <StatCard label="Earned" value={rewardKpis.earned} color="#92400e" />
          <StatCard label="Assigned" value={rewardKpis.assigned} color="#1e40af" />
          <StatCard label="Redeemed" value={rewardKpis.redeemed} color="#065f46" />
          <StatCard label="Pending Assignment" value={rewardKpis.pending} color="#d4a843" />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={rewardStatusFilter}
            onChange={function(e) { setRewardStatusFilter(e.target.value) }}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ border: '1px solid #eae8e4', color: '#3d2e1c', background: '#fff' }}
          >
            <option value="all">All Status</option>
            <option value="earned">Earned</option>
            <option value="assigned">Assigned</option>
            <option value="redeemed">Redeemed</option>
            <option value="expired">Expired</option>
          </select>
          <select
            value={rewardTypeFilter}
            onChange={function(e) { setRewardTypeFilter(e.target.value) }}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ border: '1px solid #eae8e4', color: '#3d2e1c', background: '#fff' }}
          >
            <option value="all">All Types</option>
            <option value="referral">🎁 Referral</option>
            <option value="content">📸 Content</option>
            <option value="review">⭐ Review</option>
            <option value="loyalty">👑 Loyalty</option>
            <option value="other">🎉 Other</option>
          </select>
          <input
            type="text"
            value={rewardSearch}
            onChange={function(e) { setRewardSearch(e.target.value) }}
            placeholder="Search customer..."
            className="px-3 py-1.5 rounded-lg text-xs flex-1 min-w-[120px]"
            style={{ border: '1px solid #eae8e4', color: '#3d2e1c' }}
          />
          <button
            onClick={function() { setShowAddReward(true); setCustDropdown('') }}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}
          >+ Add Reward</button>
        </div>

        {/* Rewards table */}
        {filteredRewards.length === 0 ? (
          <div className="text-center py-12 rounded-xl" style={{ background: '#faf8f5', border: '1px solid #eae8e4' }}>
            <div className="text-2xl mb-2">🎁</div>
            <div className="text-sm" style={{ color: '#807664' }}>No rewards yet</div>
            <div className="text-xs mt-1" style={{ color: '#807664' }}>Add rewards to track gifts and offers for customers</div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Desktop header */}
            <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-2 text-[10px] font-bold uppercase" style={{ color: '#807664', letterSpacing: '0.05em' }}>
              <div className="col-span-3">Customer</div>
              <div className="col-span-2">Reward</div>
              <div className="col-span-2">Title / Item</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Earned</div>
              <div className="col-span-1">Assigned By</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {filteredRewards.map(function(r) {
              var custTier = getCustomerTier(r.customer_id)
              var custName = getCustomerName(r.customer_id)
              var typeEmoji = REWARD_TYPE_EMOJI[r.reward_type] || '🎉'
              var statusStyle = STATUS_COLORS[r.status] || STATUS_COLORS.earned
              var assignedName = r.assigned_by ? getBuyerName(r.assigned_by) : '—'

              return (
                <div
                  key={r.id}
                  className="rounded-xl p-3 sm:p-4 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center"
                  style={{ background: '#fff', border: '1px solid #eae8e4' }}
                >
                  {/* Customer */}
                  <div className="col-span-3 flex items-center gap-1.5 mb-2 sm:mb-0">
                    <span className="text-sm font-medium" style={{ color: '#3d2e1c' }}>{custName}</span>
                    {tierBadge(custTier)}
                  </div>

                  {/* Reward type */}
                  <div className="col-span-2 mb-1 sm:mb-0">
                    <span className="text-xs" style={{ color: '#3d2e1c' }}>
                      {typeEmoji} {r.reward_type ? r.reward_type.charAt(0).toUpperCase() + r.reward_type.slice(1) : 'Other'}
                    </span>
                  </div>

                  {/* Title / Item */}
                  <div className="col-span-2 mb-1 sm:mb-0">
                    <div className="text-xs font-medium" style={{ color: '#3d2e1c' }}>{r.title || '—'}</div>
                    {r.item && <div className="text-[10px]" style={{ color: '#807664' }}>{r.item}</div>}
                  </div>

                  {/* Status */}
                  <div className="col-span-1 mb-1 sm:mb-0">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium inline-block"
                      style={{ background: statusStyle.bg, color: statusStyle.text, border: '1px solid ' + statusStyle.border }}
                    >
                      {r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : '—'}
                    </span>
                  </div>

                  {/* Earned date */}
                  <div className="col-span-1 mb-1 sm:mb-0">
                    <span className="text-[10px]" style={{ color: '#807664' }}>{fmtDate(r.earned_at)}</span>
                  </div>

                  {/* Assigned by */}
                  <div className="col-span-1 mb-2 sm:mb-0">
                    <span className="text-[10px]" style={{ color: '#807664' }}>{assignedName}</span>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex justify-end gap-2">
                    {r.status === 'earned' && (
                      <button
                        onClick={function() { setAssignModal(r); setAssignForm({ item: r.item || '', notes: '' }) }}
                        className="px-3 py-1 rounded-lg text-[10px] font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}
                      >Assign</button>
                    )}
                    {r.status === 'assigned' && (
                      <button
                        onClick={function() { setRedeemModal(r); setRedeemNotes('') }}
                        className="px-3 py-1 rounded-lg text-[10px] font-semibold text-white"
                        style={{ background: 'linear-gradient(135deg, #065f46, #10b981)' }}
                      >Mark Redeemed</button>
                    )}
                    {(r.status === 'redeemed' || r.status === 'expired') && (
                      <span className="text-[10px]" style={{ color: '#807664' }}>—</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }
}

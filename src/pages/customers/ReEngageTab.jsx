/* =============================================================================
   RE-ENGAGE TAB — Smart telecaller queue with 4 triggers
   Triggers: occasion approaching, dormant VIP, repeat buyer due, post-purchase
   Features: product images, WhatsApp customer page, callback scheduling,
             smart objective icons (review/content/resell)
   ============================================================================= */
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { fmt, filterStylists } from '../../lib/helpers'
import Modal from '../../components/Modal'

var PRIORITY_COLORS = {
  high: { bg: '#fef2f2', color: '#dc2626', dot: '🔴' },
  medium: { bg: '#fff7ed', color: '#d97706', dot: '🟡' },
  low: { bg: '#f0fdf4', color: '#16a34a', dot: '🟢' }
}

var OUTCOMES = [
  { value: 'interested_visit', label: 'Interested — will visit store', next: 'Create lead' },
  { value: 'interested_info', label: 'Interested — wants more info', next: 'Follow up in 3 days' },
  { value: 'shared_content', label: 'Shared content', next: 'Upload content' },
  { value: 'left_review', label: 'Left Google review', next: 'Mark review' },
  { value: 'not_now', label: 'Not interested now', next: 'Snooze 60 days' },
  { value: 'dnc', label: 'Do not contact', next: 'Flag DNC' },
  { value: 'no_answer', label: 'No answer', next: 'Retry in 2 days' },
  { value: 'wrong_number', label: 'Wrong number', next: 'Flag for update' }
]

var TRIGGER_LABELS = {
  occasion: 'Occasion',
  dormant: 'Dormant VIP',
  repeat_due: 'Repeat Due',
  post_purchase: 'Post-Purchase',
  callback: 'Callback'
}

/* ── tiny helper components ── */

var StatCard = function(props) {
  return (
    <div className="rounded-xl p-3" style={{ background: '#fff', border: '1px solid #eae8e4' }}>
      <div className="text-[10px] font-bold uppercase mb-1" style={{ color: '#807664' }}>{props.label}</div>
      <div className="text-xl font-bold" style={{ color: props.color || '#d4a843' }}>{props.value}</div>
    </div>
  )
}

var ObjectivePill = function(props) {
  if (props.hidden) return null
  var colors = {
    orange: { bg: '#fff7ed', color: '#d97706', border: '#fde68a' },
    green: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
    blue: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' }
  }
  var c = colors[props.variant] || colors.blue
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: c.bg, color: c.color, border: '1px solid ' + c.border }}>
      {props.icon} {props.label}
    </span>
  )
}

/* ── main component ── */

export default function ReEngageTab(props) {
  var buyers = props.buyers || []
  var customers = props.customers || []
  var teamMembers = props.teamMembers || []
  var onRefresh = props.onRefresh
  var updateCustomerLocal = props.updateCustomerLocal

  var [queue, setQueue] = useState([])
  var [engagements, setEngagements] = useState([])
  var [loading, setLoading] = useState(true)
  var [generating, setGenerating] = useState(false)
  var [saving, setSaving] = useState(false)
  var [assignFilter, setAssignFilter] = useState(window._currentTeamMemberId || 'all')

  // Sub-view: 'queue' | 'unreached' | 'activity'
  var [subView, setSubView] = useState('queue')

  // Date range for Generate Queue & Unreached
  var [showDatePicker, setShowDatePicker] = useState(false)
  var [dateRangeFrom, setDateRangeFrom] = useState('')
  var [dateRangeTo, setDateRangeTo] = useState('')

  // Activity log pagination
  var [activityPage, setActivityPage] = useState(1)
  var ACTIVITY_PAGE_SIZE = 25

  // Unreached customers
  var [unreachedCustomers, setUnreachedCustomers] = useState([])
  var [unreachedLoading, setUnreachedLoading] = useState(false)

  // Full activity log
  var [activityLog, setActivityLog] = useState([])
  var [activityLoading, setActivityLoading] = useState(false)

  // Card expand state
  var [expandedCard, setExpandedCard] = useState(null)

  // Caches: orders, line items, product images
  var [customerOrders, setCustomerOrders] = useState({})   // { buyerName: [orders] }
  var [orderLineItems, setOrderLineItems] = useState({})   // { orderId: [items] }
  var [productImages, setProductImages] = useState({})      // { sku: { image_url, title } }

  // Lightbox for product image
  var [lightboxImage, setLightboxImage] = useState(null)    // { url, title }

  // Outcome modal state
  var [showOutcome, setShowOutcome] = useState(null)
  var [selectedOutcome, setSelectedOutcome] = useState('')
  var [outcomeNotes, setOutcomeNotes] = useState('')
  var [reviewToggle, setReviewToggle] = useState(false)
  var [contentToggle, setContentToggle] = useState(false)
  var [callbackDate, setCallbackDate] = useState('')
  var [callbackReason, setCallbackReason] = useState('')

  // Upload content / Add review modals
  var [showUploadModal, setShowUploadModal] = useState(null) // queue item
  var [uploadFile, setUploadFile] = useState(null)
  var [uploadTitle, setUploadTitle] = useState('')
  var [uploading, setUploading] = useState(false)
  var [showReviewModal, setShowReviewModal] = useState(null) // queue item
  var [reviewRating, setReviewRating] = useState(5)
  var [reviewText, setReviewText] = useState('')
  var [reviewSaving, setReviewSaving] = useState(false)

  // Manual search / add to queue
  var [searchQuery, setSearchQuery] = useState('')
  var [showManualAdd, setShowManualAdd] = useState(false)

  // Modal orders (for outcome modal)
  var [modalOrders, setModalOrders] = useState([])
  var [modalLineItems, setModalLineItems] = useState({})
  var [modalProductImages, setModalProductImages] = useState({})

  /* ── data fetching ── */

  var fetchQueue = useCallback(async function() {
    setLoading(true)
    try {
      var today = new Date().toISOString().split('T')[0]
      var { data: q } = await supa.from('engagement_queue').select('*')
        .lte('scheduled_date', today).in('status', ['pending', 'in_progress'])
        .order('priority', { ascending: true }).order('scheduled_date', { ascending: true })
      setQueue(q || [])

      var { data: e } = await supa.from('customer_engagements').select('*')
        .order('created_at', { ascending: false }).limit(50)
      setEngagements(e || [])
    } catch (err) { console.error('Queue fetch error:', err) }
    finally { setLoading(false) }
  }, [])

  useEffect(function() { fetchQueue() }, [fetchQueue])

  /* ── fetch orders + line items + product images for a customer ── */

  var fetchOrdersForCustomer = useCallback(async function(customerName) {
    if (!customerName || customerOrders[customerName]) return
    try {
      var { data: orders } = await supa.from('shopify_orders')
        .select('id, order_number, created_at, total_price, customer_name, order_status, channel')
        .eq('customer_name', customerName)
        .order('created_at', { ascending: false }).limit(5)

      setCustomerOrders(function(prev) {
        var next = Object.assign({}, prev)
        next[customerName] = orders || []
        return next
      })

      if (orders && orders.length > 0) {
        var orderIds = orders.map(function(o) { return o.id })
        var { data: items } = await supa.from('order_line_items').select('*')
          .in('order_id', orderIds)

        if (items && items.length > 0) {
          var grouped = {}
          items.forEach(function(li) {
            if (!grouped[li.order_id]) grouped[li.order_id] = []
            grouped[li.order_id].push(li)
          })
          setOrderLineItems(function(prev) { return Object.assign({}, prev, grouped) })

          // Collect unique SKUs and fetch product images
          var skus = []
          items.forEach(function(li) { if (li.sku && skus.indexOf(li.sku) === -1) skus.push(li.sku) })

          if (skus.length > 0) {
            // Only fetch SKUs we haven't cached
            var uncached = skus.filter(function(s) { return !productImages[s] })
            if (uncached.length > 0) {
              var { data: products } = await supa.from('inventory_skus').select('style_code, sku_code, image_url, product_title')
                .or('style_code.in.('+uncached.join(',')+'),sku_code.in.('+uncached.join(',')+')')
              if (products) {
                var imgMap = {}
                products.forEach(function(p) {
                  var rec = { image_url: p.image_url, title: p.product_title }
                  if (p.sku_code) imgMap[p.sku_code] = rec
                  if (p.style_code) imgMap[p.style_code] = rec
                })
                setProductImages(function(prev) { return Object.assign({}, prev, imgMap) })
              }
            }
          }
        }
      }
    } catch (err) { console.error('Fetch orders error:', err) }
  }, [customerOrders, productImages])

  /* ── fetch orders for outcome modal (separate from card cache) ── */

  var fetchOrdersForModal = useCallback(async function(customerName) {
    if (!customerName) return
    try {
      var { data: orders } = await supa.from('shopify_orders')
        .select('id, order_number, created_at, total_price, customer_name, order_status, channel')
        .eq('customer_name', customerName)
        .order('created_at', { ascending: false }).limit(5)
      setModalOrders(orders || [])

      if (orders && orders.length > 0) {
        var orderIds = orders.map(function(o) { return o.id })
        var { data: items } = await supa.from('order_line_items').select('*').in('order_id', orderIds)
        if (items && items.length > 0) {
          var grouped = {}
          items.forEach(function(li) {
            if (!grouped[li.order_id]) grouped[li.order_id] = []
            grouped[li.order_id].push(li)
          })
          setModalLineItems(grouped)

          var skus = []
          items.forEach(function(li) { if (li.sku && skus.indexOf(li.sku) === -1) skus.push(li.sku) })
          var uncached = skus.filter(function(s) { return !productImages[s] && !modalProductImages[s] })
          if (uncached.length > 0) {
            var { data: products } = await supa.from('inventory_skus').select('style_code, sku_code, image_url, product_title').or('style_code.in.('+uncached.join(',')+'),sku_code.in.('+uncached.join(',')+')')
            if (products) {
              var imgMap = {}
              products.forEach(function(p) { var rec = { image_url: p.image_url, title: p.product_title }; if (p.sku_code) imgMap[p.sku_code] = rec; if (p.style_code) imgMap[p.style_code] = rec })
              setModalProductImages(function(prev) { return Object.assign({}, prev, imgMap) })
            }
          }
        }
      }
    } catch (err) { console.error('Modal orders fetch error:', err) }
  }, [productImages, modalProductImages])

  /* ── generate queue (4 triggers) ── */

  var generateQueue = useCallback(async function() {
    setGenerating(true)
    try {
      var today = new Date()
      var todayStr = today.toISOString().split('T')[0]
      var newItems = []

      var enriched = customers.filter(function(c) { return c.relationship === 'self' }).map(function(c) {
        var buyer = buyers.find(function(b) { return b.id === c.buyer_id })
        return { ...c, buyer: buyer || {}, buyerName: (buyer || {}).name || c.name, buyerPhone: (buyer || {}).phone || c.phone || '' }
      })

      var existingIds = new Set(queue.map(function(q) { return q.customer_id }))

      /* TRIGGER 1: Occasion approaching */
      enriched.forEach(function(c) {
        if (existingIds.has(c.id) || c.do_not_contact) return
        var occasions = []

        if (c.birthday) {
          var bday = new Date(c.birthday)
          bday.setFullYear(today.getFullYear())
          if (bday < today) bday.setFullYear(today.getFullYear() + 1)
          var daysUntil = Math.round((bday - today) / (1000 * 60 * 60 * 24))
          if (daysUntil >= 0 && daysUntil <= 14) occasions.push({ type: 'Birthday', days: daysUntil })
        }
        if (c.anniversary_date) {
          var anniv = new Date(c.anniversary_date)
          anniv.setFullYear(today.getFullYear())
          if (anniv < today) anniv.setFullYear(today.getFullYear() + 1)
          var daysUntil2 = Math.round((anniv - today) / (1000 * 60 * 60 * 24))
          if (daysUntil2 >= 0 && daysUntil2 <= 14) occasions.push({ type: 'Anniversary', days: daysUntil2 })
        }

        occasions.forEach(function(occ) {
          newItems.push({
            customer_id: c.id, buyer_id: c.buyer_id,
            trigger_type: 'occasion', priority: 'high', scheduled_date: todayStr,
            reason: occ.type + ' in ' + occ.days + ' days',
            suggestion: 'Wish ' + c.buyerName + ' a happy ' + occ.type.toLowerCase() + '. Mention new collection and suggest products for the celebration.',
            context_json: { name: c.buyerName, phone: c.buyerPhone, tier: c.customer_type, spend: c.total_spend, orders: c.total_orders, occasion: occ.type, days_until: occ.days }
          })
          existingIds.add(c.id)
        })
      })

      /* TRIGGER 2: Dormant high-value */
      enriched.filter(function(c) {
        return (c.customer_type === 'royal' || c.customer_type === 'elite') && !c.do_not_contact && !existingIds.has(c.id)
      }).forEach(function(c) {
        var daysSince = c.last_contacted_at ? Math.round((today - new Date(c.last_contacted_at)) / (1000 * 60 * 60 * 24)) : 999
        if (daysSince >= 90) {
          newItems.push({
            customer_id: c.id, buyer_id: c.buyer_id,
            trigger_type: 'dormant', priority: 'high', scheduled_date: todayStr,
            reason: (c.customer_type === 'royal' ? '👑 Royal' : '⭐ Elite') + ' — last contact ' + daysSince + ' days ago',
            suggestion: 'Check in with ' + c.buyerName + '. They spent ' + fmt(c.total_spend || 0) + ' across ' + (c.total_orders || 0) + ' orders. Ask about upcoming occasions and share new arrivals.',
            context_json: { name: c.buyerName, phone: c.buyerPhone, tier: c.customer_type, spend: c.total_spend, orders: c.total_orders, days_dormant: daysSince }
          })
          existingIds.add(c.id)
        }
      })

      /* TRIGGER 3: Repeat buyer due */
      enriched.filter(function(c) {
        return c.customer_type === 'repeat' && !c.do_not_contact && !existingIds.has(c.id)
      }).forEach(function(c) {
        var daysSince = c.last_contacted_at ? Math.round((today - new Date(c.last_contacted_at)) / (1000 * 60 * 60 * 24)) : 999
        if (daysSince >= 90) {
          newItems.push({
            customer_id: c.id, buyer_id: c.buyer_id,
            trigger_type: 'repeat_due', priority: 'medium', scheduled_date: todayStr,
            reason: 'Repeat buyer — last contact ' + daysSince + ' days ago',
            suggestion: 'Re-engage ' + c.buyerName + ' (' + fmt(c.total_spend || 0) + ', ' + (c.total_orders || 0) + ' orders). Check if any occasions coming up. Share new collection.',
            context_json: { name: c.buyerName, phone: c.buyerPhone, tier: c.customer_type, spend: c.total_spend, orders: c.total_orders, days_dormant: daysSince }
          })
          existingIds.add(c.id)
        }
      })

      /* TRIGGER 4: Post-purchase callback */
      try {
        var d30 = new Date(today)
        d30.setDate(d30.getDate() - 30)
        var d90 = new Date(today)
        d90.setDate(d90.getDate() - 90)

        var { data: deliveredOrders } = await supa.from('shopify_orders')
          .select('id, customer_name, created_at, total_price, order_number')
          .in('order_status', ['delivered', 'fulfilled'])
          .gte('created_at', d90.toISOString())
          .lte('created_at', d30.toISOString())
          .order('created_at', { ascending: false })

        if (deliveredOrders && deliveredOrders.length > 0) {
          // Check which orders already have queue items
          var orderIds = deliveredOrders.map(function(o) { return o.id })
          var { data: existingQueueItems } = await supa.from('engagement_queue')
            .select('source_order_id')
            .in('source_order_id', orderIds)
            .in('status', ['pending', 'in_progress', 'completed'])

          var existingOrderIds = new Set((existingQueueItems || []).map(function(q) { return q.source_order_id }))

          deliveredOrders.forEach(function(order) {
            if (existingOrderIds.has(order.id)) return

            // Find matching customer by buyer name
            var matchedEnriched = enriched.find(function(c) {
              return c.buyerName && order.customer_name &&
                c.buyerName.toLowerCase().trim() === order.customer_name.toLowerCase().trim()
            })
            if (!matchedEnriched || matchedEnriched.do_not_contact || existingIds.has(matchedEnriched.id)) return

            var daysSinceOrder = Math.round((today - new Date(order.created_at)) / (1000 * 60 * 60 * 24))
            var daysSinceContact = matchedEnriched.last_contacted_at
              ? Math.round((today - new Date(matchedEnriched.last_contacted_at)) / (1000 * 60 * 60 * 24))
              : 999

            // Only add if customer hasn't been contacted since delivery
            if (daysSinceContact >= daysSinceOrder) {
              newItems.push({
                customer_id: matchedEnriched.id, buyer_id: matchedEnriched.buyer_id,
                trigger_type: 'post_purchase', priority: 'medium', scheduled_date: todayStr,
                source_order_id: order.id,
                callback_date: todayStr,
                reason: 'Post-purchase follow-up — order #' + order.order_number + ' delivered ' + daysSinceOrder + ' days ago',
                suggestion: 'Check how ' + matchedEnriched.buyerName + ' is enjoying their purchase (' + fmt(order.total_price) + '). Ask for photos/review. Mention new arrivals.',
                context_json: {
                  name: matchedEnriched.buyerName, phone: matchedEnriched.buyerPhone,
                  tier: matchedEnriched.customer_type, spend: matchedEnriched.total_spend,
                  orders: matchedEnriched.total_orders, order_number: order.order_number,
                  order_total: order.total_price, days_since_order: daysSinceOrder
                }
              })
              existingIds.add(matchedEnriched.id)
            }
          })
        }
      } catch (err) { console.error('Post-purchase trigger error:', err) }

      /* Insert new items — limit to 10 at a time */
      if (newItems.length > 0) {
        var batch = newItems.slice(0, 10)
        var { data: inserted, error } = await supa.from('engagement_queue').insert(batch).select()
        if (error) console.error('Queue insert error:', error)
        if (inserted && inserted.length > 0) {
          setQueue(function(prev) { return prev.concat(inserted) })
        }
      }
    } catch (err) { console.error('Generate queue error:', err) }
    finally { setGenerating(false) }
  }, [buyers, customers, queue])

  /* ── WhatsApp customer page share ── */

  var shareCustomerPage = useCallback(function(item) {
    var ctx = item.context_json || {}
    var name = ctx.name || item.customerName || ''
    var phone = ctx.phone || item.customerPhone || ''
    var cleanPhone = phone.replace(/[^0-9]/g, '')

    // Find customer to get page_token
    var cust = customers.find(function(c) { return c.id === item.customer_id })
    var token = cust ? cust.page_token : ''
    if (!token) {
      alert('No customer page token found. Please generate one first.')
      return
    }

    var url = 'https://hiloplatform.vercel.app/c.html?t=' + token
    var msg = 'Hi ' + name + '! 👋 Thank you for being a valued Hilo Design customer. We\'ve created a special page just for you — share your experience, photos, or refer friends: ' + url

    window.open('https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(msg), '_blank')
  }, [customers])

  /* ── open outcome modal ── */

  var openOutcomeModal = useCallback(function(item, preselect) {
    setShowOutcome(item)
    setSelectedOutcome(preselect || '')
    setOutcomeNotes('')
    setReviewToggle(false)
    setContentToggle(false)
    setCallbackDate('')
    setCallbackReason('')
    setModalOrders([])
    setModalLineItems({})
    setModalProductImages({})

    if (item && item.customerName) {
      fetchOrdersForModal(item.customerName)
    }
  }, [fetchOrdersForModal])

  /* ── log outcome ── */

  var logOutcome = useCallback(async function() {
    if (!showOutcome || !selectedOutcome) return
    setSaving(true)
    try {
      var item = showOutcome

      var insertData = {
        customer_id: item.customer_id, buyer_id: item.buyer_id,
        type: 'call', trigger_type: item.trigger_type, status: 'completed',
        outcome: selectedOutcome, notes: outcomeNotes || null,
        assigned_to: window._currentTeamMemberId || null,
        completed_at: new Date().toISOString()
      }

      if (contentToggle) insertData.content_requested = true
      if (reviewToggle) insertData.review_link_shared = true

      var { data: eng, error: engErr } = await supa.from('customer_engagements').insert(insertData).select().single()
      if (engErr) throw engErr

      // Update queue item
      await supa.from('engagement_queue').update({
        status: 'completed', completed_at: new Date().toISOString(), engagement_id: eng.id
      }).eq('id', item.id)

      // Update customer — also auto-assign stylist
      var custUpdate = { last_contacted_at: new Date().toISOString(), updated_at: new Date().toISOString(), assigned_stylist: window._currentTeamMemberId || null }
      if (selectedOutcome === 'dnc') custUpdate.do_not_contact = true
      if (selectedOutcome === 'left_review' || reviewToggle) custUpdate.review_received = true
      if (selectedOutcome === 'shared_content' || contentToggle) custUpdate.content_received = true
      if (['interested_visit', 'interested_info', 'shared_content'].indexOf(selectedOutcome) !== -1) {
        var activeUntil = new Date()
        activeUntil.setDate(activeUntil.getDate() + 30)
        custUpdate.reengagement_active_until = activeUntil.toISOString()
      }
      if (selectedOutcome === 'shared_content' || selectedOutcome === 'left_review') {
        custUpdate.exclusive_access = true
        custUpdate.exclusive_access_granted_at = new Date().toISOString()
      }

      await supa.from('customers').update(custUpdate).eq('id', item.customer_id)

      // Auto-create qualified lead for "interested_visit"
      if (selectedOutcome === 'interested_visit') {
        try {
          var ctx = item.context_json || {}
          await supa.from('leads').insert([{
            phone: (ctx.phone || '').replace(/[^0-9+]/g, '') || 'unknown',
            client_name: ctx.name || '',
            channel: 'Phone',
            lead_source: 'Existing Client',
            lead_date: new Date().toISOString().split('T')[0],
            phase: 'qualified',
            status: 'Follow-up 1',
            lead_quality: 'hot',
            client_requirements: outcomeNotes || 'Interested in visiting store (from Re-Engage call)',
            assigned_to: window._currentTeamMemberId || null,
            created_by: window._currentUserEmail || 'unknown',
            import_source: 'reengagement'
          }])
        } catch (leadErr) { console.error('Auto-create lead error:', leadErr) }
      }

      // Handle snooze / retry
      if (selectedOutcome === 'not_now') {
        var snooze = new Date()
        snooze.setDate(snooze.getDate() + 60)
        await supa.from('engagement_queue').insert({
          customer_id: item.customer_id, buyer_id: item.buyer_id,
          trigger_type: item.trigger_type, priority: 'low', scheduled_date: snooze.toISOString().split('T')[0],
          reason: 'Snoozed from ' + new Date().toISOString().split('T')[0],
          suggestion: item.suggestion
        })
      }
      if (selectedOutcome === 'no_answer') {
        var retry = new Date()
        retry.setDate(retry.getDate() + 2)
        await supa.from('engagement_queue').insert({
          customer_id: item.customer_id, buyer_id: item.buyer_id,
          trigger_type: item.trigger_type, priority: item.priority, scheduled_date: retry.toISOString().split('T')[0],
          reason: 'Retry — no answer on ' + new Date().toISOString().split('T')[0],
          suggestion: item.suggestion
        })
      }

      // Schedule callback if date is set
      if (callbackDate) {
        await supa.from('engagement_queue').insert({
          customer_id: item.customer_id, buyer_id: item.buyer_id,
          trigger_type: 'callback', priority: 'medium',
          scheduled_date: callbackDate,
          callback_date: callbackDate,
          reason: 'Scheduled callback' + (callbackReason ? ': ' + callbackReason : ''),
          suggestion: callbackReason || 'Follow up as scheduled.',
          context_json: item.context_json
        })
      }

      // Local state updates
      setQueue(function(prev) { return prev.filter(function(q) { return q.id !== item.id }) })
      if (eng) setEngagements(function(prev) { return [eng].concat(prev) })
      if (updateCustomerLocal) updateCustomerLocal(item.customer_id, custUpdate)
      setShowOutcome(null)
    } catch (err) { console.error('Log outcome error:', err) }
    finally { setSaving(false) }
  }, [showOutcome, selectedOutcome, outcomeNotes, reviewToggle, contentToggle, callbackDate, callbackReason, updateCustomerLocal])

  /* ── upload content from stylist side ── */

  var handleUploadContent = useCallback(async function() {
    if (!showUploadModal || !uploadFile) return
    setUploading(true)
    try {
      var item = showUploadModal
      var ext = uploadFile.name.split('.').pop().toLowerCase()
      var fileName = item.customer_id + '_' + Date.now() + '.' + ext
      var bucket = 'customer-content'
      await supa.storage.createBucket(bucket, { public: true }).catch(function() {})
      var { error: upErr } = await supa.storage.from(bucket).upload(fileName, uploadFile)
      if (upErr) throw upErr
      var { data: urlData } = supa.storage.from(bucket).getPublicUrl(fileName)

      await supa.from('customer_content').insert({
        customer_id: item.customer_id, buyer_id: item.buyer_id,
        content_type: ext === 'mp4' || ext === 'mov' || ext === 'webm' ? 'video' : 'photo',
        title: uploadTitle || null, media_url: urlData.publicUrl,
        collected_by: window._currentTeamMemberId || null
      })

      var custChanges = { content_received: true, exclusive_access: true, exclusive_access_granted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      await supa.from('customers').update(custChanges).eq('id', item.customer_id)
      if (updateCustomerLocal) updateCustomerLocal(item.customer_id, custChanges)

      setShowUploadModal(null)
      setUploadFile(null)
      setUploadTitle('')
      alert('Content uploaded successfully!')
    } catch (err) { console.error('Upload error:', err); alert('Upload failed: ' + err.message) }
    finally { setUploading(false) }
  }, [showUploadModal, uploadFile, uploadTitle, updateCustomerLocal])

  /* ── add review from stylist side ── */

  var handleAddReview = useCallback(async function() {
    if (!showReviewModal) return
    setReviewSaving(true)
    try {
      var item = showReviewModal
      await supa.from('customer_content').insert({
        customer_id: item.customer_id, buyer_id: item.buyer_id,
        content_type: 'google_review', title: 'Google Review',
        star_rating: reviewRating, review_text: reviewText || null,
        collected_by: window._currentTeamMemberId || null
      })

      var custChanges = { review_received: true, exclusive_access: true, exclusive_access_granted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      await supa.from('customers').update(custChanges).eq('id', item.customer_id)
      if (updateCustomerLocal) updateCustomerLocal(item.customer_id, custChanges)

      setShowReviewModal(null)
      setReviewRating(5)
      setReviewText('')
      alert('Review recorded!')
    } catch (err) { console.error('Review error:', err); alert('Failed: ' + err.message) }
    finally { setReviewSaving(false) }
  }, [showReviewModal, reviewRating, reviewText, updateCustomerLocal])

  /* ── manual add customer to queue ── */

  var manualAddToQueue = useCallback(async function(cust) {
    try {
      var buyer = buyers.find(function(b) { return b.id === cust.buyer_id })
      var name = (buyer || {}).name || cust.name
      var phone = (buyer || {}).phone || cust.phone || ''
      var todayStr = new Date().toISOString().split('T')[0]

      var { data: inserted, error } = await supa.from('engagement_queue').insert({
        customer_id: cust.id, buyer_id: cust.buyer_id,
        trigger_type: 'manual', priority: 'medium', scheduled_date: todayStr,
        assigned_to: window._currentTeamMemberId || null,
        reason: 'Manually added to queue',
        suggestion: 'Follow up with ' + name + '. Total spend: ' + fmt(cust.total_spend || 0) + ', ' + (cust.total_orders || 0) + ' orders.',
        context_json: { name: name, phone: phone, tier: cust.customer_type, spend: cust.total_spend, orders: cust.total_orders }
      }).select().single()

      if (error) throw error
      if (inserted) setQueue(function(prev) { return prev.concat([inserted]) })
      setSearchQuery('')
      setShowManualAdd(false)
    } catch (err) { console.error('Manual add error:', err); alert('Failed: ' + err.message) }
  }, [buyers])

  /* ── skip item ── */

  var skipItem = useCallback(async function(item) {
    await supa.from('engagement_queue').update({ status: 'skipped' }).eq('id', item.id)
    setQueue(function(prev) { return prev.filter(function(q) { return q.id !== item.id }) })
  }, [])

  /* ── fetch unreached customers ── */

  var fetchUnreached = useCallback(async function() {
    setUnreachedLoading(true)
    try {
      var fromDate = dateRangeFrom || new Date(new Date().setDate(new Date().getDate() - 90)).toISOString().split('T')[0]
      var toDate = dateRangeTo || new Date().toISOString().split('T')[0]

      // Get all "self" customers who haven't been contacted in the date range
      var enriched = customers.filter(function(c) {
        if (c.relationship !== 'self' || c.do_not_contact) return false
        // Not contacted at all, or last contacted before the from date
        if (!c.last_contacted_at) return true
        return c.last_contacted_at.split('T')[0] < fromDate
      }).map(function(c) {
        var buyer = buyers.find(function(b) { return b.id === c.buyer_id })
        return {
          ...c,
          buyerName: (buyer || {}).name || c.name,
          buyerPhone: (buyer || {}).phone || c.phone || '',
          daysSinceContact: c.last_contacted_at
            ? Math.round((new Date() - new Date(c.last_contacted_at)) / (1000 * 60 * 60 * 24))
            : 999
        }
      })

      // Apply assign filter
      if (assignFilter !== 'all') {
        enriched = enriched.filter(function(c) {
          return String(c.assigned_stylist || '') === assignFilter || (!c.assigned_stylist && assignFilter === 'all')
        })
      }

      // Sort by days since contact (most dormant first)
      enriched.sort(function(a, b) { return b.daysSinceContact - a.daysSinceContact })

      setUnreachedCustomers(enriched.slice(0, 200))
    } catch (err) { console.error('Unreached fetch error:', err) }
    finally { setUnreachedLoading(false) }
  }, [customers, buyers, dateRangeFrom, dateRangeTo, assignFilter])

  /* ── fetch activity log ── */

  var fetchActivityLog = useCallback(async function() {
    setActivityLoading(true)
    try {
      var query = supa.from('customer_engagements').select('*')
        .order('completed_at', { ascending: false })
        .limit(500)

      if (dateRangeFrom) query = query.gte('completed_at', dateRangeFrom + 'T00:00:00')
      if (dateRangeTo) query = query.lte('completed_at', dateRangeTo + 'T23:59:59')

      var { data, error } = await query
      if (error) throw error
      setActivityLog(data || [])
    } catch (err) { console.error('Activity log fetch error:', err) }
    finally { setActivityLoading(false) }
  }, [dateRangeFrom, dateRangeTo])

  // Auto-fetch when switching sub-views
  useEffect(function() {
    if (subView === 'unreached') fetchUnreached()
    if (subView === 'activity') fetchActivityLog()
  }, [subView, fetchUnreached, fetchActivityLog])

  /* ── enriched queue ── */

  var enrichedQueue = useMemo(function() {
    return queue.map(function(q) {
      var ctx = q.context_json || {}
      var cust = customers.find(function(c) { return c.id === q.customer_id })
      var buyer = cust ? buyers.find(function(b) { return b.id === cust.buyer_id }) : null
      var assignedTm = q.assigned_to ? teamMembers.find(function(tm) { return String(tm.id) === String(q.assigned_to) }) : null
      return {
        ...q,
        customerName: ctx.name || (buyer || {}).name || '—',
        customerPhone: ctx.phone || (buyer || {}).phone || (cust || {}).phone || '',
        customerTier: ctx.tier || (cust || {}).customer_type || 'normal',
        customerSpend: ctx.spend || (cust || {}).total_spend || 0,
        customerOrders: ctx.orders || (cust || {}).total_orders || 0,
        customer: cust || null,
        assignedName: assignedTm ? assignedTm.name : null,
        lastOrderDate: ctx.last_order_date || null
      }
    }).filter(function(q) {
      if (assignFilter === 'all') return true
      // Show unassigned items to everyone + items assigned to the selected member
      if (!q.assigned_to) return true
      return String(q.assigned_to) === assignFilter
    })
  }, [queue, assignFilter, customers, buyers, teamMembers])

  /* ── stats ── */

  var stats = useMemo(function() {
    var todayStr = new Date().toISOString().split('T')[0]
    var high = enrichedQueue.filter(function(q) { return q.priority === 'high' }).length
    var callbacks = enrichedQueue.filter(function(q) { return q.callback_date }).length
    var todayCompleted = engagements.filter(function(e) {
      return e.status === 'completed' && e.completed_at && e.completed_at.split('T')[0] === todayStr
    }).length
    var contentCollected = engagements.filter(function(e) {
      return e.content_requested && e.completed_at && e.completed_at.split('T')[0] === todayStr
    }).length
    var reviewsCollected = engagements.filter(function(e) {
      return e.review_link_shared && e.completed_at && e.completed_at.split('T')[0] === todayStr
    }).length
    return { total: enrichedQueue.length, high: high, callbacks: callbacks, todayCompleted: todayCompleted, contentCollected: contentCollected, reviewsCollected: reviewsCollected }
  }, [enrichedQueue, engagements])

  /* ── enriched activity log ── */

  var enrichedActivity = useMemo(function() {
    return activityLog.map(function(e) {
      var cust = customers.find(function(c) { return c.id === e.customer_id })
      var buyer = cust ? buyers.find(function(b) { return b.id === cust.buyer_id }) : null
      var assignedTm = e.assigned_to ? teamMembers.find(function(tm) { return String(tm.id) === String(e.assigned_to) }) : null
      return {
        ...e,
        customerName: (buyer || {}).name || (cust || {}).name || '—',
        stylistName: assignedTm ? assignedTm.name : 'Unassigned',
        outcomeLabel: (OUTCOMES.find(function(o) { return o.value === e.outcome }) || {}).label || e.outcome || '—'
      }
    }).filter(function(e) {
      if (assignFilter === 'all') return true
      return String(e.assigned_to || '') === assignFilter
    })
  }, [activityLog, customers, buyers, teamMembers, assignFilter])

  /* ── sorted queue ── */

  var priorityOrder = { high: 0, medium: 1, low: 2 }
  var sortedQueue = useMemo(function() {
    return [].concat(enrichedQueue).sort(function(a, b) {
      return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
    })
  }, [enrichedQueue])

  /* ── helper: render objective pills for a customer ── */

  var renderObjectivePills = function(cust) {
    if (!cust) return null
    var hasOrders = (cust.total_orders || 0) > 0
    return (
      <div className="flex flex-wrap gap-1.5">
        {hasOrders && (
          <ObjectivePill
            icon="⭐"
            label={cust.review_received ? 'Review done' : 'Review needed'}
            variant={cust.review_received ? 'green' : 'orange'}
          />
        )}
        <ObjectivePill
          icon="📸"
          label={cust.content_received ? 'Content done' : 'Content needed'}
          variant={cust.content_received ? 'green' : 'orange'}
        />
        <ObjectivePill
          icon="🛍️"
          label="Resell opportunity"
          variant="blue"
        />
      </div>
    )
  }

  /* ── helper: render product names (clickable for image) ── */

  var renderProductNames = function(orderId, imgSource) {
    var items = (imgSource === 'modal' ? modalLineItems : orderLineItems)[orderId]
    var imgs = imgSource === 'modal' ? Object.assign({}, productImages, modalProductImages) : productImages
    if (!items || items.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {items.map(function(li, idx) {
          var prod = imgs[li.sku]
          var hasImage = prod && prod.image_url
          return (
            <button key={idx}
              onClick={hasImage ? function() { setLightboxImage({ url: prod.image_url, title: li.title || prod.title || li.sku }) } : undefined}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: hasImage ? '#eff6ff' : '#f0ebe3',
                color: hasImage ? '#2563eb' : '#807664',
                border: 'none',
                cursor: hasImage ? 'pointer' : 'default',
                textDecoration: hasImage ? 'underline' : 'none'
              }}>
              {li.title || li.sku || 'Item'}
            </button>
          )
        })}
      </div>
    )
  }

  /* ── helper: render order history (expanded card) ── */

  var renderOrderHistory = function(name) {
    var orders = customerOrders[name]
    if (!orders) return <div className="text-xs py-2" style={{ color: '#807664' }}>Loading orders…</div>
    if (orders.length === 0) return <div className="text-xs py-2" style={{ color: '#807664' }}>No orders found</div>
    return (
      <div className="space-y-2">
        {orders.map(function(o) {
          var date = o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
          return (
            <div key={o.id || o.order_number} className="px-3 py-2 rounded-lg" style={{ background: '#faf8f5' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-semibold" style={{ color: '#807664' }}>{o.order_number} · {date} · {o.channel || ''}</div>
                </div>
                <div className="text-xs font-bold" style={{ color: '#3d2e1c' }}>{fmt(o.total_price)}</div>
              </div>
              {renderProductNames(o.id, 'card')}
            </div>
          )
        })}
      </div>
    )
  }

  /* ── helper: render modal recent purchases ── */

  var renderModalPurchases = function() {
    if (modalOrders.length === 0) return <div className="text-xs py-2" style={{ color: '#807664' }}>Loading purchases…</div>
    return (
      <div className="space-y-2">
        {modalOrders.map(function(o) {
          var date = o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
          return (
            <div key={o.id || o.order_number} className="px-3 py-2 rounded-lg" style={{ background: '#faf8f5' }}>
              <div className="flex items-start justify-between">
                <div className="text-[10px] font-semibold" style={{ color: '#807664' }}>{o.order_number} · {date}</div>
                <div className="text-xs font-bold" style={{ color: '#3d2e1c' }}>{fmt(o.total_price)}</div>
              </div>
              {renderProductNames(o.id, 'modal')}
            </div>
          )
        })}
      </div>
    )
  }

  /* ═══════════════════════ RENDER ═══════════════════════ */

  var assignedName = assignFilter === 'all' ? 'All Team' :
    (teamMembers.find(function(tm) { return String(tm.id) === assignFilter }) || {}).name || 'Me'

  return (
    <div>
      {/* ── Per-Stylist Quick Filter ── */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        <span className="text-[10px] font-bold uppercase flex-shrink-0" style={{ color: '#807664' }}>Viewing:</span>
        <button onClick={function() { setAssignFilter('all') }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0 transition-all"
          style={{
            background: assignFilter === 'all' ? '#3d2e1c' : '#f0ebe3',
            color: assignFilter === 'all' ? '#fff' : '#3d2e1c',
            border: assignFilter === 'all' ? 'none' : '1px solid #d2c5b1'
          }}>
          All Team
        </button>
        {filterStylists(teamMembers).map(function(tm) {
          var isActive = String(tm.id) === assignFilter
          var isMe = String(tm.id) === window._currentTeamMemberId
          return (
            <button key={tm.id} onClick={function() { setAssignFilter(String(tm.id)) }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0 transition-all whitespace-nowrap"
              style={{
                background: isActive ? '#d4a843' : '#f0ebe3',
                color: isActive ? '#fff' : '#3d2e1c',
                border: isActive ? 'none' : '1px solid #d2c5b1'
              }}>
              {isMe ? '★ ' : ''}{tm.name}
            </button>
          )
        })}
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-5">
        <StatCard label="Total Queue" value={stats.total} color="#3d2e1c" />
        <StatCard label="High Priority" value={stats.high} color="#dc2626" />
        <StatCard label="Callbacks Due" value={stats.callbacks} color="#d97706" />
        <StatCard label="Completed Today" value={stats.todayCompleted} color="#2563eb" />
        <StatCard label="Content Collected" value={stats.contentCollected} color="#16a34a" />
        <StatCard label="Reviews Collected" value={stats.reviewsCollected} color="#d4a843" />
      </div>

      {/* ── Sub-View Pills ── */}
      <div className="flex items-center gap-2 mb-4">
        {[
          { id: 'queue', label: 'Queue', count: enrichedQueue.length },
          { id: 'unreached', label: 'Unreached' },
          { id: 'activity', label: 'Activity Log' }
        ].map(function(v) {
          var isActive = subView === v.id
          return (
            <button key={v.id} onClick={function() { setSubView(v.id); setActivityPage(1) }}
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              style={{
                background: isActive ? '#d4a843' : '#f0ebe3',
                color: isActive ? '#fff' : '#795900',
                border: isActive ? 'none' : '1px solid #d2c5b1'
              }}>
              {v.label}
              {v.count !== undefined && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: isActive ? 'rgba(255,255,255,0.25)' : '#d4a84320', color: isActive ? '#fff' : '#d4a843' }}>
                  {v.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Actions Row (Queue-specific) ── */}
      {subView === 'queue' && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative">
            <button onClick={function() { setShowDatePicker(!showDatePicker) }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, #795900, #d4a843)', opacity: generating ? 0.7 : 1 }}
              disabled={generating}>
              {generating ? '⏳ Generating…' : '🔄 Generate Queue (10)'}
            </button>
            {showDatePicker && (
              <div className="absolute top-full mt-1 left-0 z-30 p-4 rounded-xl shadow-lg" style={{ background: '#fff', border: '1px solid #eae8e4', minWidth: 280 }}>
                <div className="text-xs font-bold uppercase mb-3" style={{ color: '#807664' }}>Date Range for Queue</div>
                <div className="space-y-2 mb-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-semibold w-10" style={{ color: '#807664' }}>From</label>
                    <input type="date" value={dateRangeFrom} onChange={function(e) { setDateRangeFrom(e.target.value) }}
                      className="flex-1 px-2 py-1.5 rounded-lg text-xs border" style={{ borderColor: '#d2c5b1' }} />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-semibold w-10" style={{ color: '#807664' }}>To</label>
                    <input type="date" value={dateRangeTo} onChange={function(e) { setDateRangeTo(e.target.value) }}
                      className="flex-1 px-2 py-1.5 rounded-lg text-xs border" style={{ borderColor: '#d2c5b1' }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={function() { setShowDatePicker(false); generateQueue() }}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold text-white"
                    style={{ background: '#16a34a' }}>
                    Generate
                  </button>
                  <button onClick={function() { setDateRangeFrom(''); setDateRangeTo(''); setShowDatePicker(false); generateQueue() }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: '#f0ebe3', color: '#795900' }}>
                    Default (All)
                  </button>
                  <button onClick={function() { setShowDatePicker(false) }}
                    className="px-3 py-1.5 rounded-lg text-xs" style={{ color: '#807664' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          <button onClick={function() { setShowManualAdd(!showManualAdd) }}
            className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
            style={{ background: '#f0ebe3', color: '#795900', border: '1px solid #d2c5b1' }}>
            ➕ Add Customer
          </button>
        </div>
      )}

      {/* ── Date Range for Unreached / Activity Log ── */}
      {(subView === 'unreached' || subView === 'activity') && (
        <div className="flex items-center gap-3 mb-4 flex-wrap p-3 rounded-xl" style={{ background: '#faf8f5', border: '1px solid #eae8e4' }}>
          <span className="text-[10px] font-bold uppercase" style={{ color: '#807664' }}>📅 Date Range:</span>
          <input type="date" value={dateRangeFrom} onChange={function(e) { setDateRangeFrom(e.target.value) }}
            className="px-2 py-1.5 rounded-lg text-xs border" style={{ borderColor: '#d2c5b1' }} />
          <span className="text-xs" style={{ color: '#807664' }}>to</span>
          <input type="date" value={dateRangeTo} onChange={function(e) { setDateRangeTo(e.target.value) }}
            className="px-2 py-1.5 rounded-lg text-xs border" style={{ borderColor: '#d2c5b1' }} />
          <button onClick={function() { if (subView === 'unreached') fetchUnreached(); else fetchActivityLog() }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#d4a843' }}>
            Apply
          </button>
        </div>
      )}

      {/* ════════════════ QUEUE SUB-VIEW ════════════════ */}
      {subView === 'queue' && (<>

      {/* Manual Add — search customer */}
      {showManualAdd && (
        <div className="mb-4 p-4 rounded-xl" style={{ background: '#faf8f5', border: '1px solid #eae8e4' }}>
          <div className="text-xs font-bold uppercase mb-2" style={{ color: '#807664' }}>Search customer to add to queue</div>
          <input value={searchQuery} onChange={function(e) { setSearchQuery(e.target.value) }}
            className="w-full px-3 py-2 rounded-lg text-sm border mb-2" style={{ borderColor: '#d2c5b1' }}
            placeholder="Type customer name…" />
          {searchQuery.length >= 2 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {customers.filter(function(c) {
                if (c.relationship !== 'self') return false
                var buyer = buyers.find(function(b) { return b.id === c.buyer_id })
                var name = ((buyer || {}).name || c.name || '').toLowerCase()
                return name.indexOf(searchQuery.toLowerCase()) !== -1
              }).slice(0, 8).map(function(c) {
                var buyer = buyers.find(function(b) { return b.id === c.buyer_id })
                var name = (buyer || {}).name || c.name
                var phone = (buyer || {}).phone || c.phone || ''
                var inQueue = queue.some(function(q) { return q.customer_id === c.id })
                return (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: '#fff', border: '1px solid #eae8e4' }}>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: '#3d2e1c' }}>{name}</div>
                      <div className="text-xs" style={{ color: '#807664' }}>{phone} · {fmt(c.total_spend || 0)} · {c.total_orders || 0} orders</div>
                    </div>
                    {inQueue ? (
                      <span className="text-[10px] px-2 py-1 rounded-full font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>Already in queue</span>
                    ) : (
                      <button onClick={function() { manualAddToQueue(c) }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                        style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}>
                        Add to Queue
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Queue Cards */}
      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: '#807664' }}>Loading queue…</div>
      ) : sortedQueue.length === 0 ? (
        <div className="py-12 text-center rounded-xl" style={{ background: '#faf8f5', border: '1px solid #eae8e4' }}>
          <div className="text-sm font-semibold mb-2" style={{ color: '#3d2e1c' }}>Queue is empty</div>
          <div className="text-xs" style={{ color: '#807664' }}>Click "Generate Today's Queue" to populate based on customer data.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedQueue.map(function(item) {
            var p = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium
            var tierBadge = item.customerTier === 'royal' ? '👑' : item.customerTier === 'elite' ? '⭐' : item.customerTier === 'repeat' ? '🔵' : ''
            var isExpanded = expandedCard === item.id
            var cust = item.customer

            return (
              <div key={item.id} className="rounded-xl" style={{ background: '#fff', border: '1px solid #eae8e4' }}>
                <div className="p-4">
                  {/* Top row: Name + tier + trigger + assigned | Order info strip */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{p.dot}</span>
                        <span className="font-bold text-sm" style={{ color: '#3d2e1c' }}>{tierBadge} {item.customerName}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: p.bg, color: p.color }}>
                          {TRIGGER_LABELS[item.trigger_type] || item.trigger_type}
                        </span>
                        {item.assignedName && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: '#ede9fe', color: '#6d28d9' }}>
                            👤 {item.assignedName}
                          </span>
                        )}
                      </div>
                      {/* Phone number */}
                      {item.customerPhone && (
                        <div className="text-xs mt-0.5" style={{ color: '#807664', fontFamily: 'JetBrains Mono, monospace' }}>
                          📱 {item.customerPhone}
                        </div>
                      )}
                    </div>
                    {/* Order info strip */}
                    <div className="text-right flex-shrink-0 ml-3">
                      <div className="text-sm font-bold" style={{ color: '#3d2e1c' }}>{fmt(item.customerSpend)}</div>
                      <div className="text-[10px]" style={{ color: '#807664' }}>
                        {item.customerOrders > 0 ? item.customerOrders + ' order' + (item.customerOrders > 1 ? 's' : '') : 'No orders'}
                      </div>
                      <div className="text-[10px]" style={{ color: '#807664' }}>
                        {cust && cust.last_contacted_at ? 'Last: ' + new Date(cust.last_contacted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                      </div>
                    </div>
                  </div>

                  {/* Trigger reason */}
                  <div className="text-xs mb-2 font-semibold" style={{ color: p.color }}>{item.reason}</div>

                  {/* Suggestion */}
                  {item.suggestion && (
                    <div className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: '#faf8f5', color: '#807664' }}>
                      💡 {item.suggestion}
                    </div>
                  )}

                  {/* 3 Smart Objective Icons */}
                  <div className="mb-3">
                    {renderObjectivePills(cust)}
                  </div>

                  {/* Expand/collapse order history with product images */}
                  <button onClick={function() {
                    if (isExpanded) { setExpandedCard(null) }
                    else { setExpandedCard(item.id); fetchOrdersForCustomer(item.customerName) }
                  }} className="text-xs font-semibold mb-3 flex items-center gap-1"
                    style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    🛍️ {isExpanded ? 'Hide purchases' : 'What they bought'}
                    <span style={{ fontSize: 10 }}>{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {isExpanded && (
                    <div className="mb-3 pl-1">
                      {renderOrderHistory(item.customerName)}
                    </div>
                  )}

                  {/* Action buttons — row 1: primary actions */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <button onClick={function() { openOutcomeModal(item) }}
                      className="px-4 py-1.5 rounded-lg text-xs font-bold text-white"
                      style={{ background: '#16a34a' }}>
                      📞 Log Call
                    </button>
                    {item.customerPhone && (
                      <button onClick={function() { shareCustomerPage(item) }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background: '#dcfce7', color: '#16a34a' }}>
                        💬 Share Page
                      </button>
                    )}
                    <button onClick={function() { setShowUploadModal(item); setUploadFile(null); setUploadTitle('') }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: '#fef3c7', color: '#92400e' }}>
                      📸 Upload Content
                    </button>
                    <button onClick={function() { setShowReviewModal(item); setReviewRating(5); setReviewText('') }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: '#dbeafe', color: '#2563eb' }}>
                      ⭐ Add Review
                    </button>
                  </div>
                  {/* Action buttons — row 2: skip/done */}
                  <div className="flex items-center gap-2">
                    <button onClick={function() { skipItem(item) }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: '#f0ebe3', color: '#807664' }}>
                      Skip
                    </button>
                    <button onClick={function() { openOutcomeModal(item, 'interested_visit') }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto"
                      style={{ background: '#dbeafe', color: '#2563eb' }}>
                      Done ✓
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recent Engagements (compact, queue view only) */}
      {engagements.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm" style={{ color: '#3d2e1c' }}>Recent Engagements</h3>
            <button onClick={function() { setSubView('activity') }}
              className="text-xs font-semibold" style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}>
              View All →
            </button>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #eae8e4', background: '#fff' }}>
            {engagements.slice(0, 5).map(function(e, idx) {
              var cust = customers.find(function(c) { return c.id === e.customer_id })
              var buyer = cust ? buyers.find(function(b) { return b.id === cust.buyer_id }) : null
              var assignedTm = e.assigned_to ? teamMembers.find(function(tm) { return String(tm.id) === String(e.assigned_to) }) : null
              return (
                <div key={e.id} className="px-4 py-3 flex items-center justify-between"
                  style={{ borderBottom: idx < 4 ? '1px solid #f0ebe3' : 'none' }}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div>
                      <span className="text-sm font-semibold" style={{ color: '#3d2e1c' }}>{(buyer || {}).name || (cust || {}).name || '—'}</span>
                      <span className="text-xs ml-2" style={{ color: '#807664' }}>{TRIGGER_LABELS[e.trigger_type] || e.trigger_type || 'manual'}</span>
                    </div>
                    {assignedTm && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: '#ede9fe', color: '#6d28d9' }}>
                        👤 {assignedTm.name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-0.5 rounded"
                      style={{ background: e.status === 'completed' ? '#dcfce7' : '#fef3c7', color: e.status === 'completed' ? '#16a34a' : '#d97706' }}>
                      {e.outcome || e.status}
                    </span>
                    <span className="text-xs" style={{ color: '#807664' }}>{e.completed_at ? new Date(e.completed_at).toLocaleDateString() : ''}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      </>)}

      {/* ════════════════ UNREACHED SUB-VIEW ════════════════ */}
      {subView === 'unreached' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm" style={{ color: '#3d2e1c' }}>
              Unreached Customers
              <span className="text-xs font-normal ml-2" style={{ color: '#807664' }}>
                ({unreachedCustomers.length} customers not contacted{dateRangeFrom ? ' since ' + dateRangeFrom : ' in 90+ days'})
              </span>
            </h3>
          </div>
          {unreachedLoading ? (
            <div className="py-12 text-center text-sm" style={{ color: '#807664' }}>Loading unreached customers…</div>
          ) : unreachedCustomers.length === 0 ? (
            <div className="py-12 text-center rounded-xl" style={{ background: '#faf8f5', border: '1px solid #eae8e4' }}>
              <div className="text-sm font-semibold mb-2" style={{ color: '#3d2e1c' }}>No unreached customers found</div>
              <div className="text-xs" style={{ color: '#807664' }}>Try adjusting the date range or team member filter.</div>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #eae8e4', background: '#fff' }}>
              {/* Header */}
              <div className="hidden sm:grid sm:grid-cols-6 gap-2 px-4 py-2 text-[10px] font-bold uppercase"
                style={{ background: '#faf8f5', color: '#807664', borderBottom: '1px solid #eae8e4' }}>
                <div className="col-span-2">Customer</div>
                <div>Tier</div>
                <div>Total Spend</div>
                <div>Last Contact</div>
                <div>Action</div>
              </div>
              {unreachedCustomers.map(function(c, idx) {
                var tierBadge = c.customer_type === 'royal' ? '👑 Royal' : c.customer_type === 'elite' ? '⭐ Elite' : c.customer_type === 'repeat' ? '🔵 Repeat' : '⚪ Normal'
                var inQueue = queue.some(function(q) { return q.customer_id === c.id })
                return (
                  <div key={c.id} className="px-4 py-3 sm:grid sm:grid-cols-6 gap-2 flex flex-col sm:flex-row items-start sm:items-center"
                    style={{ borderBottom: idx < unreachedCustomers.length - 1 ? '1px solid #f0ebe3' : 'none' }}>
                    <div className="col-span-2">
                      <div className="text-sm font-semibold" style={{ color: '#3d2e1c' }}>{c.buyerName}</div>
                      <div className="text-xs" style={{ color: '#807664', fontFamily: 'JetBrains Mono, monospace' }}>{c.buyerPhone || '—'}</div>
                    </div>
                    <div className="text-xs font-semibold">{tierBadge}</div>
                    <div className="text-xs font-bold" style={{ color: '#3d2e1c' }}>{fmt(c.total_spend || 0)}</div>
                    <div className="text-xs" style={{ color: c.daysSinceContact > 180 ? '#dc2626' : '#807664' }}>
                      {c.last_contacted_at ? c.daysSinceContact + ' days ago' : 'Never contacted'}
                    </div>
                    <div>
                      {inQueue ? (
                        <span className="text-[10px] px-2 py-1 rounded-full font-semibold" style={{ background: '#fef3c7', color: '#92400e' }}>In queue</span>
                      ) : (
                        <button onClick={function() { manualAddToQueue(c) }}
                          className="px-3 py-1 rounded-lg text-[11px] font-bold text-white"
                          style={{ background: '#d4a843' }}>
                          + Add to Queue
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════ ACTIVITY LOG SUB-VIEW ════════════════ */}
      {subView === 'activity' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm" style={{ color: '#3d2e1c' }}>
              Activity Log
              <span className="text-xs font-normal ml-2" style={{ color: '#807664' }}>
                ({enrichedActivity.length} engagements)
              </span>
            </h3>
          </div>
          {activityLoading ? (
            <div className="py-12 text-center text-sm" style={{ color: '#807664' }}>Loading activity log…</div>
          ) : enrichedActivity.length === 0 ? (
            <div className="py-12 text-center rounded-xl" style={{ background: '#faf8f5', border: '1px solid #eae8e4' }}>
              <div className="text-sm font-semibold mb-2" style={{ color: '#3d2e1c' }}>No engagements found</div>
              <div className="text-xs" style={{ color: '#807664' }}>Try adjusting the date range or team member filter.</div>
            </div>
          ) : (
            <>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #eae8e4', background: '#fff' }}>
                {/* Header */}
                <div className="hidden sm:grid sm:grid-cols-7 gap-2 px-4 py-2 text-[10px] font-bold uppercase"
                  style={{ background: '#faf8f5', color: '#807664', borderBottom: '1px solid #eae8e4' }}>
                  <div>Date</div>
                  <div className="col-span-2">Customer</div>
                  <div>Stylist</div>
                  <div>Trigger</div>
                  <div>Outcome</div>
                  <div>Notes</div>
                </div>
                {enrichedActivity.slice((activityPage - 1) * ACTIVITY_PAGE_SIZE, activityPage * ACTIVITY_PAGE_SIZE).map(function(e, idx) {
                  var dateStr = e.completed_at ? new Date(e.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'
                  var timeStr = e.completed_at ? new Date(e.completed_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''
                  return (
                    <div key={e.id} className="px-4 py-3 sm:grid sm:grid-cols-7 gap-2 flex flex-col"
                      style={{ borderBottom: '1px solid #f0ebe3' }}>
                      <div>
                        <div className="text-xs font-semibold" style={{ color: '#3d2e1c' }}>{dateStr}</div>
                        <div className="text-[10px]" style={{ color: '#807664' }}>{timeStr}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-sm font-semibold" style={{ color: '#3d2e1c' }}>{e.customerName}</div>
                      </div>
                      <div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: '#ede9fe', color: '#6d28d9' }}>
                          {e.stylistName}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: '#f0ebe3', color: '#795900' }}>
                          {TRIGGER_LABELS[e.trigger_type] || e.trigger_type || 'manual'}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs px-2 py-0.5 rounded"
                          style={{
                            background: (e.outcome === 'interested_visit' || e.outcome === 'interested_info') ? '#dcfce7' :
                              e.outcome === 'no_answer' ? '#fef3c7' : e.outcome === 'dnc' ? '#fef2f2' : '#f0f9ff',
                            color: (e.outcome === 'interested_visit' || e.outcome === 'interested_info') ? '#16a34a' :
                              e.outcome === 'no_answer' ? '#d97706' : e.outcome === 'dnc' ? '#dc2626' : '#2563eb'
                          }}>
                          {e.outcomeLabel}
                        </span>
                      </div>
                      <div className="text-xs truncate" style={{ color: '#807664' }} title={e.notes || ''}>
                        {e.notes || '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Pagination */}
              {enrichedActivity.length > ACTIVITY_PAGE_SIZE && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button onClick={function() { setActivityPage(Math.max(1, activityPage - 1)) }}
                    disabled={activityPage === 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: '#f0ebe3', color: activityPage === 1 ? '#d2c5b1' : '#795900' }}>
                    ← Prev
                  </button>
                  <span className="text-xs font-semibold" style={{ color: '#807664' }}>
                    Page {activityPage} of {Math.ceil(enrichedActivity.length / ACTIVITY_PAGE_SIZE)}
                  </span>
                  <button onClick={function() { setActivityPage(Math.min(Math.ceil(enrichedActivity.length / ACTIVITY_PAGE_SIZE), activityPage + 1)) }}
                    disabled={activityPage >= Math.ceil(enrichedActivity.length / ACTIVITY_PAGE_SIZE)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: '#f0ebe3', color: activityPage >= Math.ceil(enrichedActivity.length / ACTIVITY_PAGE_SIZE) ? '#d2c5b1' : '#795900' }}>
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══ Outcome Modal ═══ */}
      {showOutcome && (
        <Modal onClose={function() { setShowOutcome(null) }} title={'Log Outcome — ' + (showOutcome.customerName || '—')}>
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>

            {/* Section 1: Recent Purchases with product images */}
            <div className="mb-5 pb-4" style={{ borderBottom: '1px solid #eae8e4' }}>
              <div className="text-xs font-bold uppercase mb-2" style={{ color: '#807664' }}>🛍️ Recent Purchases</div>
              {renderModalPurchases()}
            </div>

            {/* Section 2: Call outcome */}
            <div className="mb-5 pb-4" style={{ borderBottom: '1px solid #eae8e4' }}>
              <div className="text-xs font-bold uppercase mb-2" style={{ color: '#807664' }}>📞 Call Result</div>
              <div className="grid grid-cols-2 gap-2">
                {OUTCOMES.map(function(o) {
                  var isSelected = selectedOutcome === o.value
                  return (
                    <button key={o.value} onClick={function() { setSelectedOutcome(o.value) }} type="button"
                      className="p-2.5 rounded-lg text-left transition-all"
                      style={{
                        background: isSelected ? '#f0ebe3' : '#faf8f5',
                        border: isSelected ? '2px solid #d4a843' : '1px solid #eae8e4',
                        cursor: 'pointer'
                      }}>
                      <div className="text-xs font-semibold" style={{ color: '#3d2e1c' }}>{o.label}</div>
                      <div className="text-[10px]" style={{ color: '#807664' }}>→ {o.next}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Section 3: Quick toggles for Review & Content */}
            <div className="mb-5 pb-4" style={{ borderBottom: '1px solid #eae8e4' }}>
              <div className="text-xs font-bold uppercase mb-3" style={{ color: '#807664' }}>Quick Toggles</div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={reviewToggle}
                    onChange={function(e) { setReviewToggle(e.target.checked) }}
                    style={{ accentColor: '#d4a843', width: 16, height: 16 }} />
                  <span className="text-xs font-semibold" style={{ color: '#3d2e1c' }}>⭐ Review received?</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={contentToggle}
                    onChange={function(e) { setContentToggle(e.target.checked) }}
                    style={{ accentColor: '#d4a843', width: 16, height: 16 }} />
                  <span className="text-xs font-semibold" style={{ color: '#3d2e1c' }}>📸 Content received?</span>
                </label>
              </div>
            </div>

            {/* Section 4: Schedule Callback */}
            <div className="mb-5 pb-4" style={{ borderBottom: '1px solid #eae8e4' }}>
              <div className="text-xs font-bold uppercase mb-2" style={{ color: '#807664' }}>📅 Schedule Callback</div>
              <div className="flex items-start gap-3">
                <div>
                  <label className="text-[10px] font-semibold block mb-1" style={{ color: '#807664' }}>Date</label>
                  <input type="date" value={callbackDate}
                    onChange={function(e) { setCallbackDate(e.target.value) }}
                    className="px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: '#d2c5b1' }}
                    min={new Date().toISOString().split('T')[0]} />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-semibold block mb-1" style={{ color: '#807664' }}>Reason</label>
                  <input type="text" value={callbackReason}
                    onChange={function(e) { setCallbackReason(e.target.value) }}
                    className="w-full px-3 py-1.5 rounded-lg text-xs border" style={{ borderColor: '#d2c5b1' }}
                    placeholder="e.g. Follow up on new collection interest" />
                </div>
              </div>
              {callbackDate && (
                <div className="mt-2 text-[10px] font-semibold" style={{ color: '#16a34a' }}>
                  ✓ Will create a callback queue item for {callbackDate}
                </div>
              )}
            </div>

            {/* Section 5: Notes */}
            <div className="mb-4">
              <div className="text-xs font-bold uppercase mb-1" style={{ color: '#807664' }}>📝 Notes</div>
              <textarea value={outcomeNotes} onChange={function(e) { setOutcomeNotes(e.target.value) }}
                rows={2} className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#d2c5b1' }}
                placeholder="Any other notes from the call…" />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 pt-4" style={{ borderTop: '1px solid #eae8e4' }}>
            <button onClick={function() { setShowOutcome(null) }}
              className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ color: '#807664' }}>Cancel</button>
            <button onClick={logOutcome} disabled={saving || !selectedOutcome}
              className="px-6 py-2 rounded-xl text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #795900, #d4a843)', opacity: (!selectedOutcome || saving) ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Log Outcome'}
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Upload Content Modal ═══ */}
      {showUploadModal && (
        <Modal onClose={function() { setShowUploadModal(null) }} title={'📸 Upload Content — ' + (showUploadModal.customerName || '—')} width={440}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: '#807664' }}>File (photo or video)</label>
              <input type="file" accept="image/*,video/*"
                onChange={function(e) { setUploadFile(e.target.files ? e.target.files[0] : null) }}
                className="w-full text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: '#807664' }}>Caption (optional)</label>
              <input value={uploadTitle} onChange={function(e) { setUploadTitle(e.target.value) }}
                className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#d2c5b1' }}
                placeholder="e.g. Wedding reception look" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={function() { setShowUploadModal(null) }}
              className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ color: '#807664' }}>Cancel</button>
            <button onClick={handleUploadContent} disabled={uploading || !uploadFile}
              className="px-6 py-2 rounded-xl text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #795900, #d4a843)', opacity: (!uploadFile || uploading) ? 0.6 : 1 }}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Add Review Modal ═══ */}
      {showReviewModal && (
        <Modal onClose={function() { setShowReviewModal(null) }} title={'⭐ Add Review — ' + (showReviewModal.customerName || '—')} width={440}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold block mb-2" style={{ color: '#807664' }}>Star Rating</label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(function(star) {
                  return (
                    <button key={star} onClick={function() { setReviewRating(star) }} type="button"
                      className="text-2xl transition-all hover:scale-110"
                      style={{ color: star <= reviewRating ? '#d4a843' : '#d2c5b1', cursor: 'pointer', background: 'none', border: 'none', padding: '2px' }}>
                      ★
                    </button>
                  )
                })}
                <span className="text-xs ml-2 font-semibold" style={{ color: '#807664' }}>{reviewRating}/5</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: '#807664' }}>Review text (optional)</label>
              <textarea value={reviewText} onChange={function(e) { setReviewText(e.target.value) }}
                rows={3} className="w-full px-3 py-2 rounded-lg text-sm border" style={{ borderColor: '#d2c5b1' }}
                placeholder="What did the customer say about their experience…" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={function() { setShowReviewModal(null) }}
              className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ color: '#807664' }}>Cancel</button>
            <button onClick={handleAddReview} disabled={reviewSaving}
              className="px-6 py-2 rounded-xl text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #795900, #d4a843)', opacity: reviewSaving ? 0.6 : 1 }}>
              {reviewSaving ? 'Saving…' : 'Save Review'}
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Product Image Lightbox ═══ */}
      {lightboxImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={function() { setLightboxImage(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl p-4 max-w-md w-full"
            onClick={function(e) { e.stopPropagation() }}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold" style={{ color: '#3d2e1c' }}>{lightboxImage.title || 'Product'}</div>
              <button onClick={function() { setLightboxImage(null) }}
                className="text-lg font-bold px-2" style={{ color: '#807664', background: 'none', border: 'none', cursor: 'pointer' }}>
                ×
              </button>
            </div>
            <img src={lightboxImage.url} alt={lightboxImage.title || 'Product'}
              className="w-full rounded-xl" style={{ maxHeight: '60vh', objectFit: 'contain' }} />
          </div>
        </div>
      )}
    </div>
  )
}

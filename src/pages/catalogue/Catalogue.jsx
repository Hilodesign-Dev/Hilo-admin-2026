import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa, fetchAllProducts } from '../../lib/supabase'
import { productToSnake, productToCamel } from '../../lib/caseMapping'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, calcCogs, calcPieceCogs, effectiveSP, gmPct, nextId, statusColor } from '../../lib/helpers'
import { CATEGORIES } from '../../lib/constants'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import ProductForm from './ProductForm'
import ProductView from './ProductView'
import ShopifySyncModal from './ShopifySyncModal'
import OfferModal from '../offers/OfferModal'
import AuditStamp from '../../components/AuditStamp'
import QuickEntry from './QuickEntry'

var ROLE_DISPLAY = { founder:'Founder', admin:'Admin', operations_manager:'Operations Manager', production_manager:'Production Manager', stylist:'Stylist', designer:'Designer', growth_manager:'Growth Manager', tailor_lead:'Tailor Lead', fulfillment_ops:'Fulfillment Ops', finance:'Finance', intern:'Intern', custom:'Custom', staff:'Staff' }

// ── Review status helpers ───────────────────────────────────────────────────
var REVIEW_CHIP = {
  pending_entry: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Pending' },
  in_review:     { bg: 'bg-amber-50', text: 'text-amber-700', label: 'In Review' },
  finalized:     { bg: 'bg-green-50', text: 'text-green-700', label: 'Finalized' },
  rejected:      { bg: 'bg-red-50',   text: 'text-red-600',   label: 'Rejected' },
}
function reviewChip(status) {
  var c = REVIEW_CHIP[status] || REVIEW_CHIP.pending_entry
  return c
}

var emptyProduct = function() {
  return {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(),
    styleCode: '', productTitle: '', productName: '', category: 'Kurta',
    isSet: false, setComponents: [], fabricName: '', fabricSKU: '', fabricDesc: '', description: '',
    metres: '', costPerMetre: '', embroidery: '', embroidery_type: '', dyePerMetre: '', stitching: '',
    bottomCogs: '', accessories: '', mrp: '', sellingPrice: '', discount: '',
    colourPrimary: '', colourSecondary: '', styleTag: '', occasionTag: '', fabricTag: '',
    washCare: 'Dry Cleaning only', hsn: '62114210', status: 'Active', weight: '', sleeveDesc: '', fabricId: '', dyeId: '',
    image_url: '', shopify_images: [], shopify_product_id: '',
    cogs_review_status: 'pending_entry',
  }
}

var Catalogue = function({ products, setProducts, fabrics, stitchingMaster, dyes, categories, consumption, onGoToOffers }) {
  var [search, setSearch] = useState('')
  var [catFilter, setCatFilter] = useState('All')
  var [statusFilter, setStatusFilter] = useState('All')
  var [lightbox, setLightbox] = useState(null)
  var [setFilter, setSetFilter] = useState('All')
  var [sortBy, setSortBy] = useState('default')
  var [reviewTab, setReviewTab] = useState('all')
  var [viewMode, setViewMode] = useState('cards')
  var [tagFilter, setTagFilter] = useState('All')
  var [page, setPage] = useState(1)
  var [modal, setModal] = useState(null)
  var [selected, setSelected] = useState(null)
  var [bulkSelected, setBulkSelected] = useState({})
  var [rejectId, setRejectId] = useState(null)
  var [rejectNote, setRejectNote] = useState('')
  var [actionLoading, setActionLoading] = useState(null)
  var PAGE_SIZE = 20

  // Normalize shopify_tags — strip surrounding quotes AND brackets from each tag
  var parseTags = function(raw) {
    var arr = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw ? raw.split(',').map(function(t) { return t.trim() }) : [])
    return arr.map(function(t) { return t.replace(/^[\["'\s]+|[\]"'\s]+$/g, '').trim() }).filter(Boolean)
  }

  // Build category→tags lookup from Masters. Always include category name so
  // auto-synced Shopify product_type rows (empty shopify_tag) still match.
  var catTagMap = useMemo(function() {
    var map = {}
    ;(categories || []).forEach(function(c) {
      if (!c.name) return
      var fromShopify = c.shopify_tag
        ? c.shopify_tag.split(',').map(function(t) { return t.trim().toLowerCase() }).filter(Boolean)
        : []
      map[c.name] = Array.from(new Set(fromShopify.concat([String(c.name).toLowerCase()])))
    })
    return map
  }, [categories])
  var productMatchesCat = function(p, cat) {
    var tags = parseTags(p.shopify_tags).map(function(t) { return t.toLowerCase() })
    var productCat = String(p.category || p.product_type || '').trim().toLowerCase()
    var matchesNamed = function(catName) {
      var keys = catTagMap[catName] || [String(catName).toLowerCase()]
      if (productCat && keys.indexOf(productCat) !== -1) return true
      return keys.some(function(k) { return tags.indexOf(k) !== -1 })
    }
    if (cat === 'Other') {
      var names = (categories || []).map(function(c) { return c.name }).filter(Boolean)
      return !names.some(function(name) { return matchesNamed(name) })
    }
    return matchesNamed(cat)
  }

  // All unique tags
  var allTags = useMemo(function() {
    var tagSet = new Set()
    products.forEach(function(p) { parseTags(p.shopify_tags).forEach(function(t) { if (t) tagSet.add(t) }) })
    return ['All', ...Array.from(tagSet).sort()]
  }, [products])

  // Review tab counts
  var reviewCounts = useMemo(function() {
    var counts = { all: products.length, pending: 0, in_review: 0, finalized: 0 }
    products.forEach(function(p) {
      var rs = p.cogs_review_status || 'pending_entry'
      if (rs === 'pending_entry' || rs === 'rejected') counts.pending++
      else if (rs === 'in_review') counts.in_review++
      else if (rs === 'finalized') counts.finalized++
    })
    return counts
  }, [products])

  var filtered = useMemo(function() {
    var list = products.filter(function(p) {
      // Review tab filter
      var rs = p.cogs_review_status || 'pending_entry'
      if (reviewTab === 'pending' && rs !== 'pending_entry' && rs !== 'rejected') return false
      if (reviewTab === 'in_review' && rs !== 'in_review') return false
      if (reviewTab === 'finalized' && rs !== 'finalized') return false
      // Standard filters — applied on ALL tabs
      if (catFilter !== 'All' && !productMatchesCat(p, catFilter)) return false
      if (statusFilter !== 'All' && p.status !== statusFilter) return false
      if (setFilter === 'Sets' && !p.isSet) return false
      if (setFilter === 'Singles' && p.isSet) return false
      if (tagFilter !== 'All' && !parseTags(p.shopify_tags).includes(tagFilter)) return false
      if (search) {
        var q = search.toLowerCase()
        return (p.styleCode||'').toLowerCase().includes(q) ||
               (p.productName||'').toLowerCase().includes(q) ||
               (p.productTitle||'').toLowerCase().includes(q) ||
               (p.colourPrimary||'').toLowerCase().includes(q) ||
               (p.fabricName||'').toLowerCase().includes(q) ||
               (p.handle||'').toLowerCase().includes(q) ||
               (p.vendor||'').toLowerCase().includes(q) ||
               parseTags(p.shopify_tags).some(function(t) { return t.toLowerCase().includes(q) })
      }
      return true
    })
    if (sortBy !== 'default') {
      list = [...list].sort(function(a, b) {
        var cogsA = calcCogs(a), cogsB = calcCogs(b)
        var spA = a.sellingPrice || a.mrp, spB = b.sellingPrice || b.mrp
        var gmA = gmPct(spA, cogsA, a.mrp), gmB = gmPct(spB, cogsB, b.mrp)
        if (sortBy === 'gm_desc') return gmB - gmA
        if (sortBy === 'gm_asc') return gmA - gmB
        if (sortBy === 'mrp_desc') return b.mrp - a.mrp
        if (sortBy === 'mrp_asc') return a.mrp - b.mrp
        if (sortBy === 'cogs_desc') return cogsB - cogsA
        if (sortBy === 'cogs_asc') return cogsA - cogsB
        return 0
      })
    }
    return list
  }, [products, search, catFilter, statusFilter, setFilter, sortBy, reviewTab, tagFilter])

  var paged = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)
  var totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  // ── Refresh helper ──────────────────────────────────────────────────────
  var refreshProducts = async function() {
    var data = await fetchAllProducts()
    if (data) setProducts(data.map(productToCamel))
  }

  // ── COGS Review Actions ─────────────────────────────────────────────────
  var submitForReview = async function(productId) {
    setActionLoading(productId)
    try {
      var { error } = await supa.from('design_products').update({
        cogs_review_status: 'in_review',
        cogs_entered_by: window._currentUserEmail || window._currentUserName || 'unknown',
        cogs_entered_at: new Date().toISOString(),
        cogs_rejection_note: null,
      }).eq('id', productId)
      if (error) throw error
      await refreshProducts()
    } catch (e) { console.error('Submit for review error:', e); alert('Failed: ' + e.message) }
    setActionLoading(null)
  }

  var finalizeProduct = async function(productId) {
    setActionLoading(productId)
    try {
      var { error } = await supa.from('design_products').update({
        cogs_review_status: 'finalized',
        cogs_finalized_by: window._currentUserEmail || window._currentUserName || 'unknown',
        cogs_finalized_at: new Date().toISOString(),
      }).eq('id', productId)
      if (error) throw error
      await refreshProducts()
    } catch (e) { console.error('Finalize error:', e); alert('Failed: ' + e.message) }
    setActionLoading(null)
  }

  var rejectProduct = async function(productId, note) {
    setActionLoading(productId)
    try {
      var { error } = await supa.from('design_products').update({
        cogs_review_status: 'rejected',
        cogs_rejection_note: note,
        cogs_finalized_by: null,
        cogs_finalized_at: null,
      }).eq('id', productId)
      if (error) throw error
      setRejectId(null)
      setRejectNote('')
      await refreshProducts()
    } catch (e) { console.error('Reject error:', e); alert('Failed: ' + e.message) }
    setActionLoading(null)
  }

  var unlockCogs = async function(productId) {
    if (!confirm('Unlock COGS for re-editing? Status will reset to Pending.')) return
    setActionLoading(productId)
    try {
      var { error } = await supa.from('design_products').update({
        cogs_review_status: 'pending_entry',
        cogs_finalized_by: null,
        cogs_finalized_at: null,
        cogs_rejection_note: null,
      }).eq('id', productId)
      if (error) throw error
      await refreshProducts()
    } catch (e) { console.error('Unlock error:', e); alert('Failed: ' + e.message) }
    setActionLoading(null)
  }

  var bulkFinalize = async function() {
    var ids = Object.keys(bulkSelected).filter(function(id) { return bulkSelected[id] })
    if (ids.length === 0) return
    if (!confirm('Finalize ' + ids.length + ' product(s)?')) return
    setActionLoading('bulk')
    try {
      var { error } = await supa.from('design_products').update({
        cogs_review_status: 'finalized',
        cogs_finalized_by: window._currentUserEmail || window._currentUserName || 'unknown',
        cogs_finalized_at: new Date().toISOString(),
      }).in('id', ids)
      if (error) throw error
      setBulkSelected({})
      await refreshProducts()
    } catch (e) { console.error('Bulk finalize error:', e); alert('Failed: ' + e.message) }
    setActionLoading(null)
  }

  // ── Save / Delete (existing) ────────────────────────────────────────────
  var saveProduct = async function(prod) {
    if (!prod.styleCode?.trim()) { alert('Style code is required.'); return }
    if (!prod.productTitle?.trim() && !prod.productName?.trim()) { alert('Product name is required.'); return }
    if (!prod.mrp || +prod.mrp <= 0) { alert('MRP must be greater than zero.'); return }
    if (modal === 'add') {
      var dup = products.find(function(p) { return p.styleCode?.trim().toLowerCase() === prod.styleCode.trim().toLowerCase() })
      if (dup) { alert('Style code "' + prod.styleCode + '" already exists (' + (dup.productTitle || dup.productName) + ').'); return }
    }
    var userName = window._currentUserName || 'System'
    var userRole = window._currentUserRole || ''
    try {
      if (modal === 'add') {
        var id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString()
        var newProd = { ...prod, id: id, created_by: userName, created_by_role: userRole, created_at: new Date().toISOString(), cogs_review_status: 'pending_entry' }
        var row = productToSnake(newProd)
        var { error } = await supa.from('design_products').insert(row)
        if (error) throw error
        _logChange('create', 'product', prod.styleCode, prod.productTitle || prod.productName, {})
      } else {
        var existing = products.find(function(p) { return p.id === prod.id })
        var updatedProd = { ...prod, updated_by: userName, updated_by_role: userRole, updated_at: new Date().toISOString(), created_by: existing?.created_by || 'System', created_by_role: existing?.created_by_role || '', created_at: existing?.created_at || '' }
        var row = productToSnake(updatedProd)
        var { error } = await supa.from('design_products').update(row).eq('id', prod.id)
        if (error) throw error
        _logChange('update', 'product', prod.styleCode, prod.productTitle || prod.productName, {})
      }
      await refreshProducts()
    } catch (e) {
      console.error('[HILO] saveProduct error:', e)
      alert('Failed to save product: ' + (e.message || 'Unknown error'))
      return
    }
    setModal(null)
  }

  var deleteProduct = async function(id) {
    if (!confirm('Delete this product?')) return
    try {
      var { error } = await supa.from('design_products').delete().eq('id', id)
      if (error) throw error
      await refreshProducts()
    } catch (e) {
      console.error('[HILO] deleteProduct error:', e)
      alert('Failed to delete product: ' + (e.message || 'Unknown error'))
    }
  }

  // ── Derived data ────────────────────────────────────────────────────────
  // Use Masters categories (DB-driven) as the source of truth for the filter bar
  // Preserve group ordering: Occasion Wear → Urban Wear → Kids → Accessories → ungrouped → Other
  var groupOrder = ['Occasion Wear', 'Urban Wear', 'Kids', 'Accessories', '']
  var masterCatNames = (categories || []).length > 0
    ? (function() {
        var ordered = []
        groupOrder.forEach(function(grp) {
          ;(categories || []).filter(function(c) { return (c.group || '') === grp }).forEach(function(c) { if (c.name) ordered.push(c.name) })
        })
        ordered.push('Other')
        return ordered
      })()
    : [...new Set([...CATEGORIES, ...products.map(function(p) { return p.category }).filter(Boolean)])]
  var availableCats = ['All', ...masterCatNames]
  var activeFiltersCount = [catFilter !== 'All', statusFilter !== 'All', setFilter !== 'All', sortBy !== 'default', tagFilter !== 'All', reviewTab !== 'all', search !== ''].filter(Boolean).length

  // Bulk select helpers
  var allPageIds = paged.map(function(p) { return p.id })
  var allPageSelected = allPageIds.length > 0 && allPageIds.every(function(id) { return bulkSelected[id] })
  var anyBulkSelected = Object.values(bulkSelected).some(Boolean)

  var toggleBulk = function(id) {
    setBulkSelected(function(prev) { var next = { ...prev }; next[id] = !next[id]; return next })
  }
  var toggleBulkAll = function() {
    setBulkSelected(function(prev) {
      var next = { ...prev }
      if (allPageSelected) { allPageIds.forEach(function(id) { delete next[id] }) }
      else { allPageIds.forEach(function(id) { next[id] = true }) }
      return next
    })
  }

  // Clear bulk selection when switching tabs
  useEffect(function() { setBulkSelected({}) }, [reviewTab])

  // ── Review status chip component ────────────────────────────────────────
  // Extract short name from email: "sahith@hilodesign.co" → "Sahith"
  var shortName = function(email) {
    if (!email) return ''
    var name = email.split('@')[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  var StatusChip = function({ status, product }) {
    var c = reviewChip(status)
    var enteredBy = product && product.cogs_entered_by ? shortName(product.cogs_entered_by) : ''
    var finalizedBy = product && product.cogs_finalized_by ? shortName(product.cogs_finalized_by) : ''
    return (
      <div className="text-center">
        <span className={'px-2 py-0.5 rounded-full text-[10px] font-semibold inline-block ' + c.bg + ' ' + c.text}>{c.label}</span>
        {(status === 'in_review' || status === 'finalized' || status === 'rejected') && enteredBy && (
          <div className="text-[9px] text-gray-400 mt-0.5 leading-tight" title={product.cogs_entered_by}>By {enteredBy}</div>
        )}
        {status === 'finalized' && finalizedBy && (
          <div className="text-[9px] text-green-600 mt-0.5 leading-tight" title={product.cogs_finalized_by}>✓ {finalizedBy}</div>
        )}
      </div>
    )
  }

  // ── RENDER ──────────────────────────────────────────────────────────────
  return (
    <div className="fade-in flex flex-col" style={{minHeight: 'calc(100vh - 60px)'}}>
      {/* Toolbar */}
      <div className="p-4 sm:p-6 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 style={{fontFamily:"Manrope,sans-serif",fontSize:"1.75rem",fontWeight:800,letterSpacing:"-0.02em",color:"#1b1c1a",lineHeight:1.1}}>Catalogue</h1>
            <p className="page-subtitle">{filtered.length} products</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={function() { setModal('shopify-sync') }}
              className="px-3 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all">
              <span className="text-base">🔄</span> <span className="hidden sm:inline">Sync from Shopify</span><span className="sm:hidden">Sync</span>
            </button>
            <button onClick={function() { setSelected(null); setModal('add') }}
              className="btn-gold px-3 sm:px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
              <Icon name="plus" cls="w-4 h-4" /> <span className="hidden sm:inline">Add Product</span><span className="sm:hidden">Add</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Icon name="search" cls="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input value={search} onChange={function(e) { setSearch(e.target.value); setPage(1) }}
            placeholder="Search style code, name, colour, fabric..."
            className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm" />
          {search && <button onClick={function() { setSearch('') }} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 text-xs">✕</button>}
        </div>

        {/* COGS Review tabs */}
        <div className="flex gap-1.5 mb-2 flex-wrap">
          {[
            { key: 'all', label: 'All', count: reviewCounts.all, style: 'btn-gold border-transparent' },
            { key: 'pending', label: 'Pending COGS', count: reviewCounts.pending, style: 'bg-gray-100 border-gray-300 text-gray-700' },
            { key: 'in_review', label: 'In Review', count: reviewCounts.in_review, style: 'bg-amber-50 border-amber-300 text-amber-700' },
            { key: 'finalized', label: 'Finalized', count: reviewCounts.finalized, style: 'bg-green-50 border-green-300 text-green-700' },
          ].map(function(tab) {
            return (
              <button key={tab.key} onClick={function() { setReviewTab(tab.key); setPage(1) }}
                className={'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ' +
                  (reviewTab === tab.key ? tab.style : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')
                }>
                {tab.label} <span className="ml-1 opacity-60">{tab.count}</span>
              </button>
            )
          })}
          {/* Bulk finalize button — only on In Review tab */}
          {reviewTab === 'in_review' && anyBulkSelected && (
            <button onClick={bulkFinalize} disabled={actionLoading === 'bulk'}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 transition-all border border-green-700 disabled:opacity-50 ml-auto">
              {actionLoading === 'bulk' ? '...' : '✓ Finalize Selected (' + Object.values(bulkSelected).filter(Boolean).length + ')'}
            </button>
          )}
          {/* View toggle — only on Pending tab */}
          {reviewTab === 'pending' && (
            <div className="flex items-center gap-0.5 ml-auto bg-gray-100 rounded-lg p-0.5">
              <button onClick={function() { setViewMode('cards') }}
                className={'px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ' + (viewMode === 'cards' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700')}>
                Card View
              </button>
              <button onClick={function() { setViewMode('quick') }}
                className={'px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ' + (viewMode === 'quick' ? 'bg-white shadow-sm text-amber-700' : 'text-gray-500 hover:text-gray-700')}>
                Quick Entry
              </button>
            </div>
          )}
        </div>

        {/* Category tabs — scrollable */}
        <div className="overflow-x-auto -mx-4 sm:mx-0 pb-1">
          <div className="flex gap-1.5 px-4 sm:px-0 min-w-max">
            {availableCats.map(function(c) {
              return (
                <button key={c} onClick={function() { setCatFilter(c); setPage(1) }}
                  className={'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ' + (catFilter === c ? 'btn-gold border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')}>
                  {c} {c !== 'All' && <span className="ml-1 opacity-60">{products.filter(function(p) { return productMatchesCat(p, c) }).length}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Filter row */}
        <div className="flex gap-2 mt-2 flex-wrap">
          <select value={statusFilter} onChange={function(e) { setStatusFilter(e.target.value); setPage(1) }}
            className={'border rounded-lg px-2.5 py-1.5 text-xs flex-shrink-0 ' + (statusFilter !== 'All' ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500')}>
            <option value="All">All Status</option>
            {['Active','Inactive'].map(function(s) { return <option key={s}>{s}</option> })}
          </select>
          <select value={setFilter} onChange={function(e) { setSetFilter(e.target.value); setPage(1) }}
            className={'border rounded-lg px-2.5 py-1.5 text-xs flex-shrink-0 ' + (setFilter !== 'All' ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500')}>
            <option value="All">Sets + Singles</option>
            <option value="Sets">Sets only</option>
            <option value="Singles">Singles only</option>
          </select>
          <select value={sortBy} onChange={function(e) { setSortBy(e.target.value); setPage(1) }}
            className={'border rounded-lg px-2.5 py-1.5 text-xs flex-shrink-0 ' + (sortBy !== 'default' ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500')}>
            <option value="default">Sort: Default</option>
            <option value="gm_desc">GM% ↓ High first</option>
            <option value="gm_asc">GM% ↑ Low first</option>
            <option value="mrp_desc">MRP ↓ High first</option>
            <option value="mrp_asc">MRP ↑ Low first</option>
            <option value="cogs_desc">COGS ↓ High first</option>
            <option value="cogs_asc">COGS ↑ Low first</option>
          </select>
          {allTags.length > 1 && (
            <select value={tagFilter} onChange={function(e) { setTagFilter(e.target.value); setPage(1) }}
              className={'border rounded-lg px-2.5 py-1.5 text-xs flex-shrink-0 ' + (tagFilter !== 'All' ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500')}>
              <option value="All">All Tags</option>
              {allTags.filter(function(t) { return t !== 'All' }).map(function(t) { return <option key={t} value={t}>{t}</option> })}
            </select>
          )}
          {activeFiltersCount > 0 && (
            <button onClick={function() { setCatFilter('All'); setStatusFilter('All'); setSetFilter('All'); setSortBy('default'); setTagFilter('All'); setReviewTab('all'); setSearch(''); setPage(1) }}
              className="text-xs text-red-500 hover:text-red-700 px-2 py-1.5 border border-red-200 rounded-lg bg-red-50">
              ✕ Clear filters ({activeFiltersCount})
            </button>
          )}
        </div>
      </div>

      {/* ── Quick Entry view (Pending tab only) ─────────────────────────── */}
      {reviewTab === 'pending' && viewMode === 'quick' && (
        <div className="mx-4 sm:mx-6 flex-1">
          <QuickEntry
            products={filtered}
            fabrics={fabrics}
            dyes={dyes}
            stitchingMaster={stitchingMaster}
            categories={categories}
            consumption={consumption}
            onRefresh={refreshProducts}
          />
        </div>
      )}

      {/* ── Mobile: Card list ────────────────────────────────────────────── */}
      {!(reviewTab === 'pending' && viewMode === 'quick') && <div className="sm:hidden px-4 space-y-3 flex-1">
        {paged.map(function(p) {
          var cogs = calcCogs(p)
          var sp = p.sellingPrice || p.mrp
          var effSP = effectiveSP(sp, p.mrp)
          var gm = gmPct(sp, cogs, p.mrp)
          var rs = p.cogs_review_status || 'pending_entry'
          return (
            <div key={p.id} className="product-card bg-white rounded-xl overflow-hidden" style={{boxShadow:'0 4px 16px rgba(27,28,26,0.06)'}} onClick={function() { setSelected(p); setModal('view') }}>
              {/* Card top: style code + badges */}
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <span style={{fontFamily:'Inter,sans-serif',fontSize:10,fontWeight:600,letterSpacing:'0.12em',color:'#795900',textTransform:'uppercase'}}>{p.styleCode}</span>
                <div className="flex items-center gap-2">
                  <StatusChip status={rs} product={p} />
                  {rs === 'rejected' && p.cogs_rejection_note && (
                    <span className="text-[10px] text-red-500" title={p.cogs_rejection_note}>⚠</span>
                  )}
                  {p.status && p.status !== 'Active' && <span className={'badge text-xs ' + statusColor(p.status)}>{p.status}</span>}
                  {p.image_url && (
                    <img src={p.image_url} alt="" className="w-9 h-9 rounded-full object-cover border-2 cursor-pointer flex-shrink-0"
                      style={{borderColor:'#d4a843'}}
                      onClick={function(e) { e.stopPropagation(); setLightbox(p.image_url) }}
                      onError={function(e) { e.target.style.display='none' }} />
                  )}
                </div>
              </div>
              {/* Product name */}
              <div className="px-4 pb-2">
                <div style={{fontFamily:'Manrope,sans-serif',fontSize:'0.95rem',fontWeight:700,color:'#1b1c1a',lineHeight:1.2}}>{p.productTitle || p.productName || '—'}</div>
                {p.colourPrimary && <div style={{fontSize:11,color:'#9c9b97',marginTop:2}}>{p.colourPrimary}</div>}
              </div>
              {/* Rejection note */}
              {rs === 'rejected' && p.cogs_rejection_note && (
                <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  ⚠ {p.cogs_rejection_note}
                </div>
              )}
              {/* Badges row */}
              <div className="flex gap-1.5 px-4 pb-3 flex-wrap">
                <span className="badge-gold text-xs">{p.category}</span>
                {p.isSet && <span className="badge bg-blue-50 text-blue-600 text-xs">Set {p.setComponents && p.setComponents.length > 0 ? '(' + p.setComponents.length + 'pcs)' : ''}</span>}
                {p.variants && p.variants.filter(function(v) { return v.active !== false }).length > 0 && <span className="badge bg-purple-50 text-purple-600 text-xs">{p.variants.filter(function(v) { return v.active !== false }).length} sizes</span>}
              </div>
              {/* Stats bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 text-center" style={{background:'#f5f4f0',padding:'8px 2px'}}>
                <div>
                  <div style={{fontSize:8,letterSpacing:'0.08em',color:'#9c9b97',textTransform:'uppercase',fontFamily:'Inter,sans-serif'}}>COGS</div>
                  <div style={{fontSize:10,fontWeight:700,color:'#494bd6',fontFamily:'Inter,sans-serif',marginTop:1}} className="sm:text-sm sm:mt-2">{cogs > 0 ? fmt(n(cogs).toFixed(0)) : '—'}</div>
                </div>
                <div>
                  <div style={{fontSize:8,letterSpacing:'0.08em',color:'#9c9b97',textTransform:'uppercase',fontFamily:'Inter,sans-serif'}}>MRP</div>
                  <div style={{fontSize:10,fontWeight:700,color:'#1b1c1a',fontFamily:'Inter,sans-serif',marginTop:1}} className="sm:text-sm sm:mt-2">{p.mrp > 0 ? fmt(p.mrp) : '—'}</div>
                </div>
                <div className="hidden sm:block">
                  <div style={{fontSize:8,letterSpacing:'0.08em',color:'#9c9b97',textTransform:'uppercase',fontFamily:'Inter,sans-serif'}}>Eff.SP</div>
                  <div style={{fontSize:10,fontWeight:700,color:'#494bd6',fontFamily:'Inter,sans-serif',marginTop:1}} className="sm:text-sm sm:mt-2">{effSP > 0 ? fmt(effSP.toFixed(0)) : '—'}</div>
                </div>
                <div>
                  <div style={{fontSize:8,letterSpacing:'0.08em',color:'#9c9b97',textTransform:'uppercase',fontFamily:'Inter,sans-serif'}}>GM%</div>
                  <div style={{fontSize:10,fontWeight:700,fontFamily:'Inter,sans-serif',marginTop:1,color: gm > 0.5 ? '#16a34a' : gm > 0.3 ? '#d97706' : '#dc2626'}} className="sm:text-sm sm:mt-2">{cogs > 0 ? (gm*100).toFixed(1) + '%' : '—'}</div>
                </div>
              </div>
              {/* Actions */}
              <div className="flex gap-2 px-4 py-3 flex-wrap" onClick={function(e) { e.stopPropagation() }}>
                <button onClick={function() { setSelected(p); setModal('edit') }} className="flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1" style={{background:'#f5f4f0',color:'#1b1c1a'}}>
                  <Icon name="edit" cls="w-3.5 h-3.5" /> Edit
                </button>
                {(rs === 'pending_entry' || rs === 'rejected') && cogs > 0 && (
                  <button onClick={function() { submitForReview(p.id) }} disabled={actionLoading === p.id}
                    className="px-3 py-2 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                    {actionLoading === p.id ? '...' : 'Submit for Review'}
                  </button>
                )}
                {rs === 'in_review' && (
                  <>
                    <button onClick={function() { finalizeProduct(p.id) }} disabled={actionLoading === p.id}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                      {actionLoading === p.id ? '...' : '✓ Finalize'}
                    </button>
                    <button onClick={function() { setRejectId(p.id); setRejectNote('') }}
                      className="px-3 py-2 rounded-lg text-xs font-bold bg-red-500 text-white hover:bg-red-600">
                      ✗ Reject
                    </button>
                  </>
                )}
                {rs === 'finalized' && (
                  <button onClick={function() { unlockCogs(p.id) }} disabled={actionLoading === p.id}
                    className="px-3 py-2 rounded-lg text-xs font-medium text-amber-700 disabled:opacity-50 flex items-center gap-1" style={{background:'#fef3c7'}}>
                    <Icon name="unlock" cls="w-3.5 h-3.5" /> Unlock
                  </button>
                )}
                <button onClick={function() { deleteProduct(p.id) }} className="px-3 py-2 rounded-lg text-xs text-red-400" style={{background:'#fff0f0'}}>
                  <Icon name="trash" cls="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        })}
        {paged.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">No products found</div>}
      </div>}

      {/* ── Desktop: Table ───────────────────────────────────────────────── */}
      {!(reviewTab === 'pending' && viewMode === 'quick') && <div className="hidden sm:block flex-1 mx-6">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              {reviewTab === 'in_review' && <col style={{width:36}} />}
              <col style={{width:'30%'}} />
              <col style={{width:'14%'}} />
              <col style={{width:'9%'}} />
              <col style={{width:'9%'}} />
              <col style={{width:'9%'}} />
              <col style={{width:'7%'}} />
              <col style={{width:'9%'}} />
              <col style={{width:'13%'}} />
            </colgroup>
            <thead className="sticky top-0" style={{background:'#f5f4f0'}}>
              <tr style={{borderBottom:'1px solid rgba(27,28,26,0.06)'}}>
                {reviewTab === 'in_review' && (
                  <th className="px-1 py-3 text-center">
                    <input type="checkbox" checked={allPageSelected} onChange={toggleBulkAll}
                      className="w-3.5 h-3.5 accent-amber-600 cursor-pointer" />
                  </th>
                )}
                {[
                  { label: 'Product', align: 'text-left' },
                  { label: 'Category', align: 'text-left' },
                  { label: 'COGS', align: 'text-right', highlight: true },
                  { label: 'MRP', align: 'text-right' },
                  { label: 'Eff. SP', align: 'text-right', highlight: true },
                  { label: 'GM%', align: 'text-right' },
                  { label: 'Review', align: 'text-center' },
                  { label: 'Actions', align: 'text-center' },
                ].map(function(h) {
                  return (
                    <th key={h.label} className={'px-2 py-3 ' + h.align}
                      style={{fontSize:9,letterSpacing:'0.1em',color: h.highlight ? '#494bd6' : '#9c9b97',fontFamily:'Inter,sans-serif',fontWeight:600,textTransform:'uppercase',whiteSpace:'nowrap'}}>{h.label}</th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {paged.map(function(p) {
                var cogs = calcCogs(p)
                var sp = p.sellingPrice || p.mrp
                var effSP = effectiveSP(sp, p.mrp)
                var gm = gmPct(sp, cogs, p.mrp)
                var rs = p.cogs_review_status || 'pending_entry'
                return (
                  <tr key={p.id} className="cursor-pointer" style={{borderBottom:'1px solid rgba(27,28,26,0.04)'}}
                    onMouseEnter={function(e) { e.currentTarget.style.background='#faf9f5' }}
                    onMouseLeave={function(e) { e.currentTarget.style.background='' }}
                    onClick={function() { setSelected(p); setModal('view') }}>
                    {reviewTab === 'in_review' && (
                      <td className="px-1 py-2.5 text-center" onClick={function(e) { e.stopPropagation() }}>
                        <input type="checkbox" checked={!!bulkSelected[p.id]} onChange={function() { toggleBulk(p.id) }}
                          className="w-3.5 h-3.5 accent-amber-600 cursor-pointer" />
                      </td>
                    )}
                    {/* ── Product: image + style code + name ── */}
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex-shrink-0" onClick={function(e) { e.stopPropagation() }}>
                          {p.image_url ? (
                            <img src={p.image_url} alt="" className="w-9 h-9 rounded-lg object-cover border cursor-pointer"
                              style={{borderColor:'#e5e2da'}}
                              onClick={function() { setLightbox(p.image_url) }}
                              onError={function(e) { e.target.style.display='none' }} />
                          ) : (
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{background:'#f5f4f0'}}>
                              <span style={{fontSize:12,color:'#c8c7c3'}}>📷</span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div style={{fontFamily:'Inter,sans-serif',fontSize:10,fontWeight:600,letterSpacing:'0.06em',color:'#795900',textTransform:'uppercase',lineHeight:1.2}}>{p.styleCode || '—'}</div>
                          <div style={{fontFamily:'Manrope,sans-serif',fontWeight:700,fontSize:13,color:'#1b1c1a',lineHeight:1.3}} className="truncate">{p.productTitle || p.productName || '—'}</div>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {p.colourPrimary && <span style={{fontSize:10,color:'#9c9b97'}}>{p.colourPrimary}</span>}
                            {p.status && p.status !== 'Active' && <span className={'badge text-[10px] ' + statusColor(p.status)}>{p.status}</span>}
                            {p.isOffer && <span className="badge text-[10px] bg-red-50 text-red-500 cursor-pointer hover:bg-red-100" onClick={function(e) { e.stopPropagation(); onGoToOffers && onGoToOffers() }}>Offer</span>}
                          </div>
                          {rs === 'rejected' && p.cogs_rejection_note && (
                            <div className="text-[9px] text-red-500 mt-0.5 truncate" title={p.cogs_rejection_note}>⚠ {p.cogs_rejection_note}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* ── Category ── */}
                    <td className="px-2 py-2.5">
                      <span className="badge-gold text-xs">{p.category}</span>
                      {p.isSet && <div className="mt-1"><span className="badge bg-blue-50 text-blue-600 text-[10px]">Set {p.setComponents && p.setComponents.length > 0 ? '(' + p.setComponents.length + 'pcs)' : ''}</span></div>}
                      {p.variants && p.variants.filter(function(v) { return v.active !== false }).length > 0 && <div className="mt-0.5"><span className="badge bg-purple-50 text-purple-600 text-[10px]">{p.variants.filter(function(v) { return v.active !== false }).length} sizes</span></div>}
                    </td>
                    <td className="px-2 py-2.5 text-right" style={{fontFamily:'Inter,sans-serif',fontWeight:600,fontSize:13,color:'#494bd6'}}>{cogs > 0 ? fmt(n(cogs).toFixed(0)) : '—'}</td>
                    <td className="px-2 py-2.5 text-right" style={{fontFamily:'Inter,sans-serif',fontWeight:600,fontSize:13,color:'#1b1c1a'}}>{p.mrp > 0 ? fmt(p.mrp) : '—'}</td>
                    <td className="px-2 py-2.5 text-right" style={{fontFamily:'Inter,sans-serif',fontWeight:600,fontSize:13,color:'#494bd6'}}>{effSP > 0 ? fmt(effSP.toFixed(0)) : '—'}</td>
                    <td className="px-2 py-2.5 text-right" style={{fontFamily:'Inter,sans-serif',fontWeight:700,fontSize:13,color: gm > 0.5 ? '#16a34a' : gm > 0.3 ? '#d97706' : '#dc2626'}}>{cogs > 0 ? (gm*100).toFixed(1) + '%' : '—'}</td>
                    {/* Review status chip */}
                    <td className="px-2 py-2.5 text-center"><StatusChip status={rs} product={p} /></td>
                    {/* Actions */}
                    <td className="px-2 py-2.5 text-center" onClick={function(e) { e.stopPropagation() }}>
                      <div className="flex gap-0.5 justify-center items-center flex-wrap">
                        {(rs === 'pending_entry' || rs === 'rejected') && cogs > 0 && (
                          <button onClick={function() { submitForReview(p.id) }} disabled={actionLoading === p.id}
                            className="px-1.5 py-1 rounded text-[9px] font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 whitespace-nowrap leading-tight"
                            title="Submit for Review">
                            {actionLoading === p.id ? '...' : 'Review'}
                          </button>
                        )}
                        {rs === 'in_review' && (
                          <>
                            <button onClick={function() { finalizeProduct(p.id) }} disabled={actionLoading === p.id}
                              className="p-1 rounded hover:bg-green-100 text-green-600" title="Finalize">
                              <span className="text-xs font-bold">✓</span>
                            </button>
                            <button onClick={function() { setRejectId(p.id); setRejectNote('') }}
                              className="p-1 rounded hover:bg-red-100 text-red-500" title="Reject">
                              <span className="text-xs font-bold">✗</span>
                            </button>
                          </>
                        )}
                        {rs === 'finalized' && (
                          <button onClick={function() { unlockCogs(p.id) }} disabled={actionLoading === p.id}
                            className="p-1 rounded hover:bg-amber-50 text-gray-400 hover:text-amber-600 disabled:opacity-50" title="Unlock COGS for re-editing">
                            <Icon name="unlock" cls="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={function() { setSelected(p); setModal('edit') }} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Edit"><Icon name="edit" cls="w-3.5 h-3.5" /></button>
                        <button onClick={function() { setSelected(p); setModal('offer') }}
                          className={'p-1 rounded hover:bg-gray-100 ' + (p.isOffer ? 'text-red-500' : 'text-gray-300 hover:text-red-500')}
                          title={p.isOffer ? 'Edit offer' : 'Tag as offer'}>
                          <Icon name="tag" cls="w-3 h-3" />
                        </button>
                        <button onClick={function() { deleteProduct(p.id) }} className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-red-500" title="Delete"><Icon name="trash" cls="w-3 h-3" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {paged.length === 0 && <div className="text-center py-16 text-gray-400">No products found</div>}
        </div>
      </div>}

      {/* Pagination */}
      {!(reviewTab === 'pending' && viewMode === 'quick') &&
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 text-sm text-gray-500">
        <div className="text-xs sm:text-sm">Showing {Math.min((page-1)*PAGE_SIZE+1, filtered.length)}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length}</div>
        <div className="flex gap-2">
          <button disabled={page === 1} onClick={function() { setPage(function(p) { return p-1 }) }} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 text-sm">←</button>
          <span className="px-2 py-1.5 text-sm">{page}/{totalPages || 1}</span>
          <button disabled={page >= totalPages} onClick={function() { setPage(function(p) { return p+1 }) }} className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 text-sm">→</button>
        </div>
      </div>}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {(modal === 'add' || modal === 'edit') && (
        <Modal title={modal === 'add' ? 'Add New Product' : 'Edit — ' + (selected?.styleCode || '')} onClose={function() { setModal(null) }} wide>
          <ProductForm product={modal === 'edit' ? selected : null} fabrics={fabrics} stitchingMaster={stitchingMaster} dyes={dyes} categories={categories} consumption={consumption} onSave={saveProduct} onClose={function() { setModal(null) }}
            onSubmitForReview={modal === 'edit' && selected ? function() { submitForReview(selected.id); setModal(null) } : null}
          />
        </Modal>
      )}
      {modal === 'view' && selected && (
        <Modal title={(selected.styleCode || '') + ' — ' + (selected.productTitle || selected.productName || '')} onClose={function() { setModal(null) }} wide>
          <ProductView product={selected} onEdit={function() { setModal('edit') }} />
        </Modal>
      )}
      {modal === 'offer' && selected && (
        <OfferModal product={selected} onSave={async function(updated) {
          try {
            var row = productToSnake(updated)
            await supa.from('design_products').update(row).eq('id', updated.id)
            await refreshProducts()
          } catch (e) {
            console.error('[HILO] Offer save error:', e)
            setProducts(products.map(function(p) { return p.id === updated.id ? updated : p }))
          }
          setModal(null)
        }} onClose={function() { setModal(null) }} />
      )}
      {modal === 'shopify-sync' && (
        <ShopifySyncModal products={products} setProducts={setProducts} categories={categories} onClose={function() { setModal(null) }} />
      )}

      {/* ── Reject Modal ─────────────────────────────────────────────────── */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(0,0,0,0.5)'}} onClick={function() { setRejectId(null) }}>
          <div className="bg-white rounded-2xl shadow-xl p-6 mx-4 w-full max-w-md" onClick={function(e) { e.stopPropagation() }}>
            <h3 className="text-lg font-bold mb-3" style={{color:'#1b1c1a'}}>Reject COGS</h3>
            <p className="text-sm text-gray-500 mb-3">Please provide a reason for rejection (min 5 characters):</p>
            <textarea value={rejectNote} onChange={function(e) { setRejectNote(e.target.value) }}
              placeholder="e.g. Embroidery cost seems too low — please verify with vendor"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[80px]" autoFocus />
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={function() { setRejectId(null); setRejectNote('') }}
                className="px-4 py-2 rounded-lg text-sm text-gray-600 border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={function() { rejectProduct(rejectId, rejectNote) }}
                disabled={rejectNote.trim().length < 5 || actionLoading === rejectId}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-red-500 text-white hover:bg-red-600 disabled:opacity-40">
                {actionLoading === rejectId ? '...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(0,0,0,0.85)'}} onClick={function() { setLightbox(null) }}>
          <div className="relative max-w-lg w-full mx-4">
            <img src={lightbox} alt="Product" className="w-full rounded-2xl object-contain max-h-screen" style={{maxHeight:'80vh'}} />
            <button className="absolute top-3 right-3 text-white/70 hover:text-white text-2xl font-light"
              onClick={function() { setLightbox(null) }}>✕</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Catalogue

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, fmtDate, stageColor, PRODUCTION_STAGES, SIZES, DELIVERY_TYPES, MARKETPLACE_CHANNELS } from '../../lib/designTokens'
import {
  ACTIVE_PRODUCTION_STAGES,
  RETURN_PRODUCTION_STAGES,
  ARCHIVE_PRODUCTION_STAGES,
} from '../../lib/stateMachine'
import { useOrders } from '../../context/OrdersContext'
import ProductionList from './ProductionList'
import ProductionDetail from './ProductionDetail'
import ProductionSummary from './ProductionSummary'
import ProductionDashboard from './ProductionDashboard'
import EditProductionModal from './EditProductionModal'

const PAGE_SIZE = 25

const ORDER_TYPES = ['General', 'Custom']
const URGENCY_LEVELS = ['Urgent', 'Very Important', 'Other']
const SEARCH_TYPES = [
  { key: 'order_number', label: 'Order ID' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'customer_email', label: 'Email' },
  { key: 'product_name', label: 'Product Name' },
]

const ProductionTab = ({ user, products, fabrics, dyes }) => {
  const ctx = useOrders()

  // ── State ────────────────────────────────────────────────────
  const [subView, setSubView] = useState('list')
  const [items, setItems] = useState([])
  const [orders, setOrders] = useState({})
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedInitialTab, setSelectedInitialTab] = useState(null)
  const [editingItem, setEditingItem] = useState(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [searchType, setSearchType] = useState('order_number')
  const [filterStage, setFilterStage] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [filterDeliveryType, setFilterDeliveryType] = useState('')
  const [filterUrgency, setFilterUrgency] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStylist, setFilterStylist] = useState('')
  const [filterProductExec, setFilterProductExec] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [subTab, setSubTab] = useState(() => {
    try { return sessionStorage.getItem('hilo_prod_subtab') || 'active' } catch { return 'active' }
  })
  const [filterChannel, setFilterChannel] = useState(() => {
    try { return sessionStorage.getItem('hilo_prod_channel') || 'all' } catch { return 'all' }
  })
  const onSubTabChange = (v) => {
    setSubTab(v); try { sessionStorage.setItem('hilo_prod_subtab', v) } catch {}; setPage(0)
    // Clear line-level filters on sub-tab change; keep channel.
    setFilterStage(''); setFilterVendor(''); setFilterDeliveryType('')
    setFilterUrgency(''); setFilterType(''); setFilterStylist(''); setFilterProductExec('')
    setSearchQuery(''); setDebouncedSearchQuery('')
  }
  const onChannelChange = (v) => { setFilterChannel(v); try { sessionStorage.setItem('hilo_prod_channel', v) } catch {}; setPage(0) }

  const searchTimer = useRef(null)
  const reqIdRef = useRef(0)

  // ── Fetch production items ───────────────────────────────────
  const fetchItems = useCallback(async (pg) => {
    const myReq = ++reqIdRef.current
    setLoading(true)
    try {
      // For channel filter, pre-filter order IDs from shopify_orders
      let orderIdFilter = null
      if (filterChannel !== 'all') {
        let oq = supa.from('shopify_orders').select('id')
        if (filterChannel === 'online')        oq = oq.eq('channel', 'Online')
        else if (filterChannel === 'assist')   oq = oq.eq('channel', 'Online Assist')
        else if (filterChannel === 'in_store') oq = oq.eq('channel', 'In-store')
        else if (filterChannel === 'marketplaces') oq = oq.in('channel', MARKETPLACE_CHANNELS)
        const { data: oids } = await oq
        orderIdFilter = (oids || []).map(o => o.id)
        if (orderIdFilter.length === 0) { if (myReq === reqIdRef.current) { setItems([]); setTotalCount(0); setLoading(false); } return }
      }

      // For customer name/email search, also pre-filter via orders
      if (debouncedSearchQuery && debouncedSearchQuery.length >= 2 && (searchType === 'customer_name' || searchType === 'customer_email')) {
        const col = searchType === 'customer_name' ? 'customer_name' : 'customer_email'
        const { data: oids } = await supa.from('shopify_orders').select('id').ilike(col, `%${debouncedSearchQuery}%`)
        const ids = (oids || []).map(o => o.id)
        if (ids.length === 0) { if (myReq === reqIdRef.current) { setItems([]); setTotalCount(0); setLoading(false); } return }
        orderIdFilter = orderIdFilter ? orderIdFilter.filter(id => ids.includes(id)) : ids
        if (orderIdFilter.length === 0) { if (myReq === reqIdRef.current) { setItems([]); setTotalCount(0); setLoading(false); } return }
      }

      let q = supa.from('order_line_items').select('*', { count: 'exact' })

      // Sub-tab partition — what set of production_stages are we showing?
      if (subTab === 'active') {
        q = q.in('production_stage', ACTIVE_PRODUCTION_STAGES)
      } else if (subTab === 'trials') {
        q = q.eq('production_stage', 'trials')
      } else if (subTab === 'alterations') {
        q = q.eq('production_stage', 'alterations')
      } else if (subTab === 'ready') {
        q = q.eq('production_stage', 'ready')
      } else if (subTab === 'returns') {
        q = q.in('production_stage', RETURN_PRODUCTION_STAGES)
      } else if (subTab === 'archive') {
        q = q.in('production_stage', ARCHIVE_PRODUCTION_STAGES)
      }

      if (orderIdFilter) q = q.in('order_id', orderIdFilter)

      // Apply line-item-level filters
      if (filterStage) q = q.eq('production_stage', filterStage)
      if (filterVendor) q = q.eq('vendor_assigned', filterVendor)
      if (filterDeliveryType) q = q.eq('delivery_type', filterDeliveryType)
      if (filterUrgency) q = q.eq('urgency', filterUrgency)
      if (filterType) q = q.eq('type', filterType)
      if (filterStylist) q = q.eq('stylist', filterStylist)
      if (filterProductExec) q = q.eq('product_executive', filterProductExec)
      if (filterDateFrom) q = q.gte('est_shipping_date', filterDateFrom)
      if (filterDateTo) q = q.lte('est_shipping_date', filterDateTo)

      // Search filters on line item columns
      if (debouncedSearchQuery && debouncedSearchQuery.length >= 2) {
        if (searchType === 'order_number') q = q.ilike('order_number', `%${debouncedSearchQuery}%`)
        else if (searchType === 'product_name') q = q.ilike('title', `%${debouncedSearchQuery}%`)
      }

      if (subTab === 'archive' || subTab === 'returns') {
        q = q.order('created_at', { ascending: false, nullsFirst: false }).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)
      } else {
        q = q.order('updated_at', { ascending: false, nullsFirst: false }).range(pg * PAGE_SIZE, (pg + 1) * PAGE_SIZE - 1)
      }

      const { data, count, error } = await q
      if (error) throw error

      // Stale response — newer fetch in-flight, drop this one
      if (myReq !== reqIdRef.current) return

      setItems(data || [])
      setTotalCount(count || 0)

      // Fetch related orders via context (uses cache when available)
      if (data && data.length > 0) {
        const orderIds = [...new Set(data.map(item => item.order_id))]
        // Fetch orders into context cache
        await ctx.fetchOrders((s) => s.from('shopify_orders').select('*').in('id', orderIds))
        const orderMap = {}
        orderIds.forEach(id => { const o = ctx.getOrder(id); if (o) orderMap[id] = o })

        // Enrich orders with buyer email/phone from customers → buyers
        const customerIds = [...new Set(data.map(li => li.customer_id).filter(Boolean))]
        if (customerIds.length > 0) {
          const { data: custs } = await supa.from('customers').select('id, buyer_id, phone').in('id', customerIds)
          if (custs && custs.length > 0) {
            const buyerIds = [...new Set(custs.map(c => c.buyer_id).filter(Boolean))]
            const { data: buyers } = await supa.from('buyers').select('id, email, phone').in('id', buyerIds)
            const buyerMap = {}
            ;(buyers || []).forEach(b => { buyerMap[b.id] = b })
            const custBuyerMap = {}
            custs.forEach(c => {
              const b = buyerMap[c.buyer_id]
              custBuyerMap[c.id] = { email: b?.email || '', phone: b?.phone || c.phone || '' }
            })
            data.forEach(li => {
              if (li.customer_id && custBuyerMap[li.customer_id] && orderMap[li.order_id]) {
                const o = orderMap[li.order_id]
                const bi = custBuyerMap[li.customer_id]
                if (!o.customer_email && bi.email) o.customer_email = bi.email
                if (!o.buyer_phone && bi.phone) o.buyer_phone = bi.phone
              }
            })
          }
        }
        if (myReq === reqIdRef.current) setOrders(orderMap)
      }
    } catch (e) {
      if (myReq !== reqIdRef.current) return
      console.error('Fetch error:', e)
      toast(false, 'Failed to load production items')
    } finally { if (myReq === reqIdRef.current) setLoading(false) }
  }, [subTab, filterChannel, filterStage, filterVendor, filterDeliveryType, filterUrgency, filterType, filterStylist, filterProductExec, filterDateFrom, filterDateTo, debouncedSearchQuery, searchType])

  // Debounce searchQuery -> debouncedSearchQuery (400ms after last keystroke)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
      setPage(0)
    }, 400)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [searchQuery])

  // Single fetch trigger — whenever page or any tracked filter changes
  useEffect(() => {
    fetchItems(page)
  }, [page, fetchItems])

  const handleSearch = (val) => { setSearchQuery(val) }

  const [counts, setCounts] = useState({ active: 0, trials: 0, alterations: 0, ready: 0, returns: 0 })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let orderIdFilter = null
      if (filterChannel !== 'all') {
        let oq = supa.from('shopify_orders').select('id')
        if (filterChannel === 'online')        oq = oq.eq('channel', 'Online')
        else if (filterChannel === 'assist')   oq = oq.eq('channel', 'Online Assist')
        else if (filterChannel === 'in_store') oq = oq.eq('channel', 'In-store')
        else if (filterChannel === 'marketplaces') oq = oq.in('channel', MARKETPLACE_CHANNELS)
        const { data } = await oq
        orderIdFilter = (data || []).map(o => o.id)
        if (orderIdFilter.length === 0) { if (!cancelled) setCounts({ active: 0, trials: 0, alterations: 0, ready: 0, returns: 0 }); return }
      }
      const make = (stageFilter) => {
        let q = supa.from('order_line_items').select('id', { count: 'exact', head: true })
        if (orderIdFilter) q = q.in('order_id', orderIdFilter)
        if (Array.isArray(stageFilter)) q = q.in('production_stage', stageFilter)
        else q = q.eq('production_stage', stageFilter)
        return q
      }
      const [a, t, al, r, ret] = await Promise.all([
        make(ACTIVE_PRODUCTION_STAGES),
        make('trials'),
        make('alterations'),
        make('ready'),
        make(RETURN_PRODUCTION_STAGES),
      ])
      if (!cancelled) setCounts({
        active: a.count || 0,
        trials: t.count || 0,
        alterations: al.count || 0,
        ready: r.count || 0,
        returns: ret.count || 0,
      })
    })()
    return () => { cancelled = true }
  }, [filterChannel])

  const resetFilters = () => {
    setSearchQuery('')
    setDebouncedSearchQuery('')
    setSearchType('order_number')
    setFilterStage('')
    setFilterVendor('')
    setFilterDeliveryType('')
    setFilterUrgency('')
    setFilterType('')
    setFilterStylist('')
    setFilterProductExec('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setFilterChannel('all')
    setPage(0)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  /* ─── RENDER ─────────────────────────────────────────────────── */
  return (
    <div className="p-4 sm:p-6 pb-24" style={{ fontFamily: 'Manrope, sans-serif' }}>

      {/* If detail view is open, show detail instead of list */}
      {subView === 'detail' && selectedItem ? (
        <ProductionDetail
          item={selectedItem}
          order={orders[selectedItem.order_id]}
          teamMembers={ctx.teamMembers}
          products={products}
          fabrics={fabrics}
          dyes={dyes}
          initialTab={selectedInitialTab}
          onBack={() => { setSubView('list'); setSelectedItem(null); setSelectedInitialTab(null) }}
          onEdit={() => setEditingItem(selectedItem)}
          onUpdate={(updatedFields) => {
            // Granular update: patch the selected item in-place if fields provided
            if (updatedFields && selectedItem) {
              const patched = { ...selectedItem, ...updatedFields }
              setSelectedItem(patched)
              setItems(prev => prev.map(i => i.id === patched.id ? patched : i))
            } else {
              fetchItems(page)
            }
          }}
        />
      ) : (
        <>
          {/* ── Header ──────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: C.text, fontFamily: 'Manrope, sans-serif' }}>Production</h1>
              {!loading && <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: C.goldLight, color: C.goldDark }}>{totalCount}</span>}
            </div>
          </div>

          {/* ── Sub-view tabs ───────────────────────────────────── */}
          <div className="flex gap-2 mb-6 border-b" style={{ borderColor: C.border }}>
            {[{ key: 'list', label: 'Cards' }, { key: 'summary', label: 'Summary' }, { key: 'dashboard', label: 'Dashboard' }].map(v => (
              <button key={v.key} onClick={() => { setSubView(v.key); setPage(0) }}
                className="px-4 py-3 text-sm font-bold border-b-2 transition-all" style={{
                  borderColor: subView === v.key ? C.gold : 'transparent',
                  color: subView === v.key ? C.gold : C.textMuted,
                }}>
                {v.label}
              </button>
            ))}
          </div>

          {subView === 'list' && (
            <ProductionList
              items={items}
              orders={orders}
              teamMembers={ctx.teamMembers}
              vendors={ctx.vendors}
              fabricVendors={ctx.fabricVendors}
              loading={loading}
              page={page}
              totalPages={totalPages}
              subTab={subTab}
              onSubTabChange={onSubTabChange}
              counts={counts}
              filterChannel={filterChannel}
              searchQuery={searchQuery}
              searchType={searchType}
              filterStage={filterStage}
              filterVendor={filterVendor}
              filterDeliveryType={filterDeliveryType}
              filterUrgency={filterUrgency}
              filterType={filterType}
              filterStylist={filterStylist}
              filterProductExec={filterProductExec}
              filterDateFrom={filterDateFrom}
              filterDateTo={filterDateTo}
              products={products}
              onSelectDetail={(i, tab) => { setSelectedItem(i); setSelectedInitialTab(tab || null); setSubView('detail') }}
              onUpdate={(payload) => {
                if (payload && payload.itemId && payload.fields) {
                  setItems(prev => prev.map(i => i.id === payload.itemId ? { ...i, ...payload.fields } : i))
                } else {
                  fetchItems(page)
                }
              }}
              onPageChange={setPage}
              onFilterChannelChange={onChannelChange}
              onSearchTypeChange={setSearchType}
              onSearchChange={handleSearch}
              onFilterStageChange={(s) => { setFilterStage(s); setPage(0) }}
              onFilterVendorChange={(v) => { setFilterVendor(v); setPage(0) }}
              onFilterDeliveryTypeChange={(d) => { setFilterDeliveryType(d); setPage(0) }}
              onFilterUrgencyChange={(u) => { setFilterUrgency(u); setPage(0) }}
              onFilterTypeChange={(t) => { setFilterType(t); setPage(0) }}
              onFilterStylistChange={(s) => { setFilterStylist(s); setPage(0) }}
              onFilterProductExecChange={(p) => { setFilterProductExec(p); setPage(0) }}
              onFilterDateFromChange={(v) => { setFilterDateFrom(v); setPage(0) }}
              onFilterDateToChange={(v) => { setFilterDateTo(v); setPage(0) }}
              onResetFilters={resetFilters}
              pageSize={PAGE_SIZE}
              searchTypes={SEARCH_TYPES}
              orderTypes={ORDER_TYPES}
              urgencyLevels={URGENCY_LEVELS}
            />
          )}

          {subView === 'summary' && (
            <ProductionSummary items={items} />
          )}

          {subView === 'dashboard' && (
            <ProductionDashboard items={items} orders={orders} />
          )}
        </>
      )}

      {/* ── Modals ──────────────────────────────────────────── */}
      {editingItem && (
        <EditProductionModal
          item={editingItem}
          onSave={() => { setEditingItem(null); fetchItems(page) }}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  )
}

export default ProductionTab

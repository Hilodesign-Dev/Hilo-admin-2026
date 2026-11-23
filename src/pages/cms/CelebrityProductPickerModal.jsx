import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { C } from '../../lib/designTokens'
import { Btn } from '../orders/ui'

const CATEGORY_CHIPS = [
  'All',
  'Kurta',
  'Sherwani',
  'Indo-Western',
  'Bundi',
  'Shirt',
  'Suit',
  'Trousers',
]

const PAGE_SIZE = 18

/**
 * Format Shopify CDN image URLs to guarantee optimal webp/jpg format & size
 */
export function formatShopifyUrl(url, width = 500) {
  if (!url || typeof url !== 'string') return '/hilo-hi.png'
  if (!url.startsWith('http')) return url
  if (url.includes('cdn.shopify.com')) {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}width=${width}&format=jpg`
  }
  return url
}

/**
 * Extract true image URL string from catalogue_products row
 */
export function extractProductImageUrl(item) {
  // 1. Direct image_url string
  if (typeof item?.image_url === 'string' && item.image_url.startsWith('http')) {
    return formatShopifyUrl(item.image_url)
  }

  // 2. shopify_images (may be array of objects [{ src: ... }] or array of strings)
  if (Array.isArray(item?.shopify_images) && item.shopify_images.length > 0) {
    const first = item.shopify_images[0]
    if (typeof first === 'string' && first.startsWith('http')) {
      return formatShopifyUrl(first)
    }
    if (typeof first?.src === 'string' && first.src.startsWith('http')) {
      return formatShopifyUrl(first.src)
    }
  }

  // 3. Variant image
  if (Array.isArray(item?.variants) && item.variants.length > 0) {
    const v = item.variants[0]
    const sizeImg = v?.sizes?.[0]?.image
    if (typeof sizeImg === 'string' && sizeImg.startsWith('http')) {
      return formatShopifyUrl(sizeImg)
    }
    if (typeof v?.variant_image === 'string' && v.variant_image.startsWith('http')) {
      return formatShopifyUrl(v.variant_image)
    }
  }

  return '/hilo-hi.png'
}

export default function CelebrityProductPickerModal({
  isOpen,
  onClose,
  initialSelectedIds = [],
  onApply,
}) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds)
  const [selectedProductMap, setSelectedProductMap] = useState({})
  const [showOnlySelected, setShowOnlySelected] = useState(false)

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Sync initial selected IDs on open
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(initialSelectedIds)
      setPage(1)
      setSearch('')
      setDebouncedSearch('')
      setSelectedCategory('All')
      setShowOnlySelected(false)
    }
  }, [isOpen, initialSelectedIds])

  // Fetch catalog products from Supabase catalogue_products with server-side pagination & search
  const fetchProducts = useCallback(async () => {
    if (!isOpen) return
    setLoading(true)

    try {
      // If user toggled "Show Selected Only"
      if (showOnlySelected) {
        if (selectedIds.length === 0) {
          setProducts([])
          setTotalCount(0)
          setLoading(false)
          return
        }

        const { data, count, error } = await supa
          .from('catalogue_products')
          .select(
            'id, product_title, category, mrp, image_url, shopify_images, style_code, handle, variants',
            { count: 'exact' }
          )
          .in('id', selectedIds)
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

        if (error) throw error

        const mapped = (data || []).map((p) => {
          const img = extractProductImageUrl(p)
          const price = Number(p.mrp) || Number(p.variants?.[0]?.sizes?.[0]?.mrp) || 4999
          const code = p.style_code || p.variants?.[0]?.style_code || ''
          return {
            id: String(p.id),
            title: p.product_title || p.handle || 'Hilo Garment',
            category: p.category || 'Apparel',
            styleCode: code,
            price,
            imageUrl: img,
          }
        })

        setProducts(mapped)
        setTotalCount(count || 0)

        // Cache in selected map
        setSelectedProductMap((prev) => {
          const next = { ...prev }
          mapped.forEach((item) => {
            next[item.id] = item
          })
          return next
        })
        return
      }

      // Standard Server-Side Query
      let query = supa
        .from('catalogue_products')
        .select(
          'id, product_title, category, mrp, image_url, shopify_images, style_code, handle, variants',
          { count: 'exact' }
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      // Category filter
      if (selectedCategory === 'Kurta') {
        query = query.or('category.ilike.%Kurta%,product_title.ilike.%Kurta%')
      } else if (selectedCategory === 'Sherwani') {
        query = query.or('category.ilike.%Sherwani%,product_title.ilike.%Sherwani%')
      } else if (selectedCategory === 'Bundi') {
        query = query.or(
          'category.ilike.%Bundi%,category.ilike.%Nehru%,category.ilike.%Bandhgala%,product_title.ilike.%Bundi%'
        )
      } else if (selectedCategory === 'Shirt') {
        query = query.or('category.ilike.%Shirt%,category.ilike.%Shacket%,product_title.ilike.%Shirt%')
      } else if (selectedCategory === 'Indo-Western') {
        query = query.or('category.ilike.%Indo%,product_title.ilike.%Indo%')
      } else if (selectedCategory === 'Suit') {
        query = query.or(
          'category.ilike.%Suit%,category.ilike.%Blazer%,product_title.ilike.%Suit%,product_title.ilike.%Blazer%'
        )
      } else if (selectedCategory === 'Trousers') {
        query = query.or(
          'category.ilike.%Pant%,category.ilike.%Trouser%,product_title.ilike.%Pant%,product_title.ilike.%Trouser%'
        )
      }

      // Backend search query
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.trim()
        query = query.or(
          `product_title.ilike.%${q}%,style_code.ilike.%${q}%,handle.ilike.%${q}%`
        )
      }

      // Server pagination range
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      query = query.range(from, to)

      const { data, count, error } = await query

      if (error) {
        console.error('[CelebrityProductPicker] Supabase query error:', error)
        throw error
      }

      const mapped = (data || []).map((p) => {
        const img = extractProductImageUrl(p)
        const price = Number(p.mrp) || Number(p.variants?.[0]?.sizes?.[0]?.mrp) || 4999
        const code = p.style_code || p.variants?.[0]?.style_code || ''
        return {
          id: String(p.id),
          title: p.product_title || p.handle || 'Hilo Garment',
          category: p.category || 'Apparel',
          styleCode: code,
          price,
          imageUrl: img,
        }
      })

      setProducts(mapped)
      setTotalCount(count || 0)

      // Cache details of newly loaded products for selected list
      setSelectedProductMap((prev) => {
        const next = { ...prev }
        mapped.forEach((item) => {
          next[item.id] = item
        })
        return next
      })
    } catch (err) {
      console.warn('[CelebrityProductPicker] Error fetching products:', err)
    } finally {
      setLoading(false)
    }
  }, [isOpen, selectedCategory, debouncedSearch, page, showOnlySelected, selectedIds])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const toggleSelect = (p) => {
    const id = p.id
    setSelectedIds((prev) => {
      const isSelected = prev.includes(id)
      if (isSelected) {
        return prev.filter((x) => x !== id)
      } else {
        // Cache object
        setSelectedProductMap((m) => ({ ...m, [id]: p }))
        return [...prev, id]
      }
    })
  }

  const handleCategoryClick = (cat) => {
    setSelectedCategory(cat)
    setShowOnlySelected(false)
    setPage(1)
  }

  const handleToggleSelectedOnly = () => {
    setShowOnlySelected((v) => !v)
    setPage(1)
  }

  const handleApply = () => {
    const selectedObjs = selectedIds
      .map((id) => selectedProductMap[id] || products.find((p) => p.id === id))
      .filter(Boolean)
    onApply(selectedIds, selectedObjs)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-sm select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden border flex flex-col max-h-[92vh]"
        style={{ borderColor: C.border }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between shrink-0 bg-stone-50"
          style={{ borderColor: C.borderLight }}
        >
          <div>
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <span>🛍️</span>
              <span>Select Products for Celebrity Edit</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-stone-200 text-stone-700">
                {totalCount} Active Products
              </span>
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Pick single or multiple pieces to feature in this look collection
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-stone-200/80 flex items-center justify-center text-stone-500 hover:text-stone-900 transition-colors text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Search & Filter Toolbar */}
        <div
          className="p-4 border-b bg-white space-y-3 shrink-0"
          style={{ borderColor: C.borderLight }}
        >
          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search catalog by title, style code, fabric, or keyword (e.g. Dhuraketu, Raw Silk, HL-KU)..."
              className="w-full text-xs px-3.5 py-2.5 pl-9 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-stone-500 transition-colors"
            />
            <span className="absolute left-3 top-3 text-xs text-stone-400">🔍</span>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-2.5 text-xs text-stone-400 hover:text-stone-700 p-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Chips & Selected Toggle */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none flex-1">
              {CATEGORY_CHIPS.map((cat) => {
                const active = selectedCategory === cat && !showOnlySelected
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleCategoryClick(cat)}
                    className={`text-xs px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-colors border ${
                      active
                        ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
                        : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {cat}
                  </button>
                )
              })}
            </div>

            {/* Filter by Selected Only */}
            <button
              type="button"
              onClick={handleToggleSelectedOnly}
              className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all border flex items-center gap-1.5 shrink-0 ${
                showOnlySelected
                  ? 'bg-[#543925] text-white border-[#543925] shadow-xs'
                  : 'bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200/80'
              }`}
            >
              <span>✓ Selected</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  showOnlySelected ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-800'
                }`}
              >
                {selectedIds.length}
              </span>
            </button>
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-5 bg-stone-100/60">
          {loading ? (
            <div className="py-24 text-center">
              <span className="text-3xl block animate-spin mb-2">⏳</span>
              <span className="text-xs text-stone-500 font-medium">
                Searching catalog in Supabase...
              </span>
            </div>
          ) : products.length === 0 ? (
            <div className="py-24 text-center text-xs text-stone-500">
              <span className="text-3xl block mb-2">🔍</span>
              <p className="font-semibold text-stone-800">
                {showOnlySelected
                  ? 'No products currently selected'
                  : `No products found matching "${debouncedSearch || selectedCategory}"`}
              </p>
              <p className="text-stone-400 mt-1">Try another category or clear your search query.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5">
              {products.map((p) => {
                const isSelected = selectedIds.includes(p.id)
                return (
                  <div
                    key={p.id}
                    onClick={() => toggleSelect(p)}
                    className={`relative p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#543925] bg-[#FAF7F2] ring-2 ring-[#543925]/30 shadow-md scale-[1.01]'
                        : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-2xs'
                    }`}
                  >
                    {/* Checkbox indicator */}
                    <div className="absolute top-3.5 right-3.5 z-10">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors shadow-xs ${
                          isSelected
                            ? 'bg-[#543925] text-white'
                            : 'border border-stone-300 bg-white/95 text-transparent'
                        }`}
                      >
                        ✓
                      </div>
                    </div>

                    {/* True Product Image from Shopify CDN */}
                    <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-stone-100 mb-2 border border-stone-100 flex items-center justify-center">
                      <img
                        src={p.imageUrl}
                        alt={p.title}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                        loading="lazy"
                        onError={(e) => {
                          // Clean fallback to Hilo branded mark
                          if (e.currentTarget.src !== '/hilo-hi.png') {
                            e.currentTarget.src = '/hilo-hi.png'
                            e.currentTarget.className = 'w-12 h-12 object-contain opacity-40'
                          }
                        }}
                      />
                    </div>

                    {/* Product Details */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="text-[9px] uppercase font-bold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                          {p.category}
                        </span>
                        {p.styleCode && (
                          <span className="text-[9px] font-mono font-medium text-stone-500">
                            {p.styleCode}
                          </span>
                        )}
                      </div>
                      <h4
                        className="text-xs font-semibold text-stone-900 line-clamp-2 leading-snug"
                        title={p.title}
                      >
                        {p.title}
                      </h4>
                      <div className="mt-1.5 text-xs font-bold text-stone-900">
                        ₹{p.price.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Pagination Bar */}
        <div
          className="px-6 py-2.5 border-t bg-stone-50 flex items-center justify-between shrink-0 text-xs text-stone-600"
          style={{ borderColor: C.borderLight }}
        >
          <div>
            Showing <span className="font-semibold">{Math.min(totalCount, (page - 1) * PAGE_SIZE + 1)}</span>–
            <span className="font-semibold">{Math.min(totalCount, page * PAGE_SIZE)}</span> of{' '}
            <span className="font-semibold">{totalCount}</span> Products
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(1)}
              className="px-2 py-1 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-white text-xs font-semibold"
              title="First Page"
            >
              «
            </button>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-white text-xs font-semibold"
            >
              ‹ Prev
            </button>

            <span className="px-2 text-xs font-medium text-stone-700">
              Page <span className="font-bold">{page}</span> of{' '}
              <span className="font-bold">{totalPages}</span>
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-white text-xs font-semibold"
            >
              Next ›
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
              className="px-2 py-1 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-white text-xs font-semibold"
              title="Last Page"
            >
              »
            </button>
          </div>
        </div>

        {/* Sticky Bottom Summary Bar */}
        <div
          className="px-6 py-3.5 border-t bg-white flex items-center justify-between shrink-0 shadow-lg"
          style={{ borderColor: C.borderLight }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#543925] text-white text-xs font-bold flex items-center justify-center shadow-xs">
              {selectedIds.length}
            </div>
            <div>
              <span className="text-xs font-bold text-stone-900 block">
                {selectedIds.length === 1
                  ? '1 Product Selected'
                  : `${selectedIds.length} Products Selected`}
              </span>
              <span className="text-[11px] text-stone-500">
                Selections persist across all pages and searches
              </span>
            </div>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-xs text-red-600 hover:text-red-800 font-semibold underline ml-3"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Btn small onClick={onClose}>
              Cancel
            </Btn>
            <Btn small primary onClick={handleApply}>
              Done / Apply Selection ({selectedIds.length})
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

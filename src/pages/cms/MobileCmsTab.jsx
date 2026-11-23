import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { Btn, Field, Input, Badge } from '../orders/ui'
import HiloImageCropper from './HiloImageCropper'
import MobileMockPhone from './MobileMockPhone'
import MobileHomeFeedMock from './MobileHomeFeedMock'
import CelebrityProductPickerModal, { extractProductImageUrl } from './CelebrityProductPickerModal'

const YOUTUBE_REGEX =
  /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/

function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (trimmed.length === 11 && !trimmed.includes('/') && !trimmed.includes('.')) {
    return trimmed
  }
  const match = trimmed.match(YOUTUBE_REGEX)
  return match ? match[1] : null
}

function getYouTubeThumbnail(urlOrId, quality = 'hq') {
  const videoId = extractYouTubeId(urlOrId)
  if (!videoId) return null
  const filename = quality === 'maxres' ? 'maxresdefault.jpg' : 'hqdefault.jpg'
  return `https://img.youtube.com/vi/${videoId}/${filename}`
}

function cleanYouTubeTitle(rawTitle, maxWords = 5) {
  if (!rawTitle || typeof rawTitle !== 'string') return ''
  let cleaned = rawTitle
    .replace(/#[a-zA-Z0-9_-]+/g, '')
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/[-|–—:•].*$/, '')
    .trim()
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return words.join(' ')
  return words.slice(0, maxWords).join(' ')
}

/**
 * YouTube metadata extractor
 */
async function fetchYouTubeMetadataExternal(urlOrId) {
  const vidId = extractYouTubeId(urlOrId)
  if (!vidId) return null

  const watchUrl = `https://www.youtube.com/watch?v=${vidId}`

  // 1. Try noembed.com (CORS enabled)
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`)
    if (res.ok) {
      const data = await res.json()
      if (data && data.title && !data.error) {
        return {
          videoId: vidId,
          title: data.title,
          conciseTitle: cleanYouTubeTitle(data.title, 5),
          authorName: data.author_name || null,
          thumbnailUrl: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
          fallbackThumb: data.thumbnail_url || `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`,
        }
      }
    }
  } catch (_) {}

  // 2. Try official YouTube oembed
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`
    )
    if (res.ok) {
      const data = await res.json()
      if (data && data.title) {
        return {
          videoId: vidId,
          title: data.title,
          conciseTitle: cleanYouTubeTitle(data.title, 5),
          authorName: data.author_name || null,
          thumbnailUrl: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
          fallbackThumb: data.thumbnail_url || `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`,
        }
      }
    }
  } catch (_) {}

  return {
    videoId: vidId,
    title: null,
    conciseTitle: null,
    authorName: null,
    thumbnailUrl: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
    fallbackThumb: `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`,
  }
}

export default function MobileCmsTab() {
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('carousel')
  const [previewMode, setPreviewMode] = useState('all') // 'all' | 'section'
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPreviewSlideIdx, setSelectedPreviewSlideIdx] = useState(0)

  // Single modal state: null | 'hero_form' | 'hero_crop' | 'luxury_form' | 'styling_form' | 'celebrity_form' | 'celebrity_crop' | 'celebrity_picker'
  const [activeModal, setActiveModal] = useState(null)

  // Currently editing banner entity (null when creating new)
  const [editBanner, setEditBanner] = useState(null)

  // Form Fields State
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [celebrityName, setCelebrityName] = useState('')
  const [ctaLabel, setCtaLabel] = useState('Shop the look')
  const [selectedProductIds, setSelectedProductIds] = useState([])
  const [selectedProductsMap, setSelectedProductsMap] = useState({})
  const [imageUrl, setImageUrl] = useState('')
  const [mobileImageUrl, setMobileImageUrl] = useState('')
  const [linkType, setLinkType] = useState('none')
  const [linkValue, setLinkValue] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [active, setActive] = useState(true)
  const [rawFetchedTitle, setRawFetchedTitle] = useState('')
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const [availableCollections, setAvailableCollections] = useState([])

  // Image data passed into croppers
  const [cropperImageSrc, setCropperImageSrc] = useState('')

  const quickHeroUploadRef = useRef(null)
  const quickCelebrityUploadRef = useRef(null)
  const heroFormUploadRef = useRef(null)
  const celebrityFormUploadRef = useRef(null)

  // Fetch Banners from Supabase
  const fetchBanners = useCallback(async () => {
    setLoading(true)
    try {
      const [bannersRes, collectionsRes] = await Promise.all([
        supa.from('cms_banners').select('*').order('sort_order', { ascending: true }),
        supa.from('catalogue_collections').select('id, title, handle, is_nav_visible, is_active').order('title', { ascending: true }),
      ])

      if (bannersRes.error) throw bannersRes.error
      setBanners(bannersRes.data || [])
      if (!collectionsRes.error && collectionsRes.data) {
        setAvailableCollections(collectionsRes.data.filter((c) => c.is_active !== false))
      }
    } catch (e) {
      console.error('[HILO] Failed to fetch CMS banners:', e)
      toast(false, 'Failed to fetch CMS banners: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBanners()
  }, [fetchBanners])

  // Partition banners by section
  const carouselBanners = useMemo(
    () => banners.filter(b => b.type === 'carousel' || !b.type),
    [banners]
  )
  const luxuryBanners = useMemo(
    () => banners.filter(b => b.type === 'luxury_in_motion' || b.type === 'luxury_video'),
    [banners]
  )
  const stylingBanners = useMemo(
    () => banners.filter(b => b.type === 'styling_made_simple' || b.type === 'style_video'),
    [banners]
  )
  const celebrityBanners = useMemo(
    () => banners.filter(b => b.type === 'celebrity_edit' || b.type === 'wedding_edition'),
    [banners]
  )

  const activeLuxuryVideo = useMemo(
    () => luxuryBanners.find(b => b.active) || luxuryBanners[0] || null,
    [luxuryBanners]
  )

  // Filter current section list by search query
  const displayedItems = useMemo(() => {
    let list = []
    if (activeSection === 'carousel') list = carouselBanners
    else if (activeSection === 'luxury_in_motion') list = luxuryBanners
    else if (activeSection === 'styling_made_simple') list = stylingBanners
    else if (activeSection === 'celebrity_edit') list = celebrityBanners
    else list = banners

    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter(
      b =>
        (b.title && b.title.toLowerCase().includes(q)) ||
        (b.subtitle && b.subtitle.toLowerCase().includes(q)) ||
        (b.link_value && b.link_value.toLowerCase().includes(q))
    )
  }, [activeSection, carouselBanners, luxuryBanners, stylingBanners, celebrityBanners, banners, searchQuery])

  // ── Open Dedicated Create Modals ──
  const handleOpenCreateHero = () => {
    setEditBanner(null)
    setTitle('Hi there\nLet’s find your style.')
    setSubtitle('Discover designer looks styled around you.')
    setImageUrl('')
    setMobileImageUrl('')
    setLinkType('none')
    setLinkValue('')
    setSortOrder('0')
    setActive(true)
    setActiveModal('hero_form')
  }

  const handleOpenCreateLuxury = () => {
    setEditBanner(null)
    setTitle('Experience Hilo. Luxury In Motion.')
    setSubtitle('Hilo Design Studio')
    setImageUrl('')
    setMobileImageUrl('')
    setLinkType('none')
    setLinkValue('')
    setSortOrder('0')
    setActive(true)
    setRawFetchedTitle('')
    setActiveModal('luxury_form')
  }

  const handleOpenCreateStyling = () => {
    setEditBanner(null)
    setTitle('How To Find Your Fit')
    setSubtitle('Hilo Styling')
    setImageUrl('')
    setMobileImageUrl('')
    setLinkType('none')
    setLinkValue('')
    setSortOrder('0')
    setActive(true)
    setRawFetchedTitle('')
    setActiveModal('styling_form')
  }

  const handleOpenCreateCelebrity = () => {
    setEditBanner(null)
    setTitle('Groom Edition')
    setCelebrityName('Ranbir Kapoor Style')
    setCtaLabel('Shop the look')
    setSubtitle('Ranbir Kapoor Style')
    setSelectedProductIds([])
    setSelectedProductsMap({})
    setImageUrl('')
    setMobileImageUrl('')
    setLinkType('none')
    setLinkValue('[]')
    setSortOrder('0')
    setActive(true)
    setActiveModal('celebrity_form')
  }

  const handleOpenCreateBySection = (sec = activeSection) => {
    if (sec === 'luxury_in_motion') handleOpenCreateLuxury()
    else if (sec === 'styling_made_simple') handleOpenCreateStyling()
    else if (sec === 'celebrity_edit') handleOpenCreateCelebrity()
    else handleOpenCreateHero()
  }

  // ── Open Dedicated Edit Modals ──
  const handleOpenEdit = (b) => {
    setEditBanner(b)
    setTitle(b.title || '')
    setSubtitle(b.subtitle || '')
    setImageUrl(b.image_url || '')
    setMobileImageUrl(b.mobile_image_url || '')
    setLinkType(b.link_type || 'none')
    setLinkValue(b.link_value || '')
    setSortOrder(String(b.sort_order || 0))
    setActive(b.active ?? true)
    setRawFetchedTitle('')

    if (b.type === 'luxury_in_motion' || b.type === 'luxury_video') {
      setActiveModal('luxury_form')
    } else if (b.type === 'styling_made_simple' || b.type === 'style_video') {
      setActiveModal('styling_form')
    } else if (b.type === 'celebrity_edit' || b.type === 'wedding_edition') {
      setCelebrityName(b.subtitle || '')
      setCtaLabel(b.cta_label || 'Shop the look')
      let pids = []
      if (b.link_value) {
        try {
          if (b.link_value.startsWith('[') && b.link_value.endsWith(']')) {
            pids = JSON.parse(b.link_value)
          } else {
            pids = b.link_value.split(',').map(s => s.trim()).filter(Boolean)
          }
        } catch {
          pids = [b.link_value]
        }
      }
      setSelectedProductIds(pids)
      if (pids.length > 0) {
        supa
          .from('catalogue_products')
          .select('id, product_title, handle, category, style_code, image_url, shopify_images, variants, mrp')
          .in('id', pids)
          .then(({ data }) => {
            if (data && data.length > 0) {
              const map = {}
              data.forEach(p => {
                map[String(p.id)] = {
                  id: String(p.id),
                  title: p.product_title || p.handle || 'Hilo Garment',
                  category: p.category || 'Apparel',
                  price: Number(p.mrp) || Number(p.variants?.[0]?.sizes?.[0]?.mrp) || 0,
                  imageUrl: extractProductImageUrl(p),
                }
              })
              setSelectedProductsMap(prev => ({ ...prev, ...map }))
            }
          })
          .catch(err => console.warn('Error fetching attached products:', err))
      }
      setActiveModal('celebrity_form')
    } else {
      setActiveModal('hero_form')
    }
  }

  // ── Quick Local File Uploads (From Toolbar) ──
  const handleQuickHeroFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setEditBanner(null)
    setTitle('Hi there\nLet’s find your style.')
    setSubtitle('Discover designer looks styled around you.')
    setSortOrder('0')
    setActive(true)

    const reader = new FileReader()
    reader.onload = () => {
      setCropperImageSrc(reader.result)
      setActiveModal('hero_crop')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleQuickCelebrityFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setEditBanner(null)
    setTitle('Groom Edition')
    setCelebrityName('Ranbir Kapoor Style')
    setCtaLabel('Shop the look')
    setSelectedProductIds([])
    setSelectedProductsMap({})
    setSortOrder('0')
    setActive(true)

    const reader = new FileReader()
    reader.onload = () => {
      setCropperImageSrc(reader.result)
      setActiveModal('celebrity_crop')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // ── Form Upload Trigger -> Smoothly Replace Form with Cropper ──
  const handleHeroFormFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCropperImageSrc(reader.result)
      setActiveModal('hero_crop')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleCelebrityFormFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCropperImageSrc(reader.result)
      setActiveModal('celebrity_crop')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // ── Cropper Completion Handlers -> Restore Respective Form ──
  const handleHeroCropComplete = (uploadedUrl) => {
    setImageUrl(uploadedUrl)
    setMobileImageUrl(uploadedUrl)
    setCropperImageSrc('')
    setActiveModal('hero_form')
  }

  const handleCelebrityCropComplete = (uploadedUrl) => {
    setImageUrl(uploadedUrl)
    setMobileImageUrl(uploadedUrl)
    setCropperImageSrc('')
    setActiveModal('celebrity_form')
  }

  // ── YouTube Extraction Helpers ──
  const handleExtractYouTube = async (urlToExtract, isShorts = false) => {
    const vidId = extractYouTubeId(urlToExtract)
    if (!vidId) {
      toast(false, 'Please enter a valid YouTube video link or 11-char ID')
      return
    }

    setFetchingMeta(true)
    try {
      const meta = await fetchYouTubeMetadataExternal(urlToExtract)
      if (meta) {
        if (meta.title) {
          setRawFetchedTitle(meta.title)
          const bestTitle = isShorts ? meta.conciseTitle : meta.title
          if (!title || title.trim() === '') setTitle(bestTitle)
        }
        if (meta.authorName && (!subtitle || subtitle.trim() === '')) {
          setSubtitle(meta.authorName)
        }
        const bestThumb = meta.thumbnailUrl || meta.fallbackThumb
        if (bestThumb) {
          setImageUrl(bestThumb)
          setMobileImageUrl(meta.fallbackThumb || bestThumb)
        }
        toast(true, `Extracted: "${meta.conciseTitle || meta.videoId}"`)
      }
    } catch (e) {
      toast(false, 'Failed to extract YouTube details: ' + e.message)
    } finally {
      setFetchingMeta(false)
    }
  }

  // ── Item Actions: Toggle Active & Delete ──
  const handleToggleActive = async (b) => {
    try {
      const nextActive = !b.active

      // Enforce 1 active limit for luxury_in_motion
      if (nextActive && (b.type === 'luxury_in_motion' || b.type === 'luxury_video')) {
        await supa
          .from('cms_banners')
          .update({ active: false, updated_at: new Date().toISOString() })
          .in('type', ['luxury_in_motion', 'luxury_video'])
      }

      const { error } = await supa
        .from('cms_banners')
        .update({ active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', b.id)

      if (error) throw error
      setBanners(prev => prev.map(item => (item.id === b.id ? { ...item, active: nextActive } : item)))
      toast(true, nextActive ? 'Activated on mobile feed' : 'Set to inactive draft')
    } catch (e) {
      toast(false, 'Failed to update status: ' + e.message)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this item from mobile CMS?')) return
    try {
      const { error } = await supa
        .from('cms_banners')
        .delete()
        .eq('id', id)

      if (error) throw error
      setBanners(prev => prev.filter(b => b.id !== id))
      toast(true, 'Deleted successfully')
    } catch (e) {
      toast(false, 'Failed to delete: ' + e.message)
    }
  }

  // ── Generic Save Helper ──
  const handleSaveBanner = async (itemType, customPayload = {}) => {
    if (active && (itemType === 'luxury_in_motion' || itemType === 'luxury_video')) {
      await supa
        .from('cms_banners')
        .update({ active: false, updated_at: new Date().toISOString() })
        .in('type', ['luxury_in_motion', 'luxury_video'])
        .neq('id', editBanner?.id || '00000000-0000-0000-0000-000000000000')
    }

    const payload = {
      title: title.trim(),
      subtitle: subtitle?.trim() || null,
      type: itemType,
      image_url: imageUrl || null,
      mobile_image_url: mobileImageUrl || imageUrl || null,
      link_type: linkType || 'none',
      link_value: linkValue || null,
      sort_order: parseInt(sortOrder) || 0,
      active,
      updated_at: new Date().toISOString(),
      ...customPayload,
    }

    try {
      if (editBanner) {
        const { error } = await supa
          .from('cms_banners')
          .update(payload)
          .eq('id', editBanner.id)

        if (error) throw error
        toast(true, 'Updated successfully')
      } else {
        const { error } = await supa
          .from('cms_banners')
          .insert([payload])

        if (error) throw error
        toast(true, 'Created successfully')
      }

      setActiveModal(null)
      fetchBanners()
    } catch (e) {
      toast(false, 'Failed to save: ' + e.message)
    }
  }

  // Current preview target section
  const currentPreviewSection = previewMode === 'all' ? 'all' : activeSection

  return (
    <div className="p-6 max-w-[1500px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: C.text }}>
            Mobile CMS
          </h1>
          <p className="text-sm mt-0.5" style={{ color: C.textMuted }}>
            Hero Carousel, Luxury In Motion, Styling Made Simple, and Celebrity Edits
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Btn primary onClick={() => handleOpenCreateBySection(activeSection)}>
            + Add {activeSection === 'carousel' ? 'Hero Banner' : activeSection === 'luxury_in_motion' ? 'Luxury Video' : activeSection === 'styling_made_simple' ? 'Style Short' : activeSection === 'celebrity_edit' ? 'Celebrity Edit' : 'Item'}
          </Btn>
        </div>
      </div>

      {/* Pill Tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-3 mb-6" style={{ borderColor: C.border }}>
        {[
          { key: 'carousel', label: 'Hero Carousel', count: carouselBanners.length },
          { key: 'luxury_in_motion', label: 'Luxury In Motion', count: luxuryBanners.length },
          { key: 'styling_made_simple', label: 'Styling Made Simple', count: stylingBanners.length },
          { key: 'celebrity_edit', label: 'Celebrity Edits', count: celebrityBanners.length },
          { key: 'all', label: 'All Items', count: banners.length },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-2 border ${
              activeSection === tab.key
                ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                : 'bg-white text-stone-600 hover:bg-stone-50 border-stone-200'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeSection === tab.key ? 'bg-stone-700 text-stone-100' : 'bg-stone-100 text-stone-500'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Main Workspace (Dual Pane) */}
      {activeSection !== 'all' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Management List (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Minimal Toolbar */}
            <div className="bg-white p-3 rounded-2xl border shadow-sm flex items-center justify-between gap-3" style={{ borderColor: C.border }}>
              <div className="relative flex-1 max-w-sm">
                <input
                  type="text"
                  placeholder="Filter by title or link..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 rounded-xl border outline-none focus:ring-1 focus:ring-amber-300"
                  style={{ background: C.bg, borderColor: C.border, color: C.text }}
                />
                <span className="absolute left-2.5 top-2 text-stone-400 text-xs">🔍</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeSection === 'luxury_in_motion' && (
                  <Badge color="#b45309" bg="#fef3c7">
                    Limit: 1 Active
                  </Badge>
                )}

                {activeSection === 'carousel' && (
                  <>
                    <input
                      ref={quickHeroUploadRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleQuickHeroFileSelect}
                    />
                    <button
                      type="button"
                      onClick={() => quickHeroUploadRef.current?.click()}
                      className="text-xs font-medium px-3 py-1.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 transition-colors flex items-center gap-1.5 shadow-2xs"
                      title="Upload an image from your computer to crop"
                    >
                      <span>📁</span>
                      <span>Upload Banner</span>
                    </button>
                  </>
                )}

                {activeSection === 'celebrity_edit' && (
                  <>
                    <input
                      ref={quickCelebrityUploadRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleQuickCelebrityFileSelect}
                    />
                    <button
                      type="button"
                      onClick={() => quickCelebrityUploadRef.current?.click()}
                      className="text-xs font-medium px-3 py-1.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-stone-700 transition-colors flex items-center gap-1.5 shadow-2xs"
                      title="Upload celebrity look photo to crop"
                    >
                      <span>📁</span>
                      <span>Upload Look</span>
                    </button>
                  </>
                )}

                <Btn small primary onClick={() => handleOpenCreateBySection(activeSection)}>
                  + Add {activeSection === 'carousel' ? 'Banner' : activeSection === 'luxury_in_motion' ? 'Video' : activeSection === 'styling_made_simple' ? 'Short' : 'Look'}
                </Btn>
              </div>
            </div>

            {/* Item List */}
            {loading ? (
              <div className="py-16 text-center text-xs text-stone-400">Loading items...</div>
            ) : displayedItems.length === 0 ? (
              <div className="bg-white rounded-2xl border p-12 text-center" style={{ borderColor: C.border }}>
                <p className="text-xs text-stone-500 mb-3">No items found</p>
                <Btn small primary onClick={() => handleOpenCreateBySection(activeSection)}>
                  + Add New
                </Btn>
              </div>
            ) : (
              <div className="space-y-2.5">
                {displayedItems.map((item, idx) => {
                  const isSelected = selectedPreviewSlideIdx === idx
                  const videoId = extractYouTubeId(item.link_value)
                  const thumb = item.image_url || (videoId ? getYouTubeThumbnail(videoId, 'hq') : null)

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedPreviewSlideIdx(idx)}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 bg-white cursor-pointer ${
                        isSelected
                          ? 'border-stone-900 ring-1 ring-stone-900 shadow-sm'
                          : 'border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      {/* Thumbnail & Title */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`rounded-lg bg-stone-900 overflow-hidden shrink-0 border border-stone-200 relative ${
                            activeSection === 'celebrity_edit' || item.type === 'celebrity_edit'
                              ? 'w-11 aspect-[194/280]'
                              : activeSection === 'styling_made_simple'
                              ? 'w-10 aspect-[186/310]'
                              : activeSection === 'luxury_in_motion'
                              ? 'w-16 aspect-[16/9]'
                              : 'w-11 aspect-[3/4]'
                          }`}
                        >
                          {thumb ? (
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[8px] text-stone-500">
                              No pic
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-xs text-stone-900 truncate">
                              {item.title || 'Untitled'}
                            </h4>
                            <Badge color={item.active ? C.green : C.red} bg={item.active ? C.greenBg : C.redBg}>
                              {item.active ? 'ACTIVE' : 'INACTIVE'}
                            </Badge>
                          </div>
                          {item.subtitle && (
                            <p className="text-[11px] text-stone-500 truncate mt-0.5">
                              {item.subtitle}
                            </p>
                          )}
                          {(item.type === 'celebrity_edit' || item.type === 'wedding_edition') ? (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] font-semibold text-[#543925] bg-[#F8F5F0] px-2 py-0.5 rounded-md border border-[#543925]/20">
                                🛍️ {(() => {
                                  try {
                                    const parsed = JSON.parse(item.link_value || '[]')
                                    return Array.isArray(parsed) ? `${parsed.length} Products Attached` : '1 Product Attached'
                                  } catch {
                                    return 'Products Attached'
                                  }
                                })()}
                              </span>
                            </div>
                          ) : item.link_value ? (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {item.link_type === 'collection' ? (
                                <span className="text-[10px] font-semibold text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  📁 Collection: {item.link_value}
                                </span>
                              ) : item.link_type === 'product' ? (
                                <span className="text-[10px] font-semibold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                  🏷️ Product: {item.link_value}
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-stone-500 bg-stone-100 px-2 py-0.5 rounded border border-stone-200 truncate max-w-[200px]" title={item.link_value}>
                                  🔗 {item.link_value}
                                </span>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {/* Row Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleActive(item)
                          }}
                          className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                            item.active
                              ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                              : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                          }`}
                        >
                          {item.active ? 'Active' : 'Draft'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenEdit(item)
                          }}
                          className="p-1.5 hover:bg-stone-100 text-stone-600 rounded-lg border border-stone-200 transition-colors"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(item.id)
                          }}
                          className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg border border-transparent hover:border-red-200 transition-colors"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right Column: Clean Mobile Preview (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center">
            {/* View Mode Toggle */}
            <div className="mb-2 p-1 bg-stone-100 rounded-xl border border-stone-200 flex items-center gap-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setPreviewMode('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  previewMode === 'all'
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Combined Feed
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('section')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  previewMode === 'section'
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Section Only
              </button>
            </div>

            {/* Phone Frame */}
            <MobileMockPhone title="Mobile App Live Feed">
              <MobileHomeFeedMock
                carouselBanners={carouselBanners}
                activeLuxuryVideo={activeLuxuryVideo}
                stylingBanners={stylingBanners}
                celebrityBanners={celebrityBanners}
                viewMode={currentPreviewSection}
                activeSlideIdx={selectedPreviewSlideIdx}
                onSelectSlide={setSelectedPreviewSlideIdx}
              />
            </MobileMockPhone>
          </div>
        </div>
      ) : (
        /* 'All Items' Tab View */
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: C.border }}>
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: C.borderLight }}>
            <h3 className="font-semibold text-xs text-stone-800">All CMS Banners ({banners.length})</h3>
            <Btn small primary onClick={() => handleOpenCreateHero()}>
              + Add Item
            </Btn>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-stone-50 border-b text-stone-500 text-left" style={{ borderColor: C.borderLight }}>
                  <th className="p-3">Section</th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Subtitle / Muse</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {banners.map(b => (
                  <tr key={b.id} className="hover:bg-stone-50/70">
                    <td className="p-3 font-semibold text-stone-700 capitalize">
                      {b.type ? b.type.replace(/_/g, ' ') : 'Hero Carousel'}
                    </td>
                    <td className="p-3 font-medium text-stone-900">{b.title || 'Untitled'}</td>
                    <td className="p-3 text-stone-500">{b.subtitle || '—'}</td>
                    <td className="p-3">
                      <Badge color={b.active ? C.green : C.red} bg={b.active ? C.greenBg : C.redBg}>
                        {b.active ? 'ACTIVE' : 'DRAFT'}
                      </Badge>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(b)}
                        className="px-2 py-1 text-stone-700 bg-stone-100 hover:bg-stone-200 rounded font-semibold text-[11px]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(b.id)}
                        className="px-2 py-1 text-red-600 bg-red-50 hover:bg-red-100 rounded font-semibold text-[11px]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL DISPATCHER: ONLY ONE MODAL EVER MOUNTED (ZERO STACKING)
          ══════════════════════════════════════════════════════════════════════════ */}

      {/* ── 1. HERO BANNER CROPPER ── */}
      {activeModal === 'hero_crop' && (
        <HiloImageCropper
          mode="hero"
          initialImageUrl={cropperImageSrc || imageUrl}
          bannerTitle={title}
          bannerSubtitle={subtitle}
          slideCount={Math.max(carouselBanners.filter((b) => b && b.active !== false).length + (editBanner ? 0 : 1), 1)}
          slideIndex={editBanner ? Math.max(carouselBanners.filter((b) => b && b.active !== false).findIndex((b) => b.id === editBanner.id), 0) : carouselBanners.filter((b) => b && b.active !== false).length}
          onCropComplete={handleHeroCropComplete}
          onCancel={() => setActiveModal('hero_form')}
        />
      )}

      {/* ── 2. CELEBRITY THUMBNAIL CROPPER ── */}
      {activeModal === 'celebrity_crop' && (
        <HiloImageCropper
          mode="celebrity"
          initialImageUrl={cropperImageSrc || imageUrl}
          bannerTitle={title}
          bannerSubtitle={celebrityName || subtitle}
          onCropComplete={handleCelebrityCropComplete}
          onCancel={() => setActiveModal('celebrity_form')}
        />
      )}

      {/* ── 3. CELEBRITY CATALOG PRODUCT PICKER ── */}
      {activeModal === 'celebrity_picker' && (
        <CelebrityProductPickerModal
          isOpen={true}
          onClose={() => setActiveModal('celebrity_form')}
          initialSelectedIds={selectedProductIds}
          onApply={(ids, selectedObjs) => {
            setSelectedProductIds(ids)
            setLinkValue(JSON.stringify(ids))
            if (selectedObjs && selectedObjs.length > 0) {
              setSelectedProductsMap(prev => {
                const next = { ...prev }
                selectedObjs.forEach(o => {
                  if (o && o.id) next[o.id] = o
                })
                return next
              })
            }
            setActiveModal('celebrity_form')
          }}
        />
      )}

      {/* ── 4. HERO CAROUSEL BANNER MODAL ── */}
      {activeModal === 'hero_form' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setActiveModal(null) }}
        >
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-stone-200 max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between shrink-0 bg-stone-50">
              <div>
                <h2 className="text-sm font-bold text-stone-900">
                  {editBanner ? 'Edit Hero Banner' : 'New Hero Carousel Banner'}
                </h2>
                <p className="text-[11px] text-stone-500">
                  Top editorial cover slider on customer home feed
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-stone-400 hover:text-stone-700 text-sm p-1 font-bold"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSaveBanner('carousel')
              }}
              className="p-5 space-y-4 overflow-y-auto"
            >
              <Field label="Greeting / Title" required>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  placeholder="Hi there\nLet’s find your style."
                />
              </Field>

              <Field label="Subtitle">
                <Input
                  value={subtitle}
                  onChange={e => setSubtitle(e.target.value)}
                  placeholder="Discover designer looks styled around you."
                />
              </Field>

              {/* Banner Photo Upload with direct Crop Trigger */}
              <Field label="Banner Photo (3104 × 4058)" required>
                <input
                  ref={heroFormUploadRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleHeroFormFileSelect}
                />
                {imageUrl ? (
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden border border-stone-200 bg-stone-950 aspect-[3104/4058] max-h-52 w-auto mx-auto flex items-center justify-center shadow-inner">
                      <img src={imageUrl} alt="Cropped Banner" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => heroFormUploadRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg bg-white/90 text-stone-900 font-semibold text-xs shadow-md hover:bg-white"
                        >
                          Change Photo
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCropperImageSrc(imageUrl)
                            setActiveModal('hero_crop')
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500 text-white font-semibold text-xs shadow-md hover:bg-amber-600"
                        >
                          Adjust Crop
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span className="truncate max-w-[280px] font-mono text-[10px]">{imageUrl}</span>
                      <button
                        type="button"
                        onClick={() => heroFormUploadRef.current?.click()}
                        className="text-amber-700 font-semibold hover:underline"
                      >
                        Replace Image
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => heroFormUploadRef.current?.click()}
                    className="border-2 border-dashed border-stone-300 hover:border-amber-500 rounded-2xl p-6 text-center cursor-pointer bg-stone-50 hover:bg-amber-50/40 transition-colors"
                  >
                    <span className="text-3xl block mb-1.5">🖼️</span>
                    <span className="text-xs font-bold text-stone-800 block">Click to select photo from your computer</span>
                    <span className="text-[11px] text-stone-500 block mt-0.5">
                      Automatically opens high-precision mobile crop tool
                    </span>
                  </div>
                )}
              </Field>

              {/* CTA Navigation Destination */}
              <div className="pt-2 border-t border-stone-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-900 block">
                    Banner CTA Destination
                  </label>
                  <span className="text-[11px] text-stone-500">
                    What happens when user taps slide
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Link Type">
                    <Select
                      value={linkType}
                      onChange={e => {
                        const next = e.target.value
                        setLinkType(next)
                        if (next === 'none') setLinkValue('')
                      }}
                    >
                      <option value="none">None (No navigation)</option>
                      <option value="collection">Collection (Custom / Hidden / Nav)</option>
                      <option value="product">Product (Handle / ID)</option>
                      <option value="url">External / Custom URL</option>
                    </Select>
                  </Field>

                  {linkType === 'collection' ? (
                    <Field label="Target Collection">
                      <Select
                        value={linkValue}
                        onChange={e => setLinkValue(e.target.value)}
                      >
                        <option value="">— Select Collection —</option>
                        {availableCollections.map(c => (
                          <option key={c.id} value={c.handle}>
                            {c.title} ({c.handle}) {c.is_nav_visible === false ? '🔒 [CTA Only]' : ''}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : linkType === 'product' ? (
                    <Field label="Product Handle or ID">
                      <Input
                        value={linkValue}
                        onChange={e => setLinkValue(e.target.value)}
                        placeholder="e.g. varna-kanjivaram"
                      />
                    </Field>
                  ) : linkType === 'url' ? (
                    <Field label="URL">
                      <Input
                        value={linkValue}
                        onChange={e => setLinkValue(e.target.value)}
                        placeholder="https://... or /path"
                      />
                    </Field>
                  ) : (
                    <div className="flex items-center text-xs text-stone-400 italic pt-6">
                      Slide only displays photo
                    </div>
                  )}
                </div>
                {linkType === 'collection' && linkValue && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    🎯 Navigates to collection <b>{linkValue}</b>. If this is a hidden/CTA-only collection, users will directly view its product catalog upon tapping!
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 items-center pt-1">
                <Field label="Sort Order">
                  <Input
                    type="number"
                    value={sortOrder}
                    onChange={e => setSortOrder(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="hero-active-chk"
                    checked={active}
                    onChange={e => setActive(e.target.checked)}
                    className="w-4 h-4 accent-amber-600 rounded"
                  />
                  <label htmlFor="hero-active-chk" className="text-xs font-semibold text-stone-700 cursor-pointer">
                    Active on Mobile App
                  </label>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-stone-100">
                <Btn small type="button" onClick={() => setActiveModal(null)}>Cancel</Btn>
                <Btn small primary type="submit">Save Banner</Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 5. LUXURY IN MOTION VIDEO MODAL ── */}
      {activeModal === 'luxury_form' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setActiveModal(null) }}
        >
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-stone-200 max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between shrink-0 bg-stone-50">
              <div>
                <h2 className="text-sm font-bold text-stone-900">
                  {editBanner ? 'Edit Luxury Video' : 'New Luxury In Motion Video'}
                </h2>
                <p className="text-[11px] text-stone-500">
                  16:9 full showcase video player card (Limit 1 active video)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-stone-400 hover:text-stone-700 text-sm p-1 font-bold"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const vidId = extractYouTubeId(linkValue)
                const finalThumb = imageUrl || (vidId ? getYouTubeThumbnail(vidId, 'maxres') : null)
                handleSaveBanner('luxury_in_motion', {
                  link_type: 'url',
                  image_url: finalThumb,
                  mobile_image_url: finalThumb,
                })
              }}
              className="p-5 space-y-4 overflow-y-auto"
            >
              <Field label="Video Title" required>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  placeholder="Experience Hilo. Luxury In Motion."
                />
              </Field>

              <Field label="YouTube Video URL or ID" required>
                <div className="flex gap-2">
                  <Input
                    value={linkValue}
                    onChange={e => {
                      setLinkValue(e.target.value)
                      const vidId = extractYouTubeId(e.target.value)
                      if (vidId) {
                        handleExtractYouTube(e.target.value, false)
                      }
                    }}
                    required
                    placeholder="https://www.youtube.com/watch?v=... or shorts"
                  />
                  <button
                    type="button"
                    onClick={() => handleExtractYouTube(linkValue, false)}
                    className="px-3 py-1.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-xs font-semibold text-stone-700 shrink-0"
                  >
                    {fetchingMeta ? 'Fetching...' : 'Extract'}
                  </button>
                </div>
                {rawFetchedTitle && (
                  <p className="text-[11px] text-stone-500 mt-1 truncate">
                    Channel / Title: {rawFetchedTitle}
                  </p>
                )}
              </Field>

              {/* 16:9 Video Thumbnail Preview */}
              <Field label="Video Preview (16:9)">
                {linkValue && extractYouTubeId(linkValue) ? (
                  <div className="relative rounded-xl overflow-hidden border border-stone-300 bg-stone-900 aspect-video w-full shadow-inner flex items-center justify-center">
                    <img
                      src={imageUrl || getYouTubeThumbnail(linkValue, 'maxres')}
                      alt="Luxury Video Thumbnail"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const fb = getYouTubeThumbnail(linkValue, 'hq')
                        if (e.currentTarget.src !== fb) e.currentTarget.src = fb
                      }}
                    />
                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md border border-white/60 flex items-center justify-center text-white shadow-lg">
                        ▶
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border border-stone-200 rounded-xl p-5 text-center text-xs text-stone-400 bg-stone-50">
                    Paste YouTube URL above to view auto-generated video card
                  </div>
                )}
              </Field>

              <div className="grid grid-cols-2 gap-3 items-center pt-1">
                <Field label="Sort Order">
                  <Input
                    type="number"
                    value={sortOrder}
                    onChange={e => setSortOrder(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="luxury-active-chk"
                    checked={active}
                    onChange={e => setActive(e.target.checked)}
                    className="w-4 h-4 accent-amber-600 rounded"
                  />
                  <label htmlFor="luxury-active-chk" className="text-xs font-semibold text-stone-700 cursor-pointer">
                    Active (Replaces current active)
                  </label>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-stone-100">
                <Btn small type="button" onClick={() => setActiveModal(null)}>Cancel</Btn>
                <Btn small primary type="submit">Save Video</Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 6. STYLING MADE SIMPLE SHORTS MODAL ── */}
      {activeModal === 'styling_form' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setActiveModal(null) }}
        >
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-stone-200 max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between shrink-0 bg-stone-50">
              <div>
                <h2 className="text-sm font-bold text-stone-900">
                  {editBanner ? 'Edit Style Short' : 'New Styling Made Simple Short'}
                </h2>
                <p className="text-[11px] text-stone-500">
                  Vertical card deck for quick styling advice and shorts
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-stone-400 hover:text-stone-700 text-sm p-1 font-bold"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const vidId = extractYouTubeId(linkValue)
                const finalThumb = imageUrl || (vidId ? getYouTubeThumbnail(vidId, 'hq') : null)
                handleSaveBanner('styling_made_simple', {
                  link_type: 'url',
                  image_url: finalThumb,
                  mobile_image_url: finalThumb,
                })
              }}
              className="p-5 space-y-4 overflow-y-auto"
            >
              <Field label="Short Title (Max 5 Words Recommended)" required>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  placeholder="How To Find Your Fit"
                />
                {rawFetchedTitle && (
                  <div className="mt-1.5 p-2 bg-amber-50 rounded-lg border border-amber-200 text-xs flex items-center justify-between gap-2">
                    <span className="text-stone-700 text-[11px] truncate block" title={rawFetchedTitle}>
                      "{rawFetchedTitle}"
                    </span>
                    <button
                      type="button"
                      onClick={() => setTitle(cleanYouTubeTitle(rawFetchedTitle, 5))}
                      className="shrink-0 px-2 py-0.5 bg-white border border-amber-300 rounded text-[10px] font-bold text-amber-900 shadow-2xs"
                    >
                      Fit 5 Words
                    </button>
                  </div>
                )}
              </Field>

              <Field label="YouTube Shorts URL or Video Link" required>
                <div className="flex gap-2">
                  <Input
                    value={linkValue}
                    onChange={e => {
                      setLinkValue(e.target.value)
                      const vidId = extractYouTubeId(e.target.value)
                      if (vidId) {
                        handleExtractYouTube(e.target.value, true)
                      }
                    }}
                    required
                    placeholder="https://www.youtube.com/shorts/... or youtu.be"
                  />
                  <button
                    type="button"
                    onClick={() => handleExtractYouTube(linkValue, true)}
                    className="px-3 py-1.5 rounded-xl border border-stone-300 hover:bg-stone-50 text-xs font-semibold text-stone-700 shrink-0"
                  >
                    {fetchingMeta ? 'Fetching...' : 'Extract'}
                  </button>
                </div>
              </Field>

              {/* Vertical Card Preview */}
              <Field label="Card Preview (186 × 310)">
                {linkValue && extractYouTubeId(linkValue) ? (
                  <div className="relative rounded-2xl overflow-hidden border border-stone-300 bg-stone-900 w-36 h-56 mx-auto shadow-md flex items-center justify-center">
                    <img
                      src={imageUrl || getYouTubeThumbnail(linkValue, 'hq')}
                      alt="Shorts Thumbnail"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40 flex flex-col justify-between p-2.5">
                      <span className="px-2 py-0.5 rounded-full bg-black/60 text-white text-[9px] font-bold truncate max-w-[120px]">
                        {title || 'Style Tip'}
                      </span>
                      <div className="flex items-center justify-center my-auto">
                        <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md border border-white/60 flex items-center justify-center text-white text-xs shadow-md">
                          ▶
                        </div>
                      </div>
                      <span className="text-[9px] text-white/90 text-center font-medium">Watch Now →</span>
                    </div>
                  </div>
                ) : (
                  <div className="border border-stone-200 rounded-xl p-5 text-center text-xs text-stone-400 bg-stone-50">
                    Paste YouTube Shorts URL above to see card preview
                  </div>
                )}
              </Field>

              <div className="grid grid-cols-2 gap-3 items-center pt-1">
                <Field label="Sort Order">
                  <Input
                    type="number"
                    value={sortOrder}
                    onChange={e => setSortOrder(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="styling-active-chk"
                    checked={active}
                    onChange={e => setActive(e.target.checked)}
                    className="w-4 h-4 accent-amber-600 rounded"
                  />
                  <label htmlFor="styling-active-chk" className="text-xs font-semibold text-stone-700 cursor-pointer">
                    Active on Mobile App
                  </label>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-stone-100">
                <Btn small type="button" onClick={() => setActiveModal(null)}>Cancel</Btn>
                <Btn small primary type="submit">Save Short</Btn>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 7. CELEBRITY EDIT COLLECTION MODAL ── */}
      {activeModal === 'celebrity_form' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setActiveModal(null) }}
        >
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-stone-200 max-h-[92vh] flex flex-col">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between shrink-0 bg-stone-50">
              <div>
                <h2 className="text-sm font-bold text-stone-900">
                  {editBanner ? 'Edit Celebrity Look' : 'New Celebrity Look Collection'}
                </h2>
                <p className="text-[11px] text-stone-500">
                  Curated celebrity collection shown in "The Celebrity Edit" with "Shop the look"
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-stone-400 hover:text-stone-700 text-sm p-1 font-bold"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSaveBanner('celebrity_edit', {
                  subtitle: celebrityName.trim() || subtitle.trim() || null,
                  link_type: 'celebrity_look',
                  link_value: JSON.stringify(selectedProductIds),
                })
              }}
              className="p-5 space-y-4 overflow-y-auto"
            >
              <Field label="Collection Title" required>
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  placeholder="Groom Edition"
                />
              </Field>

              <Field label="Celebrity / Style Muse">
                <Input
                  value={celebrityName}
                  onChange={e => setCelebrityName(e.target.value)}
                  placeholder="Ranbir Kapoor Style"
                />
              </Field>

              <Field label="Button CTA Label">
                <Input
                  value={ctaLabel}
                  onChange={e => setCtaLabel(e.target.value)}
                  placeholder="Shop the look"
                />
              </Field>

              {/* Look Thumbnail Upload with Crop Trigger */}
              <Field label="Look Thumbnail (194 × 280 Aspect)" required>
                <input
                  ref={celebrityFormUploadRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCelebrityFormFileSelect}
                />
                {imageUrl ? (
                  <div className="flex items-center gap-4 p-3 bg-stone-50 rounded-xl border border-stone-200">
                    <div className="w-16 aspect-[194/280] rounded-lg overflow-hidden bg-stone-900 border border-stone-300 shrink-0">
                      <img src={imageUrl} alt="Look" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-stone-800 block truncate">Thumbnail Loaded</span>
                      <span className="text-[10px] text-stone-400 font-mono block truncate">{imageUrl}</span>
                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          type="button"
                          onClick={() => celebrityFormUploadRef.current?.click()}
                          className="text-xs text-amber-700 font-semibold hover:underline"
                        >
                          Replace Photo
                        </button>
                        <span className="text-stone-300">•</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCropperImageSrc(imageUrl)
                            setActiveModal('celebrity_crop')
                          }}
                          className="text-xs text-stone-700 font-semibold hover:underline"
                        >
                          Adjust Crop
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => celebrityFormUploadRef.current?.click()}
                    className="border-2 border-dashed border-stone-300 hover:border-amber-500 rounded-2xl p-5 text-center cursor-pointer bg-stone-50 hover:bg-amber-50/40 transition-colors"
                  >
                    <span className="text-2xl block mb-1">📸</span>
                    <span className="text-xs font-bold text-stone-800 block">Upload look thumbnail from computer</span>
                    <span className="text-[11px] text-stone-500 block mt-0.5">
                      Opens 194 × 280 mobile card cropper
                    </span>
                  </div>
                )}
              </Field>

              {/* Attached Products Section with Picker Trigger */}
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-stone-900 block">
                      Curated Products ({selectedProductIds.length})
                    </label>
                    <span className="text-[11px] text-stone-500">
                      Products shown when customer clicks "Shop the look"
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal('celebrity_picker')}
                    className="px-3 py-1.5 rounded-lg bg-[#543925] text-white text-xs font-semibold hover:bg-[#3d291a] transition-colors shadow-xs"
                  >
                    {selectedProductIds.length === 0 ? '+ Select Products' : 'Modify Selection'}
                  </button>
                </div>

                {selectedProductIds.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
                    {selectedProductIds.map(pid => {
                      const p = selectedProductsMap[pid]
                      return (
                        <div
                          key={pid}
                          className="flex items-center gap-2.5 p-2 rounded-xl bg-white border border-stone-200 shadow-2xs hover:border-stone-300 transition-colors"
                        >
                          <div className="w-10 h-12 rounded-lg bg-stone-100 overflow-hidden shrink-0 border border-stone-200">
                            <img
                              src={p?.imageUrl || '/hilo-hi.png'}
                              alt={p?.title || 'Garment'}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.currentTarget.src = '/hilo-hi.png' }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-semibold text-stone-900 truncate block">
                              {p?.title || pid}
                            </span>
                            <div className="flex items-center gap-1.5 text-[10px] text-stone-500 mt-0.5">
                              {p?.category && <span>{p.category}</span>}
                              {p?.price ? (
                                <span className="font-semibold text-stone-700">₹{p.price.toLocaleString('en-IN')}</span>
                              ) : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedProductIds(prev => prev.filter(id => id !== pid))}
                            className="w-5 h-5 rounded-full hover:bg-stone-100 flex items-center justify-center text-stone-400 hover:text-red-600 font-bold text-xs shrink-0"
                            title="Remove from edit"
                          >
                            ✕
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-stone-400 italic py-1">
                    No products attached yet. Click "+ Select Products" to pick garments from your catalog.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 items-center pt-1">
                <Field label="Sort Order">
                  <Input
                    type="number"
                    value={sortOrder}
                    onChange={e => setSortOrder(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="celeb-active-chk"
                    checked={active}
                    onChange={e => setActive(e.target.checked)}
                    className="w-4 h-4 accent-amber-600 rounded"
                  />
                  <label htmlFor="celeb-active-chk" className="text-xs font-semibold text-stone-700 cursor-pointer">
                    Active on Mobile App
                  </label>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-stone-100">
                <Btn small type="button" onClick={() => setActiveModal(null)}>Cancel</Btn>
                <Btn small primary type="submit">Save Collection</Btn>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useState, useEffect, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { Btn, Field, Input, Select, Badge } from '../orders/ui'

export default function MobileCmsTab() {
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editBanner, setEditBanner] = useState(null)

  // Form states
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [type, setType] = useState('carousel')
  const [imageUrl, setImageUrl] = useState('')
  const [mobileImageUrl, setMobileImageUrl] = useState('')
  const [linkType, setLinkType] = useState('none')
  const [linkValue, setLinkValue] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [active, setActive] = useState(true)

  const fetchBanners = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supa
        .from('cms_banners')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) throw error
      setBanners(data || [])
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

  const handleOpenCreate = () => {
    setEditBanner(null)
    setTitle('')
    setSubtitle('')
    setType('carousel')
    setImageUrl('')
    setMobileImageUrl('')
    setLinkType('none')
    setLinkValue('')
    setSortOrder('0')
    setActive(true)
    setShowModal(true)
  }

  const handleOpenEdit = (b) => {
    setEditBanner(b)
    setTitle(b.title || '')
    setSubtitle(b.subtitle || '')
    setType(b.type || 'carousel')
    setImageUrl(b.image_url || '')
    setMobileImageUrl(b.mobile_image_url || '')
    setLinkType(b.link_type || 'none')
    setLinkValue(b.link_value || '')
    setSortOrder(String(b.sort_order || 0))
    setActive(b.active ?? true)
    setShowModal(true)
  }

  const handleToggleActive = async (b) => {
    try {
      const { error } = await supa
        .from('cms_banners')
        .update({ active: !b.active, updated_at: new Date().toISOString() })
        .eq('id', b.id)

      if (error) throw error
      setBanners(prev => prev.map(item => item.id === b.id ? { ...item, active: !item.active } : item))
      toast(true, 'Banner status updated')
    } catch (e) {
      toast(false, 'Failed to toggle status: ' + e.message)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this promotional banner?')) return
    try {
      const { error } = await supa
        .from('cms_banners')
        .delete()
        .eq('id', id)

      if (error) throw error
      setBanners(prev => prev.filter(b => b.id !== id))
      toast(true, 'Banner deleted successfully')
    } catch (e) {
      toast(false, 'Failed to delete banner: ' + e.message)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    const payload = {
      title,
      subtitle: subtitle || null,
      type,
      image_url: imageUrl || null,
      mobile_image_url: mobileImageUrl || null,
      link_type: linkType,
      link_value: linkValue || null,
      sort_order: parseInt(sortOrder) || 0,
      active,
      updated_at: new Date().toISOString()
    }

    try {
      if (editBanner) {
        const { error } = await supa
          .from('cms_banners')
          .update(payload)
          .eq('id', editBanner.id)

        if (error) throw error
        toast(true, 'Banner updated successfully')
      } else {
        const { error } = await supa
          .from('cms_banners')
          .insert([payload])

        if (error) throw error
        toast(true, 'Banner created successfully')
      }
      
      setShowModal(false)
      fetchBanners()
    } catch (e) {
      toast(false, 'Failed to save: ' + e.message)
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: C.text }}>Mobile CMS</h1>
          <p className="text-sm mt-1" style={{ color: C.textMuted }}>
            Manage main promotional sliders, carousels, and featured campaign banners for the Shopper Mobile App
          </p>
        </div>
        <Btn primary onClick={handleOpenCreate}>
          Add New Banner
        </Btn>
      </div>

      {/* Grid of existing banners */}
      {loading ? (
        <div className="py-20 text-center text-sm" style={{ color: C.textMuted }}>Loading banners...</div>
      ) : banners.length === 0 ? (
        <div className="bg-white py-20 text-center border rounded-3xl" style={{ borderColor: C.border }}>
          <div className="text-4xl mb-3">🖼️</div>
          <div className="text-sm font-bold" style={{ color: C.text }}>No promotional banners found</div>
          <div className="text-xs mt-1 mb-4" style={{ color: C.textMuted }}>Create one to showcase collections or styles on the app homepage</div>
          <Btn primary onClick={handleOpenCreate}>Create First Banner</Btn>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {banners.map(b => (
            <div key={b.id} className="bg-white rounded-3xl border shadow-sm overflow-hidden flex flex-col justify-between" style={{ borderColor: C.border }}>
              {/* Banner image preview */}
              <div className="relative aspect-[16/9] bg-gray-100 border-b flex items-center justify-center overflow-hidden" style={{ borderColor: C.border }}>
                {b.image_url ? (
                  <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-gray-400">No banner image uploaded</span>
                )}
                <div className="absolute top-3 left-3 flex gap-1.5">
                  <Badge color={b.type === 'carousel' ? C.purple : C.blue} bg={b.type === 'carousel' ? C.purpleBg : C.blueBg}>
                    {b.type.toUpperCase()}
                  </Badge>
                  <Badge color={b.active ? C.green : C.red} bg={b.active ? C.greenBg : C.redBg}>
                    {b.active ? 'ACTIVE' : 'INACTIVE'}
                  </Badge>
                </div>
                <div className="absolute top-3 right-3 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Order: {b.sort_order}
                </div>
              </div>

              {/* Banner details */}
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-base" style={{ color: C.text }}>{b.title || 'Untitled Banner'}</h3>
                  {b.subtitle && <p className="text-xs mt-1" style={{ color: C.textMuted }}>{b.subtitle}</p>}
                  
                  <div className="mt-4 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Link Type:</span>
                      <span className="font-bold uppercase" style={{ color: C.text }}>{b.link_type}</span>
                    </div>
                    {b.link_value && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Destination:</span>
                        <span className="font-mono font-bold text-[10px]" style={{ color: C.text }}>{b.link_value}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-6 pt-4 border-t flex items-center justify-between" style={{ borderColor: C.borderLight }}>
                  <button
                    onClick={() => handleToggleActive(b)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all ${b.active ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                  >
                    {b.active ? 'Deactivate' : 'Activate'}
                  </button>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenEdit(b)}
                      className="p-2 hover:bg-gray-50 border rounded-xl text-gray-600 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="p-2 hover:bg-red-50 border border-transparent hover:border-red-200 text-red-500 rounded-xl transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-xl overflow-hidden border" style={{ borderColor: C.border }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.borderLight }}>
              <h2 className="text-base font-bold" style={{ color: C.text }}>
                {editBanner ? 'Edit Promotional Banner' : 'Create Promotional Banner'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <Field label="Banner Title" required>
                <Input value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. The Wedding Story" />
              </Field>

              <Field label="Subtitle / Tagline">
                <Input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="e.g. Crafted for Royalty" />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Placement Type">
                  <Select value={type} onChange={e => setType(e.target.value)}>
                    <option value="carousel">Carousel (Main Slider)</option>
                    <option value="featured">Featured Banner (Grid)</option>
                  </Select>
                </Field>
                <Field label="Sort Order / Priority">
                  <Input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} placeholder="0" />
                </Field>
              </div>

              <Field label="Desktop/Wide Image URL" required>
                <Input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} required placeholder="https://example.com/banner-desktop.jpg" />
              </Field>

              <Field label="Mobile Image URL (Optional)">
                <Input type="url" value={mobileImageUrl} onChange={e => setMobileImageUrl(e.target.value)} placeholder="https://example.com/banner-mobile.jpg" />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Click Action Destination">
                  <Select value={linkType} onChange={e => setLinkType(e.target.value)}>
                    <option value="none">None</option>
                    <option value="collection">Collection Name</option>
                    <option value="product">Product Style Code / ID</option>
                    <option value="url">External Link URL</option>
                  </Select>
                </Field>
                {linkType !== 'none' && (
                  <Field label="Destination Reference" required>
                    <Input value={linkValue} onChange={e => setLinkValue(e.target.value)} required placeholder={linkType === 'url' ? 'https://...' : 'e.g. Kurta'} />
                  </Field>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="active-chk" checked={active} onChange={e => setActive(e.target.checked)} className="w-4 h-4 accent-amber-500" />
                <label htmlFor="active-chk" className="text-xs font-semibold text-gray-600 cursor-pointer">Activate banner immediately on the storefront</label>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t" style={{ borderColor: C.borderLight }}>
                <Btn type="button" onClick={() => setShowModal(false)}>Cancel</Btn>
                <Btn primary type="submit">Save Banner</Btn>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

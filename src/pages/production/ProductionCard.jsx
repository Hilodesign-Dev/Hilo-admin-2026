import React, { useState, useRef, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, fmtDate, stageColor, PRODUCTION_STAGES, DELIVERY_TYPES } from '../../lib/designTokens'
import { checkAutoAdvance } from '../../lib/stateMachine'
import { _logChange, logAndToast } from '../../lib/logger'
import { uploadImage } from '../../lib/storage'
import { fetchPrintData, printProductionSlip } from '../../lib/productionPrint'
import { filterProductionManagers, vendorsForStageWithAssigned, resolveStaffName } from '../../lib/helpers'


const Badge = ({ children, color = C.gold, bg }) => (
  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold inline-flex items-center whitespace-nowrap" style={{ background: bg || `${color}18`, color }}>
    {children}
  </span>
)

const ProductionCard = ({ item, order, teamMembers, vendors, fabricVendors = [], products, onSelectDetail, onUpdate }) => {
  const [updatingField, setUpdatingField] = useState(null)
  const [imgIdx, setImgIdx] = useState(0)
  const [customImages, setCustomImages] = useState(item.custom_images || [])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const isCustom = (item.type || '').toLowerCase() === 'custom'
  const isAppOrder = (order?.order_origin || '') === 'customer_api' || String(order?.order_number || item.order_number || '').startsWith('APP-')
  const addr = order?.shipping_address && typeof order.shipping_address === 'object' ? order.shipping_address : null
  const customerName = order?.customer_name || addr?.name || ''
  const customerPhone = order?.buyer_phone || order?.customer_phone || addr?.phone || ''
  const customerEmail = order?.customer_email || ''
  const customerLoc = [addr?.city, addr?.state, addr?.pincode].filter(Boolean).join(', ')
  const payNote = String(order?.notes || '').match(/\b(COD|ONLINE)\b/i)?.[1]

  const catalogueProduct = (products || []).find(p => {
    if (!p) return false
    const sku = (item.sku || '').trim()
    if (p.styleCode && sku && (sku === p.styleCode || sku.startsWith(p.styleCode) || p.styleCode.startsWith(sku))) return true
    if (p.id && sku && String(p.id) === sku) return true
    const itemTitle = (item.title || '').split(/[–—]/)[0].trim().toLowerCase()
    const pTitle = (p.productTitle || p.title || p.productName || '').toLowerCase()
    return itemTitle.length >= 4 && pTitle && (pTitle.includes(itemTitle) || itemTitle.includes(pTitle))
  })

  const asUrl = (u) => {
    if (!u) return null
    if (typeof u === 'string') return u
    return u.src || u.url || null
  }
  const storedImages = [
    ...(customImages || []),
    ...(Array.isArray(item.custom_images) ? item.custom_images : []),
    item.image_url,
  ].map(asUrl).filter(Boolean)
  const catalogueImages = catalogueProduct?.shopify_images?.length > 0
    ? catalogueProduct.shopify_images.map(asUrl)
    : catalogueProduct?.image_url ? [catalogueProduct.image_url] : []
  const images = [...new Set((isCustom ? storedImages : [...catalogueImages, ...storedImages]).filter(Boolean))]

  const updateField = async (field, value) => {
    setUpdatingField(field)
    try {
      const { error } = await supa.from('order_line_items').update({ [field]: value }).eq('id', item.id)
      if (error) throw error
      toast(true, 'Updated')
      if (field === 'production_stage') await checkAutoAdvance(item.order_id)
      // Granular patch — parent will swap the row in items[] without re-fetching/sorting
      onUpdate({ itemId: item.id, fields: { [field]: value } })
    } catch (e) {
      logAndToast('production-update', `Failed to update ${field} for ${item.title || item.sku}`, e)
    } finally { setUpdatingField(null) }
  }

  const handleUploadImages = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    try {
      const urls = []
      for (const file of files) {
        const url = await uploadImage(file, `production/${item.id}`)
        if (url) urls.push(url)
      }
      const updated = [...customImages, ...urls]
      setCustomImages(updated)
      const { error } = await supa.from('order_line_items').update({ custom_images: updated }).eq('id', item.id)
      if (error) throw error
      toast(true, `${urls.length} image(s) uploaded`)
      onUpdate({ itemId: item.id, fields: { custom_images: updated } })
    } catch (e) {
      logAndToast('image-upload', 'Failed to upload image', e)
    } finally { setUploading(false) }
  }

  const handleQuickPrint = async (e) => {
    e.stopPropagation()
    try {
      const data = await fetchPrintData(item, order)
      printProductionSlip({
        item,
        order,
        teamMembers,
        measurements: data.measurements,
        styleProfiles: data.styleProfiles,
        buyerInfo: data.buyerInfo,
        images,
        catalogueProduct,
      })
    } catch (err) {
      logAndToast('production-print', 'Failed to open print slip', err)
    }
  }

  const prevImg = (e) => { e.stopPropagation(); setImgIdx(i => i > 0 ? i - 1 : images.length - 1) }
  const nextImg = (e) => { e.stopPropagation(); setImgIdx(i => i < images.length - 1 ? i + 1 : 0) }

  // Reset index when images change
  useEffect(() => { if (imgIdx >= images.length) setImgIdx(0) }, [images.length])

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(27,28,26,0.04)' }}>
      {/* Image area with badges */}
      <div className="relative h-72 bg-gray-50 cursor-pointer" onClick={() => onSelectDetail(item)}>
        {images.length > 0 ? (
          <img src={images[imgIdx] || images[0]} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-16 h-16" style={{ color: C.textLight }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
        )}

        {/* Order ID badge - top left */}
        <div className="absolute top-2 left-2">
          <span className="text-[11px] px-3 py-1 rounded-lg font-bold" style={{ background: 'rgba(45,40,35,0.75)', color: '#fff', backdropFilter: 'blur(4px)' }}>
            {item.order_number}
          </span>
        </div>

        {/* Type + Size badge - top right */}
        <div className="absolute top-2 right-2 flex gap-1.5">
          <span className="text-[11px] px-3 py-1 rounded-lg font-bold" style={{ background: isCustom ? 'rgba(180,90,60,0.85)' : 'rgba(80,140,80,0.85)', color: '#fff', backdropFilter: 'blur(4px)' }}>
            {item.type || 'General'}{item.size ? ` - ${item.size}` : ''}
          </span>
        </div>

        {/* Image navigation arrows */}
        {images.length > 1 && (
          <>
            <button onClick={prevImg} className="absolute left-2 bottom-3 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={nextImg} className="absolute right-2 bottom-3 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </>
        )}

        {/* Image dots indicator */}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i === imgIdx ? '#fff' : 'rgba(255,255,255,0.4)' }} />
            ))}
          </div>
        )}
      </div>

      {/* Info section */}
      <div className="p-4 space-y-2">
        {/* Stylist row */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Stylist:</span>
          {item.stylist ? <Badge color="#e85d3a" bg="rgba(232,93,58,0.12)">{resolveStaffName(teamMembers, item.stylist)}</Badge> : <span className="text-xs" style={{ color: C.textLight }}>—</span>}
          <span className="text-xs ml-auto" style={{ color: C.textMuted }}>Qty: <b>{item.quantity || 1}</b></span>
        </div>

        {/* Product name */}
        <div className="text-sm font-bold cursor-pointer hover:underline" style={{ color: '#e85d3a' }} onClick={() => onSelectDetail(item)}>
          Product: {item.title || '—'}
        </div>

        {/* Customer */}
        <div className="text-xs" style={{ color: C.text }}>
          <b>Customer:</b> {customerName || '—'}
        </div>
        {(customerEmail || customerPhone) && (
          <div className="text-[10px] truncate" style={{ color: C.textMuted }}>
            {customerEmail}{customerEmail && customerPhone ? ' · ' : ''}{customerPhone}
          </div>
        )}
        {customerLoc && (
          <div className="text-[10px] truncate" style={{ color: C.textMuted }}>{customerLoc}</div>
        )}

        {/* Delivery date */}
        <div className="text-xs" style={{ color: C.text }}>
          <b>Delivery date:</b> {fmtDate(item.est_shipping_date)}
        </div>

        {/* Channel + Print row */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs" style={{ color: C.textMuted }}>Channel:</span>
          {order?.channel && <Badge color="#fff" bg={C.green}>{order.channel}</Badge>}
          {isAppOrder && <Badge color="#fff" bg="#2563eb">App{payNote ? ` · ${payNote.toUpperCase()}` : ''}</Badge>}
          {item.size && <Badge color={C.text} bg="rgba(0,0,0,0.06)">{item.size}</Badge>}
          <button onClick={handleQuickPrint} className="ml-auto text-xs px-3 py-1.5 rounded-lg font-bold" style={{ background: C.goldDark, color: '#fff' }}>
            Print
          </button>
        </div>

        {/* Custom product: upload images */}
        {isCustom && (
          <div className="pt-1">
            <input type="file" ref={fileRef} multiple accept="image/*" className="hidden" onChange={handleUploadImages} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="text-[10px] px-2 py-1 rounded font-bold" style={{ background: C.goldLight, color: C.goldDark, border: `1px solid ${C.gold}22` }}>
              {uploading ? 'Uploading…' : 'Upload Images'}
            </button>
          </div>
        )}
      </div>

      {/* Dropdowns section */}
      <div className="border-t p-3 space-y-2" style={{ borderColor: C.border, background: C.bg }}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-[9px] font-bold uppercase mb-0.5" style={{ color: C.textMuted }}>Product Ex.</div>
            <select value={item.product_executive || ''} onChange={e => updateField('product_executive', e.target.value)} disabled={updatingField === 'product_executive'}
              className="w-full text-xs px-2 py-1.5 rounded-lg outline-none" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }}>
              <option value="">—</option>
              {filterProductionManagers(teamMembers).map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase mb-0.5" style={{ color: C.textMuted }}>Delivery type</div>
            <select value={item.delivery_type || ''} onChange={e => updateField('delivery_type', e.target.value)} disabled={updatingField === 'delivery_type'}
              className="w-full text-xs px-2 py-1.5 rounded-lg outline-none" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }}>
              <option value="">—</option>
              {DELIVERY_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase mb-0.5" style={{ color: C.textMuted }}>Select a vendor</div>
            {(() => {
              const { options: vendorOptions, selectValue: vendorValue } = vendorsForStageWithAssigned(item.production_stage, vendors, fabricVendors, item.vendor_assigned)
              return (
                <select value={vendorValue} onChange={e => updateField('vendor_assigned', e.target.value)} disabled={updatingField === 'vendor_assigned'}
                  className="w-full text-xs px-2 py-1.5 rounded-lg outline-none" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="">—</option>
                  {vendorOptions.map(v => (
                    <option key={v.id} value={v.name}>
                      {v.name}{v._orphan ? ' (legacy)' : ''}
                    </option>
                  ))}
                </select>
              )
            })()}
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase mb-0.5" style={{ color: C.textMuted }}>Stage</div>
            <select value={item.production_stage || ''} onChange={e => updateField('production_stage', e.target.value)} disabled={updatingField === 'production_stage'}
              className="w-full text-xs px-2 py-1.5 rounded-lg outline-none" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }}>
              <option value="">—</option>
              {PRODUCTION_STAGES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProductionCard

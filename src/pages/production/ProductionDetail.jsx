import React, { useState, useEffect, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { printProductionSlip } from '../../lib/productionPrint'
import { resolveStaffName } from '../../lib/helpers'
import { C, toast, fmtDate, stageColor, TOP_MEASUREMENTS, BOTTOM_MEASUREMENTS, READY_MEASUREMENT_PANELS, READY_GARMENT_FIELDS, SMART_FIT_FIELDS } from '../../lib/designTokens'
import { uploadImage } from '../../lib/storage'
import { logAndToast } from '../../lib/logger'
import FabricPicker from '../../components/FabricPicker'

const REF_IMAGE_TAGS = ['Pattern', 'Embroidery Art', 'Embroidery Material', 'Embroidery Position', 'Colour Reference', 'Design Reference', 'Fabric Reference', 'Other']

const Badge = ({ children, color = C.gold, bg }) => (
  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold inline-flex items-center whitespace-nowrap" style={{ background: bg || `${color}18`, color }}>
    {children}
  </span>
)

const Btn = ({ children, onClick, primary, danger, small, disabled, ...rest }) => {
  const base = 'font-bold rounded-xl transition-all inline-flex items-center justify-center gap-1.5'
  const sz = small ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2.5'
  const bg = danger ? C.red : primary ? C.gold : 'transparent'
  return <button onClick={onClick} disabled={disabled} className={`${base} ${sz}`} style={{ background: bg, border: primary || danger ? 'none' : `1px solid ${C.border}`, color: primary || danger ? '#fff' : C.text, opacity: disabled ? 0.4 : 1, ...rest.style }} {...rest}>{children}</button>
}

const formatMeasurement = (val) => val ? `${val}` : '—'

/**
 * Reusable per-section measurement editor.
 *
 * Renders a grid of predefined fields with '—' for missing values.
 * Edit button toggles a save form; onSave receives a plain {key: value}
 * object that the parent persists. Empty strings are saved as null so
 * Supabase numeric columns don't choke (matches the codebase rule).
 */
const MeasurementSection = ({ title, fields, data, onSave, emptyTag = 'Not yet entered' }) => {
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const buildForm = (src) => {
    const out = {}
    fields.forEach(f => {
      const v = src ? src[f.key] : null
      out[f.key] = (v == null || v === '') ? '' : String(v)
    })
    return out
  }
  const [form, setForm] = React.useState(() => buildForm(data))
  React.useEffect(() => { if (!editing) setForm(buildForm(data)) }, [data, editing])

  const hasAny = fields.some(f => data && data[f.key] != null && data[f.key] !== '')

  const handleSave = async () => {
    setSaving(true)
    try {
      // Sanitize: empty string -> null; numeric where applicable
      const out = {}
      fields.forEach(f => {
        const v = form[f.key]
        if (v === '' || v === undefined || v === null) { out[f.key] = null }
        else if (f.type === 'number') { const n = Number(v); out[f.key] = isFinite(n) ? n : null }
        else { out[f.key] = v }
      })
      await onSave(out)
      setEditing(false)
    } finally { setSaving(false) }
  }
  const handleCancel = () => { setForm(buildForm(data)); setEditing(false) }

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b" style={{ borderColor: C.border }}>
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-bold uppercase" style={{ color: C.textMuted }}>{title}</h3>
          {!hasAny && !editing && <span className="text-[10px] uppercase font-bold" style={{ color: C.textLight }}>{emptyTag}</span>}
        </div>
        {!editing
          ? <button onClick={() => setEditing(true)} className="text-[11px] font-bold px-3 py-1 rounded" style={{ background: C.goldLight, color: C.goldDark, border: 'none' }}>Edit</button>
          : (
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="text-[11px] font-bold px-3 py-1 rounded" style={{ background: C.green, color: '#fff', border: 'none', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={handleCancel} className="text-[11px] font-bold px-3 py-1 rounded" style={{ background: C.borderLight, color: C.text, border: 'none' }}>Cancel</button>
            </div>
          )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {fields.map(f => (
          <div key={f.key} className="p-3 rounded-lg" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
            <div className="text-[10px] font-bold uppercase mb-1" style={{ color: C.textMuted }}>{f.label}</div>
            {editing ? (
              f.type === 'select' && Array.isArray(f.options) ? (
                <select value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} className="w-full text-sm px-2 py-1 rounded outline-none" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }}>
                  <option value="">—</option>
                  {f.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input type="text" inputMode={f.type === 'number' ? 'decimal' : 'text'} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder="—" className="w-full text-sm px-2 py-1 rounded outline-none" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }} />
              )
            ) : (
              <div className="text-sm font-bold" style={{ color: C.text }}>{(data && data[f.key] != null && data[f.key] !== '') ? data[f.key] : '—'}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const ProductionDetail = ({ item, order, products, fabrics, dyes, onBack, onEdit, onUpdate, initialTab, teamMembers = [] }) => {
  const [activeTab, setActiveTab] = useState(initialTab || 'details')
  const [measurements, setMeasurements] = useState(null)
  const [styleProfiles, setStyleProfiles] = useState(null)
  const [loadingMeasurements, setLoadingMeasurements] = useState(false)
  const [imgIdx, setImgIdx] = useState(0)
  const [customImages, setCustomImages] = useState(item.custom_images || [])
  const [refImages, setRefImages] = useState(item.reference_images || [])
  const [uploading, setUploading] = useState(false)
  const [colourRefProduct, setColourRefProduct] = useState(null)
  const [colourRefSearch, setColourRefSearch] = useState('')
  const [colours, setColours] = useState([])
  const [fabricId, setFabricId] = useState(item.fabric_id || '')
  const [fabricName, setFabricName] = useState(item.fabric_name || '')
  const [fabricSearch, setFabricSearch] = useState('')
  const [fabricDropdownOpen, setFabricDropdownOpen] = useState(false)
  const [colour, setColour] = useState(item.colour || '')
  const [colourHex, setColourHex] = useState(item.colour_hex || '')
  const [dyeCode, setDyeCode] = useState(item.dye_code || '')
  const [customNotes, setCustomNotes] = useState(item.customization_notes || item.custom_requirements || '')
  const [saving, setSaving] = useState(false)
  const [specDirty, setSpecDirty] = useState(false)
  const [untaggedImages, setUntaggedImages] = useState([]) // newly uploaded images awaiting tag
  const [buyerInfo, setBuyerInfo] = useState(null) // { email, phone, name } from buyers table
  const fileRef = useRef(null)
  const refImageFileRef = useRef(null)
  const fabricDropdownRef = useRef(null)

  const isCustom = (item.type || '').toLowerCase() === 'custom'

  // Fetch colour master for editable colour picker
  useEffect(() => {
    supa.from('colour_master').select('*').eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setColours(data) })
  }, [])

  // Close fabric dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (fabricDropdownRef.current && !fabricDropdownRef.current.contains(e.target)) {
        setFabricDropdownOpen(false)
        setFabricSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Save a single field to Supabase (inline edit).
  // NOTE: Supabase JS v2's .update() returns {error, data} — it does NOT
  // throw on RLS / column / 4xx failures. Always inspect `error` or the
  // failure is swallowed and the user sees a green checkmark that lied.
  const saveField = async (field, value) => {
    setSaving(true)
    try {
      const { error } = await supa.from('order_line_items').update({ [field]: value }).eq('id', item.id)
      if (error) throw error
      if (onUpdate) onUpdate({ [field]: value })
    } catch (e) {
      logAndToast('inline-save', `Failed to save ${field}: ` + (e.message || e), e)
    } finally { setSaving(false) }
  }

  // Batch save the staged spec fields (fabric / colour / dye / notes / ref)
  // in a single UPDATE, so a fabric pick that depends on a colour pick
  // doesn't race and so the user can see "saved" or "failed" once.
  const saveSpec = async () => {
    setSaving(true)
    try {
      const patch = {
        fabric_id: fabricId || null,
        fabric_name: fabricName || null,
        colour: colour || null,
        colour_hex: colourHex || null,
        dye_code: dyeCode || null,
        customization_notes: customNotes || null,
      }
      const { error } = await supa.from('order_line_items').update(patch).eq('id', item.id)
      if (error) throw error
      if (onUpdate) onUpdate(patch)
      setSpecDirty(false)
      toast(true, 'Saved')
    } catch (e) {
      logAndToast('save-spec', 'Failed to save: ' + (e.message || e), e)
    } finally { setSaving(false) }
  }

  // Upsert into customer_measurements. patch = { chest: 40, ... } flat numerics.
  const saveBodyMeasurements = async (patch) => {
    if (!resolvedCustomerId) { toast(false, 'Link a customer first'); return }
    const sanitized = {}
    for (const [k, v] of Object.entries(patch || {})) {
      if (v === '' || v === undefined || v === null) sanitized[k] = null
      else if (typeof v === 'number') sanitized[k] = v
      else if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) sanitized[k] = Number(v)
      else sanitized[k] = v
    }
    setSaving(true)
    try {
      if (measurements?.id) {
        const { error } = await supa.from('customer_measurements')
          .update({ ...sanitized, updated_at: new Date().toISOString() })
          .eq('id', measurements.id)
        if (error) throw error
        setMeasurements(m => ({ ...(m || {}), ...sanitized }))
      } else {
        const { data, error } = await supa.from('customer_measurements')
          .insert({ customer_id: resolvedCustomerId, is_active: true, measured_by: (typeof window !== 'undefined' && window.__hilo_user_name) || null, ...sanitized })
          .select().single()
        if (error) throw error
        setMeasurements(data)
      }
      toast(true, 'Saved')
    } catch (e) {
      logAndToast('save-body-measurements', 'Failed to save: ' + (e.message || e), e)
    } finally { setSaving(false) }
  }

  // Upsert a panel JSONB (shirt_measurements / kurtha_measurements / …)
  // on customer_style_profiles. panelKey is the JSONB column name itself.
  const saveReadyMeasurement = async (panelKey, patch) => {
    if (!resolvedCustomerId) { toast(false, 'Link a customer first'); return }
    const sanitized = {}
    for (const [k, v] of Object.entries(patch || {})) {
      if (v === '' || v === undefined || v === null) sanitized[k] = null
      else if (typeof v === 'number') sanitized[k] = v
      else if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) sanitized[k] = Number(v)
      else sanitized[k] = v
    }
    const existingPanel = (styleProfiles && styleProfiles[panelKey]) || {}
    const next = { ...existingPanel, ...sanitized }
    setSaving(true)
    try {
      if (styleProfiles?.id) {
        const { error } = await supa.from('customer_style_profiles')
          .update({ [panelKey]: next, updated_at: new Date().toISOString() })
          .eq('id', styleProfiles.id)
        if (error) throw error
        setStyleProfiles(prev => ({ ...(prev || {}), [panelKey]: next }))
      } else {
        const { data, error } = await supa.from('customer_style_profiles')
          .insert({ customer_id: resolvedCustomerId, [panelKey]: next })
          .select().single()
        if (error) throw error
        setStyleProfiles(data)
      }
      toast(true, 'Saved')
    } catch (e) {
      logAndToast('save-ready-measurements', 'Failed to save: ' + (e.message || e), e)
    } finally { setSaving(false) }
  }

  const selectedFabric = (fabrics || []).find(f => f.id === fabricId)

  // Find catalogue product by SKU
  const catalogueProduct = (products || []).find(p =>
    p.styleCode && item.sku && (item.sku === p.styleCode || item.sku.startsWith(p.styleCode))
  )

  // Build reference image URLs with their tags for display
  const refImgs = refImages.map(r => ({ url: r.url, tag: (r.tags || []).join(', '), isRef: true }))

  // Add colour reference product image if selected
  const colourRefImg = colourRefProduct ? [{
    url: colourRefProduct.image_url || (colourRefProduct.shopify_images?.[0] || ''),
    tag: `Colour Reference: ${colourRefProduct.styleCode}`,
    isRef: true,
  }] : []

  const baseImages = isCustom
    ? (customImages.length > 0 ? customImages : [])
    : (catalogueProduct?.shopify_images?.length > 0
        ? catalogueProduct.shopify_images.map(i => typeof i === 'string' ? i : i.src || i.url || '')
        : catalogueProduct?.image_url ? [catalogueProduct.image_url] : [])

  // Combine: base images (plain URLs) + reference images (objects with tag) + colour ref image
  const allImages = [
    ...baseImages.map(u => ({ url: u, tag: '', isRef: false })),
    ...colourRefImg,
    ...refImgs,
  ]
  const images = allImages.map(i => i.url)

  // DB-level trigger trg_ensure_order_customer + the cascade UPDATE on
  // order_line_items guarantee every (order, line) has customer_id set
  // before it can enter the system. So this is now a simple two-source
  // read with a belt-and-braces backfill if the line column missed it.
  const [resolvedCustomerId, setResolvedCustomerId] = useState(
    item.customer_id || order?.customer_id || order?.buyer_customer_id || null
  )

  useEffect(() => {
    const resolved = item.customer_id || order?.customer_id || order?.buyer_customer_id || null
    if (resolved && resolved !== resolvedCustomerId) {
      setResolvedCustomerId(resolved)
      if (!item.customer_id) {
        supa.from('order_line_items').update({ customer_id: resolved }).eq('id', item.id)
          .then(({ error }) => { if (error) console.error('Backfill line customer_id failed:', error) })
      }
    }
  }, [item.customer_id, item.id, order?.customer_id, order?.buyer_customer_id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch buyer info (email, phone) from customers → buyers when we have a customer_id
  useEffect(() => {
    if (!resolvedCustomerId) return
    supa.from('customers').select('buyer_id, name, phone').eq('id', resolvedCustomerId).limit(1).single()
      .then(({ data: cust }) => {
        if (!cust?.buyer_id) return
        supa.from('buyers').select('email, phone, name').eq('id', cust.buyer_id).limit(1).single()
          .then(({ data: buyer }) => {
            if (buyer) setBuyerInfo({ email: buyer.email || '', phone: buyer.phone || cust.phone || '', name: buyer.name || cust.name || '' })
          })
      })
  }, [resolvedCustomerId])

  useEffect(() => {
    if ((activeTab === 'measurements' || activeTab === 'ready_measurements') && resolvedCustomerId) {
      if (!measurements) {
        setLoadingMeasurements(true)
        supa.from('customer_measurements').select('*').eq('customer_id', resolvedCustomerId).eq('is_active', true).limit(1)
          .then(({ data }) => { setMeasurements(data?.[0] || null); setLoadingMeasurements(false) })
      }
      if (!styleProfiles) {
        supa.from('customer_style_profiles').select('*').eq('customer_id', resolvedCustomerId).limit(1)
          .then(({ data }) => { setStyleProfiles(data?.[0] || null) })
      }
    }
  }, [activeTab, resolvedCustomerId, measurements, styleProfiles])

  // Auto-switch to print if requested
  useEffect(() => {
    if (initialTab === 'print') {
      const cid = resolvedCustomerId
      if (cid) {
        Promise.all([
          supa.from('customer_measurements').select('*').eq('customer_id', cid).eq('is_active', true).limit(1),
          supa.from('customer_style_profiles').select('*').eq('customer_id', cid).limit(1),
        ]).then(([mRes, spRes]) => {
          setMeasurements(mRes.data?.[0] || null)
          setStyleProfiles(spRes.data?.[0] || null)
          setTimeout(() => handlePrint(mRes.data?.[0], spRes.data?.[0]), 300)
        })
      } else {
        setTimeout(() => handlePrint(null, null), 300)
      }
      setActiveTab('details')
    }
  }, [initialTab, resolvedCustomerId])

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
      await supa.from('order_line_items').update({ custom_images: updated }).eq('id', item.id)
    } catch (e) {
      logAndToast('image-upload', 'Failed to upload', e)
    } finally { setUploading(false) }
  }

  const handleUploadRefImages = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    try {
      const urls = []
      for (const file of files) {
        const url = await uploadImage(file, `production/${item.id}/references`)
        if (url) urls.push(url)
      }
      // Add to untagged queue — user will tag them after upload
      setUntaggedImages(prev => [...prev, ...urls.map(url => ({ url, tag: '' }))])
    } catch (e) {
      logAndToast('ref-image-upload', 'Failed to upload reference image', e)
    } finally { setUploading(false) }
  }

  // Tag an untagged image and save it to reference_images
  const tagUntaggedImage = (idx, tag) => {
    const updated = [...untaggedImages]
    updated[idx] = { ...updated[idx], tag }
    setUntaggedImages(updated)
  }

  const saveTaggedImage = async (idx) => {
    const img = untaggedImages[idx]
    if (!img?.tag) return
    const newRef = { url: img.url, tags: [img.tag] }
    const updatedRefs = [...refImages, newRef]
    setRefImages(updatedRefs)
    setUntaggedImages(prev => prev.filter((_, i) => i !== idx))
    await supa.from('order_line_items').update({ reference_images: updatedRefs }).eq('id', item.id)
  }

  const saveAllTaggedImages = async () => {
    const tagged = untaggedImages.filter(img => img.tag)
    if (tagged.length === 0) return
    const newRefs = tagged.map(img => ({ url: img.url, tags: [img.tag] }))
    const updatedRefs = [...refImages, ...newRefs]
    setRefImages(updatedRefs)
    setUntaggedImages(prev => prev.filter(img => !img.tag))
    await supa.from('order_line_items').update({ reference_images: updatedRefs }).eq('id', item.id)
  }

  const removeUntaggedImage = (idx) => {
    setUntaggedImages(prev => prev.filter((_, i) => i !== idx))
  }

  const handleAddColourRef = (product) => {
    setColourRefProduct(product)
    setColourRefSearch('')
  }

  const handleRemoveColourRef = () => {
    setColourRefProduct(null)
  }

  const deleteImage = async (idx) => {
    const updated = customImages.filter((_, i) => i !== idx)
    setCustomImages(updated)
    setImgIdx(0)
    await supa.from('order_line_items').update({ custom_images: updated }).eq('id', item.id)
  }

  const prevImg = () => setImgIdx(i => i > 0 ? i - 1 : images.length - 1)
  const nextImg = () => setImgIdx(i => i < images.length - 1 ? i + 1 : 0)

  /* ─── PRINT HANDLER (thin wrapper around shared productionPrint helper) ─── */
  const handlePrint = (meas, sprof) => {
    printProductionSlip({
      item,
      order,
      teamMembers,
      measurements: meas || measurements,
      styleProfiles: sprof || styleProfiles,
      buyerInfo,
      images,
      catalogueProduct,
    })
  }

  const tabLabels = [
    { key: 'details', label: 'Details' },
    { key: 'measurements', label: 'Measurements' },
    { key: 'ready_measurements', label: 'Ready Measurement' },
  ]

  return (
    <div>
      {/* Back button */}
      <div className="mb-4 flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 -ml-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b" style={{ borderColor: C.border }}>
        {tabLabels.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className="px-4 py-3 text-sm font-bold border-b-2 transition-all" style={{
              borderColor: activeTab === tab.key ? C.gold : 'transparent',
              color: activeTab === tab.key ? C.gold : C.textMuted,
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Details Tab ──────────────────────────────────────────── */}
      {activeTab === 'details' && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* ── Left: Image carousel ────────────────────────── */}
          <div className="md:col-span-2">
            <div className="relative rounded-xl overflow-hidden bg-gray-50 mb-3" style={{ aspectRatio: '4/5', border: `1px solid ${C.border}` }}>
              {images.length > 0 ? (
                <img src={images[imgIdx] || images[0]} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-16 h-16" style={{ color: C.textLight }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
              )}
              {allImages[imgIdx]?.isRef && allImages[imgIdx]?.tag && (
                <div className="absolute bottom-2 left-2">
                  <span className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: 'rgba(212,168,67,0.9)', color: '#fff' }}>{allImages[imgIdx].tag}</span>
                </div>
              )}
              {isCustom && images.length > 0 && !allImages[imgIdx]?.isRef && (
                <button onClick={() => deleteImage(imgIdx)} className="absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              )}
              {/* Status pill — moved here from the metadata grid so it's always visible at a glance */}
              <div className="absolute top-2 left-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ background: 'rgba(255,255,255,0.92)', color: C.text, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: stageColor ? stageColor(item.production_stage)?.bg : C.gold }} />
                <span className="capitalize">{(item.production_stage || 'pending').replace(/-/g, ' ')}</span>
              </div>
            </div>
            {images.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <button onClick={prevImg} className="p-1 rounded" style={{ color: C.textMuted }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                {images.map((_, i) => (
                  <button key={i} onClick={() => setImgIdx(i)} className="w-2 h-2 rounded-full" style={{ background: i === imgIdx ? C.gold : C.borderLight }} />
                ))}
                <button onClick={nextImg} className="p-1 rounded" style={{ color: C.textMuted }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            )}
            {isCustom && (
              <div className="mb-2">
                <input type="file" ref={fileRef} multiple accept="image/*" className="hidden" onChange={handleUploadImages} />
                <Btn small primary onClick={() => fileRef.current?.click()} style={{ width: '100%' }} disabled={uploading}>
                  {uploading ? 'Uploading…' : 'Upload Product Images'}
                </Btn>
              </div>
            )}
          </div>

          {/* ── Right: All details + fabric/colour/refs ───── */}
          <div className="md:col-span-3 space-y-4">
            {/* Title bar */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold font-mono" style={{ color: C.text }}>{item.sku || '—'}</h2>
                <p className="text-xs mt-0.5" style={{ color: C.textMuted }}>{item.title || '—'}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Btn small onClick={onEdit}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  Edit
                </Btn>
                <Btn small primary onClick={() => handlePrint()}>Print</Btn>
              </div>
            </div>

            {/* Compact metadata chips — primary working surface is below */}
            <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b" style={{ borderColor: C.border }}>
              <Chip mono><span style={{ color: C.textMuted }}>#</span>{item.order_number}</Chip>
              <Chip>{order?.customer_name || '—'}</Chip>
              {(buyerInfo?.phone || order?.notes?.match(/\+?\d[\d\s-]{7,}/)?.[0]) && (
                <Chip mono small>{buyerInfo?.phone || order?.notes?.match(/\+?\d[\d\s-]{7,}/)?.[0]}</Chip>
              )}
              {item.size && <Chip tone="size">Size {item.size}</Chip>}
              {item.stylist && <Chip tone="stylist">Stylist: {resolveStaffName(teamMembers, item.stylist)}</Chip>}
              {item.product_executive && <Chip tone="exec">Prod: {resolveStaffName(teamMembers, item.product_executive)}</Chip>}
              {item.est_shipping_date && (
                <Chip tone="delivery">Deliver {fmtDate(item.est_shipping_date)}{item.delivery_type ? ` · ${item.delivery_type}` : ''}</Chip>
              )}
              {item.urgency && item.urgency.toLowerCase() !== 'other' && (
                <Chip tone="urgency">{item.urgency}</Chip>
              )}
              {order?.channel && <Chip small>{order.channel}</Chip>}
              <Chip tone={isCustom ? 'custom' : 'general'} small>{item.type || 'General'}</Chip>
              {(buyerInfo?.email || order?.customer_email) && (
                <Chip small mono>{buyerInfo?.email || order?.customer_email}</Chip>
              )}
            </div>

            {/* ── Fabric (editable — searchable dropdown with image) ── */}
            <div className="flex items-center gap-3 py-2 border-b" style={{ borderColor: C.border }}>
              <span className="text-[10px] font-bold uppercase shrink-0 w-14" style={{ color: C.textMuted }}>Fabric</span>
              {isCustom ? (
                <div className="flex-1">
                  <FabricPicker fabrics={fabrics || []} value={fabricId} onChange={fId => {
                    setFabricId(fId)
                    const fab = (fabrics || []).find(f => f.id === fId)
                    setFabricName(fab?.name || '')
                    setSpecDirty(true)
                  }} compact placeholder="Choose fabric…" />
                </div>
              ) : (
                <>
                  {(catalogueProduct?.fabricImage || selectedFabric?.image_urls?.[0]) && (
                    <img src={selectedFabric?.image_urls?.[0] || catalogueProduct?.fabricImage} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                  )}
                  <span className="text-sm font-bold" style={{ color: C.text }}>{fabricName || catalogueProduct?.fabricName || 'Not specified'}</span>
                </>
              )}
            </div>

            {/* ── Colour + Dye Code + Ref Product ─────────── */}
            <div className="py-2 border-b space-y-2" style={{ borderColor: C.border }}>
              {/* Colour row */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase shrink-0 w-14" style={{ color: C.textMuted }}>Colour</span>
                {isCustom ? (
                  <select value={colour} onChange={e => {
                    const sel = colours.find(c => c.name === e.target.value)
                    setColour(e.target.value)
                    setColourHex(sel?.hex_code || '')
                    setSpecDirty(true)
                  }} className="flex-1 text-sm px-2 py-1.5 rounded-lg outline-none" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}>
                    <option value="">Select colour…</option>
                    {colours.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                ) : (
                  <span className="text-sm font-bold" style={{ color: C.text }}>{colour || catalogueProduct?.colourPrimary || 'Not specified'}</span>
                )}
                {(colourHex || catalogueProduct?.colourHex) && (
                  <div className="w-6 h-6 rounded-full border shrink-0" style={{ background: colourHex || catalogueProduct?.colourHex, borderColor: C.border }} />
                )}
              </div>
              {/* Dye Code row */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase shrink-0 w-14" style={{ color: C.textMuted }}>Dye Code</span>
                <input
                  type="text"
                  value={dyeCode}
                  onChange={e => { setDyeCode(e.target.value); setSpecDirty(true) }}
                  placeholder="Enter dye code…"
                  className="flex-1 text-sm px-2 py-1.5 rounded-lg outline-none"
                  style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                />
              </div>
              {/* Colour Reference Product — searchable by name/style/SKU */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-bold uppercase shrink-0 w-14" style={{ color: C.textMuted }}>Ref Prod</span>
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search by name, style code, or SKU…"
                    value={colourRefSearch}
                    onChange={(e) => setColourRefSearch(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm rounded-lg border"
                    style={{ borderColor: C.border, color: C.text, background: C.bg }}
                  />
                  {colourRefSearch.length >= 2 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl max-h-48 overflow-y-auto z-20" style={{ borderColor: C.border, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                      {(products || []).filter(p => {
                        const q = colourRefSearch.toLowerCase()
                        return (p.styleCode?.toLowerCase().includes(q) ||
                                p.title?.toLowerCase().includes(q) ||
                                (p.variants || []).some(v => v.sku?.toLowerCase().includes(q)))
                      }).slice(0, 10).map(p => (
                        <button key={p.id} onClick={() => handleAddColourRef(p)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2.5 border-b" style={{ color: C.text, borderColor: C.border }}>
                          {(p.image_url || p.shopify_images?.[0]) && <img src={p.image_url || (typeof p.shopify_images[0] === 'string' ? p.shopify_images[0] : p.shopify_images[0]?.src)} alt="" className="w-8 h-8 rounded object-cover shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate">{p.title}</div>
                            <div className="text-[10px]" style={{ color: C.textMuted }}>{p.styleCode}{p.colourPrimary ? ` · ${p.colourPrimary}` : ''}</div>
                          </div>
                        </button>
                      ))}
                      {(products || []).filter(p => {
                        const q = colourRefSearch.toLowerCase()
                        return (p.styleCode?.toLowerCase().includes(q) || p.title?.toLowerCase().includes(q) || (p.variants || []).some(v => v.sku?.toLowerCase().includes(q)))
                      }).length === 0 && (
                        <div className="px-3 py-3 text-xs text-center" style={{ color: C.textMuted }}>No products found</div>
                      )}
                    </div>
                  )}
                </div>
                {colourRefProduct && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(colourRefProduct.image_url || colourRefProduct.shopify_images?.[0]) && (
                      <img src={colourRefProduct.image_url || colourRefProduct.shopify_images[0]} alt="" className="w-7 h-7 rounded object-cover" />
                    )}
                    <span className="text-[10px] font-bold" style={{ color: C.goldDark }}>{colourRefProduct.styleCode}</span>
                    <button onClick={handleRemoveColourRef} className="text-[10px] px-1 py-0.5 rounded font-bold" style={{ background: `${C.red}18`, color: C.red }}>
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Reference Images — Upload first, then tag ─── */}
            <div className="py-2 border-b" style={{ borderColor: C.border }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase shrink-0" style={{ color: C.textMuted }}>Reference Images</span>
                {refImages.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${C.gold}18`, color: C.goldDark }}>{refImages.length}</span>}
                <div className="ml-auto flex items-center gap-2">
                  <input type="file" ref={refImageFileRef} multiple accept="image/*" className="hidden" onChange={handleUploadRefImages} />
                  <Btn small primary onClick={() => refImageFileRef.current?.click()} disabled={uploading}>
                    {uploading ? 'Uploading…' : 'Upload'}
                  </Btn>
                </div>
              </div>

              {/* Newly uploaded images awaiting tags */}
              {untaggedImages.length > 0 && (
                <div className="mb-3 p-2.5 rounded-lg" style={{ background: `${C.gold}08`, border: `1px dashed ${C.gold}` }}>
                  <div className="text-[10px] font-bold uppercase mb-2" style={{ color: C.goldDark }}>Tag uploaded images</div>
                  <div className="space-y-2">
                    {untaggedImages.map((img, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <img src={img.url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" style={{ border: `1px solid ${C.border}` }} />
                        <select value={img.tag} onChange={e => tagUntaggedImage(idx, e.target.value)}
                          className="flex-1 text-xs px-2 py-1.5 rounded-lg border" style={{ borderColor: C.border, color: C.text, background: C.cardBg }}>
                          <option value="">Select tag…</option>
                          {REF_IMAGE_TAGS.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                        </select>
                        <button onClick={() => saveTaggedImage(idx)} disabled={!img.tag}
                          className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: img.tag ? C.gold : C.borderLight, color: img.tag ? '#fff' : C.textMuted }}>
                          Save
                        </button>
                        <button onClick={() => removeUntaggedImage(idx)} className="text-[10px] px-1.5 py-1 rounded font-bold" style={{ color: C.red }}>
                          ✕
                        </button>
                      </div>
                    ))}
                    {untaggedImages.filter(i => i.tag).length > 1 && (
                      <Btn small primary onClick={saveAllTaggedImages}>Save All Tagged</Btn>
                    )}
                  </div>
                </div>
              )}

              {/* Saved reference image thumbnails */}
              {refImages.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {refImages.map((img, idx) => (
                    <div key={idx} className="relative shrink-0 w-14 h-14 rounded-lg overflow-hidden cursor-pointer" style={{ border: `1px solid ${C.border}` }}
                      onClick={() => { const refIdx = baseImages.length + (colourRefProduct ? 1 : 0) + idx; setImgIdx(refIdx) }}>
                      <img src={img.url} alt="" className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 left-0 right-0 text-[7px] font-bold px-0.5 truncate" style={{ background: 'rgba(212,168,67,0.85)', color: '#fff' }}>{(img.tags || [])[0]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Customization Notes (editable, big) ─────── */}
            <div className="py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Notes</span>
                {customNotes && (
                  <span className="text-[10px]" style={{ color: C.textLight }}>{customNotes.length} chars</span>
                )}
              </div>
              <textarea value={customNotes}
                onChange={e => { setCustomNotes(e.target.value); setSpecDirty(true) }}
                rows={6} placeholder="Customization notes — fabric details, dye instructions, fit notes, anything the cutter / tailor needs to see…"
                className="w-full text-sm leading-relaxed px-3 py-3 rounded-lg outline-none resize-y font-sans"
                style={{ background: C.cardBg || '#fff', border: `1px solid ${specDirty ? C.gold : C.border}`, color: C.text, minHeight: '140px' }} />
            </div>

            {/* ── Sticky save bar ─────────────────────────── */}
            <div className="sticky bottom-2 pt-2 flex items-center justify-end gap-2">
              <span className="text-xs" style={{ color: specDirty ? C.amber : C.textLight }}>
                {specDirty ? '● Unsaved changes' : (saving ? 'Saving…' : 'All changes saved')}
              </span>
              <button onClick={saveSpec} disabled={!specDirty || saving}
                className="text-sm font-bold px-5 py-2.5 rounded-full inline-flex items-center gap-1.5 transition-opacity"
                style={{ background: C.gold, color: '#fff', opacity: (!specDirty || saving) ? 0.45 : 1, boxShadow: specDirty ? '0 4px 12px rgba(201,164,50,0.35)' : 'none' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ─── Measurements Tab — Body: Top, Bottom, Smart Fit. Always editable. ─── */}
      {activeTab === 'measurements' && (
        <div>
          {loadingMeasurements ? (
            <div className="text-center py-8">
              <div className="inline-block w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${C.gold} transparent ${C.gold} ${C.gold}` }} />
            </div>
          ) : (
            <div>
              {!resolvedCustomerId && (
                <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: '#fff7e6', border: `1px solid ${C.amber}`, color: C.text }}>
                  This order isn't linked to a customer yet. Try refreshing — every order should auto-link; if it persists please ping the dev team.
                </div>
              )}
              <MeasurementSection
                title="Top Measurements"
                fields={TOP_MEASUREMENTS.map(f => ({ ...f, type: 'number' }))}
                data={measurements}
                onSave={saveBodyMeasurements}
              />
              <MeasurementSection
                title="Bottom Measurements"
                fields={BOTTOM_MEASUREMENTS.map(f => ({ ...f, type: 'number' }))}
                data={measurements}
                onSave={saveBodyMeasurements}
              />
              <MeasurementSection
                title="Smart Fit"
                fields={SMART_FIT_FIELDS}
                data={measurements}
                onSave={saveBodyMeasurements}
              />
            </div>
          )}
        </div>
      )}

      {/* ─── Ready Measurements Tab — Shirt, Kurtha, Blazer, Pant ─── */}
      {activeTab === 'ready_measurements' && (
        <div>
          {loadingMeasurements ? (
            <div className="text-center py-8">
              <div className="inline-block w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${C.gold} transparent ${C.gold} ${C.gold}` }} />
            </div>
          ) : (
            <div>
              {!resolvedCustomerId && (
                <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: '#fff7e6', border: `1px solid ${C.amber}`, color: C.text }}>
                  This order isn't linked to a customer yet. Try refreshing — every order should auto-link; if it persists please ping the dev team.
                </div>
              )}
              {READY_MEASUREMENT_PANELS.map(panel => {
                const data = (styleProfiles && styleProfiles[panel.key]) || null
                const keys = READY_GARMENT_FIELDS[panel.garment] || []
                const labelMap = {}
                TOP_MEASUREMENTS.forEach(f => { labelMap[f.key] = f.label })
                BOTTOM_MEASUREMENTS.forEach(f => { labelMap[f.key] = f.label })
                const fields = keys.map(k => ({ key: k, label: labelMap[k] || k.replace(/_/g, ' '), type: 'number' }))
                return (
                  <MeasurementSection
                    key={panel.key}
                    title={panel.title + ' — Ready Measurements'}
                    fields={fields}
                    data={data}
                    emptyTag="Not yet entered"
                    onSave={(patch) => saveReadyMeasurement(panel.key, patch)}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const Chip = ({ children, tone, mono, small }) => {
  const tones = {
    size:     { bg: '#eef2ff', fg: '#3730a3' },
    stylist:  { bg: '#faf5ff', fg: '#6b21a8' },
    exec:     { bg: '#eff6ff', fg: '#1e3a8a' },
    delivery: { bg: '#ecfeff', fg: '#155e75' },
    urgency:  { bg: '#fef3c7', fg: '#92400e' },
    custom:   { bg: '#fdf6e3', fg: '#92400e' },
    general:  { bg: '#f3f4f6', fg: '#374151' },
  }
  const t = tones[tone] || { bg: '#f3f4f6', fg: '#374151' }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full ${small ? 'text-[10px]' : 'text-[11px]'} ${mono ? 'font-mono' : ''} font-medium`}
      style={{ background: t.bg, color: t.fg }}
    >
      {children}
    </span>
  )
}

export default ProductionDetail

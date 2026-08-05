import React, { useState, useRef, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { C } from '../../lib/designTokens'
import { uploadImage } from '../../lib/storage'
import { logAndToast } from '../../lib/logger'
import FabricPicker from '../../components/FabricPicker'

/* ── Reference image tag options ───────────────────────────────────────── */
const REF_IMAGE_TAGS = [
  'Pattern',
  'Embroidery Art',
  'Embroidery Material',
  'Embroidery Position',
  'Colour Reference',
  'Design Reference',
  'Fabric Reference',
  'Other',
]

/* ── Small reusable components ─────────────────────────────────────────── */
const Label = ({ children }) => (
  <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: C.textMuted }}>{children}</div>
)

const InfoRow = ({ label, value }) => (
  <div className="flex items-start gap-2 py-1.5">
    <span className="text-xs font-bold shrink-0 w-28" style={{ color: C.textMuted }}>{label}</span>
    <span className="text-xs" style={{ color: C.text }}>{value || '—'}</span>
  </div>
)

/* ══════════════════════════════════════════════════════════════════════════
   CustomizationPanel — Fabric, Colour, Reference Images
   ══════════════════════════════════════════════════════════════════════════ */
const CustomizationPanel = ({ item, catalogueProduct, fabrics, dyes, onUpdate }) => {
  const isCustom = (item.type || '').toLowerCase() === 'custom'

  // Local state mirroring DB fields
  const [fabricId, setFabricId] = useState(item.fabric_id || catalogueProduct?.fabricId || '')
  const [fabricName, setFabricName] = useState(item.fabric_name || catalogueProduct?.fabricName || '')
  const [colour, setColour] = useState(item.colour || catalogueProduct?.colourPrimary || '')
  const [colourHex, setColourHex] = useState(item.colour_hex || '')
  const [dyeType, setDyeType] = useState(item.dye_type || '')
  const [refImages, setRefImages] = useState(item.reference_images || [])
  const [customNotes, setCustomNotes] = useState(item.customization_notes || '')
  const [colours, setColours] = useState([])

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadTags, setUploadTags] = useState(['Pattern'])
  const [uploadCaption, setUploadCaption] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  // Fetch colour master
  useEffect(() => {
    supa.from('colour_master').select('*').eq('is_active', true).order('name')
      .then(({ data }) => { if (data) setColours(data) })
  }, [])

  // Find selected fabric from master
  const selectedFabric = (fabrics || []).find(f => f.id === fabricId)

  /* ── Save a single field to Supabase ────────────────────────────────── */
  const saveField = async (field, value) => {
    setSaving(true)
    try {
      const { error } = await supa.from('order_line_items').update({ [field]: value }).eq('id', item.id)
      if (error) throw error
    } catch (e) {
      logAndToast('customization', `Failed to save ${field}`, e)
    } finally { setSaving(false) }
  }

  /* ── Fabric selection ────────────────────────────────────────────────── */
  const handleFabricChange = (fId) => {
    setFabricId(fId)
    const fab = (fabrics || []).find(f => f.id === fId)
    const name = fab?.name || ''
    setFabricName(name)
    saveField('fabric_id', fId)
    saveField('fabric_name', name)
  }

  /* ── Colour selection ────────────────────────────────────────────────── */
  const handleColourChange = (colourName, hex) => {
    setColour(colourName)
    setColourHex(hex || '')
    saveField('colour', colourName)
    saveField('colour_hex', hex || '')
  }

  /* ── Dye type ────────────────────────────────────────────────────────── */
  const handleDyeChange = (val) => {
    setDyeType(val)
    saveField('dye_type', val)
  }

  /* ── Reference image upload ─────────────────────────────────────────── */
  const handleRefUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const url = await uploadImage(file, `production-ref/${item.id}`)
        if (url) {
          const newImg = {
            url,
            tags: [...uploadTags],
            caption: uploadCaption || '',
            uploaded_at: new Date().toISOString(),
          }
          const updated = [...refImages, newImg]
          setRefImages(updated)
          await supa.from('order_line_items').update({ reference_images: updated }).eq('id', item.id)
        }
      }
      setUploadCaption('')
      if (onUpdate) onUpdate()
    } catch (e) {
      logAndToast('ref-image-upload', 'Failed to upload reference image', e)
    } finally { setUploading(false) }
  }

  const removeRefImage = async (idx) => {
    const updated = refImages.filter((_, i) => i !== idx)
    setRefImages(updated)
    await supa.from('order_line_items').update({ reference_images: updated }).eq('id', item.id)
  }

  /* ── Save notes on blur ─────────────────────────────────────────────── */
  const handleNotesBlur = () => {
    saveField('customization_notes', customNotes)
  }

  /* ── Tag toggle for upload ──────────────────────────────────────────── */
  const toggleTag = (tag) => {
    setUploadTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  return (
    <div className="space-y-6">
      {/* ─── Section 1: Fabric ───────────────────────────────────────── */}
      <div className="p-4 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <h4 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: C.goldDark }}>Fabric</h4>

        {isCustom ? (
          /* Custom product — full fabric selector */
          <div className="space-y-3">
            <div>
              <Label>Select Fabric</Label>
              <FabricPicker fabrics={fabrics || []} value={fabricId} onChange={handleFabricChange} placeholder="Choose a fabric…" />
            </div>

            {/* Selected fabric detail preview */}
            {selectedFabric && (
              <div className="flex gap-3 p-3 rounded-lg" style={{ background: C.cardBg, border: `1px solid ${C.borderLight}` }}>
                {selectedFabric.image_urls?.[0] && (
                  <img src={selectedFabric.image_urls[0]} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                )}
                <div className="text-xs space-y-1 min-w-0">
                  <div className="font-bold truncate" style={{ color: C.text }}>{selectedFabric.name}</div>
                  <div style={{ color: C.textMuted }}>
                    {[selectedFabric.fabric_family, selectedFabric.composition, selectedFabric.weave].filter(Boolean).join(' · ')}
                  </div>
                  {selectedFabric.width_inches && <div style={{ color: C.textMuted }}>Width: {selectedFabric.width_inches}"</div>}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Standard product — show prefilled from catalogue */
          <div className="space-y-2">
            {selectedFabric || catalogueProduct?.fabricName ? (
              <div className="flex gap-3 p-3 rounded-lg" style={{ background: C.cardBg, border: `1px solid ${C.borderLight}` }}>
                {(selectedFabric?.image_urls?.[0]) && (
                  <img src={selectedFabric.image_urls[0]} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                )}
                <div className="text-xs space-y-1">
                  <div className="font-bold" style={{ color: C.text }}>{fabricName || catalogueProduct?.fabricName || '—'}</div>
                  {selectedFabric && (
                    <div style={{ color: C.textMuted }}>
                      {[selectedFabric.fabric_family, selectedFabric.composition].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {catalogueProduct?.fabricDesc && <div style={{ color: C.textMuted }}>{catalogueProduct.fabricDesc}</div>}
                </div>
              </div>
            ) : (
              <div className="text-xs py-2" style={{ color: C.textLight }}>No fabric info in catalogue</div>
            )}
          </div>
        )}
      </div>

      {/* ─── Section 2: Colour & Dye ─────────────────────────────────── */}
      <div className="p-4 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <h4 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: C.goldDark }}>Colour & Dye</h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Colour */}
          <div>
            <Label>Colour</Label>
            {isCustom ? (
              <select value={colour} onChange={e => {
                const sel = colours.find(c => c.name === e.target.value)
                handleColourChange(e.target.value, sel?.hex_code || '')
              }} className="w-full text-sm px-3 py-2 rounded-xl outline-none" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }}>
                <option value="">Select colour…</option>
                {colours.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2 py-1">
                {colourHex && <div className="w-5 h-5 rounded-full border" style={{ background: colourHex, borderColor: C.border }} />}
                <span className="text-sm font-bold" style={{ color: C.text }}>{colour || catalogueProduct?.colourPrimary || '—'}</span>
                {catalogueProduct?.colourSecondary && (
                  <span className="text-xs" style={{ color: C.textMuted }}>/ {catalogueProduct.colourSecondary}</span>
                )}
              </div>
            )}

            {/* Colour swatch preview for custom */}
            {isCustom && colour && (
              <div className="flex items-center gap-2 mt-2">
                {colourHex && <div className="w-6 h-6 rounded-full border" style={{ background: colourHex, borderColor: C.border }} />}
                <span className="text-xs font-bold" style={{ color: C.text }}>{colour}</span>
              </div>
            )}
          </div>

          {/* Dye Type */}
          <div>
            <Label>Dye Type</Label>
            <select value={dyeType} onChange={e => handleDyeChange(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-xl outline-none" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }}>
              <option value="">None / Standard</option>
              {(dyes || []).map(d => (
                <option key={d.id} value={d.type}>{d.type}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ─── Section 3: Reference Images ─────────────────────────────── */}
      <div className="p-4 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <h4 className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: C.goldDark }}>Reference Images</h4>
        <p className="text-xs mb-4" style={{ color: C.textMuted }}>
          Upload reference images for pattern, embroidery details, colour samples, etc. Each image can be tagged with one or more categories.
        </p>

        {/* Upload controls */}
        <div className="p-3 rounded-lg mb-4" style={{ background: C.cardBg, border: `1px dashed ${C.border}` }}>
          {/* Tag selector */}
          <Label>Image tags (select one or more)</Label>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {REF_IMAGE_TAGS.map(tag => {
              const active = uploadTags.includes(tag)
              return (
                <button key={tag} onClick={() => toggleTag(tag)}
                  className="text-[10px] px-2.5 py-1 rounded-full font-bold transition-all"
                  style={{
                    background: active ? C.gold : 'transparent',
                    color: active ? '#fff' : C.textMuted,
                    border: `1px solid ${active ? C.gold : C.border}`,
                  }}>
                  {tag}
                </button>
              )
            })}
          </div>

          {/* Caption */}
          <Label>Caption / Notes</Label>
          <input value={uploadCaption} onChange={e => setUploadCaption(e.target.value)}
            placeholder="e.g. Zardosi work on sleeves, Gold thread…"
            className="w-full text-xs px-3 py-2 rounded-lg outline-none mb-3" style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }} />

          {/* Upload button */}
          <input type="file" ref={fileRef} multiple accept="image/*" className="hidden" onChange={handleRefUpload} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading || uploadTags.length === 0}
            className="text-xs px-4 py-2 rounded-xl font-bold transition-all" style={{
              background: uploadTags.length > 0 ? C.gold : C.borderLight,
              color: uploadTags.length > 0 ? '#fff' : C.textMuted,
              opacity: uploading ? 0.5 : 1,
            }}>
            {uploading ? 'Uploading…' : 'Upload Reference Image'}
          </button>
          {uploadTags.length === 0 && <span className="text-[10px] ml-2" style={{ color: C.red }}>Select at least one tag</span>}
        </div>

        {/* Existing reference images grid */}
        {refImages.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {refImages.map((img, idx) => (
              <div key={idx} className="rounded-lg overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
                <div className="relative h-32">
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeRefImage(idx)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="p-2">
                  <div className="flex flex-wrap gap-1 mb-1">
                    {(img.tags || []).map(tag => (
                      <span key={tag} className="text-[8px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: `${C.gold}18`, color: C.goldDark }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  {img.caption && <p className="text-[10px] leading-tight" style={{ color: C.textMuted }}>{img.caption}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <svg className="w-10 h-10 mx-auto mb-2" style={{ color: C.textLight }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <p className="text-xs" style={{ color: C.textLight }}>No reference images yet</p>
          </div>
        )}
      </div>

      {/* ─── Section 4: Customization Notes ──────────────────────────── */}
      <div className="p-4 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
        <h4 className="text-sm font-bold uppercase tracking-wider mb-3" style={{ color: C.goldDark }}>Customization Notes</h4>
        <textarea value={customNotes} onChange={e => setCustomNotes(e.target.value)} onBlur={handleNotesBlur}
          rows={3} placeholder="Add detailed customization instructions, design notes…"
          className="w-full text-xs px-3 py-2 rounded-lg outline-none resize-none" style={{ background: C.cardBg, border: `1px solid ${C.border}`, color: C.text }} />
        {saving && <span className="text-[10px]" style={{ color: C.textMuted }}>Saving…</span>}
      </div>
    </div>
  )
}

export default CustomizationPanel

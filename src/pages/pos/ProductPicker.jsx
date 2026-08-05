import React, { useState, useMemo, useEffect } from 'react'
import { C, SIZES } from '../../lib/designTokens'
import { buildGarmentTypeOptions, categoryFromGarmentType } from './constants'
import { POS_T, MIcon } from './tokens'
import SellGiftCardModal from './SellGiftCardModal'

/**
 * Two tabs — Catalog + Custom. Inside Custom, a Single/Set mode toggle.
 *
 *   Catalog: ALL products at style-code level, paginated (24/page).
 *            Clicking a card adds the product to the cart immediately at
 *            default size M / qty 1. The cart row is where size + qty are
 *            actually edited.
 *
 *   Custom:  Mode toggle (Single | Set), the same panel reshapes to suit.
 *
 * onAdd(item) is called with a cart-ready line object.
 */
const PAGE_SIZE = 24

const ProductPicker = ({ products = [], onAdd, stitchingMaster = [] }) => {
  const [tab, setTab] = useState('catalog')
  const [sellGcOpen, setSellGcOpen] = useState(false)

  return (
    <div>
      <div className="flex gap-1 mb-4 p-1 rounded-full overflow-x-auto scrollbar-none"
        style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, width: 'fit-content' }}>
        {[
          { key: 'catalog', icon: 'inventory_2',   label: 'Catalog' },
          { key: 'custom',  icon: 'auto_awesome',  label: 'Custom' },
          { key: 'gift_card', icon: 'card_giftcard', label: 'Gift card' },
        ].map(t => (
          <button key={t.key} onClick={() => { if (t.key === 'gift_card') { setSellGcOpen(true) } else { setTab(t.key) } }}
            className="px-3 sm:px-4 py-2 rounded-full text-xs font-bold inline-flex items-center gap-1.5 transition-all whitespace-nowrap"
            style={{
              background: tab === t.key ? POS_T.primaryContainer : 'transparent',
              color:      tab === t.key ? POS_T.onPrimary : POS_T.onSurfaceVariant,
            }}>
            <MIcon name={t.icon} size={16} fill={tab === t.key} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'catalog' && <CatalogTab products={products} onAdd={onAdd} />}
      {tab === 'custom'  && <CustomTab onAdd={onAdd} stitchingMaster={stitchingMaster} />}
      {sellGcOpen && <SellGiftCardModal onAdd={onAdd} onClose={() => setSellGcOpen(false)} />}
    </div>
  )
}

// ─── Catalog (paginated, full list) ──────────────────────────────────
const titleOf = (p) => p.productTitle || p.productName || p.title || ''
const CatalogTab = ({ products, onAdd }) => {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  // Reset to page 0 whenever the search changes
  useEffect(() => { setPage(0) }, [q])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return (products || [])
    return (products || []).filter(p =>
      titleOf(p).toLowerCase().includes(s) ||
      (p.styleCode || '').toLowerCase().includes(s) ||
      (p.category || '').toLowerCase().includes(s)
    )
  }, [products, q])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageItems = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const addToCart = (p) => {
    const img = (p.shopify_images && p.shopify_images[0]) || p.image_url || ''
    const imgUrl = typeof img === 'string' ? img : (img?.src || img?.url || '')
    // Variants carry per-size pricing (MTF often costs more than standard sizes).
    // Stash them on the cart line so size-change in the cart can re-resolve mrp.
    const variants = Array.isArray(p.variants) ? p.variants.filter(v => v && v.active !== false) : []
    const defaultV = variants.find(v => v.size === 'M') || variants[0]
    const baseMrp  = Number(p.mrp || p.proposed_mrp || 0)
    const mrp = Number(defaultV?.mrp ?? defaultV?.sellingPrice ?? baseMrp)
    onAdd({
      type: 'catalog',
      product_id: p.id,
      title: titleOf(p) || p.styleCode || 'Custom item',
      sku: p.styleCode,
      variants,                      // [{ size, mrp, sellingPrice, active, … }]
      mrp,
      image: imgUrl,
      category: p.category,
      size: defaultV?.size || 'M',   // sensible default — user edits in the cart
      quantity: 1,
      is_set: !!p.is_set,
    })
  }

  return (
    <div>
      {/* Search + count */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
          <MIcon name="search" size={18} style={{ color: POS_T.onSurfaceVariant }} />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search by name, style code, or category…"
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: POS_T.onSurface }} />
          {q && (
            <button onClick={() => setQ('')} className="p-0.5" style={{ color: POS_T.onSurfaceVariant }}>
              <MIcon name="close" size={16} />
            </button>
          )}
        </div>
        <div className="text-xs whitespace-nowrap" style={{ color: POS_T.onSurfaceVariant }}>
          {filtered.length.toLocaleString('en-IN')} product{filtered.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Grid — 2/3/4 columns responsive */}
      {pageItems.length === 0 ? (
        <div className="text-sm py-12 text-center rounded-xl"
          style={{ color: POS_T.onSurfaceVariant, background: POS_T.surfaceContainerLow, border: `1px dashed ${POS_T.outlineVariant}` }}>
          <MIcon name="inventory_2" size={28} style={{ color: POS_T.outline }} />
          <div className="mt-1">No products match this search.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {pageItems.map(p => {
            const img = (p.shopify_images && p.shopify_images[0]) || p.image_url || ''
            const imgUrl = typeof img === 'string' ? img : (img?.src || img?.url || '')
            return (
              <button key={p.id} onClick={() => addToCart(p)}
                className="text-left p-2 rounded-xl transition-all hover:shadow-md active:scale-[0.98] group"
                style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
                <div className="w-full aspect-[3/4] rounded-lg overflow-hidden mb-2 relative"
                  style={{ background: POS_T.surfaceContainerLow }}>
                  {imgUrl
                    ? <img src={imgUrl} alt={titleOf(p)} className="w-full h-full object-cover" loading="lazy" />
                    : <div className="w-full h-full flex items-center justify-center" style={{ color: POS_T.outline }}>
                        <MIcon name="checkroom" size={28} />
                      </div>
                  }
                  {/* Add overlay on hover */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-2"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent 50%)' }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>
                      <MIcon name="add" size={20} weight={700} />
                    </div>
                  </div>
                </div>
                <div className="text-xs font-bold truncate" style={{ color: POS_T.onSurface }}>{titleOf(p) || p.styleCode || '(untitled)'}</div>
                <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: POS_T.outline }}>{p.styleCode || '—'}</div>
                <div className="flex items-center justify-between mt-1">
                  <div className="text-xs font-bold font-mono" style={{ color: POS_T.primary }}>
                    ₹{Number(p.mrp || p.proposed_mrp || 0).toLocaleString('en-IN')}
                  </div>
                  {p.category && (
                    <span className="text-[9px] font-bold tracking-[0.05em] uppercase px-1.5 py-0.5 rounded truncate"
                      style={{ background: POS_T.tertiaryContainer, color: POS_T.onTertiaryContainer, maxWidth: 80 }}>
                      {p.category}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0}
            className="text-xs font-bold px-3 py-2 rounded-full inline-flex items-center gap-1"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface, opacity: currentPage === 0 ? 0.4 : 1 }}>
            <MIcon name="chevron_left" size={16} /> Prev
          </button>
          <span className="text-xs font-bold" style={{ color: POS_T.onSurfaceVariant }}>
            Page {currentPage + 1} of {totalPages}
          </span>
          <button onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage === totalPages - 1}
            className="text-xs font-bold px-3 py-2 rounded-full inline-flex items-center gap-1"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface, opacity: currentPage === totalPages - 1 ? 0.4 : 1 }}>
            Next <MIcon name="chevron_right" size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Custom (single or set, one tab with internal toggle) ────────────
const CustomTab = ({ onAdd, stitchingMaster = [] }) => {
  const [mode, setMode] = useState('single')  // 'single' | 'set'

  return (
    <div className="max-w-2xl">
      {/* Mode toggle */}
      <div className="flex gap-1 mb-4 p-1 rounded-full"
        style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, width: 'fit-content' }}>
        {[
          { key: 'single', icon: 'checkroom', label: 'Single piece' },
          { key: 'set',    icon: 'redeem',    label: 'Set (multi-piece)' },
        ].map(t => (
          <button key={t.key} onClick={() => setMode(t.key)}
            className="px-3 py-1.5 rounded-full text-xs font-bold inline-flex items-center gap-1.5"
            style={{
              background: mode === t.key ? POS_T.secondary : 'transparent',
              color:      mode === t.key ? POS_T.onSecondary : POS_T.onSurfaceVariant,
            }}>
            <MIcon name={t.icon} size={14} fill={mode === t.key} />
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'single' ? <CustomSinglePanel onAdd={onAdd} stitchingMaster={stitchingMaster} /> : <CustomSetPanel onAdd={onAdd} stitchingMaster={stitchingMaster} />}
    </div>
  )
}

const CustomSinglePanel = ({ onAdd, stitchingMaster = [] }) => {
  const [form, setForm] = useState({ garment_type: '', title: '', mrp: '', size: 'MTF', qty: 1 })
  const optionGroups = useMemo(() => buildGarmentTypeOptions(stitchingMaster), [stitchingMaster])
  const add = () => {
    const mrp = Number(form.mrp || 0)
    if (!form.title || !mrp || !form.garment_type) return
    const cat = categoryFromGarmentType(stitchingMaster, form.garment_type)
    onAdd({
      type: 'custom', title: form.title, sku: '', mrp,
      garment_type: form.garment_type,
      category: cat, garment_category: cat,
      size: form.size, quantity: Math.max(1, Number(form.qty || 1)), is_set: false,
    })
    setForm({ garment_type: '', title: '', mrp: '', size: 'MTF', qty: 1 })
  }
  return (
    <div className="p-4 rounded-xl"
      style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Garment Type">
          <select value={form.garment_type} onChange={e => setForm({ ...form, garment_type: e.target.value })}
            className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
            <option value="" disabled>— Pick a garment type —</option>
            {optionGroups.map(g => (
              <optgroup key={g.category} label={g.category}>
                {g.types.map(t => <option key={t.value} value={t.value}>{t.label}{t.cost ? ` · ₹${t.cost}` : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Size">
          <SelectInput value={form.size} onChange={v => setForm({ ...form, size: v })} options={SIZES} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Product Title">
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Ivory Raw Silk Sherwani with Gold Zari"
              className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
              style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
          </Field>
        </div>
        <Field label="MRP (₹)">
          <input type="text" inputMode="decimal" value={form.mrp}
            onChange={e => setForm({ ...form, mrp: e.target.value.replace(/[^0-9.]/g, '') })}
            className="w-full text-sm px-2.5 py-2 rounded-lg outline-none font-mono"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
        </Field>
        <Field label="Quantity">
          <input type="text" inputMode="numeric" value={form.qty}
            onChange={e => setForm({ ...form, qty: e.target.value.replace(/[^0-9]/g, '') })}
            className="w-full text-sm px-2.5 py-2 rounded-lg outline-none font-mono"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
        </Field>
      </div>
      {form.size === 'MTF' && (
        <div className="text-xs mt-3 inline-flex items-center gap-1" style={{ color: POS_T.warning }}>
          <MIcon name="straighten" size={14} />
          Measurements required for MTF — can be collected after order creation.
        </div>
      )}
      <div className="flex justify-end mt-4">
        <button onClick={add} disabled={!form.title || !form.mrp}
          className="text-sm font-bold px-5 py-2 rounded-full inline-flex items-center gap-1.5"
          style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary, opacity: (!form.title || !form.mrp) ? 0.4 : 1 }}>
          <MIcon name="add" size={16} /> Add to cart
        </button>
      </div>
    </div>
  )
}

const CustomSetPanel = ({ onAdd, stitchingMaster = [] }) => {
  const [form, setForm] = useState({
    name: '', mrp: '',
    components: [{ name: '', category: 'Sherwani' }, { name: '', category: 'Pant' }],
  })
  const updateComp = (i, patch) => {
    const next = form.components.slice(); next[i] = { ...next[i], ...patch }
    setForm({ ...form, components: next })
  }
  const addComp = () => setForm({ ...form, components: [...form.components, { name: '', category: 'Other' }] })
  const removeComp = (i) => {
    if (form.components.length <= 2) return
    setForm({ ...form, components: form.components.filter((_, j) => j !== i) })
  }
  const compOptGroups = useMemo(() => buildGarmentTypeOptions(stitchingMaster), [stitchingMaster])
  const add = () => {
    const mrp = Number(form.mrp || 0)
    if (!form.name || !mrp || form.components.length < 2) return
    if (form.components.some(c => !c.garment_type)) return
    onAdd({
      type: 'custom_set', title: form.name, sku: '', mrp,
      category: 'Custom Set', size: 'MTF', quantity: 1, is_set: true,
      set_components: form.components.map((c, i) => {
        const cat = categoryFromGarmentType(stitchingMaster, c.garment_type)
        return { name: c.name || c.garment_type, garment_type: c.garment_type, category: cat, garment_category: cat, order: i }
      }),
    })
    setForm({ name: '', mrp: '', components: [{ name: '', garment_type: '' }, { name: '', garment_type: '' }] })
  }
  return (
    <div className="p-4 rounded-xl"
      style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <Field label="Set Name">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Wedding Sherwani Set"
            className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
        </Field>
        <Field label="Total Set MRP (₹)">
          <input type="text" inputMode="decimal" value={form.mrp}
            onChange={e => setForm({ ...form, mrp: e.target.value.replace(/[^0-9.]/g, '') })}
            className="w-full text-sm px-2.5 py-2 rounded-lg outline-none font-mono"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
        </Field>
      </div>
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: POS_T.onSurfaceVariant }}>Components</div>
      <div className="space-y-2 mb-3">
        {form.components.map((c, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: ['#c9a432', '#5b8def', '#a26ce0'][i % 3] }} />
            <input value={c.name} onChange={e => updateComp(i, { name: e.target.value })}
              placeholder={`Piece ${i + 1} name`}
              className="flex-1 text-xs px-2 py-1.5 rounded outline-none min-w-0"
              style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
            <select value={c.garment_type || ''} onChange={e => updateComp(i, { garment_type: e.target.value })}
              className="text-xs px-2 py-1.5 rounded outline-none flex-shrink-0"
              style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
              <option value="" disabled>— pick —</option>{compOptGroups.map(g => (<optgroup key={g.category} label={g.category}>{g.types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</optgroup>))}
            </select>
            {form.components.length > 2 && (
              <button onClick={() => removeComp(i)} className="text-xs font-bold p-1 flex-shrink-0" style={{ color: POS_T.error }}>
                <MIcon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
        <button onClick={addComp}
          className="w-full text-xs font-bold py-2 rounded-lg inline-flex items-center justify-center gap-1"
          style={{ border: `1px dashed ${POS_T.secondary}`, color: POS_T.secondary, background: 'rgba(113,42,226,0.04)' }}>
          <MIcon name="add" size={14} /> Add component piece
        </button>
      </div>
      <div className="text-xs px-3 py-2 rounded-lg mb-3 inline-flex items-center gap-2"
        style={{ background: POS_T.warningContainer, color: POS_T.onSurface, border: `1px solid ${POS_T.warning}` }}>
        <MIcon name="info" size={14} style={{ color: POS_T.warning }} />
        Each component will be tracked separately in production with its own vendor, fabric, and measurements.
      </div>
      <div className="flex justify-end">
        <button onClick={add} disabled={!form.name || !form.mrp || form.components.length < 2}
          className="text-sm font-bold px-5 py-2 rounded-full inline-flex items-center gap-1.5"
          style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary, opacity: (!form.name || !form.mrp || form.components.length < 2) ? 0.4 : 1 }}>
          <MIcon name="add" size={16} /> Add set to cart
        </button>
      </div>
    </div>
  )
}

const Field = ({ label, children }) => (
  <div>
    <label className="block mb-1 text-[10px] font-bold uppercase tracking-[0.1em]"
      style={{ color: POS_T.onSurfaceVariant }}>{label}</label>
    {children}
  </div>
)
const SelectInput = ({ value, onChange, options }) => (
  <select value={value} onChange={e => onChange(e.target.value)}
    className="w-full text-sm px-2.5 py-2 rounded-lg outline-none"
    style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
)

export default ProductPicker

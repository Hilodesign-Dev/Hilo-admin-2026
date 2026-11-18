import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { api } from '../../lib/api'
import { uploadImage } from '../../lib/storage'
import { C, toast } from '../../lib/designTokens'
import { Btn, Field, Input, Select, Badge } from '../orders/ui'

/*
 * App Collections — the collection / sub-collection tree the mobile app shows.
 * Rows live in public.catalogue_collections; each row's `rules` decide its products
 * (evaluated by the Customer API, previewed live here before saving).
 */

const EMPTY_RULES = {
  matchAll: false,
  shopifyCollections: [],
  productTypes: [],
  keywordsAny: [],
  keywordsAll: [],
  excludeKeywords: [],
  includeProductIds: [],
  excludeProductIds: [],
  ignoreParent: false,
}

const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const emptyForm = (parentHandle = '') => ({
  id: null,
  title: '',
  handle: '',
  handleTouched: false,
  description: '',
  image_url: '',
  parent_handle: parentHandle,
  sort_order: 0,
  is_nav_visible: true,
  is_featured: false,
  is_active: true,
  rules: { ...EMPTY_RULES },
})

/* ── Chip list input ────────────────────────────────────────────────────── */
function ChipInput({ value, onChange, placeholder, suggestions, listId }) {
  const [draft, setDraft] = useState('')
  const add = (raw) => {
    const parts = String(raw).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (!parts.length) return
    onChange([...new Set([...(value || []), ...parts])])
    setDraft('')
  }
  return (
    <div className="rounded-xl px-2 py-1.5 flex flex-wrap gap-1.5 items-center" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
      {(value || []).map((v) => (
        <span key={v} className="text-xs font-semibold px-2 py-1 rounded-lg inline-flex items-center gap-1" style={{ background: C.goldLight, color: C.goldDark }}>
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="opacity-60 hover:opacity-100">✕</button>
        </span>
      ))}
      <input
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft) }
          else if (e.key === 'Backspace' && !draft && value?.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => draft && add(draft)}
        placeholder={placeholder}
        className="flex-1 min-w-[140px] text-sm bg-transparent outline-none px-1 py-1"
        style={{ color: C.text }}
      />
      {suggestions && listId && (
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </datalist>
      )}
    </div>
  )
}

/* ── Main tab ───────────────────────────────────────────────────────────── */
export default function AppCollectionsTab() {
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [options, setOptions] = useState({ shopifyCollections: [], productTypes: [] })
  const [preview, setPreview] = useState({ loading: false, total: null, products: [], error: '' })
  const [confirmDelete, setConfirmDelete] = useState(null)
  const previewSeq = useRef(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supa
        .from('catalogue_collections')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('title', { ascending: true })
      if (error) throw error
      setRows(data || [])
      // Live product counts come from the Customer API (same rules the app uses).
      api.appCollections()
        .then((res) => {
          const map = {}
          for (const c of res?.data || []) map[c.handle] = c.productCount
          setCounts(map)
        })
        .catch(() => setCounts({}))
    } catch (e) {
      toast(false, 'Failed to load collections: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.collectionRuleOptions().then(setOptions).catch(() => {})
  }, [])

  const parents = useMemo(() => rows.filter((r) => !r.parent_handle), [rows])
  const childrenOf = useCallback((handle) => rows.filter((r) => r.parent_handle === handle), [rows])

  const refreshApi = () => api.refreshCollections().catch(() => {})

  /* ── Preview (debounced) ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!form) return
    const seq = ++previewSeq.current
    setPreview((p) => ({ ...p, loading: true, error: '' }))
    const t = setTimeout(async () => {
      try {
        const res = await api.previewCollectionRules(form.rules, form.parent_handle || null, 24)
        if (seq === previewSeq.current) setPreview({ loading: false, total: res.total, products: res.products || [], error: '' })
      } catch (e) {
        if (seq === previewSeq.current) setPreview({ loading: false, total: null, products: [], error: e.message })
      }
    }, 450)
    return () => clearTimeout(t)
  }, [form?.rules, form?.parent_handle]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Editor ──────────────────────────────────────────────────────────── */
  const openCreate = (parentHandle = '') => {
    const siblings = rows.filter((r) => (r.parent_handle || '') === parentHandle)
    setForm({ ...emptyForm(parentHandle), sort_order: siblings.length ? Math.max(...siblings.map((s) => s.sort_order || 0)) + 1 : 1 })
  }

  const openEdit = (r) => {
    setForm({
      id: r.id,
      title: r.title || '',
      handle: r.handle || '',
      handleTouched: true,
      description: r.description || '',
      image_url: r.image_url || '',
      parent_handle: r.parent_handle || '',
      sort_order: r.sort_order || 0,
      is_nav_visible: r.is_nav_visible !== false,
      is_featured: r.is_featured === true,
      is_active: r.is_active !== false,
      rules: { ...EMPTY_RULES, ...(r.rules || {}) },
    })
  }

  const setField = (k, v) => setForm((f) => {
    const next = { ...f, [k]: v }
    if (k === 'title' && !f.handleTouched) next.handle = slugify(v)
    return next
  })
  const setRule = (k, v) => setForm((f) => ({ ...f, rules: { ...f.rules, [k]: v } }))

  const onImage = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file, 'collections')
      setField('image_url', url)
    } catch (e) {
      toast(false, 'Image upload failed: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    const handle = slugify(form.handle)
    if (!form.title.trim() || !handle) { toast(false, 'Title and handle are required'); return }
    if (form.parent_handle && form.parent_handle === handle) { toast(false, 'A collection cannot be its own parent'); return }
    const payload = {
      title: form.title.trim(),
      handle,
      description: form.description.trim() || null,
      image_url: form.image_url.trim() || null,
      parent_handle: form.parent_handle || null,
      sort_order: Number(form.sort_order) || 0,
      is_nav_visible: form.is_nav_visible,
      is_featured: form.is_featured,
      is_active: form.is_active,
      rules: form.rules,
      updated_at: new Date().toISOString(),
    }
    setSaving(true)
    try {
      const q = form.id
        ? supa.from('catalogue_collections').update(payload).eq('id', form.id)
        : supa.from('catalogue_collections').insert([{ ...payload, source: 'admin' }])
      const { error } = await q
      if (error) throw error
      toast(true, form.id ? 'Collection updated' : 'Collection created')
      setForm(null)
      await refreshApi()
      load()
    } catch (err) {
      toast(false, /duplicate key/i.test(err.message) ? `Handle "${handle}" is already used` : 'Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (r, key) => {
    const { error } = await supa.from('catalogue_collections').update({ [key]: !r[key], updated_at: new Date().toISOString() }).eq('id', r.id)
    if (error) { toast(false, error.message); return }
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, [key]: !x[key] } : x)))
    refreshApi()
  }

  /** Swap sort_order with the neighbour above / below among siblings. */
  const move = async (r, dir) => {
    const siblings = rows.filter((x) => (x.parent_handle || '') === (r.parent_handle || ''))
    const i = siblings.findIndex((x) => x.id === r.id)
    const j = i + dir
    if (j < 0 || j >= siblings.length) return
    const ordered = [...siblings]
    ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
    const updates = ordered.map((x, idx) => ({ id: x.id, sort_order: idx + 1 }))
    for (const u of updates) {
      const { error } = await supa.from('catalogue_collections').update({ sort_order: u.sort_order }).eq('id', u.id)
      if (error) { toast(false, error.message); return }
    }
    await refreshApi()
    load()
  }

  const remove = async (r) => {
    const { error } = await supa.from('catalogue_collections').delete().eq('id', r.id)
    if (error) { toast(false, 'Delete failed: ' + error.message); return }
    toast(true, `Deleted "${r.title}"${childrenOf(r.handle).length ? ' and its sub-collections' : ''}`)
    setConfirmDelete(null)
    await refreshApi()
    load()
  }

  const excludeFromPreview = (p) => {
    const key = String(p.id).toLowerCase()
    setRule('excludeProductIds', [...new Set([...(form.rules.excludeProductIds || []), key])])
  }

  const shopifySuggestions = useMemo(
    () => (options.shopifyCollections || []).map((c) => ({ value: c.handle, label: `${c.productCount} products` })),
    [options],
  )
  const typeSuggestions = useMemo(
    () => (options.productTypes || []).map((t) => ({ value: t.type.toLowerCase(), label: `${t.productCount} products` })),
    [options],
  )

  /* ── Row renderer ────────────────────────────────────────────────────── */
  const renderRow = (r, child, index, total) => (
    <React.Fragment key={r.id}>
    <div className={`flex items-center gap-3 px-4 py-3 ${child ? 'pl-12' : ''}`} style={{ borderTop: `1px solid ${C.borderLight}`, opacity: r.is_active ? 1 : 0.5 }}>
      <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ background: C.cream }}>
        {r.image_url ? <img src={r.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px] text-gray-400">No image</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm" style={{ color: C.text }}>{r.title}</span>
          <span className="font-mono text-[11px]" style={{ color: C.textMuted }}>{r.handle}</span>
          {!r.is_active && <Badge color={C.red}>INACTIVE</Badge>}
          {r.is_active && !r.is_nav_visible && <Badge color={C.amber}>HIDDEN</Badge>}
          {r.is_featured && <Badge color={C.purple}>FEATURED</Badge>}
        </div>
        <div className="text-xs mt-0.5" style={{ color: C.textMuted }}>
          {counts[r.handle] != null ? `${counts[r.handle]} products` : r.is_active ? '…' : '—'}
          {!child && ` · ${childrenOf(r.handle).length} sub-collections`}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Btn small disabled={index === 0} onClick={() => move(r, -1)} aria-label="Move up">↑</Btn>
        <Btn small disabled={index === total - 1} onClick={() => move(r, 1)} aria-label="Move down">↓</Btn>
        {!child && <Btn small onClick={() => openCreate(r.handle)}>+ Sub</Btn>}
        <Btn small onClick={() => toggle(r, 'is_active')}>{r.is_active ? 'Deactivate' : 'Activate'}</Btn>
        <Btn small onClick={() => openEdit(r)}>Edit</Btn>
        <Btn small danger onClick={() => setConfirmDelete(r)}>Delete</Btn>
      </div>
    </div>
    </React.Fragment>
  )

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: C.text }}>App Collections</h1>
          <p className="text-sm mt-1" style={{ color: C.textMuted }}>
            Collections and sub-collections in the mobile app: names, images, order, and which products each one shows.
          </p>
        </div>
        <Btn primary onClick={() => openCreate('')}>Add Collection</Btn>
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm" style={{ color: C.textMuted }}>Loading collections…</div>
      ) : parents.length === 0 ? (
        <div className="bg-white py-20 text-center border rounded-3xl" style={{ borderColor: C.border }}>
          <div className="text-sm font-bold" style={{ color: C.text }}>No app collections yet</div>
          <div className="text-xs mt-1 mb-4" style={{ color: C.textMuted }}>The app shows no collections until you add one.</div>
          <Btn primary onClick={() => openCreate('')}>Add First Collection</Btn>
        </div>
      ) : (
        <div className="bg-white border rounded-3xl overflow-hidden" style={{ borderColor: C.border }}>
          {parents.map((p, i) => {
            const kids = childrenOf(p.handle)
            return (
              <div key={p.id}>
                {renderRow(p, false, i, parents.length)}
                {kids.map((k, ki) => renderRow(k, true, ki, kids.length))}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" onClick={(e) => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6 border" style={{ borderColor: C.border }}>
            <h2 className="text-base font-bold" style={{ color: C.text }}>Delete “{confirmDelete.title}”?</h2>
            <p className="text-sm mt-2" style={{ color: C.textMuted }}>
              It disappears from the app.
              {childrenOf(confirmDelete.handle).length > 0 && ` Its ${childrenOf(confirmDelete.handle).length} sub-collections are deleted too.`}
              {' '}Products are not affected. This cannot be undone; use Deactivate to hide it instead.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <Btn onClick={() => setConfirmDelete(null)}>Cancel</Btn>
              <Btn danger onClick={() => remove(confirmDelete)}>Delete</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Editor ── */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && setForm(null)}>
          <div className="bg-white rounded-3xl w-full max-w-6xl max-h-[92vh] shadow-xl overflow-hidden border flex flex-col" style={{ borderColor: C.border }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: C.borderLight }}>
              <h2 className="text-base font-bold" style={{ color: C.text }}>
                {form.id ? `Edit “${form.title}”` : form.parent_handle ? 'New sub-collection' : 'New collection'}
              </h2>
              <button type="button" aria-label="Close" onClick={() => setForm(null)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>

            <form onSubmit={save} className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
              {/* Left: details + rules */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Title" required>
                    <Input value={form.title} onChange={(e) => setField('title', e.target.value)} required placeholder="e.g. Kurtas" />
                  </Field>
                  <Field label="Handle" required>
                    <Input value={form.handle} onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value, handleTouched: true }))} required placeholder="kurtas" className="font-mono" />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Parent collection">
                    <Select value={form.parent_handle} onChange={(e) => setField('parent_handle', e.target.value)}>
                      <option value="">— Top level —</option>
                      {parents.filter((p) => p.handle !== form.handle).map((p) => <option key={p.id} value={p.handle}>{p.title}</option>)}
                    </Select>
                  </Field>
                  <Field label="Sort order">
                    <Input type="number" value={form.sort_order} onChange={(e) => setField('sort_order', e.target.value)} />
                  </Field>
                </div>

                <Field label="Description">
                  <Input value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="Optional" />
                </Field>

                <Field label="Image">
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: C.cream }}>
                      {form.image_url ? <img src={form.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px] text-gray-400">None</span>}
                    </div>
                    <div className="flex-1 space-y-2">
                      <input type="file" accept="image/*" disabled={uploading} onChange={(e) => onImage(e.target.files?.[0])} className="text-xs" />
                      <Input value={form.image_url} onChange={(e) => setField('image_url', e.target.value)} placeholder="…or paste an image URL" />
                    </div>
                  </div>
                </Field>

                <div className="flex flex-wrap gap-4 text-xs font-semibold" style={{ color: '#4e4636' }}>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(e) => setField('is_active', e.target.checked)} className="accent-amber-500" />Active</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.is_nav_visible} onChange={(e) => setField('is_nav_visible', e.target.checked)} className="accent-amber-500" />Show in app navigation</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.is_featured} onChange={(e) => setField('is_featured', e.target.checked)} className="accent-amber-500" />Featured</label>
                </div>

                <div className="pt-4 border-t space-y-4" style={{ borderColor: C.borderLight }}>
                  <div>
                    <div className="text-sm font-bold" style={{ color: C.text }}>Which products belong here</div>
                    <div className="text-xs mt-0.5" style={{ color: C.textMuted }}>
                      A product is included if it is in <b>any</b> of the Shopify collections, <b>or</b> has one of the product types, <b>or</b> matches one of the “any” keywords.
                      Then “must contain” and “exclude” narrow it down.
                      {form.parent_handle && !form.rules.ignoreParent && ' It must also belong to the parent collection.'}
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: '#4e4636' }}>
                    <input type="checkbox" checked={form.rules.matchAll} onChange={(e) => setRule('matchAll', e.target.checked)} className="accent-amber-500" />
                    Every product (e.g. Shop All)
                  </label>
                  {form.parent_handle && (
                    <label className="inline-flex items-center gap-2 text-xs font-semibold ml-4" style={{ color: '#4e4636' }}>
                      <input type="checkbox" checked={form.rules.ignoreParent} onChange={(e) => setRule('ignoreParent', e.target.checked)} className="accent-amber-500" />
                      Don’t require the parent collection
                    </label>
                  )}

                  {!form.rules.matchAll && (
                    <>
                      <Field label="Shopify collections (handles)">
                        <ChipInput value={form.rules.shopifyCollections} onChange={(v) => setRule('shopifyCollections', v)} placeholder="e.g. embroidered-kurtas" suggestions={shopifySuggestions} listId="shopify-collection-handles" />
                      </Field>
                      <Field label="Product types">
                        <ChipInput value={form.rules.productTypes} onChange={(v) => setRule('productTypes', v)} placeholder="e.g. kurta" suggestions={typeSuggestions} listId="product-types" />
                      </Field>
                      <Field label="Keywords — any of (title, tags, type)">
                        <ChipInput value={form.rules.keywordsAny} onChange={(v) => setRule('keywordsAny', v)} placeholder="e.g. sherwani" />
                      </Field>
                    </>
                  )}
                  <Field label="Must contain all of">
                    <ChipInput value={form.rules.keywordsAll} onChange={(v) => setRule('keywordsAll', v)} placeholder="e.g. embroidered" />
                  </Field>
                  <Field label="Exclude keywords">
                    <ChipInput value={form.rules.excludeKeywords} onChange={(v) => setRule('excludeKeywords', v)} placeholder="e.g. gift card" />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Always include (product id / handle)">
                      <ChipInput value={form.rules.includeProductIds} onChange={(v) => setRule('includeProductIds', v)} placeholder="product handle" />
                    </Field>
                    <Field label="Always exclude (product id / handle)">
                      <ChipInput value={form.rules.excludeProductIds} onChange={(v) => setRule('excludeProductIds', v)} placeholder="product handle" />
                    </Field>
                  </div>
                </div>
              </div>

              {/* Right: live preview */}
              <div className="lg:border-l lg:pl-6" style={{ borderColor: C.borderLight }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold" style={{ color: C.text }}>Products in the app</div>
                  <div className="text-xs font-bold" style={{ color: C.goldDark }}>
                    {preview.loading ? 'Checking…' : preview.total != null ? `${preview.total} products` : ''}
                  </div>
                </div>
                {preview.error ? (
                  <div className="text-xs rounded-xl px-3 py-2" style={{ background: C.redBg, color: C.red }}>Preview unavailable: {preview.error}</div>
                ) : preview.total === 0 && !preview.loading ? (
                  <div className="text-xs py-10 text-center" style={{ color: C.textMuted }}>No products match these rules yet.</div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {preview.products.map((p) => (
                      <div key={p.id} className="group relative">
                        <div className="aspect-[3/4] rounded-xl overflow-hidden" style={{ background: C.cream }}>
                          {p.image && <img src={p.image} alt="" loading="lazy" className="w-full h-full object-cover" />}
                        </div>
                        <div className="text-[11px] font-semibold mt-1 line-clamp-2" style={{ color: C.text }}>{p.title}</div>
                        <div className="text-[10px]" style={{ color: C.textMuted }}>{p.productType} · ₹{Number(p.price).toLocaleString('en-IN')}</div>
                        <button type="button" onClick={() => excludeFromPreview(p)} className="absolute top-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/90 text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100">
                          Exclude
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {preview.total > preview.products.length && (
                  <div className="text-[11px] mt-3" style={{ color: C.textMuted }}>Showing the first {preview.products.length} of {preview.total}.</div>
                )}
              </div>

              <div className="lg:col-span-2 flex gap-3 justify-end pt-4 border-t sticky bottom-0 bg-white" style={{ borderColor: C.borderLight }}>
                <Btn type="button" onClick={() => setForm(null)}>Cancel</Btn>
                <Btn primary type="submit" disabled={saving || uploading}>{saving ? 'Saving…' : 'Save'}</Btn>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

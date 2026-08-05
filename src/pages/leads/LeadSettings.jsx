/* ═══════════════════════════════════════════════════════════════════════════
   LEAD SETTINGS — Admin-managed master lists for lead dropdowns
   Countries show dial codes; Locations show parent country
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react'
import { C, toast } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'
import { invalidateLeadMasterLists } from './useLeadMasterLists'

const CATEGORIES = [
  { key: 'lead_source', label: 'Lead Sources', description: 'Where leads come from (e.g. Whatsapp Ad, Instagram Ad, Google Search)' },
  { key: 'channel', label: 'Channels', description: 'Lead acquisition channels (e.g. Online Lead, Store Walk-in)' },
  { key: 'occasion', label: 'Occasions', description: 'Events the client is shopping for (e.g. Wedding, Engagement, Party)' },
  { key: 'product_category', label: 'Product Categories', description: 'Product types clients are interested in (e.g. Kurtas, Sherwanis, Blazers)' },
  { key: 'country', label: 'Countries & Dial Codes', description: 'Client country options with dial codes (e.g. India +91, UAE +971)' },
  { key: 'location', label: 'Locations / Cities', description: 'Client city or area options, mapped to a country' },
  { key: 'utm_campaign', label: 'UTM Campaigns', description: 'Campaign tags for tracking lead source campaigns' },
  { key: 'ytq_call_outcome', label: 'Pre-Qualification Call Outcomes', description: 'Call outcomes for Yet to Qualify leads (e.g. No answer, Answered - busy, Had conversation)' },
  { key: 'qualified_call_outcome', label: 'Qualified Call Outcomes', description: 'Call outcomes for Qualified leads (e.g. Call back later, Store visit booked, Converted)' },
  { key: 'lost_reason', label: 'Lost / Not Qualified Reasons', description: 'Reasons for marking a lead as Lost or Not Qualified (e.g. Budget too low, Not serious)' },
]

// ─── Generic master list section ──────────────────────────────────────────
const MasterListSection = ({ category, label, description }) => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [newValue, setNewValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [open, setOpen] = useState(false)

  const fetchItems = async () => {
    const { data, error } = await supa
      .from('lead_master_lists')
      .select('*')
      .eq('category', category)
      .order('sort_order')
    if (!error && data) setItems(data)
    setLoading(false)
  }

  useEffect(() => { fetchItems() }, [category])

  const handleAdd = async () => {
    const val = newValue.trim()
    if (!val) return
    if (items.find(i => i.value.toLowerCase() === val.toLowerCase())) {
      toast(false, `"${val}" already exists`)
      return
    }
    setAdding(true)
    try {
      const maxSort = items.length > 0 ? Math.max(...items.map(i => i.sort_order || 0)) : 0
      const { error } = await supa.from('lead_master_lists').insert([{ category, value: val, sort_order: maxSort + 1 }])
      if (error) throw error
      setNewValue('')
      toast(true, `Added "${val}"`)
      fetchItems()
      invalidateLeadMasterLists()
    } catch (e) {
      toast(false, 'Failed to add')
    } finally { setAdding(false) }
  }

  const handleSaveEdit = async (id) => {
    const val = editValue.trim()
    if (!val) return
    try {
      const { error } = await supa.from('lead_master_lists').update({ value: val }).eq('id', id)
      if (error) throw error
      setEditId(null)
      toast(true, 'Updated')
      fetchItems()
      invalidateLeadMasterLists()
    } catch (e) {
      toast(false, 'Failed to update')
    }
  }

  const handleDelete = async (id) => {
    try {
      await supa.from('lead_master_lists').delete().eq('id', id)
      setConfirmDel(null)
      toast(true, 'Removed')
      fetchItems()
      invalidateLeadMasterLists()
    } catch (e) {
      toast(false, 'Failed to delete')
    }
  }

  const handleMoveUp = async (idx) => {
    if (idx === 0) return
    const prev = items[idx - 1]
    const curr = items[idx]
    await supa.from('lead_master_lists').update({ sort_order: prev.sort_order }).eq('id', curr.id)
    await supa.from('lead_master_lists').update({ sort_order: curr.sort_order }).eq('id', prev.id)
    fetchItems()
    invalidateLeadMasterLists()
  }

  return (
    <div className="mb-4 rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.cardBg }}>
      {/* Header — clickable to expand */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ borderBottom: open ? `1px solid ${C.border}` : 'none' }}
      >
        <div>
          <div className="font-bold text-sm" style={{ color: C.text }}>{label}</div>
          <div className="text-xs" style={{ color: C.textMuted }}>{description}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: C.goldLight + '30', color: C.gold }}>
            {items.length}
          </span>
          <span className="text-xs" style={{ color: C.textMuted }}>{open ? '▼' : '▶'}</span>
        </div>
      </button>

      {open && (
        <div className="p-4">
          {/* Add new */}
          <div className="flex gap-2 mb-3">
            <input
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              placeholder={`Add new ${label.toLowerCase().replace(/s$/, '')}...`}
              className="flex-1 text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newValue.trim()}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: C.gold }}
            >
              {adding ? '...' : '+ Add'}
            </button>
          </div>

          {/* Items list */}
          {loading ? (
            <div className="text-center py-4 text-sm" style={{ color: C.textMuted }}>Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-4 text-sm" style={{ color: C.textMuted }}>No items yet</div>
          ) : (
            <div className="space-y-1">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors hover:bg-gray-50"
                  style={{ background: idx % 2 === 0 ? 'transparent' : C.bg }}
                >
                  {/* Reorder */}
                  <button
                    onClick={() => handleMoveUp(idx)}
                    disabled={idx === 0}
                    className="text-xs p-0.5 disabled:opacity-20"
                    style={{ color: C.textMuted }}
                    title="Move up"
                  >▲</button>

                  {/* Value */}
                  {editId === item.id ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(item.id); if (e.key === 'Escape') setEditId(null) }}
                        className="flex-1 text-sm px-2 py-1 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
                        style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                        autoFocus
                      />
                      <button onClick={() => handleSaveEdit(item.id)} className="text-xs font-bold" style={{ color: C.gold }}>Save</button>
                      <button onClick={() => setEditId(null)} className="text-xs" style={{ color: C.textMuted }}>Cancel</button>
                    </div>
                  ) : (
                    <div className="flex-1 text-sm" style={{ color: C.text }}>{item.value}</div>
                  )}

                  {/* Actions */}
                  {editId !== item.id && confirmDel !== item.id && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditId(item.id); setEditValue(item.value) }}
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ color: C.textMuted }}
                        title="Rename"
                      >✎</button>
                      <button
                        onClick={() => setConfirmDel(item.id)}
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ color: C.textMuted }}
                        title="Delete"
                      >✕</button>
                    </div>
                  )}

                  {confirmDel === item.id && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold" style={{ color: '#dc2626' }}>Delete?</span>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-2 py-0.5 text-xs rounded-lg font-bold text-white"
                        style={{ background: '#dc2626' }}
                      >Yes</button>
                      <button
                        onClick={() => setConfirmDel(null)}
                        className="px-2 py-0.5 text-xs rounded-lg"
                        style={{ background: C.bg, color: C.textMuted }}
                      >No</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Countries section with dial code editing ─────────────────────────────
const CountrySection = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [newValue, setNewValue] = useState('')
  const [newDialCode, setNewDialCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [editDialCode, setEditDialCode] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [open, setOpen] = useState(false)

  const fetchItems = async () => {
    const { data, error } = await supa
      .from('lead_master_lists')
      .select('*')
      .eq('category', 'country')
      .order('sort_order')
    if (!error && data) setItems(data)
    setLoading(false)
  }

  useEffect(() => { fetchItems() }, [])

  const handleAdd = async () => {
    const val = newValue.trim()
    if (!val) return
    if (items.find(i => i.value.toLowerCase() === val.toLowerCase())) {
      toast(false, `"${val}" already exists`)
      return
    }
    setAdding(true)
    try {
      const maxSort = items.length > 0 ? Math.max(...items.map(i => i.sort_order || 0)) : 0
      const insertData = { category: 'country', value: val, sort_order: maxSort + 1 }
      if (newDialCode.trim()) insertData.dial_code = newDialCode.trim()
      const { error } = await supa.from('lead_master_lists').insert([insertData])
      if (error) throw error
      setNewValue('')
      setNewDialCode('')
      toast(true, `Added "${val}"`)
      fetchItems()
      invalidateLeadMasterLists()
    } catch (e) {
      toast(false, 'Failed to add')
    } finally { setAdding(false) }
  }

  const handleSaveEdit = async (id) => {
    const val = editValue.trim()
    if (!val) return
    try {
      const updateData = { value: val, dial_code: editDialCode.trim() || null }
      const { error } = await supa.from('lead_master_lists').update(updateData).eq('id', id)
      if (error) throw error
      setEditId(null)
      toast(true, 'Updated')
      fetchItems()
      invalidateLeadMasterLists()
    } catch (e) {
      toast(false, 'Failed to update')
    }
  }

  const handleDelete = async (id) => {
    try {
      await supa.from('lead_master_lists').delete().eq('id', id)
      setConfirmDel(null)
      toast(true, 'Removed')
      fetchItems()
      invalidateLeadMasterLists()
    } catch (e) {
      toast(false, 'Failed to delete')
    }
  }

  const handleMoveUp = async (idx) => {
    if (idx === 0) return
    const prev = items[idx - 1]
    const curr = items[idx]
    await supa.from('lead_master_lists').update({ sort_order: prev.sort_order }).eq('id', curr.id)
    await supa.from('lead_master_lists').update({ sort_order: curr.sort_order }).eq('id', prev.id)
    fetchItems()
    invalidateLeadMasterLists()
  }

  return (
    <div className="mb-4 rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.cardBg }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ borderBottom: open ? `1px solid ${C.border}` : 'none' }}
      >
        <div>
          <div className="font-bold text-sm" style={{ color: C.text }}>Countries & Dial Codes</div>
          <div className="text-xs" style={{ color: C.textMuted }}>Client country options with dial codes (e.g. India +91, UAE +971)</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: C.goldLight + '30', color: C.gold }}>
            {items.length}
          </span>
          <span className="text-xs" style={{ color: C.textMuted }}>{open ? '▼' : '▶'}</span>
        </div>
      </button>

      {open && (
        <div className="p-4">
          {/* Add new country + dial code */}
          <div className="flex gap-2 mb-3">
            <input
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              placeholder="Country name..."
              className="flex-1 text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
            />
            <input
              value={newDialCode}
              onChange={e => setNewDialCode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              placeholder="+91"
              className="text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, width: '80px' }}
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newValue.trim()}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: C.gold }}
            >
              {adding ? '...' : '+ Add'}
            </button>
          </div>

          {loading ? (
            <div className="text-center py-4 text-sm" style={{ color: C.textMuted }}>Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-4 text-sm" style={{ color: C.textMuted }}>No countries yet</div>
          ) : (
            <div className="space-y-1">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors hover:bg-gray-50"
                  style={{ background: idx % 2 === 0 ? 'transparent' : C.bg }}
                >
                  <button
                    onClick={() => handleMoveUp(idx)}
                    disabled={idx === 0}
                    className="text-xs p-0.5 disabled:opacity-20"
                    style={{ color: C.textMuted }}
                    title="Move up"
                  >▲</button>

                  {editId === item.id ? (
                    <div className="flex-1 flex gap-2 items-center">
                      <input
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(item.id); if (e.key === 'Escape') setEditId(null) }}
                        className="flex-1 text-sm px-2 py-1 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
                        style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                        autoFocus
                      />
                      <input
                        value={editDialCode}
                        onChange={e => setEditDialCode(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(item.id); if (e.key === 'Escape') setEditId(null) }}
                        placeholder="+code"
                        className="text-sm px-2 py-1 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
                        style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, width: '70px' }}
                      />
                      <button onClick={() => handleSaveEdit(item.id)} className="text-xs font-bold" style={{ color: C.gold }}>Save</button>
                      <button onClick={() => setEditId(null)} className="text-xs" style={{ color: C.textMuted }}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 text-sm flex items-center gap-2" style={{ color: C.text }}>
                        <span>{item.value}</span>
                        {item.dial_code && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            {item.dial_code}
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {editId !== item.id && confirmDel !== item.id && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditId(item.id); setEditValue(item.value); setEditDialCode(item.dial_code || '') }}
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ color: C.textMuted }}
                        title="Edit"
                      >✎</button>
                      <button
                        onClick={() => setConfirmDel(item.id)}
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ color: C.textMuted }}
                        title="Delete"
                      >✕</button>
                    </div>
                  )}

                  {confirmDel === item.id && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold" style={{ color: '#dc2626' }}>Delete?</span>
                      <button onClick={() => handleDelete(item.id)} className="px-2 py-0.5 text-xs rounded-lg font-bold text-white" style={{ background: '#dc2626' }}>Yes</button>
                      <button onClick={() => setConfirmDel(null)} className="px-2 py-0.5 text-xs rounded-lg" style={{ background: C.bg, color: C.textMuted }}>No</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Locations section with country parent ────────────────────────────────
const LocationSection = () => {
  const [items, setItems] = useState([])
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [newValue, setNewValue] = useState('')
  const [newParent, setNewParent] = useState('India')
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [editParent, setEditParent] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [open, setOpen] = useState(false)

  const fetchItems = async () => {
    const [locRes, countryRes] = await Promise.all([
      supa.from('lead_master_lists').select('*').eq('category', 'location').order('parent_value').order('sort_order'),
      supa.from('lead_master_lists').select('value').eq('category', 'country').order('sort_order'),
    ])
    if (!locRes.error && locRes.data) setItems(locRes.data)
    if (!countryRes.error && countryRes.data) setCountries(countryRes.data.map(c => c.value))
    setLoading(false)
  }

  useEffect(() => { fetchItems() }, [])

  const handleAdd = async () => {
    const val = newValue.trim()
    if (!val) return
    if (items.find(i => i.value.toLowerCase() === val.toLowerCase())) {
      toast(false, `"${val}" already exists`)
      return
    }
    setAdding(true)
    try {
      const maxSort = items.length > 0 ? Math.max(...items.map(i => i.sort_order || 0)) : 0
      const { error } = await supa.from('lead_master_lists').insert([{
        category: 'location', value: val, sort_order: maxSort + 1,
        parent_value: newParent || null
      }])
      if (error) throw error
      setNewValue('')
      toast(true, `Added "${val}" under ${newParent}`)
      fetchItems()
      invalidateLeadMasterLists()
    } catch (e) {
      toast(false, 'Failed to add')
    } finally { setAdding(false) }
  }

  const handleSaveEdit = async (id) => {
    const val = editValue.trim()
    if (!val) return
    try {
      const { error } = await supa.from('lead_master_lists').update({ value: val, parent_value: editParent || null }).eq('id', id)
      if (error) throw error
      setEditId(null)
      toast(true, 'Updated')
      fetchItems()
      invalidateLeadMasterLists()
    } catch (e) {
      toast(false, 'Failed to update')
    }
  }

  const handleDelete = async (id) => {
    try {
      await supa.from('lead_master_lists').delete().eq('id', id)
      setConfirmDel(null)
      toast(true, 'Removed')
      fetchItems()
      invalidateLeadMasterLists()
    } catch (e) {
      toast(false, 'Failed to delete')
    }
  }

  // Group locations by country
  const grouped = {}
  const ungrouped = []
  items.forEach(item => {
    if (item.parent_value) {
      if (!grouped[item.parent_value]) grouped[item.parent_value] = []
      grouped[item.parent_value].push(item)
    } else {
      ungrouped.push(item)
    }
  })

  return (
    <div className="mb-4 rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.cardBg }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ borderBottom: open ? `1px solid ${C.border}` : 'none' }}
      >
        <div>
          <div className="font-bold text-sm" style={{ color: C.text }}>Locations / Cities</div>
          <div className="text-xs" style={{ color: C.textMuted }}>Client city or area options, grouped by country</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: C.goldLight + '30', color: C.gold }}>
            {items.length}
          </span>
          <span className="text-xs" style={{ color: C.textMuted }}>{open ? '▼' : '▶'}</span>
        </div>
      </button>

      {open && (
        <div className="p-4">
          {/* Add new location with country parent */}
          <div className="flex gap-2 mb-3">
            <select
              value={newParent}
              onChange={e => setNewParent(e.target.value)}
              className="text-sm px-2 py-2 rounded-lg outline-none"
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, width: '140px' }}
            >
              <option value="">No country</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              placeholder="City / location name..."
              className="flex-1 text-sm px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newValue.trim()}
              className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: C.gold }}
            >
              {adding ? '...' : '+ Add'}
            </button>
          </div>

          {loading ? (
            <div className="text-center py-4 text-sm" style={{ color: C.textMuted }}>Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-4 text-sm" style={{ color: C.textMuted }}>No locations yet</div>
          ) : (
            <div className="space-y-4">
              {/* Grouped by country */}
              {Object.entries(grouped).map(([country, locs]) => (
                <div key={country}>
                  <div className="text-xs font-bold uppercase mb-1.5 px-1" style={{ color: C.gold }}>{country}</div>
                  <div className="space-y-1">
                    {locs.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors hover:bg-gray-50 ml-3"
                        style={{ borderLeft: `2px solid ${C.gold}30` }}
                      >
                        {editId === item.id ? (
                          <div className="flex-1 flex gap-2 items-center">
                            <select
                              value={editParent}
                              onChange={e => setEditParent(e.target.value)}
                              className="text-xs px-1.5 py-1 rounded outline-none"
                              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, width: '110px' }}
                            >
                              <option value="">None</option>
                              {countries.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(item.id); if (e.key === 'Escape') setEditId(null) }}
                              className="flex-1 text-sm px-2 py-1 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
                              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                              autoFocus
                            />
                            <button onClick={() => handleSaveEdit(item.id)} className="text-xs font-bold" style={{ color: C.gold }}>Save</button>
                            <button onClick={() => setEditId(null)} className="text-xs" style={{ color: C.textMuted }}>Cancel</button>
                          </div>
                        ) : (
                          <div className="flex-1 text-sm" style={{ color: C.text }}>{item.value}</div>
                        )}

                        {editId !== item.id && confirmDel !== item.id && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setEditId(item.id); setEditValue(item.value); setEditParent(item.parent_value || '') }}
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ color: C.textMuted }}
                            >✎</button>
                            <button
                              onClick={() => setConfirmDel(item.id)}
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ color: C.textMuted }}
                            >✕</button>
                          </div>
                        )}

                        {confirmDel === item.id && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold" style={{ color: '#dc2626' }}>Delete?</span>
                            <button onClick={() => handleDelete(item.id)} className="px-2 py-0.5 text-xs rounded-lg font-bold text-white" style={{ background: '#dc2626' }}>Yes</button>
                            <button onClick={() => setConfirmDel(null)} className="px-2 py-0.5 text-xs rounded-lg" style={{ background: C.bg, color: C.textMuted }}>No</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Ungrouped */}
              {ungrouped.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase mb-1.5 px-1" style={{ color: C.textMuted }}>No Country Assigned</div>
                  <div className="space-y-1">
                    {ungrouped.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors hover:bg-gray-50 ml-3"
                        style={{ borderLeft: `2px solid ${C.border}` }}
                      >
                        {editId === item.id ? (
                          <div className="flex-1 flex gap-2 items-center">
                            <select
                              value={editParent}
                              onChange={e => setEditParent(e.target.value)}
                              className="text-xs px-1.5 py-1 rounded outline-none"
                              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, width: '110px' }}
                            >
                              <option value="">None</option>
                              {countries.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(item.id); if (e.key === 'Escape') setEditId(null) }}
                              className="flex-1 text-sm px-2 py-1 rounded-lg outline-none focus:ring-2 focus:ring-amber-200"
                              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text }}
                              autoFocus
                            />
                            <button onClick={() => handleSaveEdit(item.id)} className="text-xs font-bold" style={{ color: C.gold }}>Save</button>
                            <button onClick={() => setEditId(null)} className="text-xs" style={{ color: C.textMuted }}>Cancel</button>
                          </div>
                        ) : (
                          <div className="flex-1 text-sm" style={{ color: C.text }}>{item.value}</div>
                        )}

                        {editId !== item.id && confirmDel !== item.id && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setEditId(item.id); setEditValue(item.value); setEditParent(item.parent_value || '') }}
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ color: C.textMuted }}
                            >✎</button>
                            <button
                              onClick={() => setConfirmDel(item.id)}
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{ color: C.textMuted }}
                            >✕</button>
                          </div>
                        )}

                        {confirmDel === item.id && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold" style={{ color: '#dc2626' }}>Delete?</span>
                            <button onClick={() => handleDelete(item.id)} className="px-2 py-0.5 text-xs rounded-lg font-bold text-white" style={{ background: '#dc2626' }}>Yes</button>
                            <button onClick={() => setConfirmDel(null)} className="px-2 py-0.5 text-xs rounded-lg" style={{ background: C.bg, color: C.textMuted }}>No</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Settings Component ──────────────────────────────────────────────
export const LeadSettings = () => {
  // Filter out country and location from generic categories (they have custom sections)
  const genericCategories = CATEGORIES.filter(c => c.key !== 'country' && c.key !== 'location')

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-bold mb-1" style={{ color: C.text }}>Lead Settings</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>
          Manage the dropdown options used across the Leads CRM. Add, rename, reorder, or remove items from each list.
        </p>
      </div>

      {genericCategories.map(cat => {
        // Render country and location sections in order
        const result = [
          <MasterListSection key={cat.key} category={cat.key} label={cat.label} description={cat.description} />
        ]
        return result
      })}

      {/* Custom sections for Country and Location */}
      <CountrySection />
      <LocationSection />
    </div>
  )
}

import React, { useState } from 'react'
import { supa } from '../../lib/supabase'
import Icon from '../../components/Icon'
import { CATEGORIES } from '../../lib/constants'

/*
  Stitching Cost Master (Supabase-backed)
  ---------------------------------------
  Writes directly to the `stitching_cost_master` table.
  The parent App.jsx holds the in-memory `stitching` state (same shape as legacy
  localStorage entries: {id, garmentType, category, cost}) and syncs it whenever
  we add / edit / delete rows here, so all downstream consumers (Calculator,
  Catalogue, OutsourceVendorsTab, etc.) keep working without prop changes.
*/

const StitchingCostMaster = ({ items, setItems }) => {
  const [editing, setEditing] = useState(null) // 'new' | uuid | null
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)

  const openAdd = () => { setForm({ garmentType: '', category: CATEGORIES[0] || '', cost: '' }); setEditing('new') }
  const openEdit = (item) => { setForm({ ...item }); setEditing(item.id) }
  const cancel = () => { setEditing(null); setForm({}) }

  const saveItem = async () => {
    if (!form.garmentType || !form.garmentType.trim()) { alert('Garment type is required'); return }
    setSaving(true)
    try {
      const payload = {
        garment_type: form.garmentType.trim(),
        category: form.category || '',
        cost: Number(form.cost) || 0,
        updated_at: new Date().toISOString()
      }
      if (editing === 'new') {
        const { data, error } = await supa.from('stitching_cost_master').insert(payload).select().single()
        if (error) throw error
        const newRow = { id: data.id, garmentType: data.garment_type, category: data.category || '', cost: Number(data.cost) || 0 }
        setItems([...(items || []), newRow])
      } else {
        const { data, error } = await supa.from('stitching_cost_master').update(payload).eq('id', editing).select().single()
        if (error) throw error
        const updated = { id: data.id, garmentType: data.garment_type, category: data.category || '', cost: Number(data.cost) || 0 }
        setItems((items || []).map(i => i.id === editing ? updated : i))
      }
      setEditing(null); setForm({})
    } catch (e) {
      console.error('Stitching master save error:', e)
      alert('Failed to save: ' + (e.message || 'unknown error'))
    }
    setSaving(false)
  }

  const deleteItem = async (id) => {
    if (!confirm('Delete this stitching type? Vendor rate cards that reference it by name will still display correctly.')) return
    try {
      const { error } = await supa.from('stitching_cost_master').delete().eq('id', id)
      if (error) throw error
      setItems((items || []).filter(i => i.id !== id))
    } catch (e) {
      console.error('Stitching master delete error:', e)
      alert('Failed to delete: ' + (e.message || 'unknown error'))
    }
  }

  const rows = items || []

  return (
    <div className="bg-white rounded-lg sm:rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-700 text-xs sm:text-base">Stitching Cost Master</h3>
          <div className="text-[11px] text-gray-400 mt-0.5">Synced across devices · powers catalogue & outsource rate cards</div>
        </div>
        <button onClick={openAdd} className="btn-gold px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-medium flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
          <Icon name="plus" cls="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Add Type
        </button>
      </div>
      {editing && (
        <div className="px-3 sm:px-6 py-3 sm:py-4 bg-amber-50 border-b">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Garment Type</label>
              <input type="text" value={form.garmentType || ''} onChange={e => setForm(fr => ({ ...fr, garmentType: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="Plain Kurta" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <select value={form.category || ''} onChange={e => setForm(fr => ({ ...fr, category: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
                <option value="">—</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Cost (₹)</label>
              <input type="number" value={form.cost || ''} onChange={e => setForm(fr => ({ ...fr, cost: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="600" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2 sm:mt-3">
            <button onClick={cancel} disabled={saving} className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-gray-200 text-xs text-gray-500">Cancel</button>
            <button onClick={saveItem} disabled={saving} className="btn-gold px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-medium">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
      {/* Mobile cards */}
      <div className="sm:hidden divide-y">
        {rows.map(item => (
          <div key={item.id} className="px-3 py-2.5 flex items-center justify-between gap-2">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-800">{item.garmentType || '—'}</div>
              <div className="text-xs text-gray-400">{item.category || '—'} · ₹{item.cost || 0}</div>
            </div>
            <div className="flex gap-1 ml-3">
              <button onClick={() => openEdit(item)} className="p-2 rounded hover:bg-gray-100 text-gray-400"><Icon name="edit" cls="w-4 h-4" /></button>
              <button onClick={() => deleteItem(item.id)} className="p-2 rounded hover:bg-gray-100 text-gray-400"><Icon name="trash" cls="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="text-center text-xs text-gray-400 py-6">No stitching types yet.</div>}
      </div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs sm:text-sm" style={{ minWidth: '100%' }}>
          <thead><tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide border-b">
            <th className="px-3 sm:px-6 py-2 sm:py-3 text-left">Garment Type</th>
            <th className="px-3 sm:px-6 py-2 sm:py-3 text-left">Category</th>
            <th className="px-3 sm:px-6 py-2 sm:py-3 text-left">Cost (₹)</th>
            <th className="px-3 sm:px-4 py-2 sm:py-3 w-16"></th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(item => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-3 sm:px-6 py-2 sm:py-3 text-gray-700">{item.garmentType || '—'}</td>
                <td className="px-3 sm:px-6 py-2 sm:py-3 text-gray-700">{item.category || '—'}</td>
                <td className="px-3 sm:px-6 py-2 sm:py-3 text-gray-700">{item.cost ? '₹' + item.cost : '—'}</td>
                <td className="px-3 sm:px-4 py-2 sm:py-3">
                  <div className="flex gap-0.5 sm:gap-1">
                    <button onClick={() => openEdit(item)} className="p-1 sm:p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 flex-shrink-0"><Icon name="edit" cls="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                    <button onClick={() => deleteItem(item.id)} className="p-1 sm:p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500 flex-shrink-0"><Icon name="trash" cls="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 sm:px-6 py-8 text-center text-xs text-gray-400">No stitching types yet. Click <strong>Add Type</strong> to create one.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default StitchingCostMaster

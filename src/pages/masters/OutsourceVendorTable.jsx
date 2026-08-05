import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { supa } from '../../lib/supabase'
import { n } from '../../lib/helpers'
import { OUTSOURCE_TYPES } from '../../lib/constants'
import { typeColor } from '../../lib/orderUtils'
import Icon from '../../components/Icon'

const OutsourceVendorTable = () => {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [filterType, setFilterType] = useState('All')
  const [search, setSearch] = useState('')

  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const fetchVendors = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supa.from('outsource_vendors').select('*').order('created_at', { ascending: false })
    if (data) setVendors(data)
    if (error) console.error(error)
    setLoading(false)
  }, [])

  useEffect(() => { fetchVendors() }, [fetchVendors])

  const nextId = () => {
    const nums = vendors.map(v => { const m = (v.id || '').match(/-(\d+)$/); return m ? +m[1] : 0 })
    const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1
    return 'HL-OV-' + String(next).padStart(2, '0')
  }

  const openAdd = () => {
    setForm({ id: nextId(), name: '', type: 'Tailoring', services: ['stitching'], location: '', contact: '', phone: '', rate: '', rate_unit: 'per piece', tds_enabled: false, pan: '', opening_balance: 0, notes: '' })
    setEditing('new')
  }

  const openEdit = (v) => { setForm({ ...v }); setEditing(v.id) }

  const typeToService = (type) => {
    const map = { 'Tailoring': 'stitching', 'Dyeing': 'dyeing', 'Hand Embroidery': 'embroidery_hand', 'Machine Embroidery': 'embroidery_machine', 'Hand Painting': 'hand_painting', 'Shoes': 'shoes', 'Other': 'other' }
    return map[type] || 'other'
  }

  const saveItem = async () => {
    if (!form.name) return alert('Vendor name is required')
    try {
      const services = [typeToService(form.type)]
      const payload = {
        name: form.name, type: form.type, services, location: form.location || '',
        contact: form.contact || '', phone: form.contact || '', rate: n(form.rate),
        rate_unit: form.rate_unit || 'per piece', tds_enabled: !!form.tds_enabled,
        pan: form.pan || '', opening_balance: n(form.opening_balance),
        notes: form.notes || '', updated_at: new Date().toISOString()
      }
      if (editing === 'new') {
        const { error } = await supa.from('outsource_vendors').insert({ id: form.id, ...payload, created_at: new Date().toISOString() })
        if (error) throw error
      } else {
        const { error } = await supa.from('outsource_vendors').update(payload).eq('id', editing)
        if (error) throw error
      }
      setEditing(null)
      await fetchVendors()
    } catch (e) { alert('Error: ' + e.message) }
  }

  const deleteItem = async (id) => {
    if (!confirm('Delete vendor? This will also delete all their work entries and payments.')) return
    const { error } = await supa.from('outsource_vendors').delete().eq('id', id)
    if (error) { alert('Failed to delete vendor: ' + (error.message || error)); return }
    await fetchVendors()
  }

  const visible = useMemo(() => {
    let list = filterType === 'All' ? vendors : vendors.filter(v => v.type === filterType)
    if (search) list = list.filter(v => v.name.toLowerCase().includes(search.toLowerCase()) || (v.id || '').toLowerCase().includes(search.toLowerCase()))
    return list
  }, [vendors, filterType, search])

  // Compute TDS aggregates
  const tdsStats = useMemo(() => {
    const enabled = vendors.filter(v => v.tds_enabled)
    return { count: enabled.length }
  }, [vendors])

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading vendors…</div>

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
        <div>
          <h3 className="font-semibold text-gray-700 text-sm sm:text-base">Outsource Vendors</h3>
          <p className="text-xs text-gray-400 mt-0.5">Job-work vendors — paid per piece or per metre · {vendors.length} vendors{tdsStats.count > 0 ? ` · ${tdsStats.count} TDS enabled` : ''}</p>
        </div>
        <button onClick={openAdd} className="btn-gold px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1"><Icon name="plus" cls="w-3.5 h-3.5" /> Add</button>
      </div>

      {/* Type filter pills */}
      <div className="px-4 sm:px-6 py-3 border-b flex gap-1.5 overflow-x-auto flex-wrap">
        {['All', ...OUTSOURCE_TYPES].map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${filterType === t ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{t}</button>
        ))}
      </div>

      {/* Search */}
      <div className="px-4 sm:px-6 py-2 border-b">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID…"
          className="w-full sm:w-64 text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50" />
      </div>

      {/* Inline Edit/Add Form */}
      {editing && (
        <div className="px-4 sm:px-6 py-4 bg-amber-50 border-b space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Vendor ID</label>
              <input value={form.id || ''} onChange={e => fld('id', e.target.value)} disabled={editing !== 'new'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono bg-gray-50" placeholder="HL-OV-01" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Name *</label>
              <input value={form.name || ''} onChange={e => fld('name', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="Vendor name" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Type</label>
              <select value={form.type || 'Tailoring'} onChange={e => fld('type', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
                {OUTSOURCE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Contact / Phone</label>
              <input value={form.contact || ''} onChange={e => fld('contact', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="Phone number" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Rate (₹)</label>
              <input type="number" value={form.rate || ''} onChange={e => fld('rate', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="250" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Rate Unit</label>
              <select value={form.rate_unit || 'per piece'} onChange={e => fld('rate_unit', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
                <option>per piece</option><option>per metre</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Location</label>
              <input value={form.location || ''} onChange={e => fld('location', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="City" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">PAN</label>
              <input value={form.pan || ''} onChange={e => fld('pan', e.target.value.toUpperCase())}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono" placeholder="ABCDE1234F" maxLength={10} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!form.tds_enabled} onChange={e => fld('tds_enabled', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-amber-600" />
              <span className="text-sm font-medium text-gray-700">TDS Enabled (1% deduction)</span>
            </label>
            {form.tds_enabled && !form.pan && <span className="text-xs text-red-500">PAN recommended for TDS vendors</span>}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-500">Cancel</button>
            <button onClick={saveItem} className="btn-gold px-4 py-2 rounded-lg text-xs font-medium">Save</button>
          </div>
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide border-b">
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3 text-center">TDS</th>
              <th className="px-4 py-3 text-left">PAN</th>
              <th className="px-4 py-3 text-left">Location</th>
              <th className="px-4 py-3 text-left">Contact</th>
              <th className="px-4 py-3 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visible.map(v => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-blue-600 font-semibold">{v.id}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{v.name}</td>
                <td className="px-4 py-3"><span className={`badge text-xs ${typeColor(v.type)}`}>{v.type}</span></td>
                <td className="px-4 py-3 text-right text-gray-700 text-xs">{n(v.rate) ? `₹${n(v.rate)} ${v.rate_unit || ''}` : '—'}</td>
                <td className="px-4 py-3 text-center">
                  {v.tds_enabled ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">✓ 1%</span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 font-mono">{v.pan || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{v.location || '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{v.contact || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(v)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Icon name="edit" cls="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteItem(v.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Icon name="trash" cls="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan="9" className="px-6 py-10 text-center text-gray-400 text-sm">No vendors found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden divide-y">
        {visible.map(v => (
          <div key={v.id} className="px-4 py-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-blue-600 font-semibold">{v.id}</span>
                <span className={`badge text-xs ${typeColor(v.type)}`}>{v.type}</span>
                {v.tds_enabled && <span className="text-[10px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">TDS</span>}
              </div>
              <div className="font-medium text-gray-800 text-sm">{v.name}</div>
              {n(v.rate) > 0 && <div className="text-xs text-gray-400">₹{n(v.rate)} {v.rate_unit}</div>}
            </div>
            <div className="flex gap-1">
              <button onClick={() => openEdit(v)} className="p-2 rounded hover:bg-gray-100 text-gray-400"><Icon name="edit" cls="w-4 h-4" /></button>
              <button onClick={() => deleteItem(v.id)} className="p-2 rounded hover:bg-gray-100 text-gray-400"><Icon name="trash" cls="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default OutsourceVendorTable

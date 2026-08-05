import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, nextId } from '../../lib/helpers'
import MasterTable from '../../components/MasterTable'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

const FabricVendorTable = ({ vendors, setVendors }) => {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const openAdd = () => { setForm({ id: nextId(vendors, 'HL-FV'), name: '', location: '', contact: '', gstin: '' }); setEditing('new'); };
  const openEdit = (v) => { setForm({ ...v }); setEditing(v.id); };
  const refreshVendors = async () => {
    const { data } = await supa.from('fabric_vendors').select('*').order('name');
    if (data) setVendors(data.map(v => ({ id: v.id, name: v.name || '', location: v.shipping_address || '', contact: v.spoc_phone || v.spoc_email || '', gstin: v.gstin || '' })));
  };
  const saveItem = async () => {
    if (!form.name) return;
    try {
      const row = { id: form.id, name: form.name, shipping_address: form.location || '', spoc_phone: form.contact || '', gstin: form.gstin || '' };
      if (editing === 'new') {
        const { error } = await supa.from('fabric_vendors').insert(row);
        if (error) throw error;
      } else {
        const { error } = await supa.from('fabric_vendors').update(row).eq('id', editing);
        if (error) throw error;
      }
      await refreshVendors();
    } catch (e) {
      console.error('[HILO] FabricVendor save error:', e);
      alert('Failed to save vendor: ' + (e.message || 'Unknown error'));
    }
    setEditing(null);
  };
  const deleteItem = async (id) => {
    if (!confirm('Delete vendor?')) return;
    try {
      const { error } = await supa.from('fabric_vendors').delete().eq('id', id);
      if (error) throw error;
      await refreshVendors();
    } catch (e) {
      console.error('[HILO] FabricVendor delete error:', e);
      alert('Failed to delete vendor: ' + (e.message || 'Unknown error'));
    }
  };
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
        <div>
          <h3 className="font-semibold text-gray-700 text-sm sm:text-base">Fabric Vendors</h3>
          <p className="text-xs text-gray-400 mt-0.5">Suppliers you buy fabric from — PO & invoice based</p>
        </div>
        <button onClick={openAdd} className="btn-gold px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1"><Icon name="plus" cls="w-3.5 h-3.5" /> Add</button>
      </div>
      {editing && (
        <div className="px-4 sm:px-6 py-4 bg-amber-50 border-b space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[['id','Vendor ID','HL-FV-01','mono'],['name','Name *','Raju & Co.',''],['location','Location','Hyderabad',''],['contact','Contact','Phone / Email',''],['gstin','GSTIN','29XXXXX...','mono']].map(([k,l,p,cls]) => (
              <div key={k}>
                <label className="text-xs font-medium text-gray-500 block mb-1">{l}</label>
                <input value={form[k]||''} onChange={e => fld(k, e.target.value)}
                  className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm ${cls==='mono'?'font-mono bg-gray-50':''}`} placeholder={p} />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-500">Cancel</button>
            <button onClick={saveItem} className="btn-gold px-4 py-2 rounded-lg text-xs font-medium">Save</button>
          </div>
        </div>
      )}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide border-b">
            <th className="px-6 py-3 text-left">ID</th><th className="px-6 py-3 text-left">Name</th><th className="px-6 py-3 text-left">Location</th><th className="px-6 py-3 text-left">Contact</th><th className="px-6 py-3 text-left">GSTIN</th><th className="px-4 py-3 w-16"></th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {vendors.map(v => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-mono text-xs text-blue-600 font-semibold">{v.id}</td>
                <td className="px-6 py-3 font-medium text-gray-800">{v.name}</td>
                <td className="px-6 py-3 text-gray-500 text-xs">{v.location||'—'}</td>
                <td className="px-6 py-3 text-gray-500 text-xs">{v.contact||'—'}</td>
                <td className="px-6 py-3 font-mono text-xs text-gray-400">{v.gstin||'—'}</td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => openEdit(v)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Icon name="edit" cls="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteItem(v.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Icon name="trash" cls="w-3.5 h-3.5" /></button>
                </div></td>
              </tr>
            ))}
            {vendors.length === 0 && <tr><td colSpan="6" className="px-6 py-10 text-center text-gray-400 text-sm">No fabric vendors yet</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="sm:hidden divide-y">
        {vendors.map(v => (
          <div key={v.id} className="px-4 py-3 flex items-center justify-between">
            <div><span className="font-mono text-xs text-blue-600 font-semibold">{v.id}</span><div className="font-medium text-gray-800 text-sm">{v.name}</div>{v.location&&<div className="text-xs text-gray-400">{v.location}</div>}</div>
            <div className="flex gap-1">
              <button onClick={() => openEdit(v)} className="p-2 rounded hover:bg-gray-100 text-gray-400"><Icon name="edit" cls="w-4 h-4" /></button>
              <button onClick={() => deleteItem(v.id)} className="p-2 rounded hover:bg-gray-100 text-gray-400"><Icon name="trash" cls="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FabricVendorTable

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { consumptionToSnake, consumptionToCamel } from '../../lib/caseMapping'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, nextId } from '../../lib/helpers'
import MasterTable from '../../components/MasterTable'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { CATEGORIES } from '../../lib/constants'
import FabricPicker from '../../components/FabricPicker'

// Resolve old fabric IDs to new ones for migration compatibility
const resolveFabricId = (id) => {
  if (!id) return id;
  // Try direct match first; old IDs like "1","2"..,"44","HL-FA-XX" mapped to "FA-XXX"
  const numId = parseInt(id, 10);
  if (!isNaN(numId) && numId >= 1 && numId <= 44) return 'FA-' + String(numId).padStart(3, '0');
  if (/^HL-FA-\d+$/.test(id)) { const m = id.match(/\d+$/); return m ? 'FA-' + String(+m[0]).padStart(3, '0') : id; }
  return id;
};

const ConsumptionMaster = ({ consumption, setConsumption, fabrics }) => {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const fld = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setForm({ category: CATEGORIES[0], fabricId: '', metres: '' }); setEditing('new'); };
  const openEdit = (item) => { setForm({ ...item }); setEditing(item.id); };
  const refreshConsumption = async () => {
    const { data } = await supa.from('consumption_masters').select('*');
    if (data) setConsumption(data.map(consumptionToCamel));
  };

  const saveItem = async () => {
    if (!form.category || !form.fabricId || !form.metres) return;
    var fab = fabrics.find(function(f) { return f.id === form.fabricId || f._oldId === form.fabricId; });
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
    var resolvedFabId = resolveFabricId(form.fabricId);
    var entry = { ...form, id: editing === 'new' ? newId : form.id, fabricId: resolvedFabId, fabricName: fab ? fab.name : '' };
    try {
      const row = consumptionToSnake(entry);
      if (editing === 'new') {
        // Delete any existing entry with same category+fabric pair
        await supa.from('consumption_masters').delete().eq('category', entry.category).eq('fabric_id', entry.fabricId);
        const { error } = await supa.from('consumption_masters').insert(row);
        if (error) throw error;
      } else {
        const { error } = await supa.from('consumption_masters').update(row).eq('id', entry.id);
        if (error) throw error;
      }
      await refreshConsumption();
    } catch (e) {
      console.error('[HILO] saveConsumption error:', e);
      alert('Failed to save: ' + (e.message || 'Unknown error'));
    }
    setEditing(null);
  };
  const deleteItem = async (id) => {
    try {
      const { error } = await supa.from('consumption_masters').delete().eq('id', id);
      if (error) throw error;
      await refreshConsumption();
    } catch (e) {
      console.error('[HILO] deleteConsumption error:', e);
      alert('Failed to delete: ' + (e.message || 'Unknown error'));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm">
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
        <div>
          <h3 className="font-semibold text-gray-700 text-sm sm:text-base">Fabric Consumption Master</h3>
          <p className="text-xs text-gray-400 mt-0.5">Default metres per category × fabric — auto-fills when adding products</p>
        </div>
        <button onClick={openAdd} className="btn-gold px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1">
          <Icon name="plus" cls="w-3.5 h-3.5" /> Add Rule
        </button>
      </div>
      {editing && (
        <div className="px-4 sm:px-6 py-4 bg-amber-50 border-b space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Category *</label>
              <select value={form.category||''} onChange={e => fld('category', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Fabric *</label>
              <FabricPicker fabrics={fabrics} value={form.fabricId||''} onChange={v => fld('fabricId', v)} placeholder="— Select fabric —" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Metres *</label>
              <input type="number" step="0.25" value={form.metres||''} onChange={e => fld('metres', +e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="2.5" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-500">Cancel</button>
            <button onClick={saveItem} className="btn-gold px-4 py-2 rounded-lg text-xs font-medium">Save Rule</button>
          </div>
        </div>
      )}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide border-b">
            <th className="px-6 py-3 text-left">Category</th>
            <th className="px-6 py-3 text-left">Fabric</th>
            <th className="px-6 py-3 text-right">Metres</th>
            <th className="px-4 py-3 w-16"></th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {consumption.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-6 py-3"><span className="badge bg-purple-50 text-purple-700">{c.category}</span></td>
                <td className="px-6 py-3 font-medium text-gray-800">{c.fabricName || c.fabricId}</td>
                <td className="px-6 py-3 text-right font-semibold text-gray-700">{c.metres}m</td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Icon name="edit" cls="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteItem(c.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Icon name="trash" cls="w-3.5 h-3.5" /></button>
                </div></td>
              </tr>
            ))}
            {consumption.length === 0 && <tr><td colSpan="4" className="px-6 py-10 text-center text-gray-400 text-sm">No rules yet — add category × fabric combinations</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="sm:hidden divide-y">
        {consumption.map(c => (
          <div key={c.id} className="px-4 py-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="badge bg-purple-50 text-purple-700 text-xs">{c.category}</span>
                <span className="font-medium text-gray-800 text-sm">{c.fabricName}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{c.metres} metres</div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => openEdit(c)} className="p-2 rounded hover:bg-gray-100 text-gray-400"><Icon name="edit" cls="w-4 h-4" /></button>
              <button onClick={() => deleteItem(c.id)} className="p-2 rounded hover:bg-gray-100 text-gray-400"><Icon name="trash" cls="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Channel Master ───────────────────────────────────────────────────────────

export default ConsumptionMaster

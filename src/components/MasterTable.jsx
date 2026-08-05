import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../lib/supabase'
import { dyeToSnake, dyeToCamel } from '../lib/caseMapping'
import Icon from './Icon'

// Map legacy storageKey → Supabase table name + conversion functions
const TABLE_MAP = {
  'hl_dyes': { table: 'dye_masters', toSnake: dyeToSnake, toCamel: dyeToCamel },
};

const MasterTable = ({ title, items, setItems, storageKey, fields, addLabel }) => {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const openAdd = () => { setForm({}); setEditing('new'); };
  const openEdit = (item) => { setForm({...item}); setEditing(item.id); };

  const config = TABLE_MAP[storageKey];

  const refreshFromDb = async () => {
    if (!config) return;
    const { data } = await supa.from(config.table).select('*');
    if (data) setItems(data.map(config.toCamel));
  };

  const saveItem = async () => {
    const id = editing === 'new'
      ? ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)))
      : form.id;
    const entry = { ...form, id: editing === 'new' ? id : form.id };

    if (config) {
      try {
        const row = config.toSnake(entry);
        if (editing === 'new') {
          row.id = id;
          const { error } = await supa.from(config.table).insert(row);
          if (error) throw error;
        } else {
          const { error } = await supa.from(config.table).update(row).eq('id', form.id);
          if (error) throw error;
        }
        await refreshFromDb();
      } catch (e) {
        console.error('[HILO] MasterTable save error:', e);
        alert('Failed to save: ' + (e.message || 'Unknown error'));
      }
    } else {
      // Fallback for unknown storageKeys (should not happen after migration)
      const updated = editing === 'new' ? [...items, entry] : items.map(i => i.id === editing ? form : i);
      setItems(updated);
    }
    setEditing(null);
  };

  const deleteItem = async (id) => {
    if (!confirm('Delete?')) return;
    if (config) {
      try {
        const { error } = await supa.from(config.table).delete().eq('id', id);
        if (error) throw error;
        await refreshFromDb();
      } catch (e) {
        console.error('[HILO] MasterTable delete error:', e);
        alert('Failed to delete: ' + (e.message || 'Unknown error'));
      }
    } else {
      const updated = items.filter(i => i.id !== id);
      setItems(updated);
    }
  };
  return (
    <div className="bg-white rounded-lg sm:rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b gap-2 flex-wrap">
        <h3 className="font-semibold text-gray-700 text-xs sm:text-base">{title}</h3>
        <button onClick={openAdd} className="btn-gold px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-medium flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
          <Icon name="plus" cls="w-3 h-3 sm:w-3.5 sm:h-3.5" /> {addLabel}
        </button>
      </div>
      {editing && (
        <div className="px-3 sm:px-6 py-3 sm:py-4 bg-amber-50 border-b">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {fields.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
                {f.type === 'select' ? (
                  <select value={form[f.key]||''} onChange={e => setForm(fr => ({...fr, [f.key]: e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
                    {f.options.map(o => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={f.type||'text'} value={form[f.key]||''} onChange={e => setForm(fr => ({...fr, [f.key]: f.type === 'number' ? +e.target.value : e.target.value}))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder={f.placeholder||''} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-2 sm:mt-3">
            <button onClick={() => setEditing(null)} className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-gray-200 text-xs text-gray-500">Cancel</button>
            <button onClick={saveItem} className="btn-gold px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-medium">Save</button>
          </div>
        </div>
      )}
      {/* Mobile cards */}
      <div className="sm:hidden divide-y">
        {items.map(item => (
          <div key={item.id} className="px-3 py-2.5 sm:py-3 flex items-center justify-between gap-2">
            <div className="flex-1">
              {fields.filter(f => f.key !== 'id').slice(0,2).map(f => (
                <div key={f.key} className="text-sm">{f.key === fields[0].key ? <span className="font-medium text-gray-800">{item[f.key]}</span> : <span className="text-gray-400 text-xs">{f.label}: {item[f.key]}</span>}</div>
              ))}
            </div>
            <div className="flex gap-1 ml-3">
              <button onClick={() => openEdit(item)} className="p-2 rounded hover:bg-gray-100 text-gray-400"><Icon name="edit" cls="w-4 h-4" /></button>
              <button onClick={() => deleteItem(item.id)} className="p-2 rounded hover:bg-gray-100 text-gray-400"><Icon name="trash" cls="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-xs sm:text-sm" style={{minWidth:'100%'}}>
          <thead><tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide border-b">
            {fields.map(f => <th key={f.key} className="px-3 sm:px-6 py-2 sm:py-3 text-left">{f.label}</th>)}
            <th className="px-3 sm:px-4 py-2 sm:py-3 w-16"></th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {items.map(item => (
              <tr key={item.id} className="hover:bg-gray-50">
                {fields.map(f => <td key={f.key} className="px-3 sm:px-6 py-2 sm:py-3 text-gray-700">{item[f.key] || '—'}</td>)}
                <td className="px-3 sm:px-4 py-2 sm:py-3">
                  <div className="flex gap-0.5 sm:gap-1">
                    <button onClick={() => openEdit(item)} className="p-1 sm:p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 flex-shrink-0"><Icon name="edit" cls="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                    <button onClick={() => deleteItem(item.id)} className="p-1 sm:p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500 flex-shrink-0"><Icon name="trash" cls="w-3 h-3 sm:w-3.5 sm:h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Category Master ─────────────────────────────────────────────────────────

export default MasterTable

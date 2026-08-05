import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { categoryToSnake, categoryToCamel } from '../../lib/caseMapping'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, nextId } from '../../lib/helpers'
import MasterTable from '../../components/MasterTable'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

const CategoryMaster = ({ categories, setCategories }) => {
  const [editing, setEditing] = useState(null); // null | 'new' | category id
  const [form, setForm] = useState({ name: '', defaultAccessories: [] });
  const [newAcc, setNewAcc] = useState({ name: '', cost: '' });
  const [syncingTags, setSyncingTags] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const refreshCategories = async () => {
    const { data } = await supa.from('product_categories').select('*');
    if (data) setCategories(data.map(categoryToCamel));
  };

  const syncCollectionTags = async () => {
    setSyncingTags(true); setSyncMsg('');
    try {
      const { data, error } = await supa.functions.invoke('sync-catalogue', { body: {} });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Failed');
      const colls = data.collections || [];
      var updated = [...categories];
      var newCount = 0;
      var matchCount = 0;
      colls.forEach(coll => {
        const idx = updated.findIndex(c =>
          c.name?.toLowerCase() === coll.title?.toLowerCase() ||
          c.shopify_tag?.toLowerCase() === coll.title?.toLowerCase()
        );
        if (idx >= 0) {
          if (!updated[idx].shopify_tag || updated[idx].shopify_tag !== coll.title) {
            updated[idx] = { ...updated[idx], shopify_tag: coll.title };
            matchCount++;
          }
        } else {
          updated.push({
            id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)),
            name: coll.title,
            shopify_tag: coll.title,
            group: '',
            defaultAccessories: [],
          });
          newCount++;
        }
      });
      // Persist to Supabase
      const rows = updated.map(c => categoryToSnake(c));
      await supa.from('product_categories').upsert(rows, { onConflict: 'id' });
      await refreshCategories();
      setSyncMsg(`Synced ${colls.length} collections: ${matchCount} tags updated, ${newCount} new categories created`);
    } catch (e) {
      setSyncMsg(`Error: ${e.message}`);
    }
    setSyncingTags(false);
  };

  const openAdd = () => { setForm({ name: '', shopify_tag: '', group: '', defaultAccessories: [] }); setNewAcc({ name:'', cost:'' }); setEditing('new'); };
  const openEdit = (cat) => { setForm({ ...cat, shopify_tag: cat.shopify_tag||'', group: cat.group||'', defaultAccessories: [...(cat.defaultAccessories||[])] }); setNewAcc({ name:'', cost:'' }); setEditing(cat.id); };

  const saveCategory = async () => {
    try {
      if (editing === 'new') {
        const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
        const row = categoryToSnake({ ...form, id });
        const { error } = await supa.from('product_categories').insert(row);
        if (error) throw error;
      } else {
        const row = categoryToSnake({ ...form, id: editing });
        const { error } = await supa.from('product_categories').update(row).eq('id', editing);
        if (error) throw error;
      }
      await refreshCategories();
    } catch (e) {
      console.error('[HILO] saveCategory error:', e);
      alert('Failed to save category: ' + (e.message || 'Unknown error'));
    }
    setEditing(null);
  };

  const deleteCategory = async (id) => {
    if (!confirm('Delete this category?')) return;
    try {
      const { error } = await supa.from('product_categories').delete().eq('id', id);
      if (error) throw error;
      await refreshCategories();
    } catch (e) {
      console.error('[HILO] deleteCategory error:', e);
      alert('Failed to delete category: ' + (e.message || 'Unknown error'));
    }
  };

  const addAccessory = () => {
    if (!newAcc.name || !newAcc.cost) return;
    const acc = { id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)), name: newAcc.name, cost: +newAcc.cost };
    setForm(f => ({ ...f, defaultAccessories: [...(f.defaultAccessories||[]), acc] }));
    setNewAcc({ name: '', cost: '' });
  };

  const removeAccessory = (accId) => {
    setForm(f => ({ ...f, defaultAccessories: (f.defaultAccessories||[]).filter(a => a.id !== accId) }));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
        <div>
          <h3 className="font-semibold text-gray-700 text-sm sm:text-base">Category Master</h3>
          <p className="text-xs text-gray-400 mt-0.5">Define categories and their default accessories</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={syncCollectionTags} disabled={syncingTags}
            className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1 border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50">
            {syncingTags ? <><span className="animate-spin">🔄</span> Syncing...</> : <><span>🔄</span> Sync Tags from Shopify</>}
          </button>
          <button onClick={openAdd} className="btn-gold px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1">
            <Icon name="plus" cls="w-3.5 h-3.5" /> Add Category
          </button>
        </div>
      </div>
      {syncMsg && (
        <div className={`px-4 sm:px-6 py-2.5 text-xs border-b ${syncMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {syncMsg}
          <button onClick={() => setSyncMsg('')} className="ml-2 text-gray-400 hover:text-gray-600">✕</button>
        </div>
      )}

      {/* Inline editor */}
      {editing && (
        <div className="px-4 sm:px-6 py-4 bg-amber-50 border-b space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Category Name</label>
              <input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. Kurtas" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Shopify Tag <span className="text-gray-400 font-normal">(used for collections)</span></label>
              <input value={form.shopify_tag||''} onChange={e => setForm(f=>({...f,shopify_tag:e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. Kurta Set" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Group / Section</label>
              <select value={form.group||''} onChange={e => setForm(f=>({...f,group:e.target.value}))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
                <option value="">— None —</option>
                <option>Occasion Wear</option>
                <option>Urban Wear</option>
                <option>Kids</option>
                <option>Accessories</option>
              </select>
            </div>
          </div>

          {/* Accessories list */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-2">Default Accessories</div>
            <div className="space-y-1.5 mb-2">
              {(form.defaultAccessories||[]).map(a => (
                <div key={a.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200">
                  <span className="text-sm text-gray-700">{a.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-600">₹{a.cost}</span>
                    <button onClick={() => removeAccessory(a.id)} className="text-red-400 hover:text-red-600 p-0.5">
                      <Icon name="close" cls="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {(form.defaultAccessories||[]).length === 0 && (
                <div className="text-xs text-gray-400 italic px-1">No accessories yet</div>
              )}
            </div>
            {/* Add new accessory row */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-400 block mb-1">Item name</label>
                <input value={newAcc.name} onChange={e => setNewAcc(a=>({...a,name:e.target.value}))}
                  onKeyDown={e => e.key==='Enter' && addAccessory()}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="e.g. Buttons" />
              </div>
              <div className="w-24">
                <label className="text-xs text-gray-400 block mb-1">Cost (₹)</label>
                <input type="number" value={newAcc.cost} onChange={e => setNewAcc(a=>({...a,cost:e.target.value}))}
                  onKeyDown={e => e.key==='Enter' && addAccessory()}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="20" />
              </div>
              <button onClick={addAccessory} className="btn-gold px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap">+ Add</button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-500">Cancel</button>
            <button onClick={saveCategory} className="btn-gold px-4 py-2 rounded-lg text-xs font-medium">Save Category</button>
          </div>
        </div>
      )}

      {/* Category list — grouped by section */}
      {(() => {
        const groups = ['Occasion Wear','Urban Wear','Kids','Accessories',''];
        return groups.map(grp => {
          const cats = categories.filter(c => (c.group||'') === grp);
          if (!cats.length) return null;
          return (
            <div key={grp||'other'}>
              {grp && (
                <div className="px-4 sm:px-6 py-2 border-b" style={{background:'#f5f4f0'}}>
                  <span style={{fontSize:10,letterSpacing:'0.1em',fontWeight:600,color:'#795900',textTransform:'uppercase',fontFamily:'Inter,sans-serif'}}>{grp}</span>
                </div>
              )}
              <div className="divide-y">
                {cats.map(cat => (
                  <div key={cat.id} className="px-4 sm:px-6 py-3.5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span style={{fontFamily:'Manrope,sans-serif',fontWeight:700,fontSize:'0.875rem',color:'#1b1c1a'}}>{cat.name}</span>
                          {cat.shopify_tag && (
                            <span className="font-mono px-2 py-0.5 rounded text-xs" style={{background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0'}}>
                              #{cat.shopify_tag}
                            </span>
                          )}
                          {!cat.shopify_tag && (
                            <span className="text-xs text-gray-300 italic">no shopify tag</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {(cat.defaultAccessories||[]).length > 0 ? (
                            <>
                              {cat.defaultAccessories.map(a => (
                                <span key={a.id} className="badge bg-amber-50 text-amber-700 text-xs">
                                  {a.name} ₹{a.cost}
                                </span>
                              ))}
                              <span className="badge bg-gray-100 text-gray-500 text-xs">
                                Total ₹{cat.defaultAccessories.reduce((s,a)=>s+a.cost,0)}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400 italic">No default accessories</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 ml-3 flex-shrink-0">
                        <button onClick={() => openEdit(cat)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600">
                          <Icon name="edit" cls="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteCategory(cat.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500">
                          <Icon name="trash" cls="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        });
      })()}
      {categories.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">No categories yet</div>}
    </div>
  );
};

// ─── Vendor Master ────────────────────────────────────────────────────────────

export default CategoryMaster

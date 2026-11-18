import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load, uploadImage } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n } from '../../lib/helpers'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import FabricQRModal from './FabricQRModal'

const SUBTYPES = [
  { value: 'hanger', label: 'Hanger' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'label', label: 'Label' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'other', label: 'Other' },
];

const SUBTYPE_BADGE = {
  hanger: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  packaging: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  label: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  accessory: { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  other: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
};

const MaterialsTab = () => {
  const [materials, setMaterials] = useState([]);
  const [allFabrics, setAllFabrics] = useState([]); // for unified ID sequence
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [subtypeFilter, setSubtypeFilter] = useState('All');
  const [vendorFilter, setVendorFilter] = useState('All');
  const [activeFilter, setActiveFilter] = useState('All');
  const [sortBy, setSortBy] = useState('default');
  const [stock, setStock] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [showQR, setShowQR] = useState(null);
  const [page, setPage] = useState(1);
  const [colourOptions, setColourOptions] = useState([]);
  const [showAddColour, setShowAddColour] = useState(false);
  const [newColourForm, setNewColourForm] = useState({ name: '', hex_code: '#000000', family: '' });
  const [savingColour, setSavingColour] = useState(false);
  const PAGE_SIZE = 20;

  const emptyForm = {
    name: '', material_subtype: 'hanger', colour: '', image_urls: [], video_urls: [],
    description: '', dimensions: '', pack_size: 1,
    vendors: [], default_vendor_id: '', default_cost_per_metre: 0,
    is_active: true, notes: ''
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (opts) => {
    var silent = opts && opts.silent;
    if (!silent) setLoading(true);
    try {
      var [matRes, allFabRes, vendRes, invRes, colRes] = await Promise.all([
        supa.from('fabrics').select('*').eq('category', 'material').order('created_at', { ascending: false }),
        supa.from('fabrics').select('id'),
        supa.from('fabric_vendors').select('*'),
        supa.from('fabric_inventory').select('fabric_id, quantity_metres'),
        supa.from('colour_master').select('id, name, hex_code, family').eq('is_active', true).order('family').order('name')
      ]);
      setMaterials(matRes.data || []);
      setAllFabrics(allFabRes.data || []);
      setVendors(vendRes.data || []);
      setColourOptions(colRes.data || []);
      var stockMap = {};
      (invRes.data || []).forEach(function (inv) {
        stockMap[inv.fabric_id] = (stockMap[inv.fabric_id] || 0) + n(inv.quantity_metres);
      });
      setStock(stockMap);
    } catch (e) { console.error('Materials fetch error:', e); }
    finally { if (!silent) setLoading(false); }
  };

  // Unified ID sequence — reads ALL rows from fabrics table (both fabric & material)
  const nextFAId = async () => {
    try {
      var { data } = await supa.from('fabrics').select('id').order('id', { ascending: false }).limit(200);
      var nums = (data || []).map(function (f) { var m = (f.id || '').match(/-(\d+)$/); return m ? +m[1] : 0; });
      var next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
      return 'FA-' + String(next).padStart(3, '0');
    } catch (e) {
      return 'FA-' + Date.now().toString(36).toUpperCase();
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Material name is required'); return; }
    try {
      var payload = {
        name: form.name.trim(),
        material_subtype: form.material_subtype || 'other',
        colour: form.colour || '',
        image_urls: (form.image_urls || []).filter(Boolean),
        video_urls: (form.video_urls || []).filter(Boolean),
        video_url: (form.video_urls || [])[0] || '',
        description: form.description || '',
        dimensions: form.dimensions || '',
        pack_size: n(form.pack_size) || 1,
        default_cost_per_metre: n(form.default_cost_per_metre),
        default_vendor_id: form.default_vendor_id || '',
        vendors: form.vendors || [],
        is_active: form.is_active,
        notes: form.notes || '',
        // Material-specific fields
        category: 'material',
        unit: 'piece',
        cost_type: 'total',
        // Clear fabric-specific fields
        fabric_family: form.material_subtype || '',
        fabric_type: 'Finished',
        weave: '', composition: '', width_inches: null, weight_gsm: null,
        thread_count: '', stretch: '', wash_care: '',
        updated_at: new Date().toISOString()
      };
      if (editingId) {
        const { error } = await supa.from('fabrics').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const newMat = { id: await nextFAId(), ...payload, created_at: new Date().toISOString() };
        const { error } = await supa.from('fabrics').insert([newMat]);
        if (error) throw error;
      }
      setForm(emptyForm);
      setShowForm(false);
      setEditingId(null);
      await fetchData({ silent: true });
    } catch (e) { console.error('Save material error:', e); alert('Failed to save material.'); }
  };

  const handleDelete = async (id) => {
    var mat = materials.find(function (m) { return m.id === id; });
    var matName = mat ? (mat.name + ' (' + id + ')') : id;
    try {
      var poCheck = await supa.from('fabric_po_line_items').select('id, po_id').eq('fabric_id', id);
      var invCheck = await supa.from('fabric_inventory').select('id').eq('fabric_id', id);
      var poCount = (poCheck.data || []).length;
      var invCount = (invCheck.data || []).length;
      if (poCount > 0 || invCount > 0) {
        var deps = [];
        if (poCount > 0) deps.push(poCount + ' PO line item' + (poCount > 1 ? 's' : ''));
        if (invCount > 0) deps.push(invCount + ' inventory record' + (invCount > 1 ? 's' : ''));
        var msg = 'Cannot simply delete "' + matName + '" because it has linked data:\n\n' +
          deps.join(', ') + '\n\n' +
          'Delete all linked records and remove this material?\n(This action cannot be undone)';
        if (!confirm(msg)) return;
        if (poCount > 0) await supa.from('fabric_po_line_items').delete().eq('fabric_id', id);
        if (invCount > 0) await supa.from('fabric_inventory').delete().eq('fabric_id', id);
      } else {
        if (!confirm('Delete "' + matName + '"? This cannot be undone.')) return;
      }
      var { error } = await supa.from('fabrics').delete().eq('id', id);
      if (error) throw error;
      _logChange && _logChange('delete', 'material', id, mat ? mat.name : '', { had_po_items: poCount, had_inventory: invCount });
      await fetchData({ silent: true });
    } catch (e) { console.error('Delete error:', e); alert('Failed to delete material: ' + (e.message || 'Unknown error')); }
  };

  const handleEdit = (m) => {
    setForm({
      name: m.name || '', material_subtype: m.material_subtype || 'other', colour: m.colour || '',
      image_urls: m.image_urls || [], video_urls: m.video_urls || (m.video_url ? [m.video_url] : []),
      description: m.description || '', dimensions: m.dimensions || '',
      pack_size: m.pack_size || 1,
      vendors: m.vendors || [], default_vendor_id: m.default_vendor_id || '',
      default_cost_per_metre: m.default_cost_per_metre || 0,
      is_active: m.is_active !== false, notes: m.notes || ''
    });
    setEditingId(m.id);
    setShowForm(true);
  };

  var filtered = useMemo(function () {
    var list = materials.filter(function (m) {
      if (subtypeFilter !== 'All' && m.material_subtype !== subtypeFilter) return false;
      if (vendorFilter !== 'All' && m.default_vendor_id !== vendorFilter) return false;
      if (activeFilter === 'Active' && m.is_active === false) return false;
      if (activeFilter === 'Inactive' && m.is_active !== false) return false;
      if (search) {
        var q = search.toLowerCase();
        return (m.name || '').toLowerCase().includes(q) ||
          (m.id || '').toLowerCase().includes(q) ||
          (m.colour || '').toLowerCase().includes(q) ||
          (m.material_subtype || '').toLowerCase().includes(q) ||
          (m.dimensions || '').toLowerCase().includes(q);
      }
      return true;
    });
    if (sortBy === 'cost_desc') list = [...list].sort(function (a, b) { return n(b.default_cost_per_metre) - n(a.default_cost_per_metre); });
    if (sortBy === 'cost_asc') list = [...list].sort(function (a, b) { return n(a.default_cost_per_metre) - n(b.default_cost_per_metre); });
    if (sortBy === 'stock_desc') list = [...list].sort(function (a, b) { return (stock[b.id] || 0) - (stock[a.id] || 0); });
    if (sortBy === 'stock_asc') list = [...list].sort(function (a, b) { return (stock[a.id] || 0) - (stock[b.id] || 0); });
    if (sortBy === 'name_asc') list = [...list].sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return list;
  }, [materials, search, subtypeFilter, vendorFilter, activeFilter, sortBy, stock]);

  var paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  var totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  var activeFiltersCount = [subtypeFilter !== 'All', vendorFilter !== 'All', activeFilter !== 'All', sortBy !== 'default', search !== ''].filter(Boolean).length;

  // colour dot helper
  var colourDotMap = { 'ivory': '#FFFFF0', 'white': '#fff', 'black': '#1a1a1a', 'red': '#dc2626', 'blue': '#2563eb', 'green': '#16a34a', 'yellow': '#eab308', 'pink': '#ec4899', 'orange': '#f97316', 'purple': '#7c3aed', 'gold': '#d4a843', 'silver': '#9ca3af', 'grey': '#6b7280', 'gray': '#6b7280', 'brown': '#92400e', 'beige': '#d2b48c', 'navy': '#1e3a5f', 'maroon': '#800000', 'cream': '#fffdd0', 'natural': '#f5f0e1' };
  var getColourDot = function (colour) {
    if (!colour) return null;
    var key = colour.toLowerCase().trim();
    return colourDotMap[key] || null;
  };

  var getSubtypeBadge = function (subtype) {
    return SUBTYPE_BADGE[subtype] || SUBTYPE_BADGE.other;
  };

  // Completeness calculator
  var completenessFields = [
    { key: 'material_subtype', label: 'Type' },
    { key: 'colour', label: 'Colour' },
    { key: 'default_cost_per_metre', label: 'Cost', check: function (v) { return n(v) > 0; } },
    { key: 'default_vendor_id', label: 'Vendor' },
    { key: 'dimensions', label: 'Dimensions' },
    { key: 'image_urls', label: 'Image', check: function (v) { return Array.isArray(v) && v.filter(Boolean).length > 0; } }
  ];
  var getCompleteness = function (m) {
    var filled = 0;
    var missing = [];
    completenessFields.forEach(function (cf) {
      var val = m[cf.key];
      var ok = cf.check ? cf.check(val) : (val !== null && val !== undefined && val !== '' && val !== 0);
      if (ok) filled++;
      else missing.push(cf.label);
    });
    return { pct: Math.round((filled / completenessFields.length) * 100), filled: filled, total: completenessFields.length, missing: missing };
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <div style={{ width: 40, height: 40, border: '3px solid #f5f4f0', borderTopColor: '#d4a843', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 13, color: '#807664', marginTop: 12, letterSpacing: '0.05em' }}>Loading materials...</div>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* ── HEADER ── */}
      <div className="mb-6">
        <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#795900', marginBottom: 4 }}>SOURCING MANAGEMENT</div>
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-3">
            <h2 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#1b1c1a', letterSpacing: '-0.02em', lineHeight: 1 }}>Materials</h2>
            <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#807664' }}>({filtered.length} ITEMS REGISTERED)</span>
          </div>
          <button onClick={function () { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
            className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #795900, #d4a843)', boxShadow: '0 2px 8px rgba(121,89,0,0.25)' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>+</span> Add Material
          </button>
          <button onClick={function () { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
            className="sm:hidden flex items-center gap-1 px-4 py-2 rounded-full text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>+</span> ADD
          </button>
        </div>
      </div>

      {/* ── SEARCH + SUBTYPE PILLS ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Icon name="search" cls="w-4 h-4 absolute left-3.5 top-3 text-gray-400 pointer-events-none" />
          <input value={search} onChange={function (e) { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, ID or type..."
            className="w-full rounded-xl pl-10 pr-9 py-2.5 text-sm border-none"
            style={{ background: '#fff', boxShadow: '0 2px 8px rgba(27,28,26,0.04)', fontFamily: 'Inter,sans-serif' }} />
          {search && <button onClick={function () { setSearch(''); }} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition-colors">
            <Icon name="x" cls="w-4 h-4" />
          </button>}
        </div>
        <div className="overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-1.5 min-w-max">
            {['All', ...SUBTYPES.map(function (s) { return s.value; })].map(function (st) {
              var isActive = subtypeFilter === st;
              var label = st === 'All' ? 'All' : (SUBTYPES.find(function (s) { return s.value === st; }) || {}).label || st;
              return <button key={st}
                onClick={function () { setSubtypeFilter(st); setPage(1); }}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all"
                style={isActive
                  ? { background: 'linear-gradient(135deg, #795900, #d4a843)', color: '#fff', boxShadow: '0 2px 6px rgba(121,89,0,0.2)' }
                  : { background: '#fff', color: '#4e4636', border: '1px solid #d2c5b1' }}
              >{label}</button>;
            })}
          </div>
        </div>
      </div>

      {/* ── FILTER ROW ── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative">
            <select value={vendorFilter} onChange={function (e) { setVendorFilter(e.target.value); setPage(1); }}
              className="appearance-none rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium border cursor-pointer"
              style={vendorFilter !== 'All' ? { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' } : { background: '#fff', color: '#807664', borderColor: '#d2c5b1' }}>
              <option value="All">VENDOR</option>
              {vendors.map(function (v) { return <option key={v.id} value={v.id}>{v.name}</option>; })}
            </select>
            <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 8, color: '#807664' }}>▼</span>
          </div>
          <div className="relative">
            <select value={activeFilter} onChange={function (e) { setActiveFilter(e.target.value); setPage(1); }}
              className="appearance-none rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium border cursor-pointer"
              style={activeFilter !== 'All' ? { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' } : { background: '#fff', color: '#807664', borderColor: '#d2c5b1' }}>
              <option value="All">STATUS</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 8, color: '#807664' }}>▼</span>
          </div>
          {activeFiltersCount > 0 && (
            <button onClick={function () { setSubtypeFilter('All'); setVendorFilter('All'); setActiveFilter('All'); setSortBy('default'); setSearch(''); setPage(1); }}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ color: '#ba1a1a', background: '#ffdad6', border: '1px solid #ba1a1a20' }}>
              ✕ Clear ({activeFiltersCount})
            </button>
          )}
        </div>
        <div className="relative ml-auto">
          <select value={sortBy} onChange={function (e) { setSortBy(e.target.value); setPage(1); }}
            className="appearance-none rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium border cursor-pointer"
            style={sortBy !== 'default' ? { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' } : { background: '#fff', color: '#807664', borderColor: '#d2c5b1' }}>
            <option value="default">SORT BY: Latest Updated</option>
            <option value="name_asc">SORT BY: Name A→Z</option>
            <option value="cost_desc">SORT BY: Cost High→Low</option>
            <option value="cost_asc">SORT BY: Cost Low→High</option>
            <option value="stock_desc">SORT BY: Stock High→Low</option>
            <option value="stock_asc">SORT BY: Stock Low→High</option>
          </select>
          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 8, color: '#807664' }}>▼</span>
        </div>
      </div>

      {/* ── FORM MODAL ── */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div className="rounded-2xl overflow-hidden w-full" style={{ background: '#fff', border: '1px solid #d2c5b1', boxShadow: '0 20px 48px rgba(27,28,26,0.15)', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}>
              <h3 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>{editingId ? 'Edit Material — ' + editingId : 'Add New Material'}</h3>
              <button onClick={function () { setShowForm(false); setEditingId(null); }} className="w-7 h-7 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors">
                <Icon name="x" cls="w-4 h-4" />
              </button>
            </div>
            <div className="p-5" style={{ overflowY: 'auto', flex: 1 }}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="col-span-2">
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Material Name <span style={{ color: '#ba1a1a' }}>*</span></label>
                  <input type="text" value={form.name} onChange={function (e) { setForm({ ...form, name: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0 transition-colors"
                    style={{ borderColor: '#d2c5b1', fontFamily: 'Inter,sans-serif' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder="e.g. Wooden Hanger 17 inch" />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Material Type <span style={{ color: '#ba1a1a' }}>*</span></label>
                  <select value={form.material_subtype} onChange={function (e) { setForm({ ...form, material_subtype: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0"
                    style={{ borderColor: '#d2c5b1' }}>
                    {SUBTYPES.map(function (s) { return <option key={s.value} value={s.value}>{s.label}</option>; })}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Colour</label>
                  <select value={form.colour} onChange={function (e) {
                    if (e.target.value === '__add_new__') { setShowAddColour(true); setNewColourForm({ name: '', hex_code: '#000000', family: '' }); }
                    else { setForm({ ...form, colour: e.target.value }); }
                  }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0"
                    style={{ borderColor: '#d2c5b1' }}>
                    <option value="">— Select Colour —</option>
                    {colourOptions.map(function (c) { return <option key={c.id} value={c.name}>{c.name}{c.family ? ' (' + c.family + ')' : ''}</option>; })}
                    <option value="__add_new__">＋ Add New Colour…</option>
                  </select>
                  {showAddColour && (
                    <div className="mt-2 p-3 rounded-lg" style={{ background: '#fef9ee', border: '1px solid #d4a843' }}>
                      <div className="text-xs font-bold mb-2" style={{ color: '#795900', letterSpacing: '0.08em', textTransform: 'uppercase' }}>New Colour</div>
                      <div className="flex gap-2 items-end flex-wrap">
                        <div className="flex-1" style={{ minWidth: 100 }}>
                          <input type="text" placeholder="Colour name" value={newColourForm.name} onChange={function (e) { setNewColourForm({ ...newColourForm, name: e.target.value }); }}
                            className="w-full bg-transparent border-0 border-b px-0 py-1 text-xs focus:ring-0" style={{ borderColor: '#d2c5b1' }} />
                        </div>
                        <div style={{ width: 60 }}>
                          <input type="color" value={newColourForm.hex_code} onChange={function (e) { setNewColourForm({ ...newColourForm, hex_code: e.target.value }); }}
                            className="w-full h-7 rounded cursor-pointer" style={{ border: '1px solid #d2c5b1', padding: 1 }} />
                        </div>
                        <button disabled={savingColour || !newColourForm.name.trim()} onClick={async function () {
                          setSavingColour(true);
                          try {
                            await supa.from('colour_master').insert([{ name: newColourForm.name.trim(), hex_code: newColourForm.hex_code, family: newColourForm.family.trim() || null, is_active: true }]).select();
                            var colRes = await supa.from('colour_master').select('id, name, hex_code, family').eq('is_active', true).order('family').order('name');
                            setColourOptions(colRes.data || []);
                            setForm({ ...form, colour: newColourForm.name.trim() });
                            setShowAddColour(false);
                          } catch (err) { alert('Failed to add colour: ' + (err.message || err)); }
                          finally { setSavingColour(false); }
                        }}
                          className="px-3 py-1.5 rounded text-xs font-bold text-white" style={{ background: !newColourForm.name.trim() ? '#d2c5b1' : '#795900' }}>
                          {savingColour ? 'Saving…' : 'Add'}
                        </button>
                        <button onClick={function () { setShowAddColour(false); }} className="px-2 py-1.5 rounded text-xs" style={{ color: '#807664' }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Cost per Piece (₹) <span style={{ color: '#ba1a1a' }}>*</span></label>
                  <input type="number" value={form.default_cost_per_metre} onChange={function (e) { setForm({ ...form, default_cost_per_metre: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0"
                    style={{ borderColor: '#d2c5b1' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder="e.g. 26" />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Default Vendor</label>
                  <select value={form.default_vendor_id} onChange={function (e) { setForm({ ...form, default_vendor_id: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0"
                    style={{ borderColor: '#d2c5b1' }}>
                    <option value="">— No vendor —</option>
                    {vendors.map(function (v) { return <option key={v.id} value={v.id}>{v.id} — {v.name}</option>; })}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Dimensions</label>
                  <input type="text" value={form.dimensions} onChange={function (e) { setForm({ ...form, dimensions: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0" style={{ borderColor: '#d2c5b1' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder="e.g. 17 inch, 12x8 cm" />
                </div>
                {(form.material_subtype === 'packaging') && (
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Pack Size</label>
                    <input type="number" value={form.pack_size} onChange={function (e) { setForm({ ...form, pack_size: e.target.value }); }}
                      className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0" style={{ borderColor: '#d2c5b1' }}
                      onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                      placeholder="e.g. 10" />
                  </div>
                )}
                <div className="col-span-2">
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 6 }}>Vendor Material IDs</label>
                  <div className="space-y-2">
                    {(form.vendors || []).map(function (v, vi) {
                      return (<div key={vi} className="flex gap-2 items-center">
                        <select value={v.vendor_id || ''} onChange={function (e) { var vlist = [...(form.vendors || [])]; vlist[vi] = { ...vlist[vi], vendor_id: e.target.value }; setForm({ ...form, vendors: vlist }); }}
                          className="flex-1 bg-transparent border-0 border-b px-0 py-1.5 text-sm focus:ring-0" style={{ borderColor: '#d2c5b1' }}>
                          <option value="">Select Vendor</option>
                          {vendors.map(function (av) { return <option key={av.id} value={av.id}>{av.name}</option>; })}
                        </select>
                        <input type="text" value={v.vendor_fabric_id || ''} placeholder="Vendor Material ID"
                          onChange={function (e) { var vlist = [...(form.vendors || [])]; vlist[vi] = { ...vlist[vi], vendor_fabric_id: e.target.value }; setForm({ ...form, vendors: vlist }); }}
                          className="w-40 bg-transparent border-0 border-b px-0 py-1.5 text-sm font-mono focus:ring-0" style={{ borderColor: '#d2c5b1' }} />
                        <button onClick={function () { var vlist = (form.vendors || []).filter(function (_, i) { return i !== vi; }); setForm({ ...form, vendors: vlist }); }}
                          className="p-1 rounded-full hover:bg-red-50 text-red-400 transition-colors"><Icon name="trash" cls="w-3.5 h-3.5" /></button>
                      </div>);
                    })}
                    <button onClick={function () { setForm({ ...form, vendors: [...(form.vendors || []), { vendor_id: '', vendor_fabric_id: '', cost_per_metre: 0 }] }); }}
                      className="text-xs font-bold flex items-center gap-1 mt-1" style={{ color: '#795900', letterSpacing: '0.05em' }}><span style={{ fontSize: 14 }}>+</span> Add Vendor</button>
                  </div>
                </div>
                <div className="col-span-2">
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 6 }}>Images</label>
                  <div className="flex flex-wrap gap-2.5 mb-2">
                    {(form.image_urls || []).map(function (url, idx) {
                      return url ? <div key={idx} className="relative group">
                        <img src={url} className="w-20 h-20 rounded-xl object-cover" style={{ border: idx === 0 ? '2px solid #d4a843' : '2px solid #e9e8e4' }} alt="" />
                        {idx === 0 && <div className="absolute top-0 left-0 text-white text-[7px] px-1.5 py-0.5 rounded-br-lg rounded-tl-xl font-bold" style={{ background: 'linear-gradient(135deg, #795900, #d4a843)', letterSpacing: '0.05em' }}>HERO</div>}
                        <button onClick={function () { var urls = (form.image_urls || []).filter(function (_, i) { return i !== idx; }); setForm({ ...form, image_urls: urls }); }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">✕</button>
                      </div> : null;
                    })}
                    <label className="w-20 h-20 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all hover:border-amber-400" style={{ border: '2px dashed #d2c5b1', background: '#faf9f5' }}>
                      <span style={{ fontSize: 20, color: '#807664', lineHeight: 1 }}>+</span>
                      <span style={{ fontSize: 9, color: '#807664', marginTop: 2, fontWeight: 600, letterSpacing: '0.05em' }}>ADD</span>
                      <input type="file" accept="image/*" className="hidden" onChange={async function (e) { var file = e.target.files[0]; if (!file) return; try { var url = await uploadImage(file, 'material-images'); setForm(function (prev) { return { ...prev, image_urls: [...(prev.image_urls || []), url] }; }); } catch (err) { alert('Upload failed'); } }} />
                    </label>
                  </div>
                </div>
                <div className="col-span-2">
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Description / Notes</label>
                  <textarea value={form.description} onChange={function (e) { setForm({ ...form, description: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0 min-h-16 resize-none" style={{ borderColor: '#d2c5b1' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder="Notes about this material" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-3 flex-shrink-0" style={{ borderTop: '1px solid #e9e8e4', background: '#fff' }}>
              <button onClick={function () { setShowForm(false); setEditingId(null); }}
                className="px-5 py-2.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ color: '#807664', border: '1px solid #d2c5b1', background: '#fff' }}>Cancel</button>
              <button onClick={handleSave}
                className="px-6 py-2.5 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #795900, #d4a843)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {editingId ? 'Update Material' : 'Add Material'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE CARD LIST ── */}
      <div className="sm:hidden space-y-3">
        {paged.map(function (m) {
          var s = stock[m.id] || 0;
          var vendorObj = vendors.find(function (v) { return v.id === m.default_vendor_id; });
          var sb = getSubtypeBadge(m.material_subtype);
          var dotColor = getColourDot(m.colour);
          var comp = getCompleteness(m);
          var compColor = comp.pct === 100 ? '#16a34a' : comp.pct >= 70 ? '#d97706' : '#dc2626';
          return (
            <div key={m.id} className="rounded-xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 4px 16px rgba(27,28,26,0.06)', border: '1px solid rgba(210,197,177,0.15)' }}>
              <div className="flex gap-3 p-3.5">
                <div className="flex-shrink-0">
                  {m.image_urls && m.image_urls[0]
                    ? <img src={m.image_urls[0]} className="w-24 h-28 rounded-xl object-cover" style={{ border: '2px solid #e9e8e4' }} onError={function (e) { e.target.style.display = 'none' }} alt="" />
                    : <div className="w-24 h-28 rounded-xl flex items-center justify-center" style={{ background: '#f5f4f0', border: '2px solid #e9e8e4', fontSize: 28 }}>📦</div>}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                  <div>
                    <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#795900', marginBottom: 2 }}>ID: {m.id}</div>
                    <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.95rem', fontWeight: 800, color: '#1b1c1a', lineHeight: 1.2, marginBottom: 6 }} className="truncate">{m.name}</div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: sb.bg, color: sb.text, border: '1px solid ' + sb.border }}>{(m.material_subtype || 'other').toUpperCase()}</span>
                    {m.colour && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: '#f5f4f0', color: '#4e4636', border: '1px solid #e9e8e4' }}>
                      {dotColor && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block', border: '1px solid rgba(0,0,0,0.1)' }}></span>}
                      {m.colour.toUpperCase()}
                    </span>}
                    {m.dimensions && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: '#e1e0ff', color: '#2f2ebe', border: '1px solid #c0c1ff' }}>{m.dimensions}</span>}
                  </div>
                </div>
              </div>
              {comp.pct < 100 && (
                <div className="px-3.5 pb-2">
                  <div className="flex items-center gap-2">
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: '#e9e8e4', overflow: 'hidden' }}>
                      <div style={{ width: comp.pct + '%', height: '100%', borderRadius: 2, background: compColor, transition: 'width 0.3s' }}></div>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, color: compColor, minWidth: 28, textAlign: 'right' }}>{comp.pct}%</span>
                  </div>
                  <div style={{ fontSize: 8, color: '#9c9b97', marginTop: 2 }}>Missing: {comp.missing.join(', ')}</div>
                </div>
              )}
              <div className="grid grid-cols-3 text-center" style={{ background: '#f5f4f0', borderTop: '1px solid #e9e8e4', padding: '10px 8px' }}>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9c9b97' }}>COST/PC</div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 800, color: '#795900', marginTop: 2 }}>{n(m.default_cost_per_metre) > 0 ? fmt(n(m.default_cost_per_metre)) : '—'}</div>
                </div>
                <div style={{ borderLeft: '1px solid #e9e8e4', borderRight: '1px solid #e9e8e4' }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9c9b97' }}>IN STOCK</div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 800, marginTop: 2, color: s > 20 ? '#16a34a' : s > 5 ? '#d97706' : '#dc2626' }}>{s > 0 ? Math.round(s) + ' pcs' : '0 pcs'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9c9b97' }}>VENDOR</div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, color: '#1b1c1a', marginTop: 2 }} className="truncate px-1">{vendorObj ? vendorObj.name : '—'}</div>
                </div>
              </div>
              <div className="flex gap-2 p-3" style={{ background: '#fff' }}>
                <button onClick={function () { handleEdit(m); }}
                  className="flex-1 py-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                  style={{ background: '#f5f4f0', color: '#1b1c1a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  <Icon name="edit" cls="w-3.5 h-3.5" /> EDIT
                </button>
                <button onClick={function () { setShowQR(m); }}
                  className="flex-1 py-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                  style={{ background: '#dbeafe', color: '#1e40af', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  <span style={{ fontSize: 12 }}>📱</span> QR LABEL
                </button>
                <button onClick={function () { handleDelete(m.id); }}
                  className="py-2.5 px-3 rounded-lg text-[11px] font-bold flex items-center justify-center transition-colors"
                  style={{ background: '#ffdad6', color: '#ba1a1a' }}>
                  <Icon name="trash" cls="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {paged.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center">
            <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
            <div style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, color: '#807664', fontSize: 14 }}>No materials found</div>
            <div style={{ fontSize: 12, color: '#9c9b97', marginTop: 4 }}>Try adjusting your filters or add a new material</div>
          </div>
        )}
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="hidden sm:block">
        <div className="table-scroll-wrap rounded-xl" style={{ background: '#fff', boxShadow: '0 4px 20px rgba(27,28,26,0.04)', border: '1px solid rgba(210,197,177,0.12)' }}>
          <table className="w-full text-sm" style={{ minWidth: 700, tableLayout: 'auto' }}>
            <thead>
              <tr style={{ background: '#f5f4f0', borderBottom: '2px solid #e9e8e4' }}>
                <th className="pl-5 pr-2 py-3.5 text-left" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 60 }}>IMAGE</th>
                <th className="px-3 py-3.5 text-left" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 110 }}>ID</th>
                <th className="px-3 py-3.5 text-left" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>MATERIAL NAME</th>
                <th className="px-3 py-3.5 text-left" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 100 }}>TYPE</th>
                <th className="px-3 py-3.5 text-left" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 100 }}>COLOUR</th>
                <th className="px-3 py-3.5 text-right" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 90 }}>COST/PC</th>
                <th className="px-3 py-3.5 text-right" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 80 }}>STOCK</th>
                <th className="px-3 py-3.5 text-left" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 130 }}>VENDOR</th>
                <th className="px-3 pr-5 py-3.5 text-center" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 110, position: 'sticky', right: 0, background: '#f5f4f0', zIndex: 2 }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(function (m, ri) {
                var s = stock[m.id] || 0;
                var vendorObj = vendors.find(function (v) { return v.id === m.default_vendor_id; });
                var sb = getSubtypeBadge(m.material_subtype);
                var dotColor = getColourDot(m.colour);
                var comp = getCompleteness(m);
                var compColor = comp.pct === 100 ? '#16a34a' : comp.pct >= 70 ? '#d97706' : '#dc2626';
                var circumference = 2 * Math.PI * 14;
                var dashOffset = circumference - (comp.pct / 100) * circumference;
                return (
                  <tr key={m.id} className="group cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid #f0efeb', background: ri % 2 === 0 ? '#fff' : '#faf9f7' }}
                    onMouseEnter={function (e) { e.currentTarget.style.background = '#faf9f5' }}
                    onMouseLeave={function (e) { e.currentTarget.style.background = ri % 2 === 0 ? '#fff' : '#faf9f7' }}>
                    <td className="pl-5 pr-2 py-3">
                      <div className="relative" style={{ width: 40, height: 40 }}>
                        {m.image_urls && m.image_urls[0]
                          ? <img src={m.image_urls[0]} className="w-10 h-10 rounded-lg object-cover" style={{ border: '1.5px solid #e9e8e4' }} alt="" />
                          : <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: '#f5f4f0', border: '1.5px solid #e9e8e4', fontSize: 16 }}>📦</div>}
                        {comp.pct < 100 && <div style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
                          <svg width="18" height="18" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="none" stroke="#e9e8e4" strokeWidth="3" /><circle cx="18" cy="18" r="14" fill="none" stroke={compColor} strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} /></svg>
                        </div>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: '#795900' }}>{m.id}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, fontSize: '0.85rem', color: '#1b1c1a' }} className="truncate">{m.name}</div>
                      <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: '#9c9b97', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          {[m.dimensions, m.pack_size > 1 ? 'Pack of ' + m.pack_size : null].filter(Boolean).join(' · ') || ''}
                        </span>
                        {comp.pct < 100 && <span title={'Missing: ' + comp.missing.join(', ')} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '1px 5px', borderRadius: 4, background: comp.pct >= 70 ? '#fef3c7' : '#fef2f2', color: comp.pct >= 70 ? '#92400e' : '#dc2626', cursor: 'help' }}>{comp.pct}%</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: sb.bg, color: sb.text, border: '1px solid ' + sb.border, letterSpacing: '0.03em' }}>{(m.material_subtype || 'OTHER').toUpperCase()}</span>
                    </td>
                    <td className="px-3 py-3">
                      {m.colour
                        ? <div className="flex items-center gap-1.5">
                          {dotColor && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }}></span>}
                          <span style={{ fontSize: 13, color: '#4e4636' }}>{m.colour}</span>
                        </div>
                        : <span style={{ color: '#d2c5b1' }}>—</span>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: '0.85rem', color: '#795900' }}>
                        {n(m.default_cost_per_metre) > 0 ? fmt(n(m.default_cost_per_metre)) + '/pc' : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: '0.85rem', color: s > 20 ? '#16a34a' : s > 5 ? '#d97706' : '#dc2626' }}>
                        {s > 0 ? Math.round(s) + ' pcs' : '0 pcs'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span style={{ fontSize: 13, color: '#4e4636' }}>{vendorObj ? vendorObj.name : '—'}</span>
                    </td>
                    <td className="px-2 pr-4 py-3 text-center" style={{ position: 'sticky', right: 0, background: ri % 2 === 0 ? '#fff' : '#faf9f7', zIndex: 1 }} onClick={function (e) { e.stopPropagation(); }}>
                      <div className="flex gap-1 justify-center">
                        <button onClick={function (e) { e.stopPropagation(); handleEdit(m); }} className="p-1.5 rounded-lg transition-colors hover:bg-gray-100" style={{ color: '#807664' }} title="Edit">
                          <Icon name="edit" cls="w-4 h-4" />
                        </button>
                        <button onClick={function (e) { e.stopPropagation(); setShowQR(m); }} className="p-1.5 rounded-lg transition-colors hover:bg-blue-50" style={{ color: '#1e40af' }} title="QR Label">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="3" height="3" /><rect x="20" y="14" width="1" height="3" /><rect x="14" y="20" width="3" height="1" /><rect x="20" y="20" width="1" height="1" /></svg>
                        </button>
                        <button onClick={function (e) { e.stopPropagation(); handleDelete(m.id); }} className="p-1.5 rounded-lg transition-colors hover:bg-red-50" style={{ color: '#ba1a1a' }} title="Delete">
                          <Icon name="trash" cls="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {paged.length === 0 && (
            <div className="text-center py-20 flex flex-col items-center">
              <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
              <div style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, color: '#807664', fontSize: 14 }}>No materials found</div>
              <div style={{ fontSize: 12, color: '#9c9b97', marginTop: 4 }}>Try adjusting your filters or add a new material</div>
            </div>
          )}
        </div>
      </div>

      {/* ── PAGINATION ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between py-4 mt-2">
          <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#807664' }}>
            SHOWING {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} OF {filtered.length} ITEMS
          </div>
          <div className="flex items-center gap-1">
            <button disabled={page === 1} onClick={function () { setPage(function (p) { return p - 1; }); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30"
              style={{ border: '1px solid #d2c5b1', color: '#807664', background: '#fff' }}>
              <span style={{ fontSize: 12 }}>←</span>
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, function (_, i) {
              var pageNum;
              if (totalPages <= 5) { pageNum = i + 1; }
              else if (page <= 3) { pageNum = i + 1; }
              else if (page >= totalPages - 2) { pageNum = totalPages - 4 + i; }
              else { pageNum = page - 2 + i; }
              return <button key={pageNum} onClick={function () { setPage(pageNum); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all"
                style={pageNum === page
                  ? { background: 'linear-gradient(135deg, #795900, #d4a843)', color: '#fff', boxShadow: '0 2px 6px rgba(121,89,0,0.2)' }
                  : { background: '#fff', color: '#807664', border: '1px solid #d2c5b1' }}
              >{pageNum}</button>;
            })}
            <button disabled={page >= totalPages} onClick={function () { setPage(function (p) { return p + 1; }); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30"
              style={{ border: '1px solid #d2c5b1', color: '#807664', background: '#fff' }}>
              <span style={{ fontSize: 12 }}>→</span>
            </button>
          </div>
        </div>
      )}

      {showQR && <FabricQRModal fabric={showQR} onClose={function () { setShowQR(null); }} />}
    </div>
  );
};

export default MaterialsTab

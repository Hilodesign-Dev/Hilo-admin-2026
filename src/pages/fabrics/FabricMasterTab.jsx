import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load, uploadImage } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n } from '../../lib/helpers'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import FabricQRModal from './FabricQRModal'

const FabricMasterTab = ({ onFabricsLoaded }) => {
  const [fabrics, setFabrics] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [families, setFamilies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('All');
  const [colourFilter, setColourFilter] = useState('All');
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
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');
  const PAGE_SIZE = 20;

  const [form, setForm] = useState({
    name: '', fabric_family: '', colour: '', fabric_type: 'Dyeable', image_urls: [], video_url: '', video_urls: [],
    weave: '', composition: '', width_inches: '', weight_gsm: '',
    thread_count: '', stretch: '', wash_care: '', description: '',
    vendors: [], default_vendor_id: '', default_cost_per_metre: 0, cost_type: 'per_metre',
    is_active: true, notes: ''
  });

  const emptyForm = { name: '', fabric_family: '', colour: '', fabric_type: 'Dyeable', image_urls: [], video_url: '', video_urls: [], weave: '', composition: '', width_inches: '', weight_gsm: '', thread_count: '', stretch: '', wash_care: '', description: '', vendors: [], default_vendor_id: '', default_cost_per_metre: 0, cost_type: 'per_metre', is_active: true, notes: '' };

  useEffect(() => { fetchData(); }, []);

  const fetchData = async (opts) => {
    var silent = opts && opts.silent;
    if (!silent) setLoading(true);
    try {
      var [fabRes, vendRes, invRes, colRes] = await Promise.all([
        supa.from('fabrics').select('*').eq('category', 'fabric').order('created_at', { ascending: false }),
        supa.from('fabric_vendors').select('*'),
        supa.from('fabric_inventory').select('fabric_id, quantity_metres'),
        supa.from('colour_master').select('id, name, hex_code, family').eq('is_active', true).order('family').order('name')
      ]);
      var fabricData = fabRes.data || [];
      var vendorData = vendRes.data || [];
      setFabrics(fabricData);
      setVendors(vendorData);
      setColourOptions(colRes.data || []);
      if (onFabricsLoaded) onFabricsLoaded(fabricData);
      // Stock
      var stockMap = {};
      (invRes.data || []).forEach(function (inv) {
        stockMap[inv.fabric_id] = (stockMap[inv.fabric_id] || 0) + n(inv.quantity_metres);
      });
      setStock(stockMap);
      // Families
      var fams = [...new Set(fabricData.map(function (f) { return f.fabric_family; }).filter(Boolean))];
      setFamilies(fams);
    } catch (e) { console.error('Fetch error:', e); }
    finally { if (!silent) setLoading(false); }
  };

  const nextFAId = async () => {
    // Query DB for the actual max to avoid stale-state collisions
    try {
      var { data } = await supa.from('fabrics').select('id').order('id', { ascending: false }).limit(200);
      var nums = (data || []).map(function (f) { var m = (f.id || '').match(/-(\d+)$/); return m ? +m[1] : 0; });
      var next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
      return 'FA-' + String(next).padStart(3, '0');
    } catch (e) {
      // Fallback: timestamp-based to guarantee uniqueness
      return 'FA-' + Date.now().toString(36).toUpperCase();
    }
  };

  const handleSelectFamily = (familyName) => {
    if (!families.includes(familyName)) return;
    var templateFabric = fabrics.find(function (f) { return f.fabric_family === familyName; });
    if (templateFabric) {
      setForm(function (f) {
        return {
          ...f, fabric_family: familyName,
          weave: f.weave || templateFabric.weave || '',
          composition: f.composition || templateFabric.composition || '',
          width_inches: f.width_inches || templateFabric.width_inches || '',
          weight_gsm: f.weight_gsm || templateFabric.weight_gsm || '',
          thread_count: f.thread_count || templateFabric.thread_count || '',
          stretch: f.stretch || templateFabric.stretch || '',
          wash_care: f.wash_care || templateFabric.wash_care || '',
        };
      });
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Fabric name is required'); return; }
    try {
      var payload = {
        ...form,
        image_urls: (form.image_urls || []).filter(Boolean),
        video_urls: (form.video_urls || []).filter(Boolean),
        video_url: (form.video_urls || [])[0] || form.video_url || '',
        default_cost_per_metre: n(form.default_cost_per_metre),
        width_inches: form.width_inches ? n(form.width_inches) : null,
        weight_gsm: form.weight_gsm ? n(form.weight_gsm) : null,
        updated_at: new Date().toISOString()
      };
      if (editingId) {
        const { error } = await supa.from('fabrics').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const newFabric = { id: await nextFAId(), ...payload, category: 'fabric', unit: 'metre', created_at: new Date().toISOString() };
        const { error } = await supa.from('fabrics').insert([newFabric]);
        if (error) throw error;
      }
      setForm(emptyForm);
      setShowForm(false);
      setEditingId(null);
      await fetchData({ silent: true });
    } catch (e) { console.error('Save error:', e); alert('Failed to save fabric: ' + (e.message || e.details || JSON.stringify(e))); }
  };

  const handleDelete = async (id) => {
    var fab = fabrics.find(function (f) { return f.id === id; });
    var fabName = fab ? (fab.name + ' (' + id + ')') : id;

    // Check for linked PO line items and inventory
    try {
      var poCheck = await supa.from('fabric_po_line_items').select('id, po_id').eq('fabric_id', id);
      var invCheck = await supa.from('fabric_inventory').select('id').eq('fabric_id', id);
      var poCount = (poCheck.data || []).length;
      var invCount = (invCheck.data || []).length;

      if (poCount > 0 || invCount > 0) {
        var deps = [];
        if (poCount > 0) deps.push(poCount + ' PO line item' + (poCount > 1 ? 's' : ''));
        if (invCount > 0) deps.push(invCount + ' inventory record' + (invCount > 1 ? 's' : ''));
        var msg = 'Cannot simply delete "' + fabName + '" because it has linked data:\n\n' +
          '• ' + deps.join('\n• ') + '\n\n' +
          'Delete all linked records and remove this fabric?\n' +
          '(This action cannot be undone)';
        if (!confirm(msg)) return;

        // Cascade: delete PO line items, then inventory, then fabric
        if (poCount > 0) {
          var { error: poDelErr } = await supa.from('fabric_po_line_items').delete().eq('fabric_id', id);
          if (poDelErr) throw new Error('Failed to delete PO line items: ' + poDelErr.message);
        }
        if (invCount > 0) {
          var { error: invDelErr } = await supa.from('fabric_inventory').delete().eq('fabric_id', id);
          if (invDelErr) throw new Error('Failed to delete inventory records: ' + invDelErr.message);
        }
      } else {
        if (!confirm('Delete "' + fabName + '"? This cannot be undone.')) return;
      }

      var { error } = await supa.from('fabrics').delete().eq('id', id);
      if (error) throw error;
      _logChange && _logChange('delete', 'fabric', id, fab ? fab.name : '', { had_po_items: poCount, had_inventory: invCount });
      await fetchData({ silent: true });
    } catch (e) {
      console.error('Delete error:', e);
      alert('Failed to delete fabric: ' + (e.message || 'Unknown error'));
    }
  };

  const handleEdit = (f) => {
    setForm({
      name: f.name || '', fabric_family: f.fabric_family || '', colour: f.colour || '',
      fabric_type: f.fabric_type || 'Dyeable',
      image_urls: f.image_urls || [], video_url: f.video_url || '', video_urls: f.video_urls || (f.video_url ? [f.video_url] : []),
      weave: f.weave || '', composition: f.composition || '',
      width_inches: f.width_inches || '', weight_gsm: f.weight_gsm || '',
      thread_count: f.thread_count || '', stretch: f.stretch || '',
      wash_care: f.wash_care || '', description: f.description || '',
      vendors: f.vendors || [], default_vendor_id: f.default_vendor_id || '',
      default_cost_per_metre: f.default_cost_per_metre || 0, cost_type: f.cost_type || 'per_metre',
      is_active: f.is_active !== false, notes: f.notes || ''
    });
    setEditingId(f.id);
    setShowForm(true);
  };

  var allColours = useMemo(function () {
    return ['All', ...new Set(fabrics.map(function (f) { return f.colour; }).filter(Boolean))];
  }, [fabrics]);

  var filtered = useMemo(function () {
    var list = fabrics.filter(function (f) {
      if (familyFilter !== 'All' && f.fabric_family !== familyFilter) return false;
      if (colourFilter !== 'All' && f.colour !== colourFilter) return false;
      if (vendorFilter !== 'All' && f.default_vendor_id !== vendorFilter) return false;
      if (activeFilter === 'Active' && f.is_active === false) return false;
      if (activeFilter === 'Inactive' && f.is_active !== false) return false;
      if (search) {
        var q = search.toLowerCase();
        return (f.name || '').toLowerCase().includes(q) ||
          (f.id || '').toLowerCase().includes(q) ||
          (f.colour || '').toLowerCase().includes(q) ||
          (f.composition || '').toLowerCase().includes(q) ||
          (f.fabric_family || '').toLowerCase().includes(q);
      }
      return true;
    });
    if (sortBy === 'cost_desc') list = [...list].sort(function (a, b) { return n(b.default_cost_per_metre) - n(a.default_cost_per_metre); });
    if (sortBy === 'cost_asc') list = [...list].sort(function (a, b) { return n(a.default_cost_per_metre) - n(b.default_cost_per_metre); });
    if (sortBy === 'stock_desc') list = [...list].sort(function (a, b) { return (stock[b.id] || 0) - (stock[a.id] || 0); });
    if (sortBy === 'stock_asc') list = [...list].sort(function (a, b) { return (stock[a.id] || 0) - (stock[b.id] || 0); });
    if (sortBy === 'name_asc') list = [...list].sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    return list;
  }, [fabrics, search, familyFilter, colourFilter, vendorFilter, activeFilter, sortBy, stock]);

  var paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  var totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  var activeFiltersCount = [familyFilter !== 'All', colourFilter !== 'All', vendorFilter !== 'All', activeFilter !== 'All', sortBy !== 'default', search !== ''].filter(Boolean).length;

  // colour dot helper
  var colourDotMap = { 'ivory': '#FFFFF0', 'white': '#fff', 'black': '#1a1a1a', 'red': '#dc2626', 'blue': '#2563eb', 'green': '#16a34a', 'yellow': '#eab308', 'pink': '#ec4899', 'orange': '#f97316', 'purple': '#7c3aed', 'gold': '#d4a843', 'silver': '#9ca3af', 'grey': '#6b7280', 'gray': '#6b7280', 'brown': '#92400e', 'beige': '#d2b48c', 'navy': '#1e3a5f', 'maroon': '#800000', 'indigo': '#4338ca', 'teal': '#0d9488', 'cream': '#fffdd0', 'natural': '#f5f0e1', 'off-white': '#faf5ef', 'rust': '#b7410e', 'mustard': '#e1ad01', 'sage': '#9caf88', 'lavender': '#e6e6fa', 'coral': '#ff7f50', 'peach': '#ffcba4', 'mint': '#98ff98', 'turquoise': '#40e0d0', 'wine': '#722f37', 'charcoal': '#36454f', 'camel': '#c19a6b' };
  var getColourDot = function (colour) {
    if (!colour) return null;
    var key = colour.toLowerCase().trim();
    return colourDotMap[key] || '#' + key.replace('#', '').substring(0, 6) || null;
  };

  // family badge colours
  var familyBadgeColors = { 'Silk': { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' }, 'Cotton': { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' }, 'Linen': { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' }, 'Chanderi': { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' }, 'Organza': { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' }, 'Khadi': { bg: '#fef9c3', text: '#854d0e', border: '#fde047' }, 'Wool': { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' }, 'Velvet': { bg: '#fae8ff', text: '#86198f', border: '#e879f9' }, 'Chiffon': { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc' }, 'Georgette': { bg: '#f0fdf4', text: '#166534', border: '#86efac' } };
  var getFamilyBadge = function (family) {
    if (!family) return { bg: '#f5f4f0', text: '#807664', border: '#d2c5b1' };
    return familyBadgeColors[family] || { bg: '#f5f4f0', text: '#807664', border: '#d2c5b1' };
  };

  // Completeness calculator
  var completenessFields = [
    { key: 'fabric_family', label: 'Family' },
    { key: 'colour', label: 'Colour' },
    { key: 'fabric_type', label: 'Type' },
    { key: 'default_cost_per_metre', label: 'Cost', check: function (v) { return n(v) > 0; } },
    { key: 'default_vendor_id', label: 'Vendor' },
    { key: 'composition', label: 'Composition' },
    { key: 'width_inches', label: 'Width' },
    { key: 'weight_gsm', label: 'Weight' },
    { key: 'wash_care', label: 'Wash Care' },
    { key: 'image_urls', label: 'Image', check: function (v) { return Array.isArray(v) && v.filter(Boolean).length > 0; } }
  ];
  var getCompleteness = function (f) {
    var filled = 0;
    var missing = [];
    completenessFields.forEach(function (cf) {
      var val = f[cf.key];
      var ok = cf.check ? cf.check(val) : (val !== null && val !== undefined && val !== '' && val !== 0);
      if (ok) filled++;
      else missing.push(cf.label);
    });
    return { pct: Math.round((filled / completenessFields.length) * 100), filled: filled, total: completenessFields.length, missing: missing };
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <div style={{ width: 40, height: 40, border: '3px solid #f5f4f0', borderTopColor: '#d4a843', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 13, color: '#807664', marginTop: 12, letterSpacing: '0.05em' }}>Loading fabrics...</div>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* ── HEADER ── */}
      <div className="mb-6">
        <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#795900', marginBottom: 4 }}>INVENTORY MANAGEMENT</div>
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-3">
            <h2 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.75rem', fontWeight: 800, color: '#1b1c1a', letterSpacing: '-0.02em', lineHeight: 1 }}>Fabric Master</h2>
            <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#807664' }}>({filtered.length} FABRICS REGISTERED)</span>
          </div>
          <button onClick={function () { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
            className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #795900, #d4a843)', boxShadow: '0 2px 8px rgba(121,89,0,0.25)' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>+</span> Add Fabric
          </button>
          <button onClick={function () { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
            className="sm:hidden flex items-center gap-1 px-4 py-2 rounded-full text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>+</span> ADD
          </button>
        </div>
      </div>

      {/* ── SEARCH + FAMILY PILLS (Desktop: inline row) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Icon name="search" cls="w-4 h-4 absolute left-3.5 top-3 text-gray-400 pointer-events-none" />
          <input value={search} onChange={function (e) { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, ID or composition..."
            className="w-full rounded-xl pl-10 pr-9 py-2.5 text-sm border-none"
            style={{ background: '#fff', boxShadow: '0 2px 8px rgba(27,28,26,0.04)', fontFamily: 'Inter,sans-serif' }} />
          {search && <button onClick={function () { setSearch(''); }} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition-colors">
            <Icon name="x" cls="w-4 h-4" />
          </button>}
        </div>
        <div className="overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
          <div className="flex gap-1.5 min-w-max">
            {['All', ...families].map(function (fam) {
              var isActive = familyFilter === fam;
              return <button key={fam}
                onClick={function () { setFamilyFilter(fam); setPage(1); }}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all"
                style={isActive
                  ? { background: 'linear-gradient(135deg, #795900, #d4a843)', color: '#fff', boxShadow: '0 2px 6px rgba(121,89,0,0.2)' }
                  : { background: '#fff', color: '#4e4636', border: '1px solid #d2c5b1' }}
              >{fam === 'All' ? 'All' : fam}</button>;
            })}
          </div>
        </div>
      </div>

      {/* ── FILTER ROW ── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative">
            <select value={colourFilter} onChange={function (e) { setColourFilter(e.target.value); setPage(1); }}
              className="appearance-none rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium border cursor-pointer"
              style={colourFilter !== 'All'
                ? { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }
                : { background: '#fff', color: '#807664', borderColor: '#d2c5b1' }}>
              <option value="All">COLOUR</option>
              {allColours.filter(function (c) { return c !== 'All'; }).map(function (c) { return <option key={c} value={c}>{c}</option>; })}
            </select>
            <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 8, color: '#807664' }}>▼</span>
          </div>
          <div className="relative">
            <select value={vendorFilter} onChange={function (e) { setVendorFilter(e.target.value); setPage(1); }}
              className="appearance-none rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium border cursor-pointer"
              style={vendorFilter !== 'All'
                ? { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }
                : { background: '#fff', color: '#807664', borderColor: '#d2c5b1' }}>
              <option value="All">VENDOR</option>
              {vendors.map(function (v) { return <option key={v.id} value={v.id}>{v.name}</option>; })}
            </select>
            <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 8, color: '#807664' }}>▼</span>
          </div>
          <div className="relative">
            <select value={activeFilter} onChange={function (e) { setActiveFilter(e.target.value); setPage(1); }}
              className="appearance-none rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium border cursor-pointer"
              style={activeFilter !== 'All'
                ? { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }
                : { background: '#fff', color: '#807664', borderColor: '#d2c5b1' }}>
              <option value="All">STATUS</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 8, color: '#807664' }}>▼</span>
          </div>
          {activeFiltersCount > 0 && (
            <button onClick={function () { setFamilyFilter('All'); setColourFilter('All'); setVendorFilter('All'); setActiveFilter('All'); setSortBy('default'); setSearch(''); setPage(1); }}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ color: '#ba1a1a', background: '#ffdad6', border: '1px solid #ba1a1a20' }}>
              ✕ Clear ({activeFiltersCount})
            </button>
          )}
        </div>
        <div className="relative ml-auto">
          <select value={sortBy} onChange={function (e) { setSortBy(e.target.value); setPage(1); }}
            className="appearance-none rounded-lg pl-3 pr-7 py-1.5 text-xs font-medium border cursor-pointer"
            style={sortBy !== 'default'
              ? { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }
              : { background: '#fff', color: '#807664', borderColor: '#d2c5b1' }}>
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

      {/* ── FORM (Modal overlay) ── */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div className="rounded-2xl overflow-hidden w-full" style={{ background: '#fff', border: '1px solid #d2c5b1', boxShadow: '0 20px 48px rgba(27,28,26,0.15)', maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}>
              <h3 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>{editingId ? 'Edit Fabric — ' + editingId : 'Register New Fabric'}</h3>
              <button onClick={function () { setShowForm(false); setEditingId(null); }} className="w-7 h-7 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors">
                <Icon name="x" cls="w-4 h-4" />
              </button>
            </div>
            <div className="p-5" style={{ overflowY: 'auto', flex: 1 }}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                <div className="col-span-2 sm:col-span-3">
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Fabric Name <span style={{ color: '#ba1a1a' }}>*</span></label>
                  <input type="text" value={form.name} onChange={function (e) { setForm({ ...form, name: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0 transition-colors"
                    style={{ borderColor: '#d2c5b1', fontFamily: 'Inter,sans-serif' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder="e.g. Chanderi Silk" />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Fabric Family</label>
                  <select value={families.includes(form.fabric_family) ? form.fabric_family : (form.fabric_family ? '__custom__' : '')}
                    onChange={function (e) {
                      if (e.target.value === '__add_new__') { setShowAddFamily(true); setNewFamilyName(''); }
                      else if (e.target.value === '__custom__') { /* no-op */ }
                      else { setForm({ ...form, fabric_family: e.target.value }); handleSelectFamily(e.target.value); }
                    }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0"
                    style={{ borderColor: '#d2c5b1' }}>
                    <option value="">— Select Family —</option>
                    {families.map(function (f) { return <option key={f} value={f}>{f}</option>; })}
                    {form.fabric_family && !families.includes(form.fabric_family) && <option value="__custom__">{form.fabric_family}</option>}
                    <option value="__add_new__">＋ Add New Family…</option>
                  </select>
                  {showAddFamily && (
                    <div className="mt-2 p-3 rounded-lg" style={{ background: '#fef9ee', border: '1px solid #d4a843' }}>
                      <div className="text-xs font-bold mb-2" style={{ color: '#795900', letterSpacing: '0.08em', textTransform: 'uppercase' }}>New Family Name</div>
                      <div className="flex gap-2 items-end">
                        <input type="text" placeholder="e.g. Chanderi, Banarasi, Khadi" value={newFamilyName} onChange={function (e) { setNewFamilyName(e.target.value); }}
                          className="flex-1 bg-transparent border-0 border-b px-0 py-1 text-xs focus:ring-0" style={{ borderColor: '#d2c5b1' }} />
                        <button disabled={!newFamilyName.trim()} onClick={function () {
                          var name = newFamilyName.trim();
                          if (!name) return;
                          setFamilies(function (prev) { return prev.includes(name) ? prev : [...prev, name].sort(); });
                          setForm({ ...form, fabric_family: name });
                          setShowAddFamily(false);
                        }}
                          className="px-3 py-1.5 rounded text-xs font-bold text-white" style={{ background: !newFamilyName.trim() ? '#d2c5b1' : '#795900' }}>
                          Add
                        </button>
                        <button onClick={function () { setShowAddFamily(false); }} className="px-2 py-1.5 rounded text-xs" style={{ color: '#807664' }}>Cancel</button>
                      </div>
                      <div className="text-xs mt-1.5" style={{ color: '#807664' }}>This will be saved when you save the fabric.</div>
                    </div>
                  )}
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
                    {colourOptions.map(function (c) {
                      return <option key={c.id} value={c.name}>{c.name}{c.family ? ' (' + c.family + ')' : ''}</option>;
                    })}
                    <option value="Dyeable">Dyeable (No fixed colour)</option>
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
                        <div className="flex-1" style={{ minWidth: 80 }}>
                          <input type="text" placeholder="Family (optional)" value={newColourForm.family} onChange={function (e) { setNewColourForm({ ...newColourForm, family: e.target.value }); }}
                            className="w-full bg-transparent border-0 border-b px-0 py-1 text-xs focus:ring-0" style={{ borderColor: '#d2c5b1' }} />
                        </div>
                        <button disabled={savingColour || !newColourForm.name.trim()} onClick={async function () {
                          setSavingColour(true);
                          try {
                            var { data, error } = await supa.from('colour_master').insert([{ name: newColourForm.name.trim(), hex_code: newColourForm.hex_code, family: newColourForm.family.trim() || null, is_active: true }]).select();
                            if (error) throw error;
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
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Fabric Type</label>
                  <select value={form.fabric_type || 'Dyeable'} onChange={function (e) { setForm({ ...form, fabric_type: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0"
                    style={{ borderColor: '#d2c5b1' }}>
                    <option value="Dyeable">Dyeable</option>
                    <option value="Finished">Finished Fabric</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Cost Type</label>
                  <select value={form.cost_type || 'per_metre'} onChange={function (e) { setForm({ ...form, cost_type: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0"
                    style={{ borderColor: '#d2c5b1' }}>
                    <option value="per_metre">Per Metre</option>
                    <option value="total">Total Cost (Set Fabric)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>{form.cost_type === 'total' ? 'Total Cost (₹)' : 'Cost / Metre (₹)'} <span style={{ color: '#ba1a1a' }}>*</span></label>
                  <input type="number" value={form.default_cost_per_metre} onChange={function (e) { setForm({ ...form, default_cost_per_metre: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0"
                    style={{ borderColor: '#d2c5b1' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder={form.cost_type === 'total' ? '1500' : '320'} />
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
                <div className="col-span-2 sm:col-span-3">
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 6 }}>Vendor Fabric IDs</label>
                  <div className="space-y-2">
                    {(form.vendors || []).map(function (v, vi) {
                      return (<div key={vi} className="flex gap-2 items-center">
                        <select value={v.vendor_id || ''} onChange={function (e) { var vlist = [...(form.vendors || [])]; vlist[vi] = { ...vlist[vi], vendor_id: e.target.value }; setForm({ ...form, vendors: vlist }); }}
                          className="flex-1 bg-transparent border-0 border-b px-0 py-1.5 text-sm focus:ring-0" style={{ borderColor: '#d2c5b1' }}>
                          <option value="">Select Vendor</option>
                          {vendors.map(function (av) { return <option key={av.id} value={av.id}>{av.name}</option>; })}
                        </select>
                        <input type="text" value={v.vendor_fabric_id || ''} placeholder="Vendor Fabric ID"
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
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Weave</label>
                  <input type="text" value={form.weave} onChange={function (e) { setForm({ ...form, weave: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0" style={{ borderColor: '#d2c5b1' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder="Plain / Twill / Satin" />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Composition</label>
                  <input type="text" value={form.composition} onChange={function (e) { setForm({ ...form, composition: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0" style={{ borderColor: '#d2c5b1' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder="60% Cotton 40% Silk" />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Width (inches)</label>
                  <input type="number" value={form.width_inches} onChange={function (e) { setForm({ ...form, width_inches: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0" style={{ borderColor: '#d2c5b1' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder="44" />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Weight (GSM)</label>
                  <input type="number" value={form.weight_gsm} onChange={function (e) { setForm({ ...form, weight_gsm: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0" style={{ borderColor: '#d2c5b1' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder="120" />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Thread Count</label>
                  <input type="text" value={form.thread_count} onChange={function (e) { setForm({ ...form, thread_count: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0" style={{ borderColor: '#d2c5b1' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder="80s" />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Stretch</label>
                  <select value={form.stretch} onChange={function (e) { setForm({ ...form, stretch: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0" style={{ borderColor: '#d2c5b1' }}>
                    <option value="">None</option>
                    <option value="2-way">2-way</option>
                    <option value="4-way">4-way</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Wash Care</label>
                  <input type="text" value={form.wash_care} onChange={function (e) { setForm({ ...form, wash_care: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0" style={{ borderColor: '#d2c5b1' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder="Dry Clean Only" />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 6 }}>Fabric Images</label>
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
                      <input type="file" accept="image/*" className="hidden" onChange={async function (e) { var file = e.target.files[0]; if (!file) return; try { var url = await uploadImage(file, 'fabric-images'); setForm(function (prev) { return { ...prev, image_urls: [...(prev.image_urls || []), url] }; }); } catch (err) { alert('Upload failed'); } }} />
                    </label>
                  </div>
                  <div style={{ fontSize: 10, color: '#9c9b97', letterSpacing: '0.02em' }}>First image is the hero. Click + to add more.</div>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 6 }}>Video URLs</label>
                  <div className="space-y-2 mb-2">
                    {(form.video_urls || (form.video_url ? [form.video_url] : [])).map(function (url, idx) {
                      return <div key={idx} className="flex gap-2 items-center">
                        <input type="text" value={url} onChange={function (e) { var urls = [...(form.video_urls || (form.video_url ? [form.video_url] : []))]; urls[idx] = e.target.value; setForm({ ...form, video_urls: urls, video_url: urls[0] || '' }); }}
                          className="flex-1 bg-transparent border-0 border-b-2 px-0 py-1.5 text-sm focus:ring-0" style={{ borderColor: '#d2c5b1' }}
                          onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                          placeholder="https://youtube.com/watch?v=..." />
                        <button onClick={function () { var urls = (form.video_urls || (form.video_url ? [form.video_url] : [])).filter(function (_, i) { return i !== idx; }); setForm({ ...form, video_urls: urls, video_url: urls[0] || '' }); }}
                          className="p-1 rounded-full text-red-400 hover:bg-red-50 transition-colors"><Icon name="x" cls="w-3.5 h-3.5" /></button>
                      </div>;
                    })}
                  </div>
                  <button onClick={function () { var urls = [...(form.video_urls || (form.video_url ? [form.video_url] : [])), '']; setForm({ ...form, video_urls: urls }); }}
                    className="text-xs font-bold flex items-center gap-1" style={{ color: '#795900', letterSpacing: '0.05em' }}><span style={{ fontSize: 14 }}>+</span> Add Video URL</button>
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#807664', display: 'block', marginBottom: 4 }}>Description</label>
                  <textarea value={form.description} onChange={function (e) { setForm({ ...form, description: e.target.value }); }}
                    className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0 min-h-16 resize-none" style={{ borderColor: '#d2c5b1' }}
                    onFocus={function (e) { e.target.style.borderColor = '#d4a843' }} onBlur={function (e) { e.target.style.borderColor = '#d2c5b1' }}
                    placeholder="Notes about this fabric" />
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
                {editingId ? 'Update Fabric' : 'Register Fabric'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE CARD LIST ── */}
      <div className="sm:hidden space-y-3">
        {paged.map(function (f) {
          var s = stock[f.id] || 0;
          var vendorObj = vendors.find(function (v) { return v.id === f.default_vendor_id; });
          var fb = getFamilyBadge(f.fabric_family);
          var dotColor = getColourDot(f.colour);
          var comp = getCompleteness(f);
          var compColor = comp.pct === 100 ? '#16a34a' : comp.pct >= 70 ? '#d97706' : '#dc2626';
          return (
            <div key={f.id} className="rounded-xl overflow-hidden" style={{ background: '#fff', boxShadow: '0 4px 16px rgba(27,28,26,0.06)', border: '1px solid rgba(210,197,177,0.15)' }}>
              {/* Card top: Image + Info */}
              <div className="flex gap-3 p-3.5">
                {/* Fabric image */}
                <div className="flex-shrink-0">
                  {f.image_urls && f.image_urls[0]
                    ? <img src={f.image_urls[0]} className="w-24 h-28 rounded-xl object-cover" style={{ border: '2px solid #e9e8e4' }} onError={function (e) { e.target.style.display = 'none' }} alt="" />
                    : <div className="w-24 h-28 rounded-xl flex items-center justify-center" style={{ background: '#f5f4f0', border: '2px solid #e9e8e4', fontSize: 28 }}>🧵</div>}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                  <div>
                    <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#795900', marginBottom: 2 }}>ID: {f.id}</div>
                    <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: '0.95rem', fontWeight: 800, color: '#1b1c1a', lineHeight: 1.2, marginBottom: 6 }} className="truncate">{f.name}</div>
                    {f.is_active === false && <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#ba1a1a', background: '#ffdad6', padding: '2px 6px', borderRadius: 4, marginBottom: 4 }}>INACTIVE</span>}
                  </div>
                  {/* Badge pills */}
                  <div className="flex gap-1.5 flex-wrap">
                    {f.fabric_family && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: fb.bg, color: fb.text, border: '1px solid ' + fb.border }}>{f.fabric_family.toUpperCase()}</span>}
                    {f.colour && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: '#f5f4f0', color: '#4e4636', border: '1px solid #e9e8e4' }}>
                      {dotColor && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block', border: '1px solid rgba(0,0,0,0.1)' }}></span>}
                      {f.colour.toUpperCase()}
                    </span>}
                    {f.composition && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: '#e1e0ff', color: '#2f2ebe', border: '1px solid #c0c1ff' }}>{f.composition}</span>}
                    {f.fabric_type && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: f.fabric_type === 'Dyeable' ? '#dbeafe' : '#d1fae5', color: f.fabric_type === 'Dyeable' ? '#1e40af' : '#065f46', border: '1px solid ' + (f.fabric_type === 'Dyeable' ? '#93c5fd' : '#6ee7b7') }}>{f.fabric_type.toUpperCase()}</span>}
                  </div>
                </div>
              </div>
              {/* Completeness bar */}
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
              {/* Stats strip */}
              <div className="grid grid-cols-3 text-center" style={{ background: '#f5f4f0', borderTop: '1px solid #e9e8e4', padding: '10px 8px' }}>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9c9b97' }}>{f.cost_type === 'total' ? 'TOTAL COST' : 'COST/M'}</div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 800, color: '#795900', marginTop: 2 }}>{n(f.default_cost_per_metre) > 0 ? fmt(n(f.default_cost_per_metre)) : '—'}</div>
                </div>
                <div style={{ borderLeft: '1px solid #e9e8e4', borderRight: '1px solid #e9e8e4' }}>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9c9b97' }}>IN STOCK</div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 800, marginTop: 2, color: s > 20 ? '#16a34a' : s > 5 ? '#d97706' : '#dc2626' }}>{s > 0 ? s.toFixed(1) + 'm' : '0m'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9c9b97' }}>VENDOR</div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 600, color: '#1b1c1a', marginTop: 2 }} className="truncate px-1">{vendorObj ? vendorObj.name : '—'}</div>
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex gap-2 p-3" style={{ background: '#fff' }}>
                <button onClick={function () { handleEdit(f); }}
                  className="flex-1 py-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                  style={{ background: '#f5f4f0', color: '#1b1c1a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  <Icon name="edit" cls="w-3.5 h-3.5" /> EDIT
                </button>
                <button onClick={function () { setShowQR(f); }}
                  className="flex-1 py-2.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                  style={{ background: '#dbeafe', color: '#1e40af', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  <span style={{ fontSize: 12 }}>📱</span> QR LABEL
                </button>
                <button onClick={function () { handleDelete(f.id); }}
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
            <div style={{ fontSize: 40, marginBottom: 8 }}>🧵</div>
            <div style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, color: '#807664', fontSize: 14 }}>No fabrics found</div>
            <div style={{ fontSize: 12, color: '#9c9b97', marginTop: 4 }}>Try adjusting your filters or search query</div>
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
                <th className="px-3 py-3.5 text-left" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>FABRIC NAME</th>
                <th className="px-3 py-3.5 text-left" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 100 }}>FAMILY</th>
                <th className="px-3 py-3.5 text-left" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 100 }}>COLOUR</th>
                <th className="px-3 py-3.5 text-right" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 90 }}>COST/M</th>
                <th className="px-3 py-3.5 text-right" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 80 }}>STOCK</th>
                <th className="px-3 py-3.5 text-left" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 130 }}>VENDOR</th>
                <th className="px-3 pr-5 py-3.5 text-center" style={{ fontSize: 9, letterSpacing: '0.12em', color: '#807664', fontFamily: 'Inter,sans-serif', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap', width: 110, position: 'sticky', right: 0, background: '#f5f4f0', zIndex: 2 }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(function (f, ri) {
                var s = stock[f.id] || 0;
                var vendorObj = vendors.find(function (v) { return v.id === f.default_vendor_id; });
                var fb = getFamilyBadge(f.fabric_family);
                var dotColor = getColourDot(f.colour);
                var comp = getCompleteness(f);
                var compColor = comp.pct === 100 ? '#16a34a' : comp.pct >= 70 ? '#d97706' : '#dc2626';
                var circumference = 2 * Math.PI * 14;
                var dashOffset = circumference - (comp.pct / 100) * circumference;
                return (
                  <tr key={f.id} className="group cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid #f0efeb', background: ri % 2 === 0 ? '#fff' : '#faf9f7' }}
                    onMouseEnter={function (e) { e.currentTarget.style.background = '#faf9f5' }}
                    onMouseLeave={function (e) { e.currentTarget.style.background = ri % 2 === 0 ? '#fff' : '#faf9f7' }}
                    onClick={function () { setExpandedId(expandedId === f.id ? null : f.id); }}>
                    <td className="pl-5 pr-2 py-3">
                      <div className="relative" style={{ width: 40, height: 40 }}>
                        {f.image_urls && f.image_urls[0]
                          ? <img src={f.image_urls[0]} className="w-10 h-10 rounded-lg object-cover" style={{ border: '1.5px solid #e9e8e4' }} alt="" />
                          : <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: '#f5f4f0', border: '1.5px solid #e9e8e4', fontSize: 16 }}>🧵</div>}
                        {comp.pct < 100 && <div style={{ position: 'absolute', bottom: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
                          <svg width="18" height="18" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="14" fill="none" stroke="#e9e8e4" strokeWidth="3" />
                            <circle cx="18" cy="18" r="14" fill="none" stroke={compColor} strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
                          </svg>
                        </div>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: '#795900' }}>{f.id}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, fontSize: '0.85rem', color: '#1b1c1a' }} className="truncate">{f.name}</div>
                      <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 10, color: '#9c9b97', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          {[f.weight_gsm ? f.weight_gsm + ' GSM' : null, f.weave ? 'Grade ' + (f.thread_count || 'A') : null].filter(Boolean).join(' · ') || (f.composition || '')}
                        </span>
                        {comp.pct < 100 && <span title={'Missing: ' + comp.missing.join(', ')} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '1px 5px', borderRadius: 4, background: comp.pct >= 70 ? '#fef3c7' : '#fef2f2', color: comp.pct >= 70 ? '#92400e' : '#dc2626', cursor: 'help' }}>{comp.pct}%</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {f.fabric_family
                        ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ background: fb.bg, color: fb.text, border: '1px solid ' + fb.border, letterSpacing: '0.03em' }}>{f.fabric_family.toUpperCase()}</span>
                        : <span style={{ color: '#d2c5b1' }}>—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div>
                        {f.colour
                          ? <div className="flex items-center gap-1.5">
                            {dotColor && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }}></span>}
                            <span style={{ fontSize: 13, color: '#4e4636' }}>{f.colour}</span>
                          </div>
                          : <span style={{ color: '#d2c5b1' }}>—</span>}
                        {f.fabric_type && <div style={{ marginTop: 2 }}><span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '1px 5px', borderRadius: 4, background: f.fabric_type === 'Dyeable' ? '#dbeafe' : '#d1fae5', color: f.fabric_type === 'Dyeable' ? '#1e40af' : '#065f46' }}>{f.fabric_type}</span></div>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: '0.85rem', color: '#795900' }}>
                        {n(f.default_cost_per_metre) > 0 ? fmt(n(f.default_cost_per_metre)) + (f.cost_type === 'total' ? '' : '/m') : '—'}
                      </span>
                      {f.cost_type === 'total' && <div style={{ fontSize: 9, color: '#9c9b97', marginTop: 1 }}>set fabric</div>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: '0.85rem', color: s > 20 ? '#16a34a' : s > 5 ? '#d97706' : '#dc2626' }}>
                        {s > 0 ? s.toFixed(1) + 'm' : '0m'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span style={{ fontSize: 13, color: '#4e4636' }}>{vendorObj ? vendorObj.name : '—'}</span>
                    </td>
                    <td className="px-2 pr-4 py-3 text-center" style={{ position: 'sticky', right: 0, background: ri % 2 === 0 ? '#fff' : '#faf9f7', zIndex: 1 }} onClick={function (e) { e.stopPropagation(); }}>
                      <div className="flex gap-1 justify-center">
                        <button onClick={function (e) { e.stopPropagation(); handleEdit(f); }} className="p-1.5 rounded-lg transition-colors hover:bg-gray-100" style={{ color: '#807664' }} title="Edit">
                          <Icon name="edit" cls="w-4 h-4" />
                        </button>
                        <button onClick={function (e) { e.stopPropagation(); setShowQR(f); }} className="p-1.5 rounded-lg transition-colors hover:bg-blue-50" style={{ color: '#1e40af' }} title="QR Label">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="3" height="3" /><rect x="20" y="14" width="1" height="3" /><rect x="14" y="20" width="3" height="1" /><rect x="20" y="20" width="1" height="1" /></svg>
                        </button>
                        <button onClick={function (e) { e.stopPropagation(); handleDelete(f.id); }} className="p-1.5 rounded-lg transition-colors hover:bg-red-50" style={{ color: '#ba1a1a' }} title="Delete">
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
              <div style={{ fontSize: 40, marginBottom: 8 }}>🧵</div>
              <div style={{ fontFamily: 'Manrope,sans-serif', fontWeight: 700, color: '#807664', fontSize: 14 }}>No fabrics found</div>
              <div style={{ fontSize: 12, color: '#9c9b97', marginTop: 4 }}>Try adjusting your filters or search query</div>
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

// ─── Fabric QR Modal ────────────────────────────────────────────────────────

export default FabricMasterTab

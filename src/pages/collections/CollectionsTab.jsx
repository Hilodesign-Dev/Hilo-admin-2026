import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa, fetchAllProducts } from '../../lib/supabase'
import { uploadImage } from '../../lib/storage'
import { productToSnake, productToCamel } from '../../lib/caseMapping'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, gmPct, calcCogs, effectiveSP } from '../../lib/helpers'
import { CATEGORY_CODES, TARGET_GROUPS, OCCASION_OPTIONS, VALID_SIZES, COLLAR_OPTIONS, SLEEVE_OPTIONS, CLOSURE_OPTIONS, PATTERN_OPTIONS, EMBROIDERY_TYPE_OPTIONS, SHIP_TIME_OPTIONS, SEASON_OPTIONS, ORDER_TYPE_OPTIONS, DEFAULT_MTF_UPCHARGE, HSN_CODES, HSN_OPTIONS } from '../../lib/constants'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

const CollectionsTab = ({ fabrics, stitchingMaster, dyes, categories, consumption, products, setProducts, user }) => {
  const [collections, setCollections] = React.useState([]);
  const [designProducts, setDesignProducts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedCollection, setSelectedCollection] = React.useState(null);
  const [showForm, setShowForm] = React.useState(false);
  const [editingCollection, setEditingCollection] = React.useState(null);
  const [collectionForm, setCollectionForm] = React.useState({ name: '', season_label: '', target_launch: '', notes: '', status: 'active', target_group: [], mood_theme: '', designer: '', budget_min: 0, budget_max: 0 });
  const [statusFilter, setStatusFilter] = React.useState('active');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [productViewTab, setProductViewTab] = React.useState('design');
  const [showProductForm, setShowProductForm] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState(null);
  const [productFormTab, setProductFormTab] = React.useState('info');
  const [openKebab, setOpenKebab] = React.useState(null);
  const [colours, setColours] = React.useState([]);
  const [showColourAdd, setShowColourAdd] = React.useState(false);
  const [newColour, setNewColour] = React.useState({ name: '', hex_code: '', dye_chart_code: '', family: '' });
  const _defaultProductForm = {
    style_code: '', product_title: '', category: '', is_set: false, set_components: [],
    fabric_id: '', fabric_name: '', cost_per_metre: 0, metres: 0, cost_type: 'per_metre',
    dye_id: '', dye_per_metre: 0,
    embroidery: 0, stitching: 0, accessories: 0,
    mrp: 0, proposed_mrp: 0,
    style_type: [], fit_type: [], look_type: [], available_sizes: [], available_colours: [],
    description: '', wash_care: '', manufacture_days: 0,
    image_urls: [], image_notes: '',
    production_stage: 'fabrication', catalogue_status: 'design',
    product_type: '', vendor: 'Hilo Design', tags: [], handle: '',
    seo_title: '', seo_description: '', body_html: '',
    hsn: '62114210', weight: '',
    colour_primary: '', colour_secondary: '', sleeve_desc: '',
    occasion_tag: '', fabric_tag: '',
    selling_price: 0, target_group: [], variant_tracks: [],
    shopify_generated: null, shopify_gen_status: 'none',
    // New SEO playbook fields
    fabric_grade: '', collar_type: 'Mandarin', sleeve_length: 'Full Sleeve',
    closure_type: 'Buttons', pattern: '', embroidery_type: '',
    ship_time: 7, gender: 'Mens', distinguishing_feature: '',
    suggested_styling: '', season: []
  };
  const [productForm, setProductForm] = React.useState({ ..._defaultProductForm });

  const userEmail = user?.email || '';
  const isViewOnly = userEmail === 'hello@oramas' || userEmail === 'store@hilodesign.co';
  const canEdit = !isViewOnly;

  const fmtDate = function(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yy = String(d.getFullYear()).slice(-2);
    return dd + '-' + mm + '-' + yy;
  };

  // Load collections and design products from Supabase
  const loadData = React.useCallback(async function() {
    try {
      setLoading(true);
      var { data: colData, error: colErr } = await supa.from('design_collections').select('*').order('created_at', { ascending: false });
      if (colErr) throw colErr;
      setCollections(colData || []);

      var prodData = await fetchAllProducts();
      setDesignProducts(prodData || []);

      var { data: colourData } = await supa.from('colour_master').select('*').eq('is_active', true).order('family').order('name');
      setColours(colourData || []);
    } catch (err) {
      console.error('Error loading collections:', err);
      alert('Failed to load collections: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(function() {
    loadData();
  }, [loadData]);

  // Save collection
  const saveCollection = async function(col) {
    try {
      if (col.id) {
        // Update - clean payload to only include DB columns
        var updatePayload = { name: col.name, season_label: col.season_label || '', target_launch: col.target_launch || null, notes: col.notes || '', status: col.status || 'active', target_group: col.target_group || [], mood_theme: col.mood_theme || '', designer: col.designer || '', budget_min: n(col.budget_min), budget_max: n(col.budget_max) };
        var { error } = await supa.from('design_collections').update(updatePayload).eq('id', col.id);
        if (error) throw error;
      } else {
        // Insert
        var payload = { name: col.name, season_label: col.season_label || '', target_launch: col.target_launch || null, notes: col.notes || '', status: col.status || 'active', created_by: userEmail, target_group: col.target_group || [], mood_theme: col.mood_theme || '', designer: col.designer || '', budget_min: n(col.budget_min), budget_max: n(col.budget_max) };
        var { error: insErr, data: insData } = await supa.from('design_collections').insert([payload]).select();
        if (insErr) throw insErr;
        if (insData && insData.length > 0) col.id = insData[0].id;
      }
      await loadData();
      _logChange(col.id ? 'update' : 'create', 'collection', col.id, col.name, { season: col.season_label, status: col.status });
      setShowForm(false);
      setEditingCollection(null);
      setCollectionForm({ name: '', season_label: '', target_launch: '', notes: '', status: 'active', target_group: [], mood_theme: '', designer: '', budget_min: 0, budget_max: 0 });
    } catch (err) {
      console.error('Error saving collection:', err);
      alert('Failed to save collection: ' + (err?.message || 'Unknown error'));
    }
  };

  // Delete collection
  const deleteCollection = async function(colId) {
    if (!confirm('Delete this collection? This action cannot be undone.')) return;
    try {
      var _delCol = collections.find(function(c) { return c.id === colId; });
      var { error } = await supa.from('design_collections').delete().eq('id', colId);
      if (error) throw error;
      await loadData();
      _logChange('delete', 'collection', colId, _delCol ? _delCol.name : '', null);
      setSelectedCollection(null);
    } catch (err) {
      console.error('Error deleting collection:', err);
      alert('Failed to delete collection: ' + (err?.message || 'Unknown error'));
    }
  };

  // Delete product
  const deleteProduct = async function(prodId) {
    if (!confirm('Delete this product? This action cannot be undone.')) return;
    try {
      var _delProd = designProducts.find(function(p) { return p.id === prodId; });
      var { error } = await supa.from('design_products').delete().eq('id', prodId);
      if (error) throw error;
      await loadData();
      _logChange('delete', 'design_product', prodId, _delProd ? _delProd.style_code : '', { title: _delProd ? _delProd.product_title : '' });
    } catch (err) {
      console.error('Error deleting product:', err);
      alert('Failed to delete product: ' + (err?.message || 'Unknown error'));
    }
  };

  // Save design product
  const saveProduct = async function(prod) {
    if (prod.is_set && (!prod.set_components || prod.set_components.length === 0)) {
      alert('Sets must have at least one piece. Add pieces in the COGS Calculator tab.');
      return;
    }
    try {
      var dbPayload = {
        style_code: prod.style_code,
        product_title: prod.product_title,
        category: prod.category,
        is_set: prod.is_set,
        set_components: prod.set_components,
        fabric_id: prod.fabric_id,
        fabric_name: prod.fabric_name,
        cost_per_metre: n(prod.cost_per_metre),
        metres: n(prod.metres),
        dye_id: prod.dye_id,
        dye_per_metre: n(prod.dye_per_metre),
        embroidery: n(prod.embroidery),
        stitching: n(prod.stitching),
        accessories: n(prod.accessories),
        mrp: n(prod.mrp),
        proposed_mrp: n(prod.proposed_mrp),
        style_type: prod.style_type,
        fit_type: prod.fit_type,
        look_type: prod.look_type,
        available_sizes: prod.available_sizes,
        available_colours: prod.available_colours,
        description: prod.description,
        wash_care: prod.wash_care,
        manufacture_days: n(prod.manufacture_days),
        image_urls: prod.image_urls,
        image_notes: prod.image_notes,
        production_stage: prod.production_stage,
        catalogue_status: prod.catalogue_status,
        collection_id: prod.collection_id,
        product_type: prod.product_type || prod.category || '',
        vendor: prod.vendor || 'Hilo Design',
        tags: prod.tags || [],
        handle: prod.handle || '',
        seo_title: prod.seo_title || '',
        seo_description: prod.seo_description || '',
        body_html: prod.body_html || '',
        hsn: prod.hsn || '62114210',
        weight: prod.weight || '',
        colour_primary: prod.colour_primary || '',
        colour_secondary: prod.colour_secondary || '',
        sleeve_desc: prod.sleeve_desc || '',
        occasion_tag: prod.occasion_tag || '',
        fabric_tag: prod.fabric_tag || '',
        selling_price: n(prod.selling_price),
        target_group: prod.target_group || [],
        variant_tracks: prod.variant_tracks || [],
        fabric_grade: prod.fabric_grade || '',
        collar_type: prod.collar_type || 'Mandarin',
        sleeve_length: prod.sleeve_length || 'Full Sleeve',
        closure_type: prod.closure_type || 'Buttons',
        pattern: prod.pattern || '',
        embroidery_type: prod.embroidery_type || '',
        ship_time: n(prod.ship_time) || 7,
        gender: prod.gender || 'Mens',
        distinguishing_feature: prod.distinguishing_feature || '',
        suggested_styling: prod.suggested_styling || '',
        season: prod.season || []
      };
      if (prod.id) {
        var { error } = await supa.from('design_products').update(dbPayload).eq('id', prod.id);
        if (error) throw error;
      } else {
        dbPayload.cogs_review_status = 'pending_entry';
        var { error: insErr, data: insData } = await supa.from('design_products').insert([dbPayload]).select();
        if (insErr) throw insErr;
        if (insData && insData.length > 0) prod.id = insData[0].id;
      }
      await loadData();
      _logChange(editingProduct ? 'update' : 'create', 'design_product', prod.id, prod.style_code, { title: prod.product_title, category: prod.category, mrp: prod.proposed_mrp || prod.mrp });
      setShowProductForm(false);
      setEditingProduct(null);
      resetProductForm();
    } catch (err) {
      console.error('Error saving product:', err);
      alert('Failed to save product: ' + (err?.message || 'Unknown error'));
    }
  };

  const resetProductForm = function() {
    setProductForm({ ..._defaultProductForm });
    setProductFormTab('info');
  };

  // Update production or catalogue status
  const updateProductField = async function(prodId, field, value) {
    // Optimistic local update so the card reflects the change immediately — a
    // reload/render hiccup can no longer masquerade as a failed status change.
    setDesignProducts(function(prev) { return prev.map(function(p) { return p.id === prodId ? { ...p, [field]: value } : p; }); });
    try {
      var { error } = await supa.from('design_products').update({ [field]: value }).eq('id', prodId);
      if (error) throw error;
      _logChange('field_update', 'design_product', prodId, '', { field: field, value: value });
    } catch (err) {
      console.error('Error updating product status:', err);
      alert('Failed to update: ' + (err?.message || err?.code || 'Unknown error') + '. Please retry.');
      loadData();  // only reload (revert) when the DB write actually failed
    }
  };

  // Promote product to catalogue
  const promoteToCaratogue = async function(dp) {
    try {
      var newProduct = {
        id: window.crypto?.getRandomValues(new Uint8Array(16))?.reduce((s,b) => s + (b < 16 ? '0' : '') + b.toString(16), '') || Date.now().toString(),
        styleCode: dp.style_code,
        productTitle: dp.product_title,
        productName: dp.product_title,
        category: dp.category,
        isSet: dp.is_set || false,
        setComponents: dp.set_components || [],
        fabricId: dp.fabric_id || '',
        fabricName: dp.fabric_name || '',
        costPerMetre: n(dp.cost_per_metre),
        metres: n(dp.metres),
        dyeId: dp.dye_id || '',
        dyePerMetre: n(dp.dye_per_metre),
        embroidery: n(dp.embroidery),
        stitching: n(dp.stitching),
        accessories: n(dp.accessories),
        mrp: n(dp.proposed_mrp || dp.mrp),
        sellingPrice: n(dp.proposed_mrp || dp.mrp),
        status: 'Active',
        colourPrimary: dp.colour_primary || '',
        colourSecondary: dp.colour_secondary || '',
        vendor: dp.vendor || 'Hilo Design',
        tags: dp.tags || [],
        handle: dp.handle || '',
        seoTitle: dp.seo_title || '',
        seoDescription: dp.seo_description || '',
        bodyHtml: dp.body_html || '',
        hsn: dp.hsn || '62114210',
        weight: dp.weight || '',
        sleeveDesc: dp.sleeve_desc || '',
        occasionTag: dp.occasion_tag || '',
        fabricTag: dp.fabric_tag || '',
        description: dp.description || '',
        washCare: dp.wash_care || '',
        image_urls: dp.image_urls || [],
        cogs_review_status: 'pending_entry'
      };
      // Promote-to-catalogue is retired: the live catalogue (Catalogue V2) is
      // refreshed from Shopify directly, so we no longer copy into design_products.
      void newProduct;
      alert('Promotion is no longer needed — the live catalogue syncs from Shopify. Use the upcoming "Push to Shopify" action instead.');
    } catch (err) {
      console.error('Error promoting product:', err);
      alert('Failed to promote: ' + (err?.message || 'Unknown error'));
    }
  };

  // Calculate GM% for a design product
  const _calcTrackCogs = function(track) {
    if (track.is_set && track.pieces && track.pieces.length > 0) {
      return track.pieces.reduce(function(sum, pc) {
        var fc = (pc.costType === 'total') ? n(pc.costPerMetre) : n(pc.costPerMetre) * n(pc.metres) + n(pc.dyePerMetre) * n(pc.metres);
        return sum + fc + n(pc.embroidery) + n(pc.stitching) + n(pc.accessories);
      }, 0);
    }
    return calcCogs({ fabricName: track.fabric_name || '', costPerMetre: n(track.cost_per_metre), metres: n(track.metres), dyePerMetre: n(track.dye_per_metre), embroidery: n(track.embroidery), stitching: n(track.stitching), accessories: n(track.accessories), costType: track.cost_type || 'per_metre' });
  };

  const _productCogsAndMRP = function(dp) {
    // Try top-level fields first, fall back to first variant track
    var hasToplevel = n(dp.cost_per_metre) > 0 || n(dp.embroidery) > 0 || n(dp.stitching) > 0;
    var track = (dp.variant_tracks && dp.variant_tracks.length > 0) ? dp.variant_tracks[0] : null;
    var cogs, mrp;
    if (hasToplevel) {
      cogs = calcCogs({ fabricName: dp.fabric_name, costPerMetre: n(dp.cost_per_metre), metres: n(dp.metres), dyePerMetre: n(dp.dye_per_metre), embroidery: n(dp.embroidery), stitching: n(dp.stitching), accessories: n(dp.accessories), costType: dp.cost_type || 'per_metre' });
      mrp = n(dp.proposed_mrp || dp.mrp);
    } else if (track) {
      cogs = _calcTrackCogs(track);
      mrp = n(track.mrp) || n(dp.proposed_mrp || dp.mrp);
    } else {
      cogs = 0;
      mrp = n(dp.proposed_mrp || dp.mrp);
    }
    return { cogs: cogs, mrp: mrp };
  };

  const calcProductGM = function(dp) {
    var cm = _productCogsAndMRP(dp);
    return gmPct(cm.mrp, cm.cogs, cm.mrp);
  };

  // Get GM badge emoji
  const getGMBadge = function(gm) {
    if (gm < 0.45) return '🔴';
    if (gm < 0.50) return '🟠';
    if (gm < 0.65) return '🟢';
    return '⭐';
  };

  // Get production stage progress percentage
  const getStageProgress = function(stage) {
    var stageMap = { 'fabrication': 17, 'dyeing': 33, 'marking': 50, 'embroidery': 67, 'stitching': 83, 'ready': 100 };
    return stageMap[stage] || 0;
  };

  // Collection list view
  if (!selectedCollection) {
    var activeCollections = collections.filter(function(c) { return c.status === 'active'; });
    var archivedCollections = collections.filter(function(c) { return c.status === 'archived'; });

    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">DESIGN STUDIO</div>
          <h1 className="page-title">Collections</h1>
          <div className="flex items-center gap-2 mt-4">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary-container/10 text-primary font-semibold text-xs">
              {collections.length} Total
            </span>
          </div>
        </div>

        {/* Filter: Active/Archived */}
        <div className="collection-filter-pills flex gap-2 mb-6 flex-wrap">
          <button
            onClick={function() { setStatusFilter('active'); }}
            className="px-4 py-2 rounded-full text-sm font-semibold pill-active"
            style={{ background: statusFilter === 'active' ? '#ffffff' : 'transparent', color: statusFilter === 'active' ? '#795900' : 'rgba(27,28,26,0.5)', boxShadow: statusFilter === 'active' ? '0 4px 12px rgba(27,28,26,0.06)' : 'none' }}>
            Active ({activeCollections.length})
          </button>
          <button
            onClick={function() { setStatusFilter('archived'); }}
            className="px-4 py-2 rounded-full text-sm font-semibold"
            style={{ background: statusFilter === 'archived' ? '#ffffff' : 'transparent', color: statusFilter === 'archived' ? '#795900' : 'rgba(27,28,26,0.5)', boxShadow: statusFilter === 'archived' ? '0 4px 12px rgba(27,28,26,0.06)' : 'none' }}>
            Archived ({archivedCollections.length})
          </button>
        </div>

        {/* Collections Grid */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading collections...</div>
        ) : activeCollections.length === 0 && archivedCollections.length === 0 ? (
          <div className="empty-state-card card p-8 text-center">
            <div className="text-5xl mb-4">📦</div>
            <p className="text-gray-600 mb-4">Create your first collection to start tracking new designs</p>
            {canEdit && (
              <button
                onClick={function() { setShowForm(true); setEditingCollection(null); setCollectionForm({ name: '', season_label: '', target_launch: '', notes: '', status: 'active', target_group: [], mood_theme: '', designer: '', budget_min: 0, budget_max: 0 }); }}
                className="btn-gold px-6 py-2 rounded-lg font-semibold inline-block">
                Create Collection
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {(statusFilter === 'active' ? activeCollections : archivedCollections).map(function(col) {
              var colProducts = designProducts.filter(function(p) { return p.collection_id === col.id; });
              var readyCount = colProducts.filter(function(p) { return p.production_stage === 'ready'; }).length;
              var liveCount = colProducts.filter(function(p) { return p.catalogue_status === 'catalogue_live'; }).length;
              return (
                <div key={col.id} className="collection-card card p-6 cursor-pointer hover:shadow-lg transition-shadow" onClick={function() { setSelectedCollection(col); }}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-headline font-bold text-lg" style={{ color: '#1b1c1a' }}>{col.name}</h3>
                      <div className="text-xs text-gray-500 mt-1">{col.season_label}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="badge badge-gold">{colProducts.length} Products</span>
                      {canEdit && (
                        <div className="relative">
                          <button className="p-1 hover:bg-gray-100 rounded" onClick={function(e) { e.stopPropagation(); setOpenKebab(openKebab === col.id ? null : col.id); }}>
                            ⋮
                          </button>
                          {openKebab === col.id && (
                            <div className="absolute right-0 top-full bg-white border border-gray-200 rounded shadow-lg z-10 min-w-[120px]">
                              <button
                                onClick={function(e) {
                                  e.stopPropagation();
                                  setEditingCollection(col);
                                  setCollectionForm({ name: col.name, season_label: col.season_label, target_launch: col.target_launch, notes: col.notes, status: col.status, target_group: col.target_group || [], mood_theme: col.mood_theme || '', designer: col.designer || '', budget_min: col.budget_min || 0, budget_max: col.budget_max || 0 });
                                  setShowForm(true);
                                  setOpenKebab(null);
                                }}
                                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 border-b border-gray-200">
                                Edit
                              </button>
                              <button
                                onClick={function(e) {
                                  e.stopPropagation();
                                  deleteCollection(col.id);
                                  setOpenKebab(null);
                                }}
                                className="block w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-red-600 font-semibold">
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mb-3">
                    {col.target_launch ? ('📅 ' + fmtDate(col.target_launch)) : '—'}
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-1 mb-3 overflow-hidden">
                    <div
                      style={{ width: colProducts.length > 0 ? ((readyCount / colProducts.length) * 100) + '%' : '0%', background: '#d4a843', transition: 'width 0.3s' }}
                      className="h-full"
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>{readyCount} Ready</span>
                    <span>{liveCount} Live</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* New Collection Button */}
        {canEdit && (
          <button
            onClick={function() { setShowForm(true); setEditingCollection(null); setCollectionForm({ name: '', season_label: '', target_launch: '', notes: '', status: 'active', target_group: [], mood_theme: '', designer: '', budget_min: 0, budget_max: 0 }); }}
            className="btn-gold px-6 py-2 rounded-lg font-semibold"
            style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}>
            + New Collection
          </button>
        )}

        {/* Collection Form Modal */}
        {showForm && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
          }}>
            <div className="card p-8 max-w-lg w-full">
              <h2 className="text-2xl font-headline font-bold mb-6">
                {editingCollection ? 'Edit Collection' : 'New Collection'}
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="label-xs mb-2 block">Collection Name</label>
                  <input
                    type="text"
                    value={collectionForm.name}
                    onChange={function(e) { setCollectionForm(function(prev) { return { ...prev, name: e.target.value }; }); }}
                    className="w-full input-ghost"
                    placeholder="e.g., Summer 2024"
                  />
                </div>
                <div>
                  <label className="label-xs mb-2 block">Season Label</label>
                  <input
                    type="text"
                    value={collectionForm.season_label}
                    onChange={function(e) { setCollectionForm(function(prev) { return { ...prev, season_label: e.target.value }; }); }}
                    className="w-full input-ghost"
                    placeholder="e.g., S24"
                  />
                </div>
                <div>
                  <label className="label-xs mb-2 block">Target Launch</label>
                  <input
                    type="date"
                    value={collectionForm.target_launch}
                    onChange={function(e) { setCollectionForm(function(prev) { return { ...prev, target_launch: e.target.value }; }); }}
                    className="w-full input-ghost"
                  />
                </div>
                <div>
                  <label className="label-xs mb-2 block">Designer</label>
                  <input
                    type="text"
                    value={collectionForm.designer}
                    onChange={function(e) { setCollectionForm(function(prev) { return { ...prev, designer: e.target.value }; }); }}
                    className="w-full input-ghost"
                    placeholder="e.g., Sahith, Rahul"
                  />
                </div>
                <div>
                  <label className="label-xs mb-2 block">Target Group</label>
                  <div className="flex flex-wrap gap-2">
                    {TARGET_GROUPS.map(function(tg) {
                      var selected = (collectionForm.target_group || []).includes(tg);
                      return <button key={tg} type="button" onClick={function() {
                        setCollectionForm(function(prev) {
                          var arr = [...(prev.target_group || [])];
                          if (arr.includes(tg)) arr = arr.filter(function(x) { return x !== tg; });
                          else arr.push(tg);
                          return { ...prev, target_group: arr };
                        });
                      }} className="px-3 py-1 text-xs font-semibold rounded-full border transition" style={{ background: selected ? '#d4a843' : 'transparent', color: selected ? '#ffffff' : '#795900', border: '1px solid rgba(212,168,67,0.5)' }}>{tg}</button>;
                    })}
                  </div>
                </div>
                <div>
                  <label className="label-xs mb-2 block">Mood / Theme</label>
                  <input
                    type="text"
                    value={collectionForm.mood_theme}
                    onChange={function(e) { setCollectionForm(function(prev) { return { ...prev, mood_theme: e.target.value }; }); }}
                    className="w-full input-ghost"
                    placeholder="e.g., Royal Heritage, Modern Minimalist"
                  />
                </div>
                <div>
                  <label className="label-xs mb-2 block">Budget Range (MRP)</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="text" inputMode="decimal"
                      value={collectionForm.budget_min || ''}
                      onChange={function(e) { setCollectionForm(function(prev) { return { ...prev, budget_min: n(e.target.value) }; }); }}
                      className="input-ghost" style={{ flex: 1 }}
                      placeholder="Min ₹"
                    />
                    <span className="text-gray-400">—</span>
                    <input
                      type="text" inputMode="decimal"
                      value={collectionForm.budget_max || ''}
                      onChange={function(e) { setCollectionForm(function(prev) { return { ...prev, budget_max: e.target.value ? n(e.target.value) : 0 }; }); }}
                      className="input-ghost" style={{ flex: 1 }}
                      placeholder="Max ₹"
                    />
                  </div>
                </div>
                <div>
                  <label className="label-xs mb-2 block">Notes</label>
                  <textarea
                    value={collectionForm.notes}
                    onChange={function(e) { setCollectionForm(function(prev) { return { ...prev, notes: e.target.value }; }); }}
                    className="w-full input-ghost"
                    placeholder="Collection notes..."
                    rows="2"
                  />
                </div>
                <div>
                  <label className="label-xs mb-2 block">Status</label>
                  <select
                    value={collectionForm.status}
                    onChange={function(e) { setCollectionForm(function(prev) { return { ...prev, status: e.target.value }; }); }}
                    className="w-full input-ghost">
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  onClick={function() { saveCollection(editingCollection ? { ...editingCollection, ...collectionForm } : { ...collectionForm, id: undefined }); }}
                  className="btn-gold flex-1 py-2 rounded-lg font-semibold">
                  Save Collection
                </button>
                <button
                  onClick={function() { setShowForm(false); setEditingCollection(null); }}
                  className="flex-1 py-2 rounded-lg font-semibold border border-gray-300">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Collection detail view
  var colProducts = designProducts.filter(function(p) { return p.collection_id === selectedCollection.id; });
  var statusTabs = [
    { key: 'design', label: '✏️ Design', status: 'design' },
    { key: 'in_production', label: '🔄 Production', status: 'in_production' },
    { key: 'ready_for_shoot', label: '📸 Shoot', status: 'ready_for_shoot' },
    { key: 'catalogue_in_process', label: '🖥️ Processing', status: 'catalogue_in_process' },
    { key: 'catalogue_live', label: '🟢 Live', status: 'catalogue_live' }
  ];
  var statusCounts = {};
  statusTabs.forEach(function(t) { statusCounts[t.key] = colProducts.filter(function(p) { return p.catalogue_status === t.status; }).length; });
  var tabFiltered = colProducts.filter(function(p) { return p.catalogue_status === productViewTab; });
  var filteredProducts = searchQuery ? tabFiltered.filter(function(p) { return (p.style_code || '').toLowerCase().includes(searchQuery.toLowerCase()) || (p.product_title || '').toLowerCase().includes(searchQuery.toLowerCase()); }) : tabFiltered;
  var liveCount = statusCounts['catalogue_live'] || 0;
  var avgGM = colProducts.length > 0 ? colProducts.reduce(function(s, p) { return s + calcProductGM(p); }, 0) / colProducts.length : 0;
  var redGMCount = colProducts.filter(function(p) { return calcProductGM(p) < 0.45; }).length;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <button
        onClick={function() { setSelectedCollection(null); }}
        className="breadcrumb-button text-sm text-primary hover:text-primary-container mb-6 font-semibold">
        ← Collections
      </button>

      {/* Header with Add Product Button */}
      <div className="mb-8">
        <div className="collection-header-flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h1 className="page-title">{selectedCollection.name}</h1>
          {canEdit && (
            <button
              onClick={function() { resetProductForm(); setProductForm(function(prev) { return { ...prev, collection_id: selectedCollection.id }; }); setShowProductForm(true); }}
              className="px-6 py-2 rounded-lg font-semibold text-sm"
              style={{ background: 'linear-gradient(135deg, #795900, #d4a843)', color: '#fff', border: 'none', cursor: 'pointer', transition: 'transform 0.2s' }}
              onMouseEnter={function(e) { e.target.style.transform = 'scale(1.05)'; }}
              onMouseLeave={function(e) { e.target.style.transform = 'scale(1)'; }}>
              + Add Product
            </button>
          )}
        </div>
        <div className="text-sm text-gray-600 mt-2">{selectedCollection.season_label} · {fmtDate(selectedCollection.target_launch)}</div>
      </div>

      {/* Summary Stats */}
      <div className="collections-stats-grid grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="card p-4">
          <div className="label-xs mb-2">Catalogue Live</div>
          <div className="text-2xl font-bold text-green-600">{liveCount}</div>
        </div>
        <div className="card p-4">
          <div className="label-xs mb-2">Avg GM%</div>
          <div className="text-2xl font-bold" style={{ color: avgGM >= 0.65 ? '#16a34a' : avgGM >= 0.50 ? '#d4a843' : '#dc2626' }}>
            {(avgGM * 100).toFixed(1)}%
          </div>
        </div>
        <div className="card p-4">
          <div className="label-xs mb-2">Red GM Count</div>
          <div className="text-2xl font-bold text-red-600">{redGMCount}</div>
        </div>
      </div>

      {/* View Tabs + Search */}
      {colProducts.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {statusTabs.map(function(tab) {
              var active = productViewTab === tab.key;
              var count = statusCounts[tab.key] || 0;
              var bg = active ? (tab.key === 'catalogue_live' ? '#16a34a' : '#795900') : '#f5f1ea';
              var fg = active ? '#fff' : '#795900';
              return (
                <button key={tab.key} onClick={function() { setProductViewTab(tab.key); }} className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all" style={{ background: bg, color: fg, border: active ? 'none' : '1px solid #d2c5b1' }}>
                  {tab.label} ({count})
                </button>
              );
            })}
          </div>
          <input
            type="text"
            placeholder="Search by style code or product title..."
            value={searchQuery}
            onChange={function(e) { setSearchQuery(e.target.value); }}
            className="w-full input-ghost"
          />
          {searchQuery && <div className="text-xs text-gray-600 mt-2">Found {filteredProducts.length} product(s)</div>}
        </div>
      )}

      {/* Products Grid */}
      {colProducts.length === 0 ? (
        <div className="empty-state-card card p-8 text-center">
          <div className="text-4xl mb-4">🛍️</div>
          <p className="text-gray-600 mb-4">Add your first product to this collection</p>
          {canEdit && (
            <button
              onClick={function() { resetProductForm(); setProductForm(function(prev) { return { ...prev, collection_id: selectedCollection.id }; }); setShowProductForm(true); }}
              className="btn-gold px-6 py-2 rounded-lg font-semibold inline-block">
              Add Product
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
          {filteredProducts.map(function(dp) {
            var gm = calcProductGM(dp);
            var img = dp.image_urls && dp.image_urls.length > 0 ? dp.image_urls[0] : null;
            var cm = _productCogsAndMRP(dp);
            var gmColor = gm >= 0.5 ? '#16a34a' : gm >= 0.3 ? '#ca8a04' : '#dc2626';
            return (
              <div key={dp.id} className="card product-card" style={{ padding: '0', overflow: 'hidden', borderRadius: '12px' }}>
                {/* Image */}
                <div className="w-full bg-gray-100 flex items-center justify-center overflow-hidden" style={{ height: '140px', position: 'relative' }}>
                  {img ? (
                    <img src={img} alt={dp.product_title} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl text-gray-300">📷</span>
                  )}
                  {/* Category + Set tags overlaid on image */}
                  <div style={{ position: 'absolute', bottom: '6px', left: '6px', display: 'flex', gap: '4px' }}>
                    <span style={{ background: 'rgba(255,255,255,0.92)', color: '#795900', fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', backdropFilter: 'blur(4px)' }}>
                      {dp.category}
                    </span>
                    {dp.is_set && <span style={{ background: 'rgba(255,255,255,0.92)', color: '#795900', fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px' }}>Set</span>}
                  </div>
                  {/* Promoted badge on image */}
                  {dp.promoted_to_catalogue && (
                    <span style={{ position: 'absolute', top: '6px', right: '6px', background: '#dcfce7', color: '#16a34a', fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px' }}>
                      In Catalogue
                    </span>
                  )}
                </div>

                <div style={{ padding: '10px 12px 12px' }}>
                  {/* Style Code + Title */}
                  <div className="font-mono" style={{ fontSize: '10px', color: '#9a9a9a', letterSpacing: '0.5px', marginBottom: '2px' }}>{dp.style_code}</div>
                  <h3 className="font-headline font-bold" style={{ fontSize: '13px', color: '#1b1c1a', marginBottom: '8px', lineHeight: '1.3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dp.product_title}</h3>

                  {/* Tags row */}
                  {dp.tags && dp.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {(dp.tags || []).slice(0, 3).map(function(tag, ti) {
                        return <span key={ti} style={{ fontSize: '9px', color: '#888', background: '#f5f1ea', padding: '1px 6px', borderRadius: '3px' }}>{tag}</span>;
                      })}
                      {dp.tags.length > 3 && <span style={{ fontSize: '9px', color: '#999' }}>+{dp.tags.length - 3}</span>}
                    </div>
                  )}

                  {/* COGS / MRP / GM — compact inline row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '6px 8px', background: '#faf8f5', borderRadius: '6px', border: '1px solid #f0ece4' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '1px' }}>COGS</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#333', fontFamily: 'monospace' }}>{cm.cogs > 0 ? fmt(cm.cogs) : '—'}</div>
                    </div>
                    <div style={{ width: '1px', height: '22px', background: '#e5e0d7' }} />
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '1px' }}>MRP</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#333', fontFamily: 'monospace' }}>{cm.mrp > 0 ? fmt(cm.mrp) : '—'}</div>
                    </div>
                    <div style={{ width: '1px', height: '22px', background: '#e5e0d7' }} />
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '9px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '1px' }}>GM</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', color: gmColor }}>{(gm * 100).toFixed(1)}%</div>
                    </div>
                  </div>

                  {/* Production Stage + Catalogue Status — side by side */}
                  {canEdit && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                      <div>
                        <label style={{ fontSize: '9px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px', display: 'block' }}>Production</label>
                        <select
                          value={dp.production_stage}
                          onChange={function(e) { updateProductField(dp.id, 'production_stage', e.target.value); }}
                          style={{ width: '100%', fontSize: '11px', padding: '4px 6px', border: '1px solid #e5e0d7', borderRadius: '6px', background: '#fff', color: '#333', cursor: 'pointer' }}>
                          <option value="fabrication">🧵 Fabrication</option>
                          <option value="dyeing">🎨 Dyeing</option>
                          <option value="marking">✏️ Marking</option>
                          <option value="embroidery">🪡 Embroidery</option>
                          <option value="stitching">🪢 Stitching</option>
                          <option value="ready">✅ Ready</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '9px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px', display: 'block' }}>Status</label>
                        <select
                          value={dp.catalogue_status}
                          onChange={function(e) { updateProductField(dp.id, 'catalogue_status', e.target.value); }}
                          style={{ width: '100%', fontSize: '11px', padding: '4px 6px', border: '1px solid #e5e0d7', borderRadius: '6px', background: '#fff', color: '#333', cursor: 'pointer' }}>
                          <option value="design">✏️ Design</option>
                          <option value="in_production">🔄 Production</option>
                          <option value="ready_for_shoot">📸 Shoot</option>
                          <option value="catalogue_in_process">🖥️ Processing</option>
                          <option value="catalogue_live">🟢 Live</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Edit and Delete Buttons */}
                  {canEdit && (
                    <div className="flex gap-2">
                      <button
                        onClick={function() { setEditingProduct(dp); setProductForm({ ...dp, collection_id: dp.collection_id }); setShowProductForm(true); }}
                        style={{ flex: 1, padding: '5px 0', border: '1px solid #e5e0d7', borderRadius: '6px', fontSize: '11px', fontWeight: 600, color: '#555', background: '#fff', cursor: 'pointer' }}>
                        Edit
                      </button>
                      <button
                        onClick={function() { deleteProduct(dp.id); }}
                        style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer' }}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}


      {/* Product Form Modal */}
      {showProductForm && (function() {
        // ── Helpers ──
        var _toggleArr = function(field, val) { setProductForm(function(prev) { var arr = [...(prev[field] || [])]; var idx = arr.indexOf(val); if (idx > -1) { arr.splice(idx, 1); } else { arr.push(val); } var o = {}; o[field] = arr; return Object.assign({}, prev, o); }); };
        var _pillStyle = function(arr, val) { return { background: (arr || []).includes(val) ? '#d4a843' : 'transparent', color: (arr || []).includes(val) ? '#ffffff' : '#795900', border: '1px solid rgba(212,168,67,0.5)' }; };
        var _pieceCogs = function(pc) {
          var costType = pc.costType || 'per_metre';
          if (costType === 'total') return n(pc.costPerMetre) + n(pc.embroidery) + n(pc.stitching) + n(pc.accessories);
          return n(pc.costPerMetre) * n(pc.metres) + n(pc.dyePerMetre) * n(pc.metres) + n(pc.embroidery) + n(pc.stitching) + n(pc.accessories);
        };
        // Variant-level COGS: each variant_track can be a set (with pieces) or single
        var _variantCogs = function(track) {
          if (track.is_set && track.pieces && track.pieces.length > 0) {
            return track.pieces.reduce(function(sum, pc) { return sum + _pieceCogs(pc); }, 0);
          }
          return calcCogs({ fabricName: track.fabric_name || '', costPerMetre: n(track.cost_per_metre), metres: n(track.metres), dyePerMetre: n(track.dye_per_metre), embroidery: n(track.embroidery), stitching: n(track.stitching), accessories: n(track.accessories), costType: track.cost_type || 'per_metre' });
        };
        // Auto-fill SP/MRP for 65% GM, 0% discount when user edits COGS fields
        var _targetSP = function(cogs) {
          if (!cogs || cogs <= 0) return 0;
          return Math.ceil(cogs / 0.35 / 10) * 10; // round up to nearest 10
        };
        var _recomputeAutoSP = function(track) {
          if (track.selling_price_auto === false) return track;
          // For legacy rows where the flag is undefined, only auto-fill if SP and MRP haven't been set yet
          if (track.selling_price_auto !== true && (n(track.selling_price) > 0 || n(track.mrp) > 0)) return track;
          var newCogs = _variantCogs(track);
          var newSP = _targetSP(newCogs);
          if (newSP <= 0) return track;
          return { ...track, selling_price: newSP, mrp: newSP, selling_price_auto: true };
        };
        var _updateTrack = function(tIdx, field, val) {
          setProductForm(function(prev) {
            var arr = [...(prev.variant_tracks || [])];
            arr[tIdx] = { ...arr[tIdx] };
            arr[tIdx][field] = val;
            if (field === 'selling_price' || field === 'mrp') {
              arr[tIdx].selling_price_auto = false;
            } else {
              arr[tIdx] = _recomputeAutoSP(arr[tIdx]);
            }
            return { ...prev, variant_tracks: arr };
          });
        };
        var _updateTrackPiece = function(tIdx, pIdx, field, val) {
          setProductForm(function(prev) {
            var arr = [...(prev.variant_tracks || [])]; arr[tIdx] = { ...arr[tIdx] };
            var pieces = [...(arr[tIdx].pieces || [])]; pieces[pIdx] = { ...pieces[pIdx] }; pieces[pIdx][field] = val;
            arr[tIdx].pieces = pieces;
            arr[tIdx] = _recomputeAutoSP(arr[tIdx]);
            return { ...prev, variant_tracks: arr };
          });
        };
        var _addTrackPiece = function(tIdx) {
          setProductForm(function(prev) {
            var arr = [...(prev.variant_tracks || [])]; arr[tIdx] = { ...arr[tIdx] };
            var pieces = [...(arr[tIdx].pieces || [])];
            pieces.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2,8), name: '', category: '', fabricId: '', fabricName: '', costPerMetre: 0, metres: 0, costType: 'per_metre', dyeId: '', dyePerMetre: 0, embroidery: 0, stitching: 0, accessories: 0 });
            arr[tIdx].pieces = pieces;
            arr[tIdx] = _recomputeAutoSP(arr[tIdx]);
            return { ...prev, variant_tracks: arr };
          });
        };
        var _removeTrackPiece = function(tIdx, pIdx) {
          setProductForm(function(prev) {
            var arr = [...(prev.variant_tracks || [])]; arr[tIdx] = { ...arr[tIdx] };
            var pieces = [...(arr[tIdx].pieces || [])]; pieces.splice(pIdx, 1);
            arr[tIdx].pieces = pieces;
            arr[tIdx] = _recomputeAutoSP(arr[tIdx]);
            return { ...prev, variant_tracks: arr };
          });
        };
        var _tabBtn = function(tab, label) {
          return React.createElement('button', {
            key: tab,
            onClick: function() { setProductFormTab(tab); },
            className: 'px-4 py-2 text-sm font-semibold rounded-t-lg transition',
            style: { background: productFormTab === tab ? '#ffffff' : 'transparent', color: productFormTab === tab ? '#795900' : 'rgba(27,28,26,0.5)', borderBottom: productFormTab === tab ? '2px solid #d4a843' : '2px solid transparent' }
          }, label);
        };
        // Section label helper
        var _sectionLabel = function(text) {
          return React.createElement('div', { className: 'label-xs mb-4', style: { letterSpacing: '0.5px' } }, text);
        };
        return (
        <div className="product-form-modal" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto'
        }}>
          <div className="card w-full my-4" style={{ maxWidth: '1100px', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div className="p-6 pb-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-headline font-bold">
                  {editingProduct ? 'Edit Product' : 'New Design Product'}
                </h2>
                <button onClick={function() { setShowProductForm(false); setEditingProduct(null); resetProductForm(); }} className="text-gray-400 hover:text-gray-600 text-xl px-2">✕</button>
              </div>
              {/* Tab Bar */}
              <div className="product-form-tabs flex gap-1" style={{ borderBottom: '1px solid #d2c5b1' }}>
                {_tabBtn('info', '1. What Is It')}
                {_tabBtn('variants', '2. Variants')}
                {_tabBtn('shopify', '3. Shopify Preview')}
              </div>
            </div>

            {/* Scrollable Content — Split Panel */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', gap: '24px', padding: '24px' }}>

              {/* ═══ LEFT PANEL — IMAGES (sticky) ═══ */}
              <div style={{ width: '280px', flexShrink: 0, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
                {productForm.image_urls && productForm.image_urls.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {productForm.image_urls.map(function(url, idx) {
                      return (
                        <div key={idx} className="relative">
                          <img src={url} alt={'img-' + idx} style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px' }} />
                          <button
                            onClick={function() { setProductForm(function(prev) { var nu = [...prev.image_urls]; nu.splice(idx, 1); return { ...prev, image_urls: nu }; }); }}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <input type="file" accept="image/*" multiple
                  onChange={async function(e) {
                    var files = Array.from(e.target.files || []);
                    try {
                      var urls = await Promise.all(files.map(function(file) { return uploadImage(file, 'design-product-images'); }));
                      setProductForm(function(prev) { return { ...prev, image_urls: [...(prev.image_urls || []), ...urls] }; });
                    } catch (err) { alert('Upload failed: ' + (err?.message || 'Unknown error')); }
                  }}
                  className="w-full text-xs mb-2"
                />
                <input type="text" value={productForm.image_notes || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, image_notes: e.target.value }; }); }}
                  className="w-full input-ghost text-xs" placeholder="Image notes..." />
                {/* Quick product summary */}
                {productForm.category && (
                  <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.15)' }}>
                    <div className="font-semibold mb-1" style={{ color: '#795900' }}>{productForm.product_title || 'Untitled'}</div>
                    <div className="text-gray-500">{productForm.category}{productForm.colour_primary ? ' · ' + productForm.colour_primary : ''}</div>
                    {productForm.variant_tracks && productForm.variant_tracks.length > 0 && (
                      <div className="mt-2 text-gray-500">{productForm.variant_tracks.length} variant(s)</div>
                    )}
                  </div>
                )}
              </div>

              {/* ═══ RIGHT PANEL — FORM ═══ */}
              <div style={{ flex: 1, minWidth: 0 }}>

              {/* ═══════ TAB 1: WHAT IS IT + STYLE & ATTRIBUTES ═══════ */}
              <div style={{ display: productFormTab === 'info' ? '' : 'none' }}>
                <div className="space-y-6">

                  {/* Category — FIRST */}
                  <div>
                    {_sectionLabel('Category')}
                    <select value={productForm.category} onChange={function(e) {
                      var catName = e.target.value;
                      var cat = categories.find(function(c) { return c.name === catName; });
                      var autoHsn = HSN_CODES[catName] || '';
                      setProductForm(function(prev) { return { ...prev, category: catName, product_type: catName, hsn: autoHsn || prev.hsn }; });
                    }} className="w-full input-ghost" style={{ fontSize: '16px', fontWeight: '600' }}>
                      <option value="">Select category...</option>
                      {categories.map(function(cat) { return <option key={cat.id} value={cat.name}>{cat.name}</option>; })}
                    </select>
                  </div>

                  {/* Product Description */}
                  <div>
                    {_sectionLabel('Product Description')}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="label-xs mb-1 block">Product Title</label>
                        <input type="text" value={productForm.product_title} onChange={function(e) { setProductForm(function(prev) { return { ...prev, product_title: e.target.value }; }); }} className="w-full input-ghost" placeholder="e.g., Premium Silk Kurta" />
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">Gender</label>
                        <select value={productForm.gender || 'Mens'} onChange={function(e) { setProductForm(function(prev) { return { ...prev, gender: e.target.value }; }); }} className="w-full input-ghost">
                          {['Mens', 'Womens', 'Kids', 'Unisex'].map(function(g) { return <option key={g} value={g}>{g}</option>; })}
                        </select>
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="label-xs mb-1 block">Description</label>
                      <textarea value={productForm.description || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, description: e.target.value }; }); }} className="w-full input-ghost text-xs" placeholder="Brief product description..." rows="3" />
                    </div>
                    <div className="mt-4">
                      <label className="label-xs mb-1 block">Distinguishing Feature</label>
                      <input type="text" value={productForm.distinguishing_feature || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, distinguishing_feature: e.target.value }; }); }} className="w-full input-ghost text-xs" placeholder="e.g., Hand-embroidered motifs on collar and cuffs" />
                      <div className="text-xs text-gray-400 mt-1">What makes this product unique? Used in SEO title + body.</div>
                    </div>
                    {/* Auto-generated Shopify title preview */}
                    {productForm.product_title && productForm.category && (
                      <div className="mt-3 p-3 rounded-lg text-xs" style={{ background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.15)' }}>
                        <div className="text-gray-500 mb-1">Shopify Title Preview:</div>
                        <div className="font-semibold" style={{ color: '#795900' }}>
                          {'Hilo Design ' + (productForm.fabric_tag ? productForm.fabric_tag + ' ' : '') + productForm.product_title + (productForm.distinguishing_feature ? ' with ' + productForm.distinguishing_feature : '')}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Construction Attributes */}
                  <div>
                    {_sectionLabel('Construction Attributes')}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="label-xs mb-1 block">Collar / Neckline</label>
                        <select value={productForm.collar_type || 'Mandarin'} onChange={function(e) { setProductForm(function(prev) { return { ...prev, collar_type: e.target.value }; }); }} className="w-full input-ghost text-xs">
                          {COLLAR_OPTIONS.map(function(o) { return <option key={o} value={o}>{o}</option>; })}
                        </select>
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">Sleeve Length</label>
                        <select value={productForm.sleeve_length || 'Full Sleeve'} onChange={function(e) { setProductForm(function(prev) { return { ...prev, sleeve_length: e.target.value }; }); }} className="w-full input-ghost text-xs">
                          {SLEEVE_OPTIONS.map(function(o) { return <option key={o} value={o}>{o}</option>; })}
                        </select>
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">Closure</label>
                        <select value={productForm.closure_type || 'Buttons'} onChange={function(e) { setProductForm(function(prev) { return { ...prev, closure_type: e.target.value }; }); }} className="w-full input-ghost text-xs">
                          {CLOSURE_OPTIONS.map(function(o) { return <option key={o} value={o}>{o}</option>; })}
                        </select>
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">Pattern</label>
                        <select value={productForm.pattern || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, pattern: e.target.value }; }); }} className="w-full input-ghost text-xs">
                          <option value="">Select...</option>
                          {PATTERN_OPTIONS.map(function(o) { return <option key={o} value={o}>{o}</option>; })}
                        </select>
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">Embroidery Type</label>
                        <select value={productForm.embroidery_type || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, embroidery_type: e.target.value }; }); }} className="w-full input-ghost text-xs">
                          <option value="">Select...</option>
                          {EMBROIDERY_TYPE_OPTIONS.map(function(o) { return <option key={o} value={o}>{o}</option>; })}
                        </select>
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">Fabric Grade</label>
                        <input type="text" value={productForm.fabric_grade || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, fabric_grade: e.target.value }; }); }} className="w-full input-ghost text-xs" placeholder="e.g., Premium, Standard" />
                      </div>
                    </div>
                  </div>

                  {/* Colours */}
                  <div>
                    {_sectionLabel('Colours')}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { key: 'colour_primary', label: 'Primary Colour' },
                        { key: 'colour_secondary', label: 'Secondary Colour' }
                      ].map(function(col) {
                        var selectedColour = colours.find(function(c) { return c.name === productForm[col.key]; });
                        var isOpen = productForm[col.key + '_picker_open'];
                        var groupedColours = {};
                        colours.forEach(function(c) {
                          if (!groupedColours[c.family]) groupedColours[c.family] = [];
                          groupedColours[c.family].push(c);
                        });
                        return (
                          <div key={col.key} style={{ position: 'relative' }}>
                            <label className="label-xs mb-1 block">{col.label}</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {selectedColour && (
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #ddd', background: selectedColour.hex_code, flexShrink: 0 }} title={selectedColour.name} />
                              )}
                              <div style={{ flex: 1, position: 'relative' }}>
                                <button type="button" onClick={function() { var nv = {}; nv[col.key + '_picker_open'] = !isOpen; setProductForm(function(prev) { return { ...prev, ...nv }; }); }}
                                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '4px', background: '#fff', textAlign: 'left', cursor: 'pointer', fontSize: '14px' }}>
                                  {productForm[col.key] || 'Select colour...'}
                                </button>
                                {isOpen && (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10, maxHeight: '300px', overflowY: 'auto', marginTop: '4px' }}>
                                    {Object.keys(groupedColours).map(function(family) {
                                      return (
                                        <div key={family}>
                                          <div style={{ padding: '8px 12px', background: '#f5f5f5', fontWeight: '600', fontSize: '12px', borderBottom: '1px solid #eee' }}>{family}</div>
                                          {groupedColours[family].map(function(c) {
                                            return (
                                              <button key={c.id} type="button" onClick={function() { var nv = {}; nv[col.key] = c.name; nv[col.key + '_picker_open'] = false; setProductForm(function(prev) { return { ...prev, ...nv }; }); }}
                                                style={{ width: '100%', padding: '10px 12px', border: 'none', background: productForm[col.key] === c.name ? '#f0f0f0' : '#fff', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #f0f0f0', fontSize: '13px' }}>
                                                <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '2px solid #ddd', background: c.hex_code, flexShrink: 0 }} />
                                                <div style={{ flex: 1 }}>
                                                  <div style={{ fontWeight: '500' }}>{c.name}</div>
                                                  <div style={{ fontSize: '11px', color: '#999' }}>{c.dye_chart_code}</div>
                                                </div>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      );
                                    })}
                                    <button type="button" onClick={function() { var nv = {}; nv[col.key + '_add_new'] = !productForm[col.key + '_add_new']; setProductForm(function(prev) { return { ...prev, ...nv }; }); }}
                                      style={{ width: '100%', padding: '10px 12px', border: 'none', background: '#fff', textAlign: 'left', cursor: 'pointer', borderTop: '1px solid #eee', fontSize: '13px', color: '#795900', fontWeight: '600' }}>
                                      + Add New Colour
                                    </button>
                                    {productForm[col.key + '_add_new'] && (
                                      <div style={{ padding: '12px', borderTop: '1px solid #eee', background: '#fafaf9' }}>
                                        <div style={{ marginBottom: '8px' }}>
                                          <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Name</label>
                                          <input type="text" placeholder="e.g., Deep Blue" value={productForm[col.key + '_new_name'] || ''} onChange={function(e) { var nv = {}; nv[col.key + '_new_name'] = e.target.value; setProductForm(function(prev) { return { ...prev, ...nv }; }); }} style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                                        </div>
                                        <div style={{ marginBottom: '8px' }}>
                                          <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Hex Code</label>
                                          <input type="text" placeholder="#000000" value={productForm[col.key + '_new_hex'] || ''} onChange={function(e) { var nv = {}; nv[col.key + '_new_hex'] = e.target.value; setProductForm(function(prev) { return { ...prev, ...nv }; }); }} style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                                        </div>
                                        <div style={{ marginBottom: '8px' }}>
                                          <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Dye Chart Code</label>
                                          <input type="text" placeholder="e.g., DC-001" value={productForm[col.key + '_new_code'] || ''} onChange={function(e) { var nv = {}; nv[col.key + '_new_code'] = e.target.value; setProductForm(function(prev) { return { ...prev, ...nv }; }); }} style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }} />
                                        </div>
                                        <div style={{ marginBottom: '8px' }}>
                                          <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '4px' }}>Family</label>
                                          <select value={productForm[col.key + '_new_family'] || ''} onChange={function(e) { var nv = {}; nv[col.key + '_new_family'] = e.target.value; setProductForm(function(prev) { return { ...prev, ...nv }; }); }} style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box' }}>
                                            <option value="">Select family</option>
                                            {['Red', 'Pink', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Brown', 'Neutral', 'Metallic'].map(function(f) { return <option key={f} value={f}>{f}</option>; })}
                                          </select>
                                        </div>
                                        <button type="button" onClick={function() {
                                          var addAsync = async function() {
                                            try {
                                              var nm = productForm[col.key + '_new_name'], hx = productForm[col.key + '_new_hex'], cd = productForm[col.key + '_new_code'], fm = productForm[col.key + '_new_family'];
                                              if (!nm || !hx || !fm) { alert('Please fill all fields'); return; }
                                              var { data: nc, error: err } = await supa.from('colour_master').insert([{ name: nm, hex_code: hx, dye_chart_code: cd, family: fm, is_active: true }]).select();
                                              if (err) throw err;
                                              await loadData();
                                              var rk = {}; rk[col.key + '_new_name'] = ''; rk[col.key + '_new_hex'] = ''; rk[col.key + '_new_code'] = ''; rk[col.key + '_new_family'] = ''; rk[col.key + '_add_new'] = false; rk[col.key] = nm; rk[col.key + '_picker_open'] = false;
                                              setProductForm(function(prev) { return { ...prev, ...rk }; });
                                            } catch (err) { alert('Failed to add colour: ' + (err?.message || 'Unknown error')); }
                                          };
                                          addAsync();
                                        }} style={{ width: '100%', padding: '8px', background: 'linear-gradient(135deg, #795900, #d4a843)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>
                                          Save Colour
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Style Attributes */}
                  <div>
                    {_sectionLabel('Style Attributes')}
                    <div className="space-y-4">
                      <div>
                        <label className="label-xs mb-2 block">Style Type</label>
                        <div className="flex flex-wrap gap-2">
                          {['Formal', 'Ethnic', 'Wedding', 'Casual', 'Party', 'Festive', 'Daily Wear'].map(function(st) {
                            return <button key={st} onClick={function() { _toggleArr('style_type', st); }} className="px-3 py-1 text-xs font-semibold rounded-full border transition" style={_pillStyle(productForm.style_type, st)}>{st}</button>;
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="label-xs mb-2 block">Fit Type</label>
                        <div className="flex flex-wrap gap-2">
                          {['Lean', 'Normal', 'Healthy', 'Relaxed', 'Slim'].map(function(ft) {
                            return <button key={ft} onClick={function() { _toggleArr('fit_type', ft); }} className="px-3 py-1 text-xs font-semibold rounded-full border transition" style={_pillStyle(productForm.fit_type, ft)}>{ft}</button>;
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="label-xs mb-2 block">Look Type</label>
                        <div className="flex flex-wrap gap-2">
                          {['Experimental', 'Minimalistic', 'Comfortable', 'Premium', 'Heritage'].map(function(lt) {
                            return <button key={lt} onClick={function() { _toggleArr('look_type', lt); }} className="px-3 py-1 text-xs font-semibold rounded-full border transition" style={_pillStyle(productForm.look_type, lt)}>{lt}</button>;
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Target & Occasion */}
                  <div>
                    {_sectionLabel('Target & Occasion')}
                    <div className="space-y-4">
                      <div>
                        <label className="label-xs mb-2 block">Target Group</label>
                        <div className="flex flex-wrap gap-2">
                          {TARGET_GROUPS.map(function(tg) {
                            return <button key={tg} onClick={function() { _toggleArr('target_group', tg); }} className="px-3 py-1 text-xs font-semibold rounded-full border transition" style={_pillStyle(productForm.target_group, tg)}>{tg}</button>;
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="label-xs mb-2 block">Occasion</label>
                        <div className="flex flex-wrap gap-2">
                          {OCCASION_OPTIONS.map(function(oc) {
                            var ocArr = (productForm.occasion_tag || '').split(',').map(function(t){return t.trim();}).filter(Boolean);
                            return <button key={oc} onClick={function() {
                              var tags = (productForm.occasion_tag || '').split(',').map(function(t){return t.trim();}).filter(Boolean);
                              if (tags.includes(oc)) { tags = tags.filter(function(t){return t !== oc;}); } else { tags.push(oc); }
                              setProductForm(function(prev) { return { ...prev, occasion_tag: tags.join(', ') }; });
                            }} className="px-3 py-1 text-xs font-semibold rounded-full border transition" style={{ background: ocArr.includes(oc) ? '#d4a843' : 'transparent', color: ocArr.includes(oc) ? '#ffffff' : '#795900', border: '1px solid rgba(212,168,67,0.5)' }}>{oc}</button>;
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="label-xs mb-2 block">Season</label>
                        <div className="flex flex-wrap gap-2">
                          {SEASON_OPTIONS.map(function(sn) {
                            return <button key={sn} onClick={function() { _toggleArr('season', sn); }} className="px-3 py-1 text-xs font-semibold rounded-full border transition" style={_pillStyle(productForm.season, sn)}>{sn}</button>;
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Suggested Styling + Care + HSN + Weight */}
                  <div>
                    {_sectionLabel('Additional Details')}
                    <div className="space-y-4">
                      <div>
                        <label className="label-xs mb-1 block">Suggested Styling</label>
                        <textarea value={productForm.suggested_styling || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, suggested_styling: e.target.value }; }); }} className="w-full input-ghost text-xs" placeholder="e.g., Pair with a silk pocket square and mojaris for a wedding look" rows="2" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="label-xs mb-1 block">Wash Care</label>
                          <textarea value={productForm.wash_care} onChange={function(e) { setProductForm(function(prev) { return { ...prev, wash_care: e.target.value }; }); }} className="w-full input-ghost text-xs" placeholder="Dry Clean Only / Hand Wash..." rows="2" />
                        </div>
                        <div>
                          <label className="label-xs mb-1 block">HSN Code</label>
                          <select value={productForm.hsn || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, hsn: e.target.value }; }); }} className="w-full input-ghost">
                            <option value="">Select HSN...</option>
                            <option value="62052000">62052000 — Shirts</option>
                            <option value="62043200">62043200 — Jackets/Shackets</option>
                            <option value="62114210">62114210 — Indian Wear</option>
                            <option value="62034200">62034200 — Trousers</option>
                            <option value="65050090">65050090 — Headwear</option>
                          </select>
                        </div>
                        <div>
                          <label className="label-xs mb-1 block">Weight</label>
                          <input type="text" value={productForm.weight} onChange={function(e) { setProductForm(function(prev) { return { ...prev, weight: e.target.value }; }); }} className="w-full input-ghost" placeholder="e.g., 350g" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Product COGS & Pricing (same as Catalogue) ── */}
                  <div>
                    {_sectionLabel('Product COGS & Pricing')}
                    {(function() {
                      var cogs = calcCogs({ fabricName: productForm.fabric_name, costPerMetre: n(productForm.cost_per_metre), metres: n(productForm.metres), dyePerMetre: n(productForm.dye_per_metre), embroidery: n(productForm.embroidery), stitching: n(productForm.stitching), accessories: n(productForm.accessories), costType: productForm.cost_type || 'per_metre' });
                      var mrp = n(productForm.proposed_mrp || productForm.mrp);
                      var gm = gmPct(mrp, cogs, mrp);
                      var setF = function(k, v) { setProductForm(function(prev){ var e = {}; e[k] = v; return { ...prev, ...e }; }); };
                      var autoMrp = function() { if (cogs <= 0) return; var eff = cogs / 0.35; var sp = eff * 1.05; if (sp > 2500) sp = eff * 1.18; sp = Math.round(sp / 10) * 10; setProductForm(function(prev){ return { ...prev, proposed_mrp: sp, mrp: n(prev.mrp) > 0 ? prev.mrp : sp }; }); };
                      return (
                      <div className="p-3 rounded-lg" style={{ background: 'rgba(212,168,67,0.05)', border: '1px solid rgba(212,168,67,0.15)' }}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div style={{ gridColumn: 'span 2' }}>
                            <label className="label-xs mb-1 block">Fabric</label>
                            <select value={productForm.fabric_id || ''} onChange={function(e){ var fab = fabrics.find(function(f){ return f.id === e.target.value; }); setProductForm(function(prev){ return { ...prev, fabric_id: e.target.value, fabric_name: fab ? fab.name : '', cost_per_metre: fab ? fab.costPerMetre : prev.cost_per_metre, cost_type: (fab && fab.costType) ? fab.costType : (prev.cost_type || 'per_metre') }; }); }} className="w-full input-ghost text-xs">
                              <option value="">Select fabric...</option>
                              {fabrics.map(function(fab){ return <option key={fab.id} value={fab.id}>{fab.name}</option>; })}
                            </select>
                          </div>
                          <div>
                            <label className="label-xs mb-1 block">Cost / Metre (₹)</label>
                            <input type="text" inputMode="decimal" value={productForm.cost_per_metre || ''} onChange={function(e){ setF('cost_per_metre', e.target.value); }} className="w-full input-ghost text-xs" placeholder="320" />
                          </div>
                          <div>
                            <label className="label-xs mb-1 block">Metres</label>
                            <input type="text" inputMode="decimal" value={productForm.metres || ''} onChange={function(e){ setF('metres', e.target.value); }} className="w-full input-ghost text-xs" placeholder="2.5" />
                          </div>
                          <div>
                            <label className="label-xs mb-1 block">Dye</label>
                            <select value={productForm.dye_id || ''} onChange={function(e){ var d = dyes.find(function(x){ return x.id === e.target.value; }); setProductForm(function(prev){ return { ...prev, dye_id: e.target.value, dye_per_metre: d ? d.costPerMetre : 0 }; }); }} className="w-full input-ghost text-xs">
                              <option value="">No Dye</option>
                              {dyes.map(function(d){ return <option key={d.id} value={d.id}>{d.type} (₹{d.costPerMetre}/m)</option>; })}
                            </select>
                          </div>
                          <div>
                            <label className="label-xs mb-1 block">Embroidery (₹)</label>
                            <input type="text" inputMode="decimal" value={productForm.embroidery || ''} onChange={function(e){ setF('embroidery', e.target.value); }} className="w-full input-ghost text-xs" placeholder="0" />
                          </div>
                          <div>
                            <label className="label-xs mb-1 block">Stitching (₹)</label>
                            <div className="flex gap-1">
                              <input type="text" inputMode="decimal" value={productForm.stitching || ''} onChange={function(e){ setF('stitching', e.target.value); }} className="w-full input-ghost text-xs" placeholder="0" />
                              <select onChange={function(e){ var m = stitchingMaster.find(function(s){ return s.id === e.target.value; }); if (m) setF('stitching', m.cost); }} defaultValue="" className="input-ghost text-xs" style={{ maxWidth: 92 }}><option value="">master…</option>{stitchingMaster.map(function(s){ return <option key={s.id} value={s.id}>{s.name}</option>; })}</select>
                            </div>
                          </div>
                          <div>
                            <label className="label-xs mb-1 block">Accessories (₹)</label>
                            <input type="text" inputMode="decimal" value={productForm.accessories || ''} onChange={function(e){ setF('accessories', e.target.value); }} className="w-full input-ghost text-xs" placeholder="0" />
                          </div>
                          <div>
                            <label className="label-xs mb-1 block">Proposed MRP (₹)</label>
                            <input type="text" inputMode="decimal" value={productForm.proposed_mrp || ''} onChange={function(e){ setF('proposed_mrp', e.target.value); }} className="w-full input-ghost text-xs" placeholder="e.g., 6999" />
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid rgba(212,168,67,0.2)' }}>
                          <div className="flex gap-4 text-xs">
                            <span>COGS: <b style={{ color: '#795900', fontFamily: 'monospace' }}>{cogs > 0 ? '₹' + fmt(cogs.toFixed(0)) : '—'}</b></span>
                            <span>MRP: <b style={{ fontFamily: 'monospace' }}>{mrp > 0 ? '₹' + fmt(mrp.toFixed(0)) : '—'}</b></span>
                            <span>GM: <b style={{ color: gm > 0.5 ? '#16a34a' : gm > 0.3 ? '#d97706' : '#ba1a1a', fontFamily: 'monospace' }}>{cogs > 0 && mrp > 0 ? (gm * 100).toFixed(1) + '%' : '—'}</b></span>
                          </div>
                          <button type="button" onClick={autoMrp} disabled={cogs <= 0} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ border: '1px solid rgba(212,168,67,0.4)', color: '#795900', background: '#fff', opacity: cogs > 0 ? 1 : 0.5 }}>Auto MRP · 65% GM</button>
                        </div>
                        <div className="text-xs text-gray-400 mt-2">Product-level COGS (used when there are no variant tracks) — same fields as the Catalogue, so COGS shows on the collection card.</div>
                      </div>
                      );
                    })()}
                  </div>

                </div>
              </div>

              {/* ═══════ TAB 2: VARIANTS ═══════ */}
              <div style={{ display: productFormTab === 'variants' ? '' : 'none' }}>
                <div className="space-y-6">

                  <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.15)', color: '#795900' }}>
                    Each variant track has its own: is_set toggle, COGS breakdown, pricing (MRP/SP), SKU, sizes, shipping time, and order type.
                  </div>

                  {(productForm.variant_tracks || []).map(function(track, tIdx) {
                    var trackCogs = _variantCogs(track);
                    var trackSP = n(track.selling_price);
                    var trackEffSP = trackSP > 0 ? trackSP / (1 + gst(trackSP)) : 0;
                    var trackGM = trackEffSP > 0 && trackCogs > 0 ? (trackEffSP - trackCogs) / trackEffSP : 0;

                    return (
                      <div key={tIdx} className="p-5 rounded-xl" style={{ background: '#faf9f5', border: '1px solid #d2c5b1' }}>
                        <div className="flex items-center justify-between mb-4">
                          <div className="font-headline font-bold text-sm" style={{ color: '#795900' }}>Variant {tIdx + 1}{track.label ? ': ' + track.label : ''}</div>
                          <button onClick={function() { setProductForm(function(prev) { var arr = [...(prev.variant_tracks || [])]; arr.splice(tIdx, 1); return { ...prev, variant_tracks: arr }; }); }} className="text-xs px-2 py-1 rounded" style={{ color: '#ba1a1a', border: '1px solid rgba(186,26,26,0.2)' }}>Remove</button>
                        </div>

                        {/* Label + Is Set */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                          <div>
                            <label className="label-xs mb-1 block">Variant Label (shown on Shopify)</label>
                            <input type="text" value={track.label || ''} onChange={function(e) { _updateTrack(tIdx, 'label', e.target.value); }} className="w-full input-ghost text-xs" placeholder="e.g., Sherwani + Trouser + Dupatta" />
                          </div>
                          <div className="flex items-end pb-2">
                            <label className="label-xs cursor-pointer">
                              <input type="checkbox" checked={track.is_set || false} onChange={function(e) { _updateTrack(tIdx, 'is_set', e.target.checked); }} className="mr-2" />
                              This variant is a Set (multiple pieces)
                            </label>
                          </div>
                        </div>

                        {/* ── COGS: Single item ── */}
                        {!track.is_set && (
                          <div className="mb-4 p-4 rounded-lg" style={{ background: 'rgba(212,168,67,0.04)', border: '1px solid rgba(212,168,67,0.12)' }}>
                            <div className="label-xs mb-3">COGS — Single Item</div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                              <div>
                                <label className="label-xs mb-1 block">Fabric</label>
                                <select value={track.fabric_id || ''} onChange={function(e) {
                                  var fab = fabrics.find(function(f) { return f.id === e.target.value; });
                                  _updateTrack(tIdx, 'fabric_id', e.target.value);
                                  _updateTrack(tIdx, 'fabric_name', fab?.name || '');
                                  _updateTrack(tIdx, 'cost_per_metre', fab?.costPerMetre || 0);
                                  _updateTrack(tIdx, 'cost_type', fab?.cost_type || 'per_metre');
                                }} className="w-full input-ghost text-xs">
                                  <option value="">Select fabric...</option>
                                  {fabrics.map(function(fab) { return <option key={fab.id} value={fab.id}>{fab.name}</option>; })}
                                </select>
                              </div>
                              <div>
                                <label className="label-xs mb-1 block">{track.cost_type === 'total' ? 'Fabric Cost (₹)' : 'Cost/m'}</label>
                                <input type="text" inputMode="decimal" value={track.cost_per_metre || ''} onChange={function(e) { _updateTrack(tIdx, 'cost_per_metre', e.target.value); }} className="w-full input-ghost text-xs" />
                              </div>
                              {track.cost_type !== 'total' && (
                                <div>
                                  <label className="label-xs mb-1 block">Metres</label>
                                  <div className="flex gap-1 items-end">
                                    <input type="text" inputMode="decimal" value={track.metres || ''} onChange={function(e) { _updateTrack(tIdx, 'metres', e.target.value); }} className="w-full input-ghost text-xs" />
                                    {track.fabric_id && productForm.category && (
                                      <button onClick={function() { var ci = consumption.find(function(c) { return c.category === productForm.category; }); if (ci) { _updateTrack(tIdx, 'metres', n(ci.metres || 0)); } }} className="px-2 py-1 text-xs rounded" style={{ background: 'rgba(212,168,67,0.15)', color: '#795900', fontSize: '10px' }}>Auto</button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              <div>
                                <label className="label-xs mb-1 block">Dye/m</label>
                                <input type="text" inputMode="decimal" value={track.dye_per_metre || ''} onChange={function(e) { _updateTrack(tIdx, 'dye_per_metre', e.target.value); }} className="w-full input-ghost text-xs" />
                              </div>
                              <div>
                                <label className="label-xs mb-1 block">Embroidery</label>
                                <input type="text" inputMode="decimal" value={track.embroidery || ''} onChange={function(e) { _updateTrack(tIdx, 'embroidery', e.target.value); }} className="w-full input-ghost text-xs" />
                              </div>
                              <div>
                                <label className="label-xs mb-1 block">Stitching</label>
                                <input type="text" inputMode="decimal" value={track.stitching || ''} onChange={function(e) { _updateTrack(tIdx, 'stitching', e.target.value); }} className="w-full input-ghost text-xs" />
                              </div>
                              <div>
                                <label className="label-xs mb-1 block">Accessories</label>
                                <input type="text" inputMode="decimal" value={track.accessories || ''} onChange={function(e) { _updateTrack(tIdx, 'accessories', e.target.value); }} className="w-full input-ghost text-xs" />
                              </div>
                            </div>
                            <div className="mt-2 text-xs font-mono font-bold text-right" style={{ color: '#795900' }}>COGS: {fmt(trackCogs)}</div>
                          </div>
                        )}

                        {/* ── COGS: Set (multiple pieces) ── */}
                        {track.is_set && (
                          <div className="mb-4 p-4 rounded-lg" style={{ background: 'rgba(73,75,214,0.04)', border: '1px solid rgba(73,75,214,0.12)' }}>
                            <div className="label-xs mb-3">COGS — Set Pieces</div>
                            {(track.pieces || []).map(function(pc, pIdx) {
                              return (
                                <div key={pc.id || pIdx} className="mb-3 p-3 rounded-lg" style={{ background: '#fff', border: '1px solid #e5e5e5' }}>
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-semibold" style={{ color: '#795900' }}>Piece {pIdx + 1}: {pc.name || '(unnamed)'}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-xs">{fmt(_pieceCogs(pc))}</span>
                                      <button onClick={function() { _removeTrackPiece(tIdx, pIdx); }} className="text-xs px-1 rounded" style={{ color: '#ba1a1a' }}>✕</button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                                    <div>
                                      <label className="label-xs mb-1 block">Name</label>
                                      <input type="text" value={pc.name || ''} onChange={function(e) { _updateTrackPiece(tIdx, pIdx, 'name', e.target.value); }} className="w-full input-ghost text-xs" placeholder="Kurta" />
                                    </div>
                                    <div>
                                      <label className="label-xs mb-1 block">Category</label>
                                      <select value={pc.category || ''} onChange={function(e) {
                                        _updateTrackPiece(tIdx, pIdx, 'category', e.target.value);
                                        var cat = categories.find(function(c) { return c.name === e.target.value; });
                                        if (cat && cat.defaultStitching) { var si = stitchingMaster.find(function(s) { return s.name === cat.defaultStitching; }); if (si) _updateTrackPiece(tIdx, pIdx, 'stitching', n(si.cost)); }
                                      }} className="w-full input-ghost text-xs">
                                        <option value="">Select...</option>
                                        {categories.map(function(c) { return <option key={c.id} value={c.name}>{c.name}</option>; })}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="label-xs mb-1 block">Fabric</label>
                                      <select value={pc.fabricId || ''} onChange={function(e) {
                                        var fab = fabrics.find(function(f) { return f.id === e.target.value; });
                                        _updateTrackPiece(tIdx, pIdx, 'fabricId', e.target.value);
                                        _updateTrackPiece(tIdx, pIdx, 'fabricName', fab?.name || '');
                                        _updateTrackPiece(tIdx, pIdx, 'costPerMetre', fab?.costPerMetre || 0);
                                        _updateTrackPiece(tIdx, pIdx, 'costType', fab?.cost_type || 'per_metre');
                                      }} className="w-full input-ghost text-xs">
                                        <option value="">Select...</option>
                                        {fabrics.map(function(f) { return <option key={f.id} value={f.id}>{f.name}</option>; })}
                                      </select>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                    <div>
                                      <label className="label-xs mb-1 block">{pc.costType === 'total' ? 'Cost' : 'Cost/m'}</label>
                                      <input type="text" inputMode="decimal" value={pc.costPerMetre || ''} onChange={function(e) { _updateTrackPiece(tIdx, pIdx, 'costPerMetre', e.target.value); }} className="w-full input-ghost text-xs" />
                                    </div>
                                    {pc.costType !== 'total' && <div>
                                      <label className="label-xs mb-1 block">Metres</label>
                                      <input type="text" inputMode="decimal" value={pc.metres || ''} onChange={function(e) { _updateTrackPiece(tIdx, pIdx, 'metres', e.target.value); }} className="w-full input-ghost text-xs" />
                                    </div>}
                                    {pc.costType !== 'total' && <div>
                                      <label className="label-xs mb-1 block">Dye/m</label>
                                      <input type="text" inputMode="decimal" value={pc.dyePerMetre || ''} onChange={function(e) { _updateTrackPiece(tIdx, pIdx, 'dyePerMetre', e.target.value); }} className="w-full input-ghost text-xs" />
                                    </div>}
                                    <div>
                                      <label className="label-xs mb-1 block">Emb</label>
                                      <input type="text" inputMode="decimal" value={pc.embroidery || ''} onChange={function(e) { _updateTrackPiece(tIdx, pIdx, 'embroidery', e.target.value); }} className="w-full input-ghost text-xs" />
                                    </div>
                                    <div>
                                      <label className="label-xs mb-1 block">Stitch</label>
                                      <input type="text" inputMode="decimal" value={pc.stitching || ''} onChange={function(e) { _updateTrackPiece(tIdx, pIdx, 'stitching', e.target.value); }} className="w-full input-ghost text-xs" />
                                    </div>
                                    <div>
                                      <label className="label-xs mb-1 block">Acc</label>
                                      <input type="text" inputMode="decimal" value={pc.accessories || ''} onChange={function(e) { _updateTrackPiece(tIdx, pIdx, 'accessories', e.target.value); }} className="w-full input-ghost text-xs" />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            <button onClick={function() { _addTrackPiece(tIdx); }} className="w-full py-2 rounded text-xs font-semibold" style={{ border: '1px dashed #494bd6', color: '#494bd6', background: 'rgba(73,75,214,0.04)' }}>+ Add Piece</button>
                            <div className="mt-2 text-xs font-mono font-bold text-right" style={{ color: '#795900' }}>Set COGS: {fmt(trackCogs)} ({(track.pieces || []).length} pieces)</div>
                          </div>
                        )}

                        {/* Pricing */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          <div>
                            <label className="label-xs mb-1 block">MRP (compare_at)</label>
                            <input type="text" inputMode="decimal" value={track.mrp || ''} onChange={function(e) { _updateTrack(tIdx, 'mrp', e.target.value); }} className="w-full input-ghost text-xs" />
                          </div>
                          <div>
                            <label className="label-xs mb-1 block">Selling Price</label>
                            <input type="text" inputMode="decimal" value={track.selling_price || ''} onChange={function(e) { _updateTrack(tIdx, 'selling_price', e.target.value); }} className="w-full input-ghost text-xs" />
                          </div>
                          <div>
                            <label className="label-xs mb-1 block">Discount%</label>
                            <div className="text-sm font-mono font-semibold pt-2" style={{ color: '#795900' }}>
                              {n(track.mrp) > 0 && n(track.selling_price) > 0 ? ((1 - n(track.selling_price) / n(track.mrp)) * 100).toFixed(0) + '%' : '—'}
                            </div>
                          </div>
                          <div>
                            <label className="label-xs mb-1 block">GM%</label>
                            <div className="text-sm font-mono font-semibold pt-2" style={{ color: trackGM >= 0.65 ? '#16a34a' : trackGM >= 0.50 ? '#d4a843' : '#dc2626' }}>
                              {trackSP > 0 ? (trackGM * 100).toFixed(1) + '%' : '—'}
                            </div>
                          </div>
                        </div>

                        {/* MTF Upcharge */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          <div>
                            <label className="label-xs mb-1 block">MTF Upcharge (₹)</label>
                            <input type="text" inputMode="decimal" value={track.mtf_upcharge !== undefined ? track.mtf_upcharge : DEFAULT_MTF_UPCHARGE} onChange={function(e) { _updateTrack(tIdx, 'mtf_upcharge', e.target.value); }} className="w-full input-ghost text-xs" />
                            <div className="text-xs text-gray-400 mt-1">Default: ₹{DEFAULT_MTF_UPCHARGE}</div>
                          </div>
                          <div>
                            <label className="label-xs mb-1 block">Ship Time (days)</label>
                            <select value={track.ship_time || 7} onChange={function(e) { _updateTrack(tIdx, 'ship_time', parseInt(e.target.value)); }} className="w-full input-ghost text-xs">
                              {SHIP_TIME_OPTIONS.map(function(d) { return <option key={d} value={d}>{d} days</option>; })}
                            </select>
                          </div>
                          <div>
                            <label className="label-xs mb-1 block">Order Type</label>
                            <select value={track.order_type || 'Made to Order'} onChange={function(e) { _updateTrack(tIdx, 'order_type', e.target.value); }} className="w-full input-ghost text-xs">
                              {ORDER_TYPE_OPTIONS.map(function(ot) { return <option key={ot} value={ot}>{ot}</option>; })}
                            </select>
                          </div>
                        </div>

                        {/* Available Sizes */}
                        <div className="mb-3">
                          <label className="label-xs mb-2 block">Available Sizes</label>
                          <div className="text-xs text-gray-400 mb-2">Toggle off sizes you don't want. SKUs auto-generated at Shopify push.</div>
                          <div className="flex flex-wrap gap-2">
                            {VALID_SIZES.map(function(sz) {
                              var selected = (track.selected_sizes || []).includes(sz);
                              return (
                                <button key={sz} onClick={function() {
                                  _updateTrack(tIdx, 'selected_sizes', selected
                                    ? (track.selected_sizes || []).filter(function(s) { return s !== sz; })
                                    : [...(track.selected_sizes || []), sz]);
                                }} className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all" style={selected ? { background: sz === 'MTF' ? 'rgba(212,168,67,0.25)' : '#795900', color: sz === 'MTF' ? '#795900' : '#fff', border: '1px solid #795900' } : { background: '#f5f1ea', color: '#a09080', border: '1px solid #d2c5b1' }}>
                                  {sz}{sz === 'MTF' ? ' ✨' : ''}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add Variant Track */}
                  <button onClick={function() {
                    setProductForm(function(prev) {
                      var arr = [...(prev.variant_tracks || [])];
                      arr.push({ label: '', mrp: 0, selling_price: 0, selling_price_auto: true, selected_sizes: [...VALID_SIZES], is_set: false, pieces: [], mtf_upcharge: DEFAULT_MTF_UPCHARGE, ship_time: 7, order_type: 'Made to Order', fabric_id: '', fabric_name: '', cost_per_metre: 0, metres: 0, cost_type: 'per_metre', dye_per_metre: 0, embroidery: 0, stitching: 0, accessories: 0 });
                      return { ...prev, variant_tracks: arr };
                    });
                  }} className="w-full py-3 rounded-lg text-sm font-semibold" style={{ border: '2px dashed #d4a843', color: '#795900', background: 'rgba(212,168,67,0.04)' }}>
                    + Add Variant Track
                  </button>

                </div>
              </div>

              {/* ═══════ TAB 3: SHOPIFY PREVIEW ═══════ */}
              <div style={{ display: productFormTab === 'shopify' ? '' : 'none' }}>
                <div className="space-y-6">

                  <div className="p-3 rounded-lg text-xs" style={{ background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.15)', color: '#795900' }}>
                    Enter Shopify SEO content. Generate via Cowork session, then paste here.
                  </div>

                  {/* Google SEO Preview */}
                  <div>
                    <div className="label-xs mb-3">Google Search Preview</div>
                    <div className="p-4 rounded-lg" style={{ background: '#ffffff', border: '1px solid #ddd' }}>
                      <div style={{ color: '#1a0dab', fontSize: '18px', marginBottom: '4px', cursor: 'pointer' }}>{productForm.seo_title || 'SEO Title'}</div>
                      <div style={{ color: '#006621', fontSize: '13px', marginBottom: '4px' }}>hilodesign.co › products › {productForm.handle || 'url-handle'}</div>
                      <div style={{ color: '#545454', fontSize: '13px' }}>{productForm.seo_description || 'SEO description will appear here.'}</div>
                    </div>
                  </div>

                  {/* Editable Shopify Fields */}
                  <div>
                    <div className="label-xs mb-3">Shopify Content</div>
                    <div className="space-y-4">
                      <div>
                        <label className="label-xs mb-1 block">Shopify Title</label>
                        <input type="text" value={productForm.seo_title || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, seo_title: e.target.value }; }); }} className="w-full input-ghost text-xs" />
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">URL Handle</label>
                        <input type="text" value={productForm.handle || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, handle: e.target.value }; }); }} className="w-full input-ghost text-xs" />
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">SEO Title <span className="text-gray-400">({(productForm.seo_title || '').length}/70)</span></label>
                        <input type="text" value={productForm.seo_title || ''} maxLength="70" onChange={function(e) { setProductForm(function(prev) { return { ...prev, seo_title: e.target.value }; }); }} className="w-full input-ghost text-xs" />
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">SEO Description <span className="text-gray-400">({(productForm.seo_description || '').length}/160)</span></label>
                        <textarea value={productForm.seo_description || ''} maxLength="160" onChange={function(e) { setProductForm(function(prev) { return { ...prev, seo_description: e.target.value }; }); }} className="w-full input-ghost text-xs" rows="2" />
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">Product Type</label>
                        <input type="text" value={productForm.product_type || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, product_type: e.target.value }; }); }} className="w-full input-ghost text-xs" />
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">Vendor</label>
                        <input type="text" value={productForm.vendor || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, vendor: e.target.value }; }); }} className="w-full input-ghost text-xs" />
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">Tags</label>
                        <input type="text" value={(productForm.tags || []).join(', ')} onChange={function(e) { setProductForm(function(prev) { return { ...prev, tags: e.target.value.split(',').map(function(t) { return t.trim(); }).filter(Boolean) }; }); }} className="w-full input-ghost text-xs" />
                      </div>
                      <div>
                        <label className="label-xs mb-1 block">Body HTML</label>
                        <textarea value={productForm.body_html || ''} onChange={function(e) { setProductForm(function(prev) { return { ...prev, body_html: e.target.value }; }); }} className="w-full input-ghost text-xs" rows="10" style={{ fontFamily: 'monospace' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>

            {/* Sticky Footer Actions */}
            <div className="p-6 pt-4" style={{ borderTop: '1px solid #d2c5b1' }}>
              <div className="form-footer-actions flex gap-3">
                <button
                  onClick={function() {
                    var toSave = { ...productForm, collection_id: selectedCollection.id, id: editingProduct?.id || undefined };
                    saveProduct(toSave);
                  }}
                  className="flex-1 py-3 rounded-lg font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #795900, #d4a843)' }}>
                  {editingProduct ? 'Update Product' : 'Create Product'}
                </button>
                <button
                  onClick={function() { setShowProductForm(false); setEditingProduct(null); resetProductForm(); }}
                  className="flex-1 py-3 rounded-lg font-semibold border border-gray-300 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};

// Resolve a fabric ID that may be old format ("2") to new format ("FA-002")
var resolveFabricId = function(id) {
  return _oldIdMap[id] || id;
};

// ─── Image upload helper (Supabase Storage) ──────────────────────────────────
export default CollectionsTab

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa, fetchAllProducts } from '../../lib/supabase'
import { fetchAllProductsLegacy } from '../../lib/catalogueV2'
import { productToSnake, productToCamel } from '../../lib/caseMapping'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, calcCogs, gmPct, effectiveSP } from '../../lib/helpers'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import OfferModal from './OfferModal'
import ProductView from '../catalogue/ProductView'
import ProductForm from '../catalogue/ProductForm'

const Offers = ({ fabrics, stitchingMaster, dyes, categories, consumption }) => {
  // Offers is an overlay on the live Catalogue V2: base products come from
  // catalogue_products (read-only here); offer tags live in product_offers.
  const [products, setProducts] = useState([]);   // V2 active catalogue (base)
  const [offers, setOffers] = useState([]);         // product_offers rows
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null); // 'view' | 'edit' | 'offer'
  const [showOffer, setShowOffer] = useState(null);

  // New filter states
  const [catFilter, setCatFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [colourFilter, setColourFilter] = useState('All');
  const [priceMinMRP, setPriceMinMRP] = useState('');
  const [priceMaxMRP, setPriceMaxMRP] = useState('');
  const [gmMinPct, setGmMinPct] = useState('');
  const [gmMaxPct, setGmMaxPct] = useState('');
  const [discMinPct, setDiscMinPct] = useState('');
  const [discMaxPct, setDiscMaxPct] = useState('');
  const [groupFilter, setGroupFilter] = useState('All');

  const byStyle = useMemo(() => { const m = {}; products.forEach(p => { if (p.styleCode) m[p.styleCode] = p; }); return m; }, [products]);

  // Collect unique values for filter dropdowns
  const allOfferProducts = useMemo(() => offers.map(o => {
    const base = byStyle[o.style_code] || {};
    return {
      ...base,
      id: o.style_code,
      styleCode: o.style_code,
      productTitle: base.productTitle || o.product_title,
      image_url: base.image_url || o.image_url,
      mrp: Number(base.mrp ?? o.mrp ?? 0),
      sellingPrice: Number(o.offer_price ?? base.sellingPrice ?? base.mrp ?? 0),
      isOffer: true,
      offerNote: o.offer_note || '',
      offerGroup: o.offer_group || null,
    };
  }), [offers, byStyle]);

  const allUsedCats = useMemo(() => ['All', ...new Set(allOfferProducts.map(p => p.category).filter(Boolean))], [allOfferProducts]);
  const allUsedColours = useMemo(() => ['All', ...new Set(allOfferProducts.map(p => p.colourPrimary).filter(Boolean))], [allOfferProducts]);
  const allUsedGroups = useMemo(() => ['All', ...new Set(allOfferProducts.map(p => p.offerGroup).filter(Boolean))], [allOfferProducts]);

  const offerProducts = useMemo(() => {
    let list = allOfferProducts;

    // Apply filters
    if (catFilter !== 'All') list = list.filter(p => p.category === catFilter);
    if (statusFilter !== 'All') list = list.filter(p => p.status === statusFilter);
    if (colourFilter !== 'All') list = list.filter(p => p.colourPrimary === colourFilter);
    if (groupFilter !== 'All') list = list.filter(p => p.offerGroup === groupFilter);

    // Price range filter (MRP)
    const minMRP = priceMinMRP ? parseFloat(priceMinMRP) : -Infinity;
    const maxMRP = priceMaxMRP ? parseFloat(priceMaxMRP) : Infinity;
    if (priceMinMRP || priceMaxMRP) list = list.filter(p => p.mrp >= minMRP && p.mrp <= maxMRP);

    // GM% range filter
    const minGM = gmMinPct ? parseFloat(gmMinPct) / 100 : -Infinity;
    const maxGM = gmMaxPct ? parseFloat(gmMaxPct) / 100 : Infinity;
    if (gmMinPct || gmMaxPct) {
      list = list.filter(p => {
        const sp = p.sellingPrice || p.mrp;
        const gm = gmPct(sp, calcCogs(p), p.mrp);
        return gm >= minGM && gm <= maxGM;
      });
    }

    // Discount % range filter
    const minDisc = discMinPct ? parseFloat(discMinPct) / 100 : -Infinity;
    const maxDisc = discMaxPct ? parseFloat(discMaxPct) / 100 : Infinity;
    if (discMinPct || discMaxPct) {
      list = list.filter(p => {
        const sp = p.sellingPrice || p.mrp;
        const disc = p.mrp > 0 ? (p.mrp - sp) / p.mrp : 0;
        return disc >= minDisc && disc <= maxDisc;
      });
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.styleCode||'').toLowerCase().includes(q) ||
        (p.productTitle||'').toLowerCase().includes(q) ||
        (p.productName||'').toLowerCase().includes(q) ||
        (p.colourPrimary||'').toLowerCase().includes(q) ||
        (p.offerNote||'').toLowerCase().includes(q) ||
        (p.offerGroup||'').toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortBy !== 'default') {
      list = [...list].sort((a, b) => {
        const cogsA = calcCogs(a), cogsB = calcCogs(b);
        const spA = a.sellingPrice || a.mrp, spB = b.sellingPrice || b.mrp;
        const gmA = gmPct(spA, cogsA, a.mrp), gmB = gmPct(spB, cogsB, b.mrp);
        const discA = a.mrp > 0 ? (a.mrp - spA) / a.mrp : 0;
        const discB = b.mrp > 0 ? (b.mrp - spB) / b.mrp : 0;
        if (sortBy === 'gm_desc') return gmB - gmA;
        if (sortBy === 'gm_asc') return gmA - gmB;
        if (sortBy === 'disc_desc') return discB - discA;
        if (sortBy === 'disc_asc') return discA - discB;
        if (sortBy === 'sp_asc') return spA - spB;
        if (sortBy === 'sp_desc') return spB - spA;
        return 0;
      });
    }
    return list;
  }, [allOfferProducts, search, sortBy, catFilter, statusFilter, colourFilter, groupFilter, priceMinMRP, priceMaxMRP, gmMinPct, gmMaxPct, discMinPct, discMaxPct]);

  const loadAll = useCallback(async () => {
    const [cat, off] = await Promise.all([
      fetchAllProductsLegacy(),
      supa.from('product_offers').select('*').eq('is_active', true),
    ]);
    setProducts(cat || []);
    setOffers(off.data || []);
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const saveOffer = async (updated) => {
    try {
      const style = updated.styleCode || updated.id;
      const { error } = await supa.from('product_offers').upsert({
        style_code: style,
        product_title: updated.productTitle || null,
        image_url: updated.image_url || (updated.shopify_images && updated.shopify_images[0]) || null,
        mrp: Number(updated.mrp) || null,
        offer_price: Number(updated.sellingPrice) || null,
        offer_note: updated.offerNote || '',
        offer_group: updated.offerGroup || null,
        is_active: true,
        updated_by: window._currentUserName || null,
      }, { onConflict: 'style_code' });
      if (error) throw error;
      await loadAll();
    } catch (e) {
      console.error('[HILO] Offers saveOffer error:', e);
      alert('Failed to save offer: ' + (e.message || e));
    }
    setShowOffer(null);
    setShowTagPicker(false);
    setSelected(prev => prev && (prev.id === (updated.styleCode || updated.id)) ? { ...prev, ...updated } : prev);
  };

  const removeOffer = async (id) => {
    if (!confirm('Remove offer tag from this product?')) return;
    try {
      const { error } = await supa.from('product_offers').delete().eq('style_code', id);
      if (error) throw error;
      await loadAll();
    } catch (e) {
      console.error('[HILO] Offers removeOffer error:', e);
      alert('Failed to remove offer: ' + (e.message || e));
    }
  };

  // Summary stats — use SP (which is the offer price)
  const avgGM = offerProducts.length > 0
    ? offerProducts.reduce((s, p) => s + gmPct(p.sellingPrice || p.mrp, calcCogs(p), p.mrp), 0) / offerProducts.length : 0;
  const avgDisc = offerProducts.length > 0
    ? offerProducts.reduce((s, p) => { const sp = p.sellingPrice || p.mrp; return s + (p.mrp > 0 ? (p.mrp - sp)/p.mrp : 0); }, 0) / offerProducts.length : 0;

  // Group summaries
  const groupSummaries = useMemo(() => {
    const summaries = {};
    allUsedGroups.filter(g => g !== 'All').forEach(group => {
      const groupProds = allOfferProducts.filter(p => p.offerGroup === group);
      if (groupProds.length > 0) {
        const avgGMGroup = groupProds.reduce((s, p) => s + gmPct(p.sellingPrice || p.mrp, calcCogs(p), p.mrp), 0) / groupProds.length;
        const avgDiscGroup = groupProds.reduce((s, p) => { const sp = p.sellingPrice || p.mrp; return s + (p.mrp > 0 ? (p.mrp - sp)/p.mrp : 0); }, 0) / groupProds.length;
        summaries[group] = { count: groupProds.length, avgGM: avgGMGroup, avgDisc: avgDiscGroup };
      }
    });
    return summaries;
  }, [allUsedGroups, allOfferProducts]);

  const activeFiltersCount = [catFilter !== 'All', statusFilter !== 'All', colourFilter !== 'All', groupFilter !== 'All',
                               priceMinMRP !== '', priceMaxMRP !== '', gmMinPct !== '', gmMaxPct !== '',
                               discMinPct !== '', discMaxPct !== '', search !== '', sortBy !== 'default'].filter(Boolean).length;

  return (
    <div className="fade-in p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 style={{fontFamily:"Manrope,sans-serif",fontSize:"1.5rem",fontWeight:800,letterSpacing:"-0.02em",color:"#1b1c1a",lineHeight:1.1}} className="sm:text-3xl">Active Offers</h1>
          <p className="page-subtitle mt-1">Curation</p>
        </div>
        <button onClick={() => { setTagSearch(''); setShowTagPicker(true); }} className="btn-gold px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5">
          <Icon name="tag" cls="w-4 h-4" /> Tag a product
        </button>
      </div>

      {/* Summary cards */}
      {allOfferProducts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mb-5">
          {[
            ['On Offer', allOfferProducts.length, '#ef4444'],
            ['Avg. Discount', `${(avgDisc*100).toFixed(1)}%`, '#f97316'],
            ['Avg. GM%', `${(avgGM*100).toFixed(1)}%`, avgGM > 0.35 ? '#16a34a' : '#ca8a04'],
          ].map(([l,v,col]) => (
            <div key={l} className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-4" style={{boxShadow:'0 8px 24px rgba(27,28,26,0.05)'}}>
              <div style={{fontSize:8,fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(27,28,26,0.4)',marginBottom:6}} className="sm:mb-8">{l}</div>
              <div style={{fontFamily:'Manrope,sans-serif',fontSize:'1rem',fontWeight:800,color:col,lineHeight:1}} className="sm:text-xl">{v}</div>
            </div>
          ))}
        </div>
      )}

      {allOfferProducts.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl shadow-sm">
          <div className="text-4xl mb-3">🏷️</div>
          <div className="font-semibold text-gray-600 text-lg mb-1">No products on offer yet</div>
          <div className="text-gray-400 text-sm mb-4">Tag any catalogue product with an offer price</div>
          <button onClick={() => { setTagSearch(''); setShowTagPicker(true); }} className="btn-gold px-4 py-2 rounded-xl text-sm font-semibold">Tag a product</button>
        </div>
      ) : (
        <>
          {/* Group pills — show available groups */}
          {allUsedGroups.length > 1 && (
            <div className="overflow-x-auto -mx-4 sm:mx-0 pb-1 mb-4">
              <div className="flex gap-1.5 px-4 sm:px-0 min-w-max">
                {allUsedGroups.map(g => {
                  const summary = summaries[g];
                  const count = g === 'All' ? allOfferProducts.length : (summary?.count || 0);
                  return (
                    <button key={g} onClick={() => setGroupFilter(g)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${groupFilter === g ? 'btn-gold border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {g} {<span className="ml-1 opacity-60">{count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search + sort */}
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Icon name="search" cls="w-4 h-4 absolute left-3 top-2.5 text-gray-400 flex-shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full border border-gray-200 rounded-lg sm:rounded-xl pl-9 pr-3 py-2 sm:py-2.5 text-xs sm:text-sm" />
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="border border-gray-200 rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-2 sm:py-2.5 text-xs text-gray-500 flex-shrink-0 whitespace-nowrap">
              <option value="default">Sort: Default</option>
              <option value="gm_desc">GM% High</option>
              <option value="gm_asc">GM% Low</option>
              <option value="disc_desc">Disc High</option>
              <option value="disc_asc">Disc Low</option>
              <option value="sp_desc">Price High</option>
              <option value="sp_asc">Price Low</option>
            </select>
          </div>

          {/* Filters row */}
          <div className="flex gap-2 mb-4 flex-wrap overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 pb-1">
            <select value={catFilter} onChange={e => { setCatFilter(e.target.value); }}
              className={`border rounded-lg px-2 py-1.5 text-xs flex-shrink-0 whitespace-nowrap ${catFilter !== 'All' ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`}>
              <option value="All">Cat</option>
              {allUsedCats.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
            </select>

            <select value={colourFilter} onChange={e => { setColourFilter(e.target.value); }}
              className={`border rounded-lg px-2 py-1.5 text-xs flex-shrink-0 whitespace-nowrap ${colourFilter !== 'All' ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`}>
              <option value="All">Color</option>
              {allUsedColours.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
            </select>

            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); }}
              className={`border rounded-lg px-2 py-1.5 text-xs flex-shrink-0 whitespace-nowrap ${statusFilter !== 'All' ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`}>
              <option value="All">Status</option>
              {['Active','Inactive'].map(s => <option key={s}>{s}</option>)}
            </select>

            {/* Price range */}
            <input type="number" placeholder="Min" value={priceMinMRP} onChange={e => setPriceMinMRP(e.target.value)}
              className={`border rounded-lg px-2 py-1.5 text-xs w-16 flex-shrink-0 ${priceMinMRP ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`} />
            <input type="number" placeholder="Max" value={priceMaxMRP} onChange={e => setPriceMaxMRP(e.target.value)}
              className={`border rounded-lg px-2 py-1.5 text-xs w-16 flex-shrink-0 ${priceMaxMRP ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`} />

            {/* GM% range */}
            <input type="number" placeholder="Min" value={gmMinPct} onChange={e => setGmMinPct(e.target.value)}
              className={`border rounded-lg px-2 py-1.5 text-xs w-16 flex-shrink-0 ${gmMinPct ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`} />
            <input type="number" placeholder="Max" value={gmMaxPct} onChange={e => setGmMaxPct(e.target.value)}
              className={`border rounded-lg px-2 py-1.5 text-xs w-16 flex-shrink-0 ${gmMaxPct ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`} />

            {/* Discount% range */}
            <input type="number" placeholder="Min" value={discMinPct} onChange={e => setDiscMinPct(e.target.value)}
              className={`border rounded-lg px-2 py-1.5 text-xs w-16 flex-shrink-0 ${discMinPct ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`} />
            <input type="number" placeholder="Max" value={discMaxPct} onChange={e => setDiscMaxPct(e.target.value)}
              className={`border rounded-lg px-2 py-1.5 text-xs w-16 flex-shrink-0 ${discMaxPct ? 'border-gold-500 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`} />

            {activeFiltersCount > 0 && (
              <button onClick={() => { setCatFilter('All'); setStatusFilter('All'); setColourFilter('All'); setGroupFilter('All'); setPriceMinMRP(''); setPriceMaxMRP(''); setGmMinPct(''); setGmMaxPct(''); setDiscMinPct(''); setDiscMaxPct(''); setSortBy('default'); setSearch(''); }}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1.5 border border-red-200 rounded-lg bg-red-50">
                ✕ Clear filters ({activeFiltersCount})
              </button>
            )}
          </div>

          {/* Manage Groups section */}
          {allUsedGroups.length > 1 && Object.keys(summaries).length > 0 && (
            <div className="mb-5 bg-white rounded-lg sm:rounded-xl shadow-sm overflow-hidden">
              <div className="px-3 sm:px-6 py-3 sm:py-4 border-b">
                <h3 className="font-semibold text-gray-700 text-xs sm:text-sm">Offer Group Summary</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 p-3 sm:p-6">
                {Object.entries(summaries).map(([group, stats]) => (
                  <div key={group} className="border border-gray-200 rounded-lg p-3 sm:p-4">
                    <div className="font-semibold text-gray-800 text-xs sm:text-sm mb-2 sm:mb-3">{group}</div>
                    <div className="space-y-1 sm:space-y-2 text-xs">
                      <div className="flex justify-between text-gray-600">
                        <span>Count:</span>
                        <span className="font-semibold text-gray-800">{stats.count}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Avg. Discount:</span>
                        <span className="font-semibold text-orange-600">{(stats.avgDisc*100).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Avg. GM%:</span>
                        <span className={`font-semibold ${stats.avgGM > 0.35 ? 'text-green-600' : stats.avgGM > 0.2 ? 'text-amber-600' : 'text-red-600'}`}>
                          {(stats.avgGM*100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {offerProducts.map(p => {
              const cogs = calcCogs(p);
              const sp = p.sellingPrice || p.mrp;
              const offerGM = gmPct(sp, cogs, p.mrp);
              const discPct = p.mrp > 0 ? ((p.mrp - sp) / p.mrp) * 100 : 0;
              const offerEffSP = effectiveSP(sp, p.mrp);
              return (
                <div key={p.id} className="bg-white rounded-xl p-4 shadow-sm" onClick={() => { setSelected(p); setModal('view'); }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-gray-800 text-sm">{p.productTitle || p.productName}</div>
                      <div className="text-xs font-mono text-blue-600 mt-0.5">{p.styleCode}</div>
                    </div>
                    <span className="badge bg-red-50 text-red-600 ml-2 flex-shrink-0">Offer</span>
                  </div>
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    <span className="badge bg-purple-50 text-purple-700 text-xs">{p.category}</span>
                    {p.offerGroup && <span className="badge bg-indigo-50 text-indigo-700 text-xs">{p.offerGroup}</span>}
                    {p.offerNote && <span className="text-xs text-gray-400 italic">{p.offerNote}</span>}
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-center text-xs pt-2 border-t border-gray-50 mb-3">
                    <div><div className="text-gray-400 text-[9px] sm:text-xs">MRP</div><div className="font-semibold text-gray-500 line-through text-[10px] sm:text-xs">{fmt(p.mrp)}</div></div>
                    <div><div className="text-red-400 font-medium text-[9px] sm:text-xs">SP</div><div className="font-bold text-red-600 text-[10px] sm:text-xs">{fmt(sp)}</div></div>
                    <div><div className="text-orange-400 text-[9px] sm:text-xs">Disc</div><div className="font-semibold text-orange-600 text-[10px] sm:text-xs">{discPct.toFixed(1)}%</div></div>
                    <div><div className="text-gray-400 text-[9px] sm:text-xs">GM</div><div className={`font-semibold text-[10px] sm:text-xs ${offerGM > 0.4 ? 'text-green-600' : offerGM > 0.2 ? 'text-amber-600' : 'text-red-500'}`}>{(offerGM*100).toFixed(1)}%</div></div>
                  </div>
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setShowOffer(p)} className="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 flex items-center justify-center gap-1">
                      <Icon name="edit" cls="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => setShowOffer(p)} className="flex-1 py-1.5 rounded-lg border border-red-100 text-xs text-red-500 hover:bg-red-50 flex items-center justify-center gap-1">
                      <Icon name="tag" cls="w-3.5 h-3.5" /> Offer
                    </button>
                    <button onClick={() => removeOffer(p.id)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-400 hover:bg-gray-50">
                      <Icon name="trash" cls="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-white rounded-lg sm:rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-xs sm:text-sm" style={{minWidth:1000}}>
              <thead className="bg-gray-50 border-b">
                <tr className="text-gray-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Style Code</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Group</th>
                  <th className="px-4 py-3 text-right">COGS</th>
                  <th className="px-4 py-3 text-right">MRP</th>
                  <th className="px-4 py-3 text-right text-red-500">SP</th>
                  <th className="px-4 py-3 text-right text-orange-500">Disc%</th>
                  <th className="px-4 py-3 text-right text-indigo-500">Eff. SP</th>
                  <th className="px-4 py-3 text-right">GM% at Offer</th>
                  <th className="px-4 py-3 text-left">Note</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {offerProducts.map(p => {
                  const cogs = calcCogs(p);
                  const sp = p.sellingPrice || p.mrp;
                  const offerGM = gmPct(sp, cogs, p.mrp);
                  const discPct = p.mrp > 0 ? ((p.mrp - sp) / p.mrp) * 100 : 0;
                  const offerEffSP = effectiveSP(sp, p.mrp);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelected(p); setModal('view'); }}>
                      <td className="px-4 py-3 font-mono text-xs text-blue-600 font-semibold">{p.styleCode}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-medium text-gray-800 truncate">{p.productTitle || p.productName || '—'}</div>
                        {p.colourPrimary && <div className="text-xs text-gray-400">{p.colourPrimary}</div>}
                      </td>
                      <td className="px-4 py-3"><span className="badge bg-purple-50 text-purple-700">{p.category}</span></td>
                      <td className="px-4 py-3">{p.offerGroup ? <span className="badge bg-indigo-50 text-indigo-700 text-xs">{p.offerGroup}</span> : <span className="text-xs text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 text-right text-gray-600 text-xs">{cogs > 0 ? fmt(n(cogs).toFixed(0)) : '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-500 text-sm line-through">{p.mrp > 0 ? fmt(p.mrp) : '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-red-600">{fmt(sp)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-orange-600">{discPct.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right text-indigo-600 font-medium">{offerEffSP > 0 ? fmt(offerEffSP.toFixed(0)) : '—'}</td>
                      <td className={`px-4 py-3 text-right font-bold ${offerGM > 0.4 ? 'text-green-600' : offerGM > 0.2 ? 'text-amber-600' : 'text-red-500'}`}>
                        {(offerGM*100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate">{p.offerNote || '—'}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button onClick={() => setShowOffer(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Edit product">
                            <Icon name="edit" cls="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setShowOffer(p)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500" title="Edit offer">
                            <Icon name="tag" cls="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeOffer(p.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500" title="Remove offer">
                            <Icon name="close" cls="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* View / Edit modals — same as Catalogue */}
      {selected && modal === 'view' && (
        <Modal title={`${selected.styleCode} — ${selected.productTitle || selected.productName || ''}`} onClose={() => setModal(null)} wide>
          <ProductView product={selected} onEdit={() => { setModal(null); setShowOffer(selected); }} />
        </Modal>
      )}
      {showOffer && (
        <OfferModal product={showOffer} onSave={saveOffer} onClose={() => setShowOffer(null)} />
      )}
      {showTagPicker && (
        <Modal title="Tag a product as offer" onClose={() => setShowTagPicker(false)}>
          <div className="relative mb-3">
            <Icon name="search" cls="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input autoFocus value={tagSearch} onChange={e => setTagSearch(e.target.value)} placeholder="Search by name, style code or colour…"
              className="w-full border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm" />
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {(() => {
              const offered = new Set(offers.map(o => o.style_code));
              const q = tagSearch.trim().toLowerCase();
              const list = products.filter(p => p.styleCode && !offered.has(p.styleCode) && (!q ||
                [p.productTitle, p.styleCode, p.colourPrimary, p.category].filter(Boolean).join(' ').toLowerCase().includes(q)));
              if (!list.length) return <div className="text-center py-8 text-sm text-gray-400">No products found.</div>;
              return list.slice(0, 60).map(p => (
                <button key={p.styleCode} onClick={() => { setShowTagPicker(false); setShowOffer(p); }}
                  className="w-full flex items-center gap-3 py-2.5 px-1 text-left hover:bg-gray-50">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 bg-cover bg-center flex-shrink-0"
                    style={{ backgroundImage: (p.image_url || (p.shopify_images && p.shopify_images[0])) ? `url('${p.image_url || p.shopify_images[0]}')` : 'none' }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800 truncate">{p.productTitle || p.styleCode}</div>
                    <div className="text-xs text-gray-400">{p.styleCode}{p.category ? ' · ' + p.category : ''}</div>
                  </div>
                  <div className="text-xs font-semibold text-gray-500 flex-shrink-0">₹{Number(p.mrp || 0).toLocaleString('en-IN')}</div>
                </button>
              ));
            })()}
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Masters ──────────────────────────────────────────────────────────────────

export default Offers

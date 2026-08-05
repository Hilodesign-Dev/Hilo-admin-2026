import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa, fetchAllProducts } from '../../lib/supabase'
import { productToSnake, productToCamel } from '../../lib/caseMapping'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, calcCogs, calcPieceCogs } from '../../lib/helpers'
import { VARIANT_SIZES, generateSKU } from '../../lib/constants'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

const ShopifySyncModal = ({ products, setProducts, categories, onClose }) => {
  // Phases: 'choose' → pick Sync All vs Select | 'fetching' | 'selecting' | 'importing' | 'done' | 'error'
  const [phase, setPhase] = useState('choose');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  // For selective mode
  const [shopifyData, setShopifyData] = useState(null); // { products, collections }
  const [enriched, setEnriched] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState('missing'); // 'missing' | 'all'

  // Fetch from Shopify → writes to DB, then read from shopify_products table
  const fetchShopify = async () => {
    setStatus('Syncing catalogue from Shopify...');
    const { data, error: err } = await supa.functions.invoke('sync-catalogue', { body: {} });
    if (err) throw new Error(err.message || 'Sync failed');
    if (data?.error) throw new Error(data.error);

    // Read products from DB (sync-catalogue v7 no longer returns full product array)
    setStatus('Loading synced products...');
    const { data: dbProducts, error: dbErr } = await supa
      .from('shopify_products')
      .select('*')
      .order('title');
    if (dbErr) throw new Error('Failed to load products from database: ' + dbErr.message);

    // Transform DB rows to match the enriched format the rest of this component expects
    const products = (dbProducts || []).map(p => {
      const rawTags = p.tags || '';
      const tags = typeof rawTags === 'string'
        ? rawTags.split(',').map(t => t.trim()).filter(Boolean)
        : Array.isArray(rawTags) ? rawTags : [];
      const images = Array.isArray(p.images)
        ? p.images.map(img => typeof img === 'string' ? img : img?.src).filter(Boolean)
        : [];
      return {
        shopify_product_id: p.id,
        title: p.title || '',
        handle: p.handle || '',
        product_type: p.product_type || '',
        vendor: p.vendor || '',
        status: p.status,
        tags,
        collections: Array.isArray(p.collections) ? p.collections : [],
        variants: Array.isArray(p.variants) ? p.variants.map(v => ({
          id: v.id, sku: v.sku || '', price: v.price, compare_at_price: v.compare_at_price,
          title: v.title, inventory_quantity: v.inventory_quantity, weight: v.weight, barcode: v.barcode,
        })) : [],
        images,
        options: p.options || [],
        body_html: p.body_html || '',
        created_at_shopify: p.created_at_shopify || '',
        updated_at_shopify: p.updated_at_shopify || '',
        published_at: p.published_at || '',
        style_code: p.style_code || '',
      };
    });

    // Extract unique collections from product data (no longer reads from app_state)
    const collSet = new Set();
    (dbProducts || []).forEach(p => {
      if (Array.isArray(p.collections)) p.collections.forEach(c => { if (c) collSet.add(typeof c === 'string' ? c : JSON.stringify(c)); });
    });
    const collections = Array.from(collSet).map(c => { try { return JSON.parse(c); } catch { return c; } });

    return {
      products,
      collections,
      total_products: data.total_products,
      total_collections: data.total_collections,
    };
  };

  // Run sync-all: fetch + auto-import everything
  const runSyncAll = async () => {
    setPhase('fetching')
    setStatus('Syncing catalogue from Shopify...')
    try {
      // v8 edge function does ALL the work server-side:
      // mirror Shopify → shopify_products + reconcile design_products
      // (refresh prices/inventory, backfill links, auto-create new rows,
      // flag duplicates/missing). Allowlist-only writes — COGS untouched.
      const { data, error: err } = await supa.functions.invoke('sync-catalogue', { body: {} })
      if (err) throw new Error(err.message || 'Sync failed')
      if (data?.error) throw new Error(data.error)

      setStatus('Refreshing local product cache...')
      const fresh = await fetchAllProducts()
      if (fresh) setProducts(fresh.map(productToCamel))

      setResult({
        total: data.total_shopify_products || 0,
        updated: data.design_products_updated || 0,
        added: data.design_products_auto_created || 0,
        backfilled: data.design_products_backfilled || 0,
        needsReview: data.design_products_needs_review || 0,
        breakdown: data.review_breakdown || {},
        collections: data.total_collections || 0,
        message: data.message || '',
      })
      setPhase('done')
    } catch (e) {
      setError(e.message || 'Sync failed')
      setPhase('error')
    }
  }

  // Fetch for selective mode
  const runFetchForSelect = async () => {
    setPhase('fetching');
    try {
      const data = await fetchShopify();
      setShopifyData(data);
      const shopifyProducts = data.products || [];
      const { skuMap, allStyleCodes, spidMap } = _buildIndexes(products);

      const list = shopifyProducts.map(sp => {
        const existing = _findExisting(sp, skuMap, allStyleCodes, spidMap);
        return {
          ...sp,
          inCatalogue: !!existing,
          baseCode: _deriveBaseCode(sp),
          guessedCategory: _guessCat(sp, categories),
        };
      });
      setEnriched(list);
      // Auto-select all missing
      setSelected(new Set(list.filter(p => !p.inCatalogue).map(p => p.shopify_product_id)));
      setPhase('selecting');
    } catch (e) {
      setError(e.message || 'Sync failed');
      setPhase('error');
    }
  };

  // Import selected products
  const importSelected = async () => {
    const toImport = enriched.filter(p => selected.has(p.shopify_product_id) && !p.inCatalogue);
    if (toImport.length === 0) { onClose(); return; }

    const { skuMap } = _buildIndexes(products);
    var updatedProducts = [...products];
    var added = 0;
    for (const sp of toImport) {
      const baseCode = sp.baseCode;
      if (skuMap[baseCode.toUpperCase()]) continue;
      const newProd = _buildNewProduct(sp, categories);
      newProd.styleCode = baseCode;
      updatedProducts.push(newProd);
      skuMap[baseCode.toUpperCase()] = newProd;
      added++;
    }
    // Persist to Supabase
    try {
      const newRows = updatedProducts.slice(products.length).map(p => productToSnake(p));
      if (newRows.length > 0) {
        for (let i = 0; i < newRows.length; i += 50) {
          const batch = newRows.slice(i, i + 50);
          await supa.from('design_products').upsert(batch, { onConflict: 'id' });
        }
      }
    } catch (e) {
      console.error('[HILO] Selective import DB write error:', e);
    }
    // Refresh from DB
    const freshProducts = await fetchAllProducts();
    if (freshProducts) setProducts(freshProducts.map(productToCamel));
    else setProducts(updatedProducts);
    setResult({ added, updated: 0, skipped: enriched.length - added, total: enriched.length, collections: (shopifyData?.collections || []).length });
    setPhase('done');
  };

  const missingCount = enriched.filter(p => !p.inCatalogue).length;
  const displayed = useMemo(() => {
    var list = filterMode === 'missing' ? enriched.filter(p => !p.inCatalogue) : enriched;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q) || p.baseCode.toLowerCase().includes(q) || (p.collections||[]).some(c => c.toLowerCase().includes(q)));
    }
    return list;
  }, [enriched, filterMode, search]);

  return (
    <Modal title="Sync Catalogue from Shopify" onClose={onClose} wide>
      <div className="py-2" style={{maxHeight:'75vh',overflow:'auto'}}>

        {/* Step 1: Choose mode */}
        {phase === 'choose' && (
          <div className="space-y-4 py-4">
            <div className="text-center mb-2">
              <div className="text-sm text-gray-500">How would you like to sync?</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button onClick={runSyncAll}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-gray-200 hover:border-primary hover:bg-amber-50 transition-all text-left">
                <div className="text-3xl">⚡</div>
                <div>
                  <div className="font-semibold text-on-surface text-sm" style={{fontFamily:'Manrope,sans-serif'}}>Sync All</div>
                  <div className="text-xs text-gray-500 mt-1">Import all missing products and update images on existing ones. One click, fully automatic.</div>
                </div>
              </button>
              <button onClick={runFetchForSelect}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-gray-200 hover:border-primary hover:bg-amber-50 transition-all text-left">
                <div className="text-3xl">🔍</div>
                <div>
                  <div className="font-semibold text-on-surface text-sm" style={{fontFamily:'Manrope,sans-serif'}}>Sync Select</div>
                  <div className="text-xs text-gray-500 mt-1">Browse Shopify products, search, and pick which ones to import into your catalogue.</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {phase === 'fetching' && (
          <div className="flex flex-col items-center py-10 gap-4">
            <div className="animate-spin text-4xl">🔄</div>
            <div className="text-sm text-gray-600 font-medium">{status}</div>
            <div className="text-xs text-gray-400">This may take a moment for large catalogues...</div>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600">Close</button>
            </div>
          </div>
        )}

        {/* Selective mode: browse + pick */}
        {phase === 'selecting' && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="flex items-center justify-between flex-wrap gap-2 bg-surface-container-low rounded-xl px-4 py-3">
              <div className="text-sm text-gray-600">
                <span className="font-semibold text-on-surface">{enriched.length}</span> on Shopify · <span className="font-semibold text-primary">{missingCount}</span> missing
              </div>
              <div className="flex gap-2">
                <button onClick={() => setFilterMode('missing')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filterMode === 'missing' ? 'btn-gold' : 'bg-white border border-gray-200 text-gray-500'}`}>
                  Missing ({missingCount})
                </button>
                <button onClick={() => setFilterMode('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filterMode === 'all' ? 'btn-gold' : 'bg-white border border-gray-200 text-gray-500'}`}>
                  All ({enriched.length})
                </button>
              </div>
            </div>
            {/* Search + bulk */}
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Icon name="search" cls="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, SKU, collection..."
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm" />
              </div>
              <button onClick={() => setSelected(new Set(displayed.filter(p=>!p.inCatalogue).map(p=>p.shopify_product_id)))} className="text-xs text-primary hover:underline">Select all</button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:underline">Clear</button>
            </div>
            {/* Product list */}
            <div className="space-y-1" style={{maxHeight:'40vh',overflow:'auto'}}>
              {displayed.map(sp => (
                <div key={sp.shopify_product_id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-all cursor-pointer ${
                    sp.inCatalogue ? 'bg-gray-50 border-gray-100 opacity-50' :
                    selected.has(sp.shopify_product_id) ? 'bg-amber-50 border-primary' : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => { if (sp.inCatalogue) return; setSelected(prev => { const n = new Set(prev); n.has(sp.shopify_product_id) ? n.delete(sp.shopify_product_id) : n.add(sp.shopify_product_id); return n; }); }}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    sp.inCatalogue ? 'border-green-300 bg-green-100' :
                    selected.has(sp.shopify_product_id) ? 'border-primary bg-primary' : 'border-gray-300'
                  }`}>
                    {(sp.inCatalogue || selected.has(sp.shopify_product_id)) && <span className={`text-xs ${sp.inCatalogue ? 'text-green-600' : 'text-white'}`}>✓</span>}
                  </div>
                  {sp.images[0] ? (
                    <img src={sp.images[0]} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-gray-100" onError={e => e.target.style.display='none'} />
                  ) : (
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{background:'#f5f4f0'}}>📷</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-on-surface truncate">{sp.title}</div>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <span className="font-mono text-xs text-gray-400">{sp.baseCode || '—'}</span>
                      {sp.variants[0]?.price && <span className="text-xs text-gray-400">₹{sp.variants[0].price}</span>}
                      <span className="badge-gold text-xs">{sp.guessedCategory}</span>
                      {sp.inCatalogue && <span className="text-xs text-green-600 font-medium">✓ In catalogue</span>}
                    </div>
                  </div>
                </div>
              ))}
              {displayed.length === 0 && <div className="text-center py-6 text-gray-400 text-sm">No products found</div>}
            </div>
            {/* Import bar */}
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 sticky bottom-0">
              <span className="text-sm text-amber-800 font-medium">{selected.size} selected</span>
              <button onClick={importSelected} disabled={selected.size === 0}
                className="btn-gold px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40">
                Import {selected.size} Product{selected.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* Done */}
        {phase === 'done' && result && (
          <div className="space-y-5 py-2">
            <div className="text-center">
              <div className="text-4xl mb-3">✅</div>
              <div className="text-lg font-semibold text-on-surface" style={{fontFamily:'Manrope,sans-serif'}}>Catalogue synced</div>
              <div className="text-sm text-gray-500 mt-1">{result.total} Shopify products · {result.collections} collections</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-3 text-center">
                <div className="text-2xl font-bold text-blue-700" style={{fontFamily:'Inter,sans-serif'}}>{result.updated}</div>
                <div className="text-[11px] text-blue-600 font-medium mt-0.5">Prices refreshed</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-3 text-center">
                <div className="text-2xl font-bold text-green-700" style={{fontFamily:'Inter,sans-serif'}}>{result.added}</div>
                <div className="text-[11px] text-green-600 font-medium mt-0.5">Auto-created</div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-3 text-center">
                <div className="text-2xl font-bold text-purple-700" style={{fontFamily:'Inter,sans-serif'}}>{result.backfilled}</div>
                <div className="text-[11px] text-purple-600 font-medium mt-0.5">Linked to Shopify</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 text-center">
                <div className="text-2xl font-bold text-amber-700" style={{fontFamily:'Inter,sans-serif'}}>{result.needsReview}</div>
                <div className="text-[11px] text-amber-600 font-medium mt-0.5">Need review</div>
              </div>
            </div>
            {result.needsReview > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-900">
                <div className="font-semibold mb-2">{result.needsReview} row{result.needsReview !== 1 ? 's' : ''} need your review.</div>
                <div className="text-xs text-amber-800 space-y-0.5">
                  {Number(result.breakdown?.no_shopify_match) > 0 && <div>· {result.breakdown.no_shopify_match} with no Shopify match</div>}
                  {Number(result.breakdown?.ambiguous_match) > 0 && <div>· {result.breakdown.ambiguous_match} ambiguous matches</div>}
                  {Number(result.breakdown?.duplicate_style_code) > 0 && <div>· {result.breakdown.duplicate_style_code} duplicate style codes under same Shopify product</div>}
                  {Number(result.breakdown?.shopify_product_missing) > 0 && <div>· {result.breakdown.shopify_product_missing} Shopify products no longer exist</div>}
                  {Number(result.breakdown?.newly_synced) > 0 && <div>· {result.breakdown.newly_synced} newly auto-created — add COGS</div>}
                </div>
                <button onClick={() => { try { window.dispatchEvent(new CustomEvent('hilo:goto-review-queue')) } catch(_){}; onClose(); }}
                  className="mt-3 text-xs font-semibold text-amber-900 hover:underline">Open review queue →</button>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={onClose} className="btn-gold px-5 py-2.5 rounded-xl text-sm font-medium">Done</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

// ─── Helper functions ─────────────────────────────────────────────────────────

/** Derive a style code from a Shopify product (first variant SKU base, handle, or product ID) */
function _deriveBaseCode(sp) {
  // Try first variant SKU — strip size suffix (e.g. "HILO-001-S" → "HILO-001")
  if (sp.variants && sp.variants.length > 0 && sp.variants[0].sku) {
    const sku = sp.variants[0].sku.trim();
    // Remove trailing size suffixes like -S, -M, -L, -XL, -XXL, -MTF, -OS
    const base = sku.replace(/-(S|M|L|XL|XXL|MTF|OS|XXXL|2XL|3XL|FREE)$/i, '');
    if (base) return base;
  }
  // Fallback: use handle (URL slug) uppercased
  if (sp.handle) return sp.handle.toUpperCase().replace(/-/g, '_').substring(0, 30);
  // Last resort: use shopify product ID
  return `SHOP-${String(sp.shopify_product_id).slice(-8)}`;
}

/** Guess category from product_type, tags, or title */
function _guessCat(sp, categories) {
  const catNames = (categories || []).map(c => (c.name || c).toLowerCase());
  // Check product_type first
  if (sp.product_type) {
    const pt = sp.product_type.toLowerCase();
    const match = catNames.find(c => pt.includes(c) || c.includes(pt));
    if (match) return (categories || []).find(c => (c.name || c).toLowerCase() === match)?.name || match;
  }
  // Check tags
  const tags = Array.isArray(sp.tags) ? sp.tags : [];
  for (const tag of tags) {
    const t = tag.toLowerCase();
    const match = catNames.find(c => t.includes(c) || c.includes(t));
    if (match) return (categories || []).find(c => (c.name || c).toLowerCase() === match)?.name || match;
  }
  // Check title
  if (sp.title) {
    const title = sp.title.toLowerCase();
    const match = catNames.find(c => title.includes(c));
    if (match) return (categories || []).find(c => (c.name || c).toLowerCase() === match)?.name || match;
  }
  return 'Other';
}

/** Build lookup indexes from existing catalogue products */
function _buildIndexes(products) {
  const skuMap = {};
  const allStyleCodes = new Set();
  const spidMap = {};
  for (const p of products) {
    const code = (p.styleCode || p.style_code || '').toUpperCase();
    if (code) { skuMap[code] = p; allStyleCodes.add(code); }
    const spid = p.shopify_product_id || p.shopifyProductId;
    if (spid) spidMap[String(spid)] = p;
    // Also index variant SKUs
    if (Array.isArray(p.variants)) {
      for (const v of p.variants) {
        if (v.sku) {
          const vCode = v.sku.toUpperCase().replace(/-(S|M|L|XL|XXL|MTF|OS|XXXL|2XL|3XL|FREE)$/i, '');
          if (vCode && !skuMap[vCode]) skuMap[vCode] = p;
        }
      }
    }
  }
  return { skuMap, allStyleCodes, spidMap };
}

/** Find existing catalogue product matching a Shopify product */
function _findExisting(sp, skuMap, allStyleCodes, spidMap) {
  // 1. Match by shopify_product_id
  const spid = String(sp.shopify_product_id || '');
  if (spid && spidMap[spid]) return spidMap[spid];
  // 2. Match by style_code
  if (sp.style_code) {
    const code = sp.style_code.toUpperCase();
    if (skuMap[code]) return skuMap[code];
  }
  // 3. Match by derived base code from first variant SKU
  if (sp.variants && sp.variants.length > 0 && sp.variants[0].sku) {
    const sku = sp.variants[0].sku.trim().toUpperCase();
    const base = sku.replace(/-(S|M|L|XL|XXL|MTF|OS|XXXL|2XL|3XL|FREE)$/i, '');
    if (base && skuMap[base]) return skuMap[base];
    // Try exact SKU match too
    if (skuMap[sku]) return skuMap[sku];
  }
  return null;
}

/** Merge duplicate products (size-suffixed entries that share the same base style code) */
function _mergeDuplicates(products) {
  const baseMap = {};
  const merged = [];
  for (const p of products) {
    const code = (p.styleCode || p.style_code || '').toUpperCase();
    if (!code) { merged.push(p); continue; }
    // Strip size suffix to find base
    const base = code.replace(/-(S|M|L|XL|XXL|MTF|OS|XXXL|2XL|3XL|FREE)$/i, '');
    if (base === code) {
      // This IS the base product
      if (!baseMap[base]) { baseMap[base] = p; merged.push(p); }
      else {
        // Merge COGS data if this one has it and the existing one doesn't
        const existing = baseMap[base];
        if (!existing.mrp && p.mrp) existing.mrp = p.mrp;
        if (!existing.cogs && p.cogs) existing.cogs = p.cogs;
      }
    } else {
      // This is a size variant — merge into base if it exists
      if (baseMap[base]) {
        // Already have the base, skip the variant row
      } else {
        // No base yet — promote this as the base
        const promoted = { ...p, styleCode: base, style_code: base };
        baseMap[base] = promoted;
        merged.push(promoted);
      }
    }
  }
  return merged;
}

/** Build a new catalogue product from a Shopify product */
function _buildNewProduct(sp, categories) {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString();
  const guessedCat = _guessCat(sp, categories);
  const mrp = sp.variants && sp.variants[0]?.price ? parseFloat(sp.variants[0].price) : 0;
  const baseCode = sp.style_code || _deriveBaseCode(sp);

  const variants = (sp.variants || []).map(sv => {
    const sizeMatch = VARIANT_SIZES.find(vs =>
      (sv.title || '').toUpperCase().includes(vs.label.toUpperCase()) ||
      (sv.title || '').toUpperCase() === vs.size
    );
    const sizeSuffix = sizeMatch ? sizeMatch.suffix : (sv.title || 'OS').replace(/\s+/g, '').substring(0, 5).toUpperCase();
    const sizeLabel = sizeMatch ? sizeMatch.size : sizeSuffix;
    return {
      size: sizeLabel,
      label: sizeMatch ? sizeMatch.label : sv.title || 'One Size',
      sku: sv.sku || generateSKU(baseCode, sizeSuffix),
      mrp: parseFloat(sv.compare_at_price) || parseFloat(sv.price) || 0,
      sellingPrice: parseFloat(sv.price) || 0,
      compareAtPrice: parseFloat(sv.compare_at_price) || parseFloat(sv.price) || 0,
      active: true,
      inventory: sv.inventory_quantity || 0,
      barcode: sv.barcode || '',
      shopify_variant_id: sv.id,
    };
  });

  return {
    id,
    styleCode: baseCode,
    productTitle: sp.title || '',
    category: guessedCat,
    isSet: false,
    setComponents: [],
    fabricName: '',
    fabricSKU: '',
    fabricDesc: '',
    description: sp.body_html || '',
    metres: '',
    costPerMetre: '',
    embroidery: '',
    embroidery_type: '',
    dyePerMetre: '',
    stitching: '',
    bottomCogs: '',
    accessories: '',
    mrp,
    sellingPrice: sp.variants && sp.variants[0]?.price ? parseFloat(sp.variants[0].price) : 0,
    discount: '',
    colourPrimary: '',
    colourSecondary: '',
    styleTag: '',
    occasionTag: '',
    fabricTag: '',
    washCare: 'Dry Cleaning only',
    hsn: '62114210',
    status: sp.status === 'active' ? 'Active' : 'Inactive',
    weight: '',
    sleeveDesc: '',
    fabricId: '',
    dyeId: '',
    image_url: sp.images && sp.images.length > 0 ? sp.images[0] : '',
    shopify_images: sp.images || [],
    shopify_product_id: String(sp.shopify_product_id || ''),
    shopify_style_code: sp.style_code || '',
    shopify_tags: Array.isArray(sp.tags) ? sp.tags.join(', ') : (sp.tags || ''),
    shopify_collections: sp.collections || [],
    shopify_variants: sp.variants || [],
    shopify_options: sp.options || [],
    handle: sp.handle || '',
    vendor: sp.vendor || '',
    product_type: sp.product_type || '',
    body_html: sp.body_html || '',
    tags: sp.tags || [],
    variants,
    published_at: sp.published_at || '',
    created_at_shopify: sp.created_at_shopify || '',
    updated_at_shopify: sp.updated_at_shopify || '',
    cogs_review_status: 'pending_entry',
    created_by: window._currentUserEmail || '',
  };
}

// ─── Catalogue ────────────────────────────────────────────────────────────────

export default ShopifySyncModal

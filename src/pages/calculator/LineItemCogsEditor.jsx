import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n } from '../../lib/helpers'
import { findProductBySku, extractCatalogueComponents } from '../../lib/orderUtils'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import FabricPicker from '../../components/FabricPicker'

const LineItemCogsEditor = ({ li, onSave, onCancel, fabrics, stitchingMaster, dyes, categories, products }) => {
  const qty = li.quantity || 1;
  const isEstimated = li.cogs_source === 'estimated';
  // Stored values are totals (qty×unit). Divide by qty to get per-unit for the form.
  const perUnit = (val) => (val && qty > 0) ? String(parseFloat((val / qty).toFixed(2))) : '';

  const [fabricId,     setFabricId]     = useState(li.fabric_id       || '');
  const [costType,     setCostType]     = useState(li.cost_type       || 'per_metre');
  const [metres,       setMetres]       = useState(li.metres ? String(parseFloat((li.metres / qty).toFixed(2))) : '');
  const [costPerMetre, setCostPerMetre] = useState(String(li.cost_per_metre || ''));
  const [dyeId,        setDyeId]        = useState(li.dye_id          || '');
  const [dyePerMetre,  setDyePerMetre]  = useState(String(li.dye_per_metre  || ''));
  const [embroidery,   setEmbroidery]   = useState(isEstimated ? '' : perUnit(li.cogs_embroidery));
  const [stitching,    setStitching]    = useState(isEstimated ? '' : perUnit(li.cogs_stitching));
  const [accessories,  setAccessories]  = useState(isEstimated ? '' : perUnit(li.cogs_accessories));
  const [other,        setOther]        = useState(isEstimated ? '' : perUnit(li.cogs_other));
  const [cogsNotes,    setCogsNotes]    = useState(li.cogs_notes || '');
  const [fetchedFrom,  setFetchedFrom]  = useState('');
  const [fetchError,   setFetchError]   = useState('');

  // ── Multi-piece set support ──
  // If the SKU matches a set product in catalogue, offer per-piece COGS entry.
  const detectedSetProduct = useMemo(() => {
    if (!products?.length) return null;
    const prod = findProductBySku(li.sku, products) || null;
    return (prod?.isSet && prod?.setComponents?.length > 0) ? prod : null;
  }, [li.sku, products]);

  const [setMode, setSetMode] = useState(false);
  const emptySetPiece = (name, idx) => ({
    _id: idx, name: name || `Piece ${idx + 1}`,
    category: '', costType: 'per_metre',
    fabricId: '', metres: '', costPerMetre: '',
    dyeId: '', dyePerMetre: '',
    embroidery: '', stitching: '', accessories: '',
  });
  const [setPieces, setPiecesState] = useState([]);

  // Auto-detect: if it's a set product, pre-enter set mode with pieces from catalogue
  useEffect(() => {
    if (detectedSetProduct && !setMode && setPieces.length === 0) {
      setSetMode(true);
      setPiecesState(detectedSetProduct.setComponents.map((pc, i) => ({
        _id: i,
        name: pc.name || `Piece ${i + 1}`,
        category: pc.category || '',
        costType: pc.costType || 'per_metre',
        fabricId: pc.fabricId || '',
        metres: String(parseFloat((pc.metres || 0).toFixed(2))),
        costPerMetre: String(pc.costPerMetre || ''),
        dyeId: pc.dyeId || '',
        dyePerMetre: String(pc.dyePerMetre || ''),
        embroidery: String(pc.embroidery || ''),
        stitching: String(pc.stitchCost ?? pc.stitching ?? ''),
        accessories: String(pc.accessories ?? ''),
      })));
    }
  }, [detectedSetProduct]);

  const updatePiece = (idx, field, val) => {
    setPiecesState(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      let extra = {};
      if (field === 'fabricId' && val) {
        const f = (fabrics || []).find(x => x.id === val);
        if (f) extra = { costPerMetre: String(f.costPerMetre || ''), costType: f.costType || 'per_metre' };
      }
      if (field === 'dyeId' && val) {
        const d = (dyes || []).find(x => x.id === val);
        if (d) extra = { dyePerMetre: String(d.costPerMetre || '') };
      }
      return { ...p, [field]: val, ...extra };
    }));
  };
  const nv = v => parseFloat(v) || 0;
  const pieceCogs = (pc) => {
    const fab = pc.costType === 'total' ? nv(pc.costPerMetre) : nv(pc.metres)*nv(pc.costPerMetre);
    const dye = pc.costType === 'total' ? 0 : nv(pc.dyePerMetre)*nv(pc.metres);
    return fab + dye + nv(pc.embroidery) + nv(pc.stitching) + nv(pc.accessories);
  };
  const setPiecesTotalPU = setPieces.reduce((s, pc) => s + pieceCogs(pc), 0);
  const setTotalCogs = setPiecesTotalPU * qty;

  useEffect(() => {
    if (fabricId) {
      const f = (fabrics || []).find(x => x.id === fabricId);
      if (f) {
        setCostPerMetre(String(f.costPerMetre || ''));
        setCostType(f.costType || 'per_metre');
      }
    }
  }, [fabricId]);

  useEffect(() => {
    if (dyeId) {
      const d = (dyes || []).find(x => x.id === dyeId);
      if (d) setDyePerMetre(String(d.costPerMetre || ''));
    }
  }, [dyeId]);

  useEffect(() => {
    // Auto-fill stitching from master when it loads (or is already available)
    if (li.category && stitchingMaster && stitchingMaster.length > 0 && !stitching) {
      const match = stitchingMaster.find(s => s.category === li.category);
      if (match) setStitching(String(match.cost));
    }
  }, [stitchingMaster]); // re-run if master data loads after initial render

  const n = (v) => parseFloat(v) || 0;
  // Per-unit calculations
  const fabricCostPU  = costType === 'total' ? n(costPerMetre) : n(metres) * n(costPerMetre);
  const dyeCostPU     = costType === 'total' ? 0 : n(dyePerMetre) * n(metres);
  const totalPerUnit  = fabricCostPU + dyeCostPU + n(embroidery) + n(stitching) + n(accessories) + n(other);
  const totalCogs     = totalPerUnit * qty;
  const sp            = li.eff_sp_ex_gst || 0;  // already total for all units
  const profit        = sp - totalCogs;
  const gm            = sp > 0 ? (profit / sp * 100) : 0;

  const catData    = (categories || []).find(c => c.name === li.category);
  const defaultAcc = catData?.defaultAccessories?.reduce((s, a) => s + a.cost, 0) || 0;
  const estRefPU   = sp > 0 ? Math.round(sp * 0.5 / qty) : 0;

  const fetchFromCatalogue = () => {
    setFetchError(''); setFetchedFrom('');
    if (!li.sku) { setFetchError('This line item has no SKU — cannot look up catalogue.'); return; }
    const prod = findProductBySku(li.sku, products);
    if (!prod) {
      setFetchError(`No catalogue match for SKU "${li.sku}" — check the style code in the catalogue.`);
      return;
    }
    const c = extractCatalogueComponents(prod);
    if (c.fabricId)        setFabricId(c.fabricId);
    if (c.metres > 0)      setMetres(String(parseFloat(c.metres.toFixed(3))));
    if (c.costPerMetre > 0) setCostPerMetre(String(parseFloat(c.costPerMetre.toFixed(2))));
    if (c.dyeId)           setDyeId(c.dyeId);
    if (c.dyePerMetre > 0) setDyePerMetre(String(parseFloat(c.dyePerMetre.toFixed(2))));
    if (c.embroidery > 0)  setEmbroidery(String(parseFloat(c.embroidery.toFixed(2))));
    if (c.stitching > 0)   setStitching(String(parseFloat(c.stitching.toFixed(2))));
    if (c.accessories > 0) setAccessories(String(parseFloat(c.accessories.toFixed(2))));
    setFetchedFrom(prod.productTitle || prod.productName || prod.styleCode || 'catalogue');
  };

  const handleSave = () => {
    if (setMode && setPieces.length > 0) {
      // Multi-piece set: aggregate all piece costs into flat columns
      let totFab=0, totDye=0, totEmb=0, totStitch=0, totAcc=0, totMetres=0;
      setPieces.forEach(pc => {
        const m = nv(pc.metres);
        totFab    += pc.costType === 'total' ? nv(pc.costPerMetre) : m * nv(pc.costPerMetre);
        totDye    += pc.costType === 'total' ? 0 : nv(pc.dyePerMetre) * m;
        totEmb    += nv(pc.embroidery);
        totStitch += nv(pc.stitching);
        totAcc    += nv(pc.accessories);
        totMetres += m;
      });
      const pieceNames = setPieces.map(p => p.name).join(' + ');
      onSave({
        fabric_id:        setPieces[0]?.fabricId || '',
        fabric_name:      (fabrics||[]).find(x => x.id === setPieces[0]?.fabricId)?.name || '',
        metres:           parseFloat((totMetres * qty).toFixed(3)),
        cost_per_metre:   totMetres > 0 ? parseFloat((totFab / totMetres).toFixed(2)) : 0,
        dye_id:           setPieces.length === 1 ? (setPieces[0]?.dyeId || '') : '',
        dye_per_metre:    setPieces.length === 1 ? nv(setPieces[0]?.dyePerMetre) : 0,
        cogs_fabric:      parseFloat((totFab    * qty).toFixed(2)),
        cogs_dye:         parseFloat((totDye    * qty).toFixed(2)),
        cogs_embroidery:  parseFloat((totEmb    * qty).toFixed(2)),
        cogs_stitching:   parseFloat((totStitch * qty).toFixed(2)),
        cogs_accessories: parseFloat((totAcc    * qty).toFixed(2)),
        cogs_other:       0,
        cogs_notes:       cogsNotes || `Set: ${pieceNames}`,
        cogs_source:      'manual',
      });
    } else {
      onSave({
        fabric_id:        fabricId,
        fabric_name:      (fabrics || []).find(x => x.id === fabricId)?.name || '',
        metres:           parseFloat((n(metres) * qty).toFixed(3)),
        cost_per_metre:   n(costPerMetre),
        dye_id:           dyeId,
        dye_per_metre:    n(dyePerMetre),
        cogs_fabric:      parseFloat((fabricCostPU  * qty).toFixed(2)),
        cogs_dye:         parseFloat((dyeCostPU     * qty).toFixed(2)),
        cogs_embroidery:  parseFloat((n(embroidery) * qty).toFixed(2)),
        cogs_stitching:   parseFloat((n(stitching)  * qty).toFixed(2)),
        cogs_accessories: parseFloat((n(accessories)* qty).toFixed(2)),
        cogs_other:       parseFloat((n(other)      * qty).toFixed(2)),
        cogs_notes:       cogsNotes,
        cogs_source:      fetchedFrom ? 'catalogue' : 'manual',
      });
    }
  };

  const rowCls = "grid grid-cols-2 sm:grid-cols-4 gap-3";
  const label = (txt) => <label className="block text-xs font-medium text-gray-500 mb-1">{txt}</label>;
  // type="text" + inputMode="decimal" avoids the React controlled-number-input cursor-jump bug
  const numInput = (val, setVal, placeholder='0') => (
    <input type="text" inputMode="decimal" value={val} onChange={e => setVal(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
  );

  return (
    <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/30 p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          COGS Builder — {li.title}{li.variant_title ? ` · ${li.variant_title}` : ''}
          <span className="ml-2 text-indigo-500 normal-case font-normal">Enter per-unit costs · qty {qty}</span>
          {li.product_type === 'custom' && <span className="ml-2 text-amber-600 normal-case font-normal">Custom — enter actual vendor costs</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" onClick={() => {
              setSetMode(v => {
                const next = !v;
                if (next && setPieces.length === 0) setPiecesState([emptySetPiece('Piece 1', 0)]);
                return next;
              });
            }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors normal-case tracking-normal ${setMode ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700' : 'border-indigo-200 text-indigo-600 bg-white hover:bg-indigo-50'}`}>
            🧩 {setMode ? 'Set mode ON' : 'Set mode'}
          </button>
          {products?.length > 0 && (<>
            {li.sku && (
              <button type="button" onClick={fetchFromCatalogue}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 bg-white hover:bg-indigo-50 text-xs font-medium transition-colors normal-case tracking-normal">
                ↺ From Catalogue
              </button>
            )}
            <select defaultValue="" onChange={e => {
              if (!e.target.value) return;
              const prod = (products || []).find(p => p.id === e.target.value);
              if (!prod) return;
              setFetchError(''); setFetchedFrom('');
              const c = extractCatalogueComponents(prod);
              if (c.fabricId)        setFabricId(c.fabricId);
              if (c.metres > 0)      setMetres(String(parseFloat(c.metres.toFixed(3))));
              if (c.costPerMetre > 0) setCostPerMetre(String(parseFloat(c.costPerMetre.toFixed(2))));
              if (c.dyeId)           setDyeId(c.dyeId);
              if (c.dyePerMetre > 0) setDyePerMetre(String(parseFloat(c.dyePerMetre.toFixed(2))));
              if (c.embroidery > 0)  setEmbroidery(String(parseFloat(c.embroidery.toFixed(2))));
              if (c.stitching > 0)   setStitching(String(parseFloat(c.stitching.toFixed(2))));
              if (c.accessories > 0) setAccessories(String(parseFloat(c.accessories.toFixed(2))));
              setFetchedFrom(prod.productTitle || prod.productName || prod.styleCode || 'catalogue');
              e.target.value = '';
            }}
              className="border border-indigo-200 rounded-lg px-2 py-1.5 text-xs text-indigo-600 bg-white hover:bg-indigo-50 normal-case tracking-normal max-w-[160px]">
              <option value="">Select product…</option>
              {(products || []).map(p => (
                <option key={p.id} value={p.id}>
                  {p.productTitle || p.productName || p.styleCode}{p.styleCode ? ` [${p.styleCode}]` : ''}
                </option>
              ))}
            </select>
          </>)}
        </div>
      </div>
      {fetchedFrom && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 flex items-center gap-2">
          <span>✓</span>
          <span>Pre-filled from <b>{fetchedFrom}</b> — review values and save to confirm.</span>
        </div>
      )}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600 flex items-center gap-2">
          <span>✗</span>
          <span>{fetchError}</span>
        </div>
      )}
      {isEstimated && estRefPU > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
          <span>⚠️</span>
          <span>Currently estimated at 50% of SP — reference ≈ <b>{fmt(String(estRefPU))}</b> per unit. Replace with actual costs below.</span>
        </div>
      )}

      {/* ── Set mode: per-piece editors / Single mode: fabric + dye + labour ── */}
      {setMode ? (
        <div className="space-y-3">
          {setPieces.map((pc, idx) => {
            const pcCogs = pieceCogs(pc);
            return (
              <div key={pc._id} className="bg-white rounded-xl shadow-sm border border-indigo-100">
                {/* Piece header: numbered circle + editable name + cogs + remove */}
                <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0" style={{background:'#6366f1'}}>{idx+1}</span>
                    <input
                      value={pc.name || ''}
                      onChange={e => updatePiece(idx, 'name', e.target.value)}
                      placeholder={`Piece ${idx+1} name (e.g. Kurta, Dhoti, Dupatta)`}
                      className="text-sm font-semibold text-gray-700 bg-transparent border-none outline-none flex-1 min-w-0"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {pcCogs > 0 && <span className="text-xs text-indigo-600 font-semibold">{fmt(pcCogs.toFixed(0))}</span>}
                    {setPieces.length > 1 && (
                      <button type="button" onClick={() => setPiecesState(p => p.filter((_, i) => i !== idx))}
                        className="text-gray-400 hover:text-red-500 transition-colors text-xs px-1">✕</button>
                    )}
                  </div>
                </div>
                {/* Piece Category */}
                <div className="px-3 pt-3">
                  <select value={pc.category || ''} onChange={e => {
                    const cat = (categories||[]).find(c => c.name === e.target.value);
                    const defAcc = cat?.defaultAccessories?.reduce((s,a) => s+a.cost, 0) || 0;
                    updatePiece(idx, 'category', e.target.value);
                    if (defAcc > 0 && !pc.accessories) updatePiece(idx, 'accessories', String(defAcc));
                  }}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-amber-50 focus:outline-none focus:ring-1 focus:ring-amber-300 mb-3">
                    <option value="">— Piece Category (optional) —</option>
                    {(categories||[]).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="px-3 pb-3 space-y-3">
                <div className={`grid gap-3 ${pc.costType === 'total' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
                  <div className="col-span-2">
                    {label('Fabric')}
                    <FabricPicker fabrics={fabrics || []} value={pc.fabricId} onChange={v => updatePiece(idx, 'fabricId', v)} showCost compact placeholder="— Select fabric —" />
                  </div>
                  {pc.costType !== 'total' && (
                    <div>
                      {label('Metres')}
                      <input type="text" inputMode="decimal" value={pc.metres} onChange={e => updatePiece(idx, 'metres', e.target.value)} placeholder="2.5" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  )}
                  <div>
                    {label(pc.costType === 'total' ? 'Fabric Cost — Total (₹)' : 'Cost / Metre (₹)')}
                    <input type="text" inputMode="decimal" value={pc.costPerMetre} onChange={e => updatePiece(idx, 'costPerMetre', e.target.value)} placeholder={pc.costType === 'total' ? '1500' : '320'} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="col-span-2">
                    {label('Dye Type')}
                    <select value={pc.dyeId} onChange={e => updatePiece(idx, 'dyeId', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                      <option value="">No Dye</option>
                      {(dyes || []).map(d => <option key={d.id} value={d.id}>{d.type} (₹{d.costPerMetre}/m)</option>)}
                    </select>
                  </div>
                  <div>
                    {label('Dye / Metre (₹)')}
                    <input type="text" inputMode="decimal" value={pc.dyePerMetre} onChange={e => updatePiece(idx, 'dyePerMetre', e.target.value)} placeholder="40" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    {label('Embroidery (₹)')}
                    <input type="text" inputMode="decimal" value={pc.embroidery} onChange={e => updatePiece(idx, 'embroidery', e.target.value)} placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    {label('Stitching (₹)')}
                    <div className="flex gap-1.5">
                      <input type="text" inputMode="decimal" value={pc.stitching} onChange={e => updatePiece(idx, 'stitching', e.target.value)} placeholder="600" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                      {(stitchingMaster || []).length > 0 && (
                        <select onChange={e => { const m = (stitchingMaster||[]).find(s => s.id === e.target.value); if (m) updatePiece(idx, 'stitching', String(m.cost)); e.target.value=''; }}
                          defaultValue="" className="border border-gray-200 rounded-lg px-1.5 text-xs text-gray-500 flex-shrink-0 w-24">
                          <option value="">↑ Master</option>
                          {(stitchingMaster||[]).map(s => <option key={s.id} value={s.id}>{s.garmentType || s.category}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                  <div>
                    {label('Accessories (₹)')}
                    <input type="text" inputMode="decimal" value={pc.accessories} onChange={e => updatePiece(idx, 'accessories', e.target.value)} placeholder="0" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                </div>{/* end px-3 pb-3 */}
              </div>
            );
          })}
          <button type="button" onClick={() => { const idx = setPieces.length; setPiecesState(p => [...p, emptySetPiece(`Piece ${idx + 1}`, idx)]); }}
            className="w-full py-2 border-2 border-dashed border-indigo-200 rounded-xl text-xs text-indigo-500 hover:bg-indigo-50 transition-colors">
            + Add another piece
          </button>
        </div>
      ) : (
        <>
          {/* ── Fabric section ── */}
          <div className="bg-white rounded-xl p-3 space-y-3 shadow-sm">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fabric</div>
            <div className={rowCls}>
              <div className="col-span-2">
                {label('Fabric')}
                <FabricPicker fabrics={fabrics || []} value={fabricId} onChange={setFabricId} showCost placeholder="— Select fabric —" />
                {fabricId && (() => {
                  const f = (fabrics || []).find(x => x.id === fabricId);
                  return f?.vendorName ? (
                    <div className="mt-1 text-xs text-gray-400">Vendor: <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">{f.vendorName}</span></div>
                  ) : null;
                })()}
              </div>
              {costType !== 'total' && (
                <div>
                  {label('Metres')}
                  {numInput(metres, setMetres, '2.5')}
                </div>
              )}
              <div>
                {label(costType === 'total' ? 'Fabric Cost — Total (₹)' : 'Cost / Metre (₹)')}
                {numInput(costPerMetre, setCostPerMetre, costType === 'total' ? '1500' : '320')}
              </div>
            </div>
            {n(costPerMetre) > 0 && (
              <div className="text-xs text-gray-500">Fabric cost: <b className="text-gray-800">{fmt((fabricCostPU * qty).toFixed(0))}</b> {costType === 'total' ? <span className="text-amber-600">(total cost fabric)</span> : <>({metres}m × ₹{costPerMetre}{qty > 1 ? ` × ${qty} units` : ''})</>}</div>
            )}
          </div>

          {/* ── Dye section ── */}
          <div className="bg-white rounded-xl p-3 space-y-3 shadow-sm">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Dye</div>
            <div className={rowCls}>
              <div className="col-span-2">
                {label('Dye Type')}
                <select value={dyeId} onChange={e => setDyeId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="">No Dye</option>
                  {(dyes || []).map(d => (
                    <option key={d.id} value={d.id}>{d.type} (₹{d.costPerMetre}/m)</option>
                  ))}
                </select>
              </div>
              <div>
                {label('Dye Cost / Metre (₹)')}
                {numInput(dyePerMetre, setDyePerMetre, '40')}
              </div>
              <div>
                {label('Dye Total')}
                <div className="border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
                  {n(dyePerMetre) > 0 && n(metres) > 0 ? fmt((dyeCostPU * qty).toFixed(0)) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* ── Embroidery, Stitching, Accessories, Other ── */}
          <div className="bg-white rounded-xl p-3 space-y-3 shadow-sm">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Labour & Trim</div>
            <div className={rowCls}>
              <div>
                {label('Embroidery (₹)')}
                {numInput(embroidery, setEmbroidery, '0')}
              </div>
              <div>
                {label('Stitching (₹)')}
                <div className="flex gap-1.5">
                  {numInput(stitching, setStitching, '600')}
                  {(stitchingMaster || []).length > 0 && (
                    <select onChange={e => { const m = (stitchingMaster||[]).find(s => s.id === e.target.value); if (m) setStitching(String(m.cost)); }}
                      defaultValue="" className="border border-gray-200 rounded-lg px-1.5 text-xs text-gray-500 flex-shrink-0 w-24">
                      <option value="">↑ Master</option>
                      {(stitchingMaster||[]).map(s => <option key={s.id} value={s.id}>{s.garmentType || s.category}</option>)}
                    </select>
                  )}
                </div>
              </div>
              <div>
                {label('Accessories (₹)')}
                <div className="flex gap-1.5">
                  {numInput(accessories, setAccessories, '0')}
                  {defaultAcc > 0 && (
                    <button type="button" onClick={() => setAccessories(String(defaultAcc))}
                      className="border border-gray-200 rounded-lg px-1.5 text-xs text-gray-500 flex-shrink-0 hover:bg-gray-50 whitespace-nowrap">
                      ↑ Cat (₹{defaultAcc})
                    </button>
                  )}
                </div>
                {catData?.defaultAccessories?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {catData.defaultAccessories.map(a => (
                      <span key={a.id} className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{a.name} ₹{a.cost}</span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                {label('Other / Vendor (₹)')}
                {numInput(other, setOther, '0')}
                <div className="text-xs text-gray-400 mt-0.5">Extras, courier etc.</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Summary bar ── */}
      {(() => {
        const effCogs = setMode ? setTotalCogs : totalCogs;
        const effGM   = sp > 0 ? ((sp - effCogs) / sp * 100) : 0;
        return (
          <div className="rounded-xl p-3 space-y-2" style={{background:'#0f172a'}}>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {setMode ? (
                setPieces.map((pc, i) => {
                  const pcCogs = pieceCogs(pc);
                  return pcCogs > 0 ? (
                    <span key={i} className="text-white/50">{pc.name}: <b className="text-white/80">{fmt(pcCogs.toFixed(0))}</b></span>
                  ) : null;
                })
              ) : (
                [['Fabric', fabricCostPU], ['Dye', dyeCostPU], ['Embroidery', n(embroidery)],
                 ['Stitching', n(stitching)], ['Accessories', n(accessories)], ['Other', n(other)],
                ].filter(([,v]) => v > 0).map(([l, v]) => (
                  <span key={l} className="text-white/50">{l}: <b className="text-white/80">{fmt(v.toFixed(0))}</b></span>
                ))
              )}
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1 border-t border-white/10">
              {qty > 1 && (
                <div className="text-white/40 text-xs">
                  {fmt((setMode ? setPiecesTotalPU : totalPerUnit).toFixed(0))} per unit × {qty}
                </div>
              )}
              <div className="text-white/50 text-xs flex-1">Total COGS: <b className="text-white text-lg">{fmt(effCogs.toFixed(0))}</b></div>
              <div className={`text-base font-bold ${effGM >= 65 ? 'text-emerald-400' : effGM >= 50 ? 'text-green-400' : effGM >= 45 ? 'text-orange-400' : 'text-red-400'}`}>
                {sp > 0 ? `${effGM.toFixed(1)}% GM` : '—'}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Notes + actions ── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input value={cogsNotes} onChange={e => setCogsNotes(e.target.value)}
          placeholder="Invoice # / vendor reference…"
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm flex-1" />
        <div className="flex gap-2">
          <button onClick={handleSave}
            className="btn-gold flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold">Save COGS</button>
          <button onClick={onCancel}
            className="border border-gray-200 flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  );
};

// Single line item row (inside expanded order)

export default LineItemCogsEditor

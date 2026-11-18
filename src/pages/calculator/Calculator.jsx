import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, effectiveSP, gmPct, calcPieceCogs } from '../../lib/helpers'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { DEFAULT_CATEGORIES, CATEGORIES } from '../../lib/constants'
import FabricPicker from '../../components/FabricPicker'

// Helper constants for calculator
const EMBROIDERY_LEVELS = [
  { label: 'None', value: 0 },
  { label: 'Minimal', value: 500 },
  { label: 'Light', value: 2000 },
  { label: 'Medium', value: 5000 },
  { label: 'Heavy', value: 10000 },
  { label: 'Full Zardosi', value: 20000 },
  { label: 'Custom', value: 0 },
];

const emptyPiece = (name) => ({
  id: Date.now().toString(36) + Math.random().toString(36).slice(2),
  name,
  category: '',
  fabricId: '',
  fabricName: '',
  costPerMetre: 0,
  metres: '',
  dyeId: '',
  dyePerMetre: 0,
  stitching: 0,
  embroidery: 0,
  accessories: 0,
});

const resolveFabricId = (id) => {
  // Resolve old fabric IDs to new ones if needed
  // For now, just return the ID as-is
  return id;
};

const Calculator = ({ fabrics, stitching: stitchingMaster, dyes, categories, consumption, products }) => {
  const [isSet, setIsSet] = useState(false);
  const [category, setCategory] = useState('Kurta');
  const [mrp, setMrp] = useState('');
  const [targetGM, setTargetGM] = useState('65');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showMRPCheck, setShowMRPCheck] = useState(false);
  const [showDiscountCalc, setShowDiscountCalc] = useState(false);
  const [discountPct, setDiscountPct] = useState('15');
  // Single piece state
  const [fabricId, setFabricId] = useState('');
  const [fabricCost, setFabricCost] = useState('');
  const [metres, setMetres] = useState('');
  const [stitchCost, setStitchCost] = useState('');
  const [dyeId, setDyeId] = useState('');
  const [dyeCost, setDyeCost] = useState('');
  const [embLevel, setEmbLevel] = useState(0);
  const [embCustom, setEmbCustom] = useState('');
  const [accessories, setAccessories] = useState('');

  // Embroidery catalogue reference pickers
  const [embPickerOpen, setEmbPickerOpen] = useState(false);
  const [embSearch, setEmbSearch] = useState('');
  const [calcEmbPickerIdx, setCalcEmbPickerIdx] = useState(null);
  const [calcEmbSearch, setCalcEmbSearch] = useState('');

  const getEmbRefProducts = (search) => {
    const prods = products || [];
    if (!search) return prods.filter(p => (+p.embroidery || 0) > 0).sort((a, b) => (+b.embroidery || 0) - (+a.embroidery || 0)).slice(0, 20);
    const q = search.toLowerCase();
    return prods.filter(p => (p.productTitle || p.productName || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)).slice(0, 20);
  };

  // Multi-piece set state
  const [pieces, setPieces] = useState([
    { ...emptyPiece('Piece 1') },
    { ...emptyPiece('Piece 2') },
  ]);

  const [fabricCostType, setFabricCostType] = useState('per_metre');
  useEffect(() => { if (fabricId) { const f = fabrics.find(x => x.id === fabricId); if (f) { setFabricCost(f.costPerMetre); setFabricCostType(f.costType || 'per_metre'); } } }, [fabricId]);
  useEffect(() => { const m = stitchingMaster.find(s => s.category === category); if (m) setStitchCost(m.cost); }, [category]);
  useEffect(() => { if (dyeId) { const d = dyes.find(x => x.id === dyeId); if (d) setDyeCost(d.costPerMetre); } }, [dyeId]);

  const addCalcPiece = () => setPieces(p => [...p, emptyPiece(`Piece ${p.length + 1}`)]);
  const removeCalcPiece = (idx) => setPieces(p => p.filter((_, i) => i !== idx));
  const updateCalcPiece = (idx, field, val) => setPieces(prev => {
    let extra = {};
    const currentPiece = prev[idx];
    if (field === 'fabricId' && val) {
      var fab = fabrics.find(function (x) { return x.id === val || x._oldId === val; });
      if (fab) extra = { fabricName: fab.name, costPerMetre: fab.costPerMetre, costType: fab.costType || 'per_metre' };
      const cat = currentPiece ? currentPiece.category : '';
      if (cat && consumption && consumption.length > 0) {
        const resolvedVal = resolveFabricId(val);
        const rule = consumption.find(function (c) { var rc = resolveFabricId(c.fabricId); return c.category === cat && (rc === resolvedVal || c.fabricId === val); });
        if (rule) extra = { ...extra, metres: rule.metres };
      }
    }
    if (field === 'dyeId' && val) {
      const d = dyes.find(x => x.id === val);
      if (d) extra = { dyePerMetre: d.costPerMetre };
    }
    if (field === 'category' && val) {
      const cat = (categories || []).find(x => x.name === val);
      const accTotal = cat && cat.defaultAccessories ? cat.defaultAccessories.reduce((s, a) => s + a.cost, 0) : 0;
      const stitchMatch = stitchingMaster.find(s => s.category === val);
      extra = { ...(accTotal > 0 ? { accessories: accTotal } : {}), ...(stitchMatch ? { stitching: stitchMatch.cost } : {}) };
      if (currentPiece && currentPiece.fabricId && consumption && consumption.length > 0) {
        const resolvedPieceFab = resolveFabricId(currentPiece.fabricId);
        const rule = consumption.find(function (c) { var rc = resolveFabricId(c.fabricId); return c.category === val && (rc === resolvedPieceFab || c.fabricId === currentPiece.fabricId); });
        if (rule) extra = { ...extra, metres: rule.metres };
      }
    }
    return prev.map((piece, i) => i === idx ? { ...piece, [field]: val, ...extra } : piece);
  });

  const embroidery = embCustom !== '' ? +embCustom : EMBROIDERY_LEVELS[embLevel].value;
  const fabricTotal = fabricCostType === 'total' ? (+fabricCost || 0) : (+metres || 0) * (+fabricCost || 0);
  const dyeTotal = fabricCostType === 'total' ? 0 : (+dyeCost || 0) * (+metres || 0);

  // COGS calculation
  const singleCogs = fabricTotal + dyeTotal + embroidery + (+stitchCost || 0) + (+accessories || 0);
  const setCogs = pieces.reduce((total, p) => total + calcPieceCogs({ metres: +p.metres || 0, costPerMetre: +p.costPerMetre || 0, costType: p.costType || 'per_metre', dyePerMetre: +p.dyePerMetre || 0, stitching: +p.stitching || 0, embroidery: +p.embroidery || 0, accessories: +p.accessories || 0 }), 0);
  const cogs = isSet ? setCogs : singleCogs;

  const mrpNum = +mrp || 0;
  const effSPCalc = effectiveSP(mrpNum, mrpNum);
  const gstRateForMRP = gst(mrpNum);
  const gmNum = mrpNum > 0 ? gmPct(mrpNum, cogs, mrpNum) : 0;
  const tgm = +targetGM / 100;
  // Step 1: Raw Eff. SP to hit target GM
  const rawEffSP = cogs > 0 && tgm < 1 ? cogs / (1 - tgm) : 0;
  const gstRate = gst(rawEffSP || mrpNum);
  // Step 2: Suggested MRP = round up to nearest ₹100 (this is the anchor)
  const recommendedSP = rawEffSP > 0 ? Math.ceil(rawEffSP * (1 + gstRate) / 100) * 100 : 0;
  // Step 3: Derive Eff. SP back from MRP — so all numbers are consistent with the MRP
  const recommendedEffSP = recommendedSP > 0 ? Math.round(recommendedSP / (1 + gstRate)) : 0;
  // Step 4: Actual GM at this MRP (may be slightly higher than target due to rounding up)
  const actualGM = recommendedEffSP > 0 ? (recommendedEffSP - cogs) / recommendedEffSP : 0;
  const recommendedMRP = recommendedSP > 0 ? Math.ceil(recommendedSP / 0.85 / 100) * 100 : 0;

  const allCatNames = (categories && categories.length > 0) ? categories.map(c => c.name) : CATEGORIES;

  const gmQuality = (gm) => {
    if (gm < 0.45) return { label: 'Not recommended', color: 'text-red-600', bg: 'bg-red-50 border border-red-100', dot: '🔴' };
    if (gm < 0.50) return { label: 'Not so great', color: 'text-orange-500', bg: 'bg-orange-50 border border-orange-100', dot: '🟠' };
    if (gm < 0.65) return { label: 'Good', color: 'text-green-600', bg: 'bg-green-50 border border-green-100', dot: '🟢' };
    return { label: 'Best', color: 'text-emerald-700', bg: 'bg-emerald-50 border border-emerald-200', dot: '⭐' };
  };

  return (
    <div className="fade-in p-4 sm:p-8">
      <h1 className="font-headline text-3xl font-extrabold tracking-tight mb-1" style={{ color: '#1b1c1a', fontFamily: 'Manrope,sans-serif' }}>Calculator</h1>
      <p className="page-subtitle mb-6">Pricing &amp; COGS Engine</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 calc-grid-2">
        {/* Inputs */}
        <div className="space-y-4">
          {/* Garment type selector */}
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Garment</div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
                {allCatNames.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            {/* Step 1: Single or Set? */}
            <div>
              <label className="text-xs text-gray-500 block mb-2">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {[['single', 'Single Piece'], ['set', 'Set (Multiple Pieces)']].map(([val, label]) => (
                  <button key={val} onClick={() => {
                    const s = val === 'set';
                    setIsSet(s);
                    if (s && pieces.length === 0) setPieces([emptyPiece('Piece 1'), emptyPiece('Piece 2')]);
                  }}
                    className={`py-2.5 rounded-lg text-xs font-medium border transition-all ${(isSet ? val === 'set' : val === 'single') ? 'btn-gold border-transparent' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {/* Step 2: If set — how many pieces? */}
            {isSet && (
              <div>
                <label className="text-xs text-gray-500 block mb-2">How many pieces in this set?</label>
                <div className="flex gap-2 flex-wrap">
                  {[2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => {
                      const newPieces = Array.from({ length: n }, (_, i) =>
                        pieces[i] ? pieces[i] : emptyPiece(`Piece ${i + 1}`)
                      );
                      setPieces(newPieces);
                    }}
                      className={`w-10 h-10 rounded-lg text-sm font-bold border transition-all ${pieces.length === n ? 'btn-gold border-transparent' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {n}
                    </button>
                  ))}
                  <span className="text-xs text-gray-400 self-center ml-1">(or add/remove below)</span>
                </div>
              </div>
            )}
          </div>

          {/* SINGLE piece costing */}
          {!isSet && (<>
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fabric</div>
              <FabricPicker fabrics={fabrics} value={fabricId} onChange={setFabricId} showCost placeholder="— Select fabric —" />
              <div className={fabricCostType === 'total' ? '' : 'grid grid-cols-2 gap-3'}>
                <div><label className="text-xs text-gray-500 block mb-1">{fabricCostType === 'total' ? 'Fabric Cost — Total (₹)' : 'Cost/Metre (₹)'}</label>
                  <input type="number" value={fabricCost} onChange={e => setFabricCost(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" /></div>
                {fabricCostType !== 'total' && (
                  <div><label className="text-xs text-gray-500 block mb-1">Metres</label>
                    <input type="number" step="0.1" value={metres} onChange={e => setMetres(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="2.5" /></div>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Dye & Embroidery</div>
              <select value={dyeId} onChange={e => setDyeId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
                <option value="">No Dye</option>
                {dyes.map(d => <option key={d.id} value={d.id}>{d.type} — ₹{d.costPerMetre}/m</option>)}
              </select>
              <div>
                <label className="text-xs text-gray-500 block mb-2">Embroidery Level</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 sm:gap-1.5">
                  {EMBROIDERY_LEVELS.map((e, i) => (
                    <button key={i} onClick={() => { setEmbLevel(i); setEmbCustom(''); setEmbPickerOpen(false); }}
                      className={`py-1.5 sm:py-2 px-1 rounded-lg text-xs font-medium border transition-all flex flex-col items-center gap-0.5 ${embLevel === i && embCustom === '' ? 'btn-gold border-transparent' : 'border-gray-200 text-gray-500'}`}>
                      <span className="text-xs">{e.label}</span>
                      {e.value > 0 && <span className={`font-normal text-[9px] ${embLevel === i && embCustom === '' ? 'text-white/70' : 'text-gray-400'}`}>₹{e.value >= 1000 ? (e.value / 1000) + 'k' : e.value}</span>}
                      {e.value === 0 && <span style={{ fontSize: '9px', opacity: 0.5 }}>—</span>}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input type="number" value={embCustom} onChange={e => { setEmbCustom(e.target.value); setEmbPickerOpen(false); }}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="Or enter custom (₹)" />
                  <button onClick={() => { setEmbPickerOpen(v => !v); setEmbSearch(''); }}
                    title="Reference from catalogue"
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-1 ${embPickerOpen ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    Ref
                  </button>
                </div>
                {embPickerOpen && (
                  <div className="mt-2 border border-indigo-200 rounded-lg overflow-hidden shadow-sm">
                    <div className="bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 border-b border-indigo-100">Pick embroidery cost from catalogue</div>
                    <input autoFocus value={embSearch} onChange={e => setEmbSearch(e.target.value)}
                      placeholder="Search product name or category..." className="w-full px-3 py-2 text-xs border-b border-gray-100 focus:outline-none" />
                    <div className="max-h-36 overflow-y-auto">
                      {getEmbRefProducts(embSearch).length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No products found</div>}
                      {getEmbRefProducts(embSearch).map(p => (
                        <button key={p.id} onClick={() => { setEmbCustom(+p.embroidery || 0); setEmbLevel(0); setEmbPickerOpen(false); setEmbSearch(''); }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 flex justify-between items-center border-b border-gray-50 last:border-0">
                          <span className="truncate text-gray-700">{p.productTitle || p.productName} {p.category ? <span className="text-gray-400">({p.category})</span> : ''}</span>
                          <span className="text-indigo-600 font-bold ml-2 flex-shrink-0">₹{(+p.embroidery || 0).toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Other Costs</div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 block mb-1">Stitching (₹)</label>
                  <input type="number" value={stitchCost} onChange={e => setStitchCost(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" /></div>
                <div><label className="text-xs text-gray-500 block mb-1">Accessories (₹)</label>
                  <input type="number" value={accessories} onChange={e => setAccessories(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="0" /></div>
              </div>
            </div>
          </>)}

          {/* MULTI-PIECE set costing */}
          {isSet && (
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Set Pieces</div>
                <button onClick={addCalcPiece} className="btn-gold px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1">
                  <Icon name="plus" cls="w-3 h-3" /> Add Piece
                </button>
              </div>
              {pieces.map((piece, idx) => {
                const pCogs = calcPieceCogs({ metres: +piece.metres || 0, costPerMetre: +piece.costPerMetre || 0, dyePerMetre: +piece.dyePerMetre || 0, stitching: +piece.stitching || 0, embroidery: +piece.embroidery || 0, accessories: +piece.accessories || 0 });
                const allCatNames = (categories && categories.length > 0) ? categories.map(c => c.name) : CATEGORIES;
                return (
                  <div key={piece.id} className="border border-gray-200 rounded-xl">
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-white" style={{ background: '#d4a843' }}>{idx + 1}</span>
                        <input value={piece.name || ''} onChange={e => updateCalcPiece(idx, 'name', e.target.value)}
                          placeholder={`Piece ${idx + 1}`}
                          className="text-sm font-semibold text-gray-700 bg-transparent border-none outline-none flex-1 min-w-0" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-indigo-600">₹{pCogs.toFixed(0)}</span>
                        {pieces.length > 1 && (
                          <button onClick={() => removeCalcPiece(idx)} className="text-red-400 hover:text-red-600 p-1"><Icon name="trash" cls="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </div>
                    <div className="p-3 space-y-2">
                      {/* Category */}
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Piece Category</label>
                        <select value={piece.category || ''} onChange={e => updateCalcPiece(idx, 'category', e.target.value)}
                          className="w-full border border-amber-200 bg-amber-50 rounded-lg px-2.5 py-2 text-sm">
                          <option value="">— Select category —</option>
                          {allCatNames.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      {/* Fabric row */}
                      <div className={`grid gap-2 ${piece.costType === 'total' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Fabric</label>
                          <FabricPicker fabrics={fabrics} value={piece.fabricId || ''} onChange={v => updateCalcPiece(idx, 'fabricId', v)} showCost compact placeholder="— Select —" />
                        </div>
                        {piece.costType !== 'total' && (
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Metres</label>
                            <input type="number" step="0.25" value={piece.metres || ''} placeholder="2.5"
                              onChange={e => updateCalcPiece(idx, 'metres', e.target.value === '' ? '' : +e.target.value)}
                              className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">{piece.costType === 'total' ? 'Fabric Cost — Total (₹)' : 'Cost/m (₹)'}</label>
                          <input type="number" value={piece.costPerMetre || ''} placeholder={piece.costType === 'total' ? '1500' : '320'}
                            onChange={e => updateCalcPiece(idx, 'costPerMetre', e.target.value === '' ? '' : +e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
                        </div>
                      </div>
                      {/* Dye + Embroidery row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Dye Type</label>
                          <select value={piece.dyeId || ''} onChange={e => updateCalcPiece(idx, 'dyeId', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm">
                            <option value="">No Dye</option>
                            {dyes.map(d => <option key={d.id} value={d.id}>{d.type}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Dye/m (₹)</label>
                          <input type="number" value={piece.dyePerMetre || ''} placeholder="0"
                            onChange={e => updateCalcPiece(idx, 'dyePerMetre', e.target.value === '' ? '' : +e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Embroidery (₹)</label>
                          <div className="flex gap-1">
                            <input type="number" value={piece.embroidery || ''} placeholder="0"
                              onChange={e => { updateCalcPiece(idx, 'embroidery', e.target.value === '' ? '' : +e.target.value); setCalcEmbPickerIdx(null); }}
                              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
                            <button onClick={() => { setCalcEmbPickerIdx(calcEmbPickerIdx === idx ? null : idx); setCalcEmbSearch(''); }}
                              title="Reference from catalogue"
                              className={`px-2 py-1.5 rounded-lg border text-xs transition-all flex-shrink-0 ${calcEmbPickerIdx === idx ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                            </button>
                          </div>
                          {calcEmbPickerIdx === idx && (
                            <div className="mt-1 border border-indigo-200 rounded-lg overflow-hidden shadow-sm">
                              <input autoFocus value={calcEmbSearch} onChange={e => setCalcEmbSearch(e.target.value)}
                                placeholder="Search product..." className="w-full px-2 py-1.5 text-xs border-b border-gray-100 focus:outline-none" />
                              <div className="max-h-28 overflow-y-auto">
                                {getEmbRefProducts(calcEmbSearch).length === 0 && <div className="px-2 py-1.5 text-xs text-gray-400">No products</div>}
                                {getEmbRefProducts(calcEmbSearch).map(p => (
                                  <button key={p.id} onClick={() => { updateCalcPiece(idx, 'embroidery', +p.embroidery || 0); setCalcEmbPickerIdx(null); setCalcEmbSearch(''); }}
                                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-indigo-50 flex justify-between items-center border-b border-gray-50 last:border-0">
                                    <span className="truncate text-gray-700">{p.productTitle || p.productName}</span>
                                    <span className="text-indigo-600 font-bold ml-1 flex-shrink-0">₹{(+p.embroidery || 0).toLocaleString()}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Stitching + Accessories row */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Stitching (₹)</label>
                          <input type="number" value={piece.stitching || ''} placeholder="250"
                            onChange={e => updateCalcPiece(idx, 'stitching', e.target.value === '' ? '' : +e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Accessories (₹)</label>
                          <input type="number" value={piece.accessories || ''} placeholder="0"
                            onChange={e => updateCalcPiece(idx, 'accessories', e.target.value === '' ? '' : +e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="space-y-4">
          {/* COGS + Results — dark navy Atelier card */}
          <div className="calc-result-card">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(212,168,67,0.7)', marginBottom: 6 }}>
                  {isSet ? `Total COGS — ${pieces.length} Pieces` : 'Total COGS'}
                </div>
                <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 36, fontWeight: 800, color: '#d4a843', lineHeight: 1 }}>
                  {fmt(n(cogs).toFixed(0))}
                </div>
              </div>
              <button onClick={() => setShowBreakdown(v => !v)}
                style={{
                  background: showBreakdown ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.08)',
                  color: showBreakdown ? '#d4a843' : 'rgba(255,255,255,0.45)',
                  border: 'none', cursor: 'pointer', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4
                }}>
                Breakdown
                <svg style={{ width: 12, height: 12, transform: showBreakdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            {showBreakdown && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16, marginBottom: 16 }}>
                {isSet ? (
                  pieces.map((piece, idx) => {
                    const pCogs = calcPieceCogs({ metres: +piece.metres || 0, costPerMetre: +piece.costPerMetre || 0, dyePerMetre: +piece.dyePerMetre || 0, stitching: +piece.stitching || 0, embroidery: +piece.embroidery || 0, accessories: +piece.accessories || 0 });
                    return (
                      <div key={piece.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{piece.name || `Piece ${idx + 1}`}</span>
                        <span style={{ color: 'white', fontWeight: 600 }}>{fmt(pCogs.toFixed(0))}</span>
                      </div>
                    );
                  })
                ) : (
                  [['Fabric', fabricTotal], ['Dye', dyeTotal], ['Embroidery', embroidery], ['Stitching', +stitchCost || 0], ['Accessories', +accessories || 0]].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>{l}</span>
                      <span style={{ color: v > 0 ? '#eec058' : 'rgba(255,255,255,0.25)', fontWeight: v > 0 ? 600 : 400 }}>{fmt(v)}</span>
                    </div>
                  ))
                )}
              </div>
            )}
            {/* Recommended pricing inside the dark card */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>Gross Margin</div>
                <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 20, fontWeight: 800, color: cogs > 0 && actualGM >= 0.65 ? '#4ade80' : cogs > 0 && actualGM >= 0.50 ? '#eec058' : 'rgba(255,255,255,0.6)' }}>
                  {cogs > 0 && actualGM > 0 ? `${(actualGM * 100).toFixed(1)}%` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>Profit / Unit</div>
                <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.85)' }}>
                  {recommendedEffSP > 0 ? fmt(n(recommendedEffSP - cogs).toFixed(0)) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Pricing card */}
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(27,28,26,0.4)' }}>Target Gross Margin</div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span style={{ fontSize: 12, color: 'rgba(27,28,26,0.5)' }}>Slider</span>
                <div className="flex items-center gap-2">
                  <span style={{ fontFamily: 'Manrope,sans-serif', fontSize: 20, fontWeight: 700, color: '#795900' }}>{targetGM}%</span>
                  {(() => { const q = gmQuality(+targetGM / 100); return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${q.bg} ${q.color}`}>{q.label}</span>; })()}
                </div>
              </div>
              <input type="range" min="20" max="80" value={targetGM} onChange={e => setTargetGM(e.target.value)} className="w-full" style={{ accentColor: '#795900' }} />
            </div>
            {cogs > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3 rounded-xl p-4" style={{ background: '#f5f4f0' }}>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(27,28,26,0.4)', marginBottom: 4 }}>Eff. SP (ex-GST)</div>
                    <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 18, fontWeight: 800, color: '#15803d' }}>{fmt(recommendedEffSP)}</div>
                    <div style={{ fontSize: 10, color: 'rgba(27,28,26,0.4)' }}>at {actualGM > 0 ? (actualGM * 100).toFixed(1) : targetGM}% GM</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(27,28,26,0.4)', marginBottom: 4 }}>Incl. GST ({(gstRate * 100).toFixed(0)}%)</div>
                    <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 18, fontWeight: 800, color: '#494bd6' }}>{fmt(recommendedSP)}</div>
                    <div style={{ fontSize: 10, color: 'rgba(27,28,26,0.4)' }}>selling price</div>
                  </div>
                </div>
                <div className="rounded-xl p-4 text-center" style={{ background: '#131b2e' }}>
                  <div style={{ fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,168,67,0.6)', marginBottom: 6 }}>Suggested MRP</div>
                  <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 28, fontWeight: 800, color: '#d4a843' }}>{fmt(recommendedSP)}</div>
                </div>
              </div>
            )}
            {/* Discount room calculator — collapsible */}
            <div>
              <button onClick={() => setShowDiscountCalc(v => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium border transition-all ${showDiscountCalc ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                <span>Add discount room to MRP</span>
                <svg className={`w-3.5 h-3.5 transition-transform ${showDiscountCalc ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showDiscountCalc && recommendedSP > 0 && (() => {
                const disc = parseFloat(discountPct) || 0
                const mrpWithRoom = disc > 0 && disc < 100 ? Math.ceil(recommendedSP / (1 - disc / 100) / 100) * 100 : recommendedSP
                const actualDiscount = mrpWithRoom > 0 ? ((mrpWithRoom - recommendedSP) / mrpWithRoom * 100).toFixed(1) : 0
                const customerPays = Math.round(mrpWithRoom * (1 - disc / 100))
                return (
                  <div className="mt-2 p-3 rounded-xl border border-amber-200 bg-amber-50/50">
                    <div className="flex items-center gap-3 mb-3">
                      <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Discount %</label>
                      <input type="text" inputMode="decimal" value={discountPct} onChange={e => setDiscountPct(e.target.value)}
                        className="w-20 px-2.5 py-1.5 rounded-lg border text-sm font-bold text-center"
                        style={{ fontFamily: 'JetBrains Mono,monospace', borderColor: '#d4a843' }} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg p-2.5 text-center" style={{ background: '#131b2e' }}>
                        <div style={{ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(212,168,67,0.6)', marginBottom: 4 }}>MRP with {disc}% room</div>
                        <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 20, fontWeight: 800, color: '#d4a843' }}>{fmt(mrpWithRoom)}</div>
                      </div>
                      <div className="rounded-lg p-2.5 text-center bg-white border" style={{ borderColor: '#e5e7eb' }}>
                        <div style={{ fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(27,28,26,0.4)', marginBottom: 4 }}>Customer pays ({disc}% off)</div>
                        <div style={{ fontFamily: 'Manrope,sans-serif', fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{fmt(customerPays)}</div>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
            {/* Check a specific MRP — collapsible */}
            <div>
              <button onClick={() => setShowMRPCheck(v => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium border transition-all ${showMRPCheck ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                <span>Check a specific MRP / price point</span>
                <svg className={`w-3.5 h-3.5 transition-transform ${showMRPCheck ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {showMRPCheck && (
                <div className="mt-2 space-y-2">
                  <input type="number" value={mrp} onChange={e => setMrp(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="Enter MRP (₹) — what customer pays" />
                  {mrpNum > 0 && cogs > 0 && (() => {
                    const q = gmQuality(gmNum);
                    return (
                      <div className="space-y-2">
                        <div className={`rounded-xl p-3 flex items-center justify-between ${q.bg}`}>
                          <div>
                            <div className="text-xs text-gray-500">Gross Margin</div>
                            <div className={`text-2xl font-bold ${q.color}`}>{(gmNum * 100).toFixed(1)}%</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-bold ${q.color}`}>{q.dot} {q.label}</div>
                            <div className="text-xs text-gray-400 mt-0.5">Profit: {fmt(n(effSPCalc - cogs).toFixed(0))}</div>
                          </div>
                        </div>
                        {gmNum >= 0.45 && gmNum < 0.50 && (
                          <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-xs text-orange-700">
                            💬 Approval needed — margin is not ideal (45–50% range)
                          </div>
                        )}
                        {gmNum < 0.45 && (
                          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-600">
                            ⚠️ Below minimum 45% GM. Min MRP needed: <span className="font-bold">{fmt(Math.ceil(n(cogs) / 0.55 * (1 + gstRateForMRP) / 100) * 100)}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400">Eff. SP (ex-GST)</div><div className="font-bold text-indigo-700 text-sm">{fmt(n(effSPCalc).toFixed(0))}</div></div>
                          <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400">GST ({(gstRateForMRP * 100).toFixed(0)}%)</div><div className="font-bold text-gray-700 text-sm">{fmt(n(mrpNum - effSPCalc).toFixed(0))}</div></div>
                          <div className="col-span-2 bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-400">Gross Profit</div><div className="font-bold text-gray-700 text-sm">{fmt(n(effSPCalc - cogs).toFixed(0))}</div></div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── GrowthView helpers ───────────────────────────────────────────────────────
// product_type is 'standard' | 'custom' — MTF is a SIZE, not a type

export default Calculator

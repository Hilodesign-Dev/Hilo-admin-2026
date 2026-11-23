import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supa } from '../../lib/supabase';

import { _logError, _logChange } from '../../lib/logger';
import { fmt, gst, n, calcCogs, calcPieceCogs, effectiveSP, gmPct, nextId, statusColor } from '../../lib/helpers';
import { CATEGORIES, VALID_SIZES, DEFAULT_CATEGORIES, OUTSOURCE_TYPES, VARIANT_SIZES, generateSKU, buildDefaultVariants } from '../../lib/constants';
import Modal from '../../components/Modal';
import Icon from '../../components/Icon';
import FabricPicker from '../../components/FabricPicker';

// ─── Helper functions and components ──────────────────────────────────────────

const emptyProduct = () => ({
  id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(),
  styleCode: '', productTitle: '', productName: '', category: 'Kurta',
  isSet: false, setComponents: [], fabricName: '', fabricSKU: '', fabricDesc: '', description: '',
  metres: '', costPerMetre: '', embroidery: '', embroidery_type: '', dyePerMetre: '', stitching: '',
  bottomCogs: '', accessories: '', mrp: '', sellingPrice: '', discount: '',
  colourPrimary: '', colourSecondary: '', styleTag: '', occasionTag: '', fabricTag: '',
  washCare: 'Dry Cleaning only', hsn: '62114210', status: 'Active', weight: '', sleeveDesc: '', fabricId: '', dyeId: '',
  image_url: '', shopify_images: [], shopify_product_id: '',
  variants: [], // per-size variants with SKU, MRP, SP
  cogs_review_status: 'pending_entry',
});

// ─── COGS Review status helpers ─────────────────────────────────────────────
var REVIEW_STATUS_CONFIG = {
  pending_entry: { label: 'Pending', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  in_review: { label: 'In Review', color: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
  finalized: { label: 'Finalized', color: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
  rejected: { label: 'Rejected', color: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
};

var COGS_FIELDS = ['metres', 'costPerMetre', 'embroidery', 'dyePerMetre', 'stitching', 'bottomCogs', 'accessories'];

const emptyPiece = (name = '') => ({
  id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)),
  name, category: '', fabricId: '', fabricName: '', metres: '', costPerMetre: '', costType: 'per_metre', dyeId: '', dyePerMetre: '', stitching: '', embroidery: '', accessories: '',
});

// ─── ProductForm field helpers ────────────────────────────────────────────────
// (Defining components inside another component creates new function refs each render,
//  causing React to unmount+remount the input, losing cursor position.)
const _PFCtx = React.createContext({ form: {}, set: () => { } });
const Field = ({ label, children }) => (
  <div><label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>{children}</div>
);
const Input = ({ field, type = 'text', ...rest }) => {
  const { form, set } = React.useContext(_PFCtx);
  return (
    <input
      type={type}
      value={form[field] ?? ''}
      onChange={e => set(field, e.target.value)}
      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
      {...rest}
    />
  );
};
const PFSelect = ({ field, options }) => {
  const { form, set } = React.useContext(_PFCtx);
  return (
    <select
      value={form[field] ?? ''}
      onChange={e => set(field, e.target.value)}
      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm"
    >
      {options}
    </select>
  );
};

// Helper to resolve fabric IDs (handles both new and old IDs)
const resolveFabricId = (fabricId) => {
  // If it's a UUID or newer format, return as-is
  // This function is defined here to match the monolith's behavior
  return fabricId;
};

// ─── AddCustomSize inline component ─────────────────────────────────────────
const AddCustomSize = ({ styleCode, mrp, sellingPrice, existingSizes, onAdd }) => {
  const [customSize, setCustomSize] = useState('');
  const handleAdd = () => {
    const size = customSize.trim().toUpperCase();
    if (!size) return;
    if (existingSizes.includes(size)) { alert(`Size "${size}" already exists.`); return; }
    onAdd({
      size,
      label: size,
      sku: generateSKU(styleCode, size),
      mrp: +mrp || 0,
      sellingPrice: +sellingPrice || +mrp || 0,
      compareAtPrice: +mrp || 0,
      active: true,
      inventory: 0,
      barcode: '',
    });
    setCustomSize('');
  };
  return (
    <div className="flex items-center gap-2">
      <input type="text" value={customSize} onChange={e => setCustomSize(e.target.value)}
        placeholder="Add size (e.g. XXXL, 3XL, Free)"
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1"
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }} />
      <button type="button" onClick={handleAdd}
        className="px-3 py-2 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1">
        <Icon name="plus" cls="w-3 h-3" /> Add Size
      </button>
    </div>
  );
};

// ─── ProductForm component ───────────────────────────────────────────────────

const ProductForm = ({ product, fabrics, stitchingMaster, dyes, categories, consumption, onSave, onClose, onSubmitForReview }) => {
  const [form, setForm] = useState(() => {
    const base = product || emptyProduct();
    // Migrate legacy bottomCogs → setComponents if needed
    if (base.isSet && base.bottomCogs > 0 && (!base.setComponents || base.setComponents.length === 0)) {
      return {
        ...base, setComponents: [
          emptyPiece('Piece 1'),
          { ...emptyPiece('Piece 2'), accessories: base.bottomCogs },
        ]
      };
    }
    return { ...base, setComponents: base.setComponents || [] };
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (form.fabricId) {
      var resolvedId = resolveFabricId(form.fabricId);
      var fab = fabrics.find(function (f) { return f.id === form.fabricId || f.id === resolvedId || f._oldId === form.fabricId; });
      if (fab) { set('fabricName', fab.name); set('costPerMetre', fab.costPerMetre); set('costType', fab.costType || 'per_metre'); }
    }
  }, [form.fabricId]);

  useEffect(() => {
    const match = stitchingMaster.find(s => s.category === form.category);
    if (match && !product) set('stitching', match.cost);
  }, [form.category]);

  // Auto-fill metres from consumption master (single product)
  useEffect(() => {
    if (!form.isSet && form.category && form.fabricId && consumption && consumption.length > 0) {
      var resolvedFabId = resolveFabricId(form.fabricId);
      var rule = consumption.find(function (c) { var rc = resolveFabricId(c.fabricId); return c.category === form.category && (rc === resolvedFabId || c.fabricId === form.fabricId); });
      if (rule) set('metres', rule.metres);
    }
  }, [form.category, form.fabricId, form.isSet]);

  useEffect(() => {
    if (form.dyeId) {
      const d = dyes.find(d => d.id === form.dyeId);
      if (d) set('dyePerMetre', d.costPerMetre);
    }
  }, [form.dyeId]);

  // Auto-update variant SKUs when style code changes
  useEffect(() => {
    if (form.variants && form.variants.length > 0 && form.styleCode) {
      const needsUpdate = form.variants.some(v => v.sku !== generateSKU(form.styleCode, v.size));
      if (needsUpdate) {
        setForm(f => ({
          ...f,
          variants: f.variants.map(v => ({ ...v, sku: generateSKU(f.styleCode, v.size) }))
        }));
      }
    }
  }, [form.styleCode]);

  // Set component helpers
  const addPiece = () => setForm(f => ({ ...f, setComponents: [...(f.setComponents || []), emptyPiece()] }));
  const removePiece = (idx) => setForm(f => ({ ...f, setComponents: f.setComponents.filter((_, i) => i !== idx) }));
  const updatePiece = (idx, field, val) => setForm(f => {
    let extra = {};
    if (field === 'fabricId' && val) {
      var resolvedId = resolveFabricId(val);
      var fab = fabrics.find(function (x) { return x.id === val || x.id === resolvedId || x._oldId === val; });
      if (fab) extra = { fabricName: fab.name, costPerMetre: fab.costPerMetre, costType: fab.costType || 'per_metre' };
    }
    if (field === 'dyeId' && val) {
      const d = dyes.find(x => x.id === val);
      if (d) extra = { dyePerMetre: d.costPerMetre };
    }
    if (field === 'category' && val) {
      const cat = categories.find(x => x.name === val);
      const accTotal = cat && cat.defaultAccessories ? cat.defaultAccessories.reduce((s, a) => s + a.cost, 0) : 0;
      const stitchMatch = stitchingMaster.find(s => s.category === val);
      extra = { ...(accTotal > 0 ? { accessories: accTotal } : {}), ...(stitchMatch ? { stitching: stitchMatch.cost } : {}) };
      // Auto-fill metres if fabricId already set
      const currentPiece = f.setComponents[idx];
      if (currentPiece && currentPiece.fabricId && consumption && consumption.length > 0) {
        const resolvedFabId = resolveFabricId(currentPiece.fabricId);
        const rule = consumption.find(function (c) { var rc = resolveFabricId(c.fabricId); return c.category === val && (rc === resolvedFabId || c.fabricId === currentPiece.fabricId); });
        if (rule) extra = { ...extra, metres: rule.metres };
      }
    }
    if (field === 'fabricId' && val) {
      const currentPiece = f.setComponents[idx];
      const pieceCategory = field === 'category' ? val : (currentPiece ? currentPiece.category : '');
      if (pieceCategory && consumption && consumption.length > 0) {
        const resolvedFabId = resolveFabricId(val);
        const rule = consumption.find(function (c) { var rc = resolveFabricId(c.fabricId); return c.category === pieceCategory && (rc === resolvedFabId || c.fabricId === val); });
        if (rule) extra = { ...extra, metres: rule.metres };
      }
    }
    const comps = f.setComponents.map((c, i) => i === idx ? { ...c, [field]: val, ...extra } : c);
    return { ...f, setComponents: comps };
  });

  const cogs = calcCogs(form);
  const mrp = +form.mrp || 0;
  const sp = +form.sellingPrice || mrp;
  const gm = gmPct(sp, cogs, mrp);
  const gstRate = gst(sp || mrp);

  const catData = (categories || []).find(c => c.name === form.category);

  const allCatNames = (categories && categories.length > 0) ? categories.map(c => c.name) : CATEGORIES;

  var reviewStatus = form.cogs_review_status || 'pending_entry';
  var reviewCfg = REVIEW_STATUS_CONFIG[reviewStatus] || REVIEW_STATUS_CONFIG.pending_entry;
  var cogsLocked = reviewStatus === 'finalized' || reviewStatus === 'in_review';

  // Wrap set to prevent editing COGS fields when locked
  var guardedSet = function (k, v) {
    if (cogsLocked && COGS_FIELDS.indexOf(k) >= 0) return;
    set(k, v);
  };

  return (
    <_PFCtx.Provider value={{ form, set: cogsLocked ? guardedSet : set }}>
      <div className="space-y-5">
        {/* ── COGS Review Status Banner ──────────────────────────────── */}
        {product && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className={'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ' + reviewCfg.color}>
                <span className={'w-2 h-2 rounded-full ' + reviewCfg.dot}></span>
                {reviewCfg.label}
                {reviewStatus === 'finalized' && <span className="ml-1 opacity-60">— COGS locked</span>}
                {reviewStatus === 'in_review' && <span className="ml-1 opacity-60">— Awaiting review</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {form.cogs_entered_by && (reviewStatus === 'in_review' || reviewStatus === 'finalized') && (
                  <span>Entered by <span className="font-semibold text-gray-700">{form.cogs_entered_by.split('@')[0]}</span>
                    {form.cogs_entered_at && <span className="text-gray-400 ml-1">{new Date(form.cogs_entered_at).toLocaleDateString()}</span>}
                  </span>
                )}
                {form.cogs_finalized_by && reviewStatus === 'finalized' && (
                  <span>Reviewed by <span className="font-semibold text-green-700">{form.cogs_finalized_by.split('@')[0]}</span>
                    {form.cogs_finalized_at && <span className="text-gray-400 ml-1">{new Date(form.cogs_finalized_at).toLocaleDateString()}</span>}
                  </span>
                )}
              </div>
              {onSubmitForReview && (reviewStatus === 'pending_entry' || reviewStatus === 'rejected') && (
                <button type="button" onClick={onSubmitForReview}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center gap-1.5">
                  <Icon name="send" cls="w-3.5 h-3.5" /> Submit for Review
                </button>
              )}
            </div>
            {reviewStatus === 'rejected' && form.cogs_rejection_note && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                <span className="text-red-400 mt-0.5 flex-shrink-0">⚠</span>
                <div>
                  <span className="font-semibold">Rejected</span>
                  {form.cogs_finalized_by && <span className="text-red-500"> by {form.cogs_finalized_by}</span>}
                  {form.cogs_entered_at && <span className="text-red-400 text-xs ml-1">on {new Date(form.cogs_entered_at).toLocaleDateString()}</span>}
                  <span className="text-red-500">: </span>
                  <span className="italic">"{form.cogs_rejection_note}"</span>
                </div>
              </div>
            )}
            {cogsLocked && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-600">
                <Icon name="lock" cls="w-3 h-3" />
                COGS fields are read-only. {reviewStatus === 'finalized' ? 'This product has been finalized.' : 'Waiting for reviewer action.'}
              </div>
            )}
          </div>
        )}

        {/* Costing Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl p-3 sm:p-4" style={{ background: '#0f172a' }}>
          {[['COGS', fmt(n(cogs).toFixed(0))], ['MRP', fmt(mrp)], ['GM%', `${(gm * 100).toFixed(1)}%`], ['GST', `${(gstRate * 100).toFixed(0)}%`]].map(([l, v]) => (
            <div key={l} className="text-center">
              <div className="text-white/40 text-xs">{l}</div>
              <div className="text-white font-bold text-xs sm:text-sm mt-0.5 sm:mt-1">{v}</div>
            </div>
          ))}
        </div>

        {/* Identity */}
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Identity</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 form-grid-2">
            <Field label="Style Code *"><Input field="styleCode" placeholder="HL-KU-01" /></Field>
            <Field label="Category">
              <PFSelect field="category" options={[
                <option key="select-empty" value="">-- Select Category --</option>,
                ...(form.category && !allCatNames.includes(form.category) ? [<option key={form.category} value={form.category}>{form.category}</option>] : []),
                ...allCatNames.map(c => <option key={c} value={c}>{c}</option>)
              ]} />
            </Field>
            <Field label="Product Title"><Input field="productTitle" /></Field>
            <Field label="Product Name"><Input field="productName" /></Field>
            <Field label="Primary Colour"><Input field="colourPrimary" /></Field>
            <Field label="Secondary Colour"><Input field="colourSecondary" /></Field>
            <Field label="Status">
              <PFSelect field="status" options={['Active', 'Inactive'].map(s => <option key={s}>{s}</option>)} />
            </Field>
            <Field label="Type">
              <label className="flex items-center gap-2 mt-2.5">
                <input type="checkbox" checked={form.isSet} onChange={e => {
                  const checked = e.target.checked;
                  setForm(f => ({
                    ...f, isSet: checked,
                    setComponents: checked && (!f.setComponents || f.setComponents.length === 0)
                      ? [emptyPiece('Piece 1'), emptyPiece('Piece 2')]
                      : f.setComponents
                  }));
                }} className="w-4 h-4 accent-yellow-500" />
                <span className="text-sm text-gray-600">This is a set (multiple pieces)</span>
              </label>
            </Field>
          </div>
        </div>

        {/* SET: Multi-piece builder */}
        {form.isSet ? (
          <div style={cogsLocked ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Set Pieces</div>
                <div className="text-xs text-gray-400 mt-0.5">Each piece has its own costing. Total COGS = sum of all pieces.</div>
              </div>
              <button onClick={addPiece} className="btn-gold px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1">
                <Icon name="plus" cls="w-3 h-3" /> Add Piece
              </button>
            </div>
            {(form.setComponents || []).map((piece, idx) => {
              const pieceCogs = calcPieceCogs({ metres: +piece.metres || 0, costPerMetre: +piece.costPerMetre || 0, dyePerMetre: +piece.dyePerMetre || 0, stitching: +piece.stitching || 0, embroidery: +piece.embroidery || 0, accessories: +piece.accessories || 0 });
              return (
                <div key={piece.id} className="border border-gray-200 rounded-xl mb-3">
                  <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="bg-gold-400 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0" style={{ background: '#d4a843' }}>{idx + 1}</span>
                      <input value={piece.name || ''} onChange={e => updatePiece(idx, 'name', e.target.value)}
                        placeholder={`Piece ${idx + 1} name (e.g. Kurta, Dhoti, Dupatta)`}
                        className="text-sm font-semibold text-gray-700 bg-transparent border-none outline-none flex-1 min-w-0" />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-indigo-600 font-semibold">₹{pieceCogs.toFixed(0)}</span>
                      {(form.setComponents || []).length > 1 && (
                        <button onClick={() => removePiece(idx)} className="text-red-400 hover:text-red-600 p-1 rounded"><Icon name="trash" cls="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    {/* Category row */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Piece Category</label>
                      <select value={piece.category || ''} onChange={e => updatePiece(idx, 'category', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-amber-50 border-amber-200">
                        <option value="">— Select category —</option>
                        {piece.category && !allCatNames.includes(piece.category) && (
                          <option value={piece.category}>{piece.category}</option>
                        )}
                        {allCatNames.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {piece.category && (() => {
                        const cat = categories.find(x => x.name === piece.category);
                        return cat && cat.defaultAccessories && cat.defaultAccessories.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {cat.defaultAccessories.map(a => (
                              <span key={a.id} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100">{a.name} ₹{a.cost}</span>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </div>
                    {/* Fabric row */}
                    <div className={`grid gap-2 ${piece.costType === 'total' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
                      <div className={piece.costType === 'total' ? '' : 'col-span-2 sm:col-span-1'}>
                        <label className="block text-xs text-gray-400 mb-1">Fabric (Master)</label>
                        <FabricPicker fabrics={fabrics} value={piece.fabricId || ''} onChange={v => updatePiece(idx, 'fabricId', v)} showCost compact placeholder="— Select fabric —" />
                      </div>
                      {piece.costType !== 'total' && (
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Metres</label>
                          <input type="number" step="0.1" value={piece.metres || ''} placeholder="2.5"
                            onChange={e => updatePiece(idx, 'metres', e.target.value === '' ? '' : +e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
                        </div>
                      )}
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">{piece.costType === 'total' ? 'Fabric Cost — Total (₹)' : 'Cost/m (₹)'}</label>
                        <input type="number" value={piece.costPerMetre || ''} placeholder={piece.costType === 'total' ? '1500' : '320'}
                          onChange={e => updatePiece(idx, 'costPerMetre', e.target.value === '' ? '' : +e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
                      </div>
                    </div>
                    {/* Dye row */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-xs text-gray-400 mb-1">Dye Type</label>
                        <select value={piece.dyeId || ''} onChange={e => updatePiece(idx, 'dyeId', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm">
                          <option value="">No Dye</option>
                          {dyes.map(d => <option key={d.id} value={d.id}>{d.type} (₹{d.costPerMetre}/m)</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Dye/m (₹)</label>
                        <input type="number" value={piece.dyePerMetre || ''} placeholder="0"
                          onChange={e => updatePiece(idx, 'dyePerMetre', e.target.value === '' ? '' : +e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Emb. Type</label>
                        <select value={piece.embroidery_type || ''} onChange={e => updatePiece(idx, 'embroidery_type', e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm">
                          <option value="">None</option>
                          <option value="Hand Embroidery">Hand</option>
                          <option value="Machine Embroidery">Machine</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Embroidery (₹)</label>
                        <input type="number" value={piece.embroidery || ''} placeholder="0"
                          onChange={e => updatePiece(idx, 'embroidery', e.target.value === '' ? '' : +e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
                      </div>
                    </div>
                    {/* Stitching + Accessories row */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Stitching (₹)</label>
                        <div className="flex gap-1.5">
                          <input type="number" value={piece.stitching || ''} placeholder="250"
                            onChange={e => updatePiece(idx, 'stitching', e.target.value === '' ? '' : +e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
                          <select onChange={e => { const m = stitchingMaster.find(s => s.id === e.target.value); if (m) updatePiece(idx, 'stitching', m.cost); }}
                            className="border border-gray-200 rounded-lg px-1.5 py-2 text-xs text-gray-500 flex-shrink-0" defaultValue="">
                            <option value="">↑</option>
                            {stitchingMaster.map(s => <option key={s.id} value={s.id}>{s.garmentType} ₹{s.cost}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Accessories (₹)</label>
                        <input type="number" value={piece.accessories || ''} placeholder="0"
                          onChange={e => updatePiece(idx, 'accessories', e.target.value === '' ? '' : +e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {(form.setComponents || []).length === 0 && (
              <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-xl">
                <div className="text-gray-400 text-sm">No pieces added yet</div>
                <button onClick={addPiece} className="mt-2 text-xs text-indigo-600 hover:underline">+ Add first piece</button>
              </div>
            )}
            {/* Set COGS total */}
            <div className="flex justify-end mt-1">
              <div className="bg-indigo-50 rounded-lg px-4 py-2 text-xs text-indigo-700">
                <span className="text-indigo-400">Total COGS ({(form.setComponents || []).length} pieces):</span>
                <span className="font-bold ml-2">{fmt(n(cogs).toFixed(0))}</span>
              </div>
            </div>
          </div>
        ) : (
          /* SINGLE: Standard costing fields */
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Fabric & Costing</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 form-grid-2" style={cogsLocked ? { opacity: 0.7, pointerEvents: 'none' } : undefined}>
              <Field label="Fabric">
                <FabricPicker fabrics={fabrics} value={form.fabricId || ''} onChange={v => set('fabricId', v)} showCost placeholder="— Select fabric —" />
                {form.fabricId && (() => {
                  var fab = fabrics.find(function (f) { return f.id === form.fabricId || f.id === resolveFabricId(form.fabricId) || f._oldId === form.fabricId; });
                  return fab && fab.vendorName ? (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">Vendor:</span>
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{fab.vendorName}</span>
                      <span className="text-xs text-gray-400 font-mono">{fab.vendorId}</span>
                    </div>
                  ) : null;
                })()}
              </Field>
              <Field label="Fabric Name"><Input field="fabricName" placeholder="Semi Raw Silk" /></Field>
              {form.costType !== 'total' && (
                <Field label="Metres"><Input field="metres" type="number" step="0.1" placeholder="2.5" /></Field>
              )}
              <Field label={form.costType === 'total' ? "Fabric Cost — Total (₹)" : "Cost / Metre (₹)"}><Input field="costPerMetre" type="number" placeholder={form.costType === 'total' ? "1500" : "250"} /></Field>
              <Field label="Dye Type">
                <select value={form.dyeId || ''} onChange={e => set('dyeId', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
                  <option value="">No Dye</option>
                  {dyes.map(d => <option key={d.id} value={d.id}>{d.type} (₹{d.costPerMetre}/m)</option>)}
                </select>
              </Field>
              <Field label="Dye Cost / Metre (₹)"><Input field="dyePerMetre" type="number" placeholder="40" /></Field>
              <Field label="Embroidery Type">
                <select value={form.embroidery_type || ''} onChange={e => guardedSet('embroidery_type', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm">
                  <option value="">None</option>
                  <option value="Hand Embroidery">Hand Embroidery</option>
                  <option value="Machine Embroidery">Machine Embroidery</option>
                </select>
              </Field>
              <Field label="Embroidery Cost (₹)"><Input field="embroidery" type="number" placeholder="0" /></Field>
              <Field label="Stitching (₹)">
                <div className="flex gap-2">
                  <Input field="stitching" type="number" placeholder="600" />
                  <select onChange={e => { const m = stitchingMaster.find(s => s.id === e.target.value); if (m) set('stitching', m.cost); }} className="border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-500 flex-shrink-0" defaultValue="">
                    <option value="">↑ From master</option>
                    {stitchingMaster.map(s => <option key={s.id} value={s.id}>{s.garmentType}</option>)}
                  </select>
                </div>
              </Field>
              <Field label="Accessories / Other (₹)">
                <div className="flex gap-2">
                  <Input field="accessories" type="number" placeholder="0" />
                  {catData && catData.defaultAccessories && catData.defaultAccessories.length > 0 && (
                    <button type="button" onClick={() => set('accessories', catData.defaultAccessories.reduce((s, a) => s + a.cost, 0))}
                      className="border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-500 flex-shrink-0 hover:bg-gray-50 whitespace-nowrap">
                      ↑ From cat. (₹{catData.defaultAccessories.reduce((s, a) => s + a.cost, 0)})
                    </button>
                  )}
                </div>
              </Field>
            </div>
            {catData && catData.defaultAccessories && catData.defaultAccessories.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {catData.defaultAccessories.map(a => (
                  <span key={a.id} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{a.name} ₹{a.cost}</span>
                ))}
              </div>
            )}
            <div className="mt-3 p-4 bg-gray-50 rounded-xl text-xs text-gray-500 grid grid-cols-2 gap-1.5">
              <div>Fabric: <span className="text-gray-700 font-medium">{fmt(form.costType === 'total' ? (+form.costPerMetre || 0) : (+form.metres || 0) * (+form.costPerMetre || 0))}</span>{form.costType === 'total' && <span className="text-amber-600 ml-1">(total)</span>}</div>
              <div>Dye: <span className="text-gray-700 font-medium">{fmt(form.costType === 'total' ? 0 : (+form.dyePerMetre || 0) * (+form.metres || 0))}</span></div>
              <div>Embroidery: <span className="text-gray-700 font-medium">{fmt(+form.embroidery || 0)}</span></div>
              <div>Stitching: <span className="text-gray-700 font-medium">{fmt(+form.stitching || 0)}</span></div>
              <div>GST: <span className="text-gray-700 font-medium">{(gstRate * 100).toFixed(0)}% ({mrp > 2500 ? '≥2.5k' : '<2.5k'})</span></div>
            </div>
          </div>
        )}

        {/* Pricing & Variants */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pricing & Variants</div>
              <div className="text-xs text-gray-400 mt-0.5">Set base MRP/SP, then customise per-size. SKUs auto-generate from style code.</div>
            </div>
          </div>
          {/* Base pricing row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
            <Field label="Base MRP (₹)"><Input field="mrp" type="number" placeholder="4000" /></Field>
            <Field label="Base Selling Price (₹)"><Input field="sellingPrice" type="number" placeholder="3400" /></Field>
            <Field label="Discount %">
              <div className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-500 bg-gray-50">
                {mrp > 0 ? `${(((mrp - sp) / mrp) * 100).toFixed(1)}%` : '—'}
              </div>
            </Field>
            <div className="flex items-end">
              <button type="button" onClick={() => {
                const variants = buildDefaultVariants(form.styleCode, form.mrp, form.sellingPrice);
                setForm(f => ({ ...f, variants }));
              }}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all">
                <Icon name="plus" cls="w-3 h-3" /> Generate All Sizes
              </button>
            </div>
          </div>

          {/* Variants grid */}
          {(form.variants && form.variants.length > 0) && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3 py-2 text-center" style={{ background: '#f5f4f0' }}>
                <div className="col-span-1 text-left" style={{ fontSize: 9, letterSpacing: '0.08em', color: '#9c9b97', fontFamily: 'Inter,sans-serif', fontWeight: 600, textTransform: 'uppercase' }}>Active</div>
                <div className="col-span-1 text-left" style={{ fontSize: 9, letterSpacing: '0.08em', color: '#9c9b97', fontFamily: 'Inter,sans-serif', fontWeight: 600, textTransform: 'uppercase' }}>Size</div>
                <div className="col-span-3 text-left" style={{ fontSize: 9, letterSpacing: '0.08em', color: '#9c9b97', fontFamily: 'Inter,sans-serif', fontWeight: 600, textTransform: 'uppercase' }}>SKU</div>
                <div className="col-span-2 text-left" style={{ fontSize: 9, letterSpacing: '0.08em', color: '#795900', fontFamily: 'Inter,sans-serif', fontWeight: 600, textTransform: 'uppercase' }}>MRP (₹)</div>
                <div className="col-span-2 text-left" style={{ fontSize: 9, letterSpacing: '0.08em', color: '#795900', fontFamily: 'Inter,sans-serif', fontWeight: 600, textTransform: 'uppercase' }}>Selling Price (₹)</div>
                <div className="col-span-2 text-left" style={{ fontSize: 9, letterSpacing: '0.08em', color: '#9c9b97', fontFamily: 'Inter,sans-serif', fontWeight: 600, textTransform: 'uppercase' }}>Compare At (₹)</div>
                <div className="col-span-1 text-right" style={{ fontSize: 9, letterSpacing: '0.08em', color: '#9c9b97', fontFamily: 'Inter,sans-serif', fontWeight: 600, textTransform: 'uppercase' }}></div>
              </div>
              {form.variants.map((v, idx) => (
                <div key={v.size} className="grid grid-cols-2 sm:grid-cols-12 gap-2 px-3 py-2 items-center border-t border-gray-100">
                  {/* Active toggle */}
                  <div className="col-span-1">
                    <input type="checkbox" checked={v.active !== false} onChange={e => {
                      const variants = [...form.variants];
                      variants[idx] = { ...variants[idx], active: e.target.checked };
                      setForm(f => ({ ...f, variants }));
                    }} className="w-4 h-4 accent-yellow-500 rounded" />
                  </div>
                  {/* Size label */}
                  <div className="col-span-1">
                    <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ background: v.active !== false ? '#fef3c7' : '#f3f4f6', color: v.active !== false ? '#92400e' : '#9ca3af' }}>{v.size}</span>
                  </div>
                  {/* SKU (read-only, auto-generated) */}
                  <div className="col-span-3 sm:col-span-3">
                    <input type="text" value={v.sku || ''} readOnly
                      className="w-full border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-gray-50 text-gray-600" />
                  </div>
                  {/* MRP */}
                  <div className="col-span-1 sm:col-span-2">
                    <input type="number" value={v.mrp || ''} placeholder="MRP"
                      onChange={e => {
                        const variants = [...form.variants];
                        const newMrp = e.target.value === '' ? '' : +e.target.value;
                        variants[idx] = { ...variants[idx], mrp: newMrp, compareAtPrice: newMrp };
                        setForm(f => ({ ...f, variants }));
                      }}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" />
                  </div>
                  {/* Selling Price */}
                  <div className="col-span-1 sm:col-span-2">
                    <input type="number" value={v.sellingPrice || ''} placeholder="SP"
                      onChange={e => {
                        const variants = [...form.variants];
                        variants[idx] = { ...variants[idx], sellingPrice: e.target.value === '' ? '' : +e.target.value };
                        setForm(f => ({ ...f, variants }));
                      }}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" />
                  </div>
                  {/* Compare at price (= MRP, shown as strikethrough on Shopify) */}
                  <div className="col-span-1 sm:col-span-2">
                    <input type="number" value={v.compareAtPrice || ''} placeholder="Compare"
                      onChange={e => {
                        const variants = [...form.variants];
                        variants[idx] = { ...variants[idx], compareAtPrice: e.target.value === '' ? '' : +e.target.value };
                        setForm(f => ({ ...f, variants }));
                      }}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-400" />
                  </div>
                  {/* Remove */}
                  <div className="col-span-1 text-right">
                    <button type="button" onClick={() => {
                      setForm(f => ({ ...f, variants: f.variants.filter((_, i) => i !== idx) }));
                    }} className="p-1 text-gray-300 hover:text-red-400 rounded">
                      <Icon name="trash" cls="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {/* Apply base prices to all */}
              <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between" style={{ background: '#faf9f5' }}>
                <span className="text-xs text-gray-400">{form.variants.filter(v => v.active !== false).length} active variant{form.variants.filter(v => v.active !== false).length !== 1 ? 's' : ''}</span>
                <button type="button" onClick={() => {
                  const baseMrp = +form.mrp || 0;
                  const baseSp = +form.sellingPrice || baseMrp;
                  setForm(f => ({
                    ...f,
                    variants: f.variants.map(v => ({
                      ...v,
                      mrp: baseMrp,
                      sellingPrice: baseSp,
                      compareAtPrice: baseMrp,
                      sku: generateSKU(f.styleCode, v.size),
                    }))
                  }));
                }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1">
                  ↻ Apply base prices & refresh SKUs
                </button>
              </div>
            </div>
          )}

          {/* Add individual size */}
          {(!form.variants || form.variants.length === 0) ? (
            <div className="text-center py-4 border-2 border-dashed border-gray-200 rounded-xl mt-2">
              <div className="text-gray-400 text-sm mb-2">No variants yet</div>
              <button type="button" onClick={() => {
                const variants = buildDefaultVariants(form.styleCode, form.mrp, form.sellingPrice);
                setForm(f => ({ ...f, variants }));
              }}
                className="text-xs text-amber-700 hover:underline">Generate all sizes from style code</button>
            </div>
          ) : (
            <div className="mt-2">
              <AddCustomSize styleCode={form.styleCode} mrp={form.mrp} sellingPrice={form.sellingPrice}
                existingSizes={form.variants.map(v => v.size)}
                onAdd={(newVariant) => setForm(f => ({ ...f, variants: [...f.variants, newVariant] }))} />
            </div>
          )}
        </div>

        {/* Images */}
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Images</div>
          <Field label="Primary Image URL">
            <Input field="image_url" placeholder="https://cdn.shopify.com/..." />
          </Field>
          {form.image_url && (
            <div className="mt-2">
              <img src={form.image_url} alt="Product" className="w-24 h-24 object-cover rounded-xl border border-gray-100" onError={e => e.target.style.display = 'none'} />
            </div>
          )}
          {(form.shopify_images && form.shopify_images.length > 0) && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {form.shopify_images.map((url, i) => (
                <img key={i} src={url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-100 cursor-pointer" onClick={() => set('image_url', url)} title="Set as primary" onError={e => e.target.style.display = 'none'} />
              ))}
            </div>
          )}
        </div>

        {/* Meta */}
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Meta & Tags</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 form-grid-2">
            <Field label="Style Tags"><Input field="styleTag" placeholder="Embroidered, Plain..." /></Field>
            <Field label="Occasion Tags"><Input field="occasionTag" placeholder="Wedding, Festive..." /></Field>
            <Field label="Wash Care"><Input field="washCare" /></Field>
            <Field label="Weight"><Input field="weight" placeholder="230g" /></Field>
            <Field label="HSN Code"><Input field="hsn" placeholder="62114210" /></Field>
            <Field label="Fabric SKU"><Input field="fabricSKU" placeholder="HL-FA-01" /></Field>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={function () { onSave(form) }} className="btn-gold px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2">
            <Icon name="save" cls="w-4 h-4" /> Save
          </button>
          {onSubmitForReview && (reviewStatus === 'pending_entry' || reviewStatus === 'rejected') && (
            <button type="button" onClick={onSubmitForReview}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center gap-2">
              <Icon name="send" cls="w-4 h-4" /> Submit for Review
            </button>
          )}
        </div>
      </div>
    </_PFCtx.Provider>
  );
};

export default ProductForm;

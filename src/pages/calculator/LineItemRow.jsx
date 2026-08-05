import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n } from '../../lib/helpers'
import { cogsTotal, PRODUCT_TYPE_META, COGS_SOURCE_META, isMtfVariant } from '../../lib/orderUtils'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import LineItemCogsEditor from './LineItemCogsEditor'

const LineItemRow = ({ li: liProp, onEditSaved, fabrics, stitchingMaster, dyes, categories, products }) => {
  const [li, setLi] = useState(liProp);
  const [editing, setEditing] = useState(false);
  const [switchingType, setSwitchingType] = useState(false);
  const [saveError, setSaveError] = useState('');
  const total = cogsTotal(li);
  const sp = li.eff_sp_ex_gst || 0;
  const profit = sp - total;
  const gm = sp > 0 ? (profit / sp * 100) : 0;
  const typeMeta = PRODUCT_TYPE_META[li.product_type] || PRODUCT_TYPE_META.standard;
  const srcMeta = COGS_SOURCE_META[li.cogs_source] || COGS_SOURCE_META.estimated;
  const isEmpty = li.cogs_source === 'empty' || (li.product_type === 'custom' && total === 0);

  const handleSave = async (updates) => {
    setSaveError('');
    const { error } = await supa.from('order_line_items').update({
      ...updates,
      updated_at: new Date().toISOString(),
    }).eq('id', li.id);
    if (!error) {
      setLi(prev => ({ ...prev, ...updates }));
      setEditing(false);
      onEditSaved();
    } else {
      setSaveError(`Save failed: ${error.message}`);
    }
  };

  const switchProductType = async () => {
    const newType = li.product_type === 'custom' ? 'standard' : 'custom';
    if (newType === 'custom' && !confirm(
      `Switch "${li.title}" to Custom?\n\nThis will clear all catalogue COGS data for this item. You'll need to enter costs manually.`
    )) return;
    const resetCogs = newType === 'custom' ? {
      cogs_fabric: 0, cogs_dye: 0, cogs_embroidery: 0,
      cogs_stitching: 0, cogs_accessories: 0, cogs_other: 0,
      cogs_source: 'empty', fabric_id: '', dye_id: '',
    } : {};
    setSwitchingType(true);
    setSaveError('');
    const updates = { product_type: newType, ...resetCogs, updated_at: new Date().toISOString() };
    const { error } = await supa.from('order_line_items').update(updates).eq('id', li.id);
    if (!error) {
      setLi(prev => ({ ...prev, ...updates }));
      setEditing(false);
      onEditSaved();
    } else {
      setSaveError(`Failed to switch type: ${error.message}`);
    }
    setSwitchingType(false);
  };

  const gmColor = isEmpty ? 'text-orange-400' : gm >= 65 ? 'text-emerald-700' : gm >= 50 ? 'text-green-600' : gm >= 45 ? 'text-orange-500' : 'text-red-500';
  // COGS breakdown tooltip string
  const breakdown = [
    ['Fab', li.cogs_fabric], ['Dye', li.cogs_dye], ['Emb', li.cogs_embroidery],
    ['Stitch', li.cogs_stitching], ['Acc', li.cogs_accessories], ['Other', li.cogs_other],
  ].filter(([,v]) => (v||0) > 0).map(([l,v]) => `${l}: ${fmt((v||0).toFixed(0))}`).join('  ');

  return (
    <>
      <tr className={`border-b border-gray-100 hover:bg-white/60 transition-colors ${isEmpty ? 'bg-orange-50/30' : ''}`}>
        {/* Product */}
        <td className="px-3 py-2.5">
          <div className="font-medium text-gray-800 text-xs leading-tight">{li.title}</div>
          {li.variant_title && <div className="text-xs text-gray-400 mt-0.5">{li.variant_title}</div>}
          {li.sku && <div className="text-xs text-gray-300 font-mono mt-0.5">{li.sku}</div>}
          {li.cogs_notes && <div className="text-xs text-gray-400 italic mt-0.5">"{li.cogs_notes}"</div>}
        </td>
        {/* Type */}
        <td className="px-2 py-2.5">
          <div className="flex flex-col gap-0.5">
            <span className={`badge text-xs ${typeMeta.bg} w-fit`}>{typeMeta.dot} {typeMeta.label}</span>
            {(li.is_mtf || isMtfVariant(li.variant_title)) && (
              <span className="badge text-xs bg-purple-50 text-purple-700 w-fit">📐 MTF</span>
            )}
            <button onClick={switchProductType} disabled={switchingType}
              className="text-xs text-gray-300 hover:text-indigo-500 underline underline-offset-1 decoration-dotted text-left"
              title={li.product_type === 'custom' ? 'Switch to Standard' : 'Switch to Custom'}>
              {switchingType ? '…' : li.product_type === 'custom' ? '→ Std' : '→ Cust'}
            </button>
          </div>
        </td>
        {/* COGS Source */}
        <td className="px-2 py-2.5">
          <span className={`badge text-xs ${srcMeta.bg} w-fit`}>{srcMeta.label}</span>
          {isEmpty && <div className="text-xs text-orange-500 mt-0.5">⚠ missing</div>}
          <div className="text-xs text-gray-400 mt-0.5">qty {li.quantity}</div>
        </td>
        {/* SP */}
        <td className="px-2 py-2.5 text-right">
          <span className="text-xs font-medium text-gray-700">{fmt(sp.toFixed(0))}</span>
        </td>
        {/* COGS */}
        <td className="px-2 py-2.5 text-right">
          <span className="text-xs font-medium text-gray-700" title={breakdown || undefined}>
            {isEmpty ? '—' : fmt(total.toFixed(0))}
          </span>
          {breakdown && !isEmpty && (
            <div className="text-xs text-gray-300 mt-0.5 whitespace-nowrap">{breakdown}</div>
          )}
        </td>
        {/* GM% */}
        <td className="px-2 py-2.5 text-right">
          <span className={`text-xs font-bold ${gmColor}`}>{isEmpty ? '—' : `${gm.toFixed(1)}%`}</span>
          {!isEmpty && <div className={`text-xs mt-0.5 ${profit >= 0 ? 'text-green-600' : 'text-red-400'}`}>{fmt(profit.toFixed(0))}</div>}
        </td>
        {/* Action */}
        <td className="px-2 py-2.5 text-center">
          <button onClick={() => setEditing(v => !v)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${editing ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : isEmpty ? 'bg-orange-50 text-orange-700 border-orange-200' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            {editing ? 'Cancel' : isEmpty ? 'Enter' : 'Edit'}
          </button>
        </td>
      </tr>
      {saveError && (
        <tr><td colSpan={7} className="px-3 pb-2">
          <div className="text-xs text-red-600 bg-red-50 rounded-lg px-2.5 py-1.5">{saveError}</div>
        </td></tr>
      )}
      {editing && (
        <tr><td colSpan={7} className="px-3 pb-3 bg-indigo-50/20">
          <LineItemCogsEditor
            li={li}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            fabrics={fabrics}
            stitchingMaster={stitchingMaster}
            dyes={dyes}
            categories={categories}
            products={products}
          />
        </td></tr>
      )}
    </>
  );
};

// ─── GrowthView ───────────────────────────────────────────────────────────────

export default LineItemRow

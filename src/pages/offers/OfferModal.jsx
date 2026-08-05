import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, calcCogs, effectiveSP, gmPct } from '../../lib/helpers'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

const OfferModal = ({ product: p, onSave, onClose }) => {
  const cogs = calcCogs(p);
  const [mode, setMode] = useState('sp'); // 'sp' | 'disc'
  const [sp, setSp] = useState(String(p.sellingPrice || p.mrp || ''));
  const [disc, setDisc] = useState(p.mrp > 0 && p.sellingPrice ? String(((p.mrp - p.sellingPrice) / p.mrp * 100).toFixed(1)) : '');
  const [note, setNote] = useState(p.offerNote || '');
  const [groupInput, setGroupInput] = useState(p.offerGroup || '');
  const [groupSuggestions] = useState(['Summer Sale', 'Ethnic Sale', 'Combo', 'Clearance', 'End of Season', 'Flash Sale', 'Bundle Deal']);

  const spNum = +sp || 0;
  const effSP = spNum > 0 ? effectiveSP(spNum, p.mrp) : 0;
  const gm = spNum > 0 ? gmPct(spNum, cogs, p.mrp) : 0;
  const discFromMRP = spNum > 0 && p.mrp > 0 ? ((p.mrp - spNum) / p.mrp) * 100 : 0;
  const gstRate = gst(spNum || p.mrp);

  const handleSpChange = (val) => {
    setSp(val);
    if (p.mrp > 0 && +val > 0) setDisc((((p.mrp - +val) / p.mrp) * 100).toFixed(1));
  };
  const handleDiscChange = (val) => {
    setDisc(val);
    if (p.mrp > 0 && +val >= 0) setSp(Math.round(p.mrp * (1 - +val / 100)).toString());
  };

  const handleSave = () => {
    if (!sp) { alert('Enter a selling price or discount'); return; }
    onSave({ ...p, sellingPrice: +sp, isOffer: true, offerNote: note, offerGroup: groupInput || null });
  };

  const handleRemove = () => {
    onSave({ ...p, isOffer: false, offerNote: '', offerGroup: null });
  };

  return (
    <Modal title={`${p.isOffer ? 'Edit Offer Tag' : 'Tag as Offer'} — ${p.styleCode}`} onClose={onClose}>
      <div className="space-y-4">
        {/* Product summary */}
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="font-semibold text-gray-800 text-sm truncate">{p.productTitle || p.productName}</div>
          <div className="flex gap-3 mt-2 text-xs text-gray-500 flex-wrap">
            <span>COGS: <span className="font-semibold text-gray-700">{fmt(n(cogs).toFixed(0))}</span></span>
            <span>MRP: <span className="font-semibold text-gray-700">{fmt(p.mrp)}</span></span>
          </div>
        </div>

        {/* Mode toggle + inputs */}
        <div>
          <div className="flex gap-2 mb-3">
            <button onClick={() => setMode('sp')} className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${mode==='sp' ? 'btn-gold border-transparent' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>Enter SP (₹)</button>
            <button onClick={() => setMode('disc')} className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${mode==='disc' ? 'btn-gold border-transparent' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>Enter Discount (%)</button>
          </div>
          {mode === 'sp' ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Selling Price (₹)</label>
              <input type="number" value={sp} onChange={e => handleSpChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base font-semibold" placeholder={String(p.mrp)} />
              {disc && <p className="text-xs text-orange-500 mt-1">= {disc}% off MRP</p>}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Discount on MRP (%)</label>
              <input type="number" min="0" max="99" value={disc} onChange={e => handleDiscChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base font-semibold" placeholder="10" />
              {sp && <p className="text-xs text-indigo-500 mt-1">= SP ₹{sp}</p>}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Offer Label (optional)</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Clearance, End of Season, Flash Sale..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Offer Group (optional)</label>
          <input type="text" value={groupInput} onChange={e => setGroupInput(e.target.value)}
            placeholder="e.g. Summer Sale, Ethnic Sale, Combo..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mb-2" />
          <div className="flex gap-1.5 flex-wrap">
            {groupSuggestions.map(g => (
              <button key={g} onClick={() => setGroupInput(g)} type="button"
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${groupInput === g ? 'btn-gold border-transparent' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Live preview */}
        {spNum > 0 && (
          <div className="rounded-xl p-4 space-y-2" style={{background:'#0f172a'}}>
            <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{color:'#d4a843'}}>Preview</div>
            {[
              ['SP', fmt(spNum)],
              ['Discount from MRP', `${discFromMRP.toFixed(1)}%`],
              ['Eff. SP (ex-GST)', fmt(effSP.toFixed(0))],
              ['GM%', `${(gm*100).toFixed(1)}%`],
              ['GST', `${(gstRate*100).toFixed(0)}%`],
            ].map(([l,v]) => (
              <div key={l} className="flex justify-between text-sm">
                <span className="text-white/60">{l}</span>
                <span className={`font-semibold ${l === 'GM%' ? (gm > 0.4 ? 'text-green-400' : gm > 0.2 ? 'text-yellow-400' : 'text-red-400') : 'text-white'}`}>{v}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t">
          {p.isOffer && (
            <button onClick={handleRemove} className="px-4 py-2.5 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50 flex-shrink-0">
              Remove Tag
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} className="btn-gold px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2">
            <Icon name="tag" cls="w-4 h-4" /> {p.isOffer ? 'Update' : 'Tag as Offer'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ─── Offers Page ──────────────────────────────────────────────────────────────

export default OfferModal

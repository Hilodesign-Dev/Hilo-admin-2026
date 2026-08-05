import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'

import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, calcCogs, calcPieceCogs, effectiveSP, gmPct } from '../../lib/helpers'
import { VARIANT_SIZES } from '../../lib/constants'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import AuditStamp from '../../components/AuditStamp'

const ProductView = ({ product: p, onEdit }) => {
  const cogs = calcCogs(p);
  const sp = p.sellingPrice || p.mrp;
  const effSP = effectiveSP(sp, p.mrp);
  const gm = gmPct(sp, cogs, p.mrp);
  const gstRate = gst(p.sellingPrice || p.mrp);
  const [fetchingImgs, setFetchingImgs] = React.useState(false);
  const [imgs, setImgs] = React.useState(p.shopify_images || []);
  const [lightbox, setLightbox] = React.useState(null);

  const fetchShopifyImages = async () => {
    setFetchingImgs(true);
    try {
      const { data } = await supa.from('order_line_items')
        .select('product_id').eq('sku', p.styleCode).limit(1).single();
      if (data && data.product_id) {
        const res = await supa.functions.invoke('get-product-images', { body: { product_id: data.product_id } });
        if (res.data && res.data.images) {
          setImgs(res.data.images);
        }
      }
    } catch(e) { /* ignore */ }
    setFetchingImgs(false);
  };

  const allImgs = [...new Set([...(p.image_url ? [p.image_url] : []), ...imgs])];

  const Row = ({ label, value }) => value ? (
    <div className="flex gap-3 py-2 border-b border-gray-50">
      <div className="w-32 text-xs text-gray-400 font-medium flex-shrink-0">{label}</div>
      <div className="text-sm text-gray-700 flex-1">{value}</div>
    </div>
  ) : null;
  return (
    <div className="space-y-5">
      {/* Audit stamp */}
      {(p.created_by || p.updated_by) && (
        <div className="mb-1">
          <AuditStamp
            createdBy={{ name: p.created_by || 'System', role: p.created_by_role, date: p.created_at }}
            updatedBy={p.updated_by ? { name: p.updated_by, role: p.updated_by_role, date: p.updated_at } : null}
            entityType="product"
            entityId={p.styleCode || p.id}
            compact={false}
          />
        </div>
      )}
      {/* Image gallery */}
      {allImgs.length > 0 ? (
        <div>
          <div className="flex gap-2 flex-wrap">
            {allImgs.map((url, i) => (
              <img key={i} src={url} alt="" className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-xl cursor-pointer border border-gray-100 hover:border-gold-400 transition-all"
                onClick={() => setLightbox(url)} onError={e => e.target.style.display='none'} />
            ))}
            <button onClick={fetchShopifyImages} disabled={fetchingImgs}
              className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-primary hover:text-primary transition-all text-xs">
              {fetchingImgs ? <span className="animate-spin text-lg">⏳</span> : <><span className="text-xl">🔄</span><span>Fetch from Shopify</span></>}
            </button>
          </div>
          {lightbox && (
            <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(0,0,0,0.88)'}} onClick={() => setLightbox(null)}>
              <img src={lightbox} alt="" className="rounded-2xl object-contain" style={{maxWidth:'90vw',maxHeight:'90vh'}} />
              <button className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl font-light" onClick={() => setLightbox(null)}>✕</button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl" style={{background:'#f5f4f0'}}>📷</div>
          <div>
            <div className="text-sm text-gray-500 mb-1">No images yet</div>
            <button onClick={fetchShopifyImages} disabled={fetchingImgs}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1">
              {fetchingImgs ? '⏳ Loading...' : '🔄 Fetch from Shopify'}
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[[' COGS', fmt(n(cogs).toFixed(0)), cogs > 0], ['MRP', fmt(p.mrp), p.mrp > 0], ['Selling Price', fmt(sp), sp > 0], ['Eff. SP (ex-GST)', fmt(n(effSP).toFixed(0)), effSP > 0], ['Gross Margin', `${(n(gm)*100).toFixed(1)}%`, cogs > 0]].map(([l,v,show]) => show && (
          <div key={l} className="bg-gray-50 rounded-xl p-3 sm:p-4 text-center">
            <div className="text-xs text-gray-400">{l}</div>
            <div className="text-base sm:text-xl font-bold text-gray-800 mt-1">{v}</div>
          </div>
        ))}
      </div>
      {/* Variants table */}
      {p.variants && p.variants.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Size Variants & SKUs</div>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{background:'#f5f4f0',borderBottom:'1px solid rgba(27,28,26,0.06)'}}>
                  {['Size','SKU','MRP','Selling Price','Compare At','Status'].map(h => (
                    <th key={h} className="px-3 py-2 text-left" style={{fontSize:9,letterSpacing:'0.08em',color:'#9c9b97',fontFamily:'Inter,sans-serif',fontWeight:600,textTransform:'uppercase'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.variants.map(v => (
                  <tr key={v.size} style={{borderBottom:'1px solid rgba(27,28,26,0.04)',opacity: v.active === false ? 0.4 : 1}}>
                    <td className="px-3 py-2"><span className="text-xs font-bold px-2 py-0.5 rounded" style={{background:'#fef3c7',color:'#92400e'}}>{v.size}</span></td>
                    <td className="px-3 py-2 font-mono text-xs" style={{color:'#795900'}}>{v.sku}</td>
                    <td className="px-3 py-2 font-medium">{v.mrp > 0 ? fmt(v.mrp) : '—'}</td>
                    <td className="px-3 py-2 font-medium" style={{color:'#16a34a'}}>{v.sellingPrice > 0 ? fmt(v.sellingPrice) : '—'}</td>
                    <td className="px-3 py-2 text-gray-400 line-through">{v.compareAtPrice > 0 ? fmt(v.compareAtPrice) : '—'}</td>
                    <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.active !== false ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{v.active !== false ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Identity</div>
          <Row label="Style Code" value={p.styleCode} />
          <Row label="Title" value={p.productTitle} />
          <Row label="Category" value={p.category} />
          <Row label="Is Set" value={p.isSet ? 'Yes' : null} />
          <Row label="Primary Colour" value={p.colourPrimary} />
          <Row label="Status" value={p.status} />
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Costing</div>
          {p.isSet && p.setComponents && p.setComponents.length > 0 ? (
            <div className="space-y-2">
              {p.setComponents.map((piece, idx) => {
                const pCogs = calcPieceCogs({metres:+piece.metres||0,costPerMetre:+piece.costPerMetre||0,dyePerMetre:+piece.dyePerMetre||0,stitching:+piece.stitching||0,embroidery:+piece.embroidery||0,accessories:+piece.accessories||0});
                return (
                  <div key={piece.id||idx} className="bg-gray-50 rounded-lg p-2.5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold text-gray-700">{idx+1}. {piece.name || `Piece ${idx+1}`}</span>
                      <span className="text-xs font-bold text-indigo-600">{fmt(pCogs.toFixed(0))}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-500">
                      {piece.metres > 0 && <span>Fabric: {piece.metres}m × ₹{piece.costPerMetre}</span>}
                      {piece.dyePerMetre > 0 && <span>Dye: ₹{piece.dyePerMetre}/m</span>}
                      {piece.stitching > 0 && <span>Stitching: {fmt(piece.stitching)}</span>}
                      {piece.embroidery > 0 && <span>Embroidery: {fmt(piece.embroidery)}</span>}
                      {piece.accessories > 0 && <span>Accessories: {fmt(piece.accessories)}</span>}
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between items-center border-t pt-2">
                <span className="text-xs font-semibold text-gray-500">Total COGS ({p.setComponents.length} pieces)</span>
                <span className="text-sm font-bold text-gray-800">{fmt(n(cogs).toFixed(0))}</span>
              </div>
            </div>
          ) : (
            <>
              <Row label="Fabric" value={p.fabricName} />
              <Row label="Metres" value={p.metres ? `${p.metres}m` : null} />
              <Row label="Cost/Metre" value={p.costPerMetre ? fmt(p.costPerMetre) : null} />
              <Row label="Embroidery" value={p.embroidery > 0 ? fmt(p.embroidery) : null} />
              <Row label="Stitching" value={p.stitching > 0 ? fmt(p.stitching) : null} />
            </>
          )}
          <Row label="GST Rate" value={`${(gstRate*100).toFixed(0)}%`} />
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Meta</div>
        <Row label="Style Tags" value={p.styleTag} />
        <Row label="Occasion" value={p.occasionTag} />
        <Row label="Wash Care" value={p.washCare} />
        <Row label="Weight" value={p.weight} />
      </div>
      {(p.description || p.fabricDesc) && (
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Description</div>
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-4">{p.description || p.fabricDesc}</p>
        </div>
      )}
      <div className="flex justify-end pt-2 border-t">
        <button onClick={onEdit} className="btn-gold px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2">
          <Icon name="edit" cls="w-4 h-4" /> Edit Product
        </button>
      </div>
    </div>
  );
};

// ─── Offer Modal ──────────────────────────────────────────────────────────────

export default ProductView

// Order & COGS utility functions — extracted from monolith growth section

export const PRODUCT_TYPE_META = {
  standard: { label: 'Standard', bg: 'bg-blue-50 text-blue-700',  dot: '📦' },
  custom:   { label: 'Custom',   bg: 'bg-amber-50 text-amber-700', dot: '✏️' },
  // legacy — old synced rows may have 'mtf'; treat same as standard
  mtf:      { label: 'Standard', bg: 'bg-blue-50 text-blue-700',  dot: '📦' },
};

export const COGS_SOURCE_META = {
  catalogue: { label: 'Catalogue', bg: 'bg-green-50 text-green-700' },
  manual:    { label: 'Manual',    bg: 'bg-indigo-50 text-indigo-700' },
  estimated: { label: 'Estimated', bg: 'bg-gray-100 text-gray-500' },
  empty:     { label: 'Not entered', bg: 'bg-orange-50 text-orange-600' },
};

// Helper: is this line item an MTF (Made To Fit) size?
export const isMtfVariant = (variantTitle) => {
  const vt = (variantTitle || '').toLowerCase().trim();
  return vt === 'mtf' || vt.includes('mtf') || vt === 'made to fit' || vt === 'made-to-fit';
};

// Client-side SKU lookup — mirrors edge function progressive prefix stripping
// e.g. "HL-HC-10-L" → tries "HL-HC-10" → finds catalogue match
export const findProductBySku = (sku, products) => {
  if (!sku || !products?.length) return null;
  const lower = sku.toLowerCase().trim();
  let found = products.find(p => (p.styleCode || p.sku || '').toLowerCase().trim() === lower);
  if (found) return found;
  const parts = lower.split('-');
  for (let i = parts.length - 1; i >= 2; i--) {
    const prefix = parts.slice(0, i).join('-');
    found = products.find(p => (p.styleCode || p.sku || '').toLowerCase().trim() === prefix);
    if (found) return found;
  }
  return null;
};

// Extract per-unit COGS components from a catalogue product (handles sets)
export const extractCatalogueComponents = (p) => {
  if (p.isSet && p.setComponents?.length) {
    let fab = 0, dye = 0, emb = 0, stitch = 0, acc = 0, metres = 0;
    const first = p.setComponents[0];
    for (const pc of p.setComponents) {
      const m = Number(pc.metres ?? 0);
      fab    += Number(pc.fabricCost    ?? (m * Number(pc.costPerMetre ?? 0)));
      dye    += Number(pc.dyeCost       ?? (Number(pc.dyePerMetre ?? 0) * m));
      emb    += Number(pc.embroidery    ?? 0);
      stitch += Number(pc.stitchCost    ?? pc.stitching ?? 0);
      acc    += Number(pc.accessories   ?? pc.accessoriesCost ?? 0);
      metres += m;
    }
    return {
      fabricId:     first?.fabricId    || p.fabricId    || '',
      metres,
      costPerMetre: metres > 0 ? fab / metres : 0,
      dyeId:        first?.dyeId       || p.dyeId       || '',
      dyePerMetre:  metres > 0 ? dye / metres : 0,
      embroidery:   emb,
      stitching:    stitch,
      accessories:  acc,
    };
  }
  const m   = Number(p.metres ?? 0);
  const cpm = Number(p.costPerMetre ?? 0);
  const dpm = Number(p.dyePerMetre ?? 0);
  return {
    fabricId:     p.fabricId  || '',
    metres:       m,
    costPerMetre: cpm,
    dyeId:        p.dyeId     || '',
    dyePerMetre:  dpm,
    embroidery:   Number(p.embroidery  ?? 0),
    stitching:    Number(p.stitchCost  ?? p.stitching ?? 0),
    accessories:  Number(p.accessories ?? p.accessoriesCost ?? 0),
  };
};

// Sum all COGS components for a line item
export const cogsTotal = (li) =>
  (li.cogs_fabric||0) + (li.cogs_dye||0) + (li.cogs_embroidery||0) +
  (li.cogs_stitching||0) + (li.cogs_accessories||0) + (li.cogs_other||0);

// Outsource vendor type badge colors
export const typeColor = (t) => {
  const m = { Tailoring:'bg-blue-50 text-blue-700', Dyeing:'bg-purple-50 text-purple-700', 'Hand Embroidery':'bg-amber-50 text-amber-700', 'Machine Embroidery':'bg-orange-50 text-orange-700', 'Hand Painting':'bg-pink-50 text-pink-700', Shoes:'bg-green-50 text-green-700', Other:'bg-gray-100 text-gray-500' };
  return m[t] || 'bg-gray-100 text-gray-500';
};

import React, { useState, useEffect, useMemo } from 'react'
import { supa } from '../../lib/supabase'
import { fmt, n } from '../../lib/helpers'
import { PRODUCTION_STAGES, PRODUCT_STATUS_META, SPECIAL_STATUSES, getNextStage, canAdvanceStage, canSendToSpecial, allItemsReady, hasSpecialItems } from '../../lib/stateMachine'
import { ProductStatusBadge, ProductionStepper, ProductionProgressBar } from '../../components/OrderStatusBadge'
import Icon from '../../components/Icon'

const ProductionTab = ({ orders, onOrderUpdated }) => {
  const [lineItems, setLineItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(new Set());

  // Only show items for in_progress orders
  const inProgressOrderIds = useMemo(() =>
    orders.filter(o => o.order_status === 'in_progress').map(o => o.id),
    [orders]
  );

  const loadLineItems = async () => {
    if (inProgressOrderIds.length === 0) { setLineItems([]); setLoading(false); return; }
    setLoading(true);
    // Load in batches if needed (Supabase .in() has a limit)
    const batchSize = 50;
    let allItems = [];
    for (let i = 0; i < inProgressOrderIds.length; i += batchSize) {
      const batch = inProgressOrderIds.slice(i, i + batchSize);
      const { data } = await supa
        .from('order_line_items')
        .select('*, shopify_orders!inner(order_number, customer_name, order_status)')
        .in('order_id', batch)
        .order('order_id');
      if (data) allItems = [...allItems, ...data];
    }
    setLineItems(allItems);
    setLoading(false);
  };

  useEffect(() => { loadLineItems(); }, [inProgressOrderIds.join(',')]);

  // Stage counts for filter pills
  const stageCounts = useMemo(() => {
    const counts = { all: lineItems.length };
    lineItems.forEach(li => {
      const s = li.production_stage || 'pending';
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [lineItems]);

  const filtered = useMemo(() => {
    return lineItems.filter(li => {
      const stage = li.production_stage || 'pending';
      if (stageFilter !== 'all' && stage !== stageFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const orderNum = li.shopify_orders?.order_number || '';
        const customer = li.shopify_orders?.customer_name || '';
        const title = li.title || '';
        return orderNum.toLowerCase().includes(q) || customer.toLowerCase().includes(q) || title.toLowerCase().includes(q);
      }
      return true;
    });
  }, [lineItems, stageFilter, search]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const setItemLoading = (id, isLoading) => {
    setActionLoading(prev => {
      const s = new Set(prev);
      isLoading ? s.add(id) : s.delete(id);
      return s;
    });
  };

  const advanceStage = async (li) => {
    const next = getNextStage(li.production_stage);
    if (!next) return;
    setItemLoading(li.id, true);
    await supa.from('order_line_items').update({
      production_stage: next,
      previous_status: li.production_stage
    }).eq('id', li.id);

    // Update local state
    setLineItems(prev => prev.map(item =>
      item.id === li.id ? { ...item, production_stage: next, previous_status: li.production_stage } : item
    ));

    // Check if all items for this order are now ready → auto-advance order
    await checkOrderAutoAdvance(li.order_id);
    setItemLoading(li.id, false);
  };

  const setStage = async (li, newStage) => {
    setItemLoading(li.id, true);
    await supa.from('order_line_items').update({
      production_stage: newStage,
      previous_status: li.production_stage
    }).eq('id', li.id);

    setLineItems(prev => prev.map(item =>
      item.id === li.id ? { ...item, production_stage: newStage, previous_status: li.production_stage } : item
    ));

    if (newStage === 'alterations' || newStage === 'trials') {
      // Revert order to in_progress if needed (it should already be)
      await supa.from('shopify_orders').update({ order_status: 'in_progress' }).eq('id', li.order_id);
    } else {
      await checkOrderAutoAdvance(li.order_id);
    }
    setItemLoading(li.id, false);
  };

  const resolveSpecial = async (li) => {
    // Send item back to fabrication
    setItemLoading(li.id, true);
    await supa.from('order_line_items').update({
      production_stage: 'fabrication',
      previous_status: li.production_stage
    }).eq('id', li.id);

    setLineItems(prev => prev.map(item =>
      item.id === li.id ? { ...item, production_stage: 'fabrication', previous_status: li.production_stage } : item
    ));
    setItemLoading(li.id, false);
  };

  const requestReturn = async (li) => {
    setItemLoading(li.id, true);
    await supa.from('order_line_items').update({
      production_stage: 'return_requested',
      previous_status: li.production_stage
    }).eq('id', li.id);

    setLineItems(prev => prev.map(item =>
      item.id === li.id ? { ...item, production_stage: 'return_requested', previous_status: li.production_stage } : item
    ));
    setItemLoading(li.id, false);
  };

  const acceptReturn = async (li) => {
    setItemLoading(li.id, true);
    await supa.from('order_line_items').update({
      production_stage: 'returned',
      previous_status: li.production_stage
    }).eq('id', li.id);

    setLineItems(prev => prev.map(item =>
      item.id === li.id ? { ...item, production_stage: 'returned', previous_status: li.production_stage } : item
    ));
    setItemLoading(li.id, false);
  };

  const rejectReturn = async (li) => {
    const restore = li.previous_status || 'ready';
    setItemLoading(li.id, true);
    await supa.from('order_line_items').update({
      production_stage: restore,
      previous_status: null
    }).eq('id', li.id);

    setLineItems(prev => prev.map(item =>
      item.id === li.id ? { ...item, production_stage: restore, previous_status: null } : item
    ));
    await checkOrderAutoAdvance(li.order_id);
    setItemLoading(li.id, false);
  };

  const cancelItem = async (li) => {
    setItemLoading(li.id, true);
    await supa.from('order_line_items').update({
      production_stage: 'cancelled',
      previous_status: li.production_stage
    }).eq('id', li.id);

    setLineItems(prev => prev.map(item =>
      item.id === li.id ? { ...item, production_stage: 'cancelled', previous_status: li.production_stage } : item
    ));
    await checkOrderAutoAdvance(li.order_id);
    setItemLoading(li.id, false);
  };

  // Auto-advance order to ready_to_dispatch if all active items are ready
  const checkOrderAutoAdvance = async (orderId) => {
    const { data: items } = await supa.from('order_line_items').select('production_stage').eq('order_id', orderId);
    if (!items) return;
    const activeItems = items.filter(i => i.production_stage !== 'cancelled' && i.production_stage !== 'returned');
    if (activeItems.length > 0 && activeItems.every(i => i.production_stage === 'ready')) {
      await supa.from('shopify_orders').update({ order_status: 'ready_to_dispatch' }).eq('id', orderId);
      if (onOrderUpdated) onOrderUpdated(orderId, 'ready_to_dispatch');
    } else if (activeItems.some(i => i.production_stage === 'alterations' || i.production_stage === 'trials')) {
      // Keep order in in_progress
    }
  };

  // ── Filter pills ──────────────────────────────────────────────────────────
  const filterStages = [
    { key: 'all', label: 'All' },
    ...PRODUCTION_STAGES.filter(s => s !== 'pending').map(s => ({ key: s, label: PRODUCT_STATUS_META[s].label })),
    { key: 'alterations', label: 'Alterations' },
    { key: 'trials', label: 'Trials' },
  ];

  if (inProgressOrderIds.length === 0) {
    return (
      <div className="bg-white rounded-xl p-10 text-center shadow-sm">
        <div className="text-5xl mb-3">🔧</div>
        <div className="font-semibold text-gray-700">No orders in production</div>
        <div className="text-sm text-gray-400 mt-1">Confirm pending orders to move them into production.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search order #, customer, product…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:w-56 flex-1 sm:flex-none" />
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Stage filter pills */}
      <div className="flex gap-1 flex-wrap">
        {filterStages.map(f => (
          <button key={f.key}
            onClick={() => setStageFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              stageFilter === f.key
                ? 'bg-white text-amber-700 shadow-sm ring-1 ring-amber-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            {f.label}
            {stageCounts[f.key] > 0 && (
              <span className="ml-1 opacity-70">({stageCounts[f.key]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Line items */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Loading production items…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm">
          <div className="text-gray-400 text-sm">No items match the current filter.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(li => {
            const stage = li.production_stage || 'pending';
            const meta = PRODUCT_STATUS_META[stage] || PRODUCT_STATUS_META.pending;
            const isLoading = actionLoading.has(li.id);
            const isInProduction = canAdvanceStage(stage);
            const isSpecial = stage === 'alterations' || stage === 'trials';
            const isReturnRequested = stage === 'return_requested';

            return (
              <div key={li.id} className={`bg-white rounded-xl shadow-sm overflow-hidden border-l-3 ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}
                style={{ borderLeftColor: meta.dot, borderLeftWidth: 3 }}>
                <div className="px-4 py-3">
                  {/* Top row: product info + status */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-400">{li.shopify_orders?.order_number}</span>
                        <span className="text-xs text-gray-300">·</span>
                        <span className="text-xs text-gray-400">{li.shopify_orders?.customer_name || 'Guest'}</span>
                      </div>
                      <div className="font-semibold text-sm text-gray-800 mt-0.5 truncate">{li.title || 'Unknown Product'}</div>
                      {li.sku && <div className="text-xs text-gray-400 mt-0.5">{li.sku}{li.variant_title ? ` · ${li.variant_title}` : ''}{li.quantity > 1 ? ` × ${li.quantity}` : ''}</div>}
                    </div>
                    <ProductStatusBadge status={stage} />
                  </div>

                  {/* Progress stepper (for items in production) */}
                  {PRODUCTION_STAGES.includes(stage) && stage !== 'pending' && (
                    <div className="mb-3">
                      <ProductionStepper currentStage={stage} compact onSetStage={(s) => setStage(li, s)} />
                    </div>
                  )}

                  {/* Progress bar */}
                  {meta.progress !== null && stage !== 'pending' && (
                    <div className="mb-3">
                      <ProductionProgressBar status={stage} />
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Advance to next stage */}
                    {isInProduction && (
                      <button
                        onClick={() => advanceStage(li)}
                        className="btn-gold px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        Next → {PRODUCT_STATUS_META[getNextStage(stage)]?.label}
                      </button>
                    )}

                    {/* Alterations / Trials buttons */}
                    {canSendToSpecial(stage) && stage !== 'alterations' && stage !== 'trials' && (
                      <>
                        <button onClick={() => setStage(li, 'alterations')}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-orange-200 text-orange-600 hover:bg-orange-50">
                          Alterations
                        </button>
                        <button onClick={() => setStage(li, 'trials')}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-teal-200 text-teal-600 hover:bg-teal-50">
                          Trials
                        </button>
                      </>
                    )}

                    {/* Resolve special status */}
                    {isSpecial && (
                      <button onClick={() => resolveSpecial(li)}
                        className="btn-gold px-3 py-1.5 rounded-lg text-xs font-semibold">
                        Resolve → Back to Fabrication
                      </button>
                    )}

                    {/* Return flow */}
                    {(stage === 'ready' || stage === 'shipped' || stage === 'delivered') && (
                      <button onClick={() => requestReturn(li)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-500 hover:bg-red-50">
                        Request Return
                      </button>
                    )}

                    {isReturnRequested && (
                      <>
                        <button onClick={() => acceptReturn(li)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100">
                          Accept Return
                        </button>
                        <button onClick={() => rejectReturn(li)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200">
                          Reject Return
                        </button>
                      </>
                    )}

                    {/* Cancel */}
                    {stage !== 'cancelled' && stage !== 'returned' && (
                      <button onClick={() => cancelItem(li)}
                        className="ml-auto px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-500 hover:bg-red-50">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProductionTab

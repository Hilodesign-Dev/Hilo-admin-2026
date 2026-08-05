import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n } from '../../lib/helpers'
import { CHANNEL_COLORS, DEFAULT_CHANNELS } from '../../lib/constants'
import { cogsTotal, isMtfVariant, PRODUCT_TYPE_META, COGS_SOURCE_META } from '../../lib/orderUtils'
import { ORDER_STATUS_META } from '../../lib/stateMachine'
import { useOrders } from '../../context/OrdersContext'
import { OrderStatusBadge } from '../../components/OrderStatusBadge'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import LineItemRow from '../calculator/LineItemRow'
// DispatchModal removed — status actions belong in Orders tab only
import MarketingROI from './MarketingROI'
import MarketingCampaigns from './MarketingCampaigns'
import AttributionTab from './AttributionTab'
import { getHashPage, getHashSubTab, setHashSubTab, GROWTH_SUBTABS } from '../../lib/navigation'

const GrowthView = ({ user, fabrics, stitching: stitchingMaster, dyes, categories, consumption, products, channels, embedded = false, initialTab = null }) => {
  const ctx = useOrders()
  const [orders, setOrders] = useState([]);
  const [adSpend, setAdSpend] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [tab, setTab] = useState(() => initialTab || getHashSubTab(GROWTH_SUBTABS, 'roi'));
  const switchTab = React.useCallback((t) => {
    if (!embedded) setHashSubTab('growth', t);
    setTab(t);
  }, [embedded]);
  // Sync tab with browser back/forward
  useEffect(() => {
    const onPop = () => {
      const p = getHashPage();
      if (p === 'growth') setTab(getHashSubTab(GROWTH_SUBTABS, 'roi'));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const [channelFilter, setChannelFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editingOrder, setEditingOrder] = useState(null);
  const [newSpend, setNewSpend] = useState({ date: new Date().toISOString().slice(0,10), platform: 'facebook', amount: '' });
  // Line items: { [orderId]: LineItem[] }
  const [lineItems, setLineItems] = useState({});
  const [expandedOrders, setExpandedOrders] = useState(new Set());
  const [loadingLI, setLoadingLI] = useState(new Set());

  // Team members for stylist name lookup in Analytics
  const [teamMembers, setTeamMembers] = useState([]);
  useEffect(() => {
    supa.from('team_members').select('id, name').order('name').then(({ data }) => { if (data) setTeamMembers(data); });
  }, []);
  const stylistName = useCallback((id) => {
    if (!id) return 'Unknown';
    const tm = teamMembers.find(t => String(t.id) === String(id));
    return tm ? tm.name : String(id);
  }, [teamMembers]);

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); // 1st of current month
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [hideReturns, setHideReturns] = useState(true); // exclude returned orders from KPIs by default
  const [loadError, setLoadError] = useState('');
  const ORDERS_PAGE_SIZE = 20;
  const [orderPage, setOrderPage] = useState(1);

  // ── State Machine ─────────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState('all');
  // Status action state removed — Growth is data-only; actions are in Orders tab

  // Growth targets for Analytics
  const [growthTargets, setGrowthTargets] = useState([]);
  const loadGrowthTargets = useCallback(async () => {
    const year = new Date(dateFrom).getFullYear();
    const { data } = await supa.from('growth_targets').select('*').eq('year', year);
    if (data) setGrowthTargets(data);
  }, [dateFrom]);
  useEffect(() => { loadGrowthTargets(); }, [loadGrowthTargets]);

  // Settings tab state
  const [settingsYear, setSettingsYear] = useState(new Date().getFullYear());
  const [settingsTargets, setSettingsTargets] = useState([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsStylist, setSettingsStylist] = useState('overall');
  const STYLIST_DESIGNATIONS = ['Stylist', 'Store Stylist', 'Online Stylist', 'Store Manager'];
  const [settingsStylists, setSettingsStylists] = useState([]);
  useEffect(() => {
    supa.from('team_members').select('id, name, designation').order('name').then(({ data }) => {
      if (data) setSettingsStylists(data.filter(t => STYLIST_DESIGNATIONS.includes(t.designation)));
    });
  }, []);
  const loadSettingsTargets = useCallback(async () => {
    setSettingsLoading(true);
    const styId = settingsStylist === 'overall' ? null : settingsStylist;
    let q = supa.from('growth_targets').select('*').eq('year', settingsYear);
    if (styId) q = q.eq('stylist_id', styId);
    else q = q.is('stylist_id', null);
    const { data } = await q;
    setSettingsTargets(data || []);
    setSettingsLoading(false);
  }, [settingsYear, settingsStylist]);
  useEffect(() => { if (tab === 'settings') loadSettingsTargets(); }, [tab, loadSettingsTargets]);

  const loadOrders = async () => {
    setLoading(true);
    setLoadError('');
    // Validate date range
    if (dateFrom > dateTo) { setLoadError('Start date must be before end date.'); setLoading(false); return; }
    // Paginated fetch — Supabase caps at 1000 per request, so loop until all orders in range are fetched
    const FETCH_PAGE = 1000;
    let allOrders = [];
    let from = 0;
    let keepGoing = true;
    while (keepGoing) {
      const { data, error } = await supa
        .from('shopify_orders')
        .select('*')
        .gte('created_at', dateFrom + 'T00:00:00')
        .lte('created_at', dateTo + 'T23:59:59')
        .order('created_at', { ascending: false })
        .range(from, from + FETCH_PAGE - 1);
      if (error) {
        if (/Could not find the table|schema cache|does not exist/i.test(error.message || '')) {
          setOrders([]); setLoading(false); return;
        }
        setLoadError(`Failed to load orders: ${error.message}`); setLoading(false); return;
      }
      allOrders = allOrders.concat(data || []);
      if (!data || data.length < FETCH_PAGE) keepGoing = false;
      else from += FETCH_PAGE;
    }
    setOrders(allOrders);
    setLoading(false);
  };

  const loadAdSpend = async () => {
    const { data } = await supa
      .from('ad_spend')
      .select('*')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false });
    if (data) setAdSpend(data);
  };

  useEffect(() => { loadOrders(); loadAdSpend(); setExpandedOrders(new Set()); setLineItems({}); setOrderPage(1); }, [dateFrom, dateTo]);
  // Reset to page 1 when search/channel filter changes
  useEffect(() => { setOrderPage(1); }, [search, channelFilter]);

  // ── Real-time updates from shared context ──
  useEffect(() => {
    // When context gets real-time updates, refresh local orders from cache
    setOrders(prev => prev.map(o => {
      const updated = ctx.getOrder(o.id);
      return updated ? { ...o, ...updated } : o;
    }));
  }, [ctx.rev]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load line items for a specific order on demand (via context cache)
  const loadLineItems = async (orderId) => {
    if (lineItems[orderId] || loadingLI.has(orderId)) return;
    setLoadingLI(prev => new Set([...prev, orderId]));
    const data = await ctx.loadLineItems(orderId);
    setLineItems(prev => ({ ...prev, [orderId]: data || [] }));
    setLoadingLI(prev => { const s = new Set(prev); s.delete(orderId); return s; });
  };

  const toggleExpand = (orderId) => {
    if (!expandedOrders.has(orderId)) {
      loadLineItems(orderId);
      setExpandedOrders(prev => new Set([...prev, orderId]));
    } else {
      setExpandedOrders(prev => { const s = new Set(prev); s.delete(orderId); return s; });
    }
  };

  // After a line item COGS is saved, refresh order-level totals from line items.
  // Uses functional setOrders to avoid race conditions when two saves complete quickly.
  const refreshOrderTotals = async (orderId) => {
    ctx.invalidateLineItems(orderId);
    const lis = await ctx.loadLineItems(orderId);
    if (!lis) return;
    setLineItems(prev => ({ ...prev, [orderId]: lis }));
    // Recompute order totals from fresh line items
    const newCogs = lis.reduce((s, li) => s + cogsTotal(li), 0);
    // Use functional updater to always read latest orders state (avoids stale closure race)
    setOrders(prev => {
      const order = prev.find(o => o.id === orderId);
      if (!order) return prev;
      const gp = (order.total_sp_ex_gst || 0) - newCogs;
      const gm = (order.total_sp_ex_gst || 0) > 0 ? (gp / order.total_sp_ex_gst * 100) : 0;
      // Rebuild the line_items JSONB summary so pendingCogsCount + Analytics stay current
      const updatedSummary = (order.line_items || []).map(summary => {
        const full = lis.find(l => String(l.id) === String(summary.id));
        if (!full) return summary;
        return {
          ...summary,
          cogs_source: full.cogs_source,
          cogs_total: parseFloat(cogsTotal(full).toFixed(2)),
          eff_sp_ex_gst: full.eff_sp_ex_gst,
          product_type: full.product_type,
        };
      });
      // Persist to DB (fire-and-forget — local state update is already done above)
      supa.from('shopify_orders').update({
        total_cogs: parseFloat(newCogs.toFixed(2)),
        gross_profit: parseFloat(gp.toFixed(2)),
        gm_percent: parseFloat(gm.toFixed(1)),
        line_items: updatedSummary,
      }).eq('id', orderId);
      return prev.map(o => o.id === orderId
        ? { ...o,
            total_cogs: parseFloat(newCogs.toFixed(2)),
            gross_profit: parseFloat(gp.toFixed(2)),
            gm_percent: parseFloat(gm.toFixed(1)),
            line_items: updatedSummary }
        : o);
    });
  };

  const syncOrders = async () => {
    if (syncing) return;
    setSyncing(true); setSyncMsg('');
    var totalOrders = 0, totalItems = 0, batchNum = 0, maxBatches = 20;
    var sinceCursor = `${dateFrom}T00:00:00Z`;
    try {
      while (batchNum < maxBatches) {
        batchNum++;
        setSyncMsg(`Syncing from Shopify… batch ${batchNum}${totalOrders > 0 ? ` (${totalOrders} orders so far)` : ''}`);
        const { data, error } = await supa.functions.invoke('sync-orders', {
          body: { since: sinceCursor },
        });
        if (error) {
          const msg = error.message || 'Sync failed';
          setSyncMsg(msg.includes('rate limit') || msg.includes('502')
            ? 'Shopify rate limited — please wait 30s and try again'
            : `Error: ${msg}`);
          break;
        } else if (data?.skipped) {
          setSyncMsg('Another sync is already running — please wait');
          break;
        } else if (data?.success || data?.synced_orders > 0) {
          totalOrders += data.synced_orders || 0;
          totalItems += data.synced_line_items || 0;
          if (data.has_more && data.last_created_at) {
            sinceCursor = data.last_created_at;
          } else {
            setSyncMsg(`✓ Synced ${totalOrders} orders · ${totalItems} line items from Shopify`);
            setExpandedOrders(new Set()); setLineItems({});
            await loadOrders();
            // Fire customer sync in background (non-blocking)
            supa.functions.invoke('sync-customers', { body: {} }).catch(() => {});
            break;
          }
        } else {
          const errMsg = data?.error || 'Sync failed';
          setSyncMsg(errMsg.includes('rate limit')
            ? 'Shopify rate limited — please wait 30s and try again'
            : `Error: ${errMsg}`);
          break;
        }
      }
      if (batchNum >= maxBatches) {
        setSyncMsg(`✓ Synced ${totalOrders} orders · ${totalItems} items (hit batch limit — run again for more)`);
        setExpandedOrders(new Set()); setLineItems({});
        await loadOrders();
      }
    } catch (e) {
      setSyncMsg('Sync failed — check Shopify connection');
    }
    setSyncing(false);
  };

  // Growth is a data dashboard — order status actions are in the Orders tab only.

  const filtered = orders.filter(o => {
    const ch = o.channel;
    if (channelFilter !== 'all' && ch !== channelFilter) return false;
    if (statusFilter !== 'all' && (o.order_status || 'pending') !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (o.order_number || '').toLowerCase().includes(q) || (o.customer_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  // For KPIs: optionally exclude returned orders (affects revenue, COGS, GP, GM%, AOV)
  const kpiOrders = hideReturns ? filtered.filter(o => !o.is_returned) : filtered;
  const returnedCount = filtered.filter(o => o.is_returned).length;

  // KPI computations (on kpiOrders — returns excluded when hideReturns=true)
  const totalRevenue = kpiOrders.reduce((s, o) => s + (o.total_price || 0), 0);
  const totalSpExGst = kpiOrders.reduce((s, o) => s + (o.total_sp_ex_gst || 0), 0);
  const totalCogs = kpiOrders.reduce((s, o) => s + (o.total_cogs || 0), 0);
  const grossProfit = totalSpExGst - totalCogs;
  const gmPercent = totalSpExGst > 0 ? (grossProfit / totalSpExGst * 100) : 0;
  // Map channel key → adPlatform for ad spend filtering (MUST be defined before filteredAdSpend)
  const channelToPlatform = Object.fromEntries(
    ((channels && channels.length > 0) ? channels : DEFAULT_CHANNELS)
      .filter(c => c.adPlatform)
      .map(c => [c.key, c.adPlatform])
  );

  // Filter ad spend by channel when a specific channel is selected.
  const filteredAdSpend = channelFilter !== 'all' && channelToPlatform[channelFilter]
    ? adSpend.filter(a => a.platform === channelToPlatform[channelFilter])
    : adSpend;
  const totalAdSpend = filteredAdSpend.reduce((s, a) => s + (a.amount || 0), 0);
  const netProfit = grossProfit - totalAdSpend;
  const aov = kpiOrders.length > 0 ? totalRevenue / kpiOrders.length : 0;

  // Count orders with custom products needing COGS entry (across all orders in range, not just filtered)
  const pendingCogsCount = orders.reduce((cnt, o) =>
    cnt + (o.line_items || []).filter(li => li.cogs_source === 'empty' || li.cogs_source === 'estimated').length, 0);

  // Pagination
  const totalOrderPages = Math.max(1, Math.ceil(filtered.length / ORDERS_PAGE_SIZE));
  const safeOrderPage = Math.min(orderPage, totalOrderPages);
  const pagedOrders = filtered.slice((safeOrderPage - 1) * ORDERS_PAGE_SIZE, safeOrderPage * ORDERS_PAGE_SIZE);

  const gmColor = (gm) => {
    if (gm >= 65) return 'text-emerald-700';
    if (gm >= 50) return 'text-green-600';
    if (gm >= 45) return 'text-orange-500';
    return 'text-red-500';
  };

  const channelBadge = (ch) => {
    // Use live Channel Master data; fall back to defaults if not loaded yet
    const allChannels = (channels && channels.length > 0) ? channels : DEFAULT_CHANNELS;
    const found = allChannels.find(c => c.key === ch);
    if (found) return { bg: CHANNEL_COLORS[found.color] || CHANNEL_COLORS.gray, label: `${found.emoji} ${found.label}` };
    return { bg: CHANNEL_COLORS.gray, label: `📦 ${ch || 'Other'}` };
  };

  const saveOrderChannelEdit = async (orderId, channelOverride) => {
    await supa.from('shopify_orders').update({ channel_override: channelOverride }).eq('id', orderId);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, channel_override: channelOverride } : o));
    setEditingOrder(null);
  };

  const saveAdSpend = async () => {
    if (!newSpend.amount || !newSpend.date) return;
    await supa.from('ad_spend').upsert({
      date: newSpend.date, platform: newSpend.platform, amount: parseFloat(newSpend.amount)
    }, { onConflict: 'date,platform' });
    await loadAdSpend();
    setNewSpend(prev => ({ ...prev, amount: '' }));
  };

  const deleteAdSpend = async (id) => {
    await supa.from('ad_spend').delete().eq('id', id);
    setAdSpend(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className={embedded ? "space-y-4" : "p-4 sm:p-6 space-y-4 max-w-7xl mx-auto"}>
      {/* Header — hidden when embedded inside POS Orders */}
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 style={{fontFamily:"Manrope,sans-serif",fontSize:"1.75rem",fontWeight:800,letterSpacing:"-0.02em",color:"#1b1c1a",lineHeight:1.1}}>Growth Ledger</h1>
            <p className="page-subtitle mt-1">Real-time performance &amp; order P&amp;L</p>
          </div>
          <button onClick={syncOrders} disabled={syncing}
            className="flex items-center gap-1.5 btn-gold px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            {syncing ? 'Syncing…' : 'Sync Shopify'}
          </button>
        </div>
      )}

      {syncMsg && (
        <div className={`text-sm px-4 py-2.5 rounded-xl ${syncMsg.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
          {syncMsg}
        </div>
      )}
      {loadError && (
        <div className="text-sm px-4 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-100">{loadError}</div>
      )}

      {/* Tabs — hidden when embedded; parent provides its own sub-tab strip */}
      {!embedded && <div className="flex gap-1 p-1 rounded-xl w-fit overflow-x-auto" style={{background:'#efeeea'}}>
        {[['roi','ROI'], ['campaigns','Campaigns'], ['analytics','Analytics'], ['adspend','Ad Spend'], ['orders','Orders']].map(([id, label]) => (
          <button key={id} onClick={() => switchTab(id)}
            style={{flexShrink:0,padding:'8px 16px',borderRadius:8,fontSize:13,fontWeight:tab===id?600:500,border:'none',cursor:'pointer',transition:'all 0.15s',
              background:tab===id?'#ffffff':'transparent',color:tab===id?'#795900':'rgba(27,28,26,0.5)',
              boxShadow:tab===id?'0 4px 12px rgba(27,28,26,0.06)':'none'}}>
            {label}
          </button>
        ))}
        {/* COGS Entry tab — always visible, count badge shows pending items */}
        <button onClick={() => switchTab('cogs-entry')}
          style={{flexShrink:0,padding:'8px 16px',borderRadius:8,fontSize:13,fontWeight:tab==='cogs-entry'?600:500,border:'none',cursor:'pointer',transition:'all 0.15s',
            background:tab==='cogs-entry'?'#ffffff':'transparent',color:tab==='cogs-entry'?'#795900':'rgba(27,28,26,0.5)',
            boxShadow:tab==='cogs-entry'?'0 4px 12px rgba(27,28,26,0.06)':'none',display:'flex',alignItems:'center',gap:6}}>
          COGS Entry
          {pendingCogsCount > 0 && (
            <span style={{fontSize:10,fontWeight:700,borderRadius:999,padding:'2px 6px',background:tab==='cogs-entry'?'rgba(249,115,22,0.15)':'#f97316',color:tab==='cogs-entry'?'#c2410c':'white'}}>
              {pendingCogsCount}
            </span>
          )}
        </button>
        {/* Settings tab */}
        <button onClick={() => switchTab('settings')}
          style={{flexShrink:0,padding:'8px 16px',borderRadius:8,fontSize:13,fontWeight:tab==='settings'?600:500,border:'none',cursor:'pointer',transition:'all 0.15s',
            background:tab==='settings'?'#ffffff':'transparent',color:tab==='settings'?'#795900':'rgba(27,28,26,0.5)',
            boxShadow:tab==='settings'?'0 4px 12px rgba(27,28,26,0.06)':'none',display:'flex',alignItems:'center',gap:4}}>
          ⚙ Settings
        </button>
      </div>}

      {/* Date range filter — below tabs, contextual per sub-tab. Attribution tab owns its own combined filter row. */}
      {tab !== 'settings' && tab !== 'attribution' && tab !== 'roi' && tab !== 'campaigns' && (
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <span className="text-gray-400 text-xs">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          <span className="text-xs text-gray-400 ml-1">{orders.length} orders</span>
        </div>
      )}

      {/* KPI Cards — contextual per tab */}
      {(tab === 'orders' || tab === 'cogs-entry') && (
        <>
          {/* Returns toggle — show when there are returns in the current period */}
          {returnedCount > 0 && (
            <div className="flex items-center gap-3 text-xs text-gray-500 bg-white rounded-xl px-4 py-2.5 shadow-sm border border-gray-100">
              <span className="text-red-400">↩ {returnedCount} returned order{returnedCount > 1 ? 's' : ''} in this period</span>
              <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
                <input type="checkbox" checked={hideReturns} onChange={e => setHideReturns(e.target.checked)}
                  className="rounded" />
                <span>Exclude from KPIs</span>
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stats-grid-4">
            {[
              { label: 'Revenue', value: fmt(totalRevenue.toFixed(0)), sub: `${kpiOrders.length} orders${hideReturns && returnedCount > 0 ? ' (excl. returns)' : ''}`, pct: null },
              { label: 'SP (ex-GST)', value: fmt(totalSpExGst.toFixed(0)), sub: 'net of GST', pct: totalRevenue > 0 ? `${(totalSpExGst/totalRevenue*100).toFixed(0)}% of rev` : null },
              { label: 'COGS', value: fmt(totalCogs.toFixed(0)), sub: 'cost of goods', pct: totalSpExGst > 0 ? `${(totalCogs/totalSpExGst*100).toFixed(0)}% of SP` : null },
              { label: 'Gross Profit', value: fmt(grossProfit.toFixed(0)), sub: `${gmPercent.toFixed(1)}% GM`, hi: gmPercent >= 65 ? 'emerald' : gmPercent >= 50 ? 'green' : 'orange', pct: null },
              { label: 'Ad Spend', value: fmt(totalAdSpend.toFixed(0)), sub: channelFilter !== 'all' && channelToPlatform[channelFilter] ? `${channelFilter} only` : 'all platforms', pct: totalSpExGst > 0 ? `${(totalAdSpend/totalSpExGst*100).toFixed(0)}% of SP` : null },
              { label: 'Net Contribution', value: fmt(netProfit.toFixed(0)), sub: 'after ads', hi: netProfit >= 0 ? 'green' : 'red', pct: totalSpExGst > 0 ? `${(netProfit/totalSpExGst*100).toFixed(0)}% of SP` : null },
            ].map((k, i) => (
              <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-xs text-gray-400 font-medium">{k.label}</div>
                <div className={`text-base sm:text-lg font-bold mt-0.5 ${k.hi === 'emerald' ? 'text-emerald-700' : k.hi === 'green' ? 'text-green-700' : k.hi === 'orange' ? 'text-orange-500' : k.hi === 'red' ? 'text-red-600' : 'text-gray-800'}`}>{k.value}</div>
                <div className="text-xs text-gray-400 mt-0.5">{k.sub}</div>
                {k.pct && <div className="text-xs text-indigo-400 font-medium mt-0.5">{k.pct}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Orders Tab ─────────────────────────────────────── */}
      <div style={{display: tab === 'orders' ? '' : 'none'}}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search order # or customer…"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full sm:w-56 flex-1 sm:flex-none" />
            <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 sm:flex-none">
              <option value="all">All Channels</option>
              {((channels && channels.length > 0) ? channels : DEFAULT_CHANNELS).map(c => (
                <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400 ml-auto">{filtered.length} order{filtered.length !== 1 ? 's' : ''}{filtered.length > ORDERS_PAGE_SIZE ? ` · page ${safeOrderPage}/${totalOrderPages}` : ''}</span>
          </div>

          {/* Order status filter pills */}
          <div className="flex gap-1 flex-wrap">
            {[{ key: 'all', label: 'All' }, ...Object.entries(ORDER_STATUS_META).map(([k, v]) => ({ key: k, label: v.label, icon: v.icon }))].map(f => {
              const count = f.key === 'all' ? orders.length : orders.filter(o => (o.order_status || 'pending') === f.key).length;
              if (f.key !== 'all' && count === 0) return null;
              return (
                <button key={f.key}
                  onClick={() => { setStatusFilter(f.key); setOrderPage(1); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    statusFilter === f.key
                      ? 'bg-white text-amber-700 shadow-sm ring-1 ring-amber-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {f.icon && <span className="mr-1">{f.icon}</span>}{f.label}
                  <span className="ml-1 opacity-60">({count})</span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading orders…</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-xl p-10 text-center">
              <div className="text-5xl mb-3">📦</div>
              <div className="font-semibold text-gray-700">No orders in this period</div>
              <div className="text-sm text-gray-400 mt-1">Click "Sync Shopify" to pull your latest orders</div>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Summary totals row */}
              <div className="bg-white rounded-xl px-4 py-3 shadow-sm flex flex-wrap gap-4 text-xs font-medium text-gray-500">
                <span>Revenue: <b className="text-gray-800">{fmt(totalRevenue.toFixed(0))}</b></span>
                <span>SP ex-GST: <b className="text-gray-800">{fmt(totalSpExGst.toFixed(0))}</b></span>
                <span>COGS: <b className="text-gray-800">{fmt(totalCogs.toFixed(0))}</b></span>
                <span>Gross Profit: <b className={grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}>{fmt(grossProfit.toFixed(0))}</b></span>
                <span>Overall GM: <b className={gmColor(gmPercent)}>{gmPercent.toFixed(1)}%</b></span>
              </div>

              {/* Order cards with expandable line items */}
              {/* Pagination top — show when > 1 page */}
              {totalOrderPages > 1 && (
                <div className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 shadow-sm text-sm">
                  <button onClick={() => setOrderPage(p => Math.max(1, p - 1))} disabled={safeOrderPage <= 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50 text-xs font-medium">
                    ← Prev
                  </button>
                  <span className="text-xs text-gray-500 font-medium">
                    {((safeOrderPage - 1) * ORDERS_PAGE_SIZE) + 1}–{Math.min(safeOrderPage * ORDERS_PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <button onClick={() => setOrderPage(p => Math.min(totalOrderPages, p + 1))} disabled={safeOrderPage >= totalOrderPages}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50 text-xs font-medium">
                    Next →
                  </button>
                </div>
              )}

              {pagedOrders.map(order => {
                const ch = order.channel;
                const badge = channelBadge(ch);
                const cogs = order.total_cogs || 0;
                const pl = (order.total_sp_ex_gst || 0) - cogs;
                const gm = order.total_sp_ex_gst > 0 ? (pl / order.total_sp_ex_gst * 100) : 0;
                const isExpanded = expandedOrders.has(order.id);
                const isEditingChannel = editingOrder?.id === order.id;
                const orderLIs = lineItems[order.id] || [];
                const isLoadingLI = loadingLI.has(order.id);
                // Detect if any line items need COGS
                const summaryItems = order.line_items || [];
                const hasCustom = summaryItems.some(li => li.product_type === 'custom' || li.cogs_source === 'empty');

                return (
                  <div key={order.id} className={`bg-white rounded-xl shadow-sm overflow-hidden ${order.is_returned ? 'border-l-2 border-red-200' : 'order-card-accent'}`}>
                    {/* ── Order header — fully tappable ── */}
                    <div className="cursor-pointer select-none" onClick={() => toggleExpand(order.id)}>
                      {/* Main content row */}
                      <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
                        {/* Chevron */}
                        <span className="flex-shrink-0 mt-1 text-gray-400">
                          <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                          </svg>
                        </span>

                        {/* Order # + Date */}
                        <div className="flex-shrink-0">
                          <div className="font-bold text-gray-800 text-sm leading-tight">{order.order_number}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                        </div>

                        {/* Customer + item chips */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate">{order.customer_name || 'Guest'}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {summaryItems.slice(0, 3).map((li, idx) => {
                              const isMtf = li.is_mtf || isMtfVariant(li.variant_title);
                              const needsCogs = li.cogs_source === 'empty' || li.cogs_source === 'estimated';
                              return (
                                <span key={idx} className={`badge text-xs ${needsCogs ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {li.title?.split(' ').slice(0,2).join(' ')}{isMtf ? ' · MTF' : ''}{li.quantity > 1 ? ` ×${li.quantity}` : ''}
                                </span>
                              );
                            })}
                            {summaryItems.length > 3 && (
                              <span className="text-xs text-gray-400 self-center">+{summaryItems.length - 3} more</span>
                            )}
                          </div>
                        </div>

                        {/* Right column: revenue + status */}
                        <div className="flex-shrink-0 flex flex-col items-end gap-1">
                          <OrderStatusBadge status={order.order_status || 'pending'} />
                          <div className="font-bold text-gray-900 text-base leading-tight">{fmt((order.total_price || 0).toFixed(0))}</div>
                        </div>
                      </div>

                      {/* Financial strip — channel · COGS · GP · GM% — always visible */}
                      <div className="flex items-center gap-2 px-3 pb-2.5 text-xs flex-wrap" style={{paddingLeft:'1.75rem'}}>
                        {/* Channel badge — tappable to edit */}
                        <div onClick={e => e.stopPropagation()}>
                          {isEditingChannel ? (
                            <div className="flex items-center gap-1">
                              <select value={editingOrder.channel} onChange={e => setEditingOrder(p => ({...p, channel: e.target.value}))}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-xs">
                                {((channels && channels.length > 0) ? channels : DEFAULT_CHANNELS).map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
                              </select>
                              <button onClick={() => saveOrderChannelEdit(order.id, editingOrder.channel)} className="text-green-600 hover:text-green-800 text-xs font-bold">✓</button>
                              <button onClick={() => setEditingOrder(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                            </div>
                          ) : (
                            <button onClick={() => setEditingOrder({ id: order.id, channel: ch })}
                              className={`badge text-xs ${badge.bg} hover:opacity-80`}>
                              {badge.label}
                            </button>
                          )}
                        </div>
                        <span className="text-gray-200">·</span>
                        <span className="text-gray-400">COGS <b className={hasCustom ? 'text-orange-500' : 'text-gray-700'}>{hasCustom ? '⚠' : fmt(n(cogs).toFixed(0))}</b></span>
                        <span className="text-gray-200">·</span>
                        <span className="text-gray-400">GP <b className={pl >= 0 ? 'text-green-600' : 'text-red-500'}>{hasCustom ? '—' : fmt(pl.toFixed(0))}</b></span>
                        <span className="text-gray-200">·</span>
                        <span className={`font-bold ${
                          hasCustom      ? 'text-orange-500' :
                          gm >= 65       ? 'text-emerald-700' :
                          gm >= 50       ? 'text-green-700' :
                          gm >= 45       ? 'text-orange-600' :
                                           'text-red-600'
                        }`}>{hasCustom ? 'COGS ?' : `${gm.toFixed(1)}% GM`}</span>
                        {order.is_returned && <span className="ml-auto text-red-400 font-medium">↩ returned</span>}
                        {order.notes && !order.is_returned && <span className="ml-auto text-gray-400 truncate max-w-[150px]" title={order.notes}>📝 {order.notes}</span>}
                      </div>
                    </div>

                    {/* Order action buttons removed — Growth is a data dashboard only.
                       Status actions live in the Orders tab. */}

                    {/* Expanded line items — table layout */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50/30">
                        {isLoadingLI ? (
                          <div className="text-sm text-gray-400 text-center py-4">Loading products…</div>
                        ) : orderLIs.length === 0 ? (
                          <div className="text-sm text-gray-400 text-center py-4">No line items synced — try syncing again</div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-100 bg-gray-50">
                                <th className="px-3 py-2 text-left text-gray-400 font-medium">Product</th>
                                <th className="px-2 py-2 text-left text-gray-400 font-medium">Type</th>
                                <th className="px-2 py-2 text-left text-gray-400 font-medium">Source</th>
                                <th className="px-2 py-2 text-right text-gray-400 font-medium">SP</th>
                                <th className="px-2 py-2 text-right text-gray-400 font-medium">COGS</th>
                                <th className="px-2 py-2 text-right text-gray-400 font-medium">GM%</th>
                                <th className="px-2 py-2 text-center text-gray-400 font-medium">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orderLIs.map(li => (
                                <LineItemRow key={li.id} li={li} onEditSaved={() => refreshOrderTotals(order.id)}
                                  fabrics={fabrics} stitchingMaster={stitchingMaster} dyes={dyes} categories={categories} products={products} />
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Ad Spend Tab ──────────────────────────────────── */}
      <div style={{display: tab === 'adspend' ? '' : 'none'}}>
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="text-sm font-semibold text-gray-700 mb-3">Log Ad Spend</div>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Date</label>
                <input type="date" value={newSpend.date} onChange={e => setNewSpend(p => ({...p, date: e.target.value}))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Platform</label>
                <select value={newSpend.platform} onChange={e => setNewSpend(p => ({...p, platform: e.target.value}))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                  <option value="facebook">📘 Facebook / Meta</option>
                  <option value="google">🔴 Google Ads</option>
                  <option value="instagram">📷 Instagram</option>
                  <option value="other">📊 Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Amount (₹)</label>
                <input type="number" value={newSpend.amount} onChange={e => setNewSpend(p => ({...p, amount: e.target.value}))}
                  placeholder="0" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-32" />
              </div>
              <button onClick={saveAdSpend} className="btn-gold px-5 py-2 rounded-lg text-sm font-medium">Add</button>
            </div>
          </div>

          <div className="bg-white rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Platform</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Amount</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {adSpend.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-10 text-gray-400">No ad spend logged for this period</td></tr>
                ) : adSpend.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{new Date(a.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                    <td className="px-4 py-3">
                      <span className={`badge text-xs ${a.platform === 'facebook' ? 'bg-blue-50 text-blue-700' : a.platform === 'google' ? 'bg-red-50 text-red-700' : a.platform === 'instagram' ? 'bg-pink-50 text-pink-700' : 'bg-gray-100 text-gray-600'}`}>
                        {a.platform === 'facebook' ? '📘 Facebook' : a.platform === 'google' ? '🔴 Google' : a.platform === 'instagram' ? '📷 Instagram' : '📊 Other'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt((a.amount || 0).toFixed(0))}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => deleteAdSpend(a.id)} className="text-red-400 hover:text-red-600 p-1 rounded">
                        <Icon name="trash" cls="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {adSpend.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-gray-50">
                    <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Total Ad Spend</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-800">{fmt(totalAdSpend.toFixed(0))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* ── Analytics Tab — Redesigned ──────────── */}
      <div style={{display: tab === 'analytics' ? '' : 'none'}}>
        {(() => {
          const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
          const cpa = orders.length > 0 && totalAdSpend > 0 ? totalAdSpend / orders.length : 0;

          // Source breakdown with percentages
          const sourceMap = {};
          const totalSourceRev = orders.filter(o => o.lead_source).reduce((s, o) => s + (o.total_price || 0), 0);
          orders.filter(o => o.lead_source).forEach(o => {
            const src = o.lead_source;
            if (!sourceMap[src]) sourceMap[src] = { count: 0, revenue: 0 };
            sourceMap[src].count++;
            sourceMap[src].revenue += (o.total_price || 0);
          });
          const sortedSources = Object.entries(sourceMap).sort((a, b) => b[1].revenue - a[1].revenue);

          // Stylist breakdown
          const styMap = {};
          orders.filter(o => o.stylist).forEach(o => {
            const id = String(o.stylist);
            const name = stylistName(o.stylist);
            if (!styMap[id]) styMap[id] = { name, count: 0, revenue: 0 };
            styMap[id].count++;
            styMap[id].revenue += (o.total_price || 0);
          });
          const sortedStylists = Object.entries(styMap).sort((a, b) => b[1].revenue - a[1].revenue);

          // Current month target lookup
          const currentMonth = new Date(dateTo).getMonth() + 1;
          const currentYear = new Date(dateTo).getFullYear();
          const getTarget = (stylistId) => {
            const monthly = growthTargets.find(t => t.year === currentYear && t.month === currentMonth && (stylistId ? String(t.stylist_id) === String(stylistId) : !t.stylist_id));
            return monthly ? Number(monthly.target_amount) : 0;
          };
          const storeTarget = getTarget(null);

          // Channel breakdown for donut
          const channelData = ((channels && channels.length > 0) ? channels : DEFAULT_CHANNELS).map(ch => {
            const chOrders = kpiOrders.filter(o => (o.channel) === ch.key);
            const rev = chOrders.reduce((s, o) => s + (o.total_price || 0), 0);
            return { key: ch.key, label: channelBadge(ch.key).label, revenue: rev, count: chOrders.length, pct: totalRevenue > 0 ? rev / totalRevenue * 100 : 0 };
          }).filter(c => c.revenue > 0);

          // Source colors
          const sourceColors = ['#d4a843', '#059669', '#8b5cf6', '#ef4444', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6'];
          // Channel colors
          const channelColors = ['#d4a843', '#3b82f6', '#059669', '#8b5cf6', '#ef4444'];

          return (
            <div className="space-y-4">
              {/* Analytics KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-gray-400 font-medium">Total Revenue</div>
                  <div style={{fontFamily:'Manrope,sans-serif',fontSize:'1.5rem',fontWeight:800,letterSpacing:'-0.02em',color:'#1b1c1a'}}>{fmt(totalRevenue.toFixed(0))}</div>
                  <div className="text-xs mt-0.5">{storeTarget > 0 ? <span style={{color: totalRevenue >= storeTarget ? '#059669' : '#d97706'}}>{(totalRevenue/storeTarget*100).toFixed(0)}% of {fmt(storeTarget.toFixed(0))} target</span> : <span className="text-gray-400">{orders.length} orders</span>}</div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-gray-400 font-medium">Ad Spend</div>
                  <div style={{fontFamily:'Manrope,sans-serif',fontSize:'1.5rem',fontWeight:800,letterSpacing:'-0.02em',color:'#d97706'}}>{fmt(totalAdSpend.toFixed(0))}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{totalRevenue > 0 ? `${(totalAdSpend/totalRevenue*100).toFixed(1)}% of revenue` : '—'}</div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-gray-400 font-medium">ROAS</div>
                  <div style={{fontFamily:'Manrope,sans-serif',fontSize:'1.5rem',fontWeight:800,letterSpacing:'-0.02em',color:roas >= 3 ? '#059669' : roas >= 2 ? '#d97706' : '#dc2626'}}>{roas > 0 ? `${roas.toFixed(1)}x` : '—'}</div>
                  <div className="text-xs text-gray-400 mt-0.5">return on ad spend</div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-gray-400 font-medium">Cost per Order</div>
                  <div style={{fontFamily:'Manrope,sans-serif',fontSize:'1.5rem',fontWeight:800,letterSpacing:'-0.02em',color:'#1b1c1a'}}>{cpa > 0 ? fmt(cpa.toFixed(0)) : '—'}</div>
                  <div className="text-xs text-gray-400 mt-0.5">ad spend / orders</div>
                </div>
              </div>

              {/* Revenue by Stylist — Target vs Actual */}
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-semibold text-gray-700">Revenue by Stylist</div>
                  <div className="text-xs text-gray-400">{storeTarget > 0 ? `Store target: ${fmt(storeTarget.toFixed(0))}` : 'No targets set'}</div>
                </div>
                {sortedStylists.length === 0 ? (
                  <div className="text-gray-400 text-sm text-center py-6">No stylist-attributed orders</div>
                ) : (
                  <div className="space-y-4">
                    {sortedStylists.map(([id, data]) => {
                      const target = getTarget(id);
                      const pctOfTarget = target > 0 ? (data.revenue / target * 100) : 0;
                      const barMax = target > 0 ? Math.max(target, data.revenue) : data.revenue;
                      const actualWidth = barMax > 0 ? (data.revenue / barMax * 100) : 0;
                      const targetWidth = barMax > 0 && target > 0 ? (target / barMax * 100) : 0;
                      return (
                        <div key={id}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-700">{data.name}</span>
                              <span className="text-xs text-gray-400">{data.count} orders</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-bold text-gray-900">{fmt(data.revenue.toFixed(0))}</span>
                              {target > 0 && (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pctOfTarget >= 100 ? 'bg-green-50 text-green-700' : pctOfTarget >= 70 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>
                                  {pctOfTarget.toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
                            <div className="absolute h-4 rounded-full transition-all" style={{width:`${actualWidth}%`, background: target > 0 ? (pctOfTarget >= 100 ? '#059669' : pctOfTarget >= 70 ? '#d97706' : '#ef4444') : '#8b5cf6'}} />
                            {target > 0 && <div className="absolute top-0 h-4 border-r-2 border-dashed border-gray-400" style={{left:`${targetWidth}%`}} title={`Target: ${fmt(target.toFixed(0))}`} />}
                          </div>
                          {target > 0 && <div className="text-xs text-gray-400 mt-0.5">Target: {fmt(target.toFixed(0))}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Revenue by Source — with percentages */}
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <div className="text-sm font-semibold text-gray-700 mb-4">Revenue by Source</div>
                  {sortedSources.length === 0 ? (
                    <div className="text-gray-400 text-sm text-center py-6">No attributed orders</div>
                  ) : (
                    <>
                      {/* Stacked bar summary */}
                      <div className="flex rounded-full overflow-hidden h-5 mb-4">
                        {sortedSources.map(([src, data], i) => {
                          const pct = totalSourceRev > 0 ? data.revenue / totalSourceRev * 100 : 0;
                          return pct > 0 ? <div key={src} title={`${src}: ${pct.toFixed(1)}%`} style={{width:`${pct}%`, background: sourceColors[i % sourceColors.length]}} /> : null;
                        })}
                      </div>
                      <div className="space-y-2.5">
                        {sortedSources.map(([src, data], i) => {
                          const pct = totalSourceRev > 0 ? data.revenue / totalSourceRev * 100 : 0;
                          return (
                            <div key={src} className="flex items-center gap-3">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: sourceColors[i % sourceColors.length]}} />
                              <span className="text-xs text-gray-600 flex-1 truncate">{src}</span>
                              <span className="text-xs font-bold text-gray-800">{pct.toFixed(1)}%</span>
                              <span className="text-xs text-gray-400 w-20 text-right">{fmt(data.revenue.toFixed(0))}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Revenue by Channel — tile cards */}
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <div className="text-sm font-semibold text-gray-700 mb-4">Revenue by Channel</div>
                  {channelData.length === 0 ? (
                    <div className="text-gray-400 text-sm text-center py-6">No data</div>
                  ) : (
                    <div className="space-y-2">
                      {channelData.map((ch, i) => (
                        <div key={ch.key} className="flex items-center gap-3 p-2.5 rounded-lg" style={{background: `${channelColors[i % channelColors.length]}10`}}>
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{background: channelColors[i % channelColors.length]}}>
                            {ch.pct.toFixed(0)}%
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-700">{ch.label}</div>
                            <div className="text-xs text-gray-400">{ch.count} orders</div>
                          </div>
                          <div className="text-sm font-bold text-gray-900">{fmt(ch.revenue.toFixed(0))}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Ad Spend by Platform — compact table style */}
              {adSpend.length > 0 && (
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <div className="text-sm font-semibold text-gray-700 mb-4">Ad Spend by Platform</div>
                  {(() => {
                    const platMap = {};
                    adSpend.forEach(a => {
                      if (!platMap[a.platform]) platMap[a.platform] = 0;
                      platMap[a.platform] += (a.amount || 0);
                    });
                    const sorted = Object.entries(platMap).sort((a, b) => b[1] - a[1]);
                    const platLabels = { facebook: 'Facebook/Meta', google: 'Google Ads', instagram: 'Instagram', other: 'Other' };
                    const platColors = { facebook: '#1877F2', google: '#EA4335', instagram: '#E1306C', other: '#6B7280' };
                    return (
                      <div className="space-y-3">
                        {sorted.map(([plat, amount]) => {
                          const pct = totalAdSpend > 0 ? amount / totalAdSpend * 100 : 0;
                          const platformRoas = amount > 0 ? totalRevenue / amount : 0;
                          return (
                            <div key={plat} className="flex items-center gap-3">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: platColors[plat] || '#6B7280'}} />
                              <span className="text-xs text-gray-600 flex-1">{platLabels[plat] || plat}</span>
                              <span className="text-xs font-bold" style={{color: platColors[plat] || '#6B7280'}}>{pct.toFixed(0)}%</span>
                              <span className="text-xs font-semibold text-gray-800 w-20 text-right">{fmt(amount.toFixed(0))}</span>
                            </div>
                          );
                        })}
                        <div className="border-t pt-2 mt-1 flex items-center gap-3 text-xs">
                          <span className="text-gray-500 flex-1 font-medium">Total</span>
                          <span className="font-bold text-gray-800 w-20 text-right">{fmt(totalAdSpend.toFixed(0))}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── ROI (Marketing) Tab ────────────────────────────── */}
      <div style={{display: tab === 'roi' ? '' : 'none'}}>
        <MarketingROI orders={orders} adSpend={adSpend} loading={loading} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} teamMembers={teamMembers} channels={channels} />
      </div>

      {/* ── Campaigns Tab ──────────────────────────────────── */}
      <div style={{display: tab === 'campaigns' ? '' : 'none'}}>
        <MarketingCampaigns orders={orders} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
      </div>

      {/* ── Attribution render block — used by the POS Orders embed (initialTab='attribution'); no Marketing button ─ */}
      <div style={{display: tab === 'attribution' ? '' : 'none'}}>
        <AttributionTab orders={orders} user={user} dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />
      </div>

      {/* ── COGS Entry Tab ──────────────────────────────────── */}
      <div style={{display: tab === 'cogs-entry' ? '' : 'none'}}>
        <div className="space-y-3">
          {pendingCogsCount === 0 ? (
            <div className="bg-white rounded-xl p-10 text-center shadow-sm">
              <div className="text-5xl mb-3">✅</div>
              <div className="font-semibold text-gray-700">All COGS entered!</div>
              <div className="text-sm text-gray-400 mt-1">Every line item in this date range has real COGS data.</div>
            </div>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
                <span className="text-lg">⚠</span>
                <span><b>{pendingCogsCount} item{pendingCogsCount !== 1 ? 's' : ''}</b> still need real COGS — either fetch from catalogue or enter manually. Revenue impact: <b>{fmt((orders.filter(o => (o.line_items||[]).some(li => li.cogs_source === 'empty' || li.cogs_source === 'estimated')).reduce((s,o) => s + (o.total_sp_ex_gst||0), 0)).toFixed(0))}</b> SP at risk of inaccurate margins.</span>
              </div>
              <div className="space-y-2">
                {orders.filter(o =>
                  (o.line_items || []).some(li => li.cogs_source === 'empty' || li.cogs_source === 'estimated')
                ).map(order => {
                  const ch = order.channel;
                  const badge = channelBadge(ch);
                  const cogs = order.total_cogs || 0;
                  const pl = (order.total_sp_ex_gst || 0) - cogs;
                  const gm = order.total_sp_ex_gst > 0 ? (pl / order.total_sp_ex_gst * 100) : 0;
                  const isExpanded = expandedOrders.has(order.id);
                  const orderLIs = lineItems[order.id] || [];
                  const isLoadingLI = loadingLI.has(order.id);
                  const summaryItems = order.line_items || [];
                  const hasCustom = summaryItems.some(li => li.cogs_source === 'empty');
                  const pendingItems = summaryItems.filter(li => li.cogs_source === 'empty' || li.cogs_source === 'estimated');
                  return (
                    <div key={order.id} className="bg-white rounded-xl shadow-sm overflow-hidden border-l-2 border-amber-300">
                      <div className="cursor-pointer select-none" onClick={() => toggleExpand(order.id)}>
                        <div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
                          <span className="flex-shrink-0 mt-1 text-gray-400">
                            <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                            </svg>
                          </span>
                          <div className="flex-shrink-0">
                            <div className="font-bold text-gray-800 text-sm leading-tight">{order.order_number}</div>
                            <div className="text-xs text-gray-400 mt-0.5">{new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-800 truncate">{order.customer_name || 'Guest'}</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {pendingItems.slice(0,3).map((li, idx) => (
                                <span key={idx} className="badge text-xs bg-amber-50 text-amber-700">
                                  ⚠ {li.title?.split(' ').slice(0,2).join(' ')}{li.quantity > 1 ? ` ×${li.quantity}` : ''}
                                </span>
                              ))}
                              {pendingItems.length > 3 && <span className="text-xs text-amber-500">+{pendingItems.length - 3} more</span>}
                            </div>
                          </div>
                          <div className="flex-shrink-0 flex flex-col items-end gap-1">
                            <span className={`badge text-xs ${badge.bg}`}>{badge.label}</span>
                            <div className="font-bold text-gray-900 text-base leading-tight">{fmt((order.total_price || 0).toFixed(0))}</div>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">{pendingItems.length} pending</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 px-3 pb-2.5 text-xs flex-wrap" style={{paddingLeft:'1.75rem'}}>
                          <span className="text-gray-400">COGS <b className="text-orange-500">⚠ estimated</b></span>
                          <span className="text-gray-200">·</span>
                          <span className="text-gray-400">GP <b className="text-gray-400">—</b></span>
                          <span className="text-gray-200">·</span>
                          <span className="text-orange-500 font-bold">COGS ?</span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-amber-100 bg-amber-50/10">
                          {isLoadingLI ? (
                            <div className="text-sm text-gray-400 text-center py-4">Loading products…</div>
                          ) : orderLIs.length === 0 ? (
                            <div className="text-sm text-gray-400 text-center py-4">No line items synced — try syncing again</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-amber-100 bg-amber-50/40">
                                  <th className="px-3 py-2 text-left text-gray-400 font-medium">Product</th>
                                  <th className="px-2 py-2 text-left text-gray-400 font-medium">Type</th>
                                  <th className="px-2 py-2 text-left text-gray-400 font-medium">Source</th>
                                  <th className="px-2 py-2 text-right text-gray-400 font-medium">SP</th>
                                  <th className="px-2 py-2 text-right text-gray-400 font-medium">COGS</th>
                                  <th className="px-2 py-2 text-right text-gray-400 font-medium">GM%</th>
                                  <th className="px-2 py-2 text-center text-gray-400 font-medium">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {orderLIs.filter(li => li.cogs_source === 'empty' || li.cogs_source === 'estimated').map(li => (
                                  <LineItemRow key={li.id} li={li} onEditSaved={() => refreshOrderTotals(order.id)}
                                    fabrics={fabrics} stitchingMaster={stitchingMaster} dyes={dyes} categories={categories} products={products} />
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Settings Tab — Growth Targets ──────────────────── */}
      <div style={{display: tab === 'settings' ? '' : 'none'}}>
        <div className="space-y-4">
          {/* Controls row */}
          <div className="bg-white rounded-xl p-4 shadow-sm flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">Year</label>
              <select className="border rounded-lg px-3 py-1.5 text-sm" value={settingsYear} onChange={e => setSettingsYear(Number(e.target.value))}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500">Scope</label>
              <select className="border rounded-lg px-3 py-1.5 text-sm" value={settingsStylist} onChange={e => setSettingsStylist(e.target.value)}>
                <option value="overall">Store Overall</option>
                {settingsStylists.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {settingsLoading && <span className="text-xs text-gray-400">Loading...</span>}
          </div>

          {/* Monthly targets */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="text-sm font-semibold text-gray-700 mb-4">Monthly Targets — {settingsYear}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[...Array(12)].map((_, i) => {
                const month = i + 1;
                const existing = settingsTargets.find(t => t.month === month);
                const val = existing ? existing.target_amount : '';
                const monthLabel = new Date(settingsYear, i, 1).toLocaleString('en', { month: 'short' });
                return (
                  <div key={month} className="border rounded-lg p-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">{monthLabel}</div>
                    <input
                      type="number"
                      className="w-full border rounded px-2 py-1.5 text-sm"
                      placeholder="Target amount"
                      value={val}
                      onChange={e => {
                        const newVal = e.target.value;
                        setSettingsTargets(prev => {
                          const idx = prev.findIndex(t => t.month === month);
                          if (idx >= 0) return prev.map((t, ti) => ti === idx ? { ...t, target_amount: newVal } : t);
                          return [...prev, { year: settingsYear, month, quarter: null, stylist_id: settingsStylist === 'overall' ? null : Number(settingsStylist), target_amount: newVal }];
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quarterly targets */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="text-sm font-semibold text-gray-700 mb-4">Quarterly Targets — {settingsYear}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(quarter => {
                const existing = settingsTargets.find(t => t.quarter === quarter);
                const val = existing ? existing.target_amount : '';
                return (
                  <div key={quarter} className="border rounded-lg p-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">Q{quarter}</div>
                    <input
                      type="number"
                      className="w-full border rounded px-2 py-1.5 text-sm"
                      placeholder="Target amount"
                      value={val}
                      onChange={e => {
                        const newVal = e.target.value;
                        setSettingsTargets(prev => {
                          const idx = prev.findIndex(t => t.quarter === quarter);
                          if (idx >= 0) return prev.map((t, ti) => ti === idx ? { ...t, target_amount: newVal } : t);
                          return [...prev, { year: settingsYear, month: null, quarter, stylist_id: settingsStylist === 'overall' ? null : Number(settingsStylist), target_amount: newVal }];
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <button
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              style={{background: '#d4a843'}}
              disabled={settingsSaving}
              onClick={async () => {
                setSettingsSaving(true);
                const styId = settingsStylist === 'overall' ? null : Number(settingsStylist);
                // Upsert each target row
                for (const t of settingsTargets) {
                  if (!t.target_amount && t.target_amount !== 0) continue;
                  const amount = Number(t.target_amount);
                  if (isNaN(amount)) continue;
                  if (t.id) {
                    // Update existing
                    await supa.from('growth_targets').update({ target_amount: amount, updated_at: new Date().toISOString() }).eq('id', t.id);
                  } else {
                    // Insert new
                    await supa.from('growth_targets').insert({
                      year: settingsYear,
                      month: t.month || null,
                      quarter: t.quarter || null,
                      stylist_id: styId,
                      target_amount: amount,
                    });
                  }
                }
                await loadSettingsTargets();
                await loadGrowthTargets(); // Refresh analytics targets too
                setSettingsSaving(false);
              }}
            >
              {settingsSaving ? 'Saving...' : 'Save Targets'}
            </button>
          </div>

          {/* Summary */}
          {settingsTargets.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-xs text-gray-500 font-medium mb-2">Summary for {settingsStylist === 'overall' ? 'Store Overall' : settingsStylists.find(s => String(s.id) === String(settingsStylist))?.name || 'Unknown'}</div>
              <div className="flex gap-4 text-sm">
                <span className="text-gray-600">Monthly total: <b className="text-gray-800">{fmt(settingsTargets.filter(t => t.month).reduce((s, t) => s + Number(t.target_amount || 0), 0).toFixed(0))}</b></span>
                <span className="text-gray-600">Quarterly total: <b className="text-gray-800">{fmt(settingsTargets.filter(t => t.quarter).reduce((s, t) => s + Number(t.target_amount || 0), 0).toFixed(0))}</b></span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Login Screen ─────────────────────────────────────────────────────────────

export default GrowthView

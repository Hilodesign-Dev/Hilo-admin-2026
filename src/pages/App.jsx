import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa, fetchAllProducts } from '../lib/supabase'
import { fetchAllProductsLegacy } from '../lib/catalogueV2'
import { load } from '../lib/storage'
import { productToCamel, dyeToCamel, categoryToCamel, consumptionToCamel, channelToCamel } from '../lib/caseMapping'
import { _logError, _logChange } from '../lib/logger'
import { fmt, gst, n, mapSupaFabrics, mapSupaVendors } from '../lib/helpers'
import { getHashPage, setHashPage } from '../lib/navigation'
import { ALL_TABS, TAB_LABELS, DEFAULT_TABS, getUserTabs, DEFAULT_CATEGORIES, DEFAULT_FABRIC_VENDORS, DEFAULT_OUTSOURCE_VENDORS, DEFAULT_CHANNELS, SEED_DATA, buildDefaultVariants } from '../lib/constants'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import Toaster from '../components/Toaster'
import Sidebar from '../components/Sidebar'
import MobileHeader from '../components/MobileHeader'
import BottomNav from '../components/BottomNav'
import LoginScreen from '../components/LoginScreen'
import FounderDashboard from './FounderDashboard'
import Catalogue from './catalogue/CatalogueShell'
import CatalogueShellV2 from './catalogue/CatalogueShellV2'
import Masters from './masters/Masters'
import GrowthView from './growth/GrowthView'
import CollectionsTab from './collections/CollectionsTab'
import POSTab from './pos/POSTab'
import CustomersTab from './customers/CustomersTab'
import FranchisesTab from './franchises/FranchisesTab'
import FabricManagement from './fabrics/FabricManagement'
import UsersTab from './users/UsersTab'
import HiringTab from './hiring/HiringTab'
import OutsourceVendorsTab from './outsource/OutsourceVendorsTab'
import OrdersTab from './orders/OrdersTab'
import AppOrdersTab from './orders/AppOrdersTab'
import MobileCmsTab from './cms/MobileCmsTab'
import AppUsersTab from './customers/AppUsersTab'
import AppSupportTab from './support/AppSupportTab'
import StylistInboxTab, { AcceptHandoffModal } from './stylist/StylistInboxTab'
import { useStylistInbox } from './stylist/useStylistInbox'
import ProductionTab from './production/ProductionTab'
import FulfillmentTab from './fulfillment/FulfillmentTab'
import DelayedReportingTab from './delayed/DelayedReportingTab'
import LeadsTab from './leads/LeadsTab'
import TasksTab from './tasks/TasksTab'
import InventoryTab from './inventory/InventoryTab'
import FinanceTab from './finance/FinanceTab'
import GSTTab from './finance/GSTTab'
import ReturnsTab from './returns/ReturnsTab'
import SyncCenter from './sync/SyncCenter'
import { OrdersProvider } from '../context/OrdersContext'

const App = () => {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [syncing, setSyncing] = useState(true);
  // Init page from URL hash if present, else default to 'calculator'
  const [page, setPage] = useState(() => {
    let initial = getHashPage() || 'pos';
    // Legacy redirects for tabs that moved into super-tabs
    if (initial === 'orders')     { window._posInitialView = 'orders';        initial = 'pos';       setHashPage('pos'); }
    if (initial === 'calculator') { window._posInitialView = 'calculator';    initial = 'pos';       setHashPage('pos'); }
    if (initial === 'offers')     { window._catalogueInitialView = 'offers';  initial = 'catalogue'; setHashPage('catalogue'); }
    if (initial === 'dashboard')  { window._catalogueInitialView = 'dashboard'; initial = 'catalogue'; setHashPage('catalogue'); }
    return initial;
  });
  // Track which tabs have ever been mounted so we can keep them alive
  const [mountedTabs, setMountedTabs] = useState(() => new Set([getHashPage() || 'pos']));
  // Refresh key per tab — bumping it remounts the tab, triggering fresh data fetch
  const [refreshKeys, setRefreshKeys] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const refreshCurrentTab = useCallback(() => {
    setRefreshing(true);
    setRefreshKeys(prev => ({ ...prev, [page]: (prev[page] || 0) + 1 }));
    setTimeout(() => setRefreshing(false), 800);
  }, [page]);

  // Sync page → hash and keep-alive set
  const navigateTo = React.useCallback((tab) => {
    // Legacy redirects — moved tabs now live as sub-views
    if (tab === 'orders')     { window._posInitialView = 'orders';            tab = 'pos'; }
    if (tab === 'calculator') { window._posInitialView = 'calculator';        tab = 'pos'; }
    if (tab === 'offers')     { window._catalogueInitialView = 'offers';      tab = 'catalogue'; }
    if (tab === 'dashboard')  { window._catalogueInitialView = 'dashboard';   tab = 'catalogue'; }
    setHashPage(tab);
    setPage(tab);
    setMountedTabs(prev => { const s = new Set(prev); s.add(tab); return s; });
  }, []);

  // Open a specific customer in the Customers tab from anywhere (e.g. Fulfillment)
  const openCustomer = React.useCallback((id) => {
    if (!id) return;
    window._customerFocusId = String(id);
    navigateTo('customers');
    if (typeof window.__hiloFocusCustomer === 'function') window.__hiloFocusCustomer(String(id));
  }, [navigateTo]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const onPop = () => {
      let tab = getHashPage();
      if (tab === 'orders')     { window._posInitialView = 'orders';            tab = 'pos';       setHashPage('pos'); }
      if (tab === 'calculator') { window._posInitialView = 'calculator';        tab = 'pos';       setHashPage('pos'); }
      if (tab === 'offers')     { window._catalogueInitialView = 'offers';      tab = 'catalogue'; setHashPage('catalogue'); }
      if (tab === 'dashboard')  { window._catalogueInitialView = 'dashboard';   tab = 'catalogue'; setHashPage('catalogue'); }
      if (tab) { setPage(tab); setMountedTabs(prev => { const s = new Set(prev); s.add(tab); return s; }); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    // Check existing session on load
    supa.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      window._currentUserEmail = session?.user?.email || '';
      setAuthChecked(true);
    });
    // Listen for login / logout events
    const { data: { subscription } } = supa.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      window._currentUserEmail = session?.user?.email || '';
      setAuthChecked(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supa.auth.signOut();
    setUser(null);
  };

  // All data hooks must be here — before any conditional returns
  // Data is now loaded from Supabase tables directly (not localStorage).
  const [products, setProducts] = useState([]);
  const [fabrics, setFabrics] = useState([]);  // loaded from `fabrics` DB table
  const [stitching, setStitching] = useState([]);
  const [dyes, setDyes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [fabricVendors, setFabricVendors] = useState([]);
  const [outsourceVendors, setOutsourceVendors] = useState([]);
  const [consumption, setConsumption] = useState([]);
  const [channels, setChannels] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [stylistFocusId, setStylistFocusId] = useState(null);

  // Helper: reload all master data from Supabase
  const reloadFromSupabase = useCallback(async () => {
    try {
      const [prodData, dyeRes, catRes, consRes, chanRes] = await Promise.all([
        fetchAllProductsLegacy(),
        supa.from('dye_masters').select('*'),
        supa.from('product_categories').select('*'),
        supa.from('consumption_masters').select('*'),
        supa.from('sales_channels').select('*'),
      ]);
      if (prodData) setProducts(prodData);   // already V2 legacy shape
      if (dyeRes.data) setDyes(dyeRes.data.map(dyeToCamel));
      if (catRes.data) setCategories(catRes.data.map(categoryToCamel));
      if (consRes.data) setConsumption(consRes.data.map(consumptionToCamel));
      if (chanRes.data) setChannels(chanRes.data.map(channelToCamel));
    } catch (e) {
      console.error('[HILO] reloadFromSupabase error:', e);
    }
  }, []);

  // Sync from Supabase once per login session (keyed on user ID, not user object).
  // Using user?.id prevents re-syncing on JWT token refreshes — Supabase fires
  // onAuthStateChange with a new user object on TOKEN_REFRESHED, but the UUID
  // stays the same. Depending on [user] would re-trigger sync (and setSyncing(true))
  // on every refresh, killing all mounted tab state.
  const userId = user?.id;

  const inboxMember = teamMembers.find(m => m.user_id === userId)
  const inboxEnabled = Boolean(userId && teamMembers.length > 0 && getUserTabs(inboxMember).includes('stylist-inbox'))
  const stylistInbox = useStylistInbox({ enabled: inboxEnabled })

  // Load team_members from Supabase after login
  useEffect(() => {
    if (!userId) { setTeamMembers([]); return; }
    supa.from('team_members').select('*').order('created_at')
      .then(({ data }) => { if (data) setTeamMembers(data); })
      .catch(() => {});
  }, [userId]);

  // Last-active heartbeat — one write per login session
  useEffect(() => {
    if (!userId) return;
    supa.from('team_members')
      .update({ last_active_at: new Date().toISOString() })
      .eq('user_id', userId)
      .then(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) { setSyncing(false); return; }
    setSyncing(true);

    // 1) Load all master data from dedicated Supabase tables (replaces legacy app_state sync)
    var masterSync = reloadFromSupabase().catch(function(e) {
      console.error('[HILO] Master data sync exception:', e);
      _logError('sync_exception', e.message || 'Unknown sync error', e.stack || '');
    });

    // 2) Load fabrics from Supabase `fabrics` table (source of truth)
    var _inlineMapFabrics = function(rows, vendorRows) {
      var vendorMap = {};
      (vendorRows || []).forEach(function(v) { vendorMap[v.id] = v; });
      return rows.map(function(f) {
        var vendor = vendorMap[f.default_vendor_id] || null;
        return {
          id: f.id, fabricSKU: f.id, name: f.name || '',
          costPerMetre: parseFloat(f.default_cost_per_metre) || 0,
          costType: f.cost_type || 'per_metre',
          vendorId: f.default_vendor_id || '',
          vendorName: vendor ? vendor.name : '',
          description: f.description || '',
          image_urls: f.image_urls || [],
          fabric_family: f.fabric_family || '', colour: f.colour || '',
          composition: f.composition || '', weave: f.weave || '',
          width_inches: f.width_inches || null,
          is_active: f.is_active !== false,
          _supaId: f.id, _oldId: '',
          _fabric_family: f.fabric_family || '', _colour: f.colour || '',
        };
      });
    };
    var _safeFabricMapper = (typeof mapSupaFabrics === 'function') ? mapSupaFabrics : _inlineMapFabrics;
    var _inlineVendorMapper = function(rows) {
      return rows.map(function(v) { return { id: v.id, name: v.name || '', location: v.shipping_address || '', contact: v.spoc_phone || v.spoc_email || '', gstin: v.gstin || '' }; });
    };
    var _safeVendorMapper = (typeof mapSupaVendors === 'function') ? mapSupaVendors : _inlineVendorMapper;
    // Guard: if imports resolved to non-functions (e.g. bundler edge case), log and use inlines
    if (typeof _safeFabricMapper !== 'function') { console.warn('[HILO] _safeFabricMapper is not a function, using inline'); _safeFabricMapper = _inlineMapFabrics; }
    if (typeof _safeVendorMapper !== 'function') { console.warn('[HILO] _safeVendorMapper is not a function, using inline'); _safeVendorMapper = _inlineVendorMapper; }

    var fabricSync = (async function() {
      try {
        var fabricRes = await supa.from('fabrics').select('*').order('name');
        console.log('[HILO] Fabric fetch result:', fabricRes?.data?.length || 0, 'rows, error:', fabricRes?.error || 'none');
        if (fabricRes.error) {
          console.error('[HILO] Fabric query error:', fabricRes.error);
          _logError('fabric_query', fabricRes.error.message || 'Unknown', fabricRes.error.details || '');
        }
        if (fabricRes.data && fabricRes.data.length > 0) {
          var vendorRes = await supa.from('fabric_vendors').select('*').order('name');
          var mapped;
          try {
            mapped = _safeFabricMapper(fabricRes.data, (vendorRes && vendorRes.data) || []);
          } catch(mapErr) {
            console.warn('[HILO] _safeFabricMapper failed, using inline:', mapErr.message);
            mapped = _inlineMapFabrics(fabricRes.data, (vendorRes && vendorRes.data) || []);
          }
          console.log('[HILO] Mapped fabrics:', mapped.length);
          setFabrics(mapped);
          if (vendorRes && vendorRes.data && vendorRes.data.length > 0) {
            try {
              setFabricVendors(_safeVendorMapper(vendorRes.data));
            } catch(mapErr2) {
              console.warn('[HILO] _safeVendorMapper failed, using inline:', mapErr2.message);
              setFabricVendors(_inlineVendorMapper(vendorRes.data));
            }
          }
        } else if (!fabricRes.error) {
          console.warn('[HILO] Fabric query returned 0 rows (no error)');
        }
      } catch(e) {
        console.error('[HILO] Fabric fetch exception:', e);
        _logError('fabric_fetch', e.message || 'Unknown fabric fetch error', e.stack || '');
        try {
          await new Promise(function(r) { setTimeout(r, 2000); });
          var retry = await supa.from('fabrics').select('*').order('name');
          if (retry.data && retry.data.length > 0) {
            console.log('[HILO] Fabric retry succeeded:', retry.data.length, 'rows');
            setFabrics(_inlineMapFabrics(retry.data, []));
          }
        } catch(e2) { console.error('[HILO] Fabric retry also failed:', e2); }
      }
    })();

    // Wait for both to finish before clearing the syncing spinner
    Promise.all([masterSync, fabricSync])
      .finally(function() { setSyncing(false); });
  }, [userId]);

  // Load Stitching Cost Master from Supabase (source of truth).
  // Falls back to one-time migration: if the Supabase table is empty
  // and localStorage has legacy entries, upload them to Supabase once.
  useEffect(() => {
    if (!userId) return
    var loadStitchingMaster = async function() {
      try {
        var res = await supa.from('stitching_cost_master').select('*').order('garment_type')
        if (res.error) throw res.error
        var rows = res.data || []
        if (rows.length === 0) {
          // Table empty — check localStorage for legacy entries to migrate
          var local = load('hl_stitching', [])
          if (Array.isArray(local) && local.length > 0) {
            var seed = local
              .filter(function(s) { return s && (s.garmentType || s.category) })
              .map(function(s) {
                return {
                  garment_type: (s.garmentType || s.category || '').toString().trim(),
                  category: (s.category || '').toString(),
                  cost: Number(s.cost) || 0
                }
              })
              .filter(function(s) { return s.garment_type })
            if (seed.length > 0) {
              var ins = await supa.from('stitching_cost_master').insert(seed).select()
              if (!ins.error && ins.data) {
                rows = ins.data
                console.log('[HILO] Migrated ' + rows.length + ' stitching master rows to Supabase')
              }
            }
          }
        }
        var mapped = rows.map(function(r) {
          return {
            id: r.id,
            garmentType: r.garment_type || '',
            category: r.category || '',
            cost: Number(r.cost) || 0
          }
        })
        setStitching(mapped)
      } catch (e) {
        console.error('[HILO] Stitching master load error:', e)
      }
    }
    loadStitchingMaster()
  }, [userId])

  // One-time migration: generate variants for existing products that don't have them
  useEffect(() => {
    if (!products || products.length === 0) return
    const needsMigration = products.some(p => p.styleCode && (!p.variants || p.variants.length === 0))
    if (!needsMigration) return
    const migrated = products.map(p => {
      if (p.styleCode && (!p.variants || p.variants.length === 0)) {
        return { ...p, variants: buildDefaultVariants(p.styleCode, p.mrp, p.sellingPrice) }
      }
      return p
    })
    const count = migrated.filter((p, i) => p !== products[i]).length
    if (count > 0) {
      setProducts(migrated)
      // Persist variant migration to Supabase
      Promise.all(
        migrated.filter((p, i) => p !== products[i]).map(p =>
          supa.from('design_products').update({ variants: p.variants }).eq('id', p.id)
        )
      ).catch(e => console.error('[HILO] Variant migration DB write failed:', e))
      console.log(`[HILO] Variant migration: generated variants for ${count} products`)
    }
  }, [products.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const offerCount = products.filter(p => p.isOffer).length;

  // Conditional renders — after all hooks
  if (!authChecked) return (
    <div className="min-h-screen flex items-center justify-center" style={{background:'#0f172a'}}>
      <div className="font-bold text-2xl tracking-widest" style={{color:'#d4a843'}}>HILO</div>
    </div>
  );

  if (!user) return <LoginScreen />;

  // Derive member record — must be before any guard that references it
  const myMember = teamMembers.find(m => m.user_id === user?.id);
  // Expose current user identity for audit trail logging
  if (myMember) {
    window._currentUserName = myMember.name || myMember.email || '';
    window._currentUserId = myMember.user_id || null;
    window._currentUserRole = myMember.role || '';
    window._currentUserIsFounder = !!myMember.is_founder;
    window._currentUserDesignation = myMember.designation || '';
    // Team member PK (integer as string) — used for leads.assigned_to matching
    window._currentTeamMemberId = String(myMember.id);
  }

  // Authenticated but not in team_members (or members still loading — show nothing until resolved)
  if (teamMembers.length > 0 && !myMember) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background:'#0f172a'}}>
      <div className="text-center">
        <div className="font-bold text-2xl tracking-widest mb-4" style={{color:'#d4a843'}}>HILO</div>
        <div className="text-white/60 text-sm mb-2">Your account is not yet activated.</div>
        <div className="text-white/30 text-xs mb-6">Contact your admin to grant you access.</div>
        <button onClick={() => supa.auth.signOut()} className="text-xs text-white/40 hover:text-white/60 underline">Sign out</button>
      </div>
    </div>
  );
  const isAdmin = myMember?.role === 'admin';
  const allowedTabs = getUserTabs(myMember);

  // Syncing overlay — rendered as a fixed overlay rather than an early return so
  // that mounted tabs stay in the DOM and keep their state (orders loaded, scroll
  // position, open editors) during catalogue sync.
  return (
    <OrdersProvider>
    <div className="flex" style={{background:'#f5f4f0', height:'100vh', overflow:'hidden'}}>
      {syncing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'#0f172a'}}>
          <div className="text-center">
            <div className="font-bold text-2xl tracking-widest mb-3" style={{color:'#d4a843'}}>HILO</div>
            <div className="text-white/30 text-sm">Syncing catalogue…</div>
          </div>
        </div>
      )}
      <Toaster />
      <Sidebar page={page} setPage={navigateTo} productCount={products.length} offerCount={offerCount} user={user} onLogout={handleLogout} allowedTabs={allowedTabs} isAdmin={isAdmin} inboxBadge={stylistInbox.badge} />
      <main
        className="flex-1 main-content"
        style={{
          position: 'relative',
          overflow: page === 'stylist-inbox' ? 'hidden' : 'auto',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <MobileHeader page={page} user={user} onLogout={handleLogout} />
        {/* Refresh button — top right of content area */}
        {page !== 'stylist-inbox' && (
        <button
          onClick={refreshCurrentTab}
          title="Refresh tab data"
          className="refresh-btn"
          style={{
            position:'fixed',
            top:`calc(12px + env(safe-area-inset-top))`,
            right:16, zIndex:45,
            width:36, height:36, borderRadius:'50%',
            background:'rgba(255,255,255,0.95)', border:'1px solid rgba(0,0,0,0.08)',
            boxShadow:'0 2px 8px rgba(0,0,0,0.08)',
            display:'flex', alignItems:'center', justifyContent:'center',
            cursor:'pointer', transition:'all 0.2s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition:'transform 0.5s', transform: refreshing ? 'rotate(360deg)' : 'rotate(0deg)' }}>
            <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        )}
        {/* Keep-alive tab mounting */}
        <div style={{display: page === 'overview'   ? '' : 'none'}}>
          {mountedTabs.has('overview')   && allowedTabs.includes('overview')   && <FounderDashboard key={refreshKeys.overview||0} onNavigate={navigateTo} />}
        </div>
        <div style={{display: page === 'catalogue'  ? '' : 'none'}}>
          {mountedTabs.has('catalogue')  && allowedTabs.includes('catalogue')  && <Catalogue key={refreshKeys.catalogue||0} products={products} setProducts={setProducts} fabrics={fabrics} stitchingMaster={stitching} dyes={dyes} categories={categories} consumption={consumption} />}
        </div>
        <div style={{display: page === 'catalogue-v2'  ? '' : 'none'}}>
          {mountedTabs.has('catalogue-v2')  && allowedTabs.includes('catalogue-v2')  && <CatalogueShellV2 key={refreshKeys['catalogue-v2']||0} products={products} setProducts={setProducts} fabrics={fabrics} stitchingMaster={stitching} dyes={dyes} categories={categories} consumption={consumption} />}
        </div>
        <div style={{display: page === 'pos'        ? '' : 'none'}}>
          {mountedTabs.has('pos')        && allowedTabs.includes('pos')        && <POSTab key={refreshKeys.pos||0} user={user} products={products} fabrics={fabrics} stitchingMaster={stitching} dyes={dyes} categories={categories} consumption={consumption} channels={channels} />}
        </div>
        <div style={{display: page === 'masters'    ? '' : 'none'}}>
          {mountedTabs.has('masters')    && allowedTabs.includes('masters')    && <Masters key={refreshKeys.masters||0} stitching={stitching} setStitching={setStitching} dyes={dyes} setDyes={setDyes} categories={categories} setCategories={setCategories} outsourceVendors={outsourceVendors} setOutsourceVendors={setOutsourceVendors} consumption={consumption} setConsumption={setConsumption} channels={channels} setChannels={setChannels} fabrics={fabrics} />}
        </div>
        <div style={{display: page === 'growth'     ? '' : 'none'}}>
          {mountedTabs.has('growth')     && allowedTabs.includes('growth')     && <GrowthView key={refreshKeys.growth||0} user={user} fabrics={fabrics} stitching={stitching} dyes={dyes} categories={categories} consumption={consumption} products={products} channels={channels} />}
        </div>
        <div style={{display: page === 'production'  ? '' : 'none'}}>
          {mountedTabs.has('production')  && allowedTabs.includes('production')  && <ProductionTab key={refreshKeys.production||0} user={user} products={products} fabrics={fabrics} dyes={dyes} />}
        </div>
        <div style={{display: page === 'fulfillment' ? '' : 'none'}}>
          {mountedTabs.has('fulfillment') && allowedTabs.includes('fulfillment') && <FulfillmentTab key={refreshKeys.fulfillment||0} user={user} stitchingMaster={stitching} openCustomer={openCustomer} />}
        </div>
        <div style={{display: page === 'app-orders' ? '' : 'none'}}>
          {mountedTabs.has('app-orders') && allowedTabs.includes('app-orders') && <AppOrdersTab key={refreshKeys['app-orders']||0} user={user} />}
        </div>
        <div style={{display: page === 'mobile-cms' ? '' : 'none'}}>
          {mountedTabs.has('mobile-cms') && allowedTabs.includes('mobile-cms') && <MobileCmsTab key={refreshKeys['mobile-cms']||0} />}
        </div>
        <div style={{display: page === 'app-users' ? '' : 'none'}}>
          {mountedTabs.has('app-users') && allowedTabs.includes('app-users') && <AppUsersTab key={refreshKeys['app-users']||0} />}
        </div>
        <div style={{display: page === 'app-support' ? '' : 'none'}}>
          {mountedTabs.has('app-support') && allowedTabs.includes('app-support') && <AppSupportTab key={refreshKeys['app-support']||0} user={user} />}
        </div>
        <div style={{display: page === 'stylist-inbox' ? 'flex' : 'none', flex: 1, minHeight: 0, height: '100%', flexDirection: 'column'}}>
          {mountedTabs.has('stylist-inbox') && allowedTabs.includes('stylist-inbox') && (
            <StylistInboxTab
              key={refreshKeys['stylist-inbox']||0}
              waiting={stylistInbox.waiting}
              mine={stylistInbox.mine}
              accessError={stylistInbox.accessError}
              accept={stylistInbox.accept}
              acceptingId={stylistInbox.acceptingId}
              focusId={stylistFocusId}
              onFocusConsumed={() => setStylistFocusId(null)}
            />
          )}
        </div>
        <div style={{display: page === 'delayed'     ? '' : 'none'}}>
          {mountedTabs.has('delayed')     && allowedTabs.includes('delayed')     && <DelayedReportingTab key={refreshKeys.delayed||0} user={user} stitchingMaster={stitching} />}
        </div>
        <div style={{display: page === 'collections' ? '' : 'none'}}>
          {mountedTabs.has('collections') && allowedTabs.includes('collections') && <CollectionsTab key={refreshKeys.collections||0} fabrics={fabrics} stitchingMaster={stitching} dyes={dyes} categories={categories} consumption={consumption} products={products} setProducts={setProducts} user={user} />}
        </div>
        <div style={{display: page === 'customers'  ? '' : 'none'}}>
          {mountedTabs.has('customers')  && allowedTabs.includes('customers')  && <CustomersTab key={refreshKeys.customers||0} user={user} />}
        </div>
        <div style={{display: page === 'franchises' ? '' : 'none'}}>
          {mountedTabs.has('franchises') && allowedTabs.includes('franchises') && <FranchisesTab key={refreshKeys.franchises||0} user={user} />}
        </div>
        <div style={{display: page === 'leads'      ? '' : 'none'}}>
          {mountedTabs.has('leads')      && allowedTabs.includes('leads')      && <LeadsTab key={refreshKeys.leads||0} user={user} />}
        </div>
        <div style={{display: page === 'tasks'      ? '' : 'none'}}>
          {mountedTabs.has('tasks')      && allowedTabs.includes('tasks')      && <TasksTab key={refreshKeys.tasks||0} user={user} />}
        </div>
        <div style={{display: page === 'inventory'  ? '' : 'none'}}>
          {mountedTabs.has('inventory')  && allowedTabs.includes('inventory')  && <InventoryTab key={refreshKeys.inventory||0} user={user} />}
        </div>
        <div style={{display: page === 'fabrics'    ? '' : 'none'}}>
          {mountedTabs.has('fabrics')    && allowedTabs.includes('fabrics')    && <FabricManagement key={refreshKeys.fabrics||0} onFabricsLoaded={(data) => { supa.from('fabric_vendors').select('*').then(function(res) { var vendorData = res.data || []; var mapped = mapSupaFabrics(data, vendorData); setFabrics(mapped); var mappedV = mapSupaVendors(vendorData); setFabricVendors(mappedV); }).catch(function(err) { console.error('Fabric vendor sync failed:', err); }); }} onVendorsLoaded={(data) => { try { var mappedV = mapSupaVendors(data); setFabricVendors(mappedV); } catch(err) { console.error('Vendor mapping failed:', err); } }} />}
        </div>
        <div style={{display: page === 'outsource'  ? '' : 'none'}}>
          {mountedTabs.has('outsource')  && allowedTabs.includes('outsource')  && <OutsourceVendorsTab key={refreshKeys.outsource||0} stitchingMaster={stitching} setStitchingMaster={setStitching} />}
        </div>
        <div style={{display: page === 'hiring'     ? '' : 'none'}}>
          {mountedTabs.has('hiring')     && allowedTabs.includes('hiring')     && <HiringTab key={refreshKeys.hiring||0} user={user} isAdmin={isAdmin} />}
        </div>
        <div style={{display: page === 'users'      ? '' : 'none'}}>
          {mountedTabs.has('users')      && isAdmin                            && <UsersTab key={refreshKeys.users||0} teamMembers={teamMembers} setTeamMembers={setTeamMembers} />}
        </div>
        <div style={{display: page === 'finance'    ? '' : 'none'}}>
          {mountedTabs.has('finance')    && allowedTabs.includes('finance')    && <FinanceTab key={refreshKeys.finance||0} user={user} />}
        </div>
        <div style={{display: page === 'gst'        ? '' : 'none'}}>
          {mountedTabs.has('gst')        && allowedTabs.includes('gst')        && <GSTTab key={refreshKeys.gst||0} user={user} />}
        </div>
        <div style={{display: page === 'returns'    ? '' : 'none'}}>
          {mountedTabs.has('returns')    && allowedTabs.includes('returns')    && <ReturnsTab key={refreshKeys.returns||0} user={user} />}
        </div>
        <div style={{display: page === 'sync-center' ? '' : 'none'}}>
          {mountedTabs.has('sync-center') && allowedTabs.includes('sync-center') && <SyncCenter key={refreshKeys['sync-center']||0} />}
        </div>
      </main>
      <BottomNav page={page} setPage={navigateTo} offerCount={offerCount} allowedTabs={allowedTabs} isAdmin={isAdmin} />
      <AcceptHandoffModal
        item={stylistInbox.modalItem}
        accepting={stylistInbox.acceptingId === stylistInbox.modalItem?.id}
        onDismiss={stylistInbox.dismissModal}
        onAccept={async (id) => {
          try {
            await stylistInbox.accept(id)
            setStylistFocusId(id)
            navigateTo('stylist-inbox')
          } catch {
            // toast already shown
          }
        }}
      />
    </div>
    </OrdersProvider>
  );
};

export default App;

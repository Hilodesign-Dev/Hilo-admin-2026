import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n } from '../../lib/helpers'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import RoyalEliteTab from './RoyalEliteTab'
import ContentHubTab from './ContentHubTab'
import ReEngageTab from './ReEngageTab'
import ReportingTab from './ReportingTab'

// Supabase JS defaults to 1000 rows per query. This fetches all rows in batches.
var fetchAllRows = async function(table, orderCol, batchSize) {
  batchSize = batchSize || 1000;
  var all = [];
  var from = 0;
  while (true) {
    var { data, error } = await supa.from(table).select('*')
      .order(orderCol, { ascending: false })
      .range(from, from + batchSize - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < batchSize) break;
    from += batchSize;
  }
  return all;
};

const CUSTOMER_TYPES = [
  { key: 'normal', label: 'Normal', badge: '⚪', color: '#807664', bg: 'rgba(128,118,100,0.1)' },
  { key: 'repeat', label: 'Repeat', badge: '🔵', color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  { key: 'elite', label: 'Elite', badge: '🟣', color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  { key: 'royal', label: 'Royal', badge: '👑', color: '#d4a843', bg: 'rgba(212,168,67,0.15)' }
];
const SOURCE_OPTIONS = ['shopify','walk_in','referral','instagram','lead'];
const SOURCE_LABELS = { shopify: 'Shopify', walk_in: 'Walk-in', referral: 'Referral', instagram: 'Instagram', lead: 'Lead' };
const RELATIONSHIP_OPTIONS = ['self','father','mother','brother','sister','wife','husband','friend','other'];
const GENDER_OPTIONS = ['male','female','other'];
const UPPER_BODY_FIELDS = [
  { key: 'chest', label: 'Chest' }, { key: 'shoulder', label: 'Shoulder' },
  { key: 'sleeve_length', label: 'Sleeve Length' }, { key: 'arm_hole', label: 'Arm Hole' },
  { key: 'bicep', label: 'Bicep' }, { key: 'wrist', label: 'Wrist' },
  { key: 'front_length', label: 'Front Length' }, { key: 'back_length', label: 'Back Length' }
];
const LOWER_BODY_FIELDS = [
  { key: 'waist', label: 'Waist' }, { key: 'hip', label: 'Hip' },
  { key: 'inseam', label: 'Inseam' }, { key: 'thigh', label: 'Thigh' },
  { key: 'knee', label: 'Knee' }, { key: 'ankle', label: 'Ankle' },
  { key: 'crotch', label: 'Crotch' }, { key: 'rise', label: 'Rise' }
];
const GENERAL_FIELDS = [
  { key: 'height', label: 'Height (in)' }, { key: 'weight', label: 'Weight (kg)' },
  { key: 'neck', label: 'Neck' }
];

// ── Style Constants (PRD: 28 colours, fits, looks, patterns, fabrics, budget) ──
const FIT_OPTIONS = ['Slim','Regular','Relaxed','Oversized'];
const LOOK_OPTIONS = ['Casual','Smart Casual','Formal','Ethnic','Fusion','Festive'];
const COLOUR_PALETTE = ['Black','White','Navy','Grey','Beige','Brown','Maroon','Red','Pink','Coral','Peach','Orange','Mustard','Yellow','Gold','Olive','Green','Sage','Teal','Blue','Indigo','Lavender','Purple','Cream','Ivory','Rust','Charcoal','Camel'];
const PATTERN_OPTIONS = ['Solid','Striped','Checked','Printed','Textured'];
const FABRIC_PREF_OPTIONS = ['Cotton','Linen','Silk','Poly-blend','Denim'];
const BUDGET_OPTIONS = [
  { key: 'under_2k', label: '< ₹2K' }, { key: '2k_5k', label: '₹2-5K' },
  { key: '5k_10k', label: '₹5-10K' }, { key: 'above_10k', label: '₹10K+' }
];

const BODY_TYPE_OPTIONS = ['slim','regular','athletic','plus'];
const MEASURED_BY_OPTIONS = ['Ambica','Varun','sahith@'];

// ── Customer Type Classification (Confirmed: Royal=auto+manual, Elite=manual only) ──
const calcCustomerType = function(orders, spend, currentType, tierOverride) {
  var o = parseInt(orders) || 0;
  var s = parseFloat(spend) || 0;
  // Elite is MANUAL ONLY — never auto-assigned
  if (tierOverride && (currentType === 'elite' || currentType === 'royal')) return currentType;
  // Royal: auto at ₹1L+ spend (configurable threshold)
  if (s >= 100000) return 'royal';
  if (o >= 2) return 'repeat';
  return 'normal';
};

const getTypeBadge = function(type) {
  return CUSTOMER_TYPES.find(function(t) { return t.key === type; }) || CUSTOMER_TYPES[0];
};

// ── ChipSelect Component (defined OUTSIDE parent to prevent cursor-jump) ──
var ChipSelect = function(props) {
  var options = props.options; var selected = props.selected || []; var onChange = props.onChange; var colorMap = props.colorMap;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(function(opt) {
        var isActive = selected.indexOf(opt) !== -1;
        var chipStyle = colorMap && colorMap[opt.toLowerCase()]
          ? { background: isActive ? colorMap[opt.toLowerCase()] : 'transparent', color: isActive ? '#fff' : '#807664', border: '1px solid ' + (isActive ? colorMap[opt.toLowerCase()] : '#d2c5b1') }
          : { background: isActive ? '#795900' : 'transparent', color: isActive ? '#fff' : '#807664', border: '1px solid ' + (isActive ? '#795900' : '#d2c5b1') };
        return (
          <button key={opt} type="button" onClick={function() {
            if (isActive) onChange(selected.filter(function(s) { return s !== opt; }));
            else onChange([].concat(selected, [opt]));
          }} className="px-2.5 py-1 rounded-full text-xs font-medium transition-all" style={chipStyle}>
            {opt}
          </button>
        );
      })}
    </div>
  );
};

// ── MeasurementForm Component (defined OUTSIDE parent per PRD pattern) ──
var MeasurementForm = function(props) {
  var mForm = props.form; var setMForm = props.setForm; var onSave = props.onSave; var onCancel = props.onCancel; var saving = props.saving;
  var mkInput = function(key, label) {
    return (
      <div key={key}>
        <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:3}}>{label}</label>
        <input type="text" inputMode="decimal" value={mForm[key] || ''} onChange={function(e) { var obj = {}; obj[key] = e.target.value; setMForm(Object.assign({}, mForm, obj)); }}
          className="w-full bg-transparent border-0 border-b-2 px-0 py-1.5 text-sm focus:ring-0" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}}
          onFocus={function(e){e.target.style.borderColor='#d4a843';}} onBlur={function(e){e.target.style.borderColor='#d2c5b1';}} />
      </div>
    );
  };
  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{color:'#795900'}}>Upper Body (inches)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          {UPPER_BODY_FIELDS.map(function(f) { return mkInput(f.key, f.label); })}
        </div>
      </div>
      <div>
        <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{color:'#795900'}}>Lower Body (inches)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          {LOWER_BODY_FIELDS.map(function(f) { return mkInput(f.key, f.label); })}
        </div>
      </div>
      <div>
        <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{color:'#795900'}}>General</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
          {GENERAL_FIELDS.map(function(f) { return mkInput(f.key, f.label); })}
          <div>
            <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:3}}>Body Type</label>
            <select value={mForm.body_type || ''} onChange={function(e) { setMForm(Object.assign({}, mForm, { body_type: e.target.value })); }}
              className="w-full bg-transparent border-0 border-b-2 px-0 py-1.5 text-sm focus:ring-0" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}}>
              <option value="">—</option>
              {BODY_TYPE_OPTIONS.map(function(bt) { return <option key={bt} value={bt}>{bt.charAt(0).toUpperCase() + bt.slice(1)}</option>; })}
            </select>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:3}}>Measured By</label>
          <select value={mForm.measured_by || ''} onChange={function(e) { setMForm(Object.assign({}, mForm, { measured_by: e.target.value })); }}
            className="w-full bg-transparent border-0 border-b-2 px-0 py-1.5 text-sm focus:ring-0" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}}>
            <option value="">Select</option>
            {MEASURED_BY_OPTIONS.map(function(mb) { return <option key={mb} value={mb}>{mb}</option>; })}
          </select>
        </div>
        <div>
          <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:3}}>Notes</label>
          <input type="text" value={mForm.notes || ''} onChange={function(e) { setMForm(Object.assign({}, mForm, { notes: e.target.value })); }}
            className="w-full bg-transparent border-0 border-b-2 px-0 py-1.5 text-sm focus:ring-0" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} placeholder="Any notes" />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-3" style={{borderTop:'1px solid #e9e8e4'}}>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{color:'#807664',border:'1px solid #d2c5b1'}}>Cancel</button>
        <button onClick={onSave} disabled={saving} className="px-5 py-2 rounded-lg text-xs font-bold text-white" style={{background:'linear-gradient(135deg, #795900, #d4a843)'}}>
          {saving ? 'Saving…' : 'Save Measurement'}
        </button>
      </div>
    </div>
  );
};

// ── StyleProfileForm Component (defined OUTSIDE parent per PRD pattern) ──
var StyleProfileForm = function(props) {
  var profile = props.profile; var setProfile = props.setProfile; var onSave = props.onSave; var saving = props.saving;
  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{color:'#795900'}}>Preferred Fits</label>
        <ChipSelect options={FIT_OPTIONS} selected={profile.preferred_fits || []} onChange={function(v) { setProfile(Object.assign({}, profile, { preferred_fits: v })); }} />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{color:'#795900'}}>Preferred Looks</label>
        <ChipSelect options={LOOK_OPTIONS} selected={profile.preferred_looks || []} onChange={function(v) { setProfile(Object.assign({}, profile, { preferred_looks: v })); }} />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{color:'#795900'}}>Colour Preferences</label>
        <ChipSelect options={COLOUR_PALETTE} selected={profile.colour_preferences || []} onChange={function(v) { setProfile(Object.assign({}, profile, { colour_preferences: v })); }} />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{color:'#795900'}}>Pattern Preferences</label>
        <ChipSelect options={PATTERN_OPTIONS} selected={profile.pattern_preferences || []} onChange={function(v) { setProfile(Object.assign({}, profile, { pattern_preferences: v })); }} />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{color:'#795900'}}>Fabric Preferences</label>
        <ChipSelect options={FABRIC_PREF_OPTIONS} selected={profile.fabric_preferences || []} onChange={function(v) { setProfile(Object.assign({}, profile, { fabric_preferences: v })); }} />
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{color:'#795900'}}>Budget Range (per piece)</label>
        <div className="flex flex-wrap gap-2">
          {BUDGET_OPTIONS.map(function(b) {
            var isActive = profile.budget_range === b.key;
            return <button key={b.key} type="button" onClick={function() { setProfile(Object.assign({}, profile, { budget_range: b.key })); }}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
              style={{background: isActive ? '#795900' : 'transparent', color: isActive ? '#fff' : '#807664', border: '1px solid ' + (isActive ? '#795900' : '#d2c5b1')}}>{b.label}</button>;
          })}
        </div>
      </div>
      <div>
        <label className="text-xs font-bold uppercase tracking-widest mb-2 block" style={{color:'#795900'}}>Style Notes</label>
        <textarea value={profile.style_notes || ''} onChange={function(e) { setProfile(Object.assign({}, profile, { style_notes: e.target.value })); }}
          className="w-full bg-transparent border-0 border-b-2 px-0 py-2 text-sm focus:ring-0 min-h-16 resize-none" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}}
          placeholder="e.g. doesn't like V-neck, prefers pastel colours" />
      </div>
      <div className="flex justify-end pt-3" style={{borderTop:'1px solid #e9e8e4'}}>
        <button onClick={onSave} disabled={saving} className="px-5 py-2 rounded-lg text-xs font-bold text-white" style={{background:'linear-gradient(135deg, #795900, #d4a843)'}}>
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
};

const CustomersTab = function(props) {
  var user = props.user;
  // ── State ──
  var _s = React.useState; var _e = React.useEffect; var _cb = React.useCallback; var _m = React.useMemo;
  var _r = function(init) { var s = _s(init); return [s[0], s[1]]; };
  var [buyers, setBuyers] = _s([]);
  var [customers, setCustomers] = _s([]);
  var [measurements, setMeasurements] = _s([]);
  var [styleProfiles, setStyleProfiles] = _s([]);
  var [loading, setLoading] = _s(true);
  var [screen, setScreen] = _s('list'); // list | buyer_detail | customer_detail
  var [subTab, setSubTab] = _s('buyers'); // buyers | royal_elite | content_hub | re_engage
  var [selectedBuyer, setSelectedBuyer] = _s(null);
  var [selectedCustomer, setSelectedCustomer] = _s(null);
  var [customerTab, setCustomerTab] = _s('profile'); // profile | measurements | style | orders
  var [search, setSearch] = _s('');
  var [sourceFilter, setSourceFilter] = _s('All');
  var [typeFilter, setTypeFilter] = _s('All');
  var [cityFilter, setCityFilter] = _s('All');
  var [dateFrom, setDateFrom] = _s('');
  var [dateTo, setDateTo] = _s('');
  var [showBuyerForm, setShowBuyerForm] = _s(false);
  var [showCustomerForm, setShowCustomerForm] = _s(false);
  var [showMeasForm, setShowMeasForm] = _s(false);
  var [showHistory, setShowHistory] = _s(false);
  var [editingBuyer, setEditingBuyer] = _s(null);
  var [saving, setSaving] = _s(false);
  var [syncMsg, setSyncMsg] = _s('');
  var [buyerForm, setBuyerForm] = _s({ name: '', phone: '', email: '', billing_address: '', city: '', state: '', country: 'India', pincode: '', source: 'walk_in', notes: '' });
  var [custForm, setCustForm] = _s({ name: '', phone: '', gender: '', relationship: 'self', notes: '' });
  var [measForm, setMeasForm] = _s({});
  var [styleForm, setStyleForm] = _s({ preferred_fits: [], preferred_looks: [], colour_preferences: [], pattern_preferences: [], fabric_preferences: [], budget_range: '', style_notes: '' });
  var [orders, setOrders] = _s([]);
  var [page, setPage] = _s(1);
  var PAGE_SIZE = 20;
  var [teamMembersLocal, setTeamMembersLocal] = _s([]);
  var [dir, setDir] = _s([]);        // current page of buyer directory (server-paginated MV)
  var [total, setTotal] = _s(0);     // total buyers matching filters
  var [cities, setCities] = _s([]);
  var [dsearch, setDsearch] = _s(''); // debounced search
  var [kpi, setKpi] = _s({ total_buyers: 0, total_customers: 0, normal: 0, repeat_n: 0, elite: 0, royal: 0, pending_activation: 0 });

  // ── Server-paginated buyer directory (reads pre-aggregated mv_buyer_directory) ──
  var fetchPage = _cb(async function() {
    setLoading(true);
    try {
      var q = supa.from('mv_buyer_directory').select('*', { count: 'exact' });
      var sv = (dsearch || '').replace(/[%,()]/g, ' ').trim();
      if (sv) q = q.or('name.ilike.%' + sv + '%,phone.ilike.%' + sv + '%,customer_phones.ilike.%' + sv + '%,email.ilike.%' + sv + '%,city.ilike.%' + sv + '%');
      if (sourceFilter !== 'All') q = q.eq('source', sourceFilter);
      if (cityFilter !== 'All') q = q.eq('city', cityFilter);
      if (typeFilter !== 'All') q = q.contains('customer_types', [typeFilter]);
      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59');
      q = q.order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      var { data, count } = await q;
      setDir(data || []); setTotal(count || 0);
    } catch (e) { console.error('Customer page fetch error:', e); }
    finally { setLoading(false); }
  }, [dsearch, sourceFilter, cityFilter, typeFilter, dateFrom, dateTo, page]);
  _e(function() { fetchPage(); }, [fetchPage]);

  // refresh the materialized view then reload current page (after writes / sync)
  var fetchAll = _cb(async function() { try { await supa.rpc('refresh_buyer_directory'); } catch (e) {} await fetchPage(); }, [fetchPage]);

  // debounce search → reset to page 1
  _e(function() { var t = setTimeout(function() { setDsearch(search); setPage(1); }, 350); return function() { clearTimeout(t); }; }, [search]);

  // one-time small loads (measurements 43, style profiles 9, team, top cities)
  _e(function() {
    supa.from('customer_measurements').select('*').order('created_at', { ascending: false }).then(function(r) { setMeasurements(r.data || []); });
    supa.from('customer_style_profiles').select('*').then(function(r) { setStyleProfiles(r.data || []); });
    supa.from('team_members').select('id, name, designation').order('name').then(function(r) { setTeamMembersLocal(r.data || []); });
    supa.from('v_buyer_cities').select('*').then(function(r) { setCities((r.data || []).map(function(x) { return x.city; })); });
    supa.from('v_customer_kpis').select('*').maybeSingle().then(function(r) { if (r.data) setKpi(r.data); });
  }, []);

  // Deep-link support: when opened with #/customers?customer=<id>, auto-jump
  // to that buyer's profile. The id may be either a customers.id or a
  // buyers.id — try customer first, then fall back to buyer match.
  _e(function() {
    if (loading) return;
    var hash = (typeof window !== 'undefined' && window.location.hash) || '';
    var qIdx = hash.indexOf('?');
    if (qIdx < 0) return;
    var params = new URLSearchParams(hash.slice(qIdx + 1));
    var focus = params.get('customer') || params.get('buyer');
    if (!focus) return;
    (async function() {
      var bid = focus;
      try { var { data: c } = await supa.from('customers').select('buyer_id').eq('id', focus).maybeSingle(); if (c && c.buyer_id) bid = c.buyer_id; } catch (e) {}
      var { data: buyer } = await supa.from('buyers').select('*').eq('id', bid).maybeSingle();
      if (buyer) {
        openBuyerDetail(buyer);
        try { var clean = hash.slice(0, qIdx); window.history.replaceState(null, '', window.location.pathname + clean); } catch (e) {}
      }
    })();
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live deep-link: focus a customer while the tab is already mounted
  // (e.g. clicking a customer name in Fulfillment). Registers a global the
  // rest of the app can call, and consumes any pending focus id on mount.
  _e(function() {
    var doFocus = function(focus) {
      if (!focus) return;
      (async function() {
        var bid = focus;
        try { var { data: c } = await supa.from('customers').select('buyer_id').eq('id', focus).maybeSingle(); if (c && c.buyer_id) bid = c.buyer_id; } catch (e) {}
        var { data: buyer } = await supa.from('buyers').select('*').eq('id', bid).maybeSingle();
        if (buyer) openBuyerDetail(buyer);
      })();
    };
    window.__hiloFocusCustomer = doFocus;
    if (window._customerFocusId) { var pid = window._customerFocusId; window._customerFocusId = null; doFocus(pid); }
    return function() { if (window.__hiloFocusCustomer === doFocus) { try { delete window.__hiloFocusCustomer; } catch (e) {} } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Local state updaters (avoid full refetch after edits) ──
  var updateCustomerLocal = _cb(function(id, changes) {
    setCustomers(function(prev) {
      return prev.map(function(c) { return c.id === id ? Object.assign({}, c, changes) : c; });
    });
  }, []);

  var updateBuyerLocal = _cb(function(id, changes) {
    setBuyers(function(prev) {
      return prev.map(function(b) { return b.id === id ? Object.assign({}, b, changes) : b; });
    });
  }, []);

  var addBuyerLocal = _cb(function(buyer) {
    setBuyers(function(prev) { return [buyer].concat(prev); });
  }, []);

  var addCustomerLocal = _cb(function(cust) {
    setCustomers(function(prev) { return [cust].concat(prev); });
  }, []);

  var addMeasurementLocal = _cb(function(meas) {
    setMeasurements(function(prev) {
      // Deactivate old ones for same customer, add new
      return [meas].concat(prev.map(function(m) {
        return m.customer_id === meas.customer_id && m.is_active ? Object.assign({}, m, { is_active: false }) : m;
      }));
    });
  }, []);

  var updateStyleProfileLocal = _cb(function(customerId, changes) {
    setStyleProfiles(function(prev) {
      var found = false;
      var updated = prev.map(function(sp) {
        if (sp.customer_id === customerId) { found = true; return Object.assign({}, sp, changes); }
        return sp;
      });
      if (!found) updated = [Object.assign({ customer_id: customerId }, changes)].concat(updated);
      return updated;
    });
  }, []);

  // ── Shopify Sync (via Edge Function — syncs Shopify customers in batches) ──
  var [syncing, setSyncing] = useState(false);
  var [fullSyncMode, setFullSyncMode] = useState(false);
  var syncShopify = _cb(async function(fullSync) {
    var isFullSync = fullSync === true;
    setFullSyncMode(isFullSync);
    setSyncing(true);
    var totalCreated = 0, totalUpdated = 0, totalFetched = 0, totalLinked = 0;
    var sinceDate = ''; // empty = default 90 days (or 2020 for full sync)
    var runCount = 0;
    var maxRuns = isFullSync ? 50 : 10; // full sync needs more batches for ~28K customers
    try {
      while (runCount < maxRuns) {
        runCount++;
        setSyncMsg((isFullSync ? 'Full sync' : 'Syncing') + ' from Shopify… batch ' + runCount + (totalFetched > 0 ? ' (' + totalFetched + ' so far)' : ''));
        var body = sinceDate ? { since: sinceDate } : {};
        if (isFullSync && runCount === 1) body.full_sync = true;
        var { data, error } = await supa.functions.invoke('sync-customers', { body });
        if (error) {
          console.error('Sync-customers error:', error);
          setSyncMsg('Sync failed on batch ' + runCount + ': ' + (error.message || 'Unknown error'));
          setTimeout(function() { setSyncMsg(''); }, 5000);
          return;
        }
        if (data && data.success) {
          totalCreated += data.created || 0;
          totalUpdated += data.updated || 0;
          totalFetched += data.total_fetched || 0;
          totalLinked += (data.line_items_linked_by_email || 0) + (data.line_items_linked_by_name || 0);
          // If more customers remain, use cursor for next batch
          if (data.has_more && data.last_updated_at) {
            sinceDate = data.last_updated_at;
          } else {
            break; // all done
          }
        } else {
          setSyncMsg('Sync error: ' + (data?.error || 'Failed'));
          setTimeout(function() { setSyncMsg(''); }, 5000);
          return;
        }
      }
      var parts = [];
      if (totalCreated > 0) parts.push(totalCreated + ' new');
      if (totalUpdated > 0) parts.push(totalUpdated + ' updated');
      if (totalLinked > 0) parts.push(totalLinked + ' orders linked');
      var msg = parts.length > 0
        ? 'Synced ' + totalFetched + ' Shopify customers — ' + parts.join(', ')
        : totalFetched + ' Shopify customers already up to date';
      if (runCount >= maxRuns) msg += ' (hit batch limit, run again for more)';
      setSyncMsg(msg);
      setTimeout(function() { setSyncMsg(''); }, 8000);
      await fetchAll();
    } catch (e) {
      console.error('Shopify sync error:', e);
      setSyncMsg('Sync failed — check Shopify connection');
      setTimeout(function() { setSyncMsg(''); }, 5000);
    } finally {
      setSyncing(false);
    }
  }, [fetchAll]);

  // ── Helpers ──
  var getBuyerCustomers = function(buyerId) { return customers.filter(function(c) { return c.buyer_id === buyerId; }); };
  var getCustomerMeasurement = function(custId) { return measurements.find(function(m) { return m.customer_id === custId && m.is_active; }); };
  var getCustomerMeasurements = function(custId) { return measurements.filter(function(m) { return m.customer_id === custId; }); };
  var getStyleProfile = function(custId) { return styleProfiles.find(function(s) { return s.customer_id === custId; }); };
  var getBuyerSpend = function(buyerId) {
    var custs = getBuyerCustomers(buyerId);
    return custs.reduce(function(t, c) { return t + n(c.total_spend); }, 0);
  };
  var fmtDate = function(iso) { if (!iso) return '—'; var d = new Date(iso); return String(d.getDate()).padStart(2,'0') + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getFullYear()).slice(-2); };

  // ── KPI stats (from v_customer_kpis, global) ──
  var stats = _m(function() {
    return { totalBuyers: kpi.total_buyers, totalCustomers: kpi.total_customers,
      typeCounts: { normal: kpi.normal, repeat: kpi.repeat_n, elite: kpi.elite, royal: kpi.royal },
      pendingActivation: kpi.pending_activation };
  }, [kpi]);

  // ── Unique cities for filter dropdown ──
  var uniqueCities = cities;  // top cities from v_buyer_cities

  // Server-paginated + server-filtered: dir holds the current page already.
  var paged = dir;
  var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Save buyer ──
  var saveBuyer = async function() {
    if (!buyerForm.name.trim()) { alert('Name is required'); return; }
    setSaving(true);
    try {
      if (editingBuyer) {
        var { error } = await supa.from('buyers').update(Object.assign({}, buyerForm, { updated_at: new Date().toISOString() })).eq('id', editingBuyer);
        if (error) throw error;
        updateBuyerLocal(editingBuyer, Object.assign({}, buyerForm, { updated_at: new Date().toISOString() }));
      } else {
        var { data: bData, error: bErr } = await supa.from('buyers').insert([Object.assign({}, buyerForm, { created_by: user?.email || '' })]).select();
        if (bErr) throw bErr;
        if (bData && bData[0]) {
          var { data: cData } = await supa.from('customers').insert([{ buyer_id: bData[0].id, name: buyerForm.name, phone: buyerForm.phone, relationship: 'self', created_by: user?.email || '' }]).select();
          addBuyerLocal(bData[0]);
          if (cData && cData[0]) addCustomerLocal(cData[0]);
        }
      }
      if (editingBuyer && selectedBuyer && selectedBuyer.id === editingBuyer) setSelectedBuyer(Object.assign({}, selectedBuyer, buyerForm));
      setShowBuyerForm(false); setEditingBuyer(null);
      setBuyerForm({ name: '', phone: '', email: '', billing_address: '', city: '', state: '', country: 'India', pincode: '', source: 'walk_in', notes: '' });
      fetchAll();  // refresh directory (background)
    } catch (e) { alert('Failed to save: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  // ── Save customer ──
  var saveCustomer = async function() {
    if (!custForm.name.trim()) { alert('Name is required'); return; }
    setSaving(true);
    try {
      var { data: cData, error } = await supa.from('customers').insert([Object.assign({}, custForm, { buyer_id: selectedBuyer.id, created_by: user?.email || '' })]).select();
      if (error) throw error;
      if (cData && cData[0]) addCustomerLocal(cData[0]);
      setShowCustomerForm(false);
      setCustForm({ name: '', phone: '', gender: '', relationship: 'self', notes: '' });
      supa.rpc('refresh_buyer_directory');  // background: update list counts/spend
    } catch (e) { alert('Failed to save: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  // ── Save measurement ──
  var saveMeasurement = async function() {
    setSaving(true);
    try {
      await supa.from('customer_measurements').update({ is_active: false }).eq('customer_id', selectedCustomer.id).eq('is_active', true);
      var payload = Object.assign({}, measForm, { customer_id: selectedCustomer.id, is_active: true, measurement_source: 'in_store' });
      Object.keys(payload).forEach(function(k) { if (UPPER_BODY_FIELDS.concat(LOWER_BODY_FIELDS).concat(GENERAL_FIELDS).some(function(f){return f.key===k;}) && payload[k]) payload[k] = parseFloat(payload[k]) || null; });
      var { data: mData, error } = await supa.from('customer_measurements').insert([payload]).select();
      if (error) throw error;
      if (mData && mData[0]) addMeasurementLocal(mData[0]);
      setShowMeasForm(false); setMeasForm({});
    } catch (e) { alert('Failed to save: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  // ── Save style profile ──
  var saveStyleProfile = async function() {
    setSaving(true);
    try {
      var existing = getStyleProfile(selectedCustomer.id);
      if (existing) {
        var { error } = await supa.from('customer_style_profiles').update(Object.assign({}, styleForm, { updated_at: new Date().toISOString() })).eq('customer_id', selectedCustomer.id);
        if (error) throw error;
      } else {
        var { error: iErr } = await supa.from('customer_style_profiles').insert([Object.assign({}, styleForm, { customer_id: selectedCustomer.id })]);
        if (iErr) throw iErr;
      }
      updateStyleProfileLocal(selectedCustomer.id, Object.assign({}, styleForm, { updated_at: new Date().toISOString() }));
    } catch (e) { alert('Failed to save: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  // ── Load orders for customer ──
  var loadCustomerOrders = async function(cust) {
    // Identity = phone number / email (unique key). Roll up every order for any
    // customer/buyer record sharing this phone or email, even across duplicates.
    try {
      var byId = {};
      var digits = String(cust.phone || '').replace(/\D/g, '');
      var emailBuyer = buyers.find(function(b) { return b.id === cust.buyer_id; });
      var email = String(cust.email || (emailBuyer && emailBuyer.email) || '').trim();

      // 1. all customer records sharing this phone (covers duplicate profiles)
      var custIds = new Set([cust.id]);
      if (digits.length >= 6) {
        var { data: sameCusts } = await supa.from('customers').select('id').ilike('phone', '%' + digits + '%');
        (sameCusts || []).forEach(function(c) { custIds.add(c.id); });
        var { data: sameBuyers } = await supa.from('buyers').select('id').ilike('phone', '%' + digits + '%');
        var bids = (sameBuyers || []).map(function(b) { return b.id; });
        if (bids.length) { var { data: bc } = await supa.from('customers').select('id').in('buyer_id', bids); (bc || []).forEach(function(c) { custIds.add(c.id); }); }
      }
      // 2. orders linked to any of those customer records
      var ids = Array.from(custIds);
      if (ids.length) {
        var { data: linked } = await supa.from('shopify_orders').select('*')
          .or('buyer_customer_id.in.(' + ids.join(',') + '),customer_id.in.(' + ids.join(',') + ')')
          .order('created_at', { ascending: false });
        (linked || []).forEach(function(o) { byId[o.id] = o; });
      }
      // 3. fallback matches by phone / email captured directly on the order
      if (digits.length >= 6) {
        var { data: byPhone } = await supa.from('shopify_orders').select('*').ilike('delivery_phone', '%' + digits + '%');
        (byPhone || []).forEach(function(o) { byId[o.id] = o; });
      }
      if (email) {
        var { data: byEmail } = await supa.from('shopify_orders').select('*').ilike('customer_email', email);
        (byEmail || []).forEach(function(o) { byId[o.id] = o; });
      }
      var list = Object.values(byId).sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
      setOrders(list);
    } catch(e) { console.error(e); setOrders([]); }
  };

  // ── Navigate helpers ──
  var openBuyerDetail = async function(buyer) {
    setSelectedBuyer(buyer); setScreen('buyer_detail');
    try { var { data } = await supa.from('customers').select('*').eq('buyer_id', buyer.id).order('created_at', { ascending: false }); setCustomers(data || []); }
    catch (e) { setCustomers([]); }
  };
  var openCustomerDetail = function(cust) {
    setSelectedCustomer(cust); setCustomerTab('profile'); setScreen('customer_detail');
    loadCustomerOrders(cust);
    var sp = getStyleProfile(cust.id);
    setStyleForm(sp ? { preferred_fits: sp.preferred_fits || [], preferred_looks: sp.preferred_looks || [], colour_preferences: sp.colour_preferences || [], pattern_preferences: sp.pattern_preferences || [], fabric_preferences: sp.fabric_preferences || [], budget_range: sp.budget_range || '', style_notes: sp.style_notes || '' } : { preferred_fits: [], preferred_looks: [], colour_preferences: [], pattern_preferences: [], fabric_preferences: [], budget_range: '', style_notes: '' });
  };
  var goBack = function() {
    if (screen === 'customer_detail') { setScreen('buyer_detail'); setSelectedCustomer(null); }
    else if (screen === 'buyer_detail') { setScreen('list'); setSelectedBuyer(null); }
  };

  if (loading) return <div className="fade-in p-4 sm:p-8"><div className="text-center py-16" style={{color:'#807664'}}><div className="inline-block w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin mb-3" style={{borderColor:'#d4a843',borderTopColor:'transparent'}}></div><div className="text-sm font-medium">Loading customers...</div></div></div>;

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN: Buyer List
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'list') {
    return (
      <div className="fade-in p-4 sm:p-8" style={{maxWidth:1200,margin:'0 auto'}}>
        {/* Page Header */}
        <div className="mb-6">
          <h1 style={{fontFamily:'Manrope,sans-serif',fontWeight:800,fontSize:'1.75rem',letterSpacing:'-0.02em',color:'#1b1c1a',lineHeight:1.1,marginBottom:4}}>Customers</h1>
          <p className="page-subtitle mb-0">Manage buyers, customers, measurements & style profiles</p>
        </div>

        {syncMsg && <div className="mb-5 px-4 py-2.5 rounded-xl text-xs font-semibold" style={{background:'rgba(76,175,80,0.08)',color:'#2e7d32',border:'1px solid rgba(76,175,80,0.15)'}}>{syncMsg}</div>}

        {/* Sub-Tab Navigation */}
        <div className="flex items-center gap-1 mb-5 p-1 rounded-xl" style={{background:'#f0ebe3',border:'1px solid #eae8e4'}}>
          {[
            { key: 'buyers', label: 'All Customers', icon: '👥' },
            { key: 'royal_elite', label: 'Royal & Elite', icon: '👑' },
            { key: 'content_hub', label: 'Content Hub', icon: '📸' },
            { key: 're_engage', label: 'Re-Engage', icon: '📞' },
            { key: 'reporting', label: 'Reporting', icon: '📊' }
          ].map(function(t) {
            var active = subTab === t.key;
            return <button key={t.key} onClick={function() { setSubTab(t.key) }}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all"
              style={{background: active ? '#fff' : 'transparent', color: active ? '#795900' : '#807664', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'}}>
              {t.icon} {t.label}
            </button>
          })}
        </div>

        {/* Render sub-tab content */}
        {subTab === 'royal_elite' && (
          <RoyalEliteTab buyers={buyers} customers={customers} teamMembers={teamMembersLocal} onRefresh={fetchAll} updateCustomerLocal={updateCustomerLocal} />
        )}
        {subTab === 'content_hub' && (
          <ContentHubTab buyers={buyers} customers={customers} onRefresh={fetchAll} updateCustomerLocal={updateCustomerLocal} />
        )}
        {subTab === 're_engage' && (
          <ReEngageTab buyers={buyers} customers={customers} teamMembers={teamMembersLocal} onRefresh={fetchAll} updateCustomerLocal={updateCustomerLocal} />
        )}
        {subTab === 'reporting' && (
          <ReportingTab buyers={buyers} customers={customers} teamMembers={teamMembersLocal} onRefresh={fetchAll} />
        )}

        {subTab !== 'buyers' ? null : (<React.Fragment>
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: 'Total Buyers', value: stats.totalBuyers, icon: '👤', bg: '#fff', accent: '#795900' },
            { label: 'Total Customers', value: stats.totalCustomers, icon: '👥', bg: '#fff', accent: '#795900' },
            { label: 'Royal', value: stats.typeCounts.royal, icon: '👑', bg: 'rgba(212,168,67,0.06)', accent: '#b8860b' },
            { label: 'Elite', value: stats.typeCounts.elite, icon: '🟣', bg: 'rgba(124,58,237,0.04)', accent: '#7c3aed' },
            { label: 'Repeat', value: stats.typeCounts.repeat, icon: '🔵', bg: 'rgba(37,99,235,0.04)', accent: '#2563eb' },
            { label: 'Pending', value: stats.pendingActivation, icon: '🔗', bg: 'rgba(234,179,8,0.04)', accent: '#d97706' }
          ].map(function(k) {
            return <div key={k.label} className="rounded-xl p-4" style={{background:k.bg,border:'1px solid #eae8e4',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
              <div className="flex items-center justify-between mb-1.5">
                <span style={{fontSize:16}}>{k.icon}</span>
              </div>
              <div className="text-2xl font-bold" style={{color:k.accent,fontFamily:'Manrope,sans-serif'}}>{k.value}</div>
              <div className="text-xs font-medium mt-0.5" style={{color:'#807664'}}>{k.label}</div>
            </div>;
          })}
        </div>

        {/* Toolbar: Search + Filters + Add Button */}
        <div className="rounded-xl p-3 sm:p-4 mb-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3" style={{background:'#f8f7f5',border:'1px solid #eae8e4'}}>
          <div className="flex-1 relative">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{color:'#807664'}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" value={search} onChange={function(e) { setSearch(e.target.value); setPage(1); }}
              className="w-full rounded-lg pl-9 pr-3 py-2 text-sm border focus:ring-1 focus:ring-amber-300 focus:border-amber-400" style={{borderColor:'#d2c5b1',color:'#1b1c1a',background:'#fff'}} placeholder="Search by name, phone, or email..." />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <select value={sourceFilter} onChange={function(e) { setSourceFilter(e.target.value); setPage(1); }}
                className="appearance-none rounded-lg pl-3 pr-7 py-2 text-xs font-medium border cursor-pointer"
                style={sourceFilter !== 'All' ? {background:'#fef3c7',color:'#92400e',borderColor:'#fcd34d'} : {background:'#fff',color:'#807664',borderColor:'#d2c5b1'}}>
                <option value="All">All Sources</option>
                {SOURCE_OPTIONS.map(function(s) { return <option key={s} value={s}>{SOURCE_LABELS[s]}</option>; })}
              </select>
              <span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',fontSize:8,color:'#807664'}}>▼</span>
            </div>
            <div className="relative">
              <select value={typeFilter} onChange={function(e) { setTypeFilter(e.target.value); setPage(1); }}
                className="appearance-none rounded-lg pl-3 pr-7 py-2 text-xs font-medium border cursor-pointer"
                style={typeFilter !== 'All' ? {background:'#fef3c7',color:'#92400e',borderColor:'#fcd34d'} : {background:'#fff',color:'#807664',borderColor:'#d2c5b1'}}>
                <option value="All">All Types</option>
                {CUSTOMER_TYPES.map(function(t) { return <option key={t.key} value={t.key}>{t.badge} {t.label}</option>; })}
              </select>
              <span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',fontSize:8,color:'#807664'}}>▼</span>
            </div>
            {uniqueCities.length > 0 && (
              <div className="relative">
                <select value={cityFilter} onChange={function(e) { setCityFilter(e.target.value); setPage(1); }}
                  className="appearance-none rounded-lg pl-3 pr-7 py-2 text-xs font-medium border cursor-pointer"
                  style={cityFilter !== 'All' ? {background:'#fef3c7',color:'#92400e',borderColor:'#fcd34d'} : {background:'#fff',color:'#807664',borderColor:'#d2c5b1'}}>
                  <option value="All">All Cities</option>
                  {uniqueCities.map(function(c) { return <option key={c} value={c}>{c}</option>; })}
                </select>
                <span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',pointerEvents:'none',fontSize:8,color:'#807664'}}>▼</span>
              </div>
            )}
            <input type="date" value={dateFrom} onChange={function(e) { setDateFrom(e.target.value); setPage(1); }}
              className="rounded-lg px-2 py-2 text-xs border" style={{borderColor:'#d2c5b1',color: dateFrom ? '#92400e' : '#807664', background: dateFrom ? '#fef3c7' : '#fff'}} title="From date" />
            <input type="date" value={dateTo} onChange={function(e) { setDateTo(e.target.value); setPage(1); }}
              className="rounded-lg px-2 py-2 text-xs border" style={{borderColor:'#d2c5b1',color: dateTo ? '#92400e' : '#807664', background: dateTo ? '#fef3c7' : '#fff'}} title="To date" />
            {(sourceFilter !== 'All' || typeFilter !== 'All' || cityFilter !== 'All' || dateFrom || dateTo || search) && (
              <button onClick={function() { setSourceFilter('All'); setTypeFilter('All'); setCityFilter('All'); setDateFrom(''); setDateTo(''); setSearch(''); setPage(1); }}
                className="px-2.5 py-2 rounded-lg text-xs font-semibold hover:bg-gray-100" style={{color:'#795900',border:'1px solid #d2c5b1'}}>Clear</button>
            )}
            <button onClick={function() { syncShopify(false); }} disabled={syncing}
              className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 flex-shrink-0 transition-all" style={{background:syncing ? '#f3f0eb' : '#fff',color:'#795900',border:'1px solid #d2c5b1',opacity:syncing ? 0.7 : 1,cursor:syncing ? 'wait' : 'pointer'}}>
              <svg className={'w-3.5 h-3.5' + (syncing ? ' animate-spin' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {syncing && !fullSyncMode ? 'Syncing…' : 'Sync Recent'}
            </button>
            <button onClick={function() { if (window.confirm('This will sync ALL customers from Shopify since 2020. This may take several minutes. Continue?')) syncShopify(true); }} disabled={syncing}
              className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 flex-shrink-0 transition-all" style={{background:syncing && fullSyncMode ? '#f3f0eb' : '#fff',color:'#16a34a',border:'1px solid #86efac',opacity:syncing ? 0.7 : 1,cursor:syncing ? 'wait' : 'pointer'}}>
              <svg className={'w-3.5 h-3.5' + (syncing && fullSyncMode ? ' animate-spin' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {syncing && fullSyncMode ? 'Full Sync…' : 'Sync All'}
            </button>
            <button onClick={function() { setShowBuyerForm(true); setEditingBuyer(null); setBuyerForm({ name: '', phone: '', email: '', billing_address: '', city: '', state: '', country: 'India', pincode: '', source: 'walk_in', notes: '' }); }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 flex-shrink-0" style={{background:'linear-gradient(135deg, #795900, #d4a843)',boxShadow:'0 2px 8px rgba(121,89,0,0.25)'}}>
              <Icon name="plus" cls="w-3.5 h-3.5" /> New Buyer
            </button>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold" style={{color:'#807664'}}>{total} buyer{total !== 1 ? 's' : ''} {(sourceFilter !== 'All' || typeFilter !== 'All' || cityFilter !== 'All' || dateFrom || dateTo || search) ? '(filtered)' : ''}</span>
          {totalPages > 1 && <span className="text-xs" style={{color:'#807664'}}>Page {page} of {totalPages}</span>}
        </div>

        {/* Buyer Table */}
        <div className="rounded-xl overflow-hidden" style={{border:'1px solid #eae8e4',background:'#fff',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
          <div style={{overflowX:'auto'}}>
            <table className="w-full text-sm" style={{minWidth:750}}>
              <thead><tr style={{background:'#f8f7f5',borderBottom:'2px solid #eae8e4'}}>
                {['Buyer','Contact','Source','Customers','Spend','Type','Since',''].map(function(h) {
                  return <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{color:'#807664',letterSpacing:'0.08em'}}>{h}</th>;
                })}
              </tr></thead>
              <tbody>
                {paged.map(function(b, ri) {
                  var bCount = b.customer_count || 0;
                  var topType = (b.customer_types || []).reduce(function(best, t) {
                    var order = ['normal','repeat','elite','royal'];
                    return order.indexOf(t || 'normal') > order.indexOf(best) ? (t || 'normal') : best;
                  }, 'normal');
                  var tb = getTypeBadge(topType);
                  var totalSpend = b.total_spend || 0;
                  return (
                    <tr key={b.id} onClick={function() { openBuyerDetail(b); }} className="cursor-pointer hover:bg-amber-50/50 transition-colors" style={{borderBottom:'1px solid #f0efec'}}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{background:'linear-gradient(135deg, #795900, #d4a843)',fontSize:13,fontFamily:'Manrope,sans-serif'}}>{(b.name || 'B').charAt(0).toUpperCase()}</div>
                          <span className="font-semibold" style={{color:'#1b1c1a'}}>{b.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs" style={{color:'#807664'}}>{b.phone || '—'}</div>
                        <div className="text-xs truncate" style={{color:'#a09888',maxWidth:180}}>{b.email || ''}</div>
                      </td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:'rgba(121,89,0,0.06)',color:'#795900'}}>{SOURCE_LABELS[b.source] || b.source}</span></td>
                      <td className="px-4 py-3 text-center"><span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold" style={{background:'rgba(121,89,0,0.06)',color:'#795900'}}>{bCount}</span></td>
                      <td className="px-4 py-3 font-semibold text-sm" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace',fontSize:12}}>{totalSpend > 0 ? fmt(totalSpend.toFixed(0)) : '—'}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{background:tb.bg,color:tb.color}}>{tb.badge} {tb.label}</span></td>
                      <td className="px-4 py-3 text-xs" style={{color:'#807664'}}>{fmtDate(b.created_at)}</td>
                      <td className="px-4 py-3"><svg className="w-4 h-4" style={{color:'#c9a432'}} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {paged.length === 0 && !loading && <div className="text-center py-16 rounded-xl" style={{color:'#807664',background:'#f8f7f5',border:'1px solid #eae8e4',marginTop:-1}}>No buyers found. {search || sourceFilter !== 'All' || typeFilter !== 'All' ? 'Try adjusting your filters.' : 'Create one to get started.'}</div>}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-1" style={{fontSize:12,color:'#807664'}}>
            <span>Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, total)} of {total}</span>
            <div className="flex items-center gap-1">
              <button onClick={function(){setPage(Math.max(1,page-1));}} disabled={page===1} className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" style={{color:page===1?'#d2c5b1':'#795900',background:page===1?'transparent':'rgba(121,89,0,0.06)'}}>‹ Prev</button>
              <button onClick={function(){setPage(Math.min(totalPages,page+1));}} disabled={page===totalPages} className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors" style={{color:page===totalPages?'#d2c5b1':'#795900',background:page===totalPages?'transparent':'rgba(121,89,0,0.06)'}}>Next ›</button>
            </div>
          </div>
        )}

        {/* Add/Edit Buyer Modal */}
        {showBuyerForm && (
          <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.45)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}>
            <div className="rounded-2xl overflow-hidden w-full" style={{background:'#fff',maxWidth:560,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 25px 50px rgba(0,0,0,0.15)'}}>
              <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{background:'linear-gradient(135deg, #795900, #d4a843)'}}>
                <h3 style={{fontFamily:'Manrope,sans-serif',fontSize:'1.05rem',fontWeight:700,color:'#fff'}}>{editingBuyer ? 'Edit Buyer' : 'New Buyer'}</h3>
                <button onClick={function() { setShowBuyerForm(false); }} className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"><Icon name="x" cls="w-4 h-4" /></button>
              </div>
              <div className="p-6 space-y-4" style={{overflowY:'auto',flex:1}}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Name <span style={{color:'#ba1a1a'}}>*</span></label>
                    <input type="text" value={buyerForm.name} onChange={function(e) { setBuyerForm(Object.assign({}, buyerForm, { name: e.target.value })); }}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} placeholder="Full name" />
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Phone</label>
                    <input type="tel" value={buyerForm.phone} onChange={function(e) { setBuyerForm(Object.assign({}, buyerForm, { phone: e.target.value })); }}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} placeholder="+91 98765 43210" />
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Email</label>
                    <input type="email" value={buyerForm.email} onChange={function(e) { setBuyerForm(Object.assign({}, buyerForm, { email: e.target.value })); }}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} placeholder="email@example.com" />
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Source</label>
                    <select value={buyerForm.source} onChange={function(e) { setBuyerForm(Object.assign({}, buyerForm, { source: e.target.value })); }}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400 cursor-pointer" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}}>
                      {SOURCE_OPTIONS.map(function(s) { return <option key={s} value={s}>{SOURCE_LABELS[s]}</option>; })}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>City</label>
                    <input type="text" value={buyerForm.city} onChange={function(e) { setBuyerForm(Object.assign({}, buyerForm, { city: e.target.value })); }}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} />
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>State</label>
                    <input type="text" value={buyerForm.state} onChange={function(e) { setBuyerForm(Object.assign({}, buyerForm, { state: e.target.value })); }}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} />
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Pincode</label>
                    <input type="text" value={buyerForm.pincode} onChange={function(e) { setBuyerForm(Object.assign({}, buyerForm, { pincode: e.target.value })); }}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} />
                  </div>
                  <div className="col-span-2">
                    <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Billing Address</label>
                    <input type="text" value={buyerForm.billing_address} onChange={function(e) { setBuyerForm(Object.assign({}, buyerForm, { billing_address: e.target.value })); }}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} />
                  </div>
                  <div className="col-span-2">
                    <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Notes</label>
                    <input type="text" value={buyerForm.notes} onChange={function(e) { setBuyerForm(Object.assign({}, buyerForm, { notes: e.target.value })); }}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} placeholder="Any notes" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 flex-shrink-0" style={{borderTop:'1px solid #eae8e4',background:'#faf9f7'}}>
                <button onClick={function() { setShowBuyerForm(false); }} className="px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors hover:bg-gray-100" style={{color:'#807664',border:'1px solid #d2c5b1'}}>Cancel</button>
                <button onClick={saveBuyer} disabled={saving} className="px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all" style={{background:'linear-gradient(135deg, #795900, #d4a843)',boxShadow:'0 2px 8px rgba(121,89,0,0.3)'}}>{saving ? 'Saving…' : editingBuyer ? 'Update' : 'Create Buyer'}</button>
              </div>
            </div>
          </div>
        )}
        </React.Fragment>)}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN: Buyer Detail
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'buyer_detail' && selectedBuyer) {
    var bCusts = getBuyerCustomers(selectedBuyer.id);
    var buyerSpend = bCusts.reduce(function(s, c) { return s + n(c.total_spend); }, 0);
    return (
      <div className="fade-in p-4 sm:p-8" style={{maxWidth:1000,margin:'0 auto'}}>
        <button onClick={goBack} className="flex items-center gap-1.5 text-xs font-semibold mb-5 hover:underline" style={{color:'#795900'}}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg> All Buyers
        </button>

        {/* Buyer Header Card */}
        <div className="rounded-xl p-5 sm:p-6 mb-6" style={{background:'#fff',border:'1px solid #eae8e4',boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center font-bold text-white flex-shrink-0" style={{background:'linear-gradient(135deg, #795900, #d4a843)',fontSize:22,fontFamily:'Manrope,sans-serif'}}>{(selectedBuyer.name || 'B').charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="font-bold text-xl" style={{fontFamily:'Manrope,sans-serif',color:'#1b1c1a'}}>{selectedBuyer.name}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{background:'rgba(121,89,0,0.08)',color:'#795900'}}>{SOURCE_LABELS[selectedBuyer.source] || selectedBuyer.source}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap text-xs" style={{color:'#807664'}}>
                {selectedBuyer.phone && <span style={{fontFamily:'JetBrains Mono,monospace'}}>{selectedBuyer.phone}</span>}
                {selectedBuyer.email && <span>{selectedBuyer.email}</span>}
              </div>
              {(selectedBuyer.billing_address || selectedBuyer.city) && (
                <div className="text-xs mt-2" style={{color:'#a09888'}}>{[selectedBuyer.billing_address, selectedBuyer.city, selectedBuyer.state, selectedBuyer.pincode].filter(Boolean).join(', ')}</div>
              )}
            </div>
            <button onClick={function() { setEditingBuyer(selectedBuyer.id); setBuyerForm({ name: selectedBuyer.name, phone: selectedBuyer.phone || '', email: selectedBuyer.email || '', billing_address: selectedBuyer.billing_address || '', city: selectedBuyer.city || '', state: selectedBuyer.state || '', country: selectedBuyer.country || 'India', pincode: selectedBuyer.pincode || '', source: selectedBuyer.source || 'walk_in', notes: selectedBuyer.notes || '' }); setShowBuyerForm(true); }}
              className="p-2 rounded-lg hover:bg-gray-100 flex-shrink-0 transition-colors" style={{color:'#795900'}}><Icon name="edit" cls="w-4 h-4" /></button>
          </div>
          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mt-5 pt-5" style={{borderTop:'1px solid #f0efec'}}>
            <div className="text-center">
              <div className="text-base sm:text-lg font-bold" style={{color:'#795900',fontFamily:'Manrope,sans-serif'}}>{bCusts.length}</div>
              <div className="text-xs font-medium" style={{color:'#807664'}}>Customers</div>
            </div>
            <div className="text-center">
              <div className="text-base sm:text-lg font-bold" style={{color:'#795900',fontFamily:'JetBrains Mono,monospace'}}>{buyerSpend > 0 ? fmt(buyerSpend.toFixed(0)) : '—'}</div>
              <div className="text-xs font-medium" style={{color:'#807664'}}>Total Spend</div>
            </div>
            <div className="text-center col-span-2 sm:col-span-1">
              <div className="text-base sm:text-lg font-bold" style={{color:'#807664'}}>{fmtDate(selectedBuyer.created_at)}</div>
              <div className="text-xs font-medium" style={{color:'#807664'}}>Member Since</div>
            </div>
          </div>
        </div>

        {/* Customers Section */}
        <div className="flex items-center justify-between mb-4">
          <h3 style={{fontFamily:'Manrope,sans-serif',fontWeight:700,fontSize:'1rem',color:'#1b1c1a'}}>Customers ({bCusts.length})</h3>
          <button onClick={function() { setShowCustomerForm(true); setCustForm({ name: '', phone: '', gender: '', relationship: 'self', notes: '' }); }}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5" style={{background:'linear-gradient(135deg, #795900, #d4a843)',boxShadow:'0 2px 8px rgba(121,89,0,0.25)'}}>
            <Icon name="plus" cls="w-3.5 h-3.5" /> Add Customer
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bCusts.map(function(c) {
            var tb = getTypeBadge(c.customer_type || 'normal');
            var hasMeas = !!getCustomerMeasurement(c.id);
            var hasStyle = !!getStyleProfile(c.id);
            return (
              <div key={c.id} onClick={function() { openCustomerDetail(c); }} className="rounded-xl p-4 cursor-pointer hover:shadow-md transition-all" style={{background:'#fff',border:'1px solid #eae8e4',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white flex-shrink-0" style={{background: c.gender === 'female' ? 'linear-gradient(135deg, #ec4899, #f472b6)' : 'linear-gradient(135deg, #2563eb, #60a5fa)', fontSize:14}}>{(c.name || 'C').charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm" style={{color:'#1b1c1a'}}>{c.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{background:'rgba(121,89,0,0.06)',color:'#795900',textTransform:'capitalize'}}>{c.relationship}</span>
                      {c.gender && <span className="text-xs" style={{color:'#a09888',textTransform:'capitalize'}}>{c.gender}</span>}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{background:tb.bg,color:tb.color}}>{tb.badge} {tb.label}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{background: hasMeas ? 'rgba(22,163,74,0.06)' : 'rgba(234,179,8,0.08)', color: hasMeas ? '#16a34a' : '#d97706'}}>{hasMeas ? '✓ Measured' : '○ No measurements'}</span>
                  {hasStyle && <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{background:'rgba(124,58,237,0.06)',color:'#7c3aed'}}>✓ Styled</span>}
                  {c.activation_status === 'pending' && <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{background:'rgba(234,179,8,0.08)',color:'#d97706'}}>🔗 Pending</span>}
                </div>
              </div>
            );
          })}
        </div>
        {bCusts.length === 0 && <div className="text-center py-12 rounded-xl" style={{color:'#807664',background:'#f8f7f5',border:'1px solid #eae8e4'}}>No customers yet for this buyer. Add one to get started.</div>}

        {/* Add Customer Modal */}
        {showCustomerForm && (
          <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.45)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}>
            <div className="rounded-2xl overflow-hidden w-full" style={{background:'#fff',maxWidth:480,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 25px 50px rgba(0,0,0,0.15)'}}>
              <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{background:'linear-gradient(135deg, #795900, #d4a843)'}}>
                <h3 style={{fontFamily:'Manrope,sans-serif',fontSize:'1.05rem',fontWeight:700,color:'#fff'}}>Add Customer</h3>
                <button onClick={function() { setShowCustomerForm(false); }} className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"><Icon name="x" cls="w-4 h-4" /></button>
              </div>
              <div className="p-6 space-y-4" style={{overflowY:'auto',flex:1}}>
                <div>
                  <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Name <span style={{color:'#ba1a1a'}}>*</span></label>
                  <input type="text" value={custForm.name} onChange={function(e) { setCustForm(Object.assign({}, custForm, { name: e.target.value })); }}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} placeholder="Customer name" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Phone</label>
                    <input type="tel" value={custForm.phone} onChange={function(e) { setCustForm(Object.assign({}, custForm, { phone: e.target.value })); }}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} />
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Gender</label>
                    <select value={custForm.gender} onChange={function(e) { setCustForm(Object.assign({}, custForm, { gender: e.target.value })); }}
                      className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400 cursor-pointer" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}}>
                      <option value="">—</option>
                      {GENDER_OPTIONS.map(function(g) { return <option key={g} value={g} style={{textTransform:'capitalize'}}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>; })}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Relationship to Buyer</label>
                  <select value={custForm.relationship} onChange={function(e) { setCustForm(Object.assign({}, custForm, { relationship: e.target.value })); }}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400 cursor-pointer" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}}>
                    {RELATIONSHIP_OPTIONS.map(function(r) { return <option key={r} value={r} style={{textTransform:'capitalize'}}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>; })}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Notes</label>
                  <input type="text" value={custForm.notes} onChange={function(e) { setCustForm(Object.assign({}, custForm, { notes: e.target.value })); }}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 focus:border-amber-400" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} />
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 flex-shrink-0" style={{borderTop:'1px solid #eae8e4',background:'#faf9f7'}}>
                <button onClick={function() { setShowCustomerForm(false); }} className="px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors hover:bg-gray-100" style={{color:'#807664',border:'1px solid #d2c5b1'}}>Cancel</button>
                <button onClick={saveCustomer} disabled={saving} className="px-6 py-2.5 rounded-xl text-xs font-bold text-white" style={{background:'linear-gradient(135deg, #795900, #d4a843)',boxShadow:'0 2px 8px rgba(121,89,0,0.3)'}}>{saving ? 'Saving…' : 'Add Customer'}</button>
              </div>
            </div>
          </div>
        )}
        {/* Edit Buyer Modal */}
        {showBuyerForm && (
          <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.45)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}>
            <div className="rounded-2xl overflow-hidden w-full" style={{background:'#fff',maxWidth:560,maxHeight:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 25px 50px rgba(0,0,0,0.15)'}}>
              <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{background:'linear-gradient(135deg, #795900, #d4a843)'}}>
                <h3 style={{fontFamily:'Manrope,sans-serif',fontSize:'1.05rem',fontWeight:700,color:'#fff'}}>Edit Buyer</h3>
                <button onClick={function() { setShowBuyerForm(false); }} className="w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"><Icon name="x" cls="w-4 h-4" /></button>
              </div>
              <div className="p-6 space-y-4" style={{overflowY:'auto',flex:1}}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2"><label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Name</label><input type="text" value={buyerForm.name} onChange={function(e){setBuyerForm(Object.assign({},buyerForm,{name:e.target.value}));}} className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} /></div>
                  <div><label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Phone</label><input type="tel" value={buyerForm.phone} onChange={function(e){setBuyerForm(Object.assign({},buyerForm,{phone:e.target.value}));}} className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} /></div>
                  <div><label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Email</label><input type="email" value={buyerForm.email} onChange={function(e){setBuyerForm(Object.assign({},buyerForm,{email:e.target.value}));}} className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} /></div>
                  <div><label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>Source</label><select value={buyerForm.source} onChange={function(e){setBuyerForm(Object.assign({},buyerForm,{source:e.target.value}));}} className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300 cursor-pointer" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}}>{SOURCE_OPTIONS.map(function(s){return <option key={s} value={s}>{SOURCE_LABELS[s]}</option>;})}</select></div>
                  <div><label style={{fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'#807664',display:'block',marginBottom:4}}>City</label><input type="text" value={buyerForm.city} onChange={function(e){setBuyerForm(Object.assign({},buyerForm,{city:e.target.value}));}} className="w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-1 focus:ring-amber-300" style={{borderColor:'#d2c5b1',color:'#1b1c1a'}} /></div>
                </div>
              </div>
              <div className="flex justify-end gap-3 px-6 py-4 flex-shrink-0" style={{borderTop:'1px solid #eae8e4',background:'#faf9f7'}}>
                <button onClick={function(){setShowBuyerForm(false);}} className="px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors hover:bg-gray-100" style={{color:'#807664',border:'1px solid #d2c5b1'}}>Cancel</button>
                <button onClick={saveBuyer} disabled={saving} className="px-6 py-2.5 rounded-xl text-xs font-bold text-white" style={{background:'linear-gradient(135deg, #795900, #d4a843)',boxShadow:'0 2px 8px rgba(121,89,0,0.3)'}}>{saving ? 'Saving…' : 'Update'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN: Customer Detail
  // ═══════════════════════════════════════════════════════════════════════════
  if (screen === 'customer_detail' && selectedCustomer) {
    var tb = getTypeBadge(selectedCustomer.customer_type || 'normal');
    var activeMeas = getCustomerMeasurement(selectedCustomer.id);
    var allMeas = getCustomerMeasurements(selectedCustomer.id);
    var ltv = orders.reduce(function(s, o) { return s + n(o.total_price); }, 0);

    return (
      <div className="fade-in p-4 sm:p-8" style={{maxWidth:1000,margin:'0 auto'}}>
        <button onClick={goBack} className="flex items-center gap-1.5 text-xs font-semibold mb-5 hover:underline" style={{color:'#795900'}}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg> {selectedBuyer ? selectedBuyer.name : 'Buyer'}
        </button>

        {/* Customer Header */}
        <div className="rounded-xl p-5 sm:p-6 mb-6" style={{background:'#fff',border:'1px solid #eae8e4',boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center font-bold text-white flex-shrink-0" style={{background: selectedCustomer.gender === 'female' ? 'linear-gradient(135deg, #ec4899, #f472b6)' : 'linear-gradient(135deg, #2563eb, #60a5fa)', fontSize:22,fontFamily:'Manrope,sans-serif'}}>{(selectedCustomer.name || 'C').charAt(0).toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="font-bold text-xl" style={{fontFamily:'Manrope,sans-serif',color:'#1b1c1a'}}>{selectedCustomer.name}</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{background:tb.bg,color:tb.color}}>{tb.badge} {tb.label}</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded font-medium" style={{background:'rgba(121,89,0,0.06)',color:'#795900',textTransform:'capitalize'}}>{selectedCustomer.relationship}</span>
                {selectedCustomer.gender && <span className="text-xs" style={{color:'#807664',textTransform:'capitalize'}}>{selectedCustomer.gender}</span>}
                {selectedCustomer.phone && <span className="text-xs" style={{color:'#807664',fontFamily:'JetBrains Mono,monospace'}}>{selectedCustomer.phone}</span>}
              </div>
            </div>
            {selectedCustomer.activation_status === 'pending' && (
              <button onClick={function() { alert('Activation link feature — coming with Notifications module #10'); }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0" style={{background:'rgba(234,179,8,0.1)',color:'#92400e',border:'1px solid rgba(234,179,8,0.25)'}}>Send Activation Link</button>
            )}
          </div>
          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-5 pt-5" style={{borderTop:'1px solid #f0efec'}}>
            <div className="text-center">
              <div className="text-sm font-bold" style={{color:'#1b1c1a'}}>{orders.length}</div>
              <div className="text-xs" style={{color:'#807664'}}>Orders</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{ltv > 0 ? fmt(ltv.toFixed(0)) : '—'}</div>
              <div className="text-xs" style={{color:'#807664'}}>LTV</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold" style={{color: activeMeas ? '#16a34a' : '#d97706'}}>{activeMeas ? '✓' : '—'}</div>
              <div className="text-xs" style={{color:'#807664'}}>Measured</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold" style={{color: selectedCustomer.activation_status === 'completed' ? '#16a34a' : '#d97706',textTransform:'capitalize'}}>{selectedCustomer.activation_status || 'pending'}</div>
              <div className="text-xs" style={{color:'#807664'}}>Activation</div>
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 p-1 rounded-xl w-full sm:w-fit mb-5" style={{background:'#efeeea'}}>
          {[{key:'profile',label:'Profile'},{key:'measurements',label:'Measurements'},{key:'style',label:'Style'},{key:'orders',label:'Orders (' + orders.length + ')'}].map(function(t) {
            return <button key={t.key} onClick={function() { setCustomerTab(t.key); }}
              className={'flex-shrink-0 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ' + (customerTab === t.key ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700')}
              style={customerTab === t.key ? {color:'#795900',fontWeight:600} : {}}>{t.label}</button>;
          })}
        </div>

        {/* Profile Tab */}
        {customerTab === 'profile' && (
          <div className="rounded-xl p-5 sm:p-6" style={{background:'#fff',border:'1px solid #eae8e4',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 text-sm">
              <div><span className="text-xs font-bold uppercase tracking-widest" style={{color:'#807664',letterSpacing:'0.08em'}}>Name</span><div className="mt-1.5 font-semibold" style={{color:'#1b1c1a'}}>{selectedCustomer.name}</div></div>
              <div><span className="text-xs font-bold uppercase tracking-widest" style={{color:'#807664',letterSpacing:'0.08em'}}>Phone</span><div className="mt-1.5" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{selectedCustomer.phone || '—'}</div></div>
              <div><span className="text-xs font-bold uppercase tracking-widest" style={{color:'#807664',letterSpacing:'0.08em'}}>Gender</span><div className="mt-1.5" style={{color:'#1b1c1a',textTransform:'capitalize'}}>{selectedCustomer.gender || '—'}</div></div>
              <div><span className="text-xs font-bold uppercase tracking-widest" style={{color:'#807664',letterSpacing:'0.08em'}}>Relationship</span><div className="mt-1.5" style={{color:'#1b1c1a',textTransform:'capitalize'}}>{selectedCustomer.relationship}</div></div>
              <div><span className="text-xs font-bold uppercase tracking-widest" style={{color:'#807664',letterSpacing:'0.08em'}}>Type</span><div className="mt-1.5"><span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{background:tb.bg,color:tb.color}}>{tb.badge} {tb.label}</span></div></div>
              <div><span className="text-xs font-bold uppercase tracking-widest" style={{color:'#807664',letterSpacing:'0.08em'}}>Activation</span><div className="mt-1.5 text-xs font-semibold" style={{color: selectedCustomer.activation_status === 'completed' ? '#16a34a' : '#d97706',textTransform:'capitalize'}}>{selectedCustomer.activation_status || 'pending'}</div></div>
              {selectedCustomer.notes && <div className="col-span-2 sm:col-span-3"><span className="text-xs font-bold uppercase tracking-widest" style={{color:'#807664',letterSpacing:'0.08em'}}>Notes</span><div className="mt-1.5" style={{color:'#1b1c1a'}}>{selectedCustomer.notes}</div></div>}
            </div>
          </div>
        )}

        {/* Measurements Tab */}
        {customerTab === 'measurements' && (
          <div>
            {!showMeasForm && (
              <div className="flex justify-end mb-4">
                <button onClick={function() { setShowMeasForm(true); setMeasForm(activeMeas ? Object.assign({}, activeMeas) : {}); }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5" style={{background:'linear-gradient(135deg, #795900, #d4a843)',boxShadow:'0 2px 8px rgba(121,89,0,0.25)'}}>
                  <Icon name="plus" cls="w-3.5 h-3.5" /> New Measurement
                </button>
              </div>
            )}
            {showMeasForm && (
              <div className="rounded-xl p-5 sm:p-6 mb-4" style={{background:'#fff',border:'1px solid #eae8e4',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
                <MeasurementForm form={measForm} setForm={setMeasForm} onSave={saveMeasurement} onCancel={function() { setShowMeasForm(false); }} saving={saving} />
              </div>
            )}
            {!showMeasForm && activeMeas && (
              <div className="rounded-xl p-5 sm:p-6" style={{background:'#fff',border:'1px solid #eae8e4',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{background:'#16a34a'}}></span>
                    <span className="text-xs font-bold uppercase tracking-widest" style={{color:'#795900',letterSpacing:'0.08em'}}>Active Measurement</span>
                  </div>
                  <div className="text-xs" style={{color:'#807664'}}>{fmtDate(activeMeas.created_at)} {activeMeas.measured_by ? '· by ' + activeMeas.measured_by : ''}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest mb-3 pb-2" style={{color:'#807664',letterSpacing:'0.08em',borderBottom:'1px solid #f0efec'}}>Upper Body (in)</div>
                    <div className="space-y-1.5">
                      {UPPER_BODY_FIELDS.map(function(f) { return <div key={f.key} className="flex justify-between text-sm"><span style={{color:'#807664'}}>{f.label}</span><span className="font-semibold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{activeMeas[f.key] || '—'}</span></div>; })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest mb-3 pb-2" style={{color:'#807664',letterSpacing:'0.08em',borderBottom:'1px solid #f0efec'}}>Lower Body (in)</div>
                    <div className="space-y-1.5">
                      {LOWER_BODY_FIELDS.map(function(f) { return <div key={f.key} className="flex justify-between text-sm"><span style={{color:'#807664'}}>{f.label}</span><span className="font-semibold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{activeMeas[f.key] || '—'}</span></div>; })}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest mb-3 pb-2" style={{color:'#807664',letterSpacing:'0.08em',borderBottom:'1px solid #f0efec'}}>General</div>
                    <div className="space-y-1.5">
                      {GENERAL_FIELDS.map(function(f) { return <div key={f.key} className="flex justify-between text-sm"><span style={{color:'#807664'}}>{f.label}</span><span className="font-semibold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{activeMeas[f.key] || '—'}</span></div>; })}
                      <div className="flex justify-between text-sm"><span style={{color:'#807664'}}>Body Type</span><span className="font-semibold capitalize" style={{color:'#1b1c1a'}}>{activeMeas.body_type || '—'}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!showMeasForm && !activeMeas && <div className="text-center py-16 rounded-xl" style={{color:'#807664',background:'#f8f7f5',border:'1px solid #eae8e4'}}>No measurements recorded yet. Click "New Measurement" to add.</div>}
            {/* History toggle */}
            {allMeas.length > 1 && !showMeasForm && (
              <div className="mt-4">
                <button onClick={function() { setShowHistory(!showHistory); }} className="text-xs font-semibold flex items-center gap-1.5 hover:underline" style={{color:'#795900'}}>
                  {showHistory ? '▾ Hide History' : '▸ View History (' + (allMeas.length - 1) + ' previous)'}
                </button>
                {showHistory && (
                  <div className="mt-3 space-y-2">
                    {allMeas.filter(function(m) { return !m.is_active; }).map(function(m) {
                      return <div key={m.id} className="rounded-lg px-4 py-3 text-xs" style={{background:'#f8f7f5',border:'1px solid #eae8e4',opacity:0.8}}>
                        <div className="flex justify-between mb-1.5"><span className="font-semibold" style={{color:'#1b1c1a'}}>{fmtDate(m.created_at)}</span><span style={{color:'#807664'}}>{m.measured_by || ''}</span></div>
                        <div className="flex flex-wrap gap-2" style={{color:'#807664'}}>
                          {UPPER_BODY_FIELDS.concat(LOWER_BODY_FIELDS).concat(GENERAL_FIELDS).filter(function(f) { return m[f.key]; }).map(function(f) {
                            return <span key={f.key}>{f.label}: <b style={{color:'#1b1c1a'}}>{m[f.key]}</b></span>;
                          })}
                        </div>
                      </div>;
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Style Profile Tab */}
        {customerTab === 'style' && (
          <div className="rounded-xl p-5 sm:p-6" style={{background:'#fff',border:'1px solid #eae8e4',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
            <StyleProfileForm profile={styleForm} setProfile={setStyleForm} onSave={saveStyleProfile} saving={saving} />
          </div>
        )}

        {/* Orders Tab */}
        {customerTab === 'orders' && (
          <div>
            {ltv > 0 && (
              <div className="rounded-xl px-5 py-3.5 mb-5 flex items-center justify-between" style={{background:'rgba(212,168,67,0.06)',border:'1px solid rgba(212,168,67,0.15)'}}>
                <span className="text-xs font-bold uppercase tracking-widest" style={{color:'#795900',letterSpacing:'0.08em'}}>Lifetime Value</span>
                <span className="font-bold text-lg" style={{color:'#795900',fontFamily:'JetBrains Mono,monospace'}}>{fmt(ltv.toFixed(0))}</span>
              </div>
            )}
            {orders.length > 0 ? (
              <div className="rounded-xl overflow-hidden" style={{border:'1px solid #eae8e4',background:'#fff',boxShadow:'0 1px 3px rgba(0,0,0,0.04)'}}>
                <div style={{overflowX:'auto'}}>
                  <table className="w-full text-sm" style={{minWidth:550}}>
                    <thead><tr style={{background:'#f8f7f5',borderBottom:'2px solid #eae8e4'}}>
                      {['Date','Order ID','Items','Channel','Status','Total'].map(function(h) {
                        return <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{color:'#807664',letterSpacing:'0.08em'}}>{h}</th>;
                      })}
                    </tr></thead>
                    <tbody>
                      {orders.map(function(o) {
                        var items = o.line_items ? (Array.isArray(o.line_items) ? o.line_items : []).length : 0;
                        return <tr key={o.id} style={{borderBottom:'1px solid #f0efec'}}>
                          <td className="px-4 py-3 text-xs" style={{color:'#807664'}}>{fmtDate(o.created_at)}</td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold" style={{color:'#1b1c1a'}}>{o.order_number || o.id}</td>
                          <td className="px-4 py-3 text-center">{items}</td>
                          <td className="px-4 py-3 text-xs"><span className="px-2 py-0.5 rounded text-xs font-medium" style={{background:'rgba(121,89,0,0.06)',color:'#795900'}}>{o.channel || 'shopify'}</span></td>
                          <td className="px-4 py-3 text-xs" style={{textTransform:'capitalize'}}>{o.fulfillment_status || o.financial_status || '—'}</td>
                          <td className="px-4 py-3 font-semibold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace',fontSize:12}}>{fmt(n(o.total_price).toFixed(0))}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 rounded-xl" style={{color:'#807664',background:'#f8f7f5',border:'1px solid #eae8e4'}}>No orders yet for this customer.</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
};

// ─── Collections & Design Products Tab ─────────────────────────────────────────

export default CustomersTab

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load, uploadImage } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n } from '../../lib/helpers'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

var VLabel = function(props) { return <label style={{fontFamily:'Manrope,sans-serif',fontSize:11,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'#4e4636',display:'block',marginBottom:4}}>{props.children} {props.req && <span style={{color:'#ba1a1a',fontSize:14,lineHeight:1}}>✱</span>}</label>; };
var VInput = function(props) { var mono = props.mono; var rest = Object.assign({}, props); delete rest.mono; delete rest.style; return <input {...rest} style={{...{background:'transparent',border:'none',borderBottom:'1px solid rgba(210,197,177,0.4)',borderRadius:0,paddingLeft:0,paddingRight:0,width:'100%',fontSize:14,paddingTop:8,paddingBottom:8,color:'#1b1c1a',outline:'none'},...(mono ? {fontFamily:'JetBrains Mono,monospace',letterSpacing:'0.05em'} : {fontFamily:'Inter,sans-serif'}),...(props.style||{})}} className="" onFocus={function(e){e.target.style.borderBottom='2px solid #795900';}} onBlur={function(e){e.target.style.borderBottom='1px solid rgba(210,197,177,0.4)';}} />; };
var VTextarea = function(props) { return <textarea {...props} style={{background:'transparent',border:'none',borderBottom:'1px solid rgba(210,197,177,0.4)',borderRadius:0,paddingLeft:0,paddingRight:0,width:'100%',fontSize:14,paddingTop:8,paddingBottom:8,color:'#1b1c1a',outline:'none',minHeight:64,resize:'none',fontFamily:'Inter,sans-serif'}} className="" onFocus={function(e){e.target.style.borderBottom='2px solid #795900';}} onBlur={function(e){e.target.style.borderBottom='1px solid rgba(210,197,177,0.4)';}} />; };

const FabricVendorsTab = ({ onVendorsLoaded }) => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [amountDue, setAmountDue] = useState({});
  const [fabrics, setFabrics] = useState([]);
  const [expandedVendor, setExpandedVendor] = useState(null);

  const emptyForm = { name: '', logo_url: '', spoc_name: '', spoc_phone: '', spoc_email: '', has_gst: true, gst_percent: 5, gstin: '', pan: '', bank_name: '', bank_account: '', bank_ifsc: '', shipping_address: '', billing_address: '', notes: '' };
  const [form, setForm] = useState(emptyForm);

  useEffect(function() { fetchVendors(); }, []);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      var { data, error } = await supa.from('fabric_vendors').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setVendors(data || []);
      if (onVendorsLoaded) onVendorsLoaded(data || []);
      await fetchAmountDue(data || []);
      var { data: fabricData } = await supa.from('fabrics').select('id, name, default_vendor_id, vendors, default_cost_per_metre, cost_type, colour, image_urls, is_active, category, material_subtype').order('name');
      setFabrics(fabricData || []);
    } catch (e) { console.error('Fetch vendors error:', e); }
    finally { setLoading(false); }
  };

  const fetchAmountDue = async (vendorList) => {
    var dues = {};
    for (var i = 0; i < vendorList.length; i++) {
      var v = vendorList[i];
      var { data } = await supa.from('fabric_purchase_orders').select('balance_due').eq('vendor_id', v.id).not('status', 'in', '(closed,cancelled,paid)');
      if (data) dues[v.id] = data.reduce(function(sum, po) { return sum + n(po.balance_due); }, 0);
    }
    setAmountDue(dues);
  };

  const nextFVId = () => {
    var nums = vendors.map(function(v) { var m = (v.id||'').match(/-(\d+)$/); return m ? +m[1] : 0; });
    var next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
    return 'FV-' + String(next).padStart(3,'0');
  };

  var getFabricsForVendor = function(vendorId) {
    return fabrics.filter(function(f) {
      if (f.default_vendor_id === vendorId) return true;
      if (f.vendors && Array.isArray(f.vendors)) return f.vendors.some(function(v) { return v.vendor_id === vendorId; });
      return false;
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('Vendor name is required'); return; }
    try {
      // Normalise GST fields (coerce types, clear GSTIN if toggled off)
      var payload = Object.assign({}, form, {
        has_gst: !!form.has_gst,
        gst_percent: form.has_gst ? (n(form.gst_percent) || 0) : 0,
        gstin: form.has_gst ? (form.gstin || '') : ''
      });
      if (editingId) {
        var { error } = await supa.from('fabric_vendors').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        var newVendor = { id: nextFVId(), ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        var { error } = await supa.from('fabric_vendors').insert([newVendor]);
        if (error) throw error;
      }
      setForm(emptyForm);
      setShowForm(false);
      setEditingId(null);
      await fetchVendors();
    } catch (e) { console.error('Save error:', e); alert('Failed to save vendor.'); }
  };

  const handleDelete = async (id) => {
    // Check what depends on this vendor before deleting
    var vendorName = vendors.find(function(v) { return v.id === id; });
    var vName = vendorName ? vendorName.name : id;
    var depPOs = [], depPayments = [];
    try {
      var poRes = await supa.from('fabric_purchase_orders').select('id').eq('vendor_id', id);
      depPOs = poRes.data || [];
      var payRes = await supa.from('vendor_payments').select('id').eq('vendor_id', id);
      depPayments = payRes.data || [];
    } catch(e) {}
    var msg = 'Delete vendor "' + vName + '"?';
    if (depPOs.length > 0 || depPayments.length > 0) {
      msg += '\n\nThis will also delete:\n';
      if (depPOs.length > 0) msg += '• ' + depPOs.length + ' purchase order(s) and their line items\n';
      if (depPayments.length > 0) msg += '• ' + depPayments.length + ' payment record(s)\n';
      msg += '\nThis action cannot be undone.';
    }
    if (!confirm(msg)) return;
    try {
      // Cascade: payment_allocations → vendor_payments, fabric_inventory → fabric_po_line_items → fabric_purchase_orders → fabric_vendors
      var poIds = depPOs.map(function(p) { return p.id; });
      var payIds = depPayments.map(function(p) { return p.id; });
      if (payIds.length > 0) { var r1 = await supa.from('payment_allocations').delete().in('payment_id', payIds); if (r1.error) throw r1.error; }
      if (poIds.length > 0) { var r2 = await supa.from('payment_allocations').delete().in('po_id', poIds); if (r2.error) throw r2.error; }
      if (poIds.length > 0) { var r3 = await supa.from('fabric_inventory').delete().in('reference_id', poIds); if (r3.error) throw r3.error; }
      if (poIds.length > 0) { var r4 = await supa.from('fabric_po_line_items').delete().in('po_id', poIds); if (r4.error) throw r4.error; }
      if (depPayments.length > 0) { var r5 = await supa.from('vendor_payments').delete().eq('vendor_id', id); if (r5.error) throw r5.error; }
      if (depPOs.length > 0) { var r6 = await supa.from('fabric_purchase_orders').delete().eq('vendor_id', id); if (r6.error) throw r6.error; }
      // Also clear default_vendor_id on fabrics referencing this vendor
      var r7 = await supa.from('fabrics').update({ default_vendor_id: '' }).eq('default_vendor_id', id); if (r7.error) throw r7.error;
      var { error } = await supa.from('fabric_vendors').delete().eq('id', id);
      if (error) throw error;
      if (expandedVendor === id) setExpandedVendor(null);
      await fetchVendors();
    } catch (e) { console.error('Delete error:', e); alert('Failed to delete vendor: ' + (e.message || e)); }
  };

  const handleEdit = (v) => {
    setForm({
      name: v.name || '', logo_url: v.logo_url || '', spoc_name: v.spoc_name || '',
      spoc_phone: v.spoc_phone || '', spoc_email: v.spoc_email || '',
      has_gst: v.has_gst !== false, // default true if undefined
      gst_percent: v.gst_percent != null ? Number(v.gst_percent) : 5,
      gstin: v.gstin || '', pan: v.pan || '', bank_name: v.bank_name || '',
      bank_account: v.bank_account || '', bank_ifsc: v.bank_ifsc || '',
      shipping_address: v.shipping_address || '', billing_address: v.billing_address || '',
      notes: v.notes || ''
    });
    setEditingId(v.id);
    setShowForm(true);
  };

  var filtered = vendors.filter(function(v) {
    if (!search) return true;
    var q = search.toLowerCase();
    return (v.name||'').toLowerCase().includes(q) || (v.spoc_name||'').toLowerCase().includes(q) ||
           (v.spoc_email||'').toLowerCase().includes(q) || (v.id||'').toLowerCase().includes(q);
  });

  if (loading) return <div className="text-center py-12 text-gray-400">Loading vendors...</div>;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div style={{fontFamily:'Manrope,sans-serif',fontWeight:800,fontSize:'1.25rem',letterSpacing:'-0.02em',color:'#1b1c1a'}}>{filtered.length} Vendors</div>
        </div>
        <button onClick={function() { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
          className="flex items-center gap-2 text-sm font-semibold text-white px-5 py-2.5 rounded-full shadow-sm active:scale-95 transition-transform"
          style={{background:'linear-gradient(135deg,#795900,#d4a843)'}}>
          <Icon name="plus" cls="w-4 h-4" /> Add Vendor
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Icon name="search" cls="w-5 h-5 absolute left-4 top-3.5 text-gray-400" />
        <input value={search} onChange={function(e) { setSearch(e.target.value); }}
          placeholder="Search by vendor name, SPOC, or fabric type..."
          className="w-full rounded-xl pl-12 pr-10 py-3.5 text-sm border-none"
          style={{background:'#fff',boxShadow:'0 4px 16px rgba(27,28,26,0.04)',outline:'none'}} />
        {search && <button onClick={function() { setSearch(''); }} className="absolute right-4 top-3.5 text-gray-400 hover:text-red-500 transition-colors text-xs font-bold">✕</button>}
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-6 rounded-r-xl overflow-hidden" style={{background:'#fefce8',borderLeft:'4px solid #d4a843'}}>
          <div className="px-6 sm:px-8 pt-6 pb-2 flex justify-between items-start">
            <div>
              <div style={{fontFamily:'Manrope,sans-serif',fontSize:10,fontWeight:800,letterSpacing:'0.2em',textTransform:'uppercase',color:'#795900',marginBottom:6}}>MASTER REGISTRY</div>
              <h2 style={{fontFamily:'Manrope,sans-serif',fontSize:'1.5rem',fontWeight:300,letterSpacing:'-0.02em',color:'#1b1c1a'}}>{editingId ? 'Edit Vendor' : 'Onboard Fabric Supplier'}</h2>
            </div>
            <button onClick={function() { setShowForm(false); setEditingId(null); }} className="p-2 rounded-full hover:bg-gray-100 transition-colors" style={{color:'#807664'}}>✕</button>
          </div>
          <div className="px-6 sm:px-8 pb-8 space-y-8">
            {/* Identity row */}
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="flex flex-col gap-2">
                <VLabel>Brand Identity</VLabel>
                {form.logo_url
                  ? <div className="relative"><img src={form.logo_url} className="w-20 h-20 rounded-xl object-cover" style={{border:'2px solid #d4a843'}} alt="" /><button onClick={function(){setForm({...form,logo_url:''});}} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">✕</button></div>
                  : <label className="w-20 h-20 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors hover:bg-white" style={{border:'2px dashed rgba(210,197,177,0.5)',background:'rgba(255,255,255,0.5)'}}>
                      <span style={{fontSize:20,color:'#d2c5b1'}}>📷</span>
                      <span style={{fontSize:9,fontWeight:600,textTransform:'uppercase',color:'#807664',marginTop:2}}>80×80</span>
                      <input type="file" accept="image/*" className="hidden" onChange={async function(e) { var file = e.target.files[0]; if (!file) return; try { var url = await uploadImage(file, 'vendor-logos'); setForm({...form, logo_url: url}); } catch(err) { alert('Upload failed'); } }} />
                    </label>}
              </div>
              <div className="flex-1 w-full">
                <VLabel req>Vendor Name</VLabel>
                <VInput type="text" value={form.name} onChange={function(e) { setForm({...form, name: e.target.value}); }} placeholder="e.g. Heritage Silks & Textiles" style={{fontFamily:'Manrope,sans-serif',fontSize:18}} />
              </div>
            </div>
            {/* GST Registration toggle */}
            <div className="pt-2">
              <div className="flex items-center gap-4 mb-4">
                <span style={{fontSize:16}}>🧾</span>
                <span style={{fontFamily:'Manrope,sans-serif',fontSize:13,fontWeight:800,letterSpacing:'0.2em',textTransform:'uppercase',color:'#795900',whiteSpace:'nowrap'}}>TAX REGISTRATION</span>
                <div style={{height:1,flex:1,background:'rgba(210,197,177,0.3)'}}></div>
              </div>
              <div className="flex flex-wrap items-center gap-6 mb-2">
                <label className="flex items-center gap-2 cursor-pointer" style={{userSelect:'none'}}>
                  <input
                    type="checkbox"
                    checked={!!form.has_gst}
                    onChange={function(e) { setForm({...form, has_gst: e.target.checked}); }}
                    style={{width:18,height:18,accentColor:'#795900',cursor:'pointer'}}
                  />
                  <span style={{fontFamily:'Manrope,sans-serif',fontSize:13,fontWeight:600,color:'#1b1c1a'}}>Vendor charges GST</span>
                </label>
                {form.has_gst && (
                  <div className="flex items-center gap-2">
                    <VLabel>GST %</VLabel>
                    <div style={{width:80}}>
                      <VInput
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.gst_percent}
                        onChange={function(e) { setForm({...form, gst_percent: e.target.value}); }}
                        placeholder="5"
                        mono={true}
                      />
                    </div>
                  </div>
                )}
              </div>
              {!form.has_gst && (
                <div style={{fontSize:12,color:'#807664',fontStyle:'italic',marginTop:4}}>No GST will be added to this vendor's purchase orders or invoices.</div>
              )}
            </div>
            {/* GSTIN & PAN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
              {form.has_gst && (
                <div><VLabel>GSTIN</VLabel><VInput type="text" value={form.gstin} onChange={function(e) { setForm({...form, gstin: e.target.value}); }} placeholder="22AAAAA0000A1Z5" mono={true} /></div>
              )}
              <div className={form.has_gst ? '' : 'sm:col-span-2'}><VLabel>PAN</VLabel><VInput type="text" value={form.pan} onChange={function(e) { setForm({...form, pan: e.target.value}); }} placeholder="ABCDE1234F" mono={true} /></div>
            </div>
            {/* SPOC */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
              <div className="sm:col-span-2"><VLabel>SPOC Name</VLabel><VInput type="text" value={form.spoc_name} onChange={function(e) { setForm({...form, spoc_name: e.target.value}); }} placeholder="Mr. Rajesh Khanna" /></div>
              <div><VLabel>Phone</VLabel><VInput type="tel" value={form.spoc_phone} onChange={function(e) { setForm({...form, spoc_phone: e.target.value}); }} placeholder="+91 98765 43210" /></div>
              <div><VLabel>Email</VLabel><VInput type="email" value={form.spoc_email} onChange={function(e) { setForm({...form, spoc_email: e.target.value}); }} placeholder="contact@supplier.com" /></div>
            </div>
            {/* Bank Details section */}
            <div className="pt-2">
              <div className="flex items-center gap-4 mb-6">
                <span style={{fontSize:16}}>🏛</span>
                <span style={{fontFamily:'Manrope,sans-serif',fontSize:13,fontWeight:800,letterSpacing:'0.2em',textTransform:'uppercase',color:'#795900',whiteSpace:'nowrap'}}>BANK DETAILS</span>
                <div style={{height:1,flex:1,background:'rgba(210,197,177,0.3)'}}></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-6">
                <div><VLabel>Bank Name</VLabel><VInput type="text" value={form.bank_name} onChange={function(e) { setForm({...form, bank_name: e.target.value}); }} placeholder="HDFC Bank" /></div>
                <div><VLabel>Account Number</VLabel><VInput type="text" value={form.bank_account} onChange={function(e) { setForm({...form, bank_account: e.target.value}); }} placeholder="50200081234567" mono={true} /></div>
                <div><VLabel>IFSC Code</VLabel><VInput type="text" value={form.bank_ifsc} onChange={function(e) { setForm({...form, bank_ifsc: e.target.value}); }} placeholder="HDFC0001234" mono={true} /></div>
              </div>
            </div>
            {/* Addresses */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
              <div><VLabel>Shipping Address</VLabel><VTextarea value={form.shipping_address} onChange={function(e) { setForm({...form, shipping_address: e.target.value}); }} placeholder="Warehouse address for freight pickup..." /></div>
              <div><VLabel>Billing Address</VLabel><VTextarea value={form.billing_address} onChange={function(e) { setForm({...form, billing_address: e.target.value}); }} placeholder="Registered GST billing address..." /></div>
            </div>
            {/* Notes */}
            <div><VLabel>Internal Atelier Notes</VLabel><VTextarea value={form.notes} onChange={function(e) { setForm({...form, notes: e.target.value}); }} placeholder="Preferred fabrics, credit terms, lead times..." /></div>
            {/* Actions */}
            <div className="flex items-center justify-end gap-4 pt-4" style={{borderTop:'1px solid rgba(210,197,177,0.3)'}}>
              <div className="flex-1 text-xs" style={{color:'#807664'}}>ⓘ Changes will be logged in the editorial audit trail</div>
              <button onClick={function() { setShowForm(false); setEditingId(null); }} className="px-5 py-2.5 text-sm font-medium" style={{color:'#807664'}}>Cancel</button>
              <button onClick={handleSave} className="text-sm font-bold text-white px-6 py-2.5 rounded-full shadow-sm active:scale-95 transition-transform" style={{background:'#795900'}}>Save Vendor</button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor cards — responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(function(v) {
          var due = amountDue[v.id] || 0;
          var vFabrics = getFabricsForVendor(v.id);
          return (
            <div key={v.id} className="flex flex-col h-full rounded-xl overflow-hidden transition-all hover:shadow-md" style={{background:'#fff',boxShadow:'0 4px 24px rgba(27,28,26,0.04)',border:'1px solid rgba(210,197,177,0.1)'}}>
              {/* Card header */}
              <div className="flex justify-between items-start p-5 pb-3">
                <div className="flex gap-3">
                  {v.logo_url
                    ? <img src={v.logo_url} className="w-11 h-11 rounded-full object-cover flex-shrink-0" style={{border:'2px solid #d4a843'}} onError={function(e){e.target.style.display='none'}} alt="" />
                    : <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{background:'linear-gradient(135deg,#795900,#d4a843)',color:'#fff',fontWeight:700,fontSize:16,fontFamily:'Manrope,sans-serif'}}>{(v.name||'?').substring(0,2).toUpperCase()}</div>}
                  <div className="min-w-0">
                    <div style={{fontFamily:'Manrope,sans-serif',fontWeight:700,fontSize:'1rem',color:'#1b1c1a',lineHeight:1.2}} className="truncate">{v.name}</div>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.15em',color:'#807664',textTransform:'uppercase',marginTop:3}}>{v.id}</div>
                  </div>
                </div>
                {due > 0 && <div className="flex-shrink-0 px-2.5 py-1 rounded-lg text-right" style={{background:'rgba(186,26,26,0.06)',border:'1px solid rgba(186,26,26,0.1)'}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#ba1a1a',letterSpacing:'-0.02em'}}>{fmt(due)}</div>
                  <div style={{fontSize:9,fontWeight:700,color:'#ba1a1a',textTransform:'uppercase',letterSpacing:'0.05em'}}>DUE</div>
                </div>}
              </div>
              {/* Contact info */}
              <div className="px-5 pb-4 space-y-3">
                {v.spoc_name && <div className="flex items-center gap-3 text-sm"><span style={{color:'#795900',fontSize:14}}>👤</span><div><div style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'#807664'}}>SPOC</div><div style={{fontWeight:500,color:'#1b1c1a'}}>{v.spoc_name}</div></div></div>}
                {v.spoc_phone && <div className="flex items-center gap-3 text-sm"><span style={{color:'#795900',fontSize:14}}>📞</span><div><div style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'#807664'}}>Contact</div><div style={{fontWeight:500,color:'#1b1c1a'}}>{v.spoc_phone}</div></div></div>}
                {v.spoc_email && <div className="flex items-center gap-3 text-sm"><span style={{color:'#795900',fontSize:14}}>✉️</span><div><div style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'#807664'}}>Email</div><div style={{fontWeight:500,color:'#1b1c1a'}}>{v.spoc_email}</div></div></div>}
                {v.has_gst !== false && v.gstin && <div className="flex items-center gap-3 text-sm"><span style={{color:'#795900',fontSize:14}}>📋</span><div><div style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'#807664'}}>GSTIN · {Number(v.gst_percent||0)}%</div><div style={{fontWeight:500,color:'#1b1c1a',fontFamily:'monospace',fontSize:12,letterSpacing:'0.05em',background:'#efeeea',padding:'2px 6px',borderRadius:4,display:'inline-block'}}>{v.gstin}</div></div></div>}
                {v.has_gst === false && <div className="flex items-center gap-3 text-sm"><span style={{color:'#807664',fontSize:14}}>🚫</span><div><div style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'#807664'}}>Tax</div><div style={{fontWeight:500,color:'#807664',fontSize:12}}>No GST</div></div></div>}
              </div>
              {/* Amount due banner */}
              {due > 0 && <div className="mx-5 mb-3 px-3 py-2.5 rounded-lg flex justify-between items-center" style={{background:'#fff0f0',border:'1px solid #fecdd3'}}>
                <div className="flex items-center gap-2"><span style={{fontSize:14}}>💰</span><span className="text-sm" style={{color:'#ba1a1a'}}>Amount Due: <strong>{fmt(due)}</strong></span></div>
              </div>}
              {/* Fabrics supplied */}
              <div className="flex-1"></div>
              {vFabrics.length > 0 && (
                <div style={{borderTop:'1px solid rgba(210,197,177,0.15)'}}>
                  <button onClick={function(e) { e.stopPropagation(); setExpandedVendor(expandedVendor === v.id ? null : v.id); }}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                    <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase',color:'#795900'}}>{vFabrics.length} fabric{vFabrics.length > 1 ? 's' : ''} supplied</span>
                    <span style={{fontSize:12,color:'#d2c5b1'}}>{expandedVendor === v.id ? '▲' : '▼'}</span>
                  </button>
                  {expandedVendor === v.id && (
                    <div className="px-5 pb-4 space-y-2">
                      {vFabrics.map(function(f) {
                        var vfEntry = (f.vendors || []).find(function(ve) { return ve.vendor_id === v.id; });
                        var vfId = vfEntry ? vfEntry.vendor_fabric_id || '' : '';
                        return (
                          <div key={f.id} className="flex items-center gap-3 py-2">
                            {f.image_urls && f.image_urls[0]
                              ? <img src={f.image_urls[0]} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" alt="" />
                              : <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:'#fefce8',color:'#d4a843',fontSize:12}}>🧵</div>}
                            <div className="flex-1 min-w-0">
                              <div style={{fontSize:12,fontWeight:600,color:'#4e4636'}} className="truncate">{f.name}</div>
                              <div style={{fontSize:10,color:'#807664'}}>{f.id}{vfId ? ' · ' + vfId : ''} · ₹{n(f.default_cost_per_metre)}{f.cost_type === 'total' ? ' total' : '/m'}</div>
                            </div>
                            <span className="flex-shrink-0" style={{width:8,height:8,borderRadius:'50%',background:f.is_active !== false ? '#16a34a' : '#d1d5db',boxShadow:f.is_active !== false ? '0 0 8px rgba(22,163,106,0.4)' : 'none'}}></span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* Actions */}
              <div className="flex gap-2 px-5 py-3" style={{borderTop:'1px solid rgba(210,197,177,0.15)'}}>
                <button onClick={function(){handleEdit(v);}} className="flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors hover:bg-gray-100" style={{background:'#f5f4f0',color:'#4e4636'}}>
                  <Icon name="edit" cls="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={function(){handleDelete(v.id);}} className="flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors hover:bg-red-100" style={{background:'#fef2f2',color:'#ba1a1a'}}>
                  <Icon name="trash" cls="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          );
        })}
        {/* Onboard New Vendor CTA card */}
        {!showForm && <div onClick={function() { setShowForm(true); setEditingId(null); setForm(emptyForm); }}
          className="flex flex-col items-center justify-center rounded-xl cursor-pointer transition-all hover:shadow-md hover:border-amber-300 min-h-[200px]"
          style={{border:'2px dashed rgba(210,197,177,0.4)',background:'rgba(250,249,245,0.5)'}}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{background:'#efeeea'}}>
            <span style={{fontSize:24,color:'#807664'}}>👤</span>
          </div>
          <div style={{fontFamily:'Manrope,sans-serif',fontWeight:600,fontSize:'0.95rem',color:'#1b1c1a',marginBottom:4}}>Onboard New Vendor</div>
          <div style={{fontSize:12,color:'#807664',textAlign:'center',maxWidth:200,lineHeight:1.4}}>Quickly add supplier details, contact info, and fabric catalog.</div>
          <button className="mt-4 px-5 py-2 rounded-full text-xs font-semibold transition-colors" style={{border:'1px solid #d2c5b1',color:'#795900',background:'transparent'}}>Start Registration</button>
        </div>}
      </div>
      {filtered.length === 0 && <div className="text-center py-12 text-sm" style={{color:'#807664'}}>No vendors found</div>}
    </div>
  );
};

export default FabricVendorsTab

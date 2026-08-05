import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load, uploadImage } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n } from '../../lib/helpers'
import { createdByFields, updatedByFields } from '../../lib/auditHelpers'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import AuditStamp from '../../components/AuditStamp'

const PurchaseOrdersTab = ({ activeSubTab } = {}) => {
  const [pos, setPos] = useState([]);
  const [lineItems, setLineItems] = useState({});
  const [vendors, setVendors] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [showPayment, setShowPayment] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_mode: 'bank_transfer', reference_number: '', notes: '' });
  const [vendorSubTab, setVendorSubTab] = useState('pos');
  const [poPage, setPoPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const [payStatusFilter, setPayStatusFilter] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(null);
  const [uploadingInvoice, setUploadingInvoice] = useState(null);
  const [qcConfirmPO, setQcConfirmPO] = useState(null);
  const invoiceFileRef = useRef(null);
  const [shopifyOrders, setShopifyOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [showOrderDropdown, setShowOrderDropdown] = useState(false);

  const blankForm = {
    vendor_id: '', vendor_name: '', order_date: new Date().toISOString().split('T')[0],
    expected_delivery: '', status: 'draft', payment_status: 'unpaid', items: [],
    subtotal: 0, gst_percent: 5, gst_amount: 0, courier_charges: 0, misc_charges: 0, adjustment: 0,
    grand_total: 0, amount_paid: 0, balance_due: 0, bill_number: '', bill_url: '', invoice_url: '',
    payment_notes: '', notes: '',
    is_order_level: false, order_id: '', order_number: '', order_customer: '', order_product_sku: '', order_product_title: ''
  };
  const [form, setForm] = useState(blankForm);

  const orderStatuses = ['draft', 'ordered', 'in_transit', 'received', 'qc_approved', 'closed', 'cancelled'];
  const paymentStatuses = ['unpaid', 'partial', 'paid'];
  const orderStatusColors = {
    draft: { bg: 'rgba(128,118,100,0.1)', text: '#807664', label: 'Draft' },
    ordered: { bg: 'rgba(59,130,246,0.1)', text: '#2563eb', label: 'Ordered' },
    in_transit: { bg: 'rgba(139,92,246,0.1)', text: '#7c3aed', label: 'In Transit' },
    received: { bg: 'rgba(245,158,11,0.1)', text: '#d97706', label: 'Received' },
    qc_approved: { bg: 'rgba(20,184,166,0.1)', text: '#0d9488', label: 'QC Approved' },
    closed: { bg: 'rgba(128,118,100,0.08)', text: '#a09a8e', label: 'Closed' },
    cancelled: { bg: 'rgba(186,26,26,0.1)', text: '#ba1a1a', label: 'Cancelled' }
  };
  const payStatusColors = {
    unpaid: { bg: 'rgba(186,26,26,0.1)', text: '#ba1a1a', label: 'Unpaid' },
    partial: { bg: 'rgba(245,158,11,0.1)', text: '#d97706', label: 'Partial' },
    paid: { bg: 'rgba(22,163,74,0.1)', text: '#16a34a', label: 'Paid' }
  };

  useEffect(function() { fetchData(); }, []);

  // Refetch whenever the PO tab becomes active (so any vendor edits made in
  // the Vendors subtab — e.g. toggling GST — are picked up on return).
  useEffect(function() {
    if (activeSubTab === 'po') { fetchData(); }
  }, [activeSubTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      var results = await Promise.all([
        supa.from('fabric_purchase_orders').select('*').order('order_date', { ascending: false }),
        supa.from('fabric_po_line_items').select('*'),
        supa.from('fabric_vendors').select('*').order('name'),
        supa.from('fabrics').select('*').order('name'),
        supa.from('vendor_payments').select('*').order('payment_date', { ascending: false }),
        supa.from('shopify_orders').select('id, order_number, customer_name, line_items, created_at').order('created_at', { ascending: false }).limit(500)
      ]);
      if (results[0].data) setPos(results[0].data);
      if (results[1].data) {
        var map = {};
        results[1].data.forEach(function(li) { if (!map[li.po_id]) map[li.po_id] = []; map[li.po_id].push(li); });
        setLineItems(map);
      }
      if (results[2].data) setVendors(results[2].data);
      if (results[3].data) setFabrics(results[3].data);
      if (results[4].data) setPayments(results[4].data);
      if (results[5].data) setShopifyOrders(results[5].data);
    } catch (e) { console.error('Fetch error:', e); }
    finally { setLoading(false); }
  };

  const nextPOId = () => {
    var nums = pos.map(function(p) { var m = (p.id||'').match(/-(\d+)$/); return m ? +m[1] : 0; });
    var next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
    return 'PO-' + String(next).padStart(3,'0');
  };

  const nextPayId = () => {
    var nums = payments.map(function(p) { var m = (p.id||'').match(/-(\d+)$/); return m ? +m[1] : 0; });
    var next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
    return 'PAY-' + String(next).padStart(3,'0');
  };

  const recalculateTotals = (items, courier, misc, adj, vendorId) => {
    var subtotal = items.reduce(function(sum, li) { return sum + n(li.line_total); }, 0);
    // Pull GST rate from vendor master. If vendor has has_gst=false, no GST is applied.
    var vId = vendorId != null ? vendorId : form.vendor_id;
    var vendor = vendors.find(function(v) { return v.id === vId; });
    // Treat has_gst as false if it's explicitly false/'false'/0 — otherwise apply vendor's GST %.
    var hasGst = vendor ? (vendor.has_gst !== false && vendor.has_gst !== 'false' && vendor.has_gst !== 0) : false;
    var gst_pct = hasGst ? n(vendor.gst_percent) : 0;
    var gst_amt = subtotal * gst_pct / 100;
    var courierVal = n(courier) || 0;
    var miscVal = n(misc) || 0;
    var adjVal = n(adj) || 0;
    var total = subtotal + gst_amt + courierVal + miscVal + adjVal;
    var balance = total - (n(form.amount_paid) || 0);
    return { subtotal: subtotal, gst_pct: gst_pct, gst_amt: gst_amt, courier: courierVal, misc: miscVal, adj: adjVal, total: total, balance: balance };
  };

  // ─── Vendor-filtered fabrics + materials ─────────────────────────────────────
  var vendorFabrics = useMemo(function() {
    if (!form.vendor_id) return [];
    return fabrics.filter(function(f) {
      if (f.default_vendor_id === form.vendor_id) return true;
      if (f.vendors && Array.isArray(f.vendors)) {
        return f.vendors.some(function(v) { return v.vendor_id === form.vendor_id; });
      }
      return false;
    });
  }, [form.vendor_id, fabrics]);

  // Helper: determine unit label for a given item from fabrics table
  var getItemUnit = function(fabricId) {
    var item = fabrics.find(function(f) { return f.id === fabricId; });
    if (!item) return { unit: 'metre', qtyLabel: 'Metres', rateLabel: 'Rate/m (₹)', suffix: 'm', isMaterial: false };
    var isMat = item.category === 'material';
    return {
      unit: item.unit || (isMat ? 'piece' : 'metre'),
      qtyLabel: isMat ? 'Qty (pcs)' : 'Metres',
      rateLabel: isMat ? 'Rate/pc (₹)' : 'Rate/m (₹)',
      suffix: isMat ? ' pcs' : ' m',
      isMaterial: isMat
    };
  };

  var getVendorPOs = function(vendorId) { return pos.filter(function(p) { return p.vendor_id === vendorId; }); };
  var getVendorOutstanding = function(vendorId) {
    return getVendorPOs(vendorId).filter(function(p) { return p.payment_status !== 'paid'; })
      .reduce(function(s, p) { return s + n(p.balance_due); }, 0);
  };
  var getVendorPaid = function(vendorId) {
    return getVendorPOs(vendorId).reduce(function(s, p) { return s + n(p.amount_paid); }, 0);
  };
  var getVendorPayments = function(vendorId) { return payments.filter(function(p) { return p.vendor_id === vendorId; }); };

  var activeVendors = vendors.filter(function(v) { return getVendorPOs(v.id).length > 0; });
  if (vendorFilter) activeVendors = activeVendors.filter(function(v) { return v.id === vendorFilter; });

  // ─── Save PO ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.vendor_id) { alert('Select a vendor'); return; }
    if (form.items.length === 0) { alert('Add at least one line item'); return; }
    var totals = recalculateTotals(form.items, form.courier_charges, form.misc_charges, form.adjustment);
    try {
      var poPayload = {
        vendor_id: form.vendor_id, vendor_name: form.vendor_name, order_date: form.order_date,
        expected_delivery: form.expected_delivery || null, status: form.status,
        payment_status: editingId ? form.payment_status : 'unpaid',
        subtotal: totals.subtotal, gst_percent: totals.gst_pct, gst_amount: totals.gst_amt,
        shipping_cost: totals.courier || 0, misc_charges: totals.misc || 0, adjustment: totals.adj || 0,
        grand_total: totals.total,
        amount_paid: editingId ? n(form.amount_paid) : 0,
        balance_due: editingId ? (totals.total - n(form.amount_paid)) : totals.total,
        bill_number: form.bill_number || '', bill_url: form.bill_url || '',
        invoice_url: form.invoice_url || '',
        payment_notes: form.payment_notes || '', notes: form.notes || '',
        is_order_level: !!form.is_order_level,
        order_id: form.is_order_level ? (form.order_id || null) : null,
        order_number: form.is_order_level ? (form.order_number || '') : '',
        order_customer: form.is_order_level ? (form.order_customer || '') : '',
        order_product_sku: form.is_order_level ? (form.order_product_sku || '') : '',
        order_product_title: form.is_order_level ? (form.order_product_title || '') : '',
        updated_at: new Date().toISOString()
      };
      if (editingId) {
        var { error } = await supa.from('fabric_purchase_orders').update({ ...poPayload, ...updatedByFields() }).eq('id', editingId);
        if (error) throw error;
        await supa.from('fabric_po_line_items').delete().eq('po_id', editingId);
        for (var liIdx = 0; liIdx < form.items.length; liIdx++) {
          var li = form.items[liIdx];
          await supa.from('fabric_po_line_items').insert([{
            id: editingId + '-' + String(liIdx+1).padStart(2,'0'), po_id: editingId,
            fabric_id: li.fabric_id, fabric_name: li.fabric_name, colour: li.colour || '',
            quantity_metres: n(li.quantity_metres), rate_per_metre: n(li.rate_per_metre),
            line_total: n(li.line_total), vendor_fabric_id: li.vendor_fabric_id || '', notes: li.notes || '',
            created_at: new Date().toISOString()
          }]);
        }
      } else {
        var newPOId = nextPOId();
        var { error } = await supa.from('fabric_purchase_orders').insert([{ id: newPOId, ...poPayload, created_at: new Date().toISOString(), ...createdByFields() }]);
        if (error) throw error;
        for (var liIdx2 = 0; liIdx2 < form.items.length; liIdx2++) {
          var li2 = form.items[liIdx2];
          await supa.from('fabric_po_line_items').insert([{
            id: newPOId + '-' + String(liIdx2+1).padStart(2,'0'), po_id: newPOId,
            fabric_id: li2.fabric_id, fabric_name: li2.fabric_name, colour: li2.colour || '',
            quantity_metres: n(li2.quantity_metres), rate_per_metre: n(li2.rate_per_metre),
            line_total: n(li2.line_total), vendor_fabric_id: li2.vendor_fabric_id || '', notes: li2.notes || '',
            created_at: new Date().toISOString()
          }]);
        }
      }
      setForm(blankForm);
      setShowForm(false); setEditingId(null);
      await fetchData();
    } catch (e) { console.error('Save PO error:', e); alert('Failed to save PO.'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete PO ' + id + '? This will also remove associated line items, inventory entries, and payment allocations.')) return;
    try {
      var r1 = await supa.from('payment_allocations').delete().eq('po_id', id);
      if (r1.error) throw r1.error;
      var r2 = await supa.from('fabric_inventory').delete().eq('reference_id', id);
      if (r2.error) throw r2.error;
      var r3 = await supa.from('fabric_po_line_items').delete().eq('po_id', id);
      if (r3.error) throw r3.error;
      var { error } = await supa.from('fabric_purchase_orders').delete().eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (e) { console.error('Delete PO error:', e); alert('Failed to delete PO: ' + (e.message || e)); }
  };

  const handleEdit = (po) => {
    var items = lineItems[po.id] || [];
    setForm({ vendor_id: po.vendor_id, vendor_name: po.vendor_name, order_date: po.order_date,
      expected_delivery: po.expected_delivery || '', status: po.status, payment_status: po.payment_status || 'unpaid', items: items,
      subtotal: po.subtotal, gst_percent: po.gst_percent, gst_amount: po.gst_amount,
      courier_charges: po.shipping_cost || 0, misc_charges: po.misc_charges || 0, adjustment: po.adjustment || 0,
      grand_total: po.grand_total, amount_paid: po.amount_paid,
      balance_due: po.balance_due, bill_number: po.bill_number || '', bill_url: po.bill_url || '',
      invoice_url: po.invoice_url || '',
      payment_notes: po.payment_notes || '', notes: po.notes || '',
      is_order_level: !!po.is_order_level, order_id: po.order_id || '', order_number: po.order_number || '',
      order_customer: po.order_customer || '', order_product_sku: po.order_product_sku || '', order_product_title: po.order_product_title || '' });
    setEditingId(po.id); setShowForm(true);
  };

  const handleStatusChange = async (po, newStatus) => {
    // If moving to qc_approved, show confirmation dialog first
    if (newStatus === 'qc_approved') {
      setQcConfirmPO(po);
      return;
    }
    try {
      var update = { status: newStatus, ...updatedByFields() };
      var { error } = await supa.from('fabric_purchase_orders').update(update).eq('id', po.id);
      if (error) throw error;
      await fetchData();
    } catch (e) { console.error('Status update error:', e); alert('Failed to update status.'); }
  };

  // QC approval confirmed — update status and add to inventory
  const handleQcApprove = async () => {
    var po = qcConfirmPO;
    if (!po) return;
    try {
      var { error } = await supa.from('fabric_purchase_orders').update({ status: 'qc_approved', ...updatedByFields() }).eq('id', po.id);
      if (error) throw error;
      // Add to inventory
      var rcvItems = lineItems[po.id] || [];
      for (var ri = 0; ri < rcvItems.length; ri++) {
        var rcvLi = rcvItems[ri];
        await supa.from('fabric_inventory').insert([{
          fabric_id: rcvLi.fabric_id, fabric_name: rcvLi.fabric_name, entry_type: 'po_received',
          quantity_metres: n(rcvLi.quantity_metres), reference_id: po.id,
          reference_note: 'QC Approved - PO ' + po.id, created_by: 'system', created_at: new Date().toISOString()
        }]);
      }
      setQcConfirmPO(null);
      await fetchData();
    } catch (e) { console.error('QC approval error:', e); alert('Failed to approve QC.'); }
  };

  // ─── Record / Update Payment (FIFO) ────────────────────────────────────────
  const handleRecordPayment = async () => {
    var vendor = showPayment;
    var amount = n(payForm.amount);
    if (amount <= 0) { alert('Enter a valid amount'); return; }

    // If editing an existing payment, we need to first reverse the old allocations
    if (editingPayment) {
      try {
        // Reverse old allocations
        var oldPay = editingPayment;
        if (oldPay.settled_pos && oldPay.settled_pos.length > 0) {
          for (var ri = 0; ri < oldPay.settled_pos.length; ri++) {
            var rev = oldPay.settled_pos[ri];
            var revPO = pos.find(function(p) { return p.id === rev.po_id; });
            if (revPO) {
              var revPaid = Math.max(0, n(revPO.amount_paid) - n(rev.amount_settled));
              var revBal = n(revPO.grand_total) - revPaid;
              var revPayStatus = revPaid <= 0 ? 'unpaid' : (revBal <= 0 ? 'paid' : 'partial');
              await supa.from('fabric_purchase_orders').update({ amount_paid: revPaid, balance_due: revBal, payment_status: revPayStatus, updated_at: new Date().toISOString() }).eq('id', rev.po_id);
            }
          }
        }
        await supa.from('payment_allocations').delete().eq('payment_id', oldPay.id);
        // Now re-fetch POs to get updated balances before re-allocating
        var { data: freshPOs } = await supa.from('fabric_purchase_orders').select('*');
        if (freshPOs) {
          // Re-allocate with new amount using FIFO
          var unpaidPOs = freshPOs.filter(function(p) { return p.vendor_id === vendor.id && p.payment_status !== 'paid' && n(p.balance_due) > 0; })
            .sort(function(a, b) { return (a.order_date || '').localeCompare(b.order_date || ''); });
          var remaining = amount;
          var allocations = [];
          var updatedPOs = [];
          for (var pi = 0; pi < unpaidPOs.length; pi++) {
            if (remaining <= 0) break;
            var po = unpaidPOs[pi];
            var settleAmt = Math.min(remaining, n(po.balance_due));
            allocations.push({ po_id: po.id, amount_settled: settleAmt });
            updatedPOs.push({ id: po.id, newPaid: n(po.amount_paid) + settleAmt, newBalance: n(po.balance_due) - settleAmt });
            remaining -= settleAmt;
          }
          // Update payment record
          await supa.from('vendor_payments').update({
            amount: amount, payment_date: payForm.payment_date, payment_mode: payForm.payment_mode,
            reference_number: payForm.reference_number || '', notes: payForm.notes || '',
            settled_pos: allocations
          }).eq('id', oldPay.id);
          // Re-insert allocations
          for (var ai = 0; ai < allocations.length; ai++) {
            await supa.from('payment_allocations').insert([{
              payment_id: oldPay.id, po_id: allocations[ai].po_id, amount_settled: allocations[ai].amount_settled
            }]);
          }
          // Update PO balances
          for (var ui = 0; ui < updatedPOs.length; ui++) {
            var u = updatedPOs[ui];
            var newPayStatus = u.newBalance <= 0 ? 'paid' : 'partial';
            await supa.from('fabric_purchase_orders').update({ amount_paid: u.newPaid, balance_due: u.newBalance, payment_status: newPayStatus, updated_at: new Date().toISOString() }).eq('id', u.id);
          }
        }
        setShowPayment(null); setEditingPayment(null);
        setPayForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_mode: 'bank_transfer', reference_number: '', notes: '' });
        await fetchData();
        return;
      } catch (e) { console.error('Payment update error:', e); alert('Payment update failed.'); return; }
    }

    // New payment — standard FIFO
    var unpaidPOs2 = pos.filter(function(p) { return p.vendor_id === vendor.id && p.payment_status !== 'paid' && n(p.balance_due) > 0; })
      .sort(function(a, b) { return (a.order_date || '').localeCompare(b.order_date || ''); });
    var remaining2 = amount;
    var allocations2 = [];
    var updatedPOs2 = [];
    for (var pi2 = 0; pi2 < unpaidPOs2.length; pi2++) {
      if (remaining2 <= 0) break;
      var po2 = unpaidPOs2[pi2];
      var settleAmt2 = Math.min(remaining2, n(po2.balance_due));
      allocations2.push({ po_id: po2.id, amount_settled: settleAmt2 });
      updatedPOs2.push({ id: po2.id, newPaid: n(po2.amount_paid) + settleAmt2, newBalance: n(po2.balance_due) - settleAmt2 });
      remaining2 -= settleAmt2;
    }
    if (allocations2.length === 0) { alert('No outstanding POs to settle'); return; }
    try {
      var payId = nextPayId();
      await supa.from('vendor_payments').insert([{
        id: payId, vendor_id: vendor.id, amount: amount, payment_date: payForm.payment_date,
        payment_mode: payForm.payment_mode, reference_number: payForm.reference_number || '',
        notes: payForm.notes || '', settled_pos: allocations2, created_at: new Date().toISOString(),
        settled: false
      }]);
      for (var ai2 = 0; ai2 < allocations2.length; ai2++) {
        await supa.from('payment_allocations').insert([{
          payment_id: payId, po_id: allocations2[ai2].po_id, amount_settled: allocations2[ai2].amount_settled
        }]);
      }
      for (var ui2 = 0; ui2 < updatedPOs2.length; ui2++) {
        var u2 = updatedPOs2[ui2];
        var newPayStatus2 = u2.newBalance <= 0 ? 'paid' : 'partial';
        await supa.from('fabric_purchase_orders').update({ amount_paid: u2.newPaid, balance_due: u2.newBalance, payment_status: newPayStatus2, updated_at: new Date().toISOString() }).eq('id', u2.id);
      }
      setShowPayment(null); setEditingPayment(null);
      setPayForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_mode: 'bank_transfer', reference_number: '', notes: '' });
      await fetchData();
    } catch (e) { console.error('Payment error:', e); alert('Payment recording failed.'); }
  };

  // ─── Delete Payment ─────────────────────────────────────────────────────────
  const handleDeletePayment = async (payment) => {
    if (!confirm('Delete payment ' + payment.id + '? This will reverse the settlement of associated POs.')) return;
    try {
      // Reverse allocations
      if (payment.settled_pos && payment.settled_pos.length > 0) {
        for (var ri = 0; ri < payment.settled_pos.length; ri++) {
          var rev = payment.settled_pos[ri];
          var revPO = pos.find(function(p) { return p.id === rev.po_id; });
          if (revPO) {
            var revPaid = Math.max(0, n(revPO.amount_paid) - n(rev.amount_settled));
            var revBal = n(revPO.grand_total) - revPaid;
            var revPayStatus = revPaid <= 0 ? 'unpaid' : (revBal <= 0 ? 'paid' : 'partial');
            await supa.from('fabric_purchase_orders').update({ amount_paid: revPaid, balance_due: revBal, payment_status: revPayStatus, updated_at: new Date().toISOString() }).eq('id', rev.po_id);
          }
        }
      }
      var rd1 = await supa.from('payment_allocations').delete().eq('payment_id', payment.id);
      if (rd1.error) throw rd1.error;
      var rd2 = await supa.from('vendor_payments').delete().eq('id', payment.id);
      if (rd2.error) throw rd2.error;
      await fetchData();
    } catch (e) { console.error('Delete payment error:', e); alert('Failed to delete payment: ' + (e.message || e)); }
  };

  // ─── Download PO as image (no pricing) ──────────────────────────────────────
  const handleDownloadPO = async (po) => {
    setGeneratingPdf(po.id);
    try {
      var items = lineItems[po.id] || [];
      var vendorObj = vendors.find(function(v) { return v.id === po.vendor_id; });
      var html = '<!DOCTYPE html><html><head><style>';
      html += '*{box-sizing:border-box;margin:0;padding:0}';
      html += 'body{font-family:system-ui,-apple-system,sans-serif;padding:40px;color:#1b1c1a;max-width:800px;margin:0 auto}';
      html += '@media print{body{padding:20px}}';
      html += '.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:3px solid #d4a843}';
      html += '.logo{font-size:28px;font-weight:800;color:#795900;letter-spacing:-0.5px}';
      html += '.po-id{font-size:14px;color:#807664;margin-top:4px;font-weight:600}';
      html += '.info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:28px}';
      html += '.info-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#807664;margin-bottom:3px}';
      html += '.info-value{font-size:14px;font-weight:600;color:#1b1c1a}';
      html += '.fabric-table{width:100%;border-collapse:collapse;margin-bottom:20px}';
      html += '.fabric-table th{background:#faf9f5;padding:10px 12px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#807664;border-bottom:2px solid #e3e2df}';
      html += '.fabric-table td{padding:12px;border-bottom:1px solid #f0efeb;font-size:13px;color:#1b1c1a;vertical-align:middle}';
      html += '.fabric-table tfoot td{border-top:2px solid #d4a843;font-weight:700;padding:12px}';
      html += '.text-right{text-align:right}';
      html += '.text-center{text-align:center}';
      html += '.fabric-cell{display:flex;align-items:center;gap:10px}';
      html += '.fabric-img{width:48px;height:48px;border-radius:8px;object-fit:cover;border:1px solid #e3e2df;flex-shrink:0}';
      html += '.fabric-initial{width:48px;height:48px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:#795900;flex-shrink:0;background:linear-gradient(135deg,rgba(212,168,67,0.15),rgba(121,89,0,0.1))}';
      html += '.fabric-info{display:flex;flex-direction:column;gap:2px}';
      html += '.fabric-name{font-weight:700;font-size:13px}';
      html += '.vendor-fabric-id{font-size:11px;color:#494bd6;font-family:monospace;background:rgba(164,166,255,0.1);padding:1px 6px;border-radius:4px;display:inline-block}';
      html += '.colour-cell{display:flex;align-items:center;gap:6px}';
      html += '.colour-dot{width:14px;height:14px;border-radius:50%;border:1px solid #e3e2df;flex-shrink:0}';
      html += '.footer{margin-top:36px;padding-top:14px;border-top:1px solid #e3e2df;font-size:11px;color:#a09a8e;text-align:center}';
      html += '.notes{margin-top:20px;padding:12px 16px;background:#faf9f5;border-radius:8px;font-size:12px;color:#4e4636;border:1px solid #e3e2df}';
      html += '.section-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#795900;margin-bottom:10px}';
      html += '</style></head><body>';

      // Header
      html += '<div class="header"><div><div class="logo">HILO DESIGN</div><div class="po-id">Purchase Order: ' + po.id + '</div></div>';
      html += '<div style="text-align:right"><div class="info-label">PO Date</div><div class="info-value">' + fmtDate(po.order_date) + '</div></div></div>';

      // Info grid
      html += '<div class="info-grid">';
      html += '<div><div class="info-label">Vendor</div><div class="info-value">' + (vendorObj ? vendorObj.name : po.vendor_name) + '</div></div>';
      if (po.expected_delivery) html += '<div><div class="info-label">Expected Delivery</div><div class="info-value">' + fmtDate(po.expected_delivery) + '</div></div>';
      html += '<div><div class="info-label">Status</div><div class="info-value">' + (po.status || 'draft').replace('_', ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }) + '</div></div>';
      html += '</div>';

      // Line items table
      html += '<div class="section-label">Line Items</div>';
      html += '<table class="fabric-table"><thead><tr><th style="width:40px">#</th><th>Item</th><th>Colour</th><th style="width:100px">Vendor ID</th><th class="text-right" style="width:100px">Quantity</th></tr></thead><tbody>';
      var totalMetres = 0;
      for (var i = 0; i < items.length; i++) {
        var li = items[i];
        totalMetres += n(li.quantity_metres);
        // Find the full fabric record for image
        var fabRec = fabrics.find(function(ff) { return ff.id === li.fabric_id; });
        var imgUrl = fabRec && fabRec.image_urls && fabRec.image_urls.length > 0 ? fabRec.image_urls[0] : '';
        var colour = li.colour || (fabRec ? fabRec.colour : '') || '';
        var vfId = li.vendor_fabric_id || '';

        html += '<tr>';
        html += '<td class="text-center" style="color:#807664;font-weight:600">' + (i+1) + '</td>';
        // Fabric cell with image
        html += '<td><div class="fabric-cell">';
        if (imgUrl) {
          html += '<img class="fabric-img" src="' + imgUrl + '" alt="" />';
        } else {
          html += '<div class="fabric-initial">' + ((li.fabric_name||'F').charAt(0).toUpperCase()) + '</div>';
        }
        html += '<div class="fabric-info"><div class="fabric-name">' + (li.fabric_name||'') + '</div>';
        html += '<div style="font-size:11px;color:#807664">' + (li.fabric_id || '') + '</div>';
        html += '</div></div></td>';
        // Colour with dot
        html += '<td>';
        if (colour) {
          html += '<div class="colour-cell"><div class="colour-dot" style="background:' + colour.toLowerCase() + '"></div>' + colour + '</div>';
        } else {
          html += '<span style="color:#a09a8e">—</span>';
        }
        html += '</td>';
        // Vendor fabric ID
        html += '<td>';
        if (vfId) {
          html += '<span class="vendor-fabric-id">' + vfId + '</span>';
        } else {
          html += '<span style="color:#a09a8e">—</span>';
        }
        html += '</td>';
        // Quantity — unit-aware
        var pdfUnit = getItemUnit(li.fabric_id);
        html += '<td class="text-right" style="font-weight:700;font-family:monospace">' + (pdfUnit.isMaterial ? Math.round(n(li.quantity_metres)) + ' pcs' : n(li.quantity_metres).toFixed(1) + ' m') + '</td>';
        html += '</tr>';
      }
      html += '</tbody><tfoot><tr><td colspan="4" class="text-right">Total Quantity</td><td class="text-right" style="font-family:monospace">' + totalMetres.toFixed(1) + '</td></tr></tfoot></table>';

      if (po.notes) html += '<div class="notes"><strong>Notes:</strong> ' + po.notes + '</div>';
      html += '<div class="footer">Generated from Hilo Platform • ' + new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) + '</div>';
      html += '</body></html>';

      // Open in new window for print/save
      var win = window.open('', '_blank', 'width=800,height=600');
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(function() { win.print(); }, 500);
      } else {
        // Fallback: download as HTML
        var blob = new Blob([html], { type: 'text/html' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = po.id + '-purchase-order.html'; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) { console.error('PO download error:', e); alert('Failed to generate PO.'); }
    finally { setGeneratingPdf(null); }
  };

  // ─── Upload vendor invoice ──────────────────────────────────────────────────
  const handleInvoiceUpload = async (poId, file) => {
    setUploadingInvoice(poId);
    try {
      var url = await uploadImage(file, 'po-invoices');
      await supa.from('fabric_purchase_orders').update({ invoice_url: url, updated_at: new Date().toISOString() }).eq('id', poId);
      await fetchData();
    } catch (e) { console.error('Invoice upload error:', e); alert('Failed to upload invoice.'); }
    finally { setUploadingInvoice(null); }
  };

  var fmtDate = function(iso) { if (!iso) return '—'; var d = new Date(iso); return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }); };

  var getPaymentModeColor = function(mode) {
    if (mode === 'bank_transfer') return { bg: 'rgba(164,166,255,0.15)', text: '#494bd6', label: 'Bank Transfer' };
    if (mode === 'upi') return { bg: 'rgba(164,166,255,0.15)', text: '#494bd6', label: 'UPI' };
    if (mode === 'cash') return { bg: 'rgba(76,175,80,0.15)', text: '#4caf50', label: 'Cash' };
    if (mode === 'cheque') return { bg: 'rgba(255,193,7,0.15)', text: '#ffc107', label: 'Cheque' };
    return { bg: 'rgba(128,118,100,0.1)', text: '#807664', label: mode };
  };

  var isOverdue = function(po) {
    if (!po.expected_delivery) return false;
    if (['received', 'closed', 'cancelled'].indexOf(po.status) !== -1) return false;
    return new Date(po.expected_delivery) < new Date();
  };

  // ─── Line item management ──────────────────────────────────────────────────
  const [liDraft, setLiDraft] = useState({ fabric_id: '', qty: '', rate: '' });
  const [editingLineIdx, setEditingLineIdx] = useState(null);

  const addLineItem = () => {
    var fab = fabrics.find(function(x) { return x.id === liDraft.fabric_id; });
    if (!fab || !liDraft.qty || !liDraft.rate) return;
    var qty = n(liDraft.qty); var rate = n(liDraft.rate);
    var vfId = '';
    if (fab.vendors && Array.isArray(fab.vendors)) {
      var vfEntry = fab.vendors.find(function(ve) { return ve.vendor_id === form.vendor_id; });
      if (vfEntry) vfId = vfEntry.vendor_fabric_id || '';
    }
    if (editingLineIdx !== null) {
      // Update existing line
      setForm(function(prev) {
        var newItems = [...prev.items];
        newItems[editingLineIdx] = {
          fabric_id: fab.id, fabric_name: fab.name, colour: fab.colour || '',
          quantity_metres: qty, rate_per_metre: rate, line_total: qty * rate, vendor_fabric_id: vfId, notes: ''
        };
        return {...prev, items: newItems};
      });
      setEditingLineIdx(null);
    } else {
      setForm(function(prev) { return {...prev, items: [...prev.items, {
        fabric_id: fab.id, fabric_name: fab.name, colour: fab.colour || '',
        quantity_metres: qty, rate_per_metre: rate, line_total: qty * rate, vendor_fabric_id: vfId, notes: ''
      }]}; });
    }
    setLiDraft({ fabric_id: '', qty: '', rate: '' });
  };

  const startEditLine = (idx) => {
    var li = form.items[idx];
    setLiDraft({ fabric_id: li.fabric_id, qty: String(li.quantity_metres), rate: String(li.rate_per_metre) });
    setEditingLineIdx(idx);
  };

  const cancelEditLine = () => {
    setLiDraft({ fabric_id: '', qty: '', rate: '' });
    setEditingLineIdx(null);
  };

  if (loading) return <div className="text-center py-12" style={{color:'#807664',fontFamily:'Manrope,sans-serif'}}>Loading purchase orders...</div>;

  var selectedVendor = vendorFilter ? vendors.find(function(v) { return v.id === vendorFilter; }) : null;
  var PAGE_SIZE = 10;
  var totals = recalculateTotals(form.items, form.courier_charges, form.misc_charges, form.adjustment);

  // Fabric options for dropdown — only vendor-linked fabrics (or all if none linked)
  var fabricOptions = vendorFabrics.length > 0 ? vendorFabrics : (form.vendor_id ? fabrics : []);

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in">

      {/* ══════════════════════════════════════════════════════════════════════════
          CREATE / EDIT PO FORM
          ══════════════════════════════════════════════════════════════════════ */}
      {showForm && (
        <div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <button onClick={function() { setShowForm(false); setEditingId(null); setForm(blankForm); setLiDraft({ fabric_id: '', qty: '', rate: '' }); setEditingLineIdx(null); }}
                className="text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1" style={{color:'#795900'}}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Back to POs
              </button>
              <h2 className="font-extrabold text-lg" style={{fontFamily:'Manrope,sans-serif',color:'#1b1c1a'}}>{editingId ? 'Edit ' + editingId : 'New Purchase Order'}</h2>
            </div>
          </div>

          <div className="card p-5 mb-4" style={{boxShadow:'0 2px 12px rgba(27,28,26,0.06)'}}>
            <div className="text-xs font-bold uppercase tracking-wider mb-4" style={{color:'#795900',letterSpacing:'0.1em'}}>Order Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>Vendor <span style={{color:'#ba1a1a'}}>*</span></label>
                <select value={form.vendor_id} onChange={function(e) { var v = vendors.find(function(x) { return x.id === e.target.value; }); setForm({...form, vendor_id: e.target.value, vendor_name: v ? v.name : '', items: []}); setLiDraft({ fabric_id: '', qty: '', rate: '' }); setEditingLineIdx(null); }}
                  className="w-full px-3 py-2.5 rounded-xl text-sm" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a'}}>
                  <option value="">Select Vendor</option>
                  {vendors.map(function(v) { return <option key={v.id} value={v.id}>{v.name}</option>; })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>PO Date <span style={{color:'#ba1a1a'}}>*</span></label>
                <input type="date" value={form.order_date} onChange={function(e) { setForm({...form, order_date: e.target.value}); }}
                  className="w-full px-3 py-2.5 rounded-xl text-sm" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a'}} />
                <div className="text-xs mt-1" style={{color:'#a09a8e'}}>Date when the order was placed</div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>Expected Delivery Date</label>
                <input type="date" value={form.expected_delivery} onChange={function(e) { setForm({...form, expected_delivery: e.target.value}); }}
                  className="w-full px-3 py-2.5 rounded-xl text-sm" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a'}} />
                <div className="text-xs mt-1" style={{color:'#a09a8e'}}>When the fabric is expected to arrive</div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>Order Status</label>
                <select value={form.status} onChange={function(e) { setForm({...form, status: e.target.value}); }}
                  className="w-full px-3 py-2.5 rounded-xl text-sm" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a'}}>
                  {orderStatuses.map(function(s) { return <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_',' ')}</option>; })}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>Bill / Invoice Number</label>
                <input type="text" placeholder="e.g. INV-2024-001" value={form.bill_number} onChange={function(e) { setForm({...form, bill_number: e.target.value}); }}
                  className="w-full px-3 py-2.5 rounded-xl text-sm" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>Notes</label>
                <textarea placeholder="Any additional notes about this PO..." value={form.notes} onChange={function(e) { setForm({...form, notes: e.target.value}); }}
                  className="w-full px-3 py-2.5 rounded-xl text-sm" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a',minHeight:56,resize:'none'}} />
              </div>
            </div>

            {/* Order Level PO toggle */}
            <div className="mt-4 pt-4" style={{borderTop:'1px solid #e3e2df'}}>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative" style={{width:40,height:22}}>
                  <input type="checkbox" checked={!!form.is_order_level} onChange={function(e) { setForm({...form, is_order_level: e.target.checked, order_id: '', order_number: '', order_customer: '', order_product_sku: '', order_product_title: ''}); setOrderSearch(''); }}
                    className="sr-only peer" />
                  <div className="w-10 h-5 rounded-full transition-colors peer-checked:bg-amber-500" style={{background: form.is_order_level ? '#d4a843' : '#d1d5db'}} />
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm" style={{transform: form.is_order_level ? 'translateX(20px)' : 'translateX(0)'}} />
                </div>
                <div>
                  <span className="text-sm font-semibold" style={{color:'#1b1c1a'}}>Order Level PO</span>
                  <div className="text-xs" style={{color:'#a09a8e'}}>Fabric ordered for a specific customer order (made on order), not for inventory</div>
                </div>
              </label>

              {form.is_order_level && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>Order <span style={{color:'#ba1a1a'}}>*</span></label>
                    {form.order_number ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{background:'#faf9f5',border:'1px solid #e3e2df'}}>
                        <span className="text-sm font-bold font-mono" style={{color:'#795900'}}>{form.order_number}</span>
                        <span className="text-xs" style={{color:'#a09a8e'}}>{form.order_customer}</span>
                        <button onClick={function() { setForm({...form, order_id:'', order_number:'', order_customer:'', order_product_sku:'', order_product_title:''}); }}
                          className="ml-auto text-xs" style={{color:'#ba1a1a'}}>✕</button>
                      </div>
                    ) : (
                      <div className="relative">
                        <input value={orderSearch} onChange={function(e) { setOrderSearch(e.target.value); setShowOrderDropdown(true); }}
                          onFocus={function() { setShowOrderDropdown(true); }} onBlur={function() { setTimeout(function() { setShowOrderDropdown(false); }, 200); }}
                          placeholder="Search order # or customer…" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a'}} />
                        {showOrderDropdown && orderSearch.length >= 2 && (function() {
                          var q = orderSearch.toLowerCase();
                          var results = shopifyOrders.filter(function(o) { return (o.order_number||'').toLowerCase().includes(q) || (o.customer_name||'').toLowerCase().includes(q); }).slice(0,8);
                          return results.length > 0 ? (
                            <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto" style={{background:'#fff',border:'1px solid #e3e2df'}}>
                              {results.map(function(o) { return (
                                <button key={o.id} onClick={function() { setForm({...form, order_id: o.id, order_number: o.order_number, order_customer: o.customer_name||'', order_product_sku:'', order_product_title:''}); setOrderSearch(''); setShowOrderDropdown(false); }}
                                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50">
                                  <div><span className="text-xs font-bold font-mono" style={{color:'#795900'}}>{o.order_number}</span><span className="text-xs ml-2" style={{color:'#a09a8e'}}>{o.customer_name}</span></div>
                                </button>
                              ); })}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>Product / Piece</label>
                    {form.order_product_sku ? (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{background:'#faf9f5',border:'1px solid #e3e2df'}}>
                        <span className="text-sm font-mono font-bold" style={{color:'#795900'}}>{form.order_product_sku}</span>
                        <span className="text-xs truncate" style={{color:'#a09a8e'}}>{form.order_product_title}</span>
                        <button onClick={function() { setForm({...form, order_product_sku:'', order_product_title:''}); }}
                          className="ml-auto text-xs" style={{color:'#ba1a1a'}}>✕</button>
                      </div>
                    ) : form.order_id ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(function() {
                          var ord = shopifyOrders.find(function(o) { return o.id === form.order_id; });
                          var items = ord && ord.line_items ? ord.line_items : [];
                          return items.length > 0 ? items.map(function(p, pi) {
                            return <button key={pi} onClick={function() { setForm({...form, order_product_sku: p.sku||'', order_product_title: p.title||''}); }}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs hover:shadow-sm transition-all"
                              style={{background:'#fff',border:'1px solid #e3e2df'}}>
                              <span className="font-mono font-bold" style={{color:'#795900'}}>{(p.sku||'').replace(/-[A-Z0-9]+$/,'')}</span>
                              <span style={{color:'#4e4636'}}>{p.title}</span>
                              {p.variant_title && <span className="text-[10px] px-1 py-0.5 rounded" style={{background:'rgba(201,164,50,0.12)',color:'#795900'}}>{p.variant_title}</span>}
                            </button>;
                          }) : <div className="text-xs py-2" style={{color:'#a09a8e'}}>Select an order first</div>;
                        })()}
                      </div>
                    ) : (
                      <div className="text-xs py-2.5" style={{color:'#a09a8e'}}>Select an order first to see products</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Line Items (fabric table) ───────────────────────────────────── */}
          <div className="card p-5 mb-4" style={{boxShadow:'0 2px 12px rgba(27,28,26,0.06)'}}>
            <div className="text-xs font-bold uppercase tracking-wider mb-4" style={{color:'#795900',letterSpacing:'0.1em'}}>
              Line Items
              {form.vendor_id && vendorFabrics.length > 0 && <span style={{color:'#a09a8e',fontWeight:'500',textTransform:'none',letterSpacing:'normal',marginLeft:8}}>Showing {vendorFabrics.length} item{vendorFabrics.length !== 1 ? 's' : ''} linked to this vendor</span>}
            </div>

            {!form.vendor_id && (
              <div className="text-center py-8 text-sm" style={{color:'#a09a8e'}}>Select a vendor above to start adding items.</div>
            )}

            {form.vendor_id && (
              <>
                {/* Table header */}
                {form.items.length > 0 && (
                  <div className="hidden sm:grid sm:grid-cols-12 gap-2 mb-2 px-3 text-xs font-bold uppercase tracking-wider" style={{color:'#807664',fontSize:10}}>
                    <div className="col-span-4">Item</div>
                    <div className="col-span-2">Colour</div>
                    <div className="col-span-2 text-right">Qty</div>
                    <div className="col-span-2 text-right">Rate</div>
                    <div className="col-span-1 text-right">Total</div>
                    <div className="col-span-1"></div>
                  </div>
                )}

                {/* Existing items */}
                <div className="space-y-1.5 mb-4">
                  {form.items.map(function(li, idx) {
                    var fab = fabrics.find(function(f) { return f.id === li.fabric_id; });
                    var thumb = fab && fab.image_urls && fab.image_urls.length > 0 ? fab.image_urls[0] : null;
                    var isEditingThis = editingLineIdx === idx;

                    // ── Inline editing mode ──
                    if (isEditingThis) {
                      return (
                        <div key={idx} className="p-3 rounded-xl" style={{background:'rgba(121,89,0,0.06)',border:'2px solid #d4a843'}}>
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                            <div className="sm:col-span-5">
                              <label className="block text-xs font-bold mb-1" style={{color:'#795900',fontSize:10}}>Item</label>
                              <select value={liDraft.fabric_id} onChange={function(e) { setLiDraft({...liDraft, fabric_id: e.target.value}); }}
                                className="w-full px-3 py-2 rounded-lg text-sm" style={{background:'#fff',border:'1px solid #d4a843',color:'#1b1c1a'}}>
                                <option value="">Select Fabric / Material</option>
                                {(function() {
                                  var fabs = fabricOptions.filter(function(f) { return !f.category || f.category === 'fabric'; });
                                  var mats = fabricOptions.filter(function(f) { return f.category === 'material'; });
                                  var opts = [];
                                  if (fabs.length > 0) {
                                    opts.push(<option key="__fab_hdr__" disabled style={{fontWeight:700}}>━━ FABRICS ━━</option>);
                                    fabs.forEach(function(f) { opts.push(<option key={f.id} value={f.id}>{f.name}{f.colour ? ' • ' + f.colour : ''}</option>); });
                                  }
                                  if (mats.length > 0) {
                                    opts.push(<option key="__mat_hdr__" disabled style={{fontWeight:700}}>━━ MATERIALS ━━</option>);
                                    mats.forEach(function(f) { opts.push(<option key={f.id} value={f.id}>{f.name}{f.colour ? ' • ' + f.colour : ''}</option>); });
                                  }
                                  return opts;
                                })()}
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-bold mb-1" style={{color:'#795900',fontSize:10}}>{liDraft.fabric_id ? getItemUnit(liDraft.fabric_id).qtyLabel : 'Qty'}</label>
                              <input type="number" value={liDraft.qty} onChange={function(e) { setLiDraft({...liDraft, qty: e.target.value}); }}
                                className="w-full px-3 py-2 rounded-lg text-sm" style={{background:'#fff',border:'1px solid #d4a843',color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}} />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-bold mb-1" style={{color:'#795900',fontSize:10}}>{liDraft.fabric_id ? getItemUnit(liDraft.fabric_id).rateLabel : 'Rate (₹)'}</label>
                              <input type="number" value={liDraft.rate} onChange={function(e) { setLiDraft({...liDraft, rate: e.target.value}); }}
                                className="w-full px-3 py-2 rounded-lg text-sm" style={{background:'#fff',border:'1px solid #d4a843',color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}} />
                            </div>
                            <div className="sm:col-span-1 text-right font-bold text-sm" style={{color:'#795900',paddingBottom:8,fontFamily:'JetBrains Mono,monospace'}}>
                              {n(liDraft.qty) > 0 && n(liDraft.rate) > 0 ? fmt(n(liDraft.qty) * n(liDraft.rate)) : '—'}
                            </div>
                            <div className="sm:col-span-2 flex gap-1.5">
                              <button onClick={addLineItem} disabled={!liDraft.fabric_id || !liDraft.qty || !liDraft.rate}
                                className="flex-1 px-3 py-2 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-40" style={{background:'#795900'}}>
                                Save
                              </button>
                              <button onClick={cancelEditLine}
                                className="px-3 py-2 rounded-lg text-xs font-bold transition-colors" style={{color:'#807664',background:'#fff',border:'1px solid #e3e2df'}}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // ── Read-only row ──
                    return (
                      <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-3 rounded-xl transition-all" style={{background:'#faf9f5', border:'1px solid #e3e2df'}}>
                        <div className="sm:col-span-4 flex items-center gap-2">
                          {thumb ? (
                            <img src={thumb} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" style={{border:'1px solid #e3e2df'}} />
                          ) : (
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{background:'rgba(212,168,67,0.15)',color:'#795900'}}>{(li.fabric_name||'F').charAt(0)}</div>
                          )}
                          <span className="font-semibold text-sm" style={{color:'#1b1c1a'}}>{li.fabric_name}</span>
                        </div>
                        <div className="sm:col-span-2 text-sm" style={{color: li.colour ? '#1b1c1a' : '#a09a8e'}}>
                          {li.colour ? (
                            <span className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{background: li.colour.toLowerCase(), border:'1px solid #e3e2df'}}></span>
                              {li.colour}
                            </span>
                          ) : '—'}
                        </div>
                        <div className="sm:col-span-2 text-sm text-right" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{(function(){ var u = getItemUnit(li.fabric_id); return u.isMaterial ? Math.round(n(li.quantity_metres)) + ' pcs' : n(li.quantity_metres).toFixed(1) + ' m'; })()}</div>
                        <div className="sm:col-span-2 text-sm text-right" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(n(li.rate_per_metre))}{(function(){ var u = getItemUnit(li.fabric_id); return u.isMaterial ? '/pc' : '/m'; })()}</div>
                        <div className="sm:col-span-1 text-sm text-right font-bold" style={{color:'#1b1c1a'}}>{fmt(n(li.line_total))}</div>
                        <div className="sm:col-span-1 text-right flex gap-1 justify-end">
                          <button onClick={function() { startEditLine(idx); }}
                            className="p-1.5 rounded-lg hover:bg-amber-50 transition-colors" style={{color:'#795900'}} title="Edit"><Icon name="edit" cls="w-3.5 h-3.5" /></button>
                          <button onClick={function() { setForm(function(prev) { return {...prev, items: prev.items.filter(function(_, i) { return i !== idx; })}; }); }}
                            className="p-1.5 rounded-lg hover:bg-red-100 transition-colors" style={{color:'#ba1a1a'}} title="Remove"><Icon name="trash" cls="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add new line item (hidden when editing inline) */}
                {editingLineIdx === null && (
                <div className="p-3 rounded-xl" style={{background:'rgba(121,89,0,0.04)', border:'1px dashed #d4a843'}}>
                  <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{color:'#795900',fontSize:10}}>
                    Add Item
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                    <div className="sm:col-span-5">
                      <select value={liDraft.fabric_id} onChange={function(e) { setLiDraft({...liDraft, fabric_id: e.target.value}); }}
                        className="w-full px-3 py-2 rounded-lg text-sm" style={{background:'#fff',border:'1px solid #e3e2df',color:'#1b1c1a'}}>
                        <option value="">Select Fabric / Material</option>
                        {(function() {
                          var fabs = fabricOptions.filter(function(f) { return !f.category || f.category === 'fabric'; });
                          var mats = fabricOptions.filter(function(f) { return f.category === 'material'; });
                          var opts = [];
                          if (fabs.length > 0) {
                            opts.push(<option key="__fab_hdr__" disabled style={{fontWeight:700,color:'#795900'}}>━━ FABRICS ━━</option>);
                            fabs.forEach(function(f) {
                              var thumb = f.image_urls && f.image_urls.length > 0;
                              opts.push(<option key={f.id} value={f.id}>{f.name}{f.colour ? ' \u2022 ' + f.colour : ''}{thumb ? ' [img]' : ''}</option>);
                            });
                          }
                          if (mats.length > 0) {
                            opts.push(<option key="__mat_hdr__" disabled style={{fontWeight:700,color:'#795900'}}>━━ MATERIALS ━━</option>);
                            mats.forEach(function(f) {
                              opts.push(<option key={f.id} value={f.id}>{f.name}{f.colour ? ' \u2022 ' + f.colour : ''} [{(f.material_subtype||'material').toUpperCase()}]</option>);
                            });
                          }
                          return opts;
                        })()}
                      </select>
                      {/* Show fabric preview if selected */}
                      {liDraft.fabric_id && (() => {
                        var selFab = fabrics.find(function(f) { return f.id === liDraft.fabric_id; });
                        if (!selFab) return null;
                        var img = selFab.image_urls && selFab.image_urls.length > 0 ? selFab.image_urls[0] : null;
                        return (
                          <div className="flex items-center gap-2 mt-2 px-2 py-1.5 rounded-lg" style={{background:'#fff',border:'1px solid #e3e2df'}}>
                            {img ? (
                              <img src={img} alt="" className="w-10 h-10 rounded-lg object-cover" style={{border:'1px solid #e3e2df'}} />
                            ) : (
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold" style={{background:'rgba(212,168,67,0.15)',color:'#795900'}}>{(selFab.name||'F').charAt(0)}</div>
                            )}
                            <div>
                              <div className="text-xs font-bold" style={{color:'#1b1c1a'}}>{selFab.name}</div>
                              {selFab.colour && (
                                <div className="text-xs flex items-center gap-1 mt-0.5" style={{color:'#807664'}}>
                                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{background: selFab.colour.toLowerCase(), border:'1px solid #e3e2df'}}></span>
                                  {selFab.colour}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs mb-1" style={{color:'#807664'}}>{liDraft.fabric_id ? getItemUnit(liDraft.fabric_id).qtyLabel : 'Qty'}</label>
                      <input type="number" placeholder="0" value={liDraft.qty} onChange={function(e) { setLiDraft({...liDraft, qty: e.target.value}); }}
                        className="w-full px-3 py-2 rounded-lg text-sm" style={{background:'#fff',border:'1px solid #e3e2df',color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs mb-1" style={{color:'#807664'}}>{liDraft.fabric_id ? getItemUnit(liDraft.fabric_id).rateLabel : 'Rate (₹)'}</label>
                      <input type="number" placeholder="0" value={liDraft.rate} onChange={function(e) { setLiDraft({...liDraft, rate: e.target.value}); }}
                        className="w-full px-3 py-2 rounded-lg text-sm" style={{background:'#fff',border:'1px solid #e3e2df',color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}} />
                    </div>
                    <div className="sm:col-span-2 text-right font-bold text-sm" style={{color:'#1b1c1a',paddingBottom:8,fontFamily:'JetBrains Mono,monospace'}}>
                      {n(liDraft.qty) > 0 && n(liDraft.rate) > 0 ? fmt(n(liDraft.qty) * n(liDraft.rate)) : '—'}
                    </div>
                    <div className="sm:col-span-1 flex gap-1">
                      <button onClick={addLineItem} disabled={!liDraft.fabric_id || !liDraft.qty || !liDraft.rate}
                        className="flex-1 px-3 py-2 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-40"
                        style={{background:'#795900'}}>
                        Add
                      </button>
                    </div>
                  </div>
                </div>
                )}
              </>
            )}
          </div>

          {/* ── Totals ──────────────────────────────────────────────────────── */}
          <div className="card p-5 mb-4" style={{boxShadow:'0 2px 12px rgba(27,28,26,0.06)'}}>
            <div className="text-xs font-bold uppercase tracking-wider mb-4" style={{color:'#795900',letterSpacing:'0.1em'}}>Order Summary</div>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span style={{color:'#4e4636'}}>Subtotal ({form.items.length} item{form.items.length !== 1 ? 's' : ''})</span>
                <span className="font-bold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(totals.subtotal)}</span>
              </div>
              {totals.gst_pct > 0 ? (
                <div className="flex justify-between items-center text-sm">
                  <span style={{color:'#4e4636'}}>GST ({totals.gst_pct}%)</span>
                  <span className="font-bold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(totals.gst_amt)}</span>
                </div>
              ) : (
                <div className="flex justify-between items-center text-sm">
                  <span style={{color:'#807664',fontStyle:'italic'}}>GST — Not applicable (vendor not GST-registered)</span>
                  <span style={{color:'#807664',fontFamily:'JetBrains Mono,monospace'}}>—</span>
                </div>
              )}
              <div className="flex justify-between items-center text-sm">
                <span style={{color:'#4e4636'}}>Courier / Shipping</span>
                <input type="number" placeholder="0" value={form.courier_charges || ''} onChange={function(e) { setForm({...form, courier_charges: e.target.value}); }}
                  className="w-28 px-3 py-1.5 rounded-lg text-sm text-right" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}} />
              </div>
              <div className="flex justify-between items-center text-sm">
                <span style={{color:'#4e4636'}}>Miscellaneous Charges</span>
                <input type="number" placeholder="0" value={form.misc_charges || ''} onChange={function(e) { setForm({...form, misc_charges: e.target.value}); }}
                  className="w-28 px-3 py-1.5 rounded-lg text-sm text-right" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}} />
              </div>
              <div className="flex justify-between items-center text-sm">
                <span style={{color:'#4e4636'}}>Adjustment (round off)</span>
                <input type="number" placeholder="0" step="0.01" value={form.adjustment || ''} onChange={function(e) { setForm({...form, adjustment: e.target.value}); }}
                  className="w-28 px-3 py-1.5 rounded-lg text-sm text-right" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}} />
                <div className="text-xs" style={{color:'#a09a8e',position:'absolute',marginTop:28}}>Use -ve to reduce</div>
              </div>
              <div className="border-t pt-3 flex justify-between items-center" style={{borderColor:'#e3e2df'}}>
                <span className="font-bold text-sm" style={{color:'#1b1c1a'}}>Grand Total</span>
                <span className="font-extrabold text-xl" style={{color:'#795900',fontFamily:'JetBrains Mono,monospace'}}>{fmt(totals.total)}</span>
              </div>
            </div>
          </div>

          {/* ── Actions ──────────────────────────────────────────────────────── */}
          <div className="flex gap-3">
            <button onClick={handleSave} className="flex-1 px-4 py-3 rounded-xl text-white font-bold text-sm uppercase tracking-wider shadow-md transition-colors"
              style={{background:'linear-gradient(135deg, #795900, #d4a843)'}}>
              {editingId ? 'Update PO' : 'Create PO'}
            </button>
            <button onClick={function() { setShowForm(false); setEditingId(null); setForm(blankForm); setLiDraft({ fabric_id: '', qty: '', rate: '' }); setEditingLineIdx(null); }}
              className="flex-1 px-4 py-3 rounded-xl font-bold text-sm uppercase tracking-wider transition-colors" style={{color:'#4e4636',background:'#fff',border:'1px solid #e3e2df'}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          EMPTY STATE
          ══════════════════════════════════════════════════════════════════════ */}
      {!showForm && !selectedVendor && activeVendors.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{background:'rgba(121,89,0,0.08)'}}>
            <Icon name="file-text" cls="w-8 h-8" style={{color:'#d4a843'}} />
          </div>
          <div className="font-bold text-sm mb-2" style={{color:'#1b1c1a',fontFamily:'Manrope,sans-serif'}}>No purchase orders yet</div>
          <div className="text-sm mb-6" style={{color:'#807664'}}>Create your first PO to start tracking fabric procurement.</div>
          {vendors.length > 0 ? (
            <button onClick={function() { setShowForm(true); setEditingId(null); setForm(blankForm); }}
              className="px-5 py-2.5 rounded-xl text-white font-bold text-sm inline-flex items-center gap-2 shadow-md transition-colors"
              style={{background:'linear-gradient(135deg, #795900, #d4a843)'}}>
              <Icon name="plus" cls="w-5 h-5" /> New Purchase Order
            </button>
          ) : (
            <div className="text-sm" style={{color:'#a09a8e'}}>Add a fabric vendor first in the Vendors tab.</div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          VENDOR CARDS
          ══════════════════════════════════════════════════════════════════════ */}
      {!showForm && !selectedVendor && activeVendors.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-bold uppercase tracking-wider" style={{color:'#807664'}}>Select a vendor to view POs</div>
            <button onClick={function() { setShowForm(true); setEditingId(null); setForm(blankForm); }}
              className="px-4 py-2 rounded-xl text-white font-bold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md transition-colors"
              style={{background:'linear-gradient(135deg, #795900, #d4a843)'}}>
              <Icon name="plus" cls="w-4 h-4" /> New PO
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeVendors.map(function(vendor) {
              var vPOs = getVendorPOs(vendor.id);
              var outstanding = getVendorOutstanding(vendor.id);
              var totalVal = vPOs.reduce(function(s,p){return s+n(p.grand_total);},0);
              return (
                <div key={vendor.id} className="card p-5 cursor-pointer hover:shadow-lg transition-all" onClick={function() { setVendorFilter(vendor.id); }} style={{boxShadow:'0 2px 12px rgba(27,28,26,0.04)'}}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{background:'linear-gradient(135deg, #795900, #d4a843)',fontFamily:'Manrope,sans-serif',fontSize:'16px'}}>{(vendor.name||'V').charAt(0).toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate" style={{fontFamily:'Manrope,sans-serif',color:'#1b1c1a'}}>{vendor.name}</div>
                      <div className="text-xs mt-0.5" style={{color:'#807664'}}>{vPOs.length} PO{vPOs.length !== 1 ? 's' : ''} &middot; Total {fmt(totalVal.toFixed(0))}</div>
                    </div>
                  </div>
                  {outstanding > 0 ? (
                    <div className="px-3 py-2 rounded-lg text-center" style={{background:'rgba(186,26,26,0.06)'}}>
                      <div className="text-xs font-bold uppercase tracking-wider" style={{color:'#807664',fontSize:10}}>Outstanding</div>
                      <div className="font-extrabold text-lg" style={{color:'#ba1a1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(outstanding.toFixed(0))}</div>
                    </div>
                  ) : (
                    <div className="px-3 py-2 rounded-lg text-center" style={{background:'rgba(22,163,74,0.06)'}}>
                      <div className="text-xs font-bold" style={{color:'#16a34a'}}>All Paid</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          VENDOR DETAIL VIEW
          ══════════════════════════════════════════════════════════════════════ */}
      {!showForm && selectedVendor && (
        <div>
          <div className="mb-4 flex items-center gap-2 text-sm">
            <button onClick={function() { setVendorFilter(''); setPoPage(1); setPayPage(1); }} className="font-medium" style={{color:'#795900'}}>All Vendors</button>
            <span style={{color:'#d2c5b1'}}>/</span>
            <span className="font-bold" style={{color:'#1b1c1a'}}>{selectedVendor.name}</span>
          </div>

          {/* Vendor summary */}
          <div className="card p-5 mb-5" style={{boxShadow:'0 2px 12px rgba(27,28,26,0.06)'}}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{background:'linear-gradient(135deg, #795900, #d4a843)',fontFamily:'Manrope,sans-serif',fontSize:'18px'}}>{(selectedVendor.name||'V').charAt(0).toUpperCase()}</div>
                <div className="font-bold text-lg" style={{fontFamily:'Manrope,sans-serif',color:'#1b1c1a'}}>{selectedVendor.name}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={function() { setShowForm(true); setEditingId(null); setForm({...blankForm, vendor_id: selectedVendor.id, vendor_name: selectedVendor.name}); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{background:'linear-gradient(135deg, #795900, #d4a843)'}}>
                  <Icon name="plus" cls="w-3.5 h-3.5" /> New PO
                </button>
                <button onClick={function() { setShowPayment(selectedVendor); setEditingPayment(null); setPayForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_mode: 'bank_transfer', reference_number: '', notes: '' }); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1" style={{background:'#16a34a'}}>
                  <Icon name="credit-card" cls="w-3.5 h-3.5" /> Record Payment
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl p-3 text-center" style={{background:'rgba(212,168,67,0.08)'}}>
                <div className="font-bold text-lg" style={{color:'#795900',fontFamily:'JetBrains Mono,monospace'}}>{getVendorPOs(selectedVendor.id).length}</div>
                <div className="text-xs font-bold uppercase tracking-wider mt-1" style={{color:'#807664',fontSize:10}}>Total POs</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{background:'rgba(59,130,246,0.06)'}}>
                <div className="font-bold text-lg" style={{color:'#2563eb',fontFamily:'JetBrains Mono,monospace'}}>{getVendorPOs(selectedVendor.id).filter(function(p) { return p.payment_status !== 'paid'; }).length}</div>
                <div className="text-xs font-bold uppercase tracking-wider mt-1" style={{color:'#807664',fontSize:10}}>Open POs</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{background:'rgba(22,163,74,0.06)'}}>
                <div className="font-bold text-lg" style={{color:'#16a34a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(getVendorPaid(selectedVendor.id).toFixed(0))}</div>
                <div className="text-xs font-bold uppercase tracking-wider mt-1" style={{color:'#807664',fontSize:10}}>Total Paid</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{background: getVendorOutstanding(selectedVendor.id) > 0 ? 'rgba(186,26,26,0.06)' : 'rgba(22,163,74,0.06)'}}>
                <div className="font-bold text-lg" style={{color: getVendorOutstanding(selectedVendor.id) > 0 ? '#ba1a1a' : '#16a34a', fontFamily:'JetBrains Mono,monospace'}}>{fmt(getVendorOutstanding(selectedVendor.id).toFixed(0))}</div>
                <div className="text-xs font-bold uppercase tracking-wider mt-1" style={{color:'#807664',fontSize:10}}>Outstanding</div>
              </div>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{background:'#efeeea'}}>
            <button onClick={function() { setVendorSubTab('pos'); }} className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
              style={{background: vendorSubTab === 'pos' ? '#fff' : 'transparent', color: vendorSubTab === 'pos' ? '#795900' : '#807664', boxShadow: vendorSubTab === 'pos' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none'}}>
              Purchase Orders
            </button>
            <button onClick={function() { setVendorSubTab('payments'); }} className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
              style={{background: vendorSubTab === 'payments' ? '#fff' : 'transparent', color: vendorSubTab === 'payments' ? '#795900' : '#807664', boxShadow: vendorSubTab === 'payments' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none'}}>
              Payments
            </button>
          </div>

          {/* ── PO List ───────────────────────────────────────────────────── */}
          {vendorSubTab === 'pos' && (
            <div>
              <div className="flex gap-3 mb-4">
                <select value={statusFilter} onChange={function(e) { setStatusFilter(e.target.value); setPoPage(1); }}
                  className="flex-1 px-3 py-2 rounded-xl text-xs" style={{background:'#fff',border:'1px solid #e3e2df',color:'#1b1c1a'}}>
                  <option value="">All Order Statuses</option>
                  {orderStatuses.map(function(s) { var info = orderStatusColors[s]; return <option key={s} value={s}>{info ? info.label : s}</option>; })}
                </select>
                <select value={payStatusFilter} onChange={function(e) { setPayStatusFilter(e.target.value); setPoPage(1); }}
                  className="flex-1 px-3 py-2 rounded-xl text-xs" style={{background:'#fff',border:'1px solid #e3e2df',color:'#1b1c1a'}}>
                  <option value="">All Payment Statuses</option>
                  {paymentStatuses.map(function(s) { var info = payStatusColors[s]; return <option key={s} value={s}>{info ? info.label : s}</option>; })}
                </select>
              </div>

              {(() => {
                var allVendorPOs = getVendorPOs(selectedVendor.id);
                if (statusFilter) allVendorPOs = allVendorPOs.filter(function(p) { return p.status === statusFilter; });
                if (payStatusFilter) allVendorPOs = allVendorPOs.filter(function(p) { return (p.payment_status || 'unpaid') === payStatusFilter; });
                var sortedPOs = allVendorPOs.sort(function(a,b) { return (b.order_date||'').localeCompare(a.order_date||''); });
                var paginatedPOs = sortedPOs.slice((poPage - 1) * PAGE_SIZE, poPage * PAGE_SIZE);
                var totalPages = Math.ceil(sortedPOs.length / PAGE_SIZE);

                if (sortedPOs.length === 0) return <div className="text-center py-12" style={{color:'#807664'}}>No purchase orders match the current filters.</div>;

                return (
                  <div>
                    <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-4 py-2 mb-1 text-xs font-bold uppercase tracking-wider" style={{color:'#807664',fontSize:10}}>
                      <div className="col-span-2">PO #</div>
                      <div className="col-span-2">PO Date</div>
                      <div className="col-span-2">Delivery</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-2 text-right">Total</div>
                      <div className="col-span-2 text-right">Balance</div>
                    </div>

                    <div className="space-y-2 mb-4">
                      {paginatedPOs.map(function(po) {
                        var overdue = isOverdue(po);
                        var oStatus = orderStatusColors[po.status] || orderStatusColors.draft;
                        var pStatus = payStatusColors[po.payment_status || 'unpaid'] || payStatusColors.unpaid;
                        var isExp = expandedId === po.id;
                        var items = lineItems[po.id] || [];

                        return (
                          <div key={po.id} className="card overflow-hidden transition-all" style={{boxShadow: isExp ? '0 8px 24px rgba(27,28,26,0.08)' : '0 2px 8px rgba(27,28,26,0.04)', borderLeft: overdue ? '3px solid #ba1a1a' : 'none'}}>
                            <button onClick={function() { setExpandedId(isExp ? null : po.id); }} className="w-full grid grid-cols-1 sm:grid-cols-12 gap-2 items-center px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                              <div className="sm:col-span-2 font-bold text-xs" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>
                                {po.id}{overdue && <span className="ml-1" style={{color:'#ba1a1a'}} title="Overdue">!</span>}
                                {po.is_order_level && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{background:'rgba(201,164,50,0.15)',color:'#795900'}}>ORDER</span>}
                              </div>
                              <div className="sm:col-span-2 text-xs" style={{color:'#4e4636'}}>
                                {fmtDate(po.order_date)}
                                {po.created_by_name && <div className="text-[10px] mt-0.5" style={{color:'#9c9b97'}}>by {po.created_by_name}</div>}
                              </div>
                              <div className="sm:col-span-2 text-xs" style={{color: overdue ? '#ba1a1a' : '#4e4636', fontWeight: overdue ? 'bold' : 'normal'}}>{fmtDate(po.expected_delivery)}</div>
                              <div className="sm:col-span-2 flex gap-1.5 flex-wrap">
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:oStatus.bg,color:oStatus.text,fontSize:10}}>{oStatus.label}</span>
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:pStatus.bg,color:pStatus.text,fontSize:10}}>{pStatus.label}</span>
                              </div>
                              <div className="sm:col-span-2 text-right text-sm font-bold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(n(po.grand_total).toFixed(0))}</div>
                              <div className="sm:col-span-2 text-right flex items-center justify-end gap-2">
                                <span className="text-sm font-bold" style={{color: n(po.balance_due) > 0 ? '#ba1a1a' : '#16a34a', fontFamily:'JetBrains Mono,monospace'}}>
                                  {n(po.balance_due) > 0 ? fmt(n(po.balance_due).toFixed(0)) : 'Paid'}
                                </span>
                                <svg className="w-4 h-4 flex-shrink-0 transition-transform" style={{color:'#807664',transform: isExp ? 'rotate(180deg)' : 'rotate(0deg)'}} fill="none" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </div>
                            </button>

                            {isExp && (
                              <div className="px-4 pb-4 border-t" style={{borderColor:'#f0efeb'}}>
                                {/* Audit stamp */}
                                <div className="mt-3 mb-2">
                                  <AuditStamp
                                    createdBy={{ name: po.created_by_name || 'System', role: po.created_by_role, date: po.created_at }}
                                    updatedBy={po.updated_by_name ? { name: po.updated_by_name, role: po.updated_by_role, date: po.updated_at } : null}
                                    entityType="purchase_order"
                                    entityId={po.id}
                                    compact={false}
                                  />
                                </div>
                                {po.is_order_level && po.order_number && (
                                  <div className="mt-3 mb-3 flex items-center gap-3 px-3 py-2 rounded-lg" style={{background:'rgba(201,164,50,0.08)',border:'1px solid rgba(201,164,50,0.2)'}}>
                                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{color:'#795900'}}>Order Level PO</span>
                                    <span className="text-xs font-bold font-mono" style={{color:'#795900'}}>{po.order_number}</span>
                                    {po.order_customer && <span className="text-xs" style={{color:'#807664'}}>{po.order_customer}</span>}
                                    {po.order_product_sku && <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{background:'rgba(201,164,50,0.12)',color:'#795900'}}>{po.order_product_sku}</span>}
                                    {po.order_product_title && <span className="text-xs" style={{color:'#4e4636'}}>{po.order_product_title}</span>}
                                  </div>
                                )}
                                {/* Line items table */}
                                <div className="mt-4 mb-3">
                                  <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{color:'#795900',fontSize:10}}>Line Items</div>
                                  <div className="rounded-xl overflow-hidden" style={{border:'1px solid #e3e2df'}}>
                                    <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wider" style={{background:'#faf9f5',color:'#807664',fontSize:10}}>
                                      <div className="col-span-4">Item</div>
                                      <div className="col-span-2">Colour</div>
                                      <div className="col-span-2 text-right">Qty</div>
                                      <div className="col-span-2 text-right">Rate</div>
                                      <div className="col-span-2 text-right">Total</div>
                                    </div>
                                    {items.map(function(li, idx) {
                                      var fab = fabrics.find(function(f) { return f.id === li.fabric_id; });
                                      var img = fab && fab.image_urls && fab.image_urls.length > 0 ? fab.image_urls[0] : null;
                                      var liUnit = getItemUnit(li.fabric_id);
                                      return (
                                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center px-3 py-2 text-xs" style={{background: idx % 2 === 0 ? '#fff' : '#faf9f5',borderTop: idx > 0 ? '1px solid #f0efeb' : 'none'}}>
                                          <div className="sm:col-span-4 flex items-center gap-2">
                                            {img ? <img src={img} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" style={{border:'1px solid #e3e2df'}} /> : null}
                                            <span className="font-semibold" style={{color:'#1b1c1a'}}>{li.fabric_name}</span>
                                            {liUnit.isMaterial && <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{background:'#ede9fe',color:'#5b21b6'}}>MAT</span>}
                                          </div>
                                          <div className="sm:col-span-2" style={{color:'#807664'}}>{li.colour || '—'}</div>
                                          <div className="sm:col-span-2 text-right" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{liUnit.isMaterial ? Math.round(n(li.quantity_metres)) + ' pcs' : n(li.quantity_metres).toFixed(1) + ' m'}</div>
                                          <div className="sm:col-span-2 text-right" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(n(li.rate_per_metre))}{liUnit.isMaterial ? '/pc' : '/m'}</div>
                                          <div className="sm:col-span-2 text-right font-bold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(n(li.line_total))}</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Totals */}
                                <div className="rounded-xl p-3 mb-3" style={{background:'#faf9f5',border:'1px solid #e3e2df'}}>
                                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                                    <div><div className="font-bold uppercase tracking-wider mb-1" style={{color:'#807664',fontSize:10}}>Subtotal</div><div className="font-bold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(n(po.subtotal))}</div></div>
                                    <div><div className="font-bold uppercase tracking-wider mb-1" style={{color:'#807664',fontSize:10}}>GST{n(po.gst_percent) > 0 ? ' (' + n(po.gst_percent) + '%)' : ''}</div><div className="font-bold" style={{color:n(po.gst_amount) > 0 ? '#1b1c1a' : '#807664',fontFamily:'JetBrains Mono,monospace'}}>{n(po.gst_amount) > 0 ? fmt(n(po.gst_amount)) : '—'}</div></div>
                                    <div><div className="font-bold uppercase tracking-wider mb-1" style={{color:'#807664',fontSize:10}}>Courier</div><div className="font-bold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(n(po.shipping_cost))}</div></div>
                                    {n(po.misc_charges) > 0 && <div><div className="font-bold uppercase tracking-wider mb-1" style={{color:'#807664',fontSize:10}}>Misc</div><div className="font-bold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(n(po.misc_charges))}</div></div>}
                                    {n(po.adjustment) !== 0 && <div><div className="font-bold uppercase tracking-wider mb-1" style={{color:'#807664',fontSize:10}}>Adj</div><div className="font-bold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{n(po.adjustment) > 0 ? '+' : ''}{fmt(n(po.adjustment))}</div></div>}
                                    <div className="col-span-2 sm:col-span-5 border-t pt-2" style={{borderColor:'#e3e2df'}}>
                                      <div className="flex justify-between items-center">
                                        <div><div className="font-bold uppercase tracking-wider mb-1" style={{color:'#807664',fontSize:10}}>Balance Due</div></div>
                                        <div className="font-extrabold text-sm" style={{color: n(po.balance_due) > 0 ? '#ba1a1a' : '#16a34a', fontFamily:'JetBrains Mono,monospace'}}>{n(po.balance_due) > 0 ? fmt(n(po.balance_due)) : 'Paid'}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Invoice section */}
                                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs mb-3" style={{color:'#807664'}}>
                                  {po.bill_number && <div><span className="font-bold" style={{color:'#4e4636'}}>Bill:</span> {po.bill_number}</div>}
                                  {po.notes && <div><span className="font-bold" style={{color:'#4e4636'}}>Notes:</span> {po.notes}</div>}
                                  {po.invoice_url && (
                                    <a href={po.invoice_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold" style={{color:'#494bd6'}}>
                                      <Icon name="file-text" cls="w-3.5 h-3.5" /> View Invoice
                                    </a>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 pt-2 border-t flex-wrap" style={{borderColor:'#f0efeb'}}>
                                  <select value={po.status} onChange={function(e) { handleStatusChange(po, e.target.value); }}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a'}}>
                                    {orderStatuses.map(function(s) { return <option key={s} value={s}>{(orderStatusColors[s] || {}).label || s}</option>; })}
                                  </select>
                                  <button onClick={function() { handleEdit(po); }} className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-gray-100 transition-colors" style={{color:'#1b1c1a',border:'1px solid #e3e2df'}}>
                                    <Icon name="edit" cls="w-3.5 h-3.5" /> Edit
                                  </button>
                                  <button onClick={function() { handleDownloadPO(po); }} disabled={generatingPdf === po.id}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-blue-50 transition-colors" style={{color:'#494bd6',border:'1px solid rgba(73,75,214,0.2)'}}>
                                    <Icon name="download" cls="w-3.5 h-3.5" /> {generatingPdf === po.id ? 'Generating...' : 'PO for Vendor'}
                                  </button>
                                  {/* Invoice upload */}
                                  <label className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-purple-50 transition-colors cursor-pointer" style={{color:'#7c3aed',border:'1px solid rgba(124,58,237,0.2)'}}>
                                    <Icon name="upload" cls="w-3.5 h-3.5" /> {uploadingInvoice === po.id ? 'Uploading...' : (po.invoice_url ? 'Replace Invoice' : 'Upload Invoice')}
                                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={function(e) { if (e.target.files && e.target.files[0]) handleInvoiceUpload(po.id, e.target.files[0]); e.target.value = ''; }} />
                                  </label>
                                  {n(po.balance_due) > 0 && (
                                    <button onClick={function() { setShowPayment(selectedVendor); setEditingPayment(null); setPayForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_mode: 'bank_transfer', reference_number: '', notes: '' }); }}
                                      className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 text-white transition-colors" style={{background:'#16a34a'}}>
                                      <Icon name="credit-card" cls="w-3.5 h-3.5" /> Pay
                                    </button>
                                  )}
                                  <button onClick={function() { handleDelete(po.id); }} className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-red-50 transition-colors ml-auto" style={{color:'#ba1a1a',border:'1px solid rgba(186,26,26,0.2)'}}>
                                    <Icon name="trash" cls="w-3.5 h-3.5" /> Delete
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between" style={{fontSize:12,color:'#807664'}}>
                        <span>Showing {(poPage-1)*PAGE_SIZE+1}–{Math.min(poPage*PAGE_SIZE, sortedPOs.length)} of {sortedPOs.length}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={function(){setPoPage(Math.max(1,poPage-1));}} disabled={poPage===1} className="px-2 py-1 rounded text-xs font-bold" style={{color:poPage===1?'#d2c5b1':'#795900'}}>Prev</button>
                          {(() => {
                            var pages = []; var start = Math.max(1, poPage - 2); var end = Math.min(totalPages, start + 4);
                            if (end - start < 4) start = Math.max(1, end - 4);
                            for (var p = start; p <= end; p++) pages.push(p);
                            return pages.map(function(pn) {
                              return <button key={pn} onClick={function() { setPoPage(pn); }} className="w-7 h-7 rounded text-xs font-bold transition-all" style={{background: pn === poPage ? '#795900' : 'transparent', color: pn === poPage ? '#fff' : '#1b1c1a'}}>{pn}</button>;
                            });
                          })()}
                          <button onClick={function(){setPoPage(Math.min(totalPages,poPage+1));}} disabled={poPage===totalPages} className="px-2 py-1 rounded text-xs font-bold" style={{color:poPage===totalPages?'#d2c5b1':'#795900'}}>Next</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Payments Tab ──────────────────────────────────────────────── */}
          {vendorSubTab === 'payments' && (
            <div>
              {(() => {
                var allPayments = getVendorPayments(selectedVendor.id).sort(function(a,b) { return (b.payment_date||'').localeCompare(a.payment_date||''); });
                var paginatedPayments = allPayments.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE);
                var totalPayPages = Math.ceil(allPayments.length / PAGE_SIZE);

                if (allPayments.length === 0) return <div className="text-center py-12" style={{color:'#807664'}}>No payment records for this vendor yet.</div>;

                return (
                  <div>
                    <div className="space-y-2 mb-4">
                      {paginatedPayments.map(function(payment) {
                        var modeInfo = getPaymentModeColor(payment.payment_mode);
                        return (
                          <div key={payment.id} className="card p-4" style={{boxShadow:'0 2px 8px rgba(27,28,26,0.04)'}}>
                            <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center gap-3">
                                <div className="font-bold text-xs" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{payment.id}</div>
                                <div className="text-xs" style={{color:'#807664'}}>{fmtDate(payment.payment_date)}</div>
                                <div className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:modeInfo.bg,color:modeInfo.text,fontSize:10}}>{modeInfo.label}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="font-bold text-sm" style={{color:'#16a34a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(n(payment.amount))}</div>
                                {/* Edit / Delete */}
                                <button onClick={function() {
                                  setShowPayment(selectedVendor);
                                  setEditingPayment(payment);
                                  setPayForm({ amount: String(payment.amount), payment_date: payment.payment_date, payment_mode: payment.payment_mode, reference_number: payment.reference_number || '', notes: payment.notes || '' });
                                }} className="p-1.5 rounded-lg hover:bg-amber-50 transition-colors" style={{color:'#795900'}} title="Edit Payment">
                                  <Icon name="edit" cls="w-3.5 h-3.5" />
                                </button>
                                <button onClick={function() { handleDeletePayment(payment); }}
                                  className="p-1.5 rounded-lg hover:bg-red-50 transition-colors" style={{color:'#ba1a1a'}} title="Delete Payment">
                                  <Icon name="trash" cls="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            {payment.reference_number && <div className="text-xs mb-1" style={{color:'#4e4636'}}><span className="font-bold">Ref:</span> <span style={{fontFamily:'JetBrains Mono,monospace'}}>{payment.reference_number}</span></div>}
                            {payment.notes && <div className="text-xs mb-1" style={{color:'#807664'}}>{payment.notes}</div>}
                            {/* Settle status (read-only — settle via Bank Statement) */}
                            <span className="inline-flex items-center gap-1 mb-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                              style={{ background: payment.settled ? 'rgba(22,163,74,0.12)' : 'rgba(156,163,175,0.12)', color: payment.settled ? '#16a34a' : '#9ca3af', border: '1px solid ' + (payment.settled ? 'rgba(22,163,74,0.2)' : 'rgba(156,163,175,0.2)') }}>
                              {payment.settled ? '✓ Settled' : 'Unsettled — settle via Bank Statement'}
                            </span>
                            {payment.settled_pos && payment.settled_pos.length > 0 && (
                              <div className="mt-2 px-3 py-2 rounded-lg" style={{background:'#faf9f5',border:'1px solid #e3e2df'}}>
                                <div className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#807664',fontSize:10}}>Settled POs</div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1" style={{fontSize:11}}>
                                  {payment.settled_pos.map(function(settlement, idx) {
                                    return (
                                      <div key={idx} className="flex gap-1.5 items-center">
                                        <span style={{color:'#807664',fontFamily:'JetBrains Mono,monospace'}}>{settlement.po_id}</span>
                                        <span className="font-bold" style={{color:'#1b1c1a'}}>{fmt(n(settlement.amount_settled))}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {totalPayPages > 1 && (
                      <div className="flex items-center justify-between" style={{fontSize:12,color:'#807664'}}>
                        <span>Showing {(payPage-1)*PAGE_SIZE+1}–{Math.min(payPage*PAGE_SIZE, allPayments.length)} of {allPayments.length}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={function(){setPayPage(Math.max(1,payPage-1));}} disabled={payPage===1} className="px-2 py-1 rounded text-xs font-bold" style={{color:payPage===1?'#d2c5b1':'#795900'}}>Prev</button>
                          {(() => {
                            var pages = []; var start = Math.max(1, payPage - 2); var end = Math.min(totalPayPages, start + 4);
                            if (end - start < 4) start = Math.max(1, end - 4);
                            for (var p = start; p <= end; p++) pages.push(p);
                            return pages.map(function(pn) {
                              return <button key={pn} onClick={function() { setPayPage(pn); }} className="w-7 h-7 rounded text-xs font-bold transition-all" style={{background: pn === payPage ? '#795900' : 'transparent', color: pn === payPage ? '#fff' : '#1b1c1a'}}>{pn}</button>;
                            });
                          })()}
                          <button onClick={function(){setPayPage(Math.min(totalPayPages,payPage+1));}} disabled={payPage===totalPayPages} className="px-2 py-1 rounded text-xs font-bold" style={{color:payPage===totalPayPages?'#d2c5b1':'#795900'}}>Next</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          PAYMENT MODAL
          ══════════════════════════════════════════════════════════════════════ */}
      {showPayment && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'16px'}}>
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" style={{boxShadow:'0 20px 48px rgba(27,28,26,0.12)'}}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-extrabold text-lg" style={{fontFamily:'Manrope,sans-serif',color:'#1b1c1a'}}>{editingPayment ? 'Edit Payment ' + editingPayment.id : 'Record Payment'}</h2>
                <p className="text-sm" style={{color:'#807664'}}>{showPayment.name}</p>
              </div>
              <button onClick={function() { setShowPayment(null); setEditingPayment(null); }} className="p-2 rounded-lg hover:bg-gray-100" style={{color:'#807664'}}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            <div className="p-4 rounded-xl mb-5" style={{background:'rgba(186,26,26,0.06)'}}>
              <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{color:'#807664',fontSize:10}}>Total Outstanding</div>
              <div className="font-extrabold text-2xl" style={{color:'#ba1a1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(getVendorOutstanding(showPayment.id).toFixed(0))}</div>
            </div>

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>Settlement Amount <span style={{color:'#ba1a1a'}}>*</span></label>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-xl" style={{color:'#795900'}}>₹</span>
                  <input type="number" value={payForm.amount} onChange={function(e) { setPayForm({...payForm, amount: e.target.value}); }}
                    placeholder="0" className="flex-1 text-2xl font-bold px-0 py-2" style={{background:'transparent',border:'none',borderBottom:'2px solid #d4a843',color:'#795900',outline:'none',fontFamily:'JetBrains Mono,monospace'}} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>Payment Date <span style={{color:'#ba1a1a'}}>*</span></label>
                  <input type="date" value={payForm.payment_date} onChange={function(e) { setPayForm({...payForm, payment_date: e.target.value}); }}
                    className="w-full px-3 py-2.5 rounded-xl text-sm" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a'}} />
                  <div className="text-xs mt-1" style={{color:'#a09a8e'}}>Date the payment was made</div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>Payment Mode</label>
                  <select value={payForm.payment_mode} onChange={function(e) { setPayForm({...payForm, payment_mode: e.target.value}); }}
                    className="w-full px-3 py-2.5 rounded-xl text-sm" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a'}}>
                    <option value="bank_transfer">Bank Transfer</option><option value="upi">UPI</option>
                    <option value="cash">Cash</option><option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>Reference / UTR Number</label>
                <input type="text" value={payForm.reference_number} onChange={function(e) { setPayForm({...payForm, reference_number: e.target.value}); }}
                  placeholder="e.g. UTR123456789" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}} />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{color:'#4e4636'}}>Notes</label>
                <textarea value={payForm.notes} onChange={function(e) { setPayForm({...payForm, notes: e.target.value}); }}
                  placeholder="Optional notes..." className="w-full px-3 py-2.5 rounded-xl text-sm" style={{background:'#faf9f5',border:'1px solid #e3e2df',color:'#1b1c1a',minHeight:48,resize:'none'}} />
              </div>
            </div>

            {/* FIFO Preview */}
            {n(payForm.amount) > 0 && (
              <div className="mb-5 p-4 rounded-xl" style={{background:'#faf9f5',border:'1px solid #e3e2df'}}>
                <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{color:'#795900',fontSize:10}}>Settlement Preview (oldest PO first)</div>
                {(() => {
                  var unpaid = pos.filter(function(p) { return p.vendor_id === showPayment.id && p.payment_status !== 'paid' && n(p.balance_due) > 0; })
                    .sort(function(a, b) { return (a.order_date||'').localeCompare(b.order_date||''); });
                  var rem = n(payForm.amount);
                  var hasSettlement = false;
                  return (
                    <div className="space-y-1.5">
                      {unpaid.map(function(po) {
                        if (rem <= 0) return (
                          <div key={po.id} className="flex justify-between items-center py-1.5 px-2 rounded-lg text-xs" style={{background:'#fff',opacity:0.5}}>
                            <div className="flex items-center gap-2">
                              <span style={{fontFamily:'JetBrains Mono,monospace',color:'#807664'}}>{po.id}</span>
                              <span style={{color:'#a09a8e'}}>{fmtDate(po.order_date)}</span>
                            </div>
                            <span style={{color:'#807664'}}>Due: {fmt(n(po.balance_due))}</span>
                          </div>
                        );
                        hasSettlement = true;
                        var settle = Math.min(rem, n(po.balance_due));
                        rem -= settle;
                        var willBePaid = n(po.balance_due) - settle <= 0;
                        return (
                          <div key={po.id} className="flex justify-between items-center py-2 px-3 rounded-lg text-xs" style={{background:'#fff',border:'1px solid #e3e2df'}}>
                            <div className="flex items-center gap-2">
                              <span className="font-bold" style={{fontFamily:'JetBrains Mono,monospace',color:'#1b1c1a'}}>{po.id}</span>
                              <span style={{color:'#807664'}}>{fmtDate(po.order_date)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt(settle.toFixed(0))}</span>
                              <span className="font-bold px-2 py-0.5 rounded-full" style={{fontSize:10, background: willBePaid ? 'rgba(22,163,74,0.1)' : 'rgba(245,158,11,0.1)', color: willBePaid ? '#16a34a' : '#d97706'}}>
                                {willBePaid ? 'PAID' : 'PARTIAL'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {rem > 0 && hasSettlement && (
                        <div className="text-xs font-bold mt-2 px-2" style={{color:'#d97706'}}>
                          Excess: {fmt(rem.toFixed(0))} (will not be allocated)
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={handleRecordPayment} disabled={!payForm.amount || n(payForm.amount) <= 0}
                className="flex-1 px-4 py-3 rounded-xl text-white font-bold text-sm uppercase tracking-wider shadow-md transition-colors disabled:opacity-40"
                style={{background:'#16a34a'}}>
                {editingPayment ? 'Update Payment' : 'Confirm Payment'}
              </button>
              <button onClick={function() { setShowPayment(null); setEditingPayment(null); }}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-sm uppercase tracking-wider transition-colors" style={{color:'#4e4636',background:'#fff',border:'1px solid #e3e2df'}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden invoice file input */}
      <input ref={invoiceFileRef} type="file" accept="image/*,.pdf" className="hidden" />

      {/* ══════════════════════════════════════════════════════════════════════════
          QC APPROVAL CONFIRMATION MODAL
          ══════════════════════════════════════════════════════════════════════ */}
      {qcConfirmPO && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.4)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:'16px'}}>
          <div className="bg-white rounded-3xl p-6 max-w-md w-full" style={{boxShadow:'0 20px 48px rgba(27,28,26,0.12)'}}>
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{background:'rgba(20,184,166,0.1)'}}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            </div>
            <h3 className="font-extrabold text-lg text-center mb-2" style={{fontFamily:'Manrope,sans-serif',color:'#1b1c1a'}}>QC Approval</h3>
            <p className="text-sm text-center mb-4" style={{color:'#807664'}}>
              Confirm quality check for <strong style={{color:'#1b1c1a'}}>{qcConfirmPO.id}</strong>
            </p>

            <div className="p-4 rounded-xl mb-4" style={{background:'#faf9f5',border:'1px solid #e3e2df'}}>
              <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{color:'#795900',fontSize:10}}>Items to be added to inventory</div>
              {(lineItems[qcConfirmPO.id] || []).map(function(li, idx) {
                return (
                  <div key={idx} className="flex justify-between items-center py-1.5 text-xs" style={{borderBottom: idx < (lineItems[qcConfirmPO.id] || []).length - 1 ? '1px solid #f0efeb' : 'none'}}>
                    <span className="font-semibold" style={{color:'#1b1c1a'}}>{li.fabric_name} {li.colour && <span style={{color:'#807664'}}>• {li.colour}</span>}</span>
                    <span className="font-bold" style={{color:'#0d9488',fontFamily:'JetBrains Mono,monospace'}}>{(function(){ var u = getItemUnit(li.fabric_id); return u.isMaterial ? Math.round(n(li.quantity_metres)) + ' pcs' : n(li.quantity_metres).toFixed(1) + ' m'; })()}</span>
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-xl mb-5" style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.2)'}}>
              <p className="text-xs font-bold text-center" style={{color:'#d97706'}}>
                Did we receive the right quality and quantity?
              </p>
              <p className="text-xs text-center mt-1" style={{color:'#a09a8e'}}>
                Approving will add these fabrics to your inventory.
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={handleQcApprove}
                className="flex-1 px-4 py-3 rounded-xl text-white font-bold text-sm uppercase tracking-wider shadow-md transition-colors"
                style={{background:'#0d9488'}}>
                Yes, Approve QC
              </button>
              <button onClick={function() { setQcConfirmPO(null); }}
                className="flex-1 px-4 py-3 rounded-xl font-bold text-sm uppercase tracking-wider transition-colors" style={{color:'#4e4636',background:'#fff',border:'1px solid #e3e2df'}}>
                Not Yet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseOrdersTab

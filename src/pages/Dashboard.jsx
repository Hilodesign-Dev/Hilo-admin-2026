import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../lib/supabase'
import { save, load } from '../lib/storage'
import { _logError, _logChange } from '../lib/logger'
import { fmt, gst, n, gmPct, calcCogs } from '../lib/helpers'
import { CATEGORIES } from '../lib/constants'
import Modal from '../components/Modal'
import Icon from '../components/Icon'

const Dashboard = ({ products }) => {
  // ── COGS Review counts ──
  var reviewCounts = useMemo(function() {
    return products.reduce(function(acc, p) {
      var st = p.cogs_review_status || 'pending_entry';
      acc[st] = (acc[st] || 0) + 1;
      return acc;
    }, {});
  }, [products]);
  var finalized = reviewCounts.finalized || 0;
  var inReview = reviewCounts.in_review || 0;
  var pending = reviewCounts.pending_entry || 0;
  var rejected = reviewCounts.rejected || 0;
  var progressPct = products.length > 0 ? Math.round((finalized / products.length) * 100) : 0;

  // ── Margin KPIs — finalized products only ──
  var finalizedProducts = products.filter(function(p) { return (p.cogs_review_status || 'pending_entry') === 'finalized'; });
  var active = finalizedProducts.filter(function(p) { return p.mrp > 0; });
  var avgGM = active.length > 0 ? active.reduce(function(s, p) { return s + gmPct(p.sellingPrice || p.mrp, calcCogs(p), p.mrp); }, 0) / active.length : 0;
  var avgCogs = active.length > 0 ? active.reduce(function(s, p) { return s + calcCogs(p); }, 0) / active.length : 0;
  var avgMrp = active.length > 0 ? active.reduce(function(s, p) { return s + p.mrp; }, 0) / active.length : 0;

  // Use all unique category names from actual products (not just the CATEGORIES constant)
  var allCats = [...new Set([...CATEGORIES, ...products.map(function(p) { return p.category; }).filter(Boolean)])];
  var byCat = allCats.map(function(cat) {
    var ps = products.filter(function(p) { return p.category === cat; });
    if (!ps.length) return null;
    var finPs = ps.filter(function(p) { return (p.cogs_review_status || 'pending_entry') === 'finalized'; });
    var gm = finPs.length > 0 ? finPs.reduce(function(s, p) { return s + gmPct(p.sellingPrice || p.mrp, calcCogs(p), p.mrp); }, 0) / finPs.length : 0;
    return { cat: cat, count: ps.length, finCount: finPs.length, gm: gm };
  }).filter(Boolean);

  var avgCogsOfMrp = avgMrp > 0 ? (avgCogs / avgMrp * 100) : 0;
  var cards = [
    { label: 'Total SKUs', value: products.length, color: 'bg-blue-50 text-blue-600', sub: finalized + ' finalized / ' + products.length + ' total' },
    { label: 'Avg. COGS', value: fmt(avgCogs.toFixed(0)), color: 'bg-amber-50 text-amber-600', sub: avgMrp > 0 ? avgCogsOfMrp.toFixed(0) + '% of MRP' : '' },
    { label: 'Avg. MRP', value: fmt(avgMrp.toFixed(0)), color: 'bg-purple-50 text-purple-600', sub: 'finalized SKUs' },
    { label: 'Avg. GM%', value: (avgGM*100).toFixed(1) + '%', color: 'bg-green-50 text-green-600', sub: avgMrp > 0 ? fmt(((avgMrp-(avgMrp/(1+gst(avgMrp))))-avgCogs).toFixed(0)) + ' avg profit' : '' },
  ];

  return (
    <div className="fade-in p-4 sm:p-8 max-w-6xl">
      <h1 style={{fontFamily:"Manrope,sans-serif",fontSize:"1.5rem",fontWeight:800,letterSpacing:"-0.02em",color:"#1b1c1a",lineHeight:1.1,marginBottom:4}} className="sm:text-3xl">Dashboard</h1>
      <p className="page-subtitle mb-6">Atelier Performance Metrics</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 mb-6 stats-grid-4">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-lg sm:rounded-xl p-3 sm:p-5" style={{boxShadow:'0 8px 24px rgba(27,28,26,0.05)'}}>
            <div style={{fontSize:8,fontWeight:600,letterSpacing:'0.12em',textTransform:'uppercase',color:'rgba(27,28,26,0.4)',marginBottom:8}}>{c.label}</div>
            <div style={{fontFamily:'Manrope,sans-serif',fontSize:'1.2rem',fontWeight:800,letterSpacing:'-0.02em',color:'#1b1c1a',lineHeight:1}} className="sm:text-2xl">{c.value}</div>
            {c.sub && <div style={{fontSize:10,color:'rgba(27,28,26,0.4)',marginTop:3}} className="sm:text-xs sm:mt-4">{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── COGS Review Progress ───────────────────────────────────── */}
      <div className="bg-white rounded-lg sm:rounded-xl shadow-sm p-4 sm:p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-700 text-xs sm:text-base">COGS Review Progress</h3>
          <span className="text-xs text-gray-400">Based on finalized products only</span>
        </div>
        <div className="flex items-center gap-4 mb-3">
          <div className="flex-1">
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-3 rounded-full bg-green-500 transition-all" style={{width: progressPct + '%'}}></div>
            </div>
          </div>
          <span className="text-sm font-bold text-gray-700" style={{fontFamily:'Manrope,sans-serif'}}>{progressPct}%</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-green-50 rounded-lg px-3 py-2 text-center">
            <div className="text-lg font-bold text-green-700" style={{fontFamily:'Inter,sans-serif'}}>{finalized}</div>
            <div className="text-xs text-green-600 font-medium">Finalized</div>
          </div>
          <div className="bg-amber-50 rounded-lg px-3 py-2 text-center">
            <div className="text-lg font-bold text-amber-700" style={{fontFamily:'Inter,sans-serif'}}>{inReview}</div>
            <div className="text-xs text-amber-600 font-medium">In Review</div>
          </div>
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
            <div className="text-lg font-bold text-gray-700" style={{fontFamily:'Inter,sans-serif'}}>{pending}</div>
            <div className="text-xs text-gray-500 font-medium">Pending</div>
          </div>
          <div className="bg-red-50 rounded-lg px-3 py-2 text-center">
            <div className="text-lg font-bold text-red-700" style={{fontFamily:'Inter,sans-serif'}}>{rejected}</div>
            <div className="text-xs text-red-500 font-medium">Rejected</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg sm:rounded-xl shadow-sm overflow-hidden">
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-b"><h3 className="font-semibold text-gray-700 text-xs sm:text-base">Products by Category</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm" style={{minWidth:'100%'}}>
            <thead><tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b">
              <th className="px-4 sm:px-6 py-3 text-left">Category</th>
              <th className="px-4 sm:px-6 py-3 text-right">SKUs</th>
              <th className="px-4 sm:px-6 py-3 text-right">Avg. GM%</th>
              <th className="px-4 sm:px-6 py-3 text-left hidden sm:table-cell">Margin</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {byCat.map(r => (
                <tr key={r.cat} className="hover:bg-gray-50">
                  <td className="px-4 sm:px-6 py-3 font-medium text-gray-700 text-sm">{r.cat}</td>
                  <td className="px-4 sm:px-6 py-3 text-right text-gray-600">{r.count} <span className="text-xs text-gray-400">({r.finCount} fin.)</span></td>
                  <td className={`px-4 sm:px-6 py-3 text-right font-semibold text-sm ${r.gm > 0.5 ? 'text-green-600' : r.gm > 0.3 ? 'text-amber-600' : 'text-red-500'}`}>{r.finCount > 0 ? (r.gm*100).toFixed(1) + '%' : '—'}</td>
                  <td className="px-4 sm:px-6 py-3 hidden sm:table-cell">
                    <div className="h-1.5 bg-gray-100 rounded-full w-24">
                      <div className={`h-1.5 rounded-full ${r.gm > 0.5 ? 'bg-green-400' : r.gm > 0.3 ? 'bg-amber-400' : 'bg-red-400'}`} style={{width:`${Math.min(r.gm*100,100)}%`}} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Product Form ─────────────────────────────────────────────────────────────

export default Dashboard

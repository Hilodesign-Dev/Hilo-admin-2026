import React, { useState, useEffect, useMemo } from 'react'
import { supa } from '../../lib/supabase'
import { _logChange } from '../../lib/logger'
import { n, fmt } from '../../lib/helpers'
import Icon from '../../components/Icon'

const FabricInventoryTab = () => {
  const [fabrics, setFabrics] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [stockFilter, setStockFilter] = useState('all'); // all | low | out | good

  // Add/remove form state
  const [entryType, setEntryType] = useState('add');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Ledger view state
  const [showFullLedger, setShowFullLedger] = useState(null); // fabric_id or null

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fabRes, invRes] = await Promise.all([
        supa.from('fabrics').select('id, name, fabric_family, colour, image_urls, is_active, default_cost_per_metre, cost_type, category, unit, material_subtype').order('name'),
        supa.from('fabric_inventory').select('*').order('created_at', { ascending: false })
      ]);
      if (fabRes.data) setFabrics(fabRes.data);
      if (invRes.data) setInventory(invRes.data);
    } catch (e) { console.error('Fetch error:', e); }
    finally { setLoading(false); }
  };

  // Stock map: fabric_id → total metres
  const stock = useMemo(() => {
    const map = {};
    inventory.forEach(inv => {
      map[inv.fabric_id] = (map[inv.fabric_id] || 0) + n(inv.quantity_metres);
    });
    return map;
  }, [inventory]);

  // All entries per fabric
  const entriesByFabric = useMemo(() => {
    const map = {};
    inventory.forEach(inv => {
      if (!map[inv.fabric_id]) map[inv.fabric_id] = [];
      map[inv.fabric_id].push(inv);
    });
    return map;
  }, [inventory]);

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return fabrics.filter(f => {
      if (q) {
        var match = (f.name || '').toLowerCase().includes(q) ||
               (f.fabric_family || '').toLowerCase().includes(q) ||
               (f.colour || '').toLowerCase().includes(q) ||
               (f.id || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      var s = stock[f.id] || 0;
      if (stockFilter === 'low') return s > 0 && s <= 5;
      if (stockFilter === 'out') return s <= 0;
      if (stockFilter === 'good') return s > 20;
      return true;
    });
  }, [fabrics, search, stock, stockFilter]);

  const toggleExpand = (id) => {
    if (expandedId === id) { setExpandedId(null); setShowFullLedger(null); }
    else { setExpandedId(id); setEntryType('add'); setQty(''); setNote(''); setShowFullLedger(null); }
  };

  const handleSaveEntry = async (fabric) => {
    if (!qty || n(qty) <= 0) { alert('Enter a valid quantity'); return; }
    setSaving(true);
    try {
      const finalQty = entryType === 'remove' ? -n(qty) : n(qty);
      const payload = {
        fabric_id: fabric.id,
        fabric_name: fabric.name || '',
        entry_type: entryType === 'remove' ? 'manual_deduct' : 'manual_add',
        quantity_metres: finalQty,
        reference_id: '',
        reference_note: note || (entryType === 'remove' ? 'Manual stock removal' : 'Manual stock addition'),
        created_by: 'manual',
        created_at: new Date().toISOString()
      };
      const { error } = await supa.from('fabric_inventory').insert([payload]);
      if (error) throw error;
      setInventory(prev => [payload, ...prev]);
      setQty(''); setNote(''); setEntryType('add');
      _logChange('inventory_update', 'fabric_inventory', fabric.id, fabric.name, { type: entryType, qty: finalQty });
    } catch (e) { console.error('Save entry error:', e); alert('Failed to save.'); }
    finally { setSaving(false); }
  };

  const stockLevel = (s) => {
    if (s > 20) return { color: '#16a34a', bg: 'rgba(22,163,74,0.08)', label: 'Good' };
    if (s > 5) return { color: '#d4a843', bg: 'rgba(212,168,67,0.1)', label: 'Low' };
    if (s > 0) return { color: '#ba1a1a', bg: 'rgba(186,26,26,0.08)', label: 'Critical' };
    return { color: '#807664', bg: 'rgba(128,118,100,0.08)', label: 'No Stock' };
  };

  const entryIcon = (type) => {
    if (type === 'po_received') return { icon: 'package', color: '#0d9488', bg: 'rgba(20,184,166,0.1)', label: 'PO Received (QC Approved)' };
    if (type === 'manual_add') return { icon: 'plus', color: '#16a34a', bg: 'rgba(22,163,74,0.1)', label: 'Manual Addition' };
    if (type === 'manual_deduct') return { icon: 'minus', color: '#ba1a1a', bg: 'rgba(186,26,26,0.1)', label: 'Manual Deduction' };
    if (type === 'production') return { icon: 'scissors', color: '#7c3aed', bg: 'rgba(124,58,237,0.1)', label: 'Production' };
    if (type === 'adjustment') return { icon: 'edit', color: '#d97706', bg: 'rgba(245,158,11,0.1)', label: 'Stock Adjustment' };
    return { icon: 'circle', color: '#807664', bg: 'rgba(128,118,100,0.1)', label: type || 'Unknown' };
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  };

  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  // Unit helper — renders value with correct unit suffix
  const isMat = (f) => f && f.category === 'material';
  const unitSuffix = (f) => isMat(f) ? ' pcs' : 'm';
  const fmtQty = (val, f) => isMat(f) ? Math.round(Math.max(val, 0)) + ' pcs' : Math.max(val, 0).toFixed(1) + 'm';
  const fmtQtySigned = (val, f) => {
    var isIn = val > 0;
    return (isIn ? '+' : '') + (isMat(f) ? Math.round(val) + ' pcs' : n(val).toFixed(1) + 'm');
  };

  if (loading) return <div className="text-center py-12" style={{color:'#807664',fontFamily:'Manrope,sans-serif'}}>Loading inventory...</div>;

  const totalStock = Object.values(stock).reduce((a, b) => a + Math.max(0, b), 0);
  const totalValue = fabrics.reduce((sum, f) => sum + Math.max(0, stock[f.id] || 0) * n(f.default_cost_per_metre), 0);
  const lowCount = fabrics.filter(f => { var s = stock[f.id] || 0; return s > 0 && s <= 5; }).length;
  const outCount = fabrics.filter(f => (stock[f.id] || 0) <= 0).length;

  return (
    <div className="fade-in">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <button onClick={() => setStockFilter('all')} className="rounded-2xl p-4 text-left transition-all" style={{background:'#fff',boxShadow: stockFilter === 'all' ? '0 0 0 2px #795900' : '0 2px 8px rgba(27,28,26,0.04)'}}>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{color:'#807664'}}>Total Stock</div>
          <div className="text-xl font-extrabold" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{totalStock.toFixed(0)}m</div>
          {totalValue > 0 && <div className="text-xs mt-0.5" style={{color:'#807664'}}>Value: {fmt(totalValue.toFixed(0))}</div>}
        </button>
        <button onClick={() => setStockFilter(stockFilter === 'good' ? 'all' : 'good')} className="rounded-2xl p-4 text-left transition-all" style={{background:'#fff',boxShadow: stockFilter === 'good' ? '0 0 0 2px #16a34a' : '0 2px 8px rgba(27,28,26,0.04)'}}>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{color:'#807664'}}>In Stock</div>
          <div className="text-xl font-extrabold" style={{color:'#16a34a'}}>{fabrics.filter(f => (stock[f.id] || 0) > 20).length}</div>
        </button>
        <button onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')} className="rounded-2xl p-4 text-left transition-all" style={{background:'#fff',boxShadow: stockFilter === 'low' ? '0 0 0 2px #d4a843' : '0 2px 8px rgba(27,28,26,0.04)'}}>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{color:'#807664'}}>Low Stock</div>
          <div className="text-xl font-extrabold" style={{color:'#d4a843'}}>{lowCount}</div>
        </button>
        <button onClick={() => setStockFilter(stockFilter === 'out' ? 'all' : 'out')} className="rounded-2xl p-4 text-left transition-all" style={{background:'#fff',boxShadow: stockFilter === 'out' ? '0 0 0 2px #ba1a1a' : '0 2px 8px rgba(27,28,26,0.04)'}}>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{color:'#807664'}}>Out of Stock</div>
          <div className="text-xl font-extrabold" style={{color:'#ba1a1a'}}>{outCount}</div>
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{color:'#807664'}}><Icon name="search" cls="w-4 h-4" /></div>
        <input
          type="text" placeholder="Search by name, colour, family, or ID..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
          style={{background:'#fff',border:'1px solid #e3e2df',color:'#1b1c1a'}}
        />
      </div>

      {/* Fabric rows */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-sm" style={{color:'#807664'}}>
            {stockFilter !== 'all' ? 'No fabrics match this filter.' : 'No fabrics found.'}
            {stockFilter !== 'all' && <button onClick={() => setStockFilter('all')} className="block mx-auto mt-2 text-xs font-bold" style={{color:'#795900'}}>Show all</button>}
          </div>
        )}
        {filtered.map(f => {
          const s = stock[f.id] || 0;
          const level = stockLevel(s);
          const isExpanded = expandedId === f.id;
          const allEntries = entriesByFabric[f.id] || [];
          const recentEntries = showFullLedger === f.id ? allEntries : allEntries.slice(0, 5);
          const imgUrl = (f.image_urls && f.image_urls.length > 0) ? f.image_urls[0] : null;
          const costPerM = n(f.default_cost_per_metre);

          return (
            <div key={f.id} className="rounded-2xl overflow-hidden transition-all" style={{background:'#fff',boxShadow: isExpanded ? '0 8px 24px rgba(27,28,26,0.08)' : '0 2px 8px rgba(27,28,26,0.04)'}}>
              {/* Main row */}
              <button onClick={() => toggleExpand(f.id)} className="w-full flex items-center gap-3 p-3 sm:p-4 text-left hover:bg-gray-50 transition-colors">
                {/* Image */}
                <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center" style={{background: imgUrl ? 'transparent' : 'linear-gradient(135deg, #795900, #d4a843)'}}>
                  {imgUrl
                    ? <img src={imgUrl} alt="" className="w-full h-full object-cover" />
                    : <span className="text-white font-bold text-sm" style={{fontFamily:'Manrope,sans-serif'}}>{(f.name||'F').charAt(0).toUpperCase()}</span>
                  }
                </div>

                {/* Name + colour */}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate" style={{fontFamily:'Manrope,sans-serif',color:'#1b1c1a'}}>{f.name}</div>
                  <div className="text-xs truncate flex items-center gap-1.5" style={{color:'#807664'}}>
                    {f.colour && (
                      <>
                        <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: f.colour.toLowerCase(), border:'1px solid #e3e2df'}}></span>
                        <span>{f.colour}</span>
                        <span>·</span>
                      </>
                    )}
                    <span>{f.fabric_family || f.material_subtype || f.id}</span>
                    {isMat(f) && <><span>·</span><span className="font-bold px-1 py-0.5 rounded text-[8px]" style={{background:'#ede9fe',color:'#5b21b6'}}>MAT</span></>}
                  </div>
                </div>

                {/* Stock bar + amount */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="hidden sm:block w-24">
                    <div className="w-full h-1.5 rounded-full" style={{background:'#e3e2df'}}>
                      <div style={{height:'100%',width:`${Math.min((Math.max(s,0)/30)*100,100)}%`,background:level.color,borderRadius:'9999px',transition:'width 0.3s'}}></div>
                    </div>
                  </div>
                  <div className="px-2.5 py-1 rounded-lg text-xs font-bold min-w-[60px] text-center" style={{background:level.bg,color:level.color,fontFamily:'JetBrains Mono,monospace'}}>
                    {fmtQty(s, f)}
                  </div>
                  <svg className="w-4 h-4 flex-shrink-0 transition-transform" style={{color:'#807664',transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}} fill="none" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </button>

              {/* Expanded section */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t" style={{borderColor:'#f0efeb'}}>
                  {/* Stock summary bar */}
                  <div className="flex items-center gap-4 py-3 mb-2">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider" style={{color:'#807664',fontSize:10}}>Current Stock</div>
                      <div className="font-extrabold text-lg" style={{color: level.color, fontFamily:'JetBrains Mono,monospace'}}>{fmtQty(s, f)}</div>
                    </div>
                    {costPerM > 0 && (
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider" style={{color:'#807664',fontSize:10}}>Stock Value</div>
                        <div className="font-bold text-sm" style={{color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}}>{fmt((Math.max(s, 0) * costPerM).toFixed(0))}</div>
                        <div className="text-xs" style={{color:'#a09a8e'}}>@ {fmt(costPerM)}{isMat(f) ? '/pc' : '/m'}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider" style={{color:'#807664',fontSize:10}}>Transactions</div>
                      <div className="font-bold text-sm" style={{color:'#1b1c1a'}}>{allEntries.length}</div>
                    </div>
                  </div>

                  {/* Add / Remove form */}
                  <div className="p-3 rounded-xl mb-3" style={{background:'rgba(121,89,0,0.04)',border:'1px dashed #d4a843'}}>
                    <div className="flex items-end gap-2 flex-wrap">
                      <div className="flex rounded-lg overflow-hidden" style={{border:'1px solid #e3e2df'}}>
                        <button onClick={() => setEntryType('add')}
                          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
                          style={{background: entryType === 'add' ? '#16a34a' : '#fff', color: entryType === 'add' ? '#fff' : '#4e4636'}}>
                          + Add
                        </button>
                        <button onClick={() => setEntryType('remove')}
                          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
                          style={{background: entryType === 'remove' ? '#ba1a1a' : '#fff', color: entryType === 'remove' ? '#fff' : '#4e4636'}}>
                          − Remove
                        </button>
                      </div>
                      <div className="flex-1 min-w-[80px]">
                        <input type="number" placeholder={isMat(f) ? 'Pieces' : 'Metres'} value={qty} onChange={e => setQty(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg text-sm"
                          style={{border:'1px solid #e3e2df',background:'#fff',color:'#1b1c1a',fontFamily:'JetBrains Mono,monospace'}} />
                      </div>
                      <div className="flex-1 min-w-[100px]">
                        <input type="text" placeholder="Reason / note" value={note} onChange={e => setNote(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg text-sm"
                          style={{border:'1px solid #e3e2df',background:'#fff',color:'#1b1c1a'}} />
                      </div>
                      <button onClick={() => handleSaveEntry(f)} disabled={saving || !qty}
                        className="px-4 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                        style={{background: entryType === 'remove' ? '#ba1a1a' : '#16a34a', color:'#fff'}}>
                        {saving ? '...' : 'Save'}
                      </button>
                    </div>
                  </div>

                  {/* Ledger */}
                  {allEntries.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold uppercase tracking-wider" style={{color:'#795900',fontSize:10}}>Stock Ledger</div>
                        {allEntries.length > 5 && (
                          <button onClick={() => setShowFullLedger(showFullLedger === f.id ? null : f.id)} className="text-xs font-bold" style={{color:'#795900'}}>
                            {showFullLedger === f.id ? 'Show recent' : 'View all ' + allEntries.length}
                          </button>
                        )}
                      </div>

                      {/* Ledger table header */}
                      <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3 py-1.5 mb-1 text-xs font-bold uppercase tracking-wider" style={{color:'#807664',fontSize:9}}>
                        <div className="col-span-3">Date</div>
                        <div className="col-span-3">Type</div>
                        <div className="col-span-2 text-right">Qty</div>
                        <div className="col-span-4">Reference</div>
                      </div>

                      <div className="space-y-1 rounded-xl overflow-hidden" style={{border:'1px solid #e3e2df'}}>
                        {recentEntries.map((inv, idx) => {
                          const isIn = n(inv.quantity_metres) > 0;
                          const eInfo = entryIcon(inv.entry_type);
                          return (
                            <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 items-center px-3 py-2 text-xs" style={{background: idx % 2 === 0 ? '#fff' : '#faf9f5'}}>
                              <div className="sm:col-span-3" style={{color:'#4e4636'}}>{fmtDateTime(inv.created_at)}</div>
                              <div className="sm:col-span-3 flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{background: eInfo.bg}}>
                                  <Icon name={eInfo.icon} cls="w-3 h-3" style={{color: eInfo.color}} />
                                </div>
                                <span style={{color: eInfo.color}} className="font-bold">{eInfo.label}</span>
                              </div>
                              <div className="sm:col-span-2 text-right font-bold" style={{color: isIn ? '#16a34a' : '#ba1a1a', fontFamily:'JetBrains Mono,monospace'}}>
                                {fmtQtySigned(n(inv.quantity_metres), f)}
                              </div>
                              <div className="sm:col-span-4 truncate" style={{color:'#807664'}}>
                                {inv.reference_id && <span className="font-mono mr-1" style={{color:'#494bd6'}}>{inv.reference_id}</span>}
                                {inv.reference_note || '—'}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Running total hint */}
                      <div className="text-xs text-right mt-1.5 px-1" style={{color:'#a09a8e'}}>
                        Net: {fmtQty(allEntries.reduce((sum, inv) => sum + n(inv.quantity_metres), 0), f)} from {allEntries.length} transaction{allEntries.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  )}

                  {allEntries.length === 0 && (
                    <div className="text-center py-4 text-xs" style={{color:'#a09a8e'}}>No inventory transactions yet for this fabric.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FabricInventoryTab

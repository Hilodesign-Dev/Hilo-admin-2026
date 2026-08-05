import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, nextId } from '../../lib/helpers'
import MasterTable from '../../components/MasterTable'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

const ColourMaster = () => {
  const [colours, setColours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('All');
  const [form, setForm] = useState({ name: '', hex_code: '#000000', dye_chart_code: '', family: '', is_active: true });

  const fetchColours = async function() {
    try {
      var { data, error } = await supa.from('colour_master').select('*').order('family').order('name');
      if (error) throw error;
      setColours(data || []);
    } catch (err) {
      console.error('Error fetching colours:', err);
      _logError && _logError('colour_master_fetch', err?.message || 'Unknown');
    } finally {
      setLoading(false);
    }
  };
  useEffect(function() { fetchColours(); }, []);

  const saveColour = async function() {
    try {
      if (editing) {
        var { error } = await supa.from('colour_master').update(form).eq('id', editing);
        if (error) throw error;
      } else {
        var { error: insErr } = await supa.from('colour_master').insert([form]);
        if (insErr) throw insErr;
      }
      _logChange(editing ? 'update' : 'create', 'colour', editing || '', form.name, { hex: form.hex_code, dye_code: form.dye_chart_code, family: form.family });
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', hex_code: '#000000', dye_chart_code: '', family: '', is_active: true });
      fetchColours();
    } catch (err) { alert('Error: ' + (err?.message || 'Unknown')); }
  };

  const deleteColour = async function(id) {
    if (!confirm('Delete this colour?')) return;
    try {
      var _delColour = colours.find(function(c) { return c.id === id; });
      var { error } = await supa.from('colour_master').delete().eq('id', id);
      if (error) throw error;
      _logChange('delete', 'colour', id, _delColour ? _delColour.name : '', null);
      fetchColours();
    } catch (err) {
      console.error('Error deleting colour:', err);
      alert('Failed to delete colour: ' + (err?.message || 'Unknown'));
    }
  };

  var families = ['All', ...new Set(colours.map(function(c) { return c.family; }).filter(Boolean))];
  var filtered = colours.filter(function(c) {
    if (familyFilter !== 'All' && c.family !== familyFilter) return false;
    if (search && !(c.name || '').toLowerCase().includes(search.toLowerCase()) && !(c.dye_chart_code || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div className="text-center py-12 text-gray-500">Loading colours...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 style={{ fontFamily: 'Manrope, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: '#1b1c1a' }}>Colour Master</h2>
          <p className="text-xs text-gray-500 mt-1">{colours.length} colours · Dyeing chart codes</p>
        </div>
        <button onClick={function() { setEditing(null); setForm({ name: '', hex_code: '#000000', dye_chart_code: '', family: '', is_active: true }); setShowForm(true); }}
          className="btn-gold px-4 py-2 rounded-lg text-sm font-semibold">+ Add Colour</button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input type="text" value={search} onChange={function(e) { setSearch(e.target.value); }} className="input-ghost text-sm flex-1 min-w-[150px]" placeholder="Search by name or dye code..." />
        <div className="pill-scroll">
          {families.map(function(f) {
            return <button key={f} onClick={function() { setFamilyFilter(f); }}
              className="px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0"
              style={{ background: familyFilter === f ? '#ffffff' : 'transparent', color: familyFilter === f ? '#795900' : 'rgba(27,28,26,0.5)', boxShadow: familyFilter === f ? '0 4px 12px rgba(27,28,26,0.06)' : 'none' }}>
              {f}
            </button>;
          })}
        </div>
      </div>

      {/* Colour Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filtered.map(function(c) {
          return (
            <div key={c.id} className="card p-3 flex flex-col items-center text-center" style={{ opacity: c.is_active ? 1 : 0.5 }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: c.hex_code || '#ccc', border: '2px solid rgba(0,0,0,0.1)', marginBottom: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
              <div className="font-semibold text-xs" style={{ color: '#1b1c1a' }}>{c.name}</div>
              <div className="font-mono text-xs text-gray-400 mt-1">{c.dye_chart_code || '—'}</div>
              <div className="text-xs text-gray-400">{c.hex_code}</div>
              {c.family && <div className="mt-1"><span className="badge badge-gold text-xs">{c.family}</span></div>}
              <div className="flex gap-1 mt-2">
                <button onClick={function() { setEditing(c.id); setForm({ name: c.name, hex_code: c.hex_code, dye_chart_code: c.dye_chart_code, family: c.family, is_active: c.is_active }); setShowForm(true); }}
                  className="text-xs px-2 py-1 rounded hover:bg-gray-100" style={{ color: '#795900' }}>Edit</button>
                <button onClick={function() { deleteColour(c.id); }}
                  className="text-xs px-2 py-1 rounded hover:bg-red-50" style={{ color: '#ba1a1a' }}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">No colours found</div>}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="card p-6 max-w-md w-full">
            <h3 className="font-headline font-bold text-lg mb-4">{editing ? 'Edit Colour' : 'Add New Colour'}</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: form.hex_code || '#ccc', border: '2px solid rgba(0,0,0,0.1)', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }} />
                <div className="flex-1">
                  <label className="label-xs mb-1 block">Colour Name</label>
                  <input type="text" value={form.name} onChange={function(e) { setForm({...form, name: e.target.value}); }} className="w-full input-ghost" placeholder="e.g., Rani Pink" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-xs mb-1 block">Hex Code</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.hex_code || '#000000'} onChange={function(e) { setForm({...form, hex_code: e.target.value}); }} style={{ width: '32px', height: '32px', border: 'none', cursor: 'pointer', padding: 0 }} />
                    <input type="text" value={form.hex_code} onChange={function(e) { setForm({...form, hex_code: e.target.value}); }} className="flex-1 input-ghost text-xs font-mono" placeholder="#FF00FF" />
                  </div>
                </div>
                <div>
                  <label className="label-xs mb-1 block">Dye Chart Code</label>
                  <input type="text" value={form.dye_chart_code} onChange={function(e) { setForm({...form, dye_chart_code: e.target.value}); }} className="w-full input-ghost" placeholder="DC-036" />
                </div>
              </div>
              <div>
                <label className="label-xs mb-1 block">Colour Family</label>
                <select value={form.family} onChange={function(e) { setForm({...form, family: e.target.value}); }} className="w-full input-ghost">
                  <option value="">Select family...</option>
                  {['Red', 'Pink', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Brown', 'Neutral', 'Metallic'].map(function(f) { return <option key={f} value={f}>{f}</option>; })}
                </select>
              </div>
              <div>
                <label className="label-xs">
                  <input type="checkbox" checked={form.is_active} onChange={function(e) { setForm({...form, is_active: e.target.checked}); }} className="mr-2" />
                  Active
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={saveColour} className="btn-gold flex-1 py-2 rounded-lg font-semibold">{editing ? 'Update' : 'Add Colour'}</button>
              <button onClick={function() { setShowForm(false); setEditing(null); }} className="flex-1 py-2 rounded-lg font-semibold border border-gray-300">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Users Tab ────────────────────────────────────────────────────────────────

export default ColourMaster

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { channelToSnake, channelToCamel } from '../../lib/caseMapping'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, nextId } from '../../lib/helpers'
import { CHANNEL_COLORS } from '../../lib/constants'
import MasterTable from '../../components/MasterTable'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import EditChannelRow from './EditChannelRow'

const CANONICAL_IDS = new Set(['in-store', 'online', 'online-assist', 'marketplace'])

const ChannelMaster = ({ channels, setChannels }) => {
  const blank = () => ({
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)),
    key: '', label: '', emoji: '', adPlatform: '', color: 'gray',
  });
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState(null); // id of row being edited

  const refreshChannels = async () => {
    const { data } = await supa.from('sales_channels').select('*');
    if (data) setChannels(data.map(channelToCamel));
  };

  const saveNew = async () => {
    if (!draft.key.trim() || !draft.label.trim()) return;
    const entry = { ...draft, key: draft.key.trim().toLowerCase().replace(/\s+/g, '-') };
    try {
      const row = channelToSnake(entry);
      const { error } = await supa.from('sales_channels').insert(row);
      if (error) throw error;
      await refreshChannels();
    } catch (e) {
      console.error('[HILO] saveChannel error:', e);
      alert('Failed to save channel: ' + (e.message || 'Unknown error'));
    }
    setAdding(false); setDraft(blank());
  };

  const saveEdit = async (id, patch) => {
    const merged = channels.find(c => c.id === id);
    const entry = { ...merged, ...patch, key: (patch.key || merged?.key || '').trim().toLowerCase().replace(/\s+/g, '-') };
    try {
      const row = channelToSnake(entry);
      const { error } = await supa.from('sales_channels').update(row).eq('id', id);
      if (error) throw error;
      await refreshChannels();
    } catch (e) {
      console.error('[HILO] editChannel error:', e);
      alert('Failed to update channel: ' + (e.message || 'Unknown error'));
    }
    setEditing(null);
  };

  const remove = async (id) => {
    if (CANONICAL_IDS.has(String(id))) {
      alert('This is a canonical channel and cannot be removed. It powers dashboards, filters, and order channel mapping.')
      return
    }
    try {
      const { error } = await supa.from('sales_channels').delete().eq('id', id);
      if (error) throw error;
      await refreshChannels();
    } catch (e) {
      console.error('[HILO] removeChannel error:', e);
      alert('Failed to remove channel: ' + (e.message || 'Unknown error'));
    }
  };

  const colorOpts = Object.keys(CHANNEL_COLORS);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-semibold text-gray-800">Sales Channels</div>
          <div className="text-xs text-gray-400 mt-0.5">Channels appear in order filters, analytics breakdowns and channel overrides on orders.</div>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setDraft(blank()); }}
            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">
            + Add Channel
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Key <span className="text-gray-400">(slug)</span></label>
            <input value={draft.key} onChange={e => setDraft(p => ({...p, key: e.target.value}))}
              placeholder="e.g. tiktok" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Label</label>
            <input value={draft.label} onChange={e => setDraft(p => ({...p, label: e.target.value}))}
              placeholder="e.g. TikTok Shop" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Emoji</label>
            <input value={draft.emoji} onChange={e => setDraft(p => ({...p, emoji: e.target.value}))}
              placeholder="e.g. 🎵" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" maxLength={4} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Ad Platform <span className="text-gray-400">(optional)</span></label>
            <input value={draft.adPlatform} onChange={e => setDraft(p => ({...p, adPlatform: e.target.value}))}
              placeholder="e.g. facebook" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Badge Colour</label>
            <select value={draft.color} onChange={e => setDraft(p => ({...p, color: e.target.value}))}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
              {colorOpts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={saveNew} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">Save</button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        {channels.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">No channels yet.</div>
        )}
        {channels.map(ch => {
          const isEditing = editing === ch.id;
          const badgeClass = CHANNEL_COLORS[ch.color] || CHANNEL_COLORS.gray;
          return (
            <div key={ch.id} className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 group">
              {isEditing ? (
                <EditChannelRow ch={ch} colorOpts={colorOpts} onSave={patch => saveEdit(ch.id, patch)} onCancel={() => setEditing(null)} />
              ) : (
                <>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
                    {ch.emoji} {ch.label}
                  </span>
                  <span className="text-xs text-gray-400 font-mono">{ch.key}</span>
                  {ch.adPlatform && (
                    <span className="text-xs text-gray-400">→ ad: <span className="font-medium text-gray-600">{ch.adPlatform}</span></span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {CANONICAL_IDS.has(String(ch.id)) ? (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: '#fef3c7', color: '#92400e' }}
                        title="Canonical channel — protected from deletion to preserve dashboards + reports.">
                        🔒 canonical
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditing(ch.id)} className="text-xs text-indigo-600 hover:text-indigo-800">Edit</button>
                        <button onClick={() => remove(ch.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Inline edit row for a channel (kept separate to avoid re-renders on other rows)

export default ChannelMaster

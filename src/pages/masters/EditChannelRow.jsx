import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, nextId } from '../../lib/helpers'
import MasterTable from '../../components/MasterTable'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

const EditChannelRow = ({ ch, colorOpts, onSave, onCancel }) => {
  const [form, setForm] = useState({ key: ch.key, label: ch.label, emoji: ch.emoji, adPlatform: ch.adPlatform || '', color: ch.color || 'gray' });
  return (
    <div className="w-full grid grid-cols-2 sm:grid-cols-5 gap-2 py-1">
      <input value={form.key} onChange={e => setForm(p => ({...p, key: e.target.value}))}
        placeholder="key" className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
      <input value={form.label} onChange={e => setForm(p => ({...p, label: e.target.value}))}
        placeholder="label" className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
      <input value={form.emoji} onChange={e => setForm(p => ({...p, emoji: e.target.value}))}
        placeholder="emoji" className="border border-gray-200 rounded-lg px-2 py-1 text-sm" maxLength={4} />
      <input value={form.adPlatform} onChange={e => setForm(p => ({...p, adPlatform: e.target.value}))}
        placeholder="ad platform" className="border border-gray-200 rounded-lg px-2 py-1 text-sm" />
      <div className="flex items-center gap-2">
        <select value={form.color} onChange={e => setForm(p => ({...p, color: e.target.value}))}
          className="border border-gray-200 rounded-lg px-2 py-1 text-sm flex-1">
          {colorOpts.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => onSave(form)} className="text-xs font-bold text-green-600 hover:text-green-800">✓</button>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
      </div>
    </div>
  );
};

// ─── Error Log Viewer (admin) ─────────────────────────────────────────────────

export default EditChannelRow

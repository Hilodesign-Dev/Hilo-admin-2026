import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, nextId } from '../../lib/helpers'
import MasterTable from '../../components/MasterTable'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

const ChangeLogViewer = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState('All');
  const [entityFilter, setEntityFilter] = useState('All');
  const [limit, setLimit] = useState(50);

  const fetchLogs = async function() {
    setLoading(true);
    try {
      var query = supa.from('change_log').select('*').order('created_at', { ascending: false }).limit(limit);
      if (userFilter !== 'All') query = query.eq('user_email', userFilter);
      if (entityFilter !== 'All') query = query.eq('entity_type', entityFilter);
      var { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching change log:', err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(function() { fetchLogs(); }, [userFilter, entityFilter, limit]);

  var users = ['All', ...new Set(logs.map(function(l) { return l.user_email; }).filter(Boolean))];
  var entities = ['All', ...new Set(logs.map(function(l) { return l.entity_type; }).filter(Boolean))];

  var actionColors = { create: '#16a34a', update: '#2563eb', delete: '#dc2626', field_update: '#7c3aed', promote_to_catalogue: '#d4a843', master_save: '#6b7280' };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-headline text-lg font-bold" style={{color:'#1b1c1a'}}>Change Log</h2>
        <button onClick={fetchLogs} className="btn-gold px-3 py-1.5 rounded-lg text-xs font-semibold">Refresh</button>
      </div>
      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={userFilter} onChange={function(e) { setUserFilter(e.target.value); }} className="input-ghost text-xs py-1 px-2" style={{borderBottom:'2px solid #d2c5b1'}}>
          {users.map(function(u) { return <option key={u} value={u}>{u === 'All' ? '👤 All Users' : u}</option>; })}
        </select>
        <select value={entityFilter} onChange={function(e) { setEntityFilter(e.target.value); }} className="input-ghost text-xs py-1 px-2" style={{borderBottom:'2px solid #d2c5b1'}}>
          {entities.map(function(e) { return <option key={e} value={e}>{e === 'All' ? '📦 All Entities' : e}</option>; })}
        </select>
        <select value={limit} onChange={function(e) { setLimit(parseInt(e.target.value)); }} className="input-ghost text-xs py-1 px-2" style={{borderBottom:'2px solid #d2c5b1'}}>
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={250}>Last 250</option>
        </select>
      </div>
      {loading ? <div className="text-center py-12 text-gray-500">Loading change log...</div> : logs.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-3xl mb-2">📋</div>
          <div className="font-semibold text-sm" style={{color:'#4e4636'}}>No changes logged yet</div>
          <div className="text-xs mt-1" style={{color:'#807664'}}>User actions will appear here as they happen</div>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
          {logs.map(function(log) {
            var ts = new Date(log.created_at);
            var actionColor = actionColors[log.action] || '#6b7280';
            return (
              <div key={log.id} className="card" style={{padding:'12px 16px',borderLeft:'3px solid ' + actionColor}}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge" style={{background: actionColor + '18', color: actionColor, fontSize:'10px'}}>{(log.action || '').replace(/_/g, ' ').toUpperCase()}</span>
                      <span className="text-xs font-semibold" style={{color:'#1b1c1a'}}>{log.entity_type}</span>
                      {log.entity_name && <span className="text-xs" style={{color:'#4e4636'}}>— {log.entity_name}</span>}
                    </div>
                    {log.details && <div className="text-xs mt-1" style={{color:'#807664',wordBreak:'break-all'}}>{JSON.stringify(log.details).slice(0, 200)}</div>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-semibold" style={{color:'#807664'}}>{ts.toLocaleDateString('en-IN', {month:'short',day:'2-digit'})}</div>
                    <div className="text-xs" style={{color:'#807664'}}>{ts.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
                    <div className="text-xs mt-1" style={{color:'#d4a843'}}>{(log.user_email || '').split('@')[0]}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChangeLogViewer

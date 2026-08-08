import React, { useState, useEffect, useCallback } from 'react';
import { supa } from '../../lib/supabase';
import Icon from '../../components/Icon';
import { _logError } from '../../lib/logger';

const SyncCenter = () => {
  const [runs, setRuns] = useState([]);
  const [latestRuns, setLatestRuns] = useState({ catalogue: null, orders: null, customers: null });
  const [loading, setLoading] = useState(false);
  const [triggeringType, setTriggeringType] = useState(null);
  const [error, setError] = useState(null);

  const fetchSyncData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch 20 most recent sync runs
      const { data: runsData, error: runsErr } = await supa
        .from('sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20);

      if (runsErr) throw runsErr;
      setRuns(runsData || []);

      // 2. Derive latest per type
      const latest = { catalogue: null, orders: null, customers: null };
      const types = ['catalogue', 'orders', 'customers'];
      for (const type of types) {
        const { data: typeData, error: typeErr } = await supa
          .from('sync_runs')
          .select('*')
          .eq('sync_type', type)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!typeErr && typeData) {
          latest[type] = typeData;
        }
      }
      setLatestRuns(latest);
    } catch (err) {
      console.error('[HILO] Failed to fetch sync runs:', err);
      setError(err.message || 'Error loading sync details');
      _logError('sync_center_load', err.message || 'Unknown', err.stack || '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSyncData();
  }, [fetchSyncData]);

  const handleTriggerSync = async (type) => {
    if (triggeringType) return;
    setTriggeringType(type);
    try {
      const functionName = `sync-${type}`;
      const { error: fnErr } = await supa.functions.invoke(functionName, { body: {} });
      if (fnErr) throw fnErr;

      // Small delay to allow the edge function to log its sync run record in DB
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await fetchSyncData();
    } catch (err) {
      alert(`Failed to trigger ${type} sync: ${err.message || err}`);
      _logError(`sync_center_trigger_${type}`, err.message || 'Unknown', err.stack || '');
    } finally {
      setTriggeringType(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'success':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-500/10 text-green-500 border border-green-500/20">Success</span>;
      case 'failed':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-500/10 text-red-500 border border-red-500/20">Failed</span>;
      case 'partial':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">Partial</span>;
      case 'started':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 animate-pulse">Running…</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-500/10 text-gray-500 border border-gray-500/20">{status}</span>;
    }
  };

  const formatDuration = (run) => {
    if (!run.finished_at) return '—';
    const start = new Date(run.started_at);
    const finish = new Date(run.finished_at);
    const ms = finish.getTime() - start.getTime();
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="fade-in p-4 sm:p-8 min-h-screen" style={{ color: '#1e293b' }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 style={{ fontFamily: 'Manrope,sans-serif', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#0f172a', lineHeight: 1.1, marginBottom: 4 }} className="sm:text-3xl">
            Sync Center
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>Manage and monitor catalogue, orders, and customer synchronization with Shopify</p>
        </div>
        <button
          onClick={fetchSyncData}
          disabled={loading || triggeringType !== null}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border bg-white shadow-sm hover:bg-slate-50 transition-all text-slate-700 disabled:opacity-50"
        >
          <span className={loading ? 'animate-spin' : ''}>🔄</span> Refresh Status
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Sync Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {['catalogue', 'orders', 'customers'].map((type) => {
          const run = latestRuns[type];
          const isTriggering = triggeringType === type;
          const cardLabels = {
            catalogue: { title: 'Product Catalogue', desc: 'Shopify products & variants', emoji: '🛍️' },
            orders: { title: 'Sales Orders', desc: 'App purchases handoff to Shopify', emoji: '📥' },
            customers: { title: 'Customer Profiles', desc: 'Addresses & OTP identities', emoji: '👥' },
          };
          const info = cardLabels[type];

          return (
            <div key={type} className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{info.emoji}</span>
                    <span className="font-bold text-slate-800 text-base">{info.title}</span>
                  </div>
                  {run ? getStatusBadge(run.status) : <span className="text-xs text-slate-400 italic">No runs</span>}
                </div>
                <p className="text-xs text-slate-500 mb-6">{info.desc}</p>

                {run && (
                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Last Synced:</span>
                      <span className="font-medium text-slate-700">
                        {new Date(run.started_at).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Records Copied:</span>
                      <span className="font-semibold text-slate-700">{run.records_upserted}</span>
                    </div>
                    {run.records_failed > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-red-400">Failed Records:</span>
                        <span className="font-semibold text-red-500">{run.records_failed}</span>
                      </div>
                    )}
                    {run.lag_seconds != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Sync Lag:</span>
                        <span className="font-medium text-slate-700">{run.lag_seconds}s</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleTriggerSync(type)}
                disabled={triggeringType !== null || loading}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 text-xs font-bold rounded-lg transition-all text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
              >
                {isTriggering ? (
                  <>
                    <span className="animate-spin">🔄</span> Syncing…
                  </>
                ) : (
                  `Sync ${type === 'catalogue' ? 'Catalogue' : type === 'orders' ? 'Orders' : 'Customers'}`
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Sync Log Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-lg">Sync Activity Logs (Recent 20)</h2>
          <a
            href="/docs/10-SYNC-CONFLICT-RULES.md"
            target="_blank"
            className="text-xs font-semibold hover:underline"
            style={{ color: '#c9a432' }}
          >
            Conflict Resolution Rules ↗
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Sync Type</th>
                <th className="px-6 py-4">Source</th>
                <th className="px-6 py-4">Started At</th>
                <th className="px-6 py-4">Duration</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Upserted / Failed</th>
                <th className="px-6 py-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-slate-400 italic">
                    {loading ? 'Fetching activity records…' : 'No sync run records available.'}
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-all text-slate-700">
                    <td className="px-6 py-4 font-semibold capitalize text-slate-800">{r.sync_type}</td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-500 capitalize">{r.source || 'edge'}</td>
                    <td className="px-6 py-4 text-xs">
                      {new Date(r.started_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4 text-xs">{formatDuration(r)}</td>
                    <td className="px-6 py-4">{getStatusBadge(r.status)}</td>
                    <td className="px-6 py-4 text-xs font-semibold">
                      <span className="text-green-600">{r.records_upserted}</span>
                      <span className="text-slate-300 mx-1">/</span>
                      <span className={r.records_failed > 0 ? 'text-red-500' : 'text-slate-400'}>{r.records_failed}</span>
                    </td>
                    <td className="px-6 py-4 text-xs max-w-xs truncate text-slate-500" title={r.error || r.message || ''}>
                      {r.error ? <span className="text-red-500 font-medium">{r.error}</span> : r.message || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SyncCenter;

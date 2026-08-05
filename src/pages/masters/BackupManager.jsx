import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, nextId } from '../../lib/helpers'
import MasterTable from '../../components/MasterTable'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

const BackupManager = () => {
  const [label,          setLabel]          = useState('');
  const [status,         setStatus]         = useState(''); // '' | 'saving' | 'done' | 'error:...'
  const [snapshots,      setSnapshots]      = useState([]);
  const [loadingSnaps,   setLoadingSnaps]   = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(null);
  const [restoring,      setRestoring]      = useState(null);

  const loadSnapshots = async () => {
    setLoadingSnaps(true);
    try {
      const [{ data: asRows }, { data: cgRows }, { data: dpRows }] = await Promise.all([
        supa.from('app_state_snapshots').select('label, created_at').order('created_at', { ascending: false }),
        supa.from('cogs_snapshots').select('label, created_at').order('created_at', { ascending: false }),
        supa.from('design_products_snapshots').select('label, captured_at').order('captured_at', { ascending: false }),
      ]);
      // Group by label client-side
      const map = {};
      (asRows || []).forEach(r => {
        if (!map[r.label]) map[r.label] = { label: r.label, created_at: r.created_at, app_keys: 0, cogs_items: 0, products: 0 };
        map[r.label].app_keys++;
      });
      (cgRows || []).forEach(r => {
        if (!map[r.label]) map[r.label] = { label: r.label, created_at: r.created_at, app_keys: 0, cogs_items: 0, products: 0 };
        map[r.label].cogs_items++;
      });
      (dpRows || []).forEach(r => {
        if (!map[r.label]) map[r.label] = { label: r.label, created_at: r.captured_at, app_keys: 0, cogs_items: 0, products: 0 };
        if (!map[r.label].products) map[r.label].products = 0;
        map[r.label].products++;
      });
      setSnapshots(Object.values(map).sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (e) {
      _logError('backup', e.message, e.stack || '');
      console.error('loadSnapshots', e);
    }
    setLoadingSnaps(false);
  };

  useEffect(() => { loadSnapshots(); }, []);

  const takeSnapshot = async () => {
    const lbl = label.trim();
    if (!lbl) return;
    setStatus('saving');
    try {
      // 1. Read all app_state rows
      const { data: appState, error: e1 } = await supa.from('app_state').select('key, value');
      if (e1) throw e1;

      // 2. Insert into app_state_snapshots
      if ((appState || []).length > 0) {
        const { error: e2 } = await supa.from('app_state_snapshots')
          .insert(appState.map(r => ({ key: r.key, value: r.value, label: lbl })));
        if (e2) throw e2;
      }

      // 3. Read all COGS entries that have been entered (non-empty)
      const { data: lineItems, error: e3 } = await supa
        .from('order_line_items')
        .select('id, order_id, sku, title, cogs_fabric, cogs_dye, cogs_embroidery, cogs_stitching, cogs_accessories, cogs_other, cogs_notes, cogs_source, fabric_id, fabric_name, metres, cost_per_metre, dye_id, dye_per_metre')
        .not('cogs_source', 'is', null)
        .neq('cogs_source', 'empty');
      if (e3) throw e3;

      // 4. Insert into cogs_snapshots
      if ((lineItems || []).length > 0) {
        const { error: e4 } = await supa.from('cogs_snapshots')
          .insert(lineItems.map(li => ({
            line_item_id:     li.id,
            order_id:         li.order_id,
            sku:              li.sku,
            title:            li.title,
            cogs_fabric:      li.cogs_fabric,
            cogs_dye:         li.cogs_dye,
            cogs_embroidery:  li.cogs_embroidery,
            cogs_stitching:   li.cogs_stitching,
            cogs_accessories: li.cogs_accessories,
            cogs_other:       li.cogs_other,
            cogs_notes:       li.cogs_notes,
            cogs_source:      li.cogs_source,
            fabric_id:        li.fabric_id,
            fabric_name:      li.fabric_name,
            metres:           li.metres,
            cost_per_metre:   li.cost_per_metre,
            dye_id:           li.dye_id,
            dye_per_metre:    li.dye_per_metre,
            label:            lbl,
          })));
        if (e4) throw e4;
      }

      // 5. Snapshot all active design_products rows as jsonb payloads
      //    (full schema, future-proof against column drift).
      const { data: dpRows, error: e5 } = await supa
        .from('design_products')
        .select('*')
        .is('deleted_at', null);
      if (e5) throw e5;
      if ((dpRows || []).length > 0) {
        const BATCH = 200;
        for (let i = 0; i < dpRows.length; i += BATCH) {
          const slice = dpRows.slice(i, i + BATCH).map(r => ({
            label:     lbl,
            source_id: String(r.id),
            row:       r,
          }));
          const { error: e6 } = await supa.from('design_products_snapshots').insert(slice);
          if (e6) throw e6;
        }
      }

      setStatus('done');
      setLabel('');
      await loadSnapshots();
      setTimeout(() => setStatus(''), 3000);
    } catch (e) {
      _logError('backup', e.message, e.stack || '');
      console.error('Snapshot error', e);
      setStatus('error:' + (e.message || 'Unknown error'));
    }
  };

  const restoreMasters = async (snapLabel) => {
    setRestoring(snapLabel);
    try {
      const { data: rows, error } = await supa
        .from('app_state_snapshots')
        .select('key, value')
        .eq('label', snapLabel);
      if (error) throw error;
      for (const row of (rows || [])) {
        await supa.from('app_state').upsert({ key: row.key, value: row.value }, { onConflict: 'key' });
      }
      setRestoring(null);
      setConfirmRestore(null);
      alert(`✓ Masters restored from "${snapLabel}"\n\nReload the page to load the restored data.`);
    } catch (e) {
      _logError('backup', e.message, e.stack || '');
      console.error('Restore error', e);
      setRestoring(null);
      alert('Restore failed: ' + e.message);
    }
  };

  const deleteSnapshot = async (snapLabel) => {
    if (!confirm(`Delete snapshot "${snapLabel}"? This cannot be undone.`)) return;
    await Promise.all([
      supa.from('app_state_snapshots').delete().eq('label', snapLabel),
      supa.from('cogs_snapshots').delete().eq('label', snapLabel),
      supa.from('design_products_snapshots').delete().eq('label', snapLabel),
    ]);
    await loadSnapshots();
  };

  const fmtDate = (iso) => new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Take Snapshot */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
        <div className="text-sm font-semibold text-gray-800">Take a Snapshot</div>
        <div className="text-xs text-gray-500 leading-relaxed">
          Saves all masters (fabrics, dyes, stitching, categories, channels, product catalogue)
          and all manually-entered COGS data into backup tables. Use before any reset or bulk change.
        </div>
        <div className="flex gap-2">
          <input value={label} onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && takeSnapshot()}
            placeholder="Label — e.g. pre-march-reset, before-fabric-reprice"
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
          <button onClick={takeSnapshot} disabled={!label.trim() || status === 'saving'}
            className="btn-gold px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 whitespace-nowrap">
            {status === 'saving' ? 'Saving…' : '💾 Snapshot'}
          </button>
        </div>
        {status === 'done'         && <div className="text-xs text-green-600 font-medium">✓ Snapshot saved successfully</div>}
        {status.startsWith('error') && <div className="text-xs text-red-500">{status.replace('error:', '')}</div>}
      </div>

      {/* Snapshot List */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-gray-800">Snapshots</div>
          <button onClick={loadSnapshots} className="text-xs text-indigo-500 hover:underline">↺ Refresh</button>
        </div>
        {loadingSnaps && <div className="text-xs text-gray-400 py-2">Loading…</div>}
        {!loadingSnaps && snapshots.length === 0 && (
          <div className="text-xs text-gray-400 py-2">No snapshots yet — take your first one above.</div>
        )}
        <div className="divide-y divide-gray-100">
          {snapshots.map(snap => (
            <div key={snap.label} className="py-3 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-semibold text-gray-800">{snap.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {fmtDate(snap.created_at)}
                    {' · '}
                    <span className="text-indigo-500">{snap.app_keys} master keys</span>
                    {' · '}
                    <span className="text-amber-600">{snap.cogs_items} COGS entries</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {confirmRestore === snap.label ? (
                    <>
                      <span className="text-xs text-red-500 self-center font-medium">Overwrite current masters?</span>
                      <button onClick={() => restoreMasters(snap.label)} disabled={restoring === snap.label}
                        className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-medium hover:bg-red-100 disabled:opacity-50">
                        {restoring === snap.label ? 'Restoring…' : 'Yes, restore'}
                      </button>
                      <button onClick={() => setConfirmRestore(null)}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setConfirmRestore(snap.label)}
                        className="px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 text-xs font-medium hover:bg-indigo-50">
                        ↩ Restore Masters
                      </button>
                      <button onClick={() => deleteSnapshot(snap.label)}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-400 hover:text-red-500 hover:border-red-200 transition-colors">
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-400 leading-relaxed px-1">
        <b>Note:</b> "Restore Masters" writes master data back to the live app_state table.
        COGS snapshots are stored for reference — to restore individual COGS entries,
        use the Supabase dashboard to query <code className="bg-gray-100 px-1 rounded">cogs_snapshots</code> by label.
      </div>
    </div>
  );
};

// ─── Fabric Management Module ──────────────────────────────────────────────────

export default BackupManager

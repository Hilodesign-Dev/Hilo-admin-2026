import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, nextId } from '../../lib/helpers'
import MasterTable from '../../components/MasterTable'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

const ErrorLogViewer = () => {
  const [logs, setLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hl_error_log') || '[]'); } catch { return []; }
  });
  const clear = () => { localStorage.removeItem('hl_error_log'); setLogs([]); };
  if (logs.length === 0) return (
    <div className="bg-white rounded-xl p-10 text-center shadow-sm">
      <div className="text-4xl mb-3">✅</div>
      <div className="font-semibold text-gray-700">No errors logged</div>
      <div className="text-sm text-gray-400 mt-1">Errors from white screens, JS crashes, and promise failures appear here.</div>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700">{logs.length} error{logs.length !== 1 ? 's' : ''} logged</div>
        <button onClick={clear} className="text-xs text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50">Clear all</button>
      </div>
      {logs.map((e, i) => (
        <div key={i} className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-red-300 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge text-xs bg-red-50 text-red-700">{e.type}</span>
            <span className="text-xs text-gray-400">{new Date(e.ts).toLocaleString('en-IN')}</span>
          </div>
          <div className="text-sm font-medium text-gray-800">{e.msg}</div>
          {e.detail && (
            <details>
              <summary className="text-xs text-gray-400 cursor-pointer">Stack trace</summary>
              <pre className="text-xs text-gray-500 mt-1 whitespace-pre-wrap break-all bg-gray-50 rounded p-2">{e.detail}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Backup Manager ───────────────────────────────────────────────────────────

export default ErrorLogViewer

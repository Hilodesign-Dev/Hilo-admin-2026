import React, { useState, useEffect } from 'react'
import { save } from '../lib/storage'

const Toaster = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    // Handler for hilo-toast events (from toast() helper)
    const hiloHandler = (e) => {
      const { ok, msg } = e.detail || {};
      const id = Date.now() + Math.random();
      setToasts(prev => {
        // Keep max 5 toasts, replace stale success toasts
        const base = ok ? prev.filter(t => !t.ok) : prev;
        return [...base.slice(-4), { id, ok, msg: msg || (ok ? 'Done' : 'Something went wrong') }];
      });
      // Auto-dismiss success toasts after 3s, errors after 6s
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), ok ? 3000 : 6000);
    };

    // Handler for legacy hl-save events (from storage.js save())
    const legacyHandler = (e) => {
      const { ok, key, val } = e.detail || {};
      const id = Date.now() + Math.random();
      setToasts(prev => {
        const base = ok ? prev.filter(t => !t.ok) : prev;
        return [...base.slice(-4), { id, ok, msg: ok ? 'Saved to Supabase' : 'Save failed', key, val }];
      });
      if (ok) setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500);
    };

    window.addEventListener('hilo-toast', hiloHandler);
    window.addEventListener('hl-save', legacyHandler);
    return () => {
      window.removeEventListener('hilo-toast', hiloHandler);
      window.removeEventListener('hl-save', legacyHandler);
    };
  }, []);

  const dismiss = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const retry = (toast) => {
    dismiss(toast.id);
    if (toast.key && toast.val) save(toast.key, toast.val);
  };

  if (!toasts.length) return null;
  return (
    <div
      className="fixed top-5 right-5 sm:top-6 sm:right-6 flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none"
      style={{ zIndex: 999999 }}
    >
      {toasts.map(t => (
        <div key={t.id}
          className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl shadow-2xl text-sm font-medium transition-all animate-fade-in border ${
            t.ok
              ? 'bg-emerald-600 border-emerald-500 text-white shadow-emerald-950/25'
              : 'bg-red-600 border-red-500 text-white shadow-red-950/35'
          }`}
          style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
          {t.ok ? (
            <>
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              <span className="flex-1 leading-snug">{t.msg}</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <div className="flex-1 leading-snug">
                <div className="font-bold text-xs uppercase tracking-wider text-red-100 mb-0.5">Notification Alert</div>
                <div>{t.msg}</div>
              </div>
              {t.key && <button onClick={() => retry(t)} className="ml-1 underline text-white/90 hover:text-white text-xs font-semibold">Retry</button>}
              <button onClick={() => dismiss(t.id)} className="ml-1 text-white/70 hover:text-white flex-shrink-0 p-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

export default Toaster

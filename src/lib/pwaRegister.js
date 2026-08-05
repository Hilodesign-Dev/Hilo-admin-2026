// PWA service-worker registration with a non-blocking "update available" toast.
//
// vite-plugin-pwa generates a virtual module 'virtual:pwa-register' that
// exposes registerSW(). We listen for onNeedRefresh — fired when a new SW
// has finished installing and is waiting to activate — and surface a small
// toast in the corner. Tap it (or wait 30 s) and we reload.
//
// Without this, the SW config (clientsClaim + skipWaiting) only ensures
// the new SW takes over future fetches; the React app still renders from
// the *already loaded* old bundle until the page refreshes. End result:
// users keep seeing stale UI after every deploy. This wires the missing
// piece.

import { registerSW } from 'virtual:pwa-register'

function showUpdateToast(onAccept) {
  if (typeof document === 'undefined') return
  if (document.getElementById('pwa-update-toast')) return

  const wrap = document.createElement('div')
  wrap.id = 'pwa-update-toast'
  wrap.setAttribute('role', 'status')
  wrap.style.cssText = [
    'position:fixed',
    'bottom:20px',
    'right:20px',
    'z-index:99999',
    'background:#1b1c1a',
    'color:#faf9f5',
    'font-family:Manrope,system-ui,-apple-system,sans-serif',
    'font-size:13px',
    'font-weight:600',
    'padding:12px 18px',
    'border-radius:12px',
    'box-shadow:0 10px 30px rgba(0,0,0,0.25)',
    'display:flex',
    'align-items:center',
    'gap:14px',
    'cursor:default',
    'animation:hilo-toast-in 0.3s ease-out',
  ].join(';')

  const label = document.createElement('span')
  label.textContent = 'New version available'

  const btn = document.createElement('button')
  btn.textContent = 'Reload'
  btn.style.cssText = [
    'background:#c9a432',
    'color:#1b1c1a',
    'border:none',
    'padding:6px 14px',
    'border-radius:8px',
    'font-weight:700',
    'font-size:12px',
    'letter-spacing:0.04em',
    'text-transform:uppercase',
    'cursor:pointer',
  ].join(';')
  btn.onclick = onAccept

  const dismiss = document.createElement('button')
  dismiss.textContent = '×'
  dismiss.title = 'Dismiss'
  dismiss.style.cssText = [
    'background:transparent',
    'color:#9ca3af',
    'border:none',
    'font-size:18px',
    'line-height:1',
    'cursor:pointer',
    'padding:0 4px',
  ].join(';')
  dismiss.onclick = () => wrap.remove()

  const styleTag = document.createElement('style')
  styleTag.textContent = '@keyframes hilo-toast-in { from { opacity:0; transform: translateY(8px) } to { opacity:1; transform: translateY(0) } }'
  document.head.appendChild(styleTag)

  wrap.appendChild(label)
  wrap.appendChild(btn)
  wrap.appendChild(dismiss)
  document.body.appendChild(wrap)

  // Safety net: if the user ignores the toast for 30 s we reload for them.
  // PWA installs (homescreen icons) almost always benefit from this — the
  // operator left the tab open and a deploy went out; we don't want them
  // hitting bugs that were fixed an hour ago.
  setTimeout(() => {
    if (document.getElementById('pwa-update-toast')) onAccept()
  }, 30_000)
}

export function setupPwaAutoUpdate() {
  if (typeof window === 'undefined') return
  // Only register in production-style builds. Dev server doesn't ship a SW.
  if (!('serviceWorker' in navigator)) return

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      showUpdateToast(() => updateSW(true))
    },
    onOfflineReady() {
      // Optional: surface a 'Ready offline' note. We skip it to avoid noise.
    },
    onRegisterError(err) {
      // Swallow — SW failure shouldn't break the app
      console.warn('[pwa] SW register failed:', err?.message || err)
    },
  })
}

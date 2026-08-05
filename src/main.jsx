import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './pages/App'
import PublicReceipt from './pages/pos/PublicReceipt'
import FranchisePublic from './pages/public/FranchisePublic'
import FabricPublic from './pages/public/FabricPublic'
import SkuPublic from './pages/public/SkuPublic'
import ApplyPublic from './pages/public/ApplyPublic'
import ErrorBoundary from './components/ErrorBoundary'
import { _logError } from './lib/logger'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import './index.css'
import { setupPwaAutoUpdate } from './lib/pwaRegister'

// Wire the service-worker update prompt as early as possible — it surfaces a
// 'New version available · Reload' toast whenever a new build finishes
// installing, and auto-reloads after 30 s.
setupPwaAutoUpdate()

// Initialize window globals (global error handlers are registered in logger.js)
if (typeof window !== 'undefined') {
  window._currentUserEmail = ''
  window._currentUserName = ''
}

// Tiny hash-based router for anon-accessible pages.
// Anything matching #/r/<token> renders the public receipt outside the App shell
// (no auth gate, no sidebar, no admin chrome). Everything else falls through to App.
const PublicRouteOrApp = () => {
  const [hash, setHash] = React.useState(typeof window !== 'undefined' ? window.location.hash : '')
  React.useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const matchR = hash.match(/^#\/r\/([A-Za-z0-9-_]+)/)
  if (matchR) return <PublicReceipt token={matchR[1]} />
  const matchF = hash.match(/^#\/f\/([A-Za-z0-9-_]+)/)
  if (matchF) return <FranchisePublic token={matchF[1]} />
  const matchFab = hash.match(/^#\/fabric\/([A-Za-z0-9-_]+)/)
  if (matchFab) return <FabricPublic id={matchFab[1]} />
  const matchSku = hash.match(/^#\/sku\/(.+)$/)
  if (matchSku) return <SkuPublic code={decodeURIComponent(matchSku[1])} />
  if (/^#\/apply\b/.test(hash) || /^#\/careers\b/.test(hash)) return <ApplyPublic />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <PublicRouteOrApp />
    <Analytics />
    <SpeedInsights />
  </ErrorBoundary>
)

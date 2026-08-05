import React, { useState } from 'react'
import Catalogue from './Catalogue'
import Offers from '../offers/Offers'
import Dashboard from '../Dashboard'

/**
 * CatalogueShell — wraps the Catalogue with two extra sub-tabs (Offers, Dashboard).
 *
 * Replaces three standalone top-level tabs ('catalogue', 'offers', 'dashboard')
 * with a single 'catalogue' super-tab. Each child keeps its own internal state
 * because the inactive ones are kept mounted with display:none (same keep-alive
 * pattern used in App.jsx for the top-level tab grid).
 *
 * window._catalogueInitialView lets the legacy hash router pre-select Offers or
 * Dashboard when arriving from #/offers or #/dashboard.
 */
const SUB_TABS = [
  { key: 'catalog',   label: 'Catalog' },
  { key: 'offers',    label: 'Offers' },
  { key: 'dashboard', label: 'Dashboard' },
]

const CatalogueShell = (props) => {
  const [view, setView] = useState(() => {
    if (typeof window !== 'undefined' && window._catalogueInitialView) {
      const v = window._catalogueInitialView
      window._catalogueInitialView = null
      return v
    }
    return 'catalog'
  })

  // Offers count for badge — falls back to length of products with active offer
  const offerCount = (props.products || []).filter(p => p?.offer?.active).length

  const goToOffers = () => setView('offers')

  return (
    <div>
      {/* Sub-tab bar — sticky just below the app header */}
      <div className="sticky top-0 z-30 px-4 sm:px-6 pt-3 pb-2 flex gap-1 overflow-x-auto scrollbar-none"
        style={{ background: '#fff', borderBottom: '1px solid #ebe7df' }}>
        {SUB_TABS.map(t => {
          const active = view === t.key
          return (
            <button key={t.key} onClick={() => setView(t.key)}
              className="px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition-all"
              style={{
                background: active ? '#c9a432' : 'transparent',
                color: active ? '#fff' : '#6b7280',
                border: active ? 'none' : '1px solid #ebe7df',
              }}>
              {t.label}
              {t.key === 'offers' && offerCount > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                  style={{ background: active ? 'rgba(255,255,255,0.25)' : '#fef3c7', color: active ? '#fff' : '#795900' }}>
                  {offerCount}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Keep-alive mounting — same pattern as App.jsx for the outer grid */}
      <div style={{ display: view === 'catalog' ? '' : 'none' }}>
        <Catalogue {...props} onGoToOffers={goToOffers} />
      </div>
      <div style={{ display: view === 'offers' ? '' : 'none' }}>
        <Offers {...props} />
      </div>
      <div style={{ display: view === 'dashboard' ? '' : 'none' }}>
        <Dashboard products={props.products} />
      </div>
    </div>
  )
}

export default CatalogueShell

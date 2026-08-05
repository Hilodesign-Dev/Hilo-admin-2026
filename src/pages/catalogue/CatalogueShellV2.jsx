import React, { useState } from 'react'
import CatalogueV2 from './CatalogueV2'
import Offers from '../offers/Offers'
import Dashboard from '../Dashboard'
import AnalyticsTab from './analytics/AnalyticsTab'
import CatalogInsights from './analytics/CatalogInsights'

/*
 * CatalogueShellV2 — V2 wrapper that mirrors CatalogueShell's sub-tab layout
 * (Catalog / Offers / Dashboard) but swaps in CatalogueV2 for the Catalog
 * sub-tab. Offers + Dashboard keep their legacy data path (design_products
 * via fetchAllProducts) so we can ship V2 incrementally.
 *
 * Spec §3 — three-level model is fully realised in CatalogueV2.
 */

const SUB_TABS = [
  { key: 'catalog',   label: 'Catalog v2' },
  { key: 'analytics', label: 'Analytics ⭐' },
  { key: 'insights',  label: 'Insights ⭐' },
  { key: 'offers',    label: 'Offers' },
  { key: 'dashboard', label: 'Dashboard' },
]

const CatalogueShellV2 = (props) => {
  const [view, setView] = useState(() => {
    if (typeof window !== 'undefined' && window._catalogueInitialView) {
      const v = window._catalogueInitialView
      window._catalogueInitialView = null
      return v
    }
    return 'catalog'
  })

  const offerCount = (props.products || []).filter(p => p?.offer?.active).length
  const goToOffers = () => setView('offers')

  return (
    <div>
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
        <div className="ml-auto flex items-center">
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: '#fef3c7', color: '#92400e' }}>
            V2 preview · ?v2=0 to switch back
          </span>
        </div>
      </div>

      <div style={{ display: view === 'catalog' ? '' : 'none' }}>
        <CatalogueV2 {...props} onGoToOffers={goToOffers} />
      </div>
      <div style={{ display: view === 'analytics' ? '' : 'none' }}>
        {view === 'analytics' && <AnalyticsTab />}
      </div>
      <div style={{ display: view === 'insights' ? '' : 'none' }}>
        {view === 'insights' && <CatalogInsights />}
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

export default CatalogueShellV2

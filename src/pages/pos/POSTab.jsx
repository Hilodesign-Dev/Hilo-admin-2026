import React, { useState, useEffect, useMemo } from 'react'
import { useOrders } from '../../context/OrdersContext'
import { POS_VIEWS } from './constants'
import { POS_T, MIcon } from './tokens'
import POSTopBar from './POSTopBar'
import POSNewOrder from './POSNewOrder'
import MarketplaceOrderWizard from './MarketplaceOrderWizard'
import POSQuotations from './POSQuotations'
import POSDues from './POSDues'
import MarketplacesSettings from './MarketplacesSettings'
import MarketplaceDues from './MarketplaceDues'
import OrdersTab from '../orders/OrdersTab'
import POSOrdersHub from './POSOrdersHub'
import Calculator from '../calculator/Calculator'
import { useStores } from './useStores'

const VIEW_META = {
  new_order:   { icon: 'add_shopping_cart', label: 'New Order' },
  marketplace: { icon: 'storefront',         label: 'Marketplace Order' },
  calculator: { icon: 'calculate',         label: 'Price Calculator' },
  orders:     { icon: 'receipt',           label: 'Orders' },
  quotations: { icon: 'receipt_long',      label: 'Quotations' },
  dues:       { icon: 'account_balance',   label: 'Dues & Ledger' },
  marketplaces: { icon: 'storefront',      label: 'Marketplaces' },
  mp_dues:     { icon: 'account_balance',   label: 'Marketplace Dues' },
}

const POSTab = ({ user, products, fabrics, stitchingMaster, dyes, categories, consumption, channels }) => {
  const ctx = useOrders()
  const [view, setView] = useState(() => {
    if (typeof window !== 'undefined' && window._posInitialView) {
      const v = window._posInitialView
      window._posInitialView = null
      return v
    }
    return 'new_order'
  })

  const me = useMemo(() => (ctx.teamMembers || []).find(m => m.user_id === user?.id), [ctx.teamMembers, user?.id])

  const [stylist, setStylist] = useState(null)
  const [store, setStore] = useState(null)  // full store row from useStores
  const [mode, setMode] = useState('in_store')

  // Load the active stores list for child components (POSNewOrder auto-narrow).
  // POSTopBar runs its own useStores() for its dropdown; this second instance
  // is intentional — both subscribe to the same data and stay in sync.
  const { stores } = useStores()

  useEffect(() => {
    if (me && !stylist) {
      setStylist(me)
      // store will be auto-resolved by POSTopBar once useStores loads
      // (matched on me.store_id, falling back to me.assigned_store name).
    }
  }, [me, stylist])

  if (!ctx.teamMembers || ctx.teamMembers.length === 0) {
    return (
      <div className="p-6 flex items-center gap-3" style={{ background: POS_T.background, minHeight: '100vh' }}>
        <div className="inline-block w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: `${POS_T.primaryContainer} transparent ${POS_T.primaryContainer} ${POS_T.primaryContainer}` }} />
        <span className="text-sm" style={{ color: POS_T.onSurfaceVariant }}>Loading team…</span>
      </div>
    )
  }

  if (!me) {
    return (
      <div className="p-6 max-w-xl" style={{ background: POS_T.background, minHeight: '100vh' }}>
        <div className="p-4 rounded-xl flex gap-3" style={{ background: POS_T.errorContainer, color: POS_T.onErrorContainer }}>
          <MIcon name="error" size={20} />
          <div>
            <div className="font-bold mb-1">No team member record</div>
            <div className="text-sm">Your account isn't linked to a team_members row, so POS mode is unavailable. Ask an admin to add you in the Users tab.</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: POS_T.background, minHeight: '100vh', fontFamily: 'Manrope, sans-serif' }}>
      <POSTopBar
        stylist={stylist} onChangeStylist={setStylist}
        store={store} onChangeStore={setStore}
        mode={mode} onChangeMode={setMode}
        teamMembers={ctx.teamMembers}
      />

      {/* Sub-view tabs */}
      <div className="px-4 sm:px-6 lg:px-8 flex gap-1 overflow-x-auto scrollbar-none"
        style={{ background: POS_T.surfaceContainerLowest, borderBottom: `1px solid ${POS_T.outlineVariant}`, scrollbarWidth: 'none' }}>
        {POS_VIEWS.map(v => {
          const m = VIEW_META[v.key]
          const active = view === v.key
          return (
            <button key={v.key} onClick={() => setView(v.key)}
              className="px-3 sm:px-4 py-3 inline-flex items-center gap-2 whitespace-nowrap transition-colors"
              style={{
                borderBottom: `2px solid ${active ? POS_T.primaryContainer : 'transparent'}`,
                color: active ? POS_T.primary : POS_T.onSurfaceVariant,
              }}>
              <MIcon name={m?.icon || 'circle'} size={18} fill={active} />
              <span className="text-sm font-bold tracking-wide">{m?.label || v.label}</span>
            </button>
          )
        })}
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24">
        {view === 'new_order'  && <POSNewOrder stitchingMaster={stitchingMaster} stylist={stylist} store={store} mode={mode} products={products} teamMembers={ctx.teamMembers} stores={stores} onChangeStore={setStore} />}
        {view === 'marketplace' && <MarketplaceOrderWizard stitchingMaster={stitchingMaster} products={products} teamMembers={ctx.teamMembers} actingUser={stylist} />}
        {view === 'calculator' && <Calculator fabrics={fabrics} stitching={stitchingMaster} dyes={dyes} categories={categories} consumption={consumption} products={products} />}
        {view === 'orders'     && <POSOrdersHub user={user} products={products} stitchingMaster={stitchingMaster} fabrics={fabrics} stitching={stitchingMaster} dyes={dyes} categories={categories} consumption={consumption} channels={channels} />}
        {view === 'quotations' && <POSQuotations stylist={stylist} store={store} mode={mode} products={products} teamMembers={ctx.teamMembers} fabrics={fabrics} stitchingMaster={stitchingMaster} />}
        {view === 'dues'       && <POSDues stylist={stylist} store={store} user={user} teamMembers={ctx.teamMembers} />}
        {view === 'marketplaces' && <MarketplacesSettings />}
        {view === 'mp_dues' && <MarketplaceDues />}
      </div>
    </div>
  )
}

export default POSTab

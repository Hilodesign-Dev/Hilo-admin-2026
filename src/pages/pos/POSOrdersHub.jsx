import React, { useState } from 'react'
import OrdersTab from '../orders/OrdersTab'
import GrowthView from '../growth/GrowthView'
import { POS_T } from './tokens'

/* POSOrdersHub — wraps the existing Orders list with Attribution + Analytics
   sub-tabs. Reuses GrowthView in embedded mode so we don't fork analytics
   logic. OrdersTab is kept-alive via display:none. GrowthView is mounted
   only for the active sub-tab (Attribution OR Analytics) using a key prop,
   so switching between the two re-initialises the inner GrowthView tab. */

const SUB_TABS = [
  { key: 'orders',      label: 'Orders' },
  { key: 'attribution', label: 'Attribution' },
  { key: 'analytics',   label: 'Analytics' },
]

const POSOrdersHub = ({
  user, products, stitchingMaster,
  fabrics, stitching, dyes, categories, consumption, channels,
}) => {
  const [sub, setSub] = useState('orders')

  return (
    <div>
      <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-none">
        {SUB_TABS.map(t => {
          const active = sub === t.key
          return (
            <button key={t.key} onClick={() => setSub(t.key)}
              className="px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all"
              style={{
                background: active ? POS_T.primaryContainer : 'transparent',
                color:      active ? POS_T.onPrimary : POS_T.onSurfaceVariant,
                border:     active ? 'none' : `1px solid ${POS_T.outlineVariant}`,
              }}>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Orders — keep-alive */}
      <div style={{ display: sub === 'orders' ? '' : 'none' }}>
        <OrdersTab user={user} products={products} stitchingMaster={stitchingMaster} />
      </div>

      {/* Attribution / Analytics — single GrowthView mount, remounted on sub change */}
      {(sub === 'attribution' || sub === 'analytics') && (
        <GrowthView
          key={sub}
          embedded
          initialTab={sub}
          user={user}
          fabrics={fabrics}
          stitching={stitching || stitchingMaster}
          dyes={dyes}
          categories={categories}
          consumption={consumption}
          products={products}
          channels={channels}
        />
      )}
    </div>
  )
}

export default POSOrdersHub

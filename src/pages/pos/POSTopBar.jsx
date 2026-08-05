import React from 'react'
import { filterStylists } from '../../lib/helpers'
import { useStores } from './useStores'
import { POS_T, MIcon } from './tokens'

/**
 * Persistent POS header — Stitch design language.
 *
 *   - HILO wordmark + POS sub-label
 *   - Store dropdown (compact on mobile)
 *   - Mode toggle (In-Store / Online Assist) — pill switch
 *   - Stylist switcher (avatar + name on desktop, just avatar on mobile)
 *
 * Sub-tab nav lives in POSTab and uses these same tokens.
 */
const POSTopBar = ({ stylist, onChangeStylist, store, onChangeStore, mode, onChangeMode, teamMembers }) => {
  const { stores: dbStores } = useStores()

  // Auto-resolve initial store from logged-in stylist when nothing's selected
  React.useEffect(() => {
    if (store || !stylist || dbStores.length === 0) return
    const byId   = dbStores.find(s => s.id === stylist.store_id)
    const byName = dbStores.find(s => s.name === stylist.assigned_store)
    const guess  = byId || byName
    if (guess) onChangeStore(guess)
  }, [stylist, dbStores]) // eslint-disable-line react-hooks/exhaustive-deps
  const stylistOptions = filterStylists(teamMembers || [])
  const list = stylist && !stylistOptions.find(t => t.id === stylist.id)
    ? [stylist, ...stylistOptions]
    : stylistOptions

  const initial = (stylist?.name || '?').charAt(0).toUpperCase()

  return (
    <nav
      className="sticky top-0 z-30 flex flex-col gap-3 px-4 sm:px-6 lg:px-8 py-3"
      style={{
        background: POS_T.surface,
        borderBottom: `1px solid ${POS_T.outlineVariant}`,
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Brand */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-extrabold tracking-[0.2em] text-lg leading-none" style={{ color: POS_T.primaryContainer }}>
              HILO
            </span>
            <span className="font-bold text-xs tracking-[0.18em] uppercase" style={{ color: POS_T.onSurfaceVariant }}>
              POS
            </span>
          </div>
        </div>

        {/* Right cluster (always visible) */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          {/* Store picker */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
            <MIcon name="storefront" size={18} style={{ color: POS_T.onSurfaceVariant }} />
            <select value={(store && store.id) || ''}
              onChange={e => {
                const id = e.target.value
                onChangeStore(id ? (dbStores.find(s => s.id === id) || null) : null)
              }}
              className="text-sm font-semibold bg-transparent outline-none cursor-pointer"
              style={{ color: POS_T.onSurface }}>
              <option value="">Select store</option>
              {dbStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center p-0.5 rounded-full"
            style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
            <button onClick={() => onChangeMode('in_store')}
              className="px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 transition-all"
              style={{
                background: mode === 'in_store' ? POS_T.success : 'transparent',
                color:      mode === 'in_store' ? POS_T.onPrimary : POS_T.onSurfaceVariant,
              }}>
              <MIcon name="storefront" size={14} fill={mode === 'in_store'} />
              <span className="hidden xs:inline sm:inline">In-Store</span>
            </button>
            <button onClick={() => onChangeMode('online_assist')}
              className="px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 transition-all"
              style={{
                background: mode === 'online_assist' ? POS_T.warning : 'transparent',
                color:      mode === 'online_assist' ? POS_T.onPrimary : POS_T.onSurfaceVariant,
              }}>
              <MIcon name="chat" size={14} fill={mode === 'online_assist'} />
              <span className="hidden xs:inline sm:inline">Online</span>
            </button>
          </div>

          {/* Stylist chip */}
          <div className="flex items-center gap-2 pl-2 sm:pl-3 sm:ml-1 sm:border-l"
            style={{ borderColor: POS_T.outlineVariant }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>
              {initial}
            </div>
            <select
              value={stylist?.id || ''}
              onChange={e => {
                const next = (teamMembers || []).find(t => String(t.id) === e.target.value)
                if (next) onChangeStylist(next)
              }}
              className="text-sm font-bold bg-transparent outline-none cursor-pointer max-w-[160px] truncate"
              style={{ color: POS_T.onSurface }}>
              {list.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default POSTopBar

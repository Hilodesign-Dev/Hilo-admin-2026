import React, { useState } from 'react'
import { C, toast, fmtDate, stageColor, PRODUCTION_STAGES, DELIVERY_TYPES, MARKETPLACE_CHANNELS } from '../../lib/designTokens'
import { ACTIVE_PRODUCTION_STAGES, RETURN_PRODUCTION_STAGES, ARCHIVE_PRODUCTION_STAGES } from '../../lib/stateMachine'
import ProductionCard from './ProductionCard'
import { filterStylists, filterProductionManagers, vendorsForStage } from '../../lib/helpers'

const Input = (props) => (
  <input {...props} className={`w-full text-sm px-3 py-2.5 rounded-xl outline-none transition-colors focus:ring-2 focus:ring-amber-200 ${props.className || ''}`} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, ...props.style }} />
)

const Select = ({ value, onChange, children, ...rest }) => (
  <select value={value} onChange={onChange} {...rest} className={`w-full text-sm px-3 py-2.5 rounded-xl outline-none transition-colors focus:ring-2 focus:ring-amber-200 ${rest.className || ''}`} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.text, ...rest.style }}>
    {children}
  </select>
)

const Btn = ({ children, onClick, primary, danger, small, disabled, ...rest }) => {
  const base = 'font-bold rounded-xl transition-all inline-flex items-center justify-center gap-1.5'
  const sz = small ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2.5'
  const clr = danger
    ? `text-white ${disabled ? 'opacity-40' : 'hover:opacity-90'}`
    : primary
      ? `text-white ${disabled ? 'opacity-40' : 'hover:opacity-90'}`
      : `${disabled ? 'opacity-40' : 'hover:bg-gray-50'}`
  const bg = danger ? C.red : primary ? C.gold : 'transparent'
  return <button onClick={onClick} disabled={disabled} className={`${base} ${sz} ${clr}`} style={{ background: bg, border: primary || danger ? 'none' : `1px solid ${C.border}`, color: primary || danger ? '#fff' : C.text, ...rest.style }} {...rest}>{children}</button>
}

const SUB_TABS = [
  { key: 'active',       label: 'Active',              countKey: 'active' },
  { key: 'trials',       label: 'Trials',              countKey: 'trials' },
  { key: 'alterations',  label: 'Alterations',         countKey: 'alterations' },
  { key: 'ready',        label: 'Ready to dispatch',   countKey: 'ready' },
  { key: 'returns',      label: 'Returns & Exchanges', countKey: 'returns' },
  { key: 'archive',      label: 'Archive',             countKey: null },
]

const CHANNEL_OPTIONS = [
  { key: 'all',          label: 'All channels' },
  { key: 'online',       label: 'Online' },
  { key: 'assist',       label: 'Online Assist' },
  { key: 'in_store',     label: 'In-store' },
  { key: 'marketplaces', label: 'Marketplaces' },
]

const ProductionList = ({
  items,
  orders,
  teamMembers,
  vendors,
  fabricVendors = [],
  products,
  loading,
  page,
  totalPages,
  subTab,
  onSubTabChange,
  counts,
  filterChannel,
  searchQuery,
  searchType,
  filterStage,
  filterVendor,
  filterDeliveryType,
  filterUrgency,
  filterType,
  filterStylist,
  filterProductExec,
  filterDateFrom,
  filterDateTo,
  onSelectDetail,
  onUpdate,
  onPageChange,
  onFilterChannelChange,
  onSearchTypeChange,
  onSearchChange,
  onFilterStageChange,
  onFilterVendorChange,
  onFilterDeliveryTypeChange,
  onFilterUrgencyChange,
  onFilterTypeChange,
  onFilterStylistChange,
  onFilterProductExecChange,
  onFilterDateFromChange,
  onFilterDateToChange,
  onResetFilters,
  pageSize,
  searchTypes,
  orderTypes,
  urgencyLevels,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false)

  const activeFilterCount =
    (filterStage ? 1 : 0) +
    (filterVendor ? 1 : 0) +
    (filterDeliveryType ? 1 : 0) +
    (filterUrgency ? 1 : 0) +
    (filterType ? 1 : 0) +
    (filterStylist ? 1 : 0) +
    (filterProductExec ? 1 : 0) +
    ((filterDateFrom || filterDateTo) ? 1 : 0)

  return (
    <>
      {/* Row 1 — Sub-tabs (status dimension) */}
      <div className="flex gap-1 mb-3 border-b overflow-x-auto scrollbar-none" style={{ borderColor: C.border, scrollbarWidth: 'none' }}>
        {SUB_TABS.map(t => {
          const active = subTab === t.key
          const c = t.countKey ? counts?.[t.countKey] : null
          return (
            <button key={t.key} onClick={() => onSubTabChange(t.key)}
              className="px-3 sm:px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-all border-b-2 inline-flex items-center gap-2"
              style={{ borderColor: active ? C.gold : 'transparent', color: active ? C.gold : C.textMuted }}>
              {t.label}
              {typeof c === 'number' && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                  style={{ background: active ? C.goldLight : C.bg, color: active ? C.goldDark : C.textMuted }}>
                  {c}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Row 2 — Channel chips */}
      <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
        {CHANNEL_OPTIONS.map(ch => {
          const active = filterChannel === ch.key
          return (
            <button key={ch.key} onClick={() => onFilterChannelChange(ch.key)}
              className="px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0"
              style={{
                background: active ? C.gold : C.cardBg,
                color: active ? '#fff' : C.textMuted,
                border: active ? 'none' : `1px solid ${C.border}`,
              }}>
              {ch.label}
            </button>
          )
        })}
      </div>

      {/* Row 3 — Search + Filters button + Reset */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0 flex items-stretch rounded-xl overflow-hidden" style={{ background: C.cardBg, border: `1px solid ${C.border}` }}>
          <select value={searchType} onChange={e => onSearchTypeChange(e.target.value)}
            className="text-xs font-bold px-2.5 outline-none border-r" style={{ color: C.textMuted, background: C.bg, borderColor: C.border }}>
            {searchTypes.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
          </select>
          <input type="text" value={searchQuery} onChange={e => onSearchChange(e.target.value)} placeholder="Search…"
            className="flex-1 min-w-0 text-sm px-3 py-2 outline-none" style={{ color: C.text }} />
          {searchQuery && (
            <button onClick={() => onSearchChange('')} className="px-2.5 text-xs" style={{ color: C.textMuted }}>✕</button>
          )}
        </div>

        <button onClick={() => setFiltersOpen(true)}
          className="text-sm font-bold px-3 py-2 rounded-xl inline-flex items-center gap-1.5 flex-shrink-0"
          style={{ background: activeFilterCount > 0 ? C.goldLight : C.cardBg, color: activeFilterCount > 0 ? C.goldDark : C.text, border: `1px solid ${C.border}` }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M10 20h4" /></svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: C.gold, color: '#fff' }}>{activeFilterCount}</span>
          )}
        </button>

        {(activeFilterCount > 0 || searchQuery) && (
          <button onClick={onResetFilters}
            className="text-xs font-bold px-2.5 py-2 rounded-xl flex-shrink-0"
            style={{ color: C.textMuted, border: `1px solid ${C.border}` }} title="Reset filters">
            ↺
          </button>
        )}
      </div>

      {/* Row 4 — Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {filterStage && (
            <FilterChip label={`Stage: ${filterStage.replace(/-/g, ' ')}`} onRemove={() => onFilterStageChange('')} />
          )}
          {filterVendor && (
            <FilterChip label={`Vendor: ${filterVendor}`} onRemove={() => onFilterVendorChange('')} />
          )}
          {filterDeliveryType && (
            <FilterChip label={`Delivery: ${filterDeliveryType}`} onRemove={() => onFilterDeliveryTypeChange('')} />
          )}
          {filterUrgency && (
            <FilterChip label={`Urgency: ${filterUrgency}`} onRemove={() => onFilterUrgencyChange('')} />
          )}
          {filterType && (
            <FilterChip label={`Type: ${filterType}`} onRemove={() => onFilterTypeChange('')} />
          )}
          {filterStylist && (
            <FilterChip label={`Stylist: ${filterStylist}`} onRemove={() => onFilterStylistChange('')} />
          )}
          {filterProductExec && (
            <FilterChip label={`Product exec: ${filterProductExec}`} onRemove={() => onFilterProductExecChange('')} />
          )}
          <button onClick={onResetFilters} className="text-xs px-2 py-1 underline" style={{ color: C.textMuted }}>Clear all</button>
        </div>
      )}

      {filtersOpen && (
        <FiltersPopover
          onClose={() => setFiltersOpen(false)}
          filterStage={filterStage} onFilterStageChange={onFilterStageChange}
          filterVendor={filterVendor} onFilterVendorChange={onFilterVendorChange}
          filterDeliveryType={filterDeliveryType} onFilterDeliveryTypeChange={onFilterDeliveryTypeChange}
          filterUrgency={filterUrgency} onFilterUrgencyChange={onFilterUrgencyChange}
          filterType={filterType} onFilterTypeChange={onFilterTypeChange}
          filterStylist={filterStylist} onFilterStylistChange={onFilterStylistChange}
          filterProductExec={filterProductExec} onFilterProductExecChange={onFilterProductExecChange}
          filterDateFrom={filterDateFrom} onFilterDateFromChange={onFilterDateFromChange}
          filterDateTo={filterDateTo} onFilterDateToChange={onFilterDateToChange}
          vendors={vendors} fabricVendors={fabricVendors}
          teamMembers={teamMembers}
          orderTypes={orderTypes}
          urgencyLevels={urgencyLevels}
          subTab={subTab}
        />
      )}

      {/* ── Card Grid ───────────────────────────────────── */}
      {loading ? (
        <div className="py-16 text-center">
          <div className="inline-block w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${C.gold} transparent ${C.gold} ${C.gold}` }} />
          <div className="text-sm mt-3" style={{ color: C.textMuted }}>Loading production items…</div>
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center">
          <svg className="w-12 h-12 mx-auto mb-3" style={{ color: C.textLight }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
          <div className="text-sm font-medium mb-1" style={{ color: C.textMuted }}>No production items found</div>
          <div className="text-xs" style={{ color: C.textLight }}>{searchQuery ? 'Try a different search' : 'Switch sub-tab or clear filters'}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {items.map(item => (
            <ProductionCard
              key={item.id}
              item={item}
              order={orders[item.order_id]}
              teamMembers={teamMembers}
              vendors={vendors}
              fabricVendors={fabricVendors}
              products={products}
              onSelectDetail={onSelectDetail}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <Btn onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0}>← Prev</Btn>
          <span className="text-xs" style={{ color: C.textMuted }}>
            Page {page + 1} of {totalPages}
          </span>
          <Btn onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))} disabled={page === totalPages - 1}>Next →</Btn>
        </div>
      )}
    </>
  )
}

/* ── Sub-components ───────────────────────────────────────────────── */

const FilterChip = ({ label, onRemove }) => (
  <span className="text-xs px-2 py-1 rounded-full inline-flex items-center gap-1" style={{ background: C.goldLight, color: C.goldDark }}>
    {label}
    <button onClick={onRemove} className="font-bold leading-none">×</button>
  </span>
)

const FiltersPopover = ({
  onClose,
  filterStage, onFilterStageChange,
  filterVendor, onFilterVendorChange,
  filterDeliveryType, onFilterDeliveryTypeChange,
  filterUrgency, onFilterUrgencyChange,
  filterType, onFilterTypeChange,
  filterStylist, onFilterStylistChange,
  filterProductExec, onFilterProductExecChange,
  filterDateFrom, onFilterDateFromChange,
  filterDateTo, onFilterDateToChange,
  vendors, fabricVendors, teamMembers, orderTypes, urgencyLevels, subTab,
}) => {
  const stageOptions = subTab === 'archive'
    ? ARCHIVE_PRODUCTION_STAGES
    : subTab === 'returns'
      ? RETURN_PRODUCTION_STAGES
      : PRODUCTION_STAGES

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-xl mx-0 sm:mx-4 max-h-[80vh] overflow-y-auto" style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
        <div className="sticky top-0 z-10 bg-white px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <h2 className="text-base font-bold" style={{ color: C.text }}>Filters</h2>
          <button onClick={onClose} className="text-sm font-bold px-2 py-1" style={{ color: C.textMuted }}>Done</button>
        </div>
        <div className="px-5 py-4 space-y-3.5">
          <FilterField label="Stage">
            <Select value={filterStage} onChange={e => onFilterStageChange(e.target.value)}>
              <option value="">All stages</option>
              {stageOptions.map(s => <option key={s} value={s}>{s.replace(/-/g, ' ')}</option>)}
            </Select>
          </FilterField>
          <FilterField label="Vendor">
            <Select value={filterVendor} onChange={e => onFilterVendorChange(e.target.value)}>
              <option value="">All vendors</option>
              {vendorsForStage(filterStage, vendors, fabricVendors).map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
            </Select>
          </FilterField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FilterField label="Delivery type">
              <Select value={filterDeliveryType} onChange={e => onFilterDeliveryTypeChange(e.target.value)}>
                <option value="">All</option>
                {DELIVERY_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
              </Select>
            </FilterField>
            <FilterField label="Urgency">
              <Select value={filterUrgency} onChange={e => onFilterUrgencyChange(e.target.value)}>
                <option value="">All</option>
                {urgencyLevels.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            </FilterField>
            <FilterField label="Type">
              <Select value={filterType} onChange={e => onFilterTypeChange(e.target.value)}>
                <option value="">All</option>
                {orderTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </FilterField>
            <FilterField label="Stylist">
              <Select value={filterStylist} onChange={e => onFilterStylistChange(e.target.value)}>
                <option value="">All</option>
                {filterStylists(teamMembers).map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
              </Select>
            </FilterField>
            <FilterField label="Product exec">
              <Select value={filterProductExec} onChange={e => onFilterProductExecChange(e.target.value)}>
                <option value="">All</option>
                {filterProductionManagers(teamMembers).map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
              </Select>
            </FilterField>
            <FilterField label="Delivery from">
              <input type="date" value={filterDateFrom || ''} onChange={e => onFilterDateFromChange(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }} />
            </FilterField>
            <FilterField label="Delivery to">
              <input type="date" value={filterDateTo || ''} onChange={e => onFilterDateToChange(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg outline-none" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.text }} />
            </FilterField>
          </div>
        </div>
      </div>
    </div>
  )
}

const FilterField = ({ label, children }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: C.textMuted }}>{label}</div>
    {children}
  </div>
)

export default ProductionList

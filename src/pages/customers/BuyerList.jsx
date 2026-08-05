import React, { useState } from 'react'
import { C, toast } from '../../lib/designTokens'
import BuyerCard from './BuyerCard'

const SOURCE_OPTIONS = ['shopify', 'walk_in', 'referral', 'instagram', 'lead']
const SOURCE_LABELS = { shopify: 'Shopify', walk_in: 'Walk-in', referral: 'Referral', instagram: 'Instagram', lead: 'Lead' }

const BuyerList = ({
  buyers,
  customers,
  loading,
  syncing,
  syncMsg,
  search,
  setSearch,
  searchType,
  setSearchType,
  sourceFilter,
  setSourceFilter,
  typeFilter,
  setTypeFilter,
  onRefresh,
  onAddBuyer,
  onSelectBuyer,
  onEditBuyer,
  filtered,
  page,
  setPage,
  PAGE_SIZE,
  getTypeBadge,
  calcCustomerType,
}) => {
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const getBuyerCustomers = (buyerId) => customers.filter((c) => c.buyer_id === buyerId)
  const getBuyerSpend = (buyerId) => {
    const custs = getBuyerCustomers(buyerId)
    return custs.reduce((t, c) => t + (parseFloat(c.total_spend) || 0), 0)
  }
  const getBuyerType = (buyerId) => {
    const custs = getBuyerCustomers(buyerId)
    if (custs.length === 0) return 'normal'
    const types = custs.map((c) => c.customer_type || 'normal')
    if (types.includes('royal')) return 'royal'
    if (types.includes('elite')) return 'elite'
    if (types.includes('repeat')) return 'repeat'
    return 'normal'
  }

  return (
    <div style={{ padding: '20px', background: C.bg, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: C.text, margin: 0 }}>Customers</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onRefresh}
            disabled={syncing}
            style={{
              padding: '8px 16px',
              background: C.gold,
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: syncing ? 0.6 : 1,
            }}
          >
            {syncing ? '⟳' : '↻'} Sync
          </button>
          <button
            onClick={onAddBuyer}
            style={{
              padding: '8px 16px',
              background: C.gold,
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Add Buyer
          </button>
        </div>
      </div>

      {/* Sync Message */}
      {syncMsg && (
        <div style={{ padding: '12px', background: C.greenBg, border: `1px solid ${C.green}`, borderRadius: '6px', marginBottom: '20px', fontSize: '13px', color: C.green }}>
          {syncMsg}
        </div>
      )}

      {/* Filters */}
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {/* Search Type */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Search Type</label>
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
                background: '#fff',
              }}
            >
              <option value="name">Name</option>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="city">City</option>
              <option value="source">Source</option>
            </select>
          </div>

          {/* Search Input */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Search</label>
            <input
              type="text"
              placeholder="Search buyers..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            />
          </div>

          {/* Source Filter */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Source</label>
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value)
                setPage(1)
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
                background: '#fff',
              }}
            >
              <option value="All">All Sources</option>
              {SOURCE_OPTIONS.map((src) => (
                <option key={src} value={src}>
                  {SOURCE_LABELS[src]}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Type</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPage(1)
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                fontSize: '13px',
                background: '#fff',
              }}
            >
              <option value="All">All Types</option>
              <option value="normal">Normal</option>
              <option value="repeat">Repeat</option>
              <option value="elite">Elite</option>
              <option value="royal">Royal</option>
            </select>
          </div>

          {/* Results Info */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Results</label>
            <div style={{ padding: '8px 12px', background: C.cream, borderRadius: '6px', fontSize: '13px', color: C.text, fontWeight: 600 }}>
              {filtered.length} buyer{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Buyer Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', fontSize: '14px', color: C.textMuted }}>Loading...</div>
      ) : paged.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', fontSize: '14px', color: C.textMuted }}>No buyers found</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {paged.map((buyer) => {
              const custCount = getBuyerCustomers(buyer.id).length
              const spend = getBuyerSpend(buyer.id)
              const type = getBuyerType(buyer.id)
              return (
                <BuyerCard
                  key={buyer.id}
                  buyer={buyer}
                  customerCount={custCount}
                  totalSpend={spend}
                  customerType={type}
                  onSelect={() => onSelectBuyer(buyer)}
                  onEdit={() => onEditBuyer(buyer)}
                  getTypeBadge={getTypeBadge}
                />
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                style={{
                  padding: '8px 12px',
                  background: page === 1 ? C.borderLight : C.gold,
                  color: page === 1 ? C.textMuted : '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                }}
              >
                ← Prev
              </button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i + 1}
                  onClick={() => setPage(i + 1)}
                  style={{
                    padding: '8px 12px',
                    background: page === i + 1 ? C.gold : C.borderLight,
                    color: page === i + 1 ? '#fff' : C.text,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: page === i + 1 ? 700 : 400,
                  }}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                style={{
                  padding: '8px 12px',
                  background: page === totalPages ? C.borderLight : C.gold,
                  color: page === totalPages ? C.textMuted : '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: page === totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default BuyerList

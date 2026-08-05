import React, { useState, useEffect } from 'react'
import Icon from './Icon'
import { ALL_TABS, ALL_NAV } from '../lib/constants'

/**
 * Mobile bottom navigation.
 *
 * Phones can't sanely host 15 tabs side-by-side; the previous build
 * crushed every tab into a ~25px-wide button and omitted POS entirely.
 * This rewrite shows 4 primary tabs + a 'More' button that opens a
 * full-width sheet with everything else.
 *
 * Primary tabs (picked for daily POS-floor workflow):
 *   POS · Production · Fulfillment · Delayed
 *
 * 'More' drawer holds: Catalogue, Growth, Collections, Customers,
 * Leads, Fabrics, Outsource, Masters, Returns, Finance, Team.
 */

// Short labels for mobile bottom-nav; falls back to ALL_NAV.label for anything
// not listed here. The list of tabs itself is pulled from the shared ALL_NAV.
const MOBILE_LABEL = {
  fulfillment: 'Fulfill',
  delayed:     'Delayed',
  growth:      'Marketing',
  users:       'Team',
}
const BOTTOM_NAV = ALL_NAV
  .filter(n => !n.hideFromSidebar)
  .map(n => ({ ...n, label: MOBILE_LABEL[n.id] || n.label }))

const PRIMARY_IDS = ['pos', 'production', 'fulfillment', 'delayed']

const BottomNav = ({ page, setPage, allowedTabs, isAdmin }) => {
  const visible = BOTTOM_NAV.filter(n => n.adminOnly ? isAdmin : (allowedTabs || ALL_TABS).includes(n.id))
  const primary = PRIMARY_IDS.map(id => visible.find(n => n.id === id)).filter(Boolean)
  const secondary = visible.filter(n => !PRIMARY_IDS.includes(n.id))

  const [moreOpen, setMoreOpen] = useState(false)

  // If the user navigates to a non-primary tab (e.g. from a deep link), make
  // sure the More button reflects active state.
  const moreActive = !PRIMARY_IDS.includes(page) && secondary.some(n => n.id === page)

  // Close the drawer on tab change.
  useEffect(() => { setMoreOpen(false) }, [page])

  // Close on escape.
  useEffect(() => {
    if (!moreOpen) return
    const h = (e) => { if (e.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [moreOpen])

  const tabButton = (n, active) => (
    <button key={n.id} onClick={() => setPage(n.id)}
      className="tap"
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 3, border: 'none', background: 'transparent',
        color: active ? '#c9a432' : 'rgba(255,255,255,0.55)',
        transition: 'color 0.15s', cursor: 'pointer', position: 'relative',
        paddingTop: 8, paddingBottom: 6, minWidth: 0,
      }}>
      {active && (
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: 28, height: 2, borderRadius: 2,
          background: 'linear-gradient(90deg,#b8922e,#d4a843)',
        }} />
      )}
      <Icon name={n.icon} cls="w-5 h-5" />
      <span style={{
        fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: '0.04em',
        textTransform: 'uppercase', maxWidth: '100%', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{n.label}</span>
    </button>
  )

  return (
    <>
      {/* Bottom bar */}
      <div
        className="bottom-nav fixed bottom-0 left-0 right-0 z-40 flex"
        style={{
          background: '#0b1929',
          borderTop: '1px solid rgba(201,164,50,0.15)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 4px)',
        }}>
        {primary.map(n => tabButton(n, page === n.id))}
        {secondary.length > 0 && (
          <button
            onClick={() => setMoreOpen(v => !v)}
            className="tap"
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, border: 'none', background: 'transparent',
              color: moreActive || moreOpen ? '#c9a432' : 'rgba(255,255,255,0.55)',
              cursor: 'pointer', position: 'relative',
              paddingTop: 8, paddingBottom: 6, minWidth: 0,
            }}>
            {(moreActive || moreOpen) && (
              <div style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 28, height: 2, borderRadius: 2,
                background: 'linear-gradient(90deg,#b8922e,#d4a843)',
              }} />
            )}
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
            </svg>
            <span style={{
              fontSize: 10, fontWeight: (moreActive || moreOpen) ? 700 : 500,
              letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>More</span>
          </button>
        )}
      </div>

      {/* More drawer */}
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.55)' }}>
          <div
            onClick={e => e.stopPropagation()}
            className="absolute left-0 right-0 bottom-0 rounded-t-2xl mobile-sheet"
            style={{
              background: '#0b1929',
              maxHeight: '70vh',
              overflowY: 'auto',
              boxShadow: '0 -12px 32px rgba(0,0,0,0.4)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
            }}>
            <div className="mobile-sheet-handle" style={{ background: 'rgba(255,255,255,0.3)' }} />
            <div className="px-4 pt-1 pb-2 flex items-center justify-between">
              <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', fontWeight: 700 }}>More</div>
              <button onClick={() => setMoreOpen(false)} className="tap" style={{ color: 'rgba(255,255,255,0.45)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M6 18L18 6"/></svg>
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 px-3 pb-3">
              {secondary.map(n => {
                const active = page === n.id
                return (
                  <button key={n.id} onClick={() => setPage(n.id)}
                    className="tap rounded-xl flex flex-col items-center justify-center gap-1.5"
                    style={{
                      padding: '14px 6px',
                      border: '1px solid ' + (active ? 'rgba(201,164,50,0.45)' : 'rgba(255,255,255,0.08)'),
                      background: active ? 'rgba(201,164,50,0.12)' : 'rgba(255,255,255,0.03)',
                      color: active ? '#eec058' : 'rgba(255,255,255,0.75)',
                      cursor: 'pointer',
                    }}>
                    <Icon name={n.icon} cls="w-5 h-5" />
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textAlign: 'center' }}>{n.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default BottomNav

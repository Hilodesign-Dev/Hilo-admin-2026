import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Icon from './Icon'
import ProfilePopover, { getAvatarUrl, getDisplayName, getUserRole } from './ProfilePopover'
import { ALL_TABS, ALL_NAV } from '../lib/constants'

const Sidebar = ({ page, setPage, productCount, offerCount, onLogout, user, allowedTabs, isAdmin, inboxBadge = 0 }) => {
  const [showProfile, setShowProfile] = useState(false);
  const [mobileAppOpen, setMobileAppOpen] = useState(false);

  const mobileSubIds = ['app-orders', 'mobile-cms', 'app-users', 'app-support', 'stylist-inbox'];

  // Auto-expand if active page is a mobile sub-page
  useEffect(() => {
    if (mobileSubIds.includes(page)) {
      setMobileAppOpen(true);
    }
  }, [page]);

  // Sidebar pulls from ALL_NAV (lib/constants.js) — the single source of truth
  const allNav = ALL_NAV.filter(n => !n.hideFromSidebar);
  const nav = allNav.filter(n => n.adminOnly ? isAdmin : (allowedTabs || ALL_TABS).includes(n.id));

  return (
    <div className="desktop-sidebar w-56 flex-shrink-0 flex flex-col" style={{background:'#0b1929', height:'100vh', overflow:'hidden'}}>
      <div className="px-5 py-6 flex-shrink-0" style={{borderBottom:'1px solid rgba(201,164,50,0.15)'}}>
        <div style={{fontFamily:'Georgia,serif',fontSize:20,fontWeight:700,letterSpacing:'0.22em',color:'#c9a432'}}>HILO</div>
        <div style={{fontSize:9,letterSpacing:'0.18em',color:'rgba(255,255,255,0.3)',textTransform:'uppercase',marginTop:4}}>Design Studio</div>
        <div style={{fontSize:10,letterSpacing:'0.06em',color:'rgba(255,255,255,0.2)',marginTop:10}}>Catalogue Manager</div>
      </div>
      <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto min-h-0 scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {(() => {
          const rendered = [];
          let mobileAppRendered = false;

          for (const n of nav) {
            if (mobileSubIds.includes(n.id)) {
              if (!mobileAppRendered) {
                mobileAppRendered = true;
                const isSubActive = mobileSubIds.includes(page);
                rendered.push(
                  <div key="mobile-app-group" className="space-y-0.5">
                    <button onClick={() => setMobileAppOpen(v => !v)}
                      className={`sidebar-link w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-all ${isSubActive ? 'text-gold-400 bg-white/5' : 'text-white/60 hover:text-white'}`}>
                      <Icon name="store" cls="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1">Mobile App</span>
                      <svg className={`w-3.5 h-3.5 text-white/30 transition-transform ${mobileAppOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {mobileAppOpen && (
                      <div className="pl-3 border-l border-white/10 ml-5 space-y-0.5 mt-0.5">
                        {nav.filter(sub => mobileSubIds.includes(sub.id)).map(sub => (
                          <button key={sub.id} onClick={() => setPage(sub.id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-left transition-colors ${page === sub.id ? 'text-amber-400 bg-white/10 font-bold' : 'text-white/40 hover:text-white/80'}`}>
                            <Icon name={sub.icon} cls="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="flex-1">{sub.label}</span>
                            {sub.id === 'stylist-inbox' && inboxBadge > 0 && (
                              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-bold" style={{fontSize:'10px'}}>{inboxBadge}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
            } else {
              rendered.push(
                <button key={n.id} onClick={() => setPage(n.id)}
                  className={`sidebar-link w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-left ${page === n.id ? 'active text-gold-400' : 'text-white/60 hover:text-white'}`}>
                  <Icon name={n.icon} cls="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{n.label}</span>
                  {n.id === 'stylist-inbox' && inboxBadge > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-bold" style={{fontSize:'10px'}}>{inboxBadge}</span>}
                </button>
              );
            }
          }
          return rendered;
        })()}
      </nav>
      <div className="px-3 py-3 border-t border-white/10 space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between px-1">
          <div className="text-white/30 text-xs">{productCount} SKUs</div>
          <a href="https://www.hilodesign.co" target="_blank" className="text-xs hover:opacity-80" style={{color:'#c9a432'}}>hilodesign.co ↗</a>
        </div>
        {user && (
          <div className="relative">
            <button onClick={() => setShowProfile(v => !v)}
              className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all ${showProfile ? 'bg-white/10' : 'hover:bg-white/5'}`}>
              <img src={getAvatarUrl(user.email)} className="w-9 h-9 rounded-full border border-white/20 bg-gray-700 flex-shrink-0" />
              <div className="flex-1 min-w-0 text-left">
                <div className="text-white text-xs font-semibold truncate">{getDisplayName(user.email)}</div>
                <div className="text-xs mt-0.5" style={{color:'rgba(201,164,50,0.75)'}}>{getUserRole(user.email)}</div>
              </div>
              <svg className={`w-3.5 h-3.5 text-white/30 transition-transform flex-shrink-0 ${showProfile ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showProfile && <ProfilePopover user={user} onLogout={onLogout} onClose={() => setShowProfile(false)} position="above" />}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default Sidebar

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Icon from './Icon'
import ProfilePopover, { getAvatarUrl } from './ProfilePopover'
import { TAB_LABELS } from '../lib/constants'

const MobileHeader = ({ page, user, onLogout }) => {
  const [showProfile, setShowProfile] = useState(false);
  const labels = {
    ...TAB_LABELS,
    pos:         'POS',
    delayed:     'Delayed Reporting',
    leads:       'Leads',
    outsource:   'Outsource',
    users:       'Team',
  };
  return (
    <div className="mobile-header sticky top-0 z-40 flex items-center justify-between px-3 sm:px-4" style={{background:'#0b1929',height:52,borderBottom:'1px solid rgba(201,164,50,0.12)'}}>
      <div className="flex items-baseline gap-1 sm:gap-1.5 flex-shrink-0">
        <span style={{fontFamily:'Georgia,serif',fontWeight:700,fontSize:14,letterSpacing:'0.2em',color:'#c9a432'}}>HILO</span>
        <span style={{fontSize:8,letterSpacing:'0.15em',color:'rgba(255,255,255,0.3)',textTransform:'uppercase'}}>Design</span>
      </div>
      <span className="text-xs sm:text-sm font-medium flex-1 text-center truncate px-2" style={{letterSpacing:'0.06em',color:'rgba(255,255,255,0.75)',textTransform:'uppercase'}}>{labels[page]}</span>
      {user ? (
        <div className="relative flex-shrink-0">
          <button onClick={() => setShowProfile(v => !v)} className="flex items-center gap-1.5">
            <img src={getAvatarUrl(user.email)} className="w-8 h-8 rounded-full bg-gray-700 flex-shrink-0" style={{border:'1.5px solid rgba(201,164,50,0.4)'}} />
          </button>
          {showProfile && <ProfilePopover user={user} onLogout={onLogout} onClose={() => setShowProfile(false)} position="below" />}
        </div>
      ) : <div className="w-8 flex-shrink-0" />}
    </div>
  );
};

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

export default MobileHeader

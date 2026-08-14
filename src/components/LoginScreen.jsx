import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Icon from './Icon'
import { SUPABASE_URL, supa } from '../lib/supabase'

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    const { error: err } = await supa.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password,
    });
    setLoading(false);
    if (err) {
      let host = ''
      try { host = new URL(SUPABASE_URL).hostname } catch { host = SUPABASE_URL || '' }
      setError(`${err.message || 'Incorrect email or password'} (${host})`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{background:'#0b1929'}}>
      {/* Subtle decorative gradient blobs */}
      <div style={{position:'absolute',top:'15%',left:'10%',width:220,height:220,borderRadius:'50%',background:'radial-gradient(circle,rgba(196,162,51,0.08) 0%,transparent 70%)',pointerEvents:'none'}} />
      <div style={{position:'absolute',bottom:'15%',right:'10%',width:220,height:220,borderRadius:'50%',background:'radial-gradient(circle,rgba(196,162,51,0.06) 0%,transparent 70%)',pointerEvents:'none'}} />

      <div className="w-full max-w-xs px-6 relative z-10">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="mb-2" style={{fontFamily:'Georgia,serif',fontSize:42,fontWeight:700,letterSpacing:'0.25em',color:'#c9a432',lineHeight:1}}>HILO</div>
          <div style={{fontSize:10,letterSpacing:'0.2em',color:'rgba(255,255,255,0.35)',fontWeight:500}}>DESIGN — CATALOGUE MANAGER</div>
        </div>

        {/* Card */}
        <div className="rounded-2xl shadow-2xl" style={{background:'#ffffff',padding:'36px 32px 32px'}}>
          <form onSubmit={handleSignIn}>
            <div className="mb-5">
              <label style={{display:'block',fontSize:10,fontWeight:600,letterSpacing:'0.12em',color:'#9ca3af',marginBottom:8,textTransform:'uppercase'}}>Email Address</label>
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="atelier@hilodesign.co" required autoFocus
                style={{width:'100%',border:'1px solid #e5e7eb',borderRadius:8,padding:'10px 14px',fontSize:14,color:'#1f2937',outline:'none',transition:'border-color 0.15s',background:'#fafafa'}}
                onFocus={e => e.target.style.borderColor='#c9a432'}
                onBlur={e => e.target.style.borderColor='#e5e7eb'} />
            </div>
            <div className="mb-6">
              <label style={{display:'block',fontSize:10,fontWeight:600,letterSpacing:'0.12em',color:'#9ca3af',marginBottom:8,textTransform:'uppercase'}}>Password</label>
              <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••" required
                style={{width:'100%',border:'1px solid #e5e7eb',borderRadius:8,padding:'10px 14px',fontSize:14,color:'#1f2937',outline:'none',transition:'border-color 0.15s',background:'#fafafa'}}
                onFocus={e => e.target.style.borderColor='#c9a432'}
                onBlur={e => e.target.style.borderColor='#e5e7eb'} />
            </div>
            {error && <div style={{fontSize:12,color:'#ef4444',background:'#fef2f2',borderRadius:8,padding:'8px 12px',marginBottom:16,lineHeight:1.4}}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{width:'100%',padding:'13px',borderRadius:999,border:'none',cursor:loading?'not-allowed':'pointer',opacity:loading?0.7:1,
                background:'linear-gradient(135deg,#b8922e 0%,#d4a843 50%,#c9a432 100%)',
                color:'white',fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',transition:'opacity 0.15s'}}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-8" style={{fontSize:10,letterSpacing:'0.12em',color:'rgba(255,255,255,0.2)',textTransform:'uppercase'}}>
          Access Restricted — Hilo Design Team Only
        </div>
      </div>
    </div>
  );
};

// ─── App ──────────────────────────────────────────────────────────────────────
// ── Hash-based routing helpers ─────────────────────────────────────────────────

export default LoginScreen

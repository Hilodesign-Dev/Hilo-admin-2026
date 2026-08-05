import React, { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'
import FranchiseReceipts from '../franchises/FranchiseReceipts'

/* FranchisePublic — token-protected public page for franchisees.
   Only the Receipts view is exposed. RLS policies make sure they can never
   read disbursements, terms internals, or other franchise rows. */

export default function FranchisePublic({ token }) {
  const [franchise, setFranchise] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    (async () => {
      const { data, error } = await supa
        .from('franchises')
        .select('id, code, display_name, format, city, state, partner_name, agreement_signed_on, term_years, lock_in_years, total_committed, share_token, status')
        .eq('share_token', token)
        .maybeSingle()
      if (error || !data) { setErr('This statement link is no longer valid.'); setLoading(false); return }
      setFranchise(data)
      setLoading(false)
    })()
  }, [token])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">Loading…</div>
  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-2xl font-extrabold tracking-tight" style={{ color: '#c9a432' }}>HILO DESIGN</div>
          <div className="mt-6 text-sm text-gray-500">{err}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#faf9f5' }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-6 pb-5 border-b border-gray-200">
          <div className="text-3xl font-extrabold tracking-tight" style={{ color: '#c9a432' }}>HILO DESIGN</div>
          <div className="text-xs uppercase tracking-widest text-gray-500 mt-1">Franchise Statement</div>
          <h1 className="text-xl font-extrabold text-gray-800 mt-4">{franchise.display_name}</h1>
          <div className="text-xs text-gray-500 mt-1">
            <span className="font-mono">{franchise.code}</span> · {franchise.format} · {franchise.city}, {franchise.state}
            {franchise.agreement_signed_on && (
              <> · Agreement {new Date(franchise.agreement_signed_on).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</>
            )}
          </div>
        </div>

        <FranchiseReceipts franchise={franchise} publicView />

        <div className="mt-10 text-center text-[11px] text-gray-400">
          Hilo Design India Private Limited · This statement is auto-generated. Refresh this page to see the latest balance.
        </div>
      </div>
    </div>
  )
}

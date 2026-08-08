import React, { useState, useEffect, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast } from '../../lib/designTokens'
import { fmtDate } from '../../lib/designTokens'
import { Btn, Badge } from '../orders/ui'

export default function AppUsersTab() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 15

  // Expanded user ID and their loaded addresses/sessions
  const [expandedId, setExpandedId] = useState(null)
  const [addresses, setAddresses] = useState({})
  const [sessions, setSessions] = useState({})
  const [subLoading, setSubLoading] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      let q = supa.from('shopper_users').select('*', { count: 'exact' })

      if (searchQuery.trim().length >= 2) {
        const query = searchQuery.trim()
        q = q.or(`name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
      }

      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      const { data, count, error } = await q
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error
      setUsers(data || [])
      setTotalCount(count || 0)
    } catch (e) {
      console.error('[HILO] Failed to fetch shopper users:', e)
      toast(false, 'Failed to fetch shopper users: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, page])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const loadUserData = async (userId) => {
    if (addresses[userId] && sessions[userId]) return
    setSubLoading(true)
    try {
      // 1. Fetch addresses
      const { data: addrData, error: addrErr } = await supa
        .from('shopper_addresses')
        .select('*')
        .eq('user_id', userId)
        .order('is_primary', { ascending: false })

      if (addrErr) throw addrErr
      setAddresses(prev => ({ ...prev, [userId]: addrData || [] }))

      // 2. Fetch sessions
      const { data: sessData, error: sessErr } = await supa
        .from('shopper_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (sessErr) throw sessErr
      setSessions(prev => ({ ...prev, [userId]: sessData || [] }))
    } catch (e) {
      console.error('[HILO] Failed to load shopper details:', e)
      toast(false, 'Failed to load shopper details')
    } finally {
      setSubLoading(false)
    }
  }

  const handleToggleExpand = (userId) => {
    if (expandedId === userId) {
      setExpandedId(null)
    } else {
      setExpandedId(userId)
      loadUserData(userId)
    }
  }

  const handleToggleActive = async (user) => {
    try {
      const { error } = await supa
        .from('shopper_users')
        .update({ active: !user.active, updated_at: new Date().toISOString() })
        .eq('id', user.id)

      if (error) throw error
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, active: !u.active } : u))
      toast(true, user.active ? 'User account suspended' : 'User account reactivated')
    } catch (e) {
      toast(false, 'Failed to update status: ' + e.message)
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: C.text }}>App Users</h1>
          <p className="text-sm mt-1" style={{ color: C.textMuted }}>
            Monitor mobile app shopper registrations, saved delivery addresses, and active login sessions
          </p>
        </div>
        <div className="bg-white px-4 py-2 rounded-2xl shadow-sm border" style={{ borderColor: C.border }}>
          <span className="text-xs font-bold uppercase tracking-wider block" style={{ color: C.textLight }}>Total Shoppers</span>
          <span className="text-xl font-bold" style={{ color: C.text }}>{totalCount}</span>
        </div>
      </div>

      {/* Filter/Search Bar */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border mb-6 flex flex-wrap gap-4 items-center justify-between" style={{ borderColor: C.border }}>
        <div className="relative min-w-[320px] max-w-md w-full">
          <input
            type="text"
            placeholder="Search by Name, Phone, Email..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
            className="w-full text-sm pl-9 pr-4 py-2 rounded-2xl border outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200 transition-all"
            style={{ background: C.bg, borderColor: C.border, color: C.text }}
          />
          <span className="absolute left-3 top-2.5 text-gray-400">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
        </div>
        
        <Btn onClick={fetchUsers} small>
          Refresh List
        </Btn>
      </div>

      {/* Users List Table */}
      <div className="bg-white rounded-3xl shadow-sm border overflow-hidden" style={{ borderColor: C.border }}>
        {loading ? (
          <div className="py-20 text-center text-sm" style={{ color: C.textMuted }}>Loading app shoppers...</div>
        ) : users.length === 0 ? (
          <div className="py-20 text-center">
            <div className="text-4xl mb-3">👥</div>
            <div className="text-sm font-bold" style={{ color: C.text }}>No app shoppers registered yet</div>
            <div className="text-xs mt-1" style={{ color: C.textMuted }}>Shoppers will appear here when they register or request OTP on the app</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b" style={{ borderColor: C.border, background: C.bg }}>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Name</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Phone</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Email</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500">Registered On</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">Account Status</th>
                  <th className="p-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const isExpanded = expandedId === user.id
                  return (
                    <React.Fragment key={user.id}>
                      <tr
                        className={`border-b hover:bg-gray-50/50 cursor-pointer transition-colors ${isExpanded ? 'bg-amber-50/10' : ''}`}
                        style={{ borderColor: C.border }}
                        onClick={() => handleToggleExpand(user.id)}
                      >
                        <td className="p-4 font-bold text-sm" style={{ color: C.text }}>
                          {user.name || 'Anonymous Shopper'}
                        </td>
                        <td className="p-4 text-sm font-semibold text-slate-700">
                          {user.phone || '—'}
                        </td>
                        <td className="p-4 text-sm text-slate-600">
                          {(user.email && !/^PLACEHOLDER#/i.test(user.email)) ? user.email : '—'}
                        </td>
                        <td className="p-4 text-sm" style={{ color: C.text }}>
                          {fmtDate(user.created_at)}
                        </td>
                        <td className="p-4 text-center">
                          <Badge color={user.active ? C.green : C.red} bg={user.active ? C.greenBg : C.redBg}>
                            {user.active ? 'ACTIVE' : 'SUSPENDED'}
                          </Badge>
                        </td>
                        <td className="p-4 text-right" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleToggleExpand(user.id)}
                            className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors text-gray-500"
                          >
                            <svg className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </td>
                      </tr>

                      {/* Expanded details */}
                      {isExpanded && (
                        <tr>
                          <td colSpan="6" className="p-6 bg-gray-50/40 border-b" style={{ borderColor: C.border }}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Saved addresses */}
                              <div className="bg-white p-5 rounded-2xl border" style={{ borderColor: C.border }}>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Saved Shipping Locations</h3>
                                {subLoading ? (
                                  <div className="py-4 text-center text-xs text-gray-400">Loading addresses...</div>
                                ) : !addresses[user.id] || addresses[user.id].length === 0 ? (
                                  <div className="py-4 text-center text-xs text-gray-400">No saved shipping addresses found.</div>
                                ) : (
                                  <div className="space-y-3">
                                    {addresses[user.id].map(addr => (
                                      <div key={addr.id} className="p-3 bg-slate-50 border rounded-xl" style={{ borderColor: C.borderLight }}>
                                        <div className="flex justify-between items-center mb-1">
                                          <span className="text-xs font-bold text-slate-800">{addr.label}</span>
                                          {addr.is_primary && (
                                            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">PRIMARY</span>
                                          )}
                                        </div>
                                        <div className="text-xs font-medium" style={{ color: C.text }}>{addr.name}</div>
                                        <div className="text-xs text-gray-500">Phone: {addr.phone}</div>
                                        <div className="text-xs text-gray-500 mt-1">
                                          {addr.line1} {addr.line2 ? `, ${addr.line2}` : ''}<br />
                                          {addr.city}, {addr.state} - {addr.pincode}<br />
                                          {addr.country}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Auth sessions and actions */}
                              <div className="space-y-6">
                                <div className="bg-white p-5 rounded-2xl border" style={{ borderColor: C.border }}>
                                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Active Login Sessions</h3>
                                  {subLoading ? (
                                    <div className="py-4 text-center text-xs text-gray-400">Loading session metadata...</div>
                                  ) : !sessions[user.id] || sessions[user.id].length === 0 ? (
                                    <div className="py-4 text-center text-xs text-gray-400">No active login sessions.</div>
                                  ) : (
                                    <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                                      {sessions[user.id].map(sess => {
                                        const isExpired = new Date(sess.expires_at) < new Date()
                                        return (
                                          <div key={sess.id} className="flex justify-between items-center text-xs border-b pb-2 last:border-0 last:pb-0" style={{ borderColor: C.borderLight }}>
                                            <div>
                                              <span className="font-mono text-[10px] select-all font-semibold" style={{ color: C.text }}>{sess.session_id.slice(0, 16)}...</span>
                                              <div className="text-[10px] text-gray-400">Created: {new Date(sess.created_at).toLocaleString()}</div>
                                            </div>
                                            <Badge color={isExpired ? C.red : C.green} bg={isExpired ? C.redBg : C.greenBg}>
                                              {isExpired ? 'EXPIRED' : 'ACTIVE'}
                                            </Badge>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* Quick admin overrides */}
                                <div className="bg-white p-5 rounded-2xl border" style={{ borderColor: C.border }}>
                                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Account Administration</h3>
                                  <p className="text-xs text-gray-400 mb-4">Temporarily block or suspend this user's ability to request OTPs, log in, or checkout on the mobile application.</p>
                                  <Btn
                                    danger={user.active}
                                    primary={!user.active}
                                    onClick={() => handleToggleActive(user)}
                                  >
                                    {user.active ? 'Suspend Shopper Account' : 'Reactivate Shopper Account'}
                                  </Btn>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="p-4 border-t flex items-center justify-between" style={{ borderColor: C.border, background: C.bg }}>
            <span className="text-xs font-medium" style={{ color: C.textMuted }}>
              Showing {page * PAGE_SIZE + 1} – {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} users
            </span>
            <div className="flex gap-2">
              <Btn
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                small
              >
                Previous
              </Btn>
              <Btn
                disabled={page + 1 >= totalPages}
                onClick={() => setPage(p => p + 1)}
                small
              >
                Next
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

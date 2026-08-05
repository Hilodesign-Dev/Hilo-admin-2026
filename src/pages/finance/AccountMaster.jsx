import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { C, toast } from '../../lib/designTokens'
import { supa } from '../../lib/supabase'

const Field = ({ label, required, children }) => (
  <div className="mb-4">
    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#4e4636', letterSpacing: '0.06em' }}>
      {label}{required && <span style={{ color: C.red }}> *</span>}
    </label>
    {children}
  </div>
)

const inputStyle = {
  width: '100%',
  padding: '0.75rem',
  border: `1px solid ${C.border}`,
  borderRadius: '0.5rem',
  fontSize: '0.875rem',
  fontFamily: 'Inter,sans-serif',
}

const AccountMaster = ({ user }) => {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [searchFilter, setSearchFilter] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [form, setForm] = useState({
    name: '',
    group_type: 'direct',
    parent_id: null,
    is_recurring: false,
    default_amt: '',
    is_active: true,
    sort_order: 10,
  })

  // Load accounts from Supabase
  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supa
        .from('expense_accounts')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (error) throw error
      setAccounts(data || [])
    } catch (err) {
      console.error('Error loading accounts:', err)
      toast(false, 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  // Build hierarchy: group by type, then organize parents and children
  const groupedAccounts = useMemo(() => {
    const filtered = accounts.filter(a =>
      a.name?.toLowerCase().includes(searchFilter.toLowerCase())
    )

    const direct = filtered.filter(a => a.group_type === 'direct')
    const indirect = filtered.filter(a => a.group_type === 'indirect')

    const buildTree = (items) => {
      const allItems = accounts.filter(a => items.some(i => i.id === a.id) || items.some(i => i.id === a.parent_id))
      const roots = items.filter(a => !a.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      const children = {}

      items.forEach(a => {
        if (a.parent_id) {
          if (!children[a.parent_id]) children[a.parent_id] = []
          children[a.parent_id].push(a)
        }
      })

      // Sort children by sort_order
      Object.keys(children).forEach(pid => {
        children[pid].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      })

      const tree = []
      roots.forEach(root => {
        tree.push(root)
        if (children[root.id]) {
          tree.push(...children[root.id])
        }
      })

      return tree
    }

    return {
      direct: { label: 'Direct Costs', items: buildTree(direct) },
      indirect: { label: 'Indirect / Overhead', items: buildTree(indirect) },
    }
  }, [accounts, searchFilter])

  // Open modal for new account
  const handleOpenAdd = () => {
    setForm({
      name: '',
      group_type: 'direct',
      parent_id: null,
      is_recurring: false,
      default_amt: '',
      is_active: true,
      sort_order: 10,
    })
    setEditing(null)
    setShowModal(true)
  }

  // Open modal for editing
  const handleOpenEdit = (account) => {
    setForm({
      name: account.name || '',
      group_type: account.group_type || 'direct',
      parent_id: account.parent_id || null,
      is_recurring: account.is_recurring || false,
      default_amt: account.default_amt != null ? String(account.default_amt) : '',
      is_active: account.is_active !== false,
      sort_order: account.sort_order || 10,
    })
    setEditing(account.id)
    setShowModal(true)
  }

  // Save account (create or update)
  const handleSaveAccount = async () => {
    if (!form.name.trim()) {
      toast(false, 'Account name is required')
      return
    }

    // Sanitize numeric fields — empty string → null
    const payload = {
      name: form.name.trim(),
      group_type: form.group_type,
      parent_id: form.parent_id || null,
      is_recurring: form.is_recurring,
      default_amt: form.default_amt === '' || form.default_amt === undefined ? null : Number(form.default_amt),
      is_active: form.is_active,
      sort_order: form.sort_order === '' || form.sort_order === undefined ? null : Number(form.sort_order),
    }

    try {
      if (editing) {
        const { error } = await supa
          .from('expense_accounts')
          .update(payload)
          .eq('id', editing)

        if (error) throw error
        toast(true, 'Account updated')
      } else {
        const { error } = await supa
          .from('expense_accounts')
          .insert([payload])

        if (error) throw error
        toast(true, 'Account created')
      }

      setShowModal(false)
      loadAccounts()
    } catch (err) {
      console.error('Error saving account:', err)
      toast(false, 'Failed to save account')
    }
  }

  // Toggle active status
  const handleToggleActive = async (id, currentStatus) => {
    try {
      const { error } = await supa
        .from('expense_accounts')
        .update({ is_active: !currentStatus })
        .eq('id', id)

      if (error) throw error
      toast(true, currentStatus ? 'Account deactivated' : 'Account activated')
      loadAccounts()
    } catch (err) {
      console.error('Error toggling active status:', err)
      toast(false, 'Failed to update account')
    }
  }

  // Delete account
  const handleDeleteAccount = async (id) => {
    // Check if it has children
    const hasChildren = accounts.some(a => a.parent_id === id)
    if (hasChildren) {
      toast(false, 'Cannot delete — this account has sub-accounts. Remove them first.')
      return
    }

    try {
      const { error } = await supa
        .from('expense_accounts')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast(true, 'Account deleted')
      setConfirmDelete(null)
      loadAccounts()
    } catch (err) {
      console.error('Error deleting account:', err)
      toast(false, 'Failed to delete account')
    }
  }

  // Get parent account name for display
  const getParentName = (parentId) => {
    const parent = accounts.find(a => a.id === parentId)
    return parent ? parent.name : null
  }

  // Count children of a parent
  const getChildCount = (parentId) => accounts.filter(a => a.parent_id === parentId).length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div style={{ color: C.textMuted }}>Loading accounts...</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'Manrope, sans-serif' }}>
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 style={{ fontSize: '1.875rem', fontWeight: 700, color: C.text }}>
              Chart of Accounts
            </h1>
            <p style={{ fontSize: '0.875rem', color: C.textMuted, marginTop: '0.25rem' }}>
              Manage expense accounts and cost categories — {accounts.length} accounts
            </p>
          </div>
          <button
            onClick={handleOpenAdd}
            style={{
              background: C.gold,
              color: '#fff',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.target.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.target.style.opacity = '1')}
          >
            + Add Account
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search accounts..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Account sections */}
      <div className="max-w-6xl mx-auto space-y-8">
        {['direct', 'indirect'].map((groupKey) => {
          const group = groupedAccounts[groupKey]
          if (!group.items.length) return null

          return (
            <div key={groupKey}>
              {/* Section header */}
              <div
                style={{
                  padding: '0.75rem 1rem',
                  background: C.cream,
                  borderRadius: '0.5rem',
                  marginBottom: '0.75rem',
                  borderLeft: `4px solid ${C.gold}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h2
                  style={{
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    color: C.text,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {group.label}
                </h2>
                <span style={{ fontSize: '0.75rem', color: C.textMuted }}>
                  {group.items.filter(a => !a.parent_id).length} groups, {group.items.filter(a => !!a.parent_id).length} sub-accounts
                </span>
              </div>

              {/* Accounts in section */}
              <div
                style={{
                  background: C.cardBg,
                  borderRadius: '1rem',
                  overflow: 'hidden',
                  border: `1px solid ${C.border}`,
                }}
              >
                {group.items.map((account, idx) => {
                  const isParent = accounts.some(a => a.parent_id === account.id)
                  const isChild = !!account.parent_id
                  const childCount = getChildCount(account.id)

                  return (
                    <div
                      key={account.id}
                      style={{
                        padding: isChild ? '0.75rem 1rem 0.75rem 2.5rem' : '1rem',
                        borderBottom: idx < group.items.length - 1 ? `1px solid ${C.borderLight}` : 'none',
                        background: isChild ? 'rgba(212, 168, 67, 0.02)' : 'transparent',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '1rem',
                        }}
                      >
                        {/* Left side */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {isParent && (
                              <span style={{ fontSize: '0.75rem' }}>📁</span>
                            )}
                            {isChild && (
                              <span style={{ fontSize: '0.75rem', color: C.textLight }}>└</span>
                            )}
                            <span
                              style={{
                                fontSize: isParent ? '0.875rem' : '0.8125rem',
                                fontWeight: isParent ? 700 : 500,
                                color: C.text,
                              }}
                            >
                              {account.name}
                            </span>
                            {!account.is_active && (
                              <span
                                style={{
                                  fontSize: '0.625rem',
                                  padding: '0.125rem 0.375rem',
                                  background: C.redBg,
                                  color: C.red,
                                  borderRadius: '0.25rem',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                }}
                              >
                                Inactive
                              </span>
                            )}
                            {account.is_recurring && (
                              <span
                                style={{
                                  fontSize: '0.625rem',
                                  padding: '0.125rem 0.375rem',
                                  background: C.blueBg,
                                  color: C.blue,
                                  borderRadius: '0.25rem',
                                  fontWeight: 600,
                                }}
                              >
                                Recurring
                              </span>
                            )}
                            {isParent && (
                              <span style={{ fontSize: '0.6875rem', color: C.textMuted }}>
                                ({childCount} sub-accounts)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right side — Actions */}
                        <div
                          style={{
                            display: 'flex',
                            gap: '0.25rem',
                            alignItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <button
                            onClick={() => handleToggleActive(account.id, account.is_active)}
                            title={account.is_active ? 'Deactivate' : 'Activate'}
                            style={{
                              padding: '0.375rem',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              fontSize: '1rem',
                              opacity: 0.5,
                              transition: 'opacity 0.2s',
                            }}
                            onMouseEnter={(e) => (e.target.style.opacity = '1')}
                            onMouseLeave={(e) => (e.target.style.opacity = '0.5')}
                          >
                            {account.is_active ? '✓' : '○'}
                          </button>
                          <button
                            onClick={() => handleOpenEdit(account)}
                            title="Edit"
                            style={{
                              padding: '0.375rem',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              opacity: 0.4,
                              transition: 'opacity 0.2s',
                            }}
                            onMouseEnter={(e) => (e.target.style.opacity = '0.8')}
                            onMouseLeave={(e) => (e.target.style.opacity = '0.4')}
                          >
                            ✏️
                          </button>
                          {confirmDelete === account.id ? (
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button
                                onClick={() => handleDeleteAccount(account.id)}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  border: 'none',
                                  background: C.red,
                                  color: '#fff',
                                  cursor: 'pointer',
                                  fontSize: '0.6875rem',
                                  borderRadius: '0.25rem',
                                  fontWeight: 600,
                                }}
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  border: `1px solid ${C.border}`,
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  fontSize: '0.6875rem',
                                  borderRadius: '0.25rem',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(account.id)}
                              title="Delete"
                              style={{
                                padding: '0.375rem',
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                opacity: 0.4,
                                transition: 'opacity 0.2s',
                                color: C.red,
                              }}
                              onMouseEnter={(e) => (e.target.style.opacity = '0.8')}
                              onMouseLeave={(e) => (e.target.style.opacity = '0.4')}
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {!groupedAccounts.direct.items.length && !groupedAccounts.indirect.items.length && (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: C.textLight,
              fontSize: '0.875rem',
            }}
          >
            No accounts found
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: C.cardBg,
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '600px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: C.text,
                marginBottom: '1.5rem',
              }}
            >
              {editing ? 'Edit Account' : 'New Account'}
            </h2>

            <div style={{ marginBottom: '1.5rem' }}>
              <Field label="Account Name" required>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={inputStyle}
                  placeholder="e.g. Fabric Costs"
                />
              </Field>

              <Field label="Cost Type" required>
                <select
                  value={form.group_type}
                  onChange={(e) => setForm({ ...form, group_type: e.target.value, parent_id: null })}
                  style={inputStyle}
                >
                  <option value="direct">Direct Cost</option>
                  <option value="indirect">Indirect / Overhead</option>
                </select>
              </Field>

              <Field label="Parent Account">
                <select
                  value={form.parent_id || ''}
                  onChange={(e) => setForm({ ...form, parent_id: e.target.value || null })}
                  style={inputStyle}
                >
                  <option value="">— None (top-level account) —</option>
                  {accounts
                    .filter(a => a.group_type === form.group_type && a.id !== editing && !a.parent_id)
                    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Sort Order">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                    style={inputStyle}
                    placeholder="e.g. 10"
                  />
                </Field>

                <Field label="Default Amount">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.default_amt}
                    onChange={(e) => setForm({ ...form, default_amt: e.target.value })}
                    style={inputStyle}
                    placeholder="Optional"
                  />
                </Field>
              </div>

              <div className="flex gap-6 mt-2">
                <Field label="Status">
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      color: C.text,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      style={{ cursor: 'pointer' }}
                    />
                    Active
                  </label>
                </Field>

                <Field label="Recurring">
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      color: C.text,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.is_recurring}
                      onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
                      style={{ cursor: 'pointer' }}
                    />
                    Monthly recurring
                  </label>
                </Field>
              </div>
            </div>

            {/* Buttons */}
            <div
              style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '0.75rem 1rem',
                  border: `1px solid ${C.border}`,
                  borderRadius: '0.5rem',
                  background: 'transparent',
                  color: C.textMuted,
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.target.style.background = C.cream)}
                onMouseLeave={(e) => (e.target.style.background = 'transparent')}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAccount}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: C.gold,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.target.style.opacity = '0.9')}
                onMouseLeave={(e) => (e.target.style.opacity = '1')}
              >
                {editing ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AccountMaster

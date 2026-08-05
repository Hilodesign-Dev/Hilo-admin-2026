import React, { useState, useEffect } from 'react'
import { supa } from '../../lib/supabase'

const C = {
  gold: '#c9a432', goldDark: '#795900', goldLight: 'rgba(212,168,67,0.12)',
  text: '#1b1c1a', textMuted: 'rgba(27,28,26,0.5)', textLight: 'rgba(27,28,26,0.3)',
  red: '#dc2626', redBg: 'rgba(220,38,38,0.08)',
  amber: '#d97706', amberBg: 'rgba(217,119,6,0.08)',
  border: '#ebe8e0', borderLight: '#f3f1eb',
  cream: '#f5f4f0', cardBg: '#fff',
}

const fmtDate = (d) => d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtCurrency = (v) => {
  const num = Number(v)
  if (!num) return '₹0'
  return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const TYPE_LABELS = {
  outsource_bill: 'Outsource Bill',
  outsource_payment: 'Outsource Payment',
  fabric_po: 'Fabric PO',
  vendor_payment: 'Vendor Payment',
}
const TYPE_COLORS = {
  outsource_bill: C.red,
  outsource_payment: '#16a34a',
  fabric_po: '#3b82f6',
  vendor_payment: '#7c3aed',
}

const DeletionLogViewer = () => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data } = await supa.from('deletion_logs').select('*').order('created_at', { ascending: false }).limit(100)
      if (data) setLogs(data)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="text-xs" style={{ color: C.textLight }}>Loading deletion history…</div>
    </div>
  )

  if (logs.length === 0) return (
    <div className="bg-white rounded-xl p-10 text-center shadow-sm">
      <div className="text-4xl mb-3">🗑️</div>
      <div className="font-semibold text-gray-700">No deletions recorded</div>
      <div className="text-sm text-gray-400 mt-1">When bills or payments are deleted, they appear here with full details for audit.</div>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold" style={{ color: C.text }}>{logs.length} deletion{logs.length !== 1 ? 's' : ''} recorded</div>
      </div>
      {logs.map(log => {
        const snap = log.snapshot || {}
        const color = TYPE_COLORS[log.entity_type] || C.red
        const isOpen = expanded === log.id
        return (
          <div key={log.id} className="bg-white rounded-xl shadow-sm overflow-hidden" style={{ border: `1px solid ${C.borderLight}`, borderLeftWidth: 3, borderLeftColor: color }}>
            <div className="p-4 cursor-pointer" onClick={() => setExpanded(isOpen ? null : log.id)}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${color}15`, color }}>{TYPE_LABELS[log.entity_type] || log.entity_type}</span>
                    <span className="text-sm font-bold font-mono" style={{ color: C.text }}>{log.entity_name || log.entity_id}</span>
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: C.textLight }}>
                    Deleted by {log.deleted_by_name || log.deleted_by_email || 'unknown'} · {fmtDate(log.created_at)}
                  </div>
                  {log.reason && <div className="text-[11px] mt-1 italic" style={{ color: C.amber }}>Reason: {log.reason}</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  {snap.total_cost && <span className="text-sm font-bold" style={{ color: C.red }}>{fmtCurrency(snap.total_cost)}</span>}
                  {snap.amount && <span className="text-sm font-bold" style={{ color: '#16a34a' }}>{fmtCurrency(snap.amount)}</span>}
                  <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ color: C.textLight }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
            {isOpen && (
              <div className="px-4 pb-4">
                <div className="rounded-lg p-3" style={{ background: C.cream }}>
                  <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: C.textMuted }}>Full Record Snapshot</div>
                  {log.entity_type === 'outsource_bill' && snap.bill_number && (
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Bill #</span><span className="font-mono font-semibold" style={{ color: C.text }}>{snap.bill_number}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Date</span><span style={{ color: C.text }}>{snap.date || '—'}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Service</span><span style={{ color: C.text }}>{snap.service || '—'}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Status</span><span style={{ color: C.text }}>{snap.status || '—'}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Total</span><span className="font-bold" style={{ color: C.red }}>{fmtCurrency(snap.total_cost)}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Settled</span><span style={{ color: C.text }}>{snap.settled ? 'Yes' : 'No'}</span></div>
                      {(snap.line_items || []).length > 0 && (
                        <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                          <div className="text-[10px] font-semibold mb-1" style={{ color: C.textMuted }}>Line Items</div>
                          {snap.line_items.map((li, i) => (
                            <div key={i} className="flex justify-between text-[11px] py-0.5">
                              <span style={{ color: C.text }}>{li.category || 'Item'} × {li.qty}</span>
                              <span style={{ color: C.textMuted }}>@ {fmtCurrency(li.rate)} = {fmtCurrency(Number(li.qty) * Number(li.rate))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {log.entity_type === 'outsource_payment' && (
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Payment ID</span><span className="font-mono font-semibold" style={{ color: C.text }}>{snap.id || '—'}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Date</span><span style={{ color: C.text }}>{snap.date || '—'}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Amount</span><span className="font-bold" style={{ color: '#16a34a' }}>{fmtCurrency(snap.amount)}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Method</span><span style={{ color: C.text }}>{snap.method || '—'}</span></div>
                      <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Reference</span><span style={{ color: C.text }}>{snap.reference || '—'}</span></div>
                      {snap.settled_entries?.length > 0 && (
                        <div className="flex justify-between text-xs"><span style={{ color: C.textMuted }}>Settled Bills</span><span style={{ color: C.text }}>{snap.settled_entries.length}</span></div>
                      )}
                    </div>
                  )}
                  <details className="mt-2">
                    <summary className="text-[10px] cursor-pointer" style={{ color: C.textLight }}>Raw JSON</summary>
                    <pre className="text-[10px] mt-1 whitespace-pre-wrap break-all rounded p-2" style={{ background: '#f8f7f4', color: C.textMuted }}>{JSON.stringify(snap, null, 2)}</pre>
                  </details>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default DeletionLogViewer

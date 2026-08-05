import React, { useState, useEffect } from 'react'
import { supa } from '../../lib/supabase'
import { C, toast, fmtCurrency, fmtDate } from '../../lib/designTokens'
import { logAndToast } from '../../lib/logger'
import ProductPicker from './ProductPicker'
import QuotationCogsPanel from './QuotationCogsPanel'
import PaymentSplitModal from './PaymentSplitModal'
import CustomerLookup from './CustomerLookup'
import { newTempId, cartTotals, lineMath } from './cartHelpers'
import { saveQuotation, convertQuotationToOrder, shareUrlFor } from './quotationActions'
import { savePosPayments } from './orderActions'

/**
 * Quotation list + builder.
 *
 *   list mode    — list of quotations with status pills
 *   builder mode — open existing or new; customer step, products step,
 *                  COGS-per-component step. Share button shows the URL
 *                  (Hilo-hosted /#/q/<token>). Convert-to-Order pops the
 *                  payment modal and creates the order with quotation_id
 *                  linked, skipping the confirmation gate.
 */
const POSQuotations = ({ stylist, store, mode, products, teamMembers, fabrics, stitchingMaster }) => {
  const [view, setView] = useState('list')
  const [editing, setEditing] = useState(null)

  return (
    <div>
      {view === 'list' && (
        <QuotationList
          onNew={() => { setEditing({ id: null, cart: [], customer: null, eventDate: '', notes: '' }); setView('builder') }}
          onOpen={(q) => { setEditing(hydrateForEdit(q)); setView('builder') }}
        />
      )}
      {view === 'builder' && (
        <QuotationBuilder
          state={editing}
          setState={setEditing}
          onBack={() => { setView('list'); setEditing(null) }}
          stylist={stylist} store={store} mode={mode}
          products={products} teamMembers={teamMembers}
          fabrics={fabrics} stitchingMaster={stitchingMaster}
        />
      )}
    </div>
  )
}

const hydrateForEdit = (q) => ({
  id: q.id,
  quotation_number: q.quotation_number,
  status: q.status,
  share_token: q.share_token,
  customer: q.customer_id ? { customer_id: q.customer_id, buyer_id: null, name: '', phone: '', country_code: '+91', email: '', isNew: false } : null,
  cart: (q.items || []).map(it => ({ ...it, tempId: it.tempId || newTempId() })),
  eventDate: q.event_date || '',
  validUntil: q.valid_until || '',
  notes: q.notes || '',
})

// ─── List view ────────────────────────────────────────────────────────
const QuotationList = ({ onNew, onOpen }) => {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { (async () => {
    setLoading(true)
    const { data } = await supa.from('quotations').select('*').order('created_at', { ascending: false }).limit(100)
    setRows(data || [])
    setLoading(false)
  })() }, [])
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-bold" style={{ color: C.text }}>Quotations</h2>
        <button onClick={onNew} className="text-sm font-bold px-4 py-2 rounded-lg" style={{ background: C.gold, color: '#fff' }}>+ New quotation</button>
      </div>
      {loading && <div className="text-xs py-6 text-center" style={{ color: C.textMuted }}>Loading…</div>}
      {!loading && rows.length === 0 && (
        <div className="text-xs py-12 text-center" style={{ color: C.textMuted }}>No quotations yet — create one.</div>
      )}
      <div className="space-y-2">
        {rows.map(q => (
          <button key={q.id} onClick={() => onOpen(q)}
            className="w-full text-left p-3 rounded-xl flex items-center gap-3"
            style={{ background: '#fff', border: `1px solid ${C.border}` }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold" style={{ color: C.text }}>{q.quotation_number || '(draft)'}</div>
              <div className="text-[11px] mt-0.5" style={{ color: C.textMuted }}>
                {fmtDate(q.created_at)} · {(q.items || []).length} item{(q.items || []).length !== 1 ? 's' : ''} · Stylist {q.stylist_name || '—'}
              </div>
            </div>
            <div className="text-sm font-bold font-mono" style={{ color: C.gold }}>{fmtCurrency(q.total_mrp)}</div>
            <StatusBadge status={q.status} />
          </button>
        ))}
      </div>
    </div>
  )
}

const StatusBadge = ({ status }) => {
  const map = {
    draft:     { bg: '#fff3cd',  fg: '#a16207' },
    shared:    { bg: 'rgba(91,141,239,0.15)', fg: '#5b8def' },
    accepted:  { bg: 'rgba(22,163,74,0.15)',  fg: '#16a34a' },
    converted: { bg: 'rgba(22,163,74,0.15)',  fg: '#16a34a' },
    rejected:  { bg: '#fce7e7',  fg: '#b91c1c' },
    expired:   { bg: '#f0f0f0',  fg: '#666666' },
  }
  const m = map[status] || map.draft
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ background: m.bg, color: m.fg }}>{status || 'draft'}</span>
}

// ─── Builder ─────────────────────────────────────────────────────────
const QuotationBuilder = ({ state, setState, onBack, stylist, store, mode, products, teamMembers, fabrics, stitchingMaster }) => {
  const [step, setStep] = useState(state.cart.length > 0 ? 'design' : (state.customer ? 'products' : 'customer'))
  const [saving, setSaving] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [converted, setConverted] = useState(null)

  const cart = state.cart || []
  const customer = state.customer

  const updateCart = (next) => setState({ ...state, cart: next })
  const addToCart = (item) => updateCart([...cart, { tempId: newTempId(), ...item }])
  const removeLine = (id) => updateCart(cart.filter(l => l.tempId !== id))
  const updateLine = (id, patch) => updateCart(cart.map(l => l.tempId === id ? { ...l, ...patch } : l))

  const setCustomer = (c) => setState({ ...state, customer: c })
  const setOrderMeta = (om) => setState({ ...state, eventDate: om.event_date || state.eventDate })

  const totals = cartTotals(cart)

  const save = async (status = 'draft') => {
    setSaving(true)
    try {
      const saved = await saveQuotation({
        id: state.id, customer, stylist, store, mode, cart,
        eventDate: state.eventDate, validUntil: state.validUntil,
        notes: state.notes, status, shareToken: state.share_token,
      })
      setState({ ...state, id: saved.id, quotation_number: saved.quotation_number, share_token: saved.share_token, status: saved.status })
      toast(true, status === 'shared' ? 'Quotation shared — link copied' : 'Quotation saved')
      return saved
    } catch (e) { logAndToast('quotation-save', 'Failed to save: ' + (e.message || e), e) }
    finally { setSaving(false) }
  }

  const share = async () => {
    const saved = await save('shared')
    if (!saved) return
    const url = shareUrlFor(saved)
    if (url && navigator.clipboard) { navigator.clipboard.writeText(url) }
  }

  const convertAndCollect = async ({ collected, splits }) => {
    try {
      // Persist the quotation first (status stays 'draft' until conversion succeeds)
      const saved = state.id ? state : await save('draft')
      const sourceQ = saved.id ? saved : state
      const result = await convertQuotationToOrder({ quotation: sourceQ, customer, stylist, store, mode })
      await savePosPayments(result.orderId, result.total, splits, { stylist, paymentType: 'initial' })
      toast(true, 'Order created from quotation')
      setConverted(result)
      setPaymentOpen(false)
    } catch (e) { logAndToast('quotation-convert', 'Failed to convert: ' + (e.message || e), e) }
  }

  if (converted) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <div className="text-5xl mb-3">✓</div>
        <h2 className="text-2xl font-bold mb-1" style={{ color: C.text }}>Quotation converted</h2>
        <div className="text-base font-mono mb-1" style={{ color: C.gold }}>{converted.orderNumber}</div>
        <div className="text-sm mb-6" style={{ color: C.textMuted }}>Order created and moved straight to fabrication.</div>
        <button onClick={onBack} className="text-sm font-bold px-5 py-2 rounded-lg" style={{ background: C.gold, color: '#fff' }}>Done</button>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <button onClick={onBack} className="text-xs font-bold" style={{ color: C.textMuted }}>← Back to quotations</button>
          <div className="text-lg font-bold mt-1" style={{ color: C.text }}>
            {state.quotation_number || 'New quotation'}{state.status ? <StatusBadge status={state.status} /> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => save('draft')} disabled={saving || cart.length === 0}
            className="text-sm font-bold px-3 py-2 rounded-lg"
            style={{ border: `1px solid ${C.border}`, color: C.text, opacity: (saving || cart.length === 0) ? 0.4 : 1 }}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button onClick={share} disabled={saving || cart.length === 0 || !customer}
            className="text-sm font-bold px-3 py-2 rounded-lg"
            style={{ border: `1px solid #a26ce0`, color: '#a26ce0', opacity: (saving || cart.length === 0 || !customer) ? 0.4 : 1 }}>
            🔗 Share with customer
          </button>
          <button onClick={() => setPaymentOpen(true)} disabled={saving || cart.length === 0 || !customer}
            className="text-sm font-bold px-3 py-2 rounded-lg"
            style={{ background: C.gold, color: '#fff', opacity: (saving || cart.length === 0 || !customer) ? 0.4 : 1 }}>
            Convert to order →
          </button>
        </div>
      </div>

      {/* Share URL display */}
      {state.share_token && state.status === 'shared' && (
        <div className="p-3 rounded-lg mb-4" style={{ background: '#fff', border: `1px solid #a26ce0` }}>
          <div className="text-[10px] font-bold uppercase mb-1" style={{ color: '#a26ce0' }}>Shareable URL</div>
          <div className="text-xs font-mono break-all" style={{ color: C.text }}>{shareUrlFor(state)}</div>
        </div>
      )}

      {/* Step strip */}
      <div className="mb-5 flex items-center gap-2 flex-wrap">
        {[
          { key: 'customer', label: 'Customer' },
          { key: 'products', label: 'Products' },
          { key: 'design',   label: 'COGS + Design' },
        ].map((s, i, arr) => {
          const isCurrent = step === s.key
          return (
            <React.Fragment key={s.key}>
              <button onClick={() => setStep(s.key)}
                className="text-xs font-bold px-3 py-1.5 rounded-full"
                style={{ background: isCurrent ? C.gold : 'transparent', color: isCurrent ? '#fff' : C.textMuted, border: isCurrent ? 'none' : `1px solid ${C.border}` }}>
                {s.label}
              </button>
              {i < arr.length - 1 && <span className="text-xs" style={{ color: C.textLight }}>→</span>}
            </React.Fragment>
          )
        })}
      </div>

      {step === 'customer' && (
        <CustomerLookup
          stylist={stylist} store={store} mode={mode}
          customer={customer} orderMeta={{ event_date: state.eventDate }}
          onChangeCustomer={setCustomer}
          onChangeOrderMeta={setOrderMeta}
          onContinue={() => setStep('products')}
        />
      )}

      {step === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
          <ProductPicker products={products} onAdd={addToCart}  stitchingMaster={stitchingMaster}/>
          <div className="rounded-xl p-4" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
            <div className="text-sm font-bold mb-2">Items ({cart.length})</div>
            {cart.length === 0 && <div className="text-xs" style={{ color: C.textMuted }}>Add products to begin</div>}
            <div className="space-y-2">
              {cart.map(l => (
                <div key={l.tempId} className="p-2 rounded-lg flex items-center gap-2" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{l.title}</div>
                    <div className="text-[10px]" style={{ color: C.textMuted }}>{l.size} · Qty {l.quantity} · ₹{(Number(l.mrp) * Number(l.quantity || 1)).toLocaleString('en-IN')}</div>
                  </div>
                  <button onClick={() => removeLine(l.tempId)} className="text-xs" style={{ color: C.red }}>✕</button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between text-sm font-bold" style={{ color: C.text }}>
              <span>Total MRP</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>₹{totals.gross.toLocaleString('en-IN')}</span>
            </div>
            <button onClick={() => setStep('design')} disabled={cart.length === 0}
              className="mt-3 w-full text-sm font-bold py-2 rounded-lg"
              style={{ background: C.gold, color: '#fff', opacity: cart.length === 0 ? 0.4 : 1 }}>
              Continue to COGS + design →
            </button>
          </div>
        </div>
      )}

      {step === 'design' && (
        <div className="space-y-4">
          {cart.map(l => (
            <div key={l.tempId} className="rounded-xl p-4" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <div className="text-sm font-bold" style={{ color: C.text }}>{l.title}</div>
                  <div className="text-[10px]" style={{ color: C.textMuted }}>{l.is_set ? 'CUSTOM SET' : l.type === 'catalog' ? 'CATALOG' : 'CUSTOM'} · ₹{(Number(l.mrp) * Number(l.quantity || 1)).toLocaleString('en-IN')}</div>
                </div>
              </div>
              {l.is_set && Array.isArray(l.set_components) ? (
                <div className="space-y-3">
                  {l.set_components.map((c, i) => (
                    <div key={i}>
                      <div className="text-[11px] font-bold mb-2" style={{ color: C.text }}>↳ {c.name || c.category} <span className="font-normal" style={{ color: C.textMuted }}>· {c.category}</span></div>
                      <QuotationCogsPanel
                        fabrics={fabrics} stitchingMaster={stitchingMaster}
                        defaultCategory={c.category}
                        value={c.cogs}
                        onChange={(cogs) => {
                          const comps = l.set_components.slice()
                          comps[i] = { ...comps[i], cogs }
                          updateLine(l.tempId, { set_components: comps })
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <QuotationCogsPanel
                  fabrics={fabrics} stitchingMaster={stitchingMaster}
                  defaultCategory={l.garment_category || l.category}
                  value={l.cogs}
                  onChange={(cogs) => updateLine(l.tempId, { cogs })}
                />
              )}
            </div>
          ))}
          <div className="rounded-xl p-4" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Total MRP</div>
                <div className="text-base font-bold font-mono">₹{totals.gross.toLocaleString('en-IN')}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Total COGS</div>
                <div className="text-base font-bold font-mono" style={{ color: C.amber }}>
                  ₹{cart.reduce((s, it) => {
                    const own = Number(it?.cogs?.total || 0)
                    const set = (it.set_components || []).reduce((a, c) => a + Number(c?.cogs?.total || 0), 0)
                    return s + own + set
                  }, 0).toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase" style={{ color: C.textMuted }}>Gross margin</div>
                <div className="text-base font-bold font-mono" style={{ color: C.green }}>
                  {(() => {
                    const cogs = cart.reduce((s, it) => {
                      const own = Number(it?.cogs?.total || 0)
                      const set = (it.set_components || []).reduce((a, c) => a + Number(c?.cogs?.total || 0), 0)
                      return s + own + set
                    }, 0)
                    const mrp = totals.gross
                    return mrp > 0 ? `${(((mrp - cogs) / mrp) * 100).toFixed(1)}%` : '—'
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {paymentOpen && (
        <PaymentSplitModal
          total={totals.saleTotal}
          title="Convert quotation → collect payment"
          onConfirm={convertAndCollect}
          onCancel={() => setPaymentOpen(false)}
        />
      )}
    </div>
  )
}

export default POSQuotations

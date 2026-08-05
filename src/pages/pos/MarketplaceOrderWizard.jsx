import React, { useState, useEffect, useMemo } from 'react'
import { supa } from '../../lib/supabase'
import { toast } from '../../lib/designTokens'
import { logAndToast } from '../../lib/logger'
import { POS_T, MIcon } from './tokens'
import { POS_STEP_LABELS } from './constants'
import { TOP_MEASUREMENTS, BOTTOM_MEASUREMENTS } from '../../lib/designTokens'
import StepIndicator from './StepIndicator'
import ProductPicker from './ProductPicker'
import { createMarketplaceOrder } from './orderActions'
import ShareReceiptModal from './ShareReceiptModal'
import { filterStylists } from '../../lib/helpers'

/**
 * Marketplace Order — 4-step wizard.
 *
 * 1) Marketplace + ref + date
 * 2) Products (catalogue MRP read-only, sold MRP editable, discount shown)
 * 3) Custom measurements (skippable, line-level)
 * 4) Fees + Review + Confirm  (no payment dialog)
 *
 * See HILO_Marketplace_Module_PRD.md for the full spec.
 */
const STEPS = [
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'products',    label: 'Products' },
  { key: 'measure',     label: 'Measurements' },
  { key: 'review',      label: 'Fees & Review' },
]

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MarketplaceOrderWizard = ({ stitchingMaster = [], products = [], teamMembers = [], actingUser }) => {
  const [step, setStep] = useState('marketplace')
  const [marketplaces, setMarketplaces] = useState([])
  const [marketplace, setMarketplace] = useState(null)        // selected marketplace row
  const [orderRef, setOrderRef] = useState('')
  const [orderDate, setOrderDate] = useState(todayIso())
  const [lines, setLines] = useState([])
  const [needsMeasurements, setNeedsMeasurements] = useState(false)
  const [fees, setFees] = useState([])
  const [productionExec, setProductionExec] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [shareTarget, setShareTarget] = useState(null)

  // Load active marketplaces
  useEffect(() => {
    supa.from('marketplaces').select('*').eq('is_active', true).order('sort_order')
      .then(({ data }) => setMarketplaces(data || []))
  }, [])

  // When a marketplace is picked, pre-fill its default fee rows
  useEffect(() => {
    if (!marketplace) return
    setFees((marketplace.default_fees || []).map(f => ({ ...f, amount: 0 })))
  }, [marketplace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute fee amounts whenever gross or fees change
  const gross = useMemo(
    () => lines.reduce((s, l) => s + Number(l.sold_mrp || 0) * Number(l.qty || 1), 0),
    [lines]
  )
  const computedFees = useMemo(() => {
    return (fees || []).map(f => {
      const amount = f.kind === 'percent'
        ? +(gross * (Number(f.value) || 0) / 100).toFixed(2)
        : +(Number(f.value) || 0).toFixed(2)
      return { ...f, amount }
    })
  }, [fees, gross])
  const feesTotal = computedFees.reduce((s, f) => s + Number(f.amount || 0), 0)
  const net = +(gross - feesTotal).toFixed(2)
  const discountTotal = lines.reduce(
    (s, l) => s + Math.max(0, (Number(l.catalogue_mrp || 0) - Number(l.sold_mrp || 0))) * Number(l.qty || 1),
    0
  )

  // ProductPicker adapter — append to local lines with catalogue + sold MRP both = catalogue value as initial
  const handleAddItem = (item) => {
    const cat = Number(item.mrp || 0)
    setLines(prev => [
      ...prev,
      {
        _tempId: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: item.title,
        sku: item.sku || '',
        garment_category: item.garment_category || item.category || null,
        size: item.size || 'M',
        qty: Number(item.quantity || 1),
        catalogue_mrp: cat,
        sold_mrp: cat,
        product_type: item.type === 'catalog' ? 'catalog' : 'custom',
        type: item.is_set ? 'Custom' : (item.type === 'custom' || item.type === 'custom_set' ? 'Custom' : 'General'),
        custom_measurements: {},
      },
    ])
    toast(true, 'Added')
  }
  const updateLine = (tempId, patch) => setLines(prev => prev.map(l => l._tempId === tempId ? { ...l, ...patch } : l))
  const removeLine = (tempId) => setLines(prev => prev.filter(l => l._tempId !== tempId))

  // Submit
  const submit = async () => {
    if (!marketplace || !orderRef || lines.length === 0) return
    setSaving(true)
    try {
      const result = await createMarketplaceOrder({
        marketplace: { id: marketplace.id, name: marketplace.name },
        marketplaceOrderRef: orderRef.trim(),
        orderDate,
        lines,
        fees: computedFees,
        productionExecutive: productionExec || null,
        actingUser,
      })
      toast(true, `Marketplace order ${result.orderNumber} created · net ₹${Math.round(result.net).toLocaleString('en-IN')}`)
      setSuccess(result)
    } catch (e) {
      logAndToast('marketplace-create-order', 'Failed to create order: ' + (e.message || e), e)
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setStep('marketplace'); setMarketplace(null); setOrderRef(''); setOrderDate(todayIso())
    setLines([]); setNeedsMeasurements(false); setFees([]); setProductionExec('')
    setSuccess(null); setShareTarget(null)
  }

  const openShare = async () => {
    if (!success?.orderId) return
    try {
      const { data: orderRow } = await supa.from('shopify_orders').select('*').eq('id', success.orderId).single()
      // Token may not exist yet — share modal handles null URL gracefully.
      setShareTarget({ order: orderRow, customer: { name: success.marketplaceName } })
    } catch (e) { logAndToast('share-invoice', 'Could not open share dialog: ' + (e.message || e), e) }
  }

  // ───── Render success screen ─────
  if (success) {
    return (
      <div className="max-w-xl mx-auto py-10 sm:py-16 text-center px-4">
        <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-5" style={{ background: POS_T.successContainer }}>
          <MIcon name="check_circle" fill size={48} style={{ color: POS_T.success }} />
        </div>
        <h1 className="font-bold mb-1 tracking-tight" style={{ color: POS_T.onSurface, fontSize: 'clamp(22px, 4vw, 32px)' }}>
          Marketplace order created
        </h1>
        <div className="text-base font-mono mb-2" style={{ color: POS_T.primary }}>{success.orderNumber}</div>
        <div className="text-sm mb-6" style={{ color: POS_T.onSurfaceVariant }}>
          {success.marketplaceName} · Gross ₹{Math.round(success.gross).toLocaleString('en-IN')}
          {' '}· Net ₹{Math.round(success.net).toLocaleString('en-IN')}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={openShare} className="text-sm font-bold px-5 py-3 rounded-full inline-flex items-center gap-2" style={{ background: POS_T.success || '#16a34a', color: '#fff' }}>
            <MIcon name="share" size={18} />Share invoice
          </button>
          <button onClick={reset} className="text-sm font-bold px-5 py-3 rounded-full inline-flex items-center gap-2" style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>
            <MIcon name="add_shopping_cart" size={18} />Add another marketplace order
          </button>
        </div>
        {shareTarget?.order && (
          <ShareReceiptModal order={shareTarget.order} customer={shareTarget.customer} onClose={() => setShareTarget(null)} />
        )}
      </div>
    )
  }

  // ───── Step gating ─────
  const canAdvance = () => {
    if (step === 'marketplace') return !!(marketplace && orderRef.trim() && orderDate)
    if (step === 'products')    return lines.length > 0
    if (step === 'measure')     return true // skippable
    if (step === 'review')      return !!productionExec
    return false
  }
  const nextStep = () => {
    const idx = STEPS.findIndex(s => s.key === step)
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].key)
  }
  const prevStep = () => {
    const idx = STEPS.findIndex(s => s.key === step)
    if (idx > 0) setStep(STEPS[idx - 1].key)
  }

  return (
    <div>
      <StepIndicator steps={STEPS} current={step} onJump={setStep} />

      {/* STEP 1 — Marketplace + ref + date */}
      {step === 'marketplace' && (
        <div className="max-w-2xl mx-auto space-y-5">
          <div>
            <Label>Marketplace</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {marketplaces.map(m => {
                const active = marketplace?.id === m.id
                return (
                  <button key={m.id} onClick={() => setMarketplace(m)}
                    className="text-sm font-bold px-3 py-2 rounded-full"
                    style={{
                      background: active ? POS_T.primaryContainer : POS_T.surfaceContainerLow,
                      color: active ? POS_T.onPrimary : POS_T.onSurface,
                      border: `1px solid ${active ? POS_T.primaryContainer : POS_T.outlineVariant}`,
                    }}>
                    {m.name}
                  </button>
                )
              })}
              {marketplaces.length === 0 && (
                <div className="text-xs" style={{ color: POS_T.onSurfaceVariant }}>No active marketplaces — add some in Finance → Settings.</div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Marketplace order ID</Label>
              <input value={orderRef} onChange={e => setOrderRef(e.target.value)} placeholder="e.g. AZA-2026-04891"
                className="w-full text-sm px-3 py-2.5 rounded-lg outline-none mt-1.5"
                style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
            </div>
            <div>
              <Label>Marketplace order date</Label>
              <input type="date" value={orderDate} max={todayIso()} onChange={e => setOrderDate(e.target.value)}
                className="w-full text-sm px-3 py-2.5 rounded-lg outline-none mt-1.5 font-mono"
                style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 — Products */}
      {step === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          <ProductPicker products={products} onAdd={handleAddItem}  stitchingMaster={stitchingMaster}/>
          <div className="lg:sticky lg:top-[180px] lg:self-start">
            <div className="rounded-xl p-3" style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: POS_T.onSurfaceVariant }}>
                Cart ({lines.length})
              </div>
              {lines.length === 0 ? (
                <div className="text-xs py-6 text-center" style={{ color: POS_T.onSurfaceVariant }}>Add products from the catalogue.</div>
              ) : (
                <div className="space-y-2">
                  {lines.map(l => {
                    const disc = Math.max(0, Number(l.catalogue_mrp || 0) - Number(l.sold_mrp || 0))
                    return (
                      <div key={l._tempId} className="rounded-lg p-2.5" style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-bold truncate" style={{ color: POS_T.onSurface }}>{l.title}</div>
                          <button onClick={() => removeLine(l._tempId)} className="p-1" style={{ color: POS_T.error }}><MIcon name="close" size={14} /></button>
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: POS_T.onSurfaceVariant }}>{l.garment_category || ''} · {l.size}</div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <Field label="Qty">
                            <input type="text" inputMode="numeric" value={l.qty} onChange={e => updateLine(l._tempId, { qty: Math.max(1, Number(e.target.value.replace(/[^0-9]/g, '') || 1)) })}
                              className="w-full text-sm px-2 py-1.5 rounded outline-none" style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
                          </Field>
                          <Field label="Catalogue MRP">
                            <input value={`₹${Math.round(l.catalogue_mrp || 0).toLocaleString('en-IN')}`} disabled
                              className="w-full text-sm px-2 py-1.5 rounded outline-none font-mono" style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurfaceVariant, opacity: 0.7 }} />
                          </Field>
                          <Field label="Sold MRP">
                            <input type="text" inputMode="decimal" value={l.sold_mrp} onChange={e => updateLine(l._tempId, { sold_mrp: e.target.value.replace(/[^0-9.]/g, '') === '' ? 0 : Number(e.target.value.replace(/[^0-9.]/g, '')) })}
                              className="w-full text-sm px-2 py-1.5 rounded outline-none font-mono"
                              style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
                          </Field>
                        </div>
                        {disc > 0 && (
                          <div className="text-[11px] mt-1.5 font-bold" style={{ color: POS_T.warning || '#d97706' }}>
                            Discount given: ₹{Math.round(disc * Number(l.qty || 1)).toLocaleString('en-IN')}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {lines.length > 0 && (
                <div className="mt-3 pt-3 text-sm" style={{ borderTop: `1px solid ${POS_T.outlineVariant}` }}>
                  <div className="flex justify-between"><span style={{ color: POS_T.onSurfaceVariant }}>Gross sold</span><span className="font-mono font-bold">₹{Math.round(gross).toLocaleString('en-IN')}</span></div>
                  {discountTotal > 0 && (
                    <div className="flex justify-between text-xs mt-0.5"><span style={{ color: POS_T.onSurfaceVariant }}>vs catalogue</span><span className="font-mono" style={{ color: POS_T.warning || '#d97706' }}>−₹{Math.round(discountTotal).toLocaleString('en-IN')}</span></div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STEP 3 — Measurements */}
      {step === 'measure' && (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="rounded-xl p-4" style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={needsMeasurements} onChange={e => setNeedsMeasurements(e.target.checked)} className="w-4 h-4" />
              <span className="text-sm font-bold" style={{ color: POS_T.onSurface }}>This order needs custom measurements</span>
            </label>
            <div className="text-xs mt-1" style={{ color: POS_T.onSurfaceVariant }}>
              Most marketplace orders use standard sizes — leave unchecked and skip ahead.
            </div>
          </div>
          {needsMeasurements && lines.map(l => (
            <MeasurementEditor key={l._tempId} line={l} onChange={(m) => updateLine(l._tempId, { custom_measurements: m })} />
          ))}
        </div>
      )}

      {/* STEP 4 — Fees & Review */}
      {step === 'review' && (
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Line summary */}
          <Section title="Order summary">
            {lines.map(l => {
              const disc = Math.max(0, Number(l.catalogue_mrp || 0) - Number(l.sold_mrp || 0))
              return (
                <div key={l._tempId} className="flex items-start justify-between py-2 text-sm" style={{ borderBottom: `1px solid ${POS_T.outlineVariant}` }}>
                  <div className="min-w-0">
                    <div className="font-bold" style={{ color: POS_T.onSurface }}>{l.title}</div>
                    <div className="text-[11px]" style={{ color: POS_T.onSurfaceVariant }}>
                      Size {l.size} · Qty {l.qty} · Sold ₹{Number(l.sold_mrp || 0).toLocaleString('en-IN')} (catalogue ₹{Number(l.catalogue_mrp || 0).toLocaleString('en-IN')})
                      {disc > 0 ? ` · −₹${Math.round(disc).toLocaleString('en-IN')} discount` : ''}
                    </div>
                  </div>
                  <div className="font-mono font-bold" style={{ color: POS_T.onSurface }}>
                    ₹{Math.round(Number(l.sold_mrp || 0) * Number(l.qty || 1)).toLocaleString('en-IN')}
                  </div>
                </div>
              )
            })}
            <div className="flex justify-between pt-2 text-sm font-bold">
              <span>Gross sold value</span>
              <span className="font-mono">₹{Math.round(gross).toLocaleString('en-IN')}</span>
            </div>
          </Section>

          {/* Fees */}
          <Section title="Fees & deductions">
            {computedFees.length === 0 && (
              <div className="text-xs py-2" style={{ color: POS_T.onSurfaceVariant }}>No default fees set for this marketplace. Add a row, or skip.</div>
            )}
            {computedFees.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_90px_110px_28px] gap-2 items-center py-1.5">
                <input value={f.label} onChange={e => setFees(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                  className="text-sm px-2 py-1.5 rounded outline-none" style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
                <select value={f.kind} onChange={e => setFees(prev => prev.map((x, j) => j === i ? { ...x, kind: e.target.value } : x))}
                  className="text-sm px-2 py-1.5 rounded outline-none" style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
                  <option value="percent">%</option>
                  <option value="flat">₹ flat</option>
                </select>
                <input type="text" inputMode="decimal" value={f.value} onChange={e => setFees(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value.replace(/[^0-9.]/g, '') } : x))}
                  className="text-sm px-2 py-1.5 rounded outline-none font-mono" style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
                <div className="text-right font-mono text-sm font-bold" style={{ color: POS_T.onSurface }}>
                  ₹{Math.round(f.amount || 0).toLocaleString('en-IN')}
                </div>
                <button onClick={() => setFees(prev => prev.filter((_, j) => j !== i))} className="p-1" style={{ color: POS_T.error }}><MIcon name="close" size={14} /></button>
              </div>
            ))}
            <button onClick={() => setFees(prev => [...prev, { type: 'other', label: 'New fee', kind: 'flat', value: 0, amount: 0 }])}
              className="text-xs font-bold mt-2 inline-flex items-center gap-1" style={{ color: POS_T.primary }}>
              <MIcon name="add" size={14} /> Add fee
            </button>
            <div className="flex justify-between pt-3 text-sm font-bold" style={{ borderTop: `1px solid ${POS_T.outlineVariant}` }}>
              <span>Total fees</span>
              <span className="font-mono">−₹{Math.round(feesTotal).toLocaleString('en-IN')}</span>
            </div>
          </Section>

          {/* Net + production exec */}
          <Section title="Net settlement">
            <div className="rounded-lg p-3 flex items-center justify-between mb-3" style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary }}>
              <span className="text-xs font-bold tracking-[0.22em] uppercase">Net to Hilo</span>
              <span className="font-mono text-xl font-bold">₹{Math.round(net).toLocaleString('en-IN')}</span>
            </div>
            <Label>Production executive</Label>
            <select value={productionExec} onChange={e => setProductionExec(e.target.value)}
              className="w-full text-sm px-3 py-2.5 rounded-lg outline-none mt-1.5"
              style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
              <option value="">Select production executive…</option>
              {filterStylists(teamMembers || []).map(t => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
            </select>
            <div className="text-[11px] mt-1" style={{ color: POS_T.onSurfaceVariant }}>
              Required — who is responsible for production / QC of this order. No stylist credit on marketplace orders.
            </div>
          </Section>
        </div>
      )}

      {/* Step navigation footer */}
      <div className="sticky-action-bar mt-6 px-4 sm:px-6 lg:px-8" style={{ background: 'transparent', borderTop: 'none' }}>
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <button onClick={prevStep} disabled={step === 'marketplace'}
            className="text-sm font-bold px-4 py-2.5 rounded-full"
            style={{ border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface, opacity: step === 'marketplace' ? 0.4 : 1 }}>
            Back
          </button>
          {step !== 'review' ? (
            <button onClick={nextStep} disabled={!canAdvance()}
              className="text-sm font-bold px-5 py-2.5 rounded-full inline-flex items-center gap-1.5"
              style={{ background: POS_T.primaryContainer, color: POS_T.onPrimary, opacity: !canAdvance() ? 0.4 : 1 }}>
              Continue <MIcon name="arrow_forward" size={16} />
            </button>
          ) : (
            <button onClick={submit} disabled={!canAdvance() || saving}
              className="text-sm font-bold px-5 py-2.5 rounded-full inline-flex items-center gap-1.5"
              style={{ background: POS_T.success || '#16a34a', color: '#fff', opacity: (!canAdvance() || saving) ? 0.4 : 1 }}>
              <MIcon name="check" size={16} />
              {saving ? 'Creating…' : `Confirm — net ₹${Math.round(net).toLocaleString('en-IN')}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Small helpers
// ──────────────────────────────────────────────────────────────────────
const Label = ({ children }) => (
  <label className="text-[10px] font-bold tracking-[0.18em] uppercase" style={{ color: POS_T.onSurfaceVariant }}>{children}</label>
)
const Field = ({ label, children }) => (
  <div>
    <div className="text-[9px] font-bold uppercase tracking-[0.1em] mb-0.5" style={{ color: POS_T.onSurfaceVariant }}>{label}</div>
    {children}
  </div>
)
const Section = ({ title, children }) => (
  <div className="rounded-xl p-4" style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}` }}>
    <div className="text-[10px] font-bold tracking-[0.18em] uppercase mb-3" style={{ color: POS_T.onSurfaceVariant }}>{title}</div>
    {children}
  </div>
)

const MeasurementEditor = ({ line, onChange }) => {
  const fields = useMemo(() => {
    const cat = (line.garment_category || '').toLowerCase()
    if (/pant|trouser|bottom/.test(cat)) return BOTTOM_MEASUREMENTS
    if (/blazer|sherwani|shirt|kurta|jacket|coat|achkan|bandhgala/.test(cat)) return TOP_MEASUREMENTS
    return [...TOP_MEASUREMENTS, ...BOTTOM_MEASUREMENTS]
  }, [line.garment_category])
  const m = line.custom_measurements || {}
  return (
    <div className="rounded-xl p-3" style={{ background: POS_T.surfaceContainerLow, border: `1px solid ${POS_T.outlineVariant}` }}>
      <div className="text-sm font-bold mb-2" style={{ color: POS_T.onSurface }}>{line.title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {fields.map(f => (
          <div key={f.key}>
            <div className="text-[9px] font-bold uppercase tracking-[0.08em] mb-0.5" style={{ color: POS_T.onSurfaceVariant }}>{f.label}</div>
            <input type="text" inputMode="decimal" value={m[f.key] ?? ''}
              onChange={e => onChange({ ...m, [f.key]: e.target.value.replace(/[^0-9.]/g, '') })}
              className="w-full text-sm px-2 py-1.5 rounded outline-none font-mono"
              style={{ background: POS_T.surfaceContainerLowest, border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default MarketplaceOrderWizard

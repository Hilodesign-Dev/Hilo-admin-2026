/* ═══════════════════════════════════════════════════════════════════════════
   FRANCHISE LEADS — pipeline for franchise enquiries. Simpler than the retail
   Leads CRM: stage chips + quick-add + editor + analytics.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { supa } from '../../lib/supabase'
import { FunnelChart, FUN_COLORS } from '../leads/charts'
import { PhoneInput } from '../leads/PhoneInput'
import { useLeadMasterLists } from '../leads/useLeadMasterLists'

const C = { text: '#1b1c1a', muted: '#807664', light: '#a8a29e', border: '#ebe8e0', card: '#fff', bg: '#faf9f5', gold: '#c9a432' }

const STAGES = [
  { k: 'new', label: 'New', color: '#92400e', bg: 'rgba(254,243,199,0.6)' },
  { k: 'qualified_info_shared', label: 'Qualified · Info Shared', color: '#2563eb', bg: 'rgba(219,234,254,0.6)' },
  { k: 'meeting_with_founder', label: 'Meeting w/ Founder', color: '#7c3aed', bg: 'rgba(237,233,254,0.6)' },
  { k: 'term_sheet_signed', label: 'Term Sheet Signed', color: '#0891b2', bg: 'rgba(207,250,254,0.6)' },
  { k: 'franchisee_live', label: 'Franchisee Live', color: '#16a34a', bg: 'rgba(220,252,231,0.6)' },
  { k: 'lost', label: 'Lost', color: '#dc2626', bg: 'rgba(254,226,226,0.6)' },
]
const stageOf = (k) => STAGES.find(s => s.k === k) || STAGES[0]
const ACTIVE_STAGES = ['new', 'qualified_info_shared', 'meeting_with_founder', 'term_sheet_signed']
const TIMELINE = [['immediate', 'Immediate (<3mo)'], ['near_term', 'Near term (3–6mo)'], ['medium_term', 'Medium (6–12mo)'], ['long_term', 'Long (1yr+)'], ['exploring', 'Exploring']]
const KIND = [['FOCO', 'FOCO'], ['FOFO', 'FOFO'], ['COCO', 'COCO'], ['undecided', 'Undecided']]
const SPACE = [['shortlisted', 'Shortlisted'], ['ready_to_scout', 'Ready to scout'], ['exploring', 'Exploring']]
const FUNDS = [['self', 'Self'], ['loan', 'Loan'], ['family', 'Family'], ['business', 'Business'], ['mixed', 'Mixed']]
const DOCS = [['not_shared', 'Not shared'], ['partial', 'Partial'], ['complete', 'Complete']]
const QUALITY = [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]
const SOURCE = [['whatsapp_lead', 'WhatsApp Lead'], ['whatsapp_ad', 'WhatsApp Ad'], ['referral', 'Referral'], ['linkedin', 'LinkedIn'], ['event', 'Event'], ['existing_customer', 'Existing customer'], ['existing_franchisee_referral', 'Franchisee referral'], ['website', 'Website'], ['walk_in', 'Walk-in'], ['franchise_expo', 'Franchise expo'], ['other', 'Other']]
const NEXT_KIND = [['call', 'Call'], ['email', 'Email'], ['whatsapp', 'WhatsApp'], ['meeting', 'Meeting'], ['send_docs', 'Send docs'], ['follow_up', 'Follow-up']]
const CITY_SUGGEST = ['Hyderabad', 'Chennai', 'Bangalore', 'Mumbai', 'Delhi NCR', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Kochi', 'Chandigarh', 'New York', 'San Francisco', 'Chicago', 'London', 'Dubai', 'Singapore', 'Toronto']

const midCapital = (l) => { const a = Number(l.investment_capacity_min) || 0, b = Number(l.investment_capacity_max) || 0; return b ? (a + b) / 2 : a }
const fmtCr = (lakhs) => { if (!lakhs) return '—'; return lakhs >= 100 ? `₹${(lakhs / 100).toFixed(2)} Cr` : `₹${Math.round(lakhs)} L` }
const fmtCap = (l) => { const a = Number(l.investment_capacity_min) || 0, b = Number(l.investment_capacity_max) || 0; if (!a && !b) return '—'; return `₹${a || '?'}–${b || '?'} L` }
const ymd = (d) => { const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const label = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.muted, letterSpacing: '0.04em' }
const inp = { width: '100%', fontSize: 14, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.text, outline: 'none' }

export default function FranchiseLeads({ user }) {
  const lists = useLeadMasterLists()
  const [view, setView] = useState('pipeline')
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [editLead, setEditLead] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [qe, setQe] = useState({ name: '', phone: '', source: '', target: '' })
  const userName = (typeof window !== 'undefined' && window._currentUserName) || (user?.email || '').split('@')[0] || ''

  const reload = useCallback(async () => {
    setLoading(true)
    const { data } = await supa.from('franchise_leads').select('*').order('created_at', { ascending: false })
    setLeads(data || []); setLoading(false)
  }, [])
  useEffect(() => { reload() }, [reload])

  const filtered = useMemo(() => {
    let r = leads
    if (stageFilter === 'active') r = r.filter(l => ACTIVE_STAGES.includes(l.stage))
    else if (stageFilter !== 'all') r = r.filter(l => l.stage === stageFilter)
    if (search.trim()) { const q = search.trim().toLowerCase(); r = r.filter(l => (l.name || '').toLowerCase().includes(q) || (l.phone || '').includes(q) || (l.lead_code || '').toLowerCase().includes(q)) }
    return r
  }, [leads, stageFilter, search])

  const counts = useMemo(() => {
    const c = { active: 0, all: leads.length }
    STAGES.forEach(s => c[s.k] = 0)
    leads.forEach(l => { c[l.stage] = (c[l.stage] || 0) + 1; if (ACTIVE_STAGES.includes(l.stage)) c.active++ })
    return c
  }, [leads])

  const quickAdd = async () => {
    const digits = (qe.phone || '').replace(/\D/g, '')
    if (!qe.name.trim() || digits.length < 6) { alert('Name and a valid phone are required'); return }
    const { error } = await supa.from('franchise_leads').insert([{
      name: qe.name.trim(), phone: (qe.phone || '').replace(/\s+/g, ''), source: qe.source || null,
      target_cities: qe.target.trim() ? [qe.target.trim()] : [],
      owner_name: userName, created_by_name: userName, updated_by_name: userName, stage: 'new',
    }])
    if (error) { alert('Failed: ' + error.message); return }
    setQe({ name: '', phone: '', source: '', target: '' }); reload()
  }

  const advance = async (l) => {
    const idx = ACTIVE_STAGES.indexOf(l.stage)
    const next = idx >= 0 && idx < ACTIVE_STAGES.length - 1 ? ACTIVE_STAGES[idx + 1] : (l.stage === 'term_sheet_signed' ? 'franchisee_live' : null)
    if (!next) return
    const patch = { stage: next, updated_by_name: userName }
    if (next === 'franchisee_live') { patch.converted_at = new Date().toISOString(); patch.converted_by_name = userName }
    await supa.from('franchise_leads').update(patch).eq('id', l.id); reload()
  }
  const markLost = async (l) => {
    const reason = window.prompt('Reason for losing this lead?'); if (reason === null) return
    await supa.from('franchise_leads').update({ stage: 'lost', lost_reason: reason || 'Not specified', lost_at: new Date().toISOString(), lost_by_name: userName, updated_by_name: userName }).eq('id', l.id); reload()
  }
  const del = async (l) => { if (!window.confirm('Delete this franchise lead?')) return; await supa.from('franchise_leads').delete().eq('id', l.id); reload() }

  return (
    <div>
      <div className="flex items-center gap-1 p-1 rounded-xl mb-4" style={{ background: C.border, width: 'fit-content' }}>
        {[{ k: 'pipeline', l: 'Pipeline' }, { k: 'analytics', l: 'Analytics' }].map(v => (
          <button key={v.k} onClick={() => setView(v.k)} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ background: view === v.k ? C.gold : 'transparent', color: view === v.k ? '#fff' : C.muted }}>{v.l}</button>
        ))}
      </div>

      {view === 'analytics' ? <Analytics leads={leads} /> : (
        <div>
          {/* Quick add */}
          <div className="rounded-xl p-3 mb-4 flex flex-wrap items-end gap-2" style={{ border: `1.5px solid ${C.gold}55`, background: C.card }}>
            <div style={{ minWidth: 160, flex: 1 }}><div style={label}>Name *</div><input style={inp} value={qe.name} onChange={e => setQe(q => ({ ...q, name: e.target.value }))} placeholder="Prospect name" /></div>
            <div style={{ width: 240 }}><div style={label}>Phone *</div><PhoneInput value={qe.phone} onChange={v => setQe(q => ({ ...q, phone: v }))} countryCodes={lists.country_codes || {}} countries={lists.countries || []} /></div>
            <div style={{ width: 150 }}><div style={label}>Source</div><select style={inp} value={qe.source} onChange={e => setQe(q => ({ ...q, source: e.target.value }))}><option value="">—</option>{SOURCE.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div style={{ width: 170 }}><div style={label}>Target city</div><select style={inp} value={qe.target} onChange={e => setQe(q => ({ ...q, target: e.target.value }))}><option value="">—</option>{(lists.locations || []).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <button onClick={quickAdd} className="px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: C.gold }}>+ Log Lead</button>
            <button onClick={() => setShowNew(true)} className="px-3 py-2 rounded-lg text-sm font-bold" style={{ color: C.gold, border: `1px solid ${C.gold}55` }}>+ Full details</button>
          </div>

          {/* Stage chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
            {[{ k: 'active', label: `Active`, count: counts.active }, ...STAGES.map(s => ({ k: s.k, label: s.label, count: counts[s.k] })), { k: 'all', label: 'All', count: counts.all }].map(t => {
              const on = stageFilter === t.k
              return <button key={t.k} onClick={() => setStageFilter(t.k)} className="whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-bold flex-shrink-0" style={{ background: on ? C.gold : C.card, color: on ? '#fff' : C.text, border: `1px solid ${C.border}` }}>{t.label} <span className="ml-1 opacity-70">{t.count}</span></button>
            })}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="ml-auto text-sm px-3 py-1.5 rounded-lg outline-none" style={{ ...inp, width: 200 }} />
          </div>

          {/* List */}
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}`, background: C.card }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-sm" style={{ minWidth: 900 }}>
                <thead><tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                  {['Lead', 'Phone', 'Target', 'Capital', 'Quality', 'Stage', 'Next action', 'Actions'].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase" style={{ color: C.muted }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: C.muted }}>Loading…</td></tr> :
                    filtered.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: C.muted }}>No franchise leads yet — log one above.</td></tr> :
                      filtered.map(l => {
                        const st = stageOf(l.stage)
                        return (
                          <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td className="px-3 py-2.5"><div className="font-bold" style={{ color: C.text }}>{l.name}</div><div className="text-[11px] font-mono" style={{ color: C.light }}>{l.lead_code}</div></td>
                            <td className="px-3 py-2.5 text-xs">{l.phone ? <a href={`tel:${l.phone}`} style={{ color: '#2563eb', textDecoration: 'none' }}>{l.phone}</a> : '—'}</td>
                            <td className="px-3 py-2.5 text-xs" style={{ color: C.muted }}>{(l.target_cities || []).join(', ') || '—'}</td>
                            <td className="px-3 py-2.5 text-xs font-bold" style={{ color: C.text }}>{fmtCap(l)}</td>
                            <td className="px-3 py-2.5">{l.lead_quality ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: l.lead_quality === 'high' ? 'rgba(22,163,74,0.1)' : l.lead_quality === 'medium' ? 'rgba(217,119,6,0.1)' : 'rgba(107,114,128,0.1)', color: l.lead_quality === 'high' ? '#16a34a' : l.lead_quality === 'medium' ? '#d97706' : '#6b7280' }}>{l.lead_quality}</span> : <span style={{ color: C.light }}>—</span>}</td>
                            <td className="px-3 py-2.5"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                            <td className="px-3 py-2.5 text-xs" style={{ color: C.muted }}>{l.next_action_at ? new Date(l.next_action_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}{l.next_action_kind ? ` · ${l.next_action_kind}` : ''}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => setEditLead(l)} className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ background: C.gold, color: '#fff' }}>Edit</button>
                                {ACTIVE_STAGES.includes(l.stage) && <button onClick={() => advance(l)} title="Advance stage" className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ color: '#16a34a', border: '1px solid rgba(22,163,74,0.3)' }}>→</button>}
                                {l.stage !== 'lost' && l.stage !== 'franchisee_live' && <button onClick={() => markLost(l)} title="Mark lost" className="text-[10px] px-2 py-1 rounded-lg font-bold" style={{ color: '#dc2626', border: '1px solid rgba(220,38,38,0.3)' }}>✕</button>}
                                <button onClick={() => del(l)} title="Delete" className="text-[10px] px-1.5 py-1 rounded" style={{ color: C.light }}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {(showNew || editLead) && <LeadEditor lead={editLead} userName={userName} onClose={() => { setShowNew(false); setEditLead(null) }} onSaved={() => { setShowNew(false); setEditLead(null); reload() }} />}
    </div>
  )
}

// ── Editor modal ─────────────────────────────────────────────────────────────
function LeadEditor({ lead, userName, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    name: '', phone: '', email: '', linkedin_url: '', home_city: '', home_state: '', home_country: 'India',
    target_cities: [], target_country: '', timeline_to_open: '', interested_kind: 'undecided', space_availability: 'exploring',
    current_occupation: '', existing_businesses: '', years_in_business: '', investment_capacity_min: '', investment_capacity_max: '',
    source_of_funds: '', financial_docs_status: 'not_shared', lead_quality: '', source: '', source_detail: '',
    stage: 'new', next_action_at: '', next_action_kind: '', next_action_note: '', notes: '', ...(lead || {}),
  }))
  const lists = useLeadMasterLists()
  const [saving, setSaving] = useState(false)
  const [cityInput, setCityInput] = useState('')
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const addCity = (c) => { const v = (c || '').trim(); if (v && !(f.target_cities || []).includes(v)) set('target_cities', [...(f.target_cities || []), v]); setCityInput('') }

  const save = async () => {
    if (!f.name.trim() || !f.phone.trim()) { alert('Name and phone are required'); return }
    setSaving(true)
    const num = (v) => v === '' || v === null || v === undefined ? null : Number(v)
    const payload = {
      name: f.name.trim(), phone: f.phone.trim(), email: f.email || null, linkedin_url: f.linkedin_url || null,
      home_city: f.home_city || null, home_state: f.home_state || null, home_country: f.home_country || null,
      target_cities: f.target_cities || [], target_country: f.target_country || null,
      timeline_to_open: f.timeline_to_open || null, interested_kind: f.interested_kind || 'undecided', space_availability: f.space_availability || 'exploring',
      current_occupation: f.current_occupation || null, existing_businesses: f.existing_businesses || null, years_in_business: num(f.years_in_business),
      investment_capacity_min: num(f.investment_capacity_min), investment_capacity_max: num(f.investment_capacity_max),
      source_of_funds: f.source_of_funds || null, financial_docs_status: f.financial_docs_status || 'not_shared',
      lead_quality: f.lead_quality || null, source: f.source || null, source_detail: f.source_detail || null,
      stage: f.stage || 'new', next_action_at: f.next_action_at || null, next_action_kind: f.next_action_kind || null,
      next_action_note: f.next_action_note || null, notes: f.notes || null, updated_by_name: userName,
    }
    let error
    if (lead?.id) ({ error } = await supa.from('franchise_leads').update(payload).eq('id', lead.id))
    else ({ error } = await supa.from('franchise_leads').insert([{ ...payload, owner_name: userName, created_by_name: userName }]))
    setSaving(false)
    if (error) { alert('Save failed: ' + error.message); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(15,23,42,0.55)' }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: C.border }}>
          <h2 className="font-bold" style={{ color: C.text }}>{lead ? `Edit — ${lead.name}` : 'New franchise lead'}{lead?.lead_code ? <span className="ml-2 text-xs font-mono" style={{ color: C.light }}>{lead.lead_code}</span> : ''}</h2>
          <button onClick={onClose} style={{ color: C.muted }} className="text-sm font-bold px-2">Cancel</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <Section title="Contact"><div className="grid grid-cols-2 gap-3">
            <Field l="Name *"><input style={inp} value={f.name} onChange={e => set('name', e.target.value)} /></Field>
            <Field l="Phone *"><PhoneInput value={f.phone} onChange={v => set('phone', v)} countryCodes={lists.country_codes || {}} countries={lists.countries || []} /></Field>
            <Field l="Email"><input style={inp} value={f.email} onChange={e => set('email', e.target.value)} /></Field>
            <Field l="LinkedIn URL"><input style={inp} value={f.linkedin_url} onChange={e => set('linkedin_url', e.target.value)} /></Field>
          </div></Section>
          <Section title="Partner location & target"><div className="grid grid-cols-2 gap-3">
            <Field l="Country"><select style={inp} value={f.home_country || ''} onChange={e => { set('home_country', e.target.value); set('home_city', '') }}><option value="">—</option>{(lists.countries || []).map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
            <Field l="Partner city"><select style={inp} value={f.home_city || ''} onChange={e => set('home_city', e.target.value)}><option value="">—</option>{((lists.locations_by_country && lists.locations_by_country[f.home_country]) || lists.locations || []).map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
          </div>
            <Field l="Target cities (where they want to open)"><div>
              <div className="flex flex-wrap gap-1.5 mb-1">{(f.target_cities || []).map(c => <span key={c} className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: 'rgba(37,99,235,0.08)', color: '#2563eb' }}>{c} <button onClick={() => set('target_cities', f.target_cities.filter(x => x !== c))}>×</button></span>)}</div>
              <select style={inp} value="" onChange={e => { if (e.target.value) addCity(e.target.value) }}><option value="">+ Add a target city…</option>{(lists.locations || []).filter(c => !(f.target_cities || []).includes(c)).map(c => <option key={c} value={c}>{c}</option>)}</select>
            </div></Field>
          </Section>
          <Section title="Timeline & interest"><div className="grid grid-cols-3 gap-3">
            <Field l="Timeline"><Sel v={f.timeline_to_open} on={v => set('timeline_to_open', v)} opts={TIMELINE} ph="—" /></Field>
            <Field l="Interested kind"><Sel v={f.interested_kind} on={v => set('interested_kind', v)} opts={KIND} /></Field>
            <Field l="Space"><Sel v={f.space_availability} on={v => set('space_availability', v)} opts={SPACE} /></Field>
          </div></Section>
          <Section title="Business & financial"><div className="grid grid-cols-3 gap-3">
            <Field l="Occupation"><input style={inp} value={f.current_occupation} onChange={e => set('current_occupation', e.target.value)} /></Field>
            <Field l="Existing businesses"><input style={inp} value={f.existing_businesses} onChange={e => set('existing_businesses', e.target.value)} /></Field>
            <Field l="Years in business"><input style={inp} inputMode="numeric" value={f.years_in_business} onChange={e => set('years_in_business', e.target.value)} /></Field>
            <Field l="Capital min (₹L)"><input style={inp} inputMode="decimal" value={f.investment_capacity_min} onChange={e => set('investment_capacity_min', e.target.value)} /></Field>
            <Field l="Capital max (₹L)"><input style={inp} inputMode="decimal" value={f.investment_capacity_max} onChange={e => set('investment_capacity_max', e.target.value)} /></Field>
            <Field l="Source of funds"><Sel v={f.source_of_funds} on={v => set('source_of_funds', v)} opts={FUNDS} ph="—" /></Field>
            <Field l="Financial docs"><Sel v={f.financial_docs_status} on={v => set('financial_docs_status', v)} opts={DOCS} /></Field>
          </div></Section>
          <Section title="Qualification, source & pipeline"><div className="grid grid-cols-3 gap-3">
            <Field l="Lead quality"><Sel v={f.lead_quality} on={v => set('lead_quality', v)} opts={QUALITY} ph="—" /></Field>
            <Field l="Source"><Sel v={f.source} on={v => set('source', v)} opts={SOURCE} ph="—" /></Field>
            <Field l="Source detail"><input style={inp} value={f.source_detail} onChange={e => set('source_detail', e.target.value)} /></Field>
            <Field l="Stage"><Sel v={f.stage} on={v => set('stage', v)} opts={STAGES.map(s => [s.k, s.label])} /></Field>
            <Field l="Next action"><input style={inp} type="date" value={(f.next_action_at || '').split('T')[0]} onChange={e => set('next_action_at', e.target.value)} /></Field>
            <Field l="Next action kind"><Sel v={f.next_action_kind} on={v => set('next_action_kind', v)} opts={NEXT_KIND} ph="—" /></Field>
          </div>
            <Field l="Notes"><textarea style={{ ...inp, minHeight: 60 }} value={f.notes} onChange={e => set('notes', e.target.value)} /></Field>
          </Section>
        </div>
        <div className="sticky bottom-0 bg-white px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: C.border }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold" style={{ color: C.muted, border: `1px solid ${C.border}` }}>Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 rounded-lg text-sm font-bold text-white" style={{ background: C.gold }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
const Field = ({ l, children }) => <div><div style={label} className="mb-1">{l}</div>{children}</div>
const Section = ({ title, children }) => <div><div className="text-xs font-bold uppercase mb-2" style={{ color: C.gold, letterSpacing: '0.05em' }}>{title}</div><div className="space-y-3">{children}</div></div>
const Sel = ({ v, on, opts, ph }) => <select style={inp} value={v || ''} onChange={e => on(e.target.value)}>{ph !== undefined && <option value="">{ph}</option>}{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>

// ── Analytics ────────────────────────────────────────────────────────────────
function Analytics({ leads }) {
  const now = new Date(); const mStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1))
  const active = leads.filter(l => ACTIVE_STAGES.includes(l.stage))
  const live = leads.filter(l => l.stage === 'franchisee_live')
  const lost = leads.filter(l => l.stage === 'lost')
  const weighted = active.reduce((s, l) => s + (Number(l.probability_pct) || 0) / 100 * midCapital(l), 0)
  const signedThisMonth = live.filter(l => (l.converted_at || '').split('T')[0] >= mStart).length
  const lostThisMonth = lost.filter(l => (l.lost_at || '').split('T')[0] >= mStart).length
  const winRate = (live.length + lost.length) ? Math.round(live.length / (live.length + lost.length) * 100) : 0
  const hq = active.filter(l => l.lead_quality === 'high').length
  const avgDeal = live.length ? live.reduce((s, l) => s + midCapital(l), 0) / live.length : 0
  const funnel = ACTIVE_STAGES.concat(['franchisee_live']).map((k, i) => ({ label: stageOf(k).label.split(' ')[0], value: leads.filter(l => l.stage === k).length, color: FUN_COLORS[i % FUN_COLORS.length] }))

  const bySource = useMemo(() => {
    const m = {}
    leads.forEach(l => { const s = l.source || 'unknown'; if (!m[s]) m[s] = { leads: 0, signed: 0, lost: 0 }; m[s].leads++; if (l.stage === 'franchisee_live') m[s].signed++; if (l.stage === 'lost') m[s].lost++ })
    return Object.entries(m).map(([s, v]) => ({ s, ...v, win: (v.signed + v.lost) ? Math.round(v.signed / (v.signed + v.lost) * 100) : 0 })).sort((a, b) => b.leads - a.leads)
  }, [leads])
  const quality = ['high', 'medium', 'low'].map(q => ({ q, n: active.filter(l => l.lead_quality === q).length }))
  const lossReasons = useMemo(() => { const m = {}; lost.forEach(l => { const r = l.lost_reason || 'Not specified'; m[r] = (m[r] || 0) + 1 }); return Object.entries(m).map(([r, c]) => ({ r, c })).sort((a, b) => b.c - a.c) }, [lost])

  const Kpi = ({ l, v, c = C.gold, sub }) => <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}><div style={label}>{l}</div><div className="text-2xl font-bold mt-1" style={{ color: c }}>{v}</div>{sub && <div className="text-[10px] mt-0.5" style={{ color: C.muted }}>{sub}</div>}</div>
  const Panel = ({ title, children }) => <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}><div className="font-bold text-sm mb-3" style={{ color: C.text }}>{title}</div>{children}</div>
  const Bar = ({ l, v, max, tint }) => <div className="flex items-center gap-2 mb-1.5"><div className="text-xs w-28 truncate" style={{ color: C.muted }}>{l}</div><div className="flex-1 h-3 rounded-full" style={{ background: C.border }}><div className="h-3 rounded-full" style={{ width: `${max ? Math.round(v / max * 100) : 0}%`, background: tint }} /></div><div className="text-xs font-bold w-8 text-right" style={{ color: C.text }}>{v}</div></div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi l="Active leads" v={active.length} />
        <Kpi l="Weighted pipeline" v={fmtCr(weighted)} c="#7c3aed" />
        <Kpi l="Signed (month)" v={signedThisMonth} c="#16a34a" />
        <Kpi l="Win rate" v={`${winRate}%`} c="#16a34a" sub="signed vs lost" />
        <Kpi l="High-quality" v={hq} c="#16a34a" />
        <Kpi l="Avg deal size" v={fmtCr(avgDeal)} />
        <Kpi l="Lost (month)" v={lostThisMonth} c="#dc2626" />
        <Kpi l="Total leads" v={leads.length} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel title="Pipeline funnel"><div className="flex justify-center"><FunnelChart stages={funnel} /></div></Panel>
        <Panel title="Lead quality (active)">{quality.map(q => <Bar key={q.q} l={q.q} v={q.n} max={Math.max(1, ...quality.map(x => x.n))} tint={q.q === 'high' ? '#16a34a' : q.q === 'medium' ? '#d97706' : '#6b7280'} />)}</Panel>
      </div>
      <Panel title="Source performance">
        <div style={{ overflowX: 'auto' }}><table className="w-full text-sm"><thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>{['Source', 'Leads', 'Signed', 'Lost', 'Win %'].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] font-bold uppercase" style={{ color: C.muted }}>{h}</th>)}</tr></thead>
          <tbody>{bySource.map(r => <tr key={r.s} style={{ borderBottom: `1px solid ${C.border}` }}><td className="px-3 py-2 font-bold" style={{ color: C.text }}>{(SOURCE.find(x => x[0] === r.s) || [null, r.s])[1]}</td><td className="px-3 py-2">{r.leads}</td><td className="px-3 py-2 font-bold" style={{ color: '#16a34a' }}>{r.signed}</td><td className="px-3 py-2" style={{ color: '#dc2626' }}>{r.lost}</td><td className="px-3 py-2 font-bold" style={{ color: C.gold }}>{r.win}%</td></tr>)}
            {bySource.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center" style={{ color: C.muted }}>No data</td></tr>}</tbody></table></div>
      </Panel>
      {lossReasons.length > 0 && <Panel title="Loss reasons">{lossReasons.map(r => <Bar key={r.r} l={r.r} v={r.c} max={lossReasons[0].c} tint="#dc2626" />)}</Panel>}
    </div>
  )
}

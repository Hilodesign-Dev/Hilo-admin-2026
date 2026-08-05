import React, { useEffect, useState } from 'react'
import { supa } from '../../lib/supabase'

/* ApplyPublic — public careers page (#/careers, #/apply, #/apply/<slug>).
   Lists open roles → role detail with full JD → application form (base fields +
   role custom questions + CV). Mobile-first responsive. Anon RLS allows insert. */

const GOLD = '#c9a432', INK = '#1b1c1a', MUT = '#807664', LINE = '#eceae4', BG = '#faf9f5', DANGER = '#b4322e'
// TODO: confirm the exact Instagram handle — change here if different.
const IG_URL = 'https://www.instagram.com/hilodesign.co'
const IG_LABEL = '@hilodesign.co'

const slugFromHash = () => { const h = typeof window !== 'undefined' ? window.location.hash : ''; const m = h.match(/^#\/(?:apply|careers)\/([A-Za-z0-9-_]+)/); return m ? m[1] : null }
const bullets = (v) => (v || '').split('\n').map(s => s.trim()).filter(Boolean)

const IgButton = ({ light }) => (
  <a href={IG_URL} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', padding: '9px 14px', borderRadius: 10, border: `1px solid ${light ? 'rgba(255,255,255,0.3)' : LINE}`, color: light ? '#fff' : INK, background: light ? 'rgba(255,255,255,0.08)' : '#fff' }}>
    <span style={{ fontSize: 15 }}>◎</span> Follow us on Instagram · {IG_LABEL}
  </a>
)

export default function ApplyPublic() {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    (async () => {
      const { data } = await supa.from('hiring_roles').select('*').eq('status', 'open').order('sort_order').order('created_at')
      const list = data || []; setRoles(list)
      const sl = slugFromHash(); if (sl) { const r = list.find(x => x.slug === sl); if (r) setRole(r) }
      setLoading(false)
    })()
  }, [])

  const wrap = { minHeight: '100vh', background: BG, fontFamily: 'Manrope, system-ui, sans-serif', color: INK, WebkitTextSizeAdjust: '100%' }
  if (loading) return <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUT }}>Loading…</div>

  if (done) return (
    <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, width: '100%', maxWidth: 460, textAlign: 'center', padding: '32px 22px' }}>
        <div style={{ fontSize: 20, marginBottom: 18 }}><b style={{ fontWeight: 800 }}>HILO</b> DESIGN</div>
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: GOLD + '22', color: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 14px' }}>✓</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Application received</div>
        <div style={{ fontSize: 14, color: MUT, lineHeight: 1.6 }}>Thank you. Our team will review your application and reach out if it's a match.</div>
        <div style={{ marginTop: 18 }}><IgButton /></div>
        <button onClick={() => { setDone(false); setRole(null); if (history.replaceState) history.replaceState(null, '', '#/careers') }} style={{ marginTop: 12, fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 9, border: `1px solid ${LINE}`, background: '#fff', cursor: 'pointer' }}>View other openings</button>
      </div>
    </div>
  )

  if (role) return <RolePage role={role} onBack={() => { setRole(null); if (history.replaceState) history.replaceState(null, '', '#/careers') }} onDone={() => setDone(true)} showBack={roles.length > 1} />

  // ── Careers listing ──
  return (
    <div style={wrap}>
      <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', padding: '0 16px 48px', boxSizing: 'border-box' }}>
        <div style={{ padding: '20px 2px 8px' }}>
          <div style={{ fontSize: 22, letterSpacing: '-0.01em' }}><b style={{ fontWeight: 800 }}>HILO</b> DESIGN</div>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: MUT, marginTop: 2 }}>Careers · We're hiring</div>
        </div>
        <div style={{ background: INK, color: '#fff', borderRadius: 16, padding: '22px 20px', margin: '8px 0 18px' }}>
          <div style={{ fontSize: 23, fontWeight: 800, marginBottom: 6, lineHeight: 1.2 }}>Join the Hilo team</div>
          <div style={{ fontSize: 14, color: '#e7e3d8', lineHeight: 1.6, marginBottom: 14 }}>We craft premium menswear for men's biggest occasions. Explore our open roles and apply in a couple of minutes.</div>
          <IgButton light />
        </div>
        {roles.length === 0 ? (
          <div style={{ textAlign: 'center', color: MUT, padding: '40px 0', border: `1px dashed ${LINE}`, borderRadius: 12, background: '#fff' }}>No open roles right now. Please check back soon.</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {roles.map(r => (
              <button key={r.id} onClick={() => { setRole(r); if (history.replaceState) history.replaceState(null, '', `#/apply/${r.slug}`); window.scrollTo(0, 0) }}
                style={{ textAlign: 'left', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 18, cursor: 'pointer', width: '100%' }}>
                <div style={{ fontSize: 17.5, fontWeight: 800, color: INK }}>{r.title}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '7px 0 9px' }}>
                  {r.employment_type && <span style={chip}>{r.employment_type}</span>}
                  {r.location && <span style={chip}>📍 {r.location}</span>}
                  {r.experience_required && <span style={chip}>🎯 {r.experience_required}</span>}
                </div>
                {r.description && <div style={{ fontSize: 13.5, color: MUT, lineHeight: 1.55, marginBottom: 12 }}>{r.description}</div>}
                <span style={{ display: 'inline-block', fontSize: 13.5, fontWeight: 800, color: '#fff', background: GOLD, padding: '9px 16px', borderRadius: 10 }}>View role & apply →</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ textAlign: 'center', fontSize: 11, color: MUT, marginTop: 22 }}>HILO DESIGN · Careers</div>
      </div>
    </div>
  )
}

const chip = { fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#f2efe7', color: '#6a6252' }
const chipLight = { ...chip, background: 'rgba(255,255,255,0.14)', color: '#f0ece3' }

function JDSection({ title, items }) {
  if (!items || !items.length) return null
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{title}</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5, color: INK }}>
            <span style={{ color: GOLD, fontWeight: 800, lineHeight: 1.4 }}>›</span><span>{it}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RolePage({ role, onBack, onDone, showBack }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', years_experience: '', current_city: '' })
  const [ans, setAns] = useState({})
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const setA = (id, v) => setAns(p => ({ ...p, [id]: v }))
  const questions = Array.isArray(role.questions) ? role.questions : []

  const card = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 18, marginBottom: 14 }
  const lbl = { display: 'block', fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 6 }
  const sub = { fontSize: 12, color: MUT, marginTop: -2, marginBottom: 8, lineHeight: 1.5 }
  const inp = { width: '100%', fontSize: 16, padding: '11px 12px', border: `1px solid ${LINE}`, borderRadius: 9, color: INK, boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff' }
  const ta = { ...inp, minHeight: 78, resize: 'vertical', lineHeight: 1.5 }

  const Scale = ({ value, onChange, low, high }) => (
    <div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" onClick={() => onChange(n)} style={{ flex: 1, padding: '12px 0', borderRadius: 9, fontSize: 16, fontWeight: 800, cursor: 'pointer', border: value === n ? 'none' : `1px solid ${LINE}`, background: value === n ? GOLD : '#fff', color: value === n ? '#fff' : MUT }}>{n}</button>
        ))}
      </div>
      {(low || high) && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: MUT, marginTop: 5 }}><span>{low}</span><span>{high}</span></div>}
    </div>
  )
  const renderQ = (q) => {
    const v = ans[q.id]
    if (q.type === 'scale') return <Scale value={v || 0} onChange={x => setA(q.id, x)} low={q.low} high={q.high} />
    if (q.type === 'longtext') return <textarea value={v || ''} onChange={e => setA(q.id, e.target.value)} style={ta} placeholder={q.placeholder || ''} />
    if (q.type === 'number') return <input value={v || ''} onChange={e => setA(q.id, e.target.value.replace(/[^0-9.]/g, ''))} style={inp} inputMode="decimal" placeholder={q.placeholder || ''} />
    if (q.type === 'yesno') return <div style={{ display: 'flex', gap: 8 }}>{['Yes', 'No'].map(o => <button key={o} type="button" onClick={() => setA(q.id, o)} style={{ padding: '10px 22px', borderRadius: 9, fontSize: 15, fontWeight: 700, cursor: 'pointer', border: v === o ? 'none' : `1px solid ${LINE}`, background: v === o ? GOLD : '#fff', color: v === o ? '#fff' : MUT }}>{o}</button>)}</div>
    if (q.type === 'select') { const opts = Array.isArray(q.options) ? q.options : String(q.options || '').split(',').map(s => s.trim()).filter(Boolean); return <select value={v || ''} onChange={e => setA(q.id, e.target.value)} style={inp}><option value="">Select…</option>{opts.map(o => <option key={o} value={o}>{o}</option>)}</select> }
    return <input value={v || ''} onChange={e => setA(q.id, e.target.value)} style={inp} placeholder={q.placeholder || ''} />
  }

  const scrollToApply = () => { const el = document.getElementById('apply-form'); if (el) el.scrollIntoView({ behavior: 'smooth' }) }

  const submit = async () => {
    setErr('')
    if (!f.name.trim()) return setErr('Please enter your name.')
    if (!f.phone.trim() || f.phone.replace(/\D/g, '').length < 10) return setErr('Please enter a valid mobile number.')
    for (const q of questions) if (q.required && !ans[q.id]) return setErr('Please answer: ' + q.label)
    setBusy(true)
    try {
      let cv_url = null, cv_name = null
      if (file) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`
        const up = await supa.storage.from('applicant-files').upload(path, file, { upsert: false, contentType: file.type || undefined })
        if (up.error) throw new Error('File upload failed: ' + up.error.message)
        cv_url = supa.storage.from('applicant-files').getPublicUrl(path).data.publicUrl; cv_name = file.name
      }
      const { error } = await supa.from('hiring_applications').insert([{
        role_id: role.id, role: role.title, name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() || null,
        years_experience: f.years_experience === '' ? null : Number(f.years_experience), current_city: f.current_city.trim() || null,
        answers: ans, cv_url, cv_name,
      }])
      if (error) throw error
      onDone()
    } catch (e) { setErr(e.message || 'Something went wrong. Please try again.') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'Manrope, system-ui, sans-serif', color: INK, WebkitTextSizeAdjust: '100%' }}>
      <div style={{ width: '100%', maxWidth: 640, margin: '0 auto', padding: '0 16px 48px', boxSizing: 'border-box' }}>
        <div style={{ padding: '18px 2px 6px' }}>
          {showBack && <button onClick={onBack} style={{ fontSize: 13, fontWeight: 700, color: MUT, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8 }}>← All openings</button>}
          <div style={{ fontSize: 20, letterSpacing: '-0.01em' }}><b style={{ fontWeight: 800 }}>HILO</b> DESIGN</div>
        </div>

        {/* Hero */}
        <div style={{ background: INK, color: '#fff', borderRadius: 16, padding: '22px 20px', marginBottom: 14 }}>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, lineHeight: 1.2 }}>{role.title}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: role.description ? 12 : 0 }}>
            {role.employment_type && <span style={chipLight}>{role.employment_type}</span>}
            {role.location && <span style={chipLight}>📍 {role.location}</span>}
            {role.experience_required && <span style={chipLight}>🎯 {role.experience_required}</span>}
          </div>
          {role.description && <div style={{ fontSize: 14.5, color: '#e7e3d8', lineHeight: 1.6, marginBottom: 16 }}>{role.description}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={scrollToApply} style={{ fontSize: 14.5, fontWeight: 800, padding: '11px 20px', borderRadius: 11, border: 'none', background: GOLD, color: '#fff', cursor: 'pointer' }}>Apply now →</button>
            <IgButton light />
          </div>
        </div>

        {/* JD */}
        <JDSection title="What you'll do" items={bullets(role.responsibilities)} />
        <JDSection title="What we're looking for" items={bullets(role.requirements)} />
        <JDSection title="Nice to have" items={bullets(role.nice_to_have)} />
        <JDSection title="What we offer" items={bullets(role.what_we_offer)} />

        {/* Application */}
        <div id="apply-form" style={{ fontSize: 16, fontWeight: 800, color: INK, margin: '8px 2px 10px' }}>Apply for this role</div>

        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>About you</div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Full name *</label><input value={f.name} onChange={e => set('name', e.target.value)} style={inp} placeholder="Your name" /></div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Mobile number *</label><input value={f.phone} onChange={e => set('phone', e.target.value)} style={inp} placeholder="10-digit mobile" inputMode="tel" /></div>
          <div style={{ marginBottom: 12 }}><label style={lbl}>Email</label><input value={f.email} onChange={e => set('email', e.target.value)} style={inp} placeholder="you@email.com" inputMode="email" /></div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 150px' }}><label style={lbl}>Years of experience</label><input value={f.years_experience} onChange={e => set('years_experience', e.target.value.replace(/[^0-9.]/g, ''))} style={inp} placeholder="e.g. 3" inputMode="decimal" /></div>
            <div style={{ flex: '1 1 150px' }}><label style={lbl}>Current city</label><input value={f.current_city} onChange={e => set('current_city', e.target.value)} style={inp} placeholder="e.g. Hyderabad" /></div>
          </div>
        </div>

        {questions.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 800, color: MUT, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>A few about the role</div>
            {questions.map((q, i) => (
              <div key={q.id || i} style={{ marginBottom: i === questions.length - 1 ? 0 : 18 }}>
                <label style={lbl}>{q.label}{q.required ? ' *' : ''}</label>
                {q.help && <div style={sub}>{q.help}</div>}
                {renderQ(q)}
              </div>
            ))}
          </div>
        )}

        <div style={card}>
          <label style={lbl}>Attach your CV / résumé</label>
          <div style={sub}>PDF, Word doc or image · up to 10 MB.</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px', border: `1px dashed ${file ? GOLD : LINE}`, borderRadius: 10, cursor: 'pointer', background: file ? GOLD + '10' : '#fff' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: file ? GOLD : MUT }}>{file ? '✓ ' + file.name : '📎 Choose file…'}</span>
            <input type="file" accept=".pdf,.doc,.docx,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={e => { const x = e.target.files && e.target.files[0]; if (x && x.size > 10 * 1024 * 1024) { setErr('File is over 10 MB.'); setFile(null); return } setErr(''); setFile(x || null) }} style={{ display: 'none' }} />
          </label>
          {file && <button type="button" onClick={() => setFile(null)} style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: MUT, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove file</button>}
        </div>

        {err && <div style={{ background: '#fdecea', border: '1px solid #f5c6c2', color: DANGER, padding: 11, borderRadius: 10, fontSize: 13, marginBottom: 12 }}>{err}</div>}
        <button onClick={submit} disabled={busy} style={{ width: '100%', padding: 15, fontSize: 15.5, fontWeight: 800, borderRadius: 12, border: 'none', cursor: busy ? 'default' : 'pointer', background: GOLD, color: '#fff', opacity: busy ? 0.6 : 1 }}>{busy ? 'Submitting…' : 'Submit application'}</button>
        <div style={{ textAlign: 'center', fontSize: 11, color: MUT, marginTop: 14 }}>HILO DESIGN · We'll only use your details for this application.</div>
      </div>
    </div>
  )
}

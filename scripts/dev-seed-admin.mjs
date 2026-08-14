#!/usr/bin/env node
/**
 * Dev bootstrap helper — creates Auth user + team_members admin row.
 *
 * Prefers SUPABASE_SERVICE_ROLE_KEY (Dashboard → Settings → API → service_role).
 * Falls back to anon signUp if service role is missing (may require email confirm off).
 *
 * Usage:
 *   node scripts/dev-seed-admin.mjs
 *   DEV_ADMIN_EMAIL=you@test.com DEV_ADMIN_PASSWORD=secret123 node scripts/dev-seed-admin.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (k) process.env[k] = v
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))
loadEnvFile(resolve(process.cwd(), '.env'))

const url = process.env.VITE_SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = (process.env.DEV_ADMIN_EMAIL || 'dev@hilo.local').toLowerCase()
const password = process.env.DEV_ADMIN_PASSWORD || 'HiloDev123!'
const name = process.env.DEV_ADMIN_NAME || 'Dev Admin'

if (!url || !anon) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const refFromUrl = new URL(url).hostname.split('.')[0]
const refFromKey = JSON.parse(Buffer.from(anon.split('.')[1], 'base64url').toString()).ref
if (refFromUrl !== refFromKey) {
  console.error(`URL/key mismatch: URL ref=${refFromUrl} but anon JWT ref=${refFromKey}`)
  process.exit(1)
}

async function ensureTeamMember(admin, userId) {
  const { error } = await admin.from('team_members').upsert(
    {
      user_id: userId,
      email,
      name,
      role: 'admin',
      is_active: true,
      tabs: [],
    },
    { onConflict: 'user_id' }
  )
  if (error) throw new Error(`team_members upsert failed: ${error.message}`)
}

async function main() {
  console.log('Project:', url)
  console.log('Admin email:', email)

  if (service) {
    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Apply bootstrap SQL pieces we can via REST? Tables must already exist.
    // Create / update auth user
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (list.error) throw list.error
    let user = (list.data?.users || []).find((u) => (u.email || '').toLowerCase() === email)

    if (!user) {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      })
      if (created.error) throw created.error
      user = created.data.user
      console.log('Created auth user:', user.id)
    } else {
      const updated = await admin.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
        user_metadata: { name },
      })
      if (updated.error) throw updated.error
      user = updated.data.user
      console.log('Updated existing auth user:', user.id)
    }

    await ensureTeamMember(admin, user.id)
    console.log('Upserted team_members as admin')
  } else {
    console.warn('No SUPABASE_SERVICE_ROLE_KEY — trying anon signUp (weaker path)')
    const client = createClient(url, anon)
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) throw error
    const user = data.user
    if (!user) throw new Error('signUp returned no user (email confirm may be required)')
    console.log('Signed up user:', user.id, 'session:', !!data.session)

    if (data.session) {
      const { error: upErr } = await client.from('team_members').upsert(
        {
          user_id: user.id,
          email,
          name,
          role: 'admin',
          is_active: true,
          tabs: [],
        },
        { onConflict: 'user_id' }
      )
      if (upErr) {
        console.error('Could not insert team_members with anon session:', upErr.message)
        console.error('Add SUPABASE_SERVICE_ROLE_KEY to .env.local and re-run.')
        process.exit(1)
      }
      console.log('Upserted team_members as admin')
    } else {
      console.error('No session after signUp — confirm email is likely required.')
      console.error('Disable email confirm in Auth settings, or add SUPABASE_SERVICE_ROLE_KEY.')
      process.exit(1)
    }
  }

  // Verify login
  const verify = createClient(url, anon)
  const { data: login, error: loginErr } = await verify.auth.signInWithPassword({ email, password })
  if (loginErr) throw loginErr
  const { data: member, error: mErr } = await verify.from('team_members').select('*').eq('user_id', login.user.id).maybeSingle()
  if (mErr) throw mErr
  console.log('\n✅ Login OK')
  console.log('   email:', email)
  console.log('   password:', password)
  console.log('   role:', member?.role || '(no team_members row!)')
  console.log('\nOpen http://localhost:5173 and sign in with these credentials.')
}

main().catch((e) => {
  console.error('\n❌', e.message || e)
  process.exit(1)
})

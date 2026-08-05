#!/usr/bin/env node
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
    if (!process.env[k]) process.env[k] = v
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'))

const url = process.env.VITE_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !service) {
  console.error('Need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(url, service, { auth: { persistSession: false } })
const tables = [
  'shopify_orders', 'order_line_items', 'outsource_vendors', 'stores',
  'loyalty_tiers', 'catalogue_products', 'departments', 'customers',
]

console.log('Checking stub tables on', url)
const missing = []
for (const t of tables) {
  const { error } = await admin.from(t).select('*').limit(1)
  if (error && /Could not find the table|schema cache|does not exist/i.test(error.message)) {
    missing.push(t)
    console.log('  MISSING', t)
  } else if (error) {
    console.log('  ERROR  ', t, error.message)
  } else {
    console.log('  OK     ', t)
  }
}

if (missing.length) {
  console.log('\nPaste & run in Supabase → SQL Editor:')
  console.log('  supabase/dev-stubs-login.sql')
  console.log('Missing:', missing.join(', '))
  process.exit(2)
}

console.log('\nAll login stub tables present.')

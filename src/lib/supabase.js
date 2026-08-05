import { createClient } from '@supabase/supabase-js'

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPA_URL || !SUPA_KEY) {
  throw new Error(
    '[HILO] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill in your Supabase project keys.'
  )
}

export const SUPABASE_URL = SUPA_URL
export const SUPABASE_ANON_KEY = SUPA_KEY
export const isDevSupabase = import.meta.env.DEV

export const isMissingTableError = (error) => {
  if (!error) return false
  const msg = String(error.message || error || '')
  const code = String(error.code || '')
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    /Could not find the table/i.test(msg) ||
    /schema cache/i.test(msg) ||
    /does not exist/i.test(msg)
  )
}

export const supa = createClient(SUPA_URL, SUPA_KEY)

// Paginated fetch — Supabase caps at 1000 rows per request
export async function fetchAllProducts() {
  var PAGE = 1000
  var all = []
  var from = 0
  while (true) {
    var { data, error } = await supa.from('design_products').select('*').is('deleted_at', null).range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

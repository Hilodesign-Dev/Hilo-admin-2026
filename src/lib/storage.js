import { supa } from './supabase'
import { _logChange } from './logger'

// DEPRECATED: localStorage-based storage is being replaced by direct Supabase queries.
// These functions are kept for backward compatibility during migration but should not
// be used for new code. Use direct supa.from('table_name') queries instead.

export const load = (key, fallback) => {
  console.warn('[HILO][DEPRECATED] load("' + key + '") called — migrate to direct Supabase query')
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

let _saveDebounce = null
export const save = (key, val) => {
  console.warn('[HILO][DEPRECATED] save("' + key + '") called — migrate to direct Supabase upsert')
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {}
  // Fire a success event so Toaster still shows the save confirmation
  clearTimeout(_saveDebounce)
  _saveDebounce = setTimeout(() =>
    window.dispatchEvent(new CustomEvent('hl-save', { detail: { ok: true } }))
  , 600)
}

// Upload an image to Supabase Storage and return the public URL
export const uploadImage = async (file, folder) => {
  var ext = file.name.split('.').pop().toLowerCase()
  var fname = folder + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext
  var { data, error } = await supa.storage.from('hilo-images').upload(fname, file, { cacheControl: '3600', upsert: false })
  if (error) { console.error('Upload error:', error); throw error }
  var { data: urlData } = supa.storage.from('hilo-images').getPublicUrl(fname)
  return urlData.publicUrl
}

// Pull all keys from Supabase and hydrate localStorage
// Returns { ok: true/false, data: raw rows } so caller can fallback to in-memory if localStorage fails
export const syncFromSupabase = async (attempt = 1) => {
  try {
    const { data, error } = await supa.from('app_state').select('*')
    if (error) {
      console.error('[HILO] syncFromSupabase error:', error.message || error)
      // Retry once on failure (covers expired JWT race)
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1500))
        return syncFromSupabase(attempt + 1)
      }
      return { ok: false, data: null }
    }
    if (!data || data.length === 0) return { ok: false, data: null }
    var failedKeys = []
    data.forEach(row => {
      try {
        localStorage.setItem(row.key, JSON.stringify(row.value))
      } catch (e) {
        failedKeys.push(row.key)
        console.warn('[HILO] localStorage write failed for', row.key, e.message)
      }
    })
    if (failedKeys.length > 0) {
      console.warn('[HILO] localStorage failed for keys:', failedKeys.join(', '))
    }
    return { ok: true, data: data, failedKeys: failedKeys }
  } catch (e) {
    console.error('[HILO] syncFromSupabase exception:', e.message || e)
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 1500))
      return syncFromSupabase(attempt + 1)
    }
    return { ok: false, data: null }
  }
}

/**
 * Indian GST state codes — the 2-digit prefix that begins every GSTIN.
 * Used by the Stores Master, GSTIN validation, and place-of-supply routing
 * for invoice tax-split (CGST+SGST for intra-state, IGST for inter-state).
 */

export const GST_STATE_CODES = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman and Diu' },
  { code: '26', name: 'Dadra and Nagar Haveli' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (Old)' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
  { code: '99', name: 'Centre Jurisdiction' },
]

export const stateNameByCode = (code) =>
  GST_STATE_CODES.find(s => s.code === code)?.name || ''
export const stateCodeByName = (name) =>
  GST_STATE_CODES.find(s => s.name === name)?.code || ''

// GSTIN format: 2-digit state + 10-char PAN + 1 entity + 'Z' + 1 checksum
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/

export const validateGstin = (gstin, expectedStateCode = null) => {
  if (!gstin) return { ok: false, reason: 'GSTIN is required' }
  const upper = String(gstin).toUpperCase().trim()
  if (!GSTIN_REGEX.test(upper)) return { ok: false, reason: 'GSTIN format is invalid' }
  if (expectedStateCode && upper.slice(0, 2) !== expectedStateCode) {
    return { ok: false, reason: `GSTIN state prefix should be ${expectedStateCode}` }
  }
  return { ok: true, normalized: upper }
}

// PAN format: 5 letters + 4 digits + 1 letter
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
export const validatePan = (pan) => {
  if (!pan) return { ok: true }
  const upper = String(pan).toUpperCase().trim()
  if (!PAN_REGEX.test(upper)) return { ok: false, reason: 'PAN format is invalid' }
  return { ok: true, normalized: upper }
}

/**
 * Decide GST split for a sale.
 * @returns { kind: 'intra' | 'inter' | 'unknown', stateCode: string | null }
 */
export const placeOfSupply = (sellerStore, buyer) => {
  if (!sellerStore?.state_code) return { kind: 'unknown', stateCode: null }
  if (!buyer?.state_code)       return { kind: 'unknown', stateCode: null }
  if (sellerStore.state_code === buyer.state_code) {
    return { kind: 'intra', stateCode: sellerStore.state_code }
  }
  return { kind: 'inter', stateCode: buyer.state_code }
}

/**
 * Order-level place-of-supply with walk-out handling.
 * In-store mode + no delivery state → intra-state (store's own state).
 */
export const orderPlaceOfSupply = (order, store) => {
  // Seller is registered in Telangana (GSTIN starts 36). Place of supply is the
  // SELLING store's physical state: Jubilee + Online Assist/Online HQ = Telangana
  // (intra → CGST+SGST); Bangalore store = Karnataka (inter → IGST).
  const sellerState = (store?.gstin || '').slice(0, 2) || '36'
  const posState = store?.state_code || order?.delivery_state_code || sellerState
  const kind = sellerState === posState ? 'intra' : 'inter'
  return { kind, stateCode: posState, code: posState, label: stateNameByCode(posState) || order?.delivery_state || '' }
}

/** Split a GST amount into CGST/SGST/IGST based on a place-of-supply result. */
export const splitGstAmount = (gstAmount, pos) => {
  const amt = Number(gstAmount || 0)
  if (pos?.kind === 'inter') return { igst: amt, cgst: 0, sgst: 0 }
  const half = +(amt / 2).toFixed(2)
  return { igst: 0, cgst: half, sgst: +(amt - half).toFixed(2) }
}

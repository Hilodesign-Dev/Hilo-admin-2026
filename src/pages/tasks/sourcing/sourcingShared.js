export const STAGES = [
  { id: 'prospect',         label: 'Prospect',        color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  { id: 'contacted',        label: 'Contacted',       color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  { id: 'sample_requested', label: 'Sample Requested',color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
  { id: 'sample_received',  label: 'Sample Received', color: '#0891b2', bg: 'rgba(8,145,178,0.1)' },
  { id: 'sample_approved',  label: 'Sample Approved', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
  { id: 'trial_po',         label: 'Trial PO',        color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
  { id: 'onboarded',        label: 'Onboarded',       color: '#059669', bg: 'rgba(5,150,105,0.12)' },
  { id: 'dropped',          label: 'Dropped',         color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
]
export const stageMeta = (id) => STAGES.find(s => s.id === id) || STAGES[0]
export const DROP_REASONS = ['poor sample quality','price too high','unresponsive','MOQ too high','lead time too long','no GST','bad references','other']
export const DISCOVERED_VIA = ['trip','referral','inbound','exhibition','other']
export const FILE_TYPES = ['price_list','catalog','brochure','photo','whatsapp_export','other']
export const digits = (s) => String(s || '').replace(/\D/g, '')
export const waLink = (phone) => { const d = digits(phone); return d ? `https://wa.me/${d.length === 10 ? '91' + d : d}` : null }

// Meta CAPI display helpers for the Leads CRM (shared by list, detail, log).
export const META_QUALIFIED_STATUSES = ['Store Visit Booked', 'Proposal Sent', 'To be Closed']
export const META_LOST_STATUSES = ['Lost']            // NOT 'Not Qualified' (default state)
export const META_DEFAULT_QL_VALUE = 18000

// Map a lead's stored CAPI state (or, before any push, its derived intent) to a pill.
export function leadCapiBadge(lead) {
  const st = lead?.meta_capi_status
  const ev = lead?.meta_capi_last_event
  if (st === 'success') {
    const lbl = ev === 'QualifiedLead' ? 'Qualified' : ev === 'LostLead' ? 'Lost sent' : ev === 'Lead' ? 'Lead sent' : 'Pushed'
    return { label: lbl, bg: '#ecfdf5', color: '#059669', title: `Pushed ${ev || ''}${lead.meta_capi_last_sent_at ? ' · ' + new Date(lead.meta_capi_last_sent_at).toLocaleString('en-IN') : ''}` }
  }
  if (st === 'failed') return { label: 'Failed', bg: '#fef2f2', color: '#dc2626', title: 'Last push failed — retry' }
  if (st === 'skipped') return { label: 'No contact', bg: '#fff7ed', color: '#ea580c', title: lead?.meta_capi_skip_reason || 'Skipped' }
  const status = lead?.status, quality = lead?.lead_quality
  if (META_LOST_STATUSES.includes(status)) return { label: 'Will send Lost', bg: '#f1f5f9', color: '#64748b', title: 'Eligible: LostLead' }
  if (META_QUALIFIED_STATUSES.includes(status) && quality === 'High Quality') return { label: 'Will send Qualified', bg: '#fefce8', color: '#ca8a04', title: 'Eligible: QualifiedLead' }
  return { label: 'Not tracked', bg: '#f3f4f6', color: '#9ca3af', title: 'No Meta event for this stage/quality' }
}

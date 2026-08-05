import React, { useState } from 'react'
import { supa } from '../../lib/supabase'
import { toast } from '../../lib/designTokens'
import { logAndToast } from '../../lib/logger'
import { POS_T, MIcon } from './tokens'
import { generateReceipt, shareReceiptUrl } from '../../lib/receipts'

/**
 * Share Receipt modal.
 *
 * One artefact, one source of truth: the URL the customer receives and
 * the PDF the staff downloads render byte-identical HTML (the same
 * /#/r/<token> page). Thermal slip is intentionally absent here — it
 * stays on the POS tab only.
 *
 * Layout (top to bottom):
 *   - WhatsApp / SMS / Email / Copy link  (2x2 grid; all send the same URL)
 *   - PRINT section: Download PDF + Preview invoice link
 *   - Done
 */
const ShareReceiptModal = ({ order, customer, onClose }) => {
  const shareUrl = shareReceiptUrl(order)
  const [stamping, setStamping] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const stamp = async (via) => {
    setStamping(true)
    try {
      await supa.from('shopify_orders').update({
        receipt_sent_at: new Date().toISOString(),
        receipt_sent_via: via,
      }).eq('id', order.id)
    } catch (e) { console.error(e) }
    setStamping(false)
  }

  // §4 copy — same body across all three channels.
  const balance = Number(order.payment_balance || 0)
  const message =
`Hello ${customer?.name || 'there'}, your Hilo Design tax invoice is ready.

View & download: ${shareUrl || '(link unavailable)'}

Order ${order.order_number} · Total ₹${Number(order.total_price || 0).toLocaleString('en-IN')}${balance > 0 ? ` · Balance ₹${balance.toLocaleString('en-IN')}` : ''}

Reply here if anything looks off — we'll sort it the same day.
— The Hilo studio`

  const phone = (customer?.phone || order.delivery_phone || '').replace(/[^0-9]/g, '')
  const email = customer?.email || ''

  const whatsApp = () => {
    if (!phone) { toast(false, 'No phone number for this customer'); return }
    stamp('whatsapp')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
  }
  const sms = () => {
    if (!phone) { toast(false, 'No phone number'); return }
    stamp('sms')
    window.open(`sms:${phone}?body=${encodeURIComponent(message)}`, '_blank')
  }
  const sendEmail = () => {
    if (!email) { toast(false, 'No email on file'); return }
    stamp('email')
    const subject = `Your Hilo Design tax invoice — ${order.order_number}`
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`, '_blank')
  }
  const copyLink = () => {
    if (!shareUrl) { toast(false, 'No share URL'); return }
    if (navigator.clipboard) navigator.clipboard.writeText(shareUrl)
    stamp('manual')
    toast(true, 'Link copied to clipboard')
  }

  // Download PDF = open the same /r/<token> page in a print window
  // (browser prints → Save as PDF). Byte-identical to what the
  // customer sees at shareUrl.
  const downloadPdf = async () => {
    setDownloading(true)
    try {
      await generateReceipt(order.id, { variant: 'a4' })
    } catch (e) {
      logAndToast('invoice', 'Could not generate invoice: ' + (e.message || e), e)
    } finally {
      setDownloading(false)
    }
  }

  const previewInvoice = () => {
    if (!shareUrl) { toast(false, 'No share URL — order may need to be saved first'); return }
    window.open(shareUrl, '_blank')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.55)' }}>
      <div className="w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col mobile-sheet"
        style={{ background: POS_T.surfaceContainerLowest, maxHeight: '95vh' }}>
        <div className="mobile-sheet-handle sm:hidden" />

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${POS_T.outlineVariant}` }}>
          <div className="flex items-center gap-2">
            <MIcon name="receipt_long" size={20} fill style={{ color: POS_T.primary }} />
            <div className="font-bold text-base" style={{ color: POS_T.onSurface }}>Share receipt</div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70" style={{ color: POS_T.onSurfaceVariant }}>
            <MIcon name="close" size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="text-sm" style={{ color: POS_T.onSurfaceVariant }}>
            Sending receipt for <span className="font-bold" style={{ color: POS_T.onSurface }}>{order.order_number}</span> to <span className="font-bold" style={{ color: POS_T.onSurface }}>{customer?.name || 'customer'}</span>.
          </div>

          {/* 4 send channels */}
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={whatsApp}  disabled={!phone   || stamping} color={POS_T.success}   icon="chat"  label="WhatsApp" />
            <Btn onClick={sms}       disabled={!phone   || stamping} color={POS_T.tertiary}  icon="sms"   label="SMS" />
            <Btn onClick={sendEmail} disabled={!email   || stamping} color={POS_T.secondary} icon="email" label="Email" />
            <Btn onClick={copyLink}  disabled={!shareUrl|| stamping} color={POS_T.primary}   icon="link"  label="Copy link" />
          </div>

          {/* PRINT section */}
          <div style={{ borderTop: `1px solid ${POS_T.outlineVariant}`, paddingTop: 14 }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: POS_T.onSurfaceVariant }}>Print</span>
              <span className="flex-1 h-px" style={{ background: POS_T.outlineVariant }}></span>
            </div>
            <div className="flex items-center gap-3">
              <Btn onClick={downloadPdf} disabled={downloading} color={POS_T.onSurface} icon="picture_as_pdf" label={downloading ? 'Generating…' : 'Download PDF'} outline />
              <button onClick={previewInvoice}
                className="text-xs font-bold inline-flex items-center gap-1 hover:underline"
                style={{ color: POS_T.primary }}>
                Preview invoice
                <MIcon name="open_in_new" size={12} />
              </button>
            </div>
            <div className="text-[10px] mt-2" style={{ color: POS_T.onSurfaceVariant }}>
              Same artefact as the share link. Use Save as PDF in the print dialog.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex justify-end" style={{ borderTop: `1px solid ${POS_T.outlineVariant}`, background: POS_T.surfaceContainerLow, paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
          <button onClick={onClose}
            className="text-sm font-bold px-4 py-2.5 rounded-full"
            style={{ border: `1px solid ${POS_T.outlineVariant}`, color: POS_T.onSurface }}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

const Btn = ({ onClick, disabled, color, icon, label, outline }) => (
  <button onClick={onClick} disabled={disabled}
    className="text-sm font-bold px-3 py-2.5 rounded-lg inline-flex items-center justify-center gap-1.5"
    style={{
      background: outline ? 'transparent' : color,
      color: outline ? color : '#fff',
      border: outline ? `1px solid ${color}` : 'none',
      opacity: disabled ? 0.4 : 1,
    }}>
    <MIcon name={icon} size={16} />
    {label}
  </button>
)

export default ShareReceiptModal

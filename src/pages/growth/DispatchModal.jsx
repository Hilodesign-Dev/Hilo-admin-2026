import React, { useState } from 'react'
import Modal from '../../components/Modal'

const DispatchModal = ({ order, onConfirm, onClose }) => {
  const [shipper, setShipper] = useState('');
  const [awb, setAwb] = useState('');
  const [contact, setContact] = useState('');

  const canSubmit = shipper.trim() && awb.trim();

  return (
    <Modal title={`Dispatch Order ${order.order_number}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Enter shipping details to dispatch this order. All line items will be marked as <b>Shipped</b>.
        </p>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Shipper / Courier *</label>
          <input
            value={shipper} onChange={e => setShipper(e.target.value)}
            placeholder="e.g. Delhivery, BlueDart, DTDC…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">AWB / Tracking Number *</label>
          <input
            value={awb} onChange={e => setAwb(e.target.value)}
            placeholder="e.g. 1234567890"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Contact Person (optional)</label>
          <input
            value={contact} onChange={e => setContact(e.target.value)}
            placeholder="Delivery contact name"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-300 outline-none"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100">Cancel</button>
          <button
            onClick={() => canSubmit && onConfirm({ shipper: shipper.trim(), awb: awb.trim(), contact: contact.trim() })}
            disabled={!canSubmit}
            className="btn-gold px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
          >
            🚚 Dispatch Order
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default DispatchModal

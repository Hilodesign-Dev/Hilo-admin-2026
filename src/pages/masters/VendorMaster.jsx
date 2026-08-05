import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, nextId } from '../../lib/helpers'
import MasterTable from '../../components/MasterTable'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import FabricVendorTable from './FabricVendorTable'
import OutsourceVendorTable from './OutsourceVendorTable'

const VendorMaster = ({ fabricVendors, setFabricVendors, outsourceVendors, setOutsourceVendors }) => {
  const [vTab, setVTab] = useState('fabric');
  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setVTab('fabric')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${vTab==='fabric'?'bg-white shadow-sm text-gray-800':'text-gray-500 hover:text-gray-700'}`}>Fabric Vendors</button>
        <button onClick={() => setVTab('outsource')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${vTab==='outsource'?'bg-white shadow-sm text-gray-800':'text-gray-500 hover:text-gray-700'}`}>Outsource Vendors</button>
      </div>
      {vTab === 'fabric' && <FabricVendorTable vendors={fabricVendors} setVendors={setFabricVendors} />}
      {vTab === 'outsource' && <OutsourceVendorTable vendors={outsourceVendors} setVendors={setOutsourceVendors} />}
    </div>
  );
};

// ─── Fabric Master ────────────────────────────────────────────────────────────

export default VendorMaster

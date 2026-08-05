import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { save, load } from '../../lib/storage'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n } from '../../lib/helpers'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import FabricVendorsTab from './FabricVendorsTab'
import FabricMasterTab from './FabricMasterTab'
import MaterialsTab from './MaterialsTab'
import PurchaseOrdersTab from './PurchaseOrdersTab'
import FabricInventoryTab from './FabricInventoryTab'

const FabricManagement = ({ onFabricsLoaded, onVendorsLoaded }) => {
  const [subTab, setSubTab] = useState('master');
  const [loading, setLoading] = useState(false);

  return (
    <div className="fade-in p-4 sm:p-8">
      <h1 style={{fontFamily:"Manrope,sans-serif",fontSize:"1.5rem",fontWeight:800,letterSpacing:"-0.02em",color:"#1b1c1a",lineHeight:1.1,marginBottom:4}} className="sm:text-3xl">Fabrics & Materials</h1>
      <p className="page-subtitle mb-5">Fabric & material sourcing, inventory & purchase orders</p>
      <div className="flex gap-1 p-1 rounded-lg sm:rounded-xl w-full sm:w-fit mb-5 overflow-x-auto flex-wrap sm:flex-nowrap" style={{background:'#efeeea'}}>
        {[
          { id: 'master', label: 'Fabric Master' },
          { id: 'materials', label: 'Materials' },
          { id: 'vendors', label: 'Vendors' },
          { id: 'po', label: 'Purchase Orders' },
          { id: 'inventory', label: 'Inventory' },
        ].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex-shrink-0 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${subTab === t.id ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            style={subTab === t.id ? {color:'#795900',fontWeight:600} : {}}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{display: subTab === 'vendors' ? 'block' : 'none'}}><FabricVendorsTab onVendorsLoaded={onVendorsLoaded} /></div>
      <div style={{display: subTab === 'master' ? 'block' : 'none'}}><FabricMasterTab onFabricsLoaded={onFabricsLoaded} /></div>
      <div style={{display: subTab === 'materials' ? 'block' : 'none'}}><MaterialsTab /></div>
      <div style={{display: subTab === 'po' ? 'block' : 'none'}}><PurchaseOrdersTab activeSubTab={subTab} /></div>
      <div style={{display: subTab === 'inventory' ? 'block' : 'none'}}><FabricInventoryTab /></div>
    </div>
  );
};

// ─── Vendor Form Primitives (defined outside component to avoid re-mount on re-render) ──
var VLabel = function(props) { return <label style={{fontFamily:'Manrope,sans-serif',fontSize:11,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',color:'#4e4636',display:'block',marginBottom:4}}>{props.children} {props.req && <span style={{color:'#ba1a1a',fontSize:14,lineHeight:1}}>✱</span>}</label>; };
var VInput = function(props) { var mono = props.mono; var rest = Object.assign({}, props); delete rest.mono; delete rest.style; return <input {...rest} style={{...{background:'transparent',border:'none',borderBottom:'1px solid rgba(210,197,177,0.4)',borderRadius:0,paddingLeft:0,paddingRight:0,width:'100%',fontSize:14,paddingTop:8,paddingBottom:8,color:'#1b1c1a',outline:'none'},...(mono ? {fontFamily:'JetBrains Mono,monospace',letterSpacing:'0.05em'} : {fontFamily:'Inter,sans-serif'}),...(props.style||{})}} className="" onFocus={function(e){e.target.style.borderBottom='2px solid #795900';}} onBlur={function(e){e.target.style.borderBottom='1px solid rgba(210,197,177,0.4)';}} />; };
var VTextarea = function(props) { return <textarea {...props} style={{background:'transparent',border:'none',borderBottom:'1px solid rgba(210,197,177,0.4)',borderRadius:0,paddingLeft:0,paddingRight:0,width:'100%',fontSize:14,paddingTop:8,paddingBottom:8,color:'#1b1c1a',outline:'none',minHeight:64,resize:'none',fontFamily:'Inter,sans-serif'}} className="" onFocus={function(e){e.target.style.borderBottom='2px solid #795900';}} onBlur={function(e){e.target.style.borderBottom='1px solid rgba(210,197,177,0.4)';}} />; };

// ─── Fabric Vendors Tab ─────────────────────────────────────────────────────

export default FabricManagement

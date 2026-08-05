import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../../lib/supabase'
import { _logError, _logChange } from '../../lib/logger'
import { fmt, gst, n, nextId } from '../../lib/helpers'
import MasterTable from '../../components/MasterTable'
import StoreMaster from './StoreMaster'
import PromoCodeMaster from './PromoCodeMaster'
import LoyaltyTierMaster from './LoyaltyTierMaster'
import PaymentMethodMaster from './PaymentMethodMaster'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'
import { CATEGORIES } from '../../lib/constants'
// OutsourceVendorTable moved to Outsource Vendors tab
import ConsumptionMaster from './ConsumptionMaster'
import StitchingCostMaster from './StitchingCostMaster'
import CategoryMaster from './CategoryMaster'
import ColourMaster from './ColourMaster'
import ChannelMaster from './ChannelMaster'
import ChangeLogViewer from './ChangeLogViewer'
import BackupManager from './BackupManager'
import ErrorLogViewer from './ErrorLogViewer'
import DeletionLogViewer from './DeletionLogViewer'

const Masters = ({ stitching, setStitching, dyes, setDyes, categories, setCategories, outsourceVendors, setOutsourceVendors, consumption, setConsumption, channels, setChannels, fabrics }) => {
  const [tab, setTab] = useState('consumption');
  const tabs = [{ id: 'consumption', label: 'Consumption' }, { id: 'stitching', label: 'Stitching' }, { id: 'dye', label: 'Dye Types' }, { id: 'category', label: 'Categories' }, { id: 'colour', label: 'Colours' }, { id: 'channel', label: 'Channels' }, { id: 'stores', label: '🏬 Stores' }, { id: 'payment_methods', label: '💳 Payment Methods' }, { id: 'coupons', label: '🎟 Coupons' }, { id: 'tiers', label: '👑 Loyalty Tiers' }, { id: 'changelog', label: '📋 Change Log' }, { id: 'backup', label: '💾 Backup' }, { id: 'errorlog', label: '🐛 Errors' }, { id: 'deletionlog', label: '🗑️ Deletions' }];
  return (
    <div className="fade-in p-4 sm:p-8">
      <h1 style={{fontFamily:"Manrope,sans-serif",fontSize:"1.5rem",fontWeight:800,letterSpacing:"-0.02em",color:"#1b1c1a",lineHeight:1.1,marginBottom:4}} className="sm:text-3xl">Masters &amp; Settings</h1>
      <p className="page-subtitle mb-5">Administrative</p>
      <div className="flex gap-1 p-1 rounded-lg sm:rounded-xl w-full sm:w-fit mb-5 overflow-x-auto flex-wrap sm:flex-nowrap" style={{background:'#efeeea'}}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            style={tab === t.id ? {color:'#795900',fontWeight:600} : {}}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'consumption' && <ConsumptionMaster consumption={consumption} setConsumption={setConsumption} fabrics={fabrics} />}
      {tab === 'stitching' && <StitchingCostMaster items={stitching} setItems={setStitching} />}
      {tab === 'dye' && <MasterTable title="Dye Types Master" storageKey="hl_dyes" items={dyes} setItems={setDyes} addLabel="Add Dye"
        fields={[{ key: 'type', label: 'Dye Type', placeholder: 'Ombre Double Dye' }, { key: 'costPerMetre', label: 'Cost/Metre (₹)', type: 'number', placeholder: '80' }]} />}
      {tab === 'category' && <CategoryMaster categories={categories} setCategories={setCategories} />}
      {tab === 'colour' && <ColourMaster />}
      {tab === 'channel' && <ChannelMaster channels={channels} setChannels={setChannels} />}
      {tab === 'stores' && <StoreMaster />}
      {tab === 'coupons' && <PromoCodeMaster />}
      {tab === 'tiers' && <LoyaltyTierMaster />}
      {tab === 'payment_methods' && <PaymentMethodMaster />}
      {tab === 'changelog' && <ChangeLogViewer />}
      {tab === 'backup' && <BackupManager />}
      {tab === 'errorlog' && <ErrorLogViewer />}
      {tab === 'deletionlog' && <DeletionLogViewer />}
    </div>
  );
};

// ─── Colour Master ───────────────────────────────────────────────────────────
// ─── Change Log Viewer ───────────────────────────────────────────────────────

export default Masters

import React, { useState, useEffect } from 'react'
import { C, TOP_MEASUREMENTS, BOTTOM_MEASUREMENTS } from '../../lib/designTokens'
import CustomerDetailsTab from './CustomerDetailsTab'
import MeasurementsTab from './MeasurementsTab'
import ReadyMeasurementsTab from './ReadyMeasurementsTab'
import StyleProfileTab from './StyleProfileTab'
import CustomerOrdersTab from './CustomerOrdersTab'

const TOP_BODY_FIELDS = [
  { key: 'shirt_length', label: 'Shirt Length' },
  { key: 'chest', label: 'Chest' },
  { key: 'stomach', label: 'Stomach' },
  { key: 'collar', label: 'Collar' },
  { key: 'hip', label: 'Hip' },
  { key: 'waist', label: 'Waist' },
  { key: 'front_cross', label: 'Front Cross' },
  { key: 'back_cross', label: 'Back Cross' },
  { key: 'shoulder', label: 'Shoulder' },
  { key: 'sleeve_length', label: 'Sleeve Length' },
  { key: 'cuff', label: 'Cuff' },
  { key: 'biceps', label: 'Biceps' },
  { key: 'knee_length', label: 'Knee Length' },
  { key: 'sadri', label: 'Nehru Jacket Length' },
  { key: 'arm_hole', label: 'Arm Hole' },
  { key: 'coat_length', label: 'Coat Length' },
  { key: 'blazer_length', label: 'Blazer Length' },
  { key: 'sherwani_length', label: 'Sherwani Length' },
]

const BOTTOM_BODY_FIELDS = [
  { key: 'pant_waist', label: 'Pant Waist' },
  { key: 'pant_hip', label: 'Pant Hip' },
  { key: 'fork', label: 'Fork' },
  { key: 'crop_pant_length', label: 'Crop Pant Length' },
  { key: 'inside_length', label: 'Inside Length' },
  { key: 'thigh', label: 'Thigh' },
  { key: 'ankle', label: 'Ankle' },
  { key: 'knee', label: 'Knee' },
  { key: 'chudia_rounding', label: 'Chudia Rounding' },
  { key: 'calf', label: 'Calf' },
  { key: 'pant_length', label: 'Pant Length' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'chudia_pan_length', label: 'Chudia Pant Length' },
  { key: 'shoe_size', label: 'Shoe Size' },
  { key: 'height', label: 'Height' },
  { key: 'pagdi_size', label: 'Pagdi Size' },
]

const CustomerDetail = ({
  customer,
  measurement,
  styleProfile,
  customerTab,
  setCustomerTab,
  editingCustomer,
  setEditingCustomer,
  editingMeasurements,
  setEditingMeasurements,
  custForm,
  setCustForm,
  measForm,
  setMeasForm,
  styleForm,
  setStyleForm,
  readyMeasurements,
  setReadyMeasurements,
  saving,
  onBack,
  onSaveCustomer,
  onSaveMeasurement,
  onSaveStyleProfile,
  onSaveReadyMeasurement,
  initMeasForm,
  initStyleForm,
}) => {
  const handleEditCustomer = (cust) => {
    setCustForm({
      name: cust.name,
      phone: cust.phone,
      gender: cust.gender,
      relationship: cust.relationship,
      notes: cust.notes || '',
    })
    setEditingCustomer(true)
  }

  const handleEditMeasurements = () => {
    initMeasForm()
    setEditingMeasurements(true)
  }

  const handleEditStyleProfile = () => {
    initStyleForm()
  }

  const handleSaveCustomer = async () => {
    await onSaveCustomer(custForm, customer.id)
    setEditingCustomer(false)
  }

  const handleSaveMeasurement = async () => {
    await onSaveMeasurement(customer.id, measForm)
    setEditingMeasurements(false)
  }

  const handleSaveStyleProfile = async () => {
    await onSaveStyleProfile(customer.id, styleForm)
  }

  const handleSaveReadyMeasurement = async (section, data) => {
    await onSaveReadyMeasurement(customer.id, section, data)
  }

  return (
    <div style={{ padding: '20px', background: C.bg, minHeight: '100vh' }}>
      {/* Back Button */}
      <button
        onClick={onBack}
        style={{
          padding: '8px 16px',
          background: C.borderLight,
          border: `1px solid ${C.border}`,
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: '20px',
        }}
      >
        ← Back
      </button>

      {/* Header */}
      <h1 style={{ fontSize: '28px', fontWeight: 700, color: C.text, marginBottom: '20px' }}>{customer.name}</h1>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          borderBottom: `2px solid ${C.border}`,
          marginBottom: '24px',
          paddingBottom: '12px',
          overflowX: 'auto',
        }}
      >
        {['details', 'measurements', 'ready_measurements', 'style_profile', 'orders'].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setCustomerTab(tab)
              if (tab === 'measurements') initMeasForm()
              if (tab === 'style_profile') initStyleForm()
            }}
            style={{
              padding: '8px 16px',
              background: customerTab === tab ? C.gold : 'transparent',
              color: customerTab === tab ? '#fff' : C.text,
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {customerTab === 'details' && (
        <CustomerDetailsTab
          customer={customer}
          editingCustomer={editingCustomer}
          custForm={custForm}
          setCustForm={setCustForm}
          onEdit={handleEditCustomer}
          onSave={handleSaveCustomer}
          onCancel={() => setEditingCustomer(false)}
          saving={saving}
        />
      )}

      {customerTab === 'measurements' && (
        <MeasurementsTab
          customer={customer}
          measurement={measurement}
          editingMeasurements={editingMeasurements}
          measForm={measForm}
          setMeasForm={setMeasForm}
          onEdit={handleEditMeasurements}
          onSave={handleSaveMeasurement}
          onCancel={() => setEditingMeasurements(false)}
          saving={saving}
          TOP_BODY_FIELDS={TOP_BODY_FIELDS}
          BOTTOM_BODY_FIELDS={BOTTOM_BODY_FIELDS}
        />
      )}

      {customerTab === 'ready_measurements' && (
        <ReadyMeasurementsTab
          customer={customer}
          readyMeasurements={readyMeasurements}
          onSave={handleSaveReadyMeasurement}
          saving={saving}
        />
      )}

      {customerTab === 'style_profile' && (
        <StyleProfileTab
          customer={customer}
          styleForm={styleForm}
          setStyleForm={setStyleForm}
          readyMeasurements={readyMeasurements}
          onSave={handleSaveStyleProfile}
          saving={saving}
          editing={customerTab === 'style_profile'}
          onEdit={handleEditStyleProfile}
          onCancel={() => setCustomerTab('style_profile')}
        />
      )}

      {customerTab === 'orders' && <CustomerOrdersTab customer={customer} />}
    </div>
  )
}

export default CustomerDetail

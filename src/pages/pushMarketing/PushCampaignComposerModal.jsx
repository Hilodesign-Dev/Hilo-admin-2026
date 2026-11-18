import React, { useState, useEffect, useCallback } from 'react'
import { pushMarketingApi } from '../../lib/notificationsApi'
import { uploadImage } from '../../lib/storage'
import { toast } from '../../lib/designTokens'
import Icon from '../../components/Icon'
import PushPhonePreview from './PushPhonePreview'
import PushDevicePickerModal from './PushDevicePickerModal'

export default function PushCampaignComposerModal({ onClose, onCreated }) {
  // Campaign Info
  const [title, setTitle] = useState('')
  const [notificationTitle, setNotificationTitle] = useState('')
  const [notificationBody, setNotificationBody] = useState(
    'Hi {{name}}, explore our newly curated Festive Royal Collection! Handcrafted bespoke looks ready for your special occasions.',
  )
  const [route, setRoute] = useState('/collections')
  const [customRoute, setCustomRoute] = useState('')

  // Creative Image
  const [imageUrl, setImageUrl] = useState('')
  const [imageTab, setImageTab] = useState('upload') // 'upload' | 'url'
  const [uploadingImage, setUploadingImage] = useState(false)

  // Target Strategy: 'all_devices' | 'filtered' | 'custom_devices'
  const [targetType, setTargetType] = useState('all_devices')
  const [targetPlatforms, setTargetPlatforms] = useState(['android', 'ios'])
  const [selectedCities, setSelectedCities] = useState([])
  const [selectedStates, setSelectedStates] = useState([])
  const [customDevices, setCustomDevices] = useState([]) // Array of selected device objects
  const [showDevicePicker, setShowDevicePicker] = useState(false)

  // Available metadata & audience estimates
  const [availableCities, setAvailableCities] = useState([])
  const [availableStates, setAvailableStates] = useState([])
  const [estimatedCount, setEstimatedCount] = useState(0)
  const [loadingEstimate, setLoadingEstimate] = useState(false)

  // Test send state
  const [testTarget, setTestTarget] = useState(() => {
    try {
      return localStorage.getItem('push_marketing_test_target') || ''
    } catch {
      return ''
    }
  })
  const [sendingTest, setSendingTest] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  // Load available locations on mount
  useEffect(() => {
    pushMarketingApi
      .queryDevices({ limit: 1 })
      .then((res) => {
        if (res?.availableCities) setAvailableCities(res.availableCities)
        if (res?.availableStates) setAvailableStates(res.availableStates)
        const reach = res?.counts?.totalReachable ?? res?.totalCount ?? res?.platformCounts?.all
        if (reach != null) setEstimatedCount(reach)
      })
      .catch(() => {})
  }, [])

  // Calculate live audience estimate based on targetType and filters
  const updateAudienceEstimate = useCallback(async () => {
    if (targetType === 'custom_devices') {
      setEstimatedCount(customDevices.length)
      return
    }
    setLoadingEstimate(true)
    try {
      const platformParam =
        targetPlatforms.length === 1 ? targetPlatforms[0] : undefined

      const res = await pushMarketingApi.queryDevices({
        platform: platformParam,
        city: selectedCities.length === 1 ? selectedCities[0] : undefined,
        state: selectedStates.length === 1 ? selectedStates[0] : undefined,
        limit: 1,
        onlyActive: true,
      })
      const reach = res?.counts?.totalReachable ?? res?.totalCount ?? res?.platformCounts?.all
      setEstimatedCount(reach ?? 0)
    } catch {
      // ignore
    } finally {
      setLoadingEstimate(false)
    }
  }, [targetType, targetPlatforms, selectedCities, selectedStates, customDevices])

  useEffect(() => {
    updateAudienceEstimate()
  }, [updateAudienceEstimate])

  // Handle local image file upload via global storage util
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const url = await uploadImage(file, 'marketing-push')
      if (url) {
        setImageUrl(url)
        toast(true, 'Banner image uploaded to storage!')
      }
    } catch (err) {
      toast(false, err?.message || 'Failed to upload image')
    } finally {
      setUploadingImage(false)
    }
  }

  // Pre-configured deep link options
  const ROUTE_PRESETS = [
    { label: 'Collections Catalog', route: '/collections' },
    { label: 'Home Screen', route: '/home' },
    { label: 'AI Stylist Chat', route: '/stylist' },
    { label: 'Virtual Try-On Deck', route: '/stylist/try-on' },
    { label: 'Digital Wardrobe', route: '/wardrobe' },
    { label: 'Order Tracking', route: '/orders' },
    { label: 'Custom App Route...', route: 'custom' },
  ]

  const activeRoute = route === 'custom' ? customRoute.trim() || '/home' : route

  // Handle test send
  const handleSendTest = async () => {
    const raw = testTarget.trim()
    if (!raw) {
      toast(false, 'Please enter a test phone number, user ID, or device token')
      return
    }
    if (!notificationTitle.trim() || !notificationBody.trim()) {
      toast(false, 'Title and message body are required')
      return
    }
    setSendingTest(true)
    try {
      const payload = {
        title: notificationTitle.trim(),
        body: notificationBody.trim(),
        imageUrl: imageUrl.trim() || undefined,
        route: activeRoute,
      }
      if (raw.length > 50) {
        payload.token = raw
      } else if (raw.includes('-') && raw.length === 36) {
        payload.userId = raw
      } else {
        payload.phone = raw
      }

      await pushMarketingApi.sendTestPush(payload)
      try {
        localStorage.setItem('push_marketing_test_target', raw)
      } catch {}
      toast(true, `Test push delivered to ${raw}!`)
    } catch (err) {
      toast(false, err?.message || 'Failed to send test push')
    } finally {
      setSendingTest(false)
    }
  }

  // Handle save draft or launch broadcast
  const handleSaveCampaign = async (launchNow = false) => {
    setFormError(null)
    if (!title.trim()) {
      const msg = 'Please provide a campaign title'
      setFormError(msg)
      toast(false, msg)
      return
    }
    if (!notificationTitle.trim()) {
      const msg = 'Notification title cannot be empty'
      setFormError(msg)
      toast(false, msg)
      return
    }
    if (!notificationBody.trim()) {
      const msg = 'Notification message body cannot be empty'
      setFormError(msg)
      toast(false, msg)
      return
    }

    if (launchNow && estimatedCount === 0) {
      const msg = 'No reachable devices in the selected target segment'
      setFormError(msg)
      toast(false, msg)
      return
    }

    if (
      launchNow &&
      !window.confirm(
        `Launch push notification "${notificationTitle}" to ~${estimatedCount.toLocaleString()} devices now?`,
      )
    ) {
      return
    }

    setSubmitting(true)
    try {
      const normalizedTargetType =
        targetType === 'custom_devices'
          ? 'custom'
          : targetType === 'all_devices'
            ? 'all'
            : targetType

      const deviceTokens =
        targetType === 'custom_devices'
          ? customDevices
              .map(
                (d) =>
                  d.device_token ||
                  d.deviceToken ||
                  d.fcm_token ||
                  d.fcmToken ||
                  (typeof d === 'string' ? d : d.id),
              )
              .filter(Boolean)
          : undefined

      const payload = {
        title: title.trim(),
        notificationTitle: notificationTitle.trim(),
        body: notificationBody.trim(),
        imageUrl: imageUrl.trim() || undefined,
        route: activeRoute,
        targetType: normalizedTargetType,
        targetFilters: {
          platform: targetPlatforms.length === 1 ? targetPlatforms[0] : 'all',
          platforms: targetPlatforms,
          city: selectedCities[0] || undefined,
          cities: selectedCities,
          state: selectedStates[0] || undefined,
          states: selectedStates,
          customDeviceTokens: deviceTokens,
        },
        recipientDeviceIds: deviceTokens,
        customDeviceTokens: deviceTokens,
        isDraft: !launchNow,
        launchNow,
      }

      const res = await pushMarketingApi.createCampaign(payload)
      toast(
        true,
        launchNow
          ? 'Push campaign launched successfully!'
          : 'Campaign draft saved successfully!',
      )
      if (onCreated) onCreated(res)
      onClose()
    } catch (err) {
      const errMsg = err?.message || 'Failed to save campaign'
      setFormError(errMsg)
      toast(false, errMsg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-sm animate-fade-in text-[#1b1c1a]">
      <div className="bg-white border border-[#ebe8e0] rounded-3xl w-full max-w-6xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#ebe8e0] flex items-center justify-between bg-[#faf9f5]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#795900] to-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                <Icon name="megaphone" cls="w-4 h-4 text-white" />
              </span>
              <h2 className="text-xl font-bold font-serif text-[#1b1c1a]">
                New Push Notification Campaign
              </h2>
            </div>
            <p className="text-xs text-[#1b1c1a]/60 mt-1">
              Deliver targeted mobile push notifications with rich images, deep linking, and device segment controls.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-gray-600 flex items-center justify-center text-sm font-bold transition-all"
          >
            <Icon name="close" cls="w-4 h-4" />
          </button>
        </div>

        {/* Modal Top Alert: High-visibility error banner anchored at top of modal */}
        {formError && (
          <div className="mx-6 mt-4 p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-red-700 text-sm animate-fade-in shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                <Icon name="alert" cls="w-3.5 h-3.5 text-white" />
              </span>
              <span className="font-semibold">{formError}</span>
            </div>
            <button
              onClick={() => setFormError(null)}
              className="text-red-400 hover:text-red-700 text-base font-bold ml-3 p-1 rounded-lg hover:bg-red-100 transition-colors"
              title="Dismiss error"
            >
              <Icon name="close" cls="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 2-Column Composer Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 min-h-0">
          {/* Left Column: Form Controls (7 cols) */}
          <div className="lg:col-span-7 p-6 space-y-6 border-b lg:border-b-0 lg:border-r border-[#ebe8e0] overflow-y-auto">
            {/* 1. Internal Campaign Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#1b1c1a]/70 flex items-center justify-between">
                <span>Campaign Name (Internal Reference)</span>
                <span className="text-[10px] text-[#1b1c1a]/40 font-normal">e.g. Diwali Collection Launch</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Royal Festive Launch 2026"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebe8e0] text-xs focus:outline-none focus:border-[#795900] bg-[#faf9f5]"
              />
            </div>

            {/* 2. Target Audience Segmentation */}
            <div className="bg-[#faf9f5] border border-[#ebe8e0] rounded-2xl p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#1b1c1a] flex items-center gap-1.5">
                  <Icon name="target" cls="w-4 h-4 text-[#795900]" />
                  <span>Target Audience</span>
                </span>
                <div className="flex items-center gap-1.5 text-xs text-[#795900] bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 font-semibold">
                  <span>Reaches ~</span>
                  <strong>{loadingEstimate ? '...' : estimatedCount.toLocaleString()}</strong>
                  <span>devices</span>
                </div>
              </div>

              {/* Strategy Selector Tabs */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'all_devices', label: 'All Active Devices', iconName: 'globe' },
                  { id: 'filtered', label: 'By Region & Platform', iconName: 'pin' },
                  { id: 'custom_devices', label: 'Custom Device List', iconName: 'clipboard' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setTargetType(s.id)}
                    className={`p-2.5 rounded-xl text-left border text-xs font-semibold transition-all flex flex-col gap-1.5 ${
                      targetType === s.id
                        ? 'border-[#795900] bg-white text-[#795900] shadow-sm'
                        : 'border-[#ebe8e0] bg-white/60 text-[#1b1c1a]/60 hover:bg-white'
                    }`}
                  >
                    <Icon name={s.iconName} cls={`w-4 h-4 ${targetType === s.id ? 'text-[#795900]' : 'text-gray-400'}`} />
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>

              {/* Sub-controls based on strategy */}
              {targetType === 'filtered' && (
                <div className="pt-2 space-y-3 border-t border-[#ebe8e0]">
                  {/* Platform check pills */}
                  <div>
                    <label className="text-[11px] font-semibold text-[#1b1c1a]/60 block mb-1.5">
                      Target Operating Systems:
                    </label>
                    <div className="flex gap-2">
                      {['android', 'ios'].map((pl) => {
                        const active = targetPlatforms.includes(pl)
                        return (
                          <button
                            key={pl}
                            type="button"
                            onClick={() => {
                              if (active && targetPlatforms.length === 1) return
                              setTargetPlatforms((prev) =>
                                active ? prev.filter((p) => p !== pl) : [...prev, pl],
                              )
                            }}
                            className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                              active
                                ? 'bg-amber-100 text-[#795900] border-amber-300'
                                : 'bg-white text-gray-400 border-gray-200'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <Icon name={pl === 'android' ? 'android' : 'apple'} cls="w-3.5 h-3.5" />
                              <span>{pl === 'android' ? 'Android' : 'iOS'}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Region & City dropdowns */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-[#1b1c1a]/60 block mb-1">
                        State / Region:
                      </label>
                      <select
                        value={selectedStates[0] || ''}
                        onChange={(e) => setSelectedStates(e.target.value ? [e.target.value] : [])}
                        className="w-full px-3 py-2 rounded-xl border border-[#ebe8e0] text-xs bg-white"
                      >
                        <option value="">All Regions</option>
                        {availableStates.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-[#1b1c1a]/60 block mb-1">
                        City:
                      </label>
                      <select
                        value={selectedCities[0] || ''}
                        onChange={(e) => setSelectedCities(e.target.value ? [e.target.value] : [])}
                        className="w-full px-3 py-2 rounded-xl border border-[#ebe8e0] text-xs bg-white"
                      >
                        <option value="">All Cities</option>
                        {availableCities.map((ct) => (
                          <option key={ct} value={ct}>
                            {ct}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {targetType === 'custom_devices' && (
                <div className="pt-2 flex items-center justify-between border-t border-[#ebe8e0]">
                  <div className="text-xs">
                    <span className="font-semibold text-[#1b1c1a]">
                      {customDevices.length}
                    </span>{' '}
                    <span className="text-[#1b1c1a]/60">devices manually selected</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDevicePicker(true)}
                    className="px-3.5 py-1.5 rounded-xl bg-white border border-[#ebe8e0] hover:bg-gray-50 text-xs font-bold text-[#795900] shadow-sm flex items-center gap-1.5"
                  >
                    <Icon name="search" cls="w-3.5 h-3.5" />
                    <span>Choose Devices</span>
                  </button>
                </div>
              )}
            </div>

            {/* 3. Notification Message Content */}
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1b1c1a]/70 flex items-center gap-1.5">
                <Icon name="pen" cls="w-4 h-4 text-[#795900]" />
                <span>Notification Copy</span>
              </span>

              {/* Title input */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <label className="font-semibold text-[#1b1c1a]/80">Notification Title (Bold):</label>
                  <span className="text-[10px] text-[#1b1c1a]/40">{notificationTitle.length}/65</span>
                </div>
                <input
                  type="text"
                  maxLength={65}
                  value={notificationTitle}
                  onChange={(e) => setNotificationTitle(e.target.value)}
                  placeholder="e.g. Royal Festive Collection is Live"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebe8e0] text-xs font-semibold focus:outline-none focus:border-[#795900] bg-[#faf9f5]"
                />
              </div>

              {/* Body textarea */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-semibold text-[#1b1c1a]/80">Notification Message Body:</label>
                  <button
                    type="button"
                    onClick={() => setNotificationBody((prev) => `${prev} {{name}} `)}
                    className="text-[11px] font-bold text-[#795900] hover:underline"
                  >
                    + Insert {'{{name}}'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={notificationBody}
                  onChange={(e) => setNotificationBody(e.target.value)}
                  placeholder="Type message text shown on lockscreen..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#ebe8e0] text-xs focus:outline-none focus:border-[#795900] bg-[#faf9f5] leading-relaxed"
                />
              </div>

              {/* Deep Link Route */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#1b1c1a]/80 block">
                  On Tap App Destination (Deep Link):
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ROUTE_PRESETS.map((rp) => (
                    <button
                      key={rp.route}
                      type="button"
                      onClick={() => setRoute(rp.route)}
                      className={`px-3 py-2 rounded-xl text-left text-xs font-medium border transition-all ${
                        route === rp.route
                          ? 'border-[#795900] bg-amber-50 text-[#795900] font-bold shadow-sm'
                          : 'border-[#ebe8e0] bg-[#faf9f5] text-[#1b1c1a]/70 hover:bg-white'
                      }`}
                    >
                      {rp.label}
                    </button>
                  ))}
                </div>

                {route === 'custom' && (
                  <input
                    type="text"
                    value={customRoute}
                    onChange={(e) => setCustomRoute(e.target.value)}
                    placeholder="e.g. /products/silk-kurta-emerald"
                    className="w-full px-3.5 py-2 rounded-xl border border-[#ebe8e0] text-xs font-mono focus:outline-none focus:border-[#795900] bg-[#faf9f5] mt-1.5"
                  />
                )}
              </div>

              {/* 4. Banner Image (Upload vs URL) */}
              <div className="space-y-2 pt-2 border-t border-[#ebe8e0]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#1b1c1a]/80">
                    Rich Media Banner (Optional):
                  </label>
                  <div className="flex gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setImageTab('upload')}
                      className={`px-2.5 py-1 rounded-lg font-semibold ${
                        imageTab === 'upload' ? 'bg-[#795900] text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageTab('url')}
                      className={`px-2.5 py-1 rounded-lg font-semibold ${
                        imageTab === 'url' ? 'bg-[#795900] text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      Image URL
                    </button>
                  </div>
                </div>

                {imageTab === 'upload' ? (
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer px-4 py-2 rounded-xl border border-dashed border-[#795900]/40 bg-amber-50/50 hover:bg-amber-50 text-xs font-bold text-[#795900] flex items-center gap-2">
                      <Icon name={uploadingImage ? 'clock' : 'folder'} cls="w-4 h-4" />
                      <span>{uploadingImage ? 'Uploading...' : 'Choose Image'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        disabled={uploadingImage}
                        className="hidden"
                      />
                    </label>
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove Image
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://images.hilodesign.co/campaigns/banner.jpg"
                      className="flex-1 px-3 py-2 rounded-xl border border-[#ebe8e0] text-xs focus:outline-none focus:border-[#795900] bg-[#faf9f5]"
                    />
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="px-2 py-2 text-xs text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Icon name="close" cls="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Live Phone Preview & Test Sandbox (5 cols) */}
          <div className="lg:col-span-5 p-6 bg-[#faf9f5] flex flex-col justify-between space-y-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-[#1b1c1a]/60 text-center mb-3">
                Live Device Notification Preview
              </div>

              {/* Phone Mockup Component */}
              <PushPhonePreview
                title={notificationTitle}
                body={notificationBody}
                imageUrl={imageUrl}
                route={activeRoute}
              />
            </div>

            {/* Test Send Sandbox Box */}
            <div className="bg-white border border-[#ebe8e0] rounded-2xl p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#1b1c1a]/70 flex items-center gap-1.5">
                  <Icon name="beaker" cls="w-4 h-4 text-[#795900]" />
                  <span>Send Test Preview</span>
                </span>
                <span className="text-[10px] text-[#1b1c1a]/40">Instant Delivery</span>
              </div>
              <p className="text-[11px] text-[#1b1c1a]/60">
                Receive the exact push notification on your own device before broadcasting to customers.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={testTarget}
                  onChange={(e) => setTestTarget(e.target.value)}
                  placeholder="Enter Phone, User ID, or FCM token..."
                  className="flex-1 px-3 py-2 rounded-xl border border-[#ebe8e0] text-xs focus:outline-none focus:border-[#795900] bg-[#faf9f5]"
                />
                <button
                  type="button"
                  disabled={sendingTest}
                  onClick={handleSendTest}
                  className="px-3.5 py-2 rounded-xl bg-[#1b1c1a] text-white text-xs font-bold hover:bg-black disabled:opacity-50 transition-all flex items-center gap-1.5 flex-shrink-0"
                >
                  {sendingTest ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="px-6 py-4 border-t border-[#ebe8e0] bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-[#1b1c1a]/60">
            Broadcasting to{' '}
            <strong className="text-[#795900]">
              ~{estimatedCount.toLocaleString()}
            </strong>{' '}
            active reachable devices
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-[#ebe8e0] hover:bg-gray-50 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSaveCampaign(false)}
              className="px-4 py-2.5 rounded-xl border border-[#ebe8e0] bg-[#faf9f5] hover:bg-[#f0eee6] text-xs font-bold text-[#1b1c1a]"
            >
              Save as Draft
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSaveCampaign(true)}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#795900] via-[#c9a432] to-[#d4a843] hover:opacity-95 text-white font-bold text-xs shadow-md shadow-[#795900]/20 flex items-center gap-2"
            >
              <span>{submitting ? 'Broadcasting...' : 'Launch Push Campaign Now'}</span>
              <Icon name="rocket" cls="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Nested Device Picker Modal */}
      {showDevicePicker && (
        <PushDevicePickerModal
          selectedDevices={customDevices}
          onConfirm={(list) => setCustomDevices(list)}
          onClose={() => setShowDevicePicker(false)}
        />
      )}
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { waMarketingApi } from '../../lib/waMarketingApi'
import { toast } from '../../lib/designTokens'
import WhatsAppPhonePreview from './WhatsAppPhonePreview'
import RecipientPickerModal from './RecipientPickerModal'

export default function CampaignComposerModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [recipients, setRecipients] = useState([])
  const [showRecipientModal, setShowRecipientModal] = useState(false)
  const [audienceCounts, setAudienceCounts] = useState(null)

  // Calculate all available candidates on first dialogue display
  useEffect(() => {
    waMarketingApi
      .queryRecipients({ limit: 1 })
      .then((res) => {
        if (res?.counts) setAudienceCounts(res.counts)
      })
      .catch(() => {})
  }, [])

  // Creative & Copy
  const [imageUrl, setImageUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [bodyText, setBodyText] = useState(
    'Hi {{name}},\n\nDiscover our newly curated festive occasion wear collection at Hilo Design!\n\nHandcrafted with pure silks and bespoke tailoring for your special moments.',
  )

  // CTA Buttons
  const [ctaButtons, setCtaButtons] = useState([
    { type: 'url', text: 'Shop Collection', url: 'https://hilodesign.co' },
    { type: 'quick_reply', text: 'Talk to Stylist', id: 'talk_to_stylist' },
  ])

  // Test send state
  const [testPhone, setTestPhone] = useState(() => {
    try {
      return localStorage.getItem('wa_marketing_test_phone') || '8606094557'
    } catch {
      return '8606094557'
    }
  })
  const [lastTestSuccess, setLastTestSuccess] = useState(null)
  const [sendingTest, setSendingTest] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Handle banner image upload
  const handleImageFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const url = await waMarketingApi.uploadBanner(file)
      if (url) {
        setImageUrl(url)
        toast(true, 'Banner image uploaded successfully')
      }
    } catch (err) {
      toast(false, err?.message || 'Failed to upload image')
    } finally {
      setUploadingImage(false)
    }
  }

  // Handle CTA button changes
  const updateButton = (index, field, value) => {
    setCtaButtons((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const addButton = () => {
    if (ctaButtons.length >= 3) {
      toast(false, 'WhatsApp allows maximum 3 interactive buttons')
      return
    }
    setCtaButtons((prev) => [
      ...prev,
      { type: 'quick_reply', text: 'New Button', id: `btn_${prev.length + 1}` },
    ])
  }

  const removeButton = (index) => {
    setCtaButtons((prev) => prev.filter((_, i) => i !== index))
  }

  // Insert template variable into body
  const insertVariable = (tag) => {
    setBodyText((prev) => `${prev} ${tag} `)
  }

  // Send single test preview to admin phone
  const handleTestSend = async () => {
    const rawNumber = testPhone.trim()
    if (!rawNumber) {
      toast(false, 'Please enter a test phone number')
      return
    }
    if (!bodyText.trim()) {
      toast(false, 'Message body cannot be empty')
      return
    }
    setSendingTest(true)
    try {
      await waMarketingApi.sendTestMessage({
        to: rawNumber,
        recipientName: 'Admin Preview',
        imageUrl: imageUrl || undefined,
        bodyText: bodyText.trim(),
        ctaButtons,
      })
      try {
        localStorage.setItem('wa_marketing_test_phone', rawNumber)
      } catch {}
      setLastTestSuccess(rawNumber)
      toast(true, `Test message sent to ${rawNumber}`)
    } catch (err) {
      toast(false, err?.message || 'Test send failed')
    } finally {
      setSendingTest(false)
    }
  }

  // Create & launch broadcast
  const handleSaveAndDispatch = async (startNow = false) => {
    if (!title.trim()) {
      toast(false, 'Please provide a campaign title')
      return
    }
    if (!bodyText.trim()) {
      toast(false, 'Message body cannot be empty')
      return
    }
    if (startNow && recipients.length === 0) {
      toast(false, 'Please select at least one recipient before broadcasting')
      return
    }

    setSubmitting(true)
    try {
      const campaign = await waMarketingApi.createCampaign({
        title: title.trim(),
        description: description.trim() || undefined,
        audienceSelectionMode: 'manual_pick',
        audienceSources: Array.from(new Set(recipients.map((r) => r.source))),
        recipients,
        sendMode: 'template',
        imageUrl: imageUrl || undefined,
        bodyText: bodyText.trim(),
        ctaButtons,
      })

      if (startNow) {
        await waMarketingApi.sendCampaign(campaign.id)
        toast(true, `Broadcast started for ${recipients.length} recipients!`)
      } else {
        toast(true, 'Campaign draft saved successfully')
      }

      if (onCreated) onCreated(campaign)
      onClose()
    } catch (err) {
      toast(false, err?.message || 'Failed to create campaign')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white border border-[#ebe8e0] rounded-2xl w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden my-auto text-[#1b1c1a]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#ebe8e0] flex items-center justify-between bg-[#faf9f5]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold text-lg">
              📢
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1b1c1a]">Create WhatsApp Marketing Campaign</h2>
              <p className="text-xs text-[#1b1c1a]/60">
                Compose marketing announcements with images, rich copy, and interactive CTA buttons
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-black/5 hover:bg-black/10 text-[#1b1c1a]/60 hover:text-[#1b1c1a] flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Dual-Column Body */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 bg-[#faf9f5]">
          {/* Left Column: Form Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* Title & Description */}
            <div className="bg-white p-4 rounded-xl border border-[#ebe8e0] shadow-sm space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#1b1c1a]/70 uppercase tracking-wider mb-1">
                  Campaign Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Festive Occasion Wear Launch 2026"
                  className="w-full bg-[#faf9f5] border border-[#ebe8e0] rounded-lg px-3.5 py-2 text-sm text-[#1b1c1a] placeholder:text-[#1b1c1a]/30 focus:outline-none focus:border-[#795900]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1b1c1a]/70 uppercase tracking-wider mb-1">
                  Target Audience
                </label>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between p-3.5 bg-[#faf9f5] rounded-xl border border-[#ebe8e0]">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">🎯</span>
                    <div>
                      <div className="text-xs font-bold text-[#1b1c1a]">
                        {recipients.length === 0
                          ? 'No recipients selected yet'
                          : `${recipients.length} Recipients Selected`}
                      </div>
                      <div className="text-[11px] text-[#1b1c1a]/55 mt-0.5">
                        {recipients.length === 0
                          ? audienceCounts
                            ? `${audienceCounts.total || 0} candidates available (${audienceCounts.whatsapp_chat || 0} WhatsApp chats · ${audienceCounts.app_users || 0} App users)`
                            : 'Choose from WhatsApp chats, App users, or custom numbers'
                          : `${recipients.filter((r) => r.source === 'whatsapp_chat').length} WhatsApp Chats · ${recipients.filter((r) => r.source === 'app_users').length} App Users · ${recipients.filter((r) => r.source === 'custom').length} Custom`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {recipients.length === 0 && audienceCounts && (audienceCounts.total || 0) > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await waMarketingApi.queryRecipients({ fetchAll: true })
                            if (res?.items) {
                              setRecipients(res.items)
                              toast(true, `✓ Selected all ${res.items.length} candidates from system`)
                            }
                          } catch (err) {
                            toast(false, err?.message || 'Failed to select all')
                            setShowRecipientModal(true)
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold shadow-xs transition-all flex items-center gap-1"
                        title="Immediately select all candidates in the system"
                      >
                        <span>✓</span>
                        <span>Select All ({audienceCounts.total || 0})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowRecipientModal(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#795900] to-[#c9a432] text-white text-xs font-bold shadow-sm transition-all hover:opacity-95"
                    >
                      {recipients.length === 0 ? '+ Pick Audience' : '✎ Edit Audience'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Banner Image Upload */}
            <div className="bg-white p-4 rounded-xl border border-[#ebe8e0] shadow-sm space-y-2">
              <label className="block text-xs font-semibold text-[#1b1c1a]/70 uppercase tracking-wider">
                Creative Banner Image (Media Header)
              </label>
              <div className="flex gap-4 items-center">
                {imageUrl ? (
                  <div className="relative w-28 h-20 rounded-lg overflow-hidden border border-[#ebe8e0] bg-[#faf9f5] flex-shrink-0">
                    <img src={imageUrl} alt="Banner preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center font-bold shadow"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="w-28 h-20 rounded-lg border border-dashed border-[#ebe8e0] bg-[#faf9f5] flex flex-col items-center justify-center text-[#1b1c1a]/40 text-xs flex-shrink-0">
                    <span>🖼️</span>
                    <span>No image</span>
                  </div>
                )}

                <div className="flex-1 space-y-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFile}
                    disabled={uploadingImage}
                    className="text-xs text-[#1b1c1a]/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#faf9f5] file:text-[#1b1c1a] file:border file:border-[#ebe8e0] hover:file:bg-[#ebe8e0] cursor-pointer"
                  />
                  <p className="text-[11px] text-[#1b1c1a]/50">
                    Recommended: 1200 × 628px or square JPG/PNG under 5MB.
                  </p>
                  {uploadingImage && (
                    <span className="text-xs text-[#795900] animate-pulse">Uploading banner...</span>
                  )}
                </div>
              </div>
            </div>

            {/* Body Copy Text */}
            <div className="bg-white p-4 rounded-xl border border-[#ebe8e0] shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-[#1b1c1a]/70 uppercase tracking-wider">
                  Message Body Text *
                </label>
                <div className="flex gap-1.5 items-center">
                  <span className="text-[10px] text-[#1b1c1a]/50">Insert:</span>
                  <button
                    type="button"
                    onClick={() => insertVariable('{{name}}')}
                    className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-[#795900] text-[10px] font-mono border border-amber-200"
                  >
                    + {'{{name}}'}
                  </button>
                </div>
              </div>

              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={5}
                placeholder="Write your promotional announcement..."
                className="w-full bg-[#faf9f5] border border-[#ebe8e0] rounded-lg p-3 text-sm text-[#1b1c1a] placeholder:text-[#1b1c1a]/30 focus:outline-none focus:border-[#795900]"
              />
              <div className="text-[11px] text-[#1b1c1a]/50 flex justify-between">
                <span>Variables are automatically replaced per contact.</span>
                <span>{bodyText.length} / 1024 chars</span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="bg-white p-4 rounded-xl border border-[#ebe8e0] shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-[#1b1c1a]/70 uppercase tracking-wider">
                  Interactive CTA Buttons ({ctaButtons.length}/3)
                </label>
                {ctaButtons.length < 3 && (
                  <button
                    type="button"
                    onClick={addButton}
                    className="text-xs text-[#795900] hover:underline font-semibold"
                  >
                    + Add Button
                  </button>
                )}
              </div>

              {ctaButtons.map((btn, index) => (
                <div
                  key={index}
                  className="p-3 bg-[#faf9f5] rounded-lg border border-[#ebe8e0] space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1b1c1a]/70">Button {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeButton(index)}
                      className="text-red-600 hover:underline text-xs"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <select
                        value={btn.type}
                        onChange={(e) => updateButton(index, 'type', e.target.value)}
                        className="w-full bg-white border border-[#ebe8e0] rounded-md px-2 py-1.5 text-xs text-[#1b1c1a]"
                      >
                        <option value="quick_reply">Quick Reply (Action)</option>
                        <option value="url">Website URL (Link)</option>
                      </select>
                    </div>
                    <div>
                      <input
                        type="text"
                        value={btn.text}
                        onChange={(e) => updateButton(index, 'text', e.target.value)}
                        placeholder="Button Label"
                        className="w-full bg-white border border-[#ebe8e0] rounded-md px-2 py-1.5 text-xs text-[#1b1c1a]"
                      />
                    </div>
                    <div>
                      {btn.type === 'url' ? (
                        <input
                          type="text"
                          value={btn.url || ''}
                          onChange={(e) => updateButton(index, 'url', e.target.value)}
                          placeholder="https://hilodesign.co"
                          className="w-full bg-white border border-[#ebe8e0] rounded-md px-2 py-1.5 text-xs text-[#1b1c1a] font-mono"
                        />
                      ) : (
                        <input
                          type="text"
                          value={btn.id || ''}
                          onChange={(e) => updateButton(index, 'id', e.target.value)}
                          placeholder="Identifier (e.g. talk_stylist)"
                          className="w-full bg-white border border-[#ebe8e0] rounded-md px-2 py-1.5 text-xs text-[#1b1c1a] font-mono"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Test Send Section */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#ebe8e0] shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 flex items-center justify-center text-[#075E54] flex-shrink-0 shadow-xs">
                    <svg className="w-5 h-5 text-[#25D366]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#1b1c1a] flex items-center gap-2 flex-wrap">
                      <span>Send Real Preview to WhatsApp</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse" />
                        Live Test
                      </span>
                    </div>
                    <div className="text-xs text-[#1b1c1a]/60 mt-0.5">
                      Verify how your announcement appears on your personal phone before mass dispatch
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="flex items-center bg-[#faf9f5] border border-[#ebe8e0] focus-within:border-[#25D366] focus-within:ring-2 focus-within:ring-[#25D366]/20 rounded-xl overflow-hidden h-10 px-3 shadow-inner transition-all w-full md:w-52">
                    <span className="text-xs font-bold text-[#1b1c1a]/60 select-none mr-2 flex items-center gap-1 font-mono">
                      <span>🇮🇳</span>
                      <span>+91</span>
                    </span>
                    <input
                      type="tel"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="9876543210"
                      className="w-full bg-transparent text-sm text-[#1b1c1a] font-mono tracking-wide placeholder:text-[#1b1c1a]/30 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleTestSend}
                    disabled={sendingTest || !testPhone.trim()}
                    className="h-10 px-4 rounded-xl bg-[#075E54] hover:bg-[#128C7E] active:scale-95 disabled:opacity-40 text-white font-bold text-xs transition-all flex items-center gap-1.5 flex-shrink-0 shadow-sm"
                  >
                    {sendingTest ? (
                      <span className="animate-spin text-sm">⏳</span>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                    <span>{sendingTest ? 'Sending...' : 'Send Test'}</span>
                  </button>
                </div>
              </div>

              {lastTestSuccess && (
                <div className="mt-3 pt-3 border-t border-[#ebe8e0]/60 flex items-center justify-between text-[11px] text-emerald-800 bg-emerald-50/50 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 px-4 sm:px-5 py-2 rounded-b-2xl">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span>✓</span>
                    <span>Test message successfully sent to <strong>+91 {lastTestSuccess}</strong>. Check your WhatsApp!</span>
                  </div>
                  <span className="text-[#1b1c1a]/40 font-mono text-[10px]">Just now</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live WhatsApp Phone Mockup (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-[#ebe8e0] shadow-sm">
            <div className="text-xs font-semibold text-[#1b1c1a]/50 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span>🟢</span> Live WhatsApp Preview
            </div>
            <WhatsAppPhonePreview
              imageUrl={imageUrl}
              bodyText={bodyText}
              ctaButtons={ctaButtons}
              recipientName="Kabir Sharma"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#ebe8e0] flex items-center justify-between bg-[#faf9f5]">
          <div className="text-xs text-[#1b1c1a]/60">
            {recipients.length > 0 ? (
              <span className="text-emerald-700 font-semibold">
                ✓ {recipients.length} recipients staged for dispatch
              </span>
            ) : (
              <span>Select recipients on the left to launch</span>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#1b1c1a]/70 hover:text-[#1b1c1a] bg-black/5 hover:bg-black/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSaveAndDispatch(false)}
              disabled={submitting || !title.trim()}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#1b1c1a] bg-white hover:bg-[#faf9f5] border border-[#ebe8e0] shadow-sm disabled:opacity-40 transition-colors"
            >
              Save as Draft
            </button>
            <button
              type="button"
              onClick={() => handleSaveAndDispatch(true)}
              disabled={submitting || recipients.length === 0 || !title.trim()}
              className="px-6 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#795900] via-[#c9a432] to-[#d4a843] hover:opacity-95 disabled:opacity-40 transition-all shadow-md shadow-[#795900]/20 flex items-center gap-2"
            >
              <span>🚀</span>
              <span>Launch Broadcast ({recipients.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recipient Picker Sub-Modal */}
      {showRecipientModal && (
        <RecipientPickerModal
          selectedRecipients={recipients}
          onConfirm={(selected) => {
            setRecipients(selected)
            setShowRecipientModal(false)
          }}
          onClose={() => setShowRecipientModal(false)}
        />
      )}
    </div>
  )
}

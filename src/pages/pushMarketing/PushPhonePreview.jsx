import React, { useState } from 'react'
import Icon from '../../components/Icon'

export default function PushPhonePreview({
  title = 'Festive Sherwani Collection',
  body = 'Explore newly curated bespoke royal collections tailored for grand weddings.',
  imageUrl = '',
  route = '/collections',
  recipientName = 'Shopper',
  timestamp = 'Just now',
}) {
  const [os, setOs] = useState('ios') // 'ios' | 'android'

  const displayTitle = (title || 'Notification Title').replace(/\{\{name\}\}/gi, recipientName)
  const displayBody = (body || 'Notification message text preview...').replace(/\{\{name\}\}/gi, recipientName)

  return (
    <div className="w-full max-w-[340px] mx-auto select-none">
      {/* OS Mode Switcher */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setOs('ios')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
            os === 'ios'
              ? 'bg-[#1b1c1a] text-white shadow-sm'
              : 'bg-white text-[#1b1c1a]/60 hover:text-[#1b1c1a] border border-[#ebe8e0]'
          }`}
        >
          <Icon name="apple" cls="w-3.5 h-3.5" />
          <span>iOS Lockscreen</span>
        </button>
        <button
          type="button"
          onClick={() => setOs('android')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
            os === 'android'
              ? 'bg-[#1b1c1a] text-white shadow-sm'
              : 'bg-white text-[#1b1c1a]/60 hover:text-[#1b1c1a] border border-[#ebe8e0]'
          }`}
        >
          <Icon name="android" cls="w-3.5 h-3.5" />
          <span>Android Shade</span>
        </button>
      </div>

      {/* Phone Mockup Body */}
      <div className="w-full bg-[#0d1117] rounded-[42px] p-3 shadow-2xl border-4 border-gray-800 flex flex-col relative overflow-hidden">
        {/* Dynamic Island / Camera punchhole */}
        <div className="relative z-10 w-28 h-5 bg-black rounded-full mx-auto mb-2 flex items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full bg-[#161b22] mr-2" />
          <div className="w-8 h-1 rounded-full bg-[#161b22]" />
        </div>

        {/* Lockscreen Screen Wallpaper */}
        <div
          className="relative rounded-[32px] overflow-hidden min-h-[460px] flex flex-col justify-between p-3.5"
          style={{
            background:
              'linear-gradient(145deg, #1f2937 0%, #111827 50%, #030712 100%)',
          }}
        >
          {/* Top Status & Clock */}
          <div className="text-center text-white/90 pt-3">
            <div className="text-4xl font-extralight tracking-tight font-sans">
              09:41
            </div>
            <div className="text-[11px] font-medium text-white/60 mt-0.5">
              Wednesday, November 18
            </div>
          </div>

          {/* Notification Card Container */}
          <div className="my-auto py-2">
            {os === 'ios' ? (
              /* ─── iOS Notification Card ─── */
              <div className="bg-white/90 backdrop-blur-md rounded-2xl p-3 shadow-xl border border-white/40 text-[#1b1c1a] transition-all hover:scale-[1.01]">
                {/* Header row */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-5 h-5 rounded-md bg-[#543925] text-amber-300 font-serif font-bold text-[11px] flex items-center justify-center shadow-sm">
                      H
                    </div>
                    <span className="text-[11px] font-semibold tracking-wide text-[#1b1c1a]/80 uppercase">
                      Hilo Design
                    </span>
                  </div>
                  <span className="text-[10px] text-[#1b1c1a]/50 font-medium">
                    {timestamp}
                  </span>
                </div>

                {/* Title & Body */}
                <div className="text-xs font-bold text-[#1b1c1a] leading-tight mb-1">
                  {displayTitle}
                </div>
                <div className="text-[11px] text-[#1b1c1a]/80 leading-relaxed break-words">
                  {displayBody}
                </div>

                {/* Banner Image Preview */}
                {imageUrl && (
                  <div className="mt-2.5 rounded-xl overflow-hidden bg-black/5 max-h-36 border border-black/5">
                    <img
                      src={imageUrl}
                      alt="Push visual"
                      className="w-full h-32 object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  </div>
                )}

                {/* Deep Link / Action Pill */}
                {route && (
                  <div className="mt-2 pt-2 border-t border-black/5 flex items-center justify-between text-[10px] text-[#795900]">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Icon name="link" cls="w-3 h-3 text-[#795900]" />
                      <span>Tap to open:</span>{' '}
                      <code className="bg-amber-50 px-1.5 py-0.5 rounded text-[9px] font-mono text-[#795900]">
                        {route}
                      </code>
                    </span>
                    <span className="text-gray-400">›</span>
                  </div>
                )}
              </div>
            ) : (
              /* ─── Android Notification Card ─── */
              <div className="bg-[#242b35] text-gray-100 rounded-xl p-3 shadow-xl border border-white/10 transition-all">
                {/* Header */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-4 h-4 rounded-full bg-amber-500 text-black font-bold text-[9px] flex items-center justify-center">
                      H
                    </div>
                    <span className="text-[10px] font-medium text-gray-300">
                      Hilo Design • Marketing
                    </span>
                  </div>
                  <span className="text-[9px] text-gray-400 font-normal">
                    {timestamp}
                  </span>
                </div>

                {/* Content */}
                <div className="text-xs font-semibold text-white leading-tight mb-0.5">
                  {displayTitle}
                </div>
                <div className="text-[11px] text-gray-300 leading-snug break-words">
                  {displayBody}
                </div>

                {/* Banner Image Preview */}
                {imageUrl && (
                  <div className="mt-2 rounded-lg overflow-hidden bg-black/20 max-h-36">
                    <img
                      src={imageUrl}
                      alt="Push visual"
                      className="w-full h-32 object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  </div>
                )}

                {/* Action button */}
                <div className="mt-2.5 pt-1.5 border-t border-white/5 flex items-center gap-3">
                  <button
                    type="button"
                    className="text-[10px] font-bold text-amber-400 hover:text-amber-300 uppercase tracking-wider"
                  >
                    View Offer
                  </button>
                  <button
                    type="button"
                    className="text-[10px] font-medium text-gray-400 hover:text-gray-300 uppercase tracking-wider"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Screen Bar */}
          <div className="pt-2 flex flex-col items-center gap-1">
            <div className="text-[10px] text-white/40 tracking-wider">
              SWIPE UP TO UNLOCK
            </div>
            <div className="w-24 h-1 bg-white/40 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

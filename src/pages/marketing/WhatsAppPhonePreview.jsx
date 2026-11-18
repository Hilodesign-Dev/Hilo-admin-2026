import React from 'react'

export default function WhatsAppPhonePreview({
  imageUrl,
  bodyText,
  ctaButtons = [],
  recipientName = 'Shopper',
  timestamp = 'Just now',
}) {
  const displayText = (bodyText || '')
    .replace(/\{\{1\}\}|\{\{name\}\}/gi, recipientName || 'Shopper')
    .replace(/\{\{2\}\}/gi, '')

  return (
    <div className="w-full max-w-[340px] mx-auto bg-[#111b21] rounded-[36px] p-3 shadow-2xl border-4 border-gray-800 flex flex-col select-none">
      {/* Phone Notch / Speaker bar */}
      <div className="w-32 h-4 bg-gray-900 rounded-full mx-auto mb-2 flex items-center justify-center">
        <div className="w-3 h-3 rounded-full bg-gray-800 mr-2" />
        <div className="w-12 h-1.5 rounded-full bg-gray-800" />
      </div>

      {/* WhatsApp Chat Header */}
      <div className="bg-[#075e54] text-white px-3 py-2.5 rounded-t-2xl flex items-center gap-2.5 shadow-sm">
        <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center font-bold text-gray-900 text-xs shadow-inner">
          H
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate flex items-center gap-1">
            Hilo Design
            <span className="text-[10px] text-emerald-300">✓</span>
          </div>
          <div className="text-[10px] text-white/70 truncate">Official Business Account</div>
        </div>
        <div className="flex gap-3 text-white/80 text-sm">
          <span>📹</span>
          <span>📞</span>
        </div>
      </div>

      {/* WhatsApp Chat Area / Wallpaper */}
      <div
        className="flex-1 p-3 min-h-[360px] flex flex-col justify-end rounded-b-2xl overflow-hidden relative"
        style={{
          backgroundColor: '#efeae2',
          backgroundImage:
            'radial-gradient(#d4cbbe 1px, transparent 1px), radial-gradient(#d4cbbe 1px, #efeae2 1px)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 10px 10px',
        }}
      >
        {/* Date pill */}
        <div className="self-center bg-white/80 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded-md shadow-sm mb-3">
          TODAY
        </div>

        {/* Message Bubble Container */}
        <div className="max-w-[92%] self-start bg-white rounded-lg rounded-tl-none shadow-md overflow-hidden text-gray-900 border border-gray-100 mb-1">
          {/* Creative Banner Image */}
          {imageUrl ? (
            <div className="w-full max-h-48 overflow-hidden bg-gray-100 border-b border-gray-100 relative">
              <img
                src={imageUrl}
                alt="Broadcast creative"
                className="w-full h-auto object-cover max-h-48"
                onError={(e) => {
                  e.target.style.display = 'none'
                }}
              />
            </div>
          ) : (
            <div className="w-full h-24 bg-amber-50 border-b border-amber-100 flex flex-col items-center justify-center text-amber-700/60 p-2 text-center">
              <span className="text-2xl mb-1">🖼️</span>
              <span className="text-[11px] font-medium">Header Banner Preview</span>
            </div>
          )}

          {/* Message Body */}
          <div className="p-2.5 pb-1.5">
            <p className="text-xs whitespace-pre-wrap text-gray-800 leading-relaxed font-normal">
              {displayText || 'Hi Kabir, check out our newly launched festive occasion wear collection!'}
            </p>
            <div className="text-[9px] text-gray-400 text-right mt-1 flex items-center justify-end gap-1">
              <span>{timestamp}</span>
              <span className="text-[#53bdeb] text-[10px]">✓✓</span>
            </div>
          </div>

          {/* CTA Buttons */}
          {ctaButtons && ctaButtons.length > 0 && (
            <div className="border-t border-gray-100 divide-y divide-gray-100 bg-[#fbfbfb]">
              {ctaButtons.map((btn, idx) => (
                <div
                  key={idx}
                  className="py-2 px-3 text-center text-[#00a884] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  {btn.type === 'url' ? (
                    <>
                      <span className="text-[11px]">↗</span>
                      <span>{btn.text || 'Visit Website'}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px]">💬</span>
                      <span>{btn.text || 'Reply Option'}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom home indicator */}
      <div className="w-24 h-1 bg-gray-700 rounded-full mx-auto mt-2" />
    </div>
  )
}

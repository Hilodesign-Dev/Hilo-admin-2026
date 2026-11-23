import React from 'react'

/**
 * MobileMockPhone
 * 
 * Pixel-accurate iPhone 15/16 Pro chassis matching Hilo Mobile App:
 * - Dynamic Island & Status Bar (9:41, Cellular, WiFi, Battery)
 * - Canvas Background: #FFFFFF (matching Flutter AppColors.canvas / AppColors.background)
 * - Persistent Bottom Navigation Bar with 5 tabs: Home, Collections, Stylist, Wardrobe, Orders
 * - iOS Home Indicator Pill
 */
export default function MobileMockPhone({
  children,
  title = 'Hilo Mobile Live Feed',
  viewportRef,
  activeTab = 'home',
  onTabClick,
  className = '',
}) {
  return (
    <div className={`relative flex flex-col items-center select-none ${className}`}>
      {/* Device Label / Live Tag */}
      {title && (
        <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>{title}</span>
          <span className="text-[10px] text-stone-400 font-mono font-normal">393 × 852 dp</span>
        </div>
      )}

      {/* iPhone Outer Chassis */}
      <div className="relative w-[340px] h-[690px] bg-[#1c1c1e] rounded-[50px] p-2.5 shadow-2xl border-[3px] border-stone-700/80 ring-1 ring-white/10 flex flex-col overflow-hidden">
        {/* Antenna bands */}
        <div className="absolute top-24 -left-1 w-1 h-3 bg-stone-700 rounded-r"></div>
        <div className="absolute top-36 -left-1 w-1 h-8 bg-stone-700 rounded-r"></div>
        <div className="absolute top-48 -left-1 w-1 h-8 bg-stone-700 rounded-r"></div>
        <div className="absolute top-32 -right-1 w-1 h-12 bg-stone-700 rounded-l"></div>

        {/* Screen Bezel & Canvas: Pure White #FFFFFF matching Flutter AppColors.background */}
        <div className="relative w-full h-full bg-white rounded-[40px] overflow-hidden flex flex-col shadow-inner">
          {/* iOS Dynamic Island & Status Bar (White icons on dark hero header) */}
          <div className="absolute top-0 left-0 right-0 z-40 h-10 px-6 flex items-center justify-between text-white text-[11px] font-medium tracking-tight pointer-events-none drop-shadow-sm">
            {/* Time */}
            <span className="font-semibold text-[11px]">9:41</span>

            {/* Dynamic Island */}
            <div className="w-22 h-5 bg-black rounded-full flex items-center justify-between px-2 shadow-sm pointer-events-auto">
              <div className="w-2 h-2 rounded-full bg-[#111] border border-stone-800"></div>
              <div className="w-1.5 h-1.5 rounded-full bg-[#0a101d]"></div>
            </div>

            {/* Status Icons: Signal, WiFi, Battery */}
            <div className="flex items-center gap-1.5 text-xs text-white">
              {/* Cellular */}
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19H19.65l-.62-1.39C20.26 16.07 21 14.12 21 12c0-4.97-4.03-9-9-9zm-6 9c0-3.31 2.69-6 6-6s6 2.69 6 6c0 1.25-.38 2.4-1.03 3.36L6.5 15.36C6.18 14.36 6 13.21 6 12z" />
              </svg>
              {/* WiFi */}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.393 9.322c5.857-5.858 15.355-5.858 21.213 0" />
              </svg>
              {/* Battery */}
              <div className="w-5 h-2.5 border border-white/90 rounded-sm p-0.5 flex items-center">
                <div className="w-full h-full bg-white rounded-2xs"></div>
              </div>
            </div>
          </div>

          {/* Scrollable Mobile Viewport (Custom scrollable area) */}
          <div
            ref={viewportRef}
            className="relative flex-1 w-full overflow-y-auto overflow-x-hidden scrollbar-none bg-white"
            style={{ fontFamily: "'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}
          >
            {children}
          </div>

          {/* Persistent Flutter App Shell Bottom Navigation Bar */}
          <div className="relative z-30 bg-white border-t border-stone-200/80 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] px-3 pt-2 pb-5 flex items-center justify-around shrink-0">
            {/* 1. Home (Active brown #543925) */}
            <button
              type="button"
              onClick={() => onTabClick?.('home')}
              className={`flex flex-col items-center gap-0.5 transition-colors ${
                activeTab === 'home' ? 'text-[#543925]' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <svg className="w-5 h-5" fill={activeTab === 'home' ? '#543925' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-[9.5px] font-semibold tracking-tight">Home</span>
            </button>

            {/* 2. Collections */}
            <button
              type="button"
              onClick={() => onTabClick?.('collections')}
              className={`flex flex-col items-center gap-0.5 transition-colors ${
                activeTab === 'collections' ? 'text-[#543925]' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span className="text-[9.5px] font-medium tracking-tight">Collections</span>
            </button>

            {/* 3. Stylist */}
            <button
              type="button"
              onClick={() => onTabClick?.('stylist')}
              className={`flex flex-col items-center gap-0.5 transition-colors ${
                activeTab === 'stylist' ? 'text-[#543925]' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <span className="text-[9.5px] font-medium tracking-tight">Stylist</span>
            </button>

            {/* 4. Wardrobe */}
            <button
              type="button"
              onClick={() => onTabClick?.('wardrobe')}
              className={`flex flex-col items-center gap-0.5 transition-colors ${
                activeTab === 'wardrobe' ? 'text-[#543925]' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="text-[9.5px] font-medium tracking-tight">Wardrobe</span>
            </button>

            {/* 5. Orders */}
            <button
              type="button"
              onClick={() => onTabClick?.('orders')}
              className={`flex flex-col items-center gap-0.5 transition-colors ${
                activeTab === 'orders' ? 'text-[#543925]' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <span className="text-[9.5px] font-medium tracking-tight">Orders</span>
            </button>
          </div>

          {/* iOS Home Indicator Bar */}
          <div className="absolute bottom-1 left-0 right-0 z-40 h-4 flex items-center justify-center pointer-events-none">
            <div className="w-32 h-1 bg-stone-900/60 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  )
}

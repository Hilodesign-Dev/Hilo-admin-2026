import React from 'react'

/**
 * Single source of truth for how a hero carousel slide is rendered in the
 * mobile "Live Feed" preview AND in the hero image cropper. Both screens import
 * these constants/components so the crop preview can never drift from live.
 */

// Native cover ratio (matches Flutter HomeHeroSection.coverAspectRatio)
export const HERO_ASPECT = 3104 / 4058

// Logical width of the phone screen in MobileMockPhone (340 chassis - 2×3 border - 2×10 padding)
export const PHONE_SCREEN_WIDTH = 314
export const HERO_BASE_HEIGHT = PHONE_SCREEN_WIDTH / HERO_ASPECT // ≈ 410.5

// Cover image zoom + focal point applied by the live feed
export const HERO_ZOOM = 1.25
export const HERO_ORIGIN_X = 0.2
export const HERO_ORIGIN_Y = 0.2
export const HERO_TRANSFORM_ORIGIN = `${HERO_ORIGIN_X * 100}% ${HERO_ORIGIN_Y * 100}%`

// Portion of the saved image that is actually visible in the app (fractions 0..1)
export const HERO_VISIBLE = {
  left: HERO_ORIGIN_X * (1 - 1 / HERO_ZOOM),
  top: HERO_ORIGIN_Y * (1 - 1 / HERO_ZOOM),
  size: 1 / HERO_ZOOM,
}

export const DEFAULT_SUBTITLE = 'Discover designer looks styled around you.'

/** Flutter scrim: [0x4D000000, 0, 0, 0xB3000000] */
export function HeroScrim() {
  return <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/75 pointer-events-none" />
}

/** iOS status bar as drawn by MobileMockPhone (sits on top of the hero). */
export function HeroStatusBar() {
  return (
    <div className="absolute top-0 left-0 right-0 z-40 h-10 px-6 flex items-center justify-between text-white text-[11px] font-medium tracking-tight pointer-events-none drop-shadow-sm">
      <span className="font-semibold text-[11px]">9:41</span>
      <div className="w-22 h-5 bg-black rounded-full flex items-center justify-between px-2 shadow-sm">
        <div className="w-2 h-2 rounded-full bg-[#111] border border-stone-800"></div>
        <div className="w-1.5 h-1.5 rounded-full bg-[#0a101d]"></div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-white">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19H19.65l-.62-1.39C20.26 16.07 21 14.12 21 12c0-4.97-4.03-9-9-9zm-6 9c0-3.31 2.69-6 6-6s6 2.69 6 6c0 1.25-.38 2.4-1.03 3.36L6.5 15.36C6.18 14.36 6 13.21 6 12z" />
        </svg>
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.393 9.322c5.857-5.858 15.355-5.858 21.213 0" />
        </svg>
        <div className="w-5 h-2.5 border border-white/90 rounded-sm p-0.5 flex items-center">
          <div className="w-full h-full bg-white rounded-2xs"></div>
        </div>
      </div>
    </div>
  )
}

/** App bar + greeting + AI stylist button + page indicator. Fills its positioned parent. */
export function HeroOverlayContent({ subtitle, slideCount = 1, currentIdx = 0, onSelectSlide }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-4 pt-10 z-10">
      {/* _HeroAppBar: Menu + HiloHeroBrandLogo + Avatar */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <span className="text-white p-0.5">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </span>

          <div className="flex items-center gap-1.5">
            <img
              src="/hilo-hi.png"
              alt="Hilo"
              className="h-4 w-auto object-contain brightness-0 invert"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
            <span
              className="text-white font-bold tracking-[0.08em] text-[15px] leading-none"
              style={{ fontFamily: 'Helvetica, -apple-system, sans-serif' }}
            >
              DESIGN
            </span>
          </div>
        </div>

        <div className="w-9 h-9 rounded-full bg-stone-700 border border-white/40 overflow-hidden shadow-sm">
          <img
            src="/user_ph.jpg"
            alt="avatar"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80'
            }}
          />
        </div>
      </div>

      {/* Greeting & Subtitle */}
      <div className="pb-1">
        <h2
          className="text-white text-[24px] font-normal leading-[1.158] tracking-[0.28px]"
          style={{ fontFamily: 'Helvetica, -apple-system, sans-serif' }}
        >
          Hi there
          <br />
          Let’s find your style.
        </h2>

        <p className="text-white/90 text-[12px] font-normal mt-1 leading-none tracking-tight">
          {subtitle || DEFAULT_SUBTITLE}
        </p>

        {/* Bottom Row: Frosted AskAiStylistButton + Dots */}
        <div className="mt-5 flex items-end justify-between gap-2">
          <button
            type="button"
            className="h-[40px] px-2.5 rounded-full border border-white/90 bg-white/[0.08] backdrop-blur-md text-white flex items-center gap-2 shadow-sm max-w-[190px]"
          >
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <img
                src="/si_ai_fill_white.svg"
                alt="sparkle"
                className="w-4 h-4 object-contain brightness-0 invert"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            </div>
            <span className="text-[11.5px] font-normal text-white truncate pr-1">
              Ask Your AI Stylist...
            </span>
          </button>

          {/* HomeHeroPageIndicator */}
          <div className="flex items-center gap-1.5 pb-1">
            {Array.from({ length: Math.max(slideCount, 1) }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={onSelectSlide ? () => onSelectSlide(i) : undefined}
                className={`transition-all duration-300 rounded-full ${
                  i === currentIdx
                    ? 'w-6 h-1.5 bg-white'
                    : 'w-1.5 h-1.5 bg-white/55 hover:bg-white/80'
                }`}
                title={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

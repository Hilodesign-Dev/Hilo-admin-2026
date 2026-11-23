import React, { useState, useEffect, useRef } from 'react'
import {
  HERO_ASPECT,
  HERO_ZOOM,
  HERO_TRANSFORM_ORIGIN,
  HeroScrim,
  HeroOverlayContent,
} from './HeroSlideOverlay'

/**
 * MobileHomeFeedMock
 * 
 * Clean, accurate replication of the CMS-managed sections on the Flutter Mobile App HomePage:
 * - Pure White #FFFFFF Canvas (AppColors.background)
 * - 100% focused on CMS sections ONLY:
 *   1. HomeHeroSection (3104×4058 cover, _HeroAppBar, greeting, frosted AskAiStylistButton, page indicators)
 *   2. HomeExperienceVideoSection (EXPERIENCE + Hilo Mark / LUXURY IN MOTION., 16:9 card, 56×56 play badge)
 *   3. HomeStyleVideosSection (STYLING MADE / SIMPLE., 186×263 horizontal deck, frosted badges, 34×34 play badge, Watch Now →)
 * - No unrelated dummy UI or mockups.
 */
export default function MobileHomeFeedMock({
  carouselBanners = [],
  activeLuxuryVideo = null,
  stylingBanners = [],
  celebrityBanners = [],
  activeSlideIdx = 0,
  onSelectSlide,
  onSelectShort,
  onSelectLuxury,
  onSelectCelebrity,
  viewMode = 'all', // 'all' | 'carousel' | 'luxury_in_motion' | 'styling_made_simple' | 'celebrity_edit'
}) {
  const [currentHeroIdx, setCurrentHeroIdx] = useState(activeSlideIdx || 0)

  const heroRef = useRef(null)
  const luxuryRef = useRef(null)
  const stylingRef = useRef(null)
  const celebrityRef = useRef(null)

  useEffect(() => {
    if (activeSlideIdx >= 0 && activeSlideIdx < carouselBanners.length) {
      setCurrentHeroIdx(activeSlideIdx)
    }
  }, [activeSlideIdx, carouselBanners.length])

  // Active hero slides from real DB
  const activeSlides = carouselBanners.filter(s => s && s.active !== false)
  const displaySlides = activeSlides.length > 0 ? activeSlides : carouselBanners
  const currentHeroBanner = displaySlides[currentHeroIdx] || null
  const heroCoverUrl =
    currentHeroBanner?.image_url ||
    currentHeroBanner?.mobile_image_url ||
    '/coverimage1.jpg'

  const totalHeroSlides = Math.max(displaySlides.length, 1)

  // Active luxury video from real DB
  const luxuryThumb =
    activeLuxuryVideo?.image_url ||
    activeLuxuryVideo?.mobile_image_url ||
    'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&q=80'

  // Active styling shorts from real DB
  const activeStyling = stylingBanners.filter(b => b && b.active !== false)
  const displayStyling = activeStyling.length > 0 ? activeStyling : stylingBanners

  // Active celebrity looks from real DB
  const activeCelebrity = celebrityBanners.filter(b => b && b.active !== false)
  const displayCelebrity = activeCelebrity.length > 0 ? activeCelebrity : celebrityBanners

  const showHero = viewMode === 'all' || viewMode === 'carousel'
  const showLuxury = viewMode === 'all' || viewMode === 'luxury_in_motion'
  const showStyling = viewMode === 'all' || viewMode === 'styling_made_simple'
  const showCelebrity = viewMode === 'all' || viewMode === 'celebrity_edit'

  return (
    <div className="w-full bg-white select-none text-[#151515]" style={{ fontFamily: "'Instrument Sans', -apple-system, sans-serif" }}>
      {/* ── 1. HomeHeroSection (aspect ratio: 3104 / 4058) ── */}
      {showHero && (
        <section
          ref={heroRef}
          className="relative w-full overflow-hidden bg-stone-900 border-b border-stone-100"
        >
          <div className="relative w-full" style={{ paddingBottom: `${(1 / HERO_ASPECT) * 100}%` }}>
            {/* Slide cover with 1.25x scale & focus matching Flutter */}
            <div className="absolute inset-0 overflow-hidden bg-stone-950">
              <img
                src={heroCoverUrl}
                alt={currentHeroBanner?.title || 'Hero Banner'}
                className="w-full h-full object-cover transition-transform duration-500"
                style={{ transform: `scale(${HERO_ZOOM})`, transformOrigin: HERO_TRANSFORM_ORIGIN }}
                onError={(e) => {
                  e.currentTarget.src = '/coverimage1.jpg'
                }}
              />
              <HeroScrim />
            </div>

            {/* Content Overlay (shared with the hero cropper so both stay identical) */}
            <HeroOverlayContent
              subtitle={currentHeroBanner?.subtitle}
              slideCount={totalHeroSlides}
              currentIdx={currentHeroIdx}
              onSelectSlide={(i) => {
                setCurrentHeroIdx(i)
                onSelectSlide?.(i, displaySlides[i])
              }}
            />
          </div>
        </section>
      )}

      {/* ── 2. HomeExperienceVideoSection ("Experience Luxury In Motion") ── */}
      {showLuxury && (
        <section
          ref={luxuryRef}
          onClick={onSelectLuxury}
          className="px-4 py-6 bg-white border-b border-stone-100"
        >
          {/* Editorial Title matching Flutter HomeEditorialTitle */}
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <h3
                className="text-[22px] font-bold text-[#151515] uppercase tracking-[-0.35px] leading-none"
                style={{ fontFamily: 'Helvetica, -apple-system, sans-serif' }}
              >
                EXPERIENCE
              </h3>
              <img
                src="/hilo-hi.png"
                alt="Hilo Mark"
                className="h-5 w-auto object-contain inline-block -mt-1"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            </div>
            <h3
              className="text-[22px] font-bold text-[#151515] uppercase tracking-[-0.35px] leading-tight"
              style={{ fontFamily: 'Helvetica, -apple-system, sans-serif' }}
            >
              LUXURY IN MOTION.
            </h3>
          </div>

          {/* 16:9 Video Card matching Flutter AspectRatio(16/9) with ClipRRect(radius: 16) */}
          <div className="relative w-full aspect-[16/9] rounded-[16px] overflow-hidden bg-[#E8E4DF] border border-stone-200 shadow-sm group cursor-pointer">
            <img
              src={luxuryThumb}
              alt={activeLuxuryVideo?.title || 'Luxury in Motion'}
              className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
              onError={(e) => {
                e.currentTarget.src = 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&q=80'
              }}
            />
            {/* Flutter tint: Color(0x33000000) */}
            <div className="absolute inset-0 bg-black/20 pointer-events-none" />

            {/* Flutter _PlayBadge: 56x56 white circle with 34px play arrow */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-white/90 shadow-xl flex items-center justify-center group-hover:scale-108 transition-transform">
                <svg className="w-8 h-8 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── 3. HomeStyleVideosSection ("STYLING MADE SIMPLE.") ── */}
      {showStyling && (
        <section ref={stylingRef} className="py-6 bg-white">
          {/* Title matching Flutter: 'STYLING MADE\nSIMPLE.', height 35/28, Helvetica */}
          <div className="px-5 mb-6">
            <h3
              className="text-[22px] font-bold text-[#151515] leading-[1.25] tracking-tight uppercase"
              style={{ fontFamily: 'Helvetica, -apple-system, sans-serif' }}
            >
              STYLING MADE
              <br />
              SIMPLE.
            </h3>
          </div>

          {/* Horizontal scroll deck matching Flutter HomeHScrollRow of 186x263 cards */}
          {displayStyling.length === 0 ? (
            <div className="mx-5 p-6 rounded-xl bg-stone-50 border border-dashed border-stone-300 text-center text-xs text-stone-500">
              No styling shorts configured yet.
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto px-5 pb-2 scrollbar-none snap-x snap-mandatory">
              {displayStyling.map((item, index) => {
                let thumb =
                  item.image_url ||
                  item.mobile_image_url ||
                  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80'
                thumb = thumb.replace('img.youtube.com', 'i.ytimg.com').replace('maxresdefault.jpg', 'hqdefault.jpg')

                const rawTitle = item.title || 'Styling Guide'
                const words = rawTitle.split(/\s+/).filter(Boolean)
                const conciseTitle = words.length <= 5 ? words.join(' ') : words.slice(0, 5).join(' ')

                return (
                  <div
                    key={item.id || index}
                    onClick={() => onSelectShort?.(item)}
                    className="relative shrink-0 w-[160px] aspect-[186/310] rounded-[16px] overflow-hidden bg-stone-900 cursor-pointer snap-start transition-all hover:scale-[1.015] shadow-md group"
                  >
                    <img
                      src={thumb}
                      alt={rawTitle}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        e.currentTarget.src = 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80'
                      }}
                    />

                    {/* Dual Gradient Overlay: top scrim for badge legibility & bottom scrim for Watch Now */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80 pointer-events-none" />

                    {/* _TitleBadge: Frosted glass pill at top 14px, left 10px */}
                    {conciseTitle && (
                      <div className="absolute top-3.5 left-2.5 right-2.5 flex justify-start z-10 pointer-events-none">
                        <div className="bg-[#151515]/65 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/20 shadow-sm max-w-full">
                          <p className="text-white text-[10px] font-medium leading-tight truncate">
                            {conciseTitle}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Center 42x42 Translucent Play Button matching Flutter */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-[42px] h-[42px] rounded-full bg-black/45 backdrop-blur-sm border border-white/85 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                        <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5.14v14l11-7-11-7z" />
                        </svg>
                      </div>
                    </div>

                    {/* Bottom "Watch Now →" Link with underline */}
                    <div className="absolute bottom-3 left-0 right-0 text-center z-10 pointer-events-none">
                      <span className="text-white text-[12px] font-medium underline decoration-white/90 tracking-wide">
                        Watch Now →
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ── 4. HomeWeddingEditionsSection ("The Celebrity Edit", Figma Frame 380) ── */}
      {showCelebrity && (
        <section ref={celebrityRef} className="py-6 bg-white border-t border-stone-100">
          <div className="px-5 mb-5 flex items-center justify-between">
            <h3
              className="text-[22px] font-bold text-[#151515] leading-[1.25] tracking-tight"
              style={{ fontFamily: 'Helvetica, -apple-system, sans-serif' }}
            >
              The
              <br />
              Celebrity Edit
            </h3>
            <div className="flex items-center gap-1 opacity-80">
              <img src="/hilo-hi.png" alt="Hilo" className="h-3 w-auto object-contain" onError={e => { e.currentTarget.style.display = 'none' }} />
              <span className="font-bold tracking-[0.08em] text-[10px] text-stone-900" style={{ fontFamily: 'Helvetica, -apple-system, sans-serif' }}>
                DESIGN
              </span>
            </div>
          </div>

          {displayCelebrity.length === 0 ? (
            <div className="mx-5 p-6 rounded-xl bg-stone-50 border border-dashed border-stone-300 text-center text-xs text-stone-500">
              No celebrity looks configured yet. Add one in Celebrity Edits tab.
            </div>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto px-5 pb-2 scrollbar-none snap-x snap-mandatory">
              {displayCelebrity.map((item, index) => {
                const img =
                  item.image_url ||
                  item.mobile_image_url ||
                  'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500'

                let count = 0
                if (item.link_value) {
                  try {
                    const parsed = JSON.parse(item.link_value)
                    if (Array.isArray(parsed)) count = parsed.length
                  } catch {
                    count = item.link_value ? 1 : 0
                  }
                }

                return (
                  <div
                    key={item.id || index}
                    onClick={() => onSelectCelebrity?.(item)}
                    className="relative shrink-0 w-[172px] aspect-[194/280] rounded-[10px] overflow-hidden bg-stone-900 cursor-pointer snap-start transition-all hover:scale-[1.015] shadow-md group"
                  >
                    <img
                      src={img}
                      alt={item.title || 'Celebrity Look'}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => {
                        e.currentTarget.src =
                          'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500'
                      }}
                    />

                    {/* Gradient scrim matching Figma Frame 377 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />

                    {/* Top tags */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                      <span className="text-[9px] uppercase font-bold tracking-wider text-white bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/20">
                        {item.title || 'CELEBRITY EDIT'}
                      </span>
                      {count > 0 && (
                        <span className="text-[9px] font-semibold text-white bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-white/20">
                          {count} {count === 1 ? 'Piece' : 'Pieces'}
                        </span>
                      )}
                    </div>

                    {/* Centered Pill Button matching Figma Frame 247 */}
                    <div className="absolute inset-x-2.5 bottom-3 flex flex-col items-center">
                      <div className="w-full max-w-[145px] h-[32px] rounded-full border border-white/90 bg-white/20 backdrop-blur-md text-white flex items-center justify-center shadow-sm transition-all group-hover:bg-white group-hover:text-black">
                        <span
                          className="text-[11.5px] font-medium tracking-wide transition-colors group-hover:text-stone-950"
                          style={{ fontFamily: 'Instrument Sans, sans-serif' }}
                        >
                          Shop the look
                        </span>
                      </div>
                      {item.subtitle && (
                        <p className="text-white/85 text-[9.5px] text-center mt-1 truncate max-w-full font-medium drop-shadow-xs">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

import React, { useState, useRef, useEffect, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { uploadImage } from '../../lib/storage'
import { C, toast } from '../../lib/designTokens'
import { Btn } from '../orders/ui'
import {
  HERO_ASPECT,
  HERO_ZOOM,
  HERO_TRANSFORM_ORIGIN,
  HERO_VISIBLE,
  HERO_BASE_HEIGHT,
  PHONE_SCREEN_WIDTH,
  HeroScrim,
  HeroStatusBar,
  HeroOverlayContent,
} from './HeroSlideOverlay'

// Canonical aspect ratios (hero ratio + zoom/focus live in HeroSlideOverlay, shared with the live feed)
// The hero cropper renders the app's 314dp-wide phone screen enlarged by this factor.
const HERO_STUDIO_SCALE = 1
const CELEBRITY_ASPECT = 194 / 280 // ~ 0.6928 (matches Figma Frame 380 Celebrity Card)

const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    if (!url.startsWith('data:')) {
      image.setAttribute('crossOrigin', 'anonymous')
    }
    image.src = url
  })

export const getCroppedImg = async (imageSrc, pixelCrop) => {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) return null

  canvas.width = Math.round(pixelCrop.width)
  canvas.height = Math.round(pixelCrop.height)

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      0.95
    )
  })
}

export default function HiloImageCropper({
  mode = 'hero', // 'hero' | 'celebrity'
  initialImageUrl = '',
  bannerTitle = '',
  bannerSubtitle = '',
  slideCount = 1,
  slideIndex = 0,
  onCropComplete,
  onCancel,
}) {
  const isHero = mode === 'hero'
  const targetAspect = isHero ? HERO_ASPECT : CELEBRITY_ASPECT
  const targetFolder = isHero ? 'cms-banners' : 'celebrity-edits'

  // Studio dimensions. Hero: the exact phone-screen hero box (314 × 410.5) × studio scale,
  // so every overlay element sits at the same relative position/size as in the live feed.
  const frameWidth = isHero ? PHONE_SCREEN_WIDTH * HERO_STUDIO_SCALE : Math.round(500 * targetAspect)
  const frameHeight = isHero ? HERO_BASE_HEIGHT * HERO_STUDIO_SCALE : 500

  const [imageSrc, setImageSrc] = useState(initialImageUrl || '')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [showOverlay, setShowOverlay] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  // Hero only: 'live' = exactly what the app shows (zoom + overlay); 'full' = whole saved frame
  const [heroView, setHeroView] = useState('live')
  const isLiveView = isHero && heroView === 'live'
  const dragStartCropRef = useRef(null)

  const fileInputRef = useRef(null)
  const cropRef = useRef(crop)
  cropRef.current = crop

  useEffect(() => {
    if (initialImageUrl) {
      setImageSrc(initialImageUrl)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
    }
  }, [initialImageUrl])

  const onCropAreaComplete = useCallback((croppedArea, pixels) => {
    setCroppedAreaPixels(pixels)
  }, [])

  // In live view the cropper is visually magnified by HERO_ZOOM, so dragging must be
  // damped by the same factor to keep the image under the cursor.
  const handleCropChange = useCallback(
    (c) => {
      const start = dragStartCropRef.current
      if (isLiveView && start) {
        setCrop({
          x: start.x + (c.x - start.x) / HERO_ZOOM,
          y: start.y + (c.y - start.y) / HERO_ZOOM,
        })
      } else {
        setCrop(c)
      }
    },
    [isLiveView]
  )

  const handleInteractionStart = useCallback((interaction) => {
    dragStartCropRef.current =
      interaction?.source === 'mouse' || interaction?.source === 'touch' ? cropRef.current : null
  }, [])

  const handleInteractionEnd = useCallback(() => {
    dragStartCropRef.current = null
  }, [])

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImageSrc(reader.result)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleReset = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
  }

  const handleApplyCropAndUpload = async () => {
    if (!imageSrc || !croppedAreaPixels) {
      toast(false, 'Please position the image before saving')
      return
    }

    setUploading(true)
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels)
      if (!croppedBlob) throw new Error('Could not generate cropped image')

      const filename = `${mode}-${Date.now()}.jpg`
      const file = new File([croppedBlob], filename, { type: 'image/jpeg' })

      let publicUrl
      try {
        publicUrl = await uploadImage(file, targetFolder)
      } catch (uploadErr) {
        console.warn('[HILO Cropper] Supabase upload failed, using DataURL fallback:', uploadErr)
        publicUrl = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.readAsDataURL(croppedBlob)
        })
      }

      toast(true, 'Image cropped & uploaded to Supabase storage successfully!')
      onCropComplete(publicUrl)
    } catch (e) {
      console.error('[HILO Cropper] Crop and upload error:', e)
      toast(false, 'Failed to crop & upload: ' + (e.message || 'Unknown error'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md">
      <div
        className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden border flex flex-col max-h-[96vh]"
        style={{ borderColor: C.border }}
      >
        {/* Modal Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between shrink-0 bg-stone-50"
          style={{ borderColor: C.borderLight }}
        >
          <div>
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <span>📐</span>
              <span>{isHero ? 'Crop Hero Carousel Banner' : 'Crop Celebrity Look Thumbnail'}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-stone-200/80 text-stone-700 ml-1">
                {isHero ? '3104 × 4058 Ratio' : '194 × 280 Card Ratio'}
              </span>
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Drag image to pan • Use slider or scroll wheel to zoom • {isHero ? 'Live view matches the mobile app feed 1:1' : 'Preview shows mobile app layout'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl border border-stone-300 hover:bg-stone-100 text-xs font-semibold text-stone-700 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <span>📁</span>
              <span>Change Image</span>
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-8 h-8 rounded-full hover:bg-stone-200/80 flex items-center justify-center text-stone-500 hover:text-stone-900 transition-colors text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body: Spacious Dark Studio Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center bg-stone-950 gap-4 select-none">
          {imageSrc ? (
            <div
              className={`relative overflow-hidden shadow-2xl bg-[#090807] ring-2 ring-stone-800 ${isHero ? 'rounded-none' : 'rounded-2xl'}`}
              style={{
                width: `${frameWidth}px`,
                height: `${frameHeight}px`,
              }}
            >
              {/* Cropper strictly locked to frame dimensions.
                  Hero live view magnifies the cropper by the app's cover zoom (same transform as
                  the live feed image) so the preview is exactly what devices will show. */}
              <div
                className="absolute inset-0"
                style={
                  isLiveView
                    ? { transform: `scale(${HERO_ZOOM})`, transformOrigin: HERO_TRANSFORM_ORIGIN }
                    : undefined
                }
              >
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={targetAspect}
                  objectFit="cover"
                  cropSize={{ width: frameWidth, height: frameHeight }}
                  onCropChange={handleCropChange}
                  onZoomChange={setZoom}
                  onCropComplete={onCropAreaComplete}
                  onInteractionStart={handleInteractionStart}
                  onInteractionEnd={handleInteractionEnd}
                  showGrid={showGrid && !isLiveView}
                  classes={{
                    containerClassName: isHero ? '' : 'rounded-2xl',
                    cropAreaClassName: isHero ? '' : 'rounded-2xl',
                  }}
                  style={{
                    containerStyle: {
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: '#090807',
                    },
                    cropAreaStyle: {
                      border: isLiveView ? 'none' : '1.5px solid rgba(255, 255, 255, 0.9)',
                      boxShadow: isLiveView ? 'none' : '0 0 0 9999px rgba(0, 0, 0, 0.55)',
                    },
                  }}
                />
              </div>

              {/* Hero: exact app rendering (scrim + status bar + app bar + greeting + CTA + dots).
                  Authored at the phone's 314dp width and enlarged by HERO_STUDIO_SCALE. */}
              {isLiveView && showOverlay && (
                <div
                  className="absolute left-0 top-0 pointer-events-none select-none z-10"
                  style={{
                    width: PHONE_SCREEN_WIDTH,
                    height: HERO_BASE_HEIGHT,
                    transform: `scale(${HERO_STUDIO_SCALE})`,
                    transformOrigin: '0 0',
                    fontFamily: "'Instrument Sans', -apple-system, BlinkMacSystemFont, sans-serif",
                  }}
                >
                  <HeroScrim />
                  <HeroStatusBar />
                  <HeroOverlayContent
                    subtitle={bannerSubtitle}
                    slideCount={slideCount}
                    currentIdx={slideIndex}
                  />
                </div>
              )}

              {/* Hero full-frame view: show the region the app crops away (zoomed out of view) */}
              {isHero && !isLiveView && (
                <div
                  className="absolute pointer-events-none z-10 border border-dashed border-white/80"
                  style={{
                    left: `${HERO_VISIBLE.left * 100}%`,
                    top: `${HERO_VISIBLE.top * 100}%`,
                    width: `${HERO_VISIBLE.size * 100}%`,
                    height: `${HERO_VISIBLE.size * 100}%`,
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
                  }}
                >
                  <span className="absolute -top-5 left-0 text-[10px] font-semibold text-white/90 whitespace-nowrap drop-shadow">
                    Visible in app
                  </span>
                </div>
              )}

              {/* Live Overlay for Celebrity Edit Card */}
              {showOverlay && !isHero && (
                <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-4 select-none">
                  {/* Top Scrim */}
                  <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/55 to-transparent pointer-events-none" />
                  {/* Bottom Scrim */}
                  <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

                  {/* Top Badge */}
                  <div className="relative z-20 pt-1">
                    <span className="px-2.5 py-1 rounded-full bg-black/60 border border-white/30 text-white text-[9px] font-bold tracking-wider">
                      CELEBRITY EDIT
                    </span>
                  </div>

                  {/* Centered Frosted Button: Shop the look */}
                  <div className="relative z-20 flex flex-col items-center gap-3 pb-2 text-center">
                    <div>
                      {bannerSubtitle && (
                        <p className="text-[#E5C07B] text-[10px] font-semibold tracking-wider uppercase mb-0.5">
                          {bannerSubtitle}
                        </p>
                      )}
                      <h4
                        className="text-white text-base font-bold leading-tight drop-shadow-sm"
                        style={{ fontFamily: 'Helvetica, -apple-system, sans-serif' }}
                      >
                        {bannerTitle || 'Groom Edition'}
                      </h4>
                    </div>

                    <div className="px-5 py-2 rounded-full bg-white/20 backdrop-blur-md border border-white/60 text-white text-[11px] font-semibold tracking-wide shadow-md">
                      Shop the look →
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-80 text-stone-400">
              <span className="text-4xl mb-2">🖼️</span>
              <p className="text-xs">No image loaded to crop</p>
            </div>
          )}

          {/* Quick Studio Controls Bar */}
          <div className="w-full max-w-lg flex flex-wrap items-center justify-between gap-3 text-xs text-stone-300 px-2 py-2 bg-stone-900/90 rounded-2xl border border-stone-800">
            {/* Zoom Slider */}
            <div className="flex items-center gap-2">
              <span className="text-stone-400 text-xs">Zoom</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, z - 0.1))}
                className="w-6 h-6 rounded-lg bg-stone-800 hover:bg-stone-700 text-white text-xs font-bold flex items-center justify-center transition-colors"
              >
                −
              </button>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-24 sm:w-32 accent-amber-500 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
                className="w-6 h-6 rounded-lg bg-stone-800 hover:bg-stone-700 text-white text-xs font-bold flex items-center justify-center transition-colors"
              >
                +
              </button>
              <span className="text-[11px] text-stone-400 font-mono w-10 text-right">
                {zoom.toFixed(1)}x
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isHero && (
                <button
                  type="button"
                  onClick={() => setHeroView((v) => (v === 'live' ? 'full' : 'live'))}
                  className="px-2.5 py-1 rounded-lg font-medium border text-xs transition-colors bg-stone-800 text-stone-200 border-stone-700 hover:text-white"
                  title="Switch between the exact app view and the full saved frame"
                >
                  {heroView === 'live' ? '📱 App view' : '🖼️ Full frame'}
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowOverlay((v) => !v)}
                className={`px-2.5 py-1 rounded-lg font-medium border text-xs transition-colors flex items-center gap-1 ${
                  showOverlay
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-stone-800 text-stone-400 border-stone-700 hover:text-white'
                }`}
              >
                <span>📱</span>
                <span>Overlay: {showOverlay ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowGrid((v) => !v)}
                className={`px-2 py-1 rounded-lg font-medium border text-xs transition-colors ${
                  showGrid
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-stone-800 text-stone-400 border-stone-700 hover:text-white'
                }`}
                title="Toggle alignment grid"
              >
                #
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white border border-stone-700 text-xs transition-colors"
                title="Reset crop and zoom"
              >
                ↺
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          className="px-6 py-4 border-t flex items-center justify-between shrink-0 bg-white"
          style={{ borderColor: C.borderLight }}
        >
          <div className="text-xs text-stone-500">
            {uploading ? (
              <span className="text-amber-600 font-semibold animate-pulse">
                ⏳ Processing & uploading to Supabase...
              </span>
            ) : (
              <span>Position image and click apply to save crop.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Btn small onClick={onCancel} disabled={uploading}>
              Cancel
            </Btn>
            <Btn small primary onClick={handleApplyCropAndUpload} disabled={uploading || !imageSrc}>
              {uploading ? 'Uploading...' : '✓ Crop & Apply Image'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}

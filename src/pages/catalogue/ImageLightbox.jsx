import React, { useState, useEffect, useCallback } from 'react'

function getProductImages(product) {
  var imgs = []
  if (product.image_url) imgs.push(product.image_url)
  if (product.shopify_images) {
    var parsed = product.shopify_images
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed) } catch(e) { parsed = [] }
    }
    if (Array.isArray(parsed)) {
      for (var i = 0; i < parsed.length; i++) {
        var img = parsed[i]
        var url = typeof img === 'string' ? img : (img && (img.src || img.url))
        if (url && imgs.indexOf(url) === -1) imgs.push(url)
      }
    }
  }
  return imgs
}

var ImageLightbox = function({ images, initialIndex, onClose }) {
  var [idx, setIdx] = useState(initialIndex || 0)
  var [loading, setLoading] = useState(true)

  var total = images ? images.length : 0

  var prev = useCallback(function() { setIdx(function(i) { return i > 0 ? i - 1 : total - 1 }); setLoading(true) }, [total])
  var next = useCallback(function() { setIdx(function(i) { return i < total - 1 ? i + 1 : 0 }); setLoading(true) }, [total])

  useEffect(function() {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handleKey)
    return function() { window.removeEventListener('keydown', handleKey) }
  }, [onClose, prev, next])

  if (!images || images.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{background:'rgba(0,0,0,0.85)'}}
        onClick={onClose}>
        <div className="text-center text-white">
          <div className="text-4xl mb-4">📷</div>
          <div className="text-lg">No images available</div>
          <button onClick={onClose} className="mt-4 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-sm">Close</button>
        </div>
      </div>
    )
  }

  var currentUrl = images[idx] || ''

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{background:'rgba(0,0,0,0.85)'}}
      onClick={function(e) { if (e.target === e.currentTarget) onClose() }}>

      {/* Close button */}
      <button onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white text-xl transition-colors">
        ✕
      </button>

      {/* Counter */}
      {total > 1 && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 text-white/70 text-sm font-medium">
          {idx + 1} of {total}
        </div>
      )}

      {/* Main image area */}
      <div className="flex-1 flex items-center justify-center w-full relative px-16">
        {/* Left arrow */}
        {total > 1 && (
          <button onClick={function(e) { e.stopPropagation(); prev() }}
            className="absolute left-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white text-2xl transition-colors">
            ‹
          </button>
        )}

        {/* Image */}
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            </div>
          )}
          <img
            src={currentUrl}
            alt=""
            className="max-h-[75vh] max-w-[85vw] object-contain rounded-lg"
            style={{opacity: loading ? 0 : 1, transition: 'opacity 0.2s'}}
            onLoad={function() { setLoading(false) }}
            onError={function() { setLoading(false) }}
          />
        </div>

        {/* Right arrow */}
        {total > 1 && (
          <button onClick={function(e) { e.stopPropagation(); next() }}
            className="absolute right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white text-2xl transition-colors">
            ›
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {total > 1 && (
        <div className="flex gap-2 py-4 px-4 overflow-x-auto max-w-full">
          {images.map(function(url, i) {
            return (
              <button key={i} onClick={function(e) { e.stopPropagation(); setIdx(i); setLoading(true) }}
                className={'w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ' +
                  (i === idx ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100')}>
                <img src={url} alt="" className="w-full h-full object-cover"
                  onError={function(e) { e.target.style.display='none' }} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export { getProductImages }
export default ImageLightbox

import React, { useState, useRef, useEffect, useMemo } from 'react'

/**
 * FabricPicker — searchable dropdown with image thumbnails
 *
 * Props:
 *   fabrics    – array from mapSupaFabrics (id, name, image_urls, fabric_family, colour, costPerMetre, costType, composition, …)
 *   value      – currently selected fabric id
 *   onChange   – (fabricId) => void
 *   placeholder – placeholder text (default "Select fabric…")
 *   showCost   – show cost info in dropdown rows (default false)
 *   compact    – smaller height for inline/set-piece usage (default false)
 *   activeOnly – filter to is_active fabrics only (default true)
 *   className  – extra wrapper class
 *   style      – extra wrapper style
 */

const FALLBACK_IMG = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="none"><rect width="40" height="40" rx="6" fill="#f3f4f6"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#9ca3af" font-family="sans-serif">No img</text></svg>'
)

const FabricPicker = ({
  fabrics = [],
  value = '',
  onChange = () => {},
  placeholder = 'Select fabric\u2026',
  showCost = false,
  compact = false,
  activeOnly = true,
  className = '',
  style = {},
}) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus search input when opened
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus() }, [open])

  const activeFabrics = useMemo(() => {
    return activeOnly ? fabrics.filter(f => f.is_active !== false) : fabrics
  }, [fabrics, activeOnly])

  const filtered = useMemo(() => {
    if (!search) return activeFabrics
    const q = search.toLowerCase()
    return activeFabrics.filter(f =>
      (f.name || '').toLowerCase().includes(q) ||
      (f.colour || f._colour || '').toLowerCase().includes(q) ||
      (f.fabric_family || f._fabric_family || '').toLowerCase().includes(q) ||
      (f.fabricSKU || f.id || '').toLowerCase().includes(q) ||
      (f.composition || '').toLowerCase().includes(q)
    )
  }, [activeFabrics, search])

  const selected = value ? fabrics.find(f => f.id === value) : null
  const thumbUrl = (f) => (f.image_urls && f.image_urls.length > 0) ? f.image_urls[0] : FALLBACK_IMG

  const handleSelect = (f) => {
    onChange(f.id)
    setOpen(false)
    setSearch('')
  }

  const clear = (e) => {
    e.stopPropagation()
    onChange('')
    setSearch('')
  }

  const h = compact ? 'py-1.5' : 'py-2'

  return (
    <div ref={wrapRef} className={`relative ${className}`} style={style}>
      {/* Selected / trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-2.5 ${h} rounded-xl text-left text-sm outline-none transition-all`}
        style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#1b1c1a' }}
      >
        {selected ? (
          <>
            <img src={thumbUrl(selected)} alt="" className={`${compact ? 'w-7 h-7' : 'w-9 h-9'} rounded-lg object-cover shrink-0`} />
            <div className="flex-1 min-w-0">
              <div className={`font-medium truncate ${compact ? 'text-xs' : 'text-sm'}`}>{selected.name}</div>
              <div className="text-[10px] text-gray-400 truncate">
                {[selected.fabric_family || selected._fabric_family, selected.colour || selected._colour].filter(Boolean).join(' · ')}
                {showCost && selected.costPerMetre ? ` · ₹${selected.costPerMetre}${selected.costType === 'total' ? ' total' : '/m'}` : ''}
              </div>
            </div>
            <span onClick={clear} className="text-gray-300 hover:text-gray-500 p-0.5 shrink-0" title="Clear">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </span>
          </>
        ) : (
          <span className="text-gray-400 flex-1">{placeholder}</span>
        )}
        <svg className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl shadow-lg overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
          {/* Search input */}
          <div className="px-2.5 py-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, colour, family\u2026"
              className="w-full text-xs px-2.5 py-1.5 rounded-lg outline-none"
              style={{ background: '#f9fafb', border: '1px solid #f3f4f6' }}
            />
          </div>
          {/* Options list */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">No fabrics found</div>
            )}
            {filtered.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleSelect(f)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left hover:bg-amber-50 transition-colors ${f.id === value ? 'bg-amber-50/60' : ''}`}
                style={{ borderBottom: '1px solid #f9fafb' }}
              >
                <img src={thumbUrl(f)} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{f.name}</div>
                  <div className="text-[10px] text-gray-400 truncate">
                    {[f.fabric_family || f._fabric_family, f.colour || f._colour, f.composition].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {showCost && f.costPerMetre > 0 && (
                  <div className="text-xs font-semibold text-gray-500 shrink-0">
                    ₹{f.costPerMetre}{f.costType === 'total' ? '' : '/m'}
                  </div>
                )}
                {f.id === value && (
                  <svg className="w-4 h-4 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default FabricPicker

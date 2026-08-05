import React, { useState, useEffect, useMemo } from 'react'
import { supa } from '../../lib/supabase'
import { productToSnake } from '../../lib/caseMapping'
import { n, calcCogs, calcPieceCogs, effectiveSP, gmPct } from '../../lib/helpers'
import ImageLightbox, { getProductImages } from './ImageLightbox'
import FabricPicker from '../../components/FabricPicker'

// ── Parse setComponents safely (JSON string or array) ───────────────────────
var parseSetComponents = function(p) {
  if (!p) return []
  var sc = p.setComponents || p.set_components
  if (!sc) return []
  if (typeof sc === 'string') {
    try { sc = JSON.parse(sc) } catch (e) { return [] }
  }
  if (!Array.isArray(sc)) return []
  return sc
}

var isSetProduct = function(p) {
  if (!p) return false
  if (p.isSet === true || p.is_set === true) return true
  return parseSetComponents(p).length > 0
}

// ── Init row from product — same field names as calcCogs() expects ──────────
var initRow = function(p) {
  return {
    fabricId:       p.fabricId || p.fabric_id || '',
    fabricName:     p.fabricName || p.fabric_name || '',
    costPerMetre:   n(p.costPerMetre || p.cost_per_metre),
    costType:       p.costType || p.cost_type || 'per_metre',
    metres:         n(p.metres),
    dyeId:          p.dyeId || p.dye_id || '',
    dyePerMetre:    n(p.dyePerMetre || p.dye_per_metre),
    embroidery_type: p.embroidery_type || '',
    embroidery:     n(p.embroidery),
    stitching:      n(p.stitching),
    accessories:    n(p.accessories),
    dirty: false, saving: false, submitting: false,
  }
}

// ── Init piece row — same field names as calcPieceCogs() expects ────────────
var initPieceRow = function(piece) {
  return {
    fabricId:       piece.fabricId || '',
    fabricName:     piece.fabricName || '',
    costPerMetre:   n(piece.costPerMetre),
    costType:       piece.costType || 'per_metre',
    metres:         n(piece.metres),
    dyeId:          piece.dyeId || '',
    dyePerMetre:    n(piece.dyePerMetre),
    embroidery_type: piece.embroidery_type || '',
    embroidery:     n(piece.embroidery),
    stitching:      n(piece.stitching),
    accessories:    n(piece.accessories),
    category:       piece.category || '',
  }
}

// ── Empty piece — same as ProductForm ────────────────────────────────────────
var emptyPiece = function(name) {
  return {
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)),
    name: name || '', category: '', fabricId: '', fabricName: '', metres: '', costPerMetre: '', costType: 'per_metre',
    dyeId: '', dyePerMetre: '', stitching: '', embroidery: '', embroidery_type: '', accessories: '',
  }
}

// ── Column header style ─────────────────────────────────────────────────────
var thStyle = { fontSize: 9, letterSpacing: '0.08em', color: '#9c9b97', fontFamily: 'Inter,sans-serif', fontWeight: 600, textTransform: 'uppercase' }

var PAGE_SIZE = 50

// ── Component ───────────────────────────────────────────────────────────────
var QuickEntry = function({ products, fabrics, dyes, stitchingMaster, categories, consumption, onRefresh }) {
  var [edits, setEdits] = useState({})
  var [pieceEdits, setPieceEdits] = useState({})
  var [setOverrides, setSetOverrides] = useState({})  // { productId: true/false } — local set toggle
  var [lightboxProduct, setLightboxProduct] = useState(null)
  var [expandedSets, setExpandedSets] = useState({})
  var [page, setPage] = useState(1)

  var totalPages = Math.ceil(products.length / PAGE_SIZE)
  var paged = useMemo(function() {
    return products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  }, [products, page])

  useEffect(function() { setPage(1) }, [products.length])

  // Init edits for visible products
  useEffect(function() {
    setEdits(function(prev) {
      var next = { ...prev }; var changed = false
      paged.forEach(function(p) {
        if (!next[p.id]) { next[p.id] = initRow(p); changed = true }
      })
      return changed ? next : prev
    })
    setPieceEdits(function(prev) {
      var next = { ...prev }; var changed = false
      paged.forEach(function(p) {
        var sc = parseSetComponents(p)
        if (sc.length > 0 && !next[p.id]) {
          var pieces = {}
          sc.forEach(function(piece) { pieces[piece.id] = initPieceRow(piece) })
          next[p.id] = pieces; changed = true
        }
      })
      return changed ? next : prev
    })
  }, [paged])

  // ── Row helpers ─────────────────────────────────────────────────────────
  var setField = function(productId, field, value) {
    setEdits(function(prev) {
      return { ...prev, [productId]: { ...(prev[productId] || {}), [field]: value, dirty: true } }
    })
  }
  var setFields = function(productId, obj) {
    setEdits(function(prev) {
      return { ...prev, [productId]: { ...(prev[productId] || {}), ...obj, dirty: true } }
    })
  }
  var getRow = function(productId) { return edits[productId] || {} }

  // ── Set toggle — convert single ↔ set ──────────────────────────────────
  var isProductSet = function(p) {
    // Check local override first, then original data
    if (setOverrides[p.id] !== undefined) return setOverrides[p.id]
    return isSetProduct(p)
  }

  var toggleSet = function(productId, product, makeSet) {
    setSetOverrides(function(prev) { return { ...prev, [productId]: makeSet } })
    if (makeSet) {
      // Create 2 default pieces if none exist
      var sc = parseSetComponents(product)
      if (sc.length === 0) {
        var p1 = emptyPiece('Piece 1')
        var p2 = emptyPiece('Piece 2')
        setPieceEdits(function(prev) {
          var pieces = {}
          pieces[p1.id] = initPieceRow(p1)
          pieces[p2.id] = initPieceRow(p2)
          return { ...prev, [productId]: pieces }
        })
        // Store the piece IDs so we can rebuild setComponents on save
        setEdits(function(prev) {
          return { ...prev, [productId]: { ...(prev[productId] || {}), dirty: true, _newPieces: [p1, p2] } }
        })
      }
      setExpandedSets(function(prev) { return { ...prev, [productId]: true } })
    } else {
      // Clear pieces
      setPieceEdits(function(prev) { var next = { ...prev }; delete next[productId]; return next })
      setEdits(function(prev) {
        var row = { ...(prev[productId] || {}), dirty: true }
        delete row._newPieces
        return { ...prev, [productId]: row }
      })
    }
  }

  var addPiece = function(productId) {
    var piece = emptyPiece('')
    setPieceEdits(function(prev) {
      var prodPieces = { ...(prev[productId] || {}) }
      prodPieces[piece.id] = initPieceRow(piece)
      return { ...prev, [productId]: prodPieces }
    })
    setEdits(function(prev) {
      var row = { ...(prev[productId] || {}), dirty: true }
      var existing = row._newPieces || []
      row._newPieces = [].concat(existing, [piece])
      return { ...prev, [productId]: row }
    })
  }

  var removePiece = function(productId, pieceId) {
    setPieceEdits(function(prev) {
      var prodPieces = { ...(prev[productId] || {}) }
      delete prodPieces[pieceId]
      return { ...prev, [productId]: prodPieces }
    })
    setEdits(function(prev) {
      var row = { ...(prev[productId] || {}), dirty: true }
      if (row._newPieces) {
        row._newPieces = row._newPieces.filter(function(p) { return p.id !== pieceId })
      }
      return { ...prev, [productId]: row }
    })
  }

  // ── Piece helpers ───────────────────────────────────────────────────────
  var setPieceFields = function(productId, pieceId, obj) {
    setPieceEdits(function(prev) {
      var prodPieces = { ...(prev[productId] || {}) }
      prodPieces[pieceId] = { ...(prodPieces[pieceId] || {}), ...obj }
      return { ...prev, [productId]: prodPieces }
    })
    setEdits(function(prev) {
      return { ...prev, [productId]: { ...(prev[productId] || {}), dirty: true } }
    })
  }
  var setPieceField = function(productId, pieceId, field, value) {
    setPieceFields(productId, pieceId, { [field]: value })
  }
  var getPieceRow = function(productId, pieceId) {
    return (pieceEdits[productId] && pieceEdits[productId][pieceId]) || {}
  }

  // Get the authoritative piece list for a product (original + newly added)
  var getProductPieces = function(productId, product) {
    var row = edits[productId] || {}
    // If we have _newPieces (set was toggled on or pieces added), use those
    if (row._newPieces && row._newPieces.length > 0) return row._newPieces
    // Otherwise use original setComponents from DB
    return parseSetComponents(product)
  }

  // ── Auto-fill: Fabric — EXACT SAME as ProductForm ──────────────────────
  var onFabricChange = function(productId, fabricId, product) {
    var fab = fabrics.find(function(f) { return f.id === fabricId })
    if (!fab) return
    var updates = {
      fabricId: fabricId,
      fabricName: fab.name || '',
      costPerMetre: n(fab.costPerMetre),
      costType: fab.costType || 'per_metre',
    }
    // Auto-fill metres from consumption master (same logic as ProductForm)
    var cat = product.category || ''
    if (cat && consumption && consumption.length > 0) {
      var rule = consumption.find(function(c) {
        return c.category === cat && (c.fabricId === fabricId || c.fabric_id === fabricId)
      })
      if (rule) updates.metres = n(rule.metres)
    }
    setFields(productId, updates)
  }

  var onPieceFabricChange = function(productId, pieceId, fabricId, category) {
    var fab = fabrics.find(function(f) { return f.id === fabricId })
    if (!fab) return
    var updates = {
      fabricId: fabricId,
      fabricName: fab.name || '',
      costPerMetre: n(fab.costPerMetre),
      costType: fab.costType || 'per_metre',
    }
    // Auto-fill metres from consumption for piece category
    if (category && consumption && consumption.length > 0) {
      var rule = consumption.find(function(c) {
        return c.category === category && (c.fabricId === fabricId || c.fabric_id === fabricId)
      })
      if (rule) updates.metres = n(rule.metres)
    }
    setPieceFields(productId, pieceId, updates)
  }

  // ── Auto-fill: Dye — same as ProductForm ───────────────────────────────
  var onDyeChange = function(productId, dyeId) {
    if (!dyeId) {
      setFields(productId, { dyeId: '', dyePerMetre: 0 })
      return
    }
    var dye = dyes.find(function(d) { return d.id === dyeId })
    if (dye) setFields(productId, { dyeId: dyeId, dyePerMetre: n(dye.costPerMetre) })
  }

  var onPieceDyeChange = function(productId, pieceId, dyeId) {
    if (!dyeId) {
      setPieceFields(productId, pieceId, { dyeId: '', dyePerMetre: 0 })
      return
    }
    var dye = dyes.find(function(d) { return d.id === dyeId })
    if (dye) setPieceFields(productId, pieceId, { dyeId: dyeId, dyePerMetre: n(dye.costPerMetre) })
  }

  // ── Auto-fill: Stitching — same as ProductForm ────────────────────────
  var onStitchingChange = function(productId, stitchId) {
    var stitch = stitchingMaster.find(function(s) { return s.id === stitchId })
    if (stitch) setField(productId, 'stitching', n(stitch.cost))
  }

  var onPieceStitchingChange = function(productId, pieceId, stitchId) {
    var stitch = stitchingMaster.find(function(s) { return s.id === stitchId })
    if (stitch) setPieceField(productId, pieceId, 'stitching', n(stitch.cost))
  }

  // ── Calculations — using SAME helpers as ProductForm ──────────────────
  var getRowCogs = function(row) {
    // calcCogs expects these field names — our row state matches
    return calcCogs(row)
  }

  var getPieceCogs = function(pr) {
    return calcPieceCogs(pr)
  }

  var getSetTotalCogs = function(productId, product) {
    var pieces = pieceEdits[productId]
    var sc = getProductPieces(productId, product)
    if (!pieces || sc.length === 0) return 0
    var total = 0
    sc.forEach(function(pc) {
      var pr = pieces[pc.id] || initPieceRow(pc)
      total += getPieceCogs(pr)
    })
    return total
  }

  // ── Save — same structure as ProductForm ────────────────────────────────
  var saveRow = async function(productId, product) {
    var row = edits[productId]
    if (!row || !row.dirty) return
    setField(productId, 'saving', true)
    try {
      var isSet = isProductSet(product)
      var sc = getProductPieces(productId, product)
      var updates = {}

      // Persist is_set flag if toggled
      if (setOverrides[productId] !== undefined) {
        updates.is_set = setOverrides[productId]
      }

      if (isSet && sc.length > 0) {
        var pieces = pieceEdits[productId] || {}
        var updatedComponents = sc.map(function(pc) {
          var pr = pieces[pc.id] || {}
          return {
            ...pc,
            name:           pr.name !== undefined ? pr.name : (pc.name || ''),
            fabricId:       pr.fabricId !== undefined ? pr.fabricId : pc.fabricId,
            fabricName:     pr.fabricName !== undefined ? pr.fabricName : pc.fabricName,
            costPerMetre:   pr.costPerMetre !== undefined ? pr.costPerMetre : pc.costPerMetre,
            costType:       pr.costType !== undefined ? pr.costType : (pc.costType || 'per_metre'),
            metres:         pr.metres !== undefined ? pr.metres : pc.metres,
            dyeId:          pr.dyeId !== undefined ? pr.dyeId : (pc.dyeId || ''),
            dyePerMetre:    pr.dyePerMetre !== undefined ? pr.dyePerMetre : (pc.dyePerMetre || 0),
            embroidery_type: pr.embroidery_type !== undefined ? pr.embroidery_type : (pc.embroidery_type || ''),
            embroidery:     pr.embroidery !== undefined ? pr.embroidery : pc.embroidery,
            stitching:      pr.stitching !== undefined ? pr.stitching : pc.stitching,
            accessories:    pr.accessories !== undefined ? pr.accessories : pc.accessories,
            category:       pr.category !== undefined ? pr.category : (pc.category || ''),
          }
        })
        updates.set_components = JSON.stringify(updatedComponents)
      } else if (!isSet) {
        // Clear set_components if toggled off
        if (setOverrides[productId] === false) {
          updates.set_components = null
        }
        var snaked = productToSnake({
          fabricId:     row.fabricId,
          fabricName:   row.fabricName,
          costPerMetre: row.costPerMetre,
          metres:       row.metres,
          dyeId:        row.dyeId || '',
          dyePerMetre:  row.dyeId ? row.dyePerMetre : 0,
        })
        Object.assign(updates, snaked)
        updates.embroidery_type = row.embroidery_type || ''
        updates.embroidery = n(row.embroidery)
        updates.stitching = n(row.stitching)
        updates.accessories = n(row.accessories)
      }
      var { error } = await supa.from('design_products').update(updates).eq('id', productId)
      if (error) throw error
      setFields(productId, { dirty: false, saving: false })
    } catch (e) {
      console.error('QuickEntry save error:', e)
      alert('Save failed: ' + e.message)
      setField(productId, 'saving', false)
    }
  }

  // ── Submit for review ──────────────────────────────────────────────────
  var submitRow = async function(productId, product) {
    var row = edits[productId]
    if (row && row.dirty) await saveRow(productId, product)
    setField(productId, 'submitting', true)
    try {
      var { error } = await supa.from('design_products').update({
        cogs_review_status: 'in_review',
        cogs_entered_by: window._currentUserEmail || window._currentUserName || 'unknown',
        cogs_entered_at: new Date().toISOString(),
        cogs_rejection_note: null,
      }).eq('id', productId)
      if (error) throw error
      onRefresh()
    } catch (e) {
      console.error('Submit error:', e)
      alert('Submit failed: ' + e.message)
      setField(productId, 'submitting', false)
    }
  }

  // ── Bulk submit ────────────────────────────────────────────────────────
  var eligibleIds = useMemo(function() {
    return paged.filter(function(p) {
      var row = edits[p.id]
      if (!row) return false
      var cogs = isProductSet(p) ? getSetTotalCogs(p.id, p) : getRowCogs(row)
      return cogs > 0 && !row.dirty
    }).map(function(p) { return p.id })
  }, [paged, edits, pieceEdits])

  var bulkSubmit = async function() {
    if (eligibleIds.length === 0) return
    if (!confirm('Submit ' + eligibleIds.length + ' product(s) for review?')) return
    try {
      var { error } = await supa.from('design_products').update({
        cogs_review_status: 'in_review',
        cogs_entered_by: window._currentUserEmail || window._currentUserName || 'unknown',
        cogs_entered_at: new Date().toISOString(),
        cogs_rejection_note: null,
      }).in('id', eligibleIds)
      if (error) throw error
      onRefresh()
    } catch (e) {
      alert('Bulk submit failed: ' + e.message)
    }
  }

  // ── Consumption master update ──────────────────────────────────────────
  var consumptionDiffers = function(product, row) {
    if (!row.fabricId) return false
    var cat = product.category || ''
    var cons = consumption.find(function(c) {
      return c.category === cat && (c.fabricId === row.fabricId || c.fabric_id === row.fabricId)
    })
    if (!cons) return false
    return n(row.metres) !== n(cons.metres) && n(row.metres) > 0
  }
  var updateConsumptionMaster = async function(product, row) {
    var cat = product.category || ''
    var cons = consumption.find(function(c) {
      return c.category === cat && (c.fabricId === row.fabricId || c.fabric_id === row.fabricId)
    })
    if (!cons) return
    try {
      await supa.from('consumption_masters').update({ metres: n(row.metres) }).eq('id', cons.id)
      alert('Consumption master updated!')
    } catch (e) { alert('Update failed: ' + e.message) }
  }

  // ── Row blur auto-save ─────────────────────────────────────────────────
  var handleRowBlur = function(productId, product) {
    setTimeout(function() {
      var active = document.activeElement
      if (!active) return
      var rowEl = active.closest('[data-product-id]')
      if (rowEl && rowEl.getAttribute('data-product-id') === productId) return
      saveRow(productId, product)
    }, 200)
  }

  var toggleExpand = function(id) {
    setExpandedSets(function(prev) { return { ...prev, [id]: !prev[id] } })
  }

  // ── Render cost cells — shared for singles + pieces ────────────────────
  var renderCostCells = function(rowId, row, setFieldFn, opts) {
    var onFabChange = opts.onFabricChange
    var onDyeChg = opts.onDyeChange
    var onStitchChg = opts.onStitchingChange
    var product = opts.product
    var hasDye = !!(row.dyeId)
    var fabricCost = row.costType === 'total' ? n(row.costPerMetre) : n(row.costPerMetre) * n(row.metres)
    var dyeCost = hasDye ? n(row.dyePerMetre) * n(row.metres) : 0

    return (
      <>
        {/* Fabric — searchable picker with images */}
        <td className="px-1 py-1 text-center" style={{overflow:'visible'}}>
          <div style={{width: 160, minWidth: 160}}>
            <FabricPicker fabrics={fabrics} value={row.fabricId || ''} onChange={function(id) { onFabChange(id) }} showCost compact placeholder="Select fabric" />
          </div>
        </td>
        {/* Cost/m */}
        <td className="px-1 py-1 text-center">
          <input type="number" value={row.costPerMetre || ''} step="any"
            onChange={function(e) { setFieldFn('costPerMetre', n(e.target.value)) }}
            className="w-20 border border-gray-200 rounded-lg px-1.5 py-1.5 text-[11px] text-right focus:ring-2 focus:ring-amber-400" />
        </td>
        {/* Metres */}
        <td className="px-1 py-1 text-center">
          <input type="number" value={row.metres || ''} step="any"
            onChange={function(e) { setFieldFn('metres', n(e.target.value)) }}
            className="w-16 border border-gray-200 rounded-lg px-1.5 py-1.5 text-[11px] text-right focus:ring-2 focus:ring-amber-400" />
          {product && consumptionDiffers(product, row) && (
            <button onClick={function() { updateConsumptionMaster(product, row) }}
              className="text-[8px] text-blue-600 underline block mx-auto hover:text-blue-800">Update master</button>
          )}
        </td>
        {/* Fab Cost */}
        <td className="px-1 py-1 text-center">
          <div className="w-20 mx-auto bg-gray-50 rounded-lg px-1.5 py-1.5 text-[11px] text-right text-gray-600 font-semibold">
            {fabricCost > 0 ? '₹' + Math.round(fabricCost).toLocaleString('en-IN') : '—'}
          </div>
        </td>
        {/* Dye Type — no toggle, just a select like ProductForm */}
        <td className="px-1 py-1 text-center">
          <select value={row.dyeId || ''}
            onChange={function(e) { onDyeChg(e.target.value) }}
            className="w-28 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px] focus:ring-2 focus:ring-amber-400">
            <option value="">No Dye</option>
            {dyes.map(function(d) { return <option key={d.id} value={d.id}>{d.type} (₹{d.costPerMetre}/m)</option> })}
          </select>
        </td>
        {/* Dye/m */}
        <td className="px-1 py-1 text-center">
          {hasDye ? (
            <input type="number" value={row.dyePerMetre || ''} step="any"
              onChange={function(e) { setFieldFn('dyePerMetre', n(e.target.value)) }}
              className="w-16 border border-gray-200 rounded-lg px-1.5 py-1.5 text-[11px] text-right focus:ring-2 focus:ring-amber-400" />
          ) : (
            <div className="w-16 text-center text-[10px] text-gray-300">—</div>
          )}
        </td>
        {/* Dye Cost */}
        <td className="px-1 py-1 text-center">
          <div className={'w-20 mx-auto rounded-lg px-1.5 py-1.5 text-[11px] text-right font-semibold ' + (hasDye && dyeCost > 0 ? 'bg-gray-50 text-gray-600' : 'text-gray-300 text-center')}>
            {hasDye && dyeCost > 0 ? '₹' + Math.round(dyeCost).toLocaleString('en-IN') : '—'}
          </div>
        </td>
        {/* Emb Type */}
        <td className="px-1 py-1 text-center">
          <select value={row.embroidery_type || ''}
            onChange={function(e) { setFieldFn('embroidery_type', e.target.value) }}
            className="w-24 border border-gray-200 rounded-lg px-1 py-1.5 text-[11px] focus:ring-2 focus:ring-amber-400">
            <option value="">None</option>
            <option value="Hand Embroidery">Hand</option>
            <option value="Machine Embroidery">Machine</option>
          </select>
        </td>
        {/* Emb Cost */}
        <td className="px-1 py-1 text-center">
          <input type="number" value={row.embroidery || ''} step="any"
            disabled={!row.embroidery_type}
            onChange={function(e) { setFieldFn('embroidery', n(e.target.value)) }}
            className={'w-20 border border-gray-200 rounded-lg px-1.5 py-1.5 text-[11px] text-right focus:ring-2 focus:ring-amber-400 ' +
              (!row.embroidery_type ? 'bg-gray-100 opacity-50' : '')} />
        </td>
        {/* Stitch picker + cost (combined like ProductForm) */}
        <td className="px-1 py-1 text-center">
          <div className="flex items-center gap-1">
            <input type="number" value={row.stitching || ''} step="any"
              onChange={function(e) { setFieldFn('stitching', n(e.target.value)) }}
              className="w-16 border border-gray-200 rounded-lg px-1.5 py-1.5 text-[11px] text-right focus:ring-2 focus:ring-amber-400" />
            <select value="" onChange={function(e) { if (e.target.value) onStitchChg(e.target.value) }}
              className="w-12 border border-gray-200 rounded-lg px-0.5 py-1.5 text-[10px] text-gray-400 focus:ring-2 focus:ring-amber-400">
              <option value="">↑</option>
              {stitchingMaster.map(function(s) { return <option key={s.id} value={s.id}>{s.garmentType} ₹{s.cost}</option> })}
            </select>
          </div>
        </td>
        {/* Accessories */}
        <td className="px-1 py-1 text-center">
          <input type="number" value={row.accessories || ''} step="any"
            onChange={function(e) { setFieldFn('accessories', n(e.target.value)) }}
            className="w-20 border border-gray-200 rounded-lg px-1.5 py-1.5 text-[11px] text-right focus:ring-2 focus:ring-amber-400" />
        </td>
      </>
    )
  }

  // ── Headers ─────────────────────────────────────────────────────────────
  var headers = [
    'Set',
    'Fabric', 'Cost/m', 'Metres', 'Fab Cost',
    'Dye Type', 'Dye/m', 'Dye Cost',
    'Emb Type', 'Emb Cost',
    'Stitching',
    'Acc. ₹',
    'Total COGS', 'GM%', ''
  ]

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100" style={{background:'#faf9f5'}}>
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold" style={{color:'#1b1c1a'}}>Quick COGS Entry</h3>
          <span className="text-xs text-gray-400">{products.length} product{products.length !== 1 ? 's' : ''}</span>
        </div>
        {eligibleIds.length > 0 && (
          <button onClick={bulkSubmit}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors">
            Submit All Filled ({eligibleIds.length})
          </button>
        )}
      </div>

      {/* Scrollable table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{minWidth: 1400}}>
          <thead className="sticky top-0 z-10" style={{background:'#f5f4f0'}}>
            <tr style={{borderBottom:'1px solid rgba(27,28,26,0.08)'}}>
              <th className="sticky left-0 z-20 px-2 py-2 text-left" style={{background:'#f5f4f0',width:220,minWidth:220,boxShadow:'4px 0 6px -2px rgba(0,0,0,0.1)'}}>
                <span style={thStyle}>Product</span>
              </th>
              {headers.map(function(h, i) {
                return <th key={i} className="px-1 py-2 text-center whitespace-nowrap" style={thStyle}>{h}</th>
              })}
            </tr>
          </thead>
          <tbody>
            {[].concat.apply([], paged.map(function(p, idx) {
              var row = getRow(p.id)
              var rs = p.cogs_review_status || 'pending_entry'
              var isRejected = rs === 'rejected'
              var isSet = isProductSet(p)
              var sc = getProductPieces(p.id, p)
              var expanded = expandedSets[p.id]
              var totalCogs = isSet ? getSetTotalCogs(p.id, p) : getRowCogs(row)
              var sp = n(p.sellingPrice || p.selling_price || p.mrp)
              var gm = gmPct(sp, totalCogs, p.mrp)
              var images = getProductImages(p)
              var styleCode = p.styleCode || p.shopify_style_code || ''
              var title = p.productTitle || p.productName || p.product_title || ''
              var bgColor = idx % 2 === 0 ? '#fff' : '#fafaf8'
              var rows = []

              // ── Parent row ──
              rows.push(
                <tr key={p.id} data-product-id={p.id}
                  onBlur={function() { handleRowBlur(p.id, p) }}
                  className={(isRejected ? 'border-l-4 border-red-400 ' : '') + 'hover:bg-amber-50/30 transition-colors'}
                  style={{borderBottom:'1px solid rgba(27,28,26,0.04)', background: bgColor}}>

                  {/* Product identity */}
                  <td className="sticky left-0 z-10 px-2 py-1.5"
                    style={{ background: bgColor, width: 220, minWidth: 220, boxShadow: '4px 0 6px -2px rgba(0,0,0,0.1)' }}>
                    <div className="flex items-center gap-2">
                      {isSet && (
                        <button onClick={function() { toggleExpand(p.id) }}
                          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500 text-xs">
                          {expanded ? '▼' : '▶'}
                        </button>
                      )}
                      <div className="flex-shrink-0 cursor-pointer" onClick={function() { if (images.length > 0) setLightboxProduct(p) }}>
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover border" style={{borderColor:'#e5e2da'}} onError={function(e) { e.target.style.display='none' }} />
                        ) : (
                          <div className="w-10 h-10 rounded flex items-center justify-center" style={{background:'#f5f4f0'}}>
                            <span style={{fontSize:14,color:'#c8c7c3'}}>📷</span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span style={{fontFamily:'Inter,sans-serif',fontSize:9,fontWeight:600,letterSpacing:'0.06em',color:'#795900',textTransform:'uppercase'}}>{styleCode}</span>
                          {isSet && <span className="px-1 py-0 rounded text-[8px] font-bold bg-blue-50 text-blue-600">SET ({sc.length})</span>}
                        </div>
                        <div style={{fontFamily:'Manrope,sans-serif',fontWeight:700,fontSize:11,color:'#1b1c1a',lineHeight:1.2}} className="truncate" title={title}>{title || '—'}</div>
                        <span className="px-1 py-0 rounded text-[9px] font-medium" style={{background:'#f5f1e6',color:'#795900'}}>{p.category}</span>
                        {isRejected && p.cogs_rejection_note && (
                          <div className="mt-0.5 px-1.5 py-0.5 rounded text-[9px] bg-red-50 border-l-2 border-red-500 text-red-700 leading-tight truncate" title={p.cogs_rejection_note}>{p.cogs_rejection_note}</div>
                        )}
                      </div>
                    </div>
                    {row.dirty && (
                      <div className="flex items-center gap-1 mt-0.5 ml-7">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                        <span className="text-[8px] text-amber-600">Unsaved</span>
                        <button onClick={function(e) { e.stopPropagation(); saveRow(p.id, p) }}
                          className="text-[8px] text-amber-700 font-bold underline ml-1">{row.saving ? '...' : 'Save'}</button>
                      </div>
                    )}
                  </td>

                  {/* Set toggle — first data column */}
                  <td className="px-1 py-1.5 text-center">
                    <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                      <input type="checkbox" checked={isSet}
                        onChange={function(e) { toggleSet(p.id, p, e.target.checked) }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400 accent-blue-600" />
                    </label>
                  </td>

                  {/* Cost cells — singles get inline editing, sets get "expand" prompt */}
                  {isSet ? (
                    <td colSpan={11} className="px-2 py-1.5 text-center text-[10px] text-gray-400 italic">
                      {expanded ? 'Fill costs for each piece below' : 'Click ▶ to expand and fill piece-level costs'}
                    </td>
                  ) : (
                    renderCostCells(p.id, row, function(field, val) { setField(p.id, field, val) }, {
                      onFabricChange: function(fabId) { onFabricChange(p.id, fabId, p) },
                      onDyeChange: function(dyeId) { onDyeChange(p.id, dyeId) },
                      onStitchingChange: function(stId) { onStitchingChange(p.id, stId) },
                      product: p,
                    })
                  )}

                  {/* Total COGS */}
                  <td className="px-1 py-1.5 text-center">
                    <div className={'w-24 mx-auto rounded px-1.5 py-1 text-right font-bold text-sm ' +
                      (totalCogs > 0 ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-400')}>
                      {totalCogs > 0 ? '₹' + Math.round(totalCogs).toLocaleString('en-IN') : '—'}
                    </div>
                  </td>
                  {/* GM% */}
                  <td className="px-1 py-1.5 text-center">
                    <span className={'text-xs font-bold ' + (gm >= 0.5 ? 'text-green-600' : gm >= 0.3 ? 'text-amber-600' : 'text-red-600')}>
                      {totalCogs > 0 && sp > 0 ? (gm * 100).toFixed(1) + '%' : '—'}
                    </span>
                  </td>
                  {/* Action */}
                  <td className="px-1 py-1.5 text-center">
                    <button onClick={function() { submitRow(p.id, p) }}
                      disabled={totalCogs <= 0 || row.submitting}
                      className={'px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap ' +
                        (totalCogs > 0 ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-gray-200 text-gray-400 cursor-not-allowed')}>
                      {row.submitting ? '...' : 'Submit ➜'}
                    </button>
                  </td>
                </tr>
              )

              // ── Set piece sub-rows ──
              if (isSet && expanded && sc.length > 0) {
                sc.forEach(function(piece, pi) {
                  var pr = getPieceRow(p.id, piece.id)
                  var pieceData = pr.costPerMetre !== undefined ? pr : initPieceRow(piece)
                  var pieceCogs = getPieceCogs(pieceData)

                  rows.push(
                    <tr key={p.id + '-' + piece.id} data-product-id={p.id}
                      className="hover:bg-blue-50/30"
                      style={{borderBottom:'1px solid rgba(27,28,26,0.03)', background: '#f8faff'}}>
                      <td className="sticky left-0 z-10 px-2 py-1"
                        style={{ background: '#f8faff', width: 220, minWidth: 220, boxShadow: '4px 0 6px -2px rgba(0,0,0,0.1)' }}>
                        <div className="flex items-center gap-2 ml-7">
                          <span className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">{pi + 1}</span>
                          <div className="min-w-0 flex-1">
                            <input type="text" value={pieceData.name || piece.name || ''} placeholder={'Piece ' + (pi + 1)}
                              onChange={function(e) { setPieceField(p.id, piece.id, 'name', e.target.value) }}
                              className="text-xs font-semibold text-gray-700 bg-transparent border-none outline-none w-full" />
                            {(piece.category || pieceData.category) && <span className="text-[8px] text-gray-400">({piece.category || pieceData.category})</span>}
                          </div>
                          {sc.length > 1 && (
                            <button onClick={function() { removePiece(p.id, piece.id) }}
                              className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-red-100 text-gray-400 hover:text-red-500 text-[10px]"
                              title="Remove piece">×</button>
                          )}
                        </div>
                      </td>
                      {/* Empty Set column for piece row */}
                      <td></td>
                      {renderCostCells(piece.id, pieceData,
                        function(field, val) { setPieceField(p.id, piece.id, field, val) },
                        {
                          onFabricChange: function(fabId) { onPieceFabricChange(p.id, piece.id, fabId, piece.category || p.category) },
                          onDyeChange: function(dyeId) { onPieceDyeChange(p.id, piece.id, dyeId) },
                          onStitchingChange: function(stId) { onPieceStitchingChange(p.id, piece.id, stId) },
                          product: null,
                        }
                      )}
                      <td className="px-1 py-1 text-center">
                        <div className="w-24 mx-auto rounded px-1.5 py-1 text-right text-[11px] font-semibold bg-blue-50 text-blue-700">
                          {pieceCogs > 0 ? '₹' + Math.round(pieceCogs).toLocaleString('en-IN') : '—'}
                        </div>
                      </td>
                      <td></td><td></td>
                    </tr>
                  )
                })
                // ── Add Piece button row ──
                rows.push(
                  <tr key={p.id + '-add-piece'} style={{background: '#f8faff', borderBottom: '1px solid rgba(27,28,26,0.06)'}}>
                    <td className="sticky left-0 z-10 px-2 py-1" style={{ background: '#f8faff', width: 220, minWidth: 220, boxShadow: '4px 0 6px -2px rgba(0,0,0,0.1)' }}>
                      <div className="ml-7">
                        <button onClick={function() { addPiece(p.id) }}
                          className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:underline">
                          + Add Piece
                        </button>
                      </div>
                    </td>
                    <td colSpan={headers.length} />
                  </tr>
                )
              }
              return rows
            }))}
          </tbody>
        </table>
        {products.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">No pending products to fill</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 text-sm text-gray-500">
          <div className="text-xs">
            Showing {Math.min((page - 1) * PAGE_SIZE + 1, products.length)}–{Math.min(page * PAGE_SIZE, products.length)} of {products.length}
          </div>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={function() { setPage(function(p) { return p - 1 }) }}
              className="px-3 py-1 rounded-lg border border-gray-200 disabled:opacity-40 text-sm">←</button>
            <span className="px-2 py-1 text-sm">{page}/{totalPages}</span>
            <button disabled={page >= totalPages} onClick={function() { setPage(function(p) { return p + 1 }) }}
              className="px-3 py-1 rounded-lg border border-gray-200 disabled:opacity-40 text-sm">→</button>
          </div>
        </div>
      )}

      {lightboxProduct && (
        <ImageLightbox images={getProductImages(lightboxProduct)} onClose={function() { setLightboxProduct(null) }} />
      )}
    </div>
  )
}

export default QuickEntry

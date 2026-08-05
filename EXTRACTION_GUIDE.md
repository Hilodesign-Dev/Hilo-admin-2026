# Component Extraction Guide

This project is being extracted from a monolith HTML/React file (`main_script.js`) into a proper Vite + React project structure.

## Project Structure

```
hiloplatform/
├── index.html              (entry point)
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── src/
│   ├── main.jsx            (entry point)
│   ├── index.css           (tailwind + custom CSS)
│   ├── lib/
│   │   ├── supabase.js     (Supabase client)
│   │   ├── storage.js      (load, save, syncFromSupabase)
│   │   ├── logger.js       (_logError, _logChange)
│   │   ├── helpers.js      (fmt, gst, n, calcCogs, etc.)
│   │   └── constants.js    (all constants & defaults)
│   ├── components/         (shared/reusable components)
│   │   ├── ErrorBoundary.jsx
│   │   ├── Icon.jsx        (Icon component with SVG icons)
│   │   ├── Modal.jsx       (Modal wrapper)
│   │   ├── Toaster.jsx     (Save notification system)
│   │   ├── MasterTable.jsx (Generic data table)
│   │   ├── ProfilePopover.jsx
│   │   ├── MobileHeader.jsx
│   │   ├── BottomNav.jsx
│   │   ├── Sidebar.jsx
│   │   └── LoginScreen.jsx
│   └── pages/
│       ├── App.jsx         (main app with routing)
│       ├── Dashboard.jsx
│       ├── catalogue/
│       │   ├── Catalogue.jsx
│       │   ├── ProductForm.jsx (with sub-components)
│       │   ├── ProductView.jsx
│       │   └── ShopifySyncModal.jsx
│       ├── offers/
│       │   ├── Offers.jsx
│       │   ├── OfferModal.jsx
│       │   └── Row.jsx
│       ├── fabrics/
│       │   ├── FabricManagement.jsx
│       │   ├── FabricVendorsTab.jsx
│       │   ├── FabricMasterTab.jsx
│       │   ├── PurchaseOrdersTab.jsx
│       │   ├── FabricInventoryTab.jsx
│       │   └── FabricQRModal.jsx
│       ├── customers/
│       │   └── CustomersTab.jsx
│       ├── collections/
│       │   └── CollectionsTab.jsx
│       ├── growth/
│       │   └── GrowthView.jsx
│       ├── masters/
│       │   ├── Masters.jsx
│       │   ├── CategoryMaster.jsx
│       │   ├── VendorMaster.jsx
│       │   ├── FabricMaster.jsx
│       │   ├── FabricVendorTable.jsx
│       │   ├── OutsourceVendorTable.jsx
│       │   ├── ConsumptionMaster.jsx
│       │   ├── ChannelMaster.jsx
│       │   ├── EditChannelRow.jsx
│       │   ├── ColourMaster.jsx
│       │   ├── ErrorLogViewer.jsx
│       │   ├── BackupManager.jsx
│       │   └── ChangeLogViewer.jsx
│       └── users/
│           └── UsersTab.jsx
```

## Extraction Rules

### Critical: Preserve Global Scope Dependencies

All components in the monolith reference globals like:
- `supa` (Supabase client)
- `save`, `load`, `syncFromSupabase` (storage)
- `_logError`, `_logChange` (logging)
- `fmt`, `gst`, `n`, `calcCogs` etc. (helpers)
- `Icon`, `Modal`, `MasterTable` (components)

When extracting:
1. Import these from their respective lib files
2. DO NOT refactor or rename
3. Keep all logic exactly as-is
4. Only add imports/exports

### Component Template

```jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supa } from '../lib/supabase'
import { save, load } from '../lib/storage'
import { _logError, _logChange } from '../lib/logger'
import { fmt, n, calcCogs, etc. } from '../lib/helpers'
import { DEFAULT_CATEGORIES, etc. } from '../lib/constants'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'

const ComponentName = ({ prop1, prop2 }) => {
  // Keep all original code exactly as-is
  const [state, setState] = useState(...)

  useEffect(() => {
    // original logic
  }, [])

  return (
    // original JSX
  )
}

export default ComponentName
```

### Context For Product Form

The ProductForm component uses a React Context pattern (`_PFCtx`). Extract related helpers:
- `Field`, `Input`, `PFSelect` sub-components
- `emptyProduct`, `emptyPiece` factory functions
- `_guessCat`, `_deriveBaseCode`, `_stripSize`, `_findExisting` helpers
- Keep context imports/usage exactly as-is

### Supabase/Data Handling

The App component handles:
- Auth state via Supabase
- Data loading from localStorage (fallback to SEED_DATA)
- Data syncing from Supabase tables:
  - `fabrics` table (mapped via `mapSupaFabrics`)
  - `fabric_vendors` table (mapped via `mapSupaVendors`)
  - `team_members` table (for access control)
  - `app_state` table (for master data)

### Tab-Based Routing

The App component uses state-based routing with URL hashes:
```js
const [page, setPage] = useState(() => getHashPage() || 'calculator')

// Each page is kept-alive in DOM (display:none when inactive)
<div style={{display: page === 'dashboard' ? '' : 'none'}}>
  {mountedTabs.has('dashboard') && <Dashboard ... />}
</div>
```

Import nav functions:
- `getHashPage()` - read current page from URL hash
- `setHashPage(tab)` - set URL hash and update state
- `getHashSubTab(validTabs, fallback)` - for GrowthView subtabs
- `setHashSubTab(page, subTab)` - set subtab hash

## Extraction Order

1. ✅ **Core infrastructure** (done)
   - supabase.js
   - logger.js
   - storage.js
   - helpers.js
   - constants.js
   - main.jsx
   - ErrorBoundary.jsx

2. **Shared components** (in progress)
   - Icon.jsx
   - Modal.jsx
   - Toaster.jsx
   - MasterTable.jsx
   - LoginScreen.jsx
   - Sidebar.jsx
   - MobileHeader.jsx
   - BottomNav.jsx
   - ProfilePopover.jsx

3. **Page components** (next)
   - App.jsx (main routing)
   - Dashboard.jsx
   - Catalogue.jsx + ProductForm.jsx + ProductView.jsx + ShopifySyncModal.jsx
   - Offers.jsx + OfferModal.jsx + Row.jsx
   - FabricManagement.jsx + FabricVendorsTab.jsx + FabricMasterTab.jsx + PurchaseOrdersTab.jsx + FabricInventoryTab.jsx + FabricQRModal.jsx
   - Masters.jsx + all master tabs
   - GrowthView.jsx
   - CollectionsTab.jsx
   - CustomersTab.jsx
   - UsersTab.jsx

## Key Import Patterns

```js
// Supabase
import { supa } from '../lib/supabase'

// Storage
import { load, save, syncFromSupabase } from '../lib/storage'

// Logging
import { _logError, _logChange } from '../lib/logger'

// Helpers
import { fmt, gst, n, nextId, calcCogs, calcPieceCogs, effectiveSP, gmPct, statusColor, mapSupaFabrics, mapSupaVendors } from '../lib/helpers'

// Constants
import { ALL_TABS, DEFAULT_TABS, DEFAULT_CATEGORIES, DEFAULT_CHANNELS, OUTSOURCE_TYPES, CHANNEL_COLORS, CUSTOMER_TYPES, SOURCE_OPTIONS, VALID_PAGES, GROWTH_SUBTABS } from '../lib/constants'

// Components
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import Toaster from '../components/Toaster'
import MasterTable from '../components/MasterTable'
```

## Hash Navigation Functions

Extract from lines ~8824-8860 in main_script.js:

```js
const VALID_PAGES = ['calculator','catalogue','offers','dashboard','growth','masters','users']
const GROWTH_SUBTABS = ['orders','adspend','analytics','cogs-entry']

const getHashPage = () => {
  // ... extract from main_script.js lines ~8824-8827
}

const getHashSubTab = (validTabs, fallback) => {
  // ... extract from main_script.js lines ~8828-8833
}

const setHashPage = (tab) => {
  // ... extract from main_script.js lines ~8836-8848
}

const setHashSubTab = (page, subTab) => {
  // ... extract from main_script.js lines ~8849-8856
}

export { getHashPage, setHashPage, getHashSubTab, setHashSubTab }
```

## Helper Components in Catalogue

These are nested inside ProductForm and related components:
- `Field` - label wrapper (line ~643)
- `Input` - form input with field context (line ~646)
- `PFSelect` - select dropdown with field context (line ~658)

Keep them in the same file or separate as `catalogue/FormFields.jsx`.

## Testing

Before marking a component as done:
1. Verify all imports resolve
2. Check no global references are left unpacked
3. Confirm React hooks dependencies are correct
4. Test with npm run dev

## Known Issues to Address

1. **SEED_DATA** - The original code references SEED_DATA.products/fabrics/stitching/dyes which comes from data.js. This file is not included. For now, use empty arrays in App initialization.

2. **QRCode Library** - FabricQRModal uses the qrcodejs library loaded via CDN. This is already in index.html. Verify it works with Vite by testing in browser.

3. **Customer Measurements Schema** - CustomersTab uses complex measurement fields. Ensure all UPPER_BODY_FIELDS, LOWER_BODY_FIELDS, GENERAL_FIELDS are in constants.js.

4. **Fabric Family & Color in Fabric Tables** - FabricMasterTab references new Supabase columns (_fabric_family, _colour). Ensure mapSupaFabrics includes these in the output.

## Next Steps

1. Extract Icon.jsx with all SVG definitions
2. Extract Modal.jsx and Toaster.jsx
3. Extract MasterTable.jsx (used by many master components)
4. Extract App.jsx (the main entry point with all routing)
5. Extract page components in order of dependency
6. Run `npm install && npm run dev` to test
7. Fix any remaining import issues

Use the extraction guide in `main_script.js` for line numbers and exact component boundaries.

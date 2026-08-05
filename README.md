# Hilo Platform - Vite + React Refactor

This is Phase 1 of extracting a 11,700-line monolith React application into a modular Vite + React project.

## Goal

Split a single `main_script.js` file containing 48 React components into proper module structure with:
- Separate component files
- Shared lib modules (supabase, storage, logging, helpers, constants)
- Proper import/export statements
- Zero logic changes (code-for-code translation only)

## Current Status

### Completed
- [x] Vite + React build setup
- [x] Tailwind CSS configuration
- [x] Core lib modules:
  - `src/lib/supabase.js` - Supabase client initialization
  - `src/lib/storage.js` - localStorage + Supabase sync
  - `src/lib/logger.js` - Error and change logging
  - `src/lib/helpers.js` - Utility functions (fmt, gst, n, calcCogs, etc.)
  - `src/lib/constants.js` - All constants, defaults, and ENUM-like structures
- [x] Project structure and CSS
- [x] Main entry point (`src/main.jsx`)
- [x] ErrorBoundary component

### In Progress
- [ ] Shared components (Icon, Modal, Toaster, MasterTable, etc.)
- [ ] Page components (Dashboard, Catalogue, Offers, etc.)
- [ ] Navigation helpers (hash routing functions)
- [ ] All remaining 40+ components

### To Do
- [ ] Extract each component from main_script.js
- [ ] Wire up imports/exports
- [ ] Test all routing and data flow
- [ ] Deploy to Vercel

## Architecture

### Data Flow
```
Supabase ↔ localStorage ↔ React State
   ↑
   └─ sync on login, periodically update
   └─ master data cached in localStorage
   └─ app_state table for cross-device sync
```

### Page Routing
- Hash-based routing (`window.location.hash`)
- Tab-based state in App component
- Keep-alive mounting (unmount tab hides with `display:none`, preserving scroll/state)

### Authentication
- Supabase Auth (JWT)
- team_members table for access control
- Role-based tabs (admin sees all, others see defaults)

## Customer API / ecommerce plan

Implementation plan for the shopper-facing API (inspired by `hilo-design-backend copy`, connected to this ops system):

→ **[docs/README.md](./docs/README.md)**

## Installation

```bash
cd hiloplatform
npm install
```

## Development

```bash
npm run dev
```

Opens at http://localhost:5173

## Build

```bash
npm run build
```

Generates optimized bundle in `dist/`.

## File Layout

```
src/
├── main.jsx                    # Entry point (initializes React root)
├── index.css                   # Tailwind + custom styles
├── lib/
│   ├── supabase.js            # Supabase client & auth
│   ├── storage.js             # localStorage + Supabase sync
│   ├── logger.js              # Error & change logging
│   ├── helpers.js             # Utility functions
│   └── constants.js           # All enums, defaults, lists
├── components/                 # Shared, reusable components
│   ├── ErrorBoundary.jsx
│   ├── Icon.jsx               # SVG icon component
│   ├── Modal.jsx              # Modal wrapper
│   ├── Toaster.jsx            # Save notification system
│   ├── MasterTable.jsx        # Reusable data table
│   ├── LoginScreen.jsx        # Auth screen
│   ├── Sidebar.jsx            # Left sidebar nav
│   ├── MobileHeader.jsx       # Mobile header
│   ├── BottomNav.jsx          # Mobile bottom nav
│   └── ProfilePopover.jsx     # User profile menu
└── pages/
    ├── App.jsx                # Main app + routing
    ├── Dashboard.jsx
    ├── catalogue/
    ├── offers/
    ├── fabrics/
    ├── masters/
    ├── growth/
    ├── collections/
    ├── customers/
    └── users/
```

## Key Concepts

### Component Context
The ProductForm and related components use React Context for form state:
```jsx
const _PFCtx = React.createContext({ form: {}, set: () => {} })
```

### Toaster/Save Events
Save operations emit custom events:
```js
window.dispatchEvent(new CustomEvent('hl-save', { detail: { ok: true } }))
```

### Supabase Tables
- `error_logs` - stores errors for debugging
- `change_log` - audit trail of user actions
- `app_state` - persisted master data
- `fabrics` - new fabric catalog (source of truth)
- `fabric_vendors` - vendor list
- `team_members` - user access control

### Keep-Alive Tabs
Mounted tabs stay in DOM (hidden with `display:none`) to preserve:
- Scroll position
- Open modals/editors
- Loaded data
- Form state

Only visible tab renders.

## Extraction Checklist

See `EXTRACTION_GUIDE.md` for detailed extraction instructions.

Component count: ~48 components to extract
- 3 shared lib modules (done)
- 9 shared components (in progress)
- 36 page/feature components (to do)

## Known Limitations

1. **SEED_DATA** - Original code references a `data.js` file with initial product/fabric/dye data. This is not included. The App component initializes with empty arrays and loads from Supabase on login.

2. **QRCode Library** - FabricQRModal uses `qrcodejs` loaded via CDN. Ensure this script tag is in index.html.

3. **New Fabric Tables** - The refactor assumes new Supabase tables for fabrics (source of truth), not just localStorage. The mapping functions in helpers.js handle the conversion.

## Supabase Configuration

Credentials come from env (not hardcoded):

```bash
cp .env.example .env.local
# fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

See **DEV_SETUP.md** for creating a fresh test Supabase project and minimal bootstrap SQL.

Tables commonly required in a full environment:
- `error_logs`, `change_log`, `app_state`
- `fabrics`, `fabric_vendors`
- `team_members` (access control)
- plus commerce/ops tables used by each module

## Deployment

Deploy to Vercel:
```bash
vercel deploy
```

Or build and deploy to any static host:
```bash
npm run build
# Upload dist/ folder
```

## Notes for Phase 2

Future improvements (not in scope for Phase 1):
- [ ] Refactor to TypeScript
- [ ] Replace hash routing with React Router
- [ ] Extract complex page logic into custom hooks
- [ ] Add comprehensive tests
- [ ] Implement proper error handling and retries
- [ ] Add loading skeletons
- [ ] Optimize bundle size
- [ ] Add analytics

## Support

For component extraction, refer to:
- `EXTRACTION_GUIDE.md` - Detailed extraction instructions
- `main_script.js` - Original monolith with all code
- `head_section.html` - Original CSS and config

All components should maintain API compatibility with the original—no prop changes, same logic, same behavior.

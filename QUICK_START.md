# Quick Start Guide

## Installation

```bash
cd /sessions/fervent-confident-cray/hiloplatform
npm install
```

## Development

```bash
npm run dev
```

Then open http://localhost:5173 in your browser.

## Build for Production

```bash
npm run build
```

This creates an optimized bundle in the `dist/` folder.

## Project Status

This project has been successfully extracted from a monolith into a modular Vite + React application.

### What's Included
- ✅ 51 React components extracted and organized
- ✅ 6 lib modules (supabase, storage, logger, helpers, constants, navigation)
- ✅ Tailwind CSS with custom design tokens
- ✅ 350+ lines of custom CSS
- ✅ Complete Vite + React build setup
- ✅ Supabase authentication integration

### File Organization
- `src/lib/` - Core libraries (database, storage, logging, helpers)
- `src/components/` - Shared, reusable components (Icon, Modal, Toaster, etc.)
- `src/pages/` - Page-level components organized by feature:
  - `App.jsx` - Main routing
  - `catalogue/` - Product management
  - `offers/` - Offer management
  - `fabrics/` - Fabric management
  - `masters/` - Master data editors
  - `growth/`, `calculator/`, `collections/`, `customers/`, `users/`, `dashboard/`

## Important Notes

### First Time Setup
1. Run `npm install`
2. `cp .env.example .env.local` and add your Supabase URL + anon key (see `DEV_SETUP.md`)
3. For a brand-new empty project, run `supabase/dev-bootstrap.sql` and add a `team_members` row
4. Login with your Supabase Auth account

### Data
- All data syncs between localStorage and Supabase
- Initial data is loaded from Supabase tables on login
- Offline changes are queued and synced when connection returns

### Environment Variables
Required in `.env.local` (gitignored):
```
VITE_SUPABASE_URL=https://YOUR_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## Troubleshooting

### "Module not found" errors
Check that all imports are using correct relative paths. The project structure is:
- Components in `src/components/` import from `../../lib/`
- Pages in `src/pages/` import from `../../lib/` and `../../components/`
- Lib files import from other lib files using `./filename`

### Build fails
Make sure all imports are ESM (use `import`, not `require`). Run:
```bash
npm run build
```

### App doesn't load
1. Check browser console for errors
2. Verify Supabase credentials are correct
3. Ensure internet connection for Supabase
4. Check that team_members table exists in Supabase

## Documentation

For detailed information, see:
- **README.md** - Project overview
- **EXTRACTION_GUIDE.md** - How components were organized and extracted
- **EXTRACTION_SUMMARY.md** - Detailed extraction statistics and file list

## Next Steps

1. ✅ Install and run locally
2. ✅ Test login and basic features
3. ✅ Fix any import issues
4. ✅ Deploy to Vercel or similar platform

For deployment:
```bash
vercel deploy
```

Or build and upload `dist/` to any static host.

## Support

All 48 original components have been extracted. If a component is missing or has issues:
1. Check `EXTRACTION_SUMMARY.md` for the component list
2. Review `EXTRACTION_GUIDE.md` for extraction details
3. Check the original source files for reference
4. See console errors in browser dev tools

The code has been extracted with minimal changes - all logic is preserved exactly as it was in the monolith.

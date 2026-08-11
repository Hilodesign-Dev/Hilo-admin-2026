# Hilo Admin (`Hilo-admin-2026`)

Staff operations dashboard (Vite + React). Talks **only** to Supabase Auth + PostgREST.

Shopper / Flutter HTTP API lives in the sibling repo: **[Hilo-backend-2026](https://github.com/Hilodesign-Dev/Hilo-backend-2026)**.

## Local setup

```bash
cp .env.example .env.local
# Fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Open http://localhost:5173

Optional admin seed (needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`):

```bash
npm run seed:admin
# defaults: dev@hilo.local / HiloDev123!
```

Fresh empty Supabase: run `supabase/dev-bootstrap.sql` then seed (see `DEV_SETUP.md`).

## Deploy (dev)

- Host: **Vercel** → `admindev.hilodesign.co`
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (never put service role in browser env)
- Push to `dev` triggers Vercel production/preview for that project

## Related

| System | Repo | URL (dev) |
|--------|------|-----------|
| Admin UI | this repo | https://admindev.hilodesign.co |
| Customer API | Hilo-backend-2026 | https://backenddev.hilodesign.co/api/v1 |

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

1. [Vercel](https://vercel.com) → **Add Project** → import `Hilodesign-Dev/Hilo-admin-2026`
2. Framework: Vite · Build `npm run build` · Output `dist` · Production branch: `main`
3. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (never put service role in browser env)
4. Domains → add `admindev.hilodesign.co`
5. In **BigRock DNS** for `hilodesign.co`, create CNAME `admindev` → `cname.vercel-dns.com` (or the target Vercel shows)

After that, every push to `main` redeploys the admin UI.

## Related

| System | Repo | URL (dev) |
|--------|------|-----------|
| Admin UI | this repo | https://admindev.hilodesign.co |
| Customer API | Hilo-backend-2026 | https://backenddev.hilodesign.co/api/v1 |

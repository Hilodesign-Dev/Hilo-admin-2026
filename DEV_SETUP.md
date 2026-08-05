# Dev environment — fresh test Supabase

This app is a **frontend**. The database lives in Supabase. There are **no full schema migrations** in this repo, so a brand-new empty project will **not** have production tables, RPCs, or Shopify edge functions until you add them.

## What we standardized

| Item | Location |
|------|----------|
| Env vars (not hardcoded) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `.env.local` |
| Client | `src/lib/supabase.js` |
| Example env | `.env.example` |
| Minimal login DB | `supabase/dev-bootstrap.sql` |

## A. Create a test Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Name it e.g. `hiloplatform-dev`
3. **Settings → API** → copy:
   - Project URL
   - `anon` `public` key  
   (Keep `service_role` private — never put it in the frontend.)

## B. Wire env locally

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Restart Vite after changing env (`Ctrl+C`, then `npm run dev`).

## C. Bootstrap minimal DB + test login

1. Supabase → **Authentication → Users → Add user**  
   - Email / password of your choice  
   - Enable **Auto Confirm**
2. Copy that user’s **UUID**
3. **SQL Editor** → run `supabase/dev-bootstrap.sql`
4. Uncomment the `INSERT` at the bottom of that file, paste the UUID + email, run it
5. `npm run dev` → open http://localhost:5173 → sign in

You should get past the login gate as **admin**. Most feature tabs will be empty or error until the full schema exists — that is expected.

## D. “Keep all functions” / full DB

App screens expect **dozens of tables**, **Postgres RPCs**, **Storage buckets**, and **Edge Functions** (`sync-orders`, `sync-catalogue`, `create-user`, etc.). Those are **not** in this git repo.

Options:

1. **Stay on production Supabase** for real data (put prod URL/key only in a private `.env.local` you never commit), or  
2. **Clone / dump** the existing project (Dashboard backup, or `pg_dump` / Supabase CLI) into the test project, then point `.env.local` at the clone, or  
3. **Grow the test DB** table-by-table as you develop (start from `dev-bootstrap.sql`).

Shopify secrets belong in the **test project’s Edge Function secrets**, not in `.env.local` for the Vite app.

## E. Auth tip for local testing

In the test project: **Authentication → Providers → Email**  
- Disable “Confirm email” if you want instant login without inbox.

## Checklist

- [x] New Supabase project created  
- [x] `.env.local` filled (not committed)  
- [x] `dev-bootstrap.sql` applied  
- [x] Auth user + `team_members` row  
- [x] `npm run dev` logs in  
- [ ] (Optional later) schema dump / edge functions / Shopify secrets on the test project  

// Shared pieces for the sync-* Edge Functions: caller check, one-run-at-a-time lock,
// honest sync_runs records, and paginated Shopify Admin REST calls.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

export type SyncType = "catalogue" | "orders" | "customers"
export type Row = Record<string, unknown>

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// ── CORS ───────────────────────────────────────────────────────────────────────
// SYNC_ALLOWED_ORIGINS="https://admin.example.com,http://localhost:5173" limits browsers
// to the admin app. Unset keeps "*" (the caller check below still applies).
const allowedOrigins = (Deno.env.get("SYNC_ALLOWED_ORIGINS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || ""
  const allow = allowedOrigins.length === 0
    ? "*"
    : allowedOrigins.includes(origin) ? origin : allowedOrigins[0]
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
    "Vary": "Origin",
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  })
}

export function errorResponse(req: Request, err: unknown): Response {
  if (err instanceof HttpError) return json(req, { error: err.message }, err.status)
  console.error(err)
  return json(req, { error: "Sync failed. Check the function logs." }, 500)
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) throw new HttpError(500, "Supabase is not configured for this function")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// ── Caller check ───────────────────────────────────────────────────────────────
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}

/**
 * Allow an active team member (signed-in staff JWT) or a server caller presenting
 * SYNC_SECRET (min 32 chars) in X-Sync-Secret, e.g. a cron job.
 * The public anon key is not a user, so it is rejected.
 */
export async function requireStaff(req: Request, supabase: SupabaseClient): Promise<string> {
  const secret = Deno.env.get("SYNC_SECRET") || ""
  const given = req.headers.get("x-sync-secret") || ""
  if (secret.length >= 32 && given && timingSafeEqual(given, secret)) return "sync-secret"

  const auth = req.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!token) throw new HttpError(401, "Sign in required")
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, "Sign in required")
  const user = data.user

  let member: Row | null = null
  const byId = await supabase.from("team_members").select("*").eq("user_id", user.id).maybeSingle()
  if (byId.error) throw new HttpError(500, "Could not check staff access")
  member = byId.data as Row | null
  // Fall back to email only once Supabase has verified it.
  if (!member && user.email && user.email_confirmed_at) {
    const byEmail = await supabase
      .from("team_members")
      .select("*")
      .ilike("email", user.email)
      .limit(1)
      .maybeSingle()
    if (byEmail.error) throw new HttpError(500, "Could not check staff access")
    member = byEmail.data as Row | null
  }
  if (!member || member.is_active === false) throw new HttpError(403, "Staff access required")
  return user.email || user.id
}

// ── Run lock + honest run log ──────────────────────────────────────────────────
const STALE_MS = 15 * 60 * 1000

/**
 * Insert a 'started' row. The unique index sync_runs_one_running_per_type
 * (sql: supabase/sync-integrity.sql) makes a second concurrent run fail here.
 * Returns null when another run of this type is in progress.
 */
export async function startRun(
  supabase: SupabaseClient,
  type: SyncType,
  startedBy: string,
): Promise<string | null> {
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString()
  await supabase
    .from("sync_runs")
    .update({ status: "failed", finished_at: new Date().toISOString(), error: "stale run: no finish within 15 min" })
    .eq("sync_type", type)
    .eq("status", "started")
    .lt("started_at", staleBefore)

  const { data, error } = await supabase
    .from("sync_runs")
    .insert({ sync_type: type, status: "started", source: "edge", meta: { started_by: startedBy } })
    .select("id")
    .single()
  if (error) {
    if (error.code === "23505") return null
    throw new HttpError(500, `Could not start sync run: ${error.message}`)
  }
  return String((data as Row).id)
}

export async function finishRun(
  supabase: SupabaseClient,
  runId: string,
  result: {
    status: "success" | "partial" | "failed"
    upserted: number
    failed: number
    message?: string
    error?: string
    meta?: Row
  },
): Promise<void> {
  const { error } = await supabase
    .from("sync_runs")
    .update({
      status: result.status,
      finished_at: new Date().toISOString(),
      records_upserted: result.upserted,
      records_failed: result.failed,
      message: result.message ?? null,
      error: result.error ?? null,
      ...(result.meta ? { meta: result.meta } : {}),
    })
    .eq("id", runId)
  if (error) console.error("finishRun:", error.message)
}

// ── Shopify Admin REST ─────────────────────────────────────────────────────────
export function shopifyConfig(): { base: string; token: string } {
  const shop = (Deno.env.get("SHOPIFY_SHOP_NAME") || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "")
  const token = Deno.env.get("SHOPIFY_ADMIN_API_ACCESS_TOKEN") || ""
  // Shopify answers retired versions with the oldest supported one; pin a current one here.
  const version = Deno.env.get("SHOPIFY_API_VERSION") || "2025-07"
  if (!shop || !token) throw new HttpError(500, "Shopify is not configured for this function")
  return { base: `https://${shop}/admin/api/${version}`, token }
}

function nextLink(header: string | null): string | null {
  if (!header) return null
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/)
    if (m) return m[1]
  }
  return null
}

/** GET one Shopify page; retries 429 / 5xx; returns the cursor URL of the next page. */
export async function shopifyGet(
  url: string,
  token: string,
): Promise<{ body: Row; next: string | null }> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, "Accept": "application/json" },
    })
    if ((res.status === 429 || res.status >= 500) && attempt <= 5) {
      const wait = Number(res.headers.get("retry-after") || 1) * 1000 * attempt
      await res.body?.cancel()
      await new Promise((r) => setTimeout(r, wait))
      continue
    }
    if (!res.ok) {
      console.error(`Shopify ${res.status}:`, await res.text())
      throw new HttpError(502, `Shopify request failed (HTTP ${res.status})`)
    }
    return { body: (await res.json()) as Row, next: nextLink(res.headers.get("link")) }
  }
}

/** Accept only a real ISO-ish timestamp from the request body. */
export function parseSince(raw: unknown, fallback: Date): string {
  if (typeof raw === "string" && raw.length <= 40) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return fallback.toISOString()
}

export function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

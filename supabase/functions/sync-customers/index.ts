// Shopify customers → customers, one page (250) per call, keyed on shopify_customer_id.
// Callers loop with body.since = last_updated_at while has_more is true.
// body.full_sync = true starts from the beginning instead of the last 90 days.
// Requires supabase/sync-integrity.sql.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"
import {
  adminClient,
  chunks,
  errorResponse,
  finishRun,
  json,
  parseSince,
  requireStaff,
  type Row,
  shopifyConfig,
  shopifyGet,
  startRun,
} from "../_shared/sync.ts"

const PAGE = 250

type ShopifyCustomer = {
  id: number
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  updated_at: string
}

/**
 * Rows from the old sync have no shopify_customer_id. Attach it by email, or by phone
 * when there is no email, so the upsert updates them instead of adding a copy.
 * Returns the Shopify ids that were adopted.
 */
async function adoptLegacyRows(supabase: SupabaseClient, customers: ShopifyCustomer[]): Promise<Set<string>> {
  const adopted = new Set<string>()
  const emails = [...new Set(customers.map((c) => c.email).filter((e): e is string => !!e))]
  const phones = [...new Set(customers.filter((c) => !c.email && c.phone).map((c) => c.phone as string))]

  const legacy: Row[] = []
  for (const [col, values] of [["email", emails], ["phone", phones]] as const) {
    for (const batch of chunks(values, 100)) {
      const { data, error } = await supabase
        .from("customers")
        .select("id, email, phone")
        .is("shopify_customer_id", null)
        .in(col, batch)
      if (error) throw new Error(`customers read: ${error.message}`)
      legacy.push(...((data || []) as Row[]))
    }
  }
  if (!legacy.length) return adopted

  const usedRows = new Set<string>()
  for (const c of customers) {
    const match = legacy.find((r) =>
      !usedRows.has(String(r.id)) &&
      (c.email ? r.email === c.email : !!c.phone && r.phone === c.phone)
    )
    if (!match) continue
    usedRows.add(String(match.id))
    const { error } = await supabase
      .from("customers")
      .update({ shopify_customer_id: String(c.id) })
      .eq("id", match.id)
    if (error) console.warn("adopt legacy customer:", error.message)
    else adopted.add(String(c.id))
  }
  return adopted
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, "ok")

  let supabase: SupabaseClient | null = null
  let runId: string | null = null
  try {
    supabase = adminClient()
    const caller = await requireStaff(req, supabase)
    const body = (await req.json().catch(() => ({}))) as Row
    const fallback = body.full_sync === true
      ? new Date("2015-01-01T00:00:00Z")
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const since = parseSince(body.since, fallback)

    runId = await startRun(supabase, "customers", caller)
    if (!runId) {
      const msg = "A customer sync is already running"
      return json(req, { success: false, skipped: true, message: msg, error: msg })
    }

    const { base, token } = shopifyConfig()
    const params = new URLSearchParams({
      updated_at_min: since,
      order: "updated_at asc",
      limit: String(PAGE),
    })
    const page = await shopifyGet(`${base}/customers.json?${params}`, token)
    const customers = (page.body.customers as ShopifyCustomer[]) || []

    let created = 0
    let updated = 0
    let failed = 0
    const errors: string[] = []

    if (customers.length) {
      const ids = customers.map((c) => String(c.id))
      const existing = new Set<string>()
      for (const batch of chunks(ids, 100)) {
        const { data, error } = await supabase
          .from("customers")
          .select("shopify_customer_id")
          .in("shopify_customer_id", batch)
        if (error) throw new Error(`customers read: ${error.message}`)
        for (const r of (data || []) as Row[]) existing.add(String(r.shopify_customer_id))
      }
      const adopted = await adoptLegacyRows(supabase, customers)

      for (const batch of chunks(customers, 100)) {
        const { error } = await supabase.from("customers").upsert(
          batch.map((c) => ({
            shopify_customer_id: String(c.id),
            name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || "No Name",
            email: c.email || null,
            phone: c.phone || null,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "shopify_customer_id" },
        )
        if (error) {
          failed += batch.length
          if (errors.length < 3) errors.push(error.message)
          continue
        }
        for (const c of batch) {
          const id = String(c.id)
          if (existing.has(id) || adopted.has(id)) updated++
          else created++
        }
      }
    }

    const hasMore = customers.length === PAGE
    const lastUpdatedAt = customers.length ? customers[customers.length - 1].updated_at : null
    const status = failed === 0 ? "success" : created + updated > 0 ? "partial" : "failed"
    await finishRun(supabase, runId, {
      status,
      upserted: created + updated,
      failed,
      message: `${created} new, ${updated} updated since ${since}`,
      error: errors.join(" | ") || undefined,
      meta: { since, has_more: hasMore },
    })
    runId = null

    return json(req, {
      success: status !== "failed",
      status,
      created,
      updated,
      failed,
      total_fetched: customers.length,
      has_more: hasMore,
      last_updated_at: lastUpdatedAt,
      // This function does not link order line items to customers.
      line_items_linked_by_email: 0,
      line_items_linked_by_name: 0,
      synced_customers: created + updated,
      ...(errors.length ? { errors } : {}),
      ...(status === "failed" ? { error: errors[0] || "Sync failed" } : {}),
    })
  } catch (err) {
    if (supabase && runId) {
      await finishRun(supabase, runId, {
        status: "failed",
        upserted: 0,
        failed: 0,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return errorResponse(req, err)
  }
})

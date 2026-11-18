// Shopify orders → shopify_orders + order_line_items, one page (250) per call.
// Callers loop with body.since = last_created_at while has_more is true.
// Upserts on Shopify ids, so re-running never duplicates orders or line items.
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

type ShopifyLineItem = {
  id: number
  title: string
  sku: string | null
  quantity: number
  price: string
  variant_title?: string | null
}
type ShopifyOrder = {
  id: number
  name?: string
  order_number?: number
  email?: string | null
  created_at: string
  customer?: { first_name?: string | null; last_name?: string | null; email?: string | null } | null
  line_items?: ShopifyLineItem[]
}

function orderNumber(o: ShopifyOrder): string {
  return String(o.name || o.order_number)
}

/** Rows written by the old sync have no shopify_order_id; attach it so the upsert updates them. */
async function adoptLegacyRows(supabase: SupabaseClient, orders: ShopifyOrder[]) {
  const byNumber = new Map(orders.map((o) => [orderNumber(o), String(o.id)]))
  const { data, error } = await supabase
    .from("shopify_orders")
    .select("id, order_number")
    .is("shopify_order_id", null)
    .in("order_number", [...byNumber.keys()])
  if (error) throw new Error(`shopify_orders read: ${error.message}`)
  const claimed = new Set<string>()
  for (const r of (data || []) as Row[]) {
    const num = String(r.order_number)
    if (claimed.has(num)) continue // extra legacy duplicates stay as they are
    claimed.add(num)
    const { error: upErr } = await supabase
      .from("shopify_orders")
      .update({ shopify_order_id: byNumber.get(num) })
      .eq("id", r.id)
    if (upErr) console.warn("adopt legacy order:", upErr.message)
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, "ok")

  let supabase: SupabaseClient | null = null
  let runId: string | null = null
  try {
    supabase = adminClient()
    const caller = await requireStaff(req, supabase)
    const body = (await req.json().catch(() => ({}))) as Row
    const since = parseSince(body.since, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

    runId = await startRun(supabase, "orders", caller)
    if (!runId) return json(req, { success: false, skipped: true, message: "An order sync is already running", error: "An order sync is already running" })

    const { base, token } = shopifyConfig()
    const params = new URLSearchParams({
      status: "any",
      created_at_min: since,
      order: "created_at asc",
      limit: String(PAGE),
    })
    const page = await shopifyGet(`${base}/orders.json?${params}`, token)
    const orders = (page.body.orders as ShopifyOrder[]) || []

    let upsertedOrders = 0
    let upsertedLines = 0
    let failed = 0
    const errors: string[] = []

    if (orders.length) {
      await adoptLegacyRows(supabase, orders)

      const idByShopifyId = new Map<string, string>()
      for (const batch of chunks(orders, 100)) {
        const { data, error } = await supabase
          .from("shopify_orders")
          .upsert(
            batch.map((o) => ({
              shopify_order_id: String(o.id),
              order_number: orderNumber(o),
              customer_name: o.customer
                ? `${o.customer.first_name || ""} ${o.customer.last_name || ""}`.trim() || "Guest"
                : "Guest",
              customer_email: o.email || o.customer?.email || null,
              created_at: o.created_at,
            })),
            { onConflict: "shopify_order_id" },
          )
          .select("id, shopify_order_id")
        if (error) {
          failed += batch.length
          if (errors.length < 3) errors.push(error.message)
          continue
        }
        upsertedOrders += batch.length
        for (const r of (data || []) as Row[]) idByShopifyId.set(String(r.shopify_order_id), String(r.id))
      }

      // Only Shopify-owned fields; staff fields (production stage etc.) are never overwritten.
      const lines: Row[] = []
      for (const o of orders) {
        const orderId = idByShopifyId.get(String(o.id))
        if (!orderId) continue
        for (const li of o.line_items || []) {
          const unit = parseFloat(li.price) || 0
          lines.push({
            shopify_line_item_id: String(li.id),
            order_id: orderId,
            order_number: orderNumber(o),
            title: li.title,
            sku: li.sku || null,
            quantity: li.quantity,
            unit_price: unit,
            sale_price: Math.round(unit * li.quantity * 100) / 100,
            size: li.variant_title || null,
            updated_at: new Date().toISOString(),
          })
        }
      }
      for (const batch of chunks(lines, 200)) {
        const { error } = await supabase
          .from("order_line_items")
          .upsert(batch, { onConflict: "shopify_line_item_id" })
        if (error) {
          failed += batch.length
          if (errors.length < 3) errors.push(`line items: ${error.message}`)
        } else {
          upsertedLines += batch.length
        }
      }
    }

    const hasMore = orders.length === PAGE
    const lastCreatedAt = orders.length ? orders[orders.length - 1].created_at : null
    const status = failed === 0 ? "success" : upsertedOrders > 0 ? "partial" : "failed"
    await finishRun(supabase, runId, {
      status,
      upserted: upsertedOrders,
      failed,
      message: `${upsertedOrders} orders, ${upsertedLines} line items since ${since}`,
      error: errors.join(" | ") || undefined,
      meta: { since, has_more: hasMore, line_items: upsertedLines },
    })
    runId = null

    return json(req, {
      success: status !== "failed",
      status,
      synced_orders: upsertedOrders,
      synced_line_items: upsertedLines,
      failed,
      has_more: hasMore,
      last_created_at: lastCreatedAt,
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

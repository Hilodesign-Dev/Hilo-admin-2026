// Shopify products → catalogue_products.
// Staff-only, one run at a time, every page fetched, upserted on shopify_product_id,
// and products that disappeared from Shopify are soft-deleted.
// Requires supabase/sync-integrity.sql.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"
import {
  adminClient,
  chunks,
  errorResponse,
  finishRun,
  json,
  requireStaff,
  type Row,
  shopifyConfig,
  shopifyGet,
  startRun,
} from "../_shared/sync.ts"

type ShopifyVariant = {
  id: number
  sku: string | null
  price: string
  compare_at_price: string | null
  inventory_quantity?: number
  barcode?: string | null
  grams?: number
  image_id?: number | null
  option1: string | null
  option2: string | null
  option3: string | null
}
type ShopifyProduct = {
  id: number
  title: string
  status: string
  product_type?: string
  options?: Array<{ name: string; position: number }>
  images?: Array<{ id: number; src: string }>
  variants?: ShopifyVariant[]
}

/** Retire at most this share of live rows in one run; more than that is treated as a bad fetch. */
const MAX_RETIRE_SHARE = 0.3

function optionValue(v: ShopifyVariant, position: number | null): string | null {
  if (position === 1) return v.option1
  if (position === 2) return v.option2
  if (position === 3) return v.option3
  return null
}

function optionPosition(p: ShopifyProduct, names: string[]): number | null {
  const hit = (p.options || []).find((o) => names.includes(String(o.name || "").toLowerCase()))
  return hit ? hit.position : null
}

function toRow(p: ShopifyProduct): Row {
  // Look options up by name; older data assumed option1 = colour, option2 = size.
  const colorPos = optionPosition(p, ["color", "colour"]) ?? 1
  const sizePos = optionPosition(p, ["size"]) ?? 2
  const groups = new Map<string, Row & { sizes: Row[] }>()
  for (const v of p.variants || []) {
    const color = optionValue(v, colorPos) || "Default"
    const size = optionValue(v, sizePos) || "OS"
    let group = groups.get(color)
    if (!group) {
      group = { style_code: v.sku || `SP-${v.id}`, color_name: color, sizes: [] }
      groups.set(color, group)
    }
    const price = parseFloat(v.price) || 0
    const compareAt = parseFloat(v.compare_at_price || "") || 0
    group.sizes.push({
      size,
      label: size === "OS" ? "One Size" : size,
      sku: v.sku || `SP-${v.id}`,
      mrp: price,
      selling_price: price,
      compare_at_price: compareAt,
      discount: compareAt > price ? compareAt - price : 0,
      inventory: v.inventory_quantity || 0,
      active: true,
      barcode: v.barcode || null,
      weight: v.grams ? v.grams / 1000 : 0,
      weight_unit: "kg",
      image: p.images?.find((img) => img.id === v.image_id)?.src || p.images?.[0]?.src || null,
      option1: v.option1,
      option2: v.option2,
      option3: v.option3,
      shopify_variant_id: v.id,
    })
  }
  return {
    shopify_product_id: String(p.id),
    product_title: p.title,
    category: p.product_type || null,
    status: p.status === "active" ? "Active" : "Draft",
    image_url: p.images?.[0]?.src || null,
    shopify_images: (p.images || []).map((img) => img.src),
    variants: [...groups.values()],
    deleted_at: null,
  }
}

async function registerCategories(supabase: SupabaseClient, names: string[]) {
  if (!names.length) return
  const { data, error } = await supabase.from("product_categories").select("name")
  if (error) {
    console.warn("product_categories read:", error.message)
    return
  }
  const have = new Set((data || []).map((r: Row) => String(r.name)))
  const missing = names.filter((n) => !have.has(n))
  if (!missing.length) return
  const ins = await supabase.from("product_categories").insert(missing.map((name) => ({ name })))
  if (ins.error) console.warn("product_categories insert:", ins.error.message)
}

/** Live rows whose Shopify product was not in this complete fetch. */
async function findMissing(supabase: SupabaseClient, seen: Set<string>) {
  const live: Array<{ id: string; spid: string }> = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("catalogue_products")
      .select("id, shopify_product_id")
      .is("deleted_at", null)
      .not("shopify_product_id", "is", null)
      .order("id")
      .range(from, from + 999)
    if (error) throw new Error(`catalogue_products read: ${error.message}`)
    for (const r of (data || []) as Row[]) live.push({ id: String(r.id), spid: String(r.shopify_product_id) })
    if (!data || data.length < 1000) break
  }
  // Seed rows and retired duplicates are not Shopify products.
  const missing = live.filter((r) => !seen.has(r.spid) && !/^(seed_|dup:)/.test(r.spid))
  return { live: live.length, missing }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json(req, "ok")

  let supabase: SupabaseClient | null = null
  let runId: string | null = null
  try {
    supabase = adminClient()
    const caller = await requireStaff(req, supabase)
    runId = await startRun(supabase, "catalogue", caller)
    if (!runId) {
      return json(req, { success: false, skipped: true, message: "A catalogue sync is already running", error: "A catalogue sync is already running" })
    }

    const { base, token } = shopifyConfig()
    const products: ShopifyProduct[] = []
    let url: string | null = `${base}/products.json?limit=250`
    while (url) {
      const page = await shopifyGet(url, token)
      products.push(...((page.body.products as ShopifyProduct[]) || []))
      url = page.next
    }

    const rows = products.map(toRow)
    let upserted = 0
    let failed = 0
    const errors: string[] = []
    for (const batch of chunks(rows, 100)) {
      const { error } = await supabase
        .from("catalogue_products")
        .upsert(batch, { onConflict: "shopify_product_id" })
      if (error) {
        failed += batch.length
        if (errors.length < 3) errors.push(error.message)
      } else {
        upserted += batch.length
      }
    }

    await registerCategories(supabase, [
      ...new Set(products.map((p) => (p.product_type || "").trim()).filter(Boolean)),
    ])

    // Only retire products after a complete, error-free fetch and write.
    let retired = 0
    let retireNote = ""
    if (failed === 0 && products.length > 0) {
      const { live, missing } = await findMissing(supabase, new Set(rows.map((r) => String(r.shopify_product_id))))
      if (missing.length > Math.max(20, Math.floor(live * MAX_RETIRE_SHARE))) {
        retireNote = `${missing.length} of ${live} products are missing from Shopify; not retired automatically.`
      } else {
        const now = new Date().toISOString()
        for (const batch of chunks(missing.map((m) => m.id), 100)) {
          const { error } = await supabase.from("catalogue_products").update({ deleted_at: now }).in("id", batch)
          if (error) {
            if (errors.length < 3) errors.push(`retire: ${error.message}`)
          } else {
            retired += batch.length
          }
        }
      }
    }

    const status = failed === 0 && !retireNote ? "success" : upserted > 0 ? "partial" : "failed"
    const message = [
      `${upserted} of ${products.length} Shopify products synced`,
      retired ? `${retired} removed from Shopify and retired` : "",
      retireNote,
    ].filter(Boolean).join(". ")
    await finishRun(supabase, runId, {
      status,
      upserted,
      failed,
      message,
      error: errors.join(" | ") || undefined,
      meta: { retired, shopify_products: products.length },
    })
    runId = null

    return json(req, {
      success: status !== "failed",
      status,
      synced_products: upserted,
      failed_products: failed,
      retired_products: retired,
      total_shopify_products: products.length,
      total_collections: 0,
      // Fields the admin "Sync All" summary reads; this function does not reconcile design_products.
      design_products_updated: 0,
      design_products_auto_created: 0,
      design_products_backfilled: 0,
      design_products_needs_review: 0,
      review_breakdown: {},
      message,
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

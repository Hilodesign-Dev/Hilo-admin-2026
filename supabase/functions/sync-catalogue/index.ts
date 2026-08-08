import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const shopifyShop = Deno.env.get("SHOPIFY_SHOP_NAME")
    const shopifyToken = Deno.env.get("SHOPIFY_ADMIN_API_ACCESS_TOKEN")
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!shopifyShop || !shopifyToken) {
      throw new Error("Missing Shopify configuration secrets.")
    }

    const supabase = createClient(supabaseUrl!, supabaseKey!)

    // Fetch products from Shopify
    const shopifyUrl = `https://${shopifyShop}/admin/api/2023-10/products.json?limit=50`
    const res = await fetch(shopifyUrl, {
      headers: {
        "X-Shopify-Access-Token": shopifyToken,
        "Accept": "application/json",
      }
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Shopify API error: ${res.statusText} - ${errText}`)
    }

    const { products } = await res.json()

    let upsertedCount = 0

    for (const p of products) {
      // Map Shopify product to catalogue_products schema
      const variantGroups = {}
      for (const v of p.variants || []) {
        const color = v.option1 || 'Default'
        if (!variantGroups[color]) {
          variantGroups[color] = {
            style_code: v.sku || `SP-${v.id}`,
            color_name: color,
            sizes: []
          }
        }
        
        variantGroups[color].sizes.push({
          size: v.option2 || 'OS',
          label: v.option2 || 'One Size',
          sku: v.sku || `SP-${v.id}`,
          mrp: parseFloat(v.price) || 0,
          selling_price: parseFloat(v.price) || 0,
          compare_at_price: parseFloat(v.compare_at_price) || 0,
          discount: v.compare_at_price ? (parseFloat(v.compare_at_price) - parseFloat(v.price)) : 0,
          inventory: v.inventory_quantity || 0,
          active: true,
          barcode: v.barcode || null,
          weight: v.grams ? (v.grams / 1000) : 0,
          weight_unit: 'kg',
          image: p.images?.find((img) => img.id === v.image_id)?.src || p.images?.[0]?.src || null,
          option1: v.option1 || null,
          option2: v.option2 || null,
          option3: v.option3 || null,
          shopify_variant_id: v.id,
        })
      }

      const variantsJson = Object.values(variantGroups)

      const productPayload = {
        shopify_product_id: String(p.id),
        product_title: p.title,
        category: p.product_type || null,
        status: p.status === 'active' ? 'Active' : 'Draft',
        image_url: p.images?.[0]?.src || null,
        shopify_images: (p.images || []).map((img) => img.src),
        variants: variantsJson,
        deleted_at: null,
      }

      // Auto-register category in cloud categories
      if (p.product_type) {
        try {
          const { data: catExists } = await supabase
            .from('product_categories')
            .select('id')
            .eq('name', p.product_type)
            .maybeSingle()

          if (!catExists) {
            await supabase
              .from('product_categories')
              .insert({ name: p.product_type, shopify_tag: p.product_type })
          }
        } catch (catErr) {
          console.warn("Could not auto-register category:", catErr.message)
        }
      }

      // Check if product exists
      const { data: existing } = await supabase
        .from('catalogue_products')
        .select('id')
        .eq('shopify_product_id', String(p.id))
        .maybeSingle()

      if (existing) {
        await supabase
          .from('catalogue_products')
          .update(productPayload)
          .eq('id', existing.id)
      } else {
        await supabase
          .from('catalogue_products')
          .insert(productPayload)
      }
      upsertedCount++
    }

    // Record sync run status in sync_runs
    try {
      await supabase.from('sync_runs').insert({
        sync_type: 'catalogue',
        status: 'success',
        source: 'edge',
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        records_upserted: upsertedCount,
        records_failed: 0,
      })
    } catch (e) {
      console.warn("Could not write to sync_runs:", e.message)
    }

    return new Response(JSON.stringify({ success: true, synced_products: upsertedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

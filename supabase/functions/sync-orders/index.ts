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
    
    const body = await req.json().catch(() => ({}))
    const since = body.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Fetch orders from Shopify
    const shopifyUrl = `https://${shopifyShop}/admin/api/2023-10/orders.json?status=any&created_at_min=${since}&limit=50`
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

    const { orders } = await res.json()

    let upsertedOrders = 0
    let upsertedLines = 0

    for (const o of orders) {
      // Map Shopify order to shopify_orders schema
      const orderPayload = {
        order_number: String(o.name || o.order_number),
        customer_name: o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : 'Guest',
        customer_email: o.email || (o.customer ? o.customer.email : null),
        created_at: o.created_at,
      }

      // Check if order exists
      const { data: existing } = await supabase
        .from('shopify_orders')
        .select('id')
        .eq('order_number', orderPayload.order_number)
        .maybeSingle()

      let orderId
      if (existing) {
        orderId = existing.id
        await supabase
          .from('shopify_orders')
          .update(orderPayload)
          .eq('id', orderId)
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from('shopify_orders')
          .insert(orderPayload)
          .select('id')
          .single()
        if (insErr) throw insErr
        orderId = inserted.id
      }
      upsertedOrders++

      // Map line items
      for (const li of o.line_items || []) {
        const linePayload = {
          order_id: orderId,
          updated_at: new Date().toISOString(),
        }

        await supabase
          .from('order_line_items')
          .insert(linePayload)
        
        upsertedLines++
      }
    }

    // Record sync run status in sync_runs
    try {
      await supabase.from('sync_runs').insert({
        sync_type: 'orders',
        status: 'success',
        source: 'edge',
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        records_upserted: upsertedOrders,
        records_failed: 0,
      })
    } catch (e) {
      console.warn("Could not write to sync_runs:", e.message)
    }

    return new Response(JSON.stringify({ 
      success: true, 
      synced_orders: upsertedOrders,
      synced_line_items: upsertedLines
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

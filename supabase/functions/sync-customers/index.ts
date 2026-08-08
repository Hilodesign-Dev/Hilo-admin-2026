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

    // Fetch customers from Shopify
    const shopifyUrl = `https://${shopifyShop}/admin/api/2023-10/customers.json?limit=50`
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

    const { customers } = await res.json()

    let upsertedCount = 0

    for (const c of customers) {
      const customerPayload = {
        name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'No Name',
        email: c.email || null,
        phone: c.phone || null,
      }

      // Check if exists
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .eq('email', c.email)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('customers')
          .update(customerPayload)
          .eq('id', existing.id)
      } else {
        await supabase
          .from('customers')
          .insert(customerPayload)
      }
      upsertedCount++
    }

    // Record sync run status in sync_runs
    try {
      await supabase.from('sync_runs').insert({
        sync_type: 'customers',
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

    return new Response(JSON.stringify({ success: true, synced_customers: upsertedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

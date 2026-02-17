import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Generate a session for the user using admin API
    const { data: sessionData, error: sessionError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: (await admin.from("profiles").select("email").eq("id", user_id).single()).data?.email || "",
    });

    if (sessionError) {
      // Fallback: use direct SQL to test RLS
      // Run the query through Postgres with set_local to impersonate user
      const { data, error } = await admin.rpc("test_user_groups" as any, { target_user_id: user_id });
      
      return new Response(JSON.stringify({ 
        error: sessionError.message,
        fallback_note: "Cannot impersonate user directly. The RLS functions require auth.uid() which is only set in user sessions."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sessionData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

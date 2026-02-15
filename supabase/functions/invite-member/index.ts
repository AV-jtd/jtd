import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { team_id, email, user_id, role } = await req.json();

    if (!team_id) {
      return new Response(JSON.stringify({ error: "Укажите team_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!email && !user_id) {
      return new Response(JSON.stringify({ error: "Укажите email или user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const memberRole = role === "manager" ? "manager" : "member";

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller is director of this team
    const { data: callerMembership } = await admin
      .from("team_members")
      .select("role")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .single();

    if (!callerMembership || callerMembership.role !== "director") {
      return new Response(JSON.stringify({ error: "Только директор может приглашать" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find target user
    let targetUserId = user_id;
    let targetName = "";

    if (email && !user_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("id, display_name")
        .eq("email", email.trim().toLowerCase())
        .single();

      if (!profile) {
        return new Response(JSON.stringify({ error: "Пользователь с таким email не найден" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetUserId = profile.id;
      targetName = profile.display_name || email;
    } else if (user_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("id, display_name")
        .eq("id", user_id)
        .single();

      if (!profile) {
        return new Response(JSON.stringify({ error: "Пользователь не найден" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetName = profile.display_name || user_id;
    }

    // Check if already a member
    const { data: existing } = await admin
      .from("team_members")
      .select("id, role")
      .eq("team_id", team_id)
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (existing) {
      // If already exists, update role if different
      if (existing.role !== memberRole && existing.role !== "director") {
        await admin
          .from("team_members")
          .update({ role: memberRole })
          .eq("id", existing.id);
        return new Response(JSON.stringify({ success: true, updated: true, name: targetName }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Пользователь уже в команде" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add member
    const { error: insertError } = await admin.from("team_members").insert({
      team_id,
      user_id: targetUserId,
      role: memberRole,
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, name: targetName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

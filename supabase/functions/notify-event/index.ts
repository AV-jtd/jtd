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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { event, taskId, taskTitle, targetUserIds } = await req.json();
    if (!event || !targetUserIds || !Array.isArray(targetUserIds)) {
      return new Response(JSON.stringify({ error: "event and targetUserIds required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get sender profile
    const { data: senderProfile } = await serviceClient
      .from("profiles")
      .select("display_name, email")
      .eq("id", user.id)
      .single();
    const senderName = senderProfile?.display_name || senderProfile?.email || "Кто-то";

    // Map event to preference column
    const pushPrefKey: Record<string, string> = {
      task_assigned: "push_task_assigned",
      task_completed: "push_task_completed",
      task_commented: "push_task_commented",
      deadline_approaching: "push_deadline_approaching",
      added_to_group: "push_added_to_group",
      task_participant_added: "push_task_participant_added",
      new_task_in_group: "push_new_task_in_group",
    };

    const prefColumn = pushPrefKey[event];
    if (!prefColumn) {
      return new Response(JSON.stringify({ error: "Unknown event" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter out sender from targets
    const filteredTargets = targetUserIds.filter((id: string) => id !== user.id);
    if (filteredTargets.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get preferences for all targets
    const { data: allPrefs } = await serviceClient
      .from("notification_preferences")
      .select("*")
      .in("user_id", filteredTargets);

    // Build notification text
    const titles: Record<string, string> = {
      task_assigned: `${senderName} назначил вам задачу`,
      task_completed: `${senderName} завершил задачу`,
      task_commented: `${senderName} прокомментировал задачу`,
      deadline_approaching: "Приближается дедлайн",
      added_to_group: `${senderName} добавил вас в проект`,
      task_participant_added: `${senderName} добавил вас в задачу`,
      new_task_in_group: `${senderName} создал задачу в проекте`,
    };
    const title = titles[event] || "Уведомление";
    const body = taskTitle || "";

    // Get VAPID keys for push
    const { data: vapid } = await serviceClient
      .from("vapid_keys")
      .select("*")
      .eq("id", 1)
      .single();

    let totalSent = 0;

    for (const targetUserId of filteredTargets) {
      const userPrefs = allPrefs?.find((p: any) => p.user_id === targetUserId);
      // Default to true for push_task_assigned and push_task_completed if no prefs exist
      const defaultEnabled = event === "task_assigned" || event === "task_completed";
      const pushEnabled = userPrefs ? !!(userPrefs as any)[prefColumn] : defaultEnabled;

      if (pushEnabled && vapid) {
        // Get user subscriptions
        const { data: subs } = await serviceClient
          .from("push_subscriptions")
          .select("*")
          .eq("user_id", targetUserId);

        if (subs) {
          for (const sub of subs) {
            try {
              const pushPayload = JSON.stringify({ title, body });
              const vapidJwt = await buildVapidJwt(
                new URL(sub.endpoint).origin,
                JSON.parse(vapid.private_key)
              );
              const response = await fetch(sub.endpoint, {
                method: "POST",
                headers: {
                  "Content-Type": "application/octet-stream",
                  "Content-Encoding": "aes128gcm",
                  TTL: "86400",
                  Authorization: `vapid t=${vapidJwt}, k=${vapid.public_key}`,
                },
                body: new TextEncoder().encode(pushPayload),
              });

              if (response.status === 201 || response.status === 200) {
                totalSent++;
              } else if (response.status === 410 || response.status === 404) {
                await serviceClient.from("push_subscriptions").delete().eq("id", sub.id);
              }
              await response.text();
            } catch (err) {
              console.error("Push error for sub", sub.id, err);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ sent: totalSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function buildVapidJwt(audience: string, privateKeyJwk: JsonWebKey): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 60 * 60, sub: "mailto:push@lovable.app" };

  const key = await crypto.subtle.importKey(
    "jwk", privateKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );

  const enc = new TextEncoder();
  const headerB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(enc.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)
  );

  return `${unsigned}.${uint8ArrayToBase64Url(new Uint8Array(signature))}`;
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMaxToken, getMaxBotInfo, sendMaxMessage, MAX_API_BASE } from "../_shared/max-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WEBHOOK_URL = "https://nvfioycpwyzwukvokwql.supabase.co/functions/v1/max-webhook";

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Try to bind a MAX account to a JTD user using a short-lived link token.
 * Returns the bound user_id (or null if the token is invalid/expired).
 */
async function bindWithToken(
  supabase: ReturnType<typeof svc>,
  token: string,
  maxUserId: number,
  maxChatId: number,
): Promise<string | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const { data: row } = await supabase
    .from("max_link_tokens")
    .select("token, user_id, expires_at")
    .eq("token", trimmed)
    .maybeSingle();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabase.from("max_link_tokens").delete().eq("token", trimmed);
    return null;
  }

  await supabase
    .from("profiles")
    .update({ max_user_id: maxUserId, max_chat_id: maxChatId })
    .eq("id", row.user_id);

  // One-time token — consume it.
  await supabase.from("max_link_tokens").delete().eq("token", trimmed);
  return row.user_id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const TOKEN = getMaxToken();
  if (!TOKEN) {
    return new Response(JSON.stringify({ error: "MAX_BOT_TOKEN not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // ---- Control actions (called from the app / setup, not from MAX) ----

  // Return the bot username so the client can build a deep-link.
  if (body.action === "bot_info") {
    const info = await getMaxBotInfo(TOKEN);
    if (!info) {
      return new Response(JSON.stringify({ error: "Failed to fetch bot info" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, ...info }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Register the webhook subscription with MAX.
  if (body.action === "setup_webhook") {
    const res = await fetch(`${MAX_API_BASE}/subscriptions`, {
      method: "POST",
      headers: { "Authorization": TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        update_types: ["bot_started", "message_created"],
      }),
    });
    let result: unknown = null;
    try { result = await res.json(); } catch { /* ignore */ }
    return new Response(JSON.stringify({ ok: res.ok, status: res.status, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ---- Incoming MAX webhook updates ----
  const updateType: string | undefined = body.update_type;

  if (updateType === "bot_started" || updateType === "message_created") {
    const supabase = svc();

    // Extract user id, chat id and the candidate link token.
    let maxUserId: number | undefined;
    let maxChatId: number | undefined;
    let tokenCandidate = "";

    if (updateType === "bot_started") {
      maxUserId = body.user?.user_id ?? body.user_id;
      maxChatId = body.chat_id ?? maxUserId;
      // Deep-link start payload carries the link token.
      tokenCandidate = (body.payload ?? "").toString();
    } else {
      const msg = body.message ?? {};
      maxUserId = msg.sender?.user_id ?? msg.from?.user_id;
      maxChatId = msg.recipient?.chat_id ?? msg.chat_id ?? maxUserId;
      const text: string = (msg.body?.text ?? msg.text ?? "").toString().trim();
      // Accept "/start <token>" or a bare token pasted into the chat.
      tokenCandidate = text.replace(/^\/start\s+/i, "").trim();
    }

    if (maxUserId == null) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tokenCandidate) {
      const boundUserId = await bindWithToken(supabase, tokenCandidate, maxUserId, maxChatId!);
      if (boundUserId) {
        await sendMaxMessage(
          TOKEN,
          { userId: maxUserId },
          "✅ Аккаунт MAX привязан к JustTODOit (JTD). Теперь сюда будут приходить уведомления.",
        );
        return new Response(JSON.stringify({ ok: true, bound: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // No valid token: greet and explain how to link.
    await sendMaxMessage(
      TOKEN,
      { userId: maxUserId },
      "👋 Привет! Я JustTODOit (JTD).\n\n" +
        "Чтобы привязать этот аккаунт MAX, откройте Настройки → MAX в приложении JTD " +
        "и нажмите «Привязать аккаунт MAX», либо отправьте сюда полученный там код привязки.",
    );
    return new Response(JSON.stringify({ ok: true, bound: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, ignored: updateType ?? "unknown" }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
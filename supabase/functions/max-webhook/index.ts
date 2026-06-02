import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMaxToken, getMaxBotInfo, sendMaxMessage, answerMaxCallback, MAX_API_BASE } from "../_shared/max-api.ts";
import {
  extractBotCommand,
  handleCoreCommand,
  handleBulkText,
  handleCorePayload,
  makeMaxTransport,
} from "../_shared/messenger-core.ts";

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

/** Resolve a JTD profile id from a bound MAX user id. */
async function profileIdForMaxUser(
  supabase: ReturnType<typeof svc>,
  maxUserId: number,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("max_user_id", maxUserId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Persist the ordered task ids of the last list shown to a MAX user. */
async function saveMaxList(
  supabase: ReturnType<typeof svc>,
  maxUserId: number,
  userId: string,
  taskIds: string[],
): Promise<void> {
  await supabase.from("messenger_list_context").upsert(
    {
      channel: "max",
      external_id: String(maxUserId),
      user_id: userId,
      task_ids: taskIds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "channel,external_id" },
  );
}

/** Load the ordered task ids of the last list shown to a MAX user. */
async function loadMaxList(
  supabase: ReturnType<typeof svc>,
  maxUserId: number,
): Promise<string[] | null> {
  const { data } = await supabase
    .from("messenger_list_context")
    .select("task_ids")
    .eq("channel", "max")
    .eq("external_id", String(maxUserId))
    .maybeSingle();
  return (data?.task_ids as string[] | undefined) ?? null;
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
        update_types: ["bot_started", "message_created", "message_callback"],
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

  // Inline-button press (e.g. ✅ Done / 👤 Take from a task list).
  if (updateType === "message_callback") {
    const supabase = svc();
    const cb = body.callback ?? {};
    const callbackId: string | undefined = cb.callback_id;
    const maxUserId: number | undefined = cb.user?.user_id ?? cb.from?.user_id;
    const payload: string = (cb.payload ?? "").toString();

    if (!callbackId || maxUserId == null || !payload) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const boundProfileId = await profileIdForMaxUser(supabase, maxUserId);
    if (!boundProfileId) {
      await answerMaxCallback(TOKEN, callbackId, "❌ Аккаунт не привязан");
      return new Response(JSON.stringify({ ok: true, bound: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const note = await handleCorePayload({ supabase, userId: boundProfileId, payload });
    await answerMaxCallback(TOKEN, callbackId, note);
    return new Response(JSON.stringify({ ok: true, handled: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (updateType === "bot_started" || updateType === "message_created") {
    const supabase = svc();

    // Extract user id, chat id and the candidate link token.
    let maxUserId: number | undefined;
    let maxChatId: number | undefined;
    let tokenCandidate = "";
    let messageText = "";

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
      messageText = text;
      // Accept "/start <token>" or a bare token pasted into the chat.
      tokenCandidate = text.replace(/^\/start\s+/i, "").trim();
    }

    if (maxUserId == null) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If this MAX account is already linked, route the message through the
    // shared messenger core (commands + bulk task creation) instead of
    // re-running the binding flow.
    const boundProfileId = await profileIdForMaxUser(supabase, maxUserId);
    if (boundProfileId && updateType === "message_created" && messageText) {
      const transport = makeMaxTransport(TOKEN, { userId: maxUserId });
      const cmd = extractBotCommand(messageText);
      if (cmd) {
        const handled = await handleCoreCommand({
          supabase,
          transport,
          userId: boundProfileId,
          command: cmd.command,
          args: cmd.args,
          saveList: (ids) => saveMaxList(supabase, maxUserId!, boundProfileId, ids),
          loadList: () => loadMaxList(supabase, maxUserId!),
        });
        if (!handled) {
          // Unknown slash command — fall back to bulk parsing of its body.
          await handleBulkText({ supabase, transport, userId: boundProfileId, text: messageText });
        }
      } else {
        // Plain text → treat as a list of tasks to create.
        await handleBulkText({ supabase, transport, userId: boundProfileId, text: messageText });
      }
      return new Response(JSON.stringify({ ok: true, handled: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tokenCandidate && !boundProfileId) {
      const boundUserId = await bindWithToken(supabase, tokenCandidate, maxUserId, maxChatId!);
      if (boundUserId) {
        await sendMaxMessage(
          TOKEN,
          { userId: maxUserId },
          "✅ Аккаунт MAX привязан к JustTODOit (JTD).\n\n" +
            "Теперь сюда будут приходить уведомления, а ещё можно управлять задачами:\n" +
            "📂 /projects · 👤 /my · 📋 /tasks Проект · ✅ /done N · 📦 /spisok\n\n" +
            "💡 Можно просто прислать список задач текстом.",
        );
        return new Response(JSON.stringify({ ok: true, bound: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // bot_started for an already-linked account → friendly menu.
    if (boundProfileId && updateType === "bot_started") {
      await makeMaxTransport(TOKEN, { userId: maxUserId }).send(
        "👋 С возвращением в JustTODOit (JTD)!\n\n" +
          "📂 /projects · 👤 /my · 📋 /tasks Проект · ✅ /done N · 📦 /spisok\n\n" +
          "💡 Можно просто прислать список задач текстом.",
      );
      return new Response(JSON.stringify({ ok: true, bound: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
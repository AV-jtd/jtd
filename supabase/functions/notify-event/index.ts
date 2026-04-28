import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  ApplicationServer,
  importVapidKeys,
  type PushSubscription as WPPushSubscription,
  PushMessageError,
  Urgency,
} from "jsr:@negrel/webpush@0.5.0";

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

    // Map event to preference columns
    const pushPrefKey: Record<string, string> = {
      task_assigned: "push_task_assigned",
      task_completed: "push_task_completed",
      task_commented: "push_task_commented",
      deadline_approaching: "push_deadline_approaching",
      added_to_group: "push_added_to_group",
      task_participant_added: "push_task_participant_added",
      new_task_in_group: "push_new_task_in_group",
      task_delegated: "push_task_delegated",
      baseline_approver_assigned: "push_task_assigned",
      baseline_locked: "push_task_assigned",
    };

    const telegramPrefKey: Record<string, string> = {
      task_assigned: "telegram_task_assigned",
      task_completed: "telegram_task_completed",
      task_commented: "telegram_task_commented",
      deadline_approaching: "telegram_deadline_approaching",
      added_to_group: "telegram_added_to_group",
      task_participant_added: "telegram_task_participant_added",
      new_task_in_group: "telegram_new_task_in_group",
      task_delegated: "telegram_task_delegated",
      baseline_approver_assigned: "telegram_task_assigned",
      baseline_locked: "telegram_task_assigned",
    };

    const prefColumn = pushPrefKey[event];
    const telegramPrefColumn = telegramPrefKey[event];
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
      task_delegated: `${senderName} делегировал вам задачу`,
      baseline_approver_assigned: `${senderName} назначил вас утверждающим сроки`,
      baseline_locked: `Сроки проекта зафиксированы`,
    };
    const title = titles[event] || "Уведомление";
    let body = taskTitle || "";

    // Enrich with project + deadline context for task-level events
    let projectLabel: string | null = null;
    let deadlineLabel: string | null = null;
    if (taskId) {
      try {
        const { data: taskCtx } = await serviceClient
          .from("tasks")
          .select("deadline, group_id, task_groups:group_id (name, icon)")
          .eq("id", taskId)
          .maybeSingle();
        if (taskCtx) {
          const g = (taskCtx as any).task_groups;
          if (g?.name) {
            projectLabel = `${g.icon || "📁"} ${g.name}`;
          }
          if (taskCtx.deadline) {
            try {
              const d = new Date(taskCtx.deadline as string);
              const dateStr = d.toLocaleDateString("ru-RU", {
                day: "2-digit", month: "2-digit", year: "numeric",
                timeZone: "Europe/Moscow",
              });
              const hh = d.getUTCHours();
              const mm = d.getUTCMinutes();
              // Show time only if not midnight UTC (i.e. user set a specific time)
              const hasTime = !(hh === 0 && mm === 0);
              if (hasTime) {
                const timeStr = d.toLocaleTimeString("ru-RU", {
                  hour: "2-digit", minute: "2-digit",
                  timeZone: "Europe/Moscow",
                });
                deadlineLabel = `${dateStr} ${timeStr}`;
              } else {
                deadlineLabel = dateStr;
              }
            } catch {}
          }
        }
      } catch (e) {
        console.error("Failed to enrich notification context:", e);
      }
    }

    const contextLines: string[] = [];
    if (projectLabel) contextLines.push(`📁 ${projectLabel.replace(/^📁\s*/, "")}`);
    if (deadlineLabel) contextLines.push(`🗓 до ${deadlineLabel}`);
    const contextSuffix = contextLines.length > 0 ? `\n${contextLines.join(" · ")}` : "";

    // Get VAPID keys and build ApplicationServer
    const { data: vapid } = await serviceClient
      .from("vapid_keys")
      .select("*")
      .eq("id", 1)
      .single();

    let appServer: ApplicationServer | null = null;
    if (vapid) {
      try {
        const privateKeyJwk = JSON.parse(vapid.private_key) as JsonWebKey;
        // Reconstruct public JWK from private JWK (it contains x, y)
        const publicJwk: JsonWebKey = {
          kty: privateKeyJwk.kty,
          crv: privateKeyJwk.crv,
          x: privateKeyJwk.x,
          y: privateKeyJwk.y,
          ext: true,
          key_ops: [],
        };
        const vapidKeys = await importVapidKeys({
          privateKey: privateKeyJwk,
          publicKey: publicJwk,
        });
        appServer = await ApplicationServer.new({
          contactInformation: "mailto:push@lovable.app",
          vapidKeys,
        });
      } catch (err) {
        console.error("Failed to init ApplicationServer:", err);
      }
    }

    // Get Telegram bot token
    const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

    // Get profiles for telegram usernames
    const { data: targetProfiles } = await serviceClient
      .from("profiles")
      .select("id, telegram_username")
      .in("id", filteredTargets);

    // Get bot chats for Telegram DMs
    const tgUsernames = (targetProfiles || [])
      .filter((p: any) => p.telegram_username)
      .map((p: any) => p.telegram_username.toLowerCase());

    let botChatsMap: Record<string, number> = {};
    if (BOT_TOKEN && tgUsernames.length > 0) {
      const { data: botChats } = await serviceClient
        .from("telegram_bot_chats")
        .select("chat_id, telegram_username")
        .in("telegram_username", tgUsernames);

      if (botChats) {
        for (const bc of botChats) {
          botChatsMap[bc.telegram_username.toLowerCase()] = bc.chat_id;
        }
      }
    }

    let totalSent = 0;
    let totalTelegramSent = 0;

    for (const targetUserId of filteredTargets) {
      const userPrefs = allPrefs?.find((p: any) => p.user_id === targetUserId);
      const defaultEnabled = ["task_assigned", "task_completed", "task_participant_added", "added_to_group"].includes(event);
      const pushEnabled = userPrefs ? !!(userPrefs as any)[prefColumn] : defaultEnabled;
      const telegramEnabled = userPrefs && telegramPrefColumn ? !!(userPrefs as any)[telegramPrefColumn] : false;

      // --- Push notification (RFC 8291 encrypted) ---
      if (pushEnabled && appServer) {
        const { data: subs } = await serviceClient
          .from("push_subscriptions")
          .select("*")
          .eq("user_id", targetUserId);

        if (subs) {
          for (const sub of subs) {
            try {
              const pushSub: WPPushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              };
              const subscriber = appServer.subscribe(pushSub);
              const pushPayload = JSON.stringify({ title, body: body + contextSuffix });

              await subscriber.pushTextMessage(pushPayload, {
                ttl: 86400,
                urgency: Urgency.High,
                topic: "",
              });

              totalSent++;
            } catch (err) {
              if (err instanceof PushMessageError && err.isGone()) {
                // Subscription expired, remove it
                await serviceClient.from("push_subscriptions").delete().eq("id", sub.id);
              } else {
                console.error("Push error for sub", sub.id, err);
              }
            }
          }
        }
      }

      // --- Telegram notification ---
      if (telegramEnabled && BOT_TOKEN) {
        const profile = (targetProfiles || []).find((p: any) => p.id === targetUserId);
        const tgUsername = profile?.telegram_username?.toLowerCase();
        const chatId = tgUsername ? botChatsMap[tgUsername] : null;

        if (chatId) {
          try {
            const tgContext = contextLines
              .map((l) => escapeHtml(l))
              .join("\n");
            const tgMessage = `🔔 <b>${escapeHtml(title)}</b>${body ? `\n${escapeHtml(body)}` : ""}${tgContext ? `\n\n${tgContext}` : ""}`;
            const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: tgMessage,
                parse_mode: "HTML",
              }),
            });
            if (res.ok) {
              totalTelegramSent++;
            } else {
              const errText = await res.text();
              console.error("Telegram send error:", errText);
            }
          } catch (err) {
            console.error("Telegram error for user", targetUserId, err);
          }
        }
      }
    }

    return new Response(JSON.stringify({ sent: totalSent, telegramSent: totalTelegramSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-event error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

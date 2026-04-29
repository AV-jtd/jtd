import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { blockConsultant } from "../_shared/consultant-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const blocked = await blockConsultant(req, { corsHeaders });
  if (blocked) return blocked;

  try {
    const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "Bot token not configured" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      group_id,
      content,
      sender_name,
      sender_user_id,
      // optional: structured task-created card
      kind,                 // "message" (default) | "task_created"
      task_id,
      task_title,
      assignee_name,
      deadline,             // ISO string or null
    } = body || {};

    if (!group_id) {
      return new Response(JSON.stringify({ error: "Missing group_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
    if (kind !== "task_created" && !content) {
      return new Response(JSON.stringify({ error: "Missing content" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Get group info
    const { data: group } = await supabase
      .from("task_groups")
      .select("id, name, icon, user_id")
      .eq("id", group_id)
      .single();

    if (!group) {
      return new Response(JSON.stringify({ error: "Group not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Collect all member user_ids (owner + group_members)
    const memberIds = new Set<string>();
    memberIds.add(group.user_id);

    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", group_id);

    if (members) members.forEach(m => memberIds.add(m.user_id));

    // Remove the sender so they don't get notified of their own message
    if (sender_user_id) memberIds.delete(sender_user_id);

    if (memberIds.size === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: corsHeaders });
    }

    // Get profiles with telegram_chat_id
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, telegram_chat_id")
      .in("id", [...memberIds])
      .not("telegram_chat_id", "is", null);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: corsHeaders });
    }

    // Filter by per-user notification preference (telegram_group_chat_message)
    // Only users who explicitly opted in receive group chat messages in Telegram.
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("user_id, telegram_group_chat_message")
      .in("user_id", profiles.map((p) => p.id));

    const optedInIds = new Set(
      (prefs || [])
        .filter((pr: any) => pr.telegram_group_chat_message === true)
        .map((pr: any) => pr.user_id)
    );

    const recipients = profiles.filter((p) => optedInIds.has(p.id));
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: "no opt-in" }), { headers: corsHeaders });
    }

    const groupLabel = `${group.icon || "📁"} ${group.name}`;

    let text: string;
    if (kind === "task_created") {
      // Compact task card
      const lines: string[] = [];
      lines.push(`✅ *Новая задача* в *${escapeMarkdown(groupLabel)}*`);
      lines.push(`*${escapeMarkdown(task_title || "Без названия")}*`);
      if (assignee_name) lines.push(`👤 ${escapeMarkdown(assignee_name)}`);
      if (deadline) {
        try {
          const d = new Date(deadline);
          if (!isNaN(d.getTime())) {
            const dd = String(d.getDate()).padStart(2, "0");
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            lines.push(`📅 до ${escapeMarkdown(`${dd}.${mm}`)}`);
          }
        } catch { /* ignore */ }
      }
      if (sender_name) lines.push(`_создал: ${escapeMarkdown(sender_name)}_`);
      text = lines.join("\n");
    } else {
      text = `💬 *${escapeMarkdown(groupLabel)}*\n*${escapeMarkdown(sender_name || "Аноним")}:*\n${escapeMarkdown(content)}`;
    }

    let sent = 0;
    for (const p of recipients) {
      if (!p.telegram_chat_id) continue;
      try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: p.telegram_chat_id,
            text,
            parse_mode: "Markdown",
          }),
        });
        sent++;
      } catch (e) {
        console.error(`Failed to send to chat_id ${p.telegram_chat_id}:`, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), { headers: corsHeaders });
  } catch (err: any) {
    console.error("send-chat-telegram error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

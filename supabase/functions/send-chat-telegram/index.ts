import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { group_id, content, sender_name } = await req.json();

    if (!group_id || !content) {
      return new Response(JSON.stringify({ error: "Missing group_id or content" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Get group info
    const { data: group } = await supabase
      .from("task_groups")
      .select("id, name, icon")
      .eq("id", group_id)
      .single();

    if (!group) {
      return new Response(JSON.stringify({ error: "Group not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Get all members of this group (owner + members)
    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", group_id);

    // Also get the group owner
    const ownerUserId = (await supabase
      .from("task_groups")
      .select("user_id")
      .eq("id", group_id)
      .single()).data?.user_id;

    const memberIds = new Set<string>();
    if (members) members.forEach(m => memberIds.add(m.user_id));
    if (ownerUserId) memberIds.add(ownerUserId);

    if (memberIds.size === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: corsHeaders });
    }

    // Get profiles with telegram_username for all members
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, telegram_username")
      .in("id", [...memberIds])
      .not("telegram_username", "is", null);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: corsHeaders });
    }

    const groupLabel = `${group.icon || "📁"} ${group.name}`;
    const text = `💬 *${groupLabel}*\n*${escapeMarkdown(sender_name)}:*\n${escapeMarkdown(content)}`;

    let sent = 0;
    for (const p of profiles) {
      if (!p.telegram_username) continue;

      // Find chat_id: we need to use getUpdates or store chat_ids
      // Since Telegram Bot API doesn't allow sending by username,
      // we'll try to find recent chat from the webhook interactions
      // For now, we use a simpler approach: store telegram_chat_id in profiles
      // But since we don't have that field yet, we'll skip users without it
      // Instead, let's query for the chat_id from recent bot interactions
      
      // Actually, the best approach without schema changes is to call
      // the Telegram API — but it requires chat_id, not username.
      // We need to add a telegram_chat_id column to profiles.
    }

    return new Response(JSON.stringify({ ok: true, sent }), { headers: corsHeaders });
  } catch (err) {
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

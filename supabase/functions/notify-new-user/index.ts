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
    const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "Bot token not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { user_id, display_name, email, telegram_username } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all admin user IDs
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles || adminRoles.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no admins" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminUserIds = adminRoles.map((r: any) => r.user_id);

    // Get admin telegram usernames
    const { data: adminProfiles } = await supabase
      .from("profiles")
      .select("telegram_username")
      .in("id", adminUserIds)
      .not("telegram_username", "is", null);

    if (!adminProfiles || adminProfiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no admin telegram_usernames" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const usernames = adminProfiles.map((p: any) => p.telegram_username.toLowerCase());

    // Get personal chat IDs from telegram_bot_chats (always personal chats)
    const { data: botChats } = await supabase
      .from("telegram_bot_chats")
      .select("chat_id, telegram_username")
      .in("telegram_username", usernames);

    if (!botChats || botChats.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no admin bot chats" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = display_name || "Без имени";
    const contactInfo = [
      email ? `📧 ${email}` : null,
      telegram_username ? `💬 @${telegram_username}` : null,
    ].filter(Boolean).join("\n");

    const message = `🆕 <b>Новый пользователь зарегистрировался!</b>\n\n👤 <b>${escapeHtml(name)}</b>\n${contactInfo}\n\n⏳ Ожидает подтверждения администратором.\nОткройте приложение → Настройки → Управление пользователями`;

    let totalSent = 0;

    for (const profile of adminProfiles) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: profile.telegram_chat_id,
            text: message,
            parse_mode: "HTML",
          }),
        });

        if (res.ok) totalSent++;
        else {
          const errData = await res.text();
          console.error("Telegram send error:", errData);
        }
      } catch (err) {
        console.error("Telegram send error:", err);
      }
    }

    return new Response(JSON.stringify({ sent: totalSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
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

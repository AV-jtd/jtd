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

    const { action, email, telegram_username, code } = await req.json();

    if (action === "send") {
      // --- SEND CODE ---
      if (!email || !telegram_username) {
        return new Response(JSON.stringify({ error: "Missing email or telegram_username" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanUsername = telegram_username.replace(/^@/, "").toLowerCase().trim();

      // Block duplicate registrations: if this telegram_username is already
      // attached to an existing profile with a different email — refuse.
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, email, telegram_username")
        .ilike("telegram_username", cleanUsername)
        .maybeSingle();

      if (existingProfile && existingProfile.email?.toLowerCase().trim() !== email.toLowerCase().trim()) {
        return new Response(JSON.stringify({
          error: "telegram_taken",
          message: `Пользователь с Telegram @${cleanUsername} уже зарегистрирован под другим email. Войдите под существующим аккаунтом или воспользуйтесь «Забыли пароль».`,
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find telegram chat_id — first check telegram_bot_chats (for new users),
      // then fall back to profiles (for existing users)
      let chatIdValue: number | null = null;

      const { data: botChat } = await supabase
        .from("telegram_bot_chats")
        .select("chat_id")
        .eq("telegram_username", cleanUsername)
        .maybeSingle();

      if (botChat?.chat_id) {
        chatIdValue = botChat.chat_id;
      } else {
        // Fallback: check profiles table for existing users
        const { data: profile } = await supabase
          .from("profiles")
          .select("telegram_chat_id")
          .eq("telegram_username", cleanUsername)
          .not("telegram_chat_id", "is", null)
          .maybeSingle();
        chatIdValue = profile?.telegram_chat_id ?? null;
      }

      if (!chatIdValue) {
        return new Response(JSON.stringify({
          error: "not_found",
          message: "Сначала напишите боту @Scope_todo_bot в Telegram, чтобы привязать аккаунт",
        }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Generate 6-digit code
      const newCode = String(Math.floor(100000 + Math.random() * 900000));

      // Delete old codes for this email
      await supabase
        .from("telegram_2fa_codes")
        .delete()
        .eq("email", email.toLowerCase().trim());

      // Insert new code
      await supabase
        .from("telegram_2fa_codes")
        .insert({
          email: email.toLowerCase().trim(),
          telegram_username: cleanUsername,
          code: newCode,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        });

      // Send code via Telegram
      const text = `🔐 Ваш код подтверждения для JustTODOit: *${newCode}*\n\nКод действителен 5 минут.`;
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatIdValue,
          text,
          parse_mode: "Markdown",
        }),
      });

      if (!res.ok) {
        console.error("Telegram API error:", await res.text());
        return new Response(JSON.stringify({ error: "Failed to send Telegram message" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "verify") {
      // --- VERIFY CODE ---
      if (!email || !code) {
        return new Response(JSON.stringify({ error: "Missing email or code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: record } = await supabase
        .from("telegram_2fa_codes")
        .select("*")
        .eq("email", email.toLowerCase().trim())
        .eq("code", code.trim())
        .eq("verified", false)
        .gte("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!record) {
        return new Response(JSON.stringify({ error: "invalid_code", message: "Неверный или просроченный код" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark as verified
      await supabase
        .from("telegram_2fa_codes")
        .update({ verified: true })
        .eq("id", record.id);

      return new Response(JSON.stringify({ ok: true, telegram_username: record.telegram_username }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    console.error("telegram-2fa error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

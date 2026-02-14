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

    const body = await req.json();

    // Setup webhook command
    if (body.action === "setup_webhook") {
      const webhookUrl = `https://nvfioycpwyzwukvokwql.supabase.co/functions/v1/telegram-webhook`;
      const res = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
      );
      const result = await res.json();
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }

    // Handle /start command
    if (body.message?.text === "/start") {
      const chatId = body.message.chat.id;
      await sendTelegramMessage(
        BOT_TOKEN,
        chatId,
        "👋 Привет! Я TaskFlow Bot.\n\nОтправь мне любое сообщение, и я создам из него задачу.\n\nЧтобы привязать аккаунт, укажи свой Telegram username в настройках приложения TaskFlow."
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Handle regular messages — create a task
    const message = body.message;
    if (!message?.text) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const username = message.from?.username;
    if (!username) {
      await sendTelegramMessage(
        BOT_TOKEN,
        message.chat.id,
        "❌ У вас не установлен username в Telegram. Установите его в настройках Telegram."
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Find user by telegram_username
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_username", username.toLowerCase())
      .single();

    if (profileError || !profile) {
      await sendTelegramMessage(
        BOT_TOKEN,
        message.chat.id,
        `❌ Аккаунт с username @${username} не найден.\n\nПривяжите свой Telegram в настройках TaskFlow.`
      );
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Create the task
    const { error: taskError } = await supabase.from("tasks").insert({
      title: message.text.substring(0, 500),
      user_id: profile.id,
      description: message.text.length > 500 ? message.text : null,
    });

    if (taskError) {
      await sendTelegramMessage(BOT_TOKEN, message.chat.id, "❌ Ошибка создания задачи.");
      return new Response(JSON.stringify({ error: taskError.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    await sendTelegramMessage(
      BOT_TOKEN,
      message.chat.id,
      `✅ Задача создана: "${message.text.substring(0, 100)}${message.text.length > 100 ? "..." : ""}"`
    );

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

async function sendTelegramMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// Cron-функция: каждую минуту находит "зависшие" сессии /protocol-сбора
// (telegram_pending_context.awaiting_axis = '__buffer__') с тишиной > 60 сек
// и принудительно завершает сбор материала, отправив его на AI-разбор
// через telegram-webhook (callback emulation).

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Stale = last_message_at старше 60 сек
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { data: stale, error } = await supabase
      .from("telegram_pending_context")
      .select("chat_id, user_id, last_message_at")
      .eq("awaiting_axis", "__buffer__")
      .lt("last_message_at", cutoff);

    if (error) {
      console.error("query stale buffers:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (!stale || stale.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: corsHeaders,
      });
    }

    // Эмулируем callback "proto_finish" через вызов telegram-webhook
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-webhook`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let processed = 0;
    for (const row of stale) {
      try {
        // Сначала помечаем как "обрабатывается", чтобы не запустить дважды
        const { error: lockErr } = await supabase
          .from("telegram_pending_context")
          .update({ awaiting_axis: "__flushing__" })
          .eq("chat_id", row.chat_id)
          .eq("awaiting_axis", "__buffer__");

        if (lockErr) {
          console.error("lock failed for", row.chat_id, lockErr);
          continue;
        }

        // Call internal action on telegram-webhook to run the flush
        const fakeUpdate = {
          action: "internal_flush_protocol_buffer",
          chat_id: row.chat_id,
        };

        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(fakeUpdate),
        });

        if (!resp.ok) {
          console.error(`flush ${row.chat_id} failed:`, resp.status, await resp.text());
        } else {
          processed += 1;
        }
      } catch (e) {
        console.error("flush iteration error:", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, candidates: stale.length }), {
      headers: corsHeaders,
    });
  } catch (e) {
    console.error("protocol-buffer-flush fatal:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

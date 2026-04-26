import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { blockConsultant } from "../_shared/consultant-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Отправляет текстовое резюме протокола в Telegram всем указанным user_id,
 * у которых есть telegram_chat_id. Использует TELEGRAM_BOT_TOKEN.
 *
 * body: { text: string, recipient_user_ids: string[] }
 */
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { text, recipient_user_ids } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(recipient_user_ids) || recipient_user_ids.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: "no recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, telegram_chat_id, display_name")
      .in("id", recipient_user_ids)
      .not("telegram_chat_id", "is", null);

    if (profErr) throw profErr;

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, skipped: "no telegram-linked users" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Telegram limit per message ~ 4096. Trim to be safe.
    const safeText = text.length > 3900 ? text.slice(0, 3900) + "\n\n…(сокращено)" : text;

    let sent = 0;
    const errors: string[] = [];

    await Promise.all(
      profiles.map(async (p) => {
        try {
          const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: p.telegram_chat_id,
              text: safeText,
              parse_mode: "HTML",
              disable_web_page_preview: true,
            }),
          });
          const j = await r.json();
          if (j.ok) sent++;
          else errors.push(`${p.display_name ?? p.id}: ${j.description ?? "unknown"}`);
        } catch (e) {
          errors.push(`${p.display_name ?? p.id}: ${(e as Error).message}`);
        }
      }),
    );

    return new Response(
      JSON.stringify({ ok: true, sent, total_candidates: profiles.length, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

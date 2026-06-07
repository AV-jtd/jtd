import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Counts = Record<string, number>;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { counts, topOverdue, topToday, scope } = (await req.json()) as {
      counts?: Counts;
      topOverdue?: string[];
      topToday?: string[];
      scope?: string;
    };

    const c = counts ?? {};
    const total = Object.values(c).reduce((a, b) => a + (b || 0), 0);

    // Нечего анализировать — отдаём дружелюбную заглушку без обращения к ИИ.
    if (total === 0) {
      return new Response(
        JSON.stringify({ summary: "Сегодня всё под контролем — горящих задач нет. Хорошее время заняться важным без дедлайна." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const facts = [
      `Срез: ${scope === "assignee" ? "я исполнитель" : "я участник"}.`,
      `Просрочено: ${c.overdue ?? 0}.`,
      `Сегодня: ${c.today ?? 0}.`,
      `Важное: ${c.important ?? 0}.`,
      `На неделе: ${c.week ?? 0}.`,
      `На согласовании: ${c.approval ?? 0}.`,
      `Непрочитанные обсуждения: ${c.unread ?? 0}.`,
      `Делегировано мне: ${c.toMe ?? 0}.`,
      `Делегировано мной: ${c.byMe ?? 0}.`,
      topOverdue?.length ? `Примеры просроченных: ${topOverdue.slice(0, 6).join("; ")}.` : "",
      topToday?.length ? `Примеры на сегодня: ${topToday.slice(0, 6).join("; ")}.` : "",
    ].filter(Boolean).join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Ты — ассистент по личной продуктивности (методология GTD). По сводке задач дай ОЧЕНЬ короткую рекомендацию на русском: 1–2 предложения, максимум 30 слов. Скажи, с чего начать и на что обратить внимание. Без приветствий, без списков, без markdown, по делу.",
          },
          { role: "user", content: facts },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Слишком много запросов, попробуйте позже." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Закончились кредиты ИИ. Пополните баланс в настройках." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Ошибка ИИ-сервиса" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const summary = (data?.choices?.[0]?.message?.content ?? "").trim();
    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("my-tasks-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
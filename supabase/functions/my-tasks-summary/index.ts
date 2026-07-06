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
    const { counts, topOverdue, topToday, topImportant, topWeek, topToMe, scope, cross } =
      (await req.json()) as {
        counts?: Counts;
        topOverdue?: string[];
        topToday?: string[];
        topImportant?: string[];
        topWeek?: string[];
        topToMe?: string[];
        scope?: string;
        cross?: {
          protocols?: { count: number; items: { title: string; ref: string | null }[] };
          drift?: { count: number; items: { title: string; ref: string | null }[] };
          npd?: { count: number; items: { title: string; ref: string | null }[] };
        } | null;
      };

    const c = counts ?? {};
    const crossTotal = (cross?.protocols?.count ?? 0) + (cross?.drift?.count ?? 0) + (cross?.npd?.count ?? 0);
    const total = Object.values(c).reduce((a, b) => a + (b || 0), 0) + crossTotal;

    // Нечего анализировать — отдаём дружелюбную заглушку без обращения к ИИ.
    if (total === 0) {
      return new Response(
        JSON.stringify({ summary: "Сегодня всё под контролем — горящих задач нет. Хорошее время заняться важным без дедлайна." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");

    const facts = [
      `Срез: ${scope === "assignee" ? "я исполнитель" : "я участник"}.`,
      `Просрочено: ${c.overdue ?? 0}.`,
      `Сегодня: ${c.today ?? 0}.`,
      `Важное: ${c.important ?? 0}.`,
      `На неделе: ${c.week ?? 0}.`,
      `Без дедлайна: ${c.noDeadline ?? 0}.`,
      `На согласовании: ${c.approval ?? 0}.`,
      `Непрочитанные обсуждения: ${c.unread ?? 0}.`,
      `Делегировано мне: ${c.toMe ?? 0}.`,
      `Делегировано мной: ${c.byMe ?? 0}.`,
      topOverdue?.length ? `Примеры просроченных: ${topOverdue.slice(0, 6).join("; ")}.` : "",
      topToday?.length ? `Примеры на сегодня: ${topToday.slice(0, 6).join("; ")}.` : "",
      topImportant?.length ? `Примеры важных: ${topImportant.slice(0, 6).join("; ")}.` : "",
      topWeek?.length ? `Примеры на неделе: ${topWeek.slice(0, 6).join("; ")}.` : "",
      topToMe?.length ? `Поручено мне: ${topToMe.slice(0, 6).join("; ")}.` : "",
      cross?.protocols?.count ? `Незакрытые задачи из протоколов совещаний: ${cross.protocols.count} (${cross.protocols.items.slice(0, 5).map((i) => i.title).join("; ")}).` : "",
      cross?.drift?.count ? `Задачи со сдвигом срока (drift) относительно базлайна: ${cross.drift.count} (${cross.drift.items.slice(0, 5).map((i) => i.title).join("; ")}).` : "",
      cross?.npd?.count ? `NPD-задачи в зоне риска (просрочены): ${cross.npd.count} (${cross.npd.items.slice(0, 5).map((i) => i.title).join("; ")}).` : "",
    ].filter(Boolean).join("\n");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "Ты — проницательный AI-ассистент по личной продуктивности (методология GTD) с кросс-модульным обзором (задачи, протоколы совещаний, PMO drift, NPD-гейты). По сводке дай ГЛУБОКУЮ, НЕОЧЕВИДНУЮ рекомендацию на русском.\n" +
              "Правила:\n" +
              "1. 2–3 коротких предложения, максимум 55 слов.\n" +
              "2. ЗАПРЕЩЕНО банальное «у вас N просрочено» или «обратите внимание на дедлайны» — это очевидно.\n" +
              "3. Найди паттерн, риск или дисбаланс (перегруз, забытые задачи из протоколов, drift по проектам, узкое место в делегировании/согласовании) и предложи конкретный первый шаг.\n" +
              "4. Если уместно — ссылайся на конкретную задачу по названию.\n" +
              "5. Тон — как умный коллега, который видит то, что ты не заметил. Без приветствий, без списков, без markdown.",
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
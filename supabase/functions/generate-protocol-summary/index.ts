// Generate AI draft summary for a protocol based on its tasks
import { blockConsultant } from "../_shared/consultant-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TaskInput {
  title: string;
  description?: string | null;
  assignee?: string | null;
  deadline?: string | null;
  status?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const blocked = await blockConsultant(req, { corsHeaders });
  if (blocked) return blocked;

  try {
    const { protocolName, tasks, scope } = (await req.json()) as {
      protocolName: string;
      tasks: TaskInput[];
      scope: "internal" | "public";
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const taskLines = (tasks || [])
      .slice(0, 80)
      .map((t, i) => {
        const parts = [`${i + 1}. ${t.title}`];
        if (t.assignee) parts.push(`(отв.: ${t.assignee})`);
        if (t.deadline) parts.push(`до ${t.deadline}`);
        if (t.status) parts.push(`[${t.status}]`);
        if (t.description) parts.push(`— ${t.description.slice(0, 200)}`);
        return parts.join(" ");
      })
      .join("\n");

    const audienceHint =
      scope === "public"
        ? "Аудитория: внешняя (партнёры/клиенты). Тон деловой, нейтральный, без внутренних деталей и оценок людей. Без упоминания конкретных ФИО без необходимости."
        : "Аудитория: внутренняя команда. Можно упоминать ответственных по имени, отмечать риски и узкие места.";

    const systemPrompt = `Ты — секретарь встречи. По списку задач протокола напиши краткое деловое саммари на русском.
Структура (3-6 предложений + список):
• 1-2 предложения «Что обсуждали и решили».
• Маркированный список 3-6 ключевых поручений (короткими формулировками).
• 1 предложение про сроки/следующие шаги, если уместно.
${audienceHint}
Не выдумывай факты, опирайся ТОЛЬКО на задачи. Без markdown-заголовков, только обычный текст и маркеры «•».`;

    const userPrompt = `Протокол: «${protocolName}»\n\nЗадачи:\n${taskLines || "(пока нет задач)"}`;

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (resp.status === 429) {
      return new Response(
        JSON.stringify({ error: "Слишком много запросов. Попробуйте позже." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (resp.status === 402) {
      return new Response(
        JSON.stringify({ error: "Закончились кредиты Lovable AI. Пополните баланс в Settings → Workspace → Usage." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const summary: string = data?.choices?.[0]?.message?.content?.trim() ?? "";

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-protocol-summary error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Ты — ассистент для разбора протоколов совещаний на русском языке.
Твоя задача: извлечь из текста структурированный список задач/поручений/договорённостей.

Для каждой строки:
- title: краткая суть (до 120 символов, императивно: "Подготовить...", "Согласовать...")
- description: контекст, цифры, цены, веса, сроки годности, обязательства — всё что не уместилось в title (markdown допускается)
- assignee_hint: ФИО или роль ответственного как в тексте (или null)
- deadline: ISO дата YYYY-MM-DD если явно указана (или null)
- axes: объект с осями-тегами, угаданными из контекста. Возможные ключи:
  - clients: название клиента/контрагента
  - territory: регион/территория
  - site: площадка/БЕ/завод
  - brand: бренд
  - product_category: категория продукта
  - department: отдел
  - event_topic: тема/блок вопроса

Также извлеки общую информацию о встрече:
- meeting_title: название протокола
- meeting_date: дата встречи (YYYY-MM-DD) если явно указана
- participants: список участников
- summary: 1-2 предложения о цели встречи

Если данных нет — возвращай null или пустой массив. Не выдумывай.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string" || text.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: "Слишком короткий текст для разбора" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const tools = [
      {
        type: "function",
        function: {
          name: "extract_protocol",
          description: "Структурированное извлечение протокола встречи",
          parameters: {
            type: "object",
            properties: {
              meeting_title: { type: ["string", "null"] },
              meeting_date: { type: ["string", "null"], description: "ISO YYYY-MM-DD" },
              participants: { type: "array", items: { type: "string" } },
              summary: { type: ["string", "null"] },
              rows: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: ["string", "null"] },
                    assignee_hint: { type: ["string", "null"] },
                    deadline: { type: ["string", "null"], description: "ISO YYYY-MM-DD" },
                    axes: {
                      type: "object",
                      properties: {
                        clients: { type: ["string", "null"] },
                        territory: { type: ["string", "null"] },
                        site: { type: ["string", "null"] },
                        brand: { type: ["string", "null"] },
                        product_category: { type: ["string", "null"] },
                        department: { type: ["string", "null"] },
                        event_topic: { type: ["string", "null"] },
                      },
                      additionalProperties: false,
                    },
                  },
                  required: ["title"],
                  additionalProperties: false,
                },
              },
            },
            required: ["rows"],
            additionalProperties: false,
          },
        },
      },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text.slice(0, 60000) },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "extract_protocol" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Превышен лимит запросов, попробуйте позже." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Закончились кредиты Lovable AI." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway ${aiResp.status}`);
    }

    const data = await aiResp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("AI не вернул структурированный результат");
    }
    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-protocol-text error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

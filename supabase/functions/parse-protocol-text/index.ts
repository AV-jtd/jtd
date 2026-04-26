import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { blockConsultant } from "../_shared/consultant-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildSystemPrompt(today: string, weekday: string): string {
  return `Ты — ассистент для разбора протоколов совещаний на русском языке.
Сегодня: ${today} (${weekday}). Используй это для расчёта относительных дат.

Твоя задача: извлечь из текста структурированный список задач/поручений/договорённостей и максимально точно заполнить ВСЕ поля.

═══════════════════════════════════════════════════════════
ПРАВИЛА ОПРЕДЕЛЕНИЯ ОТВЕТСТВЕННЫХ (assignee_hint) — КРИТИЧНО
═══════════════════════════════════════════════════════════
Ищи ответственного АГРЕССИВНО. Кандидаты:
1. Прямые упоминания: "Иванов сделает...", "поручаю Петрову", "Анна — подготовь..."
2. @упоминания в Telegram: "@ivanov проверь" → assignee_hint = "@ivanov"
3. Роли/должности: "коммерческий директор подготовит", "отдел продаж" → "коммерческий директор"
4. Косвенные: "Маша, твоя задача", "Сергей возьмёт на себя" → "Маша" / "Сергей"
5. Местоимения и контекст: "Я подготовлю отчёт" — если выше есть "Иван говорит:" → "Иван"
6. Forward-сообщения: автор пересланного сообщения часто и есть ответственный, если он формулирует "сделаю", "возьму", "подготовлю"
7. Если в строке нет явного — посмотри на ПРЕДЫДУЩИЕ строки протокола: к кому обращались, кто давал согласие
8. Если задача звучит как "нужно сделать X" без явного исполнителя, но в обсуждении участвовала конкретная роль/человек — поставь его

ФИО пиши как в тексте: "Иван Петров", "Петров И.И.", "Маша", "@username". НЕ выдумывай несуществующих людей.

═══════════════════════════════════════════════════════════
ПРАВИЛА ПАРСИНГА ДЕДЛАЙНОВ (deadline) — КРИТИЧНО
═══════════════════════════════════════════════════════════
Возвращай ВСЕГДА ISO YYYY-MM-DD. Считай относительно сегодня (${today}).

Прямые форматы:
- "до 25 апреля", "к 10.05", "15/05/2026" → конкретная дата
- "25.04" без года → ближайшая будущая дата (если уже прошло — следующий год)

Относительные:
- "сегодня" → ${today}
- "завтра" → +1 день
- "послезавтра" → +2 дня
- "через 3 дня" / "через неделю" / "через 2 недели" / "через месяц" → +N
- "на следующей неделе" → ближайший понедельник + 4 дня (пятница)
- "до конца недели" / "к концу недели" → ближайшая пятница
- "до конца месяца" / "к концу месяца" → последний день текущего месяца
- "до конца квартала" → последний день квартала
- "в понедельник" / "до пятницы" / "к среде" → ближайший такой день недели в будущем
- "в начале мая" → 5-е число месяца, "в середине мая" → 15-е, "в конце мая" → последний день
- "ASAP" / "срочно" / "как можно скорее" → +3 дня

Контекстные подсказки:
- "до встречи 15 мая" → 2026-05-15 (минус 1 день, т.к. дедлайн ДО встречи: 2026-05-14)
- "к следующему совещанию" — если есть дата совещания → за день до неё
- "в течение недели" → +7 дней от сегодня
- "в течение месяца" → +30 дней

Если дедлайна совсем нет в тексте — null. Не выдумывай.

═══════════════════════════════════════════════════════════
ПРАВИЛА ИЗВЛЕЧЕНИЯ ЗАДАЧ
═══════════════════════════════════════════════════════════
Для каждой строки:
- title: краткая суть (до 120 символов, императивно: "Подготовить...", "Согласовать...", "Отправить...")
- description: ВСЁ что не уместилось в title — контекст, цифры, цены, веса, сроки годности, условия, обязательства, ссылки. Markdown допускается. Не выкидывай важную фактуру (числа, проценты, суммы).
- assignee_hint: см. правила выше
- deadline: см. правила выше
- axes: оси-теги из контекста:
  - clients: клиент/контрагент (компания)
  - territory: регион/город/округ (Москва, ЦФО, Урал)
  - site: площадка/БЕ/завод (КМ, ФЗ, АА, конкретный завод)
  - brand: бренд/торговая марка
  - product_category: категория продукта (молочка, мясо, СТМ)
  - department: отдел/функция (продажи, маркетинг, закупки)
  - event_topic: тема/блок вопроса (если протокол идёт блоками — "Запуск нового продукта", "Бюджет Q2")

═══════════════════════════════════════════════════════════
ОБЩАЯ ИНФОРМАЦИЯ О ВСТРЕЧЕ
═══════════════════════════════════════════════════════════
- meeting_title: название протокола (если явно — бери; иначе сформулируй сам по теме обсуждения)
- meeting_date: дата встречи YYYY-MM-DD (если упомянута — бери; иначе null, НЕ ставь сегодня по умолчанию)
- participants: массив ФИО участников
- summary: 1-2 предложения о цели и итогах встречи

Не выдумывай данных. Если поля нет — null или пустой массив. Но ИЩИ ответственных и дедлайны АКТИВНО — это самое важное.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const blocked = await blockConsultant(req, { corsHeaders });
  if (blocked) return blocked;

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

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const weekdayNames = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
    const weekday = weekdayNames[now.getUTCDay()];

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
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: buildSystemPrompt(today, weekday) },
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

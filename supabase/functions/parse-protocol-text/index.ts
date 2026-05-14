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

Твоя задача: извлечь из протокола (текст ИЛИ PDF) структурированный список задач/поручений/договорённостей,
СЕКЦИЙ протокола (если документ разбит на тематические блоки) и максимально точно заполнить ВСЕ поля.
Если на вход подан PDF — анализируй его как документ: учитывай заголовки, эмодзи перед заголовками,
таблицы (| Задача | Ответственные | Срок |), выделения <mark>цветом</mark> (обычно это бренды/клиенты),
маркированные списки «Основные выводы».

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
ВАЖНО: если ответственных НЕСКОЛЬКО (через запятую: "Александра Комарова, Юля, Саша" или с ролями
"Маша (единое окно), Вика Журавлева (эксперт)"), верни МАССИВ assignee_hints со ВСЕМИ именами.
Поле assignee_hint оставь равным ПЕРВОМУ имени для обратной совместимости.

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
СЕКЦИИ ПРОТОКОЛА (sections) — ВАЖНО
═══════════════════════════════════════════════════════════
Если документ структурирован по тематическим блокам (заголовки "## 1. ...", "### 3. ..." с эмодзи 📦🏭📊
или явные нумерованные разделы), верни массив sections:
- topic: название темы без номера и эмодзи (например "Коммуникация с сетью и отправка образцов")
- icon: эмодзи из заголовка, если есть ("📦", "🏭"); иначе null
- summary: 1-3 предложения сути блока (часто это "Основные выводы:" перед таблицей)
- task_indices: массив индексов задач в массиве rows, относящихся к этой секции (нумерация с 0)

Каждой задаче ОБЯЗАТЕЛЬНО проставь axes.event_topic = topic секции, к которой она относится.
Если документ ПЛОСКИЙ (без секций) — верни sections: [].

═══════════════════════════════════════════════════════════
ОБЩАЯ ИНФОРМАЦИЯ О ВСТРЕЧЕ
═══════════════════════════════════════════════════════════
- meeting_title: название протокола (если явно — бери; иначе сформулируй сам по теме обсуждения)
- meeting_date: дата встречи YYYY-MM-DD (если упомянута — бери; иначе null, НЕ ставь сегодня по умолчанию)
- participants: массив ФИО участников
- summary: 1-2 предложения о цели и итогах встречи

Не выдумывай данных. Если поля нет — null или пустой массив. Но ИЩИ ответственных и дедлайны АКТИВНО — это самое важное.`;
}

function buildLivingSystemPrompt(today: string, weekday: string): string {
  return `Ты — ассистент для разбора СВОБОДНЫХ ЗАМЕТОК встречи в формате «Живой документ» на русском языке.
Сегодня: ${today} (${weekday}). Используй для расчёта относительных дат.

Это НЕ формальный протокол с нумерованными разделами и таблицами поручений.
Это «поток сознания» по итогам встречи: тезисы, договорённости вперемешку с обсуждением,
иногда прямая речь, форварды из мессенджера, незаконченные мысли. Твоя задача — навести в нём
смысловой порядок: разложить по 1-6 ТЕМАМ, в каждой теме сформулировать тезисы-выводы и вытащить
конкретные задачи (даже неявные).

═══════════════════════════════════════════════════════════
СЕКЦИИ (sections) — ОБЯЗАТЕЛЬНО, не пустой массив
═══════════════════════════════════════════════════════════
Сгруппируй заметки по СМЫСЛОВЫМ темам, которые формулируешь сам:
- topic: короткий заголовок-существительное (1-5 слов), без эмодзи и нумерации.
  Примеры: «Запуск нового SKU», «Переговоры с Лентой», «Качество котлет», «Маркетинг Q2».
- icon: подходящее эмодзи к теме (🚀, 🤝, ⚖️, 🎯 и т.п.) — обязательно.
- summary: 2-5 коротких тезисов-выводов в формате markdown-буллетов через перенос строки:
  "- Тезис 1\\n- Тезис 2\\n- Тезис 3". Это «выводы по теме», их увидит читатель ДО списка задач.
  Пиши их фактологично: что решили, о чём договорились, что выяснили, какие риски обсудили.
  НЕ дублируй формулировки задач здесь — задачи отдельно.
- task_indices: массив индексов задач (нумерация с 0), относящихся к этой теме.

Минимум 1 секция всегда. Если задач совсем нет — одна секция «Общее» с тезисами по итогам встречи.
Каждой задаче ОБЯЗАТЕЛЬНО проставь axes.event_topic = topic той секции, в которую её положил.
Если задача подходит под несколько тем — выбери основную.

═══════════════════════════════════════════════════════════
ЗАДАЧИ — ИЗВЛЕКАЙ МЯГКО, НО ДЕЙСТВЕННО
═══════════════════════════════════════════════════════════
В свободных заметках задачи редко звучат «поручаю X сделать Y до Z». Чаще:
- «договорились, что подготовим презентацию» → задача «Подготовить презентацию»
- «нужно посмотреть на цены конкурентов» → задача «Проверить цены конкурентов»
- «Маша возьмёт на себя коммуникацию» → задача с assignee_hint = "Маша"
- «к следующей встрече надо закрыть вопрос с НДС» → задача с дедлайном

Для каждой задачи:
- title: императивно, краткая суть (до 120 символов): «Подготовить...», «Согласовать...», «Уточнить...»
- description: контекст из заметок — почему это нужно, какие цифры/детали обсудили. Markdown допускается.
- assignee_hint: имя или роль исполнителя если есть в тексте; assignee_hints[] если несколько.
- deadline: ISO YYYY-MM-DD если упомянут срок (см. правила относительных дат ниже); иначе null.
- axes.event_topic: ОБЯЗАТЕЛЬНО — название темы (точно как в sections[].topic).
- остальные axes (clients/site/brand/...) — заполняй только если они явно фигурируют.

Не выдумывай задач из воздуха. Но если в заметке есть глагол действия и предполагаемый исполнитель —
это задача. Лучше извлечь чуть больше задач, чем упустить.

═══════════════════════════════════════════════════════════
ПРАВИЛА ДЕДЛАЙНОВ (deadline)
═══════════════════════════════════════════════════════════
ISO YYYY-MM-DD относительно ${today}.
- "сегодня"→${today}, "завтра"→+1, "послезавтра"→+2
- "через N дней/недель/месяцев"→+N
- "на следующей неделе"→ближайшая пятница, "до конца недели"→ближайшая пятница
- "до конца месяца"→последний день месяца, "до конца квартала"→последний день квартала
- "в понедельник/до пятницы"→ближайший такой день в будущем
- "ASAP/срочно"→+3 дня
- Если дедлайна нет — null. Не выдумывай.

═══════════════════════════════════════════════════════════
ОБЩАЯ ИНФОРМАЦИЯ
═══════════════════════════════════════════════════════════
- meeting_title: тема встречи (короткое существительное, 3-7 слов). Если не названо — сформулируй сам.
- meeting_date: дата встречи YYYY-MM-DD если упомянута; иначе null.
- participants: массив имён участников встречи (если перечислены).
- summary: оставь null — для living-формата сводка не нужна, всё уйдёт в темы.

Помни: главное здесь — СМЫСЛОВАЯ группировка по темам с тезисами. Задачи вторичны: их может быть мало
или вообще не быть, но темы и тезисы должны быть всегда.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const blocked = await blockConsultant(req, { corsHeaders });
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const text: string | undefined = body.text;
    const pdfBase64: string | undefined = body.pdf_base64;
    const pdfMime: string = body.pdf_mime || "application/pdf";
    const mode: "living" | "formal" = body.mode === "living" ? "living" : "formal";

    const hasText = text && typeof text === "string" && text.trim().length >= 20;
    const hasPdf = pdfBase64 && typeof pdfBase64 === "string" && pdfBase64.length > 100;

    if (!hasText && !hasPdf) {
      return new Response(
        JSON.stringify({ error: "Нужен либо text, либо pdf_base64" }),
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
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    topic: { type: "string" },
                    icon: { type: ["string", "null"] },
                    summary: { type: ["string", "null"] },
                    task_indices: { type: "array", items: { type: "number" } },
                  },
                  required: ["topic", "task_indices"],
                  additionalProperties: false,
                },
              },
              rows: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: ["string", "null"] },
                    assignee_hint: { type: ["string", "null"] },
                    assignee_hints: { type: "array", items: { type: "string" } },
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

    const userContent: any[] = hasPdf
      ? [
          {
            type: "text",
            text:
              "Разбери этот PDF протокол совещания согласно правилам. Извлеки секции, задачи и метаданные.",
          },
          {
            type: "image_url",
            image_url: { url: `data:${pdfMime};base64,${pdfBase64}` },
          },
        ]
      : [{ type: "text", text: (text as string).slice(0, 60000) }];

    const systemPrompt =
      mode === "living"
        ? buildLivingSystemPrompt(today, weekday)
        : buildSystemPrompt(today, weekday);
    const userText =
      mode === "living"
        ? "Это свободные заметки встречи. Сгруппируй по смысловым темам с тезисами-выводами, извлеки задачи (даже неявные)."
        : "Разбери этот PDF протокол совещания согласно правилам. Извлеки секции, задачи и метаданные.";

    const userContentLiving: any[] = hasPdf
      ? [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: `data:${pdfMime};base64,${pdfBase64}` } },
        ]
      : [{ type: "text", text: userText + "\n\n---\n\n" + (text as string).slice(0, 60000) }];

    const finalUserContent = mode === "living" ? userContentLiving : userContent;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // gemini-2.5-pro слишком медленный для больших PDF (>45с — таймаут прокси).
        // flash быстрее в 3-5× и стабильно справляется с tool-calling по нашей схеме.
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: finalUserContent },
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

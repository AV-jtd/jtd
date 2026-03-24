import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODULE_INSTRUCTIONS: Record<string, string> = {
  tasks: `Ты работаешь в модуле «Задачи». Создавай обычные задачи и проекты.`,
  pmo: `Ты работаешь в модуле «PMO» (проектный офис). 
При планировании проектов:
- Создавай чёткую иерархию: проект → подпроекты (этапы) → задачи
- Для каждого этапа продумай реалистичные дедлайны (deadline_offset_days от сегодня)
- Учитывай зависимости: задачи последующих этапов начинаются после предыдущих
- Предлагай вехи (milestones) в описании этапов`,
  npd: `Ты работаешь в модуле «NPD» (New Product Development) — разработка новых продуктов по методологии Stage-Gate.
Модель включает 6 гейтов: G0 (Идея), G1 (Концепция), G2 (Разработка), G3 (Подготовка к запуску), G4 (Запуск), G5 (Анализ).
При планировании NPD проектов:
- Подпроекты = стримы (Продакт, Реклама, RnD, СКК, Производство, Закупки, Продажи)
- Задачи привязываются к конкретному стриму
- Каждый стрим прогрессирует через гейты независимо
- В plan_project используй project_type: "npd"
- Названия подпроектов = только название стрима (без названия проекта)`,
  crm: `Ты работаешь в модуле «CRM» (управление клиентами и продажами).
Воронка продаж включает этапы: Входящие → Отправить КП → Отправить образцы → Получить ОС → Переговоры → Отгрузка.
При создании задач:
- Задачи CRM должны содержать подзадачи-шаги по воронке
- Привязывай задачи к проектам с тегами crm/продажи если такие есть
- При планировании сценариев создавай задачи с шагами по воронке`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, context, action } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const currentModule = context?.module || "tasks";
    const moduleInstructions = MODULE_INSTRUCTIONS[currentModule] || MODULE_INSTRUCTIONS.tasks;

    const projectList = (context?.projects || [])
      .map((p: { id: string; name: string; project_type?: string }) => `- "${p.name}" (id: ${p.id}${p.project_type ? `, тип: ${p.project_type}` : ""})`)
      .join("\n");

    const userList = (context?.users || [])
      .map((u: { id: string; name: string }) => `- "${u.name}" (id: ${u.id})`)
      .join("\n");

    const tagList = (context?.tags || [])
      .map((t: { id: string; name: string }) => `- "${t.name}" (id: ${t.id})`)
      .join("\n");

    const activeProjectInfo = context?.activeProjectId
      ? `\nАктивный проект: "${context.activeProjectName}" (id: ${context.activeProjectId}). Если пользователь не указал проект, привязывай задачи к нему.`
      : "";

    const systemPrompt = `Ты — AI-помощник для управления задачами и проектами в приложении JustTODOit.

${moduleInstructions}

Ты помогаешь пользователю:
1. Быстро ставить задачи из свободного текста (парсишь название, дедлайн, приоритет, проект, ответственного)
2. Планировать проекты — генерировать структуру подпроектов и задач
3. Отвечать на вопросы по управлению проектами

Доступные проекты:
${projectList || "нет проектов"}

Доступные участники:
${userList || "нет участников"}

Доступные теги:
${tagList || "нет тегов"}
${activeProjectInfo}

Текущая дата: ${new Date().toISOString().split("T")[0]}

При парсинге дат:
- "завтра" = +1 день, "послезавтра" = +2, "в пятницу" = ближайшая пятница
- "через неделю" = +7 дней, "через месяц" = +30 дней
- Конкретные даты в формате YYYY-MM-DD

При определении приоритета:
- "срочно", "ASAP", "критично" → 1 (высокий)
- "важно" → 2 (средний)
- "когда будет время", "не срочно" → 3 (низкий)

Всегда отвечай на русском языке. Будь кратким и конкретным.`;

    if (action === "parse_task") {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Разбери следующий текст в структурированную задачу:\n\n"${message}"` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "create_task",
                description: "Создать структурированную задачу из текста пользователя",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Чёткое название задачи" },
                    description: { type: "string", description: "Описание задачи, если есть дополнительный контекст" },
                    deadline: { type: "string", description: "Дедлайн в формате YYYY-MM-DD, или null" },
                    priority: { type: "number", description: "Приоритет: 1=высокий, 2=средний, 3=низкий, null=не указан" },
                    project_id: { type: "string", description: "ID проекта из списка доступных, или null" },
                    project_name: { type: "string", description: "Название проекта, если указан" },
                    assigned_to_id: { type: "string", description: "ID ответственного из списка, или null" },
                    assigned_to_name: { type: "string", description: "Имя ответственного, если указан" },
                    tag_ids: { type: "array", items: { type: "string" }, description: "IDs релевантных тегов" },
                    is_important: { type: "boolean", description: "Отметить как важное" },
                    subtasks: { type: "array", items: { type: "string" }, description: "Список подзадач/шагов" },
                  },
                  required: ["title"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "create_task" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "payment_required" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({ action: "create_task", task: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "no_result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "plan_project") {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Спланируй проект на основе описания:\n\n"${message}"` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "plan_project",
                description: "Создать план проекта со структурой подпроектов и задач",
                parameters: {
                  type: "object",
                  properties: {
                    project_name: { type: "string", description: "Название проекта" },
                    description: { type: "string", description: "Описание проекта" },
                    project_type: { type: "string", description: "Тип проекта: standard, npd, или crm", enum: ["standard", "npd", "crm"] },
                    subprojects: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string", description: "Название подпроекта/стрима/этапа (без префикса проекта)" },
                          tasks: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                title: { type: "string" },
                                deadline_offset_days: { type: "number", description: "Смещение дедлайна от сегодня в днях" },
                                priority: { type: "number" },
                                subtasks: { type: "array", items: { type: "string" } },
                              },
                              required: ["title"],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["name", "tasks"],
                        additionalProperties: false,
                      },
                    },
                    tasks: {
                      type: "array",
                      description: "Задачи на уровне проекта (без подпроекта)",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          deadline_offset_days: { type: "number" },
                          priority: { type: "number" },
                          subtasks: { type: "array", items: { type: "string" } },
                        },
                        required: ["title"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["project_name"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "plan_project" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "payment_required" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({ action: "plan_project", plan: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "no_result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "decompose_task") {
      const { title, description, existingSubtasks } = context;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `Ты — AI-помощник для декомпозиции задач. Разбей задачу на конкретные, выполнимые шаги (подзадачи).
Правила:
- Каждый шаг должен быть конкретным действием (глагол + объект)
- 3-8 шагов оптимально
- Шаги в логическом порядке выполнения
- Не дублируй существующие подзадачи
- Отвечай только через tool call, без текста`,
            },
            {
              role: "user",
              content: `Задача: "${title}"${description ? `\nОписание: ${description}` : ""}${existingSubtasks?.length ? `\nУже есть шаги: ${existingSubtasks.join(", ")}` : ""}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "suggest_subtasks",
                description: "Предложить список подзадач для декомпозиции задачи",
                parameters: {
                  type: "object",
                  properties: {
                    subtasks: {
                      type: "array",
                      items: { type: "string" },
                      description: "Список подзадач — конкретных шагов для выполнения задачи",
                    },
                  },
                  required: ["subtasks"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "suggest_subtasks" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "payment_required" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({ action: "decompose_task", subtasks: parsed.subtasks }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "no_result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "npd_generate_tasks") {
      const { projectName, projectDescription, gateName, streams, existingTasks } = context;

      const existingInfo = existingTasks?.length
        ? `\nУже существующие задачи (НЕ дублируй их):\n${existingTasks.map((t: string) => `- ${t}`).join("\n")}`
        : "";

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `Ты — эксперт по NPD (New Product Development) по методологии Stage-Gate.
Сгенерируй задачи для NPD-проекта по стримам.

Правила:
- Каждая задача привязана к стриму (отделу)
- Задачи должны быть конкретными действиями (глагол + объект)
- Учитывай текущий гейт проекта — задачи должны соответствовать этапу
- 2-4 задачи на стрим — только самые важные
- Не дублируй существующие задачи
- Для каждой задачи предложи deadline_offset_days (дни от сегодня)
- Отвечай только через tool call`,
            },
            {
              role: "user",
              content: `NPD Проект: "${projectName}"${projectDescription ? `\nОписание: ${projectDescription}` : ""}
Текущий гейт: ${gateName || "не определён"}
Стримы: ${streams?.join(", ") || "Продакт, Реклама, RnD, СКК, Производство, Закупки, Продажи"}${existingInfo}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "suggest_npd_tasks",
                description: "Предложить задачи по стримам для NPD проекта",
                parameters: {
                  type: "object",
                  properties: {
                    streams: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          stream_name: { type: "string", description: "Название стрима" },
                          tasks: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                title: { type: "string", description: "Название задачи" },
                                deadline_offset_days: { type: "number", description: "Дни от сегодня до дедлайна" },
                              },
                              required: ["title"],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["stream_name", "tasks"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["streams"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "suggest_npd_tasks" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "payment_required" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({ action: "npd_generate_tasks", streams: parsed.streams }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "no_result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "npd_risk_radar") {
      const { projects } = context;

      const projectsInfo = (projects || []).map((p: any) =>
        `Проект: "${p.name}"${p.description ? ` (${p.description})` : ""}
  Задач: ${p.total_tasks}, Завершено: ${p.completed_tasks}, Просрочено: ${p.overdue_tasks}
  Гейты: ${p.current_gates?.join(", ") || "нет"}
  Стримы: ${(p.streams || []).map((s: any) => `${s.name} (${s.completed}/${s.total})`).join(", ")}`
      ).join("\n\n");

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `Ты — эксперт по NPD (New Product Development) и управлению рисками.
Проанализируй портфель NPD-проектов и выяви горячие точки (риски).

Правила анализа:
- Просроченные задачи = высокий риск
- Стримы без задач или с 0% прогрессом = средний риск
- Дисбаланс прогресса между стримами = средний риск
- Проекты без назначенного гейта = риск
- Будь конкретным: указывай проект и проблему
- Максимум 6 рисков, сортируй по severity (high → low)
- summary = одно предложение о состоянии портфеля (до 80 символов)
- Отвечай только через tool call`,
            },
            {
              role: "user",
              content: `Портфель NPD проектов:\n\n${projectsInfo}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_risks",
                description: "Отчёт о рисках портфеля NPD проектов",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "Краткое резюме состояния портфеля (до 80 символов)" },
                    risks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          project_name: { type: "string", description: "Название проекта" },
                          severity: { type: "string", enum: ["high", "medium", "low"] },
                          issue: { type: "string", description: "Описание проблемы (1-2 предложения)" },
                          recommendation: { type: "string", description: "Рекомендация (1 предложение)" },
                        },
                        required: ["project_name", "severity", "issue", "recommendation"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["summary", "risks"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "report_risks" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "payment_required" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({ summary: parsed.summary, risks: parsed.risks }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "no_result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "map_columns") {
      const { headers: excelHeaders, sampleRows } = context;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `Ты маппишь колонки Excel-файла к полям задачи. Доступные поля:
- title: название задачи (обязательное)
- description: описание
- deadline: дедлайн (дата)
- priority: приоритет (1-3)
- status: статус (done/todo)
- assigned_to: ответственный
- tags: теги
- subtasks: подзадачи
- project: проект
- subproject: подпроект
- type: тип строки (project/subproject/task)

Анализируй и заголовки, и примеры данных для определения типа колонки.`,
            },
            {
              role: "user",
              content: `Заголовки колонок: ${JSON.stringify(excelHeaders)}
Примеры данных (первые 3 строки): ${JSON.stringify(sampleRows)}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "map_columns",
                description: "Маппинг колонок Excel к полям задачи",
                parameters: {
                  type: "object",
                  properties: {
                    mapping: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          excel_column: { type: "string", description: "Оригинальное название колонки Excel" },
                          field: { type: "string", description: "Поле задачи: title, description, deadline, priority, status, assigned_to, tags, subtasks, project, subproject, type, или skip" },
                          confidence: { type: "number", description: "Уверенность маппинга 0-1" },
                        },
                        required: ["excel_column", "field", "confidence"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["mapping"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "map_columns" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "payment_required" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({ action: "map_columns", mapping: parsed.mapping }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "no_result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "map_crm_columns") {
      const { headers: excelHeaders, sampleRows } = context;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            {
              role: "system",
              content: `Ты маппишь колонки Excel-файла к полям CRM-клиента. Доступные поля:
- client_name: название клиента/компании (обязательное)
- contact_name: контактное лицо
- phone: телефон
- email: email
- city: город/регион
- territory: территория/регион продаж
- retail_type: тип розницы (гипермаркет, магазин, HoReCa и т.п.)
- rank: ранг/категория клиента (A, B, C и т.п.)
- manager: менеджер/ответственный
- project: проект/группа
- deadline: дедлайн/срок
- tags: теги (через запятую)
- notes: заметки/комментарии
- skip: пропустить колонку

Анализируй и заголовки, и примеры данных для определения типа колонки. 
Клиент/компания/название — это client_name. Контакт/ФИО контакта — contact_name.`,
            },
            {
              role: "user",
              content: `Заголовки колонок: ${JSON.stringify(excelHeaders)}
Примеры данных (первые 3 строки): ${JSON.stringify(sampleRows)}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "map_crm_columns",
                description: "Маппинг колонок Excel к полям CRM-клиента",
                parameters: {
                  type: "object",
                  properties: {
                    mapping: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          excel_column: { type: "string", description: "Оригинальное название колонки Excel" },
                          field: { type: "string", description: "Поле CRM: client_name, contact_name, phone, email, city, territory, retail_type, rank, manager, project, deadline, tags, notes, или skip" },
                          confidence: { type: "number", description: "Уверенность маппинга 0-1" },
                        },
                        required: ["excel_column", "field", "confidence"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["mapping"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "map_crm_columns" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "payment_required" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({ action: "map_crm_columns", mapping: parsed.mapping }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "no_result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // === SMART ACTION: LLM-based intent detection with all tools ===
    if (action === "smart") {
      // First, try non-streaming with tool_choice auto
      const smartResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt + `\n\nВажные правила:
1. Если пользователь просит СОЗДАТЬ задачу (поставить, добавить, запланировать задачу) — вызови create_task.
2. Если пользователь просит СПЛАНИРОВАТЬ ПРОЕКТ (создать проект, разработать план) — вызови plan_project.
3. Для ВСЕХ остальных запросов — просто отвечай текстом БЕЗ вызова функций. Сюда входят:
   - Вопросы "что ты умеешь?", "помощь", "привет"
   - Вопросы о методологиях (GTD, Agile, Scrum и т.д.)
   - Советы по продуктивности и управлению
   - Любые общие вопросы и беседа
   - Анализ, рекомендации, объяснения

Ты — универсальный помощник. Ты можешь:
- Создавать задачи и проекты через функции
- Отвечать на любые вопросы по управлению проектами, продуктивности, методологиям
- Давать советы и рекомендации
- Объяснять функционал приложения JustTODOit
- Вести свободный диалог

Всегда используй markdown для форматирования ответов.` },
            ...(context?.history || []),
            { role: "user", content: message },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "create_task",
                description: "Создать структурированную задачу. Вызывай ТОЛЬКО когда пользователь ЯВНО просит создать/поставить/добавить конкретную задачу.",
                parameters: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Чёткое название задачи" },
                    description: { type: "string", description: "Описание задачи" },
                    deadline: { type: "string", description: "Дедлайн YYYY-MM-DD или null" },
                    priority: { type: "number", description: "1=высокий 2=средний 3=низкий" },
                    project_id: { type: "string", description: "ID проекта из списка" },
                    project_name: { type: "string", description: "Название проекта" },
                    assigned_to_id: { type: "string", description: "ID ответственного" },
                    assigned_to_name: { type: "string", description: "Имя ответственного" },
                    tag_ids: { type: "array", items: { type: "string" } },
                    is_important: { type: "boolean" },
                    subtasks: { type: "array", items: { type: "string" } },
                  },
                  required: ["title"],
                  additionalProperties: false,
                },
              },
            },
            {
              type: "function",
              function: {
                name: "plan_project",
                description: "Спланировать проект с подпроектами и задачами. Вызывай ТОЛЬКО когда пользователь ЯВНО просит спланировать/создать целый проект.",
                parameters: {
                  type: "object",
                  properties: {
                    project_name: { type: "string" },
                    description: { type: "string" },
                    project_type: { type: "string", enum: ["standard", "npd", "crm"] },
                    subprojects: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          tasks: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                title: { type: "string" },
                                deadline_offset_days: { type: "number" },
                                priority: { type: "number" },
                                subtasks: { type: "array", items: { type: "string" } },
                              },
                              required: ["title"],
                              additionalProperties: false,
                            },
                          },
                        },
                        required: ["name", "tasks"],
                        additionalProperties: false,
                      },
                    },
                    tasks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          deadline_offset_days: { type: "number" },
                          priority: { type: "number" },
                          subtasks: { type: "array", items: { type: "string" } },
                        },
                        required: ["title"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["project_name"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: "auto",
        }),
      });

      if (!smartResponse.ok) {
        if (smartResponse.status === 429) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (smartResponse.status === 402) {
          return new Response(JSON.stringify({ error: "payment_required" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await smartResponse.text();
        console.error("AI gateway error:", smartResponse.status, t);
        return new Response(JSON.stringify({ action: "chat", content: "Произошла временная ошибка. Попробуйте ещё раз через несколько секунд." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const smartData = await smartResponse.json();
      const smartMsg = smartData.choices?.[0]?.message;

      if (smartMsg?.tool_calls?.[0]) {
        const tc = smartMsg.tool_calls[0];
        try {
          const parsed = JSON.parse(tc.function.arguments);
          if (tc.function.name === "create_task") {
            return new Response(JSON.stringify({ action: "create_task", task: parsed }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (tc.function.name === "plan_project") {
            return new Response(JSON.stringify({ action: "plan_project", plan: parsed }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (parseErr) {
          console.error("Tool call parse error:", parseErr);
        }
      }

      // Text response from model (general chat)
      const fallbackContent = smartMsg?.content || "Не удалось обработать запрос. Попробуйте переформулировать.";
      return new Response(JSON.stringify({ action: "chat", content: fallbackContent }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === CONTEXT CHAT: project-aware streaming chat ===
    if (action === "context_chat") {
      const { projectContext, history: chatHistory } = context || {};
      
      let contextInfo = "";
      if (projectContext) {
        const { project, subprojects, tasks, participants, recentMessages } = projectContext;
        if (project) {
          contextInfo += `\n\n📁 Проект: "${project.name}" (тип: ${project.project_type || "standard"})`;
          if (project.description) contextInfo += `\nОписание: ${project.description}`;
        }
        if (subprojects?.length) {
          contextInfo += `\n\n📂 Подпроекты (${subprojects.length}):`;
          subprojects.forEach((sp: any) => {
            contextInfo += `\n- ${sp.name}${sp.taskCount !== undefined ? ` (${sp.completedCount || 0}/${sp.taskCount} выполнено)` : ""}`;
          });
        }
        if (tasks?.length) {
          contextInfo += `\n\n📋 Задачи (${tasks.length}):`;
          tasks.forEach((t: any) => {
            const status = t.is_completed ? "✅" : t.deadline && new Date(t.deadline) < new Date() ? "🔴 просрочена" : "⬜";
            contextInfo += `\n- ${status} "${t.title}"`;
            if (t.deadline) contextInfo += ` [срок: ${t.deadline.split("T")[0]}]`;
            if (t.assigned_to_name) contextInfo += ` → ${t.assigned_to_name}`;
            if (t.priority) contextInfo += ` P${t.priority}`;
            if (t.subtasks?.length) {
              const done = t.subtasks.filter((s: any) => s.is_completed).length;
              contextInfo += ` (шаги: ${done}/${t.subtasks.length})`;
            }
          });
        }
        if (participants?.length) {
          contextInfo += `\n\n👥 Участники: ${participants.map((p: any) => p.name).join(", ")}`;
        }
        if (recentMessages?.length) {
          contextInfo += `\n\n💬 Последние сообщения:`;
          recentMessages.slice(-10).forEach((m: any) => {
            contextInfo += `\n- ${m.author}: ${m.content.slice(0, 100)}`;
          });
        }
      }

      const contextSystemPrompt = `Ты — контекстный AI-помощник проекта в приложении JustTODOit.
У тебя есть полный доступ к данным проекта. Ты можешь:
1. Отвечать на вопросы о статусе проекта, задачах, дедлайнах
2. Анализировать прогресс и выявлять риски
3. Давать рекомендации по управлению проектом
4. Формировать саммари и отчёты

Текущая дата: ${new Date().toISOString().split("T")[0]}
${contextInfo}

Отвечай на русском языке. Используй markdown для форматирования. Будь конкретным — ссылайся на реальные данные проекта.`;

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: contextSystemPrompt },
            ...(chatHistory || []),
            { role: "user", content: message },
          ],
          stream: true,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "payment_required" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      return new Response(response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // Default: chat mode (streaming)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...(context?.history || []),
          { role: "user", content: message },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "payment_required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

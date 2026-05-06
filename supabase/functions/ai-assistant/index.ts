import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { blockConsultant } from "../_shared/consultant-guard.ts";

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

function formatTaskTemplates(templates: { title: string; subtasks: string[] }[] | undefined): string {
  if (!templates?.length) return "";
  const examples = templates.slice(0, 10).map(t =>
    `Задача: "${t.title}"\n  Шаги: ${t.subtasks.map((s: string, i: number) => `${i + 1}. ${s}`).join("; ")}`
  ).join("\n");
  return `\n\n📚 ВАЖНО — Шаблоны из проекта пользователя (используй как образец структуры шагов для похожих задач, адаптируй под контекст):\n${examples}`;
}

interface QuickHints {
  cleanTitle?: string;
  assigneeId?: string | null;
  assigneeLabel?: string | null;
  deadline?: string | null;  // ISO yyyy-mm-dd
  isImportant?: boolean;
  tags?: string[];
}

function formatQuickHints(hints: QuickHints | undefined): string {
  if (!hints) return "";
  const parts: string[] = [];
  if (hints.assigneeId) parts.push(`- Ответственный: id=${hints.assigneeId} (${hints.assigneeLabel || ""})`);
  else if (hints.assigneeLabel) parts.push(`- Упомянут ответственный: "${hints.assigneeLabel}" (не найден в списке участников)`);
  if (hints.deadline) parts.push(`- Дедлайн: ${hints.deadline}`);
  if (hints.isImportant) parts.push(`- Важная задача (флаг !)`);
  if (hints.tags?.length) parts.push(`- Теги: ${hints.tags.join(", ")}`);
  if (!parts.length) return "";
  return `\n\n🎯 ПРЕД-ПАРСИНГ из строки пользователя (используй эти значения, если создаёшь задачу — НЕ перезаписывай их своими догадками):\n${parts.join("\n")}`;
}

/** Apply parsed hints as fallback over LLM tool-call result */
function applyQuickHintsToTask(task: any, hints: QuickHints | undefined) {
  if (!hints || !task) return task;
  if (hints.assigneeId && !task.assigned_to_id) task.assigned_to_id = hints.assigneeId;
  if (hints.assigneeLabel && !task.assigned_to_name) task.assigned_to_name = hints.assigneeLabel;
  if (hints.deadline && !task.deadline) task.deadline = hints.deadline;
  if (hints.isImportant && task.is_important !== true) task.is_important = true;
  return task;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const blocked = await blockConsultant(req, { corsHeaders });
  if (blocked) return blocked;

  try {
    const { message, context, action, quickHints } = await req.json();
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

Всегда отвечай на русском языке. Будь кратким и конкретным.${formatTaskTemplates(context?.taskTemplates)}${formatQuickHints(quickHints)}`;

    if (action === "parse_task") {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
        applyQuickHintsToTask(parsed, quickHints);
        return new Response(JSON.stringify({ action: "create_task", task: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "no_result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "plan_project") {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
      const { title, description, existingSubtasks, taskTemplates } = context;
      const templatesCtx = formatTaskTemplates(taskTemplates);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
- Если есть шаблоны из проекта — повторяй их структуру для аналогичных задач
- Отвечай только через tool call, без текста${templatesCtx}`,
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

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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

    // === CRM Risk Radar ===
    if (action === "crm_risk_radar") {
      const { stageStats, totalActive, totalDone, overdueCount, noDeadlineCount, avgDaysInFunnel } = context;

      const statsInfo = `Воронка CRM:
Активных сделок: ${totalActive}, Завершено: ${totalDone}
Просроченных: ${overdueCount}, Без дедлайна: ${noDeadlineCount}
Средний срок в воронке: ${avgDaysInFunnel != null ? avgDaysInFunnel + " дней" : "нет данных"}
Распределение по этапам: ${(stageStats || []).map((s: any) => `${s.stage}: ${s.count}`).join(", ")}`;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
              content: `Ты — эксперт по CRM и управлению продажами.
Проанализируй воронку продаж и выяви проблемы.

Правила анализа:
- Просроченные сделки = высокий риск
- Сделки без дедлайна = средний риск
- Узкие места воронки (скопление на одном этапе) = средний риск
- Низкая конверсия между этапами = средний риск
- Долгий средний срок в воронке = риск
- Будь конкретным: указывай этап или проблему
- Максимум 5 рисков, сортируй по severity (high → low)
- summary = одно предложение о состоянии воронки (до 80 символов)
- Отвечай только через tool call`,
            },
            {
              role: "user",
              content: statsInfo,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_crm_risks",
                description: "Отчёт о рисках воронки CRM",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "Краткое резюме состояния воронки (до 80 символов)" },
                    risks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          client_or_stage: { type: "string", description: "Этап воронки или категория проблемы" },
                          severity: { type: "string", enum: ["high", "medium", "low"] },
                          issue: { type: "string", description: "Описание проблемы (1-2 предложения)" },
                          recommendation: { type: "string", description: "Рекомендация (1 предложение)" },
                        },
                        required: ["client_or_stage", "severity", "issue", "recommendation"],
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
          tool_choice: { type: "function", function: { name: "report_crm_risks" } },
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

    // === PMO Risk Radar ===
    if (action === "pmo_risk_radar") {
      const { projects } = context;

      const projectsInfo = (projects || []).map((p: any) =>
        `Проект: "${p.name}"${p.description ? ` (${p.description})` : ""}
  Задач: ${p.total_tasks}, Завершено: ${p.completed_tasks}, Просрочено: ${p.overdue_tasks}
  Переносы: ${p.drift_count || 0}, Суммарная задержка: ${p.total_delay_days || 0} дн.
  ${p.milestones ? `Вехи: ${p.milestones.total} (завершено: ${p.milestones.completed}, просрочено: ${p.milestones.overdue})` : ""}`
      ).join("\n\n");

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
              content: `Ты — эксперт по управлению проектами (PMO) и анализу рисков портфеля.
Проанализируй портфель проектов и выяви горячие точки (риски).

Правила анализа:
- Просроченные задачи = высокий риск
- Проекты с большим количеством переносов = средний/высокий риск
- Просроченные вехи = высокий риск
- Низкий прогресс при приближающихся сроках = средний риск
- Проекты без задач = низкий риск (не начат)
- Будь конкретным: указывай проект и проблему
- Максимум 8 рисков, сортируй по severity (high → low)
- summary = одно предложение о состоянии портфеля (до 80 символов)
- Отвечай только через tool call`,
            },
            {
              role: "user",
              content: `Портфель проектов:\n\n${projectsInfo}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_risks",
                description: "Отчёт о рисках портфеля проектов",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "Краткое резюме состояния портфеля (до 80 символов)" },
                    risks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          project_name: { type: "string" },
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
        if (response.status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (response.status === 402) return new Response(JSON.stringify({ error: "payment_required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    // === Protocols Risk Radar ===
    if (action === "protocols_risk_radar") {
      const { protocols } = context;

      const protocolsInfo = (protocols || []).map((p: any) =>
        `Протокол: "${p.name}"${p.is_draft ? " (черновик)" : ""}
  Создан: ${p.created_at ?? "?"}
  Вопросов: ${p.total_tasks}, Закрыто: ${p.completed_tasks}, Просрочено: ${p.overdue_tasks}, Без ответственного: ${p.unassigned_tasks}, Без срока: ${p.undated_tasks}
  Контекст: ${(p.axes || []).join(", ") || "—"}`
      ).join("\n\n");

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
              content: `Ты — эксперт по протоколам совещаний и управлению поручениями.
Проанализируй портфель протоколов и выяви горячие точки.

Правила:
- Просроченные вопросы = высокий риск
- Много вопросов без ответственного или без срока = высокий риск (поручения «зависнут»)
- Старые черновики протоколов (>3 дней без публикации) = средний риск
- Низкая доля закрытых вопросов в старых протоколах = средний риск
- Кросс-протокольный паттерн (один и тот же контекст «висит» в нескольких встречах) = высокий риск
- Будь конкретным: указывай протокол и проблему
- Максимум 8 рисков, сортируй по severity
- summary = одно предложение (до 80 символов)
- Отвечай только через tool call`,
            },
            {
              role: "user",
              content: `Протоколы:\n\n${protocolsInfo}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "report_risks",
                description: "Отчёт о рисках по протоколам",
                parameters: {
                  type: "object",
                  properties: {
                    summary: { type: "string", description: "Краткое резюме (до 80 символов)" },
                    risks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          project_name: { type: "string", description: "Название протокола" },
                          severity: { type: "string", enum: ["high", "medium", "low"] },
                          issue: { type: "string", description: "Проблема (1-2 предложения)" },
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
        if (response.status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (response.status === 402) return new Response(JSON.stringify({ error: "payment_required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    // === PMO Portfolio Summary ===
    if (action === "pmo_portfolio_summary") {
      const { projects } = context;

      const projectsInfo = (projects || []).map((p: any) =>
        `Проект: "${p.name}"${p.description ? ` — ${p.description}` : ""}
  Прогресс: ${p.completed_tasks}/${p.total_tasks} задач
  Просрочено: ${p.overdue_tasks}, Переносы: ${p.drift_count || 0} (${p.total_delay_days || 0} дн.)
  ${p.milestones ? `Вехи: ${p.milestones.completed}/${p.milestones.total}${p.milestones.overdue > 0 ? ` (просрочено: ${p.milestones.overdue})` : ""}` : ""}`
      ).join("\n\n");

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
              content: `Ты — эксперт PMO (проектный офис). Сформируй еженедельную сводку по портфелю проектов.

Структура отчёта:
1. **Общий статус** — одно предложение о состоянии портфеля
2. **Ключевые достижения** — что продвинулось за неделю (2-3 пункта)
3. **Требуют внимания** — проекты с рисками, просрочками, блокерами (2-4 пункта)
4. **Рекомендации** — конкретные действия на следующую неделю (2-3 пункта)

Правила:
- Пиши кратко, по делу, с конкретными цифрами
- Ссылайся на реальные проекты по имени
- Используй эмоджи для акцентов
- Отвечай на русском языке
- Формат: markdown`,
            },
            {
              role: "user",
              content: `Дата отчёта: ${new Date().toISOString().split("T")[0]}\n\nПортфель проектов:\n\n${projectsInfo}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        if (response.status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (response.status === 402) return new Response(JSON.stringify({ error: "payment_required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        return new Response(JSON.stringify({ action: "pmo_portfolio_summary", content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "no_result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "wiki_autofill") {
      const { sectionKey, projectName, projectDescription, tasksInfo, membersInfo, existingContent } = context;

      const sectionLabels: Record<string, string> = {
        description: "Описание проекта",
        goals: "Цели проекта",
        risks: "Риски проекта",
        resources: "Ресурсы и ссылки",
      };

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
              content: `Ты — эксперт по управлению проектами. Сгенерируй содержимое для секции "${sectionLabels[sectionKey] || sectionKey}" в базе знаний проекта.

Правила:
- Анализируй название проекта, описание, задачи и команду
- Пиши кратко, структурированно, по делу
- Используй маркированные списки (каждый пункт с новой строки, начинай с "• ")
- Для секции "description": 2-4 предложения о сути проекта, его целях и контексте
- Для секции "goals": 3-6 конкретных, измеримых целей (SMART формат где возможно)
- Для секции "risks": 3-6 рисков с оценкой вероятности и влияния
- Для секции "resources": предложи какие ресурсы/ссылки стоит добавить (шаблоны, доки, инструменты)
- Если есть существующий контент — улучши и дополни его, а не перезаписывай
- Отвечай на русском языке`,
            },
            {
              role: "user",
              content: `Проект: "${projectName}"${projectDescription ? `\nОписание: ${projectDescription}` : ""}
Задачи проекта:
${tasksInfo || "нет задач"}
Команда: ${membersInfo || "не указана"}
${existingContent ? `\nТекущий контент секции:\n${existingContent}` : ""}

Сгенерируй содержимое для секции: ${sectionLabels[sectionKey] || sectionKey}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "fill_section",
                description: "Заполнить секцию базы знаний проекта",
                parameters: {
                  type: "object",
                  properties: {
                    content: { type: "string", description: "Сгенерированный текст для секции" },
                  },
                  required: ["content"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "fill_section" } },
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
        return new Response(JSON.stringify({ action: "wiki_autofill", content: parsed.content }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "no_result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "map_columns") {
      const { headers: excelHeaders, sampleRows } = context;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
- description: описание / примечание
- start_at: дата начала / постановки задачи
- deadline: ПЛАНОВАЯ дата исполнения / срок
- completed_at: ФАКТИЧЕСКАЯ дата исполнения / дата закрытия / дата выполнения. ВАЖНО: НЕ путай с deadline!
- is_completed: статус выполнения (исполнение в срок / выполнено / готово / done)
- priority: приоритет (1-3, или "высокий/средний/низкий")
- assigned_to: ОДИН основной ответственный / исполнитель / выполняет
- participants_informed: информируемые (мульти, через запятую/точку с запятой)
- participants_support: поддержка / соисполнители / помогают (мульти)
- tags: теги
- subtasks: подзадачи / шаги
- topic: тема / блок вопросов / категория задачи (создаст тег с этим значением)
- project: проект
- subproject: подпроект / этап
- type: тип строки (project/subproject/task)
- external_ref: внешний номер / № п/п / ID задачи

ПРАВИЛА:
1. Колонка "ДАТА фактического исполнения", "Дата закрытия", "Дата выполнения" → completed_at, НЕ deadline
2. Колонка "плановая ДАТА исполнения", "Срок", "Дедлайн" → deadline
3. Колонка "Информируемый", "Информировать", "CC" → participants_informed
4. Колонка "Выполняет", "Ответственный", "Исполнитель" → assigned_to
5. Колонка "Блок вопросов", "Тема", "Категория" → topic (НЕ subtasks!)
6. Колонка "№ п/п", "№", "Номер" → external_ref (если значения — числа/коды)
7. Если в примере встречается "нет", "—", "-", "н/д" — это пустые значения, не путай с реальными данными
8. Анализируй и заголовки, и примеры данных для определения типа колонки.`,
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
                          field: { type: "string", description: "Поле задачи: title, description, start_at, deadline, completed_at, is_completed, priority, assigned_to, participants_informed, participants_support, tags, subtasks, topic, project, subproject, type, external_ref, или skip" },
                          confidence: { type: "number", description: "Уверенность маппинга 0-1. Ставь <0.7 если не уверен — пользователь проверит вручную" },
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

    if (action === "map_stm_columns") {
      const { headers: excelHeaders, sampleRows, stages, flow } = context;
      const stagesList = (stages || []).map((s: any) => `- ${s.key}: ${s.title} (${s.description || ""})`).join("\n");

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
              content: `Ты маппишь колонки Excel-файла со списком SKU (товаров СТМ) к полям проекта-SKU в системе.

Поток: "${flow}" (${flow === "in" ? "ввод нового SKU" : "вывод SKU"}).

Доступные ЭТАПЫ воркфлоу (значение даты в ячейке = дата завершения этапа):
${stagesList}

Доступные META-поля SKU:
- title: название SKU (рабочее наименование, продукт). ОБЯЗАТЕЛЬНО.
- sku_code_1c: код 1С / артикул
- brand: торговая марка / ТМ
- purpose: цель ввода (Новинка, Замена, etc)
- weight_kg: вес в кг (число)
- package_type: тип упаковки (Лоток П-1610...)
- target_price: согласованная цена (число)
- shelf_life: сроки годности
- barcode: штрихкод (ШК)
- plu: тарный/внутренний ШК сети
- comment: комментарий
- external_ref: № п/п
- skip: колонка не нужна

ПРАВИЛА:
1. Колонки с ДАТАМИ (значения = даты или текст со словами «отправлены», «согласовано», «принято») → подбирай из списка stage_key выше.
2. «Запрос на образцы» → sample_request, «Отправка образцов» → sample_send, «Дегустация» → tasting_1, «Калькуляторы» / «Калькуляц» / «цена» → calc_initial или calc_final, «Доработка» → rework, «Утверждение» / «Принято сетью» → approval, «Открытие ветки» / «1С» → branch_open, «Производство» / «Произв отработка» / «Пром отработка» → production_run, «Макет» / «Этикетка» / «ШК» / «Дизайн упаковки» / «Согласование макета» → label_design, «Релиз» / «Отгрузка» / «Приказ» → order_release.
3. Для flow="out": «Уведомление» → notify, «Распродажа» / «Остатки» → sell_off, «Закрытие» → close.
4. «Наименование», «Рабочее наименование», «Продукт» → title.
5. «ТМ» → brand. «Цель ввода» → purpose. «Вес, кг» → weight_kg. «Тип упаковки» → package_type. «Цена...» (без слова дата) → target_price. «Сроки годности» → shelf_life. «ШК» → barcode (если первый), второй ШК (тарный/сети) → plu. «код 1С» → sku_code_1c. «№ п/п» → external_ref. «Комментарии» → comment.
6. Если колонка не подходит — field="skip".
7. confidence < 0.7 если не уверен.
8. КАЖДОЙ колонке нужен ровно один маппинг.`,
            },
            {
              role: "user",
              content: `Заголовки колонок: ${JSON.stringify(excelHeaders)}
Примеры данных (3 строки): ${JSON.stringify(sampleRows)}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "map_stm_columns",
                description: "Маппинг Excel → SKU поля и этапы STM",
                parameters: {
                  type: "object",
                  properties: {
                    mapping: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          excel_column: { type: "string" },
                          field: { type: "string", description: "stage_key из списка ИЛИ meta-поле ИЛИ skip" },
                          confidence: { type: "number" },
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
          tool_choice: { type: "function", function: { name: "map_stm_columns" } },
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
        console.error("AI gateway map_stm_columns error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({ action: "map_stm_columns", mapping: parsed.mapping }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "no_result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "map_crm_columns") {
      const { headers: excelHeaders, sampleRows } = context;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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


    // === BULK GENERATE TASKS for existing project ===
    if (action === "bulk_generate_tasks") {
      const { projectName: bulkProjectName, projectDescription: bulkDesc, existingTasks: bulkExisting, subprojects: bulkSubprojects, users: bulkUsers, taskTemplates: bulkTemplates } = context;

      const existingInfo = bulkExisting?.length
        ? `\nУже существующие задачи (НЕ дублируй):\n${bulkExisting.map((t: string) => `- ${t}`).join("\n")}`
        : "";

      const subprojectInfo = bulkSubprojects?.length
        ? `\nПодпроекты: ${bulkSubprojects.join(", ")}`
        : "";

      const usersInfo = bulkUsers?.length
        ? `\nУчастники: ${bulkUsers.map((u: any) => u.name).join(", ")}`
        : "";

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
              content: `Ты — эксперт по управлению проектами. Сгенерируй список задач для проекта на основе описания пользователя.

Правила:
- Группируй задачи по этапам/категориям (groups)
- Каждая задача конкретная и выполнимая (глагол + объект)
- deadline_offset_days — через сколько дней от сегодня дедлайн
- priority: 1=высокий, 2=средний, 3=низкий (необязательно)
- assignee_name — ИМЯ ответственного из списка участников. ОБЯЗАТЕЛЬНО распредели задачи между участниками если их несколько. Бери имя ровно как в списке (первое слово).
- Если есть подпроекты, используй их названия как группы
- НЕ дублируй существующие задачи
- Если в шаблонах есть похожие задачи — копируй их структуру подзадач
- 5-20 задач оптимально
- Отвечай только через tool call

Проект: "${bulkProjectName}"${bulkDesc ? `\nОписание: ${bulkDesc}` : ""}${existingInfo}${subprojectInfo}${usersInfo}${formatTaskTemplates(bulkTemplates)}`,
            },
            {
              role: "user",
              content: message,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_bulk_tasks",
                description: "Сгенерировать пакет задач для проекта",
                parameters: {
                  type: "object",
                  properties: {
                    groups: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string", description: "Название группы/этапа" },
                          tasks: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                title: { type: "string" },
                                deadline_offset_days: { type: "number" },
                                priority: { type: "number" },
                                assignee_name: { type: "string", description: "Имя ответственного из списка участников (первое слово как в списке). Опционально, но желательно распределить между всеми участниками." },
                                subtasks: { type: "array", items: { type: "string" }, description: "Подзадачи/шаги (используй шаблоны из проекта)" },
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
                  },
                  required: ["groups"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "generate_bulk_tasks" } },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (response.status === 402) return new Response(JSON.stringify({ error: "payment_required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const t = await response.text();
        console.error("AI gateway error:", response.status, t);
        throw new Error("AI gateway error");
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({ groups: parsed.groups }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "no_result" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === GANTT ANALYZE: deep context-aware analysis for Gantt chart ===
    if (action === "gantt_analyze") {
      const { projects, workload, milestones: ctxMilestones, dependencies: ctxDeps,
        totalTasks, completedTasks, overdueTasks, tasksWithoutDeadline, tasksWithoutAssignee,
        taskTemplates: tplText, users: ctxUsers, history: ganttHistory } = context || {};

      let ganttContextBlock = `📊 Статистика:
- Всего задач: ${totalTasks || 0}, Завершено: ${completedTasks || 0}, Просрочено: ${overdueTasks || 0}
- Без дедлайна: ${tasksWithoutDeadline || 0}, Без ответственного: ${tasksWithoutAssignee || 0}`;

      if (projects?.length) {
        ganttContextBlock += `\n\n📁 Проекты/стримы:`;
        projects.forEach((p: any) => {
          ganttContextBlock += `\n- "${p.name}": ${p.completed}/${p.total} задач${p.overdue > 0 ? `, ⚠️ просрочено: ${p.overdue}` : ""}${p.parent ? ` (часть: ${p.parent})` : ""}`;
        });
      }

      if (workload?.length) {
        ganttContextBlock += `\n\n👥 Загрузка команды:`;
        workload.forEach((w: any) => {
          ganttContextBlock += `\n- ${w.name}: ${w.total} задач (✅${w.completed}, 🔴${w.overdue}, ❓${w.noDeadline} без срока)`;
        });
      }

      if (ctxMilestones?.length) {
        ganttContextBlock += `\n\n◆ Вехи:`;
        ctxMilestones.forEach((m: any) => {
          ganttContextBlock += `\n- "${m.name}" → ${m.date?.split("T")[0] || "без даты"} [${m.status}]${m.project ? ` в «${m.project}»` : ""}`;
        });
      }

      if (ctxDeps?.length) {
        ganttContextBlock += `\n\n🔗 Зависимости (${ctxDeps.length}): ${ctxDeps.slice(0, 15).map((d: any) => `${d.type} lag:${d.lag}д`).join(", ")}`;
      }

      if (tplText) {
        ganttContextBlock += `\n${tplText}`;
      }

      const ganttSystemPrompt = `Ты — эксперт PMO и аналитик проектов в диаграмме Ганта приложения JustTODOit.

Ты глубоко понимаешь:
- Загрузку команды и оптимальное распределение задач
- Критический путь через цепочки зависимостей
- Шаблоны задач проекта (learning from patterns)
- Анализ рисков (просрочки, отсутствие дедлайнов/ответственных, дисбаланс)
- Оптимизацию сроков и параллелизацию

Правила:
- Пиши конкретно, с цифрами и именами
- Используй markdown: заголовки ##, списки, **жирный** для акцентов
- Давай actionable рекомендации, а не общие советы
- Если видишь шаблоны в задачах — учитывай их при генерации рекомендаций
- Всегда на русском

${ganttContextBlock}

Доступные участники: ${(ctxUsers || []).map((u: any) => u.name).join(", ") || "не указаны"}
Текущая дата: ${new Date().toISOString().split("T")[0]}`;

      const ganttResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: ganttSystemPrompt },
            ...(ganttHistory || []),
            { role: "user", content: message },
          ],
        }),
      });

      if (!ganttResponse.ok) {
        if (ganttResponse.status === 429) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (ganttResponse.status === 402) return new Response(JSON.stringify({ error: "payment_required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error("AI gateway error");
      }

      const ganttData = await ganttResponse.json();
      const ganttContent = ganttData.choices?.[0]?.message?.content;
      if (ganttContent) {
        return new Response(JSON.stringify({ action: "gantt_analyze", content: ganttContent }), {
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
      const smartResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
            applyQuickHintsToTask(parsed, quickHints);
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

    // === CONTEXT CHAT: project-aware or general streaming chat ===
    if (action === "context_chat") {
      const { projectContext, history: chatHistory } = context || {};
      
      let contextInfo = "";
      if (projectContext?.mode === "general") {
        // Cross-project general assistant
        const { projects, totalTasks } = projectContext;
        if (projects?.length) {
          contextInfo += `\n\n📊 Портфель проектов (${projects.length}), всего задач: ${totalTasks}:`;
          projects.forEach((p: any) => {
            const progress = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
            contextInfo += `\n- "${p.name}" (${p.project_type || "standard"}): ${p.completed}/${p.total} задач (${progress}%)`;
            if (p.overdue > 0) contextInfo += ` ⚠️ просрочено: ${p.overdue}`;
          });
        }
      } else if (projectContext) {
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
        if (projectContext.milestones?.length) {
          contextInfo += `\n\n🏁 Вехи (${projectContext.milestones.length}):`;
          projectContext.milestones.forEach((m: any) => {
            const status = m.status === "completed" ? "✅" : m.planned_date && new Date(m.planned_date) < new Date() ? "🔴" : "⬜";
            contextInfo += `\n- ${status} "${m.name}" [план: ${m.planned_date}]${m.actual_date ? ` [факт: ${m.actual_date}]` : ""}`;
          });
        }
        if (projectContext.dependencies?.length) {
          contextInfo += `\n\n🔗 Зависимости (${projectContext.dependencies.length}):`;
          projectContext.dependencies.forEach((d: any) => {
            contextInfo += `\n- "${d.predecessor}" → "${d.successor}" (${d.type}${d.lag_days ? `, лаг: ${d.lag_days}д` : ""})`;
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

      const isGeneralMode = projectContext?.mode === "general";
      const contextSystemPrompt = isGeneralMode
        ? `Ты — кросс-проектный AI-помощник в приложении JustTODOit.
У тебя есть доступ к данным всех проектов пользователя. Ты можешь:
1. Давать обзор портфеля проектов
2. Сравнивать проекты между собой
3. Выявлять просроченные задачи по всем проектам
4. Рекомендовать приоритеты и фокус
5. Отвечать на общие вопросы по управлению

Текущая дата: ${new Date().toISOString().split("T")[0]}
${contextInfo}

Отвечай на русском языке. Используй markdown для форматирования. Будь конкретным — ссылайся на реальные данные.`
        : `Ты — контекстный ИИ-помощник проекта в приложении JustTODOit.
У тебя есть полный доступ к данным проекта, включая задачи, вехи (milestones), зависимости между задачами, участников и историю чата. Ты можешь:
1. Отвечать на вопросы о статусе проекта, задачах, дедлайнах
2. Анализировать прогресс и выявлять риски
3. Анализировать вехи и их выполнение
4. Учитывать зависимости между задачами при рекомендациях
5. Давать рекомендации по управлению проектом
6. Формировать саммари и отчёты

Текущая дата: ${new Date().toISOString().split("T")[0]}
${contextInfo}

Отвечай на русском языке. Используй markdown для форматирования. Будь конкретным — ссылайся на реальные данные проекта.`;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: context?.systemPrompt || systemPrompt },
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

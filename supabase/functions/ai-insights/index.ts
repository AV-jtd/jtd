import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Get user from JWT
    const authHeader = req.headers.get("authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Decode JWT to get user_id
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch user's tasks (active)
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, deadline, is_completed, is_important, priority, assigned_to, user_id, group_id, completed_at, created_at, updated_at")
      .or(`user_id.eq.${userId},assigned_to.eq.${userId}`)
      .order("deadline", { ascending: true })
      .limit(200);

    // Fetch projects
    const { data: groups } = await supabase
      .from("task_groups")
      .select("id, name, parent_id")
      .eq("user_id", userId)
      .is("parent_id", null)
      .limit(50);

    // Fetch profiles for assignee names
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .limit(100);

    const profileMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p.display_name || "Без имени"; });

    const activeTasks = (tasks || []).filter((t: any) => !t.is_completed);
    const completedRecently = (tasks || []).filter((t: any) => {
      if (!t.is_completed || !t.completed_at) return false;
      const completedDate = new Date(t.completed_at);
      const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
      return completedDate >= threeDaysAgo;
    });

    const overdue = activeTasks.filter((t: any) => t.deadline && new Date(t.deadline) < today);
    const dueThisWeek = activeTasks.filter((t: any) => {
      if (!t.deadline) return false;
      const d = new Date(t.deadline);
      return d >= today && d <= new Date(weekFromNow);
    });
    const highPriority = activeTasks.filter((t: any) => t.priority === 1 || t.is_important);
    const delegatedToMe = activeTasks.filter((t: any) => t.assigned_to === userId && t.user_id !== userId);
    const delegatedByMe = activeTasks.filter((t: any) => t.user_id === userId && t.assigned_to && t.assigned_to !== userId);
    const noDeadline = activeTasks.filter((t: any) => !t.deadline);

    // Build context for AI — include task_id and group_id so AI can reference them
    let context = `📊 Сводка на ${todayStr}:\n`;
    context += `- Всего активных задач: ${activeTasks.length}\n`;
    context += `- Выполнено за 3 дня: ${completedRecently.length}\n`;
    context += `- 🔴 Просрочено: ${overdue.length}\n`;
    context += `- 📅 На этой неделе: ${dueThisWeek.length}\n`;
    context += `- ⭐ Важных/приоритетных: ${highPriority.length}\n`;
    context += `- 📥 Поручено мне: ${delegatedToMe.length}\n`;
    context += `- 📤 Поручено мной: ${delegatedByMe.length}\n`;
    context += `- ⚠️ Без дедлайна: ${noDeadline.length}\n`;
    context += `- 📂 Проектов: ${(groups || []).length}\n`;

    if (overdue.length > 0) {
      context += `\n🔴 Просроченные задачи:\n`;
      overdue.slice(0, 10).forEach((t: any) => {
        const days = Math.floor((today.getTime() - new Date(t.deadline).getTime()) / (1000 * 60 * 60 * 24));
        const assignee = t.assigned_to ? profileMap[t.assigned_to] : null;
        context += `- "${t.title}" [task_id:${t.id}]${t.group_id ? ` [group_id:${t.group_id}]` : ""} (просрочена на ${days} дн.${assignee ? `, → ${assignee}` : ""})\n`;
      });
    }

    if (dueThisWeek.length > 0) {
      context += `\n📅 Ближайшие дедлайны (7 дней):\n`;
      dueThisWeek.slice(0, 10).forEach((t: any) => {
        const d = new Date(t.deadline);
        const dayLabel = d.toISOString().split("T")[0];
        const assignee = t.assigned_to ? profileMap[t.assigned_to] : null;
        context += `- "${t.title}" [task_id:${t.id}]${t.group_id ? ` [group_id:${t.group_id}]` : ""} → ${dayLabel}${t.priority === 1 ? " ⚡" : ""}${assignee ? ` → ${assignee}` : ""}\n`;
      });
    }

    if (highPriority.length > 0) {
      context += `\n⭐ Приоритетные:\n`;
      highPriority.slice(0, 5).forEach((t: any) => {
        context += `- "${t.title}" [task_id:${t.id}]${t.group_id ? ` [group_id:${t.group_id}]` : ""}${t.deadline ? ` [${new Date(t.deadline).toISOString().split("T")[0]}]` : ""}\n`;
      });
    }

    if (delegatedToMe.length > 0) {
      context += `\n📥 Новые поручения мне:\n`;
      delegatedToMe.slice(0, 5).forEach((t: any) => {
        const from = profileMap[t.user_id] || "?";
        context += `- "${t.title}" [task_id:${t.id}]${t.group_id ? ` [group_id:${t.group_id}]` : ""} от ${from}${t.deadline ? ` [${new Date(t.deadline).toISOString().split("T")[0]}]` : ""}\n`;
      });
    }

    if (delegatedByMe.length > 0) {
      context += `\n📤 Мои поручения другим:\n`;
      delegatedByMe.slice(0, 5).forEach((t: any) => {
        const to = profileMap[t.assigned_to!] || "?";
        context += `- "${t.title}" [task_id:${t.id}]${t.group_id ? ` [group_id:${t.group_id}]` : ""} → ${to}${t.deadline ? ` [${new Date(t.deadline).toISOString().split("T")[0]}]` : ""}\n`;
      });
    }

    // Call AI for insights
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
            content: `Ты — проактивный AI-помощник для управления задачами. Твоя задача — дать пользователю краткий, полезный дайджест на день.

Правила:
1. Начни с самого важного: что горит, что нужно сделать сегодня
2. Выдели 1-3 конкретных рекомендации (что именно сделать)
3. Если есть просрочки — подчеркни это мягко, но чётко
4. Похвали за выполненные задачи, если они есть
5. Предложи фокус дня: одну главную задачу, на которой стоит сконцентрироваться
6. Используй эмодзи для визуального разделения
7. Будь кратким! Максимум 200 слов
8. НЕ ИСПОЛЬЗУЙ markdown форматирование (никаких **, *, #, \`, []() и т.д.). Пиши обычный текст без разметки.
9. Тон — дружелюбный, мотивирующий, но конкретный
10. НЕ повторяй просто список задач — анализируй и дай рекомендации
11. КРИТИЧЕСКИ ВАЖНО: В urgentItems ОБЯЗАТЕЛЬНО указывай task_id и group_id из контекста [task_id:UUID] и [group_id:UUID]. Копируй UUID ТОЧНО как есть. Каждый пункт urgentItems ДОЛЖЕН содержать task_id если упоминается задача. Без task_id пользователь не сможет перейти к задаче!
12. Для focusOfDay ОБЯЗАТЕЛЬНО укажи focusTaskId или focusGroupId — UUID из контекста.
13. Не включай [task_id:...] или [group_id:...] в текст — передавай их ТОЛЬКО через поля task_id и group_id в JSON.

Если задач мало (< 5) — предложи спланировать день/неделю.
Если всё в порядке — отметь это и предложи стратегический фокус.`,
          },
          {
            role: "user",
            content: `Вот моя текущая ситуация с задачами:\n\n${context}\n\nДай мне краткий дайджест и рекомендации на сегодня.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "daily_insights",
              description: "Сформировать проактивный дайджест дня для пользователя",
              parameters: {
                type: "object",
                properties: {
                  greeting: { type: "string", description: "Краткое приветствие (1 предложение, с эмодзи)" },
                  urgentItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        emoji: { type: "string", description: "Эмодзи для пункта (🔴, ⚡, 📅, etc)" },
                        text: { type: "string", description: "Краткий текст пункта" },
                        task_id: { type: "string", description: "UUID задачи из контекста [task_id:...], если упоминается конкретная задача. Копируй UUID точно." },
                        group_id: { type: "string", description: "UUID проекта из контекста [group_id:...], если задача принадлежит проекту. Копируй UUID точно." },
                      },
                      required: ["emoji", "text"],
                    },
                    description: "1-4 срочных/важных пункта на которые стоит обратить внимание. Включай task_id и group_id где возможно.",
                  },
                  focusOfDay: { type: "string", description: "Рекомендованный фокус дня (1 предложение)" },
                  focusTaskId: { type: "string", description: "UUID задачи для фокуса дня из контекста [task_id:...], если фокус на конкретной задаче" },
                  focusGroupId: { type: "string", description: "UUID проекта для фокуса дня из контекста [group_id:...], если фокус на проекте" },
                  tips: {
                    type: "array",
                    items: { type: "string" },
                    description: "1-2 конкретных совета или рекомендации",
                  },
                  motivation: { type: "string", description: "Мотивирующее завершение (1 предложение, с эмодзи)" },
                  stats: {
                    type: "object",
                    properties: {
                      active: { type: "number" },
                      overdue: { type: "number" },
                      dueThisWeek: { type: "number" },
                      completedRecently: { type: "number" },
                    },
                    required: ["active", "overdue", "dueThisWeek", "completedRecently"],
                    additionalProperties: false,
                  },
                },
                required: ["greeting", "urgentItems", "focusOfDay", "motivation", "stats"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "daily_insights" } },
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
      const insights = JSON.parse(toolCall.function.arguments);

      const allContextTasks = [...overdue, ...dueThisWeek, ...highPriority, ...delegatedToMe, ...delegatedByMe];
      const uniqueTasks = Array.from(new Map(allContextTasks.map((task: any) => [task.id, task])).values());

      const TASK_ID_RE = /\[task_id:([0-9a-f-]{36})\]/gi;
      const GROUP_ID_RE = /\[group_id:([0-9a-f-]{36})\]/gi;

      const extractAndClean = (text?: string) => {
        if (!text) return { clean: "", task_id: undefined as string | undefined, group_id: undefined as string | undefined };
        let task_id: string | undefined;
        let group_id: string | undefined;
        const taskMatch = TASK_ID_RE.exec(text);
        if (taskMatch) task_id = taskMatch[1];
        TASK_ID_RE.lastIndex = 0;
        const groupMatch = GROUP_ID_RE.exec(text);
        if (groupMatch) group_id = groupMatch[1];
        GROUP_ID_RE.lastIndex = 0;
        const clean = text.replace(TASK_ID_RE, "").replace(GROUP_ID_RE, "").replace(/\s{2,}/g, " ").trim();
        return { clean, task_id, group_id };
      };

      const resolveIdsFromText = (text?: string) => {
        if (!text) return { task_id: undefined, group_id: undefined };
        const extracted = extractAndClean(text);
        if (extracted.task_id || extracted.group_id) return { task_id: extracted.task_id, group_id: extracted.group_id };
        const normalized = text.toLowerCase();
        const matchedTask = uniqueTasks.find((task: any) => normalized.includes(task.title.toLowerCase()));
        return {
          task_id: matchedTask?.id,
          group_id: matchedTask?.group_id ?? undefined,
        };
      };

      insights.urgentItems = (insights.urgentItems || []).map((item: any) => {
        const extracted = extractAndClean(item.text);
        const task_id = item.task_id || extracted.task_id;
        const group_id = item.group_id || extracted.group_id;
        const text = extracted.clean || item.text;
        if (task_id || group_id) return { ...item, text, task_id, group_id };
        const fallback = resolveIdsFromText(item.text);
        return { ...item, text, ...fallback };
      });

      // Clean focusOfDay text too
      const focusExtracted = extractAndClean(insights.focusOfDay);
      insights.focusOfDay = focusExtracted.clean || insights.focusOfDay;

      if (!insights.focusTaskId && !insights.focusGroupId) {
        insights.focusTaskId = focusExtracted.task_id;
        insights.focusGroupId = focusExtracted.group_id;
        if (!insights.focusTaskId && !insights.focusGroupId) {
          const fallbackFocus = resolveIdsFromText(insights.focusOfDay);
          insights.focusTaskId = fallbackFocus.task_id;
          insights.focusGroupId = fallbackFocus.group_id;
        }
      }

      return new Response(JSON.stringify({ insights }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "no_result" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

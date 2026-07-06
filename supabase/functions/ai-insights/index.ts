import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { blockConsultant } from "../_shared/consultant-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const blocked = await blockConsultant(req, { corsHeaders });
  if (blocked) return blocked;

  try {
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");

    const authHeader = req.headers.get("authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    // Parse optional projectId from body
    let projectId: string | null = null;
    try {
      const body = await req.json();
      projectId = body?.projectId || null;
    } catch { /* no body = global insights */ }

    const userId = user.id;
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // If projectId provided, find project + children group IDs
    let projectGroupIds: string[] | null = null;
    let projectName = "";
    if (projectId) {
      const { data: projectGroup } = await supabase
        .from("task_groups")
        .select("id, name")
        .eq("id", projectId)
        .single();
      projectName = projectGroup?.name || "Проект";

      const { data: childGroups } = await supabase
        .from("task_groups")
        .select("id")
        .eq("parent_id", projectId);

      projectGroupIds = [projectId, ...(childGroups || []).map((g: any) => g.id)];
    }

    // Fetch tasks — scoped to project or global
    let tasksQuery = supabase
      .from("tasks")
      .select("id, title, deadline, is_completed, is_important, priority, assigned_to, user_id, group_id, completed_at, created_at, updated_at, original_deadline")
      .order("deadline", { ascending: true })
      .limit(200);

    if (projectGroupIds) {
      tasksQuery = tasksQuery.in("group_id", projectGroupIds);
    } else {
      tasksQuery = tasksQuery.or(`user_id.eq.${userId},assigned_to.eq.${userId}`);
    }

    const { data: tasks } = await tasksQuery;

    // Fetch subtasks for all tasks
    const taskIds = (tasks || []).map((t: any) => t.id);
    let allSubtasks: any[] = [];
    if (taskIds.length > 0) {
      // Fetch in chunks of 100
      for (let i = 0; i < taskIds.length; i += 100) {
        const chunk = taskIds.slice(i, i + 100);
        const { data: subs } = await supabase
          .from("subtasks")
          .select("id, task_id, title, is_completed, deadline, assigned_to")
          .in("task_id", chunk);
        if (subs) allSubtasks = allSubtasks.concat(subs);
      }
    }

    // Build subtask analytics
    const activeSubtasks = allSubtasks.filter((s: any) => !s.is_completed);
    const overdueSubtasks = activeSubtasks.filter((s: any) => s.deadline && new Date(s.deadline) < today);
    const subtasksNoDeadline = activeSubtasks.filter((s: any) => !s.deadline);
    const subtasksNoAssignee = activeSubtasks.filter((s: any) => !s.assigned_to);
    const subtasksAssignedToMe = activeSubtasks.filter((s: any) => s.assigned_to === userId);

    // Build subtask map per task
    const subtaskMap: Record<string, { total: number; completed: number }> = {};
    allSubtasks.forEach((s: any) => {
      if (!subtaskMap[s.task_id]) subtaskMap[s.task_id] = { total: 0, completed: 0 };
      subtaskMap[s.task_id].total++;
      if (s.is_completed) subtaskMap[s.task_id].completed++;
    });

    // Fetch projects (all groups user owns, including subprojects)
    const { data: groups } = await supabase
      .from("task_groups")
      .select("id, name, parent_id")
      .eq("user_id", userId)
      .limit(200);

    // Build group name map for resolving group_id → name in task context
    const groupNameMap: Record<string, string> = {};
    (groups || []).forEach((g: any) => { groupNameMap[g.id] = g.name; });

    // Helper: format group tag with human-readable name
    const groupTag = (gid: string | null) => {
      if (!gid) return "";
      const name = groupNameMap[gid];
      return name ? ` (проект "${name}") [group_id:${gid}]` : ` [group_id:${gid}]`;
    };

    // Fetch subprojects for project context
    let subprojectNames: string[] = [];
    if (projectId) {
      const { data: subs } = await supabase
        .from("task_groups")
        .select("id, name")
        .eq("parent_id", projectId);
      subprojectNames = (subs || []).map((s: any) => s.name);
    }

    // Fetch milestones for project
    let milestonesContext = "";
    if (projectId && projectGroupIds) {
      const { data: milestones } = await supabase
        .from("project_milestones")
        .select("name, planned_date, status, gate_key")
        .in("group_id", projectGroupIds)
        .order("planned_date", { ascending: true })
        .limit(20);
      if (milestones && milestones.length > 0) {
        milestonesContext = `\n◆ Вехи проекта:\n`;
        milestones.forEach((m: any) => {
          const isPast = new Date(m.planned_date) < today;
          const drift = isPast && m.status !== "done" ? Math.floor((today.getTime() - new Date(m.planned_date).getTime()) / (1000*60*60*24)) : 0;
          milestonesContext += `- "${m.name}" → ${m.planned_date}${m.gate_key ? ` [${m.gate_key}]` : ""} ${m.status === "done" ? "✅" : drift > 0 ? `⚠️ +${drift} дн.` : "⏳"}\n`;
        });
      }
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .limit(100);

    const profileMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { profileMap[p.id] = p.display_name || "Без имени"; });

    const allTasks = tasks || [];
    const activeTasks = allTasks.filter((t: any) => !t.is_completed);
    const completedTasks = allTasks.filter((t: any) => t.is_completed);
    const completedRecently = completedTasks.filter((t: any) => {
      if (!t.completed_at) return false;
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
    const driftedTasks = activeTasks.filter((t: any) => t.original_deadline && t.deadline && t.original_deadline !== t.deadline);

    // ── Advanced analytics ──

    // 1. Velocity: completed per week (last 4 weeks)
    const weekBuckets = [0, 0, 0, 0];
    completedTasks.forEach((t: any) => {
      if (!t.completed_at) return;
      const ago = Math.floor((today.getTime() - new Date(t.completed_at).getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (ago >= 0 && ago < 4) weekBuckets[ago]++;
    });
    const velocityTrend = weekBuckets[0] > weekBuckets[1] ? "ускоряется" : weekBuckets[0] < weekBuckets[1] ? "замедляется" : "стабильна";

    // 2. Task aging — how long overdue tasks have been overdue
    const overdueAging = overdue.map((t: any) => Math.floor((today.getTime() - new Date(t.deadline).getTime()) / (1000 * 60 * 60 * 24)));
    const avgOverdueAge = overdueAging.length > 0 ? Math.round(overdueAging.reduce((a: number, b: number) => a + b, 0) / overdueAging.length) : 0;
    const maxOverdueAge = overdueAging.length > 0 ? Math.max(...overdueAging) : 0;

    // 3. Workload per assignee
    const workload: Record<string, { active: number; overdue: number; name: string }> = {};
    activeTasks.forEach((t: any) => {
      const assignee = t.assigned_to || t.user_id;
      if (!workload[assignee]) workload[assignee] = { active: 0, overdue: 0, name: profileMap[assignee] || "?" };
      workload[assignee].active++;
      if (t.deadline && new Date(t.deadline) < today) workload[assignee].overdue++;
    });
    const overloadedPeople = Object.values(workload).filter(w => w.active > 8 || w.overdue > 3).sort((a, b) => b.active - a.active);

    // 4. Project health distribution
    const projectHealth: Record<string, { total: number; done: number; overdue: number; name: string }> = {};
    allTasks.forEach((t: any) => {
      if (!t.group_id) return;
      const gName = (groups || []).find((g: any) => g.id === t.group_id)?.name || t.group_id;
      if (!projectHealth[t.group_id]) projectHealth[t.group_id] = { total: 0, done: 0, overdue: 0, name: gName };
      projectHealth[t.group_id].total++;
      if (t.is_completed) projectHealth[t.group_id].done++;
      else if (t.deadline && new Date(t.deadline) < today) projectHealth[t.group_id].overdue++;
    });
    const troubleProjects = Object.entries(projectHealth)
      .filter(([_, v]) => v.overdue > 2 || (v.total > 3 && v.done / v.total < 0.2))
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.overdue - a.overdue);

    // 5. Drift patterns
    const totalDriftDays = driftedTasks.reduce((sum: number, t: any) => {
      return sum + Math.floor((new Date(t.deadline).getTime() - new Date(t.original_deadline).getTime()) / (1000*60*60*24));
    }, 0);
    const avgDrift = driftedTasks.length > 0 ? Math.round(totalDriftDays / driftedTasks.length) : 0;

    // 6. Created but not started (no progress for 7+ days)
    const stale = activeTasks.filter((t: any) => {
      const created = new Date(t.created_at);
      const updated = new Date(t.updated_at);
      const ageD = (today.getTime() - created.getTime()) / (1000*60*60*24);
      const lastTouch = (today.getTime() - updated.getTime()) / (1000*60*60*24);
      return ageD > 7 && lastTouch > 5 && !t.deadline;
    });

    // 7. Day of week awareness
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
    const dayNames = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
    const dayName = dayNames[dayOfWeek];
    const isMonday = dayOfWeek === 1;
    const isFriday = dayOfWeek === 5;

    // ── Rotating analysis lens ──
    const lenses = [
      "velocity", // Темп и динамика
      "workload", // Баланс нагрузки
      "risks",    // Риски и узкие места
      "strategy", // Стратегический взгляд
      "patterns", // Паттерны и закономерности
      "delegation", // Делегирование и контроль
    ];
    const lensIndex = today.getDate() % lenses.length; // меняется каждый день
    const todayLens = lenses[lensIndex];

    // Build enriched context
    const scopeLabel = projectId ? `проекту "${projectName}"` : "всем задачам";
    let context = `📊 Сводка на ${todayStr} (${dayName}) по ${scopeLabel}:\n`;
    context += `- Всего активных задач: ${activeTasks.length}\n`;
    context += `- Выполнено за 3 дня: ${completedRecently.length}\n`;
    context += `- 🔴 Просрочено: ${overdue.length}${overdue.length > 0 ? ` (ср. возраст: ${avgOverdueAge} дн., макс: ${maxOverdueAge} дн.)` : ""}\n`;
    context += `- 📅 На этой неделе: ${dueThisWeek.length}\n`;
    context += `- ⭐ Важных/приоритетных: ${highPriority.length}\n`;
    if (!projectId) {
      context += `- 📥 Поручено мне: ${delegatedToMe.length}\n`;
      context += `- 📤 Поручено мной: ${delegatedByMe.length}\n`;
    }
    context += `- ⚠️ Без дедлайна: ${noDeadline.length}\n`;
    context += `- 📈 Со сдвигом дедлайна: ${driftedTasks.length}${driftedTasks.length > 0 ? ` (ср. дрейф: +${avgDrift} дн.)` : ""}\n`;
    context += `- 🧊 Забытых (7+ дн. без активности): ${stale.length}\n`;
    if (!projectId) context += `- 📂 Проектов: ${(groups || []).length}\n`;
    if (subprojectNames.length > 0) context += `- 🔀 Стримы: ${subprojectNames.join(", ")}\n`;

    // Subtask/step analytics in context
    context += `\n📋 Шаги (подзадачи):\n`;
    context += `- Всего активных шагов: ${activeSubtasks.length}\n`;
    context += `- 🔴 Просроченных шагов: ${overdueSubtasks.length}\n`;
    context += `- ⚠️ Шагов без срока: ${subtasksNoDeadline.length}\n`;
    context += `- 👤 Шагов без ответственного: ${subtasksNoAssignee.length}\n`;
    if (!projectId) context += `- 📥 Шагов назначено мне: ${subtasksAssignedToMe.length}\n`;

    context += `\n📈 Скорость за 4 недели: [${weekBuckets.join(", ")}] задач/нед. Тренд: ${velocityTrend}\n`;

    if (overloadedPeople.length > 0) {
      context += `\n👥 Перегруженные участники:\n`;
      overloadedPeople.forEach(w => {
        context += `- ${w.name}: ${w.active} актив., ${w.overdue} просроч.\n`;
      });
    }

    if (!projectId && troubleProjects.length > 0) {
      context += `\n🚨 Проекты с проблемами:\n`;
      troubleProjects.slice(0, 3).forEach(p => {
        const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0;
        context += `- "${p.name}" [group_id:${p.id}]: ${pct}% выполнено, ${p.overdue} просроч.\n`;
      });
    }

    context += milestonesContext;

    if (overdue.length > 0) {
      context += `\n🔴 Просроченные задачи:\n`;
      overdue.slice(0, 10).forEach((t: any) => {
        const days = Math.floor((today.getTime() - new Date(t.deadline).getTime()) / (1000 * 60 * 60 * 24));
        const assignee = t.assigned_to ? profileMap[t.assigned_to] : null;
        const si = subtaskMap[t.id];
        const stepsTag = si ? ` [шаги: ✓${si.completed}/${si.total}]` : "";
        context += `- "${t.title}" [task_id:${t.id}]${groupTag(t.group_id)}${stepsTag} (${days} дн.${assignee ? `, → ${assignee}` : ""})\n`;
      });
    }

    if (dueThisWeek.length > 0) {
      context += `\n📅 Ближайшие дедлайны:\n`;
      dueThisWeek.slice(0, 10).forEach((t: any) => {
        const d = new Date(t.deadline);
        const dayLabel = d.toISOString().split("T")[0];
        const assignee = t.assigned_to ? profileMap[t.assigned_to] : null;
        context += `- "${t.title}" [task_id:${t.id}]${groupTag(t.group_id)} → ${dayLabel}${t.priority === 1 ? " ⚡" : ""}${assignee ? ` → ${assignee}` : ""}\n`;
      });
    }

    if (highPriority.length > 0) {
      context += `\n⭐ Приоритетные:\n`;
      highPriority.slice(0, 5).forEach((t: any) => {
        context += `- "${t.title}" [task_id:${t.id}]${groupTag(t.group_id)}${t.deadline ? ` [${new Date(t.deadline).toISOString().split("T")[0]}]` : ""}\n`;
      });
    }

    if (stale.length > 0) {
      context += `\n🧊 Забытые задачи (без активности 7+ дн.):\n`;
      stale.slice(0, 5).forEach((t: any) => {
        context += `- "${t.title}" [task_id:${t.id}]${groupTag(t.group_id)}\n`;
      });
    }

    if (!projectId && delegatedToMe.length > 0) {
      context += `\n📥 Поручено мне:\n`;
      delegatedToMe.slice(0, 5).forEach((t: any) => {
        const from = profileMap[t.user_id] || "?";
        context += `- "${t.title}" [task_id:${t.id}]${groupTag(t.group_id)} от ${from}${t.deadline ? ` [${new Date(t.deadline).toISOString().split("T")[0]}]` : ""}\n`;
      });
    }

    if (!projectId && delegatedByMe.length > 0) {
      context += `\n📤 Мои поручения:\n`;
      delegatedByMe.slice(0, 5).forEach((t: any) => {
        const to = profileMap[t.assigned_to!] || "?";
        context += `- "${t.title}" [task_id:${t.id}]${groupTag(t.group_id)} → ${to}${t.deadline ? ` [${new Date(t.deadline).toISOString().split("T")[0]}]` : ""}\n`;
      });
    }

    if (driftedTasks.length > 0) {
      context += `\n📈 Задачи со сдвигом:\n`;
      driftedTasks.slice(0, 5).forEach((t: any) => {
        const drift = Math.floor((new Date(t.deadline).getTime() - new Date(t.original_deadline).getTime()) / (1000*60*60*24));
        context += `- "${t.title}" [task_id:${t.id}] +${drift} дн.\n`;
      });
    }

    // Subtask details in context
    if (overdueSubtasks.length > 0) {
      context += `\n🔴 Просроченные шаги:\n`;
      overdueSubtasks.slice(0, 8).forEach((s: any) => {
        const days = Math.floor((today.getTime() - new Date(s.deadline).getTime()) / (1000 * 60 * 60 * 24));
        const assignee = s.assigned_to ? profileMap[s.assigned_to] : "не назначен";
        const parentTask = (tasks || []).find((t: any) => t.id === s.task_id);
        context += `- "${s.title}" (${days} дн. просрочки, ${assignee})${parentTask ? ` ← задача "${parentTask.title}" [task_id:${parentTask.id}]` : ""}\n`;
      });
    }

    if (subtasksNoDeadline.length > 0) {
      context += `\n📌 Шаги без срока (${subtasksNoDeadline.length}):\n`;
      subtasksNoDeadline.slice(0, 6).forEach((s: any) => {
        const parentTask = (tasks || []).find((t: any) => t.id === s.task_id);
        const assignee = s.assigned_to ? profileMap[s.assigned_to] : "не назначен";
        context += `- "${s.title}" (${assignee})${parentTask ? ` ← "${parentTask.title}" [task_id:${parentTask.id}]` : ""}\n`;
      });
    }

    if (subtasksNoAssignee.length > 0) {
      context += `\n👤 Шаги без ответственного (${subtasksNoAssignee.length}):\n`;
      subtasksNoAssignee.slice(0, 6).forEach((s: any) => {
        const parentTask = (tasks || []).find((t: any) => t.id === s.task_id);
        context += `- "${s.title}"${s.deadline ? ` [${new Date(s.deadline).toISOString().split("T")[0]}]` : ""}${parentTask ? ` ← "${parentTask.title}" [task_id:${parentTask.id}]` : ""}\n`;
      });
    }

    // Tasks without deadline (existing)
    const tasksNoDeadline = activeTasks.filter((t: any) => !t.deadline);
    if (tasksNoDeadline.length > 0) {
      context += `\n📌 Задачи без срока (${tasksNoDeadline.length}):\n`;
      tasksNoDeadline.slice(0, 5).forEach((t: any) => {
        const assignee = t.assigned_to ? profileMap[t.assigned_to] : "не назначен";
        context += `- "${t.title}" [task_id:${t.id}]${groupTag(t.group_id)} (${assignee})\n`;
      });
    }

    // ── Lens-specific instructions ──
    const lensInstructions: Record<string, string> = {
      velocity: `ФОКУС АНАЛИЗА: Скорость и динамика.
Проанализируй тренд выполнения (замедление/ускорение). Если темп падает — в чём причина? Какие конкретные блокеры тормозят? Предложи как восстановить темп. Если темп растёт — отметь и предложи как закрепить.`,
      workload: `ФОКУС АНАЛИЗА: Баланс нагрузки.
Проанализируй распределение задач между участниками. Кто перегружен? У кого слишком мало? Есть ли задачи, которые стоит перераспределить? Предложи конкретные действия по балансировке.`,
      risks: `ФОКУС АНАЛИЗА: Скрытые риски.
НЕ говори про очевидные просрочки — найди СКРЫТЫЕ проблемы: задачи без дедлайна, забытые задачи, системные паттерны дрейфа, проекты на ранней стадии запустения. Что может "выстрелить" через неделю?`,
      strategy: `ФОКУС АНАЛИЗА: Стратегический взгляд.
Отступи от ежедневной рутины. Какие проекты наиболее важны и получают ли они достаточно внимания? Есть ли дисбаланс между срочным и важным? Предложи перераспределить фокус для максимального долгосрочного импакта.`,
      patterns: `ФОКУС АНАЛИЗА: Паттерны и закономерности.
Найди повторяющиеся проблемы: задачи одного типа постоянно сдвигаются? Один проект всегда запаздывает? Определённый исполнитель систематически не укладывается? Дай инсайт, который пользователь сам не заметил бы.`,
      delegation: `ФОКУС АНАЛИЗА: Делегирование и контроль.
Проанализируй поручения: есть ли зависшие? Кому из исполнителей нужен follow-up? Есть ли задачи, которые пора делегировать вместо того чтобы делать самому? Предложи конкретные follow-up действия.`,
    };

    const dayContext = isMonday
      ? "Сегодня понедельник — хороший момент для планирования недели и ревью приоритетов."
      : isFriday
        ? "Сегодня пятница — хороший момент подвести итоги недели, закрыть мелкие задачи и спланировать следующую."
        : "";

    const systemPrompt = projectId
      ? `Ты — проактивный AI-помощник по управлению проектом "${projectName}". Анализируй ТОЛЬКО задачи этого проекта.

${lensInstructions[todayLens]}
${dayContext}

Правила:
1. Дай УНИКАЛЬНЫЙ анализ — НЕ повторяй типовые фразы про "сосредоточьтесь на просрочках"
2. Найди неочевидные инсайты: паттерны, тренды, риски, которые пользователь мог упустить
3. Дай 1-3 КОНКРЕТНЫХ, НЕШАБЛОННЫХ рекомендации с именами задач
4. Оцени темп: скорость за 4 недели показывает тренд
5. Если есть стримы — отметь отстающие и почему
6. Используй эмодзи
7. Максимум 200 слов
8. НЕ ИСПОЛЬЗУЙ markdown (**, *, #, \`, []()). Обычный текст
9. Тон — деловой, конструктивный, как опытный PM
10. КРИТИЧЕСКИ ВАЖНО: В urgentItems указывай task_id и group_id из контекста [task_id:UUID] и [group_id:UUID]
11. Для focusOfDay укажи focusTaskId или focusGroupId
12. Не включай [task_id:...] или [group_id:...] в текст — только через поля JSON
13. В тексте ВСЕГДА используй НАЗВАНИЯ проектов (они указаны в скобках как "проект ИМЯ"), НИКОГДА не пиши UUID в тексте
14. ЗАПРЕЩЕНО: общие фразы типа "обратите внимание на просроченные задачи". Будь конкретен!
15. ВАЖНО: Если есть шаги (подзадачи) без сроков или без ответственных — ОБЯЗАТЕЛЬНО предупреди: "Не назначены сроки/ответственные для шагов X, Y в задачах A, B". Назови конкретные шаги и задачи.
16. Просроченные шаги тоже важны — выводи их как urgentItems наравне с задачами.
17. ОБЯЗАТЕЛЬНО указывай поле hint в каждом urgentItem для умной фильтрации: overdue (просрочено), no_deadline (нет срока), no_assignee (нет ответственного), steps (проблемы с шагами), stale (застывшие задачи без активности), drift (сдвиг дедлайнов), blocked (блокеры). Hint определяет тип проблемы, чтобы пользователь мог одним нажатием отфильтровать все похожие проблемы.`
      : `Ты — проактивный AI-аналитик по продуктивности. Ты даёшь УНИКАЛЬНЫЙ дайджест, каждый раз с новым углом.

${lensInstructions[todayLens]}
${dayContext}

Правила:
1. ЗАПРЕЩЕНО: "сосредоточьтесь на просроченных", "обратите внимание на дедлайны" — это скучно и очевидно
2. Найди НЕОЧЕВИДНЫЙ инсайт: скрытый паттерн, тренд, дисбаланс, системную проблему
3. Дай 1-3 КОНКРЕТНЫХ рекомендации с именами задач/проектов — не общие советы
4. Проанализируй ТРЕНД скорости (ускоряется/замедляется) и почему
5. Если есть забытые задачи или дисбаланс нагрузки — сигнализируй об этом
6. Используй эмодзи для визуального разделения
7. Максимум 200 слов
8. НЕ ИСПОЛЬЗУЙ markdown (**, *, #, \`, []()). Обычный текст
9. Тон — как умный коллега, который видит то, что ты не заметил
10. НЕ повторяй список задач — давай аналитику
11. КРИТИЧЕСКИ ВАЖНО: В urgentItems указывай task_id и group_id из контекста. Копируй UUID ТОЧНО
12. Для focusOfDay укажи focusTaskId или focusGroupId
13. Не включай [task_id:...] в текст — только через поля JSON
14. В тексте ВСЕГДА используй НАЗВАНИЯ проектов (они указаны как "проект ИМЯ"), НИКОГДА не пиши UUID в тексте
15. ОБЯЗАТЕЛЬНО указывай поле hint в каждом urgentItem: overdue, no_deadline, no_assignee, steps, stale, drift, blocked

Если задач мало (< 5) — предложи стратегию на неделю.
Если всё ок — найди точку роста, а не просто похвали.

ВАЖНО: Если есть шаги (подзадачи) без сроков или без ответственных — ОБЯЗАТЕЛЬНО предупреди: "Не назначены сроки/ответственные для шагов X, Y в задачах A, B". Назови конкретные шаги и задачи. Просроченные шаги тоже выводи как urgentItems.`;

    const userPrompt = projectId
      ? `Ситуация по проекту "${projectName}":\n\n${context}\n\nДай анализ в фокусе "${todayLens}".`
      : `Моя ситуация с задачами:\n\n${context}\n\nДай уникальный дайджест в фокусе "${todayLens}".`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://justtodoit.ru",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "daily_insights",
              description: projectId
                ? "Сформировать аналитику по проекту"
                : "Сформировать проактивный дайджест дня для пользователя",
              parameters: {
                type: "object",
                properties: {
                  greeting: { type: "string", description: projectId ? "Краткая оценка здоровья проекта (1 предложение, с эмодзи)" : "Краткое приветствие (1 предложение, с эмодзи)" },
                  urgentItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        emoji: { type: "string", description: "Эмодзи для пункта (🔴, ⚡, 📅, etc)" },
                        text: { type: "string", description: "Краткий текст пункта" },
                        task_id: { type: "string", description: "UUID задачи из контекста [task_id:...], если упоминается конкретная задача. Копируй UUID точно." },
                        group_id: { type: "string", description: "UUID проекта из контекста [group_id:...], если задача принадлежит проекту. Копируй UUID точно." },
                        hint: { type: "string", enum: ["overdue", "no_deadline", "no_assignee", "steps", "stale", "drift", "blocked"], description: "Тип проблемы для умной фильтрации: overdue=просрочено, no_deadline=нет срока, no_assignee=нет ответственного, steps=проблемы с шагами, stale=застывшие задачи, drift=сдвиг дедлайнов, blocked=блокеры" },
                      },
                      required: ["emoji", "text"],
                    },
                    description: "1-4 срочных/важных пункта на которые стоит обратить внимание. Включай task_id и group_id где возможно.",
                  },
                  focusOfDay: { type: "string", description: projectId ? "Главный приоритет по проекту (1 предложение)" : "Рекомендованный фокус дня (1 предложение)" },
                  focusTaskId: { type: "string", description: "UUID задачи для фокуса из контекста [task_id:...]" },
                  focusGroupId: { type: "string", description: "UUID проекта для фокуса из контекста [group_id:...]" },
                  tips: {
                    type: "array",
                    items: { type: "string" },
                    description: "1-2 конкретных совета или рекомендации",
                  },
                  motivation: { type: "string", description: projectId ? "Итоговая рекомендация (1 предложение)" : "Мотивирующее завершение (1 предложение, с эмодзи)" },
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

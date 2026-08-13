import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { isOverdue, startOfTodayMoscow } from "../_shared/time.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

const AI_GATEWAY = "https://openrouter.ai/api/v1/chat/completions";

Deno.serve(async () => {
  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not set" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Only run on Friday (Moscow timezone)
  const moscowNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const dayOfWeek = moscowNow.getDay();
  if (dayOfWeek !== 5) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "not friday" }));
  }

  // Get users with telegram_chat_id
  // Only personal chats (positive IDs) — group chats have negative IDs and would cause duplicate sends
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_chat_id")
    .not("telegram_chat_id", "is", null)
    .gt("telegram_chat_id", 0);

  if (!profiles || profiles.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no profiles" }));
  }

  // Filter by preference
  const userIds = profiles.map(p => p.id);
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, telegram_weekly_ai_review")
    .in("user_id", userIds)
    .eq("telegram_weekly_ai_review", true);

  const enabledIds = new Set((prefs || []).map(p => p.user_id));
  // Also include users without prefs row (default true)
  const eligibleProfiles = profiles.filter(p => enabledIds.has(p.id) || !(prefs || []).some(pr => pr.user_id === p.id));

  if (eligibleProfiles.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no users opted in" }));
  }

  // Fetch all profiles for name resolution
  const { data: allProfiles } = await supabase.from("profiles").select("id, display_name").limit(200);
  const profileMap: Record<string, string> = {};
  (allProfiles || []).forEach((p: any) => { profileMap[p.id] = p.display_name || "Без имени"; });

  let sentCount = 0;

  const weekStart = weekStartMoscow();

  for (const profile of eligibleProfiles) {
    try {
      const weekData = await gatherWeekData(supabase, profile.id, profileMap);
      if (!weekData) continue;

      const aiReview = await generateAiReview(weekData, profile.display_name || "Коллега");
      if (!aiReview) continue;

      // Idempotency guard: claim this (report, chat, week). If it already exists,
      // a report was already sent this week — skip to avoid duplicate/triple sends.
      const { error: claimErr } = await supabase
        .from("weekly_send_log")
        .insert({ report_type: "ai_review", chat_id: profile.telegram_chat_id, recipient_id: profile.id, week_start: weekStart });
      if (claimErr) {
        continue; // unique violation → already sent this week
      }

      const tgResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: profile.telegram_chat_id,
          text: aiReview,
          parse_mode: "HTML",
        }),
      });

      if (!tgResp.ok) {
        // Release the claim so a later run can retry
        await supabase.from("weekly_send_log").delete()
          .match({ report_type: "ai_review", chat_id: profile.telegram_chat_id, week_start: weekStart });
        continue;
      }

      sentCount++;
    } catch (e) {
      console.error(`Error for user ${profile.id}:`, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent: sentCount }));
});

function weekStartMoscow(): string {
  const m = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const day = m.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  m.setDate(m.getDate() + diff);
  return m.toISOString().slice(0, 10);
}

async function gatherWeekData(supabase: any, userId: string, profileMap: Record<string, string>) {
  const now = new Date();
  // Граница просрочки — начало суток по МСК (как в UI), не момент запуска крона
  const dayStart = startOfTodayMoscow();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // Get all groups: owned + member-of (top-level only)
  const [ownedRes, memberRes] = await Promise.all([
    supabase.from("task_groups").select("id, name").eq("user_id", userId).is("parent_id", null).is("closed_at", null),
    supabase.from("group_members").select("group_id, task_groups!inner(id, name, parent_id, closed_at, user_id)").eq("user_id", userId),
  ]);

  const ownedGroups = (ownedRes.data || []).map((g: any) => ({ id: g.id, name: g.name }));
  const memberGroups = (memberRes.data || [])
    .map((m: any) => m.task_groups)
    .filter((g: any) => g && g.parent_id === null && g.closed_at === null && g.user_id !== userId)
    .map((g: any) => ({ id: g.id, name: g.name }));

  const groupsMap = new Map<string, { id: string; name: string }>();
  [...ownedGroups, ...memberGroups].forEach((g) => groupsMap.set(g.id, g));
  const groups = Array.from(groupsMap.values());

  if (groups.length === 0) return null;

  const groupIds = groups.map((g: any) => g.id);

  const { data: subgroups } = await supabase
    .from("task_groups")
    .select("id")
    .in("parent_id", groupIds);
  const allGroupIds = [...groupIds, ...(subgroups || []).map((sg: any) => sg.id)];

  const { data: rawTasks } = await supabase
    .from("tasks")
    .select("id, title, is_completed, deadline, original_deadline, assigned_to, completed_at, group_id, created_at, user_id")
    .in("group_id", allGroupIds);

  // Filter to tasks where user is actually involved
  const { data: parts } = await supabase
    .from("task_participants")
    .select("task_id")
    .eq("user_id", userId);
  const participantTaskIds = new Set((parts || []).map((p: any) => p.task_id));

  const tasks = (rawTasks || []).filter((t: any) =>
    t.user_id === userId || t.assigned_to === userId || participantTaskIds.has(t.id)
  );

  if (tasks.length === 0) return null;

  const taskIds = tasks.map((t: any) => t.id);
  const { data: subtasks } = await supabase
    .from("subtasks")
    .select("id, task_id, title, is_completed, deadline, assigned_to")
    .in("task_id", taskIds);

  const allSubtasks = subtasks || [];

  // Compute stats
  const total = tasks.length;
  const completed = tasks.filter((t: any) => t.is_completed).length;
  const completedThisWeek = tasks.filter((t: any) => t.is_completed && t.completed_at && new Date(t.completed_at) >= weekAgo).length;
  const createdThisWeek = tasks.filter((t: any) => new Date(t.created_at) >= weekAgo).length;
  const overdue = tasks.filter((t: any) => !t.is_completed && isOverdue(t.deadline, dayStart));
  const driftTasks = tasks.filter((t: any) => t.original_deadline && t.deadline && t.original_deadline !== t.deadline);
  const upcomingWeek = tasks.filter((t: any) => !t.is_completed && t.deadline && new Date(t.deadline) >= dayStart && new Date(t.deadline) <= weekEnd);
  const noDeadline = tasks.filter((t: any) => !t.is_completed && !t.deadline);
  const noAssignee = tasks.filter((t: any) => !t.is_completed && !t.assigned_to);

  const overdueSteps = allSubtasks.filter((s: any) => !s.is_completed && isOverdue(s.deadline, dayStart));

  // Per-project summary
  const projectSummaries = groups.map((g: any) => {
    const gt = tasks.filter((t: any) => t.group_id === g.id);
    const gc = gt.filter((t: any) => t.is_completed).length;
    const go = gt.filter((t: any) => !t.is_completed && isOverdue(t.deadline, dayStart)).length;
    return { name: g.name, total: gt.length, completed: gc, overdue: go };
  }).filter((p: any) => p.total > 0);

  // Top overdue
  const topOverdue = overdue.slice(0, 5).map((t: any) => ({
    title: t.title,
    deadline: t.deadline,
    assignee: t.assigned_to ? profileMap[t.assigned_to] || "?" : "не назначен",
  }));

  // Top upcoming
  const topUpcoming = upcomingWeek.slice(0, 5).map((t: any) => ({
    title: t.title,
    deadline: t.deadline,
    assignee: t.assigned_to ? profileMap[t.assigned_to] || "?" : "не назначен",
  }));

  return {
    totalProjects: groups.length,
    totalTasks: total,
    completedTotal: completed,
    completedThisWeek,
    createdThisWeek,
    overdueCount: overdue.length,
    overdueStepsCount: overdueSteps.length,
    driftCount: driftTasks.length,
    upcomingWeekCount: upcomingWeek.length,
    noDeadlineCount: noDeadline.length,
    noAssigneeCount: noAssignee.length,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    projectSummaries,
    topOverdue,
    topUpcoming,
  };
}

async function generateAiReview(data: any, userName: string): Promise<string | null> {
  if (!OPENROUTER_API_KEY) {
    // Fallback: generate without AI
    return buildFallbackReport(data, userName);
  }

  try {
    const prompt = `Ты — ИИ-менеджер проектов. Составь краткий еженедельный обзор (weekly review) для менеджера "${userName}".

Данные за неделю:
- Проектов: ${data.totalProjects}
- Задач всего: ${data.totalTasks}, выполнено: ${data.completedTotal} (${data.completionRate}%)
- Выполнено за неделю: ${data.completedThisWeek}, создано за неделю: ${data.createdThisWeek}
- Просрочено задач: ${data.overdueCount}, просрочено шагов: ${data.overdueStepsCount}
- Drift (перенос сроков): ${data.driftCount}
- Дедлайнов на след. неделе: ${data.upcomingWeekCount}
- Без дедлайна: ${data.noDeadlineCount}, без ответственного: ${data.noAssigneeCount}

Проекты: ${JSON.stringify(data.projectSummaries)}
Топ просроченных: ${JSON.stringify(data.topOverdue)}
Дедлайны на неделе: ${JSON.stringify(data.topUpcoming)}

Формат ответа — Telegram HTML. Структура:
1. 📊 Заголовок "Недельный ИИ-обзор" с датой
2. 📈 Ключевые метрики (3-4 строки)
3. 🏆 Достижения недели (что удалось)
4. ⚠️ Зоны внимания (риски, проблемы, просрочки)
5. 🎯 Фокус на следующую неделю (2-3 приоритета)
6. 💡 Одна конкретная рекомендация по улучшению процессов

Стиль: профессиональный, краткий, с эмодзи. Не больше 1500 символов. Используй <b>, <i> теги HTML.`;

    const res = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://justtodoit.ru",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Ты — ИИ-ассистент для управления проектами. Отвечай на русском." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1200,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      console.error("AI gateway error:", res.status);
      return buildFallbackReport(data, userName);
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content;
    return text || buildFallbackReport(data, userName);
  } catch (e) {
    console.error("AI review error:", e);
    return buildFallbackReport(data, userName);
  }
}

function buildFallbackReport(data: any, userName: string): string {
  const now = new Date();
  const lines = [
    `📊 <b>Недельный обзор · ${now.toLocaleDateString("ru-RU")}</b>`,
    ``,
    `Привет, <b>${userName}</b>! Вот итоги недели:`,
    ``,
    `📈 <b>Метрики:</b>`,
    `  • Прогресс: <b>${data.completionRate}%</b> (${data.completedTotal}/${data.totalTasks})`,
    `  • Выполнено за неделю: <b>${data.completedThisWeek}</b>`,
    `  • Создано за неделю: <b>${data.createdThisWeek}</b>`,
    `  • Просрочено: <b>${data.overdueCount}</b> задач`,
  ];

  if (data.overdueCount > 0) {
    lines.push(``, `⚠️ <b>Просроченные:</b>`);
    data.topOverdue.forEach((t: any) => {
      lines.push(`  • ${t.title} (${new Date(t.deadline).toLocaleDateString("ru-RU")}, ${t.assignee})`);
    });
  }

  if (data.upcomingWeekCount > 0) {
    lines.push(``, `🎯 <b>На следующей неделе:</b>`);
    data.topUpcoming.forEach((t: any) => {
      lines.push(`  • ${t.title} (${new Date(t.deadline).toLocaleDateString("ru-RU")})`);
    });
  }

  if (data.noDeadlineCount > 0 || data.noAssigneeCount > 0) {
    lines.push(``, `💡 <b>Рекомендация:</b>`);
    if (data.noDeadlineCount > 0) lines.push(`  📌 ${data.noDeadlineCount} задач без срока`);
    if (data.noAssigneeCount > 0) lines.push(`  👤 ${data.noAssigneeCount} задач без ответственного`);
  }

  return lines.join("\n");
}

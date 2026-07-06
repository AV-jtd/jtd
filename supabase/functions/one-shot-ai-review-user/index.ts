import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

const AI_GATEWAY = "https://openrouter.ai/api/v1/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!BOT_TOKEN) return new Response(JSON.stringify({ error: "no bot token" }), { status: 500, headers: corsHeaders });

  const { user_id, preamble } = await req.json();
  if (!user_id) return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: corsHeaders });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_chat_id")
    .eq("id", user_id)
    .single();

  if (!profile?.telegram_chat_id) {
    return new Response(JSON.stringify({ error: "no telegram_chat_id" }), { status: 400, headers: corsHeaders });
  }

  const { data: allProfiles } = await supabase.from("profiles").select("id, display_name").limit(500);
  const profileMap: Record<string, string> = {};
  (allProfiles || []).forEach((p: any) => { profileMap[p.id] = p.display_name || "Без имени"; });

  const weekData = await gatherWeekData(supabase, profile.id, profileMap);
  if (!weekData) {
    return new Response(JSON.stringify({ error: "no data" }), { status: 200, headers: corsHeaders });
  }

  let aiReview = await generateAiReview(weekData, profile.display_name || "Коллега");
  if (!aiReview) {
    return new Response(JSON.stringify({ error: "ai failed" }), { status: 500, headers: corsHeaders });
  }

  if (preamble) {
    aiReview = `${preamble}\n\n${aiReview}`;
  }

  const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: profile.telegram_chat_id,
      text: aiReview,
      parse_mode: "HTML",
    }),
  });

  const tgJson = await tgRes.json();
  return new Response(JSON.stringify({ ok: tgRes.ok, telegram: tgJson, stats: weekData }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function gatherWeekData(supabase: any, userId: string, profileMap: Record<string, string>) {
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);

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

  const groupIds = groups.map((g) => g.id);
  const { data: subgroups } = await supabase.from("task_groups").select("id").in("parent_id", groupIds);
  const allGroupIds = [...groupIds, ...(subgroups || []).map((sg: any) => sg.id)];

  const { data: rawTasks } = await supabase
    .from("tasks")
    .select("id, title, is_completed, deadline, original_deadline, assigned_to, completed_at, group_id, created_at, user_id")
    .in("group_id", allGroupIds);

  const { data: parts } = await supabase.from("task_participants").select("task_id").eq("user_id", userId);
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

  const total = tasks.length;
  const completed = tasks.filter((t: any) => t.is_completed).length;
  const completedThisWeek = tasks.filter((t: any) => t.is_completed && t.completed_at && new Date(t.completed_at) >= weekAgo).length;
  const createdThisWeek = tasks.filter((t: any) => new Date(t.created_at) >= weekAgo).length;
  const overdue = tasks.filter((t: any) => !t.is_completed && t.deadline && new Date(t.deadline) < now);
  const driftTasks = tasks.filter((t: any) => t.original_deadline && t.deadline && t.original_deadline !== t.deadline);
  const upcomingWeek = tasks.filter((t: any) => !t.is_completed && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekEnd);
  const noDeadline = tasks.filter((t: any) => !t.is_completed && !t.deadline);
  const noAssignee = tasks.filter((t: any) => !t.is_completed && !t.assigned_to);
  const overdueSteps = allSubtasks.filter((s: any) => !s.is_completed && s.deadline && new Date(s.deadline) < now);

  const projectSummaries = groups.map((g: any) => {
    const gt = tasks.filter((t: any) => t.group_id === g.id);
    const gc = gt.filter((t: any) => t.is_completed).length;
    const go = gt.filter((t: any) => !t.is_completed && t.deadline && new Date(t.deadline) < now).length;
    return { name: g.name, total: gt.length, completed: gc, overdue: go };
  }).filter((p: any) => p.total > 0);

  const topOverdue = overdue.slice(0, 5).map((t: any) => ({
    title: t.title, deadline: t.deadline,
    assignee: t.assigned_to ? profileMap[t.assigned_to] || "?" : "не назначен",
  }));
  const topUpcoming = upcomingWeek.slice(0, 5).map((t: any) => ({
    title: t.title, deadline: t.deadline,
    assignee: t.assigned_to ? profileMap[t.assigned_to] || "?" : "не назначен",
  }));

  return {
    totalProjects: groups.length, totalTasks: total, completedTotal: completed,
    completedThisWeek, createdThisWeek,
    overdueCount: overdue.length, overdueStepsCount: overdueSteps.length,
    driftCount: driftTasks.length, upcomingWeekCount: upcomingWeek.length,
    noDeadlineCount: noDeadline.length, noAssigneeCount: noAssignee.length,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    projectSummaries, topOverdue, topUpcoming,
  };
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
    `  • Просрочено: <b>${data.overdueCount}</b> задач, <b>${data.overdueStepsCount}</b> шагов`,
    `  • Дедлайнов на след. неделе: <b>${data.upcomingWeekCount}</b>`,
    `  • Проектов активно: <b>${data.totalProjects}</b>`,
  ];
  if (data.overdueCount > 0) {
    lines.push(``, `⚠️ <b>Просроченные:</b>`);
    data.topOverdue.forEach((t: any) => {
      lines.push(`  • ${t.title} (${new Date(t.deadline).toLocaleDateString("ru-RU")})`);
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

async function generateAiReview(data: any, userName: string): Promise<string | null> {
  if (!OPENROUTER_API_KEY) return buildFallbackReport(data, userName);
  try {
  const prompt = `Ты — ИИ-менеджер проектов. Составь краткий еженедельный обзор для менеджера "${userName}".

Данные за неделю:
- Проектов: ${data.totalProjects}
- Задач всего: ${data.totalTasks}, выполнено: ${data.completedTotal} (${data.completionRate}%)
- Выполнено за неделю: ${data.completedThisWeek}, создано за неделю: ${data.createdThisWeek}
- Просрочено задач: ${data.overdueCount}, шагов: ${data.overdueStepsCount}
- Drift: ${data.driftCount}
- Дедлайнов на след. неделе: ${data.upcomingWeekCount}
- Без дедлайна: ${data.noDeadlineCount}, без ответственного: ${data.noAssigneeCount}

Проекты: ${JSON.stringify(data.projectSummaries)}
Топ просроченных: ${JSON.stringify(data.topOverdue)}
Дедлайны на неделе: ${JSON.stringify(data.topUpcoming)}

Формат — Telegram HTML. Структура: 📊 Заголовок, 📈 Метрики, 🏆 Достижения, ⚠️ Зоны внимания, 🎯 Фокус след. недели, 💡 Рекомендация. Не больше 1500 символов. Используй <b>, <i>.`;

  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://justtodoit.ru" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Ты — ИИ-ассистент для управления проектами. Отвечай на русском." },
        { role: "user", content: prompt },
      ],
      max_tokens: 1200, temperature: 0.7,
    }),
  });
    if (!res.ok) return buildFallbackReport(data, userName);
    const json = await res.json();
    return json.choices?.[0]?.message?.content || buildFallbackReport(data, userName);
  } catch (e) {
    console.error("AI gateway error:", e);
    return buildFallbackReport(data, userName);
  }
}


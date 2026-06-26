import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not set" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Run only on Friday (Moscow timezone) — weekly report
  const moscowNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const dayOfWeek = moscowNow.getDay(); // 0=Sun, 5=Fri, 6=Sat
  // Allow manual override via ?force=1 for testing
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  if (!force && dayOfWeek !== 5) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "not friday" }));
  }

  // Get all users who have telegram_chat_id AND telegram_weekly_report enabled
  // Only personal chats (positive IDs) — group chats have negative IDs and would cause duplicate sends
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_chat_id")
    .not("telegram_chat_id", "is", null)
    .gt("telegram_chat_id", 0);

  if (profErr || !profiles || profiles.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no profiles with telegram" }));
  }

  // Check notification preferences - only send to users with telegram_weekly_report enabled
  const userIds = profiles.map(p => p.id);
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, telegram_weekly_report")
    .in("user_id", userIds);

  const prefsMap = new Map((prefs || []).map((p: any) => [p.user_id, p.telegram_weekly_report]));
  // If pref row exists — respect it. If missing — default OFF (avoid spam).
  const eligibleProfiles = profiles.filter(p => prefsMap.get(p.id) === true);

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
      // Get all groups: owned + member-of (top-level only)
      const [ownedRes, memberRes] = await Promise.all([
        supabase.from("task_groups").select("id, name, color").eq("user_id", profile.id).is("parent_id", null).is("closed_at", null),
        supabase.from("group_members").select("group_id, task_groups!inner(id, name, color, parent_id, closed_at, user_id)").eq("user_id", profile.id),
      ]);

      const ownedGroups = (ownedRes.data || []).map((g: any) => ({ id: g.id, name: g.name, color: g.color }));
      const memberGroups = (memberRes.data || [])
        .map((m: any) => m.task_groups)
        .filter((g: any) => g && g.parent_id === null && g.closed_at === null && g.user_id !== profile.id)
        .map((g: any) => ({ id: g.id, name: g.name, color: g.color }));

      const groupsMap = new Map<string, { id: string; name: string; color: string }>();
      [...ownedGroups, ...memberGroups].forEach((g) => groupsMap.set(g.id, g));
      const groups = Array.from(groupsMap.values());

      if (groups.length === 0) continue;

      const groupIds = groups.map(g => g.id);

      const { data: subgroups } = await supabase
        .from("task_groups")
        .select("id")
        .in("parent_id", groupIds);
      const allGroupIds = [...groupIds, ...(subgroups || []).map((sg: any) => sg.id)];

      // Get tasks in those groups, then keep only ones where user is involved
      const { data: rawTasks } = await supabase
        .from("tasks")
        .select("id, title, is_completed, deadline, original_deadline, assigned_to, completed_at, group_id, user_id, created_at")
        .in("group_id", allGroupIds);

      const { data: parts } = await supabase
        .from("task_participants")
        .select("task_id")
        .eq("user_id", profile.id);
      const participantTaskIds = new Set((parts || []).map((p: any) => p.task_id));

      const tasks = (rawTasks || []).filter((t: any) =>
        t.user_id === profile.id || t.assigned_to === profile.id || participantTaskIds.has(t.id)
      );

      if (tasks.length === 0) continue;

      // Fetch subtasks for these tasks
      const taskIds = tasks.map(t => t.id);
      const { data: subtasks } = await supabase
        .from("subtasks")
        .select("id, task_id, title, is_completed, deadline, assigned_to")
        .in("task_id", taskIds);

      const allSubtasks = subtasks || [];

      // Build subtask stats per task
      const subtaskMap: Record<string, { total: number; completed: number; items: any[] }> = {};
      allSubtasks.forEach(s => {
        if (!subtaskMap[s.task_id]) subtaskMap[s.task_id] = { total: 0, completed: 0, items: [] };
        subtaskMap[s.task_id].total++;
        if (s.is_completed) subtaskMap[s.task_id].completed++;
        subtaskMap[s.task_id].items.push(s);
      });

      const now = new Date();
      const total = tasks.length;
      const completed = tasks.filter(t => t.is_completed).length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      const overdue = tasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now);
      const driftTasks = tasks.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline);

      // Week deadlines
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekTasks = tasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekEnd);

      // Overdue subtasks
      const overdueSteps = allSubtasks.filter(s => !s.is_completed && s.deadline && new Date(s.deadline) < now);

      // Steps without deadline or assignee
      const stepsNoDeadline = allSubtasks.filter(s => !s.is_completed && !s.deadline);
      const stepsNoAssignee = allSubtasks.filter(s => !s.is_completed && !s.assigned_to);

      // Subtask step label helper
      const stepLabel = (taskId: string) => {
        const info = subtaskMap[taskId];
        if (!info || info.total === 0) return "";
        return ` [✓${info.completed}/${info.total}]`;
      };

      // Smart greeting based on Moscow time-of-day + first name
      const firstName = (profile.display_name || "").trim().split(/\s+/)[0] || "Коллега";
      const mskHour = moscowNow.getHours();
      const greetingWord = mskHour < 5 ? "Доброй ночи" : mskHour < 12 ? "Доброе утро" : mskHour < 18 ? "Добрый день" : "Добрый вечер";
      const greeting = pickGreeting(greetingWord, firstName, { pct, overdue: overdue.length, weekTasks: weekTasks.length });

      // Build message
      const lines: string[] = [
        `${greeting}`,
        ``,
        `📊 <b>Еженедельный отчёт · ${now.toLocaleDateString("ru-RU")}</b>`,
        ``,
        `📈 Прогресс: <b>${pct}%</b> (${completed}/${total})`,
        `📅 Дедлайнов на неделе: <b>${weekTasks.length}</b>`,
        `⚠️ Просрочено: <b>${overdue.length}</b> задач${overdueSteps.length > 0 ? `, <b>${overdueSteps.length}</b> шагов` : ""}`,
        `↔ Drift: <b>${driftTasks.length}</b>`,
      ];

      if (overdue.length > 0) {
        lines.push(``, `<b>⚠️ Просроченные:</b>`);
        overdue.slice(0, 5).forEach(t => {
          const dl = t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "";
          const assignee = t.assigned_to ? profileMap[t.assigned_to] : "";
          lines.push(`  • ${t.title}${stepLabel(t.id)} (${dl}${assignee ? `, ${assignee}` : ""})`);
        });
        if (overdue.length > 5) lines.push(`  ... и ещё ${overdue.length - 5}`);
      }

      // Overdue steps section
      if (overdueSteps.length > 0) {
        lines.push(``, `<b>⏰ Просроченные шаги:</b>`);
        overdueSteps.slice(0, 5).forEach(s => {
          const dl = s.deadline ? new Date(s.deadline).toLocaleDateString("ru-RU") : "";
          const assignee = s.assigned_to ? profileMap[s.assigned_to] : "не назначен";
          const parentTask = tasks.find(t => t.id === s.task_id);
          lines.push(`  • ${s.title} (${dl}, ${assignee})${parentTask ? ` ← ${parentTask.title}` : ""}`);
        });
        if (overdueSteps.length > 5) lines.push(`  ... и ещё ${overdueSteps.length - 5}`);
      }

      if (weekTasks.length > 0) {
        lines.push(``, `<b>📅 На этой неделе:</b>`);
        weekTasks.slice(0, 5).forEach(t => {
          const dl = t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "";
          const assignee = t.assigned_to ? profileMap[t.assigned_to] : "";
          lines.push(`  • ${t.title}${stepLabel(t.id)} (${dl}${assignee ? `, ${assignee}` : ""})`);
        });
        if (weekTasks.length > 5) lines.push(`  ... и ещё ${weekTasks.length - 5}`);
      }

      // Warning: steps without deadline or assignee
      if (stepsNoDeadline.length > 0 || stepsNoAssignee.length > 0) {
        lines.push(``, `<b>💡 Требуют внимания:</b>`);
        if (stepsNoDeadline.length > 0) {
          lines.push(`  📌 <b>${stepsNoDeadline.length}</b> шагов без срока`);
          stepsNoDeadline.slice(0, 3).forEach(s => {
            const parentTask = tasks.find(t => t.id === s.task_id);
            lines.push(`    • "${s.title}"${parentTask ? ` ← ${parentTask.title}` : ""}`);
          });
        }
        if (stepsNoAssignee.length > 0) {
          lines.push(`  👤 <b>${stepsNoAssignee.length}</b> шагов без ответственного`);
          stepsNoAssignee.slice(0, 3).forEach(s => {
            const parentTask = tasks.find(t => t.id === s.task_id);
            lines.push(`    • "${s.title}"${parentTask ? ` ← ${parentTask.title}` : ""}`);
          });
        }
      }

      // Save as dashboard_report
      const reportData = {
        summary: { completionRate: pct, tasksThisWeek: weekTasks.length, totalOverdue: overdue.length, totalDrift: driftTasks.length, totalProjects: groups.length },
        projects: groups.map(g => {
          const gt = tasks.filter(t => t.group_id === g.id);
          const gc = gt.filter(t => t.is_completed).length;
          return { name: g.name, color: g.color, total: gt.length, completed: gc, overdue: gt.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now).length, driftCount: 0, avgDriftDays: 0, timingStatus: "on-track", nextDeadline: null };
        }),
        overdueTasks: overdue.slice(0, 10).map(t => {
          const si = subtaskMap[t.id];
          return { title: t.title, assignee: t.assigned_to ? profileMap[t.assigned_to] : "—", deadline: t.deadline, ...(si ? { stepsTotal: si.total, stepsCompleted: si.completed } : {}) };
        }),
        weekTasks: weekTasks.slice(0, 10).map(t => {
          const si = subtaskMap[t.id];
          return { title: t.title, assignee: t.assigned_to ? profileMap[t.assigned_to] : "—", deadline: t.deadline, ...(si ? { stepsTotal: si.total, stepsCompleted: si.completed } : {}) };
        }),
        driftTasks: [],
        upcomingTasks: [],
        period: "auto_weekly",
        periodLabel: "Еженедельный отчёт",
        overdueStepsCount: overdueSteps.length,
        stepsNoDeadlineCount: stepsNoDeadline.length,
        stepsNoAssigneeCount: stepsNoAssignee.length,
      };

      await supabase.from("dashboard_reports").insert({
        user_id: profile.id,
        title: `Авто-отчёт · ${now.toLocaleDateString("ru-RU")}`,
        report_data: reportData,
      });

      // Generate AI review block (placed at the top, after greeting)
      const aiBlock = await generateAiBlock({
        userName: profile.display_name || "Коллега",
        completionRate: pct,
        completed,
        total,
        overdueCount: overdue.length,
        overdueStepsCount: overdueSteps.length,
        driftCount: driftTasks.length,
        upcomingWeekCount: weekTasks.length,
        noDeadlineCount: stepsNoDeadline.length,
        noAssigneeCount: stepsNoAssignee.length,
        projectsCount: groups.length,
      });

      // Compose: greeting → AI block → metrics
      let text = lines[0]; // greeting
      if (aiBlock) {
        text += `\n\n${aiBlock}\n\n━━━━━━━━━━━━━━`;
      }
      text += `\n` + lines.slice(1).join("\n");

      // Idempotency guard: claim this (report, chat, week) before sending.
      const { error: claimErr } = await supabase
        .from("weekly_send_log")
        .insert({ report_type: "weekly_report", chat_id: profile.telegram_chat_id, recipient_id: profile.id, week_start: weekStart });
      if (claimErr) {
        continue; // already sent this week
      }

      const tgResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: profile.telegram_chat_id,
          text,
          parse_mode: "HTML",
        }),
      });

      if (!tgResp.ok) {
        await supabase.from("weekly_send_log").delete()
          .match({ report_type: "weekly_report", chat_id: profile.telegram_chat_id, week_start: weekStart });
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
  const day = m.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  m.setDate(m.getDate() + diff);
  return m.toISOString().slice(0, 10);
}

async function generateAiBlock(d: {
  userName: string;
  completionRate: number;
  completed: number;
  total: number;
  overdueCount: number;
  overdueStepsCount: number;
  driftCount: number;
  upcomingWeekCount: number;
  noDeadlineCount: number;
  noAssigneeCount: number;
  projectsCount: number;
}): Promise<string | null> {
  if (!LOVABLE_API_KEY) return null;
  try {
    const prompt = `Ты — ИИ-менеджер проектов. Составь краткий ИИ-блок для еженедельного отчёта менеджера "${d.userName}".

Метрики недели:
- Проектов: ${d.projectsCount}
- Задач: ${d.total}, выполнено: ${d.completed} (${d.completionRate}%)
- Просрочено задач: ${d.overdueCount}, шагов: ${d.overdueStepsCount}
- Drift (перенос сроков): ${d.driftCount}
- Дедлайнов на след. неделе: ${d.upcomingWeekCount}
- Без срока: ${d.noDeadlineCount}, без ответственного: ${d.noAssigneeCount}

Формат — Telegram HTML. Структура (компактно, без повтора цифр выше):
🤖 <b>ИИ-обзор</b>
🏆 <b>Достижения:</b> 1-2 строки.
⚠️ <b>Риски:</b> 1-2 строки.
🎯 <b>Фокус недели:</b> 2-3 приоритета.
💡 <b>Рекомендация:</b> 1 конкретный совет.

Не больше 700 символов. Используй <b>, <i>.`;

    const res = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Ты — ИИ-ассистент по управлению проектами. Отвечай на русском, кратко." },
          { role: "user", content: prompt },
        ],
        max_tokens: 600,
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      console.error("AI gateway error:", res.status);
      return null;
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error("AI block error:", e);
    return null;
  }
}

function pickGreeting(timeWord: string, name: string, ctx: { pct: number; overdue: number; weekTasks: number }): string {
  // Smart variants: pick by context, randomized within bucket for variety
  const variants: string[] = [];

  if (ctx.overdue === 0 && ctx.pct >= 80) {
    variants.push(
      `👋 ${timeWord}, <b>${name}</b>! Неделя прошла отлично — держим темп 🚀`,
      `✨ ${timeWord}, <b>${name}</b>! Чисто закрыли неделю, поздравляю 🎯`,
      `🏆 ${timeWord}, <b>${name}</b>! Образцовая неделя — так держать!`,
    );
  } else if (ctx.overdue === 0) {
    variants.push(
      `👋 ${timeWord}, <b>${name}</b>! Без просрочек — отличная дисциплина 👌`,
      `🌿 ${timeWord}, <b>${name}</b>! Спокойная неделя без хвостов.`,
      `☕ ${timeWord}, <b>${name}</b>! Подведём итоги — всё под контролем.`,
    );
  } else if (ctx.overdue >= 5) {
    variants.push(
      `⚡ ${timeWord}, <b>${name}</b>! Накопилось — давай разберём вместе.`,
      `🎯 ${timeWord}, <b>${name}</b>! Время сфокусироваться на хвостах.`,
      `🧭 ${timeWord}, <b>${name}</b>! Сверим курс — есть, что подтянуть.`,
    );
  } else if (ctx.weekTasks >= 5) {
    variants.push(
      `🚀 ${timeWord}, <b>${name}</b>! Впереди насыщенная неделя — соберёмся.`,
      `📅 ${timeWord}, <b>${name}</b>! Много дедлайнов — расставим приоритеты.`,
      `💼 ${timeWord}, <b>${name}</b>! План на неделю плотный, но выполнимый.`,
    );
  } else {
    variants.push(
      `👋 ${timeWord}, <b>${name}</b>! Подведём итоги недели.`,
      `📊 ${timeWord}, <b>${name}</b>! Свежий обзор уже готов.`,
      `🌱 ${timeWord}, <b>${name}</b>! Рабочая неделя — на пятничном чек-апе.`,
    );
  }

  return variants[Math.floor(Math.random() * variants.length)];
}

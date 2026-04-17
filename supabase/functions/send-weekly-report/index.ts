import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

Deno.serve(async (req) => {
  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not set" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Check if today is a workday (Mon-Fri) in Moscow timezone
  const moscowNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const dayOfWeek = moscowNow.getDay(); // 0=Sun, 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "weekend" }));
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
    .in("user_id", userIds)
    .eq("telegram_weekly_report", true);

  const enabledUserIds = new Set((prefs || []).map(p => p.user_id));
  const eligibleProfiles = profiles.filter(p => enabledUserIds.has(p.id));

  if (eligibleProfiles.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no users opted in" }));
  }

  // Fetch all profiles for name resolution
  const { data: allProfiles } = await supabase.from("profiles").select("id, display_name").limit(200);
  const profileMap: Record<string, string> = {};
  (allProfiles || []).forEach((p: any) => { profileMap[p.id] = p.display_name || "Без имени"; });

  let sentCount = 0;

  for (const profile of eligibleProfiles) {
    try {
      // Get user's active projects
      const { data: groups } = await supabase
        .from("task_groups")
        .select("id, name, color")
        .eq("user_id", profile.id)
        .is("parent_id", null)
        .is("closed_at", null);

      if (!groups || groups.length === 0) continue;

      const groupIds = groups.map(g => g.id);

      // Also get subgroups
      const { data: subgroups } = await supabase
        .from("task_groups")
        .select("id")
        .in("parent_id", groupIds);
      const allGroupIds = [...groupIds, ...(subgroups || []).map(sg => sg.id)];

      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, is_completed, deadline, original_deadline, assigned_to, completed_at, group_id")
        .in("group_id", allGroupIds);

      if (!tasks || tasks.length === 0) continue;

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

      // Build message
      const lines: string[] = [
        `📊 <b>Ежедневный отчёт · ${now.toLocaleDateString("ru-RU")}</b>`,
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
        period: "auto_daily",
        periodLabel: "Авто-отчёт",
        overdueStepsCount: overdueSteps.length,
        stepsNoDeadlineCount: stepsNoDeadline.length,
        stepsNoAssigneeCount: stepsNoAssignee.length,
      };

      await supabase.from("dashboard_reports").insert({
        user_id: profile.id,
        title: `Авто-отчёт · ${now.toLocaleDateString("ru-RU")}`,
        report_data: reportData,
      });

      // Send Telegram message
      const text = lines.join("\n");
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: profile.telegram_chat_id,
          text,
          parse_mode: "HTML",
        }),
      });

      sentCount++;
    } catch (e) {
      console.error(`Error for user ${profile.id}:`, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent: sentCount }));
});

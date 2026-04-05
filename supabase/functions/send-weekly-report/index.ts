import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

Deno.serve(async (req) => {
  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not set" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get all users who have telegram_chat_id set
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_chat_id")
    .not("telegram_chat_id", "is", null);

  if (profErr || !profiles || profiles.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no profiles with telegram" }));
  }

  let sentCount = 0;

  for (const profile of profiles) {
    try {
      // Get user's active projects
      const { data: groups } = await supabase
        .from("task_groups")
        .select("id, name, color")
        .eq("user_id", profile.id)
        .is("parent_id", null)
        .is("closed_at", null);

      if (!groups || groups.length === 0) continue;

      // Get all tasks for these groups
      const groupIds = groups.map(g => g.id);
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, is_completed, deadline, original_deadline, assigned_to, completed_at, group_id")
        .in("group_id", groupIds);

      if (!tasks || tasks.length === 0) continue;

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

      // Build message
      const lines: string[] = [
        `📊 <b>Еженедельный отчёт</b>`,
        ``,
        `📈 Прогресс: <b>${pct}%</b> (${completed}/${total})`,
        `📅 Дедлайнов на неделе: <b>${weekTasks.length}</b>`,
        `⚠️ Просрочено: <b>${overdue.length}</b>`,
        `↔ Drift: <b>${driftTasks.length}</b>`,
      ];

      if (overdue.length > 0) {
        lines.push(``, `<b>⚠️ Просроченные:</b>`);
        overdue.slice(0, 5).forEach(t => {
          const dl = t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "";
          lines.push(`  • ${t.title} (${dl})`);
        });
        if (overdue.length > 5) lines.push(`  ... и ещё ${overdue.length - 5}`);
      }

      if (weekTasks.length > 0) {
        lines.push(``, `<b>📅 На этой неделе:</b>`);
        weekTasks.slice(0, 5).forEach(t => {
          const dl = t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "";
          lines.push(`  • ${t.title} (${dl})`);
        });
        if (weekTasks.length > 5) lines.push(`  ... и ещё ${weekTasks.length - 5}`);
      }

      // Also save as dashboard_report
      const reportData = {
        summary: { completionRate: pct, tasksThisWeek: weekTasks.length, totalOverdue: overdue.length, totalDrift: driftTasks.length, totalProjects: groups.length },
        projects: groups.map(g => {
          const gt = tasks.filter(t => t.group_id === g.id);
          const gc = gt.filter(t => t.is_completed).length;
          return { name: g.name, color: g.color, total: gt.length, completed: gc, overdue: gt.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now).length, driftCount: 0, avgDriftDays: 0, timingStatus: "on-track", nextDeadline: null };
        }),
        overdueTasks: overdue.slice(0, 10).map(t => ({ title: t.title, assignee: "—", deadline: t.deadline })),
        weekTasks: weekTasks.slice(0, 10).map(t => ({ title: t.title, assignee: "—", deadline: t.deadline })),
        driftTasks: [],
        upcomingTasks: [],
        period: "auto_weekly",
        periodLabel: "Авто-отчёт",
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

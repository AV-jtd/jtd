import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

Deno.serve(async (_req) => {
  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not set" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get all users who have telegram_chat_id AND telegram_weekly_report enabled
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, display_name, telegram_chat_id")
    .not("telegram_chat_id", "is", null);

  if (profErr || !profiles || profiles.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no profiles with telegram" }));
  }

  const userIds = profiles.map(p => p.id);
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, telegram_weekly_report")
    .in("user_id", userIds)
    .eq("telegram_weekly_report", true);

  const enabledUserIds = new Set((prefs || []).map(p => p.user_id));

  // Also include users who don't have a prefs row yet (default = enabled)
  const { data: allPrefsRows } = await supabase
    .from("notification_preferences")
    .select("user_id")
    .in("user_id", userIds);
  const hasPrefsRow = new Set((allPrefsRows || []).map(p => p.user_id));
  // Users without prefs row get default (enabled)
  for (const uid of userIds) {
    if (!hasPrefsRow.has(uid)) enabledUserIds.add(uid);
  }

  const eligibleProfiles = profiles.filter(p => enabledUserIds.has(p.id));

  if (eligibleProfiles.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no users opted in" }));
  }

  // Fetch all profiles for name resolution
  const { data: allProfiles } = await supabase.from("profiles").select("id, display_name").limit(500);
  const profileMap: Record<string, string> = {};
  (allProfiles || []).forEach((p: any) => { profileMap[p.id] = p.display_name || "Без имени"; });

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoIso = weekAgo.toISOString();

  let sentCount = 0;

  for (const profile of eligibleProfiles) {
    try {
      // Get user's active projects (including where user is member)
      const { data: ownGroups } = await supabase
        .from("task_groups")
        .select("id, name, icon")
        .eq("user_id", profile.id)
        .is("parent_id", null)
        .is("closed_at", null);

      const { data: memberGroups } = await supabase
        .from("group_members")
        .select("group_id, task_groups(id, name, icon)")
        .eq("user_id", profile.id);

      const groupsMap = new Map<string, { id: string; name: string; icon: string | null }>();
      (ownGroups || []).forEach(g => groupsMap.set(g.id, g));
      (memberGroups || []).forEach((m: any) => {
        if (m.task_groups && !m.task_groups.closed_at) {
          groupsMap.set(m.task_groups.id, m.task_groups);
        }
      });

      const groups = Array.from(groupsMap.values());
      if (groups.length === 0) continue;

      const groupIds = groups.map(g => g.id);

      // Also get subgroups
      const { data: subgroups } = await supabase
        .from("task_groups")
        .select("id, parent_id")
        .in("parent_id", groupIds);
      const allGroupIds = [...groupIds, ...(subgroups || []).map(sg => sg.id)];

      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, is_completed, deadline, original_deadline, assigned_to, completed_at, group_id, created_at")
        .in("group_id", allGroupIds);

      if (!tasks || tasks.length === 0) continue;

      // Subtasks
      const taskIds = tasks.map(t => t.id);
      const { data: subtasks } = await supabase
        .from("subtasks")
        .select("id, task_id, title, is_completed, deadline, assigned_to")
        .in("task_id", taskIds);

      const allSubtasks = subtasks || [];

      // === Weekly stats ===
      const completedThisWeek = tasks.filter(t => t.is_completed && t.completed_at && t.completed_at >= weekAgoIso);
      const createdThisWeek = tasks.filter(t => t.created_at >= weekAgoIso);
      const totalActive = tasks.filter(t => !t.is_completed).length;
      const overdue = tasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now);
      const driftTasks = tasks.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline);

      // Next week deadlines
      const nextWeekEnd = new Date(now);
      nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
      const nextWeekTasks = tasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= nextWeekEnd);

      // Overdue steps
      const overdueSteps = allSubtasks.filter(s => !s.is_completed && s.deadline && new Date(s.deadline) < now);
      const completedStepsThisWeek = allSubtasks.filter(s => s.is_completed); // rough, no completed_at on subtasks

      // Tasks without assignee
      const unassigned = tasks.filter(t => !t.is_completed && !t.assigned_to);

      // Per-project summary
      const projectStats = groups.map(g => {
        const projGroupIds = [g.id, ...(subgroups || []).filter(sg => sg.parent_id === g.id).map(sg => sg.id)];
        const projTasks = tasks.filter(t => projGroupIds.includes(t.group_id!));
        const completed = projTasks.filter(t => t.is_completed).length;
        const total = projTasks.length;
        const projComplWeek = projTasks.filter(t => t.is_completed && t.completed_at && t.completed_at >= weekAgoIso).length;
        const projOverdue = projTasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now).length;
        return { name: g.name, icon: g.icon, total, completed, projComplWeek, projOverdue };
      }).filter(p => p.total > 0);

      // Build message
      const pct = totalActive + completedThisWeek.length > 0
        ? Math.round((completedThisWeek.length / (totalActive + completedThisWeek.length)) * 100)
        : 0;

      const lines: string[] = [
        `📊 <b>Недельный ревью · ${now.toLocaleDateString("ru-RU")}</b>`,
        ``,
        `<b>📈 Итоги недели:</b>`,
        `  ✅ Выполнено: <b>${completedThisWeek.length}</b> задач`,
        `  📝 Создано: <b>${createdThisWeek.length}</b> новых`,
        `  📌 В работе: <b>${totalActive}</b>`,
        `  ⚠️ Просрочено: <b>${overdue.length}</b>`,
        `  ↗ Drift: <b>${driftTasks.length}</b>`,
      ];

      if (unassigned.length > 0) {
        lines.push(`  👤 Без ответственного: <b>${unassigned.length}</b>`);
      }

      // Project breakdown
      if (projectStats.length > 0) {
        lines.push(``, `<b>📁 По проектам:</b>`);
        projectStats.slice(0, 8).forEach(p => {
          const pctP = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
          const overdueHint = p.projOverdue > 0 ? ` ⚠${p.projOverdue}` : "";
          const weekHint = p.projComplWeek > 0 ? ` (+${p.projComplWeek} за нед.)` : "";
          lines.push(`  ${p.icon || "📁"} ${p.name}: ${pctP}% (${p.completed}/${p.total})${weekHint}${overdueHint}`);
        });
      }

      // Overdue tasks
      if (overdue.length > 0) {
        lines.push(``, `<b>⚠️ Просроченные:</b>`);
        overdue.slice(0, 5).forEach(t => {
          const dl = t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "";
          const assignee = t.assigned_to ? profileMap[t.assigned_to] : "—";
          lines.push(`  • ${t.title} (${dl}, ${assignee})`);
        });
        if (overdue.length > 5) lines.push(`  ... и ещё ${overdue.length - 5}`);
      }

      // Next week
      if (nextWeekTasks.length > 0) {
        lines.push(``, `<b>📅 Дедлайны на следующей неделе:</b>`);
        nextWeekTasks.slice(0, 5).forEach(t => {
          const dl = t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "";
          const assignee = t.assigned_to ? profileMap[t.assigned_to] : "";
          lines.push(`  • ${t.title} (${dl}${assignee ? `, ${assignee}` : ""})`);
        });
        if (nextWeekTasks.length > 5) lines.push(`  ... и ещё ${nextWeekTasks.length - 5}`);
      }

      // Overdue steps
      if (overdueSteps.length > 0) {
        lines.push(``, `<b>⏰ Просроченные шаги: ${overdueSteps.length}</b>`);
        overdueSteps.slice(0, 3).forEach(s => {
          const parent = tasks.find(t => t.id === s.task_id);
          const assignee = s.assigned_to ? profileMap[s.assigned_to] : "—";
          lines.push(`  • ${s.title} (${assignee})${parent ? ` ← ${parent.title}` : ""}`);
        });
      }

      // Motivation
      if (completedThisWeek.length >= 10) {
        lines.push(``, `🔥 Отличная неделя! ${completedThisWeek.length} задач закрыто!`);
      } else if (completedThisWeek.length >= 5) {
        lines.push(``, `💪 Хорошая продуктивность! Так держать.`);
      } else if (overdue.length > 0) {
        lines.push(``, `⚡ На следующей неделе стоит сфокусироваться на просроченных задачах.`);
      }

      lines.push(``, `<i>Хороших выходных! 🎉</i>`);

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

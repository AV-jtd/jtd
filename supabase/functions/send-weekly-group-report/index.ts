import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { isOverdue, startOfTodayMoscow } from "../_shared/time.ts";
import { byDeadline, driftDays } from "../_shared/reportFormat.ts";
import { buildWeeklyGroupReport, type ReportPerson } from "../_shared/weeklyGroupReport.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");

const APP_URL = "https://justtodoit.ru";

Deno.serve(async (req) => {
  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN not set" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Friday only (Moscow)
  const moscowNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  if (moscowNow.getDay() !== 5) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "not friday" }));
  }

  // Get all linked group chats
  const { data: links, error: linksErr } = await supabase
    .from("telegram_group_chats")
    .select("group_id, telegram_chat_id, telegram_chat_title");

  if (linksErr || !links || links.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no linked chats" }));
  }

  // Resolve groups — only root projects (parent_id IS NULL, not closed)
  const groupIds = links.map(l => l.group_id);
  const { data: groups } = await supabase
    .from("task_groups")
    .select("id, name, color, parent_id, closed_at")
    .in("id", groupIds);

  const rootGroups = (groups || []).filter(g => !g.parent_id && !g.closed_at);
  if (rootGroups.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no root linked projects" }));
  }

  // Имена и ники Telegram: ник нужен для @-упоминания в блоке человека.
  const { data: allProfiles } = await supabase
    .from("profiles").select("id, display_name, telegram_username").limit(1000);
  const people: Record<string, ReportPerson> = {};
  (allProfiles || []).forEach((p: any) => {
    people[p.id] = { name: p.display_name || "Без имени", telegram_username: p.telegram_username };
  });

  const now = new Date();
  const dayStart = startOfTodayMoscow();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
  // Срок заданий — конец пятницы следующей недели (отчёт уходит в пятницу).
  const dueBy = new Date(dayStart.getTime() + 8 * 86400000 - 1);

  let sentCount = 0;
  const errors: string[] = [];

  const weekStart = weekStartMoscow();

  for (const root of rootGroups) {
    const link = links.find(l => l.group_id === root.id)!;
    try {
      // Idempotency guard: one report per group chat per week
      const { error: claimErr } = await supabase
        .from("weekly_send_log")
        .insert({ report_type: "group_report", chat_id: link.telegram_chat_id, recipient_id: root.id, week_start: weekStart });
      if (claimErr) {
        continue; // already sent this week
      }
      // Include subgroups
      const { data: subgroups } = await supabase
        .from("task_groups")
        .select("id")
        .eq("parent_id", root.id);
      const allGroupIds = [root.id, ...(subgroups || []).map(s => s.id)];

      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, is_completed, is_draft, deadline, original_deadline, assigned_to, completed_at, created_at, group_id")
        .in("group_id", allGroupIds);

      if (!tasks || tasks.length === 0) continue;

      const taskIds = tasks.map(t => t.id);
      const { data: subtasks } = await supabase
        .from("subtasks")
        .select("id, task_id, title, is_completed, deadline, assigned_to")
        .in("task_id", taskIds);
      const allSubtasks = subtasks || [];

      // Stats
      const total = tasks.length;
      const completed = tasks.filter(t => t.is_completed).length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      // Просрочка считается по началу суток (МСК), а не по моменту запуска крона:
      // задача со сроком «сегодня» не просрочена. Та же граница используется для
      // weekTasks, иначе задача на сегодня выпала бы из обоих списков.
      // Просроченные — от самой давней к свежей. Раньше бралось slice(0,5) из
      // результата запроса без ORDER BY: в топ-5 попадало что придётся, и
      // задача, висящая три месяца, могла не показаться вовсе.
      const overdue = tasks
        .filter(t => !t.is_completed && isOverdue(t.deadline, dayStart))
        .sort(byDeadline);
      const completedThisWeek = tasks.filter(t => t.is_completed && t.completed_at && new Date(t.completed_at) >= weekAgo);
      const createdThisWeek = tasks.filter(t => t.created_at && new Date(t.created_at) >= weekAgo);
      // Ближайшие дедлайны — по возрастанию даты. Смысл раздела именно в
      // порядке: без сортировки понедельник мог прятаться за пятницей.
      const weekTasks = tasks
        .filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= dayStart && new Date(t.deadline) <= weekEnd)
        .sort(byDeadline);
      // Drift — не просто счётчик, а кто именно и на сколько уехал.
      // Считаем только незакрытые: сдвиг у сделанной задачи уже неактуален.
      const driftTasks = tasks
        .filter(t => !t.is_completed && t.original_deadline && t.deadline && t.original_deadline !== t.deadline)
        .map(t => ({ ...t, drift: driftDays(t.original_deadline, t.deadline) }))
        .sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));
      const overdueSteps = allSubtasks.filter(s => !s.is_completed && isOverdue(s.deadline, dayStart));
      const stepsNoDeadline = allSubtasks.filter(s => !s.is_completed && !s.deadline);
      const stepsNoAssignee = allSubtasks.filter(s => !s.is_completed && !s.assigned_to);

      // Разрез по людям. done — за НЕДЕЛЮ, а не за всю жизнь проекта:
      // в недельном отчёте историческое число забивает недельное, и человек
      // с большим прошлым выглядит продуктивным в любую неделю.
      const byAssignee: Record<string, { done: number; open: number; overdue: number }> = {};
      tasks.forEach(t => {
        const a = t.assigned_to || "—";
        if (!byAssignee[a]) byAssignee[a] = { done: 0, open: 0, overdue: 0 };
        if (t.is_completed) {
          if (t.completed_at && new Date(t.completed_at) >= weekAgo) byAssignee[a].done++;
        } else {
          byAssignee[a].open++;
          if (isOverdue(t.deadline, dayStart)) byAssignee[a].overdue++;
        }
      });

      // Снимок прошлой недели для дельты. Берём самый свежий строго до текущей
      // недели, а не «ровно минус 7 дней»: если неделю пропустили, сравнение
      // всё равно осмысленное, просто с более давней точкой.
      const { data: prevRows } = await supabase
        .from("group_report_metrics")
        .select("metrics")
        .eq("group_id", root.id)
        .lt("week_start", weekStart)
        .order("week_start", { ascending: false })
        .limit(1);
      const prev = prevRows?.[0]?.metrics as Record<string, number> | undefined;

      const snapshot = {
        overdue: overdue.length,
        overdueSteps: overdueSteps.length,
        drift: driftTasks.length,
        completedThisWeek: completedThisWeek.length,
        createdThisWeek: createdThisWeek.length,
        weekTasks: weekTasks.length,
        open: total - completed,
        pct,
      };

      // Текст — задания по людям (решение владельца 30.09): см.
      // _shared/weeklyGroupReport.ts. Цифры выше нужны для снимка недели.
      const text = buildWeeklyGroupReport({
        projectName: root.name,
        projectUrl: `${APP_URL}/?group=${root.id}`,
        tasks: tasks.filter(t => !t.is_draft),
        people,
        dayStart,
        dueBy,
        weekAgo,
        prevOverdue: prev?.overdue,
      });


      // Telegram has 4096 char limit
      const chunks: string[] = [];
      let current = "";
      text.split("\n").forEach(line => {
        if ((current + line + "\n").length > 4000) {
          chunks.push(current);
          current = line + "\n";
        } else {
          current += line + "\n";
        }
      });
      if (current) chunks.push(current);

      let delivered = true;
      for (const chunk of chunks) {
        const tgResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: link.telegram_chat_id,
            text: chunk,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        });
        if (!tgResp.ok) {
          const errBody = await tgResp.text();
          errors.push(`${root.name} → ${link.telegram_chat_id}: ${errBody}`);
          // Release claim so a later run can retry this group
          await supabase.from("weekly_send_log").delete()
            .match({ report_type: "group_report", chat_id: link.telegram_chat_id, week_start: weekStart });
          delivered = false;
          break;
        }
      }
      // Раньше sentCount рос даже после неудачной отправки — счётчик врал.
      if (!delivered) continue;

      // Снимок пишем только после успешной доставки: иначе следующая неделя
      // сравнивалась бы с отчётом, которого никто не видел. upsert, а не
      // insert — повторный прогон за ту же неделю не должен падать.
      const { error: snapErr } = await supabase
        .from("group_report_metrics")
        .upsert({ group_id: root.id, week_start: weekStart, metrics: snapshot }, { onConflict: "group_id,week_start" });
      if (snapErr) console.error(`Снимок метрик не сохранён для ${root.name}:`, snapErr.message);

      sentCount++;
    } catch (e) {
      console.error(`Error for project ${root.name}:`, e);
      errors.push(`${root.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent: sentCount, errors }));
});

function weekStartMoscow(): string {
  const m = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const day = m.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  m.setDate(m.getDate() + diff);
  return m.toISOString().slice(0, 10);
}

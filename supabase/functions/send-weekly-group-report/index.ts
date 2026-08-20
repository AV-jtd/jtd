import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { isOverdue, startOfTodayMoscow } from "../_shared/time.ts";
import { byDeadline, daysLate, delta, driftDays } from "../_shared/reportFormat.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

const APP_URL = "https://justtodoit.ru";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

  // Profile names cache
  const { data: allProfiles } = await supabase.from("profiles").select("id, display_name").limit(500);
  const profileName: Record<string, string> = {};
  (allProfiles || []).forEach((p: any) => { profileName[p.id] = p.display_name || "Без имени"; });

  const now = new Date();
  const dayStart = startOfTodayMoscow();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);

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
        .select("id, title, is_completed, deadline, original_deadline, assigned_to, completed_at, created_at, group_id")
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

      // Шапка: сначала то, что изменилось за неделю, потом состояние.
      // Общий прогресс ушёл вниз — он считается по всем задачам за всю жизнь
      // проекта, почти монотонен и не способен показать, что дела плохи.
      const lines: string[] = [
        `📊 <b>Еженедельный отчёт · ${escapeHtml(root.name)}</b>`,
        `<i>${now.toLocaleDateString("ru-RU")}</i>`,
        ``,
        `<b>За неделю</b>`,
        `✅ Закрыто: <b>${completedThisWeek.length}</b>${delta(completedThisWeek.length, prev?.completedThisWeek, "up")}`,
        `🆕 Создано: <b>${createdThisWeek.length}</b>${delta(createdThisWeek.length, prev?.createdThisWeek, "neutral")}`,
        ``,
        `<b>Сейчас</b>`,
        `⚠️ Просрочено: <b>${overdue.length}</b>${delta(overdue.length, prev?.overdue, "down")}${overdueSteps.length > 0 ? ` · шагов: <b>${overdueSteps.length}</b>${delta(overdueSteps.length, prev?.overdueSteps, "down")}` : ""}`,
        `🔄 В работе: <b>${total - completed}</b>${delta(total - completed, prev?.open, "down")}`,
        `📅 Дедлайнов на следующей неделе: <b>${weekTasks.length}</b>`,
      ];
      if (driftTasks.length > 0) {
        lines.push(`↔ Сроки сдвигали: <b>${driftTasks.length}</b>${delta(driftTasks.length, prev?.drift, "down")}`);
      }
      if (!prev) {
        lines.push(``, `<i>Первый отчёт по проекту — сравнивать пока не с чем, со следующей недели появится динамика.</i>`);
      }

      // Top overdue
      if (overdue.length > 0) {
        lines.push(``, `<b>⚠️ Просроченные</b> <i>(самые давние сверху):</i>`);
        overdue.slice(0, 5).forEach(t => {
          const a = t.assigned_to ? profileName[t.assigned_to] : "не назначен";
          const late = t.deadline ? daysLate(t.deadline, dayStart) : 0;
          lines.push(`  • ${escapeHtml(t.title)} — <b>${late} дн.</b>, ${escapeHtml(a)}`);
        });
        if (overdue.length > 5) lines.push(`  … и ещё ${overdue.length - 5}`);
      }

      // Week ahead
      if (weekTasks.length > 0) {
        lines.push(``, `<b>📅 На следующей неделе</b> <i>(по датам):</i>`);
        weekTasks.slice(0, 5).forEach(t => {
          const dl = t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "";
          const a = t.assigned_to ? profileName[t.assigned_to] : "не назначен";
          lines.push(`  • ${dl} — ${escapeHtml(t.title)}, ${escapeHtml(a)}`);
        });
        if (weekTasks.length > 5) lines.push(`  … и ещё ${weekTasks.length - 5}`);
      }

      // Drift поимённо: голый счётчик "↔ Drift: 12" вызывал тревогу, но не
      // подсказывал ни одного действия. Показываем, что именно уехало.
      if (driftTasks.length > 0) {
        lines.push(``, `<b>↔ Сроки сдвигали:</b>`);
        driftTasks.slice(0, 3).forEach(t => {
          const a = t.assigned_to ? profileName[t.assigned_to] : "не назначен";
          const sign = t.drift > 0 ? "+" : "−";
          lines.push(`  • ${escapeHtml(t.title)} — <b>${sign}${Math.abs(t.drift)} дн.</b>, ${escapeHtml(a)}`);
        });
        if (driftTasks.length > 3) lines.push(`  … и ещё ${driftTasks.length - 3}`);
      }

      // By assignee
      const assigneeRows = Object.entries(byAssignee)
        .filter(([id]) => id !== "—")
        .map(([id, s]) => ({ name: profileName[id] || "Без имени", ...s }))
        .sort((a, b) => (b.open + b.overdue) - (a.open + a.overdue))
        .slice(0, 8);
      if (assigneeRows.length > 0) {
        lines.push(``, `<b>👥 По участникам</b> <i>(✅ за неделю · 🔄 в работе · ⚠️ просрочено):</i>`);
        assigneeRows.forEach(r => {
          lines.push(`  • ${escapeHtml(r.name)}: ✅${r.done} · 🔄${r.open}${r.overdue > 0 ? ` · ⚠️${r.overdue}` : ""}`);
        });
      }

      // Attention
      if (stepsNoDeadline.length > 0 || stepsNoAssignee.length > 0) {
        lines.push(``, `<b>💡 Требуют внимания:</b>`);
        if (stepsNoDeadline.length > 0) lines.push(`  📌 ${stepsNoDeadline.length} шагов без срока`);
        if (stepsNoAssignee.length > 0) lines.push(`  👤 ${stepsNoAssignee.length} шагов без ответственного`);
      }

      // Общий прогресс — внизу, справочно.
      lines.push(``, `<i>Прогресс по проекту: ${pct}% (${completed}/${total})</i>`);

      // AI summary
      let aiSummary = "";
      if (OPENROUTER_API_KEY) {
        try {
          const prompt = `Ты — ИИ-менеджер проектов. Составь короткий weekly review (3-5 строк) для команды проекта "${root.name}" на русском языке.

Данные за неделю (в скобках — было неделю назад, если известно):
- Закрыто за неделю: ${completedThisWeek.length}${prev ? ` (было ${prev.completedThisWeek})` : ""}
- Создано за неделю: ${createdThisWeek.length}${prev ? ` (было ${prev.createdThisWeek})` : ""}
- Просрочено задач: ${overdue.length}${prev ? ` (было ${prev.overdue})` : ""}, шагов: ${overdueSteps.length}
- В работе: ${total - completed}${prev ? ` (было ${prev.open})` : ""}
- Дедлайнов на след. неделе: ${weekTasks.length}
- Задач со сдвинутым сроком: ${driftTasks.length}${prev ? ` (было ${prev.drift})` : ""}
- Шагов без срока: ${stepsNoDeadline.length}, без ответственного: ${stepsNoAssignee.length}
- Прогресс по проекту: ${pct}% (${completed}/${total})

Топ просроченных: ${overdue.slice(0, 3).map(t => `"${t.title}" (${t.assigned_to ? profileName[t.assigned_to] : "не назначен"}, ${t.deadline ? daysLate(t.deadline, dayStart) : 0} дн. просрочки)`).join(", ") || "нет"}
Сильнее всего сдвинули сроки: ${driftTasks.slice(0, 3).map(t => `"${t.title}" (${t.drift > 0 ? "+" : "−"}${Math.abs(t.drift)} дн.)`).join(", ") || "нет"}

Главное: команда УЖЕ видит все эти цифры списком в том же сообщении. Не пересказывай их. Говори о том, чего в цифрах не видно: что изменилось к прошлой неделе и что это значит, какая динамика тревожит, что сделать в понедельник.
${prev ? "" : "Прошлой недели для сравнения нет — это первый отчёт, о динамике не говори."}
Формат: 1) оценка динамики одной строкой, 2) 1-2 главных риска, 3) 1-2 конкретные рекомендации команде. Без markdown, эмодзи в начале строк допустимы. Кратко, по делу.`;

          const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://justtodoit.ru",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [{ role: "user", content: prompt }],
              max_tokens: 400,
            }),
          });
          if (aiResp.ok) {
            const aiJson = await aiResp.json();
            aiSummary = aiJson.choices?.[0]?.message?.content?.trim() || "";
          }
        } catch (e) {
          console.warn(`AI summary failed for ${root.name}:`, e);
        }
      }

      if (aiSummary) {
        lines.push(``, `<b>🤖 ИИ-резюме:</b>`, escapeHtml(aiSummary));
      }

      // Ссылка на проект — чтобы из чата можно было сразу провалиться в задачи.
      lines.push(``, `<a href="${APP_URL}/?group=${root.id}">Открыть проект в JTD →</a>`);

      const text = lines.join("\n");

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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

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
      const overdue = tasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now);
      const completedThisWeek = tasks.filter(t => t.is_completed && t.completed_at && new Date(t.completed_at) >= weekAgo);
      const createdThisWeek = tasks.filter(t => t.created_at && new Date(t.created_at) >= weekAgo);
      const weekTasks = tasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekEnd);
      const driftTasks = tasks.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline);
      const overdueSteps = allSubtasks.filter(s => !s.is_completed && s.deadline && new Date(s.deadline) < now);
      const stepsNoDeadline = allSubtasks.filter(s => !s.is_completed && !s.deadline);
      const stepsNoAssignee = allSubtasks.filter(s => !s.is_completed && !s.assigned_to);

      // Per-assignee breakdown
      const byAssignee: Record<string, { done: number; open: number; overdue: number }> = {};
      tasks.forEach(t => {
        const a = t.assigned_to || "—";
        if (!byAssignee[a]) byAssignee[a] = { done: 0, open: 0, overdue: 0 };
        if (t.is_completed) byAssignee[a].done++;
        else {
          byAssignee[a].open++;
          if (t.deadline && new Date(t.deadline) < now) byAssignee[a].overdue++;
        }
      });

      // Build static section
      const lines: string[] = [
        `📊 <b>Еженедельный отчёт · ${escapeHtml(root.name)}</b>`,
        `<i>${now.toLocaleDateString("ru-RU")}</i>`,
        ``,
        `📈 Прогресс: <b>${pct}%</b> (${completed}/${total})`,
        `✅ Закрыто за неделю: <b>${completedThisWeek.length}</b>`,
        `🆕 Создано за неделю: <b>${createdThisWeek.length}</b>`,
        `📅 Дедлайнов на следующей неделе: <b>${weekTasks.length}</b>`,
        `⚠️ Просрочено: <b>${overdue.length}</b>${overdueSteps.length > 0 ? ` задач, <b>${overdueSteps.length}</b> шагов` : ""}`,
      ];
      if (driftTasks.length > 0) lines.push(`↔ Drift: <b>${driftTasks.length}</b>`);

      // Top overdue
      if (overdue.length > 0) {
        lines.push(``, `<b>⚠️ Просроченные:</b>`);
        overdue.slice(0, 5).forEach(t => {
          const dl = t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "";
          const a = t.assigned_to ? profileName[t.assigned_to] : "—";
          lines.push(`  • ${escapeHtml(t.title)} (${dl}, ${escapeHtml(a)})`);
        });
        if (overdue.length > 5) lines.push(`  … и ещё ${overdue.length - 5}`);
      }

      // Week ahead
      if (weekTasks.length > 0) {
        lines.push(``, `<b>📅 На следующей неделе:</b>`);
        weekTasks.slice(0, 5).forEach(t => {
          const dl = t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "";
          const a = t.assigned_to ? profileName[t.assigned_to] : "—";
          lines.push(`  • ${escapeHtml(t.title)} (${dl}, ${escapeHtml(a)})`);
        });
        if (weekTasks.length > 5) lines.push(`  … и ещё ${weekTasks.length - 5}`);
      }

      // By assignee
      const assigneeRows = Object.entries(byAssignee)
        .filter(([id]) => id !== "—")
        .map(([id, s]) => ({ name: profileName[id] || "Без имени", ...s }))
        .sort((a, b) => (b.open + b.overdue) - (a.open + a.overdue))
        .slice(0, 8);
      if (assigneeRows.length > 0) {
        lines.push(``, `<b>👥 По участникам:</b>`);
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

      // AI summary
      let aiSummary = "";
      if (OPENROUTER_API_KEY) {
        try {
          const prompt = `Ты — ИИ-менеджер проектов. Составь короткий weekly review (3-5 строк) для команды проекта "${root.name}" на русском языке.

Данные за неделю:
- Прогресс: ${pct}% (${completed}/${total})
- Закрыто за неделю: ${completedThisWeek.length}
- Создано за неделю: ${createdThisWeek.length}
- Просрочено задач: ${overdue.length}, шагов: ${overdueSteps.length}
- Дедлайнов на след. неделе: ${weekTasks.length}
- Drift (сдвиг сроков): ${driftTasks.length}
- Шагов без срока: ${stepsNoDeadline.length}, без ответственного: ${stepsNoAssignee.length}

Топ просроченных: ${overdue.slice(0, 3).map(t => `"${t.title}" (${t.assigned_to ? profileName[t.assigned_to] : "—"})`).join(", ") || "нет"}

Формат: 1) краткая оценка состояния (1 строка), 2) 1-2 главных риска, 3) 1-2 рекомендации команде. Без markdown, эмодзи в начале строк допустимы. Кратко, по делу.`;

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
          break;
        }
      }
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

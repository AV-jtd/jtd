import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function buildReportHtml(report: any): string {
  const { title, report_data: data, ai_summary, created_at } = report;
  const d = data || {};
  const projects = d.projects || [];
  const summary = d.summary || {};
  const dateStr = new Date(created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const weekTasks = d.weekTasks || [];
  const overdueTasks = d.overdueTasks || [];
  const driftTasks = d.driftTasks || [];
  const upcomingTasks = d.upcomingTasks || [];

  const statusColors: Record<string, string> = {
    "on-track": "#10b981",
    "at-risk": "#f59e0b",
    "overdue": "#ef4444",
    "completed": "#6b7280",
  };
  const statusLabels: Record<string, string> = {
    "on-track": "В графике",
    "at-risk": "Drift",
    "overdue": "Просрочено",
    "completed": "Завершён",
  };

  const projectCards = projects.map((p: any) => {
    const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
    const statusColor = statusColors[p.timingStatus] || "#6b7280";
    const statusLabel = statusLabels[p.timingStatus] || p.timingStatus;
    return `<div class="project-card">
      <div class="project-header">
        <div class="project-icon" style="background:${p.color || '#3b82f6'}">${(p.name || "?")[0].toUpperCase()}</div>
        <div class="project-info">
          <div class="project-name">${p.name}<span class="status-badge" style="background:${statusColor}15;color:${statusColor};border-color:${statusColor}30">${statusLabel}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${p.color || '#3b82f6'}"></div></div>
          <div class="project-meta">${pct}% · ${p.completed}/${p.total} задач${p.overdue > 0 ? ` · <span style="color:#ef4444">⚠ ${p.overdue} просрочено</span>` : ""}${p.driftCount > 0 ? ` · <span style="color:#f59e0b">↔ ${p.driftCount} drift</span>` : ""}</div>
        </div>
      </div>
    </div>`;
  }).join("");

  const stepsLabel = (t: any) => t.stepsTotal > 0 ? `<span style="font-size:11px;color:${t.stepsCompleted === t.stepsTotal ? '#10b981' : '#3b82f6'};margin-left:4px">✓${t.stepsCompleted}/${t.stepsTotal}</span>` : "";

  const taskRow = (t: any, extra?: string) =>
    `<tr><td class="task-title">${t.title}${stepsLabel(t)}</td><td>${t.assignee || "—"}</td><td>${t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "—"}</td>${extra ? `<td>${extra}</td>` : ""}</tr>`;

  const overdueSection = overdueTasks.length > 0 ? `
    <div class="section">
      <h2>⚠️ Просроченные задачи (${overdueTasks.length})</h2>
      <table><thead><tr><th>Задача</th><th>Ответственный</th><th>Дедлайн</th></tr></thead>
      <tbody>${overdueTasks.map((t: any) => taskRow(t)).join("")}</tbody></table>
    </div>` : "";

  const weekSection = weekTasks.length > 0 ? `
    <div class="section">
      <h2>📅 Дедлайны на этой неделе (${weekTasks.length})</h2>
      <table><thead><tr><th>Задача</th><th>Ответственный</th><th>Дедлайн</th></tr></thead>
      <tbody>${weekTasks.map((t: any) => taskRow(t)).join("")}</tbody></table>
    </div>` : "";

  const driftSection = driftTasks.length > 0 ? `
    <div class="section">
      <h2>↔ Задачи с отклонениями (${driftTasks.length})</h2>
      <table><thead><tr><th>Задача</th><th>Ответственный</th><th>Дедлайн</th><th>Drift</th></tr></thead>
      <tbody>${driftTasks.map((t: any) => taskRow(t, `<span style="color:#f59e0b">+${t.driftDays} дн.</span>`)).join("")}</tbody></table>
    </div>` : "";

  const upcomingSection = upcomingTasks.length > 0 ? `
    <div class="section">
      <h2>📋 Ближайшие планы</h2>
      <table><thead><tr><th>Задача</th><th>Ответственный</th><th>Дедлайн</th></tr></thead>
      <tbody>${upcomingTasks.map((t: any) => taskRow(t)).join("")}</tbody></table>
    </div>` : "";

  const aiSection = ai_summary ? `
    <div class="section ai-section">
      <h2>🤖 ИИ-анализ</h2>
      <div class="ai-content">${ai_summary.replace(/\n/g, "<br/>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/^- /gm, "• ")}</div>
    </div>` : "";

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#f8fafc; color:#1e293b; line-height:1.6; }
  .container { max-width:800px; margin:0 auto; padding:32px 24px; }
  .header { text-align:center; margin-bottom:32px; }
  .header h1 { font-size:28px; font-weight:700; color:#0f172a; }
  .header .date { font-size:14px; color:#64748b; margin-top:4px; }
  .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:32px; }
  .metric { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; text-align:center; }
  .metric .value { font-size:28px; font-weight:700; }
  .metric .label { font-size:12px; color:#64748b; margin-top:4px; }
  .section { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:16px; }
  .section h2 { font-size:16px; font-weight:600; margin-bottom:12px; }
  .project-card { border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:8px; }
  .project-header { display:flex; gap:12px; align-items:center; }
  .project-icon { width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:600; font-size:14px; flex-shrink:0; }
  .project-info { flex:1; min-width:0; }
  .project-name { font-size:14px; font-weight:600; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .status-badge { font-size:10px; padding:2px 8px; border-radius:99px; border:1px solid; font-weight:500; }
  .progress-bar { height:6px; background:#f1f5f9; border-radius:3px; margin:6px 0 4px; }
  .progress-fill { height:100%; border-radius:3px; transition:width .3s; }
  .project-meta { font-size:12px; color:#64748b; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { text-align:left; padding:8px 12px; background:#f8fafc; border-bottom:2px solid #e2e8f0; color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; }
  td { padding:8px 12px; border-bottom:1px solid #f1f5f9; }
  .task-title { font-weight:500; max-width:300px; }
  .ai-section { background:linear-gradient(135deg,#f0f9ff,#faf5ff); border-color:#c7d2fe; }
  .ai-content { font-size:13px; line-height:1.8; color:#334155; }
  .footer { text-align:center; margin-top:32px; font-size:12px; color:#94a3b8; }
  @media (max-width:640px) { .metrics { grid-template-columns:repeat(2,1fr); } }
  @media print { body { background:#fff; } .container { padding:16px; } }
</style></head><body>
<div class="container">
  <div class="header">
    <h1>${title}</h1>
    <div class="date">${dateStr}</div>
  </div>
  <div class="metrics">
    <div class="metric"><div class="value" style="color:#3b82f6">${summary.completionRate || 0}%</div><div class="label">Прогресс</div></div>
    <div class="metric"><div class="value" style="color:#3b82f6">${summary.tasksThisWeek || 0}</div><div class="label">Дедлайнов</div></div>
    <div class="metric"><div class="value" style="color:#ef4444">${summary.totalOverdue || 0}</div><div class="label">Просрочено</div></div>
    <div class="metric"><div class="value" style="color:#f59e0b">${summary.totalDrift || 0}</div><div class="label">Drift</div></div>
  </div>
  ${aiSection}
  ${overdueSection}
  ${weekSection}
  ${driftSection}
  <div class="section">
    <h2>📊 Проекты (${projects.length})</h2>
    ${projectCards}
  </div>
  ${upcomingSection}
  <div class="footer">Отчёт создан в JustTODOit · ${dateStr}</div>
</div>
</body></html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: report, error } = await supabase
    .from("dashboard_reports")
    .select("*")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !report) {
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc"><div style="text-align:center"><h1>404</h1><p>Отчёт не найден или срок действия ссылки истёк</p></div></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const html = buildReportHtml(report);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function buildReportHtml(report: any): string {
  const { title, report_data: data, ai_summary, created_at } = report;
  const d = data || {};
  const projects = d.projects || [];
  const summary = d.summary || {};
  const dateStr = new Date(created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const periodLabel = d.periodLabel || dateStr;
  const weekTasks = d.weekTasks || [];
  const overdueTasks = d.overdueTasks || [];
  const driftTasks = d.driftTasks || [];
  const upcomingTasks = d.upcomingTasks || [];
  const completedTasks = d.completedTasks || [];

  const statusColors: Record<string, string> = {
    "on-track": "#10b981", "at-risk": "#f59e0b", "overdue": "#ef4444", "completed": "#6b7280",
  };
  const statusLabels: Record<string, string> = {
    "on-track": "В графике", "at-risk": "Drift", "overdue": "Просрочено", "completed": "Завершён",
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

  const stepsLabel = (t: any) => t.stepsTotal > 0 ? `<span class="steps-badge" style="color:${t.stepsCompleted === t.stepsTotal ? '#10b981' : '#3b82f6'}">✓${t.stepsCompleted}/${t.stepsTotal}</span>` : "";

  const taskRow = (t: any, extra?: string) =>
    `<tr><td class="task-title">${t.title}${stepsLabel(t)}</td><td>${t.assignee || "—"}</td><td>${t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "—"}</td>${extra ? `<td>${extra}</td>` : ""}</tr>`;

  const buildSection = (id: string, icon: string, title: string, tasks: any[], extraHeader?: string) => {
    if (tasks.length === 0) return "";
    return `
    <div class="section collapsible" id="section-${id}">
      <h2 onclick="toggleSection('${id}')" class="section-toggle">
        <span>${icon} ${title} <span class="count">(${tasks.length})</span></span>
        <span class="chevron" id="chevron-${id}">▾</span>
      </h2>
      <div class="section-body" id="body-${id}">
        <table><thead><tr><th>Задача</th><th>Ответственный</th><th>Дата</th>${extraHeader ? `<th>${extraHeader}</th>` : ""}</tr></thead>
        <tbody>${tasks.map((t: any) => taskRow(t, t.driftDays !== undefined ? `<span style="color:#f59e0b;font-weight:600">+${t.driftDays} дн.</span>` : undefined)).join("")}</tbody></table>
      </div>
    </div>`;
  };

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
  .container { max-width:860px; margin:0 auto; padding:32px 24px; }
  .header { text-align:center; margin-bottom:32px; padding-bottom:20px; border-bottom:3px solid #3b82f6; }
  .header h1 { font-size:26px; font-weight:700; color:#0f172a; }
  .header .meta { font-size:13px; color:#64748b; margin-top:6px; }
  .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; margin-bottom:28px; }
  .metric { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; text-align:center; transition:transform .15s,box-shadow .15s; cursor:default; }
  .metric:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.06); }
  .metric .value { font-size:28px; font-weight:700; }
  .metric .label { font-size:11px; color:#64748b; margin-top:4px; text-transform:uppercase; letter-spacing:.3px; }
  .section { background:#fff; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:12px; overflow:hidden; }
  .section h2 { font-size:15px; font-weight:600; padding:14px 20px; margin:0; display:flex; justify-content:space-between; align-items:center; }
  .section-toggle { cursor:pointer; user-select:none; }
  .section-toggle:hover { background:#f8fafc; }
  .chevron { font-size:14px; color:#94a3b8; transition:transform .2s; }
  .count { font-size:12px; font-weight:400; color:#94a3b8; }
  .section-body { padding:0 20px 16px; }
  .project-card { border:1px solid #e2e8f0; border-radius:10px; padding:14px; margin-bottom:8px; transition:border-color .15s; }
  .project-card:hover { border-color:#93c5fd; }
  .project-header { display:flex; gap:12px; align-items:center; }
  .project-icon { width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:600; font-size:14px; flex-shrink:0; }
  .project-info { flex:1; min-width:0; }
  .project-name { font-size:14px; font-weight:600; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .status-badge { font-size:10px; padding:2px 8px; border-radius:99px; border:1px solid; font-weight:500; }
  .progress-bar { height:6px; background:#f1f5f9; border-radius:3px; margin:6px 0 4px; overflow:hidden; }
  .progress-fill { height:100%; border-radius:3px; transition:width .5s ease; }
  .project-meta { font-size:12px; color:#64748b; }
  .steps-badge { font-size:11px; margin-left:4px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { text-align:left; padding:8px 12px; background:#f8fafc; border-bottom:2px solid #e2e8f0; color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.3px; }
  td { padding:8px 12px; border-bottom:1px solid #f1f5f9; }
  tr:hover td { background:#f8fafc; }
  .task-title { font-weight:500; max-width:340px; }
  .ai-section { background:linear-gradient(135deg,#f0f9ff,#faf5ff); border-color:#c7d2fe; }
  .ai-content { font-size:13px; line-height:1.8; color:#334155; padding:0 20px 16px; }
  .footer { text-align:center; margin-top:28px; font-size:12px; color:#94a3b8; }
  .nav-tabs { display:flex; gap:4px; margin-bottom:20px; flex-wrap:wrap; }
  .nav-tab { padding:6px 14px; border-radius:8px; font-size:12px; font-weight:500; border:1px solid #e2e8f0; background:#fff; cursor:pointer; transition:all .15s; }
  .nav-tab:hover { border-color:#93c5fd; }
  .nav-tab.active { background:#3b82f6; color:#fff; border-color:#3b82f6; }
  .tab-content { display:none; }
  .tab-content.active { display:block; }
  .print-btn { position:fixed; bottom:20px; right:20px; padding:10px 18px; background:#3b82f6; color:#fff; border:none; border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; box-shadow:0 4px 12px rgba(59,130,246,.3); z-index:100; }
  .print-btn:hover { background:#2563eb; }
  @media (max-width:640px) { .metrics { grid-template-columns:repeat(2,1fr); } .container { padding:16px; } }
  @media print { .print-btn { display:none; } body { background:#fff; } .container { padding:16px; } }
</style></head><body>
<div class="container">
  <div class="header">
    <h1>${title}</h1>
    <div class="meta">Период: ${periodLabel} · Создан ${dateStr}</div>
  </div>

  <div class="metrics">
    <div class="metric"><div class="value" style="color:#3b82f6">${summary.completionRate || 0}%</div><div class="label">Прогресс</div></div>
    <div class="metric"><div class="value" style="color:#0f172a">${summary.totalTasks || (summary.tasksThisWeek || 0)}</div><div class="label">Всего задач</div></div>
    <div class="metric"><div class="value" style="color:#10b981">${summary.totalCompleted || 0}</div><div class="label">Выполнено</div></div>
    <div class="metric"><div class="value" style="color:#ef4444">${summary.totalOverdue || 0}</div><div class="label">Просрочено</div></div>
    <div class="metric"><div class="value" style="color:#f59e0b">${summary.totalDrift || 0}</div><div class="label">Drift</div></div>
    <div class="metric"><div class="value" style="color:#3b82f6">${projects.length}</div><div class="label">Проектов</div></div>
  </div>

  <!-- Navigation tabs -->
  <div class="nav-tabs">
    <div class="nav-tab active" onclick="showTab('overview')">Обзор</div>
    <div class="nav-tab" onclick="showTab('tasks')">Задачи</div>
    <div class="nav-tab" onclick="showTab('analysis')">Анализ</div>
  </div>

  <!-- Overview tab -->
  <div class="tab-content active" id="tab-overview">
    <div class="section">
      <h2>📊 Проекты (${projects.length})</h2>
      <div class="section-body">${projectCards || '<p style="color:#94a3b8;font-size:13px">Нет проектов</p>'}</div>
    </div>
  </div>

  <!-- Tasks tab -->
  <div class="tab-content" id="tab-tasks">
    ${buildSection("completed", "✅", "Выполнено за период", completedTasks)}
    ${buildSection("overdue", "⚠️", "Просрочено", overdueTasks)}
    ${buildSection("week", "📅", "Дедлайны на неделе", weekTasks)}
    ${buildSection("drift", "↔", "Перенесённые сроки", driftTasks, "Drift")}
    ${buildSection("upcoming", "📋", "Ближайшие планы", upcomingTasks)}
    ${[completedTasks, overdueTasks, weekTasks, driftTasks, upcomingTasks].every(a => a.length === 0) ? '<div class="section"><div class="section-body"><p style="color:#94a3b8;font-size:13px;padding:12px 0">Нет задач за указанный период</p></div></div>' : ''}
  </div>

  <!-- Analysis tab -->
  <div class="tab-content" id="tab-analysis">
    ${aiSection || '<div class="section"><div class="section-body"><p style="color:#94a3b8;font-size:13px;padding:12px 0">ИИ-анализ не был включён в этот отчёт</p></div></div>'}
  </div>

  <div class="footer">Отчёт создан в JustTODOit · ${dateStr}</div>
</div>

<button class="print-btn" onclick="window.print()">🖨️ Печать / PDF</button>

<script>
function showTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  event.target.classList.add('active');
}
function toggleSection(id) {
  const body = document.getElementById('body-' + id);
  const chevron = document.getElementById('chevron-' + id);
  if (body.style.display === 'none') {
    body.style.display = 'block';
    chevron.style.transform = 'rotate(0deg)';
  } else {
    body.style.display = 'none';
    chevron.style.transform = 'rotate(-90deg)';
  }
}
</script>
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
      `<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc"><div style="text-align:center"><h1 style="color:#ef4444">404</h1><p style="color:#64748b">Отчёт не найден или срок действия ссылки истёк</p></div></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const html = buildReportHtml(report);
  return new Response(html, {
    status: 200,
    headers: new Headers({ "Content-Type": "text/html; charset=utf-8" }),
  });
});

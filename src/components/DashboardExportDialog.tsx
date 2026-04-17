import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, Presentation, Link2, Loader2, Check, Copy, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, differenceInDays, addDays, subDays, startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ru } from "date-fns/locale";

interface ProjectStatExport {
  name: string;
  color: string | null;
  total: number;
  completed: number;
  overdue: number;
  driftCount: number;
  avgDriftDays: number;
  timingStatus: string;
  nextDeadline: string | null;
  assignees?: string[];
  unassignedCount?: number;
}

interface TaskExport {
  title: string;
  assignee: string;
  deadline: string | null;
  driftDays?: number;
  stepsTotal?: number;
  stepsCompleted?: number;
  project?: string | null;
  originalDeadline?: string;
}

export interface AssigneeSummary {
  name: string;
  total: number;
  completed: number;
  overdue: number;
  drift: number;
  noDeadline: number;
}

export interface ReportData {
  summary: {
    completionRate: number;
    tasksThisWeek: number;
    totalOverdue: number;
    totalDrift: number;
    totalProjects: number;
    totalTasks?: number;
    totalCompleted?: number;
    activeProjects?: number;
    unassignedCount?: number;
    noDeadlineCount?: number;
    completedThisWeek?: number;
    completedLastWeek?: number;
  };
  projects: ProjectStatExport[];
  overdueTasks: TaskExport[];
  weekTasks: TaskExport[];
  driftTasks: TaskExport[];
  upcomingTasks: TaskExport[];
  completedTasks: TaskExport[];
  unassignedTasks?: TaskExport[];
  noDeadlineTasks?: TaskExport[];
  assigneeSummary?: AssigneeSummary[];
  period?: string;
  periodLabel?: string;
}

export type SubtaskMapExport = Map<string, { total: number; completed: number }>;

interface DashboardExportDialogProps {
  projectStats: any[];
  summary: {
    completionRate: number;
    tasksThisWeek: number;
    totalOverdue: number;
    totalDrift: number;
    totalProjects: number;
  };
  users: any[];
  aiSummary?: string;
  trigger?: React.ReactNode;
  subtaskMap?: SubtaskMapExport;
}

type PeriodKey = "this_week" | "last_week" | "this_month" | "last_month" | "all";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "this_week", label: "Эта неделя" },
  { value: "last_week", label: "Прошлая неделя" },
  { value: "this_month", label: "Этот месяц" },
  { value: "last_month", label: "Прошлый месяц" },
  { value: "all", label: "Все данные" },
];

function getPeriodRange(period: PeriodKey): { start: Date | null; end: Date | null; label: string } {
  const now = new Date();
  switch (period) {
    case "this_week": {
      const start = startOfWeek(now, { weekStartsOn: 1 });
      const end = endOfWeek(now, { weekStartsOn: 1 });
      return { start, end, label: `${format(start, "d MMM", { locale: ru })} – ${format(end, "d MMM yyyy", { locale: ru })}` };
    }
    case "last_week": {
      const start = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      const end = endOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      return { start, end, label: `${format(start, "d MMM", { locale: ru })} – ${format(end, "d MMM yyyy", { locale: ru })}` };
    }
    case "this_month": {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      return { start, end, label: format(now, "LLLL yyyy", { locale: ru }) };
    }
    case "last_month": {
      const prev = subDays(startOfMonth(now), 1);
      const start = startOfMonth(prev);
      const end = endOfMonth(prev);
      return { start, end, label: format(prev, "LLLL yyyy", { locale: ru }) };
    }
    default:
      return { start: null, end: null, label: "Все данные" };
  }
}

export function buildReportData(projectStats: any[], summary: any, users: any[], period: PeriodKey = "all", subtaskMap?: SubtaskMapExport): ReportData {
  const userName = (userId: string) => users.find((u: any) => u.id === userId)?.display_name || "—";
  const now = new Date();
  const weekFromNow = addDays(startOfDay(now), 7);
  const d7 = subDays(now, 7);
  const d14 = subDays(now, 14);
  const { start: pStart, end: pEnd, label: periodLabel } = getPeriodRange(period);

  const allTasks = projectStats.flatMap((s: any) => [...s.tasks.map((t: any) => ({ ...t, _projectName: s.group.name })), ...s.subprojects.flatMap((sp: any) => sp.tasks.map((t: any) => ({ ...t, _projectName: `${s.group.name} / ${sp.group.name}` })))]);
  const unique = Array.from(new Map(allTasks.map((t: any) => [t.id, t])).values());

  const inPeriod = (t: any) => {
    if (!pStart || !pEnd) return true;
    const dl = t.deadline ? new Date(t.deadline) : null;
    if (dl && dl >= pStart && dl <= pEnd) return true;
    const ca = t.completed_at ? new Date(t.completed_at) : null;
    if (ca && ca >= pStart && ca <= pEnd) return true;
    return false;
  };

  const periodTasks = unique.filter(inPeriod);

  const mapTask = (t: any, extraFields?: Record<string, any>): TaskExport => {
    const si = subtaskMap?.get(t.id);
    return {
      title: t.title,
      assignee: userName(t.assigned_to || t.user_id),
      deadline: t.deadline,
      project: t._projectName || null,
      ...(si ? { stepsTotal: si.total, stepsCompleted: si.completed } : {}),
      ...extraFields,
    };
  };

  const overdueTasks = periodTasks
    .filter((t: any) => !t.is_completed && t.deadline && new Date(t.deadline) < now)
    .sort((a: any, b: any) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 30)
    .map((t: any) => mapTask(t));

  const weekTasks = periodTasks
    .filter((t: any) => !t.is_completed && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow)
    .sort((a: any, b: any) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 30)
    .map((t: any) => mapTask(t));

  const driftTasks = periodTasks
    .filter((t: any) => t.original_deadline && t.deadline && t.original_deadline !== t.deadline)
    .map((t: any) => mapTask(t, {
      driftDays: differenceInDays(new Date(t.deadline!), new Date(t.original_deadline!)),
      originalDeadline: t.original_deadline,
    }))
    .sort((a: any, b: any) => Math.abs(b.driftDays!) - Math.abs(a.driftDays!))
    .slice(0, 30);

  const upcomingTasks = periodTasks
    .filter((t: any) => !t.is_completed && t.deadline && new Date(t.deadline) > weekFromNow)
    .sort((a: any, b: any) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 20)
    .map((t: any) => mapTask(t));

  const completedTasks = periodTasks
    .filter((t: any) => t.is_completed && t.completed_at)
    .sort((a: any, b: any) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
    .slice(0, 30)
    .map((t: any) => mapTask(t, { deadline: t.completed_at }));

  // New: unassigned & no-deadline task lists
  const unassignedTasks = periodTasks
    .filter((t: any) => !t.is_completed && !t.assigned_to)
    .slice(0, 20)
    .map((t: any) => mapTask(t));

  const noDeadlineTasks = periodTasks
    .filter((t: any) => !t.is_completed && !t.deadline)
    .slice(0, 20)
    .map((t: any) => mapTask(t));

  // Project data with assignees
  const projects = projectStats.map((s: any) => {
    const allT = [...s.tasks, ...s.subprojects.flatMap((sp: any) => sp.tasks)];
    const active = allT.filter((t: any) => !t.is_completed);
    const assigneeIds = [...new Set(active.map((t: any) => t.assigned_to).filter(Boolean))] as string[];
    const unassigned = active.filter((t: any) => !t.assigned_to).length;
    return {
      name: s.group.name,
      color: s.group.color,
      total: s.total,
      completed: s.completed,
      overdue: s.overdue,
      driftCount: s.driftCount,
      avgDriftDays: s.avgDriftDays,
      timingStatus: s.timingStatus,
      nextDeadline: s.nextDeadline,
      assignees: assigneeIds.map((id: string) => userName(id)),
      unassignedCount: unassigned,
    };
  });

  const totalTasks = periodTasks.length;
  const totalCompleted = periodTasks.filter((t: any) => t.is_completed).length;
  const activeTasks = periodTasks.filter((t: any) => !t.is_completed);
  const activeProjects = projectStats.filter((s: any) => s.total > 0 && s.timingStatus !== "completed").length;
  const unassignedCount = activeTasks.filter((t: any) => !t.assigned_to).length;
  const noDeadlineCount = activeTasks.filter((t: any) => !t.deadline).length;

  // WoW
  const completedThisWeek = unique.filter((t: any) => t.is_completed && t.completed_at && new Date(t.completed_at) >= d7).length;
  const completedLastWeek = unique.filter((t: any) => t.is_completed && t.completed_at && new Date(t.completed_at) >= d14 && new Date(t.completed_at) < d7).length;

  // Build assignee summary
  const assigneeMap: Record<string, AssigneeSummary> = {};
  periodTasks.forEach((t: any) => {
    const uid = t.assigned_to || t.user_id;
    const name = userName(uid);
    if (!assigneeMap[uid]) assigneeMap[uid] = { name, total: 0, completed: 0, overdue: 0, drift: 0, noDeadline: 0 };
    assigneeMap[uid].total++;
    if (t.is_completed) assigneeMap[uid].completed++;
    if (!t.is_completed && t.deadline && new Date(t.deadline) < now) assigneeMap[uid].overdue++;
    if (t.original_deadline && t.deadline && t.original_deadline !== t.deadline) assigneeMap[uid].drift++;
    if (!t.is_completed && !t.deadline) assigneeMap[uid].noDeadline++;
  });
  const assigneeSummary = Object.values(assigneeMap).sort((a, b) => b.total - a.total);

  return {
    summary: { ...summary, totalTasks, totalCompleted, activeProjects, unassignedCount, noDeadlineCount, completedThisWeek, completedLastWeek },
    projects, overdueTasks, weekTasks, driftTasks, upcomingTasks, completedTasks, unassignedTasks, noDeadlineTasks, assigneeSummary, period, periodLabel,
  };
}

// ==================== PDF Report ====================
function buildPdfHtml(data: ReportData, aiSummary?: string): string {
  const dateStr = format(new Date(), "d MMMM yyyy", { locale: ru });
  const periodStr = data.periodLabel || dateStr;
  const { summary, projects, overdueTasks, weekTasks, driftTasks, upcomingTasks, completedTasks, unassignedTasks, noDeadlineTasks, assigneeSummary } = data;

  const statusLabels: Record<string, string> = { "on-track": "В графике", "at-risk": "Drift", "overdue": "Просрочено", "completed": "Завершён" };
  const statusColors: Record<string, string> = { "on-track": "#10b981", "at-risk": "#f59e0b", "overdue": "#ef4444", "completed": "#6b7280" };

  const stepsLabel = (t: any) => t.stepsTotal > 0 ? `<span class="steps ${t.stepsCompleted === t.stepsTotal ? 'done' : ''}">✓${t.stepsCompleted}/${t.stepsTotal}</span>` : "";

  const taskRows = (tasks: any[], extra?: string) => {
    if (tasks.length === 0) return "<p class='empty'>Нет данных</p>";
    return `<table><thead><tr><th>Задача</th><th>Проект</th><th>Ответственный</th><th>Дата</th>${extra ? `<th>${extra}</th>` : ""}</tr></thead><tbody>
      ${tasks.map(t => `<tr><td class="task-name">${t.title}${stepsLabel(t)}</td><td class="proj">${t.project || "—"}</td><td>${t.assignee}</td><td>${t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "—"}</td>${t.driftDays !== undefined ? `<td class="drift-val">${t.driftDays > 0 ? "+" : ""}${t.driftDays} дн.</td>` : ""}</tr>`).join("")}
    </tbody></table>`;
  };

  const projectRows = projects.map(p => {
    const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
    const sc = statusColors[p.timingStatus] || "#6b7280";
    const assigneePills = (p.assignees || []).slice(0, 3).map(n => `<span class="apill">${n.split(" ")[0]}</span>`).join("");
    const moreAssignees = (p.assignees || []).length > 3 ? `<span class="apill more">+${(p.assignees || []).length - 3}</span>` : "";
    const unassignedBadge = (p.unassignedCount || 0) > 0 ? `<span class="apill warn">👤 ${p.unassignedCount}</span>` : "";
    return `<tr>
      <td><span class="dot" style="background:${p.color || '#3b82f6'}"></span>${p.name}</td>
      <td><span class="status-pill" style="color:${sc};background:${sc}15;border-color:${sc}30">${statusLabels[p.timingStatus] || ''}</span></td>
      <td><div class="bar-wrap"><div class="bar-fill" style="width:${pct}%;background:${p.color || '#3b82f6'}"></div></div>${pct}%</td>
      <td>${p.completed}/${p.total}</td>
      <td class="${p.overdue > 0 ? 'val-red' : ''}">${p.overdue}</td>
      <td class="${p.driftCount > 0 ? 'val-amber' : ''}">${p.driftCount}</td>
      <td class="assignees-cell">${assigneePills}${moreAssignees}${unassignedBadge}</td>
    </tr>`;
  }).join("");

  const assigneeRows = (assigneeSummary || []).map(a => {
    const pct = a.total > 0 ? Math.round((a.completed / a.total) * 100) : 0;
    return `<tr>
      <td class="task-name">${a.name}</td>
      <td class="center">${a.total}</td>
      <td class="center val-green">${a.completed}</td>
      <td class="center ${a.overdue > 0 ? 'val-red' : ''}">${a.overdue}</td>
      <td class="center ${a.drift > 0 ? 'val-amber' : ''}">${a.drift}</td>
      <td class="center ${a.noDeadline > 0 ? 'val-purple' : ''}">${a.noDeadline}</td>
      <td><div class="bar-wrap"><div class="bar-fill" style="width:${pct}%;background:${pct === 100 ? '#10b981' : '#3b82f6'}"></div></div>${pct}%</td>
    </tr>`;
  }).join("");

  const wowDiff = (summary.completedThisWeek || 0) - (summary.completedLastWeek || 0);
  const wowLabel = wowDiff > 0 ? `↑${wowDiff}` : wowDiff < 0 ? `↓${Math.abs(wowDiff)}` : "=";
  const wowColor = wowDiff > 0 ? "#10b981" : wowDiff < 0 ? "#ef4444" : "#64748b";

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Отчёт — ${periodStr}</title>
<style>
  :root{--blue:#3b82f6;--green:#10b981;--red:#ef4444;--amber:#f59e0b;--purple:#8b5cf6;--slate:#64748b;--light:#f8fafc}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:960px;margin:0 auto;color:#1e293b;padding:0;background:#fff}
  .header{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;padding:40px 32px 32px;position:relative;overflow:hidden}
  .header::after{content:'';position:absolute;top:-40%;right:-10%;width:50%;height:180%;background:radial-gradient(ellipse,rgba(59,130,246,.15) 0%,transparent 70%);pointer-events:none}
  .header h1{font-size:28px;font-weight:700;margin-bottom:4px;position:relative}
  .header .sub{font-size:13px;color:#94a3b8;position:relative}
  .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:-20px 24px 0;position:relative;z-index:1;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);border:1px solid #e2e8f0}
  .metric{background:#fff;padding:16px 12px;text-align:center;border-right:1px solid #f1f5f9}
  .metric:last-child{border-right:none}
  .metric .v{font-size:28px;font-weight:700}
  .metric .l{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-top:2px}
  .metric .trend{font-size:10px;font-weight:600;margin-top:2px}
  .content{padding:24px 32px}
  h2{font-size:15px;font-weight:700;color:#0f172a;margin:28px 0 12px;display:flex;align-items:center;gap:8px}
  h2 .count{font-size:11px;font-weight:500;color:#94a3b8}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px}
  th{text-align:left;padding:6px 8px;background:#f8fafc;border-bottom:2px solid #e2e8f0;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
  td{padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  .task-name{font-weight:500;max-width:280px}
  .proj{font-size:11px;color:#64748b;max-width:140px}
  .center{text-align:center}
  .val-red{color:#ef4444;font-weight:600}
  .val-amber{color:#f59e0b;font-weight:600}
  .val-green{color:#10b981;font-weight:600}
  .val-purple{color:#8b5cf6;font-weight:600}
  .drift-val{color:#f59e0b;font-weight:600;white-space:nowrap}
  .dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:middle}
  .status-pill{font-size:10px;padding:2px 8px;border-radius:99px;border:1px solid;font-weight:500;white-space:nowrap}
  .bar-wrap{display:inline-block;width:48px;height:5px;background:#f1f5f9;border-radius:3px;margin-right:4px;overflow:hidden;vertical-align:middle}
  .bar-fill{height:100%;border-radius:3px}
  .steps{font-size:10px;margin-left:4px;color:#3b82f6}
  .steps.done{color:#10b981}
  .apill{display:inline-block;font-size:9px;padding:1px 6px;border-radius:99px;background:#f0f9ff;color:#3b82f6;margin-right:2px;font-weight:500}
  .apill.more{background:#f1f5f9;color:#64748b}
  .apill.warn{background:#fff7ed;color:#ea580c}
  .assignees-cell{white-space:nowrap}
  .ai-block{background:linear-gradient(135deg,#f0f9ff,#faf5ff);border:1px solid #c7d2fe;border-radius:10px;padding:16px 20px;margin:16px 0;font-size:12px;line-height:1.8}
  .empty{color:#94a3b8;font-size:12px;padding:8px 0}
  .section-alert{display:flex;gap:12px;padding:14px 16px;border-radius:10px;margin:12px 0;align-items:flex-start}
  .section-alert.orange{background:#fff7ed;border:1px solid #fed7aa}
  .section-alert.purple{background:#faf5ff;border:1px solid #e9d5ff}
  .section-alert .icon{font-size:18px;flex-shrink:0}
  .section-alert .body{flex:1;font-size:12px;line-height:1.6}
  .section-alert .title{font-weight:600;margin-bottom:2px}
  .footer{text-align:center;padding:24px 0 32px;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;margin-top:16px}
  @media print{body{margin:0}.header{padding:24px 20px 20px}.metrics{margin:-16px 16px 0}.content{padding:16px 20px}}
</style></head><body>
  <div class="header">
    <h1>📊 Отчёт по портфелю</h1>
    <p class="sub">${periodStr} · ${dateStr}</p>
  </div>

  <div class="metrics">
    <div class="metric"><div class="v" style="color:var(--blue)">${summary.completionRate}%</div><div class="l">Прогресс</div><div class="trend" style="color:var(--slate)">${summary.totalTasks || 0} задач</div></div>
    <div class="metric"><div class="v" style="color:var(--green)">${summary.totalCompleted || 0}</div><div class="l">Выполнено</div><div class="trend" style="color:${wowColor}">${wowLabel} к прош. нед</div></div>
    <div class="metric"><div class="v" style="color:var(--red)">${summary.totalOverdue}</div><div class="l">Просрочено</div></div>
    <div class="metric"><div class="v" style="color:var(--amber)">${summary.totalDrift}</div><div class="l">Drift</div></div>
  </div>

  <div class="content">
    ${(summary.unassignedCount || 0) > 0 || (summary.noDeadlineCount || 0) > 0 ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
      ${(summary.unassignedCount || 0) > 0 ? `<div class="section-alert orange"><span class="icon">👤</span><div class="body"><div class="title">${summary.unassignedCount} задач без ответственного</div>Назначьте исполнителей для контроля</div></div>` : ""}
      ${(summary.noDeadlineCount || 0) > 0 ? `<div class="section-alert purple"><span class="icon">📅</span><div class="body"><div class="title">${summary.noDeadlineCount} задач без сроков</div>Установите дедлайны для планирования</div></div>` : ""}
    </div>` : ""}

    ${aiSummary ? `<div class="ai-block"><strong>🤖 ИИ-анализ:</strong><br/>${aiSummary.replace(/\n/g, "<br/>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div>` : ""}

    <h2>📋 Проекты <span class="count">(${projects.length})</span></h2>
    <table><thead><tr><th>Проект</th><th>Статус</th><th>Прогресс</th><th>Задач</th><th>⚠</th><th>↗</th><th>Команда</th></tr></thead><tbody>${projectRows}</tbody></table>

    ${(assigneeSummary || []).length > 0 ? `
    <h2>👥 Загрузка команды <span class="count">(${(assigneeSummary || []).length})</span></h2>
    <table><thead><tr><th>Исполнитель</th><th class="center">Всего</th><th class="center">✓</th><th class="center">⚠</th><th class="center">↗</th><th class="center">📅</th><th>Прогресс</th></tr></thead><tbody>${assigneeRows}</tbody></table>` : ""}

    ${completedTasks.length > 0 ? `<h2>✅ Выполнено <span class="count">(${completedTasks.length})</span></h2>${taskRows(completedTasks)}` : ""}
    ${overdueTasks.length > 0 ? `<h2>⚠️ Просрочено <span class="count">(${overdueTasks.length})</span></h2>${taskRows(overdueTasks)}` : ""}
    ${weekTasks.length > 0 ? `<h2>📅 Дедлайны на неделе <span class="count">(${weekTasks.length})</span></h2>${taskRows(weekTasks)}` : ""}
    ${driftTasks.length > 0 ? `<h2>↔ Перенесённые сроки <span class="count">(${driftTasks.length})</span></h2>${taskRows(driftTasks, "Drift")}` : ""}
    ${(unassignedTasks || []).length > 0 ? `<h2>👤 Без ответственного <span class="count">(${(unassignedTasks || []).length})</span></h2>${taskRows(unassignedTasks || [])}` : ""}
    ${upcomingTasks.length > 0 ? `<h2>🔮 Ближайшие планы <span class="count">(${upcomingTasks.length})</span></h2>${taskRows(upcomingTasks)}` : ""}
  </div>
  <div class="footer">JustTODOit · ${dateStr}</div>
</body></html>`;
}

// ==================== PPT Report ====================
function buildPptHtml(data: ReportData, aiSummary?: string): string {
  const dateStr = format(new Date(), "d MMMM yyyy", { locale: ru });
  const periodStr = data.periodLabel || dateStr;
  const { summary, projects, overdueTasks, weekTasks, completedTasks, driftTasks, assigneeSummary } = data;

  const statusLabels: Record<string, string> = { "on-track": "В графике", "at-risk": "Drift", "overdue": "Просрочено", "completed": "Завершён" };
  const statusColors: Record<string, string> = { "on-track": "#34d399", "at-risk": "#fbbf24", "overdue": "#f87171", "completed": "#6b7280" };

  const wowDiff = (summary.completedThisWeek || 0) - (summary.completedLastWeek || 0);

  const slides: string[] = [];

  // Slide 1: Title
  slides.push(`<div class="slide title-slide">
    <div class="title-accent"></div>
    <div class="title-content">
      <div class="title-badge">PORTFOLIO REPORT</div>
      <h1>Отчёт по портфелю</h1>
      <p class="sub">${periodStr}</p>
      <div class="title-meta">${summary.activeProjects || summary.totalProjects} проектов · ${summary.totalTasks || 0} задач · ${dateStr}</div>
    </div>
  </div>`);

  // Slide 2: KPIs
  slides.push(`<div class="slide">
    <h2>Ключевые метрики</h2>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-val" style="color:#60a5fa">${summary.completionRate}%</div><div class="kpi-lbl">Прогресс</div><div class="kpi-sub">${summary.totalTasks || 0} задач</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#34d399">${summary.totalCompleted || 0}</div><div class="kpi-lbl">Выполнено</div><div class="kpi-sub" style="color:${wowDiff >= 0 ? '#34d399' : '#f87171'}">${wowDiff > 0 ? '+' : ''}${wowDiff} к пр. нед</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#f87171">${summary.totalOverdue}</div><div class="kpi-lbl">Просрочено</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#fbbf24">${summary.totalDrift}</div><div class="kpi-lbl">Drift</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#fb923c">${summary.unassignedCount || 0}</div><div class="kpi-lbl">Без ответств.</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#a78bfa">${summary.noDeadlineCount || 0}</div><div class="kpi-lbl">Без сроков</div></div>
    </div>
  </div>`);

  // Slide 3: Projects
  const projItems = projects.slice(0, 10).map(p => {
    const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
    const assigneeStr = (p.assignees || []).slice(0, 2).map(n => n.split(" ")[0]).join(", ");
    return `<div class="proj-row">
      <div class="proj-icon" style="background:${p.color || '#3b82f6'}">${p.name[0]}</div>
      <div class="proj-body">
        <div class="proj-top"><span class="proj-name">${p.name}</span><span class="proj-status" style="color:${statusColors[p.timingStatus]}">${statusLabels[p.timingStatus]}</span></div>
        <div class="proj-bar"><div class="proj-fill" style="width:${pct}%;background:${p.color || '#3b82f6'}"></div></div>
        <div class="proj-meta">${pct}% · ${p.completed}/${p.total}${p.overdue > 0 ? ` · <span style="color:#f87171">⚠ ${p.overdue}</span>` : ""}${assigneeStr ? ` · ${assigneeStr}` : ""}${(p.unassignedCount || 0) > 0 ? ` · <span style="color:#fb923c">👤 ${p.unassignedCount}</span>` : ""}</div>
      </div>
    </div>`;
  }).join("");
  slides.push(`<div class="slide"><h2>Проекты (${projects.length})</h2>${projItems}</div>`);

  // Slide 4: Team load
  if ((assigneeSummary || []).length > 0) {
    const teamRows = (assigneeSummary || []).slice(0, 8).map(a => {
      const pct = a.total > 0 ? Math.round((a.completed / a.total) * 100) : 0;
      return `<div class="team-row">
        <div class="team-avatar">${(a.name || "—").trim().replace(/\s+/g, "").slice(0, 2).toUpperCase()}</div>
        <span class="team-name">${a.name}</span>
        <span class="team-stat">${a.total} задач</span>
        <span class="team-stat" style="color:#34d399">✓${a.completed}</span>
        ${a.overdue > 0 ? `<span class="team-stat" style="color:#f87171">⚠${a.overdue}</span>` : ""}
        ${a.drift > 0 ? `<span class="team-stat" style="color:#fbbf24">↗${a.drift}</span>` : ""}
        <div class="team-bar"><div class="team-fill" style="width:${pct}%;background:${pct === 100 ? '#34d399' : '#60a5fa'}"></div></div>
        <span class="team-pct">${pct}%</span>
      </div>`;
    }).join("");
    slides.push(`<div class="slide"><h2>Загрузка команды</h2>${teamRows}</div>`);
  }

  // Task slides
  const pptSteps = (t: any) => t.stepsTotal > 0 ? `<span style="font-size:12px;color:${t.stepsCompleted === t.stepsTotal ? '#34d399' : '#60a5fa'};margin-left:6px">✓${t.stepsCompleted}/${t.stepsTotal}</span>` : "";
  const taskSlide = (title: string, tasks: any[], max = 8) => {
    if (tasks.length === 0) return;
    const items = tasks.slice(0, max).map(t => `<div class="task-row"><span class="task-title">${t.title}${pptSteps(t)}</span><span class="task-assignee">${t.assignee}</span><span class="task-date">${t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : ""}</span>${t.driftDays !== undefined ? `<span class="task-drift">${t.driftDays > 0 ? '+' : ''}${t.driftDays}д</span>` : ""}</div>`).join("");
    slides.push(`<div class="slide"><h2>${title} (${tasks.length})</h2>${items}</div>`);
  };

  taskSlide("✅ Выполнено", completedTasks);
  taskSlide("⚠️ Просрочено", overdueTasks);
  taskSlide("📅 На этой неделе", weekTasks);
  if (driftTasks.length > 0) taskSlide("↔ Drift", driftTasks);

  // AI slide
  if (aiSummary) {
    slides.push(`<div class="slide"><h2>🤖 ИИ-анализ</h2><div class="ai-body">${aiSummary.replace(/\n/g, "<br/>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div></div>`);
  }

  // Final slide
  slides.push(`<div class="slide title-slide"><div class="title-accent"></div><div class="title-content"><h1>Спасибо</h1><p class="sub">JustTODOit · ${dateStr}</p></div></div>`);

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Презентация</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#080c14;color:#e2e8f0;overflow:hidden}
  .slide{width:100vw;height:100vh;display:none;flex-direction:column;justify-content:center;padding:60px 80px;position:relative;background:#0b1120}
  .slide:first-child{display:flex}
  .title-slide{align-items:center;text-align:center;background:linear-gradient(160deg,#0b1120 0%,#162033 50%,#0f1d36 100%)}
  .title-accent{position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#3b82f6,#8b5cf6,#3b82f6)}
  .title-content{position:relative}
  .title-badge{font-size:12px;letter-spacing:4px;color:#60a5fa;margin-bottom:16px;font-weight:600}
  .title-slide h1{font-size:52px;font-weight:700;color:#f1f5f9;margin-bottom:8px}
  .sub{font-size:18px;color:#64748b}
  .title-meta{font-size:14px;color:#475569;margin-top:20px}
  h2{font-size:28px;color:#f1f5f9;margin-bottom:24px;font-weight:700}
  .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .kpi{background:linear-gradient(135deg,#1e293b,#1a2332);border:1px solid #334155;border-radius:16px;padding:28px 20px;text-align:center}
  .kpi-val{font-size:44px;font-weight:700}
  .kpi-lbl{font-size:13px;color:#94a3b8;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
  .kpi-sub{font-size:12px;margin-top:4px;font-weight:600}
  .proj-row{display:flex;gap:14px;align-items:center;padding:10px 0;border-bottom:1px solid #1e293b}
  .proj-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:17px;flex-shrink:0}
  .proj-body{flex:1}
  .proj-top{display:flex;gap:12px;align-items:center}
  .proj-name{font-size:15px;font-weight:600}
  .proj-status{font-size:13px;font-weight:500}
  .proj-bar{height:5px;background:#1e293b;border-radius:3px;margin:5px 0 4px}
  .proj-fill{height:100%;border-radius:3px}
  .proj-meta{font-size:12px;color:#94a3b8}
  .team-row{display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #1e293b}
  .team-avatar{width:32px;height:32px;border-radius:99px;background:#1e293b;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#60a5fa;flex-shrink:0}
  .team-name{flex:1;font-size:15px;font-weight:500}
  .team-stat{font-size:13px;color:#94a3b8;min-width:50px}
  .team-bar{width:80px;height:5px;background:#1e293b;border-radius:3px;overflow:hidden;flex-shrink:0}
  .team-fill{height:100%;border-radius:3px}
  .team-pct{font-size:13px;color:#94a3b8;width:36px;text-align:right}
  .task-row{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #1e293b;align-items:center}
  .task-title{flex:1;font-size:15px;font-weight:500}
  .task-assignee{font-size:13px;color:#94a3b8;width:140px}
  .task-date{font-size:13px;color:#94a3b8;width:90px}
  .task-drift{font-size:13px;color:#fbbf24;font-weight:600;width:60px}
  .ai-body{font-size:16px;line-height:1.8;color:#cbd5e1}
  .nav{position:fixed;bottom:20px;right:24px;display:flex;gap:8px;z-index:100}
  .nav button{background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500}
  .nav button:hover{background:#334155}
  .counter{position:fixed;bottom:24px;left:24px;font-size:12px;color:#475569;z-index:100}
  @media print{.slide{page-break-after:always;display:flex!important}.nav,.counter{display:none}}
</style></head><body>
  ${slides.join("\n")}
  <div class="counter"><span id="cur">1</span> / ${slides.length}</div>
  <div class="nav"><button onclick="go(-1)">← Назад</button><button onclick="go(1)">Далее →</button></div>
  <script>
    let c=0;const s=document.querySelectorAll('.slide'),ct=document.getElementById('cur');
    function go(d){const n=c+d;if(n>=0&&n<s.length){s[c].style.display='none';c=n;s[c].style.display='flex';ct.textContent=c+1}}
    document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key===' ')go(1);if(e.key==='ArrowLeft')go(-1)});
  </script>
</body></html>`;
}

// ==================== MAIN COMPONENT ====================
export default function DashboardExportDialog({ projectStats, summary, users, aiSummary, trigger, subtaskMap }: DashboardExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingPpt, setLoadingPpt] = useState(false);
  const [loadingLink, setLoadingLink] = useState(false);
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>("this_week");

  const reportData = useCallback(() =>
    buildReportData(projectStats, summary, users, period, subtaskMap),
    [projectStats, summary, users, period, subtaskMap]
  );

  const handlePdf = () => {
    setLoadingPdf(true);
    try {
      const data = reportData();
      const html = buildPdfHtml(data, aiSummary);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (win) setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 600);
      toast.success("Откроется окно печати — выберите «Сохранить как PDF»");
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    } finally {
      setLoadingPdf(false);
    }
  };

  const handlePpt = () => {
    setLoadingPpt(true);
    try {
      const data = reportData();
      const html = buildPptHtml(data, aiSummary);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dashboard_presentation_${format(new Date(), "yyyy-MM-dd")}.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Презентация скачана — откройте в браузере для показа");
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    } finally {
      setLoadingPpt(false);
    }
  };

  const handlePublicLink = async () => {
    setLoadingLink(true);
    setPublicUrl(null);
    try {
      const data = reportData();
      const dateStr = format(new Date(), "d MMMM yyyy", { locale: ru });
      const periodInfo = PERIOD_OPTIONS.find(o => o.value === period)?.label || "";

      const { data: result, error } = await supabase
        .from("dashboard_reports")
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          title: `Отчёт · ${periodInfo} · ${dateStr}`,
          report_data: data as any,
          ai_summary: aiSummary || null,
        })
        .select("token")
        .single();

      if (error) throw error;

      const url = `${window.location.origin}/report?token=${result.token}`;
      setPublicUrl(url);
      toast.success("Публичная ссылка создана (30 дней)");
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    } finally {
      setLoadingLink(false);
    }
  };

  const copyUrl = () => {
    if (publicUrl) {
      navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success("Ссылка скопирована");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPublicUrl(null); setCopied(false); } }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
            <Download className="h-3 w-3" />
            Отчёт
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            Экспорт дашборда
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 pt-1">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Период отчёта</p>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Включает метрики, проекты, команду, просроченные, перенесённые задачи и ИИ-анализ
          </p>

          <button
            onClick={handlePdf}
            disabled={loadingPdf}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-left group"
          >
            <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
              <FileDown className="h-4 w-4 text-red-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Скачать PDF</p>
              <p className="text-[11px] text-muted-foreground">Откроется окно печати браузера</p>
            </div>
            {loadingPdf && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </button>

          <button
            onClick={handlePpt}
            disabled={loadingPpt}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-left group"
          >
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Presentation className="h-4 w-4 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Скачать презентацию</p>
              <p className="text-[11px] text-muted-foreground">HTML-слайды (← → навигация)</p>
            </div>
            {loadingPpt && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </button>

          <button
            onClick={handlePublicLink}
            disabled={loadingLink}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-left group"
          >
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Link2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Публичная ссылка</p>
              <p className="text-[11px] text-muted-foreground">Веб-отчёт доступен 30 дней без входа</p>
            </div>
            {loadingLink && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </button>

          {publicUrl && (
            <div className="flex items-center gap-2 p-2.5 bg-emerald-500/5 border border-emerald-500/20 rounded-lg animate-fade-in">
              <input
                readOnly
                value={publicUrl}
                className="flex-1 text-xs bg-transparent outline-none text-foreground truncate"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copyUrl}>
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

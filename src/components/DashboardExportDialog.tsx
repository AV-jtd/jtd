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
}

interface TaskExport {
  title: string;
  assignee: string;
  deadline: string | null;
  driftDays?: number;
  stepsTotal?: number;
  stepsCompleted?: number;
}

export interface AssigneeSummary {
  name: string;
  total: number;
  completed: number;
  overdue: number;
  drift: number;
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
  };
  projects: ProjectStatExport[];
  overdueTasks: TaskExport[];
  weekTasks: TaskExport[];
  driftTasks: TaskExport[];
  upcomingTasks: TaskExport[];
  completedTasks: TaskExport[];
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
  const { start: pStart, end: pEnd, label: periodLabel } = getPeriodRange(period);

  const allTasks = projectStats.flatMap((s: any) => [...s.tasks.map((t: any) => ({ ...t, _projectName: s.group.name })), ...s.subprojects.flatMap((sp: any) => sp.tasks.map((t: any) => ({ ...t, _projectName: `${s.group.name} / ${sp.group.name}` })))]);
  const unique = Array.from(new Map(allTasks.map((t: any) => [t.id, t])).values());

  // Filter tasks by period if set
  const inPeriod = (t: any) => {
    if (!pStart || !pEnd) return true;
    const dl = t.deadline ? new Date(t.deadline) : null;
    if (dl && dl >= pStart && dl <= pEnd) return true;
    const ca = t.completed_at ? new Date(t.completed_at) : null;
    if (ca && ca >= pStart && ca <= pEnd) return true;
    return false;
  };

  const periodTasks = unique.filter(inPeriod);

  const mapTask = (t: any, extraFields?: Record<string, any>) => {
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

  const projects = projectStats.map((s: any) => ({
    name: s.group.name,
    color: s.group.color,
    total: s.total,
    completed: s.completed,
    overdue: s.overdue,
    driftCount: s.driftCount,
    avgDriftDays: s.avgDriftDays,
    timingStatus: s.timingStatus,
    nextDeadline: s.nextDeadline,
  }));

  const totalTasks = periodTasks.length;
  const totalCompleted = periodTasks.filter((t: any) => t.is_completed).length;

  // Build assignee summary
  const assigneeMap: Record<string, AssigneeSummary> = {};
  periodTasks.forEach((t: any) => {
    const uid = t.assigned_to || t.user_id;
    const name = userName(uid);
    if (!assigneeMap[uid]) assigneeMap[uid] = { name, total: 0, completed: 0, overdue: 0, drift: 0 };
    assigneeMap[uid].total++;
    if (t.is_completed) assigneeMap[uid].completed++;
    if (!t.is_completed && t.deadline && new Date(t.deadline) < now) assigneeMap[uid].overdue++;
    if (t.original_deadline && t.deadline && t.original_deadline !== t.deadline) assigneeMap[uid].drift++;
  });
  const assigneeSummary = Object.values(assigneeMap).sort((a, b) => b.total - a.total);

  return {
    summary: { ...summary, totalTasks, totalCompleted },
    projects, overdueTasks, weekTasks, driftTasks, upcomingTasks, completedTasks, assigneeSummary, period, periodLabel,
  };
}

function buildPdfHtml(data: ReportData, aiSummary?: string): string {
  const dateStr = format(new Date(), "d MMMM yyyy", { locale: ru });
  const periodStr = data.periodLabel || dateStr;
  const { summary, projects, overdueTasks, weekTasks, driftTasks, upcomingTasks, completedTasks } = data;

  const statusLabels: Record<string, string> = { "on-track": "В графике", "at-risk": "Drift", "overdue": "Просрочено", "completed": "Завершён" };
  const statusColors: Record<string, string> = { "on-track": "#10b981", "at-risk": "#f59e0b", "overdue": "#ef4444", "completed": "#6b7280" };

  const projectRows = projects.map(p => {
    const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
    return `<tr>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${p.color || '#3b82f6'};margin-right:6px"></span>${p.name}</td>
      <td><span style="color:${statusColors[p.timingStatus] || '#6b7280'}">${statusLabels[p.timingStatus] || ''}</span></td>
      <td>${pct}%</td><td>${p.completed}/${p.total}</td><td style="color:${p.overdue > 0 ? '#ef4444' : 'inherit'}">${p.overdue}</td>
      <td style="color:${p.driftCount > 0 ? '#f59e0b' : 'inherit'}">${p.driftCount}</td>
    </tr>`;
  }).join("");

  const stepsLabel = (t: any) => t.stepsTotal > 0 ? `<span style="font-size:11px;color:${t.stepsCompleted === t.stepsTotal ? '#10b981' : '#3b82f6'};margin-left:4px">✓${t.stepsCompleted}/${t.stepsTotal}</span>` : "";

  const taskTable = (tasks: any[], extraHeader?: string) => {
    if (tasks.length === 0) return "<p style='color:#94a3b8;font-size:13px'>Нет данных</p>";
    return `<table><thead><tr><th>Задача</th><th>Ответственный</th><th>Дата</th>${extraHeader ? `<th>${extraHeader}</th>` : ""}</tr></thead><tbody>
      ${tasks.map(t => `<tr><td>${t.title}${stepsLabel(t)}</td><td>${t.assignee}</td><td>${t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : "—"}</td>${t.driftDays !== undefined ? `<td style="color:#f59e0b">+${t.driftDays} дн.</td>` : ""}</tr>`).join("")}
    </tbody></table>`;
  };

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Отчёт — ${periodStr}</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;max-width:900px;margin:40px auto;color:#1e293b;padding:0 24px}
  h1{font-size:24px;border-bottom:3px solid #3b82f6;padding-bottom:8px;margin-bottom:4px}
  .period{font-size:14px;color:#64748b;margin-bottom:24px}
  h2{font-size:16px;margin:24px 0 10px;color:#1e40af}
  .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:28px}
  .m{background:#f0f9ff;border-radius:10px;padding:14px;text-align:center}
  .m .v{font-size:26px;font-weight:700;color:#3b82f6}
  .m .l{font-size:11px;color:#64748b}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px}
  th{text-align:left;padding:6px 10px;background:#f1f5f9;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b;text-transform:uppercase}
  td{padding:6px 10px;border-bottom:1px solid #f1f5f9}
  .ai{background:#f0f9ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px;margin-bottom:20px;font-size:13px;line-height:1.7}
  @media print{body{margin:16px}}
</style></head><body>
  <h1>📊 Отчёт по портфелю</h1>
  <p class="period">Период: ${periodStr} · Создан ${dateStr}</p>
  <div class="metrics">
    <div class="m"><div class="v">${summary.completionRate}%</div><div class="l">Прогресс</div></div>
    <div class="m"><div class="v">${summary.totalTasks || 0}</div><div class="l">Всего задач</div></div>
    <div class="m"><div class="v" style="color:#10b981">${summary.totalCompleted || 0}</div><div class="l">Выполнено</div></div>
    <div class="m"><div class="v">${summary.tasksThisWeek}</div><div class="l">Дедлайнов</div></div>
    <div class="m"><div class="v" style="color:#ef4444">${summary.totalOverdue}</div><div class="l">Просрочено</div></div>
    <div class="m"><div class="v" style="color:#f59e0b">${summary.totalDrift}</div><div class="l">Drift</div></div>
  </div>
  ${aiSummary ? `<div class="ai"><strong>🤖 ИИ-анализ:</strong><br/>${aiSummary.replace(/\n/g, "<br/>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div>` : ""}
  <h2>📋 Проекты (${projects.length})</h2>
  <table><thead><tr><th>Проект</th><th>Статус</th><th>%</th><th>Задач</th><th>Просрочено</th><th>Drift</th></tr></thead><tbody>${projectRows}</tbody></table>
  ${completedTasks.length > 0 ? `<h2>✅ Выполнено за период (${completedTasks.length})</h2>${taskTable(completedTasks)}` : ""}
  ${overdueTasks.length > 0 ? `<h2>⚠️ Не сделано — просрочено (${overdueTasks.length})</h2>${taskTable(overdueTasks)}` : ""}
  ${weekTasks.length > 0 ? `<h2>📅 Дедлайны на этой неделе (${weekTasks.length})</h2>${taskTable(weekTasks)}` : ""}
  ${driftTasks.length > 0 ? `<h2>↔ Перенесённые сроки (${driftTasks.length})</h2>${taskTable(driftTasks, "Drift")}` : ""}
  ${upcomingTasks.length > 0 ? `<h2>🔮 Ближайшие планы (${upcomingTasks.length})</h2>${taskTable(upcomingTasks)}` : ""}
  <p style="text-align:center;margin-top:32px;font-size:12px;color:#94a3b8">JustTODOit · ${dateStr}</p>
</body></html>`;
}

function buildPptHtml(data: ReportData, aiSummary?: string): string {
  const dateStr = format(new Date(), "d MMMM yyyy", { locale: ru });
  const periodStr = data.periodLabel || dateStr;
  const { summary, projects, overdueTasks, weekTasks, completedTasks, driftTasks } = data;

  const statusLabels: Record<string, string> = { "on-track": "В графике", "at-risk": "Drift", "overdue": "Просрочено", "completed": "Завершён" };
  const statusColors: Record<string, string> = { "on-track": "#10b981", "at-risk": "#f59e0b", "overdue": "#ef4444", "completed": "#6b7280" };

  const slides: string[] = [];

  slides.push(`<div class="slide title"><h1>📊 Отчёт по портфелю</h1><p class="sub">${periodStr}</p></div>`);

  slides.push(`<div class="slide"><h2>Ключевые метрики</h2><div class="grid4">
    <div class="card"><div class="val" style="color:#3b82f6">${summary.completionRate}%</div><div class="lbl">Прогресс</div></div>
    <div class="card"><div class="val" style="color:#10b981">${summary.totalCompleted || 0}</div><div class="lbl">Выполнено</div></div>
    <div class="card"><div class="val" style="color:#ef4444">${summary.totalOverdue}</div><div class="lbl">Просрочено</div></div>
    <div class="card"><div class="val" style="color:#f59e0b">${summary.totalDrift}</div><div class="lbl">Drift</div></div>
  </div></div>`);

  const rows = projects.slice(0, 8).map(p => {
    const pct = p.total > 0 ? Math.round((p.completed / p.total) * 100) : 0;
    return `<div class="prow"><div class="picon" style="background:${p.color || '#3b82f6'}">${p.name[0]}</div><div class="pinfo"><div class="pname">${p.name} <span style="color:${statusColors[p.timingStatus]};font-size:14px">${statusLabels[p.timingStatus]}</span></div><div class="pbar"><div class="pfill" style="width:${pct}%;background:${p.color || '#3b82f6'}"></div></div><div class="pmeta">${pct}% · ${p.completed}/${p.total}${p.overdue > 0 ? ` · ⚠ ${p.overdue}` : ""}</div></div></div>`;
  }).join("");
  slides.push(`<div class="slide"><h2>Проекты</h2>${rows}</div>`);

  const pptSteps = (t: any) => t.stepsTotal > 0 ? `<span style="font-size:12px;color:${t.stepsCompleted === t.stepsTotal ? '#10b981' : '#60a5fa'};margin-left:6px">✓${t.stepsCompleted}/${t.stepsTotal}</span>` : "";
  const taskSlide = (title: string, tasks: any[], max = 8) => {
    if (tasks.length === 0) return;
    const items = tasks.slice(0, max).map(t => `<div class="trow"><span class="tt">${t.title}${pptSteps(t)}</span><span class="ta">${t.assignee}</span><span class="td">${t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : ""}</span></div>`).join("");
    slides.push(`<div class="slide"><h2>${title} (${tasks.length})</h2>${items}</div>`);
  };

  taskSlide("✅ Выполнено", completedTasks);
  taskSlide("⚠️ Просрочено", overdueTasks);
  taskSlide("📅 На этой неделе", weekTasks);
  taskSlide("↔ Drift", driftTasks);

  if (aiSummary) {
    slides.push(`<div class="slide"><h2>🤖 ИИ-анализ</h2><div class="ai-body">${aiSummary.replace(/\n/g, "<br/>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div></div>`);
  }

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Презентация</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,system-ui,sans-serif;background:#0f172a;color:#f1f5f9}
  .slide{width:100vw;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:80px}
  .title{align-items:center;text-align:center}
  .title h1{font-size:56px;margin-bottom:12px}
  .sub{font-size:20px;color:#94a3b8}
  h2{font-size:36px;color:#60a5fa;margin-bottom:28px}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
  .card{background:#1e293b;border-radius:12px;padding:24px;text-align:center}
  .val{font-size:48px;font-weight:700}
  .lbl{font-size:14px;color:#94a3b8;margin-top:4px}
  .prow{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #1e293b}
  .picon{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0}
  .pinfo{flex:1}
  .pname{font-size:16px;font-weight:600;display:flex;gap:12px;align-items:center}
  .pbar{height:6px;background:#1e293b;border-radius:3px;margin:6px 0 4px}
  .pfill{height:100%;border-radius:3px}
  .pmeta{font-size:13px;color:#94a3b8}
  .trow{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #1e293b;align-items:center}
  .tt{flex:1;font-size:16px;font-weight:500}
  .ta{font-size:14px;color:#94a3b8;width:150px}
  .td{font-size:14px;color:#94a3b8;width:100px}
  .ai-body{font-size:18px;line-height:1.8;color:#cbd5e1}
  @media print{.slide{page-break-after:always}}
</style></head><body>
  ${slides.join("\n")}
  <script>
    let c=0;const s=document.querySelectorAll('.slide');
    s.forEach((x,i)=>{if(i>0)x.style.display='none'});
    document.addEventListener('keydown',e=>{
      if(e.key==='ArrowRight'||e.key===' '){if(c<s.length-1){s[c].style.display='none';c++;s[c].style.display='flex'}}
      if(e.key==='ArrowLeft'){if(c>0){s[c].style.display='none';c--;s[c].style.display='flex'}}
    });
  </script>
</body></html>`;
}

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
          {/* Period selector */}
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
            Отчёт включает метрики, проекты, просроченные, перенесённые задачи и ИИ-анализ
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
              <p className="text-[11px] text-muted-foreground">HTML-файл со слайдами (← → навигация)</p>
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

import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import {
  Loader2, AlertTriangle, CalendarDays, TrendingUp, CheckCircle2,
  Sparkles, Diamond, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskGroups, useTasks, useAvailableUsers } from "@/hooks/useTasks";
import { useMilestones } from "@/hooks/useMilestones";
import { useAiInsights } from "@/hooks/useAiInsights";
import { isPast, parseISO, differenceInDays, format } from "date-fns";
import { ru } from "date-fns/locale";
import ModuleLayout from "@/components/ModuleLayout";
import ProjectHeader from "@/components/ProjectHeader";
import AiInsightsCard from "@/components/AiInsightsCard";

const GanttView = lazy(() => import("@/modules/pmo/pages/GanttView"));
const NpdSwimlaneMatrix = lazy(() => import("@/modules/npd/pages/NpdSwimlaneMatrix"));

type ProjectView = "dashboard" | "gantt" | "matrix";

function LazyFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

/** Project dashboard */
function ProjectDashboardView({ projectId }: { projectId: string }) {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: milestones = [] } = useMilestones();
  const { data: users = [] } = useAvailableUsers();
  const navigate = useNavigate();

  const { insights, loading: aiLoading, error: aiError, dismissed, refresh: aiRefresh, dismiss: aiDismiss } = useAiInsights();

  const project = groups.find(g => g.id === projectId);
  if (!project) return null;

  const childIds = new Set(groups.filter(g => g.parent_id === projectId).map(g => g.id));
  const allIds = new Set([projectId, ...childIds]);
  const tasks = allTasks.filter(t => t.group_id && allIds.has(t.group_id));
  const total = tasks.length;
  const done = tasks.filter(t => t.is_completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const overdue = tasks.filter(t => !t.is_completed && t.deadline && isPast(parseISO(t.deadline)));
  const now = new Date();
  const weekFromNow = new Date(now); weekFromNow.setDate(weekFromNow.getDate() + 7);
  const upcoming = tasks.filter(t => !t.is_completed && t.deadline && !isPast(parseISO(t.deadline)) && parseISO(t.deadline) <= weekFromNow);
  const drifted = tasks.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline);
  const projectMilestones = milestones.filter(m => allIds.has(m.group_id));
  const subprojects = groups.filter(g => g.parent_id === projectId);

  // Filter out empty subprojects
  const activeSubprojects = subprojects.filter(sp => {
    const spTasks = allTasks.filter(t => t.group_id === sp.id);
    return spTasks.length > 0;
  });

  const statCards = [
    {
      label: "Просрочено",
      value: overdue.length,
      icon: AlertTriangle,
      color: overdue.length > 0 ? "text-destructive" : "text-muted-foreground",
      bg: overdue.length > 0 ? "bg-destructive/8 border-destructive/15" : "bg-muted/30 border-border/50",
    },
    {
      label: "На неделе",
      value: upcoming.length,
      icon: CalendarDays,
      color: "text-amber-500",
      bg: "bg-amber-500/8 border-amber-500/15",
    },
    {
      label: "Со сдвигом",
      value: drifted.length,
      icon: TrendingUp,
      color: drifted.length > 0 ? "text-orange-500" : "text-muted-foreground",
      bg: drifted.length > 0 ? "bg-orange-500/8 border-orange-500/15" : "bg-muted/30 border-border/50",
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 overflow-y-auto h-full">
      {/* Hero — progress + stats row */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Progress card */}
        <div className="flex items-center gap-4 rounded-xl border border-primary/15 bg-primary/5 p-4 flex-1 min-w-0">
          {/* Circular-ish progress */}
          <div className="relative w-14 h-14 shrink-0">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="24" fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
              <circle cx="28" cy="28" r="24" fill="none" stroke="hsl(var(--primary))" strokeWidth="4"
                strokeDasharray={`${pct * 1.508} 150.8`} strokeLinecap="round" className="transition-all duration-700" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-primary">{pct}%</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Общий прогресс</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              <span className="font-bold text-foreground text-base tabular-nums">{done}</span>
              <span className="text-muted-foreground"> / {total} задач</span>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        {statCards.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={cn("flex items-center gap-3 rounded-xl border p-4 min-w-[130px]", s.bg)}>
              <Icon className={cn("h-5 w-5 shrink-0", s.color)} />
              <div>
                <div className={cn("text-xl font-bold tabular-nums", s.color)}>{s.value}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Content grid */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Overdue */}
        {overdue.length > 0 && (
          <div className="rounded-xl border border-destructive/10 bg-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Просроченные</h3>
              <span className="ml-auto text-[10px] font-mono text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">{overdue.length}</span>
            </div>
            <div className="space-y-1">
              {overdue.slice(0, 5).map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm py-0.5">
                  <span className="w-1 h-1 rounded-full bg-destructive/50 shrink-0" />
                  <span className="truncate text-foreground/80">{t.title}</span>
                  <span className="text-[10px] text-destructive/70 shrink-0 ml-auto font-mono">
                    {t.deadline && `−${differenceInDays(now, parseISO(t.deadline))}д`}
                  </span>
                </div>
              ))}
              {overdue.length > 5 && <div className="text-[10px] text-muted-foreground pl-3">+{overdue.length - 5} ещё</div>}
            </div>
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <div className="rounded-xl border border-amber-500/10 bg-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Ближайшие дедлайны</h3>
              <span className="ml-auto text-[10px] font-mono text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full">{upcoming.length}</span>
            </div>
            <div className="space-y-1">
              {upcoming.slice(0, 5).map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm py-0.5">
                  <span className="w-1 h-1 rounded-full bg-amber-500/50 shrink-0" />
                  <span className="truncate text-foreground/80">{t.title}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
                    {t.deadline && format(parseISO(t.deadline), "d MMM", { locale: ru })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Milestones */}
        {projectMilestones.length > 0 && (
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Diamond className="h-3 w-3 text-primary" />
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Вехи проекта</h3>
            </div>
            <div className="space-y-1">
              {projectMilestones.sort((a, b) => a.planned_date.localeCompare(b.planned_date)).slice(0, 6).map(m => {
                const isOverdue = m.status !== "done" && isPast(parseISO(m.planned_date));
                const drift = isOverdue ? differenceInDays(now, parseISO(m.planned_date)) : 0;
                return (
                  <div key={m.id} className="flex items-center gap-2 text-sm py-0.5">
                    <span className={cn("w-1.5 h-1.5 rounded-sm rotate-45 shrink-0",
                      m.status === "done" ? "bg-primary" : isOverdue ? "bg-destructive" : "bg-muted-foreground/30"
                    )} />
                    <span className="truncate text-foreground/80">{m.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0 ml-auto flex items-center gap-1">
                      <span className={isOverdue ? "text-destructive" : ""}>
                        {format(parseISO(m.planned_date), "d MMM.", { locale: ru })}
                      </span>
                      {drift > 0 && <span className="text-destructive font-mono">+{drift} дн.</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Subprojects (only non-empty) */}
        {activeSubprojects.length > 0 && (
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-xs">●</span>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Стримы</h3>
            </div>
            <div className="space-y-2">
              {activeSubprojects.map(sp => {
                const spTasks = allTasks.filter(t => t.group_id === sp.id);
                const spDone = spTasks.filter(t => t.is_completed).length;
                const spTotal = spTasks.length;
                const spPct = spTotal > 0 ? Math.round((spDone / spTotal) * 100) : 0;
                return (
                  <div key={sp.id} className="flex items-center gap-2 text-sm">
                    <span className="shrink-0 text-xs">{sp.icon && sp.icon !== "list" ? sp.icon : "📁"}</span>
                    <span className="truncate text-foreground/80 min-w-0">{sp.name}</span>
                    <span className={cn("text-xs font-mono shrink-0 ml-auto", spPct > 0 ? "text-primary" : "text-muted-foreground")}>{spPct}%</span>
                    <div className="w-16 h-1.5 rounded-full bg-muted/60 overflow-hidden shrink-0">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${spPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* AI Insights block */}
      <div className="mt-2">
        <AiInsightsCard
          insights={insights}
          loading={aiLoading}
          error={aiError}
          dismissed={dismissed}
          onRefresh={aiRefresh}
          onDismiss={aiDismiss}
          onNavigateToTask={(taskId) => navigate(`/?task=${taskId}`)}
          onNavigateToProject={(groupId) => navigate(`/pmo/project/${groupId}`)}
        />
      </div>
    </div>
  );
}

/** Shaded matrix placeholder for non-NPD projects */
function ShadedMatrix() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4 opacity-40">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
        <span className="text-2xl text-muted-foreground">🔒</span>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-muted-foreground">Матрица недоступна</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Swimlane-матрица доступна только для проектов типа NPD.
        </p>
      </div>
    </div>
  );
}

export default function ProjectPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: groups = [] } = useTaskGroups();

  const project = useMemo(() => groups.find(g => g.id === projectId), [groups, projectId]);
  const isNpd = project?.project_type === "npd";

  const initialView = (searchParams.get("view") as ProjectView) || "gantt";
  const [activeView, setActiveView] = useState<ProjectView>(initialView);

  const handleViewChange = useCallback((view: ProjectView) => {
    if (view === "matrix" && !isNpd) return;
    setActiveView(view);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("view", view);
      return next;
    }, { replace: true });
  }, [isNpd, setSearchParams]);

  const handleBack = useCallback(() => {
    navigate("/pmo");
  }, [navigate]);

  if (!projectId) return null;

  return (
    <ModuleLayout moduleContext="pmo" headerChildren={null}>
      <div className="flex flex-col h-full">
        <ProjectHeader
          projectId={projectId}
          activeView={activeView}
          onViewChange={handleViewChange}
          onBack={handleBack}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          <Suspense fallback={<LazyFallback />}>
            {activeView === "dashboard" && <ProjectDashboardView projectId={projectId} />}
            {activeView === "gantt" && <GanttView initialProjectId={projectId} onBack={handleBack} embedded />}
            {activeView === "matrix" && (
              isNpd ? <NpdSwimlaneMatrix embedded /> : <ShadedMatrix />
            )}
          </Suspense>
        </div>
      </div>
    </ModuleLayout>
  );
}

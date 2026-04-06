import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle, CalendarDays, TrendingUp, CheckCircle2, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskGroups, useTasks, useAvailableUsers } from "@/hooks/useTasks";
import { useMilestones } from "@/hooks/useMilestones";
import { isPast, parseISO, differenceInDays, format } from "date-fns";
import { ru } from "date-fns/locale";
import ModuleLayout from "@/components/ModuleLayout";
import ProjectHeader from "@/components/ProjectHeader";

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

/** Sexy project dashboard */
function ProjectDashboardView({ projectId }: { projectId: string }) {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: milestones = [] } = useMilestones();
  const { data: users = [] } = useAvailableUsers();

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

  const stats = [
    {
      label: "Прогресс",
      value: `${pct}%`,
      sub: `${done} из ${total}`,
      icon: CheckCircle2,
      accent: "text-primary",
      gradient: "from-primary/10 to-primary/5",
      border: "border-primary/20",
    },
    {
      label: "Просрочено",
      value: overdue.length,
      sub: "задач",
      icon: AlertTriangle,
      accent: overdue.length > 0 ? "text-destructive" : "text-muted-foreground",
      gradient: overdue.length > 0 ? "from-destructive/10 to-destructive/5" : "from-muted/50 to-muted/30",
      border: overdue.length > 0 ? "border-destructive/20" : "border-border",
    },
    {
      label: "7 дней",
      value: upcoming.length,
      sub: "дедлайнов",
      icon: CalendarDays,
      accent: "text-amber-500",
      gradient: "from-amber-500/10 to-amber-500/5",
      border: "border-amber-500/20",
    },
    {
      label: "Drift",
      value: drifted.length,
      sub: "со сдвигом",
      icon: TrendingUp,
      accent: drifted.length > 0 ? "text-orange-500" : "text-muted-foreground",
      gradient: drifted.length > 0 ? "from-orange-500/10 to-orange-500/5" : "from-muted/50 to-muted/30",
      border: drifted.length > 0 ? "border-orange-500/20" : "border-border",
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 overflow-y-auto h-full">
      {/* Hero progress */}
      <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 via-accent/30 to-background border border-primary/10 p-5 md:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.08),transparent_70%)]" />
        <div className="relative flex items-end gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{project.icon && project.icon !== "list" ? project.icon : "📁"}</span>
              <h2 className="text-lg font-bold text-foreground truncate">{project.name}</h2>
            </div>
            <div className="w-full h-2 rounded-full bg-muted/60 overflow-hidden backdrop-blur-sm">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">{done} из {total} задач завершено</p>
          </div>
          <div className="text-4xl font-black text-primary/80 tabular-nums shrink-0">{pct}%</div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={cn(
              "rounded-xl border p-3.5 bg-gradient-to-br backdrop-blur-sm transition-shadow hover:shadow-md",
              s.gradient, s.border
            )}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={cn("h-3.5 w-3.5", s.accent)} />
                <span className="text-[11px] font-medium text-muted-foreground">{s.label}</span>
              </div>
              <div className={cn("text-xl font-bold", s.accent)}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground">{s.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Overdue */}
        {overdue.length > 0 && (
          <div className="rounded-xl border border-destructive/15 bg-gradient-to-br from-destructive/5 to-transparent p-4 backdrop-blur-sm">
            <h3 className="text-xs font-bold text-destructive uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" />
              Просроченные
            </h3>
            <div className="space-y-1.5">
              {overdue.slice(0, 6).map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm group">
                  <span className="w-1 h-1 rounded-full bg-destructive shrink-0" />
                  <span className="truncate text-foreground/80 group-hover:text-foreground transition-colors">{t.title}</span>
                  <span className="text-[10px] text-destructive/70 shrink-0 ml-auto font-mono">
                    {t.deadline && `−${differenceInDays(now, parseISO(t.deadline))}д`}
                  </span>
                </div>
              ))}
              {overdue.length > 6 && <div className="text-[10px] text-muted-foreground pl-3">+{overdue.length - 6}</div>}
            </div>
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <div className="rounded-xl border border-amber-500/15 bg-gradient-to-br from-amber-500/5 to-transparent p-4 backdrop-blur-sm">
            <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <CalendarDays className="h-3 w-3" />
              Ближайшие дедлайны
            </h3>
            <div className="space-y-1.5">
              {upcoming.slice(0, 6).map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm group">
                  <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                  <span className="truncate text-foreground/80 group-hover:text-foreground transition-colors">{t.title}</span>
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
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-4 backdrop-blur-sm">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">◆ Вехи</h3>
            <div className="space-y-1.5">
              {projectMilestones.sort((a, b) => a.planned_date.localeCompare(b.planned_date)).slice(0, 6).map(m => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <span className={cn("w-1.5 h-1.5 rounded-sm rotate-45 shrink-0",
                    m.status === "done" ? "bg-primary" : isPast(parseISO(m.planned_date)) ? "bg-destructive" : "bg-muted-foreground/30"
                  )} />
                  <span className="truncate text-foreground/80">{m.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
                    {format(parseISO(m.planned_date), "d MMM", { locale: ru })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subprojects */}
        {subprojects.length > 0 && (
          <div className="rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-4 backdrop-blur-sm">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">📂 Подпроекты</h3>
            <div className="space-y-2">
              {subprojects.map(sp => {
                const spTasks = allTasks.filter(t => t.group_id === sp.id);
                const spDone = spTasks.filter(t => t.is_completed).length;
                const spTotal = spTasks.length;
                const spPct = spTotal > 0 ? Math.round((spDone / spTotal) * 100) : 0;
                return (
                  <div key={sp.id} className="flex items-center gap-2 text-sm group">
                    <span className="shrink-0 text-xs">{sp.icon && sp.icon !== "list" ? sp.icon : "📁"}</span>
                    <span className="truncate text-foreground/80 group-hover:text-foreground transition-colors">{sp.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                      <div className="w-14 h-1.5 rounded-full bg-muted/80 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all" style={{ width: `${spPct}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono w-7 text-right">{spPct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
      {/* ProjectHeader is a sub-bar BELOW AppHeader */}
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

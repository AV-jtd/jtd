import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, AlertTriangle, CalendarDays, TrendingUp, CheckCircle2 } from "lucide-react";
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

/** Real project dashboard with stats */
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
  const overdue = tasks.filter(t => !t.is_completed && t.deadline && isPast(parseISO(t.deadline)));
  const now = new Date();
  const weekFromNow = new Date(now); weekFromNow.setDate(weekFromNow.getDate() + 7);
  const upcoming = tasks.filter(t => !t.is_completed && t.deadline && !isPast(parseISO(t.deadline)) && parseISO(t.deadline) <= weekFromNow);
  const drifted = tasks.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline);
  const projectMilestones = milestones.filter(m => allIds.has(m.group_id));
  const subprojects = groups.filter(g => g.parent_id === projectId);

  const userMap = new Map(users.map(u => [u.id, u]));

  return (
    <div className="p-4 md:p-6 space-y-6 overflow-y-auto h-full">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Прогресс
          </div>
          <div className="text-2xl font-bold text-foreground">{total > 0 ? Math.round((done / total) * 100) : 0}%</div>
          <div className="text-xs text-muted-foreground">{done} из {total} задач</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Просрочено
          </div>
          <div className={cn("text-2xl font-bold", overdue.length > 0 ? "text-destructive" : "text-foreground")}>{overdue.length}</div>
          <div className="text-xs text-muted-foreground">задач</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <CalendarDays className="h-4 w-4 text-amber-500" />
            Ближайшие
          </div>
          <div className="text-2xl font-bold text-foreground">{upcoming.length}</div>
          <div className="text-xs text-muted-foreground">за 7 дней</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            Drift
          </div>
          <div className={cn("text-2xl font-bold", drifted.length > 0 ? "text-orange-500" : "text-foreground")}>{drifted.length}</div>
          <div className="text-xs text-muted-foreground">со сдвигом</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Overdue tasks */}
        {overdue.length > 0 && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <h3 className="text-sm font-semibold text-destructive mb-3">⚠ Просроченные задачи</h3>
            <div className="space-y-2">
              {overdue.slice(0, 8).map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="truncate text-foreground">{t.title}</span>
                  <span className="text-xs text-destructive shrink-0">
                    {t.deadline && `${differenceInDays(now, parseISO(t.deadline))}д`}
                  </span>
                </div>
              ))}
              {overdue.length > 8 && <div className="text-xs text-muted-foreground">+{overdue.length - 8} ещё</div>}
            </div>
          </div>
        )}

        {/* Upcoming deadlines */}
        {upcoming.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <h3 className="text-sm font-semibold text-amber-600 mb-3">📅 Ближайшие дедлайны</h3>
            <div className="space-y-2">
              {upcoming.slice(0, 8).map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="truncate text-foreground">{t.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {t.deadline && format(parseISO(t.deadline), "d MMM", { locale: ru })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Milestones */}
        {projectMilestones.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">◆ Вехи</h3>
            <div className="space-y-2">
              {projectMilestones.sort((a, b) => a.planned_date.localeCompare(b.planned_date)).slice(0, 8).map(m => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", m.status === "done" ? "bg-primary" : isPast(parseISO(m.planned_date)) ? "bg-destructive" : "bg-muted-foreground/40")} />
                  <span className="truncate text-foreground">{m.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{format(parseISO(m.planned_date), "d MMM", { locale: ru })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Subprojects */}
        {subprojects.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">📂 Подпроекты</h3>
            <div className="space-y-2">
              {subprojects.map(sp => {
                const spTasks = allTasks.filter(t => t.group_id === sp.id);
                const spDone = spTasks.filter(t => t.is_completed).length;
                const spTotal = spTasks.length;
                const pct = spTotal > 0 ? Math.round((spDone / spTotal) * 100) : 0;
                return (
                  <div key={sp.id} className="flex items-center gap-2 text-sm">
                    <span className="shrink-0">{sp.icon && sp.icon !== "list" ? sp.icon : "📁"}</span>
                    <span className="truncate text-foreground">{sp.name}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-auto">
                      <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{pct}%</span>
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
    <ModuleLayout
      moduleContext="pmo"
      headerChildren={null}
      customHeader={
        <ProjectHeader
          projectId={projectId}
          activeView={activeView}
          onViewChange={handleViewChange}
          onBack={handleBack}
        />
      }
    >
      <Suspense fallback={<LazyFallback />}>
        {activeView === "dashboard" && <ProjectDashboardView projectId={projectId} />}
        {activeView === "gantt" && <GanttView initialProjectId={projectId} onBack={handleBack} embedded />}
        {activeView === "matrix" && (
          isNpd ? <NpdSwimlaneMatrix embedded /> : <ShadedMatrix />
        )}
      </Suspense>
    </ModuleLayout>
  );
}

import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import {
  Loader2, AlertTriangle, CalendarDays, TrendingUp, Diamond, Sparkles,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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

function UserAvatar({ userId, users }: { userId: string | null; users: any[] }) {
  if (!userId) return null;
  const u = users.find((u: any) => u.id === userId);
  const initials = (u?.display_name || "?").slice(0, 2).toUpperCase();
  return (
    <div className="w-[17px] h-[17px] rounded-full bg-muted flex items-center justify-center shrink-0" title={u?.display_name || ""}>
      <span className="text-[8px] font-medium text-muted-foreground leading-none">{initials}</span>
    </div>
  );
}

function pluralTasks(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return "задача";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return "задачи";
  return "задач";
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
  const activeSubprojects = subprojects.filter(sp => allTasks.some(t => t.group_id === sp.id));

  // Top-3 streams by task count for progress pills
  const streamPills = useMemo(() => {
    return activeSubprojects
      .map(sp => {
        const spTasks = allTasks.filter(t => t.group_id === sp.id);
        const spDone = spTasks.filter(t => t.is_completed).length;
        const spTotal = spTasks.length;
        const spPct = spTotal > 0 ? Math.round((spDone / spTotal) * 100) : 0;
        // Strip parent prefix (text before "/")
        const name = sp.name.includes("/") ? sp.name.split("/").pop()!.trim() : sp.name;
        return { name, pct: spPct, total: spTotal };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [activeSubprojects, allTasks]);

  // SVG circle params: r=28, circumference = 2*PI*28 ≈ 175.93
  const circumference = 2 * Math.PI * 28;
  const strokeOffset = circumference - (pct / 100) * circumference;

  if (!project) return null;

  return (
    <div className="p-4 md:p-6 space-y-4 overflow-y-auto h-full">
      {/* KPI row: grid 2fr 1fr 1fr 1fr */}
      <div className="grid grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr] gap-3">
        {/* 1. Progress card */}
        <div className="rounded-xl border border-border/50 bg-card p-4 col-span-2 md:col-span-1">
          <div className="flex items-center gap-4">
            {/* Circular indicator 64px */}
            <div className="relative w-16 h-16 shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--muted))" strokeWidth="3.5" />
                <circle cx="32" cy="32" r="28" fill="none" stroke="hsl(var(--primary))" strokeWidth="3.5"
                  strokeDasharray={circumference} strokeDashoffset={strokeOffset}
                  strokeLinecap="round" className="transition-all duration-700" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-primary tabular-nums">{pct}%</span>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Общий прогресс</div>
              <div className="mt-0.5">
                <span className="text-[26px] font-medium text-foreground tabular-nums leading-none">{done}</span>
                <span className="text-sm text-muted-foreground ml-1">/ {total}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">{pluralTasks(total)} выполнено</div>
              {/* Stream pills */}
              {streamPills.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {streamPills.map(sp => (
                    <span key={sp.name} className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground">{sp.name}</span>
                      <span>{sp.pct}%</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Overdue KPI */}
        <div className="rounded-xl border border-border/50 bg-card p-4 border-l-[3px]" style={{ borderLeftColor: "#E24B4A", borderRadius: "0 12px 12px 0" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#FCEBEB" }}>
              <AlertTriangle className="h-4 w-4" style={{ color: "#E24B4A" }} />
            </div>
            <div>
              <div className="text-[26px] font-medium tabular-nums leading-none" style={{ color: overdue.length > 0 ? "#E24B4A" : "hsl(var(--muted-foreground))" }}>{overdue.length}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">просроченная {pluralTasks(overdue.length)}</div>
            </div>
          </div>
        </div>

        {/* 3. Upcoming KPI */}
        <div className="rounded-xl border border-border/50 bg-card p-4 border-l-[3px]" style={{ borderLeftColor: "#EF9F27", borderRadius: "0 12px 12px 0" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#FAEEDA" }}>
              <CalendarDays className="h-4 w-4" style={{ color: "#EF9F27" }} />
            </div>
            <div>
              <div className="text-[26px] font-medium tabular-nums leading-none" style={{ color: "#EF9F27" }}>{upcoming.length}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">дедлайна на неделе</div>
            </div>
          </div>
        </div>

        {/* 4. Drift KPI */}
        <div className="rounded-xl border border-border/50 bg-card p-4 border-l-[3px]" style={{ borderLeftColor: "#7C3AED", borderRadius: "0 12px 12px 0" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#EDE9FE" }}>
              <TrendingUp className="h-4 w-4" style={{ color: "#7C3AED" }} />
            </div>
            <div>
              <div className="text-[26px] font-medium tabular-nums leading-none" style={{ color: drifted.length > 0 ? "#7C3AED" : "hsl(var(--muted-foreground))" }}>{drifted.length}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">задач с дрейфом</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main grid: 2 rows x 2 cols */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Row 1: Overdue list */}
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#E24B4A" }} />
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Просроченные задачи</h3>
            {overdue.length > 0 && (
              <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ color: "#E24B4A", backgroundColor: "#FCEBEB" }}>{overdue.length}</span>
            )}
          </div>
          {overdue.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">Нет просроченных задач ✨</div>
          ) : (
            <div className="space-y-0.5">
              {overdue.slice(0, 5).map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-lg hover:bg-secondary transition-colors">
                  <span className="w-4 h-4 rounded-full border border-muted-foreground/20 shrink-0" />
                  <span className="truncate text-foreground/90 text-[13px]">{t.title}</span>
                  <UserAvatar userId={t.assigned_to} users={users} />
                  <span className="text-[10px] shrink-0 ml-auto font-mono" style={{ color: "#E24B4A" }}>
                    {t.deadline && format(parseISO(t.deadline), "d MMM", { locale: ru })}
                  </span>
                </div>
              ))}
              {overdue.length > 5 && <div className="text-[10px] text-muted-foreground pl-2 pt-1">+{overdue.length - 5} ещё</div>}
            </div>
          )}
        </div>

        {/* Row 1: Upcoming deadlines */}
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#EF9F27" }} />
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Ближайшие дедлайны</h3>
            {upcoming.length > 0 && (
              <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ color: "#EF9F27", backgroundColor: "#FAEEDA" }}>{upcoming.length}</span>
            )}
          </div>
          {upcoming.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">Нет дедлайнов на этой неделе</div>
          ) : (
            <div className="space-y-0.5">
              {upcoming.slice(0, 5).map(t => (
                <div key={t.id} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-lg hover:bg-secondary transition-colors">
                  <span className="w-4 h-4 rounded-full border border-muted-foreground/20 shrink-0" />
                  <span className="truncate text-foreground/90 text-[13px]">{t.title}</span>
                  <UserAvatar userId={t.assigned_to} users={users} />
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
                    {t.deadline && format(parseISO(t.deadline), "d MMM", { locale: ru })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Row 2: Milestones */}
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Diamond className="h-3 w-3 text-primary" />
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Вехи проекта</h3>
          </div>
          {projectMilestones.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">Нет вех</div>
          ) : (
            <div className="space-y-0.5">
              {projectMilestones.sort((a, b) => a.planned_date.localeCompare(b.planned_date)).slice(0, 6).map(m => {
                const isOverdue = m.status !== "done" && isPast(parseISO(m.planned_date));
                const drift = isOverdue ? differenceInDays(now, parseISO(m.planned_date)) : 0;
                const isFuture = !isPast(parseISO(m.planned_date));
                const daysUntil = isFuture ? differenceInDays(parseISO(m.planned_date), now) : 0;
                return (
                  <div key={m.id} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-lg hover:bg-secondary transition-colors">
                    <span className={cn("w-2 h-2 rounded-sm rotate-45 shrink-0",
                      m.status === "done" ? "bg-primary" : isOverdue ? "bg-destructive" : "bg-muted-foreground/30"
                    )} />
                    <span className="truncate text-foreground/90 text-[13px]">{m.name}</span>
                    <span className="text-[10px] shrink-0 ml-auto flex items-center gap-1.5">
                      <span className={isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}>
                        {format(parseISO(m.planned_date), "d MMM.", { locale: ru })}
                      </span>
                      {drift > 0 && <span className="text-destructive font-mono text-[9px]">+{drift} дн.</span>}
                      {isFuture && daysUntil <= 30 && <span className="text-muted-foreground font-mono text-[9px]">{daysUntil} дн.</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Row 2: Streams */}
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Стримы</h3>
          </div>
          {activeSubprojects.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">Нет активных стримов</div>
          ) : (
            <div className="space-y-0.5">
              {activeSubprojects.map(sp => {
                const spTasks = allTasks.filter(t => t.group_id === sp.id);
                const spDone = spTasks.filter(t => t.is_completed).length;
                const spTotal = spTasks.length;
                const spPct = spTotal > 0 ? Math.round((spDone / spTotal) * 100) : 0;
                const name = sp.name.includes("/") ? sp.name.split("/").pop()!.trim() : sp.name;
                return (
                  <div key={sp.id} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-lg hover:bg-secondary transition-colors">
                    <span className="shrink-0 text-xs w-5 text-center">{sp.icon && sp.icon !== "list" ? sp.icon : "□"}</span>
                    <span className="truncate text-foreground/90 text-[13px] min-w-0">{name}</span>
                    <span className={cn("text-xs font-mono shrink-0 ml-auto tabular-nums", spPct > 0 ? "text-primary" : "text-muted-foreground")}>{spPct}%</span>
                    <div className="w-[82px] h-1.5 rounded-full bg-muted/60 overflow-hidden shrink-0">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${spPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* AI Insights */}
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

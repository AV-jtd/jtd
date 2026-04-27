import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, Diamond, ChevronDown, ChevronRight, Settings2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskGroups, useTasks, useAvailableUsers } from "@/hooks/useTasks";
import { useMilestones } from "@/hooks/useMilestones";
import { useAiInsights } from "@/hooks/useAiInsights";
import ProjectDetailPanel from "@/components/ProjectDetailPanel";
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

/* ── Stripe-style Project Dashboard ── */

function ProjectDashboardView({ projectId }: { projectId: string }) {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: milestones = [] } = useMilestones();
  const { data: users = [] } = useAvailableUsers();
  const navigate = useNavigate();
  const [cardOpen, setCardOpen] = useState(false);

  const { insights, loading: aiLoading, error: aiError, dismissed, refresh: aiRefresh, dismiss: aiDismiss } = useAiInsights(projectId);

  const project = groups.find(g => g.id === projectId);
  const childIds = new Set(groups.filter(g => g.parent_id === projectId).map(g => g.id));
  const allIds = new Set([projectId, ...childIds]);
  const tasks = allTasks.filter(t => t.group_id && allIds.has(t.group_id));

  // Задачи из протоколов, привязанные к этому проекту (или его подпроектам)
  // через status_meta.linked_project_id. Физически живут в group_id=protocolId,
  // поэтому не попадают в `tasks` выше.
  const protocolGroupById = useMemo(() => {
    const m = new Map<string, any>();
    groups.forEach(g => { if (g.project_type === "protocol") m.set(g.id, g); });
    return m;
  }, [groups]);
  const linkedProtocolTasks = useMemo(() => {
    return allTasks.filter(t => {
      const linked = (t as any).status_meta?.linked_project_id as string | undefined;
      if (!linked || !allIds.has(linked)) return false;
      // Должна жить в группе-протоколе, иначе это уже «своя» задача проекта.
      return t.group_id ? protocolGroupById.has(t.group_id) : false;
    });
  }, [allTasks, allIds, protocolGroupById]);

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

  const getSpTasks = (spId: string) => {
    const cIds = new Set([spId, ...groups.filter(g => g.parent_id === spId).map(g => g.id)]);
    return allTasks.filter(t => t.group_id && cIds.has(t.group_id));
  };
  const activeSubprojects = subprojects.filter(sp => getSpTasks(sp.id).length > 0);

  // Velocity: completed per week (last 4 weeks) for sparkline
  const weekBuckets = useMemo(() => {
    const b = [0, 0, 0, 0];
    tasks.filter(t => t.is_completed && (t as any).completed_at).forEach(t => {
      const ago = Math.floor((now.getTime() - new Date((t as any).completed_at).getTime()) / (7 * 24 * 60 * 60 * 1000));
      if (ago >= 0 && ago < 4) b[ago]++;
    });
    return b.reverse(); // oldest first for chart
  }, [tasks]);
  const maxBucket = Math.max(...weekBuckets, 1);

  if (!project) return null;

  const userName = (uid: string | null) => {
    if (!uid) return null;
    const u = users.find(u => u.id === uid);
    return u?.display_name || null;
  };

  const initials = (uid: string | null) => {
    if (!uid) return "";
    const u = users.find(u => u.id === uid);
    return (u?.display_name || "?").slice(0, 2).toUpperCase();
  };

  return (
    <div className="p-4 md:p-6 space-y-5 overflow-y-auto h-full">

      {/* ━━ METRICS BAR ━━ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border/40 rounded-lg overflow-hidden border border-border/50">
        {/* Progress */}
        <div className="bg-card px-4 py-3 col-span-2 md:col-span-1">
          <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Прогресс</div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-semibold tabular-nums text-foreground leading-none">{pct}%</span>
            <span className="text-[11px] text-muted-foreground mb-0.5">{done}/{total}</span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-muted/60 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Overdue */}
        <div className="bg-card px-4 py-3">
          <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Просрочено</div>
          <span className={cn("text-2xl font-semibold tabular-nums leading-none", overdue.length > 0 ? "text-destructive" : "text-muted-foreground")}>{overdue.length}</span>
          {overdue.length > 0 && (
            <div className="text-[10px] text-destructive/70 mt-1">
              макс. {Math.max(...overdue.map(t => differenceInDays(now, parseISO(t.deadline!))))}д назад
            </div>
          )}
        </div>

        {/* Upcoming */}
        <div className="bg-card px-4 py-3">
          <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-1">На неделе</div>
          <span className={cn("text-2xl font-semibold tabular-nums leading-none", upcoming.length > 0 ? "text-amber-500" : "text-muted-foreground")}>{upcoming.length}</span>
          {upcoming.length > 0 && upcoming[0].deadline && (
            <div className="text-[10px] text-muted-foreground mt-1">
              ближ. {format(parseISO(upcoming[0].deadline), "d MMM", { locale: ru })}
            </div>
          )}
        </div>

        {/* Drift */}
        <div className="bg-card px-4 py-3">
          <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Дрейф</div>
          <span className={cn("text-2xl font-semibold tabular-nums leading-none", drifted.length > 0 ? "text-primary" : "text-muted-foreground")}>{drifted.length}</span>
          {drifted.length > 0 && (
            <div className="text-[10px] text-muted-foreground mt-1">
              ≈ +{Math.round(drifted.reduce((s, t) => s + differenceInDays(parseISO(t.deadline!), parseISO(t.original_deadline!)), 0) / drifted.length)}д ср.
            </div>
          )}
        </div>

        {/* Velocity sparkline */}
        <div className="bg-card px-4 py-3">
          <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-1">Скорость</div>
          <div className="flex items-end gap-[3px] h-6 mt-1">
            {weekBuckets.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className={cn("w-full rounded-sm transition-all", i === 3 ? "bg-primary" : "bg-muted-foreground/20")}
                  style={{ height: `${Math.max((v / maxBucket) * 24, 2)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
            <span>4н</span><span>сейчас</span>
          </div>
        </div>
      </div>

      {/* ━━ PROGRESS ROADMAP ━━ */}
      {activeSubprojects.length > 0 && (() => {
        const streams = activeSubprojects.map(sp => {
          const spTasks = getSpTasks(sp.id);
          const spDone = spTasks.filter(t => t.is_completed).length;
          const spTotal = spTasks.length;
          const spPct = spTotal > 0 ? Math.round((spDone / spTotal) * 100) : 0;
          const spOverdue = spTasks.filter(t => !t.is_completed && t.deadline && isPast(parseISO(t.deadline!))).length;
          const name = sp.name.includes("/") ? sp.name.split("/").pop()!.trim() : sp.name;
          return { id: sp.id, name, pct: spPct, done: spDone, total: spTotal, overdue: spOverdue, color: sp.color, icon: sp.icon };
        }).sort((a, b) => b.pct - a.pct);

        return (
          <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">Дорожная карта</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{pct}% общий прогресс</span>
            </div>

            {/* Full-width stacked progress */}
            <div className="px-4 pb-1">
              <div className="flex h-2 rounded-full overflow-hidden bg-muted/40 gap-px">
                {streams.map(s => (
                  <div
                    key={s.id}
                    className="relative h-full transition-all duration-700"
                    style={{ flex: s.total, backgroundColor: s.pct > 0 ? (s.color || 'hsl(var(--primary))') : 'transparent' }}
                    title={`${s.name}: ${s.pct}%`}
                  >
                    {/* unfilled portion */}
                    <div
                      className="absolute right-0 top-0 h-full bg-muted/50"
                      style={{ width: `${100 - s.pct}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Stream lanes */}
            <div className="px-3 py-2 grid gap-px">
              {streams.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 px-1 py-1.5 rounded-md hover:bg-secondary/40 transition-colors group">
                  {/* Rank indicator */}
                  <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{
                      backgroundColor: s.color ? `${s.color}18` : 'hsl(var(--primary) / 0.08)',
                      color: s.color || 'hsl(var(--primary))'
                    }}
                  >
                    {s.icon && s.icon !== "list" ? s.icon : (i + 1)}
                  </div>

                  {/* Name */}
                  <span className="text-[12px] text-foreground truncate min-w-0 flex-1">{s.name}</span>

                  {/* Overdue badge */}
                  {s.overdue > 0 && (
                    <span className="text-[9px] text-destructive bg-destructive/8 px-1.5 py-0.5 rounded-full tabular-nums shrink-0">
                      ⚠ {s.overdue}
                    </span>
                  )}

                  {/* Mini progress */}
                  <div className="w-20 h-1.5 rounded-full bg-muted/50 overflow-hidden shrink-0">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${s.pct}%`,
                        backgroundColor: s.pct >= 80 ? 'hsl(var(--chart-2))' : (s.color || 'hsl(var(--primary))')
                      }}
                    />
                  </div>

                  {/* Percentage */}
                  <span className={cn(
                    "text-[11px] tabular-nums w-8 text-right font-medium shrink-0",
                    s.pct >= 80 ? "text-emerald-600 dark:text-emerald-400" : s.pct === 0 ? "text-muted-foreground" : "text-foreground"
                  )}>{s.pct}%</span>

                  {/* Count */}
                  <span className="text-[9px] text-muted-foreground tabular-nums shrink-0 w-8 text-right">{s.done}/{s.total}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ━━ MAIN GRID ━━ */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Overdue */}
        <DashSection
          title="Просроченные"
          count={overdue.length}
          accentClass="text-destructive"
          empty="Нет просроченных ✨"
        >
          {overdue.slice(0, 6).map(t => (
            <TaskRow key={t.id} title={t.title} date={t.deadline} assignee={userName(t.assigned_to)} initials={initials(t.assigned_to)} variant="overdue" />
          ))}
          {overdue.length > 6 && <MoreLabel count={overdue.length - 6} />}
        </DashSection>

        {/* Upcoming */}
        <DashSection
          title="Ближайшие дедлайны"
          count={upcoming.length}
          accentClass="text-amber-500"
          empty="Нет дедлайнов на неделе"
        >
          {upcoming.slice(0, 6).map(t => (
            <TaskRow key={t.id} title={t.title} date={t.deadline} assignee={userName(t.assigned_to)} initials={initials(t.assigned_to)} />
          ))}
        </DashSection>

        {/* Milestones as list */}
        {projectMilestones.length > 0 && (
          <DashSection title="Вехи" count={projectMilestones.length} accentClass="text-primary">
            {[...projectMilestones].sort((a, b) => a.planned_date.localeCompare(b.planned_date)).slice(0, 6).map(m => {
              const isDone = m.status === "done";
              const isOver = !isDone && isPast(parseISO(m.planned_date));
              const drift = isOver ? differenceInDays(now, parseISO(m.planned_date)) : 0;
              const daysUntil = !isPast(parseISO(m.planned_date)) ? differenceInDays(parseISO(m.planned_date), now) : 0;
              const gateKey = (m as any).gate_key;
              return (
                <div key={m.id} className="flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-md hover:bg-secondary/50 transition-colors">
                  <Diamond className={cn("h-3 w-3 shrink-0", isDone ? "text-primary" : isOver ? "text-destructive" : "text-muted-foreground/50")} />
                  <span className={cn("text-[13px] truncate flex-1", isDone ? "text-muted-foreground line-through" : "text-foreground")}>{m.name}</span>
                  {gateKey && <span className="text-[9px] font-bold text-primary/50 uppercase shrink-0">{gateKey.replace("gate", "G")}</span>}
                  <span className={cn("text-[10px] tabular-nums shrink-0", isDone ? "text-primary" : isOver ? "text-destructive" : "text-muted-foreground")}>
                    {isDone ? "✓" : drift > 0 ? `+${drift}д` : daysUntil > 0 ? `${daysUntil}д` : ""}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{format(parseISO(m.planned_date), "d MMM", { locale: ru })}</span>
                </div>
              );
            })}
          </DashSection>
        )}

        {/* Streams are shown in the Roadmap above */}
      </div>

      {/* ━━ ИЗ ПРОТОКОЛОВ ━━ */}
      {linkedProtocolTasks.length > 0 && (
        <DashSection
          title="Из протоколов"
          count={linkedProtocolTasks.length}
          accentClass="text-primary"
        >
          {linkedProtocolTasks.slice(0, 10).map(t => {
            const proto = t.group_id ? protocolGroupById.get(t.group_id) : null;
            const isOver = !t.is_completed && t.deadline && isPast(parseISO(t.deadline));
            return (
              <button
                key={t.id}
                onClick={() => proto && navigate(`/protocols/${proto.id}`)}
                className="w-full flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-md hover:bg-secondary/50 transition-colors text-left"
                title={proto ? `Открыть протокол: ${proto.name}` : undefined}
              >
                <FileText className="h-3 w-3 shrink-0 text-primary/60" />
                <span className={cn("text-[13px] truncate flex-1", isOver ? "text-destructive" : t.is_completed ? "text-muted-foreground line-through" : "text-foreground")}>
                  {t.title}
                </span>
                {proto && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[140px] shrink-0">{proto.name}</span>
                )}
                {init(t.assigned_to) && (
                  <div className="w-[18px] h-[18px] rounded-full bg-muted flex items-center justify-center shrink-0" title={userName(t.assigned_to) || ""}>
                    <span className="text-[7px] font-medium text-muted-foreground leading-none">{init(t.assigned_to)}</span>
                  </div>
                )}
                {t.deadline && (
                  <span className={cn("text-[10px] tabular-nums shrink-0", isOver ? "text-destructive" : "text-muted-foreground")}>
                    {format(parseISO(t.deadline), "d MMM", { locale: ru })}
                  </span>
                )}
              </button>
            );
          })}
          {linkedProtocolTasks.length > 10 && <MoreLabel count={linkedProtocolTasks.length - 10} />}
        </DashSection>
      )}

      {/* ━━ PROJECT CARD (collapsible) ━━ */}
      {project && (
        <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
          <button
            onClick={() => setCardOpen(!cardOpen)}
            className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-secondary/30 transition-colors text-left"
          >
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Карточка проекта</span>
            <span className="text-[10px] text-muted-foreground">· участники, теги, настройки</span>
            {cardOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
          </button>
          {cardOpen && (
            <div className="border-t border-border/50 animate-fade-in">
              <ProjectDetailPanel group={project} />
            </div>
          )}
        </div>
      )}

      {/* ━━ AI ━━ */}
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

/* ── Reusable section card ── */
function DashSection({ title, count, accentClass, empty, children }: {
  title: string; count: number; accentClass?: string; empty?: string; children?: React.ReactNode;
}) {
  const hasContent = count > 0;
  return (
    <div className="rounded-lg border border-border/50 bg-card px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("text-[11px] font-medium uppercase tracking-wide", accentClass || "text-muted-foreground")}>{title}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
      </div>
      {hasContent ? (
        <div className="space-y-px">{children}</div>
      ) : (
        <div className="text-[12px] text-muted-foreground py-1">{empty || "—"}</div>
      )}
    </div>
  );
}

/* ── Task row ── */
function TaskRow({ title, date, assignee, initials: init, variant, drift }: {
  title: string; date?: string | null; assignee?: string | null; initials?: string; variant?: "overdue"; drift?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-md hover:bg-secondary/50 transition-colors">
      <span className="w-3.5 h-3.5 rounded-full border border-border shrink-0" />
      <span className={cn("text-[13px] truncate flex-1", variant === "overdue" ? "text-destructive" : "text-foreground")}>{title}</span>
      {drift !== undefined && (
        <span className={cn("text-[9px] tabular-nums shrink-0", drift > 0 ? "text-destructive" : "text-emerald-600")}>
          {drift > 0 ? `+${drift}д` : `${drift}д`}
        </span>
      )}
      {init && (
        <div className="w-[18px] h-[18px] rounded-full bg-muted flex items-center justify-center shrink-0" title={assignee || ""}>
          <span className="text-[7px] font-medium text-muted-foreground leading-none">{init}</span>
        </div>
      )}
      {date && (
        <span className={cn("text-[10px] tabular-nums shrink-0", variant === "overdue" ? "text-destructive" : "text-muted-foreground")}>
          {format(parseISO(date), "d MMM", { locale: ru })}
        </span>
      )}
    </div>
  );
}

function MoreLabel({ count }: { count: number }) {
  return <div className="text-[10px] text-muted-foreground pl-7 pt-1">ещё +{count}</div>;
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

import { useState, useMemo } from "react";
import { useTasks, useTaskGroups, useAvailableUsers, Task, TaskGroup, Profile } from "@/hooks/useTasks";
import {
  BarChart3, Loader2, TrendingUp, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronRight, CalendarClock, ArrowRightLeft, Filter, X, Users
} from "lucide-react";
import { format, differenceInDays, isAfter, isBefore, startOfDay, addDays, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type TimingStatus = "on-track" | "at-risk" | "overdue" | "completed";
type FilterStatus = "all" | TimingStatus;

interface ProjectStats {
  group: TaskGroup;
  tasks: Task[];
  total: number;
  completed: number;
  active: number;
  overdue: number;
  driftCount: number;
  avgDriftDays: number;
  nextDeadline: string | null;
  timingStatus: TimingStatus;
  subprojects: ProjectStats[];
  upcomingTasks: Task[];
  overdueTasks: Task[];
  driftTasks: { task: Task; driftDays: number }[];
}

function getTimingStatus(tasks: Task[]): TimingStatus {
  const activeTasks = tasks.filter(t => !t.is_completed);
  if (activeTasks.length === 0 && tasks.length > 0) return "completed";
  const now = new Date();
  const hasOverdue = activeTasks.some(t => t.deadline && new Date(t.deadline) < now);
  if (hasOverdue) return "overdue";
  const hasDrift = activeTasks.some(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline);
  if (hasDrift) return "at-risk";
  return "on-track";
}

function getStatusColor(status: TimingStatus) {
  switch (status) {
    case "on-track": return "bg-emerald-500";
    case "at-risk": return "bg-amber-500";
    case "overdue": return "bg-red-500";
    case "completed": return "bg-muted-foreground/40";
  }
}

function getStatusLabel(status: TimingStatus) {
  switch (status) {
    case "on-track": return "В графике";
    case "at-risk": return "Есть drift";
    case "overdue": return "Просрочено";
    case "completed": return "Завершён";
  }
}

function getStatusBadgeVariant(status: TimingStatus) {
  switch (status) {
    case "on-track": return "text-emerald-700 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400";
    case "at-risk": return "text-amber-700 bg-amber-500/10 border-amber-500/20 dark:text-amber-400";
    case "overdue": return "text-red-700 bg-red-500/10 border-red-500/20 dark:text-red-400";
    case "completed": return "text-muted-foreground bg-muted border-border";
  }
}

function buildProjectStats(group: TaskGroup, allTasks: Task[], allGroups: TaskGroup[]): ProjectStats {
  const tasks = allTasks.filter(t => t.group_id === group.id);
  const childGroups = allGroups.filter(g => g.parent_id === group.id);
  const subprojects = childGroups.map(cg => buildProjectStats(cg, allTasks, allGroups));

  // Include subtask counts from subprojects in totals
  const allProjectTasks = [...tasks, ...subprojects.flatMap(sp => sp.tasks)];
  const total = allProjectTasks.length;
  const completed = allProjectTasks.filter(t => t.is_completed).length;
  const active = total - completed;
  const now = new Date();
  const overdue = allProjectTasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now).length;

  const driftTasks = allProjectTasks
    .filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline)
    .map(t => {
      const driftDays = differenceInDays(new Date(t.deadline!), new Date(t.original_deadline!));
      return { task: t, driftDays };
    })
    .sort((a, b) => Math.abs(b.driftDays) - Math.abs(a.driftDays));

  const weekFromNow = addDays(startOfDay(now), 7);
  const upcomingTasks = allProjectTasks
    .filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  const overdueTasks = allProjectTasks
    .filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  const nextDeadline = allProjectTasks
    .filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= now)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0]?.deadline || null;

  return {
    group,
    tasks,
    total,
    completed,
    active,
    overdue,
    driftCount: driftTasks.length,
    avgDriftDays: driftTasks.length > 0 ? Math.round(driftTasks.reduce((s, d) => s + d.driftDays, 0) / driftTasks.length) : 0,
    nextDeadline,
    timingStatus: getTimingStatus(allProjectTasks),
    subprojects,
    upcomingTasks,
    overdueTasks,
    driftTasks,
  };
}

// --- Summary Card ---
function SummaryCard({ icon: Icon, value, label, color }: { icon: any; value: number | string; label: string; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3 flex items-center gap-3">
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", color)}>
        <Icon className="h-4.5 w-4.5 text-white" />
      </div>
      <div>
        <p className="text-lg font-bold leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
      </div>
    </div>
  );
}

// --- Project Card ---
function ProjectCard({ stats, onNavigateToTask, users, level = 0 }: {
  stats: ProjectStats;
  onNavigateToTask: (taskId: string) => void;
  users: Profile[];
  level?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const userName = (userId: string) => users.find(u => u.id === userId)?.display_name || "—";

  return (
    <div className={cn(
      "bg-card rounded-xl border border-border overflow-hidden transition-shadow",
      expanded && "shadow-md",
      level > 0 && "border-dashed"
    )}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-white text-sm font-semibold"
          style={{ backgroundColor: stats.group.color || "hsl(var(--primary))" }}
        >
          {stats.group.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{stats.group.name}</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
              getStatusBadgeVariant(stats.timingStatus)
            )}>
              {getStatusLabel(stats.timingStatus)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 max-w-[140px]">
              <Progress value={pct} className="h-1.5" />
            </div>
            <span className="text-[11px] text-muted-foreground">{pct}% · {stats.completed}/{stats.total}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
          {stats.overdue > 0 && (
            <span className="flex items-center gap-1 text-red-500 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {stats.overdue}
            </span>
          )}
          {stats.driftCount > 0 && (
            <span className="flex items-center gap-1 text-amber-500 font-medium">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {stats.driftCount}
            </span>
          )}
          {stats.nextDeadline && (
            <span className="hidden sm:flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              {format(new Date(stats.nextDeadline), "d MMM", { locale: ru })}
            </span>
          )}
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4 animate-fade-in">
          {/* Subprojects */}
          {stats.subprojects.length > 0 && (
            <Section title="Подпроекты" count={stats.subprojects.length}>
              <div className="space-y-2">
                {stats.subprojects.map(sp => (
                  <ProjectCard key={sp.group.id} stats={sp} onNavigateToTask={onNavigateToTask} users={users} level={level + 1} />
                ))}
              </div>
            </Section>
          )}

          {/* Overdue tasks */}
          {stats.overdueTasks.length > 0 && (
            <Section title="Просроченные" count={stats.overdueTasks.length} variant="destructive">
              <div className="space-y-1">
                {stats.overdueTasks.map(t => (
                  <TaskRow key={t.id} task={t} onClick={() => onNavigateToTask(t.id)} userName={userName(t.assigned_to || t.user_id)} variant="overdue" />
                ))}
              </div>
            </Section>
          )}

          {/* Upcoming deadlines */}
          {stats.upcomingTasks.length > 0 && (
            <Section title="Ближайшие дедлайны" count={stats.upcomingTasks.length}>
              <div className="space-y-1">
                {stats.upcomingTasks.map(t => (
                  <TaskRow key={t.id} task={t} onClick={() => onNavigateToTask(t.id)} userName={userName(t.assigned_to || t.user_id)} />
                ))}
              </div>
            </Section>
          )}

          {/* Deadline drift */}
          {stats.driftTasks.length > 0 && (
            <Section title="Deadline Drift" count={stats.driftTasks.length} variant="warning">
              <div className="space-y-1">
                {stats.driftTasks.map(({ task: t, driftDays }) => (
                  <TaskRow key={t.id} task={t} onClick={() => onNavigateToTask(t.id)} userName={userName(t.assigned_to || t.user_id)} drift={driftDays} />
                ))}
              </div>
            </Section>
          )}

          {stats.overdueTasks.length === 0 && stats.upcomingTasks.length === 0 && stats.driftTasks.length === 0 && stats.subprojects.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">Нет событий для отображения</p>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children, variant }: { title: string; count: number; children: React.ReactNode; variant?: "destructive" | "warning" }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn(
          "text-xs font-semibold",
          variant === "destructive" ? "text-red-500" : variant === "warning" ? "text-amber-500" : "text-foreground"
        )}>{title}</span>
        <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{count}</span>
      </div>
      {children}
    </div>
  );
}

function TaskRow({ task, onClick, userName, variant, drift }: {
  task: Task; onClick: () => void; userName: string; variant?: "overdue"; drift?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left group"
    >
      <span className={cn(
        "text-xs truncate flex-1",
        variant === "overdue" ? "text-red-600 dark:text-red-400" : "text-foreground",
        task.is_completed && "line-through text-muted-foreground"
      )}>
        {task.title}
      </span>
      {drift !== undefined && (
        <span className={cn(
          "text-[10px] font-mono font-semibold shrink-0",
          drift > 0 ? "text-red-500" : "text-emerald-500"
        )}>
          {drift > 0 ? `+${drift}д` : `${drift}д`}
        </span>
      )}
      {task.deadline && (
        <span className="text-[10px] text-muted-foreground shrink-0">
          {format(new Date(task.deadline), "d MMM", { locale: ru })}
        </span>
      )}
      {userName && (
        <span className="text-[10px] text-muted-foreground shrink-0 max-w-[80px] truncate hidden sm:inline">
          {userName}
        </span>
      )}
    </button>
  );
}

// --- Filter buttons ---
const FILTER_OPTIONS: { value: FilterStatus; label: string; icon?: any }[] = [
  { value: "all", label: "Все" },
  { value: "overdue", label: "Просрочено", icon: AlertTriangle },
  { value: "at-risk", label: "Drift", icon: ArrowRightLeft },
  { value: "on-track", label: "В графике", icon: CheckCircle2 },
  { value: "completed", label: "Завершено", icon: CheckCircle2 },
];

export default function DashboardView({ onNavigateToTask: onNavigateToTaskProp }: { onNavigateToTask?: (taskId: string) => void }) {
  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: groups = [], isLoading: groupsLoading } = useTaskGroups();
  const { data: users = [] } = useAvailableUsers();
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [expandedAll, setExpandedAll] = useState(false);

  const isLoading = tasksLoading || groupsLoading;

  // Build stats for root projects only
  const projectStats = useMemo(() => {
    const rootGroups = groups.filter(g => !g.parent_id);
    return rootGroups
      .map(g => buildProjectStats(g, tasks, groups))
      .filter(s => s.total > 0) // only projects with tasks
      .sort((a, b) => {
        // Overdue first, then at-risk, on-track, completed
        const order: Record<TimingStatus, number> = { overdue: 0, "at-risk": 1, "on-track": 2, completed: 3 };
        return order[a.timingStatus] - order[b.timingStatus];
      });
  }, [groups, tasks]);

  const filtered = useMemo(() => {
    if (filter === "all") return projectStats;
    return projectStats.filter(s => s.timingStatus === filter);
  }, [projectStats, filter]);

  // Summary numbers
  const summary = useMemo(() => {
    const totalProjects = projectStats.length;
    const overdueProjects = projectStats.filter(s => s.timingStatus === "overdue").length;
    const atRiskProjects = projectStats.filter(s => s.timingStatus === "at-risk").length;
    const now = new Date();
    const weekFromNow = addDays(startOfDay(now), 7);
    const tasksThisWeek = tasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow).length;
    const totalCompleted = tasks.filter(t => t.is_completed).length;
    const completionRate = tasks.length > 0 ? Math.round((totalCompleted / tasks.length) * 100) : 0;
    return { totalProjects, overdueProjects, atRiskProjects, tasksThisWeek, completionRate };
  }, [projectStats, tasks]);

  const handleNavigateToTask = (taskId: string) => {
    onNavigateToTaskProp?.(taskId);
  };

  if (isLoading) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground leading-tight">Дашборд проектов</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{summary.totalProjects} проектов с задачами</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <SummaryCard icon={TrendingUp} value={`${summary.completionRate}%`} label="Общий прогресс" color="bg-primary" />
          <SummaryCard icon={CalendarClock} value={summary.tasksThisWeek} label="Дедлайнов на неделе" color="bg-blue-500" />
          <SummaryCard icon={AlertTriangle} value={summary.overdueProjects} label="Проектов с просрочкой" color="bg-red-500" />
          <SummaryCard icon={ArrowRightLeft} value={summary.atRiskProjects} label="С отклонениями" color="bg-amber-500" />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                filter === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="p-1 rounded-full hover:bg-muted transition-colors">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Project cards */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {filter === "all" ? "Нет проектов с задачами" : "Нет проектов с таким статусом"}
            </div>
          ) : (
            filtered.map(stats => (
              <ProjectCard key={stats.group.id} stats={stats} onNavigateToTask={handleNavigateToTask} users={users} />
            ))
          )}
        </div>
      </div>
    </main>
  );
}

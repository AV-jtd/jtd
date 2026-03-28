import { useTaskGroups, useTasks, useTags, useAvailableUsers, type TaskGroup, type Task, type Profile } from "@/hooks/useTasks";
import { useMilestones } from "@/hooks/useMilestones";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Folder, GanttChart, AlertTriangle, ChevronRight } from "lucide-react";
import { isPast, parseISO, differenceInDays, format } from "date-fns";
import { ru } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";

interface PortfolioViewProps {
  onOpenGantt?: (projectId: string) => void;
}

type HealthStatus = "green" | "yellow" | "red" | "gray";

export default function PortfolioView({ onOpenGantt }: PortfolioViewProps) {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: allTags = [] } = useTags();
  const { data: users = [] } = useAvailableUsers();
  const { data: milestones = [] } = useMilestones();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const { data: allGroupMembers = [] } = useQuery({
    queryKey: ["pmo-group-members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("group_members").select("group_id, user_id, role");
      if (error) throw error;
      return data as { group_id: string; user_id: string; role: string }[];
    },
    enabled: !!user,
  });

  const { data: allGroupTags = [] } = useQuery({
    queryKey: ["all_group_tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_tags" as any)
        .select("group_id, tag_id") as { data: { group_id: string; tag_id: string }[] | null; error: any };
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const userMap = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const rootProjects = useMemo(
    () => groups.filter((g) => !g.parent_id).sort((a, b) => a.position - b.position),
    [groups]
  );

  const projectStats = useMemo(() => {
    const statsMap: Record<string, { total: number; completed: number; overdue: number; upcoming: number; driftCount: number }> = {};
    for (const project of groups) {
      const tasks = allTasks.filter((t) => t.group_id === project.id);
      const total = tasks.length;
      const completed = tasks.filter((t) => t.is_completed).length;
      const overdue = tasks.filter((t) => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))).length;
      const driftCount = tasks.filter((t) => t.original_deadline && t.deadline && t.original_deadline !== t.deadline).length;
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      const upcoming = tasks.filter((t) => !t.is_completed && t.deadline && new Date(t.deadline) <= weekFromNow && !isPast(parseISO(t.deadline))).length;
      statsMap[project.id] = { total, completed, overdue, driftCount, upcoming };
    }
    return statsMap;
  }, [groups, allTasks]);

  const getAggregatedStats = (projectId: string) => {
    const childIds = groups.filter((g) => g.parent_id === projectId).map((g) => g.id);
    const allIds = [projectId, ...childIds];
    return allIds.reduce(
      (acc, id) => {
        const s = projectStats[id] || { total: 0, completed: 0, overdue: 0, driftCount: 0, upcoming: 0 };
        return {
          total: acc.total + s.total,
          completed: acc.completed + s.completed,
          overdue: acc.overdue + s.overdue,
          driftCount: acc.driftCount + s.driftCount,
          upcoming: acc.upcoming + s.upcoming,
        };
      },
      { total: 0, completed: 0, overdue: 0, driftCount: 0, upcoming: 0 }
    );
  };

  const getProjectManager = (projectId: string): string => {
    const owner = groups.find((g) => g.id === projectId);
    if (!owner) return "—";
    // Check group_members for a manager/owner role
    const manager = allGroupMembers.find((m) => m.group_id === projectId && (m.role === "owner" || m.role === "admin"));
    if (manager) {
      const p = userMap.get(manager.user_id);
      return p?.display_name || p?.email?.split("@")[0] || "—";
    }
    // Fallback to project creator
    const p = userMap.get(owner.user_id);
    return p?.display_name || p?.email?.split("@")[0] || "—";
  };

  const getProjectStage = (stats: { total: number; completed: number; overdue: number }) => {
    if (stats.total === 0) return { label: "Новый", color: "text-muted-foreground" };
    if (stats.completed === stats.total) return { label: "Завершён", color: "text-success" };
    if (stats.completed / stats.total > 0.5) return { label: "Выполнение", color: "text-foreground" };
    return { label: "Подготовка", color: "text-muted-foreground" };
  };

  const getHealthDot = (projectId: string): { deadlines: HealthStatus; tasks: HealthStatus; milestones: HealthStatus } => {
    const stats = getAggregatedStats(projectId);
    const deadlines: HealthStatus = stats.overdue > 0 ? "red" : stats.upcoming > 0 ? "yellow" : stats.total > 0 ? "green" : "gray";
    const tasks: HealthStatus = stats.total === 0 ? "gray" : stats.completed === stats.total ? "green" : stats.completed / stats.total > 0.3 ? "green" : "yellow";
    const projMilestones = milestones.filter((m) => m.group_id === projectId);
    const milestonesHealth: HealthStatus = projMilestones.length === 0
      ? "gray"
      : projMilestones.some((m) => m.status === "overdue" || (m.planned_date && isPast(parseISO(m.planned_date)) && m.status !== "completed"))
        ? "red"
        : projMilestones.some((m) => m.status === "at_risk")
          ? "yellow"
          : "green";
    return { deadlines, tasks, milestones: milestonesHealth };
  };

  // Summary stats
  const totalAgg = rootProjects.reduce(
    (acc, p) => {
      const s = getAggregatedStats(p.id);
      return { total: acc.total + s.total, completed: acc.completed + s.completed, overdue: acc.overdue + s.overdue };
    },
    { total: 0, completed: 0, overdue: 0 }
  );

  if (isMobile) {
    return <MobilePortfolio rootProjects={rootProjects} getAggregatedStats={getAggregatedStats} getProjectManager={getProjectManager} getProjectStage={getProjectStage} getHealthDot={getHealthDot} onOpenGantt={onOpenGantt} groups={groups} />;
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 scrollbar-thin">
      {/* Summary row */}
      <div className="flex items-center gap-4 mb-4 text-sm">
        <span className="text-muted-foreground">Проектов: <strong className="text-foreground">{rootProjects.length}</strong></span>
        <span className="text-muted-foreground">Задач: <strong className="text-foreground">{totalAgg.total}</strong></span>
        <span className="text-muted-foreground">Выполнено: <strong className="text-success">{totalAgg.completed}</strong></span>
        {totalAgg.overdue > 0 && (
          <span className="text-muted-foreground">Просрочено: <strong className="text-destructive">{totalAgg.overdue}</strong></span>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8 text-center">№</TableHead>
            <TableHead>Проект</TableHead>
            <TableHead className="hidden lg:table-cell">Руководитель</TableHead>
            <TableHead className="hidden xl:table-cell">Этап</TableHead>
            <TableHead className="text-center">
              <Tooltip><TooltipTrigger className="cursor-default">Сроки</TooltipTrigger><TooltipContent>Здоровье сроков</TooltipContent></Tooltip>
            </TableHead>
            <TableHead className="text-center">
              <Tooltip><TooltipTrigger className="cursor-default">Задачи</TooltipTrigger><TooltipContent>Прогресс задач</TooltipContent></Tooltip>
            </TableHead>
            <TableHead className="text-center">
              <Tooltip><TooltipTrigger className="cursor-default">Вехи</TooltipTrigger><TooltipContent>Статус вех</TooltipContent></Tooltip>
            </TableHead>
            <TableHead className="min-w-[180px]">Прогресс</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rootProjects.map((project, idx) => {
            const stats = getAggregatedStats(project.id);
            const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
            const stage = getProjectStage(stats);
            const health = getHealthDot(project.id);
            const children = groups.filter((g) => g.parent_id === project.id);

            return (
              <TableRow
                key={project.id}
                className="cursor-pointer group"
                onClick={() => onOpenGantt?.(project.id)}
              >
                <TableCell className="text-center text-xs text-muted-foreground font-medium">
                  {idx + 1}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <StatusDot status={health.deadlines} size="md" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate max-w-[280px] group-hover:text-primary transition-colors">
                        {project.name}
                      </div>
                      {children.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">{children.length} подпроект{children.length > 1 ? (children.length < 5 ? "а" : "ов") : ""}</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="text-xs text-muted-foreground">{getProjectManager(project.id)}</span>
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <span className={cn("text-xs font-medium", stage.color)}>{stage.label}</span>
                </TableCell>
                <TableCell className="text-center"><StatusDot status={health.deadlines} /></TableCell>
                <TableCell className="text-center"><StatusDot status={health.tasks} /></TableCell>
                <TableCell className="text-center"><StatusDot status={health.milestones} /></TableCell>
                <TableCell>
                  <ProgressBar progress={progress} stats={stats} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {rootProjects.length === 0 && (
        <div className="text-center text-muted-foreground text-sm mt-12">
          Нет проектов. Создайте проект в основном интерфейсе задач.
        </div>
      )}

      {/* Legend */}
      {rootProjects.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 mt-4 text-[10px] text-muted-foreground px-1">
          <LegendItem color="bg-success" label="Норма" />
          <LegendItem color="bg-warning" label="Внимание" />
          <LegendItem color="bg-destructive" label="Проблема" />
          <LegendItem color="bg-muted-foreground/40" label="Нет данных" />
        </div>
      )}
    </div>
  );
}

/* ─── Mobile view ─── */
function MobilePortfolio({
  rootProjects, getAggregatedStats, getProjectManager, getProjectStage, getHealthDot, onOpenGantt, groups
}: {
  rootProjects: TaskGroup[];
  getAggregatedStats: (id: string) => { total: number; completed: number; overdue: number; driftCount: number; upcoming: number };
  getProjectManager: (id: string) => string;
  getProjectStage: (s: { total: number; completed: number; overdue: number }) => { label: string; color: string };
  getHealthDot: (id: string) => { deadlines: HealthStatus; tasks: HealthStatus; milestones: HealthStatus };
  onOpenGantt?: (id: string) => void;
  groups: TaskGroup[];
}) {
  return (
    <div className="h-full overflow-y-auto p-3 space-y-2 scrollbar-thin">
      {rootProjects.map((project, idx) => {
        const stats = getAggregatedStats(project.id);
        const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
        const stage = getProjectStage(stats);
        const health = getHealthDot(project.id);

        return (
          <div
            key={project.id}
            className="rounded-lg border border-border bg-card p-3 active:bg-muted/50 transition-colors"
            onClick={() => onOpenGantt?.(project.id)}
          >
            <div className="flex items-center gap-2 mb-2">
              <StatusDot status={health.deadlines} size="md" />
              <span className="text-sm font-medium text-foreground truncate flex-1">{project.name}</span>
              <div className="flex items-center gap-1.5">
                <StatusDot status={health.deadlines} />
                <StatusDot status={health.tasks} />
                <StatusDot status={health.milestones} />
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
              <span>{getProjectManager(project.id)}</span>
              <span>·</span>
              <span className={stage.color}>{stage.label}</span>
            </div>
            <ProgressBar progress={progress} stats={stats} />
          </div>
        );
      })}
      {rootProjects.length === 0 && (
        <div className="text-center text-muted-foreground text-sm mt-12">
          Нет проектов.
        </div>
      )}
    </div>
  );
}

/* ─── Shared components ─── */

function StatusDot({ status, size = "sm" }: { status: HealthStatus; size?: "sm" | "md" }) {
  const dim = size === "md" ? "w-3 h-3" : "w-2 h-2";
  return (
    <div className={cn(
      "rounded-full shrink-0",
      dim,
      status === "green" && "bg-success",
      status === "yellow" && "bg-warning",
      status === "red" && "bg-destructive",
      status === "gray" && "bg-muted-foreground/40",
    )} />
  );
}

function ProgressBar({ progress, stats }: { progress: number; stats: { total: number; completed: number; overdue: number } }) {
  const barColor = stats.overdue > 0 ? "bg-destructive" : progress === 100 ? "bg-success" : "bg-primary";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-[11px] font-medium text-muted-foreground w-12 text-right">
        {stats.completed}/{stats.total}
      </span>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("w-2 h-2 rounded-full", color)} />
      <span>{label}</span>
    </div>
  );
}

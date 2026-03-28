import { useTaskGroups, useTasks, useTags, useAvailableUsers, type TaskGroup, type Task, type Profile } from "@/hooks/useTasks";
import { useMilestones } from "@/hooks/useMilestones";
import { useState, useMemo, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Search, X, Clock, Filter, User, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { isPast, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";

interface PortfolioViewProps {
  onOpenGantt?: (projectId: string) => void;
}

type HealthStatus = "green" | "yellow" | "red" | "gray";
type SortKey = "name" | "manager" | "stage" | "progress" | "overdue";
type SortDir = "asc" | "desc";

export default function PortfolioView({ onOpenGantt }: PortfolioViewProps) {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: users = [] } = useAvailableUsers();
  const { data: milestones = [] } = useMilestones();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  // Filter & sort state
  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [overdueFilter, setOverdueFilter] = useState(false);
  const [managerFilter, setManagerFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    const t = window.setTimeout(() => { if (draftSearch !== search) setSearch(draftSearch); }, 150);
    return () => window.clearTimeout(t);
  }, [draftSearch, search]);

  const { data: allGroupMembers = [] } = useQuery({
    queryKey: ["pmo-group-members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("group_members").select("group_id, user_id, role");
      if (error) throw error;
      return data as { group_id: string; user_id: string; role: string }[];
    },
    enabled: !!user,
  });

  const userMap = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const rootProjects = useMemo(
    () => groups.filter((g) => !g.parent_id),
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
      const weekFromNow = new Date(); weekFromNow.setDate(weekFromNow.getDate() + 7);
      const upcoming = tasks.filter((t) => !t.is_completed && t.deadline && new Date(t.deadline) <= weekFromNow && !isPast(parseISO(t.deadline))).length;
      statsMap[project.id] = { total, completed, overdue, driftCount, upcoming };
    }
    return statsMap;
  }, [groups, allTasks]);

  const getAggregatedStats = useCallback((projectId: string) => {
    const childIds = groups.filter((g) => g.parent_id === projectId).map((g) => g.id);
    const allIds = [projectId, ...childIds];
    return allIds.reduce(
      (acc, id) => {
        const s = projectStats[id] || { total: 0, completed: 0, overdue: 0, driftCount: 0, upcoming: 0 };
        return { total: acc.total + s.total, completed: acc.completed + s.completed, overdue: acc.overdue + s.overdue, driftCount: acc.driftCount + s.driftCount, upcoming: acc.upcoming + s.upcoming };
      },
      { total: 0, completed: 0, overdue: 0, driftCount: 0, upcoming: 0 }
    );
  }, [groups, projectStats]);

  const getManagerId = useCallback((projectId: string): string => {
    const manager = allGroupMembers.find((m) => m.group_id === projectId && (m.role === "owner" || m.role === "admin"));
    if (manager) return manager.user_id;
    const g = groups.find((g) => g.id === projectId);
    return g?.user_id || "";
  }, [allGroupMembers, groups]);

  const getManagerName = useCallback((projectId: string): string => {
    const uid = getManagerId(projectId);
    const p = userMap.get(uid);
    return p?.display_name || p?.email?.split("@")[0] || "—";
  }, [getManagerId, userMap]);

  const getStage = useCallback((stats: { total: number; completed: number }) => {
    if (stats.total === 0) return { label: "Новый", color: "text-muted-foreground", order: 0 };
    if (stats.completed === stats.total) return { label: "Завершён", color: "text-success", order: 3 };
    if (stats.completed / stats.total > 0.5) return { label: "Выполнение", color: "text-foreground", order: 2 };
    return { label: "Подготовка", color: "text-muted-foreground", order: 1 };
  }, []);

  const getHealthDot = useCallback((projectId: string) => {
    const stats = getAggregatedStats(projectId);
    const deadlines: HealthStatus = stats.overdue > 0 ? "red" : stats.upcoming > 0 ? "yellow" : stats.total > 0 ? "green" : "gray";
    const tasks: HealthStatus = stats.total === 0 ? "gray" : stats.completed === stats.total ? "green" : stats.completed / stats.total > 0.3 ? "green" : "yellow";
    const projMs = milestones.filter((m) => m.group_id === projectId);
    const ms: HealthStatus = projMs.length === 0 ? "gray" : projMs.some((m) => m.status === "overdue" || (m.planned_date && isPast(parseISO(m.planned_date)) && m.status !== "completed")) ? "red" : projMs.some((m) => m.status === "at_risk") ? "yellow" : "green";
    return { deadlines, tasks, milestones: ms };
  }, [getAggregatedStats, milestones]);

  // Unique managers for filter
  const managerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of rootProjects) {
      const uid = getManagerId(p.id);
      if (uid && !seen.has(uid)) {
        const prof = userMap.get(uid);
        seen.set(uid, prof?.display_name || prof?.email?.split("@")[0] || uid.slice(0, 8));
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [rootProjects, getManagerId, userMap]);

  // Filter + sort
  const filteredProjects = useMemo(() => {
    let list = rootProjects;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (overdueFilter) {
      list = list.filter((p) => getAggregatedStats(p.id).overdue > 0);
    }
    if (managerFilter) {
      list = list.filter((p) => getManagerId(p.id) === managerFilter);
    }
    if (stageFilter) {
      list = list.filter((p) => getStage(getAggregatedStats(p.id)).label === stageFilter);
    }
    // Sort
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name, "ru"); break;
        case "manager": cmp = getManagerName(a.id).localeCompare(getManagerName(b.id), "ru"); break;
        case "stage": cmp = getStage(getAggregatedStats(a.id)).order - getStage(getAggregatedStats(b.id)).order; break;
        case "progress": {
          const pa = getAggregatedStats(a.id); const pb = getAggregatedStats(b.id);
          cmp = (pa.total > 0 ? pa.completed / pa.total : 0) - (pb.total > 0 ? pb.completed / pb.total : 0);
          break;
        }
        case "overdue": cmp = getAggregatedStats(a.id).overdue - getAggregatedStats(b.id).overdue; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rootProjects, search, overdueFilter, managerFilter, stageFilter, sortKey, sortDir, getAggregatedStats, getManagerId, getManagerName, getStage]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const totalAgg = filteredProjects.reduce(
    (acc, p) => { const s = getAggregatedStats(p.id); return { total: acc.total + s.total, completed: acc.completed + s.completed, overdue: acc.overdue + s.overdue }; },
    { total: 0, completed: 0, overdue: 0 }
  );

  const hasFilters = search || overdueFilter || managerFilter !== null || stageFilter !== null;
  const activeFilterCount = [overdueFilter, managerFilter !== null, stageFilter !== null].filter(Boolean).length;

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const filtersBar = (
    <div className="flex items-center gap-1 mb-3">
      {/* Search */}
      <div className="relative flex-1 min-w-0 max-w-[200px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={draftSearch}
          onChange={(e) => setDraftSearch(e.target.value)}
          placeholder="Поиск..."
          className="h-8 w-full pl-8 pr-7 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all"
        />
        {draftSearch && (
          <button onClick={() => { setDraftSearch(""); setSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Quick: Overdue */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setOverdueFilter((v) => !v)}
            className={cn("h-8 w-8 rounded-lg flex items-center justify-center transition-all", overdueFilter ? "bg-red-500/10 text-red-500" : "text-muted-foreground hover:text-foreground hover:bg-muted")}
          >
            <Clock className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">С просроченными</TooltipContent>
      </Tooltip>

      {/* Filter popover: manager, stage */}
      <Popover>
        <PopoverTrigger asChild>
          <button className={cn("h-8 rounded-lg flex items-center justify-center transition-all relative", activeFilterCount > 0 ? "bg-primary/10 text-primary px-2.5 gap-1" : "w-8 text-muted-foreground hover:text-foreground hover:bg-muted")}>
            <Filter className="h-4 w-4" />
            {activeFilterCount > 0 && <span className="text-[10px] font-semibold">{activeFilterCount}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0 bg-popover border-border z-50" side="bottom" align="end">
          {/* Manager */}
          <div className="p-2 border-b border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Руководитель</p>
            <PopoverSearchList
              items={managerOptions}
              searchKey={(u) => u.name}
              placeholder="Найти..."
              renderItem={(u) => (
                <button
                  key={u.id}
                  onClick={() => setManagerFilter((prev) => prev === u.id ? null : u.id)}
                  className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors truncate", managerFilter === u.id && "bg-primary/10 text-primary")}
                >
                  <User className="h-3.5 w-3.5 shrink-0" />
                  {u.name}
                </button>
              )}
            />
          </div>

          {/* Stage */}
          <div className="p-2 border-b border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Этап</p>
            {["Новый", "Подготовка", "Выполнение", "Завершён"].map((s) => (
              <button
                key={s}
                onClick={() => setStageFilter((prev) => prev === s ? null : s)}
                className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors", stageFilter === s && "bg-primary/10 text-primary")}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Reset */}
          {hasFilters && (
            <div className="p-2">
              <button
                onClick={() => { setOverdueFilter(false); setManagerFilter(null); setStageFilter(null); setDraftSearch(""); setSearch(""); }}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Сбросить все
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Summary inline */}
      <div className="hidden md:flex items-center gap-3 ml-auto text-xs text-muted-foreground">
        <span>Проектов: <strong className="text-foreground">{filteredProjects.length}</strong></span>
        <span>Задач: <strong className="text-foreground">{totalAgg.total}</strong></span>
        <span>Выполнено: <strong className="text-success">{totalAgg.completed}</strong></span>
        {totalAgg.overdue > 0 && <span>Просрочено: <strong className="text-destructive">{totalAgg.overdue}</strong></span>}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="h-full overflow-y-auto p-3 scrollbar-thin">
        {filtersBar}
        <div className="space-y-2">
          {filteredProjects.map((project) => {
            const stats = getAggregatedStats(project.id);
            const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
            const stage = getStage(stats);
            const health = getHealthDot(project.id);
            return (
              <div key={project.id} className="rounded-lg border border-border bg-card p-3 active:bg-muted/50 transition-colors" onClick={() => onOpenGantt?.(project.id)}>
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
                  <span>{getManagerName(project.id)}</span>
                  <span>·</span>
                  <span className={stage.color}>{stage.label}</span>
                </div>
                <ProgressBar progress={progress} stats={stats} />
              </div>
            );
          })}
          {filteredProjects.length === 0 && <div className="text-center text-muted-foreground text-sm mt-8">{rootProjects.length === 0 ? "Нет проектов." : "Ничего не найдено."}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 scrollbar-thin">
      {filtersBar}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-8 text-center">№</TableHead>
            <TableHead>
              <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                Проект <SortIcon col="name" />
              </button>
            </TableHead>
            <TableHead className="hidden lg:table-cell">
              <button onClick={() => toggleSort("manager")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                Руководитель <SortIcon col="manager" />
              </button>
            </TableHead>
            <TableHead className="hidden xl:table-cell">
              <button onClick={() => toggleSort("stage")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                Этап <SortIcon col="stage" />
              </button>
            </TableHead>
            <TableHead className="text-center">
              <Tooltip><TooltipTrigger className="cursor-default">Сроки</TooltipTrigger><TooltipContent>Здоровье сроков</TooltipContent></Tooltip>
            </TableHead>
            <TableHead className="text-center">
              <Tooltip><TooltipTrigger className="cursor-default">Задачи</TooltipTrigger><TooltipContent>Прогресс задач</TooltipContent></Tooltip>
            </TableHead>
            <TableHead className="text-center">
              <Tooltip><TooltipTrigger className="cursor-default">Вехи</TooltipTrigger><TooltipContent>Статус вех</TooltipContent></Tooltip>
            </TableHead>
            <TableHead className="min-w-[180px]">
              <button onClick={() => toggleSort("progress")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                Прогресс <SortIcon col="progress" />
              </button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredProjects.map((project, idx) => {
            const stats = getAggregatedStats(project.id);
            const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
            const stage = getStage(stats);
            const health = getHealthDot(project.id);
            const children = groups.filter((g) => g.parent_id === project.id);

            return (
              <TableRow key={project.id} className="cursor-pointer group" onClick={() => onOpenGantt?.(project.id)}>
                <TableCell className="text-center text-xs text-muted-foreground font-medium">{idx + 1}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <StatusDot status={health.deadlines} size="md" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate max-w-[280px] group-hover:text-primary transition-colors">{project.name}</div>
                      {children.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">{children.length} подпроект{children.length > 1 ? (children.length < 5 ? "а" : "ов") : ""}</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="text-xs text-muted-foreground">{getManagerName(project.id)}</span>
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <span className={cn("text-xs font-medium", stage.color)}>{stage.label}</span>
                </TableCell>
                <TableCell className="text-center"><StatusDot status={health.deadlines} /></TableCell>
                <TableCell className="text-center"><StatusDot status={health.tasks} /></TableCell>
                <TableCell className="text-center"><StatusDot status={health.milestones} /></TableCell>
                <TableCell><ProgressBar progress={progress} stats={stats} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {filteredProjects.length === 0 && (
        <div className="text-center text-muted-foreground text-sm mt-12">
          {rootProjects.length === 0 ? "Нет проектов. Создайте проект в основном интерфейсе задач." : "Ничего не найдено по фильтрам."}
        </div>
      )}

      {filteredProjects.length > 0 && (
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

/* ─── Shared components ─── */

function StatusDot({ status, size = "sm" }: { status: HealthStatus; size?: "sm" | "md" }) {
  const dim = size === "md" ? "w-3 h-3" : "w-2 h-2";
  return (
    <div className={cn(
      "rounded-full shrink-0", dim,
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
        <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${progress}%` }} />
      </div>
      <span className="text-[11px] font-medium text-muted-foreground w-12 text-right">{stats.completed}/{stats.total}</span>
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

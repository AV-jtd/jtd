import { useTaskGroups, useTasks, useAvailableUsers, type TaskGroup, type Task, type Profile } from "@/hooks/useTasks";
import { useGroupTaskStats } from "@/hooks/useGroupTaskStats";
import { useMilestones } from "@/hooks/useMilestones";
import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import { cn } from "@/lib/utils";
import { Search, X, Clock, Filter, User, ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ChevronDown, GanttChart, LayoutList, Layers, FolderOpen, RefreshCw, BarChart3, Archive, TrendingUp, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import TaskItem from "@/components/TaskItem";
import ProjectDetailPanel from "@/components/ProjectDetailPanel";
import PmoRiskRadar from "@/modules/pmo/components/PmoRiskRadar";
import PmoPortfolioSummary from "@/modules/pmo/components/PmoPortfolioSummary";
import { isPast, parseISO, format } from "date-fns";
import { ru } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { useIsMobile } from "@/hooks/use-mobile";

interface PortfolioViewProps {
  onOpenGantt?: (projectId: string) => void;
}

type HealthStatus = "green" | "yellow" | "red" | "gray";
type SortKey = "name" | "manager" | "progress" | "health";
type SortDir = "asc" | "desc";
type GroupBy = "none" | "manager" | "folder" | "progress";

export default function PortfolioView({ onOpenGantt }: PortfolioViewProps) {
  const { data: groups = [] } = useTaskGroups();
  // Performance: PMO portfolio used to load EVERY task (including the entire
  // history of completed tasks across all projects) just to compute card
  // metrics. The metrics now come from `useGroupTaskStats` (server-side
  // aggregate), so we only need actual task ROWS for the expanded "details"
  // dashboards (overdue/upcoming/drifted lists) and subproject mini-cards —
  // both of which only ever render ACTIVE tasks. A 7-day completed window
  // covers the brief "just-completed" line-through state.
  const { data: allTasks = [] } = useTasks(undefined, undefined, { completedWindowDays: 14 });
  const { data: users = [] } = useAvailableUsers();
  const { data: milestones = [] } = useMilestones();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [search, setSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [overdueFilter, setOverdueFilter] = useState(false);
  const [managerFilter, setManagerFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = window.setTimeout(() => { if (draftSearch !== search) setSearch(draftSearch); }, 150);
    return () => window.clearTimeout(t);
  }, [draftSearch, search]);

  // ── Defer non-essential portfolio data ──
  // Эти три запроса нужны ТОЛЬКО для:
  //   • вычисления имени ответственного (group_members) — используется и без
  //     группировки, поэтому грузим сразу;
  //   • группировки «По папке» (folders + folder_items) — нужно ТОЛЬКО когда
  //     пользователь явно выбрал groupBy='folder'.
  // Раньше все три летели параллельно с основной загрузкой задач/групп/вех/
  // RPC-статистики и порождали 7+ одновременных запросов на старте PMO. На
  // медленном канале / через прокси с лимитом конкурентности это легко даёт
  // «зависание» портфеля на старте.
  const { data: allGroupMembers = [] } = useQuery({
    queryKey: ["pmo-group-members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("group_members").select("group_id, user_id, role");
      if (error) throw error;
      return data as { group_id: string; user_id: string; role: string }[];
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["pmo-project-folders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_folders").select("id, name, color");
      if (error) throw error;
      return data as { id: string; name: string; color: string | null }[];
    },
    enabled: !!user && groupBy === "folder",
    staleTime: 5 * 60 * 1000,
  });

  const { data: folderItems = [] } = useQuery({
    queryKey: ["pmo-folder-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_folder_items").select("folder_id, group_id");
      if (error) throw error;
      return data as { folder_id: string; group_id: string }[];
    },
    enabled: !!user && groupBy === "folder",
    staleTime: 5 * 60 * 1000,
  });

  const projectFolderMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const fi of folderItems) m.set(fi.group_id, fi.folder_id);
    return m;
  }, [folderItems]);

  const folderMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string | null }>();
    for (const f of folders) m.set(f.id, f);
    return m;
  }, [folders]);

  const userMap = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  // STM SKU live in their own /npd/stm matrix and must not pollute the PMO portfolio.
  const isStm = useCallback((g: TaskGroup) => (g as any).project_subtype === "npd_stm", []);
  const rootProjects = useMemo(
    () => groups.filter((g) => !g.parent_id && !(g as any).closed_at && !isStm(g)),
    [groups, isStm],
  );
  const archivedProjects = useMemo(
    () => groups.filter((g) => !g.parent_id && (g as any).closed_at && !isStm(g)),
    [groups, isStm],
  );
  const [showArchived, setShowArchived] = useState(false);

  // Server-side aggregates per project: replaces the old O(N tasks × M groups)
  // in-memory loop and removes the need to ship completed task history.
  const allGroupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const { byId: statsById } = useGroupTaskStats(allGroupIds);

  const projectStats = useMemo(() => {
    const statsMap: Record<string, { total: number; completed: number; overdue: number; upcoming: number; driftCount: number; earliestStart: string | null; maxDriftDays: number }> = {};
    for (const project of groups) {
      const s = statsById[project.id];
      statsMap[project.id] = {
        total: s?.total ?? 0,
        completed: s?.completed ?? 0,
        overdue: s?.overdue ?? 0,
        driftCount: s?.drift ?? 0,
        upcoming: s?.upcoming_7d ?? 0,
        earliestStart: s?.earliest_start ?? null,
        maxDriftDays: s?.max_drift_days ?? 0,
      };
    }
    return statsMap;
  }, [groups, statsById]);

  const getAggregatedStats = useCallback((projectId: string) => {
    const childIds = groups.filter((g) => g.parent_id === projectId).map((g) => g.id);
    const base = { total: 0, completed: 0, overdue: 0, driftCount: 0, upcoming: 0, earliestStart: null as string | null, maxDriftDays: 0 };
    return [projectId, ...childIds].reduce(
      (acc, id) => {
        const s = projectStats[id] || { total: 0, completed: 0, overdue: 0, driftCount: 0, upcoming: 0, earliestStart: null, maxDriftDays: 0 };
        const earliest = !acc.earliestStart ? s.earliestStart : !s.earliestStart ? acc.earliestStart : acc.earliestStart < s.earliestStart ? acc.earliestStart : s.earliestStart;
        const maxDrift = Math.abs(s.maxDriftDays) > Math.abs(acc.maxDriftDays) ? s.maxDriftDays : acc.maxDriftDays;
        return { total: acc.total + s.total, completed: acc.completed + s.completed, overdue: acc.overdue + s.overdue, driftCount: acc.driftCount + s.driftCount, upcoming: acc.upcoming + s.upcoming, earliestStart: earliest, maxDriftDays: maxDrift };
      },
      base
    );
  }, [groups, projectStats]);

  const getManagerId = useCallback((projectId: string): string => {
    const assignee = allGroupMembers.find((m) => m.group_id === projectId && m.role === "assignee");
    if (assignee) return assignee.user_id;
    const ownerOrAdmin = allGroupMembers.find((m) => m.group_id === projectId && (m.role === "owner" || m.role === "admin"));
    if (ownerOrAdmin) return ownerOrAdmin.user_id;
    return groups.find((g) => g.id === projectId)?.user_id || "";
  }, [allGroupMembers, groups]);

  const getManagerName = useCallback((projectId: string): string => {
    const p = userMap.get(getManagerId(projectId));
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

  const getHealthScore = useCallback((projectId: string): number => {
    const h = getHealthDot(projectId);
    const scoreMap: Record<HealthStatus, number> = { red: 3, yellow: 2, green: 1, gray: 0 };
    return scoreMap[h.deadlines] * 10 + scoreMap[h.tasks] * 5 + scoreMap[h.milestones] * 3;
  }, [getHealthDot]);

  const hasAnyCritical = useCallback((projectId: string): boolean => {
    const h = getHealthDot(projectId);
    return h.deadlines === "red" || h.milestones === "red";
  }, [getHealthDot]);

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

  const filteredProjects = useMemo(() => {
    let list = rootProjects;
    if (search) { const q = search.toLowerCase(); list = list.filter((p) => p.name.toLowerCase().includes(q)); }
    if (overdueFilter) list = list.filter((p) => getAggregatedStats(p.id).overdue > 0);
    if (managerFilter) list = list.filter((p) => getManagerId(p.id) === managerFilter);
    if (stageFilter) list = list.filter((p) => getStage(getAggregatedStats(p.id)).label === stageFilter);
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name, "ru"); break;
        case "manager": cmp = getManagerName(a.id).localeCompare(getManagerName(b.id), "ru"); break;
        case "health": cmp = getHealthScore(a.id) - getHealthScore(b.id); break;
        case "progress": {
          const pa = getAggregatedStats(a.id); const pb = getAggregatedStats(b.id);
          cmp = (pa.total > 0 ? pa.completed / pa.total : 0) - (pb.total > 0 ? pb.completed / pb.total : 0); break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rootProjects, search, overdueFilter, managerFilter, stageFilter, sortKey, sortDir, getAggregatedStats, getHealthScore, getManagerId, getManagerName, getStage]);

  const getProgressBucket = useCallback((projectId: string): string => {
    const s = getAggregatedStats(projectId);
    if (s.total === 0) return "Нет задач";
    const pct = s.completed / s.total;
    if (pct >= 0.75) return "75–100%";
    if (pct >= 0.5) return "50–75%";
    if (pct >= 0.25) return "25–50%";
    return "0–25%";
  }, [getAggregatedStats]);

  const progressBucketOrder: Record<string, number> = { "75–100%": 0, "50–75%": 1, "25–50%": 2, "0–25%": 3, "Нет задач": 4 };

  // Grouping
  const groupedProjects = useMemo(() => {
    if (groupBy === "none") return [{ key: "", label: "", projects: filteredProjects }];
    const map = new Map<string, TaskGroup[]>();
    for (const p of filteredProjects) {
      let key: string;
      if (groupBy === "manager") {
        key = getManagerName(p.id);
      } else if (groupBy === "folder") {
        const folderId = projectFolderMap.get(p.id);
        key = folderId ? (folderMap.get(folderId)?.name || "Без папки") : "Без папки";
      } else {
        key = getProgressBucket(p.id);
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).map(([key, projects]) => ({ key, label: key, projects })).sort((a, b) => {
      if (groupBy === "progress") return (progressBucketOrder[a.key] ?? 0) - (progressBucketOrder[b.key] ?? 0);
      return a.label.localeCompare(b.label, "ru");
    });
  }, [filteredProjects, groupBy, getManagerName, getProgressBucket, projectFolderMap, folderMap]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "progress" || key === "health" ? "desc" : "asc"); }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // no tab state needed
      }
      return next;
    });
  };

  const totalAgg = filteredProjects.reduce(
    (acc, p) => { const s = getAggregatedStats(p.id); return { total: acc.total + s.total, completed: acc.completed + s.completed, overdue: acc.overdue + s.overdue }; },
    { total: 0, completed: 0, overdue: 0 }
  );

  const hasFilters = !!(search || overdueFilter || managerFilter || stageFilter || sortKey !== "name" || sortDir !== "asc");
  const activeFilterCount = [overdueFilter, !!managerFilter, !!stageFilter, sortKey !== "name"].filter(Boolean).length;

  const groupByOptions: { key: GroupBy; label: string; icon: React.ElementType }[] = [
    { key: "none", label: "Без группировки", icon: Layers },
    { key: "manager", label: "По ответственному", icon: User },
    { key: "folder", label: "По папке", icon: FolderOpen },
    { key: "progress", label: "По прогрессу", icon: BarChart3 },
  ];
  const activeGroupByOption = groupByOptions.find(o => o.key === groupBy) || groupByOptions[0];

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const summaryCards = [
    { label: "Проектов", value: filteredProjects.length, color: "text-foreground" },
    { label: "Задач", value: totalAgg.total, color: "text-foreground" },
    { label: "Выполнено", value: totalAgg.completed, color: "text-success" },
    ...(totalAgg.overdue > 0 ? [{ label: "Просрочено", value: totalAgg.overdue, color: "text-destructive" }] : []),
  ];

  const filtersBar = (
    <div className="flex items-center gap-2 mb-4">
      <div className="relative flex-1 min-w-0 max-w-[240px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={draftSearch} onChange={(e) => setDraftSearch(e.target.value)} placeholder="Поиск проектов..."
          className="h-9 w-full pl-9 pr-8 text-sm rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all" />
        {draftSearch && <button onClick={() => { setDraftSearch(""); setSearch(""); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
      </div>

      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => setOverdueFilter((v) => !v)}
              className={cn("h-9 w-9 rounded-lg flex items-center justify-center transition-all", overdueFilter ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
              <Clock className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">С просроченными</TooltipContent>
        </Tooltip>

        {/* Group by */}
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button className={cn("h-9 w-9 rounded-lg flex items-center justify-center transition-all", groupBy !== "none" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
                  <LayoutList className="h-4 w-4" />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">{groupBy === "none" ? "Группировка" : activeGroupByOption.label}</TooltipContent>
          </Tooltip>
          <PopoverContent className="w-48 p-1.5 bg-popover border-border z-50" side="bottom" align="start">
            {groupByOptions.map(opt => {
              const Icon = opt.icon;
              return (
                <button key={opt.key} onClick={() => setGroupBy(prev => prev === opt.key && opt.key !== "none" ? "none" : opt.key)}
                  className={cn("flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-sm transition-colors", groupBy === opt.key ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted")}>
                  <Icon className="h-3.5 w-3.5" />{opt.label}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>

        {/* Filter popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button className={cn("h-9 rounded-lg flex items-center justify-center transition-all relative", activeFilterCount > 0 ? "bg-primary/10 text-primary px-2.5 gap-1" : "w-9 text-muted-foreground hover:text-foreground hover:bg-muted")}>
              <Filter className="h-4 w-4" />
              {activeFilterCount > 0 && <span className="text-[10px] font-semibold">{activeFilterCount}</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0 bg-popover border-border z-50" side="bottom" align="end">
            <div className="p-2 border-b border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Ответственный</p>
              <PopoverSearchList items={managerOptions} searchKey={(u) => u.name} placeholder="Найти..."
                renderItem={(u) => (
                  <button key={u.id} onClick={() => setManagerFilter((p) => p === u.id ? null : u.id)}
                    className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors truncate", managerFilter === u.id && "bg-primary/10 text-primary")}>
                    <User className="h-3.5 w-3.5 shrink-0" />{u.name}
                  </button>
                 )} />
            </div>
            <div className="p-2 border-b border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Этап</p>
              {["Новый", "Подготовка", "Выполнение", "Завершён"].map((s) => (
                <button key={s} onClick={() => setStageFilter((p) => p === s ? null : s)}
                  className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors", stageFilter === s && "bg-primary/10 text-primary")}>{s}</button>
              ))}
            </div>
            <div className="p-2 border-b border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Сортировка</p>
              {([
                { key: "name" as SortKey, label: "По имени" },
                { key: "progress" as SortKey, label: "По прогрессу" },
                { key: "health" as SortKey, label: "По здоровью" },
                { key: "manager" as SortKey, label: "По ответственному" },
              ]).map((s) => (
                <button key={s.key} onClick={() => { if (sortKey === s.key) { setSortDir(d => d === "asc" ? "desc" : "asc"); } else { setSortKey(s.key); setSortDir(s.key === "progress" || s.key === "health" ? "desc" : "asc"); } }}
                  className={cn("flex items-center justify-between w-full px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors", sortKey === s.key && "bg-primary/10 text-primary")}>
                  <span>{s.label}</span>
                  {sortKey === s.key && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                </button>
              ))}
            </div>
            {hasFilters && (
              <div className="p-2">
                <button onClick={() => { setOverdueFilter(false); setManagerFilter(null); setStageFilter(null); setSortKey("name"); setSortDir("asc"); setGroupBy("none"); setDraftSearch(""); setSearch(""); }}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <X className="h-3.5 w-3.5" /> Сбросить все
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Summary cards (desktop) */}
      <div className="hidden md:flex items-center gap-2 ml-auto">
        {summaryCards.map((c) => (
          <div key={c.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border/50">
            <span className="text-xs text-muted-foreground">{c.label}</span>
            <span className={cn("text-sm font-bold", c.color)}>{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Mobile ──
  if (isMobile) {
    return (
      <div className="h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-y-contain touch-pan-y p-3 pb-20 scrollbar-thin">
        {filtersBar}
        <div className="space-y-1.5">
          {groupedProjects.map((group) => (
            <Fragment key={group.key || "all"}>
              {group.label && <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pt-2 pb-0.5">{group.label} <span className="text-foreground/60">({group.projects.length})</span></div>}
              {group.projects.map((project) => {
                const stats = getAggregatedStats(project.id);
                const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                const stage = getStage(stats);
                const health = getHealthDot(project.id);
                const children = groups.filter((g) => g.parent_id === project.id);
                const isExpanded = expandedIds.has(project.id);
                return (
                  <div key={project.id}>
                    <div className="rounded-lg border border-border bg-card p-2.5 transition-colors" onClick={() => toggleExpand(project.id)}>
                      <div className="flex items-center gap-2">
                        <StatusDot status={health.deadlines} size="md" />
                        <span className="text-xs font-medium text-foreground truncate flex-1">{project.name}</span>
                        <div className="flex items-center gap-1"><StatusDot status={health.deadlines} /><StatusDot status={health.tasks} /><StatusDot status={health.milestones} /></div>
                        {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                        <button onClick={(e) => { e.stopPropagation(); onOpenGantt?.(project.id); }} className="text-muted-foreground hover:text-primary"><GanttChart className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1 ml-5">
                        <span>{getManagerName(project.id)}{stats.total > 0 && stats.completed === stats.total && " 🏅"}</span><span>·</span><span className={stage.color}>{stage.label}</span>
                        <div className="flex-1" /><span>{progress}%</span>
                      </div>
                      <div className="mt-1 ml-5"><ProgressBar progress={progress} stats={stats} compact /></div>
                    </div>
                    {isExpanded && (
                      <div className="ml-2 mt-1 mb-2 rounded-lg bg-muted/10 border border-border/40 px-2.5 py-2 space-y-2 animate-fade-in">
                        <div className="flex items-center gap-1 flex-wrap">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedProjectId(project.id); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <LayoutList className="h-3 w-3" /> Карточка
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); onOpenGantt?.(project.id); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <GanttChart className="h-3 w-3" /> Гантт
                          </button>
                          {project.project_type === "npd" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); window.location.href = `/npd/matrix/${project.id}`; }}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            >
                              <Layers className="h-3 w-3" /> Матрица
                            </button>
                          )}
                        </div>
                        <ExpandedProjectDashboard
                          project={project}
                          children={children}
                          groups={groups}
                          userMap={userMap}
                          onOpenGantt={onOpenGantt}
                          onTaskClick={(id) => setSelectedTaskId(id)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
          {filteredProjects.length === 0 && <div className="text-center text-muted-foreground text-sm mt-8">{rootProjects.length === 0 ? "Нет проектов." : "Ничего не найдено."}</div>}
        </div>
      </div>
    );
  }

  // ── Desktop table ──
  let globalIdx = 0;

  return (
    <div className="p-4 md:p-6 scrollbar-thin">
      {filtersBar}

      {/* AI widgets */}
      <div className="flex flex-wrap items-start gap-2 mb-3">
        <PmoRiskRadar
          projects={filteredProjects.map(p => {
            const s = getAggregatedStats(p.id);
            const ms = milestones.filter(m => m.group_id === p.id);
            return {
              id: p.id,
              name: p.name,
              description: p.description || null,
              stats: { total: s.total, completed: s.completed, overdue: s.overdue },
              driftCount: s.driftCount,
              totalDelayDays: s.maxDriftDays,
              milestoneStats: ms.length > 0 ? {
                total: ms.length,
                completed: ms.filter(m => m.status === "completed").length,
                overdue: ms.filter(m => m.status !== "completed" && m.planned_date && new Date(m.planned_date) < new Date()).length,
              } : undefined,
            };
          })}
        />
        <PmoPortfolioSummary
          projects={filteredProjects.map(p => {
            const s = getAggregatedStats(p.id);
            const ms = milestones.filter(m => m.group_id === p.id);
            return {
              id: p.id,
              name: p.name,
              description: p.description || null,
              stats: { total: s.total, completed: s.completed, overdue: s.overdue },
              driftCount: s.driftCount,
              totalDelayDays: s.maxDriftDays,
              milestoneStats: ms.length > 0 ? {
                total: ms.length,
                completed: ms.filter(m => m.status === "completed").length,
                overdue: ms.filter(m => m.status !== "completed" && m.planned_date && new Date(m.planned_date) < new Date()).length,
              } : undefined,
            };
          })}
        />
      </div>

      <div className="relative w-full overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full caption-bottom text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-10 px-3 py-2.5 text-center text-xs text-muted-foreground font-semibold">№</th>
              <th className="px-3 py-2.5 text-left">
                <button onClick={() => toggleSort("name")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-semibold uppercase tracking-wider transition-colors">
                  Проект <SortIcon col="name" />
                </button>
              </th>
              <th className="px-3 py-2.5 text-left hidden lg:table-cell">
                <button onClick={() => toggleSort("manager")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-semibold uppercase tracking-wider transition-colors">
                  Ответственный <SortIcon col="manager" />
                </button>
              </th>
              <th className="px-3 py-2.5 text-center">
                <button onClick={() => toggleSort("health")} className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-semibold uppercase tracking-wider transition-colors mx-auto">
                  <Tooltip><TooltipTrigger className="cursor-default">Здоровье</TooltipTrigger><TooltipContent>Сроки · Задачи · Вехи</TooltipContent></Tooltip>
                  <SortIcon col="health" />
                </button>
              </th>
              <th className="px-3 py-2.5 min-w-[220px]">
                <button onClick={() => toggleSort("progress")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-semibold uppercase tracking-wider transition-colors">
                  Прогресс <SortIcon col="progress" />
                </button>
              </th>
              <th className="w-10 px-1 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {groupedProjects.map((group) => (
              <Fragment key={group.key || "all"}>
                {group.label && (
                  <tr>
                    <td colSpan={6} className="px-3 pt-4 pb-1.5">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{group.label} <span className="text-foreground/50 font-medium">({group.projects.length})</span></span>
                    </td>
                  </tr>
                )}
                {group.projects.map((project) => {
                  globalIdx++;
                  const stats = getAggregatedStats(project.id);
                  const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                  const stage = getStage(stats);
                  const health = getHealthDot(project.id);
                  const children = groups.filter((g) => g.parent_id === project.id);
                  const isExpanded = expandedIds.has(project.id);
                  const isEven = globalIdx % 2 === 0;
                  const isCritical = hasAnyCritical(project.id);

                  return (
                    <Fragment key={project.id}>
                      <tr
                        className={cn(
                          "border-b border-border/40 cursor-pointer group/row transition-colors",
                          isCritical
                            ? "bg-destructive/5 hover:bg-destructive/10 border-l-2 border-l-destructive"
                            : isEven ? "bg-muted/20 hover:bg-muted/40" : "hover:bg-muted/30"
                        )}
                        onClick={() => toggleExpand(project.id)}
                      >
                        <td className="px-3 py-2.5 text-center text-muted-foreground text-xs">{globalIdx}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="text-muted-foreground shrink-0">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </span>
                            <span className="font-medium text-foreground truncate max-w-[320px] group-hover/row:text-primary transition-colors" title={project.name}>
                              {project.name}
                            </span>
                            {children.length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0 font-medium">{children.length}</span>
                            )}
                            {stats.driftCount > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 text-[11px] shrink-0 ml-1 px-1.5 py-0.5 rounded-md font-medium text-amber-600 dark:text-amber-400 border border-dashed border-amber-500/40">
                                    <TrendingUp className="h-3 w-3" />
                                    {stats.maxDriftDays > 0 ? "+" : ""}{stats.maxDriftDays}д
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">{stats.driftCount} переносов, макс. сдвиг {stats.maxDriftDays > 0 ? "+" : ""}{stats.maxDriftDays}д</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 hidden lg:table-cell text-muted-foreground">{getManagerName(project.id)}{stats.total > 0 && stats.completed === stats.total && " 🏅"}</td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <StatusDot status={health.deadlines} size="md" />
                            <StatusDot status={health.tasks} size="md" />
                            <StatusDot status={health.milestones} size="md" />
                          </div>
                        </td>
                        <td className="px-3 py-2.5"><ProgressBar progress={progress} stats={stats} /></td>
                        <td className="px-1 py-2.5 text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button onClick={(e) => { e.stopPropagation(); onOpenGantt?.(project.id); }}
                                className="text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover/row:opacity-100">
                                <GanttChart className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">Открыть Гант</TooltipContent>
                          </Tooltip>
                        </td>
                      </tr>
                      {/* Expanded — tabbed view */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="px-0 py-0">
                            <div className="bg-muted/10 border-t border-border/30 px-6 py-3 space-y-3 animate-fade-in">
                              {/* Navigation links */}
                              <div className="flex items-center gap-1 mb-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedProjectId(project.id); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                >
                                  <LayoutList className="h-3.5 w-3.5" />
                                  Карточка
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); onOpenGantt?.(project.id); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                                >
                                  <GanttChart className="h-3.5 w-3.5" />
                                  Гантт
                                </button>
                                <button
                                  disabled={project.project_type !== "npd"}
                                  onClick={(e) => { e.stopPropagation(); window.location.href = `/npd/matrix/${project.id}`; }}
                                  className={cn(
                                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                                    project.project_type === "npd"
                                      ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                      : "text-muted-foreground/30 cursor-not-allowed"
                                  )}
                                >
                                  <Layers className="h-3.5 w-3.5" />
                                  Матрица
                                </button>
                              </div>
                              <ExpandedProjectDashboard
                                project={project}
                                children={children}
                                groups={groups}
                                userMap={userMap}
                                onOpenGantt={onOpenGantt}
                                onTaskClick={(id) => setSelectedTaskId(id)}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {filteredProjects.length === 0 && (
        <div className="text-center text-muted-foreground text-sm mt-12">
          {rootProjects.length === 0 ? "Нет проектов. Создайте проект в основном интерфейсе задач." : "Ничего не найдено по фильтрам."}
        </div>
      )}

      {filteredProjects.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 mt-3 text-[10px] text-muted-foreground px-1">
          <LegendItem color="bg-success" label="Норма" />
          <LegendItem color="bg-warning" label="Внимание" />
          <LegendItem color="bg-destructive" label="Проблема" />
          <LegendItem color="bg-muted-foreground/40" label="Нет данных" />
        </div>
      )}

      {/* Archived projects section */}
      {archivedProjects.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowArchived(prev => !prev)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-1"
          >
            {showArchived ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Archive className="h-3.5 w-3.5" />
            <span className="font-medium">Архив</span>
            <span className="text-[10px] text-muted-foreground/60">{archivedProjects.length}</span>
          </button>
          {showArchived && (
            <div className="mt-2 opacity-50">
              <div className="border border-border rounded-lg overflow-hidden">
                {archivedProjects.map((project, idx) => {
                  const stats = getAggregatedStats(project.id);
                  const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                  return (
                    <div
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30 transition-colors text-xs",
                        idx > 0 && "border-t border-border"
                      )}
                    >
                      <span>{project.icon && project.icon !== "list" ? project.icon : "📁"}</span>
                      <span className="flex-1 truncate text-muted-foreground">{project.name}</span>
                      <span className="text-[10px] text-muted-foreground">{pct}%</span>
                      <span className="text-[10px] text-muted-foreground">{stats.completed}/{stats.total}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}


      <Sheet open={!!selectedTaskId} onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 overflow-y-auto [&_.radix-popover-content]:z-[60]">
          {selectedTaskId && (() => {
            const task = allTasks.find((t) => t.id === selectedTaskId);
            if (!task) return null;
            return (
              <div className="p-4">
                <TaskItem task={task} initialOpen />
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Project detail sheet */}
      <Sheet open={!!selectedProjectId} onOpenChange={(open) => { if (!open) setSelectedProjectId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 overflow-y-auto [&_.radix-popover-content]:z-[60]">
          {selectedProjectId && (() => {
            const project = groups.find((g) => g.id === selectedProjectId);
            if (!project) return null;
            return <ProjectDetailPanel group={project} />;
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ─── Shared ─── */

const stageBadgeStyles: Record<string, string> = {
  "Новый": "bg-primary/10 text-primary",
  "Подготовка": "bg-warning/10 text-warning",
  "Выполнение": "bg-success/10 text-success",
  "Завершён": "bg-muted text-muted-foreground",
};

function StageBadge({ label, small }: { label: string; small?: boolean }) {
  const style = stageBadgeStyles[label] || "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-md font-medium", style, small ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5")}>
      {label}
    </span>
  );
}

function StatusDot({ status, size = "sm" }: { status: HealthStatus; size?: "sm" | "md" }) {
  return (
    <div className={cn(
      "rounded-full shrink-0",
      size === "md" ? "w-2.5 h-2.5" : "w-2 h-2",
      status === "green" && "bg-success",
      status === "yellow" && "bg-warning",
      status === "red" && "bg-destructive",
      status === "gray" && "bg-muted-foreground/40",
    )} />
  );
}

function ProgressBar({ progress, stats, compact }: { progress: number; stats: { total: number; completed: number; overdue: number }; compact?: boolean }) {
  const barColor = stats.overdue > 0 ? "bg-destructive" : progress === 100 ? "bg-success" : "bg-primary";
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex-1 rounded-full bg-muted/60 overflow-hidden relative", compact ? "h-2" : "h-3.5")}>
        <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${progress}%` }} />
        {!compact && progress > 8 && (
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-primary-foreground mix-blend-difference">
            {progress}%
          </span>
        )}
      </div>
      <span className={cn("font-medium text-right shrink-0 tabular-nums", compact ? "text-[11px] w-8 text-muted-foreground" : "text-xs w-12 text-muted-foreground")}>
        {compact ? `${progress}%` : `${stats.completed}/${stats.total}`}
      </span>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return <div className="flex items-center gap-1.5"><div className={cn("w-2 h-2 rounded-full", color)} /><span>{label}</span></div>;
}

/* ─── NPD-style subproject card for PMO expanded view ─── */

type PmoSubtask = { id: string; title: string; is_completed: boolean; deadline: string | null; assigned_to: string | null };
type PmoTask = { id: string; title: string; is_completed: boolean; deadline: string | null; original_deadline: string | null; assigned_to: string | null; user_id: string; start_at: string | null; subtasks?: PmoSubtask[] | null };

/**
 * Lazy-loaded dashboard for an expanded project row.
 *
 * Why: the global `useTasks` query is capped at 1000 rows by Supabase's
 * default limit, so projects sitting in the "tail" (e.g. "Китай май") had
 * empty Просроченные / Ближайшие / Переносы sections when expanded.
 * This component fetches the project + its direct children + grandchildren
 * in a focused query, bypassing the global cap.
 */
function ExpandedProjectDashboard({
  project,
  children,
  groups,
  userMap,
  onOpenGantt,
  onTaskClick,
}: {
  project: TaskGroup;
  children: TaskGroup[];
  groups: TaskGroup[];
  userMap: Map<string, Profile>;
  onOpenGantt?: (id: string) => void;
  onTaskClick: (id: string) => void;
}) {
  const { user } = useAuth();
  const scopeIds = useMemo(() => {
    const ids = [project.id, ...children.map((c) => c.id)];
    for (const c of children) {
      for (const g of groups) if (g.parent_id === c.id) ids.push(g.id);
    }
    return ids;
  }, [project.id, children, groups]);

  const { data: scopedTasks = [], isLoading } = useQuery({
    queryKey: ["pmo-expanded-tasks", project.id, scopeIds],
    queryFn: async () => {
      const results: any[] = [];
      for (let i = 0; i < scopeIds.length; i += 20) {
        const batch = scopeIds.slice(i, i + 20);
        const { data, error } = await supabase
          .from("tasks")
          .select("id,title,is_completed,deadline,original_deadline,assigned_to,user_id,start_at,group_id,subtasks(id,title,is_completed,deadline,assigned_to)")
          .in("group_id", batch);
        if (error) throw error;
        if (data) results.push(...data);
      }
      return results as (PmoTask & { group_id: string })[];
    },
    enabled: !!user && scopeIds.length > 0,
    staleTime: 30 * 1000,
  });

  const userName = (uid: string | null) => {
    if (!uid) return null;
    const p = userMap.get(uid);
    return p?.display_name || p?.email?.split("@")[0] || null;
  };

  if (isLoading) {
    return <p className="text-xs text-muted-foreground text-center py-2">Загружаем задачи…</p>;
  }

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const active = scopedTasks.filter((t) => !t.is_completed);
  const overdue = active.filter((t) => t.deadline && new Date(t.deadline) < now);
  const upcoming = active.filter((t) => t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow);
  const drifted = active
    .filter((t) => t.original_deadline && t.deadline && t.original_deadline !== t.deadline)
    .map((t) => ({ task: t, days: Math.round((new Date(t.deadline!).getTime() - new Date(t.original_deadline!).getTime()) / 86400000) }));

  const subprojectCards = children
    .map((child) => {
      const childName = child.name.includes("/") ? child.name.split("/").pop()?.trim() || child.name : child.name;
      const grandIds = groups.filter((g) => g.parent_id === child.id).map((g) => g.id);
      const allChildTasks = scopedTasks.filter((t) => t.group_id === child.id || grandIds.includes(t.group_id));
      return { child, childName, allChildTasks };
    })
    .filter((c) => c.allChildTasks.length > 0);

  return (
    <>
      {scopedTasks.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-1">Нет задач</p>
      ) : active.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-1">✅ Все задачи завершены</p>
      ) : (
        <>
          {overdue.length > 0 && (
            <PmoDashboardSection title="Просроченные" count={overdue.length} variant="destructive">
              {overdue.map((t) => (
                <PmoDashboardTaskRow key={t.id} task={t} assigneeName={userName(t.assigned_to || t.user_id)} variant="overdue" onClick={() => onTaskClick(t.id)} />
              ))}
            </PmoDashboardSection>
          )}
          {upcoming.length > 0 && (
            <PmoDashboardSection title="Ближайшие дедлайны" count={upcoming.length}>
              {upcoming.map((t) => (
                <PmoDashboardTaskRow key={t.id} task={t} assigneeName={userName(t.assigned_to || t.user_id)} onClick={() => onTaskClick(t.id)} />
              ))}
            </PmoDashboardSection>
          )}
          {drifted.length > 0 && (
            <PmoDashboardSection title="Переносы" count={drifted.length} variant="warning">
              {drifted.map(({ task: t, days }) => (
                <PmoDashboardTaskRow key={t.id} task={t} drift={days} assigneeName={userName(t.assigned_to || t.user_id)} onClick={() => onTaskClick(t.id)} />
              ))}
            </PmoDashboardSection>
          )}
          {overdue.length === 0 && upcoming.length === 0 && drifted.length === 0 && (
            <p className="text-[11px] text-success text-center py-1">✅ Все задачи в графике</p>
          )}
        </>
      )}

      {subprojectCards.length > 0 && (
        <div className="pt-1 border-t border-border/20">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Подпроекты</p>
          <div className="space-y-1.5">
            {subprojectCards.map(({ child, childName, allChildTasks }) => (
              <PmoSubprojectCard
                key={child.id}
                name={childName}
                color={child.color}
                icon={child.icon}
                tasks={allChildTasks}
                onOpenGantt={() => onOpenGantt?.(child.id)}
                userMap={userMap}
                onTaskClick={onTaskClick}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const STATUS_BADGE_PMO: Record<string, string> = {
  "on-track": "border-success/40 bg-success/10 text-success",
  "at-risk": "border-warning/40 bg-warning/10 text-warning",
  "overdue": "border-destructive/40 bg-destructive/10 text-destructive",
  "completed": "border-muted-foreground/30 bg-muted text-muted-foreground",
};
const STATUS_LABEL_PMO: Record<string, string> = {
  "on-track": "В графике", "at-risk": "Смещение", "overdue": "Просрочено", "completed": "Завершено",
};

function PmoSubprojectCard({ name, color, icon, tasks, onOpenGantt, userMap, onTaskClick }: {
  name: string;
  color: string | null;
  icon: string | null;
  tasks: PmoTask[];
  onOpenGantt: () => void;
  userMap: Map<string, Profile>;
  onTaskClick?: (taskId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const total = tasks.length;
  const completed = tasks.filter((t) => t.is_completed).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const activeTasks = tasks.filter((t) => !t.is_completed);
  const overdueTasks = activeTasks.filter((t) => t.deadline && new Date(t.deadline) < now);
  const upcomingTasks = activeTasks.filter((t) => t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow);
  const driftTasks = activeTasks
    .filter((t) => t.original_deadline && t.deadline && t.original_deadline !== t.deadline)
    .map((t) => ({
      task: t,
      driftDays: Math.round((new Date(t.deadline!).getTime() - new Date(t.original_deadline!).getTime()) / 86400000),
    }));

  const timingStatus = (() => {
    if (activeTasks.length === 0 && total > 0) return "completed";
    if (overdueTasks.length > 0) return "overdue";
    if (driftTasks.length > 0) return "at-risk";
    return "on-track";
  })();

  const userName = (userId: string | null) => {
    if (!userId) return null;
    const p = userMap.get(userId);
    return p?.display_name || p?.email?.split("@")[0] || null;
  };

  const maxOverdueDays = overdueTasks.length > 0
    ? Math.max(...overdueTasks.map((t) => Math.round((now.getTime() - new Date(t.deadline!).getTime()) / 86400000)))
    : 0;
  const maxDriftDays = driftTasks.length > 0
    ? driftTasks.reduce((max, d) => Math.abs(d.driftDays) > Math.abs(max) ? d.driftDays : max, 0)
    : 0;

  // Nearest deadline among active tasks
  const nearestDeadline = activeTasks
    .filter((t) => t.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0]?.deadline;

  return (
    <div className={cn("bg-card rounded-lg border border-dashed border-border overflow-hidden transition-shadow", expanded && "shadow-sm")}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors min-w-0"
      >
        <span className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
        <div
          className="h-5 w-5 rounded flex items-center justify-center shrink-0 text-[9px] font-semibold"
          style={{ backgroundColor: (color || "hsl(var(--primary))") + "18", color: color || "hsl(var(--primary))" }}
        >
          {icon && icon !== "list" ? <span className="text-xs">{icon}</span> : name.charAt(0).toUpperCase()}
        </div>
        <span className="font-medium text-[12px] truncate min-w-0">{name}</span>

        {/* Progress compact */}
        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{completed}/{total}</span>
        <div className="w-16 shrink-0">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-success" : overdueTasks.length > 0 ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">{pct}%</span>

        {/* Deadline */}
        {nearestDeadline && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("text-[10px] shrink-0 tabular-nums", overdueTasks.length > 0 ? "text-destructive" : "text-muted-foreground")}>
                {format(parseISO(nearestDeadline), "d MMM", { locale: ru })}
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Ближайший дедлайн</TooltipContent>
          </Tooltip>
        )}

        {/* Overdue badge */}
        {overdueTasks.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-destructive/10 text-destructive border border-destructive/20 shrink-0">
                <AlertTriangle className="h-3 w-3" />{overdueTasks.length}·{maxOverdueDays}д
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{overdueTasks.length} просроченных, макс. {maxOverdueDays}д</TooltipContent>
          </Tooltip>
        )}

        {/* Drift badge */}
        {driftTasks.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-medium text-amber-600 dark:text-amber-400 border border-dashed border-amber-500/40 shrink-0">
                <TrendingUp className="h-3 w-3" />{maxDriftDays > 0 ? "+" : ""}{maxDriftDays}д
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{driftTasks.length} переносов, макс. сдвиг {maxDriftDays > 0 ? "+" : ""}{maxDriftDays}д</TooltipContent>
          </Tooltip>
        )}

        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <button onClick={(e) => { e.stopPropagation(); onOpenGantt(); }} className="text-muted-foreground hover:text-primary transition-colors">
            <GanttChart className="h-3.5 w-3.5" />
          </button>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 pb-2 pt-2 space-y-2 animate-fade-in">
          {overdueTasks.length > 0 && (
            <PmoDashboardSection title="Просроченные" count={overdueTasks.length} variant="destructive">
              {overdueTasks.map((t) => (
                <PmoDashboardTaskRow key={t.id} task={t} assigneeName={userName(t.assigned_to || t.user_id)} variant="overdue" onClick={() => onTaskClick?.(t.id)} />
              ))}
            </PmoDashboardSection>
          )}
          {upcomingTasks.length > 0 && (
            <PmoDashboardSection title="Ближайшие дедлайны" count={upcomingTasks.length}>
              {upcomingTasks.map((t) => (
                <PmoDashboardTaskRow key={t.id} task={t} assigneeName={userName(t.assigned_to || t.user_id)} onClick={() => onTaskClick?.(t.id)} />
              ))}
            </PmoDashboardSection>
          )}
          {driftTasks.length > 0 && (
            <PmoDashboardSection title="Переносы" count={driftTasks.length} variant="warning">
              {driftTasks.map(({ task: t, driftDays }) => (
                <PmoDashboardTaskRow key={t.id} task={t} drift={driftDays} assigneeName={userName(t.assigned_to || t.user_id)} onClick={() => onTaskClick?.(t.id)} />
              ))}
            </PmoDashboardSection>
          )}
          {(() => {
            const categorizedIds = new Set([...overdueTasks.map((t) => t.id), ...upcomingTasks.map((t) => t.id), ...driftTasks.map((d) => d.task.id)]);
            const otherTasks = activeTasks.filter((t) => !categorizedIds.has(t.id));
            if (otherTasks.length === 0) return null;
            return (
              <PmoDashboardSection title="Активные" count={otherTasks.length}>
                {otherTasks.map((t) => (
                  <PmoDashboardTaskRow key={t.id} task={t} assigneeName={userName(t.assigned_to || t.user_id)} onClick={() => onTaskClick?.(t.id)} />
                ))}
              </PmoDashboardSection>
            );
          })()}
          {activeTasks.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-1">✅ Все задачи завершены</p>
          )}
        </div>
      )}
    </div>
  );
}

function PmoDashboardSection({ title, count, children, variant }: { title: string; count: number; children: React.ReactNode; variant?: "destructive" | "warning" }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className={cn("text-[11px] font-semibold", variant === "destructive" ? "text-destructive" : variant === "warning" ? "text-warning" : "text-foreground")}>{title}</span>
        <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{count}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function PmoDashboardTaskRow({ task, drift, assigneeName, variant, onClick }: { task: PmoTask; drift?: number; assigneeName?: string | null; variant?: "overdue"; onClick?: () => void }) {
  const isOverdue = variant === "overdue" || (!task.is_completed && task.deadline && isPast(parseISO(task.deadline)));
  const subtasks = task.subtasks ?? [];
  const hasSteps = subtasks.length > 0;
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0">
      <div
        className={cn("flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/50 transition-colors min-w-0")}
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (hasSteps) setOpen(v => !v); }}
          className={cn("shrink-0 w-4 h-4 inline-flex items-center justify-center rounded text-muted-foreground", hasSteps ? "hover:text-foreground hover:bg-muted" : "opacity-30 cursor-default")}
          aria-label={hasSteps ? "Развернуть шаги" : undefined}
          tabIndex={hasSteps ? 0 : -1}
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <span
          className={cn(
            "text-[11px] truncate flex-1 min-w-0",
            isOverdue ? "text-destructive" : "text-foreground",
            task.is_completed && "line-through text-muted-foreground",
            onClick && "cursor-pointer hover:underline",
          )}
          onClick={(e) => { e.stopPropagation(); onClick?.(); }}
          title={task.title}
        >
          {task.title}
        </span>
        {hasSteps && (
          <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">
            {subtasks.filter(s => s.is_completed).length}/{subtasks.length}
          </span>
        )}
        {assigneeName && <span className="text-[9px] text-muted-foreground shrink-0">{assigneeName}</span>}
        {drift !== undefined && (
          <span className={cn("text-[9px] font-mono font-semibold shrink-0", drift > 0 ? "text-destructive" : "text-success")}>
            {drift > 0 ? `+${drift}д` : `${drift}д`}
          </span>
        )}
        {task.deadline && (
          <span className="text-[9px] text-muted-foreground shrink-0">
            {format(parseISO(task.deadline), "d MMM", { locale: ru })}
          </span>
        )}
      </div>
      {open && hasSteps && (
        <ul className="ml-7 mb-1 mt-0.5 space-y-0.5 border-l border-border/40 pl-2">
          {subtasks.map((s) => {
            const sOverdue = !s.is_completed && s.deadline && isPast(parseISO(s.deadline));
            return (
              <li key={s.id} className="flex items-center gap-1.5 min-w-0">
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full shrink-0",
                  s.is_completed ? "bg-success" : sOverdue ? "bg-destructive" : "bg-muted-foreground/40",
                )} />
                <span className={cn(
                  "text-[10px] truncate min-w-0 flex-1",
                  s.is_completed && "line-through text-muted-foreground",
                  sOverdue && "text-destructive",
                )}>{s.title}</span>
                {s.deadline && (
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    {format(parseISO(s.deadline), "d MMM", { locale: ru })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

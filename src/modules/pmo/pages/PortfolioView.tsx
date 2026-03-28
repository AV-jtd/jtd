import { useTaskGroups, useTasks, useAvailableUsers, type TaskGroup, type Profile } from "@/hooks/useTasks";
import { useMilestones } from "@/hooks/useMilestones";
import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import { cn } from "@/lib/utils";
import { Search, X, Clock, Filter, User, ArrowUpDown, ArrowUp, ArrowDown, ChevronRight, ChevronDown, GanttChart, LayoutList, Layers, FolderOpen } from "lucide-react";
import { isPast, parseISO } from "date-fns";
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
type SortKey = "name" | "manager" | "stage" | "progress";
type SortDir = "asc" | "desc";
type GroupBy = "none" | "manager" | "stage";

export default function PortfolioView({ onOpenGantt }: PortfolioViewProps) {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

  const rootProjects = useMemo(() => groups.filter((g) => !g.parent_id), [groups]);

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
    return [projectId, ...childIds].reduce(
      (acc, id) => {
        const s = projectStats[id] || { total: 0, completed: 0, overdue: 0, driftCount: 0, upcoming: 0 };
        return { total: acc.total + s.total, completed: acc.completed + s.completed, overdue: acc.overdue + s.overdue, driftCount: acc.driftCount + s.driftCount, upcoming: acc.upcoming + s.upcoming };
      },
      { total: 0, completed: 0, overdue: 0, driftCount: 0, upcoming: 0 }
    );
  }, [groups, projectStats]);

  const getManagerId = useCallback((projectId: string): string => {
    const m = allGroupMembers.find((m) => m.group_id === projectId && (m.role === "owner" || m.role === "admin"));
    if (m) return m.user_id;
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
        case "stage": cmp = getStage(getAggregatedStats(a.id)).order - getStage(getAggregatedStats(b.id)).order; break;
        case "progress": {
          const pa = getAggregatedStats(a.id); const pb = getAggregatedStats(b.id);
          cmp = (pa.total > 0 ? pa.completed / pa.total : 0) - (pb.total > 0 ? pb.completed / pb.total : 0); break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rootProjects, search, overdueFilter, managerFilter, stageFilter, sortKey, sortDir, getAggregatedStats, getManagerId, getManagerName, getStage]);

  // Grouping
  const groupedProjects = useMemo(() => {
    if (groupBy === "none") return [{ key: "", label: "", projects: filteredProjects }];
    const map = new Map<string, TaskGroup[]>();
    for (const p of filteredProjects) {
      const key = groupBy === "manager" ? getManagerName(p.id) : getStage(getAggregatedStats(p.id)).label;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).map(([key, projects]) => ({ key, label: key, projects })).sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }, [filteredProjects, groupBy, getManagerName, getStage, getAggregatedStats]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const totalAgg = filteredProjects.reduce(
    (acc, p) => { const s = getAggregatedStats(p.id); return { total: acc.total + s.total, completed: acc.completed + s.completed, overdue: acc.overdue + s.overdue }; },
    { total: 0, completed: 0, overdue: 0 }
  );

  const hasFilters = !!(search || overdueFilter || managerFilter || stageFilter);
  const activeFilterCount = [overdueFilter, !!managerFilter, !!stageFilter].filter(Boolean).length;

  const groupByOptions: { key: GroupBy; label: string; icon: React.ElementType }[] = [
    { key: "none", label: "Без группировки", icon: Layers },
    { key: "manager", label: "По руководителю", icon: User },
    { key: "stage", label: "По этапу", icon: FolderOpen },
  ];
  const activeGroupByOption = groupByOptions.find(o => o.key === groupBy) || groupByOptions[0];

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const filtersBar = (
    <div className="flex items-center gap-1 mb-3">
      <div className="relative flex-1 min-w-0 max-w-[200px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input value={draftSearch} onChange={(e) => setDraftSearch(e.target.value)} placeholder="Поиск..."
          className="h-8 w-full pl-8 pr-7 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all" />
        {draftSearch && <button onClick={() => { setDraftSearch(""); setSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
      </div>

      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => setOverdueFilter((v) => !v)}
              className={cn("h-8 w-8 rounded-lg flex items-center justify-center transition-all", overdueFilter ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
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
                <button className={cn("h-8 w-8 rounded-lg flex items-center justify-center transition-all", groupBy !== "none" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
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
                <button key={opt.key} onClick={() => setGroupBy(opt.key)}
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
            <button className={cn("h-8 rounded-lg flex items-center justify-center transition-all relative", activeFilterCount > 0 ? "bg-primary/10 text-primary px-2.5 gap-1" : "w-8 text-muted-foreground hover:text-foreground hover:bg-muted")}>
              <Filter className="h-4 w-4" />
              {activeFilterCount > 0 && <span className="text-[10px] font-semibold">{activeFilterCount}</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0 bg-popover border-border z-50" side="bottom" align="end">
            <div className="p-2 border-b border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Руководитель</p>
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
            {hasFilters && (
              <div className="p-2">
                <button onClick={() => { setOverdueFilter(false); setManagerFilter(null); setStageFilter(null); setDraftSearch(""); setSearch(""); }}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <X className="h-3.5 w-3.5" /> Сбросить все
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <div className="hidden md:flex items-center gap-3 ml-auto text-xs text-muted-foreground">
        <span>Проектов: <strong className="text-foreground">{filteredProjects.length}</strong></span>
        <span>Задач: <strong className="text-foreground">{totalAgg.total}</strong></span>
        <span>Выполнено: <strong className="text-success">{totalAgg.completed}</strong></span>
        {totalAgg.overdue > 0 && <span>Просрочено: <strong className="text-destructive">{totalAgg.overdue}</strong></span>}
      </div>
    </div>
  );

  // ── Mobile ──
  if (isMobile) {
    return (
      <div className="h-full overflow-y-auto p-3 scrollbar-thin">
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
                    <div className="rounded-lg border border-border bg-card p-2.5 transition-colors" onClick={() => children.length > 0 ? toggleExpand(project.id) : onOpenGantt?.(project.id)}>
                      <div className="flex items-center gap-2">
                        <StatusDot status={health.deadlines} size="md" />
                        <span className="text-xs font-medium text-foreground truncate flex-1">{project.name}</span>
                        <div className="flex items-center gap-1"><StatusDot status={health.deadlines} /><StatusDot status={health.tasks} /><StatusDot status={health.milestones} /></div>
                        {children.length > 0 && (isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />)}
                        <button onClick={(e) => { e.stopPropagation(); onOpenGantt?.(project.id); }} className="text-muted-foreground hover:text-primary"><GanttChart className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1 ml-5">
                        <span>{getManagerName(project.id)}</span><span>·</span><span className={stage.color}>{stage.label}</span>
                        <div className="flex-1" /><span>{progress}%</span>
                      </div>
                      <div className="mt-1 ml-5"><ProgressBar progress={progress} stats={stats} compact /></div>
                    </div>
                    {isExpanded && children.length > 0 && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-border pl-2">
                        {children.map((child) => {
                          const cs = getAggregatedStats(child.id);
                          const cp = cs.total > 0 ? Math.round((cs.completed / cs.total) * 100) : 0;
                          return (
                            <div key={child.id} className="rounded-md bg-muted/30 p-2 text-xs cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onOpenGantt?.(child.id)}>
                              <div className="flex items-center gap-2">
                                <StatusDot status={getHealthDot(child.id).deadlines} />
                                <span className="truncate flex-1 text-foreground">{child.name.includes("/") ? child.name.split("/").pop()?.trim() : child.name}</span>
                                <span className="text-muted-foreground text-[10px]">{cs.completed}/{cs.total}</span>
                              </div>
                            </div>
                          );
                        })}
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
    <div className="h-full overflow-y-auto p-4 md:p-6 scrollbar-thin">
      {filtersBar}

      <div className="relative w-full overflow-auto">
        <table className="w-full caption-bottom text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="w-8 px-2 py-2 text-center text-muted-foreground font-medium">№</th>
              <th className="px-2 py-2 text-left">
                <button onClick={() => toggleSort("name")} className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium transition-colors">
                  Проект <SortIcon col="name" />
                </button>
              </th>
              <th className="px-2 py-2 text-left hidden lg:table-cell">
                <button onClick={() => toggleSort("manager")} className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium transition-colors">
                  Руководитель <SortIcon col="manager" />
                </button>
              </th>
              <th className="px-2 py-2 text-left hidden xl:table-cell">
                <button onClick={() => toggleSort("stage")} className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium transition-colors">
                  Этап <SortIcon col="stage" />
                </button>
              </th>
              <th className="px-2 py-2 text-center text-muted-foreground font-medium">
                <Tooltip><TooltipTrigger className="cursor-default">Здоровье</TooltipTrigger><TooltipContent>Сроки · Задачи · Вехи</TooltipContent></Tooltip>
              </th>
              <th className="px-2 py-2 min-w-[140px]">
                <button onClick={() => toggleSort("progress")} className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium transition-colors">
                  Прогресс <SortIcon col="progress" />
                </button>
              </th>
              <th className="w-8 px-1 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {groupedProjects.map((group) => (
              <Fragment key={group.key || "all"}>
                {group.label && (
                  <tr>
                    <td colSpan={7} className="px-2 pt-3 pb-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group.label} <span className="text-foreground/60">({group.projects.length})</span></span>
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

                  return (
                    <Fragment key={project.id}>
                      <tr
                        className={cn(
                          "border-b border-border/50 cursor-pointer group/row transition-colors hover:bg-muted/50",
                          isEven && "bg-muted/30"
                        )}
                        onClick={() => children.length > 0 ? toggleExpand(project.id) : onOpenGantt?.(project.id)}
                      >
                        <td className="px-2 py-1.5 text-center text-muted-foreground">{globalIdx}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            {children.length > 0 ? (
                              <span className="text-muted-foreground">{isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</span>
                            ) : (
                              <StatusDot status={health.deadlines} size="md" />
                            )}
                            <span className="font-medium text-foreground truncate max-w-[280px] group-hover/row:text-primary transition-colors" title={project.name}>
                              {project.name}
                            </span>
                            {children.length > 0 && (
                              <span className="text-[9px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground shrink-0">{children.length}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 hidden lg:table-cell text-muted-foreground">{getManagerName(project.id)}</td>
                        <td className="px-2 py-1.5 hidden xl:table-cell">
                          <span className={cn("font-medium", stage.color)}>{stage.label}</span>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <StatusDot status={health.deadlines} size="md" />
                            <StatusDot status={health.tasks} size="md" />
                            <StatusDot status={health.milestones} size="md" />
                          </div>
                        </td>
                        <td className="px-2 py-1.5"><ProgressBar progress={progress} stats={stats} /></td>
                        <td className="px-1 py-1.5 text-center">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button onClick={(e) => { e.stopPropagation(); onOpenGantt?.(project.id); }}
                                className="text-muted-foreground hover:text-primary transition-colors opacity-0 group-hover/row:opacity-100">
                                <GanttChart className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">Открыть Гант</TooltipContent>
                          </Tooltip>
                        </td>
                      </tr>
                      {/* Expanded subprojects */}
                      {isExpanded && children.map((child) => {
                        const cs = getAggregatedStats(child.id);
                        const cp = cs.total > 0 ? Math.round((cs.completed / cs.total) * 100) : 0;
                        const cHealth = getHealthDot(child.id);
                        const cStage = getStage(cs);
                        const childName = child.name.includes("/") ? child.name.split("/").pop()?.trim() || child.name : child.name;
                        return (
                          <tr key={child.id} className="border-b border-border/20 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => onOpenGantt?.(child.id)}>
                            <td className="px-2 py-1"></td>
                            <td className="px-2 py-1 pl-6">
                              <div className="flex items-center gap-2 border-l-2 border-primary/20 pl-2">
                                <StatusDot status={cHealth.deadlines} />
                                <span className="text-muted-foreground truncate max-w-[240px]" title={child.name}>{childName}</span>
                              </div>
                            </td>
                            <td className="px-2 py-1 hidden lg:table-cell text-muted-foreground">{getManagerName(child.id)}</td>
                            <td className="px-2 py-1 hidden xl:table-cell"><span className={cn("font-medium", cStage.color)}>{cStage.label}</span></td>
                            <td className="px-2 py-1 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <StatusDot status={cHealth.deadlines} />
                                <StatusDot status={cHealth.tasks} />
                                <StatusDot status={cHealth.milestones} />
                              </div>
                            </td>
                            <td className="px-2 py-1"><ProgressBar progress={cp} stats={cs} compact /></td>
                            <td className="px-1 py-1"></td>
                          </tr>
                        );
                      })}
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
    </div>
  );
}

/* ─── Shared ─── */

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
    <div className="flex items-center gap-2">
      <div className={cn("flex-1 rounded-full bg-muted overflow-hidden", compact ? "h-1.5" : "h-2")}>
        <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${progress}%` }} />
      </div>
      <span className={cn("font-medium text-muted-foreground text-right", compact ? "text-[10px] w-8" : "text-[11px] w-10")}>
        {compact ? `${progress}%` : `${stats.completed}/${stats.total}`}
      </span>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return <div className="flex items-center gap-1.5"><div className={cn("w-2 h-2 rounded-full", color)} /><span>{label}</span></div>;
}

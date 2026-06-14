import { useMemo, useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, LayoutGrid, Filter, FileSpreadsheet, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Rows3, Rows2, AlertTriangle, CheckCircle2, Clock, Rocket, CircleDashed } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStmProjects } from "../hooks/useStmProjects";
import { getStmStages, type StmFlow } from "../lib/stages";
import { StmMatrixHeader } from "../components/StmMatrixHeader";
import { StmMatrixRow } from "../components/StmMatrixRow";
import { StmDashboardBar } from "../components/StmDashboardBar";
import { computeStmAnalytics, isStmProjectOverdue, isStmProjectBlocked, isStmProjectStuck } from "../lib/stmAnalytics";
import StmCreateSkuDialog from "../components/StmCreateSkuDialog";
import StmExcelImportDialog from "../components/StmExcelImportDialog";
import { cn } from "@/lib/utils";

/** Aggregate stats shape shared by group + subgroup headers. */
interface GroupStat {
  count: number;
  avgProgress: number;
  overdueCount: number;
  doneCount: number;
  activeCount: number;
  notStartedCount: number;
  riskCount: number;
  readyCount: number;
}

/**
 * Left-aligned portfolio metrics for a (sub)group header.
 * Order = funnel health: progress → not started → in progress → ready →
 * done → risk → overdue. Zero-value badges are hidden to keep it scannable.
 */
function GroupMetrics({ s, size = "md" }: { s: GroupStat; size?: "md" | "sm" }) {
  const bar = size === "md" ? "w-16 h-1.5" : "w-12 h-1";
  const ic = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  const badge = "inline-flex items-center gap-0.5 text-[10px] font-medium tabular-nums";
  return (
    <span className="flex items-center gap-2.5 shrink-0">
      {/* avg progress */}
      <span className="flex items-center gap-1.5">
        <span className={cn("rounded-full bg-muted overflow-hidden", bar)}>
          <span
            className="block h-full rounded-full bg-primary/60"
            style={{ width: `${Math.max(s.avgProgress, s.avgProgress > 0 ? 4 : 0)}%` }}
          />
        </span>
        <span className="text-[10px] tabular-nums font-mono text-muted-foreground w-8 text-right">{s.avgProgress}%</span>
      </span>
      {s.notStartedCount > 0 && (
        <span className={cn(badge, "text-muted-foreground/60")} title="Не начато">
          <CircleDashed className={ic} />{s.notStartedCount}
        </span>
      )}
      {s.activeCount > 0 && (
        <span className={cn(badge, "text-foreground/70")} title="В работе">
          <Clock className={ic} />{s.activeCount}
        </span>
      )}
      {s.readyCount > 0 && (
        <span className={cn(badge, "text-primary")} title="Готовы к запуску (вкус утверждён)">
          <Rocket className={ic} />{s.readyCount}
        </span>
      )}
      {s.doneCount > 0 && (
        <span className={cn(badge, "text-success")} title="Завершено">
          <CheckCircle2 className={ic} />{s.doneCount}
        </span>
      )}
      {s.riskCount > 0 && (
        <span className={cn(badge, "text-warning")} title="Зависли / заблокированы">
          ⏳<span>{s.riskCount}</span>
        </span>
      )}
      {s.overdueCount > 0 && (
        <span className={cn(badge, "font-semibold text-destructive")} title="Просрочено">
          <AlertTriangle className={ic} />{s.overdueCount}
        </span>
      )}
    </span>
  );
}

/**
 * STM (Private Label) Mission Control matrix.
 * Architectural Glass aesthetic: dark glass surfaces, glowing accent on active stage.
 */
export default function StmMatrixView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const projects = useStmProjects();
  const [flow, setFlow] = useState<StmFlow>("in");
  const [groupBy, setGroupBy] = useState<"none" | "retailer" | "drop" | "brand">("retailer");
  // Secondary grouping: within a brand/retailer group, split rows by project.
  const [subGroupProject, setSubGroupProject] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("stm:subGroupProject") === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem("stm:subGroupProject", subGroupProject ? "1" : "0"); } catch { /* ignore */ }
  }, [subGroupProject]);
  // Default = active only ("чтобы лишнего не показывать"). Persist to localStorage.
  const [statusFilter, setStatusFilter] = useState<"active" | "archived" | "all">(() => {
    if (typeof window === "undefined") return "active";
    const v = window.localStorage.getItem("stm:statusFilter");
    return v === "archived" || v === "all" ? v : "active";
  });
  useEffect(() => {
    try { window.localStorage.setItem("stm:statusFilter", statusFilter); } catch { /* ignore */ }
  }, [statusFilter]);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Row density: comfortable (full) or compact (single-line dot heat-map).
  const [density, setDensity] = useState<"comfortable" | "compact">(() => {
    if (typeof window === "undefined") return "comfortable";
    return window.localStorage.getItem("stm:density") === "compact" ? "compact" : "comfortable";
  });
  useEffect(() => {
    try { window.localStorage.setItem("stm:density", density); } catch { /* ignore */ }
  }, [density]);
  // Dashboard funnel filter: show only SKUs whose current stage matches.
  const [focusStage, setFocusStage] = useState<string | null>(null);
  // Persist collapsed groups per groupBy mode in localStorage so that the
  // layout survives reloads and tab navigation.
  const storageKey = `stm:collapsedGroups:${groupBy}`;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(`stm:collapsedGroups:${groupBy}`);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  // Reload persisted state when the grouping mode changes.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const arr = raw ? JSON.parse(raw) : [];
      setCollapsedGroups(Array.isArray(arr) ? new Set(arr as string[]) : new Set());
    } catch {
      setCollapsedGroups(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy]);

  // Persist on every change.
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(collapsedGroups)));
    } catch {
      /* ignore quota errors */
    }
  }, [collapsedGroups, storageKey]);
  const expandedSku = searchParams.get("sku");
  const activeStage = searchParams.get("stage");

  const toggleExpand = (id: string) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (next.get("sku") === id) {
          next.delete("sku");
          next.delete("stage");
        } else {
          next.set("sku", id);
          next.delete("stage");
        }
        return next;
      },
      // push, чтобы expand/collapse попадал в history → back/forward работают
    );
  };

  const setActiveStage = (stageKey: string | null) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        if (!stageKey) next.delete("stage");
        else next.set("stage", stageKey);
        return next;
      },
      // push: каждое переключение этапа = новая запись в history
    );
  };

  // If the expanded SKU belongs to the other flow, switch tabs to keep it visible.
  useEffect(() => {
    if (!expandedSku) return;
    const target = projects.find(p => p.group.id === expandedSku);
    if (target && target.flow !== flow) setFlow(target.flow);
  }, [expandedSku, projects, flow]);

  const stages = getStmStages(flow);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects
      .filter(p => p.flow === flow)
      .filter(p => {
        if (statusFilter === "active") return !p.archivedAt;
        if (statusFilter === "archived") return !!p.archivedAt;
        return true;
      })
      .filter(p => {
        if (!q) return true;
        const meta = p.meta;
        return (
          p.group.name.toLowerCase().includes(q) ||
          (meta.retailer || "").toLowerCase().includes(q) ||
          (meta.brand || "").toLowerCase().includes(q) ||
          (meta.drop || "").toLowerCase().includes(q)
        );
      });
  }, [projects, flow, search, statusFilter]);

  // Analytics are computed on the search/status-filtered set (before the
  // funnel focus filter) so the dashboard always reflects the full portfolio.
  const analytics = useMemo(() => computeStmAnalytics(visible, flow), [visible, flow]);

  // Reset funnel focus when the flow changes (stage keys differ between flows).
  useEffect(() => { setFocusStage(null); }, [flow]);

  const focused = useMemo(
    () => (focusStage ? visible.filter(p => p.currentStageKey === focusStage) : visible),
    [visible, focusStage],
  );

  // Counts per status for the tab labels (within current flow).
  const statusCounts = useMemo(() => {
    const inFlow = projects.filter(p => p.flow === flow);
    return {
      active: inFlow.filter(p => !p.archivedAt).length,
      archived: inFlow.filter(p => !!p.archivedAt).length,
      all: inFlow.length,
    };
  }, [projects, flow]);

  const stat = (items: typeof visible) => {
    const count = items.length;
    const avgProgress = count ? Math.round(items.reduce((s, p) => s + p.progress, 0) / count) : 0;
    const overdueCount = items.filter(isStmProjectOverdue).length;
    // Завершённые SKU (100%).
    const doneCount = items.filter(p => p.progress >= 100).length;
    // В работе (начаты, но не закрыты и не просрочены).
    const activeCount = items.filter(p => p.progress > 0 && p.progress < 100 && !isStmProjectOverdue(p)).length;
    // Ещё не начаты.
    const notStartedCount = items.filter(p => p.progress === 0).length;
    // Риск: завис/заблокирован (без учёта уже просроченных — те идут в overdue).
    const riskCount = items.filter(p =>
      !p.archivedAt && p.progress < 100 && !isStmProjectOverdue(p) &&
      (isStmProjectBlocked(p) || isStmProjectStuck(p)),
    ).length;
    // Готовы к запуску: вкус утверждён, но SKU ещё не закрыт.
    const readyCount = items.filter(p =>
      p.progress < 100 && p.stageTasks.some(t => (t as any).stage_key === "approval" && t.is_completed),
    ).length;
    return { count, avgProgress, overdueCount, doneCount, activeCount, notStartedCount, riskCount, readyCount };
  };
  type SubGroup = { key: string; label: string; items: typeof visible } & ReturnType<typeof stat>;
  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ key: "__all", label: "", items: focused, subgroups: null as null | SubGroup[], ...stat(focused) }];
    const map = new Map<string, typeof visible>();
    focused.forEach(p => {
      const k = (p.meta as any)[groupBy] || "Без группы";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    });
    const canSub = subGroupProject && (groupBy === "brand" || groupBy === "retailer");
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "ru"))
      .map(([key, items]) => {
        let subgroups: SubGroup[] | null = null;
        if (canSub) {
          const sm = new Map<string, typeof visible>();
          items.forEach(p => {
            const sk = p.meta.project?.trim() || "Без проекта";
            if (!sm.has(sk)) sm.set(sk, []);
            sm.get(sk)!.push(p);
          });
          subgroups = Array.from(sm.entries())
            .sort(([a], [b]) => a.localeCompare(b, "ru"))
            .map(([sk, sitems]) => ({ key: `${key}//${sk}`, label: sk, items: sitems, ...stat(sitems) }));
        }
        return { key, label: key, items, subgroups, ...stat(items) };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, groupBy, subGroupProject]);

  // Aggregates-first: on every page entry start with every group collapsed
  // (portfolio "from above") regardless of saved preference. The user can
  // expand groups afterwards within the same session.
  const autoCollapsedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (groupBy === "none") return;
    if (autoCollapsedRef.current.has(storageKey)) return;
    if (grouped.length === 0) return; // wait for data
    setCollapsedGroups(new Set(grouped.map(g => g.key)));
    autoCollapsedRef.current.add(storageKey);
  }, [groupBy, grouped, storageKey]);

  const totalProgress = visible.length
    ? Math.round(visible.reduce((s, p) => s + p.progress, 0) / visible.length)
    : 0;
  const overdueCount = visible.reduce(
    (n, p) => n + p.stageTasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < new Date()).length,
    0,
  );

  // ---- Flattened item list (group headers + rows) for virtualization ----
  type FlatItem =
    | { kind: "group"; key: string; group: (typeof grouped)[number] }
    | { kind: "subgroup"; key: string; subgroup: SubGroup }
    | { kind: "row"; key: string; project: (typeof visible)[number] };
  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    grouped.forEach(g => {
      if (g.label) items.push({ kind: "group", key: `g:${g.key}`, group: g });
      if (g.label && collapsedGroups.has(g.key)) return;
      if (g.subgroups) {
        g.subgroups.forEach(sg => {
          items.push({ kind: "subgroup", key: `sg:${sg.key}`, subgroup: sg });
          if (!collapsedGroups.has(sg.key)) {
            sg.items.forEach(p => items.push({ kind: "row", key: `r:${p.group.id}`, project: p }));
          }
        });
      } else {
        g.items.forEach(p => items.push({ kind: "row", key: `r:${p.group.id}`, project: p }));
      }
    });
    return items;
  }, [grouped, collapsedGroups]);

  const matrixWidth = 320 + stages.length * 80 + 260;

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => {
      const it = flatItems[i];
      if (it.kind === "group") return 34;
      if (it.kind === "subgroup") return 28;
      if (expandedSku === it.project.group.id) return density === "compact" ? 380 : 440;
      return density === "compact" ? 37 : 97;
    },
    overscan: 8,
    getItemKey: (i) => flatItems[i].key,
  });
  // Re-measure when density or the expanded row changes (estimate shifts).
  useEffect(() => { rowVirtualizer.measure(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [density, expandedSku]);

  return (
    <div className="stm-matrix flex flex-col h-full bg-background text-foreground">
      {/* NPD / STM workflow switcher */}
      <div className="px-4 pt-2 shrink-0">
        <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-muted/60 border border-border">
          <button
            onClick={() => navigate("/npd")}
            className="text-xs font-medium px-3 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
          >
            NPD проекты
          </button>
          <button
            className="text-xs font-medium px-3 py-1 rounded-md bg-primary/15 text-primary shadow-sm"
            aria-pressed
          >
            СТМ Mission Control
          </button>
        </div>
      </div>

      {/* Top control bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2 min-w-0">
          <LayoutGrid className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground whitespace-nowrap">STM Mission Control</h1>
          <span className="text-xs text-muted-foreground ml-2">{visible.length} SKU · {totalProgress}% средний прогресс {overdueCount > 0 && (
            <span className="text-destructive ml-1">· ⚠ {overdueCount} просрочено</span>
          )}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск SKU, сеть, бренд..."
              className="h-8 pl-8 w-56"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as any)}
              className="bg-background border border-border rounded h-8 px-2 text-xs text-foreground"
            >
              <option value="none">Без группировки</option>
              <option value="retailer">По сети</option>
              <option value="brand">По бренду</option>
              <option value="drop">По дропу</option>
            </select>
          </div>

          {(groupBy === "brand" || groupBy === "retailer") && (
            <button
              type="button"
              onClick={() => setSubGroupProject(v => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-2.5 rounded text-xs border transition-colors",
                subGroupProject
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "bg-background text-muted-foreground border-border hover:text-foreground",
              )}
              aria-pressed={subGroupProject}
              title="Группировать внутри по проектам"
            >
              ↳ по проектам
            </button>
          )}

          {groupBy !== "none" && grouped.length > 0 && (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCollapsedGroups(new Set(grouped.map(g => g.key)))}
                className="h-8 px-2"
                title="Свернуть все группы"
              >
                <ChevronsDownUp className="h-3.5 w-3.5 mr-1" /> Свернуть всё
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCollapsedGroups(new Set())}
                className="h-8 px-2"
                title="Развернуть все группы"
              >
                <ChevronsUpDown className="h-3.5 w-3.5 mr-1" /> Развернуть всё
              </Button>
            </div>
          )}

          {/* Density toggle: comfortable / compact heat-map */}
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/60 border border-border">
            <button
              type="button"
              onClick={() => setDensity("comfortable")}
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-md transition-colors",
                density === "comfortable" ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={density === "comfortable"}
              title="Комфортный режим"
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDensity("compact")}
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-md transition-colors",
                density === "compact" ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={density === "compact"}
              title="Плотный режим (тепловая карта)"
            >
              <Rows2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="h-8"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Импорт Excel
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="h-8">
            <Plus className="h-3.5 w-3.5 mr-1" /> SKU
          </Button>
        </div>
      </div>

      {/* Flow tabs */}
      <div className="px-4 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs value={flow} onValueChange={(v) => setFlow(v as StmFlow)}>
            <TabsList>
              <TabsTrigger value="in">
                Ввод SKU <span className="ml-1.5 text-[10px] opacity-60">{projects.filter(p => p.flow === "in" && !p.archivedAt).length}</span>
              </TabsTrigger>
              <TabsTrigger value="out">
                Вывод SKU <span className="ml-1.5 text-[10px] opacity-60">{projects.filter(p => p.flow === "out" && !p.archivedAt).length}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Status filter: active / archived / all */}
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/60 border border-border">
            {[
              { key: "active", label: "Активные", count: statusCounts.active },
              { key: "archived", label: "Архив", count: statusCounts.archived },
              { key: "all", label: "Все", count: statusCounts.all },
            ].map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setStatusFilter(opt.key as any)}
                className={cn(
                  "text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors",
                  statusFilter === opt.key
                    ? "bg-primary/15 text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={statusFilter === opt.key}
              >
                {opt.label}
                <span className="ml-1 text-[10px] opacity-60">{opt.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dashboard summary band */}
      <StmDashboardBar analytics={analytics} />

      {/* Matrix scroll area */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        {focused.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16">
            <LayoutGrid className="h-10 w-10 opacity-40" />
            <div className="text-sm">
              {focusStage
                ? "Нет SKU на выбранном этапе"
                : `Нет SKU в потоке «${flow === "in" ? "Ввод" : "Вывод"}»`}
            </div>
            {focusStage ? (
              <Button size="sm" variant="outline" onClick={() => setFocusStage(null)}>
                Сбросить фильтр по этапу
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Создать первый SKU
              </Button>
            )}
          </div>
        ) : (
          <div style={{ width: matrixWidth }} className="relative">
            <StmMatrixHeader stages={stages} />
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map(vi => {
                const it = flatItems[vi.index];
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={rowVirtualizer.measureElement}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
                  >
                    {it.kind === "group" ? (
                      <button
                        type="button"
                        onClick={() => setCollapsedGroups(prev => {
                          const next = new Set(prev);
                          next.has(it.group.key) ? next.delete(it.group.key) : next.add(it.group.key);
                          return next;
                        })}
                        className="w-full flex items-center gap-2 px-4 h-[34px] bg-muted/60 border-b border-border hover:bg-muted transition-colors text-left"
                        aria-expanded={!collapsedGroups.has(it.group.key)}
                      >
                        {collapsedGroups.has(it.group.key)
                          ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                          : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                        <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold truncate max-w-[220px]">{it.group.label}</span>
                        <span className="text-[10px] text-muted-foreground/70 shrink-0 w-12">{it.group.count} SKU</span>
                        <GroupMetrics s={it.group} />
                      </button>
                    ) : it.kind === "subgroup" ? (
                      <button
                        type="button"
                        onClick={() => setCollapsedGroups(prev => {
                          const next = new Set(prev);
                          next.has(it.subgroup.key) ? next.delete(it.subgroup.key) : next.add(it.subgroup.key);
                          return next;
                        })}
                        className="w-full flex items-center gap-2 pl-9 pr-4 h-[28px] bg-muted/30 border-b border-border/60 hover:bg-muted/50 transition-colors text-left"
                        aria-expanded={!collapsedGroups.has(it.subgroup.key)}
                      >
                        {collapsedGroups.has(it.subgroup.key)
                          ? <ChevronRight className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                          : <ChevronDown className="h-3 w-3 text-muted-foreground/70 shrink-0" />}
                        <span className="text-[10px] text-muted-foreground shrink-0">📁</span>
                        <span className="text-[10px] tracking-wide text-muted-foreground font-medium truncate max-w-[200px]">{it.subgroup.label}</span>
                        <span className="text-[10px] text-muted-foreground/60 shrink-0 w-12">{it.subgroup.count} SKU</span>
                        <GroupMetrics s={it.subgroup} size="sm" />
                      </button>
                    ) : (
                      <StmMatrixRow
                        project={it.project}
                        stages={stages}
                        density={density}
                        expanded={expandedSku === it.project.group.id}
                        onToggleExpand={toggleExpand}
                        onOpenGantt={(id) => navigate(`/pmo/project/${id}`)}
                        activeStageKey={expandedSku === it.project.group.id ? activeStage : null}
                        onActiveStageChange={setActiveStage}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <StmCreateSkuDialog open={createOpen} onOpenChange={setCreateOpen} defaultFlow={flow} />
      <StmExcelImportDialog open={importOpen} onOpenChange={setImportOpen} defaultFlow={flow} />
    </div>
  );
}
import { useMemo, useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, LayoutGrid, Filter, FileSpreadsheet, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStmProjects } from "../hooks/useStmProjects";
import { getStmStages, type StmFlow } from "../lib/stages";
import { StmMatrixHeader } from "../components/StmMatrixHeader";
import { StmMatrixRow } from "../components/StmMatrixRow";
import { StmDashboardBar } from "../components/StmDashboardBar";
import { computeStmAnalytics } from "../lib/stmAnalytics";
import StmCreateSkuDialog from "../components/StmCreateSkuDialog";
import StmExcelImportDialog from "../components/StmExcelImportDialog";
import { cn } from "@/lib/utils";

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

  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ key: "__all", label: "", items: focused }];
    const map = new Map<string, typeof visible>();
    focused.forEach(p => {
      const k = (p.meta as any)[groupBy] || "Без группы";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "ru"))
      .map(([key, items]) => ({ key, label: key, items }));
  }, [focused, groupBy]);

  const totalProgress = visible.length
    ? Math.round(visible.reduce((s, p) => s + p.progress, 0) / visible.length)
    : 0;
  const overdueCount = visible.reduce(
    (n, p) => n + p.stageTasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < new Date()).length,
    0,
  );

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

      {/* Matrix scroll area */}
      <div className="flex-1 overflow-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-16">
            <LayoutGrid className="h-10 w-10 opacity-40" />
            <div className="text-sm">Нет SKU в потоке «{flow === "in" ? "Ввод" : "Вывод"}»</div>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Создать первый SKU
            </Button>
          </div>
        ) : (
          <div className="min-w-fit">
            <StmMatrixHeader stages={stages} />
            {grouped.map(g => (
              <div key={g.key}>
                {g.label && (
                  <button
                    type="button"
                    onClick={() => setCollapsedGroups(prev => {
                      const next = new Set(prev);
                      next.has(g.key) ? next.delete(g.key) : next.add(g.key);
                      return next;
                    })}
                    className="sticky left-0 z-[1] w-full flex items-center gap-1.5 px-4 py-1.5 bg-muted/60 border-b border-border hover:bg-muted transition-colors text-left"
                    aria-expanded={!collapsedGroups.has(g.key)}
                  >
                    {collapsedGroups.has(g.key)
                      ? <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                    <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">{g.label}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground/70">{g.items.length}</span>
                  </button>
                )}
                {!collapsedGroups.has(g.key) && g.items.map(p => (
                  <StmMatrixRow
                    key={p.group.id}
                    project={p}
                    stages={stages}
                    expanded={expandedSku === p.group.id}
                    onToggleExpand={toggleExpand}
                    onOpenGantt={(id) => navigate(`/pmo/project/${id}`)}
                    activeStageKey={expandedSku === p.group.id ? activeStage : null}
                    onActiveStageChange={setActiveStage}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <StmCreateSkuDialog open={createOpen} onOpenChange={setCreateOpen} defaultFlow={flow} />
      <StmExcelImportDialog open={importOpen} onOpenChange={setImportOpen} defaultFlow={flow} />
    </div>
  );
}
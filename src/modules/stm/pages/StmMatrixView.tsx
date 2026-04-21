import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, LayoutGrid, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStmProjects } from "../hooks/useStmProjects";
import { getStmStages, type StmFlow } from "../lib/stages";
import { StmMatrixHeader } from "../components/StmMatrixHeader";
import { StmMatrixRow } from "../components/StmMatrixRow";
import StmCreateSkuDialog from "../components/StmCreateSkuDialog";

/**
 * STM (Private Label) Mission Control matrix.
 * Architectural Glass aesthetic: dark glass surfaces, glowing accent on active stage.
 */
export default function StmMatrixView() {
  const navigate = useNavigate();
  const projects = useStmProjects();
  const [flow, setFlow] = useState<StmFlow>("in");
  const [groupBy, setGroupBy] = useState<"none" | "retailer" | "drop" | "brand">("none");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const stages = getStmStages(flow);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects
      .filter(p => p.flow === flow)
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
  }, [projects, flow, search]);

  const grouped = useMemo(() => {
    if (groupBy === "none") return [{ key: "__all", label: "", items: visible }];
    const map = new Map<string, typeof visible>();
    visible.forEach(p => {
      const k = (p.meta as any)[groupBy] || "Без группы";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "ru"))
      .map(([key, items]) => ({ key, label: key, items }));
  }, [visible, groupBy]);

  const totalProgress = visible.length
    ? Math.round(visible.reduce((s, p) => s + p.progress, 0) / visible.length)
    : 0;
  const overdueCount = visible.reduce(
    (n, p) => n + p.stageTasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < new Date()).length,
    0,
  );

  return (
    <div className="stm-matrix flex flex-col h-full bg-stm-bg text-stm-fg">
      {/* NPD / STM workflow switcher */}
      <div className="px-4 pt-2 shrink-0">
        <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-stm-glass/60 border border-stm-border/40">
          <button
            onClick={() => navigate("/npd")}
            className="text-xs font-medium px-3 py-1 rounded-md text-stm-fg/60 hover:text-stm-fg transition-colors"
          >
            NPD проекты
          </button>
          <button
            className="text-xs font-medium px-3 py-1 rounded-md bg-stm-accent/20 text-stm-accent shadow-sm"
            aria-pressed
          >
            СТМ Mission Control
          </button>
        </div>
      </div>

      {/* Top control bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-stm-border/40 bg-stm-card/60 backdrop-blur-xl">
        <div className="flex items-center gap-2 min-w-0">
          <LayoutGrid className="h-5 w-5 text-stm-accent" />
          <h1 className="text-lg font-semibold text-stm-fg whitespace-nowrap">STM Mission Control</h1>
          <span className="text-xs text-stm-fg/50 ml-2">{visible.length} SKU · {totalProgress}% средний прогресс {overdueCount > 0 && (
            <span className="text-stm-danger ml-1">· ⚠ {overdueCount} просрочено</span>
          )}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stm-fg/40" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск SKU, сеть, бренд..."
              className="h-8 pl-8 w-56 bg-stm-glass/40 border-stm-border/40 text-stm-fg placeholder:text-stm-fg/40"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-stm-fg/60">
            <Filter className="h-3.5 w-3.5" />
            <select
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as any)}
              className="bg-stm-glass/40 border border-stm-border/40 rounded h-8 px-2 text-xs text-stm-fg"
            >
              <option value="none">Без группировки</option>
              <option value="retailer">По сети</option>
              <option value="brand">По бренду</option>
              <option value="drop">По дропу</option>
            </select>
          </div>

          <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-stm-accent text-stm-bg hover:bg-stm-accent/90 h-8">
            <Plus className="h-3.5 w-3.5 mr-1" /> SKU
          </Button>
        </div>
      </div>

      {/* Flow tabs */}
      <div className="px-4 py-2 border-b border-stm-border/30 bg-stm-card/40">
        <Tabs value={flow} onValueChange={(v) => setFlow(v as StmFlow)}>
          <TabsList className="bg-stm-glass/40 border border-stm-border/30">
            <TabsTrigger value="in" className="data-[state=active]:bg-stm-accent/20 data-[state=active]:text-stm-accent">
              Ввод SKU <span className="ml-1.5 text-[10px] opacity-60">{projects.filter(p => p.flow === "in").length}</span>
            </TabsTrigger>
            <TabsTrigger value="out" className="data-[state=active]:bg-stm-warn/20 data-[state=active]:text-stm-warn">
              Вывод SKU <span className="ml-1.5 text-[10px] opacity-60">{projects.filter(p => p.flow === "out").length}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Matrix scroll area */}
      <div className="flex-1 overflow-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-stm-fg/50 gap-3 py-16">
            <LayoutGrid className="h-10 w-10 opacity-40" />
            <div className="text-sm">Нет SKU в потоке «{flow === "in" ? "Ввод" : "Вывод"}»</div>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} className="border-stm-accent/40 text-stm-accent hover:bg-stm-accent/10">
              <Plus className="h-3.5 w-3.5 mr-1" /> Создать первый SKU
            </Button>
          </div>
        ) : (
          <div className="min-w-fit">
            <StmMatrixHeader stages={stages} />
            {grouped.map(g => (
              <div key={g.key}>
                {g.label && (
                  <div className="sticky left-0 z-[1] px-4 py-1.5 bg-stm-glass/60 backdrop-blur-md border-b border-stm-border/30">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-stm-fg/60 font-semibold">{g.label}</span>
                    <span className="ml-2 text-[10px] text-stm-fg/40">{g.items.length}</span>
                  </div>
                )}
                {g.items.map(p => (
                  <StmMatrixRow
                    key={p.group.id}
                    project={p}
                    stages={stages}
                    onOpenSku={(id) => navigate(`/pmo/project/${id}`)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <StmCreateSkuDialog open={createOpen} onOpenChange={setCreateOpen} defaultFlow={flow} />
    </div>
  );
}
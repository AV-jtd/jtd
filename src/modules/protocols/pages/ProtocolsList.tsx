import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTaskGroups, useTasks, useTaskMutations } from "@/hooks/useTasks";
import { Plus, Search, FileText, CheckCircle2, AlertTriangle, Clock, Archive, FileEdit, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isPast, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import NewProtocolDialog from "@/modules/protocols/components/NewProtocolDialog";
import UnifiedImportDialog from "@/modules/protocols/components/UnifiedImportDialog";
import { Sparkles } from "lucide-react";
import ConfirmDelete from "@/components/ConfirmDelete";
import { toast } from "sonner";
import { usePrefetchOnHover } from "@/hooks/usePrefetchOnHover";
import ProtocolsAnalyticsBlock, { ProtocolStatFilter } from "@/modules/protocols/components/ProtocolsAnalyticsBlock";
import { useProtocolsAxes } from "@/modules/protocols/hooks/useProtocolsAnalytics";

type StatusFilter = "all" | "active" | "archived";

export default function ProtocolsList() {
  const navigate = useNavigate();
  const { data: groups = [], isLoading: groupsLoading } = useTaskGroups();
  const { data: tasks = [] } = useTasks();
  const { deleteGroup } = useTaskMutations();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [statFilter, setStatFilter] = useState<ProtocolStatFilter>("none");
  const [axisTagId, setAxisTagId] = useState<string | null>(null);
  const [axisProtocolIds, setAxisProtocolIds] = useState<string[]>([]);

  const protocols = useMemo(
    () => groups.filter((g) => g.project_type === "protocol"),
    [groups],
  );

  const tasksByProtocol = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const t of tasks) {
      if (!t.group_id) continue;
      if (!map.has(t.group_id)) map.set(t.group_id, []);
      map.get(t.group_id)!.push(t);
    }
    return map;
  }, [tasks]);

  const enriched = useMemo(() => {
    return protocols.map((p) => {
      const ts = tasksByProtocol.get(p.id) ?? [];
      const total = ts.length;
      const completed = ts.filter((t) => t.is_completed).length;
      const overdue = ts.filter(
        (t) => !t.is_completed && t.deadline && isPast(parseISO(t.deadline)),
      ).length;
      const unassigned = ts.filter((t) => !t.is_completed && !t.assigned_to).length;
      const undated = ts.filter((t) => !t.is_completed && !t.deadline).length;
      const active = total - completed;
      const isArchived = !!p.closed_at;
      const isDraft = (p as any).draft_status === "draft";
      const draftCount = ts.filter((t) => (t as any).is_draft).length;
      return { group: p, total, completed, overdue, unassigned, undated, active, isArchived, isDraft, draftCount };
    });
  }, [protocols, tasksByProtocol]);

  // Применяем сначала status + search → "видимые в портфеле" протоколы (для аналитики).
  const visibleByStatus = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((e) => {
      if (statusFilter === "active" && e.isArchived) return false;
      if (statusFilter === "archived" && !e.isArchived) return false;
      if (q && !e.group.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, search, statusFilter]);

  // Затем — метрики и срез по осям применяются уже к этому подмножеству.
  const filtered = useMemo(() => {
    const axisSet = axisTagId ? new Set(axisProtocolIds) : null;
    return visibleByStatus.filter((e) => {
      if (axisSet && !axisSet.has(e.group.id)) return false;
      switch (statFilter) {
        case "overdue": return e.overdue > 0;
        case "unassigned": return e.unassigned > 0;
        case "undated": return e.undated > 0;
        default: return true;
      }
    });
  }, [visibleByStatus, axisTagId, axisProtocolIds, statFilter]);

  const visibleProtocolIds = useMemo(() => visibleByStatus.map((e) => e.group.id), [visibleByStatus]);

  const portfolioMetrics = useMemo(() => {
    return visibleByStatus.reduce(
      (acc, e) => {
        acc.total += e.total;
        acc.active += e.active;
        acc.completed += e.completed;
        acc.overdue += e.overdue;
        acc.unassigned += e.unassigned;
        acc.undated += e.undated;
        return acc;
      },
      { total: 0, active: 0, completed: 0, overdue: 0, unassigned: 0, undated: 0 },
    );
  }, [visibleByStatus]);

  // Для AI Risk Radar: берём имена осей из useProtocolsAxes (общий запрос уже кэширован)
  const { data: axesForRadar = [] } = useProtocolsAxes({ protocolIds: visibleProtocolIds });
  const axesByProtocol = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of axesForRadar) {
      for (const c of g.chips) {
        for (const pid of c.protocolIds) {
          if (!map.has(pid)) map.set(pid, []);
          map.get(pid)!.push(`${g.label}: ${c.tagName}`);
        }
      }
    }
    return map;
  }, [axesForRadar]);

  const riskRadarPayload = useMemo(
    () =>
      visibleByStatus.map((e) => ({
        name: e.group.name,
        is_draft: e.isDraft,
        created_at: e.group.created_at,
        total_tasks: e.total,
        completed_tasks: e.completed,
        overdue_tasks: e.overdue,
        unassigned_tasks: e.unassigned,
        undated_tasks: e.undated,
        axes: axesByProtocol.get(e.group.id) ?? [],
      })),
    [visibleByStatus, axesByProtocol],
  );

  const totals = useMemo(() => {
    const all = enriched.length;
    const archived = enriched.filter((e) => e.isArchived).length;
    return { all, active: all - archived, archived };
  }, [enriched]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <FileText className="h-6 w-6 text-primary" />
            Протоколы совещаний
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Каждый протокол — это проект. Строки протокола — задачи с ответственными и сроками.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setImportOpen(true)}
            title="Импорт из Excel, PDF или текста — ИИ автоматически распознает структуру"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:border-primary/40"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            Импорт
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Новый протокол
          </button>
        </div>
      </div>

      <NewProtocolDialog open={createOpen} onOpenChange={setCreateOpen} />
      <UnifiedImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Status tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-border">
        {([
          { key: "active" as const, label: "Действующие", count: totals.active },
          { key: "archived" as const, label: "Архив", count: totals.archived, icon: Archive },
          { key: "all" as const, label: "Все", count: totals.all },
        ]).map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs",
                  active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию протокола..."
          className="pl-9"
        />
      </div>

      {/* Аналитика портфеля */}
      {visibleProtocolIds.length > 0 && (
        <ProtocolsAnalyticsBlock
          visibleProtocolIds={visibleProtocolIds}
          metrics={portfolioMetrics}
          statFilter={statFilter}
          onStatFilterChange={setStatFilter}
          axisTagId={axisTagId}
          onAxisTagChange={(tagId, ids) => {
            setAxisTagId(tagId);
            setAxisProtocolIds(ids);
          }}
          riskRadarPayload={riskRadarPayload}
        />
      )}

      {/* List */}
      {groupsLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <EmptyState hasAny={protocols.length > 0} />
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <ProtocolRow
              key={p.group.id}
              data={p}
              onOpen={() => navigate(`/protocols/${p.group.id}`)}
              onDelete={() => {
                deleteGroup.mutate(p.group.id, {
                  onSuccess: () => toast.success(`Протокол «${p.group.name}» удалён`),
                  onError: (e: any) => toast.error(e?.message ?? "Не удалось удалить протокол"),
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProtocolRow({
  data,
  onOpen,
  onDelete,
}: {
  data: {
    group: ReturnType<typeof useTaskGroups>["data"] extends (infer T)[] | undefined ? T : never;
    total: number;
    completed: number;
    overdue: number;
    active: number;
    isArchived: boolean;
    isDraft: boolean;
    draftCount: number;
  };
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { group, total, completed, overdue, active, isArchived, isDraft, draftCount } = data;
  const created = format(parseISO(group.created_at), "d MMMM yyyy", { locale: ru });
  const { prefetchTasks, cancelPrefetch } = usePrefetchOnHover();

  return (
    <div
      className={cn(
        "group flex w-full items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 text-left transition-all hover:border-primary/40 hover:shadow-sm",
        isDraft && "border-amber-400/50 bg-amber-50/30 dark:border-amber-500/40 dark:bg-amber-950/20",
        isArchived && "opacity-60",
      )}
      onMouseEnter={() => prefetchTasks(group.id)}
      onMouseLeave={() => cancelPrefetch(group.id)}
    >
     <button
       onClick={onOpen}
       onFocus={() => prefetchTasks(group.id)}
       className="flex flex-1 items-center gap-4 text-left min-w-0"
     >
      {group.logo_url ? (
        <img
          src={group.logo_url}
          alt={group.name}
          className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-border"
        />
      ) : (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-lg"
          style={{ backgroundColor: `${group.color ?? "#3b82f6"}20`, color: group.color ?? "#3b82f6" }}
        >
          {group.icon && group.icon !== "list" ? group.icon : "📋"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{group.name}</span>
          {isDraft && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
              <FileEdit className="h-3 w-3" />
              Черновик{draftCount > 0 ? ` · ${draftCount}` : ""}
            </span>
          )}
          {isArchived && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              Архив
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{created}</div>
      </div>

      {/* Metrics */}
      <div className="flex items-center gap-3 text-xs">
        <Metric icon={Clock} value={active} label="в работе" tone="default" />
        <Metric icon={CheckCircle2} value={completed} label="закрыто" tone="success" />
        {overdue > 0 && (
          <Metric icon={AlertTriangle} value={overdue} label="просрочено" tone="danger" />
        )}
        <span className="hidden text-muted-foreground md:inline">всего {total}</span>
      </div>
     </button>
      <ConfirmDelete
        title={`Удалить протокол «${group.name}»?`}
        description="Все задачи и связанные данные протокола будут удалены безвозвратно."
        onConfirm={onDelete}
      >
        <button
          onClick={(e) => e.stopPropagation()}
          className="ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          title="Удалить протокол"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </ConfirmDelete>
    </div>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
  tone: "default" | "success" | "danger";
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-md px-1.5 py-1",
        tone === "success" && "text-emerald-600 dark:text-emerald-400",
        tone === "danger" && "text-destructive",
        tone === "default" && "text-muted-foreground",
      )}
      title={`${value} ${label}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="font-medium tabular-nums">{value}</span>
    </span>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-16 text-center">
      <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
      <h3 className="text-sm font-medium text-foreground">
        {hasAny ? "Ничего не найдено" : "Пока нет протоколов"}
      </h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
        {hasAny
          ? "Попробуйте изменить фильтры или поисковый запрос."
          : "Создайте первый протокол совещания. Шаблоны и Table View появятся на следующих этапах."}
      </p>
    </div>
  );
}

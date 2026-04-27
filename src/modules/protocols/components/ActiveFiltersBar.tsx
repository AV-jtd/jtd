import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AxisGroup } from "@/modules/protocols/hooks/useProtocolsAnalytics";
import type { ProtocolStatFilter } from "./ProtocolsAnalyticsBlock";

type StatusFilter = "all" | "active" | "archived";

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: "Все",
  active: "Действующие",
  archived: "Архив",
};

const STAT_LABEL: Record<Exclude<ProtocolStatFilter, "none">, string> = {
  overdue: "Просрочено",
  unassigned: "Без ответственного",
  undated: "Без срока",
};

interface Props {
  search: string;
  onClearSearch: () => void;
  statusFilter: StatusFilter;
  onResetStatus: () => void; // вернуть к "active"
  statFilter: ProtocolStatFilter;
  onClearStat: () => void;
  axisTagIds: string[];
  axes: AxisGroup[];
  onRemoveAxis: (tagId: string) => void;
  onResetAll: () => void;
}

export default function ActiveFiltersBar({
  search,
  onClearSearch,
  statusFilter,
  onResetStatus,
  statFilter,
  onClearStat,
  axisTagIds,
  axes,
  onRemoveAxis,
  onResetAll,
}: Props) {
  const hasSearch = search.trim().length > 0;
  const hasStatus = statusFilter !== "active";
  const hasStat = statFilter !== "none";
  const hasAxis = axisTagIds.length > 0;
  const total = (hasSearch ? 1 : 0) + (hasStatus ? 1 : 0) + (hasStat ? 1 : 0) + axisTagIds.length;
  if (total === 0) return null;

  // Map axis tagId → { label, name }
  const tagMap = new Map<string, { axisLabel: string; tagName: string }>();
  for (const g of axes) {
    for (const c of g.chips) {
      tagMap.set(c.tagId, { axisLabel: g.label, tagName: c.tagName });
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Фильтры
      </span>

      {hasSearch && (
        <Chip onRemove={onClearSearch} title="Очистить поиск">
          <span className="text-muted-foreground">Поиск:</span>
          <span className="font-medium">«{search.trim()}»</span>
        </Chip>
      )}

      {hasStatus && (
        <Chip onRemove={onResetStatus} title="Вернуть к «Действующие»">
          <span className="text-muted-foreground">Статус:</span>
          <span className="font-medium">{STATUS_LABEL[statusFilter]}</span>
        </Chip>
      )}

      {hasStat && (
        <Chip onRemove={onClearStat} title="Снять метрику-фильтр" tone="warning">
          {STAT_LABEL[statFilter as Exclude<ProtocolStatFilter, "none">]}
        </Chip>
      )}

      {axisTagIds.map((tid) => {
        const meta = tagMap.get(tid);
        return (
          <Chip key={tid} onRemove={() => onRemoveAxis(tid)} title="Снять ось" tone="primary">
            {meta ? (
              <>
                <span className="opacity-80">{meta.axisLabel}:</span>
                <span className="font-medium">{meta.tagName}</span>
              </>
            ) : (
              <span className="font-medium">…</span>
            )}
          </Chip>
        );
      })}

      <button
        type="button"
        onClick={onResetAll}
        className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-background hover:text-foreground"
      >
        Сбросить всё ({total})
      </button>
    </div>
  );
}

function Chip({
  children,
  onRemove,
  title,
  tone = "default",
}: {
  children: React.ReactNode;
  onRemove: () => void;
  title?: string;
  tone?: "default" | "primary" | "warning";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
        tone === "default" && "border-border bg-background text-foreground",
        tone === "primary" && "border-primary/30 bg-primary/10 text-primary",
        tone === "warning" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      {children}
      <button
        type="button"
        onClick={onRemove}
        title={title}
        className={cn(
          "ml-0.5 rounded p-0.5 hover:bg-foreground/10",
          tone === "primary" && "hover:bg-primary/20",
          tone === "warning" && "hover:bg-amber-500/20",
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

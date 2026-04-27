import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ListChecks, AlertTriangle, UserX, CalendarOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProtocolsAxes, AxisGroup } from "@/modules/protocols/hooks/useProtocolsAnalytics";
import ProtocolsRiskRadar from "./ProtocolsRiskRadar";

export type ProtocolStatFilter = "none" | "overdue" | "unassigned" | "undated";

export interface ProtocolMetrics {
  total: number;
  active: number;
  completed: number;
  overdue: number;
  unassigned: number;
  undated: number;
}

interface Props {
  /** Видимые в текущем разрезе протоколы (после tab active/archived/all + поиск) */
  visibleProtocolIds: string[];
  metrics: ProtocolMetrics;
  /** Выбранная метрика-фильтр */
  statFilter: ProtocolStatFilter;
  onStatFilterChange: (f: ProtocolStatFilter) => void;
  /** Выбранные теги-оси. Логика: OR внутри одной axis-категории, AND между категориями. */
  axisTagIds: string[];
  onAxisTagsChange: (tagIds: string[]) => void;
  /** Данные для AI Risk Radar (передаются из родителя — он уже знает enriched-данные) */
  riskRadarPayload: {
    name: string;
    is_draft: boolean;
    created_at: string;
    total_tasks: number;
    completed_tasks: number;
    overdue_tasks: number;
    unassigned_tasks: number;
    undated_tasks: number;
    axes: string[];
  }[];
}

const METRIC_CONFIG: Array<{
  key: ProtocolStatFilter;
  label: string;
  field: keyof ProtocolMetrics;
  icon: any;
  tone: "default" | "danger" | "warning";
}> = [
  { key: "none", label: "Всего", field: "total", icon: ListChecks, tone: "default" },
  { key: "overdue", label: "Просрочено", field: "overdue", icon: AlertTriangle, tone: "danger" },
  { key: "unassigned", label: "Без ответственного", field: "unassigned", icon: UserX, tone: "warning" },
  { key: "undated", label: "Без срока", field: "undated", icon: CalendarOff, tone: "warning" },
];

export default function ProtocolsAnalyticsBlock({
  visibleProtocolIds,
  metrics,
  statFilter,
  onStatFilterChange,
  axisTagIds,
  onAxisTagsChange,
  riskRadarPayload,
}: Props) {
  const [open, setOpen] = useState(true);
  const { data: axes = [], isLoading } = useProtocolsAxes({ protocolIds: visibleProtocolIds });

  const activeChips = useMemo(() => {
    if (!axisTagIds.length) return [];
    const set = new Set(axisTagIds);
    const out: Array<{ axis: AxisGroup; chip: AxisGroup["chips"][number] }> = [];
    for (const g of axes) {
      for (const c of g.chips) {
        if (set.has(c.tagId)) out.push({ axis: g, chip: c });
      }
    }
    return out;
  }, [axes, axisTagIds]);

  const toggleTag = (tagId: string) => {
    const set = new Set(axisTagIds);
    if (set.has(tagId)) set.delete(tagId);
    else set.add(tagId);
    onAxisTagsChange(Array.from(set));
  };

  return (
    <div className="mb-4 rounded-lg border border-border bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Аналитика портфеля
          </span>
          <span className="text-[11px] text-muted-foreground/70">
            {visibleProtocolIds.length} протокол{plural(visibleProtocolIds.length)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {activeChips.map(({ axis, chip }) => (
            <span
              key={chip.tagId}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
            >
              {axis.label}: {chip.tagName}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTag(chip.tagId);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleTag(chip.tagId);
                  }
                }}
                className="ml-0.5 rounded p-0.5 hover:bg-primary/20 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </span>
            </span>
          ))}
          {activeChips.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAxisTagsChange([]);
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground underline"
            >
              сбросить
            </button>
          )}
          {statFilter !== "none" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
              {METRIC_CONFIG.find((m) => m.key === statFilter)?.label}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatFilterChange("none");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onStatFilterChange("none");
                  }
                }}
                className="ml-0.5 rounded p-0.5 hover:bg-amber-500/20 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </span>
            </span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          {/* Метрики-смарт-фильтры */}
          <div className="flex flex-wrap gap-2">
            {METRIC_CONFIG.map((m) => {
              const value = metrics[m.field];
              const active = statFilter === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => onStatFilterChange(active ? "none" : m.key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background hover:border-primary/40 hover:bg-muted",
                    m.tone === "danger" && !active && value > 0 && "text-destructive",
                    m.tone === "warning" && !active && value > 0 && "text-amber-700 dark:text-amber-300",
                    m.tone === "default" && !active && "text-muted-foreground",
                  )}
                  title={m.key === "none" ? "Все вопросы во всех видимых протоколах" : `Показать протоколы, в которых есть «${m.label.toLowerCase()}»`}
                >
                  <m.icon className="h-3.5 w-3.5" />
                  <span className="font-medium tabular-nums">{value}</span>
                  <span className="text-[11px] opacity-80">{m.label}</span>
                </button>
              );
            })}

            <div className="ml-auto">
              <ProtocolsRiskRadar protocols={riskRadarPayload} />
            </div>
          </div>

          {/* Срез по осям */}
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Загрузка осей…</div>
          ) : axes.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              Контекст ещё не назначен. Откройте протокол и добавьте теги клиента, бренда, площадки или темы — здесь появится срез.
            </div>
          ) : (
            <div className="space-y-2">
              {axes.map((g) => (
                <AxisRow
                  key={g.key}
                  group={g}
                  activeTagIds={axisTagIds}
                  onPick={(chip) => toggleTag(chip.tagId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AxisRow({
  group,
  activeTagIds,
  onPick,
}: {
  group: AxisGroup;
  activeTagIds: string[];
  onPick: (chip: AxisGroup["chips"][number]) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const VISIBLE = 12;
  const visible = showAll ? group.chips : group.chips.slice(0, VISIBLE);
  const hidden = group.chips.length - visible.length;
  const activeSet = useMemo(() => new Set(activeTagIds), [activeTagIds]);

  return (
    <div className="flex items-start gap-3">
      <div className="w-24 shrink-0 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {group.label}
      </div>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {visible.map((c) => {
          const active = activeSet.has(c.tagId);
          return (
            <button
              key={c.tagId}
              type="button"
              onClick={() => onPick(c)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted",
              )}
              title={`${c.tagName} — ${c.taskCount} вопрос${plural(c.taskCount)} в ${c.protocolIds.length} протокол${plural(c.protocolIds.length)}`}
            >
              <span className="truncate max-w-[180px]">{c.tagName}</span>
              <span className={cn("tabular-nums opacity-70", active && "opacity-90")}>{c.taskCount}</span>
            </button>
          );
        })}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            +{hidden}
          </button>
        )}
      </div>
    </div>
  );
}

function plural(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "а";
  return "ов";
}

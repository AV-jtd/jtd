import { memo, useState } from "react";
import { DailyInsights, InsightItem } from "@/hooks/useAiInsights";
import {
  Sparkles, RefreshCw, X, Loader2, TrendingUp, AlertTriangle, CheckCircle2, Target,
  ChevronDown, Filter, User, ArrowUpRight, ArrowDownLeft, Clock, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

/** Stat chip keys for navigation */
export type StatChipKey = "responsible" | "delegated_by_me" | "delegated_to_me" | "overdue" | "drift" | "completed";

export interface TaskRoleStats {
  responsible: number;
  delegatedByMe: number;
  delegatedToMe: number;
  overdue: number;
  drift: number;
  completed: number;
}

/** Smart filter descriptor derived from an insight item */
export interface InsightSmartFilter {
  taskId?: string;
  groupId?: string;
  /** Hint for the kind of filter to apply */
  hint?: "overdue" | "no_deadline" | "no_assignee" | "steps" | "stale" | "drift" | "blocked" | "person";
  /** Person id for person-based filters */
  personId?: string;
}

interface AiInsightsCardProps {
  insights: DailyInsights | null;
  loading: boolean;
  error: string | null;
  dismissed: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
  onNavigateToTask?: (taskId: string) => void;
  onNavigateToProject?: (groupId: string) => void;
  /** Called when user clicks a smart-filter action on an insight */
  onSmartFilter?: (filter: InsightSmartFilter) => void;
  /** Clickable stat chip counts computed from real tasks */
  roleStats?: TaskRoleStats;
  /** Called when user clicks a stat chip */
  onStatClick?: (key: StatChipKey) => void;
  /** Currently active stat filter key */
  activeStatFilter?: StatChipKey | null;
  /** Show only stat chips without AI greeting/insights (e.g. in project view) */
  compactMode?: boolean;
  /** Project name shown in compact mode header */
  compactLabel?: string;
  /** User display name for simplified greeting */
  userName?: string;
  /** Optional one-liner about stuck protocol tasks (shown in expanded section if stuck > 0) */
  protocolsLine?: {
    stuck: number;
    topAxisLabel?: string;
    topTagName?: string;
    onOpen?: () => void;
  } | null;
}

function getSmartFilterLabel(hint?: string, taskId?: string, groupId?: string) {
  if (hint === "overdue") return "Просрочено ↓";
  if (hint === "no_deadline") return "Без срока ↓";
  if (hint === "no_assignee") return "Без ответственного ↓";
  if (hint === "steps") return "Шаги ↓";
  if (hint === "stale") return "Застывшие ↓";
  if (hint === "drift") return "Дрифт ↓";
  if (hint === "blocked") return "Блокеры ↓";
  if (groupId || taskId) return "Показать ↓";
  return "Открыть";
}

function InsightLinkAction({
  label,
  onClick,
  compact = false,
}: {
  label: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/15 bg-primary/10 font-medium text-primary transition-colors hover:bg-primary/15",
        compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1 text-[11px]"
      )}
    >
      <span>{label}</span>
      <Filter className="h-3 w-3" />
    </button>
  );
}

interface StatChipDef {
  key: StatChipKey;
  icon: React.ElementType;
  label: string;
  color: string;
  activeColor: string;
  getValue: (s: TaskRoleStats) => number;
  showZero?: boolean;
}

const STAT_CHIPS: StatChipDef[] = [
  { key: "responsible", icon: User, label: "Ответственный", color: "text-primary", activeColor: "bg-primary/10 border-primary/25 hover:bg-primary/15", getValue: s => s.responsible, showZero: true },
  { key: "delegated_by_me", icon: ArrowUpRight, label: "Поручил", color: "text-blue-500 dark:text-blue-400", activeColor: "bg-blue-500/10 border-blue-500/25 hover:bg-blue-500/15", getValue: s => s.delegatedByMe },
  { key: "delegated_to_me", icon: ArrowDownLeft, label: "Поручено мне", color: "text-violet-500 dark:text-violet-400", activeColor: "bg-violet-500/10 border-violet-500/25 hover:bg-violet-500/15", getValue: s => s.delegatedToMe },
  { key: "overdue", icon: AlertTriangle, label: "Просрочено", color: "text-destructive", activeColor: "bg-destructive/10 border-destructive/25 hover:bg-destructive/15", getValue: s => s.overdue },
  { key: "drift", icon: TrendingUp, label: "Дрифт", color: "text-amber-500 dark:text-amber-400", activeColor: "bg-amber-500/10 border-amber-500/25 hover:bg-amber-500/15", getValue: s => s.drift },
  { key: "completed", icon: CheckCircle2, label: "Выполнено", color: "text-emerald-500 dark:text-emerald-400", activeColor: "bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/15", getValue: s => s.completed },
];

function StatChipRow({ stats, onStatClick, activeKey }: { stats: TaskRoleStats; onStatClick?: (key: StatChipKey) => void; activeKey?: StatChipKey | null }) {
  return (
    <div className="-mx-1 overflow-x-auto scrollbar-none">
      <div className="flex items-center gap-1 sm:gap-1.5 pb-0.5 px-1">
        {STAT_CHIPS.map(chip => {
          const value = chip.getValue(stats);
          if (value === 0 && !chip.showZero) return null;
          const Icon = chip.icon;
          const isActive = activeKey === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStatClick?.(chip.key);
              }}
              className={cn(
                "inline-flex items-center gap-0.5 sm:gap-1 rounded-full border px-1.5 sm:px-2 py-1 text-[11px] font-medium transition-all whitespace-nowrap",
                "cursor-pointer active:scale-95",
                isActive
                  ? cn(chip.activeColor, "ring-1 ring-offset-1 ring-primary/30")
                  : chip.activeColor,
              )}
              title={chip.label}
            >
              <Icon className={cn("h-3 w-3 shrink-0", chip.color)} />
              <span className={cn("tabular-nums font-semibold", chip.color)}>{value}</span>
              <span className="text-muted-foreground text-[10px] hidden sm:inline">{chip.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Extract first name from "Имя Фамилия" */
function smartName(fullName?: string): string | undefined {
  if (!fullName) return undefined;
  const first = fullName.trim().split(/\s+/)[0];
  return first || fullName;
}

function AiInsightsCardInner({
  insights, loading, error, dismissed, onRefresh, onDismiss,
  onNavigateToTask, onNavigateToProject, onSmartFilter, roleStats, onStatClick, activeStatFilter, compactMode, compactLabel, userName,
}: AiInsightsCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Compact mode: only show stat chips row
  if (compactMode && roleStats) {
    return (
      <div className="mx-3 mt-3 rounded-xl border border-border/50 bg-muted/30 overflow-hidden px-2 py-2 space-y-1">
        {compactLabel && (
          <div className="flex items-center gap-1.5 px-1">
            <BarChart3 className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground truncate">{compactLabel}</span>
          </div>
        )}
        <StatChipRow stats={roleStats} onStatClick={onStatClick} activeKey={activeStatFilter} />
      </div>
    );
  }

  if (dismissed) return null;

  if (loading && !insights) {
    return (
      <div className="mx-3 mt-3 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 via-background to-accent/5 overflow-hidden">
        <div className="w-full flex flex-col gap-2 px-4 py-3.5">
          <div className="flex items-start gap-2 w-full">
            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4 bg-primary/10" />
              <Skeleton className="h-3.5 w-1/2 bg-primary/10" />
            </div>
          </div>
          <div className="flex items-center gap-2 pl-6 flex-wrap">
            {[1,2,3,4].map(i => (
              <Skeleton key={i} className="h-6 w-20 rounded-full bg-primary/8" />
            ))}
          </div>
          <div className="flex items-start gap-2 pl-6">
            <Target className="h-3.5 w-3.5 text-primary/30 shrink-0 mt-0.5" />
            <Skeleton className="h-3.5 w-4/5 bg-primary/8" />
          </div>
          <p className="text-[11px] text-muted-foreground pl-6 flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            ИИ анализирует ваши задачи...
          </p>
        </div>
      </div>
    );
  }

  if (error || !insights) return null;

  const hasFocusLink = Boolean(insights.focusTaskId || insights.focusGroupId);
  const navigateToFocus = () => {
    if (onSmartFilter) {
      onSmartFilter({ taskId: insights.focusTaskId, groupId: insights.focusGroupId });
    } else if (insights.focusTaskId && onNavigateToTask) onNavigateToTask(insights.focusTaskId);
    else if (insights.focusGroupId && onNavigateToProject) onNavigateToProject(insights.focusGroupId);
  };

  return (
    <div className="mx-3 mt-3 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 via-background to-accent/5 overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="w-full flex flex-col gap-2 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex items-start gap-2 w-full">
          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-foreground leading-snug flex-1">
            Привет, {smartName(userName) || "👋"}
          </p>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRefresh(); }}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Обновить"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Скрыть"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <ChevronDown className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180"
            )} />
          </div>
        </div>

        {/* Interactive stat chips */}
        {roleStats && (
          <StatChipRow stats={roleStats} onStatClick={onStatClick} activeKey={activeStatFilter} />
        )}

        <div className="flex items-start gap-2 pl-6 min-w-0">
          <Target className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <span className="text-xs line-clamp-2 text-foreground/70 flex-1 leading-relaxed min-w-0">
            {insights.focusOfDay}
          </span>
          {hasFocusLink && (
            <InsightLinkAction
              compact
              label={getSmartFilterLabel(undefined, insights.focusTaskId, insights.focusGroupId)}
              onClick={navigateToFocus}
            />
          )}
        </div>
      </div>

      <div className={cn(
        "grid transition-all duration-200 ease-in-out",
        expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}>
        <div className="overflow-hidden border-t border-border/50">
          {insights.urgentItems.length > 0 && (
            <div className="px-3 pt-2 pb-1 space-y-1.5">
              {insights.urgentItems.map((item, i) => (
                <InsightRow
                  key={i}
                  item={item}
                  onSmartFilter={onSmartFilter}
                  onNavigateToTask={onNavigateToTask}
                  onNavigateToProject={onNavigateToProject}
                />
              ))}
            </div>
          )}

          <div className="mx-3 my-1.5 px-2.5 py-2 rounded-lg bg-primary/8 border border-primary/10">
            <div className="flex items-center gap-1.5">
              <Target className="h-3 w-3 text-primary shrink-0" />
              <span className="text-[11px] font-medium text-primary">Фокус дня</span>
              {hasFocusLink && (
                <div className="ml-auto">
                  <InsightLinkAction
                    label={getSmartFilterLabel(undefined, insights.focusTaskId, insights.focusGroupId)}
                    onClick={navigateToFocus}
                  />
                </div>
              )}
            </div>
            <p className="text-xs text-foreground/70 mt-1 leading-relaxed">{insights.focusOfDay}</p>
          </div>

          {insights.tips && insights.tips.length > 0 && (
            <div className="px-3 py-1 space-y-0.5">
              {insights.tips.map((tip, i) => (
                <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">💡 {tip}</p>
              ))}
            </div>
          )}

          <div className="px-3 pb-2.5 pt-1">
            <p className="text-[11px] text-muted-foreground/70 italic">{insights.motivation}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InsightRow({ item, onSmartFilter, onNavigateToTask, onNavigateToProject }: {
  item: InsightItem;
  onSmartFilter?: (filter: InsightSmartFilter) => void;
  onNavigateToTask?: (id: string) => void;
  onNavigateToProject?: (id: string) => void;
}) {
  const hasLink = Boolean(item.task_id || item.group_id || item.hint);
  const handleAction = () => {
    if (onSmartFilter) {
      onSmartFilter({ taskId: item.task_id, groupId: item.group_id, hint: item.hint });
    } else if (item.task_id && onNavigateToTask) onNavigateToTask(item.task_id);
    else if (item.group_id && onNavigateToProject) onNavigateToProject(item.group_id);
  };

  return (
    <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/20 transition-colors">
      <span className="shrink-0 mt-0.5">{item.emoji}</span>
      <p className="text-xs leading-relaxed flex-1 text-foreground/80 min-w-0">{item.text}</p>
      {hasLink && (
        <InsightLinkAction
          compact
          label={getSmartFilterLabel(item.hint, item.task_id, item.group_id)}
          onClick={handleAction}
        />
      )}
    </div>
  );
}

const AiInsightsCard = memo(AiInsightsCardInner);
export default AiInsightsCard;

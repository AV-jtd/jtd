import { memo, useState } from "react";
import { DailyInsights, InsightItem } from "@/hooks/useAiInsights";
import {
  Sparkles, RefreshCw, X, Loader2, TrendingUp, AlertTriangle, CheckCircle2, Target,
  ChevronDown, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface AiInsightsCardProps {
  insights: DailyInsights | null;
  loading: boolean;
  error: string | null;
  dismissed: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
  onNavigateToTask?: (taskId: string) => void;
  onNavigateToProject?: (groupId: string) => void;
}

function getNavigationLabel(taskId?: string, groupId?: string) {
  if (taskId) return "К задаче";
  if (groupId) return "К проекту";
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
      <ExternalLink className="h-3 w-3" />
    </button>
  );
}

function AiInsightsCardInner({
  insights, loading, error, dismissed, onRefresh, onDismiss,
  onNavigateToTask, onNavigateToProject,
}: AiInsightsCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (dismissed) return null;

  if (loading && !insights) {
    return (
      <div className="mx-3 mt-3 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4 bg-primary/10" />
            <Skeleton className="h-4 w-1/2 bg-primary/10" />
          </div>
        </div>
        <div className="flex items-center gap-4 pl-6">
          <Skeleton className="h-4 w-14 rounded-full bg-primary/8" />
          <Skeleton className="h-4 w-14 rounded-full bg-primary/8" />
          <Skeleton className="h-4 w-14 rounded-full bg-primary/8" />
        </div>
        <div className="flex items-center gap-2 pl-6">
          <Skeleton className="h-3.5 w-3.5 rounded-full bg-primary/8" />
          <Skeleton className="h-3.5 w-4/5 bg-primary/8" />
        </div>
        <p className="text-[11px] text-muted-foreground pl-6 flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          ИИ анализирует ваши задачи...
        </p>
      </div>
    );
  }

  if (error || !insights) return null;

  const { stats } = insights;
  const hasFocusLink = Boolean(insights.focusTaskId || insights.focusGroupId);
  const navigateToFocus = () => {
    if (insights.focusTaskId && onNavigateToTask) onNavigateToTask(insights.focusTaskId);
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
            {insights.greeting}
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

        <div className="flex items-center gap-4 pl-6 flex-wrap">
          <StatBadge icon={TrendingUp} label="Активных" value={stats.active} variant="default" />
          {stats.overdue > 0 && (
            <StatBadge icon={AlertTriangle} label="Просрочено" value={stats.overdue} variant="danger" />
          )}
          <StatBadge icon={Target} label="На неделе" value={stats.dueThisWeek} variant="warning" />
          {stats.completedRecently > 0 && (
            <StatBadge icon={CheckCircle2} label="Сделано" value={stats.completedRecently} variant="success" />
          )}
        </div>

        <div className="flex items-start gap-2 pl-6 min-w-0">
          <Target className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <span className="text-xs line-clamp-2 text-foreground/70 flex-1 leading-relaxed min-w-0">
            {insights.focusOfDay}
          </span>
          {hasFocusLink && (
            <InsightLinkAction
              compact
              label={getNavigationLabel(insights.focusTaskId, insights.focusGroupId)}
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
                    label={getNavigationLabel(insights.focusTaskId, insights.focusGroupId)}
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

function InsightRow({ item, onNavigateToTask, onNavigateToProject }: {
  item: InsightItem;
  onNavigateToTask?: (id: string) => void;
  onNavigateToProject?: (id: string) => void;
}) {
  const hasLink = Boolean(item.task_id || item.group_id);
  const handleNavigate = () => {
    if (item.task_id && onNavigateToTask) onNavigateToTask(item.task_id);
    else if (item.group_id && onNavigateToProject) onNavigateToProject(item.group_id);
  };

  return (
    <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/20 transition-colors">
      <span className="shrink-0 mt-0.5">{item.emoji}</span>
      <p className="text-xs leading-relaxed flex-1 text-foreground/80 min-w-0">{item.text}</p>
      {hasLink && (
        <InsightLinkAction
          compact
          label={getNavigationLabel(item.task_id, item.group_id)}
          onClick={handleNavigate}
        />
      )}
    </div>
  );
}

function StatBadge({ icon: Icon, label, value, variant }: {
  icon: React.ElementType;
  label: string;
  value: number;
  variant: "default" | "danger" | "warning" | "success";
}) {
  const colorMap = {
    default: "text-foreground/60",
    danger: "text-destructive",
    warning: "text-amber-500 dark:text-amber-400",
    success: "text-emerald-500 dark:text-emerald-400",
  };

  return (
    <div className="flex items-center gap-1">
      <Icon className={cn("h-3 w-3", colorMap[variant])} />
      <span className={cn("text-xs font-semibold tabular-nums", colorMap[variant])}>{value}</span>
      <span className="text-[10px] text-muted-foreground hidden sm:inline">{label}</span>
    </div>
  );
}

const AiInsightsCard = memo(AiInsightsCardInner);
export default AiInsightsCard;

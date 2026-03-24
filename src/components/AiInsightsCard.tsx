import { memo, useState } from "react";
import { DailyInsights, InsightItem } from "@/hooks/useAiInsights";
import {
  Sparkles, RefreshCw, X, Loader2, TrendingUp, AlertTriangle, CheckCircle2, Target,
  ChevronDown, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

function AiInsightsCardInner({
  insights, loading, error, dismissed, onRefresh, onDismiss,
  onNavigateToTask, onNavigateToProject,
}: AiInsightsCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (dismissed) return null;

  // Loading state
  if (loading && !insights) {
    return (
      <div className="mx-3 mt-3 rounded-xl border border-primary/10 bg-gradient-to-r from-primary/5 to-accent/5 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>ИИ анализирует ваши задачи...</span>
        </div>
      </div>
    );
  }

  // Error or no data — don't show anything
  if (error || !insights) return null;

  const { stats } = insights;

  return (
    <div className="mx-3 mt-3 rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 via-background to-accent/5 overflow-hidden">
      {/* Collapsed header — always visible, taller like a task item */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex flex-col gap-1 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        {/* Top row: icon + greeting + actions */}
        <div className="flex items-center gap-2 w-full">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          <p className="text-[13px] font-medium text-foreground leading-snug flex-1 line-clamp-2">
            {insights.greeting}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onRefresh(); }}
              className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Обновить"
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            </span>
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
              className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Скрыть"
            >
              <X className="h-3 w-3" />
            </span>
            <ChevronDown className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
              expanded && "rotate-180"
            )} />
          </div>
        </div>

        {/* Bottom row: stats badges */}
        <div className="flex items-center gap-3 pl-5">
          <StatBadge icon={TrendingUp} label="Активных" value={stats.active} variant="default" />
          {stats.overdue > 0 && (
            <StatBadge icon={AlertTriangle} label="Просрочено" value={stats.overdue} variant="danger" />
          )}
          <StatBadge icon={Target} label="На неделе" value={stats.dueThisWeek} variant="warning" />
          {stats.completedRecently > 0 && (
            <StatBadge icon={CheckCircle2} label="Сделано" value={stats.completedRecently} variant="success" />
          )}
        </div>
      </button>

      {/* Expandable content */}
      <div className={cn(
        "grid transition-all duration-200 ease-in-out",
        expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      )}>
        <div className="overflow-hidden border-t border-border/50">
          {/* Urgent Items */}
          {insights.urgentItems.length > 0 && (
            <div className="px-3 pt-2 pb-1 space-y-1">
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

          {/* Focus of Day */}
          <div className="mx-3 my-1.5 px-2.5 py-1.5 rounded-lg bg-primary/8 border border-primary/10">
            <div className="flex items-center gap-1.5">
              <Target className="h-3 w-3 text-primary shrink-0" />
              <span className="text-[11px] font-medium text-primary">Фокус дня</span>
              {(insights.focusTaskId || insights.focusGroupId) && (
                <button
                  onClick={() => {
                    if (insights.focusTaskId && onNavigateToTask) onNavigateToTask(insights.focusTaskId);
                    else if (insights.focusGroupId && onNavigateToProject) onNavigateToProject(insights.focusGroupId);
                  }}
                  className="ml-auto p-0.5 rounded hover:bg-primary/10 text-primary/60 hover:text-primary transition-colors"
                  title="Перейти"
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">{insights.focusOfDay}</p>
          </div>

          {/* Tips */}
          {insights.tips && insights.tips.length > 0 && (
            <div className="px-3 py-1 space-y-0.5">
              {insights.tips.map((tip, i) => (
                <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">💡 {tip}</p>
              ))}
            </div>
          )}

          {/* Motivation */}
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
  const hasLink = item.task_id || item.group_id;

  return (
    <div className="flex items-start gap-1.5 text-xs group">
      <span className="shrink-0 mt-0.5">{item.emoji}</span>
      <span className="text-foreground/80 leading-relaxed flex-1">{item.text}</span>
      {hasLink && (
        <button
          onClick={() => {
            if (item.task_id && onNavigateToTask) onNavigateToTask(item.task_id);
            else if (item.group_id && onNavigateToProject) onNavigateToProject(item.group_id);
          }}
          className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
          title={item.task_id ? "Перейти к задаче" : "Перейти к проекту"}
        >
          <ExternalLink className="h-3 w-3" />
        </button>
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

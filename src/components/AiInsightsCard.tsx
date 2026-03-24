import { memo } from "react";
import { DailyInsights } from "@/hooks/useAiInsights";
import {
  Sparkles, RefreshCw, X, Loader2, TrendingUp, AlertTriangle, CheckCircle2, Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AiInsightsCardProps {
  insights: DailyInsights | null;
  loading: boolean;
  error: string | null;
  dismissed: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}

function AiInsightsCardInner({ insights, loading, error, dismissed, onRefresh, onDismiss }: AiInsightsCardProps) {
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
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Дайджест дня</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Обновить"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
          <button
            onClick={onDismiss}
            className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Скрыть"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Greeting */}
      <p className="px-3 text-xs text-foreground/80 leading-relaxed">{insights.greeting}</p>

      {/* Stats mini-bar */}
      <div className="flex gap-3 px-3 py-2">
        <StatBadge
          icon={TrendingUp}
          label="Активных"
          value={stats.active}
          variant="default"
        />
        {stats.overdue > 0 && (
          <StatBadge
            icon={AlertTriangle}
            label="Просрочено"
            value={stats.overdue}
            variant="danger"
          />
        )}
        <StatBadge
          icon={Target}
          label="На неделе"
          value={stats.dueThisWeek}
          variant="warning"
        />
        {stats.completedRecently > 0 && (
          <StatBadge
            icon={CheckCircle2}
            label="Сделано"
            value={stats.completedRecently}
            variant="success"
          />
        )}
      </div>

      {/* Urgent Items */}
      {insights.urgentItems.length > 0 && (
        <div className="px-3 pb-1.5 space-y-1">
          {insights.urgentItems.map((item, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs">
              <span className="shrink-0 mt-0.5">{item.emoji}</span>
              <span className="text-foreground/80 leading-relaxed">{item.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Focus of Day */}
      <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-lg bg-primary/8 border border-primary/10">
        <div className="flex items-center gap-1.5">
          <Target className="h-3 w-3 text-primary shrink-0" />
          <span className="text-[11px] font-medium text-primary">Фокус дня</span>
        </div>
        <p className="text-xs text-foreground/70 mt-0.5 leading-relaxed">{insights.focusOfDay}</p>
      </div>

      {/* Tips */}
      {insights.tips && insights.tips.length > 0 && (
        <div className="px-3 pb-2 space-y-0.5">
          {insights.tips.map((tip, i) => (
            <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">💡 {tip}</p>
          ))}
        </div>
      )}

      {/* Motivation */}
      <div className="px-3 pb-2.5">
        <p className="text-[11px] text-muted-foreground/70 italic">{insights.motivation}</p>
      </div>
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

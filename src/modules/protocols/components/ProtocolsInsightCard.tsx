import { useNavigate } from "react-router-dom";
import { FileText, RefreshCw, X, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProtocolsInsight } from "@/modules/protocols/hooks/useProtocolsInsight";

export default function ProtocolsInsightCard() {
  const navigate = useNavigate();
  const { insight, loading, error, dismissed, refresh, dismiss } = useProtocolsInsight();

  if (dismissed) return null;
  if (loading && !insight) {
    return (
      <div className="rounded-lg border border-border bg-card/60 px-4 py-3 text-xs text-muted-foreground">
        <Sparkles className="mr-1.5 inline h-3.5 w-3.5 animate-pulse" />
        Анализирую протоколы…
      </div>
    );
  }
  if (error || !insight) return null;
  const { totals, axes, comment } = insight;

  // Если совсем нет зависших и нет осей — лензу не показываем (чисто)
  if (totals.stuck === 0 && axes.length === 0) return null;

  const goAxis = (tagId: string) => {
    navigate(`/protocols?axis=${encodeURIComponent(tagId)}`);
  };

  return (
    <div className="rounded-lg border border-border bg-gradient-to-br from-card to-card/60 px-4 py-3 shadow-sm">
      {/* Заголовок */}
      <div className="mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">
          Протоколы · лента недели
        </h3>
        <span className="ml-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          зависло {totals.stuck}
        </span>
        <button
          onClick={() => navigate("/protocols")}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          title="Открыть протоколы"
        >
          Открыть <ArrowRight className="h-3 w-3" />
        </button>
        <button
          onClick={refresh}
          title="Обновить"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
        <button
          onClick={dismiss}
          title="Скрыть"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Метрики строкой */}
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>📋 {totals.protocols} протокол{plural(totals.protocols)}</span>
        <span>•</span>
        <span>🔥 в работе {totals.active}</span>
        <span>•</span>
        <span className="text-emerald-600 dark:text-emerald-400">✓ закрыто за неделю {totals.closedThisWeek}</span>
        <span>•</span>
        <span>+ создано {totals.createdThisWeek}</span>
      </div>

      {/* AI-комментарий */}
      {comment && (
        <p className="mb-3 text-xs text-foreground/90">{comment}</p>
      )}

      {/* Срез по осям */}
      {axes.length > 0 && (
        <div className="space-y-1.5">
          {axes.map((g) => (
            <div key={g.axisKey} className="flex items-start gap-2">
              <div className="w-24 shrink-0 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {g.axisLabel}
              </div>
              <div className="flex flex-1 flex-wrap gap-1">
                {g.chips.map((c) => (
                  <button
                    key={c.tagId}
                    onClick={() => goAxis(c.tagId)}
                    title={`Показать протоколы с ${c.tagName} (${c.stuckCount} зависш${plural(c.stuckCount, "ий", "их", "их")})`}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <span className="truncate max-w-[140px]">{c.tagName}</span>
                    <span className="rounded-full bg-amber-500/15 px-1 text-[10px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                      {c.stuckCount}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function plural(n: number, one = "", few = "а", many = "ов") {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { FileBarChart, Loader2, RefreshCw, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface PmoPortfolioSummaryProps {
  projects: {
    id: string;
    name: string;
    description: string | null;
    stats: { total: number; completed: number; overdue: number };
    driftCount: number;
    totalDelayDays: number;
    milestoneStats?: { total: number; completed: number; overdue: number };
  }[];
}

const CACHE_KEY = "pmo_portfolio_summary_cache";
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

function getCached(): { content: string; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts < CACHE_DURATION_MS) return parsed;
    localStorage.removeItem(CACHE_KEY);
  } catch { /* ignore */ }
  return null;
}

export default function PmoPortfolioSummary({ projects }: PmoPortfolioSummaryProps) {
  const [content, setContent] = useState<string | null>(() => getCached()?.content || null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (projects.length === 0) return;
    setLoading(true);
    try {
      const projectsSummary = projects.map(p => ({
        name: p.name,
        description: p.description,
        total_tasks: p.stats.total,
        completed_tasks: p.stats.completed,
        overdue_tasks: p.stats.overdue,
        drift_count: p.driftCount,
        total_delay_days: p.totalDelayDays,
        milestones: p.milestoneStats,
      }));

      const { data: result, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          action: "pmo_portfolio_summary",
          context: { projects: projectsSummary },
        },
      });

      if (error) {
        const status = (error as any)?.status;
        if (status === 429) { toast.error("Превышен лимит запросов"); return; }
        if (status === 402) { toast.error("ИИ временно недоступен"); return; }
        throw error;
      }

      if (result?.content) {
        setContent(result.content);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ content: result.content, ts: Date.now() }));
        setExpanded(true);
      }
    } catch (e: any) {
      console.error("Portfolio summary error:", e);
      toast.error("Ошибка генерации сводки");
    } finally {
      setLoading(false);
    }
  }, [projects]);

  if (dismissed) return null;
  if (projects.length === 0) return null;

  if (!content && !loading) {
    return (
      <button
        onClick={fetchSummary}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      >
        <FileBarChart className="h-3 w-3" />
        ИИ-сводка
      </button>
    );
  }

  if (loading) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Генерация сводки…
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="rounded-xl border border-border bg-card/50 shrink-0">
      <div className="px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-2 text-xs font-medium hover:text-foreground transition-colors min-w-0"
          >
            <FileBarChart className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">ИИ-сводка по портфелю</span>
            {expanded ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
          </button>

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <button onClick={fetchSummary} disabled={loading} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            </button>
            <button onClick={() => setDismissed(true)} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-2 prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_strong]:text-foreground max-h-64 overflow-y-auto">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

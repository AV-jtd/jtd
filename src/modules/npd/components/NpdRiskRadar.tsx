import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, RefreshCw, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

interface RiskItem {
  project_name: string;
  severity: "high" | "medium" | "low";
  issue: string;
  recommendation: string;
}

interface RiskRadarData {
  summary: string;
  risks: RiskItem[];
}

interface NpdRiskRadarProps {
  projects: {
    id: string;
    name: string;
    description: string | null;
    stats: { total: number; completed: number; overdue: number };
    streamStats: { name: string; total: number; completed: number }[];
    allGateKeys: string[];
  }[];
}

const CACHE_KEY = "npd_risk_radar_cache";
const CACHE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

function getCached(): { data: RiskRadarData; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts < CACHE_DURATION_MS) return parsed;
    localStorage.removeItem(CACHE_KEY);
  } catch { /* ignore */ }
  return null;
}

const SEVERITY_CONFIG = {
  high: { bg: "bg-destructive/10", border: "border-destructive/30", text: "text-destructive", label: "🔴 Высокий" },
  medium: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-600 dark:text-amber-400", label: "🟡 Средний" },
  low: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-600 dark:text-blue-400", label: "🔵 Низкий" },
};

export default function NpdRiskRadar({ projects }: NpdRiskRadarProps) {
  const [data, setData] = useState<RiskRadarData | null>(() => getCached()?.data || null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const fetchRisks = useCallback(async () => {
    if (projects.length === 0) return;
    setLoading(true);
    try {
      const projectsSummary = projects.map(p => ({
        name: p.name,
        description: p.description,
        total_tasks: p.stats.total,
        completed_tasks: p.stats.completed,
        overdue_tasks: p.stats.overdue,
        current_gates: p.allGateKeys,
        streams: p.streamStats.map(s => ({
          name: s.name,
          total: s.total,
          completed: s.completed,
        })),
      }));

      const { data: result, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          action: "npd_risk_radar",
          context: { projects: projectsSummary },
        },
      });

      if (error) {
        const status = (error as any)?.status;
        if (status === 429) { toast.error("Превышен лимит запросов, попробуйте позже"); return; }
        if (status === 402) { toast.error("Необходимо пополнить баланс"); return; }
        throw error;
      }

      if (result?.risks) {
        const radarData: RiskRadarData = { summary: result.summary, risks: result.risks };
        setData(radarData);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: radarData, ts: Date.now() }));
        setExpanded(true);
      }
    } catch (e: any) {
      console.error("Risk radar error:", e);
      toast.error("Ошибка анализа рисков");
    } finally {
      setLoading(false);
    }
  }, [projects]);

  if (dismissed) return null;
  if (projects.length === 0) return null;

  // Not yet loaded — show trigger button
  if (!data && !loading) {
    return (
      <button
        onClick={fetchRisks}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
      >
        <Sparkles className="h-3 w-3" />
        Risk-радар
      </button>
    );
  }

  if (loading) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Анализ рисков…
      </div>
    );
  }

  if (!data) return null;

  const highCount = data.risks.filter(r => r.severity === "high").length;
  const mediumCount = data.risks.filter(r => r.severity === "medium").length;

  return (
    <div className="border-b border-border bg-card/50 shrink-0">
      <div className="px-4 py-2">
        {/* Summary bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-2 text-xs font-medium hover:text-foreground transition-colors min-w-0"
          >
            <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0", highCount > 0 ? "text-destructive" : mediumCount > 0 ? "text-amber-500" : "text-emerald-500")} />
            <span className="truncate">{data.summary}</span>
            {expanded ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
          </button>

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {highCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">🔴 {highCount}</span>}
            {mediumCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">🟡 {mediumCount}</span>}
            <button onClick={fetchRisks} disabled={loading} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            </button>
            <button onClick={() => setDismissed(true)} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Expanded risk list */}
        {expanded && data.risks.length > 0 && (
          <div className="mt-2 grid gap-1.5 max-h-48 overflow-y-auto">
            {data.risks.map((risk, i) => {
              const cfg = SEVERITY_CONFIG[risk.severity] || SEVERITY_CONFIG.low;
              return (
                <div key={i} className={cn("flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs", cfg.bg, cfg.border)}>
                  <span className={cn("font-medium shrink-0 w-20", cfg.text)}>{cfg.label}</span>
                  <div className="min-w-0">
                    <span className="font-medium">{risk.project_name}:</span>{" "}
                    <span className="text-muted-foreground">{risk.issue}</span>
                    <div className="text-[11px] text-muted-foreground/80 mt-0.5">💡 {risk.recommendation}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

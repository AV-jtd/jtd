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
interface RiskRadarData { summary: string; risks: RiskItem[]; }

interface Props {
  protocols: {
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

const CACHE_KEY = "protocols_risk_radar_cache";
const CACHE_DURATION_MS = 2 * 60 * 60 * 1000;

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

export default function ProtocolsRiskRadar({ protocols }: Props) {
  const [data, setData] = useState<RiskRadarData | null>(() => getCached()?.data || null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const fetchRisks = useCallback(async () => {
    if (protocols.length === 0) return;
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("ai-assistant", {
        body: { action: "protocols_risk_radar", context: { protocols } },
      });
      if (error) {
        const status = (error as any)?.status;
        if (status === 429) { toast.error("Превышен лимит запросов, попробуйте позже"); return; }
        if (status === 402) { toast.error("ИИ временно недоступен"); return; }
        throw error;
      }
      if (result?.risks) {
        const radar: RiskRadarData = { summary: result.summary, risks: result.risks };
        setData(radar);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: radar, ts: Date.now() }));
        setExpanded(true);
      }
    } catch (e: any) {
      console.error("Protocols risk radar error:", e);
      toast.error("Ошибка анализа рисков");
    } finally {
      setLoading(false);
    }
  }, [protocols]);

  if (dismissed || protocols.length === 0) return null;

  if (!data && !loading) {
    return (
      <button
        onClick={fetchRisks}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Sparkles className="h-3 w-3" />
        Анализ рисков
      </button>
    );
  }
  if (loading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Анализ…
      </div>
    );
  }
  if (!data) return null;

  const high = data.risks.filter((r) => r.severity === "high").length;
  const med = data.risks.filter((r) => r.severity === "medium").length;

  return (
    <div className="w-full rounded-md border border-border bg-card/50">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium hover:text-foreground"
        >
          <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0", high > 0 ? "text-destructive" : med > 0 ? "text-amber-500" : "text-emerald-500")} />
          <span className="truncate">{data.summary}</span>
          {expanded ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {high > 0 && <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">🔴 {high}</span>}
          {med > 0 && <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">🟡 {med}</span>}
          <button onClick={fetchRisks} disabled={loading} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          </button>
          <button onClick={() => setDismissed(true)} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      {expanded && data.risks.length > 0 && (
        <div className="grid max-h-48 gap-1.5 overflow-y-auto px-2.5 pb-2">
          {data.risks.map((risk, i) => {
            const cfg = SEVERITY_CONFIG[risk.severity] || SEVERITY_CONFIG.low;
            return (
              <div key={i} className={cn("flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs", cfg.bg, cfg.border)}>
                <span className={cn("w-20 shrink-0 font-medium", cfg.text)}>{cfg.label}</span>
                <div className="min-w-0">
                  <span className="font-medium">{risk.project_name}:</span>{" "}
                  <span className="text-muted-foreground">{risk.issue}</span>
                  <div className="mt-0.5 text-[11px] text-muted-foreground/80">💡 {risk.recommendation}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

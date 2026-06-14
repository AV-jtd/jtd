import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tags, ChevronDown, ChevronRight, ExternalLink, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStmStages, currentStmStage, calcStmProgress, type StmFlow } from "@/modules/stm/lib/stages";

type StmSku = {
  id: string;
  name: string;
  retailer: string | null;
  brand: string | null;
  progress: number;
  stageTitle: string | null;
  done: boolean;
};

/**
 * «СТМ в работе» — список активных SKU из STM Mission Control, привязанных к
 * клиенту по сети (stm_meta.retailer содержит имя клиента). Раскрываемый блок.
 */
function useClientStm(clientName: string | null) {
  return useQuery({
    queryKey: ["client_stm", clientName],
    enabled: !!clientName,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<StmSku[]> => {
      if (!clientName) return [];
      // SKU-проекты этой сети (активные), retailer ~ имя клиента.
      const { data: groups } = await supabase
        .from("task_groups")
        .select("id, name, stm_meta, closed_at")
        .eq("project_subtype", "npd_stm" as any)
        .is("closed_at", null)
        .ilike("stm_meta->>retailer", `%${clientName}%`)
        .order("created_at", { ascending: false });
      const list = (groups as any[]) || [];
      if (!list.length) return [];

      const ids = list.map((g) => g.id);
      const { data: tasks } = await supabase
        .from("tasks")
        .select("group_id, stage_key, is_completed, stm_flow")
        .eq("task_type", "stm_stage" as any)
        .in("group_id", ids);
      const stageTasks = (tasks as any[]) || [];

      return list.map((g) => {
        const meta = (g.stm_meta || {}) as any;
        const flow: StmFlow = meta.flow === "out" ? "out" : "in";
        const mine = stageTasks.filter((t) => t.group_id === g.id);
        const progress = calcStmProgress(mine, flow);
        const stage = currentStmStage(mine, flow);
        const done = progress >= 100;
        return {
          id: g.id,
          name: g.name,
          retailer: meta.retailer ?? null,
          brand: meta.brand ?? null,
          progress,
          stageTitle: done ? null : stage?.title ?? null,
          done,
        };
      });
    },
  });
}

export default function ClientStmBlock({ clientName }: { clientName: string | null }) {
  const { data: skus } = useClientStm(clientName);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (!skus || skus.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground"
      >
        <Tags className="h-3 w-3" />
        СТМ в работе
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold normal-case text-primary">
          {skus.length}
        </span>
        {open ? (
          <ChevronDown className="ml-auto h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="ml-auto h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-1">
          {skus.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate(`/npd/stm?sku=${s.id}`)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
              title="Открыть в СТМ Mission Control"
            >
              <span className="text-sm leading-none">🏷️</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{s.name}</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", s.done ? "bg-tag-green" : "bg-primary/60")}
                      style={{ width: `${Math.max(s.progress, s.progress > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                    {s.progress}%
                  </span>
                </div>
                {s.stageTitle ? (
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{s.stageTitle}</div>
                ) : s.done ? (
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-tag-green">
                    <Rocket className="h-2.5 w-2.5" /> Завершён
                  </div>
                ) : null}
              </div>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
          ))}

          <button
            onClick={() => navigate(`/npd/stm?q=${encodeURIComponent(clientName ?? "")}`)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Открыть в СТМ Mission Control
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

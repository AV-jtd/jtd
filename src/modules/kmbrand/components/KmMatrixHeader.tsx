import React from "react";
import { cn } from "@/lib/utils";
import { Flag, Medal } from "lucide-react";
import type { KmStage } from "../lib/stages";

function KmMatrixHeaderInner({ stages }: { stages: KmStage[] }) {
  return (
    <div className="flex border-b border-border sticky top-0 z-10 bg-card">
      <div className="sticky left-0 z-[2] min-w-[320px] w-[320px] shrink-0 px-3 py-3 border-r border-border bg-card">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">SKU / Проект</span>
      </div>
      {stages.map((s, i) => {
        const isMs = !!s.milestone;
        return (
          <div
            key={s.key}
            className={cn(
              "min-w-[80px] w-[80px] shrink-0 px-1 py-3 text-center border-r border-border/50 relative",
              isMs && "bg-primary/5",
            )}
            title={isMs ? `${s.description} · контрольная веха` : s.description}
          >
            {isMs && (
              s.milestone === "medal"
                ? <Medal className="h-2.5 w-2.5 text-primary absolute top-1 right-1" aria-label="Финальная веха" />
                : <Flag className="h-2.5 w-2.5 text-primary absolute top-1 right-1" aria-label="Контрольная веха" />
            )}
            <div className={cn("text-[9px] font-mono mb-0.5", isMs ? "text-primary" : "text-muted-foreground/70")}>
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className={cn(
              "text-[10px] font-semibold uppercase tracking-wider leading-tight",
              isMs ? "text-primary" : "text-foreground/80",
            )}>
              {s.short}
            </div>
          </div>
        );
      })}
      <div className="min-w-[260px] w-[260px] shrink-0 px-3 py-3 border-l border-border bg-card">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em]">Комментарий</span>
      </div>
    </div>
  );
}

export const KmMatrixHeader = React.memo(KmMatrixHeaderInner);

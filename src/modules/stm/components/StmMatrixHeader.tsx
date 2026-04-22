import React from "react";
import { cn } from "@/lib/utils";
import type { StmStage } from "../lib/stages";

function StmMatrixHeaderInner({ stages }: { stages: StmStage[] }) {
  return (
    <div className="flex border-b-2 border-stm-border/60 sticky top-0 z-10 bg-stm-card/95 backdrop-blur-md">
      <div className="sticky left-0 z-[2] min-w-[320px] w-[320px] shrink-0 px-3 py-3 border-r border-stm-border/40 bg-stm-card/95 backdrop-blur-md">
        <span className="text-[10px] font-bold text-stm-fg/60 uppercase tracking-[0.15em]">SKU / Проект</span>
      </div>
      {stages.map((s, i) => (
        <div
          key={s.key}
          className={cn(
            "min-w-[80px] w-[80px] shrink-0 px-1 py-3 text-center border-r border-stm-border/20",
          )}
          title={s.description}
        >
          <div className="text-[9px] font-mono text-stm-fg/40 mb-0.5">{String(i + 1).padStart(2, "0")}</div>
          <div className="text-[10px] font-semibold text-stm-fg/80 uppercase tracking-wider leading-tight">{s.short}</div>
        </div>
      ))}
    </div>
  );
}

export const StmMatrixHeader = React.memo(StmMatrixHeaderInner);
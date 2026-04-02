import React from "react";
import { cn } from "@/lib/utils";
import { NPD_GATES } from "./types";

function GateColumnHeadersInner() {
  return (
    <div className="flex border-b-2 border-border sticky top-0 z-10 bg-card">
      <div className="min-w-[200px] w-[200px] shrink-0 px-3 py-2.5 border-r border-border">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Стримы</span>
      </div>
      {NPD_GATES.map(gate => (
        <div key={gate.key} className={cn("min-w-[220px] w-[220px] shrink-0 border-r border-border px-3 py-2.5 text-center", gate.bgLight)}>
          <span className={cn("text-xs font-bold", gate.textColor)}>{gate.short}</span>
          <span className="text-[10px] text-muted-foreground ml-1.5">{gate.shortTitle}</span>
        </div>
      ))}
    </div>
  );
}

const GateColumnHeaders = React.memo(GateColumnHeadersInner);
export default GateColumnHeaders;

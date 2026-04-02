import React from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { isPast, parseISO } from "date-fns";
import { NPD_GATES, NPD_STREAMS, type Task, type TaskGroup } from "./types";

interface GateSummaryProps {
  projectId: string;
  streamSubMap: Map<string, TaskGroup>;
  tasksByGroup: Map<string, Task[]>;
  streamTaggedTasksByStream: Map<string, Task[]>;
  getSubprojectGate: (subId: string) => string | null;
  getTaskGate: (taskId: string) => string | null;
}

function GateSummaryInner({
  projectId, streamSubMap, tasksByGroup, streamTaggedTasksByStream,
  getSubprojectGate, getTaskGate,
}: GateSummaryProps) {
  const parentProjectGate = getSubprojectGate(projectId);

  return (
    <div className="flex border-t border-border bg-card/40">
      <div className="min-w-[200px] w-[200px] shrink-0 px-3 py-3 border-r border-border text-xs font-bold text-muted-foreground uppercase tracking-wider">
        Итого по гейтам
      </div>
      {NPD_GATES.map(gate => {
        let gateTotalTasks = 0;
        let gateCompletedTasks = 0;
        let gateOverdue = 0;
        const streamsInGate: string[] = [];

        NPD_STREAMS.forEach(s => {
          const sub = streamSubMap.get(s);
          const subTasks = sub ? (tasksByGroup.get(sub.id) || []) : [];
          const taggedStreamTasks = streamTaggedTasksByStream.get(s) || [];
          const tasks = Array.from(new Map([...subTasks, ...taggedStreamTasks].map(t => [t.id, t])).values());
          const currentGate = sub ? (getSubprojectGate(sub.id) ?? parentProjectGate) : parentProjectGate;

          const cellTasks = tasks.filter(t => {
            const taskGate = getTaskGate(t.id);
            return taskGate ? taskGate === gate.key : currentGate === gate.key;
          });

          if (cellTasks.length > 0) {
            streamsInGate.push(s);
            gateTotalTasks += cellTasks.length;
            gateCompletedTasks += cellTasks.filter(t => t.is_completed).length;
            gateOverdue += cellTasks.filter(t => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))).length;
          }
        });

        const gatePct = gateTotalTasks > 0 ? Math.round((gateCompletedTasks / gateTotalTasks) * 100) : 0;

        return (
          <div key={gate.key} className={cn("min-w-[220px] w-[220px] shrink-0 border-r border-border px-3 py-3", gateTotalTasks > 0 ? gate.bgLight : "")}>
            {gateTotalTasks > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {streamsInGate.map(s => (
                    <span key={s} className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium", gate.bgLight, gate.textColor)}>
                      {s}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", gate.color)} style={{ width: `${gatePct}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">{gatePct}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{gateCompletedTasks}/{gateTotalTasks}</span>
                  {gateOverdue > 0 && (
                    <span className="text-[10px] text-destructive flex items-center gap-0.5">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {gateOverdue}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground/40">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const GateSummary = React.memo(GateSummaryInner);
export default GateSummary;

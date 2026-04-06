import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Inbox, CheckCircle2 } from "lucide-react";
import { DroppableGateCell, DraggableTaskRow } from "./DndWrappers";
import { NPD_GATES, type Task } from "./types";

interface InboxRowProps {
  inboxOpen: boolean;
  onToggle: () => void;
  totalCount: number;
  parentTasks: Task[];
  unmatchedSubTasks: Task[];
  dndOverCell: string | null;
  getTaskGate?: (taskId: string) => string | null;
}

function InboxRowInner({ inboxOpen, onToggle, totalCount, parentTasks, unmatchedSubTasks, dndOverCell, getTaskGate }: InboxRowProps) {
  const makeCellId = (s: string, g: string) => `${s}::${g}`;
  const allInboxTasks = useMemo(() => [...parentTasks, ...unmatchedSubTasks], [parentTasks, unmatchedSubTasks]);

  // Distribute tasks by gate column based on getTaskGate or deadline heuristic
  const tasksByGate = useMemo(() => {
    const map = new Map<string, Task[]>();
    NPD_GATES.forEach(g => map.set(g.key, []));

    for (const task of allInboxTasks) {
      let gateKey: string | null = null;

      // Use getTaskGate if available
      if (getTaskGate) {
        gateKey = getTaskGate(task.id);
      }

      // Fallback: put in first gate
      if (!gateKey) {
        gateKey = NPD_GATES[0].key;
      }

      const list = map.get(gateKey);
      if (list) {
        list.push(task);
      } else {
        map.get(NPD_GATES[0].key)!.push(task);
      }
    }

    return map;
  }, [allInboxTasks, getTaskGate]);

  if (totalCount === 0) return null;

    <div className="border-b border-border bg-muted/20">
      <div className="flex">
        <div className="min-w-[200px] w-[200px] shrink-0 border-r border-border bg-card/50">
          <button
            onClick={onToggle}
            className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
          >
            {inboxOpen
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            }
            <Inbox className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground truncate">Входящие</span>
            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
              {totalCount}
            </span>
          </button>
        </div>
        {NPD_GATES.map(gate => {
          const cellId = makeCellId("__inbox__", gate.key);
          const isCellOver = dndOverCell === cellId;
          const cellTasks = tasksByGate.get(gate.key) ?? [];
          return (
            <DroppableGateCell
              key={gate.key}
              gateKey={cellId}
              isHighlighted={isCellOver}
              className={cn(
                "min-w-[220px] w-[220px] shrink-0 border-r border-border transition-colors",
                isCellOver ? "bg-primary/10 ring-1 ring-primary/30" : "bg-background/50",
              )}
            >
              {!inboxOpen && cellTasks.length > 0 && (
                <div className="px-2.5 py-2 flex items-center">
                  <span className="text-[9px] text-muted-foreground/60">{cellTasks.length}</span>
                </div>
              )}
              {!inboxOpen && cellTasks.length === 0 && (
                <div className="px-2.5 py-2 flex items-center">
                  <span className="text-[9px] text-muted-foreground/40">перетащите сюда</span>
                </div>
              )}
            </DroppableGateCell>
          );
        })}
      </div>
      {inboxOpen && (
        <div className="flex">
          <div className="min-w-[200px] w-[200px] shrink-0 border-r border-border" />
          {NPD_GATES.map(gate => {
            const cellId = makeCellId("__inbox__", gate.key);
            const isCellOver = dndOverCell === cellId;
            const cellTasks = tasksByGate.get(gate.key) ?? [];
            return (
              <div
                key={gate.key}
                className={cn(
                  "min-w-[220px] w-[220px] shrink-0 border-r border-border px-2 py-2 min-h-[40px]",
                  isCellOver ? "bg-primary/10" : ""
                )}
              >
                {cellTasks.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {cellTasks.map(task => (
                      <DraggableTaskRow key={task.id} taskId={task.id}>
                        <div className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-card border border-border text-[11px] max-w-[200px]">
                          <CheckCircle2 className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            task.is_completed ? "text-primary" : "text-muted-foreground/40"
                          )} />
                          <span className={cn(
                            "truncate",
                            task.is_completed && "line-through text-muted-foreground"
                          )}>
                            {task.title}
                          </span>
                        </div>
                      </DraggableTaskRow>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const InboxRow = React.memo(InboxRowInner);
export default InboxRow;

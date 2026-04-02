import React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { isPast, parseISO } from "date-fns";
import { DroppableGateCell, DraggableTaskRow } from "./DndWrappers";
import MatrixTaskRow from "./MatrixTaskRow";
import QuickCreateForm from "@/components/QuickCreateForm";
import type { QuickCreateResult } from "@/components/QuickCreateForm";
import { NPD_GATES, type Task, type TaskGroup, type Profile } from "./types";

interface StreamRowProps {
  stream: string;
  sub: TaskGroup | undefined;
  isCollapsed: boolean;
  currentGate: string | null;
  tasks: Task[];
  users: Profile[];
  allDependencies: any[];
  allTasks: Task[];
  projectGroupIds: Set<string>;
  projectId: string;
  dndOverCell: string | null;
  getTaskGate: (taskId: string) => string | null;
  getGateStartDate: (stream: string, gateKey: string) => Date | undefined;
  onToggleCollapse: () => void;
  onDeadlineChange: (task: Task, date: Date) => void;
  onAssigneeChange: (taskId: string, userId: string | null) => void;
  onToggle: (taskId: string) => void;
  onAddDependency: (predId: string, succId: string) => void;
  onExpand: (taskId: string) => void;
  onQuickCreate: (params: QuickCreateResult, groupId: string, stream?: string, gateKey?: string) => void | Promise<void>;
}

function StreamRowInner({
  stream, sub, isCollapsed, currentGate, tasks, users,
  allDependencies, allTasks, projectGroupIds, projectId,
  dndOverCell, getTaskGate, getGateStartDate,
  onToggleCollapse, onDeadlineChange, onAssigneeChange, onToggle,
  onAddDependency, onExpand, onQuickCreate,
}: StreamRowProps) {
  const activeTasks = tasks.filter(t => !t.is_completed);
  const completedCount = tasks.filter(t => t.is_completed).length;
  const overdueTasks = activeTasks.filter(t => t.deadline && isPast(parseISO(t.deadline)));

  const makeCellId = (s: string, g: string) => `${s}::${g}`;

  return (
    <div className="border-b border-border">
      <div className="flex">
        {/* Stream label */}
        <div className={cn(
          "min-w-[200px] w-[200px] shrink-0 border-r border-border bg-card/50",
          isCollapsed && overdueTasks.length > 0 && "bg-destructive/5"
        )}>
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
          >
            {isCollapsed
              ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            }
            <span className="text-xs font-semibold text-foreground truncate">{stream}</span>
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              {overdueTasks.length > 0 && (
                <span className="text-[9px] text-destructive font-medium flex items-center gap-0.5">
                  <AlertTriangle className="h-3 w-3" />
                  {overdueTasks.length}
                </span>
              )}
              {tasks.length > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {completedCount}/{tasks.length}
                </span>
              )}
            </div>
          </button>
        </div>

        {/* Gate cells */}
        {NPD_GATES.map(gate => {
          const isCurrentGate = currentGate === gate.key;
          const cellTasks = tasks.filter(t => {
            const taskGate = getTaskGate(t.id);
            return taskGate ? taskGate === gate.key : currentGate === gate.key;
          });
          const hasTasks = cellTasks.length > 0;
          const cellId = makeCellId(stream, gate.key);
          const isCellOver = dndOverCell === cellId;

          return (
            <DroppableGateCell
              key={gate.key}
              gateKey={cellId}
              isHighlighted={isCellOver}
              className={cn(
                "min-w-[220px] w-[220px] shrink-0 border-r border-border transition-colors",
                isCellOver
                  ? "bg-primary/10 ring-1 ring-primary/30"
                  : (isCurrentGate || hasTasks) ? cn(gate.bgLight, "border-l-2", gate.color.replace("bg-", "border-l-")) : "bg-background/50",
              )}
            >
              {!isCollapsed && (
                <div className="px-2 py-2 min-h-[60px]">
                  {sub ? (
                    <div className="space-y-1">
                      {cellTasks.map(task => (
                        <DraggableTaskRow key={task.id} taskId={task.id}>
                          <MatrixTaskRow
                            task={task}
                            users={users}
                            allDependencies={allDependencies}
                            allTasks={allTasks}
                            projectGroupIds={projectGroupIds}
                            onDeadlineChange={onDeadlineChange}
                            onAssigneeChange={onAssigneeChange}
                            onToggle={onToggle}
                            onAddDependency={onAddDependency}
                            onExpand={onExpand}
                          />
                        </DraggableTaskRow>
                      ))}
                      <QuickCreateForm
                        users={users}
                        singleType="task"
                        onCreate={(p) => onQuickCreate(p, sub.id, stream, gate.key)}
                        compact={cellTasks.length === 0}
                        startFrom={getGateStartDate(stream, gate.key)}
                        startFromLabel={NPD_GATES.findIndex(g => g.key === gate.key) > 0 ? `после ${NPD_GATES[NPD_GATES.findIndex(g => g.key === gate.key) - 1].short}` : "старт проекта"}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center min-h-[40px]">
                      <QuickCreateForm
                        users={users}
                        singleType="task"
                        onCreate={(p) => onQuickCreate(p, projectId, stream, gate.key)}
                        compact
                        startFrom={getGateStartDate(stream, gate.key)}
                        startFromLabel={NPD_GATES.findIndex(g => g.key === gate.key) > 0 ? `после ${NPD_GATES[NPD_GATES.findIndex(g => g.key === gate.key) - 1].short}` : "старт проекта"}
                      />
                    </div>
                  )}
                </div>
              )}
              {isCollapsed && (hasTasks || isCurrentGate) && (() => {
                const cellCompleted = cellTasks.filter(t => t.is_completed).length;
                const cellOverdue = cellTasks.filter(t => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))).length;
                const cellPct = cellTasks.length > 0 ? Math.round((cellCompleted / cellTasks.length) * 100) : 0;
                return (
                  <div
                    onClick={onToggleCollapse}
                    className={cn(
                      "px-2.5 py-2 flex items-center gap-2 cursor-pointer hover:bg-muted/40 transition-colors",
                      cellOverdue > 0 && "bg-destructive/5 hover:bg-destructive/10"
                    )}
                  >
                    {cellTasks.length > 0 ? (
                      <>
                        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", gate.color)} style={{ width: `${cellPct}%` }} />
                        </div>
                        <span className="text-[9px] font-mono text-muted-foreground shrink-0">{cellCompleted}/{cellTasks.length}</span>
                        {cellOverdue > 0 && (
                          <span className="text-[9px] text-destructive flex items-center gap-0.5 shrink-0">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {cellOverdue}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[9px] text-muted-foreground/40">—</span>
                    )}
                  </div>
                );
              })()}
            </DroppableGateCell>
          );
        })}
      </div>
    </div>
  );
}

const StreamRow = React.memo(StreamRowInner);
export default StreamRow;

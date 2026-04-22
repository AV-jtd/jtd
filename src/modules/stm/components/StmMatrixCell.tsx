import React from "react";
import { cn } from "@/lib/utils";
import { Check, Clock, AlertTriangle, Minus, Flag } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Task } from "@/hooks/useTasks";
import { useToggleStmStage } from "../hooks/useStmProjects";

interface Props {
  task: Task | null;
  isCurrent: boolean;
  isMilestone?: boolean;
  milestoneLabel?: string;
}

/**
 * Single matrix cell for one SKU × one stage.
 * Architectural Glass aesthetic: faint glass tile, glowing accent on active stage.
 * Milestone stages additionally render the deadline date and a drift indicator (↗+Nд)
 * so the user can immediately see the shift of approval/order dates.
 */
function StmMatrixCellInner({ task, isCurrent, isMilestone, milestoneLabel }: Props) {
  const toggle = useToggleStmStage();

  if (!task) {
    return (
      <div className={cn(
        "h-full w-full flex flex-col items-center justify-center gap-0.5",
        isMilestone ? "text-stm-accent/70" : "text-stm-fg/20",
      )}>
        {isMilestone && <Flag className="h-3 w-3 text-stm-accent" />}
        {!isMilestone && <Minus className="h-3 w-3" />}
        {isMilestone && (
          <div className="text-[9px] tabular-nums font-mono italic text-stm-accent/60 leading-none">
            нет даты
          </div>
        )}
        {isMilestone && milestoneLabel && (
          <div className="text-[9px] uppercase tracking-wider text-stm-accent font-semibold leading-none">
            {milestoneLabel}
          </div>
        )}
      </div>
    );
  }

  const overdue = !task.is_completed && task.deadline && new Date(task.deadline) < new Date();
  const status: "done" | "overdue" | "current" | "open" =
    task.is_completed ? "done" : overdue ? "overdue" : isCurrent ? "current" : "open";

  const tipLabel =
    status === "done" ? "Готово" :
    status === "overdue" ? "Просрочено" :
    status === "current" ? "В работе" : "Ожидает";

  // Drift: positive shift in days from original_deadline
  const driftDays = task.deadline && (task as any).original_deadline
    ? Math.round(
        (new Date(task.deadline).getTime() - new Date((task as any).original_deadline).getTime()) /
          86400000,
      )
    : 0;

  const dateLabel = task.deadline
    ? new Date(task.deadline).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })
    : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => toggle.mutate({ taskId: task.id, isCompleted: !task.is_completed })}
          className={cn(
            "group h-full w-full flex flex-col items-center justify-center gap-0.5 rounded-md transition-all px-1 py-1",
            "border border-stm-border/40 backdrop-blur-sm",
            status === "done" && "bg-stm-success/15 border-stm-success/40 text-stm-success",
            status === "overdue" && "bg-stm-danger/15 border-stm-danger/50 text-stm-danger animate-pulse",
            status === "current" && "bg-stm-accent/20 border-stm-accent/60 text-stm-accent shadow-[0_0_12px_-2px_hsl(var(--stm-accent)/0.6)]",
            status === "open" && "bg-stm-glass/40 hover:bg-stm-glass/70 text-stm-fg/40 hover:text-stm-fg/70",
            isMilestone && "ring-1 ring-stm-accent/40",
          )}
          aria-label={`${task.title}: ${tipLabel}`}
        >
          <div className="flex items-center gap-1 leading-none">
            {isMilestone && <Flag className="h-2.5 w-2.5 text-stm-accent" />}
            {status === "done" && <Check className="h-3.5 w-3.5" />}
            {status === "overdue" && <AlertTriangle className="h-3.5 w-3.5" />}
            {status === "current" && <Clock className="h-3.5 w-3.5" />}
          </div>
          {dateLabel && (
            <div className={cn(
              "text-[10px] tabular-nums font-mono leading-none px-1 py-0.5 rounded",
              isMilestone && "text-stm-accent font-bold bg-stm-accent/10 ring-1 ring-stm-accent/30",
              !isMilestone && status === "done" && "text-stm-success font-semibold",
              !isMilestone && status === "overdue" && "text-stm-danger font-bold",
              !isMilestone && status === "current" && "text-stm-accent font-semibold",
              !isMilestone && status === "open" && "text-stm-fg/60 font-medium",
            )}>
              {dateLabel}
            </div>
          )}
          {driftDays > 0 && (
            <div className="text-[8px] font-mono text-stm-warn leading-none border-b border-dashed border-stm-warn/60">
              ↗+{driftDays}д
            </div>
          )}
          {isMilestone && milestoneLabel && (
            <div className="text-[8px] uppercase tracking-wider text-stm-accent/80 font-semibold leading-none">
              {milestoneLabel}
            </div>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="font-medium">
          {isMilestone && "🚩 "}{task.title}
        </div>
        <div className="text-muted-foreground">
          {tipLabel}{task.deadline ? ` · до ${new Date(task.deadline).toLocaleDateString("ru-RU")}` : ""}
        </div>
        {driftDays > 0 && (
          <div className="text-stm-warn">Смещение: +{driftDays} дн от плана</div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export const StmMatrixCell = React.memo(StmMatrixCellInner);
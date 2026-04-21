import React from "react";
import { cn } from "@/lib/utils";
import { Check, Clock, AlertTriangle, Minus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Task } from "@/hooks/useTasks";
import { useToggleStmStage } from "../hooks/useStmProjects";

interface Props {
  task: Task | null;
  isCurrent: boolean;
}

/**
 * Single matrix cell for one SKU × one stage.
 * Architectural Glass aesthetic: faint glass tile, glowing accent on active stage.
 */
function StmMatrixCellInner({ task, isCurrent }: Props) {
  const toggle = useToggleStmStage();

  if (!task) {
    return (
      <div className="h-full w-full flex items-center justify-center text-stm-fg/20">
        <Minus className="h-3 w-3" />
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

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => toggle.mutate({ taskId: task.id, isCompleted: !task.is_completed })}
          className={cn(
            "group h-full w-full flex items-center justify-center rounded-md transition-all",
            "border border-stm-border/40 backdrop-blur-sm",
            status === "done" && "bg-stm-success/15 border-stm-success/40 text-stm-success",
            status === "overdue" && "bg-stm-danger/15 border-stm-danger/50 text-stm-danger animate-pulse",
            status === "current" && "bg-stm-accent/20 border-stm-accent/60 text-stm-accent shadow-[0_0_12px_-2px_hsl(var(--stm-accent)/0.6)]",
            status === "open" && "bg-stm-glass/40 hover:bg-stm-glass/70 text-stm-fg/40 hover:text-stm-fg/70",
          )}
          aria-label={`${task.title}: ${tipLabel}`}
        >
          {status === "done" && <Check className="h-4 w-4" />}
          {status === "overdue" && <AlertTriangle className="h-4 w-4" />}
          {status === "current" && <Clock className="h-4 w-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="font-medium">{task.title}</div>
        <div className="text-muted-foreground">{tipLabel}{task.deadline ? ` · до ${new Date(task.deadline).toLocaleDateString("ru-RU")}` : ""}</div>
      </TooltipContent>
    </Tooltip>
  );
}

export const StmMatrixCell = React.memo(StmMatrixCellInner);
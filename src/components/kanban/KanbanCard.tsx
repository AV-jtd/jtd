import { Calendar, MessageSquare, AlertTriangle } from "lucide-react";
import { format, isPast, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Task } from "@/hooks/useTasks";

interface KanbanCardProps {
  task: Task;
  onClick?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

const PRIORITY_COLOR: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-yellow-500",
  4: "bg-blue-400",
};

export function KanbanCard({ task, onClick, dragHandleProps }: KanbanCardProps) {
  const overdue =
    task.deadline && !task.is_completed && isPast(parseISO(task.deadline));
  const priorityColor = task.priority ? PRIORITY_COLOR[task.priority] : null;

  return (
    <div
      {...dragHandleProps}
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={cn(
        "group cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-all",
        "hover:shadow-md hover:border-primary/30",
        task.is_completed && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        {priorityColor && (
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", priorityColor)} />
        )}
        <p
          className={cn(
            "flex-1 text-sm font-medium leading-snug text-foreground",
            task.is_completed && "line-through",
          )}
        >
          {task.title}
        </p>
      </div>

      {(task.deadline || task.description) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {task.deadline && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue && "text-red-500 font-medium",
              )}
            >
              {overdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
              {format(parseISO(task.deadline), "d MMM", { locale: ru })}
            </span>
          )}
          {task.description && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
import { type Task, type TaskGroup, useAvailableUsers } from "@/hooks/useTasks";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

interface GanttTooltipProps {
  task: Task;
  project: TaskGroup;
  children: React.ReactNode;
  progress?: number;
}

export default function GanttTooltip({ task, project, children, progress }: GanttTooltipProps) {
  const { data: users = [] } = useAvailableUsers();
  const assignee = users.find(u => u.id === task.assigned_to);

  const priorities: Record<number, string> = { 1: "🔴 P1", 2: "🟠 P2", 3: "🟡 P3" };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 p-2 space-y-1 text-xs">
          <div className="font-medium truncate">{task.title}</div>
          <div className="text-muted-foreground">
            {project.icon && project.icon !== "list" ? `${project.icon} ` : ""}{project.name}
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            {task.deadline && (
              <span>📅 {format(parseISO(task.deadline), "d MMM yyyy", { locale: ru })}</span>
            )}
            {assignee && (
              <span>👤 {assignee.display_name || assignee.email}</span>
            )}
          </div>
          {task.priority && (
            <span>{priorities[task.priority]}</span>
          )}
          {progress !== undefined && (
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground">{Math.round(progress)}%</span>
            </div>
          )}
          {task.original_deadline && task.deadline && task.original_deadline !== task.deadline && (
            <div className="text-[10px] text-muted-foreground">
              Базовый: {format(parseISO(task.original_deadline), "d MMM", { locale: ru })}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

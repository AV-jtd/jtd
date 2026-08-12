import { type Task, type TaskGroup, useAvailableUsers } from "@/hooks/useTasks";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ru } from "date-fns/locale";

interface GanttTooltipProps {
  task: Task;
  project: TaskGroup;
  children: React.ReactNode;
  progress?: number;
  disabled?: boolean;
}

export default function GanttTooltip({ task, project, children, progress, disabled }: GanttTooltipProps) {
  const { data: users = [] } = useAvailableUsers();
  const assignee = users.find(u => u.id === task.assigned_to);

  const priorities: Record<number, string> = { 1: "🔴 P1", 2: "🟠 P2", 3: "🟡 P3" };

  if (disabled) return <>{children}</>;

  const hasDrift = task.original_deadline && task.deadline && task.original_deadline !== task.deadline;
  const driftDays = hasDrift
    ? differenceInCalendarDays(parseISO(task.deadline!), parseISO(task.original_deadline!))
    : 0;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm p-2.5 space-y-1.5 text-xs" sideOffset={8}>
          <div className="font-medium leading-tight">{task.title}</div>
          {task.description && (
            <div className="text-muted-foreground text-[11px] leading-tight line-clamp-3">{task.description}</div>
          )}
          <div className="text-muted-foreground text-[10px]">
            {project.icon && project.icon !== "list" ? `${project.icon} ` : ""}{project.name}
          </div>
          <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
            {task.start_at && (
              <span>🚀 {format(parseISO(task.start_at), "d MMM", { locale: ru })}</span>
            )}
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
          {hasDrift && (
            <div className={`text-[10px] font-medium ${driftDays > 0 ? "text-amber-500" : "text-emerald-500"}`}>
              {driftDays > 0 ? "⚠️" : "✅"} Перенос: {format(parseISO(task.original_deadline!), "d MMM", { locale: ru })} → {format(parseISO(task.deadline!), "d MMM", { locale: ru })} ({driftDays > 0 ? "+" : ""}{driftDays}д)
            </div>
          )}
          <div className="text-muted-foreground/70 text-[10px] italic pt-0.5 border-t border-border/50">
            ↔ Тяните за края — срок · за центр — перенос всей задачи
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

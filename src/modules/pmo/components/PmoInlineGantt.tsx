import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { format, differenceInCalendarDays, startOfDay, isPast, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Task, Profile } from "@/hooks/useTasks";

interface PmoInlineGanttProps {
  tasks: Task[];
  userMap: Map<string, Profile>;
  onTaskClick?: (taskId: string) => void;
}

export default function PmoInlineGantt({ tasks, userMap, onTaskClick }: PmoInlineGanttProps) {
  const activeTasks = useMemo(() => tasks.filter((t) => !t.is_completed && t.deadline), [tasks]);

  const { minDate, maxDate, totalDays } = useMemo(() => {
    const dates: Date[] = [];
    for (const t of activeTasks) {
      if (t.start_at) dates.push(startOfDay(new Date(t.start_at)));
      if (t.deadline) dates.push(startOfDay(new Date(t.deadline)));
    }
    if (dates.length === 0) {
      const now = startOfDay(new Date());
      return { minDate: now, maxDate: now, totalDays: 30 };
    }
    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const days = Math.max(differenceInCalendarDays(max, min) + 7, 14);
    return { minDate: min, maxDate: max, totalDays: days };
  }, [activeTasks]);

  const today = startOfDay(new Date());
  const todayOffset = differenceInCalendarDays(today, minDate);
  const todayPct = (todayOffset / totalDays) * 100;

  if (activeTasks.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-4">Нет активных задач с дедлайнами</p>;
  }

  const sorted = [...activeTasks].sort((a, b) => {
    const aDate = a.start_at || a.deadline || "";
    const bDate = b.start_at || b.deadline || "";
    return aDate.localeCompare(bDate);
  }).slice(0, 20);

  return (
    <div className="space-y-0.5 relative">
      {/* Today marker */}
      {todayPct >= 0 && todayPct <= 100 && (
        <div
          className="absolute top-0 bottom-0 w-px bg-destructive/40 z-10"
          style={{ left: `${todayPct}%` }}
        />
      )}

      {/* Month labels */}
      <div className="flex items-center h-5 text-[9px] text-muted-foreground mb-1 relative">
        {Array.from({ length: Math.ceil(totalDays / 30) + 1 }, (_, i) => {
          const date = new Date(minDate.getTime() + i * 30 * 86400000);
          const pct = (differenceInCalendarDays(date, minDate) / totalDays) * 100;
          if (pct > 100) return null;
          return (
            <span key={i} className="absolute font-medium" style={{ left: `${pct}%` }}>
              {format(date, "LLL", { locale: ru })}
            </span>
          );
        })}
      </div>

      {sorted.map((task) => {
        const start = task.start_at ? startOfDay(new Date(task.start_at)) : (task.deadline ? startOfDay(new Date(task.deadline)) : today);
        const end = task.deadline ? startOfDay(new Date(task.deadline)) : start;
        const leftDays = differenceInCalendarDays(start, minDate);
        const widthDays = Math.max(differenceInCalendarDays(end, start), 1);
        const leftPct = (leftDays / totalDays) * 100;
        const widthPct = Math.max((widthDays / totalDays) * 100, 2);
        const isOverdue = task.deadline && isPast(parseISO(task.deadline));
        const assignee = userMap.get(task.assigned_to || task.user_id);
        const assigneeName = assignee?.display_name || assignee?.email?.split("@")[0] || "";

        return (
          <div key={task.id} className="relative h-7 flex items-center group/bar">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "absolute h-5 rounded-md cursor-pointer transition-all hover:brightness-110 hover:shadow-sm flex items-center px-1.5 overflow-hidden",
                    isOverdue
                      ? "bg-destructive/20 border border-destructive/40"
                      : "bg-primary/15 border border-primary/30"
                  )}
                  style={{ left: `${Math.max(leftPct, 0)}%`, width: `${Math.min(widthPct, 100 - leftPct)}%` }}
                  onClick={() => onTaskClick?.(task.id)}
                >
                  <span className="text-[10px] truncate text-foreground/80 font-medium">{task.title}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[250px]">
                <p className="font-medium">{task.title}</p>
                {task.deadline && <p className="text-muted-foreground">{format(new Date(task.deadline), "d MMM yyyy", { locale: ru })}</p>}
                {assigneeName && <p className="text-muted-foreground">{assigneeName}</p>}
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })}

      {activeTasks.length > 20 && (
        <p className="text-[10px] text-muted-foreground text-center pt-1">
          +{activeTasks.length - 20} задач
        </p>
      )}
    </div>
  );
}

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import UserPicker from "@/components/UserPicker";
import {
  CheckCircle2, CalendarIcon, User, Link2, Expand,
} from "lucide-react";
import { format, isPast, parseISO, differenceInCalendarDays } from "date-fns";
import { ru } from "date-fns/locale";
import type { Task, Profile } from "./types";

interface MatrixTaskRowProps {
  task: Task;
  users: Profile[];
  allDependencies: any[];
  allTasks: Task[];
  projectGroupIds: Set<string>;
  onDeadlineChange: (task: Task, date: Date) => void;
  onAssigneeChange: (taskId: string, userId: string | null) => void;
  onToggle: (taskId: string) => void;
  onAddDependency: (predId: string, succId: string) => void;
  onExpand?: (taskId: string) => void;
}

function MatrixTaskRowInner({
  task, users, allDependencies, allTasks, projectGroupIds,
  onDeadlineChange, onAssigneeChange, onToggle, onAddDependency, onExpand,
}: MatrixTaskRowProps) {
  const isOverdue = !task.is_completed && task.deadline && isPast(parseISO(task.deadline));
  const hasDrift = task.original_deadline && task.deadline && task.original_deadline !== task.deadline;
  const driftDays = hasDrift
    ? differenceInCalendarDays(parseISO(task.deadline!), parseISO(task.original_deadline!))
    : 0;

  const assignee = users.find(u => u.id === task.assigned_to);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [depPickerOpen, setDepPickerOpen] = useState(false);

  const taskDeps = allDependencies.filter(
    d => d.predecessor_id === task.id || d.successor_id === task.id
  );

  return (
    <div className={cn(
      "group flex flex-col gap-0.5 px-1.5 py-1 rounded-md transition-colors min-w-0",
      task.is_completed ? "bg-muted/30" : isOverdue ? "bg-destructive/5" : "hover:bg-muted/40",
    )}>
      <div className="flex items-center gap-1 min-w-0">
        <button onClick={() => onToggle(task.id)} className="shrink-0">
          <CheckCircle2 className={cn(
            "h-3.5 w-3.5",
            task.is_completed ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"
          )} />
        </button>

        <span className={cn(
          "text-[11px] truncate flex-1 min-w-0",
          task.is_completed && "line-through text-muted-foreground",
          isOverdue && "text-destructive",
        )}>
          {task.title}
        </span>

        {hasDrift && driftDays !== 0 && (
          <span className={cn(
            "text-[8px] font-mono font-bold shrink-0 px-1 rounded",
            driftDays > 0 ? "text-destructive bg-destructive/10" : "text-primary bg-primary/10"
          )}>
            {driftDays > 0 ? `+${driftDays}д` : `${driftDays}д`}
          </span>
        )}

        {taskDeps.length > 0 && (
          <span className="text-[8px] text-primary shrink-0">
            <Link2 className="h-3 w-3" />
          </span>
        )}

        {onExpand && (
          <button
            onClick={() => onExpand(task.id)}
            className="shrink-0 text-muted-foreground/30 hover:text-foreground opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded"
            title="Открыть карточку"
          >
            <Expand className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className={cn(
        "flex items-center gap-1.5 pl-5 min-w-0",
        !task.deadline && !assignee ? "hidden group-hover:flex" : ""
      )}>
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <button className={cn(
              "shrink-0 text-[10px] px-1 py-0 rounded transition-colors",
              task.deadline
                ? isOverdue
                  ? "text-destructive font-medium"
                  : "text-muted-foreground hover:text-foreground"
                : "text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100"
            )}>
              {task.deadline
                ? format(parseISO(task.deadline), "d MMM", { locale: ru })
                : <CalendarIcon className="h-3 w-3" />
              }
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={task.deadline ? parseISO(task.deadline) : undefined}
              onSelect={(date) => {
                if (date) {
                  onDeadlineChange(task, date);
                  setCalOpen(false);
                }
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <UserPicker
          users={users}
          onSelect={(u) => onAssigneeChange(task.id, u.id)}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="Ответственный"
          trigger={
            <button className={cn(
              "shrink-0 text-[10px] px-1 py-0 rounded transition-colors max-w-[70px] truncate",
              assignee
                ? "text-foreground font-medium"
                : "text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100"
            )}>
              {assignee
                ? (assignee.display_name || "").split(" ")[0] || "👤"
                : <User className="h-3 w-3" />
              }
            </button>
          }
        />

        <Popover open={depPickerOpen} onOpenChange={setDepPickerOpen}>
          <PopoverTrigger asChild>
            <button className="shrink-0 text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded">
              <Link2 className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="end">
            <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">Выбрать преемника</p>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {allTasks
                .filter(t => t.id !== task.id && !t.is_completed && t.group_id && projectGroupIds.has(t.group_id))
                .slice(0, 30)
                .map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onAddDependency(task.id, t.id);
                      setDepPickerOpen(false);
                    }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors text-left"
                  >
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

const MatrixTaskRow = React.memo(MatrixTaskRowInner);
export default MatrixTaskRow;

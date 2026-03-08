import { useState } from "react";
import { type Task, type TaskGroup, useAvailableUsers } from "@/hooks/useTasks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Check, User, CalendarIcon, Flag, Trash2 } from "lucide-react";

interface GanttTaskPopoverProps {
  task: Task;
  project: TaskGroup;
  children: React.ReactNode;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
}

export default function GanttTaskPopover({ task, project, children, onUpdate, onToggle, onDelete, onOpenChange }: GanttTaskPopoverProps) {
  const [open, setOpen] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const { data: users = [] } = useAvailableUsers();

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    onOpenChange?.(v);
    if (!v) { setShowCal(false); setShowAssign(false); }
  };

  const priorities = [
    { value: null, label: "—", color: "text-muted-foreground" },
    { value: 1, label: "P1", color: "text-red-500" },
    { value: 2, label: "P2", color: "text-orange-500" },
    { value: 3, label: "P3", color: "text-yellow-500" },
  ];

  const assignee = users.find(u => u.id === task.assigned_to);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-2" align="start" side="bottom" sideOffset={8} avoidCollisions>
        {/* Title */}
        <div className="text-sm font-medium truncate">{task.title}</div>
        <div className="text-xs text-muted-foreground">
          {project.icon && project.icon !== "list" ? `${project.icon} ` : ""}{project.name}
        </div>

        <div className="h-px bg-border" />

        {/* Complete */}
        <button
          onClick={() => { onToggle(task.id, !task.is_completed); handleOpenChange(false); }}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
          {task.is_completed ? "Вернуть в работу" : "Завершить"}
        </button>

        {/* Deadline */}
        <div className="relative">
          <button
            onClick={() => setShowCal(!showCal)}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {task.deadline ? format(parseISO(task.deadline), "d MMM yyyy", { locale: ru }) : "Дедлайн"}
          </button>
          {showCal && (
            <div className="mt-1">
              <Calendar
                mode="single"
                selected={task.deadline ? parseISO(task.deadline) : undefined}
                onSelect={(date) => {
                  onUpdate(task.id, { deadline: date ? date.toISOString() : null });
                  setShowCal(false);
                }}
                locale={ru}
                className="rounded-md border"
              />
            </div>
          )}
        </div>

        {/* Priority */}
        <div className="flex items-center gap-1 px-2">
          <Flag className="h-3.5 w-3.5 text-muted-foreground mr-1" />
          {priorities.map(p => (
            <button
              key={String(p.value)}
              onClick={() => onUpdate(task.id, { priority: p.value as any })}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                task.priority === p.value ? "bg-primary/15 text-primary" : "hover:bg-muted text-muted-foreground"
              } ${p.color}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Assignee */}
        <div className="relative">
          <button
            onClick={() => setShowAssign(!showAssign)}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors"
          >
            <User className="h-3.5 w-3.5" />
            {assignee ? assignee.display_name || assignee.email : "Назначить"}
          </button>
          {showAssign && (
            <div className="mt-1 max-h-32 overflow-y-auto border rounded-md bg-popover">
              <button
                onClick={() => { onUpdate(task.id, { assigned_to: null }); setShowAssign(false); }}
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted text-muted-foreground"
              >
                Без назначения
              </button>
              {users.map(u => (
                <button
                  key={u.id}
                  onClick={() => { onUpdate(task.id, { assigned_to: u.id }); setShowAssign(false); }}
                  className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted ${task.assigned_to === u.id ? "bg-primary/10 text-primary" : ""}`}
                >
                  {u.display_name || u.email}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-px bg-border" />

        {/* Delete */}
        <button
          onClick={() => { onDelete(task.id); handleOpenChange(false); }}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Удалить
        </button>
      </PopoverContent>
    </Popover>
  );
}

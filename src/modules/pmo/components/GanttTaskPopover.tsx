import { useState } from "react";
import { type Task, type TaskGroup, useAvailableUsers } from "@/hooks/useTasks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import { format, parseISO, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { Check, User, CalendarIcon, Flag, Trash2 } from "lucide-react";
import UserPicker from "@/components/UserPicker";

// Преобразует выбранный в календаре день (local midnight) в стабильный ISO,
// фиксируя 12:00 UTC — чтобы во всех TZ отображался ровно тот же день.
function dayToStableISO(date: Date): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)).toISOString();
}

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
  const [daysInput, setDaysInput] = useState<number>(7);
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
  const baseDate = task.deadline ? parseISO(task.deadline) : new Date();

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
            <div className="mt-1 space-y-0">
              {/* Days input */}
              <div className="p-2.5 space-y-2 border rounded-t-md bg-background">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {task.deadline ? "+" : "Через"}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={daysInput}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(365, Number(e.target.value) || 1));
                      setDaysInput(v);
                    }}
                    className="w-12 h-6 text-xs text-center rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <span className="text-[10px] text-muted-foreground">дн.</span>
                  <span className="text-[9px] text-muted-foreground/60 ml-auto">
                    → {format(addDays(baseDate, daysInput), "d MMM", { locale: ru })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdate(task.id, { deadline: dayToStableISO(addDays(baseDate, daysInput)) });
                      setShowCal(false);
                    }}
                    className="text-[10px] px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    ОК
                  </button>
                </div>
                <Slider
                  min={1}
                  max={90}
                  step={1}
                  value={[Math.min(daysInput, 90)]}
                  onValueChange={([v]) => setDaysInput(v)}
                  className="w-full"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground/60">
                  <span>1д</span><span>30д</span><span>90д</span>
                </div>
              </div>
              <Calendar
                mode="single"
                selected={task.deadline ? parseISO(task.deadline) : undefined}
                onSelect={(date) => {
                  onUpdate(task.id, { deadline: date ? dayToStableISO(date) : null });
                  setShowCal(false);
                }}
                locale={ru}
                className="rounded-b-md border border-t-0 p-3 pointer-events-auto"
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
          <UserPicker
            users={users as any}
            open={showAssign}
            onOpenChange={setShowAssign}
            title="Ответственный"
            placeholder="Поиск (имя, @username, email)…"
            side="bottom"
            onSelect={(u) => onUpdate(task.id, { assigned_to: u.id })}
            trigger={
              <button
                onClick={() => setShowAssign(!showAssign)}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs hover:bg-muted transition-colors"
              >
                <User className="h-3.5 w-3.5" />
                {assignee ? assignee.display_name || assignee.email : "Назначить"}
              </button>
            }
          />
          {assignee && (
            <button
              onClick={() => onUpdate(task.id, { assigned_to: null })}
              className="mt-1 w-full text-left px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted rounded"
            >
              Снять назначение
            </button>
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

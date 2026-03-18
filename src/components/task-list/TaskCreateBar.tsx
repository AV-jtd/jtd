import { memo, type RefObject, useCallback, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Briefcase, CalendarIcon, Plus } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface TaskCreateBarProps {
  inputRef: RefObject<HTMLInputElement>;
  activeView: string;
  activeGroupId: string | null;
  onCreateTask: (payload: {
    title: string;
    group_id: string | null;
    deadline: string | null;
    task_type: "standard" | "crm";
    client_name?: string;
  }) => void;
}

function TaskCreateBar({ inputRef, activeView, activeGroupId, onCreateTask }: TaskCreateBarProps) {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [taskType, setTaskType] = useState<"standard" | "crm">("standard");
  const [clientName, setClientName] = useState("");

  const handleAddTask = useCallback(() => {
    if (!title.trim()) return;

    const isCrmTask = taskType === "crm";
    if (isCrmTask && !clientName.trim()) return;

    onCreateTask({
      title: title.trim(),
      group_id: activeView === "group" ? activeGroupId : null,
      deadline: deadline ? format(deadline, "yyyy-MM-dd") : null,
      task_type: taskType,
      client_name: isCrmTask ? clientName.trim() : undefined,
    });

    setTitle("");
    setDeadline(undefined);
    setTaskType("standard");
    setClientName("");
  }, [activeGroupId, activeView, clientName, deadline, onCreateTask, taskType, title]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleAddTask();
      }}
      className="mb-6 bg-card rounded-xl border border-border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all"
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="submit"
          disabled={!title.trim() || (taskType === "crm" && !clientName.trim())}
          className="h-8 w-8 rounded-full border-2 border-primary/30 flex items-center justify-center shrink-0 transition-all hover:border-primary hover:bg-primary/10 disabled:opacity-20 touch-manipulation"
        >
          <Plus className="h-4 w-4 text-primary" />
        </button>
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Добавить задачу...  (N)"
          enterKeyHint="done"
          className="border-0 shadow-none p-0 h-auto focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60"
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setTaskType((prev) => (prev === "standard" ? "crm" : "standard"));
              setClientName("");
            }}
            className={cn(
              "flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
              taskType === "crm"
                ? "border-red-500/30 bg-red-500/10 text-red-500"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
            )}
            title="Тип задачи: CRM"
          >
            <Briefcase className="h-3.5 w-3.5" />
            {taskType === "crm" ? "CRM" : ""}
          </button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                  deadline
                    ? "border-primary/30 bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {deadline ? format(deadline, "d MMM", { locale: ru }) : "Срок"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={deadline}
                onSelect={(date) => {
                  setDeadline(date);
                  setCalendarOpen(false);
                }}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {taskType === "crm" && (
        <div className="px-3 pb-3 pt-0">
          <div className="flex items-center gap-2 pl-11">
            <Briefcase className="h-3.5 w-3.5 text-red-500 shrink-0" />
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Название клиента..."
              className="border-0 shadow-none p-0 h-auto focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60"
            />
          </div>
          <p className="text-[10px] text-muted-foreground/60 pl-11 mt-1">
            Автоматически создаст тег и карточку клиента + шаги воронки
          </p>
        </div>
      )}
    </form>
  );
}

export default memo(TaskCreateBar);

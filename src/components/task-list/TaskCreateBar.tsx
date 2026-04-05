import { memo, type RefObject, type ReactNode, useCallback, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Briefcase, CalendarIcon, Plus, UserRound } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Profile } from "@/hooks/useTasks";

interface TaskCreateBarProps {
  inputRef: RefObject<HTMLInputElement>;
  activeView: string;
  activeGroupId: string | null;
  availableUsers?: Profile[];
  bulkButton?: ReactNode;
  onCreateTask: (payload: {
    title: string;
    group_id: string | null;
    deadline: string | null;
    assigned_to?: string | null;
    task_type: "standard" | "crm";
    client_name?: string;
  }) => void;
}

function TaskCreateBar({ inputRef, activeView, activeGroupId, availableUsers = [], bulkButton, onCreateTask }: TaskCreateBarProps) {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [taskType, setTaskType] = useState<"standard" | "crm">("standard");
  const [clientName, setClientName] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");

  const selectedUser = availableUsers.find(u => u.id === assignedTo);

  const filteredUsers = availableUsers.filter(u => {
    if (!assigneeSearch) return true;
    const q = assigneeSearch.toLowerCase();
    return (u.display_name || u.email || "").toLowerCase().includes(q);
  });

  const handleAddTask = useCallback(() => {
    if (!title.trim()) return;
    const isCrmTask = taskType === "crm";
    if (isCrmTask && !clientName.trim()) return;

    onCreateTask({
      title: title.trim(),
      group_id: activeView === "group" ? activeGroupId : null,
      deadline: deadline ? format(deadline, "yyyy-MM-dd") : null,
      assigned_to: assignedTo,
      task_type: taskType,
      client_name: isCrmTask ? clientName.trim() : undefined,
    });

    setTitle("");
    setDeadline(undefined);
    setTaskType("standard");
    setClientName("");
    setAssignedTo(null);
  }, [activeGroupId, activeView, assignedTo, clientName, deadline, onCreateTask, taskType, title]);

  const iconBtn = (active: boolean) =>
    cn(
      "h-8 w-8 flex items-center justify-center rounded-lg border transition-colors shrink-0",
      active
        ? "border-primary/30 bg-primary/10 text-primary"
        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleAddTask();
      }}
      className="mb-6 bg-card rounded-xl border border-border shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 transition-all"
    >
      <div className="flex items-center gap-2 p-3">
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
          className="border-0 shadow-none p-0 h-auto focus-visible:ring-0 text-sm placeholder:text-muted-foreground/60 min-w-0"
        />
        <div className="flex items-center gap-1 shrink-0">
          {/* CRM toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  setTaskType(prev => (prev === "standard" ? "crm" : "standard"));
                  setClientName("");
                }}
                className={iconBtn(taskType === "crm")}
              >
                <Briefcase className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Клиент (CRM)</TooltipContent>
          </Tooltip>

          {/* Assignee */}
          <Popover open={assigneeOpen} onOpenChange={setAssigneeOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button type="button" className={iconBtn(!!assignedTo)}>
                    {selectedUser ? (
                      <span className="text-[10px] font-bold leading-none">
                        {(selectedUser.display_name || selectedUser.email || "?").slice(0, 2).toUpperCase()}
                      </span>
                    ) : (
                      <UserRound className="h-3.5 w-3.5" />
                    )}
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {selectedUser ? (selectedUser.display_name || selectedUser.email) : "Ответственный"}
              </TooltipContent>
            </Tooltip>
            <PopoverContent className="w-56 p-2" align="end">
              <Input
                value={assigneeSearch}
                onChange={e => setAssigneeSearch(e.target.value)}
                placeholder="Поиск..."
                className="h-7 text-xs mb-1.5"
                autoFocus
              />
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {assignedTo && (
                  <button
                    type="button"
                    onClick={() => { setAssignedTo(null); setAssigneeOpen(false); setAssigneeSearch(""); }}
                    className="w-full text-left px-2 py-1.5 text-xs rounded-md hover:bg-muted text-muted-foreground"
                  >
                    Без ответственного
                  </button>
                )}
                {filteredUsers.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => { setAssignedTo(u.id); setAssigneeOpen(false); setAssigneeSearch(""); }}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-xs rounded-md hover:bg-muted transition-colors",
                      u.id === assignedTo && "bg-primary/10 text-primary"
                    )}
                  >
                    {u.display_name || u.email || u.id.slice(0, 8)}
                  </button>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Нет пользователей</p>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Deadline */}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button type="button" className={iconBtn(!!deadline)}>
                    {deadline ? (
                      <span className="text-[10px] font-bold leading-none">
                        {format(deadline, "d", { locale: ru })}
                      </span>
                    ) : (
                      <CalendarIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {deadline ? format(deadline, "d MMMM", { locale: ru }) : "Срок"}
              </TooltipContent>
            </Tooltip>
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

          {/* Bulk create slot */}
          {bulkButton}
        </div>
      </div>

      {/* CRM client name input */}
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

import { memo, type RefObject, type ReactNode, useCallback, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { ru } from "date-fns/locale";
import { Briefcase, CalendarIcon, Plus, UserRound, Sparkles } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Profile } from "@/hooks/useTasks";
import { parseQuickTask } from "@/lib/quickTaskParse";
import AssigneePicker, { type AssigneeSelection } from "@/components/AssigneePicker";
import AssigneeBadge from "@/components/AssigneeBadge";

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
    department_id?: string | null;
    contractor_id?: string | null;
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
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [daysInput, setDaysInput] = useState<number>(7);

  const selectedUser = availableUsers.find(u => u.id === assignedTo);

  // Live-парсинг title: распознаём @имя, до DD.MM, +Nд, ! → показываем чипы
  const parsed = useMemo(() => parseQuickTask(title, availableUsers), [title, availableUsers]);
  const hasInlineMeta = parsed.tokens.length > 0;
  // Эффективные значения с учётом inline-парсинга (inline имеет приоритет)
  const effectiveAssignee = parsed.assigneeId || assignedTo;
  const effectiveDeadline = parsed.deadline || deadline;

  const handleAddTask = useCallback(() => {
    if (!title.trim()) return;
    const cleanTitle = parsed.cleanTitle || title.trim();
    const finalDeadline = parsed.deadline || deadline;
    const finalAssignee = parsed.assigneeId || assignedTo;
    const isCrmTask = taskType === "crm";
    if (isCrmTask && !clientName.trim()) return;

    onCreateTask({
      title: cleanTitle,
      group_id: activeView === "group" ? activeGroupId : null,
      deadline: finalDeadline ? format(finalDeadline, "yyyy-MM-dd") : null,
      assigned_to: finalAssignee,
      department_id: finalAssignee ? null : departmentId,
      contractor_id: finalAssignee ? null : contractorId,
      task_type: taskType,
      client_name: isCrmTask ? clientName.trim() : undefined,
    });

    setTitle("");
    setDeadline(undefined);
    setTaskType("standard");
    setClientName("");
    setAssignedTo(null);
    setDepartmentId(null);
    setContractorId(null);
  }, [activeGroupId, activeView, assignedTo, departmentId, contractorId, clientName, deadline, onCreateTask, parsed, taskType, title]);

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
          <AssigneePicker
            users={availableUsers}
            current={
              effectiveAssignee
                ? { kind: "user", id: effectiveAssignee }
                : departmentId
                  ? { kind: "department", id: departmentId }
                  : contractorId
                    ? { kind: "contractor", id: contractorId }
                    : undefined
            }
            onSelect={(sel: AssigneeSelection) => {
              if (sel.kind === "user") {
                setAssignedTo(sel.id);
                setDepartmentId(null);
                setContractorId(null);
              } else if (sel.kind === "department") {
                setDepartmentId(sel.id);
                setAssignedTo(null);
                setContractorId(null);
              } else if (sel.kind === "contractor") {
                setContractorId(sel.id);
                setAssignedTo(null);
                setDepartmentId(null);
              } else {
                setAssignedTo(null);
                setDepartmentId(null);
                setContractorId(null);
              }
            }}
            open={assigneeOpen}
            onOpenChange={setAssigneeOpen}
            side="bottom"
            trigger={
              <button
                type="button"
                className={iconBtn(!!effectiveAssignee || !!departmentId || !!contractorId)}
                title={(() => {
                  const u = availableUsers.find(x => x.id === effectiveAssignee);
                  if (u) return u.display_name || u.email || "Ответственный";
                  if (departmentId) return "Отдел";
                  if (contractorId) return "Подрядчик";
                  return "Ответственный";
                })()}
              >
                    {(() => {
                      const u = availableUsers.find(x => x.id === effectiveAssignee);
                      if (u) {
                        return (
                          <span className="text-[10px] font-bold leading-none">
                            {(u.display_name || u.email || "?").slice(0, 2).toUpperCase()}
                          </span>
                        );
                      }
                      if (departmentId || contractorId) {
                        return <AssigneeBadge departmentId={departmentId} contractorId={contractorId} />;
                      }
                      return <UserRound className="h-3.5 w-3.5" />;
                    })()}
              </button>
            }
          />

          {/* Deadline */}
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button type="button" className={iconBtn(!!effectiveDeadline)}>
                    {effectiveDeadline ? (
                      <span className="text-[10px] font-bold leading-none">
                        {format(effectiveDeadline, "d", { locale: ru })}
                      </span>
                    ) : (
                      <CalendarIcon className="h-3.5 w-3.5" />
                    )}
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {effectiveDeadline ? format(effectiveDeadline, "d MMMM", { locale: ru }) : "Срок"}
              </TooltipContent>
            </Tooltip>
            <PopoverContent className="w-64 p-0" align="end">
              {/* Days input */}
              <div className="p-3 space-y-2 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">Через</span>
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
                    → {format(addDays(new Date(), daysInput), "d MMM", { locale: ru })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDeadline(addDays(new Date(), daysInput));
                      setCalendarOpen(false);
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

      {/* Inline-парсинг chip-bar */}
      {hasInlineMeta && (
        <div className="px-3 pb-2.5 -mt-1 flex items-center gap-1.5 flex-wrap">
          <Sparkles className="h-3 w-3 text-primary/60 shrink-0" />
          {parsed.tokens.map((tok, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
                tok.kind === "assignee" && "bg-primary/10 text-primary",
                tok.kind === "deadline" && "bg-blue-500/10 text-blue-600 dark:text-blue-400",
                tok.kind === "important" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                tok.kind === "tag" && "bg-muted text-muted-foreground"
              )}
            >
              {tok.label}
            </span>
          ))}
        </div>
      )}

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

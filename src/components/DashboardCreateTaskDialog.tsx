import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon, FolderOpen, Loader2, Plus, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AssigneePicker, { type AssigneeSelection } from "@/components/AssigneePicker";
import AssigneeBadge from "@/components/AssigneeBadge";
import { useTaskMutations, type Profile, type TaskGroup } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";

/**
 * Создание задачи с дашборда (просьба сотрудника 01.10.2026, задача «jtd Логи»).
 *
 * Главное здесь — то, без чего задачу не поставить: название, проект,
 * исполнитель (человек, отдел или подрядчик — зоны ответственности) и срок.
 * Остальное (описание, теги, участники, приоритет, шаги, чат) настраивается в
 * полной карточке задачи — она открывается сразу после создания (onCreated),
 * чтобы не держать второй, урезанный вариант той же карточки.
 */
export default function DashboardCreateTaskDialog({
  open,
  onOpenChange,
  groups,
  users,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  groups: TaskGroup[];
  users: Profile[];
  onCreated: (taskId: string) => void;
}) {
  const { addTask } = useTaskMutations();
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [assignee, setAssignee] = useState<AssigneeSelection | undefined>();
  const [deadline, setDeadline] = useState<Date | undefined>();
  const [projectOpen, setProjectOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const projects = useMemo(
    // Закрытые проекты не предлагаем — туда новых задач не ставят.
    () => groups.filter((g) => !g.closed_at).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [groups],
  );
  const project = groups.find((g) => g.id === groupId);

  const reset = () => {
    setTitle("");
    setGroupId(null);
    setAssignee(undefined);
    setDeadline(undefined);
  };

  const submit = async () => {
    if (!title.trim() || addTask.isPending) return;
    try {
      const created = await addTask.mutateAsync({
        title: title.trim(),
        group_id: groupId,
        deadline: deadline ? format(deadline, "yyyy-MM-dd") : null,
        assigned_to: assignee?.kind === "user" ? assignee.id : null,
        department_id: assignee?.kind === "department" ? assignee.id : null,
        contractor_id: assignee?.kind === "contractor" ? assignee.id : null,
        task_type: "standard",
      });
      reset();
      onOpenChange(false);
      if (created?.id) onCreated(created.id);
    } catch (e) {
      toast.error(`Не удалось создать задачу: ${(e as Error)?.message ?? e}`);
    }
  };

  const field = "h-9 justify-start gap-2 text-xs font-normal min-w-0";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Что нужно сделать?"
            className="text-sm"
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* Проект */}
            <Popover open={projectOpen} onOpenChange={setProjectOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className={field}>
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{project?.name ?? "Без проекта (Входящие)"}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-1" align="start">
                <PopoverSearchList
                  items={projects}
                  searchKey={(g) => g.name}
                  placeholder="Найти проект…"
                  threshold={0}
                  header={
                    <button
                      type="button"
                      onClick={() => { setGroupId(null); setProjectOpen(false); }}
                      className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                    >
                      Без проекта (Входящие)
                    </button>
                  }
                  renderItem={(g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => { setGroupId(g.id); setProjectOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                        g.id === groupId && "bg-muted font-medium",
                      )}
                    >
                      <span className="h-2.5 w-2.5 shrink-0 rounded" style={{ backgroundColor: g.color || "hsl(var(--primary))" }} />
                      <span className="truncate">{g.name}</span>
                    </button>
                  )}
                />
              </PopoverContent>
            </Popover>

            {/* Исполнитель: человек, отдел или подрядчик */}
            <AssigneePicker
              users={users}
              current={assignee}
              onSelect={(sel) => { setAssignee(sel.id ? sel : undefined); setAssigneeOpen(false); }}
              open={assigneeOpen}
              onOpenChange={setAssigneeOpen}
              trigger={
                <Button type="button" variant="outline" className={field}>
                  <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {assignee?.kind === "user" ? (
                    <span className="truncate">{users.find((u) => u.id === assignee.id)?.display_name ?? "Исполнитель"}</span>
                  ) : assignee?.id ? (
                    <AssigneeBadge
                      departmentId={assignee.kind === "department" ? assignee.id : null}
                      contractorId={assignee.kind === "contractor" ? assignee.id : null}
                    />
                  ) : (
                    <span className="truncate text-muted-foreground">Исполнитель — я</span>
                  )}
                </Button>
              }
            />
          </div>

          {/* Срок */}
          <div className="flex items-center gap-2">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className={cn(field, "flex-1")}>
                  <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {deadline ? format(deadline, "d MMMM yyyy, EEEEEE", { locale: ru }) : <span className="text-muted-foreground">Срок</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={deadline}
                  onSelect={(d) => { setDeadline(d); setCalendarOpen(false); }}
                  locale={ru}
                  weekStartsOn={1}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {deadline && (
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setDeadline(undefined)} aria-label="Снять срок">
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Описание, теги, участники, приоритет и шаги — в карточке задачи, она откроется сразу после создания.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" size="sm" disabled={!title.trim() || addTask.isPending} className="gap-1">
              {addTask.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Создать и открыть
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

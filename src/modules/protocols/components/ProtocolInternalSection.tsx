import { useMemo, useState } from "react";
import { format, isPast, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Lock, Plus, User2, Calendar, FolderOpen, AlertTriangle, Trash2, FileBarChart, Building2, HardHat,
  ChevronDown, ChevronRight, Maximize2,
} from "lucide-react";
import TaskItem from "@/components/TaskItem";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useTasks, useTaskMutations, useAvailableUsers, useTaskGroups, type Task, type Profile } from "@/hooks/useTasks";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { filterRealProjects } from "@/lib/projectFilters";
import AssigneePicker, { type AssigneeSelection } from "@/components/AssigneePicker";
import { useDepartments } from "@/hooks/useDepartments";
import { useContractors } from "@/hooks/useContractors";

type Props = {
  protocolId: string;
  /** When set, this internal section is rendered INSIDE an expanded external row (compact mode) */
  parentExternalTaskId?: string;
  /** Optional pre-filled project for new internal tasks (project_id from header) */
  defaultProjectId?: string | null;
  /** Optional pre-filled stream key (NPD) inherited from parent context */
  defaultStreamKey?: string | null;
  /** Optional participant user_ids to copy from parent context onto each new subtask */
  defaultParticipantIds?: string[];
  /** Optional subtitle shown under the header */
  subtitle?: string;
  /**
   * Visual variant.
   *  - "internal" (default): красная зона «не уходит партнёру» (для протоколов с внешней стороной).
   *  - "neutral": нейтральные подзадачи команды (используется в кросс-функциональных протоколах,
   *    где партнёра нет и говорить о «внутреннем» бессмысленно).
   */
  variant?: "internal" | "neutral";
  /** Override the section title (defaults depend on variant). */
  headerTitle?: string;
};

/**
 * Внутренний блок протокола (🔴 для команды Дороничей).
 * Не виден партнёру в экспорте, не попадает в CRM-доску.
 * Может рендериться:
 *  - на уровне протокола (под таблицей) — основной режим
 *  - внутри раскрытой внешней задачи (compact) — мини-триаж
 */
export default function ProtocolInternalSection({
  protocolId,
  parentExternalTaskId,
  defaultProjectId,
  defaultStreamKey,
  defaultParticipantIds,
  subtitle,
  variant = "internal",
  headerTitle,
}: Props) {
  const isNeutral = variant === "neutral";
  // Pass protocolId so draft (internal) tasks are visible inside the protocol page.
  const { data: allTasks = [] } = useTasks(protocolId);
  const { data: users = [] } = useAvailableUsers();
  const { data: groups = [] } = useTaskGroups();
  const { addTask, updateTask, toggleTask, deleteTask } = useTaskMutations();
  const isMobile = useIsMobile();

  const internalTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (t.group_id !== protocolId) return false;
      if ((t as any).protocol_scope !== "internal") return false;
      if (parentExternalTaskId) {
        return ((t.status_meta as any)?.parent_external_task_id) === parentExternalTaskId;
      }
      // Top-level internal (no parent external row)
      return !((t.status_meta as any)?.parent_external_task_id);
    });
  }, [allTasks, protocolId, parentExternalTaskId]);

  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<AssigneeSelection>({ kind: null, id: null });
  const [deadline, setDeadline] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId ?? null);
  // Collapsed state for the existing-tasks list (closed by default once any tasks exist)
  const [listOpen, setListOpen] = useState(false);
  // Whole section collapsed by default on mobile (or when nested in expanded external row)
  // to reduce visual noise on small screens.
  const [sectionOpen, setSectionOpen] = useState(!isMobile || !!parentExternalTaskId);

  const handleCreate = () => {
    const t = title.trim();
    if (!t) return;
    const meta: any = {};
    if (parentExternalTaskId) meta.parent_external_task_id = parentExternalTaskId;
    if (projectId) meta.linked_project_id = projectId;
    if (defaultStreamKey) meta.linked_stream_key = defaultStreamKey;

    addTask.mutate({
      title: t,
      group_id: protocolId,
      assigned_to: assignee.kind === "user" ? (assignee.id || undefined) : undefined,
      department_id: assignee.kind === "department" ? assignee.id : null,
      contractor_id: assignee.kind === "contractor" ? assignee.id : null,
      deadline: deadline || undefined,
      protocol_scope: "internal",
      status_meta: meta,
      source_protocol_id: protocolId,
    } as any, {
      onSuccess: async (created: any) => {
        // Inherit participants from parent context (if any).
        const ids = (defaultParticipantIds ?? []).filter(Boolean);
        if (created?.id && ids.length > 0) {
          try {
            const { supabase } = await import("@/integrations/supabase/client");
            await supabase.from("task_participants").upsert(
              ids.map((uid) => ({ task_id: created.id, user_id: uid, role: "participant" })),
              { onConflict: "task_id,user_id", ignoreDuplicates: true } as any,
            );
          } catch (e) {
            console.warn("Failed to inherit participants:", e);
          }
        }
      },
    });
    setTitle("");
    setAssignee({ kind: null, id: null });
    setDeadline(null);
    if (!parentExternalTaskId) setProjectId(defaultProjectId ?? null);
  };

  const compact = !!parentExternalTaskId;

  return (
    <section
      className={cn(
        "rounded-lg",
        isNeutral
          ? "border border-border/60 bg-muted/30"
          : "border-l-4 border-red-500/60 bg-red-500/5 dark:bg-red-500/[0.07]",
        compact ? "p-3" : "p-4 sm:p-5",
      )}
    >
      {/* Header — clickable to collapse the whole section */}
      <button
        type="button"
        onClick={() => setSectionOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        {sectionOpen ? (
          <ChevronDown className={cn(
            isNeutral ? "text-muted-foreground" : "text-red-600/70 dark:text-red-400/70",
            compact ? "h-3 w-3" : "h-3.5 w-3.5",
          )} />
        ) : (
          <ChevronRight className={cn(
            isNeutral ? "text-muted-foreground" : "text-red-600/70 dark:text-red-400/70",
            compact ? "h-3 w-3" : "h-3.5 w-3.5",
          )} />
        )}
        {!isNeutral && (
          <Lock className={cn("text-red-600 dark:text-red-400", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        )}
        <h3 className={cn(
          "font-semibold",
          isNeutral ? "text-foreground" : "text-red-700 dark:text-red-300",
          compact ? "text-xs" : "text-sm",
        )}>
          {headerTitle ?? (isNeutral ? "Подзадачи" : "Внутренние задачи")}
        </h3>
        {internalTasks.length > 0 && (
          <span className={cn(
            "rounded-full font-semibold tabular-nums",
            isNeutral
              ? "bg-muted text-muted-foreground"
              : "bg-red-500/15 text-red-700 dark:text-red-300",
            compact ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]",
          )}>
            {internalTasks.length}
          </span>
        )}
        {!isNeutral && (
          <span className={cn(
            "ml-auto rounded-full bg-red-500/10 font-medium uppercase tracking-wide text-red-700 dark:text-red-300",
            compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
          )}>
            не уходит партнёру
          </span>
        )}
      </button>

      {sectionOpen && (
        <>
          {/* Subtitle */}
          <p className={cn(
            "mb-3 mt-1",
            isNeutral ? "text-muted-foreground" : "text-red-700/70 dark:text-red-300/70",
            compact ? "text-[11px]" : "text-xs",
          )}>
            {subtitle ?? (isNeutral
              ? "Что нужно сделать команде по этому пункту. Автоматически наследуют выбранный выше контекст."
              : "Привязать задачу — то, что нужно сделать команде по итогам встречи. Партнёр этого не видит.")}
          </p>

          {/* Quick create — unified across modes */}
          <div className={cn(
            "flex flex-wrap items-center gap-2 rounded-md bg-card px-2 py-1.5",
            isNeutral ? "border border-border/60" : "border border-red-500/20",
          )}>
            <Plus className={cn(
              "h-3.5 w-3.5 shrink-0",
              isNeutral ? "text-muted-foreground" : "text-red-500/70",
            )} />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              placeholder="Привязать задачу (Enter)…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
            />
            <AssigneePickerChip users={users} value={assignee} onChange={setAssignee} />
            <DeadlineChip value={deadline} onChange={setDeadline} />
            <ProjectChip groups={groups} value={projectId} onChange={setProjectId} />
            <button
              onClick={handleCreate}
              disabled={!title.trim()}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition disabled:opacity-40",
                isNeutral
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-red-500 text-white hover:bg-red-600",
              )}
            >
              Добавить
            </button>
          </div>

          {/* Existing internal tasks — closed list under the input */}
          {internalTasks.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setListOpen((v) => !v)}
                className={cn(
                  "flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-medium transition-colors",
                  isNeutral
                    ? "text-muted-foreground hover:bg-muted"
                    : "text-red-700/80 hover:bg-red-500/5 dark:text-red-300/80",
                )}
              >
                {listOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Привязанные задачи · {internalTasks.length}
              </button>
              {listOpen && (
                <ul className="mt-1 space-y-1">
                  {internalTasks.map((t) => (
                    <InternalRow
                      key={t.id}
                      task={t}
                      users={users}
                      groups={groups as any[]}
                      onToggle={() => toggleTask.mutate({ id: t.id, is_completed: !t.is_completed })}
                      onUpdate={(patch) => updateTask.mutate({ id: t.id, ...patch })}
                      onDelete={() => deleteTask.mutate(t.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* -------------------------- Row -------------------------- */

function InternalRow({
  task, users, groups, onToggle, onUpdate, onDelete,
}: {
  task: Task;
  users: Profile[];
  groups: any[];
  onToggle: () => void;
  onUpdate: (patch: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const overdue = !task.is_completed && task.deadline && isPast(parseISO(task.deadline));
  const linkedProjectId = (task.status_meta as any)?.linked_project_id as string | undefined;
  const linkedProject = (groups as any[]).find((g) => g.id === linkedProjectId);
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <>
      <li className="flex items-center gap-2 rounded-md bg-card px-2 py-1.5 text-sm">
        <Checkbox
          checked={task.is_completed}
          onCheckedChange={onToggle}
          aria-label="Выполнено"
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            task.is_completed && "text-muted-foreground line-through",
          )}
          title={task.title}
        >
          {task.title}
        </span>

        <AssigneeChip
          users={users}
          value={task.assigned_to}
          onChange={(uid) => onUpdate({ assigned_to: uid })}
          compact
        />
        <AssigneePickerChip
          users={users}
          value={
            task.assigned_to
              ? { kind: "user", id: task.assigned_to }
              : (task as any).department_id
              ? { kind: "department", id: (task as any).department_id }
              : (task as any).contractor_id
              ? { kind: "contractor", id: (task as any).contractor_id }
              : { kind: null, id: null }
          }
          onChange={(sel) => {
            // Эксклюзивно: выбираем одно из трёх (или сбрасываем)
            const patch: any = {
              assigned_to: sel.kind === "user" ? sel.id : null,
              department_id: sel.kind === "department" ? sel.id : null,
              contractor_id: sel.kind === "contractor" ? sel.id : null,
            };
            onUpdate(patch);
          }}
        />
        <DeadlineChip
          value={task.deadline}
          overdue={!!overdue}
          onChange={(v) => onUpdate({ deadline: v })}
          compact
        />
        <ProjectChip
          groups={groups as any[]}
          value={linkedProjectId ?? null}
          onChange={(pid) => {
            const meta = { ...((task.status_meta as any) ?? {}) };
            if (pid) meta.linked_project_id = pid;
            else delete meta.linked_project_id;
            onUpdate({ status_meta: meta as any });
          }}
          compact
          currentLabel={linkedProject?.name}
        />
        <button
          onClick={() => setDetailsOpen(true)}
          className="rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
          aria-label="Раскрыть детали"
          title="Раскрыть детали (шаги, теги, описание, файлы)"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
        <button
          onClick={() => {
            if (confirm("Удалить внутреннюю задачу?")) onDelete();
          }}
          className="rounded p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
          aria-label="Удалить"
          title="Удалить"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </li>

      {/* Full task details — opens with all standard task features */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto p-4 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
            <span className="text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-300">
              Внутренняя задача · не уходит партнёру
            </span>
          </div>
          <TaskItem task={task} initialOpen sortable={false} />
        </SheetContent>
      </Sheet>
    </>
  );
}

/* -------------------------- Chips -------------------------- */

function AssigneePickerChip({
  users, value, onChange,
}: {
  users: Profile[];
  value: AssigneeSelection;
  onChange: (sel: AssigneeSelection) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: departments = [] } = useDepartments();
  const { data: contractors = [] } = useContractors();

  let label = "Кому";
  let Icon = User2;
  if (value.kind === "user" && value.id) {
    label = users.find((u) => u.id === value.id)?.display_name || "?";
  } else if (value.kind === "department" && value.id) {
    label = departments.find((d) => d.id === value.id)?.name || "Отдел";
    Icon = Building2;
  } else if (value.kind === "contractor" && value.id) {
    label = contractors.find((c) => c.id === value.id)?.name || "Подрядчик";
    Icon = HardHat;
  }

  return (
    <AssigneePicker
      users={users}
      current={value}
      onSelect={onChange}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs transition-colors hover:bg-muted",
            value.id ? "text-foreground" : "text-muted-foreground",
          )}
          title={label}
        >
          <Icon className="h-3 w-3" />
          <span className="max-w-[10rem] truncate">{label}</span>
        </button>
      }
    />
  );
}

function AssigneeChip({
  users, value, onChange, compact,
}: { users: Profile[]; value: string | null; onChange: (uid: string | null) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const current = users.find((u) => u.id === value);
  const filtered = users.filter((u) =>
    !search.trim() || (u.display_name || "").toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs transition-colors hover:bg-muted",
            current ? "text-foreground" : "text-muted-foreground",
            compact && "px-1.5",
          )}
          title={current?.display_name || "Назначить"}
        >
          <User2 className="h-3 w-3" />
          <span className="max-w-[8rem] truncate">{current?.display_name || (compact ? "—" : "Кому")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск…" className="mb-2 h-7 text-xs" />
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {value && (
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="block w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              Снять ответственного
            </button>
          )}
          {filtered.map((u) => (
            <button
              key={u.id}
              onClick={() => { onChange(u.id); setOpen(false); }}
              className={cn(
                "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                u.id === value && "bg-primary/10 text-primary",
              )}
            >
              {u.display_name || "Без имени"}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">Не найдено</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DeadlineChip({
  value, overdue, onChange, compact,
}: { value: string | null; overdue?: boolean; onChange: (v: string | null) => void; compact?: boolean }) {
  const display = value ? format(parseISO(value), "d MMM", { locale: ru }) : compact ? "—" : "Срок";
  return (
    <label
      className={cn(
        "relative inline-flex cursor-pointer items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs transition-colors hover:bg-muted",
        overdue && "border-destructive/40 bg-destructive/10 text-destructive",
        compact && "px-1.5",
      )}
      title={display}
    >
      {overdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
      {display}
      <input
        type="date"
        value={value ? value.slice(0, 10) : ""}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function ProjectChip({
  groups, value, onChange, compact, currentLabel,
}: {
  groups: any[];
  value: string | null;
  onChange: (pid: string | null) => void;
  compact?: boolean;
  currentLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Только реальные проекты: без протоколов, архива и служебных NPD-стрим-подпроектов.
  const projects = filterRealProjects(groups as any[]);
  const filtered = projects.filter((g: any) =>
    !search.trim() || g.name.toLowerCase().includes(search.toLowerCase()),
  );
  const current = currentLabel || projects.find((g: any) => g.id === value)?.name;

  // Recently selected project (per-user, persisted in localStorage)
  const [recentId, setRecentId] = useState<string | null>(() => {
    try { return localStorage.getItem("protocol:lastProjectId"); } catch { return null; }
  });
  const recent = recentId && recentId !== value
    ? projects.find((g: any) => g.id === recentId)
    : null;

  const pick = (pid: string | null) => {
    if (pid) {
      try { localStorage.setItem("protocol:lastProjectId", pid); } catch { /* noop */ }
      setRecentId(pid);
    }
    onChange(pid);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs transition-colors hover:bg-muted",
            current ? "text-foreground" : "text-muted-foreground",
            compact && "px-1.5",
          )}
          title={current ? `Проект: ${current}` : "Привязать проект"}
        >
          <FolderOpen className="h-3 w-3" />
          <span className="max-w-[8rem] truncate">{current || (compact ? "—" : "Проект")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск проекта…" className="mb-2 h-7 text-xs" />
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {value && (
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="block w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              Без привязки
            </button>
          )}
          {recent && !search.trim() && (
            <>
              <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                Недавнее
              </div>
              <button
                onClick={() => pick(recent.id)}
                className={cn(
                  "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                  recent.id === value && "bg-primary/10 text-primary",
                )}
              >
                {recent.icon && recent.icon !== "list" ? `${recent.icon} ` : ""}{recent.name}
              </button>
              <div className="my-1 border-t border-border/60" />
            </>
          )}
          {filtered.map((g: any) => (
            <button
              key={g.id}
              onClick={() => pick(g.id)}
              className={cn(
                "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                g.id === value && "bg-primary/10 text-primary",
              )}
            >
              {g.icon && g.icon !== "list" ? `${g.icon} ` : ""}{g.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">Нет проектов</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* -------------------------- CRM Report Placeholder -------------------------- */

export function CrmReportPlaceholder() {
  return (
    <section className="rounded-lg border border-dashed border-border bg-muted/30 p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <FileBarChart className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">CRM-отчёт по встрече</h3>
        <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
          скоро
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Здесь будет структурированный отчёт по итогам встречи с клиентом: резюме, договорённости, возражения, следующие шаги. Пойдёт в карточку клиента CRM как «Историю взаимодействий».
      </p>
    </section>
  );
}

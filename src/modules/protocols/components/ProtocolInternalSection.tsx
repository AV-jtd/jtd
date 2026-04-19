import { useMemo, useState } from "react";
import { format, isPast, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Lock, Plus, User2, Calendar, FolderOpen, AlertTriangle, Trash2, FileBarChart,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { useTasks, useTaskMutations, useAvailableUsers, useTaskGroups, type Task, type Profile } from "@/hooks/useTasks";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  protocolId: string;
  /** When set, this internal section is rendered INSIDE an expanded external row (compact mode) */
  parentExternalTaskId?: string;
  /** Optional pre-filled project for new internal tasks (project_id from header) */
  defaultProjectId?: string | null;
  /** Optional subtitle shown under the header */
  subtitle?: string;
};

/**
 * Внутренний блок протокола (🔴 для команды Дороничей).
 * Не виден партнёру в экспорте, не попадает в CRM-доску.
 * Может рендериться:
 *  - на уровне протокола (под таблицей) — основной режим
 *  - внутри раскрытой внешней задачи (compact) — мини-триаж
 */
export default function ProtocolInternalSection({ protocolId, parentExternalTaskId, defaultProjectId, subtitle }: Props) {
  const { data: allTasks = [] } = useTasks();
  const { data: users = [] } = useAvailableUsers();
  const { data: groups = [] } = useTaskGroups();
  const { addTask, updateTask, toggleTask, deleteTask } = useTaskMutations();

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
  const [assignee, setAssignee] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId ?? null);
  // Collapsed state for the existing-tasks list (closed by default once any tasks exist)
  const [listOpen, setListOpen] = useState(false);

  const handleCreate = () => {
    const t = title.trim();
    if (!t) return;
    const meta: any = {};
    if (parentExternalTaskId) meta.parent_external_task_id = parentExternalTaskId;
    if (projectId) meta.linked_project_id = projectId;

    addTask.mutate({
      title: t,
      group_id: protocolId,
      assigned_to: assignee || undefined,
      deadline: deadline || undefined,
      protocol_scope: "internal",
      status_meta: meta,
      source_protocol_id: protocolId,
    } as any);
    setTitle("");
    setAssignee(null);
    setDeadline(null);
    if (!parentExternalTaskId) setProjectId(defaultProjectId ?? null);
  };

  const compact = !!parentExternalTaskId;

  return (
    <section
      className={cn(
        "rounded-lg border-l-4 border-red-500/60 bg-red-500/5 dark:bg-red-500/[0.07]",
        compact ? "p-3" : "p-4 sm:p-5",
      )}
    >
      {/* Header — unified across all rendering contexts */}
      <div className="flex items-center gap-2">
        <Lock className={cn("text-red-600 dark:text-red-400", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        <h3 className={cn("font-semibold text-red-700 dark:text-red-300", compact ? "text-xs" : "text-sm")}>
          Внутренние задачи
        </h3>
        <span className={cn(
          "ml-auto rounded-full bg-red-500/10 font-medium uppercase tracking-wide text-red-700 dark:text-red-300",
          compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
        )}>
          не уходит партнёру
        </span>
      </div>

      {/* Subtitle */}
      <p className={cn(
        "mb-3 mt-1 text-red-700/70 dark:text-red-300/70",
        compact ? "text-[11px]" : "text-xs",
      )}>
        {subtitle ?? "Привязать задачу — то, что нужно сделать команде по итогам встречи. Партнёр этого не видит."}
      </p>

      {/* Quick create — unified across modes */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-500/20 bg-card px-2 py-1.5">
        <Plus className="h-3.5 w-3.5 shrink-0 text-red-500/70" />
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
        <AssigneeChip users={users} value={assignee} onChange={setAssignee} />
        <DeadlineChip value={deadline} onChange={setDeadline} />
        <ProjectChip groups={groups} value={projectId} onChange={setProjectId} />
        <button
          onClick={handleCreate}
          disabled={!title.trim()}
          className="rounded bg-red-500 px-2 py-1 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-40"
        >
          Добавить
        </button>
      </div>

      {/* Existing internal tasks — closed list under the input */}
      {internalTasks.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setListOpen((v) => !v)}
            className="flex w-full items-center gap-1 rounded px-1 py-1 text-[11px] font-medium text-red-700/80 transition-colors hover:bg-red-500/5 dark:text-red-300/80"
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

  return (
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
  );
}

/* -------------------------- Chips -------------------------- */

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
  // Exclude protocol-typed groups, only standard/CRM/NPD projects
  const projects = (groups || []).filter((g: any) => g.project_type !== "protocol" && !g.closed_at);
  const filtered = projects.filter((g: any) =>
    !search.trim() || g.name.toLowerCase().includes(search.toLowerCase()),
  );
  const current = currentLabel || projects.find((g: any) => g.id === value)?.name;
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
          {filtered.map((g: any) => (
            <button
              key={g.id}
              onClick={() => { onChange(g.id); setOpen(false); }}
              className={cn(
                "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted",
                g.id === value && "bg-primary/10 text-primary",
              )}
            >
              {g.icon ? `${g.icon} ` : ""}{g.name}
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

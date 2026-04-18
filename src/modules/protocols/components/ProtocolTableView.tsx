import { useMemo, useState, useRef, KeyboardEvent } from "react";
import { useTasks, useTaskMutations, useAvailableUsers, useTaskGroups, type Task, type Profile } from "@/hooks/useTasks";
import { useProtocolStatuses, type ProtocolStatusTag } from "@/hooks/useProtocolStatuses";
import { useSetTaskStatus } from "@/hooks/useSetTaskStatus";
import { format, isPast, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import {
  CheckCircle2, Clock, AlertTriangle, ListChecks, Plus, ChevronDown, ChevronUp,
  ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Filter, User2, Calendar, FolderOpen, Loader2,
  Building2, Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

type Props = { protocolId: string };

type SmartFilter = "all" | "active" | "overdue" | "completed" | "unassigned";

type SortKey = "index" | "title" | "assignee" | "deadline" | "project" | "status";
type SortDir = "asc" | "desc" | null;

export default function ProtocolTableView({ protocolId }: Props) {
  const { data: allTasks = [], isLoading } = useTasks();
  const { data: groups = [] } = useTaskGroups();
  const { data: users = [] } = useAvailableUsers();
  const { data: statuses = [] } = useProtocolStatuses();
  const { addTask, updateTask, toggleTask, deleteTask } = useTaskMutations();
  const setStatus = useSetTaskStatus();

  const protocol = useMemo(() => groups.find((g) => g.id === protocolId), [groups, protocolId]);
  const isProtocolDraft = (protocol as any)?.draft_status === "draft";
  const externalAttendees: Array<{ name: string; organization?: string; role?: string }> =
    ((protocol as any)?.protocol_meta?.external_attendees as any[]) ?? [];

  const tasks = useMemo(
    () => allTasks.filter((t) => t.group_id === protocolId),
    [allTasks, protocolId],
  );

  const allStatusTagIds = useMemo(() => statuses.map((s) => s.id), [statuses]);

  // ---------- Smart filter ----------
  const [smart, setSmart] = useState<SmartFilter>("all");

  const metrics = useMemo(() => {
    const all = tasks.length;
    const completed = tasks.filter((t) => t.is_completed).length;
    const active = all - completed;
    const overdue = tasks.filter(
      (t) => !t.is_completed && t.deadline && isPast(parseISO(t.deadline)),
    ).length;
    const unassigned = tasks.filter((t) => !t.is_completed && !t.assigned_to).length;
    return { all, active, completed, overdue, unassigned };
  }, [tasks]);

  // ---------- Column filters ----------
  const [assigneeFilter, setAssigneeFilter] = useState<Set<string>>(new Set());
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set());

  // ---------- Sort ----------
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    setSortDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
  };

  // ---------- Filtered + sorted rows ----------
  const filtered = useMemo(() => {
    let rows = tasks.slice();

    // Smart filter
    if (smart === "active") rows = rows.filter((t) => !t.is_completed);
    else if (smart === "completed") rows = rows.filter((t) => t.is_completed);
    else if (smart === "overdue")
      rows = rows.filter((t) => !t.is_completed && t.deadline && isPast(parseISO(t.deadline)));
    else if (smart === "unassigned")
      rows = rows.filter((t) => !t.is_completed && !t.assigned_to);

    // Column filters
    if (assigneeFilter.size > 0) {
      rows = rows.filter((t) => {
        const key = t.assigned_to ?? "__none__";
        return assigneeFilter.has(key);
      });
    }
    if (projectFilter.size > 0) {
      rows = rows.filter((t) => {
        // If task has a sub-project tag... we treat group_id as protocol itself, but
        // for "linked project" the user assigns through tags or moves task. For MVP,
        // treat "project" as task.group_id of source_protocol_id... using group_id only.
        return projectFilter.has(t.group_id ?? "__none__");
      });
    }

    return rows;
  }, [tasks, smart, assigneeFilter, projectFilter]);

  const sorted = useMemo(() => {
    if (!sortDir || sortKey === "index") {
      return filtered.slice().sort((a, b) => a.position - b.position);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortKey === "title") { av = a.title.toLowerCase(); bv = b.title.toLowerCase(); }
      else if (sortKey === "assignee") {
        av = userName(users, a.assigned_to);
        bv = userName(users, b.assigned_to);
      } else if (sortKey === "deadline") {
        av = a.deadline ? +parseISO(a.deadline) : Number.POSITIVE_INFINITY;
        bv = b.deadline ? +parseISO(b.deadline) : Number.POSITIVE_INFINITY;
      } else if (sortKey === "status") {
        av = a.is_completed ? 1 : 0;
        bv = b.is_completed ? 1 : 0;
      }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [filtered, sortKey, sortDir, users]);

  // ---------- Inline create ----------
  const [newTitle, setNewTitle] = useState("");
  const handleCreate = () => {
    const title = newTitle.trim();
    if (!title) return;
    addTask.mutate({ title, group_id: protocolId, is_draft: isProtocolDraft });
    setNewTitle("");
  };

  // ---------- Expanded row ----------
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ---------- Filter option lists ----------
  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string }[] = [];
    let hasUnassigned = false;
    for (const t of tasks) {
      if (!t.assigned_to) hasUnassigned = true;
      else if (!seen.has(t.assigned_to)) {
        seen.add(t.assigned_to);
        list.push({ id: t.assigned_to, name: userName(users, t.assigned_to) });
      }
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    if (hasUnassigned) list.unshift({ id: "__none__", name: "Без ответственного" });
    return list;
  }, [tasks, users]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загрузка строк протокола…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Smart-filter metric cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <MetricCard
          icon={ListChecks}
          label="Всего"
          value={metrics.all}
          active={smart === "all"}
          onClick={() => setSmart("all")}
          tone="neutral"
        />
        <MetricCard
          icon={Clock}
          label="В работе"
          value={metrics.active}
          active={smart === "active"}
          onClick={() => setSmart("active")}
          tone="info"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Просрочено"
          value={metrics.overdue}
          active={smart === "overdue"}
          onClick={() => setSmart("overdue")}
          tone="danger"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Завершено"
          value={metrics.completed}
          active={smart === "completed"}
          onClick={() => setSmart("completed")}
          tone="success"
        />
        <MetricCard
          icon={User2}
          label="Без отв."
          value={metrics.unassigned}
          active={smart === "unassigned"}
          onClick={() => setSmart("unassigned")}
          tone="warning"
        />
      </div>

      {/* Active column filter chips */}
      {(assigneeFilter.size > 0 || projectFilter.size > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Фильтры:</span>
          {assigneeFilter.size > 0 && (
            <FilterChip
              label={`Ответственный: ${assigneeFilter.size}`}
              onClear={() => setAssigneeFilter(new Set())}
            />
          )}
          {projectFilter.size > 0 && (
            <FilterChip
              label={`Проект: ${projectFilter.size}`}
              onClear={() => setProjectFilter(new Set())}
            />
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/50 backdrop-blur">
              <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                <Th className="w-12 text-center">
                  <SortHeader label="№" active={sortKey === "index"} dir={sortDir} onClick={() => toggleSort("index")} />
                </Th>
                <Th className="w-8" />
                <Th>
                  <SortHeader
                    label="Наименование"
                    active={sortKey === "title"}
                    dir={sortDir}
                    onClick={() => toggleSort("title")}
                  />
                </Th>
                <Th className="w-48">
                  <div className="flex items-center gap-1">
                    <SortHeader
                      label="Ответственный"
                      active={sortKey === "assignee"}
                      dir={sortDir}
                      onClick={() => toggleSort("assignee")}
                    />
                    <ColumnFilterPopover
                      options={assigneeOptions.map((o) => ({ value: o.id, label: o.name }))}
                      selected={assigneeFilter}
                      onChange={setAssigneeFilter}
                    />
                  </div>
                </Th>
                <Th className="w-36">
                  <SortHeader
                    label="Срок"
                    active={sortKey === "deadline"}
                    dir={sortDir}
                    onClick={() => toggleSort("deadline")}
                  />
                </Th>
                <Th className="w-44 text-center">
                  <SortHeader
                    label="Статус"
                    active={sortKey === "status"}
                    dir={sortDir}
                    onClick={() => toggleSort("status")}
                  />
                </Th>
                <Th className="w-12 text-center" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                    {tasks.length === 0
                      ? "Пока пусто. Добавьте первую строку протокола ниже."
                      : "Под текущие фильтры строк нет."}
                  </td>
                </tr>
              ) : (
                sorted.map((task, idx) => (
                  <ProtocolRow
                    key={task.id}
                    task={task}
                    index={idx + 1}
                    users={users}
                    statuses={statuses}
                    allStatusTagIds={allStatusTagIds}
                    externalAttendees={externalAttendees}
                    expanded={expandedId === task.id}
                    onToggleExpand={() =>
                      setExpandedId((e) => (e === task.id ? null : task.id))
                    }
                    onToggleComplete={() =>
                      toggleTask.mutate({ id: task.id, is_completed: !task.is_completed })
                    }
                    onChangeStatus={(tag) => {
                      setStatus.mutate({
                        taskId: task.id,
                        newTagId: tag?.id ?? null,
                        newTagName: tag?.name ?? null,
                        allStatusTagIds,
                        currentStatusMeta: (task.status_meta as any) ?? null,
                      });
                      const isFinal = tag?.name?.includes("Завершено") || tag?.name?.includes("Отменено");
                      if (isFinal && !task.is_completed) {
                        toggleTask.mutate({ id: task.id, is_completed: true });
                      } else if (!isFinal && task.is_completed && tag) {
                        toggleTask.mutate({ id: task.id, is_completed: false });
                      }
                    }}
                    onUpdate={(patch) => updateTask.mutate({ id: task.id, ...patch })}
                    onDelete={() => deleteTask.mutate(task.id)}
                  />
                ))
              )}

              {/* Inline add row */}
              <tr className="border-t border-border bg-muted/20">
                <td className="px-2 py-2 text-center text-muted-foreground">
                  <Plus className="mx-auto h-3.5 w-3.5" />
                </td>
                <td />
                <td className="px-3 py-2" colSpan={5}>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreate();
                      }
                    }}
                    onBlur={() => {
                      if (newTitle.trim()) handleCreate();
                    }}
                    placeholder="Добавить строку протокола (Enter)…"
                    className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ----------------------- Row ----------------------- */

function ProtocolRow({
  task, index, users, statuses, allStatusTagIds, externalAttendees,
  expanded, onToggleExpand, onToggleComplete, onChangeStatus, onUpdate, onDelete,
}: {
  task: Task;
  index: number;
  users: Profile[];
  statuses: ProtocolStatusTag[];
  allStatusTagIds: string[];
  externalAttendees: Array<{ name: string; organization?: string; role?: string }>;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleComplete: () => void;
  onChangeStatus: (tag: ProtocolStatusTag | null) => void;
  onUpdate: (patch: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const overdue = !task.is_completed && task.deadline && isPast(parseISO(task.deadline));
  const drift =
    task.deadline &&
    task.original_deadline &&
    parseISO(task.deadline).getTime() !== parseISO(task.original_deadline).getTime();

  const [editTitle, setEditTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(task.title);

  const taskTagIds = useMemo(
    () => new Set((task.task_tags ?? []).map((tt) => tt.tag_id)),
    [task.task_tags],
  );
  const currentStatus = useMemo(
    () => statuses.find((s) => taskTagIds.has(s.id)) ?? null,
    [statuses, taskTagIds],
  );
  const sentAt = (task.status_meta as any)?.sent_at as string | undefined;

  const externalRef = (task.external_assignee as any) as
    | { name?: string; organization?: string; role?: string }
    | null;

  const commitTitle = () => {
    setEditTitle(false);
    const t = titleVal.trim();
    if (!t || t === task.title) {
      setTitleVal(task.title);
      return;
    }
    onUpdate({ title: t });
  };

  return (
    <>
      <tr
        className={cn(
          "border-b border-border/60 transition-colors hover:bg-muted/30",
          task.is_completed && "opacity-60",
          expanded && "bg-muted/40",
        )}
      >
        <td className="px-2 py-2 text-center text-xs tabular-nums text-muted-foreground">
          {index}
        </td>
        <td className="px-1 py-2">
          <button
            onClick={onToggleExpand}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={expanded ? "Свернуть" : "Развернуть"}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </td>
        <td className="px-3 py-2">
          {editTitle ? (
            <input
              autoFocus
              value={titleVal}
              onChange={(e) => setTitleVal(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
                if (e.key === "Escape") { setTitleVal(task.title); setEditTitle(false); }
              }}
              className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <button
              onClick={() => setEditTitle(true)}
              className={cn(
                "block w-full text-left text-sm text-foreground hover:underline",
                task.is_completed && "line-through text-muted-foreground",
              )}
            >
              {task.title}
            </button>
          )}
        </td>
        <td className="px-3 py-2">
          <AssigneePicker
            users={users}
            value={task.assigned_to}
            externalValue={externalRef}
            externalOptions={externalAttendees}
            onChange={(uid) => onUpdate({ assigned_to: uid, external_assignee: null as any })}
            onChangeExternal={(ext) =>
              onUpdate({ assigned_to: null, external_assignee: (ext as any) })
            }
          />
        </td>
        <td className="px-3 py-2">
          <DeadlineCell
            value={task.deadline}
            overdue={!!overdue}
            drift={!!drift}
            onChange={(v) => onUpdate({ deadline: v })}
          />
        </td>
        <td className="px-3 py-2 text-center">
          <StatusPicker
            statuses={statuses}
            value={currentStatus}
            sentAt={sentAt ?? null}
            onChange={onChangeStatus}
          />
        </td>
        <td className="px-2 py-2 text-center">
          <Checkbox
            checked={task.is_completed}
            onCheckedChange={() => onToggleComplete()}
            aria-label="Закрыто"
          />
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                  Описание
                </div>
                <textarea
                  defaultValue={task.description ?? ""}
                  placeholder="Контекст вопроса, обсуждение, аргументы…"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (task.description ?? "")) onUpdate({ description: v || null });
                  }}
                  className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                  Решение / Результат
                </div>
                <textarea
                  defaultValue={task.closure_result ?? ""}
                  placeholder="Принятое решение, ответ исполнителя…"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (task.closure_result ?? ""))
                      onUpdate({ closure_result: v || null });
                  }}
                  className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end">
              <button
                onClick={() => {
                  if (confirm("Удалить строку протокола?")) onDelete();
                }}
                className="text-xs font-medium text-destructive hover:underline"
              >
                Удалить строку
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ----------------------- Cells ----------------------- */

function AssigneePicker({
  users, value, onChange,
}: {
  users: Profile[];
  value: string | null;
  onChange: (uid: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const current = users.find((u) => u.id === value);
  const filtered = users.filter((u) =>
    !search.trim() || u.display_name?.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
            current
              ? "bg-primary/10 text-primary hover:bg-primary/15"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          <User2 className="h-3 w-3" />
          {current ? current.display_name || "Без имени" : "Назначить"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск…"
          className="mb-2 h-7 text-xs"
        />
        <div className="max-h-48 space-y-0.5 overflow-y-auto">
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
                "block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted",
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

function DeadlineCell({
  value, overdue, drift, onChange,
}: {
  value: string | null;
  overdue: boolean;
  drift: boolean;
  onChange: (v: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const display = value ? format(parseISO(value), "d MMM", { locale: ru }) : "Срок";
  return (
    <button
      onClick={() => ref.current?.showPicker?.() ?? ref.current?.focus()}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
        value
          ? overdue
            ? "bg-destructive/10 font-medium text-destructive"
            : drift
              ? "border border-dashed border-amber-500/60 text-amber-600 dark:text-amber-400"
              : "bg-muted text-foreground hover:bg-muted/70"
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      {overdue ? (
        <AlertTriangle className="h-3 w-3" />
      ) : drift ? (
        <ArrowUp className="h-3 w-3 rotate-45" />
      ) : (
        <Calendar className="h-3 w-3" />
      )}
      {display}
      <input
        ref={ref}
        type="date"
        value={value ? value.slice(0, 10) : ""}
        onChange={(e) =>
          onChange(e.target.value ? new Date(e.target.value).toISOString() : null)
        }
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </button>
  );
}

/* ----------------------- Helpers ----------------------- */

function userName(users: Profile[], uid: string | null) {
  if (!uid) return "";
  return users.find((u) => u.id === uid)?.display_name || "Без имени";
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-3 py-2 text-left font-medium", className)}>{children}</th>
  );
}

function SortHeader({
  label, active, dir, onClick,
}: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  const Icon = !active || !dir ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs transition-colors hover:bg-muted",
        active && dir && "text-foreground",
      )}
    >
      {label}
      <Icon className="h-3 w-3" />
    </button>
  );
}

function MetricCard({
  icon: Icon, label, value, active, onClick, tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
  tone: "neutral" | "info" | "success" | "danger" | "warning";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "text-foreground",
    info: "text-blue-600 dark:text-blue-400",
    success: "text-emerald-600 dark:text-emerald-400",
    danger: "text-destructive",
    warning: "text-amber-600 dark:text-amber-400",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-all",
        active
          ? "border-primary shadow-sm ring-2 ring-primary/20"
          : "border-border hover:border-primary/40 hover:shadow-sm",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className={cn("h-3.5 w-3.5", toneClasses[tone])} />
        {label}
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums", toneClasses[tone])}>
        {value}
      </div>
    </button>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {label}
      <button onClick={onClear} className="ml-0.5 hover:text-primary/70" aria-label="Сбросить">
        ×
      </button>
    </span>
  );
}

function ColumnFilterPopover({
  options, selected, onChange,
}: {
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground",
            selected.size > 0 && "text-primary",
          )}
          aria-label="Фильтр колонки"
        >
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">Фильтр</span>
          {selected.size > 0 && (
            <button
              onClick={() => onChange(new Set())}
              className="text-primary hover:underline"
            >
              Сбросить
            </button>
          )}
        </div>
        <div className="max-h-56 space-y-0.5 overflow-y-auto">
          {options.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">Нет значений</div>
          )}
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted"
            >
              <Checkbox
                checked={selected.has(o.value)}
                onCheckedChange={() => toggle(o.value)}
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CalendarClock,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ListChecks,
  CalendarRange,
  CircleDashed,
  Stamp,
  Star,
  Check,
  CalendarPlus,
  UserPlus,
  X,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import AssigneePicker, { type AssigneeSelection } from "@/components/AssigneePicker";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useAvailableUsers, type Profile } from "@/hooks/useTasks";
import { useMyTasksDashboard, todayBounds, type MyTask } from "@/hooks/useMyTasksDashboard";
import { formatDistanceToNowStrict, isToday } from "date-fns";
import { ru } from "date-fns/locale";

type BlockKey = "overdue" | "today" | "important" | "week" | "noDeadline" | "unread" | "approval" | "toMe" | "byMe";
type Scope = "involved" | "assignee";

const SCOPE_KEY = "mytasks_scope";
const EXPANDED_KEY = "mytasks_expanded";

const BLOCK_META: Record<
  BlockKey,
  { label: string; icon: typeof AlertTriangle; tone: string; ring: string }
> = {
  overdue: { label: "Просрочено", icon: AlertTriangle, tone: "text-destructive", ring: "bg-destructive/10" },
  today: { label: "Сегодня", icon: CalendarClock, tone: "text-tag-orange", ring: "bg-tag-orange/10" },
  important: { label: "Важное", icon: Star, tone: "text-tag-pink", ring: "bg-tag-pink/10" },
  week: { label: "На этой неделе", icon: CalendarRange, tone: "text-tag-blue", ring: "bg-tag-blue/10" },
  noDeadline: { label: "Без дедлайна", icon: CircleDashed, tone: "text-muted-foreground", ring: "bg-muted" },
  unread: { label: "Непрочитанные обсуждения", icon: MessageSquare, tone: "text-primary", ring: "bg-primary/10" },
  approval: { label: "На согласовании", icon: Stamp, tone: "text-tag-purple", ring: "bg-tag-purple/10" },
  toMe: { label: "Делегировано мне", icon: ArrowDownLeft, tone: "text-tag-blue", ring: "bg-tag-blue/10" },
  byMe: { label: "Делегировано мной", icon: ArrowUpRight, tone: "text-tag-green", ring: "bg-tag-green/10" },
};

function DeadlinePill({ deadline }: { deadline: string | null }) {
  if (!deadline) return null;
  const d = new Date(deadline);
  const overdue = d < new Date();
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
        overdue ? "bg-destructive/10 text-destructive" : isToday(d) ? "bg-tag-orange/10 text-tag-orange" : "bg-muted text-muted-foreground",
      )}
    >
      {overdue ? "⚠ " : ""}
      {formatDistanceToNowStrict(d, { locale: ru, addSuffix: true })}
    </span>
  );
}

function TaskRow({
  task,
  users,
  onOpen,
  onComplete,
  onSetDate,
  onSetAssignee,
}: {
  task: MyTask;
  users: Profile[];
  onOpen: (id: string) => void;
  onComplete: (id: string) => void;
  onSetDate: (id: string, date: Date | null) => void;
  onSetAssignee: (id: string, sel: AssigneeSelection) => void;
}) {
  // Задачи на согласовании завершаем не отсюда (нужен флоу approval).
  const canComplete = !(task.requires_approval && task.approval_status !== "approved");
  const [dateOpen, setDateOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  return (
    <div className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
      {canComplete && (
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(task.id); }}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border text-transparent transition-colors hover:border-tag-green hover:text-tag-green"
          title="Завершить"
          aria-label="Завершить задачу"
        >
          <Check className="h-3 w-3" />
        </button>
      )}
      <button onClick={() => onOpen(task.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {(task.is_important || task.priority === 1) && (
          <Star className="h-3.5 w-3.5 shrink-0 fill-tag-pink text-tag-pink" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{task.title}</p>
          {task.groupName && <p className="truncate text-[11px] text-muted-foreground">{task.groupName}</p>}
        </div>
        <DeadlinePill deadline={task.deadline} />
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
              title="Назначить дату"
              aria-label="Назначить дату"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={task.deadline ? new Date(task.deadline) : undefined}
              onSelect={(d) => { onSetDate(task.id, d ?? null); setDateOpen(false); }}
              initialFocus
              className="pointer-events-auto p-3"
            />
          </PopoverContent>
        </Popover>
        <AssigneePicker
          users={users}
          current={task.assigned_to ? { kind: "user", id: task.assigned_to } : { kind: null, id: null }}
          open={assigneeOpen}
          onOpenChange={setAssigneeOpen}
          onSelect={(sel) => { onSetAssignee(task.id, sel); setAssigneeOpen(false); }}
          trigger={
            <button
              onClick={(e) => e.stopPropagation()}
              className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
              title="Ответственный"
              aria-label="Назначить ответственного"
            >
              <UserPlus className="h-3.5 w-3.5" />
            </button>
          }
        />
      </div>
    </div>
  );
}

function Block({
  blockKey,
  tasks,
  users,
  expanded,
  onToggle,
  onOpen,
  onComplete,
  onSetDate,
  onSetAssignee,
}: {
  blockKey: BlockKey;
  tasks: MyTask[];
  users: Profile[];
  expanded: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
  onComplete: (id: string) => void;
  onSetDate: (id: string, date: Date | null) => void;
  onSetAssignee: (id: string, sel: AssigneeSelection) => void;
}) {
  const meta = BLOCK_META[blockKey];
  const Icon = meta.icon;
  const count = tasks.length;
  const empty = count === 0;
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={onToggle}
        disabled={empty}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
          empty ? "opacity-50" : "hover:bg-muted/50",
        )}
      >
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", meta.ring)}>
          <Icon className={cn("h-4 w-4", meta.tone)} />
        </span>
        <span className="flex-1 text-sm font-medium">{meta.label}</span>
        <span className={cn("text-sm font-bold tabular-nums", count > 0 ? meta.tone : "text-muted-foreground")}>{count}</span>
        {!empty && (expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />)}
      </button>
      {expanded && !empty && (
        <div className="space-y-0.5 border-t border-border px-1.5 py-1.5">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              users={users}
              onOpen={onOpen}
              onComplete={onComplete}
              onSetDate={onSetDate}
              onSetAssignee={onSetAssignee}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyTasksDashboard({
  onOpenTask,
  onClose,
}: {
  onOpenTask: (taskId: string) => void;
  onClose?: () => void;
}) {
  const { user } = useAuth();
  const uid = user?.id;
  const { data, isLoading } = useMyTasksDashboard();
  const { isThreadUnread } = useUnreadMessages();
  const { data: users = [] } = useAvailableUsers();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>(() => {
    const s = typeof localStorage !== "undefined" ? localStorage.getItem(SCOPE_KEY) : null;
    return s === "assignee" ? "assignee" : "involved";
  });
  const [expanded, setExpanded] = useState<Set<BlockKey>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      if (raw) return new Set(JSON.parse(raw) as BlockKey[]);
    } catch { /* ignore */ }
    return new Set(["overdue"]);
  });

  const blocks = useMemo(() => {
    const involved = data?.involved ?? [];
    const byMe = data?.delegatedByMe ?? [];
    const { start, end } = todayBounds();
    const weekEnd = new Date(start);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const scoped = scope === "assignee" ? involved.filter((t) => t.assigned_to === uid) : involved;
    const byDeadline = (a: MyTask, b: MyTask) => (a.deadline ?? "") < (b.deadline ?? "") ? -1 : 1;

    const overdue = scoped.filter((t) => t.deadline && new Date(t.deadline) < start).sort(byDeadline);
    const today = scoped
      .filter((t) => t.deadline && new Date(t.deadline) >= start && new Date(t.deadline) < end)
      .sort(byDeadline);
    const important = scoped
      .filter((t) => t.is_important || t.priority === 1)
      .sort(byDeadline);
    const week = scoped
      .filter((t) => t.deadline && new Date(t.deadline) >= end && new Date(t.deadline) < weekEnd)
      .sort(byDeadline);
    const noDeadline = scoped.filter((t) => !t.deadline);
    const unread = scoped.filter((t) => isThreadUnread(`task-${t.id}`, null));
    const approval = scoped.filter((t) => t.requires_approval && t.approval_status === "pending").sort(byDeadline);
    const toMe = involved.filter((t) => t.assigned_to === uid && t.delegated_from && t.delegated_from !== uid).sort(byDeadline);

    return { overdue, today, important, week, noDeadline, unread, approval, toMe, byMe: [...byMe].sort(byDeadline) };
  }, [data, scope, uid, isThreadUnread]);

  // Подпись по числам блоков — ИИ-сводка пересчитывается только когда
  // изменились количества (агрессивное кэширование, как в Risk Radar).
  const countsSig = useMemo(
    () =>
      [blocks.overdue, blocks.today, blocks.important, blocks.week, blocks.noDeadline, blocks.unread, blocks.approval, blocks.toMe, blocks.byMe]
        .map((b) => b.length)
        .join("-"),
    [blocks],
  );

  const {
    data: aiSummary,
    isFetching: aiLoading,
    error: aiError,
    refetch: refetchAi,
  } = useQuery({
    queryKey: ["my_tasks_ai_summary", uid, scope, countsSig],
    enabled: !!uid && !isLoading,
    staleTime: 1000 * 60 * 60 * 2,
    gcTime: 1000 * 60 * 60 * 6,
    retry: false,
    queryFn: async (): Promise<string> => {
      const counts = {
        overdue: blocks.overdue.length,
        today: blocks.today.length,
        important: blocks.important.length,
        week: blocks.week.length,
        noDeadline: blocks.noDeadline.length,
        unread: blocks.unread.length,
        approval: blocks.approval.length,
        toMe: blocks.toMe.length,
        byMe: blocks.byMe.length,
      };
      const { data: res, error } = await supabase.functions.invoke("my-tasks-summary", {
        body: {
          counts,
          scope,
          topOverdue: blocks.overdue.slice(0, 6).map((t) => t.title),
          topToday: blocks.today.slice(0, 6).map((t) => t.title),
          topImportant: blocks.important.slice(0, 6).map((t) => t.title),
          topWeek: blocks.week.slice(0, 6).map((t) => t.title),
          topToMe: blocks.toMe.slice(0, 6).map((t) => t.title),
        },
      });
      if (error) throw error;
      return (res as { summary?: string })?.summary ?? "";
    },
  });

  const toggle = (k: BlockKey) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });

  const changeScope = (s: Scope) => {
    setScope(s);
    try { localStorage.setItem(SCOPE_KEY, s); } catch { /* ignore */ }
  };

  const completeTask = async (id: string) => {
    await supabase
      .from("tasks")
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["my_tasks_dashboard", uid] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["my_tasks_dashboard", uid] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const setDate = async (id: string, date: Date | null) => {
    await supabase.from("tasks").update({ deadline: date ? date.toISOString() : null }).eq("id", id);
    invalidate();
  };

  const setAssignee = async (id: string, sel: AssigneeSelection) => {
    // assigned_to синкается в task_participants на стороне БД.
    if (sel.kind === "user") {
      await supabase.from("tasks").update({ assigned_to: sel.id, department_id: null, contractor_id: null }).eq("id", id);
    } else if (sel.kind === "department") {
      await supabase.from("tasks").update({ assigned_to: null, department_id: sel.id, contractor_id: null }).eq("id", id);
    } else if (sel.kind === "contractor") {
      await supabase.from("tasks").update({ assigned_to: null, department_id: null, contractor_id: sel.id }).eq("id", id);
    } else {
      await supabase.from("tasks").update({ assigned_to: null, department_id: null, contractor_id: null }).eq("id", id);
    }
    invalidate();
  };

  // Сводка сверху: ключевые числа дня.
  const summary: { key: BlockKey; label: string }[] = [
    { key: "overdue", label: "Просрочено" },
    { key: "today", label: "Сегодня" },
    { key: "important", label: "Важное" },
    { key: "unread", label: "Непрочитанные" },
  ];

  const order: BlockKey[] = ["overdue", "today", "important", "week", "noDeadline", "unread", "approval", "toMe", "byMe"];

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <ListChecks className="h-4 w-4" />
        </span>
        <span className="flex-1 truncate text-sm font-semibold">Мои задачи</span>
        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {([
            { k: "involved" as Scope, label: "Я участник" },
            { k: "assignee" as Scope, label: "Исполнитель" },
          ]).map((o) => (
            <button
              key={o.k}
              onClick={() => changeScope(o.k)}
              className={cn(
                "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                scope === o.k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" title="Закрыть" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl space-y-2.5 p-4">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Загрузка…</p>
          ) : (
            <>
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-primary">ИИ-сводка</p>
                    {aiLoading ? (
                      <p className="mt-0.5 animate-pulse text-sm text-muted-foreground">Анализирую ваши задачи…</p>
                    ) : aiError ? (
                      <p className="mt-0.5 text-sm text-muted-foreground">Не удалось получить сводку.</p>
                    ) : (
                      <p className="mt-0.5 text-sm leading-snug text-foreground">{aiSummary}</p>
                    )}
                  </div>
                  <button
                    onClick={() => refetchAi()}
                    disabled={aiLoading}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                    title="Обновить сводку"
                    aria-label="Обновить сводку"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", aiLoading && "animate-spin")} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {summary.map((s) => {
                  const meta = BLOCK_META[s.key];
                  const n = blocks[s.key].length;
                  return (
                    <button
                      key={s.key}
                      onClick={() => { if (n > 0 && !expanded.has(s.key)) toggle(s.key); }}
                      className={cn("rounded-xl border border-border bg-card px-2 py-2 text-center transition-colors", n > 0 ? "hover:bg-muted/50" : "opacity-60")}
                    >
                      <p className={cn("text-lg font-bold tabular-nums", n > 0 ? meta.tone : "text-muted-foreground")}>{n}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{s.label}</p>
                    </button>
                  );
                })}
              </div>
              {order.map((k) => (
              <Block
                key={k}
                blockKey={k}
                tasks={blocks[k]}
                  users={users}
                expanded={expanded.has(k)}
                onToggle={() => toggle(k)}
                onOpen={onOpenTask}
                onComplete={completeTask}
                  onSetDate={setDate}
                  onSetAssignee={setAssignee}
              />
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
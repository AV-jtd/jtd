import { useMemo, useState } from "react";
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
  X,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useMyTasksDashboard, todayBounds, type MyTask } from "@/hooks/useMyTasksDashboard";
import { formatDistanceToNowStrict, isToday } from "date-fns";
import { ru } from "date-fns/locale";

type BlockKey = "overdue" | "today" | "unread" | "toMe" | "byMe";
type Scope = "involved" | "assignee";

const BLOCK_META: Record<
  BlockKey,
  { label: string; icon: typeof AlertTriangle; tone: string; ring: string }
> = {
  overdue: { label: "Просрочено", icon: AlertTriangle, tone: "text-destructive", ring: "bg-destructive/10" },
  today: { label: "Сегодня", icon: CalendarClock, tone: "text-tag-orange", ring: "bg-tag-orange/10" },
  unread: { label: "Непрочитанные обсуждения", icon: MessageSquare, tone: "text-primary", ring: "bg-primary/10" },
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

function TaskRow({ task, onOpen }: { task: MyTask; onOpen: (id: string) => void }) {
  return (
    <button
      onClick={() => onOpen(task.id)}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{task.title}</p>
        {task.groupName && <p className="truncate text-[11px] text-muted-foreground">{task.groupName}</p>}
      </div>
      <DeadlinePill deadline={task.deadline} />
    </button>
  );
}

function Block({
  blockKey,
  tasks,
  expanded,
  onToggle,
  onOpen,
}: {
  blockKey: BlockKey;
  tasks: MyTask[];
  expanded: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
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
            <TaskRow key={t.id} task={t} onOpen={onOpen} />
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
  const [scope, setScope] = useState<Scope>("involved");
  const [expanded, setExpanded] = useState<Set<BlockKey>>(new Set(["overdue"]));

  const blocks = useMemo(() => {
    const involved = data?.involved ?? [];
    const byMe = data?.delegatedByMe ?? [];
    const { start, end } = todayBounds();
    const scoped = scope === "assignee" ? involved.filter((t) => t.assigned_to === uid) : involved;
    const byDeadline = (a: MyTask, b: MyTask) => (a.deadline ?? "") < (b.deadline ?? "") ? -1 : 1;

    const overdue = scoped.filter((t) => t.deadline && new Date(t.deadline) < start).sort(byDeadline);
    const today = scoped
      .filter((t) => t.deadline && new Date(t.deadline) >= start && new Date(t.deadline) < end)
      .sort(byDeadline);
    const unread = scoped.filter((t) => isThreadUnread(`task-${t.id}`, null));
    const toMe = involved.filter((t) => t.assigned_to === uid && t.delegated_from && t.delegated_from !== uid).sort(byDeadline);

    return { overdue, today, unread, toMe, byMe: [...byMe].sort(byDeadline) };
  }, [data, scope, uid, isThreadUnread]);

  const toggle = (k: BlockKey) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  const order: BlockKey[] = ["overdue", "today", "unread", "toMe", "byMe"];

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
              onClick={() => setScope(o.k)}
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
            order.map((k) => (
              <Block
                key={k}
                blockKey={k}
                tasks={blocks[k]}
                expanded={expanded.has(k)}
                onToggle={() => toggle(k)}
                onOpen={onOpenTask}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
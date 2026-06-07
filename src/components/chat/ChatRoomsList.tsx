import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Search, CheckSquare, ListChecks } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import ClientAvatar from "@/components/ClientAvatar";
import { useChatRooms, type ChatRoom } from "@/hooks/useChatRooms";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { useMyTasksDashboard, todayBounds } from "@/hooks/useMyTasksDashboard";
import { useAvailableUsers } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import QuickCreateForm, { type QuickCreateResult } from "@/components/QuickCreateForm";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { ru } from "date-fns/locale";

function RankBadge({ label }: { label: string | null }) {
  if (!label) return null;
  const norm = label.trim().toUpperCase();
  const tone =
    norm.startsWith("A") ? "bg-tag-green/15 text-tag-green"
    : norm.startsWith("B") ? "bg-tag-blue/15 text-tag-blue"
    : norm.startsWith("C") ? "bg-tag-orange/15 text-tag-orange"
    : "bg-muted text-muted-foreground";
  return <span className={cn("ml-1 rounded px-1 text-[9px] font-bold leading-tight", tone)}>{norm}</span>;
}

function RoomAvatar({ room }: { room: ChatRoom }) {
  if (room.isTaskRoom) {
    return (
      <div className="relative shrink-0">
        <div className="h-7 w-7 rounded-md flex items-center justify-center bg-primary/10 text-primary">
          <CheckSquare className="h-4 w-4" />
        </div>
        {(room.clientLogoUrl || room.clientName) && (
          <span className="absolute -bottom-1 -right-1 ring-2 ring-background rounded-full">
            <ClientAvatar client={{ name: room.clientName || "", logo_url: room.clientLogoUrl ?? null }} size="xs" className="rounded-full" />
          </span>
        )}
      </div>
    );
  }
  if (room.isClientRoom) {
    return <ClientAvatar client={{ name: room.name, logo_url: room.groupLogoUrl }} size="md" />;
  }
  if (room.groupLogoUrl) {
    return <img src={room.groupLogoUrl} alt="" className="h-7 w-7 rounded-md object-cover ring-1 ring-border shrink-0" />;
  }
  return (
    <div
      className="h-7 w-7 rounded-md flex items-center justify-center text-xs shrink-0"
      style={{ backgroundColor: (room.groupColor || "#64748b") + "22" }}
    >
      {room.groupIcon || "📁"}
    </div>
  );
}

/**
 * Killer GTD-фича в шапке чатов: быстрое создание задачи (@исполнитель, дедлайн,
 * приоритет — через inline-парсинг QuickCreateForm). Без проекта задача уходит в
 * Inbox (`group_id = null`). `start_at` всегда = now().
 */
function NewTaskButton() {
  const { user } = useAuth();
  const { data: users = [] } = useAvailableUsers();
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: async (p: QuickCreateResult) => {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title: p.title,
          user_id: user!.id,
          group_id: null,
          start_at: new Date().toISOString(),
          deadline: p.deadline ? format(p.deadline, "yyyy-MM-dd") : null,
          assigned_to: p.assigneeId ?? null,
          department_id: p.assigneeId ? null : p.departmentId ?? null,
          contractor_id: p.assigneeId ? null : p.contractorId ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      await supabase.from("task_participants").insert({ task_id: data.id, user_id: user!.id, role: "creator" });
      return data;
    },
    onSuccess: () => {
      toast.success("Задача создана");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["chat_rooms"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <QuickCreateForm
      users={users}
      singleType="task"
      triggerLabel="Задача"
      align="end"
      onCreate={async (p) => {
        await create.mutateAsync(p);
      }}
    />
  );
}

export default function ChatRoomsList({
  activeGroupId,
  activeTaskId,
  onSelect,
  onSelectTask,
  onHome,
  onOpenMyTasks,
  myTasksActive,
}: {
  activeGroupId: string | null;
  activeTaskId?: string | null;
  onSelect: (groupId: string) => void;
  onSelectTask?: (taskId: string) => void;
  onHome?: () => void;
  onOpenMyTasks?: () => void;
  myTasksActive?: boolean;
}) {
  const { rooms, isLoading } = useChatRooms();
  const { isThreadUnread, getUnreadCount } = useUnreadMessages();
  const { data: myTasks } = useMyTasksDashboard();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "projects" | "clients" | "tasks">("all");

  // «Горящих» = просрочено + сегодня среди задач, где я участник.
  const hotCount = useMemo(() => {
    const list = myTasks?.involved ?? [];
    const { end } = todayBounds();
    return list.filter((t) => t.deadline && new Date(t.deadline) < end).length;
  }, [myTasks]);

  // Сводка для pills в превью «Мои задачи» (срез: я участник) — логика
  // совпадает с дашбордом MyTasksDashboard.
  const myTaskPills = useMemo(() => {
    const list = myTasks?.involved ?? [];
    const { start, end } = todayBounds();
    const overdue = list.filter((t) => t.deadline && new Date(t.deadline) < start).length;
    const today = list.filter(
      (t) => t.deadline && new Date(t.deadline) >= start && new Date(t.deadline) < end,
    ).length;
    const important = list.filter((t) => t.is_important || t.priority === 1).length;
    const approval = list.filter((t) => t.requires_approval && t.approval_status === "pending").length;
    return [
      { key: "overdue", label: "Просрочено", count: overdue, cls: "bg-destructive/10 text-destructive" },
      { key: "today", label: "Сегодня", count: today, cls: "bg-tag-orange/10 text-tag-orange" },
      { key: "important", label: "Важное", count: important, cls: "bg-tag-pink/10 text-tag-pink" },
      { key: "approval", label: "Согласование", count: approval, cls: "bg-tag-purple/10 text-tag-purple" },
    ].filter((p) => p.count > 0);
  }, [myTasks]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rooms.filter((r) => {
      if (filter === "projects" && (r.isClientRoom || r.isTaskRoom)) return false;
      if (filter === "clients" && !r.isClientRoom) return false;
      if (filter === "tasks" && !r.isTaskRoom) return false;
      if (!s) return true;
      return r.name.toLowerCase().includes(s) || r.lastMessage?.toLowerCase().includes(s);
    });
  }, [rooms, q, filter]);

  const FILTERS: { key: typeof filter; label: string }[] = [
    { key: "all", label: "Все" },
    { key: "projects", label: "Проекты" },
    { key: "clients", label: "Клиенты" },
    { key: "tasks", label: "Задачи" },
  ];

  // Счётчики непрочитанных по категориям — считаются из уже загруженного
  // списка комнат и кэша непрочитанных, без новых запросов.
  const unreadCounts = useMemo(() => {
    const c = { all: 0, projects: 0, clients: 0, tasks: 0 };
    for (const r of rooms) {
      if (!isThreadUnread(r.threadId, r.lastMessageAt, r.lastMessageUserId)) continue;
      c.all += 1;
      if (r.isTaskRoom) c.tasks += 1;
      else if (r.isClientRoom) c.clients += 1;
      else c.projects += 1;
    }
    return c;
  }, [rooms, isThreadUnread]);

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Единая кросс-апп шапка: лого → на главную | «Чаты» … справа поиск + быстрое создание задачи (GTD). */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 shrink-0">
        <button
          onClick={onHome}
          className="flex items-center gap-2 shrink-0"
          title="На главную"
          aria-label="На главную"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-sm font-black leading-none text-primary-foreground">
            ✓
          </span>
          <span className="text-sm font-bold tracking-tight">Чаты</span>
        </button>
        <div className="relative ml-auto min-w-0 flex-1 max-w-[150px]">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" className="h-8 pl-7" />
        </div>
        <NewTaskButton />
      </div>
      <div className="px-2 py-2 shrink-0">
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <span>{f.label}</span>
              {unreadCounts[f.key] > 0 && (
                <span
                  className={cn(
                    "grid h-4 min-w-[16px] place-items-center rounded-full px-1 text-[9px] font-bold leading-none",
                    filter === f.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground",
                  )}
                >
                  {unreadCounts[f.key] > 99 ? "99+" : unreadCounts[f.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 px-2 pb-3">
          {onOpenMyTasks && (
            <button
              onClick={onOpenMyTasks}
              className={cn(
                "mb-1 flex w-full items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 text-left transition-colors",
                myTasksActive ? "bg-primary/10" : "hover:bg-muted",
              )}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <ListChecks className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Мои задачи</p>
                {myTaskPills.length > 0 ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {myTaskPills.map((p) => (
                      <span
                        key={p.key}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                          p.cls,
                        )}
                      >
                        {p.label}
                        <span className="font-bold tabular-nums">{p.count}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="truncate text-xs text-muted-foreground">Дашборд: просрочено, сегодня, делегирование</p>
                )}
              </div>
              {hotCount > 0 && (
                <span className="shrink-0 rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
                  {hotCount > 99 ? "99+" : hotCount}
                </span>
              )}
            </button>
          )}
          {isLoading && <p className="px-2 py-4 text-xs text-muted-foreground">Загрузка…</p>}
          {!isLoading && filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">Нет чатов</p>
          )}
          {filtered.map((room) => {
            const unread = isThreadUnread(room.threadId, room.lastMessageAt, room.lastMessageUserId);
            const count = getUnreadCount(room.threadId, room.lastMessageUserId);
            const isActive = room.isTaskRoom ? room.taskId === activeTaskId : room.groupId === activeGroupId;
            return (
              <button
                key={room.groupId}
                onClick={() => (room.isTaskRoom && room.taskId ? onSelectTask?.(room.taskId) : onSelect(room.groupId))}
                className={cn(
                  "relative flex w-full items-center gap-2.5 rounded-lg py-2 pl-3 pr-2 text-left transition-colors",
                  isActive
                    ? "bg-primary/10"
                    : unread
                      ? "bg-primary/[0.06] hover:bg-primary/10"
                      : "hover:bg-muted",
                )}
              >
                {unread && !isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <RoomAvatar room={room} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center">
                    <span className={cn("truncate text-sm", unread ? "font-bold text-foreground" : "font-medium", room.taskCompleted && "line-through opacity-60")}>
                      {room.name}
                    </span>
                    {room.isClientRoom && <RankBadge label={room.client?.rankLabel ?? null} />}
                    {room.lastMessageAt && (
                      <span className={cn("ml-auto pl-2 text-[10px] shrink-0", unread ? "font-medium text-primary" : "text-muted-foreground")}>
                        {formatDistanceToNowStrict(new Date(room.lastMessageAt), { locale: ru })}
                      </span>
                    )}
                  </div>
                  <p className={cn("truncate text-xs", unread ? "text-foreground/80" : "text-muted-foreground")}>
                    {room.isTaskRoom && room.parentName ? (
                      <span className="opacity-70">{room.parentName} · </span>
                    ) : null}
                    {room.lastMessage ? (
                      <>
                        {room.lastMessageAuthor && <span className="opacity-80">{room.lastMessageAuthor}: </span>}
                        {room.lastMessage}
                      </>
                    ) : room.isClientRoom ? (
                      <span className="italic opacity-70">CRM-комната клиента</span>
                    ) : (
                      <span className="italic opacity-70">Нет сообщений</span>
                    )}
                  </p>
                </div>
                {count > 0 ? (
                  <span className="ml-1 grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-none text-primary-foreground shadow-sm">
                    {count > 99 ? "99+" : count}
                  </span>
                ) : unread ? (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                ) : null}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

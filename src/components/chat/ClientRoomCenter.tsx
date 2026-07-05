import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import ProjectChat from "@/components/ProjectChat";
import ClientAvatar from "@/components/ClientAvatar";
import TaskItem from "@/components/TaskItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Task } from "@/hooks/useTasks";
import { useAvailableUsers } from "@/hooks/useTasks";
import { useClientTaskThreads } from "@/hooks/useClientTaskThreads";
import ClientTaskThreadCard from "@/components/chat/ClientTaskThreadCard";
import BulkLinkTasksDialog from "@/components/chat/BulkLinkTasksDialog";
import {
  MessageSquare, ListChecks, BarChart3, UserCheck, ArrowLeft, Maximize2, Minimize2,
  ListTodo, AlertTriangle, CheckCircle2, TrendingUp, MapPin, SquareArrowOutUpRight,
  ChevronDown, ChevronRight, Plus, Info, Link2, X, CalendarClock, CalendarDays, CircleDashed,
  Radio, FolderKanban, FileText, ListPlus, ArrowUpRight, MessagesSquare,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useClientChatEvents, type ClientChatEvent } from "@/hooks/useClientChatEvents";

type ClientInfo = {
  id: string; name: string; logo_url: string | null;
  rankLabel: string | null; territoryLabel: string | null;
};

/** Метаданные клиента для шапки комнаты. */
function useClientInfo(clientId: string | null) {
  return useQuery({
    queryKey: ["client_room_info", clientId],
    queryFn: async (): Promise<ClientInfo | null> => {
      if (!clientId) return null;
      const { data: c } = await supabase
        .from("clients")
        .select("id, name, logo_url, rank_tag_id, territory_tag_id")
        .eq("id", clientId)
        .maybeSingle();
      if (!c) return null;
      const tagIds = [c.rank_tag_id, c.territory_tag_id].filter(Boolean) as string[];
      const tagMap = new Map<string, string>();
      if (tagIds.length) {
        const { data: tags } = await supabase.from("tags").select("id, name").in("id", tagIds);
        for (const t of (tags as any[]) || []) tagMap.set(t.id, t.name);
      }
      return {
        id: c.id,
        name: c.name,
        logo_url: c.logo_url,
        rankLabel: c.rank_tag_id ? tagMap.get(c.rank_tag_id) ?? null : null,
        territoryLabel: c.territory_tag_id ? tagMap.get(c.territory_tag_id) ?? null : null,
      };
    },
    enabled: !!clientId,
    staleTime: 1000 * 60,
  });
}

/** Источник, из которого задача попала в комнату клиента. */
type TaskOrigin = {
  type: "direct" | "project" | "protocol";
  key: string;
  label: string;
};

/**
 * Полноценные Task-объекты по клиенту (с шагами и тегами) — чтобы рендерить
 * единый компонент `TaskItem` (раскрытие inline + воркфлоу «Закрыть/Создать
 * связанную»), а не дублировать карточку задачи в комнате клиента.
 *
 * Собирает три источника:
 *  1) задачи с `tasks.client_id = clientId` («Прямые задачи»);
 *  2) задачи проектов (и их подпроектов рекурсивно) с `task_groups.client_id`;
 *  3) задачи протоколов, помеченных клиентом (`protocol_meta.client_id`).
 * К каждой задаче прикрепляется `__origin` для группировки в UI.
 */
function useClientTasks(clientId: string | null) {
  return useQuery({
    queryKey: ["client_room_tasks", clientId],
    queryFn: async (): Promise<Task[]> => {
      if (!clientId) return [];
      const sel = "*, subtasks(*), task_tags(tag_id)";

      // --- Источник 2: проекты клиента + их подпроекты (BFS) ---
      const { data: rootGroups } = await supabase
        .from("task_groups")
        .select("id, name, project_type")
        .eq("client_id", clientId as any);
      const projectGroupLabel = new Map<string, string>(); // groupId -> ярлык корня
      for (const g of ((rootGroups as any[]) || [])) {
        if (g.project_type === "protocol" || g.project_type === "crm_client") continue;
        projectGroupLabel.set(g.id, g.name);
      }
      let frontier = [...projectGroupLabel.keys()];
      let guard = 0;
      while (frontier.length && guard++ < 15) {
        const { data: children } = await supabase
          .from("task_groups")
          .select("id, name, parent_id")
          .in("parent_id", frontier);
        const next: string[] = [];
        for (const c of ((children as any[]) || [])) {
          if (!projectGroupLabel.has(c.id)) {
            projectGroupLabel.set(c.id, projectGroupLabel.get(c.parent_id) || c.name);
            next.push(c.id);
          }
        }
        frontier = next;
      }

      // --- Источник 3: протоколы клиента ---
      const { data: directProtos } = await supabase
        .from("task_groups")
        .select("id, name")
        .eq("project_type", "protocol" as any)
        .eq("protocol_meta->>client_id", clientId as any);
      const protoLabel = new Map<string, string>();
      for (const p of ((directProtos as any[]) || [])) protoLabel.set(p.id, p.name);

      const projectIds = [...projectGroupLabel.keys()];
      const protoIds = [...protoLabel.keys()];

      // --- Параллельные запросы по трём источникам ---
      const [directRes, projectRes, protoRes] = await Promise.all([
        supabase
          .from("tasks").select(sel)
          .eq("client_id", clientId)
          .order("is_completed", { ascending: true })
          .order("created_at", { ascending: false })
          .limit(300),
        projectIds.length
          ? supabase.from("tasks").select(sel).in("group_id", projectIds).limit(500)
          : Promise.resolve({ data: [] as any[] }),
        protoIds.length
          ? supabase.from("tasks").select(sel).in("group_id", protoIds).neq("task_type", "protocol_review").limit(300)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const out: Task[] = [];
      const seen = new Set<string>();
      const push = (rows: any[], origin: (t: any) => TaskOrigin) => {
        for (const t of rows || []) {
          if (seen.has(t.id)) continue;
          seen.add(t.id);
          (t as any).__origin = origin(t);
          out.push(t as Task);
        }
      };
      // Приоритет источника: протокол > проект > прямая привязка.
      push((protoRes as any).data, (t) => ({
        type: "protocol", key: `proto:${t.group_id}`,
        label: `Протокол: ${protoLabel.get(t.group_id) || "встреча"}`,
      }));
      push((projectRes as any).data, (t) => {
        const label = projectGroupLabel.get(t.group_id) || "Проект";
        return { type: "project", key: `proj:${label}`, label: `Проект: ${label}` };
      });
      push((directRes as any).data, () => ({
        type: "direct", key: "direct", label: "Прямые задачи",
      }));
      return out;
    },
    enabled: !!clientId,
    staleTime: 1000 * 30,
  });
}

/** Группировка задач по источнику для отображения секциями. */
function groupTasksByOrigin(tasks: Task[]) {
  const order: Record<TaskOrigin["type"], number> = { direct: 0, project: 1, protocol: 2 };
  const map = new Map<string, { origin: TaskOrigin; items: Task[] }>();
  for (const t of tasks) {
    const o: TaskOrigin = (t as any).__origin ?? { type: "direct", key: "direct", label: "Прямые задачи" };
    if (!map.has(o.key)) map.set(o.key, { origin: o, items: [] });
    map.get(o.key)!.items.push(t);
  }
  return [...map.values()].sort(
    (a, b) => order[a.origin.type] - order[b.origin.type] || a.origin.label.localeCompare(b.origin.label),
  );
}

type TabKey = "chat" | "tasks" | "live" | "metrics" | "assignments";

export default function ClientRoomCenter({
  groupId,
  groupName,
  clientId,
  fullscreen,
  onClose,
  onToggleFullscreen,
  onBack,
  onShowInfo,
  onNavigateToTask,
}: {
  groupId: string;
  groupName: string;
  clientId: string;
  fullscreen?: boolean;
  onClose: () => void;
  onToggleFullscreen?: () => void;
  onBack?: () => void;
  onShowInfo?: () => void;
  onNavigateToTask?: (taskId: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("chat");
  /** Какую задачу авто-раскрыть inline (id + nonce для повторного раскрытия). */
  const [expand, setExpand] = useState<{ id: string; nonce: number } | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  /** Активный фокус-фильтр из блока «Сегодня по клиенту». */
  const [focusFilter, setFocusFilter] = useState<"overdue" | "today" | "week" | "nodate" | null>(null);

  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: client } = useClientInfo(clientId);
  const { data: tasks = [] } = useClientTasks(clientId);
  const { data: taskThreads = [] } = useClientTaskThreads(clientId);
  const { data: chatEvents = [] } = useClientChatEvents(clientId);
  const { data: availableUsers = [] } = useAvailableUsers();
  /** Какая ветка чата задачи раскрыта в ленте «Обсуждение». */
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  /** Свёрнут ли весь блок «Чаты задач» над лентой комнаты. */
  const [threadsCollapsed, setThreadsCollapsed] = useState(false);

  const now = Date.now();
  const open = tasks.filter((t) => !t.is_completed);
  const completed = tasks.filter((t) => t.is_completed);
  const overdue = open.filter((t) => t.deadline && new Date(t.deadline).getTime() < now);
  const assignments = tasks.filter((t) => (t as any).delegated_from);
  const completionRate = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;

  // «Сегодня по клиенту»: ведёрки задач по срочности (на реальных данных).
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const endWeek = new Date(endToday); endWeek.setDate(endWeek.getDate() + 7);
  const dl = (t: Task) => (t.deadline ? new Date(t.deadline) : null);
  const overdueTasks = open.filter((t) => { const d = dl(t); return d && d < startToday; });
  const todayTasks = open.filter((t) => { const d = dl(t); return d && d >= startToday && d <= endToday; });
  const weekTasks = open.filter((t) => { const d = dl(t); return d && d > endToday && d <= endWeek; });
  const noDateTasks = open.filter((t) => !t.deadline);
  const focusBuckets = { overdue: overdueTasks, today: todayTasks, week: weekTasks, nodate: noDateTasks };
  const focusList = focusFilter ? focusBuckets[focusFilter] : open;
  /** Связанная задача = CRM-задача воронки клиента. */
  const funnelTask = tasks.find((t) => (t as any).task_type === "crm") ?? null;

  /** Создать обычную задачу, привязанную к клиенту (без дублирования воронки). */
  const addTask = useMutation({
    mutationFn: async (title: string) => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          title,
          user_id: user!.id,
          client_id: clientId,
          group_id: (funnelTask as any)?.group_id ?? null,
          start_at: now,
        } as any)
        .select()
        .single();
      if (error) throw error;
      await supabase.from("task_participants").insert({ task_id: data.id, user_id: user!.id, role: "creator" });
      return data;
    },
    onSuccess: () => {
      setNewTitle("");
      qc.invalidateQueries({ queryKey: ["client_room_tasks", clientId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const submitNewTask = () => {
    const t = newTitle.trim();
    if (!t || addTask.isPending) return;
    addTask.mutate(t);
  };

  /** Открыть задачу прямо в комнате (вкладка «Задачи» + раскрытие inline). */
  const openTaskInline = (id: string) => {
    setTab("tasks");
    setExpand({ id, nonce: Date.now() });
  };

  /** Перейти в «Задачи» для создания новой задачи по клиенту. */
  const startNewTask = () => setTab("tasks");

  /** Клик по чипу «Сегодня по клиенту» → вкладка «Задачи» + фокус-фильтр. */
  const openFocus = (key: "overdue" | "today" | "week" | "nodate") => {
    setFocusFilter(key);
    setExpand(null);
    setTab("tasks");
  };

  /** Ключ для TaskItem: меняется при запросе раскрытия → ремоунт уже раскрытым. */
  const taskKey = (id: string) => `${id}-${expand?.id === id ? expand.nonce : 0}`;

  const TABS: { key: TabKey; label: string; icon: typeof MessageSquare; count?: number }[] = [
    { key: "chat", label: "Обсуждение", icon: MessageSquare },
    { key: "tasks", label: "Задачи", icon: ListChecks, count: tasks.length || undefined },
    { key: "live", label: "Эфир", icon: Radio },
    { key: "metrics", label: "Показатели", icon: BarChart3 },
    { key: "assignments", label: "Поручения", icon: UserCheck, count: assignments.length || undefined },
  ];

  return (
    <div className="flex h-full flex-col bg-background">
      {/* header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4 sm:py-3">
        {onBack && (
          <button onClick={onBack} className="-ml-1 shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted md:hidden" aria-label="Назад">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {client && <ClientAvatar client={client} size="md" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-bold tracking-tight">{client?.name || groupName}</span>
            {client?.rankLabel && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{client.rankLabel}</span>
            )}
          </div>
          {client?.territoryLabel && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {client.territoryLabel}
              <span className="text-border">·</span> команда по клиенту
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setBulkOpen(true)}
            title="Привязать к клиенту"
          >
            <Link2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={startNewTask}
            title="Добавить задачу"
          >
            <Plus className="h-4 w-4" />
          </Button>
          {funnelTask && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => openTaskInline(funnelTask.id)}
              title="Открыть связанную задачу"
            >
              <SquareArrowOutUpRight className="h-4 w-4" />
            </Button>
          )}
          {onToggleFullscreen && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleFullscreen} title={fullscreen ? "Свернуть" : "Развернуть"}>
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          )}
          {onShowInfo && (
            <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={onShowInfo} title="Карточка клиента">
              <Info className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Сегодня по клиенту — фокус-строка по срочности задач */}
      <TodayBar
        overdue={overdueTasks.length}
        today={todayTasks.length}
        week={weekTasks.length}
        nodate={noDateTasks.length}
        active={tab === "tasks" ? focusFilter : null}
        onPick={openFocus}
      />

      {/* tabs */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2 sm:px-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-sm font-medium transition-colors sm:px-3",
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.count ? (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-bold">{t.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* content */}
      <div className="min-h-0 flex-1">
        {tab === "chat" && (
          <div className="flex h-full flex-col">
            {taskThreads.length > 0 && (
              <div className="shrink-0 border-b border-border bg-muted/20">
                <button
                  onClick={() => setThreadsCollapsed((v) => !v)}
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:text-foreground sm:px-4"
                >
                  {threadsCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Чаты задач
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-bold">
                    {taskThreads.length}
                  </span>
                </button>
                {!threadsCollapsed && (
                  <div className="max-h-64 space-y-1.5 overflow-y-auto px-3 pb-3 sm:px-4">
                    {taskThreads.map((th) => (
                      <ClientTaskThreadCard
                        key={th.taskId}
                        thread={th}
                        availableUsers={availableUsers}
                        expanded={expandedThread === th.taskId}
                        onToggle={() =>
                          setExpandedThread((cur) => (cur === th.taskId ? null : th.taskId))
                        }
                        onOpen={() => openTaskInline(th.taskId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="min-h-0 flex-1">
              <ProjectChat
                key={groupId}
                groupId={groupId}
                groupName={client?.name || groupName}
                embedded
                fullscreen={fullscreen}
                onClose={onClose}
                onNavigateToTask={onNavigateToTask}
              />
            </div>
          </div>
        )}

        {tab === "tasks" && (
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-2xl space-y-1 p-4 sm:p-5">
              <h3 className="mb-1 text-sm font-semibold">Задачи по клиенту</h3>
              {/* Быстрое добавление задачи по клиенту */}
              <form
                onSubmit={(e) => { e.preventDefault(); submitNewTask(); }}
                className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20 transition-all"
              >
                <button
                  type="submit"
                  disabled={!newTitle.trim() || addTask.isPending}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-primary/30 transition-all hover:border-primary hover:bg-primary/10 disabled:opacity-20"
                  aria-label="Добавить задачу"
                >
                  <Plus className="h-4 w-4 text-primary" />
                </button>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Добавить задачу по клиенту..."
                  className="h-auto border-0 p-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
                />
              </form>
              {focusFilter && (
                <button
                  onClick={() => setFocusFilter(null)}
                  className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  {FOCUS_LABELS[focusFilter]} · {focusList.length}
                  <X className="h-3 w-3" />
                </button>
              )}
              {tasks.length === 0 && <EmptyState text="По клиенту пока нет задач" />}
              {tasks.length > 0 && focusList.length === 0 && (
                <EmptyState text="Нет задач в этой категории" />
              )}
              {(() => {
                const groups = groupTasksByOrigin(focusList);
                if (groups.length <= 1) {
                  return focusList.map((t) => (
                    <TaskItem key={taskKey(t.id)} task={t} initialOpen={expand?.id === t.id} />
                  ));
                }
                return groups.map((g) => (
                  <div key={g.origin.key} className="pt-1">
                    <OriginHeader origin={g.origin} count={g.items.length} />
                    <div className="space-y-1">
                      {g.items.map((t) => (
                        <TaskItem key={taskKey(t.id)} task={t} initialOpen={expand?.id === t.id} />
                      ))}
                    </div>
                  </div>
                ));
              })()}
              {completed.length > 0 && (
                <div className="pt-2">
                  <button
                    onClick={() => setShowCompleted((v) => !v)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showCompleted ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Завершённые ({completed.length})
                  </button>
                  {showCompleted && (
                    <div className="mt-1 space-y-1 animate-fade-in">
                      {completed.map((t) => (
                        <TaskItem key={taskKey(t.id)} task={t} initialOpen={expand?.id === t.id} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {tab === "live" && (
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-2xl space-y-2 p-4 sm:p-5">
              <div className="mb-1 flex items-center gap-2">
                <h3 className="text-sm font-semibold">В эфире</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-tag-green/10 px-1.5 py-0.5 text-[10px] font-semibold text-tag-green">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-tag-green" />
                  live
                </span>
              </div>
              <ActivityFeed tasks={tasks} users={availableUsers} onOpenTask={openTaskInline} />
            </div>
          </ScrollArea>
        )}

        {tab === "metrics" && (
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-5">
              <h3 className="text-sm font-semibold">Показатели клиента</h3>
              <div className="grid grid-cols-2 gap-3">
                <MetricTile icon={ListTodo} label="В работе" value={open.length} tone="text-tag-blue" />
                <MetricTile icon={AlertTriangle} label="Просрочено" value={overdue.length} tone="text-destructive" />
                <MetricTile icon={CheckCircle2} label="Завершено" value={completed.length} tone="text-tag-green" />
                <MetricTile icon={TrendingUp} label="Всего задач" value={tasks.length} tone="text-primary" />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between text-sm font-medium">
                  <span>Выполнено по клиенту</span>
                  <span className="font-bold">{completionRate}%</span>
                </div>
                <Progress value={completionRate} className="h-1.5" />
              </div>
            </div>
          </ScrollArea>
        )}

        {tab === "assignments" && (
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-2xl space-y-1 p-4 sm:p-5">
              <h3 className="mb-1 text-sm font-semibold">Поручения по клиенту</h3>
              {assignments.length === 0 && (
                <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                  <UserCheck className="h-4 w-4" />
                  Делегированные задачи по клиенту появятся здесь
                </div>
              )}
              {assignments.map((a) => (
                <TaskItem key={taskKey(a.id)} task={a} initialOpen={expand?.id === a.id} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <BulkLinkTasksDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        clientId={clientId}
        clientName={client?.name || groupName}
      />
    </div>
  );
}

function MetricTile({ icon: Icon, label, value, tone }: { icon: typeof TrendingUp; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className={cn("h-4 w-4", tone)} />
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">{text}</div>
  );
}

/** Заголовок секции-источника во вкладке «Задачи». */
function OriginHeader({ origin, count }: { origin: { type: "direct" | "project" | "protocol"; label: string }; count: number }) {
  const Icon = origin.type === "protocol" ? FileText : origin.type === "project" ? FolderKanban : ListPlus;
  return (
    <div className="mb-1 mt-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      <span className="truncate">{origin.label}</span>
      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-bold">{count}</span>
    </div>
  );
}

/** Человекочитаемое относительное время. */
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} дн назад`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

type LiveEvent = {
  id: string;
  taskId: string;
  time: string;
  kind: "created" | "completed" | "drift" | "step";
  actorId: string | null;
  title: string;
  detail?: string;
};

/**
 * Лента активности по клиенту «в эфире». Строится из уже загруженных задач
 * (без отдельных запросов): создание, выполнение, дрейф срока и шаги.
 * Авто-обновляется вместе с realtime-инвалидацией списка задач.
 */
function ActivityFeed({
  tasks, users, onOpenTask,
}: {
  tasks: Task[];
  users: { id: string; display_name?: string | null; email?: string | null; username?: string | null }[];
  onOpenTask: (id: string) => void;
}) {
  const nameOf = (id: string | null) => {
    if (!id) return "—";
    const u = users.find((x) => x.id === id);
    return u?.display_name || u?.username || u?.email?.split("@")[0] || "Сотрудник";
  };

  const events: LiveEvent[] = [];
  for (const t of tasks) {
    const anyT = t as any;
    if (anyT.created_at) {
      events.push({ id: `c-${t.id}`, taskId: t.id, time: anyT.created_at, kind: "created", actorId: anyT.user_id ?? null, title: t.title });
    }
    if (t.is_completed && anyT.completed_at) {
      events.push({ id: `d-${t.id}`, taskId: t.id, time: anyT.completed_at, kind: "completed", actorId: anyT.assigned_to ?? anyT.user_id ?? null, title: t.title });
    }
    if (anyT.original_deadline && anyT.deadline && anyT.original_deadline !== anyT.deadline) {
      events.push({
        id: `drift-${t.id}`, taskId: t.id,
        time: anyT.updated_at || anyT.deadline,
        kind: "drift", actorId: anyT.assigned_to ?? anyT.user_id ?? null, title: t.title,
        detail: `срок → ${new Date(anyT.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`,
      });
    }
    for (const s of (anyT.subtasks || [])) {
      if (s.is_completed && (s as any).completed_at) {
        events.push({ id: `s-${s.id}`, taskId: t.id, time: (s as any).completed_at, kind: "step", actorId: (s as any).assigned_to ?? null, title: t.title, detail: s.title });
      }
    }
  }
  events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const list = events.slice(0, 60);

  if (list.length === 0) return <EmptyState text="Пока нет активности по клиенту" />;

  const META: Record<LiveEvent["kind"], { icon: typeof CheckCircle2; tone: string; verb: string }> = {
    created: { icon: Plus, tone: "text-tag-blue", verb: "создал(а) задачу" },
    completed: { icon: CheckCircle2, tone: "text-tag-green", verb: "выполнил(а)" },
    drift: { icon: ArrowUpRight, tone: "text-tag-orange", verb: "перенёс(ла)" },
    step: { icon: CheckCircle2, tone: "text-tag-green", verb: "закрыл(а) шаг" },
  };

  return (
    <div className="space-y-1.5">
      {list.map((e) => {
        const m = META[e.kind];
        return (
          <button
            key={e.id}
            onClick={() => onOpenTask(e.taskId)}
            className="flex w-full items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50"
          >
            <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted", m.tone)}>
              <m.icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                <span className="font-medium">{nameOf(e.actorId)}</span>{" "}
                <span className="text-muted-foreground">{m.verb}</span>{" "}
                <span className="font-medium">{e.detail ?? e.title}</span>
              </div>
              {e.detail && (
                <div className="truncate text-xs text-muted-foreground">{e.title}</div>
              )}
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">{relTime(e.time)}</span>
          </button>
        );
      })}
    </div>
  );
}

type FocusKey = "overdue" | "today" | "week" | "nodate";

const FOCUS_LABELS: Record<FocusKey, string> = {
  overdue: "Просрочено",
  today: "Сегодня",
  week: "На неделе",
  nodate: "Без срока",
};

/**
 * «Сегодня по клиенту» — компактная фокус-строка над вкладками. Показывает
 * задачи по срочности и переводит во вкладку «Задачи» с применённым фильтром.
 * Если всё под контролем (нет просрочки и задач на сегодня) — спокойное состояние.
 */
function TodayBar({
  overdue, today, week, nodate, active, onPick,
}: {
  overdue: number; today: number; week: number; nodate: number;
  active: FocusKey | null;
  onPick: (key: FocusKey) => void;
}) {
  const allChips: { key: FocusKey; label: string; count: number; icon: typeof CalendarClock; tone: string }[] = [
    { key: "overdue", label: "Просрочено", count: overdue, icon: AlertTriangle, tone: "text-destructive" },
    { key: "today", label: "Сегодня", count: today, icon: CalendarClock, tone: "text-tag-blue" },
    { key: "week", label: "На неделе", count: week, icon: CalendarDays, tone: "text-tag-purple" },
    { key: "nodate", label: "Без срока", count: nodate, icon: CircleDashed, tone: "text-muted-foreground" },
  ];
  const chips = allChips.filter((c) => c.count > 0);

  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-muted/20 px-3 py-1.5 sm:px-4">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Сегодня</span>
      {chips.length === 0 ? (
        <span className="flex items-center gap-1 text-xs text-tag-green">
          <CheckCircle2 className="h-3.5 w-3.5" /> Всё под контролем
        </span>
      ) : (
        chips.map((c) => (
          <button
            key={c.key}
            onClick={() => onPick(c.key)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
              active === c.key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            <c.icon className={cn("h-3.5 w-3.5", active === c.key ? "text-primary" : c.tone)} />
            {c.label}
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-bold">{c.count}</span>
          </button>
        ))
      )}
    </div>
  );
}

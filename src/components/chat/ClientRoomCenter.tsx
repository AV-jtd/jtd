import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ProjectChat from "@/components/ProjectChat";
import ClientAvatar from "@/components/ClientAvatar";
import TaskItem from "@/components/TaskItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Task } from "@/hooks/useTasks";
import {
  MessageSquare, ListChecks, BarChart3, UserCheck, ArrowLeft, Maximize2, Minimize2,
  ListTodo, AlertTriangle, CheckCircle2, TrendingUp, MapPin, SquareArrowOutUpRight,
  ChevronDown, ChevronRight,
} from "lucide-react";

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

/**
 * Полноценные Task-объекты по клиенту (с шагами и тегами) — чтобы рендерить
 * единый компонент `TaskItem` (раскрытие inline + воркфлоу «Закрыть/Создать
 * связанную»), а не дублировать карточку задачи в комнате клиента.
 */
function useClientTasks(clientId: string | null) {
  return useQuery({
    queryKey: ["client_room_tasks", clientId],
    queryFn: async (): Promise<Task[]> => {
      if (!clientId) return [];
      const { data } = await supabase
        .from("tasks")
        .select("*, subtasks(*), task_tags(tag_id)")
        .eq("client_id", clientId)
        .order("is_completed", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(200);
      return ((data as any[]) || []) as Task[];
    },
    enabled: !!clientId,
    staleTime: 1000 * 30,
  });
}

type TabKey = "chat" | "tasks" | "metrics" | "assignments";

export default function ClientRoomCenter({
  groupId,
  groupName,
  clientId,
  fullscreen,
  onClose,
  onToggleFullscreen,
  onBack,
  onNavigateToTask,
}: {
  groupId: string;
  groupName: string;
  clientId: string;
  fullscreen?: boolean;
  onClose: () => void;
  onToggleFullscreen?: () => void;
  onBack?: () => void;
  onNavigateToTask?: (taskId: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("chat");
  const { data } = useClientRoomData(clientId);
  const tasks = data?.tasks ?? [];
  const client = data?.client;

  const now = Date.now();
  const open = tasks.filter((t) => !t.is_completed);
  const completed = tasks.filter((t) => t.is_completed);
  const overdue = open.filter((t) => t.deadline && new Date(t.deadline).getTime() < now);
  const assignments = tasks.filter((t) => t.delegated_from);
  const completionRate = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;

  const TABS: { key: TabKey; label: string; icon: typeof MessageSquare; count?: number }[] = [
    { key: "chat", label: "Обсуждение", icon: MessageSquare },
    { key: "tasks", label: "Задачи", icon: ListChecks, count: tasks.length || undefined },
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
          {onToggleFullscreen && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleFullscreen} title={fullscreen ? "Свернуть" : "Развернуть"}>
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

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
          <ProjectChat
            key={groupId}
            groupId={groupId}
            groupName={client?.name || groupName}
            embedded
            fullscreen={fullscreen}
            onClose={onClose}
            onNavigateToTask={onNavigateToTask}
          />
        )}

        {tab === "tasks" && (
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-2xl space-y-2 p-4 sm:p-5">
              <h3 className="mb-1 text-sm font-semibold">Задачи по клиенту</h3>
              {tasks.length === 0 && <EmptyState text="По клиенту пока нет задач" />}
              {tasks.map((t) => {
                const isOverdue = !t.is_completed && t.deadline && new Date(t.deadline).getTime() < now;
                return (
                  <button
                    key={t.id}
                    onClick={() => onNavigateToTask?.(t.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:bg-muted/50"
                  >
                    {t.is_completed ? (
                      <CheckSquare className="h-4 w-4 shrink-0 text-tag-green" />
                    ) : (
                      <CircleDot className={cn("h-4 w-4 shrink-0", isOverdue ? "text-destructive" : "text-muted-foreground")} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-sm", t.is_completed && "text-muted-foreground line-through")}>{t.title}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {t.assigneeName && (<><UserCheck className="h-3 w-3" /> {t.assigneeName}</>)}
                        {t.deadline && (
                          <>
                            <CalendarClock className="h-3 w-3" />
                            <span className={cn(isOverdue && "font-medium text-destructive")}>{isOverdue ? "⚠ " : ""}{fmtDate(t.deadline)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
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
            <div className="mx-auto max-w-2xl space-y-2 p-4 sm:p-5">
              <h3 className="mb-1 text-sm font-semibold">Поручения по клиенту</h3>
              {assignments.length === 0 && (
                <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                  <UserCheck className="h-4 w-4" />
                  Делегированные задачи по клиенту появятся здесь
                </div>
              )}
              {assignments.map((a) => {
                const isOverdue = !a.is_completed && a.deadline && new Date(a.deadline).getTime() < now;
                return (
                  <button
                    key={a.id}
                    onClick={() => onNavigateToTask?.(a.id)}
                    className="block w-full rounded-xl border border-border bg-card px-3 py-3 text-left hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 shrink-0 text-tag-purple" />
                      <span className="flex-1 truncate text-sm font-medium">{a.title}</span>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px]", a.is_completed ? "bg-tag-green/15 text-tag-green" : "bg-tag-purple/15 text-tag-purple")}>
                        {a.is_completed ? "Готово" : "В работе"}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 pl-6 text-[11px] text-muted-foreground">
                      {a.assigneeName && (<span>Исполнитель: <b className="font-medium text-foreground">{a.assigneeName}</b></span>)}
                      {a.deadline && (<><Clock className="h-3 w-3" /> <span className={cn(isOverdue && "font-medium text-destructive")}>до {fmtDate(a.deadline)}</span></>)}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
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

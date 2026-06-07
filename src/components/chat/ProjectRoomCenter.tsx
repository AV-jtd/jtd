import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ProjectChat from "@/components/ProjectChat";
import TaskItem from "@/components/TaskItem";
import type { Task } from "@/hooks/useTasks";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/initials";
import {
  MessageSquare, ListChecks, BarChart3, Users, Maximize2, Minimize2, ArrowLeft,
  ListTodo, AlertTriangle, CheckCircle2, TrendingUp,
} from "lucide-react";

type Member = { id: string; name: string; role: string | null; source: "member" | "telegram" | "max" | "web" | "external" };

type RoomData = {
  group: { id: string; name: string; icon: string | null; color: string | null; logo_url: string | null } | null;
  tasks: Task[];
  members: Member[];
};

function useProjectRoomData(groupId: string | null) {
  return useQuery({
    queryKey: ["project_room_data", groupId],
    queryFn: async (): Promise<RoomData> => {
      if (!groupId) return { group: null, tasks: [], members: [] };
      const { data: g } = await supabase
        .from("task_groups")
        .select("id, name, icon, color, logo_url")
        .eq("id", groupId)
        .maybeSingle();
      if (!g) return { group: null, tasks: [], members: [] };

      const { data: tasks } = await supabase
        .from("tasks")
        .select("*, subtasks(*), task_tags(tag_id)")
        .eq("group_id", groupId)
        .order("is_completed", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(200);

      const { data: gm } = await supabase
        .from("group_members")
        .select("user_id, role")
        .eq("group_id", groupId);

      // Кто реально писал в чате (включая зеркала из Telegram/MAX) — чтобы участники
      // отражали фактических собеседников, а не только записи в group_members.
      const { data: msgAuthors } = await supabase
        .from("group_messages" as any)
        .select("user_id, external_author, source")
        .eq("group_id", groupId)
        .limit(2000);

      // Источник по каждому пишущему JTD-пользователю (telegram/max/web).
      const authorSource = new Map<string, Member["source"]>();
      const externalAuthors = new Map<string, Member["source"]>();
      for (const m of (msgAuthors as any[]) || []) {
        const src: Member["source"] =
          m.source === "telegram" ? "telegram" : m.source === "max" ? "max" : "web";
        if (m.user_id) {
          if (!authorSource.has(m.user_id) || src !== "web") authorSource.set(m.user_id, src);
        } else if (m.external_author) {
          if (!externalAuthors.has(m.external_author)) externalAuthors.set(m.external_author, src === "web" ? "external" : src);
        }
      }

      const userIds = [
        ...new Set([
          ...((tasks as any[]) || []).map((t) => t.assigned_to).filter(Boolean),
          ...((gm as any[]) || []).map((m) => m.user_id).filter(Boolean),
          ...authorSource.keys(),
        ]),
      ] as string[];
      const profMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name, email").in("id", userIds);
        for (const p of (profs as any[]) || []) profMap.set(p.id, p.display_name || p.email || "—");
      }

      // Слияние: участники из group_members + все, кто писал в чате (TG/MAX/web) +
      // внешние авторы без аккаунта JTD.
      const memberMap = new Map<string, Member>();
      for (const m of (gm as any[]) || []) {
        if (!m.user_id) continue;
        memberMap.set(m.user_id, {
          id: m.user_id,
          name: profMap.get(m.user_id) || "—",
          role: m.role || null,
          source: authorSource.get(m.user_id) ?? "member",
        });
      }
      for (const [uid, src] of authorSource) {
        if (memberMap.has(uid)) continue;
        memberMap.set(uid, { id: uid, name: profMap.get(uid) || "—", role: "пишет в чате", source: src });
      }
      const members: Member[] = [...memberMap.values()];
      for (const [name, src] of externalAuthors) {
        members.push({ id: `ext-${name}`, name, role: "из чата (без JTD)", source: src });
      }

      return {
        group: { id: g.id, name: g.name, icon: g.icon ?? null, color: g.color ?? null, logo_url: g.logo_url ?? null },
        tasks: ((tasks as any[]) || []) as Task[],
        members,
      };
    },
    enabled: !!groupId,
    staleTime: 1000 * 60,
  });
}

type TabKey = "chat" | "tasks" | "metrics" | "members";

export default function ProjectRoomCenter({
  groupId,
  groupName,
  fullscreen,
  hideHeader,
  onClose,
  onToggleFullscreen,
  onBack,
  onNavigateToTask,
}: {
  groupId: string;
  groupName: string;
  fullscreen?: boolean;
  hideHeader?: boolean;
  onClose: () => void;
  onToggleFullscreen?: () => void;
  onBack?: () => void;
  onNavigateToTask?: (taskId: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("chat");
  const { data } = useProjectRoomData(groupId);
  const tasks = data?.tasks ?? [];
  const group = data?.group;
  const members = data?.members ?? [];

  const now = Date.now();
  const open = tasks.filter((t) => !t.is_completed);
  const completed = tasks.filter((t) => t.is_completed);
  const overdue = open.filter((t) => t.deadline && new Date(t.deadline).getTime() < now);
  const completionRate = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;

  const TABS: { key: TabKey; label: string; icon: typeof MessageSquare; count?: number }[] = [
    { key: "chat", label: "Обсуждение", icon: MessageSquare },
    { key: "tasks", label: "Задачи", icon: ListChecks, count: tasks.length || undefined },
    { key: "metrics", label: "Показатели", icon: BarChart3 },
    { key: "members", label: "Участники", icon: Users, count: members.length || undefined },
  ];

  const avatar = group?.logo_url ? (
    <img src={group.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
  ) : (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base"
      style={{ backgroundColor: (group?.color || "#3b82f6") + "22" }}
    >
      {group?.icon || "📁"}
    </span>
  );

  return (
    <div className="flex h-full flex-col bg-background">
      {/* header */}
      {!hideHeader && (
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4 sm:py-3">
        {onBack && (
          <button onClick={onBack} className="-ml-1 shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted md:hidden" aria-label="Назад">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {avatar}
        <div className="min-w-0">
          <span className="block truncate font-bold tracking-tight">{group?.name || groupName}</span>
          <div className="text-xs text-muted-foreground">проектный чат</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {onToggleFullscreen && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleFullscreen} title={fullscreen ? "Свернуть" : "Развернуть"}>
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
      )}

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
            groupName={group?.name || groupName}
            embedded
            fullscreen={fullscreen}
            onClose={onClose}
            onNavigateToTask={onNavigateToTask}
          />
        )}

        {tab === "tasks" && (
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-2xl space-y-1 p-4 sm:p-5">
              <h3 className="mb-1 text-sm font-semibold">Задачи проекта</h3>
              {tasks.length === 0 && <EmptyState text="В проекте пока нет задач" />}
              {tasks.map((t) => (
                <TaskItem key={t.id} task={t} />
              ))}
            </div>
          </ScrollArea>
        )}

        {tab === "metrics" && (
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-5">
              <h3 className="text-sm font-semibold">Показатели проекта</h3>
              <div className="grid grid-cols-2 gap-3">
                <MetricTile icon={ListTodo} label="В работе" value={open.length} tone="text-tag-blue" />
                <MetricTile icon={AlertTriangle} label="Просрочено" value={overdue.length} tone="text-destructive" />
                <MetricTile icon={CheckCircle2} label="Завершено" value={completed.length} tone="text-tag-green" />
                <MetricTile icon={TrendingUp} label="Всего задач" value={tasks.length} tone="text-primary" />
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between text-sm font-medium">
                  <span>Выполнено по проекту</span>
                  <span className="font-bold">{completionRate}%</span>
                </div>
                <Progress value={completionRate} className="h-1.5" />
              </div>
            </div>
          </ScrollArea>
        )}

        {tab === "members" && (
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-2xl space-y-2 p-4 sm:p-5">
              <h3 className="mb-1 text-sm font-semibold">Участники проекта</h3>
              {members.length === 0 && <EmptyState text="В проекте пока нет участников" />}
              {members.map((m, i) => (
                <div key={`${m.id}-${i}`} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                    {getInitials(m.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                  {(m.source === "telegram" || m.source === "max") && (
                    <span className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold",
                      m.source === "telegram" ? "bg-tag-blue/15 text-tag-blue" : "bg-tag-purple/15 text-tag-purple",
                    )}>
                      {m.source === "telegram" ? "TG" : "MAX"}
                    </span>
                  )}
                  {m.role && <span className="shrink-0 text-[10px] text-muted-foreground">{m.role}</span>}
                </div>
              ))}
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
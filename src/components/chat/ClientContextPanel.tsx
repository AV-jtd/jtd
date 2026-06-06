import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Phone, Mail, MapPin, User as UserIcon, Users, CheckCircle2, AlertTriangle,
  ListTodo, ExternalLink, Camera, Loader2, Pencil, Check, X, MessageSquare,
  FileText, Handshake, Wallet, FolderArchive, History, Tags, StickyNote, GitBranch,
} from "lucide-react";
import ClientAvatar from "@/components/ClientAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/initials";
import { formatDistanceToNowStrict } from "date-fns";
import { ru } from "date-fns/locale";

type EditableField = "contact_name" | "phone" | "email" | "city";

type ClientFields = {
  id: string;
  name: string;
  logo_url: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  rankLabel: string | null;
  territoryLabel: string | null;
  retailLabel: string | null;
};

type FunnelInfo = { taskId: string; stage: string | null; progress: number } | null;
type ActivityItem = { id: string; content: string; author: string; createdAt: string };
type ProtocolItem = { id: string; name: string; date: string | null };

type ClientCtx = {
  client: ClientFields | null;
  managerName: string | null;
  team: { id: string; name: string; role: string | null }[];
  tasks: { id: string; title: string; is_completed: boolean; deadline: string | null }[];
  groupId: string | null;
  funnel: FunnelInfo;
  activity: ActivityItem[];
  protocols: ProtocolItem[];
};

const EMPTY: ClientCtx = {
  client: null, managerName: null, team: [], tasks: [],
  groupId: null, funnel: null, activity: [], protocols: [],
};

function useClientContext(clientId: string | null) {
  return useQuery({
    queryKey: ["client_context", clientId],
    queryFn: async (): Promise<ClientCtx> => {
      if (!clientId) return EMPTY;
      const { data: c } = await supabase
        .from("clients")
        .select("id, name, logo_url, contact_name, phone, email, city, manager_id, rank_tag_id, territory_tag_id, retail_type_tag_id")
        .eq("id", clientId)
        .maybeSingle();
      if (!c) return EMPTY;

      const tagIds = [c.rank_tag_id, c.territory_tag_id, c.retail_type_tag_id].filter(Boolean) as string[];
      const tagMap = new Map<string, string>();
      if (tagIds.length) {
        const { data: tags } = await supabase.from("tags").select("id, name").in("id", tagIds);
        for (const t of (tags as any[]) || []) tagMap.set(t.id, t.name);
      }

      // Команда по клиенту
      const { data: assigns } = await supabase
        .from("client_assignments")
        .select("manager_id, notes")
        .eq("client_id", clientId);

      // Задачи клиента
      const { data: tasksData } = await supabase
        .from("tasks")
        .select("id, title, is_completed, deadline, task_type, source_protocol_id")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(200);
      const tasks = (tasksData as any[]) || [];

      // CRM-комната клиента (для ленты активности)
      const { data: room } = await supabase
        .from("task_groups")
        .select("id")
        .eq("project_type", "crm_client" as any)
        .eq("client_id", clientId as any)
        .maybeSingle();
      const groupId = (room as any)?.id ?? null;

      // Этап воронки — из шагов CRM-задачи воронки
      let funnel: FunnelInfo = null;
      const funnelTask = tasks.find((t) => t.task_type === "crm");
      if (funnelTask) {
        const { data: steps } = await supabase
          .from("subtasks")
          .select("title, is_completed, position")
          .eq("task_id", funnelTask.id)
          .order("position", { ascending: true });
        const list = (steps as any[]) || [];
        const done = list.filter((s) => s.is_completed).length;
        const current = list.find((s) => !s.is_completed);
        funnel = {
          taskId: funnelTask.id,
          stage: current?.title ?? (list.length ? "Завершена" : null),
          progress: list.length ? Math.round((done / list.length) * 100) : 0,
        };
      }

      // Лента активности — сообщения CRM-комнаты
      let activity: ActivityItem[] = [];
      const activityAuthorIds = new Set<string>();
      let rawMsgs: any[] = [];
      if (groupId) {
        const { data: msgs } = await supabase
          .from("group_messages")
          .select("id, content, created_at, user_id, external_author, kind")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false })
          .limit(6);
        rawMsgs = ((msgs as any[]) || []).filter((m) => m.kind !== "log");
        for (const m of rawMsgs) if (m.user_id) activityAuthorIds.add(m.user_id);
      }

      // Протоколы/встречи — производные от source_protocol_id задач клиента
      let protocols: ProtocolItem[] = [];
      const protocolIds = [...new Set(tasks.map((t) => t.source_protocol_id).filter(Boolean))] as string[];
      if (protocolIds.length) {
        const { data: protos } = await supabase
          .from("task_groups")
          .select("id, name, created_at")
          .in("id", protocolIds);
        protocols = ((protos as any[]) || []).map((p) => ({ id: p.id, name: p.name, date: p.created_at }));
      }

      // Единый словарь профилей: ответственные + команда + авторы ленты
      const managerIds = [
        ...new Set([
          c.manager_id,
          ...((assigns as any[]) || []).map((a) => a.manager_id),
          ...activityAuthorIds,
        ].filter(Boolean)),
      ] as string[];
      const profMap = new Map<string, string>();
      if (managerIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, display_name, email").in("id", managerIds);
        for (const p of (profs as any[]) || []) profMap.set(p.id, p.display_name || p.email || "—");
      }
      const team = ((assigns as any[]) || [])
        .filter((a) => a.manager_id)
        .map((a) => ({ id: a.manager_id, name: profMap.get(a.manager_id) || "—", role: a.notes || null }));

      activity = rawMsgs.map((m) => ({
        id: m.id,
        content: m.content || "",
        author: (m.user_id ? profMap.get(m.user_id) : null) || m.external_author || "—",
        createdAt: m.created_at,
      }));

      return {
        client: {
          id: c.id,
          name: c.name,
          logo_url: c.logo_url,
          contact_name: c.contact_name,
          phone: c.phone,
          email: c.email,
          city: c.city,
          rankLabel: c.rank_tag_id ? tagMap.get(c.rank_tag_id) ?? null : null,
          territoryLabel: c.territory_tag_id ? tagMap.get(c.territory_tag_id) ?? null : null,
          retailLabel: c.retail_type_tag_id ? tagMap.get(c.retail_type_tag_id) ?? null : null,
        },
        managerName: c.manager_id ? profMap.get(c.manager_id) ?? null : null,
        team,
        tasks: tasks.map((t) => ({ id: t.id, title: t.title, is_completed: t.is_completed, deadline: t.deadline })),
        groupId,
        funnel,
        activity,
        protocols,
      };
    },
    enabled: !!clientId,
    staleTime: 1000 * 60,
  });
}

function Kpi({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2.5">
      <div className={cn("flex items-center gap-1.5 text-[10px] font-medium", tone)}>
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-lg font-bold leading-none">{value}</div>
    </div>
  );
}

export default function ClientContextPanel({
  clientId,
  onNavigateToTask,
}: {
  clientId: string | null;
  onNavigateToTask?: (taskId: string) => void;
}) {
  const { data, isLoading } = useClientContext(clientId);
  const client = data?.client;

  if (!clientId) return null;

  if (isLoading || !client) {
    return (
      <div className="flex h-full items-center justify-center bg-card text-xs text-muted-foreground">
        {isLoading ? "Загрузка…" : "Клиент не найден"}
      </div>
    );
  }

  const open = data!.tasks.filter((t) => !t.is_completed);
  const completed = data!.tasks.filter((t) => t.is_completed);
  const now = Date.now();
  const overdue = open.filter((t) => t.deadline && new Date(t.deadline).getTime() < now);

  return (
    <div className="flex h-full flex-col bg-card">
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Карточка клиента */}
          <div className="flex items-start gap-3">
            <ClientAvatar client={client} size="lg" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold">{client.name}</h3>
              <div className="mt-1 flex flex-wrap gap-1">
                {client.rankLabel && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {client.rankLabel}
                  </span>
                )}
                {client.territoryLabel && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {client.territoryLabel}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Контакты */}
          <div className="space-y-1.5 text-xs">
            {client.contact_name && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <UserIcon className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{client.contact_name}</span>
              </div>
            )}
            {client.phone && (
              <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{client.phone}</span>
              </a>
            )}
            {client.email && (
              <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{client.email}</span>
              </a>
            )}
            {client.city && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{client.city}</span>
              </div>
            )}
          </div>

          {/* KPI */}
          <div className="grid grid-cols-3 gap-2">
            <Kpi icon={ListTodo} label="В работе" value={open.length} tone="text-tag-blue" />
            <Kpi icon={AlertTriangle} label="Просрочено" value={overdue.length} tone="text-destructive" />
            <Kpi icon={CheckCircle2} label="Готово" value={completed.length} tone="text-tag-green" />
          </div>

          {/* Команда */}
          {(data!.managerName || data!.team.length > 0) && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
                <Users className="h-3 w-3" /> Команда по клиенту
              </h4>
              <div className="space-y-1.5">
                {data!.managerName && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary">
                      {getInitials(data!.managerName)}
                    </span>
                    <span className="truncate">{data!.managerName}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">ответственный</span>
                  </div>
                )}
                {data!.team.map((m, i) => (
                  <div key={`${m.id}-${i}`} className="flex items-center gap-2 text-xs">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-semibold">
                      {getInitials(m.name)}
                    </span>
                    <span className="truncate">{m.name}</span>
                    {m.role && <span className="ml-auto truncate text-[10px] text-muted-foreground">{m.role}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ключевые задачи */}
          {open.length > 0 && (
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">Ключевые задачи</h4>
              <div className="space-y-1">
                {open.slice(0, 8).map((t) => {
                  const isOverdue = t.deadline && new Date(t.deadline).getTime() < now;
                  return (
                    <button
                      key={t.id}
                      onClick={() => onNavigateToTask?.(t.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isOverdue ? "bg-destructive" : "bg-tag-blue")} />
                      <span className="truncate">{t.title}</span>
                      <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

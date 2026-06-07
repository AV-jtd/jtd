import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useThreads } from "./useMessenger";
import { toast } from "sonner";

/**
 * Чат-комнаты для полноэкранного режима.
 *
 * Комната — это запись `task_groups`. Два вида:
 *   • обычный проект (project_type ≠ 'crm_client') — показываем только если в нём
 *     есть переписка (берём из агрегатов мессенджера);
 *   • CRM-комната клиента (project_type='crm_client', задан client_id) —
 *     показываем всегда, даже без сообщений, с карточкой клиента.
 */
export type ChatRoom = {
  groupId: string;
  /** thread id в формате мессенджера: `group-<uuid>` (для unread/markRead). */
  threadId: string;
  name: string;
  isClientRoom: boolean;
  /** Чат-комната задачи (открывается как overlay поверх чата). */
  isTaskRoom?: boolean;
  /** id задачи для task-комнат. */
  taskId?: string;
  /** имя родительского проекта (подзаголовок task-комнаты). */
  parentName?: string | null;
  taskCompleted?: boolean;
  client?: { name: string; logo_url: string | null; rankLabel: string | null } | null;
  groupIcon: string | null;
  groupColor: string | null;
  groupLogoUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageAuthor: string | null;
  lastMessageUserId: string | null;
};

export function useChatRooms() {
  const { user } = useAuth();
  const { data: threads = [] } = useThreads("chat");

  const roomsQuery = useQuery({
    queryKey: ["chat_rooms", user?.id],
    queryFn: async () => {
      // CRM-комнаты клиента
      const { data: crmGroups } = await supabase
        .from("task_groups")
        .select("id, name, icon, color, logo_url, client_id")
        .eq("project_type", "crm_client" as any);

      const groups = (crmGroups as any[]) || [];
      const clientIds = [...new Set(groups.map((g) => g.client_id).filter(Boolean))];

      const clientMap = new Map<string, { name: string; logo_url: string | null; rank_tag_id: string | null }>();
      if (clientIds.length > 0) {
        const { data: clients } = await supabase
          .from("clients")
          .select("id, name, logo_url, rank_tag_id")
          .in("id", clientIds);
        for (const c of (clients as any[]) || []) clientMap.set(c.id, c);
      }

      const rankTagIds = [...new Set([...clientMap.values()].map((c) => c.rank_tag_id).filter(Boolean))] as string[];
      const rankMap = new Map<string, string>();
      if (rankTagIds.length > 0) {
        const { data: tags } = await supabase.from("tags").select("id, name").in("id", rankTagIds);
        for (const t of (tags as any[]) || []) rankMap.set(t.id, t.name);
      }

      return groups.map((g) => {
        const client = g.client_id ? clientMap.get(g.client_id) : null;
        return {
          groupId: g.id as string,
          client: client
            ? { name: client.name, logo_url: client.logo_url, rankLabel: client.rank_tag_id ? rankMap.get(client.rank_tag_id) ?? null : null }
            : null,
          icon: g.icon ?? null,
          color: g.color ?? null,
          logo_url: g.logo_url ?? null,
          name: g.name as string,
        };
      });
    },
    enabled: !!user,
    staleTime: 1000 * 60,
  });

  const crmRooms = roomsQuery.data ?? [];
  const crmGroupIds = new Set(crmRooms.map((r) => r.groupId));

  // thread map by groupId
  const threadByGroup = new Map(
    threads.filter((t) => t.type === "group" && t.groupId).map((t) => [t.groupId as string, t]),
  );

  const rooms: ChatRoom[] = [];

  // CRM client rooms (always shown)
  for (const r of crmRooms) {
    const th = threadByGroup.get(r.groupId);
    rooms.push({
      groupId: r.groupId,
      threadId: `group-${r.groupId}`,
      name: r.client?.name || r.name,
      isClientRoom: true,
      client: r.client,
      groupIcon: r.icon,
      groupColor: r.color,
      groupLogoUrl: r.client?.logo_url ?? r.logo_url,
      lastMessage: th?.lastMessage ?? null,
      lastMessageAt: th?.lastMessageAt ?? null,
      lastMessageAuthor: th?.lastMessageAuthor ?? null,
      lastMessageUserId: th?.lastMessageUserId ?? null,
    });
  }

  // Project rooms with activity (not CRM rooms)
  for (const th of threads) {
    if (th.type !== "group" || !th.groupId) continue;
    if (crmGroupIds.has(th.groupId)) continue;
    rooms.push({
      groupId: th.groupId,
      threadId: th.id,
      name: th.name,
      isClientRoom: false,
      client: null,
      groupIcon: th.groupIcon ?? null,
      groupColor: th.groupColor ?? null,
      groupLogoUrl: th.groupLogoUrl ?? null,
      lastMessage: th.lastMessage,
      lastMessageAt: th.lastMessageAt,
      lastMessageAuthor: th.lastMessageAuthor,
      lastMessageUserId: th.lastMessageUserId,
    });
  }

  // Task rooms (открываются как overlay поверх чата).
  for (const th of threads) {
    if (th.type !== "task" || !th.taskId) continue;
    rooms.push({
      groupId: `task-${th.taskId}`,
      threadId: th.id,
      name: th.name,
      isClientRoom: false,
      isTaskRoom: true,
      taskId: th.taskId,
      parentName: th.groupName ?? null,
      taskCompleted: th.taskCompleted,
      client: null,
      groupIcon: null,
      groupColor: null,
      groupLogoUrl: null,
      lastMessage: th.lastMessage,
      lastMessageAt: th.lastMessageAt,
      lastMessageAuthor: th.lastMessageAuthor,
      lastMessageUserId: th.lastMessageUserId,
    });
  }

  rooms.sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return a.name.localeCompare(b.name);
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });

  return { rooms, isLoading: roomsQuery.isLoading };
}

/**
 * Находит или создаёт CRM-комнату клиента (task_group с project_type='crm_client').
 * Возвращает groupId комнаты.
 */
export function useEnsureClientRoom() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string): Promise<string> => {
      // Уже есть комната?
      const { data: existing } = await supabase
        .from("task_groups")
        .select("id")
        .eq("project_type", "crm_client" as any)
        .eq("client_id", clientId as any)
        .maybeSingle();
      if (existing?.id) return existing.id as string;

      const { data: client } = await supabase
        .from("clients")
        .select("name")
        .eq("id", clientId)
        .maybeSingle();

      const { data: created, error } = await supabase
        .from("task_groups")
        .insert({
          name: client?.name || "Клиент",
          user_id: user!.id,
          project_type: "crm_client",
          client_id: clientId,
          icon: "🏢",
          color: "#3b82f6",
        } as any)
        .select("id")
        .single();
      if (error) {
        // Гонка: другой клиент/вкладка успел создать комнату раньше — БД
        // отклоняет дубль по уникальному индексу (project_type, client_id).
        // Перечитываем существующую вместо падения.
        if ((error as any).code === "23505") {
          const { data: again } = await supabase
            .from("task_groups")
            .select("id")
            .eq("project_type", "crm_client" as any)
            .eq("client_id", clientId as any)
            .maybeSingle();
          if (again?.id) return again.id as string;
        }
        throw error;
      }
      return (created as any).id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat_rooms"] });
      qc.invalidateQueries({ queryKey: ["task_groups"] });
    },
    onError: (e: any) => toast.error(e?.message || "Не удалось открыть чат клиента"),
  });
}

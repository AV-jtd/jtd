import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

/**
 * Событие чата для ленты «Эфир» Комнаты клиента.
 * Собирает последние сообщения `group_messages` по группам, относящимся к клиенту:
 *  - NPD/STM-SKU, у которых `stm_meta.retailer` совпадает с именем клиента (isNpd);
 *  - проектные/CRM-группы клиента (`task_groups.client_id`).
 */
export type ClientChatEvent = {
  id: string;
  time: string;
  actorId: string | null;
  actorName: string | null;
  content: string;
  groupId: string;
  groupName: string;
  isNpd: boolean;
};

export function useClientChatEvents(clientId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["client_chat_events", clientId],
    queryFn: async (): Promise<ClientChatEvent[]> => {
      if (!clientId) return [];

      // --- Имя клиента для матчинга по «Сети» (retailer) ---
      const { data: c } = await supabase
        .from("clients")
        .select("id, name")
        .eq("id", clientId)
        .maybeSingle();
      const clientName = (c?.name || "").trim().toLowerCase();

      const npdGroups = new Map<string, string>(); // id -> name (SKU)
      const otherGroups = new Map<string, string>(); // id -> name (проекты/CRM)

      // --- NPD/STM SKU, у которых «Сеть» = клиент ---
      if (clientName) {
        const { data: skus } = await supabase
          .from("task_groups")
          .select("id, name, stm_meta")
          .eq("project_subtype", "npd_stm" as any);
        for (const g of ((skus as any[]) || [])) {
          const retailer = String(g.stm_meta?.retailer ?? "");
          const parts = retailer
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          if (parts.includes(clientName)) npdGroups.set(g.id, g.name);
        }
      }

      // --- Проектные/CRM-группы клиента ---
      const { data: cg } = await supabase
        .from("task_groups")
        .select("id, name")
        .eq("client_id", clientId as any);
      for (const g of ((cg as any[]) || [])) {
        if (!npdGroups.has(g.id)) otherGroups.set(g.id, g.name);
      }

      const allIds = [...npdGroups.keys(), ...otherGroups.keys()];
      if (!allIds.length) return [];

      // --- Последние сообщения по всем группам клиента ---
      const { data: msgs } = await supabase
        .from("group_messages")
        .select("id, group_id, user_id, content, created_at, external_author, external_message_id")
        .in("group_id", allIds)
        .order("created_at", { ascending: false })
        .limit(80);

      const rows = ((msgs as any[]) || []).filter(
        (m) => (m.content ?? "").trim() && !String(m.external_message_id ?? "").startsWith("task-created:"),
      );

      const userIds = [...new Set(rows.map((m) => m.user_id).filter(Boolean))];
      const nameMap = new Map<string, string>();
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", userIds);
        for (const p of ((profiles as any[]) || [])) {
          nameMap.set(p.id, p.display_name || p.email?.split("@")[0] || "Сотрудник");
        }
      }

      return rows.map((m) => ({
        id: `msg-${m.id}`,
        time: m.created_at,
        actorId: m.user_id ?? null,
        actorName: m.user_id ? (nameMap.get(m.user_id) ?? null) : (m.external_author ?? null),
        content: String(m.content ?? ""),
        groupId: m.group_id,
        groupName: npdGroups.get(m.group_id) ?? otherGroups.get(m.group_id) ?? "чат",
        isNpd: npdGroups.has(m.group_id),
      }));
    },
    enabled: !!user && !!clientId,
    staleTime: 1000 * 30,
  });
}

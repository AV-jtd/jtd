import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type ClientTeamMember = {
  userId: string;
  name: string;
  role: string | null;
};

/**
 * Команда по клиенту: участники из таблицы client_team + их профили.
 * Управление (add/remove) идёт через защищённую функцию manage_client_team,
 * которая параллельно синхронизирует доступ к чат-комнате клиента (group_members).
 */
export function useClientTeam(clientId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["client_team", clientId],
    enabled: !!user && !!clientId,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<ClientTeamMember[]> => {
      const { data: rows } = await supabase
        .from("client_team")
        .select("user_id, role")
        .eq("client_id", clientId!);
      const list = (rows as any[]) || [];
      const ids = [...new Set(list.map((r) => r.user_id).filter(Boolean))] as string[];
      const nameMap = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", ids);
        for (const p of (profs as any[]) || []) nameMap.set(p.id, p.display_name || p.email || "—");
      }
      return list.map((r) => ({
        userId: r.user_id,
        name: nameMap.get(r.user_id) || "—",
        role: r.role || null,
      }));
    },
  });
}

export function useManageClientTeam(clientId: string | null) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["client_team", clientId] });
    qc.invalidateQueries({ queryKey: ["client_context", clientId] });
    qc.invalidateQueries({ queryKey: ["chat_rooms"] });
  };

  const addMember = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role?: string | null }) => {
      if (!clientId) throw new Error("Не выбран клиент");
      const { error } = await supabase.rpc("manage_client_team", {
        _client_id: clientId,
        _member_id: memberId,
        _action: "add",
        _role: role ?? null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message || "Не удалось добавить в команду"),
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      if (!clientId) throw new Error("Не выбран клиент");
      const { error } = await supabase.rpc("manage_client_team", {
        _client_id: clientId,
        _member_id: memberId,
        _action: "remove",
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message || "Не удалось убрать из команды"),
  });

  return { addMember, removeMember };
}
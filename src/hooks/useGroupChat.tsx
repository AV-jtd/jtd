import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type GroupMessage = {
  id: string;
  group_id: string;
  user_id: string;
  reply_to: string | null;
  content: string;
  source: string;
  created_at: string;
  updated_at: string;
  profile?: { display_name: string | null; email: string | null; telegram_username: string | null };
};

export function useGroupMessages(groupId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["group_messages", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_messages" as any)
        .select("*, profile:profiles!group_messages_user_id_fkey(display_name, email, telegram_username)")
        .eq("group_id", groupId!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as GroupMessage[];
    },
    enabled: !!user && !!groupId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!groupId || !user) return;
    const channel = supabase
      .channel(`group_messages_${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_messages", filter: `group_id=eq.${groupId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["group_messages", groupId] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [groupId, user, qc]);

  return query;
}

export function useGroupChatMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const sendMessage = useMutation({
    mutationFn: async ({ group_id, content, reply_to }: { group_id: string; content: string; reply_to?: string | null }) => {
      const { error } = await supabase.from("group_messages" as any).insert({
        group_id,
        user_id: user!.id,
        content,
        reply_to: reply_to || null,
        source: "web",
      });
      if (error) throw error;
    },
    onMutate: async ({ group_id, content, reply_to }) => {
      await qc.cancelQueries({ queryKey: ["group_messages", group_id] });
      const prev = qc.getQueryData<GroupMessage[]>(["group_messages", group_id]);
      const optimistic: GroupMessage = {
        id: `temp-${crypto.randomUUID()}`,
        group_id,
        user_id: user!.id,
        reply_to: reply_to || null,
        content,
        source: "web",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profile: { display_name: user!.user_metadata?.display_name || user!.email || "", email: user!.email || null, telegram_username: null },
      };
      qc.setQueryData<GroupMessage[]>(["group_messages", group_id], (old) => [...(old || []), optimistic]);
      return { prev };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["group_messages", vars.group_id], ctx.prev);
      toast.error("Не удалось отправить сообщение");
    },
    onSettled: (_, __, vars) => qc.invalidateQueries({ queryKey: ["group_messages", vars.group_id] }),
  });

  const deleteMessage = useMutation({
    mutationFn: async ({ id, group_id }: { id: string; group_id: string }) => {
      const { error } = await supabase.from("group_messages" as any).delete().eq("id", id);
      if (error) throw error;
      return group_id;
    },
    onSuccess: (group_id) => qc.invalidateQueries({ queryKey: ["group_messages", group_id] }),
    onError: () => toast.error("Не удалось удалить сообщение"),
  });

  return { sendMessage, deleteMessage };
}

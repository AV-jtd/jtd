import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { channelManager } from "@/lib/channelManager";
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
  /** Name of an external (TG/MAX) sender that has no matched JTD profile. */
  external_author?: string | null;
  /** External id; "task-created:<taskId>" marks a mirrored task-created card. */
  external_message_id?: string | null;
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
        .select("*")
        .eq("group_id", groupId!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      // Fetch profiles for all unique user_ids
      const msgs = (data || []) as unknown as GroupMessage[];
      // IMPORTANT: drop null/undefined — messages mirrored from TG/MAX without a
      // matched JTD profile have user_id === null. Passing null into `.in("id", …)`
      // makes PostgREST reject the whole query (invalid uuid), which previously
      // wiped ALL author names and rendered every message as "Аноним".
      const userIds = [...new Set(msgs.map(m => m.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, email, telegram_username")
          .in("id", userIds);
        const profileMap = new Map((profiles || []).map(p => [p.id, p]));
        msgs.forEach(m => {
          const p = profileMap.get(m.user_id);
          if (p) m.profile = { display_name: p.display_name, email: p.email, telegram_username: p.telegram_username };
        });
      }
      return msgs;
    },
    enabled: !!user && !!groupId,
  });

  // Realtime subscription via shared LRU channel manager (max 5 active chat channels)
  useEffect(() => {
    if (!groupId || !user) return;
    const key = `group_messages_${groupId}`;
    return channelManager.subscribe(
      key,
      () =>
        supabase
          .channel(key)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "group_messages",
              filter: `group_id=eq.${groupId}`,
            },
            () => channelManager.notify(key)
          )
          .subscribe(),
      () => qc.invalidateQueries({ queryKey: ["group_messages", groupId] })
    );
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

      // Fire-and-forget: notify Telegram users
      const senderName = user!.user_metadata?.display_name || user!.email || "Аноним";
      supabase.functions.invoke("send-chat-telegram", {
        body: { group_id, content, sender_name: senderName, sender_user_id: user!.id },
      }).catch(e => console.warn("Telegram notify failed:", e));
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

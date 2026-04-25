import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { channelManager } from "@/lib/channelManager";
import { useAuth } from "./useAuth";

export type MessageType = "task_comment" | "group_message";

export type MessageReaction = {
  id: string;
  message_type: MessageType;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

/** Aggregated counts for one message: emoji → list of user_ids who reacted. */
export type ReactionAgg = Record<string, string[]>;

/**
 * Load reactions for a batch of messages of the same type.
 * Subscribes to realtime updates for the lifetime of the hook.
 */
export function useMessageReactions(messageType: MessageType, messageIds: string[]) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const ids = useMemo(() => [...messageIds].sort(), [messageIds.join(",")]);
  const idsKey = ids.join(",");

  const query = useQuery({
    queryKey: ["message_reactions", messageType, idsKey],
    queryFn: async () => {
      if (ids.length === 0) return {} as Record<string, ReactionAgg>;
      const { data, error } = await supabase
        .from("message_reactions" as any)
        .select("*")
        .eq("message_type", messageType)
        .in("message_id", ids);
      if (error) throw error;
      const out: Record<string, ReactionAgg> = {};
      for (const r of (data || []) as unknown as MessageReaction[]) {
        const byMsg = (out[r.message_id] ||= {});
        (byMsg[r.emoji] ||= []).push(r.user_id);
      }
      return out;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  // Realtime: одна подписка на тип сообщения через channelManager.
  useEffect(() => {
    if (!user) return;
    const key = `message_reactions_${messageType}`;
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
              table: "message_reactions",
              filter: `message_type=eq.${messageType}`,
            },
            () => channelManager.notify(key),
          )
          .subscribe(),
      () => qc.invalidateQueries({ queryKey: ["message_reactions", messageType] }),
    );
  }, [messageType, user, qc]);

  return query;
}

export function useToggleReaction() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      messageType,
      messageId,
      emoji,
      hasMine,
    }: {
      messageType: MessageType;
      messageId: string;
      emoji: string;
      hasMine: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");
      if (hasMine) {
        const { error } = await supabase
          .from("message_reactions" as any)
          .delete()
          .eq("message_type", messageType)
          .eq("message_id", messageId)
          .eq("user_id", user.id)
          .eq("emoji", emoji);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("message_reactions" as any).insert({
          message_type: messageType,
          message_id: messageId,
          user_id: user.id,
          emoji,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["message_reactions", vars.messageType] });
    },
  });
}

/** Track personal "recently used" reactions in localStorage. */
const RECENT_KEY = "jtd_reactions_recent_v1";
const RECENT_MAX = 6;

export function getRecentReactions(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentReaction(emoji: string) {
  try {
    const cur = getRecentReactions().filter((e) => e !== emoji);
    cur.unshift(emoji);
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, RECENT_MAX)));
  } catch {
    /* ignore */
  }
}
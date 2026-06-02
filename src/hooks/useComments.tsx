import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { channelManager } from "@/lib/channelManager";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type TaskComment = {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  /** message — живой текст; system — системная карточка про связь задач; log — авто-лог изменений. */
  kind?: "message" | "system" | "log";
  meta?: { changes?: Array<{ field: string; old: unknown; new: unknown }> } | null;
  /** ID сообщения, на которое это сообщение является ответом (thread/reply). */
  reply_to?: string | null;
};

export function useTaskComments(taskId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Real-time subscription via shared LRU channel manager (max 5 active chat channels)
  useEffect(() => {
    if (!user || !taskId) return;
    const key = `task-comments-${taskId}`;
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
              table: "task_comments",
              filter: `task_id=eq.${taskId}`,
            },
            () => channelManager.notify(key)
          )
          .subscribe(),
      () => qc.invalidateQueries({ queryKey: ["task_comments", taskId] })
    );
  }, [user, taskId, qc]);

  return useQuery({
    queryKey: ["task_comments", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_comments" as any)
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TaskComment[];
    },
    enabled: !!user && !!taskId,
  });
}

export function useCommentMutations() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const addComment = useMutation({
    mutationFn: async ({ task_id, content, reply_to }: { task_id: string; content: string; reply_to?: string | null }) => {
      const { error } = await supabase.from("task_comments" as any).insert({
        task_id,
        user_id: user!.id,
        content,
        reply_to: reply_to ?? null,
      });
      if (error) throw error;
    },
    onMutate: async ({ task_id, content, reply_to }) => {
      await qc.cancelQueries({ queryKey: ["task_comments", task_id] });
      const prev = qc.getQueryData<TaskComment[]>(["task_comments", task_id]);
      const optimistic: TaskComment = {
        id: `temp-${crypto.randomUUID()}`,
        task_id,
        user_id: user!.id,
        content,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reply_to: reply_to ?? null,
      };
      qc.setQueryData<TaskComment[]>(
        ["task_comments", task_id],
        (old) => [...(old || []), optimistic],
      );
      return { prev };
    },
    onError: (e, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["task_comments", vars.task_id], ctx.prev);
      toast.error(e.message);
    },
    onSettled: (_, __, vars) =>
      qc.invalidateQueries({ queryKey: ["task_comments", vars.task_id] }),
  });

  const deleteComment = useMutation({
    mutationFn: async ({ id, task_id }: { id: string; task_id: string }) => {
      const { error } = await supabase.from("task_comments" as any).delete().eq("id", id);
      if (error) throw error;
      return task_id;
    },
    onMutate: async ({ id, task_id }) => {
      await qc.cancelQueries({ queryKey: ["task_comments", task_id] });
      const prev = qc.getQueryData<TaskComment[]>(["task_comments", task_id]);
      qc.setQueryData<TaskComment[]>(
        ["task_comments", task_id],
        (old) => (old || []).filter((c) => c.id !== id),
      );
      return { prev };
    },
    onError: (e, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["task_comments", vars.task_id], ctx.prev);
      toast.error(e.message);
    },
    onSettled: (_, __, vars) =>
      qc.invalidateQueries({ queryKey: ["task_comments", vars.task_id] }),
  });

  return { addComment, deleteComment };
}

/**
 * Bulk-fetch which task IDs have at least one comment.
 * Used by TaskList to highlight the chat icon without doing N per-task queries.
 */
export function useTasksWithComments(taskIds: string[]) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const sortedIds = [...taskIds].sort();
  const key = sortedIds.join(",");

  // Invalidate this aggregated query whenever ANY comment changes for the current user.
  useEffect(() => {
    if (!user || sortedIds.length === 0) return;
    const chKey = `task-comments-presence-${user.id}`;
    return channelManager.subscribe(
      chKey,
      () =>
        supabase
          .channel(chKey)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "task_comments" },
            () => channelManager.notify(chKey)
          )
          .subscribe(),
      () => qc.invalidateQueries({ queryKey: ["task_comments_presence"] })
    );
  }, [user, sortedIds.length, qc]);

  return useQuery({
    queryKey: ["task_comments_presence", key],
    queryFn: async () => {
      if (sortedIds.length === 0) return new Set<string>();
      const set = new Set<string>();
      // Batch to avoid URL length limits when many task IDs are involved.
      const BATCH = 200;
      for (let i = 0; i < sortedIds.length; i += BATCH) {
        const chunk = sortedIds.slice(i, i + BATCH);
        const { data, error } = await supabase
          .from("task_comments" as any)
          .select("task_id")
          .in("task_id", chunk)
          // Считаем только реальные сообщения/системные карточки —
          // автоматические лог-записи (изменения полей) не должны
          // подсвечивать иконку чата как «есть обсуждение».
          .neq("kind", "log");
        if (error) throw error;
        for (const row of (data || []) as unknown as { task_id: string }[]) set.add(row.task_id);
      }
      return set;
    },
    enabled: !!user && sortedIds.length > 0,
    staleTime: 30_000,
  });
}

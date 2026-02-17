import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type TaskComment = {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export function useTaskComments(taskId: string | null) {
  const { user } = useAuth();
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
    mutationFn: async ({ task_id, content }: { task_id: string; content: string }) => {
      const { error } = await supabase.from("task_comments" as any).insert({
        task_id,
        user_id: user!.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["task_comments", vars.task_id] }),
    onError: (e) => toast.error(e.message),
  });

  const deleteComment = useMutation({
    mutationFn: async ({ id, task_id }: { id: string; task_id: string }) => {
      const { error } = await supabase.from("task_comments" as any).delete().eq("id", id);
      if (error) throw error;
      return task_id;
    },
    onSuccess: (task_id) => qc.invalidateQueries({ queryKey: ["task_comments", task_id] }),
    onError: (e) => toast.error(e.message),
  });

  return { addComment, deleteComment };
}

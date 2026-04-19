import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Закрывает все мягкие задачи «Изучить, доработать протокол»
 * (task_type='protocol_review') для указанного протокола с заданным результатом.
 */
async function closeProtocolReviews(protocolId: string, resultLabel: string) {
  await supabase
    .from("tasks")
    .update({
      is_completed: true,
      completed_at: new Date().toISOString(),
      closure_result: resultLabel,
    })
    .eq("source_protocol_id", protocolId)
    .eq("task_type", "protocol_review")
    .eq("is_completed", false);
}

/**
 * Публикация черновика протокола:
 * 1. Снимает is_draft=true со всех задач проекта.
 * 2. Меняет draft_status проекта на 'published'.
 * 3. Авто-закрывает мягкие задачи «Изучить, доработать протокол»
 *    с результатом «Опубликовано».
 *
 * После этого срабатывают обычные RLS — задачи станут видны исполнителям.
 */
export function usePublishProtocol() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error: tasksErr } = await supabase
        .from("tasks")
        .update({ is_draft: false })
        .eq("group_id", groupId)
        .eq("is_draft", true);
      if (tasksErr) throw tasksErr;

      const { error: groupErr } = await supabase
        .from("task_groups")
        .update({ draft_status: "published" })
        .eq("id", groupId);
      if (groupErr) throw groupErr;

      // Close soft "review" tasks
      await closeProtocolReviews(groupId, "Опубликовано");

      return { groupId };
    },
    onSuccess: () => {
      toast.success("Протокол опубликован");
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => {
      toast.error("Не удалось опубликовать: " + e.message);
    },
  });
}

export function useDiscardProtocolDraft() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (groupId: string) => {
      // Сначала закрываем review-задачи (у них source_protocol_id, не group_id —
      // каскад их не тронет)
      await closeProtocolReviews(groupId, "Черновик удалён");

      // Затем удаляем сам протокол — каскад снесёт его строки
      const { error } = await supabase.from("task_groups").delete().eq("id", groupId);
      if (error) throw error;
      return { groupId };
    },
    onSuccess: () => {
      toast.success("Черновик удалён");
      qc.invalidateQueries({ queryKey: ["task_groups"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => {
      toast.error("Не удалось удалить: " + e.message);
    },
  });
}

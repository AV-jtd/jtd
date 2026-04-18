import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Сменить статус-тег задачи: снимает все теги из категории protocol_status,
 * присваивает новый (или null = "снять статус"). Дополнительно при выборе
 * "📤 Отправлено" фиксирует sent_at в status_meta.
 */
export function useSetTaskStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      newTagId,
      newTagName,
      allStatusTagIds,
      currentStatusMeta,
    }: {
      taskId: string;
      newTagId: string | null;
      newTagName: string | null;
      allStatusTagIds: string[];
      currentStatusMeta: Record<string, unknown> | null;
    }) => {
      // 1) Снимаем все статус-теги, кроме нового
      if (allStatusTagIds.length > 0) {
        const toRemove = allStatusTagIds.filter((id) => id !== newTagId);
        if (toRemove.length > 0) {
          const { error } = await supabase
            .from("task_tags")
            .delete()
            .eq("task_id", taskId)
            .in("tag_id", toRemove);
          if (error) throw error;
        }
      }

      // 2) Назначаем новый
      if (newTagId) {
        const { error } = await supabase
          .from("task_tags")
          .upsert({ task_id: taskId, tag_id: newTagId }, { onConflict: "task_id,tag_id" });
        if (error) throw error;
      }

      // 3) Спец-логика "Отправлено" → пишем sent_at, если ещё нет
      const meta = { ...(currentStatusMeta ?? {}) } as Record<string, unknown>;
      const isSent = newTagName?.includes("Отправлено");
      let metaChanged = false;
      if (isSent && !meta.sent_at) {
        meta.sent_at = new Date().toISOString();
        metaChanged = true;
      }
      if (!newTagName && (meta.sent_at as unknown)) {
        // снят статус → не трогаем историю sent_at
      }
      if (metaChanged) {
        const { error } = await supabase
          .from("tasks")
          .update({ status_meta: meta as any })
          .eq("id", taskId);
        if (error) throw error;
      }

      return { taskId, newTagId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: Error) => toast.error("Не удалось сменить статус: " + e.message),
  });
}

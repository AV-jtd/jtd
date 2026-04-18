import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Публикация черновика протокола:
 * 1. Снимает is_draft=true со всех задач проекта.
 * 2. Меняет draft_status проекта на 'published'.
 * После этого срабатывают обычные RLS — задачи станут видны исполнителям.
 *
 * Уведомления (notify-event) сейчас триггерятся при создании задачи на сервере.
 * Для черновика они не отправлялись, потому что задача только что появилась видимой —
 * мы НЕ повторяем insert; в рамках MVP уведомления для черновиков не отправляются
 * массово. Это можно добавить позже отдельным batch-вызовом notify-event.
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
      // Удаляем проект целиком — каскад снесёт задачи
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

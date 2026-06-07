import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import TaskItem from "@/components/TaskItem";
import type { Task } from "@/hooks/useTasks";
import { X } from "lucide-react";

/**
 * Карточка задачи как правый сайдбар полноэкранного чата (не overlay).
 * Используется вместе с TaskRoomCenter: чат по центру + карточка справа.
 */
export default function TaskDetailPanel({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const { data: task, isLoading } = useQuery({
    queryKey: ["single_task_detail", taskId],
    enabled: !!taskId,
    staleTime: 1000 * 15,
    queryFn: async (): Promise<Task | null> => {
      const { data } = await supabase
        .from("tasks")
        .select("*, subtasks(*), task_tags(tag_id)")
        .eq("id", taskId)
        .maybeSingle();
      return ((data as any) ?? null) as Task | null;
    },
  });

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <span className="truncate text-sm font-semibold">Карточка задачи</span>
        <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" title="Скрыть" aria-label="Скрыть">
          <X className="h-4.5 w-4.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {task ? (
          <TaskItem key={task.id} task={task} initialOpen />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {isLoading ? "Загрузка…" : "Задача не найдена"}
          </div>
        )}
      </div>
    </div>
  );
}

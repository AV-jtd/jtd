import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import TaskItem from "@/components/TaskItem";
import type { Task } from "@/hooks/useTasks";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * Overlay для просмотра задачи поверх полноэкранного чата (проекта/клиента).
 * Список чат-комнат и «Чаты задач» остаются под шторкой — пользователь не
 * выпадает из переписки. Использует единый компонент TaskItem (раскрытый).
 */
export default function TaskDetailSheet({
  taskId,
  onClose,
}: {
  taskId: string | null;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();

  const { data: task, isLoading } = useQuery({
    queryKey: ["single_task_detail", taskId],
    enabled: !!taskId,
    staleTime: 1000 * 15,
    queryFn: async (): Promise<Task | null> => {
      if (!taskId) return null;
      const { data } = await supabase
        .from("tasks")
        .select("*, subtasks(*), task_tags(tag_id)")
        .eq("id", taskId)
        .maybeSingle();
      return ((data as any) ?? null) as Task | null;
    },
  });

  return (
    <Sheet open={!!taskId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "p-0 border-border bg-background overflow-hidden flex flex-col",
          isMobile ? "h-[90dvh] rounded-t-2xl" : "w-[480px] sm:max-w-[480px]",
        )}
      >
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {task ? (
            <TaskItem key={task.id} task={task} initialOpen />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {isLoading ? "Загрузка…" : "Задача не найдена"}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

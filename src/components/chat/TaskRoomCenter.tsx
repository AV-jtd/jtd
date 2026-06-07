import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import TaskChat from "@/components/TaskChat";
import { useAvailableUsers } from "@/hooks/useTasks";
import { ArrowLeft, X, PanelRight } from "lucide-react";

/**
 * Центр полноэкранного чата для ОТДЕЛЬНОЙ задачи.
 * Слева остаётся список чатов, справа — карточка задачи (TaskDetailPanel),
 * а здесь по центру живёт сам чат задачи (TaskChat variant="full").
 */
export default function TaskRoomCenter({
  taskId,
  onBack,
  onClose,
  onShowInfo,
  onNavigateToTask,
}: {
  taskId: string;
  onBack?: () => void;
  onClose?: () => void;
  onShowInfo?: () => void;
  onNavigateToTask?: (taskId: string) => void;
}) {
  const { data: availableUsers = [] } = useAvailableUsers();
  const { data: task } = useQuery({
    queryKey: ["task_room_center", taskId],
    enabled: !!taskId,
    staleTime: 1000 * 15,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, group_id, is_completed")
        .eq("id", taskId)
        .maybeSingle();
      return (data as any) ?? null;
    },
  });

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        {onBack && (
          <button onClick={onBack} className="-ml-1 rounded-lg p-1 text-muted-foreground hover:bg-muted" title="К списку чатов" aria-label="К списку чатов">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${task?.is_completed ? "line-through opacity-60" : ""}`}>
          {task?.title || "Чат задачи"}
        </span>
        {onShowInfo && (
          <button onClick={onShowInfo} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" title="Карточка задачи" aria-label="Карточка задачи">
            <PanelRight className="h-4 w-4" />
          </button>
        )}
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" title="Закрыть" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {task ? (
          <TaskChat
            taskId={taskId}
            taskTitle={task.title}
            availableUsers={availableUsers}
            variant="full"
            isCompleted={task.is_completed}
            groupId={task.group_id}
            onNavigateToTask={onNavigateToTask}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Загрузка…</div>
        )}
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import TaskChat from "@/components/TaskChat";
import { useAvailableUsers } from "@/hooks/useTasks";
import { ArrowLeft, X, PanelRight, Link2 } from "lucide-react";
import { toast } from "sonner";

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
  onNavigateToGroup,
}: {
  taskId: string;
  onBack?: () => void;
  onClose?: () => void;
  onShowInfo?: () => void;
  onNavigateToTask?: (taskId: string) => void;
  onNavigateToGroup?: (groupId: string) => void;
}) {
  const { data: availableUsers = [] } = useAvailableUsers();
  const { data: task } = useQuery({
    queryKey: ["task_room_center", taskId],
    enabled: !!taskId,
    staleTime: 1000 * 15,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, group_id, is_completed, task_groups:group_id(name)")
        .eq("id", taskId)
        .maybeSingle();
      return (data as any) ?? null;
    },
  });
  const groupName: string | null = task?.task_groups?.name ?? null;

  const copyLink = () => {
    if (!task?.group_id) return;
    const url = `${window.location.origin}/chat/${task.group_id}?task=${taskId}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success("Ссылка на чат скопирована"),
      () => toast.error("Не удалось скопировать ссылку"),
    );
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
        {onBack && (
          <button onClick={onBack} className="-ml-1 rounded-lg p-1 text-muted-foreground hover:bg-muted" title="К списку чатов" aria-label="К списку чатов">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1 text-sm">
          {groupName && (
            <>
              <button
                onClick={() => task?.group_id && onNavigateToGroup?.(task.group_id)}
                className="max-w-[40%] truncate text-muted-foreground hover:text-foreground hover:underline"
                title={`Перейти в чат проекта: ${groupName}`}
              >
                {groupName}
              </button>
              <span className="text-muted-foreground/60">/</span>
            </>
          )}
          <span className={`min-w-0 flex-1 truncate font-semibold ${task?.is_completed ? "line-through opacity-60" : ""}`}>
            {task?.title || "Чат задачи"}
          </span>
        </div>
        <button onClick={copyLink} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" title="Скопировать ссылку на чат" aria-label="Скопировать ссылку на чат">
          <Link2 className="h-4 w-4" />
        </button>
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

import { useTasks } from "@/hooks/useTasks";
import TaskItem from "./TaskItem";
import { Archive, Loader2, Inbox } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";

export default function ArchiveView() {
  const { data: tasks = [], isLoading } = useTasks();

  const completedTasks = tasks
    .filter(t => t.is_completed)
    .sort((a, b) => {
      const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
      const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
      return dateB - dateA;
    });

  // Group by completion date
  const grouped = completedTasks.reduce((acc, task) => {
    const dateKey = task.completed_at
      ? format(parseISO(task.completed_at), "yyyy-MM-dd")
      : "unknown";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(task);
    return acc;
  }, {} as Record<string, typeof completedTasks>);

  const dateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  if (isLoading) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Archive className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground leading-tight">Архив</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedTasks.length} выполненных задач
            </p>
          </div>
        </div>

        {completedTasks.length === 0 ? (
          <div className="text-center py-20">
            <div className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-5">
              <Inbox className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <p className="text-base font-medium text-muted-foreground">Архив пуст</p>
            <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-xs mx-auto">
              Выполненные задачи будут появляться здесь
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {dateKeys.map(dateKey => (
              <div key={dateKey}>
                <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider px-1 mb-2">
                  {dateKey === "unknown"
                    ? "Дата неизвестна"
                    : format(parseISO(dateKey), "d MMMM yyyy", { locale: ru })}
                </p>
                <div className="space-y-1.5">
                  {grouped[dateKey].map(task => (
                    <TaskItem key={task.id} task={task} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

import { useSubordinateTasks } from "@/hooks/useTeams";
import TaskItem from "./TaskItem";
import { Users, Loader2, BarChart3, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { isToday, parseISO, isPast } from "date-fns";

export default function SubordinatesView() {
  const { data, isLoading } = useSubordinateTasks();

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

  const members = data?.members || [];
  const tasks = data?.tasks || [];

  if (members.length === 0) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">Подчинённые</h1>
          </div>
          <div className="text-center py-20">
            <div className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-5">
              <Users className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <p className="text-base font-medium text-muted-foreground">Нет подчинённых</p>
            <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-xs mx-auto">
              Создайте команду в настройках и пригласите участников по коду
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Analytics per member
  const memberStats = members.map((m) => {
    const memberTasks = tasks.filter((t: any) => t.user_id === m.id);
    const completed = memberTasks.filter((t: any) => t.is_completed).length;
    const active = memberTasks.filter((t: any) => !t.is_completed).length;
    const overdue = memberTasks.filter(
      (t: any) => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))
    ).length;
    return { ...m, total: memberTasks.length, completed, active, overdue };
  });

  // Overall stats
  const totalTasks = tasks.length;
  const totalCompleted = tasks.filter((t: any) => t.is_completed).length;
  const totalOverdue = tasks.filter(
    (t: any) => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))
  ).length;

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground leading-tight">Подчинённые</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {members.length} чел. · {totalTasks} задач
            </p>
          </div>
        </div>

        {/* Summary analytics */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto mb-1" />
            <p className="text-lg font-semibold">{totalCompleted}</p>
            <p className="text-xs text-muted-foreground">Выполнено</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <Clock className="h-5 w-5 text-blue-500 mx-auto mb-1" />
            <p className="text-lg font-semibold">{totalTasks - totalCompleted}</p>
            <p className="text-xs text-muted-foreground">В работе</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <AlertTriangle className="h-5 w-5 text-red-500 mx-auto mb-1" />
            <p className="text-lg font-semibold">{totalOverdue}</p>
            <p className="text-xs text-muted-foreground">Просрочено</p>
          </div>
        </div>

        {/* Per-member breakdown */}
        <div className="space-y-4">
          {memberStats.map((member) => {
            const memberTasks = tasks.filter((t: any) => t.user_id === member.id);
            const activeTasks = memberTasks.filter((t: any) => !t.is_completed);
            const completedTasks = memberTasks.filter((t: any) => t.is_completed);
            const completionRate = member.total > 0 ? Math.round((member.completed / member.total) * 100) : 0;

            return (
              <div key={member.id} className="bg-card rounded-xl border border-border overflow-hidden">
                {/* Member header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                    {(member.display_name || member.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{member.display_name || member.email}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{member.total} задач</span>
                      <span className="text-green-600">{member.completed} ✓</span>
                      {member.overdue > 0 && <span className="text-red-500">{member.overdue} просрочено</span>}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-16 shrink-0">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground text-right mt-0.5">{completionRate}%</p>
                  </div>
                </div>

                {/* Member tasks */}
                {activeTasks.length > 0 && (
                  <div className="px-2 py-1.5 space-y-1">
                    {activeTasks.slice(0, 5).map((task: any) => (
                      <TaskItem key={task.id} task={task} />
                    ))}
                    {activeTasks.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        ещё {activeTasks.length - 5} задач
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

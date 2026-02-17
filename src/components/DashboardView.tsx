import { useTasks } from "@/hooks/useTasks";
import { BarChart3, Loader2, TrendingUp, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format, subDays, parseISO, startOfDay, isAfter } from "date-fns";
import { ru } from "date-fns/locale";

export default function DashboardView() {
  const { data: tasks = [], isLoading } = useTasks();

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

  const totalTasks = tasks.length;
  const completed = tasks.filter(t => t.is_completed).length;
  const active = totalTasks - completed;
  const overdue = tasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < new Date()).length;
  const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

  // Last 14 days chart data
  const today = startOfDay(new Date());
  const chartData = Array.from({ length: 14 }, (_, i) => {
    const date = subDays(today, 13 - i);
    const dayStr = format(date, "yyyy-MM-dd");
    const created = tasks.filter(t => format(parseISO(t.created_at), "yyyy-MM-dd") === dayStr).length;
    const done = tasks.filter(t => t.completed_at && format(parseISO(t.completed_at), "yyyy-MM-dd") === dayStr).length;
    return {
      date: format(date, "d MMM", { locale: ru }),
      created,
      done,
    };
  });

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-xl">
            📊
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground leading-tight">Дашборд</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{totalTasks} задач всего</p>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl border border-primary/20 p-3 text-center">
            <span className="text-2xl block mb-1">🎯</span>
            <p className="text-lg font-semibold">{completionRate}%</p>
            <p className="text-xs text-muted-foreground">Выполнение</p>
          </div>
          <div className="bg-gradient-to-br from-success/10 to-success/5 rounded-xl border border-success/20 p-3 text-center">
            <span className="text-2xl block mb-1">✅</span>
            <p className="text-lg font-semibold">{completed}</p>
            <p className="text-xs text-muted-foreground">Выполнено</p>
          </div>
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl border border-primary/20 p-3 text-center">
            <span className="text-2xl block mb-1">⏳</span>
            <p className="text-lg font-semibold">{active}</p>
            <p className="text-xs text-muted-foreground">В работе</p>
          </div>
          <div className="bg-gradient-to-br from-destructive/10 to-destructive/5 rounded-xl border border-destructive/20 p-3 text-center">
            <span className="text-2xl block mb-1">🔥</span>
            <p className="text-lg font-semibold">{overdue}</p>
            <p className="text-xs text-muted-foreground">Просрочено</p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm font-medium text-foreground mb-4">📈 Активность за 14 дней</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={24} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="created" name="Создано" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="done" name="Выполнено" fill="hsl(142 71% 45%)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </main>
  );
}

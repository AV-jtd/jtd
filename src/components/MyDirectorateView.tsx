import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMyVisibleDepartments, useMyDirectorateTasks } from "@/hooks/useOrgStructure";
import { useDepartments } from "@/hooks/useDepartments";
import { useAvailableUsers } from "@/hooks/useTasks";
import { Loader2, AlertTriangle, Flame, Sparkles, Building2, ArrowRight } from "lucide-react";
import { isPast, parseISO, isToday, format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

/**
 * Моя Дирекция — сводка по всему поддереву отделов, видимых пользователю
 * (head или явный куратор/директор). Видна только если есть видимые отделы.
 */
export default function MyDirectorateView({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const { user } = useAuth();
  const { data: visible = [], isLoading: visLoading } = useMyVisibleDepartments();
  const { data: tasks = [], isLoading: tasksLoading } = useMyDirectorateTasks();
  const { data: departments = [] } = useDepartments();
  const { data: users = [] } = useAvailableUsers();

  const deptName = (id: string | null | undefined) =>
    id ? departments.find((d) => d.id === id)?.name ?? "?" : "—";
  const userName = (id: string | null | undefined) =>
    id ? users.find((u) => u.id === id)?.display_name ?? "?" : "—";

  const stats = useMemo(() => {
    const live = tasks.filter((t: any) => !t.is_completed);
    const overdue = live.filter((t: any) => t.deadline && isPast(parseISO(t.deadline)));
    const todayCnt = live.filter((t: any) => t.deadline && isToday(parseISO(t.deadline))).length;
    const closed7d = tasks.filter((t: any) => {
      if (!t.is_completed || !t.completed_at) return false;
      return Date.now() - new Date(t.completed_at).getTime() < 7 * 24 * 3600 * 1000;
    }).length;
    const noAssignee = live.filter((t: any) => !t.assigned_to).length;
    return { total: live.length, overdue: overdue.length, today: todayCnt, closed7d, noAssignee, overdueList: overdue };
  }, [tasks]);

  const byDept = useMemo(() => {
    const m = new Map<string, { total: number; overdue: number; closed7d: number }>();
    visible.forEach((id) => m.set(id, { total: 0, overdue: 0, closed7d: 0 }));
    tasks.forEach((t: any) => {
      if (!t.department_id) return;
      const cur = m.get(t.department_id) ?? { total: 0, overdue: 0, closed7d: 0 };
      if (!t.is_completed) {
        cur.total++;
        if (t.deadline && isPast(parseISO(t.deadline))) cur.overdue++;
      } else if (t.completed_at && Date.now() - new Date(t.completed_at).getTime() < 7 * 24 * 3600 * 1000) {
        cur.closed7d++;
      }
      m.set(t.department_id, cur);
    });
    return Array.from(m.entries())
      .map(([id, v]) => ({ id, name: deptName(id), ...v }))
      .filter((row) => row.total + row.closed7d > 0)
      .sort((a, b) => b.overdue - a.overdue || b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, tasks, departments]);

  if (visLoading || tasksLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Вы не руководите ни одним отделом</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Эта вкладка появляется, когда вы назначены руководителем (head) или замом отдела.
          Попросите администратора в разделе «Оргструктура».
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Kpi label="Поддерево" value={visible.length} hint="отделов" />
        <Kpi label="Активных" value={stats.total} hint="задач" />
        <Kpi label="Просрочено" value={stats.overdue} tone="rose" highlight={stats.overdue > 0} />
        <Kpi label="Горят сегодня" value={stats.today} tone="amber" />
        <Kpi label="Закрыто (7д)" value={stats.closed7d} tone="emerald" />
      </div>

      {/* Hero — самое горящее */}
      {stats.overdue > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
            <Flame className="h-4 w-4" />
            {stats.overdue} просроченных задач в вашей дирекции
          </div>
          <div className="space-y-1">
            {stats.overdueList.slice(0, 8).map((t: any) => (
              <button
                key={t.id}
                onClick={() => onOpenTask(t.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-destructive/10"
              >
                <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
                <span className="flex-1 truncate font-medium">{t.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{deptName(t.department_id)}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{userName(t.assigned_to)}</span>
                <span className="shrink-0 text-[10px] font-semibold text-destructive">
                  {format(parseISO(t.deadline), "d MMM", { locale: ru })}
                </span>
              </button>
            ))}
            {stats.overdueList.length > 8 && (
              <p className="text-[11px] text-muted-foreground pt-1">…и ещё {stats.overdueList.length - 8}</p>
            )}
          </div>
        </div>
      )}

      {/* Распределение по отделам */}
      <div className="rounded-lg border border-border bg-card p-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Building2 className="h-3 w-3" /> По отделам поддерева
        </h3>
        <div className="space-y-1">
          {byDept.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">Задач в поддереве пока нет.</p>
          )}
          {byDept.map((row) => (
            <div key={row.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/40">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 truncate text-xs font-medium">{row.name}</span>
              {row.overdue > 0 && (
                <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">⚠ {row.overdue}</span>
              )}
              <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                {row.total}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">+{row.closed7d}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI hint */}
      <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 text-[11px]">
        <div className="flex items-center gap-1 text-violet-700 dark:text-violet-300 font-semibold mb-1">
          <Sparkles className="h-3 w-3" /> ИИ-подсказка
        </div>
        {stats.overdue > 0 ? (
          <p>Сосредоточьтесь на просроченных задачах — это блокирует команды дальше по цепочке.</p>
        ) : stats.noAssignee > 0 ? (
          <p>{stats.noAssignee} задач без ответственного — назначьте, чтобы Inbox отделов не рос.</p>
        ) : (
          <p>Поддерево в норме. Можно посмотреть «Проекты команды» в PMO для кросс-функциональных стыков.</p>
        )}
        <Link to="/pmo" className="inline-flex items-center gap-1 mt-2 text-primary hover:underline">
          К проектам команды <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone, highlight }: { label: string; value: number; hint?: string; tone?: "rose" | "amber" | "emerald"; highlight?: boolean }) {
  const toneClass = tone === "rose"
    ? "text-rose-600 dark:text-rose-400"
    : tone === "amber"
    ? "text-amber-600 dark:text-amber-400"
    : tone === "emerald"
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-foreground";
  return (
    <div className={cn("rounded-lg border border-border bg-card p-2", highlight && "ring-1 ring-destructive/40")}>
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums", toneClass)}>{value}</div>
      {hint && <div className="text-[9px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
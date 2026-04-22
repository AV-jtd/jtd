import { useMemo, useState } from "react";
import ModuleLayout from "@/components/ModuleLayout";
import { useDepartments } from "@/hooks/useDepartments";
import { useDepartmentTasks, useMyDepartmentId } from "@/hooks/useDepartmentTasks";
import { useAvailableUsers, useTaskGroups, useTaskMutations } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import { isPast, parseISO, isToday, differenceInHours, differenceInDays, format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Building2, AlertTriangle, Flame, Inbox, ChevronDown, ChevronRight, Sparkles, Users, FolderOpen, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import TaskItem from "@/components/TaskItem";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Link } from "react-router-dom";
import { filterRealProjects } from "@/lib/projectFilters";

/**
 * /my-department — экран «Мой отдел».
 * Доступен любому пользователю с profiles.department_id != null.
 *
 * Состав:
 *  - 🔥 Hero «горящее» (только если есть мои просроченные / горящие сегодня)
 *  - 📊 KPI шапка (6 метрик)
 *  - 📋 3-колоночный канбан: Inbox отдела / В работе (по людям) / Готово (14д)
 *  - 📊 Сайдбар: нагрузка по людям + ИИ-инсайты
 *  - 🎯 Сворачиваемая секция «Мои задачи в отделе»
 *  - 📁 Сворачиваемая секция «Мои проекты этого отдела»
 */
export default function MyDepartmentPage() {
  const { user } = useAuth();
  const { data: deptId, isLoading: deptIdLoading } = useMyDepartmentId();
  const { data: departments = [] } = useDepartments();
  const { data: tasks = [], isLoading: tasksLoading } = useDepartmentTasks(deptId);
  const { data: users = [] } = useAvailableUsers();
  const { data: groups = [] } = useTaskGroups();
  const { updateTask } = useTaskMutations();

  const department = useMemo(
    () => departments.find((d) => d.id === deptId) ?? null,
    [departments, deptId],
  );
  const head = department?.head_user_id
    ? users.find((u) => u.id === department.head_user_id) ?? null
    : null;
  const isHead = !!user && !!department && department.head_user_id === user.id;

  // === Bucketing ===
  const inbox = useMemo(
    () => tasks.filter((t) => !t.is_completed && !t.assigned_to).sort(sortByDeadline),
    [tasks],
  );
  const inProgress = useMemo(
    () => tasks.filter((t) => !t.is_completed && t.assigned_to).sort(sortByDeadline),
    [tasks],
  );
  const done14d = useMemo(() => {
    const since = Date.now() - 14 * 24 * 3600 * 1000;
    return tasks
      .filter((t) => t.is_completed && t.completed_at && new Date(t.completed_at).getTime() >= since)
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
  }, [tasks]);

  // === KPI ===
  const kpi = useMemo(() => {
    const overdue = tasks.filter((t) => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))).length;
    const closed7d = tasks.filter((t) => {
      if (!t.is_completed || !t.completed_at) return false;
      return Date.now() - new Date(t.completed_at).getTime() < 7 * 24 * 3600 * 1000;
    }).length;
    const leadTimes = tasks
      .filter((t) => t.is_completed && t.completed_at && t.created_at)
      .map((t) => (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / (24 * 3600 * 1000));
    const avgLead = leadTimes.length
      ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length
      : 0;
    const wipPerPerson = inProgress.length / Math.max(1, new Set(inProgress.map((t) => t.assigned_to)).size);
    return { inbox: inbox.length, inProgress: inProgress.length, overdue, closed7d, avgLead, wipPerPerson };
  }, [tasks, inbox.length, inProgress.length]);

  // === My burning tasks (hero + личный фокус) ===
  const myTasks = useMemo(() => tasks.filter((t) => t.assigned_to === user?.id), [tasks, user?.id]);
  const myOverdue = myTasks.filter((t) => !t.is_completed && t.deadline && isPast(parseISO(t.deadline)));
  const myToday = myTasks.filter((t) => !t.is_completed && t.deadline && isToday(parseISO(t.deadline)));
  const heroVisible = myOverdue.length + myToday.length > 0;

  // === Workload ===
  const workload = useMemo(() => {
    const byUser = new Map<string, number>();
    inProgress.forEach((t) => {
      if (!t.assigned_to) return;
      byUser.set(t.assigned_to, (byUser.get(t.assigned_to) ?? 0) + 1);
    });
    return Array.from(byUser.entries())
      .map(([uid, count]) => ({ uid, count, name: users.find((u) => u.id === uid)?.display_name ?? "?" }))
      .sort((a, b) => b.count - a.count);
  }, [inProgress, users]);
  const maxWorkload = Math.max(1, ...workload.map((w) => w.count));

  // === AI insights (rule-based MVP, no extra API call) ===
  const aiInsights = useMemo(() => {
    const ins: { tone: "rose" | "amber" | "blue"; text: string }[] = [];
    const overloaded = workload.find((w) => w.count >= 5);
    if (overloaded) ins.push({ tone: "rose", text: `${overloaded.name} перегружен — ${overloaded.count} задач в работе.` });
    const stuck = inbox.filter((t) => differenceInHours(new Date(), new Date(t.created_at)) > 48).length;
    if (stuck > 0) ins.push({ tone: "amber", text: `${stuck} задач(и) в Inbox >48ч — нужен разбор.` });
    if (kpi.overdue > 0) ins.push({ tone: "rose", text: `${kpi.overdue} просрочено — приоритезируйте.` });
    if (ins.length === 0) ins.push({ tone: "blue", text: "Поток здоровый. Узких мест не видно." });
    return ins;
  }, [workload, inbox, kpi.overdue]);

  // === My projects in this department (where some task has my dept) ===
  const myDeptProjects = useMemo(() => {
    const projectIds = new Set(tasks.filter((t) => t.group_id).map((t) => t.group_id as string));
    return filterRealProjects(groups as any[]).filter((g: any) => projectIds.has(g.id));
  }, [tasks, groups]);

  // === Collapsible sections ===
  const [myTasksOpen, setMyTasksOpen] = useState(myOverdue.length > 0 || myToday.length > 0);
  const [myProjectsOpen, setMyProjectsOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // === Take action ===
  const handleTake = async (taskId: string) => {
    if (!user) return;
    try {
      await supabase.from("tasks").update({ assigned_to: user.id }).eq("id", taskId);
      await supabase
        .from("task_participants")
        .upsert({ task_id: taskId, user_id: user.id, role: "assignee" }, { onConflict: "task_id,user_id" });
      toast.success("Задача взята в работу");
    } catch (e: any) {
      toast.error("Не удалось взять задачу", { description: e?.message });
    }
  };

  // === Edge cases ===
  if (deptIdLoading) {
    return (
      <ModuleLayout header={<AppHeader />}>
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </ModuleLayout>
    );
  }
  if (!deptId) {
    return (
      <ModuleLayout header={<AppHeader />}>
        <div className="mx-auto max-w-md py-20 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Вы пока не в отделе</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Попросите администратора назначить вам отдел в разделе «Подтверждение пользователей», и здесь появится дашборд.
          </p>
        </div>
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout header={<AppHeader />}>
      <div className="mx-auto max-w-7xl space-y-3 p-3 sm:p-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md text-base text-white"
              style={{ background: department?.color ?? "#6366f1" }}
            >
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-foreground">
                {department?.name ?? "Мой отдел"}
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {users.filter((u) => (u as any).department_id === deptId).length || "?"}
                {" чел. "}
                {head ? `· руководитель — ${head.display_name ?? "?"}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Hero */}
        {heroVisible && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-gradient-to-r from-destructive/10 to-amber-500/10 p-3">
            <div className="flex h-9 w-9 shrink-0 animate-pulse items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <Flame className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">
                Сегодня в фокусе:{" "}
                {myOverdue.length > 0 && (
                  <span className="text-destructive">{myOverdue.length} просрочены</span>
                )}
                {myOverdue.length > 0 && myToday.length > 0 && " · "}
                {myToday.length > 0 && (
                  <span className="text-amber-700 dark:text-amber-400">{myToday.length} горят сегодня</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Нажмите «К моим» — прокрутка к личному фокусу ниже.</p>
            </div>
            <button
              onClick={() => {
                setMyTasksOpen(true);
                document.getElementById("my-dept-tasks")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              К моим
            </button>
          </div>
        )}

        {/* KPI */}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          <KpiCard label="Inbox" value={kpi.inbox} tone={kpi.inbox > 0 ? "amber" : "muted"} />
          <KpiCard label="В работе" value={kpi.inProgress} tone="blue" />
          <KpiCard label="Просрочено" value={kpi.overdue} tone={kpi.overdue > 0 ? "rose" : "muted"} highlight={kpi.overdue > 0} />
          <KpiCard label="Закрыто (7д)" value={kpi.closed7d} tone="emerald" />
          <KpiCard label="Lead-time" value={`${kpi.avgLead.toFixed(1)}д`} tone="muted" />
          <KpiCard label="WIP / чел" value={kpi.wipPerPerson.toFixed(1)} tone="muted" />
        </div>

        {/* Kanban + Sidebar */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-3">
            <KanbanColumn
              title="📥 На разбор"
              count={inbox.length}
              tone="amber"
              empty="Нет задач, ожидающих разбора."
            >
              {inbox.slice(0, 30).map((t) => (
                <InboxCard key={t.id} task={t} onTake={() => handleTake(t.id)} onOpen={() => setSelectedTaskId(t.id)} />
              ))}
            </KanbanColumn>
            <KanbanColumn
              title="🔄 В работе"
              count={inProgress.length}
              tone="blue"
              empty="Никто из отдела ничего не делает 😅"
            >
              {inProgress.slice(0, 30).map((t) => (
                <InProgressCard
                  key={t.id}
                  task={t}
                  user={users.find((u) => u.id === t.assigned_to)}
                  onOpen={() => setSelectedTaskId(t.id)}
                />
              ))}
            </KanbanColumn>
            <KanbanColumn
              title="✅ Готово (14д)"
              count={done14d.length}
              tone="emerald"
              empty="За 14 дней ничего не закрыто."
            >
              {done14d.slice(0, 30).map((t) => (
                <DoneCard key={t.id} task={t} user={users.find((u) => u.id === t.assigned_to)} onOpen={() => setSelectedTaskId(t.id)} />
              ))}
            </KanbanColumn>
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                📊 Нагрузка
              </h3>
              {workload.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Никто пока не загружен.</p>
              ) : (
                <div className="space-y-1.5">
                  {workload.slice(0, 8).map((w) => (
                    <div key={w.uid}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="truncate">
                          {w.name}
                          {w.count >= 5 && (
                            <span className="ml-1 rounded bg-violet-500/15 px-1 text-[9px] uppercase text-violet-700 dark:text-violet-300">
                              перегруз
                            </span>
                          )}
                        </span>
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            w.count >= 5 ? "text-rose-600 dark:text-rose-400" : w.count >= 3 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
                          )}
                        >
                          {w.count}
                        </span>
                      </div>
                      <div className="h-1 rounded bg-muted">
                        <div
                          className={cn(
                            "h-1 rounded",
                            w.count >= 5 ? "bg-rose-500" : w.count >= 3 ? "bg-amber-500" : "bg-emerald-500",
                          )}
                          style={{ width: `${(w.count / maxWorkload) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
              <h3 className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                <Sparkles className="h-3 w-3" /> ИИ-инсайты
              </h3>
              <div className="space-y-1.5 text-[11px]">
                {aiInsights.map((i, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "rounded p-1.5",
                      i.tone === "rose" && "bg-rose-500/10 text-rose-800 dark:text-rose-300",
                      i.tone === "amber" && "bg-amber-500/10 text-amber-800 dark:text-amber-300",
                      i.tone === "blue" && "bg-blue-500/10 text-blue-800 dark:text-blue-300",
                    )}
                  >
                    {i.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* My tasks (collapsible) */}
        <section
          id="my-dept-tasks"
          className="overflow-hidden rounded-lg border-2 border-primary/30 bg-card"
        >
          <button
            onClick={() => setMyTasksOpen((v) => !v)}
            className="flex w-full items-center gap-2 bg-primary/10 px-3 py-2 text-left"
          >
            {myTasksOpen ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
            <h2 className="text-sm font-semibold text-primary">🎯 Мои задачи в этом отделе</h2>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">{myTasks.length}</span>
            <div className="ml-auto flex gap-1 text-[10px]">
              {myOverdue.length > 0 && (
                <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">Просроч. {myOverdue.length}</span>
              )}
              {myToday.length > 0 && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">Сегодня {myToday.length}</span>
              )}
            </div>
          </button>
          {myTasksOpen && (
            <div className="divide-y divide-border">
              {myTasks.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">У вас нет задач в этом отделе. 🎉</p>
              ) : (
                myTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTaskId(t.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50",
                      !t.is_completed && t.deadline && isPast(parseISO(t.deadline)) && "bg-destructive/5",
                      !t.is_completed && t.deadline && isToday(parseISO(t.deadline)) && "bg-amber-500/5",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-xs font-medium", t.is_completed && "text-muted-foreground line-through")}>
                        {t.title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                        {t.deadline && (
                          <span
                            className={cn(
                              isPast(parseISO(t.deadline)) && !t.is_completed && "font-semibold text-destructive",
                              isToday(parseISO(t.deadline)) && "font-semibold text-amber-700 dark:text-amber-400",
                            )}
                          >
                            {format(parseISO(t.deadline), "d MMM", { locale: ru })}
                          </span>
                        )}
                        {t.group_id && (
                          <span>📁 {(groups as any[]).find((g) => g.id === t.group_id)?.name ?? "?"}</span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          )}
        </section>

        {/* My projects (collapsible) */}
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <button
            onClick={() => setMyProjectsOpen((v) => !v)}
            className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left"
          >
            {myProjectsOpen ? <ChevronDown className="h-4 w-4 text-foreground" /> : <ChevronRight className="h-4 w-4 text-foreground" />}
            <h2 className="text-sm font-semibold text-foreground">📁 Проекты, где у отдела есть задачи</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
              {myDeptProjects.length}
            </span>
          </button>
          {myProjectsOpen && (
            <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {myDeptProjects.length === 0 ? (
                <p className="col-span-full text-center text-xs text-muted-foreground">
                  Нет проектов, в которых отдел ведёт задачи.
                </p>
              ) : (
                myDeptProjects.map((g: any) => {
                  const inProj = tasks.filter((t) => t.group_id === g.id);
                  const overdueProj = inProj.filter((t) => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))).length;
                  return (
                    <Link
                      key={g.id}
                      to={`/pmo/project/${g.id}`}
                      className="rounded-md border border-border bg-background p-2 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="shrink-0">{g.icon || "📁"}</span>
                        <span className="truncate text-xs font-medium">{g.name}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{inProj.length} задач</span>
                        {overdueProj > 0 && (
                          <span className="rounded bg-destructive/15 px-1 text-destructive">⚠ {overdueProj}</span>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          )}
        </section>
      </div>

      {/* Task details sheet */}
      <Sheet open={!!selectedTaskId} onOpenChange={(v) => !v && setSelectedTaskId(null)}>
        <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto p-4 sm:p-6">
          {selectedTaskId && (
            <TaskItem
              task={tasks.find((t) => t.id === selectedTaskId) as any}
              initialOpen
              sortable={false}
            />
          )}
        </SheetContent>
      </Sheet>
    </ModuleLayout>
  );
}

function sortByDeadline(a: any, b: any) {
  if (!a.deadline && !b.deadline) return 0;
  if (!a.deadline) return 1;
  if (!b.deadline) return -1;
  return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
}

function KpiCard({ label, value, tone, highlight }: { label: string; value: number | string; tone: "amber" | "blue" | "rose" | "emerald" | "muted"; highlight?: boolean }) {
  const toneClass = {
    amber: "text-amber-600 dark:text-amber-400",
    blue: "text-blue-600 dark:text-blue-400",
    rose: "text-rose-600 dark:text-rose-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    muted: "text-foreground",
  }[tone];
  return (
    <div className={cn("rounded-lg border border-border bg-card p-2", highlight && "ring-1 ring-destructive/40")}>
      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums", toneClass)}>{value}</div>
    </div>
  );
}

function KanbanColumn({ title, count, tone, children, empty }: { title: string; count: number; tone: "amber" | "blue" | "emerald"; children: React.ReactNode; empty: string }) {
  const borderClass = {
    amber: "border-amber-500/40",
    blue: "border-blue-500/30",
    emerald: "border-emerald-500/30",
  }[tone];
  const titleClass = {
    amber: "text-amber-700 dark:text-amber-300",
    blue: "text-blue-700 dark:text-blue-300",
    emerald: "text-emerald-700 dark:text-emerald-300",
  }[tone];
  const badgeClass = {
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  }[tone];
  const isEmpty = (children as any[])?.length === 0 || !children;
  return (
    <div className={cn("rounded-lg border bg-card p-2.5", borderClass)}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className={cn("text-[10px] font-semibold uppercase tracking-wide", titleClass)}>{title}</h3>
        <span className={cn("rounded-full px-1.5 text-[10px] font-semibold tabular-nums", badgeClass)}>{count}</span>
      </div>
      <div className="space-y-1.5">
        {isEmpty ? <p className="px-1 py-2 text-[11px] text-muted-foreground">{empty}</p> : children}
      </div>
    </div>
  );
}

function InboxCard({ task, onTake, onOpen }: { task: any; onTake: () => void; onOpen: () => void }) {
  const stuckHrs = differenceInHours(new Date(), new Date(task.created_at));
  const overdue = task.deadline && isPast(parseISO(task.deadline));
  return (
    <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-xs">
      <div className="flex items-start justify-between gap-1">
        <button onClick={onOpen} className="min-w-0 flex-1 truncate text-left font-medium hover:underline">
          {task.title}
        </button>
        {stuckHrs > 48 && (
          <span className="shrink-0 rounded bg-amber-500/30 px-1 text-[9px] uppercase text-amber-900 dark:text-amber-200">
            {Math.floor(stuckHrs / 24)}д
          </span>
        )}
      </div>
      {task.deadline && (
        <div className={cn("mt-0.5 text-[10px]", overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {overdue && <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />}
          {format(parseISO(task.deadline), "d MMM", { locale: ru })}
        </div>
      )}
      <button
        onClick={onTake}
        className="mt-1.5 w-full rounded bg-primary py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
      >
        Взять
      </button>
    </div>
  );
}

function InProgressCard({ task, user, onOpen }: { task: any; user: any; onOpen: () => void }) {
  const overdue = task.deadline && isPast(parseISO(task.deadline)) && !task.is_completed;
  const today = task.deadline && isToday(parseISO(task.deadline));
  return (
    <button
      onClick={onOpen}
      className={cn(
        "block w-full rounded-md border p-2 text-left text-xs hover:bg-muted/50",
        overdue ? "border-destructive/40 bg-destructive/5" : today ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-background",
      )}
    >
      <div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/15 text-[8px] font-semibold text-primary">
          {(user?.display_name ?? "?").slice(0, 1)}
        </div>
        <span className="truncate">{user?.display_name ?? "—"}</span>
      </div>
      <div className="truncate font-medium">{task.title}</div>
      {task.deadline && (
        <div
          className={cn(
            "mt-0.5 text-[10px]",
            overdue ? "font-semibold text-destructive" : today ? "font-semibold text-amber-700 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          {overdue && <AlertTriangle className="mr-0.5 inline h-2.5 w-2.5" />}
          {format(parseISO(task.deadline), "d MMM", { locale: ru })}
        </div>
      )}
    </button>
  );
}

function DoneCard({ task, user, onOpen }: { task: any; user: any; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="block w-full rounded-md border border-border bg-background p-2 text-left text-xs opacity-70 hover:opacity-100">
      <div className="truncate font-medium line-through text-muted-foreground">{task.title}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">
        {user?.display_name ?? "?"} · {task.completed_at && format(parseISO(task.completed_at), "d MMM", { locale: ru })}
      </div>
    </button>
  );
}

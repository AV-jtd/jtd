import { useState, useMemo } from "react";
import { useTasks, useTaskMutations, Task } from "@/hooks/useTasks";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
  addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  addYears, subYears, startOfYear, endOfYear, eachMonthOfInterval,
  parseISO, isPast, differenceInDays,
} from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";

type ViewMode = "day" | "week" | "month" | "year";

interface CalendarViewProps {
  onNavigateToTask?: (task: Task) => void;
}

/** Deadline drift in days (positive = postponed, negative = ahead) */
function getDeadlineDrift(task: Task): number | null {
  if (!task.deadline || !task.original_deadline) return null;
  const current = parseISO(task.deadline);
  const original = parseISO(task.original_deadline);
  const diff = differenceInDays(current, original);
  return diff === 0 ? null : diff;
}

function isOverdue(task: Task): boolean {
  if (task.is_completed || !task.deadline) return false;
  return isPast(parseISO(task.deadline));
}

export default function CalendarView({ onNavigateToTask }: CalendarViewProps) {
  const { data: tasks = [] } = useTasks();
  const { addTask } = useTaskMutations();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingDate, setAddingDate] = useState<string | null>(null);

  const navigate = (dir: 1 | -1) => {
    const fns = { day: [addDays, subDays], week: [addWeeks, subWeeks], month: [addMonths, subMonths], year: [addYears, subYears] };
    setCurrentDate(dir === 1 ? fns[viewMode][0](currentDate, 1) : fns[viewMode][1](currentDate, 1));
  };

  const goToday = () => setCurrentDate(new Date());

  const tasksOnDate = (date: Date) =>
    tasks.filter(t => t.deadline && isSameDay(parseISO(t.deadline), date));

  const handleAddTask = (dateStr: string) => {
    if (newTaskTitle.trim()) {
      addTask.mutate({ title: newTaskTitle.trim(), deadline: dateStr });
      setNewTaskTitle("");
      setAddingDate(null);
    }
  };

  const headerLabel = useMemo(() => {
    switch (viewMode) {
      case "day": return format(currentDate, "d MMMM yyyy", { locale: ru });
      case "week": {
        const s = startOfWeek(currentDate, { weekStartsOn: 1 });
        const e = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(s, "d MMM", { locale: ru })} — ${format(e, "d MMM yyyy", { locale: ru })}`;
      }
      case "month": return format(currentDate, "LLLL yyyy", { locale: ru });
      case "year": return format(currentDate, "yyyy");
    }
  }, [currentDate, viewMode]);

  const viewModes: { id: ViewMode; label: string }[] = [
    { id: "day", label: "День" },
    { id: "week", label: "Неделя" },
    { id: "month", label: "Месяц" },
    { id: "year", label: "Год" },
  ];

  /* ─── Task pill (shared between views) ─── */
  const TaskPill = ({ task, compact = false }: { task: Task; compact?: boolean }) => {
    const overdue = isOverdue(task);
    const drift = getDeadlineDrift(task);

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigateToTask?.(task);
            }}
            className={cn(
              "text-[10px] leading-tight px-1 py-0.5 rounded truncate w-full text-left cursor-pointer transition-colors",
              task.is_completed
                ? "bg-muted text-muted-foreground line-through"
                : overdue
                  ? "bg-destructive/15 text-destructive font-medium"
                  : task.is_important
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary",
              !compact && "hover:opacity-80"
            )}
          >
            <span className="flex items-center gap-0.5">
              {overdue && !task.is_completed && <AlertTriangle className="h-2.5 w-2.5 shrink-0" />}
              <span className="truncate">{task.title}</span>
              {drift !== null && (
                <span className={cn(
                  "shrink-0 text-[8px] font-bold ml-auto",
                  drift > 0 ? "text-destructive" : "text-emerald-600"
                )}>
                  {drift > 0 ? `+${drift}д` : `${drift}д`}
                </span>
              )}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-medium">{task.title}</p>
          {overdue && !task.is_completed && (
            <p className="text-destructive">⚠ Просрочена</p>
          )}
          {drift !== null && (
            <p className={drift > 0 ? "text-destructive" : "text-emerald-600"}>
              {drift > 0 ? <TrendingUp className="inline h-3 w-3 mr-0.5" /> : <TrendingDown className="inline h-3 w-3 mr-0.5" />}
              Сдвиг дедлайна: {drift > 0 ? `+${drift}` : drift} дн.
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  /* ─── Day cell (month / standalone) ─── */
  const DayCell = ({ date, compact = false }: { date: Date; compact?: boolean }) => {
    const dayTasks = tasksOnDate(date);
    const dateStr = format(date, "yyyy-MM-dd");
    const isCurrentMonth = isSameMonth(date, currentDate);
    const hasOverdue = dayTasks.some(t => isOverdue(t));

    return (
      <Popover open={addingDate === dateStr} onOpenChange={(o) => { if (!o) setAddingDate(null); }}>
        <PopoverTrigger asChild>
          <button
            onClick={() => setAddingDate(dateStr)}
            className={cn(
              "relative flex flex-col items-start p-1.5 min-h-[80px] border border-border/50 rounded-md text-left transition-colors hover:bg-accent/30 group",
              !isCurrentMonth && "opacity-40",
              isToday(date) && "bg-primary/10 border-primary/30",
              hasOverdue && !isToday(date) && "border-destructive/30",
              compact && "min-h-[60px]"
            )}
          >
            <span className={cn(
              "text-xs font-medium mb-0.5",
              isToday(date) ? "text-primary font-bold" : "text-foreground"
            )}>
              {format(date, "d")}
            </span>
            <div className="w-full space-y-0.5 overflow-hidden flex-1">
              {dayTasks.slice(0, compact ? 2 : 3).map(t => (
                <TaskPill key={t.id} task={t} compact={compact} />
              ))}
              {dayTasks.length > (compact ? 2 : 3) && (
                <span className="text-[9px] text-muted-foreground px-1">
                  +{dayTasks.length - (compact ? 2 : 3)}
                </span>
              )}
            </div>
            <Plus className="h-3 w-3 absolute top-1 right-1 text-muted-foreground opacity-0 group-hover:opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Новая задача на {format(date, "d MMMM", { locale: ru })}
          </p>
          <form onSubmit={(e) => { e.preventDefault(); handleAddTask(dateStr); }} className="flex gap-2">
            <Input
              autoFocus
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Название..."
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" disabled={!newTaskTitle.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </form>
          {dayTasks.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border space-y-1">
              {dayTasks.map(t => (
                <button
                  key={t.id}
                  onClick={() => onNavigateToTask?.(t)}
                  className={cn(
                    "text-xs px-1 py-0.5 rounded w-full text-left hover:bg-accent/50 transition-colors flex items-center gap-1",
                    t.is_completed && "line-through text-muted-foreground",
                    isOverdue(t) && !t.is_completed && "text-destructive"
                  )}
                >
                  {isOverdue(t) && !t.is_completed && <AlertTriangle className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{t.title}</span>
                  {(() => {
                    const d = getDeadlineDrift(t);
                    if (d === null) return null;
                    return <span className={cn("text-[9px] font-bold ml-auto shrink-0", d > 0 ? "text-destructive" : "text-emerald-600")}>{d > 0 ? `+${d}д` : `${d}д`}</span>;
                  })()}
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  };

  /* ─── Month view ─── */
  const renderMonth = () => {
    const monthStart = startOfMonth(currentDate);
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

    return (
      <div>
        <div className="grid grid-cols-7 gap-1 mb-1">
          {weekDays.map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(d => <DayCell key={d.toISOString()} date={d} />)}
        </div>
      </div>
    );
  };

  /* ─── Week view (vertical layout to prevent overlap) ─── */
  const renderWeek = () => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end: endOfWeek(currentDate, { weekStartsOn: 1 }) });

    return (
      <div className="space-y-2">
        {days.map(d => {
          const dayTasks = tasksOnDate(d);
          const dateStr = format(d, "yyyy-MM-dd");
          const hasOverdue = dayTasks.some(t => isOverdue(t));

          return (
            <div
              key={d.toISOString()}
              className={cn(
                "flex gap-3 p-3 rounded-lg border transition-colors",
                isToday(d) && "border-primary/30 bg-primary/5",
                hasOverdue && !isToday(d) && "border-destructive/20"
              )}
            >
              {/* Date label */}
              <div className={cn(
                "w-16 shrink-0 text-center pt-0.5",
                isToday(d) ? "text-primary" : "text-muted-foreground"
              )}>
                <div className="text-xs font-medium capitalize">
                  {format(d, "EEE", { locale: ru })}
                </div>
                <div className={cn(
                  "text-lg font-bold leading-tight",
                  isToday(d) && "text-primary"
                )}>
                  {format(d, "d")}
                </div>
              </div>

              {/* Tasks list */}
              <div className="flex-1 min-w-0">
                {dayTasks.length === 0 ? (
                  <Popover open={addingDate === dateStr} onOpenChange={(o) => { if (!o) setAddingDate(null); }}>
                    <PopoverTrigger asChild>
                      <button
                        onClick={() => setAddingDate(dateStr)}
                        className="text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
                      >
                        + Добавить задачу
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <form onSubmit={(e) => { e.preventDefault(); handleAddTask(dateStr); }} className="flex gap-2">
                        <Input autoFocus value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="Название..." className="h-8 text-sm" />
                        <Button type="submit" size="sm" disabled={!newTaskTitle.trim()}><Plus className="h-3.5 w-3.5" /></Button>
                      </form>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="space-y-1">
                    {dayTasks.map(t => {
                      const overdue = isOverdue(t);
                      const drift = getDeadlineDrift(t);
                      return (
                        <button
                          key={t.id}
                          onClick={() => onNavigateToTask?.(t)}
                          className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm w-full text-left transition-colors hover:bg-accent/50",
                            t.is_completed ? "line-through text-muted-foreground" : "",
                            overdue && !t.is_completed && "text-destructive"
                          )}
                        >
                          <div className={cn(
                            "h-2 w-2 rounded-full shrink-0",
                            t.is_completed ? "bg-muted-foreground" :
                            overdue ? "bg-destructive" :
                            t.is_important ? "bg-destructive" : "bg-primary"
                          )} />
                          <span className="truncate flex-1">{t.title}</span>
                          {overdue && !t.is_completed && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                          {drift !== null && (
                            <span className={cn(
                              "text-[10px] font-bold shrink-0",
                              drift > 0 ? "text-destructive" : "text-emerald-600"
                            )}>
                              {drift > 0 ? `+${drift}д` : `${drift}д`}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <Popover open={addingDate === dateStr} onOpenChange={(o) => { if (!o) setAddingDate(null); }}>
                      <PopoverTrigger asChild>
                        <button
                          onClick={() => setAddingDate(dateStr)}
                          className="text-xs text-muted-foreground hover:text-foreground py-0.5 pl-2 transition-colors"
                        >
                          + ещё
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3" align="start">
                        <form onSubmit={(e) => { e.preventDefault(); handleAddTask(dateStr); }} className="flex gap-2">
                          <Input autoFocus value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="Название..." className="h-8 text-sm" />
                          <Button type="submit" size="sm" disabled={!newTaskTitle.trim()}><Plus className="h-3.5 w-3.5" /></Button>
                        </form>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /* ─── Day view ─── */
  const renderDay = () => {
    const dayTasks = tasksOnDate(currentDate);
    const dateStr = format(currentDate, "yyyy-MM-dd");

    return (
      <div className="max-w-md mx-auto">
        <div className={cn(
          "rounded-lg border p-4",
          isToday(currentDate) && "border-primary/30 bg-primary/5"
        )}>
          <h3 className="text-lg font-medium mb-4">
            {format(currentDate, "EEEE, d MMMM", { locale: ru })}
          </h3>
          <form onSubmit={(e) => { e.preventDefault(); handleAddTask(dateStr); }} className="flex gap-2 mb-4">
            <Input
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Добавить задачу..."
              className="h-9 text-sm"
            />
            <Button type="submit" size="sm" disabled={!newTaskTitle.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </form>
          {dayTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Нет задач на этот день</p>
          ) : (
            <div className="space-y-2">
              {dayTasks.map(t => {
                const overdue = isOverdue(t);
                const drift = getDeadlineDrift(t);
                return (
                  <button
                    key={t.id}
                    onClick={() => onNavigateToTask?.(t)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md border w-full text-left transition-colors hover:bg-accent/30",
                      t.is_completed ? "bg-muted/50 line-through text-muted-foreground" : "bg-card",
                      overdue && !t.is_completed && "border-destructive/40"
                    )}
                  >
                    <div className={cn(
                      "h-2 w-2 rounded-full shrink-0",
                      t.is_completed ? "bg-muted-foreground" :
                      overdue ? "bg-destructive" :
                      t.is_important ? "bg-destructive" : "bg-primary"
                    )} />
                    <span className="text-sm truncate flex-1">{t.title}</span>
                    {overdue && !t.is_completed && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                    {drift !== null && (
                      <span className={cn(
                        "text-[10px] font-bold shrink-0",
                        drift > 0 ? "text-destructive" : "text-emerald-600"
                      )}>
                        {drift > 0 ? `+${drift}д` : `${drift}д`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ─── Year view ─── */
  const renderYear = () => {
    const months = eachMonthOfInterval({
      start: startOfYear(currentDate),
      end: endOfYear(currentDate),
    });

    return (
      <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
        {months.map(month => {
          const monthDays = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
          const monthTaskCount = monthDays.reduce((acc, d) => acc + tasksOnDate(d).length, 0);
          const overdueCount = monthDays.reduce((acc, d) => acc + tasksOnDate(d).filter(t => isOverdue(t)).length, 0);

          return (
            <button
              key={month.toISOString()}
              onClick={() => { setCurrentDate(month); setViewMode("month"); }}
              className={cn(
                "p-3 rounded-lg border text-left transition-colors hover:bg-accent/30",
                isSameMonth(month, new Date()) && "border-primary/30 bg-primary/5"
              )}
            >
              <div className="text-sm font-medium capitalize mb-1">
                {format(month, "LLLL", { locale: ru })}
              </div>
              <div className="text-xs text-muted-foreground">
                {monthTaskCount > 0 ? `${monthTaskCount} задач` : "—"}
              </div>
              {overdueCount > 0 && (
                <div className="text-[10px] text-destructive font-medium mt-0.5">
                  ⚠ {overdueCount} просроч.
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <CalendarIcon className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-semibold text-foreground">Календарь</h1>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={goToday}>
                Сегодня
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-medium ml-2 capitalize">{headerLabel}</h2>
            </div>

            <div className="flex rounded-lg border border-border overflow-hidden">
              {viewModes.map(m => (
                <button
                  key={m.id}
                  onClick={() => setViewMode(m.id)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    viewMode === m.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:bg-accent"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar body */}
          {viewMode === "month" && renderMonth()}
          {viewMode === "week" && renderWeek()}
          {viewMode === "day" && renderDay()}
          {viewMode === "year" && renderYear()}
        </div>
      </main>
    </TooltipProvider>
  );
}

import { useMemo, useState } from "react";
import { useTaskGroups, useAvailableUsers, type TaskGroup, type Profile } from "@/hooks/useTasks";
import { useMilestones, type Milestone, useMilestoneMutations } from "@/hooks/useMilestones";
import { cn } from "@/lib/utils";
import { format, isPast, parseISO, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";
import { Flag, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function MilestonesView() {
  const { data: groups = [] } = useTaskGroups();
  const { data: milestones = [] } = useMilestones();
  const { data: users = [] } = useAvailableUsers();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const userMap = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const groupMap = useMemo(() => {
    const m = new Map<string, TaskGroup>();
    for (const g of groups) m.set(g.id, g);
    return m;
  }, [groups]);

  // Group milestones by project
  const byProject = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    for (const ms of milestones) {
      if (!map.has(ms.group_id)) map.set(ms.group_id, []);
      map.get(ms.group_id)!.push(ms);
    }
    // Sort milestones by planned_date within each group
    for (const [, list] of map) {
      list.sort((a, b) => a.planned_date.localeCompare(b.planned_date));
    }
    return Array.from(map.entries())
      .map(([groupId, items]) => ({ groupId, group: groupMap.get(groupId), items }))
      .filter((g) => g.group)
      .sort((a, b) => (a.group!.name).localeCompare(b.group!.name, "ru"));
  }, [milestones, groupMap]);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Summary stats
  const totalMs = milestones.length;
  const completedMs = milestones.filter((m) => m.status === "completed").length;
  const overdueMs = milestones.filter((m) => m.status !== "completed" && m.planned_date && isPast(parseISO(m.planned_date))).length;
  const upcomingMs = milestones.filter((m) => {
    if (m.status === "completed" || !m.planned_date) return false;
    const d = differenceInDays(parseISO(m.planned_date), new Date());
    return d >= 0 && d <= 14;
  }).length;

  if (milestones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Flag className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Вехи</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">Создайте вехи в проектах через вкладку Гант, чтобы видеть сводку здесь.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 scrollbar-thin">
      {/* Summary */}
      <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
        <span>Всего: <strong className="text-foreground">{totalMs}</strong></span>
        <span>Завершено: <strong className="text-success">{completedMs}</strong></span>
        {overdueMs > 0 && <span>Просрочено: <strong className="text-destructive">{overdueMs}</strong></span>}
        {upcomingMs > 0 && <span>Скоро: <strong className="text-warning">{upcomingMs}</strong></span>}
      </div>

      <div className="space-y-1">
        {byProject.map(({ groupId, group, items }) => {
          const isExpanded = expandedGroups.has(groupId);
          const groupCompleted = items.filter((m) => m.status === "completed").length;
          const groupOverdue = items.filter((m) => m.status !== "completed" && m.planned_date && isPast(parseISO(m.planned_date))).length;

          return (
            <div key={groupId}>
              {/* Project header */}
              <button
                onClick={() => toggleGroup(groupId)}
                className="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: group!.color || "hsl(var(--primary))" }}
                />
                <span className="text-sm font-medium text-foreground truncate">{group!.name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                  {groupCompleted}/{items.length}
                  {groupOverdue > 0 && <span className="text-destructive ml-1.5">⚠ {groupOverdue}</span>}
                </span>
              </button>

              {/* Milestones list */}
              {isExpanded && (
                <div className="ml-6 mb-2 space-y-0.5">
                  {items.map((ms) => {
                    const isCompleted = ms.status === "completed";
                    const isOverdue = !isCompleted && ms.planned_date && isPast(parseISO(ms.planned_date));
                    const daysLeft = ms.planned_date ? differenceInDays(parseISO(ms.planned_date), new Date()) : null;
                    const creator = userMap.get(ms.created_by);

                    return (
                      <div
                        key={ms.id}
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors",
                          isCompleted ? "opacity-60" : "hover:bg-muted/30"
                        )}
                      >
                        {/* Status icon */}
                        {isCompleted ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                        ) : isOverdue ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        ) : (
                          <Flag className="h-3.5 w-3.5 shrink-0" style={{ color: ms.color || "hsl(var(--primary))" }} />
                        )}

                        {/* Name */}
                        <span className={cn("flex-1 truncate", isCompleted && "line-through text-muted-foreground", isOverdue && "text-destructive font-medium")}>
                          {ms.name}
                        </span>

                        {/* Date */}
                        <span className={cn("text-[10px] shrink-0", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                          {ms.planned_date ? format(parseISO(ms.planned_date), "d MMM yyyy", { locale: ru }) : "—"}
                        </span>

                        {/* Days indicator */}
                        {!isCompleted && daysLeft !== null && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className={cn(
                                "text-[9px] px-1 py-0",
                                isOverdue ? "bg-destructive/10 text-destructive" : daysLeft <= 7 ? "bg-warning/10 text-warning" : ""
                              )}>
                                {isOverdue ? `−${Math.abs(daysLeft)}д` : `${daysLeft}д`}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">{isOverdue ? "Дней просрочки" : "Дней до вехи"}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

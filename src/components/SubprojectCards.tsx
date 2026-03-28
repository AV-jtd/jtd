import { useState, useMemo } from "react";
import { TaskGroup, useTaskGroups, useAvailableUsers, Profile, Task } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, ChevronDown, ChevronRight, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { format, differenceInDays, addDays, startOfDay } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

type SubprojectStats = {
  total: number;
  completed: number;
  overdue: number;
  driftCount: number;
  upcomingTasks: Task[];
  overdueTasks: Task[];
  driftTasks: { task: Task; driftDays: number }[];
  timingStatus: "on-track" | "at-risk" | "overdue" | "completed";
};

function computeSubprojectStats(groupId: string, allTasks: Task[], allGroups: TaskGroup[]): SubprojectStats {
  const directTasks = allTasks.filter(t => t.group_id === groupId);
  const childGroups = allGroups.filter(g => g.parent_id === groupId);
  const childTasks = childGroups.flatMap(cg => allTasks.filter(t => t.group_id === cg.id));
  const tasks = [...directTasks, ...childTasks];

  const now = new Date();
  const total = tasks.length;
  const completed = tasks.filter(t => t.is_completed).length;
  const activeTasks = tasks.filter(t => !t.is_completed);

  const overdueTasks = activeTasks
    .filter(t => t.deadline && new Date(t.deadline) < now)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  const weekFromNow = addDays(startOfDay(now), 7);
  const upcomingTasks = activeTasks
    .filter(t => t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  const driftTasks = tasks
    .filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline)
    .map(t => ({ task: t, driftDays: differenceInDays(new Date(t.deadline!), new Date(t.original_deadline!)) }))
    .sort((a, b) => Math.abs(b.driftDays) - Math.abs(a.driftDays));

  let timingStatus: SubprojectStats["timingStatus"] = "on-track";
  if (activeTasks.length === 0 && tasks.length > 0) timingStatus = "completed";
  else if (overdueTasks.length > 0) timingStatus = "overdue";
  else if (driftTasks.length > 0) timingStatus = "at-risk";

  return { total, completed, overdue: overdueTasks.length, driftCount: driftTasks.length, upcomingTasks, overdueTasks, driftTasks, timingStatus };
}

function getTimingLabel(s: SubprojectStats["timingStatus"]) {
  switch (s) {
    case "on-track": return "В графике";
    case "at-risk": return "Drift";
    case "overdue": return "Просрочено";
    case "completed": return "Завершён";
  }
}

function getTimingBadgeClass(s: SubprojectStats["timingStatus"]) {
  switch (s) {
    case "on-track": return "text-emerald-700 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400";
    case "at-risk": return "text-amber-700 bg-amber-500/10 border-amber-500/20 dark:text-amber-400";
    case "overdue": return "text-red-700 bg-red-500/10 border-red-500/20 dark:text-red-400";
    case "completed": return "text-muted-foreground bg-muted border-border";
  }
}

export function SubprojectDashboardCard({ group, allTasks, allGroups, users, onNavigate }: {
  group: TaskGroup;
  allTasks: Task[];
  allGroups: TaskGroup[];
  users: Profile[];
  onNavigate?: (groupId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stats = useMemo(() => computeSubprojectStats(group.id, allTasks, allGroups), [group.id, allTasks, allGroups]);
  const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const userName = (userId: string) => users.find(u => u.id === userId)?.display_name || "—";
  const displayName = group.name.includes("/") ? group.name.split("/").pop()!.trim() : group.name;
  const childSubs = allGroups.filter(g => g.parent_id === group.id);

  return (
    <div className={cn("border border-border rounded-xl overflow-hidden transition-shadow", expanded && "shadow-md")}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-semibold"
          style={{ backgroundColor: group.color || "hsl(var(--primary))" }}
        >
          {group.icon && group.icon !== "list" ? group.icon : displayName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-xs truncate">{displayName}</span>
            <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border font-medium", getTimingBadgeClass(stats.timingStatus))}>
              {getTimingLabel(stats.timingStatus)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 max-w-[100px]">
              <Progress value={pct} className="h-1" />
            </div>
            <span className="text-[10px] text-muted-foreground">{pct}% · {stats.completed}/{stats.total}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[10px] text-muted-foreground">
          {stats.overdue > 0 && (
            <span className="flex items-center gap-0.5 text-destructive font-medium">
              <AlertTriangle className="h-3 w-3" />{stats.overdue}
            </span>
          )}
          {stats.driftCount > 0 && (
            <span className="flex items-center gap-0.5 text-amber-500 font-medium">
              <ArrowRightLeft className="h-3 w-3" />{stats.driftCount}
            </span>
          )}
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 pb-3 pt-2 space-y-3 animate-fade-in">
          {onNavigate && (
            <button
              onClick={() => onNavigate(group.id)}
              className="text-[11px] text-primary hover:text-primary/80 font-medium flex items-center gap-1"
            >
              <FolderOpen className="h-3 w-3" /> Открыть проект
            </button>
          )}

          {childSubs.length > 0 && (
            <DashboardSection title="Подпроекты" count={childSubs.length}>
              <div className="space-y-1.5">
                {childSubs.map(cs => (
                  <SubprojectDashboardCard key={cs.id} group={cs} allTasks={allTasks} allGroups={allGroups} users={users} onNavigate={onNavigate} />
                ))}
              </div>
            </DashboardSection>
          )}

          {stats.overdueTasks.length > 0 && (
            <DashboardSection title="Просроченные" count={stats.overdueTasks.length} variant="destructive">
              <div className="space-y-0.5">
                {stats.overdueTasks.map(t => (
                  <DashboardTaskRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} variant="overdue" />
                ))}
              </div>
            </DashboardSection>
          )}

          {stats.upcomingTasks.length > 0 && (
            <DashboardSection title="Ближайшие дедлайны" count={stats.upcomingTasks.length}>
              <div className="space-y-0.5">
                {stats.upcomingTasks.map(t => (
                  <DashboardTaskRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} />
                ))}
              </div>
            </DashboardSection>
          )}

          {stats.driftTasks.length > 0 && (
            <DashboardSection title="Deadline Drift" count={stats.driftTasks.length} variant="warning">
              <div className="space-y-0.5">
                {stats.driftTasks.map(({ task: t, driftDays }) => (
                  <DashboardTaskRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} drift={driftDays} />
                ))}
              </div>
            </DashboardSection>
          )}

          {stats.total === 0 && childSubs.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-1">Нет задач</p>
          )}
        </div>
      )}
    </div>
  );
}

function DashboardSection({ title, count, children, variant }: {
  title: string; count: number; children: React.ReactNode; variant?: "destructive" | "warning";
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className={cn(
          "text-[11px] font-semibold",
          variant === "destructive" ? "text-destructive" : variant === "warning" ? "text-amber-500" : "text-foreground"
        )}>{title}</span>
        <span className="text-[9px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{count}</span>
      </div>
      {children}
    </div>
  );
}

function DashboardTaskRow({ task, userName, variant, drift }: {
  task: Task; userName: string; variant?: "overdue"; drift?: number;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors text-left">
      <span className={cn(
        "text-[11px] truncate flex-1",
        variant === "overdue" ? "text-destructive" : "text-foreground",
        task.is_completed && "line-through text-muted-foreground"
      )}>
        {task.title}
      </span>
      {drift !== undefined && (
        <span className={cn(
          "text-[9px] font-mono font-semibold shrink-0",
          drift > 0 ? "text-destructive" : "text-emerald-500"
        )}>
          {drift > 0 ? `+${drift}д` : `${drift}д`}
        </span>
      )}
      {task.deadline && (
        <span className="text-[9px] text-muted-foreground shrink-0">
          {format(new Date(task.deadline), "d MMM", { locale: ru })}
        </span>
      )}
      {userName && userName !== "—" && (
        <span className="text-[9px] text-muted-foreground shrink-0 max-w-[70px] truncate">
          {userName}
        </span>
      )}
    </div>
  );
}

export default function SubprojectCards({ parentId, onNavigate }: { parentId: string; onNavigate?: (groupId: string) => void }) {
  const { data: allGroups = [] } = useTaskGroups();
  const { user } = useAuth();

  // Collect all descendant group IDs (parent + children + grandchildren)
  const scopeGroupIds = useMemo(() => {
    const ids = [parentId];
    const collect = (pid: string) => {
      allGroups.filter(g => g.parent_id === pid).forEach(g => {
        ids.push(g.id);
        collect(g.id);
      });
    };
    collect(parentId);
    return ids;
  }, [parentId, allGroups]);

  // Fetch tasks scoped to this project hierarchy (bypasses 1000-row global limit)
  const { data: scopedTasks = [] } = useQuery({
    queryKey: ["subproject-tasks", parentId, scopeGroupIds],
    queryFn: async () => {
      const results: Task[] = [];
      for (let i = 0; i < scopeGroupIds.length; i += 10) {
        const batch = scopeGroupIds.slice(i, i + 10);
        const { data, error } = await supabase
          .from("tasks")
          .select("*, subtasks(*), task_tags(tag_id)")
          .in("group_id", batch)
          .order("position");
        if (error) throw error;
        if (data) results.push(...(data as Task[]));
      }
      return results;
    },
    enabled: !!user && scopeGroupIds.length > 0,
    staleTime: 1000 * 15,
  });

  const subprojects = allGroups.filter(g => g.parent_id === parentId)
    .filter(g => {
      const stats = computeSubprojectStats(g.id, scopedTasks, allGroups);
      return stats.total > 0;
    });

  const { data: availableUsers = [] } = useAvailableUsers();

  if (subprojects.length === 0) return null;
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <FolderOpen className="h-3 w-3" /> Подпроекты
        <span className="text-muted-foreground/60">· {subprojects.length}</span>
      </p>
      <div className="space-y-2 animate-fade-in">
        {subprojects.map(sub => (
          <SubprojectDashboardCard
            key={sub.id}
            group={sub}
            allTasks={scopedTasks}
            allGroups={allGroups}
            users={availableUsers}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

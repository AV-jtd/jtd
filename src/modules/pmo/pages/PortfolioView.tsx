import { useTaskGroups, useTasks, useTags, type TaskGroup, type Task } from "@/hooks/useTasks";
import { useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Folder, Clock, AlertTriangle, TrendingUp, X } from "lucide-react";
import { isPast, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";

interface PortfolioViewProps {
  onOpenGantt?: (projectId: string) => void;
}

export default function PortfolioView({ onOpenGantt }: PortfolioViewProps) {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: allTags = [] } = useTags();
  const { user } = useAuth();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    );
  }, []);

  // Fetch all group_tags in one query
  const { data: allGroupTags = [] } = useQuery({
    queryKey: ["all_group_tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_tags" as any)
        .select("group_id, tag_id") as { data: { group_id: string; tag_id: string }[] | null; error: any };
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const tagMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null }>();
    for (const t of allTags) m.set(t.id, { name: t.name, color: t.color });
    return m;
  }, [allTags]);

  const groupTagsMap = useMemo(() => {
    const m = new Map<string, string[]>();
    // From group_tags table
    for (const gt of allGroupTags) {
      if (!m.has(gt.group_id)) m.set(gt.group_id, []);
      m.get(gt.group_id)!.push(gt.tag_id);
    }
    // From linked_tag_id on groups
    for (const g of groups) {
      if (g.linked_tag_id) {
        if (!m.has(g.id)) m.set(g.id, []);
        if (!m.get(g.id)!.includes(g.linked_tag_id)) {
          m.get(g.id)!.push(g.linked_tag_id);
        }
      }
    }
    // From task_tags of tasks in each project
    for (const task of allTasks) {
      if (task.group_id && task.task_tags) {
        for (const tt of task.task_tags) {
          if (!m.has(task.group_id)) m.set(task.group_id, []);
          if (!m.get(task.group_id)!.includes(tt.tag_id)) {
            m.get(task.group_id)!.push(tt.tag_id);
          }
        }
      }
    }
    return m;
  }, [allGroupTags, groups, allTasks]);

  const rootProjects = useMemo(
    () => groups.filter((g) => !g.parent_id).sort((a, b) => a.position - b.position),
    [groups]
  );

  // Collect all unique tags used across projects for the filter bar
  const usedTags = useMemo(() => {
    const ids = new Set<string>();
    for (const p of rootProjects) {
      const tags = groupTagsMap.get(p.id);
      if (tags) tags.forEach(id => ids.add(id));
    }
    return Array.from(ids)
      .map(id => {
        const t = tagMap.get(id);
        return t ? { id, name: t.name, color: t.color } : null;
      })
      .filter(Boolean) as { id: string; name: string; color: string | null }[];
  }, [rootProjects, groupTagsMap, tagMap]);

  // Filter projects by selected tags (AND logic)
  const filteredProjects = useMemo(() => {
    if (selectedTagIds.length === 0) return rootProjects;
    return rootProjects.filter(p => {
      const pTags = groupTagsMap.get(p.id) || [];
      return selectedTagIds.every(tid => pTags.includes(tid));
    });
  }, [rootProjects, selectedTagIds, groupTagsMap]);

  const projectStats = useMemo(() => {
    const statsMap: Record<string, { total: number; completed: number; overdue: number; driftCount: number; upcoming: number }> = {};
    for (const project of groups) {
      const tasks = allTasks.filter((t) => t.group_id === project.id);
      const total = tasks.length;
      const completed = tasks.filter((t) => t.is_completed).length;
      const overdue = tasks.filter((t) => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))).length;
      const driftCount = tasks.filter((t) => t.original_deadline && t.deadline && t.original_deadline !== t.deadline).length;
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      const upcoming = tasks.filter((t) => !t.is_completed && t.deadline && new Date(t.deadline) <= weekFromNow && !isPast(parseISO(t.deadline))).length;
      statsMap[project.id] = { total, completed, overdue, driftCount, upcoming };
    }
    return statsMap;
  }, [groups, allTasks]);

  const getAggregatedStats = (projectId: string) => {
    const childIds = groups.filter((g) => g.parent_id === projectId).map((g) => g.id);
    const allIds = [projectId, ...childIds];
    return allIds.reduce(
      (acc, id) => {
        const s = projectStats[id] || { total: 0, completed: 0, overdue: 0, driftCount: 0, upcoming: 0 };
        return {
          total: acc.total + s.total,
          completed: acc.completed + s.completed,
          overdue: acc.overdue + s.overdue,
          driftCount: acc.driftCount + s.driftCount,
          upcoming: acc.upcoming + s.upcoming,
        };
      },
      { total: 0, completed: 0, overdue: 0, driftCount: 0, upcoming: 0 }
    );
  };

  const totalAgg = filteredProjects.reduce(
    (acc, p) => {
      const s = getAggregatedStats(p.id);
      return { total: acc.total + s.total, completed: acc.completed + s.completed, overdue: acc.overdue + s.overdue };
    },
    { total: 0, completed: 0, overdue: 0 }
  );

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 scrollbar-thin">
      {/* Tag filter bar */}
      {usedTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {usedTags.map(tag => {
            const isActive = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-transparent text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}
                style={isActive
                  ? { backgroundColor: tag.color || "hsl(var(--primary))", color: "#fff" }
                  : tag.color
                    ? { borderColor: tag.color + "40", color: tag.color }
                    : undefined
                }
              >
                {tag.name}
                {isActive && <X className="h-3 w-3 ml-0.5" />}
              </button>
            );
          })}
          {selectedTagIds.length > 0 && (
            <button
              onClick={() => setSelectedTagIds([])}
              className="text-xs text-muted-foreground hover:text-foreground ml-1"
            >
              Сбросить
            </button>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Проекты" value={filteredProjects.length} />
        <SummaryCard label="Всего задач" value={totalAgg.total} />
        <SummaryCard label="Выполнено" value={totalAgg.completed} accent="success" />
        <SummaryCard label="Просрочено" value={totalAgg.overdue} accent="destructive" />
      </div>

      {/* Project grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filteredProjects.map((project) => {
          const stats = getAggregatedStats(project.id);
          const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
          const children = groups.filter((g) => g.parent_id === project.id);
          const healthColor = stats.overdue > 0 ? "destructive" : stats.upcoming > 0 ? "warning" : "success";
          const projectTags = (groupTagsMap.get(project.id) || [])
            .map(tid => {
              const t = tagMap.get(tid);
              return t ? { id: tid, name: t.name, color: t.color } : null;
            })
            .filter(Boolean) as { id: string; name: string; color: string | null }[];

          return (
            <div
              key={project.id}
              className="rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onOpenGantt?.(project.id)}
            >
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-sm shrink-0"
                  style={{ backgroundColor: (project.color || "#3b82f6") + "18", color: project.color || "#3b82f6" }}
                >
                  {project.icon && project.icon !== "list" ? project.icon : <Folder className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">{project.name}</h3>
                  {children.length > 0 && (
                    <p className="text-xs text-muted-foreground">{children.length} подпроект{children.length > 1 ? (children.length < 5 ? "а" : "ов") : ""}</p>
                  )}
                </div>
                <HealthDot status={healthColor} />
              </div>

              {/* Tags */}
              {projectTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {projectTags.map(tag => (
                    <Badge
                      key={tag.id}
                      variant="secondary"
                      className={cn(
                        "text-[10px] px-1.5 py-0 cursor-pointer hover:opacity-80 transition-opacity",
                        selectedTagIds.includes(tag.id) && "ring-1 ring-foreground/30"
                      )}
                      style={tag.color ? { backgroundColor: tag.color + "20", color: tag.color } : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTag(tag.id);
                      }}
                    >
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Progress bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{stats.completed}/{stats.total} задач</span>
                  <span className="font-medium text-foreground">{progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 text-xs">
                {stats.overdue > 0 && (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    {stats.overdue}
                  </span>
                )}
                {stats.upcoming > 0 && (
                  <span className="flex items-center gap-1 text-warning">
                    <Clock className="h-3 w-3" />
                    {stats.upcoming}
                  </span>
                )}
                {stats.driftCount > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    {stats.driftCount} drift
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredProjects.length === 0 && (
        <div className="text-center text-muted-foreground text-sm mt-12">
          {selectedTagIds.length > 0 ? "Нет проектов с выбранными тегами." : "Нет проектов. Создайте проект в основном интерфейсе задач."}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn(
        "text-2xl font-bold",
        accent === "success" ? "text-success" : accent === "destructive" ? "text-destructive" : "text-foreground"
      )}>
        {value}
      </p>
    </div>
  );
}

function HealthDot({ status }: { status: string }) {
  return (
    <div className={cn(
      "w-2.5 h-2.5 rounded-full shrink-0 mt-1",
      status === "success" && "bg-success",
      status === "warning" && "bg-warning",
      status === "destructive" && "bg-destructive"
    )} />
  );
}

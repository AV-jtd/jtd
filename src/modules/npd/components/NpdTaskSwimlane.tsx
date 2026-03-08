import { useMemo, useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown, ChevronRight, Plus, CheckCircle2,
  AlertTriangle, Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { isPast, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type GateStage = {
  key: string;
  title: string;
  tagName: string;
  color: string;
  textColor: string;
  bgLight: string;
};

interface NpdTaskSwimlaneProps {
  projectId: string;
  allGroups: any[];
  allTasks: any[];
  visibleGates: GateStage[];
  gateTagIds: Set<string>;
  tagIdToGateKey: Map<string, string>;
  gateKeyToTagId: Map<string, string>;
  streamTagById: Map<string, string>;
}

export default function NpdTaskSwimlane({
  projectId, allGroups, allTasks, visibleGates,
  gateTagIds, tagIdToGateKey, gateKeyToTagId, streamTagById,
}: NpdTaskSwimlaneProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("npd-task-collapsed");
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set(); }
  });

  const toggleRow = (key: string) => {
    setCollapsedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem("npd-task-collapsed", JSON.stringify([...next]));
      return next;
    });
  };

  // Stream subprojects of the selected NPD project
  const streamSubprojects = useMemo(() =>
    allGroups.filter((g: any) => g.parent_id === projectId).sort((a: any, b: any) => a.position - b.position),
    [allGroups, projectId]
  );

  // All tasks for this project tree
  const projectTasks = useMemo(() => {
    const groupIds = new Set([projectId, ...streamSubprojects.map((s: any) => s.id)]);
    return allTasks.filter((t: any) => t.group_id && groupIds.has(t.group_id));
  }, [allTasks, projectId, streamSubprojects]);

  // Grid: subproject_id -> gate_key -> tasks[]
  const gridData = useMemo(() => {
    const data: Record<string, Record<string, any[]>> = {};

    data["__root__"] = {};
    for (const gate of visibleGates) data["__root__"][gate.key] = [];

    for (const sub of streamSubprojects) {
      data[sub.id] = {};
      for (const gate of visibleGates) data[sub.id][gate.key] = [];
    }

    for (const task of projectTasks) {
      const taskGateTags = (task.task_tags || [])
        .map((tt: any) => tt.tag_id)
        .filter((id: string) => gateTagIds.has(id));

      const gateKey = taskGateTags.length > 0 ? tagIdToGateKey.get(taskGateTags[0]) : null;
      if (!gateKey) continue;

      const subId = streamSubprojects.find((s: any) => s.id === task.group_id)?.id;
      const rowKey = subId || "__root__";

      if (data[rowKey]?.[gateKey]) {
        data[rowKey][gateKey].push(task);
      }
    }
    return data;
  }, [projectTasks, streamSubprojects, visibleGates, gateTagIds, tagIdToGateKey]);

  // Tasks without gate tag
  const unassignedCount = useMemo(() => {
    return projectTasks.filter((task: any) => {
      const taskGateTags = (task.task_tags || [])
        .map((tt: any) => tt.tag_id)
        .filter((id: string) => gateTagIds.has(id));
      return taskGateTags.length === 0;
    }).length;
  }, [projectTasks, gateTagIds]);

  const handleCreateTask = async (subprojectId: string, gateKey: string, title: string) => {
    if (!title.trim() || !user) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (!uid) return;

      const { data: task, error } = await supabase.from("tasks").insert({
        title: title.trim(),
        user_id: uid,
        group_id: subprojectId,
      }).select("id").single();
      if (error) throw error;

      // Assign gate tag to task
      const gateTagId = gateKeyToTagId.get(gateKey);
      if (gateTagId && task) {
        await supabase.from("task_tags").insert({ task_id: task.id, tag_id: gateTagId });
      }

      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Задача создана");
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    }
  };

  const colWidth = "min-w-[200px] w-[200px]";

  // Summary stats
  const totalTasks = projectTasks.length;
  const completedTasks = projectTasks.filter((t: any) => t.is_completed).length;
  const overdueTasks = projectTasks.filter((t: any) => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))).length;

  return (
    <div className="min-w-max">
      {/* Summary row */}
      <div className="flex items-center gap-4 px-4 py-2 bg-muted/30 border-b border-border text-xs">
        <span className="text-muted-foreground">Задач: <strong className="text-foreground">{totalTasks}</strong></span>
        <span className="text-muted-foreground">Готово: <strong className="text-success">{completedTasks}</strong></span>
        {overdueTasks > 0 && (
          <span className="text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {overdueTasks} просрочено
          </span>
        )}
        {unassignedCount > 0 && (
          <span className="text-warning flex items-center gap-1">
            <Clock className="h-3 w-3" /> {unassignedCount} без гейта
          </span>
        )}
      </div>

      {/* Header row */}
      <div className="flex sticky top-0 z-10 bg-card border-b border-border">
        <div className="min-w-[160px] w-[160px] shrink-0 px-3 py-2 border-r border-border">
          <span className="text-xs font-semibold text-muted-foreground">Стрим</span>
        </div>
        {visibleGates.map(gate => (
          <div key={gate.key} className={cn("shrink-0 px-3 py-2 border-r border-border", colWidth)}>
            <div className="flex items-center gap-1.5">
              <div className={cn("h-2 w-2 rounded-full", gate.color)} />
              <span className="text-xs font-semibold text-foreground">{gate.title.split(":")[0]}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Stream rows */}
      {streamSubprojects.map((sub: any) => {
        const isCollapsed = collapsedRows.has(sub.id);
        const rowTasks = visibleGates.flatMap(g => gridData[sub.id]?.[g.key] || []);
        const completedInRow = rowTasks.filter((t: any) => t.is_completed).length;

        return (
          <div key={sub.id} className="border-b border-border">
            <div className="flex">
              <button
                onClick={() => toggleRow(sub.id)}
                className="min-w-[160px] w-[160px] shrink-0 px-3 py-2 border-r border-border flex items-center gap-2 hover:bg-muted/50 transition-colors"
              >
                {isCollapsed
                  ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                }
                <span className="text-xs font-semibold text-foreground truncate">{sub.name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                  {completedInRow}/{rowTasks.length}
                </span>
              </button>
              {!isCollapsed && visibleGates.map(gate => {
                const cellTasks = gridData[sub.id]?.[gate.key] || [];
                return (
                  <TaskCell
                    key={gate.key}
                    tasks={cellTasks}
                    colWidth={colWidth}
                    onCreate={(title) => handleCreateTask(sub.id, gate.key, title)}
                  />
                );
              })}
              {isCollapsed && (
                <div className="flex-1 flex items-center px-3">
                  <span className="text-[10px] text-muted-foreground">
                    {rowTasks.length > 0 ? `${completedInRow}/${rowTasks.length} задач` : "пусто"}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Root tasks row */}
      {(() => {
        const rootTasks = visibleGates.flatMap(g => gridData["__root__"]?.[g.key] || []);
        if (rootTasks.length === 0) return null;
        const isCollapsed = collapsedRows.has("__root__");
        return (
          <div className="border-b border-border">
            <div className="flex">
              <button
                onClick={() => toggleRow("__root__")}
                className="min-w-[160px] w-[160px] shrink-0 px-3 py-2 border-r border-border flex items-center gap-2 hover:bg-muted/50 transition-colors"
              >
                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                <span className="text-xs font-medium text-muted-foreground italic">Общие</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{rootTasks.length}</span>
              </button>
              {!isCollapsed && visibleGates.map(gate => (
                <TaskCell
                  key={gate.key}
                  tasks={gridData["__root__"]?.[gate.key] || []}
                  colWidth={colWidth}
                  onCreate={(title) => handleCreateTask(projectId, gate.key, title)}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {streamSubprojects.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          У проекта нет стрим-подпроектов. Создайте проект заново или добавьте подпроекты вручную.
        </div>
      )}
    </div>
  );
}

function TaskCell({
  tasks, colWidth, onCreate,
}: {
  tasks: any[];
  colWidth: string;
  onCreate: (title: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const activeTasks = tasks.filter((t: any) => !t.is_completed);
  const doneTasks = tasks.filter((t: any) => t.is_completed);

  return (
    <div className={cn("shrink-0 px-1.5 py-1.5 border-r border-border", colWidth)}>
      <div className="flex flex-col gap-0.5">
        {activeTasks.map((task: any) => (
          <div
            key={task.id}
            className="rounded border border-border bg-card px-2 py-1 text-[11px] hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {task.deadline && isPast(parseISO(task.deadline)) ? (
                <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
              ) : (
                <div className="h-2.5 w-2.5 rounded-full border border-muted-foreground/30 shrink-0" />
              )}
              <span className="truncate text-foreground">{task.title}</span>
            </div>
            {task.deadline && (
              <div className="text-[9px] text-muted-foreground mt-0.5 pl-4">
                {new Date(task.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
              </div>
            )}
          </div>
        ))}
        {doneTasks.length > 0 && (
          <div className="text-[10px] text-muted-foreground flex items-center gap-1 px-1 py-0.5">
            <CheckCircle2 className="h-2.5 w-2.5 text-success" />
            {doneTasks.length} выполнено
          </div>
        )}
        {adding ? (
          <div className="rounded border border-primary/30 bg-card p-1">
            <Input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Задача..."
              className="h-6 text-[11px] px-1.5"
              onKeyDown={e => {
                if (e.key === "Enter" && newTitle.trim()) { onCreate(newTitle); setNewTitle(""); setAdding(false); }
                if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
              }}
              autoFocus
            />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground px-1 py-0.5 rounded transition-colors"
          >
            <Plus className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Task, TaskGroup } from "@/hooks/useTasks";

const NPD_GATES = [
  { key: "gate0", short: "G0", title: "Идея", tagName: "Gate 0: Идея и Стратегия", color: "bg-slate-500" },
  { key: "gate1", short: "G1", title: "Концепция", tagName: "Gate 1: Концепция и Экономика", color: "bg-blue-500" },
  { key: "gate2", short: "G2", title: "Разработка", tagName: "Gate 2: Разработка и Тестирование", color: "bg-violet-500" },
  { key: "gate3", short: "G3", title: "Запуск", tagName: "Gate 3: Подготовка к запуску", color: "bg-amber-500" },
  { key: "gate4", short: "G4", title: "Ревью", tagName: "Gate 4: Пост-запуск ревью", color: "bg-emerald-500" },
];

interface PmoInlineMatrixProps {
  projectId: string;
  children: TaskGroup[];
  allTasks: Task[];
}

export default function PmoInlineMatrix({ projectId, children, allTasks }: PmoInlineMatrixProps) {
  // Load tags for gate mapping
  const { data: allTags = [] } = useQuery({
    queryKey: ["pmo-inline-matrix-tags"],
    queryFn: async () => {
      const { data } = await supabase.from("tags").select("id, name");
      return (data || []) as { id: string; name: string }[];
    },
  });

  const { data: taskTags = [] } = useQuery({
    queryKey: ["pmo-inline-matrix-task-tags", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("task_tags").select("task_id, tag_id");
      return (data || []) as { task_id: string; tag_id: string }[];
    },
  });

  const { data: groupTags = [] } = useQuery({
    queryKey: ["pmo-inline-matrix-group-tags", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("group_tags").select("group_id, tag_id");
      return (data || []) as { group_id: string; tag_id: string }[];
    },
  });

  const gateTagMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const gate of NPD_GATES) {
      const tag = allTags.find((t) => t.name === gate.tagName);
      if (tag) m.set(tag.id, gate.key);
    }
    return m;
  }, [allTags]);

  // Streams = children (subprojects)
  const streams = useMemo(() => {
    return [
      { id: projectId, name: "Общие" },
      ...children.map((c) => ({ id: c.id, name: c.name.includes("/") ? c.name.split("/").pop()?.trim() || c.name : c.name })),
    ];
  }, [projectId, children]);

  // Build matrix data
  const matrix = useMemo(() => {
    const allProjectIds = [projectId, ...children.map((c) => c.id)];
    const projectTasks = allTasks.filter((t) => t.group_id && allProjectIds.includes(t.group_id));
    const taskTagMap = new Map<string, string[]>();
    for (const tt of taskTags) {
      if (!taskTagMap.has(tt.task_id)) taskTagMap.set(tt.task_id, []);
      taskTagMap.get(tt.task_id)!.push(tt.tag_id);
    }
    const groupTagMap = new Map<string, string[]>();
    for (const gt of groupTags) {
      if (!groupTagMap.has(gt.group_id)) groupTagMap.set(gt.group_id, []);
      groupTagMap.get(gt.group_id)!.push(gt.tag_id);
    }

    const getTaskGate = (task: Task): string | null => {
      const tags = taskTagMap.get(task.id) || [];
      for (const tagId of tags) {
        const gate = gateTagMap.get(tagId);
        if (gate) return gate;
      }
      if (task.group_id) {
        const gTags = groupTagMap.get(task.group_id) || [];
        for (const tagId of gTags) {
          const gate = gateTagMap.get(tagId);
          if (gate) return gate;
        }
      }
      return null;
    };

    const data: Record<string, Record<string, { total: number; completed: number; overdue: number }>> = {};
    for (const stream of streams) {
      data[stream.id] = {};
      for (const gate of NPD_GATES) {
        data[stream.id][gate.key] = { total: 0, completed: 0, overdue: 0 };
      }
    }

    const now = new Date();
    for (const t of projectTasks) {
      const gate = getTaskGate(t);
      if (!gate) continue;
      const streamId = t.group_id || projectId;
      if (!data[streamId]) continue;
      if (!data[streamId][gate]) continue;
      data[streamId][gate].total++;
      if (t.is_completed) data[streamId][gate].completed++;
      else if (t.deadline && new Date(t.deadline) < now) data[streamId][gate].overdue++;
    }

    return data;
  }, [allTasks, projectId, children, streams, taskTags, groupTags, gateTagMap]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr>
            <th className="text-left px-2 py-1.5 text-muted-foreground font-semibold w-[120px]">Стрим</th>
            {NPD_GATES.map((gate) => (
              <th key={gate.key} className="text-center px-1 py-1.5">
                <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white", gate.color)}>
                  {gate.short}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {streams.map((stream) => (
            <tr key={stream.id} className="border-t border-border/30">
              <td className="px-2 py-1.5 font-medium text-foreground truncate max-w-[120px]" title={stream.name}>{stream.name}</td>
              {NPD_GATES.map((gate) => {
                const cell = matrix[stream.id]?.[gate.key] || { total: 0, completed: 0, overdue: 0 };
                if (cell.total === 0) return <td key={gate.key} className="text-center px-1 py-1.5 text-muted-foreground/30">—</td>;
                const pct = Math.round((cell.completed / cell.total) * 100);
                return (
                  <td key={gate.key} className="text-center px-1 py-1.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <div className="w-10 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className={cn("text-[10px]", cell.overdue > 0 ? "text-destructive font-semibold" : "text-muted-foreground")}>
                            {cell.completed}/{cell.total}
                            {cell.overdue > 0 && ` ⚠${cell.overdue}`}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        {cell.completed} из {cell.total} выполнено ({pct}%)
                        {cell.overdue > 0 && `, ${cell.overdue} просрочено`}
                      </TooltipContent>
                    </Tooltip>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

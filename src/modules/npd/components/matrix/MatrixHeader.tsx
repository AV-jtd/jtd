import React, { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, GanttChart, Layers, Loader2 } from "lucide-react";
import UndoRedoButtons from "@/components/UndoRedoButtons";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { NPD_GATES, NPD_STREAMS, type Task, type TaskGroup } from "./types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface MatrixHeaderProps {
  project: TaskGroup;
  projectId: string;
  allTasks: Task[];
  projectGroupIds: Set<string>;
  allGroups: TaskGroup[];
  allGroupTags: { group_id: string; tag_id: string; tag_name: string | null }[];
  gateTags: { id: string; name: string }[];
  streamTags: { id: string; name: string }[];
}

function MatrixHeaderInner({
  project, projectId, allTasks, projectGroupIds,
  allGroups, allGroupTags, gateTags, streamTags,
}: MatrixHeaderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [flattening, setFlattening] = useState(false);

  const allProjectTasks = allTasks.filter(task => {
    return task.group_id != null && projectGroupIds.has(task.group_id);
  });
  const total = allProjectTasks.length;
  const done = allProjectTasks.filter(t => t.is_completed).length;

  // Check if project has deep nesting (grandchildren)
  const directChildren = allGroups.filter(g => g.parent_id === projectId);
  const hasDeepNesting = directChildren.some(child =>
    allGroups.some(g => g.parent_id === child.id)
  );

  const tagNameToGateKey = new Map<string, string>(NPD_GATES.map(g => [g.tagName as string, g.key]));
  const gateTagIdToKey = new Map<string, string>();
  gateTags.forEach(t => {
    const key = tagNameToGateKey.get(t.name);
    if (key) gateTagIdToKey.set(t.id, key);
  });
  const streamTagIdToName = new Map(streamTags.map(t => [t.id, t.name]));

  const getGroupGate = (groupId: string): string | null => {
    const tags = allGroupTags.filter(gt => gt.group_id === groupId);
    for (const gt of tags) {
      if (gt.tag_name) {
        const key = tagNameToGateKey.get(gt.tag_name);
        if (key) return key;
      }
      const key = gateTagIdToKey.get(gt.tag_id);
      if (key) return key;
    }
    return null;
  };

  const getGroupStream = (groupId: string): string | null => {
    const tags = allGroupTags.filter(gt => gt.group_id === groupId);
    for (const gt of tags) {
      if (gt.tag_name && NPD_STREAMS.includes(gt.tag_name)) return gt.tag_name;
      const name = streamTagIdToName.get(gt.tag_id);
      if (name) return name;
    }
    const group = allGroups.find(g => g.id === groupId);
    if (group) {
      const normalize = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
      const match = NPD_STREAMS.find(s => normalize(s) === normalize(group.name));
      if (match) return match;
    }
    return null;
  };

  const resolveStreamForGroup = (groupId: string): string | null => {
    let current: string | null = groupId;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      const stream = getGroupStream(current);
      if (stream) return stream;
      const group = allGroups.find(g => g.id === current);
      current = group?.parent_id ?? null;
    }
    return null;
  };

  const resolveGateForGroup = (groupId: string): string | null => {
    let current: string | null = groupId;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      const gate = getGroupGate(current);
      if (gate) return gate;
      const group = allGroups.find(g => g.id === current);
      current = group?.parent_id ?? null;
    }
    return null;
  };

  const handleFlatten = useCallback(async () => {
    setFlattening(true);
    try {
      // 1. Identify stream-level subprojects (depth 1 children that map to a stream)
      const streamGroupMap = new Map<string, string>(); // stream -> group_id
      for (const child of directChildren) {
        const stream = getGroupStream(child.id) ?? resolveStreamForGroup(child.id);
        if (stream && !streamGroupMap.has(stream)) {
          streamGroupMap.set(stream, child.id);
        }
      }

      // 2. Find all deep groups (depth >= 2)
      const deepGroups: TaskGroup[] = [];
      const collectDeep = (parentId: string) => {
        allGroups.filter(g => g.parent_id === parentId).forEach(g => {
          if (g.parent_id !== projectId) deepGroups.push(g);
          collectDeep(g.id);
        });
      };
      directChildren.forEach(c => collectDeep(c.id));

      if (deepGroups.length === 0) {
        toast.info("Структура уже плоская");
        setFlattening(false);
        setConfirmOpen(false);
        return;
      }

      let movedTasks = 0;
      let removedGroups = 0;

      // 3. Move tasks from deep groups to stream-level groups
      for (const deepGroup of deepGroups) {
        const stream = resolveStreamForGroup(deepGroup.id);
        const gate = resolveGateForGroup(deepGroup.id);
        const targetGroupId = stream ? streamGroupMap.get(stream) : null;

        if (!targetGroupId) continue;

        // Get tasks in this deep group
        const tasks = allTasks.filter(t => t.group_id === deepGroup.id);
        if (tasks.length === 0) continue;

        // Move tasks
        const { error } = await supabase
          .from("tasks")
          .update({ group_id: targetGroupId })
          .eq("group_id", deepGroup.id);

        if (error) {
          console.error("Failed to move tasks from", deepGroup.name, error);
          continue;
        }

        // Add gate tags to moved tasks if they don't have one
        if (gate) {
          const gateTagName = NPD_GATES.find(g => g.key === gate)?.tagName;
          const gateTag = gateTagName ? gateTags.find(t => t.name === gateTagName) : null;
          if (gateTag) {
            for (const task of tasks) {
              const existingTags = (task.task_tags ?? []).map(tt => tt.tag_id);
              const hasGateTag = existingTags.some(id => gateTagIdToKey.has(id));
              if (!hasGateTag) {
                await supabase.from("task_tags").upsert(
                  { task_id: task.id, tag_id: gateTag.id },
                  { onConflict: "task_id,tag_id" }
                );
              }
            }
          }
        }

        movedTasks += tasks.length;
      }

      // 4. Delete empty deep groups (bottom-up to respect FK)
      const sortedDeep = [...deepGroups].sort((a, b) => {
        const depthA = (() => { let d = 0; let c: string | null = a.parent_id ?? null; while (c && c !== projectId) { d++; c = allGroups.find(g => g.id === c)?.parent_id ?? null; } return d; })();
        const depthB = (() => { let d = 0; let c: string | null = b.parent_id ?? null; while (c && c !== projectId) { d++; c = allGroups.find(g => g.id === c)?.parent_id ?? null; } return d; })();
        return depthB - depthA;
      });

      for (const deepGroup of sortedDeep) {
        const hasTasks = allTasks.some(t => t.group_id === deepGroup.id);
        const hasChildren = allGroups.some(g => g.parent_id === deepGroup.id && !sortedDeep.some(d => d.id === g.id));
        if (hasTasks || hasChildren) continue;

        await supabase.from("group_tags" as any).delete().eq("group_id", deepGroup.id);
        const { error } = await supabase.from("task_groups").delete().eq("id", deepGroup.id);
        if (!error) removedGroups++;
      }

      // 5. Delete intermediate parent groups (depth-1 non-stream children that are now empty)
      for (const child of directChildren) {
        const isStream = streamGroupMap.has(getGroupStream(child.id) ?? "");
        if (isStream) continue;

        const hasTasks = allTasks.some(t => t.group_id === child.id);
        const hasRemainingChildren = allGroups.some(g => g.parent_id === child.id);
        if (hasTasks || hasRemainingChildren) continue;

        await supabase.from("group_tags" as any).delete().eq("group_id", child.id);
        const { error } = await supabase.from("task_groups").delete().eq("id", child.id);
        if (!error) removedGroups++;
      }

      queryClient.invalidateQueries({ queryKey: ["task_groups"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["npd-matrix-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });

      toast.success(`Структура нормализована: ${movedTasks} задач перемещено, ${removedGroups} групп удалено`);
    } catch (err: any) {
      toast.error("Ошибка нормализации: " + (err?.message ?? "неизвестная ошибка"));
    } finally {
      setFlattening(false);
      setConfirmOpen(false);
    }
  }, [allGroups, allGroupTags, allTasks, directChildren, gateTags, projectId, queryClient]);

  return (
    <>
      <header className="flex items-center h-12 px-4 border-b border-border bg-card shrink-0 gap-3">
        <button onClick={() => navigate("/npd")} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm leading-none">{project.icon && project.icon !== "list" ? project.icon : "🧪"}</span>
          <h1 className="text-sm font-bold text-foreground truncate">{project.name}</h1>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </div>
            <span className="text-[11px] text-muted-foreground font-mono">{done}/{total}</span>
          </div>
        )}
        <div className="flex-1" />
        <UndoRedoButtons />
        {hasDeepNesting && (
          <button
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-amber-500/30 text-amber-500 hover:text-amber-400 hover:border-amber-400/50 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
            title="Нормализовать многоуровневую структуру"
          >
            <Layers className="h-3 w-3" />
            Упростить
          </button>
        )}
        <Link
          to={`/pmo/project/${projectId}?view=gantt`}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <GanttChart className="h-3 w-3" />
          Гант
        </Link>
      </header>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Нормализовать структуру проекта?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Этот проект содержит вложенные подпроекты внутри подпроектов.
                Нормализация переместит все задачи из глубоких уровней в стрим-подпроекты
                первого уровня и удалит пустые вложенные группы.
              </p>
              <p className="text-xs text-muted-foreground">
                • Задачи сохранят свои теги гейтов и ответственных<br />
                • Пустые промежуточные группы будут удалены<br />
                • Действие необратимо
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={flattening}>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleFlatten} disabled={flattening} className="bg-amber-500 hover:bg-amber-600">
              {flattening ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Нормализация...</>
              ) : (
                "Нормализовать"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const MatrixHeader = React.memo(MatrixHeaderInner);
export default MatrixHeader;
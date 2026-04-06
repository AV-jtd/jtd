import { useMemo, useState, useCallback, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, useTaskMutations, useAvailableUsers, type Task, type TaskGroup, type Profile } from "@/hooks/useTasks";
import { useDependencies, useDependencyMutations } from "@/hooks/useDependencies";
import { useMilestones } from "@/hooks/useMilestones";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import TaskItem from "@/components/TaskItem";
import DependencyDialog from "@/modules/pmo/components/DependencyDialog";
import { computeCascadeUpdates } from "@/lib/cascadeDependencies";
import type { QuickCreateResult } from "@/components/QuickCreateForm";
import {
  DndContext,
  MouseSensor, TouchSensor, useSensor, useSensors,
  pointerWithin,
  type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core";
import { Loader2 } from "lucide-react";
import { parseISO, differenceInCalendarDays, addDays } from "date-fns";
import { toast } from "sonner";

// Extracted components
import { NPD_GATES, NPD_STREAMS } from "../components/matrix/types";
import MatrixHeader from "../components/matrix/MatrixHeader";
import GateColumnHeaders from "../components/matrix/GateColumnHeaders";
import StreamRow from "../components/matrix/StreamRow";
import InboxRow from "../components/matrix/InboxRow";
import GateSummary from "../components/matrix/GateSummary";

export { NPD_GATES, NPD_STREAMS };

export default function NpdSwimlaneMatrix() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allGroups = [], isLoading: groupsLoading } = useTaskGroups();

  const groupById = useMemo(() => new Map(allGroups.map(group => [group.id, group])), [allGroups]);

  const childGroupsByParent = useMemo(() => {
    const map = new Map<string, TaskGroup[]>();
    allGroups.forEach(group => {
      if (!group.parent_id) return;
      const children = map.get(group.parent_id) ?? [];
      children.push(group);
      map.set(group.parent_id, children);
    });
    return map;
  }, [allGroups]);

  const { descendantGroups, descendantGroupIds, depthByGroupId } = useMemo(() => {
    if (!projectId) {
      return {
        descendantGroups: [] as TaskGroup[],
        descendantGroupIds: [] as string[],
        depthByGroupId: new Map<string, number>(),
      };
    }

    const groups: TaskGroup[] = [];
    const ids: string[] = [];
    const depthMap = new Map<string, number>();
    const visited = new Set<string>();
    const stack: Array<{ id: string; depth: number }> = [{ id: projectId, depth: 0 }];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);

      const group = groupById.get(current.id);
      if (!group) continue;

      groups.push(group);
      ids.push(group.id);
      depthMap.set(group.id, current.depth);

      const children = childGroupsByParent.get(current.id) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push({ id: children[index].id, depth: current.depth + 1 });
      }
    }

    return {
      descendantGroups: groups,
      descendantGroupIds: ids,
      depthByGroupId: depthMap,
    };
  }, [childGroupsByParent, groupById, projectId]);

  const descendantGroupIdSet = useMemo(() => new Set(descendantGroupIds), [descendantGroupIds]);

  const subprojects = useMemo(() => {
    if (!projectId) return [];
    return allGroups.filter(group => group.parent_id === projectId);
  }, [allGroups, projectId]);

  const { data: allTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["npd-matrix-tasks", projectId, descendantGroupIds],
    queryFn: async () => {
      if (descendantGroupIds.length === 0) return [];
      const results: Task[] = [];
      for (let i = 0; i < descendantGroupIds.length; i += 10) {
        const batch = descendantGroupIds.slice(i, i + 10);
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
    enabled: !!user && !!projectId && descendantGroupIds.length > 0,
    staleTime: 1000 * 15,
  });

  const { data: users = [] } = useAvailableUsers();
  const { data: allDependencies = [] } = useDependencies();
  const { addDependency } = useDependencyMutations();
  const { updateTask } = useTaskMutations();
  const { data: allMilestones = [] } = useMilestones();

  // Gate milestones for this project — sorted by planned_date
  const gateMilestones = useMemo(() => {
    if (!projectId) return [];
    return allMilestones
      .filter(m => (m as any).gate_key && descendantGroupIdSet.has(m.group_id))
      .sort((a, b) => new Date(a.planned_date).getTime() - new Date(b.planned_date).getTime());
  }, [allMilestones, projectId, descendantGroupIdSet]);

  // ── NPD tags init ──
  const { data: npdTagData } = useQuery({
    queryKey: ["npd-tags-init", user?.id],
    queryFn: async () => {
      if (!user) return { gateTags: [], streamTags: [], gatesCategoryId: null, streamsCategoryId: null };

      let { data: npdCats } = await supabase
        .from("tag_categories").select("id, name, parent_id")
        .eq("user_id", user.id).or("name.eq.NPD");
      let npdRootId = (npdCats || []).find(c => !c.parent_id && c.name === "NPD")?.id || null;
      if (!npdRootId) {
        const { data: newCat } = await supabase.from("tag_categories")
          .insert({ name: "NPD", user_id: user.id, color: "#8b5cf6", position: 2 }).select("id").single();
        npdRootId = newCat?.id || null;
      }
      if (!npdRootId) return { gateTags: [], streamTags: [], gatesCategoryId: null, streamsCategoryId: null };

      let { data: subCats } = await supabase.from("tag_categories")
        .select("id, name").eq("parent_id", npdRootId).eq("user_id", user.id);
      let gatesCatId = (subCats || []).find(c => c.name === "Гейты")?.id || null;
      let streamsCatId = (subCats || []).find(c => c.name === "Стримы")?.id || null;
      if (!gatesCatId) {
        const { data } = await supabase.from("tag_categories")
          .insert({ name: "Гейты", user_id: user.id, color: "#8b5cf6", parent_id: npdRootId, position: 0 }).select("id").single();
        gatesCatId = data?.id || null;
      }
      if (!streamsCatId) {
        const { data } = await supabase.from("tag_categories")
          .insert({ name: "Стримы", user_id: user.id, color: "#8b5cf6", parent_id: npdRootId, position: 1 }).select("id").single();
        streamsCatId = data?.id || null;
      }

      let { data: existingGateTags } = await supabase.from("tags").select("id, name").eq("category_id", gatesCatId!).eq("user_id", user.id);
      const existingGateNames = new Set((existingGateTags || []).map(t => t.name));
      const missingGates = NPD_GATES.filter(g => !existingGateNames.has(g.tagName));
      if (missingGates.length > 0) {
        await supabase.from("tags").insert(missingGates.map(g => ({ name: g.tagName, user_id: user.id, color: "#8b5cf6", category_id: gatesCatId! })));
        const { data: refreshed } = await supabase.from("tags").select("id, name").eq("category_id", gatesCatId!).eq("user_id", user.id);
        existingGateTags = refreshed;
      }

      let { data: existingStreamTags } = await supabase.from("tags").select("id, name").eq("category_id", streamsCatId!).eq("user_id", user.id);
      const existingStreamNames = new Set((existingStreamTags || []).map(t => t.name));
      const missingStreams = NPD_STREAMS.filter(s => !existingStreamNames.has(s));
      if (missingStreams.length > 0) {
        await supabase.from("tags").insert(missingStreams.map(s => ({ name: s, user_id: user.id, color: "#8b5cf6", category_id: streamsCatId! })));
      }

      const gateNames = NPD_GATES.map(g => g.tagName);
      const { data: allGateTagsByName } = await supabase.from("tags").select("id, name").in("name", gateNames);
      const { data: allStreamTagsByName } = await supabase.from("tags").select("id, name").in("name", NPD_STREAMS);

      return {
        gateTags: (allGateTagsByName || []) as { id: string; name: string }[],
        streamTags: (allStreamTagsByName || []) as { id: string; name: string }[],
        gatesCategoryId: gatesCatId,
        streamsCategoryId: streamsCatId,
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 30,
  });

  const gateTags = npdTagData?.gateTags || [];
  const streamTags = npdTagData?.streamTags || [];
  const streamsCategoryId = npdTagData?.streamsCategoryId || null;

  // ── Tag maps ──
  const tagNameToGateKey = useMemo(() => {
    const m = new Map<string, string>();
    NPD_GATES.forEach(g => m.set(g.tagName, g.key));
    return m;
  }, []);

  const gateKeyToTagId = useMemo(() => {
    const m = new Map<string, string>();
    gateTags.forEach(t => { const k = tagNameToGateKey.get(t.name); if (k) m.set(k, t.id); });
    return m;
  }, [gateTags, tagNameToGateKey]);

  const tagIdToGateKey = useMemo(() => {
    const m = new Map<string, string>();
    gateTags.forEach(t => { const k = tagNameToGateKey.get(t.name); if (k) m.set(t.id, k); });
    return m;
  }, [gateTags, tagNameToGateKey]);

  const gateTagIdSet = useMemo(() => new Set(gateTags.map(t => t.id)), [gateTags]);
  const streamTagIds = useMemo(() => new Set(streamTags.map(t => t.id)), [streamTags]);
  const streamTagById = useMemo(() => new Map(streamTags.map(t => [t.id, t.name])), [streamTags]);

  // ── Group tags ──
  const { data: allGroupTags = [] } = useQuery({
    queryKey: ["npd-group-tags", user?.id],
    queryFn: async () => {
      const results: { group_id: string; tag_id: string; tag_name: string | null }[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("group_tags" as any)
          .select("group_id, tag_id, tags(name)")
          .range(from, from + pageSize - 1) as { data: any[] | null; error: any };
        if (error) throw error;
        if (!data || data.length === 0) break;
        results.push(...data.map((d: any) => ({
          group_id: d.group_id as string, tag_id: d.tag_id as string,
          tag_name: (d.tags?.name ?? null) as string | null,
        })));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return results;
    },
    enabled: !!user,
  });

  const groupTagsByGroupId = useMemo(() => {
    const map = new Map<string, { group_id: string; tag_id: string; tag_name: string | null }[]>();
    allGroupTags.forEach(groupTag => {
      const entries = map.get(groupTag.group_id) ?? [];
      entries.push(groupTag);
      map.set(groupTag.group_id, entries);
    });
    return map;
  }, [allGroupTags]);

  // ── Task tags from embedded data ──
  const allTaskTags = useMemo(() => {
    const result: { task_id: string; tag_id: string }[] = [];
    for (const task of allTasks) {
      if (task.task_tags) {
        for (const tt of task.task_tags) {
          result.push({ task_id: task.id, tag_id: tt.tag_id });
        }
      }
    }
    return result;
  }, [allTasks]);

  const taskTagsByTaskId = useMemo(() => {
    const map = new Map<string, string[]>();
    allTaskTags.forEach(taskTag => {
      const entries = map.get(taskTag.task_id) ?? [];
      entries.push(taskTag.tag_id);
      map.set(taskTag.task_id, entries);
    });
    return map;
  }, [allTaskTags]);

  const tasksById = useMemo(() => new Map(allTasks.map(task => [task.id, task])), [allTasks]);

  // ── Project data ──
  const project = projectId ? groupById.get(projectId) : undefined;

  // ── Stream and gate helpers ──
  const normalizedStreamLookup = useMemo(() => {
    const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
    return new Map(NPD_STREAMS.map(stream => [normalize(stream), stream] as const));
  }, []);

  const matchStreamName = useCallback((raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
    const fullMatch = normalizedStreamLookup.get(normalize(raw));
    if (fullMatch) return fullMatch;

    const parts = raw.split(/[\/|—–-]/).map(part => normalize(part)).filter(Boolean);
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const match = normalizedStreamLookup.get(parts[index]);
      if (match) return match;
    }

    return null;
  }, [normalizedStreamLookup]);

  const getSubprojectGate = useCallback((subId: string): string | null => {
    let currentId: string | null = subId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const gTags = groupTagsByGroupId.get(currentId) ?? [];
      for (const gt of gTags) {
        if (gt.tag_name) {
          const gateKey = tagNameToGateKey.get(gt.tag_name);
          if (gateKey) return gateKey;
        }
        const gateKey = tagIdToGateKey.get(gt.tag_id);
        if (gateKey) return gateKey;
      }
      currentId = groupById.get(currentId)?.parent_id ?? null;
    }

    return null;
  }, [groupTagsByGroupId, groupById, tagIdToGateKey, tagNameToGateKey]);

  const getDirectGroupStream = useCallback((groupId: string): string | null => {
    const group = groupById.get(groupId);
    if (!group) return null;

    const gTags = groupTagsByGroupId.get(groupId) ?? [];
    for (const groupTag of gTags) {
      if (groupTag.tag_name && NPD_STREAMS.includes(groupTag.tag_name)) return groupTag.tag_name;
      const streamName = streamTagById.get(groupTag.tag_id);
      if (streamName) return streamName;
    }

    return matchStreamName(group.name);
  }, [groupById, groupTagsByGroupId, matchStreamName, streamTagById]);

  const getStreamForGroup = useCallback((groupId: string | null | undefined): string | null => {
    let currentId = groupId ?? null;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const streamName = getDirectGroupStream(currentId);
      if (streamName) return streamName;
      currentId = groupById.get(currentId)?.parent_id ?? null;
    }

    return null;
  }, [getDirectGroupStream, groupById]);

  const streamGroupsMap = useMemo(() => {
    const map = new Map<string, TaskGroup[]>();
    NPD_STREAMS.forEach(stream => map.set(stream, []));

    descendantGroups
      .filter(group => group.id !== projectId)
      .forEach(group => {
        const streamName = getStreamForGroup(group.id);
        if (!streamName || !map.has(streamName)) return;
        map.get(streamName)!.push(group);
      });

    return map;
  }, [descendantGroups, getStreamForGroup, projectId]);

  const primaryStreamGroupMap = useMemo(() => {
    const map = new Map<string, TaskGroup>();
    NPD_STREAMS.forEach(stream => {
      const candidates = (streamGroupsMap.get(stream) ?? [])
        .slice()
        .sort((a, b) => (depthByGroupId.get(a.id) ?? 0) - (depthByGroupId.get(b.id) ?? 0));
      if (candidates[0]) map.set(stream, candidates[0]);
    });
    return map;
  }, [depthByGroupId, streamGroupsMap]);

  const resolveGroupForStreamGate = useCallback((streamName: string, gateKey?: string | null) => {
    const groups = streamGroupsMap.get(streamName) ?? [];
    const matchingGateGroups = gateKey
      ? groups
          .filter(group => getSubprojectGate(group.id) === gateKey)
          .sort((a, b) => (depthByGroupId.get(b.id) ?? 0) - (depthByGroupId.get(a.id) ?? 0))
      : [];

    if (matchingGateGroups[0]) return matchingGateGroups[0];
    return primaryStreamGroupMap.get(streamName) ?? null;
  }, [depthByGroupId, getSubprojectGate, primaryStreamGroupMap, streamGroupsMap]);

  // Auto-repair stream tags
  const [repaired, setRepaired] = useState(false);
  useEffect(() => {
    if (repaired || streamTags.length === 0 || descendantGroups.length === 0) return;
    setRepaired(true);
    (async () => {
      let changed = false;
      for (const [streamName, group] of primaryStreamGroupMap.entries()) {
        const gTags = groupTagsByGroupId.get(group.id) ?? [];
        const hasStreamTag = gTags.some(gt => (gt.tag_name && NPD_STREAMS.includes(gt.tag_name)) || streamTagIds.has(gt.tag_id));
        if (hasStreamTag) continue;
        const streamTag = streamTags.find(tag => tag.name === streamName);
        if (streamTag) {
          await supabase.from("group_tags" as any).insert({ group_id: group.id, tag_id: streamTag.id });
          changed = true;
        }
      }
      if (changed) queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });
    })();
  }, [descendantGroups.length, groupTagsByGroupId, primaryStreamGroupMap, queryClient, repaired, streamTagIds, streamTags]);

  const tasksByGroup = useMemo(() => {
    const map = new Map<string, Task[]>();
    allTasks.forEach(task => {
      if (!task.group_id || !descendantGroupIdSet.has(task.group_id)) return;
      const entries = map.get(task.group_id) ?? [];
      entries.push(task);
      map.set(task.group_id, entries);
    });
    return map;
  }, [allTasks, descendantGroupIdSet]);

  const getTaskGate = useCallback((taskId: string): string | null => {
    const tTags = taskTagsByTaskId.get(taskId) ?? [];
    const gateOrder: string[] = NPD_GATES.map(gate => gate.key);
    let bestGate: string | null = null;
    let bestIndex = -1;

    for (const tagId of tTags) {
      const gateKey = tagIdToGateKey.get(tagId);
      if (!gateKey) continue;
      const gateIndex = gateOrder.indexOf(gateKey);
      if (gateIndex > bestIndex) {
        bestIndex = gateIndex;
        bestGate = gateKey;
      }
    }

    if (bestGate) return bestGate;

    // Fallback: group-based gate
    const task = tasksById.get(taskId);
    let groupGate = task?.group_id ? getSubprojectGate(task.group_id) : null;

    // Gate milestone override: if task starts after a gate milestone, bump to next gate
    if (task && gateMilestones.length > 0) {
      const taskStart = task.start_at || task.created_at;
      if (taskStart) {
        const taskStartTime = new Date(taskStart).getTime();
        for (let i = gateMilestones.length - 1; i >= 0; i--) {
          const ms = gateMilestones[i];
          const msDate = new Date(ms.planned_date).getTime();
          if (taskStartTime >= msDate) {
            const msGateKey = (ms as any).gate_key as string;
            const msGateIdx = gateOrder.indexOf(msGateKey);
            const nextGateIdx = msGateIdx + 1;
            if (nextGateIdx < gateOrder.length) {
              const nextGate = gateOrder[nextGateIdx];
              // Only override if it would place the task in a later gate
              const currentIdx = groupGate ? gateOrder.indexOf(groupGate) : -1;
              if (nextGateIdx > currentIdx) {
                return nextGate;
              }
            }
            break;
          }
        }
      }
    }

    return groupGate;
  }, [getSubprojectGate, tagIdToGateKey, taskTagsByTaskId, tasksById, gateMilestones]);

  const getTaskStream = useCallback((taskId: string): string | null => {
    const tTags = taskTagsByTaskId.get(taskId) ?? [];
    for (const tagId of tTags) {
      const streamName = streamTagById.get(tagId);
      if (streamName) return streamName;
    }
    const task = tasksById.get(taskId);
    return task?.group_id ? getStreamForGroup(task.group_id) : null;
  }, [getStreamForGroup, streamTagById, taskTagsByTaskId, tasksById]);

  const projectGroupIds = useMemo(() => new Set(descendantGroupIds), [descendantGroupIds]);

  const tasksByStream = useMemo(() => {
    const map = new Map<string, Task[]>();
    NPD_STREAMS.forEach(stream => map.set(stream, []));
    allTasks.forEach(task => {
      if (!task.group_id || !descendantGroupIdSet.has(task.group_id)) return;
      const streamName = getTaskStream(task.id);
      if (streamName && map.has(streamName)) map.get(streamName)!.push(task);
    });
    return map;
  }, [allTasks, descendantGroupIdSet, getTaskStream]);

  // ── Inbox ──
  const inboxData = useMemo(() => {
    const parentTasks = allTasks.filter(task => task.group_id === projectId && !getTaskStream(task.id));
    const unmatchedSubTasks = allTasks.filter(task => task.group_id && task.group_id !== projectId && descendantGroupIdSet.has(task.group_id) && !getTaskStream(task.id));
    return {
      parentTasks,
      unmatchedSubTasks,
      totalCount: parentTasks.length + unmatchedSubTasks.length,
    };
  }, [allTasks, descendantGroupIdSet, getTaskStream, projectId]);

  // ── Gate start date ──
  const getGateStartDate = useCallback((streamName: string, gateKey: string): Date | undefined => {
    const gateIdx = NPD_GATES.findIndex(gate => gate.key === gateKey);
    if (gateIdx < 0) return undefined;
    if (gateIdx === 0) return project?.created_at ? new Date(project.created_at) : undefined;

    const prevGateKey = NPD_GATES[gateIdx - 1].key;
    const prevGateTasks = (tasksByStream.get(streamName) ?? []).filter(task => getTaskGate(task.id) === prevGateKey);
    if (prevGateTasks.length === 0) return getGateStartDate(streamName, prevGateKey);

    let maxDeadline: Date | undefined;
    for (const task of prevGateTasks) {
      if (!task.deadline) continue;
      const deadline = parseISO(task.deadline);
      if (!maxDeadline || deadline > maxDeadline) maxDeadline = deadline;
    }

    return maxDeadline || (project?.created_at ? new Date(project.created_at) : undefined);
  }, [getTaskGate, project, tasksByStream]);

  // ── Streams data for rows ──
  const streamsData = useMemo(() => {
    const parentProjectGate = projectId ? getSubprojectGate(projectId) : null;
    return NPD_STREAMS.map(stream => {
      const primaryGroup = primaryStreamGroupMap.get(stream);
      const currentGate = primaryGroup ? (getSubprojectGate(primaryGroup.id) ?? parentProjectGate) : parentProjectGate;
      const tasks = tasksByStream.get(stream) ?? [];
      return { stream, currentGate, tasks };
    });
  }, [getSubprojectGate, primaryStreamGroupMap, projectId, tasksByStream]);

  // ── DnD ──
  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );
  const [dndOverCell, setDndOverCell] = useState<string | null>(null);
  const [dndActiveId, setDndActiveId] = useState<string | null>(null);

  const handleDndOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    setDndOverCell(overId && overId.includes("::") ? overId : null);
  }, []);

  const moveTaskToGate = useCallback(async (taskId: string, newGateKey: string) => {
    const newGateTagId = gateKeyToTagId.get(newGateKey);
    if (!newGateTagId) return;
    // Remove ALL gate tags (from any user) — query DB for gate tag names
    const gateNames = NPD_GATES.map(g => g.tagName);
    const { data: gateTagRows } = await supabase
      .from("tags").select("id").in("name", gateNames);
    const allGateIds = new Set((gateTagRows || []).map(r => r.id));
    const taskTagEntries = allTaskTags.filter(tt => tt.task_id === taskId);
    for (const tt of taskTagEntries.filter(tt => allGateIds.has(tt.tag_id))) {
      await supabase.from("task_tags").delete().eq("task_id", taskId).eq("tag_id", tt.tag_id);
    }
    await supabase.from("task_tags").upsert({ task_id: taskId, tag_id: newGateTagId }, { onConflict: "task_id,tag_id" });
  }, [gateKeyToTagId, allTaskTags]);

  const moveTaskToStream = useCallback(async (taskId: string, newStream: string, targetGate?: string | null) => {
    const targetGroup = resolveGroupForStreamGate(newStream, targetGate);
    if (targetGroup) {
      await supabase.from("tasks").update({ group_id: targetGroup.id }).eq("id", taskId);
    }

    const taskTagEntries = taskTagsByTaskId.get(taskId) ?? [];
    for (const tagId of taskTagEntries.filter(tagId => streamTagIds.has(tagId))) {
      await supabase.from("task_tags").delete().eq("task_id", taskId).eq("tag_id", tagId);
    }

    const newStreamTag = streamTags.find(tag => tag.name === newStream);
    if (newStreamTag && (!targetGroup || getStreamForGroup(targetGroup.id) !== newStream)) {
      await supabase.from("task_tags").upsert({ task_id: taskId, tag_id: newStreamTag.id }, { onConflict: "task_id,tag_id" });
    }
  }, [getStreamForGroup, resolveGroupForStreamGate, streamTagIds, streamTags, taskTagsByTaskId]);

  const handleDndEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    const lastOver = dndOverCell;
    setDndActiveId(null);
    setDndOverCell(null);
    const dropCellId = (over?.id && String(over.id).includes("::")) ? (over.id as string) : lastOver;
    if (!dropCellId) return;
    const [targetStream, targetGate] = dropCellId.split("::");
    const taskId = active.id as string;
    const currentGate = getTaskGate(taskId);
    const currentStream = getTaskStream(taskId);
    const task = allTasks.find(t => t.id === taskId);
    const isInboxTarget = targetStream === "__inbox__";
    const gateChanged = currentGate !== targetGate;
    const streamChanged = !isInboxTarget && currentStream !== targetStream;
    if (!gateChanged && !streamChanged && !isInboxTarget) return;

    if (isInboxTarget) {
      if (task?.group_id !== projectId) {
        await supabase.from("tasks").update({ group_id: projectId! }).eq("id", taskId);
        for (const tt of allTaskTags.filter(tt => tt.task_id === taskId)) {
          if (streamTagIds.has(tt.tag_id)) await supabase.from("task_tags").delete().eq("task_id", taskId).eq("tag_id", tt.tag_id);
        }
      }
    } else if (streamChanged) {
      await moveTaskToStream(taskId, targetStream, targetGate);
    }
    if (gateChanged) await moveTaskToGate(taskId, targetGate);

    queryClient.invalidateQueries({ queryKey: ["npd-matrix-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["npd-task-tags"] });

    const parts: string[] = [];
    if (gateChanged) parts.push(NPD_GATES.find(g => g.key === targetGate)?.short ?? targetGate);
    if (streamChanged) parts.push(targetStream);
    if (isInboxTarget && !streamChanged) parts.push("Входящие");
    toast.success(`Задача перемещена → ${parts.join(" · ")}`);
  }, [dndOverCell, getTaskGate, getTaskStream, allTasks, moveTaskToGate, moveTaskToStream, queryClient, projectId, allTaskTags, streamTagIds]);

  // ── Quick create ──
  const handleQuickCreate = useCallback(async (
    params: QuickCreateResult, groupId: string, streamName?: string, gateKey?: string,
  ) => {
    if (!user) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) { toast.error("Сессия истекла"); return; }

    if (params.type === "subproject") {
      const { data: newSub, error } = await supabase.from("task_groups")
        .insert({ name: params.title, user_id: uid, project_type: "npd", icon: "📋", color: "#8b5cf6", parent_id: groupId, position: subprojects.length })
        .select("id").single();
      if (error || !newSub) { toast.error(error?.message || "Ошибка"); return; }
      if (streamName) {
        let streamTagId = streamTags.find(t => t.name === streamName)?.id;
        if (!streamTagId && streamsCategoryId) {
          const { data: created } = await supabase.from("tags")
            .insert({ name: streamName, user_id: uid, color: "#8b5cf6", category_id: streamsCategoryId }).select("id").single();
          streamTagId = created?.id;
          queryClient.invalidateQueries({ queryKey: ["npd-tags-init", user?.id] });
        }
        if (streamTagId) await supabase.from("group_tags" as any).insert({ group_id: newSub.id, tag_id: streamTagId });
      }
      if (gateKey) {
        const gateTagId = gateKeyToTagId.get(gateKey);
        if (gateTagId) await supabase.from("group_tags" as any).insert({ group_id: newSub.id, tag_id: gateTagId });
      }
      queryClient.invalidateQueries({ queryKey: ["task-groups"] });
      queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });
      queryClient.invalidateQueries({ queryKey: ["all_group_tags"] });
      toast.success(`Подпроект «${params.title}» создан`);
    } else {
      const resolvedGroup = streamName ? resolveGroupForStreamGate(streamName, gateKey) : null;
      const targetGroupId = resolvedGroup?.id ?? groupId;
      const insertData: any = { title: params.title, user_id: uid, group_id: targetGroupId };
      if (params.deadline) insertData.deadline = params.deadline.toISOString();
      if (params.assigneeId) insertData.assigned_to = params.assigneeId;
      if (params.startFrom) insertData.start_at = params.startFrom.toISOString();
      const { data, error } = await supabase.from("tasks").insert(insertData).select("id").single();
      if (error) { toast.error(error.message); return; }
      if (streamName && data) {
        const streamTagId = streamTags.find(tag => tag.name === streamName)?.id;
        const inheritedStream = getStreamForGroup(targetGroupId);
        if (streamTagId && inheritedStream !== streamName) {
          await supabase.from("task_tags").insert({ task_id: data.id, tag_id: streamTagId });
        }
      }
      if (gateKey && data) {
        const gateTagId = gateKeyToTagId.get(gateKey);
        const inheritedGate = getSubprojectGate(targetGroupId);
        if (gateTagId && inheritedGate !== gateKey) {
          await supabase.from("task_tags").insert({ task_id: data.id, tag_id: gateTagId });
        }
      }
      if (params.assigneeId && data) {
        await supabase.from("task_participants").upsert({ task_id: data.id, user_id: params.assigneeId, role: "assignee" }, { onConflict: "task_id,user_id" });
      }
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["npd-task-tags"] });
      toast.success("Задача создана");
    }
  }, [getStreamForGroup, getSubprojectGate, resolveGroupForStreamGate, user, subprojects.length, streamTags, streamsCategoryId, gateKeyToTagId, queryClient]);

  // ── Deadline cascade ──
  const handleDeadlineChange = useCallback(async (task: Task, newDeadline: Date) => {
    const oldDeadline = task.deadline ? parseISO(task.deadline) : new Date(task.created_at);
    updateTask.mutate({ id: task.id, deadline: newDeadline.toISOString() });
    const entities = new Map<string, { id: string; deadline?: string | null; start_at?: string | null; created_at: string }>();
    allTasks.forEach(t => entities.set(t.id, { id: t.id, deadline: t.deadline, start_at: t.start_at, created_at: t.created_at }));
    const cascadeUpdates = computeCascadeUpdates(task.id, newDeadline, oldDeadline, allDependencies, entities);
    if (cascadeUpdates.size > 0) {
      for (const [entityId, upd] of cascadeUpdates) {
        const updates: any = {};
        if (upd.deadline) updates.deadline = upd.deadline;
        if (upd.start_at) updates.start_at = upd.start_at;
        updateTask.mutate({ id: entityId, ...updates });
      }
      toast.info(`Каскадно обновлено ${cascadeUpdates.size} задач`);
    }
  }, [updateTask, allTasks, allDependencies]);

  const handleAssigneeChange = useCallback((taskId: string, userId: string | null) => {
    updateTask.mutate({ id: taskId, assigned_to: userId });
    if (userId) {
      supabase.from("task_participants").upsert({ task_id: taskId, user_id: userId, role: "assignee" }, { onConflict: "task_id,user_id" });
    }
  }, [updateTask]);

  const handleToggle = useCallback((taskId: string) => {
    const t = allTasks.find(x => x.id === taskId);
    if (!t) return;
    updateTask.mutate({ id: taskId, is_completed: !t.is_completed, completed_at: !t.is_completed ? new Date().toISOString() : null });
  }, [allTasks, updateTask]);

  // ── Dependency dialog ──
  const [depDialogState, setDepDialogState] = useState<{
    predecessorId: string; successorId: string;
    predecessorLabel: string; successorLabel: string;
    predecessorEntityType: string; successorEntityType: string;
  } | null>(null);

  const handleAddDependency = useCallback((predId: string, succId: string) => {
    const pred = allTasks.find(t => t.id === predId);
    const succ = allTasks.find(t => t.id === succId);
    setDepDialogState({
      predecessorId: predId, successorId: succId,
      predecessorLabel: pred?.title || predId, successorLabel: succ?.title || succId,
      predecessorEntityType: "task", successorEntityType: "task",
    });
  }, [allTasks]);

  // ── Detail sheet ──
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const detailTask = detailTaskId ? allTasks.find(t => t.id === detailTaskId) : null;

  // ── Collapsed streams ──
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = useCallback((stream: string) => {
    setCollapsed(prev => { const n = new Set(prev); if (n.has(stream)) n.delete(stream); else n.add(stream); return n; });
  }, []);
  const [inboxOpen, setInboxOpen] = useState(false);

  const isLoading = groupsLoading || tasksLoading || !npdTagData;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background flex-col gap-4">
        <p className="text-muted-foreground">Проект не найден</p>
        <Link to="/npd" className="text-primary text-sm hover:underline">← Назад к NPD</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <MatrixHeader
        project={project}
        projectId={projectId!}
        allTasks={allTasks}
        projectGroupIds={projectGroupIds}
        allGroups={allGroups}
        allGroupTags={allGroupTags}
        gateTags={gateTags}
        streamTags={streamTags}
      />

      <div className="flex-1 overflow-auto">
        <DndContext
          sensors={dndSensors}
          collisionDetection={pointerWithin}
          onDragStart={(e) => setDndActiveId(e.active.id as string)}
          onDragOver={handleDndOver}
          onDragEnd={handleDndEnd}
        >
          <div className="min-w-max">
            <GateColumnHeaders />

            {streamsData.map(({ stream, currentGate, tasks }) => (
              <StreamRow
                key={stream}
                stream={stream}
                isCollapsed={collapsed.has(stream)}
                currentGate={currentGate}
                tasks={tasks}
                users={users}
                allDependencies={allDependencies}
                allTasks={allTasks}
                projectGroupIds={projectGroupIds}
                projectId={projectId!}
                dndOverCell={dndOverCell}
                getTaskGate={getTaskGate}
                getGateStartDate={getGateStartDate}
                getCreateGroupId={(streamName, gateKey) => resolveGroupForStreamGate(streamName, gateKey)?.id ?? null}
                onToggleCollapse={() => toggleCollapse(stream)}
                onDeadlineChange={handleDeadlineChange}
                onAssigneeChange={handleAssigneeChange}
                onToggle={handleToggle}
                onAddDependency={handleAddDependency}
                onExpand={setDetailTaskId}
                onQuickCreate={handleQuickCreate}
              />
            ))}

            <InboxRow
              inboxOpen={inboxOpen}
              onToggle={() => setInboxOpen(prev => !prev)}
              totalCount={inboxData.totalCount}
              parentTasks={inboxData.parentTasks}
              unmatchedSubTasks={inboxData.unmatchedSubTasks}
              dndOverCell={dndOverCell}
              getTaskGate={getTaskGate}
            />

            <GateSummary
              tasksByStream={tasksByStream}
              getTaskGate={getTaskGate}
            />
          </div>
        </DndContext>
      </div>

      {/* Dependency dialog */}
      {depDialogState && (
        <DependencyDialog
          open
          onOpenChange={(open) => { if (!open) setDepDialogState(null); }}
          predecessorLabel={depDialogState.predecessorLabel}
          successorLabel={depDialogState.successorLabel}
          onConfirm={(type, lag) => {
            addDependency.mutate({
              predecessor_id: depDialogState.predecessorId,
              successor_id: depDialogState.successorId,
              dependency_type: type,
              lag_days: lag,
              predecessor_entity_type: depDialogState.predecessorEntityType,
              successor_entity_type: depDialogState.successorEntityType,
            });
            if (type === "FS") {
              let predEndDate: Date | null = null;
              if (depDialogState.predecessorEntityType === "task") {
                const predTask = allTasks.find(t => t.id === depDialogState.predecessorId);
                if (predTask?.deadline) predEndDate = parseISO(predTask.deadline);
              } else if (depDialogState.predecessorEntityType === "project") {
                const gTasks = allTasks.filter(t => t.group_id === depDialogState.predecessorId);
                const latest = gTasks.reduce((max, t) => { const d = t.deadline || t.created_at; return d > max ? d : max; }, "");
                if (latest) predEndDate = parseISO(latest);
              }
              if (predEndDate && depDialogState.successorEntityType === "task") {
                const newStart = addDays(predEndDate, Math.max(lag, 1));
                const succTask = allTasks.find(t => t.id === depDialogState.successorId);
                if (succTask) {
                  const oldStart = succTask.start_at ? parseISO(succTask.start_at) : parseISO(succTask.created_at);
                  if (newStart > oldStart) {
                    const updates: any = { id: succTask.id, start_at: newStart.toISOString() };
                    if (succTask.deadline) {
                      const duration = differenceInCalendarDays(parseISO(succTask.deadline), oldStart);
                      updates.deadline = addDays(newStart, Math.max(duration, 1)).toISOString();
                    } else {
                      updates.deadline = addDays(newStart, 1).toISOString();
                    }
                    updateTask.mutate(updates);
                    toast.info("Даты преемника обновлены по зависимости");
                  }
                }
              }
            }
            setDepDialogState(null);
          }}
        />
      )}

      {/* Task detail sheet */}
      <Sheet open={!!detailTask} onOpenChange={(open) => { if (!open) setDetailTaskId(null); }}>
        <SheetContent side="right" className="w-[92vw] sm:w-[440px] md:w-[500px] max-w-[500px] p-0 overflow-y-auto">
          {detailTask && (
            <div className="p-4">
              <TaskItem task={detailTask} initialOpen />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

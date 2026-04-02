import { useMemo, useState, useCallback, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, useTaskMutations, useAvailableUsers, type Task, type TaskGroup, type Profile } from "@/hooks/useTasks";
import { useDependencies, useDependencyMutations } from "@/hooks/useDependencies";
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

  const subGroupIds = useMemo(() => {
    if (!projectId) return [];
    const ids = allGroups.filter(g => g.parent_id === projectId).map(g => g.id);
    if (projectId) ids.push(projectId);
    return ids;
  }, [allGroups, projectId]);

  const { data: allTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["npd-matrix-tasks", projectId, subGroupIds],
    queryFn: async () => {
      if (subGroupIds.length === 0) return [];
      const results: Task[] = [];
      for (let i = 0; i < subGroupIds.length; i += 10) {
        const batch = subGroupIds.slice(i, i + 10);
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
    enabled: !!user && !!projectId && subGroupIds.length > 0,
    staleTime: 1000 * 15,
  });

  const { data: users = [] } = useAvailableUsers();
  const { data: allDependencies = [] } = useDependencies();
  const { addDependency } = useDependencyMutations();
  const { updateTask } = useTaskMutations();

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

  // ── Project data ──
  const project = allGroups.find(g => g.id === projectId);
  const subprojects = useMemo(() => allGroups.filter(g => g.parent_id === projectId), [allGroups, projectId]);

  // ── Stream subproject map ──
  const streamSubMap = useMemo(() => {
    const m = new Map<string, TaskGroup>();
    for (const sub of subprojects) {
      const gTags = allGroupTags.filter(gt => gt.group_id === sub.id);
      const streamGTag = gTags.find(gt => {
        if (gt.tag_name && NPD_STREAMS.includes(gt.tag_name)) return true;
        return streamTagIds.has(gt.tag_id);
      });
      const sName = streamGTag
        ? (streamGTag.tag_name && NPD_STREAMS.includes(streamGTag.tag_name) ? streamGTag.tag_name : streamTagById.get(streamGTag.tag_id) ?? null)
        : null;
      if (sName) m.set(sName, sub);
    }
    // Fallback by name
    const normalize = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
    const streamByNorm = new Map(NPD_STREAMS.map(s => [normalize(s), s] as const));
    const tryMatch = (raw: string): string | null => {
      const full = streamByNorm.get(normalize(raw));
      if (full) return full;
      const parts = raw.split(/[\/|—–-]/).map(p => normalize(p)).filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        const match = streamByNorm.get(parts[i]);
        if (match) return match;
      }
      return null;
    };
    const matchedIds = new Set(Array.from(m.values()).map(s => s.id));
    for (const sub of subprojects) {
      if (matchedIds.has(sub.id)) continue;
      const matched = tryMatch(sub.name);
      if (matched && !m.has(matched)) m.set(matched, sub);
    }
    return m;
  }, [subprojects, allGroupTags, streamTagIds, streamTagById]);

  // Auto-repair stream tags
  const [repaired, setRepaired] = useState(false);
  useEffect(() => {
    if (repaired || streamTags.length === 0 || subprojects.length === 0) return;
    setRepaired(true);
    (async () => {
      let changed = false;
      for (const [streamName, sub] of streamSubMap.entries()) {
        const gTags = allGroupTags.filter(gt => gt.group_id === sub.id);
        const hasStreamTag = gTags.some(gt => (gt.tag_name && NPD_STREAMS.includes(gt.tag_name)) || streamTagIds.has(gt.tag_id));
        if (hasStreamTag) continue;
        const streamTag = streamTags.find(t => t.name === streamName);
        if (streamTag) {
          await supabase.from("group_tags" as any).insert({ group_id: sub.id, tag_id: streamTag.id });
          changed = true;
        }
      }
      if (changed) queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });
    })();
  }, [streamSubMap, streamTags, allGroupTags, streamTagIds, subprojects, repaired, queryClient]);

  // ── Gate helpers ──
  const getSubprojectGate = useCallback((subId: string): string | null => {
    const gTags = allGroupTags.filter(gt => gt.group_id === subId);
    for (const gt of gTags) {
      if (gt.tag_name) { const k = tagNameToGateKey.get(gt.tag_name); if (k) return k; }
      for (const tag of gateTags) {
        if (gt.tag_id === tag.id) { const k = tagNameToGateKey.get(tag.name); if (k) return k; }
      }
    }
    return null;
  }, [allGroupTags, gateTags, tagNameToGateKey]);

  const tasksByGroup = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const sub of subprojects) m.set(sub.id, allTasks.filter(t => t.group_id === sub.id));
    return m;
  }, [subprojects, allTasks]);

  const getTaskGate = useCallback((taskId: string): string | null => {
    const tTags = allTaskTags.filter(tt => tt.task_id === taskId);
    // When task has multiple gate tags (from different users), pick the highest gate
    const gateOrder: string[] = NPD_GATES.map(g => g.key);
    let bestGate: string | null = null;
    let bestIdx = -1;
    for (const tt of tTags) {
      const gk = tagIdToGateKey.get(tt.tag_id);
      if (gk) {
        const idx = gateOrder.indexOf(gk);
        if (idx > bestIdx) { bestIdx = idx; bestGate = gk; }
      }
    }
    return bestGate;
  }, [allTaskTags, tagIdToGateKey]);

  const getTaskStream = useCallback((taskId: string): string | null => {
    const tTags = allTaskTags.filter(tt => tt.task_id === taskId);
    for (const tt of tTags) { const sn = streamTagById.get(tt.tag_id); if (sn) return sn; }
    return null;
  }, [allTaskTags, streamTagById]);

  const projectGroupIds = useMemo(() => {
    const ids = new Set<string>();
    if (projectId) ids.add(projectId);
    subprojects.forEach(s => ids.add(s.id));
    return ids;
  }, [projectId, subprojects]);

  const streamTaggedTasksByStream = useMemo(() => {
    const map = new Map<string, Task[]>();
    NPD_STREAMS.forEach(s => map.set(s, []));
    allTasks.forEach(task => {
      if (!task.group_id || !projectGroupIds.has(task.group_id)) return;
      const stream = getTaskStream(task.id);
      if (stream && map.has(stream)) map.get(stream)!.push(task);
    });
    return map;
  }, [allTasks, projectGroupIds, getTaskStream]);

  // ── Inbox ──
  const inboxData = useMemo(() => {
    const matchedSubIds = new Set(Array.from(streamSubMap.values()).map(s => s.id));
    const unmatchedSubs = subprojects.filter(s => !matchedSubIds.has(s.id));
    const parentTasks = allTasks.filter(t => t.group_id === projectId && !getTaskStream(t.id));
    const unmatchedSubTasks = unmatchedSubs.flatMap(s => allTasks.filter(t => t.group_id === s.id && !getTaskStream(t.id)));
    return { parentTasks, unmatchedSubs, unmatchedSubTasks, totalCount: parentTasks.length + unmatchedSubTasks.length + unmatchedSubs.length };
  }, [allTasks, projectId, subprojects, streamSubMap, getTaskStream]);

  // ── Gate start date ──
  const getGateStartDate = useCallback((streamName: string, gateKey: string): Date | undefined => {
    const gateIdx = NPD_GATES.findIndex(g => g.key === gateKey);
    if (gateIdx < 0) return undefined;
    if (gateIdx === 0) return project?.created_at ? new Date(project.created_at) : undefined;
    const prevGateKey = NPD_GATES[gateIdx - 1].key;
    const sub = streamSubMap.get(streamName);
    if (!sub) return project?.created_at ? new Date(project.created_at) : undefined;
    const tasks = tasksByGroup.get(sub.id) || [];
    const streamTaggedTasks = streamTaggedTasksByStream.get(streamName) || [];
    const allStreamTasks = [...tasks, ...streamTaggedTasks];
    const prevGateTasks = allStreamTasks.filter(t => {
      const tg = getTaskGate(t.id);
      if (tg) return tg === prevGateKey;
      return getSubprojectGate(sub.id) === prevGateKey;
    });
    if (prevGateTasks.length === 0) return getGateStartDate(streamName, prevGateKey);
    let maxDeadline: Date | undefined;
    for (const t of prevGateTasks) {
      if (t.deadline) { const d = parseISO(t.deadline); if (!maxDeadline || d > maxDeadline) maxDeadline = d; }
    }
    return maxDeadline || (project?.created_at ? new Date(project.created_at) : undefined);
  }, [project, streamSubMap, tasksByGroup, streamTaggedTasksByStream, getTaskGate, getSubprojectGate]);

  // ── Streams data for rows ──
  const streamsData = useMemo(() => {
    const parentProjectGate = projectId ? getSubprojectGate(projectId) : null;
    return NPD_STREAMS.map(stream => {
      const sub = streamSubMap.get(stream);
      const currentGate = sub ? (getSubprojectGate(sub.id) ?? parentProjectGate) : parentProjectGate;
      const subTasks = sub ? (tasksByGroup.get(sub.id) || []) : [];
      const taggedStreamTasks = streamTaggedTasksByStream.get(stream) || [];
      const tasks = Array.from(new Map([...subTasks, ...taggedStreamTasks].map(t => [t.id, t])).values());
      return { stream, sub, currentGate, tasks };
    });
  }, [streamSubMap, tasksByGroup, streamTaggedTasksByStream, getSubprojectGate, projectId]);

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

  const moveTaskToStream = useCallback(async (taskId: string, newStream: string) => {
    const sub = streamSubMap.get(newStream);
    if (!sub) return;
    await supabase.from("tasks").update({ group_id: sub.id }).eq("id", taskId);
    const taskTagEntries = allTaskTags.filter(tt => tt.task_id === taskId);
    for (const tt of taskTagEntries.filter(tt => streamTagIds.has(tt.tag_id))) {
      await supabase.from("task_tags").delete().eq("task_id", taskId).eq("tag_id", tt.tag_id);
    }
    const newStreamTag = streamTags.find(t => t.name === newStream);
    if (newStreamTag) await supabase.from("task_tags").upsert({ task_id: taskId, tag_id: newStreamTag.id }, { onConflict: "task_id,tag_id" });
  }, [streamSubMap, allTaskTags, streamTagIds, streamTags]);

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
    const currentStreamByGroup = task?.group_id
      ? (() => { for (const [name, sub] of streamSubMap.entries()) { if (sub.id === task.group_id) return name; } return null; })()
      : null;
    const effectiveStream = currentStream || currentStreamByGroup;
    const isInboxTarget = targetStream === "__inbox__";
    const gateChanged = currentGate !== targetGate;
    const streamChanged = !isInboxTarget && effectiveStream !== targetStream;
    if (!gateChanged && !streamChanged && !isInboxTarget) return;

    if (isInboxTarget) {
      if (task?.group_id !== projectId) {
        await supabase.from("tasks").update({ group_id: projectId! }).eq("id", taskId);
        for (const tt of allTaskTags.filter(tt => tt.task_id === taskId)) {
          if (streamTagIds.has(tt.tag_id)) await supabase.from("task_tags").delete().eq("task_id", taskId).eq("tag_id", tt.tag_id);
        }
      }
    } else if (streamChanged) {
      await moveTaskToStream(taskId, targetStream);
    }
    if (gateChanged) await moveTaskToGate(taskId, targetGate);

    queryClient.invalidateQueries({ queryKey: ["npd-matrix-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["npd-task-tags"] });

    const parts: string[] = [];
    if (gateChanged) parts.push(NPD_GATES.find(g => g.key === targetGate)?.short ?? targetGate);
    if (streamChanged) parts.push(targetStream);
    if (isInboxTarget && !streamChanged) parts.push("Входящие");
    toast.success(`Задача перемещена → ${parts.join(" · ")}`);
  }, [dndOverCell, getTaskGate, getTaskStream, allTasks, streamSubMap, moveTaskToGate, moveTaskToStream, queryClient, projectId, allTaskTags, streamTagIds]);

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
      const insertData: any = { title: params.title, user_id: uid, group_id: groupId };
      if (params.deadline) insertData.deadline = params.deadline.toISOString();
      if (params.assigneeId) insertData.assigned_to = params.assigneeId;
      if (params.startFrom) insertData.start_at = params.startFrom.toISOString();
      const { data, error } = await supabase.from("tasks").insert(insertData).select("id").single();
      if (error) { toast.error(error.message); return; }
      if (gateKey && data) {
        const gateTagId = gateKeyToTagId.get(gateKey);
        if (gateTagId) await supabase.from("task_tags").insert({ task_id: data.id, tag_id: gateTagId });
      }
      if (params.assigneeId && data) {
        await supabase.from("task_participants").upsert({ task_id: data.id, user_id: params.assigneeId, role: "assignee" }, { onConflict: "task_id,user_id" });
      }
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["npd-task-tags"] });
      toast.success("Задача создана");
    }
  }, [user, subprojects.length, streamTags, streamsCategoryId, gateKeyToTagId, queryClient]);

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
      <MatrixHeader project={project} projectId={projectId!} allTasks={allTasks} subprojects={subprojects} />

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

            {streamsData.map(({ stream, sub, currentGate, tasks }) => (
              <StreamRow
                key={stream}
                stream={stream}
                sub={sub}
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
            />

            <GateSummary
              projectId={projectId!}
              streamSubMap={streamSubMap}
              tasksByGroup={tasksByGroup}
              streamTaggedTasksByStream={streamTaggedTasksByStream}
              getSubprojectGate={getSubprojectGate}
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

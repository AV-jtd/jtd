import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, useTaskMutations, useAvailableUsers, type Task, type TaskGroup, type Profile } from "@/hooks/useTasks";
import { useDependencies, useDependencyMutations } from "@/hooks/useDependencies";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ProjectDetailPanel from "@/components/ProjectDetailPanel";
import TaskItem from "@/components/TaskItem";
import UserPicker from "@/components/UserPicker";
import DependencyDialog from "@/modules/pmo/components/DependencyDialog";
import { computeCascadeUpdates } from "@/lib/cascadeDependencies";
import QuickCreateForm from "@/components/QuickCreateForm";
import type { QuickCreateType, QuickCreateResult } from "@/components/QuickCreateForm";
import {
  Loader2, ArrowLeft, Plus, X, CalendarIcon, User, CheckCircle2,
  AlertTriangle, Clock, ChevronDown, ChevronRight, Link2, GanttChart,
  Expand, GripVertical, Inbox, FolderPlus, ListPlus,
} from "lucide-react";
import { format, isPast, parseISO, differenceInCalendarDays, addDays } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";

// ── Gate definitions (same as NpdBoard) ──
const NPD_GATES = [
  { key: "gate0", short: "G0", shortTitle: "Идея", title: "Gate 0: Идея", tagName: "Gate 0: Идея и Стратегия", color: "bg-slate-500", textColor: "text-slate-600", bgLight: "bg-slate-500/10" },
  { key: "gate1", short: "G1", shortTitle: "Концепция", title: "Gate 1: Концепция", tagName: "Gate 1: Концепция и Экономика", color: "bg-blue-500", textColor: "text-blue-600", bgLight: "bg-blue-500/10" },
  { key: "gate2", short: "G2", shortTitle: "Разработка", title: "Gate 2: Разработка", tagName: "Gate 2: Разработка и Валидация", color: "bg-amber-500", textColor: "text-amber-600", bgLight: "bg-amber-500/10" },
  { key: "gate3", short: "G3", shortTitle: "Подготовка", title: "Gate 3: Подготовка", tagName: "Gate 3: Подготовка к запуску", color: "bg-purple-500", textColor: "text-purple-600", bgLight: "bg-purple-500/10" },
  { key: "gate4", short: "G4", shortTitle: "Запуск", title: "Gate 4: Запуск", tagName: "Gate 4: Запуск", color: "bg-emerald-500", textColor: "text-emerald-600", bgLight: "bg-emerald-500/10" },
  { key: "gate5", short: "G5", shortTitle: "Анализ", title: "Gate 5: Анализ", tagName: "Gate 5: Анализ запуска", color: "bg-rose-500", textColor: "text-rose-600", bgLight: "bg-rose-500/10" },
];

const NPD_STREAMS = [
  "Продакт", "Реклама", "RnD", "СКК", "Производство", "Закупки", "Продажи", "Покупка оборудования",
];

export default function NpdSwimlaneMatrix() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: allGroups = [], isLoading: groupsLoading } = useTaskGroups();

  // Fetch tasks specifically for this project's subgroups (not global useTasks which has 1000 row limit)
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
      // Fetch in batches of group IDs to avoid URL length limits
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
  const { addDependency, updateDependency, deleteDependency } = useDependencyMutations();
  const { updateTask } = useTaskMutations();

  // Fetch/ensure NPD tags
  const { data: npdTagData } = useQuery({
    queryKey: ["npd-tags-init", user?.id],
    queryFn: async () => {
      if (!user) return { gateTags: [], streamTags: [], gatesCategoryId: null, streamsCategoryId: null };

      // Find or create NPD root category
      let { data: npdCats } = await supabase
        .from("tag_categories")
        .select("id, name, parent_id")
        .eq("user_id", user.id)
        .or("name.eq.NPD");

      let npdRootId: string | null = (npdCats || []).find((c) => !c.parent_id && c.name === "NPD")?.id || null;

      if (!npdRootId) {
        const { data: newCat } = await supabase
          .from("tag_categories")
          .insert({ name: "NPD", user_id: user.id, color: "#8b5cf6", position: 2 })
          .select("id")
          .single();
        npdRootId = newCat?.id || null;
      }

      if (!npdRootId) return { gateTags: [], streamTags: [], gatesCategoryId: null, streamsCategoryId: null };

      // Find or create subcategories
      let { data: subCats } = await supabase
        .from("tag_categories")
        .select("id, name")
        .eq("parent_id", npdRootId)
        .eq("user_id", user.id);

      let gatesCatId = (subCats || []).find((c) => c.name === "Гейты")?.id || null;
      let streamsCatId = (subCats || []).find((c) => c.name === "Стримы")?.id || null;

      if (!gatesCatId) {
        const { data } = await supabase
          .from("tag_categories")
          .insert({ name: "Гейты", user_id: user.id, color: "#8b5cf6", parent_id: npdRootId, position: 0 })
          .select("id")
          .single();
        gatesCatId = data?.id || null;
      }

      if (!streamsCatId) {
        const { data } = await supabase
          .from("tag_categories")
          .insert({ name: "Стримы", user_id: user.id, color: "#8b5cf6", parent_id: npdRootId, position: 1 })
          .select("id")
          .single();
        streamsCatId = data?.id || null;
      }

      // Ensure gate tags in current NPD category
      let { data: existingGateTags } = await supabase
        .from("tags")
        .select("id, name")
        .eq("category_id", gatesCatId!)
        .eq("user_id", user.id);

      const existingGateNames = new Set((existingGateTags || []).map((t) => t.name));
      const missingGates = NPD_GATES.filter((g) => !existingGateNames.has(g.tagName));

      if (missingGates.length > 0) {
        await supabase.from("tags").insert(
          missingGates.map((g) => ({ name: g.tagName, user_id: user.id, color: "#8b5cf6", category_id: gatesCatId! }))
        );
        const { data: refreshed } = await supabase
          .from("tags")
          .select("id, name")
          .eq("category_id", gatesCatId!)
          .eq("user_id", user.id);
        existingGateTags = refreshed;
      }

      // Ensure stream tags in current NPD category
      let { data: existingStreamTags } = await supabase
        .from("tags")
        .select("id, name")
        .eq("category_id", streamsCatId!)
        .eq("user_id", user.id);

      const existingStreamNames = new Set((existingStreamTags || []).map((t) => t.name));
      const missingStreams = NPD_STREAMS.filter((s) => !existingStreamNames.has(s));

      if (missingStreams.length > 0) {
        await supabase.from("tags").insert(
          missingStreams.map((s) => ({ name: s, user_id: user.id, color: "#8b5cf6", category_id: streamsCatId! }))
        );
      }

      // IMPORTANT: include tags with same names from ALL users (for shared projects)
      const gateNames = NPD_GATES.map(g => g.tagName);
      const { data: allGateTagsByName } = await supabase
        .from("tags")
        .select("id, name")
        .in("name", gateNames);

      const { data: allStreamTagsByName } = await supabase
        .from("tags")
        .select("id, name")
        .in("name", NPD_STREAMS);

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

  // Tag maps
  const tagNameToGateKey = useMemo(() => {
    const m = new Map<string, string>();
    NPD_GATES.forEach(g => m.set(g.tagName, g.key));
    return m;
  }, []);

  const gateKeyToTagId = useMemo(() => {
    const m = new Map<string, string>();
    gateTags.forEach(t => {
      const k = tagNameToGateKey.get(t.name);
      if (k) m.set(k, t.id);
    });
    return m;
  }, [gateTags, tagNameToGateKey]);

  // Reverse: tagId → gateKey
  const tagIdToGateKey = useMemo(() => {
    const m = new Map<string, string>();
    gateTags.forEach(t => {
      const k = tagNameToGateKey.get(t.name);
      if (k) m.set(t.id, k);
    });
    return m;
  }, [gateTags, tagNameToGateKey]);

  const gateTagIdSet = useMemo(() => new Set(gateTags.map(t => t.id)), [gateTags]);

  const streamTagIds = useMemo(() => new Set(streamTags.map(t => t.id)), [streamTags]);
  const streamTagById = useMemo(() => new Map(streamTags.map(t => [t.id, t.name])), [streamTags]);

  // Fetch group_tags with tag names (needed for stream mapping + gate detection across users)
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
          group_id: d.group_id as string,
          tag_id: d.tag_id as string,
          tag_name: (d.tags?.name ?? null) as string | null,
        })));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return results;
    },
    enabled: !!user,
  });

  // Build task_tags index from embedded data in allTasks (already fetched with task_tags(tag_id))
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

  // Project data
  const project = allGroups.find(g => g.id === projectId);
  const subprojects = useMemo(
    () => allGroups.filter(g => g.parent_id === projectId),
    [allGroups, projectId]
  );

  // Map stream subprojects — first by stream tag, then fallback by name pattern "Project / StreamName"
  const streamSubMap = useMemo(() => {
    const m = new Map<string, TaskGroup>(); // streamName -> subproject
    for (const sub of subprojects) {
      const gTags = allGroupTags.filter(gt => gt.group_id === sub.id);
      // Match by tag name first (cross-user), then by tag ID
      const streamGTag = gTags.find(gt => {
        if (gt.tag_name && NPD_STREAMS.includes(gt.tag_name)) return true;
        return streamTagIds.has(gt.tag_id);
      });
      const sName = streamGTag
        ? (streamGTag.tag_name && NPD_STREAMS.includes(streamGTag.tag_name) ? streamGTag.tag_name : streamTagById.get(streamGTag.tag_id) ?? null)
        : null;
      if (sName) {
        m.set(sName, sub);
      }
    }
    // Fallback: match unmatched subprojects by name (exact or suffix)
    // Supports both "Реклама" and "Проект / Реклама" (also with -, —, | separators)
    const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
    const streamByNormalized = new Map(NPD_STREAMS.map((s) => [normalize(s), s] as const));

    const tryMatchStreamName = (rawName: string): string | null => {
      const fullMatch = streamByNormalized.get(normalize(rawName));
      if (fullMatch) return fullMatch;

      const parts = rawName
        .split(/[\/|—–-]/)
        .map((p) => normalize(p))
        .filter(Boolean);

      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const match = streamByNormalized.get(parts[i]);
        if (match) return match;
      }
      return null;
    };

    const matchedIds = new Set(Array.from(m.values()).map((s) => s.id));
    for (const sub of subprojects) {
      if (matchedIds.has(sub.id)) continue;
      const matchedStream = tryMatchStreamName(sub.name);
      if (matchedStream && !m.has(matchedStream)) {
        m.set(matchedStream, sub);
      }
    }
    return m;
  }, [subprojects, allGroupTags, streamTagIds, streamTagById]);

  // Auto-repair: assign missing stream tags to subprojects matched by name
  const [repaired, setRepaired] = useState(false);
  useEffect(() => {
    if (repaired || streamTags.length === 0 || subprojects.length === 0) return;
    setRepaired(true);

    (async () => {
      let changed = false;
      for (const [streamName, sub] of streamSubMap.entries()) {
        const gTags = allGroupTags.filter(gt => gt.group_id === sub.id);
        const hasStreamTag = gTags.some(gt => streamTagIds.has(gt.tag_id));
        if (hasStreamTag) continue;

        const streamTag = streamTags.find(t => t.name === streamName);
        if (streamTag) {
          await supabase.from("group_tags" as any).insert({ group_id: sub.id, tag_id: streamTag.id });
          changed = true;
        }
      }
      if (changed) {
        queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });
      }
    })();
  }, [streamSubMap, streamTags, allGroupTags, streamTagIds, subprojects, repaired, queryClient]);

  // Get gate for a subproject — match by tag NAME to work across users
  const getSubprojectGate = useCallback((subId: string): string | null => {
    const gTags = allGroupTags.filter(gt => gt.group_id === subId);
    for (const gt of gTags) {
      // First try by tag name (works across different users' gate tags)
      if (gt.tag_name) {
        const k = tagNameToGateKey.get(gt.tag_name);
        if (k) return k;
      }
      // Fallback: match by tag ID against known gateTags
      for (const tag of gateTags) {
        if (gt.tag_id === tag.id) {
          const k = tagNameToGateKey.get(tag.name);
          if (k) return k;
        }
      }
    }
    return null;
  }, [allGroupTags, gateTags, tagNameToGateKey]);

  // Tasks per subproject
  const tasksByGroup = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const sub of subprojects) {
      m.set(sub.id, allTasks.filter(t => t.group_id === sub.id));
    }
    return m;
  }, [subprojects, allTasks]);

  // Map task → gateKey using task_tags
  const getTaskGate = useCallback((taskId: string): string | null => {
    const tTags = allTaskTags.filter(tt => tt.task_id === taskId);
    for (const tt of tTags) {
      const gk = tagIdToGateKey.get(tt.tag_id);
      if (gk) return gk;
    }
    return null;
  }, [allTaskTags, tagIdToGateKey]);

  // Map task → stream using task_tags
  const getTaskStream = useCallback((taskId: string): string | null => {
    const tTags = allTaskTags.filter(tt => tt.task_id === taskId);
    for (const tt of tTags) {
      const streamName = streamTagById.get(tt.tag_id);
      if (streamName) return streamName;
    }
    return null;
  }, [allTaskTags, streamTagById]);

  // All group IDs belonging to this project (parent + all subprojects)
  const projectGroupIds = useMemo(() => {
    const ids = new Set<string>();
    if (projectId) ids.add(projectId);
    subprojects.forEach(s => ids.add(s.id));
    return ids;
  }, [projectId, subprojects]);

  // All project tasks that already have explicit stream tags, grouped by stream
  const streamTaggedTasksByStream = useMemo(() => {
    const map = new Map<string, Task[]>();
    NPD_STREAMS.forEach(stream => map.set(stream, []));

    allTasks.forEach(task => {
      if (!task.group_id || !projectGroupIds.has(task.group_id)) return;
      const stream = getTaskStream(task.id);
      if (stream && map.has(stream)) {
        map.get(stream)!.push(task);
      }
    });

    return map;
  }, [allTasks, projectGroupIds, getTaskStream]);

  // Inbox: only tasks/subprojects that are not mapped to a stream in matrix
  const inboxData = useMemo(() => {
    const matchedSubIds = new Set(Array.from(streamSubMap.values()).map(s => s.id));
    const unmatchedSubs = subprojects.filter(s => !matchedSubIds.has(s.id));

    const parentTasks = allTasks.filter(
      t => t.group_id === projectId && !getTaskStream(t.id)
    );

    const unmatchedSubTasks = unmatchedSubs.flatMap(s =>
      allTasks.filter(t => t.group_id === s.id && !getTaskStream(t.id))
    );

    return {
      parentTasks,
      unmatchedSubs,
      unmatchedSubTasks,
      totalCount: parentTasks.length + unmatchedSubTasks.length + unmatchedSubs.length,
    };
  }, [allTasks, projectId, subprojects, streamSubMap, getTaskStream]);

  // ── Compute start date for each gate in each stream ──
  // Gate 0 → project created_at; Gate N → MAX(deadline) of tasks in Gate N-1 for that stream
  const getGateStartDate = useCallback((streamName: string, gateKey: string): Date | undefined => {
    const gateIdx = NPD_GATES.findIndex(g => g.key === gateKey);
    if (gateIdx < 0) return undefined;

    // Gate 0 — start from project creation
    if (gateIdx === 0) {
      return project?.created_at ? new Date(project.created_at) : undefined;
    }

    // Previous gate key
    const prevGateKey = NPD_GATES[gateIdx - 1].key;

    // Find the stream subproject
    const sub = streamSubMap.get(streamName);
    if (!sub) return project?.created_at ? new Date(project.created_at) : undefined;

    const tasks = tasksByGroup.get(sub.id) || [];
    // Also include stream-tagged tasks from parent group
    const streamTaggedTasks = streamTaggedTasksByStream.get(streamName) || [];
    const allStreamTasks = [...tasks, ...streamTaggedTasks];

    // Filter tasks in the previous gate
    const prevGateTasks = allStreamTasks.filter(t => {
      const tg = getTaskGate(t.id);
      if (tg) return tg === prevGateKey;
      // Fallback: if no task-level gate, check subproject gate
      const subGate = getSubprojectGate(sub.id);
      return subGate === prevGateKey;
    });

    if (prevGateTasks.length === 0) {
      // No tasks in previous gate — recurse to find earlier gate boundary
      return getGateStartDate(streamName, prevGateKey);
    }

    // MAX(deadline) of previous gate tasks
    let maxDeadline: Date | undefined;
    for (const t of prevGateTasks) {
      if (t.deadline) {
        const d = parseISO(t.deadline);
        if (!maxDeadline || d > maxDeadline) maxDeadline = d;
      }
    }

    // If no deadlines set in previous gate, fall back to project creation
    return maxDeadline || (project?.created_at ? new Date(project.created_at) : undefined);
  }, [project, streamSubMap, tasksByGroup, streamTaggedTasksByStream, getTaskGate, getSubprojectGate]);


  const moveStreamToGate = async (subId: string, gateKey: string) => {
    const gateTagId = gateKeyToTagId.get(gateKey);
    if (!gateTagId) return;

    // Remove old gate tags (match by name to handle cross-user tags)
    const gateNameSet = new Set(NPD_GATES.map(g => g.tagName));
    const gTags = allGroupTags.filter(gt => gt.group_id === subId);
    for (const gt of gTags) {
      const isGate = (gt.tag_name && gateNameSet.has(gt.tag_name)) || gateTags.some(g => g.id === gt.tag_id);
      if (isGate) {
        await supabase.from("group_tags" as any).delete().eq("group_id", subId).eq("tag_id", gt.tag_id);
      }
    }
    // Add new
    await supabase.from("group_tags" as any).insert({ group_id: subId, tag_id: gateTagId });
    queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });
    toast.success("Стрим перемещён в " + NPD_GATES.find(g => g.key === gateKey)?.title);
  };

  // Unified create handler for QuickCreateForm
  const handleQuickCreate = async (
    params: QuickCreateResult,
    groupId: string,
    streamName?: string,
    gateKey?: string,
  ) => {
    if (!user) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) { toast.error("Сессия истекла"); return; }

    if (params.type === "subproject") {
      // If groupId is a stream subproject (not the main project), nest under it
      // Otherwise create as a direct child of the main project
      const parentId = groupId;
      const { data: newSub, error } = await supabase
        .from("task_groups")
        .insert({
          name: params.title,
          user_id: uid,
          project_type: "npd",
          icon: "📋",
          color: "#8b5cf6",
          parent_id: parentId,
          position: subprojects.length,
        })
        .select("id")
        .single();
      if (error || !newSub) { toast.error(error?.message || "Ошибка"); return; }

      // Assign stream tag if we know the stream
      if (streamName) {
        let streamTagId = streamTags.find(t => t.name === streamName)?.id;

        // Safety: if stream tag was missing for this user, create it on the fly
        if (!streamTagId && streamsCategoryId) {
          const { data: createdStreamTag } = await supabase
            .from("tags")
            .insert({ name: streamName, user_id: uid, color: "#8b5cf6", category_id: streamsCategoryId })
            .select("id")
            .single();
          streamTagId = createdStreamTag?.id;
          queryClient.invalidateQueries({ queryKey: ["npd-tags-init", user?.id] });
        }

        if (streamTagId) {
          await supabase.from("group_tags" as any).insert({ group_id: newSub.id, tag_id: streamTagId });
        }
      }
      // Assign gate tag
      if (gateKey) {
        const gateTagId = gateKeyToTagId.get(gateKey);
        if (gateTagId) {
          await supabase.from("group_tags" as any).insert({ group_id: newSub.id, tag_id: gateTagId });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["task-groups"] });
      queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });
      queryClient.invalidateQueries({ queryKey: ["all_group_tags"] });
      toast.success(`Подпроект «${params.title}» создан`);
    } else {
      // Create task
      const insertData: any = {
        title: params.title,
        user_id: uid,
        group_id: groupId,
      };
      if (params.deadline) insertData.deadline = params.deadline.toISOString();
      if (params.assigneeId) insertData.assigned_to = params.assigneeId;
      // Set start_at from gate boundary (template — user can adjust later via dependencies)
      if (params.startFrom) insertData.start_at = params.startFrom.toISOString();

      const { data, error } = await supabase.from("tasks").insert(insertData).select("id").single();
      if (error) { toast.error(error.message); return; }

      // Assign gate tag to task so it appears in the correct cell
      if (gateKey && data) {
        const gateTagId = gateKeyToTagId.get(gateKey);
        if (gateTagId) {
          await supabase.from("task_tags").insert({ task_id: data.id, tag_id: gateTagId });
        }
      }

      if (params.assigneeId && data) {
        await supabase.from("task_participants").upsert({
          task_id: data.id,
          user_id: params.assigneeId,
          role: "assignee",
        }, { onConflict: "task_id,user_id" });
      }

      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["npd-task-tags"] });
      toast.success("Задача создана");
    }
  };

  // Legacy handleCreateSubproject removed — now handled via handleQuickCreate

  // Cascade update on deadline change
  const handleDeadlineChange = async (task: Task, newDeadline: Date) => {
    const oldDeadline = task.deadline ? parseISO(task.deadline) : new Date(task.created_at);
    
    updateTask.mutate({ id: task.id, deadline: newDeadline.toISOString() });

    // Compute cascade
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
  };

  // Dependency dialog
  const [depDialogState, setDepDialogState] = useState<{
    predecessorId: string;
    successorId: string;
    predecessorLabel: string;
    successorLabel: string;
    predecessorEntityType: string;
    successorEntityType: string;
  } | null>(null);

  // Detail sheet
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const detailTask = detailTaskId ? allTasks.find(t => t.id === detailTaskId) : null;

  // Collapsed streams
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (stream: string) => {
    setCollapsed(prev => {
      const n = new Set(prev);
      if (n.has(stream)) n.delete(stream); else n.add(stream);
      return n;
    });
  };

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

  const projectName = project.name;




  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <header className="flex items-center h-12 px-4 border-b border-border bg-card shrink-0 gap-3">
        <button onClick={() => navigate("/npd")} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm leading-none">{project.icon && project.icon !== "list" ? project.icon : "🧪"}</span>
          <h1 className="text-sm font-bold text-foreground truncate">{projectName}</h1>
        </div>
        {/* Mini progress */}
        {(() => {
          const allProjectTasks = allTasks.filter(t => {
            const ids = [projectId!, ...subprojects.map(s => s.id)];
            return t.group_id && ids.includes(t.group_id);
          });
          const total = allProjectTasks.length;
          const done = allProjectTasks.filter(t => t.is_completed).length;
          if (total === 0) return null;
          return (
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((done / total) * 100)}%` }} />
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">{done}/{total}</span>
            </div>
          );
        })()}
        <div className="flex-1" />
        <Link
          to={`/pmo?project=${projectId}`}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <GanttChart className="h-3 w-3" />
          Гант
        </Link>
      </header>

      {/* Matrix */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
          {/* Column headers */}
          <div className="flex sticky top-0 z-10 bg-card border-b border-border">
            <div className="min-w-[200px] w-[200px] shrink-0 px-3 py-2.5 border-r border-border flex items-center justify-between">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Стрим</span>
              <button
                onClick={() => {
                  setCollapsed(prev => {
                    const allCollapsed = NPD_STREAMS.every(s => prev.has(s));
                    return allCollapsed ? new Set() : new Set(NPD_STREAMS);
                  });
                }}
                className="text-muted-foreground/50 hover:text-foreground transition-colors p-0.5 rounded"
                title={collapsed.size === NPD_STREAMS.length ? "Развернуть все" : "Свернуть все"}
              >
                {collapsed.size === NPD_STREAMS.length
                  ? <ChevronRight className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />
                }
              </button>
            </div>
            {NPD_GATES.map(gate => (
              <div key={gate.key} className={cn("min-w-[220px] w-[220px] shrink-0 px-3 py-2.5 border-r border-border", gate.bgLight)}>
                <div className="flex items-center gap-1.5">
                  <div className={cn("h-2.5 w-2.5 rounded-full", gate.color)} />
                  <span className={cn("text-xs font-bold", gate.textColor)}>{gate.short}</span>
                  <span className="text-[10px] text-muted-foreground/60">·</span>
                  <span className="text-[10px] text-muted-foreground truncate">{gate.shortTitle}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Stream rows */}
          {NPD_STREAMS.map(stream => {
            const sub = streamSubMap.get(stream);
            const isCollapsed = collapsed.has(stream);
            const parentProjectGate = projectId ? getSubprojectGate(projectId) : null;
            const currentGate = sub ? (getSubprojectGate(sub.id) ?? parentProjectGate) : parentProjectGate;
            const subTasks = sub ? (tasksByGroup.get(sub.id) || []) : [];
            const taggedStreamTasks = streamTaggedTasksByStream.get(stream) || [];
            const tasks = Array.from(new Map([...subTasks, ...taggedStreamTasks].map(t => [t.id, t])).values());
            const activeTasks = tasks.filter(t => !t.is_completed);
            const completedCount = tasks.filter(t => t.is_completed).length;
            const overdueTasks = activeTasks.filter(t => t.deadline && isPast(parseISO(t.deadline)));

            return (
              <div key={stream} className="border-b border-border">
                <div className="flex">
                  <div className={cn(
                    "min-w-[200px] w-[200px] shrink-0 border-r border-border bg-card/50",
                    isCollapsed && overdueTasks.length > 0 && "bg-destructive/5"
                  )}>
                    <button
                      onClick={() => toggleCollapse(stream)}
                      className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-muted/50 transition-colors text-left"
                    >
                      {isCollapsed
                        ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      }
                      <span className="text-xs font-semibold text-foreground truncate">{stream}</span>
                      <div className="flex items-center gap-1.5 ml-auto shrink-0">
                        {overdueTasks.length > 0 && (
                          <span className="text-[9px] text-destructive font-medium flex items-center gap-0.5">
                            <AlertTriangle className="h-3 w-3" />
                            {overdueTasks.length}
                          </span>
                        )}
                        {tasks.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {completedCount}/{tasks.length}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  {NPD_GATES.map(gate => {
                    const isCurrentGate = currentGate === gate.key;
                    const cellTasks = tasks.filter(t => {
                      const taskGate = getTaskGate(t.id);
                      return taskGate ? taskGate === gate.key : currentGate === gate.key;
                    });
                    const hasTasks = cellTasks.length > 0;

                    return (
                      <div
                        key={gate.key}
                        className={cn(
                          "min-w-[220px] w-[220px] shrink-0 border-r border-border transition-colors",
                          (isCurrentGate || hasTasks) ? cn(gate.bgLight, "border-l-2", gate.color.replace("bg-", "border-l-")) : "bg-background/50",
                        )}
                      >
                        {!isCollapsed && (
                          <div className="px-2 py-2 min-h-[60px]">
                            {sub ? (
                              <div className="space-y-1">
                                {cellTasks.map(task => (
                                  <MatrixTaskRow
                                    key={task.id}
                                    task={task}
                                    users={users}
                                    allDependencies={allDependencies}
                                    allTasks={allTasks}
                                    projectGroupIds={projectGroupIds}
                                    onDeadlineChange={handleDeadlineChange}
                                    onAssigneeChange={(taskId, userId) => {
                                      updateTask.mutate({ id: taskId, assigned_to: userId });
                                      if (userId) {
                                        supabase.from("task_participants").upsert({
                                          task_id: taskId, user_id: userId, role: "assignee",
                                        }, { onConflict: "task_id,user_id" });
                                      }
                                    }}
                                    onToggle={(taskId) => {
                                      const t = allTasks.find(x => x.id === taskId);
                                      if (!t) return;
                                      updateTask.mutate({
                                        id: taskId,
                                        is_completed: !t.is_completed,
                                        completed_at: !t.is_completed ? new Date().toISOString() : null,
                                      });
                                    }}
                                    onAddDependency={(predId, succId) => {
                                      const pred = allTasks.find(t => t.id === predId);
                                      const succ = allTasks.find(t => t.id === succId);
                                      setDepDialogState({
                                        predecessorId: predId, successorId: succId,
                                        predecessorLabel: pred?.title || predId,
                                        successorLabel: succ?.title || succId,
                                        predecessorEntityType: "task", successorEntityType: "task",
                                      });
                                    }}
                                    onExpand={(id) => setDetailTaskId(id)}
                                  />
                                ))}
                                <QuickCreateForm
                                  users={users}
                                  singleType="task"
                                  onCreate={(p) => handleQuickCreate(p, sub.id, stream, gate.key)}
                                  compact={cellTasks.length === 0}
                                  startFrom={getGateStartDate(stream, gate.key)}
                                  startFromLabel={NPD_GATES.findIndex(g => g.key === gate.key) > 0 ? `после ${NPD_GATES[NPD_GATES.findIndex(g => g.key === gate.key) - 1].short}` : "старт проекта"}
                                />
                              </div>
                            ) : (
                              <div className="flex items-center justify-center min-h-[40px]">
                                <QuickCreateForm
                                  users={users}
                                  singleType="task"
                                  onCreate={(p) => handleQuickCreate(p, projectId!, stream, gate.key)}
                                  compact
                                  startFrom={getGateStartDate(stream, gate.key)}
                                  startFromLabel={NPD_GATES.findIndex(g => g.key === gate.key) > 0 ? `после ${NPD_GATES[NPD_GATES.findIndex(g => g.key === gate.key) - 1].short}` : "старт проекта"}
                                />
                              </div>
                            )}
                          </div>
                        )}
                        {isCollapsed && (hasTasks || isCurrentGate) && (() => {
                          const cellCompleted = cellTasks.filter(t => t.is_completed).length;
                          const cellOverdue = cellTasks.filter(t => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))).length;
                          const cellPct = cellTasks.length > 0 ? Math.round((cellCompleted / cellTasks.length) * 100) : 0;
                          return (
                            <div
                              onClick={() => toggleCollapse(stream)}
                              className={cn(
                                "px-2.5 py-2 flex items-center gap-2 cursor-pointer hover:bg-muted/40 transition-colors",
                                cellOverdue > 0 && "bg-destructive/5 hover:bg-destructive/10"
                              )}
                            >
                              {cellTasks.length > 0 ? (
                                <>
                                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                                    <div className={cn("h-full rounded-full transition-all", gate.color)} style={{ width: `${cellPct}%` }} />
                                  </div>
                                  <span className="text-[9px] font-mono text-muted-foreground shrink-0">{cellCompleted}/{cellTasks.length}</span>
                                  {cellOverdue > 0 && (
                                    <span className="text-[9px] text-destructive flex items-center gap-0.5 shrink-0">
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      {cellOverdue}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-[9px] text-muted-foreground/40">—</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="flex border-t border-border bg-card/40">
            <div className="min-w-[200px] w-[200px] shrink-0 px-3 py-3 border-r border-border text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Итого по гейтам
            </div>
            {NPD_GATES.map(gate => {
              let gateTotalTasks = 0;
              let gateCompletedTasks = 0;
              let gateOverdue = 0;
              const streamsInGate: string[] = [];
              const parentProjectGate = projectId ? getSubprojectGate(projectId) : null;

              NPD_STREAMS.forEach(s => {
                const sub = streamSubMap.get(s);
                const subTasks = sub ? (tasksByGroup.get(sub.id) || []) : [];
                const taggedStreamTasks = streamTaggedTasksByStream.get(s) || [];
                const tasks = Array.from(new Map([...subTasks, ...taggedStreamTasks].map(t => [t.id, t])).values());
                const currentGate = sub ? (getSubprojectGate(sub.id) ?? parentProjectGate) : parentProjectGate;

                const cellTasks = tasks.filter(t => {
                  const taskGate = getTaskGate(t.id);
                  return taskGate ? taskGate === gate.key : currentGate === gate.key;
                });

                if (cellTasks.length > 0) {
                  streamsInGate.push(s);
                  gateTotalTasks += cellTasks.length;
                  gateCompletedTasks += cellTasks.filter(t => t.is_completed).length;
                  gateOverdue += cellTasks.filter(t => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))).length;
                }
              });

              const gatePct = gateTotalTasks > 0 ? Math.round((gateCompletedTasks / gateTotalTasks) * 100) : 0;

              return (
                <div key={gate.key} className={cn("min-w-[220px] w-[220px] shrink-0 border-r border-border px-3 py-3", gateTotalTasks > 0 ? gate.bgLight : "")}>
                  {gateTotalTasks > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {streamsInGate.map(s => (
                          <span key={s} className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium", gate.bgLight, gate.textColor)}>
                            {s}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", gate.color)} style={{ width: `${gatePct}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">{gatePct}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{gateCompletedTasks}/{gateTotalTasks}</span>
                        {gateOverdue > 0 && (
                          <span className="text-[10px] text-destructive flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {gateOverdue}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
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

            // Auto-set successor's start_at and deadline based on predecessor's end date (FS only)
            if (type === "FS") {
              let predEndDate: Date | null = null;
              if (depDialogState.predecessorEntityType === "task") {
                const predTask = allTasks.find(t => t.id === depDialogState.predecessorId);
                if (predTask?.deadline) predEndDate = parseISO(predTask.deadline);
              } else if (depDialogState.predecessorEntityType === "project") {
                const gTasks = allTasks.filter(t => t.group_id === depDialogState.predecessorId);
                const latest = gTasks.reduce((max, t) => {
                  const d = t.deadline || t.created_at;
                  return d > max ? d : max;
                }, "");
                if (latest) predEndDate = parseISO(latest);
              }

              if (predEndDate && depDialogState.successorEntityType === "task") {
                const newStart = addDays(predEndDate, Math.max(lag, 1));
                const succTask = allTasks.find(t => t.id === depDialogState.successorId);
                if (succTask) {
                  const oldStart = succTask.start_at ? parseISO(succTask.start_at) : parseISO(succTask.created_at);
                  // Only move successor forward, never backward
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

// ── Matrix Task Row ──
function MatrixTaskRow({
  task, users, allDependencies, allTasks, projectGroupIds,
  onDeadlineChange, onAssigneeChange, onToggle, onAddDependency, onExpand,
}: {
  task: Task;
  users: Profile[];
  allDependencies: any[];
  allTasks: Task[];
  projectGroupIds: Set<string>;
  onDeadlineChange: (task: Task, date: Date) => void;
  onAssigneeChange: (taskId: string, userId: string | null) => void;
  onToggle: (taskId: string) => void;
  onAddDependency: (predId: string, succId: string) => void;
  onExpand?: (taskId: string) => void;
}) {
  const isOverdue = !task.is_completed && task.deadline && isPast(parseISO(task.deadline));
  const hasDrift = task.original_deadline && task.deadline && task.original_deadline !== task.deadline;
  const driftDays = hasDrift
    ? differenceInCalendarDays(parseISO(task.deadline!), parseISO(task.original_deadline!))
    : 0;

  const assignee = users.find(u => u.id === task.assigned_to);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [depPickerOpen, setDepPickerOpen] = useState(false);

  // Deps for this task
  const taskDeps = allDependencies.filter(
    d => d.predecessor_id === task.id || d.successor_id === task.id
  );

  return (
    <div className={cn(
      "group flex flex-col gap-0.5 px-1.5 py-1 rounded-md transition-colors min-w-0",
      task.is_completed ? "bg-muted/30" : isOverdue ? "bg-destructive/5" : "hover:bg-muted/40",
    )}>
      {/* Row 1: checkbox + title + expand */}
      <div className="flex items-center gap-1 min-w-0">
        <button
          onClick={() => onToggle(task.id)}
          className="shrink-0"
        >
          <CheckCircle2 className={cn(
            "h-3.5 w-3.5",
            task.is_completed ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"
          )} />
        </button>

        <span className={cn(
          "text-[11px] truncate flex-1 min-w-0",
          task.is_completed && "line-through text-muted-foreground",
          isOverdue && "text-destructive",
        )}>
          {task.title}
        </span>

        {/* Drift badge */}
        {hasDrift && driftDays !== 0 && (
          <span className={cn(
            "text-[8px] font-mono font-bold shrink-0 px-1 rounded",
            driftDays > 0 ? "text-destructive bg-destructive/10" : "text-primary bg-primary/10"
          )}>
            {driftDays > 0 ? `+${driftDays}д` : `${driftDays}д`}
          </span>
        )}

        {/* Dependencies indicator */}
        {taskDeps.length > 0 && (
          <span className="text-[8px] text-primary shrink-0">
            <Link2 className="h-3 w-3" />
          </span>
        )}

        {onExpand && (
          <button
            onClick={() => onExpand(task.id)}
            className="shrink-0 text-muted-foreground/30 hover:text-foreground opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded"
            title="Открыть карточку"
          >
            <Expand className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Row 2: deadline + assignee + dep link — hidden if nothing set, shown on hover */}
      <div className={cn(
        "flex items-center gap-1.5 pl-5 min-w-0",
        !task.deadline && !assignee ? "hidden group-hover:flex" : ""
      )}>
        {/* Deadline picker */}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <button className={cn(
              "shrink-0 text-[10px] px-1 py-0 rounded transition-colors",
              task.deadline
                ? isOverdue
                  ? "text-destructive font-medium"
                  : "text-muted-foreground hover:text-foreground"
                : "text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100"
            )}>
              {task.deadline
                ? format(parseISO(task.deadline), "d MMM", { locale: ru })
                : <CalendarIcon className="h-3 w-3" />
              }
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={task.deadline ? parseISO(task.deadline) : undefined}
              onSelect={(date) => {
                if (date) {
                  onDeadlineChange(task, date);
                  setCalOpen(false);
                }
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        {/* Assignee */}
        <UserPicker
          users={users}
          onSelect={(u) => onAssigneeChange(task.id, u.id)}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="Ответственный"
          trigger={
            <button className={cn(
              "shrink-0 text-[10px] px-1 py-0 rounded transition-colors max-w-[70px] truncate",
              assignee
                ? "text-foreground font-medium"
                : "text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100"
            )}>
              {assignee
                ? (assignee.display_name || "").split(" ")[0] || "👤"
                : <User className="h-3 w-3" />
              }
            </button>
          }
        />

        {/* Add dependency button */}
        <Popover open={depPickerOpen} onOpenChange={setDepPickerOpen}>
          <PopoverTrigger asChild>
            <button className="shrink-0 text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-all p-0.5 rounded">
              <Link2 className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="end">
            <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">Выбрать преемника</p>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {allTasks
                .filter(t => t.id !== task.id && !t.is_completed && t.group_id && projectGroupIds.has(t.group_id))
                .slice(0, 30)
                .map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onAddDependency(task.id, t.id);
                      setDepPickerOpen(false);
                    }}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors text-left"
                  >
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

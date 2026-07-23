import { useMemo, useState, useEffect, useCallback, useRef, type ComponentProps } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Diamond } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, useTasks, useGroupMembers, useAvailableUsers, useTaskMutations, type Task, type TaskGroup } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import { EMOJI_CATEGORIES } from "@/lib/emojiCategories";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import TaskItem from "@/components/TaskItem";
import ProjectDetailPanel from "@/components/ProjectDetailPanel";
import MigrateToNpdDialog from "@/components/MigrateToNpdDialog";
import QuickCreateForm from "@/components/QuickCreateForm";
import type { QuickCreateType } from "@/components/QuickCreateForm";
import {
  Loader2, Folder, FolderPlus, Inbox, CheckCircle2, GripVertical,
  Plus, AlertTriangle, Clock, ChevronDown, ChevronRight, Check,
  Search, X, Filter, Eye, EyeOff, Layers, LayoutGrid, ListChecks, Expand,
  GanttChart, Grid3X3, PanelLeft, User, Tag, Sparkles, TrendingUp, CalendarDays,
} from "lucide-react";
import { isPast, parseISO, format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { DndContext, DragOverlay, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useBoardDnd } from "@/hooks/useBoardDnd";
import { BoardColumn } from "@/components/board/BoardColumn";
import NpdAiTasksPopover from "@/modules/npd/components/NpdAiTasksPopover";
import NpdRiskRadar from "@/modules/npd/components/NpdRiskRadar";
import { DraggableWrapper } from "@/components/board/DraggableWrapper";

// ── Gate definitions ──
type GateStage = {
  key: string;
  short: string;
  shortTitle: string;
  title: string;
  tagName: string;
  color: string;
  textColor: string;
  bgLight: string;
};

const NPD_GATES: GateStage[] = [
  { key: "gate0", short: "G0", title: "Gate 0: Идея", shortTitle: "Идея", tagName: "Gate 0: Идея и Стратегия", color: "bg-slate-500", textColor: "text-slate-600", bgLight: "bg-slate-500/10" },
  { key: "gate1", short: "G1", title: "Gate 1: Концепция", shortTitle: "Концепция", tagName: "Gate 1: Концепция и Экономика", color: "bg-blue-500", textColor: "text-blue-600", bgLight: "bg-blue-500/10" },
  { key: "gate2", short: "G2", title: "Gate 2: Разработка", shortTitle: "Разработка", tagName: "Gate 2: Разработка и Валидация", color: "bg-amber-500", textColor: "text-amber-600", bgLight: "bg-amber-500/10" },
  { key: "gate3", short: "G3", title: "Gate 3: Подготовка", shortTitle: "Подготовка", tagName: "Gate 3: Подготовка к запуску", color: "bg-purple-500", textColor: "text-purple-600", bgLight: "bg-purple-500/10" },
  { key: "gate4", short: "G4", title: "Gate 4: Запуск", shortTitle: "Запуск", tagName: "Gate 4: Запуск", color: "bg-emerald-500", textColor: "text-emerald-600", bgLight: "bg-emerald-500/10" },
  { key: "gate5", short: "G5", title: "Gate 5: Анализ", shortTitle: "Анализ", tagName: "Gate 5: Анализ запуска", color: "bg-rose-500", textColor: "text-rose-600", bgLight: "bg-rose-500/10" },
];

const GATE_ORDER = NPD_GATES.map((g) => g.key);

const NPD_STREAMS = [
  "Продакт", "Реклама", "RnD", "СКК", "Производство", "Закупки", "Продажи", "Покупка оборудования",
];

// ── Types ──
type NpdProject = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  parent_id: string | null;
  user_id: string;
  gateTags: string[];
  allGateKeys: string[];
  streamTags: string[];
  otherTagIds: string[];
  assigneeUserId: string | null;
  stats: { total: number; completed: number; overdue: number };
  streamStats: { name: string; total: number; completed: number }[];
  nearestDeadline: string | null; // ISO date of closest upcoming active task deadline
};

type NpdMilestone = {
  id: string;
  name: string;
  group_id: string;
  planned_date: string;
  status: string;
  color: string | null;
};

// ── Main component ──
export default function NpdBoard({ projectFilter, onProjectFilterChange }: {
  projectFilter?: string | null;
  onProjectFilterChange?: (id: string | null) => void;
} = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: allGroups = [] } = useTaskGroups();
  // Performance: NPD board renders the swimlane matrix and subproject lists,
  // both of which only ever surface ACTIVE tasks (completed are at most a
  // brief line-through after a checkbox tap). Capping the completed window
  // to 7 days drops the bulk of the wire payload on heavy accounts.
  // Card-level "X/Y" metrics still need the full count → those come from
  // the server-side `useGroupTaskStats` aggregate (see `npdStatsById` below).
  const { data: allTasks = [] } = useTasks(undefined, undefined, { completedWindowDays: 14 });
  const { data: availableUsers = [] } = useAvailableUsers();

  // Fetch all tags for filtering
  const { data: allTagsRaw = [] } = useQuery({
    queryKey: ["all-tags-for-npd-filter", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("id, name, color");
      if (error) throw error;
      return data as { id: string; name: string; color: string | null }[];
    },
    enabled: !!user,
  });

  // Fetch all group members for NPD projects (for assignee filter)
  const { data: allGroupMembers = [] } = useQuery({
    queryKey: ["npd-all-group-members", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("group_members").select("group_id, user_id, role");
      if (error) throw error;
      return data as { group_id: string; user_id: string; role: string }[];
    },
    enabled: !!user,
  });

  // Fetch milestones for all NPD projects
  const { data: allMilestones = [] } = useQuery({
    queryKey: ["npd-milestones", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_milestones")
        .select("id, name, group_id, planned_date, status, color");
      if (error) throw error;
      return data as NpdMilestone[];
    },
    enabled: !!user,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenGates, setHiddenGates] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("npd-hidden-gates");
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [activeStreams, setActiveStreams] = useState<Set<string>>(new Set());
  const [showInbox, setShowInbox] = useState(true);
  const [_showArchive, _setShowArchive] = useState(false); // kept for hook order
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [swimlaneMode, setSwimlaneMode] = useState(() => {
    try { return localStorage.getItem("npd-swimlane") === "true"; } catch { return false; }
  });

  useEffect(() => {
    localStorage.setItem("npd-swimlane", String(swimlaneMode));
  }, [swimlaneMode]);

  // Save hidden gates to localStorage
  useEffect(() => {
    localStorage.setItem("npd-hidden-gates", JSON.stringify([...hiddenGates]));
  }, [hiddenGates]);

  // ── Fetch/ensure NPD tags ──
  const { data: npdTagData } = useQuery({
    queryKey: ["npd-tags-init", user?.id],
    queryFn: async () => {
      if (!user) return { gateTags: [], streamTags: [], gatesCategoryId: null, streamsCategoryId: null };

      // Find or create NPD category
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

      // Find or create gate tags
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
          .from("tags").select("id, name").eq("category_id", gatesCatId!).eq("user_id", user.id);
        existingGateTags = refreshed;
      }

      // Find or create stream tags
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
        const { data: refreshed } = await supabase
          .from("tags").select("id, name").eq("category_id", streamsCatId!).eq("user_id", user.id);
        existingStreamTags = refreshed;
      }

      return {
        gateTags: (existingGateTags || []) as { id: string; name: string }[],
        streamTags: (existingStreamTags || []) as { id: string; name: string }[],
        gatesCategoryId: gatesCatId,
        streamsCategoryId: streamsCatId,
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 30,
  });

  // ── Fetch ALL gate/stream tags across all users (for shared projects) ──
  const { data: allNpdTags } = useQuery({
    queryKey: ["npd-all-gate-stream-tags"],
    queryFn: async () => {
      const gateNames = NPD_GATES.map((g) => g.tagName);
      const { data: allGates } = await supabase
        .from("tags")
        .select("id, name")
        .in("name", gateNames);
      const { data: allStreams } = await supabase
        .from("tags")
        .select("id, name")
        .in("name", NPD_STREAMS);
      return {
        allGateTags: (allGates || []) as { id: string; name: string }[],
        allStreamTags: (allStreams || []) as { id: string; name: string }[],
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 30,
  });

  const ownGateTags = npdTagData?.gateTags || [];
  const ownStreamTags = npdTagData?.streamTags || [];

  // Merge own + all users' tags (deduplicated by id)
  const gateTags = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const t of ownGateTags) map.set(t.id, t);
    for (const t of (allNpdTags?.allGateTags || [])) map.set(t.id, t);
    return [...map.values()];
  }, [ownGateTags, allNpdTags]);

  const streamTags = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const t of ownStreamTags) map.set(t.id, t);
    for (const t of (allNpdTags?.allStreamTags || [])) map.set(t.id, t);
    return [...map.values()];
  }, [ownStreamTags, allNpdTags]);

  // Map tag name -> gate key
  const tagNameToGateKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const gate of NPD_GATES) {
      m.set(gate.tagName, gate.key);
    }
    return m;
  }, []);

  // Map gate key -> tag id (prefer own user's tag id for mutations)
  const gateKeyToTagId = useMemo(() => {
    const m = new Map<string, string>();
    for (const tag of gateTags) {
      const key = tagNameToGateKey.get(tag.name);
      if (key) m.set(key, tag.id);
    }
    // Overwrite with own tags so mutations use own tag ids
    for (const tag of ownGateTags) {
      const key = tagNameToGateKey.get(tag.name);
      if (key) m.set(key, tag.id);
    }
    return m;
  }, [gateTags, ownGateTags, tagNameToGateKey]);

  // Tag id -> gate key (includes ALL users' tags)
  const tagIdToGateKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const tag of gateTags) {
      const key = tagNameToGateKey.get(tag.name);
      if (key) m.set(tag.id, key);
    }
    return m;
  }, [gateTags, tagNameToGateKey]);

  const gateTagIds = useMemo(() => new Set(gateTags.map((t) => t.id)), [gateTags]);
  const streamTagIds = useMemo(() => new Set(streamTags.map((t) => t.id)), [streamTags]);
  const streamTagById = useMemo(() => new Map(streamTags.map((t) => [t.id, t.name])), [streamTags]);

  // ── Fetch group_tags for NPD projects ──
  const { data: allGroupTags = [], isLoading: isGroupTagsLoading } = useQuery({
    queryKey: ["npd-group-tags", user?.id],
    queryFn: async () => {
      // Fetch ALL group_tags — default Supabase limit is 1000 rows which is insufficient
      const all: { group_id: string; tag_id: string }[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("group_tags" as any)
          .select("group_id, tag_id")
          .range(from, from + PAGE - 1) as { data: { group_id: string; tag_id: string }[] | null; error: any };
        if (error) throw error;
        const chunk = data || [];
        all.push(...chunk);
        if (chunk.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },
    enabled: !!user,
  });

  // ── Build NPD projects list ──
  const closedNpdProjects = useMemo(() =>
    allGroups.filter(
      (g) => g.project_type === "npd" && !g.parent_id && !!g.closed_at && (g as any).project_subtype !== "npd_stm",
    ),
    [allGroups]
  );

  const npdProjects = useMemo(() => {
    // STM SKUs live in their own /npd/stm matrix and must not appear on the NPD board.
    const npdGroups = allGroups.filter(
      (g) => g.project_type === "npd" && !g.parent_id && !g.closed_at && (g as any).project_subtype !== "npd_stm",
    );

    return npdGroups.map((g): NpdProject => {
      const groupTagIds = allGroupTags.filter((gt) => gt.group_id === g.id).map((gt) => gt.tag_id);
      const projectGateTags = groupTagIds.filter((id) => gateTagIds.has(id));
      const projectStreamTags = groupTagIds.filter((id) => streamTagIds.has(id));

      // Stats: include child groups
      const childGroups = allGroups.filter((c) => c.parent_id === g.id);
      const childIds = childGroups.map((c) => c.id);
      const allProjectIds = [g.id, ...childIds];
      const projectTasks = allTasks.filter((t) => t.group_id && allProjectIds.includes(t.group_id));
      const total = projectTasks.length;
      const completed = projectTasks.filter((t) => t.is_completed).length;
      const overdue = projectTasks.filter((t) => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))).length;

      // Use ONLY the parent project's own gate tags (not children's) for column placement
      const allGateKeysSet = new Set<string>();
      for (const tagId of projectGateTags) {
        const key = tagIdToGateKey.get(tagId);
        if (key) allGateKeysSet.add(key);
      }
      // Sort by gate order
      const allGateKeys = GATE_ORDER.filter((k) => allGateKeysSet.has(k));

      // Build stream stats for card display
      const streamStats: { name: string; total: number; completed: number }[] = [];
      for (const child of childGroups) {
        const cTags = allGroupTags.filter((gt) => gt.group_id === child.id);
        const sTagId = cTags.find((gt) => streamTagIds.has(gt.tag_id))?.tag_id;
        const sName = sTagId ? streamTagById.get(sTagId) || child.name : child.name;
        const cTasks = allTasks.filter((t) => t.group_id === child.id);
        streamStats.push({ name: sName, total: cTasks.length, completed: cTasks.filter((t) => t.is_completed).length });
      }

      // Other tags (non-gate, non-stream) for filtering
      const otherTagIds = groupTagIds.filter((id) => !gateTagIds.has(id) && !streamTagIds.has(id));

      // Find assignee from group_members
      const assigneeMember = allGroupMembers.find((m) => m.group_id === g.id && m.role === "assignee");
      const assigneeUserId = assigneeMember?.user_id || null;

      // Nearest upcoming deadline among active tasks
      const now = new Date();
      const activeWithDeadline = projectTasks
        .filter((t) => !t.is_completed && t.deadline)
        .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
      const nearestDeadline = activeWithDeadline.length > 0 ? activeWithDeadline[0].deadline! : null;

      return {
        id: g.id,
        name: g.name,
        icon: g.icon,
        color: g.color,
        description: (g as any).description || null,
        parent_id: g.parent_id,
        user_id: g.user_id,
        gateTags: projectGateTags,
        allGateKeys,
        streamTags: projectStreamTags,
        otherTagIds,
        assigneeUserId,
        stats: { total, completed, overdue },
        streamStats,
        nearestDeadline,
      };
    });
  }, [allGroups, allGroupTags, allTasks, gateTagIds, streamTagIds, streamTagById, allGroupMembers]);

  // ── Gate assignment ──
  // Primary gate = most advanced (highest index) from allGateKeys
  const getProjectGate = (project: NpdProject): string | null => {
    if (project.allGateKeys.length > 0) return project.allGateKeys[project.allGateKeys.length - 1];
    for (const tagId of project.gateTags) {
      const key = tagIdToGateKey.get(tagId);
      if (key) return key;
    }
    return null;
  };

  // All active gates for a project (from own + child subproject tags)
  const getProjectGates = (project: NpdProject): string[] => {
    return project.allGateKeys.length > 0 ? project.allGateKeys : [];
  };

  // ── Stream subprojects map: parentId -> stream subprojects ──
  const streamSubprojectsMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; streamName: string | null }[]>();
    for (const g of allGroups) {
      if ((g as any).project_type !== "npd" || !g.parent_id) continue;
      const parentNpd = npdProjects.find((p) => p.id === g.parent_id);
      if (!parentNpd) continue;
      const gTags = allGroupTags.filter((gt) => gt.group_id === g.id);
      const sTagId = gTags.find((gt) => streamTagIds.has(gt.tag_id))?.tag_id;
      const sName = sTagId ? streamTagById.get(sTagId) || null : null;
      if (!m.has(g.parent_id)) m.set(g.parent_id, []);
      m.get(g.parent_id)!.push({ id: g.id, name: g.name, streamName: sName });
    }
    return m;
  }, [allGroups, npdProjects, allGroupTags, streamTagIds, streamTagById]);

  // ── Unique assignees across NPD projects (for filter dropdown) ──
  const npdAssignees = useMemo(() => {
    const ids = new Set<string>();
    for (const p of npdProjects) {
      if (p.assigneeUserId) ids.add(p.assigneeUserId);
    }
    return [...ids].map((id) => {
      const u = availableUsers.find((u) => u.id === id);
      return { id, name: u?.display_name || id.slice(0, 8) };
    });
  }, [npdProjects, availableUsers]);

  // ── Unique non-gate/stream tags across NPD projects (for filter dropdown) ──
  const npdFilterTags = useMemo(() => {
    const ids = new Set<string>();
    for (const p of npdProjects) {
      for (const tid of p.otherTagIds) ids.add(tid);
    }
    return [...ids].map((id) => {
      const t = allTagsRaw.find((t) => t.id === id);
      return { id, name: t?.name || "?", color: t?.color || null };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [npdProjects, allTagsRaw]);

  // ── Filter ──
  const filteredProjects = useMemo(() => {
    let result = npdProjects;
    if (projectFilter) {
      result = result.filter((p) => p.id === projectFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (activeStreams.size > 0) {
      result = result.filter((p) => p.streamTags.some((tid) => {
        const name = streamTagById.get(tid);
        return name && activeStreams.has(name);
      }));
    }
    if (filterAssignee) {
      result = result.filter((p) => p.assigneeUserId === filterAssignee);
    }
    if (filterTagIds.length > 0) {
      result = result.filter((p) => filterTagIds.every((tid) => p.otherTagIds.includes(tid)));
    }
    return result;
  }, [npdProjects, searchQuery, activeStreams, streamTagById, projectFilter, filterAssignee, filterTagIds]);

  // ── Tasks grouped by stream subproject (for swimlane task view) ──
  const streamSubprojectTasks = useMemo(() => {
    if (!projectFilter) return new Map<string, Task[]>();
    const m = new Map<string, Task[]>();
    const subs = streamSubprojectsMap.get(projectFilter) || [];
    for (const sub of subs) {
      const tasks = allTasks.filter((t) => t.group_id === sub.id);
      m.set(sub.id, tasks);
    }
    return m;
  }, [projectFilter, streamSubprojectsMap, allTasks]);

  // ── Fetch per-user card positions ──
  const { data: cardPositions = [] } = useQuery({
    queryKey: ["npd-card-positions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("npd_card_positions" as any)
        .select("gate_key, group_id, position")
        .eq("user_id", user!.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as { gate_key: string; group_id: string; position: number }[];
    },
    enabled: !!user,
  });

  const positionMap = useMemo(() => {
    const m = new Map<string, number>(); // "gateKey:groupId" -> position
    for (const cp of cardPositions) {
      m.set(`${cp.gate_key}:${cp.group_id}`, cp.position);
    }
    return m;
  }, [cardPositions]);

  // ── Columns (project appears in ALL active gates) ──
  const gateColumns = useMemo(() => {
    const grouped: Record<string, { project: NpdProject; isPrimary: boolean }[]> = {};
    for (const gate of NPD_GATES) grouped[gate.key] = [];

    for (const project of filteredProjects) {
      const gates = getProjectGates(project);
      const primaryGate = getProjectGate(project);
      if (gates.length > 0) {
        for (const gateKey of gates) {
          if (grouped[gateKey]) {
            grouped[gateKey].push({ project, isPrimary: gateKey === primaryGate });
          }
        }
      } else {
        const gate = primaryGate;
        if (gate && grouped[gate]) {
          grouped[gate].push({ project, isPrimary: true });
        }
      }
    }

    // Sort by saved positions (items without position go to end)
    for (const gateKey of Object.keys(grouped)) {
      grouped[gateKey].sort((a, b) => {
        const posA = positionMap.get(`${gateKey}:${a.project.id}`) ?? 999999;
        const posB = positionMap.get(`${gateKey}:${b.project.id}`) ?? 999999;
        return posA - posB;
      });
    }

    return grouped;
  }, [filteredProjects, tagIdToGateKey, positionMap]);

  const inboxProjects = useMemo(
    () => isGroupTagsLoading ? [] : filteredProjects.filter((p) => getProjectGate(p) === null && p.allGateKeys.length === 0),
    [filteredProjects, tagIdToGateKey, isGroupTagsLoading]
  );

  const archiveProjects = useMemo(() => {
    // Closed/archived projects
    const closed: NpdProject[] = closedNpdProjects.map((g): NpdProject => {
      const groupTagIds = allGroupTags.filter((gt) => gt.group_id === g.id).map((gt) => gt.tag_id);
      const childGroups = allGroups.filter((sg) => sg.parent_id === g.id);
      const childIds = childGroups.map((sg) => sg.id);
      const relevantTasks = allTasks.filter((t) => t.group_id === g.id || childIds.includes(t.group_id || ""));
      return {
        id: g.id, name: g.name, icon: g.icon, color: g.color, description: g.description,
        parent_id: g.parent_id, user_id: g.user_id,
        gateTags: [], allGateKeys: [], streamTags: [], otherTagIds: [],
        assigneeUserId: null,
        stats: { total: relevantTasks.length, completed: relevantTasks.filter(t => t.is_completed).length, overdue: 0 },
        streamStats: [],
        nearestDeadline: null,
      };
    });
    // Also include gate5 fully-completed active projects
    const fullyDone = filteredProjects.filter((p) => {
      const gate = getProjectGate(p);
      return gate === "gate5" && p.stats.total > 0 && p.stats.completed === p.stats.total;
    });
    const closedIds = new Set(closed.map(c => c.id));
    return [...closed, ...fullyDone.filter(p => !closedIds.has(p.id))];
  }, [filteredProjects, tagIdToGateKey, closedNpdProjects, allGroups, allGroupTags, allTasks]);

  // ── Drag & drop ──
  const allDropKeys = useMemo(() => ["inbox", ...GATE_ORDER], []);

  const moveMutation = useMutation({
    mutationFn: async ({ projectId, targetGateKey }: { projectId: string; targetGateKey: string }) => {
      const targetTagId = gateKeyToTagId.get(targetGateKey);
      if (!targetTagId) throw new Error("Gate tag not found");

      // Remove all existing gate tags from this project
      const project = npdProjects.find((p) => p.id === projectId);
      if (project) {
        for (const oldTagId of project.gateTags) {
          await supabase.from("group_tags" as any).delete().eq("group_id", projectId).eq("tag_id", oldTagId);
        }
      }

      // Add new gate tag
      const { error } = await supabase.from("group_tags" as any).insert({ group_id: projectId, tag_id: targetTagId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });
      queryClient.invalidateQueries({ queryKey: ["all_group_tags"] });
    },
    onError: (err: any) => {
      toast.error("Ошибка перемещения: " + (err?.message || ""));
    },
  });

  const moveToInboxMutation = useMutation({
    mutationFn: async ({ projectId }: { projectId: string }) => {
      const project = npdProjects.find((p) => p.id === projectId);
      if (!project) return;
      for (const oldTagId of project.gateTags) {
        await supabase.from("group_tags" as any).delete().eq("group_id", projectId).eq("tag_id", oldTagId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });
      queryClient.invalidateQueries({ queryKey: ["all_group_tags"] });
    },
  });

  // ── Reorder mutation (per-user card positions) ──
  const reorderMutation = useMutation({
    mutationFn: async ({ gateKey, orderedIds }: { gateKey: string; orderedIds: string[] }) => {
      if (!user) return;
      // Delete old positions for this gate, then insert new
      await supabase.from("npd_card_positions" as any).delete().eq("user_id", user.id).eq("gate_key", gateKey);
      const rows = orderedIds.map((groupId, idx) => ({
        user_id: user.id,
        gate_key: gateKey,
        group_id: groupId,
        position: idx,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from("npd_card_positions" as any).insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["npd-card-positions"] });
    },
  });

  // Find which gate a project is currently displayed in
  const findProjectGateKey = useCallback((projectId: string): string | null => {
    for (const gateKey of GATE_ORDER) {
      if (gateColumns[gateKey]?.some(({ project: p }) => p.id === projectId)) {
        return gateKey;
      }
    }
    if (inboxProjects.some(p => p.id === projectId)) return "inbox";
    return null;
  }, [gateColumns, inboxProjects]);

  const handleNpdDrop = useCallback((activeId: string, dropKey: string) => {
    const project = npdProjects.find((p) => p.id === activeId);
    if (!project) return;

    const sourceGate = findProjectGateKey(activeId);

    // Within same column → reorder
    if (sourceGate === dropKey && dropKey !== "inbox") {
      // Reorder handled by sortable onDragEnd below
      return;
    }

    if (dropKey === "inbox") {
      const currentGate = getProjectGate(project);
      if (!currentGate) return;
      moveToInboxMutation.mutate({ projectId: activeId });
      return;
    }

    const currentGate = getProjectGate(project);
    if (currentGate === dropKey) return;
    moveMutation.mutate({ projectId: activeId, targetGateKey: dropKey });
  }, [npdProjects, getProjectGate, moveToInboxMutation, moveMutation, findProjectGateKey]);

  const {
    overColumn,
    activeId: activeProjectId,
    isDragging: isNpdDragging,
    dndContextProps: baseDndContextProps,
  } = useBoardDnd({
    dropKeys: allDropKeys,
    onDrop: handleNpdDrop,
  });

  // Wrap dndContextProps to also handle sortable reorder
  const dndContextProps = useMemo(() => ({
    ...baseDndContextProps,
    onDragEnd: (event: any) => {
      const { active, over } = event;
      if (!active || !over) {
        baseDndContextProps.onDragEnd(event);
        return;
      }

      const activeId = active.id as string;
      const overId = over.id as string;

      // Check if overId is another project card (not a column droppable)
      const isOverACard = !allDropKeys.includes(overId);
      if (isOverACard) {
        // Find the gate that both cards belong to
        const sourceGate = findProjectGateKey(activeId);
        const targetGate = findProjectGateKey(overId);

        if (sourceGate && sourceGate === targetGate && sourceGate !== "inbox") {
          const column = gateColumns[sourceGate];
          if (column) {
            const oldIndex = column.findIndex(c => c.project.id === activeId);
            const newIndex = column.findIndex(c => c.project.id === overId);
            if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
              const newOrder = arrayMove(column, oldIndex, newIndex);
              reorderMutation.mutate({
                gateKey: sourceGate,
                orderedIds: newOrder.map(c => c.project.id),
              });
            }
          }
        }
      }

      baseDndContextProps.onDragEnd(event);
    },
  }), [baseDndContextProps, allDropKeys, findProjectGateKey, gateColumns, reorderMutation]);

  // ── Toggle gate visibility ──
  const toggleGate = (key: string) => {
    setHiddenGates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleStream = (name: string) => {
    setActiveStreams((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // ── Create NPD project ──
  const handleCreateProject = async (name: string, gateKey: string | null) => {
    if (!name.trim() || !user) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;
      if (!currentUserId) { toast.error("Сессия истекла"); return; }

      // Check duplicate
      const normalized = name.trim().toLowerCase();
      const { data: existing } = await supabase.from("task_groups").select("id, name");
      if ((existing || []).some((g) => g.name.trim().toLowerCase() === normalized)) {
        toast.error(`Проект «${name.trim()}» уже существует`);
        return;
      }

      // Create linked tag
      const { data: tagData, error: tagError } = await supabase
        .from("tags")
        .insert({ name: name.trim(), user_id: currentUserId, color: "#8b5cf6" })
        .select("id")
        .single();
      if (tagError) throw tagError;

      // Create project
      const { data, error } = await supabase
        .from("task_groups")
        .insert({
          name: name.trim(),
          user_id: currentUserId,
          project_type: "npd",
          icon: "🧪",
          color: "#8b5cf6",
          linked_tag_id: tagData.id,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Assign gate tag if specified
      if (gateKey) {
        const gateTagId = gateKeyToTagId.get(gateKey);
        if (gateTagId) {
          await supabase.from("group_tags" as any).insert({ group_id: data.id, tag_id: gateTagId });
        }
      }

      // Auto-create stream subprojects
      const streamSubprojects = NPD_STREAMS.map((streamName, idx) => ({
        name: streamName,
        user_id: currentUserId,
        project_type: "npd" as const,
        icon: "📋",
        color: "#8b5cf6",
        parent_id: data.id,
        position: idx,
      }));

      const { data: createdSubs, error: subError } = await supabase
        .from("task_groups")
        .insert(streamSubprojects)
        .select("id, name");

      if (subError) {
        console.error("Error creating stream subprojects:", subError);
      } else if (createdSubs) {
        // Assign stream tags to each subproject
        const streamTagInserts: { group_id: string; tag_id: string }[] = [];
        for (const sub of createdSubs) {
          // Match by exact name (subprojects are created with streamName as name)
          const streamName = NPD_STREAMS.find((s) => sub.name === s);
          if (streamName) {
            const sTag = streamTags.find((t) => t.name === streamName);
            if (sTag) {
              streamTagInserts.push({ group_id: sub.id, tag_id: sTag.id });
            }
          }
          // Also assign gate tag to subprojects
          if (gateKey) {
            const gateTagId = gateKeyToTagId.get(gateKey);
            if (gateTagId) {
              streamTagInserts.push({ group_id: sub.id, tag_id: gateTagId });
            }
          }
        }
        if (streamTagInserts.length > 0) {
          await supabase.from("group_tags" as any).insert(streamTagInserts);
        }
      }

      await queryClient.refetchQueries({ queryKey: ["task_groups"] });
      await queryClient.refetchQueries({ queryKey: ["npd-group-tags"] });
      queryClient.invalidateQueries({ queryKey: ["all_group_tags"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast.success("NPD-проект создан с подпроектами по стримам");
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    }
  };

  // ── Create task in a stream subproject ──
  const handleCreateTask = async (title: string, groupId: string) => {
    if (!title.trim() || !user) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;
    if (!currentUserId) { toast.error("Сессия истекла"); return; }
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      user_id: currentUserId,
      group_id: groupId,
    });
    if (error) { toast.error("Ошибка: " + error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    toast.success("Задача создана");
  };

  // ── Navigate to project page on card click ──
  const handleCardClick = useCallback((id: string) => {
    navigate(`/pmo/project/${id}?view=matrix`);
  }, [navigate]);

  const visibleGates = NPD_GATES.filter((g) => !hiddenGates.has(g.key));
  const totalProjects = npdProjects.length;
  const activeProject = npdProjects.find((p) => p.id === activeProjectId);

  const isLoading = !npdTagData;

  return (
    <DndContext {...dndContextProps}>
      <div className="flex flex-col h-full">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (<>
          {/* NPD / STM workflow switcher */}
          <div className="px-4 pt-2 shrink-0">
            <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-muted/60 border border-border/40">
              <button
                className="text-xs font-medium px-3 py-1 rounded-md bg-background text-foreground shadow-sm"
                aria-pressed
              >
                NPD проекты
              </button>
              <button
                onClick={() => navigate("/npd/stm")}
                className="text-xs font-medium px-3 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                СТМ Mission Control
              </button>
              <button
                onClick={() => navigate("/npd/km")}
                className="text-xs font-medium px-3 py-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                KM Brand Control
              </button>
            </div>
          </div>

          {/* Unified compact bar */}
          <div className="px-4 py-2 border-b border-border bg-card/50 shrink-0">
            <div className="flex items-center gap-3">
              {/* Project filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn(
                    "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                    projectFilter
                      ? "border-primary/50 bg-primary/10 text-primary font-semibold"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}>
                    <Folder className="h-3 w-3" />
                    {projectFilter
                      ? (npdProjects.find(p => p.id === projectFilter)?.name || "Проект")
                      : "Все проекты"
                    }
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" side="bottom">
                  <div className="max-h-56 overflow-y-auto space-y-0.5">
                    <button
                      onClick={() => onProjectFilterChange?.(null)}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                        !projectFilter ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      )}
                    >
                      Все проекты
                      {!projectFilter && <Check className="h-3 w-3 ml-auto" />}
                    </button>
                    {npdProjects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/npd/matrix/${p.id}`)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                          projectFilter === p.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        )}
                      >
                        <span className="text-sm leading-none">{p.icon && p.icon !== "list" ? p.icon : "🧪"}</span>
                        <span className="truncate">{p.name}</span>
                        {projectFilter === p.id && <Check className="h-3 w-3 ml-auto shrink-0" />}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {projectFilter && (
                <button
                  onClick={() => onProjectFilterChange?.(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Сбросить
                </button>
              )}

              <div className="h-4 w-px bg-border" />

              {/* Compact gate stats: colored dots with counts */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground font-medium">{totalProjects}</span>
                <div className="h-3 w-px bg-border" />
                {visibleGates.map((gate) => (
                  <Tooltip key={gate.key}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 cursor-default">
                        <div className={cn("h-2 w-2 rounded-full", gate.color)} />
                        <span className="text-[11px] text-muted-foreground font-mono">{gateColumns[gate.key]?.length || 0}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">{gate.title}</TooltipContent>
                  </Tooltip>
                ))}
              </div>

              <div className="h-4 w-px bg-border" />

              {/* Assignee filter */}
              {npdAssignees.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={cn(
                      "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                      filterAssignee
                        ? "border-primary/50 bg-primary/10 text-primary font-semibold"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    )}>
                      <User className="h-3 w-3" />
                      {filterAssignee
                        ? (availableUsers.find(u => u.id === filterAssignee)?.display_name || "Ответственный")
                        : "Ответственный"
                      }
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-52 p-2" side="bottom">
                    <div className="max-h-56 overflow-y-auto space-y-0.5">
                      <button
                        onClick={() => setFilterAssignee(null)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                          !filterAssignee ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        )}
                      >
                        Все
                        {!filterAssignee && <Check className="h-3 w-3 ml-auto" />}
                      </button>
                      {npdAssignees.map(a => (
                        <button
                          key={a.id}
                          onClick={() => setFilterAssignee(filterAssignee === a.id ? null : a.id)}
                          className={cn(
                            "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                            filterAssignee === a.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                          )}
                        >
                          <span className="truncate">{a.name}</span>
                          {filterAssignee === a.id && <Check className="h-3 w-3 ml-auto shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Tag filter */}
              {npdFilterTags.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={cn(
                      "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                      filterTagIds.length > 0
                        ? "border-primary/50 bg-primary/10 text-primary font-semibold"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    )}>
                      <Tag className="h-3 w-3" />
                      {filterTagIds.length > 0
                        ? `Теги (${filterTagIds.length})`
                        : "Теги"
                      }
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-2" side="bottom">
                    <div className="max-h-56 overflow-y-auto space-y-0.5">
                      {filterTagIds.length > 0 && (
                        <button
                          onClick={() => setFilterTagIds([])}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
                        >
                          Сбросить все
                        </button>
                      )}
                      {npdFilterTags.map(t => {
                        const active = filterTagIds.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            onClick={() => setFilterTagIds(prev =>
                              active ? prev.filter(id => id !== t.id) : [...prev, t.id]
                            )}
                            className={cn(
                              "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                              active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                            )}
                          >
                            <div
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: t.color || "hsl(var(--primary))" }}
                            />
                            <span className="truncate">{t.name}</span>
                            {active && <Check className="h-3 w-3 ml-auto shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

               {/* Archive toggle removed — column always visible on the right */}

              {/* Active filter reset */}
              {(filterAssignee || filterTagIds.length > 0) && (
                <button
                  onClick={() => { setFilterAssignee(null); setFilterTagIds([]); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}

              <div className="ml-auto" />

              {/* Import existing project to NPD */}
              <MigrateToNpdDialog
                trigger={
                  <button className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors">
                    <FolderPlus className="h-3 w-3" />
                    Добавить проект
                  </button>
                }
              />
            </div>
          </div>

          {/* Risk Radar */}
          <NpdRiskRadar projects={npdProjects} />

          {/* Board: flat columns or swimlane grid */}
          <div className="flex-1 overflow-auto">
            {swimlaneMode ? (
              <SwimlaneGrid
                visibleGates={visibleGates}
                filteredProjects={filteredProjects}
                getProjectGate={getProjectGate}
                streamTagById={streamTagById}
                activeStreams={activeStreams}
                isOver={overColumn}
                isMoving={moveMutation.isPending}
                onCardClick={handleCardClick}
                onCreate={handleCreateProject}
                gateKeyToTagId={gateKeyToTagId}
                projectFilter={projectFilter || null}
                streamSubprojectsMap={streamSubprojectsMap}
                streamSubprojectTasks={streamSubprojectTasks}
                allTasks={allTasks}
                onCreateTask={handleCreateTask}
                allGroups={allGroups}
              />
            ) : (
              <div className="flex h-full min-w-max gap-0">
                {showInbox && (
                  <InboxColumn
                    projects={inboxProjects}
                    isOver={overColumn === "inbox"}
                    onCardClick={handleCardClick}
                    onCreate={(name) => handleCreateProject(name, null)}
                  />
                )}
                {visibleGates.map((gate) => (
                  <GateColumn
                    key={gate.key}
                    gate={gate}
                    projects={gateColumns[gate.key] || []}
                    isOver={overColumn === gate.key}
                    isMoving={moveMutation.isPending}
                    streamTagById={streamTagById}
                    onCardClick={handleCardClick}
                    onCreate={(name) => handleCreateProject(name, gate.key)}
                    gateKeyToTagId={gateKeyToTagId}
                    allGroupTags={allGroupTags}
                  />
                ))}
                <ArchiveColumn
                  projects={archiveProjects}
                  onCardClick={handleCardClick}
                />
              </div>
            )}
          </div>
        </>)}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeProject && (
          <div className="w-72 md:w-80 opacity-90">
            <ProjectCard
              project={activeProject}
              streamTagById={streamTagById}
              isDragging
            />
          </div>
        )}
      </DragOverlay>

    </DndContext>
  );
}

// ── Swimlane Grid ──
const SWIMLANE_UNASSIGNED = "__unassigned__";

function SwimlaneGrid({
  visibleGates, filteredProjects, getProjectGate, streamTagById,
  activeStreams, isOver, isMoving, onCardClick, onCreate, gateKeyToTagId,
  projectFilter, streamSubprojectsMap, streamSubprojectTasks, allTasks,
  onCreateTask, allGroups,
}: {
  visibleGates: GateStage[];
  filteredProjects: NpdProject[];
  getProjectGate: (p: NpdProject) => string | null;
  streamTagById: Map<string, string>;
  activeStreams: Set<string>;
  isOver: string | null;
  isMoving: boolean;
  onCardClick: (id: string) => void;
  onCreate: (name: string, gateKey: string | null) => void;
  gateKeyToTagId: Map<string, string>;
  projectFilter: string | null;
  streamSubprojectsMap: Map<string, { id: string; name: string; streamName: string | null }[]>;
  streamSubprojectTasks: Map<string, Task[]>;
  allTasks: Task[];
  onCreateTask: (title: string, groupId: string) => Promise<void>;
  allGroups: TaskGroup[];
}) {
  const [collapsedRows, setCollapsedRows] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("npd-collapsed-swimlanes");
      return saved ? new Set(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  useEffect(() => {
    localStorage.setItem("npd-collapsed-swimlanes", JSON.stringify([...collapsedRows]));
  }, [collapsedRows]);

  const toggleRow = (key: string) => {
    setCollapsedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Determine which streams to show
  const streamsToShow = activeStreams.size > 0
    ? NPD_STREAMS.filter((s) => activeStreams.has(s))
    : NPD_STREAMS;

  // Build grid data: stream -> gate -> projects
  const gridData = useMemo(() => {
    const data: Record<string, Record<string, NpdProject[]>> = {};

    // Initialize
    for (const stream of streamsToShow) {
      data[stream] = {};
      for (const gate of visibleGates) data[stream][gate.key] = [];
    }
    data[SWIMLANE_UNASSIGNED] = {};
    for (const gate of visibleGates) data[SWIMLANE_UNASSIGNED][gate.key] = [];

    for (const project of filteredProjects) {
      const gateKey = getProjectGate(project);
      if (!gateKey) continue;

      const projectStreams = project.streamTags
        .map((id) => streamTagById.get(id))
        .filter(Boolean) as string[];

      if (projectStreams.length === 0) {
        if (data[SWIMLANE_UNASSIGNED]?.[gateKey]) {
          data[SWIMLANE_UNASSIGNED][gateKey].push(project);
        }
      } else {
        for (const stream of projectStreams) {
          if (data[stream]?.[gateKey]) {
            data[stream][gateKey].push(project);
          }
        }
      }
    }
    return data;
  }, [filteredProjects, visibleGates, streamsToShow, streamTagById]);

  const colWidth = "min-w-[240px] w-[240px]";

  return (
    <div className="min-w-max">
      {/* Header row */}
      <div className="flex sticky top-0 z-10 bg-card border-b border-border">
        <div className="min-w-[180px] w-[180px] shrink-0 px-3 py-2 border-r border-border">
          <span className="text-xs font-semibold text-muted-foreground">Стрим / Отдел</span>
        </div>
        {visibleGates.map((gate) => (
          <div key={gate.key} className={cn("shrink-0 px-3 py-2 border-r border-border", colWidth)}>
            <div className="flex items-center gap-1.5">
              <div className={cn("h-2 w-2 rounded-full", gate.color)} />
              <span className="text-xs font-semibold text-foreground">{gate.title}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Stream rows */}
      {streamsToShow.map((stream) => {
        const isCollapsed = collapsedRows.has(stream);
        const rowProjects = visibleGates.flatMap((g) => gridData[stream]?.[g.key] || []);
        // If project filter is active, find the stream subproject and its tasks
        const streamSub = projectFilter
          ? (streamSubprojectsMap.get(projectFilter) || []).find((s) => s.streamName === stream)
          : null;
        const streamSubGroup = streamSub ? allGroups.find((g) => g.id === streamSub.id) : null;
        const streamTasks = streamSub ? (streamSubprojectTasks.get(streamSub.id) || []) : [];
        const totalInRow = projectFilter ? streamTasks.length : rowProjects.length;

        return (
          <SwimlaneStreamRow
            key={stream}
            stream={stream}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleRow(stream)}
            totalInRow={totalInRow}
            projectFilter={projectFilter}
            streamSub={streamSub}
            streamSubGroup={streamSubGroup || null}
            streamTasks={streamTasks}
            onCreateTask={onCreateTask}
            visibleGates={visibleGates}
            gridData={gridData}
            colWidth={colWidth}
            isMoving={isMoving}
            streamTagById={streamTagById}
            onCardClick={onCardClick}
          />
        );
      })}

      {/* Unassigned row */}
      {(() => {
        const unassigned = visibleGates.flatMap((g) => gridData[SWIMLANE_UNASSIGNED]?.[g.key] || []);
        if (unassigned.length === 0) return null;
        const isCollapsed = collapsedRows.has(SWIMLANE_UNASSIGNED);
        return (
          <div className="border-b border-border">
            <div className="flex">
              <button
                onClick={() => toggleRow(SWIMLANE_UNASSIGNED)}
                className="min-w-[180px] w-[180px] shrink-0 px-3 py-2 border-r border-border flex items-center gap-2 hover:bg-muted/50 transition-colors"
              >
                {isCollapsed
                  ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                }
                <span className="text-xs font-medium text-muted-foreground italic truncate">Без стрима</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{unassigned.length}</span>
              </button>
              {!isCollapsed && visibleGates.map((gate) => {
                const cellProjects = gridData[SWIMLANE_UNASSIGNED]?.[gate.key] || [];
                return (
                  <div key={gate.key} className={cn("shrink-0 px-2 py-2 border-r border-border", colWidth)}>
                    <div className="flex flex-col gap-1.5">
                      {cellProjects.map((p) => (
                        <DraggableProjectCard
                          key={p.id}
                          project={p}
                          isMoving={isMoving}
                          streamTagById={streamTagById}
                          onCardClick={() => onCardClick(p.id)}
                        />
                      ))}
                      {cellProjects.length === 0 && (
                        <div className="text-center py-3 text-[10px] text-muted-foreground/30">—</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {isCollapsed && (
                <div className="flex-1 flex items-center px-3">
                  <span className="text-[10px] text-muted-foreground">{unassigned.length} проект(ов)</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Swimlane Stream Row (extracted for hooks) ──
function SwimlaneStreamRow({
  stream, isCollapsed, onToggleCollapse, totalInRow,
  projectFilter, streamSub, streamSubGroup, streamTasks, onCreateTask,
  visibleGates, gridData, colWidth, isMoving, streamTagById, onCardClick,
}: {
  stream: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  totalInRow: number;
  projectFilter: string | null;
  streamSub: { id: string; name: string; streamName: string | null } | null;
  streamSubGroup: TaskGroup | null;
  streamTasks: Task[];
  onCreateTask: (title: string, groupId: string) => Promise<void>;
  visibleGates: GateStage[];
  gridData: Record<string, Record<string, NpdProject[]>>;
  colWidth: string;
  isMoving: boolean;
  streamTagById: Map<string, string>;
  onCardClick: (id: string) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <div className="border-b border-border">
      {/* Row header */}
      <div className="flex">
        <div className="min-w-[180px] w-[180px] shrink-0 px-3 py-2 border-r border-border flex items-center gap-1.5">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-2 flex-1 min-w-0 hover:bg-muted/50 rounded-md transition-colors -ml-1 px-1 py-0.5"
          >
            {isCollapsed
              ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
              : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
            }
            <span className="text-xs font-semibold text-foreground truncate">{stream}</span>
            {streamSub && <ListChecks className="h-3 w-3 text-muted-foreground shrink-0" />}
            <span className="text-[10px] text-muted-foreground ml-auto">{totalInRow}</span>
          </button>
          {/* Expand subproject detail button */}
          {streamSubGroup && (
            <button
              onClick={() => setDetailOpen(!detailOpen)}
              className={cn(
                "p-1 rounded transition-colors shrink-0",
                detailOpen ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              title="Карточка подпроекта"
            >
              <Expand className="h-3 w-3" />
            </button>
          )}
        </div>
        {!isCollapsed && projectFilter && streamSub ? (
          /* When project is filtered: show all tasks from this stream subproject */
          <div className="flex-1 px-3 py-2 border-r border-border overflow-hidden">
            <div className="flex flex-col gap-1.5">
              {streamTasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
              {streamTasks.length === 0 && (
                <div className="text-[10px] text-muted-foreground/50 py-1">Нет задач</div>
              )}
              <InlineTaskAdder
                onAdd={(title) => onCreateTask(title, streamSub.id)}
              />
            </div>
          </div>
        ) : !isCollapsed ? visibleGates.map((gate) => {
          const cellProjects = gridData[stream]?.[gate.key] || [];
          return (
            <div key={gate.key} className={cn("shrink-0 px-2 py-2 border-r border-border", colWidth)}>
              <div className="flex flex-col gap-1.5">
                {cellProjects.map((p) => (
                  <DraggableProjectCard
                    key={p.id}
                    project={p}
                    isMoving={isMoving}
                    streamTagById={streamTagById}
                    onCardClick={() => onCardClick(p.id)}
                  />
                ))}
                {cellProjects.length === 0 && (
                  <div className="text-center py-3 text-[10px] text-muted-foreground/30">—</div>
                )}
              </div>
            </div>
          );
        }) : null}
        {isCollapsed && (
          <div className="flex-1 flex items-center px-3">
            <span className="text-[10px] text-muted-foreground">
              {totalInRow > 0 ? `${totalInRow} ${projectFilter ? 'задач' : 'проект(ов)'}` : "пусто"}
            </span>
          </div>
        )}
      </div>
      {/* Subproject detail panel */}
      {detailOpen && streamSubGroup && (
        <div className="px-3 py-2 bg-muted/30 border-t border-border animate-fade-in">
          <ProjectDetailPanel group={streamSubGroup} />
        </div>
      )}
    </div>
  );
}

// ── Gate Column ──
function GateColumn({
  gate, projects, isOver, isMoving, streamTagById, onCardClick, onCreate,
  gateKeyToTagId, allGroupTags,
}: {
  gate: GateStage;
  projects: { project: NpdProject; isPrimary: boolean }[];
  isOver: boolean;
  isMoving: boolean;
  streamTagById: Map<string, string>;
  onCardClick: (id: string) => void;
  onCreate: (name: string) => void;
  gateKeyToTagId: Map<string, string>;
  allGroupTags: { group_id: string; tag_id: string }[];
}) {
  const { data: users = [] } = useAvailableUsers();
  const sortableIds = useMemo(() => projects.map(({ project: p }) => p.id), [projects]);

  return (
    <BoardColumn
      columnKey={gate.key}
      isOver={isOver}
      header={
        <div className="flex items-center gap-2 px-4 py-3">
          <div className={cn("h-2.5 w-2.5 rounded-full", gate.color)} />
          <span className="text-sm font-semibold text-foreground">{gate.short}</span>
          <span className="text-xs text-muted-foreground/60">·</span>
          <span className="text-xs text-muted-foreground truncate">{gate.shortTitle}</span>
          <span className="text-xs text-muted-foreground ml-auto">{projects.length}</span>
          <QuickCreateForm
            users={users}
            singleType="subproject"
            options={[{ type: "subproject", label: "Проект", icon: <FolderPlus className="h-3.5 w-3.5" /> }]}
            compact
            onCreate={async (p) => { onCreate(p.title); }}
          />
        </div>
      }
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {projects.map(({ project: p, isPrimary }) => (
          <SortableProjectCard
            key={p.id}
            project={p}
            isMoving={isMoving}
            streamTagById={streamTagById}
            onCardClick={() => onCardClick(p.id)}
            isSecondary={!isPrimary}
            currentGate={gate}
            gateKeyToTagId={gateKeyToTagId}
            allGroupTags={allGroupTags}
          />
        ))}
      </SortableContext>
      {projects.length === 0 && (
        <div className="text-center py-8 text-xs text-muted-foreground/50">Нет проектов</div>
      )}
    </BoardColumn>
  );
}

// ── Inbox Column ──
function InboxColumn({
  projects, isOver, onCardClick, onCreate,
}: {
  projects: NpdProject[];
  isOver: boolean;
  onCardClick: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const { data: users = [] } = useAvailableUsers();
  const { setNodeRef } = useDroppable({ id: "inbox" });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col h-full min-h-0 shrink-0 border-r border-border transition-all",
        collapsed ? "w-16" : "w-72 md:w-80",
        isOver && "bg-primary/5"
      )}
    >
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border shrink-0">
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex items-center gap-2 flex-1 min-w-0 hover:bg-muted/50 rounded-md transition-colors -ml-1 px-1 py-0.5"
        >
          <Inbox className="h-4 w-4 text-primary shrink-0" />
          {!collapsed && <span className="text-sm font-semibold text-foreground">Входящие</span>}
          <span className={cn("text-xs text-muted-foreground", !collapsed && "ml-auto")}>{projects.length}</span>
        </button>
        {!collapsed && (
          <QuickCreateForm
            users={users}
            singleType="subproject"
            options={[{ type: "subproject", label: "Проект", icon: <FolderPlus className="h-3.5 w-3.5" /> }]}
            compact
            onCreate={async (p) => { onCreate(p.title); }}
          />
        )}
      </div>

      {!collapsed && (
        <ScrollArea className="flex-1 min-h-0 pb-2">
          <div className="flex flex-col gap-2 px-2 w-[calc(theme(width.72)-0px)] md:w-[calc(theme(width.80)-0px)]">
            {projects.map((p) => (
              <DraggableProjectCard key={p.id} project={p} isMoving={false} streamTagById={new Map()} onCardClick={() => onCardClick(p.id)} />
            ))}
            {projects.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground/50">Нет проектов</div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ── Archive Column ──
function ArchiveColumn({ projects, onCardClick }: { projects: NpdProject[]; onCardClick: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div className={cn("flex flex-col h-full min-h-0 shrink-0 border-r border-border last:border-r-0 transition-all", collapsed ? "w-16" : "w-72 md:w-80")}>
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="flex items-center gap-2 px-3 py-3 border-b border-border hover:bg-muted/50 transition-colors"
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        {!collapsed && <span className="text-sm font-semibold text-foreground">Архив</span>}
        <span className={cn("text-xs text-muted-foreground", !collapsed && "ml-auto")}>{projects.length}</span>
      </button>
      {!collapsed && (
        <ScrollArea className="flex-1 min-h-0 py-2">
          <div className="flex flex-col gap-2 px-2 w-[calc(theme(width.72)-0px)] md:w-[calc(theme(width.80)-0px)]">
            {projects.map((p) => (
              <button key={p.id} onClick={() => onCardClick(p.id)} className="w-full text-left rounded-lg border border-border bg-card p-2.5 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2">
                  <ProjectIcon project={p} />
                  <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{p.stats.completed}/{p.stats.total} задач завершено</div>
              </button>
            ))}
            {projects.length === 0 && <div className="text-center py-8 text-xs text-muted-foreground/50">Нет завершённых</div>}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

// ── Sortable project card (for gate columns with reorder) ──
function SortableProjectCard({
  project, isMoving, streamTagById, onCardClick, isSecondary, currentGate,
  gateKeyToTagId, allGroupTags,
}: {
  project: NpdProject;
  isMoving: boolean;
  streamTagById: Map<string, string>;
  onCardClick: () => void;
  isSecondary?: boolean;
  currentGate?: GateStage;
  gateKeyToTagId?: Map<string, string>;
  allGroupTags?: { group_id: string; tag_id: string }[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    disabled: isMoving,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-30")}>
      <ProjectCard
        project={project}
        streamTagById={streamTagById}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
        onCardClick={onCardClick}
        isSecondary={isSecondary}
        currentGate={currentGate}
        gateKeyToTagId={gateKeyToTagId}
        allGroupTags={allGroupTags}
      />
    </div>
  );
}

// ── Draggable project card (for inbox/swimlane without sortable) ──
function DraggableProjectCard({
  project, isMoving, streamTagById, onCardClick, isSecondary, currentGate,
  gateKeyToTagId, allGroupTags,
}: {
  project: NpdProject;
  isMoving: boolean;
  streamTagById: Map<string, string>;
  onCardClick: () => void;
  isSecondary?: boolean;
  currentGate?: GateStage;
  gateKeyToTagId?: Map<string, string>;
  allGroupTags?: { group_id: string; tag_id: string }[];
}) {
  return (
    <DraggableWrapper id={project.id} disabled={isMoving}>
      {({ isDragging, dragHandleProps }) => (
        <ProjectCard
          project={project}
          streamTagById={streamTagById}
          isDragging={isDragging}
          dragHandleProps={dragHandleProps}
          onCardClick={onCardClick}
          isSecondary={isSecondary}
          currentGate={currentGate}
          gateKeyToTagId={gateKeyToTagId}
          allGroupTags={allGroupTags}
        />
      )}
    </DraggableWrapper>
  );
}

// ── Dashboard-style helpers ──
function getTimingStatus(tasks: Task[]): "on-track" | "at-risk" | "overdue" | "completed" {
  const active = tasks.filter(t => !t.is_completed);
  if (active.length === 0 && tasks.length > 0) return "completed";
  if (active.length === 0) return "on-track";
  const now = new Date();
  if (active.some(t => t.deadline && new Date(t.deadline) < now)) return "overdue";
  if (active.some(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline)) return "at-risk";
  return "on-track";
}

const STATUS_BADGE: Record<string, string> = {
  "on-track": "text-emerald-700 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400",
  "at-risk": "text-amber-700 bg-amber-500/10 border-amber-500/20 dark:text-amber-400",
  "overdue": "text-red-700 bg-red-500/10 border-red-500/20 dark:text-red-400",
  "completed": "text-muted-foreground bg-muted border-border",
};
const STATUS_LABEL: Record<string, string> = {
  "on-track": "В графике", "at-risk": "Drift", "overdue": "Просрочено", "completed": "Завершён",
};

// ── Project Card ──
function ProjectCard({
  project, streamTagById, isDragging, dragHandleProps, onCardClick, isSecondary, currentGate,
  gateKeyToTagId, allGroupTags: externalGroupTags,
}: {
  project: NpdProject;
  streamTagById: Map<string, string>;
  isDragging?: boolean;
  dragHandleProps?: ComponentProps<"button">;
  onCardClick?: () => void;
  isSecondary?: boolean;
  currentGate?: GateStage;
  gateKeyToTagId?: Map<string, string>;
  allGroupTags?: { group_id: string; tag_id: string }[];
}) {
  const navigate = useNavigate();
  const [detailOpen, setDetailOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { data: allGroups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: members = [] } = useGroupMembers(project.id);
  const { data: availableUsers = [] } = useAvailableUsers();
  const { addTask } = useTaskMutations();
  const group = allGroups.find(g => g.id === project.id);
  const progress = project.stats.total > 0 ? Math.round((project.stats.completed / project.stats.total) * 100) : 0;
  const streamNames = project.streamTags.map((id) => streamTagById.get(id)).filter(Boolean) as string[];

  // For secondary cards, find the primary gate label
  const primaryGateKey = project.allGateKeys[project.allGateKeys.length - 1];
  const otherGates = project.allGateKeys.filter((k) => k !== currentGate?.key);
  const otherGateLabels = otherGates.map((k) => NPD_GATES.find((g) => g.key === k)?.short).filter(Boolean);

  // Gate-specific task counts for secondary cards
  const gateTaskStats = useMemo(() => {
    if (!isSecondary || !currentGate || !gateKeyToTagId || !externalGroupTags) return null;
    const gateTagId = gateKeyToTagId.get(currentGate.key);
    if (!gateTagId) return null;
    // Find child subprojects that have this gate tag
    const subprojects = allGroups.filter(g => g.parent_id === project.id);
    const subsWithGate = subprojects.filter(sub =>
      externalGroupTags.some(gt => gt.group_id === sub.id && gt.tag_id === gateTagId)
    );
    const subIds = subsWithGate.map(s => s.id);
    const gateTasks = allTasks.filter(t => t.group_id && subIds.includes(t.group_id));
    const active = gateTasks.filter(t => !t.is_completed).length;
    const overdue = gateTasks.filter(t => !t.is_completed && t.deadline && isPast(parseISO(t.deadline))).length;
    return { active, overdue, total: gateTasks.length };
  }, [isSecondary, currentGate, gateKeyToTagId, externalGroupTags, allGroups, allTasks, project.id]);

  const assignee = members.find(m => m.role === "assignee");
  const assigneeName = assignee ? (availableUsers.find(u => u.id === assignee.user_id)?.display_name || assignee.user_id.slice(0, 8)) : null;

  // Dashboard data
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const subprojects = allGroups.filter(g => g.parent_id === project.id);
  const subprojectsWithTasks = useMemo(() => {
    return subprojects.filter(sub => allTasks.some(t => t.group_id === sub.id));
  }, [subprojects, allTasks]);

  // Collect tasks from subprojects too
  const allProjectTasks = useMemo(() => {
    const subIds = subprojects.map(s => s.id);
    return allTasks.filter(t => t.group_id === project.id || (t.group_id && subIds.includes(t.group_id)));
  }, [allTasks, project.id, subprojects]);

  const getAssigneeName = (userId: string | null) => {
    if (!userId) return null;
    return availableUsers.find(u => u.id === userId)?.display_name || userId.slice(0, 8);
  };

  const activeTasks = allProjectTasks.filter(t => !t.is_completed);
  const overdueTasks = activeTasks.filter(t => t.deadline && new Date(t.deadline) < now);
  const upcomingTasks = activeTasks.filter(t => t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow);
  const driftTasks = activeTasks
    .filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline)
    .map(t => ({ task: t, driftDays: Math.round((new Date(t.deadline!).getTime() - new Date(t.original_deadline!).getTime()) / (1000 * 60 * 60 * 24)) }))
    // Защита от битых дат (например, original_deadline = 0002-05-14): отбрасываем дрейф > 5 лет
    .filter(({ driftDays }) => Math.abs(driftDays) <= 1825);

  // Max overdue days (single worst task)
  const maxOverdueDays = overdueTasks.reduce((max, t) => {
    const days = Math.ceil((now.getTime() - new Date(t.deadline!).getTime()) / (1000 * 60 * 60 * 24));
    return days > max ? days : max;
  }, 0);

  // Max drift days (single worst deviation)
  const maxDriftDays = driftTasks.reduce((max, { driftDays }) => Math.abs(driftDays) > Math.abs(max) ? driftDays : max, 0);

  const timingStatus = getTimingStatus(allProjectTasks);

  // Milestones for this project (from cache)
  const { data: projectMilestones = [] } = useQuery<NpdMilestone[]>({
    queryKey: ["npd-milestones-project", project.id],
    queryFn: async () => {
      const allGroupIds = [project.id, ...subprojects.map(s => s.id)];
      const { data, error } = await supabase
        .from("project_milestones")
        .select("id, name, group_id, planned_date, status, color")
        .in("group_id", allGroupIds)
        .order("planned_date", { ascending: true });
      if (error) throw error;
      return data as NpdMilestone[];
    },
  });

  const nextMilestone = projectMilestones.find(m => m.status !== "completed" && new Date(m.planned_date) >= now);
  const overdueMilestones = projectMilestones.filter(m => m.status !== "completed" && new Date(m.planned_date) < now);

  // Nearest deadline formatting
  const nearestDeadlineInfo = useMemo(() => {
    if (!project.nearestDeadline) return null;
    const d = new Date(project.nearestDeadline);
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isOverdue = diffDays < 0;
    const isUrgent = diffDays >= 0 && diffDays <= 7;
    return {
      date: format(d, "d MMM", { locale: ru }),
      diffDays,
      isOverdue,
      isUrgent,
    };
  }, [project.nearestDeadline]);

  // For secondary cards, show a compact ghost version
  if (isSecondary) {
    return (
      <div
        onClick={onCardClick}
        className="rounded-lg border border-dashed border-border/60 bg-card/40 shadow-none transition-all hover:bg-muted/30 cursor-pointer px-3 py-2 opacity-60 hover:opacity-80"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ProjectIcon project={project} />
          <h4 className="flex-1 text-xs font-medium text-muted-foreground">{project.name}</h4>
          {gateTaskStats && gateTaskStats.active > 0 && (
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0",
              gateTaskStats.overdue > 0
                ? "bg-destructive/10 text-destructive border border-destructive/20"
                : "bg-primary/10 text-primary border border-primary/20"
            )}>
              {gateTaskStats.overdue > 0 && <AlertTriangle className="h-2.5 w-2.5 inline mr-0.5 -mt-px" />}
              {gateTaskStats.active} актив.
            </span>
          )}
          {otherGateLabels.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border shrink-0">
              → {otherGateLabels.join(", ")}
            </span>
          )}
        </div>
        {project.stats.total > 0 && (
          <div className="mt-1.5">
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary/40 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Status-based color tokens
  const isCompleted = timingStatus === "completed";
  const isOverdue = timingStatus === "overdue";
  const isAtRisk = timingStatus === "at-risk";

  // Progress bar color by status
  const progressBarColor = isCompleted
    ? "bg-emerald-500"
    : isOverdue
    ? "bg-destructive"
    : isAtRisk
    ? "bg-amber-500"
    : "bg-primary";

  // Border style by status
  const borderStyle = isOverdue
    ? "border-destructive/30"
    : isAtRisk
    ? "border-amber-500/30"
    : "border-border";

  // Left accent bar color (only for non-on-track)
  const accentColor = isCompleted
    ? "bg-emerald-500"
    : isOverdue
    ? "bg-destructive"
    : isAtRisk
    ? "bg-amber-500"
    : null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card shadow-sm transition-all",
        borderStyle,
        isDragging ? "shadow-lg" : "hover:shadow-md",
        detailOpen && "shadow-md",
        isCompleted && "opacity-60"
      )}
    >
      <div className="flex">
        {/* Left accent bar — half height, only for non-on-track */}
        {accentColor && (
          <div className="flex items-center py-2 pl-1.5">
            <div className={cn("w-[3px] rounded-sm self-stretch max-h-[50%]", accentColor)} />
          </div>
        )}

        <div
          onClick={() => setDetailOpen(!detailOpen)}
          className={cn("cursor-pointer flex-1 min-w-0", accentColor ? "px-2 py-2.5" : "px-3 py-2.5")}
        >
          {/* Row 1: Title + controls */}
          <div className="flex items-center gap-2 min-w-0">
            <ProjectIcon project={project} />
            <h4 className={cn(
              "flex-1 text-[13px] font-medium text-foreground leading-tight",
              isCompleted && "line-through"
            )}>
              {isCompleted && "✅ "}{project.name}
            </h4>
            {/* Multi-gate dots */}
            {project.allGateKeys.length > 1 && (
              <div className="flex items-center gap-0.5 shrink-0">
                {project.allGateKeys.map((gk) => {
                  const gate = NPD_GATES.find((g) => g.key === gk);
                  if (!gate) return null;
                  return (
                    <Tooltip key={gk}>
                      <TooltipTrigger asChild>
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          gate.color,
                          gk === currentGate?.key ? "ring-1 ring-foreground/30" : "opacity-40"
                        )} />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">{gate.short} · {gate.shortTitle}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setDetailOpen(!detailOpen); }}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
            >
              {detailOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            {dragHandleProps && (
              <button
                {...dragHandleProps}
                onClick={(e) => e.stopPropagation()}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Row 2: Status subtitle */}
          {!isCompleted && (isOverdue || isAtRisk) && (
            <div className={cn(
              "mt-1 text-[11px] flex items-center gap-1",
              isOverdue ? "text-destructive" : "text-amber-600 dark:text-amber-400"
            )}>
              {isOverdue ? (
                <>
                  <AlertTriangle className="h-3 w-3" />
                  <span>Просрочено · {overdueTasks.length} задач · {maxOverdueDays}д</span>
                </>
              ) : (
                <>
                  <TrendingUp className="h-3 w-3" />
                  <span>Drift +{maxDriftDays}д{nearestDeadlineInfo ? ` · срок ${nearestDeadlineInfo.date}` : ""}</span>
                </>
              )}
            </div>
          )}
          {isCompleted && (
            <div className="mt-1 text-[11px] flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <span>Завершён{project.nearestDeadline ? ` ${format(new Date(project.nearestDeadline), "d MMM", { locale: ru })}` : ""}</span>
            </div>
          )}
          {!isCompleted && !isOverdue && !isAtRisk && nearestDeadlineInfo && (
            <div className="mt-1 text-[11px] flex items-center gap-1 text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              <span>В графике · срок {nearestDeadlineInfo.date}</span>
            </div>
          )}

          {/* Row 3: Progress bar */}
          {project.stats.total > 0 && (
            <div className="mt-2">
              <div className="h-[3px] rounded-sm bg-muted overflow-hidden">
                <div className={cn("h-full rounded-sm transition-all", progressBarColor)} style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Row 4: Assignee + avatars left, stats right */}
          <div className="flex items-center gap-1.5 mt-2 text-[11px]">
            {/* Left side: assignee name + participant avatars */}
            <div className="flex items-center gap-1.5 min-w-0">
              {assigneeName && (
                <span className="text-foreground font-medium whitespace-nowrap">{assigneeName}</span>
              )}
              {(() => {
                const others = members.filter(m => m.role !== "viewer" && m.role !== "assignee");
                const othersShown = others.slice(0, 3);
                const othersRest = others.length - othersShown.length;
                if (othersShown.length === 0) return null;
                return (
                  <div className="flex -space-x-1.5">
                    {othersShown.map((m) => {
                      const u = availableUsers.find(u => u.id === m.user_id);
                      const name = u?.display_name || u?.email?.split("@")[0] || "?";
                      const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                      return (
                        <Tooltip key={m.user_id}>
                          <TooltipTrigger asChild>
                            <div className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-semibold border-2 border-card bg-muted text-muted-foreground">
                              {initials}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">{name}</TooltipContent>
                        </Tooltip>
                      );
                    })}
                    {othersRest > 0 && (
                      <div className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-medium bg-muted text-muted-foreground border-2 border-card">
                        +{othersRest}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="flex-1" />

            {/* Right side: task count + percentage */}
            {project.stats.total > 0 && (
              <span className="text-muted-foreground shrink-0">
                {project.stats.completed}/{project.stats.total} · {progress}%
              </span>
            )}

            {/* Milestone indicators */}
            {overdueMilestones.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md font-medium bg-destructive/10 text-destructive border border-destructive/20 shrink-0">
                    <Diamond className="h-2.5 w-2.5" />
                    {overdueMilestones.length}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Просроч. вехи: {overdueMilestones.map(m => m.name).join(", ")}
                </TooltipContent>
              </Tooltip>
            )}
            {nextMilestone && !overdueMilestones.length && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-md font-medium bg-primary/10 text-primary border border-primary/20 shrink-0">
                    <Diamond className="h-2.5 w-2.5" />
                    {format(new Date(nextMilestone.planned_date), "d MMM", { locale: ru })}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Веха: {nextMilestone.name}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      {/* Expandable dashboard-style detail */}
      <AnimatePresence initial={false}>
      {detailOpen && group && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="border-t border-border overflow-hidden"
        >
          <div className="px-2.5 pb-3 pt-2.5 space-y-3">
          {/* Quick action icons */}
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setSheetOpen(true); }}
              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Карточка проекта"
            >
              <PanelLeft className="h-3.5 w-3.5" />
              <span>Карточка</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/pmo/project/${project.id}?view=gantt`); }}
              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Открыть в Ганте"
            >
              <GanttChart className="h-3.5 w-3.5" />
              <span>Гант</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/pmo/project/${project.id}?view=matrix`); }}
              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Открыть матрицу"
            >
              <Grid3X3 className="h-3.5 w-3.5" />
              <span>Матрица</span>
            </button>
            <NpdAiTasksPopover
              projectName={project.name}
              projectDescription={project.description}
              projectId={project.id}
              gateName={currentGate?.title}
              streams={streamNames.length > 0 ? streamNames : undefined}
              existingTasks={allProjectTasks.map(t => t.title)}
              onApply={(tasks) => {
                const subprojects = allGroups.filter(g => g.parent_id === project.id);
                let created = 0;
                for (const task of tasks) {
                  // Find matching subproject by stream name
                  const sub = subprojects.find(s => s.name.toLowerCase().includes(task.stream_name.toLowerCase()));
                  const groupId = sub?.id || project.id;
                  addTask.mutate({ title: task.title, group_id: groupId, deadline: task.deadline });
                  created++;
                }
                if (created > 0) {
                  toast.success(`Создано ${created} задач`);
                }
              }}
            >
              <button
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md text-primary hover:bg-primary/10 transition-colors"
                title="ИИ-задачи по стримам"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>ИИ</span>
              </button>
            </NpdAiTasksPopover>
          </div>
          {/* Assignee */}
          {assigneeName && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground">Ответственный:</span>
              <span className="text-[11px] text-foreground font-medium truncate">{assigneeName}</span>
            </div>
          )}

          {/* Milestones section */}
          {projectMilestones.length > 0 && (
            <DashboardSection title="Вехи" count={projectMilestones.length}>
              <div className="space-y-1">
                {projectMilestones.map(m => {
                  const mDate = new Date(m.planned_date);
                  const isPastMilestone = mDate < now && m.status !== "completed";
                  const isCompleted = m.status === "completed";
                  return (
                    <div key={m.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-muted/50 transition-colors">
                      <Diamond className={cn(
                        "h-3 w-3 shrink-0",
                        isCompleted ? "text-emerald-500" : isPastMilestone ? "text-destructive" : "text-primary"
                      )} />
                      <span className={cn(
                        "text-[11px] truncate flex-1",
                        isCompleted && "line-through text-muted-foreground",
                        isPastMilestone && "text-destructive"
                      )}>{m.name}</span>
                      <span className={cn(
                        "text-[9px] shrink-0",
                        isPastMilestone ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {format(mDate, "d MMM", { locale: ru })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </DashboardSection>
          )}

          {/* Subprojects first (like dashboard) */}
          {subprojectsWithTasks.length > 0 && (
            <DashboardSection title="Подпроекты" count={subprojectsWithTasks.length}>
              <div className="space-y-1.5">
                {subprojectsWithTasks.map(sub => (
                  <NpdSubprojectCard
                    key={sub.id}
                    subproject={sub}
                    allTasks={allTasks}
                    allGroups={allGroups}
                    availableUsers={availableUsers}
                  />
                ))}
              </div>
            </DashboardSection>
          )}

          {/* Overdue tasks */}
          {overdueTasks.length > 0 && (
            <DashboardSection title="Просроченные" count={overdueTasks.length} variant="destructive">
              <div className="space-y-0.5">
                {overdueTasks.map(t => (
                  <DashboardTaskRow key={t.id} task={t} assigneeName={getAssigneeName(t.assigned_to || t.user_id)} variant="overdue" />
                ))}
              </div>
            </DashboardSection>
          )}

          {/* Upcoming deadlines */}
          {upcomingTasks.length > 0 && (
            <DashboardSection title="Ближайшие дедлайны" count={upcomingTasks.length}>
              <div className="space-y-0.5">
                {upcomingTasks.map(t => (
                  <DashboardTaskRow key={t.id} task={t} assigneeName={getAssigneeName(t.assigned_to || t.user_id)} />
                ))}
              </div>
            </DashboardSection>
          )}

          {/* Drift */}
          {driftTasks.length > 0 && (
            <DashboardSection title="Deadline Drift" count={driftTasks.length} variant="warning">
              <div className="space-y-0.5">
                {driftTasks.map(({ task: t, driftDays }) => (
                  <DashboardTaskRow key={t.id} task={t} drift={driftDays} assigneeName={getAssigneeName(t.assigned_to || t.user_id)} />
                ))}
              </div>
            </DashboardSection>
          )}

          {/* All remaining active tasks (not in overdue/upcoming/drift) */}
          {(() => {
            const categorizedIds = new Set([
              ...overdueTasks.map(t => t.id),
              ...upcomingTasks.map(t => t.id),
              ...driftTasks.map(d => d.task.id),
            ]);
            const otherTasks = activeTasks.filter(t => !categorizedIds.has(t.id));
            if (otherTasks.length === 0) return null;
            return (
              <DashboardSection title="Активные задачи" count={otherTasks.length}>
                <div className="space-y-0.5">
                  {otherTasks.map(t => (
                    <DashboardTaskRow key={t.id} task={t} assigneeName={getAssigneeName(t.assigned_to || t.user_id)} />
                  ))}
                </div>
              </DashboardSection>
            );
          })()}

          {activeTasks.length === 0 && subprojectsWithTasks.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-1.5">Нет задач</p>
          )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Floating project detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} modal={false}>
        <SheetContent side="right" className="w-[92vw] sm:w-[440px] md:w-[500px] max-w-[500px] p-0 overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          {group && <ProjectDetailPanel group={group} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DashboardSection({ title, count, children, variant }: { title: string; count: number; children: React.ReactNode; variant?: "destructive" | "warning" }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn("text-[11px] font-semibold", variant === "destructive" ? "text-red-500" : variant === "warning" ? "text-amber-500" : "text-foreground")}>{title}</span>
        <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{count}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function DashboardTaskRow({ task, drift, assigneeName, variant }: { task: Task; drift?: number; assigneeName?: string | null; variant?: "overdue" }) {
  const isOverdue = variant === "overdue" || (!task.is_completed && task.deadline && isPast(parseISO(task.deadline)));
  return (
    <div className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-muted/50 transition-colors min-w-0">
      <span className={cn(
        "text-[11px] truncate flex-1 min-w-0",
        isOverdue ? "text-red-600 dark:text-red-400" : "text-foreground",
        task.is_completed && "line-through text-muted-foreground"
      )}>{task.title}</span>
      {drift !== undefined && (
        <span className={cn("text-[9px] font-mono font-semibold shrink-0", drift > 0 ? "text-destructive" : "text-emerald-500")}>
          {drift > 0 ? `+${drift}д` : `${drift}д`}
        </span>
      )}
      {task.deadline && (
        <span className="text-[9px] text-muted-foreground shrink-0">
          {format(parseISO(task.deadline), "d MMM", { locale: ru })}
        </span>
      )}
    </div>
  );
}

function NpdSubprojectCard({ subproject, allTasks, allGroups, availableUsers }: {
  subproject: TaskGroup;
  allTasks: Task[];
  allGroups: TaskGroup[];
  availableUsers: { id: string; display_name: string | null }[];
}) {
  const [expanded, setExpanded] = useState(false);

  const tasks = allTasks.filter(t => t.group_id === subproject.id);
  const childGroups = allGroups.filter(g => g.parent_id === subproject.id);
  const childTasks = childGroups.flatMap(cg => allTasks.filter(t => t.group_id === cg.id));
  const allSubTasks = [...tasks, ...childTasks];

  const total = allSubTasks.length;
  const completed = allSubTasks.filter(t => t.is_completed).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const activeTasks = allSubTasks.filter(t => !t.is_completed);
  const overdueTasks = activeTasks.filter(t => t.deadline && new Date(t.deadline) < now);
  const upcomingTasks = activeTasks.filter(t => t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow);
  const driftTasks = activeTasks
    .filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline)
    .map(t => ({ task: t, driftDays: Math.round((new Date(t.deadline!).getTime() - new Date(t.original_deadline!).getTime()) / (1000 * 60 * 60 * 24)) }));

  const timingStatus = (() => {
    if (activeTasks.length === 0 && total > 0) return "completed";
    if (overdueTasks.length > 0) return "overdue";
    if (driftTasks.length > 0) return "at-risk";
    return "on-track";
  })() as "on-track" | "at-risk" | "overdue" | "completed";

  const userName = (userId: string | null) => {
    if (!userId) return "—";
    return availableUsers.find(u => u.id === userId)?.display_name || userId.slice(0, 8);
  };

  if (total === 0) return null;

  return (
    <div className={cn("bg-card rounded-lg border border-dashed border-border overflow-hidden transition-shadow", expanded && "shadow-sm")}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/30 transition-colors min-w-0"
      >
        {(subproject as any).logo_url ? (
          <img
            src={(subproject as any).logo_url}
            alt={subproject.name}
            className="h-5 w-5 rounded object-cover ring-1 ring-border shrink-0"
          />
        ) : (
          <div
            className="h-5 w-5 rounded flex items-center justify-center shrink-0 text-white text-[9px] font-semibold"
            style={{ backgroundColor: subproject.color || "hsl(var(--primary))" }}
          >
            {subproject.icon && subproject.icon !== "list" ? subproject.icon : subproject.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-medium text-[11px] truncate">{subproject.name.includes("/") ? subproject.name.split("/").pop()!.trim() : subproject.name}</span>
            {timingStatus === "overdue" && (
              <span className="inline-flex items-center gap-0.5 text-[8px] px-1 py-0 rounded-md font-medium bg-destructive/10 text-destructive border border-destructive/20 shrink-0 whitespace-nowrap">
                <AlertTriangle className="h-2 w-2" />{overdueTasks.length}
              </span>
            )}
            {timingStatus === "at-risk" && (
              <span className="inline-flex items-center gap-0.5 text-[8px] px-1 py-0 rounded-md font-medium text-amber-600 dark:text-amber-400 border border-dashed border-amber-500/40 shrink-0 whitespace-nowrap">
                <TrendingUp className="h-2 w-2" />
              </span>
            )}
            {timingStatus === "completed" && (
              <span className="text-[8px] px-1 py-0 rounded-md font-medium bg-muted text-muted-foreground border border-border shrink-0">✓</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 max-w-[80px]">
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="text-[9px] text-muted-foreground shrink-0">{completed}/{total}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-[9px] text-muted-foreground">
          {overdueTasks.length > 0 && (
            <span className="text-red-500 font-medium">{overdueTasks.length}!</span>
          )}
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-2 pb-2 pt-1.5 space-y-2 animate-fade-in">
          {childGroups.length > 0 && (
            <DashboardSection title="Подпроекты" count={childGroups.length}>
              <div className="space-y-1.5">
                {childGroups.map(cg => (
                  <NpdSubprojectCard key={cg.id} subproject={cg} allTasks={allTasks} allGroups={allGroups} availableUsers={availableUsers} />
                ))}
              </div>
            </DashboardSection>
          )}

          {overdueTasks.length > 0 && (
            <DashboardSection title="Просроченные" count={overdueTasks.length} variant="destructive">
              <div className="space-y-0.5">
                {overdueTasks.map(t => (
                  <DashboardTaskRow key={t.id} task={t} assigneeName={userName(t.assigned_to || t.user_id)} variant="overdue" />
                ))}
              </div>
            </DashboardSection>
          )}

          {upcomingTasks.length > 0 && (
            <DashboardSection title="Ближайшие дедлайны" count={upcomingTasks.length}>
              <div className="space-y-0.5">
                {upcomingTasks.map(t => (
                  <DashboardTaskRow key={t.id} task={t} assigneeName={userName(t.assigned_to || t.user_id)} />
                ))}
              </div>
            </DashboardSection>
          )}

          {driftTasks.length > 0 && (
            <DashboardSection title="Drift" count={driftTasks.length} variant="warning">
              <div className="space-y-0.5">
                {driftTasks.map(({ task: t, driftDays }) => (
                  <DashboardTaskRow key={t.id} task={t} drift={driftDays} assigneeName={userName(t.assigned_to || t.user_id)} />
                ))}
              </div>
            </DashboardSection>
          )}

          {/* All remaining active tasks */}
          {(() => {
            const categorizedIds = new Set([
              ...overdueTasks.map(t => t.id),
              ...upcomingTasks.map(t => t.id),
              ...driftTasks.map(d => d.task.id),
            ]);
            const otherTasks = activeTasks.filter(t => !categorizedIds.has(t.id));
            if (otherTasks.length === 0) return null;
            return (
              <DashboardSection title="Активные" count={otherTasks.length}>
                <div className="space-y-0.5">
                  {otherTasks.map(t => (
                    <DashboardTaskRow key={t.id} task={t} assigneeName={userName(t.assigned_to || t.user_id)} />
                  ))}
                </div>
              </DashboardSection>
            );
          })()}

          {activeTasks.length === 0 && childGroups.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-1">Все задачи завершены</p>
          )}
        </div>
      )}
    </div>
  );
}


function ProjectIcon({ project }: { project: NpdProject }) {
  const [open, setOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const { updateGroupAppearance } = useTaskMutations();

  const iconContent = (project as any).logo_url ? (
    <img
      src={(project as any).logo_url}
      alt={project.name}
      className="h-7 w-7 rounded-md object-cover ring-1 ring-border shrink-0"
    />
  ) : project.icon && project.icon !== "list" ? (
    <span className="text-sm leading-none">{project.icon}</span>
  ) : (
    <div
      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
      style={{ backgroundColor: (project.color || "#8b5cf6") + "18", color: project.color || "#8b5cf6" }}
    >
      <Folder className="h-3.5 w-3.5" />
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
        >
          {iconContent}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-2 z-[60]"
        side="bottom"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-1 mb-2 flex-wrap">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.label}
              onClick={() => setEmojiTab(i)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] transition-colors",
                emojiTab === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-8 gap-0.5 mb-2">
          {EMOJI_CATEGORIES[emojiTab].emojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                updateGroupAppearance.mutate({ id: project.id, icon: emoji });
                setOpen(false);
              }}
              className={cn(
                "p-1 rounded hover:bg-accent text-sm",
                project.icon === emoji && "bg-accent ring-1 ring-primary"
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            updateGroupAppearance.mutate({ id: project.id, icon: "list" });
            setOpen(false);
          }}
          className="text-xs text-muted-foreground hover:text-foreground block"
        >
          Сбросить иконку
        </button>
      </PopoverContent>
    </Popover>
  );
}

// ── Task Mini Card (for swimlane task view) ──
function TaskMiniCard({ task }: { task: Task }) {
  const isOverdue = !task.is_completed && task.deadline && isPast(parseISO(task.deadline));
  return (
    <div className={cn(
      "rounded-md border px-2 py-1.5 text-xs transition-colors",
      task.is_completed
        ? "border-border/50 bg-muted/30 text-muted-foreground line-through"
        : isOverdue
          ? "border-destructive/30 bg-destructive/5 text-foreground"
          : "border-border bg-card text-foreground hover:bg-muted/40"
    )}>
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className={cn("h-3 w-3 shrink-0", task.is_completed ? "text-success" : "text-muted-foreground/40")} />
        <span className="truncate">{task.title}</span>
        {isOverdue && <AlertTriangle className="h-3 w-3 text-destructive shrink-0 ml-auto" />}
      </div>
    </div>
  );
}

// ── Inline Task Adder (+ button that expands to input) ──
function InlineTaskAdder({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    await onAdd(title);
    setTitle("");
    setSaving(false);
    // Keep open for rapid entry
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  if (!adding) {
    return (
      <button
        onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
      >
        <Plus className="h-3 w-3" /> Задача
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 shrink-0">
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название задачи..."
        className="h-6 text-[11px] w-40 px-2"
        disabled={saving}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") { setAdding(false); setTitle(""); }
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={saving || !title.trim()}
        className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving ? "..." : "OK"}
      </button>
      <button
        onClick={() => { setAdding(false); setTitle(""); }}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}


function ProjectDetailSheet({
  projectId, npdProjects, allGroups, streamTags, streamTagById, gateKeyToTagId, tagIdToGateKey, onClose,
}: {
  projectId: string;
  npdProjects: NpdProject[];
  allGroups: TaskGroup[];
  streamTags: { id: string; name: string }[];
  streamTagById: Map<string, string>;
  gateKeyToTagId: Map<string, string>;
  tagIdToGateKey: Map<string, string>;
  onClose: () => void;
}) {
  const project = npdProjects.find((p) => p.id === projectId);
  const group = allGroups.find((g) => g.id === projectId);
  const queryClient = useQueryClient();

  if (!project || !group) return <div className="p-4 text-muted-foreground text-sm">Проект не найден</div>;

  const currentGateKey = project.gateTags
    .map((id) => tagIdToGateKey.get(id))
    .find(Boolean) || null;

  const assignedStreams = project.streamTags.map((id) => streamTagById.get(id)).filter(Boolean) as string[];

  const toggleStreamTag = async (streamName: string) => {
    const tag = streamTags.find((t) => t.name === streamName);
    if (!tag) return;

    const hasIt = project.streamTags.includes(tag.id);
    if (hasIt) {
      await supabase.from("group_tags" as any).delete().eq("group_id", project.id).eq("tag_id", tag.id);
    } else {
      await supabase.from("group_tags" as any).insert({ group_id: project.id, tag_id: tag.id });
    }
    queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });
    queryClient.invalidateQueries({ queryKey: ["all_group_tags"] });
  };

  const moveToGate = async (gateKey: string) => {
    const targetTagId = gateKeyToTagId.get(gateKey);
    if (!targetTagId) return;

    for (const oldTagId of project.gateTags) {
      await supabase.from("group_tags" as any).delete().eq("group_id", project.id).eq("tag_id", oldTagId);
    }
    await supabase.from("group_tags" as any).insert({ group_id: project.id, tag_id: targetTagId });
    queryClient.invalidateQueries({ queryKey: ["npd-group-tags"] });
    queryClient.invalidateQueries({ queryKey: ["all_group_tags"] });
    toast.success(`Перемещено в ${NPD_GATES.find((g) => g.key === gateKey)?.title}`);
  };

  // Subprojects of this NPD project
  const subprojects = allGroups.filter((g) => g.parent_id === projectId);

  return (
    <div className="p-4 space-y-4">
      {/* Unified ProjectDetailPanel */}
      <ProjectDetailPanel group={group} />

      {/* NPD-specific: Gate selector */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div>
          <h3 className="text-xs font-semibold text-foreground mb-2">Гейт</h3>
          <div className="flex flex-wrap gap-1.5">
            {NPD_GATES.map((gate) => (
              <button
                key={gate.key}
                onClick={() => moveToGate(gate.key)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                  currentGateKey === gate.key
                    ? cn("border-transparent", gate.bgLight, gate.textColor, "font-semibold")
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}
              >
                {gate.title.split(":")[0]}
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Subprojects list */}
      {subprojects.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-2">
          <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
            <Folder className="h-3 w-3" /> Подпроекты (стримы)
          </h3>
          {subprojects.map((sub) => (
            <SubprojectRow key={sub.id} group={sub} />
          ))}
        </div>
      )}

      {/* Links */}
      <div className="flex gap-2 pt-2">
        <a href={`/npd/matrix/${project.id}`} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          Swimlane Matrix
        </a>
        <a href={`/pmo/project/${project.id}?view=gantt`} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
          Открыть в PMO
        </a>
        <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
          Закрыть
        </button>
      </div>
    </div>
  );
}

// ── Subproject row with expandable ProjectDetailPanel ──
function SubprojectRow({ group }: { group: TaskGroup }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded
          ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        }
        <span className="text-xs font-medium text-foreground truncate">{group.name.includes("/") ? group.name.split("/").pop()!.trim() : group.name}</span>
      </button>
      {expanded && (
        <div className="px-1 pb-2">
          <ProjectDetailPanel group={group} />
        </div>
      )}
    </div>
  );
}

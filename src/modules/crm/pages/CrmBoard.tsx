import { useMemo, useState, useRef, useEffect, useCallback, type ComponentProps } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskMutations, type Task, useTaskGroups, DuplicateNameError } from "@/hooks/useTasks";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import TaskItem from "@/components/TaskItem";
import {
  Loader2,
  User,
  Phone,
  Mail,
  Calendar,
  Inbox,
  CheckCircle2,
  GripVertical,
  Star,
  Check,
  Briefcase,
  ChevronDown,
  FolderOpen,
  Search,
  X,
  Tag,
  Plus,
  Globe,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Download,
  FileDown,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { filterRealProjects } from "@/lib/projectFilters";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import { DndContext, DragOverlay, useDroppable } from "@dnd-kit/core";
import { useBoardDnd } from "@/hooks/useBoardDnd";
import { BoardColumn } from "@/components/board/BoardColumn";
import { DraggableWrapper } from "@/components/board/DraggableWrapper";
import CrmRiskRadar from "@/modules/crm/components/CrmRiskRadar";
import DecisionsSection from "@/components/decisions/DecisionsSection";
import { Lightbulb } from "lucide-react";
import BulkTaskDialog from "@/components/BulkTaskDialog";

type BoardStage = {
  key: string;
  title: string;
  color: string;
  textColor: string;
  bgLight: string;
};

const CRM_STAGES: BoardStage[] = [
  { key: "kp", title: "Отправить КП", color: "bg-blue-500", textColor: "text-blue-600", bgLight: "bg-blue-500/10" },
  { key: "samples", title: "Отправить образцы", color: "bg-cyan-500", textColor: "text-cyan-600", bgLight: "bg-cyan-500/10" },
  { key: "os", title: "Получить ОС", color: "bg-amber-500", textColor: "text-amber-600", bgLight: "bg-amber-500/10" },
  { key: "negotiation", title: "Переговоры", color: "bg-purple-500", textColor: "text-purple-600", bgLight: "bg-purple-500/10" },
  { key: "shipping", title: "Старт отгрузок", color: "bg-emerald-500", textColor: "text-emerald-600", bgLight: "bg-emerald-500/10" },
];

const SALES_STAGES: BoardStage[] = [
  { key: "todo", title: "Надо сделать", color: "bg-slate-500", textColor: "text-slate-600", bgLight: "bg-slate-500/10" },
  { key: "in_progress", title: "В работе", color: "bg-blue-500", textColor: "text-blue-600", bgLight: "bg-blue-500/10" },
  { key: "waiting", title: "Ожидание ответа", color: "bg-amber-500", textColor: "text-amber-600", bgLight: "bg-amber-500/10" },
];

const STAGE_ORDER = ["kp", "samples", "os", "negotiation", "shipping"];
const SALES_TO_CRM_STAGE: Record<string, string> = {
  todo: "kp",
  in_progress: "negotiation",
  waiting: "os",
};
const SALES_DROP_KEYS = Object.keys(SALES_TO_CRM_STAGE);

const SUBTASK_STAGE_MAP: Record<string, string> = {
  "Отправить презентацию и КП": "kp",
  "Отправить образцы": "samples",
  "Получить ОС": "os",
  "Получить обратную связь": "os",
  "Проведены переговоры": "negotiation",
  "Старт отгрузок": "shipping",
};

const CRM_STAGE_TEMPLATE = [
  "Отправить презентацию и КП",
  "Отправить образцы",
  "Получить обратную связь",
  "Проведены переговоры",
  "Старт отгрузок",
];

type CrmClient = {
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  manager_id: string | null;
  territory_tag_id: string | null;
  retail_type_tag_id: string | null;
  rank_tag_id: string | null;
  city: string | null;
};

type CrmTask = {
  id: string;
  title: string;
  created_at: string;
  deadline: string | null;
  is_completed: boolean;
  is_important: boolean;
  assigned_to: string | null;
  client_id: string | null;
  group_id: string | null;
  task_type: string;
  source_protocol_id: string | null;
  task_tags?: { tag_id: string }[];
  subtasks: { id: string; title: string; is_completed: boolean; position: number; deadline: string | null; assigned_to: string | null }[];
  client?: CrmClient | null;
  assignee?: { display_name: string | null; email: string | null } | null;
};

type CrmTag = { id: string; name: string; color: string | null };
type CrmGroup = { id: string; name: string; icon: string | null; color: string | null; linked_tag_id: string | null };
type DoneCrmTask = {
  id: string;
  title: string;
  completed_at: string | null;
  client_id: string | null;
  group_id: string | null;
  client?: { name: string | null } | null;
};

function getTaskStage(subtasks: CrmTask["subtasks"]): string {
  if (!subtasks || subtasks.length === 0) return "kp";
  const sorted = [...subtasks].sort((a, b) => a.position - b.position);
  const mapped = sorted.filter((s) => SUBTASK_STAGE_MAP[s.title]);
  if (mapped.length === 0) return "kp";

  const firstIncomplete = mapped.find((s) => !s.is_completed);
  if (!firstIncomplete) {
    // All CRM steps completed — show in last stage instead of hiding
    return "shipping";
  }
  return SUBTASK_STAGE_MAP[firstIncomplete.title] || "kp";
}

function getSalesStatus(task: CrmTask): "todo" | "in_progress" | "waiting" {
  const stage = getTaskStage(task.subtasks);
  if (stage === "os") return "waiting";
  if (stage === "negotiation" || stage === "shipping") return "in_progress";
  return "todo";
}

export default function CrmBoard({ boardView }: { boardView: "funnel" | "sales" }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { toggleTask, toggleImportant, addTask, addGroup } = useTaskMutations();
  const { data: allProjectGroups = [] } = useTaskGroups();

  const [activeTask, setActiveTask] = useState<CrmTask | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [filterGroupIds, setFilterGroupIds] = useState<string[]>([]);
  const [filterAssigneeIds, setFilterAssigneeIds] = useState<string[]>([]);
  const [filterTerritoryIds, setFilterTerritoryIds] = useState<string[]>([]);
  const [filterRetailTypeIds, setFilterRetailTypeIds] = useState<string[]>([]);
  const [filterRankIds, setFilterRankIds] = useState<string[]>([]);
  const [filterManagerIds, setFilterManagerIds] = useState<string[]>([]);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [decisionsSheetOpen, setDecisionsSheetOpen] = useState(false);

  const { data: selectedTask } = useQuery({
    queryKey: ["crm-task-detail", selectedTaskId],
    queryFn: async () => {
      if (!selectedTaskId) return null;
      const { data, error } = await supabase
        .from("tasks")
        .select("*, subtasks(*), task_tags(tag_id)")
        .eq("id", selectedTaskId)
        .single();
      if (error) throw error;
      return data as Task;
    },
    enabled: !!selectedTaskId,
  });

  const { data: crmGroups = [] } = useQuery({
    queryKey: ["crm-groups-list", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("task_groups")
        .select("id, name, linked_tag_id")
        .or("project_type.eq.crm,name.ilike.%новые клиенты%");
      return data || [];
    },
    enabled: !!user,
  });

  const crmGroupIds = useMemo(() => crmGroups.map((g) => g.id), [crmGroups]);
  const crmLinkedTagIds = useMemo(() => new Set(crmGroups.map((g) => g.linked_tag_id).filter(Boolean) as string[]), [crmGroups]);
  const crmGroupNames = useMemo(() => new Set(crmGroups.map((g) => g.name.trim().toLowerCase())), [crmGroups]);

  const { data: allTags = [] } = useQuery({
    queryKey: ["crm-tags", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("tags").select("id, name, color");
      if (error) throw error;
      return (data || []) as CrmTag[];
    },
    enabled: !!user,
  });

  // CRM dimension tags — fetch tag categories for territory, retail type, rank
  const { data: crmDimensionTags } = useQuery({
    queryKey: ["crm-dimension-tags", user?.id],
    queryFn: async () => {
      if (!user) return { territory: [], retailType: [], rank: [] };
      // Find CRM root categories for ALL users (tags are globally visible)
      const { data: crmRoots } = await supabase
        .from("tag_categories")
        .select("id")
        .is("parent_id", null)
        .eq("name", "CRM / Продажи");
      const rootIds = (crmRoots || []).map(r => r.id);
      if (rootIds.length === 0) return { territory: [], retailType: [], rank: [] };

      // Find subcategories
      const { data: subCats } = await supabase
        .from("tag_categories")
        .select("id, name")
        .in("parent_id", rootIds);
      
      const getCatIds = (name: string) => (subCats || []).filter(c => c.name === name).map(c => c.id);
      const territoryCatIds = getCatIds("Территории");
      const retailTypeCatIds = getCatIds("Тип ретейла");
      const rankCatIds = getCatIds("Ранг");

      const fetchTags = async (catIds: string[]) => {
        if (catIds.length === 0) return [];
        const { data } = await supabase.from("tags").select("id, name, color").in("category_id", catIds);
        // Deduplicate by name
        const seen = new Map<string, CrmTag>();
        (data || []).forEach(t => { if (!seen.has(t.name.toLowerCase())) seen.set(t.name.toLowerCase(), t as CrmTag); });
        return [...seen.values()];
      };

      const [territory, retailType, rank] = await Promise.all([
        fetchTags(territoryCatIds),
        fetchTags(retailTypeCatIds),
        fetchTags(rankCatIds),
      ]);

      return { territory, retailType, rank };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
  });

  const territoryTags = crmDimensionTags?.territory || [];
  const retailTypeTags = crmDimensionTags?.retailType || [];
  const rankTags = crmDimensionTags?.rank || [];

  const INBOX_TAG_NAMES = useMemo(() => new Set(["crm", "оп", "продажи"]), []);

  // Find tag IDs for inbox tags (crm, оп, продажи)
  const inboxTagIds = useMemo(() => {
    return allTags
      .filter((t) => INBOX_TAG_NAMES.has(t.name.trim().toLowerCase()))
      .map((t) => t.id);
  }, [allTags]);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["crm-tasks", user?.id, crmGroupIds, inboxTagIds],
    queryFn: async () => {
      if (!user) return [];

      // Query 1: tasks from CRM groups or with task_type=crm
      const orParts = [
        ...crmGroupIds.map((id) => `group_id.eq.${id}`),
        "task_type.eq.crm",
      ];
      const orFilters = orParts.join(",");

      const { data: crmTasks, error } = await supabase
        .from("tasks")
        .select("id, title, created_at, deadline, is_completed, is_important, assigned_to, client_id, group_id, task_type, source_protocol_id, protocol_scope, task_tags(tag_id)")
        .or(orFilters)
        .eq("is_completed", false)
        .neq("protocol_scope", "internal")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Query 2: tasks that have inbox tags (crm, оп, продажи) — these may be in regular projects
      let taggedTasks: typeof crmTasks = [];
      if (inboxTagIds.length > 0) {
        const { data: taskTagRows } = await supabase
          .from("task_tags")
          .select("task_id")
          .in("tag_id", inboxTagIds);

        const taggedTaskIds = [...new Set((taskTagRows || []).map((r) => r.task_id))];
        const alreadyLoadedIds = new Set((crmTasks || []).map((t) => t.id));
        const missingIds = taggedTaskIds.filter((id) => !alreadyLoadedIds.has(id));

        if (missingIds.length > 0) {
          const { data: extraTasks } = await supabase
            .from("tasks")
            .select("id, title, created_at, deadline, is_completed, is_important, assigned_to, client_id, group_id, task_type, source_protocol_id, protocol_scope, task_tags(tag_id)")
            .in("id", missingIds)
            .eq("is_completed", false)
            .neq("protocol_scope", "internal");
          taggedTasks = extraTasks || [];
        }
      }

      const allCrmTasks = [...(crmTasks || []), ...taggedTasks];
      if (allCrmTasks.length === 0) return [];

      const taskIds = allCrmTasks.map((t) => t.id);
      const { data: subtasks } = await supabase
        .from("subtasks")
        .select("id, title, is_completed, position, task_id, deadline, assigned_to")
        .in("task_id", taskIds)
        .order("position");

      const clientIds = allCrmTasks.map((t) => t.client_id).filter(Boolean) as string[];
      const { data: clients } = clientIds.length > 0
        ? await supabase.from("clients").select("id, name, contact_name, phone, email, manager_id, territory_tag_id, retail_type_tag_id, rank_tag_id, city").in("id", clientIds)
        : { data: [] };

      const assigneeIds = allCrmTasks.map((t) => t.assigned_to).filter(Boolean) as string[];
      const { data: profiles } = assigneeIds.length > 0
        ? await supabase.from("profiles").select("id, display_name, email").in("id", assigneeIds)
        : { data: [] };

      return allCrmTasks.map((t) => ({
        ...t,
        subtasks: (subtasks || []).filter((s) => s.task_id === t.id),
        client: (clients || []).find((c) => c.id === t.client_id) || null,
        assignee: (profiles || []).find((p) => p.id === t.assigned_to) || null,
      })) as CrmTask[];
    },
    enabled: !!user,
  });

  const { data: doneTasks = [] } = useQuery({
    queryKey: ["crm-tasks-done", user?.id, crmGroupIds],
    queryFn: async () => {
      if (!user) return [];
      const orParts = [
        ...crmGroupIds.map((id) => `group_id.eq.${id}`),
        "task_type.eq.crm",
      ];
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, completed_at, client_id, group_id")
        .or(orParts.join(","))
        .eq("is_completed", true)
        .order("completed_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      const doneRows = (data || []) as DoneCrmTask[];
      const clientIds = doneRows.map((t) => t.client_id).filter(Boolean) as string[];
      const { data: clients } = clientIds.length > 0
        ? await supabase.from("clients").select("id, name").in("id", clientIds)
        : { data: [] };

      return doneRows.map((row) => ({
        ...row,
        client: (clients || []).find((c) => c.id === row.client_id) || null,
      }));
    },
    enabled: !!user,
  });


  const { data: allGroups = [] } = useQuery({
    queryKey: ["crm-groups", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("task_groups").select("id, name, icon, color, linked_tag_id");
      if (error) throw error;
      return (data || []) as CrmGroup[];
    },
    enabled: !!user,
  });

  const tagById = useMemo(() => new Map(allTags.map((t) => [t.id, t])), [allTags]);
  const groupById = useMemo(() => new Map(allGroups.map((g) => [g.id, g])), [allGroups]);

  const moveMutation = useMutation({
    mutationFn: async ({ task, targetStage }: { task: CrmTask; targetStage: string }) => {
      const targetIdx = STAGE_ORDER.indexOf(targetStage);
      if (targetIdx === -1) return;

      const sorted = [...task.subtasks].sort((a, b) => a.position - b.position);
      const mappedSubtasks = sorted.filter((sub) => SUBTASK_STAGE_MAP[sub.title]);

      // If task has no CRM steps, create them automatically and place to target stage.
      if (mappedSubtasks.length === 0) {
        const inserts = CRM_STAGE_TEMPLATE.map((title, index) => ({
          task_id: task.id,
          title,
          position: index,
          is_completed: index < targetIdx,
        }));

        const { error } = await supabase.from("subtasks").insert(inserts);
        if (error) throw error;
        return;
      }

      // Check which template steps are missing and need to be created
      const existingStages = new Set(
        mappedSubtasks.map((sub) => SUBTASK_STAGE_MAP[sub.title])
      );
      const missingInserts = CRM_STAGE_TEMPLATE
        .map((title, index) => ({ title, index, stage: SUBTASK_STAGE_MAP[title] }))
        .filter((item) => item.stage && !existingStages.has(item.stage))
        .map((item) => ({
          task_id: task.id,
          title: item.title,
          position: sorted.length + item.index,
          is_completed: STAGE_ORDER.indexOf(item.stage) < targetIdx,
        }));

      if (missingInserts.length > 0) {
        const { error } = await supabase.from("subtasks").insert(missingInserts);
        if (error) throw error;
      }

      const updates = mappedSubtasks
        .map((sub) => {
          const subStage = SUBTASK_STAGE_MAP[sub.title];
          const subIdx = STAGE_ORDER.indexOf(subStage);
          const shouldBeCompleted = subIdx < targetIdx;
          return { id: sub.id, shouldBeCompleted, current: sub.is_completed };
        })
        .filter((u) => u.current !== u.shouldBeCompleted);

      if (updates.length === 0) return;

      const results = await Promise.all(
        updates.map((u) =>
          supabase.from("subtasks").update({ is_completed: u.shouldBeCompleted }).eq("id", u.id)
        )
      );

      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["crm-tasks-done"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: any) => {
      console.error("CRM move error:", err);
      toast.error("Ошибка перемещения: " + (err?.message || "Неизвестная ошибка"));
    },
  });

  const moveToInboxMutation = useMutation({
    mutationFn: async ({ task }: { task: CrmTask }) => {
      // Delete CRM stage subtasks to revert task to inbox
      const crmSubtaskIds = task.subtasks
        .filter((s) => SUBTASK_STAGE_MAP[s.title])
        .map((s) => s.id);
      if (crmSubtaskIds.length === 0) return;
      const { error } = await supabase.from("subtasks").delete().in("id", crmSubtaskIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: any) => {
      console.error("CRM inbox move error:", err);
      toast.error("Ошибка перемещения: " + (err?.message || "Неизвестная ошибка"));
    },
  });


  const isInboxTask = (task: CrmTask) => {
    if (!task.task_tags || task.task_tags.length === 0) return false;
    const taskTagNames = task.task_tags
      .map((tt) => tagById.get(tt.tag_id)?.name?.trim().toLowerCase())
      .filter(Boolean) as string[];
    const hasInboxTag = taskTagNames.some((n) => INBOX_TAG_NAMES.has(n));
    if (!hasInboxTag) return false;
    // Once task has CRM stage subtasks, it's no longer inbox
    const crmSubtasks = task.subtasks.filter((s) => SUBTASK_STAGE_MAP[s.title]);
    if (crmSubtasks.length > 0) return false;
    return true;
  };

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) => {
        const name = t.client?.name || t.title;
        return name.toLowerCase().includes(q);
      });
    }
    if (filterTagIds.length > 0) {
      result = result.filter((t) => {
        const taskTagIds = (t.task_tags || []).map((tt) => tt.tag_id);
        return filterTagIds.every((fid) => taskTagIds.includes(fid));
      });
    }
    if (filterGroupIds.length > 0) {
      result = result.filter((t) => t.group_id && filterGroupIds.includes(t.group_id));
    }
    if (filterAssigneeIds.length > 0) {
      result = result.filter((t) => t.assigned_to && filterAssigneeIds.includes(t.assigned_to));
    }
    // CRM dimension filters (match by client fields)
    if (filterTerritoryIds.length > 0) {
      result = result.filter((t) => t.client?.territory_tag_id && filterTerritoryIds.includes(t.client.territory_tag_id));
    }
    if (filterRetailTypeIds.length > 0) {
      result = result.filter((t) => t.client?.retail_type_tag_id && filterRetailTypeIds.includes(t.client.retail_type_tag_id));
    }
    if (filterRankIds.length > 0) {
      result = result.filter((t) => t.client?.rank_tag_id && filterRankIds.includes(t.client.rank_tag_id));
    }
    if (filterManagerIds.length > 0) {
      result = result.filter((t) => t.client?.manager_id && filterManagerIds.includes(t.client.manager_id));
    }
    return result;
  }, [tasks, searchQuery, filterTagIds, filterGroupIds, filterAssigneeIds, filterTerritoryIds, filterRetailTypeIds, filterRankIds, filterManagerIds]);

  const inboxTasks = useMemo(() => filteredTasks.filter((t) => isInboxTask(t)), [filteredTasks, tagById]);
  const nonInboxTasks = useMemo(() => filteredTasks.filter((t) => !isInboxTask(t)), [filteredTasks, tagById]);

  const funnelColumns = useMemo(() => {
    const grouped: Record<string, CrmTask[]> = { kp: [], samples: [], os: [], negotiation: [], shipping: [] };
    for (const task of nonInboxTasks) {
      const stage = getTaskStage(task.subtasks);
      if (grouped[stage]) grouped[stage].push(task);
    }
    return grouped;
  }, [nonInboxTasks]);

  const salesColumns = useMemo(() => {
    const grouped: Record<string, CrmTask[]> = { todo: [], in_progress: [], waiting: [] };
    for (const task of nonInboxTasks) {
      grouped[getSalesStatus(task)].push(task);
    }
    return grouped;
  }, [nonInboxTasks]);

  const visibleStages = boardView === "funnel" ? CRM_STAGES : SALES_STAGES;
  const visibleColumns = boardView === "funnel" ? funnelColumns : salesColumns;
  const activeDropKeys = boardView === "funnel" ? STAGE_ORDER : SALES_DROP_KEYS;
  const allDropKeys = useMemo(() => ["inbox", ...activeDropKeys], [activeDropKeys]);

  const handleCrmDrop = useCallback((activeId: string, dropKey: string) => {
    const task = tasks.find((t) => t.id === activeId);
    setActiveTask(null);
    if (!task) return;

    const taskIsInbox = isInboxTask(task);

    if (dropKey === "inbox") {
      if (taskIsInbox) return;
      const taskTagNames = (task.task_tags || [])
        .map((tt) => tagById.get(tt.tag_id)?.name?.trim().toLowerCase())
        .filter(Boolean) as string[];
      const hasInboxTag = taskTagNames.some((n) => INBOX_TAG_NAMES.has(n));
      if (!hasInboxTag) return;
      moveToInboxMutation.mutate({ task });
      return;
    }

    if (boardView === "funnel") {
      const currentStage = getTaskStage(task.subtasks);
      if (!taskIsInbox && currentStage === dropKey) return;
      moveMutation.mutate({ task, targetStage: dropKey });
      return;
    }

    const currentSalesStatus = getSalesStatus(task);
    if (!taskIsInbox && currentSalesStatus === dropKey) return;

    const targetStage = SALES_TO_CRM_STAGE[dropKey];
    if (!targetStage) return;
    moveMutation.mutate({ task, targetStage });
  }, [tasks, isInboxTask, tagById, INBOX_TAG_NAMES, moveToInboxMutation, boardView, moveMutation]);

  const {
    overColumn,
    activeId: activeDragId,
    dndContextProps,
  } = useBoardDnd({
    dropKeys: allDropKeys,
    onDragStart: (id) => {
      const task = tasks.find((t) => t.id === id);
      setActiveTask(task || null);
    },
    onDrop: handleCrmDrop,
    onDragCancel: () => setActiveTask(null),
  });

  // Unique groups used by CRM tasks
  const usedGroups = useMemo(() => {
    const ids = new Set(tasks.map((t) => t.group_id).filter(Boolean) as string[]);
    return [...ids].map((id) => groupById.get(id)).filter(Boolean) as CrmGroup[];
  }, [tasks, groupById]);

  // Unique tags used by CRM tasks (exclude CRM group linked tags)
  const usedTags = useMemo(() => {
    const ids = new Set(tasks.flatMap((t) => (t.task_tags || []).map((tt) => tt.tag_id)));
    return [...ids]
      .map((id) => tagById.get(id))
      .filter((t): t is CrmTag => !!t && !crmLinkedTagIds.has(t.id) && !crmGroupNames.has(t.name.trim().toLowerCase()))
    ;
  }, [tasks, tagById, crmLinkedTagIds, crmGroupNames]);

  // Unique assignees used by CRM tasks
  const usedAssignees = useMemo(() => {
    const map = new Map<string, { id: string; display_name: string | null; email: string | null }>();
    for (const t of tasks) {
      if (t.assignee && t.assigned_to) map.set(t.assigned_to, { id: t.assigned_to, ...t.assignee });
    }
    return [...map.values()];
  }, [tasks]);

  // Unique managers from clients
  const usedManagers = useMemo(() => {
    const map = new Map<string, { id: string; display_name: string | null; email: string | null }>();
    for (const t of tasks) {
      if (t.client?.manager_id) {
        const profile = usedAssignees.find(a => a.id === t.client!.manager_id);
        if (profile) map.set(t.client.manager_id, profile);
      }
    }
    // Also check profiles from all assignees
    if (map.size === 0) return [];
    return [...map.values()];
  }, [tasks, usedAssignees]);

  const totalActive = tasks.length;
  const totalDone = doneTasks.length;

  const crmRadarStats = useMemo(() => {
    const stageStats = CRM_STAGES.map(s => ({
      stage: s.title,
      count: funnelColumns[s.key]?.length || 0,
    }));
    const now = new Date();
    const overdueCount = tasks.filter(t => t.deadline && new Date(t.deadline) < now && !t.is_completed).length;
    const noDeadlineCount = tasks.filter(t => !t.deadline && !t.is_completed).length;
    const withDates = tasks.filter(t => t.created_at && t.deadline);
    let avgDaysInFunnel: number | null = null;
    if (withDates.length > 0) {
      const totalDays = withDates.reduce((sum, t) => {
        const start = new Date(t.created_at).getTime();
        const end = new Date(t.deadline!).getTime();
        return sum + Math.max(0, Math.round((end - start) / 86400000));
      }, 0);
      avgDaysInFunnel = Math.round(totalDays / withDates.length);
    }
    return { stageStats, overdueCount, noDeadlineCount, avgDaysInFunnel };
  }, [tasks, funnelColumns]);

  const [crmExporting, setCrmExporting] = useState(false);
  const handleCrmExport = async () => {
    setCrmExporting(true);
    try {
      const { exportCrmToExcel, downloadExcel } = await import("@/lib/crmExcel");
      const ids = filteredTasks.map(t => t.id);
      if (ids.length === 0) { toast.error("Нет задач для экспорта"); setCrmExporting(false); return; }
      const blob = await exportCrmToExcel(ids);
      downloadExcel(blob, "CRM_Экспорт.xlsx");
      toast.success("Excel экспортирован");
    } catch (e: any) { toast.error("Ошибка экспорта: " + e.message); }
    finally { setCrmExporting(false); }
  };
  const handleCrmTemplateDownload = async () => {
    const { downloadCrmTemplate } = await import("@/lib/crmExcel");
    downloadCrmTemplate();
  };

  const hasFilters = searchQuery || filterTagIds.length > 0 || filterGroupIds.length > 0 || filterAssigneeIds.length > 0 || filterTerritoryIds.length > 0 || filterRetailTypeIds.length > 0 || filterRankIds.length > 0 || filterManagerIds.length > 0;
  const activeFilterCount = filterTagIds.length + filterGroupIds.length + filterAssigneeIds.length + filterTerritoryIds.length + filterRetailTypeIds.length + filterRankIds.length + filterManagerIds.length;

  const toggleFilterTag = (tagId: string) =>
    setFilterTagIds((prev) => prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]);
  const toggleFilterGroup = (groupId: string) =>
    setFilterGroupIds((prev) => prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]);
  const toggleFilterAssignee = (userId: string) =>
    setFilterAssigneeIds((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
  const toggleFilterTerritory = (tagId: string) =>
    setFilterTerritoryIds((prev) => prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]);
  const toggleFilterRetailType = (tagId: string) =>
    setFilterRetailTypeIds((prev) => prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]);
  const toggleFilterRank = (tagId: string) =>
    setFilterRankIds((prev) => prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]);
  const toggleFilterManager = (userId: string) =>
    setFilterManagerIds((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);

  // CRM projects for the "create task" picker
  const crmProjectOptions = useMemo(() => {
    return allProjectGroups.filter(
      (g) => (g as any).project_type === "crm" || g.name.trim().toLowerCase().includes("новые клиенты")
    );
  }, [allProjectGroups]);

  const handleCreateCrmTask = async (title: string, groupId: string | null, stageKey: string) => {
    if (!title.trim() || !user) return;
    try {
      // Refresh session
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;
      if (!currentUserId) {
        toast.error("Сессия истекла. Пожалуйста, войдите заново.");
        return;
      }

      await addTask.mutateAsync({
        title: title.trim(),
        group_id: groupId,
        task_type: "crm",
        client_name: title.trim(),
      });
      // Also ensure "crm" tag is linked
      let crmTagId: string | null = null;
      const crmTag = allTags.find((t) => t.name.trim().toLowerCase() === "crm");
      if (crmTag) {
        crmTagId = crmTag.id;
      } else {
        const { data: existingCrm } = await supabase
          .from("tags")
          .select("id")
          .eq("user_id", currentUserId)
          .ilike("name", "crm")
          .maybeSingle();
        if (existingCrm) {
          crmTagId = existingCrm.id;
        } else {
          const { data: newTag, error: tagErr } = await supabase
            .from("tags")
            .insert({ name: "crm", user_id: currentUserId, color: "#ef4444" })
            .select("id")
            .single();
          if (tagErr) {
            console.error("Failed to create crm tag:", tagErr);
          } else {
            crmTagId = newTag.id;
          }
        }
      }
      // Find the task that was just created (latest crm task by this user)
      if (crmTagId) {
        const { data: latestTask } = await supabase
          .from("tasks")
          .select("id, task_tags(tag_id)")
          .eq("user_id", currentUserId)
          .eq("task_type", "crm")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (latestTask) {
          const alreadyHasCrm = (latestTask.task_tags || []).some((tt: any) => tt.tag_id === crmTagId);
          if (!alreadyHasCrm) {
            await supabase.from("task_tags").insert({ task_id: latestTask.id, tag_id: crmTagId });
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["crm-tags"] });
      toast.success("Клиент добавлен");
    } catch (e: any) {
      console.error("CRM task creation error:", e);
      toast.error("Ошибка: " + e.message);
    }
  };

  const handleCreateCrmProject = async (name: string): Promise<string | null> => {
    if (!name.trim()) return null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id;
      if (!currentUserId) {
        toast.error("Сессия истекла. Пожалуйста, войдите заново.");
        return null;
      }

      // Check for duplicate names across projects and tags
      const normalized = name.trim().toLowerCase();
      const { data: existingGroups } = await supabase.from("task_groups").select("id, name");
      const dupGroup = (existingGroups || []).find((g) => g.name.trim().toLowerCase() === normalized);
      if (dupGroup) {
        toast.error(`Проект «${dupGroup.name}» уже существует`);
        return null;
      }

      // Create linked tag for the project (like addGroup does)
      const { data: tagData, error: tagError } = await supabase
        .from("tags")
        .insert({ name: name.trim(), user_id: currentUserId, color: "#ef4444" })
        .select()
        .single();
      if (tagError) throw tagError;

      const { data, error } = await supabase.from("task_groups").insert({
        name: name.trim(),
        user_id: currentUserId,
        project_type: "crm",
        icon: "🤝",
        color: "#ef4444",
        linked_tag_id: tagData.id,
      }).select("id").single();
      if (error) throw error;

      // Auto-link "crm" tag to the new project via group_tags
      let crmTagId: string | null = null;
      const crmTag = allTags.find((t) => t.name.trim().toLowerCase() === "crm");
      if (crmTag) {
        crmTagId = crmTag.id;
      } else {
        const { data: existingCrm } = await supabase
          .from("tags")
          .select("id")
          .eq("user_id", currentUserId)
          .ilike("name", "crm")
          .maybeSingle();
        if (existingCrm) {
          crmTagId = existingCrm.id;
        } else {
          const { data: newTag, error: tagErr } = await supabase
            .from("tags")
            .insert({ name: "crm", user_id: currentUserId, color: "#ef4444" })
            .select("id")
            .single();
          if (tagErr) {
            console.error("Failed to create crm tag:", tagErr);
          } else {
            crmTagId = newTag.id;
          }
        }
      }
      if (crmTagId) {
        await supabase.from("group_tags").insert({ group_id: data.id, tag_id: crmTagId });
      }
      queryClient.invalidateQueries({ queryKey: ["task_groups"] });
      queryClient.invalidateQueries({ queryKey: ["crm-groups-list"] });
      queryClient.invalidateQueries({ queryKey: ["crm-groups"] });
      queryClient.invalidateQueries({ queryKey: ["crm-tags"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast.success("CRM-проект создан");
      return data.id;
    } catch (e: any) {
      console.error("CRM project creation error:", e);
      toast.error("Ошибка: " + e.message);
      return null;
    }
  };

  return (
    <DndContext {...dndContextProps}>
      <div className="flex flex-col h-full">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (<>
        {/* Mobile compact header */}
        {isMobile && (
          <div className="px-3 py-2 border-b border-border bg-card/50 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск..."
                  className="h-8 pl-8 pr-8 text-xs"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className={cn(
                  "relative inline-flex items-center justify-center h-8 w-8 rounded-lg border transition-colors shrink-0",
                  activeFilterCount > 0
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Mobile filters sheet */}
        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl">
            <SheetHeader>
              <SheetTitle className="text-sm flex items-center justify-between">
                Фильтры
                {hasFilters && (
                  <button
                    onClick={() => { setSearchQuery(""); setFilterTagIds([]); setFilterGroupIds([]); setFilterAssigneeIds([]); setFilterTerritoryIds([]); setFilterRetailTypeIds([]); setFilterRankIds([]); setFilterManagerIds([]); }}
                    className="text-xs text-muted-foreground hover:text-foreground font-normal"
                  >
                    Сбросить
                  </button>
                )}
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-4 pt-4 overflow-y-auto">
              {/* Stats */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-muted">
                  <span className="text-xs text-muted-foreground">Активных</span>
                  <span className="text-sm font-bold text-foreground">{totalActive}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-muted">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs text-muted-foreground">Завершено</span>
                  <span className="text-sm font-bold text-foreground">{totalDone}</span>
                </div>
              </div>

              {/* Stage counts */}
              <div className="flex items-center gap-2 flex-wrap">
                {visibleStages.map((stage) => (
                  <div key={stage.key} className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs", stage.bgLight)}>
                    <div className={cn("h-2 w-2 rounded-full", stage.color)} />
                    <span className={cn("font-medium", stage.textColor)}>{stage.title}</span>
                    <span className="font-bold text-foreground">{visibleColumns[stage.key]?.length || 0}</span>
                  </div>
                ))}
              </div>

              {/* Filter sections */}
              {usedTags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Тэги</p>
                  <div className="flex flex-wrap gap-1.5">
                    {usedTags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleFilterTag(tag.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors",
                          filterTagIds.includes(tag.id) ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#6366f1' }} />
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {usedGroups.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Проект</p>
                  <div className="flex flex-wrap gap-1.5">
                    {usedGroups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => toggleFilterGroup(g.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors",
                          filterGroupIds.includes(g.id) ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {g.icon ? `${g.icon} ` : ""}{g.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {usedAssignees.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Ответственный</p>
                  <div className="flex flex-wrap gap-1.5">
                    {usedAssignees.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => toggleFilterAssignee(a.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors",
                          filterAssigneeIds.includes(a.id) ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <User className="h-3 w-3" />
                        {a.display_name || a.email || "?"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {territoryTags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Территория</p>
                  <div className="flex flex-wrap gap-1.5">
                    {territoryTags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleFilterTerritory(tag.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors",
                          filterTerritoryIds.includes(tag.id) ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {retailTypeTags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Тип розницы</p>
                  <div className="flex flex-wrap gap-1.5">
                    {retailTypeTags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleFilterRetailType(tag.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors",
                          filterRetailTypeIds.includes(tag.id) ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {rankTags.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Ранг</p>
                  <div className="flex flex-wrap gap-1.5">
                    {rankTags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleFilterRank(tag.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors",
                          filterRankIds.includes(tag.id) ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#6366f1' }} />
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {usedManagers.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Менеджер</p>
                  <div className="flex flex-wrap gap-1.5">
                    {usedManagers.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => toggleFilterManager(m.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-colors",
                          filterManagerIds.includes(m.id) ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <User className="h-3 w-3" />
                        {m.display_name || m.email || "?"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Desktop filter bar */}
        {!isMobile && (
        <div className="px-4 py-2 border-b border-border bg-card/50 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">

            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={boardView === "funnel" ? "Поиск клиента..." : "Поиск задачи/клиента..."}
                className="h-8 pl-8 pr-8 text-xs"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <button className={cn(
                  "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                  filterTagIds.length > 0
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}>
                  <Tag className="h-3 w-3" />
                  Тэги
                  {filterTagIds.length > 0 && <span className="font-bold">{filterTagIds.length}</span>}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" side="bottom">
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {usedTags.length === 0 && <p className="text-xs text-muted-foreground px-2 py-1">Нет тэгов</p>}
                  {usedTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => toggleFilterTag(tag.id)}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                        filterTagIds.includes(tag.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      )}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#6366f1' }} />
                      <span className="truncate">{tag.name}</span>
                      {filterTagIds.includes(tag.id) && <Check className="h-3 w-3 ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button className={cn(
                  "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                  filterGroupIds.length > 0
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}>
                  <FolderOpen className="h-3 w-3" />
                  Проект
                  {filterGroupIds.length > 0 && <span className="font-bold">{filterGroupIds.length}</span>}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" side="bottom">
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {usedGroups.length === 0 && <p className="text-xs text-muted-foreground px-2 py-1">Нет проектов</p>}
                  {usedGroups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => toggleFilterGroup(g.id)}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                        filterGroupIds.includes(g.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      )}
                    >
                      <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{g.icon ? `${g.icon} ` : ""}{g.name}</span>
                      {filterGroupIds.includes(g.id) && <Check className="h-3 w-3 ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <button className={cn(
                  "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                  filterAssigneeIds.length > 0
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}>
                  <User className="h-3 w-3" />
                  Ответственный
                  {filterAssigneeIds.length > 0 && <span className="font-bold">{filterAssigneeIds.length}</span>}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2" side="bottom">
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {usedAssignees.length === 0 && <p className="text-xs text-muted-foreground px-2 py-1">Нет ответственных</p>}
                  {usedAssignees.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => toggleFilterAssignee(a.id)}
                      className={cn(
                        "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                        filterAssigneeIds.includes(a.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                      )}
                    >
                      <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{a.display_name || a.email || "?"}</span>
                      {filterAssigneeIds.includes(a.id) && <Check className="h-3 w-3 ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* CRM dimension filters */}
            <button
              onClick={() => setDecisionsSheetOpen(true)}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
              )}
              title="Решения встреч в CRM"
            >
              <Lightbulb className="h-3 w-3 text-amber-500" />
              Решения
            </button>

            {territoryTags.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn(
                    "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                    filterTerritoryIds.length > 0
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}>
                    <Globe className="h-3 w-3" />
                    Территория
                    {filterTerritoryIds.length > 0 && <span className="font-bold">{filterTerritoryIds.length}</span>}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2" side="bottom">
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {territoryTags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleFilterTerritory(tag.id)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                          filterTerritoryIds.includes(tag.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        )}
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#6366f1' }} />
                        <span className="truncate">{tag.name}</span>
                        {filterTerritoryIds.includes(tag.id) && <Check className="h-3 w-3 ml-auto shrink-0" />}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {retailTypeTags.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn(
                    "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                    filterRetailTypeIds.length > 0
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}>
                    <Briefcase className="h-3 w-3" />
                    Тип розницы
                    {filterRetailTypeIds.length > 0 && <span className="font-bold">{filterRetailTypeIds.length}</span>}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2" side="bottom">
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {retailTypeTags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleFilterRetailType(tag.id)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                          filterRetailTypeIds.includes(tag.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        )}
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#6366f1' }} />
                        <span className="truncate">{tag.name}</span>
                        {filterRetailTypeIds.includes(tag.id) && <Check className="h-3 w-3 ml-auto shrink-0" />}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {rankTags.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn(
                    "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                    filterRankIds.length > 0
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}>
                    <Star className="h-3 w-3" />
                    Ранг
                    {filterRankIds.length > 0 && <span className="font-bold">{filterRankIds.length}</span>}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2" side="bottom">
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {rankTags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleFilterRank(tag.id)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                          filterRankIds.includes(tag.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        )}
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#6366f1' }} />
                        <span className="truncate">{tag.name}</span>
                        {filterRankIds.includes(tag.id) && <Check className="h-3 w-3 ml-auto shrink-0" />}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {usedManagers.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button className={cn(
                    "inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors",
                    filterManagerIds.length > 0
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  )}>
                    <User className="h-3 w-3" />
                    Менеджер
                    {filterManagerIds.length > 0 && <span className="font-bold">{filterManagerIds.length}</span>}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2" side="bottom">
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {usedManagers.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => toggleFilterManager(m.id)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                          filterManagerIds.includes(m.id) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        )}
                      >
                        <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{m.display_name || m.email || "?"}</span>
                        {filterManagerIds.includes(m.id) && <Check className="h-3 w-3 ml-auto shrink-0" />}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {hasFilters && (
              <button
                onClick={() => { setSearchQuery(""); setFilterTagIds([]); setFilterGroupIds([]); setFilterAssigneeIds([]); setFilterTerritoryIds([]); setFilterRetailTypeIds([]); setFilterRankIds([]); setFilterManagerIds([]); }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Сбросить
              </button>
            )}

            <div className="h-4 w-px bg-border" />

            {/* Export / Import */}
            <button
              onClick={handleCrmExport}
              disabled={crmExporting}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              {crmExporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Excel
            </button>
            <button
              onClick={handleCrmTemplateDownload}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <FileDown className="h-3 w-3" />
              Шаблон
            </button>
          </div>
        </div>
        )}

        {/* Desktop stats bar */}
        {!isMobile && (
        <div className="px-4 py-2 border-b border-border bg-card/50 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-muted">
              <span className="text-xs text-muted-foreground">Активных</span>
              <span className="text-sm font-bold text-foreground">{totalActive}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-muted">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Завершено</span>
              <span className="text-sm font-bold text-foreground">{totalDone}</span>
            </div>
            <div className="h-4 w-px bg-border" />
            {visibleStages.map((stage) => (
              <div key={stage.key} className={cn("flex items-center gap-2 px-3 py-1 rounded-lg", stage.bgLight)}>
                <div className={cn("h-2 w-2 rounded-full", stage.color)} />
                <span className={cn("text-xs font-medium", stage.textColor)}>{stage.title}</span>
                <span className="text-sm font-bold text-foreground">{visibleColumns[stage.key]?.length || 0}</span>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* CRM Risk Radar */}
        <CrmRiskRadar
          stageStats={crmRadarStats.stageStats}
          totalActive={totalActive}
          totalDone={totalDone}
          overdueCount={crmRadarStats.overdueCount}
          noDeadlineCount={crmRadarStats.noDeadlineCount}
          avgDaysInFunnel={crmRadarStats.avgDaysInFunnel}
        />

        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full min-w-max gap-0">
            <InboxColumn
              tasks={inboxTasks}
              tagById={tagById}
              groupById={groupById}
              crmLinkedTagIds={crmLinkedTagIds}
              crmGroupNames={crmGroupNames}
              allTags={allTags}
              cardVariant="sales"
              isOver={overColumn === "inbox"}
              usedAssignees={usedAssignees}
              crmProjectOptions={crmProjectOptions}
              allProjectGroups={allProjectGroups}
              onToggleComplete={(task) => toggleTask.mutate({ id: task.id, is_completed: !task.is_completed })}
              onToggleImportant={(task) => toggleImportant.mutate({ id: task.id, is_important: !task.is_important })}
              onCardClick={(taskId) => setSelectedTaskId(taskId)}
              onCreateInboxTask={async (title, assigneeId, deadline, clientTagId, groupId, extraTagIds) => {
                if (!title.trim() || !user) return;
                try {
                  // Refresh session to ensure auth.uid() matches user.id
                  const { data: sessionData } = await supabase.auth.getSession();
                  const currentUserId = sessionData?.session?.user?.id;
                  if (!currentUserId) {
                    toast.error("Сессия истекла. Пожалуйста, войдите заново.");
                    return;
                  }

                  // First create the task
                  const { data: newTask, error: taskErr } = await supabase
                    .from("tasks")
                    .insert({
                      title: title.trim(),
                      user_id: currentUserId,
                      task_type: "crm",
                      assigned_to: assigneeId || null,
                      deadline: deadline || null,
                      group_id: groupId || null,
                    })
                    .select("id")
                    .single();
                   if (taskErr) throw taskErr;

                   // Create task_participants record for assignee so it shows in base view
                   if (assigneeId && newTask?.id) {
                     await supabase.from("task_participants").insert({
                       task_id: newTask.id,
                       user_id: assigneeId,
                       role: "assignee",
                     }).then(({ error }) => {
                       if (error) console.error("Failed to add assignee participant:", error);
                     });
                   }

                  // Find or create "crm" tag
                  let crmTagId: string | null = null;
                  const crmTag = allTags.find((t) => t.name.trim().toLowerCase() === "crm");
                  if (crmTag) {
                    crmTagId = crmTag.id;
                  } else {
                    // Check if user already has a crm tag (might not be in allTags yet)
                    const { data: existingCrm } = await supabase
                      .from("tags")
                      .select("id")
                      .eq("user_id", currentUserId)
                      .ilike("name", "crm")
                      .maybeSingle();
                    if (existingCrm) {
                      crmTagId = existingCrm.id;
                    } else {
                      const { data: newTag, error: tagErr } = await supabase
                        .from("tags")
                        .insert({ name: "crm", user_id: currentUserId, color: "#ef4444" })
                        .select("id")
                        .single();
                      if (tagErr) {
                        console.error("Failed to create crm tag:", tagErr);
                      } else {
                        crmTagId = newTag.id;
                      }
                    }
                  }

                  // Link crm tag (non-blocking)
                  if (crmTagId) {
                    await supabase.from("task_tags").insert({ task_id: newTask.id, tag_id: crmTagId }).then(({ error }) => {
                      if (error) console.error("Failed to link crm tag:", error);
                    });
                  }
                  // Link client tag if selected
                  if (clientTagId) {
                    await supabase.from("task_tags").insert({ task_id: newTask.id, tag_id: clientTagId }).then(({ error }) => {
                      if (error) console.error("Failed to link client tag:", error);
                    });
                  }
                  // Link extra tags
                  if (extraTagIds && extraTagIds.length > 0) {
                    const uniqueExtra = extraTagIds.filter((id) => id !== crmTagId && id !== clientTagId);
                    if (uniqueExtra.length > 0) {
                      await supabase.from("task_tags").insert(
                        uniqueExtra.map((tag_id) => ({ task_id: newTask.id, tag_id }))
                      ).then(({ error }) => {
                        if (error) console.error("Failed to link extra tags:", error);
                      });
                    }
                  }
                   queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
                   queryClient.invalidateQueries({ queryKey: ["crm-tags"] });
                   queryClient.invalidateQueries({ queryKey: ["tasks"] });
                   queryClient.invalidateQueries({ queryKey: ["task_participants"] });
                  toast.success("Задача создана во Входящих");
                } catch (e: any) {
                  console.error("CRM inbox task creation error:", e);
                  toast.error("Ошибка создания задачи: " + e.message);
                }
              }}
              onCreateProject={handleCreateCrmProject}
            />
            {visibleStages.map((stage) => (
              <DroppableColumn
                key={stage.key}
                stage={stage}
                tasks={visibleColumns[stage.key] || []}
                isOver={overColumn === stage.key}
                isMoving={moveMutation.isPending}
                tagById={tagById}
                groupById={groupById}
                crmLinkedTagIds={crmLinkedTagIds}
                crmGroupNames={crmGroupNames}
                crmProjectOptions={crmProjectOptions}
                cardVariant="sales"
                allowCreate={boardView === "funnel"}
                createLabel={boardView === "funnel" ? "Добавить клиента" : "Добавить задачу"}
                createPlaceholder={boardView === "funnel" ? "Имя клиента..." : "Название задачи..."}
                onToggleComplete={(task) => toggleTask.mutate({ id: task.id, is_completed: !task.is_completed })}
                onToggleImportant={(task) => toggleImportant.mutate({ id: task.id, is_important: !task.is_important })}
                onCardClick={(taskId) => setSelectedTaskId(taskId)}
                onCreateTask={handleCreateCrmTask}
                onCreateProject={handleCreateCrmProject}
              />
            ))}
            <DoneColumn
              title={boardView === "funnel" ? "Завершено" : "Готово"}
              tasks={doneTasks}
              groupById={groupById}
              onCardClick={(taskId) => setSelectedTaskId(taskId)}
            />
          </div>
        </div>
        </>)}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask && (
          <div className="w-72 md:w-80 opacity-90">
            <CrmCard
              task={activeTask}
              tags={(activeTask.task_tags || []).map((tt) => tagById.get(tt.tag_id)).filter((t): t is CrmTag => !!t && !crmLinkedTagIds.has(t.id) && !crmGroupNames.has(t.name.trim().toLowerCase()))}
              group={activeTask.group_id ? groupById.get(activeTask.group_id) || null : null}
              variant="sales"
              isDragging
              onToggleComplete={() => {}}
              onToggleImportant={() => {}}
            />
          </div>
        )}
      </DragOverlay>

      <Sheet open={!!selectedTaskId} onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 overflow-y-auto [&_.radix-popover-content]:z-[60]">
          {selectedTask && (
            <div className="p-4">
              <TaskItem task={selectedTask} initialOpen />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </DndContext>
  );
}

function DroppableColumn({
  stage,
  tasks,
  isOver,
  isMoving,
  tagById,
  groupById,
  crmLinkedTagIds,
  crmGroupNames,
  crmProjectOptions,
  cardVariant = "funnel",
  allowCreate = true,
  createLabel = "Добавить клиента",
  createPlaceholder = "Имя клиента...",
  onToggleComplete,
  onToggleImportant,
  onCardClick,
  onCreateTask,
  onCreateProject,
}: {
  stage: BoardStage;
  tasks: CrmTask[];
  isOver: boolean;
  isMoving: boolean;
  tagById: Map<string, CrmTag>;
  groupById: Map<string, CrmGroup>;
  crmLinkedTagIds: Set<string>;
  crmGroupNames: Set<string>;
  crmProjectOptions: { id: string; name: string }[];
  cardVariant?: "funnel" | "sales";
  allowCreate?: boolean;
  createLabel?: string;
  createPlaceholder?: string;
  onToggleComplete: (task: CrmTask) => void;
  onToggleImportant: (task: CrmTask) => void;
  onCardClick: (taskId: string) => void;
  onCreateTask: (title: string, groupId: string | null, stageKey: string) => void;
  onCreateProject: (name: string) => Promise<string | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(
    crmProjectOptions.length > 0 ? crmProjectOptions[0].id : null
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    if (crmProjectOptions.length > 0) {
      const currentExists = crmProjectOptions.some((g) => g.id === selectedGroupId);
      if (!currentExists) {
        setSelectedGroupId(crmProjectOptions[0].id);
      }
    }
  }, [crmProjectOptions, selectedGroupId]);

  const columnHeader = (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className={cn("h-2.5 w-2.5 rounded-full", stage.color)} />
      <span className="text-sm font-semibold text-foreground">{stage.title}</span>
      <span className="text-xs text-muted-foreground ml-auto">{tasks.length}</span>
      {allowCreate && (
        <button
          onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={createLabel}
        >
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <BoardColumn columnKey={stage.key} isOver={isOver} header={columnHeader}>
      {allowCreate && adding && (
        <div className="rounded-lg border border-primary/30 bg-card p-2.5 space-y-2">
          <Input
            ref={inputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={createPlaceholder}
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) {
                onCreateTask(newTitle, selectedGroupId, stage.key);
                setNewTitle("");
                setAdding(false);
              }
              if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
            }}
          />
          <div className="flex items-center gap-1.5">
            <select
              value={selectedGroupId || ""}
              onChange={(e) => setSelectedGroupId(e.target.value || null)}
              className="flex-1 h-6 text-[11px] rounded border border-border bg-background px-1.5"
            >
              {crmProjectOptions.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={() => setCreatingProject(true)}
              className="text-[10px] text-primary hover:underline whitespace-nowrap"
            >
              + Проект
            </button>
          </div>
          {creatingProject && (
            <Input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Название проекта..."
              className="h-7 text-xs"
              onKeyDown={async (e) => {
                if (e.key === "Enter" && newProjectName.trim()) {
                  const newId = await onCreateProject(newProjectName);
                  if (newId) setSelectedGroupId(newId);
                  setNewProjectName("");
                  setCreatingProject(false);
                }
                if (e.key === "Escape") { setCreatingProject(false); setNewProjectName(""); }
              }}
            />
          )}
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                if (newTitle.trim()) {
                  onCreateTask(newTitle, selectedGroupId, stage.key);
                  setNewTitle("");
                  setAdding(false);
                }
              }}
              className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Добавить
            </button>
            <button
              onClick={() => { setAdding(false); setNewTitle(""); setCreatingProject(false); }}
              className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-foreground"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
      {tasks.map((task) => (
        <DraggableCard
          key={task.id}
          task={task}
          isMoving={isMoving}
          variant={cardVariant}
          tags={(task.task_tags || []).map((tt) => tagById.get(tt.tag_id)).filter((t): t is CrmTag => !!t && !crmLinkedTagIds.has(t.id) && !crmGroupNames.has(t.name.trim().toLowerCase()))}
          group={task.group_id ? groupById.get(task.group_id) || null : null}
          onToggleComplete={() => onToggleComplete(task)}
          onToggleImportant={() => onToggleImportant(task)}
          onCardClick={() => onCardClick(task.id)}
        />
      ))}
      {tasks.length === 0 && !adding && (
        <div className="text-center py-8 text-xs text-muted-foreground/50">
          {allowCreate ? "Нет клиентов" : "Нет задач"}
        </div>
      )}
    </BoardColumn>
  );
}

function InboxColumn({
  tasks,
  tagById,
  groupById,
  crmLinkedTagIds,
  crmGroupNames,
  allTags = [],
  cardVariant = "funnel",
  isOver,
  usedAssignees = [],
  crmProjectOptions = [],
  allProjectGroups = [],
  onToggleComplete,
  onToggleImportant,
  onCardClick,
  onCreateInboxTask,
  onCreateProject,
}: {
  tasks: CrmTask[];
  tagById: Map<string, CrmTag>;
  groupById: Map<string, CrmGroup>;
  crmLinkedTagIds: Set<string>;
  crmGroupNames: Set<string>;
  allTags?: CrmTag[];
  cardVariant?: "funnel" | "sales";
  isOver?: boolean;
  usedAssignees?: { id: string; display_name: string | null; email: string | null }[];
  crmProjectOptions?: { id: string; name: string }[];
  allProjectGroups?: { id: string; name: string }[];
  onToggleComplete: (task: CrmTask) => void;
  onToggleImportant: (task: CrmTask) => void;
  onCardClick: (taskId: string) => void;
  onCreateInboxTask?: (title: string, assigneeId: string | null, deadline: string | null, clientTagId: string | null, groupId: string | null, extraTagIds?: string[]) => void;
  onCreateProject?: (name: string) => Promise<string | null>;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { setNodeRef } = useDroppable({ id: "inbox" });
  const [collapsed, setCollapsed] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState<string | null>(null);
  const [newDeadline, setNewDeadline] = useState<Date | undefined>(undefined);
  const [newClientTagId, setNewClientTagId] = useState<string | null>(null);
  const [newGroupId, setNewGroupId] = useState<string | null>(null);
  const [newExtraTagIds, setNewExtraTagIds] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [creatingInboxProject, setCreatingInboxProject] = useState(false);
  const [newInboxProjectName, setNewInboxProjectName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: clientTags = [] } = useQuery({
    queryKey: ["crm-client-tags", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: cats } = await supabase
        .from("tag_categories")
        .select("id")
        .ilike("name", "Клиенты");
      if (!cats || cats.length === 0) return [];
      const { data: tags } = await supabase
        .from("tags")
        .select("id, name, color")
        .in("category_id", cats.map((c) => c.id))
        .order("name");
      return (tags || []) as CrmTag[];
    },
    enabled: !!user && adding,
  });

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clientTags;
    const q = clientSearch.toLowerCase();
    return clientTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [clientTags, clientSearch]);

  const visibleProjects = useMemo(() => {
    // For "Все проекты" режим — отфильтруем служебные NPD-стрим-подпроекты,
    // протоколы и архив, чтобы попап не захламлялся (см. lib/projectFilters).
    const list = showAllProjects
      ? filterRealProjects(allProjectGroups as any[]) as typeof allProjectGroups
      : crmProjectOptions;
    if (!projectSearch.trim()) return list;
    const q = projectSearch.toLowerCase();
    return list.filter((g) => g.name.toLowerCase().includes(q));
  }, [showAllProjects, allProjectGroups, crmProjectOptions, projectSearch]);

  const filteredTagsForPicker = useMemo(() => {
    const excluded = new Set([...newExtraTagIds, newClientTagId].filter(Boolean) as string[]);
    let list = allTags.filter((t) => !excluded.has(t.id));
    if (tagSearch.trim()) {
      const q = tagSearch.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    return list;
  }, [allTags, newExtraTagIds, newClientTagId, tagSearch]);

  const resetForm = () => {
    setNewTitle(""); setNewAssignee(null); setNewDeadline(undefined);
    setNewClientTagId(null); setNewGroupId(null); setNewExtraTagIds([]);
    setClientSearch(""); setProjectSearch(""); setTagSearch(""); setShowAllProjects(false);
    setCreatingInboxProject(false); setNewInboxProjectName("");
    setAdding(false);
  };

  const handleSubmit = () => {
    if (!newTitle.trim() || !onCreateInboxTask) return;
    onCreateInboxTask(newTitle, newAssignee, newDeadline ? newDeadline.toISOString() : null, newClientTagId, newGroupId, newExtraTagIds);
    resetForm();
  };

  const handleCreateClient = async (name: string) => {
    if (!name.trim() || !user) return;
    try {
      const { data: cats } = await supabase
        .from("tag_categories").select("id").eq("name", "Клиенты").eq("user_id", user.id).limit(1);
      let catId: string | null = cats?.[0]?.id || null;
      if (!catId) {
        const { data: parentCats } = await supabase
          .from("tag_categories").select("id").eq("name", "CRM / Продажи").eq("user_id", user.id).limit(1);
        const { data: newCat } = await supabase
          .from("tag_categories")
          .insert({ name: "Клиенты", user_id: user.id, color: "#ef4444", parent_id: parentCats?.[0]?.id || null, position: 0 })
          .select("id").single();
        catId = newCat?.id || null;
      }
      const { data: newTag, error } = await supabase
        .from("tags").insert({ name: name.trim(), user_id: user.id, color: "#ef4444", category_id: catId })
        .select("id").single();
      if (error) throw error;
      setNewClientTagId(newTag.id);
      setClientSearch("");
      queryClient.invalidateQueries({ queryKey: ["crm-client-tags"] });
      queryClient.invalidateQueries({ queryKey: ["crm-tags"] });
      toast.success(`Клиент «${name.trim()}» создан`);
    } catch (e: any) { toast.error(e.message); }
  };

  const selectedClientName = newClientTagId ? (clientTags.find((t) => t.id === newClientTagId)?.name || "Выбран") : null;
  const selectedGroupName = newGroupId
    ? (crmProjectOptions.find((g) => g.id === newGroupId)?.name || allProjectGroups.find((g) => g.id === newGroupId)?.name || "Выбран")
    : null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col h-full min-h-0 shrink-0 border-r border-border transition-all",
        collapsed ? "w-16" : "w-72 md:w-80",
        isOver && "bg-primary/5"
      )}
    >
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex items-center gap-2 flex-1 min-w-0 hover:bg-muted/50 rounded-md transition-colors -ml-1 px-1 py-0.5"
          title={collapsed ? "Развернуть: Входящие" : "Свернуть: Входящие"}
        >
          <Inbox className="h-4 w-4 text-primary shrink-0" />
          {!collapsed && <span className="text-sm font-semibold text-foreground">Входящие</span>}
          <span className={cn("text-xs text-muted-foreground", !collapsed && "ml-auto")}>{tasks.length}</span>
        </button>
        {!collapsed && onCreateInboxTask && (
          <div className="flex items-center gap-0.5 shrink-0">
            <BulkTaskDialog>
              <button
                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Пакетное создание задач"
              >
                <span className="relative inline-flex h-4 w-4 items-center justify-center">
                  <Layers className="h-3.5 w-3.5" />
                  <Sparkles className="h-2 w-2 absolute -top-0.5 -right-0.5 text-primary" />
                </span>
              </button>
            </BulkTaskDialog>
            <button
              onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Добавить задачу"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <ScrollArea className="flex-1 min-h-0 py-2">
          <div className="flex flex-col gap-2 px-2 w-[calc(theme(width.72)-0px)] md:w-[calc(theme(width.80)-0px)]">
            {adding && (
              <div className="rounded-lg border border-primary/30 bg-card p-2.5 space-y-2">
                <Input
                  ref={inputRef}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Название задачи..."
                  className="h-7 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTitle.trim()) handleSubmit();
                    if (e.key === "Escape") resetForm();
                  }}
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Client picker */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border transition-colors max-w-[130px]",
                        newClientTagId ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"
                      )}>
                        <Briefcase className="h-3 w-3 shrink-0" />
                        <span className="truncate">{selectedClientName || "Клиент"}</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-2" side="bottom" align="start">
                      <Input
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        placeholder="Поиск или создать..."
                        className="h-7 text-xs mb-2"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && clientSearch.trim() && filteredClients.length === 0) {
                            handleCreateClient(clientSearch);
                          }
                        }}
                      />
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {newClientTagId && (
                          <button onClick={() => setNewClientTagId(null)}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted">
                            <X className="h-3 w-3" /> Убрать
                          </button>
                        )}
                        {filteredClients.map((tag) => (
                          <button key={tag.id}
                            onClick={() => { setNewClientTagId(tag.id); setClientSearch(""); }}
                            className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                              newClientTagId === tag.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                            )}>
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || "#ef4444" }} />
                            <span className="truncate">{tag.name}</span>
                            {newClientTagId === tag.id && <Check className="h-3 w-3 ml-auto shrink-0" />}
                          </button>
                        ))}
                        {filteredClients.length === 0 && clientSearch.trim() && (
                          <button onClick={() => handleCreateClient(clientSearch)}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-primary hover:bg-primary/10">
                            <Plus className="h-3 w-3" />
                            <span>Создать «{clientSearch.trim()}»</span>
                          </button>
                        )}
                        {clientTags.length === 0 && !clientSearch.trim() && (
                          <p className="text-xs text-muted-foreground px-2 py-1">Нет клиентов. Введите имя для создания.</p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Project picker */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border transition-colors max-w-[130px]",
                        newGroupId ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"
                      )}>
                        <FolderOpen className="h-3 w-3 shrink-0" />
                        <span className="truncate">{selectedGroupName || "Проект"}</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-2" side="bottom" align="start">
                      <Input
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Поиск проекта..."
                        className="h-7 text-xs mb-2"
                      />
                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                        {newGroupId && (
                          <button onClick={() => setNewGroupId(null)}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted">
                            <X className="h-3 w-3" /> Убрать
                          </button>
                        )}
                        {!showAllProjects && (<>
                          {visibleProjects.map((g) => (
                            <button key={g.id}
                              onClick={() => { setNewGroupId(g.id); setProjectSearch(""); }}
                              className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                                newGroupId === g.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                              )}>
                              <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="truncate">{g.name}</span>
                              {newGroupId === g.id && <Check className="h-3 w-3 ml-auto shrink-0" />}
                            </button>
                          ))}
                          {visibleProjects.length === 0 && !projectSearch.trim() && (
                            <p className="text-xs text-muted-foreground px-2 py-1">Нет CRM-проектов</p>
                          )}
                          <div className="mt-1 border-t border-border pt-2 space-y-0.5">
                            <button onClick={() => setShowAllProjects(true)}
                              className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-primary hover:bg-primary/10">
                              <Search className="h-3 w-3" />
                              <span>Все проекты</span>
                            </button>
                            {!creatingInboxProject ? (
                              <button onClick={() => setCreatingInboxProject(true)}
                                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-primary hover:bg-primary/10">
                                <Plus className="h-3 w-3" />
                                <span>Создать проект</span>
                              </button>
                            ) : (
                              <Input
                                autoFocus
                                value={newInboxProjectName}
                                onChange={(e) => setNewInboxProjectName(e.target.value)}
                                placeholder="Название проекта..."
                                className="h-7 text-xs"
                                onKeyDown={async (e) => {
                                  if (e.key === "Enter" && newInboxProjectName.trim() && onCreateProject) {
                                    const newId = await onCreateProject(newInboxProjectName);
                                    if (newId) setNewGroupId(newId);
                                    setNewInboxProjectName("");
                                    setCreatingInboxProject(false);
                                  }
                                  if (e.key === "Escape") { setCreatingInboxProject(false); setNewInboxProjectName(""); }
                                }}
                              />
                            )}
                          </div>
                        </>)}
                        {showAllProjects && (<>
                          {visibleProjects.map((g) => (
                            <button key={g.id}
                              onClick={() => { setNewGroupId(g.id); setProjectSearch(""); }}
                              className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                                newGroupId === g.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                              )}>
                              <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className="truncate">{g.name}</span>
                              {newGroupId === g.id && <Check className="h-3 w-3 ml-auto shrink-0" />}
                            </button>
                          ))}
                          {visibleProjects.length === 0 && (
                            <p className="text-xs text-muted-foreground px-2 py-1">Не найдено</p>
                          )}
                          <div className="mt-1 border-t border-border pt-2 space-y-0.5">
                            <button onClick={() => { setShowAllProjects(false); setProjectSearch(""); }}
                              className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground">
                              ← CRM-проекты
                            </button>
                            {!creatingInboxProject ? (
                              <button onClick={() => setCreatingInboxProject(true)}
                                className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-primary hover:bg-primary/10">
                                <Plus className="h-3 w-3" />
                                <span>Создать проект</span>
                              </button>
                            ) : (
                              <Input
                                autoFocus
                                value={newInboxProjectName}
                                onChange={(e) => setNewInboxProjectName(e.target.value)}
                                placeholder="Название проекта..."
                                className="h-7 text-xs"
                                onKeyDown={async (e) => {
                                  if (e.key === "Enter" && newInboxProjectName.trim() && onCreateProject) {
                                    const newId = await onCreateProject(newInboxProjectName);
                                    if (newId) setNewGroupId(newId);
                                    setNewInboxProjectName("");
                                    setCreatingInboxProject(false);
                                  }
                                  if (e.key === "Escape") { setCreatingInboxProject(false); setNewInboxProjectName(""); }
                                }}
                              />
                            )}
                          </div>
                        </>)}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Assignee picker */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border transition-colors",
                        newAssignee ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"
                      )}>
                        <User className="h-3 w-3" />
                        {newAssignee
                          ? (usedAssignees.find((a) => a.id === newAssignee)?.display_name || "Назначен")
                          : "Ответств."}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2" side="bottom" align="start">
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {newAssignee && (
                          <button onClick={() => setNewAssignee(null)}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted">
                            <X className="h-3 w-3" /> Убрать
                          </button>
                        )}
                        {usedAssignees.map((a) => (
                          <button key={a.id} onClick={() => setNewAssignee(a.id)}
                            className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors",
                              newAssignee === a.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                            )}>
                            <User className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="truncate">{a.display_name || a.email || "?"}</span>
                            {newAssignee === a.id && <Check className="h-3 w-3 ml-auto shrink-0" />}
                          </button>
                        ))}
                        {usedAssignees.length === 0 && (
                          <p className="text-xs text-muted-foreground px-2 py-1">Нет участников</p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Deadline picker */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border transition-colors",
                        newDeadline ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"
                      )}>
                        <Calendar className="h-3 w-3" />
                        {newDeadline ? format(newDeadline, "d MMM", { locale: ru }) : "Срок"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" side="bottom" align="start">
                      <div className="p-2 pointer-events-auto">
                        <div className="flex flex-wrap gap-1 mb-2">
                          {[
                            { label: "Сегодня", days: 0 },
                            { label: "Завтра", days: 1 },
                            { label: "+3 дня", days: 3 },
                            { label: "+7 дней", days: 7 },
                          ].map((preset) => {
                            const d = new Date();
                            d.setDate(d.getDate() + preset.days);
                            return (
                              <button key={preset.days} onClick={() => setNewDeadline(d)}
                                className="text-[10px] px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground">
                                {preset.label}
                              </button>
                            );
                          })}
                          {newDeadline && (
                            <button onClick={() => setNewDeadline(undefined)}
                              className="text-[10px] px-2 py-1 rounded text-muted-foreground hover:text-foreground">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <CalendarComponent mode="single" selected={newDeadline} onSelect={setNewDeadline}
                          className="p-0 pointer-events-auto" />
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Tag picker */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border transition-colors",
                        newExtraTagIds.length > 0 ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"
                      )}>
                        <Tag className="h-3 w-3" />
                        {newExtraTagIds.length > 0 ? `Тэги (${newExtraTagIds.length})` : "Тэги"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-52 p-2" side="bottom" align="start">
                      <Input
                        value={tagSearch}
                        onChange={(e) => setTagSearch(e.target.value)}
                        placeholder="Поиск тэга..."
                        className="h-7 text-xs mb-2"
                      />
                      {newExtraTagIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {newExtraTagIds.map((tagId) => {
                            const tag = allTags.find((t) => t.id === tagId);
                            if (!tag) return null;
                            return (
                              <span key={tagId} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-foreground">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#6366f1' }} />
                                {tag.name}
                                <button onClick={() => setNewExtraTagIds((prev) => prev.filter((id) => id !== tagId))}
                                  className="hover:text-destructive">
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {filteredTagsForPicker.map((tag) => (
                          <button key={tag.id}
                            onClick={() => setNewExtraTagIds((prev) => [...prev, tag.id])}
                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color || '#6366f1' }} />
                            <span className="truncate">{tag.name}</span>
                          </button>
                        ))}
                        {filteredTagsForPicker.length === 0 && (
                          <p className="text-xs text-muted-foreground px-2 py-1">Нет тэгов</p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={handleSubmit}
                    className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90">
                    Добавить
                  </button>
                  <button onClick={resetForm}
                    className="text-xs px-2 py-1 rounded text-muted-foreground hover:text-foreground">
                    Отмена
                  </button>
                </div>
              </div>
            )}
            {tasks.length === 0 && !adding && (
              <div className="text-center py-8 text-xs text-muted-foreground/50">Нет входящих задач</div>
            )}
            {tasks.map((task) => (
              <DraggableCard
                key={task.id}
                task={task}
                isMoving={false}
                variant={cardVariant}
                tags={(task.task_tags || []).map((tt) => tagById.get(tt.tag_id)).filter((t): t is CrmTag => !!t && !crmLinkedTagIds.has(t.id) && !crmGroupNames.has(t.name.trim().toLowerCase()))}
                group={task.group_id ? groupById.get(task.group_id) || null : null}
                onToggleComplete={() => onToggleComplete(task)}
                onToggleImportant={() => onToggleImportant(task)}
                onCardClick={() => onCardClick(task.id)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
function DoneColumn({
  title,
  tasks,
  groupById,
  onCardClick,
}: {
  title: string;
  tasks: DoneCrmTask[];
  groupById: Map<string, CrmGroup>;
  onCardClick: (taskId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 shrink-0 border-r border-border last:border-r-0 transition-all",
        collapsed ? "w-16" : "w-72 md:w-80"
      )}
    >
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex items-center gap-2 px-3 py-3 border-b border-border hover:bg-muted/50 transition-colors"
        title={collapsed ? `Развернуть: ${title}` : `Свернуть: ${title}`}
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        {!collapsed && <span className="text-sm font-semibold text-foreground">{title}</span>}
        <span className={cn("text-xs text-muted-foreground", !collapsed && "ml-auto")}>{tasks.length}</span>
      </button>

      {!collapsed && (
        <ScrollArea className="flex-1 min-h-0 py-2">
          <div className="flex flex-col gap-2 px-2 w-[calc(theme(width.72)-0px)] md:w-[calc(theme(width.80)-0px)]">
            {tasks.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground/50">Нет завершённых задач</div>
            )}
            {tasks.map((task) => {
              const group = task.group_id ? groupById.get(task.group_id) : null;
              const titleText = task.client?.name || task.title;
              return (
                <button
                  key={task.id}
                  onClick={() => onCardClick(task.id)}
                  className="w-full text-left rounded-lg border border-border bg-card p-2.5 hover:bg-muted/40 transition-colors"
                >
                  <div className="text-sm font-medium text-foreground line-clamp-2">{titleText}</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    {group && <span className="text-[11px] text-muted-foreground truncate">{group.icon ? `${group.icon} ` : ""}{group.name}</span>}
                    {task.completed_at && (
                      <span className="text-[11px] text-muted-foreground ml-auto">
                        {format(parseISO(task.completed_at), "d MMM", { locale: ru })}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function DraggableCard({
  task,
  tags,
  group,
  isMoving,
  variant = "funnel",
  onToggleComplete,
  onToggleImportant,
  onCardClick,
}: {
  task: CrmTask;
  tags: CrmTag[];
  group: CrmGroup | null;
  isMoving: boolean;
  variant?: "funnel" | "sales";
  onToggleComplete: () => void;
  onToggleImportant: () => void;
  onCardClick: () => void;
}) {
  return (
    <DraggableWrapper id={task.id} disabled={isMoving}>
      {({ isDragging, dragHandleProps }) => (
        <CrmCard
          task={task}
          tags={tags}
          group={group}
          variant={variant}
          isDragging={isDragging}
          dragHandleProps={dragHandleProps}
          onToggleComplete={onToggleComplete}
          onToggleImportant={onToggleImportant}
          onCardClick={onCardClick}
        />
      )}
    </DraggableWrapper>
  );
}

function CrmCard({
  task,
  tags,
  group,
  variant = "funnel",
  isDragging,
  dragHandleProps,
  onToggleComplete,
  onToggleImportant,
  onCardClick,
}: {
  task: CrmTask;
  tags: CrmTag[];
  group: CrmGroup | null;
  variant?: "funnel" | "sales";
  isDragging?: boolean;
  dragHandleProps?: ComponentProps<"button">;
  onToggleComplete: () => void;
  onToggleImportant: () => void;
  onCardClick?: () => void;
}) {
  const navigate = useNavigate();
  const { data: allGroups = [] } = useTaskGroups();
  const [expanded, setExpanded] = useState(false);
  const completedSteps = task.subtasks.filter((s) => s.is_completed).length;
  const totalSteps = task.subtasks.length;

  const displayName = variant === "funnel" ? (task.client?.name || task.title) : task.title;
  const hasDetails = !!(
    (tags.length > 0) ||
    (task.client && (task.client.contact_name || task.client.phone || task.client.email)) ||
    (totalSteps > 0) ||
    (variant === "funnel" && group)
  );

  const toggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((p) => !p);
  }, []);

  // Compact info badges (always visible)
  const compactInfo = (
    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground flex-wrap">
      {task.deadline && (
        <span className={cn("inline-flex items-center gap-0.5", new Date(task.deadline) < new Date() ? "text-destructive" : "")}>
          <Calendar className="h-2.5 w-2.5" />
          {format(parseISO(task.deadline), "d MMM", { locale: ru })}
        </span>
      )}
      {task.assignee && (
        <span className="inline-flex items-center gap-0.5 truncate max-w-[100px]" title={task.assignee.display_name || task.assignee.email || "?"}>
          <User className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{task.assignee.display_name || task.assignee.email || "?"}</span>
        </span>
      )}
      {variant === "sales" && group && (
        <span className="inline-flex items-center gap-0.5 truncate max-w-[110px]" title={`${group.icon ? `${group.icon} ` : ""}${group.name}`}>
          <FolderOpen className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{group.icon ? `${group.icon} ` : ""}{group.name}</span>
        </span>
      )}
      {variant === "sales" && task.client && (
        <span className="inline-flex items-center gap-0.5 truncate max-w-[100px]" title={task.client.name}>
          <Briefcase className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{task.client.name}</span>
        </span>
      )}
      {totalSteps > 0 && (
        <span className="inline-flex items-center gap-0.5">
          {completedSteps}/{totalSteps}
        </span>
      )}
      {task.source_protocol_id && (() => {
        const protocolGroup = allGroups.find(g => g.id === task.source_protocol_id);
        const meetingDateStr = (protocolGroup as any)?.protocol_meta?.meeting_date as string | undefined;
        const dateSource = meetingDateStr || protocolGroup?.created_at;
        const formattedDate = dateSource ? format(parseISO(dateSource), "d MMM", { locale: ru }) : "";
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/protocols/${task.source_protocol_id}`);
            }}
            title={protocolGroup ? `Из протокола: ${protocolGroup.name}` : "Перейти в протокол-источник"}
            className="inline-flex items-center gap-0.5 rounded-sm border border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-300 px-1 py-px text-[9px] font-medium hover:bg-purple-500/20 transition-colors"
          >
            <FileText className="h-2.5 w-2.5" />
            из протокола{formattedDate && ` от ${formattedDate}`}
          </button>
        );
      })()}
    </div>
  );

  return (
    <div
      onClick={onCardClick}
      className={cn(
        "rounded-lg border border-border bg-card shadow-sm transition-all cursor-pointer",
        expanded ? "p-3" : "px-2.5 py-1.5",
        isDragging ? "shadow-lg" : "hover:shadow-md"
      )}
    >
      {/* Compact row — always visible */}
      <div className="flex items-center gap-1 min-w-0">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleComplete(); }}
          className={cn(
            "h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
            task.is_completed ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"
          )}
        >
          {task.is_completed && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
        </button>

        {variant === "funnel" && <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />}

        <h4 className={cn(
          "flex-1 text-xs font-medium text-foreground leading-tight min-w-0",
          expanded ? "whitespace-normal break-words" : "truncate"
        )} title={displayName}>
          {displayName}
        </h4>

        <div className="flex items-center shrink-0">
          {task.is_important && (
            <Star className="h-3 w-3 text-warning fill-current" />
          )}

          {hasDetails && (
            <button
              onClick={toggleExpand}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
            </button>
          )}

          <button
            {...dragHandleProps}
            onClick={(e) => e.stopPropagation()}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Compact info line — always visible */}
      {!expanded && compactInfo}

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 space-y-1.5">
          {/* Important toggle when expanded */}
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleImportant(); }}
              className={cn("p-0.5 rounded transition-colors", task.is_important ? "text-warning" : "text-muted-foreground hover:text-warning")}
            >
              <Star className={cn("h-3.5 w-3.5", task.is_important && "fill-current")} />
            </button>
            {task.deadline && (
              <span className={cn("text-[11px] inline-flex items-center gap-1", new Date(task.deadline) < new Date() ? "text-destructive" : "text-muted-foreground")}>
                <Calendar className="h-3 w-3" />
                {format(parseISO(task.deadline), "d MMM", { locale: ru })}
              </span>
            )}
            {task.assignee && (
              <span className="text-[11px] inline-flex items-center gap-1 text-muted-foreground truncate max-w-[140px]" title={task.assignee.display_name || task.assignee.email || "?"}>
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">{task.assignee.display_name || task.assignee.email || "?"}</span>
              </span>
            )}
          </div>

          {group && (
            <div className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-foreground">
              <FolderOpen className="h-3 w-3" />
              <span className="truncate">{group.icon ? `${group.icon} ` : ""}{group.name}</span>
            </div>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: tag.color ? `${tag.color}20` : undefined,
                    color: tag.color || undefined,
                  }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {task.client && (
            <div className="flex flex-col gap-0.5">
              {task.client.contact_name && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">{task.client.contact_name}</span>
                </div>
              )}
              {task.client.phone && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="truncate">{task.client.phone}</span>
                </div>
              )}
              {task.client.email && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{task.client.email}</span>
                </div>
              )}
            </div>
          )}

          {totalSteps > 0 && (
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-muted-foreground">{completedSteps}/{totalSteps} шагов</span>
                {(() => {
                  const nextDeadline = task.subtasks
                    .filter((s) => !s.is_completed && s.deadline)
                    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0];
                  if (!nextDeadline) return null;
                  const isOverdue = new Date(nextDeadline.deadline!) < new Date();
                  return (
                    <span className={cn("text-[10px] flex items-center gap-0.5", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                      <Calendar className="h-2.5 w-2.5" />
                      {format(parseISO(nextDeadline.deadline!), "d MMM", { locale: ru })}
                    </span>
                  );
                })()}
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
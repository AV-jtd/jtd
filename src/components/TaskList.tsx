import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { useTasks, useTaskMutations, useTaskGroups, useVisibleTags, useAvailableUsers, useLinkedTagIds, useTagCategories, useTaskParticipantsBulk } from "@/hooks/useTasks";
import { useLinkedProtocolTasks } from "@/hooks/useLinkedProtocolTasks";
import { useAuth } from "@/hooks/useAuth";
import { useTasksWithComments } from "@/hooks/useComments";
import TaskItem from "./TaskItem";
import ProjectDetailPanel from "./ProjectDetailPanel";
import AiInsightsCard, { type StatChipKey, type TaskRoleStats, type InsightSmartFilter } from "./AiInsightsCard";
import { useProtocolsInsight } from "@/modules/protocols/hooks/useProtocolsInsight";
import { useNavigate } from "react-router-dom";
const BulkTaskDialog = lazy(() => import("./BulkTaskDialog"));
const VirtualTaskList = lazy(() => import("./task-list/VirtualTaskList"));
import { useAiInsights } from "@/hooks/useAiInsights";
import { List, Star, CalendarDays, Users, Inbox, Expand, X, MessageCircle, Clock, Trash2, FolderOpen, Tag, Sparkles, ChevronLeft, ChevronRight, ChevronDown, GripVertical, Layers } from "lucide-react";
import SubprojectCards from "@/components/SubprojectCards";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRows } from "@/components/SkeletonRows";
import { isToday, parseISO, isBefore, startOfDay, isThisWeek } from "date-fns";
import { pluralizeRu } from "@/lib/pluralize";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ConfirmDelete from "@/components/ConfirmDelete";
import TaskCreateBar from "@/components/task-list/TaskCreateBar";
import TaskFiltersBar, { type GroupByOption } from "@/components/task-list/TaskFiltersBar";
import {
  DndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

/* Droppable group section for drag-to-move between projects */
function DroppableGroupSection({ groupKey, isOver, children }: { groupKey: string; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `group-drop:${groupKey}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-xl transition-colors",
        isOver && "bg-primary/5 ring-1 ring-primary/20"
      )}
    >
      {children}
    </div>
  );
}

/* Draggable wrapper for tasks in grouped view */
function DraggableGroupTask({ taskId, children }: { taskId: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `group-task:${taskId}` });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-30")}>
      <div className="flex items-center gap-0">
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none p-1 -ml-5 opacity-0 group-hover/draggable:opacity-100 transition-opacity"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
interface TaskListProps {
  activeView: string;
  activeGroupId: string | null;
  activeTagFilters: string[];
  projectDetailOpen: boolean;
  onToggleProjectDetail: () => void;
  chatOpen?: boolean;
  onToggleChat?: () => void;
  messengerOpen?: boolean;
  onToggleMessenger?: () => void;
  highlightTaskId?: string | null;
  onHighlightClear?: () => void;
  onTagClick?: (tagId: string) => void;
  onProjectClick?: (groupId: string) => void;
  onInsightTaskNavigate?: (taskId: string, groupId: string | null) => void;
  onAiOpen?: () => void;
  onViewChange?: (view: string) => void;
}

export default function TaskList({ activeView, activeGroupId, activeTagFilters, projectDetailOpen, onToggleProjectDetail, chatOpen, onToggleChat, messengerOpen, onToggleMessenger, highlightTaskId, onHighlightClear, onTagClick, onProjectClick, onInsightTaskNavigate, onAiOpen, onViewChange }: TaskListProps) {
  const { user } = useAuth();
  const { insights, loading: insightsLoading, error: insightsError, dismissed: insightsDismissed, refresh: refreshInsights, dismiss: dismissInsights } = useAiInsights();
  const { insight: protocolsInsight } = useProtocolsInsight();
  const navigate = useNavigate();
  // Performance: in the global task list we only need active tasks plus
  // completed-in-the-last-7-days (rendered in the collapsed «Выполнено»
  // section + the «completed» smart-filter chip which itself looks back 7
  // days). Older completed tasks are still found by global search and live
  // in the Archive view, which uses unrestricted useTasks().
  // For a specific project view (`activeView === "group"`) we keep the
  // full history because the project page needs accurate progress metrics.
  const isGroupView = activeView === "group";
  const { data: tasks = [], isLoading, error: tasksError, refetch: refetchTasks } = useTasks(
    isGroupView ? activeGroupId : undefined,
    activeTagFilters.length > 0 ? activeTagFilters : undefined,
    isGroupView ? undefined : { completedWindowDays: 14 },
  );
  const showTaskSkeleton = isLoading && tasks.length === 0;
  const { data: groups = [] } = useTaskGroups();
  const { data: allTags = [] } = useVisibleTags();
  const { data: availableUsers = [] } = useAvailableUsers();
  const { data: tagCategories = [] } = useTagCategories();
  const linkedTagIds = useLinkedTagIds();
  const mutations = useTaskMutations();
  const { addTask, reorderTasks, deleteTask, updateTask, addTaskTag } = mutations;
  const [priorityFilter, setPriorityFilter] = useState<number | "important" | "overdue" | "pending_approval" | "no_dates" | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [delegationTab, setDelegationTab] = useState<"by_me" | "to_me">("by_me");
  const [groupBy, setGroupBy] = useState<GroupByOption>("none");
  const [mydayTab, setMydayTab] = useState<"all" | "important" | "today" | "overdue">("all");
  // Toggle: подмес задач из протоколов (status_meta.linked_project_id → текущий проект,
  // либо все linked-задачи если активного проекта нет).
  const [showProtocolTasks, setShowProtocolTasks] = useState(false);
  const { data: linkedProtocolTasks = [] } = useLinkedProtocolTasks(showProtocolTasks);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const batchMode = selectedIds.size > 0;

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollParentRef = useRef<HTMLElement>(null);

  const activeGroup = groups.find(g => g.id === activeGroupId);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "Escape") {
        if (batchMode) {
          setSelectedIds(new Set());
          e.preventDefault();
          return;
        }
        if (isInput) {
          (target as HTMLInputElement).blur();
          e.preventDefault();
          return;
        }
      }

      if (isInput) return;

      if (e.key === "n" || e.key === "N" || e.key === "т" || e.key === "Т") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [batchMode]);

  // Clear selection and stat filter when view changes
  useEffect(() => {
    setSelectedIds(new Set());
    setActiveStatFilter(null);
  }, [activeView, activeGroupId]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(tasks.map(t => t.id)));
  }, [tasks]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBatchDelete = useCallback(() => {
    selectedIds.forEach(id => deleteTask.mutate(id));
    setSelectedIds(new Set());
  }, [selectedIds, deleteTask]);

  const handleBatchMove = useCallback((groupId: string | null) => {
    selectedIds.forEach(id => updateTask.mutate({ id, group_id: groupId }));
    setSelectedIds(new Set());
  }, [selectedIds, updateTask]);

  const handleBatchTag = useCallback((tagId: string) => {
    selectedIds.forEach(id => addTaskTag.mutate({ task_id: id, tag_id: tagId }));
    setSelectedIds(new Set());
  }, [selectedIds, addTaskTag]);

  const viewConfig: Record<string, { title: string; icon: React.ElementType; emptyTitle: string; emptyDesc: string }> = {
    all: { title: "Все задачи", icon: List, emptyTitle: "Список пуст", emptyDesc: "Создайте первую задачу — просто начните печатать выше" },
    inbox: { title: "Входящие", icon: Inbox, emptyTitle: "Входящие пусты", emptyDesc: "Задачи без проекта попадают сюда" },
    myday: { title: "Мой день", icon: Star, emptyTitle: "Мой день пуст", emptyDesc: "Важные задачи и задачи на сегодня появятся здесь" },
    important: { title: "Важные", icon: Star, emptyTitle: "Нет важных задач", emptyDesc: "Отметьте задачу звёздочкой, чтобы она появилась здесь" },
    today: { title: "На сегодня", icon: CalendarDays, emptyTitle: "На сегодня ничего", emptyDesc: "Задачи с сегодняшним дедлайном появятся здесь" },
    assigned: { title: "Делегированные", icon: Users, emptyTitle: delegationTab === "by_me" ? "Вы не поручали задач" : "Вам ничего не поручено", emptyDesc: delegationTab === "by_me" ? "Назначьте задачу другому пользователю" : "Когда вам назначат задачу, она появится здесь" },
    deferred: { title: "Отложенные", icon: Clock, emptyTitle: "Нет отложенных", emptyDesc: "Установите дату начала, чтобы отложить задачу" },
    group: { title: activeGroup?.name || "Проект", icon: List, emptyTitle: "Проект пуст", emptyDesc: "Добавьте задачи в этот проект" },
  };

  const view = viewConfig[activeView] || viewConfig.all;
  const Icon = view.icon;

  const delegationCounts = useMemo(() => {
    const byMe = tasks.filter(t => t.user_id === user?.id && t.assigned_to && t.assigned_to !== user?.id && !t.is_completed).length;
    const toMe = tasks.filter(t => t.assigned_to === user?.id && t.user_id !== user?.id && !t.is_completed).length;
    return { byMe, toMe };
  }, [tasks, user?.id]);

  const roleStats = useMemo((): TaskRoleStats => {
    const now = new Date();
    const activeTasks = tasks.filter(t => !t.is_completed);
    return {
      responsible: activeTasks.filter(t => t.assigned_to === user?.id).length,
      delegatedByMe: activeTasks.filter(t => t.user_id === user?.id && t.assigned_to && t.assigned_to !== user?.id).length,
      delegatedToMe: activeTasks.filter(t => t.assigned_to === user?.id && t.user_id !== user?.id).length,
      overdue: activeTasks.filter(t => t.deadline && new Date(t.deadline) < now).length,
      drift: activeTasks.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline).length,
      completed: tasks.filter(t => t.is_completed && t.completed_at && (now.getTime() - new Date(t.completed_at).getTime()) < 7 * 24 * 60 * 60 * 1000).length,
    };
  }, [tasks, user?.id]);

  // Active stat chip filter (toggle pattern)
  const [activeStatFilter, setActiveStatFilter] = useState<StatChipKey | null>(null);

  const handleStatChipClick = useCallback((key: StatChipKey) => {
    // Toggle: clicking same chip again resets filter
    setActiveStatFilter(prev => prev === key ? null : key);
    // Reset other filters
    setPriorityFilter(null);
    setAssigneeFilter(null);
    setProjectFilter(null);
    setSearchFilter("");
  }, []);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    let nextTasks: typeof tasks = tasks;

    // Подмешиваем задачи из протоколов (если включён тогл).
    // В режиме проекта — только те, чей linked_project_id указывает
    // на этот проект или его подпроекты. Иначе — все linked.
    if (showProtocolTasks && linkedProtocolTasks.length > 0) {
      const protocolGroupIds = new Set(
        groups.filter(g => (g as any).project_type === "protocol").map(g => g.id)
      );
      let allowedProjectIds: Set<string> | null = null;
      if (isGroupView && activeGroupId) {
        const childIds = groups.filter(g => g.parent_id === activeGroupId).map(g => g.id);
        allowedProjectIds = new Set([activeGroupId, ...childIds]);
      }
      const existingIds = new Set(nextTasks.map(t => t.id));
      const extras = (linkedProtocolTasks as any[]).filter(t => {
        if (existingIds.has(t.id)) return false;
        if (!t.group_id || !protocolGroupIds.has(t.group_id)) return false;
        const lp = t.status_meta?.linked_project_id as string | undefined;
        if (!lp) return false;
        if (allowedProjectIds && !allowedProjectIds.has(lp)) return false;
        return true;
      });
      nextTasks = [...nextTasks, ...(extras as any)];
    }

    if (activeView === "inbox") {
      nextTasks = nextTasks.filter(t => !t.group_id);
    } else if (activeView === "myday") {
      const mydayAll = nextTasks.filter(t =>
        t.is_important ||
        (t.deadline && isToday(parseISO(t.deadline))) ||
        (t.deadline && !t.is_completed && isBefore(parseISO(t.deadline), startOfDay(now)))
      );
      if (mydayTab === "important") {
        nextTasks = mydayAll.filter(t => t.is_important);
      } else if (mydayTab === "today") {
        nextTasks = mydayAll.filter(t => t.deadline && isToday(parseISO(t.deadline)));
      } else if (mydayTab === "overdue") {
        nextTasks = mydayAll.filter(t => t.deadline && !t.is_completed && isBefore(parseISO(t.deadline), startOfDay(now)));
      } else {
        nextTasks = mydayAll;
      }
    } else if (activeView === "important") {
      nextTasks = nextTasks.filter(t => t.is_important);
    } else if (activeView === "today") {
      nextTasks = nextTasks.filter(t => t.deadline && isToday(parseISO(t.deadline)));
    } else if (activeView === "assigned") {
      if (delegationTab === "by_me") {
        nextTasks = nextTasks.filter(t => t.user_id === user?.id && t.assigned_to && t.assigned_to !== user?.id);
      } else {
        nextTasks = nextTasks.filter(t => t.assigned_to === user?.id && t.user_id !== user?.id);
      }
    } else if (activeView === "deferred") {
      nextTasks = nextTasks.filter(t => t.deferred_until && new Date(t.deferred_until) > now);
    } else {
      nextTasks = nextTasks.filter(t => !t.deferred_until || new Date(t.deferred_until) <= now);
    }

    if (priorityFilter !== null) {
      if (priorityFilter === "important") {
        nextTasks = nextTasks.filter(t => t.is_important);
      } else if (priorityFilter === "overdue") {
        nextTasks = nextTasks.filter(t => t.deadline && !t.is_completed && new Date(t.deadline) < now);
      } else if (priorityFilter === "pending_approval") {
        nextTasks = nextTasks.filter(t => t.approval_status === "pending");
      } else if (priorityFilter === "no_dates") {
        nextTasks = nextTasks.filter(t => !t.deadline && !(t as any).start_at);
      } else {
        nextTasks = nextTasks.filter(t => (t as any).priority === priorityFilter);
      }
    }

    if (assigneeFilter !== null) {
      if (assigneeFilter === "me") {
        nextTasks = nextTasks.filter(t => t.assigned_to === user?.id);
      } else if (assigneeFilter === "unassigned") {
        nextTasks = nextTasks.filter(t => !t.assigned_to);
      } else {
        nextTasks = nextTasks.filter(t => t.assigned_to === assigneeFilter);
      }
    }

    if (projectFilter !== null) {
      if (projectFilter === "none") {
        nextTasks = nextTasks.filter(t => !t.group_id);
      } else {
        nextTasks = nextTasks.filter(t => t.group_id === projectFilter);
      }
    }

    const normalizedSearch = searchFilter.trim().toLowerCase();
    if (normalizedSearch) {
      nextTasks = nextTasks.filter(t => t.title.toLowerCase().includes(normalizedSearch));
    }

    // Apply stat chip filter
    if (activeStatFilter) {
      const now2 = new Date();
      switch (activeStatFilter) {
        case "responsible":
          nextTasks = nextTasks.filter(t => t.assigned_to === user?.id && !t.is_completed);
          break;
        case "delegated_by_me":
          nextTasks = nextTasks.filter(t => t.user_id === user?.id && t.assigned_to && t.assigned_to !== user?.id && !t.is_completed);
          break;
        case "delegated_to_me":
          nextTasks = nextTasks.filter(t => t.assigned_to === user?.id && t.user_id !== user?.id && !t.is_completed);
          break;
        case "overdue":
          nextTasks = nextTasks.filter(t => t.deadline && !t.is_completed && new Date(t.deadline) < now2);
          break;
        case "drift":
          nextTasks = nextTasks.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline && !t.is_completed);
          break;
        case "completed":
          nextTasks = nextTasks.filter(t => t.is_completed && t.completed_at && (now2.getTime() - new Date(t.completed_at).getTime()) < 7 * 24 * 60 * 60 * 1000);
          break;
      }
    }

    return nextTasks;
  }, [tasks, activeView, priorityFilter, assigneeFilter, projectFilter, searchFilter, user?.id, delegationTab, activeStatFilter, mydayTab, showProtocolTasks, linkedProtocolTasks, groups, isGroupView, activeGroupId]);

  const activeTasks = useMemo(() => filteredTasks.filter(t => !t.is_completed), [filteredTasks]);
  const completedTasks = useMemo(() => filteredTasks.filter(t => t.is_completed), [filteredTasks]);

  // Grouped sections
  type GroupedSection = { key: string; label: string; color?: string; tasks: typeof activeTasks };
  const groupedSections = useMemo((): GroupedSection[] => {
    if (groupBy === "none") return [];
    const now = new Date();

    if (groupBy === "project") {
      const byProject = new Map<string, typeof activeTasks>();
      activeTasks.forEach(t => {
        const key = t.group_id || "__none__";
        if (!byProject.has(key)) byProject.set(key, []);
        byProject.get(key)!.push(t);
      });
      const sections: GroupedSection[] = [];
      byProject.forEach((tasks, key) => {
        const group = groups.find(g => g.id === key);
        sections.push({
          key,
          label: key === "__none__" ? "Без проекта" : group?.name || "Проект",
          color: group?.color || undefined,
          tasks,
        });
      });
      return sections.sort((a, b) => {
        if (a.key === "__none__") return 1;
        if (b.key === "__none__") return -1;
        return a.label.localeCompare(b.label);
      });
    }

    if (groupBy === "deadline") {
      const overdue: typeof activeTasks = [];
      const today: typeof activeTasks = [];
      const thisWeek: typeof activeTasks = [];
      const later: typeof activeTasks = [];
      const noDeadline: typeof activeTasks = [];

      activeTasks.forEach(t => {
        if (!t.deadline) { noDeadline.push(t); return; }
        const d = parseISO(t.deadline);
        if (isBefore(d, startOfDay(now))) overdue.push(t);
        else if (isToday(d)) today.push(t);
        else if (isThisWeek(d, { weekStartsOn: 1 })) thisWeek.push(t);
        else later.push(t);
      });

      return [
        { key: "overdue", label: "🔴 Просрочено", tasks: overdue },
        { key: "today", label: "🟡 Сегодня", tasks: today },
        { key: "week", label: "📅 На этой неделе", tasks: thisWeek },
        { key: "later", label: "📆 Позже", tasks: later },
        { key: "none", label: "Без срока", tasks: noDeadline },
      ].filter(s => s.tasks.length > 0);
    }

    if (groupBy === "assignee") {
      const byAssignee = new Map<string, typeof activeTasks>();
      activeTasks.forEach(t => {
        const key = t.assigned_to || "__unassigned__";
        if (!byAssignee.has(key)) byAssignee.set(key, []);
        byAssignee.get(key)!.push(t);
      });
      const sections: GroupedSection[] = [];
      byAssignee.forEach((tasks, key) => {
        const user = availableUsers.find(u => u.id === key);
        sections.push({
          key,
          label: key === "__unassigned__" ? "Не назначено" : user?.display_name || "Пользователь",
          tasks,
        });
      });
      return sections.sort((a, b) => {
        if (a.key === "__unassigned__") return 1;
        if (b.key === "__unassigned__") return -1;
        return a.label.localeCompare(b.label);
      });
    }

    return [];
  }, [groupBy, activeTasks, groups, availableUsers]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleCollapse = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const groupedSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const [groupDragOver, setGroupDragOver] = useState<string | null>(null);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    // Check if dropped onto a subproject target
    const overId = over.id as string;
    if (overId.startsWith("subproject-drop:")) {
      const targetGroupId = overId.replace("subproject-drop:", "");
      const taskId = active.id as string;
      const task = activeTasks.find(t => t.id === taskId);
      if (task && task.group_id !== targetGroupId) {
        updateTask.mutate({ id: taskId, group_id: targetGroupId });
      }
      return;
    }

    if (active.id === over.id) return;
    const oldIndex = activeTasks.findIndex(t => t.id === active.id);
    const newIndex = activeTasks.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(activeTasks, oldIndex, newIndex);
    reorderTasks.mutate(reordered.map((t, i) => ({ id: t.id, position: i })));
  }, [activeTasks, reorderTasks, updateTask]);

  const handleGroupedDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    if (overId?.startsWith("group-drop:")) {
      setGroupDragOver(overId.replace("group-drop:", ""));
    } else {
      setGroupDragOver(null);
    }
  }, []);

  const handleGroupedDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setGroupDragOver(null);
    if (!over) return;
    const taskId = (active.id as string).replace("group-task:", "");
    const overId = over.id as string;
    if (!overId.startsWith("group-drop:")) return;
    const targetGroupKey = overId.replace("group-drop:", "");
    const targetGroupId = targetGroupKey === "__none__" ? null : targetGroupKey;
    const task = activeTasks.find(t => t.id === taskId);
    if (!task) return;
    const currentGroupId = task.group_id || "__none__";
    if (currentGroupId === targetGroupKey || task.group_id === targetGroupId) return;
    updateTask.mutate({ id: taskId, group_id: targetGroupId });
  }, [activeTasks, updateTask]);

  const handleCreateTask = useCallback((payload: {
    title: string;
    group_id: string | null;
    deadline: string | null;
    assigned_to?: string | null;
    department_id?: string | null;
    contractor_id?: string | null;
    task_type: "standard" | "crm";
    client_name?: string;
  }) => {
    addTask.mutate(payload);
  }, [addTask]);

  // Build breadcrumb chain for subprojects
  const breadcrumbChain = useMemo(() => {
    if (activeView !== "group" || !activeGroup) return [];
    const chain: typeof groups = [];
    let current = activeGroup as typeof groups[0] | undefined;
    while (current) {
      chain.unshift(current);
      current = current.parent_id ? groups.find(g => g.id === current!.parent_id) : undefined;
    }
    return chain;
  }, [activeView, activeGroup, groups]);

  const parentGroup = activeGroup?.parent_id ? groups.find(g => g.id === activeGroup.parent_id) : null;
  const displayName = (name: string) => name.includes("/") ? name.split("/").pop()!.trim() : name;

  // Shared data props for TaskItem — avoids N duplicate hook subscriptions
  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks]);
  const { data: tasksWithComments } = useTasksWithComments(taskIds);
  const { data: participantsByTask } = useTaskParticipantsBulk(taskIds);
  const sharedTaskItemProps = useMemo(() => ({
    sharedTags: allTags,
    sharedUsers: availableUsers,
    sharedGroups: groups,
    sharedTagCategories: tagCategories,
    sharedLinkedTagIds: linkedTagIds,
    sharedMutations: mutations,
    sharedParticipantsByTask: participantsByTask,
    sharedTasksWithComments: tasksWithComments,
  }), [allTags, availableUsers, groups, tagCategories, linkedTagIds, mutations, participantsByTask, tasksWithComments]);

  return (
    <main ref={scrollParentRef} className="flex-1 overflow-y-auto scrollbar-thin" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Breadcrumbs for subprojects */}
        {activeView === "group" && breadcrumbChain.length > 1 && (
          <nav className="flex items-center gap-1 mb-3 text-xs text-muted-foreground overflow-x-auto scrollbar-none">
            <button
              onClick={() => onProjectClick?.(parentGroup!.id)}
              className="p-1 rounded-md hover:bg-muted transition-colors shrink-0"
              title="Назад"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            {breadcrumbChain.map((g, i) => {
              const isLast = i === breadcrumbChain.length - 1;
              return (
                <span key={g.id} className="flex items-center gap-1 shrink-0">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
                  {isLast ? (
                    <span className="font-medium text-foreground">{displayName(g.name)}</span>
                  ) : (
                    <button
                      onClick={() => onProjectClick?.(g.id)}
                      className="hover:text-foreground transition-colors hover:underline underline-offset-2"
                    >
                      {displayName(g.name)}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
        )}

        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          {activeView === "group" && parentGroup && (
            <button
              onClick={() => onProjectClick?.(parentGroup.id)}
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors shrink-0"
              title="Назад к родительскому проекту"
            >
              <ChevronLeft className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold text-foreground leading-tight truncate">
              {activeView === "group" && activeGroup ? displayName(activeGroup.name) : view.title}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pluralizeRu(activeTasks.length, "задача", "задачи", "задач")}
              {!batchMode && (
                <span className="hidden sm:inline text-muted-foreground/40 ml-2">
                  N — новая · ⌘K — поиск · Esc — закрыть
                </span>
              )}
            </p>
          </div>
          {activeView === "group" && activeGroup && (
            <div className="flex items-center gap-1">
              <button
                onClick={onToggleChat}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  chatOpen
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                title="Чат проекта"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
              <button
                onClick={onToggleProjectDetail}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  projectDetailOpen
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                title="Карточка проекта"
              >
                <Expand className="h-4 w-4" />
              </button>
            </div>
          )}
          {(!activeGroup || activeView !== "group") && (
            <>
              <button
                onClick={onAiOpen}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                title="ИИ-помощник"
              >
                <Sparkles className="h-4 w-4" />
              </button>
              <button
                onClick={onToggleMessenger}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  messengerOpen
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                title="Сообщения"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Delegation tabs */}
        {activeView === "assigned" && (
          <div className="flex items-center gap-1 mb-4 p-1 bg-muted/50 rounded-xl w-fit">
            <button
              onClick={() => setDelegationTab("by_me")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                delegationTab === "by_me"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              📤 Поручил я{delegationCounts.byMe > 0 && ` (${delegationCounts.byMe})`}
            </button>
            <button
              onClick={() => setDelegationTab("to_me")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                delegationTab === "to_me"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              📥 Поручено мне{delegationCounts.toMe > 0 && ` (${delegationCounts.toMe})`}
            </button>
          </div>
        )}

        {/* My Day sub-tabs */}
        {activeView === "myday" && (
          <div className="flex items-center gap-1 mb-4 p-1 bg-muted/50 rounded-xl w-fit overflow-x-auto scrollbar-none max-w-full">
            {([
              { key: "all" as const, label: "Все", emoji: "📋" },
              { key: "important" as const, label: "Важные", emoji: "⭐" },
              { key: "today" as const, label: "Сегодня", emoji: "📅" },
              { key: "overdue" as const, label: "Просроченные", emoji: "🔴" },
            ]).map(tab => {
              const now = new Date();
              const mydayAll = tasks.filter(t =>
                t.is_important ||
                (t.deadline && isToday(parseISO(t.deadline))) ||
                (t.deadline && !t.is_completed && isBefore(parseISO(t.deadline), startOfDay(now)))
              );
              const count = tab.key === "all" ? mydayAll.length
                : tab.key === "important" ? mydayAll.filter(t => t.is_important).length
                : tab.key === "today" ? mydayAll.filter(t => t.deadline && isToday(parseISO(t.deadline))).length
                : mydayAll.filter(t => t.deadline && !t.is_completed && isBefore(parseISO(t.deadline), startOfDay(now))).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setMydayTab(tab.key)}
                  className={cn(
                    "px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0",
                    mydayTab === tab.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.emoji} {tab.label}{count > 0 ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>
        )}

        {/* AI Insights — show on inbox/myday/all/group views */}
        {!batchMode && (activeView === "inbox" || activeView === "myday" || activeView === "today" || activeView === "all" || activeView === "group") && (
          <AiInsightsCard
            insights={activeView === "group" ? null : insights}
            loading={activeView === "group" ? false : insightsLoading}
            error={activeView === "group" ? null : insightsError}
            dismissed={activeView === "group" ? false : insightsDismissed}
            onRefresh={refreshInsights}
            onDismiss={dismissInsights}
            onSmartFilter={(filter: InsightSmartFilter) => {
              // Smart compound filter: combine project + hint-based filters
              setActiveStatFilter(null);
              setPriorityFilter(null);
              setAssigneeFilter(null);
              setSearchFilter("");

              // Apply hint-based filters
              if (filter.hint === "overdue") {
                setPriorityFilter("overdue");
              } else if (filter.hint === "no_assignee") {
                setAssigneeFilter("unassigned");
              } else if (filter.hint === "no_deadline" || filter.hint === "steps") {
                // Use search to highlight context
                const hintSearch = filter.hint === "no_deadline" ? "" : "";
                setSearchFilter(hintSearch);
              }

              // Apply project scope
              if (filter.groupId) {
                setProjectFilter(filter.groupId);
              } else if (filter.taskId) {
                const task = tasks.find(t => t.id === filter.taskId);
                if (task?.group_id) {
                  setProjectFilter(task.group_id);
                } else {
                  setProjectFilter(null);
                }
              } else if (!filter.hint) {
                setProjectFilter(null);
              }

              // Stat chip hints (map to stat chips for overdue/drift)
              if (filter.hint === "drift") {
                setActiveStatFilter("drift");
                setPriorityFilter(null);
                setProjectFilter(filter.groupId || null);
              } else if (filter.hint === "stale") {
                // Stale = no recent activity, show overdue as closest match
                setActiveStatFilter("overdue");
                setProjectFilter(filter.groupId || null);
              }

              // Scroll to specific task if referenced
              if (filter.taskId) {
                setTimeout(() => {
                  const el = document.querySelector(`[data-task-id="${filter.taskId}"]`);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                    el.classList.add("ring-2", "ring-primary/50", "rounded-lg");
                    setTimeout(() => el.classList.remove("ring-2", "ring-primary/50", "rounded-lg"), 2000);
                  }
                }, 150);
              }
            }}
            onNavigateToTask={(taskId) => {
              const task = tasks.find(t => t.id === taskId);
              onInsightTaskNavigate?.(taskId, task?.group_id ?? null);
            }}
            onNavigateToProject={onProjectClick}
            roleStats={roleStats}
            onStatClick={handleStatChipClick}
            activeStatFilter={activeStatFilter}
            compactMode={activeView === "group"}
            compactLabel={activeView === "group" && activeGroup ? activeGroup.name : undefined}
            userName={user?.user_metadata?.display_name || undefined}
            protocolsLine={
              activeView === "all" && protocolsInsight && protocolsInsight.totals.stuck > 0
                ? {
                    stuck: protocolsInsight.totals.stuck,
                    topTagName: protocolsInsight.axes?.[0]?.chips?.[0]?.tagName,
                    onOpen: () => {
                      const top = protocolsInsight.axes?.[0]?.chips?.[0];
                      navigate(top ? `/protocols?axis=${top.tagId}` : "/protocols");
                    },
                  }
                : null
            }
          />
        )}

        {batchMode && (
          <div className="flex items-center gap-2 mb-4 p-2.5 bg-primary/5 border border-primary/20 rounded-xl animate-fade-in">
            <button
              onClick={clearSelection}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Снять выделение (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-foreground">
              {pluralizeRu(selectedIds.size, "задача", "задачи", "задач")}
            </span>
            <button
              onClick={selectAll}
              className="text-xs text-primary hover:text-primary/80 transition-colors ml-1"
            >
              Выбрать все
            </button>

            <div className="flex-1" />

            {/* Move to group */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors">
                  <FolderOpen className="h-3.5 w-3.5" />
                  Переместить
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-52 p-2 bg-popover border-border z-50" side="bottom">
                <PopoverSearchList
                  items={[{ id: "__none__", name: "Без проекта", icon: null, color: null, parent_id: null } as any, ...groups.filter(g => !g.parent_id)]}
                  searchKey={(g: any) => g.name}
                  placeholder="Найти проект..."
                  emptyText="Нет проектов"
                  renderItem={(g: any) => {
                    if (g.id === "__none__") {
                      return (
                        <button
                          key="__none__"
                          onClick={() => handleBatchMove(null)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors text-muted-foreground"
                        >
                          Без проекта
                        </button>
                      );
                    }
                    const subs = groups.filter(s => s.parent_id === g.id);
                    return (
                      <div key={g.id}>
                        <button
                          onClick={() => handleBatchMove(g.id)}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                        >
                          <span className="text-[11px] shrink-0">{g.icon || '📁'}</span>
                          <span className="truncate" style={{ color: g.color || undefined }}>{g.name}</span>
                        </button>
                        {subs.map(sub => (
                          <button
                            key={sub.id}
                            onClick={() => handleBatchMove(sub.id)}
                            className="flex items-center gap-2 w-full pl-6 pr-2 py-1 rounded text-xs hover:bg-muted transition-colors text-muted-foreground"
                          >
                            <span className="truncate" style={{ color: sub.color || undefined }}>{sub.name}</span>
                          </button>
                        ))}
                      </div>
                    );
                  }}
                />
              </PopoverContent>
            </Popover>

            {/* Add tag */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors">
                  <Tag className="h-3.5 w-3.5" />
                  Тэг
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2 bg-popover border-border z-50" side="bottom">
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">Добавить тэг</p>
                {allTags.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">Нет тэгов</p>
                )}
                {allTags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => handleBatchTag(tag.id)}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors"
                  >
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color || undefined }} />
                    {tag.name}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Batch delete */}
            <ConfirmDelete
              title={`Удалить ${pluralizeRu(selectedIds.size, "задачу", "задачи", "задач")}?`}
              description="Все выбранные задачи и их подзадачи будут удалены безвозвратно."
              onConfirm={handleBatchDelete}
            >
              <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
                Удалить
              </button>
            </ConfirmDelete>
          </div>
        )}

        {/* Project detail panel */}
        {activeView === "group" && activeGroup && projectDetailOpen && (
          <ProjectDetailPanel group={activeGroup} />
        )}

        {/* Filters */}
        {!batchMode && (
          <TaskFiltersBar
            searchValue={searchFilter}
            onSearchChange={setSearchFilter}
            priorityFilter={priorityFilter}
            onPriorityFilterChange={setPriorityFilter}
            assigneeFilter={assigneeFilter}
            onAssigneeFilterChange={setAssigneeFilter}
            projectFilter={projectFilter}
            onProjectFilterChange={setProjectFilter}
            availableUsers={availableUsers}
            groups={groups}
            currentUserId={user?.id}
            activeView={activeView}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            showProtocolTasks={showProtocolTasks}
            onToggleProtocolTasks={() => setShowProtocolTasks(v => !v)}
          />
        )}

        <TaskCreateBar
          inputRef={inputRef}
          activeView={activeView}
          activeGroupId={activeGroupId}
          availableUsers={availableUsers}
          onCreateTask={handleCreateTask}
          bulkButton={
            <Suspense fallback={
              <button type="button" className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground/50 shrink-0 relative" title="Пакетное создание (загрузка...)">
                <Layers className="h-3.5 w-3.5" />
              </button>
            }>
              <BulkTaskDialog projectId={activeView === "group" ? activeGroupId : null} projectName={activeView === "group" ? groups.find(g => g.id === activeGroupId)?.name : undefined}>
                <button type="button" className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/10 transition-colors shrink-0 relative" title="Пакетное создание">
                  <Layers className="h-3.5 w-3.5" />
                  <Sparkles className="h-2 w-2 absolute top-1 right-1 text-primary/70" />
                </button>
              </BulkTaskDialog>
            </Suspense>
          }
        />

        {/* Subprojects dashboard */}
        {activeView === "group" && activeGroupId && (
          <SubprojectCards parentId={activeGroupId} onNavigate={onProjectClick} droppable={activeView === "group"} />
        )}

        {/* Task list */}
        {showTaskSkeleton ? (
          <SkeletonRows count={6} />
        ) : tasksError && tasks.length === 0 ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-5 text-center">
            <p className="text-sm font-medium text-foreground">Не удалось загрузить задачи</p>
            <p className="mt-1 text-xs text-muted-foreground">Проверьте соединение и повторите загрузку.</p>
            <button
              type="button"
              onClick={() => refetchTasks()}
              className="mt-3 inline-flex h-8 items-center justify-center rounded-lg border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              Повторить
            </button>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-20">
            <div className="h-20 w-20 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-5">
              <Inbox className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <p className="text-base font-medium text-muted-foreground">{view.emptyTitle}</p>
            <p className="text-sm text-muted-foreground/60 mt-1.5 max-w-xs mx-auto">{view.emptyDesc}</p>
          </div>
        ) : groupBy !== "none" && groupedSections.length > 0 ? (
          <DndContext
            sensors={groupBy === "project" ? groupedSensors : sensors}
            collisionDetection={pointerWithin}
            onDragOver={groupBy === "project" ? handleGroupedDragOver : undefined}
            onDragEnd={groupBy === "project" ? handleGroupedDragEnd : undefined}
          >
          <div className="space-y-3">
            {groupedSections.map(section => {
              const isCollapsed = collapsedGroups.has(section.key);
              const isProjectGroup = groupBy === "project";
              const isOverdueSection = section.key === "overdue";
              const sectionContent = (
                <div key={section.key} className={cn(
                  isOverdueSection && "rounded-xl border border-destructive/20 bg-destructive/5 p-2"
                )}>
                  <button
                    onClick={() => toggleCollapse(section.key)}
                    className="flex items-center gap-2 w-full px-1 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                    {section.color && (
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: section.color }} />
                    )}
                    <span className={cn("text-xs font-semibold truncate", isOverdueSection ? "text-destructive" : "text-foreground")}>{section.label}</span>
                    <span className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                      isOverdueSection ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                    )}>
                      {section.tasks.length}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-1.5 mt-1 pl-5">
                      {section.tasks.map(task => {
                        const taskItem = (
                          <TaskItem
                            key={task.id}
                            task={task}
                            {...sharedTaskItemProps}
                            initialOpen={task.id === highlightTaskId}
                            onOpened={task.id === highlightTaskId ? onHighlightClear : undefined}
                            onTagClick={onTagClick}
                            onProjectClick={onProjectClick}
                            selectable={batchMode}
                            selected={selectedIds.has(task.id)}
                            onToggleSelect={() => toggleSelect(task.id)}
                            onLongPress={() => toggleSelect(task.id)}
                          />
                        );
                        return isProjectGroup ? (
                          <div key={task.id} className="group/draggable">
                            <DraggableGroupTask taskId={task.id}>
                              {taskItem}
                            </DraggableGroupTask>
                          </div>
                        ) : (
                          <div key={task.id}>{taskItem}</div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );

              return isProjectGroup ? (
                <DroppableGroupSection key={section.key} groupKey={section.key} isOver={groupDragOver === section.key}>
                  {sectionContent}
                </DroppableGroupSection>
              ) : (
                <div key={section.key}>{sectionContent}</div>
              );
            })}
            {completedTasks.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => toggleCollapse("__completed__")}
                  className="flex items-center gap-2 w-full px-1 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", collapsedGroups.has("__completed__") && "-rotate-90")} />
                  <span className="text-xs font-semibold text-muted-foreground">Выполнено</span>
                  <span className="text-[10px] text-muted-foreground font-medium px-1.5 py-0.5 rounded-full bg-muted">
                    {completedTasks.length}
                  </span>
                </button>
                {!collapsedGroups.has("__completed__") && (
                  <div className="space-y-1.5 mt-1">
                    {completedTasks.map(task => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        {...sharedTaskItemProps}
                        initialOpen={task.id === highlightTaskId}
                        onOpened={task.id === highlightTaskId ? onHighlightClear : undefined}
                        onTagClick={onTagClick}
                        onProjectClick={onProjectClick}
                        selectable={batchMode}
                        selected={selectedIds.has(task.id)}
                        onToggleSelect={() => toggleSelect(task.id)}
                        onLongPress={() => toggleSelect(task.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          </DndContext>
        ) : (
          <div className="space-y-1.5">
            {activeTasks.length >= 50 ? (
              <Suspense fallback={
                <div className="space-y-1.5">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              }>
                <VirtualTaskList
                  tasks={activeTasks}
                  scrollParentRef={scrollParentRef}
                  sharedTaskItemProps={sharedTaskItemProps}
                  highlightTaskId={highlightTaskId}
                  onHighlightClear={onHighlightClear}
                  onTagClick={onTagClick}
                  onProjectClick={onProjectClick}
                  selectedIds={selectedIds}
                  toggleSelect={toggleSelect}
                  batchMode={batchMode}
                  onReorder={(next) => reorderTasks.mutate(next)}
                  groupDropContext={activeView === "group" ? "group" : "default"}
                />
              </Suspense>
            ) : (
              <DndContext sensors={sensors} collisionDetection={activeView === "group" ? pointerWithin : closestCenter} onDragEnd={handleDragEnd} modifiers={activeView === "group" ? [] : [restrictToVerticalAxis]}>
                <SortableContext items={activeTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  {activeTasks.map((task, i) => (
                    <div key={task.id} data-task-id={task.id} style={i < 20 ? { animationDelay: `${i * 30}ms` } : undefined} className={i < 20 ? "animate-fade-in" : ""}>
                      <TaskItem
                        task={task}
                        {...sharedTaskItemProps}
                        sortable={!batchMode}
                        initialOpen={task.id === highlightTaskId}
                        onOpened={task.id === highlightTaskId ? onHighlightClear : undefined}
                        onTagClick={onTagClick}
                        onProjectClick={onProjectClick}
                        selectable={batchMode}
                        selected={selectedIds.has(task.id)}
                        onToggleSelect={() => toggleSelect(task.id)}
                        onLongPress={() => toggleSelect(task.id)}
                      />
                    </div>
                  ))}
                </SortableContext>
              </DndContext>
            )}
            {completedTasks.length > 0 && (
              <div className="pt-4">
                <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider px-1 mb-2">
                  Выполнено · {completedTasks.length}
                </p>
                <div className="space-y-1.5">
                  {completedTasks.map(task => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      {...sharedTaskItemProps}
                      initialOpen={task.id === highlightTaskId}
                      onOpened={task.id === highlightTaskId ? onHighlightClear : undefined}
                      onTagClick={onTagClick}
                      onProjectClick={onProjectClick}
                      selectable={batchMode}
                      selected={selectedIds.has(task.id)}
                      onToggleSelect={() => toggleSelect(task.id)}
                      onLongPress={() => toggleSelect(task.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

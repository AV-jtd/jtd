import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useUndo } from "@/hooks/useUndoStack";
import { useTaskGroups, useTasks, useTasksByGroupIds, useTaskMutations, useAvailableUsers, type TaskGroup, type Task } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import { useMilestones, useMilestoneMutations, type Milestone } from "@/hooks/useMilestones";
import { useDependencies, useDependencyMutations } from "@/hooks/useDependencies";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  addDays, differenceInCalendarDays,
  startOfDay, format, isToday, isPast, parseISO, eachDayOfInterval,
  eachWeekOfInterval, eachMonthOfInterval, isWeekend,
  startOfMonth, getMonth, getYear
} from "date-fns";
import { ru } from "date-fns/locale";
import { Minus, Plus, Diamond, FolderPlus, User, LocateFixed, Download, Upload, ArrowLeft, Printer, Sparkles, EyeOff, Eye, MoreHorizontal, BotMessageSquare } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import UndoRedoButtons from "@/components/UndoRedoButtons";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import TaskItem from "@/components/TaskItem";
import SmartImportDialog from "@/components/SmartImportDialog";
import SmartExportDialog from "@/components/SmartExportDialog";
import BulkTaskDialog from "@/components/BulkTaskDialog";
import MilestoneDialog from "@/modules/pmo/components/MilestoneDialog";
import GanttLeftPanel, { type GanttRow, DEFAULT_COLUMNS, type GanttColumnConfig } from "@/modules/pmo/components/GanttLeftPanel";
import { useUserSetting } from "@/hooks/useUserSettings";
import GanttTaskPopover from "@/modules/pmo/components/GanttTaskPopover";
import GanttTooltip from "@/modules/pmo/components/GanttTooltip";
import GanttDependencyLines from "@/modules/pmo/components/GanttDependencyLines";
import DependencyDialog from "@/modules/pmo/components/DependencyDialog";
import { computeCascadeUpdates } from "@/lib/cascadeDependencies";
import { detectViolations, resolveAllViolations, fillMissingDeadlines, type GraphEntity } from "@/lib/dependencyGraph";
import GanttAiPanel from "@/modules/pmo/components/GanttAiPanel";
import { toast } from "sonner";

type Scale = "day" | "week" | "month";

const SCALE_ORDER: Scale[] = ["month", "week", "day"];
const COL_WIDTHS: Record<Scale, number> = { day: 36, week: 120, month: 180 };
const ROW_HEIGHT = 44;
const MILESTONE_ROW_HEIGHT = 28;
const MIN_LEFT_PANEL = 250;
const MAX_LEFT_PANEL = 1200;

export default function GanttView({ initialProjectId, onBack, embedded }: { initialProjectId?: string | null; onBack?: () => void; embedded?: boolean }) {
  const { user } = useAuth();
  const { data: groups = [] } = useTaskGroups();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId || null);
  const visibleGroupIds = useMemo(() => {
    if (!selectedProjectId) return null;
    const ids = new Set<string>([selectedProjectId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const group of groups) {
        if (group.parent_id && ids.has(group.parent_id) && !ids.has(group.id)) {
          ids.add(group.id);
          changed = true;
        }
      }
    }
    return [...ids];
  }, [groups, selectedProjectId]);
  const { data: globalGanttTasks = [] } = useTasks(undefined, undefined, { completedWindowDays: 14, enabled: !visibleGroupIds });
  const { data: projectGanttTasks = [] } = useTasksByGroupIds(visibleGroupIds, { enabled: !!visibleGroupIds });
  const allTasksGlobal = visibleGroupIds ? projectGanttTasks : globalGanttTasks;
  const { data: allMilestones = [] } = useMilestones();
  const { data: allDependencies = [] } = useDependencies();
  const { data: users = [] } = useAvailableUsers();
  const { addMilestone, updateMilestone, deleteMilestone } = useMilestoneMutations();
  const { addGroup, addTask, updateTask, deleteTask, toggleTask, addSubtask, toggleSubtask, updateSubtask, updateGroupParent } = useTaskMutations();
  const { addDependency, updateDependency, deleteDependency } = useDependencyMutations();
  const { pushUndo } = useUndo();
  const queryClient = useQueryClient();

  // STM stage tasks (task_type='stm_stage') скрыты из глобального useTasks(),
  // т.к. они «живут» в матрице /npd/stm. Но в Гантте конкретного STM-проекта
  // их обязательно нужно видеть, чтобы редактировать сроки и пересчитывать каскад.
  const selectedProjectIdForStm = initialProjectId || null;
  const { data: stmStageTasks = [] } = useQuery({
    queryKey: ["gantt-stm-stage-tasks", selectedProjectIdForStm],
    enabled: !!selectedProjectIdForStm,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, task_tags(tag_id), subtasks(*)")
        .eq("group_id", selectedProjectIdForStm!)
        .eq("task_type", "stm_stage");
      if (error) throw error;
      return (data || []) as Task[];
    },
    staleTime: 30 * 1000,
  });

  // Объединяем глобальные задачи + STM stage-задачи выбранного проекта (без дублей).
  const allTasks = useMemo(() => {
    if (!stmStageTasks.length) return allTasksGlobal;
    const seen = new Set(allTasksGlobal.map(t => t.id));
    const extras = stmStageTasks.filter(t => !seen.has(t.id));
    return [...allTasksGlobal, ...extras];
  }, [allTasksGlobal, stmStageTasks]);

  // ── Undoable wrappers ──
  const undoableToggle = useCallback((task: Task) => {
    const prev = task.is_completed;
    toggleTask.mutate({ id: task.id, is_completed: !prev });
    pushUndo({
      label: prev ? `Восстановлено «${task.title}»` : `Завершено «${task.title}»`,
      undo: () => toggleTask.mutate({ id: task.id, is_completed: prev }),
      redo: () => toggleTask.mutate({ id: task.id, is_completed: !prev }),
    });
  }, [toggleTask, pushUndo]);

  const undoableUpdate = useCallback((task: Task, updates: Partial<Task>) => {
    const prevValues: any = {};
    for (const key of Object.keys(updates)) prevValues[key] = (task as any)[key];
    updateTask.mutate({ id: task.id, ...updates });
    const fields: Record<string, string> = { deadline: "срок", description: "описание", title: "название", assigned_to: "ответственный", priority: "приоритет", group_id: "проект", start_at: "дата старта" };
    const changedField = fields[Object.keys(updates)[0]] || Object.keys(updates)[0] || "поле";
    pushUndo({
      label: `${changedField} «${task.title}»`,
      undo: () => updateTask.mutate({ id: task.id, ...prevValues }),
      redo: () => updateTask.mutate({ id: task.id, ...updates }),
    });
  }, [updateTask, pushUndo]);

  const undoableDelete = useCallback((task: Task) => {
    const snap = { ...task };
    deleteTask.mutate(task.id);
    pushUndo({
      label: `Удалено «${task.title}»`,
      undo: async () => {
        const { id, ...rest } = snap;
        await supabase.from("tasks").insert({ ...rest, id });
      },
      redo: () => deleteTask.mutate(snap.id),
    });
  }, [deleteTask, pushUndo]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<Scale>("week");

  // Sync when parent changes the focused project
  useEffect(() => {
    if (initialProjectId) setSelectedProjectId(initialProjectId);
  }, [initialProjectId]);
  const lastPinchDistRef = useRef<number | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [leftPanelWidth, setLeftPanelWidth] = useState(440);
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [tlScrollLeft, setTlScrollLeft] = useState(0);
  const [depStyle, setDepStyle] = useState<"bezier" | "dashed" | "gradient" | "dots">("bezier");
  const [popoverOpenTaskId, setPopoverOpenTaskId] = useState<string | null>(null);
  const [highlightedRowIdx, setHighlightedRowIdx] = useState<number | null>(null);
  const [savedCols, setSavedCols] = useUserSetting<GanttColumnConfig[]>("gantt_columns", DEFAULT_COLUMNS);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  // Cascade highlight: ids of milestones/tasks recently shifted by dependency cascade
  const [cascadeHighlight, setCascadeHighlight] = useState<Set<string>>(new Set());
  const prevMilestoneDatesRef = useRef<Map<string, string>>(new Map());
  const prevTaskDatesRef = useRef<Map<string, { start_at: string | null; deadline: string | null }>>(new Map());

  // Track previous dates so realtime updates can detect cascade shifts
  useEffect(() => {
    const m = new Map<string, string>();
    allMilestones.forEach((ms: any) => m.set(ms.id, ms.planned_date));
    prevMilestoneDatesRef.current = m;
  }, [allMilestones]);
  useEffect(() => {
    const m = new Map<string, { start_at: string | null; deadline: string | null }>();
    allTasks.forEach((t: any) => m.set(t.id, { start_at: t.start_at, deadline: t.deadline }));
    prevTaskDatesRef.current = m;
  }, [allTasks]);

  // Realtime: highlight cascaded shifts (milestones + tasks)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`gantt-cascade-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "project_milestones" }, (payload: any) => {
        const newRow = payload.new;
        const oldDate = prevMilestoneDatesRef.current.get(newRow.id);
        if (oldDate && oldDate !== newRow.planned_date) {
          setCascadeHighlight(prev => {
            const next = new Set(prev);
            next.add(newRow.id);
            return next;
          });
          const oldD = new Date(oldDate);
          const newD = new Date(newRow.planned_date);
          const days = Math.round((newD.getTime() - oldD.getTime()) / 86400000);
          if (days !== 0) {
            toast.info(`🔻 Веха «${newRow.name}» сдвинута на ${days > 0 ? '+' : ''}${days} дн.`, { duration: 4000 });
          }
          setTimeout(() => {
            setCascadeHighlight(prev => {
              const next = new Set(prev);
              next.delete(newRow.id);
              return next;
            });
          }, 2500);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tasks" }, (payload: any) => {
        const newRow = payload.new;
        const prev = prevTaskDatesRef.current.get(newRow.id);
        if (prev && (prev.deadline !== newRow.deadline || prev.start_at !== newRow.start_at)) {
          setCascadeHighlight(p => {
            const next = new Set(p);
            next.add(newRow.id);
            return next;
          });
          setTimeout(() => {
            setCascadeHighlight(p => {
              const next = new Set(p);
              next.delete(newRow.id);
              return next;
            });
          }, 2500);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ── Gate column: build taskId -> gateKey map from task_tags ──
  const NPD_GATE_TAG_NAMES = useMemo(() => [
    { key: "gate0", tagName: "Gate 0: Идея и Стратегия" },
    { key: "gate1", tagName: "Gate 1: Концепция и Экономика" },
    { key: "gate2", tagName: "Gate 2: Разработка и Валидация" },
    { key: "gate3", tagName: "Gate 3: Подготовка к запуску" },
    { key: "gate4", tagName: "Gate 4: Запуск" },
    { key: "gate5", tagName: "Gate 5: Анализ запуска" },
  ], []);

  const { data: gateTagsData } = useQuery({
    queryKey: ["gantt-gate-tags", user?.id],
    queryFn: async () => {
      const names = NPD_GATE_TAG_NAMES.map(g => g.tagName);
      const { data, error } = await supabase.from("tags").select("id, name").in("name", names);
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 30,
  });

  const gateTagIdToKey = useMemo(() => {
    const m = new Map<string, string>();
    if (!gateTagsData) return m;
    for (const tag of gateTagsData) {
      const gate = NPD_GATE_TAG_NAMES.find(g => g.tagName === tag.name);
      if (gate) m.set(tag.id, gate.key);
    }
    return m;
  }, [gateTagsData, NPD_GATE_TAG_NAMES]);

  const gateKeyToTagId = useMemo(() => {
    const m = new Map<string, string>();
    if (!gateTagsData) return m;
    for (const tag of gateTagsData) {
      const gate = NPD_GATE_TAG_NAMES.find(g => g.tagName === tag.name);
      if (gate) m.set(gate.key, tag.id);
    }
    return m;
  }, [gateTagsData, NPD_GATE_TAG_NAMES]);

  const taskGateMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const task of allTasks) {
      if (task.task_tags) {
        for (const tt of task.task_tags) {
          const gateKey = gateTagIdToKey.get(tt.tag_id);
          if (gateKey) { m.set(task.id, gateKey); break; }
        }
      }
    }
    return m;
  }, [allTasks, gateTagIdToKey]);

  const handleChangeTaskGate = useCallback(async (taskId: string, gateKey: string | null) => {
    // Remove existing gate tags
    const gateTagIds = [...gateTagIdToKey.keys()];
    if (gateTagIds.length > 0) {
      await supabase.from("task_tags").delete().eq("task_id", taskId).in("tag_id", gateTagIds);
    }
    // Add new gate tag
    if (gateKey) {
      const tagId = gateKeyToTagId.get(gateKey);
      if (tagId) {
        await supabase.from("task_tags").upsert({ task_id: taskId, tag_id: tagId }, { onConflict: "task_id,tag_id" });
      }
    }
    // Invalidate queries to sync with matrix
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["npd-matrix-tasks"] });
  }, [gateTagIdToKey, gateKeyToTagId, queryClient]);

  // Merge saved config with defaults (in case new columns were added)
  const ganttColumns = useMemo(() => {
    const merged: GanttColumnConfig[] = [];
    const savedMap = new Map(savedCols.map(c => [c.key, c]));
    const defaultMap = new Map(DEFAULT_COLUMNS.map(c => [c.key, c]));
    // Preserve saved order
    for (const sc of savedCols) {
      const def = defaultMap.get(sc.key);
      if (def) merged.push({ ...def, visible: sc.visible, width: sc.width });
    }
    // Add any new default columns not in saved
    for (const dc of DEFAULT_COLUMNS) {
      if (!savedMap.has(dc.key)) merged.push(dc);
    }
    return merged;
  }, [savedCols]);

  const setGanttColumns = useCallback((cols: GanttColumnConfig[]) => {
    setSavedCols(cols);
  }, [setSavedCols]);

  // Milestone dialog state
  const [msDialogOpen, setMsDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  // Drag-resize state (right edge = deadline, left edge = start_at)
  const [dragState, setDragState] = useState<{
    taskId: string;
    startX: number;
    originalDeadline: string;
    side: "end" | "move" | "start";
    originalStartAt?: string;
    originalCreatedAt?: string;
  } | null>(null);
  const [dragDelta, setDragDelta] = useState(0);

  // Milestone drag state (timeline horizontal drag)
  const [msDragState, setMsDragState] = useState<{
    milestoneId: string;
    startX: number;
    originalDate: string;
  } | null>(null);
  const [msDragDelta, setMsDragDelta] = useState(0);

  // Dependency drag state
  const [depDrag, setDepDrag] = useState<{
    fromId: string;
    fromEntityType: "task" | "milestone" | "project";
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const wasDepDragRef = useRef(false);

  // Dependency dialog state
  const [depDialogState, setDepDialogState] = useState<{
    predecessorId: string;
    successorId: string;
    predecessorLabel: string;
    successorLabel: string;
    predecessorEntityType: string;
    successorEntityType: string;
    editMode?: boolean;
    editId?: string;
    initialType?: string;
    initialLag?: number;
  } | null>(null);

  // Splitter drag
  const [splitterDragging, setSplitterDragging] = useState(false);
  const splitterStartRef = useRef<{ x: number; width: number } | null>(null);

  const toggleCollapse = useCallback((projectId: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  const zoomIn = useCallback(() => {
    setScale(prev => {
      const idx = SCALE_ORDER.indexOf(prev);
      return idx < SCALE_ORDER.length - 1 ? SCALE_ORDER[idx + 1] : prev;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setScale(prev => {
      const idx = SCALE_ORDER.indexOf(prev);
      return idx > 0 ? SCALE_ORDER[idx - 1] : prev;
    });
  }, []);

  // Pinch-to-zoom (touch)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDistRef.current = Math.hypot(dx, dy);
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastPinchDistRef.current !== null) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = dist - lastPinchDistRef.current;
        if (Math.abs(delta) > 40) {
          if (delta > 0) zoomIn(); else zoomOut();
          lastPinchDistRef.current = dist;
        }
      }
    };
    const handleTouchEnd = () => { lastPinchDistRef.current = null; };

    // Trackpad pinch-to-zoom (Ctrl+wheel)
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < -2) zoomIn();
        else if (e.deltaY > 2) zoomOut();
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("wheel", handleWheel);
    };
  }, [zoomIn, zoomOut]);

  // Drag handlers (resize deadline OR move whole bar) with cascading
  useEffect(() => {
    if (!dragState) return;
    const handleMouseMove = (e: MouseEvent) => {
      setDragDelta(e.clientX - dragState.startX);
    };
    const handleMouseUp = (e: MouseEvent) => {
      const delta = e.clientX - dragState.startX;
      const daysDelta = Math.round(delta / (COL_WIDTHS[scale] / (scale === "day" ? 1 : scale === "week" ? 7 : 30)));
      if (daysDelta !== 0) {
        const taskUpdates: any = { id: dragState.taskId };

        if (dragState.side === "start") {
          // Resize from left: only change start_at
          const movedTask = allTasks.find(t => t.id === dragState.taskId);
          if (movedTask) {
            const oldStart = movedTask.start_at ? parseISO(movedTask.start_at) : parseISO(movedTask.created_at);
            const newStart = addDays(oldStart, daysDelta).toISOString();
            const prevStart = movedTask.start_at;
            updateTask.mutate({ id: dragState.taskId, start_at: newStart });
            pushUndo({
              label: `дата старта «${movedTask.title}»`,
              undo: () => updateTask.mutate({ id: movedTask.id, start_at: prevStart }),
              redo: () => updateTask.mutate({ id: movedTask.id, start_at: newStart }),
            });
          }
          setDragState(null);
          setDragDelta(0);
          return;
        }

        const oldDeadline = parseISO(dragState.originalDeadline);
        const newDeadline = addDays(oldDeadline, daysDelta);
        taskUpdates.deadline = newDeadline.toISOString();
        
        // When moving the whole bar, also shift start_at
        if (dragState.side === "move") {
          const movedTask = allTasks.find(t => t.id === dragState.taskId);
          if (movedTask) {
            const oldStart = movedTask.start_at ? parseISO(movedTask.start_at) : parseISO(movedTask.created_at);
            taskUpdates.start_at = addDays(oldStart, daysDelta).toISOString();
          }
        }
        
        const movedTaskForUndo = allTasks.find(t => t.id === dragState.taskId);
        const prevDeadline = movedTaskForUndo?.deadline;
        const prevStartAt = movedTaskForUndo?.start_at;
        updateTask.mutate(taskUpdates);
        pushUndo({
          label: `срок «${movedTaskForUndo?.title || "задача"}»`,
          undo: () => updateTask.mutate({ id: dragState.taskId, deadline: prevDeadline, start_at: prevStartAt }),
          redo: () => updateTask.mutate(taskUpdates),
        });

        // Cascading: push forward dependent tasks
        if (daysDelta !== 0 && allDependencies.length > 0) {
          const entityMap = new Map<string, { id: string; deadline?: string | null; start_at?: string | null; created_at: string }>();
          allTasks.forEach(t => entityMap.set(t.id, { id: t.id, deadline: t.deadline, start_at: t.start_at, created_at: t.created_at }));
          // Include milestones and projects for cross-entity cascading
          allMilestones.forEach(m => entityMap.set(m.id, { id: m.id, deadline: m.planned_date, created_at: m.created_at }));
          groups.forEach(g => {
            const gTasks = allTasks.filter(t => t.group_id === g.id);
            const earliest = gTasks.reduce((min, t) => {
              const d = t.created_at;
              return d < min ? d : min;
            }, g.created_at);
            const latest = gTasks.reduce((max, t) => {
              const d = t.deadline || t.created_at;
              return d > max ? d : max;
            }, g.created_at);
            entityMap.set(g.id, { id: g.id, deadline: latest, created_at: earliest });
          });
          // Update the moved task in the map
          entityMap.set(dragState.taskId, { id: dragState.taskId, deadline: newDeadline.toISOString(), created_at: allTasks.find(t => t.id === dragState.taskId)?.created_at || new Date().toISOString() });
          
          const cascadeUpdates = computeCascadeUpdates(dragState.taskId, newDeadline, oldDeadline, allDependencies, entityMap);
          // Apply primary cascade
          cascadeUpdates.forEach((update, entityId) => {
            if (allTasks.some(t => t.id === entityId)) {
              const mutPayload: any = { id: entityId };
              if (update.deadline) mutPayload.deadline = update.deadline;
              if (update.start_at) mutPayload.start_at = update.start_at;
              updateTask.mutate(mutPayload);
            } else if (allMilestones.some(m => m.id === entityId)) {
              if (update.deadline) updateMilestone.mutate({ id: entityId, planned_date: update.deadline });
            }
          });
          // Second pass: resolve any remaining violations across the whole graph
          const work = new Map<string, GraphEntity>();
          allTasks.forEach(t => work.set(t.id, { id: t.id, deadline: t.deadline, start_at: t.start_at }));
          allMilestones.forEach(m => work.set(m.id, { id: m.id, deadline: m.planned_date }));
          // Reflect just-applied updates in the snapshot
          work.set(dragState.taskId, { id: dragState.taskId, deadline: newDeadline.toISOString(), start_at: taskUpdates.start_at });
          cascadeUpdates.forEach((u, eid) => {
            const cur = work.get(eid);
            if (cur) work.set(eid, { ...cur, deadline: u.deadline ?? cur.deadline, start_at: u.start_at ?? cur.start_at });
          });
          const extra = resolveAllViolations(allDependencies, work);
          extra.forEach((u, eid) => {
            if (cascadeUpdates.has(eid) || eid === dragState.taskId) return;
            if (allTasks.some(t => t.id === eid)) {
              const p: any = { id: eid };
              if (u.deadline) p.deadline = u.deadline;
              if (u.start_at) p.start_at = u.start_at;
              updateTask.mutate(p);
            } else if (allMilestones.some(m => m.id === eid)) {
              if (u.deadline) updateMilestone.mutate({ id: eid, planned_date: u.deadline });
            }
          });
        }
      }
      setDragState(null);
      setDragDelta(0);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, scale, updateTask, updateMilestone, allDependencies, allTasks, allMilestones, groups, pushUndo]);

  // Milestone drag handlers (timeline horizontal) — uses ref to avoid TDZ
  const updateMilestoneDateRef = useRef<((ms: Milestone, newDateISO: string) => void) | null>(null);
  useEffect(() => {
    if (!msDragState) return;
    const handleMouseMove = (e: MouseEvent) => {
      setMsDragDelta(e.clientX - msDragState.startX);
    };
    const handleMouseUp = (e: MouseEvent) => {
      const delta = e.clientX - msDragState.startX;
      const daysDelta = Math.round(delta / (COL_WIDTHS[scale] / (scale === "day" ? 1 : scale === "week" ? 7 : 30)));
      if (daysDelta !== 0) {
        const ms = allMilestones.find(m => m.id === msDragState.milestoneId);
        if (ms && updateMilestoneDateRef.current) {
          const newDate = addDays(parseISO(msDragState.originalDate), daysDelta).toISOString();
          updateMilestoneDateRef.current(ms, newDate);
        }
      }
      setMsDragState(null);
      setMsDragDelta(0);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [msDragState, scale, allMilestones]);

  // Dependency drag handlers
  useEffect(() => {
    if (!depDrag) return;
    const handleMouseMove = (e: MouseEvent) => {
      setDepDrag(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
    };
    const handleMouseUp = () => {
      wasDepDragRef.current = true;
      setDepDrag(null);
      // Reset ref after click events have fired
      setTimeout(() => { wasDepDragRef.current = false; }, 0);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [depDrag]);

  // Splitter drag handlers
  useEffect(() => {
    if (!splitterDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (splitterStartRef.current) {
        const delta = e.clientX - splitterStartRef.current.x;
        const newWidth = Math.max(MIN_LEFT_PANEL, Math.min(MAX_LEFT_PANEL, splitterStartRef.current.width + delta));
        setLeftPanelWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setSplitterDragging(false);
      splitterStartRef.current = null;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [splitterDragging]);

  // Compute subtask progress per task
  const taskProgress = useMemo(() => {
    const map = new Map<string, number>();
    allTasks.forEach(t => {
      if (t.subtasks && t.subtasks.length > 0) {
        const done = t.subtasks.filter(s => s.is_completed).length;
        map.set(t.id, (done / t.subtasks.length) * 100);
      } else {
        map.set(t.id, t.is_completed ? 100 : 0);
      }
    });
    return map;
  }, [allTasks]);

  // Critical path calculation
  const criticalTaskIds = useMemo(() => {
    if (allDependencies.length === 0) return new Set<string>();

    // Build adjacency list
    const adj = new Map<string, string[]>();
    const taskSet = new Set<string>();
    allDependencies.forEach(d => {
      taskSet.add(d.predecessor_id);
      taskSet.add(d.successor_id);
      if (!adj.has(d.predecessor_id)) adj.set(d.predecessor_id, []);
      adj.get(d.predecessor_id)!.push(d.successor_id);
    });

    // Find tasks with no predecessors (start nodes)
    const hasPred = new Set(allDependencies.map(d => d.successor_id));
    const startNodes = [...taskSet].filter(id => !hasPred.has(id));

    // Longest path via BFS/DFS
    const dist = new Map<string, number>();
    const prev = new Map<string, string | null>();
    taskSet.forEach(id => { dist.set(id, 0); prev.set(id, null); });

    const taskDuration = (id: string) => {
      const t = allTasks.find(t => t.id === id);
      if (!t) return 1;
      const startDate = t.start_at || t.created_at;
      if (t.deadline && startDate) {
        return Math.max(differenceInCalendarDays(parseISO(t.deadline), parseISO(startDate)), 1);
      }
      return 1;
    };

    // Topological sort + longest path
    const visited = new Set<string>();
    const order: string[] = [];
    const dfs = (node: string) => {
      if (visited.has(node)) return;
      visited.add(node);
      (adj.get(node) || []).forEach(dfs);
      order.push(node);
    };
    startNodes.forEach(dfs);
    // Remaining unvisited (in cycles, skip them)
    taskSet.forEach(id => { if (!visited.has(id)) order.push(id); });
    order.reverse();

    order.forEach(node => {
      const d = (dist.get(node) || 0) + taskDuration(node);
      (adj.get(node) || []).forEach(succ => {
        if (d > (dist.get(succ) || 0)) {
          dist.set(succ, d);
          prev.set(succ, node);
        }
      });
    });

    // Find end node with max distance
    let maxDist = 0;
    let endNode: string | null = null;
    dist.forEach((d, id) => {
      if (d + taskDuration(id) > maxDist) {
        maxDist = d + taskDuration(id);
        endNode = id;
      }
    });

    // Trace back
    const critical = new Set<string>();
    let cur = endNode;
    while (cur) {
      critical.add(cur);
      cur = prev.get(cur) || null;
    }
    return critical;
  }, [allDependencies, allTasks]);

  // Build rows with collapse and summary bars
  const rows: GanttRow[] = useMemo(() => {
    const rootProjects = groups.filter(g => !g.parent_id).sort((a, b) => a.position - b.position);
    const result: GanttRow[] = [];

    const addProjectRows = (project: TaskGroup, depth: number, isDescendant: boolean = false) => {
      if (!isDescendant && selectedProjectId && selectedProjectId !== project.id) return;

      const projectTasks = allTasks
        .filter(t => t.group_id === project.id && !t.is_completed)
        .sort((a, b) => a.position - b.position);
      const allProjectTasks = allTasks.filter(t => t.group_id === project.id);
      const projectMilestones = allMilestones.filter(m => m.group_id === project.id);
      const children = groups.filter(g => g.parent_id === project.id).sort((a, b) => a.position - b.position);

      const hasDatedTasks = projectTasks.some(t => t.deadline || t.created_at);
      const hasChildren = children.length > 0;
      const hasMilestones = projectMilestones.length > 0;

      // Always show descendants (subprojects) even if empty; hide only root-level empty projects
      if (!isDescendant && !hasDatedTasks && !hasChildren && !hasMilestones && selectedProjectId !== project.id) return;

      // Compute project summary dates and progress
      let summaryStart: Date | undefined;
      let summaryEnd: Date | undefined;
      let totalProgress = 0;
      let taskCount = 0;

      allProjectTasks.forEach(t => {
        const start = t.start_at ? startOfDay(parseISO(t.start_at)) : startOfDay(parseISO(t.created_at));
        const end = t.deadline ? startOfDay(parseISO(t.deadline)) : start;
        if (!summaryStart || start < summaryStart) summaryStart = start;
        if (!summaryEnd || end > summaryEnd) summaryEnd = end;
        totalProgress += taskProgress.get(t.id) || 0;
        taskCount++;
      });

      const progress = taskCount > 0 ? totalProgress / taskCount : 0;

      result.push({
        type: "project",
        project,
        depth,
        collapsed: collapsedProjects.has(project.id),
        summaryStart,
        summaryEnd,
        progress,
      });

      if (!collapsedProjects.has(project.id)) {
        const sortedMs = [...projectMilestones].sort((a, b) => {
          if (a.position !== b.position) return a.position - b.position;
          const byDate = a.planned_date.localeCompare(b.planned_date);
          if (byDate !== 0) return byDate;
          return a.created_at.localeCompare(b.created_at);
        });

        sortedMs.forEach((milestone) => {
          result.push({ type: "milestone", project, milestone, depth: depth + 1 });
        });

        const datedTasks = projectTasks.filter(t => t.deadline);

        datedTasks.forEach(t => {
          result.push({ type: "task", project, task: t, depth: depth + 1 });
          if (t.subtasks && t.subtasks.length > 0) {
            t.subtasks
              .sort((a, b) => a.position - b.position)
              .forEach(st => {
                result.push({ type: "subtask", project, subtask: st, parentTask: t, depth: depth + 2 });
              });
          }
        });

        const undatedTasks = projectTasks.filter(t => !t.deadline);
        if (!hideEmpty) {
          undatedTasks.forEach(t => {
            result.push({ type: "task", project, task: t, depth: depth + 1 });
            if (t.subtasks && t.subtasks.length > 0) {
              t.subtasks
                .sort((a, b) => a.position - b.position)
                .forEach(st => {
                  result.push({ type: "subtask", project, subtask: st, parentTask: t, depth: depth + 2 });
                });
            }
          });
        }

        children.forEach(child => addProjectRows(child, depth + 1, true));
      }
    };

    if (selectedProjectId) {
      const proj = groups.find(g => g.id === selectedProjectId);
      if (proj) addProjectRows(proj, 0);
    } else {
      rootProjects.forEach(p => addProjectRows(p, 0));
    }
    // Assign sequential row numbers to tasks/subtasks/milestones
    let counter = 1;
    result.forEach(r => {
      if (r.type === "task" || r.type === "subtask" || r.type === "milestone") {
        r.rowNumber = counter++;
      }
    });
    return result;
  }, [groups, allTasks, allMilestones, selectedProjectId, collapsedProjects, taskProgress, hideEmpty]);

  // ── Multi-select handlers (need rows + handleChangeTaskGate) ──
  const handleToggleSelect = useCallback((taskId: string, shiftKey?: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (shiftKey && prev.size > 0) {
        const taskRowsArr = rows.filter(r => r.type === "task" && r.task);
        const lastId = [...prev].pop()!;
        const lastIdx = taskRowsArr.findIndex(r => r.task!.id === lastId);
        const curIdx = taskRowsArr.findIndex(r => r.task!.id === taskId);
        if (lastIdx >= 0 && curIdx >= 0) {
          const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
          for (let i = start; i <= end; i++) next.add(taskRowsArr[i].task!.id);
          return next;
        }
      }
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, [rows]);

  const handleBulkMove = useCallback((targetGroupId: string) => {
    selectedTaskIds.forEach(id => updateTask.mutate({ id, group_id: targetGroupId }));
    setSelectedTaskIds(new Set());
  }, [selectedTaskIds, updateTask]);

  const handleBulkAssign = useCallback((userId: string | null) => {
    selectedTaskIds.forEach(id => updateTask.mutate({ id, assigned_to: userId }));
    setSelectedTaskIds(new Set());
  }, [selectedTaskIds, updateTask]);

  const handleBulkGate = useCallback((gateKey: string | null) => {
    selectedTaskIds.forEach(id => handleChangeTaskGate(id, gateKey));
    setSelectedTaskIds(new Set());
  }, [selectedTaskIds, handleChangeTaskGate]);

  const handleBulkDelete = useCallback(() => {
    if (!confirm(`Удалить ${selectedTaskIds.size} задач?`)) return;
    selectedTaskIds.forEach(id => deleteTask.mutate(id));
    setSelectedTaskIds(new Set());
  }, [selectedTaskIds, deleteTask]);

  // Заполнить пустые дедлайны по зависимостям и стартам (последовательная цепочка).
  const handleFillDeadlines = useCallback(() => {
    const taskIds = new Set(allTasks.map(t => t.id));
    // Зависимости в рамках текущего набора задач
    const relevantDeps = allDependencies.filter(
      d => taskIds.has(d.predecessor_id) && taskIds.has(d.successor_id),
    );
    if (relevantDeps.length === 0) {
      toast.info("Нет зависимостей между задачами в этом проекте");
      return;
    }
    const entities = new Map<string, GraphEntity>();
    allTasks.forEach(t => entities.set(t.id, { id: t.id, start_at: t.start_at, deadline: t.deadline }));

    const updates = fillMissingDeadlines(relevantDeps as any, entities);
    if (updates.size === 0) {
      toast.info("Пустых дедлайнов для заполнения не найдено");
      return;
    }

    const prev = new Map<string, string | null>();
    for (const [id] of updates) {
      prev.set(id, allTasks.find(t => t.id === id)?.deadline ?? null);
    }
    for (const [id, upd] of updates) {
      updateTask.mutate({ id, deadline: upd.deadline });
    }
    pushUndo({
      label: `Заполнено дедлайнов: ${updates.size}`,
      undo: () => { for (const [id, dl] of prev) updateTask.mutate({ id, deadline: dl }); },
      redo: () => { for (const [id, upd] of updates) updateTask.mutate({ id, deadline: upd.deadline }); },
    });
    toast.success(`Проставлено дедлайнов: ${updates.size}`);
  }, [allTasks, allDependencies, updateTask, pushUndo]);

  // Timeline range
  const { timelineStart, timelineEnd, columns } = useMemo(() => {
    const now = new Date();
    let minDate = addDays(now, -7);
    let maxDate = addDays(now, 30);

    rows.forEach(r => {
      if (r.task) {
        const start = r.task.start_at ? startOfDay(parseISO(r.task.start_at)) : startOfDay(parseISO(r.task.created_at));
        const end = r.task.deadline ? startOfDay(parseISO(r.task.deadline)) : start;
        if (start < minDate) minDate = start;
        if (end > maxDate) maxDate = end;
      }
      if (r.subtask && r.subtask.deadline) {
        const stEnd = startOfDay(parseISO(r.subtask.deadline));
        if (stEnd > maxDate) maxDate = stEnd;
      }
      if (r.milestone) {
        const d = startOfDay(parseISO(r.milestone.planned_date));
        if (d < minDate) minDate = d;
        if (d > maxDate) maxDate = d;
      }
      if (r.summaryStart && r.summaryStart < minDate) minDate = r.summaryStart;
      if (r.summaryEnd && r.summaryEnd > maxDate) maxDate = r.summaryEnd;
    });

    minDate = addDays(startOfDay(minDate), -3);
    maxDate = addDays(startOfDay(maxDate), 7);

    let cols: { date: Date; label: string; isToday: boolean; isWeekend: boolean }[] = [];
    if (scale === "day") {
      cols = eachDayOfInterval({ start: minDate, end: maxDate }).map(d => ({
        date: d, label: format(d, "d", { locale: ru }), isToday: isToday(d), isWeekend: isWeekend(d),
      }));
    } else if (scale === "week") {
      cols = eachWeekOfInterval({ start: minDate, end: maxDate }, { weekStartsOn: 1 }).map(w => ({
        date: w, label: format(w, "d MMM", { locale: ru }), isToday: false, isWeekend: false,
      }));
    } else {
      cols = eachMonthOfInterval({ start: minDate, end: maxDate }).map(m => ({
        date: m, label: format(m, "LLL yyyy", { locale: ru }), isToday: false, isWeekend: false,
      }));
    }
    return { timelineStart: minDate, timelineEnd: maxDate, columns: cols };
  }, [rows, scale]);

  const colWidth = COL_WIDTHS[scale];
  const totalWidth = columns.length * colWidth;
  const totalDays = differenceInCalendarDays(timelineEnd, timelineStart) || 1;

  // Compute month group headers
  const monthGroups = useMemo(() => {
    const now = new Date();
    const curMonth = getMonth(now);
    const curYear = getYear(now);
    const groups: { label: string; span: number; key: string; isCurrent: boolean }[] = [];
    let currentKey = "";
    columns.forEach(col => {
      const m = getMonth(col.date);
      const y = getYear(col.date);
      const key = y + "-" + m;
      if (key !== currentKey) {
        const label = format(startOfMonth(col.date), scale === "day" ? "LLLL yyyy" : "LLL yyyy", { locale: ru });
        groups.push({ label, span: 1, key, isCurrent: m === curMonth && y === curYear });
        currentKey = key;
      } else {
        groups[groups.length - 1].span++;
      }
    });
    return groups;
  }, [columns, scale]);

  const getBarStyle = useCallback((task: Task) => {
    const start = task.start_at ? startOfDay(parseISO(task.start_at)) : startOfDay(parseISO(task.created_at));
    const deadline = task.deadline ? startOfDay(parseISO(task.deadline)) : start;
    const barStart = start < deadline ? start : deadline;
    const barEnd = start < deadline ? deadline : addDays(start, 1);
    const startOffset = differenceInCalendarDays(barStart, timelineStart);
    const duration = Math.max(differenceInCalendarDays(barEnd, barStart), 1);
    return { left: (startOffset / totalDays) * totalWidth, width: Math.max((duration / totalDays) * totalWidth, 8) };
  }, [timelineStart, totalDays, totalWidth]);

  const getSummaryBarStyle = useCallback((start: Date, end: Date) => {
    const startOffset = differenceInCalendarDays(start, timelineStart);
    const duration = Math.max(differenceInCalendarDays(end, start), 1);
    return { left: (startOffset / totalDays) * totalWidth, width: Math.max((duration / totalDays) * totalWidth, 16) };
  }, [timelineStart, totalDays, totalWidth]);

  const getBaselineStyle = useCallback((task: Task) => {
    if (!task.original_deadline || !task.deadline || task.original_deadline === task.deadline) return null;
    const start = task.start_at ? startOfDay(parseISO(task.start_at)) : startOfDay(parseISO(task.created_at));
    const origDeadline = startOfDay(parseISO(task.original_deadline));
    const barStart = start < origDeadline ? start : origDeadline;
    const barEnd = start < origDeadline ? origDeadline : addDays(start, 1);
    const startOffset = differenceInCalendarDays(barStart, timelineStart);
    const duration = Math.max(differenceInCalendarDays(barEnd, barStart), 1);
    return { left: (startOffset / totalDays) * totalWidth, width: Math.max((duration / totalDays) * totalWidth, 8) };
  }, [timelineStart, totalDays, totalWidth]);

  // Get drift overlay: the portion between original_deadline and current deadline (amber highlight)
  const getDriftOverlay = useCallback((task: Task) => {
    if (!task.original_deadline || !task.deadline || task.original_deadline === task.deadline) return null;
    const origDeadline = startOfDay(parseISO(task.original_deadline));
    const curDeadline = startOfDay(parseISO(task.deadline));
    // Only show drift when deadline was pushed forward
    if (curDeadline <= origDeadline) return null;
    const barStyle = getBarStyle(task);
    const origOffset = differenceInCalendarDays(origDeadline, timelineStart);
    const origPx = (origOffset / totalDays) * totalWidth;
    // Drift overlay starts at original_deadline relative to bar left
    const driftLeft = origPx - barStyle.left;
    const driftWidth = barStyle.width - driftLeft;
    if (driftWidth <= 0) return null;
    return { left: driftLeft, width: driftWidth };
  }, [timelineStart, totalDays, totalWidth, getBarStyle]);

  const getMilestoneX = (ms: Milestone) => {
    const d = startOfDay(parseISO(ms.planned_date));
    const offset = differenceInCalendarDays(d, timelineStart);
    return (offset / totalDays) * totalWidth;
  };

  const getMilestoneOffscreen = useCallback((ms: Milestone): 'left' | 'right' | null => {
    const x = getMilestoneX(ms);
    const el = scrollRef.current;
    if (!el) return null;
    if (x < tlScrollLeft) return 'left';
    const visibleW = (el.clientWidth || 400) - leftPanelWidth - 6;
    if (x > tlScrollLeft + visibleW) return 'right';
    return null;
  }, [getMilestoneX, tlScrollLeft]);

  // Build entity map for cascade calculations (tasks + milestones + projects)
  const buildEntityMap = useCallback(() => {
    const m = new Map<string, { id: string; deadline?: string | null; start_at?: string | null; created_at: string }>();
    allTasks.forEach(t => m.set(t.id, { id: t.id, deadline: t.deadline, start_at: t.start_at, created_at: t.created_at }));
    allMilestones.forEach(ms => m.set(ms.id, { id: ms.id, deadline: ms.planned_date, created_at: ms.created_at }));
    return m;
  }, [allTasks, allMilestones]);

  // Apply cascade updates: dispatch to tasks or milestones, then auto-resolve any
  // remaining dependency violations across the whole graph (preserves duration).
  const applyCascade = useCallback((updates: Map<string, { deadline?: string; start_at?: string }>) => {
    // Build a working entity snapshot reflecting both current state and the new updates
    const work = new Map<string, GraphEntity>();
    allTasks.forEach(t => work.set(t.id, { id: t.id, deadline: t.deadline, start_at: t.start_at }));
    allMilestones.forEach(ms => work.set(ms.id, { id: ms.id, deadline: ms.planned_date }));

    updates.forEach((upd, entityId) => {
      if (allTasks.some(t => t.id === entityId)) {
        const payload: any = { id: entityId };
        if (upd.deadline) payload.deadline = upd.deadline;
        if (upd.start_at) payload.start_at = upd.start_at;
        updateTask.mutate(payload);
        const cur = work.get(entityId);
        if (cur) work.set(entityId, { ...cur, deadline: upd.deadline ?? cur.deadline, start_at: upd.start_at ?? cur.start_at });
      } else if (allMilestones.some(ms => ms.id === entityId)) {
        if (upd.deadline) {
          updateMilestone.mutate({ id: entityId, planned_date: upd.deadline });
          work.set(entityId, { id: entityId, deadline: upd.deadline });
        }
      }
    });

    // Second pass: resolve any remaining violations (e.g. tasks not on the original
    // cascade path that are now violated). Preserves duration.
    const extra = resolveAllViolations(allDependencies, work);
    extra.forEach((upd, entityId) => {
      if (updates.has(entityId)) return; // already applied above
      if (allTasks.some(t => t.id === entityId)) {
        const payload: any = { id: entityId };
        if (upd.deadline) payload.deadline = upd.deadline;
        if (upd.start_at) payload.start_at = upd.start_at;
        updateTask.mutate(payload);
      } else if (allMilestones.some(ms => ms.id === entityId)) {
        if (upd.deadline) updateMilestone.mutate({ id: entityId, planned_date: upd.deadline });
      }
    });
  }, [allTasks, allMilestones, updateTask, updateMilestone, allDependencies]);

  // Cascade-aware milestone date change with undo
  const updateMilestoneDate = useCallback((milestone: Milestone, newDateISO: string) => {
    const oldDate = parseISO(milestone.planned_date);
    const newDate = parseISO(newDateISO);
    if (oldDate.getTime() === newDate.getTime()) return;

    updateMilestone.mutate({ id: milestone.id, planned_date: newDateISO });

    // Cascade to dependent entities
    const entityMap = buildEntityMap();
    entityMap.set(milestone.id, { id: milestone.id, deadline: newDateISO, created_at: milestone.created_at });
    const cascade = computeCascadeUpdates(milestone.id, newDate, oldDate, allDependencies, entityMap);
    applyCascade(cascade);

    // Undo: snapshot affected entities and restore
    const snapshots: { type: "task" | "milestone"; id: string; deadline?: string | null; start_at?: string | null }[] = [];
    cascade.forEach((_, entityId) => {
      const t = allTasks.find(x => x.id === entityId);
      if (t) snapshots.push({ type: "task", id: t.id, deadline: t.deadline, start_at: t.start_at });
      const ms = allMilestones.find(x => x.id === entityId);
      if (ms) snapshots.push({ type: "milestone", id: ms.id, deadline: ms.planned_date });
    });

    pushUndo({
      label: `веха «${milestone.name}»`,
      undo: () => {
        updateMilestone.mutate({ id: milestone.id, planned_date: milestone.planned_date });
        snapshots.forEach(s => {
          if (s.type === "task") updateTask.mutate({ id: s.id, deadline: s.deadline, start_at: s.start_at });
          else updateMilestone.mutate({ id: s.id, planned_date: s.deadline! });
        });
      },
      redo: () => {
        updateMilestone.mutate({ id: milestone.id, planned_date: newDateISO });
        applyCascade(cascade);
      },
    });
  }, [updateMilestone, updateTask, buildEntityMap, applyCascade, allDependencies, allTasks, allMilestones, pushUndo]);

  // Sync ref so the milestone-drag effect can call cascade-aware updater
  useEffect(() => { updateMilestoneDateRef.current = updateMilestoneDate; }, [updateMilestoneDate]);

  // Detect dependency violations (entity ids that violate at least one predecessor link)
  const violationIds = useMemo(() => {
    const m = new Map<string, { id: string; deadline?: string | null; start_at?: string | null }>();
    allTasks.forEach(t => m.set(t.id, { id: t.id, deadline: t.deadline, start_at: t.start_at }));
    allMilestones.forEach(ms => m.set(ms.id, { id: ms.id, deadline: ms.planned_date, start_at: ms.planned_date }));
    return detectViolations(allDependencies, m);
  }, [allTasks, allMilestones, allDependencies]);

  const todayOffset = useMemo(() => {
    const offset = differenceInCalendarDays(new Date(), timelineStart);
    return (offset / totalDays) * totalWidth;
  }, [timelineStart, totalDays, totalWidth]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(todayOffset - 300, 0);
    }
  }, [todayOffset]);

  const rootProjects = groups.filter(g => !g.parent_id).sort((a, b) => a.position - b.position);

  // Handle drop on a task/milestone bar to create dependency (opens dialog)
  const getEntityLabel = useCallback((id: string, entityType: string) => {
    if (entityType === "task") return allTasks.find(t => t.id === id)?.title || "Задача";
    if (entityType === "milestone") return allMilestones.find(m => m.id === id)?.name || "Веха";
    if (entityType === "project") return groups.find(g => g.id === id)?.name || "Проект";
    return "—";
  }, [allTasks, allMilestones, groups]);

  const handleBarMouseUp = useCallback((targetId: string, targetEntityType: "task" | "milestone" | "project" = "task") => {
    if (depDrag && depDrag.fromId !== targetId) {
      setDepDialogState({
        predecessorId: depDrag.fromId,
        successorId: targetId,
        predecessorLabel: getEntityLabel(depDrag.fromId, depDrag.fromEntityType),
        successorLabel: getEntityLabel(targetId, targetEntityType),
        predecessorEntityType: depDrag.fromEntityType,
        successorEntityType: targetEntityType,
      });
      setDepDrag(null);
    }
  }, [depDrag, getEntityLabel]);

  // Unique assignees for filter
  const assignees = useMemo(() => {
    const ids = new Set(allTasks.filter(t => t.assigned_to).map(t => t.assigned_to!));
    return users.filter(u => ids.has(u.id));
  }, [allTasks, users]);

  const getRowHeight = useCallback((i: number) => rows[i]?.type === "milestone" ? MILESTONE_ROW_HEIGHT : ROW_HEIGHT, [rows]);
  const rowTops = useMemo(() => {
    const tops: number[] = [];
    let acc = 0;
    for (let i = 0; i < rows.length; i++) {
      tops.push(acc);
      acc += rows[i].type === "milestone" ? MILESTONE_ROW_HEIGHT : ROW_HEIGHT;
    }
    return tops;
  }, [rows]);
  const totalRowsHeight = useMemo(() => {
    if (rows.length === 0) return 0;
    return rowTops[rows.length - 1] + getRowHeight(rows.length - 1);
  }, [rows, rowTops, getRowHeight]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* AI Panel */}
      <GanttAiPanel
        open={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
        tasks={allTasks}
        groups={groups}
        milestones={allMilestones}
        dependencies={allDependencies}
        users={users}
        selectedProjectId={selectedProjectId}
      />

      <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar — compact single row */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-card shrink-0">
        {/* AI toggle */}
        <button
          onClick={() => setAiPanelOpen(prev => !prev)}
          className={cn(
            "p-1.5 rounded-md transition-colors",
            aiPanelOpen
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title="ИИ-помощник Гантта"
        >
          <BotMessageSquare className="h-3.5 w-3.5" />
        </button>

        <div className="h-4 w-px bg-border shrink-0" />
        {!embedded && onBack && (
          <button onClick={onBack} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Портфель">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Scale switcher */}
        <div className="flex items-center bg-muted rounded-md p-0.5">
          {(["day", "week", "month"] as Scale[]).map(s => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={cn(
                "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                scale === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "day" ? "День" : s === "week" ? "Нед" : "Мес"}
            </button>
          ))}
        </div>

        {/* Zoom & Today */}
        <div className="flex items-center">
          <button onClick={zoomOut} disabled={scale === "month"}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Уменьшить масштаб"><Minus className="h-3 w-3" /></button>
          <button onClick={zoomIn} disabled={scale === "day"}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Увеличить масштаб"><Plus className="h-3 w-3" /></button>
          <button
            onClick={() => { scrollRef.current?.scrollTo({ left: Math.max(todayOffset - 300, 0), behavior: "smooth" }); }}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="К сегодняшнему дню"
          >
            <LocateFixed className="h-3 w-3" />
          </button>
        </div>

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Project & Assignee selects */}
        <select
          value={selectedProjectId || ""}
          onChange={e => setSelectedProjectId(e.target.value || null)}
          className="text-xs bg-muted border-0 rounded-md px-2 py-1 text-foreground outline-none cursor-pointer max-w-[160px] truncate"
        >
          <option value="">Все проекты</option>
          {rootProjects.map(p => (
            <option key={p.id} value={p.id}>{p.icon && p.icon !== "list" ? `${p.icon} ` : ""}{p.name}</option>
          ))}
        </select>

        <select
          value={filterAssignee || ""}
          onChange={e => setFilterAssignee(e.target.value || null)}
          className="text-xs bg-muted border-0 rounded-md px-2 py-1 text-foreground outline-none cursor-pointer max-w-[120px] truncate"
        >
          <option value="">👤 Все</option>
          {assignees.map(u => (
            <option key={u.id} value={u.id}>{u.display_name || u.email}</option>
          ))}
        </select>

        {/* Hide empty toggle - inline since it's a frequent action */}
        {hideEmpty && (
          <button
            onClick={() => setHideEmpty(false)}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary transition-colors"
            title="Показать пустые задачи"
          >
            <Eye className="h-3 w-3" />
          </button>
        )}

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Minimap — takes remaining space */}
        {(() => {
          const el = scrollRef.current;
          const viewportW = Math.max((el?.clientWidth || 400) - leftPanelWidth - 6, 100);
          const vpStart = tlScrollLeft;
          const vpEnd = vpStart + viewportW;
          const vpLeftPct = totalWidth > 0 ? (vpStart / totalWidth) * 100 : 0;
          const vpWidthPct = totalWidth > 0 ? Math.min((viewportW / totalWidth) * 100, 100) : 100;
          const msRows = rows.map((r, i) => r.type === "milestone" && r.milestone ? { ...r, idx: i } : null).filter(Boolean) as (typeof rows[0] & { idx: number })[];
          const msOffscreenRight = msRows.filter(r => {
            const x = getMilestoneX(r.milestone!);
            return x > vpEnd;
          }).length;
          const overdueTasks = rows.filter(r => r.type === "task" && r.task?.deadline && isPast(parseISO(r.task.deadline)) && !r.task.is_completed);

          return (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <div
                className="relative flex-1 rounded cursor-pointer overflow-hidden"
                style={{ height: 16, backgroundColor: "hsl(var(--muted))" }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickPct = (e.clientX - rect.left) / rect.width;
                  const targetScroll = clickPct * totalWidth - viewportW / 2;
                  scrollRef.current?.scrollTo({ left: Math.max(0, targetScroll), behavior: "smooth" });
                }}
              >
                <div
                  className="absolute top-0 bottom-0 rounded-sm"
                  style={{ left: `${vpLeftPct}%`, width: `${vpWidthPct}%`, backgroundColor: "rgba(124,58,237,0.2)", border: "1px solid #7C3AED" }}
                />
                {totalWidth > 0 && (
                  <div className="absolute top-0 bottom-0 w-px" style={{ left: `${(todayOffset / totalWidth) * 100}%`, backgroundColor: "hsl(var(--primary))" }} />
                )}
                {msRows.map(r => {
                  const x = getMilestoneX(r.milestone!);
                  const pct = totalWidth > 0 ? (x / totalWidth) * 100 : 0;
                  return (
                    <div
                      key={r.milestone!.id}
                      className="absolute top-1/2 -translate-y-1/2 cursor-pointer z-10 hover:scale-150 transition-transform"
                      style={{ left: `${pct}%` }}
                      title={`${r.milestone!.name} — ${format(parseISO(r.milestone!.planned_date), "d MMM", { locale: ru })}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        scrollRef.current?.scrollTo({ left: Math.max(0, x - viewportW / 2), behavior: "smooth" });
                        setHighlightedRowIdx(r.idx);
                        setTimeout(() => setHighlightedRowIdx(null), 2000);
                      }}
                    >
                      <Diamond className="h-[6px] w-[6px] fill-[#EF4444] text-[#EF4444]" />
                    </div>
                  );
                })}
              </div>
              {msOffscreenRight > 0 && (
                <span className="text-[10px] text-destructive whitespace-nowrap shrink-0">{msOffscreenRight} вех →</span>
              )}
              <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                {rows.filter(r => r.type === "task").length}з · {rows.filter(r => r.type === "milestone").length}в
              </span>
            </div>
          );
        })()}

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Add milestone – always visible */}
        <button
          onClick={() => { setEditingMilestone(null); setMsDialogOpen(true); }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors shrink-0"
          title="Добавить веху"
        >
          <Diamond className="h-3 w-3 fill-primary" />
          <span className="hidden sm:inline">Веха</span>
        </button>

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Undo/Redo */}
        <UndoRedoButtons />

        {/* Actions overflow menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => { setEditingMilestone(null); setMsDialogOpen(true); }}>
              <Diamond className="h-3.5 w-3.5 mr-2 text-primary" />
              Добавить веху
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setHideEmpty(prev => !prev)}>
              {hideEmpty ? <Eye className="h-3.5 w-3.5 mr-2" /> : <EyeOff className="h-3.5 w-3.5 mr-2" />}
              {hideEmpty ? "Показать пустые" : "Скрыть пустые"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs">
                〰 Стиль связей
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {([
                  { v: "bezier" as const, l: "〰 Кривые" },
                  { v: "dashed" as const, l: "┅ Пунктир" },
                  { v: "gradient" as const, l: "🌈 Градиент" },
                  { v: "dots" as const, l: "● Точки" },
                ] as const).map(s => (
                  <DropdownMenuItem key={s.v} onClick={() => setDepStyle(s.v)} className={cn(depStyle === s.v && "bg-accent")}>
                    {s.l}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowNewProject(true)}>
              <FolderPlus className="h-3.5 w-3.5 mr-2" />
              Новый проект
            </DropdownMenuItem>
            {selectedProjectId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <span onClick={(e) => {
                    e.preventDefault();
                    const btn = document.getElementById("gantt-export-trigger");
                    btn?.click();
                  }}>
                    <Download className="h-3.5 w-3.5 mr-2" />
                    Excel экспорт
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <span onClick={(e) => {
                    e.preventDefault();
                    const btn = document.getElementById("gantt-import-trigger");
                    btn?.click();
                  }}>
                    <Upload className="h-3.5 w-3.5 mr-2" />
                    Импорт
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <span onClick={(e) => {
                    e.preventDefault();
                    const btn = document.getElementById("gantt-bulk-trigger");
                    btn?.click();
                  }}>
                    <Sparkles className="h-3.5 w-3.5 mr-2" />
                    Пакетное создание
                  </span>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => {
              const printWindow = window.open("", "_blank");
              if (!printWindow) return;
              const projectName = selectedProjectId
                ? rootProjects.find(p => p.id === selectedProjectId)?.name || "Проект"
                : "Все проекты";
              const dateStr = format(new Date(), "d MMMM yyyy", { locale: ru });
              let tableRows = "";
              rows.forEach(r => {
                const indent = "\u00A0\u00A0".repeat(r.depth);
                if (r.type === "project") {
                  tableRows += "<tr style=\"background:#f0f0f0;font-weight:600\"><td>" + (r.rowNumber ?? "") + "</td><td>" + indent + (r.project.icon || "📁") + " " + r.project.name + "</td><td></td><td></td><td></td><td>" + (r.progress !== undefined ? Math.round(r.progress) + "%" : "") + "</td></tr>";
                } else if (r.type === "task" && r.task) {
                  const a = users.find(u => u.id === r.task!.assigned_to);
                  const drift = r.task.original_deadline && r.task.deadline && r.task.original_deadline !== r.task.deadline;
                  const driftLabel = drift ? " <span style=\"color:#d97706\">⚠️</span>" : "";
                  tableRows += "<tr><td style=\"text-align:center;color:#888\">" + (r.rowNumber ?? "") + "</td><td>" + indent + (r.task.is_completed ? "✅" : "☐") + " " + r.task.title + driftLabel + "</td><td>" + (a?.display_name || a?.email || "") + "</td><td>" + (r.task.start_at ? format(parseISO(r.task.start_at), "dd.MM") : "") + "</td><td>" + (r.task.deadline ? format(parseISO(r.task.deadline), "dd.MM.yyyy") : "") + "</td><td></td></tr>";
                } else if (r.type === "subtask" && r.subtask) {
                  tableRows += "<tr style=\"color:#888\"><td style=\"text-align:center\">" + (r.rowNumber ?? "") + "</td><td>" + indent + "\u00A0\u00A0↳ " + r.subtask.title + "</td><td></td><td></td><td>" + (r.subtask.deadline ? format(parseISO(r.subtask.deadline), "dd.MM") : "") + "</td><td></td></tr>";
                } else if (r.type === "milestone" && r.milestone) {
                  tableRows += "<tr style=\"color:#3b82f6;font-style:italic\"><td style=\"text-align:center\">" + (r.rowNumber ?? "") + "</td><td>" + indent + "◆ " + r.milestone.name + "</td><td></td><td></td><td>" + format(parseISO(r.milestone.planned_date), "dd.MM.yyyy") + "</td><td></td></tr>";
                }
              });
              const html = "<!DOCTYPE html><html><head><title>Гантт: " + projectName + "</title>" +
                "<style>@page{size:landscape;margin:10mm}body{font-family:system-ui,-apple-system,sans-serif;font-size:11px;color:#222;margin:16px}" +
                "h1{font-size:16px;margin:0 0 4px}h2{font-size:11px;color:#888;margin:0 0 12px;font-weight:normal}" +
                "table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left}" +
                "th{background:#f5f5f5;font-size:10px;text-transform:uppercase;color:#666}" +
                "tr:nth-child(even){background:#fafafa}" +
                "@media print{body{margin:0}}</style></head>" +
                "<body><h1>" + projectName + "</h1><h2>Диаграмма Ганта · " + dateStr + "</h2>" +
                "<table><thead><tr><th style=\"width:30px\">#</th><th>Задача</th><th style=\"width:120px\">Ответственный</th><th style=\"width:60px\">Старт</th><th style=\"width:80px\">Срок</th><th style=\"width:60px\">Прогресс</th></tr></thead>" +
                "<tbody>" + tableRows + "</tbody></table>" +
                "<script>setTimeout(function(){window.print()},300)</" + "script></body></html>";
              printWindow.document.write(html);
              printWindow.document.close();
            }}>
              <Printer className="h-3.5 w-3.5 mr-2" />
              Печать
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Hidden triggers for dialogs triggered from dropdown */}
        {selectedProjectId && (
          <div className="hidden">
            <SmartExportDialog
              groupId={selectedProjectId}
              groupName={rootProjects.find(p => p.id === selectedProjectId)?.name || "Проект"}
              trigger={<button id="gantt-export-trigger" />}
            />
            <SmartImportDialog
              targetGroupId={selectedProjectId}
              trigger={<button id="gantt-import-trigger" />}
            />
            <BulkTaskDialog
              projectId={selectedProjectId}
              projectName={rootProjects.find(p => p.id === selectedProjectId)?.name}
            >
              <button id="gantt-bulk-trigger" />
            </BulkTaskDialog>
          </div>
        )}

        {/* Inline new project form (appears when triggered from menu) */}
        {showNewProject && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newProjectName.trim()) {
                addGroup.mutate({ name: newProjectName.trim() }, {
                  onSuccess: (data: any) => { if (data?.id) setSelectedProjectId(data.id); }
                });
                setNewProjectName("");
                setShowNewProject(false);
              }
            }}
            className="absolute top-12 right-4 z-50 flex items-center gap-1 bg-popover border border-border rounded-lg shadow-lg p-2"
          >
            <input
              autoFocus
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onBlur={() => { if (!newProjectName.trim()) setShowNewProject(false); }}
              onKeyDown={e => { if (e.key === "Escape") { setShowNewProject(false); setNewProjectName(""); } }}
              placeholder="Имя проекта..."
              className="h-7 w-40 text-xs bg-muted border-0 rounded px-2 text-foreground outline-none"
            />
          </form>
        )}
      </div>

      {/* Bulk action toolbar */}
      {selectedTaskIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-primary/20 bg-primary/5 shrink-0 text-xs animate-in slide-in-from-top-1">
          <span className="font-medium text-primary">{selectedTaskIds.size} выбрано</span>
          <div className="h-3 w-px bg-border" />
          
          {/* Move to stream */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="px-2 py-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                📂 Переместить
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-64 overflow-y-auto">
              {groups.filter(g => !g.parent_id).map(p => (
                <div key={p.id}>
                  <DropdownMenuItem onClick={() => handleBulkMove(p.id)} className="font-medium">
                    {p.icon && p.icon !== "list" ? p.icon : "📁"} {p.name}
                  </DropdownMenuItem>
                  {groups.filter(c => c.parent_id === p.id).map(child => (
                    <DropdownMenuItem key={child.id} onClick={() => handleBulkMove(child.id)} className="pl-6">
                      {child.icon && child.icon !== "list" ? child.icon : "📂"} {child.name}
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="px-2 py-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                👤 Назначить
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleBulkAssign(null)}>Без назначения</DropdownMenuItem>
              <DropdownMenuSeparator />
              {users.map(u => (
                <DropdownMenuItem key={u.id} onClick={() => handleBulkAssign(u.id)}>
                  {u.display_name || u.email}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Gate */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="px-2 py-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                🔷 Гейт
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleBulkGate(null)}>Без гейта</DropdownMenuItem>
              <DropdownMenuSeparator />
              {[
                { key: "gate0", label: "G0 Идея" },
                { key: "gate1", label: "G1 Концепция" },
                { key: "gate2", label: "G2 Разработка" },
                { key: "gate3", label: "G3 Подготовка" },
                { key: "gate4", label: "G4 Запуск" },
                { key: "gate5", label: "G5 Анализ" },
              ].map(g => (
                <DropdownMenuItem key={g.key} onClick={() => handleBulkGate(g.key)}>
                  {g.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-3 w-px bg-border" />
          <button onClick={handleBulkDelete} className="px-2 py-1 rounded-md text-destructive hover:bg-destructive/10 transition-colors">
            Удалить
          </button>
          <button onClick={() => setSelectedTaskIds(new Set())} className="ml-auto px-2 py-1 rounded-md hover:bg-muted transition-colors text-muted-foreground">
            ✕ Снять
          </button>
        </div>
      )}

      {/* Gantt body — unified scroll container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto scrollbar-thin"
        style={{ overscrollBehavior: "auto", touchAction: "pan-x pan-y" }}
        onScroll={(e) => {
          const el = e.target as HTMLDivElement;
          setTlScrollLeft(el.scrollLeft);
        }}
      >
        <div className="flex" style={{ width: leftPanelWidth + 6 + totalWidth, minHeight: "100%" }}>
          {/* Left panel — sticky left so it stays visible during horizontal scroll */}
          <div className="sticky left-0 z-20 shrink-0 bg-card" style={{ width: leftPanelWidth }}>
            <GanttLeftPanel
              rows={rows}
              rowHeight={ROW_HEIGHT}
              getRowHeight={getRowHeight}
              width={leftPanelWidth}
              allProjects={groups}
              dependencies={allDependencies}
              columns={ganttColumns}
              onColumnsChange={setGanttColumns}
              onMilestoneClick={(ms) => { setEditingMilestone(ms); setMsDialogOpen(true); }}
              onAddTask={(projectId, title) => {
                addTask.mutate({ title, group_id: projectId });
              }}
              onAddSubproject={(parentId, name) => {
                addGroup.mutate({ name, parent_id: parentId });
              }}
              onAddSubtask={(taskId, title) => {
                addSubtask.mutate({ task_id: taskId, title });
              }}
              onUpdateTask={(id, updates) => {
                const task = allTasks.find(t => t.id === id);
                if (task) undoableUpdate(task, updates);
                else updateTask.mutate({ id, ...updates });
              }}
              onToggleTask={(id, completed) => {
                const task = allTasks.find(t => t.id === id);
                if (task) undoableToggle(task);
                else toggleTask.mutate({ id, is_completed: completed });
              }}
              onUpdateSubtask={(id, updates) => {
                updateSubtask.mutate({ id, ...updates });
              }}
              onToggleSubtask={(id, completed) => {
                toggleSubtask.mutate({ id, is_completed: completed });
              }}
              onMoveTask={(taskId, newGroupId) => {
                const task = allTasks.find(t => t.id === taskId);
                if (task) undoableUpdate(task, { group_id: newGroupId });
                else updateTask.mutate({ id: taskId, group_id: newGroupId });
              }}



              onMoveProject={(projectId, newParentId) => {
                updateGroupParent.mutate({ id: projectId, parent_id: newParentId });
              }}
              onReorderTask={(taskId, newPosition, newGroupId) => {
                updateTask.mutate({ id: taskId, position: newPosition, group_id: newGroupId });
              }}
              onOpenTask={(taskId) => setSelectedTaskId(taskId)}
              onCreateDependency={(predecessorId, successorId, predEntityType, succEntityType) => {
                const predType = predEntityType || "task";
                const succType = succEntityType || "task";
                setDepDialogState({
                  predecessorId,
                  successorId,
                  predecessorLabel: getEntityLabel(predecessorId, predType),
                  successorLabel: getEntityLabel(successorId, succType),
                  predecessorEntityType: predType,
                  successorEntityType: succType,
                });
              }}
              collapsedProjects={collapsedProjects}
              onToggleCollapse={toggleCollapse}
              filterAssignee={filterAssignee}
              hoveredRow={hoveredRow}
              onHoverRow={setHoveredRow}
              onUpdateMilestone={(id, updates) => updateMilestone.mutate({ id, ...updates })}
              scrollContainerRef={scrollRef}
              getMilestoneOffscreen={getMilestoneOffscreen}
              taskGateMap={taskGateMap}
              onChangeTaskGate={handleChangeTaskGate}
              selectedTaskIds={selectedTaskIds}
              onToggleSelect={handleToggleSelect}
            />
          </div>

          {/* Draggable splitter — sticky to stay next to left panel */}
          <div
            className={cn(
              "shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors relative group/splitter sticky z-[15] bg-card",
              splitterDragging && "bg-primary/50"
            )}
            style={{ left: leftPanelWidth, width: 6 }}
            onMouseDown={(e) => {
              e.preventDefault();
              setSplitterDragging(true);
              splitterStartRef.current = { x: e.clientX, width: leftPanelWidth };
            }}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
            <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-0.5 h-8 rounded-full bg-muted-foreground/20 group-hover/splitter:bg-primary/60 transition-colors" />
          </div>

          {/* Timeline */}
          <div style={{ width: totalWidth, minHeight: "100%" }} className="relative shrink-0">
            {/* Single-row month headers */}
            <div className="sticky top-0 z-10 bg-card border-b border-border flex" style={{ height: 32 }}>
              {monthGroups.map(g => (
                <div
                  key={g.key}
                  className="shrink-0 flex items-center justify-center text-[11px] capitalize"
                  style={{
                    width: g.span * colWidth,
                    borderRight: "0.5px solid hsl(var(--border) / 0.4)",
                    fontWeight: g.isCurrent ? 500 : 400,
                    color: g.isCurrent ? "#7C3AED" : "hsl(var(--muted-foreground))",
                  }}
                >
                  {g.label}{g.isCurrent ? " ◂" : ""}
                </div>
              ))}
            </div>

            {/* Grid + rows */}
            <div className="relative">
              {columns.map((col, i) => (
                <div key={i} className={cn(
                  "absolute top-0 bottom-0 border-r",
                  col.isWeekend ? "border-border/20 bg-muted/20" : "border-border/10"
                )} style={{ left: i * colWidth, width: colWidth, height: totalRowsHeight }} />
              ))}


              {/* Today line — prominent */}
              <div className="absolute top-0 z-20" style={{ left: todayOffset - 1, height: totalRowsHeight }}>
                <div className="w-[2px] h-full bg-primary" />
              </div>

              {/* Dependency lines */}
              <GanttDependencyLines
                rows={rows}
                dependencies={allDependencies}
                rowHeight={ROW_HEIGHT}
                rowTops={rowTops}
                totalRowsHeight={totalRowsHeight}
                getRowHeight={getRowHeight}
                getBarStyle={getBarStyle}
                getMilestoneX={getMilestoneX}
                getSummaryBarStyle={getSummaryBarStyle}
                criticalTaskIds={criticalTaskIds}
                depStyle={depStyle}
                onClickDependency={(dep) => {
                  setDepDialogState({
                    predecessorId: dep.predecessor_id,
                    successorId: dep.successor_id,
                    predecessorLabel: getEntityLabel(dep.predecessor_id, dep.predecessor_entity_type),
                    successorLabel: getEntityLabel(dep.successor_id, dep.successor_entity_type),
                    predecessorEntityType: dep.predecessor_entity_type,
                    successorEntityType: dep.successor_entity_type,
                    editMode: true,
                    editId: dep.id,
                    initialType: dep.dependency_type,
                    initialLag: dep.lag_days,
                  });
                }}
              />

              {/* Dependency drag line */}
              {depDrag && (
                <svg className="absolute inset-0 pointer-events-none z-30" style={{ width: "100%", height: totalRowsHeight }}>
                  <line
                    x1={depDrag.startX}
                    y1={depDrag.startY}
                    x2={depDrag.currentX - (scrollRef.current?.getBoundingClientRect().left || 0) + (scrollRef.current?.scrollLeft || 0)}
                    y2={depDrag.currentY - (scrollRef.current?.getBoundingClientRect().top || 0) + (scrollRef.current?.scrollTop || 0) - 52}
                    stroke="hsl(var(--primary))"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    opacity="0.7"
                  />
                </svg>
              )}

              {/* Rows */}
              {rows.map((row, i) => {
                const dimmed = filterAssignee && (
                  (row.type === "task" && row.task?.assigned_to !== filterAssignee) ||
                  (row.type === "subtask" && row.subtask?.assigned_to !== filterAssignee)
                );

                return (
                  <div
                    key={i}
                    className={cn(
                      "relative border-b border-border/30 transition-colors duration-500",
                      row.type === "project" && "bg-muted/40",
                      row.type === "subtask" && "bg-transparent",
                      hoveredRow === i && "bg-muted/30",
                      highlightedRowIdx === i && "!bg-yellow-200/40"
                    )}
                    style={{ height: getRowHeight(i) }}
                    onMouseEnter={() => setHoveredRow(i)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {/* Summary bar for project */}
                    {row.type === "project" && row.summaryStart && row.summaryEnd && (() => {
                      const { left, width } = getSummaryBarStyle(row.summaryStart!, row.summaryEnd!);
                      const color = row.project.color || "#3b82f6";
                      return (
                        <div
                          className="absolute top-[13px] rounded-full h-2.5 opacity-70 group/proj"
                          style={{ left, width, backgroundColor: color }}
                          onMouseUp={() => handleBarMouseUp(row.project.id, "project")}
                        >
                          {row.progress !== undefined && row.progress > 0 && (
                            <div
                              className="h-full rounded-full opacity-80"
                              style={{ width: `${row.progress}%`, backgroundColor: color }}
                            />
                          )}
                          {/* Bookend markers */}
                          <div className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
                          <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full" style={{ backgroundColor: color }} />
                          {/* Project dependency connector */}
                          <div
                            className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background opacity-0 group-hover/proj:opacity-100 cursor-crosshair z-20 transition-opacity"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setDepDrag({
                                fromId: row.project.id,
                                fromEntityType: "project",
                                startX: left + width,
                                startY: rowTops[i] + getRowHeight(i) / 2,
                                currentX: e.clientX,
                                currentY: e.clientY,
                              });
                            }}
                          />
                        </div>
                      );
                    })()}

                    {/* Task bar */}
                    {row.type === "task" && row.task && (row.task.deadline || row.task.created_at) && (() => {
                      const task = row.task!;
                      let { left, width } = getBarStyle(task);
                      const progress = taskProgress.get(task.id) || 0;
                      const baseline = getBaselineStyle(task);
                      const driftOverlay = getDriftOverlay(task);
                      const isCritical = criticalTaskIds.has(task.id);

                      // Apply drag delta
                      if (dragState?.taskId === task.id) {
                        if (dragState.side === "move") {
                          left += dragDelta;
                        } else if (dragState.side === "start") {
                          left += dragDelta;
                          width = Math.max(width - dragDelta, 8);
                        } else {
                          width = Math.max(width + dragDelta, 8);
                        }
                      }
                      const isOverdue = task.deadline && isPast(parseISO(task.deadline)) && !task.is_completed;
                      const color = row.project.color || "#3b82f6";

                      return (
                        <>

                          <GanttTooltip task={task} project={row.project} progress={progress} disabled={popoverOpenTaskId === task.id}>
                            <div
                              className={cn(
                                "absolute top-2 rounded-md h-5 flex items-center text-[10px] font-medium text-white truncate transition-colors group/bar shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
                                isOverdue && "opacity-85",
                                (dragState?.taskId === task.id) && "cursor-grabbing",
                                isCritical && "ring-1 ring-destructive ring-offset-1 ring-offset-background",
                                violationIds.has(task.id) && !isCritical && "ring-2 ring-destructive ring-offset-1 ring-offset-background",
                                dimmed && "opacity-20"
                              )}
                              style={{ left, width, backgroundColor: isOverdue ? "hsl(var(--destructive))" : color, minWidth: 8 }}
                              title={`${task.title}${task.deadline ? ` → ${format(parseISO(task.deadline), "d MMM", { locale: ru })}` : ""}${violationIds.has(task.id) ? "  ⚠ Нарушение зависимости" : ""}`}
                              onMouseUp={() => handleBarMouseUp(task.id)}
                            >
                              {/* Progress fill inside bar */}
                              {progress > 0 && progress < 100 && (
                                <div
                                  className="absolute inset-0 rounded-md opacity-25 bg-white"
                                  style={{ width: `${progress}%` }}
                                />
                              )}

                              {/* Drift overlay — amber highlight for deadline extension */}
                              {driftOverlay && !dragState && (
                                <div
                                  className="absolute top-0 bottom-0 rounded-r-md bg-amber-500/40 pointer-events-none"
                                  style={{ left: driftOverlay.left, width: driftOverlay.width }}
                                  title={`Перенос: ${task.original_deadline ? format(parseISO(task.original_deadline), "d MMM", { locale: ru }) : ""} → ${task.deadline ? format(parseISO(task.deadline), "d MMM", { locale: ru }) : ""}`}
                                >
                                  <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent,transparent_3px,rgba(255,255,255,0.15)_3px,rgba(255,255,255,0.15)_6px)]" />
                                </div>
                              )}

                              {/* Left-edge resize handle (start_at) */}
                              <div
                                className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 rounded-l-sm"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setDragState({
                                    taskId: task.id,
                                    startX: e.clientX,
                                    originalDeadline: task.deadline || task.created_at,
                                    originalStartAt: task.start_at || task.created_at,
                                    side: "start",
                                  });
                                }}
                              />

                              {/* Move handle (grab area between edges) */}
                              <div
                                className="absolute left-2 top-0 bottom-0 right-2 cursor-grab"
                                onMouseDown={(e) => {
                                  if (!task.deadline) return;
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setDragState({
                                    taskId: task.id,
                                    startX: e.clientX,
                                    originalDeadline: task.deadline!,
                                    originalCreatedAt: task.created_at,
                                    side: "move",
                                  });
                                }}
                              />

                              {/* Popover trigger area (middle of bar) */}
                              <GanttTaskPopover
                                task={task}
                                project={row.project}
                                onUpdate={(id, updates) => { const t = allTasks.find(x => x.id === id); if (t) undoableUpdate(t, updates); else updateTask.mutate({ id, ...updates }); }}
                                onToggle={(id, completed) => { const t = allTasks.find(x => x.id === id); if (t) undoableToggle(t); else toggleTask.mutate({ id, is_completed: completed }); }}
                                onDelete={(id) => { const t = allTasks.find(x => x.id === id); if (t) undoableDelete(t); else deleteTask.mutate(id); }}
                                onOpenChange={(open) => setPopoverOpenTaskId(open ? task.id : null)}
                              >
                                <span className="truncate px-3 flex-1 cursor-pointer">{width > 50 ? task.title : ""}</span>
                              </GanttTaskPopover>

                              {/* Resize handle (right edge) */}
                              {task.deadline && (
                                <div
                                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 rounded-r-sm"
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setDragState({
                                      taskId: task.id,
                                      startX: e.clientX,
                                      originalDeadline: task.deadline!,
                                      side: "end",
                                    });
                                  }}
                                />
                              )}

                              {/* Dependency connector dot (right side) */}
                              <div
                                className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background opacity-0 group-hover/bar:opacity-100 cursor-crosshair z-20 transition-opacity"
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const barRect = (e.target as HTMLElement).parentElement!;
                                  const scrollRect = scrollRef.current?.getBoundingClientRect();
                                  const scrollLeft = scrollRef.current?.scrollLeft || 0;
                                  const scrollTop = scrollRef.current?.scrollTop || 0;
                                  setDepDrag({
                                    fromId: task.id,
                                    fromEntityType: "task",
                                    startX: left + width,
                                    startY: rowTops[i] + getRowHeight(i) / 2,
                                    currentX: e.clientX,
                                    currentY: e.clientY,
                                  });
                                }}
                              />
                            </div>
                          </GanttTooltip>
                        </>
                      );
                    })()}

                    {/* Empty task warning row */}
                    {row.type === "task" && row.task && !row.task.deadline && (() => {
                      const task = row.task!;
                      const isFullyEmpty = !task.start_at && !task.assigned_to;
                      return (
                        <div
                          className="absolute inset-0 flex items-center px-4 cursor-pointer"
                          style={{ backgroundColor: isFullyEmpty ? "rgba(239,68,68,0.04)" : "rgba(245,158,11,0.06)" }}
                          onClick={() => { setPopoverOpenTaskId(task.id); }}
                        >
                          <GanttTaskPopover
                            task={task}
                            project={row.project}
                            onUpdate={(id, updates) => { const t = allTasks.find(x => x.id === id); if (t) undoableUpdate(t, updates); else updateTask.mutate({ id, ...updates }); }}
                            onToggle={(id, completed) => { const t = allTasks.find(x => x.id === id); if (t) undoableToggle(t); else toggleTask.mutate({ id, is_completed: completed }); }}
                            onDelete={(id) => { const t = allTasks.find(x => x.id === id); if (t) undoableDelete(t); else deleteTask.mutate(id); }}
                            onOpenChange={(open) => setPopoverOpenTaskId(open ? task.id : null)}
                          >
                            <span
                              className="text-[11px] font-medium truncate cursor-pointer"
                              style={{ color: isFullyEmpty ? "#991B1B" : "#92400E" }}
                            >
                              {isFullyEmpty
                                ? "! Задача не заполнена — добавьте даты и ответственного"
                                : "⚠ Нет даты старта"
                              }
                            </span>
                          </GanttTaskPopover>
                        </div>
                      );
                    })()}

                    {/* Subtask bar */}
                    {row.type === "subtask" && row.subtask && row.subtask.deadline && (() => {
                      const st = row.subtask!;
                      const parentTask = row.parentTask;
                      const stStart = startOfDay(parseISO(st.created_at));
                      const stEnd = startOfDay(parseISO(st.deadline));
                      const barStart = stStart < stEnd ? stStart : stEnd;
                      const barEnd = stStart < stEnd ? stEnd : addDays(stStart, 1);
                      const startOffset = differenceInCalendarDays(barStart, timelineStart);
                      const duration = Math.max(differenceInCalendarDays(barEnd, barStart), 1);
                      const left = (startOffset / totalDays) * totalWidth;
                      const width = Math.max((duration / totalDays) * totalWidth, 6);
                      const color = row.project.color || "#3b82f6";
                      const isOverdue = st.deadline && isPast(parseISO(st.deadline)) && !st.is_completed;

                      return (
                        <div
                          className={cn(
                            "absolute top-[11px] rounded h-3.5 opacity-55",
                            st.is_completed && "opacity-25"
                          )}
                          style={{
                            left,
                            width,
                            backgroundColor: isOverdue ? "hsl(var(--destructive))" : color,
                            minWidth: 6,
                          }}
                          title={`${st.title}${st.deadline ? ` → ${format(parseISO(st.deadline), "d MMM", { locale: ru })}` : ""}`}
                        >
                          {st.is_completed && (
                            <div className="absolute inset-0 rounded-[3px] bg-white/30" />
                          )}
                        </div>
                      );
                    })()}

                    {/* Milestone row — red tinted bg + small diamond + dependency connector + drag */}
                    {row.type === "milestone" && row.milestone && (() => {
                      const ms = row.milestone!;
                      const baseX = getMilestoneX(ms);
                      const isDragging = msDragState?.milestoneId === ms.id;
                      const dragOffset = isDragging ? msDragDelta : 0;
                      const x = baseX + dragOffset;
                      const hasViolation = violationIds.has(ms.id);
                      const isCascaded = cascadeHighlight.has(ms.id);
                      return (
                        <div
                          className="absolute inset-0 group/ms"
                          style={{ backgroundColor: "rgba(239,68,68,0.03)" }}
                          onMouseUp={() => handleBarMouseUp(ms.id, "milestone")}
                        >
                          <div
                            className={cn(
                              "absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing transition-all",
                              hasViolation && "ring-2 ring-destructive ring-offset-1 ring-offset-background rounded-sm",
                              isCascaded && "animate-pulse drop-shadow-[0_0_8px_hsl(var(--primary))]"
                            )}
                            style={{ left: x - 5 }}
                            title={isCascaded ? "↻ Веха перенесена каскадом зависимостей" : (hasViolation ? "⚠ Веха нарушает зависимости (раньше предшественника)" : ms.name)}
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              e.preventDefault();
                              setMsDragState({
                                milestoneId: ms.id,
                                startX: e.clientX,
                                originalDate: ms.planned_date,
                              });
                              setMsDragDelta(0);
                            }}
                            onClick={(e) => {
                              // Only treat as click if no drag happened
                              if (!depDrag && !wasDepDragRef.current && !isDragging) {
                                setEditingMilestone(ms);
                                setMsDialogOpen(true);
                              }
                            }}
                          >
                            <Diamond className="h-2.5 w-2.5 fill-[#EF4444] text-[#EF4444]" />
                          </div>
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#EF4444] border-2 border-background opacity-0 group-hover/ms:opacity-100 cursor-crosshair z-20 transition-opacity"
                            style={{ left: x + 6 }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setDepDrag({
                                fromId: ms.id,
                                fromEntityType: "milestone",
                                startX: x + 6,
                                startY: rowTops[i] + getRowHeight(i) / 2,
                                currentX: e.clientX,
                                currentY: e.clientY,
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Milestone dialog */}
      <MilestoneDialog
        open={msDialogOpen}
        onOpenChange={setMsDialogOpen}
        milestone={editingMilestone}
        projects={groups}
        defaultProjectId={selectedProjectId}
        onSave={(data) => {
          const { predecessor, ...msData } = data;
          if (editingMilestone) {
            // If date changed → use cascade-aware update
            const dateChanged = msData.planned_date && msData.planned_date !== editingMilestone.planned_date;
            if (dateChanged && msData.planned_date) {
              const { planned_date, ...rest } = msData;
              if (Object.keys(rest).length > 0) {
                updateMilestone.mutate({ id: editingMilestone.id, ...rest });
              }
              updateMilestoneDate(editingMilestone, planned_date);
            } else {
              updateMilestone.mutate({ id: editingMilestone.id, ...msData });
            }
          } else {
            addMilestone.mutate(msData);
          }
          // Handle predecessor dependency after save
          if (predecessor && predecessor.id) {
            if (editingMilestone) {
              const oldDeps = (allDependencies || []).filter(d => d.successor_id === editingMilestone.id && d.successor_entity_type === "milestone");
              oldDeps.forEach(d => deleteDependency.mutate(d.id));
              setTimeout(() => {
                addDependency.mutate({
                  predecessor_id: predecessor.id,
                  successor_id: editingMilestone.id,
                  predecessor_entity_type: predecessor.entity_type,
                  successor_entity_type: "milestone",
                });
              }, 300);
            }
          } else if (editingMilestone && !predecessor) {
            const oldDeps = (allDependencies || []).filter(d => d.successor_id === editingMilestone.id && d.successor_entity_type === "milestone");
            oldDeps.forEach(d => deleteDependency.mutate(d.id));
          }
        }}
        onDelete={(id) => deleteMilestone.mutate(id)}
      />

      {/* Dependency type dialog */}
      <DependencyDialog
        open={!!depDialogState}
        onOpenChange={(open) => { if (!open) setDepDialogState(null); }}
        predecessorLabel={depDialogState?.predecessorLabel || ""}
        successorLabel={depDialogState?.successorLabel || ""}
        editMode={depDialogState?.editMode}
        initialType={depDialogState?.initialType}
        initialLag={depDialogState?.initialLag}
        onConfirm={(type, lagDays) => {
          if (depDialogState) {
            if (depDialogState.editMode && depDialogState.editId) {
              updateDependency.mutate({
                id: depDialogState.editId,
                dependency_type: type,
                lag_days: lagDays,
              });
            } else {
              addDependency.mutate({
                predecessor_id: depDialogState.predecessorId,
                successor_id: depDialogState.successorId,
                dependency_type: type,
                lag_days: lagDays,
                predecessor_entity_type: depDialogState.predecessorEntityType,
                successor_entity_type: depDialogState.successorEntityType,
              });

              // Auto-set successor's start_at and deadline based on predecessor's end date
              // Works for FS (Finish-Start) and SS (Start-Start) dependency types
              if (type === "FS" || type === "SS") {
                let predRefDate: Date | null = null;
                if (depDialogState.predecessorEntityType === "task") {
                  const predTask = allTasks.find(t => t.id === depDialogState.predecessorId);
                  if (predTask) {
                    if (type === "FS") {
                      // Use deadline, fallback to start_at, fallback to created_at
                      predRefDate = predTask.deadline ? parseISO(predTask.deadline)
                        : predTask.start_at ? parseISO(predTask.start_at)
                        : parseISO(predTask.created_at);
                    } else {
                      // SS: use start_at or created_at
                      predRefDate = predTask.start_at ? parseISO(predTask.start_at) : parseISO(predTask.created_at);
                    }
                  }
                } else if (depDialogState.predecessorEntityType === "milestone") {
                  const predMs = allMilestones.find(m => m.id === depDialogState.predecessorId);
                  if (predMs) predRefDate = parseISO(predMs.planned_date);
                } else if (depDialogState.predecessorEntityType === "project") {
                  const gTasks = allTasks.filter(t => t.group_id === depDialogState.predecessorId);
                  const latest = gTasks.reduce((max, t) => {
                    const d = t.deadline || t.start_at || t.created_at;
                    return d > max ? d : max;
                  }, "");
                  if (latest) predRefDate = parseISO(latest);
                }

                if (predRefDate) {
                  const newStart = type === "FS"
                    ? addDays(predRefDate, Math.max(lagDays, 1))
                    : addDays(predRefDate, lagDays); // SS: same start + lag

                  if (depDialogState.successorEntityType === "task") {
                    const succTask = allTasks.find(t => t.id === depDialogState.successorId);
                    if (succTask) {
                      const oldStart = succTask.start_at ? parseISO(succTask.start_at) : null;
                      const updates: any = { id: succTask.id, start_at: newStart.toISOString() };

                      if (succTask.deadline && oldStart) {
                        const duration = differenceInCalendarDays(parseISO(succTask.deadline), oldStart);
                        updates.deadline = addDays(newStart, Math.max(duration, 1)).toISOString();
                      } else if (!succTask.deadline) {
                        // No deadline set — auto-assign one
                        updates.deadline = addDays(newStart, 1).toISOString();
                      }
                      // Always update — don't skip when successor has no dates yet
                      updateTask.mutate(updates);
                    }
                  } else if (depDialogState.successorEntityType === "milestone") {
                    const succMs = allMilestones.find(m => m.id === depDialogState.successorId);
                    const oldPlanned = succMs ? parseISO(succMs.planned_date) : null;
                    if (!oldPlanned || newStart > oldPlanned) {
                      updateMilestone.mutate({ id: depDialogState.successorId, planned_date: newStart.toISOString() });
                    }
                  }
                }
              }
            }
          }
          setDepDialogState(null);
        }}
        onDelete={() => {
          if (depDialogState?.editId) {
            deleteDependency.mutate(depDialogState.editId);
          }
          setDepDialogState(null);
        }}
      />

      {/* Task detail Sheet */}
      <Sheet open={!!selectedTaskId} onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 overflow-y-auto">
          {selectedTaskId && (() => {
            const task = allTasks.find(t => t.id === selectedTaskId);
            if (!task) return null;
            return <TaskItem task={task} initialOpen />;
          })()}
        </SheetContent>
      </Sheet>
    </div>
    </div>
  );
}

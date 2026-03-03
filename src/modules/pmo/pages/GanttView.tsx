import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useTaskGroups, useTasks, useTaskMutations, useAvailableUsers, type TaskGroup, type Task } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import { useMilestones, useMilestoneMutations, type Milestone } from "@/hooks/useMilestones";
import { useDependencies, useDependencyMutations } from "@/hooks/useDependencies";
import { cn } from "@/lib/utils";
import {
  addDays, differenceInCalendarDays,
  startOfDay, format, isToday, isPast, parseISO, eachDayOfInterval,
  eachWeekOfInterval, eachMonthOfInterval, isWeekend
} from "date-fns";
import { ru } from "date-fns/locale";
import { Minus, Plus, Diamond, FolderPlus, User, LocateFixed } from "lucide-react";
import MilestoneDialog from "@/modules/pmo/components/MilestoneDialog";
import GanttLeftPanel, { type GanttRow } from "@/modules/pmo/components/GanttLeftPanel";
import GanttTaskPopover from "@/modules/pmo/components/GanttTaskPopover";
import GanttTooltip from "@/modules/pmo/components/GanttTooltip";
import GanttDependencyLines from "@/modules/pmo/components/GanttDependencyLines";
import DependencyDialog from "@/modules/pmo/components/DependencyDialog";
import { computeCascadeUpdates } from "@/lib/cascadeDependencies";

type Scale = "day" | "week" | "month";

const SCALE_ORDER: Scale[] = ["month", "week", "day"];
const COL_WIDTHS: Record<Scale, number> = { day: 36, week: 120, month: 180 };
const ROW_HEIGHT = 36;
const MIN_LEFT_PANEL = 250;
const MAX_LEFT_PANEL = 600;

export default function GanttView({ initialProjectId }: { initialProjectId?: string | null }) {
  const { user } = useAuth();
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: allMilestones = [] } = useMilestones();
  const { data: allDependencies = [] } = useDependencies();
  const { data: users = [] } = useAvailableUsers();
  const { addMilestone, updateMilestone, deleteMilestone } = useMilestoneMutations();
  const { addGroup, addTask, updateTask, deleteTask, toggleTask, addSubtask, toggleSubtask, updateSubtask } = useTaskMutations();
  const { addDependency, updateDependency, deleteDependency } = useDependencyMutations();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<Scale>("week");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId || null);
  const lastPinchDistRef = useRef<number | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [leftPanelWidth, setLeftPanelWidth] = useState(380);
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [popoverOpenTaskId, setPopoverOpenTaskId] = useState<string | null>(null);

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

  // Dependency drag state
  const [depDrag, setDepDrag] = useState<{
    fromId: string;
    fromEntityType: "task" | "milestone" | "project";
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

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

  // Pinch-to-zoom
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
    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
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
            taskUpdates.start_at = addDays(oldStart, daysDelta).toISOString();
          }
          updateTask.mutate(taskUpdates);
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
        
        updateTask.mutate(taskUpdates);

        // Cascading: push forward dependent tasks
        if (daysDelta > 0 && allDependencies.length > 0) {
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
  }, [dragState, scale, updateTask, updateMilestone, allDependencies, allTasks, allMilestones, groups]);

  // Dependency drag handlers
  useEffect(() => {
    if (!depDrag) return;
    const handleMouseMove = (e: MouseEvent) => {
      setDepDrag(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
    };
    const handleMouseUp = () => {
      setDepDrag(null);
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

      if (!hasDatedTasks && !hasChildren && !hasMilestones && selectedProjectId !== project.id) return;

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
        projectTasks.forEach(t => {
          if (t.deadline || t.created_at) {
            result.push({ type: "task", project, task: t, depth: depth + 1 });
            // Add subtask rows
            if (t.subtasks && t.subtasks.length > 0) {
              t.subtasks
                .sort((a, b) => a.position - b.position)
                .forEach(st => {
                  result.push({ type: "subtask", project, subtask: st, parentTask: t, depth: depth + 2 });
                });
            }
          }
        });
        projectMilestones.forEach(m => {
          result.push({ type: "milestone", project, milestone: m, depth: depth + 1 });
        });
        children.forEach(child => addProjectRows(child, depth + 1, true));
      }
    };

    if (selectedProjectId) {
      const proj = groups.find(g => g.id === selectedProjectId);
      if (proj) addProjectRows(proj, 0);
    } else {
      rootProjects.forEach(p => addProjectRows(p, 0));
    }
    return result;
  }, [groups, allTasks, allMilestones, selectedProjectId, collapsedProjects, taskProgress]);

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

  const getMilestoneX = (ms: Milestone) => {
    const d = startOfDay(parseISO(ms.planned_date));
    const offset = differenceInCalendarDays(d, timelineStart);
    return (offset / totalDays) * totalWidth;
  };

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card shrink-0 flex-wrap">
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          {(["day", "week", "month"] as Scale[]).map(s => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                scale === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "day" ? "День" : s === "week" ? "Неделя" : "Месяц"}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-border" />

        <button onClick={zoomOut} disabled={scale === "month"}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Уменьшить масштаб"><Minus className="h-3.5 w-3.5" /></button>
        <button onClick={zoomIn} disabled={scale === "day"}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Увеличить масштаб"><Plus className="h-3.5 w-3.5" /></button>

        <button
          onClick={() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTo({ left: Math.max(todayOffset - 300, 0), behavior: "smooth" });
            }
          }}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="К сегодняшнему дню"
        >
          <LocateFixed className="h-3.5 w-3.5" />
        </button>

        <div className="h-4 w-px bg-border" />

        <select
          value={selectedProjectId || ""}
          onChange={e => setSelectedProjectId(e.target.value || null)}
          className="text-xs bg-muted border-0 rounded-md px-2 py-1.5 text-foreground outline-none cursor-pointer"
        >
          <option value="">Все проекты</option>
          {rootProjects.map(p => (
            <option key={p.id} value={p.id}>{p.icon && p.icon !== "list" ? `${p.icon} ` : ""}{p.name}</option>
          ))}
        </select>

        <div className="h-4 w-px bg-border" />

        {/* Assignee filter */}
        <div className="flex items-center gap-1">
          <User className="h-3 w-3 text-muted-foreground" />
          <select
            value={filterAssignee || ""}
            onChange={e => setFilterAssignee(e.target.value || null)}
            className="text-xs bg-muted border-0 rounded-md px-2 py-1.5 text-foreground outline-none cursor-pointer"
          >
            <option value="">Все</option>
            {assignees.map(u => (
              <option key={u.id} value={u.id}>{u.display_name || u.email}</option>
            ))}
          </select>
        </div>

        <div className="h-4 w-px bg-border" />

        <button
          onClick={() => { setEditingMilestone(null); setMsDialogOpen(true); }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          <Diamond className="h-3 w-3" />
          <span className="hidden sm:inline">Веха</span>
        </button>

        <div className="h-4 w-px bg-border" />

        {/* Add project */}
        {showNewProject ? (
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
            className="flex items-center gap-1"
          >
            <input
              autoFocus
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onBlur={() => { if (!newProjectName.trim()) setShowNewProject(false); }}
              onKeyDown={e => { if (e.key === "Escape") { setShowNewProject(false); setNewProjectName(""); } }}
              placeholder="Имя проекта..."
              className="h-6 w-32 text-xs bg-muted border-0 rounded px-2 text-foreground outline-none"
            />
          </form>
        ) : (
          <button
            onClick={() => setShowNewProject(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <FolderPlus className="h-3 w-3" />
            <span className="hidden sm:inline">Проект</span>
          </button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {rows.filter(r => r.type === "task").length} задач · {rows.filter(r => r.type === "milestone").length} вех
        </span>
      </div>

      {/* Gantt body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - editable table */}
        <GanttLeftPanel
          rows={rows}
          rowHeight={ROW_HEIGHT}
          width={leftPanelWidth}
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
            updateTask.mutate({ id, ...updates });
          }}
          onToggleTask={(id, completed) => {
            toggleTask.mutate({ id, is_completed: completed });
          }}
          onUpdateSubtask={(id, updates) => {
            updateSubtask.mutate({ id, ...updates });
          }}
          onToggleSubtask={(id, completed) => {
            toggleSubtask.mutate({ id, is_completed: completed });
          }}
          collapsedProjects={collapsedProjects}
          onToggleCollapse={toggleCollapse}
          filterAssignee={filterAssignee}
          hoveredRow={hoveredRow}
          onHoverRow={setHoveredRow}
        />

        {/* Draggable splitter */}
        <div
          className={cn(
            "w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors",
            splitterDragging && "bg-primary/50"
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            setSplitterDragging(true);
            splitterStartRef.current = { x: e.clientX, width: leftPanelWidth };
          }}
        />

        {/* Timeline */}
        <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin">
          <div style={{ width: totalWidth, minHeight: "100%" }} className="relative">
            {/* Column headers */}
            <div className="sticky top-0 z-10 bg-card border-b border-border flex" style={{ height: 40 }}>
              {columns.map((col, i) => (
                <div key={i} className={cn(
                  "shrink-0 flex items-center justify-center text-xs border-r border-border/30",
                  col.isToday && "bg-primary/10 font-bold text-primary",
                  col.isWeekend && !col.isToday && "bg-muted/50"
                )} style={{ width: colWidth }}>{col.label}</div>
              ))}
            </div>

            {/* Grid + rows */}
            <div className="relative">
              {columns.map((col, i) => (
                <div key={i} className={cn(
                  "absolute top-0 bottom-0 border-r",
                  col.isWeekend ? "border-border/20 bg-muted/20" : "border-border/10"
                )} style={{ left: i * colWidth, width: colWidth, height: rows.length * ROW_HEIGHT }} />
              ))}

              {/* Today line */}
              <div className="absolute top-0 w-0.5 bg-primary z-20" style={{ left: todayOffset, height: rows.length * ROW_HEIGHT }} />

              {/* Dependency lines */}
              <GanttDependencyLines
                rows={rows}
                dependencies={allDependencies}
                rowHeight={ROW_HEIGHT}
                getBarStyle={getBarStyle}
                getMilestoneX={getMilestoneX}
                getSummaryBarStyle={getSummaryBarStyle}
                criticalTaskIds={criticalTaskIds}
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
                <svg className="absolute inset-0 pointer-events-none z-30" style={{ width: "100%", height: rows.length * ROW_HEIGHT }}>
                  <line
                    x1={depDrag.startX}
                    y1={depDrag.startY}
                    x2={depDrag.currentX - (scrollRef.current?.getBoundingClientRect().left || 0) + (scrollRef.current?.scrollLeft || 0)}
                    y2={depDrag.currentY - (scrollRef.current?.getBoundingClientRect().top || 0) + (scrollRef.current?.scrollTop || 0) - 40}
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
                      "relative border-b border-border/30",
                      row.type === "project" && "bg-muted/10",
                      hoveredRow === i && "bg-muted/30"
                    )}
                    style={{ height: ROW_HEIGHT }}
                    onMouseEnter={() => setHoveredRow(i)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    {/* Summary bar for project */}
                    {row.type === "project" && row.summaryStart && row.summaryEnd && (() => {
                      const { left, width } = getSummaryBarStyle(row.summaryStart!, row.summaryEnd!);
                      const color = row.project.color || "#3b82f6";
                      return (
                        <div
                          className="absolute top-3.5 rounded-sm h-3 opacity-50 group/proj"
                          style={{ left, width, backgroundColor: color }}
                          onMouseUp={() => handleBarMouseUp(row.project.id, "project")}
                        >
                          {row.progress !== undefined && row.progress > 0 && (
                            <div
                              className="h-full rounded-sm opacity-80"
                              style={{ width: `${row.progress}%`, backgroundColor: color }}
                            />
                          )}
                          {/* Bookend markers */}
                          <div className="absolute -left-px top-0 w-0.5 h-3 -translate-y-0.5" style={{ backgroundColor: color }} />
                          <div className="absolute -right-px top-0 w-0.5 h-3 -translate-y-0.5" style={{ backgroundColor: color }} />
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
                                startY: i * ROW_HEIGHT + ROW_HEIGHT / 2,
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
                          {/* Baseline (original deadline) */}
                          {baseline && (
                            <div
                              className="absolute top-5 rounded-sm h-1 opacity-25"
                              style={{ left: baseline.left, width: baseline.width, backgroundColor: "hsl(var(--muted-foreground))" }}
                            />
                          )}

                          <GanttTooltip task={task} project={row.project} progress={progress} disabled={popoverOpenTaskId === task.id}>
                            <div
                              className={cn(
                                "absolute top-1.5 rounded-[4px] h-6 flex items-center text-[10px] font-medium text-white truncate transition-colors group/bar shadow-sm",
                                isOverdue && "opacity-80",
                                (dragState?.taskId === task.id) && "cursor-grabbing",
                                isCritical && "ring-1 ring-destructive ring-offset-1 ring-offset-background",
                                dimmed && "opacity-20"
                              )}
                              style={{ left, width, backgroundColor: isOverdue ? "hsl(var(--destructive))" : color, minWidth: 8 }}
                              title={`${task.title}${task.deadline ? ` → ${format(parseISO(task.deadline), "d MMM", { locale: ru })}` : ""}`}
                              onMouseUp={() => handleBarMouseUp(task.id)}
                            >
                              {/* Progress fill inside bar */}
                              {progress > 0 && progress < 100 && (
                                <div
                                  className="absolute inset-0 rounded-sm opacity-30 bg-white"
                                  style={{ width: `${progress}%` }}
                                />
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
                                onUpdate={(id, updates) => updateTask.mutate({ id, ...updates })}
                                onToggle={(id, completed) => toggleTask.mutate({ id, is_completed: completed })}
                                onDelete={(id) => deleteTask.mutate(id)}
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
                                    startY: i * ROW_HEIGHT + ROW_HEIGHT / 2,
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
                            "absolute top-2.5 rounded-[3px] h-4 opacity-60",
                            st.is_completed && "opacity-30"
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

                    {/* Milestone diamond */}
                    {row.type === "milestone" && row.milestone && (() => {
                      const x = getMilestoneX(row.milestone!);
                      const msColor = row.milestone!.color || "#3b82f6";
                      const isMissed = row.milestone!.status === "missed";
                      const isCompleted = row.milestone!.status === "completed";
                      return (
                        <div
                          className="absolute top-1 cursor-pointer group/ms"
                          style={{ left: x - 10 }}
                          title={`${row.milestone!.name} — ${format(parseISO(row.milestone!.planned_date), "d MMM yyyy", { locale: ru })}`}
                          onClick={() => { setEditingMilestone(row.milestone!); setMsDialogOpen(true); }}
                          onMouseUp={() => handleBarMouseUp(row.milestone!.id, "milestone")}
                        >
                          <svg width="20" height="20" viewBox="0 0 20 20" className="drop-shadow-sm group-hover/ms:drop-shadow-md transition-all">
                            <rect
                              x="10" y="2" width="11" height="11"
                              transform="rotate(45 10 2)"
                              fill={isMissed ? "hsl(var(--destructive))" : msColor}
                              opacity={isCompleted ? 0.6 : 1}
                              stroke={isCompleted ? "hsl(var(--foreground))" : "white"}
                              strokeWidth="1.5"
                            />
                            {isCompleted && (
                              <path d="M7 10 L9.5 12.5 L13 7.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            )}
                          </svg>
                          {/* Dependency connector for milestone */}
                          <div
                            className="absolute -right-2 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background opacity-0 group-hover/ms:opacity-100 cursor-crosshair z-20 transition-opacity"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setDepDrag({
                                fromId: row.milestone!.id,
                                fromEntityType: "milestone",
                                startX: x + 10,
                                startY: i * ROW_HEIGHT + ROW_HEIGHT / 2,
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
          if (editingMilestone) {
            updateMilestone.mutate({ id: editingMilestone.id, ...data });
          } else {
            addMilestone.mutate(data);
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
              if (type === "FS") {
                let predEndDate: Date | null = null;
                if (depDialogState.predecessorEntityType === "task") {
                  const predTask = allTasks.find(t => t.id === depDialogState.predecessorId);
                  if (predTask?.deadline) predEndDate = parseISO(predTask.deadline);
                } else if (depDialogState.predecessorEntityType === "milestone") {
                  const predMs = allMilestones.find(m => m.id === depDialogState.predecessorId);
                  if (predMs) predEndDate = parseISO(predMs.planned_date);
                } else if (depDialogState.predecessorEntityType === "project") {
                  const gTasks = allTasks.filter(t => t.group_id === depDialogState.predecessorId);
                  const latest = gTasks.reduce((max, t) => {
                    const d = t.deadline || t.created_at;
                    return d > max ? d : max;
                  }, "");
                  if (latest) predEndDate = parseISO(latest);
                }

                if (predEndDate) {
                  const newStart = addDays(predEndDate, Math.max(lagDays, 1));

                  if (depDialogState.successorEntityType === "task") {
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
                      }
                    }
                  } else if (depDialogState.successorEntityType === "milestone") {
                    const succMs = allMilestones.find(m => m.id === depDialogState.successorId);
                    const oldPlanned = succMs ? parseISO(succMs.planned_date) : null;
                    // Only move milestone forward, never backward
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
    </div>
  );
}

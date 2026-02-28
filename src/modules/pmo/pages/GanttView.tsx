import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useTaskGroups, useTasks, useTaskMutations, type TaskGroup, type Task } from "@/hooks/useTasks";
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
import { Minus, Plus, Diamond, FolderPlus } from "lucide-react";
import MilestoneDialog from "@/modules/pmo/components/MilestoneDialog";
import GanttLeftPanel, { type GanttRow } from "@/modules/pmo/components/GanttLeftPanel";
import GanttTaskPopover from "@/modules/pmo/components/GanttTaskPopover";
import GanttDependencyLines from "@/modules/pmo/components/GanttDependencyLines";

type Scale = "day" | "week" | "month";

const SCALE_ORDER: Scale[] = ["month", "week", "day"];
const COL_WIDTHS: Record<Scale, number> = { day: 36, week: 120, month: 180 };
const ROW_HEIGHT = 32;
const LEFT_PANEL_WIDTH = 380;

export default function GanttView({ initialProjectId }: { initialProjectId?: string | null }) {
  const { user } = useAuth();
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: allMilestones = [] } = useMilestones();
  const { data: allDependencies = [] } = useDependencies();
  const { addMilestone, updateMilestone, deleteMilestone } = useMilestoneMutations();
  const { addGroup, addTask, updateTask, deleteTask, toggleTask } = useTaskMutations();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<Scale>("week");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId || null);
  const lastPinchDistRef = useRef<number | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);

  // Milestone dialog state
  const [msDialogOpen, setMsDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  // Drag-resize state
  const [dragState, setDragState] = useState<{
    taskId: string;
    startX: number;
    originalDeadline: string;
    side: "end";
  } | null>(null);
  const [dragDelta, setDragDelta] = useState(0);

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

  // Drag-resize handlers (mouse)
  useEffect(() => {
    if (!dragState) return;
    const handleMouseMove = (e: MouseEvent) => {
      setDragDelta(e.clientX - dragState.startX);
    };
    const handleMouseUp = (e: MouseEvent) => {
      const delta = e.clientX - dragState.startX;
      const daysDelta = Math.round(delta / (COL_WIDTHS[scale] / (scale === "day" ? 1 : scale === "week" ? 7 : 30)));
      if (daysDelta !== 0) {
        const original = parseISO(dragState.originalDeadline);
        const newDate = addDays(original, daysDelta);
        updateTask.mutate({ id: dragState.taskId, deadline: newDate.toISOString() });
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
  }, [dragState, scale, updateTask]);

  // Build rows
  const rows: GanttRow[] = useMemo(() => {
    const rootProjects = groups.filter(g => !g.parent_id).sort((a, b) => a.position - b.position);
    const result: GanttRow[] = [];

    const addProjectRows = (project: TaskGroup, depth: number) => {
      if (selectedProjectId && selectedProjectId !== project.id && project.parent_id !== selectedProjectId) return;

      const projectTasks = allTasks
        .filter(t => t.group_id === project.id && !t.is_completed)
        .sort((a, b) => a.position - b.position);
      const projectMilestones = allMilestones.filter(m => m.group_id === project.id);
      const children = groups.filter(g => g.parent_id === project.id).sort((a, b) => a.position - b.position);

      const hasDatedTasks = projectTasks.some(t => t.deadline || t.created_at);
      const hasChildren = children.length > 0;
      const hasMilestones = projectMilestones.length > 0;

      // Show project even if empty when selected
      if (!hasDatedTasks && !hasChildren && !hasMilestones && selectedProjectId !== project.id) return;

      result.push({ type: "project", project, depth });
      projectTasks.forEach(t => {
        if (t.deadline || t.created_at) {
          result.push({ type: "task", project, task: t, depth: depth + 1 });
        }
      });
      projectMilestones.forEach(m => {
        result.push({ type: "milestone", project, milestone: m, depth: depth + 1 });
      });
      children.forEach(child => addProjectRows(child, depth + 1));
    };

    if (selectedProjectId) {
      const proj = groups.find(g => g.id === selectedProjectId);
      if (proj) addProjectRows(proj, 0);
    } else {
      rootProjects.forEach(p => addProjectRows(p, 0));
    }
    return result;
  }, [groups, allTasks, allMilestones, selectedProjectId]);

  // Timeline range
  const { timelineStart, timelineEnd, columns } = useMemo(() => {
    const now = new Date();
    let minDate = addDays(now, -7);
    let maxDate = addDays(now, 30);

    rows.forEach(r => {
      if (r.task) {
        const start = startOfDay(parseISO(r.task.created_at));
        const end = r.task.deadline ? startOfDay(parseISO(r.task.deadline)) : start;
        if (start < minDate) minDate = start;
        if (end > maxDate) maxDate = end;
      }
      if (r.milestone) {
        const d = startOfDay(parseISO(r.milestone.planned_date));
        if (d < minDate) minDate = d;
        if (d > maxDate) maxDate = d;
      }
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
    const created = startOfDay(parseISO(task.created_at));
    const deadline = task.deadline ? startOfDay(parseISO(task.deadline)) : created;
    const barStart = created < deadline ? created : deadline;
    const barEnd = created < deadline ? deadline : addDays(created, 1);
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

  // Click on empty timeline area to create task
  const handleTimelineClick = (e: React.MouseEvent, rowIndex: number) => {
    const row = rows[rowIndex];
    if (row.type !== "project") return;
    // Could implement click-to-create here in future
  };

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
          title="Уменьшить масштаб"><Minus className="h-3.5 w-3.5" /></button>
        <button onClick={zoomIn} disabled={scale === "day"}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Увеличить масштаб"><Plus className="h-3.5 w-3.5" /></button>

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
          width={LEFT_PANEL_WIDTH}
          onMilestoneClick={(ms) => { setEditingMilestone(ms); setMsDialogOpen(true); }}
          onAddTask={(projectId, title) => {
            addTask.mutate({ title, group_id: projectId });
          }}
          onUpdateTask={(id, updates) => {
            updateTask.mutate({ id, ...updates });
          }}
          onToggleTask={(id, completed) => {
            toggleTask.mutate({ id, is_completed: completed });
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
              />

              {/* Rows */}
              {rows.map((row, i) => (
                <div
                  key={i}
                  className={cn("relative border-b border-border/30", row.type === "project" && "bg-muted/10")}
                  style={{ height: ROW_HEIGHT }}
                  onClick={(e) => handleTimelineClick(e, i)}
                >
                  {/* Task bar */}
                  {row.type === "task" && row.task && (row.task.deadline || row.task.created_at) && (() => {
                    const task = row.task!;
                    let { left, width } = getBarStyle(task);
                    // Apply drag delta
                    if (dragState?.taskId === task.id) {
                      width = Math.max(width + dragDelta, 8);
                    }
                    const isOverdue = task.deadline && isPast(parseISO(task.deadline)) && !task.is_completed;
                    const color = row.project.color || "#3b82f6";
                    return (
                      <GanttTaskPopover
                        task={task}
                        project={row.project}
                        onUpdate={(id, updates) => updateTask.mutate({ id, ...updates })}
                        onToggle={(id, completed) => toggleTask.mutate({ id, is_completed: completed })}
                        onDelete={(id) => deleteTask.mutate(id)}
                      >
                        <div
                          className={cn(
                            "absolute top-1.5 rounded-sm h-5 flex items-center text-[10px] font-medium text-white truncate transition-colors group/bar",
                            isOverdue && "opacity-80",
                            dragState?.taskId === task.id && "cursor-col-resize"
                          )}
                          style={{ left, width, backgroundColor: isOverdue ? "hsl(var(--destructive))" : color, minWidth: 8 }}
                          title={`${task.title}${task.deadline ? ` → ${format(parseISO(task.deadline), "d MMM", { locale: ru })}` : ""}`}
                        >
                          <span className="truncate px-1.5">{width > 50 ? task.title : ""}</span>
                          {/* Drag handle for deadline resize */}
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
                        </div>
                      </GanttTaskPopover>
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
                        className="absolute top-1 cursor-pointer group"
                        style={{ left: x - 10 }}
                        title={`${row.milestone!.name} — ${format(parseISO(row.milestone!.planned_date), "d MMM yyyy", { locale: ru })}`}
                        onClick={() => { setEditingMilestone(row.milestone!); setMsDialogOpen(true); }}
                      >
                        <svg width="20" height="20" viewBox="0 0 20 20" className="drop-shadow-sm group-hover:drop-shadow-md transition-all">
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
                      </div>
                    );
                  })()}
                </div>
              ))}
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
    </div>
  );
}

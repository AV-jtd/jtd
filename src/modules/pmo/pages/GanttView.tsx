import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useTaskGroups, useTasks, type TaskGroup, type Task } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import {
  addDays, addWeeks, addMonths, differenceInDays, differenceInCalendarDays,
  startOfDay, startOfWeek, startOfMonth, endOfDay, endOfMonth,
  format, isSameMonth, isSameDay, isToday, isPast, parseISO, eachDayOfInterval,
  eachWeekOfInterval, eachMonthOfInterval, isWeekend
} from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Folder, Minus, Plus } from "lucide-react";

type Scale = "day" | "week" | "month";

const SCALE_ORDER: Scale[] = ["month", "week", "day"];
const COL_WIDTHS: Record<Scale, number> = { day: 36, week: 120, month: 180 };

export default function GanttView() {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<Scale>("week");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);

  // Zoom in/out helpers
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

  // Pinch-to-zoom on the timeline area
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

    const handleTouchEnd = () => {
      lastPinchDistRef.current = null;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [zoomIn, zoomOut]);

  // Build rows: project headers + tasks with deadlines or created_at
  const rows = useMemo(() => {
    const rootProjects = groups.filter(g => !g.parent_id).sort((a, b) => a.position - b.position);
    const result: { type: "project" | "task"; project: TaskGroup; task?: Task; depth: number }[] = [];

    const addProjectRows = (project: TaskGroup, depth: number) => {
      if (selectedProjectId && selectedProjectId !== project.id) {
        // Check if this project is a child of selected
        if (project.parent_id !== selectedProjectId) return;
      }

      const projectTasks = allTasks
        .filter(t => t.group_id === project.id && !t.is_completed)
        .sort((a, b) => a.position - b.position);

      const children = groups.filter(g => g.parent_id === project.id).sort((a, b) => a.position - b.position);

      // Only show projects that have tasks with dates
      const hasDatedTasks = projectTasks.some(t => t.deadline || t.created_at);
      const hasChildren = children.length > 0;

      if (!hasDatedTasks && !hasChildren) return;

      result.push({ type: "project", project, depth });
      projectTasks.forEach(t => {
        if (t.deadline || t.created_at) {
          result.push({ type: "task", project, task: t, depth: depth + 1 });
        }
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
  }, [groups, allTasks, selectedProjectId]);

  // Compute timeline range
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
    });

    // Add padding
    minDate = addDays(startOfDay(minDate), -3);
    maxDate = addDays(startOfDay(maxDate), 7);

    let cols: { date: Date; label: string; isToday: boolean; isWeekend: boolean }[] = [];

    if (scale === "day") {
      const days = eachDayOfInterval({ start: minDate, end: maxDate });
      cols = days.map(d => ({
        date: d,
        label: format(d, "d", { locale: ru }),
        isToday: isToday(d),
        isWeekend: isWeekend(d),
      }));
    } else if (scale === "week") {
      const weeks = eachWeekOfInterval({ start: minDate, end: maxDate }, { weekStartsOn: 1 });
      cols = weeks.map(w => ({
        date: w,
        label: format(w, "d MMM", { locale: ru }),
        isToday: false,
        isWeekend: false,
      }));
    } else {
      const months = eachMonthOfInterval({ start: minDate, end: maxDate });
      cols = months.map(m => ({
        date: m,
        label: format(m, "LLL yyyy", { locale: ru }),
        isToday: false,
        isWeekend: false,
      }));
    }

    return { timelineStart: minDate, timelineEnd: maxDate, columns: cols };
  }, [rows, scale]);

  const colWidth = COL_WIDTHS[scale];
  const totalWidth = columns.length * colWidth;

  // Get bar position for a task
  const getBarStyle = (task: Task) => {
    const created = startOfDay(parseISO(task.created_at));
    const deadline = task.deadline ? startOfDay(parseISO(task.deadline)) : created;
    const barStart = created < deadline ? created : deadline;
    const barEnd = created < deadline ? deadline : addDays(created, 1);

    const totalDays = differenceInCalendarDays(timelineEnd, timelineStart) || 1;
    const startOffset = differenceInCalendarDays(barStart, timelineStart);
    const duration = Math.max(differenceInCalendarDays(barEnd, barStart), 1);

    const leftPx = (startOffset / totalDays) * totalWidth;
    const widthPx = Math.max((duration / totalDays) * totalWidth, 8);

    return { left: leftPx, width: widthPx };
  };

  // Today marker position
  const todayOffset = useMemo(() => {
    const totalDays = differenceInCalendarDays(timelineEnd, timelineStart) || 1;
    const offset = differenceInCalendarDays(new Date(), timelineStart);
    return (offset / totalDays) * totalWidth;
  }, [timelineStart, timelineEnd, totalWidth]);

  // Scroll to today on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(todayOffset - 300, 0);
    }
  }, [todayOffset]);

  // Project filter options
  const rootProjects = groups.filter(g => !g.parent_id).sort((a, b) => a.position - b.position);

  const ROW_HEIGHT = 32;
  const HEADER_HEIGHT = 48;
  const LEFT_PANEL_WIDTH = 240;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card shrink-0">
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

        {/* Zoom buttons */}
        <button
          onClick={zoomOut}
          disabled={scale === "month"}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Уменьшить масштаб"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={zoomIn}
          disabled={scale === "day"}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Увеличить масштаб"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <div className="h-4 w-px bg-border" />

        {/* Project filter */}
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

        <span className="text-xs text-muted-foreground ml-auto">
          {rows.filter(r => r.type === "task").length} задач
        </span>
      </div>

      {/* Gantt body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: task names */}
        <div className="shrink-0 border-r border-border bg-card overflow-y-auto scrollbar-thin" style={{ width: LEFT_PANEL_WIDTH }}>
          {/* Header */}
          <div className="h-10 flex items-center px-3 border-b border-border text-xs font-medium text-muted-foreground sticky top-0 bg-card z-10">
            Задача
          </div>
          {rows.map((row, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-1.5 px-3 border-b border-border/50 text-xs truncate",
                row.type === "project" ? "font-semibold text-foreground bg-muted/30" : "text-muted-foreground"
              )}
              style={{ height: ROW_HEIGHT, paddingLeft: 12 + row.depth * 12 }}
            >
              {row.type === "project" ? (
                <>
                  <span className="text-sm shrink-0">
                    {row.project.icon && row.project.icon !== "list" ? row.project.icon : "📁"}
                  </span>
                  <span className="truncate">{row.project.name}</span>
                </>
              ) : (
                <span className="truncate">{row.task?.title}</span>
              )}
            </div>
          ))}
        </div>

        {/* Right panel: timeline */}
        <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-thin">
          <div style={{ width: totalWidth, minHeight: "100%" }} className="relative">
            {/* Column headers */}
            <div className="sticky top-0 z-10 bg-card border-b border-border flex" style={{ height: 40 }}>
              {columns.map((col, i) => (
                <div
                  key={i}
                  className={cn(
                    "shrink-0 flex items-center justify-center text-xs border-r border-border/30",
                    col.isToday && "bg-primary/10 font-bold text-primary",
                    col.isWeekend && !col.isToday && "bg-muted/50"
                  )}
                  style={{ width: colWidth }}
                >
                  {col.label}
                </div>
              ))}
            </div>

            {/* Grid lines + rows */}
            <div className="relative">
              {/* Vertical grid lines */}
              {columns.map((col, i) => (
                <div
                  key={i}
                  className={cn(
                    "absolute top-0 bottom-0 border-r",
                    col.isWeekend ? "border-border/20 bg-muted/20" : "border-border/10"
                  )}
                  style={{ left: i * colWidth, width: colWidth, height: rows.length * ROW_HEIGHT }}
                />
              ))}

              {/* Today line */}
              <div
                className="absolute top-0 w-0.5 bg-primary z-20"
                style={{ left: todayOffset, height: rows.length * ROW_HEIGHT }}
              />

              {/* Rows */}
              {rows.map((row, i) => (
                <div
                  key={i}
                  className={cn(
                    "relative border-b border-border/30",
                    row.type === "project" && "bg-muted/10"
                  )}
                  style={{ height: ROW_HEIGHT }}
                >
                  {row.type === "task" && row.task && (row.task.deadline || row.task.created_at) && (() => {
                    const { left, width } = getBarStyle(row.task!);
                    const isOverdue = row.task!.deadline && isPast(parseISO(row.task!.deadline)) && !row.task!.is_completed;
                    const color = row.project.color || "#3b82f6";

                    return (
                      <div
                        className={cn(
                          "absolute top-1.5 rounded-sm h-5 flex items-center px-1.5 text-[10px] font-medium text-white truncate transition-all",
                          isOverdue && "opacity-80"
                        )}
                        style={{
                          left,
                          width,
                          backgroundColor: isOverdue ? "hsl(var(--destructive))" : color,
                          minWidth: 8,
                        }}
                        title={`${row.task!.title}${row.task!.deadline ? ` → ${format(parseISO(row.task!.deadline), "d MMM", { locale: ru })}` : ""}`}
                      >
                        {width > 50 && (
                          <span className="truncate">{row.task!.title}</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

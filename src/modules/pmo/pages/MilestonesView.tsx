import { useMemo, useState, useCallback } from "react";
import { useTaskGroups, useAvailableUsers, type TaskGroup, type Profile } from "@/hooks/useTasks";
import { useMilestones, type Milestone, useMilestoneMutations } from "@/hooks/useMilestones";
import { NPD_GATES } from "@/modules/npd/components/matrix/types";
import { cn } from "@/lib/utils";
import { format, isPast, parseISO, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";
import { Flag, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import MilestoneDialog from "@/modules/pmo/components/MilestoneDialog";

const GATE_STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: { label: "⏳ Ожидает", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "🔄 В процессе", className: "bg-blue-500/10 text-blue-600" },
  go: { label: "✅ Go", className: "bg-emerald-500/10 text-emerald-600" },
  no_go: { label: "❌ No-Go", className: "bg-destructive/10 text-destructive" },
  conditional: { label: "⚠️ Условно", className: "bg-amber-500/10 text-amber-600" },
  completed: { label: "✓ Завершена", className: "bg-emerald-500/10 text-emerald-600" },
  missed: { label: "✗ Пропущена", className: "bg-destructive/10 text-destructive" },
};

export default function MilestonesView() {
  const { data: groups = [] } = useTaskGroups();
  const { data: milestones = [] } = useMilestones();
  const { data: users = [] } = useAvailableUsers();
  const { updateMilestone, deleteMilestone } = useMilestoneMutations();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetGroup, setDropTargetGroup] = useState<string | null>(null);
  const [editingMs, setEditingMs] = useState<Milestone | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const userMap = useMemo(() => {
    const m = new Map<string, Profile>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const groupMap = useMemo(() => {
    const m = new Map<string, TaskGroup>();
    for (const g of groups) m.set(g.id, g);
    return m;
  }, [groups]);

  const byProject = useMemo(() => {
    const map = new Map<string, Milestone[]>();
    for (const ms of milestones) {
      if (!map.has(ms.group_id)) map.set(ms.group_id, []);
      map.get(ms.group_id)!.push(ms);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.planned_date.localeCompare(b.planned_date));
    }
    return Array.from(map.entries())
      .map(([groupId, items]) => ({ groupId, group: groupMap.get(groupId), items }))
      .filter((g) => g.group)
      .sort((a, b) => (a.group!.name).localeCompare(b.group!.name, "ru"));
  }, [milestones, groupMap]);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // DnD handlers
  const handleDragStart = useCallback((e: React.DragEvent, msId: string) => {
    setDraggedId(msId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", msId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetGroup(groupId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetGroupId: string) => {
    e.preventDefault();
    if (draggedId) {
      const ms = milestones.find(m => m.id === draggedId);
      if (ms && ms.group_id !== targetGroupId) {
        updateMilestone.mutate({ id: draggedId, group_id: targetGroupId } as any);
      }
    }
    setDraggedId(null);
    setDropTargetGroup(null);
  }, [draggedId, milestones, updateMilestone]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTargetGroup(null);
  }, []);

  const totalMs = milestones.length;
  const completedMs = milestones.filter((m) => m.status === "completed" || m.status === "go").length;
  const overdueMs = milestones.filter((m) => m.status !== "completed" && m.status !== "go" && m.planned_date && isPast(parseISO(m.planned_date))).length;
  const upcomingMs = milestones.filter((m) => {
    if (m.status === "completed" || m.status === "go" || !m.planned_date) return false;
    const d = differenceInDays(parseISO(m.planned_date), new Date());
    return d >= 0 && d <= 14;
  }).length;

  if (milestones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Flag className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Вехи</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">Создайте вехи в проектах через вкладку Гант, чтобы видеть сводку здесь.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 scrollbar-thin">
      {/* Summary */}
      <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
        <span>Всего: <strong className="text-foreground">{totalMs}</strong></span>
        <span>Завершено: <strong className="text-success">{completedMs}</strong></span>
        {overdueMs > 0 && <span>Просрочено: <strong className="text-destructive">{overdueMs}</strong></span>}
        {upcomingMs > 0 && <span>Скоро: <strong className="text-warning">{upcomingMs}</strong></span>}
      </div>

      <div className="space-y-1">
        {byProject.map(({ groupId, group, items }) => {
          const isExpanded = expandedGroups.has(groupId);
          const groupCompleted = items.filter((m) => m.status === "completed" || m.status === "go").length;
          const groupOverdue = items.filter((m) => m.status !== "completed" && m.status !== "go" && m.planned_date && isPast(parseISO(m.planned_date))).length;
          const isDropTarget = dropTargetGroup === groupId;

          return (
            <div
              key={groupId}
              onDragOver={(e) => handleDragOver(e, groupId)}
              onDrop={(e) => handleDrop(e, groupId)}
              onDragLeave={() => setDropTargetGroup(null)}
            >
              {/* Project header */}
              <button
                onClick={() => toggleGroup(groupId)}
                className={cn(
                  "flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left",
                  isDropTarget && draggedId && "ring-2 ring-primary bg-primary/5"
                )}
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: group!.color || "hsl(var(--primary))" }}
                />
                <span className="text-sm font-medium text-foreground truncate">{group!.name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                  {groupCompleted}/{items.length}
                  {groupOverdue > 0 && <span className="text-destructive ml-1.5">⚠ {groupOverdue}</span>}
                </span>
              </button>

              {/* Milestones list */}
              {isExpanded && (
                <div className="ml-6 mb-2 space-y-0.5">
                  {items.map((ms) => {
                    const isCompleted = ms.status === "completed" || ms.status === "go";
                    const isOverdue = !isCompleted && ms.planned_date && isPast(parseISO(ms.planned_date));
                    const daysLeft = ms.planned_date ? differenceInDays(parseISO(ms.planned_date), new Date()) : null;
                    const statusInfo = GATE_STATUS_MAP[ms.status] || GATE_STATUS_MAP.pending;
                    const isDragged = draggedId === ms.id;

                    return (
                      <div
                        key={ms.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, ms.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => { setEditingMs(ms); setDialogOpen(true); }}
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer",
                          isCompleted ? "opacity-60" : "hover:bg-muted/30",
                          isDragged && "opacity-30"
                        )}
                      >
                        {/* Drag handle */}
                        <GripVertical className="h-3 w-3 text-muted-foreground/30 shrink-0 cursor-grab" />

                        {/* Status icon */}
                        {isCompleted ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                        ) : isOverdue ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        ) : (
                          <Flag className="h-3.5 w-3.5 shrink-0" style={{ color: ms.color || "hsl(var(--primary))" }} />
                        )}

                        {/* Name */}
                        <span className={cn("flex-1 truncate", isCompleted && "line-through text-muted-foreground", isOverdue && "text-destructive font-medium")}>
                          {ms.name}
                        </span>

                        {/* Gate key badge */}
                        {(ms as any).gate_key && (() => {
                          const gate = NPD_GATES.find(g => g.key === (ms as any).gate_key);
                          return gate ? (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 border-purple-500/40 text-purple-600 dark:text-purple-400">
                              {gate.short}
                            </Badge>
                          ) : null;
                        })()}

                        {/* Gate result badge */}
                        {ms.status !== "pending" && (
                          <Badge variant="secondary" className={cn("text-[9px] px-1.5 py-0 shrink-0", statusInfo.className)}>
                            {statusInfo.label}
                          </Badge>
                        )}

                        {/* Date */}
                        <span className={cn("text-[10px] shrink-0", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                          {ms.planned_date ? format(parseISO(ms.planned_date), "d MMM yyyy", { locale: ru }) : "—"}
                        </span>

                        {/* Days indicator */}
                        {!isCompleted && daysLeft !== null && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className={cn(
                                "text-[9px] px-1 py-0",
                                isOverdue ? "bg-destructive/10 text-destructive" : daysLeft <= 7 ? "bg-warning/10 text-warning" : ""
                              )}>
                                {isOverdue ? `−${Math.abs(daysLeft)}д` : `${daysLeft}д`}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">{isOverdue ? "Дней просрочки" : "Дней до вехи"}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit dialog */}
      <MilestoneDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        milestone={editingMs}
        projects={groups}
        onSave={(data) => {
          if (editingMs) {
            updateMilestone.mutate({ id: editingMs.id, ...data });
          }
        }}
        onDelete={(id) => {
          deleteMilestone.mutate(id);
        }}
      />
    </div>
  );
}

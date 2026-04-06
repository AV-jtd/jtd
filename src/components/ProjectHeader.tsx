import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, GanttChart, Grid3X3, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskGroups, useTasks, type TaskGroup } from "@/hooks/useTasks";
import { useMilestones } from "@/hooks/useMilestones";
import { useMemo } from "react";
import { parseISO } from "date-fns";
import UndoRedoButtons from "@/components/UndoRedoButtons";

const NPD_GATES_META = [
  { key: "gate0", short: "G0", label: "Идея", tagName: "Gate 0: Идея и Стратегия", color: "bg-slate-500", text: "text-slate-600", ring: "ring-slate-400" },
  { key: "gate1", short: "G1", label: "Концепция", tagName: "Gate 1: Концепция и Экономика", color: "bg-blue-500", text: "text-blue-600", ring: "ring-blue-400" },
  { key: "gate2", short: "G2", label: "Разработка", tagName: "Gate 2: Разработка и Валидация", color: "bg-amber-500", text: "text-amber-600", ring: "ring-amber-400" },
  { key: "gate3", short: "G3", label: "Подготовка", tagName: "Gate 3: Подготовка к запуску", color: "bg-purple-500", text: "text-purple-600", ring: "ring-purple-400" },
  { key: "gate4", short: "G4", label: "Запуск", tagName: "Gate 4: Запуск", color: "bg-emerald-500", text: "text-emerald-600", ring: "ring-emerald-400" },
  { key: "gate5", short: "G5", label: "Анализ", tagName: "Gate 5: Анализ запуска", color: "bg-rose-500", text: "text-rose-600", ring: "ring-rose-400" },
] as const;

type ProjectView = "dashboard" | "gantt" | "matrix";

interface ProjectHeaderProps {
  projectId: string;
  activeView: ProjectView;
  onViewChange: (view: ProjectView) => void;
  onBack?: () => void;
}

export default function ProjectHeader({ projectId, activeView, onViewChange, onBack }: ProjectHeaderProps) {
  const { data: groups = [] } = useTaskGroups();
  const { data: allTasks = [] } = useTasks();
  const { data: milestones = [] } = useMilestones();
  const navigate = useNavigate();

  const project = useMemo(() => groups.find(g => g.id === projectId), [groups, projectId]);
  const isNpd = project?.project_type === "npd";

  // Compute progress
  const stats = useMemo(() => {
    const childIds = new Set(groups.filter(g => g.parent_id === projectId).map(g => g.id));
    const tasks = allTasks.filter(t => t.group_id === projectId || (t.group_id && childIds.has(t.group_id)));
    const total = tasks.length;
    const done = tasks.filter(t => t.is_completed).length;
    return { total, done };
  }, [allTasks, groups, projectId]);

  // Determine active gate from gate milestones
  const activeGateKey = useMemo(() => {
    if (!isNpd) return null;
    const childIds = new Set(groups.filter(g => g.parent_id === projectId).map(g => g.id));
    const projectMilestones = milestones.filter(m =>
      (m.group_id === projectId || childIds.has(m.group_id)) && (m as any).gate_key
    );
    const now = new Date();
    // Find the latest gate milestone that is in the past or today
    let activeKey: string | null = null;
    let latestDate: Date | null = null;
    for (const ms of projectMilestones) {
      const d = parseISO(ms.planned_date);
      if (d <= now) {
        if (!latestDate || d > latestDate) {
          latestDate = d;
          activeKey = (ms as any).gate_key;
        }
      }
    }
    // If no milestone passed yet, default to gate0
    if (!activeKey && projectMilestones.length > 0) activeKey = "gate0";
    return activeKey;
  }, [isNpd, milestones, groups, projectId]);

  const views: { id: ProjectView; icon: React.ElementType; label: string; disabled?: boolean }[] = [
    { id: "dashboard", icon: LayoutDashboard, label: "Обзор" },
    { id: "gantt", icon: GanttChart, label: "Гантт" },
    { id: "matrix", icon: Grid3X3, label: "Матрица", disabled: !isNpd },
  ];

  if (!project) return null;

  return (
    <header className="flex items-center h-12 px-3 md:px-4 border-b border-border bg-card shrink-0 gap-2">
      {/* Back */}
      <button
        onClick={onBack || (() => navigate("/pmo"))}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      {/* Project icon + name */}
      <div className="flex items-center gap-1.5 min-w-0 shrink">
        <span className="text-sm shrink-0">{project.icon && project.icon !== "list" ? project.icon : "📁"}</span>
        <h1 className="text-sm font-bold text-foreground truncate">{project.name}</h1>
      </div>

      {/* Progress */}
      {stats.total > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((stats.done / stats.total) * 100)}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">{stats.done}/{stats.total}</span>
        </div>
      )}

      {/* Gate pills (NPD only) */}
      {isNpd && (
        <>
          <div className="h-5 w-px bg-border mx-0.5 shrink-0" />
          <div className="flex items-center gap-0.5 shrink-0">
            {NPD_GATES_META.map(gate => {
              const isActive = activeGateKey === gate.key;
              const gateIdx = NPD_GATES_META.findIndex(g => g.key === gate.key);
              const activeIdx = activeGateKey ? NPD_GATES_META.findIndex(g => g.key === activeGateKey) : -1;
              const isPassed = activeIdx >= 0 && gateIdx < activeIdx;
              return (
                <span
                  key={gate.key}
                  className={cn(
                    "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold transition-all",
                    isActive
                      ? `${gate.color} text-white ring-2 ${gate.ring} ring-offset-1 ring-offset-card`
                      : isPassed
                        ? "bg-muted text-muted-foreground line-through opacity-50"
                        : "bg-muted/50 text-muted-foreground/40"
                  )}
                  title={`${gate.short}: ${gate.label}`}
                >
                  {gate.short}
                </span>
              );
            })}
          </div>
        </>
      )}

      <div className="flex-1" />

      {/* View switcher */}
      <div className="flex items-center bg-muted rounded-md p-0.5 shrink-0">
        {views.map(v => {
          const Icon = v.icon;
          const isActive = activeView === v.id;
          return (
            <button
              key={v.id}
              onClick={() => !v.disabled && onViewChange(v.id)}
              disabled={v.disabled}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : v.disabled
                    ? "text-muted-foreground/30 cursor-not-allowed"
                    : "text-muted-foreground hover:text-foreground"
              )}
              title={v.disabled ? "Только для NPD-проектов" : v.label}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{v.label}</span>
            </button>
          );
        })}
      </div>

      <div className="h-4 w-px bg-border shrink-0" />

      <UndoRedoButtons />
    </header>
  );
}

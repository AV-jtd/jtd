import { useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, GanttChart, Grid3X3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskGroups, useTasks, type TaskGroup } from "@/hooks/useTasks";
import { useMilestones } from "@/hooks/useMilestones";
import { useMemo } from "react";
import { parseISO } from "date-fns";

const NPD_GATES_META = [
  { key: "gate0", short: "G0", label: "Идея", color: "from-slate-400 to-slate-500", ring: "ring-slate-400/50", pill: "bg-slate-500" },
  { key: "gate1", short: "G1", label: "Концепция", color: "from-blue-400 to-blue-500", ring: "ring-blue-400/50", pill: "bg-blue-500" },
  { key: "gate2", short: "G2", label: "Разработка", color: "from-amber-400 to-amber-500", ring: "ring-amber-400/50", pill: "bg-amber-500" },
  { key: "gate3", short: "G3", label: "Подготовка", color: "from-purple-400 to-purple-500", ring: "ring-purple-400/50", pill: "bg-purple-500" },
  { key: "gate4", short: "G4", label: "Запуск", color: "from-emerald-400 to-emerald-500", ring: "ring-emerald-400/50", pill: "bg-emerald-500" },
  { key: "gate5", short: "G5", label: "Анализ", color: "from-rose-400 to-rose-500", ring: "ring-rose-400/50", pill: "bg-rose-500" },
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

  // Determine active gate from gate milestones
  const activeGateKey = useMemo(() => {
    if (!isNpd) return null;
    const childIds = new Set(groups.filter(g => g.parent_id === projectId).map(g => g.id));
    const projectMilestones = milestones.filter(m =>
      (m.group_id === projectId || childIds.has(m.group_id)) && (m as any).gate_key
    );
    const now = new Date();
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
    // Default to gate0 if no milestone has passed yet
    if (!activeKey) activeKey = "gate0";
    return activeKey;
  }, [isNpd, milestones, groups, projectId]);

  const views: { id: ProjectView; icon: React.ElementType; label: string; disabled?: boolean }[] = [
    { id: "dashboard", icon: LayoutDashboard, label: "Обзор" },
    { id: "gantt", icon: GanttChart, label: "Гантт" },
    { id: "matrix", icon: Grid3X3, label: "Матрица", disabled: !isNpd },
  ];

  if (!project) return null;

  return (
    <div className="flex items-center h-10 px-3 md:px-4 border-b border-border/50 shrink-0 gap-2 backdrop-blur-xl bg-card/70 supports-[backdrop-filter]:bg-card/60">
      {/* Back */}
      <button
        onClick={onBack || (() => navigate("/pmo"))}
        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors shrink-0"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>

      {/* Project icon + name */}
      <div className="flex items-center gap-1.5 min-w-0 shrink">
        <span className="text-sm shrink-0">{project.icon && project.icon !== "list" ? project.icon : "📁"}</span>
        <h1 className="text-sm font-bold text-foreground truncate">{project.name}</h1>
      </div>

      {/* Gate pills (NPD) — replaces counter */}
      {isNpd && (
        <div className="flex items-center gap-[3px] shrink-0 ml-1">
          {NPD_GATES_META.map(gate => {
            const gateIdx = NPD_GATES_META.findIndex(g => g.key === gate.key);
            const activeIdx = activeGateKey ? NPD_GATES_META.findIndex(g => g.key === activeGateKey) : -1;
            const isActive = activeGateKey === gate.key;
            const isPassed = activeIdx >= 0 && gateIdx < activeIdx;
            return (
              <span
                key={gate.key}
                className={cn(
                  "inline-flex items-center justify-center rounded-full text-[9px] font-bold transition-all leading-none",
                  isActive
                    ? `${gate.pill} text-white shadow-sm shadow-current/20 ring-2 ${gate.ring} ring-offset-1 ring-offset-transparent px-1.5 py-0.5 scale-110`
                    : isPassed
                      ? "bg-muted text-muted-foreground/50 line-through px-1 py-0.5"
                      : "bg-muted/60 text-muted-foreground/30 px-1 py-0.5"
                )}
                title={`${gate.short}: ${gate.label}`}
              >
                {gate.short}
              </span>
            );
          })}
        </div>
      )}

      <div className="flex-1" />

      {/* View switcher — glass style */}
      <div className="flex items-center backdrop-blur-sm bg-muted/50 rounded-lg p-0.5 shrink-0 border border-border/30">
        {views.map(v => {
          const Icon = v.icon;
          const active = activeView === v.id;
          return (
            <button
              key={v.id}
              onClick={() => !v.disabled && onViewChange(v.id)}
              disabled={v.disabled}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium transition-all",
                active
                  ? "bg-background/90 text-foreground shadow-sm backdrop-blur-sm"
                  : v.disabled
                    ? "text-muted-foreground/30 cursor-not-allowed"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/40"
              )}
              title={v.disabled ? "Только для NPD-проектов" : v.label}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{v.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

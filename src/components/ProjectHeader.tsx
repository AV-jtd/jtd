import { useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutDashboard, GanttChart, Grid3X3, LayoutGrid, Lock, Unlock, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskGroups, useTasksByGroupIds, useTaskMutations, useAvailableUsers } from "@/hooks/useTasks";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const NPD_GATES_META = [
  { key: "gate0", short: "G0", label: "Идея", tagName: "Gate 0: Идея и Стратегия", color: "bg-slate-500" },
  { key: "gate1", short: "G1", label: "Концепция", tagName: "Gate 1: Концепция и Экономика", color: "bg-blue-500" },
  { key: "gate2", short: "G2", label: "Разработка", tagName: "Gate 2: Разработка и Валидация", color: "bg-amber-500" },
  { key: "gate3", short: "G3", label: "Подготовка", tagName: "Gate 3: Подготовка к запуску", color: "bg-purple-500" },
  { key: "gate4", short: "G4", label: "Запуск", tagName: "Gate 4: Запуск", color: "bg-emerald-500" },
  { key: "gate5", short: "G5", label: "Анализ", tagName: "Gate 5: Анализ запуска", color: "bg-rose-500" },
] as const;

type ProjectView = "dashboard" | "gantt" | "matrix" | "kanban";

interface ProjectHeaderProps {
  projectId: string;
  activeView: ProjectView;
  onViewChange: (view: ProjectView) => void;
  onBack?: () => void;
}

export default function ProjectHeader({ projectId, activeView, onViewChange, onBack }: ProjectHeaderProps) {
  const { user } = useAuth();
  const { data: groups = [] } = useTaskGroups();
  const { data: availableUsers = [] } = useAvailableUsers();
  const { lockBaseline, unlockBaseline } = useTaskMutations();
  const navigate = useNavigate();

  const project = useMemo(() => groups.find(g => g.id === projectId), [groups, projectId]);
  const isNpd = project?.project_type === "npd";
  const childIds = useMemo(() => groups.filter(g => g.parent_id === projectId).map(g => g.id), [groups, projectId]);
  const projectScopeIds = useMemo(() => [projectId, ...childIds], [projectId, childIds]);
  const { data: allTasks = [] } = useTasksByGroupIds(projectScopeIds);

  // Baseline status
  const baselineStatus = (project as any)?.baseline_status || 'planning';
  const isPlanning = baselineStatus === 'planning';
  const autoLockHours = (project as any)?.baseline_auto_lock_hours || 48;
  const approverId = (project as any)?.baseline_approver_id;
  const approverName = approverId ? (availableUsers.find(u => u.id === approverId)?.display_name || 'Утверждающий') : null;

  // Calculate time remaining for auto-lock
  const autoLockRemaining = useMemo(() => {
    if (!isPlanning || !project) return null;
    const created = new Date(project.created_at).getTime();
    const lockAt = created + autoLockHours * 60 * 60 * 1000;
    const remaining = lockAt - Date.now();
    if (remaining <= 0) return 0;
    const hours = Math.ceil(remaining / (1000 * 60 * 60));
    return hours;
  }, [isPlanning, project, autoLockHours]);

  // Check if current user is owner or approver
  const canLock = user && project && (project.user_id === user.id || approverId === user.id);

  // Fetch gate from group_tags (same logic as NpdBoard)
  const { data: activeGateIdx } = useQuery({
    queryKey: ["project-header-gate", projectId],
    queryFn: async () => {
      const gateNames = NPD_GATES_META.map(g => g.tagName as string);
      const { data: gateTags } = await supabase
        .from("tags")
        .select("id, name")
        .in("name", gateNames);
      if (!gateTags?.length) return 0;

      const tagNameToKey = new Map<string, string>();
      for (const g of NPD_GATES_META) tagNameToKey.set(g.tagName, g.key);
      const tagIdToKey = new Map<string, string>();
      for (const t of gateTags) {
        const k = tagNameToKey.get(t.name);
        if (k) tagIdToKey.set(t.id, k);
      }

      const allIds = [projectId, ...childIds];
      const { data: groupTags } = await supabase
        .from("group_tags" as any)
        .select("group_id, tag_id")
        .in("group_id", allIds) as { data: { group_id: string; tag_id: string }[] | null; error: any };

      const relevant = groupTags || [];

      let maxIdx = -1;
      for (const gt of relevant) {
        const key = tagIdToKey.get(gt.tag_id);
        if (key) {
          const idx = NPD_GATES_META.findIndex(g => g.key === key);
          if (idx > maxIdx) maxIdx = idx;
        }
      }
      return maxIdx >= 0 ? maxIdx : 0;
    },
    enabled: !!user && isNpd === true,
    staleTime: 1000 * 60 * 5,
  });

  const pct = useMemo(() => {
    if (!project) return 0;
    const allIds = new Set([projectId, ...childIds]);
    const tasks = allTasks.filter(t => t.group_id && allIds.has(t.group_id));
    const total = tasks.length;
    const done = tasks.filter(t => t.is_completed).length;
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [project, allTasks, projectId, childIds]);

  const views: { id: ProjectView; icon: React.ElementType; label: string; disabled?: boolean }[] = [
    { id: "dashboard", icon: LayoutDashboard, label: "Обзор" },
    { id: "gantt", icon: GanttChart, label: "Гантт" },
    { id: "matrix", icon: Grid3X3, label: "Матрица", disabled: !isNpd },
    { id: "kanban", icon: LayoutGrid, label: "Канбан" },
  ];

  if (!project) return null;

  const gateIdx = activeGateIdx ?? 0;
  const activeGate = isNpd ? NPD_GATES_META[gateIdx] : null;

  const handleLock = () => {
    lockBaseline.mutate({ id: projectId });
    toast.success("Базовый план зафиксирован. Drift отслеживается.");
  };

  const handleUnlock = () => {
    unlockBaseline.mutate({ id: projectId });
    toast.success("Базовый план разблокирован. Режим планирования.");
  };

  return (
    <div className="shrink-0">
      <div className="flex items-center h-10 px-3 md:px-4 border-b border-border/50 gap-2 backdrop-blur-xl bg-card/70 supports-[backdrop-filter]:bg-card/60">
        <button
          onClick={onBack || (() => navigate("/pmo"))}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors shrink-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-1.5 min-w-0 shrink">
          {(project as any).logo_url ? (
            <img
              src={(project as any).logo_url}
              alt={project.name}
              className="h-5 w-5 shrink-0 rounded object-cover ring-1 ring-border"
            />
          ) : (
            <span className="text-sm shrink-0">{project.icon && project.icon !== "list" ? project.icon : "📁"}</span>
          )}
          <h1 className="text-sm font-bold text-foreground truncate">{project.name}</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-1">
          <div className="flex items-center gap-1.5">
            <div className="w-16 md:w-20 h-1.5 rounded-full bg-muted/60 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-7 text-right">{pct}%</span>
          </div>

          {activeGate && (
            <span className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white leading-none",
              activeGate.color
            )} title={`${activeGate.short}: ${activeGate.label}`}>
              {activeGate.short}
            </span>
          )}
        </div>

        <div className="flex-1" />

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

      {/* Baseline status banner */}
      {canLock && (
        <div className={cn(
          "flex items-center gap-2 px-3 md:px-4 py-1.5 text-xs border-b transition-colors",
          isPlanning
            ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
        )}>
          {isPlanning ? (
            <>
              <Clock className="h-3 w-3 shrink-0" />
              <span className="truncate">
                Планирование
                {autoLockRemaining !== null && autoLockRemaining > 0 && (
                  <> · автофиксация через {autoLockRemaining}ч</>
                )}
                {autoLockRemaining === 0 && <> · автофиксация скоро</>}
                {approverName && <> · утверждает: {approverName}</>}
              </span>
              <div className="flex-1" />
              <button
                onClick={handleLock}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 font-medium transition-colors shrink-0"
              >
                <Lock className="h-3 w-3" /> Зафиксировать
              </button>
            </>
          ) : (
            <>
              <Lock className="h-3 w-3 shrink-0" />
              <span className="truncate">Сроки зафиксированы · drift отслеживается</span>
              <div className="flex-1" />
              <button
                onClick={handleUnlock}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 font-medium transition-colors shrink-0"
              >
                <Unlock className="h-3 w-3" /> Разблокировать
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

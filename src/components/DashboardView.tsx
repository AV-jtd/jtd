import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useTasks, useTaskGroups, useAvailableUsers, useVisibleTags, useTaskMutations, Task, TaskGroup, Profile, Tag } from "@/hooks/useTasks";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users, ListChecks, ChevronDown as ChevronDownIcon } from "lucide-react";
import {
  BarChart3, Loader2, TrendingUp, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronRight, CalendarClock, ArrowRightLeft, Filter, X,
  SlidersHorizontal, FolderOpen, User, Tag as TagIcon, BookOpen, Sparkles, Plus, RefreshCw
} from "lucide-react";
import DashboardExportDialog from "@/components/DashboardExportDialog";
import QuickCreateForm from "@/components/QuickCreateForm";
import type { QuickCreateResult } from "@/components/QuickCreateForm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ProjectWikiTab from "@/components/wiki/ProjectWikiTab";
import { format, differenceInDays, isAfter, isBefore, startOfDay, addDays, subDays, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { Checkbox } from "@/components/ui/checkbox";
import ReactMarkdown from "react-markdown";
import { streamChat, StreamChatError } from "@/lib/streamChat";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

type TimingStatus = "on-track" | "at-risk" | "overdue" | "completed";
type FilterStatus = "all" | TimingStatus;

interface ProjectStats {
  group: TaskGroup;
  tasks: Task[];
  total: number;
  completed: number;
  active: number;
  overdue: number;
  driftCount: number;
  avgDriftDays: number;
  nextDeadline: string | null;
  timingStatus: TimingStatus;
  subprojects: ProjectStats[];
  upcomingTasks: Task[];
  overdueTasks: Task[];
  driftTasks: { task: Task; driftDays: number }[];
  completionHistory: { date: string; count: number }[];
}

function getTimingStatus(tasks: Task[]): TimingStatus {
  const activeTasks = tasks.filter(t => !t.is_completed);
  if (activeTasks.length === 0 && tasks.length > 0) return "completed";
  if (activeTasks.length === 0) return "on-track";
  const now = new Date();
  const hasOverdue = activeTasks.some(t => t.deadline && new Date(t.deadline) < now);
  if (hasOverdue) return "overdue";
  const hasDrift = activeTasks.some(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline);
  if (hasDrift) return "at-risk";
  return "on-track";
}

function getStatusColor(status: TimingStatus) {
  switch (status) {
    case "on-track": return "bg-emerald-500";
    case "at-risk": return "bg-amber-500";
    case "overdue": return "bg-red-500";
    case "completed": return "bg-muted-foreground/40";
  }
}

function getStatusLabel(status: TimingStatus) {
  switch (status) {
    case "on-track": return "В графике";
    case "at-risk": return "Сдвиг";
    case "overdue": return "Просрочено";
    case "completed": return "Завершён";
  }
}

function getStatusBadgeVariant(status: TimingStatus) {
  switch (status) {
    case "on-track": return "text-emerald-700 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400";
    case "at-risk": return "text-amber-700 bg-amber-500/10 border-amber-500/20 dark:text-amber-400";
    case "overdue": return "text-red-700 bg-red-500/10 border-red-500/20 dark:text-red-400";
    case "completed": return "text-muted-foreground bg-muted border-border";
  }
}

function buildCompletionHistory(tasks: Task[]): { date: string; count: number }[] {
  const now = new Date();
  const days = 14;
  const buckets: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = subDays(now, i);
    buckets[format(d, "yyyy-MM-dd")] = 0;
  }
  tasks.forEach(t => {
    if (t.is_completed && t.completed_at) {
      const key = format(new Date(t.completed_at), "yyyy-MM-dd");
      if (key in buckets) buckets[key]++;
    }
  });
  return Object.entries(buckets).map(([date, count]) => ({ date, count }));
}

function buildProjectStats(
  group: TaskGroup,
  allTasks: Task[],
  allGroups: TaskGroup[],
  filterAssignees?: string[],
  filterTagIds?: string[],
  filterParticipantIds?: string[],
  participantMap?: Map<string, Set<string>>,
): ProjectStats {
  let tasks = allTasks.filter(t => t.group_id === group.id);

  if (filterAssignees && filterAssignees.length > 0) {
    tasks = tasks.filter(t =>
      (t.assigned_to && filterAssignees.includes(t.assigned_to)) ||
      filterAssignees.includes(t.user_id)
    );
  }
  if (filterTagIds && filterTagIds.length > 0) {
    tasks = tasks.filter(t =>
      filterTagIds.some(tagId => t.task_tags?.some(tt => tt.tag_id === tagId))
    );
  }
  if (filterParticipantIds && filterParticipantIds.length > 0 && participantMap) {
    tasks = tasks.filter(t => {
      const taskParticipants = participantMap.get(t.id);
      return taskParticipants && filterParticipantIds.some(pid => taskParticipants.has(pid));
    });
  }

  const childGroups = allGroups.filter(g => g.parent_id === group.id);
  const subprojects = childGroups.map(cg => buildProjectStats(cg, allTasks, allGroups, filterAssignees, filterTagIds, filterParticipantIds, participantMap));

  const allProjectTasks = [...tasks, ...subprojects.flatMap(sp => sp.tasks)];
  const total = allProjectTasks.length;
  const completed = allProjectTasks.filter(t => t.is_completed).length;
  const active = total - completed;
  const now = new Date();
  const overdue = allProjectTasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now).length;

  const driftTasks = allProjectTasks
    .filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline)
    .map(t => ({
      task: t,
      driftDays: differenceInDays(new Date(t.deadline!), new Date(t.original_deadline!)),
    }))
    .sort((a, b) => Math.abs(b.driftDays) - Math.abs(a.driftDays));

  const weekFromNow = addDays(startOfDay(now), 7);
  const upcomingTasks = allProjectTasks
    .filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  const overdueTasks = allProjectTasks
    .filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  const nextDeadline = allProjectTasks
    .filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= now)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0]?.deadline || null;

  return {
    group,
    tasks,
    total,
    completed,
    active,
    overdue,
    driftCount: driftTasks.length,
    avgDriftDays: driftTasks.length > 0 ? Math.round(driftTasks.reduce((s, d) => s + d.driftDays, 0) / driftTasks.length) : 0,
    nextDeadline,
    timingStatus: getTimingStatus(allProjectTasks),
    subprojects,
    upcomingTasks,
    overdueTasks,
    driftTasks,
    completionHistory: buildCompletionHistory(allProjectTasks),
  };
}

// --- Sparkline ---
function Sparkline({ data, color = "hsl(var(--primary))" }: { data: { date: string; count: number }[]; color?: string }) {
  const hasData = data.some(d => d.count > 0);
  if (!hasData) return null;
  return (
    <div className="h-8 w-20 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${color.replace(/[^a-z0-9]/gi, "")})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Clickable Summary Card ---
type SummaryMetric = "progress" | "deadlines" | "overdue" | "drift";

function SummaryCard({ icon: Icon, value, label, color, active, onClick }: {
  icon: any; value: number | string; label: string; color: string;
  active?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "bg-card rounded-xl border border-border p-3 flex items-center gap-3 overflow-hidden transition-all text-left",
        onClick && "cursor-pointer hover:shadow-md hover:border-primary/30",
        active && "ring-2 ring-primary/40 border-primary/30 shadow-md"
      )}
    >
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", color)}>
        <Icon className="h-4.5 w-4.5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold leading-tight truncate">{value}</p>
        <p className="text-[11px] text-muted-foreground leading-tight truncate">{label}</p>
      </div>
    </button>
  );
}

// --- Expanded metric panel ---
type SubtaskMap = Map<string, { total: number; completed: number; subtasks: { id: string; title: string; is_completed: boolean }[] }>;

function MetricExpander({ metric, projectStats, onNavigateToTask, users, onClose, subtaskMap }: {
  metric: SummaryMetric;
  projectStats: ProjectStats[];
  onNavigateToTask: (taskId: string) => void;
  users: Profile[];
  onClose: () => void;
  subtaskMap?: SubtaskMap;
}) {
  const userName = (userId: string) => users.find(u => u.id === userId)?.display_name || "—";

  const { title, tasks, variant } = useMemo(() => {
    const allTasks = projectStats.flatMap(s => [...s.tasks, ...s.subprojects.flatMap(sp => sp.tasks)]);
    const unique = Array.from(new Map(allTasks.map(t => [t.id, t])).values());
    const now = new Date();
    const weekFromNow = addDays(startOfDay(now), 7);

    switch (metric) {
      case "deadlines":
        return {
          title: "Дедлайны на неделе",
          tasks: unique.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow)
            .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()),
          variant: undefined as "overdue" | undefined,
        };
      case "overdue":
        return {
          title: "Просроченные задачи",
          tasks: unique.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now)
            .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()),
          variant: "overdue" as const,
        };
      case "drift":
        return {
          title: "Задачи с отклонениями",
          tasks: unique.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline)
            .sort((a, b) => {
              const da = differenceInDays(new Date(a.deadline!), new Date(a.original_deadline!));
              const db = differenceInDays(new Date(b.deadline!), new Date(b.original_deadline!));
              return Math.abs(db) - Math.abs(da);
            }),
          variant: undefined,
        };
      default:
        return { title: "", tasks: [], variant: undefined };
    }
  }, [metric, projectStats]);

  if (metric === "progress" || tasks.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border p-3 mb-4 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground">{title} ({tasks.length})</span>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <div className="space-y-0.5 max-h-64 overflow-y-auto scrollbar-thin">
        {tasks.map(t => {
          const drift = t.original_deadline && t.deadline && t.original_deadline !== t.deadline
            ? differenceInDays(new Date(t.deadline!), new Date(t.original_deadline!))
            : undefined;
          return (
            <TaskRow
              key={t.id}
              task={t}
              onClick={() => onNavigateToTask(t.id)}
              userName={userName(t.assigned_to || t.user_id)}
              variant={variant}
              drift={metric === "drift" ? drift : undefined}
              subtaskInfo={subtaskMap?.get(t.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

// --- AI Signal type ---
interface AiSignal {
  level: "red" | "amber" | "green";
  title: string;
  desc: string;
  action: string;
  project: string | null;
  person: string | null;
}

function signalLevelStyles(level: AiSignal["level"]) {
  switch (level) {
    case "red": return { bg: "bg-red-500/10 border-red-500/30 dark:bg-red-500/15", dot: "bg-red-500", text: "text-red-700 dark:text-red-400", badge: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20" };
    case "amber": return { bg: "bg-amber-500/10 border-amber-500/30 dark:bg-amber-500/15", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20" };
    case "green": return { bg: "bg-emerald-500/10 border-emerald-500/30 dark:bg-emerald-500/15", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" };
  }
}

// --- AI Signals Panel ---
function AiSignalsPanel({ projectStats, users, onNavigateToProject, onAiTextChange }: {
  projectStats: ProjectStats[];
  users: Profile[];
  onNavigateToProject?: (groupName: string) => void;
  onAiTextChange?: (text: string) => void;
}) {
  const [signals, setSignals] = useState<AiSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);
  const generateRef = useRef<(() => void) | null>(null);

  const generate = useCallback(async () => {
    if (loading || projectStats.length === 0) return;
    setLoading(true);
    setError(null);

    const userName = (userId: string) => users.find(u => u.id === userId)?.display_name || "—";
    const now = new Date();

    // Build assignee workload map
    const allTasks = projectStats.flatMap(s => [...s.tasks, ...s.subprojects.flatMap(sp => sp.tasks)]);
    const unique = Array.from(new Map(allTasks.map(t => [t.id, t])).values());
    const activeTasks = unique.filter(t => !t.is_completed);

    const assigneeLoad: Record<string, { name: string; total: number; overdue: number; drift: number }> = {};
    activeTasks.forEach(t => {
      const uid = t.assigned_to || t.user_id;
      const name = userName(uid);
      if (!assigneeLoad[uid]) assigneeLoad[uid] = { name, total: 0, overdue: 0, drift: 0 };
      assigneeLoad[uid].total++;
      if (t.deadline && new Date(t.deadline) < now) assigneeLoad[uid].overdue++;
      if (t.original_deadline && t.deadline && t.original_deadline !== t.deadline) assigneeLoad[uid].drift++;
    });

    const projectSummaries = projectStats.slice(0, 20).map(s => {
      const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
      return `- ${s.group.name}: ${pct}% (${s.completed}/${s.total}), просрочено: ${s.overdue}, drift: ${s.driftCount}, avg drift: ${s.avgDriftDays}д, статус: ${getStatusLabel(s.timingStatus)}`;
    }).join("\n");

    const loadSummary = Object.values(assigneeLoad)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(a => `  • ${a.name}: ${a.total} задач, ${a.overdue} просрочено, ${a.drift} drift`)
      .join("\n");

    const dataContext = `Дата: ${format(now, "d MMMM yyyy", { locale: ru })}
Проекты (${projectStats.length}):\n${projectSummaries}
\nНагрузка исполнителей:\n${loadSummary}`;

    const prompt = `Данные проектов:\n${dataContext}\n\nВерни JSON массив из 3-5 сигналов:\n[{\n  "level": "red"|"amber"|"green",\n  "title": "короткий заголовок (до 60 символов)",\n  "desc": "объяснение (до 120 символов)",\n  "action": "конкретное действие (до 40 символов)",\n  "project": "название проекта или null",\n  "person": "имя человека или null"\n}]\n\nПравила:\n- red: требует действия сегодня\n- amber: требует действия на этой неделе\n- green: положительная динамика\n- Всегда 1-2 red, 1-2 amber, 1 green\n- Смотри на: % просроченных, drift кластеры у одного человека, проекты с 0% и просрочками, перегрузку исполнителей`;

    try {
      let fullText = "";
      await streamChat({
        url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        body: {
          message: prompt,
          context: { module: "pmo" },
          systemPrompt: "Ты аналитик операционного управления. Анализируй данные проектов и возвращай ТОЛЬКО JSON. Никакого текста до или после JSON.",
        },
        onDelta: (chunk) => { fullText += chunk; },
        onDone: () => {
          try {
            // Extract JSON array from response
            const jsonMatch = fullText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as AiSignal[];
              setSignals(parsed.slice(0, 5));
              onAiTextChange?.(parsed.map(s => `[${s.level.toUpperCase()}] ${s.title}: ${s.desc}`).join("\n"));
            } else {
              setError("Не удалось разобрать ответ ИИ");
            }
          } catch {
            setError("Не удалось разобрать ответ ИИ");
          }
          setLoading(false);
        },
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        const errMsg = e instanceof StreamChatError && (e.status === 429 || e.status === 402)
          ? (e.status === 429 ? "Слишком много запросов. Попробуйте через минуту." : "Необходимо пополнить баланс ИИ.")
          : "ИИ временно недоступен. Попробуйте позже.";
        setError(errMsg);
      }
      setLoading(false);
    }
  }, [projectStats, users, loading]);

  generateRef.current = generate;

  // Auto-load on mount when projectStats are ready
  const statsReady = projectStats.length > 0;
  // useEffect to auto-trigger once
  useEffect(() => {
    if (statsReady && !hasLoaded.current) {
      hasLoaded.current = true;
      generateRef.current?.();
    }
  }, [statsReady]);

  if (!statsReady) return null;

  // Loading skeleton
  if (loading && signals.length === 0) {
    return (
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-xs font-semibold text-foreground">Сигналы ИИ</span>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/60" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-xl border border-border p-3 animate-pulse">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2.5 w-2.5 rounded-full bg-muted" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>
            <div className="h-3 bg-muted rounded w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-4 rounded-xl border border-border p-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground flex-1">{error}</span>
        <button onClick={generate} className="text-xs text-primary hover:underline shrink-0">Повторить</button>
      </div>
    );
  }

  if (signals.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Сигналы ИИ</span>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
          title="Обновить сигналы"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {signals.map((signal, i) => {
          const styles = signalLevelStyles(signal.level);
          const matchedProject = projectStats.find(s =>
            signal.project && s.group.name.toLowerCase().includes(signal.project.toLowerCase())
          );
          return (
            <button
              key={i}
              onClick={() => {
                if (matchedProject) onNavigateToProject?.(matchedProject.group.name);
              }}
              className={cn(
                "rounded-xl border p-3 text-left transition-all hover:shadow-md",
                styles.bg,
                matchedProject && "cursor-pointer"
              )}
            >
              <div className="flex items-start gap-2 mb-1.5">
                <div className={cn("h-2.5 w-2.5 rounded-full mt-1 shrink-0", styles.dot)} />
                <span className={cn("text-sm font-semibold leading-snug flex-1", styles.text)}>
                  {signal.title}
                </span>
              </div>
              <p className="text-xs text-foreground/70 leading-relaxed mb-2 pl-[18px]">{signal.desc}</p>
              <div className="pl-[18px] flex items-center gap-2 flex-wrap">
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border", styles.badge)}>
                  {signal.action}
                </span>
                {signal.project && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <FolderOpen className="h-3 w-3" />{signal.project}
                  </span>
                )}
                {signal.person && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />{signal.person}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Project Card ---
function ProjectCard({ stats, onNavigateToTask, users, level = 0, onCreateTask, subtaskMap }: {
  stats: ProjectStats;
  onNavigateToTask: (taskId: string) => void;
  users: Profile[];
  level?: number;
  onCreateTask?: (groupId: string, params: QuickCreateResult) => Promise<void>;
  subtaskMap?: SubtaskMap;
}) {
  const [expanded, setExpanded] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const userName = (userId: string) => users.find(u => u.id === userId)?.display_name || "—";

  return (
    <div className={cn(
      "bg-card rounded-xl border border-border overflow-hidden transition-shadow",
      expanded && "shadow-md",
      level > 0 && "border-dashed"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-white text-sm font-semibold"
          style={{ backgroundColor: stats.group.color || "hsl(var(--primary))" }}
        >
          {stats.group.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{stats.group.name}</span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
              getStatusBadgeVariant(stats.timingStatus)
            )}>
              {getStatusLabel(stats.timingStatus)}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 max-w-[140px]">
              <Progress value={pct} className="h-1.5" />
            </div>
            <span className="text-[11px] text-muted-foreground">{pct}% · {stats.completed}/{stats.total}</span>
          </div>
        </div>
        <Sparkline data={stats.completionHistory} color={stats.group.color || "hsl(var(--primary))"} />
        <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
          {stats.overdue > 0 && (
            <span className="flex items-center gap-1 text-red-500 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {stats.overdue}
            </span>
          )}
          {stats.driftCount > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium px-1.5 py-0.5 rounded-md border border-dashed border-amber-500/40 text-xs">
              <TrendingUp className="h-3.5 w-3.5" />
              {stats.driftCount}
            </span>
          )}
          {stats.nextDeadline && (
            <span className="hidden sm:flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              {format(new Date(stats.nextDeadline), "d MMM", { locale: ru })}
            </span>
          )}
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4 animate-fade-in">
          {stats.subprojects.filter(sp => sp.total > 0).length > 0 && (
            <Section title="Подпроекты" count={stats.subprojects.filter(sp => sp.total > 0).length}>
              <div className="space-y-2">
                {stats.subprojects.filter(sp => sp.total > 0).map(sp => (
                  <ProjectCard key={sp.group.id} stats={sp} onNavigateToTask={onNavigateToTask} users={users} level={level + 1} onCreateTask={onCreateTask} subtaskMap={subtaskMap} />
                ))}
              </div>
            </Section>
          )}

          {stats.overdueTasks.length > 0 && (
            <Section title="Просроченные" count={stats.overdueTasks.length} variant="destructive">
              <div className="space-y-1">
                {stats.overdueTasks.map(t => (
                  <TaskRow key={t.id} task={t} onClick={() => onNavigateToTask(t.id)} userName={userName(t.assigned_to || t.user_id)} variant="overdue" subtaskInfo={subtaskMap?.get(t.id)} />
                ))}
              </div>
            </Section>
          )}

          {stats.upcomingTasks.length > 0 && (
            <Section title="Ближайшие дедлайны" count={stats.upcomingTasks.length}>
              <div className="space-y-1">
                {stats.upcomingTasks.map(t => (
                  <TaskRow key={t.id} task={t} onClick={() => onNavigateToTask(t.id)} userName={userName(t.assigned_to || t.user_id)} subtaskInfo={subtaskMap?.get(t.id)} />
                ))}
              </div>
            </Section>
          )}

          {stats.driftTasks.length > 0 && (
            <Section title="Сдвиг сроков" count={stats.driftTasks.length} variant="warning">
              <div className="space-y-1">
                {stats.driftTasks.map(({ task: t, driftDays }) => (
                  <TaskRow key={t.id} task={t} onClick={() => onNavigateToTask(t.id)} userName={userName(t.assigned_to || t.user_id)} drift={driftDays} subtaskInfo={subtaskMap?.get(t.id)} />
                ))}
              </div>
            </Section>
          )}

          {stats.total === 0 && stats.subprojects.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">Нет задач в проекте</p>
          )}

          {stats.total > 0 && stats.overdueTasks.length === 0 && stats.upcomingTasks.length === 0 && stats.driftTasks.length === 0 && stats.subprojects.filter(sp => sp.total > 0).length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">Нет событий для отображения</p>
          )}

          <div className="flex items-center gap-2">
            {onCreateTask && (
              <QuickCreateForm
                users={users}
                singleType="task"
                compact
                onCreate={(params) => onCreateTask(stats.group.id, params)}
              />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setWikiOpen(true); }}
              className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-left group"
            >
              <BookOpen className="h-3.5 w-3.5 text-primary/60 group-hover:text-primary" />
              <span className="text-xs text-muted-foreground group-hover:text-foreground">База знаний</span>
            </button>
          </div>
        </div>
      )}

      <Dialog open={wikiOpen} onOpenChange={setWikiOpen}>
        <DialogContent className="max-w-[90vw] w-[90vw] h-[85vh] p-4 flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <ProjectWikiTab
              groupId={stats.group.id}
              groupName={stats.group.name}
              groupDescription={stats.group.description || undefined}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, count, children, variant }: { title: string; count: number; children: React.ReactNode; variant?: "destructive" | "warning" }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn(
          "text-xs font-semibold",
          variant === "destructive" ? "text-red-500" : variant === "warning" ? "text-amber-500" : "text-foreground"
        )}>{title}</span>
        <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{count}</span>
      </div>
      {children}
    </div>
  );
}

function TaskRow({ task, onClick, userName, variant, drift, subtaskInfo }: {
  task: Task; onClick: () => void; userName: string; variant?: "overdue"; drift?: number;
  subtaskInfo?: { total: number; completed: number; subtasks: { id: string; title: string; is_completed: boolean }[] };
}) {
  const [expanded, setExpanded] = useState(false);
  const hasSteps = subtaskInfo && subtaskInfo.total > 0;
  const stepPct = hasSteps ? Math.round((subtaskInfo.completed / subtaskInfo.total) * 100) : 0;

  return (
    <div>
      <button
        onClick={onClick}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left group"
      >
        {hasSteps && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
          >
            <ChevronDownIcon className={cn("h-3 w-3 text-muted-foreground transition-transform", !expanded && "-rotate-90")} />
          </button>
        )}
        <span className={cn(
          "text-xs truncate flex-1",
          variant === "overdue" ? "text-red-600 dark:text-red-400" : "text-foreground",
          task.is_completed && "line-through text-muted-foreground"
        )}>
          {task.title}
        </span>
        {hasSteps && (
          <span className={cn(
            "inline-flex items-center gap-1 text-[10px] shrink-0 px-1.5 py-0.5 rounded-md border font-medium",
            stepPct === 100
              ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
              : stepPct > 0
                ? "text-primary border-primary/30 bg-primary/10"
                : "text-muted-foreground border-border bg-muted/50"
          )}>
            <ListChecks className="h-3 w-3" />
            {subtaskInfo.completed}/{subtaskInfo.total}
          </span>
        )}
        {drift !== undefined && (
          <span className={cn(
            "text-[10px] font-mono font-semibold shrink-0 px-1 py-0.5 rounded border border-dashed",
            drift > 0 ? "text-amber-600 dark:text-amber-400 border-amber-500/40" : "text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
          )}>
            {drift > 0 ? `+${drift}д` : `${drift}д`}
          </span>
        )}
        {task.deadline && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {format(new Date(task.deadline), "d MMM", { locale: ru })}
          </span>
        )}
        {userName && (
          <span className="text-[10px] text-muted-foreground shrink-0 max-w-[80px] truncate hidden sm:inline">
            {userName}
          </span>
        )}
      </button>
      {hasSteps && expanded && (
        <div className="ml-6 pl-2 border-l-2 border-border/60 space-y-0.5 py-1 animate-fade-in">
          {subtaskInfo.subtasks.map(st => (
            <div key={st.id} className="flex items-center gap-2 px-2 py-0.5">
              <CheckCircle2 className={cn(
                "h-3 w-3 shrink-0",
                st.is_completed ? "text-primary" : "text-muted-foreground/40"
              )} />
              <span className={cn(
                "text-[11px] truncate",
                st.is_completed && "line-through text-muted-foreground"
              )}>
                {st.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Multi-select filter popover ---
function MultiSelectFilter({ label, icon: Icon, items, selectedIds, onToggle, renderItem }: {
  label: string;
  icon: any;
  items: { id: string; label: string; color?: string | null }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  renderItem?: (item: { id: string; label: string; color?: string | null }) => React.ReactNode;
}) {
  const hasSelection = selectedIds.length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors",
          hasSelection
            ? "bg-primary/10 text-primary border-primary/30"
            : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
        )}>
          <Icon className="h-3.5 w-3.5" />
          {label}
          {hasSelection && (
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] font-bold ml-0.5">
              {selectedIds.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <PopoverSearchList
          items={items}
          searchKey={(item) => item.label}
          placeholder="Поиск..."
          renderItem={(item) => (
            <button
              key={item.id}
              onClick={() => onToggle(item.id)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-left"
            >
              <Checkbox
                checked={selectedIds.includes(item.id)}
                className="h-3.5 w-3.5"
              />
              {renderItem ? renderItem(item) : (
                <span className="text-xs truncate">{item.label}</span>
              )}
            </button>
          )}
        />
        {hasSelection && (
          <button
            onClick={() => selectedIds.forEach(id => onToggle(id))}
            className="w-full mt-1 pt-1 border-t border-border text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Сбросить
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// --- Filter buttons ---
const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "overdue", label: "Просрочено" },
  { value: "at-risk", label: "Drift" },
  { value: "on-track", label: "В графике" },
  { value: "completed", label: "Завершено" },
];

export default function DashboardView({ onNavigateToTask: onNavigateToTaskProp }: { onNavigateToTask?: (taskId: string) => void }) {
  const { user } = useAuth();
  const { data: tasks = [], isLoading: tasksLoading, isFetching: tasksFetching } = useTasks();
  const { data: groups = [], isLoading: groupsLoading, isFetching: groupsFetching } = useTaskGroups();
  const { data: users = [], isLoading: usersLoading } = useAvailableUsers();
  const { data: tags = [], isLoading: tagsLoading } = useVisibleTags();
  const { addTask } = useTaskMutations();
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [expandedMetric, setExpandedMetric] = useState<SummaryMetric | null>(null);
  const [aiSummaryText, setAiSummaryText] = useState("");

  // Fetch all task_participants for participant filter
  const { data: allParticipants = [] } = useQuery({
    queryKey: ["task_participants_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_participants" as any)
        .select("task_id, user_id");
      if (error) throw error;
      return (data || []) as unknown as { task_id: string; user_id: string }[];
    },
    enabled: !!user,
  });

  // Fetch all subtasks for step progress display
  const { data: allSubtasks = [] } = useQuery({
    queryKey: ["subtasks_all_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subtasks")
        .select("id, task_id, title, is_completed");
      if (error) throw error;
      return (data || []) as { id: string; task_id: string; title: string; is_completed: boolean }[];
    },
    enabled: !!user,
  });

  // Build subtask map: taskId -> { total, completed }
  const subtaskMap = useMemo(() => {
    const map = new Map<string, { total: number; completed: number; subtasks: { id: string; title: string; is_completed: boolean }[] }>();
    allSubtasks.forEach(s => {
      if (!map.has(s.task_id)) map.set(s.task_id, { total: 0, completed: 0, subtasks: [] });
      const entry = map.get(s.task_id)!;
      entry.total++;
      if (s.is_completed) entry.completed++;
      entry.subtasks.push({ id: s.id, title: s.title, is_completed: s.is_completed });
    });
    return map;
  }, [allSubtasks]);

  // Build a map: taskId -> Set<userId> for fast lookup
  const participantMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    allParticipants.forEach(p => {
      if (!map.has(p.task_id)) map.set(p.task_id, new Set());
      map.get(p.task_id)!.add(p.user_id);
    });
    return map;
  }, [allParticipants]);

  // "Build Dashboard" filters
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);

  const isLoading = tasksLoading || groupsLoading || usersLoading || tagsLoading;

  const toggleInArray = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];

  const rootGroups = useMemo(() => groups.filter(g => !g.parent_id && !(g as any).closed_at), [groups]);

  const projectItems = useMemo(() =>
    rootGroups.map(g => ({ id: g.id, label: g.name, color: g.color })),
    [rootGroups]
  );

  const assigneeItems = useMemo(() => {
    const ids = new Set<string>();
    tasks.forEach(t => {
      if (t.assigned_to) ids.add(t.assigned_to);
      ids.add(t.user_id);
    });
    return Array.from(ids)
      .map(id => {
        const u = users.find(u => u.id === id);
        return { id, label: u?.display_name || "Без имени" };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks, users]);

  const tagItems = useMemo(() =>
    tags.map(t => ({ id: t.id, label: t.name, color: t.color })),
    [tags]
  );

  const participantItems = useMemo(() => {
    const ids = new Set<string>();
    allParticipants.forEach(p => ids.add(p.user_id));
    return Array.from(ids)
      .map(id => {
        const u = users.find(u => u.id === id);
        return { id, label: u?.display_name || "Без имени" };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allParticipants, users]);

  const hasCustomFilters = selectedProjectIds.length > 0 || selectedAssigneeIds.length > 0 || selectedTagIds.length > 0 || selectedParticipantIds.length > 0;

  const projectStats = useMemo(() => {
    const baseGroups = selectedProjectIds.length > 0
      ? rootGroups.filter(g => selectedProjectIds.includes(g.id))
      : rootGroups;

    const hasDetailFilter = (selectedAssigneeIds.length > 0 || selectedTagIds.length > 0 || selectedParticipantIds.length > 0);

    return baseGroups
      .map(g => buildProjectStats(
        g, tasks, groups,
        selectedAssigneeIds.length > 0 ? selectedAssigneeIds : undefined,
        selectedTagIds.length > 0 ? selectedTagIds : undefined,
        selectedParticipantIds.length > 0 ? selectedParticipantIds : undefined,
        selectedParticipantIds.length > 0 ? participantMap : undefined,
      ))
      .filter(s => !hasDetailFilter || s.total > 0 || s.subprojects.some(sp => sp.total > 0))
      .sort((a, b) => {
        const order: Record<TimingStatus, number> = { overdue: 0, "at-risk": 1, "on-track": 2, completed: 3 };
        return order[a.timingStatus] - order[b.timingStatus];
      });
  }, [rootGroups, groups, tasks, selectedProjectIds, selectedAssigneeIds, selectedTagIds, selectedParticipantIds, participantMap]);

  const filtered = useMemo(() => {
    if (filter === "all") return projectStats;
    return projectStats.filter(s => s.timingStatus === filter);
  }, [projectStats, filter]);

  const summary = useMemo(() => {
    const totalProjects = projectStats.length;
    const overdueProjects = projectStats.filter(s => s.timingStatus === "overdue").length;
    const atRiskProjects = projectStats.filter(s => s.timingStatus === "at-risk").length;
    const now = new Date();
    const weekFromNow = addDays(startOfDay(now), 7);

    const relevantTasks = projectStats.flatMap(s => [...s.tasks, ...s.subprojects.flatMap(sp => sp.tasks)]);
    const uniqueTasks = Array.from(new Map(relevantTasks.map(t => [t.id, t])).values());
    const tasksThisWeek = uniqueTasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow).length;
    const totalOverdue = uniqueTasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now).length;
    const totalCompleted = uniqueTasks.filter(t => t.is_completed).length;
    const completionRate = uniqueTasks.length > 0 ? Math.round((totalCompleted / uniqueTasks.length) * 100) : 0;
    const totalDrift = uniqueTasks.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline).length;
    return { totalProjects, overdueProjects, atRiskProjects, tasksThisWeek, completionRate, totalOverdue, totalDrift };
  }, [projectStats]);

  const handleNavigateToTask = (taskId: string) => {
    onNavigateToTaskProp?.(taskId);
  };

  const handleCreateTask = useCallback(async (groupId: string, params: QuickCreateResult) => {
    await addTask.mutateAsync({
      title: params.title,
      group_id: groupId,
      deadline: params.deadline ? params.deadline.toISOString() : null,
      assigned_to: params.assigneeId || null,
    });
  }, [addTask]);

  const toggleMetric = (m: SummaryMetric) => {
    setExpandedMetric(prev => prev === m ? null : m);
  };

  const clearAllCustomFilters = () => {
    setSelectedProjectIds([]);
    setSelectedAssigneeIds([]);
    setSelectedTagIds([]);
    setSelectedParticipantIds([]);
  };

  if (isLoading) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto scrollbar-thin">
      <div className="max-w-3xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-5">
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg sm:text-xl font-semibold text-foreground leading-tight">Дашборд проектов</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{summary.totalProjects} проектов</p>
          </div>
          <DashboardExportDialog
            projectStats={projectStats}
            summary={summary}
            users={users}
            aiSummary={aiSummaryText || undefined}
            subtaskMap={subtaskMap}
          />
        </div>

        {/* Summary — clickable */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-5">
          <SummaryCard
            icon={TrendingUp}
            value={`${summary.completionRate}%`}
            label="Общий прогресс"
            color="bg-primary"
            active={expandedMetric === "progress"}
            onClick={() => toggleMetric("progress")}
          />
          <SummaryCard
            icon={CalendarClock}
            value={summary.tasksThisWeek}
            label="Дедлайнов на неделе"
            color="bg-blue-500"
            active={expandedMetric === "deadlines"}
            onClick={() => toggleMetric("deadlines")}
          />
          <SummaryCard
            icon={AlertTriangle}
            value={summary.totalOverdue}
            label="Просроченных задач"
            color="bg-red-500"
            active={expandedMetric === "overdue"}
            onClick={() => toggleMetric("overdue")}
          />
          <SummaryCard
            icon={ArrowRightLeft}
            value={summary.totalDrift}
            label="С отклонениями"
            color="bg-amber-500"
            active={expandedMetric === "drift"}
            onClick={() => toggleMetric("drift")}
          />
        </div>

        {/* Expanded metric panel */}
        {expandedMetric && expandedMetric !== "progress" && (
          <MetricExpander
            metric={expandedMetric}
            projectStats={projectStats}
            onNavigateToTask={handleNavigateToTask}
            users={users}
            onClose={() => setExpandedMetric(null)}
            subtaskMap={subtaskMap}
          />
        )}

        {/* Build Dashboard — multi-select filters */}
        <div className="bg-card rounded-xl border border-border p-3 mb-4">
          <div className="flex items-center gap-2 mb-2.5">
            <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">Построить дашборд</span>
            {hasCustomFilters && (
              <button
                onClick={clearAllCustomFilters}
                className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                Сбросить
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <MultiSelectFilter
              label="Проекты"
              icon={FolderOpen}
              items={projectItems}
              selectedIds={selectedProjectIds}
              onToggle={(id) => setSelectedProjectIds(prev => toggleInArray(prev, id))}
              renderItem={(item) => (
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="h-3 w-3 rounded shrink-0"
                    style={{ backgroundColor: item.color || "hsl(var(--primary))" }}
                  />
                  <span className="text-xs truncate">{item.label}</span>
                </div>
              )}
            />
            <MultiSelectFilter
              label="Ответственный"
              icon={User}
              items={assigneeItems}
              selectedIds={selectedAssigneeIds}
              onToggle={(id) => setSelectedAssigneeIds(prev => toggleInArray(prev, id))}
            />
            <MultiSelectFilter
              label="Теги"
              icon={TagIcon}
              items={tagItems}
              selectedIds={selectedTagIds}
              onToggle={(id) => setSelectedTagIds(prev => toggleInArray(prev, id))}
              renderItem={(item) => (
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color || "#6366f1" }}
                  />
                  <span className="text-xs truncate">{item.label}</span>
                </div>
              )}
            />
            <MultiSelectFilter
              label="Участник"
              icon={Users}
              items={participantItems}
              selectedIds={selectedParticipantIds}
              onToggle={(id) => setSelectedParticipantIds(prev => toggleInArray(prev, id))}
            />
          </div>
        </div>

        {/* AI Signals — structured signal cards */}
        <AiSignalsPanel projectStats={projectStats} users={users} onAiTextChange={setAiSummaryText} />

        {/* Status filters */}
        <div className="flex items-center gap-1.5 sm:gap-2 mb-4 flex-wrap overflow-x-auto scrollbar-none">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                filter === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="p-1 rounded-full hover:bg-muted transition-colors">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Project cards */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {filter === "all" ? "Нет проектов" : "Нет проектов с таким статусом"}
            </div>
          ) : (
            filtered.map(stats => (
              <ProjectCard key={stats.group.id} stats={stats} onNavigateToTask={handleNavigateToTask} users={users} onCreateTask={handleCreateTask} subtaskMap={subtaskMap} />
            ))
          )}
        </div>
      </div>
    </main>
  );
}

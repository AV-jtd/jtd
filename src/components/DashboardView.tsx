import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useTasks, useTaskGroups, useAvailableUsers, useVisibleTags, useTaskMutations, Task, TaskGroup, Profile, Tag } from "@/hooks/useTasks";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users, ListChecks, ChevronDown as ChevronDownIcon } from "lucide-react";
import {
  BarChart3, Loader2, TrendingUp, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronRight, CalendarClock, ArrowRightLeft, Filter, X,
  SlidersHorizontal, FolderOpen, User, Tag as TagIcon, BookOpen, Sparkles, Plus, RefreshCw,
  Activity, Zap
} from "lucide-react";
import DashboardExportDialog from "@/components/DashboardExportDialog";
import QuickCreateForm from "@/components/QuickCreateForm";
import type { QuickCreateResult } from "@/components/QuickCreateForm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ProjectWikiTab from "@/components/wiki/ProjectWikiTab";
import { format, differenceInDays, isAfter, isBefore, startOfDay, addDays, subDays, parseISO, isToday } from "date-fns";
import { ru } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { Checkbox } from "@/components/ui/checkbox";
import ReactMarkdown from "react-markdown";
import { streamChat, StreamChatError } from "@/lib/streamChat";

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

function getStatusLabel(status: TimingStatus) {
  switch (status) {
    case "on-track": return "В графике";
    case "at-risk": return "Сдвиг";
    case "overdue": return "Просрочено";
    case "completed": return "Завершён";
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

// --- AI Signal type & cache ---
const AI_SIGNALS_CACHE_KEY = "jtd_ai_signals_cache";
const AI_SIGNALS_TTL = 4 * 60 * 60 * 1000;

interface AiSignal {
  level: "red" | "amber" | "green";
  title: string;
  desc: string;
  action: string;
  project: string | null;
  person: string | null;
}

function getCachedSignals(): AiSignal[] | null {
  try {
    const raw = localStorage.getItem(AI_SIGNALS_CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > AI_SIGNALS_TTL) { localStorage.removeItem(AI_SIGNALS_CACHE_KEY); return null; }
    return data as AiSignal[];
  } catch { return null; }
}

function setCachedSignals(data: AiSignal[]) {
  try { localStorage.setItem(AI_SIGNALS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// --- KPI Card ---
function KpiCard({ label, value, trend, trendType, active, onClick, color }: {
  label: string;
  value: string | number;
  trend?: string;
  trendType?: "up-good" | "up-bad" | "down-good" | "down-bad" | "flat";
  active?: boolean;
  onClick?: () => void;
  color?: string;
}) {
  const trendColor = {
    "up-good": "text-emerald-600 dark:text-emerald-400",
    "up-bad": "text-red-500",
    "down-good": "text-emerald-600 dark:text-emerald-400",
    "down-bad": "text-red-500",
    "flat": "text-muted-foreground",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "bg-card rounded-lg border border-border p-3 text-left transition-all hover:border-muted-foreground/30",
        active && "border-primary ring-2 ring-primary/20"
      )}
    >
      <div className="text-[10px] text-muted-foreground mb-1 flex items-center justify-between">
        <span>{label}</span>
        {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
      </div>
      <div className="text-2xl font-medium leading-none mb-0.5" style={{ color: color || "hsl(var(--foreground))" }}>
        {value}
      </div>
      {trend && (
        <div className={cn("text-[10px] font-medium", trendColor[trendType || "flat"])}>
          {trend}
        </div>
      )}
    </button>
  );
}

// --- Detail Panel (expandable from KPI click) ---
type SubtaskMap = Map<string, { total: number; completed: number; subtasks: { id: string; title: string; is_completed: boolean }[] }>;

function DetailPanel({ title, tasks, onNavigateToTask, users, onClose }: {
  title: string;
  tasks: Task[];
  onNavigateToTask: (taskId: string) => void;
  users: Profile[];
  onClose: () => void;
}) {
  const userName = (userId: string) => users.find(u => u.id === userId)?.display_name || "—";
  if (tasks.length === 0) return null;
  return (
    <div className="bg-card rounded-lg border-2 border-primary overflow-hidden animate-fade-in">
      <div className="px-3 py-2.5 bg-primary/5 border-b border-border flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-primary flex-1">{title} — топ по срочности</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-base leading-none">×</button>
      </div>
      <div className="p-2.5 space-y-1 max-h-56 overflow-y-auto scrollbar-thin">
        {tasks.slice(0, 10).map(t => {
          const now = new Date();
          const overdueDays = t.deadline ? Math.max(0, differenceInDays(now, new Date(t.deadline))) : 0;
          const drift = t.original_deadline && t.deadline && t.original_deadline !== t.deadline
            ? differenceInDays(new Date(t.deadline), new Date(t.original_deadline))
            : null;
          return (
            <button
              key={t.id}
              onClick={() => onNavigateToTask(t.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors text-left"
            >
              <span className="text-xs text-foreground flex-1 truncate">{t.title}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{userName(t.assigned_to || t.user_id)}</span>
              {t.deadline && (
                <span className="text-[11px] text-red-500 shrink-0">
                  {format(new Date(t.deadline), "d MMM", { locale: ru })}
                  {overdueDays > 0 && ` +${overdueDays}д`}
                </span>
              )}
              {drift !== null && (
                <span className="text-[11px] text-amber-500 shrink-0">↗ {drift > 0 ? `+${drift}` : drift}д</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- AI Signals Panel (restyled) ---
function AiSignalsPanel({ projectStats, users, onNavigateToProject, onNavigateToPerson, onFilterOverdue, onAiTextChange }: {
  projectStats: ProjectStats[];
  users: Profile[];
  onNavigateToProject?: (groupId: string) => void;
  onNavigateToPerson?: (userId: string) => void;
  onFilterOverdue?: () => void;
  onAiTextChange?: (text: string) => void;
}) {
  const [signals, setSignals] = useState<AiSignal[]>(() => getCachedSignals() || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);
  const generateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (signals.length > 0) {
      onAiTextChange?.(signals.map(s => `[${s.level.toUpperCase()}] ${s.title}: ${s.desc}`).join("\n"));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = useCallback(async (forceRefresh = false) => {
    if (loading || projectStats.length === 0) return;
    if (!forceRefresh) {
      const cached = getCachedSignals();
      if (cached && cached.length > 0) {
        setSignals(cached);
        onAiTextChange?.(cached.map(s => `[${s.level.toUpperCase()}] ${s.title}: ${s.desc}`).join("\n"));
        return;
      }
    }
    setLoading(true);
    setError(null);

    const userName = (userId: string) => users.find(u => u.id === userId)?.display_name || "—";
    const now = new Date();
    const weekFromNow = addDays(startOfDay(now), 7);

    const allTasks = projectStats.flatMap(s => [...s.tasks, ...s.subprojects.flatMap(sp => sp.tasks)]);
    const unique = Array.from(new Map(allTasks.map(t => [t.id, t])).values());
    const activeTasks = unique.filter(t => !t.is_completed);
    const completedTasks = unique.filter(t => t.is_completed);

    // Assignee workload
    const assigneeLoad: Record<string, { name: string; total: number; overdue: number; drift: number }> = {};
    activeTasks.forEach(t => {
      const uid = t.assigned_to || t.user_id;
      const name = userName(uid);
      if (!assigneeLoad[uid]) assigneeLoad[uid] = { name, total: 0, overdue: 0, drift: 0 };
      assigneeLoad[uid].total++;
      if (t.deadline && new Date(t.deadline) < now) assigneeLoad[uid].overdue++;
      if (t.original_deadline && t.deadline && t.original_deadline !== t.deadline) assigneeLoad[uid].drift++;
    });

    // Velocity: completed last 7 days vs prior 7 days
    const d7 = subDays(now, 7);
    const d14 = subDays(now, 14);
    const completedLast7 = completedTasks.filter(t => t.completed_at && new Date(t.completed_at) >= d7).length;
    const completedPrior7 = completedTasks.filter(t => t.completed_at && new Date(t.completed_at) >= d14 && new Date(t.completed_at) < d7).length;

    // Deadline clustering: tasks due in next 7 days grouped by day
    const upcomingByDay: Record<string, number> = {};
    activeTasks.forEach(t => {
      if (t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow) {
        const key = format(new Date(t.deadline), "yyyy-MM-dd");
        upcomingByDay[key] = (upcomingByDay[key] || 0) + 1;
      }
    });
    const peakDay = Object.entries(upcomingByDay).sort(([, a], [, b]) => b - a)[0];

    // Stalled projects (no completions in 14 days, still active)
    const stalledProjects = projectStats.filter(s => {
      if (s.total === 0 || s.timingStatus === "completed") return false;
      const projectTasks = [...s.tasks, ...s.subprojects.flatMap(sp => sp.tasks)];
      return !projectTasks.some(t => t.is_completed && t.completed_at && new Date(t.completed_at) >= d14);
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
\nНагрузка исполнителей:\n${loadSummary}
\nВелосити: завершено ${completedLast7} задач за 7 дн (пред. неделя: ${completedPrior7})
Пик дедлайнов: ${peakDay ? `${format(parseISO(peakDay[0]), "dd MMM", { locale: ru })} — ${peakDay[1]} задач` : "нет"}
Застопоренных проектов (0 завершений за 14 дн): ${stalledProjects.length > 0 ? stalledProjects.map(s => s.group.name).join(", ") : "нет"}`;

    const prompt = `Данные проектов:\n${dataContext}\n\nВерни JSON массив из 3-5 сигналов:\n[{\n  "level": "red"|"amber"|"green",\n  "title": "короткий заголовок (до 50 символов)",\n  "desc": "объяснение (до 100 символов)",\n  "action": "конкретное действие (до 35 символов)",\n  "project": "название проекта или null",\n  "person": "имя человека или null"\n}]\n\nПравила:\n- red: критические проблемы, требует действия сегодня\n- amber: предупреждения, действие на этой неделе\n- green: положительная динамика или достижение\n- Всегда 1-2 red, 1-2 amber, 0-1 green\n\nАнализируй ВСЕ аспекты проектного управления:\n1. Критический путь: проекты с максимальным % просрочек\n2. Velocity: тренд завершения задач (растет/падает)\n3. Drift паттерны: системные переносы у одного исполнителя или проекта\n4. Пиковая нагрузка: кластеризация дедлайнов\n5. Застой: проекты без прогресса\n6. Перегрузка: дисбаланс задач между исполнителями\n7. Прогноз: при текущей velocity успеваем ли к ближайшим вехам\n\nДавай конкретные actionable рекомендации руководителю.`;

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
            const jsonMatch = fullText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as AiSignal[];
              const trimmed = parsed.slice(0, 5);
              setSignals(trimmed);
              setCachedSignals(trimmed);
              onAiTextChange?.(trimmed.map(s => `[${s.level.toUpperCase()}] ${s.title}: ${s.desc}`).join("\n"));
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

  const statsReady = projectStats.length > 0;
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
      <div className="bg-card rounded-lg border border-primary/30 overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-primary/5 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
          <span className="text-xs font-medium text-primary flex-1">Сигналы — анализ…</span>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/60" />
        </div>
        <div className="p-3 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-lg p-2.5 animate-pulse bg-muted/50">
              <div className="h-3.5 bg-muted rounded w-2/3 mb-1.5" />
              <div className="h-3 bg-muted rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card rounded-lg border border-border p-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground flex-1">{error}</span>
        <button onClick={() => generate(true)} className="text-xs text-primary hover:underline shrink-0">Повторить</button>
      </div>
    );
  }

  if (signals.length === 0) return null;

  const signalBg = (level: AiSignal["level"]) => {
    switch (level) {
      case "red": return "bg-red-500/8 dark:bg-red-500/15";
      case "amber": return "bg-amber-500/8 dark:bg-amber-500/15";
      case "green": return "bg-emerald-500/8 dark:bg-emerald-500/15";
    }
  };
  const signalIconBg = (level: AiSignal["level"]) => {
    switch (level) {
      case "red": return "bg-red-400/30";
      case "amber": return "bg-amber-400/30";
      case "green": return "bg-emerald-400/30";
    }
  };
  const signalTitle = (level: AiSignal["level"]) => {
    switch (level) {
      case "red": return "text-red-700 dark:text-red-400";
      case "amber": return "text-amber-700 dark:text-amber-400";
      case "green": return "text-emerald-700 dark:text-emerald-400";
    }
  };
  const signalDesc = (level: AiSignal["level"]) => {
    switch (level) {
      case "red": return "text-red-600/80 dark:text-red-400/80";
      case "amber": return "text-amber-600/80 dark:text-amber-400/80";
      case "green": return "text-emerald-600/80 dark:text-emerald-400/80";
    }
  };
  return (
    <div className="bg-card rounded-lg border border-primary/30 overflow-hidden">
      <div className="px-3 py-1.5 border-b border-border bg-primary/5 flex items-center gap-2">
        <Sparkles className="h-3 w-3 text-primary" />
        <span className="text-[11px] font-medium text-primary flex-1">ИИ-сигналы</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-primary/60" />}
        <button
          onClick={() => generate(true)}
          disabled={loading}
          className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
          title="Обновить"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      </div>
      <div className="p-1.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
        {signals.map((signal, i) => {
          const matchedProject = projectStats.find(s =>
            signal.project && s.group.name.toLowerCase().includes(signal.project.toLowerCase())
          );
          const matchedPerson = signal.person
            ? users.find(u => u.display_name?.toLowerCase().includes(signal.person!.toLowerCase()))
            : null;

          const handleActionClick = () => {
            if (matchedProject) onNavigateToProject?.(matchedProject.group.id);
            else if (matchedPerson) onNavigateToPerson?.(matchedPerson.id);
            else if (signal.level === "red") onFilterOverdue?.();
          };

          return (
            <button
              key={i}
              onClick={handleActionClick}
              className={cn(
                "flex items-start gap-1.5 p-2 rounded-md text-left transition-all hover:ring-1 hover:ring-primary/20",
                signalBg(signal.level)
              )}
            >
              <div className={cn("h-4 w-4 rounded flex items-center justify-center shrink-0 mt-px", signalIconBg(signal.level))}>
                {signal.level === "red" && <AlertTriangle className="h-2.5 w-2.5 text-red-600 dark:text-red-400" />}
                {signal.level === "amber" && <TrendingUp className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />}
                {signal.level === "green" && <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn("text-[11px] font-medium leading-tight", signalTitle(signal.level))}>{signal.title}</div>
                <div className={cn("text-[10px] leading-snug mt-0.5", signalDesc(signal.level))}>{signal.desc}</div>
                <div className={cn("text-[9px] mt-1 font-medium opacity-70", signalTitle(signal.level))}>
                  {signal.action} →
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Hot Projects Card ---
function HotProjectsCard({ projectStats, onNavigateToProject }: {
  projectStats: ProjectStats[];
  onNavigateToProject?: (groupId: string) => void;
}) {
  const [sortBy, setSortBy] = useState<"overdue" | "progress">("overdue");

  const sorted = useMemo(() => {
    const withIssues = projectStats.filter(s => s.total > 0);
    return [...withIssues].sort((a, b) => {
      if (sortBy === "overdue") return b.overdue - a.overdue;
      const pctA = a.total > 0 ? a.completed / a.total : 0;
      const pctB = b.total > 0 ? b.completed / b.total : 0;
      return pctA - pctB;
    }).slice(0, 6);
  }, [projectStats, sortBy]);

  const criticalCount = projectStats.filter(s => s.overdue > 0 || (s.total > 0 && s.completed === 0)).length;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <span className="text-xs font-medium text-foreground flex-1">Горящие проекты</span>
        {criticalCount > 0 && (
          <span className="text-[10px] px-1.5 py-px rounded bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
            {criticalCount} критичных
          </span>
        )}
        <button
          onClick={() => setSortBy(s => s === "overdue" ? "progress" : "overdue")}
          className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
        >
          {sortBy === "overdue" ? "по просрочкам ↕" : "по прогрессу ↕"}
        </button>
      </div>
      <div>
        {sorted.map(s => {
          const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
          const barColor = s.overdue > 0 ? "bg-red-500" : s.driftCount > 0 ? "bg-amber-500" : "bg-emerald-500";
          return (
            <button
              key={s.group.id}
              onClick={() => onNavigateToProject?.(s.group.id)}
              className="w-full flex items-center gap-2 px-3 py-2 border-b last:border-b-0 border-border hover:bg-muted/50 transition-colors text-left"
            >
              <span className="text-xs font-medium text-foreground flex-1 truncate">{s.group.name}</span>
              <div className="w-12 h-[3px] bg-muted rounded-sm overflow-hidden shrink-0">
                <div className={cn("h-full rounded-sm", barColor)} style={{ width: `${pct}%` }} />
              </div>
              <span className={cn("text-[10px] min-w-[26px] text-right shrink-0", pct === 0 && s.overdue > 0 ? "text-red-500" : "text-muted-foreground")}>
                {pct}%
              </span>
              {s.overdue > 0 && (
                <span className="text-[10px] px-1.5 py-px rounded bg-red-500/10 text-red-600 dark:text-red-400 whitespace-nowrap shrink-0">
                  {s.overdue} просроч.{s.driftCount > 0 ? ` · ${s.driftCount} drift` : ""}
                </span>
              )}
              {s.overdue === 0 && s.driftCount > 0 && (
                <span className="text-[10px] px-1.5 py-px rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 whitespace-nowrap shrink-0">
                  {s.driftCount} drift
                </span>
              )}
            </button>
          );
        })}
        {sorted.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Нет проектов</div>
        )}
      </div>
    </div>
  );
}

// --- Team Workload Card ---
function TeamWorkloadCard({ projectStats, users, onFilterByPerson }: {
  projectStats: ProjectStats[];
  users: Profile[];
  onFilterByPerson?: (userId: string) => void;
}) {
  const workload = useMemo(() => {
    const now = new Date();
    const allTasks = projectStats.flatMap(s => [...s.tasks, ...s.subprojects.flatMap(sp => sp.tasks)]);
    const unique = Array.from(new Map(allTasks.map(t => [t.id, t])).values());
    const active = unique.filter(t => !t.is_completed);

    const map: Record<string, { name: string; total: number; overdue: number; drift: number }> = {};
    active.forEach(t => {
      const uid = t.assigned_to || t.user_id;
      const u = users.find(u => u.id === uid);
      if (!u) return;
      if (!map[uid]) map[uid] = { name: u.display_name || "—", total: 0, overdue: 0, drift: 0 };
      map[uid].total++;
      if (t.deadline && new Date(t.deadline) < now) map[uid].overdue++;
      if (t.original_deadline && t.deadline && t.original_deadline !== t.deadline) map[uid].drift++;
    });

    return Object.entries(map)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => b.overdue - a.overdue || b.total - a.total)
      .slice(0, 8);
  }, [projectStats, users]);

  const maxTotal = Math.max(...workload.map(w => w.total), 1);

  const getInitials = (name: string) => {
    const parts = name.split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  const avatarStyle = (w: { overdue: number; drift: number }) => {
    if (w.overdue > 0) return "bg-red-500/10 text-red-600 dark:text-red-400";
    if (w.drift > 0) return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  };

  const barColor = (w: { overdue: number; drift: number }) => {
    if (w.overdue > 0) return "bg-red-500";
    if (w.drift > 0) return "bg-amber-500";
    return "bg-emerald-500";
  };

  const statText = (w: { overdue: number; drift: number }) => {
    if (w.overdue > 0) return { text: `${w.overdue} просроч.`, color: "text-red-500 font-medium" };
    if (w.drift > 0) return { text: `${w.drift} drift`, color: "text-amber-500" };
    return { text: "в норме", color: "text-emerald-500" };
  };

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="text-xs font-medium text-foreground flex-1">Загрузка команды</span>
        <span className="text-[10px] px-1.5 py-px rounded bg-primary/10 text-primary font-medium">
          {workload.length} чел.
        </span>
      </div>
      <div>
        {workload.map(w => {
          const stat = statText(w);
          return (
            <button
              key={w.id}
              onClick={() => onFilterByPerson?.(w.id)}
              className="w-full flex items-center gap-2 px-3 py-2 border-b last:border-b-0 border-border hover:bg-muted/50 transition-colors text-left"
            >
              <div className={cn("h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-medium shrink-0", avatarStyle(w))}>
                {getInitials(w.name)}
              </div>
              <span className="text-xs text-foreground flex-1 truncate">{w.name}</span>
              <div className="w-14 h-1 bg-muted rounded-sm overflow-hidden shrink-0">
                <div className={cn("h-full rounded-sm", barColor(w))} style={{ width: `${Math.round((w.total / maxTotal) * 100)}%` }} />
              </div>
              <span className={cn("text-[10px] min-w-[70px] text-right shrink-0", stat.color)}>{stat.text}</span>
            </button>
          );
        })}
        {workload.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Нет данных</div>
        )}
      </div>
    </div>
  );
}

// --- Interactive Project & Task List ---
function ProjectTaskList({ projectStats, users, onNavigateToTask, onNavigateToProject }: {
  projectStats: ProjectStats[];
  users: Profile[];
  onNavigateToTask: (taskId: string) => void;
  onNavigateToProject: (groupId: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [taskFilter, setTaskFilter] = useState<"all" | "overdue" | "drift" | "upcoming" | "done">("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const toggle = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const getStatusDot = (status: TimingStatus) => {
    const colors: Record<TimingStatus, string> = {
      "on-track": "bg-emerald-500",
      "at-risk": "bg-amber-500",
      "overdue": "bg-red-500",
      "completed": "bg-muted-foreground/50",
    };
    return colors[status];
  };

  const userName = (userId: string | null) => {
    if (!userId) return "—";
    return users.find(u => u.id === userId)?.display_name || "—";
  };

  const getFilteredTasks = (ps: ProjectStats) => {
    const allTasks = [...ps.tasks, ...ps.subprojects.flatMap(sp => sp.tasks)];
    const unique = Array.from(new Map(allTasks.map(t => [t.id, t])).values());
    const now = new Date();
    const weekFromNow = addDays(startOfDay(now), 7);

    switch (taskFilter) {
      case "overdue":
        return unique.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now);
      case "drift":
        return unique.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline);
      case "upcoming":
        return unique.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow);
      case "done":
        return unique.filter(t => t.is_completed)
          .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime())
          .slice(0, 10);
      default:
        return unique.filter(t => !t.is_completed).slice(0, 20);
    }
  };

  const getRecentlyCompleted = (ps: ProjectStats) => {
    const allTasks = [...ps.tasks, ...ps.subprojects.flatMap(sp => sp.tasks)];
    const unique = Array.from(new Map(allTasks.map(t => [t.id, t])).values());
    const d7 = subDays(new Date(), 7);
    return unique.filter(t => t.is_completed && t.completed_at && new Date(t.completed_at) >= d7).length;
  };

  if (projectStats.length === 0) return null;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 flex-wrap">
        <ListChecks className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-foreground flex-1">Проекты и задачи</span>
        <div className="flex items-center gap-0.5">
          {(["all", "overdue", "drift", "upcoming", "done"] as const).map(f => (
            <button
              key={f}
              onClick={() => setTaskFilter(f)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded transition-colors",
                taskFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {f === "all" ? "Активные" : f === "overdue" ? "Просрочено" : f === "drift" ? "Drift" : f === "upcoming" ? "Ближайшие" : "Выполнено"}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-border max-h-[500px] overflow-y-auto scrollbar-thin">
        {projectStats.map(ps => {
          const isExpanded = expandedIds.has(ps.group.id);
          const filteredTasks = getFilteredTasks(ps);
          const pct = ps.total > 0 ? Math.round((ps.completed / ps.total) * 100) : 0;
          const recentDone = getRecentlyCompleted(ps);
          const now = new Date();

          return (
            <div key={ps.group.id}>
              {/* Project row */}
              <button
                onClick={() => toggle(ps.group.id)}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left"
              >
                {isExpanded
                  ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                }
                <span className={cn("h-2 w-2 rounded-full shrink-0", getStatusDot(ps.timingStatus))} />
                <span className="text-xs mr-0.5">{ps.group.icon || "📁"}</span>
                <span className="text-xs font-medium text-foreground truncate flex-1">{ps.group.name}</span>

                {ps.overdue > 0 && (
                  <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                    {ps.overdue} ⚠
                  </Badge>
                )}
                {ps.driftCount > 0 && (
                  <Badge className="text-[9px] px-1.5 py-0 h-4 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0">
                    {ps.driftCount} ↗
                  </Badge>
                )}

                <div className="flex items-center gap-1.5 shrink-0">
                  <Progress value={pct} className="w-12 h-1.5" />
                  <span className="text-[10px] text-muted-foreground w-7 text-right">{pct}%</span>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {ps.completed}/{ps.total}
                </span>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="bg-muted/20">
                  {/* Project summary strip */}
                  <div className="px-4 py-1.5 flex items-center gap-3 border-b border-border/50 text-[10px] flex-wrap">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ✓ {recentDone} за 7 дн
                    </span>
                    {ps.overdue > 0 && (
                      <span className="text-red-500">
                        ⚠ {ps.overdue} просроч.
                      </span>
                    )}
                    {ps.driftCount > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        ↗ drift ø{ps.avgDriftDays}д
                      </span>
                    )}
                    {ps.nextDeadline && (
                      <span className="text-muted-foreground">
                        ⏰ {format(new Date(ps.nextDeadline), "dd MMM", { locale: ru })}
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {getStatusLabel(ps.timingStatus)}
                    </span>
                    <button
                      onClick={() => onNavigateToProject(ps.group.id)}
                      className="ml-auto text-primary hover:underline"
                    >
                      В проект →
                    </button>
                  </div>

                  {/* Subprojects */}
                  {ps.subprojects.filter(sp => sp.total > 0).map(sp => {
                    const spPct = sp.total > 0 ? Math.round((sp.completed / sp.total) * 100) : 0;
                    return (
                      <div key={sp.group.id} className="px-5 py-1 flex items-center gap-2 border-b border-border/30">
                        <span className="text-[10px]">{sp.group.icon || "📁"}</span>
                        <span className="text-[10px] font-medium text-muted-foreground truncate flex-1">{sp.group.name}</span>
                        {sp.overdue > 0 && <span className="text-[9px] text-red-500">{sp.overdue} ⚠</span>}
                        <Progress value={spPct} className="w-10 h-1" />
                        <span className="text-[9px] text-muted-foreground">{sp.completed}/{sp.total}</span>
                      </div>
                    );
                  })}

                  {/* Task rows */}
                  {filteredTasks.length > 0 ? filteredTasks.map(task => {
                    const isOverdue = !task.is_completed && task.deadline && new Date(task.deadline) < now;
                    const hasDrift = task.original_deadline && task.deadline && task.original_deadline !== task.deadline;
                    const driftDays = hasDrift ? differenceInDays(new Date(task.deadline!), new Date(task.original_deadline!)) : 0;
                    const isSelected = selectedTaskId === task.id;

                    return (
                      <div key={task.id}>
                        <button
                          onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                          className={cn(
                            "w-full px-5 py-1.5 flex items-center gap-2 transition-colors text-left",
                            isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                          )}
                        >
                          <span className={cn(
                            "h-1.5 w-1.5 rounded-full shrink-0",
                            task.is_completed ? "bg-emerald-500" : isOverdue ? "bg-red-500" : "bg-primary/40"
                          )} />
                          <span className={cn(
                            "text-[11px] truncate flex-1",
                            task.is_completed && "line-through text-muted-foreground",
                            isOverdue && "text-red-600 dark:text-red-400"
                          )}>
                            {task.title}
                          </span>

                          {task.is_completed && task.completed_at && (
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 shrink-0">
                              ✓ {format(new Date(task.completed_at), "dd MMM", { locale: ru })}
                            </span>
                          )}

                          {hasDrift && (
                            <span className="text-[9px] text-amber-600 dark:text-amber-400 shrink-0">
                              ↗ {driftDays > 0 ? `+${driftDays}д` : `${driftDays}д`}
                            </span>
                          )}

                          {task.assigned_to && (
                            <span className="text-[9px] text-muted-foreground truncate max-w-[80px] shrink-0">
                              {userName(task.assigned_to)}
                            </span>
                          )}

                          {task.deadline && !task.is_completed && (
                            <span className={cn(
                              "text-[9px] shrink-0",
                              isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"
                            )}>
                              {format(new Date(task.deadline), "dd MMM", { locale: ru })}
                            </span>
                          )}
                        </button>

                        {/* Inline task detail card */}
                        {isSelected && (
                          <div className="mx-5 mb-1.5 p-2.5 rounded-md bg-card border border-border shadow-sm animate-fade-in">
                            <div className="flex items-start gap-2 mb-1.5">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-foreground">{task.title}</div>
                                {task.description && (
                                  <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{task.description}</div>
                                )}
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); onNavigateToTask(task.id); }}
                                className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                              >
                                Открыть ↗
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                              <span className="text-muted-foreground">
                                Автор: <span className="text-foreground">{userName(task.user_id)}</span>
                              </span>
                              {task.assigned_to && (
                                <span className="text-muted-foreground">
                                  Ответственный: <span className="text-foreground">{userName(task.assigned_to)}</span>
                                </span>
                              )}
                              {task.deadline && (
                                <span className={cn(isOverdue ? "text-red-500" : "text-muted-foreground")}>
                                  Дедлайн: <span className={cn("text-foreground", isOverdue && "text-red-500 font-medium")}>
                                    {format(new Date(task.deadline), "dd MMM yyyy", { locale: ru })}
                                    {isOverdue && ` (${Math.abs(differenceInDays(new Date(task.deadline!), now))}д назад)`}
                                  </span>
                                </span>
                              )}
                              {task.original_deadline && task.deadline && task.original_deadline !== task.deadline && (
                                <span className="text-amber-600 dark:text-amber-400">
                                  Было: {format(new Date(task.original_deadline), "dd MMM", { locale: ru })} → {format(new Date(task.deadline), "dd MMM", { locale: ru })}
                                </span>
                              )}
                              {task.start_at && (
                                <span className="text-muted-foreground">
                                  Старт: {format(new Date(task.start_at), "dd MMM", { locale: ru })}
                                </span>
                              )}
                              {task.is_completed && task.completed_at && (
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  Завершено: {format(new Date(task.completed_at), "dd MMM yyyy", { locale: ru })}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }) : (
                    <div className="px-6 py-3 text-[10px] text-muted-foreground text-center">
                      Нет задач по выбранному фильтру
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
        <button
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all",
            hasSelection
              ? "bg-primary/10 border-primary/30 text-foreground font-medium"
              : "bg-card border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
          {hasSelection && (
            <span className="bg-primary text-primary-foreground text-[10px] rounded-full px-1.5 py-0.5 leading-none font-semibold">
              {selectedIds.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <PopoverSearchList
          items={items}
          searchKey={(item) => item.label}
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

// ===== MAIN COMPONENT =====

export default function DashboardView({ onNavigateToTask: onNavigateToTaskProp }: { onNavigateToTask?: (taskId: string) => void }) {
  const { user } = useAuth();
  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: groups = [], isLoading: groupsLoading } = useTaskGroups();
  const { data: users = [], isLoading: usersLoading } = useAvailableUsers();
  const { data: tags = [], isLoading: tagsLoading } = useVisibleTags();
  const { addTask } = useTaskMutations();
  const [expandedKpi, setExpandedKpi] = useState<"overdue" | "drift" | null>(null);
  const [aiSummaryText, setAiSummaryText] = useState("");

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

  const participantMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    allParticipants.forEach(p => {
      if (!map.has(p.task_id)) map.set(p.task_id, new Set());
      map.get(p.task_id)!.add(p.user_id);
    });
    return map;
  }, [allParticipants]);

  // Filters
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
    tasks.forEach(t => { if (t.assigned_to) ids.add(t.assigned_to); ids.add(t.user_id); });
    return Array.from(ids)
      .map(id => ({ id, label: users.find(u => u.id === id)?.display_name || "Без имени" }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks, users]);
  const tagItems = useMemo(() => tags.map(t => ({ id: t.id, label: t.name, color: t.color })), [tags]);
  const participantItems = useMemo(() => {
    const ids = new Set<string>();
    allParticipants.forEach(p => ids.add(p.user_id));
    return Array.from(ids)
      .map(id => ({ id, label: users.find(u => u.id === id)?.display_name || "Без имени" }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allParticipants, users]);

  const hasCustomFilters = selectedProjectIds.length > 0 || selectedAssigneeIds.length > 0 || selectedTagIds.length > 0 || selectedParticipantIds.length > 0;

  const projectStats = useMemo(() => {
    const baseGroups = selectedProjectIds.length > 0
      ? rootGroups.filter(g => selectedProjectIds.includes(g.id))
      : rootGroups;

    const hasDetailFilter = selectedAssigneeIds.length > 0 || selectedTagIds.length > 0 || selectedParticipantIds.length > 0;

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

  // Compute summary KPIs
  const summary = useMemo(() => {
    const now = new Date();
    const weekFromNow = addDays(startOfDay(now), 7);
    const relevantTasks = projectStats.flatMap(s => [...s.tasks, ...s.subprojects.flatMap(sp => sp.tasks)]);
    const uniqueTasks = Array.from(new Map(relevantTasks.map(t => [t.id, t])).values());
    const totalCompleted = uniqueTasks.filter(t => t.is_completed).length;
    const completionRate = uniqueTasks.length > 0 ? Math.round((totalCompleted / uniqueTasks.length) * 100) : 0;
    const totalOverdue = uniqueTasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now).length;
    const totalDrift = uniqueTasks.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline).length;
    const activeProjects = projectStats.filter(s => s.total > 0 && s.timingStatus !== "completed").length;
    const tasksThisWeek = uniqueTasks.filter(t => !t.is_completed && t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow).length;

    // Overdue & drift task lists for detail panel
    const overdueTasks = uniqueTasks
      .filter(t => !t.is_completed && t.deadline && new Date(t.deadline) < now)
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());
    const driftTasks = uniqueTasks
      .filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline)
      .sort((a, b) => {
        const da = Math.abs(differenceInDays(new Date(a.deadline!), new Date(a.original_deadline!)));
        const db = Math.abs(differenceInDays(new Date(b.deadline!), new Date(b.original_deadline!)));
        return db - da;
      });

    return {
      completionRate, totalCompleted, totalOverdue, totalDrift, activeProjects, tasksThisWeek,
      totalProjects: projectStats.length,
      totalTasks: uniqueTasks.length,
      overdueTasks, driftTasks,
    };
  }, [projectStats]);

  const handleNavigateToTask = (taskId: string) => {
    onNavigateToTaskProp?.(taskId);
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
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-2.5">

        {/* Header bar */}
        <div className="bg-card rounded-lg border border-border px-3 py-2.5 flex items-center gap-2.5 flex-wrap">
          <BarChart3 className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-foreground flex-1">Дашборд руководителя</span>

          {/* Filters inline */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <MultiSelectFilter
              label="Проекты"
              icon={FolderOpen}
              items={projectItems}
              selectedIds={selectedProjectIds}
              onToggle={(id) => setSelectedProjectIds(prev => toggleInArray(prev, id))}
              renderItem={(item) => (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-3 w-3 rounded shrink-0" style={{ backgroundColor: item.color || "hsl(var(--primary))" }} />
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
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color || "#6366f1" }} />
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
            {hasCustomFilters && (
              <button onClick={clearAllCustomFilters} className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <DashboardExportDialog
            projectStats={projectStats}
            summary={summary}
            users={users}
            aiSummary={aiSummaryText || undefined}
            subtaskMap={subtaskMap}
          />
        </div>

        {/* KPI row — 5 cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <KpiCard
            label="Прогресс"
            value={`${summary.completionRate}%`}
            color="hsl(var(--primary))"
            active={false}
          />
          <KpiCard
            label="Выполнено"
            value={summary.totalCompleted}
            color="hsl(142, 71%, 45%)"
          />
          <KpiCard
            label="Просрочено"
            value={summary.totalOverdue}
            color="hsl(0, 72%, 58%)"
            active={expandedKpi === "overdue"}
            onClick={() => setExpandedKpi(prev => prev === "overdue" ? null : "overdue")}
          />
          <KpiCard
            label="Drift"
            value={summary.totalDrift}
            color="hsl(38, 92%, 50%)"
            active={expandedKpi === "drift"}
            onClick={() => setExpandedKpi(prev => prev === "drift" ? null : "drift")}
          />
          <KpiCard
            label="Активных проектов"
            value={summary.activeProjects}
            trend={`из ${summary.totalProjects} всего`}
            trendType="flat"
          />
        </div>

        {/* Detail panel from KPI click */}
        {expandedKpi === "overdue" && (
          <DetailPanel
            title="Просроченные задачи"
            tasks={summary.overdueTasks}
            onNavigateToTask={handleNavigateToTask}
            users={users}
            onClose={() => setExpandedKpi(null)}
          />
        )}
        {expandedKpi === "drift" && (
          <DetailPanel
            title="Задачи с отклонениями"
            tasks={summary.driftTasks}
            onNavigateToTask={handleNavigateToTask}
            users={users}
            onClose={() => setExpandedKpi(null)}
          />
        )}

        {/* AI Signals */}
        <AiSignalsPanel
          projectStats={projectStats}
          users={users}
          onAiTextChange={setAiSummaryText}
          onNavigateToProject={(groupId) => {
            setSelectedProjectIds([groupId]);
            setSelectedAssigneeIds([]);
            setSelectedTagIds([]);
            setSelectedParticipantIds([]);
          }}
          onNavigateToPerson={(userId) => {
            setSelectedAssigneeIds([userId]);
            setSelectedProjectIds([]);
            setSelectedTagIds([]);
            setSelectedParticipantIds([]);
          }}
          onFilterOverdue={() => {
            setExpandedKpi("overdue");
          }}
        />

        {/* Two-column grid: Hot Projects + Team Workload */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <HotProjectsCard
            projectStats={projectStats}
            onNavigateToProject={(groupId) => {
              setSelectedProjectIds([groupId]);
              setSelectedAssigneeIds([]);
              setSelectedTagIds([]);
              setSelectedParticipantIds([]);
            }}
          />
          <TeamWorkloadCard
            projectStats={projectStats}
            users={users}
            onFilterByPerson={(userId) => {
              setSelectedAssigneeIds([userId]);
              setSelectedProjectIds([]);
              setSelectedTagIds([]);
              setSelectedParticipantIds([]);
            }}
          />
        </div>

        {/* Interactive project & task list */}
        <ProjectTaskList
          projectStats={projectStats}
          users={users}
          onNavigateToTask={handleNavigateToTask}
          onNavigateToProject={(groupId) => {
            setSelectedProjectIds([groupId]);
            setSelectedAssigneeIds([]);
            setSelectedTagIds([]);
            setSelectedParticipantIds([]);
          }}
        />

        {/* Action bar */}
        <div className="bg-card rounded-lg border border-border px-3 py-2.5 flex items-center gap-2.5">
          <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground flex-1">Экспортировать отчёт для встречи или поделиться ссылкой на дашборд</span>
          <DashboardExportDialog
            projectStats={projectStats}
            summary={summary}
            users={users}
            aiSummary={aiSummaryText || undefined}
            subtaskMap={subtaskMap}
            trigger={
              <button className="text-[11px] px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors whitespace-nowrap">
                Экспорт для встречи →
              </button>
            }
          />
        </div>

      </div>
    </main>
  );
}

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useTasks, useTaskGroups, useAvailableUsers, useVisibleTags, useTaskMutations, Task, TaskGroup, Profile, Tag } from "@/hooks/useTasks";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Users, ListChecks, ChevronDown as ChevronDownIcon, CheckCircle } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import TaskItem from "@/components/TaskItem";
import {
  BarChart3, Loader2, TrendingUp, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronRight, CalendarClock, ArrowRightLeft, Filter, X,
  SlidersHorizontal, FolderOpen, User, Tag as TagIcon, BookOpen, Sparkles, Plus, RefreshCw,
  Activity, Zap, FileText, Maximize2, Minimize2, Monitor, LayoutGrid
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import { Link, useNavigate } from "react-router-dom";
import DashboardExportDialog from "@/components/DashboardExportDialog";
import QuickCreateForm from "@/components/QuickCreateForm";
import type { QuickCreateResult } from "@/components/QuickCreateForm";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ProjectWikiTab from "@/components/wiki/ProjectWikiTab";
import ProjectIcon from "@/components/ProjectIcon";
import { format, differenceInDays, isAfter, isBefore, startOfDay, addDays, subDays, parseISO, isToday, isPast } from "date-fns";
import { ru } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { Checkbox } from "@/components/ui/checkbox";
import ReactMarkdown from "react-markdown";
import { streamChat, StreamChatError } from "@/lib/streamChat";
import { getInitials, getAvatarColors } from "@/lib/initials";

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
        "bg-card rounded-lg border border-border p-2.5 sm:p-3 text-left transition-all hover:border-muted-foreground/30 min-w-[120px] sm:min-w-0 shrink-0 sm:shrink flex flex-col",
        active && "border-primary ring-2 ring-primary/20"
      )}
    >
      <div className="text-[10px] text-muted-foreground mb-0.5 sm:mb-1 flex items-center justify-between whitespace-nowrap">
        <span>{label}</span>
        {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
      </div>
      <div className="text-xl sm:text-2xl font-medium leading-none mb-0.5" style={{ color: color || "hsl(var(--foreground))" }}>
        {value}
      </div>
      <div className={cn("text-[9px] sm:text-[10px] font-medium whitespace-nowrap min-h-[14px]", trendColor[trendType || "flat"])}>
        {trend || "\u00A0"}
      </div>
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

// --- AI Analysis Types ---
type AnalysisType = "signals" | "risks" | "trends";

const ANALYSIS_TYPES: { key: AnalysisType; label: string; icon: React.ElementType; desc: string }[] = [
  { key: "signals", label: "Сигналы", icon: Sparkles, desc: "Ключевые проблемы и достижения" },
  { key: "risks", label: "Риск-радар", icon: AlertTriangle, desc: "Риски по каждому проекту" },
  { key: "trends", label: "Тренды", icon: Activity, desc: "Velocity и прогнозы" },
];

interface RiskItem { project: string; severity: "high" | "medium" | "low"; issue: string; recommendation: string; }
interface TrendItem { title: string; direction: "up" | "down" | "flat"; metric: string; insight: string; forecast?: string; }

const AI_RISKS_CACHE_KEY = "jtd_ai_risks_cache";
const AI_TRENDS_CACHE_KEY = "jtd_ai_trends_cache";

function getCachedByKey<T>(key: string, ttl: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttl) { localStorage.removeItem(key); return null; }
    return data as T;
  } catch { return null; }
}
function setCacheByKey<T>(key: string, data: T) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

function buildDataContext(projectStats: ProjectStats[], users: Profile[]) {
  const userName = (userId: string) => users.find(u => u.id === userId)?.display_name || "—";
  const now = new Date();
  const weekFromNow = addDays(startOfDay(now), 7);
  const allTasks = projectStats.flatMap(s => [...s.tasks, ...s.subprojects.flatMap(sp => sp.tasks)]);
  const unique = Array.from(new Map(allTasks.map(t => [t.id, t])).values());
  const activeTasks = unique.filter(t => !t.is_completed);
  const completedTasks = unique.filter(t => t.is_completed);

  const assigneeLoad: Record<string, { name: string; total: number; overdue: number; drift: number }> = {};
  activeTasks.forEach(t => {
    const uid = t.assigned_to || t.user_id;
    const name = userName(uid);
    if (!assigneeLoad[uid]) assigneeLoad[uid] = { name, total: 0, overdue: 0, drift: 0 };
    assigneeLoad[uid].total++;
    if (t.deadline && new Date(t.deadline) < now) assigneeLoad[uid].overdue++;
    if (t.original_deadline && t.deadline && t.original_deadline !== t.deadline) assigneeLoad[uid].drift++;
  });

  const d7 = subDays(now, 7);
  const d14 = subDays(now, 14);
  const completedLast7 = completedTasks.filter(t => t.completed_at && new Date(t.completed_at) >= d7).length;
  const completedPrior7 = completedTasks.filter(t => t.completed_at && new Date(t.completed_at) >= d14 && new Date(t.completed_at) < d7).length;

  const upcomingByDay: Record<string, number> = {};
  activeTasks.forEach(t => {
    if (t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow) {
      const key = format(new Date(t.deadline), "yyyy-MM-dd");
      upcomingByDay[key] = (upcomingByDay[key] || 0) + 1;
    }
  });
  const peakDay = Object.entries(upcomingByDay).sort(([, a], [, b]) => b - a)[0];

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
    .sort((a, b) => b.total - a.total).slice(0, 10)
    .map(a => `  • ${a.name}: ${a.total} задач, ${a.overdue} просрочено, ${a.drift} drift`)
    .join("\n");

  return `Дата: ${format(now, "d MMMM yyyy", { locale: ru })}
Проекты (${projectStats.length}):\n${projectSummaries}
\nНагрузка исполнителей:\n${loadSummary}
\nВелосити: завершено ${completedLast7} задач за 7 дн (пред. неделя: ${completedPrior7})
Пик дедлайнов: ${peakDay ? `${format(parseISO(peakDay[0]), "dd MMM", { locale: ru })} — ${peakDay[1]} задач` : "нет"}
Застопоренных проектов (0 завершений за 14 дн): ${stalledProjects.length > 0 ? stalledProjects.map(s => s.group.name).join(", ") : "нет"}`;
}

function getPromptForType(type: AnalysisType, dataContext: string): { prompt: string; systemPrompt: string } {
  switch (type) {
    case "signals":
      return {
        systemPrompt: "Ты аналитик операционного управления. Анализируй данные проектов и возвращай ТОЛЬКО JSON. Никакого текста до или после JSON.",
        prompt: `Данные проектов:\n${dataContext}\n\nВерни JSON массив ровно из 6 сигналов:\n[{\n  "level": "red"|"amber"|"green",\n  "title": "короткий заголовок (до 50 символов)",\n  "desc": "объяснение (до 100 символов)",\n  "action": "конкретное действие (до 35 символов)",\n  "project": "название проекта или null",\n  "person": "имя человека или null"\n}]\n\nПравила:\n- red: критические проблемы, требует действия сегодня (2 шт)\n- amber: предупреждения, действие на этой неделе (2 шт)\n- green: положительная динамика или достижение (2 шт)\n\nКаждый сигнал — уникальный аспект:\n1. Критический путь / просрочки\n2. Перегрузка конкретного исполнителя\n3. Пик дедлайнов на ближайшие дни\n4. Drift паттерн (системные переносы)\n5. Застой проекта без прогресса\n6. Velocity или достижение\n\nДавай конкретные actionable рекомендации руководителю. Упоминай конкретные проекты и людей.`,
      };
    case "risks":
      return {
        systemPrompt: "Ты риск-менеджер проектного портфеля. Оцени каждый проект и верни ТОЛЬКО JSON.",
        prompt: `Данные проектов:\n${dataContext}\n\nВерни JSON массив рисков:\n[{\n  "project": "название проекта",\n  "severity": "high"|"medium"|"low",\n  "issue": "описание риска (до 80 символов)",\n  "recommendation": "рекомендация (до 60 символов)"\n}]\n\nПравила:\n- high: срыв сроков, критическая просрочка, блокер\n- medium: дрифт, перегрузка, застой\n- low: незначительные отклонения\n- Анализируй каждый проект с задачами. Пропускай проекты без проблем\n- Максимум 8 рисков, сортируй по severity desc`,
      };
    case "trends":
      return {
        systemPrompt: "Ты аналитик трендов и прогнозов. Анализируй динамику и верни ТОЛЬКО JSON.",
        prompt: `Данные проектов:\n${dataContext}\n\nВерни JSON массив из 3-5 трендов:\n[{\n  "title": "название тренда (до 40 символов)",\n  "direction": "up"|"down"|"flat",\n  "metric": "ключевая метрика (число или %)",\n  "insight": "объяснение тренда (до 100 символов)",\n  "forecast": "прогноз на неделю (до 60 символов) или null"\n}]\n\nАнализируй:\n1. Velocity (скорость закрытия задач, сравни неделю с предыдущей)\n2. Тренд просрочек (растут/падают)\n3. Drift паттерны (системные переносы)\n4. Прогноз завершения ключевых проектов\n5. Баланс нагрузки команды`,
      };
  }
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
  const [risks, setRisks] = useState<RiskItem[]>(() => getCachedByKey<RiskItem[]>(AI_RISKS_CACHE_KEY, AI_SIGNALS_TTL) || []);
  const [trends, setTrends] = useState<TrendItem[]>(() => getCachedByKey<TrendItem[]>(AI_TRENDS_CACHE_KEY, AI_SIGNALS_TTL) || []);
  const [activeType, setActiveType] = useState<AnalysisType>("signals");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Sync AI text for export
  useEffect(() => {
    if (signals.length > 0) {
      onAiTextChange?.(signals.map(s => `[${s.level.toUpperCase()}] ${s.title}: ${s.desc}`).join("\n"));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = useCallback(async (type: AnalysisType, forceRefresh = false) => {
    if (loading || projectStats.length === 0) return;

    // Check cache
    if (!forceRefresh) {
      if (type === "signals") { const c = getCachedSignals(); if (c && c.length > 0) { setSignals(c); onAiTextChange?.(c.map(s => `[${s.level.toUpperCase()}] ${s.title}: ${s.desc}`).join("\n")); return; } }
      if (type === "risks") { const c = getCachedByKey<RiskItem[]>(AI_RISKS_CACHE_KEY, AI_SIGNALS_TTL); if (c && c.length > 0) { setRisks(c); return; } }
      if (type === "trends") { const c = getCachedByKey<TrendItem[]>(AI_TRENDS_CACHE_KEY, AI_SIGNALS_TTL); if (c && c.length > 0) { setTrends(c); return; } }
    }

    setLoading(true);
    setError(null);
    setCollapsed(false);

    const dataContext = buildDataContext(projectStats, users);
    const { prompt, systemPrompt } = getPromptForType(type, dataContext);

    try {
      let fullText = "";
      await streamChat({
        url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        body: { message: prompt, context: { module: "pmo" }, systemPrompt },
        onDelta: (chunk) => { fullText += chunk; },
        onDone: () => {
          try {
            const jsonMatch = fullText.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (type === "signals") {
                const trimmed = parsed.slice(0, 6) as AiSignal[];
                setSignals(trimmed);
                setCachedSignals(trimmed);
                onAiTextChange?.(trimmed.map((s: AiSignal) => `[${s.level.toUpperCase()}] ${s.title}: ${s.desc}`).join("\n"));
              } else if (type === "risks") {
                const trimmed = parsed.slice(0, 8) as RiskItem[];
                setRisks(trimmed);
                setCacheByKey(AI_RISKS_CACHE_KEY, trimmed);
              } else if (type === "trends") {
                const trimmed = parsed.slice(0, 5) as TrendItem[];
                setTrends(trimmed);
                setCacheByKey(AI_TRENDS_CACHE_KEY, trimmed);
              }
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

  const currentData = activeType === "signals" ? signals : activeType === "risks" ? risks : trends;
  const hasData = currentData.length > 0;
  const statsReady = projectStats.length > 0;

  if (!statsReady) return null;

  // Header summary counts
  const redCount = signals.filter(s => s.level === "red").length;
  const amberCount = signals.filter(s => s.level === "amber").length;
  const highRisks = risks.filter(r => r.severity === "high").length;

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

  const RISK_SEVERITY = {
    high: { bg: "bg-red-500/8 dark:bg-red-500/15", border: "border-red-500/20", text: "text-red-700 dark:text-red-400", label: "🔴 Высокий" },
    medium: { bg: "bg-amber-500/8 dark:bg-amber-500/15", border: "border-amber-500/20", text: "text-amber-700 dark:text-amber-400", label: "🟡 Средний" },
    low: { bg: "bg-blue-500/8 dark:bg-blue-500/15", border: "border-blue-500/20", text: "text-blue-700 dark:text-blue-400", label: "🔵 Низкий" },
  };

  const trendIcon = (dir: string) => {
    if (dir === "up") return "📈";
    if (dir === "down") return "📉";
    return "➡️";
  };
  const trendColor = (dir: string) => {
    if (dir === "up") return "text-emerald-700 dark:text-emerald-400";
    if (dir === "down") return "text-red-700 dark:text-red-400";
    return "text-muted-foreground";
  };

  return (
    <div className="bg-card rounded-lg border border-primary/30 overflow-hidden">
      {/* Header */}
      <div
        className="px-3 py-1.5 border-b border-border bg-primary/5 flex items-center gap-2 cursor-pointer hover:bg-primary/8 transition-colors"
        onClick={() => setCollapsed(v => !v)}
      >
        <Sparkles className="h-3 w-3 text-primary shrink-0" />
        <span className="text-[11px] font-medium text-primary">ИИ-аналитика</span>

        {/* Collapsed summary */}
        {collapsed && (signals.length > 0 || risks.length > 0) && (
          <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {redCount > 0 && <span className="text-red-500 font-medium">🔴 {redCount}</span>}
            {amberCount > 0 && <span className="text-amber-500">🟡 {amberCount}</span>}
            {highRisks > 0 && <span className="text-red-500">⚠ {highRisks} рисков</span>}
            {signals.length > 0 && <span>{signals.length} сигн.</span>}
          </span>
        )}

        <div className="flex items-center gap-1 ml-auto shrink-0">
          {loading && <Loader2 className="h-3 w-3 animate-spin text-primary/60" />}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div>
          {/* Analysis type tabs */}
          <div className="px-2 pt-2 pb-1 flex items-center gap-1">
            {ANALYSIS_TYPES.map(t => {
              const Icon = t.icon;
              const isActive = activeType === t.key;
              const hasCache = t.key === "signals" ? signals.length > 0 : t.key === "risks" ? risks.length > 0 : trends.length > 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveType(t.key)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all",
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                  )}
                  title={t.desc}
                >
                  <Icon className="h-3 w-3" />
                  {t.label}
                  {hasCache && <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />}
                </button>
              );
            })}

            <div className="ml-auto flex items-center gap-0.5">
              <button
                onClick={() => generate(activeType, true)}
                disabled={loading}
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
                title="Обновить"
              >
                <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mx-2 mb-2 px-2.5 py-1.5 rounded-md bg-destructive/5 border border-destructive/20 flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
              <span className="text-[11px] text-destructive flex-1">{error}</span>
              <button onClick={() => generate(activeType, true)} className="text-[11px] text-primary hover:underline shrink-0">Повторить</button>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="px-2 pb-2 space-y-1.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-lg p-2.5 animate-pulse bg-muted/50">
                  <div className="h-3.5 bg-muted rounded w-2/3 mb-1.5" />
                  <div className="h-3 bg-muted rounded w-full" />
                </div>
              ))}
            </div>
          )}

          {/* No data - generate button */}
          {!loading && !hasData && (
            <div className="px-3 pb-3 pt-1">
              <button
                onClick={() => generate(activeType, true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 transition-all"
              >
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-medium">Запросить {ANALYSIS_TYPES.find(t => t.key === activeType)?.label.toLowerCase()}</span>
              </button>
              <p className="text-[10px] text-muted-foreground text-center mt-1.5">
                {ANALYSIS_TYPES.find(t => t.key === activeType)?.desc}
              </p>
            </div>
          )}

          {/* Signals view */}
          {!loading && activeType === "signals" && signals.length > 0 && (
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
          )}

          {/* Risks view */}
          {!loading && activeType === "risks" && risks.length > 0 && (
            <div className="px-2 pb-2 space-y-1">
              {risks.map((risk, i) => {
                const cfg = RISK_SEVERITY[risk.severity] || RISK_SEVERITY.low;
                const matchedProject = projectStats.find(s =>
                  s.group.name.toLowerCase().includes(risk.project.toLowerCase())
                );
                return (
                  <button
                    key={i}
                    onClick={() => matchedProject && onNavigateToProject?.(matchedProject.group.id)}
                    className={cn(
                      "w-full flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-all hover:ring-1 hover:ring-primary/20",
                      cfg.bg, cfg.border
                    )}
                  >
                    <span className={cn("text-[10px] font-medium shrink-0 w-16 pt-0.5", cfg.text)}>{cfg.label}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium text-foreground">{risk.project}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{risk.issue}</div>
                      <div className="text-[9px] text-muted-foreground/80 mt-0.5">💡 {risk.recommendation}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Trends view */}
          {!loading && activeType === "trends" && trends.length > 0 && (
            <div className="px-2 pb-2 space-y-1">
              {trends.map((trend, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2">
                  <span className="text-base shrink-0 mt-0.5">{trendIcon(trend.direction)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[11px] font-medium", trendColor(trend.direction))}>{trend.title}</span>
                      <span className="text-[10px] font-mono font-semibold text-foreground bg-muted px-1 py-0.5 rounded">{trend.metric}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{trend.insight}</div>
                    {trend.forecast && (
                      <div className="text-[9px] text-primary/80 mt-0.5 font-medium">🔮 {trend.forecast}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Hot Projects Card ---
function HotProjectsCard({ projectStats, onNavigateToProject }: {
  projectStats: ProjectStats[];
  onNavigateToProject?: (groupId: string) => void;
}) {
  const [sortBy, setSortBy] = useState<"overdue" | "progress">("overdue");
  const [collapsed, setCollapsed] = useState(false);

  const sorted = useMemo(() => {
    const withIssues = projectStats.filter(s => s.total > 0);
    return [...withIssues].sort((a, b) => {
      if (sortBy === "overdue") return b.overdue - a.overdue;
      const pctA = a.total > 0 ? a.completed / a.total : 0;
      const pctB = b.total > 0 ? b.completed / b.total : 0;
      return pctA - pctB;
    }).slice(0, 8);
  }, [projectStats, sortBy]);

  const criticalCount = projectStats.filter(s => s.overdue > 0 || (s.total > 0 && s.completed === 0)).length;
  const totalOverdue = projectStats.reduce((s, p) => s + p.overdue, 0);
  const totalDrift = projectStats.reduce((s, p) => s + p.driftCount, 0);
  const avgProgress = projectStats.length > 0
    ? Math.round(projectStats.reduce((s, p) => s + (p.total > 0 ? p.completed / p.total : 0), 0) / projectStats.length * 100)
    : 0;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-3 py-2 border-b border-border flex items-center gap-1.5 hover:bg-muted/30 transition-colors"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <span className="text-xs font-medium text-foreground">Горящие проекты</span>
        {criticalCount > 0 && (
          <span className="text-[10px] px-1.5 py-px rounded bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
            {criticalCount} крит.
          </span>
        )}
        <span className="flex-1" />
        {collapsed && (
          <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {totalOverdue > 0 && <span className="text-red-500 font-medium">⚠ {totalOverdue}</span>}
            {totalDrift > 0 && <span className="text-amber-500">{totalDrift} drift</span>}
            <span>{avgProgress}% сред.</span>
          </span>
        )}
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
      </button>
      {!collapsed && (
        <div>
          <div className="px-3 py-1.5 flex items-center gap-2 border-b border-border bg-muted/20">
            <span className="text-[10px] text-muted-foreground">
              {projectStats.length} проектов · {avgProgress}% сред. прогресс
            </span>
            {totalOverdue > 0 && <span className="text-[10px] text-red-500 font-medium">⚠ {totalOverdue} просроч.</span>}
            {totalDrift > 0 && <span className="text-[10px] text-amber-500">{totalDrift} drift</span>}
            <span className="flex-1" />
            <button
              onClick={(e) => { e.stopPropagation(); setSortBy(s => s === "overdue" ? "progress" : "overdue"); }}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
            >
              {sortBy === "overdue" ? "по просрочкам ↕" : "по прогрессу ↕"}
            </button>
          </div>
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
      )}
    </div>
  );
}

// --- Team Workload Card ---
function TeamWorkloadCard({ projectStats, users, onFilterByPerson }: {
  projectStats: ProjectStats[];
  users: Profile[];
  onFilterByPerson?: (userId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [sortBy, setSortBy] = useState<"overdue" | "total">("overdue");

  const workload = useMemo(() => {
    const now = new Date();
    const allTasks = projectStats.flatMap(s => [...s.tasks, ...s.subprojects.flatMap(sp => sp.tasks)]);
    const unique = Array.from(new Map(allTasks.map(t => [t.id, t])).values());
    const active = unique.filter(t => !t.is_completed);

    const map: Record<string, { name: string; total: number; overdue: number; drift: number; completedToday: number }> = {};
    active.forEach(t => {
      const uid = t.assigned_to || t.user_id;
      const u = users.find(u => u.id === uid);
      if (!u) return;
      if (!map[uid]) map[uid] = { name: u.display_name || "—", total: 0, overdue: 0, drift: 0, completedToday: 0 };
      map[uid].total++;
      if (t.deadline && new Date(t.deadline) < now) map[uid].overdue++;
      if (t.original_deadline && t.deadline && t.original_deadline !== t.deadline) map[uid].drift++;
    });

    // Count today's completions
    const today = new Date(); today.setHours(0,0,0,0);
    const completed = unique.filter(t => t.is_completed && t.completed_at && new Date(t.completed_at) >= today);
    completed.forEach(t => {
      const uid = t.assigned_to || t.user_id;
      const u = users.find(u => u.id === uid);
      if (!u) return;
      if (!map[uid]) map[uid] = { name: u.display_name || "—", total: 0, overdue: 0, drift: 0, completedToday: 0 };
      map[uid].completedToday++;
    });

    return Object.entries(map)
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => {
        if (sortBy === "overdue") return b.overdue - a.overdue || b.total - a.total;
        return b.total - a.total || b.overdue - a.overdue;
      })
      .slice(0, 10);
  }, [projectStats, users, sortBy]);

  const maxTotal = Math.max(...workload.map(w => w.total), 1);
  const totalPeopleWithOverdue = workload.filter(w => w.overdue > 0).length;
  const totalOverdueSum = workload.reduce((s, w) => s + w.overdue, 0);
  const totalActive = workload.reduce((s, w) => s + w.total, 0);



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

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-3 py-2 border-b border-border flex items-center gap-1.5 hover:bg-muted/30 transition-colors"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="text-xs font-medium text-foreground">Загрузка команды</span>
        <span className="text-[10px] px-1.5 py-px rounded bg-primary/10 text-primary font-medium">
          {workload.length} чел.
        </span>
        <span className="flex-1" />
        {collapsed && (
          <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
            {totalOverdueSum > 0 && <span className="text-red-500 font-medium">⚠ {totalOverdueSum}</span>}
            <span>{totalActive} задач</span>
          </span>
        )}
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
      </button>
      {!collapsed && (
        <div>
          <div className="px-3 py-1.5 flex items-center gap-2 border-b border-border bg-muted/20">
            <span className="text-[10px] text-muted-foreground">{totalActive} активных задач</span>
            {totalPeopleWithOverdue > 0 && (
              <span className="text-[10px] text-red-500 font-medium">{totalPeopleWithOverdue} с просрочками</span>
            )}
            <span className="flex-1" />
            <button
              onClick={(e) => { e.stopPropagation(); setSortBy(s => s === "overdue" ? "total" : "overdue"); }}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
            >
              {sortBy === "overdue" ? "по просрочкам ↕" : "по загрузке ↕"}
            </button>
          </div>
          {workload.map(w => {
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
                <span className="text-[10px] text-muted-foreground shrink-0">{w.total}</span>
                <div className="w-14 h-1 bg-muted rounded-sm overflow-hidden shrink-0">
                  <div className={cn("h-full rounded-sm", barColor(w))} style={{ width: `${Math.round((w.total / maxTotal) * 100)}%` }} />
                </div>
                {w.overdue > 0 && (
                  <span className="text-[10px] min-w-[70px] text-right shrink-0 text-red-500 font-medium">
                    {w.overdue} просроч.
                  </span>
                )}
                {w.overdue === 0 && w.drift > 0 && (
                  <span className="text-[10px] min-w-[70px] text-right shrink-0 text-amber-500">
                    {w.drift} drift
                  </span>
                )}
                {w.overdue === 0 && w.drift === 0 && (
                  <span className="text-[10px] min-w-[70px] text-right shrink-0 text-emerald-500">в норме</span>
                )}
                {w.completedToday > 0 && (
                  <span className="text-[10px] text-emerald-500 shrink-0">✓{w.completedToday}</span>
                )}
              </button>
          );
        })}
        {workload.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Нет данных</div>
        )}
      </div>
      )}
    </div>
  );
}

// --- Interactive Project & Task List (with summary sections like SubprojectCards) ---
function ProjectTaskList({ projectStats, users, onOpenTask, onNavigateToProject, subtaskMap }: {
  projectStats: ProjectStats[];
  users: Profile[];
  onOpenTask: (taskId: string) => void;
  onNavigateToProject: (groupId: string) => void;
  subtaskMap: SubtaskMap;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"all" | "overdue" | "drift" | "on-track" | "completed">("all");
  const [collapsed, setCollapsed] = useState(false);

  const toggle = (id: string) => setExpandedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const userName = (userId: string | null) => {
    if (!userId) return "";
    return users.find(u => u.id === userId)?.display_name || "";
  };

  const filteredProjects = useMemo(() => {
    if (statusFilter === "all") return projectStats;
    if (statusFilter === "drift") return projectStats.filter(s => s.timingStatus === "at-risk" || s.driftCount > 0);
    return projectStats.filter(s => s.timingStatus === statusFilter);
  }, [projectStats, statusFilter]);

  const totalProjects = projectStats.length;
  const totalOverdue = projectStats.reduce((s, p) => s + p.overdue, 0);
  const totalDrift = projectStats.reduce((s, p) => s + p.driftCount, 0);
  const totalTasks = projectStats.reduce((s, p) => s + p.total, 0);
  const totalCompleted = projectStats.reduce((s, p) => s + p.completed, 0);
  const avgPct = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  const d7 = subDays(new Date(), 7);
  const weeklyDone = useMemo(() => {
    return projectStats.reduce((sum, ps) => {
      const allT = [...ps.tasks, ...ps.subprojects.flatMap(sp => sp.tasks)];
      return sum + allT.filter(t => t.is_completed && t.completed_at && new Date(t.completed_at) >= d7).length;
    }, 0);
  }, [projectStats, d7]);

  const unassignedCount = useMemo(() => {
    return projectStats.reduce((sum, ps) => {
      const allT = [...ps.tasks, ...ps.subprojects.flatMap(sp => sp.tasks)];
      return sum + allT.filter(t => !t.is_completed && !t.assigned_to).length;
    }, 0);
  }, [projectStats]);

  if (projectStats.length === 0) return null;

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-3 py-2 border-b border-border flex items-center gap-1.5 hover:bg-muted/30 transition-colors"
      >
        <ListChecks className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-foreground">Проекты и задачи</span>
        <span className="text-[10px] px-1.5 py-px rounded bg-primary/10 text-primary font-medium">{totalProjects}</span>
        <span className="flex-1" />
        <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {totalOverdue > 0 && <span className="text-red-500 font-medium">⚠ {totalOverdue}</span>}
          {totalDrift > 0 && <span className="text-amber-500">↗ {totalDrift}</span>}
          {unassignedCount > 0 && <span className="text-orange-500">👤 {unassignedCount}</span>}
          <span className="text-emerald-500">✓{weeklyDone}/нед</span>
          <span>{avgPct}%</span>
        </span>
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
      </button>

      {!collapsed && (
        <>
          <div className="px-3 py-1.5 border-b border-border flex items-center gap-0.5 flex-wrap bg-muted/20">
            {(["all", "overdue", "drift", "on-track", "completed"] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  "text-[10px] px-2 py-0.5 rounded transition-colors",
                  statusFilter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {f === "all" ? "Все" : f === "overdue" ? "Просрочено" : f === "drift" ? "Drift" : f === "on-track" ? "В графике" : "Завершено"}
              </button>
            ))}
          </div>

          <div className="divide-y divide-border max-h-[600px] overflow-y-auto scrollbar-thin">
            {filteredProjects.map(ps => {
              const isExpanded = expandedIds.has(ps.group.id);
              const pct = ps.total > 0 ? Math.round((ps.completed / ps.total) * 100) : 0;

              // Unique assignees for this project
              const allTasks = [...ps.tasks, ...ps.subprojects.flatMap(sp => sp.tasks)];
              const uniqueTasksArr = Array.from(new Map(allTasks.map(t => [t.id, t])).values());
              const activeTasks = uniqueTasksArr.filter(t => !t.is_completed);
              const assigneeIds = [...new Set(activeTasks.map(t => t.assigned_to).filter(Boolean))] as string[];
              const hasUnassigned = activeTasks.some(t => !t.assigned_to);



              return (
                <div key={ps.group.id}>
                  <button
                    onClick={() => toggle(ps.group.id)}
                    className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left"
                  >
                    {ps.group.logo_url ? (
                      <img
                        src={ps.group.logo_url}
                        alt={ps.group.name}
                        className="h-7 w-7 rounded-lg object-cover ring-1 ring-border shrink-0"
                      />
                    ) : (
                      <div
                        className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-semibold"
                        style={{ backgroundColor: ps.group.color || "hsl(var(--primary))" }}
                      >
                        {ps.group.icon && ps.group.icon !== "list" ? ps.group.icon : ps.group.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-medium text-foreground truncate flex-1 min-w-0">{ps.group.name}</span>

                    {/* Assignee pills */}
                    <div className="hidden sm:flex items-center gap-0.5 shrink-0">
                      {assigneeIds.slice(0, 3).map(uid => {
                        const u = users.find(u => u.id === uid);
                        const name = u?.display_name || "?";
                        const colors = getAvatarColors(name);
                        return (
                          <div
                            key={uid}
                            className="h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-medium"
                            style={colors}
                            title={name}
                          >
                            {getInitials(name)}
                          </div>
                        );
                      })}
                      {assigneeIds.length > 3 && (
                        <span className="text-[9px] text-muted-foreground ml-0.5">+{assigneeIds.length - 3}</span>
                      )}
                      {hasUnassigned && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium whitespace-nowrap ml-0.5">
                          👤 !
                        </span>
                      )}
                    </div>

                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-full border font-medium shrink-0",
                      ps.timingStatus === "on-track" ? "text-emerald-700 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400" :
                      ps.timingStatus === "at-risk" ? "text-amber-700 bg-amber-500/10 border-amber-500/20 dark:text-amber-400" :
                      ps.timingStatus === "overdue" ? "text-red-700 bg-red-500/10 border-red-500/20 dark:text-red-400" :
                      "text-muted-foreground bg-muted border-border"
                    )}>
                      {getStatusLabel(ps.timingStatus)}
                    </span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Progress value={pct} className="w-14 h-1.5" />
                      <span className="text-[10px] text-muted-foreground">{pct}% · {ps.completed}/{ps.total}</span>
                    </div>

                    {ps.overdue > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-destructive/10 text-destructive border border-destructive/20">
                        <AlertTriangle className="h-3 w-3" />{ps.overdue}
                      </span>
                    )}
                    {ps.driftCount > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-medium text-amber-600 dark:text-amber-400 border border-dashed border-amber-500/40">
                        <ArrowRightLeft className="h-3 w-3" />{ps.driftCount}
                      </span>
                    )}

                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  </button>

                  {isExpanded && (
                    <ExpandedProjectSummary
                      ps={ps}
                      userName={userName}
                      onOpenTask={onOpenTask}
                      onNavigateToProject={onNavigateToProject}
                      subtaskMap={subtaskMap}
                      users={users}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ExpandedProjectSummary({ ps, userName, onOpenTask, onNavigateToProject, subtaskMap, users }: {
  ps: ProjectStats;
  userName: (userId: string | null) => string;
  onOpenTask: (taskId: string) => void;
  onNavigateToProject: (groupId: string) => void;
  subtaskMap: SubtaskMap;
  users: Profile[];
}) {
  const [expandedSubprojects, setExpandedSubprojects] = useState<Set<string>>(new Set());

  const toggleSp = (id: string) => setExpandedSubprojects(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const recentDone = useMemo(() => {
    const allTasks = [...ps.tasks, ...ps.subprojects.flatMap(sp => sp.tasks)];
    const unique = Array.from(new Map(allTasks.map(t => [t.id, t])).values());
    const d7 = subDays(new Date(), 7);
    return unique
      .filter(t => t.is_completed && t.completed_at && new Date(t.completed_at) >= d7)
      .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());
  }, [ps]);

  // Weekly activity indicator
  const d7 = subDays(new Date(), 7);
  const weeklyCreated = useMemo(() => {
    const allT = [...ps.tasks, ...ps.subprojects.flatMap(sp => sp.tasks)];
    return allT.filter(t => new Date(t.created_at) >= d7).length;
  }, [ps, d7]);

  // Unassigned tasks
  const unassignedTasks = useMemo(() => {
    const allT = [...ps.tasks, ...ps.subprojects.flatMap(sp => sp.tasks)];
    const unique = Array.from(new Map(allT.map(t => [t.id, t])).values());
    return unique.filter(t => !t.is_completed && !t.assigned_to);
  }, [ps]);

  const subprojectsWithTasks = ps.subprojects.filter(sp => sp.total > 0);

  // Unique assignees
  const assigneeInfo = useMemo(() => {
    const allT = [...ps.tasks, ...ps.subprojects.flatMap(sp => sp.tasks)];
    const unique = Array.from(new Map(allT.map(t => [t.id, t])).values());
    const active = unique.filter(t => !t.is_completed);
    const ids = [...new Set(active.map(t => t.assigned_to).filter(Boolean))] as string[];
    return { assigneeIds: ids, hasUnassigned: active.some(t => !t.assigned_to), unassignedCount: active.filter(t => !t.assigned_to).length };
  }, [ps]);




  return (
    <div className="border-t border-border px-3 pb-3 pt-2 space-y-3 bg-muted/20 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => onNavigateToProject(ps.group.id)}
          className="text-[11px] text-primary hover:text-primary/80 font-medium flex items-center gap-1"
        >
          <FolderOpen className="h-3 w-3" /> Открыть проект
        </button>
        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">✓ {recentDone.length} за 7 дн</span>
        {weeklyCreated > 0 && <span className="text-[10px] text-blue-500">+ {weeklyCreated} новых</span>}
        {ps.overdue > 0 && <span className="text-[10px] text-red-500">⚠ {ps.overdue} просроч.</span>}
        {ps.driftCount > 0 && <span className="text-[10px] text-amber-600 dark:text-amber-400">↗ drift ø{ps.avgDriftDays}д</span>}
        {ps.nextDeadline && <span className="text-[10px] text-muted-foreground">⏰ {format(new Date(ps.nextDeadline), "dd MMM", { locale: ru })}</span>}
      </div>

      {/* Assignees row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground shrink-0">Команда:</span>
        {assigneeInfo.assigneeIds.map(uid => {
          const u = users.find(u => u.id === uid);
          const name = u?.display_name || "?";
          const colors = getAvatarColors(name);
          return (
            <span key={uid} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted/60 text-foreground font-medium" title={name}>
              <span className="h-4 w-4 rounded-full flex items-center justify-center text-[7px] font-semibold" style={colors}>{getInitials(name)}</span>
              {name.split(/\s+/).filter(Boolean)[0] || name}
            </span>
          );
        })}
        {assigneeInfo.assigneeIds.length === 0 && !assigneeInfo.hasUnassigned && (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
        {assigneeInfo.hasUnassigned && (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium">
            👤 Назначьте ответственного · {assigneeInfo.unassignedCount}
          </span>
        )}
      </div>

      {subprojectsWithTasks.length > 0 && (
        <DashboardSummarySection title="Подпроекты" count={subprojectsWithTasks.length}>
          <div className="space-y-0.5">
            {subprojectsWithTasks.map(sp => {
              const spPct = sp.total > 0 ? Math.round((sp.completed / sp.total) * 100) : 0;
              const isSpExpanded = expandedSubprojects.has(sp.group.id);
              return (
                <div key={sp.group.id}>
                  <button
                    onClick={() => toggleSp(sp.group.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    {sp.group.logo_url ? (
                      <img
                        src={sp.group.logo_url}
                        alt={sp.group.name}
                        className="h-5 w-5 rounded object-cover ring-1 ring-border shrink-0"
                      />
                    ) : (
                      <div
                        className="h-5 w-5 rounded flex items-center justify-center shrink-0 text-white text-[8px] font-semibold"
                        style={{ backgroundColor: sp.group.color || "hsl(var(--primary))" }}
                      >
                        {sp.group.icon && sp.group.icon !== "list" ? sp.group.icon : sp.group.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-[11px] font-medium truncate flex-1">{sp.group.name}</span>
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-full border font-medium",
                      sp.timingStatus === "overdue" ? "text-red-700 bg-red-500/10 border-red-500/20 dark:text-red-400" :
                      sp.timingStatus === "at-risk" ? "text-amber-700 bg-amber-500/10 border-amber-500/20 dark:text-amber-400" :
                      sp.timingStatus === "on-track" ? "text-emerald-700 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400" :
                      "text-muted-foreground bg-muted border-border"
                    )}>
                      {getStatusLabel(sp.timingStatus)}
                    </span>
                    {sp.overdue > 0 && <span className="text-[9px] text-red-500">⚠ {sp.overdue}</span>}
                    {sp.driftCount > 0 && <span className="text-[9px] text-amber-500">↗ {sp.driftCount}</span>}
                    <Progress value={spPct} className="w-10 h-1" />
                    <span className="text-[9px] text-muted-foreground">{spPct}% · {sp.completed}/{sp.total}</span>
                    {isSpExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  </button>
                  {isSpExpanded && (
                    <div className="ml-5 pl-2 border-l-2 border-border/50 space-y-0.5 py-1 animate-fade-in">
                      {sp.overdueTasks.length > 0 && sp.overdueTasks.map(t => (
                        <TaskSummaryRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} onOpenTask={onOpenTask} subtaskMap={subtaskMap} variant="overdue" showUnassigned hideProjectBadge />
                      ))}
                      {sp.upcomingTasks.map(t => (
                        <TaskSummaryRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} onOpenTask={onOpenTask} subtaskMap={subtaskMap} showUnassigned hideProjectBadge />
                      ))}
                      {sp.tasks.filter(t => !t.is_completed && !sp.overdueTasks.includes(t) && !sp.upcomingTasks.includes(t)).slice(0, 5).map(t => (
                        <TaskSummaryRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} onOpenTask={onOpenTask} subtaskMap={subtaskMap} showUnassigned hideProjectBadge />
                      ))}
                      {sp.total > 0 && sp.tasks.filter(t => !t.is_completed).length === 0 && (
                        <span className="text-[10px] text-muted-foreground px-2">Все задачи выполнены ✓</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DashboardSummarySection>
      )}

      {unassignedTasks.length > 0 && (
        <DashboardSummarySection title="Назначьте ответственного" count={unassignedTasks.length} variant="unassigned">
          <div className="space-y-0.5">
            {unassignedTasks.slice(0, 5).map(t => (
              <TaskSummaryRow key={t.id} task={t} userName="" onOpenTask={onOpenTask} subtaskMap={subtaskMap} showUnassigned />
            ))}
            {unassignedTasks.length > 5 && (
              <span className="text-[10px] text-muted-foreground px-2">…и ещё {unassignedTasks.length - 5}</span>
            )}
          </div>
        </DashboardSummarySection>
      )}

      {recentDone.length > 0 && (
        <DashboardSummarySection title="Выполнено (7 дн)" count={recentDone.length} variant="success">
          <div className="space-y-0.5">
            {recentDone.slice(0, 5).map(t => (
              <TaskSummaryRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} onOpenTask={onOpenTask} subtaskMap={subtaskMap} variant="done" />
            ))}
          </div>
        </DashboardSummarySection>
      )}

      {ps.overdueTasks.length > 0 && (
        <DashboardSummarySection title="Просроченные" count={ps.overdueTasks.length} variant="destructive">
          <div className="space-y-0.5">
            {ps.overdueTasks.map(t => (
              <TaskSummaryRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} onOpenTask={onOpenTask} subtaskMap={subtaskMap} variant="overdue" showUnassigned />
            ))}
          </div>
        </DashboardSummarySection>
      )}

      {ps.driftTasks.length > 0 && (
        <DashboardSummarySection title="Сдвиг сроков" count={ps.driftTasks.length} variant="warning">
          <div className="space-y-0.5">
            {ps.driftTasks.map(({ task: t, driftDays }) => (
              <TaskSummaryRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} onOpenTask={onOpenTask} subtaskMap={subtaskMap} drift={driftDays} showUnassigned />
            ))}
          </div>
        </DashboardSummarySection>
      )}

      {ps.upcomingTasks.length > 0 && (
        <DashboardSummarySection title="Ближайшие дедлайны" count={ps.upcomingTasks.length}>
          <div className="space-y-0.5">
            {ps.upcomingTasks.map(t => (
              <TaskSummaryRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} onOpenTask={onOpenTask} subtaskMap={subtaskMap} showUnassigned />
            ))}
          </div>
        </DashboardSummarySection>
      )}

      {ps.total === 0 && subprojectsWithTasks.length === 0 && (
        <p className="text-[11px] text-muted-foreground text-center py-1">Нет задач</p>
      )}
    </div>
  );
}

function DashboardSummarySection({ title, count, children, variant }: {
  title: string; count: number; children: React.ReactNode; variant?: "destructive" | "warning" | "success" | "unassigned";
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className={cn(
          "text-[11px] font-semibold",
          variant === "destructive" ? "text-destructive" :
          variant === "warning" ? "text-amber-500" :
          variant === "success" ? "text-emerald-600 dark:text-emerald-400" :
          variant === "unassigned" ? "text-orange-500" :
          "text-foreground"
        )}>{title}</span>
        <span className="text-[9px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">{count}</span>
      </div>
      {children}
    </div>
  );
}

function TaskSummaryRow({ task, userName, onOpenTask, subtaskMap, variant, drift, showUnassigned, hideProjectBadge }: {
  task: Task; userName: string; onOpenTask: (taskId: string) => void; subtaskMap: SubtaskMap; variant?: "overdue" | "done"; drift?: number; showUnassigned?: boolean; hideProjectBadge?: boolean;
}) {
  const { data: allGroups = [] } = useTaskGroups();
  const stepsInfo = subtaskMap.get(task.id);
  const now = new Date();
  const overdueDays = variant === "overdue" && task.deadline ? Math.max(0, differenceInDays(now, new Date(task.deadline))) : 0;

  const projectGroup = task.group_id ? allGroups.find(g => g.id === task.group_id) : null;
  const parentGroup = projectGroup?.parent_id ? allGroups.find(g => g.id === projectGroup.parent_id) : null;
  const projectLabel = projectGroup
    ? (parentGroup ? `${parentGroup.name} / ${projectGroup.name}` : projectGroup.name)
    : null;

  return (
    <button
      onClick={() => onOpenTask(task.id)}
      className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors text-left"
    >
      {!hideProjectBadge && projectGroup && (
        <span
          className="inline-flex items-center gap-1 shrink-0 max-w-[140px] px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-[9px] font-medium"
          title={projectLabel ?? undefined}
        >
          <ProjectIcon group={projectGroup} size="xs" />
          <span className="truncate text-muted-foreground">{projectLabel}</span>
        </span>
      )}
      {!hideProjectBadge && !projectGroup && (
        <span className="inline-flex items-center shrink-0 px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-[9px] font-medium text-muted-foreground" title="Без проекта (Входящие)">
          📥
        </span>
      )}
      <span className={cn(
        "text-[11px] truncate flex-1 min-w-0",
        variant === "overdue" ? "text-destructive" : variant === "done" ? "line-through text-muted-foreground" : "text-foreground"
      )}>
        {task.title}
      </span>

      {stepsInfo && stepsInfo.total > 0 && (
        <span className="text-[9px] text-muted-foreground shrink-0 inline-flex items-center gap-0.5">
          <CheckCircle className="h-2.5 w-2.5" />
          {stepsInfo.completed}/{stepsInfo.total}
        </span>
      )}

      {drift !== undefined && (
        <span className={cn(
          "text-[9px] font-mono font-semibold shrink-0 px-1 py-0.5 rounded border border-dashed",
          drift > 0 ? "text-amber-600 dark:text-amber-400 border-amber-500/40" : "text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
        )}>
          {drift > 0 ? `+${drift}д` : `${drift}д`}
        </span>
      )}

      {variant === "done" && task.completed_at && (
        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 shrink-0">
          ✓ {format(new Date(task.completed_at), "d MMM", { locale: ru })}
        </span>
      )}

      {task.deadline && variant !== "done" && (
        <span className={cn("text-[9px] shrink-0", variant === "overdue" ? "text-red-500" : "text-muted-foreground")}>
          {format(new Date(task.deadline), "d MMM", { locale: ru })}
          {overdueDays > 0 && ` (+${overdueDays}д)`}
        </span>
      )}

      {showUnassigned && !task.assigned_to && (
        <span className="text-[9px] text-orange-500 shrink-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-orange-500/10 border border-orange-500/20">
          <User className="h-2.5 w-2.5" />?
        </span>
      )}

      {userName && (
        <span className="text-[9px] text-muted-foreground shrink-0 max-w-[80px] truncate">{userName}</span>
      )}
    </button>
  );
}

// --- My Day Block ---
function MyDayBlock({ tasks, user, onOpenTask, users, subtaskMap }: {
  tasks: Task[]; user: any; onOpenTask: (taskId: string) => void; users: Profile[]; subtaskMap: SubtaskMap;
}) {
  const [range, setRange] = useState<"day" | "week">("day");
  const [collapsed, setCollapsed] = useState(false);
  const now = new Date();
  const endDate = range === "day" ? addDays(startOfDay(now), 1) : addDays(startOfDay(now), 7);

  const myTasks = useMemo(() => {
    if (!user) return [];
    return tasks.filter(t => {
      if (t.is_completed) return false;
      const isMine = t.assigned_to === user.id || (!t.assigned_to && t.user_id === user.id);
      if (!isMine) return false;
      if (!t.deadline) return range === "day";
      return new Date(t.deadline) <= endDate;
    }).sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
  }, [tasks, user, range, endDate]);

  const overdue = myTasks.filter(t => t.deadline && new Date(t.deadline) < now);
  const upcoming = myTasks.filter(t => !t.deadline || new Date(t.deadline) >= now);
  const userName = (uid: string | null) => uid ? users.find(u => u.id === uid)?.display_name || "—" : "—";

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-3 py-2 border-b border-border flex items-center gap-1.5 hover:bg-muted/30 transition-colors"
      >
        <CalendarClock className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-foreground">Мой день</span>
        {overdue.length > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">⚠ {overdue.length}</span>
        )}
        {upcoming.length > 0 && (
          <span className="text-[9px] text-muted-foreground">{upcoming.length} в работе</span>
        )}
        <span className="flex-1" />
        <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5" onClick={e => e.stopPropagation()}>
          {(["day", "week"] as const).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded transition-colors",
                range === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r === "day" ? "День" : "Неделя"}
            </button>
          ))}
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{myTasks.length}</span>
        {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </button>
      {!collapsed && (
        <div className="max-h-[300px] overflow-y-auto scrollbar-thin divide-y divide-border">
          {overdue.length > 0 && (
            <div className="px-2 pt-1.5 pb-1">
              <span className="text-[10px] font-semibold text-destructive px-1">Просрочено · {overdue.length}</span>
              <div className="mt-0.5 space-y-0.5">
                {overdue.map(t => (
                  <TaskSummaryRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} onOpenTask={onOpenTask} subtaskMap={subtaskMap} variant="overdue" />
                ))}
              </div>
            </div>
          )}
          {upcoming.length > 0 && (
            <div className="px-2 pt-1.5 pb-1">
              <span className="text-[10px] font-semibold text-foreground px-1">
                {range === "day" ? "Сегодня" : "На неделе"} · {upcoming.length}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {upcoming.map(t => (
                  <TaskSummaryRow key={t.id} task={t} userName={userName(t.assigned_to || t.user_id)} onOpenTask={onOpenTask} subtaskMap={subtaskMap} />
                ))}
              </div>
            </div>
          )}
          {myTasks.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {range === "day" ? "На сегодня задач нет 🎉" : "На эту неделю задач нет 🎉"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Delegations Block ---
function DelegationsBlock({ tasks, user, onOpenTask, users, subtaskMap }: {
  tasks: Task[]; user: any; onOpenTask: (taskId: string) => void; users: Profile[]; subtaskMap: SubtaskMap;
}) {
  const [mode, setMode] = useState<"to-me" | "from-me">("from-me");
  const [collapsed, setCollapsed] = useState(false);

  const delegatedTasks = useMemo(() => {
    if (!user) return [];
    if (mode === "to-me") {
      return tasks.filter(t => !t.is_completed && t.assigned_to === user.id && t.user_id !== user.id)
        .sort((a, b) => {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        });
    }
    return tasks.filter(t => !t.is_completed && t.user_id === user.id && t.assigned_to && t.assigned_to !== user.id)
      .sort((a, b) => {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
  }, [tasks, user, mode]);

  const now = new Date();
  const overdueCount = delegatedTasks.filter(t => t.deadline && new Date(t.deadline) < now).length;
  const userName = (uid: string | null) => uid ? users.find(u => u.id === uid)?.display_name || "—" : "—";

  // Group by person (assignee in "from-me", creator in "to-me")
  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>();
    delegatedTasks.forEach(t => {
      const pid = mode === "from-me" ? (t.assigned_to || "") : t.user_id;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(t);
    });
    return Array.from(map.entries())
      .map(([pid, tasks]) => ({
        personId: pid,
        name: userName(pid),
        tasks,
        overdue: tasks.filter(t => t.deadline && new Date(t.deadline) < now).length,
      }))
      .sort((a, b) => b.overdue - a.overdue || b.tasks.length - a.tasks.length);
  }, [delegatedTasks, mode, users, now]);

  const [expandedPersons, setExpandedPersons] = useState<Set<string>>(new Set());
  const togglePerson = (pid: string) => setExpandedPersons(prev => {
    const next = new Set(prev);
    next.has(pid) ? next.delete(pid) : next.add(pid);
    return next;
  });

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full px-3 py-2 border-b border-border flex items-center gap-1.5 hover:bg-muted/30 transition-colors"
      >
        <ArrowRightLeft className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-foreground">Поручения</span>
        {overdueCount > 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">⚠ {overdueCount}</span>
        )}
        <span className="flex-1" />
        <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5" onClick={e => e.stopPropagation()}>
          {(["to-me", "from-me"] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded transition-colors",
                mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "to-me" ? "Мне" : "От меня"}
            </button>
          ))}
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{delegatedTasks.length}</span>
        {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
      </button>
      {!collapsed && (
        <div className="max-h-[350px] overflow-y-auto scrollbar-thin">
          {grouped.length > 0 ? (
            <div className="divide-y divide-border">
              {grouped.map(g => {
                const isOpen = expandedPersons.has(g.personId);
                const avatarColors = getAvatarColors(g.name);
                return (
                  <div key={g.personId}>
                    <button
                      onClick={() => togglePerson(g.personId)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div
                        className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center text-[8px] font-medium shrink-0",
                          g.overdue > 0 && "ring-2 ring-destructive/40"
                        )}
                        style={avatarColors}
                        title={g.name}
                      >
                        {getInitials(g.name)}
                      </div>
                      <span className="text-[11px] font-medium text-foreground flex-1 truncate">{g.name}</span>
                      <span className="text-[9px] text-muted-foreground">{g.tasks.length} задач</span>
                      {g.overdue > 0 && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-destructive/10 text-destructive font-medium">{g.overdue} просроч.</span>
                      )}
                      {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                    </button>
                    {isOpen && (
                      <div className="px-2 pb-1.5 space-y-0.5">
                        {g.tasks.map(t => {
                          const isOverdue = t.deadline && new Date(t.deadline) < now;
                          return (
                            <button
                              key={t.id}
                              onClick={() => onOpenTask(t.id)}
                              className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors text-left ml-5"
                            >
                              <span className={cn("text-[11px] truncate flex-1", isOverdue && "text-destructive")}>
                                {t.title}
                              </span>
                              {(() => {
                                const stepsInfo = subtaskMap.get(t.id);
                                return stepsInfo && stepsInfo.total > 0 ? (
                                  <span className="text-[9px] text-muted-foreground shrink-0 inline-flex items-center gap-0.5">
                                    <CheckCircle className="h-2.5 w-2.5" />{stepsInfo.completed}/{stepsInfo.total}
                                  </span>
                                ) : null;
                              })()}
                              {t.deadline && (
                                <span className={cn("text-[9px] shrink-0", isOverdue ? "text-red-500" : "text-muted-foreground")}>
                                  {format(new Date(t.deadline), "d MMM", { locale: ru })}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              {mode === "to-me" ? "Нет поручений для вас" : "Вы не поручали задач"}
            </div>
          )}
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

// Глобальная секция «Из протоколов» — все linked-задачи (status_meta.linked_project_id),
// физически живущие в группах protocol, но привязанные к одному из НЕ-протокольных
// проектов, доступных пользователю. Кликабельны: открывают свой протокол.
function GlobalLinkedProtocolBlock({ tasks, groups }: { tasks: Task[]; groups: TaskGroup[] }) {
  const navigate = useNavigate();
  const protocolGroupById = useMemo(() => {
    const m = new Map<string, TaskGroup>();
    groups.forEach(g => { if ((g as any).project_type === "protocol") m.set(g.id, g); });
    return m;
  }, [groups]);
  const projectGroupById = useMemo(() => {
    const m = new Map<string, TaskGroup>();
    groups.forEach(g => { if ((g as any).project_type !== "protocol") m.set(g.id, g); });
    return m;
  }, [groups]);

  const linked = useMemo(() => {
    return tasks.filter(t => {
      const lp = (t as any).status_meta?.linked_project_id as string | undefined;
      if (!lp) return false;
      if (!projectGroupById.has(lp)) return false;
      return t.group_id ? protocolGroupById.has(t.group_id) : false;
    });
  }, [tasks, projectGroupById, protocolGroupById]);

  if (linked.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">Из протоколов</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{linked.length}</span>
      </div>
      <div className="space-y-px max-h-[260px] overflow-y-auto">
        {linked.slice(0, 20).map(t => {
          const proto = t.group_id ? protocolGroupById.get(t.group_id) : null;
          const lp = (t as any).status_meta?.linked_project_id as string | undefined;
          const proj = lp ? projectGroupById.get(lp) : null;
          const isOver = !t.is_completed && t.deadline && isPast(parseISO(t.deadline));
          return (
            <button
              key={t.id}
              onClick={() => proto && navigate(`/protocols/${proto.id}`)}
              className="w-full flex items-center gap-2 py-1 px-1.5 rounded hover:bg-secondary/50 transition-colors text-left"
              title={proto ? `Открыть протокол: ${proto.name}` : undefined}
            >
              <span className={cn("text-[12px] truncate flex-1", isOver ? "text-destructive" : t.is_completed ? "text-muted-foreground line-through" : "text-foreground")}>
                {t.title}
              </span>
              {proj && (
                <span className="text-[9px] text-muted-foreground bg-secondary/60 px-1 py-0.5 rounded truncate max-w-[100px] shrink-0">
                  → {proj.name}
                </span>
              )}
              {proto && (
                <span className="text-[9px] text-muted-foreground truncate max-w-[110px] shrink-0">{proto.name}</span>
              )}
              {t.deadline && (
                <span className={cn("text-[10px] tabular-nums shrink-0", isOver ? "text-destructive" : "text-muted-foreground")}>
                  {format(parseISO(t.deadline), "d MMM", { locale: ru })}
                </span>
              )}
            </button>
          );
        })}
        {linked.length > 20 && (
          <div className="text-[10px] text-muted-foreground pt-1 px-1.5">ещё +{linked.length - 20}</div>
        )}
      </div>
    </div>
  );
}

export default function DashboardView({ onNavigateToTask: onNavigateToTaskProp }: { onNavigateToTask?: (taskId: string) => void }) {
  const { user } = useAuth();
  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: groups = [], isLoading: groupsLoading } = useTaskGroups();
  const { data: users = [], isLoading: usersLoading } = useAvailableUsers();
  const { data: tags = [], isLoading: tagsLoading } = useVisibleTags();
  const [sheetTaskId, setSheetTaskId] = useState<string | null>(null);
  const { addTask } = useTaskMutations();
  const [expandedKpi, setExpandedKpi] = useState<"overdue" | "drift" | "unassigned" | "no_deadline" | null>(null);
  const [aiSummaryText, setAiSummaryText] = useState("");
  const containerRef = useRef<HTMLElement>(null);
  const [presentMode, setPresentMode] = useState<"off" | "browser" | "in-app">("off");

  // Sync with browser fullscreen state (Esc key etc.)
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement && presentMode === "browser") {
        setPresentMode("off");
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [presentMode]);

  // Esc to exit in-app mode
  useEffect(() => {
    if (presentMode !== "in-app") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPresentMode("off");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [presentMode]);

  const enterBrowserFullscreen = async () => {
    try {
      await containerRef.current?.requestFullscreen();
      setPresentMode("browser");
    } catch {
      // Fallback to in-app if denied
      setPresentMode("in-app");
    }
  };

  const enterInAppFullscreen = () => setPresentMode("in-app");

  const exitFullscreen = async () => {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch {}
    }
    setPresentMode("off");
  };

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
    const d7 = subDays(now, 7);
    const d14 = subDays(now, 14);
    const relevantTasks = projectStats.flatMap(s => [...s.tasks, ...s.subprojects.flatMap(sp => sp.tasks)]);
    const uniqueTasks = Array.from(new Map(relevantTasks.map(t => [t.id, t])).values());
    const activeTasks = uniqueTasks.filter(t => !t.is_completed);
    const totalCompleted = uniqueTasks.filter(t => t.is_completed).length;
    const completionRate = uniqueTasks.length > 0 ? Math.round((totalCompleted / uniqueTasks.length) * 100) : 0;
    const totalOverdue = activeTasks.filter(t => t.deadline && new Date(t.deadline) < now).length;
    const totalDrift = uniqueTasks.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline).length;
    const activeProjects = projectStats.filter(s => s.total > 0 && s.timingStatus !== "completed").length;
    const tasksThisWeek = activeTasks.filter(t => t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekFromNow).length;

    // Week-over-week: completed
    const completedThisWeek = uniqueTasks.filter(t => t.is_completed && t.completed_at && new Date(t.completed_at) >= d7).length;
    const completedLastWeek = uniqueTasks.filter(t => t.is_completed && t.completed_at && new Date(t.completed_at) >= d14 && new Date(t.completed_at) < d7).length;

    // Week-over-week: overdue delta (how many were overdue a week ago vs now)
    const overdueLastWeek = activeTasks.filter(t => t.deadline && new Date(t.deadline) < d7).length;

    // New smart metrics
    const unassignedTasks = activeTasks.filter(t => !t.assigned_to);
    const noDeadlineTasks = activeTasks.filter(t => !t.deadline);

    // WoW for drift (tasks that had drift a week ago - approximate by created_at)
    const driftLastWeek = uniqueTasks.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline && new Date(t.created_at) < d7).length;
    const currentDrift = uniqueTasks.filter(t => t.original_deadline && t.deadline && t.original_deadline !== t.deadline).length;

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
      completionRate, totalCompleted, totalOverdue, totalDrift: currentDrift, activeProjects, tasksThisWeek,
      totalProjects: projectStats.length,
      totalTasks: uniqueTasks.length,
      overdueTasks, driftTasks,
      completedThisWeek, completedLastWeek,
      overdueLastWeek,
      unassignedTasks,
      noDeadlineTasks,
      driftLastWeek,
    };
  }, [projectStats]);

  const handleNavigateToTask = (taskId: string) => {
    setSheetTaskId(taskId);
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
    <main
      ref={containerRef}
      className={cn(
        "flex-1 overflow-y-auto scrollbar-thin",
        presentMode !== "off" && "bg-background dashboard-present-mode",
        presentMode === "in-app" && "fixed inset-0 z-[100]"
      )}
    >
      <div className={cn(
        "mx-auto px-3 sm:px-4 py-3 sm:py-4 space-y-2.5",
        presentMode === "off" ? "max-w-5xl" : "max-w-7xl text-base"
      )}>

        {/* Header bar */}
        <div className="bg-card rounded-lg border border-border px-3 py-2 sm:py-2.5 flex items-center gap-2 sm:gap-2.5 flex-wrap">
          <BarChart3 className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-foreground">Дашборд</span>
          <Link
            to="/protocols"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] sm:text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            title="Протоколы совещаний"
          >
            <FileText className="h-3.5 w-3.5" />
            Протоколы
          </Link>
          <div className="flex-1" />

          {/* Filters — scroll on mobile */}
          <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto scrollbar-none flex-nowrap sm:flex-wrap">
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

          {/* Fullscreen split button */}
          {presentMode === "off" ? (
            <div className="inline-flex items-stretch rounded-md border border-border overflow-hidden shrink-0">
              <button
                onClick={enterBrowserFullscreen}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] sm:text-xs font-medium text-foreground hover:bg-muted transition-colors"
                title="Полноэкранный режим (как презентация)"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Весь экран</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="inline-flex items-center px-1 border-l border-border hover:bg-muted transition-colors"
                    title="Варианты"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={enterBrowserFullscreen}>
                    <Monitor className="h-4 w-4 mr-2" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Браузерный fullscreen</span>
                      <span className="text-[10px] text-muted-foreground">Скрывает панели браузера и ОС</span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={enterInAppFullscreen}>
                    <LayoutGrid className="h-4 w-4 mr-2" />
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Только скрыть панели</span>
                      <span className="text-[10px] text-muted-foreground">Без панелей JTD, браузер остаётся</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <button
              onClick={exitFullscreen}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border text-[11px] sm:text-xs font-medium text-foreground hover:bg-muted transition-colors shrink-0"
              title="Выйти (Esc)"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          )}

          <DashboardExportDialog
            projectStats={projectStats}
            summary={summary}
            users={users}
            aiSummary={aiSummaryText || undefined}
            subtaskMap={subtaskMap}
          />
        </div>

        {/* KPI row — horizontal scroll on mobile */}
        <div className="overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0">
          <div className="flex sm:grid sm:grid-cols-4 lg:grid-cols-7 gap-2 min-w-max sm:min-w-0">
          <KpiCard
            label="Прогресс"
            value={`${summary.completionRate}%`}
            color="hsl(var(--primary))"
            trend={`${summary.totalTasks} задач`}
            trendType="flat"
          />
          <KpiCard
            label="Выполнено"
            value={summary.totalCompleted}
            color="hsl(142, 71%, 45%)"
            trend={(() => {
              const diff = summary.completedThisWeek - summary.completedLastWeek;
              if (diff === 0) return `${summary.completedThisWeek}/нед`;
              return `${diff > 0 ? "+" : ""}${diff} к прошлой нед`;
            })()}
            trendType={summary.completedThisWeek > summary.completedLastWeek ? "up-good" : summary.completedThisWeek < summary.completedLastWeek ? "down-bad" : "flat"}
          />
          <KpiCard
            label="Просрочено"
            value={summary.totalOverdue}
            color="hsl(0, 72%, 58%)"
            active={expandedKpi === "overdue"}
            onClick={() => setExpandedKpi(prev => prev === "overdue" ? null : "overdue")}
            trend={(() => {
              const diff = summary.totalOverdue - summary.overdueLastWeek;
              if (diff === 0) return undefined;
              return `${diff > 0 ? "+" : ""}${diff} за нед`;
            })()}
            trendType={summary.totalOverdue > summary.overdueLastWeek ? "up-bad" : summary.totalOverdue < summary.overdueLastWeek ? "down-good" : "flat"}
          />
          <KpiCard
            label="Drift"
            value={summary.totalDrift}
            color="hsl(38, 92%, 50%)"
            active={expandedKpi === "drift"}
            onClick={() => setExpandedKpi(prev => prev === "drift" ? null : "drift")}
            trend={(() => {
              const diff = summary.totalDrift - summary.driftLastWeek;
              if (diff === 0) return undefined;
              return `${diff > 0 ? "+" : ""}${diff} за нед`;
            })()}
            trendType={summary.totalDrift > summary.driftLastWeek ? "up-bad" : summary.totalDrift < summary.driftLastWeek ? "down-good" : "flat"}
          />
          <KpiCard
            label="Без ответственного"
            value={summary.unassignedTasks.length}
            color={summary.unassignedTasks.length > 0 ? "hsl(25, 95%, 53%)" : "hsl(var(--muted-foreground))"}
            active={expandedKpi === "unassigned"}
            onClick={() => setExpandedKpi(prev => prev === "unassigned" ? null : "unassigned")}
            trend={summary.unassignedTasks.length > 0 ? `${Math.round(summary.unassignedTasks.length / Math.max(summary.totalTasks - summary.totalCompleted, 1) * 100)}% активных` : undefined}
            trendType={summary.unassignedTasks.length > 0 ? "up-bad" : "flat"}
          />
          <KpiCard
            label="Без сроков"
            value={summary.noDeadlineTasks.length}
            color={summary.noDeadlineTasks.length > 0 ? "hsl(280, 67%, 55%)" : "hsl(var(--muted-foreground))"}
            active={expandedKpi === "no_deadline"}
            onClick={() => setExpandedKpi(prev => prev === "no_deadline" ? null : "no_deadline")}
            trend={summary.noDeadlineTasks.length > 0 ? `${Math.round(summary.noDeadlineTasks.length / Math.max(summary.totalTasks - summary.totalCompleted, 1) * 100)}% активных` : undefined}
            trendType={summary.noDeadlineTasks.length > 0 ? "up-bad" : "flat"}
          />
          <KpiCard
            label="Активных проектов"
            value={summary.activeProjects}
            trend={`из ${summary.totalProjects} всего`}
            trendType="flat"
          />
          </div>
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
        {expandedKpi === "unassigned" && (
          <DetailPanel
            title="Задачи без ответственного"
            tasks={summary.unassignedTasks}
            onNavigateToTask={handleNavigateToTask}
            users={users}
            onClose={() => setExpandedKpi(null)}
          />
        )}
        {expandedKpi === "no_deadline" && (
          <DetailPanel
            title="Задачи без сроков"
            tasks={summary.noDeadlineTasks}
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

        {/* Two-column grid: My Day + Delegations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <MyDayBlock
            tasks={tasks}
            user={user}
            onOpenTask={(taskId) => setSheetTaskId(taskId)}
            users={users}
            subtaskMap={subtaskMap}
          />
          <DelegationsBlock
            tasks={tasks}
            user={user}
            onOpenTask={(taskId) => setSheetTaskId(taskId)}
            users={users}
            subtaskMap={subtaskMap}
          />
        </div>

        {/* Из протоколов (глобально) */}
        <GlobalLinkedProtocolBlock tasks={tasks} groups={groups} />

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
          onOpenTask={(taskId) => setSheetTaskId(taskId)}
          onNavigateToProject={(groupId) => {
            setSelectedProjectIds([groupId]);
            setSelectedAssigneeIds([]);
            setSelectedTagIds([]);
            setSelectedParticipantIds([]);
          }}
          subtaskMap={subtaskMap}
        />

        {/* Action bar */}
        <div className="bg-card rounded-lg border border-border px-3 py-2 sm:py-2.5 flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-[11px] sm:text-xs text-muted-foreground flex-1 hidden sm:block">Экспортировать отчёт для встречи или поделиться ссылкой на дашборд</span>
          <span className="text-[11px] text-muted-foreground flex-1 sm:hidden">Экспорт отчёта</span>
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

      {/* Task detail Sheet (like NPD/PMO) */}
      <Sheet open={!!sheetTaskId} onOpenChange={(open) => { if (!open) setSheetTaskId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 overflow-y-auto [&_.radix-popover-content]:z-[60]">
          {sheetTaskId && (() => {
            const task = tasks.find(t => t.id === sheetTaskId);
            if (!task) return null;
            return (
              <div className="p-4">
                <TaskItem task={task} initialOpen />
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </main>
  );
}

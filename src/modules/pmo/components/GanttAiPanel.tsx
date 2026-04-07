import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAiConversation, type AiMessage } from "@/hooks/useAiConversation";
import { fetchTaskTemplates, formatTemplatesForPrompt } from "@/lib/taskTemplates";
import ReactMarkdown from "react-markdown";
import {
  Sparkles, Send, Loader2, X, Trash2,
  Users, AlertTriangle, Zap, GitBranch, Calendar, BarChart3,
} from "lucide-react";
import type { Task, TaskGroup } from "@/hooks/useTasks";
import type { Milestone } from "@/hooks/useMilestones";

interface GanttAiPanelProps {
  open: boolean;
  onClose: () => void;
  tasks: Task[];
  groups: TaskGroup[];
  milestones: Milestone[];
  dependencies: any[];
  users: { id: string; display_name?: string | null; email?: string | null }[];
  selectedProjectId: string | null;
}

interface QuickAction {
  icon: React.ElementType;
  label: string;
  prompt: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: Users,
    label: "Загрузка команды",
    prompt: "Проанализируй загрузку команды: кто перегружен, у кого мало задач? Предложи перераспределение.",
    color: "text-blue-500",
  },
  {
    icon: AlertTriangle,
    label: "Риски и узкие места",
    prompt: "Найди узкие места: задачи без дедлайнов, без ответственных, просроченные, заблокированные зависимостями. Оцени критичность.",
    color: "text-amber-500",
  },
  {
    icon: GitBranch,
    label: "Критический путь",
    prompt: "Проанализируй зависимости между задачами и определи критический путь. Какие задачи нельзя сдвинуть без сдвига всего проекта?",
    color: "text-red-500",
  },
  {
    icon: Calendar,
    label: "Оптимизация сроков",
    prompt: "Проанализируй сроки задач и предложи оптимизацию: где можно параллелить, где нереалистичные дедлайны, какие задачи стоит перенести.",
    color: "text-green-500",
  },
  {
    icon: Zap,
    label: "Генерация задач",
    prompt: "На основе структуры проекта и имеющихся шаблонов задач, предложи недостающие задачи для завершения проекта.",
    color: "text-violet-500",
  },
  {
    icon: BarChart3,
    label: "Статус-отчёт",
    prompt: "Сформируй краткий статус-отчёт по проекту: прогресс, ключевые достижения, проблемы, рекомендации на неделю.",
    color: "text-cyan-500",
  },
];

export default function GanttAiPanel({
  open,
  onClose,
  tasks,
  groups,
  milestones,
  dependencies,
  users,
  selectedProjectId,
}: GanttAiPanelProps) {
  const { user } = useAuth();
  const {
    messages, addMessage, updateLastAssistant, clearConversation, loading: historyLoading,
  } = useAiConversation({ contextType: "assistant", contextId: `gantt_${selectedProjectId || "all"}` });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 200);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Build rich Gantt context for AI
  const buildGanttContext = useCallback(async () => {
    const projectIds = selectedProjectId
      ? [selectedProjectId, ...groups.filter(g => g.parent_id === selectedProjectId).map(g => g.id)]
      : groups.map(g => g.id);

    const relevantTasks = tasks.filter(t => t.group_id && projectIds.includes(t.group_id));
    const relevantMilestones = milestones.filter(m => projectIds.includes(m.group_id));
    const relevantDeps = dependencies.filter(d =>
      relevantTasks.some(t => t.id === d.predecessor_id || t.id === d.successor_id) ||
      relevantMilestones.some(m => m.id === d.predecessor_id || m.id === d.successor_id)
    );

    // Workload per user
    const workload: Record<string, { name: string; total: number; overdue: number; noDeadline: number; completed: number }> = {};
    for (const t of relevantTasks) {
      const uid = t.assigned_to || "unassigned";
      if (!workload[uid]) {
        const u = users.find(u => u.id === uid);
        workload[uid] = {
          name: uid === "unassigned" ? "Не назначено" : (u?.display_name || u?.email || "?"),
          total: 0, overdue: 0, noDeadline: 0, completed: 0,
        };
      }
      workload[uid].total++;
      if (t.is_completed) workload[uid].completed++;
      if (!t.deadline && !t.is_completed) workload[uid].noDeadline++;
      if (t.deadline && new Date(t.deadline) < new Date() && !t.is_completed) workload[uid].overdue++;
    }

    // Templates
    let taskTemplates: { title: string; subtasks: string[] }[] = [];
    if (selectedProjectId) {
      const childIds = groups.filter(g => g.parent_id === selectedProjectId).map(g => g.id);
      taskTemplates = await fetchTaskTemplates(selectedProjectId, [selectedProjectId, ...childIds], 5);
    }

    // Projects summary
    const projectSummaries = groups
      .filter(g => selectedProjectId ? (g.id === selectedProjectId || g.parent_id === selectedProjectId) : !g.parent_id)
      .map(g => {
        const gTasks = relevantTasks.filter(t => t.group_id === g.id);
        const completed = gTasks.filter(t => t.is_completed).length;
        const overdue = gTasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && !t.is_completed).length;
        return {
          name: g.name,
          id: g.id,
          parent: g.parent_id ? groups.find(p => p.id === g.parent_id)?.name : null,
          total: gTasks.length,
          completed,
          overdue,
        };
      });

    return {
      projects: projectSummaries,
      workload: Object.values(workload),
      milestones: relevantMilestones.map(m => ({
        name: m.name,
        date: m.planned_date,
        status: m.status,
        project: groups.find(g => g.id === m.group_id)?.name,
      })),
      dependencies: relevantDeps.map(d => ({
        type: d.dependency_type,
        lag: d.lag_days,
        from: d.predecessor_entity_type,
        to: d.successor_entity_type,
        fromId: d.predecessor_id,
        toId: d.successor_id,
      })),
      totalTasks: relevantTasks.length,
      completedTasks: relevantTasks.filter(t => t.is_completed).length,
      overdueTasks: relevantTasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && !t.is_completed).length,
      tasksWithoutDeadline: relevantTasks.filter(t => !t.deadline && !t.is_completed).length,
      tasksWithoutAssignee: relevantTasks.filter(t => !t.assigned_to && !t.is_completed).length,
      taskTemplates: taskTemplates.length > 0 ? formatTemplatesForPrompt(taskTemplates) : "",
      users: users.map(u => ({ id: u.id, name: u.display_name || u.email || "?" })),
    };
  }, [tasks, groups, milestones, dependencies, users, selectedProjectId]);

  const handleSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    addMessage({ role: "user", content: msg });
    setLoading(true);

    try {
      const ctx = await buildGanttContext();
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          message: msg,
          context: {
            ...ctx,
            module: "pmo",
            history: messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
          },
          action: "gantt_analyze",
        },
      });

      if (error) {
        const errBody = typeof error === "object" && error !== null ? error : {};
        const errMsg = (errBody as any)?.context?.body
          ? JSON.parse((errBody as any).context.body)
          : errBody;
        if ((errMsg as any)?.error === "rate_limited" || (error as any)?.status === 429) {
          addMessage({ role: "assistant", content: "⏳ Слишком много запросов. Попробуйте через минуту." });
          return;
        }
        if ((errMsg as any)?.error === "payment_required" || (error as any)?.status === 402) {
          addMessage({ role: "assistant", content: "⚠️ ИИ временно недоступен. Попробуйте позже." });
          return;
        }
        throw error;
      }

      if (data?.content) {
        addMessage({ role: "assistant", content: data.content });
      } else if (data?.action === "chat" && data?.content) {
        addMessage({ role: "assistant", content: data.content });
      } else {
        addMessage({ role: "assistant", content: "Не удалось получить ответ. Попробуйте ещё раз." });
      }
    } catch (e: any) {
      console.error("Gantt AI error:", e);
      addMessage({ role: "assistant", content: "❌ Ошибка. Попробуйте ещё раз." });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const selectedProject = selectedProjectId ? groups.find(g => g.id === selectedProjectId) : null;

  if (!open) return null;

  return (
    <div className="flex flex-col h-full w-80 border-r border-border bg-card shrink-0 animate-in slide-in-from-left-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-foreground truncate">Гантт-помощник</h3>
            <p className="text-[10px] text-muted-foreground truncate">
              {selectedProject ? selectedProject.name : "Все проекты"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && (
            <button
              onClick={() => clearConversation()}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Очистить чат"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && !historyLoading && (
          <div className="space-y-3 pt-2">
            <p className="text-[11px] text-muted-foreground text-center">
              Анализирую задачи, зависимости, загрузку команды и шаблоны проекта
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => handleSend(action.prompt)}
                    className="flex items-start gap-1.5 p-2 rounded-lg border border-border/50 hover:border-border hover:bg-muted/50 transition-all text-left group"
                  >
                    <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", action.color)} />
                    <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground leading-tight">
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[95%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted/70 text-foreground rounded-bl-sm"
              )}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-xs dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_strong]:font-semibold">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted/70 rounded-xl rounded-bl-sm px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                <span className="text-[10px] text-muted-foreground">Анализирую...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-border bg-card">
        <div className="relative flex items-end gap-1.5">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Спросите про загрузку, сроки, риски..."
            className="min-h-[36px] max-h-[80px] resize-none text-xs py-2 pr-9 rounded-lg border-border/50 focus:border-primary/50"
            rows={1}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="absolute right-1 bottom-1 h-6 w-6 rounded-md"
          >
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

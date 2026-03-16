import { useState, useRef, useEffect, useCallback } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, useTags, useAvailableUsers, useTaskMutations } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAiConversation } from "@/hooks/useAiConversation";
import {
  Sparkles, Send, Loader2, CheckCircle2, X, Zap, LayoutList,
  Briefcase, FlaskConical, Target, FileBarChart, Download,
} from "lucide-react";
import { addDays } from "date-fns";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface ParsedTask {
  title: string;
  description?: string;
  deadline?: string;
  priority?: number;
  project_id?: string;
  project_name?: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  tag_ids?: string[];
  is_important?: boolean;
  subtasks?: string[];
}

interface ProjectPlan {
  project_name: string;
  description?: string;
  project_type?: string;
  subprojects?: {
    name: string;
    tasks: {
      title: string;
      deadline_offset_days?: number;
      priority?: number;
      subtasks?: string[];
    }[];
  }[];
  tasks?: {
    title: string;
    deadline_offset_days?: number;
    priority?: number;
    subtasks?: string[];
  }[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  parsedTask?: ParsedTask;
  projectPlan?: ProjectPlan;
  created?: boolean;
}

export type ModuleContext = {
  module: "tasks" | "pmo" | "npd" | "crm";
  activeProjectId?: string | null;
  activeProjectName?: string | null;
};

interface AiAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleContext?: ModuleContext;
  onRequestImport?: () => void;
}

const MODULE_CONFIG: Record<string, {
  label: string;
  gradient: string;
  subtitle: string;
  quickActions: { icon: React.ElementType; label: string; prompt: string }[];
  examples: string[];
}> = {
  tasks: {
    label: "AI-помощник",
    gradient: "from-violet-500 to-blue-500",
    subtitle: "Постановка задач • Планирование",
    quickActions: [
      { icon: Zap, label: "Быстрая задача", prompt: "Создай задачу: " },
      { icon: LayoutList, label: "План проекта", prompt: "Спланируй проект: " },
    ],
    examples: [
      "Подготовить презентацию к пятнице для Иванова",
      "Спланируй проект запуска нового продукта на 2 месяца",
      "Позвонить клиенту завтра, приоритет высокий",
    ],
  },
  pmo: {
    label: "PMO-помощник",
    gradient: "from-blue-500 to-cyan-500",
    subtitle: "Проекты • Структура • Вехи",
    quickActions: [
      { icon: Briefcase, label: "Новый проект", prompt: "Создай проект с вехами: " },
      { icon: LayoutList, label: "Декомпозиция", prompt: "Разбей проект на подпроекты и задачи: " },
      { icon: FileBarChart, label: "Отчёт", prompt: "Сформируй отчёт по проекту " },
    ],
    examples: [
      "Создай проект «Внедрение CRM» с 3 этапами и вехами на 3 месяца",
      "Разбей задачу «Запуск рекламной кампании» на 10 подзадач с дедлайнами",
      "Спланируй проект миграции данных с зависимостями между задачами",
    ],
  },
  npd: {
    label: "NPD-помощник",
    gradient: "from-violet-500 to-fuchsia-500",
    subtitle: "Продукты • Гейты • Стримы",
    quickActions: [
      { icon: FlaskConical, label: "NPD-проект", prompt: "Создай NPD проект: " },
      { icon: Target, label: "Gate Review", prompt: "Проанализируй готовность к переходу на следующий гейт для проекта " },
      { icon: LayoutList, label: "Задачи стрима", prompt: "Создай задачи для стрима " },
    ],
    examples: [
      "Создай NPD проект «Новый энергетик» с задачами для каждого стрима",
      "Спланируй задачи для стрима RnD на Gate 2: Разработка",
      "Какие задачи нужны для прохождения Gate 1 в проекте продакт-стрима?",
    ],
  },
  crm: {
    label: "CRM-помощник",
    gradient: "from-cyan-500 to-violet-500",
    subtitle: "Клиенты • Воронка • Продажи",
    quickActions: [
      { icon: Target, label: "Новый клиент", prompt: "Добавь клиента и создай задачу: " },
      { icon: Download, label: "Импорт клиентов", prompt: "__import_crm__" },
      { icon: Zap, label: "Задача продаж", prompt: "Создай задачу продаж: " },
      { icon: FileBarChart, label: "Сценарий", prompt: "Спланируй сценарий работы с клиентом: " },
    ],
    examples: [
      "Добавь клиента «Рога и Копыта», контакт Иванов, назначь задачу отправить КП",
      "Спланируй воронку для нового клиента из фарм-отрасли на 2 месяца",
      "Создай задачу: позвонить Петрову по КП, приоритет высокий, дедлайн завтра",
    ],
  },
};

export default function AiAssistant({ open, onOpenChange, moduleContext, onRequestImport }: AiAssistantProps) {
  const { user } = useAuth();
  const { data: groups = [] } = useTaskGroups();
  const { data: tags = [] } = useTags();
  const { data: users = [] } = useAvailableUsers();
  const { addTask, addGroup } = useTaskMutations();

  const currentModule = moduleContext?.module || "tasks";
  const config = MODULE_CONFIG[currentModule];

  const {
    messages, addMessage, updateMessage, clearConversation, loading: historyLoading,
  } = useAiConversation({ contextType: "assistant", contextId: currentModule });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getContext = useCallback(() => ({
    projects: groups.filter(g => !g.parent_id).map(g => ({ id: g.id, name: g.name, project_type: (g as any).project_type })),
    users: users.map(u => ({ id: u.id, name: u.display_name || u.email || "?" })),
    tags: tags.map(t => ({ id: t.id, name: t.name })),
    module: currentModule,
    activeProjectId: moduleContext?.activeProjectId || null,
    activeProjectName: moduleContext?.activeProjectName || null,
  }), [groups, users, tags, currentModule, moduleContext]);

  const isCrmImport = (text: string): boolean => {
    if (currentModule !== "crm") return false;
    const lower = text.toLowerCase();
    const importKeywords = ["импорт", "загрузи клиент", "загрузить клиент", "импортируй", "загрузи список", "загрузи базу"];
    return importKeywords.some(k => lower.includes(k));
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    addMessage({ role: "user", content: text });
    setLoading(true);

    try {
      // Handle CRM import (UI action, not AI)
      if (isCrmImport(text)) {
        if (onRequestImport) {
          addMessage({ role: "assistant", content: "📥 Открываю диалог импорта клиентов..." });
          onOpenChange(false);
          setTimeout(() => onRequestImport(), 300);
        } else {
          addMessage({ role: "assistant", content: "Импорт недоступен в текущем контексте." });
        }
        return;
      }

      // Smart action: LLM decides intent
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          message: text,
          context: {
            ...getContext(),
            history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          },
          action: "smart",
        },
      });

      if (error) throw error;

      if (data.error === "rate_limited") {
        toast.error("Слишком много запросов, попробуйте позже");
        addMessage({ role: "assistant", content: "⏳ Слишком много запросов. Попробуйте через минуту." });
        return;
      }
      if (data.error === "payment_required") {
        toast.error("Необходимо пополнить баланс AI");
        addMessage({ role: "assistant", content: "💳 Необходимо пополнить баланс для использования AI." });
        return;
      }

      if (data.action === "create_task" && data.task) {
        const task = data.task as ParsedTask;
        let summary = `📋 **${task.title}**\n`;
        if (task.deadline) summary += `📅 Дедлайн: ${task.deadline}\n`;
        if (task.priority) summary += `🔥 Приоритет: ${task.priority === 1 ? "Высокий" : task.priority === 2 ? "Средний" : "Низкий"}\n`;
        if (task.project_name) summary += `📁 Проект: ${task.project_name}\n`;
        if (task.assigned_to_name) summary += `👤 Ответственный: ${task.assigned_to_name}\n`;
        if (task.subtasks?.length) summary += `📝 Подзадачи: ${task.subtasks.length} шт.\n`;
        summary += `\nНажмите ✅ чтобы создать задачу.`;

        addMessage({ role: "assistant", content: summary, parsedTask: task });
      } else if (data.action === "plan_project" && data.plan) {
        const plan = data.plan as ProjectPlan;
        let summary = `📊 **Проект: ${plan.project_name}**\n`;
        if (plan.description) summary += `${plan.description}\n`;
        summary += `\n`;
        if (plan.subprojects?.length) {
          plan.subprojects.forEach((sp) => {
            summary += `📂 **${sp.name}** (${sp.tasks.length} задач)\n`;
            sp.tasks.slice(0, 3).forEach(t => {
              summary += `  • ${t.title}`;
              if (t.deadline_offset_days) summary += ` (через ${t.deadline_offset_days} дн.)`;
              summary += `\n`;
            });
            if (sp.tasks.length > 3) summary += `  ...и ещё ${sp.tasks.length - 3}\n`;
          });
        }
        if (plan.tasks?.length) {
          summary += `📋 Задачи проекта: ${plan.tasks.length}\n`;
        }
        const totalTasks = (plan.subprojects || []).reduce((s, sp) => s + sp.tasks.length, 0) + (plan.tasks || []).length;
        summary += `\nВсего: ${plan.subprojects?.length || 0} подпроектов, ${totalTasks} задач.\nНажмите ✅ чтобы создать проект.`;

        addMessage({ role: "assistant", content: summary, projectPlan: plan });
      } else if (data.action === "chat" && data.content) {
        addMessage({ role: "assistant", content: data.content });
      } else {
        addMessage({ role: "assistant", content: "Не удалось разобрать запрос. Попробуйте переформулировать." });
      }
    } catch (e: any) {
      console.error("AI assistant error:", e);
      addMessage({ role: "assistant", content: "❌ Ошибка. Попробуйте ещё раз." });
    } finally {
      setLoading(false);
    }
  };

  const resolveAssignee = (task: ParsedTask): string | null => {
    if (task.assigned_to_id) {
      const exact = users.find(u => u.id === task.assigned_to_id);
      if (exact) return exact.id;
    }
    if (task.assigned_to_name) {
      const name = task.assigned_to_name.toLowerCase();
      const match = users.find(u => {
        const dn = (u.display_name || "").toLowerCase();
        const em = (u.email || "").toLowerCase();
        return dn.includes(name) || name.includes(dn) || em.startsWith(name);
      });
      if (match) return match.id;
    }
    return null;
  };

  const handleCreateTask = async (task: ParsedTask, msgIndex: number) => {
    if (!user) return;
    try {
      const assignee = resolveAssignee(task);
      const groupId = task.project_id || moduleContext?.activeProjectId || null;
      await addTask.mutateAsync({
        title: task.title,
        deadline: task.deadline ? new Date(task.deadline + "T23:59:59").toISOString() : null,
        group_id: groupId,
        assigned_to: assignee,
        task_type: "standard",
      });
      
      updateMessage(msgIndex, { created: true });
      toast.success(`Задача "${task.title}" создана!`);
    } catch (e: any) {
      toast.error("Ошибка создания: " + e.message);
    }
  };

  const handleCreateProject = async (plan: ProjectPlan, msgIndex: number) => {
    if (!user) return;
    try {
      const projectType = plan.project_type || (currentModule === "npd" ? "npd" : currentModule === "crm" ? "crm" : "standard");
      
      await addGroup.mutateAsync({ name: plan.project_name });

      await new Promise(r => setTimeout(r, 500));
      
      const { data: createdGroups } = await supabase
        .from("task_groups")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", plan.project_name)
        .order("created_at", { ascending: false })
        .limit(1);
      
      const projectId = createdGroups?.[0]?.id;
      if (!projectId) throw new Error("Не удалось найти созданный проект");

      if (projectType !== "standard") {
        await supabase.from("task_groups").update({ project_type: projectType } as any).eq("id", projectId);
      }

      for (const sp of plan.subprojects || []) {
        await addGroup.mutateAsync({ name: sp.name, parent_id: projectId });
        
        await new Promise(r => setTimeout(r, 300));
        const { data: subGroups } = await supabase
          .from("task_groups")
          .select("id")
          .eq("user_id", user.id)
          .eq("name", sp.name)
          .eq("parent_id", projectId)
          .order("created_at", { ascending: false })
          .limit(1);
        
        const subId = subGroups?.[0]?.id;
        if (!subId) continue;

        for (const t of sp.tasks) {
          await addTask.mutateAsync({
            title: t.title,
            group_id: subId,
            deadline: t.deadline_offset_days
              ? addDays(new Date(), t.deadline_offset_days).toISOString()
              : null,
            task_type: "standard",
          });
        }
      }

      for (const t of plan.tasks || []) {
        await addTask.mutateAsync({
          title: t.title,
          group_id: projectId,
          deadline: t.deadline_offset_days
            ? addDays(new Date(), t.deadline_offset_days).toISOString()
            : null,
          task_type: "standard",
        });
      }

      updateMessage(msgIndex, { created: true });
      const totalTasks = (plan.subprojects || []).reduce((s, sp) => s + sp.tasks.length, 0) + (plan.tasks || []).length;
      toast.success(`Проект "${plan.project_name}" создан! (${totalTasks} задач)`);
    } catch (e: any) {
      toast.error("Ошибка создания проекта: " + e.message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[92vw] sm:w-[440px] md:w-[500px] max-w-[500px] p-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className={cn("h-8 w-8 rounded-lg bg-gradient-to-br flex items-center justify-center", config.gradient)}>
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{config.label}</h3>
            <p className="text-[10px] text-muted-foreground">{config.subtitle}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-8">
              <div className={cn("h-14 w-14 rounded-2xl bg-gradient-to-br flex items-center justify-center opacity-20", config.gradient)}>
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Чем могу помочь?</p>
                <p className="text-xs text-muted-foreground mt-1">Опишите задачу или проект в свободной форме</p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {config.quickActions.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => {
                      if (qa.prompt === "__import_crm__" && onRequestImport) {
                        onOpenChange(false);
                        setTimeout(() => onRequestImport(), 300);
                        return;
                      }
                      setInput(qa.prompt);
                      inputRef.current?.focus();
                    }}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border hover:bg-muted transition-colors text-left"
                  >
                    <qa.icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xs text-foreground">{qa.label}</span>
                  </button>
                ))}
                <div className="mt-2 space-y-1.5">
                  <p className="text-[10px] text-muted-foreground font-medium">Примеры:</p>
                  {config.examples.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => { setInput(ex); inputRef.current?.focus(); }}
                      className="block w-full text-left text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/50 transition-colors"
                    >
                      „{ex}"
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_code]:text-[10px] [&_pre]:text-[10px]">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-xs leading-relaxed">
                    {msg.content}
                  </div>
                )}

                {msg.parsedTask && !msg.created && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleCreateTask(msg.parsedTask!, i)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Создать задачу
                    </Button>
                  </div>
                )}

                {msg.projectPlan && !msg.created && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => handleCreateProject(msg.projectPlan!, i)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Создать проект
                    </Button>
                  </div>
                )}

                {msg.created && (
                  <div className="mt-2 flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-medium">Создано!</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-xl px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border px-3 py-3">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Напишите задачу или опишите проект..."
              className="flex-1 text-sm h-9"
              disabled={loading}
            />
            <Button
              type="submit"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={!input.trim() || loading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

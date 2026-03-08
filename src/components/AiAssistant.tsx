import { useState, useRef, useEffect, useCallback } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, useTags, useAvailableUsers, useTaskMutations } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Sparkles, Send, Loader2, CheckCircle2, Plus, CalendarDays,
  User, FolderOpen, Tag, AlertCircle, Zap, LayoutList, X,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { toast } from "sonner";

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

interface AiAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AiAssistant({ open, onOpenChange }: AiAssistantProps) {
  const { user } = useAuth();
  const { data: groups = [] } = useTaskGroups();
  const { data: tags = [] } = useTags();
  const { data: users = [] } = useAvailableUsers();
  const { addTask, addGroup } = useTaskMutations();

  const [messages, setMessages] = useState<Message[]>([]);
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
    projects: groups.filter(g => !g.parent_id).map(g => ({ id: g.id, name: g.name })),
    users: users.map(u => ({ id: u.id, name: u.display_name || u.email || "?" })),
    tags: tags.map(t => ({ id: t.id, name: t.name })),
  }), [groups, users, tags]);

  const detectAction = (text: string): "parse_task" | "plan_project" | "chat" => {
    const lower = text.toLowerCase();
    const planKeywords = ["спланируй", "план проекта", "создай проект", "структура проекта", "запланируй проект", "проект на", "план запуска"];
    if (planKeywords.some(k => lower.includes(k))) return "plan_project";
    
    const taskKeywords = ["задач", "сделать", "подготовить", "отправить", "написать", "позвонить", "связаться", "купить", "проверить", "обновить", "назначить", "запланировать", "организовать", "создать задач"];
    if (taskKeywords.some(k => lower.includes(k))) return "parse_task";
    
    return "chat";
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const action = detectAction(text);

      if (action === "parse_task" || action === "plan_project") {
        const { data, error } = await supabase.functions.invoke("ai-assistant", {
          body: { message: text, context: getContext(), action },
        });

        if (error) throw error;

        if (data.error === "rate_limited") {
          toast.error("Слишком много запросов, попробуйте позже");
          setMessages(prev => [...prev, { role: "assistant", content: "⏳ Слишком много запросов. Попробуйте через минуту." }]);
          return;
        }
        if (data.error === "payment_required") {
          toast.error("Необходимо пополнить баланс AI");
          setMessages(prev => [...prev, { role: "assistant", content: "💳 Необходимо пополнить баланс для использования AI." }]);
          return;
        }

        if (action === "parse_task" && data.task) {
          const task = data.task as ParsedTask;
          let summary = `📋 **${task.title}**\n`;
          if (task.deadline) summary += `📅 Дедлайн: ${task.deadline}\n`;
          if (task.priority) summary += `🔥 Приоритет: ${task.priority === 1 ? "Высокий" : task.priority === 2 ? "Средний" : "Низкий"}\n`;
          if (task.project_name) summary += `📁 Проект: ${task.project_name}\n`;
          if (task.assigned_to_name) summary += `👤 Ответственный: ${task.assigned_to_name}\n`;
          if (task.subtasks?.length) summary += `📝 Подзадачи: ${task.subtasks.length} шт.\n`;
          summary += `\nНажмите ✅ чтобы создать задачу.`;

          setMessages(prev => [...prev, { role: "assistant", content: summary, parsedTask: task }]);
        } else if (action === "plan_project" && data.plan) {
          const plan = data.plan as ProjectPlan;
          let summary = `📊 **Проект: ${plan.project_name}**\n`;
          if (plan.description) summary += `${plan.description}\n`;
          summary += `\n`;
          if (plan.subprojects?.length) {
            plan.subprojects.forEach((sp, i) => {
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

          setMessages(prev => [...prev, { role: "assistant", content: summary, projectPlan: plan }]);
        } else {
          setMessages(prev => [...prev, { role: "assistant", content: "Не удалось разобрать запрос. Попробуйте переформулировать." }]);
        }
      } else {
        // Streaming chat
        const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            message: text,
            context: { ...getContext(), history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })) },
            action: "chat",
          }),
        });

        if (!resp.ok || !resp.body) throw new Error("Stream failed");

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let textBuffer = "";
        let assistantSoFar = "";

        const upsertAssistant = (chunk: string) => {
          assistantSoFar += chunk;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && !last.parsedTask && !last.projectPlan) {
              return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
            }
            return [...prev, { role: "assistant", content: assistantSoFar }];
          });
        };

        let streamDone = false;
        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;
          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") { streamDone = true; break; }
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content as string | undefined;
              if (content) upsertAssistant(content);
            } catch {
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }
      }
    } catch (e: any) {
      console.error("AI assistant error:", e);
      setMessages(prev => [...prev, { role: "assistant", content: "❌ Ошибка. Попробуйте ещё раз." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTask = async (task: ParsedTask, msgIndex: number) => {
    if (!user) return;
    try {
      await createTask.mutateAsync({
        title: task.title,
        description: task.description || null,
        deadline: task.deadline ? new Date(task.deadline).toISOString() : null,
        priority: task.priority || null,
        group_id: task.project_id || null,
        assigned_to: task.assigned_to_id || null,
        is_important: task.is_important || false,
        user_id: user.id,
        position: 0,
        is_completed: false,
        task_type: "standard",
      });
      
      setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, created: true } : m));
      toast.success(`Задача "${task.title}" создана!`);
    } catch (e: any) {
      toast.error("Ошибка создания: " + e.message);
    }
  };

  const handleCreateProject = async (plan: ProjectPlan, msgIndex: number) => {
    if (!user) return;
    try {
      // Create main project
      const project = await createGroup.mutateAsync({
        name: plan.project_name,
        description: plan.description || null,
        user_id: user.id,
        position: 0,
      });

      // Create subprojects and their tasks
      for (const sp of plan.subprojects || []) {
        const sub = await createGroup.mutateAsync({
          name: sp.name,
          user_id: user.id,
          parent_id: project.id,
          position: 0,
        });

        for (let i = 0; i < sp.tasks.length; i++) {
          const t = sp.tasks[i];
          await createTask.mutateAsync({
            title: t.title,
            group_id: sub.id,
            user_id: user.id,
            position: i,
            is_completed: false,
            priority: t.priority || null,
            deadline: t.deadline_offset_days
              ? addDays(new Date(), t.deadline_offset_days).toISOString()
              : null,
            task_type: "standard",
            is_important: false,
          });
        }
      }

      // Create root-level tasks
      for (let i = 0; i < (plan.tasks || []).length; i++) {
        const t = plan.tasks![i];
        await createTask.mutateAsync({
          title: t.title,
          group_id: project.id,
          user_id: user.id,
          position: i,
          is_completed: false,
          priority: t.priority || null,
          deadline: t.deadline_offset_days
            ? addDays(new Date(), t.deadline_offset_days).toISOString()
            : null,
          task_type: "standard",
          is_important: false,
        });
      }

      setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, created: true } : m));
      const totalTasks = (plan.subprojects || []).reduce((s, sp) => s + sp.tasks.length, 0) + (plan.tasks || []).length;
      toast.success(`Проект "${plan.project_name}" создан! (${totalTasks} задач)`);
    } catch (e: any) {
      toast.error("Ошибка создания проекта: " + e.message);
    }
  };

  const quickActions = [
    { icon: Zap, label: "Быстрая задача", prompt: "Создай задачу: " },
    { icon: LayoutList, label: "План проекта", prompt: "Спланируй проект: " },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[92vw] sm:w-[440px] md:w-[500px] max-w-[500px] p-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">AI-помощник</h3>
            <p className="text-[10px] text-muted-foreground">Постановка задач • Планирование</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-8">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Чем могу помочь?</p>
                <p className="text-xs text-muted-foreground mt-1">Напишите задачу в свободной форме или опишите проект</p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {quickActions.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => {
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
                  {[
                    "Подготовить презентацию к пятнице для Иванова",
                    "Спланируй проект запуска нового продукта на 2 месяца",
                    "Позвонить клиенту завтра, приоритет высокий",
                  ].map((ex) => (
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
                <div className="whitespace-pre-wrap text-xs leading-relaxed">
                  {msg.content.split("**").map((part, j) =>
                    j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                  )}
                </div>

                {/* Action buttons for parsed task */}
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

                {/* Action buttons for project plan */}
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

                {/* Success indicator */}
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

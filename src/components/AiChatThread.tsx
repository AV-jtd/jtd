import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTaskGroups, useAvailableUsers, useTasks } from "@/hooks/useTasks";
import { useGroupMessages } from "@/hooks/useGroupChat";
import { useAiConversation } from "@/hooks/useAiConversation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Sparkles, Send, Loader2, Bot, User, AlertCircle,
  FolderOpen, CheckSquare, BarChart3, HelpCircle, Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { streamChat, StreamChatError } from "@/lib/streamChat";

interface AiChatThreadProps {
  /** Fixed project context — locks to this project */
  groupId?: string | null;
  groupName?: string;
  /** "assistant" = general cross-project, "project_chat" = project-specific */
  mode?: "assistant" | "project_chat";
}

const PROJECT_PROMPTS = [
  { icon: BarChart3, label: "Статус проекта", prompt: "Какой текущий статус проекта? Покажи прогресс, просроченные задачи и ближайшие дедлайны." },
  { icon: AlertCircle, label: "Риски", prompt: "Проанализируй риски проекта. Какие задачи просрочены или могут быть заблокированы?" },
  { icon: CheckSquare, label: "Саммари", prompt: "Сделай краткое саммари проекта: что сделано, что в работе, что предстоит." },
  { icon: HelpCircle, label: "Рекомендации", prompt: "Дай рекомендации по улучшению управления этим проектом." },
];

const GENERAL_PROMPTS = [
  { icon: BarChart3, label: "Обзор проектов", prompt: "Дай обзор всех моих проектов: прогресс, просроченные задачи, ближайшие дедлайны." },
  { icon: AlertCircle, label: "Просроченные", prompt: "Покажи все просроченные задачи по всем проектам." },
  { icon: CheckSquare, label: "Приоритеты", prompt: "Какие задачи самые важные сейчас? На чём стоит сфокусироваться?" },
  { icon: HelpCircle, label: "Рекомендации", prompt: "Дай рекомендации по улучшению продуктивности и управления проектами." },
];

export default function AiChatThread({ groupId, groupName, mode = "project_chat" }: AiChatThreadProps) {
  const isGeneral = mode === "assistant";
  const QUICK_PROMPTS = isGeneral ? GENERAL_PROMPTS : PROJECT_PROMPTS;
  const { user } = useAuth();
  const { data: allGroups = [] } = useTaskGroups();
  const { data: allUsers = [] } = useAvailableUsers();
  const { data: allTasks = [] } = useTasks();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(groupId || null);
  const { data: groupMessages = [] } = useGroupMessages(selectedGroupId || "");

  const {
    messages: chatMessages, addMessage, updateLastAssistant, clearConversation,
    loading: historyLoading,
  } = useAiConversation({ contextType: "project_chat", contextId: selectedGroupId });

  const [isStreaming, setIsStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const selectedGroup = allGroups.find(g => g.id === selectedGroupId);

  const buildContext = useCallback(() => {
    if (!selectedGroupId) return null;

    const group = allGroups.find(g => g.id === selectedGroupId);
    if (!group) return null;

    const subprojectIds = allGroups.filter(g => g.parent_id === selectedGroupId).map(g => g.id);
    const subprojects = allGroups
      .filter(g => g.parent_id === selectedGroupId)
      .map(sp => {
        const spTasks = allTasks.filter(t => t.group_id === sp.id);
        return {
          name: sp.name,
          taskCount: spTasks.length,
          completedCount: spTasks.filter(t => t.is_completed).length,
        };
      });

    const allProjectTasks = allTasks
      .filter(t => t.group_id === selectedGroupId || (t.group_id && subprojectIds.includes(t.group_id)))
      .map(t => ({
        title: t.title,
        is_completed: t.is_completed,
        deadline: t.deadline,
        priority: t.priority,
        assigned_to_name: t.assigned_to ? allUsers.find(u => u.id === t.assigned_to)?.display_name : null,
        subtasks: t.subtasks?.map(s => ({ title: s.title, is_completed: s.is_completed })),
      }));

    const recentMsgs = groupMessages.slice(-10).map((m: any) => ({
      author: m.profile?.display_name || "Аноним",
      content: m.content,
    }));

    return {
      project: {
        name: group.name,
        description: (group as any).description,
        project_type: (group as any).project_type,
      },
      subprojects,
      tasks: allProjectTasks,
      participants: allUsers.filter(u =>
        allTasks.some(t => (t.group_id === selectedGroupId || subprojectIds.includes(t.group_id || "")) && (t.user_id === u.id || t.assigned_to === u.id))
      ).map(u => ({ name: u.display_name || "Без имени" })),
      recentMessages: recentMsgs,
    };
  }, [selectedGroupId, allGroups, allTasks, allUsers, groupMessages]);

  const handleSend = useCallback(async (text?: string) => {
    const input = (text || draft).trim();
    if (!input || isStreaming) return;

    addMessage({ role: "user", content: input });
    setDraft("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let assistantContent = "";

    const upsertAssistant = (chunk: string) => {
      assistantContent += chunk;
      updateLastAssistant(assistantContent);
    };

    try {
      const projectContext = buildContext();

      await streamChat({
        url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        body: {
          message: input,
          action: "context_chat",
          context: {
            projectContext,
            history: chatMessages.map(m => ({ role: m.role, content: m.content })),
          },
        },
        onDelta: upsertAssistant,
        onDone: () => {},
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e.name === "AbortError") return;
      console.error("AI chat error:", e);

      if (e instanceof StreamChatError) {
        if (e.status === 429) {
          addMessage({ role: "assistant", content: "⚠️ Слишком много запросов. Попробуйте через минуту." });
          return;
        }
        if (e.status === 402) {
          addMessage({ role: "assistant", content: "⚠️ Недостаточно кредитов AI. Пополните баланс." });
          return;
        }
      }

      if (!assistantContent) {
        addMessage({ role: "assistant", content: "❌ Произошла ошибка. Попробуйте ещё раз." });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [draft, isStreaming, chatMessages, buildContext, addMessage, updateLastAssistant]);

  const topLevelGroups = allGroups.filter(g => !g.parent_id);

  return (
    <div className="flex flex-col h-full">
      {/* Project selector */}
      {!groupId && (
        <div className="px-4 py-2 border-b border-border shrink-0 flex gap-2">
          <select
            value={selectedGroupId || ""}
            onChange={e => { setSelectedGroupId(e.target.value || null); }}
            className="flex-1 text-sm bg-muted/50 border border-border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Выберите проект для контекста...</option>
            {topLevelGroups.map(g => (
              <option key={g.id} value={g.id}>
                {(g as any).icon && (g as any).icon !== "list" ? `${(g as any).icon} ` : ""}{g.name}
              </option>
            ))}
          </select>
          {chatMessages.length > 0 && (
            <button
              onClick={clearConversation}
              className="p-1.5 rounded-lg border border-border hover:bg-destructive/10 transition-colors shrink-0"
              title="Очистить чат"
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">ИИ-ассистент проекта</p>
              <p className="text-xs text-muted-foreground max-w-[250px]">
                {selectedGroupId
                  ? `Анализирую проект «${selectedGroup?.name || ""}». Задайте вопрос!`
                  : "Выберите проект выше, чтобы я мог анализировать его данные"
                }
              </p>
            </div>
            {selectedGroupId && (
              <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
                {QUICK_PROMPTS.map((qp, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(qp.prompt)}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
                  >
                    <qp.icon className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="text-foreground/80">{qp.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {chatMessages.map((msg, i) => (
              <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                {msg.role === "assistant" && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted/60 text-foreground rounded-bl-md"
                )}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_code]:text-xs [&_pre]:text-xs">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
                    <User className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isStreaming && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="bg-muted/60 rounded-2xl rounded-bl-md px-3.5 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <form
        onSubmit={e => { e.preventDefault(); handleSend(); }}
        className="flex items-center gap-2 px-4 py-3 border-t border-border shrink-0"
      >
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={selectedGroupId ? "Спросите о проекте..." : "Выберите проект..."}
          disabled={!selectedGroupId || isStreaming}
          className="flex-1 text-sm"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isStreaming || !selectedGroupId}
          className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 transition-all"
        >
          {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}

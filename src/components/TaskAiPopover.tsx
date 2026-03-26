import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sparkles, Send, Loader2, Trash2, UserCheck, CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { streamChat, StreamChatError } from "@/lib/streamChat";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { ru } from "date-fns/locale";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface TaskAiPopoverProps {
  taskTitle: string;
  taskDescription?: string | null;
  subtasks?: string[];
  deadline?: string | null;
  assignedToName?: string | null;
  participantNames?: string[];
  groupMemberNames?: string[];
  children: React.ReactNode;
  onAssign?: (userId: string) => void;
  onSetDeadline?: (date: string) => void;
  /** Map of display_name -> user_id for applying suggestions */
  memberMap?: Record<string, string>;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;

/** Generate context-aware quick suggestions based on full task content */
function getSmartSuggestions(props: {
  taskTitle: string;
  taskDescription?: string | null;
  deadline?: string | null;
  assignedToName?: string | null;
  subtasks?: string[];
  participantNames?: string[];
}): string[] {
  const { taskTitle, taskDescription, deadline, assignedToName, subtasks = [], participantNames = [] } = props;
  const suggestions: string[] = [];
  const text = `${taskTitle} ${taskDescription || ""}`.toLowerCase();

  // No assignee → suggest
  if (!assignedToName && participantNames.length > 0) {
    suggestions.push("Кому лучше назначить?");
  }

  // No deadline → suggest
  if (!deadline) {
    suggestions.push("Какой срок поставить?");
  }

  // No subtasks → suggest decomposition
  if (subtasks.length === 0) {
    suggestions.push("Разбей на шаги");
  } else if (subtasks.length > 3) {
    suggestions.push("С чего начать?");
  }

  // Content-aware suggestions based on task text
  if (text.match(/отч[её]т|report|аналитик/)) {
    suggestions.push("Какие данные нужны?");
  } else if (text.match(/продаж|дистрибуц|каналы сбыт|сбыт/)) {
    suggestions.push("Ключевые метрики продаж?");
  } else if (text.match(/изуч|анализ|исследов|аудит|мониторинг/)) {
    suggestions.push("Методология анализа?");
  } else if (text.match(/встреч|совещ|meeting|созвон/)) {
    suggestions.push("Повестка встречи?");
  } else if (text.match(/презент|presentation|слайд/)) {
    suggestions.push("Структура презентации?");
  } else if (text.match(/дизайн|макет|прототип|ui|ux/)) {
    suggestions.push("Чек-лист для дизайна?");
  } else if (text.match(/тест|qa|проверк|баг/)) {
    suggestions.push("Критерии приёмки?");
  } else if (text.match(/запуск|релиз|launch|деплой/)) {
    suggestions.push("Чек-лист запуска?");
  } else if (text.match(/договор|контракт|соглаш|юрид/)) {
    suggestions.push("Ключевые пункты?");
  } else if (text.match(/бюджет|смет|расход|закупк/)) {
    suggestions.push("Как оценить бюджет?");
  } else if (text.match(/обучен|тренинг|онбординг/)) {
    suggestions.push("План обучения?");
  } else if (text.match(/конкурент|бенчмарк|рынок|рыноч/)) {
    suggestions.push("Что сравнивать?");
  } else if (text.match(/производ[ис]|поставщик|сырь|рецепт/)) {
    suggestions.push("Критерии оценки?");
  } else if (text.match(/клиент|заказчик|партн[её]р|контрагент/)) {
    suggestions.push("Что уточнить у клиента?");
  }

  // No description → suggest clarification
  if (!taskDescription && suggestions.length < 3) {
    suggestions.push("Опиши задачу подробнее");
  }

  // Fill remaining with defaults
  const defaults = ["Как лучше выполнить?", "Оцени сложность", "Риски?"];
  for (const d of defaults) {
    if (suggestions.length >= 3) break;
    if (!suggestions.includes(d)) suggestions.push(d);
  }

  return suggestions.slice(0, 3);
}

export default function TaskAiPopover({
  taskTitle, taskDescription, subtasks = [], deadline, assignedToName,
  participantNames = [], groupMemberNames = [], children,
  onAssign, onSetDeadline, memberMap = {},
}: TaskAiPopoverProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const smartSuggestions = useMemo(() => getSmartSuggestions({
    taskTitle, taskDescription, deadline, assignedToName, subtasks, participantNames,
  }), [taskTitle, taskDescription, deadline, assignedToName, subtasks, participantNames]);

  const systemContext = useMemo(() => {
    const parts = [
      `Контекст задачи:`,
      `Название: ${taskTitle}`,
      taskDescription ? `Описание: ${taskDescription}` : null,
      subtasks.length > 0 ? `Шаги: ${subtasks.join(", ")}` : null,
      deadline ? `Дедлайн: ${deadline}` : `Дедлайн: не установлен`,
      assignedToName ? `Ответственный: ${assignedToName}` : `Ответственный: не назначен`,
      participantNames.length > 0 ? `Участники: ${participantNames.join(", ")}` : null,
      groupMemberNames.length > 0 ? `Доступные члены команды: ${groupMemberNames.join(", ")}` : null,
      ``,
      `Ты — краткий помощник по этой задаче. Отвечай по делу, коротко, на русском.`,
      `Если спрашивают кому назначить — предложи конкретного человека из участников/членов команды и объясни почему.`,
      `Если спрашивают про срок — предложи конкретную дату и объясни почему.`,
    ];
    return parts.filter(Boolean).join("\n");
  }, [taskTitle, taskDescription, subtasks, deadline, assignedToName, participantNames, groupMemberNames]);

  // Parse actionable items from AI response
  const parseActions = useCallback((content: string) => {
    const actions: { type: "assign" | "deadline"; label: string; value: string }[] = [];

    // Try to find suggested person from memberMap
    if (onAssign && Object.keys(memberMap).length > 0) {
      for (const [name, userId] of Object.entries(memberMap)) {
        if (content.toLowerCase().includes(name.toLowerCase())) {
          actions.push({ type: "assign", label: name, value: userId });
          break;
        }
      }
    }

    // Try to find suggested deadline patterns like "3 дня", "неделю", specific dates
    if (onSetDeadline && !deadline) {
      const dayPatterns = [
        { regex: /(\d+)\s*дн/i, handler: (m: RegExpMatchArray) => addDays(new Date(), parseInt(m[1])) },
        { regex: /недел[юиь]/i, handler: () => addDays(new Date(), 7) },
        { regex: /завтра/i, handler: () => addDays(new Date(), 1) },
        { regex: /2\s*недел/i, handler: () => addDays(new Date(), 14) },
        { regex: /месяц/i, handler: () => addDays(new Date(), 30) },
      ];
      for (const { regex, handler } of dayPatterns) {
        const match = content.match(regex);
        if (match) {
          const date = handler(match);
          actions.push({
            type: "deadline",
            label: format(date, "d MMM", { locale: ru }),
            value: format(date, "yyyy-MM-dd"),
          });
          break;
        }
      }
    }

    return actions;
  }, [onAssign, onSetDeadline, memberMap, deadline]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft("");

    const userMsg: Msg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setStreaming(true);

    let assistantSoFar = "";

    try {
      await streamChat({
        url: CHAT_URL,
        body: {
          message: text,
          action: "chat",
          context: {
            systemPrompt: systemContext,
            history: newMessages,
          },
        },
        onDelta: (chunk) => {
          assistantSoFar += chunk;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
            }
            return [...prev, { role: "assistant", content: assistantSoFar }];
          });
        },
        onDone: () => setStreaming(false),
      });
    } catch (e) {
      setStreaming(false);
      if (e instanceof StreamChatError) {
        if (e.status === 429) toast.error("Слишком много запросов, попробуйте позже");
        else if (e.status === 402) toast.error("Недостаточно кредитов AI");
        else toast.error(e.message);
      } else {
        toast.error("Ошибка ИИ");
      }
    }
  }, [draft, streaming, messages, systemContext]);

  // Get actions for the last assistant message
  const lastAssistantMsg = messages.filter(m => m.role === "assistant").pop();
  const actions = lastAssistantMsg && !streaming ? parseActions(lastAssistantMsg.content) : [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 bg-popover border-border z-[60]"
        side="left"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-medium flex items-center gap-1.5 text-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> ИИ по задаче
          </span>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title="Очистить"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="max-h-56 min-h-0 overflow-y-auto overscroll-contain px-3 py-2">
          {messages.length === 0 && (
            <div className="text-center py-4 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Спросите что-нибудь по задаче
              </p>
              <div className="flex flex-wrap gap-1 justify-center">
                {smartSuggestions.map(q => (
                  <button
                    key={q}
                    onClick={() => { setDraft(q); setTimeout(() => inputRef.current?.focus(), 50); }}
                    className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "mb-2",
                m.role === "user" ? "text-right" : "text-left"
              )}
            >
              <div className={cn(
                "inline-block max-w-[90%] rounded-lg px-2.5 py-1.5 text-xs",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              )}>
                {m.role === "assistant" ? (
                  <div className="prose prose-xs dark:prose-invert max-w-none [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_li]:m-0 text-xs">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : m.content}
              </div>
            </div>
          ))}
          {streaming && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Думаю...
            </div>
          )}
          <div ref={bottomRef} />
        </ScrollArea>

        {/* Action buttons from AI response */}
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {actions.map((action, i) => (
              <button
                key={i}
                onClick={() => {
                  if (action.type === "assign" && onAssign) {
                    onAssign(action.value);
                    toast.success(`Назначен: ${action.label}`);
                  } else if (action.type === "deadline" && onSetDeadline) {
                    onSetDeadline(action.value);
                    toast.success(`Срок: ${action.label}`);
                  }
                }}
                className={cn(
                  "flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors font-medium",
                  action.type === "assign"
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400"
                    : "border-green-500/30 bg-green-500/10 text-green-600 hover:bg-green-500/20 dark:text-green-400"
                )}
              >
                {action.type === "assign" ? <UserCheck className="h-3 w-3" /> : <CalendarCheck className="h-3 w-3" />}
                {action.type === "assign" ? `Назначить: ${action.label}` : `Срок: ${action.label}`}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex items-center gap-1.5 px-2 py-2 border-t border-border">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Спросить ИИ..."
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            disabled={streaming}
          />
          <button
            onClick={send}
            disabled={!draft.trim() || streaming}
            className="p-1 rounded text-primary hover:bg-primary/10 disabled:opacity-40 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

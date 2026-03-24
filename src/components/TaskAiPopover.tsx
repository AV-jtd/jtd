import { useState, useRef, useEffect, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sparkles, Send, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { streamChat, StreamChatError } from "@/lib/streamChat";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface TaskAiPopoverProps {
  taskTitle: string;
  taskDescription?: string | null;
  subtasks?: string[];
  children: React.ReactNode;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;

export default function TaskAiPopover({ taskTitle, taskDescription, subtasks = [], children }: TaskAiPopoverProps) {
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

  const systemContext = `Контекст задачи:
Название: ${taskTitle}
${taskDescription ? `Описание: ${taskDescription}` : ""}
${subtasks.length > 0 ? `Шаги: ${subtasks.join(", ")}` : ""}

Ты — краткий помощник по этой задаче. Отвечай по делу, коротко, на русском.`;

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
        <ScrollArea className="max-h-56 px-3 py-2">
          {messages.length === 0 && (
            <div className="text-center py-4 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Спросите что-нибудь по задаче
              </p>
              <div className="flex flex-wrap gap-1 justify-center">
                {["Как лучше выполнить?", "Оцени сложность", "Риски?"].map(q => (
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

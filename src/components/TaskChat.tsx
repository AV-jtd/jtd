import { useState, useRef, useEffect } from "react";
import { useTaskComments, useCommentMutations, TaskComment } from "@/hooks/useComments";
import { useAuth } from "@/hooks/useAuth";
import { Profile } from "@/hooks/useTasks";
import { Send, Trash2, MessageCircle } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getInitials, getAvatarColors } from "@/lib/initials";

interface TaskChatProps {
  taskId: string;
  taskTitle: string;
  availableUsers: Profile[];
  /**
   * `inline` (default) — компактный вариант с собственной рамкой и заголовком,
   *   используется внутри карточки задачи (TaskItem).
   * `full` — на всю высоту контейнера, без рамки/заголовка, для шторки мессенджера.
   */
  variant?: "inline" | "full";
}

function formatMsgDate(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Вчера, ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm", { locale: ru });
}

export default function TaskChat({ taskId, taskTitle, availableUsers, variant = "inline" }: TaskChatProps) {
  const { user } = useAuth();
  const { data: comments = [], isLoading } = useTaskComments(taskId);
  const { addComment, deleteComment } = useCommentMutations();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  const getProfileName = (userId: string) => {
    const p = availableUsers.find(u => u.id === userId);
    return p?.display_name || userId.slice(0, 8);
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    addComment.mutate({ task_id: taskId, content: text });
    setDraft("");
  };

  const isFull = variant === "full";

  const messagesContent = (
    isLoading ? (
      <p className={cn("text-muted-foreground text-center", isFull ? "text-sm py-8" : "text-xs py-4")}>Загрузка...</p>
    ) : comments.length === 0 ? (
      <div className={cn("text-center", isFull ? "py-12" : "py-6")}>
        <MessageCircle className={cn("text-muted-foreground/20 mx-auto", isFull ? "h-10 w-10 mb-3" : "h-8 w-8 mb-2")} />
        <p className={cn("text-muted-foreground", isFull ? "text-sm" : "text-xs text-muted-foreground/60")}>
          Начните обсуждение
        </p>
      </div>
    ) : (
      <div className="space-y-2.5">
        {comments.map(c => {
          const isOwn = c.user_id === user?.id;
          const name = getProfileName(c.user_id);
          return (
            <div key={c.id} className="group/msg">
              <div className="flex items-center gap-1.5">
                {isFull ? (
                  <div
                    className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-semibold shrink-0"
                    style={getAvatarColors(name)}
                  >
                    {getInitials(name)}
                  </div>
                ) : (
                  <div className="h-4 w-4 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-semibold text-primary shrink-0">
                    {name[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <span className={cn("text-xs font-medium", isOwn ? "text-primary" : "text-foreground/70")}>
                  {name}
                </span>
                <span className="text-[10px] text-muted-foreground/60">{formatMsgDate(c.created_at)}</span>
              </div>
              <div className={cn("flex items-start gap-1", isFull ? "pl-[22px]" : "ml-5.5 pl-[22px]")}>
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground/90 flex-1">
                  {c.content}
                </p>
                {isOwn && (
                  <button
                    onClick={() => deleteComment.mutate({ id: c.id, task_id: taskId })}
                    className="opacity-0 group-hover/msg:opacity-100 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                    title="Удалить"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    )
  );

  const inputForm = (
    <form
      onSubmit={e => { e.preventDefault(); handleSend(); }}
      className={cn(
        "flex items-center gap-2 shrink-0",
        isFull
          ? "px-4 py-3 border-t border-border"
          : "px-3 py-2 border-t border-border bg-card/50"
      )}
    >
      <Input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="Написать..."
        enterKeyHint="send"
        className={cn(
          "flex-1",
          isFull ? "text-sm" : "text-sm h-8 border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
        )}
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={!draft.trim()}
        className={cn(
          "rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 transition-all shrink-0",
          isFull ? "p-2" : "p-1.5 disabled:opacity-20"
        )}
      >
        <Send className={isFull ? "h-4 w-4" : "h-3.5 w-3.5"} />
      </button>
    </form>
  );

  // Full variant: занимает всю высоту контейнера, без обёртки
  if (isFull) {
    return (
      <div className="flex flex-col h-full">
        <ScrollArea className="flex-1 px-4 py-3">
          {messagesContent}
        </ScrollArea>
        {inputForm}
      </div>
    );
  }

  // Inline variant: компактный с заголовком и рамкой
  return (
    <div id={`task-chat-${taskId}`} className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3" /> Чат {comments.length > 0 && `(${comments.length})`}
      </p>

      <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
        <ScrollArea className="max-h-64 px-3 py-2">
          {messagesContent}
        </ScrollArea>
        {inputForm}
      </div>
    </div>
  );
}

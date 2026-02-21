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

interface TaskChatProps {
  taskId: string;
  taskTitle: string;
  availableUsers: Profile[];
}

function formatMsgDate(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Вчера, ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm", { locale: ru });
}

export default function TaskChat({ taskId, taskTitle, availableUsers }: TaskChatProps) {
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
    return p?.display_name || p?.email || userId.slice(0, 8);
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    addComment.mutate({ task_id: taskId, content: text });
    setDraft("");
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <MessageCircle className="h-3 w-3" /> Чат {comments.length > 0 && `(${comments.length})`}
      </p>

      {/* Messages area */}
      <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
        <ScrollArea className="max-h-64 px-3 py-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Загрузка...</p>
          ) : comments.length === 0 ? (
            <div className="text-center py-6">
              <MessageCircle className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/60">Начните обсуждение</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {comments.map(c => {
                const isOwn = c.user_id === user?.id;
                return (
                  <div key={c.id} className="group/msg">
                    <div className="flex items-center gap-1.5">
                      <div className="h-4 w-4 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-semibold text-primary shrink-0">
                        {getProfileName(c.user_id)[0]?.toUpperCase() || "?"}
                      </div>
                      <span className={cn("text-xs font-medium", isOwn ? "text-primary" : "text-foreground/70")}>
                        {getProfileName(c.user_id)}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">{formatMsgDate(c.created_at)}</span>
                    </div>
                    <div className="flex items-start gap-1 ml-5.5 pl-[22px]">
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
          )}
        </ScrollArea>

        {/* Input */}
        <form
          onSubmit={e => { e.preventDefault(); handleSend(); }}
          className="flex items-center gap-2 px-3 py-2 border-t border-border bg-card/50"
        >
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Написать..."
            enterKeyHint="send"
            className="flex-1 text-sm h-8 border-0 shadow-none p-0 focus-visible:ring-0 bg-transparent"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-20 transition-all shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

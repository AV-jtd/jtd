import { useState, useRef, useEffect, useMemo } from "react";
import { useGroupMessages, useGroupChatMutations, GroupMessage } from "@/hooks/useGroupChat";
import { useAuth } from "@/hooks/useAuth";
import { X, Send, Reply, Trash2, MessageCircle } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProjectChatProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
  /** When true, hides the header (used inside MessengerPanel) */
  embedded?: boolean;
}

function formatMsgDate(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Вчера, ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm", { locale: ru });
}

function getAuthorName(msg: GroupMessage) {
  return msg.profile?.display_name || msg.profile?.email || "Аноним";
}

export default function ProjectChat({ groupId, groupName, onClose }: ProjectChatProps) {
  const { user } = useAuth();
  const { data: messages = [], isLoading } = useGroupMessages(groupId);
  const { sendMessage, deleteMessage } = useGroupChatMutations();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Group messages into threads: root messages + their replies
  const rootMessages = useMemo(() => messages.filter(m => !m.reply_to), [messages]);
  const repliesMap = useMemo(() => {
    const map: Record<string, GroupMessage[]> = {};
    messages.filter(m => m.reply_to).forEach(m => {
      if (!map[m.reply_to!]) map[m.reply_to!] = [];
      map[m.reply_to!].push(m);
    });
    return map;
  }, [messages]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    sendMessage.mutate({ group_id: groupId, content: text, reply_to: replyTo?.id || null });
    setDraft("");
    setReplyTo(null);
  };

  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const toggleThread = (id: string) => {
    setExpandedThreads(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate">{groupName}</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Загрузка...</p>
        ) : rootMessages.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Начните обсуждение проекта</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rootMessages.map(msg => {
              const replies = repliesMap[msg.id] || [];
              const isOwn = msg.user_id === user?.id;
              const expanded = expandedThreads.has(msg.id);

              return (
                <div key={msg.id} className="group">
                  {/* Root message */}
                  <MessageBubble
                    msg={msg}
                    isOwn={isOwn}
                    onReply={() => setReplyTo(msg)}
                    onDelete={isOwn ? () => deleteMessage.mutate({ id: msg.id, group_id: groupId }) : undefined}
                  />

                  {/* Thread indicator */}
                  {replies.length > 0 && (
                    <button
                      onClick={() => toggleThread(msg.id)}
                      className="ml-8 mt-1 text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                    >
                      <Reply className="h-3 w-3" />
                      {expanded ? "Скрыть" : `${replies.length} ${replies.length === 1 ? "ответ" : replies.length < 5 ? "ответа" : "ответов"}`}
                    </button>
                  )}

                  {/* Thread replies */}
                  {expanded && replies.map(reply => (
                    <div key={reply.id} className="ml-8 mt-1.5">
                      <MessageBubble
                        msg={reply}
                        isOwn={reply.user_id === user?.id}
                        onReply={() => setReplyTo(msg)}
                        onDelete={reply.user_id === user?.id ? () => deleteMessage.mutate({ id: reply.id, group_id: groupId }) : undefined}
                        isReply
                      />
                    </div>
                  ))}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply indicator */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-t border-border text-xs text-muted-foreground">
          <Reply className="h-3 w-3 shrink-0" />
          <span className="truncate">Ответ: {getAuthorName(replyTo)} — {replyTo.content.slice(0, 50)}</span>
          <button onClick={() => setReplyTo(null)} className="ml-auto shrink-0 hover:text-foreground"><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={e => { e.preventDefault(); handleSend(); }}
        className="flex items-center gap-2 px-4 py-3 border-t border-border shrink-0"
      >
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Написать сообщение..."
          className="flex-1 text-sm"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 transition-all"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

function MessageBubble({
  msg,
  isOwn,
  onReply,
  onDelete,
  isReply,
}: {
  msg: GroupMessage;
  isOwn: boolean;
  onReply: () => void;
  onDelete?: () => void;
  isReply?: boolean;
}) {
  const sourceIcon = msg.source === "telegram" ? "✈️" : null;

  return (
    <div className={cn("group/msg flex flex-col", isReply ? "gap-0.5" : "gap-1")}>
      <div className="flex items-center gap-1.5">
        <span className={cn("text-xs font-medium", isOwn ? "text-primary" : "text-foreground/70")}>
          {getAuthorName(msg)}
        </span>
        {sourceIcon && <span className="text-xs">{sourceIcon}</span>}
        <span className="text-[10px] text-muted-foreground/60">{formatMsgDate(msg.created_at)}</span>
      </div>
      <div className="flex items-start gap-1">
        <p className={cn(
          "text-sm leading-relaxed break-words",
          isOwn ? "text-foreground" : "text-foreground/90"
        )}>
          {msg.content}
        </p>
        <div className="opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0 ml-1 mt-0.5">
          <button onClick={onReply} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Ответить">
            <Reply className="h-3 w-3" />
          </button>
          {onDelete && (
            <button onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Удалить">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGroupMessages, useGroupChatMutations, GroupMessage } from "@/hooks/useGroupChat";
import { useAuth } from "@/hooks/useAuth";
import { X, Send, Reply, Trash2, MessageCircle, Sparkles, ArrowLeft, CheckSquare, Calendar as CalendarIcon, User as UserIcon, ChevronRight, Search, Link2 } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import AiChatThread from "./AiChatThread";
import { useTaskMutations, useAvailableUsers, type Profile, type Task } from "@/hooks/useTasks";
import UserPicker from "./UserPicker";
import { toast } from "sonner";
import { ReactionChips, ReactionAddButton } from "./MessageReactions";
import { useMessageReactions, type ReactionAgg } from "@/hooks/useMessageReactions";
import { AtSign } from "lucide-react";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import ClosedTaskPill from "./ClosedTaskPill";
import ChatLinkDialog from "./ChatLinkDialog";

interface ProjectChatProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
  /** When true, hides the header (used inside MessengerPanel) */
  embedded?: boolean;
  /** Navigate to the project detail view */
  onNavigateToProject?: (groupId: string) => void;
  /** Open a task by id (from inline-created task card) */
  onNavigateToTask?: (taskId: string) => void;
}

function formatMsgDate(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Вчера, ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm", { locale: ru });
}

function getAuthorName(msg: GroupMessage) {
  return msg.profile?.display_name || "Аноним";
}

export default function ProjectChat({ groupId, groupName, onClose, embedded, onNavigateToProject, onNavigateToTask }: ProjectChatProps) {
  const { user } = useAuth();
  const { data: messages = [], isLoading } = useGroupMessages(groupId);
  const { sendMessage, deleteMessage } = useGroupChatMutations();
  const { addTask, updateTask } = useTaskMutations();
  const { data: availableUsers = [] } = useAvailableUsers();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [showLink, setShowLink] = useState(false);
  /** message.id → form open */
  const [taskFormFor, setTaskFormFor] = useState<string | null>(null);
  /** уникальный nonce открытия формы — меняется при каждом открытии,
   *  чтобы InlineTaskForm всегда стартовала с чистым state (через key) */
  const [taskFormNonce, setTaskFormNonce] = useState(0);
  const openTaskForm = (id: string) => {
    setTaskFormFor(prev => {
      if (prev === id) return null;          // toggle close
      setTaskFormNonce(n => n + 1);          // bump для нового монтирования
      return id;
    });
  };
  const closeTaskForm = () => setTaskFormFor(null);
  /** message.id → созданная задача (для системной карточки) */
  const [createdTasks, setCreatedTasks] = useState<Record<string, { id: string; title: string; assigneeName?: string; deadline?: string | null }>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  // Подгружаем реакции для всех видимых сообщений группы.
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const { data: reactionsByMsg = {} } = useMessageReactions("group_message", messageIds);

  // Подгружаем актуальный статус задач, ссылки на которые уже есть в чате
  // (созданные через "Создать задачу из сообщения"). Если задача закрыта —
  // в карточке отрисуем перечёркнутый заголовок + pill «Закрыта».
  const linkedTaskIds = useMemo(
    () => Object.values(createdTasks).map((t) => t.id),
    [createdTasks],
  );
  const { data: taskStatusMap } = useTaskStatuses(linkedTaskIds);

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

    // Parse @mentions and fire notify-event "user_mentioned" for each unique
    // mentioned member of this project. Fire-and-forget — never blocks send.
    try {
      const mentionRe = /@([A-Za-zА-Яа-яЁё0-9_.\-]{2,40})/g;
      const handles = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = mentionRe.exec(text)) !== null) handles.add(m[1].toLowerCase());
      if (handles.size > 0) {
        const targets = availableUsers
          .filter((u) => {
            const uname = (u as any).username?.toLowerCase?.() || "";
            const tg = (u as any).telegram_username?.toLowerCase?.() || "";
            const dn = (u.display_name || "").toLowerCase().replace(/\s+/g, "_");
            return handles.has(uname) || handles.has(tg) || handles.has(dn);
          })
          .map((u) => u.id)
          .filter((id) => id && id !== user?.id);
        if (targets.length > 0) {
          supabase.auth.getSession().then(({ data: s }) => {
            if (!s.session) return;
            supabase.functions.invoke("notify-event", {
              body: {
                event: "user_mentioned",
                taskTitle: `${groupName}: ${text.slice(0, 80)}`,
                targetUserIds: targets,
                taskId: null,
              },
              headers: { Authorization: `Bearer ${s.session.access_token}` },
            }).catch(() => {});
          });
        }
      }
    } catch { /* non-fatal */ }

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

  // In-thread search: filters root messages (and matching replies stay visible
  // under their root). Toggled via a magnifier in the header.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const searchLower = searchQ.trim().toLowerCase();
  const visibleRoots = useMemo(() => {
    if (!searchLower) return rootMessages;
    return rootMessages.filter((m) => {
      if (m.content?.toLowerCase().includes(searchLower)) return true;
      const replies = repliesMap[m.id] || [];
      return replies.some((r) => r.content?.toLowerCase().includes(searchLower));
    });
  }, [rootMessages, repliesMap, searchLower]);

  const handleCreateTask = async (msg: GroupMessage, payload: { title: string; assignee: Profile | null; deadline: string | null }) => {
    try {
      const desc = `Из обсуждения проекта «${groupName}»\n\n> ${msg.content.slice(0, 500)}\n— ${getAuthorName(msg)}`;
      const created = await addTask.mutateAsync({
        title: payload.title.trim() || msg.content.slice(0, 80),
        group_id: groupId,
        assigned_to: payload.assignee?.id || null,
        deadline: payload.deadline ? new Date(payload.deadline).toISOString() : null,
      } as any);
      const t = created as unknown as Task;
      // Patch description through the standard mutation (addTask doesn't accept description)
      try {
        await updateTask.mutateAsync({ id: t.id, description: desc });
      } catch (e) { /* non-fatal */ }

      setCreatedTasks(prev => ({
        ...prev,
        [msg.id]: {
          id: t.id,
          title: t.title,
          assigneeName: payload.assignee?.display_name || undefined,
          deadline: payload.deadline,
        },
      }));

      // Send a "task created" card to project members' Telegram chats
      // (opt-in via telegram_group_chat_message). Fire-and-forget.
      try {
        const { data: s } = await supabase.auth.getSession();
        if (s.session) {
          supabase.functions
            .invoke("send-chat-telegram", {
              body: {
                kind: "task_created",
                group_id: groupId,
                task_id: t.id,
                task_title: t.title,
                assignee_name: payload.assignee?.display_name || null,
                deadline: payload.deadline || null,
                sender_name: user?.user_metadata?.display_name || user?.email || null,
                sender_user_id: user?.id || null,
              },
              headers: { Authorization: `Bearer ${s.session.access_token}` },
            })
            .catch(() => {});
        }
      } catch { /* non-fatal */ }

      // Гарантированно закрываем форму этого сообщения. Если пользователь
      // успел открыть форму другого сообщения — её не трогаем.
      setTaskFormFor(prev => (prev === msg.id ? null : prev));
      // Bump nonce, чтобы при следующем открытии любой формы InlineTaskForm
      // смонтировалась заново с дефолтными значениями (title из текста, ассайни-автор, пустой дедлайн).
      setTaskFormNonce(n => n + 1);
      toast.success("Задача создана");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось создать задачу");
    }
  };

  // AI chat view for this project
  if (showAi) {
    return (
      <div className={cn("flex flex-col h-full", !embedded && "bg-card border-l border-border")}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <button
            onClick={() => setShowAi(false)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              ИИ · {groupName}
            </p>
            <p className="text-[10px] text-muted-foreground">Анализ задач, рисков и прогресса</p>
          </div>
          {!embedded && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          <AiChatThread groupId={groupId} groupName={groupName} mode="project_chat" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", !embedded && "bg-card border-l border-border")}>
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <button
            onClick={() => onNavigateToProject?.(groupId)}
            className="flex items-center gap-2 min-w-0 hover:opacity-70 transition-opacity"
            title="Открыть проект"
          >
            <MessageCircle className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-semibold text-foreground truncate">{groupName}</span>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setSearchOpen(v => !v); if (searchOpen) setSearchQ(""); }}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                searchOpen ? "bg-primary/15 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
              title="Поиск в чате"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowAi(true)}
              className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
              title="ИИ-ассистент проекта"
            >
              <Sparkles className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* AI button when embedded (no own header) */}
      {embedded && (
        <div className="flex justify-end items-center gap-1 px-4 py-1.5 border-b border-border shrink-0">
          <button
            onClick={() => { setSearchOpen(v => !v); if (searchOpen) setSearchQ(""); }}
            className={cn(
              "flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors",
              searchOpen ? "bg-primary/15 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"
            )}
            title="Поиск в чате"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowAi(true)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>ИИ</span>
          </button>
        </div>
      )}

      {/* In-thread search input */}
      {searchOpen && (
        <div className="relative px-4 py-2 border-b border-border shrink-0 bg-muted/20">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            autoFocus
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Найти в этом чате..."
            className="h-8 text-sm pl-8 pr-16"
            onKeyDown={(e) => { if (e.key === "Escape") { setSearchQ(""); setSearchOpen(false); } }}
          />
          {searchQ && (
            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
              {visibleRoots.length}
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Загрузка...</p>
        ) : visibleRoots.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchLower ? "Ничего не найдено" : "Начните обсуждение проекта"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleRoots.map(msg => {
              const replies = repliesMap[msg.id] || [];
              const isOwn = msg.user_id === user?.id;
              // When searching, auto-expand threads where reply matched
              const matchedReply = searchLower
                ? replies.some((r) => r.content?.toLowerCase().includes(searchLower))
                : false;
              const expanded = expandedThreads.has(msg.id) || matchedReply;

              return (
                <div key={msg.id} className="group">
                  {/* Root message */}
                  <MessageBubble
                    msg={msg}
                    isOwn={isOwn}
                    onReply={() => setReplyTo(msg)}
                    onDelete={isOwn ? () => deleteMessage.mutate({ id: msg.id, group_id: groupId }) : undefined}
                    onCreateTask={() => openTaskForm(msg.id)}
                    reactions={reactionsByMsg[msg.id]}
                  />

                  {/* Inline task form */}
                  {taskFormFor === msg.id && (
                    <InlineTaskForm
                      key={`${msg.id}-${taskFormNonce}`}
                      message={msg}
                      availableUsers={availableUsers}
                      defaultAssignee={availableUsers.find(u => u.id === msg.user_id) || null}
                      onCancel={closeTaskForm}
                      onSubmit={(payload) => handleCreateTask(msg, payload)}
                      isSubmitting={addTask.isPending}
                    />
                  )}

                  {/* System card: task created from this message */}
                  {createdTasks[msg.id] && (
                    <CreatedTaskCard
                      info={createdTasks[msg.id]}
                      isCompleted={taskStatusMap?.get(createdTasks[msg.id].id) ?? false}
                      onClick={() => onNavigateToTask?.(createdTasks[msg.id].id)}
                    />
                  )}

                  {/* Thread indicator */}
                  {replies.length > 0 && (
                    <button
                      onClick={() => toggleThread(msg.id)}
                      className="ml-4 mt-1 text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1.5"
                    >
                      <Reply className="h-3 w-3" />
                      {expanded ? "Скрыть" : `${replies.length} ${replies.length === 1 ? "ответ" : replies.length < 5 ? "ответа" : "ответов"}`}
                    </button>
                  )}

                  {/* Thread replies — visualised as a vertical branch with a
                      quoted parent reference at the top. */}
                  {expanded && replies.length > 0 && (
                    <div className="ml-3 mt-1.5 pl-3 border-l-2 border-primary/30 space-y-1.5">
                      <div className="text-[10px] text-muted-foreground/70 italic truncate">
                        ↳ ответ на «{msg.content.slice(0, 60)}{msg.content.length > 60 ? "…" : ""}»
                      </div>
                      {replies.map(reply => (
                        <div key={reply.id}>
                          <MessageBubble
                        msg={reply}
                        isOwn={reply.user_id === user?.id}
                        onReply={() => setReplyTo(msg)}
                        onDelete={reply.user_id === user?.id ? () => deleteMessage.mutate({ id: reply.id, group_id: groupId }) : undefined}
                        onCreateTask={() => openTaskForm(reply.id)}
                        isReply
                        reactions={reactionsByMsg[reply.id]}
                      />
                      {taskFormFor === reply.id && (
                        <InlineTaskForm
                          key={`${reply.id}-${taskFormNonce}`}
                          message={reply}
                          availableUsers={availableUsers}
                          defaultAssignee={availableUsers.find(u => u.id === reply.user_id) || null}
                          onCancel={closeTaskForm}
                          onSubmit={(payload) => handleCreateTask(reply, payload)}
                          isSubmitting={addTask.isPending}
                        />
                      )}
                      {createdTasks[reply.id] && (
                        <CreatedTaskCard
                          info={createdTasks[reply.id]}
                          isCompleted={taskStatusMap?.get(createdTasks[reply.id].id) ?? false}
                          onClick={() => onNavigateToTask?.(createdTasks[reply.id].id)}
                        />
                      )}
                        </div>
                      ))}
                    </div>
                  )}
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
        className="relative flex items-center gap-2 px-4 py-3 border-t border-border shrink-0"
      >
        <MentionAutocomplete
          value={draft}
          users={availableUsers}
          onPick={(u) => {
            const handle = ((u as any).username || (u as any).telegram_username || (u.display_name || "user").replace(/\s+/g, "_")).toString();
            const m = draft.match(/@([A-Za-zА-Яа-яЁё0-9_.\-]*)$/);
            const base = m ? draft.slice(0, draft.length - m[0].length) : draft;
            setDraft(`${base}@${handle} `);
          }}
        />
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Написать сообщение... (@ — упомянуть)"
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
  onCreateTask,
  isReply,
  reactions,
}: {
  msg: GroupMessage;
  isOwn: boolean;
  onReply: () => void;
  onDelete?: () => void;
  onCreateTask?: () => void;
  isReply?: boolean;
  reactions?: ReactionAgg;
}) {
  const sourceIcon = msg.source === "telegram" ? "✈️" : null;

  return (
    <div className={cn("group/msg relative flex flex-col", isReply ? "gap-0.5" : "gap-1")}>
      <div className="flex items-center gap-1.5 pr-20 flex-wrap">
        <span className={cn("text-xs font-medium", isOwn ? "text-primary" : "text-foreground/70")}>
          {getAuthorName(msg)}
        </span>
        {sourceIcon && <span className="text-xs">{sourceIcon}</span>}
        <span className="text-[10px] text-muted-foreground/60">{formatMsgDate(msg.created_at)}</span>
        <ReactionChips
          messageType="group_message"
          messageId={msg.id}
          reactions={reactions}
          size="xs"
        />
        {/* Кнопка добавления реакции: inline в строке метаданных,
            всегда видима (в т.ч. на мобиле). */}
        <ReactionAddButton
          messageType="group_message"
          messageId={msg.id}
          reactions={reactions}
          className="ml-0.5"
        />
      </div>
      <p className={cn(
        "text-sm leading-relaxed break-words pr-2",
        isOwn ? "text-foreground" : "text-foreground/90"
      )}>
        {msg.content}
      </p>
      {/* Action bar — абсолютный, не сдвигает текст и не перекрывается соседними блоками */}
      <div className="pointer-events-none absolute top-0 right-0 z-10 opacity-100 md:opacity-0 md:group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-md bg-card/95 backdrop-blur-sm border border-border shadow-sm px-1 py-0.5">
          {onCreateTask && (
            <button type="button" onClick={onCreateTask} className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary" title="Создать задачу из сообщения">
              <CheckSquare className="h-3 w-3" />
            </button>
          )}
          <button type="button" onClick={onReply} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Ответить">
            <Reply className="h-3 w-3" />
          </button>
          {onDelete && (
            <button type="button" onClick={onDelete} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Удалить">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineTaskForm({
  message,
  availableUsers,
  defaultAssignee,
  onCancel,
  onSubmit,
  isSubmitting,
}: {
  message: GroupMessage;
  availableUsers: Profile[];
  defaultAssignee: Profile | null;
  onCancel: () => void;
  onSubmit: (payload: { title: string; assignee: Profile | null; deadline: string | null }) => void;
  isSubmitting: boolean;
}) {
  const [title, setTitle] = useState(() => message.content.slice(0, 80));
  const [assignee, setAssignee] = useState<Profile | null>(defaultAssignee);
  const [deadline, setDeadline] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="mt-2 p-2.5 rounded-lg bg-muted/40 border border-border space-y-2">
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название задачи"
        className="h-8 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (title.trim() && !isSubmitting) onSubmit({ title, assignee, deadline: deadline || null });
          }
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex items-center gap-1.5 flex-wrap">
        <UserPicker
          users={availableUsers}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="Ответственный"
          onSelect={(u) => setAssignee(u)}
          side="bottom"
          trigger={
            <button
              type="button"
              className="flex items-center gap-1 h-7 px-2 rounded-md bg-card border border-border hover:bg-muted text-xs text-foreground"
            >
              <UserIcon className="h-3 w-3 text-muted-foreground" />
              <span className="truncate max-w-[100px]">
                {assignee?.display_name || "Кто"}
              </span>
            </button>
          }
        />
        <label className="flex items-center gap-1 h-7 px-2 rounded-md bg-card border border-border hover:bg-muted text-xs text-foreground cursor-pointer">
          <CalendarIcon className="h-3 w-3 text-muted-foreground" />
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="bg-transparent border-0 outline-none text-xs w-[110px]"
          />
        </label>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-2 py-1 rounded-md text-muted-foreground hover:bg-muted"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!title.trim() || isSubmitting}
            onClick={() => onSubmit({ title, assignee, deadline: deadline || null })}
            className="text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {isSubmitting ? "..." : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

type CreatedTaskInfo = { id: string; title: string; assigneeName?: string; deadline?: string | null };

function CreatedTaskCard({ info, onClick, isCompleted }: { info: CreatedTaskInfo; onClick: () => void; isCompleted?: boolean }) {
  const assignee = info.assigneeName?.trim();
  let deadlineLabel = "";
  if (info.deadline) {
    const d = new Date(info.deadline);
    if (!isNaN(d.getTime())) {
      deadlineLabel = ` · до ${format(d, "d MMM", { locale: ru })}`;
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15 hover:bg-primary/10 transition-colors text-left group/card"
    >
      <div className="h-7 w-7 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
        <CheckSquare className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate flex items-center gap-1.5">
          <span className={cn("truncate", isCompleted && "line-through text-muted-foreground")}>
            {info.title || "Без названия"}
          </span>
          {isCompleted && <ClosedTaskPill />}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {isCompleted ? "Задача закрыта" : "Задача создана"}
          {assignee ? ` · ${assignee}` : ""}
          {deadlineLabel}
        </p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0" />
    </button>
  );
}

/**
 * Простой popup для подсказки участников при наборе `@` в конце слова.
 * Появляется над полем ввода. Стрелки/Enter не обрабатываем — клик мышью.
 */
function MentionAutocomplete({
  value,
  users,
  onPick,
}: {
  value: string;
  users: Profile[];
  onPick: (u: Profile) => void;
}) {
  // Извлекаем токен после последнего `@` в самом конце строки (без пробела).
  const m = value.match(/@([A-Za-zА-Яа-яЁё0-9_.\-]*)$/);
  if (!m) return null;
  const query = m[1].toLowerCase();

  const matches = users
    .filter((u) => {
      const dn = (u.display_name || "").toLowerCase();
      const uname = ((u as any).username || "").toLowerCase();
      const tg = ((u as any).telegram_username || "").toLowerCase();
      if (!query) return true;
      return dn.includes(query) || uname.includes(query) || tg.includes(query);
    })
    .slice(0, 6);

  if (matches.length === 0) return null;

  return (
    <div className="absolute bottom-full left-4 right-4 mb-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
      <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border flex items-center gap-1">
        <AtSign className="h-3 w-3" /> Упомянуть
      </div>
      <div className="max-h-56 overflow-y-auto">
        {matches.map((u) => {
          const handle =
            (u as any).username ||
            (u as any).telegram_username ||
            (u.display_name || "user").replace(/\s+/g, "_");
          return (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => {
                // mousedown, иначе input теряет фокус до onClick
                e.preventDefault();
                onPick(u);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-muted/60 transition-colors text-left"
            >
              <div className="h-6 w-6 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0">
                {(u.display_name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{u.display_name || "Без имени"}</p>
                <p className="text-[10px] text-muted-foreground truncate">@{handle}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

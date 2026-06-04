import { useState, useRef, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGroupMessages, useGroupChatMutations, GroupMessage } from "@/hooks/useGroupChat";
import { useAuth } from "@/hooks/useAuth";
import { X, Send, Reply, Trash2, MessageCircle, Sparkles, ArrowLeft, CheckSquare, Calendar as CalendarIcon, User as UserIcon, Search, Link2, Check, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import AiChatThread from "./AiChatThread";
import { useTaskMutations, useAvailableUsers, type Profile, type Task } from "@/hooks/useTasks";
import UserPicker from "./UserPicker";
import { toast } from "sonner";
import { useMessageReactions, type ReactionAgg } from "@/hooks/useMessageReactions";
import ChatMessageRow, { type ChatAction } from "./chat/ChatMessageRow";
import MentionAutocomplete, { userMentionLabel, resolveMentionedUserIds } from "./chat/MentionAutocomplete";
import MentionText from "./chat/MentionText";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import ChatLinkDialog from "./ChatLinkDialog";
import SystemCard from "./chat/SystemCard";
import { parseChatCard, getChatCardDef, chatCardMarker, formatChatCardBody, type ChatCardKind, type ParsedChatCard } from "@/lib/chatCards";

interface ProjectChatProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
  /** When true, hides the header (used inside MessengerPanel) */
  embedded?: boolean;
  /** When true, chat is rendered as a full-screen page. */
  fullscreen?: boolean;
  /** Toggle between side panel and full-screen route. */
  onToggleFullscreen?: () => void;
  /** Navigate to the project detail view */
  onNavigateToProject?: (groupId: string) => void;
  /** Open a task by id (from inline-created task card) */
  onNavigateToTask?: (taskId: string) => void;
}

function getAuthorName(msg: GroupMessage) {
  return msg.profile?.display_name || msg.external_author || "Аноним";
}

export default function ProjectChat({ groupId, groupName, onClose, embedded, fullscreen, onToggleFullscreen, onNavigateToProject, onNavigateToTask }: ProjectChatProps) {
  const { user } = useAuth();
  const { data: messages = [], isLoading } = useGroupMessages(groupId);
  const { sendMessage, deleteMessage } = useGroupChatMutations();
  const { addTask, updateTask } = useTaskMutations();
  const { data: availableUsers = [] } = useAvailableUsers();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  /**
   * Точное соответствие «подпись в тексте → user_id» для выбранных упоминаний,
   * чтобы в тексте оставалось читаемое имя, а уведомление уходило нужному
   * пользователю даже при совпадающих именах.
   */
  const mentionedRef = useRef<Map<string, string>>(new Map());
  const [showAi, setShowAi] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linked, setLinked] = useState<{ telegram: boolean; max: boolean }>({ telegram: false, max: false });
  const [mirror, setMirror] = useState(true);
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
  const bottomRef = useRef<HTMLDivElement>(null);

  // Подгружаем реакции для всех видимых сообщений группы.
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const { data: reactionsByMsg = {} } = useMessageReactions("group_message", messageIds);

  // Подгружаем актуальный статус задач, на которые ссылаются system-карточки в
  // ленте (создание задачи/поручения). Закрытые рисуем перечёркнутыми.
  const linkedTaskIds = useMemo(
    () => {
      const ids = new Set<string>();
      for (const m of messages) {
        const card = parseChatCard(m.external_message_id, m.content);
        if (card && card.def.target === "task") ids.add(card.entityId);
      }
      return [...ids];
    },
    [messages],
  );
  const { data: taskStatusMap } = useTaskStatuses(linkedTaskIds);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Load current chat binding + mirror status.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("task_groups")
        .select("telegram_group_chat_id, max_group_chat_id, chat_mirror_enabled")
        .eq("id", groupId)
        .maybeSingle();
      setLinked({
        telegram: !!data?.telegram_group_chat_id,
        max: !!data?.max_group_chat_id,
      });
      setMirror(data?.chat_mirror_enabled ?? true);
    })();
  }, [groupId]);

  // Refresh status when link dialog closes (user may have changed binding).
  const prevShowLink = useRef(showLink);
  useEffect(() => {
    if (prevShowLink.current && !showLink) {
      (async () => {
        const { data } = await supabase
          .from("task_groups")
          .select("telegram_group_chat_id, max_group_chat_id, chat_mirror_enabled")
          .eq("id", groupId)
          .maybeSingle();
        setLinked({
          telegram: !!data?.telegram_group_chat_id,
          max: !!data?.max_group_chat_id,
        });
        setMirror(data?.chat_mirror_enabled ?? true);
      })();
    }
    prevShowLink.current = showLink;
  }, [showLink, groupId]);

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

    // Слэш-команда: /задача @Кто <текст> — создаёт задачу прямо из композера
    // и постит system-карточку в ленту.
    const slash = text.match(/^\/(задача|task)\s+([\s\S]+)$/i);
    if (slash) {
      let rest = slash[2].trim();
      let assignee: Profile | null = null;
      const mentionIds = resolveMentionedUserIds(rest, availableUsers);
      if (mentionIds.length > 0) {
        assignee = availableUsers.find((u) => u.id === mentionIds[0]) || null;
        rest = rest.replace(/@([A-Za-zА-Яа-яЁё0-9_.\-]+)/g, "").trim();
      }
      handleCreateCard(null, { title: rest, assignee, deadline: null });
      setDraft("");
      setReplyTo(null);
      mentionedRef.current.clear();
      return;
    }

    const parent = replyTo;
    sendMessage.mutate({ group_id: groupId, content: text, reply_to: parent?.id || null });

    // @-упоминания: уведомляем выбранных участников. Точные id берём из
    // mentionedRef (имя в тексте, id — отдельно), плюс фолбэк по тексту и
    // автоупоминание автора сообщения, на которое отвечаем. Fire-and-forget.
    try {
      const targets = new Set<string>();
      for (const [label, id] of mentionedRef.current.entries()) {
        if (text.includes(label)) targets.add(id);
      }
      for (const id of resolveMentionedUserIds(text, availableUsers)) targets.add(id);
      if (parent?.user_id) targets.add(parent.user_id);
      targets.delete(user?.id || "");
      const targetIds = [...targets].filter(Boolean);
      if (targetIds.length > 0) {
        supabase.auth.getSession().then(({ data: s }) => {
          if (!s.session) return;
          supabase.functions.invoke("notify-event", {
            body: {
              event: "user_mentioned",
              taskTitle: `${groupName}: ${text.slice(0, 80)}`,
              targetUserIds: targetIds,
              taskId: null,
            },
            headers: { Authorization: `Bearer ${s.session.access_token}` },
          }).catch(() => {});
        });
      }
    } catch { /* non-fatal */ }

    setDraft("");
    setReplyTo(null);
    mentionedRef.current.clear();
  };

  /**
   * Начать адресный ответ: запоминаем сообщение и подставляем @-упоминание
   * автора в начало черновика (если он ещё не упомянут).
   */
  const startReply = (msg: GroupMessage) => {
    setReplyTo(msg);
    const author = availableUsers.find((u) => u.id === msg.user_id);
    if (author && msg.user_id !== user?.id) {
      const label = userMentionLabel(author);
      mentionedRef.current.set(`@${label}`, author.id);
      setDraft((prev) => (prev.includes(`@${label}`) ? prev : `@${label} ${prev}`));
    }
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

  /**
   * Единая точка создания задачи из чата (из сообщения или из композера).
   * После создания пишет в `group_messages` персистентную system-карточку
   * (через реестр chatCards), которая рендерится во всех чатах и зеркалится в
   * TG/MAX. `msg = null` — создание из слэш-команды композера.
   */
  const handleCreateCard = async (
    msg: GroupMessage | null,
    payload: { title: string; assignee: Profile | null; deadline: string | null },
  ) => {
    const kind: ChatCardKind = "task_created";
    const def = getChatCardDef(kind);
    try {
      const sourceText = msg ? `\n\n> ${msg.content.slice(0, 500)}\n— ${getAuthorName(msg)}` : "";
      const desc = `Из обсуждения проекта «${groupName}»${sourceText}`;
      const title = payload.title.trim() || (msg ? msg.content.slice(0, 80) : def.label);
      const created = await addTask.mutateAsync({
        title,
        group_id: groupId,
        assigned_to: payload.assignee?.id || null,
        deadline: payload.deadline ? new Date(payload.deadline).toISOString() : null,
      } as any);
      const t = created as unknown as Task;
      try {
        await updateTask.mutateAsync({ id: t.id, description: desc });
      } catch (e) { /* non-fatal */ }

      const deadlineLabel = payload.deadline
        ? new Date(payload.deadline).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
        : null;

      // Персистентная system-карточка в ленту чата.
      await supabase.from("group_messages" as any).insert({
        group_id: groupId,
        user_id: user!.id,
        content: formatChatCardBody(kind, t.title, { assigneeName: payload.assignee?.display_name, deadlineLabel }),
        external_message_id: chatCardMarker(kind, t.id),
        source: "web",
      });

      // Зеркало в Telegram/MAX. Fire-and-forget.
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

      if (msg) setTaskFormFor(prev => (prev === msg.id ? null : prev));
      setTaskFormNonce(n => n + 1);
      toast.success("Задача создана");
    } catch (e: any) {
      toast.error(e?.message || "Не удалось создать");
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
              onClick={() => setShowLink(true)}
              className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
              title="Подключить чат Telegram / MAX"
            >
              <Link2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowAi(true)}
              className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
              title="ИИ-ассистент проекта"
            >
              <Sparkles className="h-4 w-4" />
            </button>
            {onToggleFullscreen && (
              <button
                onClick={onToggleFullscreen}
                className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
                title={fullscreen ? "Свернуть" : "Развернуть на весь экран"}
              >
                {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}
            {!fullscreen && (
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
              </button>
            )}
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
          <button
            onClick={() => setShowLink(true)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
            title="Подключить чат Telegram / MAX"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Chat link status */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border shrink-0 bg-muted/20">
        <span className="text-[10px] text-muted-foreground font-medium">Чат:</span>
        {linked.telegram ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
            <Check className="h-2.5 w-2.5" /> Telegram
          </span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Telegram</span>
        )}
        {linked.max ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
            <Check className="h-2.5 w-2.5" /> MAX
          </span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">MAX</span>
        )}
        {(linked.telegram || linked.max) && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium",
              mirror
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-amber-500/10 text-amber-600"
            )}
          >
            {mirror ? "↔ Зеркало" : "Зеркало выкл"}
          </span>
        )}
        {!linked.telegram && !linked.max && (
          <span className="text-[10px] text-muted-foreground">не привязан — <button onClick={() => setShowLink(true)} className="text-primary hover:underline">подключить</button></span>
        )}
      </div>

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
      <ScrollArea className="flex-1 px-4 py-3 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!min-w-0">
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

              // System-карточка (создана задача/поручение/протокол…) — из реестра,
              // распознаётся по external_message_id, рендерится как разделитель.
              const card = parseChatCard(msg.external_message_id, msg.content);
              if (card) {
                return (
                  <div key={msg.id} className="group">
                    <SystemCard
                      card={card}
                      isCompleted={card.def.target === "task" ? (taskStatusMap?.get(card.entityId) ?? false) : false}
                      onClick={
                        card.def.target === "task"
                          ? () => onNavigateToTask?.(card.entityId)
                          : undefined
                      }
                    />
                  </div>
                );
              }

              return (
                <div key={msg.id} className="group">
                  {/* Root message */}
                  <MessageBubble
                    msg={msg}
                    isOwn={isOwn}
                    onReply={() => startReply(msg)}
                    onDelete={isOwn ? () => deleteMessage.mutate({ id: msg.id, group_id: groupId }) : undefined}
                    onCreateTask={() => openTaskForm(msg.id)}
                    reactions={reactionsByMsg[msg.id]}
                    users={availableUsers}
                  />

                  {/* Inline task form */}
                  {taskFormFor === msg.id && (
                    <InlineTaskForm
                      key={`${msg.id}-${taskFormNonce}`}
                      message={msg}
                      availableUsers={availableUsers}
                      defaultAssignee={availableUsers.find(u => u.id === msg.user_id) || null}
                      onCancel={closeTaskForm}
                      onSubmit={(payload) => handleCreateCard(msg, payload)}
                      isSubmitting={addTask.isPending}
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
                      {replies.map(reply => {
                        const replyCard = parseChatCard(reply.external_message_id, reply.content);
                        if (replyCard) {
                          return (
                            <div key={reply.id}>
                              <SystemCard
                                card={replyCard}
                                isCompleted={replyCard.def.target === "task" ? (taskStatusMap?.get(replyCard.entityId) ?? false) : false}
                                onClick={replyCard.def.target === "task" ? () => onNavigateToTask?.(replyCard.entityId) : undefined}
                              />
                            </div>
                          );
                        }
                        return (
                        <div key={reply.id}>
                          <MessageBubble
                        msg={reply}
                        isOwn={reply.user_id === user?.id}
                        onReply={() => startReply(msg)}
                        onDelete={reply.user_id === user?.id ? () => deleteMessage.mutate({ id: reply.id, group_id: groupId }) : undefined}
                        onCreateTask={() => openTaskForm(reply.id)}
                        isReply
                        reactions={reactionsByMsg[reply.id]}
                        users={availableUsers}
                      />
                      {taskFormFor === reply.id && (
                        <InlineTaskForm
                          key={`${reply.id}-${taskFormNonce}`}
                          message={reply}
                          availableUsers={availableUsers}
                          defaultAssignee={availableUsers.find(u => u.id === reply.user_id) || null}
                          onCancel={closeTaskForm}
                          onSubmit={(payload) => handleCreateCard(reply, payload)}
                          isSubmitting={addTask.isPending}
                        />
                      )}
                        </div>
                        );
                      })}
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
            const label = userMentionLabel(u);
            const m = draft.match(/@([A-Za-zА-Яа-яЁё0-9_.\-]*)$/);
            const base = m ? draft.slice(0, draft.length - m[0].length) : draft;
            mentionedRef.current.set(`@${label}`, u.id);
            setDraft(`${base}@${label} `);
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
      <ChatLinkDialog
        groupId={groupId}
        groupName={groupName}
        open={showLink}
        onOpenChange={setShowLink}
      />
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
  users,
}: {
  msg: GroupMessage;
  isOwn: boolean;
  onReply: () => void;
  onDelete?: () => void;
  onCreateTask?: () => void;
  isReply?: boolean;
  reactions?: ReactionAgg;
  users: Profile[];
}) {
  const actions: ChatAction[] = [];
  if (onCreateTask) actions.push({ icon: CheckSquare, onClick: onCreateTask, title: "Создать задачу из сообщения", tone: "primary" });
  actions.push({ icon: Reply, onClick: onReply, title: "Ответить" });
  if (onDelete) actions.push({ icon: Trash2, onClick: onDelete, title: "Удалить", tone: "danger" });

  return (
    <ChatMessageRow
      authorName={getAuthorName(msg)}
      isOwn={isOwn}
      createdAt={msg.created_at}
      content={
        <MentionText
          content={msg.content}
          users={users}
          className="text-sm leading-relaxed break-words whitespace-pre-wrap"
        />
      }
      messageType="group_message"
      messageId={msg.id}
      reactions={reactions}
      source={msg.source}
      actions={actions}
      isReply={isReply}
    />
  );
}

function InlineTaskForm({
  message,
  availableUsers,
  defaultAssignee,
  onCancel,
  onSubmit,
  isSubmitting,
  kind = "task_created",
}: {
  message: GroupMessage;
  availableUsers: Profile[];
  defaultAssignee: Profile | null;
  onCancel: () => void;
  onSubmit: (payload: { title: string; assignee: Profile | null; deadline: string | null }) => void;
  isSubmitting: boolean;
  kind?: ChatCardKind;
}) {
  const isAssignment = kind === "assignment_created";
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
        placeholder={isAssignment ? "Что поручить" : "Название задачи"}
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
            {isSubmitting ? "..." : isAssignment ? "Поручить" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}

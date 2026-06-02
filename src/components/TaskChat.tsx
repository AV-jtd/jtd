import { useState, useRef, useEffect, useMemo } from "react";
import { useTaskComments, useCommentMutations, TaskComment } from "@/hooks/useComments";
import { useAuth } from "@/hooks/useAuth";
import { Profile, useTaskMutations } from "@/hooks/useTasks";
import { Send, Trash2, MessageCircle, CheckSquare, X, CalendarIcon, User as UserIcon, CheckCircle2, ArrowRight, Plus, History, Reply, CornerDownRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import UserPicker from "./UserPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useMessageReactions } from "@/hooks/useMessageReactions";
import ChatMessageRow, { type ChatAction } from "./chat/ChatMessageRow";
import MentionAutocomplete, { userMentionLabel, resolveMentionedUserIds } from "./chat/MentionAutocomplete";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import ClosedTaskPill from "./ClosedTaskPill";

/** Префикс системных сообщений в чате задач/комментариев. */
const SYS_PREFIX = "__sys_task_created__:";
/** Префикс системного маркера «эта задача была закрыта → создана задача-продолжение». */
const SYS_FOLLOWUP_PREFIX = "__sys_task_followup__:";
/** Префикс системного маркера «эта задача является продолжением другой». */
const SYS_SOURCE_PREFIX = "__sys_task_source__:";

/**
 * Формат содержимого системного сообщения:
 *   __sys_task_created__:<taskId>|<taskTitle>
 * Распаковывается при рендере в строку-разделитель.
 */
function parseSystemMessage(content: string): { taskId: string; title: string } | null {
  if (!content.startsWith(SYS_PREFIX)) return null;
  const rest = content.slice(SYS_PREFIX.length);
  const sep = rest.indexOf("|");
  if (sep === -1) return null;
  return { taskId: rest.slice(0, sep), title: rest.slice(sep + 1) };
}

/**
 * Распарсить любой системный маркер связи задач (created / followup / source).
 * Возвращает kind для разной отрисовки SystemDivider'ом.
 */
function parseAnySystemMessage(
  content: string,
): { kind: "created" | "followup" | "source"; taskId: string; title: string } | null {
  const tryParse = (prefix: string, kind: "created" | "followup" | "source") => {
    if (!content.startsWith(prefix)) return null;
    const rest = content.slice(prefix.length);
    const sep = rest.indexOf("|");
    if (sep === -1) return null;
    return { kind, taskId: rest.slice(0, sep), title: rest.slice(sep + 1) };
  };
  return (
    tryParse(SYS_PREFIX, "created") ||
    tryParse(SYS_FOLLOWUP_PREFIX, "followup") ||
    tryParse(SYS_SOURCE_PREFIX, "source")
  );
}

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
  /** Открыть задачу по ID (если предоставлено — системные карточки кликабельны). */
  onNavigateToTask?: (taskId: string) => void;
  /** Текущий статус задачи (нужен для отрисовки кнопки «Закрыть/Открыть»
   *  и блокировки follow-up формы пока задача открыта). Если не передан —
   *  компонент сам определит из tasks-кэша через useTaskStatuses. */
  isCompleted?: boolean;
  /** ID проекта, в котором живёт задача — нужен для копирования контекста
   *  при создании задачи-продолжения (тот же group_id). Если не передан,
   *  follow-up создастся в "Inbox". */
  groupId?: string | null;
  /** Спрятать встроенную панель «Закрыть/Связанная задача» (когда родитель
   *  уже отрисовал свои кнопки — TaskItem). Сама follow-up форма всё равно
   *  открывается через `openFollowUpSignal`. */
  showCloseAction?: boolean;
  /** Внешний триггер для открытия inline-формы создания связанной задачи.
   *  Меняется числом (Date.now()) — при изменении форма раскрывается. */
  openFollowUpSignal?: number;
}

export default function TaskChat({
  taskId, taskTitle, availableUsers, variant = "inline", onNavigateToTask,
  isCompleted: isCompletedProp, groupId: groupIdProp,
  showCloseAction = true, openFollowUpSignal,
}: TaskChatProps) {
  const { user } = useAuth();
  const { data: comments = [], isLoading } = useTaskComments(taskId);
  const { addComment, deleteComment } = useCommentMutations();
  const { toggleTask } = useTaskMutations();
  const [draft, setDraft] = useState("");
  /** Активная вкладка: chat (message+system), log (только log), all (всё). */
  const [tab, setTab] = useState<"chat" | "log" | "all">("chat");
  /**
   * Точное соответствие «подпись в тексте → user_id» для выбранных упоминаний.
   * Храним идентификатор отдельно от текста, поэтому имя в сообщении остаётся
   * читаемым, а уведомление гарантированно уходит нужному пользователю
   * (даже при совпадающих именах). Чистим перед отправкой по реальному тексту.
   */
  const mentionedRef = useRef<Map<string, string>>(new Map());
  /** Сообщение, на которое сейчас отвечаем (thread/reply). */
  const [replyTo, setReplyTo] = useState<TaskComment | null>(null);
  /** ID сообщения, к которому нужно подсветить/проскроллить (открытие контекста ответа). */
  const [highlightId, setHighlightId] = useState<string | null>(null);
  /** Открыта inline-форма создания follow-up задачи (после закрытия текущей). */
  const [followUpFormOpen, setFollowUpFormOpen] = useState(false);
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);

  // ID обычных (не системных) комментариев для подгрузки реакций.
  const reactableIds = useMemo(
    () => comments.filter((c) => !parseSystemMessage(c.content)).map((c) => c.id),
    [comments],
  );
  const { data: reactionsByMsg = {} } = useMessageReactions("task_comment", reactableIds);
  // Системные сообщения (created/followup/source) — подгрузим статусы
  // упомянутых задач, чтобы перечеркнуть закрытые + показать pill.
  // Плюс — статус самой текущей задачи, если он не пришёл пропом.
  const linkedTaskIds = useMemo(() => {
    const ids: string[] = [];
    for (const c of comments) {
      const sys = parseAnySystemMessage(c.content);
      if (sys) ids.push(sys.taskId);
    }
    if (isCompletedProp === undefined) ids.push(taskId);
    return ids;
  }, [comments, taskId, isCompletedProp]);
  const { data: taskStatusMap } = useTaskStatuses(linkedTaskIds);
  const isCompleted = isCompletedProp ?? taskStatusMap?.get(taskId) ?? false;
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  /** Сообщение, для которого открыта inline-форма создания задачи. */
  const [taskFormForCommentId, setTaskFormForCommentId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length, followUpFormOpen]);

  // Внешний триггер от родителя (TaskItem): открыть форму follow-up.
  useEffect(() => {
    if (openFollowUpSignal !== undefined && openFollowUpSignal > 0) {
      setFollowUpFormOpen(true);
    }
  }, [openFollowUpSignal]);

  const getProfileName = (userId: string) => {
    const p = availableUsers.find(u => u.id === userId);
    return p?.display_name || userId.slice(0, 8);
  };

  /** Быстрый доступ к сообщению по id — для отрисовки цитаты родителя ответа. */
  const commentsById = useMemo(() => {
    const m = new Map<string, TaskComment>();
    for (const c of comments) m.set(c.id, c);
    return m;
  }, [comments]);

  /** Проскроллить к исходному сообщению и кратко его подсветить. */
  const openReplyContext = (parentId: string) => {
    setHighlightId(parentId);
    requestAnimationFrame(() => {
      const el = document.getElementById(`tc-msg-${taskId}-${parentId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    window.setTimeout(() => setHighlightId(null), 1800);
  };

  /**
   * Начать адресный ответ: запоминаем сообщение и подставляем @-упоминание
   * его автора в начало черновика (если он ещё не упомянут).
   */
  const startReply = (c: TaskComment) => {
    setReplyTo(c);
    const author = availableUsers.find((u) => u.id === c.user_id);
    if (author && c.user_id !== user?.id) {
      const label = userMentionLabel(author);
      setDraft((prev) => (prev.includes(`@${label}`) ? prev : `@${label} ${prev}`));
    }
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    const parent = replyTo;
    addComment.mutate({ task_id: taskId, content: text, reply_to: parent?.id ?? null });

    // Уведомления об @-упоминаниях + адресный ответ (автоупоминание автора
    // сообщения, на которое отвечаем). Fire-and-forget — не блокирует отправку.
    try {
      const targets = new Set(resolveMentionedUserIds(text, availableUsers));
      // Адресный ответ → всегда уведомляем автора исходного сообщения.
      if (parent?.user_id) targets.add(parent.user_id);
      targets.delete(user?.id || "");
      const targetIds = [...targets].filter(Boolean);
      if (targetIds.length > 0) {
        supabase.auth.getSession().then(({ data: s }) => {
          if (!s.session) return;
          supabase.functions.invoke("notify-event", {
            body: {
              event: "user_mentioned",
              taskTitle: `${taskTitle}: ${text.slice(0, 80)}`,
              targetUserIds: targetIds,
              taskId,
            },
            headers: { Authorization: `Bearer ${s.session.access_token}` },
          }).catch(() => {});
        });
      }
    } catch { /* non-fatal */ }

    setDraft("");
    setReplyTo(null);
  };

  /**
   * Закрыть/открыть текущую задачу прямо из чата.
   * При закрытии — автоматически открываем форму создания задачи-продолжения,
   * чтобы воркфлоу «закрытие → новая задача» был в один клик.
   */
  const handleToggleClosed = () => {
    const next = !isCompleted;
    toggleTask.mutate(
      { id: taskId, is_completed: next },
      {
        onSuccess: () => {
          if (next) {
            toast.success("Задача закрыта");
            // Сразу подсказываем создать продолжение.
            setFollowUpFormOpen(true);
          } else {
            toast.success("Задача снова открыта");
            setFollowUpFormOpen(false);
          }
        },
        onError: (e: any) => toast.error(e?.message || "Не удалось обновить статус"),
      },
    );
  };

  /**
   * Создать задачу-продолжение (follow_up_of = текущая задача).
   * Копируем group_id и оставляем системные карточки в обоих чатах
   * для двусторонней навигации:
   *  - в чате источника:    `__sys_task_followup__:<newId>|<newTitle>`
   *  - в чате новой задачи: `__sys_task_source__:<srcId>|<srcTitle>`
   */
  const handleCreateFollowUp = async (
    payload: { title: string; assigneeId: string | null; deadline: Date | null },
  ) => {
    if (!user) return;
    setCreatingFollowUp(true);
    try {
      // group_id: используем переданный prop, иначе подтягиваем из исходной задачи.
      let groupId = groupIdProp ?? null;
      if (groupId === null && groupIdProp === undefined) {
        const { data: srcTask } = await supabase
          .from("tasks").select("group_id").eq("id", taskId).maybeSingle();
        groupId = (srcTask as any)?.group_id ?? null;
      }

      const desc = `🔁 Продолжение задачи «${taskTitle}»\n\nИсходная задача закрыта ${format(new Date(), "d MMM yyyy, HH:mm", { locale: ru })}.`;

      const { data: newTask, error: insErr } = await supabase
        .from("tasks")
        .insert({
          title: payload.title.trim() || `Продолжение: ${taskTitle.slice(0, 60)}`,
          description: desc,
          group_id: groupId,
          user_id: user.id,
          assigned_to: payload.assigneeId,
          deadline: payload.deadline ? payload.deadline.toISOString() : null,
          start_at: new Date().toISOString(),
          follow_up_of: taskId,
        } as any)
        .select()
        .single();
      if (insErr) throw insErr;

      await supabase.from("task_participants").insert({
        task_id: newTask.id,
        user_id: user.id,
        role: "creator",
      });

      // Системная карточка в чате источника — «закрыта → продолжение Y».
      await supabase.from("task_comments").insert({
        task_id: taskId,
        user_id: user.id,
        content: `${SYS_FOLLOWUP_PREFIX}${newTask.id}|${newTask.title}`,
      });

      // Обратная карточка в чате новой задачи — «продолжение задачи X».
      await supabase.from("task_comments").insert({
        task_id: newTask.id,
        user_id: user.id,
        content: `${SYS_SOURCE_PREFIX}${taskId}|${taskTitle}`,
      });

      qc.invalidateQueries({ queryKey: ["task_comments", taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task_statuses"] });
      toast.success("Связанная задача создана");
      setFollowUpFormOpen(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Не удалось создать связанную задачу");
    } finally {
      setCreatingFollowUp(false);
    }
  };

  /**
   * Создаёт задачу на основе комментария и оставляет «системные» отметки:
   * 1) Комментарий-разделитель в чате текущей задачи (источник).
   * 2) Первая строка в `description` новой задачи со ссылкой на источник.
   * 3) Комментарий-разделитель в чате новой задачи с цитатой исходного сообщения.
   */
  const handleCreateTaskFromComment = async (
    sourceComment: TaskComment,
    payload: { title: string; assigneeId: string | null; deadline: Date | null },
  ) => {
    if (!user) return;
    setCreatingTask(true);
    try {
      // 1) Получаем group_id исходной задачи
      const { data: srcTask, error: srcErr } = await supabase
        .from("tasks")
        .select("group_id")
        .eq("id", taskId)
        .single();
      if (srcErr) throw srcErr;

      const quote = sourceComment.content.slice(0, 200);
      const desc = `📌 Источник: задача «${taskTitle}» · из обсуждения от ${format(parseISO(sourceComment.created_at), "d MMM yyyy, HH:mm", { locale: ru })}\n\n> ${quote}`;

      // 2) Создаём новую задачу (тот же проект, тот же владелец)
      const { data: newTask, error: insErr } = await supabase
        .from("tasks")
        .insert({
          title: payload.title.trim() || sourceComment.content.slice(0, 80),
          description: desc,
          group_id: srcTask?.group_id ?? null,
          user_id: user.id,
          assigned_to: payload.assigneeId,
          deadline: payload.deadline ? payload.deadline.toISOString() : null,
          start_at: new Date().toISOString(),
        } as any)
        .select()
        .single();
      if (insErr) throw insErr;

      // creator-participant (для RLS)
      await supabase.from("task_participants").insert({
        task_id: newTask.id,
        user_id: user.id,
        role: "creator",
      });

      // 3) Системное сообщение в чате источника
      await supabase.from("task_comments").insert({
        task_id: taskId,
        user_id: user.id,
        content: `${SYS_PREFIX}${newTask.id}|${newTask.title}`,
      });

      // 4) Системное сообщение-разделитель в чате новой задачи
      await supabase.from("task_comments").insert({
        task_id: newTask.id,
        user_id: user.id,
        content: `${SYS_PREFIX}${taskId}|из «${taskTitle}»`,
      });

      qc.invalidateQueries({ queryKey: ["task_comments", taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Задача создана");
      setTaskFormForCommentId(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Не удалось создать задачу");
    } finally {
      setCreatingTask(false);
    }
  };

  const isFull = variant === "full";

  /** Видимые комментарии под текущую вкладку. */
  const visibleComments = useMemo(() => {
    return comments.filter((c) => {
      const k = (c.kind ?? (parseAnySystemMessage(c.content) ? "system" : "message")) as
        | "message" | "system" | "log";
      if (tab === "log") return k === "log";
      if (tab === "chat") return k !== "log";
      return true;
    });
  }, [comments, tab]);
  const logCount = useMemo(() => comments.filter((c) => c.kind === "log").length, [comments]);
  const chatCount = comments.length - logCount;

  const messagesContent = (
    isLoading ? (
      <p className={cn("text-muted-foreground text-center", isFull ? "text-sm py-8" : "text-xs py-4")}>Загрузка...</p>
    ) : visibleComments.length === 0 ? (
      <div className={cn("text-center", isFull ? "py-12" : "py-6")}>
        <MessageCircle className={cn("text-muted-foreground/20 mx-auto", isFull ? "h-10 w-10 mb-3" : "h-8 w-8 mb-2")} />
        <p className={cn("text-muted-foreground", isFull ? "text-sm" : "text-xs text-muted-foreground/60")}>
          {tab === "log" ? "Изменений пока нет" : "Начните обсуждение"}
        </p>
      </div>
    ) : (
      <div className="space-y-2.5">
        {visibleComments.map(c => {
          // Лог-запись — компактная серая строка с иконкой.
          // Доп. защита: некоторые старые записи могут прийти без kind,
          // но с маркером content="__log__" и meta.changes — их тоже рендерим как лог.
          const isLogEntry =
            c.kind === "log" ||
            c.content === "__log__" ||
            !!(c.meta && Array.isArray((c.meta as any).changes) && (c.meta as any).changes.length > 0);
          if (isLogEntry) {
            return (
              <LogEntry
                key={c.id}
                comment={c}
                authorName={getProfileName(c.user_id)}
                availableUsers={availableUsers}
              />
            );
          }
          const sys = parseAnySystemMessage(c.content);

          // Системное сообщение → тонкая строка-разделитель по центру.
          if (sys) {
            return (
              <SystemDivider
                key={c.id}
                kind={sys.kind}
                title={sys.title}
                isCompleted={taskStatusMap?.get(sys.taskId) ?? false}
                onClick={onNavigateToTask ? () => onNavigateToTask(sys.taskId) : undefined}
              />
            );
          }

          const isOwn = c.user_id === user?.id;
          const name = getProfileName(c.user_id);
          const actions: ChatAction[] = [
            {
              icon: Reply,
              onClick: () => startReply(c),
              title: "Ответить",
              tone: "default",
            },
            {
              icon: CheckSquare,
              onClick: () => setTaskFormForCommentId(prev => (prev === c.id ? null : c.id)),
              title: "Создать задачу из сообщения",
              tone: "primary",
            },
          ];
          if (isOwn) {
            actions.push({
              icon: Trash2,
              onClick: () => deleteComment.mutate({ id: c.id, task_id: taskId }),
              title: "Удалить",
              tone: "danger",
            });
          }
          // Цитата исходного сообщения (если это ответ).
          const parent = c.reply_to ? commentsById.get(c.reply_to) : undefined;
          const parentQuote = c.reply_to ? (
            <button
              type="button"
              onClick={() => parent && openReplyContext(parent.id)}
              className={cn(
                "mb-1 flex items-start gap-1 rounded-md border-l-2 border-primary/40 bg-primary/5 px-2 py-1 text-left transition-colors",
                parent ? "hover:bg-primary/10" : "opacity-60 cursor-default",
              )}
              title={parent ? "Открыть исходное сообщение" : undefined}
            >
              <CornerDownRight className="h-3 w-3 mt-0.5 shrink-0 text-primary/70" />
              <span className="min-w-0">
                <span className="block text-[10px] font-medium text-primary/80">
                  {parent ? getProfileName(parent.user_id) : "Сообщение удалено"}
                </span>
                {parent && (
                  <span className="block text-[11px] text-muted-foreground truncate max-w-[220px]">
                    {parent.content}
                  </span>
                )}
              </span>
            </button>
          ) : null;
          return (
            <div
              key={c.id}
              id={`tc-msg-${taskId}-${c.id}`}
              className={cn(
                "rounded-md transition-colors",
                highlightId === c.id && "bg-primary/10 ring-1 ring-primary/30",
              )}
            >
            <ChatMessageRow
              authorName={name}
              isOwn={isOwn}
              createdAt={c.created_at}
              content={
                <>
                  {parentQuote}
                  <p className={cn("text-sm leading-relaxed break-words whitespace-pre-wrap", isOwn ? "text-foreground" : "text-foreground/90")}>
                    {c.content}
                  </p>
                </>
              }
              messageType="task_comment"
              messageId={c.id}
              reactions={reactionsByMsg[c.id]}
              actions={actions}
              isReply={!!c.reply_to}
            >
              {taskFormForCommentId === c.id && (
                <InlineCreateTaskForm
                  source={c}
                  availableUsers={availableUsers}
                  defaultAssigneeId={user?.id || null}
                  onCancel={() => setTaskFormForCommentId(null)}
                  onSubmit={(payload) => handleCreateTaskFromComment(c, payload)}
                  isSubmitting={creatingTask}
                />
              )}
            </ChatMessageRow>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    )
  );

  /** Панель переключения вкладок Чат / Лог / Всё. */
  const tabsBar = (
    <div className={cn("flex items-center gap-1 shrink-0", isFull ? "px-4 pt-2" : "px-3 pt-2")}>
      {(
        [
          { key: "chat", label: "Чат", count: chatCount, icon: MessageCircle },
          { key: "log",  label: "Лог",  count: logCount,  icon: History },
          { key: "all",  label: "Всё",  count: comments.length, icon: null },
        ] as const
      ).map(({ key, label, count, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
            tab === key
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {Icon && <Icon className="h-3 w-3" />}
          {label}
          {count > 0 && <span className="opacity-60">{count}</span>}
        </button>
      ))}
    </div>
  );

  /**
   * Кнопка «Закрыть/Открыть» + (после закрытия) inline-форма продолжения.
   * Рендерится в обоих вариантах (inline и full) — даёт единый воркфлоу
   * «закрыл → создал связанную» прямо из чата.
   */
  const showActionWrapper = showCloseAction || followUpFormOpen;
  const closeAction = showActionWrapper ? (
    <div className={cn("flex flex-col gap-2 shrink-0", isFull ? "px-4 pt-2" : "px-3 pt-2")}>
      {showCloseAction && (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggleClosed}
          disabled={toggleTask.isPending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
            isCompleted
              ? "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
          )}
          title={isCompleted ? "Снова открыть задачу" : "Закрыть задачу"}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {isCompleted ? "Открыть снова" : "Закрыть задачу"}
        </button>
        {!followUpFormOpen && (
          <button
            type="button"
            onClick={() => setFollowUpFormOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors"
            title="Создать задачу-продолжение"
          >
            <Plus className="h-3.5 w-3.5" />
            Связанная задача
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
      )}
      {followUpFormOpen && (
        <InlineCreateTaskForm
          source={{
            id: taskId,
            task_id: taskId,
            content: `Продолжение: ${taskTitle}`,
            user_id: user?.id || "",
            created_at: new Date().toISOString(),
          } as TaskComment}
          availableUsers={availableUsers}
          defaultAssigneeId={user?.id || null}
          onCancel={() => setFollowUpFormOpen(false)}
          onSubmit={(p) => handleCreateFollowUp({
            title: p.title,
            assigneeId: p.assigneeId,
            deadline: p.deadline,
          })}
          isSubmitting={creatingFollowUp}
        />
      )}
    </div>
  ) : null;

  const inputForm = (
    <div className="shrink-0 border-t border-border">
      {replyTo && (
        <div className={cn(
          "flex items-center gap-2 text-xs text-muted-foreground bg-muted/50",
          isFull ? "px-4 py-2" : "px-3 py-1.5",
        )}>
          <Reply className="h-3 w-3 shrink-0 text-primary" />
          <span className="truncate">
            Ответ: <span className="font-medium text-foreground/80">{getProfileName(replyTo.user_id)}</span> — {replyTo.content.slice(0, 50)}
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="ml-auto shrink-0 hover:text-foreground"
            aria-label="Отменить ответ"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    <form
      onSubmit={e => { e.preventDefault(); handleSend(); }}
      className={cn(
        "relative flex items-center gap-2",
        isFull
          ? "px-4 py-3"
          : "px-3 py-2 bg-card/50"
      )}
    >
      <MentionAutocomplete
        value={draft}
        users={availableUsers}
        onPick={(u) => {
          const label = userMentionLabel(u);
          const m = draft.match(/@([A-Za-zА-Яа-яЁё0-9_.\-]*)$/);
          const base = m ? draft.slice(0, draft.length - m[0].length) : draft;
          setDraft(`${base}@${label} `);
        }}
      />
      <Input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder={replyTo ? "Ответить... (@ — упомянуть)" : "Написать... (@ — упомянуть)"}
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
    </div>
  );

  // Full variant: занимает всю высоту контейнера, без обёртки
  if (isFull) {
    return (
      <div className="flex flex-col h-full">
        {tabsBar}
        {closeAction}
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <MessageCircle className="h-3 w-3" /> Чат {chatCount > 0 && `(${chatCount})`}
          {isCompleted && <ClosedTaskPill className="ml-1" />}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
        {tabsBar}
        {closeAction}
        <ScrollArea className="max-h-64 px-3 py-2">
          {messagesContent}
        </ScrollArea>
        {inputForm}
      </div>
    </div>
  );
}

/**
 * Системный разделитель в стиле Slack «New messages».
 * Тонкая горизонтальная линия с центральной пилюлей-ссылкой.
 */
function SystemDivider({
  title, onClick, isCompleted, kind = "created",
}: {
  title: string;
  onClick?: () => void;
  isCompleted?: boolean;
  kind?: "created" | "followup" | "source";
}) {
  const label =
    kind === "followup" ? "Закрыта → продолжение:" :
    kind === "source"   ? "Продолжение задачи:" :
                          "Создана задача:";
  const Icon = kind === "source" ? ArrowRight : kind === "followup" ? CheckCircle2 : CheckSquare;
  const tone =
    kind === "followup" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" :
    kind === "source"   ? "bg-primary/10 text-primary" :
                          "bg-primary/10 text-primary";
  const lineTone =
    kind === "followup" ? "bg-amber-500/30" :
    kind === "source"   ? "bg-primary/20" :
                          "bg-primary/20";

  const content = (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium", tone)}>
      <Icon className="h-2.5 w-2.5" />
      {label}{" "}
      <span
        className={cn(
          "font-semibold truncate max-w-[180px]",
          isCompleted && "line-through opacity-70",
        )}
      >
        {title}
      </span>
      {isCompleted && <ClosedTaskPill className="ml-1" />}
    </span>
  );
  return (
    <div className="flex items-center gap-2 py-1">
      <div className={cn("flex-1 h-px", lineTone)} />
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="hover:opacity-80 transition-opacity"
          title="Открыть задачу"
        >
          {content}
        </button>
      ) : (
        content
      )}
      <div className={cn("flex-1 h-px", lineTone)} />
    </div>
  );
}

/**
 * Inline-форма для создания задачи из конкретного сообщения чата.
 * Заголовок предзаполняется первыми 80 символами сообщения,
 * ответственный — текущий пользователь, дедлайн — опционально.
 */
function InlineCreateTaskForm({
  source,
  availableUsers,
  defaultAssigneeId,
  onCancel,
  onSubmit,
  isSubmitting,
}: {
  source: TaskComment;
  availableUsers: Profile[];
  defaultAssigneeId: string | null;
  onCancel: () => void;
  onSubmit: (payload: { title: string; assigneeId: string | null; deadline: Date | null }) => void;
  isSubmitting: boolean;
}) {
  const [title, setTitle] = useState(() => source.content.slice(0, 80));
  const [assigneeId, setAssigneeId] = useState<string | null>(defaultAssigneeId);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);

  const assignee = availableUsers.find(u => u.id === assigneeId) || null;

  return (
    <div className="mt-2 ml-[22px] p-2.5 rounded-lg bg-card border border-primary/30 space-y-2 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <CheckSquare className="h-3 w-3 text-primary" />
        <span>Новая задача из сообщения</span>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          title="Отмена"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название задачи..."
        className="h-8 text-xs"
        disabled={isSubmitting}
        onKeyDown={(e) => {
          if (e.key === "Enter" && title.trim()) {
            e.preventDefault();
            onSubmit({ title, assigneeId, deadline });
          }
          if (e.key === "Escape") onCancel();
        }}
      />

      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Ассайни */}
        <UserPicker
          users={availableUsers}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={(u) => {
            setAssigneeId(u.id);
            setPickerOpen(false);
          }}
          side="bottom"
          trigger={
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors",
                assignee
                  ? "border-primary/30 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <UserIcon className="h-3 w-3" />
              {assignee?.display_name || assignee?.email?.split("@")[0] || "Ответственный"}
            </button>
          }
        />

        {/* Дедлайн */}
        <Popover open={calOpen} onOpenChange={setCalOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors",
                deadline
                  ? "border-primary/30 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarIcon className="h-3 w-3" />
              {deadline ? format(deadline, "d MMM", { locale: ru }) : "Срок"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-[60]" align="start">
            <Calendar
              mode="single"
              selected={deadline || undefined}
              onSelect={(d) => {
                setDeadline(d || null);
                setCalOpen(false);
              }}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={() => onSubmit({ title, assigneeId, deadline })}
          disabled={!title.trim() || isSubmitting}
          className="ml-auto text-[10px] px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
        >
          {isSubmitting ? "Создаю..." : "Создать"}
        </button>
      </div>
    </div>
  );
}

/**
 * Компактная серая строка лог-записи в ленте чата.
 * Отрисовывает все изменения из meta.changes одной строкой.
 */
function LogEntry({
  comment,
  authorName,
  availableUsers,
}: {
  comment: TaskComment;
  authorName: string;
  availableUsers: Profile[];
}) {
  const changes = comment.meta?.changes || [];
  const fmtVal = (field: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (field === "deadline" && typeof v === "string") {
      try { return format(parseISO(v), "d MMM yyyy", { locale: ru }); } catch { return String(v); }
    }
    if (field === "assigned_to" && typeof v === "string") {
      return availableUsers.find((u) => u.id === v)?.display_name || "—";
    }
    if (field === "is_completed") return v ? "закрыта" : "открыта";
    if (typeof v === "boolean") return v ? "да" : "нет";
    return String(v);
  };
  const fieldLabel: Record<string, string> = {
    deadline: "срок",
    assigned_to: "ответственный",
    is_completed: "статус",
    approval_status: "согласование",
    group_id: "проект",
    priority: "приоритет",
  };
  return (
    <div className="flex items-start gap-1.5 py-0.5 text-[11px] text-muted-foreground">
      <History className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
      <span className="opacity-60 shrink-0">{format(parseISO(comment.created_at), "d MMM, HH:mm", { locale: ru })}</span>
      <span className="opacity-80 shrink-0">{authorName}:</span>
      <span className="flex-1 break-words">
        {changes.map((ch, i) => (
          <span key={i}>
            {i > 0 && "; "}
            <span className="text-foreground/70">{fieldLabel[ch.field] || ch.field}</span>{" "}
            <span className="line-through opacity-60">{fmtVal(ch.field, ch.old)}</span>{" → "}
            <span className="text-foreground">{fmtVal(ch.field, ch.new)}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

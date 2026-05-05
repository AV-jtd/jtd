import { useState, useRef, useEffect, useMemo } from "react";
import { useTaskComments, useCommentMutations, TaskComment } from "@/hooks/useComments";
import { useAuth } from "@/hooks/useAuth";
import { Profile, useTaskMutations } from "@/hooks/useTasks";
import { Send, Trash2, MessageCircle, CheckSquare, X, CalendarIcon, User as UserIcon, CheckCircle2, ArrowRight, Plus } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getInitials, getAvatarColors } from "@/lib/initials";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import UserPicker from "./UserPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ReactionChips, ReactionAddButton } from "./MessageReactions";
import { useMessageReactions } from "@/hooks/useMessageReactions";
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

function formatMsgDate(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Вчера, ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm", { locale: ru });
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

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    addComment.mutate({ task_id: taskId, content: text });
    setDraft("");
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
                {/* Inline-чипы реакций: в одной строке с автором и временем */}
                <ReactionChips
                  messageType="task_comment"
                  messageId={c.id}
                  reactions={reactionsByMsg[c.id]}
                  size="xs"
                />
                {/* Кнопка добавления реакции: inline, всегда видна (в т.ч. на мобиле). */}
                <ReactionAddButton
                  messageType="task_comment"
                  messageId={c.id}
                  reactions={reactionsByMsg[c.id]}
                  className="ml-0.5"
                />
                {/* Кнопки действий — в одну группу справа */}
                <div className="ml-auto flex items-center gap-0.5 shrink-0 opacity-100 md:opacity-0 md:group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button
                  type="button"
                  onClick={() =>
                    setTaskFormForCommentId(prev => (prev === c.id ? null : c.id))
                  }
                    className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                  title="Создать задачу из сообщения"
                  aria-label="Создать задачу из сообщения"
                >
                  <CheckSquare className="h-3 w-3" />
                </button>
                  {isOwn && (
                    <button
                      onClick={() => deleteComment.mutate({ id: c.id, task_id: taskId })}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Удалить"
                      aria-label="Удалить"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className={cn("flex items-start gap-1", isFull ? "pl-[22px]" : "ml-5.5 pl-[22px]")}>
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground/90 flex-1">
                  {c.content}
                </p>
              </div>

              {/* Inline-форма создания задачи из этого сообщения */}
              {taskFormForCommentId === c.id && (
                <InlineCreateTaskForm
                  key={c.id}
                  source={c}
                  availableUsers={availableUsers}
                  defaultAssigneeId={user?.id || null}
                  onCancel={() => setTaskFormForCommentId(null)}
                  onSubmit={(payload) => handleCreateTaskFromComment(c, payload)}
                  isSubmitting={creatingTask}
                />
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    )
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
          <MessageCircle className="h-3 w-3" /> Чат {comments.length > 0 && `(${comments.length})`}
          {isCompleted && <ClosedTaskPill className="ml-1" />}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
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

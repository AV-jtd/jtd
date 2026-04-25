import { useState, useRef, useEffect } from "react";
import { useTaskComments, useCommentMutations, TaskComment } from "@/hooks/useComments";
import { useAuth } from "@/hooks/useAuth";
import { Profile } from "@/hooks/useTasks";
import { Send, Trash2, MessageCircle, CheckSquare, X, CalendarIcon, User as UserIcon } from "lucide-react";
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

/** Префикс системных сообщений в чате задач/комментариев. */
const SYS_PREFIX = "__sys_task_created__:";

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
}

function formatMsgDate(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Вчера, ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm", { locale: ru });
}

export default function TaskChat({ taskId, taskTitle, availableUsers, variant = "inline", onNavigateToTask }: TaskChatProps) {
  const { user } = useAuth();
  const { data: comments = [], isLoading } = useTaskComments(taskId);
  const { addComment, deleteComment } = useCommentMutations();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  /** Сообщение, для которого открыта inline-форма создания задачи. */
  const [taskFormForCommentId, setTaskFormForCommentId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

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
          const sys = parseSystemMessage(c.content);

          // Системное сообщение → тонкая строка-разделитель по центру
          if (sys) {
            return (
              <SystemDivider
                key={c.id}
                title={sys.title}
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
                {/* Кнопка «Создать задачу из сообщения» */}
                <button
                  type="button"
                  onClick={() =>
                    setTaskFormForCommentId(prev => (prev === c.id ? null : c.id))
                  }
                  className="ml-auto opacity-0 group-hover/msg:opacity-100 focus:opacity-100 p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-opacity shrink-0"
                  title="Создать задачу из сообщения"
                >
                  <CheckSquare className="h-3 w-3" />
                </button>
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

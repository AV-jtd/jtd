import { useMemo } from "react";
import { useTaskComments } from "@/hooks/useComments";
import { useAuth } from "@/hooks/useAuth";
import { ChevronDown, ChevronRight, ListTodo, SquareArrowOutUpRight, MessageCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { ru } from "date-fns/locale";
import type { Profile } from "@/hooks/useTasks";
import type { ClientTaskThread } from "@/hooks/useClientTaskThreads";

/** Сколько последних сообщений показываем в развёрнутом превью. */
const PREVIEW_LIMIT = 10;

function isSystemContent(content: string): boolean {
  return content.startsWith("__sys_");
}

/**
 * Карточка-ветка чата задачи внутри ленты комнаты клиента.
 * Свёрнуто: иконка + название задачи + счётчик + превью последнего сообщения.
 * Развёрнуто: ленивая подгрузка последних сообщений + «Открыть чат задачи».
 */
export default function ClientTaskThreadCard({
  thread,
  expanded,
  onToggle,
  onOpen,
  availableUsers,
}: {
  thread: ClientTaskThread;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  availableUsers: Profile[];
}) {
  const { user } = useAuth();
  const { data: comments = [], isLoading } = useTaskComments(expanded ? thread.taskId : null);

  const previewMessages = useMemo(() => {
    const live = comments.filter(
      (c) => c.kind !== "log" && c.kind !== "system" && !isSystemContent(c.content),
    );
    return live.slice(-PREVIEW_LIMIT);
  }, [comments]);

  const nameFor = (uid: string) =>
    availableUsers.find((u) => u.id === uid)?.display_name || uid.slice(0, 6);

  const lastRel = thread.lastMessageAt
    ? formatDistanceToNowStrict(new Date(thread.lastMessageAt), { addSuffix: true, locale: ru })
    : null;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card transition-colors",
        expanded ? "border-primary/30" : "border-border hover:border-primary/20",
      )}
    >
      {/* header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ListTodo className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={cn("truncate text-sm font-semibold", thread.isCompleted && "line-through text-muted-foreground")}>
              {thread.title}
            </span>
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              <MessageCircle className="h-2.5 w-2.5" />
              {thread.messageCount}
            </span>
          </div>
          {!expanded && thread.lastMessage && (
            <div className="truncate text-xs text-muted-foreground">
              {thread.lastMessageAuthor && <span className="font-medium">{thread.lastMessageAuthor}: </span>}
              {thread.lastMessage}
              {lastRel && <span className="text-muted-foreground/60"> · {lastRel}</span>}
            </div>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* expanded preview */}
      {expanded && (
        <div className="border-t border-border px-3 py-2 animate-fade-in">
          {isLoading && (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка сообщений…
            </div>
          )}
          {!isLoading && previewMessages.length === 0 && (
            <div className="py-2 text-xs text-muted-foreground">Нет сообщений</div>
          )}
          {!isLoading && previewMessages.length > 0 && (
            <div className="space-y-1.5">
              {previewMessages.map((m) => (
                <div key={m.id} className="text-xs">
                  <span className="font-medium text-foreground/80">{nameFor(m.user_id)}</span>
                  <span className="text-muted-foreground/60">
                    {" · "}
                    {formatDistanceToNowStrict(new Date(m.created_at), { addSuffix: true, locale: ru })}
                  </span>
                  <div className="text-foreground/90">{m.content}</div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={onOpen}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Открыть чат задачи <SquareArrowOutUpRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

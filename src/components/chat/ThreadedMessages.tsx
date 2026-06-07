import { ReactNode, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Reply } from "lucide-react";

/**
 * Минимальный контракт сообщения, достаточный для построения дерева тредов.
 * Конкретный рендер пузыря/карточки делегируется наружу через render-пропы,
 * поэтому ThreadedMessages ничего не знает о форме данных проекта/задачи.
 */
export interface ThreadableMessage {
  id: string;
  content: string;
  user_id?: string | null;
  reply_to?: string | null;
}

export interface MessageRenderContext {
  isReply: boolean;
  isRoot: boolean;
  isOwn: boolean;
  onReply: (messageId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete: (messageId: string) => void;
  onCreateTask?: (messageId: string, content: string) => void;
}

interface ThreadedMessagesProps<M extends ThreadableMessage> {
  /** Полный список сообщений (root + ответы), в хронологическом порядке. */
  messages: M[];
  currentUserId: string;
  onReply: (messageId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onDelete: (messageId: string) => void;
  onCreateTask?: (messageId: string, content: string) => void;
  /** Сообщение для кратковременной подсветки (из поиска / открытия контекста). */
  highlightMessageId?: string | null;
  /** Рендер собственно пузыря/карточки сообщения. */
  renderMessage: (message: M, ctx: MessageRenderContext) => ReactNode;
  /** Доп. контент после пузыря: системные карточки, inline-формы, AI-полоски. */
  renderExtra?: (message: M, ctx: { isReply: boolean }) => ReactNode;
  /**
   * Переопределение списка корневых сообщений (уже отфильтрованных/упорядоченных
   * вызывающей стороной — например, результат поиска по чату). По умолчанию —
   * все сообщения без reply_to.
   */
  roots?: M[];
  /** Управляемое раскрытие тредов. Если не передано — используется внутренний state. */
  expandedThreadIds?: Set<string>;
  onToggleThread?: (rootId: string) => void;
  /** DOM-id для обёртки сообщения (для scroll/подсветки). */
  getMessageDomId?: (message: M) => string;
  /** Имя автора — используется в заголовке-цитате ответа второго уровня. */
  getAuthorName?: (message: M) => string;
  className?: string;
}

const pluralReplies = (n: number) =>
  `${n} ${n === 1 ? "ответ" : n < 5 ? "ответа" : "ответов"}`;

/**
 * Разделяемый компонент рендеринга сообщений в виде дерева тредов
 * (root-сообщения + их ответы, до 2 уровней вложенности).
 *
 * Уровень 1: корневое сообщение. Если у него есть ответы — показывается
 * сворачиваемый тред «N ответов» с вертикальной веткой (border слева).
 * Уровень 2: ответы выводятся с отступом. Ответы на ответы не вкладываются
 * глубже — показываются плоско в том же треде с заголовком-цитатой
 * «↩ ответ @username».
 */
export default function ThreadedMessages<M extends ThreadableMessage>({
  messages,
  currentUserId,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onCreateTask,
  highlightMessageId,
  renderMessage,
  renderExtra,
  roots,
  expandedThreadIds,
  onToggleThread,
  getMessageDomId,
  getAuthorName,
  className,
}: ThreadedMessagesProps<M>) {
  const byId = useMemo(() => {
    const map = new Map<string, M>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Корневой предок сообщения: поднимаемся по reply_to, пока он указывает на
  // существующее сообщение. Это позволяет схлопнуть ответы-на-ответы в один
  // тред (плоская «лента продолжения»), не теряя ни одного сообщения.
  const rootIdOf = useMemo(() => {
    const cache = new Map<string, string>();
    const resolve = (m: M): string => {
      let cur: M | undefined = m;
      const seen = new Set<string>();
      while (cur && cur.reply_to && byId.has(cur.reply_to) && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = byId.get(cur.reply_to);
      }
      return cur ? cur.id : m.id;
    };
    for (const m of messages) cache.set(m.id, resolve(m));
    return cache;
  }, [messages, byId]);

  // Ответы каждого треда (все потомки), в исходном порядке messages.
  const repliesMap = useMemo(() => {
    const map = new Map<string, M[]>();
    for (const m of messages) {
      const root = rootIdOf.get(m.id);
      if (!root || root === m.id) continue;
      if (!map.has(root)) map.set(root, []);
      map.get(root)!.push(m);
    }
    return map;
  }, [messages, rootIdOf]);

  const rootList = useMemo(
    () => roots ?? messages.filter((m) => !m.reply_to || !byId.has(m.reply_to)),
    [roots, messages, byId],
  );

  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(new Set());
  const expanded = expandedThreadIds ?? internalExpanded;
  const toggle = (id: string) => {
    if (onToggleThread) onToggleThread(id);
    else
      setInternalExpanded((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
  };

  const ctxFor = (m: M, isReply: boolean, isRoot: boolean): MessageRenderContext => ({
    isReply,
    isRoot,
    isOwn: !!currentUserId && m.user_id === currentUserId,
    onReply,
    onReact,
    onEdit,
    onDelete,
    onCreateTask,
  });

  const Wrapper = ({ message, children }: { message: M; children: ReactNode }) => (
    <div
      id={getMessageDomId?.(message)}
      className={cn(
        "group rounded-md transition-colors",
        highlightMessageId === message.id && "ring-1 ring-primary/30 animate-msg-flash",
      )}
    >
      {children}
    </div>
  );

  return (
    <div className={cn("space-y-3", className)}>
      {rootList.map((root) => {
        const replies = repliesMap.get(root.id) ?? [];
        const isExpanded = expanded.has(root.id);

        return (
          <Wrapper key={root.id} message={root}>
            {renderMessage(root, ctxFor(root, false, true))}
            {renderExtra?.(root, { isReply: false })}

            {replies.length > 0 && (
              <button
                onClick={() => toggle(root.id)}
                className="ml-4 mt-1 flex items-center gap-1.5 text-xs text-primary transition-colors hover:text-primary/80"
              >
                <Reply className="h-3 w-3" />
                {isExpanded ? "Скрыть" : `${pluralReplies(replies.length)} ↓`}
              </button>
            )}

            {isExpanded && replies.length > 0 && (
              <div className="ml-3 mt-1.5 space-y-1.5 border-l-2 border-primary/50 pl-3">
                <div className="truncate text-[10px] italic text-muted-foreground/70">
                  ↳ ответ на «{root.content.slice(0, 60)}
                  {root.content.length > 60 ? "…" : ""}»
                </div>
                {replies.map((reply) => {
                  // Ответ на ответ (второй уровень) — плоская лента-продолжение
                  // с заголовком-цитатой «↩ ответ @username».
                  const parentId = reply.reply_to;
                  const isSecondLevel = parentId && parentId !== root.id;
                  const parent = parentId ? byId.get(parentId) : undefined;
                  const parentName = parent && getAuthorName ? getAuthorName(parent) : null;
                  return (
                    <Wrapper key={reply.id} message={reply}>
                      {isSecondLevel && parentName && (
                        <div className="mb-0.5 truncate text-[10px] text-muted-foreground/70">
                          ↩ ответ <span className="text-primary/80">@{parentName}</span>
                        </div>
                      )}
                      {renderMessage(reply, ctxFor(reply, true, false))}
                      {renderExtra?.(reply, { isReply: true })}
                    </Wrapper>
                  );
                })}
              </div>
            )}
          </Wrapper>
        );
      })}
    </div>
  );
}
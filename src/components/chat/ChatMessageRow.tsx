import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ReactionChips, ReactionAddButton } from "../MessageReactions";
import type { MessageType, ReactionAgg } from "@/hooks/useMessageReactions";
import ChatAvatar from "./ChatAvatar";

/** Бейдж канала-источника сообщения. */
export function sourceBadge(source?: string | null): string | null {
  if (source === "telegram") return "✈️";
  if (source === "max") return "🅜";
  return null;
}

export function formatChatDate(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Вчера, ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm", { locale: ru });
}

export interface ChatAction {
  icon: LucideIcon;
  onClick: () => void;
  title: string;
  tone?: "default" | "primary" | "danger";
}

const TONE: Record<NonNullable<ChatAction["tone"]>, string> = {
  default: "hover:bg-muted text-muted-foreground hover:text-foreground",
  primary: "hover:bg-primary/10 text-muted-foreground hover:text-primary",
  danger: "hover:bg-destructive/10 text-muted-foreground hover:text-destructive",
};

/**
 * Единая строка сообщения для чата задачи и чата проекта:
 * аватар · имя · бейдж источника · время · реакции · действия (hover) → текст.
 * Дополнительный контент (формы, карточки) передаётся через `children`.
 */
export default function ChatMessageRow({
  authorName,
  isOwn,
  createdAt,
  content,
  messageType,
  messageId,
  reactions,
  source,
  actions = [],
  isReply,
  children,
}: {
  authorName: string;
  isOwn?: boolean;
  createdAt: string;
  content: ReactNode;
  messageType: MessageType;
  messageId: string;
  reactions?: ReactionAgg;
  source?: string | null;
  actions?: ChatAction[];
  isReply?: boolean;
  children?: ReactNode;
}) {
  const badge = sourceBadge(source);
  return (
    <div className={cn("group/msg relative", isReply ? "" : "")}>
      <div className="flex items-center gap-1.5 pr-16 flex-wrap">
        <ChatAvatar name={authorName} />
        <span className={cn("text-xs font-medium", isOwn ? "text-primary" : "text-foreground/70")}>
          {authorName}
        </span>
        {badge && <span className="text-xs" title={source ?? undefined}>{badge}</span>}
        <span className="text-[10px] text-muted-foreground/60">{formatChatDate(createdAt)}</span>
        <ReactionChips messageType={messageType} messageId={messageId} reactions={reactions} size="xs" />
        <ReactionAddButton messageType={messageType} messageId={messageId} reactions={reactions} className="ml-0.5" />
      </div>

      <div className="pl-[26px]">
        {typeof content === "string" ? (
          <p className={cn("text-sm leading-relaxed break-words whitespace-pre-wrap", isOwn ? "text-foreground" : "text-foreground/90")}>
            {content}
          </p>
        ) : (
          content
        )}
        {children}
      </div>

      {actions.length > 0 && (
        <div className="pointer-events-none absolute top-0 right-0 z-10 opacity-100 md:opacity-0 md:group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
          <div className="pointer-events-auto flex items-center gap-0.5 rounded-md bg-card/95 backdrop-blur-sm border border-border shadow-sm px-1 py-0.5">
            {actions.map((a, i) => {
              const Icon = a.icon;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={a.onClick}
                  className={cn("p-1 rounded", TONE[a.tone ?? "default"])}
                  title={a.title}
                  aria-label={a.title}
                >
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export type { MessageType, ReactionAgg };
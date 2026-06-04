import { cn } from "@/lib/utils";
import ClosedTaskPill from "../ClosedTaskPill";
import type { ParsedChatCard } from "@/lib/chatCards";

/**
 * Обобщённая system-карточка-разделитель в ленте чата (горизонтальная линия +
 * центральная пилюля с иконкой). Тип/иконка/тон берутся из реестра chatCards,
 * поэтому новые типы карточек появляются здесь автоматически.
 */
export default function SystemCard({
  card,
  onClick,
  isCompleted,
}: {
  card: ParsedChatCard;
  onClick?: () => void;
  isCompleted?: boolean;
}) {
  const { def } = card;
  const Icon = def.icon;

  const content = (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-[calc(100vw-5.5rem)] items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium sm:max-w-[280px]",
        def.tone,
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="shrink-0">{def.label}:</span>
      <span className={cn("truncate font-semibold", isCompleted && "line-through opacity-70")}>
        {card.title}
      </span>
      {card.assigneeName && (
        <span className="hidden sm:inline shrink-0 opacity-70">· {card.assigneeName}</span>
      )}
      {isCompleted && <ClosedTaskPill className="ml-1" />}
    </span>
  );

  const clickable = onClick && def.target !== "none";

  return (
    <div className="mt-2 flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-border" />
      {clickable ? (
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 hover:opacity-80 transition-opacity"
          title="Открыть"
        >
          {content}
        </button>
      ) : (
        content
      )}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

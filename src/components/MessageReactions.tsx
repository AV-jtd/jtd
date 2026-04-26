import { useMemo, useState } from "react";
import { Smile, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MessageType,
  ReactionAgg,
  getRecentReactions,
  pushRecentReaction,
  useToggleReaction,
} from "@/hooks/useMessageReactions";
import { EMOJI_CATEGORIES } from "@/lib/emojiCategories";

/** Default quick set if user has no history yet. */
const DEFAULT_QUICK = ["👍", "❤️", "🔥", "😂", "🎉", "✅"];

const ALL_EMOJI = Array.from(
  new Set(EMOJI_CATEGORIES.flatMap((c) => c.emojis)),
);

interface Props {
  messageType: MessageType;
  messageId: string;
  /** Aggregated counts: emoji → list of user_ids who reacted. */
  reactions?: ReactionAgg;
  /** Compact: hide opener if no reactions present (used for inline rows). */
  compact?: boolean;
}

/**
 * @deprecated Используйте `<ReactionChips>` (inline в шапке сообщения)
 * + `<ReactionAddButton>` (в action-bar). Этот комбо-компонент оставлен для совместимости.
 */
export default function MessageReactions({ messageType, messageId, reactions, compact }: Props) {
  const { user } = useAuth();
  const toggle = useToggleReaction();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const quick = useMemo(() => {
    const recent = getRecentReactions();
    const merged = [...recent, ...DEFAULT_QUICK];
    return Array.from(new Set(merged)).slice(0, 6);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_EMOJI;
    // Простейший поиск: по самим символам (для составных эмодзи) — не идеален,
    // но не требует словаря; в качестве "поиска" выводим первые 64 при пустом значении.
    return ALL_EMOJI.filter((e) => e.includes(search.trim()));
  }, [search]);

  const entries = Object.entries(reactions || {}).filter(([, users]) => users.length > 0);

  function handlePick(emoji: string) {
    if (!user) return;
    const hasMine = !!reactions?.[emoji]?.includes(user.id);
    toggle.mutate({ messageType, messageId, emoji, hasMine });
    if (!hasMine) pushRecentReaction(emoji);
    setOpen(false);
  }

  if (compact && entries.length === 0) {
    return (
      <div className="flex justify-end">
        <ReactionTrigger open={open} setOpen={setOpen} />
        {open && (
          <ReactionPopoverContent
            quick={quick}
            search={search}
            setSearch={setSearch}
            filtered={filtered}
            onPick={handlePick}
            mineFor={(emoji) => !!user && !!reactions?.[emoji]?.includes(user.id)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end flex-wrap gap-1 mt-0.5">
      <ReactionChips messageType={messageType} messageId={messageId} reactions={reactions} />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Добавить реакцию"
            aria-label="Добавить реакцию"
          >
            <Smile className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          className="w-72 p-2"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <ReactionPanel
            quick={quick}
            search={search}
            setSearch={setSearch}
            filtered={filtered}
            onPick={handlePick}
            mineFor={(emoji) => !!user && !!reactions?.[emoji]?.includes(user.id)}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Только чипы существующих реакций (inline-вариант, ставится в одну строку
 * с метаданными сообщения: автор · время · реакции).
 */
export function ReactionChips({
  messageType,
  messageId,
  reactions,
  size = "sm",
}: {
  messageType: MessageType;
  messageId: string;
  reactions?: ReactionAgg;
  size?: "xs" | "sm";
}) {
  const { user } = useAuth();
  const toggle = useToggleReaction();
  const entries = Object.entries(reactions || {}).filter(([, users]) => users.length > 0);
  if (entries.length === 0) return null;

  return (
    <div className="inline-flex items-center flex-wrap gap-0.5">
      {entries.map(([emoji, users]) => {
        const mine = !!user && users.includes(user.id);
        const count = users.length;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() =>
              user && toggle.mutate({ messageType, messageId, emoji, hasMine: mine })
            }
            aria-pressed={mine}
            aria-label={
              mine
                ? `Убрать вашу реакцию ${emoji}, всего ${count}`
                : `Поставить реакцию ${emoji}, всего ${count}`
            }
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              size === "xs"
                ? "px-1 py-px text-[10px]"
                : "px-1.5 py-px text-[11px]",
              mine
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-muted/40 hover:bg-muted text-foreground/80",
            )}
            title={mine ? "Убрать вашу реакцию" : "Добавить такую же реакцию"}
          >
            <span className={size === "xs" ? "text-[12px] leading-none" : "text-sm leading-none"}>
              {emoji}
            </span>
            <span className="font-medium" aria-hidden="true">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Кнопка-смайлик для action-bar: открывает попап с быстрыми реакциями + полным пикером.
 */
export function ReactionAddButton({
  messageType,
  messageId,
  reactions,
  className,
}: {
  messageType: MessageType;
  messageId: string;
  reactions?: ReactionAgg;
  className?: string;
}) {
  const { user } = useAuth();
  const toggle = useToggleReaction();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const isMobile = useIsMobile();

  const quick = useMemo(() => {
    const recent = getRecentReactions();
    return Array.from(new Set([...recent, ...DEFAULT_QUICK])).slice(0, 6);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return ALL_EMOJI;
    return ALL_EMOJI.filter((e) => e.includes(search.trim()));
  }, [search]);

  function handlePick(emoji: string) {
    if (!user) return;
    const hasMine = !!reactions?.[emoji]?.includes(user.id);
    toggle.mutate({ messageType, messageId, emoji, hasMine });
    if (!hasMine) pushRecentReaction(emoji);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center h-6 w-6 rounded-md border border-border/60 bg-background/60 text-foreground/70 hover:bg-muted hover:text-foreground active:bg-muted transition-colors shrink-0",
            className,
          )}
          title="Добавить реакцию"
          aria-label="Добавить реакцию"
        >
          <Smile className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-72 p-2"
        role="dialog"
        aria-label="Выбор эмодзи для реакции"
        onOpenAutoFocus={(e) => {
          // На мобильном не фокусируем поиск — иначе всплывающая клавиатура
          // закрывает попап.
          if (isMobile) e.preventDefault();
        }}
      >
        <ReactionPanel
          quick={quick}
          search={search}
          setSearch={setSearch}
          filtered={filtered}
          onPick={handlePick}
          mineFor={(emoji) => !!user && !!reactions?.[emoji]?.includes(user.id)}
          autoFocusSearch={!isMobile}
        />
      </PopoverContent>
    </Popover>
  );
}

function ReactionTrigger({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
          title="Добавить реакцию"
          aria-label="Добавить реакцию"
        >
          <Smile className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
    </Popover>
  );
}

function ReactionPopoverContent(props: PanelProps) {
  return (
    <PopoverContent
      side="top"
      align="end"
      className="w-72 p-2"
      role="dialog"
      aria-label="Выбор эмодзи для реакции"
    >
      <ReactionPanel {...props} />
    </PopoverContent>
  );
}

type PanelProps = {
  quick: string[];
  search: string;
  setSearch: (v: string) => void;
  filtered: string[];
  onPick: (emoji: string) => void;
  mineFor: (emoji: string) => boolean;
  autoFocusSearch?: boolean;
};

function ReactionPanel({ quick, search, setSearch, filtered, onPick, mineFor, autoFocusSearch = true }: PanelProps) {
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      onPick(filtered[0]);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-1 flex-wrap"
        role="group"
        aria-label="Быстрые реакции"
      >
        {quick.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            aria-label={mineFor(e) ? `Убрать реакцию ${e}` : `Поставить реакцию ${e}`}
            aria-pressed={mineFor(e)}
            className={cn(
              "h-8 w-8 inline-flex items-center justify-center rounded-md text-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mineFor(e) && "bg-primary/15 ring-1 ring-primary/40",
            )}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search
          className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Поиск эмодзи…"
          className="h-8 pl-7 text-xs"
          aria-label="Поиск эмодзи"
          autoFocus={autoFocusSearch}
        />
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {filtered.length === 0
          ? "Ничего не найдено"
          : `Найдено ${filtered.length} эмодзи`}
      </div>
      <ScrollArea className="h-48">
        <div
          className="grid grid-cols-8 gap-0.5 pr-1"
          role="listbox"
          aria-label="Список эмодзи"
        >
          {filtered.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onPick(e)}
              role="option"
              aria-selected={mineFor(e)}
              aria-label={mineFor(e) ? `Убрать реакцию ${e}` : `Поставить реакцию ${e}`}
              className={cn(
                "h-7 w-7 inline-flex items-center justify-center rounded text-base hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mineFor(e) && "bg-primary/15 ring-1 ring-primary/40",
              )}
            >
              {e}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
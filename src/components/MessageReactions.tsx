import { useMemo, useState } from "react";
import { Smile, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
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
 * Bottom-right reaction bar: shows existing reaction chips + a trigger to add new one.
 * Trigger opens a popover with 6 quick reactions and a full picker with search.
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
      {entries.map(([emoji, users]) => {
        const mine = !!user && users.includes(user.id);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => handlePick(emoji)}
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[11px] leading-none transition-colors",
              mine
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-muted/40 hover:bg-muted text-foreground/80",
            )}
            title={mine ? "Убрать вашу реакцию" : "Добавить такую же реакцию"}
          >
            <span className="text-sm leading-none">{emoji}</span>
            <span className="font-medium">{users.length}</span>
          </button>
        );
      })}

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
    <PopoverContent side="top" align="end" className="w-72 p-2">
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
};

function ReactionPanel({ quick, search, setSearch, filtered, onPick, mineFor }: PanelProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 flex-wrap">
        {quick.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            className={cn(
              "h-8 w-8 inline-flex items-center justify-center rounded-md text-lg hover:bg-muted transition-colors",
              mineFor(e) && "bg-primary/15 ring-1 ring-primary/40",
            )}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск эмодзи…"
          className="h-8 pl-7 text-xs"
        />
      </div>
      <ScrollArea className="h-48">
        <div className="grid grid-cols-8 gap-0.5 pr-1">
          {filtered.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onPick(e)}
              className={cn(
                "h-7 w-7 inline-flex items-center justify-center rounded text-base hover:bg-muted transition-colors",
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
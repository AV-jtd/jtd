import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { Profile } from "@/hooks/useTasks";

interface UserPickerProps {
  users: Profile[];
  excludeIds?: string[];
  title?: string;
  placeholder?: string;
  onSelect: (user: Profile) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  side?: "left" | "right" | "top" | "bottom";
}

function normalize(s: string) {
  return s.toLowerCase().replace(/ё/g, "е").replace(/^@+/, "").trim();
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const nText = text.toLowerCase().replace(/ё/g, "е");
  const idx = nText.indexOf(query);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-foreground rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function UserPicker({
  users,
  excludeIds = [],
  title,
  placeholder = "Поиск по имени...",
  onSelect,
  open,
  onOpenChange,
  trigger,
  side = "left",
}: UserPickerProps) {
  const [search, setSearch] = useState("");

  const raw = normalize(search);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (excludeIds.includes(u.id)) return false;
      if (!raw) return true;
      const fields = [
        u.display_name,
        (u as any).username,
        (u as any).telegram_username,
        (u as any).email,
      ]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase().replace(/ё/g, "е"));
      return fields.some((f) => f.includes(raw));
    });
  }, [users, excludeIds, raw]);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setSearch("");
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-56 p-2" side={side}>
        {title && (
          <p className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">
            {title}
          </p>
        )}
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="h-7 text-xs mb-2"
        />
        <div className="max-h-40 overflow-y-auto space-y-0.5">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">Не найдено</p>
          )}
          {filtered.map((u) => {
            const tg = (u as any).telegram_username as string | undefined;
            const username = (u as any).username as string | undefined;
            const email = (u as any).email as string | undefined;
            const handle = tg || username;
            const showEmail =
              raw && email && email.toLowerCase().includes(raw) && !(handle && handle.toLowerCase().includes(raw));
            return (
              <button
                key={u.id}
                onClick={() => {
                  onSelect(u);
                  onOpenChange(false);
                  setSearch("");
                }}
                className="flex flex-col w-full px-2 py-1.5 rounded text-left hover:bg-muted transition-colors"
              >
                <span className="text-sm font-medium">
                  <Highlight text={u.display_name || "Без имени"} query={raw} />
                </span>
                {handle && (
                  <span className="text-[11px] text-muted-foreground">
                    @<Highlight text={handle} query={raw} />
                  </span>
                )}
                {showEmail && (
                  <span className="text-[11px] text-muted-foreground">
                    <Highlight text={email!} query={raw} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

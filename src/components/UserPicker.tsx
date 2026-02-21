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

  const filtered = useMemo(() => {
    return users.filter(u => {
      if (excludeIds.includes(u.id)) return false;
      if (!search.trim()) return true;
      return u.display_name?.toLowerCase().includes(search.toLowerCase());
    });
  }, [users, excludeIds, search]);

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
          {filtered.map((u) => (
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
                {u.display_name || "Без имени"}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

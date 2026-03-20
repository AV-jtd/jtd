import { useState, useMemo } from "react";
import { Search } from "lucide-react";

const SEARCH_THRESHOLD = 5;

interface PopoverSearchListProps<T> {
  items: T[];
  searchKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  placeholder?: string;
  threshold?: number;
  emptyText?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function PopoverSearchList<T>({
  items,
  searchKey,
  renderItem,
  placeholder = "Поиск...",
  threshold = SEARCH_THRESHOLD,
  emptyText = "Не найдено",
  header,
  footer,
  className,
}: PopoverSearchListProps<T>) {
  const [search, setSearch] = useState("");
  const showSearch = items.length > threshold;

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(item => searchKey(item).toLowerCase().includes(q));
  }, [items, search, searchKey]);

  return (
    <div className={className}>
      {header}
      {showSearch && (
        <div className="relative mb-1.5">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-muted/50 border border-border rounded outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
      )}
      <div className="max-h-48 overflow-y-auto space-y-0.5 overscroll-contain">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 py-1">{emptyText}</p>
        )}
        {filtered.map(renderItem)}
      </div>
      {footer}
    </div>
  );
}

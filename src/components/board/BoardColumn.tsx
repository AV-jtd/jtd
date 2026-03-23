import { type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface BoardColumnProps {
  /** Unique droppable id (stage key) */
  columnKey: string;
  /** Whether this column is currently hovered during drag */
  isOver?: boolean;
  /** Column header content */
  header: ReactNode;
  /** Column body (cards) */
  children: ReactNode;
  /** Extra className for the outer wrapper */
  className?: string;
  /** Whether to use ScrollArea wrapper (default: true) */
  scrollable?: boolean;
}

/**
 * Generic droppable board column shell.
 * Handles useDroppable registration and provides consistent styling.
 */
export function BoardColumn({
  columnKey,
  isOver,
  header,
  children,
  className,
  scrollable = true,
}: BoardColumnProps) {
  const { setNodeRef } = useDroppable({ id: columnKey });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col h-full min-h-0 w-72 md:w-80 shrink-0 border-r border-border last:border-r-0 transition-colors",
        isOver && "bg-primary/5",
        className,
      )}
    >
      <div className="shrink-0">{header}</div>
      {scrollable ? (
        <ScrollArea className="flex-1 min-h-0 pb-2">
          <div className="flex flex-col gap-2 px-2 w-[calc(theme(width.72)-0px)] md:w-[calc(theme(width.80)-0px)]">
            {children}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      )}
    </div>
  );
}

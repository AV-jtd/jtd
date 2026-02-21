import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export function DroppableFolder({
  id,
  isOver,
  children,
}: {
  id: string;
  isOver: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: `folder:${id}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg transition-colors",
        isOver && "bg-primary/10 ring-1 ring-primary/30"
      )}
    >
      {children}
    </div>
  );
}

export function DroppableUngrouped({
  isOver,
  children,
}: {
  isOver: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: "ungrouped-drop" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg transition-colors min-h-[8px]",
        isOver && "bg-primary/10 ring-1 ring-primary/30"
      )}
    >
      {children}
    </div>
  );
}

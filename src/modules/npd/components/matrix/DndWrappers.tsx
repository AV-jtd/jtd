import React from "react";
import { useDroppable, useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface DroppableGateCellProps {
  gateKey: string;
  isHighlighted?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function DroppableGateCell({ gateKey, isHighlighted, className, children }: DroppableGateCellProps) {
  const { setNodeRef } = useDroppable({ id: gateKey });
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
}

interface DraggableTaskRowProps {
  taskId: string;
  children: React.ReactNode;
}

export function DraggableTaskRow({ taskId, children }: DraggableTaskRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: taskId });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-30")}>
      <div className="flex items-start gap-0.5">
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 mt-1.5 cursor-grab text-muted-foreground/0 hover:text-muted-foreground/60 active:cursor-grabbing transition-colors"
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

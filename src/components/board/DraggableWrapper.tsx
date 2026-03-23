import { type ReactNode, type ComponentProps } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

interface DraggableWrapperProps {
  /** Unique draggable id */
  id: string;
  /** Disable dragging (e.g. during mutation) */
  disabled?: boolean;
  /** Render prop receiving drag state */
  children: (props: {
    isDragging: boolean;
    dragHandleProps: ComponentProps<"button">;
  }) => ReactNode;
  /** Extra className for the wrapper div */
  className?: string;
}

/**
 * Generic draggable item wrapper.
 * Provides drag handle props and opacity feedback via render prop.
 */
export function DraggableWrapper({
  id,
  disabled = false,
  children,
  className,
}: DraggableWrapperProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled,
  });

  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-30", className)}>
      {children({
        isDragging,
        dragHandleProps: { ...attributes, ...listeners },
      })}
    </div>
  );
}

import { useState, useCallback, useMemo } from "react";
import {
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";

interface UseBoardDndOptions<T> {
  /** All valid drop target keys (e.g. stage keys + "inbox") */
  dropKeys: string[];
  /** Called when drag starts – receives the active item id */
  onDragStart?: (activeId: string) => void;
  /** Called when a valid drop occurs – receives activeId and targetKey */
  onDrop: (activeId: string, targetKey: string) => void;
  /** Called when drag ends (regardless of drop validity) */
  onDragCancel?: () => void;
}

/**
 * Shared hook for Kanban-style DnD boards.
 * Encapsulates sensor setup, hover-column tracking, and drag lifecycle.
 */
export function useBoardDnd<T = unknown>({
  dropKeys,
  onDragStart: onDragStartCb,
  onDrop,
  onDragCancel,
}: UseBoardDndOptions<T>) {
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string;
      setActiveId(id);
      onDragStartCb?.(id);
    },
    [onDragStartCb],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const overId = event.over?.id as string | undefined;
      if (overId && dropKeys.includes(overId)) {
        setOverColumn(overId);
      } else {
        setOverColumn(null);
      }
    },
    [dropKeys],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const lastOverColumn = overColumn;
      setActiveId(null);
      setOverColumn(null);

      const dropKey =
        over?.id && dropKeys.includes(over.id as string)
          ? (over.id as string)
          : lastOverColumn;

      if (!dropKey) {
        onDragCancel?.();
        return;
      }

      onDrop(active.id as string, dropKey);
    },
    [dropKeys, overColumn, onDrop, onDragCancel],
  );

  const dndContextProps = useMemo(
    () => ({
      sensors,
      collisionDetection: pointerWithin,
      onDragStart: handleDragStart,
      onDragOver: handleDragOver,
      onDragEnd: handleDragEnd,
    }),
    [sensors, handleDragStart, handleDragOver, handleDragEnd],
  );

  return {
    /** Current column being hovered */
    overColumn,
    /** Currently dragged item id */
    activeId,
    /** Whether a drag is in progress */
    isDragging: activeId !== null,
    /** Spread these onto <DndContext> */
    dndContextProps,
    /** Individual handlers if needed */
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  };
}

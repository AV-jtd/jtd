import { useRef, useEffect, useMemo, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  DndContext,
  closestCenter,
  pointerWithin,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import TaskItem from "../TaskItem";

interface VirtualTaskListProps {
  tasks: any[];
  scrollParentRef: React.RefObject<HTMLElement>;
  sharedTaskItemProps: Record<string, any>;
  highlightTaskId?: string | null;
  onHighlightClear?: () => void;
  onTagClick?: (tagId: string) => void;
  onProjectClick?: (groupId: string) => void;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  batchMode: boolean;
  onReorder: (next: { id: string; position: number }[]) => void;
  groupDropContext?: "group" | "default";
}

/**
 * Virtualized version of the flat ungrouped task list. Used when the active
 * task count exceeds the threshold (see TaskList.tsx). Reuses the parent
 * <main> as the scroll element so the existing header/insights/filters scroll
 * together with the rows (no nested scroll containers).
 *
 * Variable row height is supported via measureElement — TaskItem rows can
 * expand and the virtualizer re-measures automatically.
 *
 * DnD: sortable list works with virtualization as long as all currently
 * rendered items are inside SortableContext. Items dragged out of view are
 * still tracked by id; we use a generous overscan to keep neighbours mounted.
 */
export default function VirtualTaskList({
  tasks,
  scrollParentRef,
  sharedTaskItemProps,
  highlightTaskId,
  onHighlightClear,
  onTagClick,
  onProjectClick,
  selectedIds,
  toggleSelect,
  batchMode,
  onReorder,
  groupDropContext = "default",
}: VirtualTaskListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const itemIds = useMemo(() => tasks.map((t) => t.id), [tasks]);

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 60, // average collapsed TaskItem row height incl. gap
    overscan: 8,
    getItemKey: (index) => tasks[index]?.id ?? index,
  });

  // Scroll highlighted task into view once on mount/when id changes
  useEffect(() => {
    if (!highlightTaskId) return;
    const idx = tasks.findIndex((t) => t.id === highlightTaskId);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "center" });
  }, [highlightTaskId, tasks, virtualizer]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    onReorder(reordered.map((t, i) => ({ id: t.id, position: i })));
  };

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const offset = items[0]?.start ?? 0;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={groupDropContext === "group" ? pointerWithin : closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={groupDropContext === "group" ? [] : [restrictToVerticalAxis]}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div style={{ height: totalSize, width: "100%", position: "relative" }}>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${offset}px)`,
            }}
          >
            {items.map((vi) => {
              const task = tasks[vi.index];
              if (!task) return null;
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  data-task-id={task.id}
                  ref={virtualizer.measureElement}
                  className="pb-1.5"
                >
                  <TaskItem
                    task={task}
                    {...sharedTaskItemProps}
                    sortable={!batchMode}
                    initialOpen={task.id === highlightTaskId}
                    onOpened={task.id === highlightTaskId ? onHighlightClear : undefined}
                    onTagClick={onTagClick}
                    onProjectClick={onProjectClick}
                    selectable={batchMode}
                    selected={selectedIds.has(task.id)}
                    onToggleSelect={() => toggleSelect(task.id)}
                    onLongPress={() => toggleSelect(task.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
}

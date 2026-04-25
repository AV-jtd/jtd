import { useEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { TaskGroup } from "@/hooks/useTasks";

/**
 * Virtualised renderer for a flat list of root projects in the sidebar.
 *
 * Used for long, non-nested sections (Ungrouped, Archive, Folder content)
 * where visible rows can easily exceed the viewport. Short lists are
 * rendered without virtualisation (see `threshold` prop) so DnD reordering,
 * scroll anchoring, and CSS animations keep working unchanged.
 *
 * The sidebar scroll lives on the parent `<nav class="ios-sidebar-scroll">`,
 * so we reuse it via `closest()` instead of creating a nested scroll area —
 * keeps a single scroll context and avoids breaking iOS momentum scroll.
 *
 * DnD note: virtual rows are positioned with `top` (not `translateY`) so
 * `useSortable` inside the row keeps full control over the CSS `transform`.
 * Otherwise the virtualiser's transform would override the sortable lift
 * animation and produce visible jumps / dropped frames during reorder.
 * The list is also wrapped in its own SortableContext so reorder happens
 * within this slice (NPD / folder / ungrouped / archive) rather than across
 * the whole tree.
 */
interface VirtualGroupListProps {
  items: TaskGroup[];
  /** Estimated row height in px — close to actual avoids reflows. */
  estimateSize?: number;
  /** Below this count we render the plain list (no virtualisation). */
  threshold?: number;
  /** Extra rows rendered above/below viewport to hide pop-in on scroll. */
  overscan?: number;
  /** Optional className applied to the list wrapper. */
  className?: string;
  renderItem: (group: TaskGroup) => ReactNode;
  /**
   * Whether to wrap items in a SortableContext. Defaults to true so DnD
   * reordering works inside this list. Set false for read-only sections.
   */
  sortable?: boolean;
}

export default function VirtualGroupList({
  items,
  estimateSize = 32,
  threshold = 30,
  overscan = 8,
  className,
  renderItem,
  sortable = true,
}: VirtualGroupListProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  // Resolve the nearest scroll container (the sidebar <nav>) once mounted.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const parent = wrapperRef.current.closest(".ios-sidebar-scroll") as HTMLElement | null;
    setScrollEl(parent);
  }, []);

  const shouldVirtualise = items.length >= threshold && !!scrollEl;

  const virtualizer = useVirtualizer({
    count: shouldVirtualise ? items.length : 0,
    getScrollElement: () => scrollEl,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: (i) => items[i].id,
  });

  const sortableIds = items.map((g) => g.id);

  const wrap = (node: ReactNode) =>
    sortable ? (
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {node}
      </SortableContext>
    ) : (
      node
    );

  if (!shouldVirtualise) {
    return wrap(
      <div ref={wrapperRef} className={className}>
        {items.map(renderItem)}
      </div>,
    );
  }

  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  return wrap(
    <div
      ref={wrapperRef}
      className={className}
      style={{ height: totalSize, position: "relative" }}
    >
      {virtualItems.map((vRow) => {
        const group = items[vRow.index];
        return (
          <div
            key={vRow.key}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              // Position via `top` instead of translateY: leaves the CSS
              // transform property free for useSortable's lift animation.
              top: vRow.start,
              left: 0,
              right: 0,
            }}
          >
            {renderItem(group)}
          </div>
        );
      })}
    </div>,
  );
}
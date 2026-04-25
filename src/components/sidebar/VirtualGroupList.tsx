import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
 *
 * iOS Safari notes:
 *  - The parent scroll container uses `-webkit-overflow-scrolling: touch`
 *    for native momentum. Inside a momentum-scrolling container, absolutely
 *    positioned children can de-sync from the scroll layer and look "jumpy"
 *    during fast flings. We mitigate that by:
 *      a) Promoting both wrapper and rows to their own composited layer
 *         (`translate3d(0,0,0)` + `will-change: transform`).
 *      b) Containing layout/paint per row (`contain: layout paint style`)
 *         and using `content-visibility: auto` so off-screen rows don't
 *         re-layout while the user is flinging.
 *      c) Boosting `overscan` on touch devices — fast wheel/momentum
 *         scrolls outrun the rAF-driven virtualiser and need more pre-rendered
 *         rows to avoid blank flashes between frames.
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

/**
 * Imperative handle for parent components (ProjectsTree) that need to
 * scroll a specific row into view — e.g. when the active project changes
 * via deep link / navigation, or when a folder is expanded and the user
 * needs to see what's inside.
 *
 * Returns `true` if the row exists in this list (so the parent can stop
 * trying other lists), `false` otherwise.
 */
export interface VirtualGroupListHandle {
  scrollToId: (id: string, opts?: { align?: "start" | "center" | "end" | "auto" }) => boolean;
  hasItem: (id: string) => boolean;
}

/**
 * iOS Safari + Android Chrome on touch devices: rAF-driven measurement
 * lags behind native momentum scroll. Doubling overscan trades a small
 * amount of memory for not seeing blank rows mid-fling.
 */
const isTouchDevice = (): boolean => {
  if (typeof window === "undefined") return false;
  return (
    "ontouchstart" in window ||
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0)
  );
};

function VirtualGroupListInner(
  {
    items,
    estimateSize = 32,
    threshold = 30,
    overscan = 8,
    className,
    renderItem,
    sortable = true,
  }: VirtualGroupListProps,
  ref: React.Ref<VirtualGroupListHandle>,
) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  // Resolve the nearest scroll container (the sidebar <nav>) once mounted.
  // Also promote it to its own layer so momentum scroll on iOS keeps in sync
  // with our absolutely-positioned virtual rows. We only set styles that
  // aren't already in CSS, and we don't clobber existing inline styles.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const parent = wrapperRef.current.closest(".ios-sidebar-scroll") as HTMLElement | null;
    if (parent) {
      // Idempotent: applying these multiple times across siblings is fine.
      if (!parent.style.transform) parent.style.transform = "translateZ(0)";
      if (!parent.style.willChange) parent.style.willChange = "scroll-position";
    }
    setScrollEl(parent);
  }, []);

  // Bigger overscan on touch — momentum scroll outruns rAF measurement.
  const effectiveOverscan = useMemo(
    () => (isTouchDevice() ? Math.max(overscan, 16) : overscan),
    [overscan],
  );

  const shouldVirtualise = items.length >= threshold && !!scrollEl;

  const virtualizer = useVirtualizer({
    count: shouldVirtualise ? items.length : 0,
    getScrollElement: () => scrollEl,
    estimateSize: () => estimateSize,
    overscan: effectiveOverscan,
    getItemKey: (i) => items[i].id,
  });

  // ---------- Imperative scroll API ----------

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((g, i) => map.set(g.id, i));
    return map;
  }, [items]);

  const scrollToId = useCallback(
    (id: string, opts?: { align?: "start" | "center" | "end" | "auto" }) => {
      const idx = indexById.get(id);
      if (idx === undefined) return false;
      const align = opts?.align ?? "center";
      if (shouldVirtualise) {
        // Two passes: virtualizer estimates first, then re-measures actual
        // height. A second call after rAF guarantees we land on the right row
        // even when row heights vary (e.g. project with longer name).
        virtualizer.scrollToIndex(idx, { align });
        requestAnimationFrame(() => virtualizer.scrollToIndex(idx, { align }));
      } else if (wrapperRef.current) {
        const node = wrapperRef.current.querySelector<HTMLElement>(
          `[data-group-id="${CSS.escape(id)}"]`,
        );
        node?.scrollIntoView({ block: align === "auto" ? "nearest" : align, behavior: "smooth" });
      }
      return true;
    },
    [indexById, shouldVirtualise, virtualizer],
  );

  useImperativeHandle(
    ref,
    () => ({ scrollToId, hasItem: (id: string) => indexById.has(id) }),
    [scrollToId, indexById],
  );

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
        {items.map((g) => (
          // data-group-id used by scrollToId() in the non-virtual path.
          <div key={g.id} data-group-id={g.id}>
            {renderItem(g)}
          </div>
        ))}
      </div>,
    );
  }

  const totalSize = virtualizer.getTotalSize();
  const virtualItems = virtualizer.getVirtualItems();

  return wrap(
    <div
      ref={wrapperRef}
      className={className}
      style={{
        height: totalSize,
        position: "relative",
        // Promote the inner wrapper to a composited layer so iOS Safari
        // doesn't desync the absolutely-positioned children from the
        // momentum scroll layer above.
        transform: "translate3d(0,0,0)",
        contain: "layout paint",
      }}
    >
      {virtualItems.map((vRow) => {
        const group = items[vRow.index];
        return (
          <div
            key={vRow.key}
            data-index={vRow.index}
            data-group-id={group.id}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              // Position via `top` instead of translateY: leaves the CSS
              // transform property free for useSortable's lift animation.
              top: vRow.start,
              left: 0,
              right: 0,
              // Skip layout/paint for off-screen rows. `contain-intrinsic-size`
              // tells the browser the row's reserved size so removing it from
              // layout doesn't cause a height jump.
              contain: "layout paint style",
              contentVisibility: "auto",
              containIntrinsicSize: `${estimateSize}px`,
            }}
          >
            {renderItem(group)}
          </div>
        );
      })}
    </div>,
  );
}

const VirtualGroupList = forwardRef<VirtualGroupListHandle, VirtualGroupListProps>(
  VirtualGroupListInner,
);
VirtualGroupList.displayName = "VirtualGroupList";
export default VirtualGroupList;
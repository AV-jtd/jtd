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

/**
 * Stable height measurer for `measureElement`.
 *
 * `ResizeObserver` fires for any subpixel layout change — focus rings on the
 * active row, font hinting differences, hover transitions on a `<button>`,
 * the rename `<input>` swapping in for a `<span>`. Each fire would normally
 * push a new height into the virtualiser's offset cache and trigger a
 * re-layout of every row below. That's what causes the visible "jumpiness"
 * when expanding a project with children or editing a name.
 *
 * We mitigate that by:
 *  1) Rounding to a whole pixel (`Math.round`) — eliminates subpixel jitter.
 *  2) Returning the *previous* height via a per-element WeakMap when the
 *     change is below `MEASURE_TOLERANCE_PX`. This swallows changes caused
 *     by purely cosmetic state (focus, hover) while still letting a real
 *     structural change (children expanded, multi-line title) propagate.
 */
const MEASURE_TOLERANCE_PX = 1;
const lastMeasuredSize = new WeakMap<Element, number>();

const stableMeasureElement = (el: Element): number => {
  const next = Math.round(el.getBoundingClientRect().height);
  const prev = lastMeasuredSize.get(el);
  if (prev !== undefined && Math.abs(next - prev) <= MEASURE_TOLERANCE_PX) {
    return prev;
  }
  lastMeasuredSize.set(el, next);
  return next;
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
  // Touched preserved for API/back-compat; values are unused while
  // virtualisation is disabled (see note below).
  void estimateSize; void threshold; void overscan;

  // ⚠️ Virtualisation disabled.
  // The previous implementation positioned absolute rows inside a wrapper
  // while the scroll container lived on the parent <nav>. tanstack-virtual
  // returns offsets in the scroll container's coordinate system, so rows
  // were placed at the wrong `top` and visibly "ate" each other on
  // scroll/expand. Fixing it correctly would require an internal scroll
  // box per list, which breaks single-scroll iOS momentum behaviour.
  // For typical sidebars (≤ a few hundred rows) plain rendering is fast
  // enough and visually correct.
  const shouldVirtualise = false;

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
      if (wrapperRef.current) {
        const node = wrapperRef.current.querySelector<HTMLElement>(
          `[data-group-id="${CSS.escape(id)}"]`,
        );
        node?.scrollIntoView({ block: align === "auto" ? "nearest" : align, behavior: "smooth" });
      }
      return true;
    },
    [indexById],
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

  return wrap(
    <div ref={wrapperRef} className={className}>
      {items.map((g) => (
        // data-group-id used by scrollToId() to locate a row.
        <div key={g.id} data-group-id={g.id}>
          {renderItem(g)}
        </div>
      ))}
    </div>,
  );
}

const VirtualGroupList = forwardRef<VirtualGroupListHandle, VirtualGroupListProps>(
  VirtualGroupListInner,
);
VirtualGroupList.displayName = "VirtualGroupList";
export default VirtualGroupList;
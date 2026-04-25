import { useState, useRef, ReactNode, ReactElement, cloneElement } from "react";
import { startMeasure } from "@/lib/perf/perfMetrics";

/**
 * Defers mounting of a heavy child until the user actually interacts with it.
 *
 * Two-stage promotion to make the first open feel instant:
 *  - **Warm** (hover/focus/pointerenter): mount the heavy child so React/JS
 *    work happens during pointer travel — but stay closed.
 *  - **Open** (click/pointerdown/touchstart): toggle to open. Because the
 *    component is already mounted, this is a single state update, not a
 *    full mount + open.
 *
 * On mobile a hover never fires, but `pointerdown` fires ~50ms before `click`,
 * so we use it as a fast-path open trigger.
 *
 * Usage:
 *   <LazyMount trigger={<button>Open</button>}>
 *     {(open, setOpen) => (
 *       <HeavyPicker open={open} onOpenChange={setOpen} ... />
 *     )}
 *   </LazyMount>
 *
 * Once mounted, the child stays mounted (so subsequent opens are instant) and
 * the trigger is no longer rendered separately — the child is expected to
 * render its own trigger in controlled mode.
 *
 * If `forceMount` flips to true (e.g. parent decides to programmatically open),
 * the child is mounted immediately.
 */
interface LazyMountProps {
  /** Lightweight placeholder rendered before first interaction. Must accept onClick/onFocus/onMouseEnter/onTouchStart. */
  trigger: ReactElement;
  /** Render the heavy component. Called only after first interaction or when forceMount is true. */
  children: (open: boolean, setOpen: (open: boolean) => void) => ReactNode;
  /** Force-mount immediately (e.g. when controlled open from outside). */
  forceMount?: boolean;
  /** Optional label for perf metrics (defaults to "picker"). */
  perfLabel?: string;
}

export default function LazyMount({ trigger, children, forceMount, perfLabel = "picker" }: LazyMountProps) {
  const [mounted, setMounted] = useState(!!forceMount);
  const [open, setOpen] = useState(!!forceMount);
  const mountedRef = useRef(mounted);

  if (forceMount && !mountedRef.current) {
    mountedRef.current = true;
    setMounted(true);
    setOpen(true);
  }

  if (!mounted) {
    // Two-stage promotion: warm on intent, open on commit.
    const warm = () => {
      if (mountedRef.current) return;
      mountedRef.current = true;
      setMounted(true);
    };
    const promote = () => {
      const end = startMeasure("picker-open", perfLabel);
      mountedRef.current = true;
      setMounted(true);
      setOpen(true);
      end();
    };
    const existing = (trigger.props ?? {}) as Record<string, unknown>;
    const merged = {
      onClick: (e: React.MouseEvent) => {
        (existing.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e);
        promote();
      },
      onPointerDown: (e: React.PointerEvent) => {
        (existing.onPointerDown as ((e: React.PointerEvent) => void) | undefined)?.(e);
        // pointerdown fires ~50ms before click on mobile — open the picker now
        // so it appears under the finger without waiting for the synthetic click.
        promote();
      },
      onFocus: (e: React.FocusEvent) => {
        (existing.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
        warm();
      },
      onMouseEnter: (e: React.MouseEvent) => {
        (existing.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
        warm();
      },
      onPointerEnter: (e: React.PointerEvent) => {
        (existing.onPointerEnter as ((e: React.PointerEvent) => void) | undefined)?.(e);
        warm();
      },
      onTouchStart: (e: React.TouchEvent) => {
        (existing.onTouchStart as ((e: React.TouchEvent) => void) | undefined)?.(e);
        // Fast-path for older mobile browsers that don't fire pointerdown.
        promote();
      },
    };
    return cloneElement(trigger, merged);
  }

  return <>{children(open, setOpen)}</>;
}

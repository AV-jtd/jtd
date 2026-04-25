import { useState, useRef, ReactNode, ReactElement, cloneElement } from "react";

/**
 * Defers mounting of a heavy child until the user actually interacts with it.
 *
 * Used to avoid paying the mount cost of every popover/picker/dialog inside
 * every TaskItem row in long task lists. Until the user hovers, focuses, or
 * touches the trigger, only the lightweight trigger element is in the DOM.
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
}

export default function LazyMount({ trigger, children, forceMount }: LazyMountProps) {
  const [mounted, setMounted] = useState(!!forceMount);
  const [open, setOpen] = useState(!!forceMount);
  const mountedRef = useRef(mounted);

  if (forceMount && !mountedRef.current) {
    mountedRef.current = true;
    setMounted(true);
    setOpen(true);
  }

  if (!mounted) {
    // Wrap trigger so any interaction promotes it to the real component.
    const promote = () => {
      mountedRef.current = true;
      setMounted(true);
      setOpen(true);
    };
    const existing = (trigger.props ?? {}) as Record<string, unknown>;
    const merged = {
      onClick: (e: React.MouseEvent) => {
        (existing.onClick as ((e: React.MouseEvent) => void) | undefined)?.(e);
        promote();
      },
      onFocus: (e: React.FocusEvent) => {
        (existing.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e);
        promote();
      },
      onMouseEnter: (e: React.MouseEvent) => {
        (existing.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e);
        promote();
      },
      onTouchStart: (e: React.TouchEvent) => {
        (existing.onTouchStart as ((e: React.TouchEvent) => void) | undefined)?.(e);
        promote();
      },
    };
    return cloneElement(trigger, merged);
  }

  return <>{children(open, setOpen)}</>;
}

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useUserSetting } from "@/hooks/useUserSettings";

interface ResizableSidebarProps {
  /** Persisted per-user setting key (e.g. "sidebar_width_home"). */
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  /** Which edge holds the drag handle. Left sidebar → "right", right sidebar → "left". */
  side?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}

/**
 * Wraps a sidebar with a draggable edge to resize its width.
 * Width is persisted per user (cross-device) via useUserSetting; live drag
 * uses local state and only commits on release to avoid DB write spam.
 */
export default function ResizableSidebar({
  storageKey,
  defaultWidth,
  minWidth = 220,
  maxWidth = 560,
  side = "right",
  className,
  children,
}: ResizableSidebarProps) {
  const [stored, setStored] = useUserSetting<number>(storageKey, defaultWidth);
  const [width, setWidth] = useState(stored);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  // Sync when the persisted value loads from the DB (unless mid-drag).
  useEffect(() => {
    if (!dragging) setWidth(stored);
  }, [stored, dragging]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthRef.current;
      setDragging(true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const onMove = (ev: MouseEvent) => {
        const delta = side === "right" ? ev.clientX - startX : startX - ev.clientX;
        setWidth(Math.min(maxWidth, Math.max(minWidth, startW + delta)));
      };
      const onUp = () => {
        setDragging(false);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        setStored(widthRef.current);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [side, minWidth, maxWidth, setStored],
  );

  return (
    <div className={cn("relative h-full shrink-0", className)} style={{ width }}>
      {children}
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={() => { setWidth(defaultWidth); setStored(defaultWidth); }}
        role="separator"
        aria-orientation="vertical"
        title="Потяните, чтобы изменить ширину (двойной клик — сброс)"
        className={cn(
          "absolute top-0 z-20 h-full w-1.5 cursor-col-resize group",
          side === "right" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2",
        )}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors",
            "group-hover:bg-primary/60",
            dragging && "bg-primary",
          )}
        />
      </div>
    </div>
  );
}
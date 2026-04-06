import { Undo2, Redo2 } from "lucide-react";
import { useUndo } from "@/hooks/useUndoStack";
import { cn } from "@/lib/utils";

/**
 * Compact undo/redo buttons for toolbars.
 * Shows action count badge when stack is non-empty.
 */
export default function UndoRedoButtons({ className }: { className?: string }) {
  const { undo, redo, undoCount, redoCount } = useUndo();

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <button
        onClick={undo}
        disabled={undoCount === 0}
        title={`Отменить (Ctrl+Z) · ${undoCount}`}
        className={cn(
          "relative p-1.5 rounded-md transition-colors",
          undoCount > 0
            ? "text-foreground hover:bg-muted"
            : "text-muted-foreground/40 cursor-not-allowed"
        )}
      >
        <Undo2 className="h-4 w-4" />
        {undoCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-medium px-1 leading-none">
            {undoCount}
          </span>
        )}
      </button>
      <button
        onClick={redo}
        disabled={redoCount === 0}
        title={`Повторить (Ctrl+Shift+Z) · ${redoCount}`}
        className={cn(
          "relative p-1.5 rounded-md transition-colors",
          redoCount > 0
            ? "text-foreground hover:bg-muted"
            : "text-muted-foreground/40 cursor-not-allowed"
        )}
      >
        <Redo2 className="h-4 w-4" />
        {redoCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-medium px-1 leading-none">
            {redoCount}
          </span>
        )}
      </button>
    </div>
  );
}

import { createContext, useContext, useCallback, useRef, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface UndoEntry {
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

interface UndoContextValue {
  pushUndo: (entry: UndoEntry) => void;
  undo: () => void;
  redo: () => void;
  undoCount: number;
  redoCount: number;
}

const MAX_STACK = 50;

const UndoContext = createContext<UndoContextValue | null>(null);

export function UndoProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const syncCounts = useCallback(() => {
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
  }, []);

  useEffect(() => {
    const handler = () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task_groups"] });
    };
    window.addEventListener("undo-invalidate", handler);
    return () => window.removeEventListener("undo-invalidate", handler);
  }, [qc]);

  const pushUndo = useCallback((entry: UndoEntry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > MAX_STACK) undoStack.current.shift();
    redoStack.current = [];
    syncCounts();
  }, [syncCounts]);

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(entry);
    syncCounts();
    Promise.resolve(entry.undo()).then(() => {
      toast(`↩ Отменено: ${entry.label}`, {
        action: {
          label: "Повторить",
          onClick: () => {
            redoStack.current = redoStack.current.filter((e) => e !== entry);
            undoStack.current.push(entry);
            syncCounts();
            entry.redo();
          },
        },
        duration: 4000,
      });
    });
  }, [syncCounts]);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(entry);
    syncCounts();
    Promise.resolve(entry.redo()).then(() => {
      toast(`↪ Повторено: ${entry.label}`, { duration: 2000 });
    });
  }, [syncCounts]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (isEditable && !e.shiftKey) return;
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        if (isEditable) return;
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [undo, redo]);

  return (
    <UndoContext.Provider value={{ pushUndo, undo, redo, undoCount, redoCount }}>
      {children}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndo must be used within UndoProvider");
  return ctx;
}

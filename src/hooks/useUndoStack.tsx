import { createContext, useContext, useCallback, useRef, useEffect, type ReactNode } from "react";
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
  canUndo: boolean;
  canRedo: boolean;
}

const MAX_STACK = 50;

const UndoContext = createContext<UndoContextValue | null>(null);

export function UndoProvider({ children }: { children: ReactNode }) {
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  // Force re-render not needed — toast is the feedback

  const pushUndo = useCallback((entry: UndoEntry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > MAX_STACK) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(entry);
    Promise.resolve(entry.undo()).then(() => {
      toast(`↩ Отменено: ${entry.label}`, {
        action: {
          label: "Повторить",
          onClick: () => {
            redoStack.current = redoStack.current.filter((e) => e !== entry);
            undoStack.current.push(entry);
            entry.redo();
          },
        },
        duration: 4000,
      });
    });
  }, []);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(entry);
    Promise.resolve(entry.redo()).then(() => {
      toast(`↪ Повторено: ${entry.label}`, { duration: 2000 });
    });
  }, []);

  // Global keyboard listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/contenteditable
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (isEditable && !e.shiftKey) return; // let native undo work in inputs
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      // Ctrl+Y as alternative redo
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
    <UndoContext.Provider value={{
      pushUndo,
      undo,
      redo,
      get canUndo() { return undoStack.current.length > 0; },
      get canRedo() { return redoStack.current.length > 0; },
    }}>
      {children}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndo must be used within UndoProvider");
  return ctx;
}

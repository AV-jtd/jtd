import { useSyncExternalStore } from "react";

/**
 * Последняя открытая задача — для ассистента (01.10.2026).
 *
 * «Перенеси эту задачу» имеет смысл, только если ассистент знает, какую.
 * Открытую карточку чаще всего закрывают, прежде чем нажать ✨ (клик мимо
 * закрывает панель), поэтому храним не «открыта сейчас», а «открывали
 * последней» — 15 минут. Окно ассистента показывает её плашкой с крестиком:
 * человек видит, о какой задаче речь, и может убрать её из разговора.
 */

export type FocusedTask = { id: string; title: string; at: number };

const TTL_MS = 15 * 60 * 1000;
let current: FocusedTask | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setFocusedTask(task: { id: string; title: string } | null) {
  if (task && current?.id === task.id && current.title === task.title) {
    current = { ...current, at: Date.now() };
    return;
  }
  current = task ? { ...task, at: Date.now() } : null;
  emit();
}

export function getFocusedTask(): FocusedTask | null {
  if (current && Date.now() - current.at > TTL_MS) current = null;
  return current;
}

export function useFocusedTask(): FocusedTask | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getFocusedTask,
  );
}

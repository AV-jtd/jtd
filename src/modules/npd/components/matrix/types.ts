import type { Task, TaskGroup, Profile } from "@/hooks/useTasks";

export const NPD_GATES = [
  { key: "gate0", short: "G0", shortTitle: "Идея", title: "Gate 0: Идея", tagName: "Gate 0: Идея и Стратегия", color: "bg-slate-500", textColor: "text-slate-600", bgLight: "bg-slate-500/10" },
  { key: "gate1", short: "G1", shortTitle: "Концепция", title: "Gate 1: Концепция", tagName: "Gate 1: Концепция и Экономика", color: "bg-blue-500", textColor: "text-blue-600", bgLight: "bg-blue-500/10" },
  { key: "gate2", short: "G2", shortTitle: "Разработка", title: "Gate 2: Разработка", tagName: "Gate 2: Разработка и Валидация", color: "bg-amber-500", textColor: "text-amber-600", bgLight: "bg-amber-500/10" },
  { key: "gate3", short: "G3", shortTitle: "Подготовка", title: "Gate 3: Подготовка", tagName: "Gate 3: Подготовка к запуску", color: "bg-purple-500", textColor: "text-purple-600", bgLight: "bg-purple-500/10" },
  { key: "gate4", short: "G4", shortTitle: "Запуск", title: "Gate 4: Запуск", tagName: "Gate 4: Запуск", color: "bg-emerald-500", textColor: "text-emerald-600", bgLight: "bg-emerald-500/10" },
  { key: "gate5", short: "G5", shortTitle: "Анализ", title: "Gate 5: Анализ", tagName: "Gate 5: Анализ запуска", color: "bg-rose-500", textColor: "text-rose-600", bgLight: "bg-rose-500/10" },
] as const;

export const NPD_STREAMS = [
  "Продакт", "Реклама", "RnD", "СКК", "Производство", "Закупки", "Продажи", "Покупка оборудования",
] as const;

export type GateDef = (typeof NPD_GATES)[number];
export type StreamName = (typeof NPD_STREAMS)[number];

export type { Task, TaskGroup, Profile };

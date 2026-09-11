import { describe, it, expect } from "vitest";
import { taskMatchesCacheKey } from "@/lib/taskCacheMatch";

const U = "user-1";
// ["tasks", userId, groupId, filterTags, completedWindowDays]
const global_ = (tags: string[] | null = null) => ["tasks", U, undefined, tags, null] as const;
const project = (gid: string, tags: string[] | null = null) => ["tasks", U, gid, tags, null] as const;

describe("новая задача и глобальный список", () => {
  it("обычная задача попадает", () => {
    expect(taskMatchesCacheKey(global_(), { group_id: null })).toBe(true);
    expect(taskMatchesCacheKey(global_(), { group_id: "g1" })).toBe(true);
  });

  it("черновик не попадает — он скрыт из глобальных списков", () => {
    expect(taskMatchesCacheKey(global_(), { is_draft: true })).toBe(false);
  });

  it("задачи матриц STM и KM не попадают", () => {
    expect(taskMatchesCacheKey(global_(), { task_type: "stm_stage" })).toBe(false);
    expect(taskMatchesCacheKey(global_(), { task_type: "km_stage" })).toBe(false);
  });

  it("при активном фильтре по тегам не вставляем", () => {
    // Ровно тот случай, который воспроизводился каждый раз: у новой задачи
    // тегов ещё нет, повторная выборка её отбрасывала, и задача пропадала
    // на глазах.
    expect(taskMatchesCacheKey(global_(["tag-1"]), { group_id: "g1" })).toBe(false);
  });

  it("пустой список тегов фильтром не считается", () => {
    expect(taskMatchesCacheKey(global_([]), { group_id: "g1" })).toBe(true);
  });
});

describe("новая задача и список конкретного проекта", () => {
  it("попадает только в свой проект", () => {
    expect(taskMatchesCacheKey(project("g1"), { group_id: "g1" })).toBe(true);
    expect(taskMatchesCacheKey(project("g1"), { group_id: "g2" })).toBe(false);
    expect(taskMatchesCacheKey(project("g1"), { group_id: null })).toBe(false);
  });

  it("черновик виден внутри проекта", () => {
    // Инвариант видимости черновиков: внутри протокола они обязаны быть видны,
    // иначе протокол выглядит пустым до публикации.
    expect(taskMatchesCacheKey(project("g1"), { group_id: "g1", is_draft: true })).toBe(true);
  });
});

describe("Гантт: список по набору проектов", () => {
  const key = (ids: string[]) => ["tasks-by-groups", U, ids, null] as const;

  it("попадает, если проект задачи в наборе", () => {
    expect(taskMatchesCacheKey(key(["g1", "g2"]), { group_id: "g2" })).toBe(true);
  });

  it("не попадает, если проекта нет в наборе или он не задан", () => {
    expect(taskMatchesCacheKey(key(["g1"]), { group_id: "g9" })).toBe(false);
    expect(taskMatchesCacheKey(key(["g1"]), { group_id: null })).toBe(false);
  });
});

describe("матрицы STM и KM", () => {
  it("принимают только свой тип задач", () => {
    expect(taskMatchesCacheKey(["stm-stage-tasks", U], { task_type: "stm_stage" })).toBe(true);
    expect(taskMatchesCacheKey(["stm-stage-tasks", U], { task_type: "standard" })).toBe(false);
    expect(taskMatchesCacheKey(["km-stage-tasks", U], { task_type: "km_stage" })).toBe(true);
    expect(taskMatchesCacheKey(["km-stage-tasks", U], { task_type: "stm_stage" })).toBe(false);
  });
});

describe("незнакомый кэш", () => {
  it("считается неподходящим", () => {
    expect(taskMatchesCacheKey(["clients", U], { group_id: "g1" })).toBe(false);
  });
});

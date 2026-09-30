import { describe, it, expect } from "vitest";
import { computeChanges, mskDate, type TaskSnapshot } from "@/lib/assistant/changes";

const task: TaskSnapshot = {
  title: "КП Ашан", deadline: "2026-10-03T15:00:00Z", start_at: null, assigned_to: "u1",
  is_important: false, priority: null, is_completed: false, status: "в работе",
};
const people: Record<string, string> = { u1: "Ирина", u2: "Мария" };
const personName = (id: string | null) => (id ? people[id] : undefined);

describe("было → станет", () => {
  it("перенос срока и смена исполнителя в update_task", () => {
    const r = computeChanges(
      { name: "update_task", input: { task_id: "t", deadline: "2026-10-05T18:00:00+03:00", assignee: "Мария" } },
      { task, personName, newAssigneeName: "Мария" },
    );
    expect(r.changes).toEqual([
      { field: "исполнитель", from: "Ирина", to: "Мария" },
      { field: "срок", from: "03.10.2026, 18:00", to: "05.10.2026, 18:00" },
    ]);
    expect(r.keys.sort()).toEqual(["assignee", "deadline"]);
  });

  it("снятие срока и статуса — словами, а не пустотой", () => {
    const r = computeChanges({ name: "update_task", input: { task_id: "t", deadline: null, status: "none" } }, { task, personName });
    expect(r.changes).toContainEqual({ field: "срок", from: "03.10.2026, 18:00", to: "без срока" });
    expect(r.changes).toContainEqual({ field: "статус", from: "в работе", to: "без статуса" });
  });

  it("перенос с хвостом: срок, число связанных и отклонение от плана", () => {
    const r = computeChanges(
      { name: "move_task", input: { id: "t", shift_days: 7 } },
      { personName, shift: { from: "2026-10-03T15:00:00Z", to: "2026-10-10T15:00:00Z", count: 3, drift: true } },
    );
    expect(r.changes).toEqual([{ field: "срок", from: "03.10.2026, 18:00", to: "10.10.2026, 18:00" }]);
    expect(r.note).toContain("ещё 3 связанные задачи");
    expect(r.note).toContain("отклонение");
  });

  it("закрытие задачи", () => {
    const r = computeChanges({ name: "complete_task", input: { task_id: "t" } }, { task, personName });
    expect(r.changes).toEqual([{ field: "задача", from: "открыта", to: "закрыта" }]);
  });

  it("веха: статус по-русски", () => {
    const r = computeChanges(
      { name: "update_milestone", input: { milestone_id: "m", status: "completed", actual_date: "2026-10-01" } },
      { personName, milestone: { name: "Запуск", planned_date: "2026-09-30", actual_date: null, status: "in_progress" } },
    );
    expect(r.changes).toContainEqual({ field: "статус", from: "в работе", to: "достигнута" });
    expect(r.changes).toContainEqual({ field: "факт", from: "—", to: "01.10.2026" });
  });

  it("без текущих данных — пусто, карточка покажет аргументы как раньше", () => {
    expect(computeChanges({ name: "update_task", input: { task_id: "t", deadline: null } }, { personName })).toEqual({ changes: [], keys: [] });
    expect(computeChanges({ name: "create_task", input: { title: "x" } }, { personName }).changes).toEqual([]);
  });

  it("полночь по Москве — без времени", () => {
    expect(mskDate("2026-10-04T21:00:00Z")).toBe("05.10.2026");
  });
});

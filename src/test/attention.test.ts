import { describe, it, expect } from "vitest";
import { bucketByUrgency, milestonesAtRisk, type AttentionTask } from "@/lib/attention";

/**
 * Раскладка «что горит». Проверяются именно те два способа ошибиться тихо:
 * просрочка по часам вместо дней и потеря задач без срока.
 */
const NOW = new Date("2026-10-15T18:00:00.000Z");
const t = (id: string, deadline: string | null): AttentionTask => ({ id, title: id, deadline });

describe("bucketByUrgency", () => {
  it("раскладывает по корзинам", () => {
    const r = bucketByUrgency(
      [t("late", "2026-10-01T00:00:00Z"), t("now", "2026-10-15T09:00:00Z"), t("soon", "2026-10-18T00:00:00Z"), t("far", "2026-12-01T00:00:00Z")],
      7, NOW,
    );
    expect(r.overdue.map((x) => x.id)).toEqual(["late"]);
    expect(r.overdue[0].days).toBe(14);
    expect(r.today.map((x) => x.id)).toEqual(["now"]);
    expect(r.soon.map((x) => x.id)).toEqual(["soon"]);
    expect(r.later).toBe(1);
  });

  // Главная ловушка: срок «сегодня в 10:00» в 18:00 формально прошёл, но
  // человек считает такую задачу сегодняшней, а не сорванной.
  it("сегодняшний срок не считается просроченным, даже если час прошёл", () => {
    const r = bucketByUrgency([t("a", "2026-10-15T10:00:00Z")], 7, NOW);
    expect(r.overdue).toEqual([]);
    expect(r.today.map((x) => x.id)).toEqual(["a"]);
  });

  it("задачи без срока не теряются, а идут отдельно", () => {
    const r = bucketByUrgency([t("a", null)], 7, NOW);
    expect(r.undated.map((x) => x.id)).toEqual(["a"]);
    expect(r.later).toBe(0);
  });

  it("самая давняя просрочка первой", () => {
    const r = bucketByUrgency([t("a", "2026-10-10T00:00:00Z"), t("b", "2026-09-01T00:00:00Z")], 7, NOW);
    expect(r.overdue.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("граница горизонта включается", () => {
    const r = bucketByUrgency([t("a", "2026-10-22T00:00:00Z")], 7, NOW);
    expect(r.soon.map((x) => x.id)).toEqual(["a"]);
    expect(r.later).toBe(0);
  });
});

describe("milestonesAtRisk", () => {
  const m = (id: string, planned: string | null, actual: string | null = null) =>
    ({ id, name: id, planned_date: planned, actual_date: actual });

  it("пропущенные вперёд, приближающиеся следом, достигнутые не возвращаются", () => {
    const r = milestonesAtRisk(
      [m("skoro", "2026-10-18T00:00:00Z"), m("propushchena", "2026-10-01T00:00:00Z"), m("gotova", "2026-09-01T00:00:00Z", "2026-09-02T00:00:00Z")],
      7, NOW,
    );
    expect(r.map((x) => x.id)).toEqual(["propushchena", "skoro"]);
    expect(r[0].missed).toBe(true);
    expect(r[0].days).toBe(14);
  });

  it("веха без плановой даты в расчёт не идёт", () => {
    expect(milestonesAtRisk([m("bez", null)], 7, NOW)).toEqual([]);
  });

  it("веха дальше горизонта не тревожит", () => {
    expect(milestonesAtRisk([m("dalekaya", "2026-12-01T00:00:00Z")], 7, NOW)).toEqual([]);
  });
});

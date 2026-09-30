import { describe, it, expect } from "vitest";
import { computeWorkload, type WorkloadTask } from "@/lib/workload";

/**
 * Загрузка людей. Проверяется на окнах, где ответ считается в уме: число
 * одновременных задач — единственное, что можно честно посчитать по датам, и
 * ошибка в нём выглядела бы правдоподобно.
 */
const d = (iso: string) => `${iso}T00:00:00.000Z`;
const t = (id: string, who: string | null, start: string | null, end: string | null, done = false): WorkloadTask => ({
  id, title: id, assignee_id: who, start: start && d(start), end: end && d(end), is_completed: done,
});
const NOW = new Date(d("2026-10-15"));
const WIN = [d("2026-10-01"), d("2026-10-31")] as const;

describe("computeWorkload", () => {
  it("считает пик одновременных задач и день пика", () => {
    const r = computeWorkload(
      [t("a", "ivan", "2026-10-01", "2026-10-20"), t("b", "ivan", "2026-10-10", "2026-10-25"), t("c", "ivan", "2026-10-12", "2026-10-14")],
      WIN[0], WIN[1], NOW,
    );
    const ivan = r.people.find((p) => p.assignee_id === "ivan")!;
    expect(ivan.tasks_in_window).toBe(3);
    expect(ivan.peak_concurrent).toBe(3);
    expect(ivan.peak_day!.slice(0, 10)).toBe("2026-10-12");
  });

  it("задачи вне окна не считаются", () => {
    const r = computeWorkload([t("a", "ivan", "2026-08-01", "2026-08-10")], WIN[0], WIN[1], NOW);
    expect(r.people).toEqual([]);
  });

  it("выполненные задачи ничью неделю не занимают", () => {
    const r = computeWorkload([t("a", "ivan", "2026-10-01", "2026-10-20", true)], WIN[0], WIN[1], NOW);
    expect(r.people).toEqual([]);
  });

  it("задача без начала считается точкой в день срока", () => {
    const r = computeWorkload([t("a", "ivan", null, "2026-10-05")], WIN[0], WIN[1], NOW);
    expect(r.people[0].peak_concurrent).toBe(1);
    expect(r.people[0].peak_day!.slice(0, 10)).toBe("2026-10-05");
  });

  it("задачи без срока учитываются отдельно, а не в плотности", () => {
    const r = computeWorkload([t("a", "ivan", null, null)], WIN[0], WIN[1], NOW);
    expect(r.people[0].undated).toBe(1);
    expect(r.people[0].peak_concurrent).toBe(0);
    expect(r.skipped_no_dates).toBe(1);
  });

  it("просроченные считаются по текущей дате", () => {
    const r = computeWorkload(
      [t("a", "ivan", "2026-10-01", "2026-10-10"), t("b", "ivan", "2026-10-01", "2026-10-20")],
      WIN[0], WIN[1], NOW,
    );
    expect(r.people[0].overdue).toBe(1);
  });

  it("задачи без исполнителя считаются отдельно: чья загрузка — неизвестно", () => {
    const r = computeWorkload([t("a", null, "2026-10-01", "2026-10-10")], WIN[0], WIN[1], NOW);
    expect(r.unassigned).toBe(1);
    expect(r.people).toEqual([]);
  });

  it("самые загруженные идут первыми", () => {
    const r = computeWorkload(
      [
        t("a", "ivan", "2026-10-01", "2026-10-20"),
        t("b", "ivan", "2026-10-02", "2026-10-20"),
        t("c", "olga", "2026-10-03", "2026-10-05"),
      ],
      WIN[0], WIN[1], NOW,
    );
    expect(r.people.map((p) => p.assignee_id)).toEqual(["ivan", "olga"]);
  });
});

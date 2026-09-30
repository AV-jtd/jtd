import { describe, it, expect } from "vitest";
import { computeCriticalPath, type CpmLink, type CpmNode } from "@/lib/criticalPath";

/**
 * Запас и критический путь. Проверяется на цепочках, где ответ считается в
 * уме: если расчёт разойдётся с арифметикой, разойдётся он тихо — числа всегда
 * выглядят правдоподобно.
 */

const d = (iso: string) => `${iso}T00:00:00.000Z`;
const link = (from: string, to: string, lag = 0, type = "FS"): CpmLink => ({ from, to, type, lag_days: lag });

const floatOf = (r: ReturnType<typeof computeCriticalPath>, id: string) =>
  r.nodes.find((n) => n.id === id)!.float_days;

describe("computeCriticalPath", () => {
  it("в цепочке без зазоров запаса нет ни у кого", () => {
    const nodes: CpmNode[] = [
      { id: "a", start: d("2026-10-01"), end: d("2026-10-05") },
      { id: "b", start: d("2026-10-05"), end: d("2026-10-10") },
      { id: "c", start: d("2026-10-10"), end: d("2026-10-15") },
    ];
    const r = computeCriticalPath(nodes, [link("a", "b"), link("b", "c")]);
    expect(floatOf(r, "a")).toBe(0);
    expect(floatOf(r, "b")).toBe(0);
    expect(floatOf(r, "c")).toBe(0);
    expect(r.critical_path).toEqual(["a", "b", "c"]);
    expect(r.project_end).toBe(d("2026-10-15"));
  });

  it("зазор перед преемником становится запасом предшественника", () => {
    // b начинается 10-го, а a кончается 5-го: пять дней люфта.
    const nodes: CpmNode[] = [
      { id: "a", start: d("2026-10-01"), end: d("2026-10-05") },
      { id: "b", start: d("2026-10-10"), end: d("2026-10-20") },
    ];
    const r = computeCriticalPath(nodes, [link("a", "b")]);
    expect(floatOf(r, "a")).toBe(5);
    expect(floatOf(r, "b")).toBe(0);
    expect(r.critical_path).toEqual([]); // одинокий узел цепочкой не считается
  });

  it("критическим оказывается длинная ветка, у короткой — запас", () => {
    const nodes: CpmNode[] = [
      { id: "start", start: d("2026-10-01"), end: d("2026-10-02") },
      { id: "long", start: d("2026-10-02"), end: d("2026-10-20") },
      { id: "short", start: d("2026-10-02"), end: d("2026-10-05") },
      { id: "end", start: d("2026-10-20"), end: d("2026-10-25") },
    ];
    const r = computeCriticalPath(nodes, [
      link("start", "long"),
      link("start", "short"),
      link("long", "end"),
      link("short", "end"),
    ]);
    expect(floatOf(r, "long")).toBe(0);
    expect(floatOf(r, "short")).toBe(15);
    expect(r.critical_path).toEqual(["start", "long", "end"]);
  });

  it("лаг съедает запас", () => {
    const nodes: CpmNode[] = [
      { id: "a", start: d("2026-10-01"), end: d("2026-10-05") },
      { id: "b", start: d("2026-10-10"), end: d("2026-10-20") },
    ];
    // b обязан начаться не раньше, чем через 5 дней после a — запаса не остаётся.
    const r = computeCriticalPath(nodes, [link("a", "b", 5)]);
    expect(floatOf(r, "a")).toBe(0);
  });

  it("узел с просроченным сроком уходит в отрицательный запас", () => {
    const nodes: CpmNode[] = [
      { id: "a", start: d("2026-10-01"), end: d("2026-10-12") },
      { id: "b", start: d("2026-10-05"), end: d("2026-10-20") },
    ];
    // a кончается позже, чем b начинается: связь уже нарушена.
    const r = computeCriticalPath(nodes, [link("a", "b")]);
    expect(floatOf(r, "a")).toBe(-7);
    expect(r.nodes.find((n) => n.id === "a")!.critical).toBe(true);
  });

  it("связи не-FS пропускаются и считаются", () => {
    const nodes: CpmNode[] = [
      { id: "a", start: d("2026-10-01"), end: d("2026-10-05") },
      { id: "b", start: d("2026-10-10"), end: d("2026-10-20") },
    ];
    const r = computeCriticalPath(nodes, [link("a", "b", 0, "SS")]);
    expect(r.ignored_links).toBe(1);
    expect(floatOf(r, "a")).toBe(15); // связь в расчёт не вошла
  });

  it("узлы без срока в расчёт не берутся", () => {
    const r = computeCriticalPath(
      [{ id: "a", end: null }, { id: "b", start: d("2026-10-01"), end: d("2026-10-05") }],
      [link("a", "b")],
    );
    expect(r.nodes.map((n) => n.id)).toEqual(["b"]);
  });

  it("кольцо называется, а не заминается", () => {
    const nodes: CpmNode[] = [
      { id: "a", start: d("2026-10-01"), end: d("2026-10-05") },
      { id: "b", start: d("2026-10-05"), end: d("2026-10-10") },
    ];
    const r = computeCriticalPath(nodes, [link("a", "b"), link("b", "a")]);
    expect(r.cycle).not.toBeNull();
    expect(r.cycle!.length).toBeGreaterThan(1);
  });

  it("пустой вход — пустой ответ, без исключения", () => {
    const r = computeCriticalPath([], []);
    expect(r.nodes).toEqual([]);
    expect(r.project_end).toBeNull();
  });

  it("задача-точка без начала считается нулевой длительности", () => {
    const nodes: CpmNode[] = [
      { id: "a", start: d("2026-10-01"), end: d("2026-10-05") },
      { id: "point", end: d("2026-10-06") },
    ];
    const r = computeCriticalPath(nodes, [link("a", "point")]);
    // Поздний финиш точки — дата проекта, её поздний старт тот же, значит у a
    // остаётся один день запаса.
    expect(floatOf(r, "a")).toBe(1);
  });
});

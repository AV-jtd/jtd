import { describe, it, expect } from "vitest";
import { layoutPlan, planSpanDays, type TemplateItem, type TemplateLink } from "@/lib/planTemplate";

/**
 * План по образцу. Здесь проверяется главное обещание сценария «сделай по
 * примеру такого-то проекта»: форма образца сохраняется, а даты считаются от
 * новой точки, а не повторяют прошлогодние числа.
 */

const d = (iso: string) => `${iso}T00:00:00.000Z`;
const day = (iso: string) => iso.slice(0, 10);

const task = (id: string, title: string, start: string, end: string): TemplateItem => ({
  id, kind: "task", title, start: d(start), end: d(end),
});
const milestone = (id: string, title: string, on: string): TemplateItem => ({
  id, kind: "milestone", title, start: null, end: d(on),
});
const link = (from: string, to: string, lag = 0): TemplateLink => ({ from, to, type: "FS", lag_days: lag });

// Образец: выбор → закупка → приёмка (веха), между задачами связи.
const template: TemplateItem[] = [
  task("t1", "Выбор поставщика", "2025-03-01", "2025-03-11"),
  task("t2", "Закупка", "2025-03-11", "2025-04-10"),
  milestone("m1", "Приёмка", "2025-04-20"),
];
const links = [link("t1", "t2"), link("t2", "m1")];

describe("layoutPlan", () => {
  it("сохраняет форму и считает от новой даты", () => {
    const r = layoutPlan({ items: template, links, startDate: d("2026-10-01") });
    expect(r.problems).toEqual([]);
    expect(r.items.map((i) => [i.title, day(i.end)])).toEqual([
      ["Выбор поставщика", "2026-10-11"],
      ["Закупка", "2026-11-10"],
      ["Приёмка", "2026-11-20"],
    ]);
    // Промежутки те же, что в образце: 10, 30 и 10 дней.
    expect(r.items[0].offset_end_days).toBe(10);
    expect(r.items[2].offset_end_days).toBe(50);
  });

  it("масштаб сжимает план, сохраняя порядок", () => {
    const r = layoutPlan({ items: template, links, startDate: d("2026-10-01"), scale: 0.5 });
    expect(r.items.map((i) => day(i.end))).toEqual(["2026-10-06", "2026-10-21", "2026-10-26"]);
    expect(planSpanDays(r.items)).toBe(25);
  });

  it("правка «поставь на дату» двигает и то, что стоит за ней", () => {
    const r = layoutPlan({
      items: template,
      links,
      startDate: d("2026-10-01"),
      overrides: [{ match: "Закупка", new_date: d("2026-12-01") }],
    });
    expect(r.problems).toEqual([]);
    const byTitle = new Map(r.items.map((i) => [i.title, i]));
    expect(day(byTitle.get("Закупка")!.end)).toBe("2026-12-01");
    expect(byTitle.get("Закупка")!.overridden).toBe(true);
    // Приёмка стояла за закупкой — её каскад отодвинул.
    expect(new Date(byTitle.get("Приёмка")!.end) >= new Date(d("2026-12-01"))).toBe(true);
    expect(byTitle.get("Приёмка")!.moved_by_links).toBe(true);
    // А то, что стояло раньше, не двигалось.
    expect(day(byTitle.get("Выбор поставщика")!.end)).toBe("2026-10-11");
  });

  it("правка сдвигом считается от разложенной даты", () => {
    const r = layoutPlan({
      items: template,
      links,
      startDate: d("2026-10-01"),
      overrides: [{ match: "Приёмка", shift_days: 7 }],
    });
    const ms = r.items.find((i) => i.title === "Приёмка")!;
    expect(day(ms.end)).toBe("2026-11-27");
  });

  it("правка переименовывает и исключает", () => {
    const r = layoutPlan({
      items: template,
      links,
      startDate: d("2026-10-01"),
      overrides: [
        { match: "Выбор поставщика", title: "Выбор поставщика оборудования" },
        { match: "Закупка", skip: true },
      ],
    });
    expect(r.items.map((i) => i.title)).toEqual(["Выбор поставщика оборудования", "Приёмка"]);
    expect(r.skipped.some((s) => s.title === "Закупка")).toBe(true);
    // Связи с исключённым элементом отброшены и посчитаны.
    expect(r.skipped.some((s) => s.title.startsWith("связей"))).toBe(true);
    expect(r.links).toEqual([]);
  });

  it("несопоставленная правка отменяет запись, а не применяется молча", () => {
    const r = layoutPlan({
      items: template, links, startDate: d("2026-10-01"),
      overrides: [{ match: "Монтаж", new_date: d("2026-12-01") }],
    });
    expect(r.problems.join(" ")).toContain("нет такого элемента");
  });

  it("двусмысленная правка отклоняется с перечнем", () => {
    const items = [
      task("a", "Согласование сметы", "2025-03-01", "2025-03-05"),
      task("b", "Согласование договора", "2025-03-05", "2025-03-10"),
    ];
    const r = layoutPlan({
      items, links: [], startDate: d("2026-10-01"),
      overrides: [{ match: "Согласование", shift_days: 3 }],
    });
    expect(r.problems.join(" ")).toContain("подходит к 2");
    expect(r.problems.join(" ")).toContain("Согласование сметы");
  });

  it("точное совпадение названия важнее частичного", () => {
    const items = [
      task("a", "Закупка", "2025-03-01", "2025-03-05"),
      task("b", "Закупка запчастей", "2025-03-05", "2025-03-10"),
    ];
    const r = layoutPlan({
      items, links: [], startDate: d("2026-10-01"),
      overrides: [{ match: "закупка", shift_days: 2 }],
    });
    expect(r.problems).toEqual([]);
    expect(r.items.find((i) => i.title === "Закупка")!.overridden).toBe(true);
    expect(r.items.find((i) => i.title === "Закупка запчастей")!.overridden).toBe(false);
  });

  it("элементы образца без срока в план не переносятся и названы", () => {
    const items = [...template, { id: "t9", kind: "task" as const, title: "Без срока", start: null, end: null }];
    const r = layoutPlan({ items, links, startDate: d("2026-10-01") });
    expect(r.items.map((i) => i.title)).not.toContain("Без срока");
    expect(r.skipped.some((s) => s.title === "Без срока")).toBe(true);
  });

  it("у вехи начала не появляется", () => {
    const r = layoutPlan({ items: template, links, startDate: d("2026-10-01") });
    expect(r.items.find((i) => i.kind === "milestone")!.start).toBeNull();
  });

  it("длительность задачи сохраняется при переносе даты", () => {
    const r = layoutPlan({
      items: template, links, startDate: d("2026-10-01"),
      overrides: [{ match: "Закупка", new_date: d("2026-12-01") }],
    });
    const it = r.items.find((i) => i.title === "Закупка")!;
    expect(day(it.start!)).toBe("2026-11-01"); // те же 30 дней
  });

  it("образец без дат — понятный отказ, а не пустой план", () => {
    const r = layoutPlan({
      items: [{ id: "x", kind: "task", title: "Что-то", start: null, end: null }],
      links: [], startDate: d("2026-10-01"),
    });
    expect(r.problems.join(" ")).toContain("нет ни одного элемента со сроком");
  });

  it("нераспознанная дата начала — отказ", () => {
    const r = layoutPlan({ items: template, links, startDate: "в октябре" });
    expect(r.problems.join(" ")).toContain("Не разобрал дату");
  });

  it("масштаб вне разумного отклоняется", () => {
    const r = layoutPlan({ items: template, links, startDate: d("2026-10-01"), scale: 0 });
    expect(r.problems.join(" ")).toContain("Масштаб");
  });
});

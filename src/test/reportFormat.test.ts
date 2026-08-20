import { describe, it, expect } from "vitest";
import {
  byDeadline,
  daysLate,
  delta,
  driftDays,
} from "../../supabase/functions/_shared/reportFormat";

describe("delta — подпись изменения к прошлой неделе", () => {
  it("молчит, когда прошлого снимка нет", () => {
    // Первый отчёт по проекту: сравнивать не с чем, "+7" был бы враньём.
    expect(delta(7, undefined, "down")).toBe("");
    expect(delta(7, null, "down")).toBe("");
  });

  it("молчит, когда ничего не изменилось", () => {
    expect(delta(7, 7, "down")).toBe("");
  });

  it("рост просрочки — плохо, рост закрытых — хорошо", () => {
    expect(delta(7, 4, "down")).toContain("🔴");
    expect(delta(7, 4, "down")).toContain("+3");
    expect(delta(7, 4, "up")).toContain("🟢");
  });

  it("падение просрочки — хорошо, падение закрытых — плохо", () => {
    expect(delta(4, 7, "down")).toContain("🟢");
    expect(delta(4, 7, "down")).toContain("−3");
    expect(delta(4, 7, "up")).toContain("🔴");
  });

  it("neutral показывает изменение без оценки", () => {
    // Создание задач: рост может значить и живой проект, и расползание
    // объёма. Цвет тут подсказывал бы вывод, которого из числа не следует.
    expect(delta(11, 5, "neutral")).toContain("+6");
    expect(delta(11, 5, "neutral")).not.toContain("🔴");
    expect(delta(11, 5, "neutral")).not.toContain("🟢");
  });

  it("ноль в прошлом — валидная точка отсчёта, а не «нет данных»", () => {
    // Отличать 0 от undefined критично: неделя без просрочек — это факт,
    // и рост с нуля до трёх должен быть виден.
    expect(delta(3, 0, "down")).toContain("+3");
  });
});

describe("daysLate — насколько задача просрочена", () => {
  const dayStart = new Date("2026-08-20T00:00:00Z");

  it("считает целые дни до начала суток", () => {
    expect(daysLate("2026-08-17T00:00:00Z", dayStart)).toBe(3);
  });

  it("срок сегодня — не просрочка", () => {
    expect(daysLate("2026-08-20T00:00:00Z", dayStart)).toBe(0);
  });

  it("будущий срок не даёт отрицательных дней", () => {
    expect(daysLate("2026-08-25T00:00:00Z", dayStart)).toBe(0);
  });
});

describe("driftDays — насколько уехал срок", () => {
  it("перенос вперёд — положительный", () => {
    expect(driftDays("2026-08-10T00:00:00Z", "2026-08-17T00:00:00Z")).toBe(7);
  });

  it("подтянули срок — отрицательный", () => {
    expect(driftDays("2026-08-17T00:00:00Z", "2026-08-10T00:00:00Z")).toBe(-7);
  });
});

describe("byDeadline — порядок списков", () => {
  it("сортирует по возрастанию: понедельник раньше пятницы", () => {
    // Ровно тот дефект, который чинится: без сортировки slice(0,5) прятал
    // ближайшие дедлайны за дальними.
    const tasks = [
      { title: "пятница", deadline: "2026-08-21T00:00:00Z" },
      { title: "понедельник", deadline: "2026-08-17T00:00:00Z" },
      { title: "среда", deadline: "2026-08-19T00:00:00Z" },
    ];
    expect([...tasks].sort(byDeadline).map(t => t.title)).toEqual([
      "понедельник",
      "среда",
      "пятница",
    ]);
  });

  it("самая давняя просрочка оказывается первой", () => {
    const overdue = [
      { title: "вчера", deadline: "2026-08-19T00:00:00Z" },
      { title: "три месяца назад", deadline: "2026-05-20T00:00:00Z" },
    ];
    expect([...overdue].sort(byDeadline)[0].title).toBe("три месяца назад");
  });

  it("задачи без срока уходят в конец", () => {
    const tasks = [
      { title: "без срока", deadline: null },
      { title: "со сроком", deadline: "2026-08-21T00:00:00Z" },
    ];
    expect([...tasks].sort(byDeadline).map(t => t.title)).toEqual([
      "со сроком",
      "без срока",
    ]);
  });

  it("две задачи без срока не ломают сортировку", () => {
    const tasks = [{ deadline: null }, { deadline: null }];
    expect(() => [...tasks].sort(byDeadline)).not.toThrow();
  });
});

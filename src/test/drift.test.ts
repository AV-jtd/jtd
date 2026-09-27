import { describe, it, expect } from "vitest";
import { driftDays, hasDrift, MAX_REASONABLE_DRIFT_DAYS } from "@/lib/drift";

describe("driftDays — обычные случаи", () => {
  it("срок отодвинули — положительный сдвиг", () => {
    expect(driftDays("2026-09-01T00:00:00Z", "2026-09-22T00:00:00Z")).toBe(21);
  });

  it("срок подтянули — отрицательный", () => {
    expect(driftDays("2026-09-22T00:00:00Z", "2026-09-01T00:00:00Z")).toBe(-21);
  });

  it("срок не меняли — ноль, а не прочерк", () => {
    // Ноль и null означают разное: «не сдвигали» против «посчитать нельзя».
    expect(driftDays("2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z")).toBe(0);
  });
});

describe("driftDays — случаи из постановки задачи", () => {
  it("пустая базовая дата: прочерк, а не число", () => {
    expect(driftDays(null, "2026-09-22T00:00:00Z")).toBeNull();
    expect(driftDays(undefined, "2026-09-22T00:00:00Z")).toBeNull();
    expect(driftDays("", "2026-09-22T00:00:00Z")).toBeNull();
  });

  it("дата в будущем считается нормально, если в пределах разумного", () => {
    expect(driftDays("2026-09-01T00:00:00Z", "2027-09-01T00:00:00Z")).toBe(365);
  });

  it("базовая дата раньше создания проекта — год 0001 даёт прочерк", () => {
    // Ровно тот случай, что дал в портфеле +739 251 день: значение не пустое,
    // прежняя проверка на непустоту его пропускала.
    expect(driftDays("0001-01-01T00:00:00Z", "2026-09-22T00:00:00Z")).toBeNull();
  });
});

describe("driftDays — предел разумного", () => {
  it("ровно на пределе ещё показывается", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date(from.getTime() + MAX_REASONABLE_DRIFT_DAYS * 86400000);
    expect(driftDays(from.toISOString(), to.toISOString())).toBe(MAX_REASONABLE_DRIFT_DAYS);
  });

  it("на день сверх предела — прочерк", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date(from.getTime() + (MAX_REASONABLE_DRIFT_DAYS + 1) * 86400000);
    expect(driftDays(from.toISOString(), to.toISOString())).toBeNull();
  });

  it("предел работает и в обратную сторону", () => {
    const to = new Date("2026-01-01T00:00:00Z");
    const from = new Date(to.getTime() + (MAX_REASONABLE_DRIFT_DAYS + 1) * 86400000);
    expect(driftDays(from.toISOString(), to.toISOString())).toBeNull();
  });

  it("ни один результат не превышает предел по модулю", () => {
    const cases: Array<[string, string]> = [
      ["0001-01-01T00:00:00Z", "2026-09-22T00:00:00Z"],
      ["1970-01-01T00:00:00Z", "2026-09-22T00:00:00Z"],
      ["2026-09-22T00:00:00Z", "9999-12-31T00:00:00Z"],
    ];
    for (const [a, b] of cases) {
      const d = driftDays(a, b);
      expect(d === null || Math.abs(d) <= MAX_REASONABLE_DRIFT_DAYS).toBe(true);
    }
  });
});

describe("driftDays — мусор вместо даты", () => {
  it("неразбираемая строка даёт прочерк, а не NaN", () => {
    expect(driftDays("не дата", "2026-09-22T00:00:00Z")).toBeNull();
    expect(driftDays("2026-09-22T00:00:00Z", "не дата")).toBeNull();
  });
});

describe("hasDrift — признак и величина следуют одному правилу", () => {
  it("испорченная базовая дата не считается сдвигом", () => {
    // Раньше условием было «обе даты есть и различаются», поэтому такая
    // задача попадала в счётчик дрифта, хотя величину показать было нельзя.
    expect(hasDrift("0001-01-01T00:00:00Z", "2026-09-22T00:00:00Z")).toBe(false);
  });

  it("настоящий сдвиг считается", () => {
    expect(hasDrift("2026-09-01T00:00:00Z", "2026-09-22T00:00:00Z")).toBe(true);
  });

  it("без сдвига — false", () => {
    expect(hasDrift("2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z")).toBe(false);
  });

  it("пустая дата — false", () => {
    expect(hasDrift(null, "2026-09-22T00:00:00Z")).toBe(false);
  });
});

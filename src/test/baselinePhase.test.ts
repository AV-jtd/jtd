import { describe, it, expect } from "vitest";
import { shouldKeepBaselineInStep } from "@/lib/mcp/tools/_shared";

/**
 * Базовая дата на этапе планирования.
 *
 * Правило приложения: пока план составляется, базовая дата идёт за сроком —
 * значит сдвига нет. После фиксации она остаётся на месте, и разница становится
 * отклонением. Коннектор этого не делал, и любой срок, проставленный через
 * Claude на этапе планирования, показывался в портфеле сдвигом.
 */

describe("shouldKeepBaselineInStep", () => {
  it("этап планирования — базовая дата идёт за сроком", () => {
    expect(shouldKeepBaselineInStep("planning", null)).toBe(true);
  });

  it("план зафиксирован — базовая дата остаётся, сдвиг записывается", () => {
    expect(shouldKeepBaselineInStep("locked", null)).toBe(false);
  });

  it("подпроект зафиксирован, а родитель ещё планируется — считаем планированием", () => {
    expect(shouldKeepBaselineInStep("locked", "planning")).toBe(true);
  });

  it("оба зафиксированы — сдвиг записывается", () => {
    expect(shouldKeepBaselineInStep("locked", "locked")).toBe(false);
  });

  // Неизвестный статус трактуем как зафиксированный: пропустить настоящий сдвиг
  // хуже, чем показать лишний — сдвиг видно, а его отсутствие никто не заметит.
  it("неизвестный или пустой статус — как зафиксированный", () => {
    expect(shouldKeepBaselineInStep(undefined, undefined)).toBe(false);
    expect(shouldKeepBaselineInStep(null, null)).toBe(false);
    expect(shouldKeepBaselineInStep("что-то новое", null)).toBe(false);
  });
});

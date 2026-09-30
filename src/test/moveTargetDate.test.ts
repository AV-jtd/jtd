import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTargetDate } from "@/lib/mcp/tools/_dates";

/**
 * Разбор целевой даты переноса. Проверяется путь с явной датой — база для него
 * не нужна, поэтому клиент не подставляется вовсе: вызов к нему провалил бы
 * тест, что и требуется.
 */
const noDb = null as unknown as SupabaseClient;

describe("parseTargetDate", () => {
  it("берёт явную дату", async () => {
    const r = await parseTargetDate(noDb, { id: "x", new_deadline: "2026-12-01T00:00:00Z" });
    expect("date" in r && r.date.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("требует ровно одно из двух: дату или сдвиг", async () => {
    const both = await parseTargetDate(noDb, { id: "x", new_deadline: "2026-12-01T00:00:00Z", shift_days: 5 });
    expect("error" in both).toBe(true);
    const neither = await parseTargetDate(noDb, { id: "x" });
    expect("error" in neither).toBe(true);
  });

  it("отклоняет неразбираемую дату", async () => {
    const r = await parseTargetDate(noDb, { id: "x", new_deadline: "в пятницу" });
    expect("error" in r && r.error).toContain("Не разобрал");
  });

  // Тот же класс порчи, что дал в портфеле сдвиг на 739 251 день.
  it("отклоняет год вне 2000–2100", async () => {
    for (const bad of ["0002-12-01T00:00:00Z", "3000-01-01T00:00:00Z"]) {
      const r = await parseTargetDate(noDb, { id: "x", new_deadline: bad });
      expect("error" in r && r.error).toContain("вне разумного диапазона");
    }
  });

  it("сдвиг на ноль дней отклоняется до обращения к базе", async () => {
    const r = await parseTargetDate(noDb, { id: "x", shift_days: 0 });
    expect("error" in r && r.error).toContain("ноль");
  });
});

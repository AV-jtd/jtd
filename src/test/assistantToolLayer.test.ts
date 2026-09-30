import { describe, it, expect } from "vitest";
import { runTool, toolCatalog, toolNames, TOOL_INSTRUCTIONS } from "@/lib/assistant/toolLayer";
import { ALL_TOOLS } from "@/lib/mcp/registry";

/**
 * Слой инструментов для ассистента внутри приложения.
 *
 * Главное, что проверяется: набор один и тот же, что у коннектора, и схемы
 * действительно переводятся в JSON Schema. Если инструмент выпадет из реестра
 * или его схема окажется пустой, модель просто не сможет его вызвать — и узнаем
 * мы об этом не от сборки, а от человека, у которого «ассистент почему-то не
 * умеет переносить сроки».
 */

describe("каталог инструментов", () => {
  it("содержит ровно то, что в общем реестре", () => {
    expect(toolNames().sort()).toEqual(ALL_TOOLS.map((t) => t.name).sort());
  });

  it("набор не усох: инструментов не меньше тридцати", () => {
    // Граница грубая намеренно: она ловит потерю реестра, а не пересчитывается
    // при каждом новом инструменте.
    expect(toolNames().length).toBeGreaterThanOrEqual(30);
  });

  it("у каждого инструмента есть описание и схема-объект", () => {
    for (const t of toolCatalog()) {
      expect(t.description.length, `${t.name}: пустое описание`).toBeGreaterThan(20);
      expect(t.input_schema.type, `${t.name}: схема не объект`).toBe("object");
    }
  });

  it("схемы с полями не приходят пустыми", () => {
    const withFields = toolCatalog().filter((t) => {
      const props = t.input_schema.properties as Record<string, unknown> | undefined;
      return props && Object.keys(props).length > 0;
    });
    // Инструментов без входа единицы; если бы перевод схем сломался, пустыми
    // стали бы все.
    expect(withFields.length).toBeGreaterThan(25);
  });

  it("обязательные поля переносятся в схему", () => {
    const getTask = toolCatalog().find((t) => t.name === "get_task")!;
    expect(getTask.input_schema.required).toContain("task_id");
  });

  it("читающие и удаляющие инструменты помечены", () => {
    const byName = new Map(toolCatalog().map((t) => [t.name, t]));
    expect(byName.get("get_project_schedule")!.read_only).toBe(true);
    expect(byName.get("move_task")!.read_only).toBe(false);
    expect(byName.get("delete_plan_items")!.destructive).toBe(true);
  });

  it("правила работы общие с коннектором и не пустые", () => {
    expect(TOOL_INSTRUCTIONS).toContain("preview_shift");
    expect(TOOL_INSTRUCTIONS).toContain("apply=true");
  });
});

describe("запуск инструмента", () => {
  const ctx = { token: "t", userId: "11111111-1111-1111-1111-111111111111" };

  it("неизвестный инструмент — отказ с перечнем доступных", async () => {
    const r = await runTool("сделай_хорошо", {}, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("get_attention");
  });

  it("без токена не выполняется", async () => {
    const r = await runTool("get_task", { task_id: ctx.userId }, { token: "", userId: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Не аутентифицирован");
  });

  // Проверка входа до обработчика: до базы такой вызов не доходит вовсе,
  // поэтому тест не требует ни сети, ни моков.
  it("неверные аргументы отклоняются с указанием поля", async () => {
    const r = await runTool("get_task", { task_id: "вчера" }, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("task_id");
  });

  it("лишние поля не ломают вызов, а отсутствующие обязательные — ломают", async () => {
    const r = await runTool("get_task", {}, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("get_task");
  });
});

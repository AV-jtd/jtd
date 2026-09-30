import { describe, it, expect } from "vitest";
import { findCycle } from "@/lib/mcp/tools/_cascade";

/**
 * Кольца в связях плана. Проверка идёт до записи, и другого шанса нет:
 * записанный и потом снятый цикл успеет утащить даты каскадом, а откатывать
 * их нечем.
 */
const e = (from: string, to: string) => ({ from, to });

describe("findCycle", () => {
  it("цепочка без кольца — null", () => {
    expect(findCycle([e("a", "b"), e("b", "c"), e("c", "d")])).toBeNull();
  });

  it("кольцо из двух", () => {
    const c = findCycle([e("a", "b"), e("b", "a")]);
    expect(c).not.toBeNull();
    expect(c!.length).toBeGreaterThanOrEqual(3); // a → b → a
  });

  it("кольцо длиннее двух находится", () => {
    const c = findCycle([e("a", "b"), e("b", "c"), e("c", "a")]);
    expect(new Set(c)).toEqual(new Set(["a", "b", "c"]));
  });

  it("кольцо в стороне от основной цепочки тоже находится", () => {
    const c = findCycle([e("a", "b"), e("x", "y"), e("y", "z"), e("z", "x")]);
    expect(new Set(c)).toEqual(new Set(["x", "y", "z"]));
  });

  it("ромб кольцом не является", () => {
    expect(findCycle([e("a", "b"), e("a", "c"), e("b", "d"), e("c", "d")])).toBeNull();
  });

  it("петля на себе — кольцо", () => {
    expect(findCycle([e("a", "a")])).not.toBeNull();
  });

  it("пустой набор — null", () => {
    expect(findCycle([])).toBeNull();
  });

  // Смешанные концы: новый элемент плана по ключу и существующий по UUID.
  it("кольцо через новый и существующий элемент находится", () => {
    const uuid = "11111111-1111-1111-1111-111111111111";
    const c = findCycle([e(uuid, "новая-задача"), e("новая-задача", uuid)]);
    expect(c).not.toBeNull();
  });
});

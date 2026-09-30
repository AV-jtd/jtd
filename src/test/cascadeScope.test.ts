import { describe, it, expect } from "vitest";
import { dependencyComponent } from "@/lib/mcp/tools/_cascade";

/**
 * Область каскада. Взять слишком мало — часть цепочки не пересчитается и
 * расписание разъедется молча; взять слишком много — вернёмся к выгрузке всех
 * 5720 задач, из которых PostgREST отдаёт тысячу.
 */

const dep = (p: string, s: string) => ({
  id: `${p}-${s}`,
  predecessor_id: p,
  successor_id: s,
  dependency_type: "FS",
  lag_days: 0,
  predecessor_entity_type: "task",
  successor_entity_type: "task",
});

describe("dependencyComponent", () => {
  it("берёт всю цепочку вперёд", () => {
    const scope = dependencyComponent([dep("a", "b"), dep("b", "c"), dep("c", "d")], ["a"]);
    expect([...scope].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("берёт и то, что стоит выше по цепочке", () => {
    const scope = dependencyComponent([dep("a", "b"), dep("b", "c")], ["c"]);
    expect([...scope].sort()).toEqual(["a", "b", "c"]);
  });

  it("не тащит чужую компоненту", () => {
    const scope = dependencyComponent([dep("a", "b"), dep("x", "y")], ["a"]);
    expect([...scope].sort()).toEqual(["a", "b"]);
  });

  it("собирает узлы, сходящиеся к одному преемнику", () => {
    const scope = dependencyComponent([dep("a", "z"), dep("b", "z")], ["a"]);
    expect([...scope].sort()).toEqual(["a", "b", "z"]);
  });

  it("не зацикливается на кольце", () => {
    const scope = dependencyComponent([dep("a", "b"), dep("b", "c"), dep("c", "a")], ["a"]);
    expect([...scope].sort()).toEqual(["a", "b", "c"]);
  });

  it("узел без связей — сам по себе", () => {
    expect([...dependencyComponent([dep("x", "y")], ["lone"])]).toEqual(["lone"]);
  });
});

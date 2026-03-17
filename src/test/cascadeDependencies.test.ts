import { describe, it, expect } from "vitest";
import { computeCascadeUpdates } from "@/lib/cascadeDependencies";
import type { TaskDependency } from "@/hooks/useDependencies";

const makeDep = (predId: string, succId: string, type = "FS", lag = 0): TaskDependency => ({
  id: `dep-${predId}-${succId}`,
  predecessor_id: predId,
  successor_id: succId,
  dependency_type: type,
  lag_days: lag,
  created_by: "user1",
  created_at: "2026-01-01T00:00:00Z",
  predecessor_entity_type: "task",
  successor_entity_type: "task",
});

describe("computeCascadeUpdates", () => {
  it("should push successor forward when predecessor deadline moves forward", () => {
    const deps = [makeDep("A", "B")];
    const entities = new Map([
      ["A", { id: "A", deadline: "2026-03-05T00:00:00Z", start_at: "2026-03-01T00:00:00Z", created_at: "2026-03-01T00:00:00Z" }],
      ["B", { id: "B", deadline: "2026-03-10T00:00:00Z", start_at: "2026-03-06T00:00:00Z", created_at: "2026-03-06T00:00:00Z" }],
    ]);
    // Move A deadline from Mar 5 to Mar 8 (+3 days)
    const result = computeCascadeUpdates("A", new Date("2026-03-08"), new Date("2026-03-05"), deps, entities);
    expect(result.size).toBe(1);
    const bUpdate = result.get("B")!;
    expect(bUpdate.deadline).toBeDefined();
    expect(bUpdate.start_at).toBeDefined();
    // B should shift by 3 days
    expect(new Date(bUpdate.deadline!).toISOString()).toBe("2026-03-13T00:00:00.000Z");
    expect(new Date(bUpdate.start_at!).toISOString()).toBe("2026-03-09T00:00:00.000Z");
  });

  it("should cascade backward when deadline moves backward (negative delta)", () => {
    const deps = [makeDep("A", "B")];
    const entities = new Map([
      ["A", { id: "A", deadline: "2026-03-10T00:00:00Z", start_at: "2026-03-06T00:00:00Z", created_at: "2026-03-01T00:00:00Z" }],
      ["B", { id: "B", deadline: "2026-03-15T00:00:00Z", start_at: "2026-03-11T00:00:00Z", created_at: "2026-03-11T00:00:00Z" }],
    ]);
    // Move A deadline backward from Mar 10 to Mar 7 (-3 days)
    const result = computeCascadeUpdates("A", new Date("2026-03-07"), new Date("2026-03-10"), deps, entities);
    expect(result.size).toBe(1);
    const bUpdate = result.get("B")!;
    expect(new Date(bUpdate.deadline!).toISOString()).toBe("2026-03-12T00:00:00.000Z");
    expect(new Date(bUpdate.start_at!).toISOString()).toBe("2026-03-08T00:00:00.000Z");
  });

  it("should cascade through a chain A→B→C", () => {
    const deps = [makeDep("A", "B"), makeDep("B", "C")];
    const entities = new Map([
      ["A", { id: "A", deadline: "2026-03-05T00:00:00Z", start_at: "2026-03-01T00:00:00Z", created_at: "2026-03-01T00:00:00Z" }],
      ["B", { id: "B", deadline: "2026-03-10T00:00:00Z", start_at: "2026-03-06T00:00:00Z", created_at: "2026-03-06T00:00:00Z" }],
      ["C", { id: "C", deadline: "2026-03-15T00:00:00Z", start_at: "2026-03-11T00:00:00Z", created_at: "2026-03-11T00:00:00Z" }],
    ]);
    // Move A forward by 2 days
    const result = computeCascadeUpdates("A", new Date("2026-03-07"), new Date("2026-03-05"), deps, entities);
    expect(result.size).toBe(2);
    expect(new Date(result.get("B")!.deadline!).toISOString()).toBe("2026-03-12T00:00:00.000Z");
    expect(new Date(result.get("C")!.deadline!).toISOString()).toBe("2026-03-17T00:00:00.000Z");
  });

  it("should respect lag_days", () => {
    const deps = [makeDep("A", "B", "FS", 3)];
    const entities = new Map([
      ["A", { id: "A", deadline: "2026-03-05T00:00:00Z", created_at: "2026-03-01T00:00:00Z" }],
      ["B", { id: "B", deadline: "2026-03-15T00:00:00Z", start_at: "2026-03-10T00:00:00Z", created_at: "2026-03-10T00:00:00Z" }],
    ]);
    // Move A forward by 2 days, with lag 3: effective push = 2 + 3 = 5
    const result = computeCascadeUpdates("A", new Date("2026-03-07"), new Date("2026-03-05"), deps, entities);
    expect(result.size).toBe(1);
    expect(new Date(result.get("B")!.deadline!).toISOString()).toBe("2026-03-20T00:00:00.000Z");
    expect(new Date(result.get("B")!.start_at!).toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("should skip successor without dates", () => {
    const deps = [makeDep("A", "B")];
    const entities = new Map([
      ["A", { id: "A", deadline: "2026-03-05T00:00:00Z", created_at: "2026-03-01T00:00:00Z" }],
      ["B", { id: "B", created_at: "2026-03-06T00:00:00Z" }], // no deadline or start_at
    ]);
    const result = computeCascadeUpdates("A", new Date("2026-03-07"), new Date("2026-03-05"), deps, entities);
    expect(result.size).toBe(0); // B has no dates to shift
  });
});

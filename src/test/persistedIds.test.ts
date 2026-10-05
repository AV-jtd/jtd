import { describe, it, expect } from "vitest";
import { isPersistedId, persistedIds } from "@/lib/persistedIds";

describe("временные id не уходят в запросы", () => {
  it("отбрасывает temp- и пустые", () => {
    expect(persistedIds(["a1", "temp-123", null, "", "b2"])).toEqual(["a1", "b2"]);
  });
  it("сохранённый id проходит", () => {
    expect(isPersistedId("6e399b61-4f2b-44bb-9a30-594c12feb51a")).toBe(true);
    expect(isPersistedId("temp-6e399b61")).toBe(false);
  });
});

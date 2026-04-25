import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  startMeasure,
  getSamples,
  getStats,
  clearSamples,
  subscribe,
} from "@/lib/perf/perfMetrics";

/**
 * The metrics module commits samples on the next paint frame. In jsdom we
 * stub `requestAnimationFrame` to flush synchronously via setTimeout(0), so
 * tests can advance with `await Promise.resolve()` chains.
 */
function flushFrames(): Promise<void> {
  // Two RAFs internally → two macrotasks.
  return new Promise((r) => setTimeout(() => setTimeout(r, 0), 0));
}

beforeEach(() => {
  clearSamples();
  // jsdom provides rAF as setTimeout(16). For deterministic tests we stub it.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(performance.now()), 0) as unknown as number;
  });
});

describe("perfMetrics", () => {
  it("records a sample after the next paint", async () => {
    const end = startMeasure("click", "test.click");
    end();
    await flushFrames();
    const samples = getSamples("click");
    expect(samples).toHaveLength(1);
    expect(samples[0].label).toBe("test.click");
    expect(samples[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("ignores duplicate end() calls", async () => {
    const end = startMeasure("picker-open", "AssigneePicker");
    end();
    end();
    end();
    await flushFrames();
    expect(getSamples("picker-open")).toHaveLength(1);
  });

  it("computes p50/p95/max stats", async () => {
    // Manually feed samples by spying on now() through artificial waits.
    for (let i = 0; i < 20; i++) {
      const end = startMeasure("panel-open", "ProjectDetailPanel.mount");
      end();
      await flushFrames();
    }
    const stats = getStats("panel-open", "ProjectDetailPanel.mount");
    expect(stats.count).toBe(20);
    expect(stats.p50).toBeLessThanOrEqual(stats.p95);
    expect(stats.p95).toBeLessThanOrEqual(stats.max);
    expect(stats.mean).toBeGreaterThanOrEqual(0);
  });

  it("notifies subscribers on each commit", async () => {
    const seen: string[] = [];
    const off = subscribe((s) => seen.push(s.label));
    startMeasure("click", "a")();
    startMeasure("click", "b")();
    await flushFrames();
    off();
    expect(seen).toEqual(["a", "b"]);
  });

  it("caps the buffer at the per-category limit", async () => {
    for (let i = 0; i < 250; i++) {
      startMeasure("click", `i${i}`)();
    }
    await flushFrames();
    const samples = getSamples("click");
    // Default cap is 200.
    expect(samples.length).toBeLessThanOrEqual(200);
    // Newest sample wins.
    expect(samples[samples.length - 1].label).toBe("i249");
  });

  it("clearSamples wipes all categories", async () => {
    startMeasure("click", "x")();
    startMeasure("picker-open", "y")();
    startMeasure("panel-open", "z")();
    await flushFrames();
    clearSamples();
    expect(getSamples()).toEqual([]);
  });
});
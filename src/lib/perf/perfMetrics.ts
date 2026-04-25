/**
 * Lightweight UI latency metrics.
 *
 * Three tracked categories:
 *  - **click**: time from a user click/tap to the next paint (commit) of
 *    the component that should react. Measures perceived "tap responsiveness".
 *  - **picker-open**: time from a user pointerdown/click on a popover
 *    trigger to the popover content being mounted/painted.
 *  - **panel-open**: time from a user click on a row's "open details"
 *    button to the detail panel finishing its initial render.
 *
 * All measurements are tiny envelopes around `performance.now()` and a
 * `requestAnimationFrame` to wait for the next paint after the React commit.
 * If `performance.now()` is unavailable (SSR, very old browsers) we fall
 * back to `Date.now()` — accuracy degrades to ~1ms but the API still works.
 *
 * Samples are kept in a small ring buffer (default 200 per category) so
 * the dev overlay can render aggregates without unbounded memory growth.
 */

export type PerfCategory = "click" | "picker-open" | "panel-open";

export interface PerfSample {
  category: PerfCategory;
  /** Free-form label, e.g. "TaskItem.expand" or "AssigneePicker". */
  label: string;
  /** Duration in milliseconds (rounded to 2 decimals). */
  durationMs: number;
  /** Wall-clock timestamp when the sample finished. */
  at: number;
}

const MAX_SAMPLES_PER_CATEGORY = 200;

const buffers: Record<PerfCategory, PerfSample[]> = {
  click: [],
  "picker-open": [],
  "panel-open": [],
};

type Listener = (sample: PerfSample) => void;
const listeners = new Set<Listener>();

function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/**
 * Schedule a callback for the next paint frame. Falls back to setTimeout
 * in non-browser test environments where rAF is missing.
 */
function nextPaint(cb: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      // Two RAFs — first lands inside the commit, second lands after paint.
      requestAnimationFrame(cb);
    });
    return;
  }
  setTimeout(cb, 0);
}

function record(sample: PerfSample): void {
  const buf = buffers[sample.category];
  buf.push(sample);
  if (buf.length > MAX_SAMPLES_PER_CATEGORY) buf.shift();
  listeners.forEach((l) => {
    try { l(sample); } catch { /* listener errors must not break instrumentation */ }
  });
}

/**
 * Begin measuring a perceived-latency interaction.
 *
 * Call this synchronously inside the user-event handler (click/pointerdown).
 * Then call the returned `end()` after you've performed the state update.
 * The actual sample is committed on the next paint, so the duration reflects
 * the user's perception, not just the time spent in JS.
 */
export function startMeasure(category: PerfCategory, label: string): () => void {
  const startedAt = now();
  let ended = false;
  return function end() {
    if (ended) return;
    ended = true;
    nextPaint(() => {
      const durationMs = Math.round((now() - startedAt) * 100) / 100;
      record({ category, label, durationMs, at: Date.now() });
    });
  };
}

/** Return a snapshot of all collected samples. Mostly for the dev overlay. */
export function getSamples(category?: PerfCategory): PerfSample[] {
  if (category) return buffers[category].slice();
  return [...buffers.click, ...buffers["picker-open"], ...buffers["panel-open"]];
}

export interface PerfStats {
  count: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** Aggregate stats for one category (or one specific label inside it). */
export function getStats(category: PerfCategory, label?: string): PerfStats {
  const samples = buffers[category].filter((s) => (label ? s.label === label : true));
  if (samples.length === 0) return { count: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const sum = durations.reduce((acc, v) => acc + v, 0);
  return {
    count: durations.length,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    max: durations[durations.length - 1],
    mean: Math.round((sum / durations.length) * 100) / 100,
  };
}

/** Reset all collected samples. Tests rely on this to start clean. */
export function clearSamples(): void {
  buffers.click.length = 0;
  buffers["picker-open"].length = 0;
  buffers["panel-open"].length = 0;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Bridge to window for ad-hoc inspection from DevTools console. */
if (typeof window !== "undefined") {
  (window as unknown as { __perfMetrics?: unknown }).__perfMetrics = {
    getSamples,
    getStats,
    clearSamples,
  };
}
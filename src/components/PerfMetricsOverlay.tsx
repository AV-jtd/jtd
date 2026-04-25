import { useEffect, useState } from "react";
import { getStats, clearSamples, subscribe, type PerfCategory } from "@/lib/perf/perfMetrics";

/**
 * Floating dev overlay that surfaces aggregate UI latency stats.
 *
 * Mounted only in development (`import.meta.env.DEV`). Click the badge to
 * expand a panel with p50/p95/max for clicks, picker opens and panel opens.
 * The overlay re-renders on each new sample, but throttles via React's
 * batching — collecting samples is virtually free.
 */
const CATEGORIES: { key: PerfCategory; label: string }[] = [
  { key: "click", label: "Click → paint" },
  { key: "picker-open", label: "Picker open" },
  { key: "panel-open", label: "Panel open" },
];

export default function PerfMetricsOverlay() {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);

  useEffect(() => {
    return subscribe(() => force((n) => (n + 1) % 1_000_000));
  }, []);

  if (!import.meta.env.DEV) return null;

  return (
    <div className="fixed bottom-3 right-3 z-[9999] font-mono text-[11px] select-none">
      {open ? (
        <div className="bg-popover/95 backdrop-blur border border-border rounded-lg shadow-lg p-3 w-64 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">UI latency (ms)</span>
            <div className="flex gap-1">
              <button
                onClick={() => { clearSamples(); force((n) => n + 1); }}
                className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                title="Reset samples"
              >
                clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                ×
              </button>
            </div>
          </div>
          {CATEGORIES.map((c) => {
            const s = getStats(c.key);
            const warn = s.p95 > 100;
            const bad = s.p95 > 200;
            return (
              <div key={c.key} className="space-y-0.5">
                <div className="text-muted-foreground">{c.label} <span className="text-foreground/60">· n={s.count}</span></div>
                <div className={
                  bad ? "text-destructive" : warn ? "text-amber-500" : "text-foreground"
                }>
                  p50 {s.p50} · p95 {s.p95} · max {s.max}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bg-popover/90 backdrop-blur border border-border rounded-md px-2 py-1 shadow text-muted-foreground hover:text-foreground"
          title="Show UI latency metrics"
        >
          ⏱ perf
        </button>
      )}
    </div>
  );
}
import { Skeleton } from "@/components/ui/skeleton";
import { NPD_GATES, NPD_STREAMS } from "./types";

/** Ghost skeleton that mimics the real matrix layout */
export default function MatrixSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="shrink-0 border-b border-border px-4 py-3 flex items-center gap-3">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-48 rounded" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-20 rounded-md" />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="min-w-max">
          {/* Gate column headers */}
          <div className="flex border-b border-border sticky top-0 z-10 bg-card">
            <div className="min-w-[200px] w-[200px] shrink-0 border-r border-border px-3 py-2">
              <Skeleton className="h-4 w-16 rounded" />
            </div>
            {NPD_GATES.map((gate) => (
              <div
                key={gate.key}
                className="min-w-[220px] w-[220px] shrink-0 border-r border-border px-3 py-2 flex items-center gap-2"
              >
                <Skeleton className="h-4 w-8 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
              </div>
            ))}
          </div>

          {/* Stream rows */}
          {NPD_STREAMS.map((stream, si) => (
            <div key={stream} className="border-b border-border">
              <div className="flex">
                {/* Stream name */}
                <div className="min-w-[200px] w-[200px] shrink-0 border-r border-border px-3 py-2.5 flex items-center gap-2">
                  <Skeleton className="h-3.5 w-3.5 rounded shrink-0" />
                  <Skeleton className="h-4 rounded" style={{ width: `${60 + (si % 3) * 20}px` }} />
                  <Skeleton className="h-3 w-5 rounded ml-auto" />
                </div>

                {/* Gate cells with ghost task cards */}
                {NPD_GATES.map((gate, gi) => {
                  const hasCards = (si + gi) % 3 !== 2;
                  const cardCount = hasCards ? 1 + ((si + gi) % 2) : 0;

                  return (
                    <div
                      key={gate.key}
                      className="min-w-[220px] w-[220px] shrink-0 border-r border-border px-2 py-2"
                    >
                      {Array.from({ length: cardCount }).map((_, ci) => (
                        <div
                          key={ci}
                          className="mb-1.5 rounded-lg border border-border/60 bg-card p-2.5 space-y-2"
                        >
                          {/* Task title */}
                          <Skeleton className="h-3.5 w-full rounded" />
                          {/* Assignee + deadline row */}
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-5 w-5 rounded-full shrink-0" />
                            <Skeleton className="h-3 w-16 rounded" />
                            <Skeleton className="h-3 w-12 rounded ml-auto" />
                          </div>
                          {/* Progress bar */}
                          <Skeleton className="h-1 w-full rounded-full" />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

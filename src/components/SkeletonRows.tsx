import { Skeleton } from "@/components/ui/skeleton";

/**
 * Универсальный плейсхолдер для списочных загрузок.
 * Используется вместо fullscreen <Loader2 /> чтобы UI воспринимался быстрее
 * (Gmail/Linear-стиль).
 */
export function SkeletonRows({
  count = 6,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/40 px-3 py-2.5"
        >
          <Skeleton className="h-4 w-4 rounded-sm shrink-0" />
          <Skeleton className="h-4 flex-1 max-w-[60%]" />
          <Skeleton className="h-4 w-16 shrink-0" />
          <Skeleton className="h-6 w-6 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  );
}

export default SkeletonRows;
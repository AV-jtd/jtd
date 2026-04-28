import { Skeleton } from "@/components/ui/skeleton";

/**
 * Универсальный плейсхолдер для списочных загрузок.
 * Используется вместо fullscreen <Loader2 /> чтобы UI воспринимался быстрее
 * (Gmail/Linear-стиль).
 *
 * ВАЖНО: это единственный источник истины для скелетон-загрузок списков
 * во всём приложении. Используется и как Suspense fallback (загрузка bundle),
 * и как in-component placeholder во время фетча данных. Благодаря этому
 * Suspense-фаза и data-фаза визуально неотличимы — нет «прыжка» при
 * монтировании компонента, когда bundle уже пришёл, а данные ещё нет.
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

/**
 * Полноэкранная обёртка вокруг SkeletonRows. Используйте как Suspense fallback
 * для view-компонентов: гарантирует одинаковый padding/высоту с внутренним
 * isLoading-состоянием, чтобы при переходе bundle→data не было визуального
 * скачка.
 */
export function ViewSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex-1 p-4">
      <SkeletonRows count={count} />
    </div>
  );
}

export default SkeletonRows;
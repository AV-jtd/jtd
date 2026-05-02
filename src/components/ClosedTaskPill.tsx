import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tiny "Закрыта" pill shown next to a task title in chat surfaces
 * (TaskChat system dividers, ProjectChat created-task cards,
 * MessengerPanel thread list). Visual language matches existing
 * status chips: muted background, success-green accent.
 */
export default function ClosedTaskPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
        className,
      )}
      title="Задача закрыта"
    >
      <Check className="h-2.5 w-2.5" />
      Закрыта
    </span>
  );
}
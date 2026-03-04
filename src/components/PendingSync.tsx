import { usePendingMutations } from "@/hooks/usePendingMutations";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PendingSync() {
  const count = usePendingMutations();
  const isOnline = useOnlineStatus();

  if (count === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2",
        isOnline
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground"
      )}
    >
      {isOnline ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CloudOff className="h-4 w-4" />
      )}
      {isOnline
        ? `Синхронизация ${count} ${count === 1 ? "изменения" : "изменений"}…`
        : `${count} ${count === 1 ? "изменение" : "изменений"} ожидает синхронизации`}
    </div>
  );
}

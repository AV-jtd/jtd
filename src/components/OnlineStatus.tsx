import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function OnlineStatus() {
  const isOnline = useOnlineStatus();
  const [show, setShow] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!isOnline) {
      setShow(true);
      setWasOffline(true);
    } else if (wasOffline) {
      setShow(true);
      // Resume paused mutations when back online
      qc.resumePausedMutations().then(() => {
        qc.invalidateQueries();
      });
      const timer = setTimeout(() => {
        setShow(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline, qc]);

  if (!show) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium shadow-lg transition-all animate-in fade-in slide-in-from-bottom-2",
        isOnline
          ? "bg-success text-success-foreground"
          : "bg-destructive text-destructive-foreground"
      )}
    >
      {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      {isOnline ? "Подключение восстановлено" : "Нет подключения к сети"}
    </div>
  );
}

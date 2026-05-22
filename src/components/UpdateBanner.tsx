import { useEffect, useState } from "react";
import { applyUpdateNow, isUpdateAvailable } from "@/lib/versionCheck";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";

/**
 * Ненавязчивый баннер обновления PWA. Появляется, когда фоновый
 * version-check засёк новую сборку. Пользователь сам решает, когда
 * перезагрузиться — никакого белого экрана посреди работы.
 */
export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (isUpdateAvailable()) setVisible(true);
    const onUpdate = () => setVisible(true);
    window.addEventListener("jtd:update-available", onUpdate);
    return () => window.removeEventListener("jtd:update-available", onUpdate);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[9999] -translate-x-1/2 flex items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 shadow-lg backdrop-blur-sm">
      <RefreshCw className={`h-4 w-4 text-primary ${applying ? "animate-spin" : ""}`} />
      <span className="text-sm text-foreground">Доступна новая версия</span>
      <Button
        size="sm"
        onClick={async () => {
          setApplying(true);
          await applyUpdateNow();
        }}
        disabled={applying}
      >
        {applying ? "Обновляю…" : "Обновить сейчас"}
      </Button>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Скрыть"
        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
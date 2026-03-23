import { useState } from "react";
import { cn } from "@/lib/utils";
import ModuleLayout from "@/components/ModuleLayout";
import CrmBoard from "@/modules/crm/pages/CrmBoard";
import CrmSmartImportDialog from "@/modules/crm/components/CrmSmartImportDialog";

export default function CrmLayout() {
  const [boardView, setBoardView] = useState<"funnel" | "sales">("funnel");
  const [importOpen, setImportOpen] = useState(false);

  return (
    <ModuleLayout
      moduleContext="crm"
      headerChildren={
        <div className="flex items-center text-sm font-semibold tracking-tight">
          <button
            onClick={() => setBoardView("funnel")}
            className={cn(
              "px-2 py-0.5 transition-colors duration-200",
              boardView === "funnel"
                ? "bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Воронка
          </button>
          <span className="text-muted-foreground/40">|</span>
          <button
            onClick={() => setBoardView("sales")}
            className={cn(
              "px-2 py-0.5 transition-colors duration-200",
              boardView === "sales"
                ? "bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Задачи
          </button>
        </div>
      }
      extraOverlays={() => (
        <CrmSmartImportDialog open={importOpen} onOpenChange={setImportOpen} />
      )}
    >
      <CrmBoard boardView={boardView} />
    </ModuleLayout>
  );
}

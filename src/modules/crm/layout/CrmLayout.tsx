import { useState } from "react";
import { cn } from "@/lib/utils";
import { UserPlus } from "lucide-react";
import ModuleLayout from "@/components/ModuleLayout";
import CrmBoard from "@/modules/crm/pages/CrmBoard";
import CrmSmartImportDialog from "@/modules/crm/components/CrmSmartImportDialog";
import CrmAddClientDialog from "@/modules/crm/components/CrmAddClientDialog";
import CrmClientsList from "@/modules/crm/components/CrmClientsList";

export default function CrmLayout() {
  const [boardView, setBoardView] = useState<"funnel" | "sales" | "partners">("funnel");
  const [importOpen, setImportOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);

  return (
    <ModuleLayout
      moduleContext="crm"
      headerChildren={
        <div className="flex items-center gap-2">
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
            <span className="text-muted-foreground/40">|</span>
            <button
              onClick={() => setBoardView("partners")}
              className={cn(
                "px-2 py-0.5 transition-colors duration-200",
                boardView === "partners"
                  ? "bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Партнёры
            </button>
          </div>
          <button
            onClick={() => setAddClientOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            title="Добавить клиента"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Клиент</span>
          </button>
        </div>
      }
      extraOverlays={() => (
        <>
          <CrmSmartImportDialog open={importOpen} onOpenChange={setImportOpen} />
          <CrmAddClientDialog open={addClientOpen} onOpenChange={setAddClientOpen} />
        </>
      )}
    >
      {boardView === "partners" ? (
        <CrmClientsList />
      ) : (
        <CrmBoard boardView={boardView} />
      )}
    </ModuleLayout>
  );
}

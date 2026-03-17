import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import AppHeader from "@/components/AppHeader";
import CrmBoard from "@/modules/crm/pages/CrmBoard";
import AiAssistant from "@/components/AiAssistant";
import MessengerPanel from "@/components/MessengerPanel";
import GlobalSearch from "@/components/GlobalSearch";
import CrmSmartImportDialog from "@/modules/crm/components/CrmSmartImportDialog";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

export default function CrmLayout() {
  const { user, loading } = useAuth();
  const [boardView, setBoardView] = useState<"funnel" | "sales">("funnel");
  const [aiOpen, setAiOpen] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { unreadCount, markThreadRead, isThreadUnread } = useUnreadMessages();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <AppHeader
        onSearchOpen={() => setSearchOpen(true)}
        onAiOpen={() => setAiOpen(true)}
        onMessengerToggle={() => setMessengerOpen(prev => !prev)}
        messengerOpen={messengerOpen}
      >
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
      </AppHeader>
      <div className="flex flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 overflow-hidden">
          <CrmBoard boardView={boardView} />
        </main>
        {messengerOpen && (
          <div className="w-96 shrink-0 h-full animate-fade-in">
            <MessengerPanel onClose={() => setMessengerOpen(false)} />
          </div>
        )}
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} onNavigateToTask={() => {}} onNavigateToProject={() => {}} onNavigateToTag={() => {}} />
      <AiAssistant
        open={aiOpen}
        onOpenChange={setAiOpen}
        moduleContext={{ module: "crm" }}
        onRequestImport={() => setImportOpen(true)}
      />
      <CrmSmartImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </div>
  );
}

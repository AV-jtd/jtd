import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import AppHeader from "@/components/AppHeader";
import AppSidebar from "@/components/AppSidebar";
import CrmBoard from "@/modules/crm/pages/CrmBoard";
import AiAssistant from "@/components/AiAssistant";
import MessengerPanel from "@/components/MessengerPanel";
import GlobalSearch from "@/components/GlobalSearch";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export default function CrmLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [boardView, setBoardView] = useState<"funnel" | "sales">("funnel");
  const [aiOpen, setAiOpen] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const sidebarProps = {
    activeView: "",
    onViewChange: (v: string) => navigate(`/?view=${v}`),
    activeGroupId: null,
    onGroupChange: (id: string | null) => navigate(id ? `/?group=${id}` : "/"),
    activeTagFilters: [] as string[],
    onToggleTag: (id: string) => navigate(`/?tag=${id}`),
    onClearTags: () => {},
    projectDetailOpen: false,
    onToggleProjectDetail: () => {},
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <AppHeader
        onMenuClick={() => setSidebarOpen(true)}
        onSearchOpen={() => setSearchOpen(true)}
        onAiOpen={() => setAiOpen(true)}
        onMessengerToggle={() => setMessengerOpen(prev => !prev)}
        messengerOpen={messengerOpen}
      >
        <div className="flex items-center text-sm font-semibold tracking-tight whitespace-nowrap">
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
        {isMobile ? (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="p-0 w-72 bg-sidebar-bg border-sidebar-fg/5">
              <AppSidebar {...sidebarProps} />
            </SheetContent>
          </Sheet>
        ) : (
          <AppSidebar {...sidebarProps} />
        )}

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
      <AiAssistant open={aiOpen} onOpenChange={setAiOpen} moduleContext={{ module: "crm" }} />
    </div>
  );
}

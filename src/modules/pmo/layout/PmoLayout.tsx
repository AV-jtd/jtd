import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useSearchParams } from "react-router-dom";
import { Loader2, LayoutDashboard, GanttChart, Flag, Users, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import AppHeader from "@/components/AppHeader";
import PortfolioView from "@/modules/pmo/pages/PortfolioView";
import GanttView from "@/modules/pmo/pages/GanttView";
import AiAssistant from "@/components/AiAssistant";
import MessengerPanel from "@/components/MessengerPanel";
import GlobalSearch from "@/components/GlobalSearch";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

type PmoView = "portfolio" | "gantt" | "milestones" | "resources" | "reports";

const navItems: { id: PmoView; label: string; icon: React.ElementType }[] = [
  { id: "portfolio", label: "Портфель", icon: LayoutDashboard },
  { id: "gantt", label: "Гант", icon: GanttChart },
  { id: "milestones", label: "Вехи", icon: Flag },
  { id: "resources", label: "Ресурсы", icon: Users },
  { id: "reports", label: "Отчёты", icon: BarChart3 },
];

export default function PmoLayout() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  const initialProject = searchParams.get("project");
  const initialView = initialProject ? "gantt" : "portfolio";
  const [activeView, setActiveView] = useState<PmoView>(initialView as PmoView);
  const [focusProjectId, setFocusProjectId] = useState<string | null>(initialProject);
  const [aiOpen, setAiOpen] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleOpenGantt = (projectId: string) => {
    setFocusProjectId(projectId);
    setActiveView("gantt");
  };

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
        <nav className="flex items-center gap-0.5 whitespace-nowrap">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </AppHeader>

      <div className="flex flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 overflow-hidden">
          {activeView === "portfolio" && <PortfolioView onOpenGantt={handleOpenGantt} />}
          {activeView === "gantt" && <GanttView initialProjectId={focusProjectId} />}
          {activeView === "milestones" && <MilestonesPlaceholder />}
          {activeView === "resources" && <ResourcesPlaceholder />}
          {activeView === "reports" && <ReportsPlaceholder />}
        </main>
        {messengerOpen && (
          <div className="w-96 shrink-0 h-full animate-fade-in">
            <MessengerPanel onClose={() => setMessengerOpen(false)} />
          </div>
        )}
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} onNavigateToTask={() => {}} onNavigateToProject={() => {}} onNavigateToTag={() => {}} />
      <AiAssistant open={aiOpen} onOpenChange={setAiOpen} moduleContext={{ module: "pmo" }} />
    </div>
  );
}

function MilestonesPlaceholder() {
  return <PlaceholderView icon={Flag} title="Вехи" description="Ключевые точки проектов и gate-review" />;
}
function ResourcesPlaceholder() {
  return <PlaceholderView icon={Users} title="Ресурсы" description="Загрузка участников и распределение по проектам" />;
}
function ReportsPlaceholder() {
  return <PlaceholderView icon={BarChart3} title="Отчёты" description="Burndown, SPI/CPI, отклонения от плана" />;
}

function PlaceholderView({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      </div>
      <span className="text-xs text-muted-foreground/60 mt-2">В разработке</span>
    </div>
  );
}

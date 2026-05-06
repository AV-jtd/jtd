import { useState, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { LayoutDashboard, GanttChart, Flag, Users, BarChart3, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ModuleLayout from "@/components/ModuleLayout";
import PortfolioView from "@/modules/pmo/pages/PortfolioView";
import GanttView from "@/modules/pmo/pages/GanttView";
import MilestonesView from "@/modules/pmo/pages/MilestonesView";
import ReportsView from "@/modules/pmo/pages/ReportsView";

type PmoView = "portfolio" | "gantt" | "milestones" | "resources" | "reports";

const navItems: { id: PmoView; label: string; icon: React.ElementType }[] = [
  { id: "portfolio", label: "Портфель", icon: LayoutDashboard },
  { id: "gantt", label: "Гант", icon: GanttChart },
  { id: "milestones", label: "Вехи", icon: Flag },
  { id: "resources", label: "Ресурсы", icon: Users },
  { id: "reports", label: "Отчёты", icon: BarChart3 },
];

export default function PmoLayout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialProject = searchParams.get("project");
  const initialView = initialProject ? "gantt" : "portfolio";
  const [activeView, setActiveView] = useState<PmoView>(initialView as PmoView);
  const [focusProjectId, setFocusProjectId] = useState<string | null>(initialProject);
  const [cameFromPortfolio, setCameFromPortfolio] = useState(false);

  const handleOpenGantt = useCallback((projectId: string) => {
    // Navigate to dedicated project page
    navigate(`/pmo/project/${projectId}?view=gantt`);
  }, [navigate]);

  const handleBackToPortfolio = useCallback(() => {
    setActiveView("portfolio");
    setCameFromPortfolio(false);
    setFocusProjectId(null);
  }, []);

  const handleNavClick = useCallback((id: PmoView) => {
    setActiveView(id);
    if (id !== "gantt") {
      setCameFromPortfolio(false);
      setFocusProjectId(null);
    }
  }, []);

  return (
    <ModuleLayout
      moduleContext="pmo"
      headerChildren={
        <nav className="flex items-center gap-0.5 whitespace-nowrap">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
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
      }
    >
      <div className={cn(activeView !== "portfolio" && "hidden", "h-full")}><PortfolioView onOpenGantt={handleOpenGantt} /></div>
      <div className={cn(activeView !== "gantt" && "hidden", "h-full")}><GanttView initialProjectId={focusProjectId} onBack={cameFromPortfolio ? handleBackToPortfolio : undefined} /></div>
      {activeView === "milestones" && <MilestonesView />}
      {activeView === "resources" && <PlaceholderView icon={Users} title="Ресурсы" description="Загрузка участников и распределение по проектам" />}
      {activeView === "reports" && <ReportsView />}
    </ModuleLayout>
  );
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

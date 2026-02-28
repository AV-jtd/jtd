import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2, LayoutDashboard, GanttChart, Flag, Users, BarChart3, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import PortfolioView from "@/modules/pmo/pages/PortfolioView";

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
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<PmoView>("portfolio");

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
      {/* Top header bar */}
      <header className="flex items-center h-12 px-4 border-b border-border bg-card shrink-0 gap-2">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors mr-2 p-1 rounded-md hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="text-xs font-medium hidden sm:inline">Задачи</span>
        </button>

        <div className="h-5 w-px bg-border" />

        <span className="text-sm font-bold tracking-tight text-foreground">
          PMO
        </span>

        {/* Nav tabs */}
        <nav className="flex items-center gap-0.5 ml-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
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
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {activeView === "portfolio" && <PortfolioPlaceholder />}
        {activeView === "gantt" && <GanttPlaceholder />}
        {activeView === "milestones" && <MilestonesPlaceholder />}
        {activeView === "resources" && <ResourcesPlaceholder />}
        {activeView === "reports" && <ReportsPlaceholder />}
      </main>
    </div>
  );
}

function PortfolioPlaceholder() {
  return <PortfolioView />;
}
function GanttPlaceholder() {
  return <PlaceholderView icon={GanttChart} title="Гант-диаграмма" description="Timeline задач с зависимостями и критическим путём" />;
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

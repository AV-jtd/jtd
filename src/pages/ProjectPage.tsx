import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskGroups } from "@/hooks/useTasks";
import ModuleLayout from "@/components/ModuleLayout";
import ProjectHeader from "@/components/ProjectHeader";

const GanttView = lazy(() => import("@/modules/pmo/pages/GanttView"));
const NpdSwimlaneMatrix = lazy(() => import("@/modules/npd/pages/NpdSwimlaneMatrix"));

type ProjectView = "dashboard" | "gantt" | "matrix";

function LazyFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

/** Inline dashboard for project overview */
function ProjectDashboardView({ projectId }: { projectId: string }) {
  // Re-use the existing PortfolioView expansion logic inline
  // For now, show a simplified dashboard
  const { data: groups = [] } = useTaskGroups();
  const project = groups.find(g => g.id === projectId);

  if (!project) return null;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <span className="text-2xl">{project.icon && project.icon !== "list" ? project.icon : "📁"}</span>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{project.name}</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">Обзор проекта — переключитесь на Гантт или Матрицу для работы с задачами</p>
      </div>
    </div>
  );
}

/** Shaded matrix placeholder for non-NPD projects */
function ShadedMatrix() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4 opacity-40">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
        <span className="text-2xl text-muted-foreground">🔒</span>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-muted-foreground">Матрица недоступна</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Swimlane-матрица доступна только для проектов типа NPD.
          Измените тип проекта в карточке, чтобы разблокировать.
        </p>
      </div>
    </div>
  );
}

export default function ProjectPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: groups = [] } = useTaskGroups();

  const project = useMemo(() => groups.find(g => g.id === projectId), [groups, projectId]);
  const isNpd = project?.project_type === "npd";

  const initialView = (searchParams.get("view") as ProjectView) || "gantt";
  const [activeView, setActiveView] = useState<ProjectView>(initialView);

  const handleViewChange = useCallback((view: ProjectView) => {
    // Don't allow matrix for non-NPD
    if (view === "matrix" && !isNpd) return;
    setActiveView(view);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("view", view);
      return next;
    }, { replace: true });
  }, [isNpd, setSearchParams]);

  const handleBack = useCallback(() => {
    navigate("/pmo");
  }, [navigate]);

  if (!projectId) return null;

  return (
    <ModuleLayout
      moduleContext="pmo"
      headerChildren={null}
      customHeader={
        <ProjectHeader
          projectId={projectId}
          activeView={activeView}
          onViewChange={handleViewChange}
          onBack={handleBack}
        />
      }
    >
      <Suspense fallback={<LazyFallback />}>
        {activeView === "dashboard" && <ProjectDashboardView projectId={projectId} />}
        {activeView === "gantt" && <GanttView initialProjectId={projectId} onBack={handleBack} />}
        {activeView === "matrix" && (
          isNpd ? <NpdSwimlaneMatrix /> : <ShadedMatrix />
        )}
      </Suspense>
    </ModuleLayout>
  );
}

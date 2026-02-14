import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import TaskList from "@/components/TaskList";
import CalendarView from "@/components/CalendarView";
import { Loader2 } from "lucide-react";

export default function Index() {
  const { user, loading } = useAuth();
  const [activeView, setActiveView] = useState("all");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AppSidebar
        activeView={activeView}
        onViewChange={setActiveView}
        activeGroupId={activeGroupId}
        onGroupChange={setActiveGroupId}
        activeTagFilter={activeTagFilter}
        onTagFilter={setActiveTagFilter}
      />
      {activeView === "calendar" ? (
        <CalendarView />
      ) : (
        <TaskList
          activeView={activeView}
          activeGroupId={activeGroupId}
          activeTagFilter={activeTagFilter}
        />
      )}
    </div>
  );
}

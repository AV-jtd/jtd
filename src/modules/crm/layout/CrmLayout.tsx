import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2, ChevronLeft } from "lucide-react";
import CrmBoard from "@/modules/crm/pages/CrmBoard";

export default function CrmLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

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
          CRM
        </span>
      </header>
      <main className="flex-1 overflow-hidden">
        <CrmBoard />
      </main>
    </div>
  );
}

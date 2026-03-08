import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import NpdBoard from "@/modules/npd/pages/NpdBoard";

export default function NpdLayout() {
  const { user, loading } = useAuth();
  const [projectFilter, setProjectFilter] = useState<string | null>(null);

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
        <div className="flex items-center text-sm font-bold tracking-tight gap-0.5">
          <Link to="/" className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Задачи</Link>
          <span className="text-muted-foreground/30">|</span>
          <Link to="/pmo" className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">PMO</Link>
          <span className="text-muted-foreground/30">|</span>
          <span className="px-1.5 py-0.5 bg-gradient-to-r from-violet-400 to-fuchsia-500 bg-clip-text text-transparent">NPD</span>
          <span className="text-muted-foreground/30">|</span>
          <Link to="/crm" className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">CRM</Link>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <NpdBoard
          projectFilter={projectFilter}
          onProjectFilterChange={setProjectFilter}
        />
      </main>
    </div>
  );
}

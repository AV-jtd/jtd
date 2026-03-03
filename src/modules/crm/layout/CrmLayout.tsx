import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import CrmBoard from "@/modules/crm/pages/CrmBoard";
import { cn } from "@/lib/utils";

export default function CrmLayout() {
  const { user, loading } = useAuth();
  const [boardView, setBoardView] = useState<"funnel" | "sales">("funnel");
  const [boardView, setBoardView] = useState<"funnel" | "sales">("funnel");

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
          <span className="px-1.5 py-0.5 bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">CRM</span>
        </div>
        <div className="h-5 w-px bg-border ml-1" />
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
      </header>
      <main className="flex-1 overflow-hidden">
        <CrmBoard boardView={boardView} />
      </main>
    </div>
  );
}

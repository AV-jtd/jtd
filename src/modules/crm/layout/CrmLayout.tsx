import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import CrmBoard from "@/modules/crm/pages/CrmBoard";
import AiAssistant from "@/components/AiAssistant";
import { cn } from "@/lib/utils";

export default function CrmLayout() {
  const { user, loading } = useAuth();
  const [boardView, setBoardView] = useState<"funnel" | "sales">("funnel");
  const [aiOpen, setAiOpen] = useState(false);

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
          <Link to="/npd" className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">NPD</Link>
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
        <div className="ml-auto">
          <button
            onClick={() => setAiOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-cyan-500/10 to-violet-500/10 text-cyan-600 dark:text-cyan-400 hover:from-cyan-500/20 hover:to-violet-500/20 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">AI</span>
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <CrmBoard boardView={boardView} />
      </main>
      <AiAssistant open={aiOpen} onOpenChange={setAiOpen} moduleContext={{ module: "crm" }} />
    </div>
  );
}

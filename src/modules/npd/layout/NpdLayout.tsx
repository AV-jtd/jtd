import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import NpdBoard from "@/modules/npd/pages/NpdBoard";
import AiAssistant from "@/components/AiAssistant";
import MessengerPanel from "@/components/MessengerPanel";
import GlobalSearch from "@/components/GlobalSearch";

export default function NpdLayout() {
  const { user, loading } = useAuth();
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
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
      <AppHeader onAiOpen={() => setAiOpen(true)} />
      <main className="flex-1 overflow-hidden">
        <NpdBoard projectFilter={projectFilter} onProjectFilterChange={setProjectFilter} />
      </main>
      <AiAssistant open={aiOpen} onOpenChange={setAiOpen} moduleContext={{ module: "npd" }} />
    </div>
  );
}

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import NpdSwimlaneMatrix from "@/modules/npd/pages/NpdSwimlaneMatrix";
import AiAssistant from "@/components/AiAssistant";
import MessengerPanel from "@/components/MessengerPanel";
import GlobalSearch from "@/components/GlobalSearch";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

export default function NpdMatrix() {
  const { user, loading } = useAuth();
  const [aiOpen, setAiOpen] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { unreadCount, markThreadRead, isThreadUnread } = useUnreadMessages();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
      />
      <div className="flex flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 overflow-hidden">
          <NpdSwimlaneMatrix />
        </main>
        {messengerOpen && (
          <div className="w-96 shrink-0 h-full animate-fade-in">
            <MessengerPanel onClose={() => setMessengerOpen(false)} />
          </div>
        )}
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} onNavigateToTask={() => {}} onNavigateToProject={() => {}} onNavigateToTag={() => {}} />
      <AiAssistant open={aiOpen} onOpenChange={setAiOpen} moduleContext={{ module: "npd" }} />
    </div>
  );
}

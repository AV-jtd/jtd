import { useState, useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import TelegramLinkBanner from "@/components/TelegramLinkBanner";
import AiAssistant from "@/components/AiAssistant";
import MessengerPanel from "@/components/MessengerPanel";
import GlobalSearch from "@/components/GlobalSearch";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

export interface ModuleLayoutProps {
  /** Module key for AI assistant context */
  moduleContext: "tasks" | "pmo" | "npd" | "crm";
  /** Sub-navigation rendered inside AppHeader (e.g. PMO tabs, CRM view toggle) */
  headerChildren?: ReactNode;
  /** The main content area */
  children: ReactNode;
  /** Extra overlays rendered after GlobalSearch/AiAssistant (e.g. CRM import dialog) */
  extraOverlays?: (props: { aiOpen: boolean }) => ReactNode;
}

export default function ModuleLayout({
  moduleContext,
  headerChildren,
  children,
  extraOverlays,
}: ModuleLayoutProps) {
  const { user, loading, isConsultant } = useAuth();
  const navigate = useNavigate();
  const [aiOpen, setAiOpen] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { unreadCount, markThreadRead, isThreadUnread } = useUnreadMessages();

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    if (isConsultant) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isConsultant]);

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
      <TelegramLinkBanner />
      <AppHeader
        onSearchOpen={() => setSearchOpen(true)}
        onAiOpen={() => setAiOpen(true)}
        onMessengerToggle={() => setMessengerOpen((prev) => !prev)}
        messengerOpen={messengerOpen}
        unreadCount={unreadCount}
      >
        {headerChildren}
      </AppHeader>

      <div className="flex flex-1 min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
        {messengerOpen && !isConsultant && (
          <div className="w-full md:w-96 shrink-0 h-full animate-fade-in">
            <MessengerPanel
              onClose={() => setMessengerOpen(false)}
              markThreadRead={markThreadRead}
              isThreadUnread={isThreadUnread}
              onNavigateToProject={(groupId) => { setMessengerOpen(false); navigate(`/?group=${groupId}`); }}
              onNavigateToTask={(taskId) => { setMessengerOpen(false); navigate(`/?task=${taskId}`); }}
              moduleContext={{ module: moduleContext }}
            />
          </div>
        )}
      </div>

      {!isConsultant && (
        <>
          <GlobalSearch
            open={searchOpen}
            onOpenChange={setSearchOpen}
            onNavigateToTask={() => {}}
            onNavigateToProject={() => {}}
            onNavigateToTag={() => {}}
          />
          <AiAssistant
            open={aiOpen}
            onOpenChange={setAiOpen}
            moduleContext={{ module: moduleContext }}
          />
        </>
      )}
      {extraOverlays?.({ aiOpen })}
    </div>
  );
}

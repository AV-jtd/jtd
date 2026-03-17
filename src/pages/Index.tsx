import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import AppHeader from "@/components/AppHeader";
import TaskList from "@/components/TaskList";
import CalendarView from "@/components/CalendarView";
import SubordinatesView from "@/components/SubordinatesView";
import DashboardView from "@/components/DashboardView";
import ArchiveView from "@/components/ArchiveView";
import CommunityView from "@/components/CommunityView";
import ProjectChat from "@/components/ProjectChat";
import MessengerPanel from "@/components/MessengerPanel";
import GlobalSearch from "@/components/GlobalSearch";
import AiAssistant from "@/components/AiAssistant";
import { useTaskGroups } from "@/hooks/useTasks";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export default function Index() {
  const { user, loading, isApproved } = useAuth();
  const [activeView, setActiveView] = useState("all");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projectDetailOpen, setProjectDetailOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const { unreadCount, markThreadRead, isThreadUnread } = useUnreadMessages();
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const isMobile = useIsMobile();
  const { data: groups = [] } = useTaskGroups();

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
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
  if (!isApproved) return <Navigate to="/pending" replace />;

  const handleNavAction = () => {};

  const handleToggleTag = (id: string) => {
    setActiveTagFilters(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
    setActiveView("all");
    setActiveGroupId(null);
    handleNavAction();
  };

  const sidebarProps = {
    activeView,
    onViewChange: (v: string) => { setActiveView(v); handleNavAction(); },
    activeGroupId,
    onGroupChange: (id: string | null) => { setActiveGroupId(id); if (id) setActiveView("group"); handleNavAction(); },
    activeTagFilters,
    onToggleTag: handleToggleTag,
    onClearTags: () => setActiveTagFilters([]),
    projectDetailOpen,
    onToggleProjectDetail: () => setProjectDetailOpen(prev => !prev),
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <AppHeader
        onMenuClick={() => setSidebarOpen(true)}
        onSearchOpen={() => setSearchOpen(true)}
        onAiOpen={() => setAiOpen(true)}
        onMessengerToggle={() => setMessengerOpen(prev => !prev)}
        messengerOpen={messengerOpen}
        unreadCount={unreadCount}
      />

      <div className="flex flex-1 min-w-0 overflow-hidden">
        {isMobile ? (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="p-0 w-72 bg-sidebar-bg border-sidebar-fg/5">
              <AppSidebar {...sidebarProps} />
            </SheetContent>
          </Sheet>
        ) : (
          <AppSidebar {...sidebarProps} />
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {activeView === "calendar" ? (
            <CalendarView onNavigateToTask={(taskId) => {
              setActiveView("all");
              setActiveGroupId(null);
              setHighlightTaskId(taskId);
            }} />
          ) : activeView === "subordinates" ? (
            <SubordinatesView />
          ) : activeView === "community" ? (
            <CommunityView />
          ) : activeView === "dashboard" ? (
            <DashboardView onNavigateToTask={(taskId) => {
              setActiveView("all");
              setActiveGroupId(null);
              setHighlightTaskId(taskId);
            }} />
          ) : activeView === "archive" ? (
            <ArchiveView />
          ) : (
            <div className="flex flex-1 min-w-0 overflow-hidden">
              <TaskList
                activeView={activeView}
                activeGroupId={activeGroupId}
                activeTagFilters={activeTagFilters}
                projectDetailOpen={projectDetailOpen}
                onToggleProjectDetail={() => setProjectDetailOpen(prev => !prev)}
                chatOpen={chatOpen}
                onToggleChat={() => setChatOpen(prev => !prev)}
                messengerOpen={messengerOpen}
                onToggleMessenger={() => setMessengerOpen(prev => !prev)}
                highlightTaskId={highlightTaskId}
                onHighlightClear={() => setHighlightTaskId(null)}
                onTagClick={(tagId) => { setActiveTagFilters([tagId]); setActiveView("all"); setActiveGroupId(null); }}
                onProjectClick={(groupId) => { setActiveGroupId(groupId); setActiveView("group"); setActiveTagFilters([]); }}
                onAiOpen={() => setAiOpen(true)}
              />
              {chatOpen && activeGroupId && activeView === "group" && (
                <div className="w-80 shrink-0 h-full border-l border-border animate-fade-in">
                  <ProjectChat
                    groupId={activeGroupId}
                    groupName={groups.find(g => g.id === activeGroupId)?.name || "Проект"}
                    onClose={() => setChatOpen(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Messenger panel */}
        {messengerOpen && (
          <div className="w-96 shrink-0 h-full animate-fade-in">
            <MessengerPanel onClose={() => setMessengerOpen(false)} />
          </div>
        )}
      </div>

      <GlobalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNavigateToTask={(taskId) => {
          setActiveView("all");
          setActiveGroupId(null);
          setHighlightTaskId(taskId);
        }}
        onNavigateToProject={(groupId) => {
          setActiveGroupId(groupId);
          setActiveView("group");
          setActiveTagFilters([]);
        }}
        onNavigateToTag={(tagId) => {
          setActiveTagFilters([tagId]);
          setActiveView("all");
          setActiveGroupId(null);
        }}
      />

      <AiAssistant open={aiOpen} onOpenChange={setAiOpen} moduleContext={{ module: "tasks" }} />
    </div>
  );
}

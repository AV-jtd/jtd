import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import TaskList from "@/components/TaskList";
import CalendarView from "@/components/CalendarView";
import SubordinatesView from "@/components/SubordinatesView";
import DashboardView from "@/components/DashboardView";
import ArchiveView from "@/components/ArchiveView";
import CommunityView from "@/components/CommunityView";
import ProjectChat from "@/components/ProjectChat";
import MessengerPanel from "@/components/MessengerPanel";
import GlobalSearch from "@/components/GlobalSearch";
import { useTaskGroups } from "@/hooks/useTasks";
import { Loader2, Menu, MessageCircle, Search } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export default function Index() {
  const { user, loading } = useAuth();
  const [activeView, setActiveView] = useState("all");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projectDetailOpen, setProjectDetailOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const { data: groups = [] } = useTaskGroups();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const handleNavAction = () => {
    // No auto-close on mobile — user controls sidebar manually
  };

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
    <div className="flex h-screen bg-background overflow-hidden">
      {isMobile ? (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="p-0 w-72 bg-sidebar-bg border-sidebar-fg/5">
            <AppSidebar {...sidebarProps} />
          </SheetContent>
        </Sheet>
      ) : (
        <AppSidebar {...sidebarProps} />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {isMobile && (
          <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
            <button onClick={() => setSidebarOpen(true)} className="p-1.5 -ml-1 rounded-lg hover:bg-muted transition-colors">
              <Menu className="h-5 w-5 text-foreground" />
            </button>
            <span className="text-base font-semibold text-foreground">Just<span className="bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">TODO</span>it</span>
            <div className="flex items-center text-xs font-semibold gap-0.5 flex-1">
              <span className="px-1.5 py-0.5 text-primary">Задачи</span>
              <span className="text-muted-foreground/30">|</span>
              <Link to="/pmo" className="px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">PMO</Link>
              <span className="text-muted-foreground/30">|</span>
              <Link to="/crm" className="px-1.5 py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">CRM</Link>
            </div>
            <button
              onClick={() => setMessengerOpen(prev => !prev)}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                messengerOpen ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <MessageCircle className="h-5 w-5" />
            </button>
          </header>
        )}
        <div className="flex flex-1 min-w-0 overflow-hidden">
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
      </div>
    </div>
  );
}

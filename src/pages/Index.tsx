import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useSearchParams } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import TaskList from "@/components/TaskList";
import { useTaskGroups } from "@/hooks/useTasks";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { Loader2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";

// Lazy-loaded — keep critical bundle small (especially on mobile)
const AppSidebar = lazy(() => import("@/components/AppSidebar"));
const CalendarView = lazy(() => import("@/components/CalendarView"));
const SubordinatesView = lazy(() => import("@/components/SubordinatesView"));
const DashboardView = lazy(() => import("@/components/DashboardView"));
const ArchiveView = lazy(() => import("@/components/ArchiveView"));
const CommunityView = lazy(() => import("@/components/CommunityView"));
const WikiHubView = lazy(() => import("@/components/WikiHubView"));
const ProjectChat = lazy(() => import("@/components/ProjectChat"));
const MessengerPanel = lazy(() => import("@/components/MessengerPanel"));
const ProjectDetailPanel = lazy(() => import("@/components/ProjectDetailPanel"));
const GlobalSearch = lazy(() => import("@/components/GlobalSearch"));
const AiAssistant = lazy(() => import("@/components/AiAssistant"));
import { SkeletonRows } from "@/components/SkeletonRows";

function ViewFallback() {
  return (
    <div className="flex-1 p-4">
      <SkeletonRows count={6} />
    </div>
  );
}

export default function Index() {
  const { user, loading, isApproved, approvalKnown, isConsultant } = useAuth();
  const [activeView, setActiveView] = useState("all");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projectDetailOpen, setProjectDetailOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messengerOpen, setMessengerOpen] = useState(false);
  // Remembered active thread id from the messenger. Survives close/reopen
  // cycles (e.g. on mobile when navigating to a task collapses the panel)
  // so reopening the messenger restores the same conversation.
  const [lastMessengerThreadId, setLastMessengerThreadId] = useState<string | null>(null);
  // ID of the project shown as an overlay panel on top of the messenger.
  // Lets users peek at project details without losing their place in the
  // thread list. Cleared via the sheet's onOpenChange.
  const [messengerDetailGroupId, setMessengerDetailGroupId] = useState<string | null>(null);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const { unreadCount, markThreadRead, isThreadUnread } = useUnreadMessages();
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const isMobile = useIsMobile();
  const { data: groups = [] } = useTaskGroups();
  const [searchParams, setSearchParams] = useSearchParams();

  // Consultants are limited to a small whitelist of personal views.
  // If they (or a stale state) try to land on a restricted view — bounce to "all".
  useEffect(() => {
    if (!isConsultant) return;
    const allowed = new Set(["all", "inbox", "myday", "assigned", "deferred", "calendar", "group"]);
    if (!allowed.has(activeView)) setActiveView("all");
  }, [isConsultant, activeView]);

  // Lazy-mount: only render heavy views after first visit, then keep alive
  const visitedRef = useRef<Set<string>>(new Set());
  if (activeView === "calendar" || activeView === "dashboard") {
    visitedRef.current.add(activeView);
  }
  const calendarMounted = visitedRef.current.has("calendar");
  const dashboardMounted = visitedRef.current.has("dashboard");

  // Handle incoming navigation from other modules via query params
  useEffect(() => {
    const groupParam = searchParams.get("group");
    const taskParam = searchParams.get("task");
    if (groupParam) {
      setActiveGroupId(groupParam);
      setActiveView("group");
      setProjectDetailOpen(true);
      setSearchParams({}, { replace: true });
    } else if (taskParam) {
      setActiveView("all");
      setActiveGroupId(null);
      setHighlightTaskId(taskParam);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
  // Only redirect to /pending when we have a CONFIRMED unapproved status.
  // If the approval status is unknown (e.g. profiles fetch timed out), let the
  // user into the app — RLS still protects data, and the auth hook will retry.
  if (approvalKnown && !isApproved) return <Navigate to="/pending" replace />;

  const isTaskView = !["calendar", "dashboard", "subordinates", "community", "archive", "wiki"].includes(activeView);

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
            <SheetContent side="left" className="p-0 w-72 bg-sidebar-bg border-border">
              <Suspense fallback={<ViewFallback />}>
                <AppSidebar {...sidebarProps} />
              </Suspense>
            </SheetContent>
          </Sheet>
        ) : (
          <Suspense fallback={<ViewFallback />}>
            <AppSidebar {...sidebarProps} />
          </Suspense>
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Task list views - kept mounted via CSS hidden */}
          <div className={cn("flex flex-1 min-w-0 overflow-hidden", !isTaskView && "hidden")}>
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
              onInsightTaskNavigate={(taskId, groupId) => {
                setHighlightTaskId(null);
                window.requestAnimationFrame(() => {
                  setActiveTagFilters([]);
                  if (groupId) {
                    setActiveGroupId(groupId);
                    setActiveView("group");
                  } else {
                    setActiveGroupId(null);
                    setActiveView("all");
                  }
                  setHighlightTaskId(taskId);
                });
              }}
              onAiOpen={() => setAiOpen(true)}
              onViewChange={(v) => { setActiveView(v); setActiveGroupId(null); setActiveTagFilters([]); }}
            />
            {chatOpen && activeGroupId && activeView === "group" && !isConsultant && (
              <div className="w-80 shrink-0 h-full border-l border-border animate-fade-in">
                <Suspense fallback={<ViewFallback />}>
                  <ProjectChat
                    groupId={activeGroupId}
                    groupName={groups.find(g => g.id === activeGroupId)?.name || "Проект"}
                    onClose={() => setChatOpen(false)}
                    onNavigateToProject={(gId) => { setActiveGroupId(gId); setActiveView("group"); setProjectDetailOpen(true); }}
                  />
                </Suspense>
              </div>
            )}
          </div>

          {/* Calendar - lazy mounted on first visit, then kept alive */}
          {calendarMounted && (
            <div className={cn("flex-1 flex flex-col min-w-0 overflow-hidden", activeView !== "calendar" && "hidden")}>
              <Suspense fallback={<ViewFallback />}>
                <CalendarView onNavigateToTask={(taskId) => {
                  setActiveView("all");
                  setActiveGroupId(null);
                  setHighlightTaskId(taskId);
                }} />
              </Suspense>
            </div>
          )}

          {/* Dashboard - lazy mounted on first visit, then kept alive */}
          {dashboardMounted && (
            <div className={cn("flex-1 flex flex-col min-w-0 overflow-hidden", activeView !== "dashboard" && "hidden")}>
              <Suspense fallback={<ViewFallback />}>
                <DashboardView onNavigateToTask={(taskId) => {
                  setActiveView("all");
                  setActiveGroupId(null);
                  setHighlightTaskId(taskId);
                }} />
              </Suspense>
            </div>
          )}

          {/* Lazy-mounted views */}
          {activeView === "subordinates" && (
            <Suspense fallback={<ViewFallback />}><SubordinatesView /></Suspense>
          )}
          {activeView === "community" && (
            <Suspense fallback={<ViewFallback />}><CommunityView /></Suspense>
          )}
          {activeView === "archive" && (
            <Suspense fallback={<ViewFallback />}><ArchiveView /></Suspense>
          )}
          {activeView === "wiki" && (
            <Suspense fallback={<ViewFallback />}><WikiHubView /></Suspense>
          )}
          
        </div>

        {/* Messenger panel */}
        {messengerOpen && !isConsultant && (
          <div className="w-full md:w-96 shrink-0 h-full animate-fade-in">
            <Suspense fallback={<ViewFallback />}>
              <MessengerPanel
                onClose={() => {
                  // Full close: drop the remembered thread so reopening the
                  // messenger lands on the thread list, as users expect.
                  setMessengerOpen(false);
                  setLastMessengerThreadId(null);
                }}
                onMinimize={() => {
                  // Minimize: hide the panel but keep the active thread so
                  // reopening jumps straight back to the same conversation.
                  setMessengerOpen(false);
                }}
                markThreadRead={markThreadRead}
                isThreadUnread={isThreadUnread}
                initialActiveThreadId={lastMessengerThreadId}
                onActiveThreadChange={setLastMessengerThreadId}
                onNavigateToProject={(gId) => { setActiveGroupId(gId); setActiveView("group"); setProjectDetailOpen(true); setMessengerOpen(false); }}
                onNavigateToTask={(taskId) => {
                  // Keep messenger open so the user can return to the
                  // exact thread + message after viewing the task.
                  // The active thread is preserved inside MessengerPanel state.
                  setActiveView("all");
                  setActiveGroupId(null);
                  setHighlightTaskId(taskId);
                  // On mobile the messenger is full-width and would hide the
                  // task. Collapse it on small screens — re-opening it brings
                  // the user back to the same thread (state is preserved).
                  if (isMobile) setMessengerOpen(false);
                }}
                onOpenProjectDetail={(gId) => setMessengerDetailGroupId(gId)}
                moduleContext={{
                  module: "tasks",
                  activeProjectId: activeView === "group" ? activeGroupId : null,
                  activeProjectName: activeView === "group" && activeGroupId
                    ? groups.find(g => g.id === activeGroupId)?.name ?? null
                    : null,
                }}
              />
            </Suspense>
          </div>
        )}
      </div>

      {/* Project detail overlay launched from the messenger.
          Renders above the MessengerPanel without unmounting it, so users
          keep their place in the thread list. Mobile: bottom sheet (90dvh).
          Desktop: right-side sheet (w-[480px]). */}
      {messengerDetailGroupId && (
        <Sheet
          open={!!messengerDetailGroupId}
          onOpenChange={(open) => { if (!open) setMessengerDetailGroupId(null); }}
        >
          <SheetContent
            side={isMobile ? "bottom" : "right"}
            className={cn(
              "p-0 border-border bg-background overflow-hidden flex flex-col",
              isMobile ? "h-[90dvh] rounded-t-2xl" : "w-[480px] sm:max-w-[480px]"
            )}
          >
            <Suspense fallback={<ViewFallback />}>
              {(() => {
                const g = groups.find(x => x.id === messengerDetailGroupId);
                if (!g) {
                  return (
                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                      Проект не найден
                    </div>
                  );
                }
                return (
                  <div className="flex-1 overflow-y-auto">
                    <ProjectDetailPanel group={g} />
                  </div>
                );
              })()}
            </Suspense>
          </SheetContent>
        </Sheet>
      )}

      {searchOpen && (
        !isConsultant &&
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {aiOpen && (
        !isConsultant &&
        <Suspense fallback={null}>
          <AiAssistant open={aiOpen} onOpenChange={setAiOpen} moduleContext={{ module: "tasks" }} />
        </Suspense>
      )}
    </div>
  );
}

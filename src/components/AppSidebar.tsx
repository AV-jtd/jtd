import MainNav from "@/components/sidebar/MainNav";
import ProjectsTree from "@/components/sidebar/ProjectsTree";
import UserFooter from "@/components/sidebar/UserFooter";

/**
 * Top-level shell of the left navigation sidebar.
 *
 * Composition:
 *   - **Header** — brand mark.
 *   - **MainNav** — view shortcuts and route links (Все задачи, Inbox, …).
 *   - **ProjectsTree** — folders + projects + DnD + create forms.
 *   - **UserFooter** — current user, settings, sign-out.
 *
 * AppSidebar itself owns no local state. Selection state (active view,
 * active group, tag filters) is lifted to the page so other parts of the
 * UI can react to and drive it.
 */
interface AppSidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  activeGroupId: string | null;
  onGroupChange: (id: string | null) => void;
  /** @deprecated Kept for API compatibility — tag filtering UI lives elsewhere now. */
  activeTagFilters: string[];
  /** @deprecated */
  onToggleTag: (id: string) => void;
  onClearTags: () => void;
  projectDetailOpen: boolean;
  onToggleProjectDetail: () => void;
}

export default function AppSidebar({
  activeView,
  onViewChange,
  activeGroupId,
  onGroupChange,
  onClearTags,
  onToggleProjectDetail,
}: AppSidebarProps) {
  return (
    <aside className="w-full bg-sidebar-bg text-sidebar-fg flex flex-col h-full min-h-0 shrink-0 border-r border-border max-md:border-r-0">
      {/* Brand */}
      <div className="p-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-sm font-black text-primary-foreground leading-none">✓</span>
          </div>
          <span className="text-lg font-bold tracking-tight">
            Just<span className="bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">TODO</span>it
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="ios-sidebar-scroll flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 space-y-0.5">
        <MainNav
          activeView={activeView}
          activeGroupId={activeGroupId}
          onViewChange={onViewChange}
          onGroupChange={onGroupChange}
          onClearTags={onClearTags}
        />
        <ProjectsTree
          activeGroupId={activeGroupId}
          onGroupChange={onGroupChange}
          onViewChange={onViewChange}
          onClearTags={onClearTags}
          onToggleProjectDetail={onToggleProjectDetail}
        />
      </nav>

      <UserFooter />
    </aside>
  );
}
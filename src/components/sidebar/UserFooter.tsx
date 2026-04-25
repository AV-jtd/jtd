import { Link } from "react-router-dom";
import { Settings, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Footer cell of the sidebar with user identity, settings link and sign-out.
 */
export default function UserFooter() {
  const { user, signOut } = useAuth();
  const initial = user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="p-3 border-t border-border/50">
      <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-hover transition-colors">
        <div className="h-8 w-8 rounded-full bg-sidebar-hover flex items-center justify-center text-sm font-semibold text-sidebar-fg">
          {initial}
        </div>
        <span className="text-sm truncate flex-1 text-sidebar-fg/80">{user?.email}</span>
        <Link to="/settings" className="p-1.5 rounded-md text-sidebar-fg/40 hover:text-sidebar-fg hover:bg-sidebar-hover transition-all" aria-label="Настройки">
          <Settings className="h-4 w-4" />
        </Link>
        <button onClick={signOut} className="p-1.5 rounded-md text-sidebar-fg/40 hover:text-sidebar-fg hover:bg-sidebar-hover transition-all" aria-label="Выйти">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
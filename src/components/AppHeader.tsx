import { Link, useLocation } from "react-router-dom";
import { Menu, Search, Sparkles, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface AppHeaderProps {
  onMenuClick?: () => void;
  onSearchOpen?: () => void;
  onAiOpen?: () => void;
  onMessengerToggle?: () => void;
  messengerOpen?: boolean;
  unreadCount?: number;
  /** Extra elements rendered between module nav and right actions (e.g. sub-nav tabs) */
  children?: React.ReactNode;
}

const modules = [
  { path: "/pmo", label: "PMO", activeStyle: "text-primary" },
  { path: "/npd", label: "NPD", activeStyle: "bg-gradient-to-r from-violet-400 to-fuchsia-500 bg-clip-text text-transparent" },
  { path: "/crm", label: "CRM", activeStyle: "bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent" },
];

export default function AppHeader({
  onMenuClick,
  onSearchOpen,
  onAiOpen,
  onMessengerToggle,
  messengerOpen,
  children,
}: AppHeaderProps) {
  const location = useLocation();
  const isMobile = useIsMobile();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <header className="flex items-center h-12 px-3 md:px-4 border-b border-border bg-card shrink-0 gap-1 md:gap-2">
      {/* Mobile menu button */}
      {isMobile && onMenuClick && (
        <button
          onClick={onMenuClick}
          className="p-1.5 -ml-1 rounded-lg hover:bg-muted transition-colors"
        >
          <Menu className="h-5 w-5 text-foreground" />
        </button>
      )}

      {/* Logo = Задачи link */}
      {!isMobile ? (
        <Link to="/" className={cn(
          "text-sm font-semibold mr-1 shrink-0 transition-colors",
          isActive("/") ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}>
          Just<span className="bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">TODO</span>it
        </Link>
      ) : (
        <Link to="/" className={cn(
          "text-sm font-semibold mr-1 shrink-0 transition-colors",
          isActive("/") ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}>
          J<span className="bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">TD</span>
        </Link>
      )}

      {/* Module navigation */}
      <nav className="flex items-center text-xs md:text-sm font-bold tracking-tight gap-0.5">
        <span className="text-muted-foreground/30 select-none">|</span>
        {modules.map((mod, i) => {
          const active = isActive(mod.path);
          return (
            <span key={mod.path} className="flex items-center gap-0.5">
              {i > 0 && <span className="text-muted-foreground/30 select-none">|</span>}
              {active ? (
                <span className={cn("px-1.5 py-0.5", mod.activeStyle)}>
                  {mod.label}
                </span>
              ) : (
                <Link
                  to={mod.path}
                  className="px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {mod.label}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      {/* Sub-navigation slot (e.g. PMO tabs, CRM view toggle) */}
      {children && (
        <>
          <div className="h-5 w-px bg-border mx-1 shrink-0" />
          <div className="overflow-x-auto scrollbar-none min-w-0 shrink">
            {children}
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-0.5 md:gap-1">
        {onSearchOpen && (
          <button
            onClick={onSearchOpen}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Поиск (⌘K)"
          >
            <Search className="h-4 w-4" />
          </button>
        )}

        {onAiOpen && (
          <button
            onClick={onAiOpen}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="ИИ-ассистент"
          >
            <Sparkles className="h-4 w-4" />
          </button>
        )}

        {onMessengerToggle && (
          <button
            onClick={onMessengerToggle}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              messengerOpen
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title="Сообщения"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
        )}

      </div>
    </header>
  );
}

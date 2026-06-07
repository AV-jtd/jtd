import { Link, useLocation } from "react-router-dom";
import { Menu, Search, Sparkles, MessageCircle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { ConsultantGuard } from "@/components/consultant/ConsultantGuard";

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
  { path: "/chat", label: "ЭФИР", activeStyle: "bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent" },
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
  unreadCount = 0,
  children,
}: AppHeaderProps) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isAdmin, isRealAdmin, adminModeDisabled, setAdminModeDisabled } = useAuth();

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
        {isRealAdmin && (
          <button
            onClick={() => setAdminModeDisabled(!adminModeDisabled)}
            className={cn(
              "hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border mr-1 transition-colors",
              adminModeDisabled
                ? "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                : "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
            )}
            title={adminModeDisabled
              ? "Режим обычного пользователя. Нажмите, чтобы включить супер-права админа."
              : "Режим администратора: полный доступ ко всем данным. Нажмите, чтобы переключиться в режим пользователя."}
          >
            <ShieldAlert className="h-3 w-3" />
            {adminModeDisabled ? "User" : "Admin"}
          </button>
        )}
        {isRealAdmin && (
          <button
            onClick={() => setAdminModeDisabled(!adminModeDisabled)}
            className={cn(
              "md:hidden inline-flex items-center justify-center h-6 w-6 rounded-md border mr-1 transition-colors",
              adminModeDisabled
                ? "bg-muted text-muted-foreground border-border"
                : "bg-destructive/10 text-destructive border-destructive/30"
            )}
            title={adminModeDisabled ? "Режим пользователя (нажмите для админ-режима)" : "Режим администратора (нажмите для режима пользователя)"}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
          </button>
        )}
        {onMessengerToggle && (
          <ConsultantGuard area="messenger" mode="faded">
            <button
              onClick={onMessengerToggle}
              className={cn(
                "p-1.5 rounded-lg transition-colors relative",
                messengerOpen
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              title="Сообщения"
            >
              <MessageCircle className="h-4 w-4" />
              {unreadCount > 0 && !messengerOpen && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none animate-in zoom-in-50">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </ConsultantGuard>
        )}

      </div>
    </header>
  );
}

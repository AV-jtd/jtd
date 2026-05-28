import { Link } from "react-router-dom";
import { List, Star, Users, Inbox, Clock, Globe, CalendarDays, BarChart3, BookOpen, FileText, Archive, Building2, LayoutGrid, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyDepartmentId, useDepartmentTasks } from "@/hooks/useDepartmentTasks";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";
import { CONSULTANT_VISIBLE_NAV_IDS } from "@/lib/consultantRestrictions";

/**
 * Top navigation block of the sidebar.
 *
 * Two kinds of items:
 *  - **view items** — switch the in-page view (`onViewChange`) and clear group/tag filters
 *  - **route items** — navigate to a different page via react-router `<Link>`
 *
 * Active state matches when the current view equals the item id and no
 * group is selected. The "Мой отдел" item is conditional: it only renders
 * if the user belongs to a department, and it carries an inbox badge with
 * the count of unassigned department tasks.
 */
interface NavItem {
  id: string;
  icon: LucideIcon;
  label: string;
  href?: string;
  badge?: number;
}

interface MainNavProps {
  activeView: string;
  activeGroupId: string | null;
  onViewChange: (view: string) => void;
  onGroupChange: (id: string | null) => void;
  onClearTags: () => void;
}

export default function MainNav({ activeView, activeGroupId, onViewChange, onGroupChange, onClearTags }: MainNavProps) {
  const { isConsultant } = useAuth();
  const { data: myDeptId } = useMyDepartmentId();
  const { data: deptTasks = [] } = useDepartmentTasks(myDeptId);
  const deptInboxCount = useMemo(
    () => (deptTasks as { is_completed?: boolean; assigned_to?: string | null }[])
      .filter((t) => !t.is_completed && !t.assigned_to).length,
    [deptTasks],
  );

  const items: NavItem[] = useMemo(() => [
    { id: "all", icon: List, label: "Все задачи" },
    { id: "inbox", icon: Inbox, label: "Входящие" },
    { id: "myday", icon: Star, label: "Мой день" },
    { id: "assigned", icon: Users, label: "Делегированные" },
    ...(myDeptId
      ? [{ id: "my-department", icon: Building2, label: "Моя команда", href: "/my-department", badge: deptInboxCount }]
      : []),
    { id: "deferred", icon: Clock, label: "Отложенные" },
    { id: "community", icon: Globe, label: "Сообщество" },
    { id: "calendar", icon: CalendarDays, label: "Календарь" },
    { id: "kanban", icon: LayoutGrid, label: "Канбан", href: "/kanban" },
    { id: "dashboard", icon: BarChart3, label: "Дашборд" },
    { id: "wiki", icon: BookOpen, label: "База знаний" },
    { id: "protocols", icon: FileText, label: "Протоколы", href: "/protocols" },
    { id: "archive", icon: Archive, label: "Архив" },
  ], [myDeptId, deptInboxCount]);

  // Для консультанта оставляем только базовые личные виды.
  const visibleItems = useMemo(() => {
    if (!isConsultant) return items;
    return items.filter((i) => CONSULTANT_VISIBLE_NAV_IDS.has(i.id));
  }, [items, isConsultant]);

  return (
    <>
      {visibleItems.map((item) => {
        const isActive = activeView === item.id && !activeGroupId;
        const buttonClass = cn(
          "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
          isActive
            ? "bg-sidebar-active/10 text-sidebar-active border-l-2 border-sidebar-active pl-2.5"
            : "text-sidebar-fg/70 hover:bg-sidebar-hover hover:text-sidebar-fg",
        );

        if (item.href) {
          return (
            <Link key={item.id} to={item.href} className={buttonClass}>
              <item.icon className="h-4 w-4" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 tabular-nums dark:text-amber-300">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => { onViewChange(item.id); onGroupChange(null); onClearTags(); }}
            className={buttonClass}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </>
  );
}
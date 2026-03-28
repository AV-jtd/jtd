import { memo, useEffect, useState } from "react";
import { Clock, LayoutList, Layers, Search, Star, User, X, CalendarDays, FolderOpen, ShieldCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { cn } from "@/lib/utils";
import type { Profile, TaskGroup } from "@/hooks/useTasks";

export type GroupByOption = "none" | "project" | "deadline" | "assignee";

interface TaskFiltersBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  priorityFilter: number | "important" | "overdue" | "pending_approval" | null;
  onPriorityFilterChange: React.Dispatch<React.SetStateAction<number | "important" | "overdue" | "pending_approval" | null>>;
  assigneeFilter: string | null;
  onAssigneeFilterChange: React.Dispatch<React.SetStateAction<string | null>>;
  projectFilter: string | null;
  onProjectFilterChange: React.Dispatch<React.SetStateAction<string | null>>;
  availableUsers: Profile[];
  groups: TaskGroup[];
  currentUserId?: string;
  activeView: string;
  groupBy: GroupByOption;
  onGroupByChange: (value: GroupByOption) => void;
}

const groupByOptions: { key: GroupByOption; label: string; icon: React.ElementType }[] = [
  { key: "none", label: "Без группировки", icon: Layers },
  { key: "project", label: "По проекту", icon: FolderOpen },
  { key: "deadline", label: "По дедлайну", icon: CalendarDays },
  { key: "assignee", label: "По ответственному", icon: User },
];

function TaskFiltersBar({
  searchValue,
  onSearchChange,
  priorityFilter,
  onPriorityFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  projectFilter,
  onProjectFilterChange,
  availableUsers,
  groups,
  currentUserId,
  activeView,
  groupBy,
  onGroupByChange,
}: TaskFiltersBarProps) {
  const [draftSearch, setDraftSearch] = useState(searchValue);

  useEffect(() => {
    setDraftSearch(searchValue);
  }, [searchValue]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (draftSearch !== searchValue) {
        onSearchChange(draftSearch);
      }
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [draftSearch, onSearchChange, searchValue]);

  const hasActiveFilters = priorityFilter !== null || assigneeFilter !== null || projectFilter !== null;
  const activeGroupByOption = groupByOptions.find(o => o.key === groupBy) || groupByOptions[0];

  return (
    <div className="flex items-center gap-1.5 mb-4 flex-wrap md:flex-wrap overflow-x-auto scrollbar-none pb-1 md:pb-0 -mx-1 px-1 md:mx-0 md:px-0">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <input
          value={draftSearch}
          onChange={(e) => setDraftSearch(e.target.value)}
          placeholder="Поиск..."
          className="h-7 w-32 focus:w-44 transition-all pl-7 pr-6 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {draftSearch && (
          <button
            onClick={() => {
              setDraftSearch("");
              onSearchChange("");
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {[
        { value: "overdue" as const, label: "Просроченные", color: "text-red-500 border-red-500/40 bg-red-500/10", icon: "clock" },
        { value: "important" as const, label: "", color: "text-amber-500 border-amber-500/40 bg-amber-500/10", icon: "star" },
        { value: "pending_approval" as const, label: "На утверждении", color: "text-primary border-primary/40 bg-primary/10", icon: "shield" },
      ].map((priority) => (
        <button
          key={String(priority.value)}
          title={priority.label || "Важные"}
          onClick={() => onPriorityFilterChange((prev) => (prev === priority.value ? null : priority.value))}
          className={cn(
            "text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1 shrink-0",
            priorityFilter === priority.value
              ? priority.color
              : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
          )}
        >
          {priority.icon === "star" ? <Star className="h-3 w-3" /> : priority.icon === "shield" ? <ShieldCheck className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          <span className="hidden sm:inline">{priority.label}</span>
        </button>
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1 shrink-0",
              assigneeFilter !== null
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
            )}
          >
            <User className="h-3 w-3" />
            <span className="hidden sm:inline">
            {assigneeFilter === null
              ? "Ответственный"
              : assigneeFilter === "me"
                ? "Мои"
                : assigneeFilter === "unassigned"
                  ? "Без ответственного"
                  : availableUsers.find((user) => user.id === assigneeFilter)?.display_name || "Пользователь"}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-2 bg-popover border-border z-50" side="bottom" align="start">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1">Ответственный</p>
          <button
            onClick={() => onAssigneeFilterChange((prev) => (prev === "me" ? null : "me"))}
            className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors", assigneeFilter === "me" && "bg-primary/10 text-primary")}
          >
            Назначены мне
          </button>
          <button
            onClick={() => onAssigneeFilterChange((prev) => (prev === "unassigned" ? null : "unassigned"))}
            className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors", assigneeFilter === "unassigned" && "bg-primary/10 text-primary")}
          >
            Без ответственного
          </button>
          <PopoverSearchList
            items={availableUsers.filter((user) => user.id !== currentUserId)}
            searchKey={(user) => user.display_name || user.email || ""}
            placeholder="Найти..."
            renderItem={(user) => (
              <button
                key={user.id}
                onClick={() => onAssigneeFilterChange((prev) => (prev === user.id ? null : user.id))}
                className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors truncate", assigneeFilter === user.id && "bg-primary/10 text-primary")}
              >
                {user.display_name || user.email || "—"}
              </button>
            )}
          />
        </PopoverContent>
      </Popover>

      {activeView !== "group" && groupBy !== "project" && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={cn(
                "text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1 shrink-0",
                projectFilter !== null
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
              )}
            >
              <Layers className="h-3 w-3" />
              <span className="hidden sm:inline">
              {projectFilter === null
                ? "Проект"
                : projectFilter === "none"
                  ? "Без проекта"
                  : groups.find((group) => group.id === projectFilter)?.name || "Проект"}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2 bg-popover border-border z-50" side="bottom" align="start">
            <p className="text-xs font-medium text-muted-foreground px-2 py-1">Проект</p>
            <button
              onClick={() => onProjectFilterChange((prev) => (prev === "none" ? null : "none"))}
              className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors text-muted-foreground", projectFilter === "none" && "bg-primary/10 text-primary")}
            >
              Без проекта
            </button>
            <PopoverSearchList
              items={groups}
              searchKey={(group) => group.name}
              placeholder="Найти проект..."
              renderItem={(group) => (
                <button
                  key={group.id}
                  onClick={() => onProjectFilterChange((prev) => (prev === group.id ? null : group.id))}
                  className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors truncate", projectFilter === group.id && "bg-primary/10 text-primary")}
                >
                  {group.name}
                </button>
              )}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Group by dropdown */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "text-xs px-2.5 py-1 rounded-lg border font-medium transition-all flex items-center gap-1 shrink-0",
              groupBy !== "none"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
            )}
          >
            <LayoutList className="h-3 w-3" />
            <span className="hidden sm:inline">{groupBy === "none" ? "Группировка" : activeGroupByOption.label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1.5 bg-popover border-border z-50" side="bottom" align="start">
          {groupByOptions.map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                onClick={() => onGroupByChange(opt.key)}
                className={cn(
                  "flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-sm transition-colors",
                  groupBy === opt.key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>

      {(hasActiveFilters || groupBy !== "none") && (
        <button
          onClick={() => {
            onPriorityFilterChange(null);
            onAssigneeFilterChange(null);
            onProjectFilterChange(null);
            onGroupByChange("none");
          }}
          className="text-xs px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <X className="h-3 w-3" /> Сбросить
        </button>
      )}
    </div>
  );
}

export default memo(TaskFiltersBar);

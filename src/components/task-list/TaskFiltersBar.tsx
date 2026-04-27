import { memo, useEffect, useState } from "react";
import { Clock, Filter, LayoutList, Layers, Search, Star, User, X, CalendarDays, CalendarX, FolderOpen, ShieldCheck, FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverSearchList } from "@/components/ui/popover-search";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Profile, TaskGroup } from "@/hooks/useTasks";

export type GroupByOption = "none" | "project" | "deadline" | "assignee";

interface TaskFiltersBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  priorityFilter: number | "important" | "overdue" | "pending_approval" | "no_dates" | null;
  onPriorityFilterChange: React.Dispatch<React.SetStateAction<number | "important" | "overdue" | "pending_approval" | "no_dates" | null>>;
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
  showProtocolTasks?: boolean;
  onToggleProtocolTasks?: () => void;
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
  showProtocolTasks,
  onToggleProtocolTasks,
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

  const hasSecondaryFilters = assigneeFilter !== null || projectFilter !== null || priorityFilter === "pending_approval" || priorityFilter === "no_dates";
  const hasActiveFilters = priorityFilter !== null || assigneeFilter !== null || projectFilter !== null;
  const activeGroupByOption = groupByOptions.find(o => o.key === groupBy) || groupByOptions[0];

  const activeSecondaryCount = [
    assigneeFilter !== null,
    projectFilter !== null,
    priorityFilter === "pending_approval",
    priorityFilter === "no_dates",
  ].filter(Boolean).length;

  return (
    <div className="flex items-center gap-1 mb-4 -mx-1 px-1 md:mx-0 md:px-0 overflow-x-auto scrollbar-none shrink-0">
      {/* Search */}
      <div className="relative flex-1 min-w-0 max-w-[200px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={draftSearch}
          onChange={(e) => setDraftSearch(e.target.value)}
          placeholder="Поиск..."
          className="h-8 w-full pl-8 pr-7 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-all"
        />
        {draftSearch && (
          <button
            onClick={() => { setDraftSearch(""); onSearchChange(""); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      

      {/* Quick icon buttons: overdue, important, pending */}
      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onPriorityFilterChange((prev) => (prev === "overdue" ? null : "overdue"))}
              className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center transition-all",
                priorityFilter === "overdue"
                  ? "bg-red-500/10 text-red-500"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Clock className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Просроченные</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onPriorityFilterChange((prev) => (prev === "important" ? null : "important"))}
              className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center transition-all",
                priorityFilter === "important"
                  ? "bg-amber-500/10 text-amber-500"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Star className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Важные</TooltipContent>
        </Tooltip>

        {onToggleProtocolTasks && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleProtocolTasks}
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center transition-all",
                  showProtocolTasks
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <FileText className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Из протоколов</TooltipContent>
          </Tooltip>
        )}

        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center transition-all",
                    groupBy !== "none"
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <LayoutList className="h-4 w-4" />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {groupBy === "none" ? "Группировка" : activeGroupByOption.label}
            </TooltipContent>
          </Tooltip>
          <PopoverContent className="w-48 p-1.5 bg-popover border-border z-50" side="bottom" align="start">
            {groupByOptions.map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  onClick={() => onGroupByChange(groupBy === opt.key && opt.key !== "none" ? "none" : opt.key)}
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
      </div>

      {/* Filter popover with assignee, project, grouping */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "h-8 rounded-lg flex items-center justify-center transition-all relative",
              hasSecondaryFilters
                ? "bg-primary/10 text-primary px-2.5 gap-1"
                : "w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Filter className="h-4 w-4" />
            {activeSecondaryCount > 0 && (
              <span className="text-[10px] font-semibold">{activeSecondaryCount}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0 bg-popover border-border z-50" side="bottom" align="end">
          {/* Assignee section */}
          <div className="p-2 border-b border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Ответственный</p>
            <button
              onClick={() => onAssigneeFilterChange((prev) => (prev === "me" ? null : "me"))}
              className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors", assigneeFilter === "me" && "bg-primary/10 text-primary")}
            >
              <User className="h-3.5 w-3.5" /> Назначены мне
            </button>
            <button
              onClick={() => onAssigneeFilterChange((prev) => (prev === "unassigned" ? null : "unassigned"))}
              className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors", assigneeFilter === "unassigned" && "bg-primary/10 text-primary")}
            >
              <User className="h-3.5 w-3.5 opacity-40" /> Без ответственного
            </button>
            <PopoverSearchList
              items={availableUsers.filter((user) => user.id !== currentUserId)}
              searchKey={(user) => user.display_name || user.email || ""}
              placeholder="Найти..."
              renderItem={(user) => (
                <button
                  key={user.id}
                  onClick={() => onAssigneeFilterChange((prev) => (prev === user.id ? null : user.id))}
                  className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors truncate", assigneeFilter === user.id && "bg-primary/10 text-primary")}
                >
                  {user.display_name || user.email || "—"}
                </button>
              )}
            />
          </div>

          {/* Project section */}
          {activeView !== "group" && groupBy !== "project" && (
            <div className="p-2 border-b border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Проект</p>
              <button
                onClick={() => onProjectFilterChange((prev) => (prev === "none" ? null : "none"))}
                className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors text-muted-foreground", projectFilter === "none" && "bg-primary/10 text-primary !text-primary")}
              >
                <FolderOpen className="h-3.5 w-3.5" /> Без проекта
              </button>
              <PopoverSearchList
                items={groups}
                searchKey={(group) => group.name}
                placeholder="Найти проект..."
                renderItem={(group) => (
                  <button
                    key={group.id}
                    onClick={() => onProjectFilterChange((prev) => (prev === group.id ? null : group.id))}
                    className={cn("flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors truncate", projectFilter === group.id && "bg-primary/10 text-primary")}
                  >
                    {group.name}
                  </button>
                )}
              />
            </div>
          )}

          {/* Dates */}
          <div className="p-2 border-b border-border">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Даты</p>
            <button
              onClick={() => onPriorityFilterChange((prev) => (prev === "no_dates" ? null : "no_dates"))}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors",
                priorityFilter === "no_dates"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <CalendarX className="h-3.5 w-3.5" />
              Без дат
            </button>
          </div>

          {/* Pending approval */}
          <div className="p-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">Статус</p>
            <button
              onClick={() => onPriorityFilterChange((prev) => (prev === "pending_approval" ? null : "pending_approval"))}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors",
                priorityFilter === "pending_approval"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              На утверждении
            </button>
          </div>

          {/* Reset */}
          {(hasActiveFilters || groupBy !== "none") && (
            <div className="p-2 border-t border-border">
              <button
                onClick={() => {
                  onPriorityFilterChange(null);
                  onAssigneeFilterChange(null);
                  onProjectFilterChange(null);
                  onGroupByChange("none");
                }}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5" /> Сбросить все фильтры
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default memo(TaskFiltersBar);
